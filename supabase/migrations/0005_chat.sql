/* ===========================================================================
   0005 — live chat.
   ---------------------------------------------------------------------------
   Run after 0004. Safe to run twice.

   Two tables. A thread per visitor, messages inside it. No accounts: a visitor is
   identified by a random token their browser keeps, which is enough to bring them
   back to their own conversation and useless to anybody who steals it, because it
   grants nothing but that one thread.

   The organiser reads and answers from the admin panel, through the API, with the
   same passphrase as the participant list. Nothing here is readable by a browser
   holding only the anon key — RLS is on and there are no policies, exactly as in
   0001.
   =========================================================================== */

create table if not exists public.chat_threads (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz not null default now(),

  /* Bumped on every message either way. The admin list is ordered by it, so the
     conversation somebody is typing in right now is the one at the top. */
  last_message_at timestamptz not null default now(),

  /* Random, made in the browser, kept in localStorage. Not a session and not a
     credential for anything else: it identifies one conversation and nothing more,
     which is why a chat can exist without asking anyone to register. */
  visitor_token   text not null unique check (char_length(visitor_token) between 16 and 64),

  display_name    text check (display_name is null or char_length(btrim(display_name)) between 1 and 60),
  email           text,
  locale          text not null default 'it' check (locale in ('it','pl','en','de','es','fr')),

  /* ai      — answered from the knowledge base, no human needed
     human   — the visitor asked for a person, or the bot gave up. Highlighted in
               the panel and counted on the bell.
     closed  — dealt with. Reopens by itself if the visitor writes again. */
  mode            text not null default 'ai' check (mode in ('ai','human','closed')),

  /* Denormalised on purpose. The bell asks "how many threads need me" many times a
     minute, and counting unread messages across a join to answer that is work done
     over and over for a number that changes rarely. Maintained by the trigger below,
     so it cannot drift from the messages it counts. */
  unread_for_admin integer not null default 0,

  ip_hash         text
);

comment on table public.chat_threads is
  'One live-chat conversation. Visitors are identified by a browser-held token, not an account.';
comment on column public.chat_threads.mode is
  'ai = answered from the knowledge base, human = waiting for a person, closed = done.';

create index if not exists chat_threads_recent_idx on public.chat_threads (last_message_at desc);
create index if not exists chat_threads_waiting_idx on public.chat_threads (last_message_at desc)
  where mode = 'human';

create table if not exists public.chat_messages (
  id         uuid primary key default gen_random_uuid(),
  thread_id  uuid not null references public.chat_threads (id) on delete cascade,
  created_at timestamptz not null default now(),

  /* visitor | ai | organiser. Drives which side of the panel a bubble sits on, so a
     typo here would put the organiser's own words in the visitor's column. */
  author     text not null check (author in ('visitor','ai','organiser')),

  body       text not null check (char_length(btrim(body)) between 1 and 2000),

  /* Shown under the bubble as "Delivered". Set when the visitor's browser has
     actually fetched it, not when it was written. */
  delivered_at timestamptz
);

comment on table public.chat_messages is 'Messages inside one chat thread, oldest first.';

/* Every read is "this thread, in order", and every poll is "this thread, since a
   timestamp". One index serves both. */
create index if not exists chat_messages_thread_idx
  on public.chat_messages (thread_id, created_at);

/* -------------------------------------------------------------------------
   Keeping the thread in step with its messages.

   In a trigger rather than in the API because there are two writers — the visitor
   endpoint and the organiser endpoint — and a rule enforced in one place cannot be
   forgotten in the other. It also means a row inserted by hand in the table editor
   behaves the same as one from the site.
   ------------------------------------------------------------------------- */
create or replace function public.chat_touch_thread()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.chat_threads
     set last_message_at = new.created_at,
         -- Only a visitor's message is something the organiser has not seen. The
         -- bot's own replies are not news to anybody.
         unread_for_admin = case
           when new.author = 'visitor' then unread_for_admin + 1
           else unread_for_admin
         end,
         -- A closed conversation that gets a new message is open again. Anything
         -- else would leave somebody typing into a thread nobody is reading.
         mode = case
           when new.author = 'visitor' and mode = 'closed' then 'human'
           else mode
         end
   where id = new.thread_id;
  return new;
end $$;

drop trigger if exists chat_messages_touch on public.chat_messages;
create trigger chat_messages_touch
  after insert on public.chat_messages
  for each row execute function public.chat_touch_thread();

/* -------------------------------------------------------------------------
   Locked down, like everything else here.
   ------------------------------------------------------------------------- */
alter table public.chat_threads enable row level security;
alter table public.chat_messages enable row level security;
revoke all on public.chat_threads from anon, authenticated;
revoke all on public.chat_messages from anon, authenticated;

/* -------------------------------------------------------------------------
   The bell needs chat in its count too.
   ------------------------------------------------------------------------- */
insert into public.admin_state (key, seen_at)
  values ('inbox', now())
  on conflict (key) do nothing;

/* -------------------------------------------------------------------------
   Check: expect two tables and one trigger.
   ------------------------------------------------------------------------- */
-- select table_name from information_schema.tables
--   where table_schema = 'public' and table_name like 'chat%';
-- select tgname from pg_trigger where tgname = 'chat_messages_touch';
