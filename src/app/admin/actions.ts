"use server";

import { headers } from "next/headers";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import {
  InvalidSettingsError,
  isPartyCameraError,
  type RevealOverride,
  type SettingsFieldErrors,
} from "@/party-camera";
import {
  endAdminSession,
  isHostPassword,
  startAdminSession,
} from "@/server/admin-session";
import { ADMIN_LOGIN_PATH, requireHost } from "@/server/host";
import { fromPartyLocalInput } from "../party-time";
import {
  loginLockout,
  recordLoginFailure,
  recordLoginSuccess,
} from "@/server/login-throttle";

// Every action that touches host data starts with requireHost(): Server
// Actions are reachable by a direct POST, so rendering them only on admin
// pages protects nothing.

export interface LoginState {
  error?: string;
}

/** Wrong passwords answer slowly, to make guessing tedious. */
const FAILED_LOGIN_DELAY_MS = 600;

/** The Host logs in with the host password; sets the admin cookie. */
export async function loginAction(
  _previous: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const client = clientAddress(await headers());
  const wait = loginLockout(client);
  if (wait > 0) {
    return {
      error: `Te veel foute pogingen. Probeer het over ${Math.ceil(wait / 1000)} seconden opnieuw.`,
    };
  }

  const password = formData.get("password");
  if (typeof password !== "string" || !isHostPassword(password)) {
    recordLoginFailure(client);
    await new Promise((resolve) => setTimeout(resolve, FAILED_LOGIN_DELAY_MS));
    return { error: "Dat wachtwoord klopt niet." };
  }

  recordLoginSuccess(client);
  await startAdminSession();
  redirect("/admin");
}

export async function logoutAction(): Promise<void> {
  await endAdminSession();
  redirect(ADMIN_LOGIN_PATH);
}

export type PhotoActionResult = { ok: true } | { ok: false; error: string };

/** Hide a photo from the Galerij (`hidden: true`) or show it again. */
export async function setPhotoHiddenAction(
  photoId: string,
  hidden: boolean,
): Promise<PhotoActionResult> {
  const camera = await requireHost();
  return photoAction(() =>
    hidden ? camera.hidePhoto(String(photoId)) : camera.unhidePhoto(String(photoId)),
  );
}

/** Delete a photo for good (record and all bytes). */
export async function deletePhotoAction(photoId: string): Promise<PhotoActionResult> {
  const camera = await requireHost();
  return photoAction(() => camera.deletePhoto(String(photoId)));
}

export interface RenameState {
  error?: string;
  /** Echo of the submitted name, so the field keeps its value after an error. */
  name?: string;
  /** Set after a successful rename. */
  renamedTo?: string;
}

/** Give a Gast another name. Form fields: `guestId`, `name`. */
export async function renameGuestAction(
  _previous: RenameState,
  formData: FormData,
): Promise<RenameState> {
  const camera = await requireHost();
  const guestId = String(formData.get("guestId") ?? "");
  const name = String(formData.get("name") ?? "");
  try {
    const guest = await camera.renameGuest(guestId, name);
    refresh();
    return { renamedTo: guest.name };
  } catch (error) {
    if (isPartyCameraError(error, "InvalidName")) return { error: error.message, name };
    if (isPartyCameraError(error, "UnknownGuest")) {
      refresh();
      return { error: "Deze gast bestaat niet meer.", name };
    }
    console.error("renameGuestAction failed", error);
    return { error: "Er ging iets mis. Probeer het opnieuw.", name };
  }
}

/** The settings form as submitted, echoed back after an error. */
export interface SettingsFormValues {
  title: string;
  welcomeText: string;
  accentColor: string;
  shotsPerGuest: string;
}

export interface SettingsFormState {
  /** Counts submissions, so every result is a new state. */
  submissions: number;
  /** Set after a successful save. */
  saved?: boolean;
  /** Per field, in Dutch. */
  fieldErrors?: SettingsFieldErrors;
  /** An error not tied to a field. */
  error?: string;
  values?: SettingsFormValues;
}

/**
 * Save the Event settings. Form fields: `title`, `welcomeText`,
 * `accentColor`, `shotsPerGuest`, and `settingsVersion` (the version the form
 * was shown with: a save over a newer change is refused). PartyCamera
 * validates; this only parses.
 */
export async function updateSettingsAction(
  previous: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  const camera = await requireHost();
  const submissions = (previous?.submissions ?? 0) + 1;
  const values: SettingsFormValues = {
    title: String(formData.get("title") ?? ""),
    welcomeText: String(formData.get("welcomeText") ?? ""),
    accentColor: String(formData.get("accentColor") ?? ""),
    shotsPerGuest: String(formData.get("shotsPerGuest") ?? ""),
  };
  const shots = values.shotsPerGuest.trim();
  const version = String(formData.get("settingsVersion") ?? "");
  try {
    await camera.updateSettings(
      {
        title: values.title,
        welcomeText: values.welcomeText,
        accentColor: values.accentColor,
        // Only plain digits; anything else is passed on as NaN and refused.
        shotsPerGuest: /^\d{1,6}$/.test(shots) ? Number(shots) : Number.NaN,
      },
      {
        // Anything but plain digits is treated as an outdated form.
        expectedVersion: /^\d{1,9}$/.test(version) ? Number(version) : Number.NaN,
      },
    );
    refresh();
    return { submissions, saved: true };
  } catch (error) {
    if (error instanceof InvalidSettingsError) {
      return { submissions, fieldErrors: error.fieldErrors, values };
    }
    if (isPartyCameraError(error, "SettingsChanged")) {
      return { submissions, error: error.message, values };
    }
    console.error("updateSettingsAction failed", error);
    return {
      submissions,
      error: "Er ging iets mis. Probeer het opnieuw.",
      values,
    };
  }
}

export interface CaptureFormState {
  error?: string;
}

/** Open or close fotograferen. Form field `captureOpen`: "true" or "false". */
export async function setCaptureOpenAction(
  _previous: CaptureFormState,
  formData: FormData,
): Promise<CaptureFormState> {
  const camera = await requireHost();
  const value = formData.get("captureOpen");
  if (value !== "true" && value !== "false") return { error: "Ongeldige keuze." };
  try {
    await camera.updateSettings({ captureOpen: value === "true" });
    refresh();
    return {};
  } catch (error) {
    console.error("setCaptureOpenAction failed", error);
    return { error: "Er ging iets mis. Probeer het opnieuw." };
  }
}

export interface RevealOverrideState {
  error?: string;
}

const REVEAL_OVERRIDES: readonly string[] = ["auto", "open", "closed"] satisfies RevealOverride[];

/**
 * "Nu onthullen" / "verborgen houden" / "automatisch". Form field `override`:
 * `open`, `closed` or `auto`. The requested value is the whole intent, so no
 * version check.
 */
export async function setRevealOverrideAction(
  _previous: RevealOverrideState,
  formData: FormData,
): Promise<RevealOverrideState> {
  const camera = await requireHost();
  const override = String(formData.get("override") ?? "");
  if (!REVEAL_OVERRIDES.includes(override)) return { error: "Ongeldige keuze." };
  try {
    await camera.setRevealOverride(override as RevealOverride);
    refresh();
    return {};
  } catch (error) {
    console.error("setRevealOverrideAction failed", error);
    return { error: "Er ging iets mis. Probeer het opnieuw." };
  }
}

export interface RevealAtFormState {
  /** Counts submissions, so every result is a new state. */
  submissions: number;
  saved?: boolean;
  error?: string;
}

/**
 * Set or clear the Reveal moment. Form fields: `revealAt` (a datetime-local
 * value in the party's time zone; stored as UTC), `intent` (`save` or
 * `clear`) and `settingsVersion` (the version the form was shown with).
 */
export async function updateRevealAtAction(
  previous: RevealAtFormState,
  formData: FormData,
): Promise<RevealAtFormState> {
  const camera = await requireHost();
  const submissions = (previous?.submissions ?? 0) + 1;
  const value = String(formData.get("revealAt") ?? "");
  const clear = formData.get("intent") === "clear";
  const version = String(formData.get("settingsVersion") ?? "");

  let revealAt: Date | null = null;
  if (!clear) {
    if (value.trim() === "") {
      return { submissions, error: "Kies een datum en tijd, of wis het moment." };
    }
    revealAt = fromPartyLocalInput(value);
    if (!revealAt) {
      return { submissions, error: "Kies een geldige datum en tijd voor de onthulling." };
    }
  }
  try {
    await camera.updateSettings(
      { revealAt },
      { expectedVersion: /^\d{1,9}$/.test(version) ? Number(version) : Number.NaN },
    );
    refresh();
    return { submissions, saved: true };
  } catch (error) {
    if (error instanceof InvalidSettingsError) {
      return {
        submissions,
        error: error.fieldErrors.revealAt ?? error.message,
      };
    }
    if (isPartyCameraError(error, "SettingsChanged")) {
      return { submissions, error: error.message };
    }
    console.error("updateRevealAtAction failed", error);
    return { submissions, error: "Er ging iets mis. Probeer het opnieuw." };
  }
}

export interface PrepareGalleryState {
  /** Batches run so far in this run. */
  batches: number;
  photos: number;
  rendered: number;
  removed: number;
  failed: number;
  /** Where the next batch starts; null when done (or not started). */
  nextCursor: string | null;
  done: boolean;
  error?: string;
}

/**
 * "Galerij voorbereiden": one batch per call (the client calls again with
 * `cursor` until done; without JavaScript, each press does one batch).
 * Form fields: `cursor` (empty for a fresh run).
 */
export async function prepareGalleryAction(
  previous: PrepareGalleryState,
  formData: FormData,
): Promise<PrepareGalleryState> {
  const camera = await requireHost();
  const cursor = String(formData.get("cursor") ?? "");
  const base =
    cursor && previous && !previous.done
      ? previous
      : { batches: 0, photos: 0, rendered: 0, removed: 0, failed: 0 };
  try {
    const batch = await camera.prepareGallery({ cursor: cursor || undefined });
    return {
      batches: base.batches + 1,
      photos: base.photos + batch.photos,
      rendered: base.rendered + batch.rendered,
      removed: base.removed + batch.removed,
      failed: base.failed + batch.failed,
      nextCursor: batch.nextCursor,
      done: batch.nextCursor === null,
    };
  } catch (error) {
    console.error("prepareGalleryAction failed", error);
    return {
      ...base,
      nextCursor: cursor || null,
      done: false,
      error: "Er ging iets mis. Probeer het opnieuw; wat al klaar is, blijft klaar.",
    };
  }
}

async function photoAction(run: () => Promise<void>): Promise<PhotoActionResult> {
  try {
    await run();
    refresh();
    return { ok: true };
  } catch (error) {
    if (isPartyCameraError(error, "UnknownPhoto")) {
      refresh();
      return { ok: false, error: "Deze foto bestaat niet meer." };
    }
    console.error("photo action failed", error);
    return { ok: false, error: "Er ging iets mis. Probeer het opnieuw." };
  }
}

/** Best guess of the client's address, for login throttling only. */
function clientAddress(requestHeaders: Headers): string {
  const forwarded = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || requestHeaders.get("x-real-ip") || "unknown";
}
