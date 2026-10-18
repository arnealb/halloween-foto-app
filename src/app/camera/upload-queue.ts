import type { PendingShot, UploadOutcome } from "./upload-shot";

/**
 * Outcomes the queue hands back; `retry` is handled inside the queue. `failed`:
 * the server kept answering with errors and the queue gave up on this shot.
 */
export type SettledOutcome =
  | Exclude<UploadOutcome, { kind: "retry" }>
  | { kind: "failed" };

export interface UploadQueueState {
  /** Shots not yet settled, including the one being uploaded. */
  pending: number;
  /** True while waiting to retry after a failed attempt (e.g. no connection). */
  waitingToRetry: boolean;
}

export interface UploadQueueOptions {
  /** One upload attempt. A thrown error counts as a network `retry`. */
  upload(shot: PendingShot): Promise<UploadOutcome>;
  /** Called once per shot with its final outcome. */
  onSettled(shot: PendingShot, outcome: SettledOutcome): void;
  /** Called whenever {@link UploadQueueState} changes. */
  onChange?(state: UploadQueueState): void;
  /** Wait before the first retry; doubles per failed attempt. Default 1 s. */
  baseDelayMs?: number;
  /** Longest wait between retries. Default 30 s. */
  maxDelayMs?: number;
  /** Source of jitter in [0, 1); 1 means no jitter. Default `Math.random`. */
  random?: () => number;
  /**
   * Attempts of one shot that may end in a server error before the queue gives
   * up on it (`failed`) and moves on. Network failures do not count. Default 8.
   */
  maxServerErrors?: number;
}

export interface UploadQueue {
  /** Queue a shot for upload. Shots are uploaded one at a time, in order. */
  add(shot: PendingShot): void;
  /** Skip the current wait and retry now (e.g. when the connection is back). */
  retryNow(): void;
  /** Stop: no further attempts or callbacks. */
  dispose(): void;
}

/**
 * An in-memory upload queue that lives as long as the page. Shots go up one
 * at a time (phones on party wifi gain nothing from parallel uploads, and the
 * order is kept). A failed attempt is retried with exponential backoff, always
 * with the same shot id, so a retry whose first attempt did reach the server
 * is not counted twice. Network failures are retried for as long as the page
 * is open; a shot the server keeps failing on is given up after
 * `maxServerErrors` attempts, so it cannot hold back the shots behind it.
 *
 * Framework-free on purpose: the camera wires it to React, tests to fake
 * timers and a fake uploader.
 */
export function createUploadQueue({
  upload,
  onSettled,
  onChange,
  baseDelayMs = 1_000,
  maxDelayMs = 30_000,
  random = Math.random,
  maxServerErrors = 8,
}: UploadQueueOptions): UploadQueue {
  const queue: PendingShot[] = [];
  let busy = false;
  let failedAttempts = 0;
  // Server errors of the shot at the head of the queue.
  let serverErrors = 0;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;

  function notify() {
    if (disposed) return;
    onChange?.({ pending: queue.length, waitingToRetry: retryTimer !== null });
  }

  /** Backoff before retry number `attempt` (1-based), with "equal jitter". */
  function delayFor(attempt: number): number {
    const full = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));
    return full / 2 + (full / 2) * random();
  }

  async function pump() {
    if (busy || disposed || retryTimer !== null || queue.length === 0) return;
    busy = true;
    const shot = queue[0];
    let outcome: UploadOutcome;
    try {
      outcome = await upload(shot);
    } catch {
      outcome = { kind: "retry", reason: "network" };
    }
    busy = false;
    if (disposed) return;

    let settled: SettledOutcome | null = outcome.kind === "retry" ? null : outcome;
    if (outcome.kind === "retry" && outcome.reason === "server") {
      serverErrors += 1;
      if (serverErrors >= maxServerErrors) settled = { kind: "failed" };
    }

    if (settled === null) {
      failedAttempts += 1;
      retryTimer = setTimeout(() => {
        retryTimer = null;
        notify();
        void pump();
      }, delayFor(failedAttempts));
      notify();
      return;
    }

    failedAttempts = 0;
    serverErrors = 0;
    queue.shift();
    notify();
    onSettled(shot, settled);
    void pump();
  }

  return {
    add(shot) {
      if (disposed) return;
      queue.push(shot);
      notify();
      void pump();
    },
    retryNow() {
      if (disposed || retryTimer === null) return;
      clearTimeout(retryTimer);
      retryTimer = null;
      notify();
      void pump();
    },
    dispose() {
      disposed = true;
      if (retryTimer !== null) clearTimeout(retryTimer);
      retryTimer = null;
      queue.length = 0;
    },
  };
}
