import { afterEach, describe, expect, it, vi } from "vitest";
import type { ShotResponse } from "./shot-response";
import { uploadShot } from "./upload-shot";

const pending = {
  shotId: "00000000-0000-4000-8000-000000000001",
  photo: new Blob(["x"], { type: "image/jpeg" }),
};

function answer(status: number, body: ShotResponse) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json(body, { status })),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("uploadShot", () => {
  it("turns CaptureClosed into a final capture-closed outcome (not a retry)", async () => {
    answer(409, { ok: false, error: "CaptureClosed" });

    expect(await uploadShot(pending)).toEqual({ kind: "capture-closed" });
  });

  it("still reports success for a Shot the server confirms while closed", async () => {
    answer(200, { ok: true, shotsRemaining: 3, shotsPerGuest: 10 });

    expect(await uploadShot(pending)).toEqual({
      kind: "stored",
      shotsRemaining: 3,
      shotsPerGuest: 10,
    });
  });
});
