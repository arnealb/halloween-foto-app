-- Party Camera: fence Shot attempts and fix lock order (follow-up to 0004).
--
-- 1. record_shot only records for the attempt that holds the pending
--    reservation (p_attempt_id). A slow attempt whose reservation was taken
--    over or released records nothing. A Shot already stored by another
--    attempt answers 'already-stored' (success for the caller).
-- 2. Every function locks the Gast row first, then the reservation row, so
--    reserve/record/release of the same Shot can never deadlock. (Before,
--    record_shot and release_shot locked the reservation first.)
-- 3. reserve_shot frees the Gast's stale pending reservations of OTHER shot
--    ids (attempts that died and were never retried) before the limit check,
--    so a dead upload does not cost a shot forever. A stale pending
--    reservation of the requested shot id is still taken over (not counted
--    again), as in 0004.

create or replace function public.reserve_shot(
  p_guest_id     uuid,
  p_shot_id      uuid,
  p_attempt_id   uuid,
  p_now          timestamptz,
  p_stale_before timestamptz
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_limit       integer;
  v_taken       integer;
  v_freed       integer;
  v_reservation public.shot_reservations%rowtype;
begin
  select s.shots_per_guest into v_limit
  from public.event_settings s
  where s.id = 1;

  if v_limit is null then
    raise exception 'reserve_shot: event_settings row (id = 1) is missing';
  end if;

  -- Lock order: Gast row first, then reservation rows.
  select g.shots_taken into v_taken
  from public.guests g
  where g.id = p_guest_id
  for update;

  if not found then
    return jsonb_build_object('status', 'unknown-guest');
  end if;

  select r.* into v_reservation
  from public.shot_reservations r
  where r.id = p_shot_id
  for update;

  if found then
    if v_reservation.guest_id <> p_guest_id then
      return jsonb_build_object('status', 'foreign-shot');
    end if;
    if v_reservation.status = 'stored' then
      return jsonb_build_object(
        'status', 'already-stored', 'shots_taken', v_taken, 'shots_per_guest', v_limit);
    end if;
    if v_reservation.reserved_at >= p_stale_before then
      return jsonb_build_object('status', 'in-progress');
    end if;
    -- Take over the pending reservation of a dead attempt: already counted.
    update public.shot_reservations
    set attempt_id = p_attempt_id, reserved_at = p_now
    where id = p_shot_id;
    return jsonb_build_object(
      'status', 'reserved', 'shots_taken', v_taken, 'shots_per_guest', v_limit);
  end if;

  -- Give back the shots of this Gast's dead attempts (other shot ids). A late
  -- retry of such a shot simply reserves it afresh.
  with freed as (
    delete from public.shot_reservations r
    where r.guest_id = p_guest_id
      and r.status = 'pending'
      and r.reserved_at < p_stale_before
    returning 1
  )
  select count(*) into v_freed from freed;

  if v_freed > 0 then
    update public.guests g
    set shots_taken = greatest(0, g.shots_taken - v_freed)
    where g.id = p_guest_id
    returning g.shots_taken into v_taken;
  end if;

  if v_taken >= v_limit then
    return jsonb_build_object(
      'status', 'roll-full', 'shots_taken', v_taken, 'shots_per_guest', v_limit);
  end if;

  insert into public.shot_reservations (id, guest_id, attempt_id, status, reserved_at)
  values (p_shot_id, p_guest_id, p_attempt_id, 'pending', p_now)
  on conflict (id) do nothing;

  if not found then
    -- Inserted concurrently by another Gast (whose row lock we do not hold).
    return jsonb_build_object('status', 'foreign-shot');
  end if;

  update public.guests g
  set shots_taken = g.shots_taken + 1
  where g.id = p_guest_id
  returning g.shots_taken into v_taken;

  return jsonb_build_object(
    'status', 'reserved', 'shots_taken', v_taken, 'shots_per_guest', v_limit);
end;
$$;

-- Returns true when the pending reservation of this attempt was released.
create or replace function public.release_shot(p_shot_id uuid, p_attempt_id uuid)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_guest_id uuid;
begin
  select r.guest_id into v_guest_id
  from public.shot_reservations r
  where r.id = p_shot_id;

  if not found then
    return false;
  end if;

  -- Lock order: Gast row first, then the reservation row.
  perform 1 from public.guests g where g.id = v_guest_id for update;

  delete from public.shot_reservations r
  where r.id = p_shot_id
    and r.attempt_id = p_attempt_id
    and r.status = 'pending';

  if not found then
    return false;
  end if;

  update public.guests
  set shots_taken = shots_taken - 1
  where id = v_guest_id
    and shots_taken > 0;

  return true;
end;
$$;

drop function if exists public.record_shot(uuid, uuid, text, integer, integer, timestamptz);

-- Records the Shot for the attempt holding its pending reservation and marks
-- the reservation stored, atomically. Returns:
--   'recorded'       this attempt's photo is recorded;
--   'already-stored' another attempt stored this Shot (nothing changed);
--   'not-reserved'   this attempt no longer holds the Shot (released or taken
--                    over); nothing recorded.
create or replace function public.record_shot(
  p_shot_id     uuid,
  p_guest_id    uuid,
  p_attempt_id  uuid,
  p_storage_key text,
  p_width       integer,
  p_height      integer,
  p_taken_at    timestamptz
)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_reservation public.shot_reservations%rowtype;
begin
  -- Lock order: Gast row first, then the reservation row.
  perform 1 from public.guests g where g.id = p_guest_id for update;

  select r.* into v_reservation
  from public.shot_reservations r
  where r.id = p_shot_id
  for update;

  if not found or v_reservation.guest_id <> p_guest_id then
    return 'not-reserved';
  end if;
  if v_reservation.status = 'stored' then
    return 'already-stored';
  end if;
  if v_reservation.attempt_id <> p_attempt_id then
    return 'not-reserved';
  end if;

  update public.shot_reservations
  set status = 'stored'
  where id = p_shot_id;

  insert into public.photos (id, guest_id, storage_key, width, height, taken_at, hidden)
  values (p_shot_id, p_guest_id, p_storage_key, p_width, p_height, p_taken_at, false)
  on conflict (id) do nothing;

  return 'recorded';
end;
$$;

-- Only the server (service role) may call these; never the public API roles.
revoke execute on function public.reserve_shot(uuid, uuid, uuid, timestamptz, timestamptz)
  from public, anon, authenticated;
revoke execute on function public.release_shot(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.record_shot(uuid, uuid, uuid, text, integer, integer, timestamptz)
  from public, anon, authenticated;
grant execute on function public.reserve_shot(uuid, uuid, uuid, timestamptz, timestamptz)
  to service_role;
grant execute on function public.release_shot(uuid, uuid) to service_role;
grant execute on function public.record_shot(uuid, uuid, uuid, text, integer, integer, timestamptz)
  to service_role;
