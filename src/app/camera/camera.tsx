"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { CaptureSource } from "./capture-source";
import { preparePhoto, UnsupportedPhotoError } from "./prepare-photo";
import { RollFull } from "./roll-full";
import { SystemCamera } from "./system-camera";
import { uploadShot } from "./upload-shot";

export interface CameraProps {
  guestName: string;
  shotsRemaining: number;
  shotsPerGuest: number;
  /** ISO timestamp of the Reveal, or null. */
  revealAt: string | null;
  /** Server limits, passed in so this client code does not import the domain module. */
  maxLongSide: number;
  maxBytes: number;
  /** How photos are taken. Defaults to the system camera; ticket 03 adds a live viewfinder. */
  captureSource?: CaptureSource;
}

type Notice = { tone: "ok" | "error"; text: string } | null;

/**
 * The camera: a shutter, the Rolletje counter, and nothing else. The photo is
 * never shown (no preview, no object URL); the counter only moves on the
 * server's answer.
 */
export function Camera({
  guestName,
  shotsRemaining: initialRemaining,
  shotsPerGuest: initialPerGuest,
  revealAt,
  maxLongSide,
  maxBytes,
  captureSource: CaptureSourceComponent = SystemCamera,
}: CameraProps) {
  const router = useRouter();
  const [roll, setRoll] = useState({
    remaining: initialRemaining,
    perGuest: initialPerGuest,
  });
  const [uploading, setUploading] = useState(0);
  const [notice, setNotice] = useState<Notice>(null);
  // Answers can arrive out of order; the one with the most shots taken is newest.
  const mostShotsTaken = useRef(initialPerGuest - initialRemaining);

  // Guards against a second capture before the disabled state has rendered.
  const busy = useRef(false);

  async function handleCapture(photo: Blob) {
    if (busy.current) return;
    busy.current = true;
    setUploading((n) => n + 1);
    setNotice(null);
    try {
      let prepared: Blob;
      try {
        prepared = await preparePhoto(photo, { maxLongSide, maxBytes });
      } catch (error) {
        setNotice({
          tone: "error",
          text:
            error instanceof UnsupportedPhotoError
              ? "Dit fotoformaat wordt niet ondersteund of de foto is te groot. Er is geen shot verbruikt."
              : "Deze foto kon niet verwerkt worden. Er is geen shot verbruikt, probeer opnieuw.",
        });
        return;
      }

      const outcome = await uploadShot(prepared);
      switch (outcome.kind) {
        case "stored": {
          const taken = outcome.shotsPerGuest - outcome.shotsRemaining;
          if (taken >= mostShotsTaken.current) {
            mostShotsTaken.current = taken;
            setRoll({ remaining: outcome.shotsRemaining, perGuest: outcome.shotsPerGuest });
          }
          setNotice({ tone: "ok", text: "Klik! Foto opgeslagen." });
          break;
        }
        case "roll-full":
          setRoll((r) => ({ ...r, remaining: 0 }));
          break;
        case "no-session":
          router.replace("/");
          break;
        case "invalid-image":
          setNotice({
            tone: "error",
            text: "Deze foto kon niet verwerkt worden. Er is geen shot verbruikt.",
          });
          break;
        case "failed":
          setNotice({
            tone: "error",
            text: "Uploaden is mogelijk niet gelukt. Controleer je teller en probeer het opnieuw.",
          });
          break;
      }
    } finally {
      busy.current = false;
      setUploading((n) => n - 1);
    }
  }

  if (roll.remaining <= 0) {
    return <RollFull shotsPerGuest={roll.perGuest} revealAt={revealAt} />;
  }

  return (
    <>
      <header className="flex items-center justify-between text-sm text-stone-400">
        <span>{guestName}</span>
        <span className="font-mono text-base tabular-nums text-stone-100" aria-live="polite">
          <span className="sr-only">Nog </span>
          {roll.remaining} / {roll.perGuest}
          <span className="sr-only"> shots over</span>
        </span>
      </header>

      <section className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
        <p className="text-stone-400">
          Je ziet je foto&apos;s pas bij de onthulling. Geen preview, geen herkansing.
        </p>
        <p role="status" className="min-h-6 text-sm font-medium">
          {uploading > 0 ? (
            <span className="text-stone-300">Foto wordt opgeslagen…</span>
          ) : notice ? (
            <span className={notice.tone === "ok" ? "text-accent" : "text-red-400"}>
              {notice.text}
            </span>
          ) : null}
        </p>
      </section>

      {/* One photo at a time: phones run out of memory decoding several at once. */}
      <CaptureSourceComponent onCapture={handleCapture} disabled={uploading > 0} />
    </>
  );
}
