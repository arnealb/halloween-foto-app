-- Party Camera: the Host edits the Event settings; fotograferen open/dicht.
--
-- 1. Check constraints on event_settings mirror PartyCamera's validation
--    (src/party-camera/settings.ts). accent_color must be exactly '#rrggbb'
--    (lowercase): it is written into a CSS custom property on guest pages, so
--    the database refuses anything else too.
-- 2. update_event_settings applies a set of (already validated) changes and
--    bumps settings_version by one, atomically.
-- 3. reserve_shot refuses NEW Shots while capture_open is false
--    ('capture-closed'). A Shot reserved before closing is answered as before
--    (stored: 'already-stored'; pending: 'in-progress' or taken over), so a
--    retry of a Shot that was already stored still succeeds. It also reads the
--    settings row FOR SHARE: an update waits for reservations in flight, so no
--    reservation made under the old settings (limit, open) commits after the
--    update has returned. Lock order: settings row, Gast row, reservation row.
-- Safe to re-run.

-- 1. Constraints --------------------------------------------------------------
alter table public.event_settings
  drop constraint if exists event_settings_shots_per_guest_check,
  drop constraint if exists event_settings_shots_per_guest_range,
  drop constraint if exists event_settings_title_length,
  drop constraint if exists event_settings_welcome_text_length,
  drop constraint if exists event_settings_accent_color_format;

alter table public.event_settings
  add constraint event_settings_shots_per_guest_range
    check (shots_per_guest between 1 and 500),
  add constraint event_settings_title_length
    check (char_length(title) between 1 and 60),
  add constraint event_settings_welcome_text_length
    check (char_length(welcome_text) <= 500),
  add constraint event_settings_accent_color_format
    check (accent_color ~ '^#[0-9a-f]{6}$');

-- 2. update_event_settings ----------------------------------------------------
-- p_changes: a JSON object with any of the column names below; absent keys
-- keep their value. Unknown keys are an error (a typo must not pass silently).
create or replace function public.update_event_settings(p_changes jsonb)
returns public.event_settings
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_unknown text;
  v_row     public.event_settings%rowtype;
begin
  if jsonb_typeof(p_changes) is distinct from 'object' then
    raise exception 'update_event_settings: p_changes must be a JSON object';
  end if;

  select k into v_unknown
  from jsonb_object_keys(p_changes) as k
  where k not in (
    'title', 'welcome_text', 'accent_color', 'shots_per_guest', 'capture_open',
    'reveal_at', 'reveal_override', 'watermark_enabled', 'watermark_text',
    'watermark_logo_key', 'watermark_position', 'watermark_scale', 'watermark_opacity')
  limit 1;
  if v_unknown is not null then
    raise exception 'update_event_settings: unknown setting %', v_unknown;
  end if;

  update public.event_settings s set
    title              = case when p_changes ? 'title' then p_changes->>'title' else s.title end,
    welcome_text       = case when p_changes ? 'welcome_text' then p_changes->>'welcome_text' else s.welcome_text end,
    accent_color       = case when p_changes ? 'accent_color' then p_changes->>'accent_color' else s.accent_color end,
    shots_per_guest    = case when p_changes ? 'shots_per_guest' then (p_changes->>'shots_per_guest')::integer else s.shots_per_guest end,
    capture_open       = case when p_changes ? 'capture_open' then (p_changes->>'capture_open')::boolean else s.capture_open end,
    reveal_at          = case when p_changes ? 'reveal_at' then (p_changes->>'reveal_at')::timestamptz else s.reveal_at end,
    reveal_override    = case when p_changes ? 'reveal_override' then p_changes->>'reveal_override' else s.reveal_override end,
    watermark_enabled  = case when p_changes ? 'watermark_enabled' then (p_changes->>'watermark_enabled')::boolean else s.watermark_enabled end,
    watermark_text     = case when p_changes ? 'watermark_text' then p_changes->>'watermark_text' else s.watermark_text end,
    watermark_logo_key = case when p_changes ? 'watermark_logo_key' then p_changes->>'watermark_logo_key' else s.watermark_logo_key end,
    watermark_position = case when p_changes ? 'watermark_position' then p_changes->>'watermark_position' else s.watermark_position end,
    watermark_scale    = case when p_changes ? 'watermark_scale' then (p_changes->>'watermark_scale')::real else s.watermark_scale end,
    watermark_opacity  = case when p_changes ? 'watermark_opacity' then (p_changes->>'watermark_opacity')::real else s.watermark_opacity end,
    settings_version   = s.settings_version + 1,
    updated_at         = now()
  where s.id = 1
  returning s.* into v_row;

  if not found then
    raise exception 'update_event_settings: event_settings row (id = 1) is missing';
  end if;

  return v_row;
end;
$$;

-- 3. reserve_shot (0005 plus the capture_open check and the settings lock) -----
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
  v_open        boolean;
  v_taken       integer;
  v_freed       integer;
  v_reservation public.shot_reservations%rowtype;
begin
  -- Lock order: settings row (shared), then Gast row, then reservation rows.
  select s.shots_per_guest, s.capture_open into v_limit, v_open
  from public.event_settings s
  where s.id = 1
  for share;

  if v_limit is null then
    raise exception 'reserve_shot: event_settings row (id = 1) is missing';
  end if;

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
    -- Take over the pending reservation of a dead attempt: already counted,
    -- and reserved before any closing, so allowed while closed too.
    update public.shot_reservations
    set attempt_id = p_attempt_id, reserved_at = p_now
    where id = p_shot_id;
    return jsonb_build_object(
      'status', 'reserved', 'shots_taken', v_taken, 'shots_per_guest', v_limit);
  end if;

  -- A new Shot: only while fotograferen is open.
  if not v_open then
    return jsonb_build_object('status', 'capture-closed');
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

  -- The current limit: after the Host lowers it, a Gast at or above it is full.
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

-- Only the server (service role) may call these; never the public API roles.
revoke execute on function public.update_event_settings(jsonb) from public, anon, authenticated;
grant execute on function public.update_event_settings(jsonb) to service_role;
revoke execute on function public.reserve_shot(uuid, uuid, uuid, timestamptz, timestamptz)
  from public, anon, authenticated;
grant execute on function public.reserve_shot(uuid, uuid, uuid, timestamptz, timestamptz)
  to service_role;
