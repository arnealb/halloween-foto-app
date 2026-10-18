/** The small part of qrcode 1.5 (no bundled types) that the join QR code uses. */
declare module "qrcode" {
  export type ErrorCorrectionLevel = "L" | "M" | "Q" | "H";

  export interface QRCodeOptions {
    errorCorrectionLevel?: ErrorCorrectionLevel;
    /** Quiet zone, in modules. */
    margin?: number;
    /** Image width in pixels (PNG) or the svg's width attribute. */
    width?: number;
    color?: { dark?: string; light?: string };
  }

  export interface QRCodeSegment {
    data: string | Uint8Array;
    mode: { id: string };
  }

  export interface QRCode {
    version: number;
    errorCorrectionLevel: { bit: number };
    modules: { size: number; get(row: number, col: number): number };
    segments: QRCodeSegment[];
  }

  export function create(text: string, options?: QRCodeOptions): QRCode;
  export function toString(text: string, options: QRCodeOptions & { type: "svg" }): Promise<string>;
  export function toBuffer(text: string, options?: QRCodeOptions & { type?: "png" }): Promise<Buffer>;
}
