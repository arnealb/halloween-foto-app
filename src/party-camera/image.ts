import sharp from "sharp";
import { PartyCameraError } from "./errors";

/**
 * Largest upload accepted for one Shot. Clients compress to a long side of
 * ~2560px at JPEG quality ~0.85 (typically 0.5–2 MB); this keeps every request
 * under Vercel's ~4.5 MB body limit with room to spare.
 */
export const MAX_SHOT_BYTES = 4 * 1024 * 1024;

/** Long side of a stored original. Larger uploads are scaled down, never up. */
export const MAX_SHOT_LONG_SIDE = 2560;

/** JPEG quality of stored originals. */
const JPEG_QUALITY = 85;

/** Refuse decompression bombs: no real phone photo comes near this. */
const MAX_INPUT_PIXELS = 50_000_000;

/**
 * Formats a phone camera or browser canvas can produce and sharp can decode.
 * HEIC (HEVC) is not among them: sharp's prebuilt libvips only decodes AVIF
 * from the HEIF family, and reports both as "heif", so HEIF-family input is
 * only accepted when it is AVIF (checked via `compression`).
 */
const ACCEPTED_FORMATS = new Set(["jpeg", "png", "webp"]);

export interface NormalizedImage {
  bytes: Uint8Array;
  width: number;
  height: number;
}

/**
 * Turn an uploaded photo into the stored original: EXIF orientation applied
 * to the pixels, all metadata (EXIF incl. GPS, XMP, ICC, comments) removed,
 * scaled to fit {@link MAX_SHOT_LONG_SIDE}, and re-encoded as JPEG.
 * @throws PartyCameraError `InvalidImage`
 */
export async function normalizeShot(input: Uint8Array): Promise<NormalizedImage> {
  if (input.byteLength === 0) {
    throw invalid("De foto is leeg.");
  }
  if (input.byteLength > MAX_SHOT_BYTES) {
    throw invalid("De foto is te groot.");
  }

  const options = { limitInputPixels: MAX_INPUT_PIXELS, failOn: "error" } as const;
  try {
    const { format, compression, pages } = await sharp(input, options).metadata();
    const accepted =
      (format !== undefined && ACCEPTED_FORMATS.has(format)) ||
      (format === "heif" && compression === "av1");
    if (!accepted || (pages ?? 1) > 1) {
      throw invalid("Dit bestand is geen foto.");
    }

    // sharp drops all metadata unless asked to keep it, and converts to sRGB.
    const { data, info } = await sharp(input, options)
      .autoOrient()
      .resize({
        width: MAX_SHOT_LONG_SIDE,
        height: MAX_SHOT_LONG_SIDE,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
      .toBuffer({ resolveWithObject: true });

    return { bytes: new Uint8Array(data), width: info.width, height: info.height };
  } catch (error) {
    if (error instanceof PartyCameraError) throw error;
    // sharp throws plain Errors for undecodable, truncated or oversized input.
    throw invalid("Deze foto kon niet gelezen worden.");
  }
}

function invalid(message: string): PartyCameraError {
  return new PartyCameraError("InvalidImage", message);
}

/** Long side of a thumbnail: sharp on a 3x phone screen in a 3-column grid. */
export const THUMB_LONG_SIDE = 480;

/** JPEG quality of thumbnails: small files matter more than detail here. */
const THUMB_JPEG_QUALITY = 72;

/**
 * Render the thumbnail of a stored original (already oriented and stripped):
 * scaled to fit {@link THUMB_LONG_SIDE}, never enlarged, re-encoded as JPEG.
 */
export async function renderThumb(original: Uint8Array): Promise<Uint8Array> {
  const data = await sharp(original, { limitInputPixels: MAX_INPUT_PIXELS })
    .resize({
      width: THUMB_LONG_SIDE,
      height: THUMB_LONG_SIDE,
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: THUMB_JPEG_QUALITY, mozjpeg: true })
    .toBuffer();
  return new Uint8Array(data);
}
