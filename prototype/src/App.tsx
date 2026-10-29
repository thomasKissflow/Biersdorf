import { useEffect } from "react";
import { HashRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { ProductionContext, Toaster } from "@/components/ui";
import { DemoNotesProvider } from "@/layout/demoNotes";
import { AdminGate, ConfigViewGate } from "@/layout/Gates";
import { InternalShell, SupplierShell } from "@/layout/Shells";
import { StoreProvider, useStore } from "@/store/store";
import { OwnershipMatrix, ReminderSettings, RuleTable, TemplateManager } from "@/features/admin";
import { AuditTrail, Reports } from "@/features/reports";
import { ReviewQueue, ReviewWorkspace } from "@/features/review";
import { CaseDetail, CaseList, NewCase, RmmDashboard } from "@/features/rmm";
import { SupplierCase, SupplierHelp, SupplierHome } from "@/features/supplier";
import { SupplierDetail, SupplierList } from "@/features/suppliers";
import { Understanding } from "@/features/understanding";
import { CallModeContext } from "@/features/understanding/callMode";

function Home() {
  const { persona } = useStore();
  return <Navigate to={persona.landing} replace />;
}

/** Keeps each persona on its own side: suppliers never reach internal routes and vice versa. */
function SideGuard({ side, children }: { side: "internal" | "supplier"; children: React.ReactNode }) {
  const { persona } = useStore();
  const loc = useLocation();
  if (persona.side !== side) return <Navigate to={persona.landing} replace state={{ from: loc.pathname }} />;
  return <>{children}</>;
}

/** The understanding page on its own, for the client call: no top bar or side navigation, nothing that leads into
 *  the rest of the prototype, no prototype wording (call mode). Open at #/understanding/call. */
function CallUnderstanding() {
  // the browser tab is visible when the screen is shared
  useEffect(() => {
    const before = document.title;
    document.title = "CIQ · Our understanding · Beiersdorf";
    return () => {
      document.title = before;
    };
  }, []);
  return (
    <CallModeContext.Provider value={true}>
      <ProductionContext.Provider value={true}>
        <main className="mx-auto w-full max-w-[1400px] px-4 py-6 lg:px-8 lg:py-8">
          <Understanding />
        </main>
      </ProductionContext.Provider>
    </CallModeContext.Provider>
  );
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/understanding/call" element={<CallUnderstanding />} />
      <Route
        element={
          <SideGuard side="internal">
            <InternalShell />
          </SideGuard>
        }
      >
        <Route path="/rmm" element={<RmmDashboard />} />
        <Route path="/cases" element={<CaseList />} />
        <Route path="/cases/new" element={<NewCase />} />
        <Route path="/cases/:id" element={<CaseDetail />} />
        <Route path="/review" element={<ReviewQueue />} />
        <Route path="/review/:caseId" element={<ReviewWorkspace />} />
        <Route path="/suppliers" element={<SupplierList />} />
        <Route path="/suppliers/:id" element={<SupplierDetail />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/audit" element={<AuditTrail />} />
        <Route path="/admin/rules" element={<ConfigViewGate><RuleTable /></ConfigViewGate>} />
        <Route path="/admin/templates" element={<ConfigViewGate><TemplateManager /></ConfigViewGate>} />
        <Route path="/admin/ownership" element={<ConfigViewGate><OwnershipMatrix /></ConfigViewGate>} />
        <Route path="/admin/notifications" element={<AdminGate><ReminderSettings /></AdminGate>} />
      </Route>
      <Route
        element={
          <SideGuard side="supplier">
            <SupplierShell />
          </SideGuard>
        }
      >
        <Route path="/portal" element={<SupplierHome />} />
        {/* Tasks are merged into My requests; the live portal keeps its own Tasks page. */}
        <Route path="/portal/tasks" element={<Navigate to="/portal" replace />} />
        <Route path="/portal/help" element={<SupplierHelp />} />
        <Route path="/portal/case/:id" element={<SupplierCase />} />
      </Route>
      <Route path="*" element={<Home />} />
    </Routes>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <DemoNotesProvider>
        <HashRouter>
          <AppRoutes />
          <Toaster />
        </HashRouter>
      </DemoNotesProvider>
    </StoreProvider>
  );
}
