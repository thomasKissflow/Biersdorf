// Feature flags and the counts policy (WORKBENCH-DESIGN.md §7.11, WB-17). Each flag is read through one pure function
// that takes the flag value as a parameter, so both states are unit-tested. Flags never come from the URL,
// sessionStorage or the host.
import { listValues, type RoleIr, type StepIr } from "../schema";

export type CountsPolicy = "fail-closed" | "attest";
export interface Flags {
  /** From the Settings payload of the case's pinned release; absent or unreadable → "fail-closed" (WB-D1). */
  countsPolicy: CountsPolicy;
  /** "Additional part" raise (RMM only when on). Code constant, off for the MVP (WB-D3). */
  additionalPartRaise: boolean;
  /** "Accepted – scope extended" CR outcome. Code constant, off for the MVP (WB-D3). */
  scopeExtendedOutcome: boolean;
}

export const ADDITIONAL_PART_RAISE = false;
export const SCOPE_EXTENDED_OUTCOME = false;
export const DEFAULT_FLAGS: Flags = Object.freeze({ countsPolicy: "fail-closed", additionalPartRaise: ADDITIONAL_PART_RAISE, scopeExtendedOutcome: SCOPE_EXTENDED_OUTCOME });

/** The counts policy from a parsed Settings payload. Anything but exactly "attest" is "fail-closed". */
export function countsPolicyFrom(settings: unknown): { policy: CountsPolicy; source: "settings" | "default" } {
  const v = settings && typeof settings === "object" ? (settings as { countsPolicy?: unknown }).countsPolicy : undefined;
  if (v === "attest") return { policy: "attest", source: "settings" };
  if (v === "fail-closed") return { policy: "fail-closed", source: "settings" };
  return { policy: "fail-closed", source: "default" };
}
export const flagsFor = (settings: unknown): Flags => ({ ...DEFAULT_FLAGS, countsPolicy: countsPolicyFrom(settings).policy });

export const ADDITIONAL_PART = "Additional part";
export const SCOPE_EXTENDED = "Accepted – scope extended";

/** OP kinds the raise dialog offers. "Additional part" never for reviewers (V on CIQ_Section_A00), and for RMM
 *  only when additionalPartRaise is on. */
export function opKindOptions(roles: ReadonlySet<RoleIr>, flags: Pick<Flags, "additionalPartRaise">): string[] {
  const rmm = roles.has("ciq_rmm");
  return listValues("CIQ_OP_Kind").filter((k) => k !== ADDITIONAL_PART || (rmm && flags.additionalPartRaise));
}

/** CR_Outcome options at Triage. "Accepted – scope extended" only when scopeExtendedOutcome is on. */
export function crOutcomeOptions(flags: Pick<Flags, "scopeExtendedOutcome">): string[] {
  return listValues("CIQ_CR_Outcome").filter((o) => o !== SCOPE_EXTENDED || flags.scopeExtendedOutcome);
}

export type PartialCountAction = "block" | "attest" | "clear";
const LANE_OR_HOLD = new Set<string>(["CASE_B_REG", "CASE_B_SAF", "CASE_B_QM", "CASE_B_MIC", "CASE_B_SUS", "CASE_B_RMM", "CASE_S5", "CASE_S8"]);
/** What a PARTIAL count refresh does at a step (§7.9): S7 always clears (so S8 runs); lane steps, S5 and S8 follow
 *  the counts policy; nowhere else are counts written (S2/S3 are ReadOnly; D23). */
export function partialCountAction(step: StepIr, flags: Pick<Flags, "countsPolicy">): PartialCountAction {
  if (step === "CASE_S7") return "clear";
  if (LANE_OR_HOLD.has(step)) return flags.countsPolicy === "attest" ? "attest" : "block";
  throw new Error(`counts are not written at ${step}`);
}
