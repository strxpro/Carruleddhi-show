/* ===========================================================================
   0022 — voting, participants and private participant photos.

   The browser never receives database credentials. RLS is enabled without public
   policies; only the Worker service role reads and writes these objects.

   POWTARZALNA W CALOSCI
   ---------------------------------------------------------------------------
   Kazda instrukcja tego pliku wolno wykonac drugi raz. Pierwsza wersja tego nie miala i
   konczylo sie to bledem `relation "participants" already exists` — a Supabase wykonuje
   skrypt z edytora w jednej transakcji, wiec blad na pierwszej instrukcji wycofuje wszystko
   ponizej. Objaw jest przy tym mylacy: na ekranie widac blad o tabeli, ktora juz jest, i nie
   widac, ze widoki, indeksy i uprawnienia z dalszej czesci pliku wlasnie sie NIE zalozyly.

   `if not exists` na tabelach i indeksach, `drop ... if exists` przed triggerami i widokiem
   (Postgres nie zna dla nich `if not exists`), `on conflict do update` na wierszu ustawien i
   na buckecie. Uprawnienia i RLS sa i tak idempotentne.

   JESLI TRZEBA ZACZAC OD ZERA
   ---------------------------------------------------------------------------
   Ponizsze trzy linie USUWAJA wszystkie glosy i uczestnikow bezpowrotnie. Nie sa czescia
   migracji z rozmyslu — wykonaj je recznie tylko wtedy, gdy naprawde chcesz wyczyscic dane:

     drop table if exists public.votes cascade;
     drop table if exists public.participants cascade;
     drop table if exists public.voting_settings cascade;
   =========================================================================== */

create extension if not exists "pgcrypto";

create table if not exists public.participants (
  id              uuid primary key default gen_random_uuid(),
  registration_id uuid references public.registrations(id) on delete set null,
  category        text not null check (char_length(btrim(category)) between 1 and 40),
  start_number    integer not null unique check (start_number > 0),
  first_name      text not null check (char_length(btrim(first_name)) between 1 and 80),
  last_name       text not null check (char_length(btrim(last_name)) between 1 and 80),
  project_name    text check (project_name is null or char_length(btrim(project_name)) between 1 and 160),
  image_path      text,
  active          boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table if not exists public.voting_settings (
  id                 boolean primary key default true check (id),
  status             text not null default 'scheduled'
                       check (status in ('scheduled', 'voting', 'closed')),
  race_starts_at     timestamptz,
  voting_started_at  timestamptz,
  voting_ends_at     timestamptz,
  duration_minutes   integer not null default 30 check (duration_minutes between 1 and 1440),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  check (voting_ends_at is null or voting_started_at is null or voting_ends_at > voting_started_at)
);

insert into public.voting_settings (id) values (true) on conflict (id) do nothing;

create table if not exists public.votes (
  id           uuid primary key default gen_random_uuid(),
  participant_id uuid not null references public.participants(id) on delete cascade,
  category     text not null check (char_length(btrim(category)) between 1 and 40),
  voter_name   text not null check (char_length(btrim(voter_name)) between 1 and 120),
  voter_email  text not null check (
    voter_email = lower(btrim(voter_email)) and
    char_length(voter_email) between 3 and 254 and position('@' in voter_email) > 1
  ),
  device_id    text not null check (
    device_id = lower(btrim(device_id)) and char_length(device_id) between 32 and 36
  ),
  score        smallint not null check (score between 3 and 10),
  edit_token   text not null default encode(gen_random_bytes(32), 'hex') unique,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create unique index if not exists votes_email_category_key
  on public.votes (lower(voter_email), category);
create unique index if not exists votes_device_category_key
  on public.votes (device_id, category);
create index if not exists votes_ranking_idx
  on public.votes (category, participant_id, score desc);
create index if not exists votes_participant_created_idx
  on public.votes (participant_id, created_at desc);
create index if not exists participants_category_active_idx
  on public.participants (category, active, start_number);

create or replace function public.set_voting_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

/* Postgres nie zna `create trigger if not exists`, wiec zdejmowane i zakladane na nowo.
   Bezpieczne: trigger nie trzyma zadnego stanu. */
drop trigger if exists participants_updated_at on public.participants;
create trigger participants_updated_at
  before update on public.participants
  for each row execute function public.set_voting_updated_at();

drop trigger if exists voting_settings_updated_at on public.voting_settings;
create trigger voting_settings_updated_at
  before update on public.voting_settings
  for each row execute function public.set_voting_updated_at();

drop trigger if exists votes_updated_at on public.votes;
create trigger votes_updated_at
  before update on public.votes
  for each row execute function public.set_voting_updated_at();

/* `drop`, nie `create or replace`: `replace` odmawia, gdy zmieni sie lista kolumn widoku, a
   to jest dokladnie ta zmiana, ktora ktos kiedys tu wprowadzi. */
drop view if exists public.voting_ranking;
create view public.voting_ranking
with (security_invoker = true) as
select
  p.id as participant_id,
  p.category,
  p.start_number,
  p.first_name,
  p.last_name,
  p.project_name,
  p.image_path,
  count(v.id)::bigint as vote_count,
  round(avg(v.score)::numeric, 2) as average_score,
  coalesce(sum(v.score), 0)::bigint as total_score
from public.participants p
join public.votes v on v.participant_id = p.id and v.category = p.category
where p.active
group by p.id, p.category, p.start_number, p.first_name, p.last_name,
         p.project_name, p.image_path;

comment on table public.participants is 'Voting candidates managed by the Worker.';
comment on table public.voting_settings is 'Singleton voting schedule and status.';
comment on table public.votes is 'Private votes; category is a snapshot taken when voting.';
comment on column public.votes.edit_token is 'Secret capability used only to edit one vote.';
comment on view public.voting_ranking is 'Aggregate ranking without voter identity.';

alter table public.participants enable row level security;
alter table public.voting_settings enable row level security;
alter table public.votes enable row level security;

revoke all on public.participants from anon, authenticated;
revoke all on public.voting_settings from anon, authenticated;
revoke all on public.votes from anon, authenticated;
revoke all on public.voting_ranking from anon, authenticated;
revoke execute on function public.set_voting_updated_at() from public, anon, authenticated;

grant select, insert, update, delete on public.participants to service_role;
grant select, insert, update, delete on public.voting_settings to service_role;
grant select, insert, update, delete on public.votes to service_role;
grant select on public.voting_ranking to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'participant-photos',
  'participant-photos',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public = false,
      file_size_limit = 5242880,
      allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

-- Deliberately no policies on the tables or storage.objects: anon/authenticated
-- receive no access. The Worker uses the service role and never exposes that key.
