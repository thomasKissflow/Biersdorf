// Toasts, bound to the WorkbenchData provider (not the prototype store). Visuals copied from the kit's Toaster.
// A write's "ok" toast is raised only after the read-back (WriteOutcome), never before.
import { X } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { cx } from "@/components/ui/primitives";
import { useWorkbenchContext, type ToastTone } from "../data/hooks";
import { useOverlayWidths } from "./overlay";

const toneCls: Record<ToastTone, string> = { success: "bg-ok", info: "bg-info", warning: "bg-warn", danger: "bg-bad" };

function ToastItem({ id, tone, text, onDone }: { id: string; tone: ToastTone; text: string; onDone: (id: string) => void }) {
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    const t = setTimeout(() => done.current(id), tone === "danger" ? 6000 : 3500);
    return () => clearTimeout(t);
  }, [id, tone]);
  return (
    <div className="pointer-events-auto flex items-start gap-3 rounded-lg border border-line bg-surface px-4 py-3 text-[13px] text-ink shadow-pop" data-testid="wb-toast">
      <span className={cx("mt-1.5 h-2 w-2 shrink-0 rounded-full", toneCls[tone])} />
      <span className="flex-1">{text}</span>
      <button className="text-ink-3 hover:text-ink" aria-label="Dismiss" onClick={() => onDone(id)}>
        <X size={14} />
      </button>
    </div>
  );
}

const TOAST_W = 360;

export function Toaster() {
  const { toasts, dismissToast } = useWorkbenchContext();
  const { drawerW, modalW } = useOverlayWidths();
  const [pos, setPos] = useState({ top: 68, vw: typeof window === "undefined" ? 1440 : window.innerWidth });
  const count = toasts.length;
  useLayoutEffect(() => {
    if (!count) return;
    const measure = () => {
      // the slim menu bar exists below lg only (from lg it is hidden: bottom 0); 28 px clears the View-as tab
      const header = document.querySelector("[data-app-header]");
      const bottom = header?.getBoundingClientRect().bottom ?? 0;
      setPos({ top: Math.round(Math.max(bottom, 28) + 12), vw: window.innerWidth });
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [count]);
  const beside = drawerW > 0 && pos.vw >= drawerW + TOAST_W + 48;
  const overDrawer = drawerW > 0 && !beside;
  const underModal = modalW > 0 && pos.vw - 16 - TOAST_W < (pos.vw + modalW) / 2 + 16;
  return (
    <div
      style={{ top: overDrawer ? 8 : pos.top, right: beside ? drawerW + 16 : overDrawer ? 8 : 16, width: TOAST_W }}
      className={cx("pointer-events-none fixed flex flex-col gap-2", underModal ? "z-40" : "z-[60]", overDrawer ? "max-w-[calc(100vw-1rem)]" : "max-w-[calc(100vw-2rem)]")}
      aria-live="polite"
    >
      {toasts.map((t) => (
        <ToastItem key={t.id} id={t.id} tone={t.tone} text={t.text} onDone={dismissToast} />
      ))}
    </div>
  );
}
