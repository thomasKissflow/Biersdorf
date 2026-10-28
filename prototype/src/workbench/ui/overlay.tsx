// Modal, Drawer and Tabs, COPIED from src/components/ui/overlay.tsx (WB-2): that file imports the prototype store
// (@/store/store), so the Workbench must not import it. The toast layer lives in ./Toaster.tsx, bound to the
// WorkbenchData provider instead of the prototype store. Open drawers/modals publish their width for the toasts.
import { X } from "lucide-react";
import { useEffect, useRef, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { IconButton, cx } from "@/components/ui/primitives";

function useEscape(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);
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

export function Modal({ open, onClose, title, subtitle, children, footer, wide }: { open: boolean; onClose: () => void; title: ReactNode; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  useEscape(open, onClose);
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
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-[oklch(0.2_0.03_262/0.45)] p-3 sm:p-4 sm:pt-[8vh]" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      {/* Header and footer stay put; only the body scrolls, so the actions are always visible. */}
      <div ref={ref} role="dialog" aria-modal="true" className={cx("flex max-h-full w-full flex-col rounded-xl border border-line bg-surface shadow-pop", wide ? "max-w-3xl" : "max-w-lg")}>
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

export function Drawer({ open, onClose, title, subtitle, children, footer, width = 520 }: { open: boolean; onClose: () => void; title: ReactNode; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode; width?: number }) {
  useEscape(open, onClose);
  useEffect(() => {
    if (!open) return;
    setOpenDrawerWidth(width);
    return () => setOpenDrawerWidth(0);
  }, [open, width]);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end bg-[oklch(0.2_0.03_262/0.35)]" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside role="dialog" aria-modal="true" style={{ width }} className="flex h-full max-w-full flex-col border-l border-line bg-surface shadow-pop">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-ink">{title}</h2>
            {subtitle && <p className="mt-0.5 text-[13px] text-ink-3">{subtitle}</p>}
          </div>
          <IconButton label="Close" onClick={onClose} className="-mr-1.5 shrink-0">
            <X size={16} />
          </IconButton>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 scrollbar-thin">{children}</div>
        {footer && <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-line bg-surface-2 px-5 py-3">{footer}</div>}
      </aside>
    </div>,
    document.body,
  );
}

export function Tabs<T extends string>({ tabs, value, onChange, className }: { tabs: { value: T; label: ReactNode; count?: number }[]; value: T; onChange: (v: T) => void; className?: string }) {
  return (
    // The baseline is an inset shadow, not a border: a -mb-px overlap inside a scrolling row gets clipped
    // and adds a 1px vertical scrollbar on Windows.
    <div role="tablist" className={cx("flex gap-1 overflow-x-auto shadow-[inset_0_-1px_0_var(--line)] scrollbar-thin", className)}>
      {tabs.map((t) => (
        <button
          key={t.value}
          role="tab"
          aria-selected={t.value === value}
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

/** Width of the open drawer / modal (0 when none), for the Workbench toaster. */
export function useOverlayWidths(): { drawerW: number; modalW: number } {
  const drawerW = useSyncExternalStore(subscribeDrawer, () => openDrawerWidth, () => 0);
  const modalW = useSyncExternalStore(subscribeDrawer, () => openModalWidth, () => 0);
  return { drawerW, modalW };
}
