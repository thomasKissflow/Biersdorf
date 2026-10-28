// features/points (T2): PointList, RaisePointDialog, point detail + decisions, OPNT_S1 manual, createPoint.
import { createElement } from "react";
import type { RouteObject } from "react-router-dom";
import type { NavItem } from "../../shell/nav";
import { PointDetail } from "./PointDetail";

export const routes: RouteObject[] = [{ path: "/points/:pointId", element: createElement(PointDetail) }];
export const navItems: NavItem[] = [];
export { PointList, type PointListProps } from "./PointList";
export { RaisePointDialog, type RaisePointDialogProps } from "./RaisePointDialog";
export { createPoint, type RaiseInput } from "./createPoint";
