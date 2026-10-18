import "server-only";

import { createClient } from "@supabase/supabase-js";
import {
  createPartyCamera,
  systemClock,
  type GuestPhotoVariant,
  type PartyCamera,
  type RenderedPhoto,
} from "@/party-camera";
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
  | "setRevealOverride"
  | "previewWatermark"
  | "prepareGallery"
  | "renderPhoto";

/**
 * What anyone (Gasten, the join page, the Galerij) may call, without an admin
 * session. `renderPhoto` only as a guest: `thumb`/`display`, after the Reveal.
 */
export type PublicPartyCamera = Omit<PartyCamera, HostOperation> & {
  renderPhoto(
    photoId: string,
    variant: GuestPhotoVariant,
    options: { asHost: false },
  ): Promise<RenderedPhoto>;
};

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

let publicInstance: PublicPartyCamera | undefined;

/**
 * The PartyCamera without host operations. Not just a narrower type: the
 * object only has the public operations, and its `renderPhoto` always asks as
 * a guest, so the only way to reach a host operation is {@link hostCamera}.
 */
export function partyCamera(): PublicPartyCamera {
  if (!publicInstance) {
    const camera = instancePartyCamera();
    publicInstance = {
      joinGuest: (name) => camera.joinGuest(name),
      getGuest: (guestId) => camera.getGuest(guestId),
      takeShot: (guestId, shotId, bytes) => camera.takeShot(guestId, shotId, bytes),
      getSettings: () => camera.getSettings(),
      getRevealState: () => camera.getRevealState(),
      listGallery: (options) => camera.listGallery(options),
      renderPhoto: (photoId, variant) => camera.renderPhoto(photoId, variant, { asHost: false }),
      prepareDerivatives: (photoId) => camera.prepareDerivatives(photoId),
    };
  }
  return publicInstance;
}

/**
 * The single gate to host operations: the full PartyCamera if this request
 * carries a valid admin cookie, otherwise null. Every admin page, Server
 * Action and route goes through here (usually via `requireHost()`).
 */
export async function hostCamera(): Promise<HostPartyCamera | null> {
  return (await hasAdminSession()) ? instancePartyCamera() : null;
}
