// features/informed: Informed cases (#/informed).
import { createElement } from "react";
import type { RouteObject } from "react-router-dom";
import type { NavItem } from "../../shell/nav";
import { InformedCases } from "./InformedCases";

export const routes: RouteObject[] = [{ path: "/informed", element: createElement(InformedCases) }];
export const navItems: NavItem[] = [{ id: "informed", path: "/informed", label: "Informed cases" }];
