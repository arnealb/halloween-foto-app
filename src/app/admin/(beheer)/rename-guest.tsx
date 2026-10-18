"use client";

import { useActionState } from "react";
import { renameGuestAction, type RenameState } from "../actions";

/**
 * "Hernoemen" for one Gast: a <details> disclosure, so it opens without
 * JavaScript too. The parent keys it on the name, so it closes again after a
 * successful rename.
 */
export function RenameGuest({
  guestId,
  name,
  maxLength,
}: {
  guestId: string;
  name: string;
  maxLength: number;
}) {
  const [state, formAction, pending] = useActionState<RenameState, FormData>(
    renameGuestAction,
    {},
  );
  const inputId = `rename-${guestId}`;

  return (
    <details className="group" open={state.error ? true : undefined}>
      <summary className="w-fit cursor-pointer list-none text-sm text-accent hover:underline [&::-webkit-details-marker]:hidden">
        <span className="group-open:hidden">Hernoemen</span>
        <span className="hidden group-open:inline">Annuleren</span>
      </summary>
      <form action={formAction} noValidate className="mt-2 flex flex-col gap-2">
        <input type="hidden" name="guestId" value={guestId} />
        <label htmlFor={inputId} className="sr-only">
          Nieuwe naam voor {name}
        </label>
        <div className="flex gap-2">
          <input
            key={state.name ?? name}
            id={inputId}
            name="name"
            type="text"
            defaultValue={state.name ?? name}
            maxLength={maxLength}
            autoCapitalize="words"
            enterKeyHint="done"
            aria-invalid={state.error ? true : undefined}
            aria-describedby={state.error ? `${inputId}-error` : undefined}
            className="h-11 min-w-0 flex-1 rounded-xl border border-stone-700 bg-stone-950 px-3 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent/40 aria-invalid:border-red-500"
          />
          <button
            type="submit"
            disabled={pending}
            className="h-11 shrink-0 rounded-xl bg-accent px-4 font-semibold text-stone-950 disabled:opacity-60"
          >
            {pending ? "Bezig…" : "Opslaan"}
          </button>
        </div>
        {state.error && (
          <p id={`${inputId}-error`} role="alert" className="text-sm font-medium text-red-400">
            {state.error}
          </p>
        )}
      </form>
    </details>
  );
}
