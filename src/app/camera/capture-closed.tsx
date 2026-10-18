/** "Fotograferen is gesloten": shown instead of the viewfinder while the Host has it closed. */
export function CaptureClosed({
  title,
  remaining,
  perGuest,
}: {
  title: string;
  remaining: number;
  perGuest: number;
}) {
  return (
    <section className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
      <span className="text-sm font-semibold uppercase tracking-[0.2em] text-accent">{title}</span>
      <h1 className="text-4xl font-bold tracking-tight">Fotograferen is gesloten</h1>
      <p className="text-lg text-stone-300">
        De host heeft het fotograferen gesloten. Je kunt nu geen nieuwe foto&apos;s maken.
      </p>
      <p className="text-stone-400">
        Je hebt nog <span className="font-mono tabular-nums">{remaining} / {perGuest}</span>{" "}
        shots over. Gaat het fotograferen weer open, dan zie je hier vanzelf de camera.
      </p>
    </section>
  );
}
