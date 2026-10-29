// The app's "Full screen" button (Thomas, 27 Oct): opens CIQ Digital's own page with Kissflow's full-screen mode,
// https://<the Kissflow page around the frame>/view/application/CIQ_Digital_A00/ui?mode=fullscreen. In the side pane's
// footer, before night mode; the portal has none. The host comes from the page around the frame (env.ts hookHostOf); no
// host is written in the bundle, and without an acceptable Kissflow host (the dev server, a test) there is no button.
// The frame may not be allowed to move the page around it (sandbox); then the full-screen page opens in a new tab.
import { Maximize2 } from "lucide-react";
import { IconButton } from "@/components/ui";
import { MoreRow } from "@/shell/PhoneChrome";
import { hookHostOf, type PageLike } from "./env";
import { APP_ID } from "./ids";

/** The full-screen URL of the app where the screen runs, or undefined without a Kissflow host. */
export function fullscreenUrl(page?: PageLike): string | undefined {
  const host = hookHostOf(page);
  return host ? `https://${host}/view/application/${APP_ID}/ui?mode=fullscreen` : undefined;
}

/** Opens `url` in the top window; a sandboxed frame that may not do that opens it in a new tab instead. */
export function openTop(url: string, win: Pick<Window, "top" | "open"> = window): "top" | "tab" {
  try {
    if (!win.top) throw new Error("no top window");
    win.top.location.href = url;
    return "top";
  } catch {
    win.open(url, "_blank", "noopener");
    return "tab";
  }
}

/** `row`: the labelled row of the phone's More sheet (Thomas, 30 Oct) instead of the side pane's icon button. */
export function FullscreenButton({ page, row }: { page?: PageLike; row?: boolean }) {
  const url = fullscreenUrl(page);
  if (!url) return null;
  if (row) return <MoreRow icon={<Maximize2 />} label="Full screen" title="Open CIQ Digital in full screen" onClick={() => openTop(url)} data-testid="fullscreen" />;
  return (
    <IconButton label="Full screen" title="Open CIQ Digital in full screen" onClick={() => openTop(url)} data-testid="fullscreen">
      <Maximize2 size={16} />
    </IconButton>
  );
}
