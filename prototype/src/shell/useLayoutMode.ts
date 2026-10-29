// Phone or big screen (Thomas, 30 Oct): the live UIs (app and portal) decide which layout they build at load AND live
// on rotate / resize (matchMedia listeners). A viewport narrower than 768 px is a phone: no left pane; a slim title
// header, a bottom tab bar and a More sheet (src/shell/PhoneChrome.tsx). A tablet (768–1023 px) gets the desktop layout
// with the left menu collapsed to its icon rail by default (useCollapsed.ts). Desktop (>= 1024 px) stays as it was.
// Only the shells and the shared phone primitives read it; the state lives in the stores, so a switch loses nothing.
// Inside Kissflow the UI is an iframe: the frame's own viewport decides (on a phone, Kissflow's mobile app or PWA).
// Server rendering (the unit tests) and a window without matchMedia see "desktop"; LayoutModeContext forces a mode
// (unit tests of the phone layout).
import { createContext, useContext, useSyncExternalStore } from "react";

export type LayoutMode = "phone" | "tablet" | "desktop";

/** The first width (CSS px of the frame's viewport) that is no phone, and the first that is desktop. */
export const PHONE_BELOW = 768;
export const DESKTOP_FROM = 1024;

/** The media queries behind the modes (".98": a zoomed, fractional width just under a breakpoint stays below it). The
 *  phone query is asked first, so the tablet one needs no lower bound: a fractional width between 767.98 and 768 px is
 *  a tablet (its icon rail), never a desktop. */
export const PHONE_QUERY = `(max-width: ${PHONE_BELOW - 0.02}px)`;
export const TABLET_QUERY = `(max-width: ${DESKTOP_FROM - 0.02}px)`;

/** The mode of a viewport width, as the media queries decide it. */
export function layoutModeOf(width: number): LayoutMode {
  return width < PHONE_BELOW ? "phone" : width < DESKTOP_FROM ? "tablet" : "desktop";
}

/** What the store needs of a MediaQueryList; addListener / removeListener for WebViews older than Safari 14. */
interface QueryList {
  readonly matches: boolean;
  addEventListener?(type: "change", cb: () => void): void;
  removeEventListener?(type: "change", cb: () => void): void;
  addListener?(cb: () => void): void;
  removeListener?(cb: () => void): void;
}

export interface LayoutModeStore {
  /** The mode now (a string, so React sees the same snapshot until a query flips). */
  get(): LayoutMode;
  /** Calls `cb` whenever either query flips (a resize or rotate across a breakpoint); returns the unsubscribe. */
  subscribe(cb: () => void): () => void;
}

/** A store over the phone and tablet queries of `win`; without matchMedia it always says "desktop". */
export function layoutModeStore(win?: { matchMedia?: (q: string) => QueryList }): LayoutModeStore {
  const media = typeof win?.matchMedia === "function" ? win.matchMedia.bind(win) : undefined;
  const phone = media?.(PHONE_QUERY);
  const tablet = media?.(TABLET_QUERY);
  const on = (q: QueryList | undefined, cb: () => void) => (q?.addEventListener ? q.addEventListener("change", cb) : q?.addListener?.(cb));
  const off = (q: QueryList | undefined, cb: () => void) => (q?.removeEventListener ? q.removeEventListener("change", cb) : q?.removeListener?.(cb));
  return {
    get: () => (phone?.matches ? "phone" : tablet?.matches ? "tablet" : "desktop"),
    subscribe(cb) {
      on(phone, cb);
      on(tablet, cb);
      return () => {
        off(phone, cb);
        off(tablet, cb);
      };
    },
  };
}

let live: LayoutModeStore | undefined;
/** The page's own store, made on first use (never on the server). */
const liveStore = () => (live ??= layoutModeStore(typeof window === "undefined" ? undefined : window));
const desktop = (): LayoutMode => "desktop";

/** Forces a mode below it (unit tests render the phone layout on the server with it); null: the viewport decides. */
export const LayoutModeContext = createContext<LayoutMode | null>(null);

/** The layout mode of the viewport now; re-renders when a resize or rotate crosses 768 px or 1024 px. */
export function useLayoutMode(): LayoutMode {
  const forced = useContext(LayoutModeContext);
  const store = liveStore();
  const mode = useSyncExternalStore(store.subscribe, store.get, desktop);
  return forced ?? mode;
}

/** True below 768 px: the phone layout. */
export const useIsPhone = () => useLayoutMode() === "phone";
