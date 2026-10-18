"use client";

import { useActionState, type ReactNode } from "react";
import {
  updateSettingsAction,
  type SettingsFormState,
  type SettingsFormValues,
} from "../../actions";

type Field = keyof SettingsFormValues;

const inputClass =
  "w-full rounded-xl border border-stone-700 bg-stone-950 px-3 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent/40 aria-invalid:border-red-500";

/** Title, welcome text, accent color and Rolletje size, with inline errors. */
export function SettingsForm({
  settings,
  version,
  limits,
}: {
  settings: SettingsFormValues;
  /** Settings version; a change (also from elsewhere) refreshes the fields. */
  version: number;
  limits: { title: number; welcomeText: number; shotsPerGuest: number };
}) {
  const [state, formAction, pending] = useActionState<SettingsFormState, FormData>(
    updateSettingsAction,
    { submissions: 0 },
  );
  const values = state.values ?? settings;
  const errors = state.fieldErrors ?? {};

  const describedBy = (field: Field, hint?: boolean) =>
    [errors[field] ? `${field}-error` : null, hint ? `${field}-hint` : null]
      .filter(Boolean)
      .join(" ") || undefined;

  return (
    // Remount after every submission and settings change, so the fields show
    // what was saved (or, after an error, what was submitted).
    <form
      key={`${version}-${state.submissions}`}
      action={formAction}
      noValidate
      className="flex flex-col gap-5"
    >
      <input type="hidden" name="settingsVersion" value={version} />
      <Row field="title" label="Feestnaam" error={errors.title}>
        <input
          id="title"
          name="title"
          type="text"
          defaultValue={values.title}
          maxLength={limits.title}
          required
          autoCapitalize="sentences"
          aria-invalid={errors.title ? true : undefined}
          aria-describedby={describedBy("title")}
          className={`h-12 ${inputClass}`}
        />
      </Row>

      <Row
        field="welcomeText"
        label="Welkomsttekst"
        error={errors.welcomeText}
        hint={`Optioneel, maximaal ${limits.welcomeText} tekens. Staat op de aanmeldpagina en de camera.`}
      >
        <textarea
          id="welcomeText"
          name="welcomeText"
          defaultValue={values.welcomeText}
          maxLength={limits.welcomeText}
          rows={3}
          aria-invalid={errors.welcomeText ? true : undefined}
          aria-describedby={describedBy("welcomeText", true)}
          className={`py-2 ${inputClass}`}
        />
      </Row>

      <div className="grid gap-5 sm:grid-cols-2">
        <Row field="accentColor" label="Accentkleur" error={errors.accentColor}>
          <input
            id="accentColor"
            name="accentColor"
            type="color"
            defaultValue={values.accentColor}
            aria-invalid={errors.accentColor ? true : undefined}
            aria-describedby={describedBy("accentColor")}
            className={`h-12 cursor-pointer p-1 ${inputClass}`}
          />
        </Row>

        <Row
          field="shotsPerGuest"
          label="Foto's per gast"
          error={errors.shotsPerGuest}
          hint={`1 tot en met ${limits.shotsPerGuest}. Geldt meteen voor iedereen, ook voor gasten die al bezig zijn.`}
        >
          <input
            id="shotsPerGuest"
            name="shotsPerGuest"
            type="number"
            inputMode="numeric"
            min={1}
            max={limits.shotsPerGuest}
            step={1}
            defaultValue={values.shotsPerGuest}
            required
            aria-invalid={errors.shotsPerGuest ? true : undefined}
            aria-describedby={describedBy("shotsPerGuest", true)}
            className={`h-12 tabular-nums ${inputClass}`}
          />
        </Row>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="h-12 w-full rounded-xl bg-accent px-6 font-semibold text-stone-950 disabled:opacity-60 sm:w-auto"
        >
          {pending ? "Bezig…" : "Opslaan"}
        </button>
        <p role="status" className="text-sm font-medium">
          {state.saved && <span className="text-green-400">Opgeslagen.</span>}
          {state.error && <span className="text-red-400">{state.error}</span>}
          {state.fieldErrors && (
            <span className="text-red-400">Niet opgeslagen: controleer de velden hierboven.</span>
          )}
        </p>
      </div>
    </form>
  );
}

function Row({
  field,
  label,
  error,
  hint,
  children,
}: {
  field: Field;
  label: string;
  error?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={field} className="text-sm font-medium text-stone-300">
        {label}
      </label>
      {children}
      {error && (
        <p id={`${field}-error`} className="text-sm font-medium text-red-400">
          {error}
        </p>
      )}
      {hint && (
        <p id={`${field}-hint`} className="text-sm text-stone-500">
          {hint}
        </p>
      )}
    </div>
  );
}
