/** The small part of archiver 8 (no bundled types) that the zip export uses. */
declare module "archiver" {
  import type { Transform } from "node:stream";

  export interface ZipArchiveOptions {
    /** STORE every entry (no compression). */
    store?: boolean;
    comment?: string;
    forceZip64?: boolean;
    highWaterMark?: number;
  }

  export interface EntryData {
    name: string;
    date?: Date | string;
    mode?: number;
    store?: boolean;
  }

  export class ZipArchive extends Transform {
    constructor(options?: ZipArchiveOptions);
    append(source: Buffer | NodeJS.ReadableStream | string, data: EntryData): this;
    /** Ends the archive; resolves when the zip module has written its end. */
    finalize(): Promise<void>;
    /** Best effort: drop queued entries and end both sides. */
    abort(): this;
    pointer(): number;
  }
}
