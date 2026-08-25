-- Carruleddhi Show 2026 — photos and star ratings on the public wall.
--
-- Run after 0002_event_data.sql. Kept separate from 0001 so that migration can stay
-- exactly as it was already applied.
--
-- WHY A BUCKET AND NOT A COLUMN OF BASE64
--   A 3 MB phone photo becomes 4 MB of base64 inside a row, which is then read out
--   in full every time the wall is listed. Storage holds the file, the row holds a
--   path, and the list query stays small.
--
-- WHY THE BUCKET IS PRIVATE
--   An uploaded image is only shown after the message it belongs to is approved. A
--   public bucket would serve the file the moment it lands, so an unapproved photo
--   would be reachable by anyone who guessed the URL. The Worker issues a short
--   lived signed URL for approved rows only.

alter table public.wall_comments
  add column if not exists rating smallint
    check (rating is null or rating between 1 and 5);

alter table public.wall_comments
  add column if not exists photo_path text;

alter table public.wall_comments
  add column if not exists photo_width  integer;

alter table public.wall_comments
  add column if not exists photo_height integer;

comment on column public.wall_comments.rating is
  'Optional 1 to 5 stars. Null means the visitor left a message without a score.';
comment on column public.wall_comments.photo_path is
  'Object path inside the private wall-photos bucket. Never a full URL.';

-- Average score, computed only over approved rows that actually carry one.
create or replace view public.wall_rating
with (security_invoker = false) as
select
  count(*) filter (where rating is not null)              as votes,
  round(avg(rating) filter (where rating is not null), 2)  as average
from public.wall_comments
where approved;

comment on view public.wall_rating is 'Public average rating. No rows, only the aggregate.';

grant select on public.wall_rating to anon, authenticated;

/* ---------------------------------------------------------------------------
   Storage bucket
   --------------------------------------------------------------------------- */

-- `public = false`: see the note at the top. 5 MB is enough for a phone photo once
-- the browser has downscaled it, and small enough that a flood costs little.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'wall-photos',
  'wall-photos',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public = false,
      file_size_limit = 5242880,
      allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

-- No storage policies for anon either. Uploads arrive through the Worker, which
-- holds the service role key, so there is nothing for a browser to try.
-- Carruleddhi Show 2026 — photos and star ratings on the public wall.
--
-- Run after 0002_event_data.sql. Kept separate from 0001 so that migration can stay
-- exactly as it was already applied.
--
-- WHY A BUCKET AND NOT A COLUMN OF BASE64
--   A 3 MB phone photo becomes 4 MB of base64 inside a row, which is then read out
--   in full every time the wall is listed. Storage holds the file, the row holds a
--   path, and the list query stays small.
--
-- WHY THE BUCKET IS PRIVATE
--   An uploaded image is only shown after the message it belongs to is approved. A
--   public bucket would serve the file the moment it lands, so an unapproved photo
--   would be reachable by anyone who guessed the URL. The Worker issues a short
--   lived signed URL for approved rows only.

alter table public.wall_comments
  add column if not exists rating smallint
    check (rating is null or rating between 1 and 5);

alter table public.wall_comments
  add column if not exists photo_path text;

alter table public.wall_comments
  add column if not exists photo_width  integer;

alter table public.wall_comments
  add column if not exists photo_height integer;

comment on column public.wall_comments.rating is
  'Optional 1 to 5 stars. Null means the visitor left a message without a score.';
comment on column public.wall_comments.photo_path is
  'Object path inside the private wall-photos bucket. Never a full URL.';

-- Average score, computed only over approved rows that actually carry one.
create or replace view public.wall_rating
with (security_invoker = false) as
select
  count(*) filter (where rating is not null)              as votes,
  round(avg(rating) filter (where rating is not null), 2)  as average
from public.wall_comments
where approved;

comment on view public.wall_rating is 'Public average rating. No rows, only the aggregate.';

grant select on public.wall_rating to anon, authenticated;

/* ---------------------------------------------------------------------------
   Storage bucket
   --------------------------------------------------------------------------- */

-- `public = false`: see the note at the top. 5 MB is enough for a phone photo once
-- the browser has downscaled it, and small enough that a flood costs little.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'wall-photos',
  'wall-photos',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public = false,
      file_size_limit = 5242880,
      allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

-- No storage policies for anon either. Uploads arrive through the Worker, which
-- holds the service role key, so there is nothing for a browser to try.
