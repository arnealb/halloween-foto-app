-- Party Camera: the Galerij.
--
-- The Galerij lists photos that are not hidden, oldest first, page by page
-- (keyset on (taken_at, id)), optionally for one Gast ("mijn foto's"). These
-- partial indexes serve exactly those two queries. Reveal settings
-- (reveal_at, reveal_override) already exist (0001) and are updated through
-- update_event_settings (0008), which type-checks them.
-- Safe to re-run.

create index if not exists photos_gallery_idx
  on public.photos (taken_at, id)
  where not hidden;

create index if not exists photos_gallery_guest_idx
  on public.photos (guest_id, taken_at, id)
  where not hidden;
