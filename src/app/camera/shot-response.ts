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
        | "NoSession"
        | "InvalidImage"
        | "TooLarge"
        | "Forbidden"
        | "ServerError";
    };
