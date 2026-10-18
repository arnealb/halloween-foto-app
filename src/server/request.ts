import "server-only";

import type { NextRequest } from "next/server";

/**
 * Reject cross-site requests. The session cookies are SameSite=Lax (so they
 * are not sent on cross-site POSTs anyway); this is defense in depth.
 */
export function isSameOrigin(request: NextRequest): boolean {
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
export async function readBody(
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

/**
 * The request's form (multipart or urlencoded), read with a size cap.
 * "too-large" past `limit` bytes, null when it is not a readable form.
 */
export async function readForm(
  request: NextRequest,
  limit: number,
): Promise<FormData | "too-large" | null> {
  const body = await readBody(request, limit);
  if (body === "too-large") return body;
  const contentType = request.headers.get("content-type") ?? "";
  try {
    return await new Response(body as Uint8Array<ArrayBuffer>, {
      headers: { "Content-Type": contentType },
    }).formData();
  } catch {
    return null;
  }
}
