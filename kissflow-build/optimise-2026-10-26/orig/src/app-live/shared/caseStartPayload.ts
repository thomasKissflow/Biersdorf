// The CIQ Case Start fields that integration I-1 copies into the supplier's CIQP Request (plan v6 §3.2, §4). Written
// by the RMM's screen at "Create case", so the portal gets exactly what the sync service used to write:
//   Config_Bundle_JSON      the supplier-safe bundle of the pinned release ("ciq-bundle/1", parsed by the portal's
//                           src/portal/data/bundle.ts parseBundle): no rule basis or notes (plan v5 §11.3)
//   Config_Bundle_Hash      SHA-256 hex of its canonical JSON (the portal checks it: bundle.ts bundleHashMatches)
//   BDF_Set_JSON            the values Beiersdorf sets, shown to the supplier read-only (B-05)
//   Case_Contacts_JSON      [{id, name, email, title, mayConfirm}] (the portal's map.ts caseContactsOf)
//   Portal_Assignees_JSON   [{"_id": portal user id}] of the active contacts: CIQP Request Assigned_Contacts
//   Release_Assignees_JSON  the same list (every contact; only those who may confirm can release: MORNING-16 decision 2)
// Pure: no SDK, no Kissflow call. The canonical JSON and the hash are the portal's own functions, so both ends agree.
import { BDF_SET_FIELDS } from "@/domain/selectors";
import type { AnswerValue, Market, RuleData, TemplateData } from "@/domain/types";
import { BUNDLE_FORMAT, canonicalJson, sha256Hex, type ConfigBundle } from "@/portal/data/bundle";

/** The six CIQ Case fields this module fills (the first five added 20 Oct; Case_Contacts_JSON existed). */
export const CASE_START_FIELDS = {
  configBundle: "Config_Bundle_JSON",
  configBundleHash: "Config_Bundle_Hash",
  bdfSet: "BDF_Set_JSON",
  caseContacts: "Case_Contacts_JSON",
  portalAssignees: "Portal_Assignees_JSON",
  releaseAssignees: "Release_Assignees_JSON",
} as const;

/** A Release row of CIQ Config Version, as the screen reads it (its JSON fields parsed or still as text). */
export interface ReleaseRowInput {
  Release_Key?: string;
  Manifest_Hash?: string;
  /** `{ ruleSet: {version, rules}, template: {version, sections}, settings: {undefinedOrigins} }` (text or parsed). */
  Release_Bundle_JSON: string | { ruleSet?: { version?: string; rules?: RuleData[] }; template?: Partial<TemplateData>; settings?: { undefinedOrigins?: string[] } };
  /** `{ ruleSetVersion, templateVersion, … }` (text or parsed). */
  Release_Manifest_JSON?: string | { ruleSetVersion?: string; templateVersion?: string };
}

/** A supplier contact as the case carries it. Only contacts with a portal user id can hold portal steps. */
export interface StartContact {
  portalUserId?: string;
  name: string;
  email: string;
  title?: string;
  mayConfirm: boolean;
  active?: boolean;
}

export interface CaseStartInput {
  release: ReleaseRowInput;
  /** Fallback for the bundle's `settings.undefinedOrigins` when the release carries none (the Settings row). */
  undefinedOrigins?: string[];
  contacts: StartContact[];
  /** The Beiersdorf-set answers by field id (FLD-GEN-001, -002, -003, -008, -009); others are ignored. */
  bdfAnswers: Partial<Record<string, AnswerValue>>;
  /** SF-11, set by the RMM (B-05). */
  markets: Market[];
}

export type CaseStartFields = Record<(typeof CASE_START_FIELDS)[keyof typeof CASE_START_FIELDS], string>;

const parsed = <T,>(v: string | T | undefined, what: string): T => {
  if (v === undefined || v === null || v === "") throw new Error(`The release has no ${what}.`);
  if (typeof v !== "string") return v;
  try {
    return JSON.parse(v) as T;
  } catch {
    throw new Error(`The release's ${what} is not valid JSON.`);
  }
};

/** The supplier-safe bundle of a Release row: byte-for-byte the shape the sync service wrote (config.mjs portalBundle). */
export function supplierBundle(release: ReleaseRowInput, undefinedOrigins: string[] = []): ConfigBundle {
  const bundle = parsed<Exclude<ReleaseRowInput["Release_Bundle_JSON"], string>>(release.Release_Bundle_JSON, "bundle");
  const manifest = release.Release_Manifest_JSON ? parsed<{ ruleSetVersion?: string; templateVersion?: string }>(release.Release_Manifest_JSON, "manifest") : {};
  const rsv = manifest.ruleSetVersion ?? bundle.ruleSet?.version;
  const tplv = manifest.templateVersion ?? bundle.template?.version;
  if (!rsv || !tplv) throw new Error("The release does not name its rule set and questionnaire versions.");
  if (!Array.isArray(bundle.template?.sections) || !bundle.template.sections.length) throw new Error("The release's questionnaire has no sections.");
  return {
    format: BUNDLE_FORMAT,
    release: { key: release.Release_Key ?? `${rsv} + ${tplv}`, label: `${rsv} + ${tplv}`, ruleSetVersion: rsv, templateVersion: tplv, manifestHash: release.Manifest_Hash ?? "" },
    // supplier-safe: the internal rule basis and note are left out (plan v5 §11.3)
    ruleSet: { version: rsv, rules: (bundle.ruleSet?.rules ?? []).map(({ basis: _b, note: _n, ...r }) => (void _b, void _n, r)) },
    template: { version: tplv, sections: bundle.template.sections } as TemplateData,
    settings: { undefinedOrigins: bundle.settings?.undefinedOrigins ?? undefinedOrigins },
  };
}

/** The values Beiersdorf sets, as the portal shows them locked (B-05): the five GEN fields and SF-11. */
export function bdfSet(bdfAnswers: CaseStartInput["bdfAnswers"], markets: Market[]): Record<string, unknown> {
  return { ...Object.fromEntries(BDF_SET_FIELDS.map((k) => [k, bdfAnswers[k] ?? null])), SF11: [...markets] };
}

/**
 * Every Start field, ready to write on the CIQ Case at "Create case". Throws (with a plain reason) when the release is
 * unusable or no active contact has a portal user, because then the supplier would get no task.
 */
export async function caseStartPayload(input: CaseStartInput): Promise<CaseStartFields> {
  const bundle = supplierBundle(input.release, input.undefinedOrigins);
  const canonical = canonicalJson(bundle);
  const hash = await sha256Hex(canonical);
  if (!hash) throw new Error("This browser can't compute the questionnaire fingerprint (no WebCrypto).");
  const active = input.contacts.filter((k) => k.active !== false);
  const withPortal = active.filter((k) => k.portalUserId);
  if (!withPortal.length) throw new Error("None of the active supplier contacts has a portal user yet, so nobody would get the questionnaire. Invite a contact to the portal first.");
  const assignees = JSON.stringify(withPortal.map((k) => ({ _id: k.portalUserId })));
  return {
    // the canonical text is stored, so the hash the portal recomputes over the parsed bundle matches by construction
    [CASE_START_FIELDS.configBundle]: canonical,
    [CASE_START_FIELDS.configBundleHash]: hash,
    [CASE_START_FIELDS.bdfSet]: JSON.stringify(bdfSet(input.bdfAnswers, input.markets)),
    // no id for a contact without a portal user (an empty id would merge such contacts into one person in the portal)
    [CASE_START_FIELDS.caseContacts]: JSON.stringify(active.map((k) => ({ ...(k.portalUserId ? { id: k.portalUserId } : {}), name: k.name, email: k.email, title: k.title ?? "", mayConfirm: k.mayConfirm }))),
    [CASE_START_FIELDS.portalAssignees]: assignees,
    [CASE_START_FIELDS.releaseAssignees]: assignees,
  } as CaseStartFields;
}
