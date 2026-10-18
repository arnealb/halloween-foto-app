import sharp from "sharp";
import { unzipSync, type Unzipped } from "fflate";
import { describe, expect, it } from "vitest";
import {
  createPartyCamera,
  EXPORT_PART_SIZE,
  isPartyCameraError,
  type BlobStore,
  type EventSettings,
  type ZipExport,
} from "@/party-camera";
import {
  FixedClock,
  InMemoryBlobStore,
  InMemoryRepository,
} from "@/party-camera/adapters/in-memory";

const HOST = { asHost: true } as const;
const GUEST = { asHost: false } as const;

/** Counts reads of originals, to see how far ahead an export reads. */
class CountingBlobStore extends InMemoryBlobStore implements BlobStore {
  originalReads = 0;
  override async get(key: string): Promise<Uint8Array | null> {
    if (key.startsWith("originals/")) this.originalReads += 1;
    return super.get(key);
  }
}

function setup(settings: Partial<EventSettings> = {}) {
  const repository = new InMemoryRepository({ revealOverride: "open", ...settings });
  const blobStore = new CountingBlobStore();
  // 20:00 UTC on 18 October is 22:00 in Brussels (summer time).
  const clock = new FixedClock("2026-10-18T20:00:00Z");
  const camera = createPartyCamera({ repository, blobStore, clock });
  return { camera, repository, blobStore, clock };
}

let shade = 0;
/** A distinct small photo each time. */
async function photoBytes(): Promise<Uint8Array> {
  shade = (shade + 37) % 256;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="rgb(${shade},120,200)"/></svg>`;
  return new Uint8Array(await sharp(Buffer.from(svg)).jpeg().toBuffer());
}

/** A big photo that does not compress (~1–2 MB as stored). */
async function noisyPhoto(): Promise<Uint8Array> {
  const width = 1600;
  const height = 1200;
  const pixels = Buffer.alloc(width * height * 3);
  for (let i = 0; i < pixels.length; i++) pixels[i] = Math.floor(Math.random() * 256);
  return new Uint8Array(
    await sharp(pixels, { raw: { width, height, channels: 3 } }).jpeg({ quality: 80 }).toBuffer(),
  );
}

type Env = ReturnType<typeof setup>;

/** A Gast takes `count` photos, one minute apart. Returns their ids. */
async function shoot(
  env: Env,
  guestId: string,
  count: number,
  photo: () => Promise<Uint8Array> = photoBytes,
): Promise<string[]> {
  const ids: string[] = [];
  for (let i = 0; i < count; i++) {
    const id = crypto.randomUUID();
    await env.camera.takeShot(guestId, id, await photo());
    env.clock.advance(60_000);
    ids.push(id);
  }
  return ids;
}

async function unzip(zip: ZipExport): Promise<Unzipped> {
  const bytes = new Uint8Array(await new Response(zip.stream).arrayBuffer());
  return unzipSync(bytes);
}

async function failure(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => {
      throw new Error("expected a failure");
    },
    (error: unknown) => error,
  );
}

describe("exportZip", () => {
  it("puts every Gast's photos in their own folder, named <gast>_<tijdstip>_<n>.jpg in Brussels time", async () => {
    const env = setup();
    const anna = await env.camera.joinGuest("Anna");
    const bob = await env.camera.joinGuest("Bob");
    await shoot(env, anna.id, 2);
    await shoot(env, bob.id, 1);

    const zip = await env.camera.exportZip({ variant: "original" }, HOST);
    const files = await unzip(zip);

    expect(zip.photoCount).toBe(3);
    expect(Object.keys(files).sort()).toEqual([
      "Anna/Anna_2026-10-18_22-00-00_1.jpg",
      "Anna/Anna_2026-10-18_22-01-00_2.jpg",
      "Bob/Bob_2026-10-18_22-02-00_1.jpg",
    ]);
    expect(zip.filename).toMatch(/originelen\.zip$/);
  });

  it("`original` holds the originals byte for byte, hidden photos included", async () => {
    const env = setup();
    const anna = await env.camera.joinGuest("Anna");
    const [first, second] = await shoot(env, anna.id, 2);
    await env.camera.hidePhoto(second);

    const files = Object.values(await unzip(await env.camera.exportZip({ variant: "original" }, HOST)));

    const originals = await Promise.all(
      [first, second].map(async (id) => (await env.camera.renderPhoto(id, "original", HOST)).bytes),
    );
    expect(files).toHaveLength(2);
    expect(files).toEqual(originals);
  });

  it("`shareable` leaves hidden photos out and carries the watermark at full resolution", async () => {
    const env = setup({ watermarkEnabled: true, watermarkText: "Arne 25" });
    const anna = await env.camera.joinGuest("Anna");
    const [first, second] = await shoot(env, anna.id, 2);
    await env.camera.hidePhoto(second);

    const files = await unzip(await env.camera.exportZip({ variant: "shareable" }, HOST));

    expect(Object.keys(files)).toEqual(["Anna/Anna_2026-10-18_22-00-00_1.jpg"]);
    const [shared] = Object.values(files);
    const original = (await env.camera.renderPhoto(first, "original", HOST)).bytes;
    expect(shared).not.toEqual(original);
    const [a, b] = await Promise.all([sharp(shared).metadata(), sharp(original).metadata()]);
    expect([a.width, a.height]).toEqual([b.width, b.height]);
    // The same bytes as a single shareable download.
    expect(shared).toEqual((await env.camera.renderPhoto(first, "shareable", GUEST)).bytes);
  });

  it("a watermark change gives new shareable versions", async () => {
    const env = setup({ watermarkEnabled: true, watermarkText: "Eerst" });
    const anna = await env.camera.joinGuest("Anna");
    const [id] = await shoot(env, anna.id, 1);
    const before = (await env.camera.renderPhoto(id, "shareable", HOST)).bytes;

    await env.camera.updateSettings({ watermarkText: "Daarna" });
    const [after] = Object.values(await unzip(await env.camera.exportZip({ variant: "shareable" }, HOST)));

    expect(after).not.toEqual(before);
  });

  it("`shareable` without a watermark is the original as it is", async () => {
    const env = setup();
    const anna = await env.camera.joinGuest("Anna");
    const [id] = await shoot(env, anna.id, 1);

    const [shared] = Object.values(await unzip(await env.camera.exportZip({ variant: "shareable" }, HOST)));

    expect(shared).toEqual((await env.camera.renderPhoto(id, "original", HOST)).bytes);
  });

  it("makes names safe for any file system and tells Gasten with the same name apart", async () => {
    const env = setup();
    const names = ["Lisa", "lisa", "Lisa (2)", "a/b\\c:d*?", "...", "CON", "Zoë"];
    for (const name of names) {
      const guest = await env.camera.joinGuest(name);
      await shoot(env, guest.id, 1);
    }

    const folders = Object.keys(await unzip(await env.camera.exportZip({ variant: "original" }, HOST)))
      .map((path) => path.split("/")[0]);

    expect(folders.sort()).toEqual(
      ["Lisa", "lisa (2)", "Lisa (2) (2)", "abcd", "Gast", "CON_", "Zoë"].sort(),
    );
    for (const folder of folders) expect(folder).not.toMatch(/[<>:"/\\|?*]/);
  });

  it("a per-Gast export holds only that Gast's photos, in the same folder as the full export", async () => {
    const env = setup();
    const first = await env.camera.joinGuest("Sam");
    env.clock.advance(1000); // joined later: the second Sam
    const second = await env.camera.joinGuest("Sam");
    await shoot(env, first.id, 1);
    await shoot(env, second.id, 2);

    const files = await unzip(
      await env.camera.exportZip({ variant: "original", guestId: second.id }, HOST),
    );

    expect(Object.keys(files)).toEqual([
      "Sam (2)/Sam (2)_2026-10-18_22-01-01_1.jpg",
      "Sam (2)/Sam (2)_2026-10-18_22-02-01_2.jpg",
    ]);
  });

  it("an unknown Gast fails with UnknownGuest", async () => {
    const env = setup();
    const error = await failure(
      env.camera.exportZip({ variant: "original", guestId: crypto.randomUUID() }, HOST),
    );
    expect(isPartyCameraError(error, "UnknownGuest")).toBe(true);
  });

  it("an empty party gives an empty zip", async () => {
    const env = setup();
    const zip = await env.camera.exportZip({ variant: "original" }, HOST);
    expect(zip.photoCount).toBe(0);
    expect(await unzip(zip)).toEqual({});
  });
});

describe("exportZip for a Gast", () => {
  it("holds only their own photos, watermarked, without hidden ones", async () => {
    const env = setup({ watermarkEnabled: true, watermarkText: "Feest" });
    const anna = await env.camera.joinGuest("Anna");
    const bob = await env.camera.joinGuest("Bob");
    const [kept, hidden] = await shoot(env, anna.id, 2);
    await shoot(env, bob.id, 2);
    await env.camera.hidePhoto(hidden);

    const zip = await env.camera.exportZip({ guestId: anna.id }, GUEST);
    const files = await unzip(zip);

    expect(Object.keys(files)).toEqual(["Anna/Anna_2026-10-18_22-00-00_1.jpg"]);
    expect(Object.values(files)[0]).toEqual(
      (await env.camera.renderPhoto(kept, "shareable", GUEST)).bytes,
    );
    expect(zip.filename).toMatch(/Anna-fotos\.zip$/);
  });

  it("never gets originals, whatever is asked", async () => {
    const env = setup({ watermarkEnabled: true, watermarkText: "Feest" });
    const anna = await env.camera.joinGuest("Anna");
    const [id] = await shoot(env, anna.id, 1);

    const files = await unzip(
      await env.camera.exportZip(
        { guestId: anna.id, variant: "original" as "shareable" },
        GUEST,
      ),
    );

    expect(Object.values(files)[0]).not.toEqual(
      (await env.camera.renderPhoto(id, "original", HOST)).bytes,
    );
  });

  it("fails with NotRevealed before the Reveal", async () => {
    const env = setup({ revealOverride: "auto", revealAt: new Date("2026-10-19T00:00:00Z") });
    const anna = await env.camera.joinGuest("Anna");
    await shoot(env, anna.id, 1);

    const error = await failure(env.camera.exportZip({ guestId: anna.id }, GUEST));
    expect(isPartyCameraError(error, "NotRevealed")).toBe(true);

    env.clock.set("2026-10-19T00:00:00Z");
    expect((await env.camera.exportZip({ guestId: anna.id }, GUEST)).photoCount).toBe(1);
  });

  it("breaks off when the Galerij is closed again during the download", { timeout: 60_000 }, async () => {
    const env = setup({ watermarkEnabled: true, watermarkText: "Feest" });
    const anna = await env.camera.joinGuest("Anna");
    await shoot(env, anna.id, 12, noisyPhoto);

    const reader = (await env.camera.exportZip({ guestId: anna.id }, GUEST)).stream.getReader();
    await reader.read();
    await env.camera.setRevealOverride("closed");
    env.clock.advance(60_000);

    let error: unknown;
    try {
      for (;;) if ((await reader.read()).done) break;
    } catch (caught) {
      error = caught;
    }
    expect(isPartyCameraError(error, "NotRevealed")).toBe(true);
  });

  it("cannot export everyone's photos", async () => {
    const env = setup();
    const error = await failure(
      env.camera.exportZip({} as { guestId: string }, GUEST),
    );
    expect(isPartyCameraError(error, "UnknownGuest")).toBe(true);
  });
});

describe("export in parts", () => {
  /** Gasten with these photo counts, in order. */
  async function party(counts: number[]) {
    const env = setup({ shotsPerGuest: 500 });
    const guests = [];
    for (const [index, count] of counts.entries()) {
      const guest = await env.camera.joinGuest(`Gast ${index + 1}`);
      await shoot(env, guest.id, count);
      guests.push(guest);
    }
    return { ...env, guests };
  }

  it("parts are deterministic, keep a Gast whole, and hold every photo exactly once", { timeout: 60_000 }, async () => {
    // 120 + 90 do not fit in one part; the 250 of Gast 3 must be split (and starts a part).
    const env = await party([120, 90, 250, 5]);
    const plan = await env.camera.planExport({ variant: "original" });

    expect(plan.partSize).toBe(EXPORT_PART_SIZE.original);
    expect(plan.photoCount).toBe(465);
    expect(plan.parts.map((part) => part.photoCount)).toEqual([120, 90, 200, 55]);
    expect(plan.parts.map((part) => part.guestNames)).toEqual([
      ["Gast 1"],
      ["Gast 2"],
      ["Gast 3"],
      ["Gast 3", "Gast 4"],
    ]);
    expect(await env.camera.planExport({ variant: "original" })).toEqual(plan);

    const seen: string[] = [];
    for (const { part, photoCount } of plan.parts) {
      const zip = await env.camera.exportZip({ variant: "original", part }, HOST);
      expect(zip.filename).toMatch(new RegExp(`-deel-${part}-van-4\\.zip$`));
      const names = Object.keys(await unzip(zip));
      expect(names).toHaveLength(photoCount);
      seen.push(...names);
    }
    const whole = Object.keys(await unzip(await env.camera.exportZip({ variant: "original" }, HOST)));
    expect(seen.sort()).toEqual(whole.sort());
    expect(new Set(seen).size).toBe(465);
  });

  it("watermarked exports come in smaller parts (they are rendered on the fly)", { timeout: 60_000 }, async () => {
    const env = await party([120, 90]);
    const plan = await env.camera.planExport({ variant: "shareable" });

    expect(plan.partSize).toBe(EXPORT_PART_SIZE.shareable);
    expect(plan.partSize).toBeLessThan(EXPORT_PART_SIZE.original);
    expect(plan.parts.map((part) => part.photoCount)).toEqual([100, 20, 90]);
  });

  it("a part that does not exist fails with InvalidExportPart", async () => {
    const env = await party([3]);
    for (const part of [0, 2, 1.5]) {
      const error = await failure(env.camera.exportZip({ variant: "original", part }, HOST));
      expect(isPartyCameraError(error, "InvalidExportPart")).toBe(true);
    }
  });
});

describe("streaming", { timeout: 60_000 }, () => {
  it("does not read every photo ahead of a reader that stalls", async () => {
    const env = setup();
    const anna = await env.camera.joinGuest("Anna");
    await shoot(env, anna.id, 20, noisyPhoto);
    env.blobStore.originalReads = 0;

    const zip = await env.camera.exportZip({ variant: "original" }, HOST);
    const reader = zip.stream.getReader();
    await reader.read();
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Bounded by the read-ahead and the buffer, not the size of the export.
    expect(env.blobStore.originalReads).toBeGreaterThan(0);
    expect(env.blobStore.originalReads).toBeLessThan(20);
    await reader.cancel();
  });

  it("stops reading photos when the download is cancelled", async () => {
    const env = setup({ watermarkEnabled: true, watermarkText: "Feest" });
    const anna = await env.camera.joinGuest("Anna");
    await shoot(env, anna.id, 20, noisyPhoto);
    env.blobStore.originalReads = 0;

    const controller = new AbortController();
    const zip = await env.camera.exportZip(
      { variant: "shareable", signal: controller.signal },
      HOST,
    );
    const reader = zip.stream.getReader();
    await reader.read();
    controller.abort();
    await expect(reader.read()).rejects.toBeDefined();
    const readsAtAbort = env.blobStore.originalReads;
    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(env.blobStore.originalReads).toBeLessThanOrEqual(readsAtAbort);
    expect(readsAtAbort).toBeLessThan(20);
  });
});
