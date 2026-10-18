import type { ShotResponse } from "./shot-response";

/** What happened to one upload, from the camera's point of view. */
export type UploadOutcome =
  | { kind: "stored"; shotsRemaining: number; shotsPerGuest: number }
  | { kind: "roll-full" }
  | { kind: "no-session" }
  | { kind: "invalid-image" }
  /**
   * Network or server trouble. Usually no shot was used, but if the answer got
   * lost after the server stored the photo, it was. Ticket 03 adds an
   * idempotency key so a retry cannot double-count.
   */
  | { kind: "failed" };

/**
 * Upload one Shot to `POST /api/shots`. The server identifies the Gast by the
 * cookie; the body is only the photo. A single attempt: ticket 03 wraps this in
 * a retrying queue.
 */
export async function uploadShot(photo: Blob): Promise<UploadOutcome> {
  let response: Response;
  try {
    response = await fetch("/api/shots", {
      method: "POST",
      headers: { "Content-Type": photo.type || "image/jpeg" },
      body: photo,
      credentials: "same-origin",
      cache: "no-store",
    });
  } catch {
    return { kind: "failed" };
  }

  let body: ShotResponse | null = null;
  try {
    body = (await response.json()) as ShotResponse;
  } catch {
    // Not our JSON (e.g. a proxy error page).
  }
  if (!body) return { kind: "failed" };
  if (body.ok) {
    return {
      kind: "stored",
      shotsRemaining: body.shotsRemaining,
      shotsPerGuest: body.shotsPerGuest,
    };
  }
  switch (body.error) {
    case "RollFull":
      return { kind: "roll-full" };
    case "NoSession":
      return { kind: "no-session" };
    case "InvalidImage":
    case "TooLarge":
      return { kind: "invalid-image" };
    default:
      return { kind: "failed" };
  }
}
