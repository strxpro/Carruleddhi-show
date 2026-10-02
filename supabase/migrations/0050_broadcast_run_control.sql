-- Apply after 0047-0049. One authoritative singleton; all timestamps are DB time.
begin;

alter table public.broadcast_state
  add column if not exists current_participant_id uuid,
  add column if not exists last_finished_participant_id uuid,
  add column if not exists last_finished_participant jsonb,
  add column if not exists run_status text not null default 'IDLE',
  add column if not exists started_at timestamptz,
  add column if not exists stopped_at timestamptz,
  add column if not exists elapsed_ms integer not null default 0,
  add column if not exists run_id uuid,
  add column if not exists last_finished_elapsed_ms integer;
-- Preserve an already-selected identity without inventing a running legacy timer.
update public.broadcast_state set current_participant_id=(participant->>'id')::uuid
where current_participant_id is null and run_status='IDLE' and participant is not null;
alter table public.broadcast_state drop constraint if exists broadcast_run_status_check;
alter table public.broadcast_state add constraint broadcast_run_status_check
  check (run_status in ('IDLE','RUNNING','FINISHED') and elapsed_ms >= 0
    and (last_finished_elapsed_ms is null or last_finished_elapsed_ms >= 0)
    and (last_finished_participant is null or jsonb_typeof(last_finished_participant)='object')
    and (run_status <> 'RUNNING' or (current_participant_id is not null and run_id is not null
      and started_at is not null and stopped_at is null)));

-- Keep the already-deployed sponsor/photo implementation, including its CAS checks.
-- The private delegate is not an alternate externally callable selection authority.
do $$ begin
  if to_regprocedure('public.broadcast_legacy_command_0048(text,jsonb)') is null then
    alter function public.broadcast_command(text,jsonb) rename to broadcast_legacy_command_0048;
  end if;
end $$;
revoke all on function public.broadcast_legacy_command_0048(text,jsonb) from public,anon,authenticated,service_role;

create or replace function public.broadcast_refresh()
returns public.broadcast_state language plpgsql security definer set search_path = '' as $$
declare s public.broadcast_state; person jsonb; logos jsonb;
begin
  select * into s from public.broadcast_state where id='main' for update;
  if s.participant is not null then
    person := public.broadcast_participant((s.participant->>'id')::uuid);
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',v->>'id','name',v->>'name','logo',case when v->>'logo' like '/assets/%'
      then v->>'logo' else coalesce(a.public_url,'') end,
    'url',v->>'url','active',(v->>'active')::boolean,'order',(v->>'order')::integer,'tier',v->>'tier')
    order by (v->>'order')::integer),'[]') into logos
  from public.site_settings st cross join lateral jsonb_array_elements(st.data->'sponsors') v
  left join public.broadcast_assets a on a.source_path=v->>'logo' where st.id;
  -- Never refresh last_finished_participant from mutable participant/registration data.
  update public.broadcast_state set participant=case when s.run_status='RUNNING'
      then coalesce(person,s.participant) else person end,
    participant_visible=s.participant_visible and person is not null,
    sponsors=logos,revision=revision+1,updated_at=clock_timestamp()
  where id='main' returning * into s;
  return s;
end $$;

create or replace function public.broadcast_command(p_action text,p_payload jsonb default '{}')
returns public.broadcast_state language plpgsql security definer set search_path = '' as $$
declare s public.broadcast_state; observed public.broadcast_state; target uuid; requested uuid;
  person jsonb; finished_at timestamptz; duration integer;
begin
  if p_action not in ('start','on-air','stop','show','show-participant','hide-participant',
      'hide','clear','show-sponsors','hide-sponsors') then
    return public.broadcast_legacy_command_0048(p_action,p_payload);
  end if;
  if p_action='on-air' and p_payload->>'mode'='replay' then
    select * into s from public.broadcast_state where id='main';
    return s;
  end if;
  if p_payload ? 'runId' then requested := (p_payload->>'runId')::uuid; end if;
  select * into observed from public.broadcast_state where id='main';
  if p_action in ('start','on-air') then
    target := coalesce(p_payload->>'participantId',p_payload->>'id')::uuid;
  elsif p_action='stop' then target := observed.current_participant_id;
  end if;
  -- Match participant/registration-trigger order: participant -> settings -> singleton.
  -- STOP discovers the participant without a lock, then rechecks the run under lock.
  -- This avoids singleton -> participant cycles with concurrent participant edits.
  if target is not null then
    perform 1 from public.participants where id=target for update;
  end if;
  perform 1 from public.site_settings where id for update;
  select * into s from public.broadcast_state where id='main' for update;
  if p_action in ('start','on-air') then
    if target is null then raise exception 'BROADCAST_BAD_ID'; end if;
    if requested is not null and requested=s.run_id then
      if target is distinct from s.current_participant_id then raise exception 'RUN_ID_MISMATCH'; end if;
      return s;
    end if;
    if s.run_status='RUNNING' then
      if s.current_participant_id=target then return s; end if;
      raise exception 'RUN_ALREADY_RUNNING';
    end if;
    -- Reuse exact identity/eligibility and prepared-photo validation, atomically.
    perform public.broadcast_legacy_command_0048('on-air',
      p_payload || jsonb_build_object('id',target,'mode','live'));
    update public.broadcast_state set current_participant_id=target,run_status='RUNNING',
      started_at=clock_timestamp(),stopped_at=null,elapsed_ms=0,run_id=coalesce(requested,gen_random_uuid()),
      participant_mode='live',revision=revision+1,updated_at=clock_timestamp()
    where id='main' returning * into s;
  elsif p_action='stop' then
    if requested is not null and requested is distinct from s.run_id then raise exception 'RUN_ID_MISMATCH'; end if;
    if s.run_status='FINISHED' then return s; end if;
    if s.run_status<>'RUNNING' then raise exception 'RUN_NOT_RUNNING'; end if;
    if observed.run_id is distinct from s.run_id or target is distinct from s.current_participant_id then
      raise exception 'RUN_STATE_CHANGED';
    end if;
    finished_at := clock_timestamp();
    if extract(epoch from (finished_at-s.started_at))*1000 > 2147483647 then
      raise exception 'RUN_DURATION_OUT_OF_RANGE';
    end if;
    duration := greatest(0,floor(extract(epoch from (finished_at-s.started_at))*1000))::integer;
    person := coalesce(public.broadcast_participant(target),s.participant);
    if person is null then raise exception 'RUN_PARTICIPANT_MISSING'; end if;
    person := person || jsonb_build_object('raceTimeMs',duration);
    update public.broadcast_state set run_status='FINISHED',stopped_at=finished_at,elapsed_ms=duration,
      last_finished_participant_id=target,last_finished_participant=person,last_finished_elapsed_ms=duration,
      revision=revision+1,updated_at=clock_timestamp()
    where id='main' returning * into s;
    update public.participants set race_time_ms=duration where id=target;
    if not found then raise exception 'RUN_PARTICIPANT_MISSING'; end if;
    select * into s from public.broadcast_state where id='main';
  elsif p_action in ('show','show-participant') then
    update public.broadcast_state set participant_visible=participant is not null where id='main';
    s := public.broadcast_refresh();
  elsif p_action in ('hide','hide-participant','clear') then
    -- Clear is visibility-only: it cannot discard an active run or the frozen replay.
    update public.broadcast_state set participant_visible=false where id='main';
    s := public.broadcast_refresh();
  else
    update public.broadcast_state set sponsors_enabled=(p_action='show-sponsors') where id='main';
    s := public.broadcast_refresh();
  end if;
  return s;
end $$;

-- Direct legacy timing edits/deletion cannot invalidate the active run. STOP already
-- holds the participant lock and marks FINISHED before saving within this transaction.
create or replace function public.broadcast_guard_active_participant()
returns trigger language plpgsql security definer set search_path = '' as $$
declare s public.broadcast_state;
begin
  if tg_op='UPDATE' and new.race_time_ms is not distinct from old.race_time_ms then return new; end if;
  -- Keep participant -> settings -> state order, including edits outside control RPCs.
  perform 1 from public.site_settings where id for update;
  select * into s from public.broadcast_state where id='main' for update;
  if s.run_status='RUNNING' and s.current_participant_id=old.id then
    raise exception 'RUN_ALREADY_RUNNING';
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;
drop trigger if exists broadcast_guard_active_participant on public.participants;
create trigger broadcast_guard_active_participant before update of race_time_ms or delete on public.participants
for each row execute function public.broadcast_guard_active_participant();

create or replace function public.broadcast_snapshot()
returns jsonb language sql volatile security definer set search_path = '' as $$
  select jsonb_build_object('state',to_jsonb(s),'serverNow',clock_timestamp())
  from public.broadcast_state s where s.id='main'
$$;

create or replace function public.broadcast_admin_state()
returns jsonb language sql volatile security definer set search_path = '' as $$
  select public.broadcast_snapshot() || jsonb_build_object(
    'participants',coalesce((select jsonb_agg(person order by (person->>'startNumber')::integer)
      from (select public.broadcast_participant(p.id) person from public.participants p) eligible
      where person is not null),'[]'),
    'sponsors',coalesce((select data->'sponsors' from public.site_settings where id),'[]'))
$$;

revoke all on function public.broadcast_command(text,jsonb) from public,anon,authenticated;
revoke all on function public.broadcast_snapshot() from public,anon,authenticated;
revoke all on function public.broadcast_refresh() from public,anon,authenticated;
revoke all on function public.broadcast_admin_state() from public,anon,authenticated;
revoke all on function public.broadcast_guard_active_participant() from public,anon,authenticated,service_role;
grant execute on function public.broadcast_command(text,jsonb) to service_role;
grant execute on function public.broadcast_snapshot() to service_role;
grant execute on function public.broadcast_admin_state() to service_role;
notify pgrst, 'reload schema';
commit;
