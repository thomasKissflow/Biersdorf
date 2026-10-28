// Step 4: pass-3 — enumerate the action's resolved fields (golden shape), bind the mapped ones, PUT, publish, read back.
import { writer } from "../../lib/meta.mjs";
import { load, save } from "./integ-state.mjs";
const w = writer(fileURLToPath(new URL("./integration-requests.jsonl", import.meta.url)));
const s = load();
let n = 0; const eid = (p) => `${p}_m${(++n).toString(36)}`;
const MAPS = {
  CIQ_ZZ_Spike_log_register_created_A00: { Log_Source: { value: "Register" }, Log_Event: { value: "created" }, Log_Item_Id: { src: "_id" }, Log_Key: { src: "Register_Key" } },
  CIQ_ZZ_Spike_log_point_completed_A00: { Log_Source: { value: "Point" }, Log_Event: { value: "completed" }, Log_Item_Id: { src: "_id" }, Log_Key: { value: "point" }, Log_Payload: { src: "Question_Text" } },
};
for (const [id, map] of Object.entries(MAPS)) {
  const st = s.integrations[id];
  const blob = (await w.getDraft("integration", id)).body;
  const aId = st.aId, tId = st.tId;
  // keep the existing form_id selector mapping; drop any other action mappings
  const keep = (blob[aId]["Action::FieldMapping"] || []).filter((fm) => blob[fm]?.Name === "form_id");
  for (const k of Object.keys(blob)) { const e = blob[k]; if (e?.Kind === "FieldMapping" && e.Action === aId && !keep.includes(k)) { for (const p of e["FieldMapping::Property"] || []) delete blob[p]; delete blob[k]; } }
  const list = [...keep];
  for (const f of st.actionSchema.filter((f) => f.Name !== "form_id")) {
    const fm = eid("FieldMapping");
    blob[fm] = { Id: fm, Kind: "FieldMapping", Type: f.Type || "String", FieldId: f.Id, Label: f.Label, Name: f.Name, IsRequired: !!f.IsRequired, Action: aId };
    const b = map[f.Name];
    if (b) {
      const pr = eid("Property"); blob[fm]["FieldMapping::Property"] = [pr];
      blob[pr] = b.value !== undefined ? { Id: pr, Kind: "Property", FieldMapping: fm, Type: "Value", Value: [b.value], Name: f.Name }
                                       : { Id: pr, Kind: "Property", FieldMapping: fm, Type: "Field", Field: `context.${tId}.${b.src}`, Name: f.Name };
    }
    list.push(fm);
  }
  blob[aId]["Action::FieldMapping"] = list;
  const pd = await w.putDraft("integration", id, blob);
  const pub = pd.status < 300 ? await w.publish("integration", id) : { status: -1, body: null };
  console.log("##", id, "PUT", pd.status, "publish", pub.status, pd.status >= 300 ? JSON.stringify(pd.body).slice(0, 300) : "", pub.status >= 300 ? JSON.stringify(pub.body).slice(0, 300) : "");
  st.mapPut = pd.status; st.publish = pub.status; save(s);
}
// read back
for (const id of Object.keys(MAPS)) {
  const b = (await w.getDraft("integration", id)).body;
  const kinds = {}; for (const v of Object.values(b)) if (v?.Kind) kinds[v.Kind] = (kinds[v.Kind] || 0) + 1;
  const trig = Object.values(b).find((v) => v?.Kind === "Trigger"), act = Object.values(b).find((v) => v?.Kind === "Action");
  const bound = Object.values(b).filter((v) => v?.Kind === "Property").map((p) => `${p.Name}=${p.Type === "Value" ? JSON.stringify(p.Value) : p.Field}`);
  const listed = (await w.call("GET", `/flow/2/${w.acc}/integration/?_application_id=CIQ_Digital_A00&page_number=1&page_size=50`)).body.find((x) => x._id === id);
  console.log("readback", id, JSON.stringify({ kinds, trigger: trig?.Connector?.TriggerId, triggerConn: trig?.Connection?._id, action: act?.Connector?.ActionId, actionConn: act?.Connection?._id, bound, Status: listed?.Status, IsActive: listed?.IsActive, Connectors: listed?.Connectors }));
}
