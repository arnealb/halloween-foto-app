"use server";

import { isPartyCameraError } from "@/party-camera";
import { currentGuestId } from "@/server/guest-session";
import { partyCamera } from "@/server/party-camera";
import { toViewPage, type ViewPage } from "./gallery-data";

export type MorePhotos = { ok: true; page: ViewPage } | { ok: false; notRevealed: boolean };

/**
 * The next page of the Galerij. `mine`: only the photos of the Gast behind
 * the guest cookie (never a guestId from the client). PartyCamera checks the
 * Reveal on every page.
 */
export async function loadMorePhotos(cursor: string, mine: boolean): Promise<MorePhotos> {
  try {
    let guestId: string | undefined;
    if (mine) {
      guestId = (await currentGuestId()) ?? undefined;
      if (!guestId) return { ok: true, page: { photos: [], nextCursor: null } };
    }
    const page = await partyCamera().listGallery({ cursor: String(cursor), guestId });
    return { ok: true, page: toViewPage(page) };
  } catch (error) {
    if (isPartyCameraError(error, "NotRevealed")) return { ok: false, notRevealed: true };
    console.error("loadMorePhotos failed", error);
    return { ok: false, notRevealed: false };
  }
}
