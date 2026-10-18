import sharp from "sharp";
import { describe, expect, it } from "vitest";
import {
  joinQrPng,
  joinQrSvg,
  joinQrSymbol,
  qrFileName,
  QR_PNG_WIDTH,
  resolveJoinUrl,
} from "./join-qr";

describe("resolveJoinUrl", () => {
  it("accepts an https URL and points at the join page", () => {
    expect(resolveJoinUrl("https://feest.example.com")).toEqual({
      ok: true,
      baseUrl: "https://feest.example.com",
      joinUrl: "https://feest.example.com/",
      warnings: [],
    });
  });

  it("normalizes: trims, strips trailing slashes, lowercases the host", () => {
    const result = resolveJoinUrl("  HTTPS://Feest.Example.com/// \n");
    expect(result).toMatchObject({ ok: true, baseUrl: "https://feest.example.com", joinUrl: "https://feest.example.com/" });
  });

  it("drops a path (the app lives at the root) with a warning, and the default port", () => {
    expect(resolveJoinUrl("https://example.com:443/admin/qr/")).toEqual({
      ok: true,
      baseUrl: "https://example.com",
      joinUrl: "https://example.com/",
      warnings: ["path-ignored"],
    });
    expect(resolveJoinUrl("https://example.com:8443")).toMatchObject({
      ok: true,
      joinUrl: "https://example.com:8443/",
    });
  });

  it.each([undefined, "", "   "])("reports a missing URL (%j)", (value) => {
    expect(resolveJoinUrl(value)).toEqual({ ok: false, problem: "missing" });
  });

  it.each([
    "feest.example.com",
    "/feest",
    "ftp://feest.example.com",
    "javascript:alert(1)",
    "https:feest.example.com",
    "https://user:pw@feest.example.com",
    "https://feest.example.com/?bron=qr",
    "https://feest.example.com/#x",
    "https://",
  ])("rejects %j", (value) => {
    expect(resolveJoinUrl(value)).toEqual({ ok: false, problem: "invalid" });
  });

  it("warns about plain http", () => {
    expect(resolveJoinUrl("http://feest.example.com")).toMatchObject({
      ok: true,
      joinUrl: "http://feest.example.com/",
      warnings: ["not-https"],
    });
  });

  it("warns about localhost on http (both problems)", () => {
    expect(resolveJoinUrl("http://localhost:3000")).toMatchObject({
      ok: true,
      joinUrl: "http://localhost:3000/",
      warnings: ["not-https", "local"],
    });
  });

  it.each([
    "https://localhost",
    "https://app.localhost",
    "https://127.0.0.1:3000",
    "https://127.1.2.3",
    "https://0.0.0.0",
    "https://10.0.0.5",
    "https://192.168.1.20:3000",
    "https://172.16.0.1",
    "https://172.31.255.255",
    "https://169.254.1.1",
    "https://mijn-mac.local",
    "https://nas.lan",
    "https://feest.internal",
    "https://router.home.arpa",
    "https://[::1]:3000",
    "https://[fe80::1]",
    "https://[fd12:3456::1]",
  ])("warns that %s is not reachable from guests' phones", (value) => {
    expect(resolveJoinUrl(value)).toMatchObject({ ok: true, warnings: ["local"] });
  });

  it.each(["https://172.15.0.1", "https://172.32.0.1", "https://8.8.8.8", "https://192.169.1.1", "https://localhost.example.com", "https://lan.example.com"])(
    "does not flag the public host %s",
    (value) => {
      expect(resolveJoinUrl(value)).toMatchObject({ ok: true, warnings: [] });
    },
  );
});

describe("join QR code", () => {
  const url = "https://feest.example.com/";

  it("encodes exactly the join URL, with error correction Q", () => {
    const symbol = joinQrSymbol(url);
    const encoded = symbol.segments
      .map((segment) =>
        typeof segment.data === "string" ? segment.data : Buffer.from(segment.data).toString("utf8"),
      )
      .join("");
    expect(encoded).toBe(url);
    expect(symbol.errorCorrectionLevel.bit).toBe(3); // Q
  });

  it("renders an SVG with a 4-module quiet zone", async () => {
    const svg = await joinQrSvg(url);
    const size = joinQrSymbol(url).modules.size;
    expect(svg).toMatch(/^<svg xmlns="http:\/\/www.w3.org\/2000\/svg"/);
    expect(svg).toContain(`viewBox="0 0 ${size + 8} ${size + 8}"`);
    expect(svg).toContain('fill="#ffffff"');
    expect(svg).toContain('stroke="#000000"');
  });

  it("renders a square PNG of the requested width", async () => {
    const png = await joinQrPng(url);
    expect(png.subarray(1, 4).toString("ascii")).toBe("PNG");
    const meta = await sharp(png).metadata();
    expect(meta.format).toBe("png");
    expect(meta.width).toBe(QR_PNG_WIDTH);
    expect(meta.height).toBe(QR_PNG_WIDTH);

    // The quiet zone is white, the finder pattern's corner black.
    const { data, info } = await sharp(png).greyscale().raw().toBuffer({ resolveWithObject: true });
    const modulePx = info.width / (joinQrSymbol(url).modules.size + 8);
    const at = (moduleX: number, moduleY: number) =>
      data[Math.floor((moduleY + 0.5) * modulePx) * info.width + Math.floor((moduleX + 0.5) * modulePx)];
    expect(at(1, 1)).toBe(255);
    expect(at(4, 4)).toBe(0);
  });
});

describe("qrFileName", () => {
  it("slugs the party title", () => {
    expect(qrFileName("Arne wordt 25!", "png")).toBe("qr-arne-wordt-25.png");
    expect(qrFileName("Café Élan", "svg")).toBe("qr-cafe-elan.svg");
  });

  it("falls back when nothing is left", () => {
    expect(qrFileName("🎉🎉", "png")).toBe("qr-party-camera.png");
  });
});
