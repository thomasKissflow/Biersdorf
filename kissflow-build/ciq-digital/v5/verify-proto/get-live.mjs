// Independent verifier (prototype alignment), 14 Oct night. READ-ONLY: GET only through kf.mjs client({readOnly:true}),
// >= 1.5 s pacing, no retries; any 429 or HTML body stops the run. Saves raw JSON under live/. Never prints credentials.
import { writeFileSync, appendFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { client } from "../../../lib/kf.mjs";
const here = (f) => fileURLToPath(new URL(f, import.meta.url));
const kf = client({ readOnly: true });
if (kf.acc !== "AcDOSunMEpSA" || kf.domain !== "dev-beiersdorf.kissflow.eu") throw new Error("not DEV; refusing");
const A = kf.acc, APP = "CIQ_Digital_A00", Q = `_application_id=${APP}`;
let last = 0;
async function get(name, path) {
  const out = here(`./live/${name}.json`);
  if (existsSync(out) && !process.argv.includes("--refresh")) return JSON.parse((await import("node:fs")).readFileSync(out, "utf8"));
  const wait = last + 1500 - Date.now(); if (wait > 0) await new Promise((r) => setTimeout(r, wait)); last = Date.now();
  const r = await kf.call("GET", path, undefined, { retries: 0 });
  appendFileSync(here("./requests.jsonl"), JSON.stringify({ at: new Date().toISOString(), method: "GET", path, status: r.status }) + "\n");
  if (typeof r.body === "string" && /<html|just a moment/i.test(r.body)) throw new Error(`STOP: HTML challenge ${r.status} on ${path}`);
  if (r.status === 429) throw new Error(`STOP: 429 on ${path}`);
  const rec = { path, status: r.status, at: new Date().toISOString(), body: r.body };
  writeFileSync(out, JSON.stringify(rec, null, 1));
  console.log(r.status, name);
  return rec;
}
const step = process.argv[2] || "all";
const LISTS = ["CIQ_Case_Phase_A00","CIQ_Track_Status_A00","CIQ_Priority_A00","CIQ_Rejection_Handling_A00","CIQ_Request_Status_A00","CIQ_OP_Kind_A00","CIQ_OP_Outcome_A00","CIQ_Event_Category_A00","CIQ_OP_Progress_A00","CIQ_Review_Dept_A00","CIQ_Decision_A00","CIQ_Config_Kind_A00","CIQ_Config_State_A00","CIQ_Yes_No_A00","CIQ_Confirm_A00"];
const FORMS = ["CIQ_Supplier_A00","CIQ_Internal_Note_A00","CIQ_Audit_Event_A00","CIQ_RMES_Safety_A00","CIQ_RMES_Regulatory_A00","CIQ_Config_Version_A00","CIQ_Scope_Run_A00"];
if (step === "all" || step === "core") {
  await get("case.draft", `/metadata/2/${A}/process/CIQ_Case_A00/draft`);
  await get("case.allfields", `/process/2/${A}/CIQ_Case_A00/allfields?${Q}`);
  await get("op.draft", `/metadata/2/${A}/process/CIQ_Open_Point_A00/draft`);
  await get("item.walk.PkEMwdn0mGMK", `/process/2/${A}/admin/CIQ_Case_A00/PkEMwdn0mGMK?${Q}`);
  await get("item.old.PkEKlr8g60Nj", `/process/2/${A}/admin/CIQ_Case_A00/PkEKlr8g60Nj?${Q}`);
}
if (step === "all" || step === "inv") {
  for (const t of ["process","form","case","dataset"]) await get(`inv.${t}`, `/flow/2/${A}/${t}/?${Q}&page_number=1&page_size=300`);
  await get("inv.list", `/flow/2/${A}/list/?${Q}&page_number=1&page_size=300`);
  await get("inv.integration", `/flow/2/${A}/integration/?${Q}&page_number=1&page_size=100`);
  await get("roles", `/app_role/2/${A}/list?${Q}&page_number=1&page_size=100`);
}
if (step === "all" || step === "lists") for (const l of LISTS) await get(`list.${l}`, `/flow/2/${A}/list/${l}/items?${Q}`);
if (step === "all" || step === "members") {
  await get("members.CIQ_Case_A00", `/flow/2/${A}/process/CIQ_Case_A00/member?${Q}`);
  await get("members.CIQ_Open_Point_A00", `/flow/2/${A}/process/CIQ_Open_Point_A00/member?${Q}`);
  await get("members.CIQ_Supplier_A00", `/flow/2/${A}/form/CIQ_Supplier_A00/member?${Q}`);
}
if (step === "all" || step === "forms") for (const f of FORMS) await get(`form.${f}`, `/metadata/2/${A}/form/${f}/draft`);
console.log("done");
