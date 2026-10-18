import { PARTY_TIME_ZONE } from "../party-time";

/**
 * Times in the Admin are shown in the party's time zone, whatever the server's
 * (Vercel runs in UTC). Formatted on the server, so no hydration mismatch.
 */

const time = new Intl.DateTimeFormat("nl-NL", {
  timeZone: PARTY_TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
});

const dayAndHour = new Intl.DateTimeFormat("nl-NL", {
  timeZone: PARTY_TIME_ZONE,
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
});

/** "21:37" */
export function formatTime(date: Date): string {
  return time.format(date);
}

/** Heading of an hour block in the chronological view, e.g. "za 18 okt, 21 uur". */
export function formatHour(date: Date): string {
  const parts = dayAndHour.formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${get("weekday")} ${get("day")} ${get("month")}, ${get("hour")} uur`;
}

/** "1 foto" / "3 foto's" */
export function countPhotos(count: number): string {
  return count === 1 ? "1 foto" : `${count} foto's`;
}
