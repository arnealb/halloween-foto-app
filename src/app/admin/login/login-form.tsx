"use client";

import { useActionState } from "react";
import { loginAction, type LoginState } from "../actions";

export function LoginForm() {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(loginAction, {});

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <label htmlFor="password" className="text-sm font-medium text-stone-300">
        Wachtwoord
      </label>
      <input
        id="password"
        name="password"
        type="password"
        required
        autoComplete="current-password"
        enterKeyHint="go"
        aria-invalid={state.error ? true : undefined}
        aria-describedby={state.error ? "password-error" : undefined}
        className="h-14 rounded-2xl border border-stone-700 bg-stone-900 px-4 text-lg text-stone-50 outline-none focus:border-accent focus:ring-2 focus:ring-accent/40 aria-invalid:border-red-500"
      />
      {state.error && (
        <p id="password-error" role="alert" className="text-sm font-medium text-red-400">
          {state.error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="mt-2 h-14 rounded-2xl bg-accent text-lg font-semibold text-stone-950 transition active:scale-[0.98] disabled:opacity-60"
      >
        {pending ? "Even geduld…" : "Inloggen"}
      </button>
    </form>
  );
}
