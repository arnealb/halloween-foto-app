import type { MetadataRoute } from "next";
import { connection } from "next/server";
import { partyCamera } from "@/server/party-camera";
import { APP_BACKGROUND, shortName } from "./pwa";

/**
 * The web app manifest (/manifest.webmanifest), from the current settings:
 * the party title as name and home-screen label, the accent color as theme
 * color. Built per request (never frozen at build time), so a Host's changes
 * apply without a rebuild. No service worker: Chrome no longer needs one to
 * offer installing, and the home screen only needs the manifest.
 */
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  await connection();
  const settings = await partyCamera().getSettings();
  return {
    id: "/",
    name: settings.title,
    short_name: shortName(settings.title),
    description: "Een wegwerpcamera voor het feest: schiet je rolletje vol, zie de foto's later.",
    lang: "nl",
    dir: "ltr",
    // A Gast without a cookie is sent from the camera to the join page.
    start_url: "/camera",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    theme_color: settings.accentColor,
    background_color: APP_BACKGROUND,
    icons: [
      { src: "/pwa-icon/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/pwa-icon/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/pwa-icon/maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
