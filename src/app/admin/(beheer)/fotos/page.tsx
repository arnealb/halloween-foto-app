import { Suspense } from "react";
import Link from "next/link";
import type { HostPhoto } from "@/party-camera";
import { requireHost } from "@/server/host";
import { Splash } from "../../../splash";
import { countPhotos, formatHour, formatTime } from "../../format";
import { PhotoBrowser, type BrowserPhoto, type BrowserSection } from "./photo-browser";

type View = "gast" | "tijd";

export default function AdminPhotosPage({ searchParams }: PageProps<"/admin/fotos">) {
  return (
    <Suspense fallback={<Splash />}>
      <Photos searchParams={searchParams} />
    </Suspense>
  );
}

async function Photos({ searchParams }: Pick<PageProps<"/admin/fotos">, "searchParams">) {
  const camera = await requireHost();
  const view: View = (await searchParams).weergave === "tijd" ? "tijd" : "gast";

  let sections: BrowserSection[];
  if (view === "gast") {
    const { groups } = await camera.listAllPhotos({ groupBy: "guest" });
    sections = groups.map(({ guest, photos }) => ({
      id: `gast-${guest.id}`,
      title: guest.name,
      subtitle:
        countPhotos(guest.photoCount) +
        (guest.hiddenCount > 0 ? ` · ${guest.hiddenCount} verborgen` : ""),
      photos: photos.map(toBrowserPhoto),
    }));
  } else {
    const { photos } = await camera.listAllPhotos({ groupBy: "time" });
    sections = byHour(photos);
  }
  const total = sections.reduce((sum, section) => sum + section.photos.length, 0);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">
          Foto&apos;s <span className="text-stone-500 tabular-nums">{total}</span>
        </h1>
        <div role="group" aria-label="Weergave" className="flex rounded-full bg-stone-900 p-1 text-sm">
          <ViewLink view="gast" current={view} label="Per gast" />
          <ViewLink view="tijd" current={view} label="Op tijd" />
        </div>
      </div>
      {total === 0 ? (
        <p className="text-stone-400">Nog geen foto&apos;s genomen.</p>
      ) : (
        <PhotoBrowser sections={sections} showGuestNames={view === "tijd"} />
      )}
    </div>
  );
}

function ViewLink({ view, current, label }: { view: View; current: View; label: string }) {
  const active = view === current;
  return (
    <Link
      href={view === "gast" ? "/admin/fotos" : "/admin/fotos?weergave=tijd"}
      aria-current={active ? "page" : undefined}
      replace
      scroll={false}
      className="rounded-full px-4 py-1.5 font-medium text-stone-400 aria-[current=page]:bg-stone-700 aria-[current=page]:text-stone-50"
    >
      {label}
    </Link>
  );
}

function toBrowserPhoto(photo: HostPhoto): BrowserPhoto {
  return {
    id: photo.id,
    guestName: photo.guestName,
    time: formatTime(photo.takenAt),
    hidden: photo.hidden,
    width: photo.width,
    height: photo.height,
  };
}

/** Chronological view: one section per hour, so a long evening stays navigable. */
function byHour(photos: HostPhoto[]): BrowserSection[] {
  const sections: BrowserSection[] = [];
  for (const photo of photos) {
    const title = formatHour(photo.takenAt);
    let section = sections.at(-1);
    if (section?.title !== title) {
      section = { id: `uur-${sections.length}`, title, photos: [] };
      sections.push(section);
    }
    section.photos.push(toBrowserPhoto(photo));
  }
  for (const section of sections) section.subtitle = countPhotos(section.photos.length);
  return sections;
}
