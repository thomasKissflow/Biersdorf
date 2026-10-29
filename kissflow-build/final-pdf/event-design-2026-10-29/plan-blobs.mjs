// Design draft (29 Oct, scratch, PURE: no network, no .env): the draft-blob changes for the two final-PDF integrations,
// in the shapes RECIPE.md / integ-lib.mjs write (read back from the builder on 20 Oct). The real build script would import
// integ-lib (getDraft, putDraft, fieldsOf, testStep) and call these on the LIVE draft it just read.

export const I1 = {
  id: "CIQ_Case_Item_exits_final_step_fin_A00", app: "CIQ_Digital_A00",
  trigger: "Trigger_CDWGsX1igS", http: "Action_E_z4YCW-sG",
};
export const I2 = {
  id: "CIQ_Case_Send_Final_Release_to_RMM_A00", app: "CIQ_Digital_A00",
  trigger: "Trigger_CDWGsX1igS", search: "Action_sJ0xxVDOj4", users: "Action_t1WholtrmH", mail: "Action_E_z4YCW-sG",
  pick: "Action_RMM_pick", text: "Action_RMM_mail_text", rmmRole: "RoEKl83f9jPF",
};
// 27 Oct convention (HANDOVER-2026-10-26.md): app integration → app process = "Thomas Access Keys - Trigger".
export const CONN_APP_PROCESS = { _id: "CnEPk_z1eYLu", Name: "Kissflow Process - Thomas Access Keys - Trigger" };
// Run script connector entity, exactly as on request.changed's Run JavaScript steps (backup 27 Oct)
export const RUN_SCRIPT = { _id: "Co4m9q4JUbkV", Name: "Run script", Version: "1.0.0", Logo: { small: { key: "Account001/Connectors/Co4m9q4JUbkV/1.0.0/Logo/photos/24x24.png" }, medium: { key: "Account001/Connectors/Co4m9q4JUbkV/1.0.0/Logo/photos/128x128.png" }, original: { key: "Account001/Connectors/Co4m9q4JUbkV/1.0.0/Logo/Runscript.png" } }, Status: "Published", WebsiteURL: "https://kissflow.com", ActionId: "RunJSCode", ActionName: "Run JavaScript" };

let seq = 0;
const nid = (p) => `${p}_fp${(++seq).toString(36).padStart(3, "0")}`;

/** webhook-integ.mjs dropOrphans, plus References whose SourceProperty / FieldMapping is gone (both skeletons carry 279). */
export function dropOrphans(b) {
  const root = b[b.Root];
  const alive = new Set([b.Root, ...(root["Integration::Trigger"] || []), ...(root["Integration::Action"] || [])]);
  const dropFm = (k) => { const v = b[k]; if (!v) return; for (const c of v["FieldMapping::FieldMapping"] || []) dropFm(c); for (const p of v["FieldMapping::Property"] || []) delete b[p]; delete b[k]; };
  for (const [k, v] of Object.entries(b)) if (v?.Kind === "FieldMapping" && (v.Action || v.Trigger) && !alive.has(v.Action || v.Trigger)) dropFm(k);
  let n = 0;
  for (const [k, v] of Object.entries(b)) if (v?.Kind === "Reference" && ((v.Trigger && !alive.has(v.Trigger)) || (v.Action && !alive.has(v.Action)) || (v.StepId && !alive.has(v.StepId))
    || (v.Property && !b[v.Property]) || (v.SourceProperty && !b[v.SourceProperty]) || (v.FieldMapping && !b[v.FieldMapping]))) { delete b[k]; n++; }
  for (const id of alive) for (const key of ["Trigger::Reference", "Action::Reference"]) if (Array.isArray(b[id]?.[key])) b[id][key] = b[id][key].filter((r) => b[r]);
  return n;
}

/** The trigger's process_id Property (the SourceProperty of a Process-trigger field Reference), or undefined (webhook). */
const sourceProcessProperty = (b, triggerId) => {
  const fm = (b[triggerId]?.["Trigger::FieldMapping"] || []).find((x) => b[x]?.Name === "process_id");
  return fm ? b[fm]["FieldMapping::Property"]?.[0] : undefined;
};
/** A Property on fmId: {value} literal | {trigger: field} | {step, path}; a Process-trigger field also gets its Reference. */
export function prop(b, fmId, name, src, consumerId, triggerId) {
  const pr = nid("Property");
  if (src.value !== undefined) { b[pr] = { Id: pr, Kind: "Property", FieldMapping: fmId, Type: "Value", Value: [src.value], Name: name }; return pr; }
  const from = src.trigger !== undefined ? triggerId : src.step, path = src.trigger !== undefined ? src.trigger : src.path;
  b[pr] = { Id: pr, Kind: "Property", FieldMapping: fmId, Type: "Field", Field: `context.${from}.${path}`, Name: name };
  const spp = src.trigger !== undefined ? sourceProcessProperty(b, triggerId) : undefined;
  if (spp) {
    const ref = nid("Reference");
    b[ref] = { Id: ref, Kind: "Reference", Type: "Value", StepId: consumerId, SourceProperty: spp, FieldId: path, Property: pr };
    b[pr]["Property::Reference"] = [ref];
  }
  return pr;
}
/** One flat FieldMapping per schema field (keeps the ones named in `keep`), binding `map` by Name: mapAction's golden shape. */
export function mapFlat(b, actionId, schema, map, triggerId, keep = []) {
  const key = "Action::FieldMapping", old = b[actionId][key] || [];
  const kept = old.filter((x) => b[x] && keep.includes(b[x].Name));
  for (const x of old) if (!kept.includes(x)) { const f = b[x]; if (!f) continue; for (const c of f["FieldMapping::FieldMapping"] || []) delete b[c]; for (const p of f["FieldMapping::Property"] || []) { for (const r of b[p]?.["Property::Reference"] || []) delete b[r]; delete b[p]; } delete b[x]; }
  const list = [];
  for (const f of schema) {
    const k = kept.find((x) => b[x].Name === f.Name);
    if (k) { list.push(k); continue; }
    const fm = nid("FieldMapping");
    b[fm] = { Id: fm, Kind: "FieldMapping", Type: f.Type || "String", FieldId: f.Id, Label: f.Label, Name: f.Name, IsRequired: !!f.IsRequired, Action: actionId };
    if (f.IsMultiValue) b[fm].IsMultiValue = true;
    if (f.IsDropdown) Object.assign(b[fm], { IsDropdown: true, AutoRefresh: true }); // as setSelector / the builder write it
    if (map[f.Name]) {
      b[fm]["FieldMapping::Property"] = [prop(b, fm, f.Name, map[f.Name], actionId, triggerId)];
      if (f.IsDropdown && map[f.Name].value !== undefined) b[fm].SelectedDropdown = [{ FieldId: map[f.Name].value, FieldName: map[f.Name].label || map[f.Name].value, IsSubArray: false }];
    }
    list.push(fm);
  }
  b[actionId][key] = list;
  return Object.keys(map).filter((n) => !schema.some((f) => f.Name === n));
}
/** An Object FieldMapping with one String child per key (Run script input_fields; an HTTP key/value body). */
export function objectChildren(b, actionId, parentSpec, inputs, triggerId) {
  const fms = b[actionId]["Action::FieldMapping"] || [];
  let parent = fms.find((x) => b[x]?.Name === parentSpec.Name);
  if (!parent) { parent = nid("FieldMapping"); b[parent] = { Id: parent, Kind: "FieldMapping", Type: "Object", ...parentSpec, Action: actionId }; b[actionId]["Action::FieldMapping"] = [parent, ...fms]; }
  for (const c of b[parent]["FieldMapping::FieldMapping"] || []) { for (const p of b[c]?.["FieldMapping::Property"] || []) { for (const r of b[p]?.["Property::Reference"] || []) delete b[r]; delete b[p]; } delete b[c]; }
  b[parent]["FieldMapping::FieldMapping"] = Object.entries(inputs).map(([name, src]) => {
    const fm = nid("FieldMapping");
    b[fm] = { Id: fm, Kind: "FieldMapping", Type: "String", IsVisible: true, FieldMapping: parent, Name: name, Label: name };
    b[fm]["FieldMapping::Property"] = [prop(b, fm, name, src, actionId, triggerId)];
    return fm;
  });
  return parent;
}
/** A Run JavaScript step (inputs + code), new or re-used by id. */
export function scriptStep(b, id, name, inputs, code, triggerId) {
  const { Output: _o, IsTested: _t, ...rest } = b[id] || {};
  b[id] = { ...rest, Id: id, Kind: "Action", Integration: b.Root, Type: "Create", Name: name, IsInternalAuth: true, Connection: {}, Connector: { ...RUN_SCRIPT }, "Action::FieldMapping": rest["Action::FieldMapping"] || [] };
  objectChildren(b, id, { FieldId: "InputFields", Label: "Input data", Name: "input_fields", IsDropdown: false, IsPaginated: false, HelpText: "Specify the input data that should be provided to your code", AutoRefresh: false }, inputs, triggerId);
  let codeFm = b[id]["Action::FieldMapping"].find((x) => b[x]?.Name === "js_code");
  if (!codeFm) {
    codeFm = nid("FieldMapping"); const pr = nid("Property");
    b[codeFm] = { Id: codeFm, Kind: "FieldMapping", Type: "Code", FieldId: "JSCode", Label: "JavaScript code", Name: "js_code", IsRequired: true, IsDropdown: false, IsPaginated: false, AutoRefresh: false, CodeLanguage: "javascript", Action: id, "FieldMapping::Property": [pr] };
    b[pr] = { Id: pr, Kind: "Property", Type: "Code", Name: "js_code", Code: "", FieldMapping: codeFm };
    b[id]["Action::FieldMapping"].push(codeFm);
  }
  b[b[codeFm]["FieldMapping::Property"][0]].Code = code;
}
const untest = (b, id) => { if (b[id]) { delete b[id].Output; delete b[id].IsTested; } };

// ------------------------------------------------------------------------------------------------ integration 1
/**
 * Integration 1, after Thomas attached an HTTP "No authentication" connection (the fields route 404s without one) and
 * BEFORE he pastes the URL: body {caseItemId: trigger _id, caseCode: trigger Case_Code}. `schema` is the fields route's
 * answer after body_type is bound; `bodyType` the dropdown value chosen; `bodyField` the Name of the body field it adds.
 * The URL FieldMapping is written without a Property (Thomas pastes https://script.google.com/macros/s/…/exec?token=…).
 */
export function planI1(b, { schema, bodyType, bodyField }) {
  const n = dropOrphans(b);
  const map = { body_type: { value: bodyType } };
  const missing = mapFlat(b, I1.http, schema.filter((f) => f.Name !== bodyField), map, I1.trigger);
  const bf = schema.find((f) => f.Name === bodyField);
  if (!bf) throw new Error(`no body field ${bodyField} in the schema`);
  const body = { caseItemId: { trigger: "_id" }, caseCode: { trigger: "Case_Code" } };
  if (bf.Type === "Object") objectChildren(b, I1.http, { FieldId: bf.Id, Label: bf.Label, Name: bf.Name, IsRequired: !!bf.IsRequired }, body, I1.trigger);
  else throw new Error(`body field ${bodyField} is ${bf.Type}: a raw text body needs a Join of literal and field parts (shape unproven); pick a key/value body type`);
  untest(b, I1.http);
  return { orphansDropped: n, missing };
}

// ------------------------------------------------------------------------------------------------ integration 2
/** Integration 2: search → pick → users (Thomas's literal role mapping kept) → mail text → send, with the PDF attached. */
export function planI2(b, { searchSchema, mailSchema, pickCode, textCode, swapConnection = true, attachOn = "child" }) {
  const n = dropOrphans(b);
  const T = I2.trigger;
  // 1. Search an item: CIQ Case by the webhook's caseItemId
  if (swapConnection) b[I2.search] = { ...b[I2.search], Connection: { ...CONN_APP_PROCESS } };
  mapFlat(b, I2.search, searchSchema.filter((f) => f.Kind === "Field" && !f.IsDynamicField), { process_id: { value: "CIQ_Case_A00", label: "CIQ Case - CIQ Digital" }, lookupValue: { trigger: "caseItemId" } }, T);
  untest(b, I2.search);
  // 2. RMM pick case (new Run JavaScript)
  scriptStep(b, I2.pick, "RMM pick case", { caseItemId: { trigger: "caseItemId" }, seal: { trigger: "seal" }, rows: { step: I2.search, path: "Data" } }, pickCode, T);
  // 3. Get user data: Thomas's builder mapping (user_ids = the RMM role, fields = Email) is kept as it is; its stored
  //    output is the connector's sample ("Text data"), so it must be tested for real
  untest(b, I2.users);
  // 4. RMM mail text (new Run JavaScript)
  scriptStep(b, I2.text, "RMM mail text", { users: { step: I2.users, path: "Users" }, caseCode: { step: I2.pick, path: "caseCode" }, tradeName: { step: I2.pick, path: "tradeName" },
    supplier: { step: I2.pick, path: "supplier" }, ownerName: { step: I2.pick, path: "ownerName" }, fileName: { step: I2.pick, path: "fileName" }, seal: { step: I2.pick, path: "seal" } }, textCode, T);
  // 5. Send an email: flat fields re-mapped; the builder's Attachments parent + "Attachment" child are KEPT and bound
  const missing = mapFlat(b, I2.mail, mailSchema, {
    To: { step: I2.text, path: "To" }, Subject: { step: I2.text, path: "Subject" }, From: { value: "Beiersdorf | Kissflow" },
    BodyType: { value: "PlainText", label: "HTML" }, Body: { step: I2.text, path: "Body" },
  }, T, ["Attachments"]);
  const att = (b[I2.mail]["Action::FieldMapping"] || []).find((x) => b[x]?.Name === "Attachments");
  if (!att) throw new Error("no Attachments mapping on Send an email");
  const child = (b[att]["FieldMapping::FieldMapping"] || [])[0];
  const target = attachOn === "child" ? child : att;
  if (!target) throw new Error("the builder's Attachment child is missing");
  for (const p of b[target]["FieldMapping::Property"] || []) delete b[p];
  b[target]["FieldMapping::Property"] = [prop(b, target, b[target].Name, { step: I2.pick, path: "attachments" }, I2.mail, T)];
  untest(b, I2.mail);
  b[b.Root] = { ...b[b.Root], "Integration::Action": [I2.search, I2.pick, I2.users, I2.text, I2.mail] };
  return { orphansDropped: n, missing };
}

/** Read-back checks for any draft: every link resolves, no dangling Reference, step order. */
export function check(b) {
  const bad = [];
  for (const [k, v] of Object.entries(b)) {
    if (!v || typeof v !== "object" || !v.Kind) continue;
    if (v.Kind === "Property" && v.FieldMapping && !b[v.FieldMapping]) bad.push(`${k}: FieldMapping ${v.FieldMapping} missing`);
    if (v.Kind === "FieldMapping") {
      for (const p of v["FieldMapping::Property"] || []) if (!b[p]) bad.push(`${k}: Property ${p} missing`);
      for (const c of v["FieldMapping::FieldMapping"] || []) if (!b[c]) bad.push(`${k}: child ${c} missing`);
      if (v.Action && !b[v.Action]) bad.push(`${k}: Action ${v.Action} missing`);
    }
    if (v.Kind === "Reference") for (const f of ["StepId", "SourceProperty", "Property", "FieldMapping", "Trigger", "Action"]) if (v[f] && !b[v[f]]) bad.push(`${k}: ${f} ${v[f]} missing`);
    if (v.Kind === "Action" || v.Kind === "Trigger") for (const fm of v[`${v.Kind}::FieldMapping`] || []) if (!b[fm]) bad.push(`${k}: FieldMapping ${fm} missing`);
  }
  return bad;
}
