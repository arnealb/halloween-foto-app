-- Party Camera: settings updates with a version check and strict JSON types.
--
-- update_event_settings(p_changes, p_expected_version) replaces the one-argument
-- version from 0007:
-- 1. Optimistic concurrency. With p_expected_version set, the update only
--    applies while settings_version still equals it (compare-and-set in the
--    UPDATE itself, so it is atomic); otherwise nothing changes and the result
--    is {"status": "stale", "settings_version": <current>}. NULL skips the
--    check (used for a single-field change such as fotograferen open/dicht,
--    where the requested value is the whole intent).
-- 2. Every key must have the JSON type of its column: a string where text is
--    expected, a number for numbers, a boolean for booleans (no '1'/'yes'
--    coercion), and null only for nullable columns.
-- Result on success: {"status": "updated", "settings": <the row>}.
-- Safe to re-run.

drop function if exists public.update_event_settings(jsonb);

create or replace function public.update_event_settings(
  p_changes          jsonb,
  p_expected_version integer default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_key      text;
  v_value    jsonb;
  v_type     text;
  v_expected text;
  v_nullable boolean;
  v_current  integer;
  v_row      public.event_settings%rowtype;
begin
  if jsonb_typeof(p_changes) is distinct from 'object' then
    raise exception 'update_event_settings: p_changes must be a JSON object';
  end if;

  for v_key, v_value in select e.key, e.value from jsonb_each(p_changes) as e loop
    v_expected := case v_key
      when 'title'              then 'string'
      when 'welcome_text'       then 'string'
      when 'accent_color'       then 'string'
      when 'shots_per_guest'    then 'number'
      when 'capture_open'       then 'boolean'
      when 'reveal_at'          then 'string'
      when 'reveal_override'    then 'string'
      when 'watermark_enabled'  then 'boolean'
      when 'watermark_text'     then 'string'
      when 'watermark_logo_key' then 'string'
      when 'watermark_position' then 'string'
      when 'watermark_scale'    then 'number'
      when 'watermark_opacity'  then 'number'
    end;
    if v_expected is null then
      raise exception 'update_event_settings: unknown setting %', v_key;
    end if;
    v_nullable := v_key in ('reveal_at', 'watermark_logo_key');
    v_type := jsonb_typeof(v_value);
    if v_type <> v_expected and not (v_nullable and v_type = 'null') then
      raise exception 'update_event_settings: % must be a JSON %, got %', v_key, v_expected, v_type;
    end if;
  end loop;

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
    and (p_expected_version is null or s.settings_version = p_expected_version)
  returning s.* into v_row;

  if found then
    return jsonb_build_object('status', 'updated', 'settings', to_jsonb(v_row));
  end if;

  select s.settings_version into v_current from public.event_settings s where s.id = 1;
  if not found then
    raise exception 'update_event_settings: event_settings row (id = 1) is missing';
  end if;
  return jsonb_build_object('status', 'stale', 'settings_version', v_current);
end;
$$;

-- Only the server (service role) may call this; never the public API roles.
revoke execute on function public.update_event_settings(jsonb, integer)
  from public, anon, authenticated;
grant execute on function public.update_event_settings(jsonb, integer) to service_role;
