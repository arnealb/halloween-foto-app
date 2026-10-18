import { DEFAULT_EVENT_SETTINGS } from "../defaults";
import type {
  BlobStore,
  Clock,
  EventSettings,
  Guest,
  GuestWithPhotoCounts,
  Photo,
  Repository,
  SettingsChanges,
  SettingsUpdateResult,
  ShotRecording,
  ShotReservation,
  ShotReservationRequest,
} from "../types";

interface ReservationRecord {
  guestId: string;
  attemptId: string;
  status: "pending" | "stored";
  reservedAt: Date;
}

/** Repository kept in memory. Used by tests; mirrors the Supabase semantics. */
export class InMemoryRepository implements Repository {
  private readonly guests = new Map<string, Guest>();
  private readonly photoRecords = new Map<string, Photo>();
  private readonly reservations = new Map<string, ReservationRecord>();
  private settings: EventSettings;

  constructor(settings: Partial<EventSettings> = {}) {
    this.settings = { ...DEFAULT_EVENT_SETTINGS, ...settings };
  }

  async insertGuest(guest: Guest): Promise<void> {
    if (this.guests.has(guest.id)) {
      throw new Error(`Guest ${guest.id} already exists`);
    }
    this.guests.set(guest.id, { ...guest });
  }

  async findGuest(id: string): Promise<Guest | null> {
    const guest = this.guests.get(id);
    return guest ? { ...guest } : null;
  }

  async getSettings(): Promise<EventSettings> {
    return { ...this.settings };
  }

  async updateSettings(
    changes: SettingsChanges,
    expectedVersion?: number,
  ): Promise<SettingsUpdateResult> {
    if (expectedVersion !== undefined && expectedVersion !== this.settings.settingsVersion) {
      return { status: "stale" };
    }
    const defined = Object.fromEntries(
      Object.entries(changes).filter(([, value]) => value !== undefined),
    );
    this.settings = {
      ...this.settings,
      ...defined,
      settingsVersion: this.settings.settingsVersion + 1,
    };
    return { status: "updated", settings: { ...this.settings } };
  }

  // Each method below runs synchronously (no await in between), so like the
  // Postgres functions (which lock the Gast row) it is atomic with respect to
  // other concurrent calls.
  async reserveShot({
    guestId,
    shotId,
    attemptId,
    now,
    staleBefore,
  }: ShotReservationRequest): Promise<ShotReservation> {
    const guest = this.guests.get(guestId);
    if (!guest) return { status: "unknown-guest" };
    const { shotsPerGuest, captureOpen } = this.settings;

    const existing = this.reservations.get(shotId);
    if (existing) {
      if (existing.guestId !== guestId) return { status: "foreign-shot" };
      if (existing.status === "stored") {
        return { status: "already-stored", shotsTaken: guest.shotsTaken, shotsPerGuest };
      }
      if (existing.reservedAt >= staleBefore) return { status: "in-progress" };
      // Take over a pending reservation of a dead attempt: already counted.
      existing.attemptId = attemptId;
      existing.reservedAt = new Date(now);
      return { status: "reserved", shotsTaken: guest.shotsTaken, shotsPerGuest };
    }

    // A new Shot while fotograferen is closed. (Shots reserved before closing
    // were answered above and still complete.)
    if (!captureOpen) return { status: "capture-closed" };

    // Give back the shots of this Gast's dead attempts (other shot ids).
    for (const [id, r] of this.reservations) {
      if (r.guestId === guestId && r.status === "pending" && r.reservedAt < staleBefore) {
        this.reservations.delete(id);
        guest.shotsTaken = Math.max(0, guest.shotsTaken - 1);
      }
    }

    if (guest.shotsTaken >= shotsPerGuest) {
      return { status: "roll-full", shotsTaken: guest.shotsTaken, shotsPerGuest };
    }
    this.reservations.set(shotId, {
      guestId,
      attemptId,
      status: "pending",
      reservedAt: new Date(now),
    });
    guest.shotsTaken += 1;
    return { status: "reserved", shotsTaken: guest.shotsTaken, shotsPerGuest };
  }

  async releaseShot(shotId: string, attemptId: string): Promise<boolean> {
    const reservation = this.reservations.get(shotId);
    if (
      !reservation ||
      reservation.status !== "pending" ||
      reservation.attemptId !== attemptId
    ) {
      return false;
    }
    this.reservations.delete(shotId);
    const guest = this.guests.get(reservation.guestId);
    if (guest && guest.shotsTaken > 0) guest.shotsTaken -= 1;
    return true;
  }

  async recordShot(photo: Photo, attemptId: string): Promise<ShotRecording> {
    const reservation = this.reservations.get(photo.id);
    if (!reservation || reservation.guestId !== photo.guestId) return "not-reserved";
    if (reservation.status === "stored") return "already-stored";
    if (reservation.attemptId !== attemptId) return "not-reserved";
    reservation.status = "stored";
    if (!this.photoRecords.has(photo.id)) {
      this.photoRecords.set(photo.id, { ...photo });
    }
    return "recorded";
  }

  async listGuests(): Promise<GuestWithPhotoCounts[]> {
    return [...this.guests.values()]
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || compare(a.id, b.id))
      .map((guest) => {
        let photoCount = 0;
        let hiddenCount = 0;
        for (const photo of this.photoRecords.values()) {
          if (photo.guestId !== guest.id) continue;
          photoCount += 1;
          if (photo.hidden) hiddenCount += 1;
        }
        return { ...guest, photoCount, hiddenCount };
      });
  }

  async listPhotos(): Promise<Photo[]> {
    return this.photos().sort(
      (a, b) => a.takenAt.getTime() - b.takenAt.getTime() || compare(a.id, b.id),
    );
  }

  async findPhoto(id: string): Promise<Photo | null> {
    const photo = this.photoRecords.get(id);
    return photo ? { ...photo } : null;
  }

  async setPhotoHidden(id: string, hidden: boolean): Promise<boolean> {
    const photo = this.photoRecords.get(id);
    if (!photo) return false;
    photo.hidden = hidden;
    return true;
  }

  // Like the SQL: only the photo row goes; the Gast's shots_taken and the
  // stored reservation of the shot id stay.
  async deletePhoto(id: string): Promise<boolean> {
    return this.photoRecords.delete(id);
  }

  async renameGuest(id: string, name: string): Promise<boolean> {
    const guest = this.guests.get(id);
    if (!guest) return false;
    guest.name = name;
    return true;
  }

  /** Recorded photos, for assertions in tests. */
  photos(): Photo[] {
    return [...this.photoRecords.values()].map((photo) => ({ ...photo }));
  }
}

/** Blob store kept in memory. Stores copies so callers cannot mutate stored bytes. */
export class InMemoryBlobStore implements BlobStore {
  private readonly blobs = new Map<
    string,
    { bytes: Uint8Array; contentType: string }
  >();

  async put(key: string, bytes: Uint8Array, contentType: string): Promise<void> {
    this.blobs.set(key, { bytes: bytes.slice(), contentType });
  }

  async get(key: string): Promise<Uint8Array | null> {
    return this.blobs.get(key)?.bytes.slice() ?? null;
  }

  async delete(keys: string[]): Promise<void> {
    for (const key of keys) this.blobs.delete(key);
  }

  async list(folder: string): Promise<string[]> {
    const prefix = `${folder}/`;
    return this.keys().filter(
      (key) => key.startsWith(prefix) && !key.slice(prefix.length).includes("/"),
    );
  }

  /** Stored keys, for assertions in tests. */
  keys(): string[] {
    return [...this.blobs.keys()];
  }
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** A clock that only moves when told to. */
export class FixedClock implements Clock {
  private current: Date;

  constructor(at: Date | string = "2026-10-18T20:00:00Z") {
    this.current = new Date(at);
  }

  now(): Date {
    return new Date(this.current);
  }

  set(at: Date | string): void {
    this.current = new Date(at);
  }

  advance(ms: number): void {
    this.current = new Date(this.current.getTime() + ms);
  }
}
