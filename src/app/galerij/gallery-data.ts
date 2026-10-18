import "server-only";

import type { GalleryPage } from "@/party-camera";
import { formatPartyTime } from "../party-time";

/** A Galerij photo as the client needs it; everything preformatted on the server. */
export interface ViewPhoto {
  id: string;
  guestName: string;
  /** "21:37", in the party's time zone. */
  time: string;
  width: number;
  height: number;
}

export interface ViewPage {
  photos: ViewPhoto[];
  nextCursor: string | null;
}

export function toViewPage(page: GalleryPage): ViewPage {
  return {
    photos: page.photos.map((photo) => ({
      id: photo.id,
      guestName: photo.guestName,
      time: formatPartyTime(photo.takenAt),
      width: photo.width,
      height: photo.height,
    })),
    nextCursor: page.nextCursor,
  };
}
