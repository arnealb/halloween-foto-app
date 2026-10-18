import type { SettingsFieldErrors } from "@/party-camera";

/** JSON answer of `POST /api/admin/watermark` to the form's fetch. */
export type WatermarkSaveResult =
  | { saved: true }
  | { saved: false; fieldErrors?: SettingsFieldErrors; error?: string };

/** Outcome in `?watermark=` after a save without JavaScript (a redirect back). */
export type WatermarkSaveStatus = "opgeslagen" | "ongeldig" | "gewijzigd" | "fout";
