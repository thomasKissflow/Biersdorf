// S-CASE's data per run (SPEC §3: R1 is the showcase; R2 and R3 vary the data: other scopes, departments, outcomes; R4,
// added on 21 Oct evening, is a second showcase that leaves its cases at distinct stages, tracksOf).
// Fictional only: every text the suite writes starts with the run tag, every code and key carries it, and the people
// are invented, except the self contact, which is the key's user (Thomas live, the fixture RMM offline). Any other run
// name (offline "OFF", a rehearsal) takes R1's data.
import type { NewCaseInput } from "@/domain/actions";
import type { ContactInput, SupplierInput } from "@/domain/suppliers";
import type { AppState, ConfigAnswers, Market, ReviewDept } from "@/domain/types";

export interface RunData {
  supplier: Omit<SupplierInput, "name" | "contacts" | "duns">;
  placeholder: ContactInput;
  selfTitle: string;
  material: { name: string; inci: string; markets: Market[]; priority: "normal" | "high" };
  /** The supplier's metadata answers (SF-11 is Beiersdorf's): they decide the scope and the reviewing departments. */
  config: ConfigAnswers;
  /** The review departments the scope must activate (RMM's own included), as the rule set of the fixtures gives them:
   *  S-CASE checks the live scope against it (a rule set that drops one is a fail, not a quietly smaller run). */
  reviews: ReviewDept[];
  cancelReason: string;
}

const NO: ConfigAnswers = { SF03: false, SF04: false, SF05: [], SF06: false, SF07: false, SF09: false, SF10: false, SF12: true };

const DATA: Record<"R1" | "R2" | "R3" | "R4", RunData> = {
  // vegetable, EU: RMM, Regulatory, Safety, QM and Microbiology review (Sustainability only with SF-09 since 28 Oct)
  R1: {
    supplier: { country: "Germany", city: "Hamburg", type: "manufacturer" },
    placeholder: { name: "Marta Lindqvist", email: "marta.lindqvist@zzt-n21-r1.example", title: "QA Specialist", mayConfirm: false },
    selfTitle: "Regulatory Manager",
    material: { name: "Sunflower Seed Oil", inci: "Helianthus Annuus Seed Oil", markets: ["EU"], priority: "normal" },
    config: { ...NO, SF01: ["vegetable"] },
    reviews: ["RMM", "REG", "SAF", "QM", "MIC"],
    cancelReason: "Material replaced by another grade.",
  },
  // a polymer from a waste side stream, EU and UK, high priority: no Sustainability review, the polymer sections
  R2: {
    supplier: { country: "Spain", city: "Reus", type: "distributor" },
    placeholder: { name: "Jordi Castell", email: "jordi.castell@zzt-n21-r2.example", title: "Sales Engineer", mayConfirm: false },
    selfTitle: "Quality Lead",
    material: { name: "Recycled Polyethylene Wax", inci: "Polyethylene", markets: ["EU", "UK"], priority: "high" },
    config: { ...NO, SF01: ["waste"], SF03: true },
    reviews: ["RMM", "REG", "SAF", "QM", "MIC"],
    cancelReason: "Supplier withdrew the offer.",
  },
  // mineral, no microbiological test (K5.1 waived with a justification; Microbiology still reviews), EU and China: the
  // same five reviews as R1
  R3: {
    supplier: { country: "Netherlands", city: "Rotterdam", type: "manufacturer" },
    placeholder: { name: "Femke de Vries", email: "femke.devries@zzt-n21-r3.example", title: "Technical Service", mayConfirm: false },
    selfTitle: "Product Steward",
    material: { name: "Kaolin Fine", inci: "Kaolin", markets: ["EU", "CN"], priority: "normal" },
    config: { ...NO, SF01: ["mineral"], SF12: false },
    reviews: ["RMM", "REG", "SAF", "QM", "MIC"],
    cancelReason: "Project stopped by Beiersdorf.",
  },
  // R4, the evening showcase: a polyamide powder from a waste side stream, EU and UK, high priority. The same scope as
  // R2 (its five reviews were proven live on 21 Oct), so the case kept in review is a cheaper load; its own supplier,
  // people and material
  R4: {
    supplier: { country: "Austria", city: "Linz", type: "manufacturer" },
    placeholder: { name: "Katrin Moser", email: "katrin.moser@zzt-n21-r4.example", title: "Quality Assurance Officer", mayConfirm: false },
    selfTitle: "Technical Director",
    material: { name: "Recycled Polyamide Powder", inci: "Nylon-12", markets: ["EU", "UK"], priority: "high" },
    config: { ...NO, SF01: ["waste"], SF03: true },
    reviews: ["RMM", "REG", "SAF", "QM", "MIC"],
    cancelReason: "Supplier site closed for requalification.",
  },
};

export const dataOf = (run: string): RunData => DATA[run as keyof typeof DATA] ?? DATA.R1;

/** The showcase runs: their items stay at the stages the ledger names (no clean-up step); R2, R3 and offline
 *  rehearsals under any other name delete their own items. */
export const keepsItems = (run: string) => run === "R1" || run === "R4";

/** Offline, whether the fake I-2's Approve moves a case on (lib/world.ts caseStepsHeld): R4 rehearses 21 Oct evening,
 *  when Thomas is back in Integration service; R1–R3 the roles as read at 02:30 (the Approve blocked). Only the fake I-2
 *  changes: the held roles stay Business administrator offline, so S-CASE 4c takes its one-read branch (the case has
 *  already moved), never the live poll, and nothing else that needs Thomas to hold a case step is rehearsed. Live reads
 *  the roles. S-CASE's 4c title takes the run's expectation from it too. */
export const caseStepsHeld = (run: string) => run === "R4";

/** The lifecycle steps a case can take (S-CASE 3–9). */
export type LifeStep = "3" | "4a" | "4b" | "4c" | "5" | "6a" | "6b" | "7" | "8" | "9";
const ALL_STEPS: LifeStep[] = ["3", "4a", "4b", "4c", "5", "6a", "6b", "7", "8", "9"];

/** One case through the lifecycle steps, with the stage the run leaves it at. */
export interface TrackPlan {
  /** Its code in codesOf: the main case (C01) or R4's case kept in review (C03). */
  code: "main" | "review";
  /** Its material number (codesOf materialNo). */
  materialNo: number;
  /** Appended to each step name ("" for the main case: R1–R3's step names stay as they were). */
  suffix: string;
  steps: LifeStep[];
  /** The stage the run leaves the case at, when it stops before the final release (R4's case kept in review): its steps
   *  then also name in the ledger what each proved on the case, its reviews and its RMES records. */
  stays?: string;
}

/**
 * The cases the lifecycle steps take, in order. R1–R3: the main case through every step. R4: the main case from the
 * start to the final release without the RMES and review-completion steps (the case kept in review shows them; this
 * saves ≈150 live calls), then a second case to RMES Safety and Regulatory and the blocked review completion, kept in
 * review after I-2's Approve.
 */
export function tracksOf(run: string): TrackPlan[] {
  if (run !== "R4") return [{ code: "main", materialNo: 1, suffix: "", steps: ALL_STEPS }];
  return [
    { code: "main", materialNo: 1, suffix: "", steps: ["3", "4a", "4b", "4c", "5", "8", "9"] },
    { code: "review", materialNo: 3, suffix: " (in-review case)", steps: ["3", "4a", "4b", "4c", "5", "6a", "6b", "7"], stays: "kept in review" },
  ];
}

/**
 * The suite's codes in a run: "<tag>-SC<attempt>" first. A run may be started again (after a stop): the attempt counts
 * the S-CASE suppliers the run's ledger already has, so a new attempt never reuses a code, a DUNS or an e-mail (the
 * domain keeps DUNS and e-mails unique among the suppliers it sees).
 */
export function codesOf(o: { run: string; key: (s: string) => string; attempt: number }) {
  const prefix = o.key(`SC${o.attempt}`);
  const at = (s: string) => `${prefix}-${s}`;
  const runDigit = { R1: 1, R2: 2, R3: 3, R4: 4 }[o.run] ?? 0;
  return {
    supplier: at("SUP"),
    main: at("C01"),
    cancel: at("C02"),
    /** R4's second lifecycle case, kept in review (tracksOf). */
    review: at("C03"),
    drafts: keepsItems(o.run) ? [at("D01"), at("D02")] : [at("D01")],
    materialNo: (n: number) => at(`RM-${String(n).padStart(2, "0")}`),
    duns: `92${runDigit}${String(o.attempt).padStart(6, "0")}`,
    /** A fictional e-mail for the self contact: the domain keeps every e-mail unique across all users
     *  (validateContact), and the signed-in user's own is the Beiersdorf user's. The portal user id links Thomas. */
    selfEmail: `zzt-n21-${o.run.toLowerCase()}-sc${o.attempt}.self@example.test`,
    mailTag: `sc${o.attempt}`,
  };
}
export type Codes = ReturnType<typeof codesOf>;

/** The supplier master input: the run supplier with Thomas as its self contact and one fictional placeholder (people
 *  keep their names; the supplier's texts carry the tag). */
export function supplierInput(d: RunData, c: Codes, o: { tagText: (s: string) => string; selfName: string }): SupplierInput {
  const [local, domain] = d.placeholder.email.split("@");
  const placeholder = { ...d.placeholder, email: `${local}.${c.mailTag}@${domain}` };
  const city = d.supplier.city ? o.tagText(d.supplier.city) : undefined;
  return { ...d.supplier, ...(city ? { city } : {}), duns: c.duns, name: o.tagText("Supplier"), contacts: [{ name: o.selfName, email: c.selfEmail, title: d.selfTitle, mayConfirm: true }, placeholder] };
}

/** The case input for the run supplier; the due date 30 days ahead (the domain refuses a past one). */
export function caseInput(d: RunData, o: { tagText: (s: string) => string; materialNo: string; supplierId: string; contactIds: string[] }): NewCaseInput {
  const due = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
  return {
    materialName: o.tagText(d.material.name),
    inci: d.material.inci,
    materialNo: o.materialNo,
    supplierId: o.supplierId,
    contactIds: o.contactIds,
    markets: d.material.markets,
    dueDate: `${due}T17:00:00.000Z`,
    priority: d.material.priority,
  };
}

/**
 * The domain names a new supplier `s<n>` after the suppliers this load sees (domain/suppliers.ts addSupplier), so two
 * runs would share a code. The run's supplier gets the run's code instead (SPEC §1 "Data": every supplier code carries
 * the run tag), with its contacts' ids (`u-<supplier>-<n>`) and log entries following. Only what addSupplier added is
 * renamed; nothing else of the state changes.
 */
export function renameSupplier(prev: AppState, next: AppState, from: string, to: string): AppState {
  if (!from || from === to) return next;
  const newUser = (id: string) => !prev.users.some((u) => u.id === id);
  const uid = (id: string) => (id.startsWith(`u-${from}-`) ? `u-${to}-${id.slice(from.length + 3)}` : id);
  return {
    ...next,
    suppliers: next.suppliers.map((s) => (s.id === from && !prev.suppliers.includes(s) ? { ...s, id: to, contactIds: s.contactIds.map(uid) } : s)),
    users: next.users.map((u) => (u.supplierId === from && newUser(u.id) ? { ...u, id: uid(u.id), supplierId: to } : u)),
    log: next.log.map((e) => (e.supplierId === from && !prev.log.includes(e) ? { ...e, supplierId: to } : e)),
  };
}
