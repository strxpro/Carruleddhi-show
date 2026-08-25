/* ============================================================================
   0006 — settings the organiser can change without a deploy.

   WHAT THIS IS FOR
     Three things used to require editing a file and pushing it:
       - the sponsor logos, which arrive one at a time over weeks
       - the password gate on the whole site, which has to come off on the day
       - whether a section is shown at all, while its photos are still missing
     None of them is code. They are decisions somebody makes on a phone, and a
     decision that needs a git push is a decision that waits for whoever has the
     laptop.

   WHY ONE ROW OF JSONB AND NOT A COLUMN PER SETTING
     Because the list is not finished. Every new switch would otherwise be a
     migration, a deploy and a schema drift between what the panel sends and what
     the table accepts. The shape is validated in the function, which is where the
     panel and the site both already go through — so there is exactly one place
     that knows what a valid settings object looks like.

     The trade is real: Postgres cannot check any of this for you. That is why the
     function rejects an unknown key instead of storing it, and why `data` has a
     default that is a complete, working object rather than `{}` — a missing key
     must never be the difference between a working site and a blank one.

   SECURITY
     RLS on, and every privilege revoked from anon and authenticated. The service
     key in the Vercel function is the only way in, exactly like every other table
     here. A settings row that anon could write is a settings row that anon could
     use to take the password gate off.
   ========================================================================== */

create table if not exists public.site_settings (
  -- One row, forever. The check is what makes that true rather than hoped for:
  -- a second row would mean two answers to "is the site locked".
  id         boolean primary key default true check (id),
  data       jsonb   not null default jsonb_build_object(
               'siteLocked', true,
               'sponsors', '[]'::jsonb,
               'showGallery', true,
               'showWall', true,
               'showPrizes', true,
               'showCounters', true
             ),
  updated_at timestamptz not null default now()
);

insert into public.site_settings (id) values (true) on conflict (id) do nothing;

create or replace function public.site_settings_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists site_settings_touch on public.site_settings;
create trigger site_settings_touch
  before update on public.site_settings
  for each row execute function public.site_settings_touch();

alter table public.site_settings enable row level security;
revoke all on public.site_settings from anon, authenticated;

comment on table public.site_settings is
  'Settings the organiser changes from the admin panel: sponsors, the site-wide '
  'password gate, and which sections the public page shows. One row, jsonb, '
  'validated in the Vercel function.';
