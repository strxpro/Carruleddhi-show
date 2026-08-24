-- Carruleddhi Show 2026 — public wall.
--
-- Run once against your Supabase project:
--   Dashboard -> SQL Editor -> New query -> paste -> Run
-- or, with the CLI:  supabase db push
--
-- Design decisions worth knowing before you change anything here.
--
-- 1. Nothing is publicly readable until `approved` is true. A wall on an event
--    site is a spam magnet and an insult magnet; the cost of a moderation step is
--    one click in the admin panel, the cost of skipping it is your event's name
--    next to whatever someone typed.
-- 2. Row level security is ON with no policy for anon. The browser never talks to
--    this table — the Cloudflare Worker does, with the service role key. A key
--    that can insert can usually be persuaded to do more, so it does not belong
--    in a page anyone can view-source.
-- 3. `ip_hash` is a salted hash, never the address. It exists only to rate limit
--    and to remove a flood after the fact. Storing raw IPs would make this table
--    personal data with a retention obligation for no operational gain.

create extension if not exists "pgcrypto";

create table if not exists public.wall_comments (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),

  -- Shown on the site.
  display_name  text not null check (char_length(btrim(display_name)) between 1 and 40),
  place         text          check (place is null or char_length(place) <= 40),
  message       text not null check (char_length(btrim(message)) between 2 and 280),
  locale        text not null default 'it' check (locale in ('it','pl','en','de','es','fr')),

  -- Moderation.
  approved      boolean not null default false,
  approved_at   timestamptz,
  hidden_reason text,

  -- Operational only, never displayed.
  ip_hash       text,
  user_agent    text
);

comment on table public.wall_comments is
  'Public messages from the event site. Only approved rows are ever served.';
comment on column public.wall_comments.ip_hash is
  'Salted SHA-256 of the submitter IP. Used for rate limiting and flood cleanup.';

-- The list query is always "approved, newest first", so index exactly that.
create index if not exists wall_comments_public_idx
  on public.wall_comments (created_at desc)
  where approved;

-- Supports the per-address rate limit without scanning the table.
create index if not exists wall_comments_ip_recent_idx
  on public.wall_comments (ip_hash, created_at desc);

alter table public.wall_comments enable row level security;

-- Deliberately no policies for anon or authenticated. With RLS enabled and no
-- policy, every request that is not the service role sees nothing and can write
-- nothing. Reads and writes go through the Worker.
revoke all on public.wall_comments from anon, authenticated;

-- A narrow view for anything that later wants read-only access without the
-- moderation columns or the ip hash.
create or replace view public.wall_comments_public
with (security_invoker = true) as
  select id, created_at, display_name, place, message, locale
  from public.wall_comments
  where approved
  order by created_at desc;

comment on view public.wall_comments_public is
  'Approved messages only, without moderation or operational columns.';
