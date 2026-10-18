import { PartyCameraError } from "./errors";
import { normalizeShot } from "./image";
import type {
  BlobStore,
  Clock,
  EventSettings,
  Guest,
  GuestWithRoll,
  PartyCameraDeps,
  Photo,
  Repository,
} from "./types";

/** Longest Gast name we accept (after trimming). */
export const MAX_GUEST_NAME_LENGTH = 40;

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
   * A Gast takes a Shot. The photo is normalized (EXIF orientation applied,
   * all metadata incl. GPS stripped, re-encoded as JPEG), one shot is reserved
   * atomically on the Rolletje, the original is stored privately and the Shot
   * is recorded. If storing fails, the reservation is released: a failed
   * upload costs no shot.
   *
   * Returns only the Rolletje counter; never anything that reveals the photo.
   * @throws PartyCameraError `InvalidImage`, `UnknownGuest`, `RollFull`
   */
  takeShot(guestId: string, imageBytes: Uint8Array): Promise<ShotTaken>;

  /** The Event settings (title, Rolletje size, Reveal, watermark, ...). */
  getSettings(): Promise<EventSettings>;
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

  async takeShot(guestId: string, imageBytes: Uint8Array): Promise<ShotTaken> {
    // Cheap early exit before decoding: an unknown Gast or a full Rolletje never
    // costs server CPU on image work. The atomic reservation below stays the
    // real guard against races.
    const guest = await this.getGuest(guestId);
    if (guest.shotsRemaining <= 0) {
      throw new PartyCameraError("RollFull", "Je rolletje is vol.");
    }

    const image = await normalizeShot(imageBytes);

    const reservation = await this.repository.reserveShot(guestId);
    if (reservation.status === "unknown-guest") {
      throw new PartyCameraError("UnknownGuest", "Deze gast bestaat niet.");
    }
    if (reservation.status === "roll-full") {
      throw new PartyCameraError("RollFull", "Je rolletje is vol.");
    }

    const photoId = this.newId();
    const photo: Photo = {
      id: photoId,
      guestId,
      storageKey: `originals/${guestId}/${photoId}.jpg`,
      width: image.width,
      height: image.height,
      takenAt: this.clock.now(),
      hidden: false,
    };

    try {
      await this.blobStore.put(photo.storageKey, image.bytes, "image/jpeg");
    } catch (error) {
      await this.releaseReservation(guestId);
      throw error;
    }

    try {
      await this.repository.insertPhoto(photo);
    } catch (error) {
      // Without a record the stored bytes are orphaned: remove them too.
      await this.blobStore.delete([photo.storageKey]).catch((cleanupError) => {
        console.error("takeShot: could not remove orphaned original", cleanupError);
      });
      await this.releaseReservation(guestId);
      throw error;
    }

    return {
      shotsPerGuest: reservation.shotsPerGuest,
      shotsRemaining: Math.max(0, reservation.shotsPerGuest - reservation.shotsTaken),
    };
  }

  getSettings(): Promise<EventSettings> {
    return this.repository.getSettings();
  }

  /** Give a reserved shot back; never masks the error that caused it. */
  private async releaseReservation(guestId: string): Promise<void> {
    await this.repository.releaseShot(guestId).catch((releaseError) => {
      console.error("takeShot: could not release the reserved shot", releaseError);
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
