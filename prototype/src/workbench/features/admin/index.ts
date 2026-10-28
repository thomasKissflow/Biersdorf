// features/admin (T3): config versions, release, section templates.
import { createElement } from "react";
import type { RouteObject } from "react-router-dom";
import type { NavItem } from "../../shell/nav";
import { ConfigEdit, ConfigList, Templates } from "./ConfigScreens";

export const routes: RouteObject[] = [
  { path: "/config", element: createElement(ConfigList) },
  { path: "/config/new", element: createElement(ConfigEdit) },
  { path: "/config/:itemId", element: createElement(ConfigEdit) },
  { path: "/templates", element: createElement(Templates) },
];
export const navItems: NavItem[] = [
  { id: "config", path: "/config", label: "Configuration" },
  { id: "templates", path: "/templates", label: "Questionnaire" },
];
