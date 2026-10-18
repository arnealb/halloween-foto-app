import type { SettingsUpdate } from "./types";

/**
 * Typed failures of the PartyCamera interface. Callers branch on `code`.
 * Later features add more codes.
 *
 * - `InvalidName`: joining without a usable name.
 * - `UnknownGuest`: no Gast with this id.
 * - `RollFull`: the Gast's Rolletje is full; no Shot was taken.
 * - `InvalidImage`: the upload is not a decodable photo (or is too large).
 * - `InvalidShotId`: the shot id is not a UUID, or belongs to another Gast.
 * - `ShotInProgress`: another attempt is storing this same Shot right now.
 *   Nothing changed; retry later to learn the outcome.
 * - `UnknownPhoto`: no photo with this id (never taken, or deleted).
 * - `CaptureClosed`: the Host closed fotograferen; no new Shot is taken.
 * - `NotRevealed`: the Galerij is asked for before the Reveal.
 * - `SettingsChanged`: a settings update based on an older settings version
 *   (changed elsewhere in the meantime); nothing changed. Reload and retry.
 * - `PreviewSuperseded`: a watermark preview overtaken by a newer request
 *   while it waited for its turn; nothing was rendered.
 * - `InvalidExportPart`: a zip export asked for a part that does not exist
 *   (or for an unknown kind of export).
 * - `InvalidSettings`: a settings update with invalid values; nothing changed.
 *   Thrown as {@link InvalidSettingsError}, which says what is wrong per field.
 */
export type PartyCameraErrorCode =
  | "InvalidName"
  | "UnknownGuest"
  | "RollFull"
  | "InvalidImage"
  | "InvalidShotId"
  | "ShotInProgress"
  | "UnknownPhoto"
  | "CaptureClosed"
  | "NotRevealed"
  | "InvalidSettings"
  | "SettingsChanged"
  | "PreviewSuperseded"
  | "InvalidExportPart";

export class PartyCameraError extends Error {
  readonly code: PartyCameraErrorCode;

  constructor(code: PartyCameraErrorCode, message: string) {
    super(message);
    this.name = "PartyCameraError";
    this.code = code;
  }
}

export function isPartyCameraError(
  error: unknown,
  code?: PartyCameraErrorCode,
): error is PartyCameraError {
  return (
    error instanceof PartyCameraError && (code === undefined || error.code === code)
  );
}

/** Settings fields that can be invalid, with a Dutch message for each. */
export type SettingsFieldErrors = Partial<Record<keyof SettingsUpdate, string>>;

/** `InvalidSettings`: one Dutch message per invalid field, for inline form errors. */
export class InvalidSettingsError extends PartyCameraError {
  readonly fieldErrors: SettingsFieldErrors;

  constructor(fieldErrors: SettingsFieldErrors) {
    super("InvalidSettings", Object.values(fieldErrors).join(" "));
    this.name = "InvalidSettingsError";
    this.fieldErrors = fieldErrors;
  }
}
