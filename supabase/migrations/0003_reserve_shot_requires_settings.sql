-- Party Camera: reserve_shot fails loudly when the Event settings row is missing.
--
-- In 0002, a missing event_settings row (id = 1) left the limit NULL, so every
-- reservation silently answered 'roll-full' with a null shots_per_guest. Now
-- it raises instead, so the server reports an error rather than a fake full
-- Rolletje. Otherwise identical to 0002. Safe to re-run: create or replace.

create or replace function public.reserve_shot(p_guest_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_limit integer;
  v_taken integer;
begin
  select s.shots_per_guest into v_limit
  from public.event_settings s
  where s.id = 1;

  if v_limit is null then
    raise exception 'reserve_shot: event_settings row (id = 1) is missing';
  end if;

  update public.guests g
  set shots_taken = g.shots_taken + 1
  where g.id = p_guest_id
    and g.shots_taken < v_limit
  returning g.shots_taken into v_taken;

  if found then
    return jsonb_build_object(
      'status', 'reserved', 'shots_taken', v_taken, 'shots_per_guest', v_limit);
  end if;

  select g.shots_taken into v_taken
  from public.guests g
  where g.id = p_guest_id;

  if not found then
    return jsonb_build_object('status', 'unknown-guest');
  end if;

  return jsonb_build_object(
    'status', 'roll-full', 'shots_taken', v_taken, 'shots_per_guest', v_limit);
end;
$$;

-- create or replace keeps existing grants; restate them to be explicit.
revoke execute on function public.reserve_shot(uuid) from public, anon, authenticated;
grant execute on function public.reserve_shot(uuid) to service_role;
