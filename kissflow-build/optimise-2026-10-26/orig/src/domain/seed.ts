// The demo start (spec §0): no cases and no mails; the 11 internal role holders, one per role; and ONE fictional
// supplier from the supplier master, Solvaro Oleochemicals S.A., with its two active contacts. Configuration as
// published: questionnaire v1 + rule set RS-2026.1; the prepared RS-2026.2 + v2 is the editable draft (spec §8);
// section ownership and reminders.
// "Reset to empty start" returns exactly this state. The rich scenario data for tests and the portal's demo preview is
// in richFixture.ts. All people and suppliers are fictional.

import { BUILTIN_SECTIONS } from "./catalog";
import { initialConfig, templateList } from "./configActions";
import type { AppState, CiqCase, Supplier, User } from "./types";

/** Bumped whenever the state shape or the process changes, so stale browser state is discarded (7: final app, empty
 *  start; 9: configuration versions as data, AppState.config). */
export const SCHEMA = 9;

const initials = (n: string) => n.replace(/^Dr\. /, "").split(" ").map((x) => x[0]).join("").slice(0, 2).toUpperCase();

/** A fictional user; the e-mail is derived from the name (accents dropped). */
export function makeUser(id: string, name: string, title: string, side: User["side"], dept?: User["dept"], supplierId?: string, domain = "beiersdorf.example"): User {
  const email = `${name.replace(/^Dr\. /, "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z ]/g, "").replace(/ /g, ".")}@${domain}`;
  const u: User = { id, name, title, side, dept, supplierId, email, initials: initials(name) };
  return side === "supplier" ? { ...u, active: true, mayConfirm: true } : u;
}

/** The Beiersdorf role holders: one person per role (spec §7.13). Their ids are the static personas' users. */
export const ROLE_HOLDERS: User[] = [
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
  makeUser("u-owner", "Dr. Claudia Richter", "Process Owner, Raw Material Qualification", "internal"),
];

export interface SupplierDef {
  id: string;
  name: string;
  duns: string;
  country: string;
  city: string;
  type: Supplier["type"];
  contacts: [string, string, string][];
}

/**
 * The fictional supplier master. The demo start imports s1 only (DEMO_SUPPLIER_IDS); the others feed the rich test
 * fixture. Keep the `{ id: "sN", name: "…"` line format: scripts/harness-workbench-scenarios.mjs reads these names to
 * prove that live pages never show demo suppliers.
 */
export const SUPPLIER_DEFS: SupplierDef[] = [
  { id: "s1", name: "Solvaro Oleochemicals S.A.", duns: "471203958", country: "Spain", city: "Tarragona", type: "manufacturer", contacts: [["u-sup-1", "Elena Márquez", "Regulatory Manager"], ["u-sup-2", "Ravi Menon", "QA Specialist"]] },
  { id: "s2", name: "Nordhafen Minerals GmbH", duns: "318774502", country: "Germany", city: "Bremen", type: "manufacturer", contacts: [["u-s2a", "Henrik Lund", "Technical Sales"], ["u-s2b", "Julia Roth", "Product Steward"]] },
  { id: "s3", name: "Kestrel Polymers Ltd", duns: "209558317", country: "United Kingdom", city: "Runcorn", type: "manufacturer", contacts: [["u-s3a", "Oliver Grant", "Regulatory Lead"], ["u-s3b", "Priya Shah", "Customer Quality"]] },
  { id: "s4", name: "Aurelia Botanicals S.r.l.", duns: "552091846", country: "Italy", city: "Parma", type: "manufacturer", contacts: [["u-s4a", "Giulia Conti", "Quality Director"], ["u-s4b", "Marco Ferri", "Sustainability Officer"]] },
  { id: "s5", name: "Pacific Lipid Sdn Bhd", duns: "640118273", country: "Malaysia", city: "Port Klang", type: "manufacturer", contacts: [["u-s5a", "Aisyah Rahman", "Regulatory Executive"], ["u-s5b", "Daniel Tan", "Key Account Manager"]] },
  { id: "s6", name: "Valmont Specialty Chemicals Inc.", duns: "087342615", country: "USA", city: "Wilmington, DE", type: "manufacturer", contacts: [["u-s6a", "Sarah Collins", "Product Regulatory Manager"], ["u-s6b", "Kevin Park", "QA Manager"]] },
  { id: "s7", name: "Helvetia Pigments AG", duns: "481930027", country: "Switzerland", city: "Basel", type: "manufacturer", contacts: [["u-s7a", "Lukas Meier", "Regulatory Affairs"], ["u-s7b", "Chiara Rossi", "Quality Assurance"]] },
  { id: "s8", name: "Duna Biotech Kft.", duns: "390265184", country: "Hungary", city: "Debrecen", type: "manufacturer", contacts: [["u-s8a", "Bence Kovács", "QA/RA Manager"], ["u-s8b", "Eszter Nagy", "Fermentation Lead"]] },
  { id: "s9", name: "Lusitânia Waxes Lda", duns: "726840391", country: "Portugal", city: "Sines", type: "distributor", contacts: [["u-s9a", "Rui Almeida", "Technical Manager"], ["u-s9b", "Inês Costa", "Regulatory Assistant"]] },
  { id: "s10", name: "Shenzhou Fine Ingredients Co., Ltd.", duns: "613057829", country: "China", city: "Suzhou", type: "manufacturer", contacts: [["u-s10a", "Wei Zhang", "Export Regulatory Manager"], ["u-s10b", "Lin Chen", "QC Supervisor"]] },
];

/** The suppliers of the empty demo start. */
export const DEMO_SUPPLIER_IDS = ["s1"];

export const supplierOf = (d: SupplierDef): Supplier => ({ id: d.id, name: d.name, duns: d.duns, country: d.country, city: d.city, type: d.type, contactIds: d.contacts.map((c) => c[0]), active: true });

export const contactsOfDef = (d: SupplierDef): User[] =>
  d.contacts.map(([id, name, title]) => makeUser(id, name, title, "supplier", undefined, d.id, d.name.split(" ")[0].toLowerCase().normalize("NFD").replace(/[^a-z]/g, "") + ".example"));

/** Configuration, people and suppliers without any case, mail or log entry. */
export function baseState(users: User[], suppliers: Supplier[]): AppState {
  const ownership: AppState["ownership"] = Object.fromEntries(BUILTIN_SECTIONS.map((x) => [x.id, { lead: x.lead, co: [...x.co] }]));
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
      { id: "rem-6", event: "Certificate expiring (closed case)", recipient: "Supplier contacts", afterDays: -30, escalateTo: "QM", escalateAfterDays: 0, enabled: false },
    ],
    toasts: [],
    mails: [],
    log: [],
    changeReports: [],
  };
}

/** The empty demo start (spec §0). Deterministic: every call returns an equal, fresh object. */
export function buildSeed(): AppState {
  const defs = SUPPLIER_DEFS.filter((d) => DEMO_SUPPLIER_IDS.includes(d.id));
  return baseState([...ROLE_HOLDERS.map((u) => ({ ...u })), ...defs.flatMap(contactsOfDef)], defs.map(supplierOf));
}

export function caseById(s: AppState, id: string): CiqCase | undefined {
  return s.cases.find((c) => c.id === id);
}
