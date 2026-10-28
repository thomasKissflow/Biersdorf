// CIQ Config Version rows → the prototype's configuration (DESIGN §5.2; reader E §2): a TypeScript port of the sync
// service's configFromRows (kissflow-build/sync/config.mjs:13-56), with reader E's fixes:
//   (a) a Retired row without Published_At is a discarded draft, never a published pair;
//   (b) Release rows are deduplicated by Release_Key (the newest row wins, with a warning);
//   (c) the singletons are chosen by Config_Key (OWN:current, REM:current, SET:current) before the newest Published row
//       of their kind (a stray test row such as ZZT-…-CFG is never picked);
//   (d) createdBy "seed" reads as "system" (userName shows "System", not a raw id);
//   (e) Published_By._id becomes publishedBy;
//   (f) the same rows give the same objects (identity), because syncRegistry and the catalogue caches key on it.
// The built-in first pair (RS-2026.1 + v1) is never stored in ConfigState: the prototype serves it from code
// (configActions.ts FIRST_PAIR). Pure apart from the memo of (f); verifyConfig is the only async (WebCrypto) part.
// What the reader had to work around (an ignored or duplicated release row, several drafts, a missing singleton) is a
// note, not a warning: the prod seed has none of it, so only odd dev rows trigger it (FE-CLEANUP B4, B5; Diagnostics
// and the dev shell list notes). A missing singleton says nothing when no row was read at all: the failed read is the
// warning then (load.ts).
import { BUILTIN_SECTIONS, FIRST_TEMPLATE, builtinTemplateData } from "@/domain/catalog";
import { FIRST_PAIR, type PairRef } from "@/domain/configActions";
import { RS1 } from "@/domain/builtinRules";
import { baseState } from "@/domain/seed";
import type { AppState, ConfigPair, ConfigState, ReminderSetting, RuleData, SectionData } from "@/domain/types";
import { canonicalJson, sha256Hex } from "@/portal/data/bundle";
import { json, refUser, str, type RawItem } from "@/portal/data/raw";
import type { ReleaseRow } from "../types";

type Obj = Record<string, unknown>;
const isObj = (x: unknown): x is Obj => !!x && typeof x === "object" && !Array.isArray(x);
const STATES = new Set<ReleaseRow["state"]>(["Draft", "Published", "Retired"]);
/** Config_State; a blank state reads as Published (config.mjs stateOf). */
const stateOf = (r: RawItem): ReleaseRow["state"] => {
  const s = str(r, "Config_State").trim() as ReleaseRow["state"];
  return STATES.has(s) ? s : "Published";
};
const time = (iso: string) => {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : 0;
};
const newest = (a: RawItem, b: RawItem) => time(str(b, "_modified_at") || str(b, "_created_at")) - time(str(a, "_modified_at") || str(a, "_created_at"));

export const SINGLETON_KEYS = { ownership: "OWN:current", reminders: "REM:current", settings: "SET:current" } as const;

export interface ConfigRead {
  cfg: ConfigState;
  ownership: AppState["ownership"];
  reminders: ReminderSetting[];
  /** SET:current Payload_JSON (undefinedOrigins, defaultReviewers, basisLabels, webhooks once configured). */
  settings: Record<string, unknown>;
  /** Every Release row (each Release_Key once), the built-in first pair's included, in any state. */
  releases: ReleaseRow[];
  /** How odd rows were read (dev only). */
  notes: string[];
}

interface ParsedRelease {
  row: RawItem;
  bundle: Obj;
  state: ReleaseRow["state"];
  key: string;
  ruleSetVersion: string;
  templateVersion: string;
}

function parseRelease(row: RawItem, notes: string[]): ParsedRelease | undefined {
  const bundle = json<unknown>(row, "Release_Bundle_JSON", undefined);
  const manifest = json<unknown>(row, "Release_Manifest_JSON", {});
  const b = isObj(bundle) ? bundle : {};
  const m = isObj(manifest) ? manifest : {};
  const rs = isObj(b.ruleSet) ? b.ruleSet : {};
  const tpl = isObj(b.template) ? b.template : {};
  const ruleSetVersion = String(m.ruleSetVersion ?? rs.version ?? "");
  const templateVersion = String(m.templateVersion ?? tpl.version ?? "");
  const key = str(row, "Release_Key") || str(row, "Version_Label") || str(row, "Config_Key").replace(/^REL:/, "");
  if (!ruleSetVersion || !templateVersion) {
    notes.push(`Configuration release ${key || row._id} does not name its rule set and questionnaire versions; it is ignored.`);
    return undefined;
  }
  return { row, bundle: b, state: stateOf(row), key: key || `${ruleSetVersion} + ${templateVersion}`, ruleSetVersion, templateVersion };
}

const isFirstPair = (p: PairRef) => p.ruleSetVersion === FIRST_PAIR.ruleSetVersion && p.templateVersion === FIRST_PAIR.templateVersion;

/** One release as a stored pair (config.mjs pairOf), with fixes (d) and (e). */
function pairOf(r: ParsedRelease, notes: string[]): ConfigPair | undefined {
  const rs = isObj(r.bundle.ruleSet) ? r.bundle.ruleSet : undefined;
  const tpl = isObj(r.bundle.template) ? r.bundle.template : undefined;
  if (!rs || !Array.isArray(rs.rules) || !tpl || !Array.isArray(tpl.sections)) {
    notes.push(`Configuration release ${r.key} has no readable rule set or questionnaire; it is ignored.`);
    return undefined;
  }
  const basedOn = isObj(r.bundle.basedOn) && typeof r.bundle.basedOn.ruleSetVersion === "string" && typeof r.bundle.basedOn.templateVersion === "string" ? { ruleSetVersion: r.bundle.basedOn.ruleSetVersion, templateVersion: r.bundle.basedOn.templateVersion } : { ruleSetVersion: FIRST_PAIR.ruleSetVersion, templateVersion: FIRST_PAIR.templateVersion };
  const createdBy = typeof r.bundle.createdBy === "string" && r.bundle.createdBy && r.bundle.createdBy !== "seed" ? r.bundle.createdBy : "system";
  const publishedAt = str(r.row, "Published_At");
  const publishedBy = refUser(r.row, "Published_By")?.id;
  return {
    ruleSet: { version: String(rs.version ?? r.ruleSetVersion), rules: rs.rules as RuleData[] },
    template: { version: String(tpl.version ?? r.templateVersion), sections: tpl.sections as SectionData[] },
    status: r.state === "Draft" ? "draft" : "published",
    basedOn,
    note: typeof r.bundle.note === "string" ? r.bundle.note : "",
    createdAt: (typeof r.bundle.createdAt === "string" && r.bundle.createdAt) || str(r.row, "_created_at"),
    createdBy,
    changeNote: str(r.row, "Change_Note") || (typeof r.bundle.changeNote === "string" ? r.bundle.changeNote : ""),
    ...(publishedAt && r.state !== "Draft" ? { publishedAt } : {}),
    ...(publishedBy && r.state !== "Draft" ? { publishedBy } : {}),
  };
}

/** A singleton's Payload_JSON: the row with its Config_Key, else the newest Published row of the kind (fix c). */
function singleton(rows: RawItem[], key: string, kind: string): Obj | undefined {
  const byKey = rows.filter((r) => str(r, "Config_Key") === key && stateOf(r) !== "Draft").sort(newest)[0];
  const row =
    byKey ??
    rows
      .filter((r) => str(r, "Config_Kind") === kind && stateOf(r) === "Published")
      .sort((a, b) => time(str(b, "Published_At")) - time(str(a, "Published_At")))[0];
  const v = json<unknown>(row, "Payload_JSON", undefined);
  return isObj(v) ? v : undefined;
}

const defaultOwnership = (): AppState["ownership"] => Object.fromEntries(BUILTIN_SECTIONS.map((x) => [x.id, { lead: x.lead, co: [...x.co] }]));

/** The identity key of fix (f): the rows' ids, keys, states, hashes and timestamps. */
const rowsKey = (rows: RawItem[]) =>
  rows
    .map((r) => [r._id, str(r, "Config_Key"), str(r, "Config_State"), str(r, "Content_Hash"), str(r, "Manifest_Hash"), str(r, "Published_At"), str(r, "_modified_at"), refUser(r, "Published_By")?.id ?? ""].join("|"))
    .sort()
    .join("\n");
let memo: { key: string; out: ConfigRead } | undefined;

/** The configuration the internal screens render: `cfg` = the stored pairs (published oldest first, then at most one
 *  draft), the singletons, and every Release row for the case pins and createCase. */
export function configFromRows(rows: RawItem[]): ConfigRead {
  const key = rowsKey(rows);
  if (memo && memo.key === key) return memo.out;
  const notes: string[] = [];

  // Release rows: each Release_Key once (fix b)
  const parsed = rows.filter((r) => str(r, "Config_Kind") === "Release").map((r) => parseRelease(r, notes)).filter((r): r is ParsedRelease => !!r);
  const byKey = new Map<string, ParsedRelease[]>();
  for (const r of parsed) byKey.set(r.key, [...(byKey.get(r.key) ?? []), r]);
  const releases: ParsedRelease[] = [];
  for (const [k, list] of byKey) {
    const sorted = [...list].sort((a, b) => newest(a.row, b.row));
    if (sorted.length > 1) notes.push(`Configuration release ${k} appears ${sorted.length} times; the newest row is used.`);
    releases.push(sorted[0]!);
  }

  // The stored pairs: the built-in first pair stays in code (configActions.ts FIRST_PAIR)
  const stored = releases.filter((r) => !isFirstPair(r));
  const published = stored
    .filter((r) => r.state === "Published" || (r.state === "Retired" && !!str(r.row, "Published_At"))) // fix (a)
    .sort((a, b) => time(str(a.row, "Published_At")) - time(str(b.row, "Published_At")));
  const drafts = stored.filter((r) => r.state === "Draft").sort((a, b) => newest(a.row, b.row));
  if (drafts.length > 1) notes.push(`${drafts.length} configuration drafts exist; only the newest (${drafts[0]!.key}) is shown.`);
  const pairs = [...published, ...drafts.slice(0, 1)].map((r) => pairOf(r, notes)).filter((p): p is ConfigPair => !!p);

  const own = singleton(rows, SINGLETON_KEYS.ownership, "Section ownership")?.ownership;
  if (!isObj(own) && rows.length) notes.push("The section ownership row (OWN:current) could not be read; the built-in owners are shown.");
  const rem = singleton(rows, SINGLETON_KEYS.reminders, "Reminders")?.reminders;
  if (!Array.isArray(rem) && rows.length) notes.push("The reminder settings row (REM:current) could not be read; the built-in reminders are shown.");
  const settings = singleton(rows, SINGLETON_KEYS.settings, "Settings") ?? {};

  const out: ConfigRead = {
    cfg: { pairs },
    ownership: isObj(own) ? (own as AppState["ownership"]) : defaultOwnership(),
    reminders: Array.isArray(rem) ? (rem as ReminderSetting[]) : baseState([], []).reminders,
    settings,
    releases: releases.map((r) => ({ itemId: r.row._id, key: r.key, ruleSetVersion: r.ruleSetVersion, templateVersion: r.templateVersion, state: r.state, raw: r.row })),
    notes,
  };
  memo = { key, out };
  return out;
}

/** SET:current Payload_JSON (fix c), {} when missing. */
export function settingsOf(rows: RawItem[]): Record<string, unknown> {
  return configFromRows(rows).settings;
}

/** The Published Release row of a pair (what createCase pins, caseStartPayload's `release`). */
export function releaseForPair(releases: ReleaseRow[], pair: PairRef): ReleaseRow | undefined {
  return releases.find((r) => r.state === "Published" && r.ruleSetVersion === pair.ruleSetVersion && r.templateVersion === pair.templateVersion);
}

/**
 * Fingerprint checks (reader E §1 "Hashes", §2.2): warnings, never blockers.
 * - every row's Content_Hash = sha256(canonicalJson(Payload_JSON)), for a Release of Release_Bundle_JSON;
 * - a Release's Manifest_Hash = sha256(canonicalJson(manifest)), and the manifest's ruleSetHash / templateHash equal the
 *   Content_Hash of its RS / TPL rows;
 * - the stored first pair equals the code that serves it (the reader drops those rows and trusts code).
 * The stored text is plain JSON.stringify, so each value is parsed, canonicalised, then hashed.
 */
export async function verifyConfig(rows: RawItem[]): Promise<string[]> {
  const out: string[] = [];
  const hash = (v: unknown) => sha256Hex(canonicalJson(v));
  if (!(await hash({}))) return ["This browser can't check the configuration fingerprints (no WebCrypto)."];
  const label = (r: RawItem) => str(r, "Config_Key") || r._id;
  const contentHashOf = new Map<string, string>();
  for (const r of rows) {
    const want = str(r, "Content_Hash").trim().toLowerCase();
    const isRelease = str(r, "Config_Kind") === "Release";
    const payload = json<unknown>(r, isRelease ? "Release_Bundle_JSON" : "Payload_JSON", undefined);
    if (str(r, "Config_Key")) contentHashOf.set(str(r, "Config_Key"), want);
    if (!want) continue;
    if (payload === undefined) {
      out.push(`${label(r)}: its content can't be read to check the fingerprint.`);
      continue;
    }
    if ((await hash(payload)) !== want) out.push(`${label(r)}: the content does not match its fingerprint (Content_Hash).`);
    if (!isRelease) continue;
    const manifest = json<unknown>(r, "Release_Manifest_JSON", undefined);
    const mh = str(r, "Manifest_Hash").trim().toLowerCase();
    if (isObj(manifest) && mh && (await hash(manifest)) !== mh) out.push(`${label(r)}: the manifest does not match its fingerprint (Manifest_Hash).`);
    if (isObj(manifest) && typeof manifest.bundleHash === "string" && manifest.bundleHash !== want) out.push(`${label(r)}: the manifest names another bundle fingerprint.`);
  }
  // the manifests' references to their rule set and questionnaire rows
  for (const r of rows.filter((x) => str(x, "Config_Kind") === "Release")) {
    const m = json<unknown>(r, "Release_Manifest_JSON", undefined);
    if (!isObj(m)) continue;
    for (const [k, h] of [
      [m.ruleSetKey, m.ruleSetHash],
      [m.templateKey, m.templateHash],
    ] as const) {
      if (typeof k !== "string" || typeof h !== "string") continue;
      const got = contentHashOf.get(k);
      if (got === undefined) out.push(`${label(r)}: the row ${k} it names is missing.`);
      else if (got && got !== h) out.push(`${label(r)}: ${k} has another fingerprint than the release names.`);
    }
  }
  // the stored first pair against the code that serves it
  const rs1 = rows.find((r) => str(r, "Config_Key") === `RS:${FIRST_PAIR.ruleSetVersion}`);
  if (rs1 && str(rs1, "Content_Hash") && (await hash({ version: RS1.version, rules: RS1.rules })) !== str(rs1, "Content_Hash").trim().toLowerCase())
    out.push(`RS:${FIRST_PAIR.ruleSetVersion} differs from the built-in rule set the app uses for it.`);
  const tpl1 = rows.find((r) => str(r, "Config_Key") === `TPL:${FIRST_TEMPLATE}`);
  if (tpl1 && str(tpl1, "Content_Hash")) {
    const code = builtinTemplateData(FIRST_TEMPLATE, defaultOwnership());
    if ((await hash({ version: code.version, sections: code.sections })) !== str(tpl1, "Content_Hash").trim().toLowerCase()) out.push(`TPL:${FIRST_TEMPLATE} differs from the built-in questionnaire the app uses for it.`);
  }
  return out;
}
