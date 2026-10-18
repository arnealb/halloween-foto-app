import { describe, expect, it } from "vitest";
import { APP_BACKGROUND, detectInstallPlatform, inkOn, shortName, showInstallHint } from "./pwa";

const UA = {
  iphoneSafari:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1",
  iphoneChrome:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/138.0.7204.156 Mobile/15E148 Safari/604.1",
  iphoneInstagram:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/22F76 Instagram 388.0.0.27.79 (iPhone15,2; iOS 18_5; nl_NL; nl; scale=3.00; 1179x2556; 750153484)",
  iphoneFacebook:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/22F76 [FBAN/FBIOS;FBAV/520.0.0.38.101;FBBV/1;FBDV/iPhone15,2;FBMD/iPhone;FBSN/iOS;FBSV/18.5;FBSS/3;FBLC/nl_NL]",
  iphoneWebView:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
  ipadAsMac:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15",
  androidChrome:
    "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Mobile Safari/537.36",
  androidWebView:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/AP2A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/138.0.0.0 Mobile Safari/537.36",
  androidInstagram:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/AP2A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/138.0.0.0 Mobile Safari/537.36 Instagram 388.0.0.27.79 Android",
  desktopChrome:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36",
};

describe("shortName (home-screen label)", () => {
  it("keeps a title that fits", () => {
    expect(shortName("Party Camera")).toBe("Party Camera");
    expect(shortName("  Arne   30 ")).toBe("Arne 30");
  });

  it("cuts a long title at a whole word", () => {
    expect(shortName("Arne wordt 30: het feest")).toBe("Arne wordt");
    expect(shortName("Halloween - de grote party")).toBe("Halloween");
  });

  it("cuts a single long word to the limit", () => {
    expect(shortName("Verjaardagsfeestje")).toBe("Verjaardagsf");
  });

  it("never splits an emoji", () => {
    const name = shortName("🎃🎃🎃🎃🎃🎃🎃🎃🎃🎃🎃🎃🎃🎃");
    expect([...name]).toHaveLength(12);
    expect(name).toBe("🎃".repeat(12));
  });

  it("falls back for an empty title", () => {
    expect(shortName("   ")).toBe("Camera");
  });
});

describe("inkOn (icon glyph color)", () => {
  it("draws dark on light accents and white on dark ones", () => {
    expect(inkOn("#f97316")).toBe(APP_BACKGROUND); // orange
    expect(inkOn("#fde047")).toBe(APP_BACKGROUND); // yellow
    expect(inkOn("#1e3a8a")).toBe("#ffffff"); // dark blue
    expect(inkOn("#000000")).toBe("#ffffff");
  });
});

describe("detectInstallPlatform", () => {
  it("recognizes Safari on iPhone and iPad", () => {
    expect(detectInstallPlatform(UA.iphoneSafari)).toBe("ios-safari");
    expect(detectInstallPlatform(UA.ipadAsMac, 5)).toBe("ios-safari");
  });

  it("treats a Mac without touch screen as other", () => {
    expect(detectInstallPlatform(UA.ipadAsMac, 0)).toBe("other");
    expect(detectInstallPlatform(UA.desktopChrome)).toBe("other");
  });

  it("recognizes other browsers on iOS", () => {
    expect(detectInstallPlatform(UA.iphoneChrome)).toBe("ios-other");
  });

  it("recognizes Chrome on Android", () => {
    expect(detectInstallPlatform(UA.androidChrome)).toBe("android");
  });

  it("recognizes in-app browsers and web views", () => {
    expect(detectInstallPlatform(UA.iphoneInstagram)).toBe("in-app");
    expect(detectInstallPlatform(UA.iphoneFacebook)).toBe("in-app");
    expect(detectInstallPlatform(UA.iphoneWebView)).toBe("in-app");
    expect(detectInstallPlatform(UA.androidWebView)).toBe("in-app");
    expect(detectInstallPlatform(UA.androidInstagram)).toBe("in-app");
  });
});

describe("showInstallHint", () => {
  it("shows on phones that are not standalone yet", () => {
    expect(showInstallHint({ platform: "ios-safari", standalone: false, dismissed: false })).toBe(true);
    expect(showInstallHint({ platform: "in-app", standalone: false, dismissed: false })).toBe(true);
  });

  it("hides when standalone, dismissed or on a desktop", () => {
    expect(showInstallHint({ platform: "android", standalone: true, dismissed: false })).toBe(false);
    expect(showInstallHint({ platform: "android", standalone: false, dismissed: true })).toBe(false);
    expect(showInstallHint({ platform: "other", standalone: false, dismissed: false })).toBe(false);
  });
});
