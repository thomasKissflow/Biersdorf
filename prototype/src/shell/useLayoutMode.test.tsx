// The layout mode (Thomas, 30 Oct): phone below 768 px, tablet 768–1023 px, desktop from 1024 px; decided by the two
// media queries at load and again on every resize or rotate that crosses a breakpoint; desktop on the server and
// without matchMedia; LayoutModeContext forces a mode. The left pane's default (useCollapsed.ts) follows it.
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { paneCollapsed } from "./useCollapsed";
import { DESKTOP_FROM, LayoutModeContext, PHONE_BELOW, PHONE_QUERY, TABLET_QUERY, layoutModeOf, layoutModeStore, useIsPhone, useLayoutMode } from "./useLayoutMode";

/** A window whose matchMedia answers min-width / max-width queries for `width`, and `resize` flips the lists. */
function fakeWindow(width: number, legacy = false) {
  type List = { query: string; matches: boolean; cbs: Set<() => void> };
  const lists: List[] = [];
  const hits = (q: string, w: number) => {
    const min = /min-width: ([\d.]+)px/.exec(q);
    const max = /max-width: ([\d.]+)px/.exec(q);
    return (!min || w >= Number(min[1])) && (!max || w <= Number(max[1]));
  };
  const win = {
    width,
    matchMedia(query: string) {
      const l: List = { query, matches: hits(query, win.width), cbs: new Set() };
      lists.push(l);
      const api = {
        get matches() {
          return l.matches;
        },
      };
      return legacy
        ? Object.assign(api, { addListener: (cb: () => void) => l.cbs.add(cb), removeListener: (cb: () => void) => l.cbs.delete(cb) })
        : Object.assign(api, { addEventListener: (_: "change", cb: () => void) => l.cbs.add(cb), removeEventListener: (_: "change", cb: () => void) => l.cbs.delete(cb) });
    },
    // as a browser: every list is evaluated first, then the flipped ones fire their change events
    resize(w: number) {
      win.width = w;
      const flipped = lists.filter((l) => hits(l.query, w) !== l.matches);
      for (const l of flipped) l.matches = !l.matches;
      for (const l of flipped) for (const cb of l.cbs) cb();
    },
    listeners: () => lists.reduce((n, l) => n + l.cbs.size, 0),
  };
  return win;
}

function Probe() {
  return <span>{`${useLayoutMode()}/${useIsPhone()}`}</span>;
}

describe("layoutModeOf", () => {
  it("phone below 768 px, tablet from 768 to 1023 px, desktop from 1024 px", () => {
    expect([PHONE_BELOW, DESKTOP_FROM]).toEqual([768, 1024]);
    expect([320, 360, 390, 430, 767, 767.5].map(layoutModeOf)).toEqual(Array(6).fill("phone"));
    expect([768, 900, 1023, 1023.5].map(layoutModeOf)).toEqual(Array(4).fill("tablet"));
    expect([1024, 1280, 1920].map(layoutModeOf)).toEqual(Array(3).fill("desktop"));
  });

  it("the media queries say the same at the breakpoints, a fractional width just below one included", () => {
    expect(PHONE_QUERY).toBe("(max-width: 767.98px)");
    expect(TABLET_QUERY).toBe("(max-width: 1023.98px)");
    for (const w of [360, 767, 767.98, 768, 1023, 1023.98, 1024, 1280]) expect(layoutModeStore(fakeWindow(w)).get()).toBe(layoutModeOf(w));
  });

  it("no gap between the queries: a zoomed width just under 768 px is a tablet, not a desktop", () => {
    expect(layoutModeStore(fakeWindow(767.99)).get()).toBe("tablet");
  });
});

describe("layoutModeStore", () => {
  it("follows a resize or rotate live: subscribers hear each crossing of a breakpoint, not a resize within a mode", () => {
    const win = fakeWindow(390);
    const store = layoutModeStore(win);
    const seen: string[] = [];
    // React drops a repeated snapshot; so does this log
    const stop = store.subscribe(() => seen.at(-1) !== store.get() && seen.push(store.get()));
    expect(store.get()).toBe("phone");
    win.resize(420); // a phone still
    win.resize(844); // rotated: a phone in landscape is a tablet here
    win.resize(1280);
    win.resize(1100);
    win.resize(390);
    expect(seen).toEqual(["tablet", "desktop", "phone"]);
    stop();
    expect(win.listeners()).toBe(0);
    win.resize(1280);
    expect(seen).toHaveLength(3);
  });

  it("works with WebViews that only know addListener / removeListener", () => {
    const win = fakeWindow(1280, true);
    const store = layoutModeStore(win);
    let n = 0;
    const stop = store.subscribe(() => n++);
    win.resize(375);
    // both lists flip (the phone one and the tablet one); React reads the one new snapshot
    expect([store.get(), n]).toEqual(["phone", 2]);
    stop();
    expect(win.listeners()).toBe(0);
  });

  it("without matchMedia (the server, an old frame): desktop, and subscribing is harmless", () => {
    for (const win of [undefined, {}]) {
      const store = layoutModeStore(win);
      expect(store.get()).toBe("desktop");
      store.subscribe(() => {})();
    }
  });
});

describe("useLayoutMode", () => {
  it("renders desktop on the server, and the mode LayoutModeContext forces", () => {
    expect(renderToString(<Probe />)).toContain("desktop/false");
    expect(
      renderToString(
        <LayoutModeContext.Provider value="phone">
          <Probe />
        </LayoutModeContext.Provider>,
      ),
    ).toContain("phone/true");
    expect(
      renderToString(
        <LayoutModeContext.Provider value="tablet">
          <Probe />
        </LayoutModeContext.Provider>,
      ),
    ).toContain("tablet/false");
  });
});

describe("the left pane's default (useCollapsed)", () => {
  it("collapsed on a tablet, expanded on desktop, unless the viewer chose otherwise (that choice wins everywhere)", () => {
    expect(paneCollapsed(null, "tablet")).toBe(true);
    expect(paneCollapsed(null, "desktop")).toBe(false);
    expect(paneCollapsed(false, "tablet")).toBe(false); // expanded on purpose
    expect(paneCollapsed(true, "desktop")).toBe(true); // today's remembered state
    expect(paneCollapsed(false, "desktop")).toBe(false);
  });
});
