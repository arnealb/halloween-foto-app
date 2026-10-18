import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { errors as joseErrors, jwtVerify, SignJWT } from "jose";
import { serverEnv } from "./env";

/**
 * The Host session: an httpOnly cookie holding a signed JWT (HS256), separate
 * from the guest cookie. It has its own audience and its own signing key
 * (derived from SESSION_SECRET and ADMIN_PASSWORD), so a guest token can
 * never pass as an admin token.
 *
 * Pages, actions and routes do not call this directly to guard host
 * operations: they get them from `hostCamera()` / `requireHost()`, which
 * check this session first (see ./party-camera.ts and ./host.ts).
 */
const COOKIE_NAME = "pc_admin";
const AUDIENCE = "party-camera:admin";
const SUBJECT = "host";
/** The Host stays logged in on their device for the whole party and after. */
const MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

/**
 * Signing key of admin tokens: derived from SESSION_SECRET and the host
 * password, so changing ADMIN_PASSWORD logs out every admin session.
 */
function key(): Uint8Array {
  return new Uint8Array(
    createHmac("sha256", serverEnv.sessionSecret)
      .update("party-camera:admin-session\0", "utf8")
      .update(serverEnv.adminPassword, "utf8")
      .digest(),
  );
}

/**
 * Whether `candidate` is the host password (ADMIN_PASSWORD). Constant time:
 * both sides are HMAC'ed to equal-length digests first, so neither the
 * content nor the length of the password leaks through timing.
 */
export function isHostPassword(candidate: string): boolean {
  const digest = (value: string) =>
    createHmac("sha256", "party-camera:admin-password").update(value, "utf8").digest();
  return timingSafeEqual(digest(candidate), digest(serverEnv.adminPassword));
}

/** Set the admin cookie. Only callable from a Server Action or Route Handler. */
export async function startAdminSession(): Promise<void> {
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(SUBJECT)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SECONDS}s`)
    .sign(key());

  (await cookies()).set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

/** Remove the admin cookie. Only callable from a Server Action or Route Handler. */
export async function endAdminSession(): Promise<void> {
  (await cookies()).delete(COOKIE_NAME);
}

/** Whether the request carries a valid admin cookie. */
export async function hasAdminSession(): Promise<boolean> {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  if (!token) return false;
  // Outside the try: a missing/short SESSION_SECRET or missing ADMIN_PASSWORD
  // must throw, not look like "no session".
  const verifyKey = key();
  try {
    const { payload } = await jwtVerify(token, verifyKey, {
      algorithms: ["HS256"],
      audience: AUDIENCE,
      subject: SUBJECT,
    });
    return payload.sub === SUBJECT;
  } catch (error) {
    // Invalid, expired or tampered tokens mean "no session"; anything else is a bug.
    if (error instanceof joseErrors.JOSEError) return false;
    throw error;
  }
}
