// Builds a screen-started hand-off integration (plan v6 §4.1 pattern) from a spec in specs.mjs:
//   Webhook trigger {ids} → steps: search (the source item, by an id in the payload) · script (pick the exact item, check
//   it, shape the values) · create / update / approve / complete (Kissflow Process). Write targets come from scripts that
//   read Kissflow, never straight from the payload.
// Stages:  node webhook-integ.mjs <KEY> build      shell (if new) + trigger + steps + selectors + mappings (idempotent)
//          node webhook-integ.mjs <KEY> test [n]   per-step Tests (from step n, default 1) on the captured webhook sample;
//                                                  stores each passed output as the builder does; stops at the first failure
//          node webhook-integ.mjs <KEY> publish    publish + read back
// The webhook URL and its sample are captured once in the builder (Trigger → Output → Test trigger), see RECIPE.md.
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { call, A, load, save, backup, getDraft, putDraft, fieldsOf, CONNECTIONS, connectorRef, summary, mapAction, setScriptInputs, setSelector, newId, publish } from "./integ-lib.mjs";
import { SPECS } from "./specs.mjs";

const here = (f) => fileURLToPath(new URL(f, import.meta.url));
const [KEY, stage, fromArg] = process.argv.slice(2);
const spec = SPECS[KEY];
if (!spec) throw new Error(`no spec ${KEY}; have ${Object.keys(SPECS).join(", ")}`);
const s = load();
const st = (s.integrations[KEY] ||= {});
if (spec.id && !st.id) st.id = spec.id;
const T = `Trigger_${KEY}_webhook`;
const sid = (i) => `Action_${KEY}_${i + 1}_${spec.steps[i].tag}`;
const byTag = Object.fromEntries(spec.steps.map((x, i) => [x.tag, sid(i)]));
const KINDS = {
  search: { connector: "process", ActionId: "Action_Kh4Jb2AoG", ActionName: "Search an item ", Type: "Search", Name: "Search an item" },
  script: { connector: "script", ActionId: "RunJSCode", ActionName: "Run JavaScript", Type: "Create", Name: "Run JavaScript" },
  update: { connector: "process", ActionId: "UpdateAnItem", ActionName: "Update an item", Type: "Update", Name: "Update an item" },
  create: { connector: "process", ActionId: "CreateAndSubmitItem", ActionName: "Create and submit a new item", Type: "Create", Name: "Create and submit a new item" },
  complete: { connector: "process", ActionId: "Action_admin_skip_complete", ActionName: "Skip and complete", Type: "Update", Name: "Skip and complete" },
  approve: { connector: "process", ActionId: "Action_-SkflzwKj", ActionName: "Approve an item", Type: "Update", Name: "Approve an item" },
};
/** {trigger:f} | {step:tag, path} | {rows:tag} | {value} → the source shape mapAction / setScriptInputs take. */
const resolve = (src) => {
  if (src.rows) return { step: byTag[src.rows], path: "Data" };
  if (src.step) { if (!byTag[src.step]) throw new Error(`unknown step tag ${src.step}`); return { step: byTag[src.step], path: src.path }; }
  return src;
};

async function ensureShell() {
  if (st.id) return;
  const list = (await call("GET", `/flow/2/${A}/integration/?_application_id=${spec.app}&page_number=1&page_size=100`)).body;
  const dupe = (Array.isArray(list) ? list : []).find((x) => x.Name === spec.name);
  if (dupe) { st.id = dupe._id; save(s); console.log("found existing", dupe._id); return; }
  const r = await call("POST", `/flow/2/${A}/integration/?_application_id=${spec.app}`, { Name: spec.name, Description: spec.desc });
  console.log("create", r.status, JSON.stringify(r.body).slice(0, 300));
  if (!(r.status < 300 && r.body?._id)) throw new Error("shell not created");
  st.id = r.body._id; save(s);
}

function dropOrphans(b, alive) {
  const dropFm = (k) => { const v = b[k]; if (!v) return; for (const c of v["FieldMapping::FieldMapping"] || []) dropFm(c); for (const p of v["FieldMapping::Property"] || []) delete b[p]; delete b[k]; };
  for (const [k, v] of Object.entries(b)) if (v?.Kind === "FieldMapping" && (v.Action || v.Trigger) && !alive.has(v.Action || v.Trigger)) dropFm(k);
  for (const [k, v] of Object.entries(b)) if (v?.Kind === "Reference" && ((v.Trigger && !alive.has(v.Trigger)) || (v.Action && !alive.has(v.Action)) || (v.Property && !b[v.Property]) || (v.StepId && !alive.has(v.StepId)))) delete b[k];
  for (const [k, v] of Object.entries(b)) if (v?.Kind === "WebhookAcknowledgement" && v.Trigger && !alive.has(v.Trigger)) delete b[k];
  for (const [k, v] of Object.entries(b)) if (v?.Kind === "WebhookResponse" && v.WebhookAcknowledgement && !b[v.WebhookAcknowledgement]) delete b[k];
  // each live step's own reference lists keep only references that still exist
  for (const id of alive) for (const key of ["Trigger::Reference", "Action::Reference"]) if (Array.isArray(b[id]?.[key])) b[id][key] = b[id][key].filter((r) => b[r]);
}

/** What a rebuild would overwrite: the steps, their connector entities and every mapping and script, without test outputs. */
function fingerprint(b) {
  const sum = summary(b);
  const code = Object.values(b).filter((v) => v?.Kind === "Property" && v.Type === "Code").map((v) => v.Code).sort();
  const scriptInputs = Object.values(b).filter((v) => v?.Kind === "FieldMapping" && v.FieldMapping && b[v.FieldMapping]?.Name === "input_fields")
    .map((v) => `${v.Name}=${(v["FieldMapping::Property"] || []).map((p) => b[p]?.Field ?? JSON.stringify(b[p]?.Value)).join(",")}`).sort();
  const lists = Object.values(b).filter((v) => v?.Kind === "FieldMapping" && v.IsMultiValue && v.Type === "Object")
    .map((v) => `${v.Action}.${v.Name}=${(v["FieldMapping::Property"] || []).map((p) => b[p]?.Field).join(",")}`).sort();
  return createHash("sha256").update(JSON.stringify({ ents: sum.ents.map((e) => [e.id, e.entity, e.conn, [...e.props].sort()]), code, scriptInputs, lists })).digest("hex");
}

if (stage === "build") {
  await ensureShell();
  const live = await getDraft(st.id);
  backup(st.id, live, "before-build");
  // never rebuild over changes made in the builder since the last build (Thomas's manual changes are kept)
  if (st.built && fingerprint(live) !== st.built && !process.argv.includes("--force")) {
    console.log(`REFUSED: ${st.id} changed in the builder since the last build (fingerprint differs). Review the draft (backup written), carry the change into specs.mjs, then rerun with --force.`);
    process.exit(2);
  }
  const b = { ...live };
  const root = b.Root;
  const steps = spec.steps.map((_, i) => sid(i));
  const oldTriggers = b[root]["Integration::Trigger"] || [];
  if (!(b[T]?.Connector?.TriggerId === "WebhookTrigger")) {
    b[T] = { Id: T, Kind: "Trigger", Type: "Create", Name: "Catch a webhook (POST)", IsInternalAuth: true, Connection: {}, Integration: root,
      Connector: await connectorRef("webhook", { TriggerId: "WebhookTrigger", TriggerName: "Catch a webhook (POST)" }) };
  }
  for (const [i, x] of spec.steps.entries()) {
    const k = KINDS[x.kind], id = sid(i);
    const conn = k.connector === "process" ? CONNECTIONS.process : {};
    if (!b[id]) b[id] = { Id: id, Kind: "Action", Integration: root, "Action::FieldMapping": [] };
    // the kind's own values on every build; a rebuilt step must be tested again, so its old test output goes
    const { Output: _o, IsTested: _t, ...rest } = b[id];
    b[id] = { ...rest, Type: k.Type, Name: k.Name, IsInternalAuth: k.connector !== "process", Connection: conn, Connector: await connectorRef(k.connector, { ActionId: k.ActionId, ActionName: k.ActionName }) };
  }
  const droppedActions = (b[root]["Integration::Action"] || []).filter((x) => !steps.includes(x));
  const droppedTriggers = oldTriggers.filter((x) => x !== T);
  b[root] = { ...b[root], Description: spec.desc, "Integration::Trigger": [T], "Integration::Action": steps };
  for (const x of [...droppedActions, ...droppedTriggers]) delete b[x];
  dropOrphans(b, new Set([root, T, ...steps]));
  const pd1 = await putDraft(st.id, b);
  console.log("PUT steps", pd1.status, droppedActions.length + droppedTriggers.length ? `(replaced ${[...droppedTriggers, ...droppedActions].join(", ")})` : "", pd1.status >= 300 ? JSON.stringify(pd1.body).slice(0, 300) : "");
  if (pd1.status >= 300) process.exit(1);

  const b2 = await getDraft(st.id);
  for (const [i, x] of spec.steps.entries()) {
    if (x.kind === "script") continue;
    const sch = (await fieldsOf(st.id, "action", sid(i))).body;
    setSelector(b2, sid(i), "Action", sch.find((f) => f.Name === "process_id"), x.process, x.label);
  }
  const pd2 = await putDraft(st.id, b2);
  console.log("PUT selectors", pd2.status);
  if (pd2.status >= 300) process.exit(1);

  const b3 = await getDraft(st.id);
  for (const [i, x] of spec.steps.entries()) {
    const id = sid(i);
    if (x.kind === "script") {
      setScriptInputs(b3, id, Object.fromEntries(Object.entries(x.inputs).map(([k, v]) => [k, resolve(v)])), T);
      let codeFm = (b3[id]["Action::FieldMapping"] || []).find((y) => b3[y]?.Name === "js_code");
      if (!codeFm) {
        codeFm = newId("FieldMapping"); const pr = newId("Property");
        b3[codeFm] = { Id: codeFm, Kind: "FieldMapping", Type: "Code", FieldId: "JSCode", Label: "JavaScript code", Name: "js_code", IsRequired: true, IsDropdown: false, IsPaginated: false, AutoRefresh: false, CodeLanguage: "javascript", Action: id, "FieldMapping::Property": [pr] };
        b3[pr] = { Id: pr, Kind: "Property", Type: "Code", Name: "js_code", Code: "", FieldMapping: codeFm };
        b3[id]["Action::FieldMapping"] = [...b3[id]["Action::FieldMapping"], codeFm];
      }
      const cp = b3[codeFm]["FieldMapping::Property"][0];
      b3[cp] = { ...b3[cp], Code: readFileSync(here(x.file), "utf8") };
      continue;
    }
    const schema = (await fieldsOf(st.id, "action", id)).body;
    const map = x.kind === "search" ? { lookupValue: x.lookup } : x.map;
    const flat = Object.fromEntries(Object.entries(map).filter(([, v]) => !v.list).map(([k, v]) => [k, resolve(v)]));
    const missing = mapAction(b3, id, schema, flat, T);
    if (missing.length) console.log(`NOT in the ${x.process} action schema:`, missing.join(", "));
    for (const [field, v] of Object.entries(map).filter(([, v]) => v.list)) {
      const fm = (b3[id]["Action::FieldMapping"] || []).find((y) => b3[y]?.Name === field);
      if (!fm) { console.log("no list field", field); continue; }
      const src = resolve(v.list);
      const pr = newId("Property"), ch = newId("FieldMapping"), cpr = newId("Property");
      b3[fm] = { ...b3[fm], Type: "Object", IsMultiValue: true, "FieldMapping::Property": [pr], "FieldMapping::FieldMapping": [ch] };
      b3[pr] = { Id: pr, Kind: "Property", FieldMapping: fm, Type: "Field", Field: `context.${src.step}.${src.path}`, Name: field };
      b3[ch] = { Id: ch, Kind: "FieldMapping", Type: "String", IsVisible: true, FieldMapping: fm, Name: "_id", Label: "_id", "FieldMapping::Property": [cpr] };
      b3[cpr] = { Id: cpr, Kind: "Property", FieldMapping: ch, Type: "Field", Field: `context.${src.step}.${src.path}._id`, Name: "_id" };
    }
  }
  const pd3 = await putDraft(st.id, b3);
  console.log("PUT mappings", pd3.status, pd3.status >= 300 ? JSON.stringify(pd3.body).slice(0, 300) : "");
  const built = await getDraft(st.id);
  st.built = fingerprint(built);
  save(s);
  const dangling = Object.entries(built).filter(([, v]) => v?.Kind === "Reference" && ((v.Action && !built[v.Action]) || (v.Trigger && !built[v.Trigger]) || (v.StepId && !built[v.StepId]) || (v.Property && !built[v.Property]))).map(([k]) => k);
  console.log(dangling.length ? `DANGLING references: ${dangling.join(", ")}` : "no dangling references");
  const back = summary(built);
  for (const e of back.ents) console.log(" ", e.id, e.entity, `${e.props.length} props:`, e.props.filter((p) => !/=undefined$/.test(p)).join(" | ").slice(0, 700));
}

if (stage === "test") {
  const from = Math.max(1, Number(fromArg) || 1) - 1;
  for (let i = from; i < spec.steps.length; i++) {
    const eid = sid(i);
    const t = await call("POST", `/integration/2/${A}/${st.id}/action/${eid}/test?_application_id=${spec.app}`, {});
    const ok = t.status < 300 && t.body && typeof t.body === "object" && t.body.status !== "error";
    console.log(ok ? "PASS" : "FAIL", `${i + 1}.`, eid, t.status, JSON.stringify(t.body).slice(0, 600));
    if (!ok) { process.exitCode = 1; break; }
    const b = await getDraft(st.id);
    b[eid] = { ...b[eid], Output: t.body, IsTested: true };
    const r = await putDraft(st.id, b);
    if (r.status >= 300) { console.log("store failed", r.status); process.exitCode = 1; break; }
  }
}

if (stage === "publish") {
  const p = await publish(st.id);
  const l = (await call("GET", `/flow/2/${A}/integration/?_application_id=${spec.app}&page_number=1&page_size=100`)).body.find((x) => x._id === st.id);
  console.log("publish", p.status, "| listed", JSON.stringify({ Status: l?.Status, IsActive: l?.IsActive, Connectors: (l?.Connectors || []).map((c) => `${c.Name}:${c.Entities.map((e) => e._id).join("+")}`) }));
}
