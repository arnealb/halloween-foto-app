import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import { APPLE_CAPABLE_META, APPLE_WEB_APP } from "./party-metadata";
import { APP_BACKGROUND } from "./pwa";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Party Camera",
  description: "Een wegwerpcamera voor het feest: schiet je rolletje vol, zie de foto's later.",
  // The manifest (app/manifest.ts) is linked automatically. iOS takes the
  // home-screen icon from apple-touch-icon, not from the manifest.
  icons: {
    icon: [
      { url: "/pwa-icon/icon-192.png", type: "image/png", sizes: "192x192" },
    ],
    apple: [{ url: "/pwa-icon/apple-touch-icon.png", type: "image/png", sizes: "180x180" }],
  },
  // Guest pages override the title with the party title (partyMetadata).
  appleWebApp: { ...APPLE_WEB_APP, title: "Party Camera" },
  formatDetection: { telephone: false },
  other: { ...APPLE_CAPABLE_META },
};

/**
 * Static on purpose: a viewport can't stream, so reading the settings here
 * would hold every page's first byte until the database answers. The status
 * bar uses the dark app background, which the dark camera UI blends into; the
 * accent color is the manifest's theme color (installed app, splash screen).
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: APP_BACKGROUND,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="nl" className={`${geistSans.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
