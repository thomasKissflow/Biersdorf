// features/rmes (T2): RMES sheet SAF/REG (editor role only); read-only RmesSummary used by the approver.
import { createElement } from "react";
import type { RouteObject } from "react-router-dom";
import type { NavItem } from "../../shell/nav";
import { RmesIndex, RmesSheet } from "./RmesSheet";

export const routes: RouteObject[] = [
  { path: "/rmes", element: createElement(RmesIndex) },
  { path: "/rmes/:caseId", element: createElement(RmesSheet) },
];
export const navItems: NavItem[] = [{ id: "rmes", path: "/rmes", label: "RMES sheet" }];
export { RmesSummary, type RmesSummaryProps } from "./RmesSummary";
