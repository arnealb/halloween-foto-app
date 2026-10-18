"use server";

import { redirect } from "next/navigation";
import { isPartyCameraError } from "@/party-camera";
import { prepareGuestSession } from "@/server/guest-session";
import { partyCamera } from "@/server/party-camera";

export interface JoinState {
  error?: string;
  /** Echo of the submitted name, so the field keeps its value after an error. */
  name?: string;
}

/** A Gast joins with their name; sets the guest cookie and opens the camera. */
export async function joinAction(
  _previous: JoinState,
  formData: FormData,
): Promise<JoinState> {
  const name = String(formData.get("name") ?? "");
  try {
    // Validate the session config before inserting, so a misconfigured
    // secret cannot leave an orphaned Gast row behind.
    const startGuestSession = prepareGuestSession();
    const guest = await partyCamera().joinGuest(name);
    await startGuestSession(guest.id);
  } catch (error) {
    if (isPartyCameraError(error, "InvalidName")) {
      return { error: error.message, name };
    }
    console.error("joinAction failed", error);
    return { error: "Er ging iets mis. Probeer het opnieuw.", name };
  }
  redirect("/camera");
}
