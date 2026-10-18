-- Party Camera: idempotent Shots, keyed by a client-generated shot id.
--
-- The camera generates a UUID per photo and repeats it on every retry of the
-- upload. A Shot is reserved under that id in shot_reservations, whose primary
-- key makes the id unique, so a retry whose first attempt already succeeded
-- (only the answer got lost) never takes a second shot or stores a duplicate
-- photo. The shot id also becomes photos.id.
--
-- A reservation is 'pending' while its attempt stores the photo and 'stored'
-- once the photo is recorded. It stays after the photo is hidden or deleted,
-- so a late retry can never bring a deleted photo back. A pending reservation
-- older than the caller's p_stale_before belongs to an attempt that died; a
-- retry takes it over without counting the Shot again. attempt_id ensures only
-- the attempt that holds a reservation can release it.
--
-- reserve_shot / release_shot replace the guest-only versions from 0002/0003.

create table if not exists public.shot_reservations (
  id          uuid primary key,
  guest_id    uuid not null references public.guests (id) on delete cascade,
  attempt_id  uuid not null,
  status      text not null default 'pending' check (status in ('pending', 'stored')),
  reserved_at timestamptz not null default now()
);

create index if not exists shot_reservations_guest_id_idx
  on public.shot_reservations (guest_id);

alter table public.shot_reservations enable row level security;

-- Photos stored before this migration count as stored Shots.
insert into public.shot_reservations (id, guest_id, attempt_id, status, reserved_at)
select p.id, p.guest_id, p.id, 'stored', p.taken_at
from public.photos p
on conflict (id) do nothing;

drop function if exists public.reserve_shot(uuid);
drop function if exists public.release_shot(uuid);

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
  v_reservation public.shot_reservations%rowtype;
begin
  select s.shots_per_guest into v_limit
  from public.event_settings s
  where s.id = 1;

  if v_limit is null then
    raise exception 'reserve_shot: event_settings row (id = 1) is missing';
  end if;

  -- Lock the Gast row: every reservation of one Gast is serialized, so the
  -- limit check and the duplicate check below cannot race.
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
  delete from public.shot_reservations r
  where r.id = p_shot_id
    and r.attempt_id = p_attempt_id
    and r.status = 'pending'
  returning r.guest_id into v_guest_id;

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

-- Records a stored Shot and marks its reservation stored, atomically.
-- Recording the same Shot twice is a no-op. Returns 'recorded' or
-- 'not-reserved' (no reservation for this Gast: nothing recorded).
create or replace function public.record_shot(
  p_shot_id     uuid,
  p_guest_id    uuid,
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
begin
  update public.shot_reservations r
  set status = 'stored'
  where r.id = p_shot_id
    and r.guest_id = p_guest_id;

  if not found then
    return 'not-reserved';
  end if;

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
revoke execute on function public.record_shot(uuid, uuid, text, integer, integer, timestamptz)
  from public, anon, authenticated;
grant execute on function public.reserve_shot(uuid, uuid, uuid, timestamptz, timestamptz)
  to service_role;
grant execute on function public.release_shot(uuid, uuid) to service_role;
grant execute on function public.record_shot(uuid, uuid, text, integer, integer, timestamptz)
  to service_role;
