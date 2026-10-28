// The demo menu's "Show prototype notes" switch (spec §0, §3). Off by default, so the screens look like the final app;
// on, every DemoNote and the other prototype-only hints (useProduction() === false) show again. Kept per browser as a
// viewer convenience; it never changes behaviour.

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { ProductionContext } from "@/components/ui";

const KEY = "bdf-ciq-show-notes";

interface DemoNotesApi {
  show: boolean;
  setShow(show: boolean): void;
}

const DemoNotesContext = createContext<DemoNotesApi>({ show: false, setShow: () => {} });

function readShow(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

/** Wraps the app: ProductionContext is true (notes hidden) unless the presenter switched the notes on. */
export function DemoNotesProvider({ children }: { children: ReactNode }) {
  const [show, setShowState] = useState(readShow);
  const setShow = useCallback((v: boolean) => {
    setShowState(v);
    try {
      localStorage.setItem(KEY, v ? "1" : "0");
    } catch {
      /* storage unavailable: the choice lasts until reload */
    }
  }, []);
  const api = useMemo(() => ({ show, setShow }), [show, setShow]);
  return (
    <DemoNotesContext.Provider value={api}>
      <ProductionContext.Provider value={!show}>{children}</ProductionContext.Provider>
    </DemoNotesContext.Provider>
  );
}

export const useDemoNotes = () => useContext(DemoNotesContext);
