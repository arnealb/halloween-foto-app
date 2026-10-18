import type { NextRequest } from "next/server";
import { isPartyCameraError, type GuestPhotoVariant } from "@/party-camera";
import { partyCamera } from "@/server/party-camera";

const VARIANTS: readonly GuestPhotoVariant[] = ["thumb", "display"];

/**
 * GET /api/galerij/:photoId/:variant — a photo of the Galerij (`thumb` or
 * `display`, never the original) for anyone with the link, only after the
 * Reveal and only if the Host has not hidden it. Before the Reveal, for a
 * hidden or unknown photo and for any other variant the answer is the same
 * 404, so nothing tells whether a photo exists.
 *
 * Caching: kept short and `private` (no shared/CDN caches, never
 * `immutable`), so hiding a photo or closing the Galerij again reaches every
 * browser within a minute. The bytes themselves are cached in the blob store.
 */
const MAX_AGE_SECONDS = 60;

export async function GET(
  _request: NextRequest,
  ctx: RouteContext<"/api/galerij/[photoId]/[variant]">,
): Promise<Response> {
  const { photoId, variant } = await ctx.params;
  if (!isVariant(variant)) return notFound();

  try {
    const photo = await partyCamera().renderPhoto(photoId, variant, { asHost: false });
    return new Response(photo.bytes as Uint8Array<ArrayBuffer>, {
      headers: {
        "Content-Type": photo.contentType,
        "Content-Length": String(photo.bytes.byteLength),
        "Cache-Control": `private, max-age=${MAX_AGE_SECONDS}`,
        "X-Content-Type-Options": "nosniff",
        "Content-Disposition": `inline; filename="${photoId}${variant === "thumb" ? "-thumb" : ""}.jpg"`,
      },
    });
  } catch (error) {
    if (isPartyCameraError(error, "UnknownPhoto")) return notFound();
    console.error("GET /api/galerij failed", error);
    return text(500, "Er ging iets mis");
  }
}

function isVariant(value: string): value is GuestPhotoVariant {
  return (VARIANTS as readonly string[]).includes(value);
}

function notFound(): Response {
  return text(404, "Niet gevonden");
}

function text(status: number, body: string): Response {
  return new Response(body, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}
