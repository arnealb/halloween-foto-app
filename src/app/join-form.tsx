"use client";

import { useActionState } from "react";
import { joinAction, type JoinState } from "./actions";

export function JoinForm({ maxLength }: { maxLength: number }) {
  const [state, formAction, pending] = useActionState<JoinState, FormData>(
    joinAction,
    {},
  );

  return (
    <form action={formAction} noValidate className="flex flex-col gap-3">
      <label htmlFor="name" className="text-sm font-medium text-stone-300">
        Hoe heet je?
      </label>
      <input
        key={state.name ?? ""}
        id="name"
        name="name"
        type="text"
        defaultValue={state.name}
        maxLength={maxLength}
        autoComplete="given-name"
        autoCapitalize="words"
        enterKeyHint="go"
        placeholder="Je naam"
        aria-invalid={state.error ? true : undefined}
        aria-describedby={state.error ? "name-error" : "name-hint"}
        className="h-14 rounded-2xl border border-stone-700 bg-stone-900 px-4 text-lg text-stone-50 placeholder:text-stone-500 outline-none focus:border-accent focus:ring-2 focus:ring-accent/40 aria-invalid:border-red-500"
      />
      {state.error ? (
        <p id="name-error" role="alert" className="text-sm font-medium text-red-400">
          {state.error}
        </p>
      ) : (
        <p id="name-hint" className="text-sm text-stone-500">
          Je naam staat later bij je foto&apos;s in de galerij.
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="mt-2 h-14 rounded-2xl bg-accent text-lg font-semibold text-stone-950 shadow-lg shadow-accent/20 transition active:scale-[0.98] disabled:opacity-60"
      >
        {pending ? "Even geduld…" : "Start met fotograferen"}
      </button>
    </form>
  );
}
