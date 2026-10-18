-- Party Camera: initial schema.
-- Gasten, photos (Shots), the single Event's settings, and the private bucket.
-- Safe to re-run: every statement is idempotent.

-- Gasten -------------------------------------------------------------------
create table if not exists public.guests (
  id          uuid primary key,
  name        text not null check (char_length(name) between 1 and 40),
  shots_taken integer not null default 0 check (shots_taken >= 0),
  created_at  timestamptz not null default now()
);

-- Photos (one per Shot) -----------------------------------------------------
create table if not exists public.photos (
  id          uuid primary key,
  guest_id    uuid not null references public.guests (id) on delete cascade,
  storage_key text not null unique,
  width       integer not null check (width > 0),
  height      integer not null check (height > 0),
  taken_at    timestamptz not null default now(),
  hidden      boolean not null default false
);

create index if not exists photos_guest_id_idx on public.photos (guest_id);
create index if not exists photos_taken_at_idx on public.photos (taken_at);

-- Event settings: exactly one row (id = 1) ----------------------------------
-- Defaults mirror DEFAULT_EVENT_SETTINGS in src/party-camera/defaults.ts.
create table if not exists public.event_settings (
  id                 smallint primary key default 1 check (id = 1),
  title              text not null default 'Party Camera',
  welcome_text       text not null default '',
  accent_color       text not null default '#f97316',
  shots_per_guest    integer not null default 50 check (shots_per_guest >= 1),
  capture_open       boolean not null default true,
  reveal_at          timestamptz,
  reveal_override    text not null default 'auto'
                       check (reveal_override in ('auto', 'open', 'closed')),
  watermark_enabled  boolean not null default false,
  watermark_text     text not null default '',
  watermark_logo_key text,
  watermark_position text not null default 'bottom-right'
                       check (watermark_position in ('top-left', 'top-right', 'bottom-left', 'bottom-right')),
  watermark_scale    real not null default 0.25 check (watermark_scale > 0 and watermark_scale <= 1),
  watermark_opacity  real not null default 0.8 check (watermark_opacity >= 0 and watermark_opacity <= 1),
  settings_version   integer not null default 1,
  updated_at         timestamptz not null default now()
);

insert into public.event_settings (id) values (1) on conflict (id) do nothing;

-- Row Level Security: on, with no policies. Only the service role (server) can
-- read or write; the anon/authenticated API roles see nothing.
alter table public.guests         enable row level security;
alter table public.photos         enable row level security;
alter table public.event_settings enable row level security;

-- Private storage bucket. All bytes go through the app, never public URLs.
insert into storage.buckets (id, name, public)
values ('party-camera', 'party-camera', false)
on conflict (id) do update set public = false;
