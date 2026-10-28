// The two-phase RMES save (§8.11). The header counts depend on server-computed child formulas, so they can't go in
// the same write as the rows:
//   1. updateFormRow with Table:: operations for the dirty rows only; write-then-verify by row _id or natural key.
//   2. the row READ BACK (the verified read of phase 1, or a fresh read when no row changed) → Open_Criteria_Count
//      (Σ read-back Criteria_Open_Num, blank on an applicable row = 1, with a warning) and
//      Open_Blocking_Findings_Count → updateFormRow with the two header fields, verified.
// If phase 2 fails: "rows saved; header counts not updated" (the lane's RMES gaps can't be refreshed until it works).
import type { Actions } from "../../data/actions";
import { toRmesVM } from "../../data/map";
import type { RawItem, SaveResult } from "../../data/viewModels";
import { hasRowOps, headerFromReadBack, RMES_FLOW, type RmesDept } from "./model";
import type { Patch } from "../../data/viewModels";

export interface RmesSaveOutcome {
  ok: boolean;
  message: string;
  phase1?: SaveResult;
  phase2?: SaveResult;
  openCriteria?: number;
  openBlockingFindings?: number;
  /** e.g. "server formula blank on SAF-A1; counted as open" (§7.9). */
  warnings: string[];
}

export async function saveRmesTwoPhase(actions: Pick<Actions, "updateFormRow">, d: RmesDept, itemId: string, rowsPatch: Patch, readRow: () => Promise<RawItem>): Promise<RmesSaveOutcome> {
  const flow = RMES_FLOW[d];
  let phase1: SaveResult | undefined;
  let back: RawItem;
  if (hasRowOps(rowsPatch)) {
    phase1 = await actions.updateFormRow(flow, itemId, rowsPatch);
    if (!phase1.ok) return { ok: false, phase1, warnings: [], message: `The rows were not saved, so the header counts were not touched. ${phase1.message}` };
    back = phase1.item;
  } else {
    try {
      back = await readRow();
    } catch (e) {
      return { ok: false, warnings: [], message: `The sheet could not be read back, so the header counts were not updated (${e instanceof Error ? e.message : String(e)}).` };
    }
  }
  const h = headerFromReadBack(toRmesVM(back, flow, "full"));
  const phase2 = await actions.updateFormRow(flow, itemId, h.patch);
  if (!phase2.ok)
    return {
      ok: false,
      phase1,
      phase2,
      openCriteria: h.openCriteria,
      openBlockingFindings: h.openBlockingFindings,
      warnings: h.warnings,
      message: `${phase1 ? "Rows saved; header counts not updated." : "Header counts not updated."} The lane's RMES gaps can't be refreshed until this works. ${phase2.message}`,
    };
  return {
    ok: true,
    phase1,
    phase2,
    openCriteria: h.openCriteria,
    openBlockingFindings: h.openBlockingFindings,
    warnings: h.warnings,
    message: `${phase1 ? "Rows saved and checked. " : ""}Header counts written from the read-back: ${h.openCriteria} open criteria, ${h.openBlockingFindings} blocking finding(s).`,
  };
}
