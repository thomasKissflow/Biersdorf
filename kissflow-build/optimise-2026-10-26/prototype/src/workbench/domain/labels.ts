// Display labels and tones for statuses, steps and departments. Text only; no ids beyond the generated schema.
import type { Tone } from "@/components/ui/primitives";
import { stepDef, type Dept, type StepIr } from "../schema";
import type { ItemStatus } from "../data/viewModels";
import { NO_RULE_SET } from "./keys";

export const STATUS_LABEL: Record<ItemStatus, string> = {
  draft: "Draft",
  "in-progress": "In progress",
  completed: "Completed",
  rejected: "Cancelled (rejected)",
  withdrawn: "Cancelled (withdrawn)",
  unknown: "Status not readable",
};
export const STATUS_TONE: Record<ItemStatus, Tone> = {
  draft: "neutral",
  "in-progress": "info",
  completed: "ok",
  rejected: "bad",
  withdrawn: "bad",
  unknown: "neutral",
};

export const DEPT_LABEL: Record<Dept, string> = {
  REG: "Regulatory",
  SAF: "Safety",
  QM: "QM",
  MIC: "Microbiology",
  SUS: "Sustainability",
  RMM: "RMM",
};

/** Short labels for the case stepper, in v4 order (S6 before S7). */
export const CASE_STEPPER: { key: StepIr | "END"; label: string }[] = [
  { key: "CASE_S0", label: "Create" },
  { key: "CASE_S1", label: "Basic data" },
  { key: "CASE_S2", label: "Scope" },
  { key: "CASE_S3", label: "Completeness" },
  { key: "CASE_PAR", label: "Review" },
  { key: "CASE_S5", label: "Open items" },
  { key: "CASE_S6", label: "Approval" },
  { key: "CASE_S7", label: "Final release" },
  { key: "CASE_S8", label: "Close check" },
  { key: "END", label: "Done" },
];

export const stepLabel = (ir: StepIr | null | undefined): string => (ir ? stepDef(ir).name : "Unidentified step");

/** Supplier hand-offs are manual in the MVP (WB-10); the UI never claims a hand-off happened. */
export const MANUAL_HANDOFF_NOTE = "Supplier hand-offs are not connected yet. RMM records supplier steps by hand.";
export const LENS_NOTE = "Preview only: shows the screens of this role. Your real Kissflow access doesn't change.";

// ---------------------------------------------------------------- partial reads under the fail-closed counts policy
// One wording for every screen that stops because the user's access does not show every item of a case (WB-D1
// fail-closed is unchanged; only the explanation is shared). Plain language: no policy names, no internal ids.

/** Refresh counts refused (lane, open-items check before release, close check). */
export const COUNTS_BLOCKED =
  "Counts could not be confirmed with your access, so nothing was written. Your access shows only the open points and change requests you raised or hold a task on. Ask a Case administrator, who can see every item of this case, to check it.";
/** Lane workspace: why "Complete review" stays off after a partial refresh, and what to do now. */
export const COUNTS_BLOCKED_LANE =
  "The review can be completed only when every open point and change request of this case can be checked, so the quality gate stays safe. Save your sign-off and RMES decision now (they are kept) and ask a Case administrator, who can see every item of this case, to help.";
/** Lane workspace: the short reason in the "Complete review" checklist. */
export const COUNTS_BLOCKED_SHORT = "Not every open point and change request of this case can be checked with your access";
/** Overall approval: why Approve is unavailable on a partial read. */
export const APPROVE_BLOCKED_PARTIAL =
  "You can still Reject. Approve is unavailable because your access does not show every department-review point of this case, so a later department decision could be missed. Ask a Case administrator, who can see all open points, to check this case.";
/** Where a user is sent when something needs an administrator. */
export const ASK_ADMIN = "contact your Business administrator";

/** A person for display: the read name, else the first non-blank fallback (e-mail, contact name), else "—". A user
 *  _id is never shown (UX-04). */
export function personLabel(u: { _id?: string; name?: string | null } | null | undefined, ...fallbacks: (string | null | undefined)[]): string {
  const n = u?.name?.trim();
  if (n) return n;
  return fallbacks.map((x) => (x ?? "").trim()).find(Boolean) ?? "—";
}

/** A flow as a plain noun: "CIQ Open Point" → "open point", "CIQ RMES Safety" → "RMES safety" (UX-13). */
export function flowNoun(name: string): string {
  return name
    .replace(/^CIQ\s+/, "")
    .split(" ")
    .map((w) => (w.length > 1 && w[1] === w[1].toLowerCase() ? w[0].toLowerCase() + w.slice(1) : w))
    .join(" ");
}

/** "1 task" / "3 tasks". */
export const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;

/** A department code as a name ("SAF" → "Safety"); other values (e.g. CUS, LEG) as they are; blank → "—". */
export const deptName = (code: string | null | undefined): string => (code ? (DEPT_LABEL[code as Dept] ?? code) : "—");

/** The rule set version for display: the stored "no rule set" marker reads as plain words (UX-03). */
export const ruleSetLabel = (v: string | null | undefined): string => (!v ? "—" : v === NO_RULE_SET ? "Not set (manual scope)" : v);
