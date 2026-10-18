import { Suspense } from "react";
import Link from "next/link";
import { MAX_GUEST_NAME_LENGTH } from "@/party-camera";
import { requireHost } from "@/server/host";
import { Splash } from "../../splash";
import { countPhotos } from "../format";
import { AutoRefresh } from "./auto-refresh";
import { RenameGuest } from "./rename-guest";

export default function AdminOverviewPage() {
  return (
    <Suspense fallback={<Splash />}>
      <Overview />
    </Suspense>
  );
}

async function Overview() {
  const camera = await requireHost();
  const stats = await camera.getStats();

  const tiles = [
    { label: "Gasten", value: stats.guestCount },
    { label: "Foto's", value: stats.photoCount },
    { label: "Verborgen", value: stats.hiddenCount },
    { label: "Shots gebruikt", value: stats.shotsTaken },
  ];

  return (
    <div className="flex flex-col gap-8">
      <AutoRefresh everySeconds={20} />
      <section aria-labelledby="stats-heading" className="flex flex-col gap-3">
        <h1 id="stats-heading" className="text-2xl font-bold tracking-tight">
          Overzicht
        </h1>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {tiles.map(({ label, value }) => (
            <div key={label} className="rounded-2xl bg-stone-900 px-4 py-3">
              <dt className="text-sm text-stone-400">{label}</dt>
              <dd className="text-3xl font-bold tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-labelledby="guests-heading" className="flex flex-col gap-3">
        <h2 id="guests-heading" className="text-lg font-semibold">
          Foto&apos;s per gast
        </h2>
        {stats.guests.length === 0 ? (
          <p className="text-stone-400">Nog geen gasten aangemeld.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-stone-800 rounded-2xl bg-stone-900">
            {stats.guests.map((guest) => (
              <li key={guest.id} className="flex flex-col gap-1 px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link
                      href={`/admin/fotos#gast-${guest.id}`}
                      className="block truncate font-medium hover:underline"
                    >
                      {guest.name}
                    </Link>
                    <p className="text-sm text-stone-400 tabular-nums">
                      {countPhotos(guest.photoCount)}
                      {guest.hiddenCount > 0 && ` · ${guest.hiddenCount} verborgen`}
                      {` · ${guest.shotsTaken}/${guest.shotsPerGuest} shots`}
                    </p>
                  </div>
                  <span className="shrink-0 text-2xl font-semibold tabular-nums">
                    {guest.photoCount}
                  </span>
                </div>
                <RenameGuest
                  key={guest.name}
                  guestId={guest.id}
                  name={guest.name}
                  maxLength={MAX_GUEST_NAME_LENGTH}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
