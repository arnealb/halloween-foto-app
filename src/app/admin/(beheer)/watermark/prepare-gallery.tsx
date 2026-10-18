"use client";

import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import { prepareGalleryAction, type PrepareGalleryState } from "../../actions";

const INITIAL: PrepareGalleryState = {
  batches: 0,
  photos: 0,
  rendered: 0,
  removed: 0,
  failed: 0,
  nextCursor: null,
  done: false,
};

/**
 * "Galerij voorbereiden": renders the Galerij's images with the current
 * watermark, one small batch per request (so no request runs long), and
 * keeps asking for the next batch until done. Without JavaScript each press
 * does one batch and the button says "Verder".
 */
export function PrepareGallery({ visiblePhotos }: { visiblePhotos: number }) {
  const [state, formAction, pending] = useActionState(prepareGalleryAction, INITIAL);
  // Whether batches follow each other automatically (JavaScript only).
  const [running, setRunning] = useState(false);
  const [seen, setSeen] = useState(state);
  if (seen !== state) {
    setSeen(state);
    if (state.done || state.error || !state.nextCursor) setRunning(false);
  }
  // The cursor last asked for, so a re-run effect never sends a batch twice.
  const requested = useRef<string | null>(null);

  useEffect(() => {
    if (!running || state.done || state.error || !state.nextCursor) return;
    if (requested.current === state.nextCursor) return;
    requested.current = state.nextCursor;
    const next = new FormData();
    next.set("cursor", state.nextCursor);
    startTransition(() => formAction(next));
  }, [running, state, formAction]);

  const started = state.batches > 0 || state.error !== undefined;
  const continuing = started && !state.done && state.nextCursor !== null;
  const total = Math.max(visiblePhotos, state.photos);
  const progress = total > 0 ? Math.min(100, Math.round((state.photos / total) * 100)) : 100;
  const busy = pending || running;

  return (
    <section
      aria-labelledby="prepare-heading"
      className="flex flex-col gap-3 rounded-2xl bg-stone-900 p-4"
    >
      <h2 id="prepare-heading" className="text-lg font-semibold">
        Galerij voorbereiden
      </h2>
      <p className="text-sm text-stone-400">
        Maakt alle galerijfoto&apos;s ({visiblePhotos}) alvast aan met het huidige watermark, zodat
        de galerij meteen snel laadt. Doe dit na het wijzigen van het watermark. Kan veilig
        opnieuw: wat al klaar is, wordt overgeslagen.
      </p>
      <form
        action={formAction}
        onSubmit={() => {
          requested.current = null;
          setRunning(true);
        }}
      >
        <input type="hidden" name="cursor" value={continuing ? (state.nextCursor ?? "") : ""} />
        <button
          type="submit"
          disabled={busy}
          className="h-12 w-full rounded-xl bg-accent px-6 font-semibold text-stone-950 disabled:opacity-60 sm:w-auto"
        >
          {busy ? "Bezig…" : continuing ? "Verder" : "Galerij voorbereiden"}
        </button>
      </form>
      {started && (
        <div className="flex flex-col gap-2" role="status">
          <div
            className="h-2 overflow-hidden rounded-full bg-stone-800"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress}
            aria-label="Voortgang"
          >
            <div className="h-full bg-accent transition-[width]" style={{ width: `${progress}%` }} />
          </div>
          <p className="text-sm text-stone-300 tabular-nums">
            {state.done ? "Klaar: " : ""}
            {state.photos} van {total} foto&apos;s bekeken, {state.rendered} afbeeldingen gemaakt
            {state.removed > 0 && `, ${state.removed} oude opgeruimd`}
            {state.failed > 0 && `, ${state.failed} mislukt`}.
          </p>
          {state.error && <p className="text-sm font-medium text-red-400">{state.error}</p>}
        </div>
      )}
    </section>
  );
}
