// Step 3: pass-2 — bind the trigger's source flow and the action's target form (golden FieldMapping + Property Value
// + SelectedDropdown), add a trigger Output sample, PUT, then resolve the action's target-field schema.
import { writer } from "../../lib/meta.mjs";
import { load, save } from "./integ-state.mjs";
const w = writer(fileURLToPath(new URL("./integration-requests.jsonl", import.meta.url)));
const s = load();
let n = 0; const eid = (p, tag) => `${p}_${tag}_${(++n).toString(36)}`;
const USER = { _id: "Us000000000", Name: "Sample", Kind: "User" };
const sampleOut = (fields) => { const o = { _id: "SampleInstance001", Name: "Sample", _created_by: USER, _modified_by: USER, _created_at: "2024-01-01T00:00:00-00:00", _modified_at: "2024-01-01T00:00:00-00:00", _status: "Sample", _current_step: "Sample" }; for (const [f, t] of fields) o[f] = t === "Number" ? 0 : t === "Object" ? USER : "Text data"; return o; };
function setSelector(blob, entityId, kind, schemaField, flowId, flowName) {
  for (const k of Object.keys(blob)) { const e = blob[k]; if (e?.Kind === "FieldMapping" && e[kind] === entityId) { for (const p of e["FieldMapping::Property"] || []) delete blob[p]; delete blob[k]; } }
  const fm = eid("FieldMapping", kind), pr = eid("Property", kind);
  blob[fm] = { Id: fm, Kind: "FieldMapping", Type: schemaField.Type || "String", FieldId: schemaField.Id, Label: schemaField.Label, Name: schemaField.Name, IsRequired: true, IsDropdown: true, AutoRefresh: true, [kind]: entityId,
    SelectedDropdown: [{ FieldId: flowId, FieldName: flowName }], "FieldMapping::Property": [pr] };
  blob[pr] = { Id: pr, Kind: "Property", FieldMapping: fm, Type: "Value", Value: [flowId], Name: schemaField.Name };
  blob[entityId][`${kind}::FieldMapping`] = [fm];
}
const DEFS = {
  CIQ_ZZ_Spike_log_register_created_A00: { src: ["CIQ_ZZ_Spike_Register_A00", "CIQ ZZ Spike Register", [["Register_Key", "Text"], ["Register_Case", "Object"], ["Open_Lines", "Number"]]] },
  CIQ_ZZ_Spike_log_point_completed_A00: { src: ["CIQ_ZZ_Spike_Point_A00", "CIQ ZZ Spike Point", [["Round_No", "Number"], ["Question_Text", "Text"], ["Awaiting_Response", "Text"], ["Response_Text", "Text"], ["Due_Date", "Text"], ["To_Supplier", "Text"]]] },
};
const TGT = ["CIQ_ZZ_Spike_Log_A00", "CIQ ZZ Spike Log"];
for (const [id, d] of Object.entries(DEFS)) {
  const st = s.integrations[id];
  const blob = (await w.getDraft("integration", id)).body;
  const tSchema = (await w.call("GET", `/integration/2/${w.acc}/${id}/trigger/${st.tId}/fields`)).body;
  const aSchema = (await w.call("GET", `/integration/2/${w.acc}/${id}/action/${st.aId}/fields`)).body;
  setSelector(blob, st.tId, "Trigger", tSchema[0], d.src[0], d.src[1]);
  blob[st.tId].Output = sampleOut(d.src[2]);
  setSelector(blob, st.aId, "Action", aSchema.find((f) => f.Name === "form_id"), TGT[0], TGT[1]);
  const pd = await w.putDraft("integration", id, blob);
  console.log("##", id, "PUT bind", pd.status, pd.status >= 300 ? JSON.stringify(pd.body).slice(0, 300) : "");
  const r = await w.call("GET", `/integration/2/${w.acc}/${id}/action/${st.aId}/fields`);
  console.log("   action schema", r.status, JSON.stringify((Array.isArray(r.body) ? r.body : []).map((f) => ({ Id: f.Id, Name: f.Name, Label: f.Label, Type: f.Type, Req: f.IsRequired, DD: f.IsDropdown }))));
  st.bind = pd.status; st.actionSchema = Array.isArray(r.body) ? r.body.map((f) => ({ Id: f.Id, Name: f.Name, Label: f.Label, Type: f.Type, IsRequired: f.IsRequired, IsDropdown: f.IsDropdown })) : r.body; save(s);
}
