// features/reader (T3): the audit log page, plus the Case Admin lane-repair panel offered to T1's case detail.
import { createElement } from "react";
import type { RouteObject } from "react-router-dom";
import type { NavItem } from "../../shell/nav";
import { AuditLog } from "./AuditLog";

export const routes: RouteObject[] = [{ path: "/audit", element: createElement(AuditLog) }];
export const navItems: NavItem[] = [{ id: "audit", path: "/audit", label: "Audit trail" }];
export { LaneRepairPanel } from "./LaneRepairPanel";
