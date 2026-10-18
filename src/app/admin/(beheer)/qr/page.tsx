import { Suspense } from "react";
import Link from "next/link";
import { serverEnv } from "@/server/env";
import { requireHost } from "@/server/host";
import { joinQrSvg, QR_PNG_WIDTH, qrFileName, resolveJoinUrl } from "@/server/join-qr";
import { Splash } from "../../../splash";
import { JoinUrlNotice, QrSvg } from "../../join-url-notice";

export default function AdminQrPage() {
  return (
    <Suspense fallback={<Splash />}>
      <QrSection />
    </Suspense>
  );
}

async function QrSection() {
  const camera = await requireHost();
  // After requireHost (cookies): the env is read per request, not at build.
  const join = resolveJoinUrl(serverEnv.publicBaseUrl);
  const [settings, svg] = await Promise.all([
    camera.getSettings(),
    join.ok ? joinQrSvg(join.joinUrl) : null,
  ]);

  return (
    <div className="flex max-w-3xl flex-col gap-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold tracking-tight">QR-code</h1>
        <p className="text-sm text-stone-400">
          Elke code leidt naar dezelfde aanmeldpagina. Leg de kaartjes op tafel of gebruik de
          afbeelding in een eigen ontwerp.
        </p>
      </div>

      <JoinUrlNotice join={join} />

      {join.ok && svg && (
        <section aria-labelledby="qr-heading" className="flex flex-col gap-4 rounded-2xl bg-stone-900 p-4 sm:flex-row sm:items-start">
          <QrSvg
            svg={svg}
            label={`QR-code naar ${join.joinUrl}`}
            className="size-56 shrink-0 self-center overflow-hidden rounded-xl bg-white sm:self-start"
          />
          <div className="flex min-w-0 flex-col gap-4">
            <div>
              <h2 id="qr-heading" className="text-lg font-semibold">
                Scant naar
              </h2>
              <p className="break-all font-mono text-sm text-stone-300">{join.joinUrl}</p>
            </div>
            <div className="flex flex-col gap-2">
              <Link
                href="/admin/kaartjes"
                className="self-start rounded-full bg-accent px-5 py-2 text-sm font-semibold text-stone-950"
              >
                Kaartjes afdrukken
              </Link>
              <div className="flex flex-wrap gap-2">
                <a
                  href="/api/admin/qr/png"
                  download={qrFileName(settings.title, "png")}
                  className="rounded-full bg-stone-800 px-4 py-1.5 text-sm font-medium"
                >
                  Download PNG
                </a>
                <a
                  href="/api/admin/qr/svg"
                  download={qrFileName(settings.title, "svg")}
                  className="rounded-full bg-stone-800 px-4 py-1.5 text-sm font-medium"
                >
                  Download SVG
                </a>
              </div>
              <p className="text-sm text-stone-500">
                PNG: {QR_PNG_WIDTH}×{QR_PNG_WIDTH} pixels. SVG: scherp op elk formaat, ideaal voor
                drukwerk. Laat de witte rand rond de code staan, anders scant hij slechter.
              </p>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
