-- Party Camera: atomic Shot reservation on a Gast's Rolletje.
--
-- reserve_shot increments guests.shots_taken in ONE conditional UPDATE, only
-- while it is below event_settings.shots_per_guest. Under concurrency Postgres
-- re-checks the WHERE clause after a competing update commits, so parallel
-- uploads (multiple tabs, rapid tapping) can never exceed the limit.
-- release_shot gives a reservation back when storing the photo failed.
-- Safe to re-run: create or replace.

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

create or replace function public.release_shot(p_guest_id uuid)
returns void
language sql
security invoker
set search_path = ''
as $$
  update public.guests
  set shots_taken = shots_taken - 1
  where id = p_guest_id
    and shots_taken > 0;
$$;

-- Only the server (service role) may call these; never the public API roles.
revoke execute on function public.reserve_shot(uuid) from public, anon, authenticated;
revoke execute on function public.release_shot(uuid) from public, anon, authenticated;
grant execute on function public.reserve_shot(uuid) to service_role;
grant execute on function public.release_shot(uuid) to service_role;
