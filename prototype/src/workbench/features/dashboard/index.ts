// features/dashboard: the RMM dashboard (#/rmm). The Business owner reaches the same page as "Operations" (read-only).
import { createElement } from "react";
import type { RouteObject } from "react-router-dom";
import type { NavItem } from "../../shell/nav";
import { Dashboard } from "./Dashboard";

export const routes: RouteObject[] = [{ path: "/rmm", element: createElement(Dashboard) }];
export const navItems: NavItem[] = [
  { id: "dashboard", path: "/rmm", label: "Dashboard" },
  { id: "operations", path: "/rmm", label: "Operations" },
];
