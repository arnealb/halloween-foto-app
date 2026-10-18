/**
 * The party's time zone. Times are shown in it and the Host types times in
 * it, whatever the server's (Vercel runs in UTC) or the phone's zone. Stored
 * times are always UTC.
 */
export const PARTY_TIME_ZONE = "Europe/Brussels";

const revealFormat = new Intl.DateTimeFormat("nl-BE", {
  weekday: "long",
  day: "numeric",
  month: "long",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: PARTY_TIME_ZONE,
});

/** "zaterdag 18 oktober om 23:00" */
export function formatPartyMoment(date: Date): string {
  const parts = revealFormat.formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${get("weekday")} ${get("day")} ${get("month")} om ${get("hour")}:${get("minute")}`;
}

const wallClock = new Intl.DateTimeFormat("en-GB", {
  timeZone: PARTY_TIME_ZONE,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

/** The wall-clock time in the party's zone, as if it were UTC (ms). */
function wallClockAsUtc(date: Date): number {
  const parts = wallClock.formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  return Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
}

/** Value for an `<input type="datetime-local">`: "2026-10-18T23:00", in the party's zone. */
export function toPartyLocalInput(date: Date): string {
  return new Date(wallClockAsUtc(date)).toISOString().slice(0, 16);
}

/**
 * The moment a `datetime-local` value ("2026-10-18T23:00", seconds optional)
 * names in the party's zone, or null if it is not such a value. In the hour
 * the clocks go back, the first (summer time) occurrence; a time skipped when
 * the clocks go forward is moved forward by the gap.
 */
export function fromPartyLocalInput(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value.trim());
  if (!match) return null;
  const [year, month, day, hour, minute, second] = match.slice(1).map((part) => Number(part ?? 0));
  const asUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  const check = new Date(asUtc);
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day ||
    hour > 23 ||
    minute > 59
  ) {
    return null; // e.g. 31 February
  }
  // The zone's offsets a few hours either side cover any clock change; keep
  // the instants that really show this wall-clock time.
  const HOURS_3 = 3 * 60 * 60 * 1000;
  const offsetAt = (t: number) => wallClockAsUtc(new Date(t)) - t;
  const candidates = [asUtc - HOURS_3, asUtc, asUtc + HOURS_3]
    .map((t) => asUtc - offsetAt(t))
    .filter((t) => wallClockAsUtc(new Date(t)) === asUtc);
  if (candidates.length > 0) return new Date(Math.min(...candidates));
  // A skipped wall-clock time: use the offset from before the gap.
  return new Date(asUtc - offsetAt(asUtc - HOURS_3));
}

const clockTime = new Intl.DateTimeFormat("nl-BE", {
  timeZone: PARTY_TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
});

/** "21:37", in the party's zone. */
export function formatPartyTime(date: Date): string {
  return clockTime.format(date);
}
