// Domain objects → Kissflow field values for the app's writes (DESIGN §6). Owner C.
// - Select fields get their option texts exactly as live (ids.ts LIST); Dates go as yyyy-mm-dd, DateTimes without
//   milliseconds (Kissflow refuses them: kfDateTime, CAFM, verified live); "" is never sent for a typed field (compact,
//   as portal/data/liveActions.ts:49).
// - Users go as {_id} and multi-users as [{_id}] (the SDK write shape is [unverified], risk R-6). The acting user's
//   alias ("u-admin", "u-auditor", "u-owner", DESIGN §3.4) and the self contact ("self:<id>", the signed-in user as a
//   supplier contact, map/people.ts) become the Kissflow id before anything is written; ids that name no Kissflow user
//   ("role:QM", "contact:…", "mail:…", "system") are never written to a User field.
// - Thread_JSON is {thread, edits} (map/trackMap.ts parseThread reads exactly this).
// Pure: no SDK, no Kissflow call.
import { DEPT_LABEL } from "@/domain/catalog";
import type { NewCaseInput } from "@/domain/actions";
import type { AppState, CiqCase, Dept, Finding, InternalNote, ObjectRef, OpenPoint, ReviewDept, RmesCriterion, Supplier, User } from "@/domain/types";
import { str } from "@/portal/data/raw";
import { kfDateTime, type KfData } from "@/portal/kf/sdk";
import { LIST, TABLES } from "../ids";
import type { CaseHeader } from "../map/auditMap";
import { kfIdOfContact, selfContactId } from "../map/people";
import { CASE_START_FIELDS, type CaseStartFields } from "../shared/caseStartPayload";
import type { CaseRef, ReleaseRow, WriteCtx } from "../types";

/** Who writes: the signed-in Kissflow user and the persona it acts as (its alias, if any, is `acting.me.id`). */
export type Who = Pick<WriteCtx, "identity" | "acting">;

/** Drop empty values: Kissflow rejects "" for typed fields (master.md §3.5); an empty list writes nothing either. */
export function compact(o: KfData): KfData {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== "" && !(Array.isArray(v) && !v.length)));
}

/** A Kissflow Date: "yyyy-mm-dd" from an ISO date or DateTime ("" when unreadable). */
export function kfDate(iso: string | undefined): string {
  const v = (iso ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}/.test(v) && Number.isFinite(Date.parse(v.slice(0, 10))) ? v.slice(0, 10) : "";
}

/** A Kissflow DateTime without milliseconds ("" when unreadable). */
export function kfDateTimeOf(iso: string | undefined): string {
  const t = Date.parse(iso ?? "");
  return Number.isFinite(t) ? kfDateTime(new Date(t)) : "";
}

/** Ids that name no Kissflow user: the mapper's stand-ins (map/people.ts) and "system". */
// …and the ids the domain gives contacts it creates (`u-<supplierId>-<n>`, map/suppliersMap.ts): they name no Kissflow
// user, so they are never a portal assignee or a User field value.
const NOT_A_USER = /^(role|contact|mail|name):|^u-.+-\d+$/;
const ALIASES = new Set(["u-admin", "u-auditor", "u-owner"]);

/** The Kissflow user id behind a domain user id: the acting user's alias maps back to its Kissflow id (DESIGN §3.4), the
 *  self contact to the user's own (kfIdOfContact). */
export function kfUserId(domainUserId: string, who: Who): string {
  return domainUserId && domainUserId === who.acting.me.id ? who.identity.kfUserId : kfIdOfContact(domainUserId);
}

/** True for an id a User field can hold (a supplier contact's portal user id included; the self contact as the user
 *  behind it). */
export const isKfUser = (id: string | undefined): id is string => {
  const kf = id ? kfIdOfContact(id) : "";
  return !!kf && kf !== "system" && !NOT_A_USER.test(kf) && !ALIASES.has(kf);
};

/** A User field value {_id}, or undefined when the id names no Kissflow user. */
export function userRef(domainUserId: string | undefined, who: Who): { _id: string } | undefined {
  if (!domainUserId) return undefined;
  const id = kfUserId(domainUserId, who);
  return isKfUser(id) ? { _id: id } : undefined;
}

/** A copy with the acting user's alias and the self contact replaced by the Kissflow id everywhere (snapshots and
 *  threads keep Kissflow ids, map/auditMap.ts AuditSnapshot; the mapper reads a supplier-side id back as the self
 *  contact). */
export function toKfIds<T>(v: T, who: Who): T {
  if (v === undefined) return v;
  const kf = who.identity.kfUserId;
  const from = new Set([who.acting.me.id, selfContactId(kf)].filter((x) => x !== kf));
  return JSON.parse(JSON.stringify(v, (_k, x: unknown) => (typeof x === "string" && from.has(x) ? kf : x))) as T;
}

/** A supplier contact id that is a portal user (Contacts_Portal_User_Id, the self contact included), not a stand-in.
 *  Written as kfIdOfContact(id). */
export const isPortalUser = (id: string): boolean => isKfUser(id);

/** The display name of a user in the state ("" when unknown). */
export const nameIn = (users: readonly User[], id: string | undefined): string => (id ? (users.find((u) => u.id === id)?.name ?? "") : "");
const emailIn = (users: readonly User[], id: string | undefined): string => (id ? (users.find((u) => u.id === id)?.email ?? "") : "");

/** Random letters and digits (Event_Key suffix, child row ids). */
export function rand(n: number): string {
  const abc = "abcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (let i = 0; i < n; i++) out += abc[Math.floor(Math.random() * abc.length)];
  return out;
}

/** A new child row's `_id` as Kissflow writes them ("<Model>_<rand10>"), sent with `_is_created: true`. */
export const childRowId = (model: string): string => `${model}_${rand(10)}`;

const yesNo = (b: boolean) => (b ? LIST.yes : LIST.no);
const DEPTS = new Set<Dept>(["RMM", "REG", "SAF", "QM", "MIC", "SUS", "CUS", "LEG"]);
/** A department value for the live Department list (Note_Dept, Actor_Dept), else undefined. */
export const deptValue = (d: string | undefined): Dept | undefined => (d && DEPTS.has(d as Dept) ? (d as Dept) : undefined);

// ---------------------------------------------------------------------------------- counts (Review_Gate inputs)

/** Open_Count and RMES_Gaps of a track: the domain's reviewBlockers split in two (selectors.ts:202). */
export function countsOf(c: CiqCase, dept: ReviewDept): { Open_Count: number; RMES_Gaps: number } {
  const open = c.openPoints.filter((p) => p.dept === dept && p.status !== "closed").length;
  let gaps = 0;
  if ((dept === "SAF" || dept === "REG") && c.rmes) {
    gaps += c.rmes.criteria.filter((x) => x.dept === dept && !x.result).length;
    gaps += c.rmes.findings.filter((f) => f.dept === dept && f.status === "open").length;
    if (!c.reviews.find((r) => r.dept === dept)?.decision) gaps += 1;
  }
  return { Open_Count: open, RMES_Gaps: gaps };
}

// ---------------------------------------------------------------------------------- open points

/** Ref_Kind as the fixtures and the portal read it. */
export const refKind = (ref: ObjectRef): string => (ref.rowId ? "Component row" : ref.documentId ? "Document" : ref.fieldId ? "Field" : "Section");

/** Thread_JSON: {thread, edits} with Kissflow user ids. */
export function threadJson(op: OpenPoint, who: Who): string {
  return JSON.stringify(toKfIds({ thread: op.thread, edits: op.edits ?? [] }, who));
}

/** The case contacts that are portal users (Portal_Contact_Ids). */
export const portalContactIds = (ref: Pick<CaseRef, "contacts">): string[] => ref.contacts.map((k) => k.id).filter(isPortalUser).map(kfIdOfContact);

/** Every Start field of a new open point (G-11 Mandatory + the Editable fields the portal and I-3 read). */
export function opStartFields(c: CiqCase, op: OpenPoint, ref: CaseRef, ctx: WriteCtx, users: readonly User[] = [], internalKey?: string): KfData {
  const doc = op.ref.documentId ? c.documents.find((d) => d.id === op.ref.documentId) : undefined;
  return compact({
    OP_Key: op.id,
    Round_No: op.rounds,
    Query_Key: `${op.id}-R${op.rounds}`,
    Case_Code: c.id,
    Cycle_No: ref.cycleNo,
    Supplier_Code: ref.supplierCode || c.supplierId,
    Case_Item_Id: ref.itemId,
    OP_Kind: LIST.opKind[op.kind],
    OP_Dept: op.dept,
    Raised_By_Dept: op.dept,
    OP_To_Supplier: LIST.yes,
    Ref_Kind: refKind(op.ref),
    Ref_Section_Key: op.ref.sectionId,
    Ref_Field_Key: op.ref.fieldId,
    Ref_Row_Id: op.ref.rowId,
    Ref_Doc_Id: op.ref.documentId,
    Ref_Doc_File_Name: doc?.name,
    Ref_Doc_Uploaded_At: kfDateTimeOf(doc?.uploadedAt),
    Ref_Label: op.ref.label,
    Ref_Internal_Key: internalKey,
    Kind_Label: LIST.kindLabel[op.kind],
    Question_Text: op.question,
    // Mandatory at Start: a blank justification is written as a dash (map/trackMap.ts reads "—" as "")
    Supplier_Justification: op.justification.trim() || "—",
    Responsible_User: userRef(op.responsibleId, ctx),
    Responsible_Name: nameIn(users, op.responsibleId) || (op.responsibleId === ctx.acting.me.id ? ctx.identity.name : ""),
    Responsible_Dept_Label: DEPT_LABEL[op.dept],
    Supplier_Due_Date: kfDate(op.dueDate),
    Raised_By_User: userRef(op.createdBy, ctx),
    Raised_By_Name: op.createdBy === ctx.acting.me.id ? ctx.identity.name : nameIn(users, op.createdBy),
    // the raiser's e-mail (22 Oct): op.round copies it to the query, for the answered-mail to the raiser
    Raised_By_Email: op.createdBy === ctx.acting.me.id ? ctx.identity.email : emailIn(users, op.createdBy),
    // field assignment of the department step (G-11; walk-v6 "to: User:…")
    Raiser_Assignee: [userRef(ctx.acting.me.id, ctx)].filter(Boolean),
    OP_Progress: LIST.opProgress.open,
    Thread_JSON: threadJson(op, ctx),
    Portal_Contact_Ids: portalContactIds(ref).join(","),
  });
}

// ---------------------------------------------------------------------------------- reviews

/** The Start fields of a review item (round `round`): the RMM reopen's round n+1 (the round-1 reviews are I-2's since
 *  22 Oct, E-A). RMM's review is assigned to the case owner; a department's is held by its role, so no Assignee_User. */
export function reviewStartFields(c: CiqCase, ref: CaseRef, dept: ReviewDept, round: number, kind: "Completeness" | "Reopened", reason: string, ctx: WriteCtx, users: readonly User[] = []): KfData {
  const owner = dept === "RMM" ? c.ownerId : undefined;
  return compact({
    Review_Key: `${c.id}-${dept}-${round}`,
    Case_Code: c.id,
    Cycle_No: ref.cycleNo,
    Case_Item_Id: ref.itemId,
    Supplier_Code: ref.supplierCode || c.supplierId,
    Trade_Name: c.materialName,
    Review_Dept: dept,
    Round_No: round,
    Activation_Kind: kind,
    Activation_Reason: reason,
    Activated_By_Name: ctx.identity.name,
    Assignee_User: userRef(owner, ctx),
    Assignee_Name: owner ? nameIn(users, owner) || (owner === ctx.acting.me.id ? ctx.identity.name : "") : undefined,
    Assignee_Email: owner ? emailIn(users, owner) || (owner === ctx.acting.me.id ? ctx.identity.email : "") : undefined,
    Track_Status: kind === "Reopened" ? LIST.track.reopened : LIST.track["in-review"],
    ...countsOf(c, dept),
  });
}

// ---------------------------------------------------------------------------------- RMES child rows

/** One RMES criterion as a child row (no `_id`: the caller adds it). Criteria_Open_Num is a formula, never written. */
export function criterionRow(cr: RmesCriterion, who: Who): KfData {
  return compact({
    Criteria_Code: cr.id,
    Criteria_Part: cr.part,
    Criteria_Title: cr.title,
    Criteria_Applicable: LIST.yes,
    Criteria_Applicability_Basis: cr.source.label,
    Criteria_Source_Section_Key: cr.source.sectionId,
    Criteria_Source_Field_Key: cr.source.fieldId,
    Criteria_Result: cr.result ? LIST.rmesResult[cr.result] : undefined,
    Criteria_Comment: cr.comment,
    Criteria_Recorded_By: userRef(cr.by, who),
    Criteria_Recorded_At: kfDateTimeOf(cr.at),
    ...(cr.limit
      ? {
          Criteria_Reported_Value: cr.limit.value,
          Criteria_Reported_Unit: cr.limit.unit,
          Criteria_Limit_Value: cr.limit.limit,
          Criteria_Limit_Set_Version: cr.limit.limitSetVersion,
          Criteria_Limit_Pass: yesNo(cr.limit.pass),
          Criteria_Source_Value_Text: cr.limit.substance,
        }
      : {}),
    Criteria_AI_Suggestion_Text: cr.aiSuggestion,
  });
}

/** One finding as a child row (no `_id`). Findings_State is a Text field: "open" / "closed". */
export function findingRow(f: Finding): KfData {
  return compact({
    Findings_Key: f.id,
    Findings_Criterion_Code: f.criterionId,
    Findings_Text: f.text,
    Findings_Blocking: yesNo(f.blocking),
    Findings_State: f.status,
    Findings_Linked_OP_Key: f.openPointId,
  });
}

/** The RMES form and its child models of a department. */
export const rmesFlowOf = (dept: "SAF" | "REG") => (dept === "SAF" ? "rmesSAF" : "rmesREG") as "rmesSAF" | "rmesREG";
export const rmesTables = (dept: "SAF" | "REG") => TABLES[dept];

// ---------------------------------------------------------------------------------- notes

export function noteFields(c: CiqCase, ref: CaseRef, note: InternalNote, ctx: WriteCtx, users: readonly User[] = []): KfData {
  const mentioned = (note.mentions ?? []).map((id) => users.find((u) => u.id === id)).filter((u): u is User => !!u);
  return compact({
    Note_Key: note.id,
    Case_Code: c.id,
    Cycle_No: ref.cycleNo,
    Case_Item_Id: ref.itemId,
    Linked_Kind: note.sectionId ? "Section" : "Case",
    Linked_Key: note.sectionId ?? c.id,
    Note_Text: note.text,
    Note_Author: userRef(note.by, ctx),
    Note_Dept: deptValue(note.dept),
    Note_At: kfDateTimeOf(note.at),
    Note_Mentions_Emails: mentioned.map((u) => (u.id === ctx.acting.me.id ? ctx.identity.email : u.email)).filter(Boolean).join(","),
    Note_Mentions_Names: mentioned.map((u) => u.name).join(", "),
  });
}

// ---------------------------------------------------------------------------------- the case

/** The Start fields of a new CIQ Case (G-9 Mandatory + Editable) plus the six fields caseStartPayload computes. */
export function caseStartFields(c: CiqCase, input: NewCaseInput, release: ReleaseRow, start: CaseStartFields, ctx: WriteCtx, users: readonly User[] = []): KfData {
  const contacts = c.supplierContactIds.map((id) => users.find((u) => u.id === id)).filter((u): u is User => !!u && u.active !== false);
  const portal = contacts.filter((u) => isPortalUser(u.id));
  const markets = c.config.SF11 ?? [];
  return compact({
    Case_Code: c.id,
    Cycle_No: 1,
    Case_Title: `${c.id} · ${c.materialName}`,
    Trade_Name: c.materialName,
    Main_INCI: c.inci,
    BDF_Material_No: c.materialNo,
    Supplier_Code: c.supplierId,
    Supplier_Legal_Name: c.manufacturer,
    Owner_RMM: userRef(c.ownerId, ctx),
    // the Beiersdorf contact the supplier sees is the person who starts the case (DESIGN §6 createCase)
    BDF_Contact_Name: ctx.identity.name,
    BDF_Contact_Email: ctx.identity.email,
    Target_Markets_Text: markets.join(", "),
    Markets_Label: markets.join(", "),
    Template_Version: c.templateVersion,
    Template_Label: c.templateVersion,
    Rule_Set_Version: c.ruleSetVersion,
    Release_Item_Id: release.itemId,
    Release_Key: release.key,
    Manifest_Hash: str(release.raw, "Manifest_Hash"),
    Release_Manifest_JSON: str(release.raw, "Release_Manifest_JSON"),
    Supplier_Due_Date: kfDate(c.dueDate),
    Priority: LIST.priority[c.priority],
    Portal_Contact_Ids: portal.map((u) => kfIdOfContact(u.id)).join(","),
    Confirm_Contact_Ids: portal.filter((u) => u.mayConfirm !== false).map((u) => kfIdOfContact(u.id)).join(","),
    Supplier_Contact_Emails: contacts.map((u) => u.email).filter(Boolean).join(","),
    Duplicate_Reason: input.duplicateNote?.trim(),
    Follow_Up_Of_Case: input.followUpOf?.caseId,
    Follow_Up_Of_Report: input.followUpOf?.reportId,
    [CASE_START_FIELDS.configBundle]: start[CASE_START_FIELDS.configBundle],
    [CASE_START_FIELDS.configBundleHash]: start[CASE_START_FIELDS.configBundleHash],
    [CASE_START_FIELDS.bdfSet]: start[CASE_START_FIELDS.bdfSet],
    [CASE_START_FIELDS.caseContacts]: start[CASE_START_FIELDS.caseContacts],
    [CASE_START_FIELDS.portalAssignees]: start[CASE_START_FIELDS.portalAssignees],
    [CASE_START_FIELDS.releaseAssignees]: start[CASE_START_FIELDS.releaseAssignees],
  });
}

/** The header a `case.created` row keeps (map/auditMap.ts CaseHeader), with Kissflow user ids. */
export function caseHeaderOf(c: CiqCase, itemId: string, start: CaseStartFields, ctx: WriteCtx, users: readonly User[] = []): CaseHeader {
  const parse = <T,>(text: string, fallback: T): T => {
    try {
      return JSON.parse(text) as T;
    } catch {
      return fallback;
    }
  };
  const contacts = parse<{ id?: string; name: string; email: string; title?: string; mayConfirm?: boolean }[]>(start[CASE_START_FIELDS.caseContacts], []);
  const duns = c.answers["FLD-GEN-003"];
  return {
    caseId: c.id,
    itemId,
    cycleNo: 1,
    materialName: c.materialName,
    inci: c.inci,
    materialNo: c.materialNo,
    supplierId: c.supplierId,
    manufacturer: c.manufacturer,
    duns: typeof duns === "string" ? duns : "",
    ownerId: kfUserId(c.ownerId, ctx),
    ownerName: nameIn(users, c.ownerId) || (c.ownerId === ctx.acting.me.id ? ctx.identity.name : ""),
    createdAt: c.createdAt,
    dueDate: kfDate(c.dueDate),
    priority: c.priority,
    templateVersion: c.templateVersion,
    ruleSetVersion: c.ruleSetVersion,
    markets: c.config.SF11 ?? [],
    contacts: contacts.map((k) => ({ id: k.id ?? "", name: k.name, email: k.email, title: k.title ?? "", mayConfirm: k.mayConfirm !== false })),
    bdfSet: parse<Record<string, unknown>>(start[CASE_START_FIELDS.bdfSet], {}),
  };
}

// ---------------------------------------------------------------------------------- supplier master

/** The live country list (CIQ_Country_Code_A00) by the names the prototype's supplier form offers. */
const COUNTRY_CODES: Record<string, string> = {
  austria: "AT", belgium: "BE", bulgaria: "BG", croatia: "HR", cyprus: "CY", "czech republic": "CZ", czechia: "CZ", denmark: "DK", estonia: "EE",
  finland: "FI", france: "FR", germany: "DE", greece: "GR", hungary: "HU", ireland: "IE", italy: "IT", latvia: "LV", lithuania: "LT",
  luxembourg: "LU", malta: "MT", netherlands: "NL", poland: "PL", portugal: "PT", romania: "RO", slovakia: "SK", slovenia: "SI", spain: "ES",
  sweden: "SE", "united kingdom": "GB", uk: "GB", turkey: "TR", "türkiye": "TR", china: "CN", usa: "US", "united states": "US", canada: "CA",
};
const LIVE_CODES = new Set(Object.values(COUNTRY_CODES));

/** The live country code of a country (a live code passes through); "" when the live list has none. */
export function countryCode(country: string): string {
  const v = country.trim();
  if (LIVE_CODES.has(v.toUpperCase()) && v.length === 2) return v.toUpperCase();
  return COUNTRY_CODES[v.toLowerCase()] ?? "";
}

/** The header fields of a CIQ Supplier row. */
export function supplierFields(s: Supplier): KfData {
  return compact({
    Supplier_Code: s.id,
    Supplier_Legal_Name: s.name,
    DUNS_Number: s.duns,
    Supplier_Kind: LIST.supplierKind[s.type],
    Supplier_Country_Code: countryCode(s.country),
    Supplier_City: s.city,
    Supplier_Active: yesNo(s.active !== false),
  });
}

/** A new Contacts row (no `_id`): Contacts_Key = the domain user id (DESIGN §6 addSupplier). */
export function contactRow(u: User): KfData {
  return compact({
    Contacts_Key: u.id,
    Contacts_Full_Name: u.name,
    Contacts_Email: u.email,
    Contacts_Title: u.title,
    Contacts_Can_Confirm: yesNo(u.mayConfirm !== false),
    Contacts_Active: yesNo(u.active !== false),
    Contacts_Deactivated_At: u.active === false ? kfDateTimeOf(u.deactivatedAt) : undefined,
  });
}

/** The display names of a state, for questionsHistory (shared/questionsHistory.ts NameOf). */
export const nameOfIn =
  (s: Pick<AppState, "users">) =>
  (userId: string, side: "internal" | "supplier"): string =>
    nameIn(s.users, userId) || (side === "supplier" ? "Supplier contact" : "Beiersdorf");
