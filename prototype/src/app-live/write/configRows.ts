// The CIQ Config Version rows of a configuration (DESIGN §6 "Configuration"; kissflow-build/CONFIGURATION-GUIDE.md):
// a TypeScript port of the sync service's serialiser that produced the prod seed (kissflow-build/sync/config.mjs
// releaseRows, row, bundleHash, the singleton rows of seedRows), byte for byte in every JSON text and hash:
//   a pair  → RS:<rule set> (Payload_JSON {version, rules}), TPL:<questionnaire> (Payload_JSON {version, sections}) and
//             REL:<rule set> + <vN> (Release_Bundle_JSON, Release_Manifest_JSON, Manifest_Hash), each with its
//             Content_Hash = sha256(canonicalJson(payload)) (the bundle's for a release);
//   a singleton → OWN:current / REM:current / SET:current … with Payload_JSON + Content_Hash.
// One deliberate difference: Published_At is written as a Kissflow DateTime without milliseconds ("…:00Z"), as Kissflow
// stores it (the prod seed, exported from dev, holds "2026-09-21T10:00:00Z" where config.mjs wrote ".000Z"); the bundle
// keeps the ISO time as given (the seed's bundle says "2026-09-21T10:00:00.000Z"). A Published_By user is written only
// when given (the seed has none). Pure apart from the hashing (WebCrypto, async).
import { pairLabel, type PairRef } from "@/domain/configActions";
import type { RuleData, SectionData } from "@/domain/types";
import { canonicalJson, sha256Hex } from "@/portal/data/bundle";
import type { KfData } from "@/portal/kf/sdk";
import { PlainError } from "../userText";
import { kfDateTimeOf } from "./encode";

/** Evaluator_Version on every row (the sync engine's EVALUATOR_VERSION). */
export const EVALUATOR_VERSION = "prototype-domain@vendor";

export type ConfigRowState = "Draft" | "Published" | "Retired";

/** The keys of a pair's rows and of the singletons (CONFIGURATION-GUIDE §1). */
export const CONFIG_KEY = {
  ruleSet: (version: string) => `RS:${version}`,
  template: (version: string) => `TPL:${version}`,
  /** "RS-2026.2 + v2" → "REL:RS-2026.2 + v2". */
  release: (pair: PairRef) => `REL:${pairLabel(pair.ruleSetVersion, pair.templateVersion)}`,
  ownership: "OWN:current",
  reminders: "REM:current",
  settings: "SET:current",
} as const;

export const NO_WEBCRYPTO_CONFIG = "This browser can't compute the configuration's fingerprints, so nothing was saved. Use a current browser.";

/** sha256(canonicalJson(v)), the fingerprint every row carries (config.mjs bundleHash). */
export async function contentHash(v: unknown): Promise<string> {
  const h = await sha256Hex(canonicalJson(v));
  if (!h) throw new PlainError(NO_WEBCRYPTO_CONFIG);
  return h;
}

const JSON_FIELDS = ["Payload_JSON", "Internal_Annotations_JSON", "Release_Manifest_JSON", "Release_Bundle_JSON", "Regression_Result_JSON"];

/** config.mjs row(): JSON fields as JSON.stringify text, undefined fields left out (an empty text stays). */
function row(fields: Record<string, unknown>): KfData {
  const out: Record<string, unknown> = { ...fields };
  for (const k of JSON_FIELDS) if (out[k] !== undefined && typeof out[k] !== "string") out[k] = JSON.stringify(out[k]);
  for (const k of Object.keys(out)) if (out[k] === undefined) delete out[k];
  return out as KfData;
}

/** What a pair's three rows are made of (config.mjs releaseRows' argument, plus Published_By). */
export interface PairRowsInput {
  ruleSet: { version: string; rules: readonly RuleData[] };
  template: { version: string; sections: readonly SectionData[] };
  state: ConfigRowState;
  /** ISO time; the bundle keeps it as given, Published_At is its Kissflow DateTime. */
  publishedAt?: string;
  /** A Kissflow user id: Published_By {_id}. */
  publishedBy?: string;
  changeNote: string;
  basedOn: PairRef | null;
  note: string;
  createdAt: string;
  createdBy: string;
  undefinedOrigins: readonly string[];
}

export interface PairRows {
  rs: KfData;
  tpl: KfData;
  rel: KfData;
  keys: { rs: string; tpl: string; rel: string };
  /** The Content_Hash of each row (the release's is its bundle's) and the release's Manifest_Hash. */
  hashes: { rs: string; tpl: string; rel: string; manifest: string };
}

/** The RS, TPL and REL rows of a pair (config.mjs releaseRows), byte-identical in every JSON text and hash. */
export async function pairRows(x: PairRowsInput): Promise<PairRows> {
  const rsPayload = { version: x.ruleSet.version, rules: x.ruleSet.rules };
  const tplPayload = { version: x.template.version, sections: x.template.sections };
  const rsHash = await contentHash(rsPayload);
  const tplHash = await contentHash(tplPayload);
  const bundle = { ruleSet: rsPayload, template: tplPayload, basedOn: x.basedOn, note: x.note, changeNote: x.changeNote, createdAt: x.createdAt, createdBy: x.createdBy, ...(x.publishedAt ? { publishedAt: x.publishedAt } : {}), settings: { undefinedOrigins: x.undefinedOrigins } };
  const bundleHash = await contentHash(bundle);
  const pair = { ruleSetVersion: x.ruleSet.version, templateVersion: x.template.version };
  const keys = { rs: CONFIG_KEY.ruleSet(pair.ruleSetVersion), tpl: CONFIG_KEY.template(pair.templateVersion), rel: CONFIG_KEY.release(pair) };
  const manifest = { ruleSetVersion: pair.ruleSetVersion, templateVersion: pair.templateVersion, ruleSetKey: keys.rs, templateKey: keys.tpl, ruleSetHash: rsHash, templateHash: tplHash, bundleHash, basedOn: x.basedOn, evaluatorVersion: EVALUATOR_VERSION };
  const manifestHash = await contentHash(manifest);
  const publishedAt = x.publishedAt ? kfDateTimeOf(x.publishedAt) || undefined : undefined;
  const common = { Config_State: x.state, Published_At: publishedAt, Change_Note: x.changeNote, Evaluator_Version: EVALUATOR_VERSION, ...(x.publishedBy ? { Published_By: { _id: x.publishedBy } } : {}) };
  const label = pairLabel(pair.ruleSetVersion, pair.templateVersion);
  return {
    rs: row({ Config_Key: keys.rs, Config_Kind: "Rule set", Version_Label: pair.ruleSetVersion, Payload_JSON: rsPayload, Content_Hash: rsHash, ...common }),
    tpl: row({ Config_Key: keys.tpl, Config_Kind: "Template", Version_Label: pair.templateVersion, Payload_JSON: tplPayload, Content_Hash: tplHash, ...common }),
    rel: row({
      Config_Key: keys.rel,
      Config_Kind: "Release",
      Version_Label: label,
      Release_Key: label,
      Release_Label: label,
      Release_Stage: "Live",
      Release_Manifest_JSON: manifest,
      Release_Bundle_JSON: bundle,
      Manifest_Hash: manifestHash,
      Content_Hash: bundleHash,
      ...common,
    }),
    keys,
    hashes: { rs: rsHash, tpl: tplHash, rel: bundleHash, manifest: manifestHash },
  };
}

/** The Config_Kind of each singleton key (the live list CIQ_Config_Kind_A00). */
export const SINGLETON_KIND: Record<string, string> = { "OWN:current": "Section ownership", "REM:current": "Reminders", "SET:current": "Settings", "RMES:current": "RMES criteria", "LIM:current": "Limit set", "REG:current": "Regression set" };

/** A singleton row (config.mjs seedRows' singleton): Version_Label "current", Published, with its Content_Hash. */
export async function singletonRow(key: string, payload: unknown, o: { publishedAt?: string; changeNote?: string; kind?: string } = {}): Promise<KfData> {
  return row({
    Config_Key: key,
    Config_Kind: o.kind ?? SINGLETON_KIND[key] ?? "Settings",
    Version_Label: "current",
    Config_State: "Published",
    Payload_JSON: payload,
    Content_Hash: await contentHash(payload),
    Published_At: o.publishedAt ? kfDateTimeOf(o.publishedAt) || undefined : undefined,
    Change_Note: o.changeNote,
    Evaluator_Version: EVALUATOR_VERSION,
  });
}

/** The fingerprint check of a row as read back: its content (Release_Bundle_JSON for a release, else Payload_JSON)
 *  hashes to its Content_Hash. Undefined when it does; else what is wrong. */
export async function fingerprintProblem(r: Record<string, unknown>): Promise<string | undefined> {
  const field = r.Config_Kind === "Release" ? "Release_Bundle_JSON" : "Payload_JSON";
  const text = r[field];
  const want = typeof r.Content_Hash === "string" ? r.Content_Hash.trim().toLowerCase() : "";
  if (typeof text !== "string" || !text.trim()) return `${field} is empty`;
  let v: unknown;
  try {
    v = JSON.parse(text);
  } catch {
    return `${field} is not valid JSON`;
  }
  if (!want) return "Content_Hash is empty";
  if ((await contentHash(v)) !== want) return `${field} does not match its Content_Hash`;
  if (field === "Release_Bundle_JSON") {
    const m = typeof r.Release_Manifest_JSON === "string" ? r.Release_Manifest_JSON : "";
    const mh = typeof r.Manifest_Hash === "string" ? r.Manifest_Hash.trim().toLowerCase() : "";
    try {
      const manifest = JSON.parse(m) as Record<string, unknown>;
      if (mh && (await contentHash(manifest)) !== mh) return "Release_Manifest_JSON does not match its Manifest_Hash";
      if (typeof manifest.bundleHash === "string" && manifest.bundleHash !== want) return "the manifest names another bundle fingerprint";
    } catch {
      return "Release_Manifest_JSON is not valid JSON";
    }
  }
  return undefined;
}
