import { X } from "lucide-react";
import { useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { useIsPhone } from "@/shell/useLayoutMode";
import { useStore } from "@/store/store";
import { IconButton, cx } from "./primitives";

/** Escape closes only the top-most overlay (the last one in the page), never the drawer behind a form. */
function useEscape(open: boolean, onClose: () => void, root: RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const all = document.querySelectorAll("[data-overlay]");
      if (!root.current || all[all.length - 1] !== root.current) return;
      e.stopImmediatePropagation();
      onClose();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose, root]);
}

// An open drawer publishes its width so toasts can sit beside it instead of over its header.
// An open modal publishes its width so toasts can drop beneath the modal layer when they would cover it.
let openDrawerWidth = 0;
let openModalWidth = 0;
const drawerListeners = new Set<() => void>();
function setOpenDrawerWidth(w: number) {
  openDrawerWidth = w;
  drawerListeners.forEach((l) => l());
}
function setOpenModalWidth(w: number) {
  openModalWidth = w;
  drawerListeners.forEach((l) => l());
}
function subscribeDrawer(l: () => void) {
  drawerListeners.add(l);
  return () => {
    drawerListeners.delete(l);
  };
}

/** How an overlay is laid out: a centred dialog, a side drawer (big screens), or a phone's sheet. */
type Layout = "modal" | "drawer" | "full" | "bottom";

/**
 * The one frame behind Modal, Drawer and Sheet. Its element tree is the same in every layout (only classes and
 * attributes change), so when a rotate or resize turns a drawer or a wide modal into a phone's sheet, or back, its body
 * is not remounted: what the user typed, picked or is sending stays (Thomas, 30 Oct). Focus moves only when it opens.
 */
function Overlay({
  layout,
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  wide,
  width = 520,
  bodyClassName,
  sheetBodyClassName,
  sheetFooterClassName,
  dismissible = true,
  autoFocus,
  as: Panel = "div",
  testId,
}: {
  layout: Layout;
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
  width?: number;
  bodyClassName?: string;
  sheetBodyClassName?: string;
  sheetFooterClassName?: string;
  dismissible?: boolean;
  autoFocus?: boolean;
  /** The panel's element; the same in every layout (a drawer's <aside> stays one as a sheet). */
  as?: "div" | "aside";
  testId?: string;
}) {
  const root = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const sheet = layout === "full" || layout === "bottom";
  useEscape(open, onClose, root);
  // read when it opens: a later switch of layout moves no focus
  const at = useRef({ layout, autoFocus });
  at.current = { layout, autoFocus };
  useEffect(() => {
    if (!open) return;
    const { layout: l, autoFocus: auto } = at.current;
    // a dialog: the first field of the body, not the header's close button
    if (l === "modal") return void (body.current?.querySelector<HTMLElement>("input,textarea,select,button") ?? panel.current?.querySelector<HTMLElement>("button"))?.focus();
    if (l === "drawer" || !auto) return;
    // a sheet: its first link or field, and back to what had the focus (the button that opened it) once it closes
    const was = document.activeElement as HTMLElement | null;
    (body.current?.querySelector<HTMLElement>("a[href],input,textarea,select,button") ?? panel.current?.querySelector<HTMLElement>("button"))?.focus();
    return () => was?.focus?.();
  }, [open]);
  useEffect(() => {
    if (!open) return;
    // A modal publishes its width so toasts can drop beneath the modal layer when they would cover it; a drawer (and a
    // full sheet, a full-width drawer) its width so toasts can sit beside it or keep clear of it.
    if (layout === "modal") {
      setOpenModalWidth(wide ? 768 : 512);
      return () => setOpenModalWidth(0);
    }
    if (layout === "bottom") return;
    setOpenDrawerWidth(layout === "drawer" ? width : window.innerWidth);
    return () => setOpenDrawerWidth(0);
  }, [open, layout, wide, width]);
  if (!open) return null;
  const full = layout === "full";
  const rootCls =
    layout === "modal"
      ? "fixed inset-0 z-50 flex items-start justify-center bg-[oklch(0.2_0.03_262/0.45)] p-3 sm:p-4 sm:pt-[8vh]"
      : layout === "drawer"
        ? "fixed inset-0 z-50 flex justify-end bg-[oklch(0.2_0.03_262/0.35)]"
        : cx("fixed inset-0 z-50 flex", full ? "flex-col bg-surface" : "items-end bg-[oklch(0.2_0.03_262/0.45)]");
  const panelCls =
    layout === "modal"
      ? cx("flex max-h-full w-full flex-col rounded-xl border border-line bg-surface shadow-pop", wide ? "max-w-3xl" : "max-w-lg")
      : layout === "drawer"
        ? "flex h-full max-w-full flex-col border-l border-line bg-surface shadow-pop"
        : cx("flex w-full flex-col bg-surface", full ? "h-full" : "max-h-[85dvh] rounded-t-2xl border-t border-line shadow-pop");
  const headCls = sheet
    ? cx("flex shrink-0 items-center justify-between gap-2 border-b border-line py-2 pr-[max(0.5rem,env(safe-area-inset-right))] pl-[max(1rem,env(safe-area-inset-left))]", full && "pt-[max(0.5rem,env(safe-area-inset-top))]")
    : "flex shrink-0 items-start justify-between gap-3 border-b border-line px-5 py-4";
  const bodyCls = sheet
    ? cx("min-h-0 flex-1", bodyClassName ?? "overflow-y-auto overscroll-contain px-4 py-4 scrollbar-thin", sheetBodyClassName, !footer && "pb-[max(1rem,env(safe-area-inset-bottom))]")
    : layout === "drawer"
      ? cx("min-h-0 flex-1", bodyClassName ?? "overflow-y-auto px-5 py-4 scrollbar-thin")
      : "min-h-0 flex-1 overflow-y-auto px-5 py-4 scrollbar-thin";
  const footCls = sheet
    ? cx("flex shrink-0 gap-2 border-t border-line bg-surface-2 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]", sheetFooterClassName ?? "flex-wrap justify-end")
    : cx("flex shrink-0 flex-wrap justify-end gap-2", layout === "modal" && "rounded-b-xl", "border-t border-line bg-surface-2 px-5 py-3");
  return createPortal(
    <div ref={root} data-overlay="" className={rootCls} onMouseDown={(e) => !full && dismissible && e.target === e.currentTarget && onClose()}>
      {/* Header and footer stay put; only the body scrolls, so the actions are always visible. */}
      <Panel
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={sheet ? titleId : undefined}
        data-testid={testId}
        data-sheet={sheet ? layout : undefined}
        style={layout === "drawer" ? { width } : undefined}
        className={panelCls}
      >
        <div className={headCls}>
          <div className={sheet ? "min-w-0 py-1.5" : "min-w-0"}>
            <h2 id={sheet ? titleId : undefined} className="text-base font-semibold text-ink">
              {title}
            </h2>
            {subtitle && <p className="mt-0.5 text-[13px] text-ink-3">{subtitle}</p>}
          </div>
          <IconButton label="Close" onClick={onClose} data-testid={sheet ? "sheet-close" : undefined} className={sheet ? "h-11 w-11 shrink-0" : "-mr-1.5 shrink-0"}>
            <X size={sheet ? 18 : 16} />
          </IconButton>
        </div>
        <div ref={body} className={bodyCls}>
          {children}
        </div>
        {footer && (
          <div data-sheet-footer={sheet ? "" : undefined} className={footCls}>
            {footer}
          </div>
        )}
      </Panel>
    </div>,
    document.body,
  );
}

/** `dismissible={false}` (e.g. a form with unsaved input): a click on the dimmed page does not close it; Cancel, the
 *  close button and Escape still do. On a phone (< 768 px, Thomas 30 Oct) a `wide` modal (or one with `phoneSheet`) is
 *  a full-height Sheet, `phoneBodyClassName` / `phoneFooterClassName` added to its body / replacing its footer row's
 *  layout; a narrow one stays a centred dialog. A rotate across 768 px keeps its content (Overlay). */
export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  wide,
  phoneSheet = !!wide,
  phoneBodyClassName,
  phoneFooterClassName,
  dismissible = true,
  "data-testid": testId,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
  phoneSheet?: boolean;
  phoneBodyClassName?: string;
  phoneFooterClassName?: string;
  dismissible?: boolean;
  "data-testid"?: string;
}) {
  const sheet = useIsPhone() && phoneSheet;
  return (
    <Overlay
      layout={sheet ? "full" : "modal"}
      open={open}
      onClose={onClose}
      title={title}
      subtitle={subtitle}
      footer={footer}
      wide={wide}
      sheetBodyClassName={phoneBodyClassName}
      sheetFooterClassName={phoneFooterClassName}
      dismissible={dismissible}
      autoFocus
      testId={testId}
    >
      {children}
    </Overlay>
  );
}

/** `bodyClassName` replaces the body's default padding and scrolling (e.g. a two-pane body that scrolls per pane).
 *  On a phone (< 768 px, Thomas 30 Oct) it is a full-height Sheet with the same title, body and footer; a rotate across
 *  768 px keeps its content (Overlay). */
export function Drawer({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  width = 520,
  bodyClassName,
  dismissible = true,
  "data-testid": testId,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
  bodyClassName?: string;
  /** False (e.g. a form with unsaved input): a click on the dimmed page does not close it. */
  dismissible?: boolean;
  "data-testid"?: string;
}) {
  const sheet = useIsPhone();
  return (
    <Overlay layout={sheet ? "full" : "drawer"} as="aside" open={open} onClose={onClose} title={title} subtitle={subtitle} footer={footer} width={width} bodyClassName={bodyClassName} dismissible={dismissible} testId={testId}>
      {children}
    </Overlay>
  );
}

/**
 * A sheet for phones (Thomas, 30 Oct): Drawer and a wide Modal become one below 768 px; the phone's More menu is one.
 * `variant="full"` (default) covers the whole screen: the title row with Close stays at the top, the footer (its
 * actions) at the bottom, only the body scrolls. `variant="bottom"` rises from the bottom over the dimmed page, as tall
 * as its content up to 85% of the screen. Both keep clear of the notch and the home bar (env(safe-area-inset-*)), Close
 * is a 44 px target, Escape closes the top-most overlay only, as Modal and Drawer. `dismissible={false}`: a tap on the
 * dimmed page does not close a bottom sheet. `autoFocus`: the body's first link or field (else Close) takes the focus on
 * open, and the focus goes back where it was on close.
 * Test hook: `data-testid` on the dialog (as Modal and Drawer), `sheet-close` on Close.
 */
export function Sheet({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  variant = "full",
  bodyClassName,
  dismissible = true,
  autoFocus,
  "data-testid": testId,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  variant?: "full" | "bottom";
  /** Replaces the body's default padding and scrolling, as Drawer's. */
  bodyClassName?: string;
  dismissible?: boolean;
  autoFocus?: boolean;
  "data-testid"?: string;
}) {
  return (
    <Overlay layout={variant} open={open} onClose={onClose} title={title} subtitle={subtitle} footer={footer} bodyClassName={bodyClassName} dismissible={dismissible} autoFocus={autoFocus} testId={testId}>
      {children}
    </Overlay>
  );
}

/** Test hooks: the tab list gets `data-testid`, each tab `<data-testid>-<value>` (default `tab-<value>`). */
export function Tabs<T extends string>({ tabs, value, onChange, className, "data-testid": testId }: { tabs: { value: T; label: ReactNode; count?: number }[]; value: T; onChange: (v: T) => void; className?: string; "data-testid"?: string }) {
  // a phone: each tab a 44 px target, and a row cut off at the screen's edge fades out there, so the tabs beyond it
  // are seen to exist
  const phone = useIsPhone();
  const list = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState<{ left: boolean; right: boolean }>({ left: false, right: false });
  useEffect(() => {
    const el = list.current;
    const set = (left: boolean, right: boolean) => setMore((m) => (m.left === left && m.right === right ? m : { left, right }));
    if (!phone || !el) return set(false, false);
    const check = () => set(el.scrollLeft > 1, el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
    check();
    el.addEventListener("scroll", check, { passive: true });
    const ro = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(check);
    ro?.observe(el);
    return () => {
      el.removeEventListener("scroll", check);
      ro?.disconnect();
    };
  }, [phone, tabs.length]);
  const fade = phone && (more.left || more.right) ? `linear-gradient(to right, ${more.left ? "transparent, #000 24px" : "#000"}, ${more.right ? "#000 calc(100% - 32px), transparent" : "#000"})` : undefined;
  return (
    // The baseline is an inset shadow, not a border: a -mb-px overlap inside a scrolling row gets clipped
    // and adds a 1px vertical scrollbar on Windows.
    <div
      ref={list}
      role="tablist"
      data-testid={testId}
      data-more={fade ? [more.left && "left", more.right && "right"].filter(Boolean).join(" ") : undefined}
      style={fade ? { maskImage: fade, WebkitMaskImage: fade } : undefined}
      className={cx("flex gap-1 overflow-x-auto shadow-[inset_0_-1px_0_var(--line)] scrollbar-thin", className)}
    >
      {tabs.map((t) => (
        <button
          key={t.value}
          role="tab"
          aria-selected={t.value === value}
          data-testid={`${testId ?? "tab"}-${t.value}`}
          onClick={() => onChange(t.value)}
          className={cx("inline-flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-[13.5px] whitespace-nowrap transition-colors", phone && "min-h-11", t.value === value ? "border-brand font-semibold text-ink" : "border-transparent text-ink-3 hover:text-ink")}
        >
          {t.label}
          {t.count !== undefined && <span className={cx("rounded-full px-1.5 text-[11px]", t.value === value ? "bg-brand-soft text-brand" : "bg-surface-3 text-ink-3")}>{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

const toneCls = { success: "bg-ok", info: "bg-info", warning: "bg-warn", danger: "bg-bad" } as const;

function ToastItem({ id, tone, text, onDone }: { id: string; tone: keyof typeof toneCls; text: string; onDone: (id: string) => void }) {
  // onDone changes identity on every store update; keeping it in a ref stops each edit from restarting the timer.
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    // Long messages (e.g. "RS-2026.3 + v3 published. New cases use it; …") stay long enough to read: about 0.3 s per word.
    const words = text.trim().split(/\s+/).length;
    const t = setTimeout(() => done.current(id), Math.min(8000, Math.max(tone === "danger" ? 6000 : 3500, words * 300)));
    return () => clearTimeout(t);
  }, [id, tone, text]);
  return (
    <div className="pointer-events-auto flex items-start gap-3 rounded-lg border border-line bg-surface px-4 py-3 text-[13px] text-ink shadow-pop">
      <span className={cx("mt-1.5 h-2 w-2 shrink-0 rounded-full", toneCls[tone])} />
      <span className="flex-1">{text}</span>
      <button className="text-ink-3 hover:text-ink" aria-label="Dismiss" onClick={() => onDone(id)}>
        <X size={14} />
      </button>
    </div>
  );
}

const TOAST_W = 360;

/** A phone's toasts sit at the bottom, just above what is fixed there: an open full sheet's footer (else its bottom
 *  edge), or the tab bar and the page's sticky action bar right above it. The edge's y (px from the top). */
function phoneToastEdge(): number {
  const sheets = document.querySelectorAll<HTMLElement>('[data-sheet="full"]');
  const sheet = sheets[sheets.length - 1];
  if (sheet) {
    const foot = sheet.querySelector<HTMLElement>("[data-sheet-footer]");
    return (foot ?? sheet).getBoundingClientRect()[foot ? "top" : "bottom"];
  }
  let edge = document.querySelector('[data-testid="tab-bar"]')?.getBoundingClientRect().top ?? window.innerHeight;
  // a sticky action bar resting on the tab bar (not one left static further up the page)
  document.querySelectorAll<HTMLElement>("[data-sticky-actions]").forEach((b) => {
    const r = b.getBoundingClientRect();
    if (r.height > 0 && r.top < edge && r.bottom >= edge - 2) edge = r.top;
  });
  return edge;
}

/** Top-right, just below whichever shell header is showing; beside an open drawer when there is room. On a phone
 *  (Thomas, 30 Oct) at the bottom, above the tab bar, the sticky action bar or an open sheet's footer, so they never
 *  cover a sheet's title and its Close or the content under the header. */
export function Toaster() {
  const { state, dismissToast } = useStore();
  const drawerW = useSyncExternalStore(subscribeDrawer, () => openDrawerWidth);
  const modalW = useSyncExternalStore(subscribeDrawer, () => openModalWidth);
  const phone = useIsPhone();
  const [pos, setPos] = useState({ top: 68, vw: typeof window === "undefined" ? 1440 : window.innerWidth });
  const [bottom, setBottom] = useState(72);
  const count = state.toasts.length;
  // a phone measures again when a sheet opens or closes (its footer moves the edge)
  const sheetKey = phone ? drawerW : 0;
  useLayoutEffect(() => {
    if (!count) return;
    const measure = () => {
      if (phone) setBottom(Math.round(window.innerHeight - phoneToastEdge() + 8));
      const header = document.querySelector("[data-app-header]");
      // no header (the live UIs in production): 12 px from the top
      setPos({ top: Math.round((header ? header.getBoundingClientRect().bottom : 0) + 12), vw: window.innerWidth });
    };
    measure();
    window.addEventListener("resize", measure);
    // a phone: the sticky action bar grows (its blockers opened) or comes to rest on the tab bar as the page scrolls
    const ro = phone && typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : undefined;
    if (ro) document.querySelectorAll("[data-sticky-actions]").forEach((b) => ro.observe(b));
    if (phone) window.addEventListener("scroll", measure, { passive: true });
    return () => {
      window.removeEventListener("resize", measure);
      ro?.disconnect();
      if (phone) window.removeEventListener("scroll", measure);
    };
  }, [count, phone, sheetKey]);
  // A centred modal that would reach under the top-right toasts (phones, wide modals): toasts slip beneath the
  // modal layer instead of covering its fields.
  const underModal = modalW > 0 && pos.vw - 16 - TOAST_W < (pos.vw + modalW) / 2 + 16;
  if (phone)
    return (
      <div style={{ bottom }} data-testid="toaster" data-place="bottom" className={cx("pointer-events-none fixed inset-x-2 flex flex-col gap-2", underModal ? "z-40" : "z-[60]")} aria-live="polite">
        {state.toasts.map((t) => (
          <ToastItem key={t.id} id={t.id} tone={t.tone} text={t.text} onDone={dismissToast} />
        ))}
      </div>
    );
  const beside = drawerW > 0 && pos.vw >= drawerW + TOAST_W + 48;
  // A full-width drawer (a tablet): sit over its title row, the one part that is never being worked in.
  const overDrawer = drawerW > 0 && !beside;
  return (
    <div
      style={{ top: overDrawer ? 8 : pos.top, right: beside ? drawerW + 16 : overDrawer ? 8 : 16, width: TOAST_W }}
      className={cx("pointer-events-none fixed flex flex-col gap-2", underModal ? "z-40" : "z-[60]", overDrawer ? "max-w-[calc(100vw-1rem)]" : "max-w-[calc(100vw-2rem)]")}
      aria-live="polite"
    >
      {state.toasts.map((t) => (
        <ToastItem key={t.id} id={t.id} tone={t.tone} text={t.text} onDone={dismissToast} />
      ))}
    </div>
  );
}
