/** Text colours on the printed QR cards, chosen for contrast with the accent. */

/** The dark ink of the cards (also their body text colour). */
export const CARD_DARK_INK = "#1c1917";
const PAPER = "#ffffff";

/** WCAG minimum for normal text; the shot count (12–17pt) is not reliably "large". */
const MIN_TEXT_CONTRAST = 4.5;

export type CardColors = {
  /** Text on the accent-coloured title band: dark ink or white, whichever reads better. */
  titleInk: string;
  /** The shot count on white paper: the accent if it is readable, else dark ink. */
  shotsInk: string;
};

/** Colours for an accent of the form `#rrggbb` (as the settings guarantee). */
export function cardColors(accent: string): CardColors {
  const onAccent = (ink: string) => contrastRatio(accent, ink);
  return {
    titleInk: onAccent(CARD_DARK_INK) >= onAccent(PAPER) ? CARD_DARK_INK : PAPER,
    shotsInk: contrastRatio(accent, PAPER) >= MIN_TEXT_CONTRAST ? accent : CARD_DARK_INK,
  };
}

/** WCAG contrast ratio of two `#rrggbb` colours (1 to 21). */
export function contrastRatio(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

/** Relative luminance of a `#rrggbb` colour (WCAG). */
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
