// K-RACE part 2 (approved test flows; acting as Thomas through the key).
//  R4b Form route on a SUBMITTED Log row: 10 simultaneous rounds writing two different fields.
//  R5b Child rows on a SUBMITTED Register: 5 rounds, two writers each add one Table:: row at the same moment.
//  R7  Two simultaneous create→submit chains on the same Form by the same user (per-user draft!): 3 rounds.
//  R8  Process admin route, gaps 0 / 30 / 60 ms (narrow the window), 5 rounds each.
import { fileURLToPath } from "node:url";
import { readFileSync, writeFileSync } from "node:fs";
import { writer } from "../../lib/meta.mjs";
const w = writer(fileURLToPath(new URL("./runtime-requests.jsonl", import.meta.url)));
const A = w.acc, Q = "_application_id=CIQ_Digital_A00";
const prev = JSON.parse(readFileSync(fileURLToPath(new URL("./k-race-result.json", import.meta.url)), "utf8"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rnd = () => Math.random().toString(36).slice(2, 12).padEnd(10, "x");
const out = {};
const log = (k, v) => console.log(k, JSON.stringify(v).slice(0, 700));
const FL = "CIQ_ZZ_Spike_Log_A00", FR = "CIQ_ZZ_Spike_Register_A00", PC = "CIQ_ZZ_Spike_Case_A00";

// Submit the two drafts left by k-race (they hold only ZZT race data)
const subL = await w.call("POST", `/form/2/${A}/${FL}/draft_UsEJUfjYLM8Y/submit?${Q}`, {});
const subR = await w.call("POST", `/form/2/${A}/${FR}/draft_UsEJUfjYLM8Y/submit?${Q}`, {});
const lid = subL.body?._id, rid = subR.body?._id;
out.submittedDrafts = { log: { status: subL.status, id: lid }, register: { status: subR.status, id: rid } };
log("drafts submitted:", out.submittedDrafts);

// R4b
const getL = async () => (await w.call("GET", `/form/2/${A}/${FL}/${lid}?${Q}`)).body || {};
const postL = (body) => w.call("POST", `/form/2/${A}/${FL}/${lid}?${Q}`, { _id: lid, ...body });
out.R4b = [];
for (let r = 1; r <= 10; r++) {
  const [a, b] = await Promise.all([postL({ Log_Source: `S${r}` }), postL({ Log_Event: `E${r}` })]);
  await sleep(300); const s = await getL();
  out.R4b.push({ r, a: a.status, b: b.status, S: s.Log_Source === `S${r}`, E: s.Log_Event === `E${r}` });
}
out.R4bsum = { rounds: 10, lost: out.R4b.filter((x) => !(x.S && x.E)).length, statuses: [...new Set(out.R4b.flatMap((x) => [x.a, x.b]))] };
log("R4b form route, submitted row:", out.R4bsum);

// R5b
const getR = async () => (await w.call("GET", `/form/2/${A}/${FR}/${rid}?${Q}`)).body || {};
const postR = (body) => w.call("POST", `/form/2/${A}/${FR}/${rid}?${Q}`, { _id: rid, ...body });
out.R5b = [];
for (let r = 1; r <= 5; r++) {
  const before = ((await getR())["Table::Spike_Lines"] || []).length;
  const row = (t) => ({ _id: `Spike_Lines_${rnd()}`, _index: before + 1, _is_created: true, Line_Text: t, Line_Open: 0 });
  const [a, b] = await Promise.all([postR({ "Table::Spike_Lines": [row(`sub ${r} a`)] }), postR({ "Table::Spike_Lines": [row(`sub ${r} b`)] })]);
  await sleep(300);
  const rows = (await getR())["Table::Spike_Lines"] || []; const t = rows.map((x) => x.Line_Text);
  out.R5b.push({ r, a: a.status, b: b.status, before, after: rows.length, aKept: t.includes(`sub ${r} a`), bKept: t.includes(`sub ${r} b`) });
}
out.R5bsum = { rounds: 5, lost: out.R5b.filter((x) => !(x.aKept && x.bKept)).length };
log("R5b child rows, submitted register:", out.R5bsum, out.R5b.map((x) => `${x.before}->${x.after}`).join(" "));

// R7 simultaneous creates by one user
const createLog = async (key) => {
  const d = await w.call("POST", `/form/2/${A}/${FL}?${Q}`, { Log_Key: key, Log_Source: "R7", Log_Event: key });
  if (d.status >= 300) return { key, create: d.status, err: d.body?.message };
  const s = await w.call("POST", `/form/2/${A}/${FL}/${d.body._id}/submit?${Q}`, {});
  return { key, draftId: d.body._id, create: d.status, submit: s.status, id: s.body?._id ?? null, err: s.body?.message ?? null };
};
out.R7 = [];
for (let r = 1; r <= 3; r++) {
  const tag = rnd().slice(0, 5);
  const res = await Promise.all([createLog(`ZZT-R7-${tag}-a`), createLog(`ZZT-R7-${tag}-b`)]);
  await sleep(800);
  const reads = await Promise.all(res.filter((x) => x.id).map(async (x) => { const g = (await w.call("GET", `/form/2/${A}/${FL}/${x.id}?${Q}`)).body || {}; return { id: x.id, Log_Key: g.Log_Key, Log_Event: g.Log_Event }; }));
  const distinct = new Set(reads.map((x) => x.id)).size;
  const correct = res.every((x) => reads.some((y) => y.Log_Key === x.key && y.Log_Event === x.key));
  out.R7.push({ r, res, reads, distinctItems: distinct, eachKeptItsOwnData: correct });
  log(`R7 round ${r}:`, { distinctItems: distinct, eachKeptItsOwnData: correct, res: res.map((x) => `${x.create}/${x.submit}:${x.id}`) });
}

// R8 narrow the process window
const cid = prev.raceCase;
const getC = async () => (await w.call("GET", `/process/2/${A}/admin/${PC}/${cid}?${Q}`)).body || {};
const putC = (body) => w.call("PUT", `/process/2/${A}/admin/${PC}/${cid}?${Q}`, body);
out.R8 = [];
for (const gap of [0, 30, 60]) for (let r = 1; r <= 5; r++) {
  const tag = `r8-${gap}-${r}`;
  const p1 = putC({ Lane_D_Note: `D ${tag}` }); if (gap) await sleep(gap);
  const p2 = putC({ Lane_E_Note: `E ${tag}` });
  await Promise.all([p1, p2]); await sleep(300);
  const s = await getC();
  out.R8.push({ gap, r, D: s.Lane_D_Note === `D ${tag}`, E: s.Lane_E_Note === `E ${tag}` });
}
out.R8sum = Object.fromEntries([0, 30, 60].map((g) => [g, out.R8.filter((x) => x.gap === g && !(x.D && x.E)).length + "/5 lost"]));
log("R8 process admin route by gap (ms):", out.R8sum);
writeFileSync(fileURLToPath(new URL("./k-race-2-result.json", import.meta.url)), JSON.stringify(out, null, 2));
