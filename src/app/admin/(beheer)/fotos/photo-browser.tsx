"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { deletePhotoAction, setPhotoHiddenAction } from "../../actions";
import { PhotoActions } from "../../../photo-actions";
import { adminPhotoUrl } from "../../photo-url";

/** A photo as the grid needs it; everything preformatted on the server. */
export interface BrowserPhoto {
  id: string;
  guestName: string;
  /** "21:37", in the party's time zone. */
  time: string;
  hidden: boolean;
  width: number;
  height: number;
  /** For a download: `<gast>_<tijdstip>.jpg`. */
  fileName: string;
}

export interface BrowserSection {
  /** Anchor id, e.g. `gast-<guestId>`. */
  id: string;
  title: string;
  subtitle?: string;
  photos: BrowserPhoto[];
}

/**
 * The Host's photo grid (thumbnails, lazy-loaded) plus a lightbox to judge a
 * photo full size, hide/unhide it and delete it after an in-page confirmation.
 */
export function PhotoBrowser({
  sections,
  showGuestNames,
}: {
  sections: BrowserSection[];
  showGuestNames: boolean;
}) {
  const ordered = useMemo(() => sections.flatMap((section) => section.photos), [sections]);
  const [openId, setOpenId] = useState<string | null>(null);
  const openIndex = openId ? ordered.findIndex((photo) => photo.id === openId) : -1;

  return (
    <>
      <div className="flex flex-col gap-6">
        {sections.map((section) => (
          <section key={section.id} id={section.id} aria-labelledby={`${section.id}-title`} className="scroll-mt-28">
            <header className="mb-2 flex items-baseline justify-between gap-3">
              <h2 id={`${section.id}-title`} className="truncate font-semibold">
                {section.title}
              </h2>
              {section.subtitle && (
                <span className="shrink-0 text-sm text-stone-400 tabular-nums">{section.subtitle}</span>
              )}
            </header>
            {section.photos.length === 0 ? (
              <p className="text-sm text-stone-500">Nog geen foto&apos;s.</p>
            ) : (
              <ul className="grid grid-cols-3 gap-1 sm:grid-cols-4 md:grid-cols-6">
                {section.photos.map((photo) => (
                  <li key={photo.id}>
                    <Tile
                      photo={photo}
                      showGuestName={showGuestNames}
                      onOpen={() => setOpenId(photo.id)}
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>
      {openIndex >= 0 && (
        <Lightbox
          key={ordered[openIndex].id}
          photo={ordered[openIndex]}
          previous={ordered[openIndex - 1]?.id ?? null}
          next={ordered[openIndex + 1]?.id ?? null}
          position={`${openIndex + 1} / ${ordered.length}`}
          onNavigate={setOpenId}
          onClose={() => setOpenId(null)}
        />
      )}
    </>
  );
}

function Tile({
  photo,
  showGuestName,
  onOpen,
}: {
  photo: BrowserPhoto;
  showGuestName: boolean;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="relative block aspect-square w-full overflow-hidden rounded-sm bg-stone-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      aria-label={`Foto van ${photo.guestName}, ${photo.time}${photo.hidden ? ", verborgen" : ""}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- private bytes from our own route; next/image would only re-proxy them */}
      <img
        src={adminPhotoUrl(photo.id, "thumb")}
        alt=""
        width={photo.width}
        height={photo.height}
        loading="lazy"
        decoding="async"
        className={`size-full object-cover ${photo.hidden ? "opacity-35 grayscale" : ""}`}
      />
      {photo.hidden && (
        <span className="absolute top-1 left-1 rounded bg-stone-950/80 px-1.5 py-0.5 text-[11px] font-semibold text-stone-200">
          Verborgen
        </span>
      )}
      {showGuestName && (
        <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-stone-950/80 px-1.5 pt-3 pb-1 text-left text-[11px] text-stone-100">
          {photo.guestName}
        </span>
      )}
    </button>
  );
}

function Lightbox({
  photo,
  previous,
  next,
  position,
  onNavigate,
  onClose,
}: {
  photo: BrowserPhoto;
  previous: string | null;
  next: string | null;
  position: string;
  onNavigate: (id: string) => void;
  onClose: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const dialogRef = useRef<HTMLDivElement>(null);
  const touchStart = useRef<number | null>(null);

  const go = useCallback(
    (id: string | null) => {
      if (id && !pending) onNavigate(id);
    },
    [onNavigate, pending],
  );

  // Keyboard: Escape closes (or cancels the confirmation), arrows browse.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (confirming) setConfirming(false);
        else onClose();
      } else if (event.key === "ArrowLeft" && !confirming) go(previous);
      else if (event.key === "ArrowRight" && !confirming) go(next);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [confirming, go, next, onClose, previous]);

  // No page scrolling behind the lightbox; focus moves into it.
  useEffect(() => {
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    dialogRef.current?.focus();
    return () => {
      document.body.style.overflow = overflow;
    };
  }, []);

  const toggleHidden = () => {
    setError(null);
    startTransition(async () => {
      const result = await setPhotoHiddenAction(photo.id, !photo.hidden);
      if (!result.ok) setError(result.error);
    });
  };

  const remove = () => {
    setError(null);
    // Where to go once this photo is gone.
    const after = next ?? previous;
    startTransition(async () => {
      const result = await deletePhotoAction(photo.id);
      if (!result.ok) {
        setError(result.error);
        setConfirming(false);
        return;
      }
      if (after) onNavigate(after);
      else onClose();
    });
  };

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={`Foto van ${photo.guestName}`}
      tabIndex={-1}
      className="fixed inset-0 z-50 flex flex-col bg-stone-950/97 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] outline-none"
    >
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <div className="min-w-0">
          <p className="truncate font-semibold">{photo.guestName}</p>
          <p className="text-sm text-stone-400 tabular-nums">
            {photo.time} · {position}
            {photo.hidden && " · verborgen"}
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
        className="relative flex min-h-0 flex-1 items-center justify-center"
        onTouchStart={(event) => {
          touchStart.current = event.touches[0]?.clientX ?? null;
        }}
        onTouchEnd={(event) => {
          const start = touchStart.current;
          touchStart.current = null;
          const end = event.changedTouches[0]?.clientX;
          if (start === null || end === undefined || confirming) return;
          if (end - start > 60) go(previous);
          else if (start - end > 60) go(next);
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- private bytes from our own route */}
        <img
          src={adminPhotoUrl(photo.id, "original")}
          alt={`Foto van ${photo.guestName} om ${photo.time}`}
          width={photo.width}
          height={photo.height}
          className={`max-h-full max-w-full object-contain ${photo.hidden ? "opacity-60" : ""}`}
          style={{ backgroundImage: `url(${adminPhotoUrl(photo.id, "thumb")})`, backgroundSize: "contain", backgroundRepeat: "no-repeat", backgroundPosition: "center" }}
        />
        <NavButton label="Vorige foto" side="left" disabled={!previous} onClick={() => go(previous)} />
        <NavButton label="Volgende foto" side="right" disabled={!next} onClick={() => go(next)} />
      </div>

      <div className="flex flex-col gap-2 px-4 pt-3 pb-4">
        {error && (
          <p role="alert" className="text-center text-sm font-medium text-red-400">
            {error}
          </p>
        )}
        {confirming ? (
          <div role="alertdialog" aria-labelledby="confirm-delete" className="flex flex-col gap-3 rounded-2xl bg-stone-900 p-4">
            <p id="confirm-delete" className="text-sm">
              <strong className="block text-base">Deze foto definitief verwijderen?</strong>
              Dit kan niet ongedaan gemaakt worden. {photo.guestName} krijgt het shot niet terug.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setConfirming(false)}
                disabled={pending}
                className="h-12 rounded-xl bg-stone-800 font-medium disabled:opacity-60"
              >
                Annuleren
              </button>
              <button
                type="button"
                onClick={remove}
                disabled={pending}
                className="h-12 rounded-xl bg-red-600 font-semibold text-white disabled:opacity-60"
              >
                {pending ? "Verwijderen…" : "Ja, verwijderen"}
              </button>
            </div>
          </div>
        ) : (
          <>
            <PhotoActions
              fileName={photo.fileName}
              // Phone-sized with the watermark, as Gasten share it (cached,
              // unlike the full-size version the download buttons give).
              shareUrl={adminPhotoUrl(photo.id, "display", { watermarked: true })}
              downloads={[
                { label: "Met watermark", href: adminPhotoUrl(photo.id, "shareable") },
                { label: "Origineel", href: adminPhotoUrl(photo.id, "original") },
              ]}
            />
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={toggleHidden}
                disabled={pending}
                className="h-12 rounded-xl bg-stone-800 font-medium disabled:opacity-60"
              >
                {pending ? "Bezig…" : photo.hidden ? "Weer tonen" : "Verbergen"}
              </button>
              <button
                type="button"
                onClick={() => setConfirming(true)}
                disabled={pending}
                className="h-12 rounded-xl bg-red-950 font-medium text-red-200 disabled:opacity-60"
              >
                Verwijderen
              </button>
            </div>
          </>
        )}
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
