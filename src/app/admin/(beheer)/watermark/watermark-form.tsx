"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { SettingsFieldErrors, WatermarkPosition } from "@/party-camera";
import type { WatermarkSaveResult, WatermarkSaveStatus } from "./save-result";

const SAVE_URL = "/api/admin/watermark";

const inputClass =
  "w-full rounded-xl border border-stone-700 bg-stone-950 px-3 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent/40 aria-invalid:border-red-500";

const CORNERS: { value: WatermarkPosition; label: string; place: string }[] = [
  { value: "top-left", label: "Linksboven", place: "items-start justify-start" },
  { value: "top-right", label: "Rechtsboven", place: "items-start justify-end" },
  { value: "bottom-left", label: "Linksonder", place: "items-end justify-start" },
  { value: "bottom-right", label: "Rechtsonder", place: "items-end justify-end" },
];

/** Wait this long after the last change before asking for a new preview. */
const PREVIEW_DEBOUNCE_MS = 350;

const SAVED_MESSAGE = "Opgeslagen. De galerij toont het nieuwe watermark binnen een minuut.";

/** Messages after a save without JavaScript (the route redirects back with `?watermark=`). */
const STATUS_MESSAGES: Record<WatermarkSaveStatus, { ok: boolean; text: string }> = {
  opgeslagen: { ok: true, text: SAVED_MESSAGE },
  ongeldig: {
    ok: false,
    text: "Niet opgeslagen: een of meer waarden zijn ongeldig (een logo mag maximaal 2 MB zijn). Kies het logo zo nodig opnieuw.",
  },
  gewijzigd: {
    ok: false,
    text: "Niet opgeslagen: de instellingen zijn intussen gewijzigd. Controleer ze en kies het logo zo nodig opnieuw.",
  },
  fout: { ok: false, text: "Er ging iets mis. Probeer het opnieuw en kies het logo zo nodig opnieuw." },
};

interface Values {
  enabled: boolean;
  text: string;
  position: string;
  scale: string;
  opacity: string;
}

/**
 * The Watermark settings with a live preview. Works as a plain multipart form
 * posted to `POST /api/admin/watermark` without JavaScript; with JavaScript it
 * saves through fetch (the fields, logo file included, stay as they are after
 * an error) and every change asks the server for a preview, rendered by the
 * same function as the Galerij.
 */
export function WatermarkForm({
  values,
  hasLogo,
  version,
  limits,
  status,
}: {
  values: Values;
  hasLogo: boolean;
  version: number;
  limits: { text: number; scale: [number, number]; opacity: [number, number] };
  /** Outcome of a save without JavaScript, from the URL. */
  status?: WatermarkSaveStatus;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<WatermarkSaveResult | null>(null);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setResult(null);
    try {
      const response = await fetch(SAVE_URL, {
        method: "POST",
        body: new FormData(event.currentTarget),
        headers: { Accept: "application/json" },
      });
      if (response.status === 401) {
        router.push("/admin/login");
        return;
      }
      const body = (await response.json().catch(() => null)) as WatermarkSaveResult | null;
      setResult(body ?? { saved: false, error: "Er ging iets mis. Probeer het opnieuw." });
      // New settings version: the page re-renders and the fields remount.
      if (body?.saved) router.refresh();
    } catch {
      setResult({ saved: false, error: "Er ging iets mis. Controleer de verbinding en probeer het opnieuw." });
    } finally {
      setPending(false);
    }
  }

  return (
    // Remount after every saved change, so the fields show what was saved.
    <WatermarkFields
      key={version}
      onSubmit={save}
      pending={pending}
      values={values}
      hasLogo={hasLogo}
      version={version}
      limits={limits}
      errors={(result?.saved === false && result.fieldErrors) || {}}
      message={
        result
          ? result.saved
            ? { ok: true, text: SAVED_MESSAGE }
            : {
                ok: false,
                text: result.error ?? "Niet opgeslagen: controleer de velden hierboven.",
              }
          : status
            ? STATUS_MESSAGES[status]
            : null
      }
    />
  );
}

function WatermarkFields({
  onSubmit,
  pending,
  values,
  hasLogo,
  version,
  limits,
  errors,
  message,
}: {
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  pending: boolean;
  values: Values;
  hasLogo: boolean;
  version: number;
  limits: { text: number; scale: [number, number]; opacity: [number, number] };
  errors: SettingsFieldErrors;
  message: { ok: boolean; text: string } | null;
}) {
  const form = useRef<HTMLFormElement>(null);
  const [scale, setScale] = useState(values.scale);
  const [opacity, setOpacity] = useState(values.opacity);
  // Bumped on every change; the preview follows it (debounced).
  const [revision, setRevision] = useState(0);
  const [preview, setPreview] = useState<{ url: string; sample: string } | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      if (!form.current) return;
      setLoading(true);
      try {
        const response = await fetch("/api/admin/watermark/preview", {
          method: "POST",
          body: new FormData(form.current),
          signal: controller.signal,
        });
        if (response.ok) {
          const url = URL.createObjectURL(await response.blob());
          const sample = response.headers.get("X-Preview-Sample") ?? "";
          setPreview((previous) => {
            if (previous) URL.revokeObjectURL(previous.url);
            return { url, sample };
          });
          setPreviewError(null);
        } else if (response.status === 409) {
          // Overtaken by a newer preview request: that one answers.
        } else if (response.status === 422 || response.status === 413) {
          const body = (await response.json()) as { fieldErrors?: SettingsFieldErrors };
          setPreviewError(Object.values(body.fieldErrors ?? {}).join(" ") || "Ongeldige instelling.");
        } else {
          setPreviewError("Het voorbeeld kon niet geladen worden.");
        }
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          setPreviewError("Het voorbeeld kon niet geladen worden.");
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, revision === 0 ? 0 : PREVIEW_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [revision]);

  // Free the last preview image when the form goes away.
  const last = useRef<string | null>(null);
  useEffect(() => {
    last.current = preview?.url ?? null;
  }, [preview]);
  useEffect(() => () => {
    if (last.current) URL.revokeObjectURL(last.current);
  }, []);

  const changed = () => setRevision((r) => r + 1);

  return (
    <form
      ref={form}
      action={SAVE_URL}
      method="post"
      encType="multipart/form-data"
      onSubmit={onSubmit}
      onChange={changed}
      noValidate
      className="flex flex-col gap-6"
    >
      <input type="hidden" name="settingsVersion" value={version} />

      <label className="flex items-center justify-between gap-4 rounded-2xl bg-stone-900 p-4">
        <span>
          <span className="block font-semibold">Watermark gebruiken</span>
          <span className="block text-sm text-stone-400">
            Uit: de galerij toont de foto&apos;s zonder watermark.
          </span>
        </span>
        <input
          type="checkbox"
          name="watermarkEnabled"
          defaultChecked={values.enabled}
          className="size-6 shrink-0 accent-(--color-accent)"
        />
      </label>

      <figure className="flex flex-col gap-2">
        <div className="relative overflow-hidden rounded-2xl bg-stone-900">
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element -- a blob: URL of a server render
            <img
              src={preview.url}
              alt="Voorbeeld van een galerijfoto met het watermark"
              className={`block h-auto w-full transition-opacity ${loading ? "opacity-70" : ""}`}
            />
          ) : (
            <div className="flex aspect-4/3 items-center justify-center text-sm text-stone-500">
              {previewError ? "Geen voorbeeld" : "Voorbeeld laden…"}
            </div>
          )}
        </div>
        <figcaption className="text-sm text-stone-500" role="status">
          {previewError ? (
            <span className="text-red-400">{previewError}</span>
          ) : preview?.sample === "photo" ? (
            "Voorbeeld op een echte feestfoto. Nog niet opgeslagen."
          ) : preview ? (
            "Voorbeeld op een voorbeeldafbeelding (er zijn nog geen foto's). Nog niet opgeslagen."
          ) : (
            "Het voorbeeld verschijnt hier."
          )}
        </figcaption>
      </figure>

      <Row
        id="watermarkText"
        label="Tekst"
        error={errors.watermarkText}
        hint={`Bijvoorbeeld “Arne 25 · 18.10.26”. Maximaal ${limits.text} tekens; emoji worden niet getoond.`}
      >
        <input
          id="watermarkText"
          name="watermarkText"
          type="text"
          defaultValue={values.text}
          maxLength={limits.text}
          aria-invalid={errors.watermarkText ? true : undefined}
          className={`h-12 ${inputClass}`}
        />
      </Row>

      <Row
        id="logo"
        label="Logo"
        error={errors.watermarkLogo}
        hint="Optioneel: een PNG of WebP (met transparantie), maximaal 2 MB. Staat links van de tekst."
      >
        <input
          id="logo"
          name="logo"
          type="file"
          accept="image/png,image/webp"
          aria-invalid={errors.watermarkLogo ? true : undefined}
          className="block w-full text-sm text-stone-300 file:mr-3 file:h-11 file:rounded-xl file:border-0 file:bg-stone-800 file:px-4 file:font-semibold file:text-stone-100"
        />
        {hasLogo && (
          <label className="mt-1 flex items-center gap-2 text-sm text-stone-300">
            <input type="checkbox" name="removeLogo" className="size-5 accent-(--color-accent)" />
            Huidig logo verwijderen
          </label>
        )}
      </Row>

      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1.5 text-sm font-medium text-stone-300">Hoek</legend>
        <div className="grid aspect-4/3 w-full max-w-60 grid-cols-2 gap-1 rounded-2xl border border-stone-700 p-1">
          {CORNERS.map((corner) => (
            <label
              key={corner.value}
              className={`flex cursor-pointer rounded-xl p-2 has-checked:bg-accent/15 has-focus-visible:ring-2 has-focus-visible:ring-accent ${corner.place}`}
            >
              <input
                type="radio"
                name="watermarkPosition"
                value={corner.value}
                defaultChecked={values.position === corner.value}
                className="peer sr-only"
              />
              <span className="rounded-md bg-stone-700 px-2 py-1 text-xs font-semibold text-stone-200 peer-checked:bg-accent peer-checked:text-stone-950">
                {corner.label}
              </span>
            </label>
          ))}
        </div>
        {errors.watermarkPosition && (
          <p className="text-sm font-medium text-red-400">{errors.watermarkPosition}</p>
        )}
      </fieldset>

      <Row
        id="watermarkScale"
        label={`Grootte: ${scale}% van de fotobreedte`}
        error={errors.watermarkScale}
      >
        <input
          id="watermarkScale"
          name="watermarkScale"
          type="range"
          min={limits.scale[0]}
          max={limits.scale[1]}
          step={1}
          defaultValue={values.scale}
          onInput={(event) => {
            setScale(event.currentTarget.value);
          }}
          className="h-10 w-full accent-(--color-accent)"
        />
      </Row>

      <Row
        id="watermarkOpacity"
        label={`Zichtbaarheid: ${opacity}%`}
        error={errors.watermarkOpacity}
      >
        <input
          id="watermarkOpacity"
          name="watermarkOpacity"
          type="range"
          min={limits.opacity[0]}
          max={limits.opacity[1]}
          step={5}
          defaultValue={values.opacity}
          onInput={(event) => {
            setOpacity(event.currentTarget.value);
          }}
          className="h-10 w-full accent-(--color-accent)"
        />
      </Row>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="h-12 w-full rounded-xl bg-accent px-6 font-semibold text-stone-950 disabled:opacity-60 sm:w-auto"
        >
          {pending ? "Bezig…" : "Opslaan"}
        </button>
        <p role="status" className="text-sm font-medium">
          {message && (
            <span className={message.ok ? "text-green-400" : "text-red-400"}>{message.text}</span>
          )}
        </p>
      </div>
    </form>
  );
}

function Row({
  id,
  label,
  error,
  hint,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-stone-300">
        {label}
      </label>
      {children}
      {error && <p className="text-sm font-medium text-red-400">{error}</p>}
      {hint && <p className="text-sm text-stone-500">{hint}</p>}
    </div>
  );
}
