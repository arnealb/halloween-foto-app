import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { parse, type Font, type PathCommand } from "opentype.js";
import sharp from "sharp";
import type { WatermarkPosition } from "./types";

/**
 * The Watermark: the Host's text and/or logo in one corner of a derived image.
 *
 * Text is NOT handed to librsvg as SVG `<text>`: that would depend on the
 * fonts fontconfig finds on the server (Vercel's Linux runtime has next to
 * none, so text would come out as empty boxes or not at all). Instead the
 * text is laid out with the font bundled in `assets/` (Geist SemiBold, SIL
 * OFL) and turned into SVG path outlines here. The SVG then contains only
 * numbers and a base64 logo: no host input ever reaches the XML as text, so
 * there is nothing to escape and nothing to inject, and the result is the
 * same on every machine.
 */

/** The watermark as it is drawn: the settings fields plus the logo bytes. */
export interface WatermarkSpec {
  text: string;
  /** Normalized logo PNG (see {@link normalizeWatermarkLogo}), or null. */
  logo: Uint8Array | null;
  position: WatermarkPosition;
  /** Width of the watermark relative to the photo width. */
  scale: number;
  opacity: number;
}

/** Path of the bundled font, relative to the project root (traced into the server bundle). */
export const WATERMARK_FONT_FILE = "src/party-camera/assets/Geist-SemiBold.ttf";

let font: Font | undefined;

function watermarkFont(): Font {
  if (!font) {
    const bytes = readFileSync(path.join(process.cwd(), WATERMARK_FONT_FILE));
    font = parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  }
  return font;
}

/**
 * The part of `text` the bundled font can draw: characters without a glyph
 * (emoji, rare scripts) are left out instead of showing as boxes.
 */
export function drawableText(text: string): string {
  const f = watermarkFont();
  return [...text]
    .filter((char) => char === " " || f.charToGlyphIndex(char) > 0)
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}

/** Text outlines at font size {@link UNIT}, cached per text (a party has one or two). */
const UNIT = 100;
const outlines = new Map<string, { d: string; x1: number; x2: number; top: number; bottom: number }>();

function textOutline(text: string) {
  let outline = outlines.get(text);
  if (!outline) {
    const f = watermarkFont();
    const glyphs = f.getPath(text, 0, 0, UNIT, { kerning: true });
    const box = glyphs.getBoundingBox();
    // A stable line box: from the top of a capital to the ink's bottom, so
    // "arne" and "ARNE" get the same size at the same scale.
    const capTop = f.getPath("H", 0, 0, UNIT).getBoundingBox().y1;
    outline = {
      d: pathData(glyphs.commands),
      x1: box.x1,
      x2: box.x2,
      top: Math.min(box.y1, capTop),
      bottom: Math.max(box.y2, 0),
    };
    if (outlines.size > 16) outlines.clear();
    outlines.set(text, outline);
  }
  return outline;
}

/**
 * SVG path data of glyph outlines. Written here rather than with opentype's
 * `toPathData`, which emits `NaN` for some coordinates in 2.0.0.
 */
function pathData(commands: PathCommand[]): string {
  const parts: string[] = [];
  for (const c of commands) {
    switch (c.type) {
      case "M":
      case "L":
        parts.push(`${c.type}${n(c.x)} ${n(c.y)}`);
        break;
      case "Q":
        parts.push(`Q${n(c.x1)} ${n(c.y1)} ${n(c.x)} ${n(c.y)}`);
        break;
      case "C":
        parts.push(`C${n(c.x1)} ${n(c.y1)} ${n(c.x2)} ${n(c.y2)} ${n(c.x)} ${n(c.y)}`);
        break;
      case "Z":
        parts.push("Z");
        break;
    }
  }
  return parts.join("");
}

export interface WatermarkOverlay {
  /** The whole watermark as one SVG, sized in pixels. */
  svg: Buffer;
  left: number;
  top: number;
}

/**
 * The watermark for an image of `width` x `height`: an SVG to composite at
 * (`left`, `top`), or null when there is nothing to draw. Layout: the logo
 * left of the text, together `scale` x the image width wide (never taller
 * than 40% of the image), in the chosen corner with a small margin. White
 * text with a soft dark outline and shadow (also around the logo), so it
 * reads on light and dark photos; the whole group at `opacity`.
 */
export async function watermarkOverlay(
  spec: WatermarkSpec,
  width: number,
  height: number,
): Promise<WatermarkOverlay | null> {
  const text = drawableText(spec.text);
  const logo = spec.logo ? await logoSize(spec.logo) : null;
  if (!text && !logo) return null;

  // Lay out in "units" (text at font size UNIT), then scale to pixels.
  const outline = text ? textOutline(text) : null;
  const textW = outline ? outline.x2 - outline.x1 : 0;
  const textH = outline ? outline.bottom - outline.top : 0;
  const logoH = logo ? (outline ? textH * 1.8 : UNIT) : 0;
  const logoW = logo ? Math.min(logoH * (logo.width / logo.height), logoH * 4) : 0;
  const gap = logo && outline ? textH * 0.35 : 0;
  const unitW = logoW + gap + textW;
  const unitH = Math.max(logoH, textH);

  const short = Math.min(width, height);
  const margin = Math.max(2, Math.round(short * 0.03));
  let k = (spec.scale * width) / unitW;
  k = Math.min(k, (height * 0.4) / unitH, (width - 2 * margin) / unitW, (height - 2 * margin) / unitH);
  if (!(k > 0)) return null;

  const boxW = unitW * k;
  const boxH = unitH * k;
  // Room around the ink for the outline and shadow.
  const pad = Math.max(1, Math.ceil(Math.max(outline ? textH * k * 0.25 : 0, boxH * 0.12)));
  const svgW = Math.min(width, Math.ceil(boxW + 2 * pad));
  const svgH = Math.min(height, Math.ceil(boxH + 2 * pad));

  const right = spec.position.endsWith("right");
  const bottom = spec.position.startsWith("bottom");
  const inkLeft = right ? width - margin - boxW : margin;
  const inkTop = bottom ? height - margin - boxH : margin;
  const left = clamp(Math.round(inkLeft - pad), 0, width - svgW);
  const top = clamp(Math.round(inkTop - pad), 0, height - svgH);
  // Ink origin inside the SVG.
  const ox = inkLeft - left;
  const oy = inkTop - top;

  const parts: string[] = [];
  if (logo && spec.logo) {
    const y = oy + ((unitH - logoH) / 2) * k;
    parts.push(
      `<image x="${n(ox)}" y="${n(y)}" width="${n(logoW * k)}" height="${n(logoH * k)}" ` +
        `preserveAspectRatio="xMidYMid meet" ` +
        `href="data:image/png;base64,${Buffer.from(spec.logo).toString("base64")}"/>`,
    );
  }
  if (outline) {
    const x = ox + (logoW + gap) * k - outline.x1 * k;
    const y = oy + ((unitH - textH) / 2) * k - outline.top * k;
    // Stroke width in units (it scales with the transform).
    parts.push(
      `<path transform="translate(${n(x)} ${n(y)}) scale(${n(k, 5)})" d="${outline.d}" ` +
        `fill="#ffffff" stroke="#000000" stroke-opacity="0.55" stroke-width="7" ` +
        `stroke-linejoin="round" paint-order="stroke"/>`,
    );
  }

  const blur = Math.max(0.5, boxH * 0.04);
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${svgW}" height="${svgH}" viewBox="0 0 ${svgW} ${svgH}">` +
    `<defs><filter id="s" x="-50%" y="-50%" width="200%" height="200%">` +
    `<feDropShadow dx="0" dy="${n(blur * 0.5)}" stdDeviation="${n(blur)}" flood-color="#000000" flood-opacity="0.5"/>` +
    `</filter></defs>` +
    `<g opacity="${n(spec.opacity, 3)}" filter="url(#s)">${parts.join("")}</g></svg>`;

  return { svg: Buffer.from(svg, "utf8"), left, top };
}

async function logoSize(logo: Uint8Array): Promise<{ width: number; height: number } | null> {
  const { width, height } = await sharp(logo).metadata();
  return width && height ? { width, height } : null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

/** A number for SVG: finite, few decimals. */
function n(value: number, decimals = 2): string {
  return Number.isFinite(value) ? String(Number(value.toFixed(decimals))) : "0";
}

// ---------------------------------------------------------------------------
// Logo upload
// ---------------------------------------------------------------------------

/** Largest logo upload accepted. */
export const MAX_LOGO_BYTES = 2 * 1024 * 1024;
/** Largest logo dimensions accepted (each side), before it is scaled down. */
export const MAX_LOGO_INPUT_SIDE = 5000;
/** Long side a logo is stored at: plenty for a corner of a 1600px image. */
export const LOGO_LONG_SIDE = 800;

const LOGO_FORMATS = new Set(["png", "webp"]);

export type LogoProblem = string;

/**
 * Validate an uploaded logo and normalize it once: a real, single-frame PNG or
 * WebP of at most {@link MAX_LOGO_BYTES} and {@link MAX_LOGO_INPUT_SIDE} px a
 * side, scaled to fit {@link LOGO_LONG_SIDE}, stored as PNG with alpha and no
 * metadata. Returns the bytes and their content-addressed blob key
 * (`watermark/<hash>.png`), or a Dutch problem.
 */
export async function normalizeWatermarkLogo(
  input: Uint8Array,
): Promise<{ ok: true; bytes: Uint8Array; key: string } | { ok: false; problem: LogoProblem }> {
  if (!(input instanceof Uint8Array) || input.byteLength === 0) {
    return { ok: false, problem: "Het logo is leeg." };
  }
  if (input.byteLength > MAX_LOGO_BYTES) {
    return { ok: false, problem: "Het logo mag maximaal 2 MB groot zijn." };
  }
  try {
    const options = { limitInputPixels: MAX_LOGO_INPUT_SIDE * MAX_LOGO_INPUT_SIDE, failOn: "error" } as const;
    const meta = await sharp(input, options).metadata();
    if (!meta.format || !LOGO_FORMATS.has(meta.format) || (meta.pages ?? 1) > 1) {
      return { ok: false, problem: "Kies een PNG- of WebP-afbeelding als logo." };
    }
    if (!meta.width || !meta.height || meta.width > MAX_LOGO_INPUT_SIDE || meta.height > MAX_LOGO_INPUT_SIDE) {
      return {
        ok: false,
        problem: `Het logo mag maximaal ${MAX_LOGO_INPUT_SIDE} × ${MAX_LOGO_INPUT_SIDE} pixels zijn.`,
      };
    }
    const data = await sharp(input, options)
      .autoOrient()
      .resize({ width: LOGO_LONG_SIDE, height: LOGO_LONG_SIDE, fit: "inside", withoutEnlargement: true })
      .ensureAlpha()
      .png({ compressionLevel: 9 })
      .toBuffer();
    const bytes = new Uint8Array(data);
    const hash = createHash("sha256").update(bytes).digest("hex").slice(0, 32);
    return { ok: true, bytes, key: `watermark/${hash}.png` };
  } catch {
    return { ok: false, problem: "Dit logo kon niet gelezen worden. Kies een PNG- of WebP-afbeelding." };
  }
}
