/* ===========================================================================
   0004 — under-18 riders, automatic race numbers, and the admin bell.
   ---------------------------------------------------------------------------
   Run after 0003. Safe to run twice: every statement is guarded.

   WHY THIS EXISTS
     The Google Sheet was the store of record and this database sat empty. Moving the
     record here removes the cause of every data bug so far: a sheet is mapped by
     column *position*, so inserting a field in the middle silently shifts every
     value after it, and a missing field is a blank cell rather than an error.
     Columns here have names.

     Three things were missing before the database could take over.
   =========================================================================== */

/* ---------------------------------------------------------------------------
   1. Riders under 18.

   `is_minor` is stored even though it looks derivable from birth_date, because it is
   decided once, at submission, against the date of the event — not against today.
   A query run next March must still see the answer that applied when the entry was
   made; recomputing "under 18" from a moving now() would rewrite history.
   --------------------------------------------------------------------------- */

alter table public.registrations
  add column if not exists is_minor boolean not null default false;

alter table public.registrations
  add column if not exists rider_age smallint
    check (rider_age is null or rider_age between 0 and 120);

-- Grammatical gender for the e-mail: "your son" / "your daughter" / "your child".
-- Constrained, not free text: the wording is looked up by this value in six
-- languages, and a typo would print an empty gap in the middle of a sentence.
alter table public.registrations
  add column if not exists child_kind text
    check (child_kind is null or child_kind in ('son', 'daughter', 'child'));

alter table public.registrations
  add column if not exists guardian_relation text
    check (guardian_relation is null or guardian_relation in ('mother', 'father', 'guardian'));

alter table public.registrations
  add column if not exists guardian_name text
    check (guardian_name is null or char_length(btrim(guardian_name)) between 2 and 120);

alter table public.registrations
  add column if not exists guardian_email text;

alter table public.registrations
  add column if not exists guardian_phone text;

alter table public.registrations
  add column if not exists mother_name text;

alter table public.registrations
  add column if not exists father_name text;

alter table public.registrations
  add column if not exists guardian_consent boolean not null default false;

comment on column public.registrations.is_minor is
  'Under 18 on the day of the event, decided at submission. Not recomputed.';
comment on column public.registrations.guardian_consent is
  'The box the guardian ticked. The signed paper form is what counts at the start.';

/* A minor entry without somebody to sign for it is not a valid entry, and the place
   to refuse it is here rather than in three different clients. The API checks the
   same thing and returns a readable message; this is the backstop for a row inserted
   by any other route, including by hand in the table editor. */
alter table public.registrations
  drop constraint if exists registrations_guardian_required;

alter table public.registrations
  add constraint registrations_guardian_required check (
    not is_minor
    or (guardian_name is not null and guardian_email is not null and guardian_consent)
  );

/* ---------------------------------------------------------------------------
   2. Race numbers, from a sequence.

   They used to come from the spreadsheet row: =ARRAYFORMULA(ROW(C2:C)-1). That works
   until somebody sorts the sheet or deletes a row, at which point every number after
   the gap moves and a rider's number no longer matches the one in the e-mail they
   were sent. There is no undo for that.

   A sequence never reuses and never reorders. Numbers are not reissued after a
   withdrawal either, which is correct: number 041 was printed on a form and taped to
   a cart, and giving it to somebody else would put two of them on the hill.

   Starting at 1. Change START WITH below before the first entry if you want to open
   at another number — after that, use setval() rather than editing this file.
   --------------------------------------------------------------------------- */

create sequence if not exists public.race_number_seq as integer start with 1 owned by none;

alter table public.registrations
  alter column race_number set default nextval('public.race_number_seq');

-- Two riders must never share one, whatever inserts them.
create unique index if not exists registrations_race_number_key
  on public.registrations (race_number);

comment on sequence public.race_number_seq is
  'Race numbers. Never reused, never reordered. Display pads to three digits.';

/* Existing rows, if any arrived before this migration, get numbers now instead of
   staying null and colliding with the first new entry. */
do $$
declare
  r record;
begin
  for r in select id from public.registrations where race_number is null order by created_at loop
    update public.registrations
      set race_number = nextval('public.race_number_seq')
      where id = r.id;
  end loop;
end $$;

/* Keep the sequence ahead of anything already in the table, so a restore from a
   dump cannot hand out a number that is already on a printed form. */
select setval(
  'public.race_number_seq',
  greatest(coalesce((select max(race_number) from public.registrations), 0), 1),
  true
);

/* ---------------------------------------------------------------------------
   3. The admin bell.

   One row, holding when the panel was last looked at. The counts themselves are not
   stored: the API asks each table how many rows are newer than this timestamp, which
   is one indexed query per table and cannot drift out of step with reality the way a
   stored counter does.
   --------------------------------------------------------------------------- */

create table if not exists public.admin_state (
  key     text primary key,
  seen_at timestamptz not null default now()
);

insert into public.admin_state (key, seen_at)
  values ('inbox', now())
  on conflict (key) do nothing;

alter table public.admin_state enable row level security;
revoke all on public.admin_state from anon, authenticated;

comment on table public.admin_state is
  'When the admin panel was last read. Drives the unread count on the bell.';

/* The bell asks "anything newer than X?" of four tables on a timer, so each one
   needs that answer without a sequential scan. */
create index if not exists registrations_created_idx        on public.registrations (created_at desc);
create index if not exists contact_messages_created_idx     on public.contact_messages (created_at desc);
create index if not exists reminder_subscribers_created_idx on public.reminder_subscribers (created_at desc);
create index if not exists newsletter_subscribers_created_idx on public.newsletter_subscribers (created_at desc);

/* ---------------------------------------------------------------------------
   Check it worked. Expect 32 columns and race_number defaulting to the sequence.
   --------------------------------------------------------------------------- */
-- select count(*) from information_schema.columns
--   where table_schema = 'public' and table_name = 'registrations';
-- select column_default from information_schema.columns
--   where table_name = 'registrations' and column_name = 'race_number';
