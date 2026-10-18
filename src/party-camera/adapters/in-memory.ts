import { DEFAULT_EVENT_SETTINGS } from "../defaults";
import type {
  BlobStore,
  Clock,
  EventSettings,
  Guest,
  Repository,
} from "../types";

/** Repository kept in memory. Used by tests; mirrors the Supabase semantics. */
export class InMemoryRepository implements Repository {
  private readonly guests = new Map<string, Guest>();
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
