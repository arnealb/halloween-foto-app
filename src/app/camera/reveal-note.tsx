import Link from "next/link";
import { formatPartyMoment } from "../party-time";

/** What a Gast knows about the Reveal, as the camera page passes it on. */
export interface RevealInfo {
  /** Whether the Galerij is open now. */
  revealed: boolean;
  /** ISO timestamp of the coming Reveal, or null when none is planned (or the Host holds it back). */
  revealAt: string | null;
}

/** When the photos are revealed, with a way to the Galerij. */
export function RevealNote({ reveal, className = "" }: { reveal: RevealInfo; className?: string }) {
  if (reveal.revealed) {
    return (
      <p className={className}>
        De foto&apos;s zijn onthuld!{" "}
        <Link href="/galerij" className="font-semibold text-accent underline underline-offset-4">
          Bekijk de galerij
        </Link>
      </p>
    );
  }
  return (
    <p className={className}>
      {reveal.revealAt ? (
        <>
          De foto&apos;s worden onthuld op{" "}
          <time dateTime={reveal.revealAt} className="font-semibold text-accent">
            {formatPartyMoment(new Date(reveal.revealAt))}
          </time>{" "}
          in de{" "}
          <Link href="/galerij" className="underline underline-offset-4">
            galerij
          </Link>
          .
        </>
      ) : (
        "De host maakt bekend wanneer de foto's onthuld worden."
      )}
    </p>
  );
}
