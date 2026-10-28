// S-1 test items for the portal Diagnostics card (Thomas's morning clicks): two ZZT CIQP Requests at
// "Supplier: fill in the CIQ" (tests 1–3 use one, test 4 submits the other) and one ZZT CIQP Query at
// "Supplier: respond" (test 5), all assigned to Thomas (the dev supplier user). Not linked to any app case, so the
// sync service never touches them. Paced 1 s.  node …/s1-seed.mjs --apply | --list | --cleanup
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { writer } from "../../lib/meta.mjs";
import { PORTAL, TEST_USER } from "../portal-spec.mjs";

const here = (f) => fileURLToPath(new URL(f, import.meta.url));
const LEDGER = here("./s1-seed-items.json");
const w = writer(here("./spike-requests.jsonl"));
const A = w.acc, P = PORTAL;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const call = async (...a) => { await sleep(1000); return w.call(...a); };
const plus = (d) => new Date(Date.now() + d * 864e5).toISOString().slice(0, 10);
const ME = [{ _id: TEST_USER._id }];
const mode = process.argv[2];
const ledger = existsSync(LEDGER) ? JSON.parse(readFileSync(LEDGER, "utf8")) : [];
const read = async (proc, item) => (await call("GET", `/process/2/${A}/admin/${proc}/${item}?_application_id=${P}`)).body || {};

async function createAndSubmit(proc, body) {
  const cr = await call("POST", `/process/2/${A}/${proc}?_application_id=${P}`, body);
  if (!cr.body?._id) throw new Error(`create ${proc}: ${cr.status} ${JSON.stringify(cr.body).slice(0, 200)}`);
  ledger.push({ proc, item: cr.body._id }); writeFileSync(LEDGER, JSON.stringify(ledger, null, 2));
  const sub = await call("POST", `/process/2/${A}/${proc}/${cr.body._id}/${cr.body._activity_instance_id}/submit?_application_id=${P}`, {});
  const it = await read(proc, cr.body._id);
  console.log(`${proc} ${cr.body._id} (${body.Case_Code}) → submit ${sub.status}, now at "${it._current_step}", assigned ${(it._current_assigned_to || []).map((a) => a.Name).join(", ")}`);
}

if (mode === "--apply") {
  const reqBase = (n) => ({ Request_Key: `ZZT-S1-000${n}|1`, Case_Code: `ZZT-S1-000${n}`, Cycle_No: 1, Supplier_Code: "ZZT-SUP-DEV", App_Case_Item_Id: "ZZT-NO-CASE", Trade_Name: `ZZT S-1 test material ${n} (fictional)`, Main_INCI: "Tocopherol", BDF_Material_No: `ZZT-RM-S1-0${n}`, Supplier_Display_Name: "ZZT Dev Supplier (fictional)", BDF_Contact_Name: "ZZT RMM (fictional)", BDF_Contact_Email: "rmm.zzt@example.com", Supplier_Due_Date: plus(14), Case_Contacts_JSON: JSON.stringify([{ id: TEST_USER._id, name: "Thomas (dev supplier)", title: "Dev supplier contact", mayConfirm: true }]), Assigned_Contacts: ME, Case_Phase_Label: "Filling in", Request_Locked: "No", Template_Version: "CIQ-2026 v1", Rule_Set_Version: "RS-2026.1" });
  await createAndSubmit("CIQP_Request_A00", reqBase(1));
  await createAndSubmit("CIQP_Request_A00", reqBase(2));
  await createAndSubmit("CIQP_Query_A00", { Query_Key: "ZZT-S1-OP-01-R1", Round_No: 1, Case_Code: "ZZT-S1-0001", Cycle_No: 1, Supplier_Code: "ZZT-SUP-DEV", App_Open_Point_Id: "ZZT-NO-OP", Kind_Label: "Question", Responsible_Department: "Product Safety", Responsible_Name: "ZZT Reviewer (fictional)", Ref_Kind: "Field", Ref_Section_Key: "GEN", Ref_Label: "General information", Question_Text: "S-1 test question: please answer with any text.", Supplier_Justification: "Diagnostics test (S-1).", Supplier_Due_Date: plus(7), Assigned_Contacts: ME });
}
if (mode === "--list") console.log(JSON.stringify(ledger, null, 1));
if (mode === "--cleanup") {
  for (const c of ledger) {
    const d = await call("DELETE", `/process/2/${A}/admin/${c.proc}/${c.item}?_application_id=${P}`);
    const g = await call("GET", `/process/2/${A}/admin/${c.proc}/${c.item}?_application_id=${P}`);
    console.log(`${c.proc} ${c.item} → delete ${d.status}, after ${g.status}`);
  }
  writeFileSync(LEDGER, "[]");
}
