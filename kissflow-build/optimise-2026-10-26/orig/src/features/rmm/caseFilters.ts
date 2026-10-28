// The Cases register's tabs and search (REQ-PROC-006: structured, searchable data). Pure, so they can be tested.
import { isClosed, partOf } from "@/domain/selectors";
import type { AppState, CiqCase } from "@/domain/types";

export type CaseTabKey = "open" | "part1" | "part2" | "completed" | "cancelled";

export const CASE_TAB_TEST: Record<CaseTabKey, (c: CiqCase) => boolean> = {
  open: (c) => !isClosed(c),
  part1: (c) => partOf(c) === "Part 1",
  part2: (c) => partOf(c) === "Part 2",
  completed: (c) => c.phase === "completed",
  cancelled: (c) => c.phase === "cancelled",
};

const squash = (x: string) => x.toLowerCase().replace(/[\s-]/g, "");

/** Everything the search box matches: case ID, trade name, main INCI, BDF material no., supplier name and DUNS, and
 *  the INCI and CAS number of every component. */
export function caseSearchText(state: AppState, c: CiqCase): string {
  const sup = state.suppliers.find((s) => s.id === c.supplierId);
  return [c.id, c.materialName, c.inci, c.materialNo, sup?.name ?? "", sup?.duns ?? "", ...c.components.flatMap((r) => [r.inci, r.cas ?? ""])].join(" ").toLowerCase();
}

/** Case-insensitive; spaces and dashes are ignored as well, so "rm 405217" finds RM-405217 and "087-342-615" a DUNS. */
export function caseMatches(state: AppState, c: CiqCase, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  const text = caseSearchText(state, c);
  return text.includes(needle) || squash(text).includes(squash(needle));
}
