// Shared, NETWORK-FREE helpers for the post-generate scripts (readback.mjs, acceptance.mjs).
// Loads the plan (runs/current/app-spec.json, graph rev 31) and the dry-run build output (runs/current/preview-rev31),
// and turns any metadata blob (preview or live) into one comparable description.
// Nothing in this file imports a network client or reads .env.
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

export const ROOT = fileURLToPath(new URL("../../../../", import.meta.url));
export const POSTGEN = fileURLToPath(new URL("../", import.meta.url));
export const RUN_DIR = join(ROOT, "runs", "current");
export const SPEC_FILE = join(RUN_DIR, "app-spec.json");
export const PREVIEW_DIR = join(RUN_DIR, "preview-rev31");
export const PREVIEW_LOG = join(RUN_DIR, "preview-rev31.log");
export const GENERATED_DIR = join(RUN_DIR, "generated"); // App Builder writes its apply log / id-map here (cross-check only)
export const EXPECTED_REVISION = 31;
export const APP = "CIQ_Digital_A00";
export const THOMAS = { _id: "UsEJUfjYLM8Y", Name: "Thomas" };
export const BASELINE = {
  // Admin/User existed before generate (inventory-2026-10-06.json) and must be REUSED, not recreated.
  roleIds: { Admin: "RoEK3_3Jy9XU", User: "RoEK3_3NtdWL" },
  // The approved spike harness lives in the same app (SPIKES.md). It is reported, never counted as a mismatch.
  testPrefix: "CIQ ZZ Spike",
  // The app's own home page from before generate (runs/zz-spike/generated/id-map.json: "Home Page" → Home_Page_A00).
  pages: ["Home_Page_A00"],
};

// ---------------------------------------------------------------------------------------------------------------
// Plan + preview
// ---------------------------------------------------------------------------------------------------------------
const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));

export function loadPlan() {
  const spec = readJson(SPEC_FILE);
  const revFile = `${SPEC_FILE}.graph-revision.json`;
  const rev = existsSync(revFile) ? readJson(revFile).revision : null;
  const dir = (sub, suffix) =>
    existsSync(join(PREVIEW_DIR, sub))
      ? readdirSync(join(PREVIEW_DIR, sub)).filter((f) => f.endsWith(suffix)).sort().map((f) => ({ key: f.slice(0, -suffix.length), json: readJson(join(PREVIEW_DIR, sub, f)) }))
      : [];
  const preview = {
    families: existsSync(PREVIEW_DIR) ? readdirSync(PREVIEW_DIR).sort() : [],
    processes: dir("process", ".blob.json").map((x) => x.json),
    processShells: Object.fromEntries(dir("process", ".shell.json").map((x) => [x.key, x.json])),
    forms: dir("form", ".blob.json").map((x) => x.json),
    formShells: Object.fromEntries(dir("form", ".shell.json").map((x) => [x.key, x.json])),
    lists: dir("list", ".doc.json").map((x) => x.json),
    roles: dir("role", ".doc.json").map((x) => x.json),
    permissions: dir("permission", ".blob.json").map((x) => x.json),
    integrations: dir("integration", ".blob.json").map((x) => x.json),
    integrationShells: Object.fromEntries(dir("integration", ".shell.json").map((x) => [x.key, x.json])),
    log: existsSync(PREVIEW_LOG) ? readFileSync(PREVIEW_LOG, "utf8") : "",
  };
  return { spec, rev, preview };
}

// ---------------------------------------------------------------------------------------------------------------
// Blob description (same function for preview and live; id→name mappers make the two comparable)
// ---------------------------------------------------------------------------------------------------------------
export const entities = (blob, kind) => Object.values(blob || {}).filter((v) => v && typeof v === "object" && v.Kind === kind && (!kind || v.Kind === kind));

/** Whitespace outside double quotes is dropped, so `A = "B"` and `A="B"` compare equal. */
export function normFx(s) {
  let out = "", q = false;
  for (const ch of String(s ?? "")) {
    if (ch === '"') q = !q;
    if (!q && /\s/.test(ch)) continue;
    out += ch;
  }
  return out;
}

const STD_ACT = new Set(["Id", "Kind", "NodeType", "Name", "ProcessDef", "Activity::Permission", "Activity::Resource", "Activity::Expression", "Activity::ProcessDef"]);
const STD_PERM = new Set(["Id", "Kind", "Column", "Permission", "Activity"]);

export function describeBlob(blob, { listName = (x) => x, roleName = (x) => x } = {}) {
  const rootId = blob?.Root;
  const root = rootId ? blob[rootId] : null;
  if (!root) return null;
  const at = (id) => blob[id];
  const all = Object.values(blob).filter((v) => v && typeof v === "object" && v.Kind);
  const fields = {};
  for (const f of all.filter((e) => e.Kind === "Field")) {
    const ex = (f["Field::Expression"] || []).map((x) => at(x)?.ExpressionStr).filter((x) => x != null);
    const qd = (f["Field::QueryDefinition"] || []).map((x) => at(x)).filter(Boolean)[0];
    fields[f.Id] = {
      type: f.Type, name: f.Name, model: f.Model,
      list: f.ReferredList ? listName(f.ReferredList) : null,
      formula: ex.length ? normFx(ex[0]) : null,
      query: qd ? `${qd.LHSModel}/${qd.FlowType}` : null,
      required: !!f.Required,
      system: !!f.IsSystemField || String(f.Id).startsWith("_"),
    };
  }
  const children = {};
  for (const m of all.filter((e) => e.Kind === "Model" && e.Id !== rootId)) children[m.Id] = { name: m.Name, parent: m.Model, fields: [...(m["Model::Field"] || [])].sort() };
  const col2key = {};
  for (const c of all.filter((e) => e.Kind === "Column")) col2key[c.Id] = (c["Column::Field"] || c["Column::Model"] || [])[0] || `(${c.Type || "?"})`;

  const actOut = (aid) => {
    const a = at(aid) || {};
    const res = (a["Activity::Resource"] || []).map(at).filter(Boolean);
    return {
      id: a.Id, name: a.Name, node: a.NodeType,
      roles: res.map((r) => (r.ValueType === "AppRole" ? roleName(r.Value) : `${r.ValueType}:${r.Value}`)),
      cond: (a["Activity::Expression"] || []).map((x) => normFx(at(x)?.ExpressionStr)),
      branches: (a["Activity::ProcessDef"] || []).map((pd) => (at(pd)?.["ProcessDef::Activity"] || []).map(actOut)),
      flags: Object.fromEntries(Object.entries(a).filter(([k]) => !STD_ACT.has(k))),
    };
  };
  const tree = root.RootProcessDef ? (at(root.RootProcessDef)?.["ProcessDef::Activity"] || []).map(actOut) : [];
  const perms = {}, permFlags = {}, actIds = {};
  for (const a of all.filter((e) => e.Kind === "Activity" && e.NodeType !== "SendBackToInitiator" && e.Id !== "SendBackToInitiator")) {
    actIds[a.Name] = a.Id;
    const ps = (a["Activity::Permission"] || []).map(at).filter(Boolean);
    if (!ps.length && a.NodeType === "Parallel") continue;
    perms[a.Name] = {};
    for (const p of ps) {
      const key = col2key[p.Column] || `?${p.Column}`;
      perms[a.Name][key] = p.Permission;
      const extra = Object.fromEntries(Object.entries(p).filter(([k]) => !STD_PERM.has(k)));
      if (Object.keys(extra).length) (permFlags[a.Name] ||= {})[key] = extra;
    }
  }
  return { id: rootId, name: root.Name, flowType: root.FlowType, fields, children, tree, perms, permFlags, actIds, publishedAt: blob.PublishedAt ?? null };
}

/** Flatten a description tree: [{name, node, roles, cond, branch: null|{parent, index}}] in document order. */
export function flatTree(tree) {
  const out = [];
  for (const a of tree) {
    out.push({ ...a, branch: null });
    a.branches.forEach((br, bi) => br.forEach((b) => out.push({ ...b, branch: { parent: a.name, index: bi } })));
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// Expectations
// ---------------------------------------------------------------------------------------------------------------
export const familyOf = (flowType) => (flowType === "Process" ? "process" : "form");

export function buildExpectations(plan) {
  const { spec, preview } = plan;
  const roleNameBySlug = Object.fromEntries(preview.roles.map((r) => [r._id, r.Name]));
  const listNameById = Object.fromEntries(preview.lists.map((l) => [l._id, l.Name]));
  const describe = (b) => describeBlob(b, { listName: (id) => listNameById[id] ?? `?list:${id}`, roleName: (s) => roleNameBySlug[s] ?? `?role:${s}` });
  const flows = [...preview.processes, ...preview.forms].map((b) => {
    const d = describe(b);
    return { id: d.id, name: d.name, flowType: d.flowType, family: familyOf(d.flowType), desc: d, blob: b };
  });
  const flowById = Object.fromEntries(flows.map((f) => [f.id, f]));
  const childParent = {};
  for (const f of flows) for (const cid of Object.keys(f.desc.children)) childParent[cid] = f.id;
  const roles = preview.roles.map((r) => ({ slug: r._id, name: r.Name, isDefault: r._id === "admin" || r._id === "user" }));
  const lists = preview.lists.map((l) => ({ previewId: l._id, name: l.Name, items: l.ListItems || [] }));
  const listItemsByName = Object.fromEntries(lists.map((l) => [l.name, l.items]));
  const grants = preview.permissions.map((b) => b[b.Root]).map((p) => ({
    roleSlug: p.Role, role: roleNameBySlug[p.Role] ?? p.RoleName ?? p.Role, model: p.Model, level: p.Level, scope: p.Scope,
    child: !flowById[p.Model], parent: flowById[p.Model] ? p.Model : childParent[p.Model] ?? null,
  }));
  const integrations = Object.entries(preview.integrationShells).map(([previewId, sh]) => ({ previewId, name: sh.Name }));
  const exp = {
    app: APP, flows, flowById, roles, roleNameBySlug, lists, listNameById, listItemsByName, childParent,
    grants, flowGrants: grants.filter((g) => !g.child), childGrants: grants.filter((g) => g.child),
    integrations, switches: spec.workflow?.meta?.after_generate_switches || {},
  };
  exp.postGen = postGenerateTargets(spec, exp);
  return exp;
}

// ---------------------------------------------------------------------------------------------------------------
// Grants: classes, expected shapes, post-generate targets
// ---------------------------------------------------------------------------------------------------------------
// [assumed] Member shapes the apply writes for a preview level, taken from the 1.6.0 engine's flowGrant() and
// master.md §4 (Process: Editable → Member [InitiateItems], ReadOnly → Member [View]; Form: Editable → Member
// [Delete], ReadOnly → Viewer []). App Builder 1.0.0's exact shape is unverified, so a SHAPE difference is a WARN.
// The access CLASS (admin > write > read) is what must match.
export const GRANT_SHAPE = {
  process: { write: { Role: "Member", Permission: ["InitiateItems"] }, read: { Role: "Member", Permission: ["View"] }, admin: { Role: "Admin", Permission: [] } },
  form: { write: { Role: "Member", Permission: ["Delete"] }, read: { Role: "Viewer", Permission: [] }, admin: { Role: "Admin", Permission: [] } },
};
export const RANK = { none: 0, "act-only": 0.5, read: 1, write: 2, admin: 3 };
export const levelClass = (level) => (level === "Editable" ? "write" : level === "ReadOnly" ? "read" : "none");

export function classifyMember(family, m) {
  if (!m) return "none";
  if (m.Role === "Admin") return "admin";
  const p = m.Permission || [];
  if (family === "process") return p.includes("InitiateItems") ? "write" : p.includes("View") ? "read" : "act-only";
  return m.Role === "Viewer" ? "read" : "write";
}
export const shapeOf = (m) => (m ? `${m.Role} ${JSON.stringify([...(m.Permission || [])].sort())}` : "none");
export const sameShape = (m, want) => !!m && m.Role === want.Role && JSON.stringify([...(m.Permission || [])].sort()) === JSON.stringify([...want.Permission].sort());

/** security.post_generate_grants → [{roleSlug, role, flowId, classes[], noDelete: "required"|"optional"|null, note}] */
export function postGenerateTargets(spec, exp) {
  const out = [];
  const formIds = exp.flows.filter((f) => f.family === "form").map((f) => f.id);
  for (const g of spec.security?.post_generate_grants || []) {
    const flowIds = g.flow === "forms with E cells" ? formIds : String(g.flow).split(/\s*,\s*/);
    const slugs = g.role === "*" ? exp.roles.filter((r) => !r.isDefault).map((r) => r.slug) : [g.role];
    for (const flowId of flowIds) for (const slug of slugs) {
      const pv = exp.flowGrants.find((x) => x.roleSlug === slug && x.model === flowId);
      const pvClass = levelClass(pv?.level);
      let classes, noDelete = null;
      if (/flow Admin/i.test(g.grant)) classes = ["admin"];
      else if (Array.isArray(g.permission) && g.permission.join() === "View") classes = ["read"];
      else if (g.role === "*") {
        if (pvClass !== "write") continue;
        classes = ["write"];
        const name = exp.flowById[flowId]?.name || flowId;
        noDelete = g.grant.includes(name) ? "required" : "optional"; // named forms must lose Delete; others only where K-17 allows
      } else if (/only if/i.test(g.grant)) classes = [...new Set([pvClass, "write"])]; // conditional upgrade: either is fine
      else classes = [pvClass];
      out.push({ roleSlug: slug, role: exp.roleNameBySlug[slug] ?? slug, flowId, classes, noDelete, previewClass: pvClass, note: g.grant, ref: g.ref || g.reason || "" });
    }
  }
  return out;
}

export function targetFor(exp, roleSlug, flowId) {
  const t = exp.postGen.filter((x) => x.roleSlug === roleSlug && x.flowId === flowId);
  if (!t.length) return null;
  return { classes: [...new Set(t.flatMap((x) => x.classes))], noDelete: t.find((x) => x.noDelete)?.noDelete ?? null, note: t.map((x) => x.note).join(" + ") };
}

// ---------------------------------------------------------------------------------------------------------------
// Workflow helpers on the plan
// ---------------------------------------------------------------------------------------------------------------
/** Flatten workflow.processes[pid].steps (Parallel blocks carry branches[].steps[]). */
export function flatSpecSteps(proc) {
  const out = [];
  for (const s of proc?.steps || []) {
    out.push({ ...s, branch: null });
    (s.branches || []).forEach((br, bi) => (br.steps || []).forEach((b) => out.push({ ...b, branch: { parent: s.name, index: bi } })));
  }
  return out;
}

/** Owner role names of a step (by activity name) in a flow description. */
export function stepOwners(flow, stepName) {
  const a = flatTree(flow.desc.tree).find((x) => x.name === stepName);
  return a ? a.roles : [];
}

// ---------------------------------------------------------------------------------------------------------------
// A small evaluator for the Kissflow formula subset used in this app (IF, OR, AND, NOT, ISBLANK, = != < > <= >=, + - * /).
// Used by the offline simulator and by the acceptance script to predict formula values. Blank = null/undefined/"".
// ---------------------------------------------------------------------------------------------------------------
export const isBlank = (v) => v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0);

export function evalFormula(src, get) {
  const toks = [];
  const s = String(src);
  for (let i = 0; i < s.length; ) {
    const ch = s[i];
    if (/\s/.test(ch)) { i++; continue; }
    if (ch === '"') { let j = i + 1; while (j < s.length && s[j] !== '"') j++; toks.push({ t: "str", v: s.slice(i + 1, j) }); i = j + 1; continue; }
    if (/[0-9.]/.test(ch)) { let j = i; while (j < s.length && /[0-9.]/.test(s[j])) j++; toks.push({ t: "num", v: Number(s.slice(i, j)) }); i = j; continue; }
    if (/[A-Za-z_]/.test(ch)) { let j = i; while (j < s.length && /[A-Za-z0-9_]/.test(s[j])) j++; toks.push({ t: "id", v: s.slice(i, j) }); i = j; continue; }
    const two = s.slice(i, i + 2);
    if (["!=", "<>", "<=", ">="].includes(two)) { toks.push({ t: "op", v: two === "<>" ? "!=" : two }); i += 2; continue; }
    if ("=<>+-*/&(),".includes(ch)) { toks.push({ t: "op", v: ch }); i++; continue; }
    throw new Error(`formula: unexpected '${ch}' in ${src}`);
  }
  let p = 0;
  const peek = () => toks[p];
  const eat = (v) => { const t = toks[p]; if (!t || (v && t.v !== v)) throw new Error(`formula: expected ${v} at ${p} in ${src}`); p++; return t; };
  const num = (v) => (isBlank(v) ? 0 : Number(v));
  const eq = (a, b) => {
    if (isBlank(a) && isBlank(b)) return true;
    if (isBlank(a) || isBlank(b)) return false;
    if (typeof a === "number" || typeof b === "number") return Number(a) === Number(b);
    return String(a) === String(b);
  };
  function cmp() {
    let l = add();
    while (peek()?.t === "op" && ["=", "!=", "<", ">", "<=", ">="].includes(peek().v)) {
      const op = eat().v, r = add();
      l = op === "=" ? eq(l, r) : op === "!=" ? !eq(l, r) : op === "<" ? num(l) < num(r) : op === ">" ? num(l) > num(r) : op === "<=" ? num(l) <= num(r) : num(l) >= num(r);
    }
    return l;
  }
  function add() {
    let l = mul();
    while (peek()?.t === "op" && ["+", "-", "&"].includes(peek().v)) {
      const op = eat().v, r = mul();
      l = op === "&" ? `${l ?? ""}${r ?? ""}` : op === "+" ? num(l) + num(r) : num(l) - num(r);
    }
    return l;
  }
  function mul() {
    let l = unary();
    while (peek()?.t === "op" && ["*", "/"].includes(peek().v)) { const op = eat().v, r = unary(); l = op === "*" ? num(l) * num(r) : num(l) / num(r); }
    return l;
  }
  function unary() { if (peek()?.v === "-") { eat("-"); return -num(unary()); } return prim(); }
  function prim() {
    const t = eat();
    if (t.t === "num" || t.t === "str") return t.v;
    if (t.t === "op" && t.v === "(") { const v = cmp(); eat(")"); return v; }
    if (t.t === "id") {
      if (peek()?.v === "(") {
        eat("(");
        const args = [];
        if (peek()?.v !== ")") { args.push(cmp()); while (peek()?.v === ",") { eat(","); args.push(cmp()); } }
        eat(")");
        const fn = t.v.toUpperCase();
        if (fn === "IF") return args[0] ? args[1] : args[2];
        if (fn === "OR") return args.some(Boolean);
        if (fn === "AND") return args.every(Boolean);
        if (fn === "NOT") return !args[0];
        if (fn === "ISBLANK") return isBlank(args[0]);
        throw new Error(`formula: unsupported function ${fn}`);
      }
      const v = get(t.v);
      return v === undefined ? null : v;
    }
    throw new Error(`formula: unexpected token ${JSON.stringify(t)} in ${src}`);
  }
  const v = cmp();
  if (p !== toks.length) throw new Error(`formula: trailing tokens in ${src}`);
  return v;
}

// ---------------------------------------------------------------------------------------------------------------
// Small utilities
// ---------------------------------------------------------------------------------------------------------------
export const rows = (b) => (Array.isArray(b) ? b : b?.Data || b?.data || b?.items || []);
export const stamp = (d = new Date()) => d.toISOString().replace(/\.\d{3}Z$/, "Z"); // DateTimes without milliseconds
export const dateIn = (days, d = new Date()) => new Date(d.getTime() + days * 86400000).toISOString().slice(0, 10);
export const short = (v, n = 220) => { const s = typeof v === "string" ? v : JSON.stringify(v); return s && s.length > n ? `${s.slice(0, n)}…` : s; };

/** Hard guard for the offline modes: any fetch attempt throws. */
export function disableNetwork(label) {
  const refuse = () => { throw new Error(`${label}: network access is disabled in this mode`); };
  globalThis.fetch = refuse;
  globalThis.XMLHttpRequest = undefined;
  globalThis.WebSocket = undefined;
}

/** Result collector shared by readback and acceptance gate. status: PASS | FAIL | WARN | INFO */
export class Results {
  constructor() { this.checks = []; }
  add(area, id, status, detail = "") { this.checks.push({ area, id, status, detail: typeof detail === "string" ? detail : JSON.stringify(detail) }); return status; }
  pass(a, i, d) { return this.add(a, i, "PASS", d); }
  fail(a, i, d) { return this.add(a, i, "FAIL", d); }
  warn(a, i, d) { return this.add(a, i, "WARN", d); }
  info(a, i, d) { return this.add(a, i, "INFO", d); }
  check(a, i, ok, d) { return this.add(a, i, ok ? "PASS" : "FAIL", d); }
  get counts() { const c = { PASS: 0, FAIL: 0, WARN: 0, INFO: 0 }; for (const x of this.checks) c[x.status]++; return c; }
  byArea() {
    const m = new Map();
    for (const x of this.checks) { const r = m.get(x.area) || { area: x.area, PASS: 0, FAIL: 0, WARN: 0, INFO: 0 }; r[x.status]++; m.set(x.area, r); }
    return [...m.values()];
  }
  table() {
    const rowsOut = this.byArea();
    const w = Math.max(14, ...rowsOut.map((r) => r.area.length));
    const line = (a, p, f, wa, i) => `${a.padEnd(w)} | ${String(p).padStart(5)} | ${String(f).padStart(5)} | ${String(wa).padStart(5)} | ${String(i).padStart(5)}`;
    const out = [line("area", "PASS", "FAIL", "WARN", "INFO"), `${"-".repeat(w)}-+-------+-------+-------+------`];
    for (const r of rowsOut) out.push(line(r.area, r.PASS, r.FAIL, r.WARN, r.INFO));
    const c = this.counts;
    out.push(`${"-".repeat(w)}-+-------+-------+-------+------`, line("TOTAL", c.PASS, c.FAIL, c.WARN, c.INFO));
    return out.join("\n");
  }
  lines(status, max = 400) { return this.checks.filter((x) => x.status === status).slice(0, max).map((x) => `${status} [${x.area}] ${x.id}${x.detail ? " · " + short(x.detail, 400) : ""}`); }
}
