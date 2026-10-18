/**
 * Turns the current frame of the live viewfinder into a JPEG, without ever
 * showing it.
 *
 * The video frame is drawn straight onto a downscaled, detached canvas (long
 * side at most `maxLongSide`), so no full-resolution copy is kept. Drawing is
 * synchronous, so the moment of the shutter press is what gets captured; the
 * slower JPEG encoding runs afterwards. At most `poolSize` frames are held
 * while encoding: on phones, memory is the limit. When all canvases are busy,
 * {@link FrameGrabber.grab} answers null and the press is not taken.
 */
type FrameCanvas = OffscreenCanvas | HTMLCanvasElement;

const QUALITIES = [0.85, 0.7, 0.55];

export class FrameGrabber {
  private readonly idle: FrameCanvas[] = [];
  private busy = 0;

  constructor(
    private readonly limits: { maxLongSide: number; maxBytes: number },
    private readonly poolSize = 2,
  ) {}

  /** Whether a canvas is free for the next press. */
  get ready(): boolean {
    return this.busy < this.poolSize;
  }

  /**
   * Grab the frame showing right now. Returns the JPEG (encoded in the
   * background), or null if no frame is available or all canvases are busy.
   */
  grab(video: HTMLVideoElement): Promise<Blob> | null {
    const { videoWidth, videoHeight } = video;
    if (!videoWidth || !videoHeight || !this.ready) return null;

    const scale = Math.min(1, this.limits.maxLongSide / Math.max(videoWidth, videoHeight));
    const width = Math.max(1, Math.round(videoWidth * scale));
    const height = Math.max(1, Math.round(videoHeight * scale));

    const canvas = this.idle.pop() ?? createCanvas();
    this.busy += 1;
    try {
      if (canvas.width !== width) canvas.width = width;
      if (canvas.height !== height) canvas.height = height;
      const context = canvas.getContext("2d") as
        | OffscreenCanvasRenderingContext2D
        | CanvasRenderingContext2D
        | null;
      if (!context) throw new Error("No 2D canvas context");
      context.drawImage(video, 0, 0, width, height);
    } catch (error) {
      this.release(canvas);
      return Promise.reject(error);
    }

    return this.encode(canvas).finally(() => this.release(canvas));
  }

  /** Free the canvases' memory (e.g. when the camera stops). */
  dispose(): void {
    for (const canvas of this.idle) canvas.width = canvas.height = 0;
    this.idle.length = 0;
  }

  private release(canvas: FrameCanvas) {
    this.busy -= 1;
    this.idle.push(canvas);
  }

  private async encode(canvas: FrameCanvas): Promise<Blob> {
    for (const quality of QUALITIES) {
      const jpeg = await toJpeg(canvas, quality);
      if (jpeg.size <= this.limits.maxBytes) return jpeg;
    }
    throw new Error("Photo is still too large after compression");
  }
}

function createCanvas(): FrameCanvas {
  // Older Safari has OffscreenCanvas without a 2D context.
  if (typeof OffscreenCanvas !== "undefined") {
    const canvas = new OffscreenCanvas(1, 1);
    if (canvas.getContext("2d")) return canvas;
  }
  // Detached: never attached to the document, so the frame is never shown.
  return document.createElement("canvas");
}

async function toJpeg(canvas: FrameCanvas, quality: number): Promise<Blob> {
  if ("convertToBlob" in canvas) {
    return canvas.convertToBlob({ type: "image/jpeg", quality });
  }
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", quality),
  );
  if (!blob) throw new Error("Could not encode the photo");
  return blob;
}
