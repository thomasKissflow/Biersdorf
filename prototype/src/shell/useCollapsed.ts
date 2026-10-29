import { useCallback, useState } from "react";
import { useLayoutMode, type LayoutMode } from "./useLayoutMode";

/** The left pane's collapsed state: the viewer's last choice wherever they made it, else (Thomas, 30 Oct) collapsed to
 *  the icon rail on a tablet (768–1023 px) and expanded on desktop (>= 1024 px), following a rotate or resize live.
 *  Phones show no pane (PhoneChrome.tsx). */
export function paneCollapsed(stored: boolean | null, mode: LayoutMode): boolean {
  return stored ?? mode !== "desktop";
}

function readStored(key: string): boolean | null {
  try {
    const v = localStorage.getItem(key);
    if (v === "1" || v === "0") return v === "1";
  } catch {
    /* storage blocked in the Kissflow frame: no remembered choice */
  }
  return null;
}

/** The left pane's collapsed state and its toggle: the choice is kept under `key` (guarded localStorage), a per-viewer
 *  convenience only. */
export function useCollapsed(key: string): [boolean, () => void] {
  const mode = useLayoutMode();
  const [stored, setStored] = useState<boolean | null>(() => readStored(key));
  const collapsed = paneCollapsed(stored, mode);
  const toggle = useCallback(() => {
    const next = !collapsed;
    try {
      localStorage.setItem(key, next ? "1" : "0");
    } catch {
      /* the choice lasts for this page only */
    }
    setStored(next);
  }, [collapsed, key]);
  return [collapsed, toggle];
}
