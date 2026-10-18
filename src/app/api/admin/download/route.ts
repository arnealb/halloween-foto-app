import type { NextRequest } from "next/server";
import { isPartyCameraError, type ExportVariant } from "@/party-camera";
import { textResponse, zipResponse } from "@/server/download";
import { hostCamera } from "@/server/party-camera";

/**
 * A big export streams for minutes. Vercel caps a function at this many
 * seconds (Hobby and Pro both allow 300 with fluid compute); an export that
 * does not finish in time is cut off, which is why the admin offers the
 * export in parts of ~200 photos and per Gast as well.
 */
export const maxDuration = 300;

/**
 * GET /api/admin/download?variant=original|shareable[&gast=<guestId>][&deel=<n>]
 * — a zip of the photos for the Host, only with a valid admin cookie:
 * everything, one Gast's photos, and/or one part of the export (see
 * `planExport`). Streamed; stops as soon as the download is cancelled.
 */
export async function GET(request: NextRequest): Promise<Response> {
  const camera = await hostCamera();
  if (!camera) return textResponse(401, "Niet ingelogd");

  const params = request.nextUrl.searchParams;
  const variant = params.get("variant");
  if (!isVariant(variant)) return textResponse(400, "Kies originelen of foto's met watermark.");
  const guestId = params.get("gast") ?? undefined;
  const partParam = params.get("deel");
  const part = partParam === null ? undefined : Number(partParam);

  try {
    const zip = await camera.exportZip(
      { variant, guestId, part, signal: request.signal },
      { asHost: true },
    );
    return zipResponse(zip);
  } catch (error) {
    if (isPartyCameraError(error, "UnknownGuest")) return textResponse(404, "Deze gast bestaat niet.");
    if (isPartyCameraError(error, "InvalidExportPart")) {
      return textResponse(404, "Dit deel bestaat niet (meer). Herlaad de downloadpagina.");
    }
    console.error("GET /api/admin/download failed", error);
    return textResponse(500, "Er ging iets mis");
  }
}

function isVariant(value: string | null): value is ExportVariant {
  return value === "original" || value === "shareable";
}
