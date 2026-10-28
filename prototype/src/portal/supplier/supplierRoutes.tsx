// The supplier pages, as child routes of a layout route that renders PortalSupplierShell (live or demo).
// Paths stay "/portal/…" so the prototype screens' own links (caseLink, refLink) keep working unchanged.
// Plan v5: the supplier's tasks are merged into My requests, as in the prototype (spec §3); the earlier Tasks, Notices
// and Corrections pages are gone (notices go by e-mail; "Report a change" is on the released request).
import { Navigate, Route } from "react-router-dom";
import { SupplierCase, SupplierHelp, SupplierHome } from "@/features/supplier";
import { HelpLive } from "./HelpLive";

export function supplierChildRoutes(demo: boolean) {
  return (
    <>
      <Route path="/portal" element={<SupplierHome />} />
      <Route path="/portal/case/:id" element={<SupplierCase />} />
      <Route path="/portal/help" element={demo ? <SupplierHelp /> : <HelpLive />} />
      <Route path="/portal/*" element={<Navigate to="/portal" replace />} />
    </>
  );
}
