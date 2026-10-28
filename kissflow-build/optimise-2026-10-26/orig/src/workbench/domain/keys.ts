// Key formats (WORKBENCH-DESIGN.md §4.6). Case_Code is fixed by brd L735 and Query_Key by brd L887; the rest are
// [convention] and are changed HERE only. Keys that later travel to the portal (Request, PS05, PS11, Query, Notice,
// Section item) must be agreed with the portal session before X1–X6 are built.
import { ymd } from "../data/normalize";
import type { ChildTableId } from "../schema";

const ALNUM = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const B36 = "0123456789abcdefghijklmnopqrstuvwxyz";
/** `n` random characters from `alphabet` (rnd injectable for tests). */
export function randomChars(n: number, alphabet = ALNUM, rnd: () => number = Math.random): string {
  let s = "";
  for (let i = 0; i < n; i++) s += alphabet[Math.floor(rnd() * alphabet.length) % alphabet.length];
  return s;
}

/** `CIQ-<yyyy>-<_id of the cycle-1 item>` (brd L735). Written at Start after the create (POST_CREATE_KEYS). */
export const caseCode = (year: number, cycle1ItemId: string): string => `CIQ-${year}-${cycle1ItemId}`;
/** `<Case_Code>-C<Cycle>`: the base of every per-cycle key. */
export const cycleBase = (code: string, cycle: number): string => `${code}-C${cycle}`;
export const requestKey = (code: string, cycle: number): string => `${cycleBase(code, cycle)}-REQ`;
export const completenessRequestKey = (code: string, cycle: number): string => `${cycleBase(code, cycle)}-PS05`;
export const finalReleaseRequestKey = (code: string, cycle: number): string => `${cycleBase(code, cycle)}-PS11`;
export const rmesKey = (code: string, cycle: number): string => `${cycleBase(code, cycle)}-RMES`;
export const rmesRowKey = (caseRmesKey: string, dept: "SAF" | "REG"): string => `${caseRmesKey}-${dept}`;
export const runKey = (code: string, cycle: number, n: number): string => `${cycleBase(code, cycle)}-RUN${n}`;
export const sectionItemKey = (code: string, cycle: number, sectionKey: string): string => `${cycleBase(code, cycle)}-${sectionKey}`;
export const opKey = (code: string, cycle: number, now: Date = new Date(), rnd: () => number = Math.random): string =>
  `${cycleBase(code, cycle)}-OP${now.getTime().toString(36)}${randomChars(4, B36, rnd)}`;
/** `OP_Key|R<n>` (brd L887). */
export const queryKey = (op: string, round: number): string => `${op}|R${round}`;
export const crKey = (code: string, cycle: number, now: Date = new Date(), rnd: () => number = Math.random): string =>
  `${cycleBase(code, cycle)}-CR${now.getTime().toString(36)}${randomChars(4, B36, rnd)}`;
export const noticeKey = (cr: string): string => `${cr}-NOTICE`;
export const eventKey = (now: Date = new Date(), rnd: () => number = Math.random): string => `EV-${now.getTime().toString(36)}${randomChars(6, B36, rnd)}`;
export const noteKey = (now: Date = new Date(), rnd: () => number = Math.random): string => `NOTE-${now.getTime().toString(36)}${randomChars(6, B36, rnd)}`;
/** `<kind slug>-<Section_Key or name>-v<n>`. */
export const configKey = (kind: string, sectionOrName: string, n: number): string =>
  `${kind.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}-${sectionOrName.replace(/\s+/g, "-")}-v${n}`;
export const releaseKey = (now: Date, n: number): string => `REL-${ymd(now)}-${n}`;
/** A text key typed by hand at S2 (completeness/final-release text without a bundle entry). */
export const manualTextKey = (now: Date = new Date()): string => `MANUAL-${ymd(now)}`;
/** Child row `_id`: `<ChildModelId>_<10 random [A-Za-z0-9]>` (SPIKES L89). */
export const childRowId = (modelId: string, rnd: () => number = Math.random): string => `${modelId}_${randomChars(10, ALNUM, rnd)}`;

/** The rule-set version written at S2 (case and F4) when the pinned release has no "Rule set" entry (WB-D10). */
export const NO_RULE_SET = "none (manual-wb-1)";
export const ruleSetVersionKey = (configKeyValue: string, versionLabel: string): string => `${configKeyValue}@${versionLabel}`;
export const EVALUATOR_VERSION = "manual-wb-1";

/**
 * Natural keys of child rows (§7.2): an add is "present" on read-back when a row with the same client _id OR the
 * same natural key exists, so server-assigned row ids can't make a re-apply add the same row again.
 */
export const NATURAL_KEYS: Record<ChildTableId, readonly string[]> = {
  Rounds: ["Rounds_Round_No", "Rounds_Outcome"],
  Contacts: ["Contacts_Email"],
  Components: ["Components_Row_Id"],
  Safety_Criteria: ["Criteria_Code"],
  Regulatory_Criteria: ["Criteria_Code"],
  Safety_Findings: ["Findings_Criterion_Code", "Findings_Text"],
  Regulatory_Findings: ["Findings_Criterion_Code", "Findings_Text"],
};
/**
 * Key columns that may be blank (CR-T4-harness-1, T5): a finding without a criterion code is keyed on its text alone
 * (blank criterion = ""), so with server-assigned row ids a re-apply finds it instead of adding it again.
 */
export const OPTIONAL_KEY_COLUMNS: Partial<Record<ChildTableId, readonly string[]>> = {
  Safety_Findings: ["Findings_Criterion_Code"],
  Regulatory_Findings: ["Findings_Criterion_Code"],
};
/** The natural-key string of a row, or null when a required key column is blank. Contacts_Email is compared lower-case. */
export function naturalKeyOf(table: ChildTableId, row: Record<string, unknown>): string | null {
  const cols = NATURAL_KEYS[table];
  const optional = OPTIONAL_KEY_COLUMNS[table] ?? [];
  const parts: string[] = [];
  for (const c of cols) {
    const v = row[c];
    if (v === null || v === undefined || String(v).trim() === "") {
      if (optional.includes(c)) {
        parts.push("");
        continue;
      }
      return null;
    }
    parts.push(c === "Contacts_Email" ? String(v).trim().toLowerCase() : String(v).trim());
  }
  return parts.join("␟");
}
