// CIQP Request gets the Attachment field Final_PDF ("Final PDF"; Thomas, 29 Oct: the final-PDF service stores the PDF
// "both in the app and portal"). One new full-width row in the Details section right below Release_By_Email /
// Release_By_Role, ReadOnly at every step that carries field permissions (the same six as Supplier_Files: Issue request,
// fill in, keep up to date, End, give the final release, view the released CIQ), like CIQ_Case_A00.Final_PDF.
// No section permission changes: Details is already Editable at fill/keep/release/view (P-1 fix, 21 Oct), which is what
// lets the supplier's user-route read at "view the released CIQ" return the field. Only the final-PDF service writes it,
// over the admin attach route.
// Re-reads the live draft (keeps Thomas's manual changes: carried as they are, and checked: nothing but the planned
// additions differs), refuses any NEW preflight error (the draft already carries 5 duplicate step permissions since
// 22 Oct: left alone), backs up, PUTs, publishes, reads back the draft and the published allfields.
//   node kissflow-build/ciq-supplier-portal/add-final-pdf-field.mjs           dry run (2 GETs)
//   node kissflow-build/ciq-supplier-portal/add-final-pdf-field.mjs --apply   + backup, PUT, publish, read back
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { writer } from "../lib/meta.mjs";
import { validateBlob, errors as blobErrors, checkHygiene } from "../../tools/kissflow-app-agents-1.6.0/engine/validators.mjs";

const here = (f) => fileURLToPath(new URL(f, import.meta.url));
const w = writer(here("./final-pdf-field-requests.jsonl"));
const APPLY = process.argv.includes("--apply");
const A = w.acc, P = "CIQ_Supplier_Portal_A00", FLOW = "CIQP_Request_A00", FIELD = "Final_PDF";
if (A !== "AcDOSunMEpSA" || w.kf.domain !== "dev-beiersdorf.kissflow.eu") throw new Error("not the dev sandbox");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** One call on the shared key: >= 3 s apart; a 429 or an HTML answer stops everything (both sessions pause 20 min). */
async function call(method, path, body) {
  await sleep(3000);
  const r = await w.call(method, path, body);
  if (r.status === 429 || (typeof r.body === "string" && /<html|just a moment/i.test(r.body))) {
    console.log(`STOP: ${r.status} on ${method} ${path.split("?")[0]} (rate limit): both sessions pause 20 min; nothing more is sent`);
    process.exit(2);
  }
  return r;
}
const DRAFT = `/metadata/2/${A}/process/${FLOW}/draft?_application_id=${P}`;
const readDraft = async () => {
  const r = await call("GET", DRAFT);
  if (r.status !== 200 || !r.body || typeof r.body !== "object" || Array.isArray(r.body) || !r.body[FLOW]) throw new Error(`draft read ${r.status}: not the flow's draft (nothing written)`);
  return r.body;
};
const preflightErrors = (d) => blobErrors([...validateBlob({ label: FLOW, blob: d }), ...checkHygiene(d, FLOW)]).map((e) => `${e.code}: ${e.msg}`);

function graft(draft, tag) {
  const next = structuredClone(draft), model = next[FLOW];
  const anchorCol = draft[draft.Release_By_Email?.Column], anchorRow = draft[anchorCol?.Row];
  const section = next[anchorRow?.Column];
  if (!section || section.Type !== "Section" || section.Name !== "Details") throw new Error("Release_By_Email is not in the Details section: layout changed, stop");
  const tmplCol = draft.Supplier_Files?.Column;
  const acts = Object.values(draft).filter((p) => p?.Kind === "Permission" && p.Column === tmplCol).map((p) => p.Activity);
  if (acts.length !== 6 || acts.some((a) => draft[a]?.Kind !== "Activity")) throw new Error(`expected the 6 steps Supplier_Files has, found ${acts.length}: stop`);
  const rowId = `Row_fp${tag}`, colId = `Column_fp${tag}`, perms = acts.map((_, i) => `Permission_fp${tag}${i}`);
  next[rowId] = { Id: rowId, Kind: "Row", Column: section.Id, "Row::Column": [colId] };
  section["Column::Row"].splice(section["Column::Row"].indexOf(anchorRow.Id) + 1, 0, rowId);
  next[FIELD] = { Id: FIELD, Kind: "Field", Type: "Attachment", Name: "Final PDF", Model: FLOW, Column: colId };
  next[colId] = { Id: colId, Kind: "Column", Type: "Field", Start: 0, End: 6, Row: rowId, "Column::Field": [FIELD], Hint: "The final document (PDF) Beiersdorf filed at the final release: a copy of the case's Final PDF. Written by the final-PDF service only." };
  model["Model::Field"] = [...model["Model::Field"], FIELD];
  acts.forEach((a, i) => {
    next[perms[i]] = { Id: perms[i], Kind: "Permission", Column: colId, Permission: "ReadOnly", Activity: a };
    next[a]["Activity::Permission"] = [...next[a]["Activity::Permission"], perms[i]];
  });
  return { next, added: new Set([rowId, colId, FIELD, ...perms]), touched: new Set([FLOW, section.Id, ...acts]), acts };
}

/** What differs beyond the planned additions (must be nothing): Thomas's manual changes are carried untouched. */
function beyondPlan(before, after, plan) {
  const out = [];
  for (const k of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (plan.added.has(k)) { if (k in before) out.push(`${k} existed before`); continue; }
    if (!(k in after)) { out.push(`${k} removed`); continue; }
    if (!(k in before)) { out.push(`${k} new and not planned`); continue; }
    const a = JSON.stringify(before[k]);
    if (a === JSON.stringify(after[k])) continue;
    if (!plan.touched.has(k)) { out.push(`${k} changed`); continue; }
    const x = structuredClone(after[k]);
    for (const list of ["Model::Field", "Column::Row", "Activity::Permission"]) if (Array.isArray(x[list])) x[list] = x[list].filter((id) => !plan.added.has(id));
    if (JSON.stringify(x) !== a) out.push(`${k} changed beyond its planned list entries`);
  }
  return out;
}

const live = await readDraft();
if (live[FIELD]) {
  const perms = Object.values(live).filter((p) => p?.Kind === "Permission" && p.Column === live[FIELD].Column).map((p) => `${live[p.Activity]?.Name}=${p.Permission}`);
  console.log(`${FIELD} already there (${live[FIELD].Type}): ${perms.join(", ")}. Nothing to do.`);
  process.exit(0);
}
const plan = graft(live, Date.now().toString(36));
const before = new Set(preflightErrors(live)), after = preflightErrors(plan.next);
const fresh = after.filter((e) => !before.has(e));
const extra = beyondPlan(live, plan.next, plan);
console.log(`${FLOW} (draft ${live._meta_version}, published ${live.PublishedAt} by ${live.PublishedBy?.Name}):`);
console.log(`  + ${FIELD} (Attachment "Final PDF") in Details, row ${plan.next.Column_14de7jz?.["Column::Row"].indexOf([...plan.added][0])}, below Release_By_Email | Release_By_Role`);
console.log(`  + ReadOnly at: ${plan.acts.map((a) => live[a].Name).join(" | ")}`);
console.log(`  preflight: ${before.size} errors already on the live draft (kept as they are), ${fresh.length} new`);
console.log(`  beyond the plan: ${extra.length ? extra.join("; ") : "nothing"}`);
if (fresh.length || extra.length) { console.log("STOP: the graft would change more than planned; nothing written"); process.exit(1); }
if (!APPLY) { console.log("dry run: nothing written"); process.exit(0); }

// Thomas's builder or the other session may have changed the draft since: read again, graft THAT, compare versions
const now = await readDraft();
if (now._meta_version !== live._meta_version) { console.log(`STOP: the draft changed during the run (${live._meta_version} -> ${now._meta_version}); run again`); process.exit(1); }
const stamp = new Date().toISOString().replace(/[:.]/g, "");
writeFileSync(here(`./backup-${FLOW}-before-final-pdf-${stamp}.json`), JSON.stringify(now));
await sleep(3000);
const put = await w.putDraft("process", FLOW, plan.next).then((r) => r, (e) => ({ status: 0, body: String(e.message) }));
if (put.status === 429 || (typeof put.body === "string" && /<html|just a moment/i.test(put.body))) { console.log(`STOP: ${put.status} on the PUT (rate limit): both sessions pause 20 min`); process.exit(2); }
if (put.status === 0 || put.status >= 300) throw new Error(`PUT ${put.status} ${JSON.stringify(put.body).slice(0, 300)} (backup: backup-${FLOW}-before-final-pdf-${stamp}.json)`);
await sleep(3000);
const pub = await call("POST", `/metadata/2/${A}/process/${FLOW}/publish?_application_id=${P}`, {});
if (pub.status >= 300) throw new Error(`publish ${pub.status} ${JSON.stringify(pub.body).slice(0, 300)}: the draft holds the field unpublished; fix or PUT the backup back`);
const back = await readDraft();
const backPerms = Object.values(back).filter((p) => p?.Kind === "Permission" && p.Column === back[FIELD]?.Column);
const backExtra = beyondPlan(now, back, plan).filter((x) => !/^(PublishedAt|PublishedBy|_meta_version)/.test(x));
const pubBody = (await call("GET", `/process/2/${A}/${FLOW}/allfields?_application_id=${P}`)).body?.[FLOW];
const pubFields = Array.isArray(pubBody) ? pubBody : Array.isArray(pubBody?.Fields) ? pubBody.Fields : [];
const published = pubFields.find((f) => (f.Id || f._id || f.FieldId) === FIELD);
console.log(`PUT ${put.status}, publish ${pub.status}; read back: field ${back[FIELD]?.Type ?? "MISSING"}, ${backPerms.length} step permissions (${[...new Set(backPerms.map((p) => p.Permission))].join(",")}), beyond plan: ${backExtra.length ? backExtra.join("; ") : "nothing"}; published allfields: ${published ? published.Type : "MISSING"}`);
if (back[FIELD]?.Type !== "Attachment" || backPerms.length !== 6 || backPerms.some((p) => p.Permission !== "ReadOnly") || !published) process.exitCode = 1;
