-- Party Camera: watermark settings (ticket 07).
--
-- Check constraints on the watermark columns mirror PartyCamera's validation
-- (src/party-camera/settings.ts), like migration 0007 does for the other
-- settings. Scale and opacity are `real`, so the bounds are compared as real
-- too (0.6 as a double is smaller than 0.6::real). The logo key can only name
-- an object under the watermark/ prefix of the bucket.
-- Safe to re-run.

alter table public.event_settings
  drop constraint if exists event_settings_watermark_text_length,
  drop constraint if exists event_settings_watermark_scale_range,
  drop constraint if exists event_settings_watermark_opacity_range,
  drop constraint if exists event_settings_watermark_logo_key_format;

alter table public.event_settings
  add constraint event_settings_watermark_text_length
    check (char_length(watermark_text) <= 60),
  add constraint event_settings_watermark_scale_range
    check (watermark_scale >= 0.05::real and watermark_scale <= 0.6::real),
  add constraint event_settings_watermark_opacity_range
    check (watermark_opacity >= 0.1::real and watermark_opacity <= 1::real),
  add constraint event_settings_watermark_logo_key_format
    check (watermark_logo_key is null or watermark_logo_key ~ '^watermark/[0-9a-f]{32}\.png$');
