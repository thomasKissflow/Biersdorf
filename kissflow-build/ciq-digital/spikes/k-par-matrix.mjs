// K-PAR matrix (approved test flow CIQ ZZ Spike Case; acting as Thomas, member of Role A and B).
// Patterns: ALL six branches, ONE (F only), NONE (no flag Yes), each driven to the end by submitting every open task.
// ALL submits its six branch tasks at the same moment. Also finishes the two earlier cases parked at "Spike hold check".
// Records the exact step path of each case, so the conditions after the join (hold, gate, not-equal) are checked too.
import { fileURLToPath } from "node:url";
import { writeFileSync } from "node:fs";
import { writer } from "../../lib/meta.mjs";
const w = writer(fileURLToPath(new URL("./runtime-requests.jsonl", import.meta.url)));
const A = w.acc, Q = "_application_id=CIQ_Digital_A00", P = "CIQ_ZZ_Spike_Case_A00";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const admin = async (id) => (await w.call("GET", `/process/2/${A}/admin/${P}/${id}?${Q}`)).body || {};
const ctx = (c) => (c._current_context || []).map((x) => ({ step: x._context_current_step, act: x._context_activity_instance_id }));
const out = { cases: [] };

async function drive(id, label, simultaneous = false) {
  const rec = { label, id, path: [], submits: [], final: null };
  for (let hop = 0; hop < 15; hop++) {
    let s = await admin(id);
    const open = ctx(s);
    rec.path.push(open.length ? open.map((x) => x.step).join(" | ") : `(${s._status})`);
    if (!open.length || s._status === "Completed" || s._status === "Rejected") { rec.final = { status: s._status, step: s._current_step ?? null, Hold_Flag: s.Hold_Flag, Gate: s.Gate, Spike_Decision: s.Spike_Decision ?? null }; break; }
    const doSubmit = (t) => w.call("POST", `/process/2/${A}/${P}/${id}/${t.act}/submit?${Q}`, {}).then((r) => ({ step: t.step, status: r.status, msg: r.body?.message ?? null }));
    const res = simultaneous ? await Promise.all(open.map(doSubmit)) : await (async () => { const a = []; for (const t of open) a.push(await doSubmit(t)); return a; })();
    rec.submits.push(...res);
    if (res.some((r) => r.status >= 300)) { rec.final = { error: res.filter((r) => r.status >= 300) }; break; }
    // wait for the item to move
    const before = open.map((x) => x.act).join(",");
    for (let i = 0; i < 10; i++) { await sleep(1200); const n = await admin(id); if (ctx(n).map((x) => x.act).join(",") !== before || !ctx(n).length) break; }
  }
  console.log(`${label} ${id}\n  path: ${rec.path.join("  →  ")}\n  final: ${JSON.stringify(rec.final)}`);
  out.cases.push(rec);
  return rec;
}
async function newCase(flags, decision) {
  const body = Object.fromEntries(["A", "B", "C", "D", "E", "F"].map((x) => [`Flag_${x}`, flags.includes(x) ? "Yes" : "No"]));
  if (decision) body.Spike_Decision = decision;
  const c = await w.call("POST", `/process/2/${A}/${P}?${Q}`, body);
  const s = await w.call("POST", `/process/2/${A}/${P}/${c.body?._id}/${c.body?._activity_instance_id}/submit?${Q}`, {});
  if (c.status >= 300 || s.status >= 300) throw new Error(`create ${c.status} submit ${s.status} ${c.body?.message || s.body?.message}`);
  await sleep(1200);
  return c.body._id;
}

await drive(await newCase("ABCDEF", "Approved"), "ALL six, simultaneous branch submits, Decision=Approved", true);
await drive(await newCase("F", null), "ONE (F), Decision blank");
await drive(await newCase("", "Rejected"), "NONE flagged, Decision=Rejected");
await drive("PkEKIVlB5ZUn", "earlier case 1 (Decision=Approved), from hold check");
await drive("PkEKO1pn5eI1", "earlier case 2 (Decision blank), from hold check");
writeFileSync(fileURLToPath(new URL("./k-par-matrix-result.json", import.meta.url)), JSON.stringify(out, null, 2));
