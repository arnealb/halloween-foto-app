import type { NextRequest } from "next/server";
import { InvalidSettingsError, isPartyCameraError, MAX_LOGO_BYTES } from "@/party-camera";
import { hostCamera } from "@/server/party-camera";
import { isSameOrigin, readForm } from "@/server/request";
import { readWatermarkForm } from "../../../../admin/watermark-form-data";

/**
 * POST /api/admin/watermark/preview — the Galerij's `display` image of a party
 * photo (or a sample) with a DRAFT of the watermark, for the live preview in
 * the Admin. Body: the watermark form as multipart/form-data (same fields as
 * the save action). Saves nothing. Host only (401 otherwise). Invalid fields:
 * 422 with the Dutch messages as JSON. Overtaken by a newer preview request
 * while waiting for its turn: 409 (the client ignores it).
 */
export async function POST(request: NextRequest): Promise<Response> {
  if (!isSameOrigin(request)) return text(403, "Forbidden");
  const camera = await hostCamera();
  if (!camera) return text(401, "Niet ingelogd");

  const formData = await readForm(request, MAX_LOGO_BYTES + 64 * 1024);
  if (formData === "too-large") {
    return json(413, {
      fieldErrors: { watermarkLogo: `Het logo mag maximaal ${MAX_LOGO_BYTES / 1024 / 1024} MB groot zijn.` },
    });
  }
  if (!formData) return text(400, "Ongeldig formulier");
  const form = await readWatermarkForm(formData);
  if (form.logoTooLarge) {
    return json(422, {
      fieldErrors: { watermarkLogo: `Het logo mag maximaal ${MAX_LOGO_BYTES / 1024 / 1024} MB groot zijn.` },
    });
  }

  try {
    const preview = await camera.previewWatermark(form.draft);
    return new Response(preview.bytes as Uint8Array<ArrayBuffer>, {
      headers: {
        "Content-Type": preview.contentType,
        "Content-Length": String(preview.bytes.byteLength),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "X-Preview-Sample": preview.sample,
      },
    });
  } catch (error) {
    if (error instanceof InvalidSettingsError) return json(422, { fieldErrors: error.fieldErrors });
    if (isPartyCameraError(error, "PreviewSuperseded")) return text(409, "Vervangen door een nieuwer voorbeeld");
    console.error("POST /api/admin/watermark/preview failed", error);
    return text(500, "Er ging iets mis");
  }
}

function json(status: number, body: unknown): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

function text(status: number, body: string): Response {
  return new Response(body, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}
