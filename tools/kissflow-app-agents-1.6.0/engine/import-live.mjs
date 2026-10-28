// import-live.mjs — the LIVE-APP → IR import (the keystone the reconciler + Validation engine gate need).
//
// Reads the run's id-map.json (gen→server, written by applyIR — the reliable app→flows tie, since
// `explore` carries no app id and flow names collide across rebuilds), GETs each flow's LIVE metadata
// blob, and reconstructs the ENGINE IR (forms with fields — types, formulas, refs, lists — AS THEY
// ACTUALLY ARE LIVE). This gives the reconciler a real baseline: `validation-gate <liveIR> <desiredIR>`
// then blocks any edit that drifts outside its scope, and kf-comprehension gets a real static model.
//
// v1 reconstructs FORMS/FIELDS from live (the main drift vector — where author-model edits land).
// roles/lists/pages/nav are carried from the run's desired IR (a v2 would reconstruct those from live too).

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { clientFromEnv } from "./client.mjs";
import { slug } from "./util.mjs";

// reconstruct one engine form from its live metadata blob (Model + Field/QueryDefinition/Expression entities)
export function formFromBlob(genId, blob) {
  const root = blob && blob[blob.Root];
  if (!root) return null;
  const fields = (root["Model::Field"] || []).map((fid) => blob[fid]).filter((e) => e && e.Kind === "Field").map((e) => {
    const o = { id: e.Id, name: e.Name, type: e.Type };
    if (e.Required) o.required = true;
    if (e.ReferredList) o.referredList = e.ReferredList;
    const qd = (e["Field::QueryDefinition"] || [])[0] && blob[(e["Field::QueryDefinition"] || [])[0]];
    if (qd && qd.LHSModel && qd.LHSModel !== "User") {
      // a QueryDefinition backs BOTH reference lookups AND aggregates, and both carry LHSModel. Only a
      // lookup QD is a real reference — an aggregate QD (AggregateType present) is a computed value, and
      // importing it as {type, ref} produced a bogus ref on a non-ref type → false drift + lossy round-trip.
      if (qd.AggregateType) o.aggregate = { type: qd.AggregateType, model: qd.LHSModel, ...(qd.AggregateField ? { field: qd.AggregateField } : {}) };
      else o.ref = qd.LHSModel;
    }
    const exId = (e["Field::Expression"] || [])[0];
    if (exId && blob[exId] && blob[exId].ExpressionStr) o.formula = blob[exId].ExpressionStr;
    return o;
  });
  return { id: genId, name: root.Name, flowType: root.FlowType || "Form", fields };
}

export async function importLiveIR({ runDir }) {
  const c = clientFromEnv();
  let map;
  try { map = JSON.parse(readFileSync(join(runDir, "id-map.json"), "utf8")); }
  catch { throw new Error(`no id-map.json in ${runDir} — build the app first (applyIR writes it), or the app wasn't built by this run`); }
  const { app: appId, genToServer = {} } = map;
  // the run's desired IR tells us the flows + their types (form/process/case) to fetch
  let desired;
  for (const name of ["app-spec.engine.json", "app-spec.json"]) {
    try { desired = JSON.parse(readFileSync(join(runDir, name), "utf8")); break; } catch { /* try next */ }
  }
  if (!desired) throw new Error(`no app-spec(.engine).json in ${runDir}`);

  const forms = [];
  for (const f of desired.forms || []) {
    const serverId = genToServer[f.id] || genToServer[`${slug(f.name)}_A00`];
    if (!serverId) continue;
    // Board is a Case-family flow server-side (like flowGrant/fam() handle elsewhere) — its flowType is
    // "Board", so a `=== "Case"` check missed it, getDraft("form",…) 300'd, and every board was dropped
    // from the live baseline → the reconciler mis-diffed boards as added/removed. Route Board→case.
    const type = f.flowType === "Process" ? "process" : /^(case|board)$/i.test(f.flowType || "") ? "case" : "form";
    const d = await c.getDraft(type, serverId);
    if (d.status >= 300) continue;
    const form = formFromBlob(f.id, d.body);
    if (form) forms.push(form);
  }
  // HONEST PROVENANCE (#20). Only forms/fields are reconstructed from LIVE. Everything else is carried
  // from the DESIRED IR, and that must NOT be presented as live truth — a reconciler that compares
  // against "live" state that is actually a copy of desired sees no drift where drift exists, and can
  // overwrite a developer's live change while claiming three-way safety. `_provenance` names, per
  // slice, whether it is genuinely `live` or merely `desired-carried`; the three-way planner and any
  // existing-app apply must treat `desired-carried` slices as UNKNOWN-live (fail closed / do not
  // diff-and-overwrite them) rather than as a reliable baseline.
  return {
    app: { id: appId, name: desired.app?.name },
    roles: desired.roles || [],
    forms,
    lists: desired.lists || [],
    permissions: desired.permissions || [],
    pages: desired.pages || [],
    nav: desired.nav || { menus: [] },
    _provenance: {
      forms: "live",
      roles: "desired-carried", lists: "desired-carried", permissions: "desired-carried",
      pages: "desired-carried", nav: "desired-carried",
    },
    _imported_live: { forms: forms.length, note: "forms/fields reconstructed from live; roles/lists/permissions/pages/nav are DESIRED-CARRIED (not live) — see _provenance. A full live baseline for those is not yet implemented; treat them as unknown-live and do not overwrite on silence." },
  };
}
