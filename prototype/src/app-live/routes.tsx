// The internal pages of the live app, as child routes of the layout route that renders AppLiveShell. Paths and screens
// mirror the prototype's internal routes (src/App.tsx AppRoutes, InternalShell children) unchanged, so the screens'
// own links (caseLink, refLink, …) keep working; plus /diagnostics. No supplier routes: suppliers work in the portal.
import { Navigate, Route } from "react-router-dom";
import { AdminGate } from "@/layout/Gates";
import { OwnershipMatrix, ReminderSettings, RuleTable, TemplateManager } from "@/features/admin";
import { AuditTrail, Reports } from "@/features/reports";
import { ReviewQueue, ReviewWorkspace } from "@/features/review";
import { CaseDetail, CaseList, NewCase, RmmDashboard } from "@/features/rmm";
import { SupplierDetail, SupplierList } from "@/features/suppliers";
import { useStore } from "@/store/store";
import { Diagnostics } from "./Diagnostics";

/** Open to every role whatever its menu (the shell lets it through routeAllowed). */
export const DIAGNOSTICS_PATH = "/diagnostics";

/** "/" and unknown paths: the acting persona's landing page. */
export function Home() {
  const { persona } = useStore();
  return <Navigate to={persona.landing} replace />;
}

export function internalChildRoutes() {
  return (
    <>
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
      <Route path="/admin/rules" element={<AdminGate><RuleTable /></AdminGate>} />
      <Route path="/admin/templates" element={<AdminGate><TemplateManager /></AdminGate>} />
      <Route path="/admin/ownership" element={<AdminGate><OwnershipMatrix /></AdminGate>} />
      <Route path="/admin/notifications" element={<AdminGate><ReminderSettings /></AdminGate>} />
      <Route path={DIAGNOSTICS_PATH} element={<Diagnostics />} />
    </>
  );
}
