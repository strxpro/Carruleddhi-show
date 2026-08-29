/* Kod do edycji lub rezygnacji musi dotyczyć konkretnego zawodnika.
   Przy wspólnym e-mailu samo email + purpose nie wystarcza. */

alter table public.verification_codes
  add column if not exists entry_id uuid references public.registrations(id) on delete cascade;

create index if not exists verification_codes_entry_lookup_idx
  on public.verification_codes (email, purpose, entry_id, created_at desc)
  where consumed_at is null;

comment on column public.verification_codes.entry_id is
  'Zawodnik, którego dotyczy kod edit-entry/cancel-entry. NULL wyłącznie dla kodów niezwiązanych ze zgłoszeniem, np. unsubscribe.';