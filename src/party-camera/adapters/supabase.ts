import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  BlobStore,
  EventSettings,
  Guest,
  Repository,
  RevealOverride,
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
}
