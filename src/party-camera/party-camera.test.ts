import sharp from "sharp";
import { describe, expect, it } from "vitest";
import {
  createPartyCamera,
  DEFAULT_EVENT_SETTINGS,
  isPartyCameraError,
  MAX_GUEST_NAME_LENGTH,
  MAX_SHOT_BYTES,
  PENDING_SHOT_TIMEOUT_MS,
  type BlobStore,
  type EventSettings,
  type Photo,
  type ShotRecording,
} from "@/party-camera";
import {
  FixedClock,
  InMemoryBlobStore,
  InMemoryRepository,
} from "@/party-camera/adapters/in-memory";

function setup(
  settings: Partial<EventSettings> = {},
  {
    repository = new InMemoryRepository(settings),
    blobStore = new InMemoryBlobStore(),
  }: { repository?: InMemoryRepository; blobStore?: BlobStore } = {},
) {
  const clock = new FixedClock("2026-10-18T20:00:00Z");
  const camera = createPartyCamera({ repository, blobStore, clock });
  return { camera, clock, repository, blobStore };
}

/** A fresh shot id, as the camera generates one per photo. */
function shotId(): string {
  return crypto.randomUUID();
}

/** A plain JPEG, as a phone would upload it. */
async function photoBytes(width = 64, height = 48): Promise<Uint8Array> {
  return new Uint8Array(
    await sharp({ create: { width, height, channels: 3, background: "#3366cc" } })
      .jpeg()
      .toBuffer(),
  );
}

async function expectFailure(promise: Promise<unknown>, code: string) {
  const error = await promise.then(
    () => {
      throw new Error(`expected ${code}, but the call succeeded`);
    },
    (e: unknown) => e,
  );
  expect(isPartyCameraError(error)).toBe(true);
  expect((error as { code: string }).code).toBe(code);
}

describe("joinGuest", () => {
  it("creates a Gast with a full Rolletje", async () => {
    const { camera } = setup();

    const guest = await camera.joinGuest("Tom");

    expect(guest.name).toBe("Tom");
    expect(guest.shotsTaken).toBe(0);
    expect(guest.shotsPerGuest).toBe(50);
    expect(guest.shotsRemaining).toBe(50);
    expect(guest.createdAt).toEqual(new Date("2026-10-18T20:00:00Z"));
  });

  it("trims the name and collapses inner whitespace", async () => {
    const { camera } = setup();

    const guest = await camera.joinGuest("   Anna   de  Vries \n");

    expect(guest.name).toBe("Anna de Vries");
  });

  it.each(["", "   ", "\n\t"])("rejects an empty name (%j) with InvalidName", async (name) => {
    const { camera } = setup();

    await expectFailure(camera.joinGuest(name), "InvalidName");
  });

  it("rejects a name that is too long with InvalidName", async () => {
    const { camera } = setup();

    await expectFailure(
      camera.joinGuest("x".repeat(MAX_GUEST_NAME_LENGTH + 1)),
      "InvalidName",
    );
    await expect(camera.joinGuest("x".repeat(MAX_GUEST_NAME_LENGTH))).resolves.toBeDefined();
  });

  it("allows two Gasten with the same name, as separate Gasten", async () => {
    const { camera } = setup();

    const first = await camera.joinGuest("Tom");
    const second = await camera.joinGuest("Tom");

    expect(first.id).not.toBe(second.id);
    expect((await camera.getGuest(first.id)).name).toBe("Tom");
    expect((await camera.getGuest(second.id)).name).toBe("Tom");
  });

  it("gives a Rolletje the size of the Event's shotsPerGuest", async () => {
    const { camera } = setup({ shotsPerGuest: 30 });

    const guest = await camera.joinGuest("Tom");

    expect(guest.shotsPerGuest).toBe(30);
    expect(guest.shotsRemaining).toBe(30);
  });
});

describe("getGuest", () => {
  it("returns a joined Gast with their remaining shots", async () => {
    const { camera } = setup();
    const joined = await camera.joinGuest("Sara");

    const guest = await camera.getGuest(joined.id);

    expect(guest).toEqual(joined);
  });

  it("fails with UnknownGuest for an id that never joined", async () => {
    const { camera } = setup();

    await expectFailure(
      camera.getGuest("00000000-0000-4000-8000-000000000000"),
      "UnknownGuest",
    );
  });

  it("fails with UnknownGuest for a malformed id", async () => {
    const { camera } = setup();

    await expectFailure(camera.getGuest("not-a-guest"), "UnknownGuest");
  });
});

describe("getSettings", () => {
  it("starts with the default Event settings: a Rolletje of 50", async () => {
    const { camera } = setup();

    const settings = await camera.getSettings();

    expect(settings).toEqual(DEFAULT_EVENT_SETTINGS);
    expect(settings.shotsPerGuest).toBe(50);
  });
});

describe("takeShot", () => {
  it("stores the Shot and counts it off the Rolletje", async () => {
    const { camera, repository, blobStore } = setup();
    const guest = await camera.joinGuest("Tom");

    const result = await camera.takeShot(guest.id, shotId(), await photoBytes());

    expect(result).toEqual({ shotsRemaining: 49, shotsPerGuest: 50 });
    expect((await camera.getGuest(guest.id)).shotsRemaining).toBe(49);

    const [photo] = repository.photos();
    expect(photo).toMatchObject<Partial<Photo>>({
      guestId: guest.id,
      width: 64,
      height: 48,
      hidden: false,
      takenAt: new Date("2026-10-18T20:00:00Z"),
    });
    expect(photo.storageKey.startsWith(`originals/${guest.id}/${photo.id}-`)).toBe(true);
    expect((blobStore as InMemoryBlobStore).keys()).toEqual([photo.storageKey]);
  });

  it("allows exactly shotsPerGuest Shots; the next one fails with RollFull", async () => {
    const { camera, repository } = setup({ shotsPerGuest: 3 });
    const guest = await camera.joinGuest("Tom");
    const bytes = await photoBytes();

    const remaining = [];
    for (let i = 0; i < 3; i++) {
      remaining.push((await camera.takeShot(guest.id, shotId(), bytes)).shotsRemaining);
    }

    expect(remaining).toEqual([2, 1, 0]);
    await expectFailure(camera.takeShot(guest.id, shotId(), bytes), "RollFull");
    expect((await camera.getGuest(guest.id)).shotsRemaining).toBe(0);
    expect(repository.photos()).toHaveLength(3);
  });

  it("never exceeds the Rolletje when Shots are taken concurrently", async () => {
    const { camera, repository, blobStore } = setup({ shotsPerGuest: 5 });
    const guest = await camera.joinGuest("Tom");
    const bytes = await photoBytes();

    const results = await Promise.allSettled(
      Array.from({ length: 20 }, () => camera.takeShot(guest.id, shotId(), bytes)),
    );

    const succeeded = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(succeeded).toHaveLength(5);
    expect(rejected).toHaveLength(15);
    for (const r of rejected) {
      expect(isPartyCameraError(r.reason, "RollFull")).toBe(true);
    }
    expect((await camera.getGuest(guest.id)).shotsTaken).toBe(5);
    expect(repository.photos()).toHaveLength(5);
    expect((blobStore as InMemoryBlobStore).keys()).toHaveLength(5);
  });

  it("keeps Rolletjes of different Gasten separate", async () => {
    const { camera } = setup({ shotsPerGuest: 1 });
    const tom = await camera.joinGuest("Tom");
    const sara = await camera.joinGuest("Sara");
    const bytes = await photoBytes();

    await camera.takeShot(tom.id, shotId(), bytes);

    await expectFailure(camera.takeShot(tom.id, shotId(), bytes), "RollFull");
    await expect(camera.takeShot(sara.id, shotId(), bytes)).resolves.toEqual({
      shotsRemaining: 0,
      shotsPerGuest: 1,
    });
  });

  it("costs no shot when storing the photo fails", async () => {
    const failing = new FailingBlobStore();
    const { camera, repository } = setup({}, { blobStore: failing });
    const guest = await camera.joinGuest("Tom");

    await expect(camera.takeShot(guest.id, shotId(), await photoBytes())).rejects.toThrow(
      "storage down",
    );

    expect((await camera.getGuest(guest.id)).shotsRemaining).toBe(50);
    expect(repository.photos()).toHaveLength(0);

    failing.failing = false;
    await expect(camera.takeShot(guest.id, shotId(), await photoBytes())).resolves.toEqual({
      shotsRemaining: 49,
      shotsPerGuest: 50,
    });
  });

  it("costs no shot and leaves no stored bytes when recording the photo fails", async () => {
    const repository = new FailingPhotoRepository();
    const blobStore = new InMemoryBlobStore();
    const { camera } = setup({}, { repository, blobStore });
    const guest = await camera.joinGuest("Tom");

    await expect(camera.takeShot(guest.id, shotId(), await photoBytes())).rejects.toThrow(
      "database down",
    );

    expect((await camera.getGuest(guest.id)).shotsRemaining).toBe(50);
    expect(blobStore.keys()).toEqual([]);
  });

  it("does not let a failed upload free a shot on a full Rolletje", async () => {
    const failing = new FailingBlobStore();
    failing.failing = false;
    const { camera } = setup({ shotsPerGuest: 2 }, { blobStore: failing });
    const guest = await camera.joinGuest("Tom");
    await camera.takeShot(guest.id, shotId(), await photoBytes());

    // The last shot's upload fails: its reservation is released, nothing more.
    failing.failing = true;
    await expect(camera.takeShot(guest.id, shotId(), await photoBytes())).rejects.toThrow("storage down");
    expect((await camera.getGuest(guest.id)).shotsTaken).toBe(1);

    // The shot that was given back can be taken once, and then the Rolletje is full.
    failing.failing = false;
    await expect(camera.takeShot(guest.id, shotId(), await photoBytes())).resolves.toEqual({
      shotsRemaining: 0,
      shotsPerGuest: 2,
    });
    await expectFailure(camera.takeShot(guest.id, shotId(), await photoBytes()), "RollFull");
    expect((await camera.getGuest(guest.id)).shotsTaken).toBe(2);
  });

  it("answers RollFull for a full Rolletje without looking at the upload", async () => {
    const { camera, repository } = setup({ shotsPerGuest: 1 });
    const guest = await camera.joinGuest("Tom");
    await camera.takeShot(guest.id, shotId(), await photoBytes());

    await expectFailure(
      camera.takeShot(guest.id, shotId(), new TextEncoder().encode("dit is geen foto")),
      "RollFull",
    );
    expect(repository.photos()).toHaveLength(1);
  });

  it("answers UnknownGuest for a Gast that never joined, even with garbage bytes", async () => {
    const { camera } = setup();

    await expectFailure(
      camera.takeShot("00000000-0000-4000-8000-000000000000", shotId(), new Uint8Array([1, 2, 3])),
      "UnknownGuest",
    );
  });

  it("applies the EXIF orientation and strips all metadata, including GPS", async () => {
    const { camera, blobStore } = setup();
    const guest = await camera.joinGuest("Tom");
    // Stored sideways (landscape) with orientation 6: "rotate 90° clockwise to
    // display". Left half red, right half blue; upright, red is on top.
    const redHalf = await sharp({
      create: { width: 100, height: 100, channels: 3, background: "#ff0000" },
    })
      .png()
      .toBuffer();
    const upload = await sharp({
      create: { width: 200, height: 100, channels: 3, background: "#0000ff" },
    })
      .composite([{ input: redHalf, left: 0, top: 0 }])
      .jpeg()
      .withMetadata({ orientation: 6 })
      .withExif({
        IFD0: { Make: "PhoneCo", Copyright: "Tom" },
        IFD3: {
          GPSLatitudeRef: "N",
          GPSLatitude: "52/1 22/1 0/1",
          GPSLongitudeRef: "E",
          GPSLongitude: "4/1 53/1 0/1",
        },
      })
      .toBuffer();
    const uploadMeta = await sharp(upload).metadata();
    expect(uploadMeta.orientation).toBe(6);
    expect(uploadMeta.exif?.includes(Buffer.from([0x25, 0x88]))).toBe(true); // GPS IFD pointer

    await camera.takeShot(guest.id, shotId(), new Uint8Array(upload));

    const [key] = (blobStore as InMemoryBlobStore).keys();
    const stored = await blobStore.get(key);
    const meta = await sharp(stored!).metadata();
    expect(meta.format).toBe("jpeg");
    expect([meta.width, meta.height]).toEqual([100, 200]);
    expect(meta.orientation).toBeUndefined();
    expect(meta.exif).toBeUndefined();
    expect(meta.xmp).toBeUndefined();
    expect(meta.icc).toBeUndefined();

    const { data, info } = await sharp(stored!).raw().toBuffer({ resolveWithObject: true });
    const pixel = (x: number, y: number) => {
      const i = (y * info.width + x) * info.channels;
      return [data[i], data[i + 1], data[i + 2]];
    };
    expect(pixel(50, 20)[0]).toBeGreaterThan(200); // top: red
    expect(pixel(50, 20)[2]).toBeLessThan(50);
    expect(pixel(50, 180)[2]).toBeGreaterThan(200); // bottom: blue
    expect(pixel(50, 180)[0]).toBeLessThan(50);
  });

  it("re-encodes other photo formats as JPEG", async () => {
    const { camera, repository, blobStore } = setup();
    const guest = await camera.joinGuest("Tom");
    const png = await sharp({
      create: { width: 30, height: 20, channels: 4, background: "#00ff0080" },
    })
      .png()
      .toBuffer();

    await camera.takeShot(guest.id, shotId(), new Uint8Array(png));

    const stored = await blobStore.get(repository.photos()[0].storageKey);
    expect((await sharp(stored!).metadata()).format).toBe("jpeg");
  });

  it("scales very large photos down to a long side of 2560px", async () => {
    const { camera, repository } = setup();
    const guest = await camera.joinGuest("Tom");

    await camera.takeShot(guest.id, shotId(), await photoBytes(4000, 3000));

    expect(repository.photos()[0]).toMatchObject({ width: 2560, height: 1920 });
  });

  it.each([
    ["garbage bytes", new TextEncoder().encode("dit is geen foto")],
    ["an empty upload", new Uint8Array()],
    [
      "an SVG",
      new TextEncoder().encode(
        '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>',
      ),
    ],
  ])("rejects %s with InvalidImage and costs no shot", async (_label, bytes) => {
    const { camera, blobStore } = setup();
    const guest = await camera.joinGuest("Tom");

    await expectFailure(camera.takeShot(guest.id, shotId(), bytes), "InvalidImage");

    expect((await camera.getGuest(guest.id)).shotsRemaining).toBe(50);
    expect((blobStore as InMemoryBlobStore).keys()).toEqual([]);
  });

  it("accepts an AVIF photo (the only HEIF-family format sharp can decode)", async () => {
    const { camera, repository } = setup();
    const guest = await camera.joinGuest("Tom");
    const avif = await sharp({
      create: { width: 40, height: 30, channels: 3, background: "#cc6633" },
    })
      .avif()
      .toBuffer();

    await camera.takeShot(guest.id, shotId(), new Uint8Array(avif));

    expect(repository.photos()[0]).toMatchObject({ width: 40, height: 30 });
  });

  it("rejects a truncated JPEG with InvalidImage", async () => {
    const { camera } = setup();
    const guest = await camera.joinGuest("Tom");
    const bytes = await photoBytes(400, 300);

    await expectFailure(
      camera.takeShot(guest.id, shotId(), bytes.slice(0, bytes.length / 2)),
      "InvalidImage",
    );
  });

  it("rejects an upload larger than MAX_SHOT_BYTES with InvalidImage", async () => {
    const { camera } = setup();
    const guest = await camera.joinGuest("Tom");

    await expectFailure(
      camera.takeShot(guest.id, shotId(), new Uint8Array(MAX_SHOT_BYTES + 1)),
      "InvalidImage",
    );
  });

  it.each(["00000000-0000-4000-8000-000000000000", "not-a-guest"])(
    "fails with UnknownGuest for a Gast that never joined (%s)",
    async (guestId) => {
      const { camera, repository, blobStore } = setup();

      await expectFailure(camera.takeShot(guestId, shotId(), await photoBytes()), "UnknownGuest");

      expect(repository.photos()).toEqual([]);
      expect((blobStore as InMemoryBlobStore).keys()).toEqual([]);
    },
  );
});

describe("takeShot with a repeated shot id (retried uploads)", () => {
  it("stores the photo under the shot id", async () => {
    const { camera, repository } = setup();
    const guest = await camera.joinGuest("Tom");
    const id = shotId();

    await camera.takeShot(guest.id, id, await photoBytes());

    const [photo] = repository.photos();
    expect(photo.id).toBe(id);
    expect(photo.storageKey).toMatch(
      new RegExp(`^originals/${guest.id}/${id}-[0-9a-f-]{36}\\.jpg$`),
    );
  });

  it("counts and stores a Shot only once when its upload is repeated", async () => {
    const { camera, repository, blobStore } = setup();
    const guest = await camera.joinGuest("Tom");
    const id = shotId();
    const bytes = await photoBytes();

    const first = await camera.takeShot(guest.id, id, bytes);
    const again = await camera.takeShot(guest.id, id, bytes);
    const andAgain = await camera.takeShot(guest.id, id.toUpperCase(), bytes);

    expect(first).toEqual({ shotsRemaining: 49, shotsPerGuest: 50 });
    expect(again).toEqual(first);
    expect(andAgain).toEqual(first);
    expect((await camera.getGuest(guest.id)).shotsTaken).toBe(1);
    expect(repository.photos()).toHaveLength(1);
    expect((blobStore as InMemoryBlobStore).keys()).toHaveLength(1);
  });

  it("answers a repeat with the current Rolletje, including later Shots", async () => {
    const { camera } = setup();
    const guest = await camera.joinGuest("Tom");
    const id = shotId();
    const bytes = await photoBytes();
    await camera.takeShot(guest.id, id, bytes);
    await camera.takeShot(guest.id, shotId(), bytes);

    await expect(camera.takeShot(guest.id, id, bytes)).resolves.toEqual({
      shotsRemaining: 48,
      shotsPerGuest: 50,
    });
  });

  it("confirms a repeated last Shot instead of answering RollFull", async () => {
    const { camera, repository } = setup({ shotsPerGuest: 1 });
    const guest = await camera.joinGuest("Tom");
    const id = shotId();
    const bytes = await photoBytes();
    await camera.takeShot(guest.id, id, bytes);

    await expect(camera.takeShot(guest.id, id, bytes)).resolves.toEqual({
      shotsRemaining: 0,
      shotsPerGuest: 1,
    });
    await expectFailure(camera.takeShot(guest.id, shotId(), bytes), "RollFull");
    expect(repository.photos()).toHaveLength(1);
  });

  it("stores concurrent duplicates once; the others hear ShotInProgress and a retry confirms", async () => {
    const { camera, repository, blobStore } = setup();
    const guest = await camera.joinGuest("Tom");
    const id = shotId();
    const bytes = await photoBytes();

    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () => camera.takeShot(guest.id, id, bytes)),
    );

    const succeeded = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(succeeded).toHaveLength(1);
    expect(succeeded[0].value).toEqual({ shotsRemaining: 49, shotsPerGuest: 50 });
    for (const r of rejected) {
      expect(isPartyCameraError(r.reason, "ShotInProgress")).toBe(true);
    }
    expect((await camera.getGuest(guest.id)).shotsTaken).toBe(1);
    expect(repository.photos()).toHaveLength(1);
    expect((blobStore as InMemoryBlobStore).keys()).toHaveLength(1);

    await expect(camera.takeShot(guest.id, id, bytes)).resolves.toEqual({
      shotsRemaining: 49,
      shotsPerGuest: 50,
    });
  });

  it("never exceeds the Rolletje with concurrent duplicates and new Shots mixed", async () => {
    const { camera, repository } = setup({ shotsPerGuest: 3 });
    const guest = await camera.joinGuest("Tom");
    const ids = [shotId(), shotId(), shotId(), shotId(), shotId()];
    const bytes = await photoBytes();

    await Promise.allSettled(
      ids.flatMap((id) => [0, 1, 2].map(() => camera.takeShot(guest.id, id, bytes))),
    );

    expect((await camera.getGuest(guest.id)).shotsTaken).toBe(3);
    expect(repository.photos()).toHaveLength(3);
    expect(new Set(repository.photos().map((p) => p.id)).size).toBe(3);
  });

  it("lets a retry store a Shot whose earlier upload failed, costing one shot", async () => {
    const failing = new FailingBlobStore();
    const { camera, repository } = setup({}, { blobStore: failing });
    const guest = await camera.joinGuest("Tom");
    const id = shotId();
    const bytes = await photoBytes();

    await expect(camera.takeShot(guest.id, id, bytes)).rejects.toThrow("storage down");
    failing.failing = false;

    await expect(camera.takeShot(guest.id, id, bytes)).resolves.toEqual({
      shotsRemaining: 49,
      shotsPerGuest: 50,
    });
    expect(repository.photos().map((p) => p.id)).toEqual([id]);
  });

  it("lets a retry take over the Shot of an attempt that died, without counting it twice", async () => {
    const hanging = new HangingBlobStore();
    const { camera, clock, repository } = setup({}, { blobStore: hanging });
    const guest = await camera.joinGuest("Tom");
    const id = shotId();
    const bytes = await photoBytes();

    // The first attempt reserves the Shot, then never finishes storing it.
    void camera.takeShot(guest.id, id, bytes);
    await hanging.reached;
    hanging.hang = false;

    await expectFailure(camera.takeShot(guest.id, id, bytes), "ShotInProgress");

    clock.advance(PENDING_SHOT_TIMEOUT_MS + 1);
    await expect(camera.takeShot(guest.id, id, bytes)).resolves.toEqual({
      shotsRemaining: 49,
      shotsPerGuest: 50,
    });
    expect((await camera.getGuest(guest.id)).shotsTaken).toBe(1);
    expect(repository.photos()).toHaveLength(1);
  });

  it("keeps one photo and its bytes when a slow attempt finishes after a takeover", async () => {
    const hanging = new HangingBlobStore();
    const { camera, clock, repository } = setup({}, { blobStore: hanging });
    const guest = await camera.joinGuest("Tom");
    const id = shotId();
    const bytes = await photoBytes();

    // The first attempt reserves the Shot and stalls while storing it.
    const slow = camera.takeShot(guest.id, id, bytes);
    await hanging.reached;
    hanging.hang = false;

    // Presumed dead: a retry takes over and stores the Shot.
    clock.advance(PENDING_SHOT_TIMEOUT_MS + 1);
    await expect(camera.takeShot(guest.id, id, bytes)).resolves.toEqual({
      shotsRemaining: 49,
      shotsPerGuest: 50,
    });

    // The slow attempt was alive after all and finishes now.
    hanging.resume();
    await slow;

    expect((await camera.getGuest(guest.id)).shotsTaken).toBe(1);
    const photos = repository.photos();
    expect(photos).toHaveLength(1);
    expect(hanging.keys()).toEqual([photos[0].storageKey]);
    expect(await hanging.get(photos[0].storageKey)).not.toBeNull();
  });

  it("gives back the shot of a dead upload that is never retried", async () => {
    const hanging = new HangingBlobStore();
    const { camera, clock } = setup({ shotsPerGuest: 1 }, { blobStore: hanging });
    const guest = await camera.joinGuest("Tom");
    const bytes = await photoBytes();

    void camera.takeShot(guest.id, shotId(), bytes);
    await hanging.reached;
    hanging.hang = false;
    await expectFailure(camera.takeShot(guest.id, shotId(), bytes), "RollFull");

    clock.advance(PENDING_SHOT_TIMEOUT_MS + 1);
    await expect(camera.takeShot(guest.id, shotId(), bytes)).resolves.toEqual({
      shotsRemaining: 0,
      shotsPerGuest: 1,
    });
    expect((await camera.getGuest(guest.id)).shotsTaken).toBe(1);
  });

  it("refuses another Gast's shot id with InvalidShotId and changes nothing", async () => {
    const { camera, repository } = setup();
    const tom = await camera.joinGuest("Tom");
    const sara = await camera.joinGuest("Sara");
    const id = shotId();
    const bytes = await photoBytes();
    await camera.takeShot(tom.id, id, bytes);

    await expectFailure(camera.takeShot(sara.id, id, bytes), "InvalidShotId");

    expect((await camera.getGuest(sara.id)).shotsTaken).toBe(0);
    expect(repository.photos()).toHaveLength(1);
  });

  it.each(["", "not-a-uuid", "12345678-1234-1234-1234-1234567890", `${shotId()}x`])(
    "rejects a malformed shot id (%j) with InvalidShotId and costs no shot",
    async (badId) => {
      const { camera, repository } = setup();
      const guest = await camera.joinGuest("Tom");

      await expectFailure(camera.takeShot(guest.id, badId, await photoBytes()), "InvalidShotId");

      expect((await camera.getGuest(guest.id)).shotsTaken).toBe(0);
      expect(repository.photos()).toHaveLength(0);
    },
  );

  it("lets an invalid upload be retried under the same shot id with a good photo", async () => {
    const { camera } = setup();
    const guest = await camera.joinGuest("Tom");
    const id = shotId();

    await expectFailure(
      camera.takeShot(guest.id, id, new TextEncoder().encode("dit is geen foto")),
      "InvalidImage",
    );

    await expect(camera.takeShot(guest.id, id, await photoBytes())).resolves.toEqual({
      shotsRemaining: 49,
      shotsPerGuest: 50,
    });
  });
});

/** A blob store whose first write never finishes while `hang` is true. */
class HangingBlobStore extends InMemoryBlobStore {
  hang = true;
  private signal!: () => void;
  private resumeHanging: (() => void) | null = null;
  /** Resolves once a write is hanging. */
  readonly reached = new Promise<void>((resolve) => (this.signal = resolve));

  override async put(key: string, bytes: Uint8Array, contentType: string) {
    if (this.hang) {
      this.signal();
      await new Promise<void>((resolve) => (this.resumeHanging = resolve));
    }
    return super.put(key, bytes, contentType);
  }

  /** Let the hanging write finish (a slow attempt that was not dead after all). */
  resume() {
    this.resumeHanging?.();
  }
}

/** A blob store whose writes fail while `failing` is true. */
class FailingBlobStore extends InMemoryBlobStore {
  failing = true;

  override async put(key: string, bytes: Uint8Array, contentType: string) {
    if (this.failing) throw new Error("storage down");
    return super.put(key, bytes, contentType);
  }
}

/** A repository that cannot record photos. */
class FailingPhotoRepository extends InMemoryRepository {
  override async recordShot(): Promise<ShotRecording> {
    throw new Error("database down");
  }
}
