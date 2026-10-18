"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

export interface PhotoDownload {
  label: string;
  href: string;
}

/**
 * Download and share buttons for one photo in a lightbox.
 *
 * Sharing goes through the phone's share sheet (Web Share API) with the photo
 * as a file. Browsers only allow that directly in the tap, so the file is
 * fetched beforehand: shortly after the photo is opened (not while swiping
 * past it), and "Delen" waits (disabled) until it is there. Where sharing
 * files is not supported there is no "Delen"; if fetching the file fails,
 * "Delen" downloads the photo instead (still in the tap). If the share
 * sheet itself fails, the Gast is pointed at the download button: a
 * download started outside the tap may be blocked.
 */
export function PhotoActions({
  fileName,
  shareUrl,
  downloads,
}: {
  /** File name for downloads and the shared file, e.g. `Anna_2026-10-31_21-15-03.jpg`. */
  fileName: string;
  /** The (watermarked) image to share. */
  shareUrl: string;
  /** Download buttons; the first one is also the fallback for "Delen". */
  downloads: PhotoDownload[];
}) {
  const canShare = useSyncExternalStore(noSubscription, canShareFiles, () => false);
  // The file to share, for this photo only (keyed by its URL): null while
  // it loads, "failed" when it could not be fetched.
  const [prefetched, setPrefetched] = useState<{ url: string; file: File | "failed" } | null>(
    null,
  );
  const [failedShare, setFailedShare] = useState<string | null>(null); // shareUrl it failed for
  const fallback = useRef<HTMLAnchorElement>(null);
  const file = prefetched?.url === shareUrl ? prefetched.file : null;

  // Fetch the file to share once the photo stays open for a moment.
  useEffect(() => {
    if (!canShare) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(shareUrl, { signal: controller.signal });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const blob = await response.blob();
        setPrefetched({ url: shareUrl, file: new File([blob], fileName, { type: "image/jpeg" }) });
      } catch {
        // Offline or failed: "Delen" falls back to downloading. (Aborted:
        // another photo was opened; this one's state no longer shows.)
        if (!controller.signal.aborted) setPrefetched({ url: shareUrl, file: "failed" });
      }
    }, 400);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [canShare, fileName, shareUrl]);

  const [primary, ...others] = downloads;
  const share = () => {
    setFailedShare(null);
    if (file === null) return; // still loading (the button is disabled)
    if (file === "failed" || !navigator.canShare?.({ files: [file] })) {
      fallback.current?.click(); // still in the tap
      return;
    }
    // Called right in the tap: the share sheet needs the user's gesture.
    navigator.share({ files: [file] }).catch((error: unknown) => {
      if (error instanceof DOMException && error.name === "AbortError") return; // closed the sheet
      setFailedShare(shareUrl);
    });
  };

  return (
    <div className="flex flex-col gap-2">
      {failedShare === shareUrl && (
        <p role="status" className="text-center text-sm text-stone-400">
          Delen lukte niet. Tik op &ldquo;{primary.label}&rdquo; om de foto te bewaren.
        </p>
      )}
      <div className="flex flex-wrap justify-center gap-2">
        {canShare && (
          <button
            type="button"
            onClick={share}
            disabled={file === null}
            aria-busy={file === null}
            className="h-11 rounded-full bg-accent px-5 text-sm font-semibold text-stone-950 disabled:opacity-60"
          >
            {file === null ? "Delen laden…" : "Delen"}
          </button>
        )}
        <a
          ref={fallback}
          href={primary.href}
          download={fileName}
          className="flex h-11 items-center rounded-full bg-stone-800 px-5 text-sm font-medium"
        >
          {primary.label}
        </a>
        {others.map((download) => (
          <a
            key={download.href}
            href={download.href}
            download={fileName}
            className="flex h-11 items-center rounded-full bg-stone-800 px-5 text-sm font-medium"
          >
            {download.label}
          </a>
        ))}
      </div>
    </div>
  );
}

let shareSupport: boolean | undefined;

/** Whether this browser can share image files (asked once). */
function canShareFiles(): boolean {
  if (shareSupport === undefined) {
    const probe = new File([new Uint8Array(1)], "foto.jpg", { type: "image/jpeg" });
    shareSupport =
      typeof navigator.share === "function" &&
      typeof navigator.canShare === "function" &&
      navigator.canShare({ files: [probe] });
  }
  return shareSupport;
}

function noSubscription(): () => void {
  return () => {};
}
