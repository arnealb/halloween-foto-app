"use client";

import { useInstallPlatform, useStandalone } from "./camera/install-hint";

/**
 * On the join page of the home-screen app on an iPhone: some iOS versions
 * don't hand Safari's cookie to the home-screen app, so a Gast who joined in
 * Safari lands here again. Say why, so it isn't a surprise.
 */
export function StandaloneJoinNote() {
  const standalone = useStandalone();
  const platform = useInstallPlatform();
  if (!standalone || (platform !== "ios-safari" && platform !== "ios-other")) return null;
  return (
    <p className="rounded-2xl bg-stone-900 p-4 text-sm text-stone-400">
      Je opent de camera vanaf je beginscherm. Had je je al in Safari aangemeld? Op sommige
      iPhones neemt de beginscherm-app die aanmelding niet over. Meld je dan hier aan en
      gebruik voortaan alleen deze app.
    </p>
  );
}
