// Live walk of the v6 CIQP Request steps (plan v6 D-10, D-11) on two throwaway ZZT items, deleted at the end.
//   W1: Start → fill in → keep up to date → give the final release (Release_Flag empty) → expect "view the released CIQ"
//   W2: … → give the final release with Release_Flag = "Reopened" → expect the go-to back to "keep the CIQ up to date"
// The key's user is the dev supplier (Thomas), assigned on both items. Also records whether the key can submit "keep up
// to date" (Keep_Open_Gate is Mandatory there) — the open question of plan §2 for the release move.
//   node kissflow-build/night-2026-10-20/portal-v6-walk.mjs
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { writer } from "../lib/meta.mjs";
import { PORTAL, TEST_USER } from "../ciq-supplier-portal/portal-spec.mjs";
const here = (f) => fileURLToPath(new URL(f, import.meta.url));
const w = writer(here("./walk-requests.jsonl"));
const A = w.acc, P = PORTAL, RQ = "CIQP_Request_A00", Q = `_application_id=${P}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const call = async (m, p, b) => { await sleep(1300); const r = await w.call(m, p, b); if (r.status === 429 || typeof r.body === "string") throw new Error(`stopped on ${r.status} (rate limit or non-JSON answer)`); return r; };
const plus = (d) => new Date(Date.now() + d * 864e5).toISOString().slice(0, 10);
const nowZ = () => new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
const ME = [{ _id: TEST_USER._id }];
const read = async (id) => (await call("GET", `/process/2/${A}/admin/${RQ}/${id}?${Q}`)).body || {};
const actOf = (it) => it?._current_context?.[0]?._context_activity_instance_id;
const results = [];
const T = (id, pass, detail) => { results.push({ id, pass: !!pass, detail }); console.log(`${pass ? "PASS" : "FAIL"} ${id} ${JSON.stringify(detail).slice(0, 220)}`); };
const created = [];

async function make(n) {
  const body = { Request_Key: `ZZT-W${n}|1`, Case_Code: `ZZT-W${n}`, Cycle_No: 1, Supplier_Code: "ZZT-SUP-DEV", App_Case_Item_Id: "ZZT-NO-CASE", Trade_Name: `ZZT walk material ${n} (fictional)`, Main_INCI: "Tocopherol", BDF_Material_No: `ZZT-RM-W${n}`, Supplier_Display_Name: "ZZT Dev Supplier (fictional)", BDF_Contact_Name: "ZZT RMM (fictional)", BDF_Contact_Email: "rmm.zzt@example.com", Supplier_Due_Date: plus(14), Assigned_Contacts: ME, Release_Contacts: ME, Case_Phase_Label: "Filling in", Request_Locked: "No" };
  const cr = await call("POST", `/process/2/${A}/${RQ}?${Q}`, body);
  if (!cr.body?._id) throw new Error(`create: ${cr.status} ${JSON.stringify(cr.body).slice(0, 200)}`);
  created.push(cr.body._id);
  const sub = await call("POST", `/process/2/${A}/${RQ}/${cr.body._id}/${cr.body._activity_instance_id}/submit?${Q}`, {});
  const it = await read(cr.body._id);
  T(`W${n}-start-to-fill`, sub.status < 300 && it._current_step === "Supplier: fill in the CIQ", { submit: sub.status, step: it._current_step });
  return cr.body._id;
}
async function submitCurrent(id, label) {
  const it = await read(id);
  const r = await call("POST", `/process/2/${A}/${RQ}/${id}/${actOf(it)}/submit?${Q}`, {});
  const after = await read(id);
  return { status: r.status, from: it._current_step, to: after._current_step, err: r.body?.en_message || r.body?.message, label };
}

try {
  for (const n of [1, 2]) {
    const id = await make(n);
    await call("PUT", `/process/2/${A}/admin/${RQ}/${id}?${Q}`, { Completeness_Confirm: "Confirmed", Completeness_By_Name: "ZZT Contact", Completeness_By_Email: "zzt@example.com", Completeness_At: nowZ() });
    const f = await submitCurrent(id, "fill in");
    T(`W${n}-fill-to-keep`, f.status < 300 && f.to === "Supplier: keep the CIQ up to date", f);
    const k = await submitCurrent(id, "keep up to date (Keep_Open_Gate Mandatory)");
    T(`W${n}-key-submit-of-keep`, true, { ...k, note: k.to === "Supplier: give the final release" ? "the key (as assignee) CAN move keep → release: Mandatory is not enforced on key submits" : "the key can NOT move keep → release" });
    if (k.to !== "Supplier: give the final release") continue;
    const flag = n === 2 ? { Release_Flag: "Reopened" } : {};
    const put = await call("PUT", `/process/2/${A}/admin/${RQ}/${id}?${Q}`, { Release_By_Name: "ZZT Contact", Release_At: nowZ(), ...flag });
    const r = await submitCurrent(id, "give the final release");
    if (n === 1) T("W1-release-to-view-released", put.status < 300 && r.status < 300 && r.to === "Supplier: view the released CIQ", r);
    else T("W2-reopened-goto-back-to-keep", put.status < 300 && r.status < 300 && r.to === "Supplier: keep the CIQ up to date", r);
    if (n === 1) {
      const v = await submitCurrent(id, "view the released CIQ (should stay held)");
      T("W1-view-step-not-submitted-by-supplier-ui", true, { ...v, note: v.to === "Supplier: view the released CIQ" ? "held (gate enforced)" : "the key moved it on: Mandatory not enforced on key submits" });
    }
  }
} catch (e) {
  T("walk-error", false, String(e.message || e));
} finally {
  for (const id of created) {
    const d = await call("DELETE", `/process/2/${A}/admin/${RQ}/${id}?${Q}`).catch((e) => ({ status: String(e.message) }));
    const g = await call("GET", `/process/2/${A}/admin/${RQ}/${id}?${Q}`).catch(() => ({ status: "?" }));
    T(`cleanup-${id}`, d.status === 200 && g.status === 404, { delete: d.status, after: g.status });
  }
  writeFileSync(here("./walk-result.json"), JSON.stringify({ at: new Date().toISOString(), results }, null, 1));
}
