/* ============================================================================
   0008 — the newsletter confirmation becomes an outbox row instead of a delay.

   WHAT BROKE
     Scenario 1 had a Tools > Sleep module in front of the newsletter e-mail: 90 seconds,
     so the courtesy note about next year would not land in the same second as the letter
     carrying the race number and the form to sign. Make imported the blueprint and drew
     that module as a grey circle reading "Module Not Found — builtin:BasicSleep", which
     stops the route.

     Rather than guess at another module identifier — the identifiers in this blueprint
     have already cost two rounds of that, the Email module being version 7 and not 4 —
     the delay moved somewhere that needs no module at all.

   HOW IT WORKS NOW
     Ticking the newsletter box writes the row, as before. `confirmation_sent_at` starts
     null, which means "still to send". The scheduled scenario already runs hourly and
     already asks the function for a list of finished letters; the function adds these to
     that list and stamps the column.

   WHY THIS IS BETTER AND NOT JUST DIFFERENT
     The point of the 90 seconds was separation, and an hour separates better than a
     minute and a half. It is a note about a race next year: nobody is waiting for it.
     Meanwhile scenario 1 loses two modules and its only unresolvable one, so the import
     is clean.

   THE COLUMN IS NULLABLE ON PURPOSE
     Not a boolean. A timestamp answers "has it gone" and "when", and the second question
     is the one that gets asked when somebody says they never received it.
   ========================================================================== */

alter table public.newsletter_subscribers
  add column if not exists confirmation_sent_at timestamptz;

/* Partial index: the query only ever asks for the rows that are still waiting, and on a
   list that mostly consists of already-sent rows a partial index stays small forever. */
create index if not exists newsletter_pending_idx
  on public.newsletter_subscribers (created_at)
  where confirmation_sent_at is null;

/* Anyone already on the list signed up before this existed and has had their letter from
   the old sleep-and-send route. Marking them keeps the first run of the new one from
   writing to everybody at once. */
update public.newsletter_subscribers
   set confirmation_sent_at = created_at
 where confirmation_sent_at is null;

comment on column public.newsletter_subscribers.confirmation_sent_at is
  'When the "you are on the list" note went out. Null means still queued; the hourly '
  'scenario picks those up. Replaced a Tools > Sleep module that Make could not resolve.';
