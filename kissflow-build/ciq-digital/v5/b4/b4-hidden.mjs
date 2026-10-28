// B4 (plan-v5-final §4.1, §4.3, P12): fields no longer used become Hidden at every step, so native forms stay clean.
//   node b4-hidden.mjs case [--offline | --apply]   CIQ Case: the 81 fields outside the §4.1 in-use set (= sync/ids.mjs
//                                                    F.caseProc.live + v5) → Hidden at Start, S1, S7 and End
//   node b4-hidden.mjs op   [--offline | --apply]   CIQ Open Point (ONLY after B2 fields is live): the §4.3 "no longer used"
//                                                    fields + the Rounds table column → Hidden at every step
// Only the Permission entities of the listed columns change (the proven setPerm graft, R1). In-use fields keep their level
// (Start M/E as §4.1/§4.3; ReadOnly elsewhere); the script asserts that. Default = dry run (GET draft, mutate in memory,
// diff + preflight → <target>-dryrun.json). --apply: original saved to v5/originals/<flow>.before-B4.json → putDraft →
// publish → read back (diff vs sent + level matrix) and the published fields.
// Guards (as b2/lib-b2.mjs): DEV only; one paced wrapper (>= 1.1 s, no retries); writes only to the target flow;
// role/member routes refused; 429 or HTML → STOP.
import { fileURLToPath } from "node:url";
import { writeFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { writer, preflight } from "../../../lib/meta.mjs";
import { setPerm, draftDiff, ents, clone, sleep } from "../rehearsal/lib.mjs";
import { F } from "../../../sync/ids.mjs";

const here = (f) => fileURLToPath(new URL(f, import.meta.url));
const APP = "CIQ_Digital_A00", Q = `_application_id=${APP}`;
const TARGETS = {
  case: {
    flow: "CIQ_Case_A00",
    activities: ["Activity_p1i6xz", "Activity_1kltjdn", "Activity_gwgj5o", "Activity_ycf01a"],
    hidden: (b) => (b[b.Root]["Model::Field"] || []).filter((id) => !new Set([...F.caseProc.live, ...F.caseProc.v5]).has(id)),
    expectCount: 81,
    extraColumns: [],
    pre: () => null,
  },
  op: {
    flow: "CIQ_Open_Point_A00",
    activities: ["Activity_18t0lhi", "Activity_uka3mx", "Activity_1kdump3", "Activity_1go37bt", "Activity_hha7u2", "Activity_y4af4g", "Activity_xc8fbb", "Activity_i73i25"],
    hidden: (b) => (b[b.Root]["Model::Field"] || []).filter((id) => /^(Internal_Justification|Internal_Due_Date|New_Section_Item_Key|Awaiting_Response|Accepted_Doc_.*|Reviewed_.*|Late_Decision.*|On_Behalf_Of|Thread_Text|Start_Gate)$/.test(id)),
    expectCount: 15,
    extraColumns: ["Column_1je59z6"], // the Rounds child table (Thread_JSON replaces it)
    pre: () => {
      const p = here("../b2/fields-result.json");
      if (!existsSync(p) || !JSON.parse(readFileSync(p, "utf8")).write?.ok) return "B2 fields is not live yet (v5/b2/fields-result.json); OP Hidden waits for it";
      return null;
    },
  },
};
const TARGET = process.argv[2];
const T = TARGETS[TARGET];
if (!T) { console.error("usage: node b4-hidden.mjs <case|op> [--offline|--apply]"); process.exit(1); }
const APPLY = process.argv.includes("--apply"), OFFLINE = process.argv.includes("--offline");
if (APPLY && OFFLINE) { console.error("--offline and --apply are exclusive"); process.exit(1); }

const raw = writer(here("./requests.jsonl"));
if (raw.acc !== "AcDOSunMEpSA" || raw.kf.domain !== "dev-beiersdorf.kissflow.eu") throw new Error("not the DEV sandbox; refusing");
const A = raw.acc;
let last = 0, calls = 0;
async function call(method, path, body) {
  if (/\/app_role|\/member/.test(path) && method !== "GET") throw new Error(`GUARD: refused ${method} ${path}`);
  if (method !== "GET" && !(path.includes(`/${T.flow}/`) || path.endsWith(`/${T.flow}`))) throw new Error(`GUARD: refused ${method} ${path} (outside B4 ${TARGET})`);
  const wait = last + 1100 - Date.now(); if (wait > 0) await sleep(wait); last = Date.now(); calls++;
  const r = await raw.kf.call(method, path, body, { retries: 0 });
  raw.log({ method, path, status: r.status, req: body === undefined ? undefined : "(draft)", res: typeof r.body === "string" ? r.body.slice(0, 300) : JSON.stringify(r.body).slice(0, 300) });
  if (typeof r.body === "string" && /<html|just a moment/i.test(r.body)) throw new Error(`STOP: HTML challenge (status ${r.status}) on ${method} ${path}`);
  if (r.status === 429) throw new Error(`STOP: 429 on ${method} ${path}`);
  return r;
}
async function getDraftStrict(id) {
  const r = await call("GET", `/metadata/2/${A}/process/${id}/draft`);
  if (r.status !== 200 || !r.body || typeof r.body !== "object" || Array.isArray(r.body) || !r.body[id] || r.body.Root !== id) throw new Error(`getDraft ${id} → ${r.status}: not a JSON draft; aborting before any change`);
  return r.body;
}
const save = (rel, data) => { const p = here("./" + rel); mkdirSync(p.slice(0, p.lastIndexOf("/")), { recursive: true }); writeFileSync(p, JSON.stringify(data, null, 1)); return p; };
function matrix(b, acts) {
  const colToField = Object.fromEntries(ents(b).filter((e) => e.Kind === "Field" && e.Model === b.Root && e.Column).map((e) => [e.Column, e.Id]));
  for (const c of T.extraColumns) colToField[c] = c;
  return Object.fromEntries(acts.map((a) => {
    const m = {}; for (const p of (b[a]?.["Activity::Permission"] || []).map((x) => b[x])) { const f = colToField[p?.Column]; if (f) m[f] = p.Permission; }
    return [a, m];
  }));
}
const count = (m) => Object.fromEntries(Object.entries(m).map(([a, fl]) => [a, Object.values(fl).reduce((s, l) => ((s[l] = (s[l] || 0) + 1), s), {})]));

const out = { step: `B4-hidden-${TARGET}`, flow: T.flow, at: new Date().toISOString(), apply: APPLY, offline: OFFLINE };
const finish = (code) => { out.calls = calls; save(`${TARGET}-${APPLY ? "result" : OFFLINE ? "dryrun-offline" : "dryrun"}.json`, out); console.log(JSON.stringify({ ...out, levelChanges: out.levelChanges?.length }, null, 1)); process.exit(code); };
const blocked = T.pre();
if (blocked && !OFFLINE) { out.refused = blocked; finish(1); }
if (blocked) out.note = blocked + " (offline dry run only)";

let live;
if (OFFLINE) {
  const src = TARGET === "case" ? "../b1/CIQ_Case_A00.after-B1.draft.json" : "../b2/fields-dryrun-offline.json";
  const j = JSON.parse(readFileSync(here(src), "utf8"));
  if (TARGET === "op") { out.offlineNote = "op offline needs the post-B2 draft, which only exists after B2 applies; skipped"; finish(0); }
  live = j.body && j.status ? j.body : j;
} else live = await getDraftStrict(T.flow);
out.livePublishedAt = live.PublishedAt;
const hidden = T.hidden(live);
out.hiddenFields = hidden.length;
if (hidden.length !== T.expectCount) { out.abort = `expected ${T.expectCount} unused fields, found ${hidden.length}: ${hidden.join(", ")}`; finish(1); }
const before = matrix(live, T.activities);
const next = clone(live);
const cols = [...hidden.map((id) => next[id].Column), ...T.extraColumns];
out.levelChanges = [];
for (const a of T.activities) for (const c of cols) {
  const was = (next[a]["Activity::Permission"] || []).map((x) => next[x]).find((p) => p?.Column === c)?.Permission;
  setPerm(next, a, c, "Hidden");
  if (was !== "Hidden") out.levelChanges.push(`${a}:${c}:${was}→Hidden`);
}
out.notReadOnlyBefore = out.levelChanges.filter((x) => !x.includes(":ReadOnly→"));
const after = matrix(next, T.activities);
// in-use fields untouched
const inUseChanged = [];
for (const a of T.activities) for (const [f, l] of Object.entries(before[a])) if (!hidden.includes(f) && !T.extraColumns.includes(f) && after[a][f] !== l) inUseChanged.push(`${a}:${f}:${l}→${after[a][f]}`);
out.inUseChanged = inUseChanged;
out.countsBefore = count(before); out.countsAfter = count(after);
const diff = draftDiff(live, next);
out.diffSummary = { added: diff.added.length, removed: diff.removed.length, changed: diff.changed.length, changedNonPermission: diff.changed.filter((c) => !c.entity.includes(" Permission")).map((c) => c.entity) };
const pf = preflight(T.flow, next);
out.preflight = { errors: pf.errors, warnings: [...new Set(pf.warnings.map((x) => x.code))] };
if (inUseChanged.length || out.diffSummary.added || out.diffSummary.removed || out.diffSummary.changedNonPermission.length) { out.abort = "unexpected change outside the Hidden permissions"; finish(1); }
if (!APPLY || pf.errors.length) finish(pf.errors.length ? 1 : 0);

const orig = here(`../originals/${T.flow}.before-B4.json`);
if (!existsSync(orig)) writeFileSync(orig, JSON.stringify(live, null, 1));
const pd = await call("PUT", `/metadata/2/${A}/process/${T.flow}/draft`, next);
out.write = { putDraft: pd.status };
if (pd.status >= 300) { out.write.body = JSON.stringify(pd.body).slice(0, 600); finish(1); }
const pub = await call("POST", `/metadata/2/${A}/process/${T.flow}/publish`, {});
out.write.publish = pub.status;
if (pub.status >= 300) {
  out.write.body = JSON.stringify(pub.body).slice(0, 600);
  const rp = await call("PUT", `/metadata/2/${A}/process/${T.flow}/draft`, live);
  const rb = await call("POST", `/metadata/2/${A}/process/${T.flow}/publish`, {});
  out.restore = { putDraft: rp.status, publish: rb.status };
  finish(1);
}
out.write.ok = true;
await sleep(1500);
const back = await getDraftStrict(T.flow);
const rb = draftDiff(next, back);
out.readBack = { publishedAt: back.PublishedAt, diffVsSent: { added: rb.added, removed: rb.removed, changedCount: rb.changed.length, changed: rb.changed.slice(0, 6) }, counts: count(matrix(back, T.activities)) };
const pfl = await call("GET", `/process/2/${A}/${T.flow}/allfields?${Q}`);
const ids = (pfl.body?.[T.flow]?.Fields || []).map((f) => f.Id);
out.publishedFields = { status: pfl.status, count: ids.filter((x) => (back[back.Root]["Model::Field"] || []).includes(x)).length, ofModel: (back[back.Root]["Model::Field"] || []).length };
save(`${T.flow}.after-B4.draft.json`, back);
finish(0);
