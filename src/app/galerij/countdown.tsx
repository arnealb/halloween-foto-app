"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/** While the Galerij is closed, look again this often (the Host may open it early). */
const RECHECK_EVERY_MS = 60_000;
/** Once the countdown hits zero, ask this often until the server agrees (clocks differ a bit). */
const AT_ZERO_RECHECK_MS = 3_000;

/**
 * Time left until the Reveal, ticking every second. From zero on the page asks
 * the server again every few seconds (and every minute before that); the
 * server decides. Once it opens, this component is gone and so is the timer.
 */
export function Countdown({ revealAt }: { revealAt: string }) {
  const router = useRouter();
  // Unknown until mounted, so server and client render the same.
  const [left, setLeft] = useState<number | null>(null);

  useEffect(() => {
    const target = Date.parse(revealAt);
    let lastRefresh = 0;
    const tick = () => {
      const ms = target - Date.now();
      setLeft(Math.max(0, ms));
      if (ms <= 0 && Date.now() - lastRefresh >= AT_ZERO_RECHECK_MS) {
        lastRefresh = Date.now();
        router.refresh();
      }
    };
    const first = setTimeout(tick, 0);
    const timer = setInterval(tick, 1000);
    const recheck = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, RECHECK_EVERY_MS);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
      clearInterval(recheck);
    };
  }, [revealAt, router]);

  const parts = split(left ?? 0);
  return (
    <div
      role="timer"
      aria-label="Tijd tot de onthulling"
      className={`grid grid-cols-4 gap-2 ${left === null ? "invisible" : ""}`}
    >
      {parts.map(([value, label]) => (
        <div key={label} className="flex flex-col items-center rounded-2xl bg-stone-900 px-3 py-3">
          <span className="font-mono text-3xl font-bold tabular-nums">
            {String(value).padStart(2, "0")}
          </span>
          <span className="text-xs text-stone-400">{label}</span>
        </div>
      ))}
    </div>
  );
}

function split(ms: number): [number, string][] {
  const seconds = Math.floor(ms / 1000);
  const days = Math.floor(seconds / 86_400);
  return [
    [days, days === 1 ? "dag" : "dagen"],
    [Math.floor((seconds % 86_400) / 3600), "uur"],
    [Math.floor((seconds % 3600) / 60), "min"],
    [seconds % 60, "sec"],
  ];
}

/** Without a date: just look again now and then, in case the Host opens the Galerij. */
export function Recheck() {
  const router = useRouter();
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, RECHECK_EVERY_MS);
    return () => clearInterval(timer);
  }, [router]);
  return null;
}
