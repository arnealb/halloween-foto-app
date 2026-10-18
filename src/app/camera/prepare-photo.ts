/**
 * Client-side compression before upload: the photo is decoded off-DOM, scaled
 * so its long side is at most `maxLongSide`, and re-encoded as JPEG. This keeps
 * uploads well under the server limit (and Vercel's ~4.5 MB body limit) and
 * fast on mobile data.
 *
 * Nothing here touches the DOM: no <img>, no object URL. The photo is never
 * shown to the Gast.
 */
/**
 * The browser could not shrink this photo and it is too large to upload as
 * is (typically an unsupported format such as HEIC).
 */
export class UnsupportedPhotoError extends Error {
  constructor() {
    super("Photo format not supported or too large");
    this.name = "UnsupportedPhotoError";
  }
}

export async function preparePhoto(
  photo: Blob,
  { maxLongSide, maxBytes }: { maxLongSide: number; maxBytes: number },
): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    // Browsers apply the EXIF orientation here ("from-image" is the default).
    bitmap = await createImageBitmap(photo, { imageOrientation: "from-image" });
  } catch {
    // The browser cannot decode it (e.g. HEIC outside Safari). Let the server
    // try only if it fits; otherwise the upload would be rejected anyway.
    if (photo.size > maxBytes) throw new UnsupportedPhotoError();
    return photo;
  }

  try {
    const scale = Math.min(1, maxLongSide / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    for (const quality of [0.85, 0.7, 0.55]) {
      const jpeg = await encodeJpeg(bitmap, width, height, quality);
      if (jpeg.size <= maxBytes) return jpeg;
    }
    throw new Error("Photo is still too large after compression");
  } finally {
    bitmap.close();
  }
}

async function encodeJpeg(
  bitmap: ImageBitmap,
  width: number,
  height: number,
  quality: number,
): Promise<Blob> {
  if (typeof OffscreenCanvas !== "undefined") {
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext("2d");
    if (context) {
      context.drawImage(bitmap, 0, 0, width, height);
      return canvas.convertToBlob({ type: "image/jpeg", quality });
    }
  }
  // Detached canvas: never attached to the document.
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("No 2D canvas context");
  context.drawImage(bitmap, 0, 0, width, height);
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", quality),
  );
  canvas.width = canvas.height = 0;
  if (!blob) throw new Error("Could not encode the photo");
  return blob;
}
