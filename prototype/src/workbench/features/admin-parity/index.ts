// features/admin-parity: Rule table, Section owners, Reminders (the prototype's admin pages).
import { createElement } from "react";
import type { RouteObject } from "react-router-dom";
import type { NavItem } from "../../shell/nav";
import { Reminders, RuleTable, SectionOwners } from "./AdminParity";

export const routes: RouteObject[] = [
  { path: "/admin/rules", element: createElement(RuleTable) },
  { path: "/admin/ownership", element: createElement(SectionOwners) },
  { path: "/admin/reminders", element: createElement(Reminders) },
];
export const navItems: NavItem[] = [
  { id: "rules", path: "/admin/rules", label: "Rule table" },
  { id: "ownership", path: "/admin/ownership", label: "Section owners" },
  { id: "reminders", path: "/admin/reminders", label: "Reminders" },
];
