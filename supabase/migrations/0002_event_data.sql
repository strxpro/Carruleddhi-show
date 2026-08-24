-- Carruleddhi Show 2026 — event data.
--
-- Run once, after 0001_wall_comments.sql:
--   Dashboard -> SQL Editor -> New query -> paste -> Run
-- or:  supabase db push
--
-- WHAT THIS IS FOR
--   The Google Sheet is where the organisers work: they read it, sort it, print
--   from it. It is a terrible thing to read from a web page — every visitor asking
--   "how many people are coming" would be a Sheets API call, and the API is rate
--   limited per minute, not per visitor.
--
--   So the sheet stays as the working copy and this is the read model: the numbers
--   and initials the site shows, served in one query.
--
-- DESIGN DECISIONS WORTH KNOWING
--
--   1. Row level security is ON with no policy for anon on any table holding
--      personal data. The browser never talks to these tables — the Cloudflare
--      Worker does, with the service role key. Only `public_counts` is safe to
--      expose, and it exposes counts and initials, nothing else.
--   2. Attendance is one row per visitor id, not a counter column. A counter has
--      to be read, incremented and written, and two people pressing at the same
--      second lose one of the presses. A unique index makes the double press
--      impossible instead of unlikely.
--   3. Initials only. Two letters cannot be traced back to a person, so the wall of
--      faces can be real without publishing anyone's name.
--   4. No raw IP addresses anywhere. Where rate limiting needs to recognise a
--      repeat caller, a salted hash does the job and carries no retention duty.

create extension if not exists "pgcrypto";

/* ===========================================================================
   Riders
   =========================================================================== */

create table if not exists public.registrations (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),

  race_number   integer,
  first_name    text not null check (char_length(btrim(first_name)) between 1 and 80),
  last_name     text not null check (char_length(btrim(last_name)) between 1 and 80),
  birth_date    date,
  postal_code   text check (postal_code is null or char_length(postal_code) <= 12),
  email         text not null check (position('@' in email) > 1),
  phone         text,
  address       text,

  cart_name     text,
  category      text check (category is null or category in ('classic', 'art')),
  team_name     text,
  cart_notes    text,

  locale        text not null default 'it' check (locale in ('it','pl','en','de','es','fr')),
  rules_consent   boolean not null default false,
  privacy_consent boolean not null default false,
  news_consent    boolean not null default false,

  -- new | confirmed | withdrawn. Withdrawn rows stop counting towards the total.
  status        text not null default 'new' check (status in ('new','confirmed','withdrawn')),
  email_status  text not null default 'pending',
  printed_at    timestamptz
);

comment on table public.registrations is
  'Race entries. The Google Sheet remains the working copy; this is what the site reads.';

-- One entry per address. A second attempt updates rather than duplicating, which is
-- what the Worker relies on to make a resubmitted form idempotent.
create unique index if not exists registrations_email_key
  on public.registrations (lower(email));

create index if not exists registrations_recent_idx
  on public.registrations (created_at desc)
  where status <> 'withdrawn';

/* Race numbers, assigned in the order entries arrive and never reused.
   A sequence rather than count()+1: two simultaneous inserts would both read the
   same count and both claim the same number. */
create sequence if not exists public.race_number_seq start with 1;

create or replace function public.assign_race_number()
returns trigger
language plpgsql
as $$
begin
  if new.race_number is null then
    new.race_number := nextval('public.race_number_seq');
  end if;
  return new;
end;
$$;

drop trigger if exists registrations_race_number on public.registrations;
create trigger registrations_race_number
  before insert on public.registrations
  for each row execute function public.assign_race_number();

/* ===========================================================================
   Attendance — the big red button
   =========================================================================== */

create table if not exists public.attendance (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  -- Generated in the browser and kept in localStorage. Not an account, not a
  -- fingerprint: just something stable enough to stop one person counting twice.
  visitor_id   text not null check (char_length(visitor_id) between 8 and 64),
  locale       text,
  ip_hash      text
);

comment on column public.attendance.visitor_id is
  'Opaque id from the visitor browser. One row per id; the unique index enforces it.';

create unique index if not exists attendance_visitor_key
  on public.attendance (visitor_id);

/* ===========================================================================
   Reminder list, contact messages, newsletter
   =========================================================================== */

create table if not exists public.reminder_subscribers (
  id                uuid primary key default gen_random_uuid(),
  created_at        timestamptz not null default now(),
  name              text not null,
  email             text not null check (position('@' in email) > 1),
  locale            text not null default 'it',
  consent_at        timestamptz not null default now(),
  -- Lets an unsubscribe link identify the row without exposing the primary key.
  unsubscribe_token text not null default encode(gen_random_bytes(16), 'hex'),
  last_reminder     text check (last_reminder is null or last_reminder in ('7d','1d','3h')),
  status            text not null default 'active' check (status in ('active','unsubscribed'))
);

create unique index if not exists reminder_email_key
  on public.reminder_subscribers (lower(email));

create table if not exists public.contact_messages (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name       text not null,
  email      text not null,
  message    text not null check (char_length(btrim(message)) between 2 and 4000),
  locale     text not null default 'it',
  status     text not null default 'new' check (status in ('new','answered','spam')),
  ip_hash    text
);

create table if not exists public.newsletter_subscribers (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name       text,
  email      text not null check (position('@' in email) > 1),
  locale     text not null default 'it',
  source     text not null default 'registration',
  status     text not null default 'active' check (status in ('active','unsubscribed'))
);

create unique index if not exists newsletter_email_key
  on public.newsletter_subscribers (lower(email));

/* ===========================================================================
   The one thing the site reads
   =========================================================================== */

/**
 * Counts plus the initials for the avatar row, in a single query.
 *
 * `security_invoker = false` is deliberate and is the whole point: the view runs
 * with its owner's rights, so it can read tables that the caller cannot. That is
 * how the site gets real numbers without anyone being able to select a name or an
 * address. The view returns no e-mail, no phone, no full name.
 *
 * Initials come from confirmed and new entries in arrival order. Two letters is not
 * identifying, which is what makes it publishable.
 */
create or replace view public.public_counts
with (security_invoker = false) as
select
  (select count(*) from public.attendance) as attendees,
  (select count(*) from public.registrations where status <> 'withdrawn') as pilots,
  (
    select coalesce(
      array_agg(initials order by created_at),
      array[]::text[]
    )
    from (
      select
        upper(left(btrim(first_name), 1) || left(btrim(last_name), 1)) as initials,
        created_at
      from public.registrations
      where status <> 'withdrawn'
      order by created_at
      limit 5
    ) as first_five
  ) as initials;

comment on view public.public_counts is
  'The only thing the public site reads: two totals and up to five sets of initials.';

/* ===========================================================================
   Lock everything down
   =========================================================================== */

alter table public.registrations         enable row level security;
alter table public.attendance            enable row level security;
alter table public.reminder_subscribers  enable row level security;
alter table public.contact_messages      enable row level security;
alter table public.newsletter_subscribers enable row level security;

-- No policies on purpose. With RLS on and no policy, anything that is not the
-- service role sees nothing and writes nothing.
revoke all on public.registrations         from anon, authenticated;
revoke all on public.attendance            from anon, authenticated;
revoke all on public.reminder_subscribers  from anon, authenticated;
revoke all on public.contact_messages      from anon, authenticated;
revoke all on public.newsletter_subscribers from anon, authenticated;

-- The counts view is the single exception, and it only ever returns aggregates.
grant select on public.public_counts to anon, authenticated;
