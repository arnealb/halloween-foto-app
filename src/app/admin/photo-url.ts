import type { PhotoVariant } from "@/party-camera";

/** URL of a photo's bytes for the Host (served by the admin photo route). */
export function adminPhotoUrl(photoId: string, variant: PhotoVariant): string {
  return `/api/admin/photos/${encodeURIComponent(photoId)}/${variant}`;
}
