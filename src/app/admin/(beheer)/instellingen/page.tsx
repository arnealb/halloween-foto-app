import { Suspense } from "react";
import {
  MAX_SHOTS_PER_GUEST,
  MAX_TITLE_LENGTH,
  MAX_WELCOME_TEXT_LENGTH,
} from "@/party-camera";
import { requireHost } from "@/server/host";
import { Splash } from "../../../splash";
import { CaptureToggle } from "./capture-toggle";
import { SettingsForm } from "./settings-form";

export default function AdminSettingsPage() {
  return (
    <Suspense fallback={<Splash />}>
      <Settings />
    </Suspense>
  );
}

async function Settings() {
  const camera = await requireHost();
  const settings = await camera.getSettings();

  return (
    <div className="flex max-w-xl flex-col gap-8">
      <h1 className="text-2xl font-bold tracking-tight">Instellingen</h1>

      <CaptureToggle captureOpen={settings.captureOpen} />

      <section aria-labelledby="feest-heading" className="flex flex-col gap-3">
        <div>
          <h2 id="feest-heading" className="text-lg font-semibold">
            Het feest
          </h2>
          <p className="text-sm text-stone-400">
            Wijzigingen zijn meteen zichtbaar bij de gasten.
          </p>
        </div>
        <SettingsForm
          settings={{
            title: settings.title,
            welcomeText: settings.welcomeText,
            accentColor: settings.accentColor,
            shotsPerGuest: String(settings.shotsPerGuest),
          }}
          version={settings.settingsVersion}
          limits={{
            title: MAX_TITLE_LENGTH,
            welcomeText: MAX_WELCOME_TEXT_LENGTH,
            shotsPerGuest: MAX_SHOTS_PER_GUEST,
          }}
        />
      </section>
    </div>
  );
}
