import { Suspense } from "react";
import type { ExportPlan, ExportVariant } from "@/party-camera";
import { requireHost } from "@/server/host";
import { Splash } from "../../../splash";
import { countPhotos } from "../../format";

export default function AdminDownloadsPage() {
  return (
    <Suspense fallback={<Splash />}>
      <Downloads />
    </Suspense>
  );
}

const VARIANTS: { variant: ExportVariant; title: string; description: string }[] = [
  {
    variant: "original",
    title: "Originelen",
    description: "Het archief: alle foto's zonder watermark, ook de verborgen foto's.",
  },
  {
    variant: "shareable",
    title: "Met watermark",
    description:
      "Om te delen, posten of printen: volle resolutie met het watermark, zonder de verborgen foto's.",
  },
];

function downloadUrl(variant: ExportVariant, options: { gast?: string; deel?: number } = {}): string {
  const params = new URLSearchParams({ variant });
  if (options.gast) params.set("gast", options.gast);
  if (options.deel) params.set("deel", String(options.deel));
  return `/api/admin/download?${params}`;
}

async function Downloads() {
  const camera = await requireHost();
  const [stats, original, shareable] = await Promise.all([
    camera.getStats(),
    camera.planExport({ variant: "original" }),
    camera.planExport({ variant: "shareable" }),
  ]);
  const plans: Record<ExportVariant, ExportPlan> = { original, shareable };
  const guests = stats.guests.filter((guest) => guest.photoCount > 0);

  return (
    <div className="flex max-w-3xl flex-col gap-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold tracking-tight">Downloads</h1>
        <p className="text-sm text-stone-400">
          Zip-bestanden met een map per gast. Elke foto heet{" "}
          <code className="text-stone-300">gast_datum_uur_nummer.jpg</code> (Belgische tijd).
        </p>
      </div>

      {VARIANTS.map(({ variant, title, description }) => {
        const plan = plans[variant];
        return (
          <section
            key={variant}
            aria-labelledby={`${variant}-heading`}
            className="flex flex-col gap-3 rounded-2xl bg-stone-900 p-4"
          >
            <div>
              <h2 id={`${variant}-heading`} className="text-lg font-semibold">
                {title}{" "}
                <span className="text-stone-500 tabular-nums">{plan.photoCount}</span>
              </h2>
              <p className="text-sm text-stone-400">{description}</p>
            </div>
            {plan.photoCount === 0 ? (
              <p className="text-sm text-stone-500">Nog geen foto&apos;s.</p>
            ) : plan.parts.length === 1 ? (
              <a
                href={downloadUrl(variant)}
                download
                className="self-start rounded-full bg-accent px-5 py-2 text-sm font-semibold text-stone-950"
              >
                Download als zip ({countPhotos(plan.photoCount)})
              </a>
            ) : (
              // Too big for one request: a download is cut off after 5
              // minutes, leaving a broken zip. The parts are the way.
              <div className="flex flex-col gap-3">
                <p className="text-sm text-stone-400">
                  Te veel voor één download: haal de {plan.parts.length} delen van elk hoogstens{" "}
                  {plan.partSize} foto&apos;s binnen. Samen bevatten ze elke foto precies één keer;
                  een gast staat in één deel, behalve gasten met meer dan {plan.partSize}{" "}
                  foto&apos;s. De delen blijven dezelfde zolang er geen foto&apos;s bijkomen,
                  verborgen of verwijderd worden: herlaad deze pagina als dat toch gebeurde.
                </p>
                <ul className="flex flex-col divide-y divide-stone-800 rounded-xl bg-stone-950/40">
                  {plan.parts.map((part) => (
                    <li
                      key={part.part}
                      className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="font-medium tabular-nums">
                          Deel {part.part} van {plan.parts.length}{" "}
                          <span className="text-stone-400">· {countPhotos(part.photoCount)}</span>
                        </p>
                        <p className="truncate text-sm text-stone-500">
                          {part.guestNames.join(", ")}
                        </p>
                      </div>
                      <a
                        href={downloadUrl(variant, { deel: part.part })}
                        download
                        className="shrink-0 rounded-full bg-accent px-4 py-1.5 text-sm font-semibold text-stone-950"
                      >
                        Download deel {part.part}
                      </a>
                    </li>
                  ))}
                </ul>
                <details className="text-sm text-stone-500">
                  <summary className="cursor-pointer">Toch alles in één zip?</summary>
                  <p className="mt-2">
                    Een download mag hoogstens 5 minuten duren. Met{" "}
                    {countPhotos(plan.photoCount)} wordt hij waarschijnlijk halverwege afgebroken,
                    en dan is de zip kapot (ook als je browser zegt dat hij klaar is).{" "}
                    <a href={downloadUrl(variant)} download className="underline underline-offset-4">
                      Toch proberen
                    </a>
                  </p>
                </details>
              </div>
            )}
          </section>
        );
      })}

      <section aria-labelledby="guests-heading" className="flex flex-col gap-3">
        <h2 id="guests-heading" className="text-lg font-semibold">
          Per gast
        </h2>
        {guests.length === 0 ? (
          <p className="text-sm text-stone-500">Nog geen foto&apos;s.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-stone-800 rounded-2xl bg-stone-900">
            {guests.map((guest) => {
              const visible = guest.photoCount - guest.hiddenCount;
              return (
                <li
                  key={guest.id}
                  className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{guest.name}</p>
                    <p className="text-sm text-stone-400 tabular-nums">
                      {countPhotos(guest.photoCount)}
                      {guest.hiddenCount > 0 && ` · ${guest.hiddenCount} verborgen`}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <a
                      href={downloadUrl("original", { gast: guest.id })}
                      download
                      className="rounded-full bg-stone-800 px-4 py-1.5 text-sm font-medium"
                    >
                      Originelen
                    </a>
                    {visible > 0 && (
                      <a
                        href={downloadUrl("shareable", { gast: guest.id })}
                        download
                        className="rounded-full bg-stone-800 px-4 py-1.5 text-sm font-medium"
                      >
                        Met watermark
                      </a>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
