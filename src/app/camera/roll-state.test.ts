import { describe, expect, it } from "vitest";
import {
  initialRollState,
  rollReducer,
  shotsRemaining,
  type RollAction,
  type RollState,
  type ServerView,
} from "./roll-state";

let views = 0;
function view(shotsTaken: number, shotsPerGuest: number, captureOpen = true): ServerView {
  views += 1;
  return { viewId: `v${views}`, shotsTaken, shotsPerGuest, captureOpen };
}

function run(state: RollState, ...actions: RollAction[]): RollState {
  return actions.reduce(rollReducer, state);
}

describe("roll state", () => {
  it("starts from the server's view", () => {
    const state = initialRollState(view(5, 50));
    expect(shotsRemaining(state)).toBe(45);
    expect(state.captureOpen).toBe(true);
  });

  it("lower limit, roll-full, then raise limit: the Gast can shoot again", () => {
    // Took 5 of 50; the Host lowers to 3 before the camera has seen it.
    let state = initialRollState(view(5, 50));
    state = run(state, { type: "roll-full" });
    expect(shotsRemaining(state)).toBe(0);

    // The refresh after roll-full shows the lowered limit: still full.
    state = run(state, { type: "server-view", view: view(5, 3), inFlight: 0 });
    expect(shotsRemaining(state)).toBe(0);

    // The Host raises to 20: 15 left, not stuck on "rolletje vol".
    state = run(state, { type: "server-view", view: view(5, 20), inFlight: 0 });
    expect(shotsRemaining(state)).toBe(15);
  });

  it("roll-full lasts until the next server view, even an unchanged one", () => {
    let state = initialRollState(view(5, 10));
    state = run(state, { type: "roll-full" });
    state = run(state, { type: "server-view", view: view(5, 10), inFlight: 0 });
    expect(shotsRemaining(state)).toBe(5);
  });

  it("takes the server's count as-is when nothing is in flight (shots given back)", () => {
    let state = initialRollState(view(8, 10));
    state = run(state, { type: "server-view", view: view(6, 10), inFlight: 0 });
    expect(state.taken).toBe(6);
  });

  it("keeps the higher count while photos are in flight", () => {
    let state = initialRollState(view(5, 10));
    state = run(state, { type: "stored", shotsTaken: 7 });
    state = run(state, { type: "server-view", view: view(6, 10), inFlight: 1 });
    expect(state.taken).toBe(7);
  });

  it("stored answers only move the count up (out of order)", () => {
    let state = initialRollState(view(0, 10));
    state = run(state, { type: "stored", shotsTaken: 2 }, { type: "stored", shotsTaken: 1 });
    expect(state.taken).toBe(2);
  });

  it("takes the Rolletje size only from the server's view, never from an answer", () => {
    let state = initialRollState(view(5, 50));
    state = run(state, { type: "server-view", view: view(5, 20), inFlight: 1 });
    // An answer reserved under the old size of 50 arrives late.
    state = run(state, { type: "stored", shotsTaken: 6 });
    expect(state.perGuest).toBe(20);
    expect(shotsRemaining(state)).toBe(14);
  });

  it("capture-closed holds until a server view says open again", () => {
    let state = initialRollState(view(1, 10));
    state = run(state, { type: "capture-closed" });
    expect(state.captureOpen).toBe(false);
    state = run(state, {
      type: "server-view",
      view: view(1, 10, false),
      inFlight: 0,
    });
    expect(state.captureOpen).toBe(false);
    state = run(state, {
      type: "server-view",
      view: view(1, 10, true),
      inFlight: 0,
    });
    expect(state.captureOpen).toBe(true);
  });
});
