import "server-only";

import { createClient } from "@supabase/supabase-js";
import { createPartyCamera, systemClock, type PartyCamera } from "@/party-camera";
import {
  SupabaseBlobStore,
  SupabaseRepository,
} from "@/party-camera/adapters/supabase";
import { hasAdminSession } from "./admin-session";
import { serverEnv } from "./env";

/** PartyCamera operations only the Host may call. */
type HostOperation =
  | "updateSettings"
  | "getStats"
  | "listAllPhotos"
  | "hidePhoto"
  | "unhidePhoto"
  | "deletePhoto"
  | "renameGuest"
  | "renderPhoto";

/** What anyone (Gasten, the join page) may call, without an admin session. */
export type PublicPartyCamera = Omit<PartyCamera, HostOperation>;

/** Everything, for a request with a verified admin session. */
export type HostPartyCamera = PartyCamera;

let instance: PartyCamera | undefined;

/** The production PartyCamera, wired to Supabase. Created lazily, once per server process. */
function instancePartyCamera(): PartyCamera {
  if (!instance) {
    const db = createClient(serverEnv.supabaseUrl, serverEnv.supabaseServiceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    instance = createPartyCamera({
      repository: new SupabaseRepository(db),
      blobStore: new SupabaseBlobStore(db),
      clock: systemClock,
    });
  }
  return instance;
}

/**
 * The PartyCamera without host operations. The type leaves them out, so the
 * only way to reach a host operation is {@link hostCamera}.
 */
export function partyCamera(): PublicPartyCamera {
  return instancePartyCamera();
}

/**
 * The single gate to host operations: the full PartyCamera if this request
 * carries a valid admin cookie, otherwise null. Every admin page, Server
 * Action and route goes through here (usually via `requireHost()`).
 */
export async function hostCamera(): Promise<HostPartyCamera | null> {
  return (await hasAdminSession()) ? instancePartyCamera() : null;
}
