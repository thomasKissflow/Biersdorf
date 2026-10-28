// Business Admin configuration (§8.13; BR-057; WB-11, WB-D6 [provisional]). Pure builders (unit-tested) plus the
// write sequences, which take the foundation Actions (so tests run them on the fake host).
//
// - Draft rows are editable; Published rows are read-only. "New version" copies a row into a NEW Draft
//   (copy-on-write): it never touches the source row.
// - Publish (Draft only): Config_State "Published", Published_By = me, Published_At = now, Content_Hash = sha256 of the
//   stored Payload_JSON (a Release: its Manifest_Hash), THEN an F8 Configuration row (config.publish / release.publish).
// - Retire (WB-D6, an accepted exception to BR-057): a verified F8 config.retire row FIRST, then ONE state-only patch
//   { Config_State: "Retired" } on the Published row. No other field of a Published row is ever written.
// - Release builder: Published rows → Release_Manifest_JSON [{configKey, kind, itemId, sectionKey?, sectionRev?,
//   contentHash}], Release_Bundle_JSON (full payloads) [convention], Manifest_Hash = sha256 of the manifest string
//   [convention]; create a Release Draft, then publish it and write release.publish.
// No delete anywhere (ground rule 9).
import { listValues } from "../../schema";
import { kfDateTime, ymd } from "../../data/normalize";
import type { Actions } from "../../data/actions";
import type { ConfigVM, Patch, SaveResult } from "../../data/viewModels";
import { parseManifest, parsePayload, parseSectionDefinition, parseTemplate, sha256Hex, type ManifestEntry, type ParseResult } from "../../domain/config";
import { configKey, releaseKey } from "../../domain/keys";
import { errorText } from "../../kf/sdk";

export const CONFIG_FLOW = "CIQ_Config_Version_A00" as const;
export const CONFIG_KINDS = listValues("CIQ_Config_Kind");
/** Kinds a release manifest may hold (a Release never contains a Release; the regression set is shown only). */
export const MANIFEST_KINDS = CONFIG_KINDS.filter((k) => k !== "Release" && k !== "Regression set");
export const TEMPLATE_KINDS = ["Template", "Section definition"];

export type ConfigRow = Pick<
  ConfigVM,
  "_id" | "configKey" | "kind" | "state" | "versionLabel" | "sectionKey" | "sectionRev" | "payloadJson" | "annotationsJson" | "changeNote" | "contentHash" | "evaluatorVersion" | "publishedAt" | "releaseKey" | "releaseManifestJson" | "manifestHash"
>;
type Row = ConfigRow;

// ---------------------------------------------------------------- keys and versions

const VERSION_RE = /-v(\d+)$/;
/** The key without its `-v<n>` suffix, and n (a key without a suffix counts as v1). */
export function splitVersion(key: string): { base: string; n: number } {
  const m = VERSION_RE.exec(key);
  return m ? { base: key.slice(0, m.index), n: Number(m[1]) } : { base: key, n: 1 };
}
/** 1 + the highest version among rows with the same key base. */
export function nextVersionNo(rows: readonly Pick<ConfigVM, "configKey">[], base: string): number {
  let max = 0;
  for (const r of rows) {
    const s = splitVersion(r.configKey);
    if (s.base === base) max = Math.max(max, s.n);
  }
  return max + 1;
}

/** Skeleton payloads per kind (§4.6 [convention]), so a new draft starts valid. */
export function payloadSkeleton(kind: string): string {
  const s: Record<string, unknown> = {
    Template: { sections: [{ sectionKey: "BASIC", default: "Mandatory" }] },
    "Section definition": { sectionKey: "NEW", code: "NEW", title: "New section", sort: 10, fields: [{ key: "field_1", label: "Field 1", type: "Text", required: true }] },
    "Section ownership": { owners: { BASIC: { lead: "RMM", co: [], queryOwner: "RMM" } } },
    "RMES criteria": { criteria: [{ code: "A1", part: "A", title: "Criterion", dept: "SAF" }] },
    "Text bundle": { texts: { "closing.overallRejection": "Thank you for the information you provided. Beiersdorf will not continue this qualification at this time." } },
    Settings: { deptReviewMode: false, overallApprovalRequired: false, defaultSupplierDueDays: 14, reactivationDays: 365 },
    // read by the Rule table page (features/admin-parity)
    "Rule set": { rules: [{ id: "R-1", question: "SF01", condition: "Always", activates: ["BASIC"], outcome: "Mandatory", evidence: [], departments: ["RMM"], basis: "assumption" }] },
  };
  return JSON.stringify(s[kind] ?? {}, null, 2);
}

/** Payload check per kind (the domain parsers), plus a non-blank sectionKey for a Section definition. */
export function validatePayload(kind: string, text: string): ParseResult<unknown> {
  const p = parsePayload(kind, text);
  if (!p.ok) return p;
  if (kind === "Section definition") {
    const d = parseSectionDefinition(text);
    if (d.ok && !d.value.sectionKey.trim()) return { ok: false, error: "Section definition: sectionKey must not be blank" };
  }
  return p;
}
/** Internal annotations: blank, or JSON. */
export function validateAnnotations(text: string): string | null {
  if (!text.trim()) return null;
  try {
    JSON.parse(text);
    return null;
  } catch (e) {
    return `Internal annotations: not JSON (${e instanceof Error ? e.message : String(e)})`;
  }
}
export function prettyJson(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

export interface NewConfigInput {
  kind: string;
  /** For kinds without a section: a short name in the key (default "main"). */
  name?: string;
  payloadJson: string;
  versionLabel?: string;
  changeNote?: string;
  annotationsJson?: string;
}

/** The F2 row for a brand-new Draft. Section definitions take Section_Key from the payload and Section_Rev = 1 + the
 *  highest existing rev for that key. */
export function newConfigData(i: NewConfigInput, rows: readonly Row[]): Record<string, unknown> {
  if (i.kind === "Release") throw new Error("A release is built with the release builder, not as a plain configuration.");
  if (!CONFIG_KINDS.includes(i.kind)) throw new Error(`Unknown configuration kind: ${i.kind}`);
  let sectionKey: string | undefined;
  let sectionRev: number | undefined;
  if (i.kind === "Section definition") {
    const d = parseSectionDefinition(i.payloadJson);
    if (!d.ok) throw new Error(d.error);
    sectionKey = d.value.sectionKey.trim();
    sectionRev = 1 + Math.max(0, ...rows.filter((r) => r.kind === "Section definition" && r.sectionKey === sectionKey).map((r) => r.sectionRev ?? 0));
  }
  const name = (sectionKey ?? (i.name?.trim() || "main")).replace(/\s+/g, "-");
  const base = splitVersion(configKey(i.kind, name, 1)).base;
  const n = nextVersionNo(rows, base);
  return compactRow({
    Config_Key: `${base}-v${n}`,
    Config_Kind: i.kind,
    Config_State: "Draft",
    Version_Label: i.versionLabel?.trim() || `v${n}`,
    Section_Key: sectionKey,
    Section_Rev: sectionRev,
    Payload_JSON: i.payloadJson,
    Change_Note: i.changeNote?.trim() || undefined,
    Internal_Annotations_JSON: i.annotationsJson?.trim() || undefined,
  });
}

/** "New version" (copy-on-write, j15): a NEW Draft with the same kind, section and payload, the next key version, and
 *  none of the publish fields. The source row is never written. Not for Release rows (build a new release instead). */
export function newVersionData(row: Row, rows: readonly Row[]): Record<string, unknown> {
  if (row.kind === "Release") throw new Error("A release is not versioned: build a new release instead.");
  const { base } = splitVersion(row.configKey);
  const n = nextVersionNo(rows, base);
  const sectionRev =
    row.kind === "Section definition" ? 1 + Math.max(row.sectionRev ?? 0, ...rows.filter((r) => r.kind === "Section definition" && r.sectionKey === row.sectionKey).map((r) => r.sectionRev ?? 0)) : (row.sectionRev ?? undefined);
  return compactRow({
    Config_Key: `${base}-v${n}`,
    Config_Kind: row.kind,
    Config_State: "Draft",
    Version_Label: `v${n}`,
    Section_Key: row.sectionKey || undefined,
    Section_Rev: sectionRev,
    Payload_JSON: row.payloadJson,
    Internal_Annotations_JSON: row.annotationsJson || undefined,
    Evaluator_Version: row.evaluatorVersion || undefined,
    Change_Note: `Copied from ${row.configKey}`,
  });
}

const compactRow = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== ""));

/** The edit patch of a Draft: only changed fields among the editable four (never a Published row: the caller checks). */
export function draftEditPatch(row: Row, next: { payloadJson: string; changeNote: string; versionLabel: string; annotationsJson: string }): Patch {
  if (row.state !== "Draft") throw new Error("Only a Draft can be edited (copy-on-write: use New version).");
  const fields: Patch["fields"] = {};
  if (next.payloadJson !== row.payloadJson) fields.Payload_JSON = next.payloadJson;
  if (next.changeNote !== row.changeNote) fields.Change_Note = next.changeNote;
  if (next.versionLabel !== row.versionLabel) fields.Version_Label = next.versionLabel;
  if (next.annotationsJson !== row.annotationsJson) fields.Internal_Annotations_JSON = next.annotationsJson;
  return { fields };
}

// ---------------------------------------------------------------- publish / retire

/** Content hash of a row at publish: sha256 of the STORED Payload_JSON; a Release uses its Manifest_Hash. */
export async function contentHashOf(row: Pick<Row, "kind" | "payloadJson" | "releaseManifestJson" | "manifestHash">): Promise<string> {
  if (row.kind === "Release") {
    const h = await sha256Hex(row.releaseManifestJson);
    if (row.manifestHash && row.manifestHash !== h) throw new Error("The release manifest does not match its Manifest_Hash: build a new release.");
    return h;
  }
  return sha256Hex(row.payloadJson);
}

export function publishPatch(me: { _id: string }, now: Date, hash: string): Patch {
  return { fields: { Config_State: "Published", Published_By: { _id: me._id }, Published_At: kfDateTime(now), Content_Hash: hash } };
}

/** The ONLY write a Published row ever gets (WB-D6): state only. */
export function retirePatch(): Patch {
  return { fields: { Config_State: "Retired" } };
}

export interface StepOutcome {
  save?: SaveResult;
  /** The F8 row: recorded, or the error. */
  audit?: { ok: true; eventKey: string } | { ok: false; message: string };
  /** A refusal before anything was written. */
  refused?: string;
}

/** Publish a Draft: the state patch (write-then-verify), THEN the F8 Configuration row (§8.13 order). */
export async function publishConfig(a: Pick<Actions, "updateFormRow" | "writeAudit">, row: Row, o: { me: { _id: string }; now: Date }): Promise<StepOutcome> {
  if (row.state !== "Draft") return { refused: `Only a Draft can be published (this row is ${row.state || "without a state"}).` };
  const v = row.kind === "Release" ? parseManifest(row.releaseManifestJson) : validatePayload(row.kind, row.payloadJson);
  if (!v.ok) return { refused: `Not published: ${v.error}` };
  let hash: string;
  try {
    hash = await contentHashOf(row);
  } catch (e) {
    return { refused: errorText(e) };
  }
  const save = await a.updateFormRow(CONFIG_FLOW, row._id, publishPatch(o.me, o.now, hash));
  if (!save.ok) return { save };
  const release = row.kind === "Release";
  let keys = row.configKey;
  if (release) {
    const m = parseManifest(row.releaseManifestJson);
    if (m.ok) keys = m.value.map((e) => e.configKey).join(",");
  }
  try {
    const r = await a.writeAudit({
      category: "Configuration",
      actionCode: release ? "release.publish" : "config.publish",
      objectKind: release ? "Release" : "Config",
      objectKey: release ? row.releaseKey || row.configKey : row.configKey,
      objectItemId: row._id,
      objectState: "Published",
      oldValueText: "Draft",
      newValueText: "Published",
      configKeys: keys,
    });
    return { save, audit: { ok: true, eventKey: r.eventKey } };
  } catch (e) {
    return { save, audit: { ok: false, message: errorText(e) } };
  }
}

/** Retire a Published row (WB-D6): F8 config.retire FIRST (verified, else stop), then the state-only patch. */
export async function retireConfig(a: Pick<Actions, "updateFormRow" | "writeAudit">, row: Row, reason: string): Promise<StepOutcome> {
  if (row.state !== "Published") return { refused: "Only a Published row can be retired." };
  if (!reason.trim()) return { refused: "A reason is required to retire a configuration." };
  let audit: StepOutcome["audit"];
  try {
    const r = await a.writeAudit({
      category: "Configuration",
      actionCode: "config.retire",
      objectKind: row.kind === "Release" ? "Release" : "Config",
      objectKey: row.configKey,
      objectItemId: row._id,
      objectState: "Retired",
      oldValueText: "Published",
      newValueText: "Retired",
      eventReason: reason.trim(),
      configKeys: row.configKey,
    });
    audit = { ok: true, eventKey: r.eventKey };
  } catch (e) {
    return { audit: { ok: false, message: errorText(e) }, refused: `The retirement could not be recorded, so nothing was changed (${errorText(e)}).` };
  }
  const save = await a.updateFormRow(CONFIG_FLOW, row._id, retirePatch());
  return { save, audit };
}

/** Writes the F8 publish row again (create-only) when the first attempt failed after a successful publish. */
export async function recordPublishEvent(a: Pick<Actions, "writeAudit">, row: Row): Promise<StepOutcome["audit"]> {
  try {
    const release = row.kind === "Release";
    const r = await a.writeAudit({ category: "Configuration", actionCode: release ? "release.publish" : "config.publish", objectKind: release ? "Release" : "Config", objectKey: release ? row.releaseKey || row.configKey : row.configKey, objectItemId: row._id, objectState: "Published", oldValueText: "Draft", newValueText: "Published", configKeys: row.configKey });
    return { ok: true, eventKey: r.eventKey };
  } catch (e) {
    return { ok: false, message: errorText(e) };
  }
}

// ---------------------------------------------------------------- release builder

/** Problems of a release selection (errors block; warnings show). One row per kind, except Section definitions:
 *  one per section key. Exactly one Template. Every Template section should have a Section definition. */
export function validateSelection(sel: readonly Row[]): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!sel.length) errors.push("Select at least one published configuration.");
  for (const r of sel) {
    if (r.state !== "Published") errors.push(`${r.configKey} is not Published.`);
    if (!MANIFEST_KINDS.includes(r.kind)) errors.push(`${r.configKey}: a ${r.kind} row cannot be part of a release.`);
  }
  const byKind = new Map<string, Row[]>();
  for (const r of sel) {
    const k = r.kind === "Section definition" ? `${r.kind}:${r.sectionKey}` : r.kind;
    byKind.set(k, [...(byKind.get(k) ?? []), r]);
  }
  for (const [k, rs] of byKind) if (rs.length > 1) errors.push(`Only one row per ${k.replace(":", " ")} (selected: ${rs.map((r) => r.configKey).join(", ")}).`);
  const templates = sel.filter((r) => r.kind === "Template");
  if (sel.length && templates.length === 0) errors.push("A release needs one Template.");
  const t = templates[0] ? parseTemplate(templates[0].payloadJson) : null;
  if (t?.ok) {
    const defined = new Set(sel.filter((r) => r.kind === "Section definition").map((r) => r.sectionKey));
    const missing = t.value.sections.map((s) => s.sectionKey).filter((k) => !defined.has(k));
    if (missing.length) warnings.push(`No Section definition selected for: ${missing.join(", ")}.`);
  }
  if (!sel.some((r) => r.kind === "Settings")) warnings.push("No Settings selected: cases fall back to the defaults (counts policy fail-closed).");
  return { errors, warnings };
}

const KIND_ORDER = (k: string) => {
  const i = CONFIG_KINDS.indexOf(k);
  return i < 0 ? 99 : i;
};

/** Content hashes recomputed from the stored payloads; a stored Content_Hash that differs is a mismatch. */
export async function hashSelection(sel: readonly Row[]): Promise<{ hashes: Map<string, string>; mismatches: string[] }> {
  const hashes = new Map<string, string>();
  const mismatches: string[] = [];
  for (const r of sel) {
    const h = await sha256Hex(r.payloadJson);
    hashes.set(r._id, h);
    if (r.contentHash && r.contentHash !== h) mismatches.push(`${r.configKey}: stored hash ${r.contentHash.slice(0, 10)}… ≠ payload ${h.slice(0, 10)}…`);
  }
  return { hashes, mismatches };
}

export function buildManifest(sel: readonly Row[], hashes: ReadonlyMap<string, string>): ManifestEntry[] {
  return [...sel]
    .sort((a, b) => KIND_ORDER(a.kind) - KIND_ORDER(b.kind) || a.sectionKey.localeCompare(b.sectionKey) || a.configKey.localeCompare(b.configKey))
    .map((r) => {
      const e: ManifestEntry = { configKey: r.configKey, kind: r.kind, itemId: r._id, contentHash: hashes.get(r._id) ?? r.contentHash };
      if (r.sectionKey) e.sectionKey = r.sectionKey;
      if (r.sectionRev !== null && r.sectionRev !== undefined) e.sectionRev = r.sectionRev;
      return e;
    });
}

/** [convention] The full bundle: every manifest entry with its version label and stored payload. */
export function buildBundle(sel: readonly Row[], manifest: readonly ManifestEntry[]): { configKey: string; kind: string; itemId: string; versionLabel: string; sectionKey?: string; sectionRev?: number; payloadJson: string }[] {
  const byId = new Map(sel.map((r) => [r._id, r]));
  return manifest.map((e) => {
    const r = byId.get(e.itemId)!;
    return { configKey: e.configKey, kind: e.kind, itemId: e.itemId, versionLabel: r.versionLabel, ...(e.sectionKey ? { sectionKey: e.sectionKey } : {}), ...(e.sectionRev !== undefined ? { sectionRev: e.sectionRev } : {}), payloadJson: r.payloadJson };
  });
}

/** `REL-<yyyymmdd>-<n>`: n = 1 + the releases already keyed for that day. */
export function nextReleaseKey(rows: readonly Pick<ConfigVM, "releaseKey">[], now: Date): string {
  const prefix = `REL-${ymd(now)}-`;
  const used = rows.map((r) => r.releaseKey).filter((k) => k.startsWith(prefix)).map((k) => Number(k.slice(prefix.length)) || 0);
  return releaseKey(now, Math.max(0, ...used) + 1);
}

export interface ReleaseInput {
  label: string;
  stage: "Test" | "Live" | "";
  changeNote: string;
}

export interface BuiltRelease {
  data: Record<string, unknown>;
  manifest: ManifestEntry[];
  manifestJson: string;
  manifestHash: string;
}

/** The Release Draft row (pure apart from hashing). Throws on a selection error or a hash mismatch. */
export async function buildRelease(sel: readonly Row[], i: ReleaseInput, rows: readonly Row[], now: Date): Promise<BuiltRelease> {
  const v = validateSelection(sel);
  if (v.errors.length) throw new Error(v.errors.join(" "));
  if (!i.label.trim()) throw new Error("A release label is required.");
  if (i.stage !== "Test" && i.stage !== "Live") throw new Error("Choose the release stage (Test or Live).");
  const { hashes, mismatches } = await hashSelection(sel);
  if (mismatches.length) throw new Error(`Content hash mismatch, so no release was built: ${mismatches.join("; ")}`);
  const manifest = buildManifest(sel, hashes);
  const manifestJson = JSON.stringify(manifest);
  const manifestHash = await sha256Hex(manifestJson);
  const relKey = nextReleaseKey(rows, now);
  const data = compactRow({
    Config_Key: configKey("Release", relKey, 1),
    Config_Kind: "Release",
    Config_State: "Draft",
    Version_Label: i.label.trim(),
    Release_Key: relKey,
    Release_Label: i.label.trim(),
    Release_Stage: i.stage,
    Release_Manifest_JSON: manifestJson,
    Release_Bundle_JSON: JSON.stringify(buildBundle(sel, manifest)),
    Manifest_Hash: manifestHash,
    Change_Note: i.changeNote.trim() || undefined,
  });
  return { data, manifest, manifestJson, manifestHash };
}

/** Build → create the Release Draft (create lane) → publish it → F8 release.publish. */
export async function createRelease(
  a: Pick<Actions, "createFormRow" | "updateFormRow" | "writeAudit">,
  sel: readonly Row[],
  i: ReleaseInput,
  rows: readonly Row[],
  o: { me: { _id: string }; now: Date },
): Promise<{ itemId?: string; built?: BuiltRelease; publish?: StepOutcome; error?: string }> {
  let built: BuiltRelease;
  try {
    built = await buildRelease(sel, i, rows, o.now);
  } catch (e) {
    return { error: errorText(e) };
  }
  let itemId: string;
  try {
    itemId = (await a.createFormRow(CONFIG_FLOW, built.data, "Config_Key")).itemId;
  } catch (e) {
    return { built, error: `The release was not created: ${errorText(e)}` };
  }
  const row: Row = {
    _id: itemId,
    configKey: String(built.data.Config_Key),
    kind: "Release",
    state: "Draft",
    versionLabel: String(built.data.Version_Label ?? ""),
    sectionKey: "",
    sectionRev: null,
    payloadJson: "",
    annotationsJson: "",
    changeNote: String(built.data.Change_Note ?? ""),
    contentHash: "",
    evaluatorVersion: "",
    publishedAt: "",
    releaseKey: String(built.data.Release_Key),
    releaseManifestJson: built.manifestJson,
    manifestHash: built.manifestHash,
  };
  const publish = await publishConfig(a, row, o);
  return { itemId, built, publish };
}

// ---------------------------------------------------------------- templates preview

export interface TemplatePreview {
  template: Pick<ConfigVM, "_id" | "configKey" | "versionLabel" | "publishedAt">;
  sections: { sectionKey: string; default: string; title: string; code: string; fields: { key: string; label: string; type: string; required: boolean }[]; defined: boolean }[];
}

/** The newest Published Template, its section order and defaults, joined with the newest Published Section definition
 *  per section key (by Published_At, then Section_Rev). Null when no Template is published. */
export function templatePreview(rows: readonly Row[]): TemplatePreview | null {
  const pub = rows.filter((r) => r.state === "Published");
  const t = pub.filter((r) => r.kind === "Template").sort((a, b) => String(b.publishedAt).localeCompare(String(a.publishedAt)))[0];
  if (!t) return null;
  const parsed = parseTemplate(t.payloadJson);
  if (!parsed.ok) return { template: t, sections: [] };
  const defs = new Map<string, Row>();
  for (const r of pub.filter((x) => x.kind === "Section definition").sort((a, b) => String(a.publishedAt).localeCompare(String(b.publishedAt)) || (a.sectionRev ?? 0) - (b.sectionRev ?? 0))) defs.set(r.sectionKey, r);
  return {
    template: t,
    sections: parsed.value.sections.map((s) => {
      const d = defs.get(s.sectionKey);
      const p = d ? parseSectionDefinition(d.payloadJson) : null;
      return p?.ok
        ? { sectionKey: s.sectionKey, default: s.default, title: p.value.title, code: p.value.code, fields: p.value.fields, defined: true }
        : { sectionKey: s.sectionKey, default: s.default, title: "", code: "", fields: [], defined: false };
    }),
  };
}
