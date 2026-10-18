import "server-only";

import { redirect } from "next/navigation";
import { hostCamera, type HostPartyCamera } from "./party-camera";

/** Where an admin page sends a visitor without a valid admin session. */
export const ADMIN_LOGIN_PATH = "/admin/login";

/**
 * Host operations for an admin page or Server Action: the PartyCamera if the
 * admin cookie is valid, otherwise a redirect to the login page (nothing
 * after this call runs). Route handlers use `hostCamera()` and answer 401.
 */
export async function requireHost(): Promise<HostPartyCamera> {
  const camera = await hostCamera();
  if (!camera) redirect(ADMIN_LOGIN_PATH);
  return camera;
}
