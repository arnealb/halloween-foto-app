import { Suspense, type CSSProperties } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { currentGuest } from "@/server/guest-session";
import { partyCamera } from "@/server/party-camera";
import { formatPartyMoment } from "../party-time";
import { Splash } from "../splash";
import { Countdown, Recheck } from "./countdown";
import { toViewPage } from "./gallery-data";
import { Gallery } from "./gallery";

export const metadata: Metadata = {
  title: "Galerij",
  // Unlisted: reachable by link only.
  robots: { index: false, follow: false },
};

/**
 * The Galerij, on a fixed unlisted URL. Before the Reveal: a countdown (or a
 * "nog even geduld"), and no photo at all. After: everyone with the link sees
 * the photos; a Gast with a cookie can filter on their own ("mijn foto's").
 */
export default function GalleryPage({ searchParams }: PageProps<"/galerij">) {
  return (
    <Suspense fallback={<Splash />}>
      <GalleryScreen searchParams={searchParams} />
    </Suspense>
  );
}

async function GalleryScreen({ searchParams }: Pick<PageProps<"/galerij">, "searchParams">) {
  const camera = partyCamera();
  const [settings, reveal, guest, params] = await Promise.all([
    camera.getSettings(),
    camera.getRevealState(),
    currentGuest(),
    searchParams,
  ]);
  const style = { "--accent": settings.accentColor } as CSSProperties;

  if (!reveal.revealed) {
    const revealAt = reveal.reason === "pending" ? reveal.revealAt : null;
    return (
      <main
        style={style}
        className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-6 px-6 py-10 text-center"
      >
        <span className="text-sm font-semibold uppercase tracking-[0.2em] text-accent">
          {settings.title}
        </span>
        <h1 className="text-4xl font-bold tracking-tight">Nog even geduld</h1>
        {revealAt ? (
          <>
            <p className="text-lg text-stone-300">
              De foto&apos;s worden onthuld op{" "}
              <time dateTime={revealAt.toISOString()} className="font-semibold text-accent">
                {formatPartyMoment(revealAt)}
              </time>
              .
            </p>
            <Countdown revealAt={revealAt.toISOString()} />
          </>
        ) : (
          <>
            <p className="text-lg text-stone-300">
              De foto&apos;s zijn nog niet onthuld. De host maakt bekend wanneer het zover is.
            </p>
            <Recheck />
          </>
        )}
        {guest ? (
          <Link href="/camera" className="text-stone-400 underline underline-offset-4">
            Terug naar de camera
          </Link>
        ) : null}
      </main>
    );
  }

  const mine = params.van === "mij" && guest !== null;
  const [page, own] = await Promise.all([
    camera.listGallery({ guestId: mine ? guest.id : undefined }),
    // Whether the Gast has any photo in the Galerij (for the zip button).
    guest && !mine ? camera.listGallery({ guestId: guest.id, limit: 1 }) : null,
  ]);
  const hasOwnPhotos = mine ? page.photos.length > 0 : (own?.photos.length ?? 0) > 0;

  return (
    <main style={style} className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 px-2 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(2rem,env(safe-area-inset-bottom))] sm:px-4">
      <header className="flex flex-col gap-3 px-2">
        <div>
          <span className="text-sm font-semibold uppercase tracking-[0.2em] text-accent">
            Galerij
          </span>
          <h1 className="text-3xl font-bold tracking-tight">{settings.title}</h1>
        </div>
        <nav aria-label="Filter" className="flex flex-wrap items-center gap-3">
          <div className="flex rounded-full bg-stone-900 p-1 text-sm">
            <FilterLink href="/galerij" active={!mine} label="Alle foto's" />
            {guest ? (
              <FilterLink href="/galerij?van=mij" active={mine} label="Mijn foto's" />
            ) : (
              <span
                aria-disabled="true"
                title="Alleen voor gasten die op dit toestel foto's namen"
                className="rounded-full px-4 py-1.5 font-medium text-stone-600"
              >
                Mijn foto&apos;s
              </span>
            )}
          </div>
          {guest && mine && (
            <span className="text-sm text-stone-400">Foto&apos;s van {guest.name}</span>
          )}
          {guest && hasOwnPhotos && (
            // A plain link: the zip streams straight to the browser's downloads.
            <a
              href="/api/galerij/mijn-fotos"
              download
              className="rounded-full bg-stone-800 px-4 py-1.5 text-sm font-medium"
            >
              Download mijn foto&apos;s (zip)
            </a>
          )}
        </nav>
      </header>
      <Gallery
        // A new list for every filter; the server sends its first page.
        key={mine ? "mine" : "all"}
        initial={toViewPage(page)}
        mine={mine}
        emptyText={
          mine ? "Je hebt (nog) geen zichtbare foto's in de galerij." : "Er zijn nog geen foto's."
        }
      />
    </main>
  );
}

function FilterLink({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <Link
      href={href}
      replace
      scroll={false}
      aria-current={active ? "page" : undefined}
      className="rounded-full px-4 py-1.5 font-medium text-stone-400 aria-[current=page]:bg-stone-700 aria-[current=page]:text-stone-50"
    >
      {label}
    </Link>
  );
}
