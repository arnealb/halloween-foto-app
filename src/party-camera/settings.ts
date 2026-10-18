import { InvalidSettingsError, type SettingsFieldErrors } from "./errors";
import type { EventSettings, SettingsChanges, SettingsUpdate } from "./types";

/** Longest Event title (after trimming). Keep in sync with migration 0007. */
export const MAX_TITLE_LENGTH = 60;
/** Longest welcome text (after trimming). Keep in sync with migration 0007. */
export const MAX_WELCOME_TEXT_LENGTH = 500;
/** Largest Rolletje the Host can set. Keep in sync with migration 0007. */
export const MAX_SHOTS_PER_GUEST = 500;

/**
 * An accent color: exactly `#rrggbb`. Strict on purpose: the value is written
 * into a CSS custom property on guest pages, so nothing else may get through.
 */
const ACCENT_COLOR_RE = /^#[0-9a-f]{6}$/;

/**
 * Validate and normalize a settings update. Every field is checked, so the
 * Host sees all problems at once. Fields that are absent stay unchanged;
 * unknown fields are ignored.
 * @throws InvalidSettingsError with a Dutch message per invalid field.
 */
export function validateSettingsUpdate(update: SettingsUpdate): SettingsChanges {
  const changes: SettingsChanges = {};
  const errors: SettingsFieldErrors = {};

  if (update.title !== undefined) {
    const title = typeof update.title === "string" ? update.title.replace(/\s+/g, " ").trim() : "";
    if (title.length === 0) errors.title = "Vul een feestnaam in.";
    else if ([...title].length > MAX_TITLE_LENGTH) {
      errors.title = `De feestnaam mag maximaal ${MAX_TITLE_LENGTH} tekens lang zijn.`;
    } else changes.title = title;
  }

  if (update.welcomeText !== undefined) {
    if (typeof update.welcomeText !== "string") {
      errors.welcomeText = "Ongeldige welkomsttekst.";
    } else {
      // Keep line breaks (normalized to \n), trim the whole text.
      const text = update.welcomeText.replace(/\r\n?/g, "\n").trim();
      if ([...text].length > MAX_WELCOME_TEXT_LENGTH) {
        errors.welcomeText = `De welkomsttekst mag maximaal ${MAX_WELCOME_TEXT_LENGTH} tekens lang zijn.`;
      } else changes.welcomeText = text;
    }
  }

  if (update.accentColor !== undefined) {
    const color = typeof update.accentColor === "string" ? update.accentColor.trim().toLowerCase() : "";
    if (!ACCENT_COLOR_RE.test(color)) {
      errors.accentColor = "Kies een geldige kleur in de vorm #rrggbb.";
    } else changes.accentColor = color;
  }

  if (update.shotsPerGuest !== undefined) {
    const shots = update.shotsPerGuest;
    if (
      typeof shots !== "number" ||
      !Number.isInteger(shots) ||
      shots < 1 ||
      shots > MAX_SHOTS_PER_GUEST
    ) {
      errors.shotsPerGuest = `Kies een heel getal van 1 tot en met ${MAX_SHOTS_PER_GUEST}.`;
    } else changes.shotsPerGuest = shots;
  }

  if (update.captureOpen !== undefined) {
    if (typeof update.captureOpen !== "boolean") {
      errors.captureOpen = "Ongeldige keuze voor fotograferen.";
    } else changes.captureOpen = update.captureOpen;
  }

  if (Object.keys(errors).length > 0) throw new InvalidSettingsError(errors);
  return changes;
}

/** The changes that actually differ from the current settings. */
export function effectiveChanges(
  changes: SettingsChanges,
  current: EventSettings,
): SettingsChanges {
  const effective: SettingsChanges = {};
  for (const key of Object.keys(changes) as (keyof SettingsChanges)[]) {
    const value = changes[key];
    const now = current[key];
    const same =
      value instanceof Date && now instanceof Date
        ? value.getTime() === now.getTime()
        : value === now;
    if (!same) Object.assign(effective, { [key]: value });
  }
  return effective;
}
