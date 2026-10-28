// features/reports: Reports (#/reports).
import { createElement } from "react";
import type { RouteObject } from "react-router-dom";
import type { NavItem } from "../../shell/nav";
import { Reports } from "./Reports";

export const routes: RouteObject[] = [{ path: "/reports", element: createElement(Reports) }];
export const navItems: NavItem[] = [{ id: "reports", path: "/reports", label: "Reports" }];
