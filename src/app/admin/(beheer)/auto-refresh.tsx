"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Re-fetches the page's server data periodically while it is visible ("live" stats). */
export function AutoRefresh({ everySeconds }: { everySeconds: number }) {
  const router = useRouter();
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, everySeconds * 1000);
    return () => clearInterval(timer);
  }, [router, everySeconds]);
  return null;
}
