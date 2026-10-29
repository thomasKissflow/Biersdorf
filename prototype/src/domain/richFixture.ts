// Rich scenario fixture: 36 historic and running cases over 10 fictional suppliers, produced by REPLAYING the real
// actions with historic timestamps, so audit trails, confirmations, phase history, mails and reports are consistent.
// Used by the unit tests and by the supplier portal's demo preview (src/portal/demo). The prototype app itself starts
// empty (seed.ts). All people, suppliers and documents are fictional. INCI names are real ingredient names.

import {
  cancelCase,
  completeReview,
  confirmCompleteness,
  createCase,
  finalRelease,
  raiseOpenPoint,
  reviewResponse,
  rmesDecision,
  saveConfig,
  setAnswer,
  setComponents,
  setJustification,
  supplierRespond,
  uploadDocument,
} from "./actions";
import { FIELDS } from "./catalog";
import { ROLE_HOLDERS, SUPPLIER_DEFS, baseState, contactsOfDef, makeUser, supplierOf } from "./seed";
import { DAY, NOW_ISO, isVisible, scopeOf } from "./selectors";
import type { AppState, ComponentRow, ConfigAnswers, DocKind, Market, OpenPointKind, ReviewDept, User } from "./types";

function mulberry32(a: number) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const NOW = Date.parse(NOW_ISO);
const iso = (ms: number) => new Date(ms).toISOString();

/** Second team members, so reassignment and "someone else's point" can be tested. */
const EXTRA_INTERNAL: User[] = [
  makeUser("u-rmm-2", "Jan Petersen", "Raw Material Manager", "internal", "RMM"),
  makeUser("u-reg-2", "Lea Schmitt", "Regulatory Affairs Specialist", "internal", "REG"),
  makeUser("u-saf-2", "Dr. Ole Brandt", "Toxicologist", "internal", "SAF"),
  makeUser("u-qm-2", "Marco Weber", "Supplier Quality Engineer", "internal", "QM"),
];

type Q = { dept: ReviewDept; kind: OpenPointKind; sec: string; field?: string; row?: string; label: string; q: string; state: "open" | "answered" | "closed" | "returned" | "cannot"; reply?: string };

interface Spec {
  n: number;
  material: string;
  inci: string;
  supplier: string;
  config: ConfigAnswers;
  /** Palm-based feedstock (answered in Annex 1, FLD-A1-204; the metadata question SF-08 was dropped on 28 Oct). */
  palm?: true;
  components: Omit<ComponentRow, "id">[];
  stage: "supplier-input" | "review" | "final-release" | "completed" | "cancelled";
  age: number; // days since creation
  lead?: number; // for completed cases: total lead time in days
  fill?: number; // supplier-input completion fraction
  queries?: Q[];
  done?: ReviewDept[]; // completed reviews (RMM included); final-release and completed cases complete every track
  decisions?: Partial<Record<"SAF" | "REG", "approved" | "rejected">>;
  priority?: "high";
  metals?: [number, number, number];
  moah?: number;
  extra?: Record<string, unknown>;
}

const C = (inci: string, fn: string, origin: ComponentRow["origin"], min: number, max: number, cas?: string, additive = false): Omit<ComponentRow, "id"> => ({ inci, fn, origin, concMin: min, concMax: max, cas, additive });

const base = (o: ConfigAnswers["SF01"], m: Market[], extra: ConfigAnswers = {}): ConfigAnswers => ({ SF01: o, SF03: false, SF04: false, SF05: [], SF06: false, SF07: false, SF09: false, SF10: false, SF11: m, SF12: true, ...extra });

const SPECS: Spec[] = [
  // ---- historic, completed (reports)
  { n: 101, material: "AMANDEL 100 Refined", inci: "Prunus Amygdalus Dulcis Oil", supplier: "s4", config: base(["vegetable"], ["EU", "UK"]), components: [C("Prunus Amygdalus Dulcis Oil", "emollient", "vegetable", 99.5, 100, "8007-69-0"), C("Tocopherol", "antioxidant", "vegetable", 0, 0.5, "59-02-9", true)], stage: "completed", age: 268, lead: 96 },
  { n: 103, material: "ZINCOX Micro 30", inci: "Zinc Oxide", supplier: "s7", config: base(["mineral"], ["EU", "US"], { SF04: true }), components: [C("Zinc Oxide", "UV filter", "mineral", 98, 100, "1314-13-2")], stage: "completed", age: 251, lead: 104 },
  { n: 105, material: "CERA ALBA Pharma", inci: "Cera Alba", supplier: "s1", config: base(["animal"], ["EU"]), components: [C("Cera Alba", "consistency agent", "animal", 100, 100, "8012-89-3")], stage: "completed", age: 233, lead: 71 },
  { n: 108, material: "KESTREL PQ-10", inci: "Polyquaternium-10", supplier: "s3", config: base(["polymer"], ["EU", "UK", "CA"], { SF03: true }), components: [C("Polyquaternium-10", "conditioning agent", "polymer", 99, 100, "68610-92-4")], stage: "completed", age: 214, lead: 88 },
  { n: 110, material: "ALLANTOIN Pure", inci: "Allantoin", supplier: "s10", config: base(["petrochemical"], ["EU", "CN"]), components: [C("Allantoin", "skin conditioning", "petrochemical", 99, 100, "97-59-6")], stage: "completed", age: 196, lead: 77 },
  { n: 112, material: "CITRACID Ferm", inci: "Citric Acid", supplier: "s8", config: base(["vegetable"], ["EU"], { SF06: true }), components: [C("Citric Acid", "pH adjuster", "vegetable", 99.5, 100, "77-92-9")], stage: "completed", age: 180, lead: 64 },
  { n: 114, material: "KARITE Butter Organic", inci: "Butyrospermum Parkii Butter", supplier: "s4", config: base(["vegetable"], ["EU", "UK", "US"]), components: [C("Butyrospermum Parkii Butter", "emollient", "vegetable", 100, 100, "194043-92-0")], stage: "completed", age: 163, lead: 92 },
  { n: 116, material: "TALCUM Superfine", inci: "Talc", supplier: "s2", config: base(["mineral"], ["EU"], { SF12: false }), components: [C("Talc", "absorbent", "mineral", 100, 100, "14807-96-6")], stage: "completed", age: 150, lead: 58 },
  { n: 118, material: "IPM Palm Ester", inci: "Isopropyl Myristate", supplier: "s5", config: base(["vegetable"], ["EU", "CN"]), palm: true, components: [C("Isopropyl Myristate", "emollient", "vegetable", 99, 100, "110-27-0")], stage: "completed", age: 131, lead: 83 },
  { n: 120, material: "OZOKERITE 77", inci: "Ozokerite", supplier: "s9", config: base(["petrochemical"], ["EU", "UK"], { SF07: true }), components: [C("Ozokerite", "viscosity controlling", "petrochemical", 100, 100, "8021-55-4")], stage: "completed", age: 118, lead: 101 },
  { n: 122, material: "XANTHAN Clear", inci: "Xanthan Gum", supplier: "s8", config: base(["vegetable"], ["EU", "US"], { SF06: true }), components: [C("Xanthan Gum", "viscosity controlling", "vegetable", 99, 100, "11138-66-2")], stage: "completed", age: 101, lead: 55 },
  { n: 124, material: "JOJOBA Golden", inci: "Simmondsia Chinensis Seed Oil", supplier: "s4", config: base(["vegetable"], ["EU", "US", "CA"]), components: [C("Simmondsia Chinensis Seed Oil", "emollient", "vegetable", 100, 100, "61789-91-1")], stage: "completed", age: 84, lead: 61 },

  // ---- active pipeline
  {
    n: 131, material: "HELIOSOFT 200", inci: "Helianthus Annuus Seed Oil", supplier: "s1", config: base(["vegetable"], ["EU", "UK"]),
    components: [C("Helianthus Annuus Seed Oil", "emollient", "vegetable", 99.4, 99.9, "8001-21-6"), C("Tocopherol", "antioxidant", "vegetable", 0.1, 0.6, "59-02-9", true)],
    stage: "review", age: 46, done: ["MIC"],
    queries: [
      { dept: "REG", kind: "query", sec: "K2.1", row: "c2", label: "K2.1 › component 2 › CAS number", q: "Component 2 (Tocopherol) — please confirm the CAS number: is it the natural (10191-41-0 / 59-02-9) or synthetic form?", state: "open" },
      { dept: "REG", kind: "document-request", sec: "A1", field: "FLD-A1-202", label: "Annex 1 › Pesticides analysis (v1)", q: "The pesticide screening is older than 24 months. Please upload a current analysis.", state: "answered", reply: "Updated multi-residue screening from August 2026 attached." },
      { dept: "QM", kind: "query", sec: "K1", field: "FLD-K1-002", label: "K1 › Certificate of analysis", q: "CoA batch 2408-117 shows peroxide value 4.8 meq/kg — please confirm the specification limit (≤ 5 or ≤ 10?).", state: "closed", reply: "Specification limit is ≤ 5 meq/kg; see specification rev. 6, section 3." },
    ],
  },
  {
    n: 132, material: "GLYCERA PK 99.7", inci: "Glycerin", supplier: "s5", config: base(["vegetable"], ["EU", "CN", "US"], { SF09: true }), palm: true,
    components: [C("Glycerin", "humectant", "vegetable", 99.5, 99.8, "56-81-5"), C("Aqua", "solvent", "vegetable", 0.2, 0.5, "7732-18-5")],
    stage: "review", age: 38,
    queries: [
      { dept: "REG", kind: "document-request", sec: "A1", field: "FLD-A1-206", label: "Annex 1 › RSPO certification", q: "The RSPO supply-chain certificate expired in March 2026. Please upload the renewed certificate and state the RSPO number on the CoA.", state: "returned", reply: "Renewal audit is scheduled; attached is the audit confirmation letter." },
      { dept: "SUS", kind: "query", sec: "K6.17", label: "K6.17 › EUDR scope", q: "Please confirm whether the palm feedstock is in EUDR scope and provide the geolocation statement.", state: "open" },
      { dept: "REG", kind: "query", sec: "K6.13", label: "K6.13 › China IECIC", q: "Please confirm the IECIC listing name used for the Chinese market.", state: "answered", reply: "Listed in IECIC 2021 as 甘油 (Glycerin), entry no. 03329." },
    ],
  },
  { n: 133, material: "LUSTRA Mica White", inci: "Mica", supplier: "s7", config: base(["mineral"], ["EU", "US"], { SF05: ["colorant"] }), components: [C("Mica", "colorant", "mineral", 100, 100, "12001-26-2")], stage: "supplier-input", age: 20, fill: 0.6, priority: "high" },
  {
    n: 134, material: "PARAFLUID 70 Pharma", inci: "Paraffinum Liquidum", supplier: "s9", config: base(["petrochemical"], ["EU", "UK", "CA"], { SF07: true, SF12: false }),
    components: [C("Paraffinum Liquidum", "emollient", "petrochemical", 100, 100, "8042-47-5")], stage: "review", age: 52, moah: 1.6, priority: "high",
    queries: [
      { dept: "SAF", kind: "query", sec: "A4", field: "FLD-A4-101", label: "Annex 4 › MOAH concentration", q: "Your MOAH value of 1.6 mg/kg exceeds our threshold. Please provide the full HPLC-GC-FID report incl. the MOAH fraction ≥ C25, or a lower-MOAH grade.", state: "open" },
      { dept: "QM", kind: "query", sec: "K2.2", field: "FLD-2.2-001", label: "K2.2 › Batch analyses", q: "Only one batch analysis is attached. Two batches are required.", state: "closed", reply: "Second batch (24-0915) added." },
    ],
  },
  { n: 135, material: "MICROWAX 180", inci: "Cera Microcristallina", supplier: "s9", config: base(["mineral"], ["EU"], { SF07: true }), components: [C("Cera Microcristallina", "viscosity controlling", "mineral", 100, 100, "63231-60-7")], stage: "supplier-input", age: 6, fill: 0.15 },
  { n: 136, material: "KESTREL Carbomer 30", inci: "Acrylates/C10-30 Alkyl Acrylate Crosspolymer", supplier: "s3", config: base(["polymer"], ["EU", "UK"], { SF03: true }), components: [C("Acrylates/C10-30 Alkyl Acrylate Crosspolymer", "viscosity controlling", "polymer", 99, 100)], stage: "final-release", age: 64, done: ["REG", "SAF", "QM", "MIC"], decisions: { SAF: "approved", REG: "approved" }, queries: [{ dept: "SAF", kind: "query", sec: "K4.3", label: "K4.3 › SPM scope", q: "Please state whether the polymer is in scope of the SPM restriction (EU 2023/2055) and why.", state: "closed", reply: "Not in scope: the polymer is water-soluble (> 2 g/L at 20 °C), test report attached." }] },
  { n: 137, material: "HYALURO Bio 1.5M", inci: "Sodium Hyaluronate", supplier: "s8", config: base(["vegetable"], ["EU", "CN"], { SF06: true }), components: [C("Sodium Hyaluronate", "skin conditioning", "vegetable", 98, 100, "9067-32-7")], stage: "review", age: 33, queries: [{ dept: "QM", kind: "query", sec: "A3", label: "A3 › GMO", q: "Is the Streptococcus production strain genetically modified? Please describe the separation of GMO and non-GMO lines.", state: "open" }] },
  { n: 138, material: "PHENOX Pure", inci: "Phenoxyethanol", supplier: "s6", config: base(["petrochemical"], ["EU", "US", "CA"], { SF05: ["preservative"], SF12: false }), components: [C("Phenoxyethanol", "preservative", "petrochemical", 99, 100, "122-99-6")], stage: "review", age: 41, done: ["REG", "QM", "RMM"], decisions: { REG: "approved" } },
  { n: 139, material: "CACAO Butter Deodorised", inci: "Theobroma Cacao Seed Butter", supplier: "s4", config: base(["vegetable"], ["EU"], { SF09: true, SF12: false }), components: [C("Theobroma Cacao Seed Butter", "emollient", "vegetable", 100, 100, "8002-31-1")], stage: "supplier-input", age: 12, fill: 0.3 },
  {
    n: 140, material: "TIOVEIL Pure 77891", inci: "Titanium Dioxide", supplier: "s7", config: base(["mineral", "vegetable"], ["EU", "US", "CN"], { SF04: true, SF05: ["colorant"] }),
    components: [C("Titanium Dioxide", "UV filter", "mineral", 96, 98, "13463-67-7"), C("Alumina", "coating", "mineral", 1, 3, "1344-28-1", true), C("Stearic Acid", "coating", "vegetable", 0.5, 1.5, "57-11-4", true)],
    stage: "review", age: 57, metals: [0.3, 0.12, 2.1],
    queries: [{ dept: "SAF", kind: "query", sec: "K6.9", label: "K6.9 › Nanomaterials", q: "Please provide the particle size distribution (number-based) and confirm whether the grade is a nanomaterial under Reg. 1223/2009.", state: "open" }, { dept: "REG", kind: "query", sec: "A5", label: "Annex 5 › UV filters", q: "Please confirm approval status as UV filter in China (NMPA) and the USA (OTC monograph).", state: "returned", reply: "Approved in EU and US." }],
  },
  { n: 141, material: "OLIVANE Squalane", inci: "Squalane", supplier: "s4", config: base(["vegetable"], ["EU", "UK"], { SF12: false }), components: [C("Squalane", "emollient", "vegetable", 100, 100, "111-01-3")], stage: "final-release", age: 70, done: ["REG", "SAF", "QM"], decisions: { SAF: "approved", REG: "approved" } },
  // Metadata half answered: the origin answer already opened Annex 1, 2 and 9; nothing filled in yet.
  { n: 142, material: "MCT Palm-Coco 60/40", inci: "Caprylic/Capric Triglyceride", supplier: "s5", config: { SF11: ["EU", "TR"], SF01: ["vegetable"] }, palm: true, components: [], stage: "supplier-input", age: 3, fill: 0 },
  { n: 143, material: "LANOCARE Pharma", inci: "Lanolin", supplier: "s1", config: base(["animal"], ["EU"]), components: [C("Lanolin", "emollient", "animal", 100, 100, "8006-54-0")], stage: "supplier-input", age: 25, fill: 0.8 },
  { n: 144, material: "MARICOLL HC 2000", inci: "Hydrolyzed Collagen", supplier: "s8", config: base(["animal"], ["EU", "UK"]), components: [C("Hydrolyzed Collagen", "skin conditioning", "animal", 98, 100, "92113-31-0")], stage: "review", age: 29, done: ["MIC"], queries: [{ dept: "QM", kind: "document-request", sec: "K1", label: "K1 › BSE/TSE certificate", q: "Animal origin: please upload the BSE/TSE certificate and confirm conformity with Annex II entry 419 of Reg. 1223/2009.", state: "answered", reply: "Fish-derived collagen (Pangasius); TSE statement and EDQM-aligned declaration attached." }, { dept: "QM", kind: "query", sec: "K6.12", label: "K6.12 › GMP/ISO", q: "Your ISO 9001 certificate expires on 31 Oct 2026 — please upload the renewed certificate when available.", state: "open" }] },
  // Every department has completed; only RMM's own review is pending, so the final-release request still waits.
  {
    n: 145, material: "TOCO-Mix 70 NonGMO", inci: "Tocopherol", supplier: "s10", config: base(["vegetable"], ["EU", "CN"]), components: [C("Tocopherol", "antioxidant", "vegetable", 70, 72, "59-02-9"), C("Glycine Soja Oil", "solvent", "vegetable", 28, 30, "8001-22-7")],
    stage: "review", age: 36, done: ["MIC", "QM", "REG", "SAF"], decisions: { SAF: "approved", REG: "approved" }, queries: [{ dept: "REG", kind: "query", sec: "K2.3", field: "FLD-A1-102", label: "K2.3 › Feedstock", q: "Please confirm the soy origin is certified non-GMO and deforestation-free (country of cultivation).", state: "closed", reply: "Certified non-GMO soy from Brazil (RTRS); deforestation-free statement attached." }],
  },
  { n: 146, material: "PANTHENOL 75 L", inci: "Panthenol", supplier: "s6", config: { SF11: ["EU", "US"] }, components: [], stage: "supplier-input", age: 2, fill: 0 },
  { n: 147, material: "CETYLSTEAR PK", inci: "Cetearyl Alcohol", supplier: "s5", config: base(["vegetable"], ["EU", "UK", "US"]), palm: true, components: [C("Cetearyl Alcohol", "emulsifier", "vegetable", 100, 100, "67762-27-0")], stage: "supplier-input", age: 15, fill: 0.5 },
  {
    n: 148, material: "SUNSHIELD OMC", inci: "Ethylhexyl Methoxycinnamate", supplier: "s6", config: base(["petrochemical"], ["EU", "US", "CA", "CN"], { SF04: true }),
    components: [C("Ethylhexyl Methoxycinnamate", "UV filter", "petrochemical", 98, 100, "5466-77-3"), C("BHT", "antioxidant", "petrochemical", 0, 0.05, "128-37-0", true)],
    stage: "review", age: 48, done: ["QM", "MIC"], decisions: { SAF: "rejected" },
    queries: [{ dept: "SAF", kind: "query", sec: "K4.1", label: "K4.1 › Toxicity data", q: "Please provide the endocrine screening studies referenced in the SDS section 11.", state: "cannot", reply: "These studies are proprietary to the registrant and cannot be shared." }],
  },
  { n: 149, material: "BISABOLOL Natural", inci: "Bisabolol", supplier: "s4", config: base(["vegetable"], ["EU"], { SF10: true }), components: [C("Bisabolol", "skin conditioning", "vegetable", 95, 98, "23089-26-1")], stage: "supplier-input", age: 4, fill: 0.1 },
  // Origin without rules (CCU): standard sections only, flagged in RMM's review; RMM asks the supplier directly.
  {
    n: 150, material: "CARBONETHANOL 96", inci: "Alcohol", supplier: "s8", config: base(["ccu"], ["EU"]), components: [C("Alcohol", "solvent", "ccu", 96, 96.5, "64-17-5")], stage: "review", age: 24, priority: "high",
    queries: [{ dept: "RMM", kind: "query", sec: "K2.3", field: "FLD-2.3-13", label: "K2.3 › CCU specification", q: "Your raw material is made from captured CO₂, for which Beiersdorf has no rules yet. Please describe the CO₂ source and the purification steps and add any certificate (e.g. ISCC PLUS).", state: "open" }],
  },
  { n: 151, material: "SILICA Sphere 5", inci: "Silica", supplier: "s2", config: base(["mineral"], ["EU", "US"]), components: [C("Silica", "absorbent", "mineral", 100, 100, "7631-86-9")], stage: "cancelled", age: 40 },
  { n: 152, material: "SILKFEEL DM 350", inci: "Dimethicone", supplier: "s3", config: base(["polymer"], ["EU", "UK", "CA"], { SF03: true }), components: [C("Dimethicone", "emollient", "polymer", 100, 100, "63148-62-9")], stage: "supplier-input", age: 9, fill: 0.1 },
  { n: 153, material: "NIACINAMIDE PC", inci: "Niacinamide", supplier: "s10", config: { SF11: ["EU", "CN"] }, components: [], stage: "supplier-input", age: 1, fill: 0 },
  // Just opened by the primary supplier contact: no metadata answer yet, only the standard and market sections.
  { n: 154, material: "RICEWAX Natural", inci: "Oryza Sativa Bran Wax", supplier: "s1", config: { SF11: ["EU", "US"] }, components: [], stage: "supplier-input", age: 2, fill: 0 },
];

const DOC_FOR: Record<string, { kind: DocKind; name: (slug: string) => string }> = {
  "FLD-K1-001": { kind: "SDS", name: (s) => `SDS_${s}_EN_rev4.pdf` },
  "FLD-K1-002": { kind: "CoA", name: (s) => `CoA_${s}_batch_2408-117.pdf` },
  "FLD-K1-003": { kind: "Specification", name: (s) => `Specification_${s}_rev6.pdf` },
  "FLD-K1-004": { kind: "Statement", name: (s) => `Statements_${s}_2026.pdf` },
  "FLD-K1-005": { kind: "Certificate", name: (s) => `Sustainability_certificates_${s}.pdf` },
  "FLD-K1-006": { kind: "Certificate", name: (s) => `BSE_TSE_certificate_${s}.pdf` },
  "FLD-K1-007": { kind: "Statement", name: (s) => `Annex_II_419_conformity_${s}.pdf` },
  "FLD-K1-008": { kind: "Analysis", name: (s) => `PAH_analysis_${s}.pdf` },
  "FLD-K1-009": { kind: "Analysis", name: (s) => `Residual_monomers_${s}.pdf` },
  "FLD-K1-010": { kind: "Statement", name: (s) => `SPM_scope_statement_${s}.pdf` },
  "FLD-2.2-001": { kind: "Analysis", name: (s) => `Batch_analyses_${s}_2_batches.pdf` },
  "FLD-5.1-001": { kind: "Analysis", name: (s) => `Microbiology_report_${s}.pdf` },
  "FLD-A1-202": { kind: "Analysis", name: (s) => `Pesticide_screening_${s}_2024.pdf` },
  "FLD-A1-209": { kind: "Certificate", name: (s) => `Other_certification_${s}.pdf` },
  "FLD-A4-104": { kind: "Analysis", name: (s) => `Viscosity_analysis_${s}.pdf` },
};

function valueFor(fieldId: string, spec: Spec, sup: (typeof SUPPLIER_DEFS)[number], rnd: () => number): unknown {
  const o = spec.config.SF01 ?? [];
  switch (fieldId) {
    case "FLD-GEN-004":
      return `${sup.name}\n${sup.city}, ${sup.country}`;
    case "FLD-GEN-005":
      return `${sup.name} — plant ${sup.city}\n${sup.city}, ${sup.country}`;
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
      return "Ethanol from captured industrial CO₂ (gas fermentation)";
    case "FLD-2.3-14":
      return "Synthetic polymer — " + spec.inci;
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
      return undefined;
  }
}

function play(state: AppState, spec: Spec): AppState {
  const rnd = mulberry32(spec.n * 7919);
  const sup = SUPPLIER_DEFS.find((s) => s.id === spec.supplier)!;
  const [c1, c2] = sup.contacts.map((c) => c[0]);
  const created = NOW - spec.age * DAY;
  const total = spec.stage === "completed" ? spec.lead! : spec.age;
  // cut points (share of the lifetime): the supplier opens the CIQ, confirms completeness, the reviews end, the release
  const cut = { open: 0.04, input: 0.45, review: 0.92, release: 1 };
  const at = (share: number, jitterH = 0) => iso(created + share * total * DAY + jitterH * 3600_000 + Math.floor(rnd() * 5) * 3600_000);
  const owner = spec.n % 3 === 0 ? "u-rmm-2" : "u-rmm";
  const slug = spec.material.split(" ")[0];
  const id = `CIQ-2026-0${spec.n}`;

  let s = createCase(state, owner, { materialName: spec.material, inci: spec.inci, materialNo: `RM-${400000 + spec.n * 37}`, supplierId: spec.supplier, contactIds: [c1, c2], markets: spec.config.SF11 ?? ["EU"], dueDate: iso(created + 75 * DAY), priority: spec.priority ?? "normal", ownerId: owner }, iso(created), id).state;
  s = { ...s, cases: s.cases.map((c) => (c.id === id ? { ...c, manufacturer: sup.name, site: `${sup.city}, ${sup.country}` } : c)) };
  // The supplier opens the CIQ and answers the metadata questions in it; the sections follow the answers live.
  s = saveConfig(s, c1, id, spec.config, at(cut.open));
  if (spec.stage === "cancelled") return cancelCase(s, owner, id, "Raw material no longer relevant: project 'Aurora' stopped by the brand team", at(0.7));

  // Supplier fills in the questionnaire
  const caseNow = () => s.cases.find((c) => c.id === id)!;
  if (spec.components.length) s = setComponents(s, c1, id, spec.components.map((r, i) => ({ ...r, id: `c${i + 1}` })), at(cut.open + 0.02));
  const fields = FIELDS.filter((f) => scopeOf(caseNow(), f.sectionId)?.applicability === "mandatory" || (f.sectionId === "K5.1" && f.id === "FLD-5.1-002"));
  const visibleCount = fields.filter((f) => isVisible(f, caseNow())).length;
  const limit = spec.stage === "supplier-input" ? Math.floor(visibleCount * (spec.fill ?? 0.5)) : fields.length;
  let k = 0;
  for (const f of fields) {
    const c = caseNow();
    if (!isVisible(f, c)) continue;
    if (k >= limit) break;
    const who = k % 3 === 2 ? c2 : c1;
    const t = at(cut.open + 0.02 + (k / fields.length) * (cut.input - cut.open - 0.04));
    if (f.type === "file") {
      const d = DOC_FOR[f.id];
      if (d) s = uploadDocument(s, who, id, { name: d.name(slug), kind: d.kind, sectionId: f.sectionId, fieldId: f.id }, t).state;
    } else if (f.id === "FLD-5.1-002") {
      if (spec.config.SF12 === false) s = setJustification(s, who, id, f.id, String(valueFor(f.id, spec, sup, rnd)), t);
    } else if (!(f.id in c.answers) || c.answers[f.id] === "") {
      const v = valueFor(f.id, spec, sup, rnd);
      if (v !== undefined) s = setAnswer(s, who, id, f.id, v as never, t);
    }
    k++;
  }
  // re-pass for conditional fields that became visible after earlier answers (e.g. RSPO after palm = yes)
  if (spec.stage !== "supplier-input") {
    for (const f of FIELDS) {
      const c = caseNow();
      if (scopeOf(c, f.sectionId)?.applicability !== "mandatory" || !isVisible(f, c) || f.required === "optional") continue;
      if (c.answers[f.id] !== undefined || c.justifications[f.id]) continue;
      const v = f.type === "file" && DOC_FOR[f.id] ? null : valueFor(f.id, spec, sup, rnd);
      if (f.type === "file" && DOC_FOR[f.id]) s = uploadDocument(s, c1, id, { name: DOC_FOR[f.id].name(slug), kind: DOC_FOR[f.id].kind, sectionId: f.sectionId, fieldId: f.id }, at(cut.input - 0.02)).state;
      else if (v !== undefined && v !== null) s = setAnswer(s, c1, id, f.id, v as never, at(cut.input - 0.02));
    }
  }
  if (spec.stage === "supplier-input") return s;

  s = confirmCompleteness(s, c1, id, at(cut.input));

  // Part 2: queries and answers
  const reviewSpan = cut.review - cut.input;
  const historic: Q[] =
    spec.stage === "completed" && !spec.queries
      ? [
          { dept: "QM", kind: "document-request", sec: "K1", field: "FLD-K1-002", label: "K1 › Certificate of analysis", q: "Please provide a CoA from a batch produced within the last 12 months.", state: "closed", reply: "Current CoA (batch 2603-044) uploaded." },
          { dept: "REG", kind: "query", sec: "K2.1", row: "c1", label: "K2.1 › component 1 › CAS number", q: "The CAS number does not match the INCI name. Please check.", state: "closed", reply: "Corrected — typo in the check digit." },
          { dept: "SAF", kind: "query", sec: "K2.2", field: "FLD-2.2-001", label: "K2.2 › Batch analyses", q: "Please add the limit of quantification for the heavy-metal method.", state: "closed", reply: "LOQ 0.01 mg/kg (ICP-MS), added to the report." },
          { dept: "RMM", kind: "query", sec: "K2.3", field: "FLD-A1-102", label: "K2.3 › Feedstock", q: "Please confirm the country of cultivation for the feedstock.", state: "closed", reply: "Spain and Portugal." },
        ].filter((q, i) => spec.n % 5 >= 2 && i <= spec.n % 2 + 1 && caseNow().reviews.some((r) => r.dept === q.dept)) as Q[]
      : [];
  [...(spec.queries ?? []), ...historic].forEach((q, i) => {
    const t0 = cut.input + reviewSpan * (0.1 + i * 0.12);
    const reviewer = caseNow().reviews.find((r) => r.dept === q.dept)?.assigneeId ?? `u-${q.dept.toLowerCase()}`;
    s = raiseOpenPoint(s, reviewer, id, { dept: q.dept, kind: q.kind, ref: { sectionId: q.sec, fieldId: q.field, rowId: q.row, label: q.label }, question: q.q, justification: q.dept === "RMM" ? "Needed for RMM's review of the whole CIQ" : "Needed for the department assessment", dueDate: iso(Date.parse(at(t0)) + (spec.n === 140 ? 6 : 14) * DAY) }, at(t0));
    const op = caseNow().openPoints.at(-1)!;
    if (q.state === "open") return;
    s = supplierRespond(s, i % 2 ? c2 : c1, id, op.id, { text: q.reply ?? "Done.", cannotProvide: q.state === "cannot", documentName: q.kind === "document-request" ? `${slug}_${q.sec.replace(/\W/g, "")}_update.pdf` : undefined }, at(t0 + reviewSpan * 0.08));
    if (q.state === "closed" && (spec.n + i) % 4 === 0) {
      // a second round: answer returned once, then accepted
      s = reviewResponse(s, reviewer, id, op.id, "return", "Please attach the document itself, not only the reference.", at(t0 + reviewSpan * 0.1));
      s = supplierRespond(s, i % 2 ? c1 : c2, id, op.id, { text: "Document attached as requested.", documentName: `${slug}_${q.sec.replace(/\W/g, "")}_v2.pdf` }, at(t0 + reviewSpan * 0.16));
    }
    if (q.state === "closed") s = reviewResponse(s, reviewer, id, op.id, "accept", "Accepted, thank you.", at(t0 + reviewSpan * 0.2));
    if (q.state === "returned") s = reviewResponse(s, reviewer, id, op.id, "return", "Not sufficient: we need the certificate itself, not an audit letter.", at(t0 + reviewSpan * 0.12));
  });

  // The Safety / Regulatory decisions (the RMES itself is a read-only sheet derived from the case: nothing to record)
  const decide = (d: "SAF" | "REG", dec: "approved" | "rejected") => {
    const by = caseNow().reviews.find((r) => r.dept === d)?.assigneeId ?? `u-${d.toLowerCase()}`;
    s = rmesDecision(s, by, id, d, dec, dec === "rejected" ? "Safety assessment cannot be concluded for leave-on use without endocrine data" : "", at(cut.review - 0.04));
  };
  // RMM's whole-CIQ review completes last in historic cases.
  const all = caseNow().reviews.map((r) => r.dept).sort((a, b) => Number(a === "RMM") - Number(b === "RMM"));
  const doneList = spec.stage === "completed" || spec.stage === "final-release" ? all : spec.done ?? [];
  for (const [d, dec] of Object.entries(spec.decisions ?? {})) decide(d as "SAF" | "REG", dec!);
  if (spec.stage === "completed") for (const d of ["SAF", "REG"] as const) if (all.includes(d) && !caseNow().reviews.find((r) => r.dept === d)?.decision) decide(d, "approved");
  doneList.forEach((d, i) => {
    if (!all.includes(d)) return;
    const by = caseNow().reviews.find((r) => r.dept === d)!.assigneeId;
    s = completeReview(s, by, id, d, at(cut.input + reviewSpan * (0.55 + i * 0.08)));
  });
  if (spec.stage === "completed") s = finalRelease(s, c1, id, at(cut.release - 0.01));
  return s;
}


let cached: AppState | null = null;

/** Builds the rich fixture. Deterministic: the same call always returns the same data (a fresh copy each time). */
export function buildRichFixture(): AppState {
  if (cached) return structuredClone(cached);
  let s = baseState([...ROLE_HOLDERS, ...EXTRA_INTERNAL, ...SUPPLIER_DEFS.flatMap(contactsOfDef)], SUPPLIER_DEFS.map(supplierOf));
  for (const spec of SPECS) s = play(s, spec);
  s = { ...s, cases: [...s.cases].sort((a, b) => b.createdAt.localeCompare(a.createdAt)), toasts: [] };
  cached = s;
  return structuredClone(s);
}
