/**
 * Typed failures of the PartyCamera interface. Callers branch on `code`.
 * Later features add codes such as CaptureClosed and NotRevealed.
 *
 * - `InvalidName`: joining without a usable name.
 * - `UnknownGuest`: no Gast with this id.
 * - `RollFull`: the Gast's Rolletje is full; no Shot was taken.
 * - `InvalidImage`: the upload is not a decodable photo (or is too large).
 * - `InvalidShotId`: the shot id is not a UUID, or belongs to another Gast.
 * - `ShotInProgress`: another attempt is storing this same Shot right now.
 *   Nothing changed; retry later to learn the outcome.
 */
export type PartyCameraErrorCode =
  | "InvalidName"
  | "UnknownGuest"
  | "RollFull"
  | "InvalidImage"
  | "InvalidShotId"
  | "ShotInProgress";

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
