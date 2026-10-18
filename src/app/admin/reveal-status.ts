import type { RevealState } from "@/party-camera";
import { formatPartyMoment } from "../party-time";

/** How the Admin describes the Reveal state: a short label plus a sentence. */
export interface RevealStatus {
  label: string;
  detail: string;
  revealed: boolean;
}

export function describeReveal({ reason, revealAt }: RevealState): RevealStatus {
  const at = revealAt ? formatPartyMoment(revealAt) : null;
  switch (reason) {
    case "forced-open":
      return {
        revealed: true,
        label: "Onthuld: handmatig",
        detail: "Iedereen met de galerij-link ziet de foto's, ongeacht het ingestelde moment.",
      };
    case "auto":
      return {
        revealed: true,
        label: "Onthuld: automatisch",
        detail: `Onthuld sinds ${at}. Iedereen met de galerij-link ziet de foto's.`,
      };
    case "forced-closed":
      return {
        revealed: false,
        label: "Verborgen: handmatig",
        detail: at
          ? `Het ingestelde moment (${at}) telt niet zolang je de galerij verborgen houdt.`
          : "De galerij blijft dicht tot je hem onthult of terugzet op automatisch.",
      };
    case "pending":
      return at
        ? {
            revealed: false,
            label: `Verborgen tot ${at}`,
            detail: "Op dat moment wordt de galerij automatisch onthuld.",
          }
        : {
            revealed: false,
            label: "Verborgen: geen moment ingesteld",
            detail: "Stel een moment in, of onthul de galerij handmatig.",
          };
  }
}
