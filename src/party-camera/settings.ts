import { InvalidSettingsError, type SettingsFieldErrors } from "./errors";
import type {
  EventSettings,
  RevealOverride,
  SettingsChanges,
  SettingsUpdate,
  WatermarkPosition,
} from "./types";

/** Longest Event title (after trimming). Keep in sync with migration 0007. */
export const MAX_TITLE_LENGTH = 60;
/** Longest welcome text (after trimming). Keep in sync with migration 0007. */
export const MAX_WELCOME_TEXT_LENGTH = 500;
/** Largest Rolletje the Host can set. Keep in sync with migration 0007. */
export const MAX_SHOTS_PER_GUEST = 500;

/** Longest watermark text (after trimming). Keep in sync with migration 0010. */
export const MAX_WATERMARK_TEXT_LENGTH = 60;
/**
 * Range of the watermark width relative to the photo width (5% to 60%).
 * Keep in sync with migration 0010.
 */
export const MIN_WATERMARK_SCALE = 0.05;
export const MAX_WATERMARK_SCALE = 0.6;
/** Range of the watermark opacity (10% to 100%). Keep in sync with migration 0010. */
export const MIN_WATERMARK_OPACITY = 0.1;
export const MAX_WATERMARK_OPACITY = 1;

export const WATERMARK_POSITIONS: readonly WatermarkPosition[] = [
  "top-left",
  "top-right",
  "bottom-left",
  "bottom-right",
];

/**
 * An accent color: exactly `#rrggbb`. Strict on purpose: the value is written
 * into a CSS custom property on guest pages, so nothing else may get through.
 */
const ACCENT_COLOR_RE = /^#[0-9a-f]{6}$/;

const REVEAL_OVERRIDES: readonly RevealOverride[] = ["auto", "open", "closed"];

/**
 * Range a Reveal moment must fall in. Guards against typos such as year 20026
 * (which a timestamptz would accept) more than it enforces anything.
 */
const EARLIEST_REVEAL = Date.UTC(2000, 0, 1);
const LATEST_REVEAL = Date.UTC(2100, 0, 1);

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

  if (update.revealAt !== undefined) {
    const at = update.revealAt;
    if (at === null) changes.revealAt = null;
    else if (
      !(at instanceof Date) ||
      Number.isNaN(at.getTime()) ||
      at.getTime() < EARLIEST_REVEAL ||
      at.getTime() >= LATEST_REVEAL
    ) {
      errors.revealAt = "Kies een geldige datum en tijd voor de onthulling.";
    } else changes.revealAt = new Date(at.getTime());
  }

  if (update.revealOverride !== undefined) {
    if (!REVEAL_OVERRIDES.includes(update.revealOverride)) {
      errors.revealOverride = "Ongeldige keuze voor de onthulling.";
    } else changes.revealOverride = update.revealOverride;
  }

  if (update.watermarkEnabled !== undefined) {
    if (typeof update.watermarkEnabled !== "boolean") {
      errors.watermarkEnabled = "Ongeldige keuze voor het watermark.";
    } else changes.watermarkEnabled = update.watermarkEnabled;
  }

  if (update.watermarkText !== undefined) {
    if (typeof update.watermarkText !== "string") {
      errors.watermarkText = "Ongeldige watermarktekst.";
    } else {
      // One line: control characters and runs of whitespace become one space.
      const text = update.watermarkText.replace(/[\u0000-\u001f\u007f\s]+/g, " ").trim();
      if ([...text].length > MAX_WATERMARK_TEXT_LENGTH) {
        errors.watermarkText = `De watermarktekst mag maximaal ${MAX_WATERMARK_TEXT_LENGTH} tekens lang zijn.`;
      } else changes.watermarkText = text;
    }
  }

  if (update.watermarkPosition !== undefined) {
    if (!WATERMARK_POSITIONS.includes(update.watermarkPosition)) {
      errors.watermarkPosition = "Kies een van de vier hoeken.";
    } else changes.watermarkPosition = update.watermarkPosition;
  }

  if (update.watermarkScale !== undefined) {
    const scale = inRange(update.watermarkScale, MIN_WATERMARK_SCALE, MAX_WATERMARK_SCALE);
    if (scale === null) {
      errors.watermarkScale = `Kies een grootte van ${percent(MIN_WATERMARK_SCALE)} tot en met ${percent(MAX_WATERMARK_SCALE)}.`;
    } else changes.watermarkScale = scale;
  }

  if (update.watermarkOpacity !== undefined) {
    const opacity = inRange(update.watermarkOpacity, MIN_WATERMARK_OPACITY, MAX_WATERMARK_OPACITY);
    if (opacity === null) {
      errors.watermarkOpacity = `Kies een zichtbaarheid van ${percent(MIN_WATERMARK_OPACITY)} tot en met ${percent(MAX_WATERMARK_OPACITY)}.`;
    } else changes.watermarkOpacity = opacity;
  }

  if (Object.keys(errors).length > 0) throw new InvalidSettingsError(errors);
  return changes;
}

/** `value` rounded to 3 decimals if it is a number in [min, max], else null. */
function inRange(value: unknown, min: number, max: number): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const rounded = Math.round(value * 1000) / 1000;
  return rounded >= min && rounded <= max ? rounded : null;
}

function percent(fraction: number): string {
  return `${Math.round(fraction * 100)}%`;
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
