import { describe, expect, it, vi } from "vitest";
import type { PageLike } from "./env";
import { fullscreenUrl, openTop } from "./FullscreenButton";

const page = (origin?: string): PageLike => ({ location: origin ? { ancestorOrigins: [origin] } : {}, document: { referrer: "" } });

describe("Full screen (27 Oct)", () => {
  it("the app's own page with Kissflow's full-screen mode, on the host around the frame", () => {
    expect(fullscreenUrl(page("https://dev-beiersdorf.kissflow.eu"))).toBe("https://dev-beiersdorf.kissflow.eu/view/application/CIQ_Digital_A00/ui?mode=fullscreen");
    expect(fullscreenUrl(page("https://beiersdorf.kissflow.eu"))).toBe("https://beiersdorf.kissflow.eu/view/application/CIQ_Digital_A00/ui?mode=fullscreen");
  });

  it("no button without an acceptable Kissflow host (dev server, test, another site)", () => {
    expect(fullscreenUrl(page())).toBeUndefined();
    expect(fullscreenUrl(page("http://localhost:5340"))).toBeUndefined();
    expect(fullscreenUrl(page("https://example.com"))).toBeUndefined();
  });

  it("moves the top window; a sandboxed frame that may not opens a new tab instead", () => {
    const top = { location: { href: "" } } as unknown as Window;
    const open = vi.fn();
    expect(openTop("https://x.kissflow.eu/a", { top, open } as unknown as Window)).toBe("top");
    expect(top.location.href).toBe("https://x.kissflow.eu/a");
    expect(open).not.toHaveBeenCalled();
    const blocked = { get location() { throw new DOMException("Blocked a frame from navigating the top window", "SecurityError"); } } as unknown as Window;
    expect(openTop("https://x.kissflow.eu/a", { top: blocked, open } as unknown as Window)).toBe("tab");
    expect(open).toHaveBeenCalledWith("https://x.kissflow.eu/a", "_blank", "noopener");
  });
});
