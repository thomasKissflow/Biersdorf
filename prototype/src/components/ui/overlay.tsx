import { X } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
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

/** `dismissible={false}` (e.g. a form with unsaved input): a click on the dimmed page does not close it; Cancel, the
 *  close button and Escape still do. */
export function Modal({ open, onClose, title, subtitle, children, footer, wide, dismissible = true, "data-testid": testId }: { open: boolean; onClose: () => void; title: ReactNode; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode; wide?: boolean; dismissible?: boolean; "data-testid"?: string }) {
  const root = useRef<HTMLDivElement>(null);
  useEscape(open, onClose, root);
  const ref = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // First field of the body, not the header's close button.
    if (open) (body.current?.querySelector<HTMLElement>("input,textarea,select,button") ?? ref.current?.querySelector<HTMLElement>("button"))?.focus();
  }, [open]);
  useEffect(() => {
    if (!open) return;
    setOpenModalWidth(wide ? 768 : 512);
    return () => setOpenModalWidth(0);
  }, [open, wide]);
  if (!open) return null;
  return createPortal(
    <div ref={root} data-overlay="" className="fixed inset-0 z-50 flex items-start justify-center bg-[oklch(0.2_0.03_262/0.45)] p-3 sm:p-4 sm:pt-[8vh]" onMouseDown={(e) => dismissible && e.target === e.currentTarget && onClose()}>
      {/* Header and footer stay put; only the body scrolls, so the actions are always visible. */}
      <div ref={ref} role="dialog" aria-modal="true" data-testid={testId} className={cx("flex max-h-full w-full flex-col rounded-xl border border-line bg-surface shadow-pop", wide ? "max-w-3xl" : "max-w-lg")}>
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-ink">{title}</h2>
            {subtitle && <p className="mt-0.5 text-[13px] text-ink-3">{subtitle}</p>}
          </div>
          <IconButton label="Close" onClick={onClose} className="-mr-1.5 shrink-0">
            <X size={16} />
          </IconButton>
        </div>
        <div ref={body} className="min-h-0 flex-1 overflow-y-auto px-5 py-4 scrollbar-thin">
          {children}
        </div>
        {footer && <div className="flex shrink-0 flex-wrap justify-end gap-2 rounded-b-xl border-t border-line bg-surface-2 px-5 py-3">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

/** `bodyClassName` replaces the body's default padding and scrolling (e.g. a two-pane body that scrolls per pane). */
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
  const root = useRef<HTMLDivElement>(null);
  useEscape(open, onClose, root);
  useEffect(() => {
    if (!open) return;
    setOpenDrawerWidth(width);
    return () => setOpenDrawerWidth(0);
  }, [open, width]);
  if (!open) return null;
  return createPortal(
    <div ref={root} data-overlay="" className="fixed inset-0 z-50 flex justify-end bg-[oklch(0.2_0.03_262/0.35)]" onMouseDown={(e) => dismissible && e.target === e.currentTarget && onClose()}>
      <aside role="dialog" aria-modal="true" data-testid={testId} style={{ width }} className="flex h-full max-w-full flex-col border-l border-line bg-surface shadow-pop">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-ink">{title}</h2>
            {subtitle && <p className="mt-0.5 text-[13px] text-ink-3">{subtitle}</p>}
          </div>
          <IconButton label="Close" onClick={onClose} className="-mr-1.5 shrink-0">
            <X size={16} />
          </IconButton>
        </div>
        <div className={cx("min-h-0 flex-1", bodyClassName ?? "overflow-y-auto px-5 py-4 scrollbar-thin")}>{children}</div>
        {footer && <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-line bg-surface-2 px-5 py-3">{footer}</div>}
      </aside>
    </div>,
    document.body,
  );
}

/** Test hooks: the tab list gets `data-testid`, each tab `<data-testid>-<value>` (default `tab-<value>`). */
export function Tabs<T extends string>({ tabs, value, onChange, className, "data-testid": testId }: { tabs: { value: T; label: ReactNode; count?: number }[]; value: T; onChange: (v: T) => void; className?: string; "data-testid"?: string }) {
  return (
    // The baseline is an inset shadow, not a border: a -mb-px overlap inside a scrolling row gets clipped
    // and adds a 1px vertical scrollbar on Windows.
    <div role="tablist" data-testid={testId} className={cx("flex gap-1 overflow-x-auto shadow-[inset_0_-1px_0_var(--line)] scrollbar-thin", className)}>
      {tabs.map((t) => (
        <button
          key={t.value}
          role="tab"
          aria-selected={t.value === value}
          data-testid={`${testId ?? "tab"}-${t.value}`}
          onClick={() => onChange(t.value)}
          className={cx("inline-flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-[13.5px] whitespace-nowrap transition-colors", t.value === value ? "border-brand font-semibold text-ink" : "border-transparent text-ink-3 hover:text-ink")}
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

/** Top-right, just below whichever shell header is showing; beside an open drawer when there is room. */
export function Toaster() {
  const { state, dismissToast } = useStore();
  const drawerW = useSyncExternalStore(subscribeDrawer, () => openDrawerWidth);
  const modalW = useSyncExternalStore(subscribeDrawer, () => openModalWidth);
  const [pos, setPos] = useState({ top: 68, vw: typeof window === "undefined" ? 1440 : window.innerWidth });
  const count = state.toasts.length;
  useLayoutEffect(() => {
    if (!count) return;
    const measure = () => {
      const header = document.querySelector("[data-app-header]");
      // no header (the live UIs in production): 12 px from the top
      setPos({ top: Math.round((header ? header.getBoundingClientRect().bottom : 0) + 12), vw: window.innerWidth });
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [count]);
  const beside = drawerW > 0 && pos.vw >= drawerW + TOAST_W + 48;
  // A full-width drawer (phones): sit over its title row, the one part that is never being worked in.
  const overDrawer = drawerW > 0 && !beside;
  // A centred modal that would reach under the top-right toasts (phones, wide modals): toasts slip beneath the
  // modal layer instead of covering its fields.
  const underModal = modalW > 0 && pos.vw - 16 - TOAST_W < (pos.vw + modalW) / 2 + 16;
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
