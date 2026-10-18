import { createHash } from "node:crypto";
import { InvalidSettingsError, PartyCameraError } from "./errors";
import { normalizeShot, renderDerived, type DerivedVariant } from "./image";
import { revealStateOf, type RevealState } from "./reveal";
import { effectiveChanges, validateSettingsUpdate } from "./settings";
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
  RevealOverride,
  SettingsChanges,
  SettingsUpdate,
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
   * The limit is the Event's current `shotsPerGuest`: after the Host lowers
   * it, a Gast at or above the new limit has a full Rolletje.
   *
   * While fotograferen is closed (`captureOpen` false) a new Shot fails with
   * `CaptureClosed`. A Shot reserved before closing still completes: a retry
   * of an already stored Shot is answered with success as above, and a Shot
   * whose upload was underway is still stored. Checked atomically with the
   * reservation, not beforehand.
   *
   * Returns only the Rolletje counter; never anything that reveals the photo.
   * @throws PartyCameraError `InvalidShotId`, `UnknownGuest`, `CaptureClosed`,
   *   `RollFull`, `ShotInProgress` (the same Shot is being stored by a
   *   concurrent attempt; retry later), `InvalidImage`
   */
  takeShot(guestId: string, shotId: string, imageBytes: Uint8Array): Promise<ShotTaken>;

  /** The Event settings (title, Rolletje size, Reveal, watermark, ...). */
  getSettings(): Promise<EventSettings>;

  /**
   * Whether the Galerij is revealed now, and why. `revealed = override ===
   * 'open' || (override === 'auto' && now >= revealAt)`; with `auto` and no
   * `revealAt` it stays hidden (`pending`) until the Host forces it open.
   */
  getRevealState(): Promise<RevealState>;

  /**
   * One page of the Galerij: every photo that is not hidden (deleted ones are
   * gone), oldest first, each with the name of the Gast who took it. With
   * `guestId`: only that Gast's photos ("mijn foto's"). Pass the previous
   * page's `nextCursor` as `cursor` for the next page; `nextCursor` is null on
   * the last page. A malformed cursor yields an empty last page.
   *
   * Checked on every call, so closing the Galerij again takes effect at once.
   * @throws PartyCameraError `NotRevealed` before the Reveal.
   */
  listGallery(options?: GalleryOptions): Promise<GalleryPage>;

  /**
   * The bytes of a photo.
   *
   * For the Host (`asHost: true`): any photo, hidden ones included, also
   * before the Reveal, in every variant: `original` is the stored original
   * byte for byte; `thumb` and `display` are clean (never watermarked).
   *
   * For Gasten and everyone else (`asHost: false`): only `thumb` and
   * `display`, never `original`; only after the Reveal and only photos that
   * are not hidden. Before the Reveal, for a hidden photo, an unknown photo
   * and any other variant the failure is the same, so nothing tells whether a
   * photo exists.
   *
   * Derived variants are rendered once and cached in the blob store under
   * `derived/<photoId>/<variant>-<renderKey>.jpg`.
   * @throws PartyCameraError `UnknownPhoto`
   */
  renderPhoto(
    photoId: string,
    variant: PhotoVariant,
    options: { asHost: true },
  ): Promise<RenderedPhoto>;
  renderPhoto(
    photoId: string,
    variant: GuestPhotoVariant,
    options: { asHost: false },
  ): Promise<RenderedPhoto>;

  /**
   * Render and cache the derived variants of a photo ahead of time (`thumb`
   * and `display` as the Galerij will ask for them, and the Host's thumb), so
   * the Reveal does not start with a burst of renders. Returns nothing and
   * reveals nothing; an unknown photo is simply skipped. Meant to run in the
   * background after a Shot.
   */
  prepareDerivatives(photoId: string): Promise<void>;

  // -------------------------------------------------------------------------
  // Host operations. Callers must have verified the Host's session; the
  // server only hands these out behind the admin cookie (see src/server).
  // -------------------------------------------------------------------------

  /**
   * The Host changes Event settings: title (required, whitespace collapsed,
   * at most {@link MAX_TITLE_LENGTH} characters), welcome text (may be empty,
   * at most {@link MAX_WELCOME_TEXT_LENGTH}), accent color (exactly
   * `#rrggbb`, stored lowercase), `shotsPerGuest` (whole number 1 to
   * {@link MAX_SHOTS_PER_GUEST}; applies to every Rolletje at once) and
   * `captureOpen`. Absent fields stay as they are. A change bumps
   * `settingsVersion` (derived-image caches key on it); an update that
   * changes nothing writes nothing and keeps the version.
   *
   * `expectedVersion` (optional): the `settingsVersion` the update is based
   * on, e.g. the one a form was shown with. When the settings changed since,
   * nothing is changed (checked atomically with the write). Leave it out for
   * a change whose requested value is the whole intent (open/dicht).
   * @throws InvalidSettingsError (`InvalidSettings`) listing every invalid
   *   field; nothing is changed then.
   * @throws PartyCameraError `SettingsChanged` when `expectedVersion` is stale.
   */
  updateSettings(
    update: SettingsUpdate,
    options?: { expectedVersion?: number },
  ): Promise<EventSettings>;

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
   * The Host forces the Reveal: `open` ("nu onthullen"), `closed` ("verborgen
   * houden", also after `revealAt`), or back to `auto` (the Reveal moment
   * counts again). The requested value is the whole intent, so it is applied
   * on top of any other settings change. Returns the resulting state.
   * @throws InvalidSettingsError for any other value.
   */
  setRevealOverride(override: RevealOverride): Promise<RevealState>;
}

/** A size/kind of photo bytes that {@link PartyCamera.renderPhoto} serves. */
export type PhotoVariant = "original" | DerivedVariant;

/** The variants anyone but the Host may ask for. */
export type GuestPhotoVariant = DerivedVariant;

/** Most photos {@link PartyCamera.listGallery} returns per page. */
export const MAX_GALLERY_PAGE_SIZE = 200;
/** Photos per Galerij page when no `limit` is given. */
export const DEFAULT_GALLERY_PAGE_SIZE = 60;

/** Options of {@link PartyCamera.listGallery}. */
export interface GalleryOptions {
  /** Only this Gast's photos ("mijn foto's"). */
  guestId?: string;
  /** `nextCursor` of the previous page; absent for the first page. */
  cursor?: string;
  /** Photos per page, 1 to {@link MAX_GALLERY_PAGE_SIZE}. */
  limit?: number;
}

/** A photo as everyone sees it in the Galerij. */
export interface GalleryPhoto {
  id: string;
  /** Name of the Gast who took it (their current name). */
  guestName: string;
  width: number;
  height: number;
  takenAt: Date;
}

/** Result of {@link PartyCamera.listGallery}. */
export interface GalleryPage {
  photos: GalleryPhoto[];
  /** Pass as `cursor` for the next page; null when this is the last page. */
  nextCursor: string | null;
}

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
 * them without knowing every variant. `renderKey` names how it was rendered,
 * so a change in how it is rendered never serves a stale cache.
 */
function derivedFolder(photoId: string): string {
  return `derived/${photoId}`;
}

function derivedKey(photoId: string, variant: DerivedVariant, renderKey: string): string {
  return `${derivedFolder(photoId)}/${variant}-${renderKey}.jpg`;
}

/** Render key of what the Host sees: always the clean photo. */
const HOST_RENDER_KEY = "plain";

/**
 * Render key of the Galerij's derived images, from the settings they are
 * rendered with. Without a watermark they are the clean photo (`plain`, the
 * same cache as the Host's). With the watermark on: `wm-<hash>`, a short hash
 * of the watermark fields ONLY, so a watermark change invalidates the cache
 * by itself while any other settings change (Reveal, override, title, ...)
 * keeps it. Deliberately not `settingsVersion`: that changes with every
 * setting, and "nu onthullen" would then throw away every cached image at the
 * very moment everyone opens the Galerij.
 * THE SEAM FOR THE WATERMARK (ticket 07): render with the overlay whenever
 * this key is not `plain`.
 */
function galleryRenderKey(
  settings: Partial<
    Pick<
      EventSettings,
      | "watermarkEnabled"
      | "watermarkText"
      | "watermarkLogoKey"
      | "watermarkPosition"
      | "watermarkScale"
      | "watermarkOpacity"
    >
  >,
): string {
  if (settings.watermarkEnabled !== true) return "plain";
  const fields = JSON.stringify([
    settings.watermarkText ?? null,
    settings.watermarkLogoKey ?? null,
    settings.watermarkPosition ?? null,
    settings.watermarkScale ?? null,
    settings.watermarkOpacity ?? null,
  ]);
  return `wm-${createHash("sha256").update(fields).digest("hex").slice(0, 12)}`;
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
  /** Derived images being rendered right now, by blob key (see renderDerivedPhoto). */
  private readonly rendering = new Map<string, Promise<RenderedPhoto>>();

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
      case "capture-closed":
        throw new PartyCameraError("CaptureClosed", "Fotograferen is gesloten.");
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

  async getRevealState(): Promise<RevealState> {
    return revealStateOf(await this.repository.getSettings(), this.clock.now());
  }

  async setRevealOverride(override: RevealOverride): Promise<RevealState> {
    const settings = await this.updateSettings({ revealOverride: override });
    return revealStateOf(settings, this.clock.now());
  }

  async listGallery(options: GalleryOptions = {}): Promise<GalleryPage> {
    await this.requireRevealed();
    const { guestId, cursor } = options;
    const limit = Math.min(
      MAX_GALLERY_PAGE_SIZE,
      Math.max(1, Math.floor(Number(options.limit ?? DEFAULT_GALLERY_PAGE_SIZE)) || 1),
    );
    const after = cursor === undefined ? undefined : decodeCursor(cursor);
    if (after === null) return { photos: [], nextCursor: null };
    if (guestId !== undefined && !isShotId(guestId)) return { photos: [], nextCursor: null };

    // One more than asked, to know whether another page follows.
    const records = await this.repository.listGalleryPhotos({
      guestId: guestId?.toLowerCase(),
      after,
      limit: limit + 1,
    });
    const page = records.slice(0, limit);
    const last = page.at(-1);
    return {
      photos: page.map((record) => ({
        id: record.id,
        guestName: record.guestName,
        width: record.width,
        height: record.height,
        takenAt: record.takenAt,
      })),
      nextCursor: records.length > limit && last ? encodeCursor(last) : null,
    };
  }

  async updateSettings(
    update: SettingsUpdate,
    options: { expectedVersion?: number } = {},
  ): Promise<EventSettings> {
    const changes = validateSettingsUpdate(update ?? {});
    const { expectedVersion } = options;
    if (expectedVersion !== undefined && !Number.isInteger(expectedVersion)) {
      throw settingsChanged();
    }
    // Without an expected version, a change in between is retried against the
    // new state (a few times): never silently overwritten or skipped.
    for (let attempt = 0; ; attempt++) {
      const current = await this.repository.getSettings();
      if (expectedVersion !== undefined && current.settingsVersion !== expectedVersion) {
        throw settingsChanged();
      }
      const effective = effectiveChanges(changes, current);
      if (Object.keys(effective).length === 0) return current;
      this.refusePastRevealAt(effective, current);
      // Compare-and-set against the version the changes were computed from.
      const result = await this.repository.updateSettings(effective, current.settingsVersion);
      if (result.status === "updated") return result.settings;
      if (expectedVersion !== undefined || attempt >= 2) throw settingsChanged();
    }
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
    options: { asHost: boolean },
  ): Promise<RenderedPhoto> {
    if (options?.asHost === true) {
      const photo = await this.findPhoto(photoId);
      if (variant === "original") {
        return { bytes: await this.readOriginal(photo), contentType: "image/jpeg" };
      }
      if (!isDerivedVariant(variant)) throw unknownPhoto();
      return this.renderDerivedPhoto(photo, variant, HOST_RENDER_KEY);
    }

    // Everyone else. Checked at runtime too, for untyped callers: anything
    // that is not a derived variant is refused like an unknown photo. The
    // Reveal is checked before the photo is even looked up.
    if (!isDerivedVariant(variant)) throw unknownPhoto();
    const settings = await this.repository.getSettings();
    if (!revealStateOf(settings, this.clock.now()).revealed) throw unknownPhoto();
    const photo = isShotId(photoId)
      ? await this.repository.findPhoto(photoId.toLowerCase())
      : null;
    if (!photo || photo.hidden) throw unknownPhoto();
    return this.renderDerivedPhoto(photo, variant, galleryRenderKey(settings));
  }

  private async renderDerivedPhoto(
    photo: Photo,
    variant: DerivedVariant,
    renderKey: string,
  ): Promise<RenderedPhoto> {
    const key = derivedKey(photo.id, variant, renderKey);
    // One render per key at a time in this process: concurrent requests for
    // the same image (everyone opening the Galerij at the Reveal) share it.
    const inFlight = this.rendering.get(key);
    if (inFlight) return inFlight;
    const render = (async (): Promise<RenderedPhoto> => {
      const cached = await this.blobStore.get(key);
      if (cached) return { bytes: cached, contentType: "image/jpeg" };
      const bytes = await renderDerived(await this.readOriginal(photo), variant);
      await this.cacheDerived(photo.id, key, bytes);
      return { bytes, contentType: "image/jpeg" };
    })();
    this.rendering.set(key, render);
    try {
      return await render;
    } finally {
      this.rendering.delete(key);
    }
  }

  async prepareDerivatives(photoId: string): Promise<void> {
    const [photo, settings] = await Promise.all([
      isShotId(photoId) ? this.repository.findPhoto(photoId.toLowerCase()) : null,
      this.repository.getSettings(),
    ]);
    if (!photo) return;
    const galleryKey = galleryRenderKey(settings);
    // Sequential: one sharp pipeline at a time is plenty in the background.
    await this.renderDerivedPhoto(photo, "thumb", galleryKey);
    await this.renderDerivedPhoto(photo, "display", galleryKey);
    if (galleryKey !== HOST_RENDER_KEY) {
      await this.renderDerivedPhoto(photo, "thumb", HOST_RENDER_KEY);
    }
  }

  /**
   * A new Reveal moment that has already passed, while the Reveal is
   * automatic, would open the Galerij on the spot: almost always a typo (a
   * wrong day), and not undoable for whoever looked. Refused; opening now is
   * what "Nu onthullen" is for.
   */
  private refusePastRevealAt(effective: SettingsChanges, current: EventSettings): void {
    const at = effective.revealAt;
    if (!at) return;
    const override = effective.revealOverride ?? current.revealOverride;
    if (override === "auto" && at.getTime() <= this.clock.now().getTime()) {
      throw new InvalidSettingsError({
        revealAt:
          "Dit moment is al voorbij: de galerij zou meteen opengaan. Kies een moment in de toekomst, of gebruik “Nu onthullen”.",
      });
    }
  }

  private async requireRevealed(): Promise<void> {
    if (!(await this.getRevealState()).revealed) {
      throw new PartyCameraError(
        "NotRevealed",
        "De foto's zijn nog niet onthuld.",
      );
    }
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
    if (!photo) throw unknownPhoto();
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

function unknownPhoto(): PartyCameraError {
  return new PartyCameraError("UnknownPhoto", "Deze foto bestaat niet (meer).");
}

function isDerivedVariant(value: unknown): value is DerivedVariant {
  return value === "thumb" || value === "display";
}

/** Galerij cursor: the (takenAt, id) of a page's last photo, opaque to callers. */
function encodeCursor(photo: { takenAt: Date; id: string }): string {
  return Buffer.from(`${photo.takenAt.getTime()}.${photo.id}`, "utf8").toString("base64url");
}

/** The position a cursor names, or null if it is malformed. */
function decodeCursor(cursor: string): { takenAt: Date; id: string } | null {
  if (typeof cursor !== "string" || cursor.length > 200) return null;
  const match = /^(\d{1,15})\.(.+)$/.exec(Buffer.from(cursor, "base64url").toString("utf8"));
  if (!match || !isShotId(match[2])) return null;
  return { takenAt: new Date(Number(match[1])), id: match[2].toLowerCase() };
}

function settingsChanged(): PartyCameraError {
  return new PartyCameraError(
    "SettingsChanged",
    "De instellingen zijn intussen gewijzigd. Herlaad de pagina en probeer het opnieuw.",
  );
}
