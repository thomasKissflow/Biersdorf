// The app-container hand-off integrations of plan v6 §4.1 that the app session builds (20 Oct; split agreed with the portal
// session; recipe: night-2026-10-20/integrations/RECIPE.md, proven there by "CIQP Request changed to case").
// Security (RECIPE "Security note"): the webhook URLs ship in the app bundle and are unauthenticated, so a payload carries only
// APP item ids; each integration searches that app item and reads the portal target (Portal_Query_Item_Id /
// Portal_Request_Item_Id, written only by integrations) and, wherever Kissflow has them, the values from it (a Run script
// picks the exact _id and refuses what does not fit).
//   node kissflow-build/ciq-digital/integrations/build.mjs <key> <stage>
//   keys: opRound opEdited opClosed release history cancelled
//   stages: create | skeleton | bind | fields | map | addstep | untest | harden [draft file] | harden-apply   (HARDENING.md)
// Connections are referenced only (the Kissflow Process system-key connection Kissflow minted); nothing holds a credential.
// Every draft is backed up before a PUT (backups/) and read back after it.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { call, A, load, save, backup, getDraft, putDraft, fieldsOf, CONNECTIONS, connectorRef, summary, mapAction, setSelector, setScriptInputs, newId } from "./integ-lib.mjs";
import { hardenDraft, checkHardened, integrity, lineDiff } from "./harden.mjs";

const APP = "CIQ_Digital_A00";
const OP = ["CIQ_Open_Point_A00", "CIQ Open Point - CIQ Digital"];
const CASE = ["CIQ_Case_A00", "CIQ Case - CIQ Digital"];
const QUERY = ["CIQP_Query_A00", "CIQP Query - CIQ Supplier Portal"];
const REQUEST = ["CIQP_Request_A00", "CIQP Request - CIQ Supplier Portal"];

// trigger key in the payload → the app item the integration searches; then the script; then the target actions.
// harden (21 Oct, HARDENING.md): the portal target the second search reads, by the same payload id, before the script
// (its Data becomes the script input of that name; the script is scripts/harden/<code>). The scripts' outputs are
// unchanged, except release.requested's, which also clears Release_By_Email and Release_By_Role (21 Oct, REQ-PROC-042):
// harden.clear maps them on the hardened draft (MAPS lists them too).
const DEFS = {
  opRound: {
    name: "CIQ op.round Open point question to supplier",
    desc: "Plan v6 §4.1 op.round: the app posts {opItemId}; the open point's own fields become a CIQP Query round (create and submit) and its id is stored on the point.",
    key: "opItemId", search: OP, code: "op-round.js",
    targets: [
      { id: "Action_OR_create_query", act: "create", process: QUERY },
      { id: "Action_OR_store_query_id", act: "update", process: OP },
    ],
    harden: { read: QUERY, input: "queries" }, // twin search: no second query for the round's Query_Key
  },
  opEdited: {
    name: "CIQ op.edited Open point question edited",
    desc: "Plan v6 §4.1 op.edited: the app posts {opItemId}; the point's query (Portal_Query_Item_Id) gets its current question, justification and due date.",
    key: "opItemId", search: OP, code: "op-edited.js",
    targets: [{ id: "Action_OE_update_query", act: "update", process: QUERY }],
    harden: { read: QUERY, input: "queries" }, // reverse link: the query's App_Open_Point_Id
  },
  opClosed: {
    name: "CIQ op.closed Open point closed",
    desc: "Plan v6 §4.1 op.closed: the app posts {opItemId}; only a point with an outcome ends its query (skip and complete).",
    key: "opItemId", search: OP, code: "op-closed.js",
    targets: [{ id: "Action_OC_complete_query", act: "skip", process: QUERY }],
    harden: { read: QUERY, input: "queries" },
  },
  release: {
    name: "CIQ release.requested Final release requested",
    desc: "Plan v6 §4.1 I-5 release.requested: the app posts {caseItemId}; the case's request gets Release_Flag Requested, the lock and Release_Contacts from the case.",
    key: "caseItemId", search: CASE, code: "case-release.js",
    // 20 Oct review (portal session, HIGH): the case records when Beiersdorf asked (I-7 requires it), then the request
    targets: [{ id: "Action_RR_stamp_case", act: "update", process: CASE }, { id: "Action_RR_update_request", act: "update", process: REQUEST }],
    // reverse link: the request's App_Case_Item_Id; its Case_Phase_Label. clear: the two CIQP Request fields the portal
    // session added 21 Oct (Release_By_Name's step permissions), cleared with null like Release_At / Release_By_Name
    harden: { read: REQUEST, input: "requests", clear: { Action_RR_update_request: ["Release_By_Email", "Release_By_Role"] } },
  },
  history: {
    name: "CIQ history.updated Questions history to supplier",
    desc: "Plan v6 §4.1 history.updated: the app posts {caseItemId, questionsHistoryJson}; the case's request gets Questions_History_JSON.",
    key: "caseItemId", search: CASE, code: "case-history.js", extraInputs: ["questionsHistoryJson"],
    targets: [{ id: "Action_HU_update_request", act: "update", process: REQUEST }],
    harden: { read: REQUEST, input: "requests" },
  },
  cancelled: {
    name: "CIQ case.cancelled Case cancelled",
    desc: "Plan v6 §4.1 case.cancelled: the app posts {caseItemId, phaseLabel, locked}; the case's request gets the label and lock (known values only).",
    key: "caseItemId", search: CASE, code: "case-cancelled.js", extraInputs: ["phaseLabel", "locked"],
    targets: [{ id: "Action_CC_update_request", act: "update", process: REQUEST }],
    harden: { read: REQUEST, input: "requests" },
  },
};

const ACT = {
  search: { Type: "Search", Name: "Search an item", ActionId: "Action_Kh4Jb2AoG", ActionName: "Search an item " },
  create: { Type: "Create", Name: "Create and submit a new item", ActionId: "CreateAndSubmitItem", ActionName: "Create and submit a new item" },
  update: { Type: "Update", Name: "Update an item", ActionId: "UpdateAnItem", ActionName: "Update an item" },
  skip: { Type: "Create", Name: "Skip and complete", ActionId: "Action_admin_skip_complete", ActionName: "Skip and complete" },
};

const [K, stage] = process.argv.slice(2);
const d = DEFS[K];
if (!d || !stage) { console.error(`usage: build.mjs <${Object.keys(DEFS).join("|")}> <create|skeleton|bind|fields|map|addstep|untest|harden [draft file]|harden-apply>`); process.exit(1); }
const s = load();
const st = (s.integrations[K] ||= {});
const tag = K.replace(/[a-z]/g, "").slice(0, 2) || K.slice(0, 2).toUpperCase();
const T = `Trigger_${K}_webhook`, S1 = `Action_${K}_read_app_item`, PS = `Action_${K}_pick`;
const S2 = `Action_${K}_read_target`; // harden: the portal target's search

if (stage === "create") {
  if (st.id) { console.log("exists", st.id); process.exit(0); }
  const list = (await call("GET", `/flow/2/${A}/integration/?_application_id=${APP}&page_number=1&page_size=100`)).body;
  const dupe = (Array.isArray(list) ? list : list?.Data || []).find((x) => x.Name === d.name);
  if (dupe) { st.id = dupe._id; save(s); console.log("found existing", dupe._id); process.exit(0); }
  const r = await call("POST", `/flow/2/${A}/integration/?_application_id=${APP}`, { Name: d.name, Description: d.desc });
  console.log("create", r.status, JSON.stringify(r.body).slice(0, 300));
  if (r.status < 300 && r.body?._id) { st.id = r.body._id; save(s); backup(st.id, await getDraft(st.id), "created"); }
}

if (stage !== "create" && !st.id) { console.error(`no integration id for ${K}: run the create stage first`); process.exit(1); }

if (stage === "skeleton") {
  const live = await getDraft(st.id);
  backup(st.id, live, "before-skeleton");
  const root = live.Root;
  if ((live[root]["Integration::Trigger"] || []).length) { console.log("already has a trigger:", JSON.stringify(summary(live))); process.exit(0); }
  const b = { ...live };
  b[root] = { ...live[root], "Integration::Trigger": [T], "Integration::Action": [S1, PS, ...d.targets.map((t) => t.id)] };
  b[T] = { Id: T, Kind: "Trigger", Type: "Create", Name: "Catch a webhook (POST)", IsInternalAuth: true, Connection: {}, Integration: root,
    Connector: await connectorRef("webhook", { TriggerId: "WebhookTrigger", TriggerName: "Catch a webhook (POST)" }) };
  const action = async (id, a) => ({ Id: id, Kind: "Action", Type: a.Type, Name: a.Name, IsInternalAuth: false, Connection: CONNECTIONS.process, Integration: root,
    Connector: await connectorRef("process", { ActionId: a.ActionId, ActionName: a.ActionName }), "Action::FieldMapping": [] });
  b[S1] = await action(S1, ACT.search);
  b[PS] = { Id: PS, Kind: "Action", Type: "Create", Name: "Run JavaScript", IsInternalAuth: true, Connection: {}, Integration: root,
    Connector: await connectorRef("script", { ActionId: "RunJSCode", ActionName: "Run JavaScript" }), "Action::FieldMapping": [] };
  for (const t of d.targets) b[t.id] = await action(t.id, ACT[t.act]);
  const pd = await putDraft(st.id, b);
  console.log("PUT skeleton", pd.status, pd.status >= 300 ? JSON.stringify(pd.body).slice(0, 400) : "");
  Object.assign(st, { tId: T, s1: S1, ps: PS, targets: d.targets.map((t) => t.id) }); save(s);
  console.log("read-back", JSON.stringify(summary(await getDraft(st.id))));
}

// addstep: a target action added after the integration was built and tested (its trigger and its captured webhook
// Output stay as they are); the run order follows d.targets after the search(es) and the script.
if (stage === "addstep") {
  const live = await getDraft(st.id);
  backup(st.id, live, "before-addstep");
  const b = { ...live };
  const root = b.Root;
  const added = [];
  for (const t of d.targets) {
    if (b[t.id]) continue;
    b[t.id] = { Id: t.id, Kind: "Action", Type: ACT[t.act].Type, Name: ACT[t.act].Name, IsInternalAuth: false, Connection: CONNECTIONS.process, Integration: root,
      Connector: await connectorRef("process", { ActionId: ACT[t.act].ActionId, ActionName: ACT[t.act].ActionName }), "Action::FieldMapping": [] };
    added.push(t.id);
  }
  b[root] = { ...b[root], "Integration::Action": [S1, ...(b[S2] ? [S2] : []), PS, ...d.targets.map((t) => t.id)] }; // a hardened draft keeps its target search
  const pd = await putDraft(st.id, b);
  console.log("PUT addstep", pd.status, "added", added.join(", ") || "(none)", pd.status >= 300 ? JSON.stringify(pd.body).slice(0, 400) : "");
  st.targets = d.targets.map((t) => t.id); save(s);
  const back = await getDraft(st.id);
  console.log("order", JSON.stringify(back[back.Root]["Integration::Action"]), "trigger tested", !!back[T]?.IsTested);
}

// untest: after a change, clear Output/IsTested on every ACTION (the webhook trigger's captured Output stays), so no stale
// "tested" hides an untested change; test-chain.mjs then tests them again in order.
if (stage === "untest") {
  const live = await getDraft(st.id);
  backup(st.id, live, "before-untest");
  const b = { ...live };
  const acts = b[b.Root]["Integration::Action"] || [];
  for (const a of acts) { const { Output, IsTested, ...rest } = b[a]; void Output; void IsTested; b[a] = rest; }
  const pd = await putDraft(st.id, b);
  const back = await getDraft(st.id);
  console.log("PUT untest", pd.status, acts.map((a) => `${a}:${back[a]?.IsTested ? "tested" : "untested"}`).join(" "), "| trigger tested", !!back[T]?.IsTested);
}

if (stage === "bind") {
  const live = await getDraft(st.id);
  // bind writes the pre-harden script inputs and code (scripts/<code>): on a hardened draft it would undo the hardening
  if (live?.[S2]) { console.log(`STOP: ${st.id} is hardened (${S2}); bind would put back the unhardened script. See HARDENING.md`); process.exit(2); }
  backup(st.id, live, "before-bind");
  const b = { ...live };
  const s1 = (await fieldsOf(st.id, "action", S1)).body;
  setSelector(b, S1, "Action", s1.find((f) => f.Name === "process_id"), d.search[0], d.search[1]);
  mapAction(b, S1, s1, { lookupValue: { trigger: d.key } }, T);
  for (const t of d.targets) {
    const sf = (await fieldsOf(st.id, "action", t.id)).body;
    setSelector(b, t.id, "Action", sf.find((f) => f.Name === "process_id"), t.process[0], t.process[1]);
  }
  const inputs = { [d.key]: { trigger: d.key }, rows: { step: S1, path: "Data" } };
  for (const k of d.extraInputs || []) inputs[k] = { trigger: k };
  setScriptInputs(b, PS, inputs, T);
  let codeFm = (b[PS]["Action::FieldMapping"] || []).find((x) => b[x]?.Name === "js_code");
  if (!codeFm) {
    codeFm = newId("FieldMapping"); const pr = newId("Property");
    b[codeFm] = { Id: codeFm, Kind: "FieldMapping", Type: "Code", FieldId: "JSCode", Label: "JavaScript code", Name: "js_code", IsRequired: true, IsDropdown: false, IsPaginated: false, AutoRefresh: false, CodeLanguage: "javascript", Action: PS, "FieldMapping::Property": [pr] };
    b[pr] = { Id: pr, Kind: "Property", Type: "Code", Name: "js_code", Code: "", FieldMapping: codeFm };
    b[PS]["Action::FieldMapping"] = [...b[PS]["Action::FieldMapping"], codeFm];
  }
  const pid = b[codeFm]["FieldMapping::Property"][0];
  b[pid] = { ...b[pid], Code: readFileSync(new URL(`./scripts/${d.code}`, import.meta.url), "utf8") };
  const pd = await putDraft(st.id, b);
  console.log("PUT bind", pd.status, pd.status >= 300 ? JSON.stringify(pd.body).slice(0, 400) : "");
  console.log("read-back", JSON.stringify(summary(await getDraft(st.id)).ents.map((e) => `${e.id}:${e.entity}:${e.props.join(",")}`)).slice(0, 1500));
}

if (stage === "fields") {
  for (const t of d.targets) {
    const r = await fieldsOf(st.id, "action", t.id);
    console.log("##", t.id, r.status, Array.isArray(r.body) ? `${r.body.length} fields` : JSON.stringify(r.body).slice(0, 300));
    if (Array.isArray(r.body)) for (const f of r.body) console.log(`   ${f.Name} · ${f.Type}${f.IsMultiValue ? "[]" : ""}${f.IsRequired ? " *" : ""} · ${f.Label}${f["Field::Field"] ? " · children " + f["Field::Field"].length : ""}`);
  }
}

// map: the target actions' fields from the script's output (MAPS below); a multi-value user field from a list of {_id}
const MAPS = {
  opRound: {
    Action_OR_create_query: { from: "script", fields: ["Query_Key", "Round_No", "App_Open_Point_Id", "Case_Code", "Cycle_No", "Supplier_Code", "Kind_Label", "Responsible_Department", "Responsible_Name", "Ref_Kind", "Ref_Label", "Ref_Section_Key", "Ref_Field_Key", "Ref_Row_Id", "Ref_Doc_Id", "Ref_Doc_File_Name", "Ref_Doc_Uploaded_At", "New_Section_Item_Key", "Question_Text", "Supplier_Justification", "Supplier_Due_Date"], users: { Assigned_Contacts: "assignees" } },
    Action_OR_store_query_id: { fields: { _id: { step: PS, path: "opItemId" }, Portal_Query_Item_Id: { step: "Action_OR_create_query", path: "_id" } } },
  },
  opEdited: { Action_OE_update_query: { from: "script", fields: ["_id", "Question_Text", "Supplier_Justification", "Supplier_Due_Date", "Edited_At"] } },
  opClosed: { Action_OC_complete_query: { fields: { instance_id: { step: PS, path: "_id" } } } }, // Skip and complete takes instance_id
  release: {
    Action_RR_stamp_case: { fields: { _id: { step: PS, path: "caseId" }, Release_Requested_At: { step: PS, path: "releaseRequestedAt" } } },
    // Release_At / Release_By_Name (and, from the hardened script on, Release_By_Email / Release_By_Role) mapped to null
    // outputs: cleared, so a new round can't reuse an earlier release
    Action_RR_update_request: { from: "script", fields: ["_id", "Release_Flag", "Request_Locked", "Case_Phase_Label", "Release_At", "Release_By_Name", "Release_By_Email", "Release_By_Role"], users: { Release_Contacts: "releaseContacts" } },
  },
  history: { Action_HU_update_request: { from: "script", fields: ["_id", "Questions_History_JSON"] } },
  cancelled: { Action_CC_update_request: { from: "script", fields: ["_id", "Case_Phase_Label", "Request_Locked"] } },
};

/** A multi-value user field (RECIPE step 5): Object FieldMapping + one child "_id", both bound to the script's list. */
function mapUsers(b, actionId, schemaField, listPath) {
  const fms = b[actionId]["Action::FieldMapping"];
  const fm = fms.find((x) => b[x]?.Name === schemaField.Name);
  if (!fm) throw new Error(`no mapping entry for ${schemaField.Name}`);
  for (const p of b[fm]["FieldMapping::Property"] || []) delete b[p];
  for (const c of b[fm]["FieldMapping::FieldMapping"] || []) { for (const p of b[c]?.["FieldMapping::Property"] || []) delete b[p]; delete b[c]; }
  b[fm] = { ...b[fm], Type: "Object", IsMultiValue: true };
  const pr = newId("Property");
  b[pr] = { Id: pr, Kind: "Property", FieldMapping: fm, Type: "Field", Field: `context.${PS}.${listPath}`, Name: schemaField.Name };
  const child = newId("FieldMapping"), cpr = newId("Property");
  b[child] = { Id: child, Kind: "FieldMapping", Type: "String", IsVisible: true, FieldMapping: fm, Name: "_id", Label: "_id", "FieldMapping::Property": [cpr] };
  b[cpr] = { Id: cpr, Kind: "Property", FieldMapping: child, Type: "Field", Field: `context.${PS}.${listPath}._id`, Name: "_id" };
  b[fm]["FieldMapping::Property"] = [pr];
  b[fm]["FieldMapping::FieldMapping"] = [child];
}

if (stage === "map") {
  const live = await getDraft(st.id);
  backup(st.id, live, "before-map");
  const b = { ...live };
  for (const [actionId, m] of Object.entries(MAPS[K])) {
    const schema = (await fieldsOf(st.id, "action", actionId)).body;
    const map = {};
    // harden.clear fields read outputs only the hardened script returns: an unhardened draft leaves them unmapped
    const later = live[S2] ? [] : d.harden?.clear?.[actionId] || [];
    if (Array.isArray(m.fields)) for (const f of m.fields) if (!later.includes(f)) map[f] = { step: PS, path: f };
    else Object.assign(map, m.fields);
    const missing = mapAction(b, actionId, schema, map, T);
    if (missing.length) { console.log(`STOP: not in the ${actionId} schema:`, missing.join(", ")); process.exit(2); }
    for (const [field, list] of Object.entries(m.users || {})) {
      const sf = schema.find((f) => f.Name === field);
      if (!sf) { console.log(`STOP: no user field ${field} in ${actionId}`); process.exit(2); }
      // mapAction gave it a plain entry; turn it into the multi-value user shape
      if (!(b[actionId]["Action::FieldMapping"] || []).some((x) => b[x]?.Name === field)) {
        const fm = newId("FieldMapping");
        b[fm] = { Id: fm, Kind: "FieldMapping", Type: "Object", FieldId: sf.Id, Label: sf.Label, Name: sf.Name, IsRequired: !!sf.IsRequired, Action: actionId };
        b[actionId]["Action::FieldMapping"].push(fm);
      }
      mapUsers(b, actionId, sf, list);
    }
  }
  const pd = await putDraft(st.id, b);
  console.log("PUT map", pd.status, pd.status >= 300 ? JSON.stringify(pd.body).slice(0, 400) : "");
  const back = await getDraft(st.id);
  for (const e of summary(back).ents) console.log("read-back", e.id, e.entity, e.props.join(" | ").slice(0, 900));
}

// ---- harden (21 Oct, HARDENING.md) ----
// harden: a DRY RUN with no Kissflow call (fetch is disabled for it). harden.mjs is applied to the snapshot draft of
// 21 Oct 02:2x (night-2026-10-21/snapshot), or to a draft file given as the third argument (a backups/ file or a
// snapshot file), and the planned metadata changes and the script diff are printed. Nothing is written.
// harden-apply: the same change on the re-read LIVE draft: backs up, refuses on any manual change, PUTs, reads back.
// Not run on 21 Oct: it needs Thomas's OK and HARDENING.md's procedure (switch OFF before the trigger is re-captured).
// harden.clear (release.requested): the dry run derives the new mapping entries offline; harden-apply reads the target's
// live field schema first (a read-only GET) and takes FieldId, Label and Type from it, or stops if a field isn't there.
const hardenSpec = () => ({ trigger: T, s1: S1, s2: S2, ps: PS, targets: d.targets.map((t) => t.id), key: d.key, extraInputs: d.extraInputs, read: d.harden.read, input: d.harden.input, code: d.code, clear: d.harden.clear || {} });
const clearList = (spec) => Object.entries(spec.clear).flatMap(([a, names]) => names.map((n) => `${a}.${n}`));
const scriptText = (f) => readFileSync(new URL(`./scripts/${f}`, import.meta.url), "utf8");
const kindCounts = (b) => Object.values(b).reduce((m, e) => (e?.Kind ? ((m[e.Kind] = (m[e.Kind] || 0) + 1), m) : m), {});

if (stage === "harden") {
  globalThis.fetch = () => { throw new Error("harden is a dry run: no Kissflow call"); };
  const file = process.argv[4] ? resolve(process.argv[4]) : fileURLToPath(new URL(`../../night-2026-10-21/snapshot/${APP}.integration.${st.id}.json`, import.meta.url));
  const raw = JSON.parse(readFileSync(file, "utf8"));
  const draft = raw?.draft?.Root ? raw.draft : raw; // a snapshot file wraps the draft; a backup is the draft itself
  const spec = hardenSpec();
  const code = { from: scriptText(d.code), to: scriptText(`harden/${d.code}`) };
  console.log(`## ${K} ${st.id} · harden DRY RUN (no Kissflow call, nothing written)`);
  console.log(`   from ${file.replace(/^.*kissflow-build\//, "kissflow-build/")}${raw.draft ? ` · snapshot: ${raw.status}, IsActive ${raw.isActive}, modified ${raw.list?._modified_at}` : ""}`);
  let r;
  try { r = hardenDraft(draft, spec, code, newId); } catch (e) { console.log(`   STOP: ${e.message}`); for (const l of e.diff || []) console.log(`     ${l}`); process.exit(2); }
  if (r.already) { console.log("   already hardened: nothing to change"); process.exit(0); }
  for (const c of r.changes) console.log(`   ${c}`);
  const k0 = kindCounts(draft), k1 = kindCounts(r.blob);
  console.log(`   entities ${Object.keys(k1).map((k) => `${k} ${k0[k] || 0}→${k1[k]}`).join(", ")}`);
  const i0 = integrity(draft), i1 = integrity(r.blob), problems = checkHardened(r.blob, spec, code.to);
  console.log(`   checks   hardened shape ${problems.length ? "FAIL: " + problems.join("; ") : "ok"} · dangling/mis-parented ids ${i0.problems.length}→${i1.problems.length} · unreached entities ${i0.unreached.length}→${i1.unreached.length} · the draft ran scripts/${d.code} exactly: yes`);
  console.log(`   MAPS     ${clearList(spec).length ? `+ ${clearList(spec).join(", ")} (the hardened script also returns them, as null); the rest unchanged` : "unchanged (the hardened script returns the same keys)"}`);
  console.log(`   script diff scripts/${d.code} → scripts/harden/${d.code}:`);
  for (const l of lineDiff(code.from, code.to)) console.log(`     ${l}`);
  process.exit(problems.length || i1.problems.length > i0.problems.length ? 1 : 0);
}

if (stage === "harden-apply") {
  const live = await getDraft(st.id);
  const spec = hardenSpec();
  const code = { from: scriptText(d.code), to: scriptText(`harden/${d.code}`) };
  // backed up before the check, so a refused (changed) live draft is on disk too: `harden <that file>` reprints the STOP offline
  const before = backup(st.id, live, "before-harden");
  console.log("  backup", before.replace(/^.*integrations\//, ""));
  const schemas = {};
  for (const a of Object.keys(spec.clear)) {
    const sf = (await fieldsOf(st.id, "action", a)).body;
    if (!Array.isArray(sf)) { console.log(`STOP (nothing written): ${a}'s field schema is unreadable: ${JSON.stringify(sf).slice(0, 300)}`); process.exit(2); }
    schemas[a] = sf;
  }
  let r;
  try { r = hardenDraft(live, spec, code, newId, schemas); } catch (e) { console.log(`STOP (nothing written): ${e.message}`); for (const l of e.diff || []) console.log(`    ${l}`); process.exit(2); }
  if (r.already) { console.log(st.id, "already hardened: nothing to change"); process.exit(0); }
  for (const c of r.changes) console.log(`  ${c}`);
  const pd = await putDraft(st.id, r.blob);
  console.log("PUT harden", pd.status, pd.status >= 300 ? JSON.stringify(pd.body).slice(0, 400) : "");
  if (pd.status >= 300) process.exit(1);
  const back = await getDraft(st.id);
  const problems = checkHardened(back, spec, code.to);
  const acts = back[back.Root]["Integration::Action"] || [];
  console.log("read-back", problems.length ? `MISMATCH: ${problems.join("; ")}` : "hardened", "|", acts.map((a) => `${a}:${back[a]?.IsTested ? "tested" : "untested"}`).join(" "), "| trigger tested", !!back[T]?.IsTested);
  st.hardened = problems.length ? "PUT done, read-back mismatch" : "draft hardened (untested, unpublished)"; save(s);
  process.exit(problems.length ? 1 : 0);
}
