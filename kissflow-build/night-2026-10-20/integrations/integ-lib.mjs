// Shared helpers for building the v6 hand-off integrations over REST (plan v6 §4; recipe of ciq-digital/SPIKES.md, 7 Oct).
// Connections are referenced only: the Kissflow Process / Dataform connections whose keys Kissflow minted itself
// (no credential is ever sent or stored by these scripts). Every draft is backed up before a PUT; every write is read back.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { writer } from "../../lib/meta.mjs";

const here = (f) => fileURLToPath(new URL(f, import.meta.url));
export const w = writer(here("./integration-requests.jsonl"));
export const A = w.acc;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Paced call; stops on a rate limit or a non-JSON (HTML) answer, as both sessions agreed. */
export async function call(method, path, body) {
  await sleep(1300);
  const r = await w.call(method, path, body);
  if (r.status === 429 || (typeof r.body === "string" && /<html/i.test(r.body))) throw new Error(`stopped on ${r.status} (rate limit or HTML answer): wait 20 minutes`);
  return r;
}

const STATE = here("./state.json");
export const load = () => (existsSync(STATE) ? JSON.parse(readFileSync(STATE, "utf8")) : { integrations: {} });
export const save = (s) => writeFileSync(STATE, JSON.stringify(s, null, 1));

export function backup(id, blob, tag) {
  mkdirSync(here("./backups"), { recursive: true });
  const f = here(`./backups/${id}.${tag}.${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  writeFileSync(f, JSON.stringify(blob, null, 1));
  return f;
}

export const getDraft = async (id) => (await call("GET", `/metadata/2/${A}/integration/${id}/draft`)).body;
export async function putDraft(id, blob) {
  await sleep(1300);
  return w.putDraft("integration", id, blob);
}
export const publish = async (id) => { await sleep(1300); return w.publish("integration", id); };
export const fieldsOf = async (id, seg, eid) => call("GET", `/integration/2/${A}/${id}/${seg}/${eid}/fields`);

export const CONNECTIONS = {
  process: { _id: "CnEKHrHqXRKB", Name: "CIQ ZZ Spike Kissflow Process connection" },
  dataform: { _id: "CnEKHrH5GzkY", Name: "CIQ ZZ Spike Kissflow Dataform connection" },
};
export const CONNECTORS = {
  process: { _id: "ComaBsL8ZTSMM", Name: "Kissflow Process", Version: "3.7.6" },
  dataform: { _id: "Co4mIEiAdtSb", Name: "Kissflow Dataform", Version: "1.5.4" },
  webhook: { _id: "Coowt2xE4WH9S", Name: "Webhooks by Kissflow", Version: "1.0.0" },
  email: { _id: "CoOj46v9fVh37", Name: "Email", Version: "1.0.6" },
  control: { _id: "Control", Name: "Control", Version: "2.0.0" },
  script: { _id: "Co4m9q4JUbkV", Name: "Run script", Version: "1.0.0" },
  scheduler: { _id: "Co9f6DM76TrrP", Name: "Scheduler by Kissflow", Version: "1.0.7" },
};

let logos = null;
export async function connectorRef(k, extra) {
  if (!logos) {
    const subs = (await call("GET", `/connector/2/${A}/subscription?page_number=1&page_size=200`)).body;
    logos = Object.fromEntries((Array.isArray(subs) ? subs : subs?.Data || []).map((c) => [c._id, c.Logo]));
  }
  const c = CONNECTORS[k];
  return { _id: c._id, Name: c.Name, Version: c.Version, Logo: logos[c._id], Status: "Published", WebsiteURL: "https://kissflow.com", ...extra };
}

/** Kinds per entity, the trigger and actions with their connector entity and the bound properties: for read-backs. */
export function summary(b) {
  const kinds = {};
  for (const v of Object.values(b)) if (v?.Kind) kinds[v.Kind] = (kinds[v.Kind] || 0) + 1;
  const root = b[b.Root] || {};
  const ents = [...(root["Integration::Trigger"] || []), ...(root["Integration::Action"] || [])].map((id) => {
    const e = b[id] || {};
    const props = (e[`${e.Kind}::FieldMapping`] || []).flatMap((fm) => (b[fm]?.["FieldMapping::Property"] || []).map((p) => b[p]).filter(Boolean)
      .map((p) => `${b[fm].Name}=${p.Type === "Value" ? JSON.stringify(p.Value) : p.Field}`));
    return { id, kind: e.Kind, entity: e.Connector?.TriggerId || e.Connector?.ActionId, conn: e.Connection?._id, props };
  });
  return { kinds, ents };
}

// ---- mapping helpers, in the shape the builder itself writes (read back from the builder, 20 Oct) ----
let seq = 0;
export const newId = (p) => `${p}_${Date.now().toString(36).slice(-5)}${(++seq).toString(36)}`;
const SELECTORS = new Set(["process_id", "form_id", "step_id"]);
const sourceProcessProperty = (blob, triggerId) => {
  const fm = (blob[triggerId]?.["Trigger::FieldMapping"] || []).find((x) => blob[x]?.Name === "process_id" || blob[x]?.Name === "form_id");
  return fm ? blob[fm]["FieldMapping::Property"]?.[0] : undefined;
};
/** A Property for one mapped value: {value} literal, {trigger: field} the trigger item's field, {step, path} an earlier step's output. */
function property(blob, fmId, name, src, consumerId, triggerId) {
  const pr = newId("Property");
  if (src.value !== undefined) blob[pr] = { Id: pr, Kind: "Property", FieldMapping: fmId, Type: "Value", Value: [src.value], Name: name };
  else {
    const from = src.trigger !== undefined ? triggerId : src.step;
    const path = src.trigger !== undefined ? src.trigger : src.path;
    blob[pr] = { Id: pr, Kind: "Property", FieldMapping: fmId, Type: "Field", Field: `context.${from}.${path}`, Name: name };
    const spp = src.trigger !== undefined ? sourceProcessProperty(blob, triggerId) : undefined;
    if (spp) {
      const ref = newId("Reference");
      blob[ref] = { Id: ref, Kind: "Reference", Type: "Value", StepId: consumerId, SourceProperty: spp, FieldId: path, Property: pr };
      blob[pr]["Property::Reference"] = [ref];
    }
  }
  return pr;
}
function dropMapping(blob, fmId) {
  const f = blob[fmId];
  if (!f) return;
  for (const c of f["FieldMapping::FieldMapping"] || []) dropMapping(blob, c);
  for (const p of f["FieldMapping::Property"] || []) { for (const r of blob[p]?.["Property::Reference"] || []) delete blob[r]; delete blob[p]; }
  delete blob[fmId];
}
/**
 * Replaces an action's field mappings (its selectors are kept) with one FieldMapping per schema field, the golden shape of
 * 7 Oct; `map` binds some of them by field name. Fields named in `skip` keep whatever mapping they already have.
 */
export function mapAction(blob, actionId, schema, map, triggerId, skip = []) {
  const key = "Action::FieldMapping";
  const old = blob[actionId][key] || [];
  const kept = old.filter((x) => blob[x] && (SELECTORS.has(blob[x].Name) || skip.includes(blob[x].Name)));
  for (const x of old) if (!kept.includes(x)) dropMapping(blob, x);
  const keptNames = new Set(kept.map((x) => blob[x].Name));
  const list = [...kept];
  for (const f of schema) {
    if (SELECTORS.has(f.Name) || keptNames.has(f.Name) || f.Kind !== "Field" || !f.Name) continue;
    const fm = newId("FieldMapping");
    blob[fm] = { Id: fm, Kind: "FieldMapping", Type: f.Type || "String", FieldId: f.Id, Label: f.Label, Name: f.Name, IsRequired: !!f.IsRequired, Action: actionId };
    if (f.IsMultiValue) blob[fm].IsMultiValue = true;
    const src = map[f.Name];
    if (src) blob[fm]["FieldMapping::Property"] = [property(blob, fm, f.Name, src, actionId, triggerId)];
    list.push(fm);
  }
  const missing = Object.keys(map).filter((n) => !schema.some((f) => f.Name === n));
  blob[actionId][key] = list;
  return missing;
}
/** Run script: sets its Input data keys (an Object mapping with one child per key), keeping the js_code mapping. */
export function setScriptInputs(blob, actionId, inputs, triggerId) {
  const fms = blob[actionId]["Action::FieldMapping"] || [];
  let parent = fms.find((x) => blob[x]?.Name === "input_fields");
  if (!parent) {
    parent = newId("FieldMapping");
    blob[parent] = { Id: parent, Kind: "FieldMapping", Type: "Object", FieldId: "InputFields", Label: "Input data", Name: "input_fields", IsDropdown: false, IsPaginated: false, HelpText: "Specify the input data that should be provided to your code", AutoRefresh: false, Action: actionId };
    blob[actionId]["Action::FieldMapping"] = [parent, ...fms];
  }
  for (const c of blob[parent]["FieldMapping::FieldMapping"] || []) dropMapping(blob, c);
  blob[parent]["FieldMapping::FieldMapping"] = Object.entries(inputs).map(([name, src]) => {
    const fm = newId("FieldMapping");
    blob[fm] = { Id: fm, Kind: "FieldMapping", Type: "String", IsVisible: true, FieldMapping: parent, Name: name, Label: name };
    blob[fm]["FieldMapping::Property"] = [property(blob, fm, name, src, actionId, triggerId)];
    return fm;
  });
}
/** Runs the builder's per-step Test and stores its output on the step, as the builder does (Output + IsTested). */
export async function testStep(id, seg, eid, app) {
  const t = await call("POST", `/integration/2/${A}/${id}/${seg}/${eid}/test?_application_id=${app}`, {});
  return t;
}

/** A dropdown selector (process_id, step_id, form_id …) bound to one value, in the builder's shape. */
export function setSelector(blob, entityId, kind, schemaField, valueId, valueName) {
  if (!schemaField) throw new Error(`no selector field on ${entityId}`);
  for (const k of Object.keys(blob)) {
    const e = blob[k];
    if (e?.Kind === "FieldMapping" && e[kind] === entityId && e.Name === schemaField.Name) { for (const p of e["FieldMapping::Property"] || []) delete blob[p]; delete blob[k]; }
  }
  const fm = newId("FieldMapping"), pr = newId("Property");
  blob[fm] = { Id: fm, Kind: "FieldMapping", Type: schemaField.Type || "String", FieldId: schemaField.Id, Label: schemaField.Label, Name: schemaField.Name, IsRequired: !!schemaField.IsRequired, IsDropdown: true, AutoRefresh: true, [kind]: entityId,
    SelectedDropdown: [{ FieldId: valueId, FieldName: valueName, IsSubArray: false }], "FieldMapping::Property": [pr] };
  blob[pr] = { Id: pr, Kind: "Property", FieldMapping: fm, Type: "Value", Value: [valueId], Name: schemaField.Name };
  const key = `${kind}::FieldMapping`;
  blob[entityId][key] = [...(blob[entityId][key] || []).filter((x) => blob[x] && x !== fm), fm];
}
