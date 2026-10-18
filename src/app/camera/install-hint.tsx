"use client";

import { useState, useSyncExternalStore } from "react";
import { detectInstallPlatform, showInstallHint, type InstallPlatform } from "../pwa";

/** Chrome's install prompt event (not in the DOM typings). */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISSED_KEY = "party-camera:install-hint-dismissed";

// --- Small external stores, read with useSyncExternalStore (null on the server). ---

const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());
function subscribeLocal(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Chrome fires `beforeinstallprompt` once, possibly before the camera mounts,
 * so it is caught as soon as this module loads and kept for the button.
 */
let installPrompt: BeforeInstallPromptEvent | null = null;
let installed = false;
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault(); // we show our own button instead of the mini-infobar
    installPrompt = event as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    installPrompt = null;
    installed = true;
    notify();
  });
}

function readDismissed(): boolean {
  try {
    return window.localStorage.getItem(DISMISSED_KEY) === "1";
  } catch {
    return false; // private mode / blocked storage: just show the hint
  }
}

let dismissedNow = false;
function dismiss() {
  dismissedNow = true;
  try {
    window.localStorage.setItem(DISMISSED_KEY, "1");
  } catch {
    // Not remembered across visits; hidden for this visit anyway.
  }
  notify();
}

const STANDALONE_QUERY = "(display-mode: standalone), (display-mode: fullscreen)";

function isStandalone(): boolean {
  return (
    window.matchMedia(STANDALONE_QUERY).matches ||
    // iOS Safari's own flag for home-screen apps.
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function subscribeStandalone(listener: () => void) {
  const query = window.matchMedia(STANDALONE_QUERY);
  query.addEventListener("change", listener);
  return () => query.removeEventListener("change", listener);
}

/** Whether this page runs from the home screen; null on the server (unknown yet). */
export function useStandalone(): boolean | null {
  return useSyncExternalStore(subscribeStandalone, isStandalone, () => null);
}

/** The platform for the hint; null on the server. */
export function useInstallPlatform(): InstallPlatform | null {
  return useSyncExternalStore(
    noopSubscribe,
    () => detectInstallPlatform(navigator.userAgent, navigator.maxTouchPoints),
    () => null,
  );
}
const noopSubscribe = () => () => {};

/**
 * "Zet me op je beginscherm": one quiet line above the viewfinder that opens
 * into platform-specific steps. Never on top of the viewfinder or shutter;
 * gone when the app already runs from the home screen, after installing, or
 * once the Gast closes it (remembered in localStorage).
 */
export function InstallHint() {
  const platform = useInstallPlatform();
  const standalone = useStandalone();
  const dismissed = useSyncExternalStore(
    subscribeLocal,
    () => dismissedNow || installed || readDismissed(),
    () => true,
  );
  const prompt = useSyncExternalStore(
    subscribeLocal,
    () => installPrompt,
    () => null,
  );
  const [open, setOpen] = useState(false);

  if (platform === null || standalone === null) return null;
  if (!showInstallHint({ platform, standalone, dismissed })) return null;

  async function install() {
    const event = prompt;
    if (!event) return;
    installPrompt = null; // a prompt event can be used only once
    notify();
    await event.prompt();
    const { outcome } = await event.userChoice;
    if (outcome === "accepted") dismiss();
  }

  const inApp = platform === "in-app";
  const label = inApp ? "Open de camera in je browser" : "Zet de camera op je beginscherm";

  return (
    <aside
      aria-label="Op je beginscherm zetten"
      className="rounded-2xl bg-stone-900/80 text-sm text-stone-300"
    >
      <div className="flex items-center gap-2 pl-3">
        <HomeIcon />
        {platform === "android" && prompt ? (
          <>
            <span className="min-w-0 flex-1 py-2">{label}</span>
            <button
              type="button"
              onClick={install}
              className="shrink-0 rounded-full bg-accent px-3 py-1 font-semibold text-stone-950 transition active:scale-95"
            >
              Installeren
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className="min-w-0 flex-1 py-2 text-left"
          >
            {label} <span className="text-accent underline underline-offset-2">{open ? "Minder" : "Hoe?"}</span>
          </button>
        )}
        <button
          type="button"
          onClick={dismiss}
          aria-label="Verberg deze tip"
          className="flex size-9 shrink-0 items-center justify-center rounded-full text-stone-500 transition active:scale-90"
        >
          <CloseIcon />
        </button>
      </div>
      {open && (
        // Capped and scrollable, so the viewfinder below keeps most of its room.
        <div className="max-h-[30dvh] overflow-y-auto overscroll-contain px-3 pb-3">
          <Steps platform={platform} />
        </div>
      )}
    </aside>
  );
}

function Steps({ platform }: { platform: InstallPlatform }) {
  switch (platform) {
    case "ios-safari":
      return (
        <>
          <ol className="flex list-decimal flex-col gap-1 pl-5">
            <li>
              Tik op de Deel-knop <ShareIcon /> (onderaan, of na een tik op <b>⋯</b>).
            </li>
            <li>
              Kies <b>Zet op beginscherm</b> en tik op <b>Voeg toe</b>.
            </li>
            <li>Open de camera voortaan met het icoon op je beginscherm.</li>
          </ol>
          <SessionNote />
        </>
      );
    case "ios-other":
      return (
        <>
          <ol className="flex list-decimal flex-col gap-1 pl-5">
            <li>
              Tik op de Deel-knop <ShareIcon /> van je browser en kies <b>Zet op beginscherm</b>.
            </li>
            <li>Staat die er niet bij? Open deze pagina dan in Safari en doe het daar.</li>
          </ol>
          <SessionNote />
        </>
      );
    case "android":
      return (
        <ol className="flex list-decimal flex-col gap-1 pl-5">
          <li>
            Tik in Chrome rechtsboven op <b>⋮</b>.
          </li>
          <li>
            Kies <b>Toevoegen aan startscherm</b> (of <b>App installeren</b>) en bevestig.
          </li>
          <li>Open de camera voortaan met het icoon op je startscherm.</li>
        </ol>
      );
    case "in-app":
      return (
        <p>
          Je bekijkt deze pagina in de browser van een andere app (zoals Instagram of
          WhatsApp). Daarin kun je hem niet op je beginscherm zetten. Tik op <b>⋯</b> of{" "}
          <b>⋮</b> en kies <b>Open in browser</b> (Safari of Chrome). Je meldt je daar opnieuw
          aan, dus doe dat liefst voor je eerste foto.
        </p>
      );
    case "other":
      return null;
  }
}

/**
 * iPhone keeps a home-screen app's cookies apart from Safari's. Recent iOS
 * versions copy them when you add the app; older ones don't, and then the app
 * asks for your name again.
 */
function SessionNote() {
  return (
    <p className="mt-2 text-xs text-stone-500">
      Vraagt de app je naam opnieuw? Dat kan op sommige iPhones: de beginscherm-app deelt
      je aanmelding dan niet met Safari. Zet hem daarom liefst op je beginscherm voor je
      begint met fotograferen.
    </p>
  );
}

function HomeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-4 shrink-0 text-accent" aria-hidden>
      <rect x="5" y="2" width="14" height="20" rx="3" />
      <path d="M12 8v6M9 11h6" />
    </svg>
  );
}

function ShareIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="inline size-4 align-[-2px]" aria-label="(vierkantje met pijl omhoog)">
      <path d="M12 3v12M8 7l4-4 4 4" />
      <path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="size-4" aria-hidden>
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}
