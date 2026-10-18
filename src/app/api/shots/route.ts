import type { NextRequest } from "next/server";
import { isPartyCameraError, MAX_SHOT_BYTES } from "@/party-camera";
import { currentGuestId } from "@/server/guest-session";
import { partyCamera } from "@/server/party-camera";
import type { ShotResponse } from "@/app/camera/shot-response";

/**
 * POST /api/shots: the Gast behind the guest cookie takes a Shot.
 *
 * Body: the photo bytes (e.g. `image/jpeg`), nothing else. The guestId comes
 * only from the signed cookie, never from the request. The response carries
 * only the Rolletje counter; never a URL or the bytes of the photo.
 */
export async function POST(request: NextRequest): Promise<Response> {
  if (!isSameOrigin(request)) {
    return reply(403, { ok: false, error: "Forbidden" });
  }

  const guestId = await currentGuestId();
  if (!guestId) return reply(401, { ok: false, error: "NoSession" });

  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.startsWith("image/")) {
    return reply(415, { ok: false, error: "InvalidImage" });
  }

  const bytes = await readBody(request, MAX_SHOT_BYTES);
  if (bytes === "too-large") return reply(413, { ok: false, error: "TooLarge" });

  try {
    const shot = await partyCamera().takeShot(guestId, bytes);
    return reply(200, { ok: true, ...shot });
  } catch (error) {
    if (isPartyCameraError(error, "RollFull")) {
      return reply(409, { ok: false, error: "RollFull" });
    }
    if (isPartyCameraError(error, "UnknownGuest")) {
      return reply(401, { ok: false, error: "NoSession" });
    }
    if (isPartyCameraError(error, "InvalidImage")) {
      return reply(422, { ok: false, error: "InvalidImage" });
    }
    console.error("POST /api/shots failed", error);
    return reply(500, { ok: false, error: "ServerError" });
  }
}

function reply(status: number, body: ShotResponse): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

/**
 * Reject cross-site requests. The guest cookie is SameSite=Lax (so it is not
 * sent on cross-site POSTs anyway); this is defense in depth.
 */
function isSameOrigin(request: NextRequest): boolean {
  if (request.headers.get("sec-fetch-site") === "cross-site") return false;
  const origin = request.headers.get("origin");
  if (!origin) return true;
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

/** Read the body, but stop as soon as it exceeds `limit` bytes. */
async function readBody(
  request: NextRequest,
  limit: number,
): Promise<Uint8Array | "too-large"> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > limit) return "too-large";
  if (!request.body) return new Uint8Array();

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      return "too-large";
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}
