// Builders — compile the App-Spec IR into Kissflow metadata blobs/docs.
// Deterministic: same IR → same ids. Covers the high-value 80% (lists, forms with
// fields incl. reference/select/computed + layout, roles, simple pages/dashboards).
// Live publish is done by client.mjs; these are pure functions (no I/O).

import { slug, eid, REF_TYPES, canonicalFieldType } from "./util.mjs";
import { lower } from "./lower.mjs";

// Compile a formula string → Expression::Node AST, mirroring the shape Kissflow's UI emits (verified
// against real exports: infix operators carry {Value:"+"/"-"/"*"/"/"/"="/..., Syntax:"Infix"}, the
// engine resolves the symbol via resolve_engine_fn → ADDOPER/MULOPER/…; parenthesised nodes carry
// IsParenthesised:true; named functions carry {Value:"IF"/"CONCATENATE"/…, Category:<module>} with
// their args as Node::Node). Grammar: comparison (= < > >= <= !=) over additive (+ -) over
// multiplicative (* /); operands are numbers, "strings", FUNC(args), or field names/ids (resolved
// model-first). Returns true if it built a valid AST under exprId; false to DEGRADE.
const FN_CATEGORY = {
  CONCATENATE: "String", TOUPPERCASE: "String", TOLOWERCASE: "String", SUBSTRING: "String", FIND: "String", REPLACE: "String", LENGTH: "String", TOTEXT: "String", TRIM: "String", LEFT: "String", RIGHT: "String", INSERT: "String", CODE: "String",
  IF: "Logical", AND: "Logical", OR: "Logical", NOT: "Logical", ISBLANK: "Logical", HAS: "Logical", HASALL: "Logical",
  SUM: "Number", ROUND: "Number", ABS: "Number", AVERAGE: "Number", MIN: "Number", MAX: "Number", CEIL: "Number", FLOOR: "Number", RANDBETWEEN: "Number", POWER: "Number", SQRT: "Number", MOD: "Number", EXTRACTNUMBER: "Number",
  DATEDIFF: "Date", CALENDARDAYS: "Date", DAY: "Date", MONTH: "Date", YEAR: "Date", HOUR: "Date", OFFSET: "Date", EOM: "Date", NOW: "DateTime", TODAY: "Date", DATE: "Date", DATETIME: "DateTime",
  GETVALUE: "List", GET: "List", CONVERT: "Currency", CURRENCY: "Currency",
};
export function compileFormula(blob, exprId, formula, fieldType, modelId) {
  const dt = fieldType === "Currency" || fieldType === "Number" ? "Number" : "String";
  const allFields = Object.values(blob).filter((e) => e && e.Kind === "Field");
  const resolveField = (tok) => {
    if (allFields.some((f) => f.Id === tok)) return tok;                 // exact id
    const low = String(tok).toLowerCase();
    const m = allFields.filter((f) => slug(f.Name) === tok || slug(f.Name).toLowerCase() === low);
    if (!m.length) return null;
    return (modelId && (m.find((f) => f.Model === modelId) || {}).Id) || m[0].Id; // prefer same model
  };
  let seq = 0;
  const mk = (props) => { const id = eid("Node", `${exprId}:n${seq++}`); blob[id] = { Id: id, Kind: "Node", DataType: dt, ...props }; return id; };
  const op = (sym, l, r, cat) => { if (l == null || r == null) { ok = false; return null; } return mk({ Type: "Function", Value: sym, Category: cat || dt, Syntax: "Infix", "Node::Node": [l, r], FieldRefCount: 2 }); };
  const toks = formula.match(/"[^"]*"|'[^']*'|[A-Za-z_][A-Za-z0-9_.]*|\d+\.?\d*|>=|<=|!=|&&|\|\||[-+*/(),=<>]/g) || [];
  let pos = 0, ok = true;
  const peek = () => toks[pos], eat = () => toks[pos++];
  const parseCompare = () => { let n = parseAdd(); while (n != null && /^(=|<|>|>=|<=|!=)$/.test(peek() || "")) n = op(eat(), n, parseAdd(), "Boolean"); return n; };
  const parseAdd = () => { let n = parseMul(); while (n != null && (peek() === "+" || peek() === "-")) n = op(eat(), n, parseMul(), dt); return n; };
  const parseMul = () => { let n = parseFactor(); while (n != null && (peek() === "*" || peek() === "/")) n = op(eat(), n, parseFactor(), dt); return n; };
  const parseFactor = () => {
    const t = peek();
    if (t === undefined) { ok = false; return null; }
    if (t === "(") { eat(); const n = parseCompare(); if (peek() === ")") eat(); else ok = false; if (n != null) blob[n].IsParenthesised = true; return n; }
    eat();
    if (/^["']/.test(t)) return mk({ Type: "Static", DataType: "String", Value: t.slice(1, -1) });        // string literal
    if (/^\d+\.?\d*$/.test(t)) return mk({ Type: "Static", Value: String(t) });                            // number literal
    if (/^[A-Za-z_]/.test(t)) {
      if (peek() === "(") {                                                                                // named function call FUNC(args)
        eat(); const args = [];
        if (peek() !== ")") { args.push(parseCompare()); while (peek() === ",") { eat(); args.push(parseCompare()); } }
        if (peek() === ")") eat(); else ok = false;
        if (args.some((a) => a == null)) { ok = false; return null; }
        const fn = t.toUpperCase();
        return mk({ Type: "Function", Value: fn, Category: FN_CATEGORY[fn] || dt, "Node::Node": args, FieldRefCount: args.length });
      }
      const fid = resolveField(t); if (fid) return mk({ Type: "Field", Field: fid });                      // field reference
      ok = false; return null;
    }
    ok = false; return null;
  };
  const root = parseCompare();
  if (ok && root != null && pos >= toks.length) {
    blob[exprId]["Expression::Node"] = [root];
    // root links to the Expression; every descendant links to its parent Node via "Node".
    const walk = (id, parentKey, parentId) => { const n = blob[id]; n[parentKey] = parentId; if (n["Node::Node"]) for (const c of n["Node::Node"]) walk(c, "Node", id); };
    walk(root, "Expression", exprId);
    return true;
  }
  for (let i = 0; i < seq; i++) delete blob[eid("Node", `${exprId}:n${i}`)];   // degrade: drop partial nodes
  return false;
}

/** A List/option dataset → flow doc only (no metadata blob). */
// ── Derived-field helpers (shared by buildForm & buildFieldInto) ──
// Rich lookup: multi-field LookupField is already wired from f.lookup; this adds AutoFill (copy the
// pulled columns into the form's own fields) + SortBy onto the reference's QueryDefinition.
function enrichLookup(blob, qdId, f) {
  if (!blob[qdId]) return;
  if (f.autofill) blob[qdId].AutoFill = true;
  if (f.sortBy) blob[qdId].SortBy = f.sortBy;
}
// Aggregate: a Currency/Number field that sums/counts a column of a CHILD TABLE (or related flow).
// Shape verified against real exports (ITAM Asset_Disposal "Repair costs until now"): the field is
// ReadOnly + Widget:"Aggregation" and links a QueryDefinition via **`Field::QueryDefinition`** (NOT a
// separate Aggregate:: relation) carrying {LHSModel, FlowType, LookupField:[], AggregateField,
// AggregateType:"Sum"|"Count"|… (title-case)}. f.aggregate = { fn, over:"<flow/child name>",
// field?:"<column>" } (field omitted for Count).
const AGG_TYPE = { SUM: "Sum", COUNT: "Count", AVG: "Average", AVERAGE: "Average", MIN: "Min", MAX: "Max", UNIQUE_COUNT: "UniqueCount" };
function addAggregate(blob, field, f, fid, resolve) {
  if (!f.aggregate || !f.aggregate.over) return;
  const adId = eid("AggregateDefinition", field.Model + ":" + fid);
  field["Field::QueryDefinition"] = [adId];
  field.Widget = "Aggregation";
  field.ReadOnly = true;
  let lhs = resolve(f.aggregate.over);
  // embedded child table: `over` names a Section child-table (not a flow/list id) — resolve()
  // returns it unchanged, so fall back to the PARENT model (already in-blob, matches LHSRootModel
  // below) rather than leaving a bare display-name string as LHSModel (→ "dangling cross-ref" at
  // publish-validation time, live-verified maritime-fleet build 2026-07-21).
  if (lhs === f.aggregate.over) lhs = field.Model;
  // publish-verified QD shape (npd-plm live apply 2026-07-03): the live validator REQUIRES
  // LHSRootModel (the parent model) + FlowType of the PARENT flow (not the child's) + an
  // AggregateField even for Count — missing any → publish 500 QueryDefinitionValidationException.
  const ad = {
    Id: adId, Kind: "QueryDefinition", Field: fid, LHSModel: lhs,
    FlowType: f.aggregate.flowType || blob[field.Model]?.FlowType || "Form", LookupField: [],
    AggregateType: AGG_TYPE[String(f.aggregate.fn || "SUM").toUpperCase()] || "Sum",
  };
  if (f.aggregate.match) {
    // CROSS-FLOW per-item aggregate (live-verified 2026-07-04, supersedes R7 "not expressible"):
    // SUM/COUNT another FLOW's field where <target's match.field> == THIS item. Golden shape (ITAM
    // Asset_Disposal "Repair costs until now"): LHSModelApplicationId + Criteria/Condition join,
    // NO LHSRootModel. f.aggregate = { fn, over:"<flow>", field, flowType?, match:{ field:"<ref on
    // target>", equals?:"<self field, default _id>" }, app? }.
    ad.LHSModelApplicationId = f.aggregate.app || "__APP__"; // placeholder → filled by buildApp post-pass
    const crId = eid("Criteria", adId), cnId = eid("Condition", adId);
    ad["QueryDefinition::Criteria"] = [crId];
    blob[crId] = { Id: crId, Kind: "Criteria", QueryDefinition: adId, "Criteria::Condition": [cnId] };
    blob[cnId] = { Id: cnId, Kind: "Condition", Criteria: crId, LHSField: slug(f.aggregate.match.field), Operator: "EQUAL_TO", HasArguments: true, RHSType: "Field", RHSField: f.aggregate.match.equals || "_id" };
  } else {
    ad.LHSRootModel = field.Model; // embedded child-table aggregate: parent context join is implicit
  }
  if (f.aggregate.field) ad.AggregateField = slug(f.aggregate.field);
  else {
    const first = Object.values(blob).find((v) => v && v.Kind === "Field" && v.Model === lhs);
    if (first) ad.AggregateField = first.Id; // Count still needs a concrete column
  }
  blob[adId] = ad;
}

export function buildList(spec, appId) {
  const id = spec.id || `${slug(spec.name)}_A00`;
  return {
    type: "list", id,
    doc: {
      _id: id, Name: spec.name, Description: spec.description || "", Type: "List", Status: "Live",
      ListItems: spec.items || [], _application_id: appId,
      Security: { AllowAllFlows: true, AllowedFlows: [] },
    },
  };
}

/**
 * A flow-stitch automation → an Integration flow (Connector with a Trigger + Action entity).
 * Trigger = the source flow reaching a state/event; Action = create/update/notify a target flow.
 * Shape matches the observed Integration blob (Connectors[]→Entities[{Kind:"Trigger"|"Action"}]).
 * NOTE: Kissflow exposes no PUBLIC author route for integrations (create is internal-only), so
 * apply emits this to the plan and defers the live write — it is still a first-class build artifact.
 */
export function buildAutomation(a, appId) {
  const id = a.id ? `${slug(a.id)}_A00` : `${slug(a.name)}_A00`;
  const connId = eid("Connector", id), trigId = eid("Trigger", id + ":t"), actId = eid("Action", id + ":a");
  const blob = {
    Root: id,
    [id]: { _id: id, Id: id, Kind: "Integration", Name: a.name, Type: "Integration", Status: "Draft", IsActive: true,
      _application_id: appId, Connectors: [connId], "Integration::Trigger": [trigId], "Integration::Action": [actId] },
    [connId]: { _id: connId, Id: connId, Kind: "Connector", Name: `${a.name} connector`, Entities: [trigId, actId] },
    [trigId]: { _id: trigId, Id: trigId, Kind: "Trigger", Version: 1, Name: `${a.source.flow} · ${a.source.event || "completed"}`,
      Flow: a.source.flow, On: a.source.on || null, Event: a.source.event || "completed" },
    [actId]: { _id: actId, Id: actId, Kind: "Action", Version: 1, Name: `${a.action.type} → ${a.action.target_flow}`,
      ActionType: a.action.type, TargetFlow: a.action.target_flow, FieldMap: a.action.field_map || {}, Condition: a.action.condition || null },
  };
  return { type: "integration", id, shell: { Name: a.name, Description: a.rationale || "" }, blob, automation: a };
}

/** A Role → app_role doc. */
export function buildRole(spec, appId) {
  const id = spec.id || eid("Ro", spec.name);
  return {
    type: "role", id,
    doc: {
      _id: id, Name: spec.name, Description: spec.description || "", _application_id: appId,
      Users: (spec.users || []).map((u) => ({ _id: u })), Groups: (spec.groups || []).map((g) => ({ _id: g })),
    },
  };
}

/**
 * A Form/Dataform → { shell doc, draft blob (entity graph) }.
 * fields: [{ name, type, required?, ref?(targetModelId), referredList?, currency?, formula? }]
 * Layout: one Section, each field on its own row (full width). Computed fields carry an
 * Expression with the raw ExpressionStr (the platform AI compiles the node tree on publish;
 * the engine emits the string + a placeholder node so the shape is valid).
 */
export function buildForm(spec, appId, idmap = {}, flowTypes = {}) {
  const resolve = (logical) => idmap[logical] || logical; // logical IR ref → generated id
  // QD FlowType must be the TARGET's real flow type (Form|Process|Case) — real exports confirm;
  // a wrong type breaks reference resolution at runtime. Unknown targets default to Form.
  const refFlowType = (ref) => flowTypes[ref] || flowTypes[resolve(ref)] || "Form";
  const modelId = spec.id || `${slug(spec.name)}_A00`;
  const blob = { Root: modelId };
  const model = {
    Id: modelId, Name: spec.name, Kind: "Model", FlowType: spec.flowType || "Form",
    Description: spec.description || "", "Model::Row": [], "Model::Field": [],
  };
  blob[modelId] = model;

  // GRID LAYOUT — group fields into sections, pack by width into 6-wide rows (mirrors SDK
  // __create_field_in_section). Default width 3 (two per row); long fields span full width.
  const widthOf = (f) => f.width || (["Textarea", "Table", "Attachment", "Image", "Geolocation"].includes(f.type) ? 6 : 3);
  const orderedSections = [];
  for (const f of spec.fields || []) {
    const sName = f.section || spec.section || "Details";
    let s = orderedSections.find((x) => x.name === sName);
    if (!s) orderedSections.push((s = { name: sName, fields: [] }));
    s.fields.push(f);
  }
  const colOf = {};
  orderedSections.forEach((sec, si) => {
    const sRow = eid("Row", modelId + ":sec" + si), sCol = eid("Column", modelId + ":sec" + si);
    model["Model::Row"].push(sRow);
    blob[sRow] = { Id: sRow, Kind: "Row", Model: modelId, "Row::Column": [sCol] };
    blob[sCol] = { Id: sCol, Kind: "Column", Type: "Section", Name: sec.name, Start: 0, End: 6, Row: sRow, "Column::Row": [] };
    let curRow = null, used = 0, rn = 0;
    for (const f of sec.fields) {
      const fid = f.id || slug(f.name), w = widthOf(f);
      if (!curRow || used + w > 6) {
        curRow = eid("Row", modelId + ":s" + si + "r" + rn++);
        blob[sCol]["Column::Row"].push(curRow);
        blob[curRow] = { Id: curRow, Kind: "Row", Column: sCol, "Row::Column": [] };
        used = 0;
      }
      const colId = eid("Column", modelId + ":" + fid);
      blob[curRow]["Row::Column"].push(colId);
      blob[colId] = { Id: colId, Kind: "Column", Type: "Field", Start: used, End: used + w, Row: curRow, "Column::Field": [fid] };
      used += w;
      colOf[fid] = colId;
    }
  });

  for (const f of spec.fields || []) {
    const fid = f.id || slug(f.name);
    const colId = colOf[fid];
    const field = { Id: fid, Kind: "Field", Type: f.type, Name: f.name, Model: modelId, Column: colId };
    if (f.required) field.Required = true;
    if (f.type === "Currency") field.CurrencyTypes = [f.currency || "USD"];
    // Attach a list reference ONLY when referredList names a real list (in idmap). The old
    // `|| f.name` fallback turned any plain Select into a phantom list ref (the field name),
    // which the remap never resolves → dangling cross-ref → the whole form/process is skipped.
    if ((f.type === "Select" || f.type === "Multiselect") && f.referredList) field.ReferredList = idmap[f.referredList] || f.referredList; // verbatim fallback: a bare Select publishes as an opaque 500

    // reference / user lookup
    if (REF_TYPES.has(f.type)) {
      const qdId = eid("QueryDefinition", modelId + ":" + fid);
      field["Field::QueryDefinition"] = [qdId];
      const isUser = f.type.startsWith("User") || f.type === "MultiUser";
      blob[qdId] = {
        Id: qdId, Kind: "QueryDefinition", Field: fid,
        LHSModel: isUser ? "User" : resolve(f.ref || ""), FlowType: isUser ? "User" : refFlowType(f.ref || ""),
        LookupField: (f.lookup || []).map((l) => ({ Id: l.id || slug(l.name), Name: l.name, Type: l.type || "Text" })),
        HiddenField: f.hidden || [],
      };
      enrichLookup(blob, qdId, f);
    }
    // computed field: compile f.formula → Expression::Node AST (mirrors the SDK). If the formula
    // can't be compiled (unsupported shape), DEGRADE to a manual field rather than emit a broken
    // empty-node Expression (which 500s on publish).
    if (f.formula) {
      const exId = eid("Expression", modelId + ":" + fid);
      blob[exId] = { Id: exId, Kind: "Expression", Field: fid, ExpressionStr: f.formula, "Expression::Node": [] };
      if (compileFormula(blob, exId, f.formula, f.type, modelId)) field["Field::Expression"] = [exId];
      else delete blob[exId];
    }
    // SequenceNumber requires Padding AND PrefixExpression — without Padding publish 500s;
    // without the prefix chain the field is half-built (editor marks Prefix mandatory)
    if (f.type === "SequenceNumber") field["Field::Property"] = addSequenceProps(blob, modelId, fid, f, spec.name);
    blob[fid] = field;
    addAggregate(blob, field, f, fid, resolve);
    model["Model::Field"].push(fid);
  }

  return {
    type: spec.flowType?.toLowerCase() || "form", id: modelId,
    shell: { Name: spec.name, Description: spec.description || "", _application_id: appId },
    blob,
  };
}

/**
 * A role's landing page — translates the experience-designer's CARDS into a rich, role-specific
 * INTERMEDIATE (KPI cards, scope-mapped data tables, charts), so each role's dashboard differs.
 * Card: { label, view:"kpi"|"list"|"chart", scope:"my-items"|"my-team"|"all", metric:"count"|"sum:F",
 *         source_flow, filter:{status?|groupBy?} }. flowInfo: { name: {genId, flowType, fields:{slug→id}} }.
 * Returns the intermediate only — applyIR compiles it via Kissflow's REAL transformer.py.
 */
export function buildPage(spec, appId, flowInfo = {}) {
  const ACCENTS = [["Color.Primary.100", "Color.Primary.600"], ["Color.Secondary.Five.100", "Color.Secondary.Five.600"], ["Color.Secondary.One.100", "Color.Secondary.One.600"], ["Color.Secondary.Three.100", "Color.Secondary.Three.600"], ["Color.Secondary.Six.100", "Color.Secondary.Six.600"]];
  const ICONS = ["file-solid.svg", "clock-solid.svg", "dollar-sign-solid.svg", "chart-bar-solid.svg", "check-solid.svg", "bell-solid.svg"];
  const label = (t, sz, c, w) => ({ type: "Label", properties: { title: t }, style: { fontSize: sz, color: c, ...(w ? { fontWeight: w } : {}) } });
  const panel = { background: "Color.White", borderWidth: "1px", borderStyle: "solid", borderColor: "Color.Gray.200", borderRadius: "12px" };
  const card = (title, desc, icon, bg, fg, width) => ({ type: "Container", layout: "horizontal", style: { width, height: "auto", wrap: "nowrap", alignItems: "center", gap: "14px", ...panel, paddingTop: "18px", paddingBottom: "18px", paddingLeft: "20px", paddingRight: "20px" }, children: [
    { type: "Icon", properties: { iconUrl: icon }, style: { width: "44px", height: "44px", bgColor: bg, color: fg, borderRadius: "10px", paddingTop: "11px", paddingBottom: "11px", paddingLeft: "11px", paddingRight: "11px" } },
    { type: "Container", layout: "vertical", style: { width: "100%", height: "auto", wrap: "nowrap", gap: "4px" }, children: [label(title, "15px", "Color.Gray.900", "Font.Weight.SemiBold"), label(desc, "13px", "Color.Gray.500")] }] });
  const section = (title, widget) => ({ type: "Container", layout: "vertical", style: { width: "100%", height: "auto", wrap: "nowrap", gap: "12px", ...panel, paddingTop: "20px", paddingBottom: "20px", paddingLeft: "20px", paddingRight: "20px" }, children: [label(title, "16px", "Color.Gray.900", "Font.Weight.SemiBold"), widget] });
  // PROCESS TABLE view binding — the process list renders when bound to the `myitems` system view (the
  // engine-built process serves data at /process/{id}/myitems; mytasks/_All_Items 404). The exact
  // FieldMapping shape (myitems + status:"all", no steps) is enforced deterministically by
  // client.mjs#fixProcessTables AFTER the transform, so this value is just the intermediate seed.
  const procViewId = () => "myitems";
  const metricDesc = (c) => c.metric === "count" ? "Count" : (c.metric || "").startsWith("sum:") ? "Total " + c.metric.slice(4) : (c.metric || "");
  const fieldId = (info, name) => info?.fields?.[slug(String(name || "")).toLowerCase()];

  const cards = spec.cards || [];
  const popups = []; // top-level Popup specs the transformer renders (create-form popups)
  const btn = (caption, popupId) => ({ type: "Button", name: caption, properties: { caption, type: "primary", size: "base" }, onClick: { type: "openPopup", popupId }, style: { width: "auto" } });
  const children = [
    { type: "Container", layout: "horizontal", style: { width: "100%", height: "auto", wrap: "nowrap", justifyContent: "space-between", alignItems: "center", ...panel, paddingTop: "20px", paddingBottom: "20px", paddingLeft: "24px", paddingRight: "24px" }, children: [
      { type: "Container", layout: "vertical", style: { width: "100%", height: "auto", wrap: "nowrap", gap: "4px" }, children: [label(spec.name, "24px", "Color.Gray.900", "Font.Weight.SemiBold"), label(spec.description || `${spec.role || ""} dashboard`, "14px", "Color.Gray.500")] }] },
  ];
  // KPI cards row
  const kpis = cards.filter((c) => c.view === "kpi");
  if (kpis.length) {
    const w = `calc(${(100 / kpis.length).toFixed(2)}% - ${Math.round((16 * (kpis.length - 1)) / kpis.length)}px)`;
    children.push({ type: "Container", layout: "horizontal", style: { width: "100%", height: "auto", wrap: "nowrap", columnGap: "16px" }, children: kpis.map((c, i) => card(c.label, metricDesc(c), ICONS[i % ICONS.length], ACCENTS[i % ACCENTS.length][0], ACCENTS[i % ACCENTS.length][1], w)) });
  }
  // list + chart sections (in card order)
  for (const c of cards) {
    const info = flowInfo[c.source_flow]; if (!info || c.view === "kpi") continue;
    const isProc = (info.flowType || "Form") === "Process";
    if (c.view === "list") {
      const st = Array.isArray(c.filter?.status) ? c.filter.status[0] : c.filter?.status;
      const tbl = isProc
        ? { type: "ProcessTable", name: c.label, process: { processId: info.genId, viewId: procViewId(info) }, properties: { showform: true, ...(st ? { status: st } : {}) }, style: { width: "100%", height: "420px" } }
        : { type: "DataformTable", name: c.label, dataform: { formId: info.genId, viewId: "allitems" }, properties: { showform: true }, style: { width: "100%", height: "420px" } };
      children.push(section(c.label, tbl));
    } else if (c.view === "chart" && isProc) {
      const dim = fieldId(info, c.filter?.groupBy), meas = (c.metric || "").startsWith("sum:") ? fieldId(info, c.metric.slice(4)) : null;
      if (dim) children.push(section(c.label, { type: "ChartReport", name: c.label, report: { processId: info.genId, generate: { viewType: "BarColumnChart", dimensionFieldId: dim, measureFieldId: meas || dim, aggregateFunction: meas ? "SUM" : "COUNT" } }, style: { width: "100%", height: "360px" } }));
    } else if (c.view === "action" || c.view === "create") {
      // CREATE action — a "New <flow>" Button that opens a HIDDEN popup containing the flow's create
      // FormView (a bare ProcessTable has NO native +New; the create affordance is Button→Popup→FormView
      // per the transformer's own catalog). The flow's worklist sits below so the page doubles as the
      // "My <flow>" list. Emitted on pages of roles that may INITIATE this flow.
      const popupId = `Popup_new_${slug(c.source_flow)}`;
      const form = isProc
        ? { type: "FormView", name: "New " + c.label, process: { processId: info.genId } }
        : { type: "FormView", name: "New " + c.label, dataform: { formId: info.genId } };
      popups.push({ id: popupId, title: "New " + c.label, children: [form] });
      const tbl = isProc
        ? { type: "ProcessTable", name: c.label, process: { processId: info.genId, viewId: procViewId(info) }, style: { width: "100%", height: "460px" } }
        : { type: "DataformTable", name: c.label, dataform: { formId: info.genId, viewId: "allitems" }, style: { width: "100%", height: "460px" } };
      children.push({ type: "Container", layout: "vertical", style: { width: "100%", height: "auto", wrap: "nowrap", gap: "14px", ...panel, paddingTop: "20px", paddingBottom: "20px", paddingLeft: "20px", paddingRight: "20px" }, children: [
        { type: "Container", layout: "horizontal", style: { width: "100%", height: "auto", wrap: "nowrap", justifyContent: "space-between", alignItems: "center" }, children: [label(c.label, "16px", "Color.Gray.900", "Font.Weight.SemiBold"), btn("New " + c.label, popupId)] },
        tbl,
      ] });
    }
  }
  const intermediate = { page: { name: spec.name, description: spec.description || "" }, ...(popups.length ? { popups } : {}), body: { style: { width: "100%", height: "auto", wrap: "nowrap", background: "Color.Gray.100", paddingTop: "24px", paddingBottom: "24px", paddingLeft: "24px", paddingRight: "24px", rowGap: "20px" }, children } };
  return { type: "page", id: `${slug(spec.name)}_A00`, shell: { Name: spec.name, Description: spec.description || "" }, intermediate };
}

// Build one field entity into a blob under a given model (no layout column needed for
// child-table fields). Shared by child-table embedding.
export function buildFieldInto(blob, modelId, f, idmap, withColumn, flowTypes = {}) {
  const resolve = (l) => idmap[l] || l;
  const refFlowType = (ref) => flowTypes[ref] || flowTypes[resolve(ref)] || "Form";
  const fid = f.id || slug(f.name);
  const field = { Id: fid, Kind: "Field", Type: f.type, Name: f.name, Model: modelId };
  if (withColumn) field.Column = withColumn;
  if (f.required) field.Required = true;
  if (f.type === "Currency") field.CurrencyTypes = [f.currency || "USD"];
  if ((f.type === "Select" || f.type === "Multiselect") && f.referredList) field.ReferredList = idmap[f.referredList] || f.referredList; // verbatim fallback: a bare Select publishes as an opaque 500
  if (REF_TYPES.has(f.type)) {
    const qdId = eid("QueryDefinition", modelId + ":" + fid);
    field["Field::QueryDefinition"] = [qdId];
    const isUser = f.type.startsWith("User") || f.type === "MultiUser";
    blob[qdId] = { Id: qdId, Kind: "QueryDefinition", Field: fid, LHSModel: isUser ? "User" : resolve(f.ref || ""), FlowType: isUser ? "User" : refFlowType(f.ref || ""), LookupField: (f.lookup || []).map((l) => ({ Id: l.id || slug(l.name), Name: l.name, Type: l.type || "Text" })), HiddenField: f.hidden || [] };
    enrichLookup(blob, qdId, f);
  }
  blob[fid] = field; // field must exist before compiling a formula that may reference siblings
  addAggregate(blob, field, f, fid, resolve);
  if (f.formula) {
    const exId = eid("Expression", modelId + ":" + fid);
    blob[exId] = { Id: exId, Kind: "Expression", Field: fid, ExpressionStr: f.formula, "Expression::Node": [] };
    if (compileFormula(blob, exId, f.formula, f.type, modelId)) field["Field::Expression"] = [exId];
    else delete blob[exId];
  }
  if (f.type === "SequenceNumber") field["Field::Property"] = addSequenceProps(blob, modelId, fid, f, blob[modelId]?.Name);
  return fid;
}

/** SequenceNumber sub-config — Padding + the MANDATORY PrefixExpression chain
 *  Property(ValueType:"Expression") → Expression → Node(Static). The editor requires a prefix;
 *  a field with Padding alone is half-built: it loads, but the sequence editor/engine chokes on it
 *  (diagnosed against a working Application_Number export, 2026-07-17). The prefix string lives in
 *  TWO places that must stay in sync: Expression.ExpressionStr (a QUOTED literal) and Node.Value
 *  (the raw string). Default prefix: first 3 letters of the flow name, uppercased, + " - ". */
function addSequenceProps(blob, modelId, fid, f, flowName) {
  const padId = eid("Property", modelId + ":" + fid + ":pad");
  const pfxId = eid("Property", modelId + ":" + fid + ":pfx");
  const exId = eid("Expression", modelId + ":" + fid + ":pfx");
  const ndId = eid("Node", modelId + ":" + fid + ":pfx");
  const prefix = f.prefix || (String(flowName || fid).replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase() + " - ");
  blob[padId] = { Id: padId, Kind: "Property", Name: "Padding", Field: fid, Value: f.padding || "0001", ValueType: "Value" };
  blob[pfxId] = { Id: pfxId, Kind: "Property", Name: "PrefixExpression", ValueType: "Expression", Field: fid, "Property::Expression": [exId] };
  blob[exId] = { Id: exId, Kind: "Expression", ExpressionStr: JSON.stringify(prefix), Property: pfxId, "Expression::Node": [ndId] };
  blob[ndId] = { Id: ndId, Kind: "Node", Type: "Static", Value: prefix, DataType: "String", Expression: exId };
  return [padId, pfxId];
}

/** Bind every SequenceNumber field on a process model to the step that ISSUES the number.
 *
 *  The platform's own field editor writes THREE properties; we wrote two. The third is
 *  `Step` — Value = the Activity id at which the number is allocated — and its absence is not
 *  cosmetic:
 *    · opening the field in the studio form THROWS (the editor reads Step to populate its
 *      "generate at" selector and finds nothing), and
 *    · no number is ever issued, because nothing says when to issue it.
 *  Diagnosed on dev-lcncdemo 2026-08-12 by diffing TravelFlow's generated `Request Number`
 *  against a `Seq no` field added BY HAND in the studio — the hand-made one carried
 *  {Name:"Step", Value:"Activity_106ir2q"}, the StartEvent. Every other property matched, which
 *  is why this survived: the field looks complete, loads, publishes, and reports Live.
 *
 *  The StartEvent is the right default and the platform's own: a number allocated at submit is
 *  what "TR-0001" means to the person who filed it. A later step would leave the record without
 *  an identifier for the whole approval leg.
 *
 *  Scoped to PROCESS models on purpose — Step names an Activity, and a form has no workflow to
 *  name. A sequence field on a plain form is left as it was rather than pointed at a step that
 *  does not exist. */
export function bindSequenceSteps(blob, modelId, pdId) {
  const acts = blob[pdId]?.["ProcessDef::Activity"] || [];
  const start = acts.find((a) => blob[a]?.NodeType === "StartEvent") || acts[0];
  if (!start) return 0;                                    // no workflow → nothing to bind to
  let bound = 0;
  for (const f of Object.values(blob)) {
    if (!f || f.Kind !== "Field" || f.Type !== "SequenceNumber" || f.Model !== modelId) continue;
    const props = f["Field::Property"] || (f["Field::Property"] = []);
    if (props.some((p) => blob[p]?.Name === "Step")) continue;    // already bound — never overwrite
    const stepId = eid("Property", modelId + ":" + f.Id + ":step");
    blob[stepId] = { Id: stepId, Kind: "Property", Name: "Step", Field: f.Id, Value: start, ValueType: "Value" };
    props.push(stepId);
    bound++;
  }
  return bound;
}

/** Embed a child table — mirrors ProcessSDK/BaseFormSDK.create_table:
 *  Model → Row → Column(Type=Model) → child Model → Row → Column(Type=Field) → Field. */
export function addChildTable(parent, childSpec, fieldLabel, idmap, flowTypes = {}) {
  const blob = parent.blob, parentId = parent.id;
  const childId = childSpec.id || `${slug(childSpec.name)}_A00`;
  const rowId = eid("Row", parentId + ":ct:" + childId), colId = eid("Column", parentId + ":ct:" + childId);
  blob[parentId]["Model::Row"].push(rowId);
  blob[rowId] = { Id: rowId, Kind: "Row", Model: parentId, "Row::Column": [colId] };
  blob[colId] = { Id: colId, Kind: "Column", Type: "Model", Name: fieldLabel || childSpec.name, Start: 0, End: 6, AllowImport: false, Row: rowId, "Column::Model": [childId] };
  const child = { Id: childId, Kind: "Model", Name: childSpec.name, Model: parentId, Column: colId, "Model::Row": [], "Model::Field": [] };
  blob[childId] = child;
  // the parent MUST declare the child via Model::Model — without it, publish silently DISSOLVES the
  // child model (fields flatten into the parent, runtime Tables:[] — DEF-4's root cause, found by
  // diffing the golden Employee_Leave_Request export 2026-07-04).
  blob[parentId]["Model::Model"] = [...(blob[parentId]["Model::Model"] || []), childId];
  // table fields are COLUMNS — all in ONE row, sequential (Start=0,End=0), per SDK __create_field_in_table
  const tRow = eid("Row", childId + ":row");
  child["Model::Row"].push(tRow);
  blob[tRow] = { Id: tRow, Kind: "Row", Model: childId, "Row::Column": [] };
  for (const f0 of childSpec.fields || []) {
    // Child-field ids default to slug(name). If that id is already taken (a sibling child table
    // of the same parent, or the parent itself, has the same field name — e.g. "Vendor ID" in
    // both Independent & Resigned member tables), namespace it by the child model so the two
    // don't collide and orphan a QueryDefinition. We clone the spec (never mutate the IR, so
    // buildApp stays deterministic); formulas still resolve because compileFormula matches
    // operands by field NAME, not id.
    const base = f0.id || slug(f0.name);
    const f = (!f0.id && blob[base]) ? { ...f0, id: `${childId}_${slug(f0.name)}` } : f0;
    const fid = f.id || slug(f.name);
    const fcol = eid("Column", childId + ":" + fid);
    blob[tRow]["Row::Column"].push(fcol);
    blob[fcol] = { Id: fcol, Kind: "Column", Type: "Field", Start: 0, End: 0, Row: tRow, "Column::Field": [fid] };
    buildFieldInto(blob, childId, f, idmap, fcol, flowTypes);
    child["Model::Field"].push(fid);
  }
}

/** Author a process workflow inline into the process model blob (export-verified shape).
 * Per-step field access: default Editable at Start / ReadOnly elsewhere, overridable via
 * step.field_permissions { "<field, section or child-table name>": Editable|ReadOnly|Hidden|Mandatory }
 * (process activities accept all four levels — Mandatory = required-at-this-step). */
export function addWorkflow(parent, steps, roleIds) {
  const blob = parent.blob, modelId = parent.id, model = blob[modelId];
  // layout columns of the top-level form fields (child-table internal fields have no Column)
  const fieldCols = Object.values(blob).filter((e) => e && e.Kind === "Field" && e.Model === modelId && e.Column).map((f) => f.Column);
  // child-table columns (Type:Model) ALSO need a per-step permission — without one Kissflow
  // hides the whole table in the form (no permission = not shown). Their Row is a top-level
  // row of the parent model. Append them so each step grants the tables visibility.
  const childTableCols = Object.values(blob).filter((e) => e && e.Kind === "Column" && e.Type === "Model" && blob[e.Row]?.Model === modelId).map((e) => e.Id);
  const allCols = [...fieldCols, ...childTableCols];
  // name → layout column, for resolving field_permissions overrides (field Name, child-table
  // Column Name, and the nested child Model Name all address the same table column)
  const normName = (s) => String(s ?? "").replace(/[^a-z0-9]+/gi, "").toLowerCase();
  const nameToCol = {};
  for (const e of Object.values(blob)) if (e && e.Kind === "Field" && e.Model === modelId && e.Column) nameToCol[normName(e.Name)] = e.Column;
  for (const cId of childTableCols) {
    const c = blob[cId];
    if (c.Name) nameToCol[normName(c.Name)] = cId;
    const cm = blob[(c["Column::Model"] || [])[0]];
    if (cm?.Name) nameToCol[normName(cm.Name)] = cId;
  }
  // SECTIONS are addressable too (golden: Permission{Column:<Section col>} — Disclosure_Reports).
  // A section override emits the Section column's own Permission AND cascades to its member
  // field/table columns as their default; a field-level override still wins.
  const sectionMembers = {};
  for (const e of Object.values(blob)) {
    if (!e || e.Kind !== "Column" || e.Type !== "Section" || blob[e.Row]?.Model !== modelId) continue;
    if (e.Name) nameToCol[normName(e.Name)] = e.Id;
    sectionMembers[e.Id] = (e["Column::Row"] || []).flatMap((rId) => blob[rId]?.["Row::Column"] || []);
  }
  const pdId = eid("ProcessDef", modelId);
  model["Model::ProcessDef"] = [pdId];
  model.RootProcessDef = pdId;
  blob[pdId] = { Id: pdId, Kind: "ProcessDef", WorkflowType: "Sequence", Model: modelId, "ProcessDef::Activity": [] };
  (steps || []).forEach((s, i) => {
    // shared step-activity builder — used by top-level steps AND parallel-branch inner steps, so
    // branch steps get the SAME permission/assignee/condition machinery as everything else.
    const buildStepActivity = (spec, ownerPdId, nodeType) => {
      const aId = eid("Activity", modelId + ":" + spec.name);
      const act = { Id: aId, Kind: "Activity", NodeType: nodeType, Name: spec.name, ProcessDef: ownerPdId, "Activity::Permission": [] };
      // one Permission per field per step (initiator edits at Start; reviewers read elsewhere;
      // spec.field_permissions overrides per field — mid-flow edits, Hidden, Mandatory)
      const defLevel = nodeType === "StartEvent" ? "Editable" : "ReadOnly";
      const overrides = {};
      for (const [k, v] of Object.entries(spec.field_permissions || {})) {
        const col = nameToCol[normName(k)];
        if (col && !sectionMembers[col]) overrides[col] = v;
      }
      // section overrides: own Permission entry + cascade to members (explicit field override wins)
      for (const [k, v] of Object.entries(spec.field_permissions || {})) {
        const sCol = nameToCol[normName(k)];
        if (!sCol || !sectionMembers[sCol]) continue;
        const pId = eid("Permission", aId + ":" + sCol);
        act["Activity::Permission"].push(pId);
        blob[pId] = { Id: pId, Kind: "Permission", Column: sCol, Permission: v, Activity: aId };
        for (const mCol of sectionMembers[sCol]) if (!(mCol in overrides)) overrides[mCol] = v;
      }
      for (const col of allCols) {
        const pId = eid("Permission", aId + ":" + col);
        act["Activity::Permission"].push(pId);
        blob[pId] = { Id: pId, Kind: "Permission", Column: col, Permission: overrides[col] || defLevel, Activity: aId };
      }
      // assignee only on UserTask steps (not Start/End)
      if (nodeType === "UserTask" && spec.actor && roleIds[spec.actor]) {
        const rId = eid("Resource", aId);
        act["Activity::Resource"] = [rId];
        blob[rId] = { Id: rId, Kind: "Resource", ValueType: "AppRole", DisplayValue: spec.actor, Value: roleIds[spec.actor], Activity: aId };
      }
      // STEP CONDITION (LESSONS §11, owner-confirmed): the step runs only when the formula is true —
      // an Activity::Expression carrying the SAME Expression/Node AST as a field formula, re-scoped
      // Field→Activity ("Amount > 500000" on the CEO step, "Amount <= 500000" on the Council step).
      if (nodeType === "UserTask" && spec.condition) {
        const exId = eid("Expression", modelId + ":" + aId);
        const firstField = (String(spec.condition).match(/[A-Za-z_][A-Za-z0-9_.]*/g) || [])
          .map((t) => Object.values(blob).find((e) => e && e.Kind === "Field" && e.Model === modelId && slug(e.Name) === t))
          .find(Boolean);
        blob[exId] = { Id: exId, Kind: "Expression", Activity: aId, ExpressionStr: spec.condition, "Expression::Node": [] };
        if (compileFormula(blob, exId, spec.condition, firstField?.Type || "Number", modelId)) act["Activity::Expression"] = [exId];
        else delete blob[exId]; // degrade to unconditional rather than ship a broken AST (validator warns upstream)
      }
      blob[aId] = act;
      return aId;
    };
    // PARALLEL BRANCHES (LESSONS §12, golden-verified vs Vashi_Setup_Operations): a middle "step"
    // with `branches:[{name, steps:[…]}]` becomes a NodeType:"Parallel" activity whose
    // Activity::ProcessDef forks into one MINIMAL branch ProcessDef per arm ({Id, Kind, Name,
    // Activity} — no WorkflowType/Model), each holding ordinary UserTask activities. The branches
    // auto-join: the flow continues with the parallel node's next sibling in the parent order.
    if (Array.isArray(s.branches) && s.branches.length) {
      const parId = eid("Activity", modelId + ":" + s.name);
      const par = { Id: parId, Kind: "Activity", NodeType: "Parallel", Name: s.name, ProcessDef: pdId, "Activity::ProcessDef": [] };
      blob[pdId]["ProcessDef::Activity"].push(parId);
      for (const br of s.branches) {
        const bSteps = br.steps || [br]; // a branch may be a bare step spec
        const bName = br.name || bSteps[0]?.name || "Branch";
        const bpdId = eid("ProcessDef", modelId + ":" + s.name + ":" + bName);
        blob[bpdId] = { Id: bpdId, Kind: "ProcessDef", Name: bName, Activity: parId, "ProcessDef::Activity": [] };
        par["Activity::ProcessDef"].push(bpdId);
        for (const bs of bSteps) blob[bpdId]["ProcessDef::Activity"].push(buildStepActivity(bs, bpdId, "UserTask"));
      }
      blob[parId] = par;
      return;
    }
    const nodeType = i === 0 ? "StartEvent" : i === steps.length - 1 ? "EndEvent" : "UserTask";
    blob[pdId]["ProcessDef::Activity"].push(buildStepActivity(s, pdId, nodeType));
  });
  bindSequenceSteps(blob, modelId, pdId);
  // Appearance → Style (card display config every process model carries)
  const appId = eid("Appearance", modelId), styleId = eid("Style", modelId);
  model["Model::Appearance"] = [appId];
  blob[appId] = { Id: appId, Kind: "Appearance", Model: modelId, "Appearance::Style": [styleId] };
  blob[styleId] = { Id: styleId, Kind: "Style", Appearance: appId };
  // action-button row (every process model carries a Button::Row)
  const browId = eid("Row", modelId + ":buttons");
  model["Button::Row"] = [browId];
  blob[browId] = { Id: browId, Kind: "Row", Button: modelId };
}

// The 4 system swimlane States every board carries (golden-eval: ProfServ Projects/Enquiry/Tasks).
const BOARD_STATES = [
  { Id: "State_Not_Started", Name: "Not started", Category: "NotStarted", IsSystem: true, IsDefaultState: true, IsLastState: false },
  { Id: "State_In_Progress", Name: "In progress", Category: "InProgress", IsSystem: true, IsDefaultState: false, IsLastState: false },
  { Id: "State_On_Hold", Name: "On hold", Category: "NotStarted", IsSystem: true, IsDefaultState: false, IsLastState: false },
  { Id: "State_Done", Name: "Done", Category: "Closed", IsSystem: true, IsDefaultState: false, IsLastState: true },
];

/**
 * A BOARD (Kissflow Case flow) → the Model (`FlowType:"Case"`) PLUS a SEPARATE CaseFlow blob (the
 * Statuses = board columns + the 4 system swimlane States). A board models an UNSTRUCTURED workflow:
 * the user moves each card between statuses freely (no system routing) — todos, tasks, projects, and
 * case use-cases (service requests, support, onboarding). This is the counterpart to a Process
 * (structured, system-routed steps). Golden-eval shape.
 *
 * spec: { name, id?, fields:[…], section?, statuses?:[{ name, category? }] }
 *   `statuses` default to a generic To Do → In Progress → Done lifecycle. `category` ∈
 *   NotStarted | InProgress | Done | Closed | ReOpened. Each status's OutwardStatus lists every OTHER
 *   status (free movement — the trait that distinguishes a board from a process). A system "Reopened"
 *   status is appended (matches the golden eval). The form layout/fields reuse buildForm.
 *
 * Returns the standard { type:"case", id, shell, blob } for the Model, PLUS a `caseflow` sub-artifact
 * { type:"caseflow", id, parentModel, shell, blob } that the publish path emits after the model.
 */
export function buildBoard(spec, appId, idmap = {}, flowTypes = {}) {
  const form = buildForm({ ...spec, flowType: "Case" }, appId, idmap, flowTypes); // Model(FlowType:Case) + fields + layout
  form.type = "case";
  const modelId = form.id;

  // Model::Appearance (Appearance + Style holder) — every UI-built board/case model carries this pair (it's
  // the card-display config holder). buildForm omits it; without it the case model is structurally
  // incomplete vs a real board. (Verified missing by diffing against a UI-built Service Request board.)
  const apId = eid("Appearance", modelId), stId = eid("Style", modelId);
  form.blob[modelId]["Model::Appearance"] = [apId];
  form.blob[apId] = { Id: apId, Kind: "Appearance", Model: modelId, "Appearance::Style": [stId] };
  form.blob[stId] = { Id: stId, Kind: "Style", Appearance: apId };

  const cfId = eid("CaseFlow", modelId);
  const cfBlob = { Root: cfId };
  // designed statuses may arrive top-level (spec.statuses) OR nested under the workflow-designer's
  // caseflow slice (spec.caseflow.statuses); read both before falling back to a generic 3-column board
  // — else every designed Case lifecycle was silently dropped and the board shipped To Do/In Progress/Done.
  const specStatuses = (spec.statuses && spec.statuses.length) ? spec.statuses
    : (spec.caseflow?.statuses && spec.caseflow.statuses.length) ? spec.caseflow.statuses
    : [{ name: "To Do", category: "NotStarted" }, { name: "In Progress", category: "InProgress" }, { name: "Done", category: "Done" }];
  // designed transitions (from→to status NAMES) restrict movement; absent → free movement (board default).
  const nrmStatus = (s) => String(s ?? "").replace(/[^a-z0-9]+/gi, "").toLowerCase();
  const outwardByName = {};
  for (const t of (spec.caseflow?.transitions || spec.transitions || [])) {
    const from = nrmStatus(t.from ?? t.From), to = nrmStatus(t.to ?? t.To);
    if (from && to) (outwardByName[from] = outwardByName[from] || new Set()).add(to);
  }
  const hasTransitions = Object.keys(outwardByName).length > 0;
  // Status Category MUST be one of the swimlane State categories {NotStarted, InProgress, Closed}
  // (+ ReOpened). A status with Category "Done"/"Completed" publishes fine but has NO landing State,
  // so the runtime rejects the move → the board can never reach its terminal column (hire-onboarding
  // 2026-07-05: cases stuck pre-Completed, tasks un-Done-able; Cancelled worked only because it was
  // already "Closed"). Normalize any terminal/done category to "Closed".
  const normCat = (cat) => {
    const c = String(cat || "InProgress");
    if (/^(done|complete|completed|closed|resolved|finished)$/i.test(c)) return "Closed";
    if (/^(notstarted|not[_ ]?started|todo|to[_ ]?do|open|new)$/i.test(c)) return "NotStarted";
    if (/^reopened$/i.test(c)) return "ReOpened";
    return "InProgress";
  };
  const built = specStatuses.map((s) => ({ id: eid("Status", modelId + ":" + s.name), name: s.name, category: normCat(s.category), isSystem: false }));
  built.push({ id: eid("Status", modelId + ":Reopened"), name: "Reopened", category: "ReOpened", isSystem: true });

  const statusIds = [];
  for (const b of built) {
    cfBlob[b.id] = {
      Id: b.id, Kind: "Status", Name: b.name, Category: b.category, IsSystem: b.isSystem, Resources: [],
      // honor designed transitions when this status has them; the system Reopened + any status with NO
      // designed outward keep free movement so the board can never deadlock (a trapped status = dead end).
      OutwardStatus: (hasTransitions && !b.isSystem && outwardByName[nrmStatus(b.name)]?.size)
        ? built.filter((x) => x.id !== b.id && outwardByName[nrmStatus(b.name)].has(nrmStatus(x.name))).map((x) => x.id)
        : built.filter((x) => x.id !== b.id).map((x) => x.id),
      EntryRule: [], ExitRule: [], Rule: [], SLADisabled: false,
    };
    statusIds.push(b.id);
  }
  const stateIds = [];
  for (const s of BOARD_STATES) { cfBlob[s.Id] = { ...s, Kind: "State" }; stateIds.push(s.Id); }

  cfBlob[cfId] = {
    Id: cfId, Name: `${spec.name} flow`, Kind: "CaseFlow", Model: modelId, Type: "Case", FlowType: "CaseFlow",
    "CaseFlow::Status": statusIds, "CaseFlow::State": stateIds,
  };
  form.caseflow = { type: "caseflow", id: cfId, parentModel: modelId, shell: { Name: `${spec.name} flow`, _application_id: appId }, blob: cfBlob };
  return form;
}

/**
 * Build the PAGE entity-graph that embeds a Kanban board (+ header + a default "New <Item>" button that
 * opens the create-form popup). Grafts onto the page's starter `draft` (which ships a Body Container001).
 * CRITICAL (verified vs live Retail pages): a component's flow binding lives in its CONTAINER's
 * `Container::FieldMapping`, NOT the component's Data. Current manifests: kanban=`view/kanban`/`Kanban`,
 * form=`view/form`/`Form` (the `case/views/kanban` + `case/form` from older exports are DEPRECATED and
 * render "board view not found"). See reference/BOARD-AND-KANBAN-PAGE.md.
 * spec: { pageId, caseId, viewId?(=<caseId>_all), title, subtitle?, itemLabel?(="Item"), newButton?(=true) }
 */
export function buildKanbanPage(spec, draft) {
  const d = draft && draft.Root ? draft : { Root: spec.pageId, [spec.pageId]: { Id: spec.pageId, Kind: "Page", "Page::Container": ["Container001"] }, Container001: { Id: "Container001", Kind: "Container", Type: "Body", Name: "Body", Page: spec.pageId, "Container::Style": [] } };
  const PID = spec.pageId, CASE = spec.caseId, VIEW = spec.viewId || `${CASE}_all`, root = d.Root, body = "Container001";
  const keep = new Set([root, body, ...(d[body]["Container::Style"] || [])]);
  for (const k of Object.keys(d)) { if (k === "Root") continue; const v = d[k]; if (v && v.Kind === "User") continue; if (!keep.has(k) && v && v.Kind) delete d[k]; }
  let n = 0; const nid = (p) => `${p}_${eid(p, PID + (++n)).replace(/^[^_]*_/, "")}`;
  const st = (h, val) => { const s = nid("Style"); d[s] = { Id: s, Kind: "Style", Container: h, ...(val ? { Value: val } : {}) }; return s; };
  const cn = (type, parent, arrays = {}, sv) => { const c = nid("Container"); d[c] = { Id: c, Kind: "Container", Type: type, Name: type, Container: parent, "Container::Style": [st(c, sv)], ...arrays }; return c; };
  const fmv = (h, name, value, type = "Value") => { const f = nid("FieldMapping"), p = nid("Property"); d[f] = { Id: f, Kind: "FieldMapping", Name: name, Container: h, "FieldMapping::Property": [p] }; d[p] = { Id: p, Kind: "Property", Type: type, Value: value, FieldMapping: f }; return f; };
  const label = (parent, title, fs, color) => { const slot = cn("Component", parent, { "Container::Component": [] }); const c = nid("Label"); d[c] = { Id: c, Kind: "Component", Script: { web: "general/label" }, Name: "Label", Page: PID, Container: slot, Data: { manifest_id: "Label", category: "general", visualization_type: "label" } }; d[slot]["Container::Component"] = [c]; d[slot]["Container::FieldMapping"] = [fmv(slot, "title", title), fmv(slot, "fontSize", fs), ...(color ? [fmv(slot, "color", color)] : [])]; return c; };

  // HEADER — title + optional subtitle, each in its own row
  const header = cn("Container", body, { "Container::Container": [] }, { marginBottom: "12px" });
  const hkids = [], comps = [];
  { const r = cn("Container", header, { "Container::Container": [] }); const l = label(r, spec.title || "Board", "24px"); d[r]["Container::Container"] = [d[l].Container]; hkids.push(r); comps.push(l); }
  if (spec.subtitle) { const r = cn("Container", header, { "Container::Container": [] }); const l = label(r, spec.subtitle, "14px", "#5b6b83"); d[r]["Container::Container"] = [d[l].Container]; hkids.push(r); comps.push(l); }
  d[header]["Container::Container"] = hkids;

  const kanId = nid("Kanban");
  const bodyKids = [header];
  const pagePopups = [];

  // NEW-<Item> BUTTON + create-form popup (default for kanban pages)
  if (spec.newButton !== false) {
    const popup = nid("Popup"), popCont = nid("Container"), formCont = cn("Component", popCont, { "Container::Component": [] }), form = nid("Form");
    d[popCont] = { Id: popCont, Kind: "Container", Type: "Popup", Name: "Popup", Popup: popup, "Container::Style": [st(popCont)], "Container::Container": [formCont] };
    d[form] = { Id: form, Kind: "Component", Script: { web: "view/form" }, Name: "Case form", Page: PID, Container: formCont, Data: { manifest_id: "Form", category: "view", visualization_type: "form", flow_type: "Case", flow_id: CASE } };
    d[formCont]["Container::Component"] = [form];
    d[formCont]["Container::FieldMapping"] = [fmv(formCont, "flow_id", CASE), fmv(formCont, "flow_type", "Case")];
    const jsCode = `let component = await kf.app.page.getComponent("${kanId}")\ncomponent.refresh();\nkf.app.page.popup.close()`;
    const evJS = (name) => { const e = nid("EventMapping"), p = nid("Property"); d[e] = { Id: e, Kind: "EventMapping", Container: formCont, Name: name, Type: "JSAction", "EventMapping::Property": [p] }; d[p] = { Id: p, Kind: "Property", Type: "Code", Value: jsCode, EventMapping: e }; return e; };
    d[formCont]["Container::EventMapping"] = [evJS("on_submit"), evJS("on_discard")];
    d[popup] = { Id: popup, Kind: "Popup", Script: { web: "general/popup" }, Name: `New ${spec.itemLabel || "Item"} Popup`, Page: PID, "Popup::Container": [popCont], "Popup::Style": [st(popup)] };
    pagePopups.push(popup); comps.push(form);
    const btnRow = cn("Container", body, { "Container::Container": [] }, { display: "flex", justifyContent: "flex-end", marginBottom: "8px" });
    const btnSlot = cn("Component", btnRow, { "Container::Component": [] }); const btn = nid("Button");
    d[btn] = { Id: btn, Kind: "Component", Script: { web: "general/button" }, Name: "Button", Page: PID, Container: btnSlot, Data: { manifest_id: "Button", category: "general", subcategory: "system", visualization_type: "button" } };
    d[btnSlot]["Container::Component"] = [btn];
    d[btnSlot]["Container::FieldMapping"] = [fmv(btnSlot, "caption", `New ${spec.itemLabel || "Item"}`), fmv(btnSlot, "size", "medium"), fmv(btnSlot, "type", "primary"), fmv(btnSlot, "iconPosition", "left")];
    const ce = nid("EventMapping"), cp = nid("Property"); d[ce] = { Id: ce, Kind: "EventMapping", Container: btnSlot, Name: "on_click", Type: "OpenPopup", "EventMapping::Property": [cp] }; d[cp] = { Id: cp, Kind: "Property", Type: "Popup", Name: "popup_params", Value: popup, EventMapping: ce };
    d[btnSlot]["Container::EventMapping"] = [ce]; d[btnRow]["Container::Container"] = [btnSlot];
    bodyKids.push(btnRow); comps.push(btn);
  }

  // BOARD — Kanban component; flow binding in the CONTAINER's FieldMappings
  const bouter = cn("Container", body, { "Container::Container": [] }, { height: "640px" });
  const bslot = cn("Component", bouter, { "Container::Component": [] }, { "Kanban.Height": { value: "100%" } });
  d[kanId] = { Id: kanId, Kind: "Component", Script: { web: "view/kanban" }, Name: "Kanban", Page: PID, Container: bslot, Data: { manifest_id: "Kanban", category: "view", visualization_type: "kanban", flow_type: "Case", flow_id: CASE, view_id: VIEW } };
  d[bslot]["Container::Component"] = [kanId];
  d[bslot]["Container::FieldMapping"] = [fmv(bslot, "flow_type", "Case"), fmv(bslot, "flow_id", CASE), fmv(bslot, "view_id", VIEW), fmv(bslot, "showform", false), fmv(bslot, "filterParameters", null, "FilterParam")];
  d[bouter]["Container::Container"] = [bslot];
  bodyKids.push(bouter); comps.push(kanId);

  d[body]["Container::Container"] = bodyKids;
  d[root]["Page::Component"] = comps;
  if (pagePopups.length) d[root]["Page::Popup"] = pagePopups;
  return d;
}

/** Build a per-(role,model) permission artifact. Permission{Column, Permission} is the
 *  export shape; the holder Kind is a projection (wired to the real formview/activity on publish). */
export function buildPermission(perm, ir, idmap, roleIds) {
  const modelId = idmap[perm.model] || perm.model;
  const roleId = roleIds[perm.role] || perm.role;
  const id = eid("Perm", perm.role + ":" + perm.model);
  const form = (ir.forms || []).find((f) => (f.id || f.name) === perm.model);
  // canonicalize scope so permissions AND dashboards read the SAME value: security may emit "my-items"
  // or "my" — normalize to "my" (the form both the platform Scope and the dashboard viewId agree on).
  const scope = perm.scope === "my-items" ? "my" : (perm.scope || "all");
  const holder = { Id: id, Kind: "FlowPermission", Role: roleId, RoleName: perm.role, Model: modelId, Level: perm.level || "Editable", Scope: scope, "FlowPermission::Permission": [] };
  const blob = { Root: id, [id]: holder };
  for (const f of form?.fields || []) {
    const fid = f.id || slug(f.name);
    const pId = eid("Permission", id + ":" + fid);
    holder["FlowPermission::Permission"].push(pId);
    blob[pId] = { Id: pId, Kind: "Permission", Column: fid, Permission: f.level || perm.level || "Editable" };
  }
  return { type: "permission", id, blob };
}

/** normalizeIR — RESILIENCE: the design agents are meant to emit the engine shape (top-level
 *  roles[]/permissions[]), but they don't always — sometimes the role list stays in architecture.roles
 *  and the permission matrix stays in the security.roles design map. buildApp reads ONLY top-level
 *  roles[]/permissions[], so without this an otherwise-complete IR builds an app with NO roles and NO
 *  permissions (every persona locked out). This lifts the design slices into the engine arrays ONLY when
 *  the top-level ones are absent — deterministic, lossless, and a no-op when agents did emit engine shape. */
export function normalizeIR(ir, opts = {}) {
  if (!ir || typeof ir !== "object") return ir;
  // pageMode:"none" — a custom-UI (or backend-only) build wants ZERO native pages. Expressed here,
  // not by mutating ir.pages, because the experience.pages lift below fires on an EMPTY ir.pages —
  // so clearing the array upstream is silently undone. Strip both page sources and mark the intent
  // so downstream (ensureExperience, the page builders) can honour it. (2026-08-17, defeats #11.)
  if (opts.pageMode === "none") {
    ir.pages = [];
    ir.nav = Array.isArray(ir.nav) ? [] : ir.nav && typeof ir.nav === "object" ? {} : ir.nav;
    if (ir.experience && typeof ir.experience === "object") { ir.experience.pages = []; ir.experience.nav = ir.experience.nav && !Array.isArray(ir.experience.nav) ? {} : []; }
    ir.__pageMode = "none";
  }

  // `list:` is the natural way to name a Select's options and is what agents write; the builders
  // read `referredList:`. The mismatch is SILENT and catastrophic: the field publishes with no
  // ReferredList, Kissflow binds it to an auto-created EMPTY list, and the field can never be set —
  // by the API or by a person. A required Select then makes the whole flow unusable, which is how
  // Work Order.Priority shipped dead on the facilities run (2026-08-02). Accept both spellings.
  for (const f of ir.forms || []) {
    for (const fld of f.fields || []) {
      if (!fld.referredList && fld.list) fld.referredList = fld.list;
    }
  }
  // DESIGN-SHAPE with data_model.flows — kf-data-architect writes the flow schema as an id-keyed
  // `data_model.flows` MAP (fields/items per flow), NOT a top-level forms[]. The per-flow lifts below
  // only handle roles/perms/pages/workflow; the FORMS themselves (fields, child tables, references,
  // computed) must be assembled by lower(), which merges architecture + data_model + workflow + security
  // → engine shape. Without this, buildApp/review/apply see forms=0 and build an app with NO flows
  // (health-payer full-pipeline, 2026-07-24). Engine-shape IRs that already have forms skip this entirely.
  if ((!Array.isArray(ir.forms) || !ir.forms.length) && ir.data_model && ir.data_model.flows && Object.keys(ir.data_model.flows).length) {
    const eng = lower(ir);
    ir.app = ir.app || eng.app;
    ir.forms = eng.forms;   // the one thing only lower() can assemble, and the reason we are here
    // Everything else FILLS A GAP — it never overwrites. This function's contract is to lift a slice
    // ONLY when the top-level one is absent, and these four assigned unconditionally: a hybrid IR
    // (data_model.flows for the schema, but a hand-written top-level permissions[]) had its
    // permissions replaced by lower()'s reading of a `security` slice that wasn't there — an empty
    // array, no validation error, and an app published where no role can touch any flow.
    const fill = (k, v) => { if (!Array.isArray(ir[k]) || !ir[k].length) ir[k] = v; };
    fill("roles", eng.roles); fill("lists", eng.lists); fill("permissions", eng.permissions);
    fill("automations", eng.automations); fill("childTables", eng.childTables);
    if (!Array.isArray(ir.pages) || !ir.pages.length) ir.pages = eng.pages;
    if (!ir.nav || !(ir.nav.menus || []).length) ir.nav = eng.nav;
    // …and then FALL THROUGH. `return ir` here skipped every lift below, including the experience
    // slice — which is where a design-shape spec keeps its pages and nav. health-payer designed 170
    // pages and 50 menus and normalizeIR handed back 0 and 0; ensureExperience then substituted 35
    // generic "<Role> Home" pages. No error: NO_PAGES is only a warning. The lifts below are written
    // to no-op when their target is already populated, so running them costs nothing and the pages
    // survive.
  }
  // WORKFLOW AS AN ARRAY — `workflow: [{flow, steps}, {flow, steps}]` is the natural way to write
  // "these two flows each have a workflow", and it is what the designer emits for a multi-process
  // app. Every consumer reads the SINGULAR shape: builders read `ir.workflow.steps` (+ `.flow`) and
  // per-flow `forms[].workflow.steps`. An array has neither, so it is not a partial read — it is a
  // total one. Field Service Dispatch (2026-08-13) shipped with Work Order's six steps and Parts
  // Request's three, including the Manager Approval its own decisions.md described, sitting in the
  // file and invisible to everything: two flows declared `Process` with no steps, `engine validate`
  // reporting 0 errors and 0 warnings, and an app with no workflow and no business logic.
  //
  // Lowered onto the flows themselves rather than collapsed into the single top-level slot, because
  // the array's whole point is that there is more than one. An entry naming a flow we cannot find is
  // left alone for validation to report rather than silently dropped.
  if (Array.isArray(ir.workflow)) {
    const byKey = new Map();
    for (const f of ir.forms || []) {
      for (const k of [f.id, f.name]) if (k) byKey.set(String(k).toLowerCase(), f);
    }
    const orphans = [];
    for (const wf of ir.workflow) {
      if (!wf || !Array.isArray(wf.steps) || !wf.steps.length) continue;
      const target = byKey.get(String(wf.flow ?? "").toLowerCase());
      if (!target) { orphans.push(wf); continue; }
      // never overwrite a workflow the flow already carries — this fills a gap, like every lift here
      if (!target.workflow || !(target.workflow.steps || []).length) target.workflow = { steps: wf.steps };
    }
    // One entry that matched nothing still has to reach a consumer; the singular slot is where a
    // one-workflow app puts it, and validation resolves `.flow` from there.
    ir.workflow = orphans.length === 1 ? orphans[0] : undefined;
  }

  // ROLES — lift architecture.roles → top-level roles[] if the architect left it in the design slice.
  if (!Array.isArray(ir.roles) || !ir.roles.length) {
    const ar = ir.architecture && ir.architecture.roles;
    if (Array.isArray(ar) && ar.length) ir.roles = ar.map((r) => ({ id: r.id, name: r.name }));
  }
  // PERMISSIONS — derive the flat top-level permissions[] from the security.roles design matrix
  // (role-id → { flows: { flow-id → { scope, steps } } }) when the security agent didn't emit it.
  // level = Editable if the role does anything beyond View/Hidden on the flow, else ReadOnly.
  if (!Array.isArray(ir.permissions) || !ir.permissions.length) {
    const sr = ir.security && ir.security.roles;
    if (sr && typeof sr === "object" && !Array.isArray(sr)) {
      const nameById = {};
      for (const r of ir.roles || []) if (r && r.id) nameById[r.id] = r.name || r.id;
      const perms = [];
      for (const [roleId, rdef] of Object.entries(sr)) {
        const role = nameById[roleId] || roleId;
        for (const [model, fdef] of Object.entries((rdef && rdef.flows) || {})) {
          const steps = (fdef && fdef.steps) || {};
          const acts = Object.values(steps).some((v) => !/^(view|hidden)$/i.test(String(v)));
          perms.push({ role, model, level: acts ? "Editable" : "ReadOnly", scope: (fdef && fdef.scope) || "all" });
        }
      }
      if (perms.length) ir.permissions = perms;
    }
  }
  // PAGES + NAV — lift the experience-designer's design slice (experience.{pages,nav,landing}) into the
  // engine's top-level pages[]/nav when absent. The build gates pages/nav by role NAME, but the design
  // slice references role IDs — convert id→name — and flags each role's landing page from experience.landing.
  if (ir.__pageMode !== "none" && (!Array.isArray(ir.pages) || !ir.pages.length) && ir.experience && typeof ir.experience === "object") {
    const ex = ir.experience;
    const nameById = {};
    for (const r of ir.roles || []) if (r && r.id) nameById[r.id] = r.name || r.id;
    const toName = (r) => nameById[r] || r;
    const landingNames = new Set(Object.values(ex.landing || {}));
    if (Array.isArray(ex.pages)) {
      // A designed page states its audience as `visibleTo[]` OR as a plain `role`, and marks itself a
      // landing either through experience.landing{} or with its own landing/dashboard flag. Reading
      // only the first spelling of each dropped both on health-payer: all 170 pages arrived with no
      // role, so ensureExperience saw 18 role-less roles and generated a synthetic "<Role> Home" for
      // every one — and since only those synthetic pages were flagged, each role's DefaultPage pointed
      // at a generated shell instead of the dashboard designed for it.
      ir.pages = ex.pages.map((p) => ({
        name: p.name,
        role: toName(p.role ?? (p.visibleTo || [])[0]),
        ...(landingNames.has(p.name) || p.landing || p.dashboard ? { landing: true } : {}),
        ...(p.dashboard ? { dashboard: true } : {}),
        ...(p.description ? { description: p.description } : {}),
        cards: p.cards || [],
      }));
    }
    if (ex.nav && Array.isArray(ex.nav.menus)) {
      ir.nav = { menus: ex.nav.menus.map((m) => ({
        name: m.name,
        submenus: (m.submenus || []).map((sub) => ({ name: sub.name, page: sub.page, visibleTo: (sub.visibleTo || []).map(toName) })),
      })) };
    }
  }
  // WORKFLOW — the workflow-designer often writes a top-level `workflow` design slice
  // ({ processes:{flowId:{steps}}, cases:{flowId:{statuses,transitions}} }) using role IDs and an
  // on_complete step-graph, instead of merging engine-shape onto forms[].workflow/caseflow. buildApp
  // reads forms[].workflow.steps (per process) + buildBoard reads forms[].caseflow — so merge it here.
  if (ir.workflow && typeof ir.workflow === "object" && (ir.workflow.processes || ir.workflow.cases)) {
    const nameById = {};
    for (const r of ir.roles || []) if (r && r.id) nameById[r.id] = r.name || r.id;
    const byId = {};
    for (const f of ir.forms || []) byId[f.id || f.name] = f;
    // processes → forms[].workflow.steps (order by the on_complete chain from the start step; id→name actor)
    for (const [fid, pdef] of Object.entries(ir.workflow.processes || {})) {
      const form = byId[fid];
      if (!form || (form.workflow && form.workflow.steps && form.workflow.steps.length)) continue;
      const raw = (pdef && pdef.steps) || [];
      const byStep = {}; for (const s of raw) byStep[s.id] = s;
      const start = raw.find((s) => /^start$/i.test(s.entry_condition || "")) || raw[0];
      const ordered = []; const seen = new Set(); let cur = start;
      while (cur && !seen.has(cur.id)) { seen.add(cur.id); ordered.push(cur); cur = cur.on_complete ? byStep[cur.on_complete] : null; }
      for (const s of raw) if (!seen.has(s.id)) ordered.push(s);
      // LOSSY LOWERING. This kept `name` and `actor` and threw the rest of the step away — so a
      // design-shape spec's parallel FORK arrived downstream as a bare name. Both consumers suffer:
      // the blueprint drew a straight line through a three-way fork (commercial-lending's
      // "Board Sign-off" appeared nowhere), and the Parallel builder below reads `s.branches`, which
      // by then no longer existed — so the built app got a linear flow too. Carry the shape through.
      const lowerStep = (s) => ({
        name: s.name,
        ...(s.assignee_role ? { actor: nameById[s.assignee_role] || s.assignee_role } : (s.actor ? { actor: s.actor } : {})),
        ...(Array.isArray(s.decision) && s.decision.length ? { decision: s.decision } : {}),
        ...(s.sla ? { sla: s.sla } : {}),
        ...(Array.isArray(s.branches) && s.branches.length
          ? { branches: s.branches.filter((b) => b && Array.isArray(b.steps)).map((b) => ({ name: b.name, steps: b.steps.map(lowerStep) })) }
          : {}),
      });
      if (ordered.length) form.workflow = { steps: ordered.map(lowerStep) };
    }
    // cases → forms[].caseflow { statuses, transitions } (id→name; category from is_initial/is_terminal)
    for (const [fid, cdef] of Object.entries(ir.workflow.cases || {})) {
      const form = byId[fid];
      if (!form || (form.caseflow && form.caseflow.statuses && form.caseflow.statuses.length)) continue;
      const sts = (cdef && cdef.statuses) || [];
      const nameOf = {}; for (const st of sts) nameOf[st.id] = st.name;
      const cat = (st) => st.is_initial ? "NotStarted" : st.is_terminal ? "Closed" : "InProgress";
      if (sts.length) {
        form.caseflow = {
          statuses: sts.map((st) => ({ name: st.name, category: cat(st) })),
          transitions: ((cdef && cdef.transitions) || []).map((t) => ({ from: nameOf[t.from] || t.from, to: nameOf[t.to] || t.to })),
        };
        if (!/^(case|board)$/i.test(form.flowType || "")) form.flowType = "Case";
      }
    }
  }
  return ir;
}

/** Orchestrate IR → artifacts in CANONICAL ORDER:
 *  roles → lists/masters → forms/flows (+ embedded child tables + workflow) → permissions → pages.
 *
 * `opts.pageMode` is the page policy, and it is NOT expressible by mutating the IR. Setting
 * `ir.pages = []` does not work: normalizeIR lifts `experience.pages` back into `ir.pages`
 * PRECISELY because it is empty (that lift is what a designed IR needs). So a custom-UI build that
 * cleared ir.pages still got native pages generated — the exact --no-pages defeat. `pageMode:"none"`
 * suppresses the lift and every page/nav artifact structurally; the default keeps normalize's
 * behaviour. (2026-08-17) */
export function buildApp(ir, opts = {}) {
  const pageMode = opts.pageMode || "authored";
  ir = normalizeIR(ir, { pageMode });
  const appId = ir.app?.id || `${slug(ir.app?.name || "App")}_A00`;
  const idmap = {};
  for (const l of ir.lists || ir.datasets || []) idmap[l.id || l.name] = l.id || `${slug(l.name)}_A00`;
  for (const f of ir.forms || []) idmap[f.id || f.name] = f.id || `${slug(f.name)}_A00`;
  const roleIds = {};
  for (const r of ir.roles || []) roleIds[r.name] = r.id || eid("Ro", r.name);
  // child relationships from BOTH the explicit ir.childTables array AND forms tagged `childOf`
  const childRels = [
    ...(ir.childTables || []).map((ct) => ({ parent: ct.parent, child: ct.child, field: ct.field })),
    ...(ir.forms || []).filter((f) => f.childOf).map((f) => ({ parent: f.childOf, child: f.id || f.name, field: f.tableLabel || f.name })),
  ];
  const childNames = new Set(childRels.map((c) => c.child));

  // NORMALIZE field types + WIRE UP unlinked Selects. An invalid/alias type (e.g. "YesNo") and a
  // Select with neither a list nor options both fail to publish. The Select's data source usually
  // exists (a list, or a master FORM) — it just wasn't wired. Link it by name (exact, else suffix
  // match to absorb prefixes), as a list (→ Select) or a master form (→ Reference). Never silently
  // drop a Select to Text.
  // canonical Kissflow field types via the shared alias resolver (util.mjs) — unknown types pass
  // through untouched (the validator warns on them).
  const nrm = (s) => String(s || "").toLowerCase().replace(/\bmaster\b|\(.*?\)|[^a-z0-9]/g, "");
  const listIdx = (ir.lists || []).map((l) => ({ name: l.name, n: nrm(l.name) }));
  const formIdx = (ir.forms || []).map((f) => ({ name: f.id || f.name, n: nrm(f.name) }));
  // match on the EXACT normalized name, or a SAFE prefix-absorption (a list "<qualifier> <field>" whose
  // normalized name ends with the field token AND the token is MOST of that name). The old bare `endsWith`
  // let a short generic field ("Type", "Category") grab an unrelated longer list ("Product Type").
  const matchBy = (idx, t) => t.length > 3 && (idx.find((x) => x.n === t) || idx.find((x) => x.n.endsWith(t) && t.length >= x.n.length * 0.7))?.name;
  // ensure a real lists array before the Select auto-wiring may .some()/.push() a backing list — a
  // forms-only IR (no top-level `lists`) otherwise threw `Cannot read properties of undefined`, aborting
  // the WHOLE apply. Point at `datasets` when that's the source so nothing gets dropped downstream.
  if (!Array.isArray(ir.lists)) ir.lists = Array.isArray(ir.datasets) ? ir.datasets : [];
  for (const f of ir.forms || []) for (const fld of f.fields || []) {
    { const ct = canonicalFieldType(fld.type); if (ct) fld.type = ct; }
    if ((fld.type === "Select" || fld.type === "Multiselect") && (!fld.referredList || !idmap[fld.referredList])) {
      const opts = fld.options || fld.possibleValues || fld.PossibleValues;
      // A field with its OWN inline option set is NOT a reference to a shared master — never fuzzy-match it
      // to an existing list/form (that wrongly put "Type"[Corporate/SME/…] onto the "Product Type" list).
      // Give it its own backing list built from those options.
      const hasOwnOptions = Array.isArray(opts) && opts.length > 0;
      const t = nrm(fld.name);
      const li = hasOwnOptions ? null : matchBy(listIdx, t);
      if (li) fld.referredList = li;                                   // wire to its list
      else {
        const fo = hasOwnOptions ? null : matchBy(formIdx, t);
        if (fo) { fld.type = "Reference"; fld.ref = fo; delete fld.referredList; } // or its master form
        else {
          // No existing source — CREATE a dedicated backing list so it stays a valid dropdown (never
          // silently degrade a Select to Text). APP-SCOPE the id: a generic name like "Category" was once
          // reused ONTO a same-named flow in a DIFFERENT app by the account-wide explore. And when the
          // field carries its OWN options, FORM-scope it too — two "Type" fields with different option sets
          // must not share one list (else the first field's options overwrite the second's).
          const appTag = appId.replace(/_A00$/, "");
          const blId = hasOwnOptions
            ? `${appTag}_${slug(f.id || f.name)}_${slug(fld.name)}_A00`
            : `${appTag}_${slug(fld.name)}_A00`;
          const blName = hasOwnOptions ? `${f.name} ${fld.name}` : fld.name;
          if (!ir.lists.some((l) => (l.id || l.name) === blId)) {
            ir.lists.push({ id: blId, name: blName, items: opts || [] });
            listIdx.push({ name: blId, n: nrm(blName) });
            idmap[blId] = blId;
          }
          fld.referredList = blId;
        }
      }
    }
  }

  // DEFAULT REFERENCE LOOKUPS — a Reference field with no `lookup` produces an empty
  // QueryDefinition.LookupField → QueryDefinitionValidationException on publish. Default it to
  // the target form's first displayable field (the column the reference shows).
  const formByName = {};
  for (const f of ir.forms || []) formByName[f.id || f.name] = f;
  for (const f of ir.forms || []) for (const fld of f.fields || []) {
    const isUser = (fld.type || "").startsWith("User") || fld.type === "MultiUser";
    if (REF_TYPES.has(fld.type) && !isUser && fld.ref && (!fld.lookup || !fld.lookup.length)) {
      const tf = (formByName[fld.ref]?.fields || []).find((x) => !["SequenceNumber", "Table", "Attachment", "Image"].includes(x.type));
      if (tf) fld.lookup = [{ id: tf.id || slug(tf.name), name: tf.name, type: ["Email", "Number"].includes(tf.type) ? tf.type : "Text" }];
    }
  }

  // target flow types for reference QDs (both logical names and generated ids), R15:
  // a QD's FlowType must match the target flow's real type or references break at runtime
  const flowTypes = {};
  for (const f of ir.forms || []) {
    const ft = /^(board|case)$/i.test(f.flowType || "") || (Array.isArray(f.statuses) && f.statuses.length) ? "Case"
      : /^process$/i.test(f.flowType || "") ? "Process" : "Form";
    flowTypes[f.id || f.name] = ft;
    flowTypes[idmap[f.id || f.name]] = ft;
  }

  const artifacts = [];
  for (const r of ir.roles || []) artifacts.push(buildRole(r, appId));                 // 1. roles
  for (const l of ir.lists || ir.datasets || []) artifacts.push(buildList(l, appId));   // 2. masters/lists
  const formArtifacts = {};                                                            // 3. flows
  for (const f of ir.forms || []) {
    if (childNames.has(f.id || f.name)) continue; // child forms are embedded, not standalone
    // BOARD (Case) when the spec asks for an unstructured workflow — flowType Board/Case, or it declares
    // board statuses. Everything else is a Form/Process. buildBoard also emits a separate caseflow artifact.
    const isBoard = /^(board|case)$/i.test(f.flowType || "") || (Array.isArray(f.statuses) && f.statuses.length);
    const a = isBoard ? buildBoard(f, appId, idmap, flowTypes) : buildForm(f, appId, idmap, flowTypes);
    formArtifacts[f.id || f.name] = a;
    artifacts.push(a);
    if (a.caseflow) artifacts.push(a.caseflow); // caseflow (statuses/states) published after its model
  }
  // parent lookup: childOf commonly carries the PARENT's display NAME, but formArtifacts is keyed
  // by id (when the form declares one) — resolve ct.parent by id OR name so childOf:"Loan Drawdown"
  // finds the parent form whose id is "fr-48-loan-drawdown" (live-verified maritime-fleet build
  // 2026-07-21: every childOf table silently failed to embed — parents shipped with ZERO child rows).
  const parentByName = {};
  for (const f of ir.forms || []) { const key = f.id || f.name; if (formArtifacts[key]) { parentByName[f.name] = key; if (f.id) parentByName[f.id] = key; } }
  for (const ct of childRels) {                  // embed child tables into their parents
    const parentKey = formArtifacts[ct.parent] ? ct.parent : parentByName[ct.parent];
    const parent = formArtifacts[parentKey];
    const childSpec = (ir.forms || []).find((f) => (f.id || f.name) === ct.child);
    if (parent && childSpec) addChildTable(parent, childSpec, ct.field, idmap, flowTypes);
  }
  // per-form workflows: a Process form may carry its own `workflow:{steps}` (in addition to a
  // single top-level ir.workflow). Build each into its process flow.
  for (const f of ir.forms || []) {
    if (f.workflow && f.workflow.steps && formArtifacts[f.id || f.name]) addWorkflow(formArtifacts[f.id || f.name], f.workflow.steps, roleIds);
  }
  if (ir.workflow) {                              // single top-level workflow into its process flow
    const parent = formArtifacts[ir.workflow.flow];
    if (parent) addWorkflow(parent, ir.workflow.steps, roleIds);
  }
  for (const perm of ir.permissions || []) artifacts.push(buildPermission(perm, ir, idmap, roleIds)); // 4. permissions
  const flowInfo = {};                                                                  // id AND name → {genId, flowType} for page data-binding
  for (const f of ir.forms || []) {
    const info = { genId: f.id || `${slug(f.name)}_A00`, flowType: f.flowType || "Form", fields: Object.fromEntries((f.fields || []).map((fl) => [slug(fl.name).toLowerCase(), fl.id || slug(fl.name)])) };
    if (f.id) flowInfo[f.id] = info;                                                    // source_flow may reference a flow by id …
    if (f.name) flowInfo[f.name] = info;                                                // … or by name — resolve either (baseline uses names)
  }
  for (const p of ir.pages || []) artifacts.push(buildPage(p, appId, flowInfo));        // 5. pages (data-bound queues)
  for (const a of ir.automations || []) {                                               // 6. flow-stitch automations (integrations)
    if ((a.channel || "internal") === "external") continue;                             // external stitches are flagged, not authored
    artifacts.push(buildAutomation(a, appId));
  }
  // POST-PASS: aggregate QDs need an AggregateField even for Count, but at field-build time the
  // aggregated model may live in ANOTHER flow's artifact (a CROSS-FLOW Count) or not be grafted yet.
  // Index the first field of every model across ALL artifacts so a cross-flow Count resolves too — a
  // per-artifact search missed it (the target model isn't in the aggregating flow's blob) → publish 500.
  const firstFieldByModel = {};
  for (const a of artifacts) { if (!a.blob) continue; for (const v of Object.values(a.blob)) if (v && v.Kind === "Field" && v.Model && !firstFieldByModel[v.Model]) firstFieldByModel[v.Model] = v.Id; }
  for (const a of artifacts) {
    if (!a.blob) continue;
    for (const v of Object.values(a.blob)) {
      if (v && v.Kind === "QueryDefinition" && v.AggregateType && !v.AggregateField && firstFieldByModel[v.LHSModel]) v.AggregateField = firstFieldByModel[v.LHSModel];
      if (v && v.LHSModelApplicationId === "__APP__") v.LHSModelApplicationId = appId; // cross-flow aggregates bind to this app
    }
  }
  return { appId, artifacts, idmap, roleIds };
}
