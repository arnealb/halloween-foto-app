import "server-only";

/**
 * A little brute-force protection for the admin login, per client IP and per
 * server instance (in memory: on serverless it resets with the instance,
 * which is fine for a private party). After a few wrong passwords the client
 * must wait, doubling each time up to a minute; a correct password clears
 * the record. The cap is short on purpose: guests share the party Wi-Fi's IP
 * with the Host, so a guessing guest must not lock the Host out for long.
 */
const FREE_ATTEMPTS = 5;
const BASE_LOCKOUT_MS = 30_000;
const MAX_LOCKOUT_MS = 60_000;
/** Records untouched this long are forgotten. */
const FORGET_AFTER_MS = 60 * 60_000;
const MAX_RECORDS = 10_000;

interface Failures {
  count: number;
  lockedUntil: number;
  lastFailure: number;
}

const failures = new Map<string, Failures>();

/** Milliseconds `client` must still wait before trying again (0 = may try now). */
export function loginLockout(client: string, now = Date.now()): number {
  const record = failures.get(client);
  return record ? Math.max(0, record.lockedUntil - now) : 0;
}

/** Note a wrong password from `client`. */
export function recordLoginFailure(client: string, now = Date.now()): void {
  if (failures.size >= MAX_RECORDS) forgetOld(now);
  const record = failures.get(client) ?? { count: 0, lockedUntil: 0, lastFailure: now };
  record.count += 1;
  record.lastFailure = now;
  if (record.count >= FREE_ATTEMPTS) {
    const lockout = BASE_LOCKOUT_MS * 2 ** (record.count - FREE_ATTEMPTS);
    record.lockedUntil = now + Math.min(lockout, MAX_LOCKOUT_MS);
  }
  failures.set(client, record);
}

/** A correct password: forget the client's failures. */
export function recordLoginSuccess(client: string): void {
  failures.delete(client);
}

function forgetOld(now: number): void {
  for (const [client, record] of failures) {
    if (now - record.lastFailure > FORGET_AFTER_MS && record.lockedUntil < now) {
      failures.delete(client);
    }
  }
  // Still full (an attack from very many addresses): start over rather than grow.
  if (failures.size >= MAX_RECORDS) failures.clear();
}
