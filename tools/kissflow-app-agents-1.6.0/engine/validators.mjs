// Validators — the verification layer. Each returns an array of issues
// { level: "error"|"warn", code, msg, where }. Operate on loaded export models
// OR on builder output (same blob shape).

import { entities, index, danglingRefs, orphans, statusGraph, relations, isEntityGraph } from "./graph.mjs";

const SYSTEM_FIELDS = new Set([
  "_id", "Name", "_created_by", "_modified_by", "_created_at", "_modified_at", "_is_deleted",
  "_deleted_at", "_deleted_by", "_flow_name", "_application_id", "_flow_type", "_doc_version",
  "_visited", "_is_draft", "_is_public_form", "_expire_at",
]);

// ---------- STRUCTURAL ----------
/** A metadata blob must: have a Root that resolves, every `::` ref resolve, every entity have Id+Kind. */
export function checkStructural(blob, where = "") {
  const issues = [];
  if (!blob || typeof blob !== "object") return [{ level: "error", code: "BLOB_EMPTY", msg: "blob missing/invalid", where }];
  // Root must point at a present object (true for both entity-graphs and view/property-bag blobs).
  if (!blob.Root) issues.push({ level: "error", code: "NO_ROOT", msg: "blob has no Root", where });
  else if (!blob[blob.Root] || typeof blob[blob.Root] !== "object") issues.push({ level: "error", code: "ROOT_MISSING", msg: `Root '${blob.Root}' has no object`, where });
  // Entity-graph rules apply ONLY to graph blobs (Model/CaseFlow/Page/CasePermission/Navigation),
  // not to view/report/integration property-bag blobs.
  if (!isEntityGraph(blob)) return issues;
  for (const { from, rel, to } of danglingRefs(blob)) {
    issues.push({ level: "error", code: "DANGLING_REF", msg: `${from}.${rel} → '${to}' does not exist`, where });
  }
  for (const e of entities(blob)) {
    if (e.Id == null) issues.push({ level: "warn", code: "NO_ID", msg: `entity missing Id`, where });
    else if (e.Kind == null) issues.push({ level: "warn", code: "NO_KIND", msg: `entity '${e.Id}' missing Kind`, where });
  }
  return issues;
}

/** Field-level checks on a form/model blob: types known, no authored system fields, columns resolve. */
const KNOWN_FIELD_TYPES = new Set([
  "Text", "Textarea", "Number", "Currency", "Date", "DateTime", "Email", "Boolean", "Select",
  "Multiselect", "MultiSelect", "DropdownList", "Checkbox", "CheckList", "StarRating", "Slider",
  "Reference", "ReferenceList", "RemoteLookup", "Aggregation", "SequenceNumber", "Geolocation",
  "User", "MultiUser", "UserList", "UserActor", "UserAndGroup", "UserAndGroupList", "Attachment", "Image",
  "Table", "TableField",
]);
export function checkFields(blob, where = "") {
  const issues = [];
  const ids = index(blob);
  for (const e of entities(blob)) {
    if (e.Kind !== "Field") continue;
    if (SYSTEM_FIELDS.has(e.Id)) issues.push({ level: "error", code: "SYSTEM_FIELD_AUTHORED", msg: `system field '${e.Id}' must not be authored`, where });
    // …and by NAME, not only by Id. Kissflow refuses a field whose NAME collides with a system field
    // even when its Id is unique, and the publish error does not say which field. Checking e.Id alone
    // let that through the gate and cost a live build three rejected forms plus a diagnose-and-
    // republish cycle. The remedy is a RENAME, which then strands every reference lookup still pointing
    // at the old field — "Metadata not found" on the referring flows — so catching it here is far
    // cheaper than catching it live. (PulseFit, 2026-07-31.)
    if (e.Name && SYSTEM_FIELDS.has(String(e.Name).trim()))
      issues.push({ level: "error", code: "SYSTEM_FIELD_NAME", msg: `field '${e.Id}' is named '${e.Name}', which Kissflow reserves — rename it BEFORE the first publish`, where });
    if (e.Type && !KNOWN_FIELD_TYPES.has(e.Type)) issues.push({ level: "warn", code: "UNKNOWN_FIELD_TYPE", msg: `field '${e.Id}' type '${e.Type}' not in catalog`, where });
    if (e.Column && !ids.has(e.Column)) issues.push({ level: "error", code: "FIELD_NO_COLUMN", msg: `field '${e.Id}' Column '${e.Column}' missing`, where });
    // a Reference/User field should carry a QueryDefinition
    if (["Reference", "ReferenceList", "User", "MultiUser", "UserList"].includes(e.Type) && !e["Field::QueryDefinition"]) {
      issues.push({ level: "warn", code: "REF_NO_QUERYDEF", msg: `reference field '${e.Id}' has no Field::QueryDefinition`, where });
    }
  }
  return issues;
}

// ---------- BEHAVIORAL ----------
/** Caseflow: every status reachable from the initial; every status can reach a terminal; no transition to a missing status. */
export function checkCaseflow(caseflowBlob, where = "") {
  const issues = [];
  const g = statusGraph(caseflowBlob);
  if (!g.statuses.length) return issues;
  if (!g.initial) issues.push({ level: "error", code: "NO_INITIAL_STATUS", msg: "no NotStarted/initial status", where });
  if (!g.terminals.length) issues.push({ level: "warn", code: "NO_TERMINAL_STATUS", msg: "no Closed/Done terminal status", where });
  // forward reachability from initial
  const fwd = new Set([g.initial].filter(Boolean));
  const q = [...fwd];
  while (q.length) for (const t of g.out.get(q.shift()) || []) if (!fwd.has(t)) { fwd.add(t); q.push(t); }
  for (const s of g.statuses) {
    if (s.Id !== g.initial && !fwd.has(s.Id)) issues.push({ level: "warn", code: "UNREACHABLE_STATUS", msg: `status '${s.Id}' unreachable from initial`, where });
  }
  // backward: can each status reach a terminal?
  const rev = new Map(g.statuses.map((s) => [s.Id, []]));
  for (const [from, tos] of g.out) for (const to of tos) rev.get(to)?.push(from);
  const canEnd = new Set(g.terminals);
  const q2 = [...canEnd];
  while (q2.length) for (const p of rev.get(q2.shift()) || []) if (!canEnd.has(p)) { canEnd.add(p); q2.push(p); }
  for (const s of g.statuses) {
    if (!canEnd.has(s.Id)) issues.push({ level: "warn", code: "STATUS_NO_EXIT", msg: `status '${s.Id}' cannot reach a terminal`, where });
  }
  return issues;
}

// ---------- COHERENCE (IR-level; light blob-level orphan check here) ----------
/** Orphan entities (unreachable from Root) — usually a modeling mistake. */
export function checkOrphans(blob, where = "") {
  return orphans(blob).map((id) => ({ level: "warn", code: "ORPHAN_ENTITY", msg: `entity '${id}' unreachable from Root`, where }));
}

/** Run the appropriate validators for a labelled blob (auto-detects caseflow vs model). */
// checkPublishInvariants — the "publishes 500 because X" catalog as PRE-FLIGHT assertions (not just
// construction fixes in builders). Runs inside validateBlob's pre-publish pass so a known 500-cause
// surfaces as a legible error in ~ms instead of an opaque platform 500 after a multi-minute apply —
// and stays caught even after a live graft/patch mutates the draft. RATCHET: add one rule here each
// time a new opaque publish-500 is root-caused (see builders.mjs for the causes it prevents at build).
export function checkPublishInvariants(blob, where = "") {
  const issues = [];
  for (const e of Object.values(blob)) {
    if (!e || typeof e !== "object") continue;
    if (e.Kind === "Field") {
      // bare Select-family field with no ReferredList → opaque 500 on publish. Match the WHOLE
      // dropdown family case-insensitively (Select, Multiselect/MultiSelect, DropdownList, CheckList):
      // on a live graft/patch draft no canonicalization runs, so non-canonical casings/aliases reach
      // here verbatim and a `=== "Select"` literal check missed them.
      if (/^(select|multi[\s_-]?select|dropdown[\s_-]?list|check[\s_-]?list)$/i.test(e.Type || "") && !e.ReferredList)
        issues.push({ level: "error", code: "SELECT_NO_LIST", msg: `Select field '${e.Name || e.Id}' (type ${e.Type}) has no ReferredList — publishes as an opaque 500`, where });
      // SequenceNumber without Field::Property (Padding + PrefixExpression) → 500
      if (e.Type === "SequenceNumber" && !(Array.isArray(e["Field::Property"]) && e["Field::Property"].length))
        issues.push({ level: "error", code: "SEQNUM_NO_PROPERTY", msg: `SequenceNumber field '${e.Name || e.Id}' missing Field::Property (Padding/PrefixExpression) — publishes 500`, where });
    }
    // an Expression referenced by a field but with an empty node tree → 500 (degrade to manual instead)
    if (e.Kind === "Expression" && !(Array.isArray(e["Expression::Node"]) && e["Expression::Node"].length))
      issues.push({ level: "error", code: "EMPTY_EXPRESSION", msg: `Expression '${e.Id}' (field ${e.Field}) has an empty node tree — publishes 500`, where });
  }
  return issues;
}

export function validateBlob({ label, blob }) {
  const issues = [...checkStructural(blob, label)];
  const root = blob[blob.Root];
  const kind = root?.Kind;
  if (kind === "Model") issues.push(...checkFields(blob, label), ...checkPublishInvariants(blob, label));
  if (kind === "CaseFlow") issues.push(...checkCaseflow(blob, label));
  issues.push(...checkOrphans(blob, label));
  return issues;
}

export const errors = (issues) => issues.filter((i) => i.level === "error");
export const warnings = (issues) => issues.filter((i) => i.level === "warn");

/** Draft-hygiene checks for LIVE drafts — the corruption classes that break the builder UI even
 *  when the graph is referentially consistent (Store_Launch_A00, 2026-07-17):
 *  - DUPLICATE_STEP_PERMISSION (error): >1 Permission entity for one (Activity, Column). The
 *    metadata API accepts appended duplicates silently; the builder's column-keyed model then
 *    fails on table/field delete with an opaque error.
 *  - STALE_COLUMN_PERM_REF (error): Column::Permission back-ref to a missing entity → publish 500.
 *  - CROSS_MODEL_REF_FILTER (warn): a child-table reference filter comparing against a PARENT-model
 *    field. Valid server-side, but the builder's delete cascade resolves it inside the child scope
 *    and crashes (`reading 'Field::Node'` in LowcodeProcessModel) — the table becomes undeletable
 *    from the UI. Prefer filtering on child-local fields, or accept UI fragility knowingly. */
export function checkHygiene(blob, where = "") {
  const issues = [];
  if (!blob || typeof blob !== "object") return issues;
  const seen = new Map();
  for (const e of Object.values(blob)) {
    if (!e || typeof e !== "object") continue;
    if (e.Kind === "Permission" && e.Activity && e.Column) {
      const k = e.Activity + "::" + e.Column;
      if (seen.has(k)) {
        const colName = blob[e.Column]?.Name || blob[(blob[e.Column]?.["Column::Field"] || [])[0]]?.Name || e.Column;
        issues.push({ level: "error", code: "DUPLICATE_STEP_PERMISSION", msg: `step '${blob[e.Activity]?.Name || e.Activity}' has ${seen.get(k).length + 1}+ Permission entities for column '${colName}' (${seen.get(k)[0].Permission} vs ${e.Permission}) — dedupe before any UI delete works`, where });
        seen.get(k).push(e);
      } else seen.set(k, [e]);
    }
    if (Array.isArray(e["Column::Permission"]))
      for (const t of e["Column::Permission"]) if (!blob[t]) issues.push({ level: "error", code: "STALE_COLUMN_PERM_REF", msg: `Column '${e.Id}' back-references missing Permission '${t}' — publish will 500`, where });
  }
  // cross-model reference filters: Condition.RHSField living on a different model than the
  // QueryDefinition's owning field
  const qdOfCriteria = new Map();
  for (const e of Object.values(blob)) if (e && e.Kind === "QueryDefinition")
    for (const [k, v] of Object.entries(e)) if (k.includes("::") && Array.isArray(v)) for (const t of v) qdOfCriteria.set(t, e);
  for (const e of Object.values(blob)) {
    if (!e || e.Kind !== "Condition" || e.RHSType !== "Field" || !e.RHSField) continue;
    const qd = qdOfCriteria.get(e.Criteria) || qdOfCriteria.get(e.Id);
    const ownerModel = qd && blob[qd.Field]?.Model;
    const rhs = blob[e.RHSField];
    if (ownerModel && rhs && rhs.Model && rhs.Model !== ownerModel)
      issues.push({ level: "warn", code: "CROSS_MODEL_REF_FILTER", msg: `reference filter on '${qd.Field}' (model ${ownerModel}) compares against '${e.RHSField}' from model '${rhs.Model}' — the builder UI's delete cascade crashes on this pattern; the table/field becomes undeletable from the UI`, where });
  }
  return issues;
}
