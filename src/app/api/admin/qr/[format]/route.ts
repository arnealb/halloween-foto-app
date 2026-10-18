import { attachment, textResponse } from "@/server/download";
import { serverEnv } from "@/server/env";
import { JOIN_URL_PROBLEM_MESSAGES, joinQrPng, joinQrSvg, qrFileName, resolveJoinUrl } from "@/server/join-qr";
import { hostCamera } from "@/server/party-camera";

/**
 * GET /api/admin/qr/png | /api/admin/qr/svg — the join QR code as a download,
 * for the Host's own designs. Host only (401 otherwise). Points to the join
 * page at PUBLIC_BASE_URL; without a usable base URL there is no code (409).
 */
export async function GET(
  _request: Request,
  { params }: RouteContext<"/api/admin/qr/[format]">,
): Promise<Response> {
  const camera = await hostCamera();
  if (!camera) return textResponse(401, "Niet ingelogd");

  const { format } = await params;
  if (format !== "png" && format !== "svg") return textResponse(404, "Kies png of svg.");

  const join = resolveJoinUrl(serverEnv.publicBaseUrl);
  if (!join.ok) return textResponse(409, JOIN_URL_PROBLEM_MESSAGES[join.problem]);

  const { title } = await camera.getSettings();
  const body = format === "png" ? new Uint8Array(await joinQrPng(join.joinUrl)) : await joinQrSvg(join.joinUrl);
  return new Response(body, {
    headers: {
      "Content-Type": format === "png" ? "image/png" : "image/svg+xml; charset=utf-8",
      "Content-Disposition": attachment(qrFileName(title, format)),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "X-Join-Url": join.joinUrl,
    },
  });
}
