import "server-only";

import { MAX_LOGO_BYTES, type WatermarkDraft, type WatermarkPosition } from "@/party-camera";

/**
 * Parse the watermark form (the save and preview routes share it). Only
 * parsing: PartyCamera validates. Percentages that are not plain digits are
 * passed on as NaN and refused there. `logo` absent or empty keeps the saved
 * logo, `removeLogo` removes it; a new file wins over removing.
 */
export async function readWatermarkForm(formData: FormData): Promise<{
  draft: WatermarkDraft;
  logoTooLarge: boolean;
}> {
  const draft: WatermarkDraft = {
    watermarkEnabled: formData.get("watermarkEnabled") === "on",
    watermarkText: String(formData.get("watermarkText") ?? ""),
    watermarkPosition: String(formData.get("watermarkPosition") ?? "") as WatermarkPosition,
    watermarkScale: fromPercent(String(formData.get("watermarkScale") ?? "")),
    watermarkOpacity: fromPercent(String(formData.get("watermarkOpacity") ?? "")),
  };
  let logoTooLarge = false;
  const logo = formData.get("logo");
  if (logo instanceof File && logo.size > 0) {
    // Checked before reading, so a huge file is never buffered twice.
    if (logo.size > MAX_LOGO_BYTES) logoTooLarge = true;
    else draft.watermarkLogo = new Uint8Array(await logo.arrayBuffer());
  } else if (formData.get("removeLogo") === "on") {
    draft.watermarkLogo = null;
  }
  return { draft, logoTooLarge };
}

function fromPercent(value: string): number {
  const trimmed = value.trim();
  return /^\d{1,3}$/.test(trimmed) ? Number(trimmed) / 100 : Number.NaN;
}
