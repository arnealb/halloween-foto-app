import { RevealNote, type RevealInfo } from "./reveal-note";

/** "Je rolletje is vol": shown after the last Shot and when a full Gast returns. */
export function RollFull({
  shotsPerGuest,
  reveal,
}: {
  shotsPerGuest: number;
  reveal: RevealInfo;
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
      <RevealNote reveal={reveal} className="text-stone-400" />
    </section>
  );
}
