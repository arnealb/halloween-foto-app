import type { NextRequest } from "next/server";
import { InvalidSettingsError, isPartyCameraError, MAX_LOGO_BYTES } from "@/party-camera";
import { hostCamera } from "@/server/party-camera";
import { isSameOrigin, readForm } from "@/server/request";
import { readWatermarkForm } from "../../../admin/watermark-form-data";
import type {
  WatermarkSaveResult,
  WatermarkSaveStatus,
} from "../../../admin/(beheer)/watermark/save-result";

/** Largest form accepted: the logo plus room for the other fields. */
const MAX_WATERMARK_FORM_BYTES = MAX_LOGO_BYTES + 64 * 1024;

const PAGE = "/admin/watermark";

/**
 * POST /api/admin/watermark — save the Watermark. Host only. Body: the
 * watermark form as multipart/form-data (see `readWatermarkForm`, plus
 * `settingsVersion`). A route handler rather than a Server Action, so the
 * logo upload does not raise the body limit of every Server Action.
 *
 * With `Accept: application/json` (the form's fetch) the answer is a
 * {@link WatermarkSaveResult}; otherwise (a plain form post without
 * JavaScript) a 303 back to the page with `?watermark=<status>`.
 */
export async function POST(request: NextRequest): Promise<Response> {
  const wantsJson = (request.headers.get("accept") ?? "").includes("application/json");
  const answer = (status: number, result: WatermarkSaveResult, outcome: WatermarkSaveStatus) =>
    wantsJson
      ? Response.json(result, { status, headers: { "Cache-Control": "no-store" } })
      : redirect(`${PAGE}?watermark=${outcome}`);

  if (!isSameOrigin(request)) return text(403, "Forbidden");
  const camera = await hostCamera();
  if (!camera) {
    return wantsJson ? text(401, "Niet ingelogd") : redirect("/admin/login");
  }

  const formData = await readForm(request, MAX_WATERMARK_FORM_BYTES);
  if (formData === "too-large") {
    return answer(
      413,
      { saved: false, fieldErrors: { watermarkLogo: logoTooLarge() } },
      "ongeldig",
    );
  }
  if (!formData) return text(400, "Ongeldig formulier");

  const form = await readWatermarkForm(formData);
  if (form.logoTooLarge) {
    return answer(422, { saved: false, fieldErrors: { watermarkLogo: logoTooLarge() } }, "ongeldig");
  }
  const version = String(formData.get("settingsVersion") ?? "");
  try {
    await camera.updateSettings(form.draft, {
      expectedVersion: /^\d{1,9}$/.test(version) ? Number(version) : Number.NaN,
    });
    return answer(200, { saved: true }, "opgeslagen");
  } catch (error) {
    if (error instanceof InvalidSettingsError) {
      return answer(422, { saved: false, fieldErrors: error.fieldErrors }, "ongeldig");
    }
    if (isPartyCameraError(error, "SettingsChanged")) {
      return answer(409, { saved: false, error: error.message }, "gewijzigd");
    }
    console.error("POST /api/admin/watermark failed", error);
    return answer(500, { saved: false, error: "Er ging iets mis. Probeer het opnieuw." }, "fout");
  }
}

function logoTooLarge(): string {
  return `Het logo mag maximaal ${MAX_LOGO_BYTES / 1024 / 1024} MB groot zijn.`;
}

function redirect(location: string): Response {
  return new Response(null, {
    status: 303,
    headers: { Location: location, "Cache-Control": "no-store" },
  });
}

function text(status: number, body: string): Response {
  return new Response(body, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}
