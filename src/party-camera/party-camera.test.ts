import { describe, expect, it } from "vitest";
import {
  createPartyCamera,
  DEFAULT_EVENT_SETTINGS,
  isPartyCameraError,
  MAX_GUEST_NAME_LENGTH,
  type EventSettings,
} from "@/party-camera";
import {
  FixedClock,
  InMemoryBlobStore,
  InMemoryRepository,
} from "@/party-camera/adapters/in-memory";

function setup(settings: Partial<EventSettings> = {}) {
  const clock = new FixedClock("2026-10-18T20:00:00Z");
  const camera = createPartyCamera({
    repository: new InMemoryRepository(settings),
    blobStore: new InMemoryBlobStore(),
    clock,
  });
  return { camera, clock };
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
