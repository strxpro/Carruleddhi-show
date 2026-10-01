-- Additive rollout after 0047. No voting score/ranking or public privileges change.
begin;

alter table public.participants add column if not exists race_time_ms integer;
alter table public.participants drop constraint if exists participants_race_time_ms_check;
alter table public.participants add constraint participants_race_time_ms_check
  check (race_time_ms is null or race_time_ms between 0 and 2147483647);
alter table public.broadcast_state add column if not exists participant_mode text not null default 'live';
alter table public.broadcast_state drop constraint if exists broadcast_state_participant_mode_check;
alter table public.broadcast_state add constraint broadcast_state_participant_mode_check
  check (participant_mode in ('live','replay'));

create or replace function public.broadcast_participant(p_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id',p.id,'firstName',p.first_name,'lastName',p.last_name,
    'startNumber',r.race_number,'city',coalesce(r.town,''),'projectName',coalesce(p.project_name,''),
    'raceTimeMs',p.race_time_ms,
    'category',p.category,'photo',case when p.broadcast_photo ~ '^https://[^/]+/storage/v1/object/public/broadcast-assets/participants/[A-Za-z0-9._/-]+$'
      and position('..' in p.broadcast_photo)=0 then p.broadcast_photo else '' end)
  from public.participants p join public.registrations r on r.id = p.registration_id
  where p.id = p_id and p.active and r.status = 'confirmed'
    and r.race_number is not null and r.race_number = p.start_number
$$;

-- Full 0047 command, retaining lock order, eligibility, image checks and sponsor CAS.
create or replace function public.broadcast_command(p_action text, p_payload jsonb default '{}')
returns public.broadcast_state language plpgsql security definer set search_path = '' as $$
declare s public.broadcast_state; settings jsonb; items jsonb; item jsonb; person jsonb;
  sid text; ids jsonb; target uuid; wanted jsonb; path text; public_url text; mode text;
begin
  if p_action in ('participant-photo','on-air') then
    perform 1 from public.participants where id=(p_payload->>'id')::uuid for update;
  end if;
  select data into settings from public.site_settings where id for update;
  select * into s from public.broadcast_state where id='main' for update;
  items := coalesce(settings->'sponsors','[]');
  if p_action = 'on-air' then
    mode := case when p_payload ? 'mode' then p_payload->>'mode' else 'live' end;
    if mode is null or mode not in ('live','replay') then raise exception 'BROADCAST_BAD_MODE'; end if;
    target := (p_payload->>'id')::uuid;
    person := public.broadcast_participant(target);
    if person is null then raise exception 'BROADCAST_PARTICIPANT_INELIGIBLE'; end if;
    if coalesce(person->>'photo','') = '' then
      select coalesce(image_path,'') into path from public.participants where id=target;
      if path <> '' then
        if length(path)>240 or path !~ '^participants/[A-Za-z0-9._/-]+$' or position('..' in path)>0 then
          raise exception 'BROADCAST_BAD_PHOTO_PATH';
        end if;
        if path is distinct from p_payload->>'sourcePath' then raise exception 'BROADCAST_PHOTO_SOURCE_CONFLICT'; end if;
        public_url := coalesce(p_payload->>'preparedPhoto','');
        if public_url !~ '^https://[^/]+/storage/v1/object/public/broadcast-assets/participants/[A-Za-z0-9._/-]+$'
          or position('..' in public_url)>0 then raise exception 'BROADCAST_PHOTO_PREPARATION_REQUIRED'; end if;
        update public.participants set broadcast_photo=public_url where id=target;
        person := public.broadcast_participant(target);
      end if;
    end if;
    update public.broadcast_state set participant=person, participant_visible=true, participant_mode=mode where id='main';
  elsif p_action = 'hide' then
    update public.broadcast_state set participant_visible=false where id='main';
  elsif p_action = 'clear' then
    update public.broadcast_state set participant=null, participant_visible=false, participant_mode='live' where id='main';
  elsif p_action = 'sponsors-toggle' then
    if jsonb_typeof(p_payload->'enabled') is distinct from 'boolean' then raise exception 'BROADCAST_BAD_ENABLED'; end if;
    update public.broadcast_state set sponsors_enabled=(p_payload->>'enabled')::boolean where id='main';
  elsif p_action in ('sponsor-save','sponsor-append') then
    item := p_payload->'sponsor';
    if p_action = 'sponsor-save' then
      if item ? 'id' then
        select v into wanted from jsonb_array_elements(items) v where v->>'id'=item->>'id';
        if wanted is null or jsonb_typeof(p_payload->'expectedSponsor') is distinct from 'object'
          or public.broadcast_sponsor_value(wanted) is distinct from public.broadcast_sponsor_value(p_payload->'expectedSponsor') then
          raise exception 'BROADCAST_SPONSOR_CONFLICT';
        end if;
      elsif p_payload ? 'expectedSponsor' then
        raise exception 'BROADCAST_SPONSOR_CONFLICT';
      end if;
    end if;
    sid := coalesce(nullif(item->>'id',''),gen_random_uuid()::text);
    item := item || jsonb_build_object('id',sid);
    if p_action = 'sponsor-append' and exists (select 1 from jsonb_array_elements(items) v
      where (coalesce(item->>'logo','') <> '' and v->>'logo'=item->>'logo')
        or (v->>'name'=item->>'name' and v->>'url'=item->>'url')) then
      return s;
    end if;
    if exists (select 1 from jsonb_array_elements(items) v where v->>'id'=sid) then
      select jsonb_agg(case when v->>'id'=sid then v || item else v end order by n)
      into items from jsonb_array_elements(items) with ordinality as x(v,n);
    else items := items || jsonb_build_array(item); end if;
    update public.site_settings set data=jsonb_set(settings,'{sponsors}',items) where id;
  elsif p_action = 'sponsor-delete' then
    if coalesce(p_payload->>'id','') !~ '^[A-Za-z0-9_-]{1,80}$' then raise exception 'BROADCAST_BAD_ID'; end if;
    select coalesce(jsonb_agg(v order by n),'[]') into items
    from jsonb_array_elements(items) with ordinality x(v,n) where v->>'id' <> p_payload->>'id';
    update public.site_settings set data=jsonb_set(settings,'{sponsors}',items) where id;
  elsif p_action = 'sponsor-order' then
    ids := p_payload->'ids';
    if jsonb_typeof(ids) is distinct from 'array' then raise exception 'BROADCAST_BAD_ORDER'; end if;
    if jsonb_array_length(ids) <> jsonb_array_length(items)
      or (select count(distinct value) from jsonb_array_elements_text(ids)) <> jsonb_array_length(ids)
      or exists (select 1 from jsonb_array_elements_text(ids) i where not exists
        (select 1 from jsonb_array_elements(items) v where v->>'id'=i.value)) then
      raise exception 'BROADCAST_BAD_ORDER';
    end if;
    select coalesce(jsonb_agg(v order by n),'[]') into items from jsonb_array_elements_text(ids) with ordinality x(sid,n)
    join jsonb_array_elements(items) v on v->>'id'=x.sid;
    update public.site_settings set data=jsonb_set(settings,'{sponsors}',items) where id;
  elsif p_action = 'participant-photo' then
    target := (p_payload->>'id')::uuid;
    if public.broadcast_participant(target) is null then raise exception 'BROADCAST_PARTICIPANT_INELIGIBLE'; end if;
    public_url := coalesce(p_payload->>'photo','');
    if public_url !~ '^https://[^/]+/storage/v1/object/public/broadcast-assets/participants/[A-Za-z0-9._/-]+$'
      or position('..' in public_url)>0 then raise exception 'BROADCAST_BAD_PHOTO'; end if;
    update public.participants set broadcast_photo=public_url where id=target;
  elsif p_action = 'asset' then
    path := coalesce(p_payload->>'path',''); public_url := coalesce(p_payload->>'url','');
    if path !~ '^sponsors/[A-Za-z0-9._/-]+$' or position('..' in path)>0
      or public_url !~ '^https://[^/]+/storage/v1/object/public/broadcast-assets/sponsors/[A-Za-z0-9._/-]+$'
      or position('..' in public_url)>0 then raise exception 'BROADCAST_BAD_ASSET'; end if;
    insert into public.broadcast_assets(source_path, public_url) values (path, public_url)
      on conflict (source_path) do update set public_url=excluded.public_url;
  elsif p_action = 'settings-patch' then
    wanted := p_payload->'patch';
    if jsonb_typeof(wanted) is distinct from 'object' then raise exception 'BROADCAST_BAD_SETTINGS'; end if;
    if wanted ? 'sponsors' then
      if jsonb_typeof(p_payload->'expectedSponsors') is distinct from 'array' then
        raise exception 'BROADCAST_SETTINGS_CONFLICT';
      end if;
      if (select coalesce(jsonb_agg(public.broadcast_sponsor_value(v) order by n),'[]')
          from jsonb_array_elements(items) with ordinality x(v,n)) is distinct from
         (select coalesce(jsonb_agg(public.broadcast_sponsor_value(v) order by n),'[]')
          from jsonb_array_elements(p_payload->'expectedSponsors') with ordinality x(v,n)) then
        raise exception 'BROADCAST_SETTINGS_CONFLICT';
      end if;
    end if;
    settings := settings || wanted;
    if wanted ? 'galleryImages' or wanted ? 'galleryCaptions' then
      select coalesce(jsonb_agg(coalesce(settings->'galleryCaptions'->(n::integer-1),'""'::jsonb) order by n),'[]')
      into wanted from jsonb_array_elements(coalesce(settings->'galleryImages','[]')) with ordinality x(v,n);
      settings := jsonb_set(settings,'{galleryCaptions}',wanted);
    end if;
    update public.site_settings set data=settings where id;
  else raise exception 'BROADCAST_UNKNOWN_ACTION';
  end if;
  return public.broadcast_refresh();
end $$;

-- Full 0034 rollover with duration added only to the result snapshot.
create or replace function public.rollover_voting_edition(
  p_event_name text, p_event_date timestamptz, p_event_location text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  current_edition public.voting_editions%rowtype;
  new_edition public.voting_editions%rowtype;
  voting_state public.voting_settings%rowtype;
  archived_results jsonb := '[]'::jsonb;
  archived_prizes jsonb := '[]'::jsonb;
  participants_total integer := 0;
  votes_total integer := 0;
  next_key text;
  duration integer := 30;
begin
  perform pg_advisory_xact_lock(hashtext('carruleddhi-voting-rollover'));
  if p_event_date is null or btrim(coalesce(p_event_name, '')) = ''
     or btrim(coalesce(p_event_location, '')) = '' then
    raise exception 'INVALID_EDITION';
  end if;
  select * into current_edition
    from public.voting_editions where status = 'active' for update;
  select * into voting_state
    from public.voting_settings where id is true for update;
  next_key := to_char(p_event_date at time zone 'Europe/Rome', 'YYYY');
  duration := coalesce(voting_state.duration_minutes, 30);
  select count(*)::integer into participants_total from public.participants where active;
  select count(*)::integer into votes_total from public.votes where category = 'public-choice';
  if current_edition.id is not null and current_edition.edition_key = next_key then
    update public.voting_editions set
      event_name = btrim(p_event_name), event_date = p_event_date,
      event_location = btrim(p_event_location)
    where id = current_edition.id returning * into current_edition;
    insert into public.voting_settings (
      id, status, race_starts_at, voting_started_at, voting_ends_at, duration_minutes
    ) values (
      true, 'scheduled', p_event_date, null,
      p_event_date + make_interval(mins => duration), duration
    ) on conflict (id) do update set
      status = 'scheduled', race_starts_at = excluded.race_starts_at,
      voting_started_at = null, voting_ends_at = excluded.voting_ends_at;
    return jsonb_build_object(
      'rolledOver', false, 'alreadyApplied', true,
      'activeEditionId', current_edition.id, 'activeEditionKey', current_edition.edition_key,
      'participantCount', participants_total, 'voteCount', votes_total,
      'scheduleReset', true, 'staleVotes', votes_total
    );
  end if;
  if exists (select 1 from public.voting_editions where edition_key = next_key) then
    raise exception 'EDITION_ALREADY_EXISTS';
  end if;
  if current_edition.id is null and (participants_total > 0 or votes_total > 0) then
    raise exception 'ACTIVE_EDITION_MISSING';
  end if;
  if (participants_total > 0 or votes_total > 0)
     and not (
       voting_state.status = 'closed'
       or (voting_state.voting_ends_at is not null and voting_state.voting_ends_at <= now())
     ) then
    raise exception 'VOTING_EDITION_NOT_CLOSED';
  end if;
  if current_edition.id is not null then
    insert into public.voting_result_notifications (
      edition_id, vote_id, voter_name, voter_email, voter_locale
    )
    select current_edition.id, id, voter_name, voter_email, voter_locale
      from public.votes
      where category = 'public-choice' and notify_results
        and voter_email is not null and result_notified_at is null
    on conflict (edition_id, vote_id) do nothing;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', id, 'category', category, 'startNumber', start_number,
      'firstName', first_name, 'lastName', last_name,
      'projectName', coalesce(project_name, ''), 'imagePath', coalesce(image_path, ''),
      'raceTimeMs', race_time_ms,
      'voteCount', vote_count, 'averageScore', average_score,
      'totalScore', total_score, 'place', case when vote_count > 0 then place else null end
    ) order by place), '[]'::jsonb)
  into archived_results
  from (
    select
      p.id, p.category, p.start_number, p.first_name, p.last_name,
      p.project_name, p.image_path, p.race_time_ms,
      count(v.id)::integer as vote_count,
      round(coalesce(avg(v.score), 0)::numeric, 2) as average_score,
      coalesce(sum(v.score), 0)::integer as total_score,
      row_number() over (
        order by coalesce(sum(v.score), 0) desc, count(v.id) desc,
                 coalesce(avg(v.score), 0) desc, p.start_number asc
      )::integer as place
    from public.participants p
    left join public.votes v on v.participant_id = p.id and v.category = 'public-choice'
    where p.active
    group by p.id, p.category, p.start_number, p.first_name, p.last_name,
             p.project_name, p.image_path, p.race_time_ms
  ) as ranked;
  if current_edition.id is not null then
    select coalesce(jsonb_agg(jsonb_build_object(
        'prizeKey', prize_key, 'startNumber', start_number,
        'projectName', project_name, 'riderName', rider_name, 'note', note
      ) order by prize_order), '[]'::jsonb)
    into archived_prizes
    from (
      select w.prize_key,
        coalesce(p.start_number, 0) as start_number,
        coalesce(p.project_name, '') as project_name,
        coalesce(
          nullif(btrim(coalesce(w.winner_label, '')), ''),
          nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''), ''
        ) as rider_name,
        coalesce(w.note, '') as note,
        coalesce(nullif(regexp_replace(w.prize_key, '[^0-9]', '', 'g'), ''), '0')::integer as prize_order
      from public.prize_winners w
      left join public.participants p on p.id = w.participant_id
      where w.edition_id = current_edition.id
    ) as decided;
  end if;
  if current_edition.id is not null then
    update public.voting_editions set
      status = 'archived', results = archived_results, prizes = archived_prizes,
      participant_count = participants_total, vote_count = votes_total, archived_at = now()
    where id = current_edition.id;
  end if;
  -- Both snapshots and notification opt-ins are durable before either deletion.
  delete from public.votes;
  delete from public.participants;
  insert into public.voting_editions
    (edition_key, event_name, event_date, event_location, status)
  values (next_key, btrim(p_event_name), p_event_date, btrim(p_event_location), 'active')
  returning * into new_edition;
  insert into public.voting_settings (
    id, status, race_starts_at, voting_started_at, voting_ends_at, duration_minutes
  ) values (
    true, 'scheduled', p_event_date, null,
    p_event_date + make_interval(mins => duration), duration
  ) on conflict (id) do update set
    status = 'scheduled', race_starts_at = excluded.race_starts_at,
    voting_started_at = null, voting_ends_at = excluded.voting_ends_at;
  return jsonb_build_object(
    'rolledOver', true, 'alreadyApplied', false,
    'archivedEditionId', current_edition.id, 'archivedEditionKey', current_edition.edition_key,
    'activeEditionId', new_edition.id, 'activeEditionKey', new_edition.edition_key,
    'participantCount', participants_total, 'voteCount', votes_total,
    'prizeCount', jsonb_array_length(archived_prizes), 'scheduleReset', true, 'staleVotes', 0
  );
end;
$$;

revoke all on function public.broadcast_participant(uuid) from public,anon,authenticated;
revoke all on function public.broadcast_command(text,jsonb) from public,anon,authenticated;
grant execute on function public.broadcast_command(text,jsonb) to service_role;
revoke execute on function public.rollover_voting_edition(text,timestamptz,text) from public,anon,authenticated;
grant execute on function public.rollover_voting_edition(text,timestamptz,text) to service_role;

-- Existing participant update trigger refreshes durations and publishes revision changes.
select public.broadcast_refresh();
notify pgrst, 'reload schema';
commit;
