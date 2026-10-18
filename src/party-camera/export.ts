import { ZipArchive } from "archiver";

/**
 * Building blocks of the zip export (see `PartyCamera.exportZip`): how photos
 * are laid out in folders and files, how a big export is split into parts,
 * and the streaming zip writer itself.
 */

/**
 * Photos per part of a split export, per variant. A part must finish within
 * the function's time limit (300 s on Vercel), including the time the
 * browser needs to download it, or it is cut off and the zip is corrupt.
 *
 * - `original`: only read and copied. 200 photos are ~250 MB (originals are
 *   at most 2560 px at quality 85, ~1.2 MB): ~200 s at 10 Mbit/s.
 * - `shareable`: each photo is also decoded, watermarked and re-encoded at
 *   full size, ~0.3 s of CPU per photo on the single vCPU of a default
 *   function (and the files are ~10% bigger). 100 photos take ~30 s of CPU
 *   and ~130 MB (~110 s at 10 Mbit/s), overlapping each other; 200 would put
 *   a slow connection right at the limit.
 */
export const EXPORT_PART_SIZE = { original: 200, shareable: 100 } as const;

/** The party's time zone (as in `src/app/party-time.ts`): file names use its wall clock. */
const PARTY_TIME_ZONE = "Europe/Brussels";

/** Photos read (and rendered) ahead of the one being written. */
const READ_AHEAD = 4;

/**
 * Most bytes appended to the zip but not yet taken by the reader. Past this,
 * reading the next photo waits: a slow (or stalled) download never makes the
 * server hold more than a few photos in memory.
 */
const MAX_BUFFERED_BYTES = 8 * 1024 * 1024;

/** One photo in the export, at its place in the zip. */
export interface ExportEntry<P> {
  photo: P;
  /** Path in the zip: `<folder>/<folder>_<tijdstip>_<n>.jpg`. */
  path: string;
}

/** One Gast's folder in the zip. */
export interface ExportFolder<P> {
  guestId: string;
  guestName: string;
  /** Folder name: the name, safe for any file system, unique in the export. */
  folder: string;
  entries: ExportEntry<P>[];
}

/**
 * Lay the photos out in one folder per Gast (in the order of `guests`; Gasten
 * without photos get none), each photo numbered within its Gast, oldest
 * first. Folder names are computed over all of `guests` with photos, so the
 * same Gast gets the same folder in every part and in a per-Gast export.
 */
export function layoutFolders<P extends { guestId: string; takenAt: Date; id: string }>(
  guests: readonly { id: string; name: string }[],
  photos: readonly P[],
): ExportFolder<P>[] {
  const byGuest = new Map<string, P[]>();
  for (const photo of photos) {
    let list = byGuest.get(photo.guestId);
    if (!list) byGuest.set(photo.guestId, (list = []));
    list.push(photo);
  }
  const used = new Set<string>();
  const folders: ExportFolder<P>[] = [];
  for (const guest of guests) {
    const own = byGuest.get(guest.id);
    if (!own || own.length === 0) continue;
    byGuest.delete(guest.id);
    own.sort(byTakenAt);
    const folder = uniqueName(safeFileName(guest.name), used);
    folders.push({
      guestId: guest.id,
      guestName: guest.name,
      folder,
      entries: own.map((photo, index) => ({
        photo,
        path: `${folder}/${folder}_${fileTimestamp(photo.takenAt)}_${index + 1}.jpg`,
      })),
    });
  }
  return folders;
}

/**
 * Split an export into parts of at most `size` photos, deterministically:
 * folders in order, a Gast's folder kept whole in one part when it fits (a
 * new part starts rather than splitting it), only a Gast with more than
 * `size` photos spread over several parts. Every photo is in exactly one part.
 */
export function splitIntoParts<P>(folders: readonly ExportFolder<P>[], size: number): ExportFolder<P>[][] {
  const parts: ExportFolder<P>[][] = [];
  let current: ExportFolder<P>[] = [];
  let count = 0;
  const close = () => {
    if (current.length > 0) parts.push(current);
    current = [];
    count = 0;
  };
  for (const folder of folders) {
    if (count > 0 && count + folder.entries.length > size) close();
    for (let start = 0; start < folder.entries.length; ) {
      if (count === size) close();
      const take = Math.min(size - count, folder.entries.length - start);
      current.push({ ...folder, entries: folder.entries.slice(start, start + take) });
      count += take;
      start += take;
    }
  }
  close();
  return parts;
}

/**
 * File name for one photo downloaded on its own: `<gast>_<tijdstip>.jpg`,
 * like the files in a zip export (without the folder and number).
 */
export function photoFileName(guestName: string, takenAt: Date): string {
  return `${safeFileName(guestName)}_${fileTimestamp(takenAt)}.jpg`;
}

/**
 * A name that is safe as a folder/file name on Windows, macOS and Linux:
 * no path separators, reserved characters or control characters, no
 * leading/trailing dots or spaces, not a reserved Windows device name, and
 * never empty.
 */
export function safeFileName(name: string): string {
  let safe = name
    .normalize("NFC")
    .replace(/[\u0000-\u001f\u007f<>:"/\\|?*]/g, "")
    .replace(/\s+/g, " ")
    .replace(/^[\s.]+|[\s.]+$/g, "");
  safe = [...safe].slice(0, 60).join("").trim();
  if (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(safe)) safe = `${safe}_`;
  return safe || "Gast";
}

/** `name`, or `name (2)`, `name (3)`, ... : unique among `used` regardless of case. */
function uniqueName(name: string, used: Set<string>): string {
  let candidate = name;
  for (let n = 2; used.has(candidate.toLocaleLowerCase("nl")); n++) candidate = `${name} (${n})`;
  used.add(candidate.toLocaleLowerCase("nl"));
  return candidate;
}

const wallClock = new Intl.DateTimeFormat("en-GB", {
  timeZone: PARTY_TIME_ZONE,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

function wallClockParts(date: Date) {
  const parts = wallClock.formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "00";
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
    second: get("second"),
  };
}

/** `2026-10-31_21-15-03`: the moment in the party's time zone, safe in a file name. */
export function fileTimestamp(date: Date): string {
  const p = wallClockParts(date);
  return `${p.year}-${p.month}-${p.day}_${p.hour}-${p.minute}-${p.second}`;
}

/**
 * The date to stamp on a zip entry. Zip stores a time without a zone (the
 * zip writer takes the Date's UTC fields); this is the Date whose UTC fields
 * are the party's wall clock, so unpacking shows the time as it was at the
 * party, whatever the server's zone.
 */
function zipEntryDate(date: Date): Date {
  const p = wallClockParts(date);
  return new Date(Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second));
}

function byTakenAt(a: { takenAt: Date; id: string }, b: { takenAt: Date; id: string }): number {
  return a.takenAt.getTime() - b.takenAt.getTime() || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

/** A file to put in the zip: where, when, and how to get its bytes. */
export interface ZipSource {
  path: string;
  takenAt: Date;
  read(): Promise<Uint8Array>;
}

/**
 * Stream a zip of `sources`, in order, without ever holding the archive in
 * memory: JPEGs are STOREd (they do not compress), at most
 * {@link READ_AHEAD} photos are read ahead, and nothing more is read while
 * the reader is {@link MAX_BUFFERED_BYTES} behind. A photo that cannot be
 * read is left out and named in `ONTBREKEND.txt` at the end, rather than
 * failing the whole download.
 *
 * Cancelling the stream (the client went away) or aborting `signal` stops
 * all work: no further photo is read, the archive is torn down. `guard` is
 * awaited before each photo is added; if it throws, the stream fails with
 * that error (the download breaks off) and nothing more is added.
 */
export function zipStream(
  sources: readonly ZipSource[],
  options: { signal?: AbortSignal; guard?: () => Promise<void> } = {},
): ReadableStream<Uint8Array> {
  const archive = new ZipArchive({ store: true });
  const stop = new AbortController();
  const aborted = options.signal ? AbortSignal.any([options.signal, stop.signal]) : stop.signal;

  let appended = 0;
  let emitted = 0;
  let wake: (() => void) | null = null;
  const notify = () => {
    const resolve = wake;
    wake = null;
    resolve?.();
  };

  const produce = async () => {
    const missing: string[] = [];
    const reads: Promise<Uint8Array | null>[] = [];
    let next = 0;
    for (const source of sources) {
      while (next < sources.length && reads.length < READ_AHEAD && !aborted.aborted) {
        const ahead = sources[next++];
        reads.push(
          ahead.read().catch((error: unknown) => {
            console.error(`exportZip: could not read ${ahead.path}`, error);
            return null;
          }),
        );
      }
      const bytes = await untilAborted(reads.shift()!, aborted);
      if (aborted.aborted) return;
      await options.guard?.();
      if (aborted.aborted) return;
      if (!bytes) {
        missing.push(source.path);
        continue;
      }
      archive.append(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength), {
        name: source.path,
        date: zipEntryDate(source.takenAt),
      });
      appended += bytes.byteLength;
      while (!aborted.aborted && appended - emitted > MAX_BUFFERED_BYTES) {
        await new Promise<void>((resolve) => (wake = resolve));
      }
      if (aborted.aborted) return;
    }
    if (missing.length > 0) {
      archive.append(
        "Deze foto's konden niet gelezen worden en ontbreken in deze zip.\r\n" +
          "Probeer de download later opnieuw.\r\n\r\n" +
          missing.join("\r\n") +
          "\r\n",
        { name: "ONTBREKEND.txt", date: zipEntryDate(new Date()) },
      );
    }
    await archive.finalize();
  };

  return new ReadableStream<Uint8Array>(
    {
      start(controller) {
        if (aborted.aborted) {
          controller.error(aborted.reason);
          return;
        }
        let closed = false;
        const fail = (reason: unknown) => {
          if (closed) return;
          closed = true;
          try {
            controller.error(reason);
          } catch {
            // Already cancelled by the reader.
          }
        };
        aborted.addEventListener(
          "abort",
          () => {
            notify();
            archive.abort();
            archive.destroy();
            fail(aborted.reason);
          },
          { once: true },
        );
        archive.on("data", (chunk: Buffer) => {
          if (closed) return;
          emitted += chunk.byteLength;
          notify();
          controller.enqueue(new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength));
          if ((controller.desiredSize ?? 0) <= 0) archive.pause();
        });
        archive.on("end", () => {
          if (closed || aborted.aborted) return;
          closed = true;
          controller.close();
        });
        archive.on("warning", (error) => console.warn("exportZip: archiver warning", error));
        archive.on("error", (error) => {
          if (aborted.aborted) return;
          console.error("exportZip: the zip could not be written", error);
          stop.abort(error);
        });
        produce().catch((error: unknown) => {
          if (aborted.aborted) return;
          console.error("exportZip: the export failed", error);
          stop.abort(error);
        });
      },
      pull() {
        archive.resume();
      },
      cancel(reason) {
        stop.abort(reason ?? new Error("The download was cancelled"));
      },
    },
    new ByteLengthQueuingStrategy({ highWaterMark: 1024 * 1024 }),
  );
}

/** `promise`, or null as soon as `signal` aborts (the promise is then left to settle unobserved). */
function untilAborted<T>(promise: Promise<T>, signal: AbortSignal): Promise<T | null> {
  if (signal.aborted) return Promise.resolve(null);
  return new Promise<T | null>((resolve, reject) => {
    const onAbort = () => resolve(null);
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}
