// Admin parity pages, pure part: views over the live CIQ_Config_Version_A00 rows of one Config_Kind (Rule set, Section
// ownership, Settings, Text bundle). Which version is in the live release, which one shows first, and the payload
// readers for the rule table and the ownership matrix. Writes stay in features/admin/config.ts (copy-on-write drafts).
import { listValues } from "../../schema";
import { parseManifest, parseOwnership, pickPinnedRelease } from "../../domain/config";
import type { ConfigVM } from "../../data/viewModels";
import { splitVersion, type TemplatePreview } from "../admin/config";

// ---------------------------------------------------------------- versions

export type VersionState = "live" | "published" | "draft" | "retired" | "other";

/** Config keys in the newest Published Live release's manifest. */
export function liveConfigKeys(rows: readonly ConfigVM[]): Set<string> {
  const rel = pickPinnedRelease([...rows]);
  const m = rel ? parseManifest(rel.releaseManifestJson) : null;
  return new Set(m?.ok ? m.value.map((e) => e.configKey) : []);
}

export function versionStateOf(r: Pick<ConfigVM, "state" | "configKey">, live: ReadonlySet<string>): VersionState {
  if (r.state === "Published") return live.has(r.configKey) ? "live" : "published";
  if (r.state === "Draft") return "draft";
  if (r.state === "Retired") return "retired";
  return "other";
}

/** Rows of one kind, newest first (key version, then publish time, then key). */
export function versionsOf(rows: readonly ConfigVM[], kind: string): ConfigVM[] {
  return rows
    .filter((r) => r.kind === kind)
    .sort((a, b) => splitVersion(b.configKey).n - splitVersion(a.configKey).n || String(b.publishedAt).localeCompare(String(a.publishedAt)) || b.configKey.localeCompare(a.configKey));
}

/** The version shown first: the one in the live release, else the newest Published, else the newest row. */
export function defaultVersion(versions: readonly ConfigVM[], live: ReadonlySet<string>): ConfigVM | undefined {
  return versions.find((r) => r.state === "Published" && live.has(r.configKey)) ?? versions.find((r) => r.state === "Published") ?? versions[0];
}

/** The open draft of a kind (one at a time: a second "New draft version" opens this one instead). */
export const openDraftOf = (versions: readonly ConfigVM[]): ConfigVM | undefined => versions.find((r) => r.state === "Draft");

/** The newest non-draft version older than `row` (for the "New" and "Changed" marks). */
export function previousVersion(versions: readonly ConfigVM[], row: ConfigVM): ConfigVM | undefined {
  const i = versions.findIndex((r) => r._id === row._id);
  return i < 0 ? undefined : versions.slice(i + 1).find((r) => r.state !== "Draft");
}

// ---------------------------------------------------------------- rule set

export interface RuleRow {
  id: string;
  question: string;
  condition: string;
  note: string;
  activates: string[];
  outcome: string;
  evidence: string[];
  departments: string[];
  basis: string;
}

const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);
const str = (x: unknown): string => (typeof x === "string" ? x : typeof x === "number" ? String(x) : "");
const strs = (x: unknown): string[] => (Array.isArray(x) ? x.map(str).filter(Boolean) : typeof x === "string" && x ? x.split(/\s*,\s*/) : []);

/** A Rule set payload `{ rules: [{ id, question, condition, note?, activates[], outcome, evidence[], departments[], basis }] }`
 *  (a bare array is accepted too). Unknown fields are ignored; a rule without an id gets its position. */
export function parseRuleSet(text: string): { ok: true; rules: RuleRow[] } | { ok: false; error: string } {
  let v: unknown;
  try {
    v = JSON.parse(text || "");
  } catch {
    return { ok: false, error: "This version's content is not valid JSON." };
  }
  const list = Array.isArray(v) ? v : isObj(v) && Array.isArray(v.rules) ? v.rules : null;
  if (!list) return { ok: false, error: "This version has no list of rules." };
  const rules = list.filter(isObj).map((r, i) => ({
    id: str(r.id) || `#${i + 1}`,
    question: str(r.question),
    condition: str(r.condition),
    note: str(r.note),
    activates: strs(r.activates),
    outcome: str(r.outcome),
    evidence: strs(r.evidence),
    departments: strs(r.departments),
    basis: str(r.basis),
  }));
  return { ok: true, rules };
}

export function ruleMatches(r: RuleRow, q: string): boolean {
  const s = q.trim().toLowerCase();
  if (!s) return true;
  return [r.id, r.question, r.condition, r.note, r.outcome, r.basis, ...r.activates, ...r.evidence, ...r.departments].join(" ").toLowerCase().includes(s);
}

export type BasisKind = "document" | "assumption" | "other";
export const basisKind = (b: string): BasisKind => (/^document$/i.test(b.trim()) ? "document" : /assumption/i.test(b) ? "assumption" : "other");

/** Rules grouped by configuration question: rules without a question first, then by question code. */
export function groupRules(rules: readonly RuleRow[]): { question: string; rules: RuleRow[] }[] {
  const by = new Map<string, RuleRow[]>();
  for (const r of rules) by.set(r.question, [...(by.get(r.question) ?? []), r]);
  return [...by.entries()].sort(([a], [b]) => (a === "" ? -1 : b === "" ? 1 : a.localeCompare(b, undefined, { numeric: true }))).map(([question, rs]) => ({ question, rules: rs }));
}

/** Rules that are new or changed against the previous version (none without a previous version). */
export function changedRuleIds(prev: readonly RuleRow[] | null, cur: readonly RuleRow[]): Map<string, "new" | "changed"> {
  const out = new Map<string, "new" | "changed">();
  if (!prev) return out;
  const before = new Map(prev.map((r) => [r.id, JSON.stringify(r)]));
  for (const r of cur) if (before.get(r.id) !== JSON.stringify(r)) out.set(r.id, before.has(r.id) ? "changed" : "new");
  return out;
}

// ---------------------------------------------------------------- section ownership

/** Matrix columns: every department, in the list's order (RMM, the five reviewers, Customs, Legal). */
export const MATRIX_DEPTS = listValues("CIQ_Department");
export const DEPT_NAMES: Record<string, string> = {
  RMM: "Raw Material Management",
  REG: "Regulatory Affairs",
  SAF: "Product Safety",
  QM: "Quality Management",
  MIC: "Microbiology",
  SUS: "Sustainability",
  CUS: "Customs & Trade Compliance",
  LEG: "Legal / IP",
};
const REVIEW = new Set(listValues("CIQ_Review_Dept").filter((d) => d !== "RMM"));
export const deptKindOf = (d: string): string => (d === "RMM" ? "case owner" : REVIEW.has(d) ? "reviews" : "informed");

export type OwnerRole = "lead" | "co" | "none";
export interface OwnershipRow {
  sectionKey: string;
  code: string;
  title: string;
  lead: string;
  co: string[];
  queryOwner: string;
  /** Differs from the previous version. */
  changed: boolean;
}

/** The matrix of an ownership payload, in the published template's order (sections the template lacks follow by key;
 *  template sections without an owner show with an empty lead). */
export function ownershipRows(text: string, template: TemplatePreview | null, prevText?: string): { ok: true; rows: OwnershipRow[] } | { ok: false; error: string } {
  const p = parseOwnership(text);
  if (!p.ok) return p;
  const prev = prevText ? parseOwnership(prevText) : null;
  const before = prev?.ok ? prev.value.owners : null;
  const owners = p.value.owners;
  const meta = new Map((template?.sections ?? []).map((s) => [s.sectionKey, s]));
  const keys = [...meta.keys(), ...Object.keys(owners).filter((k) => !meta.has(k)).sort()];
  const sig = (o: { lead: string; co: string[]; queryOwner: string } | undefined) => (o ? JSON.stringify([o.lead, [...o.co].sort(), o.queryOwner]) : "");
  return {
    ok: true,
    rows: keys.map((k) => {
      const o = owners[k];
      const m = meta.get(k);
      return { sectionKey: k, code: m?.code || k, title: m?.title ?? "", lead: o?.lead ?? "", co: o?.co ?? [], queryOwner: o?.queryOwner ?? "", changed: !!before && sig(before[k]) !== sig(o) };
    }),
  };
}

export const roleIn = (r: Pick<OwnershipRow, "lead" | "co">, d: string): OwnerRole => (r.lead === d ? "lead" : r.co.includes(d) ? "co" : "none");

export function deptTotals(rows: readonly OwnershipRow[]): Record<string, { lead: number; co: number }> {
  return Object.fromEntries(MATRIX_DEPTS.map((d) => [d, { lead: rows.filter((r) => r.lead === d).length, co: rows.filter((r) => r.co.includes(d)).length }]));
}
