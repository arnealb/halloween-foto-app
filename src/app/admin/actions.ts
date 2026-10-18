"use server";

import { headers } from "next/headers";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { isPartyCameraError } from "@/party-camera";
import {
  endAdminSession,
  isHostPassword,
  startAdminSession,
} from "@/server/admin-session";
import { ADMIN_LOGIN_PATH, requireHost } from "@/server/host";
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
