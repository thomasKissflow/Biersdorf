// K-PAR + K-19P on the approved test flow CIQ ZZ Spike Case (item PkEKIVlB5ZUn), acting as Thomas through the account key.
// 1. Submit "Spike prepare" with the CURRENT step's activity instance id (the earlier refusal reused the Start id).
// 2. Expect tasks only for "Spike review – A/B/C" (flags A–C Yes, D–F No).
// 3. Submit A and B at the same moment (two parallel update→submit chains), then C.
// 4. Expect every lane value kept and the case past the join ("Spike hold check", since Hold_Flag = "Yes").
import { fileURLToPath } from "node:url";
import { writeFileSync } from "node:fs";
import { writer } from "../../lib/meta.mjs";
const w = writer(fileURLToPath(new URL("./runtime-requests.jsonl", import.meta.url)));
const A = w.acc, Q = "_application_id=CIQ_Digital_A00", P = "CIQ_ZZ_Spike_Case_A00", ITEM = "PkEKIVlB5ZUn";
const LANES = ["A", "B", "C", "D", "E", "F"];
const out = { steps: [] };
const note = (k, v) => { out.steps.push({ k, ...v }); console.log(k, JSON.stringify(v)); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const stamp = () => new Date().toISOString().replace(/\.\d{3}Z$/, "Z"); // DateTimes with milliseconds are rejected

const read = async () => (await w.call("GET", `/process/2/${A}/admin/${P}/${ITEM}?${Q}`)).body || {};
const ctx = (c) => (c._current_context || []).map((x) => ({ step: x._context_current_step, act: x._context_activity_instance_id, to: (x._context_assigned_to || []).map((a) => a.Name).join(",") }));
const lanes = (c) => Object.fromEntries(LANES.map((x) => [x, { confirm: c[`Lane_${x}_Confirm`] ?? null, by: c[`Lane_${x}_By`] ?? null, at: c[`Lane_${x}_At`] ?? null, note: c[`Lane_${x}_Note`] ?? null }]));
const until = async (pred, label, tries = 12) => { let c; for (let i = 0; i < tries; i++) { c = await read(); if (pred(c)) return c; await sleep(1500); } note(`timeout:${label}`, { step: c._current_step, ctx: ctx(c) }); return c; };

// 0. State before
let c = await read();
note("before", { step: c._current_step, status: c._status, ctx: ctx(c), flags: LANES.map((x) => `${x}:${c[`Flag_${x}`]}`).join(" "), hold: c.Hold_Flag, gate: c.Gate });

// 1. Submit "Spike prepare"
const prep = ctx(c).find((x) => x.step === "Spike prepare");
if (prep) {
  const r = await w.call("POST", `/process/2/${A}/${P}/${ITEM}/${prep.act}/submit?${Q}`, {});
  note("submit Spike prepare", { act: prep.act, status: r.status, err: r.body?.message ?? null });
  if (r.status >= 300) { writeFileSync(fileURLToPath(new URL("./k-par-result.json", import.meta.url)), JSON.stringify(out, null, 2)); process.exit(1); }
}

// 2. Fork: which branch tasks exist?
c = await until((x) => ctx(x).some((y) => y.step.startsWith("Spike review")), "fork");
const fork = ctx(c);
const branchLetters = fork.filter((x) => x.step.startsWith("Spike review")).map((x) => x.step.slice(-1)).sort();
note("after prepare (fork)", { step: c._current_step, ctx: fork, branches: branchLetters.join(""), pass: branchLetters.join("") === "ABC" });

// 3. A and B at the same moment, each update → submit
const laneChain = async (x) => {
  const t = fork.find((y) => y.step.endsWith(x));
  if (!t) return { x, missing: true };
  const body = { [`Lane_${x}_Confirm`]: "Yes", [`Lane_${x}_By`]: `Claude test (lane ${x})`, [`Lane_${x}_At`]: stamp(), [`Lane_${x}_Note`]: `K-19P lane ${x} kept` };
  const t0 = Date.now();
  const u = await w.call("POST", `/process/2/${A}/${P}/${ITEM}/${t.act}?${Q}`, body);
  const s = await w.call("POST", `/process/2/${A}/${P}/${ITEM}/${t.act}/submit?${Q}`, {});
  return { x, act: t.act, update: u.status, updErr: u.body?.message ?? null, submit: s.status, subErr: s.body?.message ?? null, ms: Date.now() - t0, startedAt: t0 };
};
const [ra, rb] = await Promise.all([laneChain("A"), laneChain("B")]);
note("A and B together", { A: ra, B: rb, startGapMs: Math.abs((ra.startedAt ?? 0) - (rb.startedAt ?? 0)) });
c = await until((x) => !ctx(x).some((y) => /Spike review – [AB]$/.test(y.step)), "A,B done");
note("after A+B", { step: c._current_step, ctx: ctx(c), A: lanes(c).A, B: lanes(c).B });

// 4. C, then the join
const rc = await laneChain("C");
note("C", rc);
c = await until((x) => !ctx(x).some((y) => y.step.startsWith("Spike review")), "join");
const L = lanes(c);
const kept = ["A", "B", "C"].every((x) => L[x].confirm === "Yes" && L[x].note === `K-19P lane ${x} kept`);
const untouched = ["D", "E", "F"].every((x) => !L[x].confirm && !L[x].note);
note("after join", { step: c._current_step, status: c._status, ctx: ctx(c), hold: c.Hold_Flag, gate: c.Gate, lanes: L, lanesKept: kept, dfUntouched: untouched });

out.verdict = {
  K_PAR_fork_only_ABC: branchLetters.join("") === "ABC",
  K_19P_concurrent_A_B_kept: L.A.confirm === "Yes" && L.B.confirm === "Yes" && L.A.note === "K-19P lane A kept" && L.B.note === "K-19P lane B kept",
  all_lanes_kept: kept,
  D_E_F_untouched: untouched,
  join_moved_on: !ctx(c).some((y) => y.step.startsWith("Spike review")),
  next_step: c._current_step,
};
console.log("VERDICT", JSON.stringify(out.verdict));
writeFileSync(fileURLToPath(new URL("./k-par-result.json", import.meta.url)), JSON.stringify(out, null, 2));
