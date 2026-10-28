// Informed cases (#/informed), pure part: which live cases put an informed department's sections in scope. Customs &
// Trade Compliance owns K7, Legal / IP owns K8 and K8.1; neither has a review step (read-only). A case is in scope when
// one of its CIQ Section rows (F3) is led by the department or carries one of its codes and is not N.A.; a case without
// such rows falls back to its newest scope run (F4 Result_JSON, else Lead_Departments).
import type { RoleIr } from "../../schema";
import type { CaseVM, RunVM, SectionVM } from "../../data/viewModels";
import { parseRecordedScope } from "../case/scope";

export interface InformedDept {
  dept: "CUS" | "LEG";
  role: RoleIr;
  label: string;
  codes: string[];
}

export const INFORMED_DEPTS: InformedDept[] = [
  { dept: "CUS", role: "ciq_customs", label: "Customs & Trade Compliance", codes: ["K7"] },
  { dept: "LEG", role: "ciq_legal", label: "Legal / IP", codes: ["K8", "K8.1"] },
];

/** The informed departments the (lensed) roles give, in a fixed order. */
export const informedDeptsOf = (roles: ReadonlySet<RoleIr>): InformedDept[] => INFORMED_DEPTS.filter((d) => roles.has(d.role));

export interface InformedSection {
  key: string;
  code: string;
  title: string;
  /** Mandatory / Optional, or "" when only the lead department is known. */
  applicability: string;
  source: "section" | "scope run";
}
export interface InformedRow {
  c: CaseVM;
  sections: InformedSection[];
}

export const isClosedCase = (c: Pick<CaseVM, "status" | "cancelled">): boolean => c.cancelled || c.status === "completed" || c.status === "rejected" || c.status === "withdrawn";
/** The supplier confirmed completeness (the case reached Beiersdorf's review). */
export const isSubmitted = (c: Pick<CaseVM, "completeness">): boolean => !!c.completeness.at || /^confirmed$/i.test(c.completeness.confirm.trim());

const NA = "N.A.";

function newestRunByCase(runs: readonly RunVM[]): Map<string, RunVM> {
  const out = new Map<string, RunVM>();
  for (const r of runs) {
    if (!r.caseItemId) continue;
    const p = out.get(r.caseItemId);
    const newer = !p || (r.runNo ?? 0) > (p.runNo ?? 0) || ((r.runNo ?? 0) === (p.runNo ?? 0) && String(r.runAt) > String(p.runAt));
    if (newer) out.set(r.caseItemId, r);
  }
  return out;
}

function fromRun(r: RunVM, d: InformedDept, mine: (lead: string, code: string, key: string) => boolean): InformedSection[] {
  const rec = parseRecordedScope(r.resultJson);
  if (rec) return rec.sections.filter((s) => s.applicability !== NA && mine(s.lead, s.code, s.sectionKey)).map((s) => ({ key: s.sectionKey, code: s.code || s.sectionKey, title: s.title, applicability: s.applicability, source: "scope run" as const }));
  const leads = r.leadDepartments.split(/[,;\s]+/).filter(Boolean);
  return leads.includes(d.dept) ? [{ key: d.dept, code: d.codes.join(", "), title: "", applicability: "", source: "scope run" }] : [];
}

/** Cases where the department's sections are in scope, newest first. Cases the list cannot read are left out. */
export function informedRows(cases: readonly CaseVM[], sections: readonly SectionVM[], runs: readonly RunVM[], d: InformedDept): InformedRow[] {
  const mine = (lead: string, code: string, key: string) => lead === d.dept || d.codes.includes(code) || d.codes.includes(key);
  const bySection = new Map<string, InformedSection[]>();
  for (const s of sections) {
    if (!s.caseItemId || s.applicabilityLabel === NA || !mine(s.leadDept, s.sectionCode, s.sectionKey)) continue;
    const list = bySection.get(s.caseItemId) ?? [];
    if (!list.some((x) => x.key === s.sectionKey)) list.push({ key: s.sectionKey, code: s.sectionCode || s.sectionKey, title: s.sectionTitle, applicability: s.applicabilityLabel, source: "section" });
    bySection.set(s.caseItemId, list);
  }
  const runs1 = newestRunByCase(runs);
  const out: InformedRow[] = [];
  for (const c of cases) {
    let secs = bySection.get(c._id) ?? [];
    if (!secs.length) {
      const r = runs1.get(c._id);
      if (r) secs = fromRun(r, d, mine);
    }
    if (secs.length) out.push({ c, sections: [...secs].sort((a, b) => a.code.localeCompare(b.code)) });
  }
  return out.sort((a, b) => String(b.c.createdAt ?? "").localeCompare(String(a.c.createdAt ?? "")) || b.c.caseCode.localeCompare(a.c.caseCode));
}

/** The status is not readable (a case known only from the audit log): it is neither active nor closed, only in "All". */
export const statusUnknown = (c: Pick<CaseVM, "status">): boolean => c.status === "unknown";

export type InformedFilter = "active" | "closed" | "all";
export function filterInformed(rows: readonly InformedRow[], f: InformedFilter): InformedRow[] {
  return f === "all" ? [...rows] : rows.filter((r) => !statusUnknown(r.c) && isClosedCase(r.c) === (f === "closed"));
}
export function informedStats(rows: readonly InformedRow[]): { active: number; submitted: number; completed: number; unknown: number } {
  const active = rows.filter((r) => !statusUnknown(r.c) && !isClosedCase(r.c));
  return { active: active.length, submitted: active.filter((r) => isSubmitted(r.c)).length, completed: rows.filter((r) => r.c.status === "completed").length, unknown: rows.filter((r) => statusUnknown(r.c)).length };
}
/** "Active" first, like the prototype; "All" when no status is readable but some cases are in scope. */
export const defaultInformedFilter = (rows: readonly InformedRow[]): InformedFilter => {
  const s = informedStats(rows);
  return s.active === 0 && s.unknown > 0 ? "all" : "active";
};
