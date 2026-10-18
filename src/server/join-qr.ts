/**
 * The QR code on the tables: it points to the join page (`/`) at the public
 * base URL (env `PUBLIC_BASE_URL`), never at whatever host served the admin.
 *
 * Pure (no env, no Next.js) so it can be unit tested; `server-only` is left
 * out for the same reason, but nothing here belongs in client code.
 */
import QRCode, { type QRCodeOptions } from "qrcode";

/** Why printed codes would not work at the party. */
export type JoinUrlWarning = "not-https" | "local" | "path-ignored";

/** Warnings that make printed codes useless; `path-ignored` codes still work. */
export const BLOCKING_JOIN_URL_WARNINGS: readonly JoinUrlWarning[] = ["not-https", "local"];

export type JoinUrlResult =
  | {
      ok: true;
      /** The normalized base URL: the origin (the app is served at the root). */
      baseUrl: string;
      /** What the QR code encodes: the join page. */
      joinUrl: string;
      warnings: JoinUrlWarning[];
    }
  | { ok: false; problem: "missing" | "invalid" };

/**
 * Validate and normalize the public base URL. It must be an absolute http(s)
 * URL without credentials, query or fragment. Only the origin is used: the app
 * has no basePath, so a path (e.g. a copied `/admin/qr`) is dropped with a
 * warning. A usable URL can still carry warnings: plain http, or a host only
 * reachable from this machine or the local network (localhost, LAN IPs, .local).
 */
export function resolveJoinUrl(baseUrl: string | undefined): JoinUrlResult {
  const raw = baseUrl?.trim();
  if (!raw) return { ok: false, problem: "missing" };

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, problem: "invalid" };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return { ok: false, problem: "invalid" };
  // `new URL("https:feest.nl")` parses, but the raw value was not absolute.
  if (!/^https?:\/\//i.test(raw)) return { ok: false, problem: "invalid" };
  if (url.username || url.password || url.search || url.hash || !url.hostname) {
    return { ok: false, problem: "invalid" };
  }

  const warnings: JoinUrlWarning[] = [];
  if (url.protocol !== "https:") warnings.push("not-https");
  if (isLocalHost(url.hostname)) warnings.push("local");
  if (url.pathname.replace(/\/+$/, "") !== "") warnings.push("path-ignored");
  return { ok: true, baseUrl: url.origin, joinUrl: `${url.origin}/`, warnings };
}

/** Dutch explanation per warning, for the Admin. */
export const JOIN_URL_WARNING_MESSAGES: Record<JoinUrlWarning, string> = {
  "not-https":
    "Het adres begint niet met https://. Telefoons openen het dan onveilig of helemaal niet, en de camera werkt alleen via https.",
  local:
    "Het adres wijst naar deze computer of het lokale netwerk (localhost, 127.0.0.1 of een LAN-IP). Telefoons van gasten kunnen het op het feest niet bereiken.",
  "path-ignored":
    "PUBLIC_BASE_URL bevat een pad na het domein (bv. /admin). Dat pad is genegeerd: de code wijst naar de startpagina en werkt dus wel, maar zet alleen het domein in PUBLIC_BASE_URL.",
};

export const JOIN_URL_PROBLEM_MESSAGES: Record<"missing" | "invalid", string> = {
  missing: "PUBLIC_BASE_URL is niet ingesteld, dus er is nog geen QR-code.",
  invalid:
    "PUBLIC_BASE_URL is geen geldig adres. Gebruik een volledig adres zoals https://mijn-feest.vercel.app (zonder ? of #).",
};

/** Domains for this machine or a home/office network only. */
const LOCAL_SUFFIXES = [".localhost", ".local", ".lan", ".internal", ".home.arpa"];

/** Hosts a guest's phone cannot reach over the internet. */
function isLocalHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  if (host === "localhost" || LOCAL_SUFFIXES.some((suffix) => host.endsWith(suffix))) return true;

  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const [a, b] = [Number(ipv4[1]), Number(ipv4[2])];
    return (
      a === 0 || // 0.0.0.0/8
      a === 127 || // loopback
      a === 10 ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 169 && b === 254) || // link-local
      (a === 100 && b >= 64 && b <= 127) // CGNAT, e.g. Tailscale
    );
  }

  if (host.startsWith("[")) {
    const ipv6 = host.slice(1, -1);
    return (
      ipv6 === "::" ||
      ipv6 === "::1" ||
      /^f[cd][0-9a-f]{0,2}:/.test(ipv6) || // unique local fc00::/7
      /^fe[89ab][0-9a-f]?:/.test(ipv6) || // link-local fe80::/10
      ipv6.startsWith("::ffff:") // IPv4-mapped: treat as local, never a public party URL
    );
  }
  return false;
}

/**
 * Error correction Q (25% recoverable): a printed card on a party table gets
 * creased and splashed. The quiet zone is the standard 4 modules.
 */
const QR_OPTIONS = {
  errorCorrectionLevel: "Q",
  margin: 4,
  color: { dark: "#000000", light: "#ffffff" },
} as const satisfies QRCodeOptions;

/** Width of the downloadable PNG: sharp enough for a print design (~10 cm at 300 dpi). */
export const QR_PNG_WIDTH = 1200;

/** The QR code as an SVG document (scales to any size, no width attribute). */
export function joinQrSvg(joinUrl: string): Promise<string> {
  return QRCode.toString(joinUrl, { ...QR_OPTIONS, type: "svg" });
}

/** The QR code as a PNG, black on white. */
export function joinQrPng(joinUrl: string, width: number = QR_PNG_WIDTH): Promise<Buffer> {
  return QRCode.toBuffer(joinUrl, { ...QR_OPTIONS, type: "png", width });
}

/** The QR symbol itself (for tests and diagnostics): version, size and encoded segments. */
export function joinQrSymbol(joinUrl: string) {
  return QRCode.create(joinUrl, QR_OPTIONS);
}

/** Download name for the QR image, from the party title: `qr-arne-wordt-25.png`. */
export function qrFileName(title: string, extension: "png" | "svg"): string {
  const slug = title
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/, "");
  return `qr-${slug || "party-camera"}.${extension}`;
}
