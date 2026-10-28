// Proof (21 Oct night) on the throwaway CIQ ZZ Spike Point (Thomas approved the spike flows on 7 Oct to prove Kissflow
// behaviours): does a field update at a later step need a SECTION permission at that step, besides the field's own?
//   A: Response_Text Editable at "Spike review" (field only, the section has no permission) → expect 050313
//   B: + the Details section Editable at "Spike review" → expect 200 for Response_Text; records whether the ReadOnly
//      Question_Text is written too (the portal session saw ReadOnly fields written inside an Editable section, 21 Oct)
// Each stage: re-read the live draft → back up → change ONE thing → PUT draft → publish → read back → a fresh ZZT spike
// item (Spike_Assignee = Thomas, To_Supplier "No" → straight to "Spike review") → the updates → admin DELETE → GET 404.
// Paced 2.5 s, no retry, stops on 429/HTML. Never touches any other flow.
//   node spike-section-proof.mjs A|B
import { writeFileSync } from "node:fs";
import { writer } from "../../lib/meta.mjs";

const STAGE = process.argv[2];
if (!["A", "B"].includes(STAGE)) throw new Error("stage A or B");
const FLOW = "CIQ_ZZ_Spike_Point_A00", APP = "CIQ_Digital_A00", Q = `_application_id=${APP}`, THOMAS = "UsEJUfjYLM8Y";
const STEP = "Spike review", SECTION = "Details";
const w = writer(new URL("./spike-proof-requests.jsonl", import.meta.url).pathname);
if (w.acc !== "AcDOSunMEpSA" || w.kf.domain !== "dev-beiersdorf.kissflow.eu") throw new Error("not dev");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function call(method, path, body) {
  if (!path.includes(FLOW)) throw new Error(`refused: ${path} is not the spike point`);
  await sleep(2500);
  const r = await w.call(method, path, body);
  if (r.status === 429 || (typeof r.body === "string" && /<html|just a moment/i.test(r.body))) { console.log("STOP", r.status, method, path); process.exit(2); }
  return r;
}
const out = { stage: STAGE, at: new Date().toISOString() };
const save = () => writeFileSync(new URL(`./spike-proof-${STAGE}.json`, import.meta.url), JSON.stringify(out, null, 1));
const err = (r) => (r.status >= 300 ? `${r.body?.error_code || r.status} ${r.body?.en_message || JSON.stringify(r.body).slice(0, 200)}` : undefined);

// ---- metadata: one change, backed up and read back
const d0 = await call("GET", `/metadata/2/${w.acc}/process/${FLOW}/draft?${Q}`);
if (d0.status !== 200 || typeof d0.body !== "object" || !d0.body[FLOW]) throw new Error(`draft read ${d0.status}`);
const draft = d0.body;
writeFileSync(new URL(`./spike-point-backup-${STAGE}-${out.at.replace(/[:.]/g, "")}.json`, import.meta.url), JSON.stringify(draft));
const step = Object.values(draft).find((e) => e?.Kind === "Activity" && e.Name === STEP);
const cols = Object.values(draft).filter((e) => e?.Kind === "Column");
const fieldCol = (f) => cols.find((c) => (c["Column::Field"] || []).includes(f));
const section = cols.find((c) => c.Type === "Section" && c.Name === SECTION);
const permOf = (colId) => (step["Activity::Permission"] || []).map((id) => draft[id]).find((p) => p?.Column === colId);
const next = structuredClone(draft);
const nstep = next[step.Id];
if (STAGE === "A") {
  const p = permOf(fieldCol("Response_Text").Id);
  out.change = `${STEP} · Response_Text: ${p.Permission} → Editable`;
  next[p.Id] = { ...p, Permission: "Editable" };
} else {
  if (permOf(fieldCol("Response_Text").Id)?.Permission !== "Editable") throw new Error("stage A is not in place");
  if (permOf(section.Id)) throw new Error(`the section already has ${permOf(section.Id).Permission}`);
  const id = `Permission_zs${Date.now().toString(36)}`;
  next[id] = { Id: id, Kind: "Permission", Column: section.Id, Permission: "Editable", Activity: step.Id };
  nstep["Activity::Permission"] = [...(nstep["Activity::Permission"] || []), id];
  out.change = `${STEP} · section ${SECTION}: (none) → Editable`;
}
await sleep(2500);
const put = await w.putDraft("process", FLOW, next).then((r) => r, (e) => ({ status: 0, body: String(e.message) }));
out.put = put.status; if (put.status >= 300) { out.putErr = err(put); save(); throw new Error(`PUT ${put.status}`); }
await sleep(2500);
const pub = await call("POST", `/metadata/2/${w.acc}/process/${FLOW}/publish?${Q}`, {});
out.publish = pub.status; if (pub.status >= 300) { out.publishErr = err(pub); save(); throw new Error(`publish ${pub.status}`); }
const d1 = (await call("GET", `/metadata/2/${w.acc}/process/${FLOW}/draft?${Q}`)).body;
const s1 = Object.values(d1).find((e) => e?.Kind === "Activity" && e.Name === STEP);
const perm1 = (colId) => (s1["Activity::Permission"] || []).map((id) => d1[id]).find((p) => p?.Column === colId)?.Permission;
out.readBack = { Response_Text: perm1(fieldCol("Response_Text").Id), Question_Text: perm1(fieldCol("Question_Text").Id), section: perm1(section.Id) ?? null };
save();
console.log("metadata:", out.change, "| PUT", out.put, "| publish", out.publish, "| read back", JSON.stringify(out.readBack));

// ---- a fresh spike item at "Spike review", held by Thomas
const tag = `ZZT-N21-SP${STAGE}-${out.at.slice(11, 19).replace(/:/g, "")}`;
const c = await call("POST", `/process/2/${w.acc}/${FLOW}?${Q}`, { Round_No: 1, Question_Text: `${tag} fictional question`, Awaiting_Response: "No", Due_Date: "2026-11-30", To_Supplier: "No", Spike_Assignee: [{ _id: THOMAS }] });
const item = c.body?._id; out.item = item; out.create = c.status; save();
if (!item) throw new Error(`create ${c.status} ${err(c)}`);
try {
  const sub = await call("POST", `/process/2/${w.acc}/${FLOW}/${item}/${c.body._activity_instance_id}/submit?${Q}`, {});
  out.submit = sub.status; if (sub.status >= 300) throw new Error(`submit ${err(sub)}`);
  let g;
  for (let i = 0; i < 5; i++) { g = (await call("GET", `/process/2/${w.acc}/admin/${FLOW}/${item}?${Q}`)).body; if (g._current_step === STEP) break; }
  const ctx = (g._current_context || [])[0] || {};
  out.at_step = { step: g._current_step, assigned: (ctx._context_assigned_to || []).map((a) => a.Name) };
  const act = ctx._context_activity_instance_id;
  const u1 = await call("POST", `/process/2/${w.acc}/${FLOW}/${item}/${act}?${Q}`, { Response_Text: `${tag} fictional response` });
  out.updateResponseText = { status: u1.status, err: err(u1) };
  const u2 = await call("POST", `/process/2/${w.acc}/${FLOW}/${item}/${act}?${Q}`, { Question_Text: `${tag} must NOT be stored (ReadOnly here)` });
  out.updateQuestionText = { status: u2.status, err: err(u2) };
  const g2 = (await call("GET", `/process/2/${w.acc}/admin/${FLOW}/${item}?${Q}`)).body;
  out.stored = { Response_Text: g2.Response_Text ?? null, Question_Text: g2.Question_Text ?? null };
} finally {
  const del = await call("DELETE", `/process/2/${w.acc}/admin/${FLOW}/${item}?${Q}`);
  const gone = await call("GET", `/process/2/${w.acc}/admin/${FLOW}/${item}?${Q}`);
  out.cleanup = { delete: del.status, getAfter: gone.status };
  save();
}
console.log(JSON.stringify({ at_step: out.at_step, updateResponseText: out.updateResponseText, updateQuestionText: out.updateQuestionText, stored: out.stored, cleanup: out.cleanup }, null, 1));
