import { DEFAULT_EVENT_SETTINGS } from "../defaults";
import type {
  BlobStore,
  Clock,
  EventSettings,
  Guest,
  Photo,
  Repository,
  ShotReservation,
} from "../types";

/** Repository kept in memory. Used by tests; mirrors the Supabase semantics. */
export class InMemoryRepository implements Repository {
  private readonly guests = new Map<string, Guest>();
  private readonly photoRecords = new Map<string, Photo>();
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

  // Check-and-increment runs synchronously (no await in between), so like the
  // single conditional UPDATE in Postgres it is atomic with respect to other
  // concurrent calls.
  async reserveShot(guestId: string): Promise<ShotReservation> {
    const guest = this.guests.get(guestId);
    if (!guest) return { status: "unknown-guest" };
    const { shotsPerGuest } = this.settings;
    if (guest.shotsTaken >= shotsPerGuest) {
      return { status: "roll-full", shotsTaken: guest.shotsTaken, shotsPerGuest };
    }
    guest.shotsTaken += 1;
    return { status: "reserved", shotsTaken: guest.shotsTaken, shotsPerGuest };
  }

  async releaseShot(guestId: string): Promise<void> {
    const guest = this.guests.get(guestId);
    if (guest && guest.shotsTaken > 0) guest.shotsTaken -= 1;
  }

  async insertPhoto(photo: Photo): Promise<void> {
    if (!this.guests.has(photo.guestId)) {
      throw new Error(`Guest ${photo.guestId} does not exist`);
    }
    if (this.photoRecords.has(photo.id)) {
      throw new Error(`Photo ${photo.id} already exists`);
    }
    this.photoRecords.set(photo.id, { ...photo });
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

  /** Stored keys, for assertions in tests. */
  keys(): string[] {
    return [...this.blobs.keys()];
  }
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
