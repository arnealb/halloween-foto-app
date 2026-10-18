import { Suspense, type CSSProperties } from "react";
import { redirect } from "next/navigation";
import { MAX_SHOT_BYTES, MAX_SHOT_LONG_SIDE } from "@/party-camera";
import { currentGuest } from "@/server/guest-session";
import { partyCamera } from "@/server/party-camera";
import { Splash } from "../splash";
import { Camera } from "./camera";
import { RollFull } from "./roll-full";

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

  const settings = await partyCamera().getSettings();
  const revealAt = settings.revealAt?.toISOString() ?? null;

  return (
    <main
      style={{ "--accent": settings.accentColor } as CSSProperties}
      className="mx-auto flex w-full max-w-md flex-1 flex-col justify-between gap-8 px-6 py-10"
    >
      {guest.shotsRemaining <= 0 ? (
        <RollFull shotsPerGuest={guest.shotsPerGuest} revealAt={revealAt} />
      ) : (
        <Camera
          guestName={guest.name}
          shotsRemaining={guest.shotsRemaining}
          shotsPerGuest={guest.shotsPerGuest}
          revealAt={revealAt}
          maxLongSide={MAX_SHOT_LONG_SIDE}
          maxBytes={MAX_SHOT_BYTES}
        />
      )}
    </main>
  );
}
