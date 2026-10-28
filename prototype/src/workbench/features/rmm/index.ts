// features/rmm (T1): My work, New case (+ createCase.ts). Route registry contract (§12.1): routes + navItems.
import { createElement } from "react";
import type { RouteObject } from "react-router-dom";
import type { NavItem } from "../../shell/nav";
import { MyWork } from "./MyWork";
import { NewCase } from "./NewCase";

export const routes: RouteObject[] = [
  { path: "/my-work", element: createElement(MyWork) },
  { path: "/cases/new", element: createElement(NewCase) },
];
export const navItems: NavItem[] = [
  { id: "my-work", path: "/my-work", label: "My work" },
  { id: "new-case", path: "/cases/new", label: "New case" },
];
