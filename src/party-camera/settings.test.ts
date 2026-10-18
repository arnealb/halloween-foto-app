import sharp from "sharp";
import { describe, expect, it } from "vitest";
import {
  createPartyCamera,
  DEFAULT_EVENT_SETTINGS,
  InvalidSettingsError,
  isPartyCameraError,
  MAX_SHOTS_PER_GUEST,
  MAX_TITLE_LENGTH,
  MAX_WELCOME_TEXT_LENGTH,
  PENDING_SHOT_TIMEOUT_MS,
  type EventSettings,
  type SettingsUpdate,
} from "@/party-camera";
import {
  FixedClock,
  InMemoryBlobStore,
  InMemoryRepository,
} from "@/party-camera/adapters/in-memory";

function setup(settings: Partial<EventSettings> = {}) {
  const repository = new InMemoryRepository(settings);
  const blobStore = new InMemoryBlobStore();
  const clock = new FixedClock("2026-10-18T20:00:00Z");
  const camera = createPartyCamera({ repository, blobStore, clock });
  return { camera, clock, repository, blobStore };
}

async function photoBytes(): Promise<Uint8Array> {
  return new Uint8Array(
    await sharp({ create: { width: 64, height: 48, channels: 3, background: "#3366cc" } })
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
}

/** The field errors of a rejected update. */
async function fieldErrors(promise: Promise<unknown>) {
  const error = await failure(promise);
  expect(error).toBeInstanceOf(InvalidSettingsError);
  expect((error as InvalidSettingsError).code).toBe("InvalidSettings");
  return (error as InvalidSettingsError).fieldErrors;
}

describe("updateSettings", () => {
  it("changes title, welcome text, accent color, Rolletje size and fotograferen", async () => {
    const { camera } = setup();

    const updated = await camera.updateSettings({
      title: "Arne wordt 30",
      welcomeText: "Welkom!\nSchiet raak.",
      accentColor: "#22c55e",
      shotsPerGuest: 24,
      captureOpen: false,
    });

    expect(updated).toMatchObject({
      title: "Arne wordt 30",
      welcomeText: "Welkom!\nSchiet raak.",
      accentColor: "#22c55e",
      shotsPerGuest: 24,
      captureOpen: false,
    });
    expect(await camera.getSettings()).toEqual(updated);
  });

  it("leaves fields that are not in the update unchanged", async () => {
    const { camera } = setup({ title: "Feest", shotsPerGuest: 30 });

    const updated = await camera.updateSettings({ accentColor: "#123abc" });

    expect(updated.title).toBe("Feest");
    expect(updated.shotsPerGuest).toBe(30);
    expect(updated.accentColor).toBe("#123abc");
  });

  it("bumps the settings version on every change", async () => {
    const { camera } = setup();
    const before = (await camera.getSettings()).settingsVersion;

    const first = await camera.updateSettings({ title: "Een" });
    const second = await camera.updateSettings({ captureOpen: false });

    expect(first.settingsVersion).toBe(before + 1);
    expect(second.settingsVersion).toBe(before + 2);
  });

  it("keeps the version when the update changes nothing", async () => {
    const { camera } = setup({ title: "Feest" });
    const before = await camera.getSettings();

    const after = await camera.updateSettings({ title: "  Feest ", shotsPerGuest: 50 });

    expect(after).toEqual(before);
  });

  it("trims the title and collapses inner whitespace", async () => {
    const { camera } = setup();

    const updated = await camera.updateSettings({ title: "  Arne   wordt\n30  " });

    expect(updated.title).toBe("Arne wordt 30");
  });

  it.each(["", "   ", "\n"])("rejects an empty title (%j)", async (title) => {
    const { camera } = setup();

    const errors = await fieldErrors(camera.updateSettings({ title }));

    expect(errors.title).toBe("Vul een feestnaam in.");
  });

  it("accepts a title of the maximum length and rejects a longer one", async () => {
    const { camera } = setup();

    await camera.updateSettings({ title: "a".repeat(MAX_TITLE_LENGTH) });
    const errors = await fieldErrors(
      camera.updateSettings({ title: "a".repeat(MAX_TITLE_LENGTH + 1) }),
    );

    expect(errors.title).toMatch(/maximaal/);
  });

  it("allows an empty welcome text, trims it and limits its length", async () => {
    const { camera } = setup({ welcomeText: "Hoi" });

    expect((await camera.updateSettings({ welcomeText: "   " })).welcomeText).toBe("");
    expect((await camera.updateSettings({ welcomeText: " a\r\nb " })).welcomeText).toBe("a\nb");
    const errors = await fieldErrors(
      camera.updateSettings({ welcomeText: "x".repeat(MAX_WELCOME_TEXT_LENGTH + 1) }),
    );
    expect(errors.welcomeText).toMatch(/maximaal/);
  });

  it("stores the accent color in lowercase", async () => {
    const { camera } = setup();

    const updated = await camera.updateSettings({ accentColor: "#AABBCC" });

    expect(updated.accentColor).toBe("#aabbcc");
  });

  it.each([
    "red",
    "#abc",
    "#abcdeg",
    "abcdef",
    "#abcdef0",
    "#abcdef;background:url(x)",
    "#abcde\n",
    "var(--x)",
    "",
  ])("rejects the accent color %j", async (accentColor) => {
    const { camera } = setup();

    const errors = await fieldErrors(camera.updateSettings({ accentColor }));

    expect(errors.accentColor).toMatch(/#rrggbb/);
    expect((await camera.getSettings()).accentColor).toBe(DEFAULT_EVENT_SETTINGS.accentColor);
  });

  it.each([0, -1, 2.5, Number.NaN, Number.POSITIVE_INFINITY, MAX_SHOTS_PER_GUEST + 1])(
    "rejects %s shots per guest",
    async (shotsPerGuest) => {
      const { camera } = setup();

      const errors = await fieldErrors(camera.updateSettings({ shotsPerGuest }));

      expect(errors.shotsPerGuest).toBeDefined();
    },
  );

  it("accepts 1 and the maximum as shots per guest", async () => {
    const { camera } = setup();

    expect((await camera.updateSettings({ shotsPerGuest: 1 })).shotsPerGuest).toBe(1);
    expect(
      (await camera.updateSettings({ shotsPerGuest: MAX_SHOTS_PER_GUEST })).shotsPerGuest,
    ).toBe(MAX_SHOTS_PER_GUEST);
  });

  it("reports every invalid field at once and changes nothing", async () => {
    const { camera } = setup();
    const before = await camera.getSettings();

    const errors = await fieldErrors(
      camera.updateSettings({ title: "", accentColor: "blue", shotsPerGuest: 0 }),
    );

    expect(Object.keys(errors).sort()).toEqual(["accentColor", "shotsPerGuest", "title"]);
    expect(await camera.getSettings()).toEqual(before);
  });

  it("rejects values of the wrong type from an untyped caller", async () => {
    const { camera } = setup();

    const errors = await fieldErrors(
      camera.updateSettings({
        shotsPerGuest: "10",
        captureOpen: "false",
      } as unknown as SettingsUpdate),
    );

    expect(Object.keys(errors).sort()).toEqual(["captureOpen", "shotsPerGuest"]);
  });
});

describe("fotograferen open/dicht", () => {
  it("refuses a new Shot with CaptureClosed while fotograferen is closed, costing nothing", async () => {
    const { camera, repository } = setup();
    const guest = await camera.joinGuest("Tom");
    await camera.updateSettings({ captureOpen: false });

    await expectFailure(
      camera.takeShot(guest.id, crypto.randomUUID(), await photoBytes()),
      "CaptureClosed",
    );

    expect((await camera.getGuest(guest.id)).shotsRemaining).toBe(50);
    expect(repository.photos()).toEqual([]);
  });

  it("refuses with CaptureClosed without looking at the upload", async () => {
    const { camera } = setup({ captureOpen: false });
    const guest = await camera.joinGuest("Tom");

    await expectFailure(
      camera.takeShot(guest.id, crypto.randomUUID(), new Uint8Array([1, 2, 3])),
      "CaptureClosed",
    );
  });

  it("still confirms a retry of a Shot that was stored before closing", async () => {
    const { camera, repository } = setup();
    const guest = await camera.joinGuest("Tom");
    const shotId = crypto.randomUUID();
    const bytes = await photoBytes();
    await camera.takeShot(guest.id, shotId, bytes);
    await camera.updateSettings({ captureOpen: false });

    const retry = await camera.takeShot(guest.id, shotId, bytes);

    expect(retry).toEqual({ shotsRemaining: 49, shotsPerGuest: 50 });
    expect(repository.photos()).toHaveLength(1);
  });

  it("lets a Shot whose upload was underway before closing still be stored by its retry", async () => {
    const repository = new InMemoryRepository();
    const clock = new FixedClock("2026-10-18T20:00:00Z");
    // The first attempt reserves the Shot, then dies while storing the bytes.
    let failPut = true;
    const blobStore = new (class extends InMemoryBlobStore {
      override async put(key: string, bytes: Uint8Array, type: string) {
        if (failPut) {
          clock.advance(PENDING_SHOT_TIMEOUT_MS + 1);
          throw new Error("killed");
        }
        return super.put(key, bytes, type);
      }
    })();
    // Simulate a killed attempt: the reservation is never released.
    repository.releaseShot = async () => false;
    const camera = createPartyCamera({ repository, blobStore, clock });
    const guest = await camera.joinGuest("Tom");
    const shotId = crypto.randomUUID();
    await failure(camera.takeShot(guest.id, shotId, await photoBytes()));
    failPut = false;
    await camera.updateSettings({ captureOpen: false });

    const retry = await camera.takeShot(guest.id, shotId, await photoBytes());

    expect(retry).toEqual({ shotsRemaining: 49, shotsPerGuest: 50 });
    expect(repository.photos().map((p) => p.id)).toEqual([shotId]);
  });

  it("accepts new Shots again after reopening", async () => {
    const { camera } = setup({ captureOpen: false });
    const guest = await camera.joinGuest("Tom");
    await camera.updateSettings({ captureOpen: true });

    const shot = await camera.takeShot(guest.id, crypto.randomUUID(), await photoBytes());

    expect(shot.shotsRemaining).toBe(49);
  });

  it("toggling fotograferen keeps the other settings", async () => {
    const { camera } = setup({ title: "Feest" });

    const closed = await camera.updateSettings({ captureOpen: false });

    expect(closed.title).toBe("Feest");
    expect(closed.captureOpen).toBe(false);
  });
});

describe("changing shotsPerGuest", () => {
  async function guestWithShots(shots: number, settings: Partial<EventSettings> = {}) {
    const context = setup(settings);
    const guest = await context.camera.joinGuest("Tom");
    for (let i = 0; i < shots; i += 1) {
      await context.camera.takeShot(guest.id, crypto.randomUUID(), await photoBytes());
    }
    return { ...context, guest };
  }

  it("raising it gives every Gast more shots at once, also a full Rolletje", async () => {
    const { camera, guest } = await guestWithShots(3, { shotsPerGuest: 3 });
    await expectFailure(
      camera.takeShot(guest.id, crypto.randomUUID(), await photoBytes()),
      "RollFull",
    );

    await camera.updateSettings({ shotsPerGuest: 5 });

    expect(await camera.getGuest(guest.id)).toMatchObject({
      shotsTaken: 3,
      shotsPerGuest: 5,
      shotsRemaining: 2,
    });
    const shot = await camera.takeShot(guest.id, crypto.randomUUID(), await photoBytes());
    expect(shot).toEqual({ shotsRemaining: 1, shotsPerGuest: 5 });
  });

  it("lowering it below what a Gast took leaves a full Rolletje (never negative)", async () => {
    const { camera, guest } = await guestWithShots(4);

    await camera.updateSettings({ shotsPerGuest: 2 });

    expect(await camera.getGuest(guest.id)).toMatchObject({
      shotsTaken: 4,
      shotsPerGuest: 2,
      shotsRemaining: 0,
    });
    await expectFailure(
      camera.takeShot(guest.id, crypto.randomUUID(), await photoBytes()),
      "RollFull",
    );
    const stats = await camera.getStats();
    expect(stats.guests[0]).toMatchObject({ shotsPerGuest: 2, shotsRemaining: 0 });
  });

  it("lowering it to exactly what a Gast took makes the Rolletje full", async () => {
    const { camera, guest } = await guestWithShots(2);

    await camera.updateSettings({ shotsPerGuest: 2 });

    await expectFailure(
      camera.takeShot(guest.id, crypto.randomUUID(), await photoBytes()),
      "RollFull",
    );
  });

  it("a retry of a stored Shot after lowering still succeeds, with a full Rolletje", async () => {
    const { camera, guest } = await guestWithShots(3);
    const shotId = crypto.randomUUID();
    await camera.takeShot(guest.id, shotId, await photoBytes());
    await camera.updateSettings({ shotsPerGuest: 2 });

    const retry = await camera.takeShot(guest.id, shotId, await photoBytes());

    expect(retry).toEqual({ shotsRemaining: 0, shotsPerGuest: 2 });
  });
});

describe("updateSettings with an expected version", () => {
  it("applies the update when the version is still current", async () => {
    const { camera } = setup();
    const { settingsVersion } = await camera.getSettings();
    const saved = await camera.updateSettings(
      { title: "Arne wordt 25" },
      { expectedVersion: settingsVersion },
    );
    expect(saved.title).toBe("Arne wordt 25");
    expect(saved.settingsVersion).toBe(settingsVersion + 1);
  });

  it("refuses a form based on an older version with SettingsChanged, changing nothing", async () => {
    const { camera } = setup();
    const { settingsVersion: shownVersion } = await camera.getSettings();
    // Changed elsewhere (another tab) after the form was shown.
    await camera.updateSettings({ shotsPerGuest: 30 });

    const error = await failure(
      camera.updateSettings(
        { title: "Oud formulier", shotsPerGuest: 50 },
        { expectedVersion: shownVersion },
      ),
    );
    expect(isPartyCameraError(error, "SettingsChanged")).toBe(true);
    expect((error as Error).message).toMatch(/intussen gewijzigd/);
    const after = await camera.getSettings();
    expect(after.title).toBe(DEFAULT_EVENT_SETTINGS.title);
    expect(after.shotsPerGuest).toBe(30);
  });

  it("refuses when the version changes between the check and the write (compare-and-set)", async () => {
    const { camera, repository } = setup();
    const { settingsVersion } = await camera.getSettings();
    // Someone else writes right after PartyCamera read the settings.
    const getSettings = repository.getSettings.bind(repository);
    repository.getSettings = async () => {
      const current = await getSettings();
      repository.getSettings = getSettings;
      await repository.updateSettings({ welcomeText: "Tussendoor" });
      return current;
    };

    await expectFailure(
      camera.updateSettings({ title: "Nieuw" }, { expectedVersion: settingsVersion }),
      "SettingsChanged",
    );
    const after = await camera.getSettings();
    expect(after.title).toBe(DEFAULT_EVENT_SETTINGS.title);
    expect(after.welcomeText).toBe("Tussendoor");
  });

  it("the open/dicht toggle (no expected version) survives a concurrent change", async () => {
    const { camera, repository } = setup();
    const getSettings = repository.getSettings.bind(repository);
    repository.getSettings = async () => {
      const current = await getSettings();
      repository.getSettings = getSettings;
      await repository.updateSettings({ title: "Tussendoor" });
      return current;
    };

    const saved = await camera.updateSettings({ captureOpen: false });
    expect(saved.captureOpen).toBe(false);
    expect(saved.title).toBe("Tussendoor");
  });

  it("treats a missing or malformed version as an outdated form", async () => {
    const { camera } = setup();
    await expectFailure(
      camera.updateSettings({ title: "X" }, { expectedVersion: Number.NaN }),
      "SettingsChanged",
    );
  });
});
