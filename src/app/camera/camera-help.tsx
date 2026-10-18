/** Why the live viewfinder is not available. */
export type CameraProblem = "denied" | "unsupported" | "unavailable";

type Platform = "ios" | "android" | "other";

function detectPlatform(): Platform {
  if (typeof navigator === "undefined") return "other";
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua)) return "ios";
  // iPadOS reports itself as a Mac, but has a touch screen.
  if (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) return "ios";
  if (/Android/.test(ua)) return "android";
  return "other";
}

const DENIED_STEPS: Record<Platform, string[]> = {
  ios: [
    "Tik in de adresbalk van Safari op het ᴀA-icoon (links van het webadres).",
    "Kies ‘Website-instellingen’ en zet Camera op ‘Sta toe’.",
    "Tik hieronder op ‘Opnieuw proberen’ of herlaad de pagina.",
    "Lukt dat niet? Ga naar Instellingen › Apps › Safari › Camera en kies ‘Vraag’ of ‘Sta toe’.",
  ],
  android: [
    "Tik in Chrome links van het webadres op het instellingen-icoon (of het slotje).",
    "Kies ‘Machtigingen’ en zet Camera op ‘Toestaan’.",
    "Tik hieronder op ‘Opnieuw proberen’ of herlaad de pagina.",
    "Lukt dat niet? Ga naar Instellingen › Apps › Chrome › Machtigingen › Camera en kies ‘Toestaan’.",
  ],
  other: [
    "Geef deze website toegang tot je camera via de instellingen van je browser (meestal het icoon links van het webadres).",
    "Tik hieronder op ‘Opnieuw proberen’ of herlaad de pagina.",
  ],
};

const BROWSER_NAME: Record<Platform, string> = {
  ios: "Safari",
  android: "Chrome",
  other: "je gewone browser",
};

/**
 * Explains why there is no live viewfinder and how to fix it, per platform,
 * with a way out: the phone's own camera app.
 */
export function CameraHelp({
  problem,
  onRetry,
  onUseSystemCamera,
}: {
  problem: CameraProblem;
  onRetry(): void;
  onUseSystemCamera(): void;
}) {
  const platform = detectPlatform();

  return (
    <section
      role="alert"
      className="flex flex-1 flex-col justify-center gap-5 rounded-3xl bg-stone-900 p-6"
    >
      {problem === "denied" && (
        <>
          <h2 className="text-xl font-semibold">Geen toegang tot je camera</h2>
          <p className="text-stone-300">
            Je hebt de Party Camera geen toegang gegeven tot je camera. Zo zet je dat aan:
          </p>
          <ol className="flex list-decimal flex-col gap-2 pl-5 text-stone-300">
            {DENIED_STEPS[platform].map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </>
      )}
      {problem === "unsupported" && (
        <>
          <h2 className="text-xl font-semibold">Live camera werkt hier niet</h2>
          <p className="text-stone-300">
            Deze browser ondersteunt geen live camera. Heb je de link geopend in een app
            zoals WhatsApp of Instagram? Open hem dan in {BROWSER_NAME[platform]}.
          </p>
        </>
      )}
      {problem === "unavailable" && (
        <>
          <h2 className="text-xl font-semibold">Je camera is niet beschikbaar</h2>
          <p className="text-stone-300">
            Misschien gebruikt een andere app (zoals een videobel-app) je camera. Sluit die
            app en probeer het opnieuw.
          </p>
        </>
      )}
      <p className="text-stone-400">
        Je kunt ook gewoon verder met de camera-app van je telefoon. Ook dan zie je je
        foto&apos;s pas bij de onthulling.
      </p>
      <div className="flex flex-col gap-3">
        <button
          type="button"
          onClick={onUseSystemCamera}
          className="min-h-14 rounded-2xl bg-accent px-4 py-3 text-lg font-semibold text-stone-950 transition active:scale-[0.98]"
        >
          Gebruik je camera-app
        </button>
        {problem !== "unsupported" && (
          <button
            type="button"
            onClick={onRetry}
            className="min-h-12 rounded-2xl border border-stone-700 px-4 py-2 text-stone-200 transition active:scale-[0.98]"
          >
            Opnieuw proberen
          </button>
        )}
      </div>
    </section>
  );
}
