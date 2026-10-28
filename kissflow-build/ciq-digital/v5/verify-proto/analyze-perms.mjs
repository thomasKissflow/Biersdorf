import { readFileSync } from "node:fs";
const L = (n) => JSON.parse(readFileSync(`./live/${n}.json`, "utf8"));
const d = L("case.draft").body;
const E = Object.values(d).filter((e) => e && typeof e === "object" && e.Kind);
const fields = E.filter((e) => e.Kind === "Field" && e.Model === d.Root);
const colToField = {}; for (const f of fields) colToField[f.Column] = f;
const NEW = { Template_Version:"Text", Case_Phase:"Select", Priority:"Select", Duplicate_Reason:"Textarea", Follow_Up_Of_Case:"Text", Follow_Up_Of_Report:"Text", Cancel_Reason:"Textarea", Cancelled_By_Name:"Text", Cancelled_At:"DateTime", Cancelled_From_Phase:"Text", Reactivate_Reason:"Textarea", Reactivated_At:"DateTime", Release_Requested_At:"DateTime", Portal_Release_Item_Id:"Text", Final_Document_Hash:"Text", Final_Document_At:"DateTime", Undefined_Origin:"Select", Case_Data_Item_Id:"Text", Supplier_Files:"Attachment" };
const byId = Object.fromEntries(fields.map((f) => [f.Id, f]));
for (const [id, t] of Object.entries(NEW)) { const f = byId[id]; console.log(id, f ? `${f.Type}${f.Type!==t?" !!expected "+t:""} list=${f.ReferredList||""} req=${f.Required||false} name=${JSON.stringify(f.Name)}` : "MISSING"); }
console.log("field count", fields.length);
const MAND = "Case_Code Cycle_No Trade_Name Main_INCI BDF_Material_No Supplier_Code Supplier_Legal_Name Owner_RMM BDF_Contact_Name BDF_Contact_Email Supplier_Due_Date Case_Contacts_JSON Portal_Contact_Ids Confirm_Contact_Ids Supplier_Contact_Emails Target_Markets_Text Release_Item_Id Release_Key Manifest_Hash Rule_Set_Version Template_Version".split(" ");
const EDIT = "Case_Title Priority Duplicate_Reason Follow_Up_Of_Case Follow_Up_Of_Report SAP_Material_No IRMA_Ref Case_Test Markets_Label Template_Label Release_Manifest_JSON".split(" ");
const acts = E.filter((e) => e.Kind === "Activity" && ["StartEvent","UserTask","EndEvent"].includes(e.NodeType));
for (const a of acts) {
  const m = {};
  for (const pid of a["Activity::Permission"] || []) { const p = d[pid]; const f = p && colToField[p.Column]; if (f) (m[p.Permission] = m[p.Permission] || []).push(f.Id); else (m["?nonfield"] = m["?nonfield"]||[]).push(p?.Column); }
  console.log(a.Name, Object.fromEntries(Object.entries(m).map(([k, v]) => [k, v.length])));
  if (a.NodeType === "StartEvent") {
    const M = new Set(m.Mandatory || []), Ed = new Set(m.Editable || []);
    console.log(" mand missing", MAND.filter((x) => !M.has(x)), "mand extra", [...M].filter((x) => !MAND.includes(x)));
    console.log(" edit missing", EDIT.filter((x) => !Ed.has(x)), "edit extra", [...Ed].filter((x) => !EDIT.includes(x)));
  }
}
// field-level Required
console.log("field-level Required:", fields.filter((f) => f.Required).map((f) => f.Id));
// published fields
const af = L("case.allfields").body; const rt = af?.CIQ_Case_A00 || af;
const pub = (rt.Fields || []).map((x) => x.Id);
console.log("published", pub.length, "missing new:", Object.keys(NEW).filter((k) => !pub.includes(k)));
const pf = Object.fromEntries((rt.Fields||[]).map((x)=>[x.Id,x]));
for (const k of Object.keys(NEW)) { const x = pf[k]; if (x) console.log(" pub", k, x.Type, x.ReferredList || x.List || "", x.Required||""); }
console.log("unused-but-visible check: lane fields present", ["Dept_RMM_Active","Overall_Decision","RMM_Review_Confirm","Hold_For_Open_Items"].map(k=>[k,!!byId[k]]));
console.log("RMM_Rejection_Handling exists?", !!byId["RMM_Rejection_Handling"], "Rejection fields:", fields.filter(f=>/Reject/i.test(f.Id)).map(f=>f.Id));
console.log("Requested docs / child tables on case:", E.filter(e=>e.Kind==="Model" ).map(m=>m.Id), "Final_PDF", byId.Final_PDF?.Type);
