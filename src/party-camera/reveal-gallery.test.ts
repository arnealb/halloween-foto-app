import sharp from "sharp";
import { describe, expect, it } from "vitest";
import {
  createPartyCamera,
  DISPLAY_LONG_SIDE,
  InvalidSettingsError,
  isPartyCameraError,
  MAX_GALLERY_PAGE_SIZE,
  THUMB_LONG_SIDE,
  type EventSettings,
  type GuestPhotoVariant,
  type RevealOverride,
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

const PARTY = "2026-10-18T20:00:00Z";
const REVEAL = "2026-10-19T10:00:00Z";

function setup(settings: Partial<EventSettings> = {}) {
  const repository = new InMemoryRepository({
    shotsPerGuest: 500,
    ...settings,
  });
  const blobStore = new CountingBlobStore();
  const clock = new FixedClock(PARTY);
  const camera = createPartyCamera({ repository, blobStore, clock });
  return { camera, clock, repository, blobStore };
}

/** An Event that is revealed now (forced open). */
function revealed(settings: Partial<EventSettings> = {}) {
  return setup({ revealOverride: "open", ...settings });
}

async function photoBytes(width = 64, height = 48): Promise<Uint8Array> {
  return new Uint8Array(
    await sharp({
      create: { width, height, channels: 3, background: "#3366cc" },
    })
      .jpeg()
      .toBuffer(),
  );
}

async function failure(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => {
      throw new Error("expected a failure, but the call succeeded");
    },
    (e: unknown) => e,
  );
}

async function expectFailure(promise: Promise<unknown>, code: string) {
  const error = await failure(promise);
  expect(isPartyCameraError(error)).toBe(true);
  expect((error as { code: string }).code).toBe(code);
  return error as Error;
}

type Camera = ReturnType<typeof setup>["camera"];

/** A Gast takes a Shot a minute after the previous one; returns its id. */
async function shoot(
  { camera, clock }: { camera: Camera; clock: FixedClock },
  guestId: string,
  bytes?: Uint8Array,
): Promise<string> {
  clock.advance(60_000);
  const id = crypto.randomUUID();
  await camera.takeShot(guestId, id, bytes ?? (await photoBytes()));
  return id;
}

const UNKNOWN_PHOTO = "00000000-0000-4000-8000-000000000000";

describe("getRevealState", () => {
  const before = "2026-10-19T09:59:59.999Z";
  const exactly = REVEAL;
  const after = "2026-10-20T12:00:00Z";

  it.each<[RevealOverride, string | null, string, boolean, string]>([
    ["auto", REVEAL, before, false, "pending"],
    ["auto", REVEAL, exactly, true, "auto"],
    ["auto", REVEAL, after, true, "auto"],
    ["auto", null, after, false, "pending"],
    ["open", REVEAL, before, true, "forced-open"],
    ["open", REVEAL, after, true, "forced-open"],
    ["open", null, after, true, "forced-open"],
    ["closed", REVEAL, before, false, "forced-closed"],
    ["closed", REVEAL, after, false, "forced-closed"],
    ["closed", null, after, false, "forced-closed"],
  ])(
    "override %s, revealAt %s, now %s: revealed %s (%s)",
    async (override, revealAt, now, isRevealed, reason) => {
      const { camera, clock } = setup({
        revealOverride: override,
        revealAt: revealAt ? new Date(revealAt) : null,
      });
      clock.set(now);

      expect(await camera.getRevealState()).toEqual({
        revealed: isRevealed,
        reason,
        revealAt: revealAt ? new Date(revealAt) : null,
      });
    },
  );

  it("reveals by itself once the clock passes revealAt", async () => {
    const { camera, clock } = setup({ revealAt: new Date(REVEAL) });
    expect((await camera.getRevealState()).revealed).toBe(false);

    clock.set(REVEAL);

    expect((await camera.getRevealState()).revealed).toBe(true);
  });
});

describe("setRevealOverride", () => {
  it("forces open, keeps hidden after revealAt, and goes back to auto", async () => {
    const { camera, clock } = setup({ revealAt: new Date(REVEAL) });

    expect(await camera.setRevealOverride("open")).toMatchObject({
      revealed: true,
      reason: "forced-open",
    });
    clock.set("2026-10-20T00:00:00Z");
    expect(await camera.setRevealOverride("closed")).toMatchObject({
      revealed: false,
      reason: "forced-closed",
    });
    expect(await camera.setRevealOverride("auto")).toMatchObject({
      revealed: true,
      reason: "auto",
    });
    expect((await camera.getSettings()).revealOverride).toBe("auto");
  });

  it("applies on top of a settings change made in between", async () => {
    const { camera } = setup();
    const shown = await camera.getSettings();
    await camera.updateSettings({ title: "Arne wordt 25" });

    await camera.setRevealOverride("open");

    const settings = await camera.getSettings();
    expect(settings.title).toBe("Arne wordt 25");
    expect(settings.revealOverride).toBe("open");
    expect(settings.settingsVersion).toBe(shown.settingsVersion + 2);
  });

  it("refuses an unknown override", async () => {
    const { camera } = setup();

    const error = await failure(camera.setRevealOverride("soon" as RevealOverride));

    expect(error).toBeInstanceOf(InvalidSettingsError);
    expect((await camera.getSettings()).revealOverride).toBe("auto");
  });
});

describe("updateSettings: the Reveal moment", () => {
  it("sets, changes and clears revealAt", async () => {
    const { camera } = setup();

    await camera.updateSettings({ revealAt: new Date(REVEAL) });
    expect((await camera.getSettings()).revealAt).toEqual(new Date(REVEAL));

    await camera.updateSettings({ revealAt: null });
    expect((await camera.getSettings()).revealAt).toBeNull();
  });

  it("refuses an invalid date, with a message for the field", async () => {
    const { camera } = setup();

    for (const revealAt of [new Date("nope"), new Date("20026-01-01T00:00:00Z"), "morgen"]) {
      const error = await failure(camera.updateSettings({ revealAt: revealAt as unknown as Date }));
      expect(error).toBeInstanceOf(InvalidSettingsError);
      expect(Object.keys((error as InvalidSettingsError).fieldErrors)).toEqual(["revealAt"]);
    }
    expect((await camera.getSettings()).revealAt).toBeNull();
  });

  it("writes nothing when the moment does not change", async () => {
    const { camera } = setup({ revealAt: new Date(REVEAL) });
    const { settingsVersion } = await camera.getSettings();

    await camera.updateSettings({ revealAt: new Date(REVEAL) });

    expect((await camera.getSettings()).settingsVersion).toBe(settingsVersion);
  });
});

describe("updateSettings: a Reveal moment in the past", () => {
  it("is refused while the Reveal is automatic, pointing to Nu onthullen", async () => {
    const { camera } = setup({ revealAt: new Date(REVEAL) });

    for (const at of [PARTY, "2026-10-18T19:00:00Z"]) {
      const error = await failure(camera.updateSettings({ revealAt: new Date(at) }));
      expect(error).toBeInstanceOf(InvalidSettingsError);
      expect((error as InvalidSettingsError).fieldErrors.revealAt).toMatch(/Nu onthullen/);
    }
    const settings = await camera.getSettings();
    expect(settings.revealAt).toEqual(new Date(REVEAL));
    expect((await camera.getRevealState()).revealed).toBe(false);
  });

  it("is allowed while the Host overrides the Reveal (it does not open anything)", async () => {
    for (const override of ["open", "closed"] as const) {
      const { camera } = setup({ revealOverride: override });
      await camera.updateSettings({
        revealAt: new Date("2026-10-18T19:00:00Z"),
      });
      expect((await camera.getSettings()).revealAt).toEqual(new Date("2026-10-18T19:00:00Z"));
    }
  });
});

describe("listGallery", () => {
  it("fails with NotRevealed before the Reveal, also when photos exist", async () => {
    const env = setup({ revealAt: new Date(REVEAL) });
    const tom = await env.camera.joinGuest("Tom");
    await shoot(env, tom.id);

    await expectFailure(env.camera.listGallery(), "NotRevealed");
    await expectFailure(env.camera.listGallery({ guestId: tom.id }), "NotRevealed");
  });

  it("fails with NotRevealed when the Host keeps it hidden after revealAt", async () => {
    const env = setup({
      revealAt: new Date("2026-10-18T00:00:00Z"),
      revealOverride: "closed",
    });

    await expectFailure(env.camera.listGallery(), "NotRevealed");
  });

  it("lists every visible photo oldest first, with the photographer's name", async () => {
    const env = revealed();
    const tom = await env.camera.joinGuest("Tom");
    const lisa = await env.camera.joinGuest("Lisa");
    const first = await shoot(env, tom.id, await photoBytes(80, 60));
    const second = await shoot(env, lisa.id);
    const third = await shoot(env, tom.id);

    const page = await env.camera.listGallery();

    expect(page.nextCursor).toBeNull();
    expect(page.photos.map((p) => [p.id, p.guestName])).toEqual([
      [first, "Tom"],
      [second, "Lisa"],
      [third, "Tom"],
    ]);
    expect(page.photos[0]).toEqual({
      id: first,
      guestName: "Tom",
      width: 80,
      height: 60,
      takenAt: new Date(Date.parse(PARTY) + 60_000),
    });
  });

  it("opens by itself once revealAt has passed", async () => {
    const env = setup({ revealAt: new Date(REVEAL) });
    const tom = await env.camera.joinGuest("Tom");
    const id = await shoot(env, tom.id);

    env.clock.set(REVEAL);

    expect((await env.camera.listGallery()).photos.map((p) => p.id)).toEqual([id]);
  });

  it("leaves out hidden and deleted photos", async () => {
    const env = revealed();
    const tom = await env.camera.joinGuest("Tom");
    const kept = await shoot(env, tom.id);
    const hidden = await shoot(env, tom.id);
    const deleted = await shoot(env, tom.id);
    const shownAgain = await shoot(env, tom.id);
    await env.camera.hidePhoto(hidden);
    await env.camera.deletePhoto(deleted);
    await env.camera.hidePhoto(shownAgain);
    await env.camera.unhidePhoto(shownAgain);

    const ids = (await env.camera.listGallery()).photos.map((p) => p.id);

    expect(ids).toEqual([kept, shownAgain]);
  });

  it("shows only one Gast's photos with guestId (mijn foto's)", async () => {
    const env = revealed();
    const tom = await env.camera.joinGuest("Tom");
    const lisa = await env.camera.joinGuest("Lisa");
    const tom1 = await shoot(env, tom.id);
    await shoot(env, lisa.id);
    const tom2 = await shoot(env, tom.id);
    const tomHidden = await shoot(env, tom.id);
    await env.camera.hidePhoto(tomHidden);

    const mine = await env.camera.listGallery({ guestId: tom.id });

    expect(mine.photos.map((p) => p.id)).toEqual([tom1, tom2]);
    expect(mine.photos.every((p) => p.guestName === "Tom")).toBe(true);
    expect((await env.camera.listGallery({ guestId: UNKNOWN_PHOTO })).photos).toEqual([]);
    expect((await env.camera.listGallery({ guestId: "not-a-uuid" })).photos).toEqual([]);
  });

  it("uses the Gast's current name after a rename", async () => {
    const env = revealed();
    const tom = await env.camera.joinGuest("Tom");
    await shoot(env, tom.id);

    await env.camera.renameGuest(tom.id, "Tommy");

    expect((await env.camera.listGallery()).photos[0].guestName).toBe("Tommy");
  });

  it("pages through all photos without repeating or skipping one", async () => {
    const env = revealed();
    const tom = await env.camera.joinGuest("Tom");
    const ids: string[] = [];
    for (let i = 0; i < 7; i++) ids.push(await shoot(env, tom.id));

    const seen: string[] = [];
    let cursor: string | undefined;
    let pages = 0;
    for (;;) {
      const page = await env.camera.listGallery({ limit: 3, cursor });
      pages += 1;
      expect(page.photos.length).toBeLessThanOrEqual(3);
      seen.push(...page.photos.map((p) => p.id));
      if (!page.nextCursor) break;
      cursor = page.nextCursor;
    }

    expect(seen).toEqual(ids);
    expect(pages).toBe(3);
  });

  it("keeps paging correctly when photos are added or hidden between pages", async () => {
    const env = revealed();
    const tom = await env.camera.joinGuest("Tom");
    const ids: string[] = [];
    for (let i = 0; i < 4; i++) ids.push(await shoot(env, tom.id));

    const first = await env.camera.listGallery({ limit: 2 });
    await env.camera.hidePhoto(ids[0]);
    await env.camera.hidePhoto(ids[2]);
    const later = await shoot(env, tom.id);
    const second = await env.camera.listGallery({
      limit: 2,
      cursor: first.nextCursor!,
    });

    expect(first.photos.map((p) => p.id)).toEqual(ids.slice(0, 2));
    expect(second.photos.map((p) => p.id)).toEqual([ids[3], later]);
  });

  it("caps the page size and treats a malformed cursor as the end", async () => {
    const env = revealed();
    const tom = await env.camera.joinGuest("Tom");
    await shoot(env, tom.id);

    const huge = await env.camera.listGallery({ limit: 1_000_000 });
    expect(huge.photos).toHaveLength(1);
    expect(MAX_GALLERY_PAGE_SIZE).toBeGreaterThan(0);

    expect(await env.camera.listGallery({ cursor: "garbage" })).toEqual({
      photos: [],
      nextCursor: null,
    });
  });
});

describe("renderPhoto for Gasten", () => {
  const GUEST = { asHost: false } as const;

  it("serves thumb and display after the Reveal, smaller than the original", async () => {
    const env = revealed();
    const tom = await env.camera.joinGuest("Tom");
    const id = await shoot(env, tom.id, await photoBytes(2400, 1800));
    const original = await env.camera.renderPhoto(id, "original", {
      asHost: true,
    });

    const thumb = await env.camera.renderPhoto(id, "thumb", GUEST);
    const display = await env.camera.renderPhoto(id, "display", GUEST);

    for (const rendered of [thumb, display]) {
      expect(rendered.contentType).toBe("image/jpeg");
      expect(rendered.bytes.byteLength).toBeLessThan(original.bytes.byteLength);
    }
    const thumbMeta = await sharp(thumb.bytes).metadata();
    const displayMeta = await sharp(display.bytes).metadata();
    expect([thumbMeta.width, thumbMeta.height]).toEqual([
      THUMB_LONG_SIDE,
      (THUMB_LONG_SIDE * 3) / 4,
    ]);
    expect([displayMeta.width, displayMeta.height]).toEqual([
      DISPLAY_LONG_SIDE,
      (DISPLAY_LONG_SIDE * 3) / 4,
    ]);
  });

  it("never serves the original to a Gast", async () => {
    const env = revealed();
    const tom = await env.camera.joinGuest("Tom");
    const id = await shoot(env, tom.id);

    await expectFailure(
      env.camera.renderPhoto(id, "original" as GuestPhotoVariant, GUEST),
      "UnknownPhoto",
    );
    // Not even by leaving out or garbling the options.
    await expectFailure(
      env.camera.renderPhoto(id, "original", {} as { asHost: true }),
      "UnknownPhoto",
    );
  });

  it("refuses before the Reveal, hidden photos and unknown photos with the same error", async () => {
    const env = setup({ revealAt: new Date(REVEAL) });
    const tom = await env.camera.joinGuest("Tom");
    const visible = await shoot(env, tom.id);
    const hidden = await shoot(env, tom.id);
    await env.camera.hidePhoto(hidden);

    const notRevealed = await expectFailure(
      env.camera.renderPhoto(visible, "thumb", GUEST),
      "UnknownPhoto",
    );
    await expectFailure(env.camera.renderPhoto(visible, "display", GUEST), "UnknownPhoto");

    env.clock.set(REVEAL);
    await env.camera.renderPhoto(visible, "thumb", GUEST);
    const hiddenError = await expectFailure(
      env.camera.renderPhoto(hidden, "display", GUEST),
      "UnknownPhoto",
    );
    const unknownError = await expectFailure(
      env.camera.renderPhoto(UNKNOWN_PHOTO, "display", GUEST),
      "UnknownPhoto",
    );
    await expectFailure(env.camera.renderPhoto("../etc/passwd", "thumb", GUEST), "UnknownPhoto");

    expect(notRevealed.message).toBe(unknownError.message);
    expect(hiddenError.message).toBe(unknownError.message);
  });

  it("refuses again once the Host keeps the Galerij hidden, or hides the photo", async () => {
    const env = revealed();
    const tom = await env.camera.joinGuest("Tom");
    const id = await shoot(env, tom.id);
    await env.camera.renderPhoto(id, "thumb", GUEST);

    await env.camera.setRevealOverride("closed");
    await expectFailure(env.camera.renderPhoto(id, "thumb", GUEST), "UnknownPhoto");

    await env.camera.setRevealOverride("open");
    await env.camera.hidePhoto(id);
    await expectFailure(env.camera.renderPhoto(id, "thumb", GUEST), "UnknownPhoto");
  });

  it("deleted photos are gone for Gasten too", async () => {
    const env = revealed();
    const tom = await env.camera.joinGuest("Tom");
    const id = await shoot(env, tom.id);
    await env.camera.renderPhoto(id, "display", GUEST);

    await env.camera.deletePhoto(id);

    await expectFailure(env.camera.renderPhoto(id, "display", GUEST), "UnknownPhoto");
    expect(env.blobStore.keys().filter((key) => key.includes(id))).toEqual([]);
  });

  it("the Host still sees a hidden photo before the Reveal", async () => {
    const env = setup();
    const tom = await env.camera.joinGuest("Tom");
    const id = await shoot(env, tom.id, await photoBytes(2400, 1800));
    await env.camera.hidePhoto(id);

    const display = await env.camera.renderPhoto(id, "display", {
      asHost: true,
    });

    expect((await sharp(display.bytes).metadata()).width).toBe(DISPLAY_LONG_SIDE);
  });

  it("renders each variant once and caches it under the photo, variant and render key", async () => {
    const env = revealed();
    const tom = await env.camera.joinGuest("Tom");
    const id = await shoot(env, tom.id, await photoBytes(1200, 900));
    const writesBefore = env.blobStore.puts.length;

    const thumb = await env.camera.renderPhoto(id, "thumb", GUEST);
    const display = await env.camera.renderPhoto(id, "display", GUEST);
    const newKeys = env.blobStore.puts.slice(writesBefore);
    expect(newKeys).toEqual([`derived/${id}/thumb-plain.jpg`, `derived/${id}/display-plain.jpg`]);

    expect((await env.camera.renderPhoto(id, "thumb", GUEST)).bytes).toEqual(thumb.bytes);
    expect((await env.camera.renderPhoto(id, "display", GUEST)).bytes).toEqual(display.bytes);
    // Without a watermark the Host's thumbnail is the same image: no extra render.
    await env.camera.renderPhoto(id, "thumb", { asHost: true });
    expect(env.blobStore.puts.length).toBe(writesBefore + 2);
  });
});

describe("derived images: render key and preparing ahead", () => {
  const GUEST = { asHost: false } as const;

  it("keeps the Galerij's cached images across Reveal, override and title changes", async () => {
    const env = revealed({ watermarkEnabled: true, watermarkText: "Arne 25" });
    const tom = await env.camera.joinGuest("Tom");
    const id = await shoot(env, tom.id, await photoBytes(1200, 900));
    await env.camera.renderPhoto(id, "thumb", GUEST);
    const writes = env.blobStore.puts.length;
    const [key] = env.blobStore.puts.slice(-1);
    expect(key).toMatch(new RegExp(`^derived/${id}/thumb-wm-[0-9a-f]{12}\\.jpg$`));

    await env.camera.updateSettings({
      title: "Arne wordt 25",
      revealAt: new Date(REVEAL),
    });
    await env.camera.setRevealOverride("closed");
    await env.camera.setRevealOverride("open");
    await env.camera.renderPhoto(id, "thumb", GUEST);

    expect(env.blobStore.puts.length).toBe(writes);
  });

  it("renders again when a watermark field changes", async () => {
    const env = revealed({ watermarkEnabled: true, watermarkText: "Arne 25" });
    const tom = await env.camera.joinGuest("Tom");
    const id = await shoot(env, tom.id, await photoBytes(1200, 900));
    await env.camera.renderPhoto(id, "thumb", GUEST);
    const first = env.blobStore.puts.at(-1);

    await env.repository.updateSettings({ watermarkText: "Arne 26" });
    await env.camera.renderPhoto(id, "thumb", GUEST);

    const second = env.blobStore.puts.at(-1);
    expect(second).not.toBe(first);
    expect(second).toMatch(/thumb-wm-/);
  });

  it("renders the same image only once when asked for it at the same time", async () => {
    const env = revealed();
    const tom = await env.camera.joinGuest("Tom");
    const id = await shoot(env, tom.id, await photoBytes(1200, 900));
    const writes = env.blobStore.puts.length;

    const results = await Promise.all(
      Array.from({ length: 5 }, () => env.camera.renderPhoto(id, "display", GUEST)),
    );

    expect(env.blobStore.puts.length).toBe(writes + 1);
    for (const result of results) expect(result.bytes).toEqual(results[0].bytes);
  });

  it("prepares thumb and display ahead, so the Galerij renders nothing", async () => {
    const env = setup({ revealAt: new Date(REVEAL) });
    const tom = await env.camera.joinGuest("Tom");
    const id = await shoot(env, tom.id, await photoBytes(1200, 900));

    await env.camera.prepareDerivatives(id);
    const writes = env.blobStore.puts.length;
    expect(env.blobStore.puts.slice(-2)).toEqual([
      `derived/${id}/thumb-plain.jpg`,
      `derived/${id}/display-plain.jpg`,
    ]);

    // Still nothing for Gasten before the Reveal.
    expect(
      isPartyCameraError(await failure(env.camera.renderPhoto(id, "thumb", GUEST)), "UnknownPhoto"),
    ).toBe(true);

    env.clock.set(REVEAL);
    await env.camera.renderPhoto(id, "thumb", GUEST);
    await env.camera.renderPhoto(id, "display", GUEST);
    expect(env.blobStore.puts.length).toBe(writes);
  });

  it("skips an unknown photo quietly", async () => {
    const env = setup();
    await expect(
      env.camera.prepareDerivatives("8b0c7c1e-1d3c-4c4f-9e7c-2f1d3c4b5a69"),
    ).resolves.toBeUndefined();
    await expect(env.camera.prepareDerivatives("nope")).resolves.toBeUndefined();
    expect(env.blobStore.puts).toEqual([]);
  });
});
