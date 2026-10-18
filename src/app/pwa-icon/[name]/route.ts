import { connection } from "next/server";
import { isAppIconName, renderAppIcon } from "@/server/app-icon";
import { partyCamera } from "@/server/party-camera";

/**
 * GET /pwa-icon/<name>: an app icon (manifest icons, apple-touch-icon) in the
 * party's current accent color. Rendered per request, never at build time, so
 * a new accent color needs no rebuild.
 */
export async function GET(
  _request: Request,
  { params }: RouteContext<"/pwa-icon/[name]">,
): Promise<Response> {
  await connection();
  const { name } = await params;
  if (!isAppIconName(name)) return new Response("Not found", { status: 404 });

  const { accentColor } = await partyCamera().getSettings();
  const png = await renderAppIcon(name, accentColor);
  return new Response(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png",
      // Short: browsers and launchers fetch icons rarely, but a changed accent
      // color should show up the next time they do.
      "Cache-Control": "public, max-age=300",
    },
  });
}
