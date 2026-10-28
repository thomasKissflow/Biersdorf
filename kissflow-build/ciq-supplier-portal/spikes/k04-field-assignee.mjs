// Spike K-02 + K-04 (shape half): can we author a process in the PORTAL over REST, and does a step
// accept a FIELD-driven assignee (Resource.ValueType = "Field") instead of a static AppRole?
// Writes only a throwaway "ZZ Spike Assignee" process in the portal (archived + deleted at the end of the spikes).
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { writer, mergeStarter, preflight, kinds } from "../../lib/meta.mjs";
import { buildForm, addWorkflow } from "../../../tools/kissflow-app-agents-1.6.0/engine/builders.mjs";
import { eid } from "../../../tools/kissflow-app-agents-1.6.0/engine/util.mjs";

const P = "CIQ_Supplier_Portal_A00";
const ADMIN_ROLE = "RoEK3_yhR4wx";
const w = writer(fileURLToPath(new URL("./spike-requests.jsonl", import.meta.url)));
const out = { spike: "K-02/K-04 field assignee", results: [] };

// 1. shell (reuse if a previous run created it)
let id;
const list = await w.listFlows("process", P);
const existing = (Array.isArray(list.body) ? list.body : list.body?.Data || []).find((f) => f.Name === "ZZ Spike Assignee");
if (existing) id = existing._id;
else {
  const cr = await w.createFlow("process", P, "ZZ Spike Assignee", "Throwaway probe: field-driven step assignee. Safe to delete.");
  out.results.push({ step: "create shell", status: cr.status, body: cr.body });
  id = cr.body?._id;
}
if (!id) { console.log(JSON.stringify(out, null, 2)); process.exit(1); }
out.flowId = id;

const starter = (await w.getDraft("process", id)).body;
out.starterKinds = kinds(starter);

async function attempt(label, userFieldType, resourceKind) {
  const spec = {
    id, name: "ZZ Spike Assignee", flowType: "Process",
    fields: [
      { name: "Probe Title", type: "Text", required: true },
      { name: "Probe Assignees", type: userFieldType },
      { name: "Probe Note", type: "Textarea" },
    ],
  };
  const built = buildForm(spec, P);
  addWorkflow(built, [{ name: "Start" }, { name: "Spike step", actor: "Admin" }, { name: "End" }], { Admin: ADMIN_ROLE });
  const blob = built.blob;
  const act = Object.values(blob).find((e) => e?.Kind === "Activity" && e.Name === "Spike step");
  if (resourceKind === "Field") {
    const rId = act["Activity::Resource"][0];
    blob[rId] = { Id: rId, Kind: "Resource", ValueType: "Field", DisplayValue: "Probe Assignees", Value: "Probe_Assignees", Activity: act.Id };
  }
  const merged = mergeStarter(starter, blob, id);
  const pf = preflight(id, merged);
  const pd = await w.putDraft("process", id, merged);
  const pub = pd.status < 300 ? await w.publish("process", id) : { status: -1, body: null };
  const back = (await w.getDraft("process", id)).body;
  const backAct = Object.values(back || {}).find((e) => e?.Kind === "Activity" && e.Name === "Spike step");
  const backRes = (backAct?.["Activity::Resource"] || []).map((r) => back[r]);
  const backField = back?.Probe_Assignees;
  const r = { label, userFieldType, resourceKind, preflightErrors: pf.errors.map((e) => e.code), draft: pd.status, publish: pub.status, publishBody: pub.status >= 300 ? pub.body : undefined, readBackResource: backRes, readBackFieldType: backField?.Type };
  out.results.push(r);
  console.log(label, "draft", pd.status, "publish", pub.status, "resource", JSON.stringify(backRes), "fieldType", backField?.Type);
  return pub.status < 300;
}

// baseline first (proves REST authoring in the portal), then the field-driven variants
await attempt("A baseline AppRole + UserList field", "UserList", "AppRole");
(await attempt("B Field resource + UserList field", "UserList", "Field")) ||
  (await attempt("C Field resource + User field", "User", "Field"));

writeFileSync(new URL("./k04-result.json", import.meta.url), JSON.stringify(out, null, 2));
