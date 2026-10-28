// The route registry (§12.1): every features/*/index.ts exports `routes` and `navItems`; T0 pages add Home,
// Diagnostics and the TaskRouter. All live under the shell layout route.
import type { RouteObject } from "react-router-dom";
import * as admin from "../features/admin";
import * as adminParity from "../features/admin-parity";
import * as approver from "../features/approver";
import * as assess from "../features/assess";
import * as audit from "../features/audit";
import * as caseF from "../features/case";
import * as cr from "../features/cr";
import * as dashboard from "../features/dashboard";
import * as informed from "../features/informed";
import * as masters from "../features/masters";
import * as notes from "../features/notes";
import * as points from "../features/points";
import * as reader from "../features/reader";
import * as reports from "../features/reports";
import * as review from "../features/review";
import * as rmes from "../features/rmes";
import * as rmm from "../features/rmm";
import { Diagnostics } from "../pages/Diagnostics";
import { Home } from "../pages/Home";
import { TaskRouter } from "../pages/TaskRouter";
import { FeatureStub } from "../ui/FeatureStub";
import type { NavItem } from "./nav";
import { WorkbenchShell } from "./WorkbenchShell";

const FEATURES = [rmm, caseF, cr, review, points, assess, rmes, approver, admin, masters, reader, notes, audit, dashboard, reports, informed, adminParity];

export const featureRoutes = (): RouteObject[] => FEATURES.flatMap((f) => f.routes);
export const navRegistry = (): NavItem[] => FEATURES.flatMap((f) => f.navItems);

export function buildRoutes(): RouteObject[] {
  return [
    {
      path: "/",
      element: <WorkbenchShell />,
      children: [
        { index: true, element: <Home /> },
        { path: "/diagnostics", element: <Diagnostics /> },
        { path: "/tasks/:flow/:instanceId/:act", element: <TaskRouter /> },
        ...featureRoutes(),
        { path: "*", element: <FeatureStub title="Page not found" owner="T1" testId="wb-notfound">This address is not a Workbench page.</FeatureStub> },
      ],
    },
  ];
}
