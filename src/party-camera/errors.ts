/**
 * Typed failures of the PartyCamera interface. Callers branch on `code`.
 * Later features add codes such as RollFull, CaptureClosed, InvalidImage,
 * NotRevealed.
 */
export type PartyCameraErrorCode = "InvalidName" | "UnknownGuest";

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
