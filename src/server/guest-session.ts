import "server-only";

import { cookies } from "next/headers";
import { errors as joseErrors, jwtVerify, SignJWT } from "jose";
import { isPartyCameraError, type GuestWithRoll } from "@/party-camera";
import { serverEnv } from "./env";
import { partyCamera } from "./party-camera";

/**
 * The Gast session: an httpOnly cookie holding a signed JWT (HS256) whose
 * subject is the guestId. The guestId is only ever read from this cookie,
 * never from a request body.
 */
const COOKIE_NAME = "pc_guest";
const AUDIENCE = "party-camera:guest";
const MAX_AGE_SECONDS = 90 * 24 * 60 * 60;

function key(): Uint8Array {
  return new TextEncoder().encode(serverEnv.sessionSecret);
}

/**
 * Check the session configuration up front and return a function that sets the
 * guest cookie. Call this BEFORE creating the Gast, so a missing or short
 * SESSION_SECRET fails loudly without leaving an orphaned guest row behind.
 * The returned function is only callable from a Server Action or Route Handler.
 */
export function prepareGuestSession(): (guestId: string) => Promise<void> {
  const signingKey = key();
  return (guestId) => startGuestSession(guestId, signingKey);
}

async function startGuestSession(guestId: string, signingKey: Uint8Array): Promise<void> {
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(guestId)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SECONDS}s`)
    .sign(signingKey);

  (await cookies()).set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

/** Remove the guest cookie. Only callable from a Server Action or Route Handler. */
export async function endGuestSession(): Promise<void> {
  (await cookies()).delete(COOKIE_NAME);
}

/** The guestId from a valid guest cookie, or null. */
export async function currentGuestId(): Promise<string | null> {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  if (!token) return null;
  // Outside the try: a missing/short SESSION_SECRET must throw, not look like "no session".
  const verifyKey = key();
  try {
    const { payload } = await jwtVerify(token, verifyKey, {
      algorithms: ["HS256"],
      audience: AUDIENCE,
    });
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch (error) {
    // Invalid, expired or tampered tokens mean "no session"; anything else is a bug.
    if (error instanceof joseErrors.JOSEError) return null;
    throw error;
  }
}

/** The Gast behind the cookie, or null if there is no valid cookie or the Gast no longer exists. */
export async function currentGuest(): Promise<GuestWithRoll | null> {
  const guestId = await currentGuestId();
  if (!guestId) return null;
  try {
    return await partyCamera().getGuest(guestId);
  } catch (error) {
    if (isPartyCameraError(error, "UnknownGuest")) return null;
    throw error;
  }
}
