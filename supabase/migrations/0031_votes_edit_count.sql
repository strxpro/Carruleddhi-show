/* The one-correction limit, which 0030 declares and this database never got.
   ===========================================================================
   Measured on the live project (ezobcbvrmkxacaudozlh) before writing this file: every
   other object from 0030 is there — `notify_results`, `voter_locale`,
   `result_notified_at`, the `votes_email_category_key` index, the
   `rollover_voting_edition` function — and `votes.edit_count` is not, together with the
   constraint that follows it. Both the index and the function come AFTER it in 0030, so
   this is not a migration that stopped half way: the `edit_count` block was written into
   0030 after 0030 had already been applied, and a file that is already recorded as run
   is never run again.

   WHAT IT BROKE, AND IT WAS NOT COSMETIC
     worker/index.js reads and writes this column in five places — `select=…,edit_count`
     when it reads a voter's own vote (readVotingState and the change-my-vote path), and
     `edit_count: 1` when it saves a correction. PostgREST answers a select naming a
     column that does not exist with 400, so on this database the "change my vote" flow
     could not read the vote it was about to change. The rule the page promises — one
     vote per device, one correction — was not being kept by anything.

   Additive and idempotent, so re-running 0030 in a fresh environment stays correct: both
   statements there are `if not exists` / `drop … if exists` and will find this already
   done. Nothing here touches an existing row beyond giving it the default 0, which is
   what an un-corrected vote is. */

alter table public.votes add column if not exists edit_count integer not null default 0;
alter table public.votes drop constraint if exists votes_edit_once_check;
alter table public.votes add constraint votes_edit_once_check check (edit_count between 0 and 1);
