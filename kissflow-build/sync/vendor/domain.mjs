var __defProp = Object.defineProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// prototype/src/domain/actions.ts
var actions_exports = {};
__export(actions_exports, {
  COMPLETENESS_CONFIRMED: () => COMPLETENESS_CONFIRMED,
  addFinding: () => addFinding,
  addInternalNote: () => addInternalNote,
  cancelCase: () => cancelCase,
  closeFinding: () => closeFinding,
  closeOpenPoint: () => closeOpenPoint,
  completeReview: () => completeReview,
  confirmCompleteness: () => confirmCompleteness,
  createCase: () => createCase,
  createDraft: () => createDraft,
  deleteRule: () => deleteRule,
  discardDraft: () => discardDraft,
  editOpenPoint: () => editOpenPoint,
  extendScope: () => extendScope,
  finalRelease: () => finalRelease,
  findingToQuery: () => findingToQuery,
  moveField: () => moveField,
  newCaseProblem: () => newCaseProblem,
  publishDraft: () => publishDraft,
  publishTemplateV2: () => publishTemplateV2,
  raiseOpenPoint: () => raiseOpenPoint,
  reactivateCase: () => reactivateCase,
  reassignReview: () => reassignReview,
  recordCriterion: () => recordCriterion,
  refuse: () => refuse,
  removeField: () => removeField,
  reopenReview: () => reopenReview,
  reportChange: () => reportChange,
  restoreSection: () => restoreSection,
  retireSection: () => retireSection,
  reviewResponse: () => reviewResponse,
  rmesDecision: () => rmesDecision,
  saveConfig: () => saveConfig,
  setAnswer: () => setAnswer,
  setComponents: () => setComponents,
  setJustification: () => setJustification,
  setOwnership: () => setOwnership,
  supplierRespond: () => supplierRespond,
  toast: () => toast,
  uid: () => uid,
  updateCaseContacts: () => updateCaseContacts,
  updateReminder: () => updateReminder,
  uploadDocument: () => uploadDocument,
  upsertField: () => upsertField,
  upsertRule: () => upsertRule,
  upsertSection: () => upsertSection,
  validateDraft: () => validateDraft,
  wasRefused: () => wasRefused
});

// prototype/src/domain/composition.ts
function casError(raw) {
  const v = (raw ?? "").trim();
  if (!v) return null;
  const m = /^(\d{2,7})-(\d{2})-(\d)$/.exec(v);
  if (!m) return "Use the CAS format 2\u20137 digits, 2 digits, check digit (e.g. 59-02-9)";
  const digits = (m[1] + m[2]).split("").reverse();
  const sum = digits.reduce((acc, d, i) => acc + Number(d) * (i + 1), 0);
  return sum % 10 === Number(m[3]) ? null : "The CAS check digit does not match. Please check for a typo";
}
var REACH_REG_NO = /^01-\d{10}-\d{2}-\d{4}$/;
function ecError(raw) {
  const v = (raw ?? "").trim();
  if (!v) return null;
  if (REACH_REG_NO.test(v)) return null;
  const m = /^(\d{3})-(\d{3})-(\d)$/.exec(v);
  if (!m) return "Use the EC format 123-456-7 or a REACH registration number 01-0123456789-01-0000";
  const sum = (m[1] + m[2]).split("").reduce((acc, d, i) => acc + Number(d) * (i + 1), 0);
  return sum % 11 === Number(m[3]) ? null : "The EC check digit does not match. Please check for a typo";
}
var legacyBlank = (min, max) => min === 0 && max === 0;
function concentrationError(min, max) {
  if (min === null || min === void 0 || max === null || max === void 0 || legacyBlank(min, max)) return "Enter a minimum and a maximum concentration";
  if (!Number.isFinite(min) || !Number.isFinite(max)) return "Concentrations must be numbers";
  if (min < 0 || max > 100) return "Concentrations must be between 0 and 100 %";
  if (min > max) return "The minimum is higher than the maximum";
  return null;
}
var blank = (v) => !(v ?? "").trim();
function componentRowProblems(r) {
  const out = [];
  if (blank(r.inci)) out.push({ column: "inci", text: "INCI (European) / IUPAC is missing", missing: true });
  const cas = casError(r.cas);
  if (cas) out.push({ column: "cas", text: cas });
  const ec = ecError(r.ec);
  if (ec) out.push({ column: "ec", text: ec });
  if (blank(r.fn)) out.push({ column: "fn", text: "Function is missing", missing: true });
  if (typeof r.additive !== "boolean") out.push({ column: "additive", text: "Additive: answer Yes or No", missing: true });
  const conc = concentrationError(r.concMin, r.concMax);
  if (conc) out.push({ column: "conc", text: conc, ...conc.startsWith("Enter") ? { missing: true } : {} });
  return out;
}
function contentRangeHint(v, components) {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  const ranges = components.filter((r) => concentrationError(r.concMin, r.concMax) === null);
  if (!ranges.length) return null;
  const lo = Math.min(...ranges.map((r) => r.concMin));
  const hi = Math.max(...ranges.map((r) => r.concMax));
  return lo <= v && v <= hi ? null : `This value lies outside the concentration range of the components in K2.1 (${lo}\u2013${hi} %). Please check it.`;
}

// prototype/src/domain/catalog.ts
var DEPT_LABEL = {
  RMM: "Raw Material Management",
  REG: "Regulatory Affairs",
  SAF: "Product Safety",
  QM: "Quality Management",
  MIC: "Microbiology",
  SUS: "Sustainability",
  CUS: "Customs & Trade Compliance",
  LEG: "Legal / IP"
};
var DEPT_SHORT = {
  RMM: "RMM",
  REG: "Regulatory",
  SAF: "Safety",
  QM: "QM",
  MIC: "Microbiology",
  SUS: "Sustainability",
  CUS: "Customs",
  LEG: "Legal"
};
var REVIEW_DEPTS = ["REG", "SAF", "QM", "MIC", "SUS"];
var REVIEW_TRACK_DEPTS = ["RMM", ...REVIEW_DEPTS];
var ORIGIN_LABEL = {
  vegetable: "Vegetable (bio mass)",
  animal: "Animal",
  mineral: "Mineral",
  petrochemical: "Petrochemical / fossil",
  polymer: "Polymer",
  waste: "Waste / side stream",
  ccu: "Carbon capture (CCU)",
  chemrec: "Chemical recycling of post-consumer plastic"
};
var MARKET_LABEL = {
  EU: "European Union",
  UK: "United Kingdom",
  TR: "Turkey",
  CN: "China",
  US: "USA",
  CA: "Canada",
  OTHER: "Other markets"
};
var s = (id, title, kind, lead, co, trigger, meaning, hasFields = false, code) => ({ id, code: code ?? (kind === "annex" ? `Annex ${id.slice(1)}` : id), title, kind, lead, co, trigger, meaning, hasFields, documentsOnly: !hasFields });
var BUILTIN_SECTIONS = [
  s("GEN", "General information", "basic", "RMM", [], "Always", "Supplier, manufacturer, production site and contacts", true, "General"),
  s("K1", "Mandatory documents", "chapter", "QM", ["REG", "RMM", "SAF"], "Always", "Checklist of required evidence: SDS, CoA, specification, statements", true),
  s("K2.1", "Components and additives", "chapter", "RMM", ["REG"], "Always", "Full composition per component: INCI, CAS, EC, function, additive, origin, concentration", true),
  s("K2.2", "Byproducts and contaminations", "chapter", "SAF", ["QM"], "Always", "Byproducts and contaminants, evidence from at least two batches, checked against BDF limits", true),
  s("K2.3", "Source or type of starting materials", "chapter", "RMM", ["SAF", "SUS", "REG"], "Always", "Origin type per component, feedstock and its content; drives most annexes", true),
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
  s("K6.5", "Reg. 1223/2009 Annexes III\u2013VI", "chapter", "REG", ["SAF"], "Always", "Cosmetics regulation annexes"),
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
  s("A1", "Vegetable origin", "annex", "REG", ["SUS", "SAF"], "SF-01 = Vegetable / Mineral / Petrochemical / Polymer", "Country of origin, pesticides, palm and RSPO", true),
  s("A2", "Manufacturing process", "annex", "RMM", ["SAF", "REG"], "SF-01 = Vegetable", "Manufacturing process per component", true),
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
  s("A13", "Chemical inventories", "annex", "REG", [], "SF-11: any non-EU market", "Listing status per country and inventory")
];
var SECTIONS = [...BUILTIN_SECTIONS];
var SECTION_BY_ID = Object.fromEntries(SECTIONS.map((x) => [x.id, x]));
var CONFIG_QUESTIONS = [
  {
    id: "SF01",
    code: "SF-01",
    label: "What is the origin of the components?",
    help: "Select every origin that applies to at least one component. Each component's origin in K2.1 must be one you select here, and each origin you select must be used by at least one component.",
    kind: "multi",
    options: Object.keys(ORIGIN_LABEL).map((v) => ({ value: v, label: ORIGIN_LABEL[v] })),
    answeredBy: "supplier",
    source: "ReqDoc \xA75.3 SF-01"
  },
  { id: "SF03", code: "SF-03", label: "Does the raw material contain polymers or meet the REACH polymer definition?", help: "Activates the synthetic polymer microparticle review.", kind: "yesno", answeredBy: "supplier", source: "ReqDoc \xA75.3 SF-03" },
  { id: "SF04", code: "SF-04", label: "Is the material a UV filter?", help: "Activates the UV filter annex.", kind: "yesno", answeredBy: "supplier", source: "ReqDoc \xA75.3 SF-04" },
  {
    id: "SF05",
    code: "SF-05",
    label: "Is the material a colorant or a preservative?",
    help: "Both can apply. Leave empty if neither.",
    kind: "multi",
    options: [
      { value: "colorant", label: "Colorant" },
      { value: "preservative", label: "Preservative" }
    ],
    answeredBy: "supplier",
    source: "ReqDoc \xA75.3 SF-05"
  },
  { id: "SF06", code: "SF-06", label: "Is fermentation involved, or are GMOs involved?", help: "Activates the GMO annex.", kind: "yesno", answeredBy: "supplier", source: "ReqDoc \xA75.3 SF-06" },
  { id: "SF07", code: "SF-07", label: "Is the material mineral-oil based or a hydrocarbon?", help: "Activates MOAH and PAH checks, even if you selected 'Mineral' as origin.", kind: "yesno", answeredBy: "supplier", source: "ReqDoc \xA75.3 SF-07" },
  { id: "SF09", code: "SF-09", label: "Is the raw material in scope of the EU Deforestation Regulation (EUDR)?", help: "Activates EUDR traceability.", kind: "yesno", answeredBy: "supplier", source: "ReqDoc \xA75.3 SF-09" },
  { id: "SF10", code: "SF-10", label: "Is Brazilian genetic heritage involved?", help: "Activates SisGen information.", kind: "yesno", answeredBy: "supplier", source: "ReqDoc \xA75.3 SF-10" },
  { id: "SF12", code: "SF-12", label: "Is microbiological testing of the raw material required?", help: "If No, a written justification is mandatory. The total microbial count stays mandatory.", kind: "yesno", answeredBy: "supplier", source: "ReqDoc \xA75.3 SF-12" },
  {
    id: "SF11",
    code: "SF-11",
    label: "Target markets of the raw material",
    help: "Set by Beiersdorf (RMM) at case start; shown read-only to the supplier.",
    kind: "multi",
    options: ["EU", "UK", "TR", "CN", "US", "CA", "OTHER"].map((v) => ({ value: v, label: MARKET_LABEL[v] })),
    answeredBy: "rmm",
    source: "ReqDoc \xA75.3 SF-11"
  }
];
var CONFIG_BY_ID = Object.fromEntries(CONFIG_QUESTIONS.map((q) => [q.id, q]));
var hasOrigin = (o) => (_a, c) => (c.SF01 ?? []).includes(o);
var pct = (v) => typeof v === "number" && (v < 0 || v > 100) ? "Must be between 0 and 100 %" : null;
var emailCheck = (v) => typeof v === "string" && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v) ? "Not a valid e-mail address" : null;
var vegetableOrAnimal = (_a, c) => (c.SF01 ?? []).some((o) => o === "vegetable" || o === "animal");
var viscosityAvailable = (a, _c) => a["FLD-A4-102"] === "Conclusion by analogy" || a["FLD-A4-102"] === "Own value";
var PART_OPTIONS = ["Bark", "Bean", "Flower", "Fruit", "Fruit pulp", "Germ", "Kernel", "Leaf", "Nut", "Peel", "Rhizome", "Root", "Seed", "Shell", "Shoot", "Skin", "Tree", "Trunk", "Wool", "No entry"].map((x) => ({ value: x, label: x }));
var HEAVY_METAL_LIMITS = [
  { fieldId: "FLD-A14-101", substance: "Arsenic (As)", limit: 0.5, unit: "mg/kg" },
  { fieldId: "FLD-A14-102", substance: "Cadmium (Cd)", limit: 0.1, unit: "mg/kg" },
  { fieldId: "FLD-A14-103", substance: "Chromium (Cr)", limit: 5, unit: "mg/kg" }
];
var LIMIT_SET_VERSION = "BDF-LIM-2026.1";
var BUILTIN_FIELDS = [
  // General information (FLM 'Process Start' + 'Meta Data' identity fields)
  { id: "FLD-GEN-001", sectionId: "GEN", label: "Trade name of the raw material", type: "text", required: "mandatory", owner: "RMM", source: "FLM r2" },
  { id: "FLD-GEN-002", sectionId: "GEN", label: "Supplier (name)", type: "text", required: "mandatory", owner: "RMM", source: "FLM r3" },
  { id: "FLD-GEN-008", sectionId: "GEN", label: "Contact person e-mail", type: "email", required: "mandatory", owner: "RMM", source: "FLM r4", validate: emailCheck },
  // L1 (matrix v0.6): the same format check as FLD-GEN-008. Optional and set by Beiersdorf, so it shows inline only and
  // never blocks the supplier's completeness.
  { id: "FLD-GEN-009", sectionId: "GEN", label: "Contact person e-mail 2", type: "email", required: "optional", owner: "RMM", source: "FLM r5", help: "Additional recipient of notifications.", validate: emailCheck },
  { id: "FLD-GEN-003", sectionId: "GEN", label: "Supplier's DUNS number", type: "text", required: "mandatory", owner: "RMM", source: "FLM r7", validate: (v) => typeof v === "string" && !/^\d{9}$/.test(v) ? "DUNS must be exactly 9 digits" : null },
  { id: "FLD-GEN-004", sectionId: "GEN", label: "Manufacturer (name and address)", type: "longtext", required: "mandatory", owner: "RMM", source: "FLM r8" },
  { id: "FLD-GEN-005", sectionId: "GEN", label: "Production site (name and address)", type: "longtext", required: "mandatory", owner: "RMM", source: "FLM r9", help: "One production site per CIQ." },
  // K1 Mandatory documents (light version)
  { id: "FLD-K1-001", sectionId: "K1", label: "Safety data sheet (SDS)", type: "file", required: "mandatory", owner: "QM", source: "ReqDoc \xA74.1 K1" },
  { id: "FLD-K1-002", sectionId: "K1", label: "Certificate of analysis (CoA)", type: "file", required: "mandatory", owner: "QM", source: "ReqDoc \xA74.1 K1" },
  { id: "FLD-K1-003", sectionId: "K1", label: "Raw material specification", type: "file", required: "mandatory", owner: "QM", source: "ReqDoc \xA74.1 K1" },
  // The evidence the rules ask for (rule `evidence`, ReqDoc §4.1 K1 and §5.4) that has no question elsewhere: an upload
  // slot each, shown when its rule fires (EVIDENCE_FIELDS in rules.ts maps every evidence item to where it is collected).
  // Live-scope cases only: the live portal's old flow keeps its three K1 documents.
  { id: "FLD-K1-004", sectionId: "K1", label: "Statements", type: "file", required: "mandatory", owner: "QM", source: "ReqDoc \xA74.1 K1 (rule R-00)", help: "The supplier statements for this raw material, as one or more files.", liveOnly: true },
  { id: "FLD-K1-005", sectionId: "K1", label: "Sustainability certificates", type: "file", required: "conditional", owner: "SUS", source: "ReqDoc \xA75.4 Vegetable (rule R-10)", help: "Asked because the origin includes Vegetable.", showWhen: hasOrigin("vegetable"), liveOnly: true },
  { id: "FLD-K1-006", sectionId: "K1", label: "BSE/TSE certificate", type: "file", required: "conditional", owner: "REG", source: "ReqDoc \xA75.4 Animal (rule R-12)", help: "Asked because the origin includes Animal.", showWhen: hasOrigin("animal"), liveOnly: true },
  { id: "FLD-K1-007", sectionId: "K1", label: "Conformity with Annex II entry 419", type: "file", required: "conditional", owner: "REG", source: "ReqDoc \xA75.4 Animal (rule R-12)", help: "A statement of conformity with entry 419 of Annex II to the EU Cosmetics Regulation. Asked because the origin includes Animal.", showWhen: hasOrigin("animal"), liveOnly: true },
  { id: "FLD-K1-008", sectionId: "K1", label: "PAH analysis against BDF limits", type: "file", required: "conditional", owner: "SAF", source: "ReqDoc \xA75.4 Petrochemical (rule R-14)", help: "Asked because the origin includes Petrochemical / fossil.", showWhen: hasOrigin("petrochemical"), liveOnly: true },
  { id: "FLD-K1-009", sectionId: "K1", label: "Residual monomer content (analysis)", type: "file", required: "conditional", owner: "SAF", source: "ReqDoc \xA75.4 Polymer (rule R-15)", help: "Asked because the origin includes Polymer.", showWhen: hasOrigin("polymer"), liveOnly: true },
  { id: "FLD-K1-010", sectionId: "K1", label: "SPM scope statement", type: "file", required: "conditional", owner: "REG", source: "ReqDoc \xA75.4 Polymer (rule R-15)", help: "Whether the material falls under the restriction of synthetic polymer microparticles. Asked because the origin includes Polymer.", showWhen: hasOrigin("polymer"), liveOnly: true },
  // K2.1 Components: the repeatable component table is handled separately (ComponentRow); plus:
  { id: "FLD-2.1-102", sectionId: "K2.1", label: "Natural origin index", type: "decimal", required: "mandatory", owner: "RMM", source: "FLM r33", help: "Between 0 and 1, max. 2 decimals.", validate: (v) => typeof v !== "number" ? null : v < 0 || v > 1 ? "Must be between 0 and 1" : Math.abs(v * 100 - Math.round(v * 100)) > 1e-9 ? "Max. 2 decimals" : null },
  // K2.2 Byproducts and contaminations (light version; limits from the old Feldkatalog)
  { id: "FLD-2.2-001", sectionId: "K2.2", label: "Analytical evidence from at least two batches", type: "file", required: "mandatory", owner: "SAF", source: "Feldkatalog r26" },
  ...HEAVY_METAL_LIMITS.map((m) => ({ id: m.fieldId, sectionId: "K2.2", label: `${m.substance} content`, type: "number", unit: m.unit, required: "mandatory", owner: "SAF", source: "Feldkatalog r27\u2013r29", help: `BDF limit \u2264 ${m.limit} ${m.unit}` })),
  {
    id: "FLD-2.2-002",
    sectionId: "K2.2",
    label: "Justification for values above the BDF limit",
    type: "longtext",
    required: "conditional",
    owner: "SAF",
    source: "ReqDoc \xA74.1 K2.2",
    showWhen: (a) => HEAVY_METAL_LIMITS.some((m) => typeof a[m.fieldId] === "number" && a[m.fieldId] > m.limit)
  },
  // K2.3 Source of origin: specification fields per origin (FLM r16–r31)
  { id: "FLD-2.3-11", sectionId: "K2.3", label: "Fossil specification (e.g. oil, wax, gas)", type: "text", required: "conditional", owner: "RMM", source: "FLM r21", showWhen: hasOrigin("petrochemical") },
  { id: "FLD-2.3-12", sectionId: "K2.3", label: "Mineral specification (e.g. talc, mica)", type: "text", required: "conditional", owner: "RMM", source: "FLM r23", showWhen: hasOrigin("mineral") },
  { id: "FLD-2.3-13", sectionId: "K2.3", label: "CCU specification", type: "text", required: "conditional", owner: "RMM", source: "FLM r25", showWhen: hasOrigin("ccu") },
  { id: "FLD-2.3-14", sectionId: "K2.3", label: "Polymer specification", type: "text", required: "conditional", owner: "RMM", source: "FLM r27", showWhen: hasOrigin("polymer") },
  { id: "FLD-2.3-15", sectionId: "K2.3", label: "Waste / side stream specification", type: "text", required: "conditional", owner: "RMM", source: "FLM r29", showWhen: hasOrigin("waste") },
  { id: "FLD-2.3-16", sectionId: "K2.3", label: "Chemical recycling specification", type: "text", required: "conditional", owner: "RMM", source: "FLM r31", showWhen: hasOrigin("chemrec") },
  { id: "FLD-2.1-101", sectionId: "K2.3", label: "Part(s) used", type: "multi", options: PART_OPTIONS, required: "conditional", owner: "RMM", source: "FLM r18", showWhen: vegetableOrAnimal },
  { id: "FLD-2.3-10", sectionId: "K2.3", label: "Country of origin", type: "text", required: "conditional", owner: "RMM", source: "FLM r19", help: "Several countries possible; separate with commas.", showWhen: vegetableOrAnimal },
  // Feedstock and its content (matrix v0.6: Meta Data block, asked on every case; formerly Annex 1). The ids stay.
  { id: "FLD-A1-102", sectionId: "K2.3", label: "Feedstock (e.g. sunflower, palm, soy)", type: "text", required: "mandatory", owner: "RMM", source: "FLM r32 (v0.6: Meta Data block)" },
  { id: "FLD-A1-103", sectionId: "K2.3", label: "Content [%] in INCI", type: "number", unit: "%", required: "mandatory", owner: "RMM", source: "FLM r34 (v0.6: Meta Data block)", validate: pct, help: "Based on molecular weight." },
  // M8: a soft warning (never a blocker) when the value lies outside the components' concentration range in K2.1 (the
  // union [lowest minimum, highest maximum])
  { id: "FLD-A1-104", sectionId: "K2.3", label: "Content [%] in raw material", type: "number", unit: "%", required: "mandatory", owner: "RMM", source: "FLM r35 (v0.6: Meta Data block)", validate: pct, hint: (v, c) => contentRangeHint(v, c.components) },
  // K5.1 Microbiological test (SF-12)
  { id: "FLD-5.1-001", sectionId: "K5.1", label: "Microbiological test report", type: "file", required: "conditional", owner: "MIC", source: "ReqDoc \xA75.3 SF-12", showWhen: (_a, c) => c.SF12 !== false },
  { id: "FLD-5.1-002", sectionId: "K5.1", label: "Justification for waiving the microbiological test", type: "longtext", required: "conditional", owner: "MIC", source: "BRM REQ-PROC-012", showWhen: (_a, c) => c.SF12 === false },
  // Annex 1 (FLM r19, r45–r51)
  {
    id: "FLD-A1-105",
    sectionId: "A1",
    label: "Country of origin",
    type: "text",
    required: "optional",
    owner: "RMM",
    source: "Feldkatalog FLD-A1-105; FLM r19 Controls (auto-fill from FLD-2.3-10)",
    help: "Filled in from Country of origin (K2.3). Change it there.",
    derivedFrom: "FLD-2.3-10",
    showWhen: vegetableOrAnimal
  },
  { id: "FLD-A1-201", sectionId: "A1", label: "Pesticides analysis available?", type: "yesno", required: "mandatory", owner: "REG", source: "FLM r45", help: "Yes \u2192 upload the analysis. No \u2192 give a reason.", noJustification: true },
  { id: "FLD-A1-202", sectionId: "A1", label: "Pesticides analysis (PDF)", type: "file", required: "conditional", owner: "REG", source: "FLM r46", showWhen: (a) => a["FLD-A1-201"] === true },
  { id: "FLD-A1-203", sectionId: "A1", label: "Reason the pesticides analysis is not available", type: "longtext", required: "conditional", owner: "REG", source: "FLM r47", showWhen: (a) => a["FLD-A1-201"] === false },
  { id: "FLD-A1-204", sectionId: "A1", label: "Is palm (kernel) oil used as feedstock?", type: "yesno", required: "mandatory", owner: "REG", source: "FLM r48", noJustification: true },
  {
    id: "FLD-A1-206",
    sectionId: "A1",
    label: "RSPO certification",
    type: "single",
    options: ["Mass Balance", "Segregated", "Identity Preserved", "No RSPO certification"].map((x) => ({ value: x, label: x })),
    required: "conditional",
    owner: "REG",
    source: "FLM r49",
    help: "Mass Balance is the minimum for palm. The RSPO number must be on the certificate of analysis (CoA) you upload in K1.",
    showWhen: (a) => a["FLD-A1-204"] === true
  },
  { id: "FLD-A1-207", sectionId: "A1", label: "Other certification available?", type: "yesno", required: "conditional", owner: "REG", source: "FLM r50", showWhen: (a) => a["FLD-A1-206"] === "No RSPO certification" },
  { id: "FLD-A1-208", sectionId: "A1", label: "Other certification (name)", type: "text", required: "conditional", owner: "REG", source: "FLM r51", help: "Upload the certificate below.", showWhen: (a) => a["FLD-A1-207"] === true },
  { id: "FLD-A1-209", sectionId: "A1", label: "Other certification: certificate", type: "file", required: "conditional", owner: "REG", source: "FLM r51 (certificate upload of FLD-A1-208)", help: "The certificate of the certification named above.", showWhen: (a) => a["FLD-A1-207"] === true },
  // Annex 2 (FLM r37–r43)
  {
    id: "FLD-A2-101",
    sectionId: "A2",
    label: "INCI (European) / IUPAC",
    type: "text",
    required: "mandatory",
    owner: "RMM",
    source: "FLM r37",
    help: "Pre-filled with the main INCI of this request; change it if needed.",
    // The main INCI first (mandatory on New case); the components' INCIs only as a fallback. One field per case.
    prefill: (c) => c.inci?.trim() || c.components.map((r) => r.inci?.trim()).filter(Boolean).join("; ") || void 0
  },
  {
    id: "FLD-A2-102",
    sectionId: "A2",
    label: "Manufacturing process",
    type: "multi",
    options: ["Chemical", "Physical", "Enzymatic", "Biotechnology / Fermentation", "Other"].map((x) => ({ value: x, label: x })),
    required: "mandatory",
    owner: "RMM",
    source: "FLM r38\u2013r42",
    help: "Several may apply."
  },
  { id: "FLD-A2-103", sectionId: "A2", label: "Manufacturing process (individual)", type: "text", required: "conditional", owner: "RMM", source: "FLM r43", help: "For example hydrolysis, refining, synthesis or fermentation.", showWhen: (a) => Array.isArray(a["FLD-A2-102"]) && a["FLD-A2-102"].includes("Other") },
  // Annex 4 (FLM r53–r55)
  { id: "FLD-A4-101", sectionId: "A4", label: "MOAH concentration", type: "number", unit: "mg/kg", required: "mandatory", owner: "SAF", source: "FLM r53", help: "Determined by online HPLC-GC-FID, in mg/kg.", validate: (v) => typeof v === "number" && v < 0 ? "Must be 0 or more" : null },
  {
    id: "FLD-A4-102",
    sectionId: "A4",
    label: "Kinematic viscosity at 100 \xB0C: availability",
    type: "single",
    options: [
      { value: "Not available", label: "Not available" },
      { value: "Conclusion by analogy", label: "Available \u2014 conclusion by analogy" },
      { value: "Own value", label: "Available \u2014 own value" }
    ],
    required: "mandatory",
    owner: "SAF",
    source: "FLM r54",
    noJustification: true
  },
  { id: "FLD-A4-103", sectionId: "A4", label: "Kinematic viscosity at 100 \xB0C", type: "number", unit: "mm\xB2/s", required: "conditional", owner: "SAF", source: "FLM r55", help: "Unit mm\xB2/s (cSt). If you enter a value, upload the analytical data below.", showWhen: viscosityAvailable, validate: (v) => typeof v === "number" && v <= 0 ? "Must be greater than 0" : null },
  {
    id: "FLD-A4-104",
    sectionId: "A4",
    label: "Kinematic viscosity: analytical data",
    type: "file",
    required: "conditional",
    owner: "SAF",
    source: "FLM r55 (upload of FLD-A4-103; the former FLD-A4-104)",
    help: "Required because you entered a viscosity value.",
    showWhen: (a, c) => viscosityAvailable(a, c) && typeof a["FLD-A4-103"] === "number"
  }
];
var FIELDS = [...BUILTIN_FIELDS];
var FIELD_BY_ID = Object.fromEntries(FIELDS.map((f) => [f.id, f]));
var BUILTIN_FIELD_BY_ID = Object.fromEntries(BUILTIN_FIELDS.map((f) => [f.id, f]));
var BUILTIN_SECTION_BY_ID = Object.fromEntries(BUILTIN_SECTIONS.map((x) => [x.id, x]));
var FIRST_TEMPLATE = "CIQ-2026 v1";
var BUILTIN_TEMPLATE_VERSIONS = ["CIQ-2026 v1", "CIQ-2026 v2"];
var V1_LEAVES_OUT = ["K6.3", "A12"];
function builtinSectionIds(templateVersion) {
  const all = BUILTIN_SECTIONS.map((x) => x.id);
  return String(templateVersion ?? "").endsWith("v1") ? all.filter((id) => !V1_LEAVES_OUT.includes(id)) : all;
}
var isChoiceType = (t) => t === "single" || t === "multi";
var isNumberType = (t) => t === "number" || t === "decimal";
function fieldData(f) {
  const d = { id: f.id, label: f.label, type: f.type, required: f.required, owner: f.owner };
  if (isChoiceType(f.type)) d.options = (f.options ?? []).map((o) => ({ value: o.value, label: o.label }));
  if (isNumberType(f.type)) d.unit = f.unit ?? "";
  if (f.help) d.help = f.help;
  return d;
}
function sectionData(sec, fields, owners) {
  return {
    id: sec.id,
    code: sec.code,
    title: sec.title,
    kind: sec.kind,
    meaning: sec.meaning,
    lead: owners?.lead ?? sec.lead,
    co: [...owners?.co ?? sec.co],
    documentsOnly: sec.documentsOnly,
    fields: sec.documentsOnly ? [] : fields.map(fieldData),
    ...sec.retired ? { retired: true } : {},
    trigger: sec.trigger
  };
}
function builtinTemplateData(templateVersion, ownership) {
  const ids = new Set(builtinSectionIds(templateVersion));
  return {
    version: templateVersion,
    sections: BUILTIN_SECTIONS.filter((x) => ids.has(x.id)).map(
      (x) => sectionData(
        x,
        BUILTIN_FIELDS.filter((f) => f.sectionId === x.id),
        ownership?.[x.id]
      )
    )
  };
}
function resolved(version, sections, fieldsOfSection) {
  const fields = new Map(sections.map((x) => [x.id, x.documentsOnly ? [] : fieldsOfSection(x.id)]));
  return { version, sections, byId: new Map(sections.map((x) => [x.id, x])), fields, fieldById: new Map([...fields.values()].flat().map((f) => [f.id, f])) };
}
var builtinCache = /* @__PURE__ */ new Map();
function builtinResolved(templateVersion) {
  const key = String(templateVersion ?? "").endsWith("v1") ? "CIQ-2026 v1" : "CIQ-2026 v2";
  let r = builtinCache.get(key);
  if (!r) {
    const ids = new Set(builtinSectionIds(key));
    r = resolved(
      key,
      BUILTIN_SECTIONS.filter((x) => ids.has(x.id)),
      (id) => BUILTIN_FIELDS.filter((f) => f.sectionId === id)
    );
    builtinCache.set(key, r);
  }
  return r;
}
var sameJson = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function hydrateField(sectionId, d) {
  const b = BUILTIN_FIELD_BY_ID[d.id];
  if (b && b.sectionId === sectionId && sameJson(fieldData(b), d)) return b;
  const keep = !!b && b.type === d.type;
  return {
    id: d.id,
    sectionId,
    label: d.label,
    type: d.type,
    required: d.required,
    ...isChoiceType(d.type) ? { options: (d.options ?? []).map((o) => ({ ...o })) } : {},
    ...isNumberType(d.type) && d.unit ? { unit: d.unit } : {},
    ...d.help?.trim() ? { help: d.help } : {},
    owner: d.owner,
    source: b?.source ?? "Added by the business administrator",
    ...keep && b.showWhen ? { showWhen: b.showWhen } : {},
    ...keep && b.validate ? { validate: b.validate } : {},
    ...keep && b.noJustification ? { noJustification: b.noJustification } : {},
    ...keep && b.derivedFrom ? { derivedFrom: b.derivedFrom } : {},
    ...keep && b.prefill ? { prefill: b.prefill } : {},
    ...keep && b.hint ? { hint: b.hint } : {},
    // A question the administrator added gets the check its answer type promises in the question form.
    ...!b && d.type === "email" ? { validate: (v) => typeof v === "string" && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v) ? "Not a valid e-mail address" : null } : {},
    ...!b && d.type === "number" ? { validate: (v) => typeof v === "number" && !Number.isInteger(v) ? "Enter a whole number" : null } : {},
    ...b?.liveOnly ? { liveOnly: true } : {}
  };
}
function hydrateSection(d) {
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
    ...d.retired ? { retired: true } : {}
  };
}
var dataCache = /* @__PURE__ */ new WeakMap();
function dataResolved(t) {
  let r = dataCache.get(t);
  if (!r) {
    const byData = new Map(t.sections.map((x) => [x.id, x]));
    r = resolved(
      t.version,
      t.sections.map(hydrateSection),
      (id) => (byData.get(id)?.fields ?? []).map((f) => hydrateField(id, f))
    );
    dataCache.set(t, r);
  }
  return r;
}
var synced;
var syncedConfig = () => synced;
var cfgOf = (cfg) => cfg ?? synced;
function templatePairOf(cfg, templateVersion) {
  if (!cfg || templateVersion === FIRST_TEMPLATE) return void 0;
  return cfg.pairs.find((p) => p.template.version === templateVersion);
}
var ownsTemplate = (cfg, p) => templatePairOf(cfg, p.template.version) === p;
function templateData(templateVersion, cfg) {
  const pair = templatePairOf(cfgOf(cfg), templateVersion);
  if (pair) return pair.template;
  return BUILTIN_TEMPLATE_VERSIONS.includes(templateVersion) ? builtinTemplateData(templateVersion) : void 0;
}
function resolveTemplate(templateVersion, cfg) {
  const pair = templatePairOf(cfgOf(cfg), templateVersion);
  return pair ? dataResolved(pair.template) : builtinResolved(templateVersion);
}
function templateSections(templateVersion, cfg, includeRetired = false) {
  const r = resolveTemplate(templateVersion, cfg);
  return includeRetired ? r.sections : r.sections.filter((x) => !x.retired);
}
var definingPairsNewestFirst = (cfg) => {
  const own = cfg.pairs.filter((p) => ownsTemplate(cfg, p));
  return [...own.filter((p) => p.status === "published")].reverse().concat(own.filter((p) => p.status === "draft"));
};
function newestSection(sectionId, cfg) {
  if (!cfg || cfg === synced) return SECTION_BY_ID[sectionId];
  const pairs = definingPairsNewestFirst(cfg);
  for (const p of pairs) {
    const hit = dataResolved(p.template).byId.get(sectionId);
    if (hit) return hit;
  }
  return BUILTIN_SECTION_BY_ID[sectionId];
}
function newestField(fieldId, cfg) {
  if (!cfg || cfg === synced) return FIELD_BY_ID[fieldId];
  const pairs = definingPairsNewestFirst(cfg);
  for (const p of pairs) {
    const hit = dataResolved(p.template).fieldById.get(fieldId);
    if (hit) return hit;
  }
  return BUILTIN_FIELD_BY_ID[fieldId];
}
function sectionOf(sectionId, templateVersion, cfg) {
  const c = cfgOf(cfg);
  return (templateVersion ? resolveTemplate(templateVersion, c).byId.get(sectionId) : void 0) ?? newestSection(sectionId, c);
}
function fieldsOf(sectionId, templateVersion, cfg) {
  return resolveTemplate(templateVersion, cfg).fields.get(sectionId) ?? [];
}
function fieldOf(fieldId, templateVersion, cfg) {
  const c = cfgOf(cfg);
  return (templateVersion ? resolveTemplate(templateVersion, c).fieldById.get(fieldId) : void 0) ?? newestField(fieldId, c);
}
var templateHasSection = (templateVersion, sectionId, cfg) => {
  const s2 = resolveTemplate(templateVersion, cfg).byId.get(sectionId);
  return !!s2 && !s2.retired;
};
function templateField(templateVersion, fieldId, cfg) {
  const r = resolveTemplate(templateVersion, cfg);
  const f = r.fieldById.get(fieldId);
  return f && !r.byId.get(f.sectionId)?.retired ? f : void 0;
}
function syncCatalog(cfg) {
  if (cfg === synced) return;
  synced = cfg;
  const pairs = (cfg?.pairs ?? []).filter((p) => ownsTemplate(cfg, p));
  const order = BUILTIN_SECTIONS.map((x) => x.id);
  const secById = new Map(BUILTIN_SECTIONS.map((x) => [x.id, x]));
  const fieldById = new Map(BUILTIN_FIELDS.map((f) => [f.id, f]));
  const fieldSection = new Map(BUILTIN_FIELDS.map((f) => [f.id, f.sectionId]));
  const fieldOrder = /* @__PURE__ */ new Map();
  for (const f of BUILTIN_FIELDS) fieldOrder.set(f.sectionId, [...fieldOrder.get(f.sectionId) ?? [], f.id]);
  const merge = (p, published) => {
    const r = dataResolved(p.template);
    let prev;
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
  const allFields = (ids) => ids.flatMap((id) => (fieldOrder.get(id) ?? []).filter((f) => fieldSection.get(f) === id).map((f) => fieldById.get(f)));
  SECTIONS.splice(0, SECTIONS.length, ...order.filter((id) => listed.has(id)).map((id) => secById.get(id)));
  for (const k of Object.keys(SECTION_BY_ID)) delete SECTION_BY_ID[k];
  for (const id of order) SECTION_BY_ID[id] = secById.get(id);
  FIELDS.splice(0, FIELDS.length, ...allFields(order).filter((f) => listedFields.has(f.id)));
  for (const k of Object.keys(FIELD_BY_ID)) delete FIELD_BY_ID[k];
  for (const f of allFields(order)) FIELD_BY_ID[f.id] = f;
}
var CASES_NAV = { to: "/cases", label: "Cases", icon: "FolderKanban" };
var REVIEWS_NAV = { to: "/review", label: "My reviews", icon: "ClipboardCheck" };
var RULES_NAV = { to: "/admin/rules", label: "Rules", icon: "GitBranch" };
var SUPPLIERS_NAV = { to: "/suppliers", label: "Suppliers", icon: "Building2" };
var SUPPLIER_NAV = [
  { to: "/portal", label: "My requests", icon: "Inbox" },
  { to: "/portal/help", label: "Help", icon: "LifeBuoy" }
];
var SUPPLIER_PERSONA_DESCRIPTION = "External supplier contact. Fills in the CIQ for the requests it is named on: answers the metadata questions, completes the sections that open, uploads evidence, answers Beiersdorf's questions, and confirms completeness and gives the final release.";
var INTERNAL_PERSONAS = [
  {
    id: "rmm",
    label: "Raw Material Manager (RMM)",
    userId: "u-rmm",
    side: "internal",
    dept: "RMM",
    landing: "/rmm",
    description: "Owns CIQ cases: starts them with the supplier contacts and target markets, reviews the whole CIQ alongside the departments and completes its own review, cancels or reactivates a case, looks up the suppliers (maintained by the business administrator) and receives the final document.",
    nav: [{ to: "/rmm", label: "Dashboard", icon: "LayoutDashboard" }, REVIEWS_NAV, CASES_NAV, SUPPLIERS_NAV]
  },
  ...REVIEW_DEPTS.map((d) => ({
    id: d.toLowerCase(),
    label: `${DEPT_LABEL[d]} reviewer`,
    userId: `u-${d.toLowerCase()}`,
    side: "internal",
    dept: d,
    landing: "/review",
    description: d === "SAF" || d === "REG" ? `Reviews the ${DEPT_SHORT[d]} sections, asks the supplier directly, records the internal evaluation (RMES) with its Approved or Rejected decision, and completes the ${DEPT_SHORT[d]} review.` : `Reviews the ${DEPT_SHORT[d]} sections, asks the supplier directly and completes the ${DEPT_SHORT[d]} review.`,
    nav: [REVIEWS_NAV, CASES_NAV]
  })),
  {
    id: "cus",
    label: "Customs & Trade Compliance",
    userId: "u-cus",
    side: "internal",
    dept: "CUS",
    landing: "/cases",
    description: "Owns K7 (HS code, export control, CITES). Informed and read-only; may post internal notes.",
    nav: [CASES_NAV]
  },
  {
    id: "leg",
    label: "Legal / IP",
    userId: "u-leg",
    side: "internal",
    dept: "LEG",
    landing: "/cases",
    description: "Owns K8 and K8.1 (patents and licences). Informed and read-only; may post internal notes.",
    nav: [CASES_NAV]
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
      SUPPLIERS_NAV
    ],
    hiddenRoutes: ["/admin/notifications"]
  },
  {
    id: "auditor",
    label: "Auditor",
    userId: "u-auditor",
    side: "internal",
    landing: "/audit",
    description: "Reconstructs who assessed what, when, on which data, document and rule-set version. Read-only.",
    // Rules read-only: which rule-set version decided a scope.
    nav: [{ to: "/audit", label: "Audit trail", icon: "ScrollText" }, CASES_NAV, RULES_NAV]
  },
  {
    id: "owner",
    label: "Business owner (reports)",
    userId: "u-owner",
    side: "internal",
    landing: "/reports",
    description: "Process owner: pipeline, lead times, workload, clarifications and supplier performance. Read-only.",
    nav: [{ to: "/reports", label: "Reports", icon: "BarChart3" }, CASES_NAV]
  }
];
var LEGACY_SUPPLIER_PERSONAS = [
  { id: "supplier", label: "Supplier contact", userId: "u-sup-1", side: "supplier", landing: "/portal", description: SUPPLIER_PERSONA_DESCRIPTION, nav: SUPPLIER_NAV },
  {
    id: "supplier2",
    label: "Supplier contact (second)",
    userId: "u-sup-2",
    side: "supplier",
    landing: "/portal",
    description: "External colleague of the first contact, filling in other sections at the same time. Every answer shows who entered it.",
    nav: SUPPLIER_NAV
  }
];
var PERSONAS = [...INTERNAL_PERSONAS, ...LEGACY_SUPPLIER_PERSONAS];
var PERSONA_BY_ID = Object.fromEntries(PERSONAS.map((p) => [p.id, p]));

// prototype/src/domain/builtinRules.ts
var ALWAYS = { kind: "always" };
var origin = (...values) => ({ kind: "includes-any", question: "SF01", values });
var market = (...values) => ({ kind: "includes-any", question: "SF11", values });
var ALWAYS_DOC = ["GEN", "K1", "K5.2", "K6.1", "A10"];
var ALWAYS_ASSUMED = ["K2.1", "K2.2", "K2.3", "K3", "K4.1", "K4.2", "K5.3", "K6.5", "K6.6", "K6.7", "K6.9", "K6.10", "K6.11", "K6.12", "K6.16", "K7", "K8"];
var BASE_RULE_DATA = [
  { id: "R-00", question: "ALWAYS", condition: ALWAYS, activates: ALWAYS_DOC, outcome: "mandatory", evidence: ["SDS", "CoA", "Specification", "Statements"], departments: ["QM", "MIC", "REG"], basis: "document", note: "Stated as 'always' in the requirements document." },
  { id: "R-01", question: "ALWAYS", condition: ALWAYS, activates: ALWAYS_ASSUMED, outcome: "mandatory", departments: ["REG", "SAF", "QM", "RMM"], basis: "not-stated", note: "Not stated in the requirements document; every case gets these chapters." },
  { id: "R-02", question: "ALWAYS", condition: ALWAYS, activates: ["K6.8", "K8.1"], outcome: "optional", departments: ["REG", "LEG"], basis: "open", note: "Optional for every case: Halal and kosher status (K6.8), and K8.1 as the follow-up of K8." },
  { id: "R-10", question: "SF01", condition: origin("vegetable"), activates: ["A1", "A2", "A9"], outcome: "mandatory", evidence: ["Pesticide and mycotoxin analysis", "Sustainability certificates"], departments: ["REG", "RMM", "SAF"], basis: "document", note: "A3, A11 and A12 open through their own questions (SF-06, SF-11)." },
  { id: "R-12", question: "SF01", condition: origin("animal"), activates: [], outcome: "mandatory", evidence: ["BSE/TSE certificate", "Conformity with Annex II entry 419"], departments: ["REG", "QM"], basis: "document" },
  { id: "R-13", question: "SF01", condition: origin("mineral"), activates: ["A1"], outcome: "mandatory", evidence: ["Origin and specification of the mineral source"], departments: ["REG", "SAF"], basis: "document", note: "Colorants (A7) open through SF-05." },
  { id: "R-14", question: "SF01", condition: origin("petrochemical"), activates: ["A1", "A4", "A9"], outcome: "mandatory", evidence: ["MOAH value", "PAH analysis against BDF limits"], departments: ["REG", "SAF"], basis: "document" },
  { id: "R-15", question: "SF01", condition: origin("polymer"), activates: ["A1", "A6", "K4.3"], outcome: "mandatory", evidence: ["Residual monomer content", "SPM scope statement"], departments: ["SAF", "REG"], basis: "document" },
  { id: "R-16", question: "SF01", condition: origin("waste", "ccu", "chemrec"), activates: [], outcome: "mandatory", departments: ["RMM"], basis: "agreed", note: "No rules for these origins: the supplier gets the standard sections, and the case is flagged in RMM's review.", flagsCase: true },
  { id: "R-30", question: "SF03", condition: { kind: "is", question: "SF03", value: true }, activates: ["K4.3", "A6"], outcome: "mandatory", departments: ["SAF", "REG"], basis: "document" },
  { id: "R-40", question: "SF04", condition: { kind: "is", question: "SF04", value: true }, activates: ["A5"], outcome: "mandatory", departments: ["REG"], basis: "document" },
  { id: "R-50", question: "SF05", condition: { kind: "includes-any", question: "SF05", values: ["colorant"] }, activates: ["A7"], outcome: "mandatory", departments: ["REG"], basis: "document" },
  { id: "R-51", question: "SF05", condition: { kind: "includes-any", question: "SF05", values: ["preservative"] }, activates: ["A8"], outcome: "mandatory", departments: ["REG", "SAF"], basis: "document" },
  { id: "R-60", question: "SF06", condition: { kind: "is", question: "SF06", value: true }, activates: ["A3"], outcome: "mandatory", departments: ["QM", "MIC"], basis: "document" },
  { id: "R-70", question: "SF07", condition: { kind: "is", question: "SF07", value: true }, activates: ["A4", "A9"], outcome: "mandatory", departments: ["SAF"], basis: "document", note: "Catches mineral oils entered with origin 'Mineral'." },
  { id: "R-90", question: "SF09", condition: { kind: "is", question: "SF09", value: true }, activates: ["K6.17"], outcome: "mandatory", departments: ["SUS", "REG"], basis: "document" },
  { id: "R-100", question: "SF10", condition: { kind: "is", question: "SF10", value: true }, activates: ["K6.16.1"], outcome: "mandatory", departments: ["REG"], basis: "document" },
  { id: "R-110", question: "SF11", condition: market("UK"), activates: ["K6.2", "A11"], outcome: "mandatory", departments: ["REG"], basis: "agreed", note: "Split of the SF-11 rule per market." },
  { id: "R-112", question: "SF11", condition: market("CN"), activates: ["K6.13"], outcome: "mandatory", departments: ["REG"], basis: "agreed" },
  { id: "R-113", question: "SF11", condition: market("US"), activates: ["K6.14"], outcome: "mandatory", departments: ["REG", "SAF"], basis: "agreed" },
  { id: "R-114", question: "SF11", condition: market("CA"), activates: ["K6.15"], outcome: "mandatory", departments: ["REG"], basis: "agreed" },
  { id: "R-115", question: "SF11", condition: { kind: "any-except", question: "SF11", values: ["EU"] }, activates: ["K6.4", "A13"], outcome: "mandatory", departments: ["REG"], basis: "agreed" },
  { id: "R-120", question: "SF12", condition: { kind: "is", question: "SF12", value: false }, activates: ["K5.1"], outcome: "na", departments: ["MIC"], basis: "document", note: "Waiver needs a written justification; K5.2 stays mandatory." },
  { id: "R-121", question: "SF12", condition: { kind: "yes-or-unanswered", question: "SF12" }, activates: ["K5.1"], outcome: "mandatory", departments: ["MIC"], basis: "document" }
];
var TURKEY_RULE_DATA = { id: "R-111", question: "SF11", condition: market("TR"), activates: ["K6.3", "A12"], outcome: "mandatory", departments: ["REG"], basis: "agreed", note: "Added with questionnaire v2 (Turkey REACH / KKDIK)." };
var RS1 = { version: "RS-2026.1", templateVersion: "CIQ-2026 v1", publishedAt: "2026-09-21T10:00:00Z", publishedBy: "u-admin", changeNote: "First rule set derived from requirements document v2.0 \xA75.3\u20135.4.", rules: BASE_RULE_DATA };
var RS2 = { version: "RS-2026.2", templateVersion: "CIQ-2026 v2", changeNote: "Adds Turkey REACH (KKDIK) for the Turkey market \u2014 pairs with questionnaire v2.", rules: [...BASE_RULE_DATA, TURKEY_RULE_DATA] };
var copyRule = (r) => JSON.parse(JSON.stringify(r));

// prototype/src/domain/conditions.ts
function evaluateCondition(cond, c) {
  switch (cond.kind) {
    case "always":
      return true;
    case "includes-any": {
      const v = c[cond.question];
      return Array.isArray(v) && v.some((x) => cond.values.includes(x));
    }
    case "any-except": {
      const v = c[cond.question];
      return Array.isArray(v) && v.some((x) => !cond.values.includes(x));
    }
    case "is":
      return c[cond.question] === cond.value;
    case "yes-or-unanswered":
      return c[cond.question] !== false;
  }
}
var conditionCheck = (cond) => (c) => evaluateCondition(cond, c);
var conditionQuestion = (cond) => cond.kind === "always" ? "ALWAYS" : cond.question;
function conditionKindsFor(question) {
  if (question === "ALWAYS") return ["always"];
  return CONFIG_BY_ID[question]?.kind === "multi" ? ["includes-any", "any-except"] : ["is", "yes-or-unanswered"];
}
var CONDITION_QUESTIONS = [
  { id: "ALWAYS", code: "Always", label: "Every case, whatever the answers", kind: "always" },
  ...CONFIG_QUESTIONS.map((q) => ({ id: q.id, code: q.code, label: q.label, kind: q.kind }))
];
function conditionProblem(cond) {
  if (cond.kind === "always") return null;
  const q = CONFIG_BY_ID[cond.question];
  if (!q) return "Choose the question that switches the rule on.";
  if (!conditionKindsFor(cond.question).includes(cond.kind)) return q.kind === "multi" ? `${q.code} is a multiple-choice question: use "includes any of" or "has any value except".` : `${q.code} is a yes/no question: use "is Yes", "is No" or "is Yes or not answered".`;
  if (cond.kind === "includes-any" || cond.kind === "any-except") {
    const known = new Set((q.options ?? []).map((o) => o.value));
    const unknown = cond.values.filter((v) => !known.has(v));
    if (unknown.length) return `${q.code} has no answer ${unknown.map((v) => `\u201C${v}\u201D`).join(", ")}.`;
    if (cond.kind === "includes-any" && !cond.values.length) return `Tick at least one answer of ${q.code}.`;
    if (cond.kind === "any-except" && cond.values.length >= (q.options ?? []).length) return `Leave at least one answer of ${q.code} unticked.`;
  }
  return null;
}
var SHORT_OPTION = {
  vegetable: "Vegetable",
  animal: "Animal",
  mineral: "Mineral",
  petrochemical: "Petrochemical",
  polymer: "Polymer",
  waste: "Waste",
  ccu: "CCU",
  chemrec: "Chemical recycling",
  colorant: "Colorant",
  preservative: "Preservative",
  EU: "the EU",
  UK: "United Kingdom",
  TR: "Turkey",
  CN: "China",
  US: "USA",
  CA: "Canada",
  OTHER: "Other markets"
};
function optionShort(question, value) {
  return SHORT_OPTION[value] ?? CONFIG_BY_ID[question]?.options?.find((o) => o.value === value)?.label ?? value;
}
var MULTI_SUBJECT = {
  SF01: { subject: "Origin", verb: "includes", noun: "origin" },
  SF05: { subject: "Material type", verb: "includes", noun: "material type" },
  SF11: { subject: "Target markets", verb: "include", noun: "target market" }
};
var YESNO_SUBJECT = {
  SF03: "Polymer",
  SF04: "UV filter",
  SF06: "Fermentation or GMO",
  SF07: "Mineral oil or hydrocarbon",
  SF09: "In EUDR scope",
  SF10: "Brazilian genetic heritage",
  SF12: "Microbiological test required"
};
var orList = (xs) => xs.length <= 1 ? xs[0] ?? "" : `${xs.slice(0, -1).join(", ")} or ${xs.at(-1)}`;
var andList = (xs) => xs.length <= 1 ? xs[0] ?? "" : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`;
var yesNoName = (q) => `${YESNO_SUBJECT[q] ?? CONFIG_BY_ID[q]?.label ?? q} (${CONFIG_BY_ID[q]?.code ?? q})`;
var multi = (q) => MULTI_SUBJECT[q] ?? { subject: CONFIG_BY_ID[q]?.code ?? q, verb: "includes", noun: `answer to ${CONFIG_BY_ID[q]?.code ?? q}` };
var outsideEu = (cond) => cond.kind === "any-except" && cond.question === "SF11" && cond.values.length === 1 && cond.values[0] === "EU";
function conditionText(cond) {
  switch (cond.kind) {
    case "always":
      return "Every case";
    case "includes-any": {
      const m = multi(cond.question);
      return `${m.subject} ${m.verb} ${orList(cond.values.map((v) => optionShort(cond.question, v))) || "(no answer ticked)"}`;
    }
    case "any-except": {
      if (outsideEu(cond)) return "Any target market outside the EU";
      const m = multi(cond.question);
      const noun = m.noun.charAt(0).toUpperCase() + m.noun.slice(1);
      return cond.values.length ? `Any ${m.noun} other than ${orList(cond.values.map((v) => optionShort(cond.question, v)))}` : `${noun} answered`;
    }
    case "is":
      return `${yesNoName(cond.question)} is ${cond.value ? "Yes" : "No"}`;
    case "yes-or-unanswered":
      return `${yesNoName(cond.question)} is Yes or not answered`;
  }
}
function conditionClause(cond) {
  switch (cond.kind) {
    case "always":
      return "For every case";
    case "includes-any": {
      const m = multi(cond.question);
      return `If the ${m.subject.toLowerCase()} ${m.verb} ${orList(cond.values.map((v) => optionShort(cond.question, v))) || "(no answer ticked)"}`;
    }
    case "any-except": {
      if (outsideEu(cond)) return "If any target market is outside the EU";
      const m = multi(cond.question);
      return cond.values.length ? `If any ${m.noun} is other than ${orList(cond.values.map((v) => optionShort(cond.question, v)))}` : `If the ${m.noun} is answered`;
    }
    case "is":
    case "yes-or-unanswered": {
      const q = CONFIG_BY_ID[cond.question];
      const who = q?.answeredBy === "rmm" ? "Beiersdorf answers" : "the supplier answers";
      const name = `${q?.code ?? cond.question}${YESNO_SUBJECT[cond.question] ? ` (${YESNO_SUBJECT[cond.question]})` : ""}`;
      return cond.kind === "is" ? `If ${who} ${cond.value ? "Yes" : "No"} to ${name}` : `If ${who} Yes to ${name}, or has not answered it yet`;
    }
  }
}
function conditionReason(cond) {
  switch (cond.kind) {
    case "always":
      return null;
    case "includes-any": {
      const m = multi(cond.question);
      return `the ${m.subject.toLowerCase()} ${m.verb} ${orList(cond.values.map((v) => optionShort(cond.question, v)))}`;
    }
    case "any-except": {
      if (outsideEu(cond)) return "a target market is outside the EU";
      const m = multi(cond.question);
      const article = /^[aeiou]/i.test(m.noun) ? "an" : "a";
      return cond.values.length ? `${article} ${m.noun} other than ${orList(cond.values.map((v) => optionShort(cond.question, v)))} is chosen` : `the ${m.noun} is answered`;
    }
    case "is":
    case "yes-or-unanswered": {
      const q = CONFIG_BY_ID[cond.question];
      const who = q?.answeredBy === "rmm" ? "Beiersdorf answered" : "you answered";
      const name = q?.label ? `\u201C${q.label}\u201D` : cond.question;
      return cond.kind === "is" ? `${who} ${cond.value ? "Yes" : "No"} to ${name}` : `${who} Yes to ${name} or have not answered it yet`;
    }
  }
}
function reasonSentence(conds) {
  const clauses = conds.map(conditionReason);
  if (!clauses.length || clauses.some((x) => x === null)) return "Asked for every raw material";
  return `Asked for because ${andList([...new Set(clauses)])}`;
}
var OUTCOME_WORD = { mandatory: "mandatory", optional: "optional", na: "not applicable" };
function sectionsText(ids, codeOf2 = (id) => SECTION_BY_ID[id]?.code ?? id) {
  const codes = ids.map(codeOf2);
  const annex = codes.map((c) => /^Annex\s+(.+)$/.exec(c)?.[1]);
  if (codes.length > 1 && annex.every(Boolean)) return `Annex ${andList(annex)}`;
  return andList(codes);
}
function ruleSentence(r, codeOf2, titleOf) {
  const clause = conditionClause(r.condition);
  const evidence = (r.evidence ?? []).filter((e) => e.trim());
  const out = [];
  if (r.activates.length) {
    const one = r.activates.length === 1 ? titleOf?.(r.activates[0])?.trim() : void 0;
    out.push(`${clause}, ${sectionsText(r.activates, codeOf2)}${one ? ` ${one}` : ""} ${r.activates.length === 1 ? "becomes" : "become"} ${OUTCOME_WORD[r.outcome]}.`);
    if (evidence.length) out.push(`The supplier uploads ${andList(evidence)}.`);
  } else if (evidence.length) out.push(`${clause}, the supplier uploads ${andList(evidence)}.`);
  else if (r.flagsCase) out.push(`${clause}, the case is flagged in RMM's review.`);
  else out.push(`${clause}, nothing changes yet: choose the sections it switches on or the evidence it asks for.`);
  if (r.departments.length) out.push(`Reviewed by ${andList(r.departments.map((d) => DEPT_SHORT[d]))}.`);
  return out.join(" ");
}

// prototype/src/domain/core.ts
var seq = 0;
var uid = (p) => `${p}-${Date.now().toString(36)}${(seq++).toString(36)}`;
var getCase = (s2, id) => s2.cases.find((c) => c.id === id);
var mapCase = (s2, id, fn) => ({ ...s2, cases: s2.cases.map((c) => c.id === id ? fn(c) : c) });
function toast(s2, tone, text) {
  return { ...s2, toasts: [...s2.toasts.slice(-3), { id: uid("t"), tone, text }] };
}
function refuse(s2, text, tone = "danger") {
  return { ...s2, toasts: [...s2.toasts.slice(-3), { id: uid("t"), tone, text, refusal: true }] };
}
function wasRefused(prev, next) {
  if (next === prev) return true;
  const t = next.toasts.at(-1);
  return !!t?.refusal && t.id !== prev.toasts.at(-1)?.id;
}
function audit(c, by, at, action, detail, sectionId) {
  return { ...c, audit: [...c.audit, { id: `${c.id}-a${c.audit.length + 1}`, at, by, action, detail, sectionId, version: c.reviewVersion }] };
}
function setPhase(c, phase, at) {
  return { ...c, phase, phaseHistory: [...c.phaseHistory, { phase, at }] };
}
function logEvent(s2, e) {
  return { ...s2, log: [...s2.log, { ...e, id: `L-${String(s2.log.length + 1).padStart(4, "0")}` }] };
}

// prototype/src/domain/rules.ts
function hydrateRule(d) {
  return { ...d, when: conditionCheck(d.condition), text: conditionText(d.condition) };
}
var BUILTIN_RS1 = { version: RS1.version, status: "published", templateVersion: RS1.templateVersion, publishedAt: RS1.publishedAt, publishedBy: RS1.publishedBy, changeNote: RS1.changeNote, rules: RS1.rules.map(hydrateRule) };
var BUILTIN_RS2 = { version: RS2.version, status: "draft", templateVersion: RS2.templateVersion, changeNote: RS2.changeNote, rules: RS2.rules.map(hydrateRule) };
var FIRST_RULE_SET = RS1.version;
var pairCache = /* @__PURE__ */ new WeakMap();
function pairRuleSet(p, status, templateVersion) {
  let byKey = pairCache.get(p.ruleSet);
  if (!byKey) pairCache.set(p.ruleSet, byKey = /* @__PURE__ */ new Map());
  const key = `${status}|${templateVersion}`;
  let rs = byKey.get(key);
  if (!rs) {
    rs = { version: p.ruleSet.version, status, templateVersion, publishedAt: p.publishedAt, publishedBy: p.publishedBy, changeNote: p.changeNote, rules: p.ruleSet.rules.map(hydrateRule) };
    byKey.set(key, rs);
  }
  return rs;
}
var currentStoredPair = (cfg) => [...cfg?.pairs ?? []].reverse().find((p) => p.status === "published");
var draftStoredPair = (cfg) => cfg?.pairs.find((p) => p.status === "draft");
function ruleSetPairOf(cfg, ruleSetVersion) {
  if (!cfg || ruleSetVersion === FIRST_RULE_SET) return void 0;
  return cfg.pairs.find((p) => p.ruleSet.version === ruleSetVersion);
}
var ownsRuleSet = (cfg, p) => ruleSetPairOf(cfg, p.ruleSet.version) === p;
function ruleSetsOf(cfg) {
  if (!cfg) return [BUILTIN_RS1, BUILTIN_RS2];
  const current = currentStoredPair(cfg);
  const currentRs = current?.ruleSet.version ?? FIRST_RULE_SET;
  const lastTemplate = /* @__PURE__ */ new Map();
  for (const p of cfg.pairs) if (p.status === "published") lastTemplate.set(p.ruleSet.version, p.template.version);
  const statusOf = (version) => version === currentRs ? "published" : "superseded";
  const firstTpl = lastTemplate.get(FIRST_RULE_SET) ?? RS1.templateVersion;
  const first = statusOf(FIRST_RULE_SET) === "published" && firstTpl === RS1.templateVersion ? BUILTIN_RS1 : { ...BUILTIN_RS1, status: statusOf(FIRST_RULE_SET), templateVersion: firstTpl };
  const own = cfg.pairs.filter((p) => ownsRuleSet(cfg, p));
  return [first, ...own.map((p) => p.status === "draft" ? pairRuleSet(p, "draft", p.template.version) : pairRuleSet(p, statusOf(p.ruleSet.version), lastTemplate.get(p.ruleSet.version) ?? p.template.version))];
}
var RULE_SETS = ruleSetsOf(void 0);
function ruleSet(version, cfg) {
  const c = cfg ?? syncedConfig();
  const all = c === syncedConfig() ? RULE_SETS : ruleSetsOf(c);
  return all.find((r) => r.version === version) ?? all[0];
}
function syncRegistry(cfg) {
  if (cfg === syncedConfig() && RULE_SETS.length) return;
  syncCatalog(cfg);
  RULE_SETS.splice(0, RULE_SETS.length, ...ruleSetsOf(cfg));
}
var RANK = { mandatory: 3, optional: 2, na: 1 };
function deriveScope(config, ruleSetVersion, templateVersion = "CIQ-2026 v1", cfg) {
  const rs = ruleSet(ruleSetVersion, cfg);
  const sections = templateSections(templateVersion, cfg);
  const inTemplate = new Set(sections.map((x) => x.id));
  const best = /* @__PURE__ */ new Map();
  for (const rule of rs.rules) {
    if (!rule.when(config)) continue;
    for (const sec of rule.activates) {
      if (!inTemplate.has(sec)) continue;
      const cur = best.get(sec);
      const reason = `${rule.text} \u2192 ${rule.id}`;
      if (!cur || RANK[rule.outcome] > RANK[cur.a]) best.set(sec, { a: rule.outcome, rules: [rule.id], reasons: [reason] });
      else if (RANK[rule.outcome] === RANK[cur.a]) {
        cur.rules.push(rule.id);
        cur.reasons.push(reason);
      }
    }
  }
  return sections.map((s2) => {
    const hit = best.get(s2.id);
    return hit ? { sectionId: s2.id, applicability: hit.a, firedRules: hit.rules, reason: hit.reasons.join("; ") } : { sectionId: s2.id, applicability: "na", firedRules: [], reason: "No rule activates this section for these answers" };
  });
}
var EVIDENCE_FIELDS = {
  SDS: ["FLD-K1-001"],
  CoA: ["FLD-K1-002"],
  Specification: ["FLD-K1-003"],
  Statements: ["FLD-K1-004"],
  "Pesticide and mycotoxin analysis": ["FLD-A1-202", "FLD-A1-203"],
  "Sustainability certificates": ["FLD-K1-005"],
  "BSE/TSE certificate": ["FLD-K1-006"],
  "Conformity with Annex II entry 419": ["FLD-K1-007"],
  "Origin and specification of the mineral source": ["FLD-2.3-12"],
  "MOAH value": ["FLD-A4-101"],
  "PAH analysis against BDF limits": ["FLD-K1-008"],
  "Residual monomer content": ["FLD-K1-009"],
  "SPM scope statement": ["FLD-K1-010"],
  // Legacy: R-80 (dropped 28 Oct) is still in the pinned bundles of earlier cases; without the mapping requestedDocs
  // would add an RSPO slot to them.
  "RSPO certificate with supply-chain model": ["FLD-A1-206"],
  "RSPO number on the CoA": ["FLD-K1-002"]
};
var UNDEFINED_ORIGINS = ["waste", "ccu", "chemrec"];
function undefinedOrigins(config) {
  return (config.SF01 ?? []).filter((o) => UNDEFINED_ORIGINS.includes(o));
}
function hasUndefinedOrigin(config) {
  return undefinedOrigins(config).length > 0;
}
function diffScope(before, after) {
  const b = new Map(before.map((x) => [x.sectionId, x.applicability]));
  const diff = { added: [], removed: [], changed: [] };
  const afterIds = new Set(after.map((x) => x.sectionId));
  for (const item of before) if (!afterIds.has(item.sectionId) && item.applicability !== "na") diff.removed.push(item.sectionId);
  for (const item of after) {
    const prev = b.get(item.sectionId) ?? "na";
    if (prev === item.applicability) continue;
    if (prev === "na") diff.added.push(item.sectionId);
    else if (item.applicability === "na") diff.removed.push(item.sectionId);
    else diff.changed.push({ sectionId: item.sectionId, from: prev, to: item.applicability });
  }
  return diff;
}
var KEPT_NOTE = "kept: the scope only grows after the completeness confirmation (REQ-CFG-008)";
function growScope(before, derived) {
  const prev = new Map(before.map((b) => [b.sectionId, b]));
  const g = { scope: [], added: [], upgraded: [], kept: [] };
  for (const d of derived) {
    const b = prev.get(d.sectionId);
    const from = b?.applicability ?? "na";
    if (RANK[d.applicability] > RANK[from]) {
      (from === "na" ? g.added : g.upgraded).push(d.sectionId);
      g.scope.push({ ...d, manual: b?.manual, addedLater: true });
    } else if (b && RANK[d.applicability] < RANK[from]) {
      g.kept.push(d.sectionId);
      g.scope.push(b.reason.includes(KEPT_NOTE) ? b : { ...b, reason: `${b.reason} \xB7 ${KEPT_NOTE}` });
    } else if (b?.manual) {
      g.scope.push(b);
    } else {
      g.scope.push({ ...d, addedLater: b?.addedLater });
    }
  }
  for (const b of before) if (!derived.some((d) => d.sectionId === b.sectionId)) g.scope.push(b);
  return g;
}

// prototype/src/domain/requestedDocs.ts
var SLOT_PREFIX = "EV:";
function slotKey(doc) {
  const slug = doc.trim().toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return `${SLOT_PREFIX}${slug || "document"}`;
}
var isSlotKey = (k) => !!k && k.startsWith(SLOT_PREFIX);
function evidenceFieldIds(doc) {
  const n = doc.trim().toLowerCase();
  if (!n) return void 0;
  const k = Object.keys(EVIDENCE_FIELDS).find((x) => x.toLowerCase() === n);
  return k ? EVIDENCE_FIELDS[k] : void 0;
}
function deriveRequestedDocs(c, cfg) {
  if (c.liveScope !== true) return [];
  const open = new Set(c.scope.filter((x) => x.applicability !== "na").map((x) => x.sectionId));
  const usable = (id) => open.has(id) && templateHasSection(c.templateVersion, id, cfg);
  const collected = (doc) => (evidenceFieldIds(doc) ?? []).some((fid) => {
    const f = templateField(c.templateVersion, fid, cfg);
    return !!f && open.has(f.sectionId);
  });
  const out = /* @__PURE__ */ new Map();
  for (const r of ruleSet(c.ruleSetVersion, cfg).rules) {
    if (!r.evidence?.length || !r.when(c.config)) continue;
    for (const raw of r.evidence) {
      const doc = raw.trim();
      if (!doc || collected(doc)) continue;
      const key = slotKey(doc);
      const hit = out.get(key);
      if (hit) {
        if (!hit.ruleIds.includes(r.id)) {
          hit.ruleIds.push(r.id);
          hit.conds.push(r.condition);
          if (!hit.conditions.includes(r.text)) hit.conditions.push(r.text);
        }
        continue;
      }
      const sectionId = r.activates.find(usable) ?? (usable("K1") ? "K1" : "GEN");
      out.set(key, { key, doc, sectionId, ruleIds: [r.id], why: "", conditions: [r.text], conds: [r.condition] });
    }
  }
  return [...out.values()].map(({ conds, ...x }) => ({ ...x, why: reasonSentence(conds) }));
}
var memo = /* @__PURE__ */ new WeakMap();
function requestedDocuments(c, cfg) {
  if (c.liveScope !== true) return [];
  const k = cfg ?? syncedConfig();
  let byCfg = memo.get(c);
  if (!byCfg) memo.set(c, byCfg = /* @__PURE__ */ new Map());
  const hit = byCfg.get(k);
  if (hit) return hit;
  const derived = deriveRequestedDocs(c, cfg);
  let out = derived;
  if (c.confirmations.some((x) => x.type === "completeness")) {
    const stored = c.requestedDocs ?? [];
    const now = new Map(derived.map((d) => [d.key, d]));
    out = stored.map((s2) => {
      const d = now.get(s2.key);
      return d ? { ...d, sectionId: s2.sectionId, ...s2.addedLater ? { addedLater: true } : {} } : { ...s2, kept: true };
    });
    for (const d of derived) if (!stored.some((s2) => s2.key === d.key)) out.push({ ...d, addedLater: true });
  }
  byCfg.set(k, out);
  return out;
}
var storableSlots = (slots) => slots.map(({ kept: _k, ...x }) => x);
var slotOf = (c, key, cfg) => requestedDocuments(c, cfg).find((x) => x.key === key);
var slotDocuments = (c, key) => c.documents.filter((d) => d.fieldId === key).sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt) || b.id.localeCompare(a.id));
function requestedDocStatus(c, slot) {
  if (c.documents.some((d) => d.fieldId === slot.key)) return "received";
  if (c.justifications[slot.key]?.trim()) return "justified";
  return "missing";
}
var requestedByText = (slot) => `requested by rule${slot.ruleIds.length === 1 ? "" : "s"} ${slot.ruleIds.join(", ")}`;
function docSectionId(c, d, cfg) {
  return isSlotKey(d.fieldId) ? slotOf(c, d.fieldId, cfg)?.sectionId ?? d.sectionId : d.sectionId;
}
function slotSection(c, key, cfg) {
  return slotOf(c, key, cfg)?.sectionId ?? c.documents.find((d) => d.fieldId === key)?.sectionId;
}
function slotName(c, key, cfg) {
  const s2 = slotOf(c, key, cfg);
  if (s2) return s2.doc;
  const t = key.slice(SLOT_PREFIX.length).replace(/-/g, " ");
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : "Requested document";
}
function alwaysOnSections(rules) {
  return new Set(rules.filter((r) => r.condition.kind === "always" && r.outcome !== "na").flatMap((r) => r.activates));
}
function uncollectedEvidence(evidence, activates, template, opts = {}) {
  const live = template.sections.filter((x) => !x.retired);
  const naRule = opts.outcome === "na";
  const at = naRule ? void 0 : activates.find((id) => live.some((x) => x.id === id));
  const sectionId = at ?? "K1";
  const code = live.find((x) => x.id === sectionId)?.code ?? sectionId;
  const opened = /* @__PURE__ */ new Set([...naRule ? [] : activates, ...opts.alwaysOn ?? []]);
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  for (const raw of evidence) {
    const doc = raw.trim();
    if (!doc || seen.has(doc.toLowerCase())) continue;
    seen.add(doc.toLowerCase());
    const homes = [...new Set((evidenceFieldIds(doc) ?? []).flatMap((fid) => live.filter((x) => x.fields.some((f) => f.id === fid))))];
    if (homes.some((x) => opened.has(x.id))) continue;
    out.push({ doc, sectionId, code, inK1: !at, ...naRule && activates.length ? { naRule: true } : {}, ...homes.length ? { onlyWithout: homes.map((x) => x.code) } : {} });
  }
  return out;
}
function uncollectedText(u) {
  const where = `under \u201CRequested documents\u201D in ${u.code}${u.inK1 ? u.naRule ? " (the rule makes its sections not applicable)" : " (the rule switches on no section)" : ""}`;
  if (u.onlyWithout?.length) {
    const secs = u.onlyWithout.join(" or ");
    return `\u201C${u.doc}\u201D is collected by a question in ${secs}, which this rule does not switch on: a case without ${secs} in scope gets an upload slot for it ${where} instead.`;
  }
  return `\u201C${u.doc}\u201D is not collected by a question yet: the supplier gets an upload slot for it ${where}.`;
}

// prototype/src/domain/selectors.ts
var NOW_ISO = "2026-10-06T09:00:00.000Z";
function nowIso() {
  return (/* @__PURE__ */ new Date()).toISOString() < NOW_ISO ? NOW_ISO : (/* @__PURE__ */ new Date()).toISOString();
}
var DAY = 864e5;
var PHASE_LABEL = {
  "supplier-input": "Supplier filling in the CIQ",
  review: "Review (RMM and departments)",
  "final-release": "Awaiting final release",
  completed: "Completed",
  cancelled: "Cancelled",
  // Legacy phases of the live portal's old flow (portal/data/map.ts); the prototype never produces them.
  metadata: "Basic data (portal, old flow)",
  "scope-check": "Scope check (portal, old flow)"
};
var isClosed = (c) => c.phase === "completed" || c.phase === "cancelled";
var scopeOf = (c, sectionId) => c.scope.find((s2) => s2.sectionId === sectionId);
var BDF_SET_FIELDS = ["FLD-GEN-001", "FLD-GEN-002", "FLD-GEN-003", "FLD-GEN-008", "FLD-GEN-009"];
var isSetByBdf = (c, fieldId) => c.liveScope === true && BDF_SET_FIELDS.includes(fieldId);
var manufacturerOf = (c) => typeof c.answers["FLD-GEN-004"] === "string" && c.answers["FLD-GEN-004"].trim() ? c.answers["FLD-GEN-004"].trim() : c.manufacturer;
var siteOf = (c) => typeof c.answers["FLD-GEN-005"] === "string" && c.answers["FLD-GEN-005"].trim() ? c.answers["FLD-GEN-005"].trim() : c.site;
function isVisible(f, c) {
  if (f.liveOnly && !c.liveScope) return false;
  return !f.showWhen || f.showWhen(c.answers, c.config);
}
function hasValue(v) {
  if (v === void 0 || v === null || v === "") return false;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === "object") return v.min !== null || v.max !== null;
  return true;
}
var answerOf = (c, f) => c.answers[f.derivedFrom ?? f.id];
var answeredByOf = (c, f) => c.answeredBy[f.derivedFrom ?? f.id];
var fieldAnswered = (c, f) => hasValue(answerOf(c, f)) || !f.noJustification && !!c.justifications[f.id];
var REQUIRED_CONFIG = ["SF01", "SF03", "SF04", "SF06", "SF07", "SF09", "SF10", "SF12"];
function isConfigAnswered(c, id) {
  const v = c.config[id];
  if (id === "SF01") return Array.isArray(v) && v.length > 0;
  return v !== void 0;
}
var unansweredConfig = (c) => REQUIRED_CONFIG.filter((k) => !isConfigAnswered(c, k));
var caseFields = (c, sectionId, cfg) => fieldsOf(sectionId, c.templateVersion, cfg).filter((f) => isVisible(f, c));
function prefillAnswers(c, cfg) {
  const out = {};
  for (const sc of c.scope) {
    if (sc.applicability === "na") continue;
    for (const f of caseFields(c, sc.sectionId, cfg)) {
      if (!f.prefill || f.derivedFrom || isSetByBdf(c, f.id)) continue;
      if (hasValue(c.answers[f.id]) || c.justifications[f.id] || c.answeredBy[f.id]) continue;
      const v = f.prefill(c);
      if (v !== void 0 && hasValue(v)) out[f.id] = v;
    }
  }
  return out;
}
function requiredFields(c, sectionId, cfg) {
  const sc = scopeOf(c, sectionId);
  if (!sc || sc.applicability !== "mandatory") return [];
  return caseFields(c, sectionId, cfg).filter((f) => f.required !== "optional" && !f.derivedFrom);
}
function compositionBlockers(c) {
  const out = [];
  c.components.forEach((r, i) => {
    for (const p of componentRowProblems(r)) out.push({ sectionId: "K2.1", rowId: r.id, label: `Component ${i + 1}: ${p.text}` });
  });
  const selected = c.config.SF01 ?? [];
  if (!selected.length || !c.components.length) return out;
  const name = (o) => ORIGIN_LABEL[o] ?? o;
  c.components.forEach((r, i) => {
    if (!selected.includes(r.origin))
      out.push({
        sectionId: "K2.1",
        rowId: r.id,
        label: `Component ${i + 1}: origin \u201C${name(r.origin)}\u201D is not one of the SF-01 origins`,
        supplierLabel: `Component ${i + 1}: its origin \u201C${name(r.origin)}\u201D is not one of the origins you selected in the metadata questions`
      });
  });
  for (const o of selected)
    if (!c.components.some((r) => r.origin === o))
      out.push({ sectionId: "K2.1", label: `SF-01 origin \u201C${name(o)}\u201D is not used by any component`, supplierLabel: `You selected the origin \u201C${name(o)}\u201D, but no component has it. Add the component or remove the origin.` });
  return out;
}
var slotBlocker = (slot) => ({
  sectionId: slot.sectionId,
  fieldId: slot.key,
  label: `${slot.doc} (${requestedByText(slot)})`,
  supplierLabel: `${slot.doc} (requested document)`
});
function completenessBlockers(c, cfg) {
  const out = [];
  if (c.liveScope) for (const k of unansweredConfig(c)) out.push({ sectionId: "GEN", fieldId: k, label: `${CONFIG_BY_ID[k].code} \xB7 ${CONFIG_BY_ID[k].label}` });
  const missingSlots = requestedDocuments(c, cfg).filter((x) => requestedDocStatus(c, x) === "missing");
  const placed = /* @__PURE__ */ new Set();
  const slotsOf = (sectionId) => {
    placed.add(sectionId);
    return missingSlots.filter((x) => x.sectionId === sectionId).map(slotBlocker);
  };
  for (const sc of c.scope) {
    if (sc.applicability === "na") {
      if (sc.sectionId === "K5.1" && !c.justifications["FLD-5.1-002"] && !c.answers["FLD-5.1-002"]) {
        out.push({ sectionId: "K5.1", fieldId: "FLD-5.1-002", label: "Justification for waiving the microbiological test" });
      }
      continue;
    }
    if (sc.applicability !== "mandatory") {
      out.push(...slotsOf(sc.sectionId));
      continue;
    }
    for (const f of requiredFields(c, sc.sectionId, cfg)) {
      const v = c.answers[f.id];
      if (!fieldAnswered(c, f)) out.push({ sectionId: sc.sectionId, fieldId: f.id, label: f.label });
      else if (hasValue(v) && f.validate && f.validate(v)) out.push({ sectionId: sc.sectionId, fieldId: f.id, label: `${f.label}: ${f.validate(v)}` });
    }
    if (sc.sectionId === "K2.1") {
      if (c.components.length === 0) out.push({ sectionId: "K2.1", label: "At least one component in the composition table" });
      else out.push(...compositionBlockers(c));
    }
    out.push(...slotsOf(sc.sectionId));
  }
  for (const x of missingSlots) if (!placed.has(x.sectionId)) out.push(slotBlocker(x));
  return out;
}
var unresolved = (p) => p.status !== "closed";
var closedByCancellation = (p) => p.outcome === "withdrawn" && !!p.closeReason?.startsWith("Case cancelled");
function reviewBlockers(c, dept) {
  const out = [];
  for (const p of c.openPoints.filter((x) => x.dept === dept && unresolved(x))) {
    out.push(`${p.id} \xB7 ${p.kind.replace("-", " ")} on ${p.ref.label} (${p.status === "open" ? "waiting for the supplier" : "answered, waiting for a decision"})`);
  }
  if ((dept === "SAF" || dept === "REG") && c.rmes) {
    for (const cr of c.rmes.criteria.filter((x) => x.dept === dept && !x.result)) out.push(`RMES criterion without result: ${cr.title}`);
    for (const fd of c.rmes.findings.filter((x) => x.dept === dept && x.status === "open")) out.push(`Open finding: ${fd.text}`);
    const tr = c.reviews.find((r) => r.dept === dept);
    if (tr && !tr.decision) out.push(`Final ${DEPT_SHORT[dept]} decision (Approved / Rejected) not yet recorded`);
  }
  return out;
}
function departmentsForScope(scope, ownership) {
  const set = /* @__PURE__ */ new Set();
  for (const sc of scope) {
    if (sc.applicability === "na") continue;
    const lead = ownership[sc.sectionId]?.lead ?? sectionOf(sc.sectionId)?.lead;
    if (REVIEW_DEPTS.includes(lead)) set.add(lead);
  }
  return REVIEW_DEPTS.filter((d) => set.has(d));
}
function reviewDeptOf(ownership, sectionId) {
  const lead = ownership[sectionId]?.lead ?? sectionOf(sectionId)?.lead;
  return REVIEW_DEPTS.includes(lead) ? lead : "RMM";
}
function rmmFlags(c) {
  const o = undefinedOrigins(c.config);
  return o.length ? [`Origin without rules: ${o.map((x) => ORIGIN_LABEL[x]).join(", ")}. The supplier got the standard sections only; check whether more is needed and ask the supplier if so.`] : [];
}
function userById(state, id) {
  return state.users.find((u) => u.id === id);
}
var userName = (state, id) => id === "system" ? "System" : userById(state, id)?.name ?? id;
function supplierTasks(state, supplierId, contactId) {
  const tasks = [];
  for (const c of state.cases.filter((x) => x.supplierId === supplierId && (!contactId || !x.liveScope || x.supplierContactIds.includes(contactId)))) {
    if (c.phase === "metadata") tasks.push({ caseId: c.id, kind: "metadata", title: "Answer basic data and configuration questions", detail: c.materialName, due: c.dueDate });
    if (c.phase === "supplier-input") tasks.push({ caseId: c.id, kind: "questionnaire", title: c.liveScope ? "Fill in the CIQ and confirm completeness" : "Complete the questionnaire and upload evidence", detail: c.materialName, due: c.dueDate });
    if (c.phase === "final-release") tasks.push({ caseId: c.id, kind: "final-release", title: "Give the final release", detail: c.materialName, due: c.dueDate });
    if (c.phase === "review" || c.phase === "final-release")
      for (const p of c.openPoints.filter((x) => x.status === "open"))
        tasks.push({ caseId: c.id, kind: "query", title: p.kind === "document-request" ? "Provide a requested document" : p.kind === "additional-part" ? "Complete an additional section" : "Answer a question from Beiersdorf", detail: `${p.ref.label} \u2014 ${p.question}`, due: p.dueDate, openPointId: p.id });
  }
  return tasks.sort((a, b) => a.due.localeCompare(b.due));
}
function formatValue(v) {
  if (!hasValue(v)) return "\u2014";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (Array.isArray(v)) return v.join(", ");
  if (typeof v === "object" && v) return `${v.min ?? "?"}\u2013${v.max ?? "?"} %`;
  return String(v);
}
var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function fmtDate(iso2) {
  if (!iso2) return "\u2014";
  const d = new Date(iso2);
  if (Number.isNaN(d.getTime())) return "\u2014";
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}
function fmtDateTime(iso2) {
  if (!iso2) return "\u2014";
  const d = new Date(iso2);
  if (Number.isNaN(d.getTime())) return "\u2014";
  return `${fmtDate(iso2)}, ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
var MESSAGE_ACTION_LABEL = {
  raised: "Raised",
  answered: "Answered",
  returned: "Returned to supplier",
  accepted: "Accepted",
  "cannot-provide": "Cannot provide (justified)",
  note: "Closed as not accepted",
  edited: "Changed by the raiser",
  // The entry's own text says why: "no answer needed" (the raiser) or "the request was withdrawn" (case cancelled).
  withdrawn: "Closed"
};
var SUPPLIER_MESSAGE_TEXT = {
  raised: "asked",
  answered: "answered",
  returned: "asked for more information",
  accepted: "accepted the answer",
  "cannot-provide": "said this cannot be provided",
  note: "",
  edited: "changed the question",
  withdrawn: "closed the question: no answer needed"
};
var REACTIVATION_DAYS = 365;
var canReactivate = (c, at = nowIso()) => c.phase === "cancelled" && !!c.cancelled && Date.parse(at) - Date.parse(c.cancelled.at) <= REACTIVATION_DAYS * DAY;
var rejectedDepts = (c) => c.reviews.filter((r) => r.decision === "rejected").map((r) => r.dept);
function rejectionNeedsRmmChoice(c) {
  const covered = c.reviews.find((r) => r.dept === "RMM")?.continueAfterRejection?.depts ?? [];
  return rejectedDepts(c).filter((d) => !covered.includes(d));
}
function releaseBlockers(c, cfg) {
  const out = [];
  if (c.phase !== "final-release") out.push({ label: "Beiersdorf has not finished its review yet." });
  for (const p of c.openPoints.filter(unresolved)) out.push({ label: `Open question on ${p.ref.label}`, sectionId: p.ref.sectionId, fieldId: p.ref.fieldId, opId: p.id });
  for (const b of completenessBlockers(c, cfg)) out.push({ label: `Missing: ${b.label}`, ...b.supplierLabel ? { supplierLabel: `Missing: ${b.supplierLabel}` } : {}, sectionId: b.sectionId, fieldId: b.fieldId, ...b.rowId ? { rowId: b.rowId } : {} });
  return out;
}
function duplicateOpenCases(state, supplierId, materialNo) {
  const norm = (x) => x.replace(/[\s-]/g, "").toUpperCase();
  const m = norm(materialNo);
  if (!m || !supplierId) return [];
  return state.cases.filter((c) => !isClosed(c) && c.supplierId === supplierId && norm(c.materialNo) === m);
}
function sectionOwners(s2, sectionId) {
  const own = s2.ownership[sectionId];
  if (own) return own;
  const def = sectionOf(sectionId, void 0, s2.config);
  return { lead: def?.lead, co: def?.co ?? [] };
}
function ownsSection(s2, dept, sectionId) {
  const o = sectionOwners(s2, sectionId);
  return o.lead === dept || o.co.includes(dept);
}
function sectionsChangedSince(c, since, cfg, { metadata = true } = {}) {
  if (!since) return [];
  const t = Date.parse(since);
  const out = /* @__PURE__ */ new Set();
  for (const [key, v] of Object.entries(c.answeredBy)) {
    if (Date.parse(v.at) <= t) continue;
    if (key === "K2.1:components") out.add("K2.1");
    else if (/^SF\d\d$/.test(key) || BDF_SET_FIELDS.includes(key)) {
      if (metadata) out.add("GEN");
    } else if (isSlotKey(key)) out.add(slotSection(c, key, cfg) ?? "GEN");
    else out.add(fieldOf(key, c.templateVersion, cfg)?.sectionId ?? (sectionOf(key, c.templateVersion, cfg) ? key : "GEN"));
  }
  for (const d of c.documents) if (Date.parse(d.uploadedAt) > t) out.add(docSectionId(c, d, cfg));
  return [...out];
}

// prototype/src/domain/permissions.ts
var userOf = (s2, id) => s2.users.find((u) => u.id === id);
var isActiveUser = (u) => !!u && u.active !== false;
var userMayConfirm = (u) => !!u && u.mayConfirm !== false;
function roleOf(s2, userId) {
  const u = userOf(s2, userId);
  if (!u) return "unknown";
  if (u.side === "supplier") return "supplier";
  if (u.dept) return u.dept.toLowerCase();
  return INTERNAL_PERSONAS.find((p) => p.userId === userId)?.id ?? "unknown";
}
var isRmm = (u) => !!u && u.side === "internal" && u.dept === "RMM";
var isReviewDept = (d) => !!d && (d === "RMM" || REVIEW_DEPTS.includes(d));
var raiserOf = (op) => op.createdBy === "system" ? op.responsibleId : op.createdBy;
function isCaseContact(c, u) {
  if (!u || u.side !== "supplier" || u.supplierId !== c.supplierId) return false;
  return c.liveScope ? c.supplierContactIds.includes(u.id) : true;
}
var OPEN_FOR_SUPPLIER_DATA = /* @__PURE__ */ new Set(["supplier-input", "review", "metadata"]);
var RELEASE_LOCKED_TEXT = "Your questionnaire is locked because Beiersdorf has requested your final release. If something must change, contact Beiersdorf; they can reopen the review.";
function check(s2, userId, cap, c, target = {}) {
  if (userId === "system") return null;
  const u = userOf(s2, userId);
  if (!u) return "Unknown user.";
  const internal = u.side === "internal";
  const role = roleOf(s2, userId);
  const op = target.opId && c ? c.openPoints.find((p) => p.id === target.opId) : void 0;
  if (target.opId && !op && cap.startsWith("op.")) return "This open point no longer exists.";
  const contactGuard = () => {
    if (u.side !== "supplier") return "Only the supplier's contacts work on the questionnaire. Beiersdorf never changes answers.";
    if (!isActiveUser(u)) return "This contact is no longer active.";
    if (!c || !isCaseContact(c, u)) return "You are not a contact on this request.";
    return null;
  };
  const trackGuard = () => {
    if (!internal) return "Only Beiersdorf reviewers can do this.";
    const d = target.dept;
    if (!d) return "No review track given.";
    if (u.dept !== d) return d === "RMM" ? "Only RMM can act on RMM's review." : `Only ${DEPT_SHORT[d]} can act on the ${DEPT_SHORT[d]} review.`;
    if (c && !c.reviews.some((r) => r.dept === d)) return `${DEPT_SHORT[d]} has no review task on ${c.id}.`;
    return null;
  };
  switch (cap) {
    case "case.view":
      if (internal) return null;
      return c && isActiveUser(u) && isCaseContact(c, u) ? null : "This request is not available.";
    case "finalDocument.view":
      return internal ? null : "The final document is internal to Beiersdorf.";
    case "case.create":
    case "case.cancel":
    case "case.reactivate":
    case "case.editContacts":
      return isRmm(u) ? null : "Only RMM can do this.";
    case "supplier.view":
      return isRmm(u) || role === "admin" ? null : "The supplier master is for Raw Material Management and the business administrator.";
    case "supplier.manage":
      return role === "admin" ? null : "Only the business administrator maintains the supplier master.";
    case "config.manage":
    case "reminders.run":
      return role === "admin" ? null : "Only the business administrator changes the configuration.";
    case "ciq.edit": {
      const g = contactGuard();
      if (g) return g;
      if (c?.phase === "final-release") return RELEASE_LOCKED_TEXT;
      return c && OPEN_FOR_SUPPLIER_DATA.has(c.phase) ? null : "The questionnaire can no longer be changed.";
    }
    case "ciq.confirm":
    case "ciq.release": {
      const g = contactGuard();
      if (g) return g;
      return userMayConfirm(u) ? null : "This contact may not confirm. Ask a colleague who may confirm.";
    }
    case "ciq.reportChange":
      return contactGuard();
    case "op.respond": {
      const g = contactGuard();
      if (g) return g;
      if (!op) return "No open point given.";
      if (op.status === "closed") return op.closedAt ? `Beiersdorf closed this question on ${fmtDate(op.closedAt)}.` : "Beiersdorf closed this question.";
      return op.status === "open" ? null : "Your answer is with Beiersdorf; wait for their response.";
    }
    case "op.raise":
      return trackGuard();
    case "op.decide":
    case "op.edit":
    case "op.close": {
      if (!internal) return "Only Beiersdorf can do this.";
      if (!op) return "No open point given.";
      const raiser = raiserOf(op);
      if (userId !== raiser) return `Only ${userOf(s2, raiser)?.name ?? "the person who raised it"} can change this open point.`;
      return null;
    }
    case "review.complete":
    case "review.reopen":
    case "review.reassign":
    case "rmes.record":
    case "rmes.decide":
      return trackGuard();
    case "scope.extend":
      return internal && isReviewDept(u.dept) && u.dept !== "RMM" ? null : "Only a reviewing department can add a section. RMM asks the supplier or the department concerned instead.";
    case "note.add":
      if (!internal) return "Internal notes are for Beiersdorf only.";
      if (role === "admin" || role === "owner" || role === "auditor") return "This role reads the internal notes only.";
      if (c && isClosed(c)) return "The case is closed: no new notes.";
      return null;
  }
}

// prototype/src/domain/configActions.ts
var shortTemplate = (templateVersion) => templateVersion.replace(/^CIQ-\d{4}\s+/, "");
var pairLabel = (ruleSetVersion, templateVersion) => `${ruleSetVersion} + ${shortTemplate(templateVersion)}`;
var FIRST_PAIR = { ruleSetVersion: FIRST_RULE_SET, templateVersion: FIRST_TEMPLATE, publishedAt: RS1.publishedAt, publishedBy: RS1.publishedBy, changeNote: "First digital CIQ 2026 template: 8 chapters and 12 annexes (Turkey REACH K6.3 / Annex 12 not yet included), with rule set RS-2026.1 from requirements document v2.0 \xA75.3\u20135.4." };
function currentPair(s2) {
  const p = currentStoredPair(s2.config);
  return p ? { ruleSetVersion: p.ruleSet.version, templateVersion: p.template.version } : { ruleSetVersion: FIRST_PAIR.ruleSetVersion, templateVersion: FIRST_PAIR.templateVersion };
}
var draftPair = (s2) => draftStoredPair(s2.config);
var RELEASE_KIND_LABEL = {
  first: "First version",
  rules: "Rules only",
  questionnaire: "Questionnaire only",
  both: "Rules and questionnaire",
  none: "No changes yet"
};
var plural = (n, one) => `${n} ${one}${n === 1 ? "" : "s"}`;
function publishPlan(s2) {
  const d = draftPair(s2);
  const ch = draftChanges(s2);
  if (!d || !ch) return void 0;
  const ruleChanges = ch.rules.added.length + ch.rules.changed.length + ch.rules.removed.length;
  const questionnaireChanges = ch.count - ruleChanges;
  const rulesChanged = ruleChanges > 0;
  const questionnaireChanged = questionnaireChanges > 0;
  const kind = rulesChanged && questionnaireChanged ? "both" : rulesChanged ? "rules" : questionnaireChanged ? "questionnaire" : "none";
  const base3 = { ruleSetVersion: d.basedOn.ruleSetVersion, templateVersion: d.basedOn.templateVersion };
  const result = { ruleSetVersion: rulesChanged ? d.ruleSet.version : base3.ruleSetVersion, templateVersion: questionnaireChanged ? d.template.version : base3.templateVersion };
  const rules = `Rules ${result.ruleSetVersion} (${plural(ruleChanges, "change")})`;
  const tpl = `questionnaire ${shortTemplate(result.templateVersion)} (${plural(questionnaireChanges, "change")})`;
  const text = kind === "both" ? `${rules} \xB7 ${tpl}` : kind === "rules" ? `${rules} \xB7 questionnaire stays ${shortTemplate(base3.templateVersion)}` : kind === "questionnaire" ? `Questionnaire ${shortTemplate(result.templateVersion)} (${plural(questionnaireChanges, "change")}) \xB7 rules stay ${base3.ruleSetVersion}` : `Nothing to publish yet: the draft is the same as ${pairLabel(base3.ruleSetVersion, base3.templateVersion)}`;
  return { kind, base: base3, result, rulesChanged, questionnaireChanged, ruleChanges, questionnaireChanges, label: pairLabel(result.ruleSetVersion, result.templateVersion), text, kindLabel: RELEASE_KIND_LABEL[kind] };
}
function templateList(cfg) {
  const first = { version: FIRST_TEMPLATE, status: "published", publishedAt: FIRST_PAIR.publishedAt, changeNote: "First digital CIQ 2026 template: 8 chapters and 12 annexes (Turkey REACH K6.3 / Annex 12 not yet included).", sections: [], casesUsing: 0 };
  return [
    first,
    ...cfg.pairs.filter((p) => ownsTemplate(cfg, p)).map((p) => ({
      version: p.template.version,
      status: p.status === "draft" ? "draft" : "published",
      ...p.publishedAt ? { publishedAt: p.publishedAt, publishedBy: p.publishedBy } : {},
      changeNote: p.changeNote,
      sections: [],
      casesUsing: 0
    }))
  ];
}
var versionNo = (version) => Number(/(\d+)$/.exec(version)?.[1] ?? 0);
function nextVersionNumbers(cfg) {
  const rs = Math.max(versionNo(FIRST_RULE_SET), ...cfg.pairs.map((p) => versionNo(p.ruleSet.version)));
  const tpl = Math.max(versionNo(FIRST_TEMPLATE), ...cfg.pairs.map((p) => versionNo(p.template.version)));
  return { ruleSetVersion: `RS-2026.${rs + 1}`, templateVersion: `CIQ-2026 v${tpl + 1}` };
}
function ruleDataOf(cfg, ruleSetVersion) {
  return ruleSetPairOf(cfg, ruleSetVersion)?.ruleSet.rules ?? (ruleSetVersion === RS2.version ? RS2.rules : RS1.rules);
}
var templateOf = (cfg, templateVersion) => templateData(templateVersion, cfg) ?? builtinTemplateData(templateVersion);
var copyTemplate = (t, version, ownership) => ({
  version,
  sections: JSON.parse(JSON.stringify(t.sections)).map((x) => ownership[x.id] ? { ...x, lead: ownership[x.id].lead, co: [...ownership[x.id].co] } : x)
});
function preparedDraft(ownership) {
  const template = builtinTemplateData(RS2.templateVersion, ownership);
  template.sections = template.sections.map(
    (x) => x.id === "K6.3" ? {
      ...x,
      documentsOnly: false,
      fields: [
        { id: "FLD-6.3-001", label: "KKDIK registration number", type: "text", required: "mandatory", owner: "REG", help: "As shown on the KKDIK registration confirmation." },
        { id: "FLD-6.3-002", label: "KKDIK registration confirmation", type: "file", required: "mandatory", owner: "REG", help: "PDF of the confirmation issued for the Turkish market." }
      ]
    } : x
  );
  return {
    ruleSet: { version: RS2.version, rules: RS2.rules.map(copyRule) },
    template,
    status: "draft",
    basedOn: { ruleSetVersion: FIRST_PAIR.ruleSetVersion, templateVersion: FIRST_PAIR.templateVersion },
    note: "Turkey REACH (KKDIK) for the Turkey market.",
    createdAt: "2026-10-01T09:00:00.000Z",
    createdBy: "u-admin",
    changeNote: "Adds Turkey REACH (KKDIK): chapter K6.3 and Annex 12, with a mandatory registration-number field and upload, and rule R-111 for the Turkey market."
  };
}
var initialConfig = (ownership) => ({ pairs: [preparedDraft(ownership)] });
var ruleKey = (r) => {
  const c = r.condition;
  return JSON.stringify([c.kind, "question" in c ? c.question : "", "values" in c ? [...c.values].sort() : "value" in c ? c.value : "", [...r.activates].sort(), r.outcome, r.evidence ?? [], [...r.departments].sort(), r.basis, r.note ?? "", !!r.flagsCase]);
};
var sectionKey = (x) => JSON.stringify({ code: x.code, title: x.title, kind: x.kind, meaning: x.meaning, documentsOnly: x.documentsOnly });
var ownersKey = (lead, co) => `${lead}|${[...co].sort().join(",")}`;
var changesMemo = /* @__PURE__ */ new WeakMap();
function draftChanges(s2) {
  const hit = changesMemo.get(s2.config);
  if (hit && hit.ownership === s2.ownership) return hit.result;
  const result = computeChanges(s2);
  changesMemo.set(s2.config, { ownership: s2.ownership, result });
  return result;
}
function computeChanges(s2) {
  const d = draftPair(s2);
  if (!d) return void 0;
  const baseRules = ruleDataOf(s2.config, d.basedOn.ruleSetVersion);
  const baseTpl = templateOf(s2.config, d.basedOn.templateVersion);
  const br = new Map(baseRules.map((r) => [r.id, r]));
  const dr = new Map(d.ruleSet.rules.map((r) => [r.id, r]));
  const rules = {
    added: d.ruleSet.rules.filter((r) => !br.has(r.id)).map((r) => r.id),
    changed: d.ruleSet.rules.filter((r) => br.has(r.id) && ruleKey(br.get(r.id)) !== ruleKey(r)).map((r) => r.id),
    removed: baseRules.filter((r) => !dr.has(r.id)).map((r) => r.id)
  };
  const bs = new Map(baseTpl.sections.map((x) => [x.id, x]));
  const sections = { added: [], changed: [], retired: [], restored: [] };
  const fields = { added: [], changed: [], removed: [] };
  for (const x of d.template.sections) {
    const b = bs.get(x.id);
    if (!b) {
      sections.added.push(x.id);
      continue;
    }
    if (x.retired && !b.retired) sections.retired.push(x.id);
    else if (!x.retired && b.retired) sections.restored.push(x.id);
    const owners = s2.ownership[x.id] ?? { lead: b.lead, co: b.co };
    const bf = new Map(b.fields.map((f) => [f.id, f]));
    const xf = new Map(x.fields.map((f) => [f.id, f]));
    const common = (list, other) => list.filter((f) => other.has(f.id)).map((f) => f.id).join();
    const reordered = common(x.fields, bf) !== common(b.fields, xf);
    if (sectionKey(x) !== sectionKey(b) || ownersKey(x.lead, x.co) !== ownersKey(owners.lead, owners.co) || reordered) sections.changed.push(x.id);
    for (const f of x.fields) {
      const o = bf.get(f.id);
      if (!o) fields.added.push({ sectionId: x.id, fieldId: f.id, label: f.label });
      else if (JSON.stringify(o) !== JSON.stringify(f)) fields.changed.push({ sectionId: x.id, fieldId: f.id, label: f.label });
    }
    for (const f of b.fields) if (!xf.has(f.id)) fields.removed.push({ sectionId: x.id, fieldId: f.id, label: f.label });
  }
  const count = rules.added.length + rules.changed.length + rules.removed.length + sections.added.length + sections.changed.length + sections.retired.length + sections.restored.length + fields.added.length + fields.changed.length + fields.removed.length;
  return { base: d.basedOn, rules, sections, fields, count };
}
function changesText(ch) {
  if (!ch || !ch.count) return "No changes";
  const part = (n, one, verb) => n ? `${n} ${one}${n === 1 ? "" : "s"} ${verb}` : "";
  return [
    part(ch.rules.added.length, "rule", "added"),
    part(ch.rules.changed.length, "rule", "changed"),
    part(ch.rules.removed.length, "rule", "removed"),
    part(ch.sections.added.length, "section", "added"),
    part(ch.sections.changed.length + ch.sections.restored.length, "section", "changed"),
    part(ch.sections.retired.length, "section", "retired"),
    part(ch.fields.added.length, "question", "added"),
    part(ch.fields.changed.length, "question", "changed"),
    part(ch.fields.removed.length, "question", "removed")
  ].filter(Boolean).join("; ");
}
var VALIDATION_LABEL = {
  "has-changes": "The draft changes the rules or the questionnaire",
  "rules-switch-on": "Every rule switches on at least one section or asks for evidence",
  "sections-have-rule": "Every section is switched on by a rule",
  "no-empty-labels": "Every section has a code and a title, every question and option a label",
  "choice-options": "Every choice question has at least 2 options",
  "number-units": "Every number question has a unit or says \u201Cno unit\u201D",
  "codes-unique": "Section codes are unique",
  "sections-have-questions": "Every section that is not \u201CDocuments only\u201D has at least one question"
};
var secName = (x) => [x.code.trim(), x.title.trim()].filter(Boolean).join(" ") || "A section without code";
var validationMemo = /* @__PURE__ */ new WeakMap();
function validateDraft(s2) {
  const hit = validationMemo.get(s2.config);
  if (hit && hit.ownership === s2.ownership) return hit.result;
  const result = computeValidation(s2);
  validationMemo.set(s2.config, { ownership: s2.ownership, result });
  return result;
}
function computeValidation(s2) {
  const d = draftPair(s2);
  if (!d) return void 0;
  const baseIds = new Set(templateOf(s2.config, d.basedOn.templateVersion).sections.map((x) => x.id));
  const live = d.template.sections.filter((x) => !x.retired);
  const liveIds = new Set(live.map((x) => x.id));
  const byId = new Map(d.template.sections.map((x) => [x.id, x]));
  const issues = { "has-changes": [], "rules-switch-on": [], "sections-have-rule": [], "no-empty-labels": [], "choice-options": [], "number-units": [], "codes-unique": [], "sections-have-questions": [] };
  const warnings = [];
  const infos = [];
  const codeOf2 = (id) => byId.get(id)?.code ?? id;
  if (publishPlan(s2)?.kind === "none") issues["has-changes"].push({ text: `Nothing to publish: the draft is the same as ${pairLabel(d.basedOn.ruleSetVersion, d.basedOn.templateVersion)}. Change a rule or the questionnaire, or discard the draft.` });
  const alwaysOn = alwaysOnSections(d.ruleSet.rules);
  for (const r of d.ruleSet.rules) {
    const valid = r.activates.filter((id) => liveIds.has(id));
    const evidence = (r.evidence ?? []).filter((e) => e.trim());
    if (!valid.length && !evidence.length && !r.flagsCase) {
      issues["rules-switch-on"].push({ ruleId: r.id, text: r.activates.length ? `${r.id} only points at sections this version does not offer (${r.activates.map(codeOf2).join(", ")}).` : `${r.id} switches on no section and asks for no evidence.` });
    }
    for (const id of r.activates.filter((x) => !liveIds.has(x))) {
      const sec = byId.get(id);
      warnings.push({ ruleId: r.id, sectionId: id, text: sec ? `${r.id} still points at ${secName(sec)}, which is retired in this version: it no longer opens for new cases.` : `${r.id} points at ${id}, which is not in this version.` });
    }
    for (const u of uncollectedEvidence(evidence, r.activates, d.template, { outcome: r.outcome, alwaysOn })) infos.push({ ruleId: r.id, sectionId: u.sectionId, text: `${r.id}: ${uncollectedText(u)}` });
  }
  for (const x of live) {
    const isNew = !baseIds.has(x.id);
    if (!d.ruleSet.rules.some((r) => r.outcome !== "na" && r.activates.includes(x.id))) {
      issues["sections-have-rule"].push({ sectionId: x.id, text: `${secName(x)} is not switched on by any rule${isNew ? ": a new section needs a rule that switches it on" : ": no new case would get it. Add a rule, or retire the section"}.` });
    }
    if (!x.code.trim()) issues["no-empty-labels"].push({ sectionId: x.id, text: `Section ${x.id} has no code.` });
    if (!x.title.trim()) issues["no-empty-labels"].push({ sectionId: x.id, text: `${x.code.trim() || x.id} has no title.` });
    if (!x.documentsOnly && !x.fields.length) issues["sections-have-questions"].push({ sectionId: x.id, text: `${secName(x)} has no question. Add one, or set it to \u201CDocuments only\u201D.` });
    if (x.documentsOnly) continue;
    x.fields.forEach((f, i) => {
      const where = { sectionId: x.id, fieldId: f.id };
      const name = f.label.trim() ? `\u201C${f.label.trim()}\u201D` : `Question ${i + 1}`;
      if (!f.label.trim()) issues["no-empty-labels"].push({ ...where, text: `Question ${i + 1} of ${secName(x)} has no label.` });
      if (isChoiceType(f.type)) {
        const opts = f.options ?? [];
        if (opts.length < 2) issues["choice-options"].push({ ...where, text: `${name} in ${secName(x)} has ${opts.length === 0 ? "no option" : "only 1 option"}.` });
        if (opts.some((o) => !o.label.trim())) issues["no-empty-labels"].push({ ...where, text: `${name} in ${secName(x)} has an option without a label.` });
      }
      if (isNumberType(f.type) && f.unit === void 0) issues["number-units"].push({ ...where, text: `${name} in ${secName(x)} needs a unit, or \u201Cno unit\u201D.` });
    });
  }
  const seen = /* @__PURE__ */ new Map();
  for (const x of d.template.sections) {
    const k = sectionCodeKey(x.code);
    if (!k) continue;
    if (seen.has(k)) issues["codes-unique"].push({ sectionId: x.id, text: `${x.code.trim()} is used by ${seen.get(k)} and ${x.id}.` });
    else seen.set(k, x.id);
  }
  const checks = Object.keys(VALIDATION_LABEL).map((id) => ({ id, label: VALIDATION_LABEL[id], ok: issues[id].length === 0, issues: issues[id] }));
  return { ok: checks.every((c) => c.ok), checks, warnings, infos };
}
function rulesPointingAt(s2, sectionId) {
  return (draftPair(s2)?.ruleSet.rules ?? []).filter((r) => r.activates.includes(sectionId)).map((r) => r.id);
}
var guard = (s2, by) => check(s2, by, "config.manage");
function withDraft(s2, fn) {
  const config = { pairs: s2.config.pairs.map((p) => p.status === "draft" ? fn(p) : p) };
  return { ...s2, config, templates: templateList(config) };
}
var noDraft = (s2) => refuse(s2, "There is no draft. Create a new version first.");
var draftTag = (d) => `Draft from ${pairLabel(d.basedOn.ruleSetVersion, d.basedOn.templateVersion)}`;
var draftName = (s2) => {
  const plan = publishPlan(s2);
  return plan && plan.kind !== "none" ? plan.label : "(no changes yet)";
};
function createDraft(s2, by, note, at = nowIso()) {
  const denied = guard(s2, by);
  if (denied) return refuse(s2, denied);
  if (draftPair(s2)) return refuse(s2, `The draft ${draftName(s2)} is still open. Publish or discard it first.`);
  const base3 = currentPair(s2);
  const next = nextVersionNumbers(s2.config);
  const pair = {
    ruleSet: { version: next.ruleSetVersion, rules: ruleDataOf(s2.config, base3.ruleSetVersion).map(copyRule) },
    template: copyTemplate(templateOf(s2.config, base3.templateVersion), next.templateVersion, s2.ownership),
    status: "draft",
    basedOn: base3,
    note: note.trim(),
    createdAt: at,
    createdBy: by,
    changeNote: ""
  };
  const config = { pairs: [...s2.config.pairs, pair] };
  const baseLabel = pairLabel(base3.ruleSetVersion, base3.templateVersion);
  let out = { ...s2, config, templates: templateList(config) };
  out = logEvent(out, {
    at,
    by,
    kind: "config",
    action: "Created draft",
    detail: `Draft copied from ${baseLabel}. When it is published, only what changed gets a new number: rules ${next.ruleSetVersion}, questionnaire ${shortTemplate(next.templateVersion)}.${note.trim() ? ` Note: ${note.trim()}` : ""}`
  });
  return toast(out, "success", `New draft created from ${baseLabel}. Change the rules or the questionnaire, then check and publish.`);
}
function discardDraft(s2, by, at = nowIso()) {
  const denied = guard(s2, by);
  if (denied) return refuse(s2, denied);
  const d = draftPair(s2);
  if (!d) return noDraft(s2);
  const config = { pairs: s2.config.pairs.filter((p) => p !== d) };
  let out = { ...s2, config, templates: templateList(config) };
  out = logEvent(out, { at, by, kind: "config", action: "Discarded draft", detail: `${draftTag(d)} discarded (${changesText(draftChanges(s2))}).` });
  return toast(out, "info", `Draft ${draftName(s2)} discarded.`);
}
function nextRuleId(s2) {
  const ids = [...RS2.rules, ...s2.config.pairs.flatMap((p) => p.ruleSet.rules)].map((r) => Number(/^R-(\d+)$/.exec(r.id)?.[1] ?? -1));
  return `R-${String(Math.max(-1, ...ids) + 1).padStart(2, "0")}`;
}
var cleanList = (xs) => [...new Set((xs ?? []).map((x) => x.trim()).filter(Boolean))];
function upsertRule(s2, by, input, at = nowIso()) {
  const denied = guard(s2, by);
  if (denied) return { state: refuse(s2, denied), id: "" };
  const d = draftPair(s2);
  if (!d) return { state: noDraft(s2), id: "" };
  const problem = conditionProblem(input.condition);
  if (problem) return { state: refuse(s2, problem), id: "" };
  const known = new Set(d.template.sections.map((x) => x.id));
  const unknown = input.activates.filter((id2) => !known.has(id2));
  if (unknown.length) return { state: refuse(s2, `${unknown.join(", ")} ${unknown.length === 1 ? "is" : "are"} not in questionnaire ${shortTemplate(d.template.version)}.`), id: "" };
  const departments = [...new Set(input.departments)];
  if (!departments.length) return { state: refuse(s2, "Choose at least one department that reviews it."), id: "" };
  const existing = input.id ? d.ruleSet.rules.find((r) => r.id === input.id) : void 0;
  if (input.id && !existing) return { state: refuse(s2, `${input.id} is not in the draft.`), id: "" };
  const id = existing?.id ?? nextRuleId(s2);
  const evidence = cleanList(input.evidence);
  const rule = {
    id,
    question: conditionQuestion(input.condition),
    condition: JSON.parse(JSON.stringify(input.condition)),
    activates: [...new Set(input.activates)],
    outcome: input.outcome,
    ...evidence.length ? { evidence } : {},
    departments,
    basis: input.basis,
    ...input.note?.trim() ? { note: input.note.trim() } : {},
    ...input.flagsCase ? { flagsCase: true } : {}
  };
  if (existing && ruleKey(existing) === ruleKey(rule)) return { state: s2, id };
  let out = withDraft(s2, (p) => ({ ...p, ruleSet: { ...p.ruleSet, rules: existing ? p.ruleSet.rules.map((r) => r.id === id ? rule : r) : [...p.ruleSet.rules, rule] } }));
  const codeOf2 = (x) => d.template.sections.find((y) => y.id === x)?.code ?? x;
  out = logEvent(out, { at, by, kind: "config", action: existing ? `Changed rule ${id}` : `Added rule ${id}`, detail: `${draftTag(d)}: ${ruleSentence(rule, codeOf2)}` });
  return { state: out, id };
}
function deleteRule(s2, by, ruleId, at = nowIso()) {
  const denied = guard(s2, by);
  if (denied) return refuse(s2, denied);
  const d = draftPair(s2);
  if (!d) return noDraft(s2);
  if (!d.ruleSet.rules.some((r) => r.id === ruleId)) return refuse(s2, `${ruleId} is not in the draft.`);
  const out = withDraft(s2, (p) => ({ ...p, ruleSet: { ...p.ruleSet, rules: p.ruleSet.rules.filter((r) => r.id !== ruleId) } }));
  return toast(logEvent(out, { at, by, kind: "config", action: `Deleted rule ${ruleId}`, detail: `${draftTag(d)}: ${ruleId} removed from the draft. The published rule sets keep it.` }), "info", `${ruleId} removed from the draft.`);
}
function normalizeSectionCode(code) {
  const c = code.trim().replace(/\s+/g, " ").replace(/\.+$/, "");
  const annex = /^(?:annex|a)\s*(\d.*)$/i.exec(c) ?? /^annex\s*(\S.*)$/i.exec(c);
  if (annex) return `Annex ${annex[1].replace(/\s+/g, "")}`;
  if (/^k\s*\d/i.test(c)) return `K${c.slice(1).replace(/\s+/g, "")}`;
  return c;
}
function sectionCodeKey(code) {
  return code.toLowerCase().replace(/\s+/g, "").replace(/^annex/, "a").replace(/\d+/g, (n) => n.replace(/^0+(?=\d)/, "")).replace(/\.+$/, "");
}
function sectionIdFromCode(code) {
  const c = code.trim();
  const annex = /^annex\s*(\d+[A-Za-z0-9.]*)$/i.exec(c);
  const id = annex ? `A${annex[1]}` : c.replace(/\s+/g, "");
  return /^[A-Za-z][A-Za-z0-9.\-]*$/.test(id) ? id : null;
}
var codeUsesMemo = /* @__PURE__ */ new WeakMap();
function sectionCodeUses(cfg) {
  const hit = codeUsesMemo.get(cfg);
  if (hit) return hit;
  const uses = /* @__PURE__ */ new Map();
  const add = (x, where) => {
    for (const label of [x.code, x.id]) {
      const k = sectionCodeKey(label);
      if (!k) continue;
      const list = uses.get(k) ?? [];
      if (!list.some((u) => u.sectionId === x.id)) list.push({ sectionId: x.id, code: label.trim(), title: x.title, where });
      uses.set(k, list);
    }
  };
  for (const x of draftStoredPair(cfg)?.template.sections ?? []) add(x, x.retired ? "retired in this draft" : "in this draft");
  const published = cfg.pairs.filter((p) => p.status === "published" && ownsTemplate(cfg, p)).map((p) => p.template).reverse();
  for (const t of [...published, builtinTemplateData(FIRST_TEMPLATE)]) for (const x of t.sections) add(x, `${x.retired ? "retired in" : "in"} published version ${shortTemplate(t.version)}`);
  for (const x of BUILTIN_SECTIONS) add(x, "in the built-in catalogue");
  codeUsesMemo.set(cfg, uses);
  return uses;
}
function sectionCodeClash(cfg, code, sectionId) {
  const k = sectionCodeKey(code);
  return k ? sectionCodeUses(cfg).get(k)?.find((u) => u.sectionId !== sectionId) : void 0;
}
var codeClashText = (u) => `${u.code} is already used by \u201C${u.title || u.sectionId}\u201D (${u.where}). Choose another code.`;
function sectionCodeDuplicate(cfg, code, sectionId) {
  const c = normalizeSectionCode(code);
  if (!c) return void 0;
  const use = sectionCodeClash(cfg, c, sectionId);
  if (use) return codeClashText(use);
  if (sectionId) return void 0;
  const id = sectionIdFromCode(c);
  const idUse = id ? sectionCodeClash(cfg, id) : void 0;
  return idUse ? codeClashText(idUse) : void 0;
}
function sectionCodeProblem(cfg, code, sectionId) {
  const c = normalizeSectionCode(code);
  if (!c) return "Enter the section code, e.g. K6.18 or Annex 14.";
  const dup = sectionCodeDuplicate(cfg, c, sectionId);
  if (dup) return dup;
  if (!sectionId && !sectionIdFromCode(c)) return "Use a code like K6.18 or Annex 14 (letters, digits and dots).";
  return void 0;
}
function codeCompare(a, b) {
  const pa = a.match(/\d+|\D+/g) ?? [];
  const pb = b.match(/\d+|\D+/g) ?? [];
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? "";
    const y = pb[i] ?? "";
    if (x === y) continue;
    const nx = Number(x);
    const ny = Number(y);
    if (!Number.isNaN(nx) && !Number.isNaN(ny) && x !== "" && y !== "") return nx - ny;
    return x < y ? -1 : 1;
  }
  return 0;
}
function insertAt(sections, x) {
  const same = sections.map((y, i) => ({ y, i })).filter(({ y }) => y.kind === x.kind);
  const before = same.filter(({ y }) => codeCompare(y.code, x.code) < 0);
  if (before.length) return before.at(-1).i + 1;
  if (same.length) return same[0].i;
  if (x.kind === "annex") return sections.length;
  const firstAnnex = sections.findIndex((y) => y.kind === "annex");
  return firstAnnex < 0 ? sections.length : firstAnnex;
}
function upsertSection(s2, by, input, at = nowIso()) {
  const denied = guard(s2, by);
  if (denied) return { state: refuse(s2, denied), id: "" };
  const d = draftPair(s2);
  if (!d) return { state: noDraft(s2), id: "" };
  const code = normalizeSectionCode(input.code);
  const existing = input.id ? d.template.sections.find((x) => x.id === input.id) : void 0;
  if (input.id && !existing) return { state: refuse(s2, `${input.id} is not in the draft questionnaire.`), id: "" };
  const problem = sectionCodeProblem(s2.config, code, existing?.id);
  if (problem) return { state: refuse(s2, problem), id: "" };
  const id = existing?.id ?? sectionIdFromCode(code);
  if (existing && input.documentsOnly && !existing.documentsOnly && existing.fields.length) return { state: refuse(s2, `${code} still has ${existing.fields.length === 1 ? "a question" : `${existing.fields.length} questions`}. Remove ${existing.fields.length === 1 ? "it" : "them"} first, or keep \u201CQuestions\u201D.`), id: "" };
  if (id === "GEN" && input.documentsOnly) return { state: refuse(s2, "General information holds the basic data and the metadata questions: it keeps its questions."), id: "" };
  const co = [...new Set(input.co)].filter((x) => x !== input.lead);
  const next = {
    ...existing ?? { fields: [] },
    id,
    code,
    title: input.title.trim(),
    kind: input.kind,
    meaning: input.meaning.trim(),
    lead: input.lead,
    co,
    documentsOnly: input.documentsOnly
  };
  if (existing && JSON.stringify(existing) === JSON.stringify(next)) return { state: s2, id };
  let out = withDraft(s2, (p) => {
    if (existing) return { ...p, template: { ...p.template, sections: p.template.sections.map((x) => x.id === id ? next : x) } };
    const sections = [...p.template.sections];
    sections.splice(insertAt(sections, next), 0, next);
    return { ...p, template: { ...p.template, sections } };
  });
  out = logEvent(out, { at, by, kind: "config", action: existing ? `Changed section ${code}` : `Added section ${code}`, detail: `${draftTag(d)}: ${code} \xB7 ${next.title || "(no title)"}, ${next.kind}, lead ${next.lead}${co.length ? `, co-reviewers ${co.join(", ")}` : ""}, ${next.documentsOnly ? "documents only" : "questions"}.${existing ? "" : " A new section needs a rule that switches it on."}` });
  return { state: out, id };
}
function retireSection(s2, by, sectionId, at = nowIso()) {
  return setRetired(s2, by, sectionId, true, at);
}
function restoreSection(s2, by, sectionId, at = nowIso()) {
  return setRetired(s2, by, sectionId, false, at);
}
function setRetired(s2, by, sectionId, retired, at) {
  const denied = guard(s2, by);
  if (denied) return refuse(s2, denied);
  const d = draftPair(s2);
  if (!d) return noDraft(s2);
  const sec = d.template.sections.find((x) => x.id === sectionId);
  if (!sec) return refuse(s2, `${sectionId} is not in the draft questionnaire.`);
  if (sectionId === "GEN" && retired) return refuse(s2, "General information holds the basic data and the metadata questions: it cannot be retired.");
  if (!!sec.retired === retired) return refuse(s2, `${sec.code} is ${retired ? "already retired" : "not retired"}.`, "info");
  let out = withDraft(s2, (p) => ({ ...p, template: { ...p.template, sections: p.template.sections.map((x) => x.id === sectionId ? retired ? { ...x, retired: true } : (({ retired: _r, ...y }) => (void 0, y))(x) : x) } }));
  const flagged = rulesPointingAt(s2, sectionId);
  out = logEvent(out, { at, by, kind: "config", action: retired ? `Retired section ${sec.code}` : `Restored section ${sec.code}`, detail: `${draftTag(d)}: ${sec.code} \xB7 ${sec.title} ${retired ? "is hidden for new cases on this version; running cases keep it" : "is back for new cases on this version"}.${retired && flagged.length ? ` Rules that point at it: ${flagged.join(", ")}.` : ""}` });
  return toast(out, "info", retired ? `${sec.code} retired in the draft.${flagged.length ? ` ${flagged.join(", ")} still point${flagged.length === 1 ? "s" : ""} at it.` : ""}` : `${sec.code} is back in the draft.`);
}
function nextFieldId(s2, sectionId) {
  const used = /* @__PURE__ */ new Set([...BUILTIN_FIELDS.map((f) => f.id), ...s2.config.pairs.flatMap((p) => p.template.sections.flatMap((x) => x.fields.map((f) => f.id)))]);
  for (let n = 1; ; n++) {
    const id = `FLD-${sectionId}-${String(n).padStart(3, "0")}`;
    if (!used.has(id)) return id;
  }
}
function draftSection(s2, by, sectionId) {
  const denied = guard(s2, by);
  if (denied) return { error: refuse(s2, denied) };
  const d = draftPair(s2);
  if (!d) return { error: noDraft(s2) };
  const sec = d.template.sections.find((x) => x.id === sectionId);
  if (!sec) return { error: refuse(s2, `${sectionId} is not in the draft questionnaire.`) };
  if (sec.retired) return { error: refuse(s2, `${sec.code} is retired in this version. Restore it to change its questions.`) };
  return { d, sec };
}
var withSection = (s2, sectionId, fn) => withDraft(s2, (p) => ({ ...p, template: { ...p.template, sections: p.template.sections.map((x) => x.id === sectionId ? fn(x) : x) } }));
function upsertField(s2, by, sectionId, input, at = nowIso()) {
  const r = draftSection(s2, by, sectionId);
  if ("error" in r) return { state: r.error, id: "" };
  const { d, sec } = r;
  if (sec.documentsOnly) return { state: refuse(s2, `${sec.code} holds documents only. Switch it to \u201CQuestions\u201D first.`), id: "" };
  const existing = input.id ? sec.fields.find((f) => f.id === input.id) : void 0;
  if (input.id && !existing) return { state: refuse(s2, `${input.id} is not a question of ${sec.code} in the draft.`), id: "" };
  const id = existing?.id ?? nextFieldId(s2, sectionId);
  const options = isChoiceType(input.type) ? (input.options ?? []).map((o) => ({ value: (o.value ?? o.label).trim() || o.label.trim(), label: o.label.trim() })) : void 0;
  const values = (options ?? []).map((o) => o.value.toLowerCase()).filter(Boolean);
  if (new Set(values).size !== values.length) return { state: refuse(s2, "Two options have the same text."), id: "" };
  const field = fieldData({ id, label: input.label.trim(), type: input.type, required: input.required, options, unit: isNumberType(input.type) ? input.unit?.trim() : void 0, help: input.help?.trim(), owner: input.owner });
  if (isNumberType(input.type) && input.unit === void 0) delete field.unit;
  if (existing && JSON.stringify(existing) === JSON.stringify(field)) return { state: s2, id };
  let out = withSection(s2, sectionId, (x) => ({ ...x, fields: existing ? x.fields.map((f) => f.id === id ? field : f) : [...x.fields, field] }));
  out = logEvent(out, { at, by, kind: "config", action: existing ? `Changed question in ${sec.code}` : `Added question to ${sec.code}`, detail: `${draftTag(d)}: \u201C${field.label || "(no label)"}\u201D (${field.type}, ${field.required}${field.unit ? `, ${field.unit}` : ""}), owner ${field.owner}.` });
  return { state: out, id };
}
function moveField(s2, by, sectionId, fieldId, dir, at = nowIso()) {
  const r = draftSection(s2, by, sectionId);
  if ("error" in r) return r.error;
  const { d, sec } = r;
  const i = sec.fields.findIndex((f) => f.id === fieldId);
  if (i < 0) return refuse(s2, `${fieldId} is not a question of ${sec.code} in the draft.`);
  const j = dir === "up" ? i - 1 : i + 1;
  if (j < 0 || j >= sec.fields.length) return refuse(s2, `It is already the ${dir === "up" ? "first" : "last"} question.`, "info");
  const fields = [...sec.fields];
  [fields[i], fields[j]] = [fields[j], fields[i]];
  const out = withSection(s2, sectionId, (x) => ({ ...x, fields }));
  return logEvent(out, { at, by, kind: "config", action: `Reordered questions in ${sec.code}`, detail: `${draftTag(d)}: \u201C${sec.fields[i].label}\u201D moved ${dir}.` });
}
function removeField(s2, by, sectionId, fieldId, at = nowIso()) {
  const r = draftSection(s2, by, sectionId);
  if ("error" in r) return r.error;
  const { d, sec } = r;
  const f = sec.fields.find((x) => x.id === fieldId);
  if (!f) return refuse(s2, `${fieldId} is not a question of ${sec.code} in the draft.`);
  const out = withSection(s2, sectionId, (x) => ({ ...x, fields: x.fields.filter((y) => y.id !== fieldId) }));
  return logEvent(out, { at, by, kind: "config", action: `Removed question from ${sec.code}`, detail: `${draftTag(d)}: \u201C${f.label}\u201D removed. Cases on earlier versions keep it.` });
}
function publishDraft(s2, by, changeNote, at = nowIso()) {
  const denied = guard(s2, by);
  if (denied) return refuse(s2, denied);
  const d = draftPair(s2);
  if (!d) return noDraft(s2);
  const plan = publishPlan(s2);
  const prev = currentPair(s2);
  const prevLabel = pairLabel(prev.ruleSetVersion, prev.templateVersion);
  if (plan.kind === "none") return refuse(s2, `Nothing to publish: the draft is the same as ${pairLabel(plan.base.ruleSetVersion, plan.base.templateVersion)}.`, "info");
  const note = changeNote.trim();
  if (!note) return refuse(s2, "Write a change note: what changes, and why.");
  const v = validateDraft(s2);
  if (!v.ok) return refuse(s2, `${plan.label} cannot be published yet: ${v.checks.filter((c) => !c.ok).map((c) => c.label.charAt(0).toLowerCase() + c.label.slice(1)).join("; ")}.`);
  const ch = draftChanges(s2);
  const ruleSet2 = plan.rulesChanged ? d.ruleSet : { version: plan.base.ruleSetVersion, rules: ruleDataOf(s2.config, plan.base.ruleSetVersion).map(copyRule) };
  const template = plan.questionnaireChanged ? d.template : JSON.parse(JSON.stringify(templateOf(s2.config, plan.base.templateVersion)));
  const published = { ...d, ruleSet: ruleSet2, template, status: "published", changeNote: note, publishedAt: at, publishedBy: by };
  const config = { pairs: s2.config.pairs.map((p) => p === d ? published : p) };
  const ownership = { ...s2.ownership };
  const owned = [];
  if (plan.questionnaireChanged) {
    for (const x of d.template.sections) {
      const cur = ownership[x.id];
      if (!cur || ownersKey(cur.lead, cur.co) !== ownersKey(x.lead, x.co)) {
        ownership[x.id] = { lead: x.lead, co: [...x.co] };
        owned.push(x.code);
      }
    }
  }
  let out = { ...s2, config, templates: templateList(config), activeRuleSet: ruleSet2.version, ownership };
  const name = plan.label;
  const kept = plan.kind === "rules" ? ` The questionnaire stays ${shortTemplate(template.version)}: no new questionnaire version.` : plan.kind === "questionnaire" ? ` The rules stay ${ruleSet2.version}: no new rule set.` : "";
  out = logEvent(out, { at, by, kind: "config", action: `Published ${name}`, detail: `${plan.kindLabel}: ${note} (${changesText(ch)}).${kept} New cases use ${name}; running cases keep their version.${owned.length ? ` Section owners set for ${owned.join(", ")}.` : ""}` });
  const running = s2.cases.filter((c) => !isClosed(c));
  const onPrev = running.filter((c) => c.ruleSetVersion === prev.ruleSetVersion && c.templateVersion === prev.templateVersion).length;
  const keep = !running.length ? "No case is running." : onPrev === running.length ? `${running.length} running case${running.length === 1 ? "" : "s"} keep${running.length === 1 ? "s" : ""} ${prevLabel}.` : `${running.length} running case${running.length === 1 ? "" : "s"} keep the version they started with.`;
  const head = plan.kind === "rules" ? `Rules ${ruleSet2.version} published with questionnaire ${shortTemplate(template.version)} (unchanged). New cases use ${name}` : plan.kind === "questionnaire" ? `Questionnaire ${shortTemplate(template.version)} published with rules ${ruleSet2.version} (unchanged). New cases use ${name}` : `${name} published. New cases use it`;
  return toast(out, "success", `${head}; ${keep.charAt(0).toLowerCase()}${keep.slice(1)}`);
}

// prototype/src/domain/finalDocument.ts
var CONFIRMATION_LABEL = {
  completeness: "Completeness confirmation",
  "dept-completion": "Review completed",
  "final-release": "Final release",
  cancellation: "Cancellation"
};
function fingerprintOf(text) {
  let h1 = 3735928559;
  let h2 = 1103547991;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ h1 >>> 16, 2246822507) ^ Math.imul(h2 ^ h2 >>> 13, 3266489909);
  h2 = Math.imul(h2 ^ h2 >>> 16, 2246822507) ^ Math.imul(h1 ^ h1 >>> 13, 3266489909);
  return (h2 >>> 0).toString(16).padStart(8, "0") + (h1 >>> 0).toString(16).padStart(8, "0");
}
var content = (d) => {
  const { fingerprint: _omit, ...rest } = d;
  return JSON.stringify(rest);
};
var docName = (c, id) => id ? c.documents.find((d) => d.id === id)?.name : void 0;
var answerText = (f, v) => (f.type === "number" || f.type === "decimal") && f.unit && hasValue(v) ? `${formatValue(v)} ${f.unit}` : formatValue(v);
function metadataAnswers(s2, c) {
  return CONFIG_QUESTIONS.map((q) => {
    const v = c.config[q.id];
    const label = (x) => q.options?.find((o) => o.value === x)?.label ?? x;
    const value = !isConfigAnswered(c, q.id) ? "\u2014" : Array.isArray(v) ? v.length ? v.map(label).join(", ") : "None" : formatValue(v);
    const who = c.answeredBy[q.id];
    return { id: q.id, code: q.code, label: q.label, value, by: who ? userName(s2, who.by) : void 0, at: who?.at, setByBdf: q.answeredBy === "rmm" || void 0 };
  });
}
function pointResult(p) {
  if (p.status !== "closed") return "Open";
  if (closedByCancellation(p)) return "Withdrawn with the case cancellation";
  return p.outcome === "accepted" ? "Accepted" : p.outcome === "withdrawn" ? "Closed, no answer needed" : "Not accepted";
}
function threadRounds(s2, c, p) {
  const rounds = [];
  for (const m of p.thread) {
    const entry = {
      at: m.at,
      by: userName(s2, m.by),
      side: m.side,
      action: m.action,
      // The internal reason of "closed as not accepted" stays out; the entry itself is kept.
      text: m.action === "note" ? "Closed as not accepted." : m.text,
      attachment: docName(c, m.documentId)
    };
    const starts = m.action === "raised" || m.newRound === true || m.action === "returned" && m.newRound !== false;
    if (starts || !rounds.length) rounds.push({ n: rounds.length + 1, entries: [entry] });
    else rounds[rounds.length - 1].entries.push(entry);
  }
  return rounds;
}
function buildFinalDocument(s2, c, at, trigger) {
  const sup = s2.suppliers.find((x) => x.id === c.supplierId);
  const sec = (id) => sectionOf(id, c.templateVersion, s2.config);
  const field = (id) => fieldOf(id, c.templateVersion, s2.config);
  const slots = requestedDocuments(c, s2.config);
  const slotAnswer = (x) => {
    const files = slotDocuments(c, x.key);
    const who = files[0] ? { by: files[0].uploadedBy, at: files[0].uploadedAt } : c.answeredBy[x.key];
    return { fieldId: x.key, label: `${x.doc} (requested document)`, value: files.length ? files.map((d) => d.name).join(", ") : "\u2014", by: who ? userName(s2, who.by) : void 0, at: who?.at, justification: files.length ? void 0 : c.justifications[x.key] };
  };
  const sections = c.scope.filter((sc) => sc.applicability !== "na" || sc.sectionId === "K5.1" && !!c.justifications["FLD-5.1-002"]).map((sc) => {
    const def = sec(sc.sectionId);
    const answers = caseFields(c, sc.sectionId, s2.config).filter((f) => hasValue(answerOf(c, f)) || !!c.justifications[f.id]).map((f) => {
      const v = answerOf(c, f);
      const value = f.type === "file" && typeof v === "string" ? docName(c, v) ?? formatValue(v) : answerText(f, v);
      const who = answeredByOf(c, f);
      return { fieldId: f.id, label: f.label, value: hasValue(v) ? value : "\u2014", by: who ? userName(s2, who.by) : void 0, at: who?.at, justification: c.justifications[f.id] };
    }).concat(slots.filter((x) => x.sectionId === sc.sectionId && requestedDocStatus(c, x) !== "missing").map(slotAnswer));
    return { sectionId: sc.sectionId, code: def?.code ?? sc.sectionId, title: def?.title ?? "", applicability: sc.applicability, addedLater: sc.addedLater, answers, justification: c.justifications[sc.sectionId] };
  });
  const owner = s2.users.find((u) => u.id === c.ownerId);
  const held = new Set(sections.map((x) => x.sectionId));
  const placeOf = (d) => isSlotKey(d.fieldId) ? slots.find((x) => x.key === d.fieldId)?.sectionId ?? d.sectionId : d.sectionId;
  const shown = c.documents.filter((d) => {
    if (!held.has(placeOf(d))) return false;
    if (isSlotKey(d.fieldId)) return slots.some((x) => x.key === d.fieldId);
    const f = d.fieldId ? field(d.fieldId) : void 0;
    return !f || isVisible(f, c);
  });
  const base3 = {
    id: `${c.id}-FD`,
    caseId: c.id,
    generatedAt: at,
    trigger,
    header: {
      caseId: c.id,
      materialName: c.materialName,
      inci: c.inci,
      materialNo: c.materialNo,
      // From the case (FLD-GEN-002/-003, set at case start): a released document must not follow later edits of the
      // supplier master. The master only for a case without them.
      supplierName: String(c.answers["FLD-GEN-002"] ?? "").trim() || sup?.name || c.manufacturer,
      duns: String(c.answers["FLD-GEN-003"] ?? "").trim() || sup?.duns || "",
      manufacturer: manufacturerOf(c),
      site: siteOf(c),
      markets: c.config.SF11 ?? [],
      templateVersion: c.templateVersion,
      ruleSetVersion: c.ruleSetVersion,
      ownerName: owner?.name ?? c.ownerId,
      createdAt: c.createdAt,
      releasedAt: at
    },
    metadata: metadataAnswers(s2, c),
    sections,
    components: c.components.map((r) => ({ ...r })),
    evidence: [
      ...shown.map((d) => {
        const slot = isSlotKey(d.fieldId) ? slots.find((x) => x.key === d.fieldId) : void 0;
        return {
          documentId: d.id,
          name: d.name,
          sectionId: placeOf(d),
          sectionCode: sec(placeOf(d))?.code ?? placeOf(d),
          fieldLabel: slot ? `Requested document: ${slot.doc}` : d.fieldId ? field(d.fieldId)?.label : void 0,
          uploadedBy: userName(s2, d.uploadedBy),
          uploadedAt: d.uploadedAt,
          ...slot ? { requested: slot.doc } : {}
        };
      }),
      // A requested document the supplier could not provide: its justification, with who gave it and when.
      ...slots.filter((x) => held.has(x.sectionId) && requestedDocStatus(c, x) === "justified").map((x) => {
        const who = c.answeredBy[x.key];
        return {
          documentId: x.key,
          name: x.doc,
          sectionId: x.sectionId,
          sectionCode: sec(x.sectionId)?.code ?? x.sectionId,
          fieldLabel: `Requested document: ${x.doc}`,
          uploadedBy: who ? userName(s2, who.by) : "\u2014",
          uploadedAt: who?.at ?? "",
          requested: x.doc,
          justification: c.justifications[x.key]
        };
      })
    ],
    threads: c.openPoints.map((p) => ({ opId: p.id, ref: p.ref.label, kind: p.kind, raisedBy: userName(s2, p.createdBy), raisedAt: p.createdAt, result: pointResult(p), rounds: threadRounds(s2, c, p) })),
    confirmations: c.confirmations.filter((x) => x.type !== "cancellation").map((x) => ({ type: x.type, label: x.type === "dept-completion" && x.dept ? `${CONFIRMATION_LABEL[x.type]}: ${DEPT_SHORT[x.dept]}` : CONFIRMATION_LABEL[x.type], name: x.name, email: x.email, role: x.role, at: x.at, note: x.note }))
  };
  return { ...base3, fingerprint: fingerprintOf(content(base3)) };
}
var verifyFinalDocument = (d) => fingerprintOf(content(d)) === d.fingerprint;

// prototype/src/domain/mentions.ts
var mentionableUsers = (s2) => s2.users.filter((u) => u.side === "internal" && isActiveUser(u));
var WORD = /[\p{L}\p{N}_]/u;
var fold = (t) => t.normalize("NFD").replace(new RegExp("\\p{Diacritic}", "gu"), "").toLowerCase();
function aliases(name) {
  const short2 = name.replace(/^Dr\.\s+/, "");
  return short2 === name ? [name] : [name, short2];
}
function findMentions(text, people) {
  const names = people.flatMap((p) => aliases(p.name).map((a) => ({ id: p.id, key: fold(a), len: a.length }))).sort((a, b) => b.len - a.len);
  const hits = [];
  for (let i = text.indexOf("@"); i >= 0; i = text.indexOf("@", i + 1)) {
    if (i > 0 && WORD.test(text[i - 1])) continue;
    const hit = names.find((n) => {
      if (fold(text.slice(i + 1, i + 1 + n.len)) !== n.key) return false;
      const next = text[i + 1 + n.len];
      return next === void 0 || !WORD.test(next);
    });
    if (!hit) continue;
    hits.push({ start: i, end: i + 1 + hit.len, userId: hit.id });
    i += hit.len;
  }
  return hits;
}
function parseMentions(s2, text) {
  return [...new Set(findMentions(text, mentionableUsers(s2)).map((h) => h.userId))];
}
function mentionRecipients(s2, note) {
  const ok = new Set(mentionableUsers(s2).map((u) => u.id));
  return [...new Set(note.mentions ?? [])].filter((id) => id !== note.by && ok.has(id));
}
function noteLink(c, note, recipient) {
  const reviews = !!recipient?.dept && c.reviews.some((r) => r.dept === recipient.dept);
  return reviews ? `/review/${c.id}?${note.sectionId ? `s=${note.sectionId}&` : ""}note=${note.id}` : `/cases/${c.id}?tab=notes&note=${note.id}`;
}
function joinPeople(names) {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

// prototype/src/domain/mail.ts
var DATA_CHANGED_MERGE_MS = 30 * 6e4;
var supplierLink = (caseId, opId) => `/portal/case/${caseId}${opId ? `?op=${opId}` : ""}`;
var reviewLink = (caseId, opId, sectionId) => {
  const q = [opId && `op=${opId}`, sectionId && `s=${sectionId}`].filter(Boolean).join("&");
  return `/review/${caseId}${q ? `?${q}` : ""}`;
};
var caseLink = (caseId, tab) => `/cases/${caseId}${tab ? `?tab=${tab}` : ""}`;
var channelOf = (e) => e.startsWith("op-") ? "open-point-webhook" : e === "final-document" ? "final-document" : "task-notification";
function sendMail(s2, d, at) {
  const to = [...new Set(d.to)].filter((id) => isActiveUser(userOf(s2, id)));
  if (!to.length) return s2;
  if (d.key && s2.mails.some((m) => m.key === d.key)) return s2;
  if (d.event === "data-changed") {
    const last = s2.mails.at(-1);
    if (last && last.event === "data-changed" && last.caseId === d.caseId && last.by === d.by && last.readBy.length === 0 && last.to.join() === to.join() && Date.parse(at) - Date.parse(last.at) <= DATA_CHANGED_MERGE_MS) {
      const sameSection = last.sectionId === d.sectionId;
      const merged = { ...last, at, subject: sameSection ? last.subject : `${d.caseId}: the supplier changed data`, body: `${last.body}
${d.body.split("\n")[0]}`, sectionId: sameSection ? last.sectionId : void 0, link: sameSection ? last.link : last.link.split("?")[0] };
      return { ...s2, mails: [...s2.mails.slice(0, -1), merged] };
    }
  }
  const mail = {
    id: `M-${String(s2.mails.length + 1).padStart(5, "0")}`,
    at,
    to,
    by: d.by,
    event: d.event,
    channel: d.channel ?? channelOf(d.event),
    audience: d.audience,
    subject: d.subject,
    body: d.body,
    caseId: d.caseId,
    opId: d.opId,
    sectionId: d.sectionId,
    link: d.link,
    readBy: [],
    key: d.key
  };
  return { ...s2, mails: [...s2.mails, mail] };
}
var caseContactIds = (s2, c) => c.supplierContactIds.filter((id) => isActiveUser(userOf(s2, id)));
var trackAssigneeIds = (c, depts) => c.reviews.filter((r) => !depts || depts.includes(r.dept)).map((r) => r.assigneeId);
var deptUserIds = (s2, dept) => s2.users.filter((u) => u.side === "internal" && u.dept === dept && isActiveUser(u)).map((u) => u.id);
var KIND_WORD = { query: "question", "document-request": "document request", "additional-part": "additional section", finding: "question" };
var quote = (t) => `\u201C${t.trim()}\u201D`;
var lastReturnText = (op) => [...op.thread].reverse().find((m) => m.action === "returned")?.text ?? "";
function supplierMail(s2, c, event, by, at, op, extra) {
  const named = caseContactIds(s2, c);
  const to = extra?.to ? named.filter((id) => extra.to.includes(id)) : named;
  const m = c.materialName;
  const ref = op?.ref.label ?? "";
  const kind = op ? KIND_WORD[op.kind] : "";
  const aKind = `${/^[aeiou]/i.test(kind) ? "an" : "a"} ${kind}`;
  const link = supplierLink(c.id, op?.id);
  let subject = "";
  let body = "";
  switch (event) {
    case "invitation":
      if (c.phase === "review") {
        subject = `You were added to the CIQ for ${m}`;
        body = `You were added as a contact on the Cosmetic Ingredient Questionnaire (CIQ) for ${m} (${c.id}). Completeness is already confirmed and Beiersdorf is reviewing it.
Answer any questions from Beiersdorf and keep the data current until Beiersdorf requests your final release.`;
      } else if (c.phase === "final-release") {
        subject = `You were added to the CIQ for ${m}`;
        body = `You were added as a contact on the Cosmetic Ingredient Questionnaire (CIQ) for ${m} (${c.id}). Beiersdorf has completed its review and waits for the final release; the questionnaire is locked meanwhile.
Please check it and give the final release in the supplier portal. If something must change, contact Beiersdorf.`;
      } else {
        subject = `Please fill in the CIQ for ${m}`;
        body = `Beiersdorf asks you to fill in the Cosmetic Ingredient Questionnaire (CIQ) for ${m} (${c.id}).
Answer the metadata questions first: the sections that apply open as you answer. Then complete them, upload the evidence at the questions and confirm completeness.
Due date: ${fmtDate(c.dueDate)}.`;
      }
      break;
    case "op-raised":
      subject = `${c.id}: ${aKind} from Beiersdorf`;
      body = `Beiersdorf has ${aKind} on ${ref} for ${m} (${c.id}):
${quote(op.question)}
Please answer by ${fmtDate(op.dueDate)}. Upload any document at the question in the supplier portal.`;
      break;
    case "op-edited":
      subject = `${c.id}: Beiersdorf changed ${aKind}`;
      body = `Beiersdorf changed its ${kind} on ${ref} for ${m} (${c.id}). The current version:
${quote(op.question)}
Due date: ${fmtDate(op.dueDate)}.${extra?.newRound ? "\nPlease answer the changed question." : ""}`;
      break;
    case "op-returned":
      subject = `${c.id}: Beiersdorf needs more on ${ref}`;
      body = `Beiersdorf reviewed your answer on ${ref} for ${m} (${c.id}) and needs more:
${quote(lastReturnText(op))}
Please answer by ${fmtDate(op.dueDate)}.`;
      break;
    case "op-accepted":
      subject = `${c.id}: your answer was accepted`;
      body = `Beiersdorf accepted your answer on ${ref} for ${m} (${c.id}). Nothing more is needed on it.`;
      break;
    case "op-closed":
      subject = `${c.id}: a question was closed`;
      body = `Beiersdorf closed its ${kind} on ${ref} for ${m} (${c.id}). No answer is needed on it.`;
      break;
    case "release-requested":
      subject = `${c.id}: please give the final release`;
      body = `Beiersdorf has completed its review of the CIQ for ${m} (${c.id}). Your questionnaire is now locked: please check it and give the final release in the supplier portal. If something must change, contact Beiersdorf; they can reopen the review. With the release the CIQ is frozen.`;
      break;
    case "release-withdrawn":
      subject = `${c.id}: the final release is not needed yet`;
      body = `Beiersdorf is reviewing the CIQ for ${m} (${c.id}) again, so the request for your final release is withdrawn for now. You will get a new request when the review is complete. Your questionnaire is open again, so you can update your answers until then.`;
      break;
    case "release-receipt": {
      const who = userOf(s2, by)?.name ?? "your company";
      subject = `${c.id}: final release received`;
      body = `Thank you. The final release of the CIQ for ${m} (${c.id}) was recorded on ${fmtDateTime(at)} (${who}). The CIQ is now frozen. If something changes later, use \u201CReport a change\u201D in the supplier portal.`;
      break;
    }
    case "cancelled":
      subject = `${c.id}: request withdrawn`;
      body = `Beiersdorf has withdrawn the request for ${m} (${c.id}). No further action is needed, and your open tasks on it are closed.`;
      break;
    case "reactivated":
      subject = `${c.id}: request active again`;
      body = `Beiersdorf has reactivated the request for ${m} (${c.id}). Your tasks on it are open again in the supplier portal. Due date: ${fmtDate(c.dueDate)}.`;
      break;
    case "reminder":
      subject = `${extra?.overdue ? "Overdue" : "Reminder"}: ${extra?.task ?? "open task"} (${c.id})`;
      body = `${extra?.overdue ? "This task is overdue" : "A friendly reminder"}: ${extra?.task ?? "open task"} for ${m} (${c.id})${op ? ` on ${ref}` : ""}. Due date: ${fmtDate(op?.dueDate ?? c.dueDate)}.`;
      break;
    default:
      return s2;
  }
  return sendMail(s2, { to, by, event, audience: "supplier", subject, body, link, caseId: c.id, opId: op?.id, sectionId: op?.ref.sectionId, key: extra?.key }, at);
}
function internalMail(s2, to, d, at) {
  return sendMail(s2, { ...d, to, audience: "internal" }, at);
}
function answeredMail(s2, c, op, by, at, text, cannotProvide, documentName) {
  const who = userOf(s2, by)?.name ?? "The supplier";
  return internalMail(
    s2,
    [raiserOf(op), op.responsibleId],
    {
      by,
      event: "op-answered",
      subject: `${c.id}: the supplier answered ${op.id}`,
      body: `${who} ${cannotProvide ? "cannot provide what was asked" : "answered"} on ${op.ref.label} (${c.materialName}, ${c.id}):
${quote(text)}${documentName ? `
Document at the question: ${documentName}` : ""}
Please accept it, return it or close the point.`,
      link: reviewLink(c.id, op.id),
      caseId: c.id,
      opId: op.id,
      sectionId: op.ref.sectionId
    },
    at
  );
}
function reviewAssignedMail(s2, c, depts, by, at, why) {
  let next = s2;
  for (const d of depts) {
    const tr = c.reviews.find((r) => r.dept === d);
    if (!tr) continue;
    next = internalMail(
      next,
      [tr.assigneeId],
      { by, event: "review-assigned", subject: `${c.id}: ${d === "RMM" ? "your RMM review" : `${DEPT_SHORT[d]} review`} of ${c.materialName}`, body: `${why}
Your ${d === "RMM" ? "RMM review of the whole CIQ" : `${DEPT_SHORT[d]} review`} for ${c.materialName} (${c.id}) is open in My reviews.`, link: reviewLink(c.id), caseId: c.id },
      at
    );
  }
  return next;
}
function dataChangedMail(s2, c, by, at, sectionId, what) {
  const depts = c.reviews.filter((r) => r.dept === "RMM" || usesSection(s2, r.dept, sectionId)).map((r) => r.dept);
  const who = userOf(s2, by)?.name ?? "The supplier";
  const code = sectionOf(sectionId, c.templateVersion, s2.config)?.code ?? sectionId;
  return internalMail(
    s2,
    trackAssigneeIds(c, depts),
    { by, event: "data-changed", subject: `${c.id}: the supplier changed data in ${code}`, body: `${code}: ${what} (${who}, ${fmtDateTime(at)}).
The questionnaire of ${c.materialName} (${c.id}) shows the current answers. If the change reopened your completed review, a separate e-mail tells you so.`, link: reviewLink(c.id, void 0, sectionId), caseId: c.id, sectionId },
    at
  );
}
function noteMentionMails(s2, c, note, at) {
  const who = userOf(s2, note.by)?.name ?? "A colleague";
  const code = note.sectionId ? sectionOf(note.sectionId, c.templateVersion, s2.config)?.code ?? note.sectionId : "";
  let next = s2;
  for (const id of mentionRecipients(s2, note)) {
    next = internalMail(
      next,
      [id],
      {
        by: note.by,
        event: "note-mention",
        subject: `${who} mentioned you on ${c.id}`,
        body: `${who} mentioned you in an internal note on ${c.materialName} (${c.id})${code ? `, section ${code}` : ""}:
${quote(note.text)}
Open the note to reply. Internal notes are for Beiersdorf only; the supplier never sees them.`,
        link: noteLink(c, note, userOf(s2, id)),
        caseId: c.id,
        sectionId: note.sectionId
      },
      at
    );
  }
  return next;
}
var usesSection = (s2, dept, sectionId) => ownsSection(s2, dept, sectionId);

// prototype/src/domain/suppliers.ts
var normaliseEmail = (e) => e.trim().toLowerCase();
var isValidEmail = (e) => /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)*\.[a-z]{2,}$/i.test(e.trim());
var initialsOf = (n) => n.replace(/^Dr\. /, "").split(/\s+/).filter(Boolean).map((x) => x[0]).join("").slice(0, 2).toUpperCase() || "?";
function validateContact(s2, input, opts = {}) {
  const e = {};
  if (!input.name?.trim()) e.name = "Enter the contact's name.";
  const mail = normaliseEmail(input.email ?? "");
  if (!mail) e.email = "Enter the e-mail address.";
  else if (!isValidEmail(mail)) e.email = "Enter a valid e-mail address, e.g. name@company.com.";
  else {
    const taken = opts.supplierId ? s2.users.find((u) => u.side === "supplier" && u.supplierId === opts.supplierId && u.id !== opts.editingUserId && normaliseEmail(u.email) === mail) : void 0;
    if (taken) e.email = isActiveUser(taken) ? `${taken.name}, another contact of this supplier, has this e-mail address.` : `${taken.name}, an inactive contact of this supplier, has this e-mail address. Reactivate that contact instead.`;
    else if ((opts.others ?? []).some((o) => normaliseEmail(o) === mail)) e.email = "Two contacts have the same e-mail address.";
  }
  return e;
}
function validateCaseContacts(s2, supplierId, ids) {
  const unique = [...new Set(ids)];
  if (!unique.length) return "Choose at least one contact of the supplier.";
  if (unique.length > 2) return "A case has one or two supplier contacts.";
  for (const id of unique) {
    const u = userOf(s2, id);
    if (!u || u.side !== "supplier" || u.supplierId !== supplierId) return "A case contact must be a contact of the chosen supplier.";
    if (!isActiveUser(u)) return `${u.name} is no longer active.`;
  }
  return null;
}
function syncContactAnswers(s2, c) {
  if (!c.liveScope || isClosed(c)) return c;
  const mails = c.supplierContactIds.map((id) => userOf(s2, id)).filter((u) => !!u && isActiveUser(u)).map((u) => u.email);
  const answers = { ...c.answers };
  answers["FLD-GEN-008"] = mails[0] ?? answers["FLD-GEN-008"] ?? "";
  if (mails[1]) answers["FLD-GEN-009"] = mails[1];
  else delete answers["FLD-GEN-009"];
  if (answers["FLD-GEN-008"] === c.answers["FLD-GEN-008"] && answers["FLD-GEN-009"] === c.answers["FLD-GEN-009"]) return c;
  return { ...c, answers };
}
var contactsOf = (s2, supplierId, activeOnly = false) => s2.users.filter((u) => u.side === "supplier" && u.supplierId === supplierId && (!activeOnly || isActiveUser(u)));
function contactDeactivationImpact(s2, userId) {
  const u = userOf(s2, userId);
  const openCases = s2.cases.filter((c) => !isClosed(c) && c.supplierContactIds.includes(userId));
  const needsReplacement = openCases.filter((c) => !c.supplierContactIds.some((id) => id !== userId && isActiveUser(userOf(s2, id))));
  const lastActive = !!u?.supplierId && contactsOf(s2, u.supplierId, true).filter((x) => x.id !== userId).length === 0;
  return { openCases, needsReplacement, lastActive };
}
var firstError = (e) => Object.values(e)[0];
function updateContact(s2, by, userId, patch, at = nowIso()) {
  const denied = check(s2, by, "supplier.manage");
  if (denied) return refuse(s2, denied);
  const cur = userOf(s2, userId);
  if (!cur || cur.side !== "supplier") return refuse(s2, "This contact no longer exists.");
  const merged = { name: patch.name ?? cur.name, email: patch.email ?? cur.email, title: patch.title ?? cur.title, mayConfirm: patch.mayConfirm ?? cur.mayConfirm !== false };
  const errors = validateContact(s2, merged, { editingUserId: userId, supplierId: cur.supplierId });
  if (Object.keys(errors).length) return refuse(s2, firstError(errors));
  const changes = [];
  if (merged.name.trim() !== cur.name) changes.push(`Name: ${cur.name} \u2192 ${merged.name.trim()}`);
  if (normaliseEmail(merged.email) !== cur.email) changes.push(`E-mail: ${cur.email} \u2192 ${normaliseEmail(merged.email)}`);
  if ((merged.title?.trim() || cur.title) !== cur.title) changes.push(`Title: ${cur.title} \u2192 ${merged.title?.trim()}`);
  if (merged.mayConfirm !== (cur.mayConfirm !== false)) changes.push(merged.mayConfirm ? "May confirm: yes" : "May confirm: no");
  if (!changes.length) return s2;
  const u = { ...cur, name: merged.name.trim(), email: normaliseEmail(merged.email), title: merged.title?.trim() || cur.title, mayConfirm: merged.mayConfirm, initials: initialsOf(merged.name) };
  let next = { ...s2, users: s2.users.map((x) => x.id === userId ? u : x) };
  if (u.email !== cur.email) {
    for (const c of next.cases.filter((x) => !isClosed(x) && x.supplierContactIds.includes(userId))) {
      next = mapCase(next, c.id, (x) => {
        const y = syncContactAnswers(next, x);
        return y === x ? x : audit(y, by, at, "Updated contact e-mail", `${u.name}: ${cur.email} \u2192 ${u.email}. The contact e-mails in General information follow.`, "GEN");
      });
    }
  }
  next = logEvent(next, { at, by, kind: "supplier", supplierId: cur.supplierId, action: "Updated contact", detail: `${u.name}: ${changes.join("; ")}. Earlier answers and confirmations keep the name they were given with.` });
  return toast(next, "success", `${u.name} updated.`);
}
function setContactActive(s2, by, userId, active, replacementId, at = nowIso()) {
  const denied = check(s2, by, "supplier.manage");
  if (denied) return refuse(s2, denied);
  const u = userOf(s2, userId);
  if (!u || u.side !== "supplier" || !u.supplierId) return refuse(s2, "This contact no longer exists.");
  if (active === isActiveUser(u)) return refuse(s2, `${u.name} is already ${active ? "active" : "inactive"}.`, "info");
  const supplierId = u.supplierId;
  if (active) {
    let next2 = { ...s2, users: s2.users.map((x) => x.id === userId ? { ...x, active: true } : x) };
    next2 = logEvent(next2, { at, by, kind: "supplier", supplierId, action: "Reactivated contact", detail: `${u.name} is active again. Add the contact to a case to give it access.` });
    return toast(next2, "success", `${u.name} is active again.`);
  }
  const impact = contactDeactivationImpact(s2, userId);
  if (impact.lastActive) return refuse(s2, `${u.name} is the last active contact of this supplier. Add another contact first.`);
  let rep;
  if (replacementId) {
    rep = userOf(s2, replacementId);
    if (!rep || rep.id === userId || rep.supplierId !== supplierId || !isActiveUser(rep)) return refuse(s2, "The replacement must be another active contact of the same supplier.");
  } else if (impact.needsReplacement.length) {
    return refuse(s2, `${u.name} is the only contact on ${impact.needsReplacement.map((c) => c.id).join(", ")}. Choose a replacement contact.`);
  }
  let next = { ...s2, users: s2.users.map((x) => x.id === userId ? { ...x, active: false, deactivatedAt: at } : x) };
  for (const c of impact.openCases) {
    const ids = [...new Set(c.supplierContactIds.map((id) => id === userId ? rep?.id ?? "" : id).filter(Boolean))];
    const added = rep && !c.supplierContactIds.includes(rep.id);
    const after = next;
    next = mapCase(
      next,
      c.id,
      (x) => audit(
        syncContactAnswers(after, { ...x, supplierContactIds: ids }),
        by,
        at,
        rep ? "Replaced supplier contact" : "Removed supplier contact",
        `${rep ? `${u.name} is no longer active; ${rep.name} takes over the request.` : `${u.name} is no longer active; the other case contact continues.`} The contact e-mails in General information follow.`
      )
    );
    if (added) next = supplierMail(next, next.cases.find((x) => x.id === c.id), "invitation", by, at, void 0, { to: [rep.id] });
  }
  next = logEvent(next, { at, by, kind: "supplier", supplierId, action: "Deactivated contact", detail: `${u.name} <${u.email}> deactivated.${impact.openCases.length ? ` ${rep ? `${rep.name} takes over` : "Removed from"} ${impact.openCases.map((c) => c.id).join(", ")}.` : ""}` });
  return toast(next, "success", `${u.name} deactivated.`);
}

// prototype/src/domain/actions.ts
var DAY_MS = 864e5;
function confirm(s2, c, by, at, type, dept, note) {
  const u = s2.users.find((x) => x.id === by);
  const conf = { type, by, name: u?.name ?? by, email: u?.email ?? "", role: u?.title ?? "", at, dept, reviewVersion: c.reviewVersion, note };
  return { ...c, confirmations: [...c.confirmations, conf] };
}
var codeOf = (sectionId, c, s2) => sectionOf(sectionId, c?.templateVersion, s2?.config)?.code ?? sectionId;
var codesOf = (ids, c, s2) => ids.map((id) => codeOf(id, c, s2)).join(", ") || "none";
var secOf = (s2, c, sectionId) => sectionOf(sectionId, c.templateVersion, s2.config);
var fieldIn = (s2, c, fieldId) => fieldOf(fieldId, c?.templateVersion, s2.config);
var showConfig = (k, v) => k === "SF01" && Array.isArray(v) ? v.map((o) => ORIGIN_LABEL[o] ?? o).join(", ") || "\u2014" : formatValue(v);
var flagDetail = (config) => `Origin without rules: ${undefinedOrigins(config).map((o) => ORIGIN_LABEL[o]).join(", ")}. The supplier got the standard sections only; RMM checks in its review whether more is needed and asks the supplier if so.`;
var scopeSummary = (scope) => `${scope.filter((x) => x.applicability === "mandatory").length} mandatory sections, ${scope.filter((x) => x.applicability === "optional").length} optional, ${scope.filter((x) => x.applicability === "na").length} not applicable`;
var isPart2 = (c) => c.phase === "review" || c.phase === "final-release";
var knownConfig = (patch) => Object.fromEntries(Object.entries(patch).filter(([k]) => k in CONFIG_BY_ID));
function withPrefills(x, s2, at) {
  const pre = prefillAnswers(x, s2.config);
  const ids = Object.keys(pre);
  if (!ids.length) return x;
  return { ...x, answers: { ...x.answers, ...pre }, answeredBy: { ...x.answeredBy, ...Object.fromEntries(ids.map((k) => [k, { by: "system", at }])) } };
}
var sentence = (t) => t.trim().replace(/[.!?…]+$/, "");
var INFORMED_SECTION = { CUS: "K7", LEG: "K8" };
var notBeforeToday = (due, at) => !Number.isNaN(Date.parse(due)) && Date.parse(due) + DAY_MS > Date.parse(at);
var short = (v) => {
  const t = (typeof v === "string" ? v : formatValue(v)).replace(/\s+/g, " ").trim();
  return t.length > 80 ? `${t.slice(0, 77)}\u2026` : t;
};
function supplierWriteGuard(s2, by, c, at, what) {
  if (!c) return refuse(s2, "This request no longer exists.");
  if (isClosed(c)) {
    const why = c.phase === "completed" ? "the CIQ is frozen since the final release" : "the case is cancelled";
    const logged = mapCase(s2, c.id, (x) => audit(x, by, at, "Change attempt refused", `${userName(s2, by)} tried to change ${what}; ${why}.`));
    return refuse(logged, c.phase === "completed" ? "The CIQ is frozen after the final release. Use \u201CReport a change\u201D instead." : "This request was withdrawn; it can no longer be changed.");
  }
  if (c.phase === "final-release") {
    const logged = mapCase(s2, c.id, (x) => audit(x, by, at, "Change attempt refused", `${userName(s2, by)} tried to change ${what}; the questionnaire is locked while Beiersdorf waits for the final release.`));
    return refuse(logged, RELEASE_LOCKED_TEXT);
  }
  const denied = check(s2, by, "ciq.edit", c);
  return denied ? refuse(s2, denied) : null;
}
function assigneeFor(s2, c, d) {
  if (d === "RMM") return c.ownerId;
  const primary = INTERNAL_PERSONAS.find((p) => p.dept === d)?.userId;
  const pu = primary ? userOf(s2, primary) : void 0;
  if (pu && pu.dept === d && isActiveUser(pu)) return pu.id;
  return s2.users.find((u) => u.side === "internal" && u.dept === d && isActiveUser(u))?.id ?? `u-${d.toLowerCase()}`;
}
function retrack(reviews, ops) {
  return reviews.map((r) => {
    if (r.status === "completed") return r;
    const waiting = ops.some((p) => p.dept === r.dept && p.status === "open");
    if (waiting) return r.status === "waiting-supplier" ? r : { ...r, status: "waiting-supplier" };
    return r.status === "waiting-supplier" ? { ...r, status: "in-review" } : r;
  });
}
function newCaseProblem(s2, by, input, at = nowIso()) {
  const denied = check(s2, by, "case.create");
  if (denied) return denied;
  if (!input.materialName.trim()) return "Enter the trade name.";
  if (!input.inci.trim()) return "Enter the main INCI.";
  if (!input.materialNo.trim()) return "Enter the Beiersdorf material number.";
  const sup = s2.suppliers.find((x) => x.id === input.supplierId);
  if (!sup) return "Choose a supplier from the supplier master.";
  if (sup.active === false) return `${sup.name} is inactive.`;
  const contacts = validateCaseContacts(s2, sup.id, input.contactIds);
  if (contacts) return contacts;
  if (!input.markets.length) return "Choose at least one target market.";
  if (!input.dueDate || !notBeforeToday(input.dueDate, at)) return "The due date must be today or later.";
  const owner = userOf(s2, input.ownerId ?? by);
  if (!owner || owner.dept !== "RMM") return "The case owner must be a Raw Material Manager.";
  return null;
}
function createCase(s2, by, input, at = nowIso(), forcedId) {
  const problem = newCaseProblem(s2, by, input, at);
  if (problem) return { state: refuse(s2, problem), id: "" };
  const year = at.slice(0, 4);
  const next = Math.max(0, ...s2.cases.filter((c2) => c2.id.startsWith(`CIQ-${year}-`)).map((c2) => Number(c2.id.split("-")[2]) || 0)) + 1;
  const id = forcedId ?? `CIQ-${year}-${String(next).padStart(4, "0")}`;
  const sup = s2.suppliers.find((x) => x.id === input.supplierId);
  const contactIds = [...new Set(input.contactIds)];
  const contact = userOf(s2, contactIds[0]);
  const contact2 = userOf(s2, contactIds[1] ?? "");
  const { ruleSetVersion, templateVersion: template } = currentPair(s2);
  const dups = duplicateOpenCases(s2, input.supplierId, input.materialNo);
  const config = { SF11: input.markets };
  const scope = deriveScope(config, ruleSetVersion, template, s2.config);
  let c = {
    id,
    materialName: input.materialName.trim(),
    inci: input.inci.trim(),
    materialNo: input.materialNo.trim(),
    supplierId: input.supplierId,
    manufacturer: sup.name,
    site: "",
    supplierContactIds: contactIds,
    ownerId: input.ownerId ?? by,
    createdAt: at,
    dueDate: input.dueDate,
    phase: "supplier-input",
    templateVersion: template,
    ruleSetVersion,
    config,
    scope,
    answers: {
      "FLD-GEN-001": input.materialName.trim(),
      "FLD-GEN-002": sup.name,
      "FLD-GEN-008": contact?.email ?? "",
      ...contact2 ? { "FLD-GEN-009": contact2.email } : {},
      "FLD-GEN-003": sup.duns
    },
    answeredBy: {},
    components: [],
    justifications: {},
    documents: [],
    reviews: [],
    informed: [],
    openPoints: [],
    confirmations: [],
    audit: [],
    reviewVersion: 0,
    phaseHistory: [{ phase: "supplier-input", at }],
    priority: input.priority,
    internalNotes: [],
    liveScope: true
  };
  const names = contactIds.map((x) => userOf(s2, x)).filter(Boolean).map((u) => `${u.name} <${u.email}>`);
  c = audit(c, by, at, "Created case", `Case created for ${c.materialName} (${sup.name}, DUNS ${sup.duns}). Questionnaire ${template}, rule set ${ruleSetVersion}. Target markets: ${input.markets.join(", ")}. Due ${fmtDate(input.dueDate)}.`);
  if (input.followUpOf) {
    const rep = s2.changeReports.find((r) => r.id === input.followUpOf.reportId);
    c = audit(c, by, at, "Follow-up case", `Started for the change reported on ${input.followUpOf.caseId} (${input.followUpOf.reportId})${rep ? `: \u201C${rep.text}\u201D` : "."}`);
  }
  if (dups.length) c = audit(c, by, at, "Created despite an open case", `Open case${dups.length > 1 ? "s" : ""} for the same supplier and material number: ${dups.map((x) => x.id).join(", ")}.${input.duplicateNote?.trim() ? ` Reason: ${input.duplicateNote.trim()}` : ""}`);
  c = audit(c, "system", at, "Derived scope", `Rule set ${ruleSetVersion} applied to the target markets: ${scopeSummary(scope)}. More sections open as the supplier answers the metadata questions.`);
  c = audit(c, "system", at, "Invited supplier contacts", `Invitation and task \u201CFill in the CIQ\u201D sent to ${names.join(" and ")}.`);
  let state = { ...s2, cases: [c, ...s2.cases] };
  state = supplierMail(state, c, "invitation", by, at);
  return { state, id };
}
function updateCaseContacts(s2, by, caseId, contactIds, at = nowIso()) {
  const c = getCase(s2, caseId);
  if (!c) return refuse(s2, "This case no longer exists.");
  const denied = check(s2, by, "case.editContacts", c);
  if (denied) return refuse(s2, denied);
  if (isClosed(c)) return refuse(s2, "The case is closed: its contacts can no longer change.");
  const problem = validateCaseContacts(s2, c.supplierId, contactIds);
  if (problem) return refuse(s2, problem);
  const ids = [...new Set(contactIds)];
  if (ids.join() === c.supplierContactIds.join()) return refuse(s2, "The contacts are unchanged.", "info");
  const added = ids.filter((x) => !c.supplierContactIds.includes(x));
  const removed = c.supplierContactIds.filter((x) => !ids.includes(x));
  let next = mapCase(s2, caseId, (x) => {
    const synced2 = syncContactAnswers(s2, { ...x, supplierContactIds: ids });
    const mails = synced2.answers["FLD-GEN-008"] !== x.answers["FLD-GEN-008"] || synced2.answers["FLD-GEN-009"] !== x.answers["FLD-GEN-009"];
    return audit(
      synced2,
      by,
      at,
      "Changed case contacts",
      `${removed.length ? `Removed: ${removed.map((x2) => userName(s2, x2)).join(", ")}. ` : ""}${added.length ? `Added: ${added.map((x2) => userName(s2, x2)).join(", ")}. ` : ""}${mails ? "The contact e-mails in General information follow the case contacts." : ""}`.trim()
    );
  });
  if (added.length) next = supplierMail(next, getCase(next, caseId), "invitation", by, at, void 0, { to: added });
  return toast(next, "success", "Case contacts updated.");
}
function saveConfig(s2, by, caseId, patch, at = nowIso()) {
  const c = getCase(s2, caseId);
  const blocked = supplierWriteGuard(s2, by, c, at, "the metadata answers");
  if (blocked) return blocked;
  const cur = c;
  const known = knownConfig(patch);
  const config = { ...cur.config, ...known, SF11: cur.config.SF11 };
  const changed = Object.keys(config).filter((k) => k in CONFIG_BY_ID && JSON.stringify(config[k]) !== JSON.stringify(cur.config[k]));
  if (!changed.length) return s2;
  const answeredBy = { ...cur.answeredBy, ...Object.fromEntries(changed.map((k) => [k, { by, at }])) };
  if (cur.phase === "metadata") return mapCase(s2, caseId, (x) => ({ ...x, config, answeredBy }));
  const derived = deriveScope(config, cur.ruleSetVersion, cur.templateVersion, s2.config);
  if (!isPart2(cur)) {
    const scope = derived.map((d2) => {
      const b = cur.scope.find((x) => x.sectionId === d2.sectionId);
      return b?.manual && d2.applicability !== "mandatory" ? b : { ...d2, manual: b?.manual };
    });
    const d = diffScope(cur.scope, scope);
    return mapCase(s2, caseId, (x) => {
      const y = withPrefills({ ...x, config, scope, answeredBy }, s2, at);
      if (!d.added.length && !d.removed.length && !d.changed.length) return y;
      const ch = d.changed.map((z) => `${codeOf(z.sectionId, cur, s2)} ${z.from} \u2192 ${z.to}`).join(", ");
      return audit(y, by, at, "Scope follows answers", `${changed.map((k) => CONFIG_BY_ID[k].code).join(", ")} answered. Opened: ${codesOf(d.added, cur, s2)}. Closed: ${codesOf(d.removed, cur, s2)}.${ch ? ` Changed: ${ch}.` : ""}${d.removed.length ? " Answers in closed sections are kept and come back if they open again." : ""}`);
    });
  }
  const g = growScope(cur.scope, derived);
  const grown = [...g.added, ...g.upgraded];
  const newOrigins = undefinedOrigins(config).filter((o) => !undefinedOrigins(cur.config).includes(o));
  const what = changed.map((k) => `${CONFIG_BY_ID[k].code}: ${showConfig(k, cur.config[k])} \u2192 ${showConfig(k, config[k])}`).join("; ");
  const slotsBefore = new Set(requestedDocuments(cur, s2.config).map((x) => x.key));
  const slotsAfter = requestedDocuments({ ...cur, config, scope: g.scope }, s2.config);
  const newSlots = slotsAfter.filter((x) => !slotsBefore.has(x.key));
  const docsLine = newSlots.length ? ` Documents now requested: ${newSlots.map((x) => `${x.doc} (${codeOf(x.sectionId, cur, s2)})`).join(", ")}.` : "";
  let next = mapCase(
    s2,
    caseId,
    (x) => audit(
      withPrefills({ ...x, config, scope: g.scope, answeredBy, ...newSlots.length ? { requestedDocs: storableSlots(slotsAfter) } : {} }, s2, at),
      by,
      at,
      "Changed metadata answer after completeness",
      `${what}. After the completeness confirmation the scope only grows. Added: ${codesOf(grown, cur, s2)}. Kept although no longer derived: ${codesOf(g.kept, cur, s2)}.${docsLine} The reviewers concerned are told.`
    )
  );
  const openLeads = /* @__PURE__ */ new Map();
  for (const id of grown) {
    const d = reviewDeptOf(s2.ownership, id);
    const tr = cur.reviews.find((r) => r.dept === d);
    if (tr && tr.status !== "completed") openLeads.set(d, [...openLeads.get(d) ?? [], id]);
  }
  for (const id of grown) next = activateTracks(next, caseId, [reviewDeptOf(s2.ownership, id)], at, `${codeOf(id, cur, s2)} was added by a changed metadata answer`);
  if (newOrigins.length) {
    next = mapCase(next, caseId, (y) => audit(y, "system", at, "Flagged for RMM", flagDetail(config)));
    next = activateTracks(next, caseId, ["RMM"], at, "An origin without rules was added after the completeness confirmation");
  }
  next = dataChangedMail(next, getCase(next, caseId), by, at, "GEN", `${grown.length ? `${what}. Sections added: ${codesOf(grown, cur, s2)}` : what}${newSlots.length ? `. Documents now requested: ${newSlots.map((x) => x.doc).join(", ")}` : ""}`);
  for (const [d, ids] of openLeads) {
    const c2 = getCase(next, caseId);
    const tr = c2.reviews.find((r) => r.dept === d);
    if (!tr || d === "RMM") continue;
    next = internalMail(
      next,
      [tr.assigneeId],
      {
        by,
        event: "data-changed",
        subject: `${c2.id}: ${codesOf(ids, cur, s2)} added to your ${DEPT_SHORT[d]} review`,
        body: `${codesOf(ids, cur, s2)} ${ids.length > 1 ? "were" : "was"} added by the supplier's changed answer (${what}).
An additional-section point is open in your name for ${c2.materialName} (${c2.id}); your review waits for the supplier's answer.`,
        link: reviewLink(c2.id, void 0, ids[0]),
        caseId: c2.id,
        sectionId: ids[0]
      },
      at
    );
  }
  for (const id of grown) {
    const dept = reviewDeptOf(s2.ownership, id);
    const sec = secOf(s2, cur, id);
    next = raiseOpenPoint(
      next,
      "system",
      caseId,
      {
        dept,
        kind: "additional-part",
        ref: { sectionId: id, label: `${sec?.code ?? id} \xB7 ${sec?.title ?? ""}` },
        question: `Please complete the additional section ${sec?.code ?? id}; it now applies because of your changed answer.`,
        justification: "Added by a changed metadata answer after the completeness confirmation",
        dueDate: new Date(Date.parse(at) + 14 * DAY_MS).toISOString(),
        responsibleId: getCase(next, caseId).reviews.find((r) => r.dept === dept)?.assigneeId
      },
      at
    );
  }
  return refreshRmes(next, caseId, at);
}
function extendScope(s2, by, caseId, sectionId, justification, at = nowIso()) {
  const c = getCase(s2, caseId);
  if (!c) return refuse(s2, "This case no longer exists.");
  if (!isPart2(c)) return refuse(s2, "Before the completeness confirmation the scope follows the supplier's metadata answers. Sections can be added during the review.");
  const denied = check(s2, by, "scope.extend", c);
  if (denied) return refuse(s2, denied);
  if (c.phase !== "review") return refuse(s2, "Every review has completed. Reopen your review to add a section.");
  const own = c.reviews.find((r) => r.dept === userOf(s2, by)?.dept);
  if (!own) return refuse(s2, `${DEPT_SHORT[userOf(s2, by).dept] ?? "Your department"} has no review task on ${c.id}.`);
  if (own.status === "completed") return refuse(s2, "Your review is completed. Reopen it to add a section.");
  if (!justification.trim()) return refuse(s2, "A justification is required to add a section.");
  const sc = scopeOf(c, sectionId);
  if (!sc) return refuse(s2, `${codeOf(sectionId, c, s2)} is not part of this questionnaire version.`);
  if (sc.applicability === "mandatory") return refuse(s2, `${codeOf(sectionId, c, s2)} is already mandatory for this case.`, "info");
  const asker = userOf(s2, by).dept;
  const lead = reviewDeptOf(s2.ownership, sectionId);
  let next = mapCase(
    s2,
    caseId,
    (x) => audit(
      withPrefills({ ...x, scope: x.scope.map((y) => y.sectionId === sectionId ? { ...y, applicability: "mandatory", manual: { by, at, justification }, addedLater: true, reason: `Added during the review: ${justification}` } : y) }, s2, at),
      by,
      at,
      "Extended scope",
      `${codeOf(sectionId, c, s2)} made mandatory. Justification: ${justification}`,
      sectionId
    )
  );
  next = activateTracks(next, caseId, [lead, asker], at, `${codeOf(sectionId, c, s2)} was added`);
  next = raiseOpenPoint(
    next,
    by,
    caseId,
    { dept: asker, kind: "additional-part", ref: { sectionId, label: `${codeOf(sectionId, c, s2)} \xB7 ${secOf(s2, c, sectionId)?.title ?? ""}` }, question: `Please complete the additional section ${codeOf(sectionId, c, s2)}.`, justification, dueDate: new Date(Date.parse(at) + 14 * DAY_MS).toISOString() },
    at
  );
  return toast(refreshRmes(next, caseId, at), "success", `${codeOf(sectionId, c, s2)} added. The supplier has a task to complete it.`);
}
function part2Change(s2, by, caseId, at, sectionId, action, what) {
  let next = mapCase(s2, caseId, (x) => audit(x, by, at, action, what, sectionId));
  next = reopenOwners(next, caseId, at, sectionId);
  return dataChangedMail(next, getCase(next, caseId), by, at, sectionId, what);
}
function reopenOwners(s2, caseId, at, sectionId) {
  const c = getCase(s2, caseId);
  if (!c || c.phase !== "review") return s2;
  const depts = c.reviews.filter((r) => r.status === "completed" && ownsSection(s2, r.dept, sectionId)).map((r) => r.dept);
  if (!depts.length) return s2;
  return activateTracks(s2, caseId, depts, at, `The supplier changed ${joinSections(s2, c, [sectionId])} after your review`);
}
function joinSections(s2, c, sectionIds) {
  const names = sectionIds.map((id) => {
    const sec = secOf(s2, c, id);
    return sec?.kind === "basic" ? sec.title : codeOf(id, c, s2);
  });
  return names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}` : names[0] ?? "";
}
function setAnswer(s2, by, caseId, fieldId, value, at = nowIso()) {
  const c = getCase(s2, caseId);
  const label = fieldIn(s2, c, fieldId)?.label ?? fieldId;
  const blocked = supplierWriteGuard(s2, by, c, at, `the answer \u201C${label}\u201D`);
  if (blocked) return blocked;
  if (isSetByBdf(c, fieldId)) return refuse(s2, `${label} is set by Beiersdorf at case start and can't be changed in the questionnaire. If it is wrong, tell ${userName(s2, c.ownerId)}.`);
  const source = fieldIn(s2, c, fieldId)?.derivedFrom;
  if (source) {
    const src = fieldIn(s2, c, source);
    return refuse(s2, `${label} is filled in from ${src?.label ?? source}${src ? ` (${codeOf(src.sectionId, c, s2)})` : ""}. Change it there.`);
  }
  const prev = c.answers[fieldId];
  if (JSON.stringify(prev ?? null) === JSON.stringify(value ?? null)) return s2;
  const next = mapCase(s2, caseId, (x) => ({ ...x, answers: { ...x.answers, [fieldId]: value }, answeredBy: { ...x.answeredBy, [fieldId]: { by, at } } }));
  if (!isPart2(c)) return next;
  const sectionId = fieldIn(s2, c, fieldId)?.sectionId ?? "GEN";
  return refreshRmes(part2Change(next, by, caseId, at, sectionId, "Changed answer after completeness", `${label}: \u201C${short(prev ?? "\u2014")}\u201D \u2192 \u201C${short(value ?? "\u2014")}\u201D`), caseId, at);
}
function setComponents(s2, by, caseId, rows, at = nowIso()) {
  const c = getCase(s2, caseId);
  const blocked = supplierWriteGuard(s2, by, c, at, "the composition table (K2.1)");
  if (blocked) return blocked;
  const cur = c;
  if (JSON.stringify(cur.components) === JSON.stringify(rows)) return s2;
  const asked = cur.openPoints.filter((p) => p.status !== "closed" && p.ref.rowId && !rows.some((r) => r.id === p.ref.rowId));
  if (asked.length) return refuse(s2, `Beiersdorf asked about this component (${asked.map((p) => p.ref.label).join(", ")}). Answer the question instead of removing the row.`);
  const next = mapCase(s2, caseId, (x) => ({ ...x, components: rows, answeredBy: { ...x.answeredBy, "K2.1:components": { by, at } } }));
  if (!isPart2(cur)) return next;
  const added = rows.filter((r) => !cur.components.some((o) => o.id === r.id));
  const removed = cur.components.filter((o) => !rows.some((r) => r.id === o.id));
  const changed = rows.filter((r) => {
    const o = cur.components.find((x) => x.id === r.id);
    return o && JSON.stringify(o) !== JSON.stringify(r);
  });
  const what = [added.length && `added ${added.map((r) => r.inci || r.id).join(", ")}`, removed.length && `removed ${removed.map((r) => r.inci || r.id).join(", ")}`, changed.length && `changed ${changed.map((r) => r.inci || r.id).join(", ")}`].filter(Boolean).join("; ");
  return part2Change(next, by, caseId, at, "K2.1", "Changed composition after completeness", `Composition table: ${what || "rows reordered"}`);
}
function setJustification(s2, by, caseId, key, text, at = nowIso()) {
  const c = getCase(s2, caseId);
  const slot = isSlotKey(key) && c ? slotName(c, key, s2.config) : void 0;
  const label = slot ?? fieldIn(s2, c, key)?.label ?? codeOf(key, c, s2);
  const blocked = supplierWriteGuard(s2, by, c, at, `the justification for \u201C${label}\u201D`);
  if (blocked) return blocked;
  const prev = c.justifications[key] ?? "";
  if (prev === (text.trim() ? text : "")) return s2;
  const next = mapCase(s2, caseId, (x) => {
    const j = { ...x.justifications };
    if (text.trim()) j[key] = text;
    else delete j[key];
    return { ...x, justifications: j, answeredBy: { ...x.answeredBy, [key]: { by, at } } };
  });
  if (!isPart2(c)) return next;
  const sectionId = isSlotKey(key) ? slotSection(c, key, s2.config) ?? "GEN" : fieldIn(s2, c, key)?.sectionId ?? key;
  return part2Change(next, by, caseId, at, sectionId, "Changed justification after completeness", `Justification for ${label}${slot ? " (requested document)" : ""}: \u201C${short(prev || "\u2014")}\u201D \u2192 \u201C${short(text || "\u2014")}\u201D`);
}
function uploadDocument(s2, by, caseId, doc, at = nowIso(), quiet = false) {
  const c = getCase(s2, caseId);
  const blocked = supplierWriteGuard(s2, by, c, at, `the documents (${doc.name})`);
  if (blocked) return { state: blocked, docId: "" };
  if (!doc.name.trim()) return { state: refuse(s2, "The document has no file name."), docId: "" };
  const cur = c;
  const slot = isSlotKey(doc.fieldId) ? requestedDocuments(cur, s2.config).find((x) => x.key === doc.fieldId) : void 0;
  if (isSlotKey(doc.fieldId) && !slot && !cur.documents.some((d) => d.fieldId === doc.fieldId)) return { state: refuse(s2, "This document is not requested for this case."), docId: "" };
  if (slot) doc = { ...doc, sectionId: slot.sectionId };
  const prior = cur.documents.filter((d) => d.fieldId && d.fieldId === doc.fieldId);
  const docId = `${caseId}-d${cur.documents.length + 1}`;
  const where = `${codeOf(doc.sectionId, cur, s2)}${doc.fieldId ? ` \u203A ${isSlotKey(doc.fieldId) ? `requested document ${slotName(cur, doc.fieldId, s2.config)}` : fieldIn(s2, cur, doc.fieldId)?.label ?? doc.fieldId}` : ""}`;
  const fileAnswer = !!doc.fieldId && !isSlotKey(doc.fieldId) && (fieldIn(s2, cur, doc.fieldId)?.type ?? "file") === "file";
  let state = mapCase(s2, caseId, (x) => {
    const y = {
      ...x,
      documents: [...x.documents, { id: docId, name: doc.name, kind: doc.kind, sectionId: doc.sectionId, fieldId: doc.fieldId, version: prior.length + 1, uploadedBy: by, uploadedAt: at, sizeKb: doc.sizeKb ?? 180 + x.documents.length * 137 % 900 }],
      answers: fileAnswer ? { ...x.answers, [doc.fieldId]: docId } : x.answers,
      answeredBy: fileAnswer ? { ...x.answeredBy, [doc.fieldId]: { by, at } } : x.answeredBy
    };
    return audit(y, by, at, "Uploaded document", `${doc.name} at ${where}.${prior.length ? ` Added next to ${prior.map((p) => p.name).join(", ")}.` : ""}`, doc.sectionId);
  });
  if (isPart2(cur)) {
    state = reopenOwners(state, caseId, at, doc.sectionId);
    if (!quiet) state = dataChangedMail(state, getCase(state, caseId), by, at, doc.sectionId, `new document ${doc.name} at ${where}`);
  }
  return { state, docId };
}
function rmesCriteria(c) {
  const v = c.reviewVersion;
  const has = (sec) => c.scope.some((x) => x.sectionId === sec && x.applicability !== "na");
  const list = [
    { id: "R-A1", part: "A", dept: "REG", title: "INCI and CAS of every component are consistent", source: { sectionId: "K2.1", version: v, label: "K2.1 composition table" } },
    { id: "R-A2", part: "A", dept: "REG", title: "EU REACH registration status listed for each substance", source: { sectionId: "A10", version: v, label: "Annex 10" } },
    { id: "R-B1", part: "B", dept: "REG", title: "Status under Reg. 1223/2009 Annexes III\u2013VI", source: { sectionId: "K6.5", version: v, label: "K6.5" } },
    { id: "R-B2", part: "B", dept: "REG", title: "Animal testing statement available (Art. 11(2)(e))", source: { sectionId: "K6.7", version: v, label: "K6.7" } },
    { id: "S-A1", part: "A", dept: "SAF", title: "Byproducts and contaminants within BDF limits", source: { sectionId: "K2.2", fieldId: "FLD-A14-101", version: v, label: "K2.2 heavy metals" } },
    { id: "S-B1", part: "B", dept: "SAF", title: "Toxicological profile available and plausible", source: { sectionId: "K4.1", version: v, label: "K4.1" } },
    { id: "S-C1", part: "C", dept: "SAF", title: "Nanomaterial status plausible, justification given", source: { sectionId: "K6.9", version: v, label: "K6.9" } }
  ];
  if (has("A4")) list.push({ id: "S-C2", part: "C", dept: "SAF", title: "MOAH value assessed against BDF threshold", source: { sectionId: "A4", fieldId: "FLD-A4-101", version: v, label: "Annex 4 MOAH" } });
  if (has("A1")) list.push({ id: "R-C1", part: "C", dept: "REG", title: "Pesticide analysis available or justified", source: { sectionId: "A1", fieldId: "FLD-A1-201", version: v, label: "Annex 1 pesticides" } });
  if ((c.config.SF11 ?? []).some((m) => m !== "EU")) list.push({ id: "R-D1", part: "D", dept: "REG", title: "Listed in the chemical inventories of all target markets", source: { sectionId: "A13", version: v, label: "Annex 13" } });
  list.push({ id: "S-D1", part: "D", dept: "SAF", title: "Overall safety conclusion documented", source: { sectionId: "K4.1", version: v, label: "Safety summary" } });
  const hm = HEAVY_METAL_LIMITS.map((m) => ({ m, v: c.answers[m.fieldId] })).filter((x) => typeof x.v === "number");
  const s1 = list.find((x) => x.id === "S-A1");
  if (hm.length) {
    const worst = hm.reduce((a, b) => b.v / b.m.limit > a.v / a.m.limit ? b : a);
    s1.limit = { substance: worst.m.substance, value: worst.v, unit: worst.m.unit, limit: worst.m.limit, limitSetVersion: LIMIT_SET_VERSION, pass: worst.v <= worst.m.limit };
  }
  const moah = c.answers["FLD-A4-101"];
  const s2 = list.find((x) => x.id === "S-C2");
  if (s2 && typeof moah === "number") s2.limit = { substance: "MOAH", value: moah, unit: "mg/kg", limit: 1, limitSetVersion: LIMIT_SET_VERSION, pass: moah <= 1 };
  const tox = list.find((x) => x.id === "S-B1");
  tox.aiSuggestion = "AI suggestion: the uploaded SDS lists acute oral toxicity LD50 > 2000 mg/kg (rat) on page 4; no skin sensitisation data found. Please verify.";
  return list;
}
function refreshRmes(s2, caseId, at) {
  const c = getCase(s2, caseId);
  if (!c?.rmes || !isPart2(c)) return s2;
  const fresh = rmesCriteria(c);
  const stored = c.rmes.criteria;
  const criteria = [
    ...stored.map((old) => {
      const f = fresh.find((x) => x.id === old.id);
      if (!f) return old;
      const y = { ...old };
      if (f.limit) y.limit = f.limit;
      else delete y.limit;
      return y;
    }),
    ...fresh.filter((f) => !stored.some((o) => o.id === f.id))
  ];
  const added = criteria.filter((x) => !stored.some((o) => o.id === x.id));
  if (JSON.stringify(criteria) === JSON.stringify(stored)) return s2;
  const next = mapCase(s2, caseId, (x) => {
    const y = { ...x, rmes: { ...x.rmes, criteria } };
    return added.length ? audit(y, "system", at, "Updated RMES record", `Criteria added because the scope grew: ${added.map((a) => `${a.id} ${a.title}`).join("; ")}.`) : y;
  });
  const reopen = [...new Set(added.map((a) => a.dept))].filter((d) => c.reviews.find((r) => r.dept === d)?.status === "completed");
  if (!reopen.length) return next;
  return activateTracks(next, caseId, reopen, at, `RMES criterion ${added.filter((a) => reopen.includes(a.dept)).map((a) => a.id).join(", ")} now applies`);
}
var COMPLETENESS_CONFIRMED = "Completeness confirmed. Beiersdorf can now review your questionnaire. You can still correct data and add documents until Beiersdorf requests your final release.";
function activateTracks(s2, caseId, depts, at, why) {
  const c0 = getCase(s2, caseId);
  const activated = [];
  const reopened = [];
  let y = c0;
  for (const d of new Set(depts)) {
    const tr = y.reviews.find((r) => r.dept === d);
    if (!tr) {
      y = audit({ ...y, reviews: [...y.reviews, { dept: d, status: "in-review", assigneeId: assigneeFor(s2, y, d), startedAt: at }] }, "system", at, "Activated review", `${DEPT_SHORT[d]} review activated: ${why}.`);
      activated.push(d);
    } else if (tr.status === "completed") {
      y = audit({ ...y, reviews: y.reviews.map((r) => r.dept === d ? { ...r, status: "reopened", completedAt: void 0, lastCompletedAt: r.completedAt ?? r.lastCompletedAt } : r) }, "system", at, `Reopened ${DEPT_SHORT[d]} review`, `${why}.`);
      reopened.push(d);
    }
  }
  if (!y.rmes && y.reviews.some((r) => r.dept === "SAF" || r.dept === "REG")) {
    y = audit({ ...y, rmes: { createdAt: at, reviewVersion: y.reviewVersion, criteria: rmesCriteria(y), findings: [] } }, "system", at, "Created RMES record", `Safety or Regulatory joined the review: ${why}.`);
  }
  const withdrawn = y.phase === "final-release" && y.reviews.some((r) => r.status !== "completed");
  if (withdrawn) y = audit(setPhase(y, "review", at), "system", at, "Final-release request withdrawn", `${why}; the release request is sent again once every review has completed.`);
  let next = mapCase(s2, caseId, () => y);
  if (activated.length) next = reviewAssignedMail(next, y, activated, "system", at, `A review task was added: ${why}.`);
  if (reopened.length) next = reviewAssignedMail(next, y, reopened, "system", at, `Your completed review was reopened: ${why}.`);
  if (withdrawn) next = supplierMail(next, y, "release-withdrawn", "system", at);
  return next;
}
function confirmCompleteness(s2, by, caseId, at = nowIso()) {
  const c = getCase(s2, caseId);
  if (!c) return refuse(s2, "This request no longer exists.");
  if (isClosed(c)) return supplierWriteGuard(s2, by, c, at, "the completeness confirmation");
  if (c.phase !== "supplier-input") return refuse(s2, "Completeness can only be confirmed while the supplier fills in the CIQ.", "info");
  const denied = check(s2, by, "ciq.confirm", c);
  if (denied) return refuse(s2, denied);
  const blockers = completenessBlockers(c, s2.config);
  if (blockers.length) return refuse(s2, `${blockers.length} item(s) must be completed or justified first.`);
  const depts = departmentsForScope(c.scope, s2.ownership);
  const who = userOf(s2, by);
  let y = { ...c, reviewVersion: c.reviewVersion + 1 };
  y = setPhase(y, "review", at);
  y = confirm(s2, y, by, at, "completeness", void 0, "Completeness confirmation: data and documents provided from the supplier's point of view. Not a Beiersdorf approval.");
  y = {
    ...y,
    reviews: [{ dept: "RMM", status: "in-review", assigneeId: assigneeFor(s2, c, "RMM"), startedAt: at }, ...depts.map((d) => ({ dept: d, status: "in-review", assigneeId: assigneeFor(s2, c, d), startedAt: at }))],
    informed: ["CUS", "LEG"]
  };
  y = { ...y, rmes: depts.some((d) => d === "SAF" || d === "REG") ? { createdAt: at, reviewVersion: y.reviewVersion, criteria: rmesCriteria(y), findings: [] } : void 0 };
  const slots = requestedDocuments(c, s2.config);
  if (slots.length) y = { ...y, requestedDocs: storableSlots(slots) };
  y = audit(y, by, at, "Confirmed completeness", `Confirmed by ${who?.name ?? by}${who?.email ? ` <${who.email}>` : ""}. Part 1 completed; the review starts.`);
  y = audit(y, "system", at, "Activated reviews", `CIQ assigned to RMM (${userName(s2, c.ownerId)}) for the whole-CIQ review; review tasks created for ${depts.map((d) => DEPT_SHORT[d]).join(", ") || "no department"}; Customs and Legal informed.${y.rmes ? " One RMES record created." : ""}`);
  if (rmmFlags(y).length) y = audit(y, "system", at, "Flagged for RMM", flagDetail(y.config));
  let next = mapCase(s2, caseId, () => y);
  next = reviewAssignedMail(next, y, y.reviews.map((r) => r.dept), "system", at, `${who?.name ?? "The supplier"} confirmed completeness of the CIQ.`);
  for (const d of ["CUS", "LEG"]) {
    const sec = INFORMED_SECTION[d];
    next = internalMail(
      next,
      deptUserIds(next, d),
      {
        by: "system",
        event: "informed",
        subject: `${c.id}: for your information`,
        body: `The supplier confirmed completeness of the CIQ for ${c.materialName} (${c.id}). ${DEPT_SHORT[d]} is informed and can read the case; the link opens ${sec} \xB7 ${secOf(s2, c, sec)?.title ?? ""}.`,
        link: `${caseLink(c.id, "questionnaire")}&s=${sec}`,
        caseId: c.id,
        sectionId: sec
      },
      at
    );
  }
  return toast(next, "success", COMPLETENESS_CONFIRMED);
}
function raiseOpenPoint(s2, by, caseId, input, at = nowIso()) {
  const c = getCase(s2, caseId);
  if (!c) return refuse(s2, "This case no longer exists.");
  if (!input.question.trim()) return refuse(s2, "A query needs a question.");
  if (c.phase !== "review") return refuse(s2, c.phase === "final-release" ? "Every review has completed. Reopen your review to ask the supplier." : "Questions to the supplier are raised during the review.");
  if (by !== "system") {
    const denied = check(s2, by, "op.raise", c, { dept: input.dept });
    if (denied) return refuse(s2, denied);
    if (c.reviews.find((r) => r.dept === input.dept)?.status === "completed") return refuse(s2, "Your review is completed. Reopen it to ask the supplier.");
  }
  if (scopeOf(c, input.ref.sectionId)?.applicability === "na") return refuse(s2, `${codeOf(input.ref.sectionId, c, s2)} does not apply to this case.`);
  if (!input.dueDate || !notBeforeToday(input.dueDate, at)) return refuse(s2, "The due date must be today or later.");
  const responsibleId = input.responsibleId ?? by;
  const resp = userOf(s2, responsibleId);
  if (by !== "system" && (!resp || resp.side !== "internal" || resp.dept !== input.dept || !isActiveUser(resp))) return refuse(s2, `The responsible person must be a Beiersdorf user of ${DEPT_SHORT[input.dept]}.`);
  const n = c.openPoints.length + 1;
  const op = {
    id: `OP-${c.id.slice(-4)}-${String(n).padStart(2, "0")}`,
    caseId,
    dept: input.dept,
    kind: input.kind,
    ref: input.ref,
    question: input.question.trim(),
    justification: input.justification,
    responsibleId,
    dueDate: input.dueDate,
    status: "open",
    createdAt: at,
    createdBy: by,
    rounds: 1,
    thread: [{ id: `${c.id}-m${n}-1`, at, by, side: "internal", text: input.question.trim(), action: "raised" }]
  };
  const ops = [...c.openPoints, op];
  let y = { ...c, openPoints: ops, reviews: retrack(c.reviews, ops) };
  y = audit(y, by, at, input.kind === "document-request" ? "Requested document" : input.kind === "additional-part" ? "Activated additional section" : "Raised query", `${op.id} on ${input.ref.label}: ${op.question} Due ${fmtDate(op.dueDate)}; responsible ${userName(s2, responsibleId)}.`, input.ref.sectionId);
  const next = mapCase(s2, caseId, () => y);
  return supplierMail(next, y, "op-raised", by, at, op);
}
function supplierRespond(s2, by, caseId, opId, input, at = nowIso()) {
  const c0 = getCase(s2, caseId);
  if (!c0) return refuse(s2, "This request no longer exists.");
  if (isClosed(c0)) return supplierWriteGuard(s2, by, c0, at, `the answer to ${opId}`);
  const denied = check(s2, by, "op.respond", c0, { opId });
  if (denied) return refuse(s2, denied);
  if (!input.text.trim()) return refuse(s2, input.cannotProvide ? "Please explain why it cannot be provided." : "Please write a short answer.");
  const op0 = c0.openPoints.find((p) => p.id === opId);
  let state = s2;
  let documentId;
  if (input.documentName) {
    const r = uploadDocument(state, by, caseId, { name: input.documentName, kind: "Analysis", sectionId: op0.ref.sectionId, fieldId: op0.ref.fieldId, sizeKb: input.sizeKb }, at, true);
    if (!r.docId) return r.state;
    state = r.state;
    documentId = r.docId;
  }
  state = mapCase(state, caseId, (c) => {
    const ops = c.openPoints.map(
      (p) => p.id === opId ? { ...p, status: "in-progress", thread: [...p.thread, { id: `${p.id}-m${p.thread.length + 1}`, at, by, side: "supplier", text: input.text.trim(), action: input.cannotProvide ? "cannot-provide" : "answered", documentId }] } : p
    );
    const y = { ...c, openPoints: ops, reviews: retrack(c.reviews, ops) };
    return audit(y, by, at, input.cannotProvide ? "Justified non-delivery" : "Answered query", `${opId}: ${input.text.trim()}${input.documentName ? ` (document ${input.documentName})` : ""}`, op0.ref.sectionId);
  });
  const c1 = getCase(state, caseId);
  return answeredMail(state, c1, c1.openPoints.find((p) => p.id === opId), by, at, input.text, !!input.cannotProvide, input.documentName);
}
function reviewResponse(s2, by, caseId, opId, decision, text, at = nowIso()) {
  const c0 = getCase(s2, caseId);
  if (!c0) return refuse(s2, "This case no longer exists.");
  if (isClosed(c0)) return refuse(s2, "The case is closed.");
  const denied = check(s2, by, "op.decide", c0, { opId });
  if (denied) return refuse(s2, denied);
  const op0 = c0.openPoints.find((p) => p.id === opId);
  if (op0.status === "closed") return refuse(s2, "This open point is already closed.", "info");
  if (op0.status === "open") return refuse(s2, "The supplier has not answered yet. You can edit or close the point instead.");
  if (decision !== "accept" && !text.trim()) return refuse(s2, "Please give a short reason.");
  let next = mapCase(s2, caseId, (c) => {
    const ops = c.openPoints.map((p) => {
      if (p.id !== opId) return p;
      const msg = { id: `${p.id}-m${p.thread.length + 1}`, at, by, side: "internal", text: text.trim() || "Accepted.", action: decision === "return" ? "returned" : "accepted" };
      if (decision === "accept") return { ...p, status: "closed", outcome: "accepted", closedAt: at, closedBy: by, thread: [...p.thread, msg] };
      if (decision === "not-accepted") return { ...p, status: "closed", outcome: "not-accepted", closedAt: at, closedBy: by, thread: [...p.thread, { ...msg, action: "note" }] };
      const fresh = new Date(Math.max(Date.parse(p.dueDate), Date.parse(at) + 7 * DAY_MS)).toISOString();
      return { ...p, status: "open", rounds: p.rounds + 1, dueDate: fresh, thread: [...p.thread, { ...msg, newRound: true }] };
    });
    let y = { ...c, openPoints: ops, reviews: retrack(c.reviews, ops) };
    y = audit(y, by, at, decision === "accept" ? "Accepted answer" : decision === "return" ? "Returned answer to supplier" : "Closed as not accepted", `${opId}${text.trim() ? `: ${text.trim()}` : ""}`, op0.ref.sectionId);
    if (decision === "not-accepted" && c.rmes && (op0.dept === "SAF" || op0.dept === "REG")) {
      y = { ...y, rmes: { ...c.rmes, findings: [...c.rmes.findings, { id: `${opId}-F`, criterionId: "", dept: op0.dept, text: `Not accepted: ${op0.question}`, blocking: false, status: "closed", openPointId: opId }] } };
    }
    return y;
  });
  const c1 = getCase(next, caseId);
  next = supplierMail(next, c1, decision === "accept" ? "op-accepted" : decision === "return" ? "op-returned" : "op-closed", by, at, c1.openPoints.find((p) => p.id === opId));
  return next;
}
function editOpenPoint(s2, by, caseId, opId, patch, at = nowIso()) {
  const c = getCase(s2, caseId);
  if (!c) return refuse(s2, "This case no longer exists.");
  if (isClosed(c)) return refuse(s2, "The case is closed.");
  const denied = check(s2, by, "op.edit", c, { opId });
  if (denied) return refuse(s2, denied);
  const op = c.openPoints.find((p) => p.id === opId);
  if (op.status === "closed") return refuse(s2, "A closed open point cannot be edited.");
  if (patch.question !== void 0 && !patch.question.trim()) return refuse(s2, "The question cannot be empty.");
  if (patch.dueDate !== void 0 && !notBeforeToday(patch.dueDate, at)) return refuse(s2, "The due date must be today or later.");
  if (patch.responsibleId !== void 0) {
    const r = userOf(s2, patch.responsibleId);
    if (!r || r.side !== "internal" || r.dept !== op.dept || !isActiveUser(r)) return refuse(s2, `The responsible person must be a Beiersdorf user of ${DEPT_SHORT[op.dept]}.`);
  }
  const edits = [];
  const add = (field, from, to) => from !== to && edits.push({ at, by, field, from, to });
  if (patch.question !== void 0) add("question", op.question, patch.question.trim());
  if (patch.justification !== void 0) add("justification", op.justification, patch.justification.trim());
  if (patch.dueDate !== void 0 && fmtDate(patch.dueDate) !== fmtDate(op.dueDate)) add("dueDate", op.dueDate, patch.dueDate);
  if (patch.responsibleId !== void 0) add("responsibleId", op.responsibleId, patch.responsibleId);
  if (!edits.length) return refuse(s2, "Nothing changed.", "info");
  const questionChanged = edits.some((e) => e.field === "question");
  const newRound = questionChanged && op.status === "in-progress";
  const parts = edits.map(
    (e) => e.field === "question" ? `Question changed from \u201C${e.from}\u201D to \u201C${e.to}\u201D.` : e.field === "justification" ? `Justification changed to \u201C${e.to}\u201D.` : e.field === "dueDate" ? `Due date changed from ${fmtDate(e.from)} to ${fmtDate(e.to)}.` : `Responsible person changed from ${userName(s2, e.from)} to ${userName(s2, e.to)}.`
  );
  let next = mapCase(s2, caseId, (x) => {
    const ops = x.openPoints.map((p) => {
      if (p.id !== opId) return p;
      const msg = { id: `${p.id}-m${p.thread.length + 1}`, at, by, side: "internal", text: parts.join(" "), action: "edited", ...newRound ? { newRound: true } : {} };
      return {
        ...p,
        question: patch.question?.trim() ?? p.question,
        justification: patch.justification?.trim() ?? p.justification,
        dueDate: patch.dueDate ?? p.dueDate,
        responsibleId: patch.responsibleId ?? p.responsibleId,
        status: newRound ? "open" : p.status,
        rounds: newRound ? p.rounds + 1 : p.rounds,
        edits: [...p.edits ?? [], ...edits],
        thread: [...p.thread, msg]
      };
    });
    return audit({ ...x, openPoints: ops, reviews: retrack(x.reviews, ops) }, by, at, "Edited open point", `${opId}: ${parts.join(" ")}${newRound ? " The supplier answers again (new round)." : ""}`, op.ref.sectionId);
  });
  const c1 = getCase(next, caseId);
  next = supplierMail(next, c1, "op-edited", by, at, c1.openPoints.find((p) => p.id === opId), { newRound });
  return toast(next, "success", newRound ? "Open point changed and sent to the supplier again." : "Open point changed. The supplier sees the change.");
}
function closeOpenPoint(s2, by, caseId, opId, reason, at = nowIso()) {
  const c = getCase(s2, caseId);
  if (!c) return refuse(s2, "This case no longer exists.");
  if (isClosed(c)) return refuse(s2, "The case is closed.");
  const denied = check(s2, by, "op.close", c, { opId });
  if (denied) return refuse(s2, denied);
  const op = c.openPoints.find((p) => p.id === opId);
  if (op.status === "closed") return refuse(s2, "This open point is already closed.", "info");
  if (!reason.trim()) return refuse(s2, "Please give a short internal reason for closing the point.");
  let next = mapCase(s2, caseId, (x) => {
    const ops = x.openPoints.map(
      (p) => p.id === opId ? { ...p, status: "closed", outcome: "withdrawn", closedAt: at, closedBy: by, closeReason: reason.trim(), thread: [...p.thread, { id: `${p.id}-m${p.thread.length + 1}`, at, by, side: "internal", text: "Closed by Beiersdorf: no answer needed.", action: "withdrawn" }] } : p
    );
    return audit({ ...x, openPoints: ops, reviews: retrack(x.reviews, ops) }, by, at, "Closed open point (no answer needed)", `${opId} on ${op.ref.label} closed by the raiser. Internal reason: ${reason.trim()}`, op.ref.sectionId);
  });
  const c1 = getCase(next, caseId);
  next = supplierMail(next, c1, "op-closed", by, at, c1.openPoints.find((p) => p.id === opId));
  return toast(next, "success", "Open point closed. The supplier is told no answer is needed.");
}
function rmesGuard(s2, by, c, dept) {
  if (!c) return "This case no longer exists.";
  if (c.phase !== "review") return "The internal evaluation is recorded during the review.";
  if (!c.rmes) return "This case has no RMES record.";
  const denied = check(s2, by, "rmes.record", c, { dept });
  if (denied) return denied;
  if (c.reviews.find((r) => r.dept === dept)?.status === "completed") return `The ${DEPT_SHORT[dept]} review is completed. Reopen it to change the evaluation.`;
  return null;
}
function recordCriterion(s2, by, caseId, criterionId, result, comment, at = nowIso()) {
  const c = getCase(s2, caseId);
  const cr = c?.rmes?.criteria.find((x) => x.id === criterionId);
  if (!cr) return refuse(s2, "This RMES criterion no longer exists.");
  const blocked = rmesGuard(s2, by, c, cr.dept);
  if (blocked) return refuse(s2, blocked);
  if ((result === "negative" || result === "implausible" || result === "na") && !comment.trim()) return refuse(s2, "A comment is required for a negative, implausible or N.A. result.");
  return mapCase(
    s2,
    caseId,
    (x) => audit({ ...x, rmes: { ...x.rmes, criteria: x.rmes.criteria.map((y) => y.id === criterionId ? { ...y, result, comment, by, at } : y) } }, by, at, "Recorded RMES result", `${criterionId}: ${result}${comment ? ` \u2014 ${comment}` : ""}.`)
  );
}
function addFinding(s2, by, caseId, criterionId, text, blocking, at = nowIso()) {
  const c = getCase(s2, caseId);
  const cr = c?.rmes?.criteria.find((x) => x.id === criterionId);
  if (!cr) return refuse(s2, "This RMES criterion no longer exists.");
  const blocked = rmesGuard(s2, by, c, cr.dept);
  if (blocked) return refuse(s2, blocked);
  if (!text.trim()) return refuse(s2, "Describe the finding.");
  return mapCase(s2, caseId, (x) => {
    const id = `${x.id.slice(-4)}-F${x.rmes.findings.length + 1}`;
    return audit({ ...x, rmes: { ...x.rmes, findings: [...x.rmes.findings, { id, criterionId, dept: cr.dept, text, blocking, status: "open" }] } }, by, at, "Added finding", `${id} (${blocking ? "blocking" : "non-blocking"}) on ${criterionId}: ${text}`);
  });
}
function findingToQuery(s2, by, caseId, findingId, question, dueDate, at = nowIso()) {
  const c = getCase(s2, caseId);
  const f = c?.rmes?.findings.find((x) => x.id === findingId);
  const cr = c?.rmes?.criteria.find((x) => x.id === f?.criterionId);
  if (!c || !f || !cr) return refuse(s2, "This finding no longer exists.");
  const next = raiseOpenPoint(s2, by, caseId, { dept: f.dept, kind: "finding", ref: { sectionId: cr.source.sectionId, fieldId: cr.source.fieldId, label: cr.source.label }, question, justification: "Needed for the internal evaluation", dueDate }, at);
  const after = getCase(next, caseId);
  if (after.openPoints.length === c.openPoints.length) return next;
  const op = after.openPoints.at(-1);
  return mapCase(next, caseId, (x) => x.rmes ? { ...x, rmes: { ...x.rmes, findings: x.rmes.findings.map((y) => y.id === findingId ? { ...y, openPointId: op.id } : y) } } : x);
}
function closeFinding(s2, by, caseId, findingId, at = nowIso()) {
  const c = getCase(s2, caseId);
  const f = c?.rmes?.findings.find((x) => x.id === findingId);
  if (!f) return refuse(s2, "This finding no longer exists.");
  const blocked = rmesGuard(s2, by, c, f.dept);
  if (blocked) return refuse(s2, blocked);
  return mapCase(s2, caseId, (x) => audit({ ...x, rmes: { ...x.rmes, findings: x.rmes.findings.map((y) => y.id === findingId ? { ...y, status: "closed" } : y) } }, by, at, "Closed finding", findingId));
}
function rmesDecision(s2, by, caseId, dept, decision, reason, at = nowIso()) {
  const c = getCase(s2, caseId);
  if (!c) return refuse(s2, "This case no longer exists.");
  if (userOf(s2, by)?.dept !== dept) return refuse(s2, `Only ${DEPT_SHORT[dept]} can give the ${DEPT_SHORT[dept]} decision.`);
  const blocked = rmesGuard(s2, by, c, dept);
  if (blocked) return refuse(s2, blocked);
  if (decision === "rejected" && !reason.trim()) return refuse(s2, "A rejection reason is mandatory.");
  const pending = c.rmes?.criteria.filter((x) => x.dept === dept && !x.result) ?? [];
  if (pending.length) return refuse(s2, `${pending.length} RMES criteria still have no result.`);
  if (c.rmes?.findings.some((f) => f.dept === dept && f.status === "open") && decision === "approved") return refuse(s2, "A finding is still open. Close it, or ask the supplier about it, first.");
  let next = mapCase(s2, caseId, (x) => audit({ ...x, reviews: x.reviews.map((r) => r.dept === dept ? { ...r, decision, decisionReason: reason } : r) }, by, at, `Final ${DEPT_SHORT[dept]} decision`, `${decision === "approved" ? "Approved" : "Rejected"}${reason ? ` \u2014 ${reason}` : ""}`));
  if (decision === "rejected") {
    next = mapCase(next, caseId, (x) => audit(x, "system", at, "Flagged for RMM", `${DEPT_SHORT[dept]} recorded an internal Rejected decision. RMM agrees with ${DEPT_SHORT[dept]} whether to cancel the case or to continue to the final release.`));
    if (getCase(next, caseId).reviews.find((r) => r.dept === "RMM")?.status === "completed") next = activateTracks(next, caseId, ["RMM"], at, `${DEPT_SHORT[dept]} recorded an internal Rejected decision`);
  }
  return next;
}
function completeReview(s2, by, caseId, dept, at = nowIso(), opts = {}) {
  const c = getCase(s2, caseId);
  if (!c) return refuse(s2, "This case no longer exists.");
  if (c.phase !== "review") return refuse(s2, "Reviews can only be completed while the case is in review.");
  const track = c.reviews.find((r) => r.dept === dept);
  if (!track) return refuse(s2, `${DEPT_SHORT[dept]} has no review task on ${caseId}.`);
  const denied = check(s2, by, "review.complete", c, { dept });
  if (denied) return refuse(s2, denied);
  if (track.status === "completed") return refuse(s2, `The ${DEPT_SHORT[dept]} review is already completed.`, "info");
  const blockers = reviewBlockers(c, dept);
  if (blockers.length) return refuse(s2, `Cannot complete: ${blockers.length} open item(s). ${blockers[0]}`);
  const pendingRejection = dept === "RMM" ? rejectionNeedsRmmChoice(c) : [];
  const continueNote = opts.continueNote?.trim() ?? "";
  if (pendingRejection.length && !continueNote)
    return refuse(s2, `${pendingRejection.map((d) => DEPT_SHORT[d]).join(" and ")} recorded Rejected. Choose: continue to the final release with a note, or cancel the case with a justification.`);
  const flags = dept === "RMM" ? rmmFlags(c) : [];
  const note = dept === "RMM" ? (
    // The continue-after-rejection choice stays on the track and in the audit: the confirmation goes into the final
    // document, which holds no RMES decision.
    `RMM review completed: whole CIQ reviewed, no open query.${flags.length ? ` Flag reviewed: ${flags.join(" ")}` : ""} Not a raw-material approval.`
  ) : "Review completed: assigned data and documents reviewed, no open query. Not a raw-material approval.";
  let state = mapCase(s2, caseId, (x) => {
    let y = {
      ...x,
      reviews: x.reviews.map(
        (r) => r.dept === dept ? { ...r, status: "completed", completedAt: at, ...pendingRejection.length ? { continueAfterRejection: { note: continueNote, by, at, depts: rejectedDepts(x) } } : {} } : r
      )
    };
    if (pendingRejection.length) y = audit(y, by, at, "Continue after rejection", `RMM continues to the final release despite the Rejected decision of ${pendingRejection.map((d) => DEPT_SHORT[d]).join(" and ")}: ${continueNote}`);
    y = confirm(s2, y, by, at, "dept-completion", dept, note);
    y = audit(y, by, at, `Completed ${DEPT_SHORT[dept]} review`, dept === "RMM" ? "Whole CIQ reviewed; no open points." : "All assigned sections reviewed; no open points.");
    return y;
  });
  const late = opts.completedAt ? sectionsChangedSince(getCase(state, caseId), opts.completedAt, s2.config, { metadata: false }).filter((sec) => ownsSection(s2, dept, sec)) : [];
  if (late.length) {
    state = activateTracks(state, caseId, [dept], at, `The supplier changed ${joinSections(s2, c, late)} after your review`);
    state = mapCase(state, caseId, (x) => ({ ...x, reviews: x.reviews.map((r) => r.dept === dept ? { ...r, lastCompletedAt: opts.completedAt } : r) }));
  }
  const after = getCase(state, caseId);
  if (after.reviews.every((r) => r.status === "completed")) {
    const depts = after.reviews.filter((r) => r.dept !== "RMM").length;
    state = mapCase(state, caseId, (x) => audit(setPhase(x, "final-release", at), "system", at, "All reviews completed", `${depts ? `RMM and ${depts === 1 ? "1 department review" : `${depts} department reviews`}` : "The RMM review"} completed. One request for the final release sent to the supplier.`));
    state = supplierMail(state, getCase(state, caseId), "release-requested", "system", at);
  }
  return toast(state, "success", `${DEPT_SHORT[dept]} review completed.`);
}
function reopenReview(s2, by, caseId, dept, reason, at = nowIso()) {
  const c = getCase(s2, caseId);
  if (!c) return refuse(s2, "This case no longer exists.");
  if (!isPart2(c)) return refuse(s2, "A review can be reopened only before the final release.");
  const denied = check(s2, by, "review.reopen", c, { dept });
  if (denied) return refuse(s2, denied);
  if (c.reviews.find((r) => r.dept === dept)?.status !== "completed") return refuse(s2, `The ${DEPT_SHORT[dept]} review is not completed.`, "info");
  if (!reason.trim()) return refuse(s2, "Please give a reason for reopening.");
  const withdraw = c.phase === "final-release";
  let next = mapCase(s2, caseId, (x) => {
    let y = { ...x, reviews: x.reviews.map((r) => r.dept === dept ? { ...r, status: "reopened", completedAt: void 0, lastCompletedAt: r.completedAt ?? r.lastCompletedAt } : r) };
    y = audit(y, by, at, `Reopened ${DEPT_SHORT[dept]} review`, `${sentence(reason)}.`);
    if (withdraw) y = audit(setPhase(y, "review", at), "system", at, "Final-release request withdrawn", `${DEPT_SHORT[dept]} reopened its review; the release request is sent again once every review has completed.`);
    return y;
  });
  if (withdraw) next = supplierMail(next, getCase(next, caseId), "release-withdrawn", by, at);
  return toast(next, "success", `${DEPT_SHORT[dept]} review reopened.`);
}
function reassignReview(s2, by, caseId, dept, toUserId, reason, at = nowIso()) {
  const c = getCase(s2, caseId);
  if (!c) return refuse(s2, "This case no longer exists.");
  if (isClosed(c)) return refuse(s2, "The case is closed.");
  const denied = check(s2, by, "review.reassign", c, { dept });
  if (denied) return refuse(s2, denied);
  const tr = c.reviews.find((r) => r.dept === dept);
  const to = userOf(s2, toUserId);
  if (!to || to.side !== "internal" || to.dept !== dept || !isActiveUser(to)) return refuse(s2, `Choose another member of ${DEPT_SHORT[dept]}.`);
  if (to.id === tr.assigneeId) return refuse(s2, `${to.name} already has this review.`, "info");
  if (!reason.trim()) return refuse(s2, "Please give a reason for the reassignment.");
  const from = tr.assigneeId;
  let next = mapCase(s2, caseId, (x) => {
    const ops = x.openPoints.map((p) => p.dept === dept && p.status !== "closed" && p.createdBy === "system" && p.responsibleId === from ? { ...p, responsibleId: to.id } : p);
    return audit({ ...x, openPoints: ops, reviews: x.reviews.map((r) => r.dept === dept ? { ...r, assigneeId: to.id } : r) }, by, at, `Reassigned ${DEPT_SHORT[dept]} review`, `${userName(s2, from)} \u2192 ${to.name}: ${reason.trim()}`);
  });
  next = reviewAssignedMail(next, getCase(next, caseId), [dept], by, at, `${userName(s2, by)} handed this review to you: ${reason.trim()}`);
  return toast(next, "success", `Review handed to ${to.name}.`);
}
function complete(s2, caseId, by, at) {
  let next = mapCase(s2, caseId, (c2) => audit(setPhase(c2, "completed", at), "system", at, "Case completed", "Completed automatically after the supplier's final release."));
  const c = getCase(next, caseId);
  const doc = buildFinalDocument(next, c, at, `Final release by ${userName(next, by)}`);
  next = mapCase(next, caseId, (x) => audit({ ...x, finalDocument: doc }, "system", at, "Generated final document", `Final document generated automatically, sealed and filed on the case (document seal ${doc.fingerprint}). Sent to the RMM owner. It cannot be changed.`));
  const done = getCase(next, caseId);
  next = supplierMail(next, done, "release-receipt", by, at);
  next = internalMail(
    next,
    [done.ownerId],
    { by: "system", event: "final-document", subject: `${done.id}: final document ready`, body: `The supplier gave the final release of ${done.materialName} (${done.id}) and the case is completed. The final document was generated automatically and sealed (document seal ${doc.fingerprint}). It holds the released answers, the evidence list, every open-point thread and all confirmations.`, link: caseLink(done.id, "final-document"), caseId: done.id },
    at
  );
  return next;
}
function finalRelease(s2, by, caseId, at = nowIso()) {
  const c = getCase(s2, caseId);
  if (!c) return refuse(s2, "This request no longer exists.");
  if (c.phase === "completed") return refuse(s2, "The final release was already given.", "info");
  if (c.phase === "cancelled") return supplierWriteGuard(s2, by, c, at, "the final release");
  if (c.phase !== "final-release") return refuse(s2, "The final release is requested only after RMM and every activated department have completed their review.");
  const denied = check(s2, by, "ciq.release", c);
  if (denied) return refuse(s2, denied);
  const blockers = releaseBlockers(c, s2.config);
  if (blockers.length) return refuse(s2, `The release is not possible yet: ${blockers.map((b) => b.supplierLabel ?? b.label).join("; ")}.`);
  let next = mapCase(s2, caseId, (x) => {
    const y = confirm(s2, x, by, at, "final-release", void 0, "Final CIQ release: the information and evidence are correct and complete. The CIQ is frozen.");
    return audit(y, by, at, "Gave final release", "CIQ frozen: every answer and upload is locked.");
  });
  next = complete(next, caseId, by, at);
  return toast(next, "success", "Final release recorded. The CIQ is now frozen.");
}
function cancelCase(s2, by, caseId, reason, at = nowIso()) {
  const c = getCase(s2, caseId);
  if (!c) return refuse(s2, "This case no longer exists.");
  const denied = check(s2, by, "case.cancel", c);
  if (denied) return refuse(s2, denied);
  if (c.phase === "completed") return refuse(s2, "A completed case cannot be cancelled.");
  if (c.phase === "cancelled") return refuse(s2, "The case is already cancelled.", "info");
  if (!reason.trim()) return refuse(s2, "A justification is required to cancel.");
  const open = c.openPoints.filter((p) => p.status !== "closed");
  const assignees = c.reviews.filter((r) => r.status !== "completed").map((r) => r.assigneeId);
  let next = mapCase(s2, caseId, (x) => {
    const ops = x.openPoints.map(
      (p) => p.status === "closed" ? p : { ...p, status: "closed", outcome: "withdrawn", closedAt: at, closedBy: by, closeReason: `Case cancelled: ${reason.trim()}`, thread: [...p.thread, { id: `${p.id}-m${p.thread.length + 1}`, at, by, side: "internal", text: "Closed: the request was withdrawn.", action: "withdrawn" }] }
    );
    let y = setPhase({ ...x, openPoints: ops, reviews: retrack(x.reviews, ops), cancelled: { by, at, reason: reason.trim(), fromPhase: x.phase } }, "cancelled", at);
    y = confirm(s2, y, by, at, "cancellation", void 0, reason.trim());
    const ended = x.reviews.filter((r) => r.status !== "completed").map((r) => DEPT_SHORT[r.dept]);
    return audit(
      y,
      by,
      at,
      "Cancelled case",
      `${sentence(reason)}. Every open task ended, the supplier's included${ended.length ? `; review tasks ended: ${ended.join(", ")}` : ""}${open.length ? `; ${open.length === 1 ? "1 open point" : `${open.length} open points`} closed` : ""}.`
    );
  });
  const done = getCase(next, caseId);
  next = supplierMail(next, done, "cancelled", by, at);
  next = internalMail(next, assignees.filter((x) => x !== by), { by, event: "cancelled", subject: `${done.id}: case cancelled`, body: `${userName(s2, by)} cancelled ${done.materialName} (${done.id}): ${reason.trim()}
Your review task on it has ended.`, link: caseLink(done.id), caseId: done.id }, at);
  return toast(next, "info", `${caseId} cancelled. It can be reactivated within 12 months.`);
}
function reactivateCase(s2, by, caseId, reason, at = nowIso(), dueDate) {
  const c = getCase(s2, caseId);
  if (!c) return refuse(s2, "This case no longer exists.");
  const denied = check(s2, by, "case.reactivate", c);
  if (denied) return refuse(s2, denied);
  if (c.phase !== "cancelled") return refuse(s2, "Only a cancelled case can be reactivated.", "info");
  if (!canReactivate(c, at)) return refuse(s2, "The 12-month window for reactivation has passed. Start a new case instead.");
  if (!reason.trim()) return refuse(s2, "A justification is required to reactivate.");
  if (dueDate !== void 0 && !notBeforeToday(dueDate, at)) return refuse(s2, "The new due date must be today or later.");
  const before = c.cancelled?.fromPhase ?? [...c.phaseHistory].reverse().find((p) => p.phase !== "cancelled")?.phase ?? "supplier-input";
  let next = mapCase(s2, caseId, (x) => {
    let y = setPhase({ ...x, cancelled: void 0, dueDate: dueDate ?? x.dueDate, reviews: retrack(x.reviews, x.openPoints) }, before, at);
    y = audit(y, by, at, "Reactivated case", `${sentence(reason)}. Back to \u201C${PHASE_LABEL[before]}\u201D. Earlier data kept; closed open points stay closed.${dueDate ? ` New due date ${fmtDate(dueDate)}.` : ""}`);
    return y;
  });
  const done = getCase(next, caseId);
  next = supplierMail(next, done, "reactivated", by, at);
  next = internalMail(next, done.reviews.filter((r) => r.status !== "completed").map((r) => r.assigneeId).filter((x) => x !== by), { by, event: "reactivated", subject: `${done.id}: case reactivated`, body: `${userName(s2, by)} reactivated ${done.materialName} (${done.id}): ${reason.trim()}
Your review task on it is open again.`, link: reviewLink(done.id), caseId: done.id }, at);
  return toast(next, "success", `${caseId} reactivated.`);
}
function reportChange(s2, by, caseId, text, at = nowIso()) {
  const c = getCase(s2, caseId);
  if (!c) return refuse(s2, "This request no longer exists.");
  const denied = check(s2, by, "ciq.reportChange", c);
  if (denied) return refuse(s2, denied);
  if (c.phase === "final-release") return refuse(s2, RELEASE_LOCKED_TEXT);
  if (c.phase !== "completed") return refuse(s2, "Until the final release you change the answers directly in the questionnaire.");
  if (!text.trim()) return refuse(s2, "Describe what has changed.");
  const id = `CR-${String(s2.changeReports.length + 1).padStart(4, "0")}`;
  let next = { ...s2, changeReports: [...s2.changeReports, { id, caseId, at, by, text: text.trim() }] };
  next = mapCase(next, caseId, (x) => audit(x, by, at, "Reported a change after release", `${id}: ${text.trim()} The released CIQ stays unchanged.`));
  next = internalMail(next, [c.ownerId], { by, event: "change-reported", subject: `${c.id}: the supplier reported a change`, body: `${userName(s2, by)} reported a change to the released CIQ of ${c.materialName} (${c.id}):
\u201C${text.trim()}\u201D
The released case stays unchanged. Start a new case from the case overview if the change needs a new questionnaire.`, link: caseLink(c.id, "overview"), caseId: c.id }, at);
  return toast(next, "success", "Thank you. Beiersdorf has been told and will contact you if a new questionnaire is needed.");
}
function addInternalNote(s2, by, caseId, text, sectionId, at = nowIso()) {
  const c = getCase(s2, caseId);
  if (!c) return refuse(s2, "This case no longer exists.");
  const denied = check(s2, by, "note.add", c);
  if (denied) return refuse(s2, denied);
  if (!text.trim()) return refuse(s2, "The note is empty.");
  const u = userOf(s2, by);
  const body = text.trim();
  const mentions = parseMentions(s2, body);
  const note = { id: `${c.id}-n${c.internalNotes.length + 1}`, at, by, dept: u?.dept, text: body, sectionId, mentions };
  const told = mentionRecipients(s2, note);
  const where = sectionId ? `On ${codeOf(sectionId, c, s2)}.` : "On the case.";
  const next = mapCase(s2, caseId, (x) => audit({ ...x, internalNotes: [...x.internalNotes, note] }, by, at, "Added internal note", told.length ? `${where} Mentioned ${joinPeople(told.map((id) => userName(s2, id)))}.` : where));
  return noteMentionMails(next, getCase(next, caseId), note, at);
}
function publishTemplateV2(s2, by, at = nowIso()) {
  const denied = check(s2, by, "config.manage");
  if (denied) return refuse(s2, denied);
  const d = draftPair(s2);
  if (s2.config.pairs.some((p) => p.template.version === "CIQ-2026 v2" && p.status === "published")) return refuse(s2, "Questionnaire v2 is already published.", "info");
  if (!d || d.template.version !== "CIQ-2026 v2") return refuse(s2, "There is no prepared questionnaire v2 to publish.", "info");
  return publishDraft(s2, by, d.changeNote || "Questionnaire v2 and rule set RS-2026.2.", at);
}
function setOwnership(s2, by, sectionId, lead, co, at = nowIso()) {
  const denied = check(s2, by, "config.manage");
  if (denied) return refuse(s2, denied);
  const before = s2.ownership[sectionId];
  let next = { ...s2, ownership: { ...s2.ownership, [sectionId]: { lead, co } } };
  const d = draftPair(s2);
  const sec = d?.template.sections.find((x) => x.id === sectionId);
  const same = (a, b) => !!a && !!b && a.lead === b.lead && [...a.co].sort().join() === [...b.co].sort().join();
  if (d && sec && (!before || same(sec, before))) {
    const config = { pairs: next.config.pairs.map((p) => p === d ? { ...p, template: { ...p.template, sections: p.template.sections.map((x) => x.id === sectionId ? { ...x, lead, co: [...co] } : x) } } : p) };
    next = { ...next, config };
  }
  next = logEvent(next, { at, by, kind: "config", action: "Changed section ownership", detail: `${codeOf(sectionId, void 0, s2)}: lead ${before?.lead ?? "\u2014"} \u2192 ${lead}; co-reviewers ${(before?.co ?? []).join(", ") || "none"} \u2192 ${co.join(", ") || "none"}.` });
  return toast(next, "success", `Ownership of ${codeOf(sectionId, void 0, s2)} updated. Open cases follow it from now on: new review tasks, added sections and change mails.`);
}
function updateReminder(s2, by, id, patch, at = nowIso()) {
  const denied = check(s2, by, "config.manage");
  if (denied) return refuse(s2, denied);
  const cur = s2.reminders.find((r) => r.id === id);
  if (!cur) return refuse(s2, "This reminder no longer exists.");
  const changes = Object.keys(patch).filter((k) => patch[k] !== cur[k]).map((k) => `${k}: ${String(cur[k])} \u2192 ${String(patch[k])}`);
  if (!changes.length) return s2;
  const next = { ...s2, reminders: s2.reminders.map((r) => r.id === id ? { ...r, ...patch } : r) };
  return logEvent(next, { at, by, kind: "config", action: "Changed reminder", detail: `${cur.event}: ${changes.join("; ")}.` });
}

// prototype/src/domain/reminders.ts
var days = (from, now) => (Date.parse(now) - Date.parse(from)) / DAY;
var sentAt = (p) => [...p.thread].reverse().find((m) => m.action === "raised" || m.newRound)?.at ?? p.createdAt;
var phaseSince = (c) => [...c.phaseHistory].reverse().find((x) => x.phase === c.phase)?.at ?? c.createdAt;
function runReminders(s2, now, by = "system") {
  const denied = check(s2, by, "reminders.run");
  if (denied) return refuse(s2, denied);
  const on = (id) => s2.reminders.find((r) => r.id === id && r.enabled);
  const before = s2.mails.length;
  let next = s2;
  const ownerOfProcess = INTERNAL_PERSONAS.find((p) => p.id === "owner")?.userId ?? "u-owner";
  for (const c0 of s2.cases.filter((c) => !isClosed(c))) {
    const c = () => getCase(next, c0.id);
    const r1 = on("rem-1");
    if (r1 && c0.phase === "supplier-input") {
      const start = phaseSince(c0);
      const task = "fill in the CIQ and confirm completeness";
      if (days(start, now) >= r1.afterDays) next = supplierMail(next, c(), "reminder", by, now, void 0, { task, key: `rem-1:${c0.id}:${start}:reminder` });
      if (Date.parse(c0.dueDate) + DAY <= Date.parse(now)) next = supplierMail(next, c(), "reminder", by, now, void 0, { task, overdue: true, key: `rem-1:${c0.id}:${c0.dueDate}:overdue` });
      if (days(start, now) >= r1.escalateAfterDays)
        next = internalMail(next, [c0.ownerId], { by, event: "escalation", subject: `Escalation: ${c0.id} not yet filled in`, body: `The supplier has not completed the CIQ for ${c0.materialName} (${c0.id}) ${Math.floor(days(start, now))} days after the invitation. Due date: ${fmtDate(c0.dueDate)}. Consider contacting the supplier.`, link: caseLink(c0.id), caseId: c0.id, key: `rem-1:${c0.id}:${start}:escalation` }, now);
    }
    const r2 = on("rem-2");
    if (r2 && (c0.phase === "review" || c0.phase === "final-release")) {
      for (const p of c0.openPoints.filter((x) => x.status === "open")) {
        const start = sentAt(p);
        const round = `rem-2:${p.id}:r${p.rounds}`;
        const task = "answer a question from Beiersdorf";
        if (days(start, now) >= r2.afterDays) next = supplierMail(next, c(), "reminder", by, now, p, { task, key: `${round}:reminder` });
        if (Date.parse(p.dueDate) + DAY <= Date.parse(now)) next = supplierMail(next, c(), "reminder", by, now, p, { task, overdue: true, key: `${round}:${p.dueDate}:overdue` });
        if (days(start, now) >= r2.escalateAfterDays)
          next = internalMail(next, [raiserOf(p), c0.ownerId], { by, event: "escalation", subject: `Escalation: ${p.id} unanswered`, body: `The supplier has not answered ${p.id} on ${p.ref.label} (${c0.materialName}, ${c0.id}) for ${Math.floor(days(start, now))} days. Due date: ${fmtDate(p.dueDate)}.`, link: reviewLink(c0.id, p.id), caseId: c0.id, opId: p.id, key: `${round}:escalation` }, now);
      }
    }
    const r3 = on("rem-3");
    if (r3 && c0.phase === "review") {
      for (const r of c0.reviews.filter((x) => x.status === "in-review" || x.status === "reopened")) {
        const last = [r.startedAt ?? c0.createdAt, ...c0.audit.filter((a) => a.by === r.assigneeId).map((a) => a.at)].sort().at(-1);
        const key = `rem-3:${c0.id}:${r.dept}:${last}`;
        const name = r.dept === "RMM" ? "your RMM review" : `your ${DEPT_SHORT[r.dept]} review`;
        if (days(last, now) >= r3.afterDays)
          next = internalMail(next, [r.assigneeId], { by, event: "reminder", subject: `Reminder: ${name} of ${c0.id}`, body: `${name[0].toUpperCase()}${name.slice(1)} of ${c0.materialName} (${c0.id}) has had no activity for ${Math.floor(days(last, now))} days.`, link: reviewLink(c0.id), caseId: c0.id, key: `${key}:reminder` }, now);
        if (days(last, now) >= r3.escalateAfterDays)
          next = internalMail(next, [r.dept === "RMM" ? ownerOfProcess : c0.ownerId], { by, event: "escalation", subject: `Escalation: ${r.dept === "RMM" ? "RMM" : DEPT_SHORT[r.dept]} review of ${c0.id} idle`, body: `The ${r.dept === "RMM" ? "RMM" : DEPT_SHORT[r.dept]} review of ${c0.materialName} (${c0.id}) has had no activity for ${Math.floor(days(last, now))} days.`, link: caseLink(c0.id), caseId: c0.id, key: `${key}:escalation` }, now);
      }
    }
    const r5 = on("rem-5");
    if (r5 && c0.phase === "final-release") {
      const start = phaseSince(c0);
      if (days(start, now) >= r5.afterDays) next = supplierMail(next, c(), "reminder", by, now, void 0, { task: "give the final release", key: `rem-5:${c0.id}:${start}:reminder` });
      if (days(start, now) >= r5.escalateAfterDays)
        next = internalMail(next, [c0.ownerId], { by, event: "escalation", subject: `Escalation: final release of ${c0.id} pending`, body: `The supplier has not given the final release of ${c0.materialName} (${c0.id}) ${Math.floor(days(start, now))} days after the request.`, link: caseLink(c0.id), caseId: c0.id, key: `rem-5:${c0.id}:${start}:escalation` }, now);
    }
  }
  const sent = next.mails.length - before;
  const escalations = next.mails.slice(before).filter((m) => m.event === "escalation").length;
  const kinds = [sent - escalations ? `${sent - escalations} reminder${sent - escalations > 1 ? "s" : ""}` : "", escalations ? `${escalations} escalation${escalations > 1 ? "s" : ""}` : ""].filter(Boolean).join(", ");
  return toast(next, sent ? "success" : "info", sent ? `${sent} e-mail${sent > 1 ? "s" : ""} sent (${kinds}).` : `No reminder is due as of ${fmtDate(now)}.`);
}

// prototype/src/domain/invariants.ts
var ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/;
function internalStrings(c) {
  const out = [
    ...c.internalNotes.map((n) => n.text),
    ...c.rmes?.criteria.map((x) => x.comment ?? "") ?? [],
    ...c.rmes?.findings.map((f) => f.text) ?? [],
    ...c.reviews.map((r) => r.decisionReason ?? ""),
    ...c.reviews.map((r) => r.continueAfterRejection?.note ?? ""),
    ...c.openPoints.map((p) => p.closeReason ?? ""),
    ...c.openPoints.flatMap((p) => p.thread.filter((m) => m.action === "note").map((m) => m.text)),
    c.cancelled?.reason ?? "",
    ...c.confirmations.filter((x) => x.type === "cancellation").map((x) => x.note ?? "")
  ];
  return [...new Set(out.map((t) => t.trim()).filter((t) => t.length >= 12))];
}
function checkInvariants(s2) {
  const v = [];
  const ids = /* @__PURE__ */ new Set();
  for (const c of s2.cases) {
    const at = (m) => v.push(`${c.id}: ${m}`);
    if (ids.has(c.id)) at("duplicate case id");
    ids.add(c.id);
    const tracks = new Set(c.reviews.map((r) => r.dept));
    const opIds = /* @__PURE__ */ new Set();
    for (const p of c.openPoints) {
      if (opIds.has(p.id)) at(`duplicate open point ${p.id}`);
      opIds.add(p.id);
      if (!tracks.has(p.dept)) at(`${p.id} belongs to ${p.dept}, which has no track`);
      if (unresolved(p) && scopeOf(c, p.ref.sectionId)?.applicability === "na") at(`${p.id} is unresolved on the N.A. section ${p.ref.sectionId}`);
      if (p.status === "closed" && !p.outcome) at(`${p.id} is closed without an outcome`);
      if (p.thread[0]?.action !== "raised") at(`${p.id} has no "raised" entry first`);
    }
    for (const r of c.reviews) {
      if (r.status === "completed" && c.openPoints.some((p) => p.dept === r.dept && unresolved(p))) at(`${r.dept} is completed with an unresolved point`);
      if (!isClosed(c) && r.status === "waiting-supplier" && !c.openPoints.some((p) => p.dept === r.dept && p.status === "open")) at(`${r.dept} waits for the supplier without an open point`);
      if (!isClosed(c) && r.status !== "waiting-supplier" && r.status !== "completed" && c.openPoints.some((p) => p.dept === r.dept && p.status === "open")) at(`${r.dept} has a point with the supplier but is not waiting`);
    }
    const releases = c.confirmations.filter((x) => x.type === "final-release").length;
    if (c.phase === "review" && c.reviews.length > 0 && c.reviews.every((r) => r.status === "completed")) at("in review although every track has completed");
    if (c.phase === "final-release") {
      if (!c.reviews.length || c.reviews.some((r) => r.status !== "completed")) at("final-release with a track not completed");
      if (c.openPoints.some(unresolved)) at("final-release with an unresolved open point");
    }
    if (c.phase === "completed") {
      if (!c.finalDocument) at("completed without a final document");
      else if (!verifyFinalDocument(c.finalDocument)) at("the final document does not match its fingerprint");
      if (releases !== 1) at(`completed with ${releases} final-release confirmations`);
    } else if (c.finalDocument) at("has a final document but is not completed");
    if (c.phase === "cancelled") {
      if (c.openPoints.some(unresolved)) at("cancelled with an unresolved open point");
      if (supplierTasks(s2, c.supplierId).some((t) => t.caseId === c.id)) at("cancelled but the supplier still has tasks");
      if (!c.cancelled) at("cancelled without a cancellation record");
    }
    if ((c.phase === "review" || c.phase === "final-release" || c.phase === "completed") && !c.confirmations.some((x) => x.type === "completeness")) at(`${c.phase} without a completeness confirmation`);
    for (const a of c.audit) if (!a.by || !ISO.test(a.at)) at(`audit event ${a.id} has no actor or no ISO time`);
    const auditIds = new Set(c.audit.map((a) => a.id));
    if (auditIds.size !== c.audit.length) at("duplicate audit ids");
    for (const id of c.supplierContactIds) {
      const u = userOf(s2, id);
      if (!u || u.side !== "supplier" || u.supplierId !== c.supplierId) at(`case contact ${id} is not a contact of the case's supplier`);
    }
    if (!isClosed(c) && c.liveScope && !c.supplierContactIds.some((id) => isActiveUser(userOf(s2, id)))) at("open case without an active contact");
    const secrets = internalStrings(c);
    for (const m of s2.mails.filter((x) => x.audience === "supplier" && x.caseId === c.id)) {
      const hit = secrets.find((t) => m.body.includes(t) || m.subject.includes(t));
      if (hit) at(`supplier mail ${m.id} contains internal text \u201C${hit.slice(0, 40)}\u201D`);
      if (/\bRMES\b|internal note/i.test(m.body)) at(`supplier mail ${m.id} mentions internal evaluation terms`);
    }
  }
  const mailIds = /* @__PURE__ */ new Set();
  for (const m of s2.mails) {
    if (mailIds.has(m.id)) v.push(`duplicate mail id ${m.id}`);
    mailIds.add(m.id);
    if (!m.to.length) v.push(`mail ${m.id} has no recipient`);
    for (const id of m.to) {
      const u = userOf(s2, id);
      if (!u) v.push(`mail ${m.id} goes to the unknown user ${id}`);
      else if (u.side === "supplier" && m.audience !== "supplier") v.push(`internal mail ${m.id} goes to the supplier contact ${id}`);
      else if (u.side === "internal" && m.audience === "supplier") v.push(`supplier mail ${m.id} goes to the internal user ${id}`);
      else if (u.deactivatedAt && u.active === false && m.at > u.deactivatedAt) v.push(`mail ${m.id} went to ${u.name} after the deactivation`);
    }
  }
  for (const sup of s2.suppliers) {
    if (!/^\d{9}$/.test(sup.duns)) v.push(`${sup.name}: DUNS is not 9 digits`);
    if (sup.active !== false && !s2.users.some((u) => u.supplierId === sup.id && isActiveUser(u))) v.push(`${sup.name} has no active contact`);
  }
  const cfg = s2.config ?? { pairs: [] };
  if (cfg.pairs.filter((p) => p.status === "draft").length > 1) v.push("more than one draft configuration");
  if (cfg.pairs.some((p, i) => p.status === "draft" && i !== cfg.pairs.length - 1)) v.push("the draft configuration is not the newest pair");
  if (cfg.pairs.length && s2.activeRuleSet !== currentPair(s2).ruleSetVersion) v.push(`the active rule set ${s2.activeRuleSet} is not the newest published one (${currentPair(s2).ruleSetVersion})`);
  const pairs = [["RS-2026.1", "CIQ-2026 v1"], ...cfg.pairs.filter((p) => p.status === "published").map((p) => [p.ruleSet.version, p.template.version])];
  const published = new Set(pairs.map(([rs, tpl]) => `${rs}|${tpl}`));
  const publishedRuleSets = new Set(pairs.map(([rs]) => rs));
  if (published.size !== pairs.length) v.push("two published releases are the same pair of rule set and questionnaire");
  for (const c of s2.cases.filter((x) => x.liveScope)) {
    if (!publishedRuleSets.has(c.ruleSetVersion)) v.push(`${c.id}: runs on ${c.ruleSetVersion}, which is not a published rule set`);
    else if (!published.has(`${c.ruleSetVersion}|${c.templateVersion}`)) v.push(`${c.id}: ${c.templateVersion} was never published with ${c.ruleSetVersion}`);
  }
  const no = (x) => Number(/(\d+)$/.exec(x)?.[1] ?? 0);
  for (let i = 1; i < pairs.length; i++) {
    if (no(pairs[i][0]) < no(pairs[i - 1][0]) || no(pairs[i][1]) < no(pairs[i - 1][1])) v.push(`release ${pairs[i].join(" + ")} has a lower number than ${pairs[i - 1].join(" + ")}`);
  }
  const duns = s2.suppliers.map((x) => x.duns);
  if (new Set(duns).size !== duns.length) v.push("two suppliers share a DUNS number");
  const groups = /* @__PURE__ */ new Map();
  for (const u of s2.users) {
    const mail = u.email.trim().toLowerCase();
    if (!mail) continue;
    const side = u.side === "supplier" ? `supplier:${u.supplierId ?? ""}` : "internal";
    groups.set(side, [...groups.get(side) ?? [], mail]);
  }
  for (const [side, emails] of groups) if (new Set(emails).size !== emails.length) v.push(side === "internal" ? "two Beiersdorf users share an e-mail address" : `two contacts of ${side.slice(9) || "a supplier"} share an e-mail address`);
  return v;
}

// prototype/src/domain/seed.ts
var SCHEMA = 9;
var initials = (n) => n.replace(/^Dr\. /, "").split(" ").map((x) => x[0]).join("").slice(0, 2).toUpperCase();
function makeUser(id, name, title, side, dept, supplierId, domain = "beiersdorf.example") {
  const email = `${name.replace(/^Dr\. /, "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z ]/g, "").replace(/ /g, ".")}@${domain}`;
  const u = { id, name, title, side, dept, supplierId, email, initials: initials(name) };
  return side === "supplier" ? { ...u, active: true, mayConfirm: true } : u;
}
var ROLE_HOLDERS = [
  makeUser("u-rmm", "Katrin Vogel", "Raw Material Manager", "internal", "RMM"),
  makeUser("u-reg", "Dr. Jonas Albrecht", "Regulatory Affairs Manager", "internal", "REG"),
  makeUser("u-saf", "Dr. Mira Hansen", "Product Safety Assessor", "internal", "SAF"),
  makeUser("u-qm", "Lena Krause", "Quality Management Specialist", "internal", "QM"),
  makeUser("u-mic", "Tobias Keller", "Microbiologist", "internal", "MIC"),
  makeUser("u-sus", "Sophie Wagner", "Sustainability Manager", "internal", "SUS"),
  makeUser("u-cus", "Felix Schulz", "Trade Compliance Officer", "internal", "CUS"),
  makeUser("u-leg", "Dr. Anna Becker", "IP Counsel", "internal", "LEG"),
  makeUser("u-admin", "Nina Hoffmann", "CIQ Business Administrator", "internal"),
  makeUser("u-auditor", "Paul Neumann", "Internal Audit", "internal"),
  makeUser("u-owner", "Dr. Claudia Richter", "Process Owner, Raw Material Qualification", "internal")
];
var SUPPLIER_DEFS = [
  { id: "s1", name: "Solvaro Oleochemicals S.A.", duns: "471203958", country: "Spain", city: "Tarragona", type: "manufacturer", contacts: [["u-sup-1", "Elena M\xE1rquez", "Regulatory Manager"], ["u-sup-2", "Ravi Menon", "QA Specialist"]] },
  { id: "s2", name: "Nordhafen Minerals GmbH", duns: "318774502", country: "Germany", city: "Bremen", type: "manufacturer", contacts: [["u-s2a", "Henrik Lund", "Technical Sales"], ["u-s2b", "Julia Roth", "Product Steward"]] },
  { id: "s3", name: "Kestrel Polymers Ltd", duns: "209558317", country: "United Kingdom", city: "Runcorn", type: "manufacturer", contacts: [["u-s3a", "Oliver Grant", "Regulatory Lead"], ["u-s3b", "Priya Shah", "Customer Quality"]] },
  { id: "s4", name: "Aurelia Botanicals S.r.l.", duns: "552091846", country: "Italy", city: "Parma", type: "manufacturer", contacts: [["u-s4a", "Giulia Conti", "Quality Director"], ["u-s4b", "Marco Ferri", "Sustainability Officer"]] },
  { id: "s5", name: "Pacific Lipid Sdn Bhd", duns: "640118273", country: "Malaysia", city: "Port Klang", type: "manufacturer", contacts: [["u-s5a", "Aisyah Rahman", "Regulatory Executive"], ["u-s5b", "Daniel Tan", "Key Account Manager"]] },
  { id: "s6", name: "Valmont Specialty Chemicals Inc.", duns: "087342615", country: "USA", city: "Wilmington, DE", type: "manufacturer", contacts: [["u-s6a", "Sarah Collins", "Product Regulatory Manager"], ["u-s6b", "Kevin Park", "QA Manager"]] },
  { id: "s7", name: "Helvetia Pigments AG", duns: "481930027", country: "Switzerland", city: "Basel", type: "manufacturer", contacts: [["u-s7a", "Lukas Meier", "Regulatory Affairs"], ["u-s7b", "Chiara Rossi", "Quality Assurance"]] },
  { id: "s8", name: "Duna Biotech Kft.", duns: "390265184", country: "Hungary", city: "Debrecen", type: "manufacturer", contacts: [["u-s8a", "Bence Kov\xE1cs", "QA/RA Manager"], ["u-s8b", "Eszter Nagy", "Fermentation Lead"]] },
  { id: "s9", name: "Lusit\xE2nia Waxes Lda", duns: "726840391", country: "Portugal", city: "Sines", type: "distributor", contacts: [["u-s9a", "Rui Almeida", "Technical Manager"], ["u-s9b", "In\xEAs Costa", "Regulatory Assistant"]] },
  { id: "s10", name: "Shenzhou Fine Ingredients Co., Ltd.", duns: "613057829", country: "China", city: "Suzhou", type: "manufacturer", contacts: [["u-s10a", "Wei Zhang", "Export Regulatory Manager"], ["u-s10b", "Lin Chen", "QC Supervisor"]] }
];
var DEMO_SUPPLIER_IDS = ["s1"];
var supplierOf = (d) => ({ id: d.id, name: d.name, duns: d.duns, country: d.country, city: d.city, type: d.type, contactIds: d.contacts.map((c) => c[0]), active: true });
var contactsOfDef = (d) => d.contacts.map(([id, name, title]) => makeUser(id, name, title, "supplier", void 0, d.id, d.name.split(" ")[0].toLowerCase().normalize("NFD").replace(/[^a-z]/g, "") + ".example"));
function baseState(users, suppliers) {
  const ownership = Object.fromEntries(BUILTIN_SECTIONS.map((x) => [x.id, { lead: x.lead, co: [...x.co] }]));
  const config = initialConfig(ownership);
  return {
    schema: SCHEMA,
    personaId: "rmm",
    cases: [],
    users,
    suppliers,
    templates: templateList(config),
    activeRuleSet: "RS-2026.1",
    config,
    ownership,
    reminders: [
      { id: "rem-1", event: "Supplier task not started", recipient: "Supplier contacts", afterDays: 7, escalateTo: "RMM case owner", escalateAfterDays: 14, enabled: true },
      { id: "rem-2", event: "Query or document request unanswered", recipient: "Supplier contacts", afterDays: 5, escalateTo: "Requesting reviewer + RMM", escalateAfterDays: 10, enabled: true },
      { id: "rem-3", event: "Review task idle", recipient: "Assigned reviewer", afterDays: 5, escalateTo: "RMM case owner", escalateAfterDays: 10, enabled: true },
      { id: "rem-5", event: "Final release pending", recipient: "Supplier contacts", afterDays: 3, escalateTo: "RMM case owner", escalateAfterDays: 7, enabled: true },
      { id: "rem-6", event: "Certificate expiring (closed case)", recipient: "Supplier contacts", afterDays: -30, escalateTo: "QM", escalateAfterDays: 0, enabled: false }
    ],
    toasts: [],
    mails: [],
    log: [],
    changeReports: []
  };
}
function buildSeed() {
  const defs = SUPPLIER_DEFS.filter((d) => DEMO_SUPPLIER_IDS.includes(d.id));
  return baseState([...ROLE_HOLDERS.map((u) => ({ ...u })), ...defs.flatMap(contactsOfDef)], defs.map(supplierOf));
}

// prototype/src/domain/referenceMaterials.ts
var base = (o, m, extra = {}) => ({ SF01: o, SF03: false, SF04: false, SF05: [], SF06: false, SF07: false, SF09: false, SF10: false, SF11: m, SF12: true, ...extra });
var REFERENCE_MATERIALS = [
  { id: "sunflower", label: "Sunflower oil (vegetable)", config: base(["vegetable"], ["EU", "UK"]), templateVersion: "CIQ-2026 v1", look: "Vegetable origin switches on Annex 1, 2 and 9; the UK market adds UK REACH (K6.2, Annex 11)." },
  { id: "palm", label: "Palm glycerin (vegetable, EUDR)", config: base(["vegetable"], ["EU", "CN", "US"], { SF09: true }), templateVersion: "CIQ-2026 v1", look: "Vegetable origin opens Annex 1, where the palm question (FLD-A1-204) asks for the RSPO certification; EUDR (SF-09) adds K6.17 for Sustainability." },
  { id: "mineral-oil", label: "Mineral oil entered as 'Mineral'", config: base(["mineral"], ["EU"], { SF07: true }), templateVersion: "CIQ-2026 v1", look: "Origin 'Mineral' alone would not ask for MOAH: SF-07 still activates Annex 4 (MOAH) and Annex 9 (PAH)." },
  { id: "paraffin", label: "Paraffin, petrochemical, no micro test", config: base(["petrochemical"], ["EU", "UK", "CA"], { SF07: true, SF12: false }), templateVersion: "CIQ-2026 v1", look: "Petrochemical origin activates Annex 1, 4 and 9; SF-12 = No waives K5.1 with a written justification." },
  { id: "acrylate", label: "Acrylate polymer", config: base(["polymer"], ["EU", "UK"], { SF03: true }), templateVersion: "CIQ-2026 v1", look: "Polymer origin and SF-03 both activate K4.3 (microparticles) and Annex 6; the stricter rule wins and both are cited." },
  { id: "tio2", label: "Titanium dioxide UV filter and colorant", config: base(["mineral"], ["EU", "US", "CN"], { SF04: true, SF05: ["colorant"] }), templateVersion: "CIQ-2026 v1", look: "SF-04 adds the UV filter annex (Annex 5), SF-05 the colorant annex (Annex 7); China adds K6.13." },
  { id: "ccu", label: "CCU ethanol (no rules yet)", config: base(["ccu"], ["EU"]), templateVersion: "CIQ-2026 v1", look: "No rules exist yet for a carbon-capture origin: the supplier gets the standard sections and the case is flagged in RMM's review." },
  { id: "turkey", label: "Triglyceride for Turkey (tests the draft)", config: base(["vegetable"], ["EU", "TR"]), templateVersion: "CIQ-2026 v1", look: "Only RS-2026.2 with questionnaire v2 asks for Turkey REACH (K6.3, Annex 12)." }
];

// prototype/src/domain/richFixture.ts
function mulberry32(a) {
  return function() {
    a |= 0;
    a = a + 1831565813 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
var NOW = Date.parse(NOW_ISO);
var iso = (ms) => new Date(ms).toISOString();
var EXTRA_INTERNAL = [
  makeUser("u-rmm-2", "Jan Petersen", "Raw Material Manager", "internal", "RMM"),
  makeUser("u-reg-2", "Lea Schmitt", "Regulatory Affairs Specialist", "internal", "REG"),
  makeUser("u-saf-2", "Dr. Ole Brandt", "Toxicologist", "internal", "SAF"),
  makeUser("u-qm-2", "Marco Weber", "Supplier Quality Engineer", "internal", "QM")
];
var C = (inci, fn, origin2, min, max, cas, additive = false) => ({ inci, fn, origin: origin2, concMin: min, concMax: max, cas, additive });
var base2 = (o, m, extra = {}) => ({ SF01: o, SF03: false, SF04: false, SF05: [], SF06: false, SF07: false, SF09: false, SF10: false, SF11: m, SF12: true, ...extra });
var SPECS = [
  // ---- historic, completed (reports)
  { n: 101, material: "AMANDEL 100 Refined", inci: "Prunus Amygdalus Dulcis Oil", supplier: "s4", config: base2(["vegetable"], ["EU", "UK"]), components: [C("Prunus Amygdalus Dulcis Oil", "emollient", "vegetable", 99.5, 100, "8007-69-0"), C("Tocopherol", "antioxidant", "vegetable", 0, 0.5, "59-02-9", true)], stage: "completed", age: 268, lead: 96 },
  { n: 103, material: "ZINCOX Micro 30", inci: "Zinc Oxide", supplier: "s7", config: base2(["mineral"], ["EU", "US"], { SF04: true }), components: [C("Zinc Oxide", "UV filter", "mineral", 98, 100, "1314-13-2")], stage: "completed", age: 251, lead: 104 },
  { n: 105, material: "CERA ALBA Pharma", inci: "Cera Alba", supplier: "s1", config: base2(["animal"], ["EU"]), components: [C("Cera Alba", "consistency agent", "animal", 100, 100, "8012-89-3")], stage: "completed", age: 233, lead: 71 },
  { n: 108, material: "KESTREL PQ-10", inci: "Polyquaternium-10", supplier: "s3", config: base2(["polymer"], ["EU", "UK", "CA"], { SF03: true }), components: [C("Polyquaternium-10", "conditioning agent", "polymer", 99, 100, "68610-92-4")], stage: "completed", age: 214, lead: 88 },
  { n: 110, material: "ALLANTOIN Pure", inci: "Allantoin", supplier: "s10", config: base2(["petrochemical"], ["EU", "CN"]), components: [C("Allantoin", "skin conditioning", "petrochemical", 99, 100, "97-59-6")], stage: "completed", age: 196, lead: 77 },
  { n: 112, material: "CITRACID Ferm", inci: "Citric Acid", supplier: "s8", config: base2(["vegetable"], ["EU"], { SF06: true }), components: [C("Citric Acid", "pH adjuster", "vegetable", 99.5, 100, "77-92-9")], stage: "completed", age: 180, lead: 64 },
  { n: 114, material: "KARITE Butter Organic", inci: "Butyrospermum Parkii Butter", supplier: "s4", config: base2(["vegetable"], ["EU", "UK", "US"]), components: [C("Butyrospermum Parkii Butter", "emollient", "vegetable", 100, 100, "194043-92-0")], stage: "completed", age: 163, lead: 92 },
  { n: 116, material: "TALCUM Superfine", inci: "Talc", supplier: "s2", config: base2(["mineral"], ["EU"], { SF12: false }), components: [C("Talc", "absorbent", "mineral", 100, 100, "14807-96-6")], stage: "completed", age: 150, lead: 58 },
  { n: 118, material: "IPM Palm Ester", inci: "Isopropyl Myristate", supplier: "s5", config: base2(["vegetable"], ["EU", "CN"]), palm: true, components: [C("Isopropyl Myristate", "emollient", "vegetable", 99, 100, "110-27-0")], stage: "completed", age: 131, lead: 83 },
  { n: 120, material: "OZOKERITE 77", inci: "Ozokerite", supplier: "s9", config: base2(["petrochemical"], ["EU", "UK"], { SF07: true }), components: [C("Ozokerite", "viscosity controlling", "petrochemical", 100, 100, "8021-55-4")], stage: "completed", age: 118, lead: 101 },
  { n: 122, material: "XANTHAN Clear", inci: "Xanthan Gum", supplier: "s8", config: base2(["vegetable"], ["EU", "US"], { SF06: true }), components: [C("Xanthan Gum", "viscosity controlling", "vegetable", 99, 100, "11138-66-2")], stage: "completed", age: 101, lead: 55 },
  { n: 124, material: "JOJOBA Golden", inci: "Simmondsia Chinensis Seed Oil", supplier: "s4", config: base2(["vegetable"], ["EU", "US", "CA"]), components: [C("Simmondsia Chinensis Seed Oil", "emollient", "vegetable", 100, 100, "61789-91-1")], stage: "completed", age: 84, lead: 61 },
  // ---- active pipeline
  {
    n: 131,
    material: "HELIOSOFT 200",
    inci: "Helianthus Annuus Seed Oil",
    supplier: "s1",
    config: base2(["vegetable"], ["EU", "UK"]),
    components: [C("Helianthus Annuus Seed Oil", "emollient", "vegetable", 99.4, 99.9, "8001-21-6"), C("Tocopherol", "antioxidant", "vegetable", 0.1, 0.6, "59-02-9", true)],
    stage: "review",
    age: 46,
    rmesShare: 0.5,
    done: ["MIC"],
    queries: [
      { dept: "REG", kind: "query", sec: "K2.1", row: "c2", label: "K2.1 \u203A component 2 \u203A CAS number", q: "Component 2 (Tocopherol) \u2014 please confirm the CAS number: is it the natural (10191-41-0 / 59-02-9) or synthetic form?", state: "open" },
      { dept: "REG", kind: "document-request", sec: "A1", field: "FLD-A1-202", label: "Annex 1 \u203A Pesticides analysis (v1)", q: "The pesticide screening is older than 24 months. Please upload a current analysis.", state: "answered", reply: "Updated multi-residue screening from August 2026 attached." },
      { dept: "QM", kind: "query", sec: "K1", field: "FLD-K1-002", label: "K1 \u203A Certificate of analysis", q: "CoA batch 2408-117 shows peroxide value 4.8 meq/kg \u2014 please confirm the specification limit (\u2264 5 or \u2264 10?).", state: "closed", reply: "Specification limit is \u2264 5 meq/kg; see specification rev. 6, section 3." }
    ]
  },
  {
    n: 132,
    material: "GLYCERA PK 99.7",
    inci: "Glycerin",
    supplier: "s5",
    config: base2(["vegetable"], ["EU", "CN", "US"], { SF09: true }),
    palm: true,
    components: [C("Glycerin", "humectant", "vegetable", 99.5, 99.8, "56-81-5"), C("Aqua", "solvent", "vegetable", 0.2, 0.5, "7732-18-5")],
    stage: "review",
    age: 38,
    rmesShare: 0.7,
    queries: [
      { dept: "REG", kind: "document-request", sec: "A1", field: "FLD-A1-206", label: "Annex 1 \u203A RSPO certification", q: "The RSPO supply-chain certificate expired in March 2026. Please upload the renewed certificate and state the RSPO number on the CoA.", state: "returned", reply: "Renewal audit is scheduled; attached is the audit confirmation letter." },
      { dept: "SUS", kind: "query", sec: "K6.17", label: "K6.17 \u203A EUDR scope", q: "Please confirm whether the palm feedstock is in EUDR scope and provide the geolocation statement.", state: "open" },
      { dept: "REG", kind: "query", sec: "K6.13", label: "K6.13 \u203A China IECIC", q: "Please confirm the IECIC listing name used for the Chinese market.", state: "answered", reply: "Listed in IECIC 2021 as \u7518\u6CB9 (Glycerin), entry no. 03329." }
    ]
  },
  { n: 133, material: "LUSTRA Mica White", inci: "Mica", supplier: "s7", config: base2(["mineral"], ["EU", "US"], { SF05: ["colorant"] }), components: [C("Mica", "colorant", "mineral", 100, 100, "12001-26-2")], stage: "supplier-input", age: 20, fill: 0.6, priority: "high" },
  {
    n: 134,
    material: "PARAFLUID 70 Pharma",
    inci: "Paraffinum Liquidum",
    supplier: "s9",
    config: base2(["petrochemical"], ["EU", "UK", "CA"], { SF07: true, SF12: false }),
    components: [C("Paraffinum Liquidum", "emollient", "petrochemical", 100, 100, "8042-47-5")],
    stage: "review",
    age: 52,
    rmesShare: 0.8,
    moah: 1.6,
    priority: "high",
    findings: [{ crit: "S-C2", text: "MOAH 1.6 mg/kg exceeds the BDF threshold of 1.0 mg/kg", blocking: true }],
    queries: [
      { dept: "SAF", kind: "finding", sec: "A4", field: "FLD-A4-101", label: "Annex 4 \u203A MOAH concentration", q: "Your MOAH value of 1.6 mg/kg exceeds our threshold. Please provide the full HPLC-GC-FID report incl. the MOAH fraction \u2265 C25, or a lower-MOAH grade.", state: "open" },
      { dept: "QM", kind: "query", sec: "K2.2", field: "FLD-2.2-001", label: "K2.2 \u203A Batch analyses", q: "Only one batch analysis is attached. Two batches are required.", state: "closed", reply: "Second batch (24-0915) added." }
    ]
  },
  { n: 135, material: "MICROWAX 180", inci: "Cera Microcristallina", supplier: "s9", config: base2(["mineral"], ["EU"], { SF07: true }), components: [C("Cera Microcristallina", "viscosity controlling", "mineral", 100, 100, "63231-60-7")], stage: "supplier-input", age: 6, fill: 0.15 },
  { n: 136, material: "KESTREL Carbomer 30", inci: "Acrylates/C10-30 Alkyl Acrylate Crosspolymer", supplier: "s3", config: base2(["polymer"], ["EU", "UK"], { SF03: true }), components: [C("Acrylates/C10-30 Alkyl Acrylate Crosspolymer", "viscosity controlling", "polymer", 99, 100)], stage: "final-release", age: 64, done: ["REG", "SAF", "QM", "MIC"], decisions: { SAF: "approved", REG: "approved" }, rmesShare: 1, queries: [{ dept: "SAF", kind: "query", sec: "K4.3", label: "K4.3 \u203A SPM scope", q: "Please state whether the polymer is in scope of the SPM restriction (EU 2023/2055) and why.", state: "closed", reply: "Not in scope: the polymer is water-soluble (> 2 g/L at 20 \xB0C), test report attached." }] },
  { n: 137, material: "HYALURO Bio 1.5M", inci: "Sodium Hyaluronate", supplier: "s8", config: base2(["vegetable"], ["EU", "CN"], { SF06: true }), components: [C("Sodium Hyaluronate", "skin conditioning", "vegetable", 98, 100, "9067-32-7")], stage: "review", age: 33, rmesShare: 0.3, queries: [{ dept: "QM", kind: "query", sec: "A3", label: "A3 \u203A GMO", q: "Is the Streptococcus production strain genetically modified? Please describe the separation of GMO and non-GMO lines.", state: "open" }] },
  { n: 138, material: "PHENOX Pure", inci: "Phenoxyethanol", supplier: "s6", config: base2(["petrochemical"], ["EU", "US", "CA"], { SF05: ["preservative"], SF12: false }), components: [C("Phenoxyethanol", "preservative", "petrochemical", 99, 100, "122-99-6")], stage: "review", age: 41, done: ["REG", "QM", "RMM"], decisions: { REG: "approved" }, rmesShare: 0.9 },
  { n: 139, material: "CACAO Butter Deodorised", inci: "Theobroma Cacao Seed Butter", supplier: "s4", config: base2(["vegetable"], ["EU"], { SF09: true, SF12: false }), components: [C("Theobroma Cacao Seed Butter", "emollient", "vegetable", 100, 100, "8002-31-1")], stage: "supplier-input", age: 12, fill: 0.3 },
  {
    n: 140,
    material: "TIOVEIL Pure 77891",
    inci: "Titanium Dioxide",
    supplier: "s7",
    config: base2(["mineral", "vegetable"], ["EU", "US", "CN"], { SF04: true, SF05: ["colorant"] }),
    components: [C("Titanium Dioxide", "UV filter", "mineral", 96, 98, "13463-67-7"), C("Alumina", "coating", "mineral", 1, 3, "1344-28-1", true), C("Stearic Acid", "coating", "vegetable", 0.5, 1.5, "57-11-4", true)],
    stage: "review",
    age: 57,
    rmesShare: 0.6,
    metals: [0.3, 0.12, 2.1],
    findings: [{ crit: "S-A1", text: "Cadmium 0.12 mg/kg above the BDF limit of 0.1 mg/kg \u2014 justification under review", blocking: false }],
    queries: [{ dept: "SAF", kind: "query", sec: "K6.9", label: "K6.9 \u203A Nanomaterials", q: "Please provide the particle size distribution (number-based) and confirm whether the grade is a nanomaterial under Reg. 1223/2009.", state: "open" }, { dept: "REG", kind: "query", sec: "A5", label: "Annex 5 \u203A UV filters", q: "Please confirm approval status as UV filter in China (NMPA) and the USA (OTC monograph).", state: "returned", reply: "Approved in EU and US." }]
  },
  { n: 141, material: "OLIVANE Squalane", inci: "Squalane", supplier: "s4", config: base2(["vegetable"], ["EU", "UK"], { SF12: false }), components: [C("Squalane", "emollient", "vegetable", 100, 100, "111-01-3")], stage: "final-release", age: 70, done: ["REG", "SAF", "QM"], decisions: { SAF: "approved", REG: "approved" }, rmesShare: 1 },
  // Metadata half answered: the origin answer already opened Annex 1, 2 and 9; nothing filled in yet.
  { n: 142, material: "MCT Palm-Coco 60/40", inci: "Caprylic/Capric Triglyceride", supplier: "s5", config: { SF11: ["EU", "TR"], SF01: ["vegetable"] }, palm: true, components: [], stage: "supplier-input", age: 3, fill: 0 },
  { n: 143, material: "LANOCARE Pharma", inci: "Lanolin", supplier: "s1", config: base2(["animal"], ["EU"]), components: [C("Lanolin", "emollient", "animal", 100, 100, "8006-54-0")], stage: "supplier-input", age: 25, fill: 0.8 },
  { n: 144, material: "MARICOLL HC 2000", inci: "Hydrolyzed Collagen", supplier: "s8", config: base2(["animal"], ["EU", "UK"]), components: [C("Hydrolyzed Collagen", "skin conditioning", "animal", 98, 100, "92113-31-0")], stage: "review", age: 29, rmesShare: 0.4, done: ["MIC"], queries: [{ dept: "QM", kind: "document-request", sec: "K1", label: "K1 \u203A BSE/TSE certificate", q: "Animal origin: please upload the BSE/TSE certificate and confirm conformity with Annex II entry 419 of Reg. 1223/2009.", state: "answered", reply: "Fish-derived collagen (Pangasius); TSE statement and EDQM-aligned declaration attached." }, { dept: "QM", kind: "query", sec: "K6.12", label: "K6.12 \u203A GMP/ISO", q: "Your ISO 9001 certificate expires on 31 Oct 2026 \u2014 please upload the renewed certificate when available.", state: "open" }] },
  // Every department has completed; only RMM's own review is pending, so the final-release request still waits.
  {
    n: 145,
    material: "TOCO-Mix 70 NonGMO",
    inci: "Tocopherol",
    supplier: "s10",
    config: base2(["vegetable"], ["EU", "CN"]),
    components: [C("Tocopherol", "antioxidant", "vegetable", 70, 72, "59-02-9"), C("Glycine Soja Oil", "solvent", "vegetable", 28, 30, "8001-22-7")],
    stage: "review",
    age: 36,
    rmesShare: 1,
    done: ["MIC", "QM", "REG", "SAF"],
    decisions: { SAF: "approved", REG: "approved" },
    queries: [{ dept: "REG", kind: "query", sec: "K2.3", field: "FLD-A1-102", label: "K2.3 \u203A Feedstock", q: "Please confirm the soy origin is certified non-GMO and deforestation-free (country of cultivation).", state: "closed", reply: "Certified non-GMO soy from Brazil (RTRS); deforestation-free statement attached." }]
  },
  { n: 146, material: "PANTHENOL 75 L", inci: "Panthenol", supplier: "s6", config: { SF11: ["EU", "US"] }, components: [], stage: "supplier-input", age: 2, fill: 0 },
  { n: 147, material: "CETYLSTEAR PK", inci: "Cetearyl Alcohol", supplier: "s5", config: base2(["vegetable"], ["EU", "UK", "US"]), palm: true, components: [C("Cetearyl Alcohol", "emulsifier", "vegetable", 100, 100, "67762-27-0")], stage: "supplier-input", age: 15, fill: 0.5 },
  {
    n: 148,
    material: "SUNSHIELD OMC",
    inci: "Ethylhexyl Methoxycinnamate",
    supplier: "s6",
    config: base2(["petrochemical"], ["EU", "US", "CA", "CN"], { SF04: true }),
    components: [C("Ethylhexyl Methoxycinnamate", "UV filter", "petrochemical", 98, 100, "5466-77-3"), C("BHT", "antioxidant", "petrochemical", 0, 0.05, "128-37-0", true)],
    stage: "review",
    age: 48,
    done: ["QM", "MIC"],
    decisions: { SAF: "rejected" },
    rmesShare: 1,
    findings: [{ crit: "S-B1", text: "Endocrine-activity data insufficient for the intended leave-on use concentration", blocking: true }],
    queries: [{ dept: "SAF", kind: "query", sec: "K4.1", label: "K4.1 \u203A Toxicity data", q: "Please provide the endocrine screening studies referenced in the SDS section 11.", state: "cannot", reply: "These studies are proprietary to the registrant and cannot be shared." }]
  },
  { n: 149, material: "BISABOLOL Natural", inci: "Bisabolol", supplier: "s4", config: base2(["vegetable"], ["EU"], { SF10: true }), components: [C("Bisabolol", "skin conditioning", "vegetable", 95, 98, "23089-26-1")], stage: "supplier-input", age: 4, fill: 0.1 },
  // Origin without rules (CCU): standard sections only, flagged in RMM's review; RMM asks the supplier directly.
  {
    n: 150,
    material: "CARBONETHANOL 96",
    inci: "Alcohol",
    supplier: "s8",
    config: base2(["ccu"], ["EU"]),
    components: [C("Alcohol", "solvent", "ccu", 96, 96.5, "64-17-5")],
    stage: "review",
    age: 24,
    rmesShare: 0.3,
    priority: "high",
    queries: [{ dept: "RMM", kind: "query", sec: "K2.3", field: "FLD-2.3-13", label: "K2.3 \u203A CCU specification", q: "Your raw material is made from captured CO\u2082, for which Beiersdorf has no rules yet. Please describe the CO\u2082 source and the purification steps and add any certificate (e.g. ISCC PLUS).", state: "open" }]
  },
  { n: 151, material: "SILICA Sphere 5", inci: "Silica", supplier: "s2", config: base2(["mineral"], ["EU", "US"]), components: [C("Silica", "absorbent", "mineral", 100, 100, "7631-86-9")], stage: "cancelled", age: 40 },
  { n: 152, material: "SILKFEEL DM 350", inci: "Dimethicone", supplier: "s3", config: base2(["polymer"], ["EU", "UK", "CA"], { SF03: true }), components: [C("Dimethicone", "emollient", "polymer", 100, 100, "63148-62-9")], stage: "supplier-input", age: 9, fill: 0.1 },
  { n: 153, material: "NIACINAMIDE PC", inci: "Niacinamide", supplier: "s10", config: { SF11: ["EU", "CN"] }, components: [], stage: "supplier-input", age: 1, fill: 0 },
  // Just opened by the primary supplier contact: no metadata answer yet, only the standard and market sections.
  { n: 154, material: "RICEWAX Natural", inci: "Oryza Sativa Bran Wax", supplier: "s1", config: { SF11: ["EU", "US"] }, components: [], stage: "supplier-input", age: 2, fill: 0 }
];
var DOC_FOR = {
  "FLD-K1-001": { kind: "SDS", name: (s2) => `SDS_${s2}_EN_rev4.pdf` },
  "FLD-K1-002": { kind: "CoA", name: (s2) => `CoA_${s2}_batch_2408-117.pdf` },
  "FLD-K1-003": { kind: "Specification", name: (s2) => `Specification_${s2}_rev6.pdf` },
  "FLD-K1-004": { kind: "Statement", name: (s2) => `Statements_${s2}_2026.pdf` },
  "FLD-K1-005": { kind: "Certificate", name: (s2) => `Sustainability_certificates_${s2}.pdf` },
  "FLD-K1-006": { kind: "Certificate", name: (s2) => `BSE_TSE_certificate_${s2}.pdf` },
  "FLD-K1-007": { kind: "Statement", name: (s2) => `Annex_II_419_conformity_${s2}.pdf` },
  "FLD-K1-008": { kind: "Analysis", name: (s2) => `PAH_analysis_${s2}.pdf` },
  "FLD-K1-009": { kind: "Analysis", name: (s2) => `Residual_monomers_${s2}.pdf` },
  "FLD-K1-010": { kind: "Statement", name: (s2) => `SPM_scope_statement_${s2}.pdf` },
  "FLD-2.2-001": { kind: "Analysis", name: (s2) => `Batch_analyses_${s2}_2_batches.pdf` },
  "FLD-5.1-001": { kind: "Analysis", name: (s2) => `Microbiology_report_${s2}.pdf` },
  "FLD-A1-202": { kind: "Analysis", name: (s2) => `Pesticide_screening_${s2}_2024.pdf` },
  "FLD-A1-209": { kind: "Certificate", name: (s2) => `Other_certification_${s2}.pdf` },
  "FLD-A4-104": { kind: "Analysis", name: (s2) => `Viscosity_analysis_${s2}.pdf` }
};
function valueFor(fieldId, spec, sup, rnd) {
  const o = spec.config.SF01 ?? [];
  switch (fieldId) {
    case "FLD-GEN-004":
      return `${sup.name}
${sup.city}, ${sup.country}`;
    case "FLD-GEN-005":
      return `${sup.name} \u2014 plant ${sup.city}
${sup.city}, ${sup.country}`;
    case "FLD-2.1-102":
      return o.includes("petrochemical") || o.includes("polymer") || o.includes("ccu") ? 0 : 1;
    case "FLD-A14-101":
      return spec.metals?.[0] ?? Math.round((0.05 + rnd() * 0.3) * 100) / 100;
    case "FLD-A14-102":
      return spec.metals?.[1] ?? Math.round((0.01 + rnd() * 0.05) * 100) / 100;
    case "FLD-A14-103":
      return spec.metals?.[2] ?? Math.round((0.3 + rnd() * 2) * 10) / 10;
    case "FLD-2.2-002":
      return "Cadmium originates from the natural ilmenite ore; the value is below the EU legal limit and the batch trend is decreasing (see attached trend analysis).";
    case "FLD-2.3-11":
      return "White mineral oil, hydrotreated";
    case "FLD-2.3-12":
      return spec.inci === "Mica" ? "Muscovite mica" : spec.inci;
    case "FLD-2.3-13":
      return "Ethanol from captured industrial CO\u2082 (gas fermentation)";
    case "FLD-2.3-14":
      return "Synthetic polymer \u2014 " + spec.inci;
    case "FLD-2.1-101":
      return o.includes("animal") ? ["Wool"] : ["Seed"];
    case "FLD-2.3-10":
      return sup.country === "Malaysia" ? "Malaysia, Indonesia" : o.includes("animal") ? "New Zealand, Australia" : `${sup.country}, Bulgaria`;
    case "FLD-5.1-002":
      return "Anhydrous material with water activity < 0.6; no microbial growth possible (ISO 29621).";
    case "FLD-A1-102":
      return spec.palm ? "Palm kernel oil, coconut oil" : spec.inci.split(" ")[0];
    case "FLD-A1-103":
      return 100;
    case "FLD-A1-104":
      return spec.components[0]?.concMax ?? 99.5;
    case "FLD-A1-201":
      return !o.includes("mineral") || o.length > 1;
    case "FLD-A1-203":
      return "Mineral origin: no agricultural feedstock, pesticide screening not applicable.";
    case "FLD-A1-204":
      return !!spec.palm;
    case "FLD-A1-206":
      return "Mass Balance";
    case "FLD-A2-101":
      return spec.inci;
    case "FLD-A2-102":
      return o.includes("petrochemical") ? ["Chemical"] : spec.config.SF06 ? ["Biotechnology / Fermentation"] : ["Physical"];
    case "FLD-A4-101":
      return spec.moah ?? 0.4;
    case "FLD-A4-102":
      return "Own value";
    case "FLD-A4-103":
      return 8.2;
    default:
      return void 0;
  }
}
function play(state, spec) {
  const rnd = mulberry32(spec.n * 7919);
  const sup = SUPPLIER_DEFS.find((s3) => s3.id === spec.supplier);
  const [c1, c2] = sup.contacts.map((c) => c[0]);
  const created = NOW - spec.age * DAY;
  const total = spec.stage === "completed" ? spec.lead : spec.age;
  const cut = { open: 0.04, input: 0.45, review: 0.92, release: 1 };
  const at = (share, jitterH = 0) => iso(created + share * total * DAY + jitterH * 36e5 + Math.floor(rnd() * 5) * 36e5);
  const owner = spec.n % 3 === 0 ? "u-rmm-2" : "u-rmm";
  const slug = spec.material.split(" ")[0];
  const id = `CIQ-2026-0${spec.n}`;
  let s2 = createCase(state, owner, { materialName: spec.material, inci: spec.inci, materialNo: `RM-${4e5 + spec.n * 37}`, supplierId: spec.supplier, contactIds: [c1, c2], markets: spec.config.SF11 ?? ["EU"], dueDate: iso(created + 75 * DAY), priority: spec.priority ?? "normal", ownerId: owner }, iso(created), id).state;
  s2 = { ...s2, cases: s2.cases.map((c) => c.id === id ? { ...c, manufacturer: sup.name, site: `${sup.city}, ${sup.country}` } : c) };
  s2 = saveConfig(s2, c1, id, spec.config, at(cut.open));
  if (spec.stage === "cancelled") return cancelCase(s2, owner, id, "Raw material no longer relevant: project 'Aurora' stopped by the brand team", at(0.7));
  const caseNow = () => s2.cases.find((c) => c.id === id);
  if (spec.components.length) s2 = setComponents(s2, c1, id, spec.components.map((r, i) => ({ ...r, id: `c${i + 1}` })), at(cut.open + 0.02));
  const fields = FIELDS.filter((f) => scopeOf(caseNow(), f.sectionId)?.applicability === "mandatory" || f.sectionId === "K5.1" && f.id === "FLD-5.1-002");
  const visibleCount = fields.filter((f) => isVisible(f, caseNow())).length;
  const limit = spec.stage === "supplier-input" ? Math.floor(visibleCount * (spec.fill ?? 0.5)) : fields.length;
  let k = 0;
  for (const f of fields) {
    const c = caseNow();
    if (!isVisible(f, c)) continue;
    if (k >= limit) break;
    const who = k % 3 === 2 ? c2 : c1;
    const t = at(cut.open + 0.02 + k / fields.length * (cut.input - cut.open - 0.04));
    if (f.type === "file") {
      const d = DOC_FOR[f.id];
      if (d) s2 = uploadDocument(s2, who, id, { name: d.name(slug), kind: d.kind, sectionId: f.sectionId, fieldId: f.id }, t).state;
    } else if (f.id === "FLD-5.1-002") {
      if (spec.config.SF12 === false) s2 = setJustification(s2, who, id, f.id, String(valueFor(f.id, spec, sup, rnd)), t);
    } else if (!(f.id in c.answers) || c.answers[f.id] === "") {
      const v = valueFor(f.id, spec, sup, rnd);
      if (v !== void 0) s2 = setAnswer(s2, who, id, f.id, v, t);
    }
    k++;
  }
  if (spec.stage !== "supplier-input") {
    for (const f of FIELDS) {
      const c = caseNow();
      if (scopeOf(c, f.sectionId)?.applicability !== "mandatory" || !isVisible(f, c) || f.required === "optional") continue;
      if (c.answers[f.id] !== void 0 || c.justifications[f.id]) continue;
      const v = f.type === "file" && DOC_FOR[f.id] ? null : valueFor(f.id, spec, sup, rnd);
      if (f.type === "file" && DOC_FOR[f.id]) s2 = uploadDocument(s2, c1, id, { name: DOC_FOR[f.id].name(slug), kind: DOC_FOR[f.id].kind, sectionId: f.sectionId, fieldId: f.id }, at(cut.input - 0.02)).state;
      else if (v !== void 0 && v !== null) s2 = setAnswer(s2, c1, id, f.id, v, at(cut.input - 0.02));
    }
  }
  if (spec.stage === "supplier-input") return s2;
  s2 = confirmCompleteness(s2, c1, id, at(cut.input));
  const reviewSpan = cut.review - cut.input;
  const historic = spec.stage === "completed" && !spec.queries ? [
    { dept: "QM", kind: "document-request", sec: "K1", field: "FLD-K1-002", label: "K1 \u203A Certificate of analysis", q: "Please provide a CoA from a batch produced within the last 12 months.", state: "closed", reply: "Current CoA (batch 2603-044) uploaded." },
    { dept: "REG", kind: "query", sec: "K2.1", row: "c1", label: "K2.1 \u203A component 1 \u203A CAS number", q: "The CAS number does not match the INCI name. Please check.", state: "closed", reply: "Corrected \u2014 typo in the check digit." },
    { dept: "SAF", kind: "query", sec: "K2.2", field: "FLD-2.2-001", label: "K2.2 \u203A Batch analyses", q: "Please add the limit of quantification for the heavy-metal method.", state: "closed", reply: "LOQ 0.01 mg/kg (ICP-MS), added to the report." },
    { dept: "RMM", kind: "query", sec: "K2.3", field: "FLD-A1-102", label: "K2.3 \u203A Feedstock", q: "Please confirm the country of cultivation for the feedstock.", state: "closed", reply: "Spain and Portugal." }
  ].filter((q, i) => spec.n % 5 >= 2 && i <= spec.n % 2 + 1 && caseNow().reviews.some((r) => r.dept === q.dept)) : [];
  [...spec.queries ?? [], ...historic].forEach((q, i) => {
    const t0 = cut.input + reviewSpan * (0.1 + i * 0.12);
    const reviewer = caseNow().reviews.find((r) => r.dept === q.dept)?.assigneeId ?? `u-${q.dept.toLowerCase()}`;
    s2 = raiseOpenPoint(s2, reviewer, id, { dept: q.dept, kind: q.kind, ref: { sectionId: q.sec, fieldId: q.field, rowId: q.row, label: q.label }, question: q.q, justification: q.dept === "RMM" ? "Needed for RMM's review of the whole CIQ" : "Needed for the department assessment", dueDate: iso(Date.parse(at(t0)) + (spec.n === 140 ? 6 : 14) * DAY) }, at(t0));
    const op = caseNow().openPoints.at(-1);
    if (q.state === "open") return;
    s2 = supplierRespond(s2, i % 2 ? c2 : c1, id, op.id, { text: q.reply ?? "Done.", cannotProvide: q.state === "cannot", documentName: q.kind === "document-request" ? `${slug}_${q.sec.replace(/\W/g, "")}_update.pdf` : void 0 }, at(t0 + reviewSpan * 0.08));
    if (q.state === "closed" && (spec.n + i) % 4 === 0) {
      s2 = reviewResponse(s2, reviewer, id, op.id, "return", "Please attach the document itself, not only the reference.", at(t0 + reviewSpan * 0.1));
      s2 = supplierRespond(s2, i % 2 ? c1 : c2, id, op.id, { text: "Document attached as requested.", documentName: `${slug}_${q.sec.replace(/\W/g, "")}_v2.pdf` }, at(t0 + reviewSpan * 0.16));
    }
    if (q.state === "closed") s2 = reviewResponse(s2, reviewer, id, op.id, "accept", "Accepted, thank you.", at(t0 + reviewSpan * 0.2));
    if (q.state === "returned") s2 = reviewResponse(s2, reviewer, id, op.id, "return", "Not sufficient: we need the certificate itself, not an audit letter.", at(t0 + reviewSpan * 0.12));
  });
  const rm = caseNow().rmes;
  if (rm) {
    const share = spec.stage === "completed" || spec.stage === "final-release" ? 1 : spec.rmesShare ?? 0.5;
    rm.criteria.forEach((cr, i) => {
      if (i >= Math.round(rm.criteria.length * share)) return;
      const reviewer = caseNow().reviews.find((r) => r.dept === cr.dept)?.assigneeId ?? `u-${cr.dept.toLowerCase()}`;
      const res = cr.limit && !cr.limit.pass ? "negative" : cr.part === "A" ? "available" : cr.part === "B" ? "plausible" : "listed";
      s2 = recordCriterion(s2, reviewer, id, cr.id, res, res === "negative" ? `${cr.limit.substance} ${cr.limit.value} ${cr.limit.unit} > limit ${cr.limit.limit}` : "", at(cut.input + reviewSpan * (0.2 + i / rm.criteria.length * 0.6)));
    });
    for (const f of spec.findings ?? []) s2 = addFinding(s2, "u-saf", id, f.crit, f.text, f.blocking, at(cut.input + reviewSpan * 0.4));
  }
  const decide = (d, dec) => {
    const by = caseNow().reviews.find((r) => r.dept === d)?.assigneeId ?? `u-${d.toLowerCase()}`;
    s2 = rmesDecision(s2, by, id, d, dec, dec === "rejected" ? "Safety assessment cannot be concluded for leave-on use without endocrine data" : "", at(cut.review - 0.04));
  };
  const all = caseNow().reviews.map((r) => r.dept).sort((a, b) => Number(a === "RMM") - Number(b === "RMM"));
  const doneList = spec.stage === "completed" || spec.stage === "final-release" ? all : spec.done ?? [];
  for (const [d, dec] of Object.entries(spec.decisions ?? {})) decide(d, dec);
  if (spec.stage === "completed") {
    for (const d of ["SAF", "REG"]) if (all.includes(d) && !caseNow().reviews.find((r) => r.dept === d)?.decision) decide(d, "approved");
  }
  doneList.forEach((d, i) => {
    if (!all.includes(d)) return;
    const by = caseNow().reviews.find((r) => r.dept === d).assigneeId;
    s2 = completeReview(s2, by, id, d, at(cut.input + reviewSpan * (0.55 + i * 0.08)));
  });
  if (spec.stage === "completed") s2 = finalRelease(s2, c1, id, at(cut.release - 0.01));
  return s2;
}
var cached = null;
function buildRichFixture() {
  if (cached) return structuredClone(cached);
  let s2 = baseState([...ROLE_HOLDERS, ...EXTRA_INTERNAL, ...SUPPLIER_DEFS.flatMap(contactsOfDef)], SUPPLIER_DEFS.map(supplierOf));
  for (const spec of SPECS) s2 = play(s2, spec);
  s2 = { ...s2, cases: [...s2.cases].sort((a, b) => b.createdAt.localeCompare(a.createdAt)), toasts: [] };
  cached = s2;
  return structuredClone(s2);
}
export {
  actions_exports as A,
  BASE_RULE_DATA,
  BDF_SET_FIELDS,
  BUILTIN_FIELDS,
  BUILTIN_SECTIONS,
  CONFIG_QUESTIONS,
  DEPT_LABEL,
  DEPT_SHORT,
  EVIDENCE_FIELDS,
  FIRST_PAIR,
  HEAVY_METAL_LIMITS,
  LIMIT_SET_VERSION,
  MESSAGE_ACTION_LABEL,
  NOW_ISO,
  PHASE_LABEL,
  REFERENCE_MATERIALS,
  REVIEW_DEPTS,
  REVIEW_TRACK_DEPTS,
  ROLE_HOLDERS,
  RS1,
  RS2,
  SUPPLIER_DEFS,
  SUPPLIER_MESSAGE_TEXT,
  TURKEY_RULE_DATA,
  UNDEFINED_ORIGINS,
  audit as auditCase,
  baseState,
  buildFinalDocument,
  buildRichFixture,
  buildSeed,
  builtinTemplateData,
  canReactivate,
  caseContactIds,
  caseLink,
  check,
  checkInvariants,
  closedByCancellation,
  completenessBlockers,
  contactsOfDef,
  currentPair,
  deriveScope,
  diffScope,
  fieldOf,
  fmtDate,
  getCase,
  growScope,
  hasUndefinedOrigin,
  hasValue,
  internalMail,
  internalStrings,
  isActiveUser,
  isClosed,
  isSlotKey,
  logEvent,
  makeUser,
  mapCase,
  mentionRecipients,
  noteMentionMails,
  pairLabel,
  parseMentions,
  pointResult,
  preparedDraft,
  publishDraft,
  raiserOf,
  releaseBlockers,
  requestedDocStatus,
  requestedDocuments,
  reviewBlockers,
  reviewLink,
  ruleSet,
  runReminders,
  sectionOf,
  sendMail,
  setContactActive,
  setPhase,
  slotKey,
  storableSlots,
  supplierLink,
  supplierMail,
  supplierOf,
  syncRegistry,
  templateSections,
  threadRounds,
  undefinedOrigins,
  unresolved,
  updateContact,
  userOf,
  validateCaseContacts,
  verifyFinalDocument,
  wasRefused
};
