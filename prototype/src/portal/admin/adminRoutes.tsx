// Admin console routes, under /admin (layout: AdminShell).
import { Route, useParams } from "react-router-dom";
import { usePortalMode } from "../mode";
import { Diagnostics } from "../pages/Diagnostics";
import { AdminOverview } from "./AdminOverview";
import { AdminShell } from "./AdminShell";
import { FlowTable } from "./FlowTable";
import { HelpArticles } from "./HelpArticles";
import { RolesGrants } from "./RolesGrants";

function AdminDiagnostics() {
  const { kf, readyMs } = usePortalMode();
  return kf ? <Diagnostics kf={kf} readyMs={readyMs} /> : null;
}

/** One FlowTable per process: switching process remounts it, so no state (rows, steps, open item) carries over. */
function FlowTableRoute() {
  const { key } = useParams();
  return <FlowTable key={key} />;
}

export function adminRoutes() {
  return (
    <Route path="/admin" element={<AdminShell />}>
      <Route index element={<AdminOverview />} />
      <Route path="flow/:key" element={<FlowTableRoute />} />
      <Route path="help" element={<HelpArticles />} />
      <Route path="roles" element={<RolesGrants />} />
      <Route path="diagnostics" element={<AdminDiagnostics />} />
    </Route>
  );
}
