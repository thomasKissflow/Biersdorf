// The data console's routes, under /data (layout: DataShell), and the console as a whole app for a user who holds
// Admin / Developer and no CIQ persona (it is their landing page instead of the no-access page; AppLiveApp).
//   /data              Overview: every process and form with its count (each list read once a session; Refresh)
//   /data/flow/:key    One flow's items, 25 a page: search, status filter (processes), Show steps (processes: the
//                      current page's), checkboxes + Delete selected (one at a time, paced, Stop); the item drawer
//                      (view, edit, delete that item alone; a form also creates rows)
//   /data/import       Import a .json or .xlsx file into a form
//   /data/orphans      Rows and items that name a deleted case, grouped by it; each group deleted with typed confirmation
import { Navigate, Route, Routes, useParams } from "react-router-dom";
import type { AppClient, Identity } from "../types";
import type { RateSignal } from "./rateSignal";
import { DATA_PATH } from "./common";
import { DataConsoleProvider } from "./ConsoleContext";
import { DataOverview } from "./DataOverview";
import { DataShell } from "./DataShell";
import { FlowTable } from "./FlowTable";
import { ImportPage } from "./ImportPage";
import { OrphansPage } from "./Orphans";

/** One FlowTable per flow: switching flow remounts it, so no state (rows, steps, open item) carries over. */
function FlowTableRoute() {
  const { key } = useParams();
  return <FlowTable key={key} />;
}

export function dataConsoleRoutes() {
  return (
    <Route path={DATA_PATH} element={<DataShell />}>
      <Route index element={<DataOverview />} />
      <Route path="flow/:key" element={<FlowTableRoute />} />
      <Route path="import" element={<ImportPage />} />
      <Route path="orphans" element={<OrphansPage />} />
      <Route path="*" element={<Navigate to={DATA_PATH} replace />} />
    </Route>
  );
}

/** Admin / Developer without a CIQ persona: the console is the whole app; any other path leads to it. */
export function DataConsoleOnly({ client, rate, identity }: { client: AppClient; rate?: RateSignal; identity: Identity }) {
  return (
    <DataConsoleProvider client={client} rate={rate} identity={identity} besideCiq={false}>
      <Routes>
        {dataConsoleRoutes()}
        <Route path="*" element={<Navigate to={DATA_PATH} replace />} />
      </Routes>
    </DataConsoleProvider>
  );
}
