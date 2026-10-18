import sharp from "sharp";
import { describe, expect, it } from "vitest";
import {
  createPartyCamera,
  InvalidSettingsError,
  isPartyCameraError,
  type EventSettings,
} from "@/party-camera";
import {
  FixedClock,
  InMemoryBlobStore,
  InMemoryRepository,
} from "@/party-camera/adapters/in-memory";

const GUEST = { asHost: false } as const;
const HOST = { asHost: true } as const;

function setup(settings: Partial<EventSettings> = {}) {
  const repository = new InMemoryRepository({ revealOverride: "open", ...settings });
  const blobStore = new InMemoryBlobStore();
  const clock = new FixedClock("2026-10-18T20:00:00Z");
  const camera = createPartyCamera({ repository, blobStore, clock });
  return { camera, repository, blobStore, clock };
}

/** A photo that is light on the left and dark on the right. */
async function photoBytes(width = 1200, height = 900): Promise<Uint8Array> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="${width / 2}" height="${height}" fill="#ddeeff"/><rect x="${width / 2}" width="${width / 2}" height="${height}" fill="#222222"/></svg>`;
  return new Uint8Array(await sharp(Buffer.from(svg)).jpeg().toBuffer());
}

async function logoBytes(size = 300, format: "png" | "webp" = "png"): Promise<Uint8Array> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2 - 4}" fill="#f97316"/></svg>`;
  return new Uint8Array(await sharp(Buffer.from(svg))[format]().toBuffer());
}

async function withPhoto(settings: Partial<EventSettings> = {}) {
  const env = setup(settings);
  const tom = await env.camera.joinGuest("Tom");
  const id = crypto.randomUUID();
  await env.camera.takeShot(tom.id, id, await photoBytes());
  return { ...env, id };
}

/** Mean absolute difference per channel in a region of two same-size images. */
async function regionDiff(
  a: Uint8Array,
  b: Uint8Array,
  region: { left: number; top: number; width: number; height: number },
): Promise<number> {
  const [ra, rb] = await Promise.all(
    [a, b].map((bytes) => sharp(bytes).extract(region).raw().toBuffer()),
  );
  let sum = 0;
  for (let i = 0; i < ra.length; i++) sum += Math.abs(ra[i] - rb[i]);
  return sum / ra.length;
}

async function size(bytes: Uint8Array) {
  const { width = 0, height = 0 } = await sharp(bytes).metadata();
  return { width, height };
}

async function invalid(promise: Promise<unknown>): Promise<InvalidSettingsError> {
  const error = await promise.then(
    () => {
      throw new Error("expected a failure");
    },
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(InvalidSettingsError);
  return error as InvalidSettingsError;
}

describe("watermark on the Galerij's images", () => {
  it("draws the text in the chosen corner; the original stays byte-identical", async () => {
    const env = await withPhoto();
    const originalBefore = (await env.camera.renderPhoto(env.id, "original", HOST)).bytes;
    const plain = (await env.camera.renderPhoto(env.id, "display", GUEST)).bytes;

    await env.camera.updateSettings({
      watermarkEnabled: true,
      watermarkText: "Arne 25 · 18.10.26",
      watermarkPosition: "bottom-right",
      watermarkScale: 0.3,
    });
    const marked = (await env.camera.renderPhoto(env.id, "display", GUEST)).bytes;

    expect(marked).not.toEqual(plain);
    const { width, height } = await size(marked);
    expect(await size(plain)).toEqual({ width, height });
    const corner = { width: Math.round(width * 0.35), height: Math.round(height * 0.15) };
    // Pixels change in the bottom-right corner, not in the top-left one.
    expect(
      await regionDiff(marked, plain, { left: width - corner.width, top: height - corner.height, ...corner }),
    ).toBeGreaterThan(5);
    expect(await regionDiff(marked, plain, { left: 0, top: 0, ...corner })).toBeLessThan(1);

    expect((await env.camera.renderPhoto(env.id, "original", HOST)).bytes).toEqual(originalBefore);
  });

  it("leaves the Host's thumbnails clean", async () => {
    const env = await withPhoto();
    const hostThumb = (await env.camera.renderPhoto(env.id, "thumb", HOST)).bytes;
    await env.camera.updateSettings({ watermarkEnabled: true, watermarkText: "Arne 25" });
    const guestThumb = (await env.camera.renderPhoto(env.id, "thumb", GUEST)).bytes;
    expect(guestThumb).not.toEqual(hostThumb);
    expect((await env.camera.renderPhoto(env.id, "thumb", HOST)).bytes).toEqual(hostThumb);
  });

  it("gives the Host the Galerij's watermarked version when asked", async () => {
    const env = await withPhoto({ watermarkEnabled: true, watermarkText: "Arne 25" });
    const clean = (await env.camera.renderPhoto(env.id, "display", HOST)).bytes;
    const asShown = (await env.camera.renderPhoto(env.id, "display", GUEST)).bytes;
    const marked = await env.camera.renderPhoto(env.id, "display", { asHost: true, watermarked: true });
    expect(marked.bytes).toEqual(asShown);
    expect(marked.bytes).not.toEqual(clean);
  });

  it("never stores the full-size shareable version", async () => {
    const env = await withPhoto({ watermarkEnabled: true, watermarkText: "Arne 25" });
    await env.camera.renderPhoto(env.id, "shareable", GUEST);
    await env.camera.renderPhoto(env.id, "shareable", HOST);
    expect(env.blobStore.keys().filter((k) => k.includes("shareable"))).toEqual([]);
  });

  it("has no overlay when the watermark is off, or on with nothing to draw", async () => {
    const env = await withPhoto({ watermarkText: "Arne 25" });
    const hostThumb = (await env.camera.renderPhoto(env.id, "display", HOST)).bytes;
    expect((await env.camera.renderPhoto(env.id, "display", GUEST)).bytes).toEqual(hostThumb);

    await env.camera.updateSettings({ watermarkEnabled: true, watermarkText: "   " });
    expect((await env.camera.renderPhoto(env.id, "display", GUEST)).bytes).toEqual(hostThumb);
  });

  it("serves a new image after a watermark change, while the Host's stays the same", async () => {
    const env = await withPhoto({ watermarkEnabled: true, watermarkText: "Arne 25" });
    const host = (await env.camera.renderPhoto(env.id, "thumb", HOST)).bytes;
    const first = (await env.camera.renderPhoto(env.id, "thumb", GUEST)).bytes;
    const keysBefore = env.blobStore.keys().filter((k) => k.startsWith("derived/"));

    await env.camera.updateSettings({ watermarkPosition: "top-left" });
    const second = (await env.camera.renderPhoto(env.id, "thumb", GUEST)).bytes;

    expect(second).not.toEqual(first);
    const keysAfter = env.blobStore.keys().filter((k) => k.startsWith("derived/"));
    expect(keysAfter.filter((k) => !keysBefore.includes(k))).toHaveLength(1);
    expect((await env.camera.renderPhoto(env.id, "thumb", HOST)).bytes).toEqual(host);
  });

  it("renders text with XML-special characters as plain text", async () => {
    const env = await withPhoto({ watermarkEnabled: true });
    const plain = (await env.camera.renderPhoto(env.id, "display", HOST)).bytes;
    for (const text of [`<b>&amp;</b> "quote" 'x'`, "]]><svg onload=x>", "&#x41;"]) {
      await env.camera.updateSettings({ watermarkText: text });
      const marked = (await env.camera.renderPhoto(env.id, "display", GUEST)).bytes;
      expect(marked).not.toEqual(plain);
    }
    expect((await env.camera.getSettings()).watermarkText).toBe("&#x41;");
  });

  it("draws an uploaded logo, also without text", async () => {
    const env = await withPhoto();
    const plain = (await env.camera.renderPhoto(env.id, "display", HOST)).bytes;
    const settings = await env.camera.updateSettings({
      watermarkEnabled: true,
      watermarkLogo: await logoBytes(),
      watermarkPosition: "top-right",
    });
    expect(settings.watermarkLogoKey).toMatch(/^watermark\/[0-9a-f]{32}\.png$/);
    expect(env.blobStore.keys()).toContain(settings.watermarkLogoKey);
    const marked = (await env.camera.renderPhoto(env.id, "display", GUEST)).bytes;
    const { width } = await size(marked);
    expect(
      await regionDiff(marked, plain, { left: width - 200, top: 0, width: 200, height: 150 }),
    ).toBeGreaterThan(5);
  });
});

describe("watermark settings", () => {
  it("validates text, corner, size and opacity, all at once", async () => {
    const env = setup();
    const error = await invalid(
      env.camera.updateSettings({
        watermarkText: "x".repeat(61),
        watermarkPosition: "middle" as never,
        watermarkScale: 0.9,
        watermarkOpacity: 0,
      }),
    );
    expect(Object.keys(error.fieldErrors).sort()).toEqual([
      "watermarkOpacity",
      "watermarkPosition",
      "watermarkScale",
      "watermarkText",
    ]);
    expect((await env.camera.getSettings()).settingsVersion).toBe(1);
  });

  it("keeps the text on one line", async () => {
    const env = setup();
    const settings = await env.camera.updateSettings({ watermarkText: "  Arne\n25\t·  feest " });
    expect(settings.watermarkText).toBe("Arne 25 · feest");
  });

  it("refuses a logo that is not a PNG/WebP image, too large, or too big", async () => {
    const env = setup();
    const jpeg = new Uint8Array(await sharp(await logoBytes()).jpeg().toBuffer());
    const huge = new Uint8Array(
      await sharp({ create: { width: 6000, height: 100, channels: 4, background: "#fff0" } })
        .png()
        .toBuffer(),
    );
    const oversize = new Uint8Array(2 * 1024 * 1024 + 1);
    oversize.set(await logoBytes());
    for (const bytes of [new TextEncoder().encode("<svg/>"), jpeg, huge, oversize, new Uint8Array()]) {
      const error = await invalid(env.camera.updateSettings({ watermarkLogo: bytes }));
      expect(error.fieldErrors.watermarkLogo).toBeTruthy();
    }
    expect(env.blobStore.keys().filter((k) => k.startsWith("watermark/"))).toEqual([]);
  });

  it("accepts WebP and scales a large logo down once", async () => {
    const env = setup();
    const settings = await env.camera.updateSettings({ watermarkLogo: await logoBytes(2000, "webp") });
    const stored = await env.blobStore.get(settings.watermarkLogoKey!);
    const meta = await sharp(stored!).metadata();
    expect(meta.format).toBe("png");
    expect(Math.max(meta.width!, meta.height!)).toBeLessThanOrEqual(800);
    expect(meta.hasAlpha).toBe(true);
  });

  it("keeps earlier logos, so switching back to one always renders", async () => {
    const env = await withPhoto({ watermarkEnabled: true });
    const first = await env.camera.updateSettings({ watermarkLogo: await logoBytes(300) });
    const withFirst = (await env.camera.renderPhoto(env.id, "display", GUEST)).bytes;
    await env.camera.updateSettings({ watermarkLogo: await logoBytes(400) });
    await env.camera.updateSettings({ watermarkLogo: null });
    expect(env.blobStore.keys()).toContain(first.watermarkLogoKey);

    // The same file again: the same content-addressed key, still stored.
    const again = await env.camera.updateSettings({ watermarkLogo: await logoBytes(300) });
    expect(again.watermarkLogoKey).toBe(first.watermarkLogoKey);
    expect((await env.camera.renderPhoto(env.id, "display", GUEST)).bytes).toEqual(withFirst);
  });

  it("changes nothing when a save with a logo is refused", async () => {
    const env = setup();
    const error = await env.camera
      .updateSettings({ watermarkLogo: await logoBytes() }, { expectedVersion: 99 })
      .catch((e: unknown) => e);
    expect(isPartyCameraError(error, "SettingsChanged")).toBe(true);
    expect((await env.camera.getSettings()).watermarkLogoKey).toBeNull();
  });
});

describe("previewWatermark", () => {
  it("equals the Galerij's image for the same settings and photo", async () => {
    const env = await withPhoto();
    const draft = {
      watermarkEnabled: true,
      watermarkText: "Arne 25",
      watermarkPosition: "bottom-left" as const,
      watermarkScale: 0.4,
      watermarkOpacity: 0.7,
      watermarkLogo: await logoBytes(),
    };
    const preview = await env.camera.previewWatermark(draft);
    expect(preview.sample).toBe("photo");
    // Nothing saved by the preview.
    expect((await env.camera.getSettings()).settingsVersion).toBe(1);
    expect(env.blobStore.keys().filter((k) => k.startsWith("watermark/"))).toEqual([]);

    await env.camera.updateSettings(draft);
    const gallery = await env.camera.renderPhoto(env.id, "display", GUEST);
    expect(preview.bytes).toEqual(gallery.bytes);
  });

  it("uses the saved settings for fields left out of the draft", async () => {
    const env = await withPhoto({ watermarkEnabled: true, watermarkText: "Arne 25" });
    const preview = await env.camera.previewWatermark({});
    const gallery = await env.camera.renderPhoto(env.id, "display", GUEST);
    expect(preview.bytes).toEqual(gallery.bytes);
  });

  it("works on a given sample, or a generated one before any photo exists", async () => {
    const env = setup();
    const generated = await env.camera.previewWatermark({ watermarkEnabled: true, watermarkText: "Hoi" });
    expect(generated.sample).toBe("generated");
    expect((await sharp(generated.bytes).metadata()).format).toBe("jpeg");

    const sample = await env.camera.previewWatermark(
      { watermarkEnabled: true, watermarkText: "Hoi" },
      await photoBytes(800, 600),
    );
    expect(sample.sample).toBe("upload");
    expect(await size(sample.bytes)).toEqual({ width: 800, height: 600 });
  });

  it("renders only the newest of preview requests that wait for their turn", async () => {
    const env = await withPhoto();
    const draft = (text: string) => ({ watermarkEnabled: true, watermarkText: text });
    const [first, second, third] = await Promise.allSettled([
      env.camera.previewWatermark(draft("Een")),
      env.camera.previewWatermark(draft("Twee")),
      env.camera.previewWatermark(draft("Drie")),
    ]);
    for (const overtaken of [first, second]) {
      expect(overtaken.status === "rejected" && isPartyCameraError(overtaken.reason, "PreviewSuperseded")).toBe(true);
    }
    expect(third.status).toBe("fulfilled");
    // And the next one runs as usual.
    await expect(env.camera.previewWatermark(draft("Vier"))).resolves.toBeDefined();
  });

  it("validates the draft like updateSettings", async () => {
    const env = setup();
    const error = await invalid(
      env.camera.previewWatermark({ watermarkScale: 5, watermarkLogo: new Uint8Array([1, 2, 3]) }),
    );
    expect(Object.keys(error.fieldErrors).sort()).toEqual(["watermarkLogo", "watermarkScale"]);
  });
});

describe("prepareGallery", () => {
  async function party(photos: number) {
    const env = setup({ watermarkEnabled: true, watermarkText: "Arne 25" });
    const tom = await env.camera.joinGuest("Tom");
    const ids: string[] = [];
    const bytes = await photoBytes(400, 300);
    for (let i = 0; i < photos; i++) {
      env.clock.advance(60_000);
      const id = crypto.randomUUID();
      await env.camera.takeShot(tom.id, id, bytes);
      ids.push(id);
    }
    return { ...env, ids };
  }

  async function runAll(camera: ReturnType<typeof setup>["camera"], limit: number) {
    const batches = [];
    let cursor: string | undefined;
    do {
      const batch = await camera.prepareGallery({ cursor, limit });
      batches.push(batch);
      cursor = batch.nextCursor ?? undefined;
    } while (cursor);
    return batches;
  }

  it("prepares every visible photo in batches, and nothing twice", async () => {
    const env = await party(5);
    await env.camera.hidePhoto(env.ids[1]);

    const batches = await runAll(env.camera, 2);
    expect(batches.map((b) => b.photos)).toEqual([2, 2]);
    expect(batches.reduce((sum, b) => sum + b.rendered, 0)).toBe(8);
    expect(batches.every((b) => b.failed === 0)).toBe(true);
    const shown = env.ids.filter((_, i) => i !== 1);
    for (const id of shown) {
      expect(env.blobStore.keys().filter((k) => k.startsWith(`derived/${id}/`) && /wm-/.test(k))).toHaveLength(2);
    }

    const again = await runAll(env.camera, 10);
    expect(again).toHaveLength(1);
    expect(again[0]).toMatchObject({ photos: 4, rendered: 0, removed: 0, nextCursor: null });
  });

  it("renders the new watermark and removes images of the old one", async () => {
    const env = await party(3);
    await runAll(env.camera, 10);
    await env.camera.updateSettings({ watermarkText: "Arne 26" });

    const [batch] = await runAll(env.camera, 10);
    expect(batch).toMatchObject({ photos: 3, rendered: 6, removed: 6 });
    // The Galerij now serves exactly what was prepared.
    const keys = env.blobStore.keys().filter((k) => /wm-/.test(k));
    expect(keys).toHaveLength(6);
    const served = await env.camera.renderPhoto(env.ids[0], "display", GUEST);
    expect(served.bytes).toEqual(
      await env.blobStore.get(keys.find((k) => k.startsWith(`derived/${env.ids[0]}/display-`))!),
    );
  });

  it("answers an empty last batch for a malformed cursor", async () => {
    const env = await party(1);
    expect(await env.camera.prepareGallery({ cursor: "nonsense" })).toMatchObject({
      photos: 0,
      nextCursor: null,
    });
  });
});
