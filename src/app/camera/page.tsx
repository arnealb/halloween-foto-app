import { Suspense, type CSSProperties } from "react";
import { redirect } from "next/navigation";
import { MAX_SHOT_BYTES, MAX_SHOT_LONG_SIDE } from "@/party-camera";
import { currentGuest } from "@/server/guest-session";
import { partyCamera } from "@/server/party-camera";
import { Splash } from "../splash";
import { Camera } from "./camera";

export default function CameraPage() {
  return (
    <Suspense fallback={<Splash />}>
      <CameraScreen />
    </Suspense>
  );
}

async function CameraScreen() {
  const guest = await currentGuest();
  if (!guest) redirect("/");

  // Read fresh on every request (nothing here is cached), so settings the
  // Host changes show up on the next render.
  const settings = await partyCamera().getSettings();
  const revealAt = settings.revealAt?.toISOString() ?? null;

  return (
    <main
      style={{ "--accent": settings.accentColor } as CSSProperties}
      className="mx-auto flex w-full max-w-md flex-1 flex-col justify-between gap-4 px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
    >
      {/* Always the same component (it shows "rolletje vol" and "gesloten"
          itself), so a refresh never unmounts its upload queue. */}
      <Camera
        guestName={guest.name}
        title={settings.title}
        welcomeText={settings.welcomeText}
        shotsTaken={guest.shotsTaken}
        shotsPerGuest={settings.shotsPerGuest}
        captureOpen={settings.captureOpen}
        viewId={crypto.randomUUID()}
        revealAt={revealAt}
        maxLongSide={MAX_SHOT_LONG_SIDE}
        maxBytes={MAX_SHOT_BYTES}
      />
    </main>
  );
}
