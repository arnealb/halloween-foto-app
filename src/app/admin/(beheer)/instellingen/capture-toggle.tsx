"use client";

import { useActionState } from "react";
import { setCaptureOpenAction, type CaptureFormState } from "../../actions";

/** Fotograferen open/dicht: the current status and one button to switch it. */
export function CaptureToggle({ captureOpen }: { captureOpen: boolean }) {
  const [state, formAction, pending] = useActionState<CaptureFormState, FormData>(
    setCaptureOpenAction,
    {},
  );

  return (
    <section
      aria-labelledby="capture-heading"
      className="flex flex-col gap-3 rounded-2xl bg-stone-900 p-4"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 id="capture-heading" className="text-lg font-semibold">
          Fotograferen
        </h2>
        <span
          role="status"
          className={`flex items-center gap-2 rounded-full px-3 py-1 text-sm font-semibold ${
            captureOpen ? "bg-green-500/15 text-green-400" : "bg-red-500/15 text-red-400"
          }`}
        >
          <span
            aria-hidden="true"
            className={`size-2 rounded-full ${captureOpen ? "bg-green-400" : "bg-red-400"}`}
          />
          {captureOpen ? "Open" : "Gesloten"}
        </span>
      </div>
      <p className="text-sm text-stone-400">
        {captureOpen
          ? "Gasten kunnen foto's maken. Sluit het fotograferen om geen nieuwe foto's meer toe te laten; foto's die al onderweg zijn worden nog opgeslagen."
          : "Gasten kunnen geen nieuwe foto's maken en zien dat het fotograferen gesloten is."}
      </p>
      <form action={formAction}>
        <input type="hidden" name="captureOpen" value={captureOpen ? "false" : "true"} />
        <button
          type="submit"
          disabled={pending}
          className={`h-12 w-full rounded-xl px-4 font-semibold disabled:opacity-60 sm:w-auto ${
            captureOpen
              ? "border border-red-500/60 text-red-300 hover:bg-red-500/10"
              : "bg-accent text-stone-950"
          }`}
        >
          {pending ? "Bezig…" : captureOpen ? "Fotograferen sluiten" : "Fotograferen openen"}
        </button>
      </form>
      {state.error && (
        <p role="alert" className="text-sm font-medium text-red-400">
          {state.error}
        </p>
      )}
    </section>
  );
}
