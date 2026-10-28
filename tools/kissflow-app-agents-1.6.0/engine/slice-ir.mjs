#!/usr/bin/env node
// slice-ir.mjs — hand an agent the part of the IR it actually needs.
//
// THE MEASUREMENT. A mature App-Spec is enormous, and every agent that opens one pays for all of it:
//
//   runs/maritime-fp/app-spec.json    709 KB   ~177,000 tokens
//   runs/health-payer/app-spec.json   548 KB   ~137,000 tokens
//
// One Read of the first nearly fills a 200k context. Fan five role agents out over the same spec and
// the run has spent close to a million tokens before a single page is designed — on a document where
// the data architect needed the flows, the security designer needed the roles, and neither needed
// the other's half.
//
// So each agent gets a slice. The slices are declared per ROLE rather than per call, because the
// question "what does the workflow designer need?" has one right answer and it belongs in one place.
//
//   node engine/slice-ir.mjs <ir.json> --for data-architect --out slice.json
//   node engine/slice-ir.mjs <ir.json> --for security --stats     (report, write nothing)
//
// A slice is always a VALID IR: app and roles ride along everywhere, because an agent that cannot
// name the app or its roles produces work nobody can place.
import { readFileSync, writeFileSync } from "node:fs";

// What each role reads. Anything not listed is not passed — silence is the point.
// `flows: "shallow"` keeps each flow's identity and shape but drops its fields, which is what an
// agent needs when it must REFERENCE a flow without designing inside it.
export const SLICES = {
  "data-architect":   { forms: true, lists: true, childTables: true, domain: true, architecture: true },
  // FORMS ARE NEVER SHALLOW. "shallow" keeps a flow's identity and drops its fields, and every
  // consumer here has to NAME fields to do its job: the workflow designer writes field_permissions
  // keyed by field name (STEP_PERM_FIELD_MISSING is the validator that catches getting it wrong), the
  // security designer builds field-level permission matrices, the integration analyst writes
  // automation field_map entries like {"Parts Status": "Approved"}, and the experience designer binds
  // widgets to fields. An agent handed fieldCount instead of names invents them.
  //
  // And it bought almost nothing: fields in a real spec are already terse ({"name":"GSTIN",
  // "type":"Text"}), so dropping their detail is ~21% of the field list. The savings in these slices
  // come from omitting whole SECTIONS a role does not need — pages from the data architect, the data
  // model from security — not from hollowing out the one section they all read.
  "workflow":         { forms: true, roles: true, workflow: true, permissions: true, domain: true },
  "security":         { forms: true, roles: true, permissions: true, workflow: "steps", domain: true },
  "experience":       { forms: true, roles: true, permissions: true, pages: true, nav: true, experience: true },
  // forms FULL, not shallow: the prototype builder renders create forms and line-item sections, so it
  // needs each entity's fields and child tables — "shallow" keeps a flow's identity and drops exactly
  // the part it is here to draw. Caught when the slices were first wired into the agent prompts
  // (2026-08-16): the agent's own brief says "READ data_model for each entity's fields", and the slice
  // it was being pointed at returned fieldCount and no fields. A smaller slice that omits what the
  // agent came for does not save anything — it produces a prototype with empty forms.
  "prototype":        { forms: true, roles: true, pages: true, nav: true, experience: true },
  "integration":      { forms: true, roles: true, workflow: true, automations: true },
  "seed":             { forms: true, lists: true },
  "verify":           { forms: true, roles: true, permissions: true, workflow: true, pages: true, nav: true },
};

const KEEP_ALWAYS = ["app"];

/** A flow with its fields removed — identity, type and relationships only. */
const shallowForm = (f) => ({
  id: f.id, name: f.name, flowType: f.flowType,
  ...(f.childOf ? { childOf: f.childOf } : {}),
  ...(f.fields ? { fieldCount: f.fields.length } : {}),
  // reference targets are how flows relate; an agent that cannot see them cannot reason about the graph
  ...(f.fields ? { refs: [...new Set(f.fields.filter((x) => x.ref).map((x) => x.ref))] } : {}),
});

export function sliceIR(ir, role) {
  const want = SLICES[role];
  if (!want) throw new Error(`unknown slice "${role}" — one of: ${Object.keys(SLICES).join(", ")}`);
  const out = {};
  for (const k of KEEP_ALWAYS) if (ir[k] !== undefined) out[k] = ir[k];
  // roles are cheap and orient everything — carried whenever asked for, and they always are
  if (want.roles && ir.roles) out.roles = ir.roles;
  if (want.forms === true && ir.forms) out.forms = ir.forms;
  else if (want.forms === "shallow" && ir.forms) out.forms = ir.forms.map(shallowForm);
  if (want.lists && ir.lists) out.lists = ir.lists;
  if (want.childTables && ir.childTables) out.childTables = ir.childTables;
  if (want.permissions && ir.permissions) out.permissions = ir.permissions;
  if (want.pages && ir.pages) out.pages = ir.pages;
  if (want.nav && ir.nav) out.nav = ir.nav;
  if (want.automations && ir.automations) out.automations = ir.automations;
  if (want.domain && ir.domain) out.domain = ir.domain;
  if (want.architecture && ir.architecture) out.architecture = ir.architecture;
  if (want.experience && ir.experience) out.experience = ir.experience;
  if (want.workflow === true && ir.workflow) out.workflow = ir.workflow;
  else if (want.workflow === "steps" && ir.workflow) {
    // the security designer needs to know WHICH steps exist to grant against, not their conditions
    // A step inside a parallel BRANCH is still a step someone has to be granted at — dropping the
    // arms handed the security designer a workflow with no "Board Sign-off" in it, so nothing could
    // be granted there. Keep the arms, in the same reduced shape.
    const thin = (s) => ({ id: s.id, name: s.name, assignee_role: s.assignee_role,
      ...(Array.isArray(s.branches) && s.branches.length
        ? { branches: s.branches.filter((b) => b && Array.isArray(b.steps)).map((b) => ({ name: b.name, steps: b.steps.map(thin) })) }
        : {}) });
    const w = {};
    for (const [fid, p] of Object.entries(ir.workflow.processes || {})) w[fid] = { steps: (p.steps || []).map(thin) };
    out.workflow = { processes: w };
  }
  out._slice = role;   // so a downstream reader knows it is holding a part, not the whole
  return out;
}

/** Bytes and approximate tokens, before and after. */
export function sliceStats(ir, role) {
  const whole = JSON.stringify(ir).length;
  const part = JSON.stringify(sliceIR(ir, role)).length;
  return { role, wholeBytes: whole, sliceBytes: part,
    wholeTokens: Math.round(whole / 4), sliceTokens: Math.round(part / 4),
    saved: whole ? Math.round((1 - part / whole) * 100) : 0 };
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop());
if (isMain) {
  const src = process.argv[2];
  const role = (process.argv.includes("--for") && process.argv[process.argv.indexOf("--for") + 1]) || "";
  const out = process.argv.includes("--out") && process.argv[process.argv.indexOf("--out") + 1];
  if (!src || !role) {
    console.error(`usage: slice-ir.mjs <ir.json> --for <${Object.keys(SLICES).join("|")}> [--out slice.json] [--stats]`);
    process.exit(2);
  }
  const { normalizeIR } = await import("./builders.mjs");
  const ir = normalizeIR(JSON.parse(readFileSync(src, "utf8")));
  if (process.argv.includes("--stats") || !out) {
    for (const r of role === "all" ? Object.keys(SLICES) : [role]) {
      const s = sliceStats(ir, r);
      console.log(`${r.padEnd(16)} ${String(s.wholeTokens).padStart(7)} → ${String(s.sliceTokens).padStart(6)} tokens   ${String(s.saved).padStart(3)}% smaller`);
    }
    if (!out) process.exit(0);
  }
  writeFileSync(out, JSON.stringify(sliceIR(ir, role)));
  console.error(`sliced ${role} → ${out}`);
}
