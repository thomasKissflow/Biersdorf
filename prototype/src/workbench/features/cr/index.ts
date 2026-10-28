// features/cr (T1): CR list, triage, manual CR create.
import { createElement } from "react";
import type { RouteObject } from "react-router-dom";
import type { NavItem } from "../../shell/nav";
import { CrDetail, CrList, NewCr } from "./ChangeRequests";

export const routes: RouteObject[] = [
  { path: "/change-requests", element: createElement(CrList) },
  { path: "/change-requests/new", element: createElement(NewCr) },
  { path: "/change-requests/:crId", element: createElement(CrDetail) },
];
export const navItems: NavItem[] = [{ id: "change-requests", path: "/change-requests", label: "Change requests" }];
