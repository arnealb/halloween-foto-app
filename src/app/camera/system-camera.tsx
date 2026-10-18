"use client";

import { useRef, type ChangeEvent } from "react";
import type { CaptureSourceProps } from "./capture-source";

/**
 * Capture source: the phone's own camera app, through a file input with
 * `capture="environment"`. The chosen file is handed over and the input is
 * cleared right away; nothing is ever shown. Photos taken this way do not end
 * up in the phone's camera roll.
 */
export function SystemCamera({ onCapture, disabled }: CaptureSourceProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    // Clear the input so the file does not linger (and the same photo can't be
    // re-submitted by accident).
    input.value = "";
    if (file) onCapture(file);
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <input
        ref={inputRef}
        id="shutter-input"
        type="file"
        accept="image/*"
        capture="environment"
        disabled={disabled}
        onChange={handleChange}
        className="sr-only"
        tabIndex={-1}
      />
      <button
        type="button"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        aria-label="Neem een foto met de camera-app"
        className="flex size-24 items-center justify-center rounded-full border-4 border-stone-200 bg-transparent p-1.5 transition active:scale-95 disabled:opacity-40"
      >
        <span className="size-full rounded-full bg-accent" />
      </button>
      <span className="text-sm text-stone-400">Tik om je camera te openen</span>
    </div>
  );
}
