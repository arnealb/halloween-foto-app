import { describe, expect, it } from "vitest";
import { CARD_DARK_INK, cardColors, contrastRatio } from "./card-colors";

describe("contrastRatio", () => {
  it("follows WCAG: black on white is 21, a colour on itself is 1", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21);
    expect(contrastRatio("#ffffff", "#000000")).toBeCloseTo(21);
    expect(contrastRatio("#f97316", "#f97316")).toBe(1);
  });
});

describe("cardColors", () => {
  it("puts dark ink on a light accent and white on a dark one", () => {
    expect(cardColors("#fde047").titleInk).toBe(CARD_DARK_INK);
    expect(cardColors("#1e3a8a").titleInk).toBe("#ffffff");
  });

  it("picks the title ink against the real dark ink, not pure black", () => {
    // #7a7a7a: white 4.29, #1c1917 4.07, but pure black would be 4.89.
    expect(cardColors("#7a7a7a").titleInk).toBe("#ffffff");
  });

  it("keeps the accent for the shot count only at 4.5:1 on white", () => {
    expect(cardColors("#1e3a8a").shotsInk).toBe("#1e3a8a");
    // The default orange is about 2.8:1 on white: too light for 12–17pt text.
    expect(cardColors("#f97316").shotsInk).toBe(CARD_DARK_INK);
    // #767676 is the classic 4.54:1 grey; #777777 falls just below 4.5.
    expect(cardColors("#767676").shotsInk).toBe("#767676");
    expect(cardColors("#777777").shotsInk).toBe(CARD_DARK_INK);
  });

  it("every choice reaches the threshold or is the better of the two", () => {
    for (const accent of ["#000000", "#ffffff", "#ff0000", "#00ff00", "#0000ff", "#808080"]) {
      const { titleInk, shotsInk } = cardColors(accent);
      const other = titleInk === CARD_DARK_INK ? "#ffffff" : CARD_DARK_INK;
      expect(contrastRatio(accent, titleInk)).toBeGreaterThanOrEqual(contrastRatio(accent, other));
      expect(contrastRatio(shotsInk, "#ffffff")).toBeGreaterThanOrEqual(4.5);
    }
  });
});
