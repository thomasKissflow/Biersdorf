// K-PERM: why were lane-field updates refused at the parallel branch steps, and why did a branch submit with a blank Mandatory field?
// New throwaway Spike Case (approved test flow). Acting as Thomas, now a member of Role A and Role B.
// Calibrates a NORMAL step ("Spike prepare") first, then probes a BRANCH step field by field and with different body shapes.
// Leaves branches B and C open for the concurrency test (ids written to k-perm-result.json).
import { fileURLToPath } from "node:url";
import { writeFileSync } from "node:fs";
import { writer } from "../../lib/meta.mjs";
const w = writer(fileURLToPath(new URL("./runtime-requests.jsonl", import.meta.url)));
const A = w.acc, Q = "_application_id=CIQ_Digital_A00", P = "CIQ_ZZ_Spike_Case_A00";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const stamp = () => new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
const out = { tests: [] };
const T = (name, res, extra = {}) => { const row = { name, status: res.status, msg: res.body?.message ?? res.body?.en_message ?? null, code: res.body?.error_code ?? null, ...extra }; out.tests.push(row); console.log(JSON.stringify(row).slice(0, 400)); return res; };
const admin = async (id) => (await w.call("GET", `/process/2/${A}/admin/${P}/${id}?${Q}`)).body || {};
const ctx = (c) => (c._current_context || []).map((x) => ({ step: x._context_current_step, act: x._context_activity_instance_id }));

// 1. Create + Start
const c = await w.call("POST", `/process/2/${A}/${P}?${Q}`, { Flag_A: "Yes", Flag_B: "Yes", Flag_C: "Yes", Flag_D: "No", Flag_E: "No", Flag_F: "No" });
const id = c.body?._id; out.caseId = id;
T("create case (flags at create)", c, { id });
T("submit Start", await w.call("POST", `/process/2/${A}/${P}/${id}/${c.body?._activity_instance_id}/submit?${Q}`, {}));
await sleep(1500);
let s = await admin(id);
const prep = ctx(s).find((x) => x.step === "Spike prepare");
out.prepAct = prep?.act;

// 2. Normal step calibration
const g = await w.call("GET", `/process/2/${A}/${P}/${id}/${prep.act}?${Q}`);
out.assigneeGetKeys = Object.keys(g.body || {}).filter((k) => k.startsWith("_")).join(",");
T("GET item via assignee route at Spike prepare", g, { hasPermissionInfo: JSON.stringify(g.body || {}).match(/_permission|Permission|_editable/i)?.[0] ?? null });
T("prepare: update Spike_Decision (Editable)", await w.call("POST", `/process/2/${A}/${P}/${id}/${prep.act}?${Q}`, { Spike_Decision: "Approved" }));
T("prepare: update Lane_A_Note (ReadOnly here)", await w.call("POST", `/process/2/${A}/${P}/${id}/${prep.act}?${Q}`, { Lane_A_Note: "should be refused" }));
T("prepare: update Flag_D (Editable)", await w.call("POST", `/process/2/${A}/${P}/${id}/${prep.act}?${Q}`, { Flag_D: "No" }));
T("prepare: update with _id in body", await w.call("POST", `/process/2/${A}/${P}/${id}/${prep.act}?${Q}`, { _id: id, Spike_Decision: "Approved" }));
s = await admin(id);
out.afterPrepUpdates = { Spike_Decision: s.Spike_Decision, Lane_A_Note: s.Lane_A_Note ?? null };
T("submit Spike prepare", await w.call("POST", `/process/2/${A}/${P}/${id}/${prep.act}/submit?${Q}`, {}));
await sleep(2000);
s = await admin(id);
const fork = ctx(s); out.fork = fork;
const actA = fork.find((x) => x.step.endsWith("A"))?.act;

// 3. Branch A, field by field and with different shapes
const gA = await w.call("GET", `/process/2/${A}/${P}/${id}/${actA}?${Q}`);
T("GET item via assignee route at branch A", gA, { current_step_seen: gA.body?._current_step ?? null });
const probes = [
  ["A: Lane_A_Note only", { Lane_A_Note: "note only" }],
  ["A: Lane_A_Confirm only", { Lane_A_Confirm: "Yes" }],
  ["A: Lane_A_By only", { Lane_A_By: "Claude probe" }],
  ["A: Lane_A_At only", { Lane_A_At: stamp() }],
  ["A: Lane_A_Note with _id", { _id: id, Lane_A_Note: "with _id" }],
  ["A: Lane_B_Note (other branch's field)", { Lane_B_Note: "should be refused" }],
];
for (const [name, body] of probes) T(name, await w.call("POST", `/process/2/${A}/${P}/${id}/${actA}?${Q}`, body));
T("A: PUT instead of POST (Lane_A_Note)", await w.call("PUT", `/process/2/${A}/${P}/${id}/${actA}?${Q}`, { Lane_A_Note: "put" }));
s = await admin(id);
out.afterBranchProbes = Object.fromEntries(["A", "B"].flatMap((x) => [`Lane_${x}_Confirm`, `Lane_${x}_By`, `Lane_${x}_At`, `Lane_${x}_Note`].map((k) => [k, s[k] ?? null])));
console.log("lanes after probes:", JSON.stringify(out.afterBranchProbes));
writeFileSync(fileURLToPath(new URL("./k-perm-result.json", import.meta.url)), JSON.stringify(out, null, 2));
console.log("fork:", JSON.stringify(fork));
