import { describe, expect, it } from "vitest";
import { formatPartyMoment, fromPartyLocalInput, toPartyLocalInput } from "./party-time";

describe("party time (Europe/Brussels)", () => {
  it("reads a summer-time input as UTC+2 and a winter-time input as UTC+1", () => {
    expect(fromPartyLocalInput("2026-10-18T23:00")?.toISOString()).toBe("2026-10-18T21:00:00.000Z");
    expect(fromPartyLocalInput("2026-11-02T10:30")?.toISOString()).toBe("2026-11-02T09:30:00.000Z");
  });

  it("round-trips with the input value", () => {
    for (const iso of ["2026-10-18T21:00:00Z", "2026-12-31T23:15:00Z", "2026-03-29T01:00:00Z"]) {
      const date = new Date(iso);
      expect(fromPartyLocalInput(toPartyLocalInput(date))?.toISOString()).toBe(date.toISOString());
    }
  });

  it("handles the hours around the clock changes", () => {
    // 25 Oct 2026: 03:00 summer time becomes 02:00 winter time; 02:30 happens twice.
    expect(fromPartyLocalInput("2026-10-25T02:30")?.toISOString()).toBe("2026-10-25T00:30:00.000Z");
    // 29 Mar 2026: 02:00 jumps to 03:00; 02:30 does not exist and moves forward.
    expect(fromPartyLocalInput("2026-03-29T02:30")?.toISOString()).toBe("2026-03-29T01:30:00.000Z");
  });

  it("refuses anything that is not a datetime-local value", () => {
    for (const value of ["", "morgen", "2026-02-31T10:00", "2026-10-18 23:00", "2026-10-18T24:00"]) {
      expect(fromPartyLocalInput(value)).toBeNull();
    }
  });

  it("formats a moment in Dutch, in the party's zone", () => {
    expect(formatPartyMoment(new Date("2026-10-18T21:00:00Z"))).toBe("zondag 18 oktober om 23:00");
  });
});
