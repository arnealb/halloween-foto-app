import { Suspense, type CSSProperties } from "react";
import { redirect } from "next/navigation";
import { MAX_GUEST_NAME_LENGTH } from "@/party-camera";
import { currentGuest } from "@/server/guest-session";
import { partyCamera } from "@/server/party-camera";
import { JoinForm } from "./join-form";
import { Splash } from "./splash";

export default function JoinPage() {
  return (
    <Suspense fallback={<Splash />}>
      <JoinScreen />
    </Suspense>
  );
}

async function JoinScreen() {
  // A recognized Gast skips straight to the camera.
  if (await currentGuest()) redirect("/camera");

  const settings = await partyCamera().getSettings();
  const steps = [
    `Je krijgt een rolletje van ${settings.shotsPerGuest} foto's.`,
    "Je ziet je foto's niet meteen: geen preview, geen herkansing.",
    "Bij de onthulling zie je alle foto's van het feest.",
  ];

  return (
    <main
      style={{ "--accent": settings.accentColor } as CSSProperties}
      className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-8 px-6 py-10"
    >
      <header className="flex flex-col gap-3">
        <span className="text-sm font-semibold uppercase tracking-[0.2em] text-accent">
          Wegwerpcamera
        </span>
        <h1 className="text-4xl font-bold leading-tight tracking-tight">{settings.title}</h1>
        {settings.welcomeText && (
          <p className="whitespace-pre-line text-lg text-stone-300">{settings.welcomeText}</p>
        )}
      </header>

      <ol className="flex flex-col gap-3">
        {steps.map((step, i) => (
          <li key={step} className="flex items-start gap-3 text-stone-200">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent/15 text-sm font-semibold text-accent">
              {i + 1}
            </span>
            <span className="pt-0.5">{step}</span>
          </li>
        ))}
      </ol>

      <JoinForm maxLength={MAX_GUEST_NAME_LENGTH} />
    </main>
  );
}
