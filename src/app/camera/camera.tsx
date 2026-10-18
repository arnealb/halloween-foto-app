"use client";

import { useEffect, useEffectEvent, useReducer, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { CaptureSource } from "./capture-source";
import { LiveCamera } from "./live-camera";
import { preparePhoto, UnsupportedPhotoError } from "./prepare-photo";
import { CaptureClosed } from "./capture-closed";
import { RollFull } from "./roll-full";
import { initialRollState, rollReducer, shotsRemaining, type ServerView } from "./roll-state";
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
  /** Event title and welcome text, shown above the viewfinder. */
  title: string;
  welcomeText: string;
  /** Shots this Gast took so far, as the server last saw it. */
  shotsTaken: number;
  /** Size of the Rolletje (the Event's current setting). */
  shotsPerGuest: number;
  /** Whether fotograferen is open (the Host can close it). */
  captureOpen: boolean;
  /** Unique per server render: every refresh brings a new server view. */
  viewId: string;
  /** ISO timestamp of the Reveal, or null. */
  revealAt: string | null;
  /** Server limits, passed in so this client code does not import the domain module. */
  maxLongSide: number;
  maxBytes: number;
  /** How photos are taken. Defaults to the live viewfinder (which falls back to the system camera). */
  captureSource?: CaptureSource;
}

type Notice = { tone: "ok" | "error"; text: string } | null;

/** How often an open camera re-reads the server's view (settings, Rolletje). */
const REFRESH_EVERY_MS = 30_000;

/**
 * The camera: a viewfinder with a shutter, the Rolletje counter, and nothing
 * else. Photos are never shown (no preview, no object URL). Every photo gets
 * a shot id and goes into an upload queue that retries until it is through;
 * the counter only moves on the server's answers.
 *
 * The page re-renders it with fresh server data (when the phone comes back to
 * the page, and every half minute), so a changed Rolletje size or fotograferen
 * open/dicht shows up without a reload. It stays mounted throughout, so photos
 * in the upload queue are never lost.
 */
export function Camera({
  guestName,
  title,
  welcomeText,
  shotsTaken: serverTaken,
  shotsPerGuest: serverPerGuest,
  captureOpen: serverCaptureOpen,
  viewId,
  revealAt,
  maxLongSide,
  maxBytes,
  captureSource: CaptureSourceComponent = LiveCamera,
}: CameraProps) {
  const router = useRouter();
  const [queueState, setQueueState] = useState<UploadQueueState>({
    pending: 0,
    waitingToRetry: false,
  });
  // Photos from the system camera still being compressed (before the queue).
  const [preparing, setPreparing] = useState(0);
  const [notice, setNotice] = useState<Notice>(null);
  const inFlight = preparing + queueState.pending;

  // Rolletje and open/dicht: the server's view, corrected by upload answers.
  const serverView: ServerView = {
    viewId,
    shotsTaken: serverTaken,
    shotsPerGuest: serverPerGuest,
    captureOpen: serverCaptureOpen,
  };
  const [roll, dispatch] = useReducer(rollReducer, serverView, initialRollState);
  if (roll.viewId !== viewId) dispatch({ type: "server-view", view: serverView, inFlight });
  const queue = useRef<UploadQueue | null>(null);
  // Compress one photo at a time: phones run out of memory decoding several at once.
  const preparation = useRef<Promise<void>>(Promise.resolve());

  const remaining = shotsRemaining(roll);
  const captureOpen = roll.captureOpen;

  const onSettled = useEffectEvent((outcome: SettledOutcome) => {
    switch (outcome.kind) {
      case "stored": {
        // The Rolletje size in an answer may predate a settings change; only
        // the shot count is taken from it.
        dispatch({
          type: "stored",
          shotsTaken: outcome.shotsPerGuest - outcome.shotsRemaining,
        });
        break;
      }
      case "roll-full":
        // Full until the server says otherwise (the Host may have changed
        // the Rolletje size); ask for its current view.
        dispatch({ type: "roll-full" });
        router.refresh();
        break;
      case "capture-closed":
        dispatch({ type: "capture-closed" });
        setNotice({
          tone: "error",
          text: "Fotograferen is gesloten. Een foto die je net maakte is niet opgeslagen; daarvoor is geen shot verbruikt.",
        });
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

  // Re-read the server's view now and then, and whenever the Gast comes back.
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    const timer = setInterval(refresh, REFRESH_EVERY_MS);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [router]);

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

  const uploadStatus =
    inFlight > 0 ? (
      <span className="text-stone-300">
        Nog {inFlight} {inFlight === 1 ? "foto" : "foto's"} aan het uploaden…
        {queueState.waitingToRetry && (
          <span className="block text-stone-500">
            Geen verbinding? We blijven het proberen. Sluit de app nog niet.
          </span>
        )}
      </span>
    ) : notice ? (
      <span className={notice.tone === "ok" ? "text-accent" : "text-red-400"}>{notice.text}</span>
    ) : null;

  if (remaining <= 0) {
    return <RollFull shotsPerGuest={roll.perGuest} revealAt={revealAt} />;
  }

  if (!captureOpen) {
    return (
      <>
        <CaptureClosed title={title} remaining={remaining} perGuest={roll.perGuest} />
        <p role="status" className="min-h-5 text-center text-sm font-medium">
          {uploadStatus}
        </p>
      </>
    );
  }

  return (
    <>
      <header className="flex flex-col gap-1">
        <div className="flex items-baseline justify-between gap-3">
          <h1 className="min-w-0 truncate text-lg font-bold tracking-tight">{title}</h1>
          <span
            className="shrink-0 font-mono text-base tabular-nums text-stone-100"
            aria-live="polite"
          >
            <span className="sr-only">Nog </span>
            {remaining} / {roll.perGuest}
            <span className="sr-only"> shots over</span>
          </span>
        </div>
        <p className="text-sm text-stone-400">
          <span className="text-accent">{guestName}</span>
          {welcomeText && <span className="line-clamp-2 whitespace-pre-line"> {welcomeText}</span>}
        </p>
      </header>

      <CaptureSourceComponent
        onCapture={handleCapture}
        onCaptureFailed={handleCaptureFailed}
        // Server is the judge, but don't let rapid tapping outrun the Rolletje.
        disabled={remaining - inFlight <= 0}
        maxLongSide={maxLongSide}
        maxBytes={maxBytes}
      />

      <p role="status" className="min-h-5 text-center text-sm font-medium">
        {uploadStatus}
      </p>
    </>
  );
}
