"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import type { RevealOverride } from "@/party-camera";
import {
  setRevealOverrideAction,
  updateRevealAtAction,
  type RevealAtFormState,
  type RevealOverrideState,
} from "../../actions";
import type { RevealStatus } from "../../reveal-status";

const OVERRIDES: { value: RevealOverride; label: string; hint: string }[] = [
  { value: "open", label: "Nu onthullen", hint: "Meteen zichtbaar, ongeacht het moment." },
  { value: "closed", label: "Verborgen houden", hint: "Dicht, ook als het moment voorbij is." },
  { value: "auto", label: "Automatisch", hint: "Het ingestelde moment telt." },
];

const inputClass =
  "w-full rounded-xl border border-stone-700 bg-stone-950 px-3 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent/40 aria-invalid:border-red-500";

/** The Reveal: status, the moment (in the party's time zone) and the three overrides. */
export function RevealPanel({
  status,
  override,
  revealAtInput,
  version,
}: {
  status: RevealStatus;
  override: RevealOverride;
  /** The moment as a datetime-local value in the party's zone, or "" when none is set. */
  revealAtInput: string;
  /** Settings version the moment is saved against (a change elsewhere is detected). */
  version: number;
}) {
  const [overrideState, overrideAction, overridePending] = useActionState<
    RevealOverrideState,
    FormData
  >(setRevealOverrideAction, {});
  const [atState, atAction, atPending] = useActionState<RevealAtFormState, FormData>(
    updateRevealAtAction,
    { submissions: 0 },
  );
  // What the Host typed and has not saved yet; null shows the saved moment.
  // Kept across other changes (an override click, a refresh), so nothing
  // typed is lost; dropped once a save succeeds.
  const [draft, setDraft] = useState<string | null>(null);
  const [handled, setHandled] = useState(atState);
  if (handled !== atState) {
    setHandled(atState);
    if (atState.saved) setDraft(null);
  }
  const value = draft ?? revealAtInput;

  return (
    <section
      aria-labelledby="reveal-heading"
      className="flex flex-col gap-4 rounded-2xl bg-stone-900 p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="reveal-heading" className="text-lg font-semibold">
          Onthulling
        </h2>
        <span
          role="status"
          className={`flex items-center gap-2 rounded-full px-3 py-1 text-sm font-semibold ${
            status.revealed ? "bg-green-500/15 text-green-400" : "bg-amber-500/15 text-amber-300"
          }`}
        >
          <span
            aria-hidden="true"
            className={`size-2 rounded-full ${status.revealed ? "bg-green-400" : "bg-amber-300"}`}
          />
          {status.label}
        </span>
      </div>
      <p className="text-sm text-stone-400">
        {status.detail}{" "}
        <Link href="/galerij" className="text-stone-200 underline underline-offset-4">
          Galerij openen
        </Link>
      </p>

      <form
        action={atAction}
        noValidate
        className="flex flex-col gap-2"
      >
        <input type="hidden" name="settingsVersion" value={version} />
        <label htmlFor="revealAt" className="text-sm font-medium text-stone-300">
          Moment van de onthulling
        </label>
        <div className="flex flex-wrap gap-2">
          <input
            id="revealAt"
            name="revealAt"
            type="datetime-local"
            value={value}
            onChange={(event) => setDraft(event.target.value)}
            aria-invalid={atState.error ? true : undefined}
            aria-describedby="revealAt-hint"
            className={`h-12 min-w-0 flex-1 basis-56 ${inputClass}`}
          />
          <button
            type="submit"
            name="intent"
            value="save"
            disabled={atPending}
            className="h-12 rounded-xl bg-accent px-5 font-semibold text-stone-950 disabled:opacity-60"
          >
            {atPending ? "Bezig…" : "Opslaan"}
          </button>
          {revealAtInput && (
            <button
              type="submit"
              name="intent"
              value="clear"
              disabled={atPending}
              className="h-12 rounded-xl bg-stone-800 px-4 font-medium disabled:opacity-60"
            >
              Wissen
            </button>
          )}
        </div>
        <p id="revealAt-hint" className="text-sm text-stone-500">
          Belgische tijd. Zonder moment blijft de galerij dicht tot je hem handmatig onthult.
        </p>
        <p role="status" className="text-sm font-medium">
          {atState.saved && <span className="text-green-400">Opgeslagen.</span>}
          {atState.error && <span className="text-red-400">{atState.error}</span>}
        </p>
      </form>

      <form action={overrideAction} className="flex flex-col gap-2">
        <p className="text-sm font-medium text-stone-300">Handmatig</p>
        <div className="grid gap-2 sm:grid-cols-3">
          {OVERRIDES.map((option) => {
            const active = option.value === override;
            return (
              <button
                key={option.value}
                type="submit"
                name="override"
                value={option.value}
                disabled={overridePending || active}
                aria-pressed={active}
                className={`flex flex-col items-start rounded-xl border px-4 py-3 text-left disabled:cursor-default ${
                  active
                    ? "border-accent bg-accent/10"
                    : "border-stone-700 hover:bg-stone-800 disabled:opacity-60"
                }`}
              >
                <span className="font-semibold">
                  {option.label}
                  {active && <span className="sr-only"> (actief)</span>}
                </span>
                <span className="text-xs text-stone-400">{option.hint}</span>
              </button>
            );
          })}
        </div>
        {overrideState.error && (
          <p role="alert" className="text-sm font-medium text-red-400">
            {overrideState.error}
          </p>
        )}
      </form>
    </section>
  );
}
