// Built-in reference materials for the admin's "Test rules" (simulator and regression check merged, spec §4 Admin).
// They are fixed answer sets, one per typical origin or question pattern, so testing a rule change never depends on
// the cases in the system (the demo starts with none). Fictional materials.

import type { ConfigAnswers, Market, OriginType } from "./types";

export interface ReferenceMaterial {
  id: string;
  label: string;
  config: ConfigAnswers;
  /** The questionnaire version a running case of this kind would be pinned to. */
  templateVersion: string;
  /** What to look for in the result. */
  look: string;
}

const base = (o: OriginType[], m: Market[], extra: ConfigAnswers = {}): ConfigAnswers => ({ SF01: o, SF03: false, SF04: false, SF05: [], SF06: false, SF07: false, SF09: false, SF10: false, SF11: m, SF12: true, ...extra });

export const REFERENCE_MATERIALS: ReferenceMaterial[] = [
  { id: "sunflower", label: "Sunflower oil (vegetable)", config: base(["vegetable"], ["EU", "UK"]), templateVersion: "CIQ-2026 v1", look: "Vegetable origin switches on Annex 1, 2 and 9; the UK market adds UK REACH (K6.2, Annex 11)." },
  { id: "palm", label: "Palm glycerin (vegetable, EUDR)", config: base(["vegetable"], ["EU", "CN", "US"], { SF09: true }), templateVersion: "CIQ-2026 v1", look: "Vegetable origin opens Annex 1, where the palm question (FLD-A1-204) asks for the RSPO certification; EUDR (SF-09) adds K6.17 for Sustainability." },
  { id: "mineral-oil", label: "Mineral oil entered as 'Mineral'", config: base(["mineral"], ["EU"], { SF07: true }), templateVersion: "CIQ-2026 v1", look: "Origin 'Mineral' alone would not ask for MOAH: SF-07 still activates Annex 4 (MOAH) and Annex 9 (PAH)." },
  { id: "paraffin", label: "Paraffin, petrochemical, no micro test", config: base(["petrochemical"], ["EU", "UK", "CA"], { SF07: true, SF12: false }), templateVersion: "CIQ-2026 v1", look: "Petrochemical origin activates Annex 1, 4 and 9; SF-12 = No waives K5.1 with a written justification." },
  { id: "acrylate", label: "Acrylate polymer", config: base(["polymer"], ["EU", "UK"], { SF03: true }), templateVersion: "CIQ-2026 v1", look: "Polymer origin and SF-03 both activate K4.3 (microparticles) and Annex 6; the stricter rule wins and both are cited." },
  { id: "tio2", label: "Titanium dioxide UV filter and colorant", config: base(["mineral"], ["EU", "US", "CN"], { SF04: true, SF05: ["colorant"] }), templateVersion: "CIQ-2026 v1", look: "SF-04 adds the UV filter annex (Annex 5), SF-05 the colorant annex (Annex 7); China adds K6.13." },
  { id: "ccu", label: "CCU ethanol (no rules yet)", config: base(["ccu"], ["EU"]), templateVersion: "CIQ-2026 v1", look: "No rules exist yet for a carbon-capture origin: the supplier gets the standard sections and the case is flagged in RMM's review." },
  { id: "turkey", label: "Triglyceride for Turkey (tests the draft)", config: base(["vegetable"], ["EU", "TR"]), templateVersion: "CIQ-2026 v1", look: "Only RS-2026.2 with questionnaire v2 asks for Turkey REACH (K6.3, Annex 12)." },
];
