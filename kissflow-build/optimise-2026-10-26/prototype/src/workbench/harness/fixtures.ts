// Fictional fixtures (WORKBENCH-DESIGN.md §11.3; ground rule 11): users (users.ts), suppliers, configuration, and
// cases, points and change requests. Cases are built by DRIVING THE ENGINE ITSELF (create → write → submit through
// the steps, as the users who hold the tasks, with the step permissions enforced), so every fixture state is
// reachable. Two states are reached by a native action instead, as live: C8's S7 submit (native, Final_Release_At
// blank) and P5's reject (a stray reject by a process admin in Kissflow; reject is off on the Open Point flow).
//
// Harness additions beyond §11.3 (named in NOTES-T4-harness.md): P8 (an internal REG point on C5, the "open item"
// of S24a) and C10b (C10's reactivated cycle 2, at S1).
import type { ChildTableId, FlowId, StepIr } from "../schema/generated";
import { handle, wf, type HostCtx, type Req } from "./commands";
import { tableKey } from "./formula";
import { sha256Hex } from "./sha256";
import { draftOf, findItem, openActs, type ProcItem } from "./state";
import { DAY, FIXTURE_BASE, MINUTE, isoDate, isoSec } from "./time";
import { USERS, type FixtureUser } from "./users";
import { holds, rejectItem } from "./workflow";

export type FixtureIndex = Record<string, string>;

const CASE: FlowId = "CIQ_Case_A00";
const OP: FlowId = "CIQ_Open_Point_A00";
const CR: FlowId = "CIQ_Change_Request_A00";
const F1: FlowId = "CIQ_Supplier_A00";
const F2: FlowId = "CIQ_Config_Version_A00";
const F3: FlowId = "CIQ_Section_A00";
const F4: FlowId = "CIQ_Scope_Run_A00";
const F5: FlowId = "CIQ_RMES_Safety_A00";
const F7: FlowId = "CIQ_Internal_Note_A00";
const F8: FlowId = "CIQ_Audit_Event_A00";

export const SECTIONS = [
  { key: "BASIC", code: "BASIC", title: "Basic data and configuration", lead: "RMM", def: "Mandatory" },
  { key: "GEN", code: "GEN", title: "General information and manufacturer", lead: "QM", def: "Mandatory" },
  { key: "K2.1", code: "K2.1", title: "Composition", lead: "REG", def: "Mandatory" },
  { key: "SAF-A", code: "SAF-A", title: "Safety data: toxicology", lead: "SAF", def: "Mandatory" },
  { key: "REG-B", code: "REG-B", title: "Regulatory status", lead: "REG", def: "Optional" },
  { key: "SUS-1", code: "SUS-1", title: "Sustainability and sourcing", lead: "SUS", def: "Optional" },
] as const;

/** Sections of the informed departments (no review step, read-only roles): K7 Customs & Trade Compliance, K8 Legal /
 *  IP. Harness addition: on three cases only (C5 and C9 K7, C7 K8; after their scope), so the template, the scope
 *  run and every other fixture keep their section rows. */
export const INFORMED_SECTIONS = [
  { key: "K7", code: "K7", title: "Customs and trade compliance", lead: "CUS", def: "Mandatory" },
  { key: "K8", code: "K8", title: "Intellectual property and legal claims", lead: "LEG", def: "Optional" },
] as const;
type SectionFx = (typeof SECTIONS)[number] | (typeof INFORMED_SECTIONS)[number];

export const RMES_CRITERIA = [
  { code: "SAF-A1", part: "A", title: "Identity and purity confirmed", dept: "SAF" },
  { code: "SAF-A2", part: "A", title: "Impurity profile within limits", dept: "SAF" },
  { code: "SAF-B1", part: "B", title: "Skin sensitisation data", dept: "SAF" },
  { code: "SAF-B2", part: "B", title: "Genotoxicity data", dept: "SAF" },
  { code: "SAF-C1", part: "C", title: "Systemic exposure margin", dept: "SAF" },
  { code: "SAF-D1", part: "D", title: "Overall safety conclusion", dept: "SAF" },
  { code: "REG-A1", part: "A", title: "INCI name verified", dept: "REG" },
  { code: "REG-A2", part: "A", title: "CAS / EC numbers verified", dept: "REG" },
  { code: "REG-B1", part: "B", title: "Annex restrictions checked", dept: "REG" },
  { code: "REG-C1", part: "C", title: "Market-specific listings", dept: "REG" },
  { code: "REG-C2", part: "C", title: "Animal-testing statement", dept: "REG" },
  { code: "REG-D1", part: "D", title: "Overall regulatory conclusion", dept: "REG" },
] as const;

interface SupplierFx {
  code: string;
  name: string;
  country: string;
  active: "Yes" | "No";
  contacts: { name: string; email: string; role: string; canConfirm: "Yes" | "No"; portal: string }[];
}
export const SUPPLIERS: SupplierFx[] = [
  {
    code: "SUP-NWB",
    name: "Northwind Botanicals GmbH",
    country: "DE",
    active: "Yes",
    contacts: [
      { name: "Mara Lindqvist", email: "mara.lindqvist@example.test", role: "Coordinator", canConfirm: "Yes", portal: "UsPortalNwb01" },
      { name: "Oskar Brandt", email: "oskar.brandt@example.test", role: "Quality", canConfirm: "Yes", portal: "UsPortalNwb02" },
      { name: "Lena Vogt", email: "lena.vogt@example.test", role: "Regulatory", canConfirm: "No", portal: "" },
    ],
  },
  { code: "SUP-LUM", name: "Lumen Ingredients BV", country: "NL", active: "Yes", contacts: [{ name: "Ines Raaf", email: "ines.raaf@example.test", role: "Coordinator", canConfirm: "Yes", portal: "UsPortalLum01" }] },
  { code: "SUP-CRV", name: "Corvid Chemicals Ltd", country: "GB", active: "No", contacts: [{ name: "Tom Ashby", email: "tom.ashby@example.test", role: "Key account", canConfirm: "Yes", portal: "UsPortalCrv01" }] },
];

/** Every fictional contact name and e-mail (redaction checks). */
export const FIXTURE_CONTACT_PEOPLE: string[] = SUPPLIERS.flatMap((s) => s.contacts.flatMap((c) => [c.name, c.email]));

type Data = Record<string, unknown>;

export function buildFixtures(ctx: HostCtx): FixtureIndex {
  const realClock = ctx.clock;
  let t = FIXTURE_BASE;
  ctx.clock = () => t;
  const tick = (min = 1) => (t += min * MINUTE);
  const nowS = () => isoSec(t);
  const day = (n: number) => isoDate(FIXTURE_BASE + n * DAY);
  const fx = ctx.state.fixtures;
  const U = (id: string): FixtureUser => USERS[id];
  const ref = (id: string) => ({ _id: U(id)._id });

  const cmd = (uid: string, req: Req): Data => {
    tick();
    return handle(ctx, U(uid), req).resp as Data;
  };
  // ---- process helpers
  const create = (uid: string, flow: FlowId, data: Data): { id: string; act: string } => {
    const r = cmd(uid, { command: "PROCESS_CREATE_ITEM", flowId: flow, data });
    return { id: String(r._id), act: String(r._activity_instance_id) };
  };
  const item = (flow: FlowId, id: string): ProcItem => {
    const it = findItem(ctx.state, flow, id);
    if (!it) throw new Error(`fixture: no ${flow} ${id}`);
    return it;
  };
  /** The open activity at a step and a fixture user (not dev, when anyone else holds it) who holds it. */
  const at = (flow: FlowId, id: string, s: StepIr): { act: string; uid: string } => {
    const a = openActs(item(flow, id)).find((x) => x.step === s);
    if (!a) throw new Error(`fixture: ${flow} ${id} has no open ${s} (open: ${openActs(item(flow, id)).map((x) => x.step).join(", ")})`);
    const holder = Object.values(USERS).find((x) => x.id !== "dev" && holds(x, a)) ?? (holds(U("dev"), a) ? U("dev") : undefined);
    if (!holder) throw new Error(`fixture: nobody holds ${s} on ${id}`);
    return { act: a.act, uid: holder.id };
  };
  const step_ = (flow: FlowId, id: string, s: StepIr, data: Data, o: { submit?: boolean; native?: boolean } = {}) => {
    const { act, uid } = at(flow, id, s);
    if (Object.keys(data).length) cmd(uid, { command: "PROCESS_UPDATE_ITEM", flowId: flow, instanceId: id, activityInstanceId: act, data });
    if (o.submit === false) return uid;
    cmd(uid, { command: "PROCESS_SUBMIT_ITEM", flowId: flow, instanceId: id, activityInstanceId: act });
    if (o.native) {
      const a = item(flow, id).acts.find((x) => x.act === act)!;
      a.how = "native-submit";
    }
    return uid;
  };
  // ---- form helpers
  const form = (uid: string, flow: FlowId, data: Data): string => {
    const d = cmd(uid, { command: "DATAFORM_CREATE_ITEM", flowId: flow, data });
    const r = cmd(uid, { command: "DATAFORM_SUBMIT_ITEM", flowId: flow, itemId: String(d._id), data: {} });
    return String(r._id);
  };
  let evSeq = 0;
  const audit = (uid: string, e: Data): string => {
    const u = U(uid);
    return form(uid, F8, {
      Event_Key: `EV-FX${String(++evSeq).padStart(4, "0")}`,
      Event_At: nowS(),
      Actor_Side: "BDF",
      Actor_Name: u.Name,
      Actor_Email: u.Email,
      Actor_Role_Id: "",
      ...e,
    });
  };

  // ======================================================== configuration (robin, Business Admin)
  const payload = (x: unknown) => JSON.stringify(x);
  const cfg = (name: string, kind: string, key: string, body: unknown, extra: Data = {}): string => {
    const Payload_JSON = payload(body);
    const id = form("robin", F2, {
      Config_Key: key,
      Config_Kind: kind,
      Version_Label: "v1",
      Config_State: "Published",
      Payload_JSON,
      Content_Hash: sha256Hex(Payload_JSON),
      Change_Note: "Fixture configuration (fictional).",
      Published_By: ref("robin"),
      Published_At: nowS(),
      ...extra,
    });
    fx[name] = id;
    return id;
  };
  const manifest: { configKey: string; kind: string; itemId: string; sectionKey?: string; sectionRev?: number; contentHash: string }[] = [];
  const pin = (key: string, kind: string, id: string, body: unknown, section?: string) =>
    manifest.push({ configKey: key, kind, itemId: id, contentHash: sha256Hex(payload(body)), ...(section ? { sectionKey: section, sectionRev: 1 } : {}) });

  const template = { sections: SECTIONS.map((s) => ({ sectionKey: s.key, default: s.def })) };
  pin("template-ciq-v1", "Template", cfg("CFG_TEMPLATE", "Template", "template-ciq-v1", template), template);
  for (const s of SECTIONS) {
    const body = {
      sectionKey: s.key,
      code: s.code,
      title: s.title,
      sort: SECTIONS.indexOf(s),
      fields: [
        { key: `${s.key}.q1`, label: `${s.title}: main statement`, type: "text", required: true },
        { key: `${s.key}.q2`, label: `${s.title}: supporting document`, type: "document", required: false },
      ],
    };
    const key = `section-definition-${s.key}-v1`;
    pin(key, "Section definition", cfg(`CFG_SECDEF_${s.key}`, "Section definition", key, body, { Section_Key: s.key, Section_Rev: 1 }), body, s.key);
  }
  const ownership = { owners: Object.fromEntries(SECTIONS.map((s) => [s.key, { lead: s.lead, co: s.key === "K2.1" ? ["SAF"] : [], queryOwner: s.lead === "QM" ? "RMM" : s.lead }])) };
  pin("section-ownership-ciq-v1", "Section ownership", cfg("CFG_OWNERSHIP", "Section ownership", "section-ownership-ciq-v1", ownership), ownership);
  const criteria = { criteria: RMES_CRITERIA.map((c) => ({ ...c })) };
  pin("rmes-criteria-ciq-v1", "RMES criteria", cfg("CFG_RMES", "RMES criteria", "rmes-criteria-ciq-v1", criteria), criteria);
  const texts = {
    texts: {
      "completeness.declaration": "We confirm that the questionnaire is complete and correct to the best of our knowledge.",
      "final.declaration": "We release the answers and documents of this questionnaire for the stated raw material.",
      "closing.neutral": "Thank you. This questionnaire has been closed.",
    },
  };
  pin("text-bundle-ciq-v1", "Text bundle", cfg("CFG_TEXTS", "Text bundle", "text-bundle-ciq-v1", texts), texts);
  const settings = { deptReviewMode: false, overallApprovalRequired: false, defaultSupplierDueDays: 14, reactivationDays: 365, ...(ctx.params.countsPolicy ? { countsPolicy: ctx.params.countsPolicy } : {}) };
  pin("settings-ciq-v1", "Settings", cfg("CFG_SETTINGS", "Settings", "settings-ciq-v1", settings), settings);
  // a Draft rule set: never in the manifest, so S2 writes "none (manual-wb-1)". ruleSet=published: a Published v1 with
  // fictional rules instead (still not in the manifest), so the Rule table offers "New draft from v1"
  if (ctx.params.ruleSet === "published")
    fx.CFG_RULESET = cfg("CFG_RULESET", "Rule set", "rule-set-ciq-v1", {
      rules: [
        { id: "R-1", question: "SF01", condition: "Always", activates: ["BASIC", "GEN", "K2.1"], outcome: "Mandatory", evidence: [], departments: ["RMM", "QM", "REG"], basis: "assumption" },
        { id: "R-2", question: "SF04", condition: "Leave-on product", activates: ["SAF-A"], outcome: "Mandatory", evidence: ["Toxicology summary"], departments: ["SAF"], basis: "document" },
        { id: "R-3", question: "SF09", condition: "Shipped outside the EU", activates: ["K7"], outcome: "Optional", evidence: [], departments: ["CUS"], basis: "assumption" },
      ],
    });
  else fx.CFG_RULESET_DRAFT = form("robin", F2, { Config_Key: "rule-set-ciq-v1", Config_Kind: "Rule set", Version_Label: "v1-draft", Config_State: "Draft", Payload_JSON: payload({ rules: [] }), Change_Note: "Work in progress (fictional)." });
  const Release_Manifest_JSON = JSON.stringify(manifest);
  const Manifest_Hash = sha256Hex(Release_Manifest_JSON);
  const releaseBody = { manifest: manifest.map((m) => m.configKey) };
  const RELEASE = cfg("CFG_RELEASE", "Release", "release-ciq-live-v1", releaseBody, {
    Release_Key: "REL-20261001-1",
    Release_Label: "CIQ live release 1",
    Release_Stage: "Live",
    Release_Manifest_JSON,
    Release_Bundle_JSON: payload({ configKeys: manifest.map((m) => m.configKey) }),
    Manifest_Hash,
  });

  // ======================================================== suppliers (alex, RMM)
  let rowSeq = 0;
  const rowId = (model: string) => `${model}_FX${String(++rowSeq).padStart(8, "0")}`;
  for (const s of SUPPLIERS) {
    fx[s.code] = form("alex", F1, {
      Supplier_Code: s.code,
      Supplier_Legal_Name: s.name,
      Supplier_Kind: "Manufacturer",
      Supplier_Country_Code: s.country,
      Supplier_Active: s.active,
      Supplier_Test: "No",
      Contact_Portal_Ids_Text: s.contacts.map((c) => c.portal).filter(Boolean).join(","),
      Pending_Invites: 0,
      [tableKey("Contacts")]: s.contacts.map((c) => ({
        _id: rowId("Contacts"),
        _is_created: true,
        Contacts_Full_Name: c.name,
        Contacts_Email: c.email,
        Contacts_Role: c.role,
        Contacts_Can_Confirm: c.canConfirm,
        Contacts_Portal_User_Id: c.portal,
        Contacts_Active: "Yes",
        ...(c.portal ? { Contacts_Invited_At: nowS() } : {}),
      })),
    });
  }
  const NWB = SUPPLIERS[0];
  const LUM = SUPPLIERS[1];
  const confirmers = (s: SupplierFx) => s.contacts.filter((c) => c.canConfirm === "Yes" && c.portal);

  // ======================================================== cases
  interface CaseOpts {
    supplier?: SupplierFx;
    trade: string;
    inci: string;
    mat: string;
    overall?: "Yes" | "No";
    cycle?: number;
    code?: string;
    reactivates?: string;
    by?: string;
  }
  const caseCode = (id: string) => `CIQ-2026-${id}`;
  const keysOf = (code: string, cycle: number) => {
    const b = `${code}-C${cycle}`;
    return { base: b, request: `${b}-REQ`, ps05: `${b}-PS05`, ps11: `${b}-PS11`, rmes: `${b}-RMES`, run1: `${b}-RUN1` };
  };
  const newCase = (name: string, o: CaseOpts): string => {
    const s = o.supplier ?? NWB;
    const by = o.by ?? "alex";
    const c = confirmers(s);
    const r = create(by, CASE, {
      Cycle_No: o.cycle ?? 1,
      Case_Title: `${o.trade} (${s.name})`,
      Trade_Name: o.trade,
      Main_INCI: o.inci,
      BDF_Material_No: o.mat,
      SAP_Material_No: `SAP-${o.mat}`,
      Supplier_Code: s.code,
      Supplier_Legal_Name: s.name,
      Owner_RMM: ref(by),
      Target_Markets_Text: "EU, UK",
      Case_Test: "No",
      BDF_Contact_Name: U(by).Name,
      BDF_Contact_Email: U(by).Email,
      Markets_Label: "EU+UK",
      Template_Label: "CIQ standard",
      Supplier_Due_Date: day(14),
      Case_Contacts_JSON: JSON.stringify(s.contacts.map((x) => ({ name: x.name, email: x.email, role: x.role, canConfirm: x.canConfirm === "Yes", portalUserId: x.portal }))),
      Portal_Contact_Ids: c.map((x) => x.portal).join(","),
      Confirm_Contact_Ids: c.map((x) => x.portal).join(","),
      Supplier_Contact_Emails: c.map((x) => x.email).join(","),
      Release_Item_Id: RELEASE,
      Release_Key: "REL-20261001-1",
      Manifest_Hash,
      Release_Manifest_JSON,
      Overall_Approval_Required: o.overall ?? "No",
      ...(o.reactivates ? { Reactivates_Case_Item: o.reactivates } : {}),
    });
    const code = o.code ?? caseCode(r.id);
    const k = keysOf(code, o.cycle ?? 1);
    cmd(by, { command: "PROCESS_UPDATE_ITEM", flowId: CASE, instanceId: r.id, activityInstanceId: r.act, data: { Case_Code: code, Request_Key: k.request } });
    cmd(by, { command: "PROCESS_SUBMIT_ITEM", flowId: CASE, instanceId: r.id, activityInstanceId: r.act });
    fx[name] = r.id;
    const it = item(CASE, r.id);
    section(by, it, SECTIONS[0], "Template");
    audit(by, { Event_Category: "Item created", Action_Code: "case.created", Actor_Dept: "RMM", Case_Code: code, Cycle_No: o.cycle ?? 1, Case_Item_Id: r.id, Object_Kind: "Case", Object_Item_Id: r.id, Snapshot_JSON: JSON.stringify({ Case_Code: code, Cycle_No: o.cycle ?? 1, Trade_Name: o.trade, Main_INCI: o.inci, BDF_Material_No: o.mat, Supplier_Code: s.code, Supplier_Legal_Name: s.name, Owner_RMM: U(by)._id }) });
    return r.id;
  };
  const section = (uid: string, it: ProcItem, s: SectionFx, origin: string, appl: string = s.def) => {
    const f = it.fields;
    const def = JSON.stringify({ sectionKey: s.key, code: s.code, title: s.title });
    form(uid, F3, {
      Section_Item_Key: `${f.Case_Code}-C${f.Cycle_No}-${s.key}`,
      Case_Code: f.Case_Code,
      Cycle_No: f.Cycle_No,
      Supplier_Code: f.Supplier_Code,
      Case_Item_Id: it.id,
      Section_Key: s.key,
      Section_Code: s.code,
      Section_Title: s.title,
      Section_Sort: SECTIONS.some((x) => x.key === s.key) ? SECTIONS.findIndex((x) => x.key === s.key) : 10 + INFORMED_SECTIONS.findIndex((x) => x.key === s.key),
      Applicability_Label: appl,
      Section_Origin: origin,
      Added_Later: "No",
      Definition_JSON: def,
      Definition_Hash: sha256Hex(def),
      Supplier_Due_Date: f.Supplier_Due_Date,
      Portal_Contact_Ids: f.Portal_Contact_Ids,
      Lead_Dept: s.lead,
      Query_Owner_Dept: s.lead === "QM" || s.lead === "CUS" || s.lead === "LEG" ? "RMM" : s.lead,
      Co_Review_Depts: s.key === "K2.1" ? "SAF" : "",
      Scope_Run_Key: origin === "Template" ? "" : `${f.Case_Code}-C${f.Cycle_No}-RUN1`,
    });
  };
  const toS2 = (id: string) => step_(CASE, id, "CASE_S1", { Basic_Data_Received: "Yes" });
  const toS3 = (id: string, depts: Partial<Record<"REG" | "SAF" | "QM" | "MIC" | "SUS" | "RMM", "Yes" | "No">> = { REG: "Yes", SAF: "Yes", QM: "Yes" }) => {
    const it = item(CASE, id);
    const f = it.fields;
    const k = keysOf(String(f.Case_Code), Number(f.Cycle_No));
    const uid = at(CASE, id, "CASE_S2").uid;
    const na = ["SUS-1"];
    form(uid, F4, {
      Run_Key: k.run1,
      Case_Code: f.Case_Code,
      Cycle_No: f.Cycle_No,
      Case_Item_Id: id,
      Run_No: 1,
      Scope_Trigger: "Initial",
      Release_Item_Id: RELEASE,
      Rule_Set_Version: "none (manual-wb-1)",
      Evaluator_Version: "manual-wb-1",
      Input_JSON: JSON.stringify({ sections: SECTIONS.map((s) => s.key) }),
      Input_Hash: sha256Hex(JSON.stringify({ sections: SECTIONS.map((s) => s.key) })),
      Result_JSON: JSON.stringify({ na }),
      Added_Section_Keys: SECTIONS.filter((s) => s.key !== "BASIC" && !na.includes(s.key)).map((s) => s.key).join(","),
      Lead_Departments: "QM,REG,SAF",
      Run_By: ref(uid),
      Run_At: nowS(),
    });
    for (const s of SECTIONS.slice(1)) if (!na.includes(s.key)) section(uid, it, s, "Scope");
    const flags = { REG: "No", SAF: "No", QM: "No", MIC: "No", SUS: "No", RMM: "No", ...depts };
    step_(CASE, id, "CASE_S2", {
      Confirm_Contact_Ids: f.Confirm_Contact_Ids,
      Supplier_Contact_Emails: f.Supplier_Contact_Emails,
      Rule_Set_Version: "none (manual-wb-1)",
      ...Object.fromEntries(Object.entries(flags).map(([d, v]) => [`Dept_${d}_Active`, v])),
      Initial_Scope_Run_Key: k.run1,
      Completeness_Request_Key: k.ps05,
      Completeness_Declaration_Text: texts.texts["completeness.declaration"],
      Completeness_Text_Key: "completeness.declaration",
      Completeness_Due_Date: day(28),
      RMES_Key: k.rmes,
      Final_Release_Request_Key: k.ps11,
      Final_Release_Declaration_Text: texts.texts["final.declaration"],
      Final_Release_Text_Key: "final.declaration",
      Final_Release_Due_Date: day(60),
      Supplier_Closing_Text: texts.texts["closing.neutral"],
    });
  };
  const toPart2 = (id: string) => {
    const when = isoSec(t - 30 * MINUTE); // the supplier confirmed earlier than the record is typed (manual record)
    step_(CASE, id, "CASE_S3", { Completeness_At: when, RMES_Created_At: when, Completeness_Confirm: "Yes", Completeness_By_Name: NWB.contacts[0].name, Completeness_By_Email: NWB.contacts[0].email, Completeness_By_Role: "Coordinator" });
  };
  const REVIEWER: Record<string, string> = { REG: "sam", SAF: "jo", QM: "tove", MIC: "lee", SUS: "ana", RMM: "alex" };
  const lane = (id: string, d: string, o: { decision?: "Approved" | "Rejected"; reason?: string } = {}) => {
    const uid = REVIEWER[d];
    const u = U(uid);
    const data: Data = { [`${d}_Review_Confirm`]: "Confirmed", [`${d}_Completed_By`]: { _id: u._id }, [`${d}_Completed_By_Email`]: u.Email, [`${d}_Completed_At`]: nowS(), [`${d}_Open_Count`]: 0 };
    if (d === "SAF" || d === "REG") Object.assign(data, { [`${d}_RMES_Gaps`]: 0, [`${d}_RMES_Decision`]: o.decision ?? "Approved", ...(o.reason ? { [`${d}_RMES_Decision_Reason`]: o.reason } : {}) });
    const s = `CASE_B_${d}` as StepIr;
    const a = openActs(item(CASE, id)).find((x) => x.step === s);
    if (!a || !holds(u, a)) throw new Error(`fixture: ${uid} holds no ${s} on ${id}`);
    cmd(uid, { command: "PROCESS_UPDATE_ITEM", flowId: CASE, instanceId: id, activityInstanceId: a.act, data });
    cmd(uid, { command: "PROCESS_SUBMIT_ITEM", flowId: CASE, instanceId: id, activityInstanceId: a.act });
    const f = item(CASE, id).fields;
    audit(uid, { Event_Category: "Case", Action_Code: "lane.completed", Actor_Dept: d, Case_Code: f.Case_Code, Cycle_No: f.Cycle_No, Case_Item_Id: id, Object_Kind: "Case", Object_Key: `${f.Case_Code}:lane:${d}`, Object_Item_Id: id, Snapshot_JSON: JSON.stringify(data) });
  };
  const s5 = (id: string, o: { override?: string } = {}) =>
    step_(CASE, id, "CASE_S5", o.override ? { Hold_Override_Reason_Release: o.override, Hold_Note: "Released with an override (fixture)." } : { Open_Items_Count: 0, Open_CR_Count: 0, Hold_Note: "No open items (fixture)." });
  const s7 = (id: string, o: { native?: boolean } = {}) =>
    step_(CASE, id, "CASE_S7", o.native ? { Completion_Trigger: "Manual by RMM: release recorded in the native form" } : { Completion_Trigger: "Manual by RMM: supplier released by e-mail", Final_Release_At: isoSec(t - 20 * MINUTE), Final_Release_Confirm: "Yes", Final_Release_By_Name: NWB.contacts[0].name, Open_Items_Count: 0, Open_CR_Count: 0 }, { native: o.native });

  newCase("C1", { trade: "Calendula Soft Base", inci: "Calendula Officinalis Flower Extract", mat: "RM-410001" });
  toS2(newCase("C2", { trade: "Oat Kernel Lipid 20", inci: "Avena Sativa Kernel Oil", mat: "RM-410002" }));
  const c3 = newCase("C3", { trade: "Sea Fennel Hydrolat", inci: "Crithmum Maritimum Extract", mat: "RM-410003" });
  toS2(c3);
  toS3(c3);
  const c4 = newCase("C4", { trade: "Birch Sap Concentrate", inci: "Betula Alba Juice", mat: "RM-410004", supplier: NWB });
  toS2(c4);
  toS3(c4);
  toPart2(c4);
  const c5 = newCase("C5", { trade: "Linden Blossom Water", inci: "Tilia Cordata Flower Water", mat: "RM-410005" });
  toS2(c5);
  toS3(c5);
  toPart2(c5);
  for (const d of ["REG", "SAF", "QM"]) lane(c5, d);
  const c6 = newCase("C6", { trade: "Rosehip Seed Oil Refined", inci: "Rosa Canina Seed Oil", mat: "RM-410006", overall: "Yes" });
  toS2(c6);
  toS3(c6);
  toPart2(c6);
  lane(c6, "REG");
  lane(c6, "SAF", { decision: "Rejected", reason: "Genotoxicity data missing for the refined grade (fixture)." });
  lane(c6, "QM");
  s5(c6);
  const c7 = newCase("C7", { trade: "Mallow Root Glycerite", inci: "Althaea Officinalis Root Extract", mat: "RM-410007", supplier: LUM });
  toS2(c7);
  toS3(c7);
  toPart2(c7);
  for (const d of ["REG", "SAF", "QM"]) lane(c7, d);
  s5(c7);
  const c8 = newCase("C8", { trade: "Chamomile CO2 Extract", inci: "Chamomilla Recutita Flower Extract", mat: "RM-410008" });
  toS2(c8);
  toS3(c8);
  toPart2(c8);
  for (const d of ["REG", "SAF", "QM"]) lane(c8, d);
  s5(c8, { override: "Open supplier query is cosmetic only (fixture)." });
  s7(c8, { native: true }); // Final_Release_At blank, counts blank → Hold "Yes" → S8
  const c9 = newCase("C9", { trade: "Hibiscus Peptide Blend", inci: "Hibiscus Sabdariffa Flower Extract", mat: "RM-410009" });
  toS2(c9);
  toS3(c9);
  toPart2(c9);
  for (const d of ["REG", "SAF", "QM"]) lane(c9, d);
  s5(c9);
  s7(c9);
  // ---- informed departments (harness addition): K7 on C5 (open) and C9 (completed), K8 on C7 (open)
  for (const [id, sx] of [[c5, INFORMED_SECTIONS[0]], [c9, INFORMED_SECTIONS[0]], [c7, INFORMED_SECTIONS[1]]] as const) section("alex", item(CASE, id), sx, "Scope");
  const c10 = newCase("C10", { trade: "Juniper Berry Distillate", inci: "Juniperus Communis Fruit Oil", mat: "RM-410010" });
  toS2(c10);
  {
    const f = item(CASE, c10).fields;
    const { act, uid } = at(CASE, c10, "CASE_S2");
    const ev = audit(uid, {
      Event_Category: "Cancellation",
      Action_Code: "case.cancel",
      Actor_Dept: "RMM",
      Event_Reason: "Supplier discontinued the material (fixture).",
      Case_Code: f.Case_Code,
      Cycle_No: f.Cycle_No,
      Case_Item_Id: c10,
      Object_Kind: "Case",
      Object_Item_Id: c10,
      Notify_Recipient: f.Supplier_Contact_Emails,
    });
    fx.EV_C10_CANCEL = ev;
    cmd(uid, { command: "PROCESS_REJECT_ITEM", flowId: CASE, instanceId: c10, activityInstanceId: act, comment: "Supplier discontinued the material (fixture)." });
    newCase("C10b", { trade: "Juniper Berry Distillate", inci: "Juniperus Communis Fruit Oil", mat: "RM-410010", cycle: 2, code: String(f.Case_Code), reactivates: c10 });
  }

  // ---- C4's SAF RMES sheet, partly filled (jo): 3 of 6 criteria recorded (c4Rmes=complete: all 6)
  {
    const f = item(CASE, c4).fields;
    const saf = RMES_CRITERIA.filter((c) => c.dept === "SAF");
    fx.RMES_C4_SAF = form("jo", F5, {
      RMES_Key: `${f.RMES_Key}-SAF`,
      Result_Case: { _id: c4 },
      Case_Item_Id: c4,
      Case_Code: f.Case_Code,
      Cycle_No: f.Cycle_No,
      Open_Blocking_Findings_Count: 0,
      [tableKey("Safety_Criteria" as ChildTableId)]: saf.map((c, i) => ({
        _id: rowId("Safety_Criteria"),
        _is_created: true,
        Criteria_Code: c.code,
        Criteria_Part: c.part,
        Criteria_Title: c.title,
        Criteria_Applicable: "Yes",
        ...(i < 3 || ctx.params.c4Rmes === "complete" ? { Criteria_Result: "Available", Criteria_Recorded_By: ref("jo"), Criteria_Recorded_At: nowS() } : {}),
      })),
    });
    // phase 2 as the Workbench does it: the header count from the READ-BACK child formulas (a blank counts 1)
    const back = cmd("jo", { command: "DATAFORM_GET_ITEM", flowId: F5, itemId: fx.RMES_C4_SAF });
    const rows = (back[tableKey("Safety_Criteria" as ChildTableId)] as Data[]) ?? [];
    const open = rows.reduce((n, r) => n + (r.Criteria_Open_Num === null || r.Criteria_Open_Num === undefined || r.Criteria_Open_Num === "" ? 1 : Number(r.Criteria_Open_Num)), 0);
    cmd("jo", { command: "DATAFORM_UPDATE_ITEM", flowId: F5, itemId: fx.RMES_C4_SAF, data: { Open_Criteria_Count: open } });
  }
  form("alex", F7, { Note_Key: "NOTE-FX0001", Case_Code: item(CASE, c4).fields.Case_Code, Cycle_No: 1, Case_Item_Id: c4, Linked_Kind: "Case", Linked_Key: item(CASE, c4).fields.Case_Code, Note_Text: "Supplier asked for a call about the composition table (fixture).", Note_Author: ref("alex"), Note_Dept: "RMM", Note_At: nowS() });

  // ======================================================== open points
  let opSeq = 0;
  interface PointOpts {
    caseId: string;
    by: string;
    kind: string;
    dept: string;
    raisedBy: string;
    toSupplier: "Yes" | "No";
    question: string;
  }
  const newPoint = (name: string, o: PointOpts): string => {
    const f = item(CASE, o.caseId).fields;
    const u = U(o.by);
    const opKey = `${f.Case_Code}-C${f.Cycle_No}-OPFX${String(++opSeq).padStart(3, "0")}`;
    const r = create(o.by, OP, {
      OP_Key: opKey,
      Round_No: 1,
      Case_Code: f.Case_Code,
      Cycle_No: f.Cycle_No,
      Supplier_Code: f.Supplier_Code,
      Case_Item_Id: o.caseId,
      OP_Kind: o.kind,
      OP_Dept: o.dept,
      Raised_By_Dept: o.raisedBy,
      OP_To_Supplier: o.toSupplier,
      Ref_Kind: "Section",
      Ref_Section_Key: "SAF-A",
      Ref_Label: "SAF-A · Toxicology",
      Kind_Label: o.kind,
      Question_Text: o.question,
      Internal_Justification: "Needed for the department review (fixture).",
      Responsible_User: { _id: u._id },
      Responsible_Name: u.Name,
      Responsible_Dept_Label: o.raisedBy,
      Internal_Due_Date: day(21),
      ...(o.toSupplier === "Yes"
        ? { Query_Key: `${opKey}|R1`, Supplier_Justification: "Required for the safety assessment (fixture).", Supplier_Due_Date: day(18), Portal_Contact_Ids: f.Portal_Contact_Ids, Awaiting_Response: "Yes", Thread_Text: `${nowS()} · ${u.Name}: ${o.question}` }
        : {}),
    });
    cmd(o.by, { command: "PROCESS_SUBMIT_ITEM", flowId: OP, instanceId: r.id, activityInstanceId: r.act });
    fx[name] = r.id;
    return r.id;
  };
  const p1 = newPoint("P1", { caseId: c3, by: "alex", kind: "Query", dept: "SAF", raisedBy: "RMM", toSupplier: "Yes", question: "Please send the skin sensitisation study for the current grade." });
  void p1;
  const p2 = newPoint("P2", { caseId: c4, by: "sam", kind: "Document request", dept: "REG", raisedBy: "REG", toSupplier: "Yes", question: "Please provide the CAS number confirmation letter." });
  step_(OP, p2, "OPNT_S1", { Response_Kind: "Answer", Response_Text: "The CAS confirmation is attached (fixture).", Response_Doc_Refs_JSON: JSON.stringify([{ fileName: "cas-confirmation.pdf" }]), Awaiting_Response: "No", Supplier_Responsible_Email: NWB.contacts[0].email });
  newPoint("P3", { caseId: c4, by: "alex", kind: "Internal review", dept: "SAF", raisedBy: "RMM", toSupplier: "No", question: "Please check the toxicology summary against the 2025 opinion." });
  newPoint("P4", { caseId: c4, by: "alex", kind: "Contact update", dept: "RMM", raisedBy: "RMM", toSupplier: "No", question: "Supplier announced a new coordinator: update the contacts." });
  const p5 = newPoint("P5", { caseId: c4, by: "alex", kind: "Internal review", dept: "QM", raisedBy: "RMM", toSupplier: "No", question: "Stray point raised by mistake (fixture)." });
  rejectItem(wf(ctx), item(OP, p5), U("dev")._id); // a stray reject by a process admin in Kissflow (reject is off on OP)
  const p6 = newPoint("P6", { caseId: c4, by: "alex", kind: "Query", dept: "SAF", raisedBy: "RMM", toSupplier: "Yes", question: "Please confirm the preservative system (withdrawn later)." });
  step_(OP, p6, "OPNT_S1", { Response_Kind: "Withdrawn by Beiersdorf", OP_Outcome: "Withdrawn", Outcome_Reason: "Answered in the composition section already (fixture)." });
  const p7 = newPoint("P7", { caseId: c6, by: "alex", kind: "Department review", dept: "SAF", raisedBy: "RMM", toSupplier: "No", question: "Please re-check the genotoxicity data received after the lane sign-off." });
  {
    tick(5);
    const jo = U("jo");
    step_(OP, p7, "OPNT_R_SAF", {
      [tableKey("Rounds" as ChildTableId)]: [{ _id: rowId("Rounds"), _is_created: true, Rounds_Round_No: 1, Rounds_Question_Text: item(OP, p7).fields.Question_Text, Rounds_Outcome: "Accepted", Rounds_Reviewed_By: { _id: jo._id }, Rounds_Reviewed_At: nowS() }],
      OP_Outcome: "Accepted",
      Reviewed_By: { _id: jo._id },
      Reviewed_By_Email: jo.Email,
      Reviewed_At: nowS(),
      Late_Decision: "Approved",
      Late_Decision_Reason: "The new genotoxicity study is conclusive (fixture).",
    });
  }
  newPoint("P8", { caseId: c5, by: "alex", kind: "Internal review", dept: "REG", raisedBy: "RMM", toSupplier: "No", question: "Please confirm the annex restriction wording before release." });

  // ======================================================== change requests (manual, Y6 fallback; alex)
  let crSeq = 0;
  const newCr = (name: string, caseId: string, kind: string, reason: string): string => {
    const f = item(CASE, caseId).fields;
    const r = create("alex", CR, {
      CR_Key: `${f.Case_Code}-C${f.Cycle_No}-CRFX${String(++crSeq).padStart(3, "0")}`,
      Case_Code: f.Case_Code,
      Cycle_No: f.Cycle_No,
      Supplier_Code: f.Supplier_Code,
      Change_Kind: kind,
      Section_Key: "K2.1",
      Field_Key: "K2.1.q1",
      Current_Value_Text: "Betula Alba Juice 98 %",
      Proposed_Value_JSON: JSON.stringify({ value: "Betula Alba Juice 97 %" }),
      Change_Reason: reason,
    });
    cmd("alex", { command: "PROCESS_SUBMIT_ITEM", flowId: CR, instanceId: r.id, activityInstanceId: r.act });
    fx[name] = r.id;
    return r.id;
  };
  newCr("CR1", c4, "Answer correction", "Supplier corrected the concentration (fixture).");
  const cr2 = newCr("CR2", c3, "Answer correction", "Supplier changed the INCI spelling (fixture).");
  {
    const f = item(CASE, c3).fields;
    step_(CR, cr2, "CHRQ_S1", {
      Case_Code: f.Case_Code,
      Cycle_No: f.Cycle_No,
      Supplier_Code: f.Supplier_Code,
      Case_Item_Id: c3,
      Contact_Verified: "Yes",
      CR_Outcome: "Accepted",
      Impact_REG: "Yes",
      Impact_SAF: "Yes",
      Impact_QM: "No",
      Impact_MIC: "No",
      Impact_SUS: "No",
      Notice_Key: `${item(CR, cr2).fields.CR_Key}-NOTICE`,
      Notice_Kind: "Change accepted",
      Notice_Title: "Your correction was accepted",
      Supplier_Outcome_Text: "Thank you, the correction was accepted (fixture).",
      Portal_Contact_Ids: f.Portal_Contact_Ids,
      Triage_Note: "Assess REG and SAF impact.",
    });
  }
  newCr("CR3", c9, "Answer correction", "Supplier wants to change a released answer (fixture).");
  newCr("CR4", c8, "Document update", "Supplier sent a new certificate (fixture).");

  // ======================================================== paging (extra=n): more cases at S1
  for (let i = 0; i < ctx.params.extra; i++) newCase(`X${i + 1}`, { trade: `Generated material ${i + 1}`, inci: "Aqua", mat: `RM-49${String(i).padStart(4, "0")}`, supplier: LUM });

  // ======================================================== drafts=sticky: the user's old drafts with leftovers
  if (ctx.params.drafts === "sticky") {
    const me = U(ctx.params.user);
    for (const flow of [F3, F4, F7, F8, F1, F2, F5, "CIQ_RMES_Regulatory_A00" as FlowId]) {
      if (draftOf(ctx.state, flow, me._id)) continue;
      try {
        handle(ctx, me, { command: "DATAFORM_CREATE_ITEM", flowId: flow, data: LEFTOVER[flow] ?? {} });
      } catch {
        /* the user cannot create rows in this Form: no draft */
      }
    }
  }

  ctx.clock = realClock;
  return fx;
}

/** Leftover values of the sticky drafts (§11.2 drafts=sticky): a created row must never carry them. */
export const LEFTOVER: Partial<Record<FlowId, Data>> = {
  CIQ_Section_A00: { Section_Title: "LEFTOVER draft title", Supplier_Reason: "LEFTOVER reason" },
  CIQ_Scope_Run_A00: { Override_Justification: "LEFTOVER justification", Lead_Departments: "LEFTOVER" },
  CIQ_Internal_Note_A00: { Note_Text: "LEFTOVER note text", Linked_Kind: "LEFTOVER" },
  CIQ_Audit_Event_A00: { Event_Reason: "LEFTOVER reason", Old_Value_Text: "LEFTOVER" },
  CIQ_Supplier_A00: { DUNS_Number: "LEFTOVER" },
  CIQ_Config_Version_A00: { Change_Note: "LEFTOVER note" },
  CIQ_RMES_Safety_A00: { Editing_By: "LEFTOVER editor" },
  CIQ_RMES_Regulatory_A00: { Editing_By: "LEFTOVER editor" },
};
