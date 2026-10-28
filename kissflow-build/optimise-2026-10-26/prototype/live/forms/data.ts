// The data S-FORMS writes, per run (tests-2026-10-21/SPEC.md §3: R1 is the showcase, R2 and R3 vary the data; R4, on
// 21 Oct evening, is a second showcase with its own data; any other run name, offline, rehearses R1's). Everything is
// fictional and tagged: texts start with the run tag, codes and keys carry it, e-mails are @example.com. `attempt` (1,
// 2, …) keeps a rerun of the same run apart from the items an earlier attempt left (R1 and R4 keep their items; a
// stopped R2/R3 may leave some): codes, DUNS and e-mails all carry it.
import type { ContactInput, SupplierInput } from "@/domain/suppliers";
import type { InternalPersonaId, Market, Supplier } from "@/domain/types";
import type { World } from "../lib/world";

/** The three contacts the supplier starts with: `s` becomes the self contact (Thomas's portal user) in step 6. */
export type Who = "a" | "b" | "s" | "d";

export interface FormsData {
  attempt: number;
  supplierCode: string;
  caseCode: string;
  supplier: SupplierInput;
  contacts: Record<"a" | "b" | "s", ContactInput>;
  /** The contact whose e-mail is edited, and its new e-mail. */
  emailEdit: { who: "a" | "b"; to: string };
  /** The contact added later. */
  added: ContactInput;
  /** The contact added once the self contact exists (R2/R3, and offline rehearsals: the key-reuse step). */
  later: ContactInput;
  /** The contact deactivated (never the self contact). */
  deactivate: "a" | "b" | "d";
  /** The self contact's new title (its e-mail becomes the identity's). */
  selfTitle: string;
  note: { persona: InternalPersonaId; onSection: boolean; mentionSelf: boolean; text: string };
  kase: { materialName: string; inci: string; materialNo: string; markets: Market[]; priority: "normal" | "high" };
  /** R4: a kept process item's ledger stage names what its step proved (R1's name what the item is). */
  proofs: boolean;
}

/** The showcase runs: their items stay at the stages the ledger names (F12a and the F12 showcase instead of the clean-up). */
export const keepsItems = (run: string) => run === "R1" || run === "R4";

interface Shape {
  runDigit: number;
  supplier: { name: string; country: string; city: string; type: Supplier["type"] };
  people: Record<"a" | "b" | "d" | "e", { name: string; title: string; mayConfirm: boolean }>;
  emailEdit: "a" | "b";
  deactivate: "a" | "b" | "d";
  selfTitle: string;
  note: { persona: InternalPersonaId; onSection: boolean; mentionSelf: boolean; text: string };
  kase: { inci: string; markets: Market[]; priority: "normal" | "high" };
  proofs?: true;
}

const SHAPES: Record<"R1" | "R2" | "R3" | "R4", Shape> = {
  R1: {
    runDigit: 1,
    supplier: { name: "Forms Supplier Iberica", country: "Spain", city: "Reus", type: "manufacturer" },
    people: { a: { name: "Marta Soler", title: "Quality Engineer", mayConfirm: true }, b: { name: "Jonas Brandt", title: "Sales Manager", mayConfirm: false }, d: { name: "Lena Vidal", title: "Regulatory Specialist", mayConfirm: false }, e: { name: "Pau Ferrer", title: "Lab Technician", mayConfirm: false } },
    emailEdit: "a",
    deactivate: "b",
    selfTitle: "Dev lead",
    note: { persona: "cus", onSection: false, mentionSelf: false, text: "Customs: the HS code of the material needs a second look." },
    kase: { inci: "Glycerin", markets: ["EU"], priority: "normal" },
  },
  R2: {
    runDigit: 2,
    supplier: { name: "Forms Supplier Lusitania", country: "Portugal", city: "Aveiro", type: "distributor" },
    people: { a: { name: "Pieter Jansen", title: "Key Account Manager", mayConfirm: false }, b: { name: "Ana Costa", title: "Quality Lead", mayConfirm: true }, d: { name: "Rui Matos", title: "Logistics Coordinator", mayConfirm: true }, e: { name: "Ines Rocha", title: "Export Clerk", mayConfirm: false } },
    emailEdit: "b",
    deactivate: "a",
    selfTitle: "Quality lead",
    note: { persona: "leg", onSection: true, mentionSelf: false, text: "Legal: the trade name may conflict with a registered mark; checking." },
    kase: { inci: "Tocopherol", markets: ["EU", "UK"], priority: "high" },
  },
  R3: {
    runDigit: 3,
    supplier: { name: "Forms Supplier Alpina", country: "Austria", city: "Graz", type: "manufacturer" },
    people: { a: { name: "Eva Huber", title: "Product Steward", mayConfirm: true }, b: { name: "Lukas Gruber", title: "Plant Manager", mayConfirm: true }, d: { name: "Sofia Berger", title: "Documentation Officer", mayConfirm: false }, e: { name: "Felix Mayr", title: "Purchasing Agent", mayConfirm: true } },
    emailEdit: "a",
    deactivate: "d",
    selfTitle: "Regulatory lead",
    note: { persona: "mic", onSection: true, mentionSelf: true, text: "Microbiology: the preservation efficacy test is due for renewal." },
    kase: { inci: "Squalane", markets: ["CN"], priority: "normal" },
  },
  // R4, the evening showcase: kept like R1, its supplier left with four contacts (one e-mail edited, one added and then
  // deactivated, the self contact's title edited and its portal user unlinked again) and a QM note on a section
  R4: {
    runDigit: 4,
    supplier: { name: "Forms Supplier Danubia", country: "Germany", city: "Passau", type: "distributor" },
    people: { a: { name: "Johanna Weber", title: "Quality Manager", mayConfirm: true }, b: { name: "Matteo Ricci", title: "Account Manager", mayConfirm: false }, d: { name: "Sanne Visser", title: "Regulatory Affairs Specialist", mayConfirm: false }, e: { name: "Tomasz Nowak", title: "Logistics Planner", mayConfirm: false } },
    emailEdit: "b",
    deactivate: "d",
    selfTitle: "Supply quality lead",
    note: { persona: "qm", onSection: true, mentionSelf: false, text: "QM: the certificate of analysis template differs from the specification; to be aligned." },
    kase: { inci: "Caprylic/Capric Triglyceride", markets: ["EU"], priority: "normal" },
    proofs: true,
  },
};

/** The run's shape: R1–R4 their own; any other name (offline OFF, a rehearsal) R1's, with digit 0. */
const shapeOf = (run: string): Shape => {
  const s = SHAPES[run as keyof typeof SHAPES];
  return s ?? { ...SHAPES.R1, runDigit: 0 };
};

/** The suite's attempt in this run: one past the highest FSUP<n> any line of the run's ledger names, drafts included (a
 *  submit that answered without the new id leaves only its draft line, and its row may exist: never reuse its code). */
export function attemptOf(w: World): number {
  const code = new RegExp(`Supplier_Code=${w.key("FSUP").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\d+)(?!\\d)`, "g");
  let n = 0;
  for (const e of w.ledger.byRun()) for (const m of e.what.matchAll(code)) n = Math.max(n, Number(m[1]));
  return n + 1;
}

export function formsData(w: World, attempt = attemptOf(w)): FormsData {
  const x = shapeOf(w.run);
  const slug = `${w.tag.toLowerCase()}-f${attempt}`;
  const mail = (name: string, tag = "") => `${slug}.${name.toLowerCase().replace(/[^a-z]+/g, ".")}${tag}@example.com`;
  const contact = (p: { name: string; title: string; mayConfirm: boolean }): ContactInput => ({ name: w.text(p.name), email: mail(p.name), title: w.text(p.title), mayConfirm: p.mayConfirm });
  const contacts = { a: contact(x.people.a), b: contact(x.people.b), s: { name: w.text("Portal contact"), email: mail("portal contact"), title: w.text("Supplier contact"), mayConfirm: true } };
  // 9 digits: 9, the run, the attempt (two digits), 00021
  const duns = `9${x.runDigit}${String(attempt % 100).padStart(2, "0")}00021`;
  return {
    attempt,
    supplierCode: w.key(`FSUP${attempt}`),
    caseCode: w.key(`FCASE${attempt}`),
    supplier: { name: w.text(`${x.supplier.name} ${attempt}`), duns, country: x.supplier.country, city: w.text(x.supplier.city), type: x.supplier.type, contacts: [contacts.a, contacts.b, contacts.s] },
    contacts,
    emailEdit: { who: x.emailEdit, to: mail(x.people[x.emailEdit].name, ".new") },
    added: contact(x.people.d),
    later: contact(x.people.e),
    deactivate: x.deactivate,
    selfTitle: w.text(x.selfTitle),
    note: { ...x.note, text: w.text(x.note.text) },
    kase: { materialName: w.text(`Forms note material ${attempt}`), inci: w.text(x.kase.inci), materialNo: w.key(`RM-F${attempt}`), markets: x.kase.markets, priority: x.kase.priority },
    proofs: x.proofs === true,
  };
}
