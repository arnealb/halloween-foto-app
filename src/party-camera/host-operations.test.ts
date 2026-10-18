import sharp from "sharp";
import { describe, expect, it } from "vitest";
import {
  createPartyCamera,
  isPartyCameraError,
  MAX_GUEST_NAME_LENGTH,
  THUMB_LONG_SIDE,
  type EventSettings,
} from "@/party-camera";
import {
  FixedClock,
  InMemoryBlobStore,
  InMemoryRepository,
} from "@/party-camera/adapters/in-memory";

/** Counts writes, so tests can see whether a derived image was rendered again. */
class CountingBlobStore extends InMemoryBlobStore {
  puts: string[] = [];

  override async put(key: string, bytes: Uint8Array, contentType: string): Promise<void> {
    this.puts.push(key);
    await super.put(key, bytes, contentType);
  }
}

function setup(settings: Partial<EventSettings> = {}) {
  const repository = new InMemoryRepository(settings);
  const blobStore = new CountingBlobStore();
  const clock = new FixedClock("2026-10-18T20:00:00Z");
  const camera = createPartyCamera({ repository, blobStore, clock });
  return { camera, clock, repository, blobStore };
}

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

/** A Gast takes a Shot; returns its id (= photo id). */
async function shoot(
  camera: ReturnType<typeof setup>["camera"],
  guestId: string,
  bytes?: Uint8Array,
): Promise<string> {
  const id = crypto.randomUUID();
  await camera.takeShot(guestId, id, bytes ?? (await photoBytes()));
  return id;
}

const UNKNOWN_PHOTO = "00000000-0000-4000-8000-000000000000";

describe("getStats", () => {
  it("starts at zero for an Event without Gasten", async () => {
    const { camera } = setup();

    expect(await camera.getStats()).toEqual({
      guestCount: 0,
      photoCount: 0,
      hiddenCount: 0,
      shotsTaken: 0,
      guests: [],
    });
  });

  it("counts Gasten, photos and photos per Gast, Gasten without photos included", async () => {
    const { camera, clock } = setup({ shotsPerGuest: 10 });
    const tom = await camera.joinGuest("Tom");
    clock.advance(1000);
    const sara = await camera.joinGuest("Sara");
    clock.advance(1000);
    const lisa = await camera.joinGuest("Lisa");
    await shoot(camera, tom.id);
    await shoot(camera, tom.id);
    const hidden = await shoot(camera, sara.id);
    await camera.hidePhoto(hidden);

    const stats = await camera.getStats();

    expect(stats).toMatchObject({ guestCount: 3, photoCount: 3, hiddenCount: 1, shotsTaken: 3 });
    expect(
      stats.guests.map(({ id, name, photoCount, hiddenCount, shotsTaken, shotsRemaining }) => ({
        id,
        name,
        photoCount,
        hiddenCount,
        shotsTaken,
        shotsRemaining,
      })),
    ).toEqual([
      { id: tom.id, name: "Tom", photoCount: 2, hiddenCount: 0, shotsTaken: 2, shotsRemaining: 8 },
      { id: sara.id, name: "Sara", photoCount: 1, hiddenCount: 1, shotsTaken: 1, shotsRemaining: 9 },
      { id: lisa.id, name: "Lisa", photoCount: 0, hiddenCount: 0, shotsTaken: 0, shotsRemaining: 10 },
    ]);
  });
});

describe("listAllPhotos", () => {
  async function party() {
    const ctx = setup();
    const { camera, clock } = ctx;
    const tom = await camera.joinGuest("Tom");
    clock.advance(1000);
    const sara = await camera.joinGuest("Sara");
    clock.advance(1000);
    const lisa = await camera.joinGuest("Lisa");
    clock.advance(1000);
    const tom1 = await shoot(camera, tom.id);
    clock.advance(60_000);
    const sara1 = await shoot(camera, sara.id);
    clock.advance(60_000);
    const tom2 = await shoot(camera, tom.id);
    return { ...ctx, tom, sara, lisa, tom1, sara1, tom2 };
  }

  it("lists every photo chronologically, with who took it", async () => {
    const { camera, tom, sara, tom1, sara1, tom2 } = await party();

    const listing = await camera.listAllPhotos({ groupBy: "time" });

    expect(listing.groupBy).toBe("time");
    expect(listing.photos.map((p) => [p.id, p.guestId, p.guestName])).toEqual([
      [tom1, tom.id, "Tom"],
      [sara1, sara.id, "Sara"],
      [tom2, tom.id, "Tom"],
    ]);
    expect(listing.photos[0]).toMatchObject({
      width: 64,
      height: 48,
      hidden: false,
      takenAt: new Date("2026-10-18T20:00:03Z"),
    });
  });

  it("groups photos per Gast, oldest first, including Gasten without photos", async () => {
    const { camera, tom, sara, lisa, tom1, sara1, tom2 } = await party();

    const listing = await camera.listAllPhotos({ groupBy: "guest" });

    expect(listing.groupBy).toBe("guest");
    expect(
      listing.groups.map((g) => [g.guest.id, g.guest.photoCount, g.photos.map((p) => p.id)]),
    ).toEqual([
      [tom.id, 2, [tom1, tom2]],
      [sara.id, 1, [sara1]],
      [lisa.id, 0, []],
    ]);
  });

  it("never lists a photo twice, even if the repository returns it twice", async () => {
    const { camera, repository } = setup();
    const tom = await camera.joinGuest("Tom");
    const id = await shoot(camera, tom.id);
    const listPhotos = repository.listPhotos.bind(repository);
    repository.listPhotos = async () => {
      const photos = await listPhotos();
      return [...photos, ...photos];
    };

    const { photos } = await camera.listAllPhotos({ groupBy: "time" });
    const { groups } = await camera.listAllPhotos({ groupBy: "guest" });

    expect(photos.map((photo) => photo.id)).toEqual([id]);
    expect(groups[0].photos.map((photo) => photo.id)).toEqual([id]);
  });

  it("shows hidden photos to the Host, marked hidden", async () => {
    const { camera, sara1 } = await party();

    await camera.hidePhoto(sara1);

    const { photos } = await camera.listAllPhotos({ groupBy: "time" });
    expect(photos.filter((p) => p.hidden).map((p) => p.id)).toEqual([sara1]);
  });

  it("never exposes where the bytes are stored", async () => {
    const { camera } = await party();

    const { photos } = await camera.listAllPhotos({ groupBy: "time" });

    expect(Object.keys(photos[0])).not.toContain("storageKey");
  });
});

describe("hidePhoto / unhidePhoto", () => {
  it("hides a photo reversibly", async () => {
    const { camera } = setup();
    const tom = await camera.joinGuest("Tom");
    const photo = await shoot(camera, tom.id);

    await camera.hidePhoto(photo);
    expect((await camera.listAllPhotos({ groupBy: "time" })).photos[0].hidden).toBe(true);

    await camera.unhidePhoto(photo);
    expect((await camera.listAllPhotos({ groupBy: "time" })).photos[0].hidden).toBe(false);
  });

  it("gives no shot back", async () => {
    const { camera } = setup({ shotsPerGuest: 2 });
    const tom = await camera.joinGuest("Tom");
    const photo = await shoot(camera, tom.id);
    await shoot(camera, tom.id);

    await camera.hidePhoto(photo);

    expect((await camera.getGuest(tom.id)).shotsTaken).toBe(2);
    await expectFailure(shoot(camera, tom.id), "RollFull");
  });

  it.each([UNKNOWN_PHOTO, "not-a-photo"])("fails with UnknownPhoto for %j", async (id) => {
    const { camera } = setup();

    await expectFailure(camera.hidePhoto(id), "UnknownPhoto");
    await expectFailure(camera.unhidePhoto(id), "UnknownPhoto");
  });
});

describe("deletePhoto", () => {
  it("removes the photo from the listings and the statistics", async () => {
    const { camera } = setup();
    const tom = await camera.joinGuest("Tom");
    const kept = await shoot(camera, tom.id);
    const deleted = await shoot(camera, tom.id);

    await camera.deletePhoto(deleted);

    expect((await camera.listAllPhotos({ groupBy: "time" })).photos.map((p) => p.id)).toEqual([
      kept,
    ]);
    const byGuest = await camera.listAllPhotos({ groupBy: "guest" });
    expect(byGuest.groups[0].photos.map((p) => p.id)).toEqual([kept]);
    expect(await camera.getStats()).toMatchObject({ photoCount: 1 });
  });

  it("removes the original and every derived image from the blob store", async () => {
    const { camera, blobStore } = setup();
    const tom = await camera.joinGuest("Tom");
    const kept = await shoot(camera, tom.id);
    const deleted = await shoot(camera, tom.id);
    await camera.renderPhoto(kept, "thumb", { asHost: true });
    await camera.renderPhoto(deleted, "thumb", { asHost: true });
    const keysBefore = blobStore.keys();
    expect(keysBefore.filter((k) => k.includes(deleted))).toHaveLength(2);

    await camera.deletePhoto(deleted);

    expect(blobStore.keys().filter((k) => k.includes(deleted))).toEqual([]);
    expect(blobStore.keys()).toHaveLength(2);
    await expectFailure(camera.renderPhoto(deleted, "original", { asHost: true }), "UnknownPhoto");
    await expectFailure(camera.renderPhoto(deleted, "thumb", { asHost: true }), "UnknownPhoto");
  });

  it("gives no shot back", async () => {
    const { camera } = setup({ shotsPerGuest: 2 });
    const tom = await camera.joinGuest("Tom");
    const photo = await shoot(camera, tom.id);
    await shoot(camera, tom.id);

    await camera.deletePhoto(photo);

    const guest = await camera.getGuest(tom.id);
    expect(guest.shotsTaken).toBe(2);
    expect(guest.shotsRemaining).toBe(0);
    await expectFailure(shoot(camera, tom.id), "RollFull");
    expect(await camera.getStats()).toMatchObject({ shotsTaken: 2, photoCount: 1 });
  });

  it("never lets a late retry of the deleted Shot bring it back or cost a shot", async () => {
    const { camera, blobStore } = setup();
    const tom = await camera.joinGuest("Tom");
    const id = crypto.randomUUID();
    const bytes = await photoBytes();
    await camera.takeShot(tom.id, id, bytes);

    await camera.deletePhoto(id);
    const retry = await camera.takeShot(tom.id, id, bytes);

    expect(retry).toEqual({ shotsRemaining: 49, shotsPerGuest: 50 });
    expect((await camera.listAllPhotos({ groupBy: "time" })).photos).toEqual([]);
    expect(blobStore.keys()).toEqual([]);
  });

  it.each([UNKNOWN_PHOTO, "not-a-photo"])("fails with UnknownPhoto for %j", async (id) => {
    const { camera } = setup();

    await expectFailure(camera.deletePhoto(id), "UnknownPhoto");
  });

  it("fails with UnknownPhoto when the photo was already deleted", async () => {
    const { camera } = setup();
    const tom = await camera.joinGuest("Tom");
    const photo = await shoot(camera, tom.id);
    await camera.deletePhoto(photo);

    await expectFailure(camera.deletePhoto(photo), "UnknownPhoto");
  });
});

describe("renameGuest", () => {
  it("renames a Gast everywhere the Host sees them", async () => {
    const { camera } = setup();
    const tom = await camera.joinGuest("Tom");
    await shoot(camera, tom.id);

    const renamed = await camera.renameGuest(tom.id, "  Tommy   de Vries ");

    expect(renamed).toMatchObject({ id: tom.id, name: "Tommy de Vries", shotsTaken: 1 });
    expect((await camera.getGuest(tom.id)).name).toBe("Tommy de Vries");
    expect((await camera.listAllPhotos({ groupBy: "time" })).photos[0].guestName).toBe(
      "Tommy de Vries",
    );
    expect((await camera.getStats()).guests[0].name).toBe("Tommy de Vries");
  });

  it.each(["", "   ", "x".repeat(MAX_GUEST_NAME_LENGTH + 1)])(
    "rejects an invalid name (%j) with InvalidName and keeps the old one",
    async (name) => {
      const { camera } = setup();
      const tom = await camera.joinGuest("Tom");

      await expectFailure(camera.renameGuest(tom.id, name), "InvalidName");
      expect((await camera.getGuest(tom.id)).name).toBe("Tom");
    },
  );

  it("fails with UnknownGuest for a Gast that never joined", async () => {
    const { camera } = setup();

    await expectFailure(camera.renameGuest(UNKNOWN_PHOTO, "Tom"), "UnknownGuest");
  });
});

describe("renderPhoto for the Host", () => {
  it("serves the stored original byte for byte", async () => {
    const { camera, repository, blobStore } = setup();
    const tom = await camera.joinGuest("Tom");
    const id = await shoot(camera, tom.id, await photoBytes(1200, 900));
    const [{ storageKey }] = repository.photos();

    const original = await camera.renderPhoto(id, "original", { asHost: true });

    expect(original.contentType).toBe("image/jpeg");
    expect(original.bytes).toEqual(await blobStore.get(storageKey));
  });

  it("serves a smaller JPEG thumbnail with the same aspect ratio", async () => {
    const { camera } = setup();
    const tom = await camera.joinGuest("Tom");
    const id = await shoot(camera, tom.id, await photoBytes(2000, 1500));

    const original = await camera.renderPhoto(id, "original", { asHost: true });
    const thumb = await camera.renderPhoto(id, "thumb", { asHost: true });

    expect(thumb.contentType).toBe("image/jpeg");
    expect(thumb.bytes.byteLength).toBeLessThan(original.bytes.byteLength);
    const meta = await sharp(thumb.bytes).metadata();
    expect(meta.format).toBe("jpeg");
    expect([meta.width, meta.height]).toEqual([THUMB_LONG_SIDE, (THUMB_LONG_SIDE * 3) / 4]);
  });

  it("never enlarges a small photo for its thumbnail", async () => {
    const { camera } = setup();
    const tom = await camera.joinGuest("Tom");
    const id = await shoot(camera, tom.id, await photoBytes(64, 48));

    const meta = await sharp((await camera.renderPhoto(id, "thumb", { asHost: true })).bytes)
      .metadata();

    expect([meta.width, meta.height]).toEqual([64, 48]);
  });

  it("caches the thumbnail in the blob store and does not render it again", async () => {
    const { camera, blobStore } = setup();
    const tom = await camera.joinGuest("Tom");
    const id = await shoot(camera, tom.id, await photoBytes(1200, 900));
    const writesBefore = blobStore.puts.length;

    const first = await camera.renderPhoto(id, "thumb", { asHost: true });
    expect(blobStore.puts.length).toBe(writesBefore + 1);
    const cachedKey = blobStore.puts.at(-1)!;
    expect(cachedKey.startsWith(`derived/${id}/`)).toBe(true);

    const second = await camera.renderPhoto(id, "thumb", { asHost: true });

    expect(blobStore.puts.length).toBe(writesBefore + 1);
    expect(second.bytes).toEqual(first.bytes);
    expect(await blobStore.get(cachedKey)).toEqual(first.bytes);
  });

  it("leaves no cached thumbnail behind when the photo is deleted while rendering it", async () => {
    const { camera, blobStore } = setup();
    const tom = await camera.joinGuest("Tom");
    const id = await shoot(camera, tom.id, await photoBytes(1200, 900));
    // The Host deletes the photo just before the thumbnail lands in the cache.
    const put = blobStore.put.bind(blobStore);
    blobStore.put = async (key, bytes, contentType) => {
      if (key.startsWith("derived/")) await camera.deletePhoto(id);
      await put(key, bytes, contentType);
    };

    await camera.renderPhoto(id, "thumb", { asHost: true });

    expect(blobStore.keys()).toEqual([]);
  });

  it("does not change the original when making a thumbnail", async () => {
    const { camera } = setup();
    const tom = await camera.joinGuest("Tom");
    const id = await shoot(camera, tom.id, await photoBytes(1200, 900));
    const before = await camera.renderPhoto(id, "original", { asHost: true });

    await camera.renderPhoto(id, "thumb", { asHost: true });

    expect((await camera.renderPhoto(id, "original", { asHost: true })).bytes).toEqual(
      before.bytes,
    );
  });

  it.each(["original", "thumb"] as const)(
    "fails with UnknownPhoto for an unknown photo (%s)",
    async (variant) => {
      const { camera } = setup();

      await expectFailure(camera.renderPhoto(UNKNOWN_PHOTO, variant, { asHost: true }), "UnknownPhoto");
      await expectFailure(camera.renderPhoto("../etc/passwd", variant, { asHost: true }), "UnknownPhoto");
    },
  );
});
