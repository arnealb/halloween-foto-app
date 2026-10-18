/**
 * Request header carrying the shot id: a UUID generated once per photo and
 * repeated on every retry of its upload, so a retry never costs a second shot.
 */
export const SHOT_ID_HEADER = "X-Shot-Id";

/**
 * JSON body of `POST /api/shots`. Shared by the route and the camera client.
 * It only ever carries the Rolletje counter: never a URL or bytes of the photo.
 */
export type ShotResponse =
  | { ok: true; shotsRemaining: number; shotsPerGuest: number }
  | {
      ok: false;
      error:
        | "RollFull"
        | "CaptureClosed"
        | "NoSession"
        | "InvalidImage"
        | "InvalidShotId"
        | "ShotInProgress"
        | "TooLarge"
        | "Forbidden"
        | "ServerError";
    };
