import "server-only";

import sharp from "sharp";
import { DEFAULT_EVENT_SETTINGS } from "@/party-camera";
import { inkOn } from "@/app/pwa";

/**
 * The app icons, drawn on request in the party's accent color: a simple
 * camera glyph on an accent background, so the icon changes along with the
 * accent color (no build step, no stored files).
 */
export const APP_ICONS = {
  /** Manifest icon, purpose "any": a rounded square with transparent corners. */
  "icon-192.png": { size: 192, shape: "rounded" },
  "icon-512.png": { size: 512, shape: "rounded" },
  /**
   * Manifest icon, purpose "maskable": full bleed; the launcher cuts it to its
   * own shape, so the glyph stays inside the central safe zone (a circle of
   * 80% of the size).
   */
  "maskable-512.png": { size: 512, shape: "maskable" },
  /** apple-touch-icon: full bleed and opaque (iOS rounds the corners itself). */
  "apple-touch-icon.png": { size: 180, shape: "square" },
} as const;

export type AppIconName = keyof typeof APP_ICONS;

export function isAppIconName(name: string): name is AppIconName {
  return Object.hasOwn(APP_ICONS, name);
}

/** A PNG of the named icon in the given accent color (`#rrggbb`). */
export function renderAppIcon(name: AppIconName, accentColor: string): Promise<Buffer> {
  const { size, shape } = APP_ICONS[name];
  // The color goes into SVG markup: only ever a plain #rrggbb.
  const accent = /^#[0-9a-f]{6}$/i.test(accentColor)
    ? accentColor
    : DEFAULT_EVENT_SETTINGS.accentColor;
  const image = sharp(Buffer.from(iconSvg(size, shape, accent)));
  // Only the rounded icon has transparent corners; the others must be opaque.
  return (shape === "rounded" ? image : image.removeAlpha()).png().toBuffer();
}

function iconSvg(size: number, shape: "rounded" | "maskable" | "square", accent: string): string {
  const ink = inkOn(accent);
  // Width of the glyph relative to the icon: smaller on maskable icons, whose
  // safe zone is a circle of 40% radius (the glyph's corners must fit in it).
  const glyphWidth = shape === "maskable" ? 0.56 : 0.66;
  const background =
    shape === "rounded"
      ? `<rect width="100" height="100" rx="22" fill="${accent}"/>`
      : `<rect width="100" height="100" fill="${accent}"/>`;
  // The glyph is drawn in a 100x100 box centered on (50, 50) and scaled.
  const scale = glyphWidth;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100">
  ${background}
  <g transform="translate(50 50) scale(${scale}) translate(-50 -50)">
    <path fill="${ink}" fill-rule="evenodd" d="M36 18h28l6 10h16a8 8 0 0 1 8 8v42a8 8 0 0 1-8 8H14a8 8 0 0 1-8-8V36a8 8 0 0 1 8-8h16z M50 39a17 17 0 1 0 0.01 0z M50 47a9 9 0 1 1-0.01 0z"/>
    <circle cx="80" cy="39" r="4" fill="${accent}"/>
  </g>
</svg>`;
}
