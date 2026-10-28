// Read-only read-back of the zz-spike harness in CIQ_Digital_A00 (no writes). Writes readback-harness-result.json.
import { writeFileSync } from "node:fs";
import { client } from "../../lib/kf.mjs";
const kf = client({ readOnly: true });
const A = kf.acc, APP = "CIQ_Digital_A00";
const out = { readAt: new Date().toISOString(), checks: [] };
const check = (id, ok, detail) => out.checks.push({ id, ok, detail });
const draft = async (type, id) => (await kf.get(`/metadata/2/${A}/${type}/${id}/draft`)).body || {};
const ents = (b, kind) => Object.values(b).filter((v) => v && v.Kind === kind);

// processes
for (const pid of ["CIQ_ZZ_Spike_Case_A00", "CIQ_ZZ_Spike_Point_A00"]) {
  const b = await draft("process", pid);
  const fields = ents(b, "Field"), acts = ents(b, "Activity"), perms = ents(b, "Permission"), aggs = ents(b, "AggregateDefinition"), exprs = ents(b, "Expression");
  const col2f = Object.fromEntries(fields.map((f) => [f.Column, f.Id]));
  out[pid] = {
    fieldCount: fields.length, fields: fields.map((f) => `${f.Id}:${f.Type}${f.Model && f.Model !== pid ? "@" + f.Model : ""}`),
    activities: acts.map((a) => ({ id: a.Id, node: a.NodeType, name: a.Name, roles: (a["Activity::Resource"] || []).map((r) => b[r]?.Value), cond: (a["Activity::Expression"] || []).map((e) => b[e]?.ExpressionStr), branches: (a["Activity::ProcessDef"] || []).length })),
    aggregates: aggs.map((g) => ({ id: g.Id, LHSModel: g.LHSModel, LHSRootModel: g.LHSRootModel, FlowType: g.FlowType, AggregateType: g.AggregateType, AggregateField: g.AggregateField })),
    fieldExpressions: exprs.filter((e) => !e.Activity).map((e) => e.ExpressionStr),
  };
  // step permissions by activity name
  const permsByAct = {};
  for (const a of acts) permsByAct[a.Name] = Object.fromEntries((a["Activity::Permission"] || []).map((id) => b[id]).filter(Boolean).map((p) => [col2f[p.Column] || p.Column, p.Permission]));
  out[pid].stepPermissions = permsByAct;
}
// forms
for (const fid of ["CIQ_ZZ_Spike_Register_A00", "CIQ_ZZ_Spike_Log_A00"]) {
  const b = await draft("form", fid);
  out[fid] = { fields: ents(b, "Field").map((f) => `${f.Id}:${f.Type}${f.Model && f.Model !== fid ? "@" + f.Model : ""}`), aggregates: ents(b, "AggregateDefinition").map((g) => ({ LHSModel: g.LHSModel, FlowType: g.FlowType, AggregateType: g.AggregateType, AggregateField: g.AggregateField })), queries: ents(b, "QueryDefinition").map((q) => ({ id: q.Id, LHSModel: q.LHSModel, FlowType: q.FlowType })) };
}
// lists
for (const lid of ["CIQ_ZZ_Spike_Yes_No_A00", "CIQ_ZZ_Spike_Decision_A00"]) {
  const r = await kf.get(`/flow/2/${A}/list/${lid}?_application_id=${APP}`);
  const items = await kf.get(`/flow/2/${A}/list/${lid}/items?_application_id=${APP}`);
  out[lid] = { status: r.status, Name: r.body?.Name, itemsStatus: items.status, items: Array.isArray(items.body) ? items.body.map((i) => i.Name || i.Value || i) : items.body?.ListItems || items.body };
}
// integrations
for (const iid of ["CIQ_ZZ_Spike_log_register_created_A00", "CIQ_ZZ_Spike_log_point_completed_A00"]) {
  const b = await draft("integration", iid);
  const trig = ents(b, "Trigger")[0] || {}, act = ents(b, "Action")[0] || {}, root = b[b.Root] || {};
  out[iid] = { status: root.Status, IsActive: root.IsActive, trigger: { Id: trig.Id, Event: trig.Event || trig.TriggerId || trig.Name, Connector: trig.Connector?.Name || trig.ConnectorId }, action: { Id: act.Id, ActionId: act.ActionId || act.Name, Connector: act.Connector?.Name || act.ConnectorId }, topKinds: [...new Set(Object.values(b).map((v) => v && v.Kind).filter(Boolean))] };
}
// app-level roles + flow members (grants)
const roles = await kf.get(`/app_role/2/${A}/list?_application_id=${APP}&page_size=100`);
out.roles = (Array.isArray(roles.body) ? roles.body : roles.body?.Data || []).map((r) => ({ _id: r._id, Name: r.Name, UserCount: r.UserCount }));
writeFileSync(new URL("./readback-harness-result.json", import.meta.url), JSON.stringify(out, null, 2));
console.log("written; keys:", Object.keys(out).join(", "));
