// CIQ Workbench schema generator (WORKBENCH-DESIGN.md §4). Node only, no dependencies.
//
//   node scripts/gen-workbench-schema.mjs                    write src/workbench/schema/generated.ts
//   node scripts/gen-workbench-schema.mjs --check            regenerate in memory; exit 1 if the file differs
//   node scripts/gen-workbench-schema.mjs --readback <file>  merge server ids read back after generate (§4.4);
//                                                            the file is copied to src/workbench/schema/readback.json
//                                                            so that later runs and --check keep the ids
//   node scripts/gen-workbench-schema.mjs --roles <file>     merge the live role alignment (role-alignment.json: ir id,
//                                                            live role id, prototype display name, legacyName, persona,
//                                                            technical, new roles with grantsLike); copied without its
//                                                            note to src/workbench/schema/role-alignment.json
//   --spec <path>   default ../runs/current/app-spec.json (resolved from prototype/)
//
// Reads ONLY: spec.app, spec.data_model.flows, spec.workflow.processes, spec.workflow.meta.after_generate_switches,
// spec.workflow.meta.security_handoff.items (cross-check), spec.security.field_permissions, spec.security.roles,
// spec.roles, spec.experience.intended_workbench_landings, the graph-revision file next to the spec, and the merged
// read-back and role alignment files in src/workbench/schema/.
// NEVER reads spec.forms (stale), .env, .kf-env or ~/.claude/**.
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync, copyFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const DEFAULT_SPEC = path.resolve(root, "..", "runs", "current", "app-spec.json");
export const OUT = path.join(root, "src", "workbench", "schema", "generated.ts");
export const READBACK = path.join(root, "src", "workbench", "schema", "readback.json");
export const ROLE_ALIGN = path.join(root, "src", "workbench", "schema", "role-alignment.json");
const SPEC_LABEL = "runs/current/app-spec.json";

export class SchemaGuardError extends Error {}
const fail = (n, msg) => {
  throw new SchemaGuardError(`schema guard ${n} failed: ${msg}`);
};

const EN_DASH = "–";
const DEPT_ORDER = ["REG", "SAF", "QM", "MIC", "SUS", "RMM"];
const STEP_ID_RE = /\b(?:CASE|OPNT|CHRQ)_[A-Z0-9_]*(?:\*|[A-Z0-9])/g;

/** Drops parenthesised internal rule/test/decision ids, e.g. " (SEC-HR2)", from spec prose copied into the bundle
 *  (the Workbench zip guard refuses them; review fix F-09). */
export const stripInternalRefs = (text) => text.replace(/\s*\((?:SEC-HR\d+|K-[A-Z0-9-]+|WB-D\d+|D\d{2}|Q\d+|BR-\d{3})\)/g, "");

/** Short alias for the F map: CIQ_Case_A00 → Case. */
const aliasOf = (flowId) => flowId.replace(/^CIQ_/, "").replace(/_A00$/, "");

/** Every step of a process, depth first, with its parallel block and branch index. */
function flattenSteps(steps, out = [], parallel) {
  for (const s of steps) {
    out.push({ s, parallel });
    if (s.kind === "Parallel" && Array.isArray(s.branches))
      s.branches.forEach((b, i) => flattenSteps(b.steps || [], out, { block: s.id, branchIndex: i }));
  }
  return out;
}

/** Step ids named in a switch text, `X_*` wildcards expanded against the flow's steps. */
function stepIdsIn(text, flowSteps) {
  const ids = new Set();
  for (const m of text.match(STEP_ID_RE) || []) {
    if (m.endsWith("*")) {
      const prefix = m.slice(0, -1);
      for (const s of flowSteps) if (s.id.startsWith(prefix)) ids.add(s.id);
    } else ids.add(m);
  }
  return [...ids];
}

/** The ON steps of a switch text such as "ON only at A, B (…); OFF at C". "OFF …" alone gives none. */
function onSteps(text, flowSteps) {
  if (typeof text !== "string") return [];
  const t = text.trim();
  if (!/^ON\b/.test(t)) return [];
  const onPart = t.split(";")[0].split(/\bOFF\b/)[0];
  return stepIdsIn(onPart, flowSteps);
}

/**
 * Builds the schema object from the spec. Throws SchemaGuardError when a §4.3 guard is false.
 * @param {any} spec the parsed app-spec.json
 * @param {{ sha256?: string, revision?: number|null, readback?: any }} meta
 */
export function buildSchema(spec, meta = {}) {
  const dm = spec?.data_model?.flows;
  if (!dm) fail(0, "spec.data_model.flows is missing");
  const procs = spec?.workflow?.processes;
  if (!procs) fail(0, "spec.workflow.processes is missing");
  const fp = spec?.security?.field_permissions;
  if (!fp) fail(0, "spec.security.field_permissions is missing");

  const appId = spec?.app?.id;
  if (!appId) fail(0, "spec.app.id is missing");

  // ---- flows, fields, child tables, lists
  const FLOWS = {};
  const FIELDS = {};
  const CHILD_TABLES = {};
  const LISTS = {};
  const F = {};
  const formulas = []; // { flow, table?, id, formula }
  for (const [id, def] of Object.entries(dm)) {
    if (def.flowType) {
      FLOWS[id] = { id, name: def.name, kind: def.flowType === "Process" ? "Process" : "Form" };
      const fields = {};
      for (const f of def.fields || []) {
        const out = { id: f.id, name: f.name, type: f.type };
        if (f.referredList) out.list = f.referredList;
        if (f.formula) {
          out.formula = f.formula;
          out.computed = true;
          formulas.push({ flow: id, id: f.id, formula: f.formula });
        }
        if (f.required) out.required = true;
        if (f.ref) out.ref = f.ref;
        fields[f.id] = out;
      }
      FIELDS[id] = fields;
      F[aliasOf(id)] = Object.fromEntries(Object.keys(fields).map((k) => [k, k]));
      for (const t of def.child_tables || []) {
        const cols = {};
        for (const f of t.fields || []) {
          const out = { id: f.id, name: f.name, type: f.type };
          if (f.referredList) out.list = f.referredList;
          if (f.formula) {
            out.formula = f.formula;
            out.computed = true;
            formulas.push({ flow: id, table: t.id, id: f.id, formula: f.formula });
          }
          if (f.required) out.required = true;
          cols[f.id] = out;
        }
        if (CHILD_TABLES[t.id]) fail(0, `child table id ${t.id} is not unique`);
        CHILD_TABLES[t.id] = { flow: id, id: t.id, name: t.name, serverModelId: null, fields: cols };
        F[t.id] = Object.fromEntries(Object.keys(cols).map((k) => [k, k]));
      }
    } else if (Array.isArray(def.items)) {
      LISTS[id] = [...def.items];
    }
  }

  // Guards 1–4
  const opOutcome = LISTS.CIQ_OP_Outcome;
  if (JSON.stringify(opOutcome) !== JSON.stringify(["Accepted", "Withdrawn"])) fail(1, `CIQ_OP_Outcome is ${JSON.stringify(opOutcome)}, expected ["Accepted","Withdrawn"]`);
  const cat = LISTS.CIQ_Event_Category || [];
  if (cat.length !== 17 || !cat.includes("Final PDF")) fail(2, `CIQ_Event_Category has ${cat.length} items${cat.includes("Final PDF") ? "" : " and no \"Final PDF\""}; expected 17 including "Final PDF"`);
  if (!LISTS.CIQ_Round_Outcome) fail(3, "CIQ_Round_Outcome does not exist");
  const counts = { CIQ_Case_A00: 125, CIQ_Open_Point_A00: 53, CIQ_Change_Request_A00: 49 };
  for (const [flow, n] of Object.entries(counts)) {
    const got = Object.keys(FIELDS[flow] || {}).length;
    if (got !== n) fail(4, `${flow} has ${got} fields, expected ${n}`);
  }

  // ---- steps
  const STEPS = {};
  const STEP_BY_NAME = {};
  const fieldAssignedText = (spec.workflow?.meta?.after_generate_switches?.other_after_generate || []).join("\n");
  const fieldAssigned = {};
  for (const m of fieldAssignedText.matchAll(/\b((?:CASE|OPNT|CHRQ)_[A-Z0-9_]+)\s*->\s*([A-Za-z0-9_]+)/g)) fieldAssigned[m[1]] = m[2];

  for (const [flow, proc] of Object.entries(procs)) {
    if (!FLOWS[flow]) fail(0, `process ${flow} has no data model`);
    STEP_BY_NAME[flow] = {};
    const flat = flattenSteps(proc.steps || []);
    flat.forEach(({ s, parallel }, order) => {
      const kind = s.kind;
      if (!["Start", "UserTask", "Parallel", "End"].includes(kind)) fail(0, `step ${s.id} has unknown kind ${kind}`);
      // Guard 5: every "X – Y" name uses U+2013
      for (const m of String(s.name).matchAll(/\s([-‒–—―])\s/g)) if (m[1] !== EN_DASH) fail(5, `step ${s.id} name "${s.name}" uses U+${m[1].charCodeAt(0).toString(16).toUpperCase().padStart(4, "0")} instead of an en dash (U+2013)`);
      if (STEP_BY_NAME[flow][s.name]) fail(0, `step name "${s.name}" repeats in ${flow}`);
      STEP_BY_NAME[flow][s.name] = s.id;
      const step = { flow, irId: s.id, name: s.name, kind, ownerRole: s.assignee_role ?? null };
      if (fieldAssigned[s.id]) step.fieldAssigned = fieldAssigned[s.id];
      if (s.condition) step.condition = s.condition;
      if (parallel) step.parallel = parallel;
      step.order = order;
      step.serverActivityId = null;
      const perms = {};
      const gates = [];
      if (kind === "Start" || kind === "UserTask") {
        const p = fp[flow]?.[s.id];
        if (!p) fail(8, `${flow}.${s.id} (${kind}) is missing from security.field_permissions`);
        for (const [key, level] of Object.entries(p)) {
          const isTable = !!CHILD_TABLES[key] && CHILD_TABLES[key].flow === flow;
          const field = FIELDS[flow][key];
          if (!field && !isTable) fail(7, `field_permissions ${flow}.${s.id} names ${key}, which is not in data_model`);
          if (level !== "Mandatory" && level !== "Editable") continue;
          if (field?.computed) {
            // a computed field is never writable (WB-13): Mandatory means "must read OK" (a gate); Editable is a spec error
            if (level !== "Mandatory") fail(9, `computed ${flow}.${key} is ${level} at ${s.id}: a formula field can only be ReadOnly or a Mandatory gate`);
            gates.push(key);
            continue;
          }
          perms[key] = level;
        }
      }
      step.perms = perms;
      step.gates = gates;
      STEPS[s.id] = step;
    });
  }
  for (const flow of Object.keys(fp)) for (const stepId of Object.keys(fp[flow])) if (!STEPS[stepId]) fail(7, `field_permissions names step ${flow}.${stepId}, which is not in workflow.processes`);

  // Guard 6: field_permissions equals security_handoff.items
  const items = spec.workflow?.meta?.security_handoff?.items || [];
  const mism = [];
  for (const it of items) {
    const p = fp[it.flow]?.[it.step];
    if (!p) {
      mism.push(`${it.flow}.${it.step}: not in field_permissions`);
      continue;
    }
    const of = (lvl) => Object.entries(p).filter(([, v]) => v === lvl).map(([k]) => k).sort();
    const eq = (a, b) => JSON.stringify(a) === JSON.stringify([...(b || [])].sort());
    if (!eq(of("Mandatory"), it.Mandatory)) mism.push(`${it.flow}.${it.step}: Mandatory differs`);
    if (!eq(of("Editable"), it.Editable)) mism.push(`${it.flow}.${it.step}: Editable differs`);
  }
  const handed = new Set(items.map((i) => `${i.flow}.${i.step}`));
  for (const flow of Object.keys(fp)) for (const stepId of Object.keys(fp[flow])) if (!handed.has(`${flow}.${stepId}`)) mism.push(`${flow}.${stepId}: not in security_handoff.items`);
  if (mism.length) fail(6, `field_permissions ≠ security_handoff.items (${mism.length} mismatches): ${mism.slice(0, 5).join("; ")}`);

  // Guard 9: computed fields only in gates
  for (const fo of formulas) {
    const def = fo.table ? CHILD_TABLES[fo.table].fields[fo.id] : FIELDS[fo.flow][fo.id];
    if (!def.computed) fail(9, `${fo.flow}.${fo.id} has a formula but is not computed`);
    for (const st of Object.values(STEPS)) if (st.flow === fo.flow && st.perms[fo.id]) fail(9, `computed ${fo.flow}.${fo.id} appears in ${st.irId}.perms`);
  }

  // ---- switches
  const sw = spec.workflow?.meta?.after_generate_switches || {};
  const SWITCHES = {};
  for (const flow of Object.keys(procs)) {
    const flowSteps = Object.values(STEPS).filter((s) => s.flow === flow).map((s) => ({ id: s.irId }));
    const rejectOn = new Set(onSteps(sw[flow]?.reject, flowSteps));
    const sendBackOn = new Set(onSteps(sw[flow]?.send_back, flowSteps));
    for (const st of Object.values(STEPS)) if (st.flow === flow && st.kind === "UserTask") SWITCHES[st.irId] = { reject: rejectOn.has(st.irId), sendBack: sendBackOn.has(st.irId) };
  }

  // ---- roles, grants
  const landings = spec.experience?.intended_workbench_landings || {};
  // Role alignment (guard 13): the display name is the prototype's persona name; legacyName is the live name before the
  // rename; the live role id is the serverId. Roles not in spec.roles are new and copy the grants of `grantsLike`.
  const align = meta.roleAlignment?.roles ?? [];
  const alignOf = {};
  for (const a of align) {
    if (!a?.ir || !a.name) fail(13, `role alignment entry ${JSON.stringify(a)} has no ir or name`);
    if (alignOf[a.ir]) fail(13, `role alignment names ${a.ir} twice`);
    alignOf[a.ir] = a;
  }
  const ROLES = {};
  for (const r of spec.roles || []) {
    const a = alignOf[r.id];
    if (a && r.name !== a.name && r.name !== a.legacyName) fail(13, `spec role ${r.id} "${r.name}" is neither the aligned name "${a.name}" nor its legacyName "${a.legacyName}"`);
    ROLES[r.id] = {
      irId: r.id,
      name: a?.name ?? r.name,
      legacyName: a ? (a.legacyName ?? null) : null,
      persona: a?.persona ?? null,
      technical: !!a?.technical,
      journeys: [...(r.journeys || [])],
      landing: typeof landings[r.id] === "string" ? stripInternalRefs(landings[r.id]) : "",
      serverId: a?.id ? String(a.id) : null,
    };
  }
  const newRoles = align.filter((a) => !ROLES[a.ir]);
  for (const a of newRoles) {
    const like = ROLES[a.grantsLike];
    if (!like) fail(13, `new role ${a.ir} names grantsLike "${a.grantsLike}", which is not in spec.roles`);
    ROLES[a.ir] = { irId: a.ir, name: a.name, legacyName: a.legacyName ?? null, persona: a.persona ?? null, technical: !!a.technical, journeys: [...like.journeys], landing: "Read-only.", serverId: a.id ? String(a.id) : null };
  }
  const seen = {};
  for (const r of Object.values(ROLES))
    for (const n of [r.name, r.legacyName].filter(Boolean)) {
      if (seen[n] && seen[n] !== r.irId) fail(13, `role name "${n}" matches both ${seen[n]} and ${r.irId}`);
      seen[n] = r.irId;
    }
  const GRANTS = {};
  for (const [roleId, def] of Object.entries(spec.security?.roles || {})) {
    if (!ROLES[roleId]) fail(0, `security.roles.${roleId} is not in spec.roles`);
    GRANTS[roleId] = {};
    for (const flow of Object.keys(FLOWS)) {
      const c = def.flows?.[flow];
      const g = { cell: c?.plan_cell ?? "—", capability: c?.role_capability ?? "" };
      if (c?.steps) g.steps = { ...c.steps };
      GRANTS[roleId][flow] = g;
    }
  }
  for (const a of newRoles) GRANTS[a.ir] = JSON.parse(JSON.stringify(GRANTS[a.grantsLike] ?? fail(13, `grantsLike ${a.grantsLike} has no grants`)));

  // ---- departments
  const deptOf = (st, re) => (st.condition ? (st.condition.match(re) || [])[1] : undefined);
  const DEPT_STEPS = {};
  for (const d of DEPT_ORDER) DEPT_STEPS[d] = { reviewerRole: null, caseLaneStep: null, opReviewStep: null, crAssessStep: null };
  for (const st of Object.values(STEPS)) {
    let d;
    if (st.flow === "CIQ_Case_A00" && st.parallel && (d = deptOf(st, /^Dept_([A-Z]+)_Active = "Yes"$/))) {
      DEPT_STEPS[d].caseLaneStep = st.irId;
      DEPT_STEPS[d].reviewerRole = st.ownerRole;
    } else if (st.flow === "CIQ_Open_Point_A00" && (d = deptOf(st, /^OP_Dept = "([A-Z]+)"$/))) DEPT_STEPS[d].opReviewStep = st.irId;
    else if (st.flow === "CIQ_Change_Request_A00" && st.parallel && (d = deptOf(st, /^Impact_([A-Z]+) = "Yes"$/))) DEPT_STEPS[d].crAssessStep = st.irId;
    if (d && !DEPT_ORDER.includes(d)) fail(0, `unknown department ${d} in ${st.irId}`);
  }
  if (JSON.stringify(LISTS.CIQ_Review_Dept) !== JSON.stringify(DEPT_ORDER)) fail(0, `CIQ_Review_Dept is ${JSON.stringify(LISTS.CIQ_Review_Dept)}, expected ${JSON.stringify(DEPT_ORDER)}`);
  for (const d of DEPT_ORDER) if (!DEPT_STEPS[d].caseLaneStep || !DEPT_STEPS[d].opReviewStep) fail(0, `department ${d} has no case lane or OP review step`);

  // Guard 10: CR_DEPT_FIELDS
  const crFields = FIELDS.CIQ_Change_Request_A00;
  const CR_DEPT_FIELDS = {};
  for (const d of DEPT_ORDER) {
    if (!crFields[`Impact_${d}`]) continue;
    const e = { impact: `Impact_${d}`, assessment: `${d}_Assessment`, note: `${d}_Assess_Note`, by: `${d}_Assessed_By`, at: `${d}_Assessed_At` };
    for (const id of Object.values(e)) if (!crFields[id]) fail(10, `CR_DEPT_FIELDS.${d} names ${id}, which is not a CIQ_Change_Request_A00 field`);
    CR_DEPT_FIELDS[d] = e;
  }
  if (JSON.stringify(Object.keys(CR_DEPT_FIELDS)) !== JSON.stringify(["REG", "SAF", "QM", "MIC", "SUS"])) fail(10, `CR_DEPT_FIELDS has ${Object.keys(CR_DEPT_FIELDS).join(",")}, expected REG,SAF,QM,MIC,SUS (no RMM)`);

  // LANE_FIELDS
  const LANE_FIELDS = {};
  for (const d of DEPT_ORDER) LANE_FIELDS[d] = Object.keys(STEPS[DEPT_STEPS[d].caseLaneStep].perms);

  // Guard 11: POST_CREATE_KEYS ⊆ mandatoryAt(CASE_S0)
  const POST_CREATE_KEYS = { CIQ_Case_A00: ["Case_Code", "Request_Key"] };
  for (const [flow, keys] of Object.entries(POST_CREATE_KEYS)) {
    const start = Object.values(STEPS).find((s) => s.flow === flow && s.kind === "Start");
    for (const k of keys) if (start?.perms[k] !== "Mandatory") fail(11, `POST_CREATE_KEYS.${flow} names ${k}, which is not Mandatory at ${start?.irId}`);
  }

  // Guard 12: ADMIN_WRITE_ALLOW
  const isCount = (k) => /_Open_Count$|_RMES_Gaps$/.test(k);
  const ADMIN_WRITE_ALLOW = { "lane.repair": { flow: "CIQ_Case_A00", fields: Object.fromEntries(DEPT_ORDER.map((d) => [d, LANE_FIELDS[d].filter((k) => !isCount(k))])) } };
  const allowKeys = Object.keys(ADMIN_WRITE_ALLOW);
  if (allowKeys.length !== 1 || allowKeys[0] !== "lane.repair") fail(12, `ADMIN_WRITE_ALLOW holds ${allowKeys.join(",")}`);
  for (const d of DEPT_ORDER) for (const k of ADMIN_WRITE_ALLOW["lane.repair"].fields[d]) if (!LANE_FIELDS[d].includes(k)) fail(12, `ADMIN_WRITE_ALLOW lane.repair ${d} names ${k}, which is not a lane field`);

  // ---- read-back ids (§4.4)
  const rb = meta.readback;
  if (rb) {
    for (const [name, id] of Object.entries(rb.roles || {})) {
      const r = Object.values(ROLES).find((x) => x.name === name || x.legacyName === name);
      if (!r) continue;
      if (r.serverId && r.serverId !== String(id)) fail(13, `role ${r.irId}: read-back id ${id} differs from the aligned id ${r.serverId}`);
      r.serverId = String(id);
    }
    for (const [flow, byName] of Object.entries(rb.steps || {}))
      for (const [name, act] of Object.entries(byName || {})) {
        const ir = STEP_BY_NAME[flow]?.[name];
        if (ir) STEPS[ir].serverActivityId = String(act);
      }
    for (const [flow, byTable] of Object.entries(rb.childModels || {}))
      for (const [table, id] of Object.entries(byTable || {})) if (CHILD_TABLES[table]?.flow === flow) CHILD_TABLES[table].serverModelId = String(id);
  }

  return {
    APP_ID: appId,
    SPEC: { path: SPEC_LABEL, revision: meta.revision ?? null, sha256: meta.sha256 ?? null },
    FLOWS,
    FIELDS,
    F,
    CHILD_TABLES,
    LISTS,
    STEPS,
    STEP_BY_NAME,
    SWITCHES,
    ROLES,
    GRANTS,
    DEPTS: DEPT_ORDER,
    DEPT_STEPS,
    CR_DEPT_FIELDS,
    LANE_FIELDS,
    POST_CREATE_KEYS,
    ADMIN_WRITE_ALLOW,
  };
}

const DOCS = {
  APP_ID: "The CIQ Digital app id (spec.app.id). The handshake's app id must equal it, or every write is refused.",
  SPEC: "Source spec: path, graph revision and sha256 of app-spec.json.",
  FLOWS: "The 3 Processes and 8 Forms (spec.data_model.flows.<id>.{name,flowType}).",
  FIELDS: "Header fields per flow. computed: true on every formula field (never written, never an input).",
  F: "Field ids per flow alias (and per child table) for autocompletion: F.Case.REG_Gate === \"REG_Gate\".",
  CHILD_TABLES: "Child tables by table id. serverModelId stays null until read-back; the key is Table::<serverModelId ?? id>.",
  LISTS: "Value lists.",
  STEPS: "Steps per IR id. perms: writable fields (Mandatory/Editable; computed fields never). gates: computed fields that must read \"OK\" before submit.",
  STEP_BY_NAME: "Exact step name (en dash U+2013 included) → IR id, per flow. Names repeat across flows.",
  SWITCHES: "Native reject / send-back per UserTask step (spec.workflow.meta.after_generate_switches).",
  ROLES: "Roles by IR id. name = the prototype's persona name; legacyName = the live name before the rename; persona = the prototype persona id (null for platform and technical roles). Matched by serverId, then name, then legacyName.",
  GRANTS: "Plan cell per role and flow: I (initiate), M (own steps), E (form edit), V (view), A (flow Admin), — (none).",
  DEPTS: "Review departments in list order.",
  DEPT_STEPS: "Per department: reviewer role, case lane step, OP review step, CR assess step (none for RMM).",
  CR_DEPT_FIELDS: "Change request impact/assessment fields per department that has them (no RMM).",
  LANE_FIELDS: "Non-computed writable fields of each case lane step CASE_B_<D>.",
  POST_CREATE_KEYS: "Mandatory at Start but derived from the new _id: exempt from the pre-create check (§7.6).",
  ADMIN_WRITE_ALLOW: "The ONLY admin-route write (§7.10): lane fields minus counts, per department.",
};

/** The generated.ts text. Deterministic for one spec and read-back. */
export function renderTs(schema) {
  const lines = [
    "// GENERATED by scripts/gen-workbench-schema.mjs — DO NOT EDIT BY HAND. Regenerate: npm run gen:workbench",
    `// Spec: ${schema.SPEC.path} · graph revision ${schema.SPEC.revision} · sha256 ${schema.SPEC.sha256}`,
    "// Reads spec.data_model, spec.security, spec.workflow, spec.roles and spec.experience.intended_workbench_landings only;",
    "// never spec.forms (stale). Server ids stay null until a read-back file is merged (WORKBENCH-DESIGN.md §4.4).",
    "// Role names, personas and new roles come from schema/role-alignment.json (npm run gen:workbench -- --roles <file>).",
    "/* eslint-disable */",
    "",
  ];
  for (const key of Object.keys(DOCS)) {
    lines.push(`/** ${DOCS[key]} */`);
    lines.push(`export const ${key} = ${JSON.stringify(schema[key], null, 2)} as const;`);
    lines.push("");
  }
  lines.push(
    "export type FlowId = keyof typeof FLOWS;",
    "export type StepIr = keyof typeof STEPS;",
    "export type RoleIr = keyof typeof ROLES;",
    "export type Dept = (typeof DEPTS)[number];",
    "export type ListId = keyof typeof LISTS;",
    "export type ChildTableId = keyof typeof CHILD_TABLES;",
    "",
  );
  return lines.join("\n");
}

export function readSpec(specPath = DEFAULT_SPEC) {
  const buf = readFileSync(specPath);
  const sha256 = createHash("sha256").update(buf).digest("hex");
  const spec = JSON.parse(buf.toString("utf8"));
  let revision = null;
  const revFile = specPath + ".graph-revision.json";
  if (existsSync(revFile)) {
    const rev = JSON.parse(readFileSync(revFile, "utf8"));
    revision = typeof rev.revision === "number" ? rev.revision : null;
    if (rev.digest && rev.digest !== sha256) throw new SchemaGuardError(`spec sha256 ${sha256} differs from the graph revision digest ${rev.digest}`);
  }
  return { spec, sha256, revision };
}

export function generate({ specPath = DEFAULT_SPEC, readbackPath = READBACK, rolesPath = ROLE_ALIGN } = {}) {
  const { spec, sha256, revision } = readSpec(specPath);
  const readback = existsSync(readbackPath) ? JSON.parse(readFileSync(readbackPath, "utf8")) : undefined;
  const roleAlignment = existsSync(rolesPath) ? JSON.parse(readFileSync(rolesPath, "utf8")) : undefined;
  return renderTs(buildSchema(spec, { sha256, revision, readback, roleAlignment }));
}

function main(argv) {
  const arg = (name) => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const specPath = path.resolve(arg("--spec") ?? DEFAULT_SPEC);
  const rbIn = arg("--readback");
  if (rbIn) {
    JSON.parse(readFileSync(rbIn, "utf8")); // must parse
    copyFileSync(rbIn, READBACK);
    console.log(`read-back ids copied to ${path.relative(root, READBACK)}`);
  }
  const rolesIn = arg("--roles");
  if (rolesIn) {
    const ra = JSON.parse(readFileSync(rolesIn, "utf8"));
    if (!Array.isArray(ra.roles)) throw new SchemaGuardError(`${rolesIn} has no roles array`);
    // the note is prose for builders: only the source path and the rows are kept
    writeFileSync(ROLE_ALIGN, JSON.stringify({ source: path.relative(path.resolve(root, ".."), path.resolve(rolesIn)), roles: ra.roles }, null, 1) + "\n");
    console.log(`role alignment copied to ${path.relative(root, ROLE_ALIGN)}`);
  }
  const text = generate({ specPath });
  if (argv.includes("--check")) {
    const cur = existsSync(OUT) ? readFileSync(OUT, "utf8") : "";
    if (cur !== text) {
      console.error(`${path.relative(root, OUT)} is out of date with the spec: run npm run gen:workbench`);
      process.exit(1);
    }
    console.log(`${path.relative(root, OUT)} is up to date`);
    return;
  }
  writeFileSync(OUT, text);
  console.log(`wrote ${path.relative(root, OUT)} (${(text.length / 1024).toFixed(0)} KB)`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    main(process.argv.slice(2));
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(1);
  }
}
