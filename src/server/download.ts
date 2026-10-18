import "server-only";

import type { ZipExport } from "@/party-camera";

/**
 * `Content-Disposition` for a download: an ASCII fallback name plus the real
 * (UTF-8) name for browsers that understand RFC 6266/5987.
 */
export function attachment(filename: string): string {
  const fallback = filename
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7e]|["\\]/g, "_");
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeRfc5987(filename)}`;
}

/**
 * Percent-encode a value for an RFC 5987 `ext-value`: `encodeURIComponent`
 * leaves `'`, `(`, `)`, `*` and `!` alone, but only `!` is an attr-char.
 */
function encodeRfc5987(value: string): string {
  return encodeURIComponent(value).replace(
    /['()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

/** The streamed response of a zip export. Never cached: it reflects the photos right now. */
export function zipResponse(zip: ZipExport): Response {
  return new Response(zip.stream, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": attachment(zip.filename),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "X-Photo-Count": String(zip.photoCount),
    },
  });
}

export function textResponse(status: number, body: string): Response {
  return new Response(body, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}
