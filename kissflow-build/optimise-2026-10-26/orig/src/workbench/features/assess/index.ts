// features/assess (T2): CHRQ_B_<D> assessment.
import { createElement } from "react";
import type { RouteObject } from "react-router-dom";
import type { NavItem } from "../../shell/nav";
import { AssessCr } from "./AssessCr";

export const routes: RouteObject[] = [{ path: "/assess/:crId/:act", element: createElement(AssessCr) }];
export const navItems: NavItem[] = [];
