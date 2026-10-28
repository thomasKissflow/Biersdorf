// features/audit (T3): AuditTimeline (used by T1 and the reader). No routes of its own.
import type { RouteObject } from "react-router-dom";
import type { NavItem } from "../../shell/nav";

export const routes: RouteObject[] = [];
export const navItems: NavItem[] = [];
export { AuditTimeline, type AuditTimelineProps } from "./AuditTimeline";
