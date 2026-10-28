// The configuration a case is pinned to (plan v5 §11.3, B-50): the sync service copies the case's Release row to
// CIQP_Request_A00.Config_Bundle_JSON (format "ciq-bundle/1", kissflow-build/sync/config.mjs portalBundle). The portal
// resolves every section, field and rule of the case from THAT bundle, never from the newest catalogue.
//
// The prototype's engine resolves versions through a ConfigState (catalog.ts templatePairOf, rules.ts ruleSetPairOf),
// and always serves the built-in first pair (RS-2026.1 + CIQ-2026 v1) from code. So each distinct bundle becomes one
// published pair under its own version keys, "<version> #<content hash>": a bundle is never confused with the
// built-in code or with another bundle that reuses a version label. Built-in fields keep their code-side checks
// (showWhen, validate) by id (catalog.ts hydrateField), as the bundle contract says.
import { FIRST_TEMPLATE } from "@/domain/catalog";
import { FIRST_RULE_SET, UNDEFINED_ORIGINS } from "@/domain/rules";
import type { ConfigPair, ConfigState, RuleData, SectionData, TemplateData } from "@/domain/types";
import { str, type RawItem } from "./raw";

export const BUNDLE_FORMAT = "ciq-bundle/1";

/** A rule as the bundle carries it: the prototype's RuleData without the internal basis and note (§11.3). */
export type BundleRule = Omit<RuleData, "basis" | "note"> & Partial<Pick<RuleData, "basis" | "note">>;

export interface ConfigBundle {
  format: typeof BUNDLE_FORMAT;
  release: { key: string; label: string; ruleSetVersion: string; templateVersion: string; manifestHash: string };
  ruleSet: { version: string; rules: BundleRule[] };
  template: TemplateData;
  settings: { undefinedOrigins: string[] };
}

/** One case's pinned configuration as the portal uses it. */
export interface Pin {
  /** The version keys the engine resolves (see the file comment). */
  ruleSetVersion: string;
  templateVersion: string;
  /** The labels the service wrote (for messages only). */
  label: string;
  /** Content hash of the bundle (FNV-1a over its canonical JSON); "" for the built-in fallback. */
  contentKey: string;
  /** The bundle itself; undefined when the request carries none and the built-in pair stands in. */
  bundle?: ConfigBundle;
  /** Why the built-in pair stands in, if it does. */
  problem?: string;
}

/** JSON with sorted keys and undefined left out: the sync service's canonicalJson (engine.mjs), byte for byte. */
export function canonicalJson(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v) ?? "null";
  if (Array.isArray(v)) return `[${v.map((x) => (x === undefined ? "null" : canonicalJson(x))).join(",")}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o)
    .filter((k) => o[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonicalJson(o[k])}`)
    .join(",")}}`;
}

/** FNV-1a (32 bit) as 8 hex digits: a fast, synchronous content key. Not a security hash. */
export function fnv1a(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/** SHA-256 hex of the canonical JSON (Config_Bundle_Hash), or undefined where the browser offers no WebCrypto. */
export async function sha256Hex(text: string): Promise<string | undefined> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return undefined;
  const buf = await subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);

/** The bundle on a request, checked for the shape the engine needs. */
export function parseBundle(raw: unknown): { bundle?: ConfigBundle; problem?: string } {
  if (typeof raw !== "string" || !raw.trim()) return { problem: "no pinned questionnaire version on the request yet" };
  let b: unknown;
  try {
    b = JSON.parse(raw);
  } catch {
    return { problem: "the pinned questionnaire version can't be read (not JSON)" };
  }
  if (!isObj(b) || b.format !== BUNDLE_FORMAT) return { problem: `the pinned questionnaire version has an unknown format (${isObj(b) ? String(b.format) : typeof b})` };
  const rs = b.ruleSet;
  const tpl = b.template;
  if (!isObj(rs) || typeof rs.version !== "string" || !Array.isArray(rs.rules)) return { problem: "the pinned rule set is incomplete" };
  if (!isObj(tpl) || typeof tpl.version !== "string" || !Array.isArray(tpl.sections)) return { problem: "the pinned questionnaire is incomplete" };
  const badRule = (rs.rules as unknown[]).find((r) => !isObj(r) || typeof r.id !== "string" || !isObj(r.condition) || !Array.isArray(r.activates));
  if (badRule) return { problem: "a rule of the pinned rule set is incomplete" };
  const badSection = (tpl.sections as unknown[]).find((s) => !isObj(s) || typeof s.id !== "string" || !Array.isArray(s.fields));
  if (badSection) return { problem: "a section of the pinned questionnaire is incomplete" };
  const release = isObj(b.release) ? b.release : {};
  const settings = isObj(b.settings) ? b.settings : {};
  return {
    bundle: {
      format: BUNDLE_FORMAT,
      release: {
        key: String(release.key ?? ""),
        label: String(release.label ?? `${rs.version} + ${tpl.version}`),
        ruleSetVersion: String(release.ruleSetVersion ?? rs.version),
        templateVersion: String(release.templateVersion ?? tpl.version),
        manifestHash: String(release.manifestHash ?? ""),
      },
      ruleSet: { version: rs.version, rules: rs.rules as BundleRule[] },
      template: { version: tpl.version, sections: tpl.sections as SectionData[] },
      settings: { undefinedOrigins: Array.isArray(settings.undefinedOrigins) ? (settings.undefinedOrigins as string[]) : [...UNDEFINED_ORIGINS] },
    },
  };
}

const BUILTIN_PIN: Pin = { ruleSetVersion: FIRST_RULE_SET, templateVersion: FIRST_TEMPLATE, label: `${FIRST_RULE_SET} + ${FIRST_TEMPLATE}`, contentKey: "" };

/** The pin of a request: its bundle under content-keyed versions, else the built-in first pair with the reason. */
export function pinOf(request: RawItem | undefined): Pin {
  const { bundle, problem } = parseBundle(request?.Config_Bundle_JSON);
  if (!bundle) return { ...BUILTIN_PIN, problem: problem ?? "no pinned questionnaire version" };
  const contentKey = fnv1a(canonicalJson(bundle));
  return { ruleSetVersion: `${bundle.ruleSet.version} #${contentKey}`, templateVersion: `${bundle.template.version} #${contentKey}`, label: bundle.release.label, contentKey, bundle };
}

/** A bundle rule as engine data. The basis is internal and never shown to suppliers; "document" stands in. */
const ruleData = (r: BundleRule): RuleData => ({ ...r, basis: r.basis ?? "document" }) as RuleData;

/** One published pair per distinct bundle; the configuration the portal's screens and engine resolve against. */
export function configOf(pins: Pin[]): ConfigState {
  const pairs: ConfigPair[] = [];
  const seen = new Set<string>();
  for (const p of pins) {
    if (!p.bundle || seen.has(p.contentKey)) continue;
    seen.add(p.contentKey);
    pairs.push({
      ruleSet: { version: p.ruleSetVersion, rules: p.bundle.ruleSet.rules.map(ruleData) },
      template: { version: p.templateVersion, sections: p.bundle.template.sections },
      status: "published",
      basedOn: { ruleSetVersion: p.bundle.ruleSet.version, templateVersion: p.bundle.template.version },
      note: "",
      createdAt: "",
      createdBy: "",
      changeNote: p.label,
    });
  }
  return { pairs };
}

/** Does the request's Config_Bundle_Hash match its bundle? undefined when it can't be checked (no hash, no WebCrypto). */
export async function bundleHashMatches(request: RawItem): Promise<boolean | undefined> {
  const want = str(request, "Config_Bundle_Hash").trim().toLowerCase();
  const { bundle } = parseBundle(request.Config_Bundle_JSON);
  if (!want || !bundle) return undefined;
  const raw = JSON.parse(String(request.Config_Bundle_JSON)) as unknown;
  const got = await sha256Hex(canonicalJson(raw));
  return got === undefined ? undefined : got === want;
}
