/* Tracks which annual edition each consenting newsletter subscriber has already received.
   The event itself remains in site_settings JSON; this column makes the hourly outbox
   idempotent and lets one click drain a large list over several cron runs. */
alter table public.newsletter_subscribers
  add column if not exists last_announcement_event text;

create index if not exists newsletter_announcement_pending_idx
  on public.newsletter_subscribers (created_at)
  where status = 'active';

comment on column public.newsletter_subscribers.last_announcement_event is
  'ISO event timestamp of the most recent new-edition announcement queued for this address.';