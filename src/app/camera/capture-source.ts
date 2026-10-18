import type { ComponentType } from "react";

/**
 * Something that lets the Gast take a photo and hands over the bytes, without
 * ever showing them. Ticket 02 uses the system camera ({@link SystemCamera});
 * ticket 03 adds a live viewfinder with the same props.
 */
export interface CaptureSourceProps {
  /** Called once per photo taken. */
  onCapture(photo: Blob): void;
  disabled?: boolean;
}

export type CaptureSource = ComponentType<CaptureSourceProps>;
