-- Apply before deploying the worker. No REST fallback is safe for these transactions.
-- Code checks serialize attempts. Entry mutations recheck the code while holding the
-- registration and code locks, and consume it only in the same transaction as the write.
create or replace function public.verification_code_check(
  p_email text, p_purpose text, p_code_hash text, p_entry_id uuid
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  c public.verification_codes%rowtype;
begin
  select * into c from public.verification_codes
    where email = p_email and purpose = p_purpose
      and entry_id is not distinct from p_entry_id
    order by created_at desc, id desc limit 1 for update;
  if not found or c.consumed_at is not null then
    return jsonb_build_object('ok', false, 'code', 'ENTRY_NO_CODE', 'status', 410);
  end if;
  if c.expires_at <= clock_timestamp() then
    return jsonb_build_object('ok', false, 'code', 'ENTRY_CODE_EXPIRED', 'status', 410);
  end if;
  if c.attempts >= 5 then
    return jsonb_build_object('ok', false, 'code', 'ENTRY_TOO_MANY_TRIES', 'status', 429);
  end if;
  if c.code_hash is distinct from p_code_hash then
    update public.verification_codes set attempts = attempts + 1 where id = c.id;
    return jsonb_build_object('ok', false, 'code', 'ENTRY_CODE_WRONG', 'status', 422,
      'left', greatest(4 - c.attempts, 0));
  end if;
  return jsonb_build_object('ok', true, 'id', c.id);
end;
$$;

create or replace function public.entry_manage_with_code(
  p_email text, p_code_hash text, p_entry_id uuid, p_action text, p_patch jsonb default '{}'
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  r public.registrations%rowtype;
  checked jsonb;
  k text;
begin
  if p_action is null or p_action not in ('update', 'withdraw', 'print') then
    return jsonb_build_object('ok', false, 'code', 'ENTRY_UNKNOWN_ACTION', 'status', 400);
  end if;
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    return jsonb_build_object('ok', false, 'code', 'ENTRY_BAD_FIELD', 'status', 422);
  end if;
  -- Reject unknown keys, including legal identity, consent, email and status.
  for k in select jsonb_object_keys(p_patch) loop
    if k not in ('phone', 'address', 'town', 'cart_name', 'team_name', 'cart_notes',
      'category', 'wants_print', 'self_updated_at') then
      return jsonb_build_object('ok', false, 'code', 'ENTRY_BAD_FIELD', 'status', 422);
    end if;
    if k in ('phone', 'address', 'town', 'cart_name', 'team_name', 'cart_notes')
      and jsonb_typeof(p_patch -> k) not in ('string', 'null') then
      return jsonb_build_object('ok', false, 'code', 'ENTRY_BAD_FIELD', 'status', 422);
    end if;
  end loop;
  if (p_action = 'print' and not p_patch ? 'wants_print')
    or (p_patch ? 'wants_print' and jsonb_typeof(p_patch -> 'wants_print') <> 'boolean') then
    return jsonb_build_object('ok', false, 'code', 'ENTRY_BAD_PRINT', 'status', 422);
  end if;
  if p_patch ? 'category' and (p_patch ->> 'category' is null
    or p_patch ->> 'category' not in ('classic', 'art')) then
    return jsonb_build_object('ok', false, 'code', 'ENTRY_BAD_CATEGORY', 'status', 422);
  end if;
  if p_action = 'update' and (p_patch - 'self_updated_at') = '{}'::jsonb then
    return jsonb_build_object('ok', false, 'code', 'ENTRY_NOTHING_TO_DO', 'status', 422);
  end if;
  select * into r from public.registrations where id = p_entry_id and email = p_email for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'ENTRY_NOT_FOUND', 'status', 404);
  end if;
  if r.is_minor or r.status = 'withdrawn' then
    return jsonb_build_object('ok', false, 'code',
      case when r.is_minor then 'ENTRY_MINOR_ORGANISER' else 'ENTRY_WITHDRAWN' end, 'status', 409);
  end if;
  checked := public.verification_code_check(p_email,
    case when p_action = 'withdraw' then 'cancel-entry' else 'edit-entry' end,
    p_code_hash, p_entry_id);
  if not (checked ->> 'ok')::boolean then return checked; end if;

  if p_action = 'withdraw' then
    update public.registrations set status = 'withdrawn' where id = r.id;
    update public.reminder_subscribers set status = 'unsubscribed' where email = p_email;
  elsif p_action = 'print' then
    update public.registrations set wants_print = (p_patch ->> 'wants_print')::boolean where id = r.id;
  else
    update public.registrations set
      phone = case when p_patch ? 'phone' then p_patch ->> 'phone' else phone end,
      address = case when p_patch ? 'address' then p_patch ->> 'address' else address end,
      town = case when p_patch ? 'town' then p_patch ->> 'town' else town end,
      cart_name = case when p_patch ? 'cart_name' then p_patch ->> 'cart_name' else cart_name end,
      team_name = case when p_patch ? 'team_name' then p_patch ->> 'team_name' else team_name end,
      cart_notes = case when p_patch ? 'cart_notes' then p_patch ->> 'cart_notes' else cart_notes end,
      category = case when p_patch ? 'category' then p_patch ->> 'category' else category end,
      wants_print = case when p_patch ? 'wants_print' then (p_patch ->> 'wants_print')::boolean else wants_print end,
      self_updated_at = clock_timestamp()
      where id = r.id;
  end if;
  -- Print remains reversible within the code TTL; update/withdraw are single-use.
  if p_action <> 'print' then
    update public.verification_codes set consumed_at = clock_timestamp()
      where id = (checked ->> 'id')::uuid;
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.verification_code_check(text,text,text,uuid) from public, anon, authenticated;
revoke all on function public.entry_manage_with_code(text,text,uuid,text,jsonb) from public, anon, authenticated;
grant execute on function public.verification_code_check(text,text,text,uuid) to service_role;
grant execute on function public.entry_manage_with_code(text,text,uuid,text,jsonb) to service_role;
