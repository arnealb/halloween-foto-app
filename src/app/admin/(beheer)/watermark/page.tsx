import { Suspense } from "react";
import {
  MAX_WATERMARK_OPACITY,
  MAX_WATERMARK_SCALE,
  MAX_WATERMARK_TEXT_LENGTH,
  MIN_WATERMARK_OPACITY,
  MIN_WATERMARK_SCALE,
} from "@/party-camera";
import { requireHost } from "@/server/host";
import { Splash } from "../../../splash";
import { PrepareGallery } from "./prepare-gallery";
import type { WatermarkSaveStatus } from "./save-result";
import { WatermarkForm } from "./watermark-form";

const STATUSES: readonly WatermarkSaveStatus[] = ["opgeslagen", "ongeldig", "gewijzigd", "fout"];

export default function AdminWatermarkPage({ searchParams }: PageProps<"/admin/watermark">) {
  return (
    <Suspense fallback={<Splash />}>
      <Watermark searchParams={searchParams} />
    </Suspense>
  );
}

const pct = (fraction: number) => Math.round(fraction * 100);

async function Watermark({
  searchParams,
}: {
  searchParams: PageProps<"/admin/watermark">["searchParams"];
}) {
  const camera = await requireHost();
  const [settings, stats, params] = await Promise.all([
    camera.getSettings(),
    camera.getStats(),
    searchParams,
  ]);
  // Outcome of a save without JavaScript (see POST /api/admin/watermark).
  const status = STATUSES.find((s) => s === params.watermark);

  return (
    <div className="flex max-w-xl flex-col gap-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Watermark</h1>
        <p className="text-sm text-stone-400">
          Staat op de foto&apos;s in de galerij en op gedeelde foto&apos;s. De originelen blijven
          altijd schoon.
        </p>
      </div>

      <WatermarkForm
        values={{
          enabled: settings.watermarkEnabled,
          text: settings.watermarkText,
          position: settings.watermarkPosition,
          scale: String(pct(settings.watermarkScale)),
          opacity: String(pct(settings.watermarkOpacity)),
        }}
        hasLogo={settings.watermarkLogoKey !== null}
        version={settings.settingsVersion}
        status={status}
        limits={{
          text: MAX_WATERMARK_TEXT_LENGTH,
          scale: [pct(MIN_WATERMARK_SCALE), pct(MAX_WATERMARK_SCALE)],
          opacity: [pct(MIN_WATERMARK_OPACITY), pct(MAX_WATERMARK_OPACITY)],
        }}
      />

      <PrepareGallery visiblePhotos={stats.photoCount - stats.hiddenCount} />
    </div>
  );
}
