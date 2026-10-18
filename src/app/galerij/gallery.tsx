"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { loadMorePhotos } from "./actions";
import type { ViewPage, ViewPhoto } from "./gallery-data";
import { galleryPhotoUrl } from "./photo-url";

/**
 * The Galerij: a grid of thumbnails (lazy-loaded, more pages as you scroll)
 * and a lightbox to view a photo large, swipe through them and see who took
 * it. Only the public gallery route serves the bytes.
 */
export function Gallery({
  initial,
  mine,
  emptyText,
}: {
  initial: ViewPage;
  mine: boolean;
  emptyText: string;
}) {
  const router = useRouter();
  const [photos, setPhotos] = useState<ViewPhoto[]>(initial.photos);
  const [cursor, setCursor] = useState<string | null>(initial.nextCursor);
  const [error, setError] = useState<string | null>(null);
  const [loading, startLoading] = useTransition();
  const [openId, setOpenId] = useState<string | null>(null);
  /** After loading more from the lightbox: open the first new photo. */
  const openAfterLoad = useRef(false);
  const sentinel = useRef<HTMLDivElement>(null);

  const loadMore = useCallback(() => {
    if (!cursor || loading) return;
    setError(null);
    startLoading(async () => {
      const result = await loadMorePhotos(cursor, mine);
      if (!result.ok) {
        openAfterLoad.current = false;
        if (result.notRevealed) router.refresh();
        else setError("Meer foto's laden lukte niet.");
        return;
      }
      const seen = new Set(photos.map((photo) => photo.id));
      const fresh = result.page.photos.filter((photo) => !seen.has(photo.id));
      setPhotos([...photos, ...fresh]);
      setCursor(result.page.nextCursor);
      if (openAfterLoad.current) {
        openAfterLoad.current = false;
        if (fresh[0]) setOpenId(fresh[0].id);
      }
    });
  }, [cursor, loading, mine, photos, router]);

  // Load the next page when the end of the grid comes into view.
  useEffect(() => {
    const element = sentinel.current;
    if (!element || !cursor) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) loadMore();
      },
      { rootMargin: "800px 0px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [cursor, loadMore]);

  const openIndex = openId ? photos.findIndex((photo) => photo.id === openId) : -1;

  if (photos.length === 0 && !cursor) {
    return <p className="px-2 text-stone-400">{emptyText}</p>;
  }

  return (
    <>
      <ul className="grid grid-cols-3 gap-1 sm:grid-cols-4 md:grid-cols-6">
        {photos.map((photo) => (
          <li key={photo.id}>
            <button
              type="button"
              onClick={() => setOpenId(photo.id)}
              aria-label={`Foto van ${photo.guestName}, ${photo.time}`}
              className="relative block aspect-square w-full overflow-hidden rounded-sm bg-stone-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- private bytes from our own route; next/image would only re-proxy them */}
              <img
                src={galleryPhotoUrl(photo.id, "thumb")}
                alt=""
                width={photo.width}
                height={photo.height}
                loading="lazy"
                decoding="async"
                className="size-full object-cover"
              />
            </button>
          </li>
        ))}
      </ul>
      <div ref={sentinel} className="flex min-h-12 flex-col items-center justify-center gap-2 py-4">
        {error && (
          <p role="alert" className="text-sm font-medium text-red-400">
            {error}
          </p>
        )}
        {cursor && (
          <button
            type="button"
            onClick={loadMore}
            disabled={loading}
            className="rounded-full bg-stone-800 px-5 py-2 text-sm font-medium disabled:opacity-60"
          >
            {loading ? "Laden…" : "Meer foto's"}
          </button>
        )}
      </div>
      {openIndex >= 0 && (
        <Lightbox
          key={photos[openIndex].id}
          photo={photos[openIndex]}
          previous={photos[openIndex - 1]?.id ?? null}
          next={photos[openIndex + 1]?.id ?? null}
          canLoadMore={cursor !== null}
          loading={loading}
          position={`${openIndex + 1} / ${photos.length}${cursor ? "+" : ""}`}
          onNavigate={setOpenId}
          onLoadMore={() => {
            openAfterLoad.current = true;
            loadMore();
          }}
          onClose={() => setOpenId(null)}
        />
      )}
    </>
  );
}

function Lightbox({
  photo,
  previous,
  next,
  canLoadMore,
  loading,
  position,
  onNavigate,
  onLoadMore,
  onClose,
}: {
  photo: ViewPhoto;
  previous: string | null;
  next: string | null;
  canLoadMore: boolean;
  loading: boolean;
  position: string;
  onNavigate: (id: string) => void;
  onLoadMore: () => void;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const hasNext = next !== null || canLoadMore;

  const goPrevious = useCallback(() => {
    if (previous) onNavigate(previous);
  }, [onNavigate, previous]);
  const goNext = useCallback(() => {
    if (next) onNavigate(next);
    else if (canLoadMore && !loading) onLoadMore();
  }, [canLoadMore, loading, next, onLoadMore, onNavigate]);

  // Keyboard: Escape closes, arrows browse.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      else if (event.key === "ArrowLeft") goPrevious();
      else if (event.key === "ArrowRight") goNext();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goNext, goPrevious, onClose]);

  // No page scrolling behind the lightbox; focus moves into it.
  useEffect(() => {
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    dialogRef.current?.focus();
    return () => {
      document.body.style.overflow = overflow;
    };
  }, []);

  // Warm up the neighbours, so swiping feels instant.
  useEffect(() => {
    for (const id of [next, previous]) {
      if (id) new window.Image().src = galleryPhotoUrl(id, "display");
    }
  }, [next, previous]);

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={`Foto van ${photo.guestName}`}
      tabIndex={-1}
      className="fixed inset-0 z-50 flex flex-col bg-stone-950 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] outline-none"
    >
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <div className="min-w-0">
          <p className="truncate font-semibold">
            <span className="sr-only">Foto van </span>
            {photo.guestName}
          </p>
          <p className="text-sm text-stone-400 tabular-nums">
            {photo.time} · {position}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 rounded-full bg-stone-800 px-4 py-2 text-sm font-medium"
        >
          Sluiten
        </button>
      </div>

      <div
        className="relative flex min-h-0 flex-1 touch-pan-y items-center justify-center"
        onTouchStart={(event) => {
          const touch = event.touches[0];
          touchStart.current = touch ? { x: touch.clientX, y: touch.clientY } : null;
        }}
        onTouchEnd={(event) => {
          const start = touchStart.current;
          touchStart.current = null;
          const touch = event.changedTouches[0];
          if (!start || !touch) return;
          const dx = touch.clientX - start.x;
          const dy = touch.clientY - start.y;
          if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy)) return;
          if (dx > 0) goPrevious();
          else goNext();
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- private bytes from our own route */}
        <img
          src={galleryPhotoUrl(photo.id, "display")}
          alt={`Foto van ${photo.guestName} om ${photo.time}`}
          width={photo.width}
          height={photo.height}
          className="max-h-full max-w-full object-contain select-none"
          draggable={false}
          style={{
            backgroundImage: `url(${galleryPhotoUrl(photo.id, "thumb")})`,
            backgroundSize: "contain",
            backgroundRepeat: "no-repeat",
            backgroundPosition: "center",
          }}
        />
        <NavButton label="Vorige foto" side="left" disabled={!previous} onClick={goPrevious} />
        <NavButton
          label="Volgende foto"
          side="right"
          disabled={!hasNext || (next === null && loading)}
          onClick={goNext}
        />
      </div>
    </div>
  );
}

function NavButton({
  label,
  side,
  disabled,
  onClick,
}: {
  label: string;
  side: "left" | "right";
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={`absolute top-1/2 ${side === "left" ? "left-2" : "right-2"} flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-stone-900/70 text-2xl text-stone-100 disabled:opacity-0`}
    >
      <span aria-hidden="true">{side === "left" ? "‹" : "›"}</span>
    </button>
  );
}
