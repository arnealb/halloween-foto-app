import { Suspense, type CSSProperties } from "react";
import { redirect } from "next/navigation";
import { currentGuest } from "@/server/guest-session";
import { partyCamera } from "@/server/party-camera";
import { Splash } from "../splash";

export default function CameraPage() {
  return (
    <Suspense fallback={<Splash />}>
      <Camera />
    </Suspense>
  );
}

// Placeholder until the real camera (tickets 02/03).
async function Camera() {
  const guest = await currentGuest();
  if (!guest) redirect("/");

  const settings = await partyCamera().getSettings();

  return (
    <main
      style={{ "--accent": settings.accentColor } as CSSProperties}
      className="mx-auto flex w-full max-w-md flex-1 flex-col justify-between gap-8 px-6 py-10"
    >
      <header className="flex items-center justify-between text-sm text-stone-400">
        <span>{settings.title}</span>
        <span className="font-mono tabular-nums text-stone-200">
          {guest.shotsRemaining} / {guest.shotsPerGuest}
        </span>
      </header>

      <section className="flex flex-col gap-3 text-center">
        <h1 className="text-4xl font-bold tracking-tight">Hallo {guest.name}</h1>
        <p className="text-stone-400">
          Je bent aangemeld. De camera komt hier binnenkort.
        </p>
      </section>

      <div className="mx-auto size-20 rounded-full border-4 border-stone-700 bg-stone-800" aria-hidden />
    </main>
  );
}
