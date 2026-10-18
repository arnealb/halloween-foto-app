import type { EventSettings } from "./types";

/**
 * Why the Galerij is or is not revealed right now:
 * - `auto`: revealed because the Reveal moment (`revealAt`) has passed;
 * - `forced-open`: revealed by the Host ("nu onthullen"), whatever the time;
 * - `forced-closed`: kept hidden by the Host ("verborgen houden"), whatever the time;
 * - `pending`: automatic, and the Reveal moment has not come yet (or none is set).
 */
export type RevealReason = "auto" | "forced-open" | "forced-closed" | "pending";

/** Result of `PartyCamera.getRevealState`. */
export interface RevealState {
  revealed: boolean;
  reason: RevealReason;
  /** The Reveal moment the Host set (also when an override makes it irrelevant), or null. */
  revealAt: Date | null;
}

/**
 * The spec's rule: `revealed = override === 'open' || (override === 'auto' &&
 * now >= revealAt)`. Without a `revealAt`, `auto` stays hidden until the Host
 * forces it open.
 */
export function revealStateOf(
  { revealOverride, revealAt }: Pick<EventSettings, "revealOverride" | "revealAt">,
  now: Date,
): RevealState {
  const at = revealAt ? new Date(revealAt) : null;
  switch (revealOverride) {
    case "open":
      return { revealed: true, reason: "forced-open", revealAt: at };
    case "auto": {
      const due = at !== null && now.getTime() >= at.getTime();
      return { revealed: due, reason: due ? "auto" : "pending", revealAt: at };
    }
    default:
      // "closed", or anything unexpected: hidden is the safe side.
      return { revealed: false, reason: "forced-closed", revealAt: at };
  }
}
