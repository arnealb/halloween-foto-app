import { SHOT_ID_HEADER, type ShotResponse } from "./shot-response";

/** One photo waiting to be uploaded, under the shot id generated when it was taken. */
export interface PendingShot {
  /** UUID generated once per photo; repeated on every retry so it is never counted twice. */
  shotId: string;
  /** The JPEG to upload. Never shown. */
  photo: Blob;
}

/** What happened to one upload attempt, from the camera's point of view. */
export type UploadOutcome =
  | { kind: "stored"; shotsRemaining: number; shotsPerGuest: number }
  | { kind: "roll-full" }
  | { kind: "no-session" }
  /** The server refused this photo for good (not a photo, too large, ...). No shot was used. */
  | { kind: "rejected" }
  /**
   * Worth another attempt; the shot id makes a retry idempotent. `reason`:
   * - `network`: no answer (offline, timeout, cut connection), or the same Shot
   *   is still being stored by an earlier attempt. Retried for as long as the
   *   page is open.
   * - `server`: the server answered with an error or something that is not our
   *   JSON. Retried a limited number of times.
   */
  | { kind: "retry"; reason: "network" | "server" };

/**
 * Give up on one attempt after this long; the queue retries it. Clearly above
 * the route's `maxDuration` (60 s), so the client never abandons an attempt
 * the server is still allowed to finish.
 */
const ATTEMPT_TIMEOUT_MS = 90_000;

/**
 * One attempt to upload a Shot to `POST /api/shots`. The server identifies the
 * Gast by the cookie; the body is only the photo, the shot id goes in a header.
 */
export async function uploadShot({ shotId, photo }: PendingShot): Promise<UploadOutcome> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ATTEMPT_TIMEOUT_MS);
  let response: Response;
  let body: ShotResponse | null = null;
  try {
    response = await fetch("/api/shots", {
      method: "POST",
      headers: {
        "Content-Type": photo.type || "image/jpeg",
        [SHOT_ID_HEADER]: shotId,
      },
      body: photo,
      credentials: "same-origin",
      cache: "no-store",
      signal: controller.signal,
    });
    try {
      body = (await response.json()) as ShotResponse;
    } catch {
      // Not our JSON (e.g. a proxy error page or a cut connection).
    }
  } catch {
    return { kind: "retry", reason: "network" };
  } finally {
    clearTimeout(timeout);
  }

  if (!body) return { kind: "retry", reason: "server" };
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
    case "InvalidShotId":
    case "Forbidden":
      return { kind: "rejected" };
    case "ShotInProgress":
      return { kind: "retry", reason: "network" };
    case "ServerError":
    default:
      return { kind: "retry", reason: "server" };
  }
}
