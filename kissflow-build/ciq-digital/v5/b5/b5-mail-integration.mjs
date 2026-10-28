// B5 (plan-v5-final §4.6, R-1): the integration "CIQ Mail – send outbox mail", built over REST in the passes the 7 Oct
// spike proved for the ZZ test integrations (spikes/integ-1..4: skeleton → bind selectors → map → publish), and LEFT OFF
// (switching on is builder-only; Thomas does it, S-3).
//   trigger:  Kissflow Dataform 1.5.4 "ItemCreated" on CIQ_Mail_Outbox_A00 (existing connection CnEKHrH5GzkY)
//   action 1: Email 1.0.6 "SendEmail" (InternalAuth: Kissflow's own mail service; no connection): To ← To_Emails,
//             Subject ← Subject, Body (Rich text) ← Body_Text
//   action 2: Kissflow Dataform "UpdateAnItem" on CIQ_Mail_Outbox_A00: instance_id ← trigger _id, Sent_Status ← "Sent"
//   node b5-mail-integration.mjs <create|skeleton|bind|map> [--apply]   (default: dry run, GETs only)
// Shapes are copied from the live, published ZZ integration (v5/b5/ref-*.draft.json) and the Email connector metadata
// (v5/b5/email-connector-1.0.6.json). Guards: DEV only; paced >= 1.2 s; writes only to this integration (and its create);
// no member/role routes; 429/HTML → STOP. Every pass reads the draft back.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { writer } from "../../../lib/meta.mjs";

const here = (f) => fileURLToPath(new URL(f, import.meta.url));
const NAME = "CIQ Mail – send outbox mail";
const OUTBOX = ["CIQ_Mail_Outbox_A00", "CIQ Mail Outbox"];
const PHASE = process.argv[2], APPLY = process.argv.includes("--apply");
if (!["create", "skeleton", "bind", "map"].includes(PHASE)) { console.error("usage: node b5-mail-integration.mjs <create|skeleton|bind|map> [--apply]"); process.exit(1); }
const STATE = here("./b5-state.json");
const st = existsSync(STATE) ? JSON.parse(readFileSync(STATE, "utf8")) : {};
const saveState = () => writeFileSync(STATE, JSON.stringify(st, null, 1));
const w = writer(here("./requests.jsonl"));
if (w.acc !== "AcDOSunMEpSA" || w.kf.domain !== "dev-beiersdorf.kissflow.eu") throw new Error("not the DEV sandbox; refusing");
const A = w.acc;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let last = 0;
async function call(method, path, body) {
  if (/\/app_role|\/member/.test(path) && method !== "GET") throw new Error(`GUARD: refused ${method} ${path}`);
  if (method !== "GET") {
    const isCreate = method === "POST" && path === `/flow/2/${A}/integration/?_application_id=CIQ_Digital_A00` && body?.Name === NAME;
    if (!isCreate && !(st.id && path.includes(`/integration/${st.id}/`))) throw new Error(`GUARD: refused ${method} ${path}`);
  }
  const d = last + 1200 - Date.now(); if (d > 0) await sleep(d); last = Date.now();
  const r = await w.call(method, path, body);
  if (typeof r.body === "string" && /<html|just a moment/i.test(r.body)) throw new Error(`STOP: HTML challenge on ${method} ${path}`);
  if (r.status === 429) throw new Error(`STOP: 429 on ${method} ${path}`);
  return r;
}
const ref = JSON.parse(readFileSync(here("./ref-CIQ_ZZ_Spike_log_register_created_A00.draft.json"), "utf8"));
const zzTrig = Object.values(ref).find((e) => e?.Kind === "Trigger"), zzAct = Object.values(ref).find((e) => e?.Kind === "Action");
const getDraft = async () => {
  const r = await call("GET", `/metadata/2/${A}/integration/${st.id}/draft`);
  if (r.status !== 200 || !r.body || typeof r.body !== "object" || !r.body[st.id]) throw new Error(`integration draft not readable (${r.status})`);
  return r.body;
};
const out = { phase: PHASE, apply: APPLY, at: new Date().toISOString() };
const done = (code = 0) => { writeFileSync(here(`./${PHASE}-${APPLY ? "result" : "dryrun"}.json`), JSON.stringify(out, null, 1)); console.log(JSON.stringify(out, null, 1).slice(0, 5000)); process.exit(code); };
const T = "Trigger_CIQ_Mail_A00", A1 = "Action_CIQ_Mail_Send_A00", A2 = "Action_CIQ_Mail_Sent_A00";

if (PHASE === "create") {
  const l = await call("GET", `/flow/2/${A}/integration/?_application_id=CIQ_Digital_A00&page_number=1&page_size=50`);
  const rows = Array.isArray(l.body) ? l.body : l.body?.Data || [];
  const hit = rows.find((x) => x.Name === NAME);
  out.existing = hit ? { _id: hit._id, Status: hit.Status, IsActive: hit.IsActive } : null;
  if (hit) { st.id = hit._id; saveState(); done(0); }
  if (!APPLY) { out.wouldCreate = NAME; done(0); }
  const cr = await call("POST", `/flow/2/${A}/integration/?_application_id=CIQ_Digital_A00`, { Name: NAME, Description: "R-1: sends each CIQ Mail Outbox row (one row = one e-mail, written by the CIQ Sync Service) and marks it Sent. Built OFF; Thomas switches it on." });
  out.create = { status: cr.status, id: cr.body?._id, body: cr.status >= 300 ? JSON.stringify(cr.body).slice(0, 400) : undefined };
  if (cr.status >= 300 || !cr.body?._id) done(1);
  st.id = cr.body._id; saveState();
  const back = await getDraft();
  out.readBack = { keys: Object.keys(back), root: back[st.id] };
  done(0);
}
if (!st.id) { out.error = "run `create --apply` first"; done(1); }

if (PHASE === "skeleton") {
  const live = await getDraft();
  out.before = Object.values(live).filter((e) => e?.Kind).map((e) => `${e.Id}:${e.Kind}`);
  const subs = await call("GET", `/connector/2/${A}/subscription?page_number=1&page_size=200`);
  const emailSub = (Array.isArray(subs.body) ? subs.body : []).find((c) => c._id === "CoOj46v9fVh37");
  const blob = { ...live };
  blob[st.id] = { ...live[st.id], "Integration::Trigger": [T], "Integration::Action": [A1, A2] };
  blob[T] = { Id: T, Kind: "Trigger", Type: "App", Name: "When an item is added to a dataform", IsInternalAuth: false, Connection: { ...zzTrig.Connection }, Integration: st.id,
    Connector: { ...zzTrig.Connector }, "Trigger::FieldMapping": [] };
  // InternalAuth connector: the engine's proven "steps-only" auth shape (IsInternalAuth:true + empty Connection, saves)
  blob[A1] = { Id: A1, Kind: "Action", Type: "Create", Name: "Send an email", IsInternalAuth: true, Connection: {}, Integration: st.id,
    Connector: { _id: "CoOj46v9fVh37", Name: "Email", Version: "1.0.6", Logo: emailSub?.Logo, Status: "Published", WebsiteURL: "https://kissflow.com", ActionId: "SendEmail", ActionName: "Send an email" }, "Action::FieldMapping": [] };
  blob[A2] = { Id: A2, Kind: "Action", Type: "Create", Name: "Update an item", IsInternalAuth: false, Connection: { ...zzAct.Connection }, Integration: st.id,
    Connector: { ...zzAct.Connector, ActionId: "UpdateAnItem", ActionName: "Update an item" }, "Action::FieldMapping": [] };
  out.emailLogoFound = !!emailSub?.Logo;
  out.blobKinds = Object.values(blob).filter((e) => e?.Kind).map((e) => `${e.Id}:${e.Kind}`);
  if (!APPLY) done(0);
  const pd = await call("PUT", `/metadata/2/${A}/integration/${st.id}/draft`, blob);
  out.put = { status: pd.status, body: pd.status >= 300 ? JSON.stringify(pd.body).slice(0, 500) : undefined };
  if (pd.status >= 300) done(1);
  const back = await getDraft();
  out.readBack = Object.values(back).filter((e) => e?.Kind).map((e) => `${e.Id}:${e.Kind}${e.Connector ? ":" + (e.Connector.TriggerId || e.Connector.ActionId) : ""}`);
  for (const [seg, id] of [["trigger", T], ["action", A1], ["action", A2]]) {
    const r = await call("GET", `/integration/2/${A}/${st.id}/${seg}/${id}/fields`);
    out[`schema_${id}`] = { status: r.status, fields: Array.isArray(r.body) ? r.body.map((f) => ({ Id: f.Id, Name: f.Name, Label: f.Label, Type: f.Type, Req: f.IsRequired, DD: f.IsDropdown })) : JSON.stringify(r.body).slice(0, 300) };
  }
  st.skeleton = { ok: true, schemas: { [T]: out[`schema_${T}`], [A1]: out[`schema_${A1}`], [A2]: out[`schema_${A2}`] } }; saveState();
  done(0);
}

let n = 0;
const nid = (p) => `${p}_b5${PHASE[0]}${(++n).toString(36)}`;
function dropMappings(blob, kind, owner, keepNames = []) {
  const keep = [];
  for (const k of Object.keys(blob)) { const e = blob[k]; if (e?.Kind === "FieldMapping" && e[kind] === owner) { if (keepNames.includes(e.Name)) { keep.push(k); continue; } for (const p of e["FieldMapping::Property"] || []) delete blob[p]; delete blob[k]; } }
  return keep;
}
function selector(blob, kind, owner, f, value, label) {
  const fm = nid("FieldMapping"), pr = nid("Property");
  blob[fm] = { Id: fm, Kind: "FieldMapping", Type: f.Type || "String", FieldId: f.Id, Label: f.Label, Name: f.Name, IsRequired: !!f.Req || !!f.IsRequired, IsDropdown: true, AutoRefresh: true, [kind]: owner,
    SelectedDropdown: [{ FieldId: value, FieldName: label }], "FieldMapping::Property": [pr] };
  blob[pr] = { Id: pr, Kind: "Property", FieldMapping: fm, Type: "Value", Value: [value], Name: f.Name };
  return fm;
}

if (PHASE === "bind") {
  const S = st.skeleton?.schemas;
  if (!S) { out.error = "run `skeleton --apply` first"; done(1); }
  const blob = await getDraft();
  const tf = (S[T].fields || []).find((f) => f.Name === "form_id");
  const a2f = (S[A2].fields || []).find((f) => f.Name === "form_id");
  const a1bt = (S[A1].fields || []).find((f) => f.Name === "BodyType") || { Id: "Field_htDKY9uKu8", Name: "BodyType", Label: "Body type", Type: "String", Req: true };
  if (!tf || !a2f) { out.error = `selector fields not in the schema (trigger form_id ${!!tf}, action2 form_id ${!!a2f})`; done(1); }
  dropMappings(blob, "Trigger", T); dropMappings(blob, "Action", A1); dropMappings(blob, "Action", A2);
  blob[T]["Trigger::FieldMapping"] = [selector(blob, "Trigger", T, tf, OUTBOX[0], OUTBOX[1])];
  const USER = { _id: "Us000000000", Name: "Sample", Kind: "User" };
  blob[T].Output = { _id: "SampleInstance001", Name: "Sample", _created_by: USER, _modified_by: USER, _created_at: "2024-01-01T00:00:00-00:00", _modified_at: "2024-01-01T00:00:00-00:00", _status: "Sample",
    Mail_Key: "Text data", Event_Code: "Text data", Audience: "Text data", To_Emails: "Text data", Subject: "Text data", Body_Text: "Text data", Link_Url: "Text data", Case_Code: "Text data", Related_Key: "Text data", Sent_Status: "Text data", Attempt_No: 0 };
  blob[A1]["Action::FieldMapping"] = [selector(blob, "Action", A1, a1bt, "RichText", "Rich text")];
  blob[A2]["Action::FieldMapping"] = [selector(blob, "Action", A2, a2f, OUTBOX[0], OUTBOX[1])];
  if (!APPLY) { out.mappings = Object.values(blob).filter((e) => e?.Kind === "FieldMapping").map((e) => `${e.Trigger || e.Action}.${e.Name}`); done(0); }
  const pd = await call("PUT", `/metadata/2/${A}/integration/${st.id}/draft`, blob);
  out.put = { status: pd.status, body: pd.status >= 300 ? JSON.stringify(pd.body).slice(0, 500) : undefined };
  if (pd.status >= 300) done(1);
  for (const id of [A1, A2]) {
    const r = await call("GET", `/integration/2/${A}/${st.id}/action/${id}/fields`);
    out[`schema_${id}`] = { status: r.status, fields: Array.isArray(r.body) ? r.body.map((f) => ({ Id: f.Id, Name: f.Name, Label: f.Label, Type: f.Type, Req: f.IsRequired, DD: f.IsDropdown })) : JSON.stringify(r.body).slice(0, 300) };
  }
  st.bind = { ok: true, schemas: { [A1]: out[`schema_${A1}`], [A2]: out[`schema_${A2}`] } }; saveState();
  done(0);
}

if (PHASE === "map") {
  const S = st.bind?.schemas;
  if (!S) { out.error = "run `bind --apply` first"; done(1); }
  const blob = await getDraft();
  const MAP = {
    [A1]: { keep: ["BodyType"], set: { To: { src: "To_Emails" }, Subject: { src: "Subject" }, Body: { src: "Body_Text" } } },
    [A2]: { keep: ["form_id"], set: { instance_id: { src: "_id" }, Sent_Status: { value: "Sent" } } },
  };
  out.mapped = {};
  for (const [aid, m] of Object.entries(MAP)) {
    const keep = dropMappings(blob, "Action", aid, m.keep);
    const list = [...keep];
    const fields = (S[aid].fields || []).filter((f) => !m.keep.includes(f.Name));
    for (const f of fields) {
      const fm = nid("FieldMapping");
      blob[fm] = { Id: fm, Kind: "FieldMapping", Type: f.Type || "String", FieldId: f.Id, Label: f.Label, Name: f.Name, IsRequired: !!f.Req, Action: aid };
      const b = m.set[f.Name];
      if (b) {
        const pr = nid("Property"); blob[fm]["FieldMapping::Property"] = [pr];
        blob[pr] = b.value !== undefined ? { Id: pr, Kind: "Property", FieldMapping: fm, Type: "Value", Value: [b.value], Name: f.Name } : { Id: pr, Kind: "Property", FieldMapping: fm, Type: "Field", Field: `context.${T}.${b.src}`, Name: f.Name };
        (out.mapped[aid] = out.mapped[aid] || []).push(`${f.Name} ← ${b.value !== undefined ? JSON.stringify(b.value) : b.src}`);
      }
      list.push(fm);
    }
    const missing = Object.keys(m.set).filter((k) => !fields.some((f) => f.Name === k));
    if (missing.length) { out.error = `${aid}: fields not in the resolved schema: ${missing.join(", ")}`; done(1); }
    blob[aid]["Action::FieldMapping"] = list;
  }
  if (!APPLY) done(0);
  const pd = await call("PUT", `/metadata/2/${A}/integration/${st.id}/draft`, blob);
  out.put = { status: pd.status, body: pd.status >= 300 ? JSON.stringify(pd.body).slice(0, 500) : undefined };
  if (pd.status >= 300) done(1);
  const pub = await call("POST", `/metadata/2/${A}/integration/${st.id}/publish`, {});
  out.publish = { status: pub.status, body: pub.status >= 300 ? JSON.stringify(pub.body).slice(0, 500) : undefined };
  const back = await getDraft();
  const kinds = {}; for (const v of Object.values(back)) if (v?.Kind) kinds[v.Kind] = (kinds[v.Kind] || 0) + 1;
  out.readBack = { publishedAt: back.PublishedAt, kinds, bound: Object.values(back).filter((v) => v?.Kind === "Property" && v.FieldMapping).map((p) => `${back[p.FieldMapping]?.Action || back[p.FieldMapping]?.Trigger}.${p.Name}=${p.Type === "Value" ? JSON.stringify(p.Value) : p.Field}`) };
  const l = await call("GET", `/flow/2/${A}/integration/?_application_id=CIQ_Digital_A00&page_number=1&page_size=50`);
  const row = (Array.isArray(l.body) ? l.body : l.body?.Data || []).find((x) => x._id === st.id);
  out.listed = row ? { Status: row.Status, IsActive: row.IsActive, Connectors: row.Connectors } : null;
  st.map = { ok: pub.status < 300, publishedAt: back.PublishedAt, isActive: row?.IsActive }; saveState();
  done(pub.status < 300 ? 0 : 1);
}
