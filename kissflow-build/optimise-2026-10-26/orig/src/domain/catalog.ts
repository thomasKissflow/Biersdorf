// Static CIQ catalogue: departments, sections (chapters + annexes), configuration questions,
// field-level definitions (FLM v0.6 test scope) and personas.
// Sources: ReqDoc §4.1–4.3, §5.3; FLM v0.6 'CIQ new version'; Feldkatalog (K2.2 heavy-metal limits).

import type {
  ConfigAnswers,
  ConfigPair,
  ConfigQuestionId,
  ConfigState,
  Dept,
  FieldData,
  FieldDef,
  FieldType,
  InternalPersonaId,
  LegacySupplierPersonaId,
  Market,
  NavItem,
  OriginType,
  Persona,
  ReviewDept,
  SectionData,
  SectionDef,
  TemplateData,
} from "./types";

export const DEPT_LABEL: Record<Dept, string> = {
  RMM: "Raw Material Management",
  REG: "Regulatory Affairs",
  SAF: "Product Safety",
  QM: "Quality Management",
  MIC: "Microbiology",
  SUS: "Sustainability",
  CUS: "Customs & Trade Compliance",
  LEG: "Legal / IP",
};

export const DEPT_SHORT: Record<Dept, string> = {
  RMM: "RMM",
  REG: "Regulatory",
  SAF: "Safety",
  QM: "QM",
  MIC: "Microbiology",
  SUS: "Sustainability",
  CUS: "Customs",
  LEG: "Legal",
};

/** The five departments activated by section ownership (the lead of an active section gets a review track). */
export const REVIEW_DEPTS: ReviewDept[] = ["REG", "SAF", "QM", "MIC", "SUS"];

/** Every possible Part 2 review track, RMM first: RMM always reviews the whole CIQ, the departments only when activated. */
export const REVIEW_TRACK_DEPTS: ReviewDept[] = ["RMM", ...REVIEW_DEPTS];

export const ORIGIN_LABEL: Record<OriginType, string> = {
  vegetable: "Vegetable (bio mass)",
  animal: "Animal",
  mineral: "Mineral",
  petrochemical: "Petrochemical / fossil",
  polymer: "Polymer",
  waste: "Waste / side stream",
  ccu: "Carbon capture (CCU)",
  chemrec: "Chemical recycling of post-consumer plastic",
};

export const MARKET_LABEL: Record<Market, string> = {
  EU: "European Union",
  UK: "United Kingdom",
  TR: "Turkey",
  CN: "China",
  US: "USA",
  CA: "Canada",
  OTHER: "Other markets",
};

const s = (
  id: string,
  title: string,
  kind: SectionDef["kind"],
  lead: Dept,
  co: Dept[],
  trigger: string,
  meaning: string,
  hasFields = false,
  code?: string,
): SectionDef => ({ id, code: code ?? (kind === "annex" ? `Annex ${id.slice(1)}` : id), title, kind, lead, co, trigger, meaning, hasFields, documentsOnly: !hasFields });

/**
 * The built-in CIQ 2026 sections (today's catalogue), in questionnaire order. GEN is the basic-data block; the metadata
 * questions SF-01…SF-12 belong to it. Questionnaire v1 has all but K6.3 and A12; v2 has all. Never changes at runtime.
 */
export const BUILTIN_SECTIONS: readonly SectionDef[] = [
  s("GEN", "General information", "basic", "RMM", [], "Always", "Supplier, manufacturer, production site and contacts", true, "General"),
  s("K1", "Mandatory documents", "chapter", "QM", ["REG", "RMM", "SAF"], "Always", "Checklist of required evidence: SDS, CoA, specification, statements", true),
  s("K2.1", "Components and additives", "chapter", "REG", [], "Always", "Full composition per component: INCI, CAS, EC, function, additive, origin, concentration", true),
  s("K2.2", "Byproducts and contaminations", "chapter", "SAF", ["QM"], "Always", "Byproducts and contaminants, evidence from at least two batches, checked against BDF limits", true),
  s("K2.3", "Source or type of starting materials", "chapter", "RMM", ["SAF", "SUS", "REG"], "Always", "Origin type per component; drives most annexes", true),
  s("K3", "Storage conditions and handling", "chapter", "QM", [], "Always", "Storage conditions, shelf life, temperature effects"),
  s("K4.1", "Toxicity data", "chapter", "SAF", [], "Always", "Toxicological endpoints with study protocol"),
  s("K4.2", "Environmental effects", "chapter", "SAF", ["REG"], "Always", "Biodegradability and environmental data"),
  s("K4.3", "Synthetic polymer microparticles", "chapter", "SAF", ["REG"], "SF-03 = Yes", "REACH polymer definition and SPM restriction scope"),
  s("K5.1", "Microbiological test", "chapter", "MIC", [], "Always (waivable with justification, SF-12)", "Microbiological test of the raw material", true),
  s("K5.2", "Total microbial count", "chapter", "MIC", ["SAF"], "Always", "Total aerobic count, yeast and moulds, specific microorganisms"),
  s("K5.3", "Antimicrobial treatment", "chapter", "SAF", ["QM"], "Always", "Type and maximum dose of antimicrobial treatment"),
  s("K6.1", "EU REACH", "chapter", "REG", [], "Always", "Registration status, Annex XIV and XVII, SVHC"),
  s("K6.2", "UK REACH", "chapter", "REG", [], "SF-11 includes UK", "UK registration status incl. only representative"),
  s("K6.3", "Turkey REACH (KKDIK)", "chapter", "REG", [], "SF-11 includes Turkey", "Registration status Turkey"),
  s("K6.4", "Chemical inventory listings", "chapter", "REG", [], "SF-11: any non-EU market", "Listing in national chemical inventories"),
  s("K6.5", "Reg. 1223/2009 Annexes III–VI", "chapter", "REG", ["SAF"], "Always", "Cosmetics regulation annexes"),
  s("K6.6", "Ingredients Art. 19(g) / Annex III", "chapter", "REG", ["SAF"], "Always", "Ingredients relevant for labelling"),
  s("K6.7", "Animal testing (Art. 11(2)(e))", "chapter", "REG", [], "Always", "Animal testing status with evidence"),
  s("K6.8", "Halal and kosher status", "chapter", "REG", [], "Optional for every case", "Halal and kosher information"),
  s("K6.9", "Nanomaterials", "chapter", "SAF", ["REG"], "Always", "Nanomaterial status incl. justification"),
  s("K6.10", "Listing in pharmacopeia", "chapter", "QM", [], "Always", "Pharmacopeia monograph"),
  s("K6.11", "Listing as food additive", "chapter", "SAF", [], "Always", "Food grade status"),
  s("K6.12", "GMP compliance and ISO certification", "chapter", "QM", [], "Always", "Manufacturer GMP standards and ISO certificates (supplier-level)"),
  s("K6.13", "China IECIC / NMPA", "chapter", "REG", [], "SF-11 includes China", "Listing in the China inventory, NMPA code"),
  s("K6.14", "California Proposition 65", "chapter", "REG", ["SAF"], "SF-11 includes USA", "Prop 65 listing incl. contaminations"),
  s("K6.15", "Canada Hot List", "chapter", "REG", [], "SF-11 includes Canada", "Listing on the Canada Hot List"),
  s("K6.16", "Biodiversity laws", "chapter", "REG", [], "Always", "Access and benefit sharing"),
  s("K6.16.1", "Brazilian Biodiversity Law", "chapter", "REG", [], "SF-10 = Yes", "SisGen registration and exemptions"),
  s("K6.17", "EUDR", "chapter", "SUS", ["REG"], "SF-09 = Yes", "EU Deforestation Regulation scope and traceability"),
  s("K7", "Customs and foreign trade", "chapter", "CUS", [], "Always", "HS code, country of origin, export control, CITES"),
  s("K8", "Patent", "chapter", "LEG", [], "Always", "Patents and licences"),
  s("K8.1", "Additional patent information", "chapter", "LEG", [], "Optional", "Supplementary patent and licence details"),
  s("A1", "Vegetable origin", "annex", "SUS", ["SAF"], "SF-01 = Vegetable / Mineral / Petrochemical / Polymer", "Feedstock, origin, traceability, pesticides, palm and RSPO", true),
  s("A2", "Manufacturing process", "annex", "SAF", ["REG"], "SF-01 = Vegetable", "Manufacturing process per component", true),
  s("A3", "GMO", "annex", "QM", ["MIC"], "SF-06 = Yes", "Genetically modified organisms, safety level, separation"),
  s("A4", "Hydrocarbons (MOAH)", "annex", "SAF", [], "SF-07 = Yes or SF-01 = Petrochemical", "MOAH and physico-chemical data for mineral oils and waxes", true),
  s("A5", "UV filters", "annex", "REG", [], "SF-04 = Yes", "UV filter approval status in and outside the EU"),
  s("A6", "Synthetic polymers / biopolymers", "annex", "SAF", ["REG"], "SF-03 = Yes or SF-01 = Polymer", "Cross-linkers, monomers, molecular weight, residual monomers"),
  s("A7", "Colorants", "annex", "REG", [], "SF-05 = Colorant", "Colorant-specific information"),
  s("A8", "Preservatives", "annex", "REG", ["SAF"], "SF-05 = Preservative", "Preservative-specific information"),
  s("A9", "Polyaromatic hydrocarbons (PAH)", "annex", "SAF", [], "SF-01 = Vegetable / Petrochemical or SF-07", "PAH limits and analysis against BDF limits"),
  s("A10", "EU REACH (per substance)", "annex", "REG", [], "Always", "Substance-related REACH registration data"),
  s("A11", "UK REACH (per substance)", "annex", "REG", [], "SF-11 includes UK", "Substance-related UK REACH data incl. signed declaration"),
  s("A12", "Turkey REACH (per substance)", "annex", "REG", [], "SF-11 includes Turkey", "Substance-related KKDIK data"),
  s("A13", "Chemical inventories", "annex", "REG", [], "SF-11: any non-EU market", "Listing status per country and inventory"),
];

/**
 * Every section of every PUBLISHED questionnaire version, built-in and admin-created, in questionnaire order (the
 * draft's new sections are not listed until published; SECTION_BY_ID resolves them). A store-synced registry
 * (syncCatalog). Code that knows the case uses sectionOf(id, c.templateVersion) or templateSections(version) instead;
 * the editor lists the draft with templateSections(draft.template.version, undefined, true).
 */
export const SECTIONS: SectionDef[] = [...BUILTIN_SECTIONS];

/** Store-synced: the newest published definition of every section id; a draft adds only its new ids (see SECTIONS). */
export const SECTION_BY_ID: Record<string, SectionDef> = Object.fromEntries(SECTIONS.map((x) => [x.id, x]));

/** "K2.1 · Components"; the title alone when it already starts with the code ("General information"). */
export const codeTitle = (code: string, title: string) => (title.toLowerCase().startsWith(code.toLowerCase()) ? title : `${code} · ${title}`);
/** The code shown next to a title: empty when the title already starts with it. */
export const shownCode = (code: string, title: string) => (title.toLowerCase().startsWith(code.toLowerCase()) ? "" : code);

/** "K2.1 · Components and additives". With a version, that version's code and title (else the newest one). */
export function sectionLabel(id: string, templateVersion?: string, cfg?: ConfigState): string {
  const sec = sectionOf(id, templateVersion, cfg);
  return sec ? codeTitle(sec.code, sec.title) : id;
}

/** Shared sections need a rule on who decides (OP-18). */
export const SHARED_SECTIONS = ["K2.2", "K6.14", "K6.17"];

// ---------------------------------------------------------------------------
// Metadata (configuration) questions. The supplier answers them inside the CIQ and the sections open and close with
// them live until the completeness confirmation. SF-11 is a Beiersdorf fact set by RMM at case start (AS-06, confirmed).

export interface ConfigQuestion {
  id: keyof ConfigAnswers;
  code: string; // "SF-01"
  label: string;
  help: string;
  kind: "multi" | "yesno";
  options?: { value: string; label: string }[];
  answeredBy: "supplier" | "rmm";
  source: string;
}

export const CONFIG_QUESTIONS: ConfigQuestion[] = [
  {
    id: "SF01",
    code: "SF-01",
    label: "What is the origin of the components?",
    help: "Select every origin that applies to at least one component. Blends get the annexes of all their origins.",
    kind: "multi",
    options: (Object.keys(ORIGIN_LABEL) as OriginType[]).map((v) => ({ value: v, label: ORIGIN_LABEL[v] })),
    answeredBy: "supplier",
    source: "ReqDoc §5.3 SF-01",
  },
  { id: "SF03", code: "SF-03", label: "Does the raw material contain polymers or meet the REACH polymer definition?", help: "Activates the synthetic polymer microparticle review.", kind: "yesno", answeredBy: "supplier", source: "ReqDoc §5.3 SF-03" },
  { id: "SF04", code: "SF-04", label: "Is the material a UV filter?", help: "Activates the UV filter annex.", kind: "yesno", answeredBy: "supplier", source: "ReqDoc §5.3 SF-04" },
  {
    id: "SF05",
    code: "SF-05",
    label: "Is the material a colorant or a preservative?",
    help: "Both can apply. Leave empty if neither.",
    kind: "multi",
    options: [
      { value: "colorant", label: "Colorant" },
      { value: "preservative", label: "Preservative" },
    ],
    answeredBy: "supplier",
    source: "ReqDoc §5.3 SF-05",
  },
  { id: "SF06", code: "SF-06", label: "Is fermentation involved, or are GMOs involved?", help: "Activates the GMO annex.", kind: "yesno", answeredBy: "supplier", source: "ReqDoc §5.3 SF-06" },
  { id: "SF07", code: "SF-07", label: "Is the material mineral-oil based or a hydrocarbon?", help: "Activates MOAH and PAH checks, even if you selected 'Mineral' as origin.", kind: "yesno", answeredBy: "supplier", source: "ReqDoc §5.3 SF-07" },
  { id: "SF08", code: "SF-08", label: "Is any feedstock palm-based (palm or palm kernel oil)?", help: "Activates RSPO information and evidence.", kind: "yesno", answeredBy: "supplier", source: "ReqDoc §5.3 SF-08" },
  { id: "SF09", code: "SF-09", label: "Is the raw material in scope of the EU Deforestation Regulation (EUDR)?", help: "Activates EUDR traceability.", kind: "yesno", answeredBy: "supplier", source: "ReqDoc §5.3 SF-09" },
  { id: "SF10", code: "SF-10", label: "Is Brazilian genetic heritage involved?", help: "Activates SisGen information.", kind: "yesno", answeredBy: "supplier", source: "ReqDoc §5.3 SF-10" },
  { id: "SF02", code: "SF-02", label: "Are there additional production sites?", help: "The questionnaire covers one production site; additional sites are for information only.", kind: "yesno", answeredBy: "supplier", source: "ReqDoc §5.3 SF-02; FLM changelog r25" },
  { id: "SF12", code: "SF-12", label: "Is microbiological testing of the raw material required?", help: "If No, a written justification is mandatory. The total microbial count stays mandatory.", kind: "yesno", answeredBy: "supplier", source: "ReqDoc §5.3 SF-12" },
  {
    id: "SF11",
    code: "SF-11",
    label: "Target markets of the raw material",
    help: "Set by Beiersdorf (RMM) at case start; shown read-only to the supplier.",
    kind: "multi",
    options: (["EU", "UK", "TR", "CN", "US", "CA", "OTHER"] as Market[]).map((v) => ({ value: v, label: MARKET_LABEL[v] })),
    answeredBy: "rmm",
    source: "ReqDoc §5.3 SF-11",
  },
];

export const CONFIG_BY_ID = Object.fromEntries(CONFIG_QUESTIONS.map((q) => [q.id, q])) as Record<ConfigQuestionId, ConfigQuestion>;

// ---------------------------------------------------------------------------
// Field-level definitions (FLM v0.6 test scope + K1/K2.2/K5.1 light versions).

const hasOrigin = (o: OriginType) => (_a: unknown, c: ConfigAnswers) => (c.SF01 ?? []).includes(o);
const pct = (v: unknown) => (typeof v === "number" && (v < 0 || v > 100) ? "Must be between 0 and 100 %" : null);

export const PART_OPTIONS = ["Bark", "Bean", "Flower", "Fruit", "Fruit pulp", "Germ", "Kernel", "Leaf", "Nut", "Peel", "Rhizome", "Root", "Seed", "Shell", "Shoot", "Skin", "Tree", "Trunk", "Wool", "No entry"].map((x) => ({ value: x, label: x }));

export const HEAVY_METAL_LIMITS = [
  { fieldId: "FLD-A14-101", substance: "Arsenic (As)", limit: 0.5, unit: "mg/kg" },
  { fieldId: "FLD-A14-102", substance: "Cadmium (Cd)", limit: 0.1, unit: "mg/kg" },
  { fieldId: "FLD-A14-103", substance: "Chromium (Cr)", limit: 5.0, unit: "mg/kg" },
];
export const LIMIT_SET_VERSION = "BDF-LIM-2026.1";

/** The built-in fields (today's catalogue; questionnaire v1 and v2 hold exactly these). Never changes at runtime. */
export const BUILTIN_FIELDS: readonly FieldDef[] = [
  // General information (FLM 'Process Start' + 'Meta Data' identity fields)
  { id: "FLD-GEN-001", sectionId: "GEN", label: "Trade name of the raw material", type: "text", required: "mandatory", owner: "RMM", source: "FLM r2" },
  { id: "FLD-GEN-002", sectionId: "GEN", label: "Supplier (name)", type: "text", required: "mandatory", owner: "RMM", source: "FLM r3" },
  { id: "FLD-GEN-008", sectionId: "GEN", label: "Contact person e-mail", type: "email", required: "mandatory", owner: "RMM", source: "FLM r4", validate: (v) => (typeof v === "string" && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v) ? "Not a valid e-mail address" : null) },
  { id: "FLD-GEN-009", sectionId: "GEN", label: "Contact person e-mail 2", type: "email", required: "optional", owner: "RMM", source: "FLM r5", help: "Additional recipient of notifications." },
  { id: "FLD-GEN-003", sectionId: "GEN", label: "Supplier's DUNS number", type: "text", required: "mandatory", owner: "RMM", source: "FLM r7", validate: (v) => (typeof v === "string" && !/^\d{9}$/.test(v) ? "DUNS must be exactly 9 digits" : null) },
  { id: "FLD-GEN-004", sectionId: "GEN", label: "Manufacturer (name and address)", type: "longtext", required: "mandatory", owner: "RMM", source: "FLM r8" },
  { id: "FLD-GEN-005", sectionId: "GEN", label: "Production site (name and address)", type: "longtext", required: "mandatory", owner: "RMM", source: "FLM r9", help: "One production site per CIQ (aligned with business departments)." },

  // K1 Mandatory documents (light version)
  { id: "FLD-K1-001", sectionId: "K1", label: "Safety data sheet (SDS)", type: "file", required: "mandatory", owner: "QM", source: "ReqDoc §4.1 K1" },
  { id: "FLD-K1-002", sectionId: "K1", label: "Certificate of analysis (CoA)", type: "file", required: "mandatory", owner: "QM", source: "ReqDoc §4.1 K1" },
  { id: "FLD-K1-003", sectionId: "K1", label: "Raw material specification", type: "file", required: "mandatory", owner: "QM", source: "ReqDoc §4.1 K1" },
  // The evidence the rules ask for (rule `evidence`, ReqDoc §4.1 K1 and §5.4) that has no question elsewhere: an upload
  // slot each, shown when its rule fires (EVIDENCE_FIELDS in rules.ts maps every evidence item to where it is collected).
  // Live-scope cases only: the live portal's old flow keeps its three K1 documents.
  { id: "FLD-K1-004", sectionId: "K1", label: "Statements", type: "file", required: "mandatory", owner: "QM", source: "ReqDoc §4.1 K1 (rule R-00)", help: "The supplier statements for this raw material, as one or more files.", liveOnly: true },
  { id: "FLD-K1-005", sectionId: "K1", label: "Sustainability certificates", type: "file", required: "conditional", owner: "SUS", source: "ReqDoc §5.4 Vegetable (rule R-10)", help: "Asked because the origin includes Vegetable.", showWhen: hasOrigin("vegetable"), liveOnly: true },
  { id: "FLD-K1-006", sectionId: "K1", label: "BSE/TSE certificate", type: "file", required: "conditional", owner: "REG", source: "ReqDoc §5.4 Animal (rule R-12)", help: "Asked because the origin includes Animal.", showWhen: hasOrigin("animal"), liveOnly: true },
  { id: "FLD-K1-007", sectionId: "K1", label: "Conformity with Annex II entry 419", type: "file", required: "conditional", owner: "REG", source: "ReqDoc §5.4 Animal (rule R-12)", help: "A statement of conformity with entry 419 of Annex II to the EU Cosmetics Regulation. Asked because the origin includes Animal.", showWhen: hasOrigin("animal"), liveOnly: true },
  { id: "FLD-K1-008", sectionId: "K1", label: "PAH analysis against BDF limits", type: "file", required: "conditional", owner: "SAF", source: "ReqDoc §5.4 Petrochemical (rule R-14)", help: "Asked because the origin includes Petrochemical / fossil.", showWhen: hasOrigin("petrochemical"), liveOnly: true },
  { id: "FLD-K1-009", sectionId: "K1", label: "Residual monomer content (analysis)", type: "file", required: "conditional", owner: "SAF", source: "ReqDoc §5.4 Polymer (rule R-15)", help: "Asked because the origin includes Polymer.", showWhen: hasOrigin("polymer"), liveOnly: true },
  { id: "FLD-K1-010", sectionId: "K1", label: "SPM scope statement", type: "file", required: "conditional", owner: "REG", source: "ReqDoc §5.4 Polymer (rule R-15)", help: "Whether the material falls under the restriction of synthetic polymer microparticles. Asked because the origin includes Polymer.", showWhen: hasOrigin("polymer"), liveOnly: true },

  // K2.1 Components: the repeatable component table is handled separately (ComponentRow); plus:
  { id: "FLD-2.1-102", sectionId: "K2.1", label: "Natural origin index", type: "decimal", required: "mandatory", owner: "REG", source: "FLM r33", help: "Between 0 and 1, max. 2 decimals.", validate: (v) => (typeof v === "number" && (v < 0 || v > 1) ? "Must be between 0 and 1" : null) },

  // K2.2 Byproducts and contaminations (light version; limits from the old Feldkatalog)
  { id: "FLD-2.2-001", sectionId: "K2.2", label: "Analytical evidence from at least two batches", type: "file", required: "mandatory", owner: "SAF", source: "Feldkatalog r26" },
  ...HEAVY_METAL_LIMITS.map<FieldDef>((m) => ({ id: m.fieldId, sectionId: "K2.2", label: `${m.substance} content`, type: "number", unit: m.unit, required: "mandatory", owner: "SAF", source: "Feldkatalog r27–r29", help: `BDF limit ≤ ${m.limit} ${m.unit}` })),
  {
    id: "FLD-2.2-002",
    sectionId: "K2.2",
    label: "Justification for values above the BDF limit",
    type: "longtext",
    required: "conditional",
    owner: "SAF",
    source: "ReqDoc §4.1 K2.2",
    showWhen: (a) => HEAVY_METAL_LIMITS.some((m) => typeof a[m.fieldId] === "number" && (a[m.fieldId] as number) > m.limit),
  },

  // K2.3 Source of origin: specification fields per origin (FLM r16–r31)
  { id: "FLD-2.3-11", sectionId: "K2.3", label: "Fossil specification (e.g. oil, wax, gas)", type: "text", required: "conditional", owner: "RMM", source: "FLM r21", showWhen: hasOrigin("petrochemical") },
  { id: "FLD-2.3-12", sectionId: "K2.3", label: "Mineral specification (e.g. talc, mica)", type: "text", required: "conditional", owner: "RMM", source: "FLM r23", showWhen: hasOrigin("mineral") },
  { id: "FLD-2.3-13", sectionId: "K2.3", label: "CCU specification", type: "text", required: "conditional", owner: "RMM", source: "FLM r25", showWhen: hasOrigin("ccu") },
  { id: "FLD-2.3-14", sectionId: "K2.3", label: "Polymer specification", type: "text", required: "conditional", owner: "RMM", source: "FLM r27", showWhen: hasOrigin("polymer") },
  { id: "FLD-2.3-15", sectionId: "K2.3", label: "Waste / side stream specification", type: "text", required: "conditional", owner: "RMM", source: "FLM r29", showWhen: hasOrigin("waste") },
  { id: "FLD-2.3-16", sectionId: "K2.3", label: "Chemical recycling specification", type: "text", required: "conditional", owner: "RMM", source: "FLM r31", showWhen: hasOrigin("chemrec") },
  { id: "FLD-2.1-101", sectionId: "K2.3", label: "Part(s) used", type: "multi", options: PART_OPTIONS, required: "conditional", owner: "RMM", source: "FLM r18", showWhen: (_a, c) => (c.SF01 ?? []).some((o) => o === "vegetable" || o === "animal") },
  { id: "FLD-2.3-10", sectionId: "K2.3", label: "Country of origin", type: "text", required: "conditional", owner: "RMM", source: "FLM r19", help: "Several countries possible; separate with commas.", showWhen: (_a, c) => (c.SF01 ?? []).some((o) => o === "vegetable" || o === "animal") },

  // K5.1 Microbiological test (SF-12)
  { id: "FLD-5.1-001", sectionId: "K5.1", label: "Microbiological test report", type: "file", required: "conditional", owner: "MIC", source: "ReqDoc §5.3 SF-12", showWhen: (_a, c) => c.SF12 !== false },
  { id: "FLD-5.1-002", sectionId: "K5.1", label: "Justification for waiving the microbiological test", type: "longtext", required: "conditional", owner: "MIC", source: "BRM REQ-PROC-012", showWhen: (_a, c) => c.SF12 === false },

  // Annex 1 (FLM r32–r51)
  { id: "FLD-A1-102", sectionId: "A1", label: "Feedstock (e.g. sunflower, palm, soy)", type: "text", required: "mandatory", owner: "SUS", source: "FLM r32" },
  { id: "FLD-A1-103", sectionId: "A1", label: "Content [%] in INCI", type: "number", unit: "%", required: "mandatory", owner: "SUS", source: "FLM r34", validate: pct, help: "Based on molecular weight." },
  { id: "FLD-A1-104", sectionId: "A1", label: "Content [%] in raw material", type: "number", unit: "%", required: "mandatory", owner: "SUS", source: "FLM r35", validate: pct },
  { id: "FLD-A1-201", sectionId: "A1", label: "Pesticides analysis available?", type: "yesno", required: "mandatory", owner: "SUS", source: "FLM r45", help: "Yes → upload the analysis. No → give a reason." },
  { id: "FLD-A1-202", sectionId: "A1", label: "Pesticides analysis (PDF)", type: "file", required: "conditional", owner: "SUS", source: "FLM r46", showWhen: (a) => a["FLD-A1-201"] === true },
  { id: "FLD-A1-203", sectionId: "A1", label: "Reason the pesticides analysis is not available", type: "longtext", required: "conditional", owner: "SUS", source: "FLM r47", showWhen: (a) => a["FLD-A1-201"] === false },
  { id: "FLD-A1-204", sectionId: "A1", label: "Is palm (kernel) oil used as feedstock?", type: "yesno", required: "mandatory", owner: "SUS", source: "FLM r48" },
  {
    id: "FLD-A1-206",
    sectionId: "A1",
    label: "RSPO certification",
    type: "single",
    options: ["Mass Balance", "Segregated", "Identity Preserved", "No RSPO certification"].map((x) => ({ value: x, label: x })),
    required: "conditional",
    owner: "SUS",
    source: "FLM r49",
    help: "Mass Balance is the minimum for palm.",
    showWhen: (a) => a["FLD-A1-204"] === true,
  },
  { id: "FLD-A1-207", sectionId: "A1", label: "Other certification available?", type: "yesno", required: "conditional", owner: "SUS", source: "FLM r50", showWhen: (a) => a["FLD-A1-206"] === "No RSPO certification" },
  { id: "FLD-A1-208", sectionId: "A1", label: "Other certification (name), certificate attached", type: "text", required: "conditional", owner: "SUS", source: "FLM r51", showWhen: (a) => a["FLD-A1-207"] === true },

  // Annex 2 (FLM r37–r43)
  { id: "FLD-A2-101", sectionId: "A2", label: "INCI (European) / IUPAC", type: "text", required: "mandatory", owner: "SAF", source: "FLM r37", help: "Pre-filled from the composition; editable." },
  {
    id: "FLD-A2-102",
    sectionId: "A2",
    label: "Manufacturing process",
    type: "multi",
    options: ["Chemical", "Physical", "Enzymatic", "Biotechnology / Fermentation", "Other"].map((x) => ({ value: x, label: x })),
    required: "mandatory",
    owner: "SAF",
    source: "FLM r38–r42",
    help: "Several may apply.",
  },
  { id: "FLD-A2-103", sectionId: "A2", label: "Manufacturing process (individual)", type: "text", required: "conditional", owner: "SAF", source: "FLM r43", showWhen: (a) => Array.isArray(a["FLD-A2-102"]) && (a["FLD-A2-102"] as string[]).includes("Other") },

  // Annex 4 (FLM r53–r55)
  { id: "FLD-A4-101", sectionId: "A4", label: "MOAH concentration", type: "number", unit: "mg/kg", required: "mandatory", owner: "SAF", source: "FLM r53", help: "Determined by online HPLC-GC-FID, in mg/kg." },
  {
    id: "FLD-A4-102",
    sectionId: "A4",
    label: "Kinematic viscosity at 100 °C: availability",
    type: "single",
    options: [
      { value: "Not available", label: "Not available" },
      { value: "Conclusion by analogy", label: "Available — conclusion by analogy" },
      { value: "Own value", label: "Available — own value" },
    ],
    required: "mandatory",
    owner: "SAF",
    source: "FLM r54",
  },
  { id: "FLD-A4-103", sectionId: "A4", label: "Kinematic viscosity at 100 °C", type: "number", unit: "mm²/s", required: "conditional", owner: "SAF", source: "FLM r55", help: "Attach analytical data if you enter a value.", showWhen: (a) => a["FLD-A4-102"] === "Conclusion by analogy" || a["FLD-A4-102"] === "Own value" },
];

// ---------------------------------------------------------------------------
// Questionnaire versions as data (spec §8.1) and their look-ups.
//
// A version holds its sections in order, each with its fields. The built-in v1 and v2 resolve from the catalogue above
// (v1 = all but K6.3 and A12, v2 = all; both with today's fields). Admin-created versions live in AppState.config.
//
// Two ways to look things up:
// 1. Pure, with the state's config: templateSections(version, s.config), sectionOf(id, version, s.config),
//    fieldsOf(sectionId, version, s.config), fieldOf(fieldId, version, s.config). The domain always passes s.config.
// 2. Store-synced: the store calls syncRegistry(state.config) (rules.ts) on every change, and the same functions
//    without the `cfg` argument use that config. SECTIONS, SECTION_BY_ID, FIELDS and FIELD_BY_ID are kept in step:
//    the lists hold every section and field of every PUBLISHED version; the by-id records hold the newest published
//    definition per id plus the draft's new ids (so a draft edit never leaks into running cases' screens, and the
//    editor can still label draft-only sections). Screens that show a case use the case's version:
//    fieldsOf(sectionId, c.templateVersion) and sectionOf(sectionId, c.templateVersion).

/** Store-synced: every field of every published version (see SECTIONS). Case code uses fieldsOf/fieldOf with the version. */
export const FIELDS: FieldDef[] = [...BUILTIN_FIELDS];
/** Store-synced: the newest published definition of every field id (a draft adds only its new fields). */
export const FIELD_BY_ID: Record<string, FieldDef> = Object.fromEntries(FIELDS.map((f) => [f.id, f]));

const BUILTIN_FIELD_BY_ID: Record<string, FieldDef> = Object.fromEntries(BUILTIN_FIELDS.map((f) => [f.id, f]));
const BUILTIN_SECTION_BY_ID: Record<string, SectionDef> = Object.fromEntries(BUILTIN_SECTIONS.map((x) => [x.id, x]));

/** The first questionnaire version (built in, published, never stored). */
export const FIRST_TEMPLATE = "CIQ-2026 v1";
/** The questionnaire versions defined by the catalogue itself. */
export const BUILTIN_TEMPLATE_VERSIONS: readonly string[] = ["CIQ-2026 v1", "CIQ-2026 v2"];
const V1_LEAVES_OUT = ["K6.3", "A12"];

/** The built-in sections of a version: v1 (any version ending in "v1") without K6.3 and A12, otherwise all. */
export function builtinSectionIds(templateVersion: string): string[] {
  const all = BUILTIN_SECTIONS.map((x) => x.id);
  return String(templateVersion ?? "").endsWith("v1") ? all.filter((id) => !V1_LEAVES_OUT.includes(id)) : all;
}

export const isChoiceType = (t: FieldType) => t === "single" || t === "multi";
export const isNumberType = (t: FieldType) => t === "number" || t === "decimal";

/** A field as data: the definition without its checks. Numbers without a unit get "" (explicitly none). */
export function fieldData(f: Pick<FieldDef, "id" | "label" | "type" | "required" | "options" | "unit" | "help" | "owner">): FieldData {
  const d: FieldData = { id: f.id, label: f.label, type: f.type, required: f.required, owner: f.owner };
  if (isChoiceType(f.type)) d.options = (f.options ?? []).map((o) => ({ value: o.value, label: o.label }));
  if (isNumberType(f.type)) d.unit = f.unit ?? "";
  if (f.help) d.help = f.help;
  return d;
}

/** A section as data with its fields; `owners` (the Section owners setting) overrides the catalogue's lead and co. */
export function sectionData(sec: SectionDef, fields: readonly FieldDef[], owners?: { lead: Dept; co: Dept[] }): SectionData {
  return {
    id: sec.id,
    code: sec.code,
    title: sec.title,
    kind: sec.kind,
    meaning: sec.meaning,
    lead: owners?.lead ?? sec.lead,
    co: [...(owners?.co ?? sec.co)],
    documentsOnly: sec.documentsOnly,
    fields: sec.documentsOnly ? [] : fields.map(fieldData),
    ...(sec.retired ? { retired: true } : {}),
    trigger: sec.trigger,
  };
}

/** A built-in version as data (a fresh copy; `ownership` sets each section's lead and co). */
export function builtinTemplateData(templateVersion: string, ownership?: Record<string, { lead: Dept; co: Dept[] }>): TemplateData {
  const ids = new Set(builtinSectionIds(templateVersion));
  return {
    version: templateVersion,
    sections: BUILTIN_SECTIONS.filter((x) => ids.has(x.id)).map((x) =>
      sectionData(
        x,
        BUILTIN_FIELDS.filter((f) => f.sectionId === x.id),
        ownership?.[x.id],
      ),
    ),
  };
}

/** A questionnaire version resolved for look-ups. */
interface ResolvedTemplate {
  version: string;
  /** Every section in order, retired ones included (flagged). */
  sections: SectionDef[];
  byId: Map<string, SectionDef>;
  /** Fields per section id; [] for a documents-only section. */
  fields: Map<string, FieldDef[]>;
  fieldById: Map<string, FieldDef>;
}

function resolved(version: string, sections: SectionDef[], fieldsOfSection: (id: string) => FieldDef[]): ResolvedTemplate {
  const fields = new Map(sections.map((x) => [x.id, x.documentsOnly ? [] : fieldsOfSection(x.id)]));
  return { version, sections, byId: new Map(sections.map((x) => [x.id, x])), fields, fieldById: new Map([...fields.values()].flat().map((f) => [f.id, f])) };
}

const builtinCache = new Map<string, ResolvedTemplate>();
function builtinResolved(templateVersion: string): ResolvedTemplate {
  const key = String(templateVersion ?? "").endsWith("v1") ? "CIQ-2026 v1" : "CIQ-2026 v2";
  let r = builtinCache.get(key);
  if (!r) {
    const ids = new Set(builtinSectionIds(key));
    r = resolved(
      key,
      BUILTIN_SECTIONS.filter((x) => ids.has(x.id)),
      (id) => BUILTIN_FIELDS.filter((f) => f.sectionId === id),
    );
    builtinCache.set(key, r);
  }
  return r;
}

const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** A field of a version as a FieldDef. An unchanged built-in field is the catalogue's own object (with its checks); a
 *  changed one keeps its checks only while its type is unchanged; an admin-created field has none. */
function hydrateField(sectionId: string, d: FieldData): FieldDef {
  const b = BUILTIN_FIELD_BY_ID[d.id];
  if (b && b.sectionId === sectionId && sameJson(fieldData(b), d)) return b;
  const keep = !!b && b.type === d.type;
  return {
    id: d.id,
    sectionId,
    label: d.label,
    type: d.type,
    required: d.required,
    ...(isChoiceType(d.type) ? { options: (d.options ?? []).map((o) => ({ ...o })) } : {}),
    ...(isNumberType(d.type) && d.unit ? { unit: d.unit } : {}),
    ...(d.help?.trim() ? { help: d.help } : {}),
    owner: d.owner,
    source: b?.source ?? "Added by the business administrator",
    ...(keep && b.showWhen ? { showWhen: b.showWhen } : {}),
    ...(keep && b.validate ? { validate: b.validate } : {}),
    // A question the administrator added gets the check its answer type promises in the question form.
    ...(!b && d.type === "email" ? { validate: (v: unknown) => (typeof v === "string" && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v) ? "Not a valid e-mail address" : null) } : {}),
    ...(!b && d.type === "number" ? { validate: (v: unknown) => (typeof v === "number" && !Number.isInteger(v) ? "Enter a whole number" : null) } : {}),
    ...(b?.liveOnly ? { liveOnly: true } : {}),
  };
}

/** A section of a version as a SectionDef (new sections have no trigger text: their rules describe them). */
function hydrateSection(d: SectionData): SectionDef {
  return {
    id: d.id,
    code: d.code,
    title: d.title,
    kind: d.kind,
    meaning: d.meaning,
    lead: d.lead,
    co: [...d.co],
    trigger: d.trigger ?? BUILTIN_SECTION_BY_ID[d.id]?.trigger ?? "Switched on by the rules",
    hasFields: !d.documentsOnly,
    documentsOnly: d.documentsOnly,
    ...(d.retired ? { retired: true } : {}),
  };
}

const dataCache = new WeakMap<TemplateData, ResolvedTemplate>();
function dataResolved(t: TemplateData): ResolvedTemplate {
  let r = dataCache.get(t);
  if (!r) {
    const byData = new Map(t.sections.map((x) => [x.id, x]));
    r = resolved(
      t.version,
      t.sections.map(hydrateSection),
      (id) => (byData.get(id)?.fields ?? []).map((f) => hydrateField(id, f)),
    );
    dataCache.set(t, r);
  }
  return r;
}

let synced: ConfigState | undefined;

/** The configuration the store last synced (undefined: the built-in versions only). */
export const syncedConfig = (): ConfigState | undefined => synced;

const cfgOf = (cfg?: ConfigState) => cfg ?? synced;

/**
 * The stored pair that DEFINES a questionnaire version: the first pair holding it. A rules-only release keeps the
 * questionnaire of the release before it and holds an identical copy under the same version; that copy never defines
 * the version. The built-in first version (v1) is never defined by a pair (a rules-only release on top of it holds a
 * copy too).
 */
export function templatePairOf(cfg: ConfigState | undefined, templateVersion: string): ConfigPair | undefined {
  if (!cfg || templateVersion === FIRST_TEMPLATE) return undefined;
  return cfg.pairs.find((p) => p.template.version === templateVersion);
}

/** True when the pair brings its own questionnaire version (false: it keeps the one of an earlier release). */
export const ownsTemplate = (cfg: ConfigState | undefined, p: ConfigPair): boolean => templatePairOf(cfg, p.template.version) === p;

/** A version as data: from the config, else built in (v1, v2), else undefined. */
export function templateData(templateVersion: string, cfg?: ConfigState): TemplateData | undefined {
  const pair = templatePairOf(cfgOf(cfg), templateVersion);
  if (pair) return pair.template;
  return BUILTIN_TEMPLATE_VERSIONS.includes(templateVersion) ? builtinTemplateData(templateVersion) : undefined;
}

/** A version for look-ups. An unknown version (the live portal's labels) resolves like before: v1 if it ends in "v1",
 *  otherwise v2, both with today's catalogue. */
function resolveTemplate(templateVersion: string, cfg?: ConfigState): ResolvedTemplate {
  const pair = templatePairOf(cfgOf(cfg), templateVersion);
  return pair ? dataResolved(pair.template) : builtinResolved(templateVersion);
}

/** The sections of a version in questionnaire order; retired ones only with `includeRetired`. */
export function templateSections(templateVersion: string, cfg?: ConfigState, includeRetired = false): SectionDef[] {
  const r = resolveTemplate(templateVersion, cfg);
  return includeRetired ? r.sections : r.sections.filter((x) => !x.retired);
}

/** The newest definition of a section across versions of `cfg` (published first, then draft-only sections). */
/** The pairs that define a questionnaire version, newest published first, then the draft. */
const definingPairsNewestFirst = (cfg: ConfigState) => {
  const own = cfg.pairs.filter((p) => ownsTemplate(cfg, p));
  return [...own.filter((p) => p.status === "published")].reverse().concat(own.filter((p) => p.status === "draft"));
};

function newestSection(sectionId: string, cfg?: ConfigState): SectionDef | undefined {
  if (!cfg || cfg === synced) return SECTION_BY_ID[sectionId];
  const pairs = definingPairsNewestFirst(cfg);
  for (const p of pairs) {
    const hit = dataResolved(p.template).byId.get(sectionId);
    if (hit) return hit;
  }
  return BUILTIN_SECTION_BY_ID[sectionId];
}

function newestField(fieldId: string, cfg?: ConfigState): FieldDef | undefined {
  if (!cfg || cfg === synced) return FIELD_BY_ID[fieldId];
  const pairs = definingPairsNewestFirst(cfg);
  for (const p of pairs) {
    const hit = dataResolved(p.template).fieldById.get(fieldId);
    if (hit) return hit;
  }
  return BUILTIN_FIELD_BY_ID[fieldId];
}

/** A section as defined in a version (retired ones included); without a version, or when the version lacks it, the
 *  newest definition. */
export function sectionOf(sectionId: string, templateVersion?: string, cfg?: ConfigState): SectionDef | undefined {
  const c = cfgOf(cfg);
  return (templateVersion ? resolveTemplate(templateVersion, c).byId.get(sectionId) : undefined) ?? newestSection(sectionId, c);
}

/**
 * The fields of a section IN A VERSION, in order (spec §8.1): a field added in v3 never appears on a v1 case. [] for
 * a documents-only section or a section the version does not have. Every screen that lists a case's fields passes
 * `c.templateVersion`; the domain also passes `s.config`.
 */
export function fieldsOf(sectionId: string, templateVersion: string, cfg?: ConfigState): FieldDef[] {
  return resolveTemplate(templateVersion, cfg).fields.get(sectionId) ?? [];
}

/** A field as defined in a version; without a version, or when the version lacks it, the newest definition. */
export function fieldOf(fieldId: string, templateVersion?: string, cfg?: ConfigState): FieldDef | undefined {
  const c = cfgOf(cfg);
  return (templateVersion ? resolveTemplate(templateVersion, c).fieldById.get(fieldId) : undefined) ?? newestField(fieldId, c);
}

/** True when the version has the section (retired sections count as not there). */
export const templateHasSection = (templateVersion: string, sectionId: string, cfg?: ConfigState) => {
  const s = resolveTemplate(templateVersion, cfg).byId.get(sectionId);
  return !!s && !s.retired;
};

/** The field as the version defines it, when the version asks it (in a section that is not retired); else undefined. */
export function templateField(templateVersion: string, fieldId: string, cfg?: ConfigState): FieldDef | undefined {
  const r = resolveTemplate(templateVersion, cfg);
  const f = r.fieldById.get(fieldId);
  return f && !r.byId.get(f.sectionId)?.retired ? f : undefined;
}

/**
 * Keeps SECTIONS, SECTION_BY_ID, FIELDS and FIELD_BY_ID in step with `cfg` (called by syncRegistry in rules.ts; the
 * store calls that on every change). Cheap when the config object is unchanged.
 */
export function syncCatalog(cfg: ConfigState | undefined): void {
  if (cfg === synced) return;
  synced = cfg;
  // Only the pairs that define their questionnaire version: a rules-only release's copy adds nothing.
  const pairs = (cfg?.pairs ?? []).filter((p) => ownsTemplate(cfg, p));
  const order: string[] = BUILTIN_SECTIONS.map((x) => x.id);
  const secById = new Map<string, SectionDef>(BUILTIN_SECTIONS.map((x) => [x.id, x]));
  const fieldById = new Map<string, FieldDef>(BUILTIN_FIELDS.map((f) => [f.id, f]));
  const fieldSection = new Map<string, string>(BUILTIN_FIELDS.map((f) => [f.id, f.sectionId]));
  const fieldOrder = new Map<string, string[]>();
  for (const f of BUILTIN_FIELDS) fieldOrder.set(f.sectionId, [...(fieldOrder.get(f.sectionId) ?? []), f.id]);
  const merge = (p: (typeof pairs)[number], published: boolean) => {
    const r = dataResolved(p.template);
    let prev: string | undefined;
    for (const sec of r.sections) {
      if (!order.includes(sec.id)) order.splice(prev ? order.indexOf(prev) + 1 : 0, 0, sec.id);
      if (published || !secById.has(sec.id)) secById.set(sec.id, sec);
      prev = sec.id;
      const ids = fieldOrder.get(sec.id) ?? [];
      for (const f of r.fields.get(sec.id) ?? []) {
        if (!ids.includes(f.id)) ids.push(f.id);
        if (published || !fieldById.has(f.id)) {
          fieldById.set(f.id, f);
          fieldSection.set(f.id, sec.id);
        }
      }
      fieldOrder.set(sec.id, ids);
    }
  };
  for (const p of pairs) if (p.status === "published") merge(p, true);
  const listed = new Set(order);
  const listedFields = new Set(fieldById.keys());
  for (const p of pairs) if (p.status === "draft") merge(p, false);
  const allFields = (ids: string[]) => ids.flatMap((id) => (fieldOrder.get(id) ?? []).filter((f) => fieldSection.get(f) === id).map((f) => fieldById.get(f)!));
  SECTIONS.splice(0, SECTIONS.length, ...order.filter((id) => listed.has(id)).map((id) => secById.get(id)!));
  for (const k of Object.keys(SECTION_BY_ID)) delete SECTION_BY_ID[k];
  for (const id of order) SECTION_BY_ID[id] = secById.get(id)!;
  FIELDS.splice(0, FIELDS.length, ...allFields(order).filter((f) => listedFields.has(f.id)));
  for (const k of Object.keys(FIELD_BY_ID)) delete FIELD_BY_ID[k];
  for (const f of allFields(order)) FIELD_BY_ID[f.id] = f;
}

// ---------------------------------------------------------------------------
// Personas (the demo's "View as"). Internal personas are static, one role holder each. Supplier personas are derived
// from the active contacts of the supplier master ("sup:<userId>", see personas.ts). Names are fictional.

const CASES_NAV: NavItem = { to: "/cases", label: "Cases", icon: "FolderKanban" };
const REVIEWS_NAV: NavItem = { to: "/review", label: "My reviews", icon: "ClipboardCheck" };
const RULES_NAV: NavItem = { to: "/admin/rules", label: "Rules", icon: "GitBranch" };
const SUPPLIERS_NAV: NavItem = { to: "/suppliers", label: "Suppliers", icon: "Building2" };

/** The supplier portal menu (the live portal keeps its own). Tasks are merged into My requests. */
export const SUPPLIER_NAV: NavItem[] = [
  { to: "/portal", label: "My requests", icon: "Inbox" },
  { to: "/portal/help", label: "Help", icon: "LifeBuoy" },
];

export const SUPPLIER_PERSONA_DESCRIPTION =
  "External supplier contact. Fills in the CIQ for the requests it is named on: answers the metadata questions, completes the sections that open, uploads evidence, answers Beiersdorf's questions, and confirms completeness and gives the final release.";

/** The static Beiersdorf personas: one role holder per role. */
export const INTERNAL_PERSONAS: Persona[] = [
  {
    id: "rmm",
    label: "Raw Material Manager (RMM)",
    userId: "u-rmm",
    side: "internal",
    dept: "RMM",
    landing: "/rmm",
    description:
      "Owns CIQ cases: starts them with the supplier contacts and target markets, reviews the whole CIQ alongside the departments and completes its own review, cancels or reactivates a case, looks up the suppliers (maintained by the business administrator) and receives the final document.",
    nav: [{ to: "/rmm", label: "Dashboard", icon: "LayoutDashboard" }, REVIEWS_NAV, CASES_NAV, SUPPLIERS_NAV],
  },
  ...REVIEW_DEPTS.map<Persona>((d) => ({
    id: d.toLowerCase() as InternalPersonaId,
    label: `${DEPT_LABEL[d]} reviewer`,
    userId: `u-${d.toLowerCase()}`,
    side: "internal",
    dept: d,
    landing: "/review",
    description:
      d === "SAF" || d === "REG"
        ? `Reviews the ${DEPT_SHORT[d]} sections, asks the supplier directly, records the internal evaluation (RMES) with its Approved or Rejected decision, and completes the ${DEPT_SHORT[d]} review.`
        : `Reviews the ${DEPT_SHORT[d]} sections, asks the supplier directly and completes the ${DEPT_SHORT[d]} review.`,
    nav: [REVIEWS_NAV, CASES_NAV],
  })),
  {
    id: "cus",
    label: "Customs & Trade Compliance",
    userId: "u-cus",
    side: "internal",
    dept: "CUS",
    landing: "/cases",
    description: "Owns K7 (HS code, export control, CITES). Informed and read-only; may post internal notes.",
    nav: [CASES_NAV],
  },
  {
    id: "leg",
    label: "Legal / IP",
    userId: "u-leg",
    side: "internal",
    dept: "LEG",
    landing: "/cases",
    description: "Owns K8 and K8.1 (patents and licences). Informed and read-only; may post internal notes.",
    nav: [CASES_NAV],
  },
  {
    id: "admin",
    label: "Business administrator",
    userId: "u-admin",
    side: "internal",
    landing: "/admin/rules",
    description: "Maintains the questionnaire, the rules, section ownership and the suppliers, without IT. Every change is versioned or logged.",
    nav: [
      RULES_NAV,
      { to: "/admin/templates", label: "Questionnaire", icon: "ListChecks" },
      { to: "/admin/ownership", label: "Section owners", icon: "Users" },
      // Reminders is hidden from the menu (Thomas, 15 Oct); the page /admin/notifications and the reminder engine stay.
      SUPPLIERS_NAV,
    ],
    hiddenRoutes: ["/admin/notifications"],
  },
  {
    id: "auditor",
    label: "Auditor",
    userId: "u-auditor",
    side: "internal",
    landing: "/audit",
    description: "Reconstructs who assessed what, when, on which data, document and rule-set version. Read-only.",
    // Rules read-only: which rule-set version decided a scope.
    nav: [{ to: "/audit", label: "Audit trail", icon: "ScrollText" }, CASES_NAV, RULES_NAV],
  },
  {
    id: "owner",
    label: "Business owner (reports)",
    userId: "u-owner",
    side: "internal",
    landing: "/reports",
    description: "Process owner: pipeline, lead times, workload, clarifications and supplier performance. Read-only.",
    nav: [{ to: "/reports", label: "Reports", icon: "BarChart3" }, CASES_NAV],
  },
];

/**
 * The two legacy supplier role entries ("supplier", "supplier2"): they resolve to the contacts u-sup-1 and u-sup-2
 * (personas.ts). Kept for the client call page's role catalogue and for code that still names them.
 */
export const LEGACY_SUPPLIER_PERSONAS: Persona[] = [
  { id: "supplier", label: "Supplier contact", userId: "u-sup-1", side: "supplier", landing: "/portal", description: SUPPLIER_PERSONA_DESCRIPTION, nav: SUPPLIER_NAV },
  {
    id: "supplier2",
    label: "Supplier contact (second)",
    userId: "u-sup-2",
    side: "supplier",
    landing: "/portal",
    description: "External colleague of the first contact, filling in other sections at the same time. Every answer shows who entered it.",
    nav: SUPPLIER_NAV,
  },
];

/** Every role of the process (the call page's "Who does what"). The app's "View as" uses switchablePeople(state). */
export const PERSONAS: Persona[] = [...INTERNAL_PERSONAS, ...LEGACY_SUPPLIER_PERSONAS];

/**
 * Static lookups: the internal personas and the two legacy supplier ids (always present). Any other id, a derived
 * "sup:<userId>" included, gives undefined here: resolve those with personaOf(state, id).
 */
export const PERSONA_BY_ID = Object.fromEntries(PERSONAS.map((p) => [p.id, p])) as Record<InternalPersonaId | LegacySupplierPersonaId, Persona> & Partial<Record<string, Persona>>;

/**
 * Assumptions we show on the "Our understanding" page, each to be confirmed by BDF. IDs are stable: AS-01 (the ending,
 * confirmed on our call of 9 October) and AS-11 (the scope check, moot since then) were removed without renumbering.
 */
export const ASSUMPTIONS_LIST: { id: string; topic: string; text: string; source: string; question?: number }[] = [
  {
    id: "AS-02",
    topic: "Rejection",
    text: "Safety and Regulatory each record their internal RMES decision, Approved or Rejected, when they complete their review; a rejection needs a reason and does not stop the other reviews. What a Rejected decision means for the case is still open. We propose: RMM sees the rejection flagged on the case and agrees with the department whether to cancel the case with a justification. If the case continues, the supplier is still asked for the final release once RMM and every activated department have completed, and the case completes. The supplier never sees the decision.",
    source: "ReqDoc §3.3.2 (open) vs BRM (no Beiersdorf rejection; cancellation REQ-PROC-049); the requirements-matrix ending was confirmed on our call of 9 October",
    question: 8,
  },
  {
    id: "AS-03",
    topic: "Changing answers",
    text: "Until the completeness confirmation, sections open and close as the supplier changes its metadata answers; what it entered in a section that closes is kept and comes back if the answer changes back. After the confirmation the supplier can still change any answer, including basic data and metadata answers, and add documents in every chapter until Beiersdorf requests the final release, but a changed metadata answer only adds sections, so nothing RMM or a department is reviewing disappears. Beiersdorf reviewers never change answers. Reviewers always see the current answers, not a frozen copy: a new value replaces the old one, a new document is added next to the earlier ones with its upload date, and every change is recorded with name and time and shown to the reviewers who use that data. If a department has already completed its review, a change in a section it leads or co-reviews reopens that review automatically, so the release request waits until it completes again. Once the release is requested the questionnaire is locked; if something must change, Beiersdorf reopens a review, which unlocks it.",
    source: "BRM v2 REQ-PROC-007, -016, -031, REQ-CFG-008, -009 ('the scope only grows'); sections following the metadata answers live was confirmed on our call of 9 October; closing them only until the completeness confirmation, keeping the entered answers, reopening a completed review automatically and locking the questionnaire once the release is requested are our proposal (ReqDoc REQ-RMES-012 says reopen or confirm no impact)",
    question: 10,
  },
  { id: "AS-04", topic: "Composition", text: "Composition is a table with one row per component; a material gets the annexes of all its origins.", source: "BRM REQ-CFG-002, REQ-PROC-029 vs FLM single fields", question: 15 },
  { id: "AS-05", topic: "Rule principle", text: "Origin switches on origin annexes, markets switch on market annexes, specific questions switch on their annex, EU REACH always applies, the stricter rule wins.", source: "ReqDoc §5.3–5.4 (contradictory table)", question: 16 },
  { id: "AS-06", topic: "Target markets", text: "RMM sets the target markets at case start; the supplier sees them read-only.", source: "ReqDoc SF-11 (owner open)", question: 17 },
  {
    id: "AS-07",
    topic: "Who must finish",
    text: "RMM and every concerned department among Regulatory, Safety, QM, Microbiology and Sustainability complete a review, and the single final-release request waits for all of them; RMM's review covers the whole CIQ. Customs and Legal are informed and read-only.",
    source: "ReqDoc §4.3, K7, K8; RMM reviewing in parallel was confirmed on our call of 9 October, RMM's own review task that gates the release is our proposal",
    question: 12,
  },
  { id: "AS-08", topic: "Open points", text: "Every open point blocks completion of the review that raised it, RMM's included (no blocking/non-blocking split for queries). Only the reviewer who raised an open point can edit, change or close it, and every change also reaches the supplier in the portal.", source: "BRM REQ-PROC-036 vs REQ-RMES-009", question: 9 },
  {
    id: "AS-09",
    topic: "Undefined origins",
    text: "Waste, CCU and chemically recycled origins have no rules yet. The supplier gets the sections that apply to every case and those its other answers open, and the case is flagged in RMM's review in Part 2 (chosen after RMM has completed, it reopens RMM's review). RMM or a department asks the supplier for more if needed; a department can add a section with a justification.",
    source: "ReqDoc §5.4 (OP-19); the flag in RMM's review is our proposal",
    question: 18,
  },
  { id: "AS-10", topic: "Integrations", text: "Teamcenter, B-Flow and SAP links are manual in the MVP; the material number is stored on every case.", source: "ReqDoc §1.1", question: 22 },
  {
    id: "AS-12",
    topic: "Final PDF",
    text: "With the supplier's final release the case completes and the final PDF is created automatically, without user action; it is filed on the case, sent to RMM and cannot be changed. It contains the released answers, the evidence list with upload dates, the full text of every open point's back-and-forth (attachments not embedded), the three kinds of confirmation (completeness, each review completion by RMM and the departments, final release) and the CIQ ID.",
    source: "BRM v2 REQ-PROC-046 (content to be confirmed by the business)",
  },
];
