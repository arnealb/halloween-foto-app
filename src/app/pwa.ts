/**
 * Pure helpers for "op het beginscherm zetten" (the PWA): the manifest's
 * short name, the icon colors and which beginscherm-hint a browser gets.
 * No browser or server APIs here, so all of it is unit-tested.
 */

/** The app background (globals.css `--background`), also the splash screen color. */
export const APP_BACKGROUND = "#0c0a09";

/**
 * Longest short name. Home screens cut labels at roughly 12 characters
 * (Android launchers, iOS), so a longer name would show up as "Verjaardag…".
 */
export const MAX_SHORT_NAME_LENGTH = 12;

/**
 * The home-screen label for a party title: the whole title if it fits,
 * otherwise as many whole words as fit, otherwise the first word cut off.
 * Counts code points, so an emoji is never split in half.
 */
export function shortName(title: string, max = MAX_SHORT_NAME_LENGTH): string {
  const clean = title.replace(/\s+/g, " ").trim();
  if (clean.length === 0) return "Camera";
  if ([...clean].length <= max) return clean;

  let fitted = "";
  for (const word of clean.split(" ")) {
    const next = fitted ? `${fitted} ${word}` : word;
    if ([...next].length > max) break;
    fitted = next;
  }
  // Don't end on a dangling separator such as "Arne's –".
  fitted = fitted.replace(/[\s\-–—:,&+|/]+$/u, "");
  if (fitted) return fitted;
  return [...clean].slice(0, max).join("");
}

/**
 * Ink that reads well on a `#rrggbb` background: the dark app background on
 * light colors, white on dark ones (by WCAG relative luminance).
 */
export function inkOn(hex: string): string {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!match) return "#ffffff";
  const [r, g, b] = match.slice(1).map((part) => {
    const c = parseInt(part, 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  // Contrast with white vs. with near-black (luminance ~0.003): pick the larger.
  const withWhite = 1.05 / (luminance + 0.05);
  const withDark = (luminance + 0.05) / 0.053;
  return withDark >= withWhite ? APP_BACKGROUND : "#ffffff";
}

/**
 * Which beginscherm-instructions a browser gets:
 * - `ios-safari`: Deel-knop › Zet op beginscherm.
 * - `ios-other`: Chrome/Firefox/Edge on iOS; they can add to the home screen
 *   via their own share menu (iOS 16.4+), otherwise Safari.
 * - `android`: Chrome & co; a real install button when the browser offers one.
 * - `in-app`: the browser inside Instagram, Facebook, TikTok, ... where adding
 *   to the home screen is impossible: open the link in Safari/Chrome.
 * - `other`: desktops and the rest; no hint.
 */
export type InstallPlatform = "ios-safari" | "ios-other" | "android" | "in-app" | "other";

/** Browsers embedded in social apps (their UA carries the app's name). */
const IN_APP_RE =
  /Instagram|FBAN|FBAV|FB_IAB|FBIOS|FB4A|Messenger|WhatsApp|Snapchat|musical_ly|BytedanceWebview|TikTok|Line\/|LinkedInApp|Twitter|Pinterest|GSA\//;

export function detectInstallPlatform(userAgent: string, maxTouchPoints = 0): InstallPlatform {
  const ios =
    /iPhone|iPad|iPod/.test(userAgent) ||
    // iPadOS reports itself as a Mac, but has a touch screen.
    (/Macintosh/.test(userAgent) && maxTouchPoints > 1);
  const android = /Android/.test(userAgent);
  if (!ios && !android) return "other";

  if (IN_APP_RE.test(userAgent)) return "in-app";
  if (android) {
    // An Android WebView inside some app: "; wv)" in the UA.
    return /;\s*wv\)/.test(userAgent) ? "in-app" : "android";
  }
  if (/CriOS|FxiOS|EdgiOS|OPiOS|OPT\/|YaBrowser|DuckDuckGo/.test(userAgent)) return "ios-other";
  // A WKWebView inside an app has no "Safari/" token; real Safari has.
  return /Safari\//.test(userAgent) ? "ios-safari" : "in-app";
}

/** Whether the beginscherm-hint shows at all. */
export function showInstallHint(options: {
  platform: InstallPlatform;
  /** Already running from the home screen (display-mode standalone / navigator.standalone). */
  standalone: boolean;
  /** The Gast closed the hint before. */
  dismissed: boolean;
}): boolean {
  return !options.standalone && !options.dismissed && options.platform !== "other";
}
