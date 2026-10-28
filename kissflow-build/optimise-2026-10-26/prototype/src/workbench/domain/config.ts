// Pinned configuration (WORKBENCH-DESIGN.md §4.6 "Config payloads" [convention], WB-11): release selection, the
// manifest, payload parsers per Config_Kind, and the content-hash check (sha256 hex of the stored Payload_JSON, Web
// Crypto). A mismatch against the case's manifest copy blocks S2 and is recorded as an F8 "Configuration" event.
import { listValues } from "../schema";
import type { ConfigVM } from "../data/viewModels";
import { countsPolicyFrom, type CountsPolicy } from "./flags";
import { NO_RULE_SET, ruleSetVersionKey } from "./keys";

export interface ManifestEntry {
  configKey: string;
  kind: string;
  itemId: string;
  sectionKey?: string;
  sectionRev?: number;
  contentHash: string;
}

export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string };
const fail = <T>(error: string): ParseResult<T> => ({ ok: false, error });
function json(text: string): ParseResult<unknown> {
  if (!text || !text.trim()) return fail("empty");
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (e) {
    return fail(`not JSON (${e instanceof Error ? e.message : String(e)})`);
  }
}
const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);
const isStr = (x: unknown): x is string => typeof x === "string";

export function parseManifest(text: string): ParseResult<ManifestEntry[]> {
  const j = json(text);
  if (!j.ok) return j;
  if (!Array.isArray(j.value)) return fail("the manifest is not an array");
  const out: ManifestEntry[] = [];
  for (const [i, e] of j.value.entries()) {
    if (!isObj(e) || !isStr(e.configKey) || !isStr(e.kind) || !isStr(e.itemId) || !isStr(e.contentHash)) return fail(`manifest entry ${i} lacks configKey/kind/itemId/contentHash`);
    out.push({ configKey: e.configKey, kind: e.kind, itemId: e.itemId, contentHash: e.contentHash, sectionKey: isStr(e.sectionKey) ? e.sectionKey : undefined, sectionRev: typeof e.sectionRev === "number" ? e.sectionRev : undefined });
  }
  return { ok: true, value: out };
}

export type Applicability = "Mandatory" | "Optional" | "N.A.";
export interface TemplatePayload {
  sections: { sectionKey: string; default: Applicability }[];
}
export interface SectionDefinitionPayload {
  sectionKey: string;
  code: string;
  title: string;
  sort: number;
  fields: { key: string; label: string; type: string; required: boolean }[];
}
export interface OwnershipPayload {
  owners: Record<string, { lead: string; co: string[]; queryOwner: string }>;
}
export interface RmesCriteriaPayload {
  criteria: { code: string; part: string; title: string; dept: "SAF" | "REG" }[];
}
export interface TextBundlePayload {
  texts: Record<string, string>;
}
export interface SettingsPayload {
  deptReviewMode: boolean;
  overallApprovalRequired: boolean;
  defaultSupplierDueDays: number;
  reactivationDays: number;
  countsPolicy?: CountsPolicy;
}
export const DEFAULT_SETTINGS: SettingsPayload = { deptReviewMode: false, overallApprovalRequired: false, defaultSupplierDueDays: 14, reactivationDays: 365 };

const APPLIC: Applicability[] = ["Mandatory", "Optional", "N.A."];

export function parseTemplate(text: string): ParseResult<TemplatePayload> {
  const j = json(text);
  if (!j.ok) return j;
  const v = j.value;
  if (!isObj(v) || !Array.isArray(v.sections)) return fail("Template: { sections: [...] } expected");
  for (const s of v.sections) if (!isObj(s) || !isStr(s.sectionKey) || !APPLIC.includes(s.default as Applicability)) return fail("Template: every section needs sectionKey and default Mandatory/Optional/N.A.");
  return { ok: true, value: v as unknown as TemplatePayload };
}
export function parseSectionDefinition(text: string): ParseResult<SectionDefinitionPayload> {
  const j = json(text);
  if (!j.ok) return j;
  const v = j.value;
  if (!isObj(v) || !isStr(v.sectionKey) || !isStr(v.code) || !isStr(v.title) || typeof v.sort !== "number" || !Array.isArray(v.fields)) return fail("Section definition: sectionKey, code, title, sort and fields expected");
  for (const f of v.fields) if (!isObj(f) || !isStr(f.key) || !isStr(f.label) || !isStr(f.type) || typeof f.required !== "boolean") return fail("Section definition: every field needs key, label, type, required");
  return { ok: true, value: v as unknown as SectionDefinitionPayload };
}
export function parseOwnership(text: string): ParseResult<OwnershipPayload> {
  const j = json(text);
  if (!j.ok) return j;
  const v = j.value;
  if (!isObj(v) || !isObj(v.owners)) return fail("Section ownership: { owners: { <sectionKey>: { lead, co, queryOwner } } } expected");
  for (const o of Object.values(v.owners)) if (!isObj(o) || !isStr(o.lead) || !Array.isArray(o.co) || !isStr(o.queryOwner)) return fail("Section ownership: lead, co[] and queryOwner per section");
  // F7: the values are written to list fields (Lead_Dept: CIQ_Department; Query_Owner_Dept and co-reviewers:
  // CIQ_Review_Dept). A value outside the list would be dropped by Kissflow, so it is refused before publishing.
  const dept = listValues("CIQ_Department");
  const review = listValues("CIQ_Review_Dept");
  for (const [key, o] of Object.entries(v.owners as Record<string, { lead: string; co: unknown[]; queryOwner: string }>)) {
    if (o.lead && !dept.includes(o.lead)) return fail(`Section ownership: ${key} lead "${o.lead}" is not one of ${dept.join(", ")}`);
    if (o.queryOwner && !review.includes(o.queryOwner)) return fail(`Section ownership: ${key} queryOwner "${o.queryOwner}" is not one of ${review.join(", ")}`);
    const badCo = o.co.filter((x) => !isStr(x) || !review.includes(x));
    if (badCo.length) return fail(`Section ownership: ${key} co-reviewer ${badCo.map(String).join(", ")} is not one of ${review.join(", ")}`);
  }
  return { ok: true, value: v as unknown as OwnershipPayload };
}
export function parseRmesCriteria(text: string): ParseResult<RmesCriteriaPayload> {
  const j = json(text);
  if (!j.ok) return j;
  const v = j.value;
  if (!isObj(v) || !Array.isArray(v.criteria)) return fail("RMES criteria: { criteria: [...] } expected");
  for (const c of v.criteria) if (!isObj(c) || !isStr(c.code) || !isStr(c.part) || !isStr(c.title) || (c.dept !== "SAF" && c.dept !== "REG")) return fail("RMES criteria: code, part, title and dept SAF/REG per criterion");
  // F7: Criteria_Part is a list column (CIQ_RMES_Part)
  const parts = listValues("CIQ_RMES_Part");
  for (const c of v.criteria as { code: string; part: string }[]) if (!parts.includes(c.part)) return fail(`RMES criteria: ${c.code} part "${c.part}" is not one of ${parts.join(", ")}`);
  return { ok: true, value: v as unknown as RmesCriteriaPayload };
}
export function parseTextBundle(text: string): ParseResult<TextBundlePayload> {
  const j = json(text);
  if (!j.ok) return j;
  const v = j.value;
  if (!isObj(v) || !isObj(v.texts) || !Object.values(v.texts).every(isStr)) return fail("Text bundle: { texts: { <textKey>: text } } expected");
  return { ok: true, value: v as unknown as TextBundlePayload };
}
/** Settings with defaults; countsPolicy is the only flag Settings may carry (§7.11). */
export function parseSettings(text: string): ParseResult<SettingsPayload> {
  const j = json(text);
  if (!j.ok) return j;
  const v = j.value;
  if (!isObj(v)) return fail("Settings: an object expected");
  const s: SettingsPayload = {
    deptReviewMode: typeof v.deptReviewMode === "boolean" ? v.deptReviewMode : DEFAULT_SETTINGS.deptReviewMode,
    overallApprovalRequired: typeof v.overallApprovalRequired === "boolean" ? v.overallApprovalRequired : DEFAULT_SETTINGS.overallApprovalRequired,
    defaultSupplierDueDays: typeof v.defaultSupplierDueDays === "number" ? v.defaultSupplierDueDays : DEFAULT_SETTINGS.defaultSupplierDueDays,
    reactivationDays: typeof v.reactivationDays === "number" ? v.reactivationDays : DEFAULT_SETTINGS.reactivationDays,
  };
  const cp = countsPolicyFrom(v);
  if (cp.source === "settings") s.countsPolicy = cp.policy;
  return { ok: true, value: s };
}

/** Parser per Config_Kind (kinds without a schema return the raw JSON). */
export function parsePayload(kind: string, text: string): ParseResult<unknown> {
  switch (kind) {
    case "Template":
      return parseTemplate(text);
    case "Section definition":
      return parseSectionDefinition(text);
    case "Section ownership":
      return parseOwnership(text);
    case "RMES criteria":
      return parseRmesCriteria(text);
    case "Text bundle":
      return parseTextBundle(text);
    case "Settings":
      return parseSettings(text);
    case "Release":
      return parseManifest(text);
    default:
      return json(text);
  }
}

/** sha256 hex of a string (Web Crypto). */
export async function sha256Hex(text: string): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error("Web Crypto is not available, so the content hash cannot be checked.");
  const buf = await subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Content hash check of one config row against its manifest entry. */
export async function checkContentHash(row: Pick<ConfigVM, "payloadJson" | "configKey">, entry: Pick<ManifestEntry, "contentHash" | "configKey">): Promise<{ ok: boolean; expected: string; actual: string }> {
  const actual = await sha256Hex(row.payloadJson);
  return { ok: actual === entry.contentHash, expected: entry.contentHash, actual };
}

/**
 * The pinned release for a new case (§8.3): Config_Kind "Release", Config_State "Published", Release_Stage "Live"
 * (or "Test" when the case is a test case), newest Published_At.
 */
export function pickPinnedRelease(rows: ConfigVM[], o: { test?: boolean } = {}): ConfigVM | null {
  const stage = o.test ? "Test" : "Live";
  return rows.filter((r) => r.kind === "Release" && r.state === "Published" && r.releaseStage === stage).sort((a, b) => String(b.publishedAt).localeCompare(String(a.publishedAt)))[0] ?? null;
}

export interface PinnedConfig {
  release: ConfigVM;
  manifest: ManifestEntry[];
  /** Rows by manifest entry (missing rows are listed in problems). */
  rows: Map<string, ConfigVM>;
  settings: SettingsPayload;
  countsPolicy: CountsPolicy;
  countsPolicySource: "settings" | "default";
  problems: string[];
  /** Entries whose stored payload no longer matches the manifest hash (blocks S2; F8 config.hash.mismatch). */
  hashMismatches: { configKey: string; expected: string; actual: string }[];
}

/** Resolves the pinned release (by Release_Item_Id, else the Live/Test pick), its manifest and Settings. */
export async function loadPinnedConfig(rows: ConfigVM[], releaseItemId?: string, o: { test?: boolean; checkHashes?: boolean } = {}): Promise<PinnedConfig | null> {
  const release = (releaseItemId ? rows.find((r) => r._id === releaseItemId) : null) ?? (releaseItemId ? null : pickPinnedRelease(rows, o));
  if (!release) return null;
  const problems: string[] = [];
  const m = parseManifest(release.releaseManifestJson);
  const manifest = m.ok ? m.value : [];
  if (!m.ok) problems.push(`Release manifest: ${m.error}`);
  const byItem = new Map(rows.map((r) => [r._id, r]));
  const resolved = new Map<string, ConfigVM>();
  const hashMismatches: PinnedConfig["hashMismatches"] = [];
  for (const e of manifest) {
    const row = byItem.get(e.itemId);
    if (!row) {
      problems.push(`${e.configKey}: the row is not readable`);
      continue;
    }
    resolved.set(e.configKey, row);
    if (o.checkHashes) {
      try {
        const h = await checkContentHash(row, e);
        if (!h.ok) hashMismatches.push({ configKey: e.configKey, expected: h.expected, actual: h.actual });
      } catch (err) {
        problems.push(err instanceof Error ? err.message : String(err));
      }
    }
  }
  const settingsEntry = manifest.find((e) => e.kind === "Settings");
  const settingsRow = settingsEntry ? resolved.get(settingsEntry.configKey) : undefined;
  let settings = DEFAULT_SETTINGS;
  let rawSettings: unknown = undefined;
  if (settingsRow) {
    const s = parseSettings(settingsRow.payloadJson);
    if (s.ok) {
      settings = s.value;
      rawSettings = s.value;
    } else problems.push(`Settings: ${s.error}`);
  }
  const cp = countsPolicyFrom(rawSettings);
  return { release, manifest, rows: resolved, settings, countsPolicy: cp.policy, countsPolicySource: cp.source, problems, hashMismatches };
}

/** Rule_Set_Version for S2 and F4 (WB-D10): the pinned release's "Rule set" entry `<configKey>@<Version_Label>`,
 *  else `none (manual-wb-1)`. */
export function ruleSetVersion(pinned: Pick<PinnedConfig, "manifest" | "rows"> | null): string {
  const e = pinned?.manifest.find((x) => x.kind === "Rule set");
  if (!e) return NO_RULE_SET;
  const row = pinned!.rows.get(e.configKey);
  return row?.versionLabel ? ruleSetVersionKey(e.configKey, row.versionLabel) : NO_RULE_SET;
}
