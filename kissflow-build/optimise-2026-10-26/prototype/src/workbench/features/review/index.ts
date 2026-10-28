// features/review (T2): Review queue, lane workspace (incl. B_RMM).
import { createElement } from "react";
import type { RouteObject } from "react-router-dom";
import type { NavItem } from "../../shell/nav";
import { LaneWorkspace } from "./LaneWorkspace";
import { ReviewQueue } from "./ReviewQueue";

export const routes: RouteObject[] = [
  { path: "/review", element: createElement(ReviewQueue) },
  { path: "/review/lane/:caseId/:act", element: createElement(LaneWorkspace) },
];
export const navItems: NavItem[] = [{ id: "review", path: "/review", label: "My reviews" }];
export { LaneWorkspace };
