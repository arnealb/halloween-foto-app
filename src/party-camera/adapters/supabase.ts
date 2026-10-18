import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  BlobStore,
  EventSettings,
  GalleryPhotoRecord,
  GalleryQuery,
  Guest,
  GuestWithPhotoCounts,
  Photo,
  Repository,
  RevealOverride,
  SettingsChanges,
  SettingsUpdateResult,
  ShotRecording,
  ShotReservation,
  ShotReservationRequest,
  WatermarkPosition,
} from "../types";

/** Name of the private Storage bucket (created by the migration). */
export const STORAGE_BUCKET = "party-camera";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface GuestRow {
  id: string;
  name: string;
  shots_taken: number;
  created_at: string;
}

interface GuestWithPhotoCountsRow extends GuestRow {
  photo_count: number;
  hidden_count: number;
}

interface PhotoRow {
  id: string;
  guest_id: string;
  storage_key: string;
  width: number;
  height: number;
  taken_at: string;
  hidden: boolean;
}

const PHOTO_COLUMNS = "id, guest_id, storage_key, width, height, taken_at, hidden";

/**
 * Rows per request when reading whole tables. Supabase's API caps a response
 * at 1000 rows by default, so larger reads go page by page.
 */
const PAGE_SIZE = 1000;

function toPhoto(row: PhotoRow): Photo {
  return {
    id: row.id,
    guestId: row.guest_id,
    storageKey: row.storage_key,
    width: row.width,
    height: row.height,
    takenAt: new Date(row.taken_at),
    hidden: row.hidden,
  };
}

/** A query that can be narrowed with a PostgREST `or` filter and limited. */
interface KeysetQuery<T> {
  or(filter: string): KeysetQuery<T>;
  limit(count: number): PromiseLike<{ data: T[] | null; error: { message: string } | null }>;
}

/**
 * Fetch every row of a query ordered by (`column`, id), one page of
 * {@link PAGE_SIZE} at a time. Keyset paging, not offsets: each page starts
 * after the last row seen, so rows inserted or deleted between pages (a live
 * party) never make a page repeat or skip a row. `query()` must return a fresh
 * query, already ordered by `column` then `id`.
 */
async function fetchAllByKey<T extends { id: string }>(
  what: string,
  column: keyof T & string,
  query: () => KeysetQuery<T>,
): Promise<T[]> {
  const rows: T[] = [];
  let last: T | undefined;
  for (;;) {
    let page = query();
    if (last) {
      // The raw timestamp string from the database keeps its microseconds;
      // quoted, because it contains ':' '.' and '+'.
      const key = `"${String(last[column])}"`;
      page = page.or(`${column}.gt.${key},and(${column}.eq.${key},id.gt.${last.id})`);
    }
    const { data, error } = await page.limit(PAGE_SIZE);
    if (error) throw new Error(`${what} failed: ${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) return rows;
    last = data[data.length - 1];
  }
}

interface EventSettingsRow {
  title: string;
  welcome_text: string;
  accent_color: string;
  shots_per_guest: number;
  capture_open: boolean;
  reveal_at: string | null;
  reveal_override: RevealOverride;
  watermark_enabled: boolean;
  watermark_text: string;
  watermark_logo_key: string | null;
  watermark_position: WatermarkPosition;
  watermark_scale: number;
  watermark_opacity: number;
  settings_version: number;
}

function toGuest(row: GuestRow): Guest {
  return {
    id: row.id,
    name: row.name,
    shotsTaken: row.shots_taken,
    createdAt: new Date(row.created_at),
  };
}

function toSettings(row: EventSettingsRow): EventSettings {
  return {
    title: row.title,
    welcomeText: row.welcome_text,
    accentColor: row.accent_color,
    shotsPerGuest: row.shots_per_guest,
    captureOpen: row.capture_open,
    revealAt: row.reveal_at ? new Date(row.reveal_at) : null,
    revealOverride: row.reveal_override,
    watermarkEnabled: row.watermark_enabled,
    watermarkText: row.watermark_text,
    watermarkLogoKey: row.watermark_logo_key,
    watermarkPosition: row.watermark_position,
    watermarkScale: Number(row.watermark_scale),
    watermarkOpacity: Number(row.watermark_opacity),
    settingsVersion: row.settings_version,
  };
}

/** Column names of the settings fields, for `update_event_settings`. */
const SETTINGS_COLUMNS: Record<keyof SettingsChanges, keyof EventSettingsRow> = {
  title: "title",
  welcomeText: "welcome_text",
  accentColor: "accent_color",
  shotsPerGuest: "shots_per_guest",
  captureOpen: "capture_open",
  revealAt: "reveal_at",
  revealOverride: "reveal_override",
  watermarkEnabled: "watermark_enabled",
  watermarkText: "watermark_text",
  watermarkLogoKey: "watermark_logo_key",
  watermarkPosition: "watermark_position",
  watermarkScale: "watermark_scale",
  watermarkOpacity: "watermark_opacity",
};

function toSettingsRowChanges(changes: SettingsChanges): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(changes)) {
    if (value === undefined) continue;
    const column = SETTINGS_COLUMNS[key as keyof SettingsChanges];
    if (!column) throw new Error(`updateSettings: unknown setting ${key}`);
    row[column] = value instanceof Date ? value.toISOString() : value;
  }
  return row;
}

/** Repository backed by Supabase Postgres (service-role client, server only). */
export class SupabaseRepository implements Repository {
  constructor(private readonly db: SupabaseClient) {}

  async insertGuest(guest: Guest): Promise<void> {
    const { error } = await this.db.from("guests").insert({
      id: guest.id,
      name: guest.name,
      shots_taken: guest.shotsTaken,
      created_at: guest.createdAt.toISOString(),
    });
    if (error) throw new Error(`insertGuest failed: ${error.message}`);
  }

  async findGuest(id: string): Promise<Guest | null> {
    if (!UUID_RE.test(id)) return null;
    const { data, error } = await this.db
      .from("guests")
      .select("id, name, shots_taken, created_at")
      .eq("id", id)
      .maybeSingle<GuestRow>();
    if (error) throw new Error(`findGuest failed: ${error.message}`);
    return data ? toGuest(data) : null;
  }

  async getSettings(): Promise<EventSettings> {
    const { data, error } = await this.db
      .from("event_settings")
      .select("*")
      .eq("id", 1)
      .single<EventSettingsRow>();
    if (error) throw new Error(`getSettings failed: ${error.message}`);
    return toSettings(data);
  }

  async updateSettings(
    changes: SettingsChanges,
    expectedVersion?: number,
  ): Promise<SettingsUpdateResult> {
    const { data, error } = await this.db.rpc("update_event_settings", {
      p_changes: toSettingsRowChanges(changes),
      p_expected_version: expectedVersion ?? null,
    });
    if (error) throw new Error(`updateSettings failed: ${error.message}`);
    const result = data as UpdateSettingsResult;
    switch (result?.status) {
      case "updated":
        return { status: "updated", settings: toSettings(result.settings) };
      case "stale":
        return { status: "stale" };
      default:
        throw new Error(
          `update_event_settings returned an unexpected result: ${JSON.stringify(result)}`,
        );
    }
  }

  async reserveShot({
    guestId,
    shotId,
    attemptId,
    now,
    staleBefore,
  }: ShotReservationRequest): Promise<ShotReservation> {
    if (!UUID_RE.test(guestId)) return { status: "unknown-guest" };
    const { data, error } = await this.db.rpc("reserve_shot", {
      p_guest_id: guestId,
      p_shot_id: shotId,
      p_attempt_id: attemptId,
      p_now: now.toISOString(),
      p_stale_before: staleBefore.toISOString(),
    });
    if (error) throw new Error(`reserveShot failed: ${error.message}`);
    return toShotReservation(data as ReserveShotResult);
  }

  async releaseShot(shotId: string, attemptId: string): Promise<boolean> {
    const { data, error } = await this.db.rpc("release_shot", {
      p_shot_id: shotId,
      p_attempt_id: attemptId,
    });
    if (error) throw new Error(`releaseShot failed: ${error.message}`);
    return data === true;
  }

  async recordShot(photo: Photo, attemptId: string): Promise<ShotRecording> {
    const { data, error } = await this.db.rpc("record_shot", {
      p_shot_id: photo.id,
      p_guest_id: photo.guestId,
      p_attempt_id: attemptId,
      p_storage_key: photo.storageKey,
      p_width: photo.width,
      p_height: photo.height,
      p_taken_at: photo.takenAt.toISOString(),
    });
    if (error) throw new Error(`recordShot failed: ${error.message}`);
    if (data !== "recorded" && data !== "already-stored" && data !== "not-reserved") {
      throw new Error(`record_shot returned an unexpected result: ${JSON.stringify(data)}`);
    }
    return data;
  }

  async listGuests(): Promise<GuestWithPhotoCounts[]> {
    // PostgREST filters and orders the function's result like a table.
    const rows = await fetchAllByKey<GuestWithPhotoCountsRow>("listGuests", "created_at", () =>
      this.db.rpc("list_guests_with_photo_counts").order("created_at").order("id"),
    );
    return rows.map((row) => ({
      ...toGuest(row),
      photoCount: row.photo_count,
      hiddenCount: row.hidden_count,
    }));
  }

  async listPhotos(): Promise<Photo[]> {
    const rows = await fetchAllByKey<PhotoRow>("listPhotos", "taken_at", () =>
      this.db.from("photos").select(PHOTO_COLUMNS).order("taken_at").order("id"),
    );
    return rows.map(toPhoto);
  }

  async findPhoto(id: string): Promise<Photo | null> {
    if (!UUID_RE.test(id)) return null;
    const { data, error } = await this.db
      .from("photos")
      .select(PHOTO_COLUMNS)
      .eq("id", id)
      .maybeSingle<PhotoRow>();
    if (error) throw new Error(`findPhoto failed: ${error.message}`);
    return data ? toPhoto(data) : null;
  }

  async setPhotoHidden(id: string, hidden: boolean): Promise<boolean> {
    if (!UUID_RE.test(id)) return false;
    const { data, error } = await this.db
      .from("photos")
      .update({ hidden })
      .eq("id", id)
      .select("id");
    if (error) throw new Error(`setPhotoHidden failed: ${error.message}`);
    return data.length > 0;
  }

  async deletePhoto(id: string): Promise<boolean> {
    if (!UUID_RE.test(id)) return false;
    // Only the photo row: guests.shots_taken and the 'stored' row in
    // shot_reservations stay, so no shot is given back (see 0004/0006).
    const { data, error } = await this.db.from("photos").delete().eq("id", id).select("id");
    if (error) throw new Error(`deletePhoto failed: ${error.message}`);
    return data.length > 0;
  }

  async renameGuest(id: string, name: string): Promise<boolean> {
    if (!UUID_RE.test(id)) return false;
    const { data, error } = await this.db
      .from("guests")
      .update({ name })
      .eq("id", id)
      .select("id");
    if (error) throw new Error(`renameGuest failed: ${error.message}`);
    return data.length > 0;
  }

  async listGalleryPhotos({ guestId, after, limit }: GalleryQuery): Promise<GalleryPhotoRecord[]> {
    if (guestId !== undefined && !UUID_RE.test(guestId)) return [];
    if (after && !UUID_RE.test(after.id)) return [];
    // One query: the Gast's name comes along through the foreign key. Served
    // by the partial indexes of migration 0009.
    let query = this.db
      .from("photos")
      .select("id, guest_id, width, height, taken_at, guests!inner(name)")
      .eq("hidden", false);
    if (guestId !== undefined) query = query.eq("guest_id", guestId);
    if (after) {
      // Quoted: an ISO timestamp contains ':' and '.'.
      const key = `"${after.takenAt.toISOString()}"`;
      query = query.or(`taken_at.gt.${key},and(taken_at.eq.${key},id.gt.${after.id})`);
    }
    const { data, error } = await query
      .order("taken_at")
      .order("id")
      .limit(Math.min(limit, PAGE_SIZE))
      .overrideTypes<GalleryPhotoRow[], { merge: false }>();
    if (error) throw new Error(`listGalleryPhotos failed: ${error.message}`);
    return data.flatMap((row) =>
      row.guests
        ? [
            {
              id: row.id,
              guestId: row.guest_id,
              guestName: row.guests.name,
              width: row.width,
              height: row.height,
              takenAt: new Date(row.taken_at),
            },
          ]
        : [],
    );
  }
}

interface GalleryPhotoRow {
  id: string;
  guest_id: string;
  width: number;
  height: number;
  taken_at: string;
  /** Many-to-one embed through photos.guest_id; `!inner` drops orphans. */
  guests: { name: string } | null;
}

/** JSON returned by the `update_event_settings` Postgres function (0008 migration). */
type UpdateSettingsResult =
  { status: "updated"; settings: EventSettingsRow } | { status: "stale"; settings_version: number };

/** JSON returned by the `reserve_shot` Postgres function (0007 migration). */
type ReserveShotResult =
  | {
      status: "reserved" | "roll-full" | "already-stored";
      shots_taken: number;
      shots_per_guest: number;
    }
  | {
      status: "unknown-guest" | "in-progress" | "foreign-shot" | "capture-closed";
    };

function toShotReservation(result: ReserveShotResult): ShotReservation {
  switch (result?.status) {
    case "reserved":
    case "roll-full":
    case "already-stored":
      return {
        status: result.status,
        shotsTaken: result.shots_taken,
        shotsPerGuest: result.shots_per_guest,
      };
    case "unknown-guest":
    case "in-progress":
    case "foreign-shot":
    case "capture-closed":
      return { status: result.status };
    default:
      throw new Error(`reserve_shot returned an unexpected result: ${JSON.stringify(result)}`);
  }
}

/** Blob store backed by the private Supabase Storage bucket. */
export class SupabaseBlobStore implements BlobStore {
  constructor(
    private readonly db: SupabaseClient,
    private readonly bucket: string = STORAGE_BUCKET,
  ) {}

  async put(key: string, bytes: Uint8Array, contentType: string): Promise<void> {
    const { error } = await this.db.storage
      .from(this.bucket)
      .upload(key, bytes, { contentType, upsert: true });
    if (error) throw new Error(`BlobStore.put(${key}) failed: ${error.message}`);
  }

  async get(key: string): Promise<Uint8Array | null> {
    const { data, error } = await this.db.storage.from(this.bucket).download(key);
    if (error) {
      // A missing object. Hosted Supabase (verified 2026-10) answers HTTP 400
      // with body { statusCode: "404", code: "NoSuchKey" }; a missing bucket is
      // also statusCode "404" but code "NoSuchBucket", so `code` is the signal.
      // A real HTTP 404 is accepted too, unless it says the bucket is missing.
      // Anything else (bucket, auth, network) is a real failure.
      const { code, status } = error as { code?: string; status?: number };
      if (code === "NoSuchKey" || (status === 404 && code !== "NoSuchBucket")) {
        return null;
      }
      throw new Error(`BlobStore.get(${key}) failed: ${error.message}`);
    }
    return new Uint8Array(await data.arrayBuffer());
  }

  async delete(keys: string[]): Promise<void> {
    if (keys.length === 0) return;
    const { error } = await this.db.storage.from(this.bucket).remove(keys);
    if (error) throw new Error(`BlobStore.delete failed: ${error.message}`);
  }

  async list(folder: string): Promise<string[]> {
    const keys: string[] = [];
    for (let offset = 0; ; offset += PAGE_SIZE) {
      const { data, error } = await this.db.storage
        .from(this.bucket)
        .list(folder, { limit: PAGE_SIZE, offset, sortBy: { column: "name", order: "asc" } });
      if (error) throw new Error(`BlobStore.list(${folder}) failed: ${error.message}`);
      // Sub-folders come back as entries without an id; only objects count.
      for (const entry of data) if (entry.id) keys.push(`${folder}/${entry.name}`);
      if (data.length < PAGE_SIZE) return keys;
    }
  }
}
