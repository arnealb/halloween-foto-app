/** Neutral loading state shown while the Gast's cookie and settings are read. */
export function Splash() {
  return (
    <main className="flex flex-1 items-center justify-center" aria-busy="true">
      <span className="sr-only">Laden…</span>
      <span className="size-10 animate-pulse rounded-full border-4 border-stone-700" />
    </main>
  );
}
