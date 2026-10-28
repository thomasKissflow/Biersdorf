// Plan v6 §3.2 (copied from v5/grants-v5.mjs; grid in grants-v6-plan.mjs) (and §4.14) flow grants for CIQ_Digital_A00, as a DRY RUN by default.
//   node kissflow-build/ciq-digital/v5/grants-v5.mjs                 dry run: GET each flow's members (read-only client),
//                                                                     print the planned batch body and the removals → v5/grants-v5-dryrun.json
//   node kissflow-build/ciq-digital/v5/grants-v5.mjs --apply --thomas-approved
//                                                                     ONLY after Thomas approves (the parent runs it): POST member/batch per
//                                                                     flow, DELETE the managed roles §6 doesn't list, read back → v5/grants-v5-result.json
//   options: --edit-with-delete   use Form Member ["Delete"] for "Edit" (the K-17/S-6 fallback) instead of Member [] (no Delete)
//            --only <flowId>      one flow
// Shapes are the portal build's verified ones (build-portal.mjs GRANT_SHAPE, 7 Oct): Process Member [InitiateItems] / [View],
// Admin; Form Viewer, Member. Managed roles = the 13 roles in §6 + the retired CIQ Overall Approver. Members outside that set
// (Admin / Developer, single users) are reported and never touched. Flows that don't exist yet (CIQ Review before B2/B3)
// are skipped and reported. Paced >= 1.2 s; 429/HTML stops the run. No role is created, renamed or deleted here.
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { client } from "../../lib/kf.mjs";
import { APP as PLAN_APP, ROLES, MANAGED, shapes, grantPlan } from "./grants-v6-plan.mjs";

const here = (f) => fileURLToPath(new URL(f, import.meta.url));
const argv = process.argv.slice(2);
const APPLY = argv.includes("--apply");
if (APPLY && !argv.includes("--thomas-approved")) { console.error("--apply needs --thomas-approved (grants are applied only after Thomas's explicit OK)"); process.exit(1); }
const EDIT_WITH_DELETE = argv.includes("--edit-with-delete");
const ONLY = argv.includes("--only") ? argv[argv.indexOf("--only") + 1] : null;
const APP = PLAN_APP, Q = `_application_id=${APP}`;
const kf = client({ readOnly: !APPLY });
if (kf.acc !== "AcDOSunMEpSA" || kf.domain !== "dev-beiersdorf.kissflow.eu") throw new Error("not the DEV sandbox; refusing");
const A = kf.acc;

const SHAPE = shapes(EDIT_WITH_DELETE);
const plan = grantPlan();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let last = 0, calls = 0;
async function call(method, path, body) {
  if (!APPLY && method !== "GET") throw new Error("dry run: refusing a write");
  if (/\/app_role/.test(path) && method !== "GET") throw new Error("GUARD: role writes are not part of this script");
  const d = last + 1200 - Date.now(); if (d > 0) await sleep(d); last = Date.now(); calls++;
  const r = await kf.call(method, path, body, { retries: 0 });
  if (typeof r.body === "string" && /<html|just a moment/i.test(r.body)) throw new Error(`STOP: HTML challenge on ${method} ${path}`);
  if (r.status === 429) throw new Error(`STOP: 429 on ${method} ${path}`);
  if (r.status === 423 && method !== "GET") { await sleep(2000); return call(method, path, body); } // flow lock (portal build saw 423 on member/batch)
  return r;
}
const rows = (b) => (Array.isArray(b) ? b : b?.Data || []);
const same = (m, s) => m && m.Role === s.Role && JSON.stringify([...(m.Permission || [])].sort()) === JSON.stringify([...s.Permission].sort());

const out = { at: new Date().toISOString(), mode: APPLY ? "apply" : "dry-run", editWithDelete: EDIT_WITH_DELETE, flows: [] };
for (const p of plan.filter((x) => !ONLY || x.id === ONLY)) {
  const rec = { flow: p.key, id: p.id, type: p.type };
  out.flows.push(rec);
  const g = await call("GET", `/flow/2/${A}/${p.type}/${p.id}/member?${Q}`);
  if (g.status === 404 || (g.status >= 400 && /not.*exist|NotFound/i.test(JSON.stringify(g.body)))) { rec.skipped = `flow ${p.id} not found (${g.status}); create it first`; continue; }
  if (g.status !== 200) { rec.error = `members GET ${g.status}: ${JSON.stringify(g.body).slice(0, 200)}`; continue; }
  const live = rows(g.body);
  rec.liveMembers = live.map((m) => `${m.Name}:${m.Kind}:${m.Role}${(m.Permission || []).length ? "[" + m.Permission.join(",") + "]" : ""}`);
  const body = Object.entries(p.want).map(([r, code]) => ({ _id: ROLES[r][0], Name: ROLES[r][1], _application_id: APP, Kind: "AppRole", ...SHAPE[p.type][code] }));
  rec.batch = body.map((b) => `${b.Name} → ${b.Role}${b.Permission.length ? "[" + b.Permission.join(",") + "]" : ""}`);
  rec.changes = body.filter((b) => !same(live.find((m) => m._id === b._id), b)).map((b) => { const m = live.find((x) => x._id === b._id); return `${b.Name}: ${m ? `${m.Role}${JSON.stringify(m.Permission || [])}` : "none"} → ${b.Role}${JSON.stringify(b.Permission)}`; });
  const wantIds = new Set(body.map((b) => b._id));
  rec.removals = live.filter((m) => MANAGED.has(m._id) && !wantIds.has(m._id)).map((m) => `${m.Name} (${m.Role}${JSON.stringify(m.Permission || [])})`);
  rec.untouched = live.filter((m) => !MANAGED.has(m._id)).map((m) => `${m.Name}:${m.Kind}:${m.Role}`);
  if (!APPLY) continue;
  const b = await call("POST", `/flow/2/${A}/${p.type}/${p.id}/member/batch?${Q}`, body);
  rec.batchStatus = b.status;
  for (const m of live.filter((x) => MANAGED.has(x._id) && !wantIds.has(x._id))) {
    const d = await call("DELETE", `/flow/2/${A}/${p.type}/${p.id}/member/${m._id}?${Q}`);
    (rec.deleteStatus = rec.deleteStatus || []).push(`${m.Name}:${d.status}`);
  }
  const back = rows((await call("GET", `/flow/2/${A}/${p.type}/${p.id}/member?${Q}`)).body);
  rec.readBackDiffs = [
    ...body.filter((x) => !same(back.find((m) => m._id === x._id), x)).map((x) => `${x.Name}: want ${x.Role}${JSON.stringify(x.Permission)}, got ${JSON.stringify(back.find((m) => m._id === x._id) || null)}`),
    ...back.filter((m) => MANAGED.has(m._id) && !wantIds.has(m._id)).map((m) => `${m.Name}: still a member`),
  ];
}
out.calls = calls;
out.summary = {
  flows: out.flows.length, skipped: out.flows.filter((f) => f.skipped).map((f) => f.id),
  changes: out.flows.reduce((s, f) => s + (f.changes?.length || 0), 0), removals: out.flows.reduce((s, f) => s + (f.removals?.length || 0), 0),
  readBackDiffs: APPLY ? out.flows.reduce((s, f) => s + (f.readBackDiffs?.length || 0), 0) : undefined,
};
writeFileSync(here(`./grants-v6-${APPLY ? "result" : "dryrun"}.json`), JSON.stringify(out, null, 1));
console.log(JSON.stringify(out.summary, null, 1));
for (const f of out.flows) console.log(`${f.id}: ${f.skipped || f.error || `${f.changes.length} change(s), ${f.removals.length} removal(s), ${f.untouched.length} untouched`}`);
