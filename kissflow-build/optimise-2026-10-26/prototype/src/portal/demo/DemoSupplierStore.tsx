// Demo mode for the supplier screens: the prototype's own store on the rich fixture (fictional cases), pinned to the
// first supplier contact (legacy persona "supplier" → u-sup-1). Used for the Admin's "preview supplier view" and when
// the UI runs outside Kissflow. Saved under its own key, apart from the prototype app's empty-start data.
import { useEffect, type ReactNode } from "react";
import { Toaster } from "@/components/ui";
import { buildRichFixture } from "@/domain/richFixture";
import type { AppState } from "@/domain/types";
import { StoreProvider, useStore } from "@/store/store";

// v3 (plan v5, 15 Oct): the live portal runs the prototype's own flow (one CIQ, live scope), so the preview shows the
// rich fixture's requests as they are; data saved by the earlier old-flow preview (v2) is not reused.
const DEMO_KEY = "bdf-ciq-portal-demo-v3";

const previewSeed = (): AppState => buildRichFixture();

function PinSupplierPersona({ children }: { children: ReactNode }) {
  const { persona, setPersona } = useStore();
  const pinned = persona.side === "supplier";
  useEffect(() => {
    if (!pinned) setPersona("supplier");
  }, [pinned, setPersona]);
  if (!pinned) return null;
  return (
    <>
      {children}
      <Toaster />
    </>
  );
}

export function DemoSupplierStore({ children }: { children: ReactNode }) {
  return (
    <StoreProvider seed={previewSeed} storageKey={DEMO_KEY}>
      <PinSupplierPersona>{children}</PinSupplierPersona>
    </StoreProvider>
  );
}
