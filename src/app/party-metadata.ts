import type { Metadata } from "next";
import { cacheTag } from "next/cache";
import { partyCamera } from "@/server/party-camera";
import { shortName } from "./pwa";

/** Apple's web-app meta, shared by the root layout and the guest pages. */
export const APPLE_WEB_APP = {
  capable: true,
  // The page runs under a transparent status bar with white text: right for
  // the dark camera UI. Pages keep clear of it with safe-area padding.
  statusBarStyle: "black-translucent",
} as const satisfies Metadata["appleWebApp"];

/**
 * Next renders `appleWebApp.capable` as the unprefixed `mobile-web-app-capable`;
 * older iOS versions only know the Apple-prefixed name.
 */
export const APPLE_CAPABLE_META = { "apple-mobile-web-app-capable": "yes" } as const;

/** Cache tag of the party-title metadata; expire it when the settings change. */
export const PARTY_METADATA_TAG = "party-metadata";

/**
 * Metadata for the guest pages (join, camera): the party title as page title
 * and as the label iOS suggests when adding to the home screen.
 *
 * Cached (and expired via {@link PARTY_METADATA_TAG} when the Host saves the
 * settings) so it resolves in the prerendered shell and lands in `<head>`.
 * Uncached, it would stream into `<body>`, where Chrome doesn't look for
 * `<link rel="manifest">`, so the app couldn't be installed.
 */
export async function partyMetadata(): Promise<Metadata> {
  "use cache";
  cacheTag(PARTY_METADATA_TAG);
  const { title } = await partyCamera().getSettings();
  return {
    title,
    // Replaces (not merges with) the layout's appleWebApp, so repeat it all.
    appleWebApp: { ...APPLE_WEB_APP, title: shortName(title) },
  };
}
