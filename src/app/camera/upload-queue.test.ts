import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createUploadQueue, type UploadQueueState } from "./upload-queue";
import type { PendingShot, UploadOutcome } from "./upload-shot";

const stored = (shotsRemaining: number): UploadOutcome => ({
  kind: "stored",
  shotsRemaining,
  shotsPerGuest: 50,
});
const retry: UploadOutcome = { kind: "retry", reason: "network" };
const serverError: UploadOutcome = { kind: "retry", reason: "server" };

function shot(n: number): PendingShot {
  return { shotId: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`, photo: new Blob([`${n}`]) };
}

/**
 * A fake uploader: each call waits until the test answers it, so the test
 * controls exactly when and how every attempt ends.
 */
function fakeUploader() {
  const calls: { shot: PendingShot; at: number; answer(o: UploadOutcome | Error): void }[] = [];
  const upload = vi.fn(
    (s: PendingShot) =>
      new Promise<UploadOutcome>((resolve, reject) => {
        calls.push({
          shot: s,
          at: Date.now(),
          answer: (o) => (o instanceof Error ? reject(o) : resolve(o)),
        });
      }),
  );
  return { upload, calls };
}

function setup(
  options: { baseDelayMs?: number; maxDelayMs?: number; maxServerErrors?: number } = {},
) {
  const uploader = fakeUploader();
  const settled: { shotId: string; kind: string }[] = [];
  const states: UploadQueueState[] = [];
  const queue = createUploadQueue({
    upload: uploader.upload,
    onSettled: (s, outcome) => settled.push({ shotId: s.shotId, kind: outcome.kind }),
    onChange: (state) => states.push(state),
    random: () => 1, // no jitter: delays are exactly base * 2^n
    ...options,
  });
  const lastState = () => states.at(-1);
  return { queue, ...uploader, settled, lastState };
}

/** Let pending promise callbacks run without moving the clock. */
const flush = () => vi.advanceTimersByTimeAsync(0);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
});
afterEach(() => {
  vi.useRealTimers();
});

describe("upload queue", () => {
  it("uploads shots one at a time, in the order they were taken", async () => {
    const { queue, calls, settled } = setup();

    queue.add(shot(1));
    queue.add(shot(2));
    await flush();
    expect(calls.map((c) => c.shot.shotId)).toEqual([shot(1).shotId]);

    calls[0].answer(stored(49));
    await flush();
    expect(calls.map((c) => c.shot.shotId)).toEqual([shot(1).shotId, shot(2).shotId]);

    calls[1].answer(stored(48));
    await flush();
    expect(settled).toEqual([
      { shotId: shot(1).shotId, kind: "stored" },
      { shotId: shot(2).shotId, kind: "stored" },
    ]);
  });

  it("counts every unsettled shot as pending, including the one uploading", async () => {
    const { queue, calls, lastState } = setup();

    queue.add(shot(1));
    queue.add(shot(2));
    queue.add(shot(3));
    await flush();
    expect(lastState()).toEqual({ pending: 3, waitingToRetry: false });

    calls[0].answer(stored(49));
    await flush();
    expect(lastState()?.pending).toBe(2);

    calls[1].answer(stored(48));
    await flush();
    calls[2].answer(stored(47));
    await flush();
    expect(lastState()).toEqual({ pending: 0, waitingToRetry: false });
  });

  it("retries a failed upload with exponential backoff, always with the same shot id", async () => {
    const { queue, calls, settled, lastState } = setup({ baseDelayMs: 1_000 });

    queue.add(shot(1));
    await flush();
    for (let attempt = 0; attempt < 3; attempt++) {
      calls[attempt].answer(retry);
      await flush();
      expect(lastState()).toEqual({ pending: 1, waitingToRetry: true });
      await vi.advanceTimersByTimeAsync(1_000 * 2 ** attempt);
    }
    calls[3].answer(stored(49));
    await flush();

    expect(calls.map((c) => c.at)).toEqual([0, 1_000, 3_000, 7_000]);
    expect(new Set(calls.map((c) => c.shot.shotId))).toEqual(new Set([shot(1).shotId]));
    expect(settled).toEqual([{ shotId: shot(1).shotId, kind: "stored" }]);
    expect(lastState()).toEqual({ pending: 0, waitingToRetry: false });
  });

  it("does not retry before the backoff has passed", async () => {
    const { queue, calls } = setup({ baseDelayMs: 1_000 });

    queue.add(shot(1));
    await flush();
    calls[0].answer(retry);
    await vi.advanceTimersByTimeAsync(999);

    expect(calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(calls).toHaveLength(2);
  });

  it("caps the backoff at maxDelayMs and keeps retrying while the page is open", async () => {
    const { queue, calls } = setup({ baseDelayMs: 1_000, maxDelayMs: 5_000 });

    queue.add(shot(1));
    await flush();
    for (let i = 0; i < 10; i++) {
      calls[i].answer(retry);
      await vi.advanceTimersToNextTimerAsync();
    }

    const gaps = calls.slice(1).map((c, i) => c.at - calls[i].at);
    expect(gaps).toEqual([1_000, 2_000, 4_000, 5_000, 5_000, 5_000, 5_000, 5_000, 5_000, 5_000]);
  });

  it("treats a thrown upload error as a failed attempt", async () => {
    const { queue, calls, settled } = setup({ baseDelayMs: 100 });

    queue.add(shot(1));
    await flush();
    calls[0].answer(new Error("network down"));
    await vi.advanceTimersByTimeAsync(100);
    calls[1].answer(stored(49));
    await flush();

    expect(settled).toEqual([{ shotId: shot(1).shotId, kind: "stored" }]);
  });

  it("holds later shots back until the failing one is through", async () => {
    const { queue, calls } = setup({ baseDelayMs: 1_000 });

    queue.add(shot(1));
    queue.add(shot(2));
    await flush();
    calls[0].answer(retry);
    await vi.advanceTimersByTimeAsync(1_000);

    expect(calls.map((c) => c.shot.shotId)).toEqual([shot(1).shotId, shot(1).shotId]);
  });

  it("starts the backoff over for the next shot after a success", async () => {
    const { queue, calls } = setup({ baseDelayMs: 1_000 });

    queue.add(shot(1));
    queue.add(shot(2));
    await flush();
    calls[0].answer(retry);
    await vi.advanceTimersByTimeAsync(1_000);
    calls[1].answer(retry);
    await vi.advanceTimersByTimeAsync(2_000);
    calls[2].answer(stored(49));
    await flush();
    const secondShotStart = Date.now();
    calls[3].answer(retry);
    await vi.advanceTimersByTimeAsync(1_000);

    expect(calls[4].at - secondShotStart).toBe(1_000);
  });

  it("treats capture-closed as final: no retry, and the next shot is still tried", async () => {
    const { queue, calls, settled, lastState } = setup({ baseDelayMs: 100 });

    queue.add(shot(1));
    queue.add(shot(2));
    await flush();
    calls[0].answer({ kind: "capture-closed" });
    await flush();

    expect(settled).toEqual([{ shotId: shot(1).shotId, kind: "capture-closed" }]);
    // Shot 2 may have been stored before closing (its answer got lost), so it
    // still goes up once; the server confirms or refuses it.
    expect(calls.map((c) => c.shot.shotId)).toEqual([shot(1).shotId, shot(2).shotId]);
    calls[1].answer(stored(49));
    await flush();
    await vi.advanceTimersByTimeAsync(10_000);

    expect(calls).toHaveLength(2);
    expect(settled).toEqual([
      { shotId: shot(1).shotId, kind: "capture-closed" },
      { shotId: shot(2).shotId, kind: "stored" },
    ]);
    expect(lastState()).toEqual({ pending: 0, waitingToRetry: false });
  });

  it("gives up on a shot after maxServerErrors server errors and moves on to the next", async () => {
    const { queue, calls, settled, lastState } = setup({ baseDelayMs: 100, maxServerErrors: 3 });

    queue.add(shot(1));
    queue.add(shot(2));
    await flush();
    calls[0].answer(serverError);
    await vi.advanceTimersToNextTimerAsync();
    calls[1].answer(retry); // a network failure in between does not count
    await vi.advanceTimersToNextTimerAsync();
    calls[2].answer(serverError);
    await vi.advanceTimersToNextTimerAsync();
    calls[3].answer(serverError);
    await flush();

    expect(settled).toEqual([{ shotId: shot(1).shotId, kind: "failed" }]);
    expect(calls.map((c) => c.shot.shotId)).toEqual([
      ...Array(4).fill(shot(1).shotId),
      shot(2).shotId,
    ]);
    expect(lastState()).toEqual({ pending: 1, waitingToRetry: false });
  });

  it("counts server errors per shot", async () => {
    const { queue, calls, settled } = setup({ baseDelayMs: 100, maxServerErrors: 2 });

    queue.add(shot(1));
    queue.add(shot(2));
    await flush();
    calls[0].answer(serverError);
    await vi.advanceTimersToNextTimerAsync();
    calls[1].answer(stored(49));
    await flush();
    calls[2].answer(serverError);
    await vi.advanceTimersToNextTimerAsync();
    calls[3].answer(stored(48));
    await flush();

    expect(settled.map((s) => s.kind)).toEqual(["stored", "stored"]);
  });

  it("never gives up on network failures", async () => {
    const { queue, calls, settled } = setup({ baseDelayMs: 100, maxServerErrors: 2 });

    queue.add(shot(1));
    await flush();
    for (let i = 0; i < 20; i++) {
      calls[i].answer(retry);
      await vi.advanceTimersToNextTimerAsync();
    }

    expect(settled).toEqual([]);
    expect(calls).toHaveLength(21);
  });

  it.each([
    [{ kind: "roll-full" } as UploadOutcome],
    [{ kind: "no-session" } as UploadOutcome],
    [{ kind: "rejected" } as UploadOutcome],
  ])("settles a shot with %o without retrying and moves on", async (outcome) => {
    const { queue, calls, settled } = setup();

    queue.add(shot(1));
    queue.add(shot(2));
    await flush();
    calls[0].answer(outcome);
    await flush();

    expect(settled).toEqual([{ shotId: shot(1).shotId, kind: outcome.kind }]);
    expect(calls.map((c) => c.shot.shotId)).toEqual([shot(1).shotId, shot(2).shotId]);
  });

  it("retries right away on retryNow (e.g. back online)", async () => {
    const { queue, calls, lastState } = setup({ baseDelayMs: 30_000 });

    queue.add(shot(1));
    await flush();
    calls[0].answer(retry);
    await flush();
    queue.retryNow();
    await flush();

    expect(calls).toHaveLength(2);
    expect(lastState()?.waitingToRetry).toBe(false);
  });

  it("ignores retryNow while an upload is running", async () => {
    const { queue, calls } = setup();

    queue.add(shot(1));
    await flush();
    queue.retryNow();
    await flush();

    expect(calls).toHaveLength(1);
  });

  it("stops completely when disposed", async () => {
    const { queue, calls, settled } = setup({ baseDelayMs: 1_000 });

    queue.add(shot(1));
    await flush();
    calls[0].answer(retry);
    await flush();
    queue.dispose();
    await vi.advanceTimersByTimeAsync(60_000);
    queue.add(shot(2));
    await flush();

    expect(calls).toHaveLength(1);
    expect(settled).toEqual([]);
  });
});
