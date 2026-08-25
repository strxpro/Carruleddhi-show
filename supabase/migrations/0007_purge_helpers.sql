/* ============================================================================
   0007 — resetting the race numbers after a test wipe.

   WHY A FUNCTION AND NOT A DELETE
     The admin panel can already clear the tables: PostgREST does DELETE, and every one
     of these tables has a uuid primary key to filter on. A sequence is different — it is
     not a row, so there is nothing for the REST interface to address. Restarting it
     needs SQL, and SQL from the outside means a function.

   WHY IT MATTERS AT ALL
     `race_number_seq` keeps counting after the rows are gone. Wipe two weeks of test
     entries and the first real rider is number 038, which is a number nobody can explain
     to the person holding it. The sequence has to go back to the start with the rows.

   THE ORDER IS NOT OPTIONAL
     This restarts the counter without looking at the table, so it must only ever run
     when registrations is already empty. It is called from the purge handler immediately
     after the delete, and the check below makes the requirement enforceable rather than
     remembered: with rows still present it refuses, because handing out 001 again while
     001 exists means the unique index rejects a real entry on the day of the race.
   ========================================================================== */

create or replace function public.reset_race_numbers()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  remaining bigint;
begin
  select count(*) into remaining from public.registrations;

  if remaining > 0 then
    -- Refused, not silently skipped. A caller that thinks it reset the counter and did
    -- not is worse than an error, because the surprise arrives weeks later.
    return format('refused: %s registrations still present', remaining);
  end if;

  alter sequence public.race_number_seq restart with 1;
  return 'reset';
end;
$$;

/* The service role reaches this through PostgREST's /rpc/ path. anon and authenticated
   are revoked for the same reason as every table here: the only way in is the Vercel
   function, which is the only thing holding the service key. */
revoke all on function public.reset_race_numbers() from public, anon, authenticated;
grant execute on function public.reset_race_numbers() to service_role;

comment on function public.reset_race_numbers() is
  'Restarts race_number_seq at 1, but only when registrations is empty. Called by the '
  'admin panel after wiping test data so the first real rider is number 001.';
