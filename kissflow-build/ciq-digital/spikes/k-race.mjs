// K-RACE: lost updates when two writers save the same item at about the same moment (different fields).
// Approved test flows only. Acting as Thomas through the key.
//  R1 admin route on a Spike Case (fresh case, at Spike prepare): 10 rounds, both writes started together.
//  R2 the same with a gap of 100 / 300 / 800 / 1500 ms between the two writes (how wide is the window?).
//  R3 optimistic check: a write carrying a STALE _doc_version. Refused (safe to build on) or accepted (no locking)?
//  R4 Form route (POST /form/2/.../{item}) on a Spike Register row: 10 concurrent rounds on two different fields.
//  R5 Form child table: two writers each add one Table:: row at the same moment. Are both rows kept?
//  R6 assignee route at Start (a Spike Point draft, never submitted): 5 concurrent rounds on two fields.
import { fileURLToPath } from "node:url";
import { writeFileSync } from "node:fs";
import { writer } from "../../lib/meta.mjs";
const w = writer(fileURLToPath(new URL("./runtime-requests.jsonl", import.meta.url)));
const A = w.acc, Q = "_application_id=CIQ_Digital_A00";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rnd = () => Math.random().toString(36).slice(2, 12).padEnd(10, "x");
const out = {};
const log = (k, v) => { console.log(k, JSON.stringify(v).slice(0, 600)); };

// ── R1/R2/R3: Spike Case, admin route
const PC = "CIQ_ZZ_Spike_Case_A00";
const c = await w.call("POST", `/process/2/${A}/${PC}?${Q}`, { Flag_A: "No", Flag_B: "No", Flag_C: "No", Flag_D: "No", Flag_E: "No", Flag_F: "No" });
const cid = c.body?._id; await w.call("POST", `/process/2/${A}/${PC}/${cid}/${c.body?._activity_instance_id}/submit?${Q}`, {});
out.raceCase = cid;
const getC = async () => (await w.call("GET", `/process/2/${A}/admin/${PC}/${cid}?${Q}`)).body || {};
const putC = (body) => w.call("PUT", `/process/2/${A}/admin/${PC}/${cid}?${Q}`, body);
const round = async (tag, gap) => {
  const p1 = putC({ Lane_D_Note: `D ${tag}` });
  if (gap) await sleep(gap);
  const p2 = putC({ Lane_E_Note: `E ${tag}` });
  const [a, b] = await Promise.all([p1, p2]);
  await sleep(300);
  const s = await getC();
  return { tag, gap, s1: a.status, s2: b.status, D: s.Lane_D_Note === `D ${tag}`, E: s.Lane_E_Note === `E ${tag}` };
};
out.R1 = []; for (let r = 1; r <= 10; r++) out.R1.push(await round(`r1-${r}`, 0));
out.R1sum = { rounds: 10, lost: out.R1.filter((x) => !(x.D && x.E)).length };
log("R1 simultaneous (admin route):", out.R1sum);
out.R2 = [];
for (const gap of [100, 300, 800, 1500]) for (let r = 1; r <= 4; r++) out.R2.push(await round(`r2-${gap}-${r}`, gap));
out.R2sum = Object.fromEntries([100, 300, 800, 1500].map((g) => [g, out.R2.filter((x) => x.gap === g && !(x.D && x.E)).length + "/4 lost"]));
log("R2 by gap (ms):", out.R2sum);
// R3 stale _doc_version
const s0 = await getC(); const v0 = s0._doc_version;
await putC({ Lane_F_Note: "advance version" }); await sleep(300);
const s1 = await getC();
const stale = await putC({ Lane_F_Note: "stale write", _doc_version: v0 });
await sleep(300);
const s2 = await getC();
out.R3 = { v0, v1: s1._doc_version, staleWriteStatus: stale.status, staleMsg: stale.body?.message ?? null, valueAfter: s2.Lane_F_Note, staleAccepted: s2.Lane_F_Note === "stale write" };
log("R3 stale _doc_version:", out.R3);

// ── R4/R5: Spike Register (Form)
const FR = "CIQ_ZZ_Spike_Register_A00";
const reg = await w.call("POST", `/form/2/${A}/${FR}?${Q}`, { Register_Key: `ZZT-race-${rnd().slice(0, 6)}` });
const rid = reg.body?._id; out.raceRegister = rid;
log("R4 register created:", { status: reg.status, rid, err: reg.body?.message ?? null });
const getR = async () => (await w.call("GET", `/form/2/${A}/${FR}/${rid}?${Q}`)).body || {};
const postR = (body) => w.call("POST", `/form/2/${A}/${FR}/${rid}?${Q}`, { _id: rid, ...body });
// R4 needs two scalar fields; the Register has only Register_Key + a Reference, so use the Log form instead (6 scalar fields).
const FL = "CIQ_ZZ_Spike_Log_A00";
const lg = await w.call("POST", `/form/2/${A}/${FL}?${Q}`, { Log_Key: `ZZT-race-${rnd().slice(0, 6)}`, Log_Source: "race", Log_Event: "race" });
const lid = lg.body?._id; out.raceLog = lid;
const getL = async () => (await w.call("GET", `/form/2/${A}/${FL}/${lid}?${Q}`)).body || {};
const postL = (body) => w.call("POST", `/form/2/${A}/${FL}/${lid}?${Q}`, { _id: lid, ...body });
out.R4 = [];
for (let r = 1; r <= 10; r++) {
  const [a, b] = await Promise.all([postL({ Log_Source: `S${r}` }), postL({ Log_Event: `E${r}` })]);
  await sleep(300);
  const s = await getL();
  out.R4.push({ r, a: a.status, b: b.status, S: s.Log_Source === `S${r}`, E: s.Log_Event === `E${r}` });
}
out.R4sum = { form: FL, item: lid, rounds: 10, lost: out.R4.filter((x) => !(x.S && x.E)).length, statuses: [...new Set(out.R4.flatMap((x) => [x.a, x.b]))] };
log("R4 form route simultaneous:", out.R4sum);
// R5 child rows on the Register
out.R5 = [];
for (let r = 1; r <= 5; r++) {
  const before = ((await getR())["Table::Spike_Lines"] || []).length;
  const row = (t) => ({ _id: `Spike_Lines_${rnd()}`, _index: before + 1, _is_created: true, Line_Text: t, Line_Open: 0 });
  const [a, b] = await Promise.all([postR({ "Table::Spike_Lines": [row(`race ${r} a`)] }), postR({ "Table::Spike_Lines": [row(`race ${r} b`)] })]);
  await sleep(300);
  const rows = (await getR())["Table::Spike_Lines"] || [];
  const texts = rows.map((x) => x.Line_Text);
  out.R5.push({ r, a: a.status, b: b.status, aErr: a.body?.message ?? null, before, after: rows.length, aKept: texts.includes(`race ${r} a`), bKept: texts.includes(`race ${r} b`) });
}
out.R5sum = { rounds: 5, lost: out.R5.filter((x) => !(x.aKept && x.bKept)).length };
log("R5 child rows simultaneous:", out.R5sum, out.R5.map((x) => `${x.a}/${x.b} ${x.before}->${x.after}`).join(" "));

// ── R6: assignee route at Start (Point draft)
const PP = "CIQ_ZZ_Spike_Point_A00";
const pd = await w.call("POST", `/process/2/${A}/${PP}?${Q}`, { To_Supplier: "No", Question_Text: "ZZT race draft" });
const pid = pd.body?._id, pact = pd.body?._activity_instance_id; out.raceDraftPoint = pid;
const getP = async () => (await w.call("GET", `/process/2/${A}/${PP}/${pid}/${pact}?${Q}`)).body || {};
const postP = (body) => w.call("POST", `/process/2/${A}/${PP}/${pid}/${pact}?${Q}`, body);
out.R6 = [];
for (let r = 1; r <= 5; r++) {
  const [a, b] = await Promise.all([postP({ Question_Text: `Q${r}` }), postP({ Awaiting_Response: `W${r}` })]);
  await sleep(300);
  const s = await getP();
  out.R6.push({ r, a: a.status, b: b.status, aErr: a.body?.message ?? null, Q: s.Question_Text === `Q${r}`, W: s.Awaiting_Response === `W${r}` });
}
out.R6sum = { rounds: 5, lost: out.R6.filter((x) => !(x.Q && x.W)).length, statuses: [...new Set(out.R6.flatMap((x) => [x.a, x.b]))] };
log("R6 assignee route at Start:", out.R6sum);
writeFileSync(fileURLToPath(new URL("./k-race-result.json", import.meta.url)), JSON.stringify(out, null, 2));
