// features/case (T1): Case list, Case detail + tabs, case step panels, case actions.
import { createElement } from "react";
import type { RouteObject } from "react-router-dom";
import type { NavItem } from "../../shell/nav";
import { CaseDetail } from "./CaseDetail";
import { CaseList } from "./CaseList";

export const routes: RouteObject[] = [
  { path: "/cases", element: createElement(CaseList) },
  { path: "/cases/:caseId", element: createElement(CaseDetail) },
];
export const navItems: NavItem[] = [{ id: "cases", path: "/cases", label: "All cases" }];
export { CaseDetail };
