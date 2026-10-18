import type { ComponentType } from "react";

/**
 * Something that lets the Gast take a photo and hands over the bytes, without
 * ever showing them: the live viewfinder ({@link LiveCamera}, the default) or
 * the phone's own camera app ({@link SystemCamera}, the fallback).
 */
export interface CaptureSourceProps {
  /**
   * Called once per photo taken. A `prepared` photo is already a JPEG within
   * `maxLongSide` / `maxBytes`; any other photo is compressed by the camera.
   */
  onCapture(photo: Blob, options?: { prepared?: boolean }): void;
  /** Called when a photo was taken but could not be turned into a JPEG. */
  onCaptureFailed?(): void;
  disabled?: boolean;
  /** Longest side of a photo the source encodes itself. */
  maxLongSide: number;
  /** Largest photo the server accepts. */
  maxBytes: number;
}

export type CaptureSource = ComponentType<CaptureSourceProps>;
