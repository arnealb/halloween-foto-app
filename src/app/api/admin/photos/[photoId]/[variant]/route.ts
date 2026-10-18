import type { NextRequest } from "next/server";
import { isPartyCameraError, type PhotoVariant } from "@/party-camera";
import { hostCamera } from "@/server/party-camera";

const VARIANTS: readonly PhotoVariant[] = ["original", "thumb", "display", "shareable"];

/**
 * GET /api/admin/photos/:photoId/:variant — the bytes of a photo for the Host
 * (`original`, `thumb`, `display`, or `shareable`: full size with the
 * Galerij's watermark, to share or post), only with a valid admin cookie.
 * With `?watermark=1`, `thumb`/`display` come as the Galerij shows them.
 * Bytes always go through here, never through a public bucket URL.
 *
 * Caching: the Host may use a shared device and log out (story 54), so
 * full-size photos are never stored by the browser, and thumbnails only for a day
 * (enough to keep the grid fast during the party). `private` keeps both out
 * of shared caches.
 */
export async function GET(
  request: NextRequest,
  ctx: RouteContext<"/api/admin/photos/[photoId]/[variant]">,
): Promise<Response> {
  const camera = await hostCamera();
  if (!camera) return text(401, "Niet ingelogd");

  const { photoId, variant } = await ctx.params;
  if (!isVariant(variant)) return text(404, "Niet gevonden");

  try {
    // `?watermark=1`: as the Galerij shows it (to share the phone-sized version).
    const watermarked = request.nextUrl.searchParams.get("watermark") === "1";
    const photo = await camera.renderPhoto(photoId, variant, { asHost: true, watermarked });
    return new Response(photo.bytes as Uint8Array<ArrayBuffer>, {
      headers: {
        "Content-Type": photo.contentType,
        "Content-Length": String(photo.bytes.byteLength),
        "Cache-Control": variant !== "thumb" ? "private, no-store" : "private, max-age=86400",
        "X-Content-Type-Options": "nosniff",
        "Content-Disposition": `inline; filename="${photoId}${variant === "thumb" ? "-thumb" : ""}.jpg"`,
      },
    });
  } catch (error) {
    if (isPartyCameraError(error, "UnknownPhoto")) return text(404, "Niet gevonden");
    console.error("GET /api/admin/photos failed", error);
    return text(500, "Er ging iets mis");
  }
}

function isVariant(value: string): value is PhotoVariant {
  return (VARIANTS as readonly string[]).includes(value);
}

function text(status: number, body: string): Response {
  return new Response(body, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}
