import "server-only";

import { createClient } from "@supabase/supabase-js";
import { createPartyCamera, systemClock, type PartyCamera } from "@/party-camera";
import {
  SupabaseBlobStore,
  SupabaseRepository,
} from "@/party-camera/adapters/supabase";
import { serverEnv } from "./env";

let instance: PartyCamera | undefined;

/** The production PartyCamera, wired to Supabase. Created lazily, once per server process. */
export function partyCamera(): PartyCamera {
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
