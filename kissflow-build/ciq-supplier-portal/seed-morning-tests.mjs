// Prepare the morning walkthrough (v3, supplier-only portal): create clearly marked test items assigned to the REAL
// supplier test users Thomas added to the portal role "Supplier". Nothing is written until those users exist.
//   node kissflow-build/ciq-supplier-portal/seed-morning-tests.mjs           → dry run: lists the users found, writes nothing
//   node kissflow-build/ciq-supplier-portal/seed-morning-tests.mjs --apply   → creates the test items (Start submitted)
// Users are taken in the order of the role's member list: the first two = supplier A (A1, A2), the third = supplier B (B1).
// Check the dry-run output before --apply. App twin ids are placeholders ("TEST-NO-…") until the app exists.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { writer } from "../lib/meta.mjs";
import { PORTAL } from "./portal-spec.mjs";

const here = (f) => fileURLToPath(new URL(f, import.meta.url));
const state = JSON.parse(readFileSync(here("./build-state.json"), "utf8"));
const apply = process.argv.includes("--apply");
const w = writer(here("./morning-requests.jsonl"));
const A = w.acc, P = PORTAL, ID = (n) => state.flows[n].id;
const role = (await w.call("GET", `/app_role/2/${A}/${state.roles["Supplier"]}?_application_id=${P}`)).body || {};
const users = (role.Members || []).filter((m) => m.Kind === "User");
console.log(`Supplier role members: ${users.length} → ${users.map((u, i) => `${["A1", "A2", "B1"][i] || "extra"}=${u.Name}`).join(", ") || "none"}`);
if (users.length < 2) { console.log("Need at least 2 supplier test users in the role Supplier (A1, A2). Add them in the portal, then re-run."); process.exit(0); }
const [A1, A2, B1] = users;
const plus = (d) => new Date(Date.now() + d * 864e5).toISOString().slice(0, 10);
const a = { Case_Code: "TEST-A-0001", Cycle_No: 1, Supplier_Code: "SUP-TEST-A" }, both = [{ _id: A1._id }, { _id: A2._id }];
const plan = [
  ["CIQP Request", { ...a, Request_Key: "TEST-A-0001|1", App_Case_Item_Id: "TEST-NO-CASE", Trade_Name: "Test material A (fictional)", Main_INCI: "Tocopherol", BDF_Material_No: "RM-TEST-0001", Supplier_Display_Name: "Supplier A (fictional)", BDF_Contact_Name: "Thomas (RMM test)", BDF_Contact_Email: "rmm.test@example.com", Markets_Label: "EU", Template_Label: "CIQ-2026 v1", Supplier_Due_Date: plus(14), Case_Contacts_JSON: JSON.stringify([{ name: A1.Name, role: "Coordinator", canConfirm: true }, { name: A2.Name, role: "Quality", canConfirm: false }]), Assigned_Contacts: both }],
  ["CIQP Section", { ...a, Section_Item_Key: "TEST-A-0001|1|BASIC", App_Section_Item_Id: "TEST-NO-SECTION", Section_Key: "BASIC", Section_Code: "BASIC", Section_Title: "Basic data and configuration", Section_Sort: 0, Applicability_Label: "Mandatory", Section_Origin: "Initial", Definition_JSON: JSON.stringify({ fields: [{ key: "SF-01", label: "Origin of the raw material", kind: "Multiple choice", options: ["Vegetable (bio mass)", "Animal", "Mineral", "Petrochemical / fossil"] }] }), Definition_Hash: "test", Supplier_Due_Date: plus(14), Assigned_Contacts: both }],
  ["CIQP Query", { ...a, Query_Key: "TEST-OP-01", Round_No: 1, App_Open_Point_Id: "TEST-NO-OP", Kind_Label: "Question from Beiersdorf", Responsible_Department: "Regulatory Affairs", Responsible_Name: "Thomas (Regulatory test)", Ref_Kind: "Field", Ref_Section_Key: "BASIC", Ref_Field_Key: "SF-01", Ref_Label: "Basic data › Origin", Question_Text: "Please confirm the origin of the raw material.", Supplier_Justification: "The origin decides which sections of the questionnaire apply.", Supplier_Due_Date: plus(7), Assigned_Contacts: both }],
  ["CIQP Completeness Confirmation", { ...a, Confirmation_Key: "TEST-A-0001|1|PS05", App_Case_Item_Id: "TEST-NO-CASE", Declaration_Text: "We confirm that the questionnaire is complete. Data can still be corrected until the final release.", Declaration_Text_Key: "TXT-PS05-test", Supplier_Due_Date: plus(10), Assigned_Contacts: [{ _id: A1._id }] }],
  ["CIQP Notice", { ...a, Notice_Key: "TEST-A-0001|N1", Notice_Kind: "Change request outcome", App_Notice_Item_Id: "TEST-NO-NOTICE", Notice_Title: "Your change request (test)", Notice_Text: "Test notice: please acknowledge.", Assigned_Contacts: both }],
  ...(B1 ? [["CIQP Request", { Case_Code: "TEST-B-0001", Cycle_No: 1, Supplier_Code: "SUP-TEST-B", Request_Key: "TEST-B-0001|1", App_Case_Item_Id: "TEST-NO-CASE", Trade_Name: "Test material B (fictional)", Main_INCI: "Glycerin", BDF_Material_No: "RM-TEST-0002", Supplier_Display_Name: "Supplier B (fictional)", BDF_Contact_Name: "Thomas (RMM test)", BDF_Contact_Email: "rmm.test@example.com", Supplier_Due_Date: plus(14), Assigned_Contacts: [{ _id: B1._id }] }]] : []),
];
const created = [];
for (const [flow, body] of plan) {
  const label = `${flow} ${body.Request_Key || body.Section_Item_Key || body.Query_Key || body.Confirmation_Key || body.Notice_Key} → ${body.Assigned_Contacts.length} contact(s)`;
  if (!apply) { console.log(`[dry run] would create ${label}`); continue; }
  const cr = await w.call("POST", `/process/2/${A}/${ID(flow)}?_application_id=${P}`, body);
  const sub = cr.body?._id ? await w.call("POST", `/process/2/${A}/${ID(flow)}/${cr.body._id}/${cr.body._activity_instance_id}/submit?_application_id=${P}`, {}) : { status: -1 };
  const it = cr.body?._id ? (await w.call("GET", `/process/2/${A}/admin/${ID(flow)}/${cr.body._id}?_application_id=${P}`)).body : {};
  created.push({ flow, item: cr.body?._id, submit: sub.status, step: it?._current_step, assigned: (it?._current_assigned_to || []).map((u) => u.Name) });
  console.log(JSON.stringify(created.at(-1)));
}
if (apply) writeFileSync(here("./morning-test-items.json"), JSON.stringify(created, null, 2));
