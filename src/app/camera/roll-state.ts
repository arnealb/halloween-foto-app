/**
 * The camera's view of the Rolletje and fotograferen open/dicht: what the
 * server last rendered, corrected by the upload answers that arrived since.
 *
 * Sources and who wins:
 * - A server view (each page render or refresh) is the truth for the Rolletje
 *   size and open/dicht. Its shot count is taken as-is when no photo is in
 *   flight; with photos in flight a lower count may simply be older than an
 *   answer that already arrived, so the higher count is kept.
 * - A "stored" answer moves the count up (answers can arrive out of order;
 *   the highest is the newest). It never changes the Rolletje size: the
 *   answer may have been reserved under an older setting.
 * - "roll-full" marks the Rolletje full until the next server view (the caller
 *   then asks for one), without inventing a shot count.
 * - "capture-closed" marks fotograferen closed until the next server view.
 */
export interface RollState {
  /** Id of the server view this state last adopted. */
  viewId: string;
  taken: number;
  perGuest: number;
  captureOpen: boolean;
  /** The server answered roll-full since the last server view. */
  full: boolean;
}

export interface ServerView {
  /** Unique per server render, so every refresh is adopted. */
  viewId: string;
  shotsTaken: number;
  shotsPerGuest: number;
  captureOpen: boolean;
}

export type RollAction =
  | { type: "server-view"; view: ServerView; inFlight: number }
  | { type: "stored"; shotsTaken: number }
  | { type: "roll-full" }
  | { type: "capture-closed" };

export function initialRollState(view: ServerView): RollState {
  return {
    viewId: view.viewId,
    taken: view.shotsTaken,
    perGuest: view.shotsPerGuest,
    captureOpen: view.captureOpen,
    full: false,
  };
}

export function rollReducer(state: RollState, action: RollAction): RollState {
  switch (action.type) {
    case "server-view": {
      const { view, inFlight } = action;
      return {
        viewId: view.viewId,
        taken: inFlight === 0 ? view.shotsTaken : Math.max(state.taken, view.shotsTaken),
        perGuest: view.shotsPerGuest,
        captureOpen: view.captureOpen,
        full: false,
      };
    }
    case "stored":
      return { ...state, taken: Math.max(state.taken, action.shotsTaken) };
    case "roll-full":
      return { ...state, full: true };
    case "capture-closed":
      return { ...state, captureOpen: false };
  }
}

/** Shots left on the Rolletje, as far as the camera knows. */
export function shotsRemaining(state: RollState): number {
  return state.full ? 0 : Math.max(0, state.perGuest - state.taken);
}
