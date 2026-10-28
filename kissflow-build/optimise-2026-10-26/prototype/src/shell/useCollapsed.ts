import { useCallback, useState } from "react";

/** The left pane's collapsed state: the viewer's last choice (guarded localStorage under `key`), else collapsed on a
 *  narrow window. A per-viewer convenience only. */
export function useCollapsed(key: string): [boolean, () => void] {
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      const v = localStorage.getItem(key);
      if (v === "1" || v === "0") return v === "1";
    } catch {
      /* storage blocked in the Kissflow frame: fall through */
    }
    return typeof window !== "undefined" && window.innerWidth < 1024;
  });
  const toggle = useCallback(() => {
    setCollapsed((c) => {
      try {
        localStorage.setItem(key, c ? "0" : "1");
      } catch {
        /* the choice lasts for this page only */
      }
      return !c;
    });
  }, [key]);
  return [collapsed, toggle];
}
