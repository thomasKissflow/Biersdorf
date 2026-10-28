// features/approver (T3).
import { createElement } from "react";
import type { RouteObject } from "react-router-dom";
import type { NavItem } from "../../shell/nav";
import { ApprovalDecision, Approvals } from "./Approvals";

export const routes: RouteObject[] = [
  { path: "/approvals", element: createElement(Approvals) },
  { path: "/approvals/:caseId/:act", element: createElement(ApprovalDecision) },
];
export const navItems: NavItem[] = [{ id: "approvals", path: "/approvals", label: "Approvals" }];
