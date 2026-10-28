// K-PERM part 2, on the case from k-perm-probe (branches A, B, C open).
// (1) Does a submit body save field values?  (2) Does the admin route save fields at a branch step?
// (3) Concurrent admin-route writes to two different lanes: are both kept?  (4) Concurrent submits of B and C, then the join.
import { fileURLToPath } from "node:url";
import { readFileSync, writeFileSync } from "node:fs";
import { writer } from "../../lib/meta.mjs";
const w = writer(fileURLToPath(new URL("./runtime-requests.jsonl", import.meta.url)));
const A = w.acc, Q = "_application_id=CIQ_Digital_A00", P = "CIQ_ZZ_Spike_Case_A00";
const prev = JSON.parse(readFileSync(fileURLToPath(new URL("./k-perm-result.json", import.meta.url)), "utf8"));
const id = prev.caseId;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const out = { caseId: id, tests: [] };
const T = (name, res, extra = {}) => { const row = { name, status: res.status, msg: res.body?.message ?? null, ...extra }; out.tests.push(row); console.log(JSON.stringify(row).slice(0, 500)); return res; };
const admin = async () => (await w.call("GET", `/process/2/${A}/admin/${P}/${id}?${Q}`)).body || {};
const ctx = (c) => (c._current_context || []).map((x) => ({ step: x._context_current_step, act: x._context_activity_instance_id }));
const lane = (c, x) => ({ confirm: c[`Lane_${x}_Confirm`] ?? null, note: c[`Lane_${x}_Note`] ?? null, by: c[`Lane_${x}_By`] ?? null });

let s = await admin();
const acts = Object.fromEntries(ctx(s).map((x) => [x.step.slice(-1), x.act]));
out.openBranches = Object.keys(acts).join("");
console.log("open branches:", out.openBranches);

// (2) admin route at a branch step, sequential
T("admin PUT Lane_A_Note", await w.call("PUT", `/process/2/${A}/admin/${P}/${id}?${Q}`, { Lane_A_Note: "admin route A" }));
s = await admin(); out.afterAdminA = lane(s, "A"); console.log("A after admin PUT:", JSON.stringify(out.afterAdminA));

// (3) concurrent admin-route writes to lanes B and C (5 rounds)
out.concurrentAdmin = [];
for (let r = 1; r <= 5; r++) {
  const [rb, rc] = await Promise.all([
    w.call("PUT", `/process/2/${A}/admin/${P}/${id}?${Q}`, { Lane_B_Note: `B round ${r}` }),
    w.call("PUT", `/process/2/${A}/admin/${P}/${id}?${Q}`, { Lane_C_Note: `C round ${r}` }),
  ]);
  s = await admin();
  const ok = s.Lane_B_Note === `B round ${r}` && s.Lane_C_Note === `C round ${r}`;
  out.concurrentAdmin.push({ r, b: rb.status, c: rc.status, B: s.Lane_B_Note, C: s.Lane_C_Note, bothKept: ok });
  console.log(`concurrent admin round ${r}: B ${rb.status} C ${rc.status} → B="${s.Lane_B_Note}" C="${s.Lane_C_Note}" bothKept=${ok}`);
}

// (1) submit body with field values, branch A (Confirm Mandatory)
T("submit A with fields in the submit body", await w.call("POST", `/process/2/${A}/${P}/${id}/${acts.A}/submit?${Q}`, { Lane_A_Confirm: "Yes", Lane_A_Note: "via submit body" }));
await sleep(1500);
s = await admin(); out.afterSubmitA = lane(s, "A"); console.log("A after submit-with-body:", JSON.stringify(out.afterSubmitA), "| ctx:", JSON.stringify(ctx(s).map((x) => x.step)));

// (4) concurrent submits of B and C, then the join
const [sb, sc] = await Promise.all([
  w.call("POST", `/process/2/${A}/${P}/${id}/${acts.B}/submit?${Q}`, {}),
  w.call("POST", `/process/2/${A}/${P}/${id}/${acts.C}/submit?${Q}`, {}),
]);
T("concurrent submit B", sb); T("concurrent submit C", sc);
for (let i = 0; i < 10; i++) { await sleep(1500); s = await admin(); if (!ctx(s).some((x) => x.step.startsWith("Spike review"))) break; }
out.afterJoin = { step: s._current_step, ctx: ctx(s), A: lane(s, "A"), B: lane(s, "B"), C: lane(s, "C") };
console.log("after join:", JSON.stringify(out.afterJoin));
writeFileSync(fileURLToPath(new URL("./k-perm-2-result.json", import.meta.url)), JSON.stringify(out, null, 2));
