import type { PhotoVariant } from "@/party-camera";

/**
 * URL of a photo's bytes for the Host (served by the admin photo route).
 * `watermarked`: `thumb`/`display` as the Galerij shows them.
 */
export function adminPhotoUrl(
  photoId: string,
  variant: PhotoVariant,
  { watermarked = false }: { watermarked?: boolean } = {},
): string {
  const url = `/api/admin/photos/${encodeURIComponent(photoId)}/${variant}`;
  return watermarked ? `${url}?watermark=1` : url;
}
