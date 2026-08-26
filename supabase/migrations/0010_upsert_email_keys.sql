/* ============================================================================
   0010 — making the e-mail upserts actually work.

   THE ERROR THIS FIXES
     42P10: "there is no unique or exclusion constraint matching the ON CONFLICT
     specification", returned as a 502 STORE_FAILED on every reminder sign-up.

   WHY IT HAPPENED
     The function upserts on the e-mail address: PostgREST turns that into
     `ON CONFLICT (email) DO NOTHING`, so a second sign-up keeps the existing row instead
     of failing. Postgres will only accept ON CONFLICT on a column when there is a unique
     index on *that column*.

     What existed was `create unique index reminder_email_key on (lower(email))` — an
     index on an expression. It does a genuinely better job of the thing it was written
     for: it stops `Anna@x.com` and `anna@x.com` both getting on the list. But it is not a
     constraint on `email`, so ON CONFLICT (email) has nothing to match and the statement
     is rejected before it touches a row.

     Every reminder sign-up had been failing this way since the upsert was introduced. It
     showed up as a bare 502 because a database error and a broken webhook looked the same
     from outside.

   WHY BOTH INDEXES STAY
     The plain one is what ON CONFLICT needs. The lower() one is what stops two rows that
     differ only in capitals. The function lowercases on the way in, so in practice they
     agree — but "in practice" is doing a lot of work in that sentence, and the cost of
     keeping both is one small index per table.

   REGISTRATIONS ARE DELIBERATELY LEFT ALONE
     They are inserted, never upserted: a second entry on one address is a fact the person
     needs to hear (409 ALREADY_REGISTERED), not something to quietly swallow. The
     expression index there is exactly right and adding a plain one would only invite
     somebody to write an upsert against it.
   ========================================================================== */

/* Defensive, and it has to run first: a plain unique index cannot be created if two rows
   already differ only in capitals. The lower() index should have made that impossible, but
   these tables are also editable by hand in the Supabase table editor. Normalising costs
   nothing when there is nothing to normalise. */
update public.reminder_subscribers   set email = lower(email) where email <> lower(email);
update public.newsletter_subscribers set email = lower(email) where email <> lower(email);

/* A named constraint rather than a bare index, because ON CONFLICT reads constraints and
   this way the intent is visible in the schema instead of inferred from an index name.
   Wrapped in a DO block: `alter table ... add constraint` has no IF NOT EXISTS, and this
   migration has to survive being run twice like every other one here. */
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'reminder_subscribers_email_unique'
       and conrelid = 'public.reminder_subscribers'::regclass
  ) then
    alter table public.reminder_subscribers
      add constraint reminder_subscribers_email_unique unique (email);
  end if;

  if not exists (
    select 1 from pg_constraint
     where conname = 'newsletter_subscribers_email_unique'
       and conrelid = 'public.newsletter_subscribers'::regclass
  ) then
    alter table public.newsletter_subscribers
      add constraint newsletter_subscribers_email_unique unique (email);
  end if;
end $$;

comment on constraint reminder_subscribers_email_unique on public.reminder_subscribers is
  'What ON CONFLICT (email) matches. The separate index on lower(email) is what stops two '
  'rows differing only in capitals; this one is what lets a repeat sign-up keep its row '
  'instead of returning 42P10.';

comment on constraint newsletter_subscribers_email_unique on public.newsletter_subscribers is
  'Same reason as the reminder list: PostgREST upserts on `email`, and ON CONFLICT needs a '
  'constraint on the column rather than on lower(email).';
