/** Time zone of the party, so the Reveal time reads the same on server and phone. */
const PARTY_TIME_ZONE = "Europe/Amsterdam";

const revealFormat = new Intl.DateTimeFormat("nl-NL", {
  weekday: "long",
  day: "numeric",
  month: "long",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: PARTY_TIME_ZONE,
});

/** "Je rolletje is vol": shown after the last Shot and when a full Gast returns. */
export function RollFull({
  shotsPerGuest,
  revealAt,
}: {
  shotsPerGuest: number;
  /** ISO timestamp of the Reveal, or null when the Host has not set one. */
  revealAt: string | null;
}) {
  return (
    <section className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
      <span className="font-mono text-sm tabular-nums text-stone-400">
        0 / {shotsPerGuest}
      </span>
      <h1 className="text-4xl font-bold tracking-tight">Je rolletje is vol</h1>
      <p className="text-lg text-stone-300">
        Al je {shotsPerGuest} foto&apos;s zijn veilig opgeslagen.
      </p>
      <p className="text-stone-400">
        {revealAt ? (
          <>
            De foto&apos;s worden onthuld op{" "}
            <time dateTime={revealAt} className="font-semibold text-accent">
              {revealFormat.format(new Date(revealAt))}
            </time>
            .
          </>
        ) : (
          "De host maakt bekend wanneer de foto's onthuld worden."
        )}
      </p>
    </section>
  );
}
