import type { EventSettings } from "./types";

/**
 * Settings of a fresh Event. Keep in sync with the column defaults of
 * `event_settings` in `supabase/migrations/0001_init.sql`.
 */
export const DEFAULT_EVENT_SETTINGS: EventSettings = {
  title: "Party Camera",
  welcomeText: "",
  accentColor: "#f97316",
  shotsPerGuest: 50,
  captureOpen: true,
  revealAt: null,
  revealOverride: "auto",
  watermarkEnabled: false,
  watermarkText: "",
  watermarkLogoKey: null,
  watermarkPosition: "bottom-right",
  watermarkScale: 0.25,
  watermarkOpacity: 0.8,
  settingsVersion: 1,
};
