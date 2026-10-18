"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { CaptureSource } from "./capture-source";
import { LiveCamera } from "./live-camera";
import { preparePhoto, UnsupportedPhotoError } from "./prepare-photo";
import { RollFull } from "./roll-full";
import { newShotId } from "./shot-id";
import {
  createUploadQueue,
  type SettledOutcome,
  type UploadQueue,
  type UploadQueueState,
} from "./upload-queue";
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
  /** How photos are taken. Defaults to the live viewfinder (which falls back to the system camera). */
  captureSource?: CaptureSource;
}

type Notice = { tone: "ok" | "error"; text: string } | null;

/**
 * The camera: a viewfinder with a shutter, the Rolletje counter, and nothing
 * else. Photos are never shown (no preview, no object URL). Every photo gets
 * a shot id and goes into an upload queue that retries until it is through;
 * the counter only moves on the server's answers.
 */
export function Camera({
  guestName,
  shotsRemaining: initialRemaining,
  shotsPerGuest: initialPerGuest,
  revealAt,
  maxLongSide,
  maxBytes,
  captureSource: CaptureSourceComponent = LiveCamera,
}: CameraProps) {
  const router = useRouter();
  const [roll, setRoll] = useState({
    remaining: initialRemaining,
    perGuest: initialPerGuest,
  });
  const [queueState, setQueueState] = useState<UploadQueueState>({
    pending: 0,
    waitingToRetry: false,
  });
  // Photos from the system camera still being compressed (before the queue).
  const [preparing, setPreparing] = useState(0);
  const [notice, setNotice] = useState<Notice>(null);
  // Answers can arrive out of order; the one with the most shots taken is newest.
  const mostShotsTaken = useRef(initialPerGuest - initialRemaining);
  const queue = useRef<UploadQueue | null>(null);
  // Compress one photo at a time: phones run out of memory decoding several at once.
  const preparation = useRef<Promise<void>>(Promise.resolve());

  const inFlight = preparing + queueState.pending;

  const onSettled = useEffectEvent((outcome: SettledOutcome) => {
    switch (outcome.kind) {
      case "stored": {
        const taken = outcome.shotsPerGuest - outcome.shotsRemaining;
        if (taken >= mostShotsTaken.current) {
          mostShotsTaken.current = taken;
          setRoll({ remaining: outcome.shotsRemaining, perGuest: outcome.shotsPerGuest });
        }
        break;
      }
      case "roll-full":
        setRoll((r) => ({ ...r, remaining: 0 }));
        break;
      case "no-session":
        router.replace("/");
        break;
      case "rejected":
        setNotice({
          tone: "error",
          text: "Een foto kon niet worden opgeslagen. Daarvoor is geen shot verbruikt.",
        });
        break;
      case "failed":
        setNotice({
          tone: "error",
          text: "Een foto kon door een serverfout niet worden geüpload, ook niet na meerdere pogingen. We gaan door met de rest.",
        });
        break;
    }
  });

  // The upload queue lives as long as the camera is open.
  useEffect(() => {
    const instance = createUploadQueue({
      upload: uploadShot,
      onSettled: (_shot, outcome) => onSettled(outcome),
      onChange: setQueueState,
    });
    queue.current = instance;
    const retryNow = () => instance.retryNow();
    window.addEventListener("online", retryNow);
    return () => {
      window.removeEventListener("online", retryNow);
      instance.dispose();
      queue.current = null;
    };
  }, []);

  // Warn before closing the page while photos are not uploaded yet.
  useEffect(() => {
    if (inFlight === 0) return;
    function warn(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = ""; // older Safari / Chrome need this to show the dialog
    }
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [inFlight]);

  function handleCapture(photo: Blob, options?: { prepared?: boolean }) {
    setNotice(null);
    // One id per photo, generated now and repeated on every upload attempt.
    const shotId = newShotId();
    if (options?.prepared) {
      queue.current?.add({ shotId, photo });
      return;
    }

    setPreparing((n) => n + 1);
    preparation.current = preparation.current.then(async () => {
      try {
        const prepared = await preparePhoto(photo, { maxLongSide, maxBytes });
        queue.current?.add({ shotId, photo: prepared });
      } catch (error) {
        setNotice({
          tone: "error",
          text:
            error instanceof UnsupportedPhotoError
              ? "Dit fotoformaat wordt niet ondersteund of de foto is te groot. Er is geen shot verbruikt."
              : "Deze foto kon niet verwerkt worden. Er is geen shot verbruikt, probeer opnieuw.",
        });
      } finally {
        setPreparing((n) => n - 1);
      }
    });
  }

  function handleCaptureFailed() {
    setNotice({
      tone: "error",
      text: "Die foto lukte niet. Er is geen shot verbruikt, probeer opnieuw.",
    });
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

      <CaptureSourceComponent
        onCapture={handleCapture}
        onCaptureFailed={handleCaptureFailed}
        // Server is the judge, but don't let rapid tapping outrun the Rolletje.
        disabled={roll.remaining - inFlight <= 0}
        maxLongSide={maxLongSide}
        maxBytes={maxBytes}
      />

      <p role="status" className="min-h-5 text-center text-sm font-medium">
        {inFlight > 0 ? (
          <span className="text-stone-300">
            Nog {inFlight} {inFlight === 1 ? "foto" : "foto's"} aan het uploaden…
            {queueState.waitingToRetry && (
              <span className="block text-stone-500">
                Geen verbinding? We blijven het proberen. Sluit de app nog niet.
              </span>
            )}
          </span>
        ) : notice ? (
          <span className={notice.tone === "ok" ? "text-accent" : "text-red-400"}>
            {notice.text}
          </span>
        ) : null}
      </p>
    </>
  );
}
