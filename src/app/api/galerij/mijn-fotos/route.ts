import type { NextRequest } from "next/server";
import { isPartyCameraError } from "@/party-camera";
import { textResponse, zipResponse } from "@/server/download";
import { currentGuestId } from "@/server/guest-session";
import { partyCamera } from "@/server/party-camera";

/** One Gast has at most a few hundred photos; see the admin download route. */
export const maxDuration = 300;

/**
 * GET /api/galerij/mijn-fotos — a zip of the Gast's own photos (the
 * watermarked versions, hidden ones left out), only after the Reveal. The
 * Gast is the one behind the guest cookie, never a parameter.
 */
export async function GET(request: NextRequest): Promise<Response> {
  const guestId = await currentGuestId();
  if (!guestId) return textResponse(401, "Alleen voor gasten die op dit toestel foto's namen.");

  try {
    const zip = await partyCamera().exportZip({ guestId, signal: request.signal });
    return zipResponse(zip);
  } catch (error) {
    if (isPartyCameraError(error, "NotRevealed")) {
      return textResponse(403, "De foto's zijn nog niet onthuld.");
    }
    if (isPartyCameraError(error, "UnknownGuest")) {
      return textResponse(401, "Alleen voor gasten die op dit toestel foto's namen.");
    }
    console.error("GET /api/galerij/mijn-fotos failed", error);
    return textResponse(500, "Er ging iets mis");
  }
}
