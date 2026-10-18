import type { GuestPhotoVariant } from "@/party-camera";

/** URL of a Galerij photo (served by the public gallery route; never a host route). */
export function galleryPhotoUrl(photoId: string, variant: GuestPhotoVariant): string {
  return `/api/galerij/${encodeURIComponent(photoId)}/${variant}`;
}
