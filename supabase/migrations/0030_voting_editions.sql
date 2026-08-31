/* Annual voting editions: immutable public result snapshots plus one live edition. */
create table if not exists public.voting_editions (
  id uuid primary key default gen_random_uuid(),
  edition_key text not null unique,
  event_name text not null,
  event_date timestamptz not null,
  event_location text not null,
  status text not null default 'active' check (status in ('active', 'archived')),
  results jsonb not null default '[]'::jsonb check (jsonb_typeof(results) = 'array'),
  participant_count integer not null default 0,
  vote_count integer not null default 0,
  archived_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists voting_editions_one_active_idx
  on public.voting_editions (status) where status = 'active';

/* Private delivery queue. It deliberately lives outside the public JSON snapshot so a
   rollover can delete live votes without losing an explicit result-notification opt-in. */
create table if not exists public.voting_result_notifications (
  id uuid primary key default gen_random_uuid(),
  edition_id uuid not null references public.voting_editions(id) on delete cascade,
  vote_id uuid not null,
  voter_name text,
  voter_email text not null,
  voter_locale text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique (edition_id, vote_id)
);

create index if not exists voting_result_notifications_pending_idx
  on public.voting_result_notifications (created_at) where sent_at is null;

alter table public.votes alter column voter_name drop not null;
alter table public.votes alter column voter_email drop not null;
alter table public.votes drop constraint if exists votes_voter_name_check;
alter table public.votes drop constraint if exists votes_voter_email_check;
alter table public.votes drop constraint if exists votes_optional_voter_name_check;
alter table public.votes drop constraint if exists votes_optional_voter_email_check;
alter table public.votes add constraint votes_optional_voter_name_check check (
  voter_name is null or char_length(btrim(voter_name)) between 1 and 120
);
alter table public.votes add constraint votes_optional_voter_email_check check (
  voter_email is null or (
    voter_email = lower(btrim(voter_email)) and char_length(voter_email) between 3 and 254
    and position('@' in voter_email) > 1
  )
);
alter table public.votes add column if not exists notify_results boolean not null default false;
alter table public.votes add column if not exists voter_locale text;
alter table public.votes add column if not exists result_notified_at timestamptz;

/* One correction per vote. Counted in the database, not in the browser, because the device
   identifier lives in localStorage and is not a limit anybody has to respect. */
alter table public.votes add column if not exists edit_count integer not null default 0;
alter table public.votes drop constraint if exists votes_edit_once_check;
alter table public.votes add constraint votes_edit_once_check check (edit_count between 0 and 1);

/* NULL addresses are anonymous and are limited by the existing device index. */
drop index if exists public.votes_email_category_key;
create unique index if not exists votes_email_category_key
  on public.votes (lower(voter_email), category) where voter_email is not null;

/* Backfill the configured edition once, without touching participants or votes. */
do $$
declare
  configured jsonb := '{}'::jsonb;
  configured_date timestamptz;
  configured_year text;
begin
  if not exists (select 1 from public.voting_editions) then
    select coalesce(data, '{}'::jsonb) into configured
      from public.site_settings where id is true limit 1;
    configured := coalesce(configured, '{}'::jsonb);
    begin
      configured_date := coalesce(
        nullif(configured->>'eventDate', '')::timestamptz,
        '2026-10-17T14:30:00+02:00'
      );
    exception when others then
      configured_date := '2026-10-17T14:30:00+02:00';
    end;
    configured_year := to_char(configured_date at time zone 'Europe/Rome', 'YYYY');
    insert into public.voting_editions (edition_key, event_name, event_date, event_location)
    values (
      configured_year,
      coalesce(nullif(btrim(configured->>'eventName'), ''), 'Carruleddhi Show ' || configured_year),
      configured_date,
      coalesce(nullif(btrim(configured->>'eventLocation'), ''), 'Santa Teresa Gallura')
    );
  end if;
end;
$$;

create or replace function public.rollover_voting_edition(
  p_event_name text,
  p_event_date timestamptz,
  p_event_location text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_edition public.voting_editions%rowtype;
  new_edition public.voting_editions%rowtype;
  voting_state public.voting_settings%rowtype;
  archived_results jsonb := '[]'::jsonb;
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

  /* The year is the public archive key. Changing the date/name inside that same annual
     edition updates it in place instead of creating a duplicate or deleting live data. */
  if current_edition.id is not null and current_edition.edition_key = next_key then
    update public.voting_editions set
      event_name = btrim(p_event_name),
      event_date = p_event_date,
      event_location = btrim(p_event_location)
    where id = current_edition.id
    returning * into current_edition;

    if votes_total = 0 and coalesce(voting_state.status, 'scheduled') <> 'closed' then
      insert into public.voting_settings (
        id, status, race_starts_at, voting_started_at, voting_ends_at, duration_minutes
      ) values (
        true, 'scheduled', p_event_date, null,
        p_event_date + make_interval(mins => duration), duration
      ) on conflict (id) do update set
        status = 'scheduled', race_starts_at = excluded.race_starts_at,
        voting_started_at = null, voting_ends_at = excluded.voting_ends_at;
    end if;

    return jsonb_build_object(
      'rolledOver', false, 'alreadyApplied', true,
      'activeEditionId', current_edition.id,
      'activeEditionKey', current_edition.edition_key,
      'participantCount', participants_total, 'voteCount', votes_total
    );
  end if;

  if exists (select 1 from public.voting_editions where edition_key = next_key) then
    raise exception 'EDITION_ALREADY_EXISTS';
  end if;

  if current_edition.id is null and (participants_total > 0 or votes_total > 0) then
    raise exception 'ACTIVE_EDITION_MISSING';
  end if;

  /* Never freeze a partial live result. A naturally elapsed end time is equivalent to the
     explicit closed switch used by the admin. */
  if (participants_total > 0 or votes_total > 0)
     and not (
       voting_state.status = 'closed'
       or (voting_state.voting_ends_at is not null and voting_state.voting_ends_at <= now())
     ) then
    raise exception 'VOTING_EDITION_NOT_CLOSED';
  end if;

  /* Preserve private opt-ins transactionally before live votes are deleted. The hourly
     outbox reads this table and marks each accepted message independently. */
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

  /* Podzapytanie, nie CTE.
     `WITH ... SELECT ... INTO zmienna` w PL/pgSQL jest konstrukcją, o której poprawność da się
     spierać i której nie zweryfikuję bez uruchomionego Postgresa. Zwykłe podzapytanie w FROM
     robi dokładnie to samo i nie zostawia wątpliwości — a ta funkcja usuwa niżej wszystkie
     głosy, więc nie jest miejscem na konstrukcję „chyba działa". */
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', id, 'category', category, 'startNumber', start_number,
      'firstName', first_name, 'lastName', last_name,
      'projectName', coalesce(project_name, ''), 'imagePath', coalesce(image_path, ''),
      'voteCount', vote_count, 'averageScore', average_score,
      'totalScore', total_score, 'place', case when vote_count > 0 then place else null end
    ) order by place), '[]'::jsonb)
  into archived_results
  from (
    select
      p.id, p.category, p.start_number, p.first_name, p.last_name,
      p.project_name, p.image_path,
      count(v.id)::integer as vote_count,
      round(coalesce(avg(v.score), 0)::numeric, 2) as average_score,
      coalesce(sum(v.score), 0)::integer as total_score,
      row_number() over (
        order by coalesce(sum(v.score), 0) desc, count(v.id) desc,
                 coalesce(avg(v.score), 0) desc, p.start_number asc
      )::integer as place
    from public.participants p
    left join public.votes v
      on v.participant_id = p.id and v.category = 'public-choice'
    where p.active
    group by p.id, p.category, p.start_number, p.first_name, p.last_name,
             p.project_name, p.image_path
  ) as ranked;

  if current_edition.id is not null then
    update public.voting_editions set
      status = 'archived', results = archived_results,
      participant_count = participants_total, vote_count = votes_total,
      archived_at = now()
    where id = current_edition.id;
  end if;

  /* Snapshot and every safety check above are in this transaction, before either DELETE. */
  delete from public.votes;
  delete from public.participants;

  insert into public.voting_editions
    (edition_key, event_name, event_date, event_location, status)
  values
    (next_key, btrim(p_event_name), p_event_date, btrim(p_event_location), 'active')
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
    'archivedEditionId', current_edition.id,
    'archivedEditionKey', current_edition.edition_key,
    'activeEditionId', new_edition.id, 'activeEditionKey', new_edition.edition_key,
    'participantCount', participants_total, 'voteCount', votes_total
  );
end;
$$;

comment on table public.voting_editions is
  'Annual public-voting editions. Archived rows contain immutable aggregate result snapshots without voter identity.';
comment on table public.voting_result_notifications is
  'Private rollover queue for voters who explicitly opted into one result message.';
comment on function public.rollover_voting_edition(text, timestamptz, text) is
  'Idempotently archives a closed live edition and prepares a clean scheduled annual edition.';

alter table public.voting_editions enable row level security;
alter table public.voting_result_notifications enable row level security;
revoke all on public.voting_editions from anon, authenticated;
revoke all on public.voting_result_notifications from anon, authenticated;
revoke execute on function public.rollover_voting_edition(text, timestamptz, text)
  from public, anon, authenticated;
grant select, insert, update, delete on public.voting_editions to service_role;
grant select, insert, update, delete on public.voting_result_notifications to service_role;
grant execute on function public.rollover_voting_edition(text, timestamptz, text) to service_role;
