// features/notes (T3): NotesPanel (used by T1 and T2). No routes of its own.
import type { RouteObject } from "react-router-dom";
import type { NavItem } from "../../shell/nav";

export const routes: RouteObject[] = [];
export const navItems: NavItem[] = [];
export { NotesPanel, type NotesPanelProps } from "./NotesPanel";
