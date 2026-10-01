-- Apply this migration explicitly; legacy migration prefixes are duplicated.
-- No private registration/submission table is added to Realtime or granted to anon.
begin;

create table if not exists public.broadcast_state (
  id text primary key default 'main' check (id = 'main'),
  revision bigint not null default 0 check (revision >= 0),
  participant jsonb check (participant is null or jsonb_typeof(participant) = 'object'),
  participant_visible boolean not null default false,
  sponsors_enabled boolean not null default false,
  sponsors jsonb not null default '[]'::jsonb check (jsonb_typeof(sponsors) = 'array'),
  updated_at timestamptz not null default now()
);
insert into public.broadcast_state(id) values ('main') on conflict do nothing;

-- Prepared images are explicitly published by the organiser, never taken from
-- unapproved submissions. ON AIR may copy an existing voting photo on demand.
alter table public.participants add column if not exists broadcast_photo text;
create table if not exists public.broadcast_assets (
  source_path text primary key,
  public_url text not null check (public_url ~ '^https://[^/]+/storage/v1/object/public/broadcast-assets/[A-Za-z0-9._/-]+$')
);
alter table public.broadcast_assets enable row level security;
revoke all on public.broadcast_assets from public, anon, authenticated;
grant select on public.broadcast_assets to service_role;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('broadcast-assets', 'broadcast-assets', true, 5242880,
        array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = true, file_size_limit = 5242880,
  allowed_mime_types = array['image/jpeg','image/png','image/webp'];
-- Public bucket downloads do not require storage.objects SELECT. No upload policy.

create or replace function public.broadcast_sponsors_normalize(items jsonb, previous jsonb)
returns jsonb language plpgsql set search_path = '' as $$
declare item jsonb; old_item jsonb; output jsonb := '[]'; n integer := 0; sid text;
begin
  if jsonb_typeof(items) is distinct from 'array' or jsonb_array_length(items) > 30 then
    raise exception 'BROADCAST_BAD_SPONSORS';
  end if;
  for item in select value from jsonb_array_elements(items) loop
    select value into old_item from jsonb_array_elements(coalesce(previous, '[]'))
    where (item->>'id' is not null and value->>'id' = item->>'id')
       or (coalesce(item->>'logo','') <> '' and value->>'logo' = item->>'logo')
       or (value->>'name' = item->>'name' and value->>'url' = item->>'url') limit 1;
    sid := coalesce(nullif(item->>'id',''), old_item->>'id', gen_random_uuid()::text);
    if sid !~ '^[A-Za-z0-9_-]{1,80}$' or length(btrim(coalesce(item->>'name',''))) not between 1 and 80
       or coalesce(item->>'url','') !~ '^(https?://[^[:space:]]+)?$'
       or coalesce(item->>'logo','') !~ '^((sponsors/|/assets/)[A-Za-z0-9._/-]+)?$'
       or position('..' in coalesce(item->>'logo','')) > 0 then
      raise exception 'BROADCAST_BAD_SPONSOR';
    end if;
    if exists (select 1 from jsonb_array_elements(output) where value->>'id' = sid) then
      raise exception 'BROADCAST_DUPLICATE_SPONSOR';
    end if;
    output := output || jsonb_build_array(jsonb_build_object(
      'id', sid, 'name', btrim(item->>'name'), 'url', coalesce(item->>'url',''),
      'logo', coalesce(item->>'logo',''),
      'active', coalesce((item->>'active')::boolean, (old_item->>'active')::boolean, true),
      'order', n, 'tier', left(coalesce(nullif(item->>'tier',''), old_item->>'tier', 'partner'), 40)));
    n := n + 1;
  end loop;
  return output;
end $$;

create or replace function public.broadcast_settings_normalize()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.data := jsonb_set(new.data, '{sponsors}', public.broadcast_sponsors_normalize(
    coalesce(new.data->'sponsors','[]'), case when tg_op = 'UPDATE' then old.data->'sponsors' else '[]'::jsonb end));
  return new;
end $$;
drop trigger if exists broadcast_settings_normalize on public.site_settings;
create trigger broadcast_settings_normalize before insert or update on public.site_settings
for each row execute function public.broadcast_settings_normalize();

create or replace function public.broadcast_sponsor_value(item jsonb)
returns jsonb language sql immutable set search_path = '' as $$
  select jsonb_build_object('id',item->'id','name',item->'name','url',item->'url',
    'logo',item->'logo','active',item->'active','order',item->'order','tier',item->'tier')
$$;

create or replace function public.broadcast_participant(p_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id',p.id,'firstName',p.first_name,'lastName',p.last_name,
    'startNumber',r.race_number,'city',coalesce(r.town,''),'projectName',coalesce(p.project_name,''),
    'category',p.category,'photo',case when p.broadcast_photo ~ '^https://[^/]+/storage/v1/object/public/broadcast-assets/participants/[A-Za-z0-9._/-]+$'
      and position('..' in p.broadcast_photo)=0 then p.broadcast_photo else '' end)
  from public.participants p join public.registrations r on r.id = p.registration_id
  where p.id = p_id and p.active and r.status = 'confirmed'
    and r.race_number is not null and r.race_number = p.start_number
$$;

create or replace function public.broadcast_refresh()
returns public.broadcast_state language plpgsql security definer set search_path = '' as $$
declare s public.broadcast_state; person jsonb; logos jsonb;
begin
  select * into s from public.broadcast_state where id = 'main' for update;
  if s.participant is not null then
    person := public.broadcast_participant((s.participant->>'id')::uuid);
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',v->>'id','name',v->>'name','logo',case when v->>'logo' like '/assets/%'
      then v->>'logo' else coalesce(a.public_url,'') end,
    'url',v->>'url','active',(v->>'active')::boolean,'order',(v->>'order')::integer,'tier',v->>'tier')
    order by (v->>'order')::integer), '[]') into logos
  from public.site_settings st cross join lateral jsonb_array_elements(st.data->'sponsors') v
  left join public.broadcast_assets a on a.source_path = v->>'logo' where st.id;
  update public.broadcast_state set participant = person,
    participant_visible = s.participant_visible and person is not null,
    sponsors = logos, revision = revision + 1, updated_at = clock_timestamp()
  where id = 'main' returning * into s;
  return s;
end $$;

create or replace function public.broadcast_source_changed()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.broadcast_refresh();
  return null;
end $$;
drop trigger if exists broadcast_settings_changed on public.site_settings;
create trigger broadcast_settings_changed after insert or update or delete on public.site_settings
for each statement execute function public.broadcast_source_changed();
drop trigger if exists broadcast_participant_changed on public.participants;
create trigger broadcast_participant_changed after insert or update or delete on public.participants
for each statement execute function public.broadcast_source_changed();
drop trigger if exists broadcast_registration_changed on public.registrations;
create trigger broadcast_registration_changed after update or delete on public.registrations
for each statement execute function public.broadcast_source_changed();

create or replace function public.broadcast_admin_state()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('state',(select to_jsonb(s) from public.broadcast_state s where s.id='main'),
    'participants',coalesce((select jsonb_agg(person order by (person->>'startNumber')::integer)
      from (select public.broadcast_participant(p.id) person from public.participants p) eligible
      where person is not null),'[]'),
    'sponsors',coalesce((select data->'sponsors' from public.site_settings where id),'[]'))
$$;

-- Worker-only lookup for one eligible ON AIR target. The private source path is
-- never stored in broadcast_state or included in public/admin participant lists.
create or replace function public.broadcast_photo_source(p_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id',p.id,'photo',public.broadcast_participant(p.id)->>'photo',
    'imagePath',coalesce(p.image_path,''))
  from public.participants p where p.id=p_id and public.broadcast_participant(p.id) is not null
$$;

-- All control operations lock settings before the snapshot. Each action changes
-- only its own fields, so hide and sponsor edits cannot restore a stale rider.
create or replace function public.broadcast_command(p_action text, p_payload jsonb default '{}')
returns public.broadcast_state language plpgsql security definer set search_path = '' as $$
declare s public.broadcast_state; settings jsonb; items jsonb; item jsonb; person jsonb;
  sid text; ids jsonb; target uuid; wanted jsonb; path text; public_url text;
begin
  -- Registration edits already lock participants before their snapshot trigger.
  -- Match that ordering for photo updates to avoid an opposing row-lock cycle.
  if p_action in ('participant-photo','on-air') then
    perform 1 from public.participants where id=(p_payload->>'id')::uuid for update;
  end if;
  select data into settings from public.site_settings where id for update;
  select * into s from public.broadcast_state where id='main' for update;
  items := coalesce(settings->'sponsors','[]');
  if p_action = 'on-air' then
    target := (p_payload->>'id')::uuid;
    person := public.broadcast_participant(target);
    if person is null then raise exception 'BROADCAST_PARTICIPANT_INELIGIBLE'; end if;
    if coalesce(person->>'photo','') = '' then
      select coalesce(image_path,'') into path from public.participants where id=target;
      if path <> '' then
        if length(path)>240 or path !~ '^participants/[A-Za-z0-9._/-]+$' or position('..' in path)>0 then
          raise exception 'BROADCAST_BAD_PHOTO_PATH';
        end if;
        if path is distinct from p_payload->>'sourcePath' then raise exception 'BROADCAST_PHOTO_SOURCE_CONFLICT'; end if;
        public_url := coalesce(p_payload->>'preparedPhoto','');
        if public_url !~ '^https://[^/]+/storage/v1/object/public/broadcast-assets/participants/[A-Za-z0-9._/-]+$'
          or position('..' in public_url)>0 then raise exception 'BROADCAST_PHOTO_PREPARATION_REQUIRED'; end if;
        update public.participants set broadcast_photo=public_url where id=target;
        person := public.broadcast_participant(target);
      end if;
    end if;
    update public.broadcast_state set participant=person, participant_visible=true where id='main';
  elsif p_action = 'hide' then
    update public.broadcast_state set participant_visible=false where id='main';
  elsif p_action = 'clear' then
    update public.broadcast_state set participant=null, participant_visible=false where id='main';
  elsif p_action = 'sponsors-toggle' then
    if jsonb_typeof(p_payload->'enabled') is distinct from 'boolean' then raise exception 'BROADCAST_BAD_ENABLED'; end if;
    update public.broadcast_state set sponsors_enabled=(p_payload->>'enabled')::boolean where id='main';
  elsif p_action in ('sponsor-save','sponsor-append') then
    item := p_payload->'sponsor';
    if p_action = 'sponsor-save' then
      if item ? 'id' then
        select v into wanted from jsonb_array_elements(items) v where v->>'id'=item->>'id';
        if wanted is null or jsonb_typeof(p_payload->'expectedSponsor') is distinct from 'object'
          or public.broadcast_sponsor_value(wanted) is distinct from public.broadcast_sponsor_value(p_payload->'expectedSponsor') then
          raise exception 'BROADCAST_SPONSOR_CONFLICT';
        end if;
      elsif p_payload ? 'expectedSponsor' then
        raise exception 'BROADCAST_SPONSOR_CONFLICT';
      end if;
    end if;
    sid := coalesce(nullif(item->>'id',''),gen_random_uuid()::text);
    item := item || jsonb_build_object('id',sid);
    if p_action = 'sponsor-append' and exists (select 1 from jsonb_array_elements(items) v
      where (coalesce(item->>'logo','') <> '' and v->>'logo'=item->>'logo')
        or (v->>'name'=item->>'name' and v->>'url'=item->>'url')) then
      return s;
    end if;
    if exists (select 1 from jsonb_array_elements(items) v where v->>'id'=sid) then
      select jsonb_agg(case when v->>'id'=sid then v || item else v end order by n)
      into items from jsonb_array_elements(items) with ordinality as x(v,n);
    else items := items || jsonb_build_array(item); end if;
    update public.site_settings set data=jsonb_set(settings,'{sponsors}',items) where id;
  elsif p_action = 'sponsor-delete' then
    if coalesce(p_payload->>'id','') !~ '^[A-Za-z0-9_-]{1,80}$' then raise exception 'BROADCAST_BAD_ID'; end if;
    select coalesce(jsonb_agg(v order by n),'[]') into items
    from jsonb_array_elements(items) with ordinality x(v,n) where v->>'id' <> p_payload->>'id';
    update public.site_settings set data=jsonb_set(settings,'{sponsors}',items) where id;
  elsif p_action = 'sponsor-order' then
    ids := p_payload->'ids';
    if jsonb_typeof(ids) is distinct from 'array' then raise exception 'BROADCAST_BAD_ORDER'; end if;
    if jsonb_array_length(ids) <> jsonb_array_length(items)
      or (select count(distinct value) from jsonb_array_elements_text(ids)) <> jsonb_array_length(ids)
      or exists (select 1 from jsonb_array_elements_text(ids) i where not exists
        (select 1 from jsonb_array_elements(items) v where v->>'id'=i.value)) then
      raise exception 'BROADCAST_BAD_ORDER';
    end if;
    select coalesce(jsonb_agg(v order by n),'[]') into items from jsonb_array_elements_text(ids) with ordinality x(sid,n)
    join jsonb_array_elements(items) v on v->>'id'=x.sid;
    update public.site_settings set data=jsonb_set(settings,'{sponsors}',items) where id;
  elsif p_action = 'participant-photo' then
    target := (p_payload->>'id')::uuid;
    if public.broadcast_participant(target) is null then raise exception 'BROADCAST_PARTICIPANT_INELIGIBLE'; end if;
    public_url := coalesce(p_payload->>'photo','');
    if public_url !~ '^https://[^/]+/storage/v1/object/public/broadcast-assets/participants/[A-Za-z0-9._/-]+$'
      or position('..' in public_url)>0 then raise exception 'BROADCAST_BAD_PHOTO'; end if;
    update public.participants set broadcast_photo=public_url where id=target;
  elsif p_action = 'asset' then
    path := coalesce(p_payload->>'path',''); public_url := coalesce(p_payload->>'url','');
    if path !~ '^sponsors/[A-Za-z0-9._/-]+$' or position('..' in path)>0
      or public_url !~ '^https://[^/]+/storage/v1/object/public/broadcast-assets/sponsors/[A-Za-z0-9._/-]+$'
      or position('..' in public_url)>0 then raise exception 'BROADCAST_BAD_ASSET'; end if;
    insert into public.broadcast_assets(source_path, public_url) values (path, public_url)
      on conflict (source_path) do update set public_url=excluded.public_url;
  elsif p_action = 'settings-patch' then
    wanted := p_payload->'patch';
    if jsonb_typeof(wanted) is distinct from 'object' then raise exception 'BROADCAST_BAD_SETTINGS'; end if;
    if wanted ? 'sponsors' then
      if jsonb_typeof(p_payload->'expectedSponsors') is distinct from 'array' then
        raise exception 'BROADCAST_SETTINGS_CONFLICT';
      end if;
      if (select coalesce(jsonb_agg(public.broadcast_sponsor_value(v) order by n),'[]')
          from jsonb_array_elements(items) with ordinality x(v,n)) is distinct from
         (select coalesce(jsonb_agg(public.broadcast_sponsor_value(v) order by n),'[]')
          from jsonb_array_elements(p_payload->'expectedSponsors') with ordinality x(v,n)) then
        raise exception 'BROADCAST_SETTINGS_CONFLICT';
      end if;
    end if;
    settings := settings || wanted;
    if wanted ? 'galleryImages' or wanted ? 'galleryCaptions' then
      select coalesce(jsonb_agg(coalesce(settings->'galleryCaptions'->(n::integer-1),'""'::jsonb) order by n),'[]')
      into wanted from jsonb_array_elements(coalesce(settings->'galleryImages','[]')) with ordinality x(v,n);
      settings := jsonb_set(settings,'{galleryCaptions}',wanted);
    end if;
    update public.site_settings set data=settings where id;
  else raise exception 'BROADCAST_UNKNOWN_ACTION';
  end if;
  return public.broadcast_refresh();
end $$;

-- Normalize/backfill only approved site settings. Unapproved submissions stay private.
update public.site_settings set data=data where id;

alter table public.broadcast_state enable row level security;
alter table public.broadcast_state replica identity full;
revoke all on public.broadcast_state from public, anon, authenticated, service_role;
grant select on public.broadcast_state to anon, authenticated, service_role;
drop policy if exists broadcast_public_snapshot on public.broadcast_state;
create policy broadcast_public_snapshot on public.broadcast_state for select to anon, authenticated using (id='main');

revoke all on function public.broadcast_sponsors_normalize(jsonb,jsonb) from public,anon,authenticated;
revoke all on function public.broadcast_settings_normalize() from public,anon,authenticated;
revoke all on function public.broadcast_sponsor_value(jsonb) from public,anon,authenticated;
revoke all on function public.broadcast_participant(uuid) from public,anon,authenticated;
revoke all on function public.broadcast_refresh() from public,anon,authenticated;
revoke all on function public.broadcast_source_changed() from public,anon,authenticated;
revoke all on function public.broadcast_admin_state() from public,anon,authenticated;
revoke all on function public.broadcast_photo_source(uuid) from public,anon,authenticated;
revoke all on function public.broadcast_command(text,jsonb) from public,anon,authenticated;
grant execute on function public.broadcast_admin_state() to service_role;
grant execute on function public.broadcast_photo_source(uuid) to service_role;
grant execute on function public.broadcast_command(text,jsonb) to service_role;
-- Existing SECURITY DEFINER endpoint must not bypass the Worker's heart rate limit.
revoke all on function public.bump_stream_hearts(integer) from public,anon,authenticated;
grant execute on function public.bump_stream_hearts(integer) to service_role;

do $$ begin
  if not exists (select 1 from pg_publication where pubname='supabase_realtime') then
    create publication supabase_realtime;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime'
      and schemaname='public' and tablename='broadcast_state') then
    alter publication supabase_realtime add table public.broadcast_state;
  end if;
end $$;
commit;
