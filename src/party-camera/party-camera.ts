import { PartyCameraError } from "./errors";
import { normalizeShot, renderThumb } from "./image";
import type {
  BlobStore,
  Clock,
  EventSettings,
  Guest,
  GuestWithPhotoCounts,
  GuestWithRoll,
  PartyCameraDeps,
  Photo,
  Repository,
} from "./types";

/** Longest Gast name we accept (after trimming). */
export const MAX_GUEST_NAME_LENGTH = 40;

/**
 * A pending Shot reservation older than this belongs to an attempt that died
 * (server functions are capped well below it); a retry of that Shot takes the
 * reservation over instead of waiting forever, and the next new Shot of the
 * Gast gives it back (so a dead upload that is never retried costs no shot).
 */
export const PENDING_SHOT_TIMEOUT_MS = 2 * 60 * 1000;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Whether `value` is a well-formed shot id (a UUID, as `crypto.randomUUID()` makes). */
export function isShotId(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

/**
 * The Party Camera domain module. All business rules live here; route
 * handlers, server actions and pages only translate HTTP/cookies to calls on
 * this object.
 */
export interface PartyCamera {
  /**
   * A Gast joins with just a name. The name is trimmed (inner whitespace
   * collapsed), required, at most {@link MAX_GUEST_NAME_LENGTH} characters, and
   * need not be unique.
   * @throws PartyCameraError `InvalidName`
   */
  joinGuest(name: string): Promise<GuestWithRoll>;

  /**
   * The Gast with their remaining shots.
   * @throws PartyCameraError `UnknownGuest`
   */
  getGuest(guestId: string): Promise<GuestWithRoll>;

  /**
   * A Gast takes a Shot. `shotId` is a UUID the client generates once per
   * photo and repeats on every retry of its upload, which makes this call
   * idempotent: a Shot that was already stored (its answer got lost) is not
   * counted or stored again; the call just returns the current Rolletje.
   *
   * Otherwise one shot is reserved atomically on the Rolletje, the photo is
   * normalized (EXIF orientation applied, all metadata incl. GPS stripped,
   * re-encoded as JPEG), the original is stored privately and the Shot is
   * recorded under `shotId`. If anything fails after the reservation, it is
   * released: a failed upload costs no shot.
   *
   * Returns only the Rolletje counter; never anything that reveals the photo.
   * @throws PartyCameraError `InvalidShotId`, `UnknownGuest`, `RollFull`,
   *   `ShotInProgress` (the same Shot is being stored by a concurrent attempt;
   *   retry later), `InvalidImage`
   */
  takeShot(guestId: string, shotId: string, imageBytes: Uint8Array): Promise<ShotTaken>;

  /** The Event settings (title, Rolletje size, Reveal, watermark, ...). */
  getSettings(): Promise<EventSettings>;

  // -------------------------------------------------------------------------
  // Host operations. Callers must have verified the Host's session; the
  // server only hands these out behind the admin cookie (see src/server).
  // -------------------------------------------------------------------------

  /** Live numbers for the Admin: Gasten, photos, and photos per Gast. */
  getStats(): Promise<PartyStats>;

  /**
   * Every photo on record, hidden ones included, also before the Reveal.
   * `guest`: one group per Gast (oldest Gast first, Gasten without photos
   * included), photos oldest first. `time`: all photos oldest first.
   */
  listAllPhotos(options: { groupBy: "guest" }): Promise<PhotosByGuest>;
  listAllPhotos(options: { groupBy: "time" }): Promise<PhotosByTime>;

  /**
   * Hide a photo from the Galerij (reversible). Gives no shot back.
   * @throws PartyCameraError `UnknownPhoto`
   */
  hidePhoto(photoId: string): Promise<void>;

  /**
   * Show a hidden photo in the Galerij again.
   * @throws PartyCameraError `UnknownPhoto`
   */
  unhidePhoto(photoId: string): Promise<void>;

  /**
   * Delete a photo for good: its record, its original and every derived image
   * (thumbnails, later watermarked versions). Gives no shot back, and a late
   * retry of its upload can never bring it back.
   * @throws PartyCameraError `UnknownPhoto`
   */
  deletePhoto(photoId: string): Promise<void>;

  /**
   * Give a Gast another name; validated like {@link joinGuest}.
   * @throws PartyCameraError `InvalidName`, `UnknownGuest`
   */
  renameGuest(guestId: string, name: string): Promise<GuestWithRoll>;

  /**
   * The bytes of a photo. `original` is the stored original; `thumb` a small
   * JPEG, rendered once and cached in the blob store. For now only the Host
   * may ask (`asHost: true`); the Galerij (Reveal) adds guest access and the
   * `display` variant.
   * @throws PartyCameraError `UnknownPhoto`
   */
  renderPhoto(
    photoId: string,
    variant: PhotoVariant,
    options: { asHost: true },
  ): Promise<RenderedPhoto>;
}

/** A size/kind of photo bytes that {@link PartyCamera.renderPhoto} serves. */
export type PhotoVariant = "original" | "thumb";

/** Bytes of one photo variant. */
export interface RenderedPhoto {
  bytes: Uint8Array;
  contentType: "image/jpeg";
}

/** One Gast in the Admin's numbers. */
export interface GuestStats extends GuestWithPhotoCounts {
  shotsPerGuest: number;
  shotsRemaining: number;
}

/** Result of {@link PartyCamera.getStats}. */
export interface PartyStats {
  guestCount: number;
  /** Photos on record (hidden included, deleted not). */
  photoCount: number;
  hiddenCount: number;
  /** Shots taken over all Rolletjes; includes deleted photos. */
  shotsTaken: number;
  /** Per Gast, oldest Gast first. */
  guests: GuestStats[];
}

/** A photo as the Host sees it in the Admin. */
export interface HostPhoto {
  id: string;
  guestId: string;
  guestName: string;
  width: number;
  height: number;
  takenAt: Date;
  hidden: boolean;
}

export interface PhotosByGuest {
  groupBy: "guest";
  groups: { guest: GuestStats; photos: HostPhoto[] }[];
}

export interface PhotosByTime {
  groupBy: "time";
  photos: HostPhoto[];
}

/**
 * Blob store key of a derived image of a photo. All derived images of one
 * photo share the folder `derived/<photoId>`, so deleting the photo can sweep
 * them without knowing every variant. `renderKey` names how it was rendered:
 * `plain` (no watermark) today; the watermark adds e.g. `wm-v<settingsVersion>`
 * so a settings change never serves a stale cache.
 */
function derivedFolder(photoId: string): string {
  return `derived/${photoId}`;
}

function derivedKey(photoId: string, variant: Exclude<PhotoVariant, "original">, renderKey: string): string {
  return `${derivedFolder(photoId)}/${variant}-${renderKey}.jpg`;
}

/** Result of {@link PartyCamera.takeShot}: the Rolletje after the Shot. */
export interface ShotTaken {
  shotsRemaining: number;
  shotsPerGuest: number;
}

export function createPartyCamera(deps: PartyCameraDeps): PartyCamera {
  return new DefaultPartyCamera(deps);
}

class DefaultPartyCamera implements PartyCamera {
  private readonly repository: Repository;
  private readonly blobStore: BlobStore;
  private readonly clock: Clock;
  private readonly newId: () => string;

  constructor(deps: PartyCameraDeps) {
    this.repository = deps.repository;
    this.blobStore = deps.blobStore;
    this.clock = deps.clock;
    this.newId = deps.newId ?? (() => crypto.randomUUID());
  }

  async joinGuest(rawName: string): Promise<GuestWithRoll> {
    const name = normalizeGuestName(rawName);
    const guest: Guest = {
      id: this.newId(),
      name,
      shotsTaken: 0,
      createdAt: this.clock.now(),
    };
    await this.repository.insertGuest(guest);
    return this.withRoll(guest);
  }

  async getGuest(guestId: string): Promise<GuestWithRoll> {
    const guest = await this.repository.findGuest(guestId);
    if (!guest) {
      throw new PartyCameraError("UnknownGuest", "Deze gast bestaat niet.");
    }
    return this.withRoll(guest);
  }

  async takeShot(
    guestId: string,
    rawShotId: string,
    imageBytes: Uint8Array,
  ): Promise<ShotTaken> {
    if (!isShotId(rawShotId)) {
      throw new PartyCameraError("InvalidShotId", "Ongeldig shot-id.");
    }
    const shotId = rawShotId.toLowerCase();
    const attemptId = this.newId();
    const now = this.clock.now();

    // Reserve before decoding: a full Rolletje or a repeated Shot never costs
    // server CPU on image work, and the reservation is the single arbiter for
    // both the limit and idempotency.
    const reservation = await this.repository.reserveShot({
      guestId,
      shotId,
      attemptId,
      now,
      staleBefore: new Date(now.getTime() - PENDING_SHOT_TIMEOUT_MS),
    });
    switch (reservation.status) {
      case "unknown-guest":
        throw new PartyCameraError("UnknownGuest", "Deze gast bestaat niet.");
      case "roll-full":
        throw new PartyCameraError("RollFull", "Je rolletje is vol.");
      case "foreign-shot":
        throw new PartyCameraError("InvalidShotId", "Ongeldig shot-id.");
      case "in-progress":
        throw new PartyCameraError(
          "ShotInProgress",
          "Deze foto wordt al opgeslagen. Probeer het zo opnieuw.",
        );
      case "already-stored":
        return rollAfter(reservation);
      case "reserved":
        break;
    }

    // Give the shot back; never masks the error that caused the release.
    // Resolves to whether this attempt's reservation was actually released.
    const release = () =>
      this.repository.releaseShot(shotId, attemptId).catch((releaseError) => {
        console.error("takeShot: could not release the reserved shot", releaseError);
        return false;
      });

    const photo: Photo = {
      id: shotId,
      guestId,
            // Unique per attempt: cleaning up after this attempt can never delete
      // bytes another attempt of the same Shot stored and recorded.
      storageKey: `originals/${guestId}/${shotId}-${attemptId}.jpg`,
      width: 0,
      height: 0,
      takenAt: now,
      hidden: false,
    };

    try {
      const image = await normalizeShot(imageBytes);
      photo.width = image.width;
      photo.height = image.height;
      await this.blobStore.put(photo.storageKey, image.bytes, "image/jpeg");
    } catch (error) {
      await release();
      throw error;
    }

    let recording;
    try {
      recording = await this.repository.recordShot(photo, attemptId);
    } catch (error) {
      // The recording may still have committed (only its answer got lost). Only
      // when our reservation is still pending, and so released now, is it
      // certain no record points at the bytes.
      if (await release()) await this.removeOrphan(photo.storageKey);
      throw error;
    }
    switch (recording) {
      case "recorded":
        break;
      case "already-stored":
        // A competing attempt stored this Shot first; ours is a spare copy.
        await this.removeOrphan(photo.storageKey);
        break;
      case "not-reserved":
        // This attempt lost the Shot (released, or taken over by a retry after
        // it was presumed dead). Record nothing; the client retries.
        await this.removeOrphan(photo.storageKey);
        throw new Error("takeShot: this attempt no longer holds the Shot's reservation");
    }

    return rollAfter(reservation);
  }

  getSettings(): Promise<EventSettings> {
    return this.repository.getSettings();
  }

  async getStats(): Promise<PartyStats> {
    const guests = await this.guestStats();
    let photoCount = 0;
    let hiddenCount = 0;
    let shotsTaken = 0;
    for (const guest of guests) {
      photoCount += guest.photoCount;
      hiddenCount += guest.hiddenCount;
      shotsTaken += guest.shotsTaken;
    }
    return { guestCount: guests.length, photoCount, hiddenCount, shotsTaken, guests };
  }

  listAllPhotos(options: { groupBy: "guest" }): Promise<PhotosByGuest>;
  listAllPhotos(options: { groupBy: "time" }): Promise<PhotosByTime>;
  async listAllPhotos({
    groupBy,
  }: {
    groupBy: "guest" | "time";
  }): Promise<PhotosByGuest | PhotosByTime> {
    // Two queries in total, whatever the number of Gasten or photos.
    const [guests, photos] = await Promise.all([
      this.guestStats(),
      this.repository.listPhotos(),
    ]);
    const byId = new Map(guests.map((guest) => [guest.id, guest]));
    const hostPhotos: HostPhoto[] = [];
    const seen = new Set<string>();
    for (const photo of photos) {
      const guest = byId.get(photo.guestId);
      // A photo whose Gast vanished between the two reads is skipped; a
      // repository listing a photo twice never shows it twice.
      if (!guest || seen.has(photo.id)) continue;
      seen.add(photo.id);
      hostPhotos.push({
        id: photo.id,
        guestId: photo.guestId,
        guestName: guest.name,
        width: photo.width,
        height: photo.height,
        takenAt: photo.takenAt,
        hidden: photo.hidden,
      });
    }
    hostPhotos.sort(byTakenAt);

    if (groupBy === "time") return { groupBy, photos: hostPhotos };

    const groups = guests.map((guest) => ({ guest, photos: [] as HostPhoto[] }));
    const groupOf = new Map(groups.map((group) => [group.guest.id, group]));
    for (const photo of hostPhotos) groupOf.get(photo.guestId)?.photos.push(photo);
    return { groupBy, groups };
  }

  async hidePhoto(photoId: string): Promise<void> {
    await this.setHidden(photoId, true);
  }

  async unhidePhoto(photoId: string): Promise<void> {
    await this.setHidden(photoId, false);
  }

  async deletePhoto(photoId: string): Promise<void> {
    const photo = await this.findPhoto(photoId);
    // Bytes first: if this fails, the record still points at what is left,
    // so deleting again finishes the job instead of leaving orphans.
    await this.blobStore.delete([photo.storageKey, ...(await this.derivedKeys(photo.id))]);
    await this.repository.deletePhoto(photo.id);
    // A thumbnail rendered while we were deleting would otherwise linger.
    await this.blobStore
      .delete(await this.derivedKeys(photo.id))
      .catch((error) => console.error("deletePhoto: could not sweep derived images", error));
  }

  async renameGuest(guestId: string, rawName: string): Promise<GuestWithRoll> {
    const name = normalizeGuestName(rawName);
    if (!(await this.repository.renameGuest(guestId, name))) {
      throw new PartyCameraError("UnknownGuest", "Deze gast bestaat niet.");
    }
    return this.getGuest(guestId);
  }

  async renderPhoto(
    photoId: string,
    variant: PhotoVariant,
    options: { asHost: true },
  ): Promise<RenderedPhoto> {
    // Only the Host for now; the Galerij (Reveal) adds guest access. Checked
    // at runtime too, in case an untyped caller passes something else.
    if (options?.asHost !== true) {
      throw new Error("renderPhoto: only the Host can see photos before the Galerij exists");
    }
    const photo = await this.findPhoto(photoId);
    if (variant === "original") {
      return { bytes: await this.readOriginal(photo), contentType: "image/jpeg" };
    }

    const key = derivedKey(photo.id, variant, "plain");
    const cached = await this.blobStore.get(key);
    if (cached) return { bytes: cached, contentType: "image/jpeg" };

    const bytes = await renderThumb(await this.readOriginal(photo));
    await this.cacheDerived(photo.id, key, bytes);
    return { bytes, contentType: "image/jpeg" };
  }

  private async guestStats(): Promise<GuestStats[]> {
    const [guests, { shotsPerGuest }] = await Promise.all([
      this.repository.listGuests(),
      this.repository.getSettings(),
    ]);
    return guests.map((guest) => ({
      ...guest,
      shotsPerGuest,
      shotsRemaining: Math.max(0, shotsPerGuest - guest.shotsTaken),
    }));
  }

  private async findPhoto(photoId: string): Promise<Photo> {
    const photo = isShotId(photoId)
      ? await this.repository.findPhoto(photoId.toLowerCase())
      : null;
    if (!photo) {
      throw new PartyCameraError("UnknownPhoto", "Deze foto bestaat niet (meer).");
    }
    return photo;
  }

  private async setHidden(photoId: string, hidden: boolean): Promise<void> {
    const found = isShotId(photoId)
      ? await this.repository.setPhotoHidden(photoId.toLowerCase(), hidden)
      : false;
    if (!found) {
      throw new PartyCameraError("UnknownPhoto", "Deze foto bestaat niet (meer).");
    }
  }

  private async readOriginal(photo: Photo): Promise<Uint8Array> {
    const bytes = await this.blobStore.get(photo.storageKey);
    if (!bytes) throw new Error(`renderPhoto: original of photo ${photo.id} is missing`);
    return bytes;
  }

  /**
   * Cache a derived image. A failed write only costs a re-render next time.
   * If the photo was deleted meanwhile (its sweep may already have run), the
   * fresh copy is removed again so no derived image outlives its photo.
   */
  private async cacheDerived(photoId: string, key: string, bytes: Uint8Array): Promise<void> {
    try {
      await this.blobStore.put(key, bytes, "image/jpeg");
      if (!(await this.repository.findPhoto(photoId))) await this.blobStore.delete([key]);
    } catch (error) {
      console.error("renderPhoto: could not cache the derived image", error);
    }
  }

  private derivedKeys(photoId: string): Promise<string[]> {
    return this.blobStore.list(derivedFolder(photoId));
  }

  /** Remove stored bytes that no photo record points to. */
  private async removeOrphan(storageKey: string): Promise<void> {
    await this.blobStore.delete([storageKey]).catch((cleanupError) => {
      console.error("takeShot: could not remove orphaned original", cleanupError);
    });
  }

  private async withRoll(guest: Guest): Promise<GuestWithRoll> {
    const { shotsPerGuest } = await this.repository.getSettings();
    return {
      ...guest,
      shotsPerGuest,
      shotsRemaining: Math.max(0, shotsPerGuest - guest.shotsTaken),
    };
  }
}

function rollAfter({
  shotsTaken,
  shotsPerGuest,
}: {
  shotsTaken: number;
  shotsPerGuest: number;
}): ShotTaken {
  return { shotsPerGuest, shotsRemaining: Math.max(0, shotsPerGuest - shotsTaken) };
}

function byTakenAt(a: HostPhoto, b: HostPhoto): number {
  return a.takenAt.getTime() - b.takenAt.getTime() || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

function normalizeGuestName(raw: unknown): string {
  const name = typeof raw === "string" ? raw.replace(/\s+/g, " ").trim() : "";
  if (name.length === 0) {
    throw new PartyCameraError("InvalidName", "Vul je naam in.");
  }
  if ([...name].length > MAX_GUEST_NAME_LENGTH) {
    throw new PartyCameraError(
      "InvalidName",
      `Je naam mag maximaal ${MAX_GUEST_NAME_LENGTH} tekens lang zijn.`,
    );
  }
  return name;
}
