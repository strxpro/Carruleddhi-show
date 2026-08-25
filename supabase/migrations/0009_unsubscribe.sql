/* ============================================================================
   0009 — turning reminders off, with a code from the e-mail.

   WHY A CODE AT ALL
     A one-click unsubscribe link is the usual thing, and it is fine right up until the
     link is forwarded, or scanned by a mail client prefetching URLs, or pasted into a
     group chat. Then somebody else's reminders are off and nobody knows why. A code sent
     to the address being removed proves the person asking is reading that inbox.

   WHY THE LINK CARRIES A TOKEN AND NOT THE ADDRESS
     The obvious link is `?unsub=someone@example.com`. That puts an address in a URL, and
     a URL travels in browser history, in the Referer header to anything the page loads,
     and into the logs of every hop. The token is meaningless outside this table, and the
     address it resolves to is shown back masked.

   WHY THE CODE IS HASHED
     A plain six-digit code in a table is a code anybody with a moment of read access can
     use. Hashed with the same salt as the wall's IP hashes, so the row proves a guess is
     right without holding the answer.

   THE ATTEMPT COUNTER IS THE WHOLE RATE LIMIT
     Six digits is a million possibilities, which sounds like plenty and is not: a script
     can try a million things quickly. Five attempts, then the code is dead and a new one
     has to be asked for — which needs the inbox again.
   ========================================================================== */

create table if not exists public.verification_codes (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),

  /* What the code is for. One table rather than one per feature: the shape is identical
     and the list will grow (withdrawing from the race is the next one). */
  purpose     text not null check (purpose in ('unsubscribe', 'cancel-entry')),

  -- Lower-cased on the way in by the function, so a lookup never depends on how somebody
  -- typed their own address.
  email       text not null check (position('@' in email) > 1),
  code_hash   text not null,

  /* Fifteen minutes. Long enough to switch to a mail app, find the message and come back;
     short enough that a code left in an inbox is not a standing key. */
  expires_at  timestamptz not null default now() + interval '15 minutes',
  attempts    smallint not null default 0,
  consumed_at timestamptz
);

/* The only query this table serves: the newest live code for one address and purpose. */
create index if not exists verification_codes_lookup_idx
  on public.verification_codes (email, purpose, created_at desc)
  where consumed_at is null;

/* ---------------------------------------------------------------------------
   The newsletter list needs a token too.
   ---------------------------------------------------------------------------
   reminder_subscribers has had `unsubscribe_token` since 0002. The newsletter list never
   did, because nothing had ever linked to it. Both need one now: the footer link in each
   letter is the same mechanism, and a list you cannot leave from the letter itself is a
   list people report as spam instead.
   --------------------------------------------------------------------------- */
alter table public.newsletter_subscribers
  add column if not exists unsubscribe_token text;

update public.newsletter_subscribers
   set unsubscribe_token = encode(gen_random_bytes(16), 'hex')
 where unsubscribe_token is null;

alter table public.newsletter_subscribers
  alter column unsubscribe_token set default encode(gen_random_bytes(16), 'hex');

alter table public.newsletter_subscribers
  alter column unsubscribe_token set not null;

/* Unique, and indexed by the thing the link is looked up by. A token that matched two
   rows would be a link that unsubscribes a stranger. */
create unique index if not exists newsletter_unsub_token_key
  on public.newsletter_subscribers (unsubscribe_token);

create unique index if not exists reminder_unsub_token_key
  on public.reminder_subscribers (unsubscribe_token);

/* ---------------------------------------------------------------------------
   Housekeeping
   ---------------------------------------------------------------------------
   Codes are worthless the moment they expire, and a table of dead ones is a table
   somebody eventually has to explain. Called by the function on the way past rather than
   on a schedule of its own: it is one indexed delete and there is no need for a second
   moving part.
   --------------------------------------------------------------------------- */
create or replace function public.purge_expired_codes()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  removed integer;
begin
  delete from public.verification_codes
   where expires_at < now() - interval '1 day';
  get diagnostics removed = row_count;
  return removed;
end;
$$;

revoke all on function public.purge_expired_codes() from public, anon, authenticated;
grant execute on function public.purge_expired_codes() to service_role;

alter table public.verification_codes enable row level security;
revoke all on public.verification_codes from anon, authenticated;

comment on table public.verification_codes is
  'Short-lived codes e-mailed to prove somebody reads the inbox they are asking about. '
  'Hashed, five attempts, fifteen minutes. The service key in the Vercel function is the '
  'only way in.';
