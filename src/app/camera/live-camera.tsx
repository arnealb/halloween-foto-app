"use client";

import { useEffect, useRef, useState } from "react";
import { CameraHelp, type CameraProblem } from "./camera-help";
import type { CaptureSourceProps } from "./capture-source";
import { FrameGrabber } from "./frame-grabber";
import { SystemCamera } from "./system-camera";

type Facing = "environment" | "user";

type Status =
  | { kind: "starting" }
  | { kind: "live" }
  | { kind: "problem"; problem: CameraProblem };

/**
 * Capture source: a live viewfinder through `getUserMedia`, rear camera by
 * default, with a switch to the front camera. The shutter grabs the current
 * frame straight into a JPEG (see {@link FrameGrabber}); the photo is never
 * shown, only a flash. If the camera is refused or unsupported, the Gast gets
 * an explanation and can fall back to the {@link SystemCamera}.
 */
export function LiveCamera(props: CaptureSourceProps) {
  const { onCapture, onCaptureFailed, disabled, maxLongSide, maxBytes } = props;
  const videoRef = useRef<HTMLVideoElement>(null);
  const [facing, setFacing] = useState<Facing>("environment");
  const [status, setStatus] = useState<Status>({ kind: "starting" });
  const [canSwitch, setCanSwitch] = useState(false);
  const [useSystemCamera, setUseSystemCamera] = useState(false);
  // Bumped to (re)start the stream: retry, or back from the background.
  const [session, setSession] = useState(0);
  const [flashes, setFlashes] = useState(0);
  const [grabberBusy, setGrabberBusy] = useState(false);
  const grabber = useRef<FrameGrabber | null>(null);

  // Start the stream for the current camera; stop it when leaving.
  useEffect(() => {
    const element = videoRef.current;
    if (useSystemCamera || !element) return;
    const video: HTMLVideoElement = element;
    let stream: MediaStream | null = null;
    let cancelled = false;

    async function start() {
      await Promise.resolve(); // state updates below never run synchronously in the effect
      if (cancelled) return;
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        setStatus({ kind: "problem", problem: "unsupported" });
        return;
      }
      setStatus({ kind: "starting" });
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: facing },
            width: { ideal: 2560 },
            height: { ideal: 1440 },
          },
        });
      } catch (error) {
        if (!cancelled) setStatus({ kind: "problem", problem: problemOf(error) });
        return;
      }
      if (cancelled) {
        stopStream(stream);
        return;
      }
      if (isHidden()) {
        // Went to the background while the camera was starting: release it at
        // once; coming back starts a new stream.
        stopStream(stream);
        stream = null;
        return;
      }
      video.srcObject = stream;
      try {
        await video.play();
      } catch {
        // Autoplay of a muted, inline video is allowed; ignore a play() that
        // was interrupted by a newer stream.
      }
      // Hidden meanwhile: the visibility handler already stopped this stream.
      if (cancelled || isHidden()) return;
      setStatus({ kind: "live" });

      // Only offer the switch when there is more than one camera.
      const devices = await navigator.mediaDevices.enumerateDevices().catch(() => []);
      if (!cancelled) {
        setCanSwitch(devices.filter((d) => d.kind === "videoinput").length > 1);
      }
    }

    void start();
    return () => {
      cancelled = true;
      stopStream(stream);
      if (video.srcObject === stream) video.srcObject = null;
    };
  }, [facing, session, useSystemCamera]);

  // Release the camera in the background; restart it when the Gast comes back.
  useEffect(() => {
    function onVisibilityChange() {
      if (document.visibilityState === "visible") {
        setSession((n) => n + 1);
      } else {
        const video = videoRef.current;
        stopStream(video?.srcObject instanceof MediaStream ? video.srcObject : null);
        // No live frames until the stream is restarted on return.
        setStatus((s) => (s.kind === "live" ? { kind: "starting" } : s));
      }
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, []);

  // Canvases for grabbing frames; freed when the camera goes away.
  useEffect(() => {
    const instance = new FrameGrabber({ maxLongSide, maxBytes });
    grabber.current = instance;
    return () => {
      instance.dispose();
      grabber.current = null;
    };
  }, [maxLongSide, maxBytes]);

  function shoot() {
    const video = videoRef.current;
    const frames = grabber.current;
    if (!video || !frames || disabled || status.kind !== "live") return;

    const jpeg = frames.grab(video);
    if (!jpeg) return;
    setFlashes((n) => n + 1);
    navigator.vibrate?.(40);
    setGrabberBusy(!frames.ready);
    jpeg
      .then((photo) => onCapture(photo, { prepared: true }))
      .catch(() => onCaptureFailed?.())
      .finally(() => setGrabberBusy(!frames.ready));
  }

  if (useSystemCamera) {
    return (
      <section className="flex flex-1 flex-col items-center justify-end gap-6 text-center">
        <p className="text-stone-400">
          Je ziet je foto&apos;s pas bij de onthulling. Geen preview, geen herkansing.
        </p>
        <SystemCamera {...props} />
      </section>
    );
  }

  const live = status.kind === "live";
  const problem = status.kind === "problem" ? status.problem : null;

  return (
    <>
      {problem && (
        <CameraHelp
          problem={problem}
          onRetry={() => setSession((n) => n + 1)}
          onUseSystemCamera={() => setUseSystemCamera(true)}
        />
      )}
      {/* The video stays mounted (hidden) so a retry can attach a new stream to it. */}
      <div
        hidden={problem !== null}
        className="relative flex-1 overflow-hidden rounded-3xl bg-black"
      >
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          disablePictureInPicture
          aria-label="Zoeker"
          className={`absolute inset-0 size-full object-cover ${facing === "user" ? "-scale-x-100" : ""}`}
        />
        {!live && (
          <p className="absolute inset-0 flex items-center justify-center text-stone-400">
            Camera starten…
          </p>
        )}
        {flashes > 0 && (
          <div
            key={flashes}
            aria-hidden
            className="pointer-events-none absolute inset-0 animate-shutter-flash bg-white"
          />
        )}
      </div>

      <div hidden={problem !== null} className="grid grid-cols-3 items-center">
        <span />
        <button
          type="button"
          onClick={shoot}
          disabled={disabled || !live || grabberBusy}
          aria-label="Neem een foto"
          className="mx-auto flex size-20 items-center justify-center rounded-full border-4 border-stone-200 bg-transparent p-1.5 transition active:scale-90 disabled:opacity-40"
        >
          <span className="size-full rounded-full bg-accent" />
        </button>
        {canSwitch ? (
          <button
            type="button"
            onClick={() => setFacing((f) => (f === "environment" ? "user" : "environment"))}
            disabled={!live}
            aria-label={facing === "environment" ? "Wissel naar de voorcamera" : "Wissel naar de achtercamera"}
            className="mx-auto flex size-12 items-center justify-center rounded-full bg-stone-800 text-stone-100 transition active:scale-90 disabled:opacity-40"
          >
            <SwitchIcon />
          </button>
        ) : (
          <span />
        )}
      </div>
    </>
  );
}

function isHidden(): boolean {
  return document.visibilityState === "hidden";
}

function stopStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop());
}

function problemOf(error: unknown): CameraProblem {
  const name = error instanceof Error || error instanceof DOMException ? error.name : "";
  switch (name) {
    case "NotAllowedError":
    case "SecurityError":
    case "PermissionDeniedError":
      return "denied";
    case "NotSupportedError":
    case "TypeError":
      return "unsupported";
    default:
      // NotFoundError, NotReadableError, OverconstrainedError, AbortError, ...
      return "unavailable";
  }
}

function SwitchIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-6"
      aria-hidden
    >
      <path d="M4 7h11a4 4 0 0 1 4 4v1" />
      <path d="m7 4-3 3 3 3" />
      <path d="M20 17H9a4 4 0 0 1-4-4v-1" />
      <path d="m17 20 3-3-3-3" />
    </svg>
  );
}
