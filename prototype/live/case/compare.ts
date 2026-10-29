// S-CASE comparisons: the domain object the screens produced vs the same object read back through load.ts +
// toAppState (the keys map/roundtrip.test.ts compares, kept here because that test does not export them), the raw
// checks of what I-1 copies, and the pseudo-id scan (no "self:", "contact:", "role:" … in a field that names a user).
// Copy checks count the fields that hold something: two blanks compare equal but prove nothing.
// Times compare as instants to the second: Kissflow stores DateTimes without milliseconds (kfDateTime drops them).
import { BDF_SET_FIELDS } from "@/domain/selectors";
import type { AppState, CiqCase } from "@/domain/types";
import { str, userIds, type RawItem } from "@/portal/data/raw";

export const instant = (iso: string | undefined) => (iso && Number.isFinite(Date.parse(iso)) ? new Date(Math.floor(Date.parse(iso) / 1000) * 1000).toISOString() : iso);
const day = (iso: string | undefined) => iso?.slice(0, 10);
export const clean = <T extends object>(o: T) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
/** A field that holds something: not absent, blank, "[]", "{}" or an empty list (blank on both sides proves nothing). */
export const filled = (v: unknown) => !(v === undefined || v === null || (typeof v === "string" && /^\s*(\[\s*\]|\{\s*\})?\s*$/.test(v)) || (Array.isArray(v) && !v.length));

export const caseIn = (s: AppState, id: string): CiqCase | undefined => s.cases.find((c) => c.id === id);

/** The case header fields the screens and the next writes rely on (roundtrip.test.ts caseKeys). */
export const caseKeys = (c: CiqCase) => ({
  id: c.id,
  materialName: c.materialName,
  inci: c.inci,
  materialNo: c.materialNo,
  supplierId: c.supplierId,
  manufacturer: c.manufacturer,
  ownerId: c.ownerId,
  priority: c.priority,
  templateVersion: c.templateVersion,
  ruleSetVersion: c.ruleSetVersion,
  supplierContactIds: [...c.supplierContactIds].sort(),
  markets: c.config.SF11,
  due: day(c.dueDate),
  bdfAnswers: Object.fromEntries(BDF_SET_FIELDS.filter((k) => c.answers[k] !== undefined).map((k) => [k, c.answers[k]])),
});

export const supplierKeys = (s: AppState, id: string) => {
  const x = s.suppliers.find((y) => y.id === id);
  return x && { id: x.id, name: x.name, duns: x.duns, country: x.country, city: x.city, type: x.type, active: x.active !== false, contacts: x.contactIds.length };
};

/** A contact found by its e-mail (its id changes once the portal user is linked: the self contact). */
export const contactKeys = (s: AppState, email: string) => {
  const u = s.users.find((x) => x.side === "supplier" && x.email === email);
  return u && { name: u.name, email: u.email, title: u.title, mayConfirm: u.mayConfirm !== false, active: u.active !== false, supplierId: u.supplierId };
};


// ---------------------------------------------------------------------------------- pseudo ids

/** The mapper's stand-ins and the domain's own ids: never a Kissflow user. */
const PSEUDO = /^(self|contact|role|mail|name):|^u-(admin|auditor|owner)$|^u-.+-\d+$/;
const ID_KEYS = new Set(["_id", "id", "by", "portalUserId", "ownerId", "assigneeId", "userId", "closedBy", "createdBy", "responsibleId"]);
const ID_LISTS = ["Portal_Contact_Ids", "Confirm_Contact_Ids"];

/** Every place in an item (its User fields, the ids inside its JSON fields, its id lists) that holds a pseudo id. Any
 *  "self:" or "contact:" text anywhere counts too. */
export function pseudoIds(it: RawItem | undefined): string[] {
  const out: string[] = [];
  const walk = (v: unknown, path: string, idKey: boolean): void => {
    if (typeof v === "string") {
      if ((idKey && PSEUDO.test(v)) || /\b(self|contact):/.test(v)) out.push(`${path}=${v}`);
      return;
    }
    if (Array.isArray(v)) return v.forEach((x, i) => walk(x, `${path}[${i}]`, idKey));
    if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) walk(x, `${path}.${k}`, ID_KEYS.has(k));
  };
  for (const [k, v] of Object.entries(it ?? {})) {
    if (typeof v === "string" && /_JSON$/.test(k) && /^[[{]/.test(v.trim())) {
      try {
        walk(JSON.parse(v), k, false);
        continue;
      } catch {
        // not JSON after all: scanned as text below
      }
    }
    if (ID_LISTS.includes(k) && typeof v === "string") v.split(/[,;\s]+/).filter(Boolean).forEach((id, i) => walk(id, `${k}[${i}]`, true));
    else walk(v, k, false);
  }
  return out;
}

// ---------------------------------------------------------------------------------- I-1: the request vs its case

/** The fields I-1 copies from the case onto the request, same names (night-2026-10-20 i1-case-started.js COPY). */
export const I1_COPY = ["Case_Code", "Supplier_Code", "Trade_Name", "Main_INCI", "BDF_Material_No", "BDF_Contact_Name", "BDF_Contact_Email", "Markets_Label", "Template_Label",
  "Supplier_Due_Date", "Rule_Set_Version", "Template_Version", "Config_Bundle_JSON", "Config_Bundle_Hash", "BDF_Set_JSON", "Case_Contacts_JSON"] as const;

const ids = (text: unknown) => {
  try {
    const list = JSON.parse(typeof text === "string" && text ? text : "[]") as { _id?: string }[];
    return list.map((u) => u?._id ?? "").filter(Boolean).sort();
  } catch {
    return ["(not JSON)"];
  }
};
/** Equal as Kissflow returns them: a Date may come back with a time. */
const same = (a: unknown, b: unknown) => (a ?? "") === (b ?? "") || (/^\d{4}-\d{2}-\d{2}/.test(String(a)) && String(a).slice(0, 10) === String(b ?? "").slice(0, 10));

/** The request's header, bundle, contacts and assignees against its case (label, ok, detail). The copy check says how
 *  many of its fields hold something: a field blank on both sides compares equal without proving the copy. */
export function requestVsCase(c: RawItem, r: RawItem): { label: string; ok: boolean; detail?: unknown }[] {
  const code = str(c, "Case_Code");
  const copied = I1_COPY.filter((k) => !same(c[k], r[k]));
  const blank = I1_COPY.filter((k) => !filled(c[k]) && !filled(r[k]));
  return [
    { label: "the request names its case (App_Case_Item_Id)", ok: str(r, "App_Case_Item_Id") === c._id, detail: str(r, "App_Case_Item_Id") },
    { label: "Request_Key is <case>|<cycle>", ok: str(r, "Request_Key") === `${code}|${str(c, "Cycle_No") || "1"}`, detail: str(r, "Request_Key") },
    { label: "Supplier_Display_Name is the supplier's legal name", ok: str(r, "Supplier_Display_Name") === str(c, "Supplier_Legal_Name"), detail: str(r, "Supplier_Display_Name") },
    {
      label: `I-1 copied the ${I1_COPY.length} header, bundle and contact fields (${I1_COPY.length - blank.length} hold something${blank.length ? `; blank on both: ${blank.join(", ")}` : ""})`,
      ok: !copied.length,
      detail: copied.length ? Object.fromEntries(copied.map((k) => [k, { case: c[k], request: r[k] }])) : undefined,
    },
    { label: "phase label Filling in, not locked", ok: str(r, "Case_Phase_Label") === "Filling in" && str(r, "Request_Locked") === "No", detail: [str(r, "Case_Phase_Label"), str(r, "Request_Locked")] },
    { label: "Assigned_Contacts = the case's Portal_Assignees_JSON", ok: JSON.stringify(userIds(r, "Assigned_Contacts").sort()) === JSON.stringify(ids(c.Portal_Assignees_JSON)), detail: { request: userIds(r, "Assigned_Contacts"), case: ids(c.Portal_Assignees_JSON) } },
    { label: "Release_Contacts = the case's Release_Assignees_JSON", ok: JSON.stringify(userIds(r, "Release_Contacts").sort()) === JSON.stringify(ids(c.Release_Assignees_JSON)), detail: { request: userIds(r, "Release_Contacts"), case: ids(c.Release_Assignees_JSON) } },
  ];
}
