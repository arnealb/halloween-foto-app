import { Suspense, type CSSProperties } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { serverEnv } from "@/server/env";
import { requireHost } from "@/server/host";
import { joinQrSvg, resolveJoinUrl } from "@/server/join-qr";
import { Splash } from "../../splash";
import { JoinUrlNotice, QrSvg } from "../join-url-notice";
import { cardColors } from "./card-colors";
import { PrintButton } from "./print-button";
import "./cards.css";

export const metadata: Metadata = { title: "QR-kaartjes · Party Camera" };

/**
 * Cards per A4 sheet: grid and sizes per choice. The QR size is a maximum (it
 * shrinks to fit the card); on the smallest cards the title stays on one line.
 */
const LAYOUTS = {
  4: { cols: 2, rows: 2, qr: "68mm", title: "18pt", headline: "17pt", layout: "stacked", titleLines: "wrap" },
  6: { cols: 2, rows: 3, qr: "50mm", title: "14pt", headline: "13pt", layout: "side", titleLines: "wrap" },
  8: { cols: 2, rows: 4, qr: "40mm", title: "12pt", headline: "12pt", layout: "side", titleLines: "single" },
} as const;
type CardsPerPage = keyof typeof LAYOUTS;
const DEFAULT_PER_PAGE: CardsPerPage = 6;

/**
 * Printable sheet of QR cards for the tables (Host only). Outside the admin
 * shell on purpose: printing leaves nothing but the cards.
 */
export default function QrCardsPage({ searchParams }: PageProps<"/admin/kaartjes">) {
  return (
    <Suspense fallback={<Splash />}>
      <QrCards searchParams={searchParams} />
    </Suspense>
  );
}

async function QrCards({ searchParams }: Pick<PageProps<"/admin/kaartjes">, "searchParams">) {
  const camera = await requireHost();
  const join = resolveJoinUrl(serverEnv.publicBaseUrl);
  const [settings, svg, params] = await Promise.all([
    camera.getSettings(),
    join.ok ? joinQrSvg(join.joinUrl) : null,
    searchParams,
  ]);
  const perParam = Number(params.per);
  const perPage: CardsPerPage = perParam in LAYOUTS ? (perParam as CardsPerPage) : DEFAULT_PER_PAGE;
  const layout = LAYOUTS[perPage];
  const colors = cardColors(settings.accentColor);

  return (
    <main className="flex flex-1 flex-col gap-6 px-4 py-6 print:block print:p-0">
      <div className="mx-auto flex w-full max-w-[210mm] flex-col gap-4 print:hidden">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <Link href="/admin/qr" className="text-sm text-stone-400 hover:text-stone-100">
              ← Terug naar de admin
            </Link>
            <h1 className="text-2xl font-bold tracking-tight">QR-kaartjes</h1>
          </div>
          {join.ok && <PrintButton />}
        </div>
        {join.ok && (
          <div className="flex flex-wrap items-center gap-2 text-sm text-stone-400">
            <span>Per A4:</span>
            {(Object.keys(LAYOUTS) as `${CardsPerPage}`[]).map((key) => (
              <Link
                key={key}
                href={`/admin/kaartjes?per=${key}`}
                aria-current={Number(key) === perPage ? "page" : undefined}
                className="rounded-full bg-stone-800 px-3 py-1 font-medium text-stone-200 aria-[current=page]:bg-stone-100 aria-[current=page]:text-stone-950"
              >
                {key} kaartjes
              </Link>
            ))}
          </div>
        )}
        {join.ok && (
          <p className="text-sm text-stone-400">
            Druk af op A4 op 100% (niet &quot;passend maken&quot;) en knip langs de stippellijnen.
          </p>
        )}
        <JoinUrlNotice join={join} />
      </div>

      {join.ok && svg && (
        <div className="overflow-x-auto print:overflow-visible">
          <div
            className="qr-paper"
            style={
              {
                "--qr-cols": layout.cols,
                "--qr-rows": layout.rows,
                "--qr-size": layout.qr,
                "--qr-title-size": layout.title,
                "--qr-headline-size": layout.headline,
                "--qr-accent": settings.accentColor,
                "--qr-ink": colors.titleInk,
                "--qr-accent-text": colors.shotsInk,
              } as CSSProperties
            }
          >
            <div className="qr-sheet">
              {Array.from({ length: perPage }, (_, i) => (
                <article key={i} className="qr-card" data-layout={layout.layout} data-title={layout.titleLines}>
                  <p className="qr-card-title">{settings.title}</p>
                  <div className="qr-card-body">
                    <QrSvg svg={svg} label={`QR-code naar ${join.joinUrl}`} className="qr-card-code" />
                    <div>
                      <p className="qr-card-headline">
                        Scan me &amp; schiet <em>{settings.shotsPerGuest}</em>{" "}
                        {settings.shotsPerGuest === 1 ? "foto" : "foto's"}
                      </p>
                      <p className="qr-card-hint">
                        Een wegwerpcamera op je gsm. Je ziet je foto&apos;s pas na de onthulling.
                      </p>
                    </div>
                  </div>
                  <p className="qr-card-url">{displayUrl(join.joinUrl)}</p>
                </article>
              ))}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

/** The fallback URL to type: without `https://` and trailing slash. */
function displayUrl(joinUrl: string): string {
  return joinUrl.replace(/^https:\/\//, "").replace(/\/$/, "");
}
