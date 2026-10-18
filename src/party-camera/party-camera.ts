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
