// Stand-alone build of the client call view of "Our understanding" (#/understanding/call): one self-contained
// HTML file to share as a link. Same page as the call route, without the rest of the prototype around it.
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { ProductionContext, Toaster } from "@/components/ui";
import { Understanding } from "@/features/understanding";
import { CallModeContext } from "@/features/understanding/callMode";
import { StoreProvider } from "@/store/store";
import "../portal/fonts.css";
import "../styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <StoreProvider>
      <MemoryRouter>
        <CallModeContext.Provider value={true}>
          <ProductionContext.Provider value={true}>
            <main className="mx-auto w-full max-w-[1400px] px-4 py-6 lg:px-8 lg:py-8">
              <Understanding />
            </main>
          </ProductionContext.Provider>
        </CallModeContext.Provider>
        <Toaster />
      </MemoryRouter>
    </StoreProvider>
  </StrictMode>,
);
