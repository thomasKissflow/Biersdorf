// features/masters (T3): suppliers + contacts.
import { createElement } from "react";
import type { RouteObject } from "react-router-dom";
import type { NavItem } from "../../shell/nav";
import { SupplierDetail, SupplierList } from "./Suppliers";

export const routes: RouteObject[] = [
  { path: "/suppliers", element: createElement(SupplierList) },
  { path: "/suppliers/new", element: createElement(SupplierDetail) },
  { path: "/suppliers/:itemId", element: createElement(SupplierDetail) },
];
export const navItems: NavItem[] = [{ id: "suppliers", path: "/suppliers", label: "Suppliers" }];
