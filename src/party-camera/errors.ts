/**
 * Typed failures of the PartyCamera interface. Callers branch on `code`.
 * Later features add codes such as CaptureClosed and NotRevealed.
 *
 * - `InvalidName`: joining without a usable name.
 * - `UnknownGuest`: no Gast with this id.
 * - `RollFull`: the Gast's Rolletje is full; no Shot was taken.
 * - `InvalidImage`: the upload is not a decodable photo (or is too large).
 */
export type PartyCameraErrorCode =
  | "InvalidName"
  | "UnknownGuest"
  | "RollFull"
  | "InvalidImage";

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
