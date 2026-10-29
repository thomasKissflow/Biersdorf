// The RMES (Raw Material Evaluation Sheet) for Safety and Regulatory, as BDF scoped it for the MVP (e-mail of 28 Oct:
// "exactly the scope … no more"): ONE read-only sheet of 8 fields, filled automatically from the CIQ.
// - Header: Raw material / tradename (FLD-GEN-001), Supplier (FLD-GEN-002), Manufacturer (FLD-GEN-004).
// - Composition, one row per component in K2.1 order: INCI (FLD-2.1-001), % (FLD-2.1-007, the CIQ's min–max range),
//   CAS # (FLD-2.1-002), EC # (FLD-2.1-003, may hold a REACH registration no.), and the origin information as two
//   columns: Source of origin (FLD-2.3-01, per row) and its Free text (ORIGIN_TEXT_FIELDS). The CIQ asks the free text
//   once per origin type (K2.3), not per row, and vegetable and animal together, so rows of the same origin, and
//   vegetable and animal rows, share it (RMES_FREE_TEXT_NOTE).
// Derived live from the case: nothing is stored, so the sheet follows every Part 2 change and is frozen with the case
// after the final release. Pure; the same in the prototype and the live app (whose case map builds materialName,
// answers and components from CIQ Case). Out of scope (not yellow in BDF's template): Process ID / RMT ID / IRMA ID and
// Declaration. No criteria, limit checks, AI suggestion or findings. Internal only: never imported by a supplier screen.

import { ORIGIN_LABEL, fieldOf } from "./catalog";
import { concText, concentrationError } from "./composition";
import { caseSupplierName, formatValue, hasValue } from "./selectors";
import type { AnswerValue, AppState, CiqCase, ComponentRow, OriginType } from "./types";

/** Where a value comes from in the CIQ (REQ-PROC-022 source reference): the question id, its label and its section
 *  (the review workspace jumps there). */
export interface RmesSource {
  fieldId: string;
  label: string;
  sectionId: string;
}

/** A shown value: the CIQ answer, the supplier's "Cannot provide" justification instead, or nothing yet. */
export interface RmesValue {
  text: string;
  state: "answered" | "cannot-provide" | "empty";
}

export interface RmesHeaderField extends RmesValue {
  key: "material" | "supplier" | "manufacturer";
  /** The RMES field's name, as in BDF's template. */
  label: string;
  source: RmesSource;
  /** When the shown value was last set: the answer's stamp; the case start for what Beiersdorf sets at case start.
   *  Absent while there is no value. */
  at?: string;
  /** Where a fallback value came from. */
  note?: string;
}

/** One free-text answer of a row's origin (the field id goes with the text). */
export interface RmesFreeText extends RmesValue {
  source: RmesSource;
}

export interface RmesRow {
  /** The K2.1 row id. */
  rowId: string;
  inci: string;
  /** "10–20 %", "10 %" when min = max, "—" when blank or invalid. */
  conc: string;
  cas: string;
  ec: string;
  origin: OriginType;
  /** Source of origin (ORIGIN_LABEL). */
  originLabel: string;
  freeText: RmesFreeText[];
}

export type RmesColumnKey = "inci" | "conc" | "cas" | "ec" | "origin" | "freeText";

export interface RmesColumn {
  key: RmesColumnKey;
  label: string;
  sources: RmesSource[];
}

export type RmesSheet =
  | {
      readable: true;
      caseId: string;
      /** RMES_RECORD_LINE of the case. */
      record: string;
      /** When the case's RMES record was created (REQ-PROC-021), if it exists. */
      recordAt?: string;
      header: RmesHeaderField[];
      columns: RmesColumn[];
      rows: RmesRow[];
      /** Origins whose free text more than one row shows: rows of one origin, and vegetable with animal rows (the CIQ
       *  asks Part(s) and Country once for both). Those rows show the same free text. */
      sharedOrigins: OriginType[];
      /** RMES_FREE_TEXT_NOTE. */
      footnote: string;
    }
  | { readable: false; caseId: string; record: string; recordAt?: string; notice: string };

/** The CIQ's "please specify" field(s) for each Source of origin (matrix v0.6 FLD-2.3-01 Controls; one constant for
 *  the sheet, its test and the reply to BDF). Vegetable and animal: Part(s) used (a multi-select) and Country. */
export const ORIGIN_TEXT_FIELDS: Readonly<Record<OriginType, readonly string[]>> = {
  vegetable: ["FLD-2.1-101", "FLD-2.3-10"],
  animal: ["FLD-2.1-101", "FLD-2.3-10"],
  petrochemical: ["FLD-2.3-11"],
  mineral: ["FLD-2.3-12"],
  ccu: ["FLD-2.3-13"],
  polymer: ["FLD-2.3-14"],
  waste: ["FLD-2.3-15"],
  chemrec: ["FLD-2.3-16"],
};

/** The K2.1 table's columns as the CIQ names them (they are table columns, not questionnaire fields). */
const COMPONENT_SOURCE: Record<Exclude<RmesColumnKey, "freeText">, RmesSource> = {
  inci: { fieldId: "FLD-2.1-001", label: "INCI (European) / IUPAC", sectionId: "K2.1" },
  conc: { fieldId: "FLD-2.1-007", label: "Concentration range [%]", sectionId: "K2.1" },
  cas: { fieldId: "FLD-2.1-002", label: "CAS No.", sectionId: "K2.1" },
  ec: { fieldId: "FLD-2.1-003", label: "EC number", sectionId: "K2.1" },
  // one origin per component, chosen in the K2.1 table
  origin: { fieldId: "FLD-2.3-01", label: "Source of origin", sectionId: "K2.1" },
};

const COLUMN_LABEL: Record<RmesColumnKey, string> = { inci: "INCI", conc: "%", cas: "CAS #", ec: "EC #", origin: "Source of origin", freeText: "Free text" };

export const RMES_RECORD_LINE = (caseId: string) => `RMES · ${caseId} · internal: never visible to the supplier · filled automatically from the CIQ`;
export const RMES_UNREADABLE = "Kissflow did not let your role read this case's questionnaire, so the RMES can't be filled.";
export const RMES_FREE_TEXT_NOTE = "The CIQ asks the free text once per origin type, not per component, and asks vegetable and animal together: components of the same origin, or of vegetable and animal origin, show the same text.";
export const NOT_ANSWERED = "Not answered yet";
/** The record exists but its time is unknown: live, its form list row has no _created_at and its creation history row
 *  is missing (trackMap.rmesOf). */
export const RMES_RECORD_NO_TIME = "Record created (its time is not in the case history)";

/** "10–20 %"; "10 %" when min = max; "—" while blank (or a legacy 0–0 row). A range the completeness check would refuse
 *  (min > max, one bound missing, over 100) still reaches review on a pre-28-Oct case or a Part 2 save, so it shows as
 *  entered, as the K2.1 table does ("20–10 %", "10–? %"), never as a blank. */
export function rmesConcText(r: Pick<ComponentRow, "concMin" | "concMax">): string {
  if (!concentrationError(r.concMin, r.concMax) && r.concMin === r.concMax) return `${r.concMin} %`;
  return concText(r);
}

const sourceOf = (s: Pick<AppState, "config">, c: Pick<CiqCase, "templateVersion">, fieldId: string): RmesSource => {
  const f = fieldOf(fieldId, c.templateVersion, s.config);
  return { fieldId, label: f?.label ?? fieldId, sectionId: f?.sectionId ?? "GEN" };
};

/** A CIQ answer as shown: its text, else the supplier's justification ("Cannot provide: …"), else NOT_ANSWERED. */
function valueOf(c: Pick<CiqCase, "answers" | "justifications">, fieldId: string, fallback = ""): RmesValue {
  const v: AnswerValue | undefined = c.answers[fieldId];
  const text = hasValue(v) ? formatValue(v).trim() : "";
  if (text) return { text, state: "answered" };
  const why = (c.justifications[fieldId] ?? "").trim();
  if (why) return { text: `Cannot provide: ${why}`, state: "cannot-provide" };
  if (fallback.trim()) return { text: fallback.trim(), state: "answered" };
  return { text: NOT_ANSWERED, state: "empty" };
}

/**
 * The case's RMES sheet. `readable: false` (live: Kissflow did not let the role read the case in full, so its answers
 * and components are missing) gives the notice instead of the 8 fields, which would read as blank or wrong.
 */
export function rmesSheet(s: Pick<AppState, "suppliers" | "config">, c: CiqCase, opts: { readable?: boolean } = {}): RmesSheet {
  const record = RMES_RECORD_LINE(c.id);
  const recordAt = c.rmes?.createdAt || undefined;
  const meta = { caseId: c.id, record, ...(recordAt ? { recordAt } : {}) };
  if (opts.readable === false) return { readable: false, ...meta, notice: RMES_UNREADABLE };

  // when the shown value was last set: its answer's stamp; for what Beiersdorf sets at case start, the case start
  const stamp = (fieldId: string, v: RmesValue, setAtStart = false) => (v.state === "empty" ? undefined : (c.answeredBy[fieldId]?.at ?? (setAtStart ? c.createdAt : undefined)));
  // H1: the trade name (FLD-GEN-001), else the case's material name, but never the case id (the live map's last
  // fallback when the case can't be read)
  const material = valueOf(c, "FLD-GEN-001", c.materialName !== c.id ? c.materialName : "");
  // H2: the same rule as the final document's header (FLD-GEN-002, else the supplier master)
  const supplierAnswer = String(c.answers["FLD-GEN-002"] ?? "").trim();
  const supplier = valueOf(c, "FLD-GEN-002", caseSupplierName(s, c));
  // H3: FLD-GEN-004 only. Never manufacturerOf() / c.manufacturer: both fall back to the supplier's name.
  const manufacturer = valueOf(c, "FLD-GEN-004");
  const header: RmesHeaderField[] = [
    { key: "material", label: "Raw material / tradename", ...material, source: sourceOf(s, c, "FLD-GEN-001"), ...atOf(stamp("FLD-GEN-001", material, true)) },
    {
      key: "supplier",
      label: "Supplier",
      ...supplier,
      source: sourceOf(s, c, "FLD-GEN-002"),
      ...atOf(stamp("FLD-GEN-002", supplier, true)),
      ...(!supplierAnswer && supplier.state === "answered" ? { note: "from the supplier master" } : {}),
    },
    { key: "manufacturer", label: "Manufacturer", ...manufacturer, source: sourceOf(s, c, "FLD-GEN-004"), ...atOf(stamp("FLD-GEN-004", manufacturer)) },
  ];

  const rows: RmesRow[] = c.components.map((r) => ({
    rowId: r.id,
    inci: r.inci?.trim() || "—",
    conc: rmesConcText(r),
    cas: r.cas?.trim() || "—",
    ec: r.ec?.trim() || "—",
    origin: r.origin,
    originLabel: ORIGIN_LABEL[r.origin] ?? (r.origin || "—"),
    freeText: (ORIGIN_TEXT_FIELDS[r.origin] ?? []).map((id) => ({ ...valueOf(c, id), source: sourceOf(s, c, id) })),
  }));
  const used = [...new Set(rows.flatMap((r) => ORIGIN_TEXT_FIELDS[r.origin] ?? []))];
  const columns: RmesColumn[] = [
    ...(["inci", "conc", "cas", "ec", "origin"] as const).map((key) => ({ key, label: COLUMN_LABEL[key], sources: [COMPONENT_SOURCE[key]] })),
    { key: "freeText", label: COLUMN_LABEL.freeText, sources: used.map((id) => sourceOf(s, c, id)) },
  ];
  // shared by the free-text fields, not by the origin: vegetable and animal ask the same two (one answer for both)
  const textKey = (o: OriginType) => (ORIGIN_TEXT_FIELDS[o] ?? []).join(" ");
  const count = new Map<string, number>();
  for (const r of rows) if (textKey(r.origin)) count.set(textKey(r.origin), (count.get(textKey(r.origin)) ?? 0) + 1);
  const sharedOrigins = [...new Set(rows.map((r) => r.origin))].filter((o) => (count.get(textKey(o)) ?? 0) > 1);
  return { readable: true, ...meta, header, columns, rows, sharedOrigins, footnote: RMES_FREE_TEXT_NOTE };
}

const atOf = (at: string | undefined) => (at ? { at } : {});
