/**
 * Domain types and adapter ports for the Party Camera.
 *
 * PartyCamera owns every business rule. It talks to the outside world only
 * through the three ports below (Repository, BlobStore, Clock). Production
 * wires them to Supabase; tests wire them to in-memory adapters and a fixed
 * clock.
 */

// ---------------------------------------------------------------------------
// Domain
// ---------------------------------------------------------------------------

/** A Gast: someone who joined with just their name. Names need not be unique. */
export interface Guest {
  id: string;
  name: string;
  /** Shots taken so far. Never decreases (hiding/deleting a photo gives nothing back). */
  shotsTaken: number;
  createdAt: Date;
}

/** A Gast as seen by the app, including what is left on their Rolletje. */
export interface GuestWithRoll extends Guest {
  /** Size of the Rolletje (the Event's `shotsPerGuest`). */
  shotsPerGuest: number;
  /** Shots still available; 0 means the Rolletje is full. */
  shotsRemaining: number;
}

/**
 * One Shot: a stored photo. The bytes live in the BlobStore under
 * `storageKey`; this is the record of it.
 */
export interface Photo {
  id: string;
  guestId: string;
  /**
   * BlobStore key of the normalized original
   * (`originals/<guestId>/<photoId>-<attemptId>.jpg`: unique per upload attempt,
   * so cleaning up one attempt never touches the bytes of another).
   */
  storageKey: string;
  width: number;
  height: number;
  takenAt: Date;
  /** Hidden by the Host from the Galerij. Never gives a shot back. */
  hidden: boolean;
}

/** A Gast with the photos currently on record (deleted photos are gone, hidden ones count). */
export interface GuestWithPhotoCounts extends Guest {
  /** Photos on record for this Gast, hidden ones included. */
  photoCount: number;
  /** Of those, the ones the Host hid from the Galerij. */
  hiddenCount: number;
}

/** What {@link Repository.reserveShot} is asked to do. */
export interface ShotReservationRequest {
  guestId: string;
  /** Client-generated id of this Shot (lowercase UUID); becomes the photo id. */
  shotId: string;
  /** Id of this one attempt to take the Shot; only it can release its reservation. */
  attemptId: string;
  now: Date;
  /**
   * A pending reservation of the same Shot made before this moment belongs to
   * an attempt that died (e.g. a killed server function). It is taken over by
   * this attempt instead of counting the Shot again.
   */
  staleBefore: Date;
}

/** Outcome of {@link Repository.reserveShot}. */
export type ShotReservation =
  /**
   * The Shot is reserved for this attempt; `shotsTaken` includes it. Either a
   * fresh reservation (one shot taken off the Rolletje) or a takeover of a
   * stale pending one (already counted, so nothing is taken again).
   */
  | { status: "reserved"; shotsTaken: number; shotsPerGuest: number }
  /** The Rolletje was already full; nothing changed. */
  | { status: "roll-full"; shotsTaken: number; shotsPerGuest: number }
  /** No Gast with this id; nothing changed. */
  | { status: "unknown-guest" }
  /** This Shot was taken and stored before (a retried upload); nothing changed. */
  | { status: "already-stored"; shotsTaken: number; shotsPerGuest: number }
  /** Another, still live attempt is storing this Shot right now; nothing changed. */
  | { status: "in-progress" }
  /** The shot id belongs to a different Gast; nothing changed. */
  | { status: "foreign-shot" }
  /**
   * Fotograferen is closed and this is a new Shot; nothing changed. A Shot
   * reserved before closing (stored, or pending) is answered as above instead.
   */
  | { status: "capture-closed" };

/** Outcome of {@link Repository.recordShot}. */
export type ShotRecording =
  /** This attempt's photo is recorded and its Shot marked stored. */
  | "recorded"
  /** Another attempt already stored this Shot; nothing changed. */
  | "already-stored"
  /**
   * This attempt no longer holds the Shot (released, or taken over by a retry
   * after it was presumed dead); nothing recorded.
   */
  | "not-reserved";

export type RevealOverride = "auto" | "open" | "closed";
export type WatermarkPosition =
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right";

/** The single Event's settings (one row in `event_settings`). */
export interface EventSettings {
  title: string;
  welcomeText: string;
  accentColor: string;
  shotsPerGuest: number;
  captureOpen: boolean;
  revealAt: Date | null;
  revealOverride: RevealOverride;
  watermarkEnabled: boolean;
  watermarkText: string;
  watermarkLogoKey: string | null;
  watermarkPosition: WatermarkPosition;
  /** Watermark width relative to the photo width (0..1). */
  watermarkScale: number;
  /** 0..1 */
  watermarkOpacity: number;
  /** Bumped on every settings change; keys derived-image caches. */
  settingsVersion: number;
}

/**
 * What the Host may change with `updateSettings`. Absent fields stay as they
 * are. Reveal and watermark fields join here with their features.
 */
export type SettingsUpdate = Partial<
  Pick<
    EventSettings,
    | "title"
    | "welcomeText"
    | "accentColor"
    | "shotsPerGuest"
    | "captureOpen"
    | "revealAt"
    | "revealOverride"
  >
>;

/** Validated settings values for {@link Repository.updateSettings}. */
export type SettingsChanges = Partial<Omit<EventSettings, "settingsVersion">>;

/** Outcome of {@link Repository.updateSettings}. */
export type SettingsUpdateResult =
  | { status: "updated"; settings: EventSettings }
  /** The settings version was no longer the expected one; nothing changed. */
  | { status: "stale" };

// ---------------------------------------------------------------------------
// Ports (adapters are injected into PartyCamera)
// ---------------------------------------------------------------------------

/**
 * Persistence for Gasten, Shots/photos and the Event settings.
 *
 * Only what the current features need lives here; later features (settings
 * updates, Reveal) extend this interface.
 */
export interface Repository {
  /** Persist a new Gast. Ids are generated by PartyCamera. */
  insertGuest(guest: Guest): Promise<void>;
  /** The Gast with this id, or null if none exists (including malformed ids). */
  findGuest(id: string): Promise<Guest | null>;
  /** The Event settings. There is always exactly one Event. */
  getSettings(): Promise<EventSettings>;

  /**
   * Write already validated settings `changes` and bump `settingsVersion` by
   * one, atomically; returns the settings after the change. Fields absent
   * from `changes` are left as they are. With `expectedVersion`, the change
   * only applies while `settingsVersion` still equals it (compare-and-set);
   * otherwise nothing changes and the result is `stale`. Postgres function
   * `update_event_settings`; it waits for Shot reservations in flight, so no
   * reservation made under the old settings commits after this returns.
   */
  updateSettings(changes: SettingsChanges, expectedVersion?: number): Promise<SettingsUpdateResult>;

  /**
   * Atomically reserve the Shot `shotId` on the Gast's Rolletje. Keyed by the
   * shot id, so a retried upload never counts twice:
   * - a new shot id takes one shot off the Rolletje, only while fotograferen
   *   is open (`captureOpen`) and `shotsTaken` is below the Event's current
   *   `shotsPerGuest` (concurrent calls never pass it);
   * - a shot id that is already stored, or pending for a live attempt, changes
   *   nothing; a stale pending one is taken over (see
   *   {@link ShotReservationRequest.staleBefore}).
   * Postgres function `reserve_shot`; uniqueness enforced by the primary key of
   * `shot_reservations`.
   */
  reserveShot(request: ShotReservationRequest): Promise<ShotReservation>;

  /**
   * Undo the reservation made by attempt `attemptId` after the Shot could not
   * be stored: drop the pending reservation and give the shot back. A no-op if
   * that attempt no longer holds it (taken over, or already stored). Postgres
   * function `release_shot`.
   * @returns whether a pending reservation was released.
   */
  releaseShot(shotId: string, attemptId: string): Promise<boolean>;

  /**
   * Record a stored Shot (`photo.id` is the shot id) and mark its reservation
   * stored, atomically, but only for attempt `attemptId` while it holds the
   * pending reservation. Postgres function `record_shot`.
   */
  recordShot(photo: Photo, attemptId: string): Promise<ShotRecording>;

  /**
   * Every Gast with their photo counts, oldest Gast first. One query
   * (Postgres function `list_guests_with_photo_counts`), never one per Gast.
   */
  listGuests(): Promise<GuestWithPhotoCounts[]>;

  /** Every photo on record (hidden ones included), by `takenAt`, then id. */
  listPhotos(): Promise<Photo[]>;

  /** The photo with this id, or null if none exists (including malformed ids). */
  findPhoto(id: string): Promise<Photo | null>;

  /** Set the photo's hidden flag. @returns whether the photo exists. */
  setPhotoHidden(id: string, hidden: boolean): Promise<boolean>;

  /**
   * Remove the photo record. Its Shot stays counted: the Gast's `shotsTaken`
   * is untouched and the stored reservation of the shot id stays, so a late
   * retry of that Shot is answered "already stored" and never recreates it.
   * @returns whether a photo was removed.
   */
  deletePhoto(id: string): Promise<boolean>;

  /** Change a Gast's name (already validated). @returns whether the Gast exists. */
  renameGuest(id: string, name: string): Promise<boolean>;

  /**
   * One page of the Galerij: photos that are NOT hidden, each with the name of
   * its Gast, ordered by (`takenAt`, id), starting strictly after `after`
   * (keyset paging, so photos added or removed between pages never make a
   * page repeat or skip one). With `guestId`, only that Gast's photos. At most
   * `limit` photos.
   */
  listGalleryPhotos(query: GalleryQuery): Promise<GalleryPhotoRecord[]>;
}

/** What {@link Repository.listGalleryPhotos} is asked for. */
export interface GalleryQuery {
  guestId?: string;
  /** The last photo of the previous page, or absent for the first page. */
  after?: { takenAt: Date; id: string };
  limit: number;
}

/** A visible photo with the name of the Gast who took it. */
export interface GalleryPhotoRecord {
  id: string;
  guestId: string;
  guestName: string;
  width: number;
  height: number;
  takenAt: Date;
}

/** Private byte storage (originals, derived images, watermark logos). */
export interface BlobStore {
  put(key: string, bytes: Uint8Array, contentType: string): Promise<void>;
  /** The stored bytes, or null if the key does not exist. */
  get(key: string): Promise<Uint8Array | null>;
  /** Remove keys; missing keys are ignored. */
  delete(keys: string[]): Promise<void>;
  /**
   * Full keys of the objects directly inside `folder` (no trailing slash),
   * e.g. `list("derived/<photoId>")`. Sub-folders are not descended into.
   */
  list(folder: string): Promise<string[]>;
}

/** Source of the current time, so time-dependent rules (Reveal) are testable. */
export interface Clock {
  now(): Date;
}

export interface PartyCameraDeps {
  repository: Repository;
  blobStore: BlobStore;
  clock: Clock;
  /** Id generator; defaults to `crypto.randomUUID`. */
  newId?: () => string;
}
