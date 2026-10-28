// The K2.1 composition rules (matrix v0.6, 28 Oct: H1, M1, M2, L5): one check per component row, shared by the supplier
// screens (inline), the completeness check and the final release (selectors.compositionBlockers). Rows are stored as
// typed (autosave of partial input); only the gates block. Imports types only, so catalog.ts can use it without a cycle.

import type { AnswerValue, ComponentRow } from "./types";

/** CAS RN: 2–7 digits, 2 digits, 1 check digit. Check digit = Σ(digit × position from the right) mod 10. */
export function casError(raw: string | undefined): string | null {
  const v = (raw ?? "").trim();
  if (!v) return null;
  const m = /^(\d{2,7})-(\d{2})-(\d)$/.exec(v);
  if (!m) return "Use the CAS format 2–7 digits, 2 digits, check digit (e.g. 59-02-9)";
  const digits = (m[1] + m[2]).split("").reverse();
  const sum = digits.reduce((acc, d, i) => acc + Number(d) * (i + 1), 0);
  return sum % 10 === Number(m[3]) ? null : "The CAS check digit does not match. Please check for a typo";
}

/** The REACH registration number (01-0123456789-01-0000): accepted by its format only (M2). */
export const REACH_REG_NO = /^01-\d{10}-\d{2}-\d{4}$/;

/** EC number 123-456-7 (check digit = Σ(digit × position from the left) mod 11, 10 is never issued), or a REACH
 *  registration number in its place (matrix v0.6: "EC number (EINECS/ELINCS/NLP) or REACH registration no."). */
export function ecError(raw: string | undefined): string | null {
  const v = (raw ?? "").trim();
  if (!v) return null;
  if (REACH_REG_NO.test(v)) return null;
  const m = /^(\d{3})-(\d{3})-(\d)$/.exec(v);
  if (!m) return "Use the EC format 123-456-7 or a REACH registration number 01-0123456789-01-0000";
  const sum = (m[1] + m[2]).split("").reduce((acc, d, i) => acc + Number(d) * (i + 1), 0);
  return sum % 11 === Number(m[3]) ? null : "The EC check digit does not match. Please check for a typo";
}

/** A legacy row of the old table: a blank concentration was stored as 0–0. It reads as missing. */
const legacyBlank = (min: number | null | undefined, max: number | null | undefined) => min === 0 && max === 0;

/** The concentration range of one component, in % of the raw material (both bounds required). */
export function concentrationError(min: number | null | undefined, max: number | null | undefined): string | null {
  if (min === null || min === undefined || max === null || max === undefined || legacyBlank(min, max)) return "Enter a minimum and a maximum concentration";
  if (!Number.isFinite(min) || !Number.isFinite(max)) return "Concentrations must be numbers";
  if (min < 0 || max > 100) return "Concentrations must be between 0 and 100 %";
  if (min > max) return "The minimum is higher than the maximum";
  return null;
}

/** The column of a row a problem belongs to (the supplier's editor shows it under that input). */
export type ComponentColumn = "inci" | "cas" | "ec" | "fn" | "additive" | "conc";

export interface ComponentProblem {
  column: ComponentColumn;
  text: string;
  /** Nothing entered yet (the editor shows "Required" under the input). */
  missing?: true;
}

const blank = (v: string | undefined | null) => !(v ?? "").trim();

/** Everything wrong with one row, in table order. Empty = the row is complete and valid. */
export function componentRowProblems(r: Pick<ComponentRow, "inci" | "cas" | "ec" | "fn" | "additive" | "concMin" | "concMax">): ComponentProblem[] {
  const out: ComponentProblem[] = [];
  if (blank(r.inci)) out.push({ column: "inci", text: "INCI (European) / IUPAC is missing", missing: true });
  const cas = casError(r.cas);
  if (cas) out.push({ column: "cas", text: cas });
  const ec = ecError(r.ec);
  if (ec) out.push({ column: "ec", text: ec });
  if (blank(r.fn)) out.push({ column: "fn", text: "Function is missing", missing: true });
  if (typeof r.additive !== "boolean") out.push({ column: "additive", text: "Additive: answer Yes or No", missing: true });
  const conc = concentrationError(r.concMin, r.concMax);
  if (conc) out.push({ column: "conc", text: conc, ...(conc.startsWith("Enter") ? { missing: true as const } : {}) });
  return out;
}

/** "90–99 %"; "—" when nothing was entered (or a legacy 0–0 row); a missing bound reads "?". `unit: ""` leaves out " %". */
export function concText(r: Pick<ComponentRow, "concMin" | "concMax">, unit = " %"): string {
  const min = r.concMin ?? null;
  const max = r.concMax ?? null;
  if ((min === null && max === null) || legacyBlank(min, max)) return "—";
  return `${min ?? "?"}–${max ?? "?"}${unit}`;
}

/** "Yes", "No", or "—" while unanswered (L5: no default). A legacy row's false (the old checkbox) reads as No. */
export const additiveText = (a: boolean | null | undefined): string => (a === true ? "Yes" : a === false ? "No" : "—");

/**
 * M8: FLD-A1-104 (Content [%] in raw material) should lie inside the composition's concentration range in K2.1, taken
 * as the union of the components' ranges [lowest minimum, highest maximum] (the decided option; recorded in the matrix
 * v0.6 assumptions). A hint only, never a blocker: null when the value is inside, or when no row has a valid range yet
 * (an invalid row has its own blocker and is left out here).
 */
export function contentRangeHint(v: AnswerValue, components: readonly Pick<ComponentRow, "concMin" | "concMax">[]): string | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  const ranges = components.filter((r) => concentrationError(r.concMin, r.concMax) === null) as { concMin: number; concMax: number }[];
  if (!ranges.length) return null;
  const lo = Math.min(...ranges.map((r) => r.concMin));
  const hi = Math.max(...ranges.map((r) => r.concMax));
  return lo <= v && v <= hi ? null : `This value lies outside the concentration range of the components in K2.1 (${lo}–${hi} %). Please check it.`;
}
