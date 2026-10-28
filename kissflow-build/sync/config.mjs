// Configuration as versioned data (plan v5 §11): reading the CIQ Config Version rows into the prototype's ConfigState,
// the supplier-safe bundle for the portal (§11.3), the one-time seed rows (§11.2, written to seed-out/ only, never to
// Kissflow by this module), and spike S-8 (payload sizes against the proven 122–160 KB Textarea round-trip).

import { D, canonicalJson, sha256, J, EVALUATOR_VERSION } from "./engine.mjs";
import { FLOW } from "./ids.mjs";

// ---------------------------------------------------------------------------------------------- reading

const stateOf = (row) => row.Config_State ?? "Published";

/** The prototype ConfigState + the singleton settings from the Config Version rows. */
export function configFromRows(rows) {
  const by = (kind) => rows.filter((r) => r.Config_Kind === kind);
  const single = (kind, fallback) => {
    const live = by(kind).filter((r) => stateOf(r) === "Published");
    const row = live.sort((a, b) => String(a.Published_At ?? "").localeCompare(String(b.Published_At ?? ""))).at(-1);
    return row ? J(row.Payload_JSON, fallback) : fallback;
  };
  const releases = by("Release").map((row) => {
    const bundle = J(row.Release_Bundle_JSON, {});
    const manifest = J(row.Release_Manifest_JSON, {});
    return { row, bundle, manifest, state: stateOf(row), ruleSetVersion: manifest.ruleSetVersion ?? bundle.ruleSet?.version, templateVersion: manifest.templateVersion ?? bundle.template?.version };
  });
  // The built-in first pair (RS-2026.1 + v1) is never stored in the prototype's ConfigState (configActions.ts).
  const stored = releases.filter((r) => !(r.ruleSetVersion === D.FIRST_PAIR.ruleSetVersion && r.templateVersion === D.FIRST_PAIR.templateVersion));
  const published = stored.filter((r) => r.state !== "Draft").sort((a, b) => String(a.row.Published_At ?? "").localeCompare(String(b.row.Published_At ?? "")));
  const drafts = stored.filter((r) => r.state === "Draft");
  const pairOf = (r) => ({
    ruleSet: r.bundle.ruleSet,
    template: r.bundle.template,
    status: r.state === "Draft" ? "draft" : "published",
    basedOn: r.bundle.basedOn ?? { ruleSetVersion: D.FIRST_PAIR.ruleSetVersion, templateVersion: D.FIRST_PAIR.templateVersion },
    note: r.bundle.note ?? "",
    createdAt: r.bundle.createdAt ?? r.row._created_at ?? "",
    createdBy: r.bundle.createdBy ?? "",
    changeNote: r.row.Change_Note ?? r.bundle.changeNote ?? "",
    ...(r.row.Published_At ? { publishedAt: r.row.Published_At } : {}),
  });
  const cfg = { pairs: [...published.map(pairOf), ...drafts.slice(0, 1).map(pairOf)] };
  const ownership = single("Section ownership", null)?.ownership ?? Object.fromEntries(D.BUILTIN_SECTIONS.map((x) => [x.id, { lead: x.lead, co: [...x.co] }]));
  const reminders = single("Reminders", null)?.reminders ?? D.baseState([], []).reminders;
  const settings = single("Settings", {}) ?? {};
  return {
    cfg,
    ownership,
    reminders,
    settings,
    rmesCriteria: single("RMES criteria", null),
    limitSet: single("Limit set", null),
    regression: single("Regression set", null),
    releases,
    releaseByRowId: Object.fromEntries(releases.map((r) => [r.row._id, r])),
    releaseByKey: Object.fromEntries(releases.map((r) => [r.row.Release_Key, r])),
  };
}

export async function loadConfig(port) {
  return configFromRows(await port.listForm(FLOW.config));
}

/**
 * The configuration a NEW case started with: the pairs published up to and including the pinned one (so the
 * prototype's createCase picks exactly the pinned pair as "current"). Running cases use the full configuration.
 */
export function configPinnedTo(config, ruleSetVersion, templateVersion) {
  const isFirst = ruleSetVersion === D.FIRST_PAIR.ruleSetVersion && templateVersion === D.FIRST_PAIR.templateVersion;
  const pubs = config.cfg.pairs.filter((p) => p.status === "published");
  const i = pubs.findIndex((p) => p.ruleSet.version === ruleSetVersion && p.template.version === templateVersion);
  if (!isFirst && i < 0) return null;
  return { ...config, cfg: { pairs: isFirst ? [] : pubs.slice(0, i + 1) } };
}

// ---------------------------------------------------------------------------------------------- the supplier-safe bundle

/**
 * CIQP_Request_A00.Config_Bundle_JSON — the contract the portal UI reads (format "ciq-bundle/1", coordinator 14 Oct):
 *   { format, release: {key, label, ruleSetVersion, templateVersion, manifestHash},
 *     ruleSet: {version, rules: RuleData[] without "basis" and "note"},
 *     template: TemplateData (sections → SectionData → FieldData, the prototype's own ids and values),
 *     settings: {undefinedOrigins} }
 * Built-in fields keep their code-side checks (showWhen/validate) by id in the prototype catalogue, so the bundle only
 * carries data. Config_Bundle_Hash = SHA-256 hex of the canonical JSON (sorted keys) of the bundle (bundleHash).
 * Supplier-safe per plan §11.3: the rule basis and notes (internal annotations) are left out.
 * @param {{row: object, bundle: object, ruleSetVersion: string, templateVersion: string}} release  a Release row (configFromRows)
 */
export function portalBundle(release, settings = {}) {
  const rsv = release.ruleSetVersion ?? release.bundle.ruleSet?.version;
  const tplv = release.templateVersion ?? release.bundle.template?.version;
  return {
    format: "ciq-bundle/1",
    release: { key: release.row?.Release_Key ?? `${rsv} + ${tplv}`, label: `${rsv} + ${tplv}`, ruleSetVersion: rsv, templateVersion: tplv, manifestHash: release.row?.Manifest_Hash ?? "" },
    ruleSet: { version: rsv, rules: (release.bundle.ruleSet?.rules ?? []).map(({ basis: _b, note: _n, ...r }) => r) },
    template: { version: tplv, sections: release.bundle.template?.sections ?? [] },
    settings: { undefinedOrigins: settings.undefinedOrigins ?? release.bundle.settings?.undefinedOrigins ?? [...D.UNDEFINED_ORIGINS] },
  };
}

/** @deprecated name kept for callers: the portal bundle of a Release row. */
export const supplierSafeBundle = portalBundle;

export const bundleHash = (b) => sha256(canonicalJson(b));

// ---------------------------------------------------------------------------------------------- seed rows (§11.2)

const SEED_AT = "2026-09-21T10:00:00.000Z"; // RS-2026.1 + v1 published (builtinRules.ts RS1.publishedAt)
const shortTpl = (v) => v.replace(/^CIQ-\d{4}\s+/, "");
const releaseKey = (rs, tpl) => `${rs} + ${shortTpl(tpl)}`;

function row(fields) {
  const out = { ...fields };
  for (const k of ["Payload_JSON", "Internal_Annotations_JSON", "Release_Manifest_JSON", "Release_Bundle_JSON", "Regression_Result_JSON"]) if (out[k] !== undefined && typeof out[k] !== "string") out[k] = JSON.stringify(out[k]);
  for (const k of Object.keys(out)) if (out[k] === undefined) delete out[k];
  return out;
}

function releaseRows({ ruleSet, template, state, publishedAt, changeNote, basedOn, note, createdAt, createdBy, settings }) {
  const rsPayload = { version: ruleSet.version, rules: ruleSet.rules };
  const tplPayload = { version: template.version, sections: template.sections };
  const rsHash = bundleHash(rsPayload);
  const tplHash = bundleHash(tplPayload);
  const bundle = { ruleSet: rsPayload, template: tplPayload, basedOn, note, changeNote, createdAt, createdBy, ...(publishedAt ? { publishedAt } : {}), settings: { undefinedOrigins: settings.undefinedOrigins } };
  const manifest = { ruleSetVersion: ruleSet.version, templateVersion: template.version, ruleSetKey: `RS:${ruleSet.version}`, templateKey: `TPL:${template.version}`, ruleSetHash: rsHash, templateHash: tplHash, bundleHash: bundleHash(bundle), basedOn, evaluatorVersion: EVALUATOR_VERSION };
  const common = { Config_State: state, Published_At: publishedAt, Change_Note: changeNote, Evaluator_Version: EVALUATOR_VERSION };
  return [
    row({ Config_Key: `RS:${ruleSet.version}`, Config_Kind: "Rule set", Version_Label: ruleSet.version, Payload_JSON: rsPayload, Content_Hash: rsHash, ...common }),
    row({ Config_Key: `TPL:${template.version}`, Config_Kind: "Template", Version_Label: template.version, Payload_JSON: tplPayload, Content_Hash: tplHash, ...common }),
    row({
      Config_Key: `REL:${releaseKey(ruleSet.version, template.version)}`,
      Config_Kind: "Release",
      Version_Label: releaseKey(ruleSet.version, template.version),
      Release_Key: releaseKey(ruleSet.version, template.version),
      Release_Label: releaseKey(ruleSet.version, template.version),
      Release_Stage: "Live",
      Release_Manifest_JSON: manifest,
      Release_Bundle_JSON: bundle,
      Manifest_Hash: bundleHash(manifest),
      Content_Hash: bundleHash(bundle),
      ...common,
    }),
  ];
}

/** The RMES criteria template as the prototype itself produces it (actions.ts rmesCriteria is internal, so its output
 *  is collected from the rich fixture's 36 replayed cases: the union of every criterion, without results). */
function rmesCriteriaTemplate() {
  const seen = new Map();
  for (const c of D.buildRichFixture().cases) for (const cr of c.rmes?.criteria ?? []) if (!seen.has(cr.id)) seen.set(cr.id, cr);
  const order = ["R-A1", "R-A2", "R-B1", "R-B2", "S-A1", "S-B1", "S-C1", "S-C2", "R-C1", "R-D1", "S-D1"];
  return [...seen.values()]
    .sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id))
    .map(({ limit: _l, result: _r, comment: _c, by: _b, at: _a, ...cr }) => ({ ...cr, appliesWhen: cr.id === "S-C2" ? "Annex 4 in scope" : cr.id === "R-C1" ? "Annex 1 in scope" : cr.id === "R-D1" ? "a target market outside the EU" : "always" }));
}

/**
 * The one-time seed (plan §11.2): RS-2026.1 + v1 Published (21 Sep 2026), the prepared RS-2026.2 + v2 as Draft, and
 * the singleton rows. Returns { file → rows }; the caller writes JSON files, never Kissflow.
 */
export function seedRows() {
  const ownership = Object.fromEntries(D.BUILTIN_SECTIONS.map((x) => [x.id, { lead: x.lead, co: [...x.co] }]));
  const settings = {
    undefinedOrigins: [...D.UNDEFINED_ORIGINS],
    undefinedOriginsNote: "G-06: the engine still reads the list from rules.ts; this row documents it and feeds the portal bundle.",
    defaultReviewers: { RMM: "", REG: "", SAF: "", QM: "", MIC: "", SUS: "" },
    basisLabels: { document: "Requirements document", agreed: "Agreed with Beiersdorf", "not-stated": "Not in the requirements", open: "Open question" },
  };
  const v1 = releaseRows({
    ruleSet: { version: D.RS1.version, rules: D.RS1.rules.map((r) => JSON.parse(JSON.stringify(r))) },
    template: D.builtinTemplateData(D.RS1.templateVersion, ownership),
    state: "Published",
    publishedAt: SEED_AT,
    changeNote: D.FIRST_PAIR.changeNote,
    basedOn: null,
    note: "Built-in first configuration (prototype configActions.ts FIRST_PAIR).",
    createdAt: SEED_AT,
    createdBy: "seed",
    settings,
  });
  const draft = D.preparedDraft(ownership);
  const v2 = releaseRows({ ruleSet: draft.ruleSet, template: draft.template, state: "Draft", publishedAt: undefined, changeNote: draft.changeNote, basedOn: draft.basedOn, note: draft.note, createdAt: draft.createdAt, createdBy: "seed", settings });
  const singleton = (kind, key, payload) => row({ Config_Key: key, Config_Kind: kind, Version_Label: "current", Config_State: "Published", Payload_JSON: payload, Content_Hash: bundleHash(payload), Published_At: SEED_AT, Change_Note: "Seed (plan v5 §11.2).", Evaluator_Version: EVALUATOR_VERSION });
  const reminders = D.baseState([], []).reminders;
  const limitSet = { version: D.LIMIT_SET_VERSION, limits: [...D.HEAVY_METAL_LIMITS.map((m) => ({ fieldId: m.fieldId, substance: m.substance, limit: m.limit, unit: m.unit })), { fieldId: "FLD-A4-101", substance: "MOAH", limit: 1.0, unit: "mg/kg" }], note: "A-13 placeholders until BDF shares its own (G-07)." };
  return {
    "release-RS-2026.1-v1.json": v1,
    "release-RS-2026.2-v2-draft.json": v2,
    "singletons.json": [
      singleton("Section ownership", "OWN:current", { ownership }),
      singleton("Reminders", "REM:current", { reminders }),
      singleton("Settings", "SET:current", settings),
      singleton("RMES criteria", "RMES:current", { criteria: rmesCriteriaTemplate(), note: "A-13 placeholder template (actions.ts rmesCriteria) until BDF shares its own (G-07)." }),
      singleton("Limit set", "LIM:current", limitSet),
      singleton("Regression set", "REG:current", { materials: D.REFERENCE_MATERIALS }),
    ],
  };
}

// ---------------------------------------------------------------------------------------------- spike S-8

const bytes = (s) => Buffer.byteLength(typeof s === "string" ? s : JSON.stringify(s), "utf8");
const kb = (n) => Math.round((n / 1024) * 10) / 10;

/** A realistic answer for a field type, with the text lengths a real supplier writes. */
function realisticValue(f, i) {
  switch (f.type) {
    case "email":
      return `regulatory.affairs${i}@solvaro.example`;
    case "number":
      return 12.5 + i;
    case "decimal":
      return 0.85;
    case "range":
      return { min: 0.1, max: 0.6 };
    case "yesno":
      return i % 2 === 0;
    case "single":
      return f.options?.[0]?.value ?? "Other";
    case "multi":
      return (f.options ?? []).slice(0, 2).map((o) => o.value);
    case "longtext":
      return "Manufactured at the Tarragona site under ISO 9001 and GMP (EFfCI). The process comprises hydrolysis, fractional distillation and deodorisation; no animal-derived processing aids are used. Batch records and the full analytical report are attached to this question.";
    case "file":
      return `${i}-doc`;
    default:
      return "Refined, deodorised; see the specification rev. 6, section 3.";
  }
}

/** Every field of every section of a version answered, with who/when and a justification on every fifth one. */
function fullAnswers(templateVersion, cfg) {
  const answers = {};
  const answeredBy = {};
  const justifications = {};
  let i = 0;
  for (const sec of D.templateSections(templateVersion, cfg)) {
    for (const f of (sec.documentsOnly ? [] : D.BUILTIN_FIELDS.filter((x) => x.sectionId === sec.id))) {
      answers[f.id] = realisticValue(f, i);
      answeredBy[f.id] = { by: "u-sup-1", name: "Elena Márquez", email: "elena.marquez@solvaro.example", at: "2026-10-14T09:12:33.000Z" };
      if (i % 5 === 0) justifications[f.id] = "Value taken from the 2026 batch analysis; the earlier 2024 value is superseded.";
      i++;
    }
  }
  return { answers, answeredBy, justifications, fields: i };
}

/** Spike S-8: sizes of the configuration payloads, the supplier bundles and a realistic answers payload. */
export function measureS8() {
  const seed = seedRows();
  const out = { limitKB: { proven: 122, provenV2Run: 160 }, rows: [], answers: [], verdict: [] };
  for (const [file, rows] of Object.entries(seed)) {
    for (const r of rows) {
      for (const k of ["Payload_JSON", "Release_Bundle_JSON", "Release_Manifest_JSON"]) if (r[k]) out.rows.push({ file, row: r.Config_Key, field: k, bytes: bytes(r[k]), kb: kb(bytes(r[k])) });
      if (r.Config_Kind === "Release") {
        const m = JSON.parse(r.Release_Manifest_JSON);
        const sb = portalBundle({ row: r, bundle: JSON.parse(r.Release_Bundle_JSON), ruleSetVersion: m.ruleSetVersion, templateVersion: m.templateVersion }, { undefinedOrigins: D.UNDEFINED_ORIGINS });
        out.rows.push({ file, row: r.Config_Key, field: "Config_Bundle_JSON (ciq-bundle/1, portal)", bytes: bytes(sb), kb: kb(bytes(sb)) });
      }
    }
  }
  // Realistic answers: the richest case of the prototype's rich fixture (36 replayed cases), and a fully answered v2.
  const rich = D.buildRichFixture();
  const sizeOf = (c) => bytes(c.answers) + bytes(c.answeredBy) + bytes(c.justifications) + bytes(c.components) + bytes(c.config);
  const richest = [...rich.cases].sort((a, b) => sizeOf(b) - sizeOf(a))[0];
  out.answers.push({ what: `rich fixture, richest case ${richest.id} (${Object.keys(richest.answers).length} answers)`, Answers_JSON: bytes(richest.answers), Answered_By_JSON: bytes(richest.answeredBy), Justifications_JSON: bytes(richest.justifications), Components_JSON: bytes(richest.components), Open_Points_JSON: bytes(richest.openPoints) });
  const cfgV2 = { pairs: [D.preparedDraft(Object.fromEntries(D.BUILTIN_SECTIONS.map((x) => [x.id, { lead: x.lead, co: [...x.co] }])))] };
  const full = fullAnswers("CIQ-2026 v2", cfgV2);
  const comps = Array.from({ length: 12 }, (_, i) => ({ id: `c${i + 1}`, inci: "Helianthus Annuus Seed Oil", cas: "8001-21-6", ec: "232-273-9", fn: "emollient", additive: i % 4 === 0, origin: "vegetable", concMin: 0.1, concMax: 0.6 }));
  out.answers.push({ what: `every built-in field of v2 answered (${full.fields} fields), 12 K2.1 rows`, Answers_JSON: bytes(full.answers), Answered_By_JSON: bytes(full.answeredBy), Justifications_JSON: bytes(full.justifications), Components_JSON: bytes(comps) });
  const perAnswer = bytes(full.answers) / Math.max(1, full.fields);
  const perWho = bytes(full.answeredBy) / Math.max(1, full.fields);
  for (const n of [300, 600, 1000]) out.answers.push({ what: `projection: ${n} answered fields at the measured ${Math.round(perAnswer)} B per answer and ${Math.round(perWho)} B per who/when entry (assumption: BDF's full questionnaire; today's catalogue is the 49-field test scope)`, Answers_JSON: Math.round(perAnswer * n), Answered_By_JSON: Math.round(perWho * n) });
  // Verdict
  const maxCfg = Math.max(...out.rows.filter((r) => r.field === "Release_Bundle_JSON").map((r) => r.bytes));
  const maxSup = Math.max(...out.rows.filter((r) => r.field.startsWith("Config_Bundle_JSON")).map((r) => r.bytes));
  const p600 = out.answers.find((a) => a.what.startsWith("projection: 600"));
  const whoLimit = Math.floor((122 * 1024) / perWho);
  out.verdict.push(`Config: largest Release_Bundle_JSON ${kb(maxCfg)} KB, largest portal bundle (ciq-bundle/1) ${kb(maxSup)} KB, about a fifth of the proven 122 KB → no rules/questionnaire split needed.`);
  out.verdict.push(`Answers: ${kb(out.answers[1].Answers_JSON)} KB for every field of today's catalogue; at 600 fields Answers_JSON ≈ ${kb(p600.Answers_JSON)} KB but Answered_By_JSON ≈ ${kb(p600.Answered_By_JSON)} KB. Answered_By_JSON reaches 122 KB at about ${whoLimit} fields → no split now; split per part (§4.4) only if BDF's questionnaire passes ~${Math.round(whoLimit * 0.8)} fields (80 % margin), re-measured when its field list is loaded.`);
  return out;
}
