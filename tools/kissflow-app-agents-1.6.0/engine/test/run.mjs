// Test suite. Three kinds:
//  1. GOLDEN — load REAL app exports and assert our validators accept them
//     (real published apps must be structurally sound; warnings are findings).
//  2. BUILDER FIDELITY — build from IR and assert the output is structurally valid
//     and shaped like the real exports.
//  3. NEGATIVE — broken IR / blobs must be caught by the validators.
//
// Plain node, zero deps:  node test/run.mjs

import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { loadApp, allBlobs } from "../loader.mjs";
import { validateBlob, checkStructural, checkFields, checkCaseflow, errors, warnings } from "../validators.mjs";
import { buildForm, buildList, buildRole, buildApp, buildAutomation, buildBoard, buildKanbanPage, normalizeIR } from "../builders.mjs";
import { flowGrant } from "../client.mjs";
import { fmType, resolveSkeleton, buildIntegrationDraft, buildIntegrationDraftFull, connectionsFromExport, provisionSystemConnection, ensureConnections, resolveEntityFields, applyIntegrationResolved } from "../integrations.mjs";
import { index, entities } from "../graph.mjs";
import { validateIR } from "../ir.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const KF = join(__dirname, "../../.."); // → kf-framework
// golden exports live in golden-references/ (repo root fallback for older checkouts)
const APPS = ["ITAM", "KFSustainabilityApp", "ProfServAppMetadata"]
  .map((n) => [n, [join(KF, "golden-references", n), join(KF, n)].find(existsSync)]).filter(([, p]) => p);

let pass = 0, fail = 0;
const ok = (name, cond, detail = "") => { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}${detail ? "  — " + detail : ""}`); } };
const section = (s) => console.log(`\n### ${s}`);

// ---------------- 1. GOLDEN: real exports validate ----------------
section("GOLDEN — real app exports load & pass structural validation");
if (!APPS.length) console.log("  (no app exports found under kf-framework — skipping golden tests)");
for (const [name, root] of APPS) {
  let app, blobs;
  try { app = loadApp(root); blobs = allBlobs(app); }
  catch (e) { ok(`${name}: loads`, false, e.message); continue; }
  ok(`${name}: loads (${blobs.length} blobs; ${app.forms.length} forms, ${app.cases.length} cases, ${app.pages.length} pages, ${app.lists.length} lists)`, blobs.length > 0);

  let structErrors = 0, caseflowFindings = 0;
  const errSamples = [];
  for (const b of blobs) {
    const es = errors(checkStructural(b.blob, b.label));
    structErrors += es.length;
    if (es.length && errSamples.length < 3) errSamples.push(es[0].msg);
    if (b.label.includes("caseflow")) caseflowFindings += warnings(checkCaseflow(b.blob, b.label)).length;
  }
  ok(`${name}: ZERO structural errors across all blobs`, structErrors === 0, structErrors ? `${structErrors} errors e.g. ${errSamples.join("; ")}` : "");
  // field checks across forms (errors only; warnings = catalog gaps, informational)
  let fieldErrors = 0;
  for (const f of app.forms) if (f.blob) fieldErrors += errors(checkFields(f.blob, f.id)).length;
  ok(`${name}: ZERO field errors across forms`, fieldErrors === 0, fieldErrors ? `${fieldErrors}` : "");
  if (caseflowFindings) console.log(`    (note: ${caseflowFindings} caseflow behavioral warnings — real-app findings, not test failures)`);
}

// ---------------- 2. BUILDER FIDELITY ----------------
section("BUILDER FIDELITY — IR → blob is valid & shaped like real exports");
const formSpec = {
  name: "Customer", section: "Customer Info",
  fields: [
    { name: "Customer Name", type: "Text", required: true },
    { name: "Email", type: "Email" },
    { name: "Annual Spend", type: "Currency", currency: "USD" },
    { name: "Region", type: "Reference", ref: "Region_A00", lookup: [{ name: "Region Name", type: "Text" }] },
    { name: "Full Label", type: "Text", formula: "Customer_Name" },
  ],
};
const built = buildForm(formSpec, "Demo_App_A00");
const bErr = errors(checkStructural(built.blob, "built:Customer")).concat(errors(checkFields(built.blob, "built:Customer")));
ok("built form has zero structural/field errors", bErr.length === 0, bErr.map((e) => e.msg).join("; "));
const idx = index(built.blob);
ok("built form Root resolves to a Model", idx.get(built.blob.Root)?.Kind === "Model");
ok("Model::Field lists all 5 fields", idx.get(built.id)["Model::Field"].length === 5);
ok("reference field carries a QueryDefinition", !!built.blob["Region"]?.["Field::QueryDefinition"]);
ok("computed field compiles to an Expression with a non-empty Node AST (never empty-node)", (() => { const ex = built.blob["Full_Label"]?.["Field::Expression"] && built.blob[built.blob["Full_Label"]["Field::Expression"][0]]; return !!ex && ex["Expression::Node"].length > 0 && built.blob[ex["Expression::Node"][0]].Kind === "Node"; })());
ok("Currency field carries CurrencyTypes", JSON.stringify(built.blob["Annual_Spend"]?.CurrencyTypes) === JSON.stringify(["USD"]));
// shape parity vs a real form field (same core keys)
if (APPS.length) {
  const realApp = loadApp(APPS[0][1]);
  const realForm = realApp.forms.find((f) => f.blob);
  if (realForm) {
    const realField = entities(realForm.blob).find((e) => e.Kind === "Field" && !e.Id.startsWith("_"));
    const builtField = built.blob["Customer_Name"];
    const coreKeys = ["Id", "Kind", "Type", "Name", "Model", "Column"];
    ok("built Field has the same core keys as a real Field", coreKeys.every((k) => k in builtField) && coreKeys.every((k) => k in realField));
  }
}
// determinism
const built2 = buildForm(formSpec, "Demo_App_A00");
ok("builder is deterministic (same IR → same blob)", JSON.stringify(built.blob) === JSON.stringify(built2.blob));
// list + role
ok("buildList emits ListItems", JSON.stringify(buildList({ name: "Region", items: ["APAC", "EMEA"] }, "Demo_App_A00").doc.ListItems) === JSON.stringify(["APAC", "EMEA"]));
ok("buildRole emits a role doc", buildRole({ name: "Manager" }, "Demo_App_A00").doc.Name === "Manager");

// ---------------- 3. NEGATIVE — broken IR/blobs are caught ----------------
section("NEGATIVE — invalid IR & blobs are rejected");
const has = (res, code) => res.issues.some((i) => i.code === code);
ok("IR: reference field with no target → REF_NO_TARGET", has(validateIR({ app: { name: "X" }, forms: [{ name: "F", fields: [{ name: "R", type: "Reference" }] }] }), "REF_NO_TARGET"));
ok("IR: reference to missing model → REF_TARGET_MISSING", has(validateIR({ app: { name: "X" }, forms: [{ name: "F", fields: [{ name: "R", type: "Reference", ref: "Nope" }] }] }), "REF_TARGET_MISSING"));
ok("IR: missing app.name → NO_APP_NAME", has(validateIR({ forms: [] }), "NO_APP_NAME"));
ok("IR: permission to undefined role → PERM_ROLE_MISSING", has(validateIR({ app: { name: "X" }, permissions: [{ role: "Ghost", model: "F" }] }), "PERM_ROLE_MISSING"));
ok("IR: a valid IR passes", validateIR({ app: { name: "X" }, roles: [{ name: "Admin" }], lists: [{ name: "Region", items: ["A"] }], forms: [{ name: "F", fields: [{ name: "Region", type: "Reference", ref: "F" }] }] }).ok);
// blob negatives
const dangling = { Root: "M", M: { Id: "M", Kind: "Model", "Model::Field": ["GHOST"] } };
ok("blob: dangling ref → DANGLING_REF", checkStructural(dangling).some((i) => i.code === "DANGLING_REF"));
const sysauth = { Root: "M", M: { Id: "M", Kind: "Model", "Model::Field": ["_id"] }, _id: { Id: "_id", Kind: "Field", Type: "Text", Name: "ID" } };
ok("blob: authored system field → SYSTEM_FIELD_AUTHORED", checkFields(sysauth).some((i) => i.code === "SYSTEM_FIELD_AUTHORED"));
const badflow = { Root: "F", F: { Id: "F", Kind: "CaseFlow", "CaseFlow::Status": ["A", "B"] },
  A: { Id: "A", Kind: "Status", Category: "NotStarted", OutwardStatus: [] },
  B: { Id: "B", Kind: "Status", Category: "InProgress", OutwardStatus: [] } };
ok("caseflow: unreachable status + no terminal → flagged", checkCaseflow(badflow).some((i) => i.code === "UNREACHABLE_STATUS" || i.code === "NO_TERMINAL_STATUS"));

// ---------------- 4. BUILDERS: workflow / child table / permissions ----------------
section("BUILDERS — workflow, child table & permissions (the PO app)");
const poIR = JSON.parse(readFileSync(join(__dirname, "../examples/purchase-order.ir.json"), "utf8"));
const poV = validateIR(poIR);
ok("PO IR validates (0 errors)", poV.ok, poV.issues.filter((i) => i.level === "error").map((i) => i.code).join(", "));
const { artifacts: poArts } = buildApp(poIR);
const po = poArts.find((a) => a.id === "Purchase_Order_A00").blob;
const poKinds = new Set(entities(po).map((e) => e.Kind));
ok("PO process blob has zero structural/field errors", errors(checkStructural(po, "po")).concat(errors(checkFields(po, "po"))).length === 0);
// workflow
ok("workflow: ProcessDef + Activities present", poKinds.has("ProcessDef") && poKinds.has("Activity"));
const pd = entities(po).find((e) => e.Kind === "ProcessDef");
ok("workflow: 4 activities, Start→…→End", pd["ProcessDef::Activity"].length === 4 && po[pd["ProcessDef::Activity"][0]].NodeType === "StartEvent" && po[pd["ProcessDef::Activity"][3]].NodeType === "EndEvent");
const mgrAct = entities(po).find((e) => e.Kind === "Activity" && e.Name === "Manager Approval");
ok("workflow: UserTask carries an AppRole resource", po[mgrAct["Activity::Resource"][0]].ValueType === "AppRole" && po[mgrAct["Activity::Resource"][0]].DisplayValue === "Approving Manager");
ok("workflow: every step has Activity::Permission (per-field) + Appearance/Style + Button::Row", entities(po).every((a) => a.Kind !== "Activity" || a.NodeType === "SendBackToInitiator" || (a["Activity::Permission"] || []).length > 0) && poKinds.has("Appearance") && po[po.Root]["Button::Row"]);
// per-step field_permissions overrides (mid-flow edits / Hidden / Mandatory)
const fpIR = { app: { name: "FP" }, roles: [{ name: "Requester" }, { name: "Manager" }],
  forms: [{ name: "Claim", flowType: "Process",
    fields: [{ name: "Amount", type: "Number" }, { name: "Approver Comments", type: "Text" }, { name: "Notes", type: "Text" }],
    workflow: { steps: [
      { name: "Submit", actor: "Requester" },
      { name: "Manager Approval", actor: "Manager", field_permissions: { "Amount": "Editable", "Approver Comments": "Mandatory", "Notes": "Hidden" } },
      { name: "Done" }] } }] };
const fpV = validateIR(fpIR);
ok("IR: workflow with field_permissions validates (0 errors)", fpV.ok, fpV.issues.filter((i) => i.level === "error").map((i) => i.code).join(", "));
const fp = buildApp(fpIR).artifacts.find((a) => a.id === "Claim_A00").blob;
const fpPermAt = (actName, fieldName) => {
  const act = entities(fp).find((e) => e.Kind === "Activity" && e.Name === actName);
  const col = entities(fp).find((e) => e.Kind === "Field" && e.Name === fieldName).Column;
  return fp[(act["Activity::Permission"] || []).find((p) => fp[p].Column === col)].Permission;
};
ok("field_permissions: mid-flow Editable override applied", fpPermAt("Manager Approval", "Amount") === "Editable");
ok("field_permissions: Mandatory + Hidden overrides applied", fpPermAt("Manager Approval", "Approver Comments") === "Mandatory" && fpPermAt("Manager Approval", "Notes") === "Hidden");
ok("field_permissions: non-overridden field keeps step default (ReadOnly mid-flow, Editable at Start)", fpPermAt("Done", "Amount") === "ReadOnly" && fpPermAt("Submit", "Amount") === "Editable");
// SequenceNumber sub-config — Padding + MANDATORY PrefixExpression chain (a field with Padding
// alone is half-built: loads, but the sequence editor chokes; vs working Application_Number export)
const sqIR = { app: { name: "SQ" }, roles: [],
  forms: [{ name: "Milestone", fields: [
    { name: "Milestone Def ID", type: "SequenceNumber", prefix: "MSTN - " },
    { name: "Auto Ref", type: "SequenceNumber" },
    { name: "Title", type: "Text" }] }] };
const sq = buildApp(sqIR).artifacts.find((a) => a.id === "Milestone_A00").blob;
const sqChain = (fieldName) => {
  const fld = entities(sq).find((e) => e.Kind === "Field" && e.Name === fieldName);
  const props = (fld["Field::Property"] || []).map((id) => sq[id]);
  const pad = props.find((p) => p.Name === "Padding"), pfx = props.find((p) => p.Name === "PrefixExpression");
  const ex = pfx && sq[(pfx["Property::Expression"] || [])[0]];
  const nd = ex && sq[(ex["Expression::Node"] || [])[0]];
  return { props, pad, pfx, ex, nd };
};
const sq1 = sqChain("Milestone Def ID");
ok("SequenceNumber: carries BOTH Padding and PrefixExpression properties", sq1.props.length === 2 && !!sq1.pad && !!sq1.pfx && sq1.pfx.ValueType === "Expression");
ok("SequenceNumber: prefix chain Property→Expression→Node(Static) complete", !!sq1.ex && sq1.nd?.Type === "Static" && sq1.nd?.DataType === "String");
ok("SequenceNumber: ExpressionStr is the QUOTED literal, Node.Value the raw string, in sync", sq1.ex?.ExpressionStr === JSON.stringify("MSTN - ") && sq1.nd?.Value === "MSTN - ");
const sq2 = sqChain("Auto Ref");
ok("SequenceNumber: default prefix derives from the flow name (MIL - )", sq2.nd?.Value === "MIL - " && sq2.ex?.ExpressionStr === JSON.stringify("MIL - "));
// SECTION-level step permissions (golden: Permission{Column:<Section col>} in Disclosure_Reports) —
// a section override emits the Section column's own Permission and cascades to member fields
const secIR = { app: { name: "SP" }, roles: [{ name: "Requester" }, { name: "Manager" }],
  forms: [{ name: "Claim", flowType: "Process",
    fields: [{ name: "Amount", type: "Number", section: "Financials" }, { name: "Reason", type: "Text", section: "Financials" }, { name: "Summary", type: "Text" }],
    workflow: { steps: [
      { name: "Submit", actor: "Requester" },
      { name: "Approve", actor: "Manager", field_permissions: { "Financials": "Hidden", "Amount": "ReadOnly" } },
      { name: "Done" }] } }] };
const secV = validateIR(secIR);
ok("IR: SECTION key in field_permissions validates (0 errors)", secV.ok, secV.issues.filter((i) => i.level === "error").map((i) => i.code).join(", "));
const sp = buildApp(secIR).artifacts.find((a) => a.id === "Claim_A00").blob;
const spAct = entities(sp).find((e) => e.Kind === "Activity" && e.Name === "Approve");
const spPermOf = (col) => { const p = (spAct["Activity::Permission"] || []).map((id) => sp[id]).find((x) => x.Column === col); return p && p.Permission; };
const spSecCol = entities(sp).find((e) => e.Kind === "Column" && e.Type === "Section" && e.Name === "Financials");
const spFieldCol = (n) => entities(sp).find((e) => e.Kind === "Field" && e.Name === n).Column;
ok("section permission: the Section column gets its OWN Permission entry", !!spSecCol && spPermOf(spSecCol.Id) === "Hidden");
ok("section permission: cascades to member fields", spPermOf(spFieldCol("Reason")) === "Hidden");
ok("section permission: an explicit field override WINS over its section", spPermOf(spFieldCol("Amount")) === "ReadOnly");
ok("section permission: fields outside the section keep the step default", spPermOf(spFieldCol("Summary")) === "ReadOnly");
ok("IR: bad permission level → STEP_PERM_LEVEL_BAD", has(validateIR({ ...fpIR, forms: [{ ...fpIR.forms[0], workflow: { steps: [{ name: "S", field_permissions: { Amount: "Writable" } }] } }] }), "STEP_PERM_LEVEL_BAD"));
ok("IR: unknown field in overrides → STEP_PERM_FIELD_MISSING", has(validateIR({ ...fpIR, forms: [{ ...fpIR.forms[0], workflow: { steps: [{ name: "S", field_permissions: { Ghost: "Editable" } }] } }] }), "STEP_PERM_FIELD_MISSING"));
ok("IR: unknown step actor → STEP_ACTOR_MISSING (warn)", has(validateIR({ ...fpIR, forms: [{ ...fpIR.forms[0], workflow: { steps: [{ name: "S", actor: "Ghost" }] } }] }), "STEP_ACTOR_MISSING"));
// reference QD FlowType must be the TARGET's real flow type (R15) — real exports carry Form|Process|Case|User
const ftIR = { app: { name: "FT" }, roles: [],
  forms: [
    { name: "Claim", flowType: "Process", fields: [{ name: "Amount", type: "Number" }] },
    { name: "Ticket", flowType: "Board", statuses: [{ name: "Open" }, { name: "Closed", category: "Completed" }], fields: [{ name: "Title", type: "Text" }] },
    { name: "Audit", flowType: "Form", fields: [
      { name: "Claim Ref", type: "Reference", ref: "Claim", lookup: [{ name: "Amount", type: "Number" }] },
      { name: "Ticket Ref", type: "Reference", ref: "Ticket", lookup: [{ name: "Title" }] },
      { name: "Self Ref", type: "Reference", ref: "Audit", lookup: [{ name: "Claim Ref" }] }] }] };
const ftBlob = buildApp(ftIR).artifacts.find((a) => a.id === "Audit_A00").blob;
const qdOf = (fieldName) => { const f = entities(ftBlob).find((e) => e.Kind === "Field" && e.Name === fieldName); return ftBlob[f["Field::QueryDefinition"][0]]; };
ok("QD FlowType: Process target → Process", qdOf("Claim Ref").FlowType === "Process" && qdOf("Claim Ref").LHSModel === "Claim_A00");
ok("QD FlowType: Board target → Case", qdOf("Ticket Ref").FlowType === "Case");
ok("QD FlowType: Form target → Form", qdOf("Self Ref").FlowType === "Form");
// child table — SDK shape: Column(Type=Model) → nested Model (not a Table field)
const ctCol = entities(po).find((e) => e.Kind === "Column" && e.Type === "Model");
const cm = po[ctCol["Column::Model"][0]];
ok("child table: Column(Type=Model) → nested Model (no Table field)", cm.Kind === "Model" && !entities(po).some((e) => e.Kind === "Field" && e.Type === "Table"));
ok("child table: child model has its 5 line fields incl. Line Total", cm["Model::Field"].length === 5 && cm["Model::Field"].map((f) => po[f].Name).includes("Line Total"));
ok("child table: line-item reference resolves to Item Catalog", (() => { const item = po[cm["Model::Field"].find((f) => po[f].Name === "Item")]; return po[item["Field::QueryDefinition"][0]].LHSModel === "Item_Catalog_A00"; })());
// computed AST — Line Total = Quantity * Unit_Price compiles to a Function node
const lineTotal = po[cm["Model::Field"].find((f) => po[f].Name === "Line Total")];
const ltExpr = lineTotal["Field::Expression"] && po[lineTotal["Field::Expression"][0]];
ok("computed: Line Total compiled to a Function(*) AST with 2 Field operands", !!ltExpr && (() => { const fn = po[ltExpr["Expression::Node"][0]]; return fn.Type === "Function" && fn.Value === "*" && fn.Syntax === "Infix" && fn["Node::Node"].every((n) => po[n].Type === "Field"); })());
// permissions
const perms = poArts.filter((a) => a.type === "permission");
ok("permissions: one artifact per IR permission", perms.length === poIR.permissions.length);
const mgrPerm = perms.find((p) => p.blob[p.id].RoleName === "Approving Manager");
ok("permission: role + model + data-scope + per-field Permission{Column,Permission}", mgrPerm.blob[mgrPerm.id].Scope === "my-team" && mgrPerm.blob[mgrPerm.id]["FlowPermission::Permission"].length > 0);
ok("buildApp is deterministic (same IR → same artifacts)", JSON.stringify(buildApp(poIR).artifacts) === JSON.stringify(poArts));

// ---------------- 5. FORMULAS: full arithmetic compiler ----------------
section("FORMULAS — multi-term, precedence, parens, name resolution");
const fxRoot = (blob, fid) => { const ex = blob[fid]?.["Field::Expression"]; const e = ex && blob[ex[0]]; return e && blob[e["Expression::Node"][0]]; };
const fxFns = (blob) => Object.values(blob).filter((n) => n && n.Type === "Function").length;
const fxForm = (formula) => buildForm({ name: "Calc", section: "S", fields: [
  { name: "A", type: "Number" }, { name: "B", type: "Number" }, { name: "C", type: "Number" }, { name: "Result", type: "Number", formula },
] }, "Demo_App_A00").blob;
const fm1 = fxForm("A + B + C");
ok("formula: multi-term A+B+C → 2 nested Function nodes", fxFns(fm1) === 2 && fxRoot(fm1, "Result")?.Type === "Function");
const fm2 = fxForm("(A - B) / C");
const fr2 = fxRoot(fm2, "Result");
ok("formula: parens+precedence (A-B)/C → root '/' over a '-'", fr2?.Value === "/" && fm2[fr2["Node::Node"][0]].Value === "-");
const fm3 = fxForm("A * B / 100");
ok("formula: percentage A*B/100 → carries a Static '100' node", Object.values(fm3).some((n) => n && n.Type === "Static" && n.Value === "100"));
const fm4 = buildForm({ name: "Calc2", section: "S", fields: [
  { name: "Unit Price", type: "Currency" }, { name: "Qty", type: "Number" }, { name: "Line", type: "Currency", formula: "Unit_Price * Qty" },
] }, "Demo_App_A00").blob;
const fr4 = fxRoot(fm4, "Line");
ok("formula: operands resolve by field name", fr4?.Type === "Function" && fr4["Node::Node"].every((n) => fm4[n].Type === "Field"));
const fm5 = fxForm("A + nonexistent_field");
ok("formula: unresolved operand → degrades cleanly (no Expression)", !fm5["Result"]?.["Field::Expression"]);
const fm6 = fxForm("ROUND(A * B, 2)");
const fr6 = fxRoot(fm6, "Result");
ok("formula: named function ROUND(A*B,2) → Function 'ROUND' with 2 args", fr6?.Type === "Function" && fr6.Value === "ROUND" && fr6["Node::Node"].length === 2);
const fm7 = fxForm("IF(A > B, A, B)");
const fr7 = fxRoot(fm7, "Result");
ok("formula: IF(A>B,A,B) → Function 'IF' (Category Logical), 3 args, condition '>'", fr7?.Value === "IF" && fr7.Category === "Logical" && fr7["Node::Node"].length === 3 && fm7[fr7["Node::Node"][0]].Value === ">");
const fm8 = fxForm("(A + B) * C");
const fr8 = fxRoot(fm8, "Result");
ok("formula: parenthesised sub-expression carries IsParenthesised", fr8?.Value === "*" && fm8[fr8["Node::Node"][0]].IsParenthesised === true);

// ---------------- 6. CHILD TABLES: sibling field-name collision ----------------
section("CHILD TABLES — sibling same-named fields get distinct ids (no orphan QD)");
const collIR = { app: { name: "Coll App" }, forms: [
  { name: "Vendor", fields: [{ name: "Code", type: "Text" }] },
  { name: "Parent", flowType: "Process", fields: [{ name: "Title", type: "Text" }] },
  { name: "Tbl A", childOf: "Parent", fields: [{ name: "Vendor ID", type: "Reference", ref: "Vendor" }, { name: "Amount", type: "Currency" }] },
  { name: "Tbl B", childOf: "Parent", fields: [{ name: "Vendor ID", type: "Reference", ref: "Vendor" }, { name: "Amount", type: "Currency" }] },
] };
const collParent = buildApp(collIR).artifacts.find((a) => a.id === "Parent_A00");
const vIdFields = Object.values(collParent.blob).filter((e) => e && e.Kind === "Field" && e.Name === "Vendor ID");
ok("child tables: two 'Vendor ID' columns get DISTINCT field ids", vIdFields.length === 2 && vIdFields[0].Id !== vIdFields[1].Id);
const collOrphans = Object.values(collParent.blob).filter((e) => e && e.Kind === "QueryDefinition" && !Object.values(collParent.blob).some((f) => f && f.Kind === "Field" && (f["Field::QueryDefinition"] || []).includes(e.Id)));
ok("child tables: collision leaves NO orphaned QueryDefinition", collOrphans.length === 0);

// ---------------- 7. AGGREGATE & RICH LOOKUP — derived fields ----------------
section("AGGREGATE & RICH LOOKUP — derived fields");
const aggIR = { app: { name: "Agg App" }, forms: [
  { name: "Order", flowType: "Process", fields: [
    { name: "Title", type: "Text" },
    { name: "Line Total", type: "Currency", aggregate: { fn: "SUM", over: "Order Lines", field: "Amount" } },
    { name: "Line Count", type: "Number", aggregate: { fn: "COUNT", over: "Order Lines" } },
  ] },
  { name: "Order Lines", childOf: "Order", fields: [{ name: "Amount", type: "Currency" }] },
] };
const orderBlob = buildApp(aggIR).artifacts.find((a) => a.id === "Order_A00").blob;
const aggLineTotal = Object.values(orderBlob).find((e) => e && e.Kind === "Field" && e.Name === "Line Total");
const aggDef = aggLineTotal && orderBlob[(aggLineTotal["Field::QueryDefinition"] || [])[0]];
ok("aggregate: SUM → AggregateDefinition {Type,Field,LHSModel=child} + Widget 'Aggregation'",
  !!aggDef && aggDef.AggregateType === "Sum" && aggDef.AggregateField === "Amount" && aggDef.LHSModel === "Order_Lines_A00" && aggLineTotal.Widget === "Aggregation");
const aggLineCount = Object.values(orderBlob).find((e) => e && e.Kind === "Field" && e.Name === "Line Count");
const cntDef = aggLineCount && orderBlob[(aggLineCount["Field::QueryDefinition"] || [])[0]];
// live-publish verified (npd-plm 2026-07-03): Count STILL needs AggregateField (defaults to the
// child's first field) + LHSRootModel (parent model) + FlowType of the PARENT — else publish 500s.
ok("aggregate: COUNT → AggregateType Count + defaulted AggregateField + LHSRootModel",
  !!cntDef && cntDef.AggregateType === "Count" && cntDef.AggregateField === "Amount" && cntDef.LHSRootModel === "Order_A00");

const lkIR = { app: { name: "Lk App" }, forms: [
  { name: "Vendor", fields: [{ name: "Vendor Name", type: "Text" }, { name: "IBAN", type: "Text" }] },
  { name: "Bill", fields: [{ name: "Vendor", type: "Reference", ref: "Vendor", autofill: true, sortBy: [{ Field: "Vendor Name" }], lookup: [{ name: "Vendor Name", type: "Text" }, { name: "IBAN", type: "Text" }] }] },
] };
const billBlob = buildApp(lkIR).artifacts.find((a) => a.id === "Bill_A00").blob;
const vRef = Object.values(billBlob).find((e) => e && e.Kind === "Field" && e.Name === "Vendor");
const qd = vRef && billBlob[vRef["Field::QueryDefinition"][0]];
ok("lookup: multi-field LookupField + AutoFill + SortBy", !!qd && qd.LookupField.length === 2 && qd.AutoFill === true && !!qd.SortBy);

// ---------------- 8. PAGES — create-action card ----------------
section("PAGES — create-action card (raise a request)");
const pgIR = { app: { name: "Pg App" }, forms: [{ name: "Req", flowType: "Process", fields: [{ name: "Title", type: "Text" }] }],
  pages: [{ name: "Requester Home", role: "User", cards: [{ label: "Raise a Request", view: "action", source_flow: "Req" }] }] };
const pgArt = buildApp(pgIR).artifacts.find((a) => a.type === "page");
const pgInter = pgArt && pgArt.intermediate;
const pgStr = pgInter && JSON.stringify(pgInter);
// 'action' → create Button (openPopup) + a HIDDEN popup holding the create FormView + the worklist table
const pgPopup = (pgInter?.popups || [])[0];
ok("page: 'action' card → worklist + create Button→Popup(FormView); create form HIDDEN in a popup, not embedded",
  !!pgStr && pgStr.includes('"ProcessTable"') && pgStr.includes('"Button"') && pgStr.includes('"openPopup"')
  && pgStr.includes('"Req_A00"') && !!pgPopup && JSON.stringify(pgPopup).includes('"FormView"')
  && !JSON.stringify(pgInter.body).includes('"FormView"')); // FormView lives in the popup, never in the body

// ---------------- 9. AUTOMATIONS — flow-stitch → Integration ----------------
section("AUTOMATIONS — flow-stitch compiles to an Integration (Trigger+Action)");
const autoArt = buildAutomation({ id: "req_to_pay", name: "Request → Payment",
  source: { flow: "Request_A00", on: "approved", event: "approved" },
  action: { type: "create", target_flow: "Payment_A00", field_map: { Vendor: "Requester", Amount: "Amount" } },
  channel: "internal", rationale: "approved request creates a payment" }, "Pg_App_A00");
const autoStr = JSON.stringify(autoArt.blob);
ok("automation → Integration flow with a Connector + Trigger + Action, bound to source & target",
  autoArt.type === "integration" && autoStr.includes('"Kind":"Integration"') && autoStr.includes('"Kind":"Trigger"')
  && autoStr.includes('"Kind":"Action"') && autoStr.includes('"Flow":"Request_A00"') && autoStr.includes('"TargetFlow":"Payment_A00"'));
// buildApp includes internal automations, excludes external
const autoIR = { app: { name: "A" }, forms: [{ name: "Request", flowType: "Process" }, { name: "Payment", flowType: "Process" }],
  automations: [
    { id: "s1", name: "R→P", source: { flow: "Request", event: "approved" }, action: { type: "create", target_flow: "Payment", field_map: {} }, channel: "internal" },
    { id: "s2", name: "ext", source: { flow: "Request", event: "approved" }, action: { type: "notify", target_flow: "Payment" }, channel: "external" },
  ] };
const autoApp = buildApp(autoIR).artifacts.filter((a) => a.type === "integration");
ok("buildApp emits internal automations, drops external ones", autoApp.length === 1 && autoApp[0].automation.id === "s1");

// ---------------- BOARD BUILDER (buildBoard) — golden-eval Case shape ----------------
section("BUILDERS — Board (Case flow: Model FlowType:Case + CaseFlow blob w/ Statuses+States)");
const boardSpec = { name: "Support Tickets", section: "Details", statuses: [{ name: "New", category: "NotStarted" }, { name: "Triage", category: "InProgress" }, { name: "Resolved", category: "Done" }],
  fields: [{ name: "Subject", type: "Text" }, { name: "Priority", type: "Text" }] };
const board = buildBoard(boardSpec, "Demo_App_A00");
const bModel = board.blob[board.blob.Root];
ok("board: artifact type is 'case'", board.type === "case");
ok("board: Model FlowType='Case'", bModel.FlowType === "Case");
ok("board: form fields still built (reuses buildForm layout)", (bModel["Model::Field"] || []).length === 2);
ok("board: emits a SEPARATE caseflow sub-artifact", !!board.caseflow && board.caseflow.type === "caseflow" && board.caseflow.parentModel === board.id);
const cf = board.caseflow.blob;
const cfEnt = cf[cf.Root];
ok("board: CaseFlow entity links Model + Type=Case", cfEnt.Kind === "CaseFlow" && cfEnt.Model === board.id && cfEnt.Type === "Case");
const bStatuses = Object.values(cf).filter((e) => e && e.Kind === "Status");
const bStates = Object.values(cf).filter((e) => e && e.Kind === "State");
ok("board: 3 spec statuses + system Reopened = 4 Status entities", bStatuses.length === 4 && bStatuses.some((s) => s.Name === "Reopened" && s.IsSystem));
ok("board: CaseFlow::Status + CaseFlow::State reference all built entities", cfEnt["CaseFlow::Status"].length === 4 && cfEnt["CaseFlow::State"].length === 4);
ok("board: 4 system swimlane States (default Not started, last Done)", bStates.length === 4 && bStates.some((s) => s.IsDefaultState && s.Name === "Not started") && bStates.some((s) => s.IsLastState && s.Category === "Closed"));
const aStatus = bStatuses.find((s) => s.Name === "New");
ok("board: UNSTRUCTURED — each status's OutwardStatus reaches every OTHER status (free movement)", aStatus.OutwardStatus.length === bStatuses.length - 1 && !aStatus.OutwardStatus.includes(aStatus.Id));
ok("board: Status carries golden fields (Category, Resources, EntryRule/ExitRule/Rule, SLADisabled)", "Category" in aStatus && Array.isArray(aStatus.Resources) && Array.isArray(aStatus.EntryRule) && aStatus.SLADisabled === false);
// default statuses when none specified
const bDef = buildBoard({ name: "My Tasks", fields: [{ name: "Task", type: "Text" }] }, "Demo_App_A00");
ok("board: defaults to To Do → In Progress → Done (+Reopened) when no statuses given", Object.values(bDef.caseflow.blob).filter((e) => e && e.Kind === "Status").length === 4);
// buildApp dispatch: a form with flowType 'Board' routes to buildBoard and emits the caseflow artifact
const boardIR = { app: { name: "Ops" }, roles: [{ name: "Agent" }], forms: [{ name: "Onboarding", flowType: "Board", statuses: [{ name: "Requested" }, { name: "Done", category: "Done" }], fields: [{ name: "Employee", type: "Text" }] }] };
const boardApp = buildApp(boardIR).artifacts;
ok("buildApp: flowType 'Board' → a 'case' artifact + its 'caseflow' artifact", boardApp.some((a) => a.type === "case" && a.id === "Onboarding_A00") && boardApp.some((a) => a.type === "caseflow" && a.parentModel === "Onboarding_A00"));
ok("buildApp: board build is deterministic", JSON.stringify(buildApp(boardIR).artifacts) === JSON.stringify(boardApp));

// buildKanbanPage — page graph that embeds a Kanban (+ default New-<Item> button) with CURRENT manifests
const kpStarter = { Root: "P1", P1: { Id: "P1", Kind: "Page", "Page::Container": ["Container001"] }, Container001: { Id: "Container001", Kind: "Container", Type: "Body", Name: "Body", Page: "P1", "Container::Style": [] } };
const kp = buildKanbanPage({ pageId: "P1", caseId: "Deals_A00", title: "Pipeline", subtitle: "Track deals", itemLabel: "Deal" }, kpStarter);
const kpVals = Object.values(kp);
const kanC = kpVals.find((e) => e && e.Kind === "Component" && (e.Data || {}).manifest_id === "Kanban");
const kanCont = kp[kanC.Container];
const kfmName = (cont, name) => cont["Container::FieldMapping"].map((f) => kp[f]).find((f) => f && f.Name === name);
ok("kanbanPage: uses CURRENT kanban manifest (view/kanban, not deprecated case/views/kanban)", kanC.Script.web === "view/kanban" && kanC.Data.manifest_id === "Kanban" && kanC.Data.category === "view");
ok("kanbanPage: flow binding is on the CONTAINER FieldMapping (not just Data)", kp[kfmName(kanCont, "flow_id")["FieldMapping::Property"][0]].Value === "Deals_A00" && kp[kfmName(kanCont, "flow_type")["FieldMapping::Property"][0]].Value === "Case" && !!kfmName(kanCont, "view_id") && !!kfmName(kanCont, "showform"));
const btnC = kpVals.find((e) => e && e.Kind === "Component" && (e.Data || {}).visualization_type === "button");
const btnCont = kp[btnC.Container];
const clickEv = kpVals.find((e) => e && e.Kind === "EventMapping" && e.Container === btnCont.Id && e.Name === "on_click");
const popId = kp[clickEv["EventMapping::Property"][0]].Value;
ok("kanbanPage: New-<Item> button caption + on_click OpenPopup", kp[kfmName(btnCont, "caption")["FieldMapping::Property"][0]].Value === "New Deal" && clickEv.Type === "OpenPopup" && kp[popId].Kind === "Popup");
const popCont = kp[kp[popId]["Popup::Container"][0]];
ok("kanbanPage: popup container is Type:'Popup' wrapping a form container", popCont.Type === "Popup" && kp[popCont["Container::Container"][0]].Type === "Component");
const formC = kpVals.find((e) => e && e.Kind === "Component" && (e.Data || {}).manifest_id === "Form");
const formCont = kp[formC.Container];
ok("kanbanPage: form uses view/form manifest + flow binding on its container", formC.Script.web === "view/form" && formC.Data.category === "view" && kp[kfmName(formCont, "flow_id")["FieldMapping::Property"][0]].Value === "Deals_A00");
ok("kanbanPage: on_submit/on_discard refresh the kanban + close popup", formCont["Container::EventMapping"].map((e) => kp[e]).every((e) => e.Type === "JSAction") && kp[kp[formCont["Container::EventMapping"][0]]["EventMapping::Property"][0]].Value.includes(kanC.Id) && kp[kp[formCont["Container::EventMapping"][0]]["EventMapping::Property"][0]].Value.includes("popup.close"));
ok("kanbanPage: NO deprecated manifests present (CaseViewKanban / case/form)", !kpVals.some((e) => e && (((e.Data || {}).manifest_id === "CaseViewKanban") || (e.Script || {}).web === "case/views/kanban" || (e.Script || {}).web === "case/form")));
ok("kanbanPage: body children clean (header, button row, board) + Page::Popup set", kp.Container001["Container::Container"].length === 3 && kp[kp.Root]["Page::Popup"].length === 1);
ok("kanbanPage: newButton:false omits the button+popup", (() => { const p = buildKanbanPage({ pageId: "P2", caseId: "X_A00", title: "T", newButton: false }, { Root: "P2", P2: { Id: "P2", Kind: "Page", "Page::Container": ["Container001"] }, Container001: { Id: "Container001", Kind: "Container", Type: "Body", "Container::Style": [] } }); return !Object.values(p).some((e) => e && e.Kind === "Popup") && Object.values(p).some((e) => e && (e.Data || {}).manifest_id === "Kanban"); })());

// ---------------- 10. INTEGRATION EMITTER (integrations.mjs) — 20 tests ----------------
section("INTEGRATION EMITTER — connector/trigger/action skeleton + builder-grade draft");

// fmType — Kissflow field type → FieldMapping type (6)
ok("fmType: Currency → Number", fmType("Currency") === "Number");
ok("fmType: Number/Decimal → Number", fmType("Number") === "Number" && fmType("Decimal") === "Number");
ok("fmType: Date/DateTime → Date", fmType("Date") === "Date" && fmType("DateTime") === "Date");
ok("fmType: Reference/User → Object", fmType("Reference") === "Object" && fmType("User") === "Object");
ok("fmType: YesNo → Boolean", fmType("YesNo") === "Boolean");
ok("fmType: Text/unknown → String", fmType("Text") === "String" && fmType("") === "String");

// resolveSkeleton — the plugin (AI) picks trigger + action deterministically (4)
const skCtx = { flowTypeOf: () => "Process" };
const upAuto = { name: "U", source: { flow: "Src", event: "approved" }, action: { type: "update", target_flow: "Tgt", match: { lhs: "Fund", rhs: "Fund" }, field_map: { "Amount": "Amount" } } };
const crAuto = { name: "C", source: { flow: "Src", event: "created" }, action: { type: "create", target_flow: "Tgt", field_map: { "Note": "'hi'" } } };
ok("resolveSkeleton: approved → ItemCompleted trigger", resolveSkeleton(upAuto, skCtx).triggerId === "ItemCompleted");
ok("resolveSkeleton: update → UpdateAnItem action", resolveSkeleton(upAuto, skCtx).actionId === "UpdateAnItem");
ok("resolveSkeleton: created → ItemCreated trigger", resolveSkeleton(crAuto, skCtx).triggerId === "ItemCreated");
ok("resolveSkeleton: create → CreateAndSubmitItem action", resolveSkeleton(crAuto, skCtx).actionId === "CreateAndSubmitItem");
// board (Case-flow) sources/targets + the rejected event — live-verified connector ids (2026-07-05)
const bdCtx = { flowTypeOf: (f) => (f === "Case" ? "Board" : "Process") };
const arAuto = { name: "AR8", source: { flow: "Offer", event: "completed" }, action: { type: "create", target_flow: "Case", field_map: {} } };
ok("resolveSkeleton: Board target create → board connector + CreateItem", (() => { const s = resolveSkeleton(arAuto, bdCtx); return s.tgtKey === "board" && s.actionId === "CreateItem" && s.triggerId === "ItemCompleted"; })());
const bcAuto = { name: "BC", source: { flow: "Case", event: "created" }, action: { type: "notify", target_flow: "Case" } };
ok("resolveSkeleton: Board source created → ItemSubmitted trigger", resolveSkeleton(bcAuto, bdCtx).triggerId === "ItemSubmitted");
const buAuto = { name: "BU", source: { flow: "Case", event: "updated" }, action: { type: "notify", target_flow: "Case" } };
ok("resolveSkeleton: Board source updated → StatusUpdated trigger", resolveSkeleton(buAuto, bdCtx).triggerId === "StatusUpdated");
const rjAuto = { name: "RJ", source: { flow: "Src", event: "rejected" }, action: { type: "notify", target_flow: "Src" } };
ok("resolveSkeleton: rejected event → ItemRejected trigger", resolveSkeleton(rjAuto, skCtx).triggerId === "ItemRejected");

// flowGrant — member-grant contract. Board MUST map to the "case" family with Permission:[] (the
// generic path sent Board→"form"+["Delete"] → 404 + memberless boards; hire-onboarding 2026-07-05).
ok("flowGrant: Board editable → case family, Member, Permission:[]", (() => { const g = flowGrant("Board", { editable: true }); return g.family === "case" && g.role === "Member" && g.permission.length === 0; })());
ok("flowGrant: Board owner (admin) → case Admin, Permission:[]", (() => { const g = flowGrant("Board", { editable: true, admin: true }); return g.family === "case" && g.role === "Admin" && g.permission.length === 0; })());
ok("flowGrant: Board read-only → case Viewer, Permission:[]", (() => { const g = flowGrant("Board", { editable: false }); return g.family === "case" && g.role === "Viewer" && g.permission.length === 0; })());
ok("flowGrant: Case behaves like Board (case family)", flowGrant("Case", { editable: true }).family === "case");
ok("flowGrant: Process editable → Member, Permission:[InitiateItems] (golden SharedWith; [] left roles unable to raise items)", (() => { const g = flowGrant("Process"); return g.family === "process" && g.role === "Member" && g.permission.length === 1 && g.permission[0] === "InitiateItems"; })());
ok("flowGrant: Process read-only → Member, Permission:[View]", (() => { const g = flowGrant("Process", { editable: false }); return g.family === "process" && g.role === "Member" && g.permission[0] === "View"; })());
ok("flowGrant: Form editable → form family, Member+[Delete]", (() => { const g = flowGrant("Form", { editable: true }); return g.family === "form" && g.role === "Member" && g.permission[0] === "Delete"; })());
ok("flowGrant: Form read-only → form Viewer, Permission:[]", (() => { const g = flowGrant("Form", { editable: false }); return g.family === "form" && g.role === "Viewer" && g.permission.length === 0; })());

// buildIntegrationDraft — STEP SKELETON only (trigger + create/update/email action; no connection,
// no flow binding, no field mappings — the user configures those in the builder after auth) (11)
const iCtx = { connectors: {
  process: { _id: "CP", name: "Kissflow Process", version: "3.7.5", logo: {} },
  email: { _id: "CE", name: "Email", version: "1.0.6", logo: {} },
  _available: ["Kissflow Process", "Email"] } };
const emAuto = { name: "E", source: { flow: "Src", event: "created" }, action: { type: "email", target_flow: "—" } };
const up = buildIntegrationDraft(upAuto, iCtx), cr = buildIntegrationDraft(crAuto, iCtx), em = buildIntegrationDraft(emAuto, iCtx);
const upT = Object.values(up).find((e) => e && e.Kind === "Trigger");
const upA = Object.values(up).find((e) => e && e.Kind === "Action");
ok("draft: Integration root links 1 Trigger + 1 Action", up[up.Root]["Integration::Trigger"].length === 1 && up[up.Root]["Integration::Action"].length === 1);
ok("draft: Trigger step has the right TriggerId (ItemCompleted)", upT.Connector.TriggerId === "ItemCompleted");
ok("draft: Trigger step is internal-auth w/ empty Connection (user auths in builder)", upT.IsInternalAuth === true && JSON.stringify(upT.Connection) === "{}");
ok("draft: Trigger step has EMPTY field mapping (mapped later)", Array.isArray(upT["Trigger::FieldMapping"]) && upT["Trigger::FieldMapping"].length === 0);
ok("draft: Trigger IsInternalAuth=true + Integration back-ref", upT.IsInternalAuth === true && upT.Integration === up.Root);
ok("draft: update → Action ActionId=UpdateAnItem, entity Type='Create' (golden: never 'Update')", upA.Connector.ActionId === "UpdateAnItem" && upA.Type === "Create");
ok("draft: Action step has EMPTY field mapping (no mappings)", Array.isArray(upA["Action::FieldMapping"]) && upA["Action::FieldMapping"].length === 0);
ok("draft: NO Property/FieldMapping entities (steps only)", !Object.values(up).some((e) => e && (e.Kind === "Property" || e.Kind === "FieldMapping")));
ok("draft: create → Action step ActionId = CreateAndSubmitItem", Object.values(cr).find((e) => e.Kind === "Action").Connector.ActionId === "CreateAndSubmitItem");
ok("draft: email → SendEmail on the Email connector", Object.values(em).find((e) => e.Kind === "Action").Connector.ActionId === "SendEmail" && Object.values(em).find((e) => e.Kind === "Action").Connector._id === "CE");
// notify = email semantics (INT-C2): a valid-IR notify must emit SendEmail on the Email connector,
// NEVER CreateAndSubmitItem on the process connector (which would create a spurious item per trigger)
const noAuto = { name: "N", source: { flow: "Src", event: "completed" }, action: { type: "notify", target_flow: "Tgt" } };
const noSk = resolveSkeleton(noAuto, skCtx);
ok("resolveSkeleton: notify → email connector + SendEmail", noSk.tgtKey === "email" && noSk.actionId === "SendEmail");
const no = buildIntegrationDraft(noAuto, iCtx);
const noA = Object.values(no).find((e) => e && e.Kind === "Action");
ok("draft: notify → SendEmail on the Email connector, no process create", noA.Connector.ActionId === "SendEmail" && noA.Connector._id === "CE" && noA.Connector.ActionId !== "CreateAndSubmitItem");
const noFull = buildIntegrationDraftFull(noAuto, { ...iCtx, flows: { Src: { id: "Src_A00", fields: [{ id: "F1", name: "F1", type: "Text" }] } } });
ok("draftFull: notify early-returns like email (To/Subject/Body deferred to builder)", Array.isArray(noFull._unresolved) && noFull._unresolved[0].includes("email action") && !Object.values(noFull).some((e) => e && e.Kind === "FieldMapping" && e.Action));
let threw = false; try { buildIntegrationDraft(upAuto, { connectors: { _available: [] } }); } catch { threw = true; }
ok("draft: throws when the connector isn't available", threw);

// connectionsFromExport — harvest connection + pinned connector from app metadata (1)
const mockFs = {
  readdirSync: (dir) => dir.endsWith("/integration") ? [{ name: "x", isDirectory: () => true }] : [{ name: "m.json", isDirectory: () => false }],
  readFileSync: () => JSON.stringify({ Root: "I", I: { Kind: "Integration" }, T: { Kind: "Trigger", Connector: { Name: "Kissflow Process", _id: "CP", Version: "3.2.1", Logo: {} }, Connection: { _id: "CnX", Name: "Kissflow Process Connection" } } }),
};
const cfe = connectionsFromExport("/fake", mockFs);
ok("connectionsFromExport: harvests connection + PINNED connector version from metadata", cfe.process && cfe.process._id === "CnX" && cfe.process.connector.Version === "3.2.1");

// provisionSystemConnection — the platform mints its own key; caller supplies NO credential (verified live) (2)
const provClient = {
  calls: [],
  async call(method, path, body) {
    this.calls.push({ method, path, body });
    if (path.endsWith("/SystemApiKey")) return { status: 200, body: { _id: "CnNEW", Name: body.Name, Connector: { _id: "CP", Version: "3.7.5" } } };
    return { status: 200, body: [] }; // resolveConnections list → empty (MBAC/none)
  },
};
const prov = await provisionSystemConnection(provClient, "ACC", "CP", "3.7.5", "Kissflow Process Connection");
ok("provisionSystemConnection: POSTs .../SystemApiKey and returns {_id,Name}", prov._id === "CnNEW" && provClient.calls.some((c) => c.method === "POST" && c.path.endsWith("/connection/CP/3.7.5/SystemApiKey") && c.body.Name && !("api_key" in c.body) && !("Secret" in c.body)));

// ensureConnections — provisions for each catalog key missing from the (gated) live list (1)
const ens = await ensureConnections(provClient, "ACC", { process: { _id: "CP", name: "Kissflow Process", version: "3.7.5" }, _available: ["Kissflow Process"] });
ok("ensureConnections: provisions a connection for the missing 'process' key", ens.process && ens.process._id === "CnNEW");

// buildIntegrationDraft WITH a provisioned connection → auth pre-satisfied (IsInternalAuth:false + Connection) (2)
const iCtxConn = { ...iCtx, connections: { process: { _id: "CnNEW", Name: "Kissflow Process Connection" } } };
const upC = buildIntegrationDraft(upAuto, iCtxConn);
const upCT = Object.values(upC).find((e) => e && e.Kind === "Trigger");
const upCA = Object.values(upC).find((e) => e && e.Kind === "Action");
ok("draft(conn): Trigger attaches provisioned Connection + IsInternalAuth=false", upCT.IsInternalAuth === false && upCT.Connection._id === "CnNEW");
ok("draft(conn): Action attaches provisioned Connection + IsInternalAuth=false", upCA.IsInternalAuth === false && upCA.Connection._id === "CnNEW");

// buildIntegrationDraftFull — process bindings + per-field mappings (the fully-configured draft) (11)
const fullFlows = {
  Valuation: { id: "Valuation_A07", fields: [{ id: "Average_Valuation", name: "Average Valuation", type: "Currency" }, { id: "Fund", name: "Fund", type: "Reference" }] },
  NAV: { id: "NAV_A07", fields: [{ id: "Market_Value_of_the_land", name: "Market Value of the land", type: "Currency" }, { id: "Fund", name: "Fund", type: "Reference" }] },
  Payment: { id: "Payment_A07", fields: [{ id: "Total", name: "Total", type: "Currency" }, { id: "Notes", name: "Notes", type: "Text" }] },
};
const fCtx = { ...iCtxConn, flows: fullFlows };
// update stitch: NAV.Market Value ← Valuation.Average Valuation (by label)
const updAuto = { name: "V→NAV", source: { flow: "Valuation", event: "approved" }, action: { type: "update", target_flow: "NAV", field_map: { "Market Value of the land": "Average Valuation" } } };
const fd = buildIntegrationDraftFull(updAuto, fCtx);
const fT = Object.values(fd).find((e) => e && e.Kind === "Trigger");
const fA = Object.values(fd).find((e) => e && e.Kind === "Action");
const propsOf = (fmId) => Object.values(fd).filter((e) => e && e.Kind === "Property" && e.FieldMapping === fmId);
const fmByName = (parent, key, name) => parent[key].map((id) => fd[id]).find((f) => f && f.Name === name);
const tPid = fmByName(fT, "Trigger::FieldMapping", "process_id");
const aPid = fmByName(fA, "Action::FieldMapping", "process_id");
const aMv = fmByName(fA, "Action::FieldMapping", "Market_Value_of_the_land");
const aId2 = fmByName(fA, "Action::FieldMapping", "_id");
ok("full: Trigger process_id = Value:[source flow id]", propsOf(tPid.Id)[0].Type === "Value" && JSON.stringify(propsOf(tPid.Id)[0].Value) === '["Valuation_A07"]');
ok("full: Trigger carries an Output sample (drives smart mapping)", fT.Output && fT.Output._id && "Average_Valuation" in fT.Output);
ok("full: Action process_id = Value:[target flow id]", propsOf(aPid.Id)[0].Type === "Value" && JSON.stringify(propsOf(aPid.Id)[0].Value) === '["NAV_A07"]');
ok("full: field label resolved to id (Market Value of the land → Market_Value_of_the_land)", !!aMv);
ok("full: currency field mapped with fmType Number", aMv.Type === "Number");
ok("full: field bound via Property Type:Field context.<trigger>.<srcFieldId>", propsOf(aMv.Id)[0].Type === "Field" && propsOf(aMv.Id)[0].Field === `context.${fT.Id}.Average_Valuation`);
ok("full: update WITHOUT key_field omits _id + flags record-locator (empty _id = invalid payload)", !aId2 && (fd._unresolved || []).some((u) => /record-locator/.test(u)));
// update WITH key_field → _id bound from the named source ref
const updKeyAuto = { ...updAuto, action: { ...updAuto.action, key_field: "Fund" } };
const fdk = buildIntegrationDraftFull(updKeyAuto, fCtx);
const fAk = Object.values(fdk).find((e) => e && e.Kind === "Action");
const fTk = Object.values(fdk).find((e) => e && e.Kind === "Trigger");
const aIdk = fAk["Action::FieldMapping"].map((id) => fdk[id]).find((f) => f && f.Name === "_id");
const kPropsOf = (fmId) => Object.values(fdk).filter((e) => e && e.Kind === "Property" && e.FieldMapping === fmId);
ok("full: update WITH key_field binds _id via context.<trigger>.<keyFieldId>", !!aIdk && kPropsOf(aIdk.Id)[0].Field === `context.${fTk.Id}.Fund`);
// create stitch with a quoted literal → Property Type:Value
const crFullAuto = { name: "→Pay", source: { flow: "Valuation", event: "created" }, action: { type: "create", target_flow: "Payment", field_map: { "Total": "Average Valuation", "Notes": "'auto-created'" } } };
const cfd = buildIntegrationDraftFull(crFullAuto, fCtx);
const cfA = Object.values(cfd).find((e) => e && e.Kind === "Action");
const cPropsOf = (fmId) => Object.values(cfd).filter((e) => e && e.Kind === "Property" && e.FieldMapping === fmId);
const cNotes = cfA["Action::FieldMapping"].map((id) => cfd[id]).find((f) => f && f.Name === "Notes");
const cTotal = cfA["Action::FieldMapping"].map((id) => cfd[id]).find((f) => f && f.Name === "Total");
ok("full(create): quoted literal → Property Type:Value (unquoted)", cPropsOf(cNotes.Id)[0].Type === "Value" && JSON.stringify(cPropsOf(cNotes.Id)[0].Value) === '["auto-created"]');
ok("full(create): field ref → Property Type:Field", cPropsOf(cTotal.Id)[0].Type === "Field");
// unresolved refs are collected, not fatal
const badAuto = { name: "bad", source: { flow: "Valuation", event: "approved" }, action: { type: "update", target_flow: "NAV", field_map: { "Nonexistent Field": "Average Valuation" } } };
ok("full: unresolved target field collected on _unresolved (non-fatal)", (buildIntegrationDraftFull(badAuto, fCtx)._unresolved || []).some((u) => /Nonexistent/.test(u)));

// applyIntegrationResolved — the builder-faithful 2-pass live path (create + update) via a MOCK client (7)
function mockResolvedClient(actionSchema) {
  const puts = [];
  return { puts, acc: "ACC", async call(method, path, body) {
    if (method === "POST" && /\/integration\?/.test(path)) return { status: 200, body: { _id: "INT_A00" } };
    if (method === "GET" && /\/integration\/INT_A00\/draft/.test(path)) return { status: 200, body: { Root: "SRV_ROOT" } };
    if (method === "PUT" && /\/draft$/.test(path)) { puts.push(JSON.parse(JSON.stringify(body))); return { status: 200, body: {} }; }
    if (method === "GET" && /\/action\/[^/]+\/fields$/.test(path)) return { status: 200, body: actionSchema };
    if (method === "POST" && /\/publish$/.test(path)) return { status: 200, body: {} };
    if (method === "POST" && /\/SystemApiKey$/.test(path)) return { status: 200, body: { _id: "CnX", Name: "C", Connector: { _id: "CP", Version: "3.7.5" } } };
    if (method === "GET" && /\/connection$/.test(path)) return { status: 200, body: [] };
    return { status: 200, body: {} };
  } };
}
const rflows = {
  Valuation: { id: "Valuation_A07", display: "Valuation", fields: [{ id: "Average_Valuation", name: "Average Valuation", type: "Currency" }, { id: "Fund", name: "Fund", type: "Reference" }] },
  NAV: { id: "NAV_A07", display: "NAV", fields: [{ id: "Market_Value_of_the_land", name: "Market Value of the land", type: "Currency" }] },
  Payment: { id: "Payment_A07", display: "Payment", fields: [{ id: "Fund", name: "Fund", type: "Reference" }, { id: "Total", name: "Total", type: "Currency" }] },
};
const rCtx = { connectors: iCtx.connectors, connections: { process: { _id: "CnX", Name: "C" } }, flows: rflows };
const updSchema = [{ Name: "process_id", Label: "Choose a process", Type: "String", IsRequired: true, IsDropdown: true }, { Name: "_id", Label: "Select instance", Type: "String", IsRequired: true }, { Name: "Market_Value_of_the_land", Label: "Market Value of the land", Type: "String", IsRequired: false }];
const rUpd = { name: "RU", source: { flow: "Valuation", event: "approved" }, action: { type: "update", target_flow: "NAV", field_map: { "Market Value of the land": "Average Valuation" } } };
const mc = mockResolvedClient(updSchema);
const rrep = await applyIntegrationResolved(mc, "ACC", "APP_A00", rUpd, rCtx);
ok("resolved(update): all steps 200 (create/putSkeleton/putFull/publish)", rrep.steps.create === 200 && rrep.steps.putSkeleton === 200 && rrep.steps.putFull === 200 && rrep.steps.publish === 200);
ok("resolved(update): resolvedFields count reported from live schema", rrep.steps.resolvedFields === 3);
const finalDraft = mc.puts[mc.puts.length - 1];
const rAction = Object.values(finalDraft).find((e) => e && e.Kind === "Action");
const rActProps = (fmId) => Object.values(finalDraft).filter((e) => e && e.Kind === "Property" && e.FieldMapping === fmId);
const rFm = (name) => rAction["Action::FieldMapping"].map((id) => finalDraft[id]).find((f) => f && f.Name === name);
ok("resolved(update): action enumerates ALL resolved fields (golden shape)", rAction["Action::FieldMapping"].length === 3);
ok("resolved(update): process_id has SelectedDropdown + Value binding", rFm("process_id").SelectedDropdown[0].FieldId === "NAV_A07" && rActProps(rFm("process_id").Id)[0].Type === "Value");
ok("resolved(update): mapped field bound via context.<trigger>", rActProps(rFm("Market_Value_of_the_land").Id)[0].Field.startsWith("context.") && rActProps(rFm("Market_Value_of_the_land").Id)[0].Field.endsWith(".Average_Valuation"));
ok("resolved(update): _id flagged unresolved when no key_field", (rrep.unresolved || []).some((u) => /record-locator/.test(u)));
// CREATE — resolved schema has NO _id; nothing left unresolved
const crSchema = [{ Name: "process_id", Label: "Choose a process", Type: "String", IsRequired: true, IsDropdown: true }, { Name: "Fund", Label: "Fund", Type: "Object", IsRequired: false }, { Name: "Total", Label: "Total", Type: "String", IsRequired: false }];
const rCr = { name: "RC", source: { flow: "Valuation", event: "created" }, action: { type: "create", target_flow: "Payment", field_map: { "Fund": "Fund" } } };
const mc2 = mockResolvedClient(crSchema);
const rrep2 = await applyIntegrationResolved(mc2, "ACC", "APP_A00", rCr, rCtx);
ok("resolved(create): all steps 200 and NO unresolved (create needs no _id locator)", rrep2.steps.putFull === 200 && rrep2.steps.publish === 200 && !rrep2.unresolved);

// ---------------- summary ----------------

// ── MEMORY DECAY — scope-based TTLs, reaffirmation, archival (memory.mjs) ─────
const { parseMemory, applyDecay, reaffirmEntry, scopeKind, DECAY_DAYS } = await import("../memory.mjs");
const MEMFIX = `# kf-author — Agent Memory

## How every agent uses this
- READ first, WRITE on learning.

## Entries
- 2026-01-01 [global] platform truth: descriptions cap at 250 chars.
- 2026-01-01 [app:oldapp] app fact from a long-dead project,
  wrapped onto a second line.
- 2026-01-01 [agent:kf-ba] role guidance for the analyst.
- 2025-01-01 [global] ancient platform claim nobody re-checked.
- 2025-01-01 [global] old but re-verified fact. (reaffirmed 2026-06-01)
- 2026-01-01 [global] promoted stub → see reference/LESSONS.md §5.
`;
const pm = parseMemory(MEMFIX);
ok("memory: parse → 6 entries, prologue preserved", pm.items.filter((i) => i.raw === undefined).length === 6 && pm.prologue.join("\n").includes("READ first"));
ok("memory: wrapped continuation lines stay with their entry", pm.items.filter((i) => i.raw === undefined)[1].lines.length === 2);
ok("memory: scope kinds resolve (app/agent/global/stub)", scopeKind(pm.items.filter((i)=>i.raw===undefined)[1]) === "app" && scopeKind(pm.items.filter((i)=>i.raw===undefined)[5]) === "stub");
const dec = applyDecay(MEMFIX, "2026-07-03");
ok("memory decay: [app] expires after 90d, [global] survives at ~6mo", dec.archived.some((a) => a.scope === "app:oldapp") && !dec.archived.some((a) => a.lines[0].includes("descriptions cap")));
ok("memory decay: unaffirmed 18-month global expires; reaffirmed twin survives", dec.archived.some((a) => a.lines[0].includes("ancient platform claim")) && !dec.archived.some((a) => a.lines[0].includes("re-verified fact")));
ok("memory decay: agent guidance (6mo) survives its 240d window", !dec.archived.some((a) => a.scope === "agent:kf-ba"));
ok("memory decay: survivors + prologue intact in output; archive annotated", dec.out.includes("READ first") && dec.out.includes("descriptions cap") && !dec.out.includes("ancient platform claim") && dec.archiveOut.includes("archived 2026-07-03 (decay:"));
const reaf = reaffirmEntry(MEMFIX, "ancient platform claim", "2026-07-01");
ok("memory reaffirm: marker appended and resets the decay clock", reaf.hit && applyDecay(reaf.out, "2026-07-03").archived.every((a) => !a.lines[0].includes("ancient platform claim")));


// ── TIMELINE — per-run timing instrumentation (timeline.mjs) ──────────────────
const { parseTimeline, summarize, fmtMs } = await import("../timeline.mjs");
const TL = [
  { ts: "2026-07-03T06:00:00.000Z", actor: "kf-ba", step: "extract domain", ev: "start" },
  { ts: "2026-07-03T06:12:30.000Z", actor: "kf-ba", step: "extract domain", ev: "end" },
  { ts: "2026-07-03T06:12:31.000Z", actor: "runs", step: "snapshot v1", ev: "mark" },
  { ts: "2026-07-03T06:13:00.000Z", actor: "engine", step: "apply", ev: "start" },
  { ts: "2026-07-03T06:41:00.000Z", actor: "engine", step: "apply", ev: "end" },
  { ts: "2026-07-03T06:50:00.000Z", actor: "kf-acceptance", step: "journeys", ev: "start" },
].map((e) => JSON.stringify(e)).join("\n");
const tlEvents = parseTimeline(TL + "\nnot json\n");
ok("timeline: parser skips malformed lines", tlEvents.length === 6);
const tlSum = summarize(tlEvents);
ok("timeline: start/end pair into a measured span", tlSum.spans.some((x) => x.actor === "kf-ba" && x.ms === 750000));
ok("timeline: apply span measured (28m)", tlSum.byActor.engine === 28 * 60000);
ok("timeline: marks kept, open span flagged", tlSum.spans.some((x) => x.mark) && tlSum.spans.some((x) => x.open && x.actor === "kf-acceptance"));
ok("timeline: wall-clock = first→last event", tlSum.total === 50 * 60000);
ok("timeline: durations format human-readable", fmtMs(750000) === "12m 30s" && fmtMs(28 * 60000) === "28m 0s");

// ── TIMELINE — per-agent token accounting (token-stamp hook + report columns) ──
const { sumTranscriptTokens, fmtTok } = await import("../timeline.mjs");
const TR = [
  { message: { usage: { input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 9000, cache_creation_input_tokens: 800 } } },
  { message: { role: "user", content: "no usage here" } },
  { message: { usage: { input_tokens: 20, output_tokens: 30, cache_read_input_tokens: 10000 } } },
].map((e) => JSON.stringify(e)).join("\n");
const trTok = sumTranscriptTokens(TR + "\nnot json\n");
ok("tokens: transcript usage summed across turns (malformed lines skipped)",
  trTok.turns === 2 && trTok.input === 120 && trTok.output === 80 && trTok.cacheRead === 19000 && trTok.cacheWrite === 800 && trTok.total === 20000);
ok("tokens: transcript with no usage → null", sumTranscriptTokens('{"message":{"role":"user"}}') === null);
const TLT = TL + "\n" + [
  { ts: "2026-07-03T06:12:31.000Z", actor: "kf-ba", step: "agent a1", ev: "tokens", tokens: { input: 120, output: 80, cacheRead: 19000, cacheWrite: 800, total: 20000 } },
  { ts: "2026-07-03T06:45:00.000Z", actor: "kf-ba", step: "agent a2", ev: "tokens", tokens: { input: 10, output: 10, cacheRead: 900, cacheWrite: 80, total: 1000 } },
  { ts: "2026-07-03T06:46:00.000Z", actor: "kf-verifier", step: "agent a3", ev: "tokens", tokens: { input: 5, output: 5, cacheRead: 400, cacheWrite: 90, total: 500 } },
].map((e) => JSON.stringify(e)).join("\n");
const tokSum = summarize(parseTimeline(TLT));
ok("tokens: per-actor aggregation across multiple agent runs",
  tokSum.byActorTokens["kf-ba"].total === 21000 && tokSum.byActorTokens["kf-ba"].agents === 2 && tokSum.byActorTokens["kf-verifier"].total === 500);
ok("tokens: run total sums all actors", tokSum.tokenTotal.total === 21500 && tokSum.tokenTotal.agents === 3);
ok("tokens: token events don't pollute spans/durations", !tokSum.spans.some((s) => s.step?.startsWith("agent a")) && tokSum.byActor["kf-ba"] === 750000);
ok("tokens: no token events → tokenTotal null", tlSum.tokenTotal === null);
ok("tokens: counts format human-readable", fmtTok(21500) === "22k" && fmtTok(1200000) === "1.2M" && fmtTok(999) === "999");


// ── EXPERIENCE BASELINE — permission model ids resolve to form names (VER-B1) ─
const { ensureExperience } = await import("../experience.mjs");
const expIR = { app: { name: "Exp" }, roles: [{ name: "Requester" }, { name: "Finance" }],
  forms: [
    { id: "purchase-requisition", name: "Purchase Requisition", flowType: "Process", fields: [{ name: "Title", type: "Text" }, { name: "Status", type: "Select" }], workflow: { steps: [{ name: "S", actor: "Requester" }, { name: "Done" }] } },
    { id: "p2p-vendor", name: "P2P Vendor", fields: [{ name: "Vendor Name", type: "Text" }] }],
  permissions: [
    { role: "Requester", model: "purchase-requisition", level: "Editable" },   // by ID
    { role: "Finance", model: "Purchase Requisition", level: "ReadOnly" },     // by NAME
    { role: "Finance", model: "P2P_VENDOR", level: "ReadOnly" }] };            // sloppy casing
const expOut = ensureExperience(JSON.parse(JSON.stringify(expIR)));
const reqHome = expOut.ir.pages.find((p2) => p2.role === "Requester");
ok("experience: id-based permission still yields worklist + create action", reqHome && reqHome.cards.some((c) => c.view === "action" && c.source_flow === "Purchase Requisition") && reqHome.cards.some((c) => c.view === "list"));
const finHome = expOut.ir.pages.find((p2) => p2.role === "Finance");
ok("experience: name + sloppy-cased refs canonicalize to display names", finHome && finHome.cards.every((c) => !c.source_flow || ["Purchase Requisition", "P2P Vendor"].includes(c.source_flow)));
ok("experience: flow worklist page + non-degenerate nav generated", expOut.ir.pages.some((p2) => p2.name === "Purchase Requisition" && !p2.landing) && expOut.ir.nav.menus.length >= 2);


// Select referredList outside idmap must survive VERBATIM (bare Select publishes as opaque 500)
const selForm = buildForm({ name: "Sel", fields: [{ name: "UoM", type: "Select", referredList: "P2P_Unit_of_Measure_A02" }] }, "APP");
ok("select: referredList outside idmap kept verbatim", selForm.blob["UoM"].ReferredList === "P2P_Unit_of_Measure_A02");


// cross-flow PER-ITEM aggregate (supersedes R7): Criteria join, app id, no LHSRootModel
const xIR = { app: { name: "XAgg" }, roles: [], forms: [
  { name: "Order", flowType: "Process", fields: [{ name: "Title", type: "Text" }, { name: "Grand Total", type: "Currency", aggregate: { fn: "SUM", over: "Order Line", field: "Line Total", flowType: "Form", match: { field: "Order" } } }], workflow: { steps: [{ name: "S" }, { name: "Done" }] } },
  { name: "Order Line", fields: [{ name: "Desc", type: "Text" }, { name: "Order", type: "Reference", ref: "Order" }, { name: "Line Total", type: "Currency" }] }] };
const xBlob = buildApp(xIR).artifacts.find((a) => a.id === "Order_A00").blob;
const xQd = xBlob[xBlob["Grand_Total"]["Field::QueryDefinition"][0]];
ok("xflow aggregate: QD targets the flow with app id, no LHSRootModel", xQd.LHSModel === "Order_Line_A00" && xQd.LHSModelApplicationId === "XAgg_A00" && !xQd.LHSRootModel);
const xCn = xBlob[xBlob[xQd["QueryDefinition::Criteria"][0]]["Criteria::Condition"][0]];
ok("xflow aggregate: Criteria join <target.ref == this._id>", xCn.LHSField === "Order" && xCn.RHSField === "_id" && xCn.Operator === "EQUAL_TO");


// DEF-4 root cause: parent must declare its child via Model::Model or publish dissolves the child
const ctIR = { app: { name: "CT2" }, roles: [], forms: [
  { name: "Order2", flowType: "Process", fields: [{ name: "Title", type: "Text" }], workflow: { steps: [{ name: "S" }, { name: "Done" }] } },
  { name: "Order2 Lines", childOf: "Order2", fields: [{ name: "Desc", type: "Text" }] }] };
const ctBlob = buildApp(ctIR).artifacts.find((a) => a.id === "Order2_A00").blob;
ok("child table: parent declares child via Model::Model", JSON.stringify(ctBlob["Order2_A00"]["Model::Model"]) === JSON.stringify(["Order2_Lines_A00"]));


// FEDERATION — contribution extracts shareable scopes, withholds project-private entries
const { extractContribution } = await import("../memory.mjs");
const LOCAL = "- 2026-07-04 [global] a platform truth.\n- 2026-07-04 [app:acme-p2p] customer-specific fact.\n- 2026-07-04 [agent:kf-ba] role guidance.\n";
const contrib = extractContribution(LOCAL, "2026-07-04");
ok("federation: contribution shares global+agent, withholds [app:*]", contrib.shared === 2 && contrib.withheld === 1 && !contrib.out.includes("acme-p2p") && contrib.out.includes("platform truth"));


// PROTOTYPE ASSEMBLER — parallel-generated parts splice into the shell deterministically
const { assemble } = await import("../proto-assemble.mjs");
const shellFx = "<html><body><section><!-- @PART:role-finance --></section><section><!-- @PART:role-requester --></section></body></html>";
const asm = assemble(shellFx, { "role-finance": "<div>AP DESK</div>", "role-requester": "<div>INTAKE</div>", "role-extra": "<div>?</div>" });
ok("assembler: parts spliced at markers", asm.out.includes("AP DESK") && asm.out.includes("INTAKE") && !asm.out.includes("@PART"));
const shellFx2 = "<html><body><section><!-- @PART:role-x --></section><script>window.SEED={}</script></body></html>";
const asm2 = assemble(shellFx2, { "role-x": "<div>X</div><script>render(SEED)</script>" });
ok("assembler: part scripts deferred AFTER the shell script", asm2.deferredScripts === 1 && asm2.out.indexOf("render(SEED)") > asm2.out.indexOf("window.SEED"));
ok("assembler: reports missing + unused parts", assemble(shellFx, { "role-finance": "x" }).missing.includes("role-requester") && asm.unused.includes("role-extra"));
// regression: a part's JS containing `$'` (or $&/$`/$$) must splice VERBATIM. A string replacement
// interprets these as special patterns ($' = "everything after the match"), which spliced </html>
// into the middle of the Finance script and blanked the whole role in a live parallel build.
const asm3 = assemble(shellFx2, { "role-x": "<div>X</div><script>var s=\">$'+r.v\";f(s)</script>" });
ok("assembler: $-sequences in part JS splice verbatim (no $' expansion)", asm3.out.includes(">$'+r.v"));

// PROTOTYPE VERIFIER — deterministic per-role gate (syntax / markers / empty containers)
const { verify } = await import("../proto-verify.mjs");
// a REAL assembled prototype carries the shell's window.ROLES and at least one part's
// window.PAGES registration — without either the page renders blank, so the fixture must have both
const vShell = '<script>window.ROLES=[{"slug":"x","name":"X","nav":[{"id":"x-q","label":"Q"}]}];</script>';
const vGood = `<html><head>${vShell}</head><body><section id="rv-x"><div id="x-q"></div></section><!-- part:role-x script (deferred by assembler) -->\n<script>window.PAGES=window.PAGES||{};Object.assign(window.PAGES,{"x-q":function(){document.getElementById("x-q").innerHTML="ok"}})</script></body></html>`;
ok("verifier: clean assembled prototype passes", verify(vGood).pass === true);
// the blank-page pair: the shell reads window.ROLES but nothing defines it (three shipped
// prototypes rendered chrome-only and PASSED before this check existed), and roles with no
// page registrations at all
ok("verifier: reads window.ROLES but never defines it → blank page caught",
  verify(vGood.replace(vShell, "<script>if(window.ROLES){}</script>")).pass === false);
ok("verifier: role sections with no window.PAGES registration caught",
  verify(`<html><head>${vShell}</head><body><section id="rv-x"><div id="x-q"></div></section></body></html>`).pass === false);
const vBad = '<html><body><section id="rv-x"><div id="x-q"></div></section><!-- part:role-x script (deferred by assembler) -->\n<script>if(</script></body></html>';
const vb = verify(vBad);
ok("verifier: syntax-broken part caught + attributed to its role", vb.pass === false && vb.errorRoles.includes("x"));
ok("verifier: unspliced @PART marker flagged as a missing part", verify('<html><body><section id="rv-y"></section><!-- @PART:role-y --></body></html>').pass === false);

// TEMPLATE_LEAK — the stat card that shipped reading `${fmtMoney(8850000)}` instead of a number.
// Everything else about that page was fine: it parsed, the scripts compiled, the containers filled.
const vLeak = vGood.replace('<div id="x-q"></div>',
  `<div id="x-q"></div><div class="stat"><span>\${ICON('chart','')}</span><b>\${fmtMoney(8850000)}</b><span>Q3 Budgeted</span></div>`);
const vl = verify(vLeak);
ok("verifier: template syntax rendered as text is caught", vl.pass === false);
ok("verifier: …attributed to the role whose markup leaked", vl.errorRoles.includes("x"));
ok("verifier: …and names the offending expression",
  vl.findings.some((f) => f.kind === "TEMPLATE_LEAK" && f.msg.includes("fmtMoney")));
// the false-positive guard: ${…} inside <script> is a template literal doing its job, and every
// real prototype is full of them — flagging those would make the check useless on day one
ok("verifier: ${…} inside a <script> is NOT flagged",
  verify(vGood.replace('innerHTML="ok"', 'innerHTML=`${1+1} items`')).pass === true);

// HYBRID GATE — deterministic structural checks (checkGateIR) so the AI gate only reasons about semantics
const { checkGateIR } = await import("../ir.mjs");
const gBroken = { roles: [{ name: "A" }], forms: [{ id: "f1", name: "M" }], pages: [{ name: "Home" }],
  nav: { menus: [{ submenus: [{ name: "Ghost", page: "Nope", visibleTo: ["A"] }] }] },
  permissions: [{ role: "Zzz", model: "f1", level: "View", scope: "all" }] };
const gCodes = checkGateIR(gBroken).map((i) => i.code);
ok("gate: nav→dangling page + unknown-perm-role caught deterministically", gCodes.includes("NAV_DANGLING_PAGE") && gCodes.includes("PERM_UNKNOWN_ROLE"));
const gClean = { roles: [{ name: "A" }], forms: [{ id: "f1", name: "M" }], pages: [{ name: "Home", landing: true }],
  nav: { menus: [{ submenus: [{ name: "Home", page: "Home", visibleTo: ["A"] }] }] },
  permissions: [{ role: "A", model: "f1", level: "Editable", scope: "all" }] };
ok("gate: clean IR yields zero structural errors (no false positives)", checkGateIR(gClean).filter((i) => i.level === "error").length === 0);

// PUBLISH INVARIANTS — the known-500 catalog as pre-flight assertions (catch before a live publish 500)
const { checkPublishInvariants } = await import("../validators.mjs");
const piBad = { Root: "m", m: { Id: "m", Kind: "Model", "Model::Field": ["s", "q", "e"] },
  s: { Id: "s", Kind: "Field", Type: "Select", Name: "Status" },                 // bare Select, no ReferredList
  q: { Id: "q", Kind: "Field", Type: "SequenceNumber", Name: "Ref No" },          // SequenceNumber, no Field::Property
  e: { Id: "e", Kind: "Expression", Field: "x", "Expression::Node": [] } };       // empty Expression node
const piCodes = checkPublishInvariants(piBad).map((i) => i.code);
ok("publish-invariants: bare Select / seqnum-no-prop / empty Expression all caught pre-publish",
  piCodes.includes("SELECT_NO_LIST") && piCodes.includes("SEQNUM_NO_PROPERTY") && piCodes.includes("EMPTY_EXPRESSION"));
const piOk = { Root: "m", m: { Id: "m", Kind: "Model" },
  s: { Id: "s", Kind: "Field", Type: "Select", Name: "Status", ReferredList: "list-1" },
  q: { Id: "q", Kind: "Field", Type: "SequenceNumber", Name: "Ref", "Field::Property": ["p1"] } };
ok("publish-invariants: a correctly-built blob has none", checkPublishInvariants(piOk).length === 0);

// VALIDATION ENGINE GATE — edit-path diff-scope: block changes outside the intended edit
const { validationGate } = await import("../ir.mjs");
const vgLive = { forms: [{ id: "f1", fields: [{ id: "a", name: "A" }, { id: "b", name: "B" }] }], permissions: [{ role: "R", model: "f1", level: "Editable", scope: "all" }] };
const vgDes = { forms: [{ id: "f1", fields: [{ id: "a", name: "A CHANGED" }, { id: "b", name: "B" }] }], permissions: [{ role: "R", model: "f1", level: "ReadOnly", scope: "all" }] };
const vgScoped = validationGate(vgLive, vgDes, { scope: ["f1.a"] });
ok("validation-gate: blocks out-of-scope drift (permission drift on an f1.a edit)", vgScoped.pass === false && vgScoped.outOfScope.some((c) => c.kind === "permission"));
ok("validation-gate: the intended f1.a field change is in scope", vgScoped.changes.some((c) => c.id === "f1.a" && c.change === "modified"));
ok("validation-gate: identical IRs → 0 changes, pass", validationGate(vgLive, vgLive, { scope: ["f1.a"] }).changes.length === 0);

// ── REGRESSION: gate/validation-gate wrong-verdict bugs (adversarial review 2026-07) ──
// #1 role slug↔name: nav "super-admin" is the SAME identity as role "Super Admin" — no false positive.
ok("gate: role slug (super-admin) matches display name (Super Admin) — no false flag",
  checkGateIR({ roles: [{ name: "Super Admin" }], forms: [{ id: "f1", name: "M" }], pages: [{ name: "Home", landing: true }],
    nav: { menus: [{ submenus: [{ name: "Home", page: "Home", visibleTo: ["super-admin"] }] }] },
    permissions: [{ role: "Super Admin", model: "f1", level: "Editable", scope: "all" }] })
    .filter((i) => i.level === "error" || i.code === "NAV_UNKNOWN_ROLE" || i.code === "ROLE_NO_REACHABLE_PAGE").length === 0);
// #4 page ref casing: nav "dashboard" resolves page "Dashboard" — not a dangling-page ERROR.
ok("gate: nav page ref is case-insensitive (dashboard ↔ Dashboard)",
  !checkGateIR({ roles: [{ name: "A" }], forms: [{ id: "f1", name: "M" }], pages: [{ name: "Dashboard", landing: true }],
    nav: { menus: [{ submenus: [{ name: "D", page: "dashboard", visibleTo: ["A"] }] }] },
    permissions: [{ role: "A", model: "f1", level: "Editable", scope: "all" }] }).some((i) => i.code === "NAV_DANGLING_PAGE"));
// #5 perm model slug/casing: permission model "purchase-order" resolves form {id:PurchaseOrder,name:Purchase Order}.
ok("gate: permission model match is case/separator-insensitive (purchase-order ↔ Purchase Order)",
  !checkGateIR({ roles: [{ name: "A" }], forms: [{ id: "PurchaseOrder", name: "Purchase Order" }], pages: [{ name: "Home", landing: true }],
    nav: { menus: [{ submenus: [{ name: "Home", page: "Home", visibleTo: ["A"] }] }] },
    permissions: [{ role: "A", model: "purchase-order", level: "Editable", scope: "all" }] }).some((i) => i.code === "PERM_UNKNOWN_MODEL"));
// #2 dotted field name: an in-scope edit to a field literally named "Est. Cost" must NOT be blocked.
{
  const live = { forms: [{ id: "Orders", fields: [{ id: "Amount", name: "Amount" }, { id: "Est. Cost", name: "Est. Cost" }] }] };
  const des = { forms: [{ id: "Orders", fields: [{ id: "Amount", name: "Amount" }, { id: "Est. Cost", name: "Est. Cost v2" }] }] };
  const r = validationGate(live, des, { scope: ["Orders"] });
  ok("validation-gate: dotted field name (Est. Cost) stays in scope under form scope", r.pass === true && r.changes.some((c) => c.id === "Orders.Est. Cost"));
}
// #3 substring scope over-match: scope "Order" must NOT admit an unrelated "OrderArchive" rewrite (fail OPEN).
{
  const live = { forms: [{ id: "Order", fields: [{ id: "q", name: "Q" }] }, { id: "OrderArchive", fields: [{ id: "q", name: "Q" }] }] };
  const des = { forms: [{ id: "Order", fields: [{ id: "q", name: "Q2" }] }, { id: "OrderArchive", fields: [{ id: "q", name: "Q2" }] }] };
  const r = validationGate(live, des, { scope: ["Order"] });
  ok("validation-gate: scope 'Order' blocks unrelated 'OrderArchive' change (no substring over-match)",
    r.pass === false && r.outOfScope.some((c) => c.id === "OrderArchive.q"));
}
// #6 bare Select-family: MultiSelect / DropdownList with no ReferredList also caught pre-publish.
{
  const bad = { Root: "m", m: { Id: "m", Kind: "Model", "Model::Field": ["a", "b", "c", "d"] },
    a: { Id: "a", Kind: "Field", Type: "MultiSelect", Name: "Tags" }, b: { Id: "b", Kind: "Field", Type: "DropdownList", Name: "Region" },
    c: { Id: "c", Kind: "Field", Type: "CheckList", Name: "Flags" }, d: { Id: "d", Kind: "Field", Type: "Select", Name: "S", ReferredList: "L" } };
  const codes = checkPublishInvariants(bad).filter((i) => i.code === "SELECT_NO_LIST").map((i) => i.msg);
  ok("publish-invariants: MultiSelect/DropdownList/CheckList bare selects all caught (not just Select)", codes.length === 3);
}
// engine #1 buildApp crash: a forms-only IR (no `lists` key) with an unwired Select must NOT throw.
{
  let threw = false, arts = 0;
  try { const r = buildApp({ app: { name: "X" }, roles: [{ name: "R" }], forms: [{ id: "f1", name: "F", fields: [{ name: "Priority", type: "Select", options: ["Hi", "Lo"] }] }] }); arts = r.artifacts.length; }
  catch { threw = true; }
  ok("buildApp: forms-only IR with an unwired Select builds a backing list (no crash on missing lists)", !threw && arts > 0);
}
// engine #6 import-live: aggregate QD reconstructs as {aggregate}, NOT a bogus {ref} on a non-ref type.
{
  const { formFromBlob } = await import("../import-live.mjs");
  const aggBlob = { Root: "M", M: { Id: "M", Name: "Inv", Kind: "Model", FlowType: "Form", "Model::Field": ["tot", "ven"] },
    tot: { Id: "tot", Name: "Total", Kind: "Field", Type: "Currency", "Field::QueryDefinition": ["qd1"] },
    ven: { Id: "ven", Name: "Vendor", Kind: "Field", Type: "Reference", "Field::QueryDefinition": ["qd2"] },
    qd1: { Id: "qd1", LHSModel: "LineItems", AggregateType: "Sum", AggregateField: "amt" },
    qd2: { Id: "qd2", LHSModel: "VendorMaster" } };
  const form = formFromBlob("inv", aggBlob);
  const tot = form.fields.find((f) => f.id === "tot"), ven = form.fields.find((f) => f.id === "ven");
  ok("import-live: aggregate QD → field.aggregate (no bogus ref on a Currency)", !tot.ref && tot.aggregate?.type === "Sum" && tot.aggregate.model === "LineItems");
  ok("import-live: lookup QD → field.ref (still reconstructs real references)", ven.ref === "VendorMaster" && !ven.aggregate);
}
// Tier-C 3a/transitions: buildBoard reads caseflow.statuses and honors designed transitions.
{
  const { buildBoard } = await import("../builders.mjs");
  const spec = { id: "tix", name: "Tickets", fields: [{ id: "title", name: "Title", type: "Text" }],
    caseflow: { statuses: [{ name: "Triage", category: "NotStarted" }, { name: "Working", category: "InProgress" }, { name: "Shipped", category: "Done" }],
      transitions: [{ from: "Triage", to: "Working" }, { from: "Working", to: "Shipped" }] } };
  const b = buildBoard(spec, "app_A00", {}, {});
  const statuses = Object.values(b.caseflow.blob).filter((e) => e.Kind === "Status");
  const names = statuses.map((s) => s.Name);
  ok("buildBoard: designed caseflow.statuses honored (not defaulted to To Do/In Progress/Done)",
    names.includes("Triage") && names.includes("Working") && names.includes("Shipped") && !names.includes("To Do"));
  const triage = statuses.find((s) => s.Name === "Triage"), working = statuses.find((s) => s.Name === "Working");
  const shipped = statuses.find((s) => s.Name === "Shipped");
  ok("buildBoard: designed transitions restrict outward moves (Triage→Working only)",
    triage.OutwardStatus.length === 1 && triage.OutwardStatus[0] === working.Id);
  ok("buildBoard: a status with no designed outward keeps free movement (Shipped never deadlocks)",
    shipped.OutwardStatus.length === statuses.length - 1);
}
// Tier-C 3d scope vocab: buildPermission normalizes my-items→my; dashboard viewId accepts "my".
{
  const { buildPermission } = await import("../builders.mjs");
  const p = buildPermission({ role: "R", model: "f1", level: "Editable", scope: "my-items" },
    { forms: [{ id: "f1", name: "F", fields: [] }] }, { f1: "f1_A00" }, { R: "Ro_R" });
  ok("buildPermission: scope 'my-items' canonicalized to 'my' (matches dashboard vocabulary)", p.blob[p.id].Scope === "my");
}
// Process queue tables must bind to the process's REAL saved view (`<id>_All_Items`), NOT a scope
// keyword (myitems/mytasks) — those don't resolve and the component fails "Unable to display component".
// view_id is built off the SAME genId as processId, so applyIR's gen→server remap resolves both together.
{
  const { buildPage } = await import("../builders.mjs");
  const fi = { fx: { genId: "fr-x-loan-app", flowType: "Process", fields: {} } };
  const findPT = (page) => { const out = []; (function w(n){ if(!n||typeof n!=="object")return; if(n.type==="ProcessTable")out.push(n); for(const v of Object.values(n)){ if(Array.isArray(v))v.forEach(w); else if(v&&typeof v==="object")w(v);} })(page.intermediate); return out; };
  const pt = findPT(buildPage({ name: "P", cards: [{ label: "Q", view: "action", source_flow: "fx", scope: "my-items" }] }, "App_A00", fi))[0];
  ok("buildPage: process queue seeds view_id 'myitems' (the view whose data the runtime serves)",
    pt.process.viewId === "myitems");
}
// fixProcessTables — after the transform, every process view/table must be rewritten to the golden
// myitems render shape ({view_id:"myitems", status:"all", showform}, no `steps`) or the runtime shows
// "Unable to display component". Simulate a transformed page blob and assert the rewrite.
{
  const { fixProcessTables } = await import("../client.mjs");
  const meta = {
    Comp_1: { Id: "Comp_1", Kind: "Component", Script: { web: "view/table" }, Container: "Cont_1",
      Data: { manifest_id: "Table", category: "view", visualization_type: "table", flow_type: "Process", flow_id: "Loan_App_A01", view_id: "mytasks" } },
    Cont_1: { Id: "Cont_1", Kind: "Container", Type: "Component", "Container::FieldMapping": ["FM_old"] },
    FM_old: { Id: "FM_old", Kind: "FieldMapping", Name: "steps", Container: "Cont_1", "FieldMapping::Property": ["P_old"] },
    P_old: { Id: "P_old", Kind: "Property", Type: "Value", Value: "all", FieldMapping: "FM_old" },
  };
  fixProcessTables(meta);
  ok("fixProcessTables: process table Data.view_id set to 'myitems'", meta.Comp_1.Data.view_id === "myitems");
  const fms = (meta.Cont_1["Container::FieldMapping"] || []).map((id) => [meta[id].Name, meta[meta[id]["FieldMapping::Property"][0]].Value]);
  const byName = Object.fromEntries(fms);
  ok("fixProcessTables: FieldMappings are the golden myitems shape (status:all, no steps)",
    byName.view_id === "myitems" && byName.status === "all" && byName.showform === true && !("steps" in byName) && byName.flow_id === "Loan_App_A01");
  ok("fixProcessTables: the stale 'steps' FieldMapping entity was removed", !meta.FM_old && !meta.P_old);
}
// normalizeIR — resilience: agents sometimes leave roles in architecture.roles and the permission
// matrix in security.roles (design shape); buildApp reads ONLY top-level roles[]/permissions[]. Lift them.
{
  const { normalizeIR } = await import("../builders.mjs");
  const ir = {
    app: { name: "X" },
    architecture: { roles: [{ id: "rm", name: "Relationship Manager" }, { id: "ca", name: "Credit Analyst" }] },
    forms: [{ id: "loan-app", name: "Loan Application" }, { id: "borrower", name: "Borrower" }],
    security: { roles: {
      rm: { flows: { "loan-app": { scope: "my-items", steps: { create: "Create", edit: "Edit", view: "View" } }, "borrower": { scope: "all", steps: { view: "View" } } } },
      ca: { flows: { "loan-app": { scope: "my-team", steps: { view: "View" } } } },
    } },
  };
  normalizeIR(ir);
  ok("normalizeIR: lifts architecture.roles → top-level roles[]", ir.roles.length === 2 && ir.roles[0].name === "Relationship Manager");
  ok("normalizeIR: derives permissions[] from security.roles matrix", ir.permissions.length === 3);
  const rmLoan = ir.permissions.find((p) => p.role === "Relationship Manager" && p.model === "loan-app");
  ok("normalizeIR: an acting role → Editable with its scope", rmLoan.level === "Editable" && rmLoan.scope === "my-items");
  const rmBorrower = ir.permissions.find((p) => p.role === "Relationship Manager" && p.model === "borrower");
  ok("normalizeIR: a view-only role → ReadOnly", rmBorrower.level === "ReadOnly");
  // no-op when engine shape already present
  const eng = { roles: [{ id: "a", name: "A" }], permissions: [{ role: "A", model: "f", level: "Editable", scope: "all" }], architecture: { roles: [{ id: "z", name: "Z" }] } };
  normalizeIR(eng);
  ok("normalizeIR: no-op when top-level roles/permissions already present", eng.roles.length === 1 && eng.roles[0].name === "A" && eng.permissions.length === 1);

  // ── the DESIGN-SHAPE branch (data_model.flows → lower()) must LIFT, never overwrite or truncate ──
  // Every loss below shipped a working-looking build: exit 0, "N artifacts, 0 errors", and an app
  // missing the thing. They are pinned per-loss so a regression names itself.
  const design = () => ({
    architecture: {
      app_name: "Payer Ops",
      roles: [{ id: "rep", name: "Member Services Rep" }],
      flows: [
        { id: "fr-01-member", name: "HP Member", type: "Form" },
        { id: "fr-02-appeal", name: "HP Appeal", type: "Case" },
        { id: "fr-46-specialty", name: "HP Provider Specialty", type: "List" },
      ],
    },
    data_model: { flows: {
      "fr-01-member": {
        fields: [
          { id: "gender", name: "Gender", type: "Select", options: ["Male", "Female", "Other"] },
          { id: "tier", name: "Tier", type: "Text", default: "Standard" },
          { id: "spec", name: "Specialty", type: "Select", options_from: "HP Provider Specialty" },
        ],
        child_tables: [{ id: "ct-dep", name: "Dependents", fields: [{ id: "dname", name: "Dependent Name", type: "Text" }] }],
      },
      "fr-02-appeal": { fields: [{ id: "reason", name: "Reason", type: "Text" }] },
      "fr-46-specialty": { items: ["Cardiology", "Oncology"] },
    } },
    workflow: { cases: { "fr-02-appeal": { statuses: [{ id: "open", name: "Open" }, { id: "shut", name: "Closed" }], transitions: [{ from: "open", to: "shut" }] } } },
    security: { roles: { rep: { flows: { "fr-01-member": { scope: "all", role_capability: "Create,Edit,View", steps: {} } } } } },
    experience: { pages: [{ id: "p1", name: "Member Desk", role: "rep" }], nav: { menus: [{ role: "rep", items: [{ label: "Members", page: "p1" }] }] } },
  });
  const d = normalizeIR(design());
  const member = (d.forms || []).find((f) => f.id === "fr-01-member");
  ok("normalizeIR/design: a Select keeps its own option set",
    (member.fields.find((x) => x.id === "gender").options || []).length === 3);
  ok("normalizeIR/design: a field keeps its default", member.fields.find((x) => x.id === "tier").default === "Standard");
  ok("normalizeIR/design: options_from resolves to the REAL list id, no empty phantom",
    member.fields.find((x) => x.id === "spec").referredList === "fr-46-specialty"
    && (d.lists || []).every((l) => (l.items || []).length) && (d.lists || []).every((l) => !/ /.test(l.id)));
  ok("normalizeIR/design: a child table becomes a sibling form tagged childOf (the shape buildApp reads)",
    (d.forms || []).some((f) => f.childOf === "fr-01-member" && (f.fields || []).length === 1));
  ok("normalizeIR/design: role_capability grants Editable — steps only exist on workflow flows",
    (d.permissions || []).find((p) => p.model === "fr-01-member").level === "Editable");
  ok("normalizeIR/design: the designed pages and nav survive (the early return dropped them)",
    (d.pages || []).length === 1 && ((d.nav || {}).menus || []).length === 1);
  ok("normalizeIR/design: a Case flow carries its designed statuses",
    ((d.forms || []).find((f) => f.id === "fr-02-appeal").caseflow || {}).statuses?.length === 2);
  ok("normalizeIR/design: the architecture's declared NAME wins over one invented from the id",
    member.name === "HP Member");

  // A hybrid IR — schema in data_model, permissions written by hand — must keep the hand-written ones.
  const hybrid = design(); hybrid.permissions = [{ role: "Member Services Rep", model: "fr-01-member", level: "Editable", scope: "all" }];
  delete hybrid.security;
  const h = normalizeIR(hybrid);
  ok("normalizeIR/design: an existing top-level permissions[] is never replaced by lower()'s reading",
    h.permissions.length === 1 && h.permissions[0].level === "Editable");

  // ── the experience lift reads BOTH spellings, and ensureExperience does not duplicate landings ───
  // A designed page names its audience as visibleTo[] or as a plain `role`, and marks itself landing
  // via experience.landing{} or its own flag. Reading only the first of each dropped both: all 170 of
  // health-payer's pages arrived role-less, ensureExperience saw 18 role-less roles and generated a
  // "<Role> Home" for each — and since only those carried the flag, every role's DefaultPage pointed
  // at a generated shell instead of the dashboard designed for it.
  const { ensureExperience } = await import("../experience.mjs");
  const withRole = {
    roles: [{ id: "rep", name: "Member Services Rep" }, { id: "dir", name: "Medical Director" }],
    forms: [{ id: "f1", name: "Member", flowType: "Form", fields: [{ id: "n", name: "Name", type: "Text" }] }],
    permissions: [{ role: "Member Services Rep", model: "f1", level: "Editable", scope: "all" },
      { role: "Medical Director", model: "f1", level: "Editable", scope: "all" }],
    experience: { pages: [
      { name: "Member Desk", role: "rep", landing: true, cards: [] },      // role stated directly, by ID
      { name: "Clinical Review", visibleTo: ["dir"], dashboard: true, cards: [] },  // …and the other spelling
    ] },
  };
  const w = normalizeIR(withRole);
  ok("normalizeIR: a page's `role` is honoured, not just visibleTo[]", w.pages.find((p) => p.name === "Member Desk").role === "Member Services Rep");
  ok("normalizeIR: a page's own landing/dashboard flag survives the lift",
    w.pages.every((p) => p.landing || p.dashboard));
  const addedNow = ensureExperience(w).added.filter((a) => a.startsWith("page:"));
  ok("ensureExperience: a role with a designed landing gets no synthetic Home beside it", addedNow.length === 0, addedNow.join(", "));

  // …and when a role's pages exist but none is flagged, the first is PROMOTED rather than duplicated.
  const unflagged = { roles: [{ id: "ops", name: "Ops Lead" }], forms: [{ id: "f1", name: "Job", flowType: "Form", fields: [] }],
    permissions: [{ role: "Ops Lead", model: "f1", level: "Editable", scope: "all" }],
    pages: [{ name: "Ops Console", role: "ops", cards: [] }] };
  const u = normalizeIR(unflagged);
  const uAdded = ensureExperience(u).added;
  ok("ensureExperience: an unflagged designed page becomes the landing instead of a new Home",
    u.pages.length === 1 && u.pages[0].landing === true && !uAdded.some((a) => a.startsWith("page:")), JSON.stringify(uAdded));

  // ── the validator must look where the BUILDER looks ─────────────────────────────────────────────
  const { validateIR } = await import("../ir.mjs");
  const caseIr = { app: { name: "X", id: "X_A00" }, roles: [{ id: "r", name: "R" }],
    forms: [{ id: "c1", name: "Appeal", flowType: "Case", fields: [{ id: "a", name: "A", type: "Text" }],
      caseflow: { statuses: [{ name: "Open" }, { name: "Closed" }], transitions: [{ from: "Open", to: "Closed" }] } }],
    permissions: [{ role: "R", model: "c1", level: "Editable", scope: "all" }] };
  ok("validateIR: a Case's statuses count when they arrive under caseflow (where buildBoard reads them)",
    !validateIR(caseIr).issues.some((i) => i.code === "CASE_NO_STATUSES"));
  const selIr = { app: { name: "X", id: "X_A00" }, roles: [{ id: "r", name: "R" }],
    forms: [{ id: "f1", name: "F", flowType: "Form", fields: [{ id: "s", name: "Status", type: "Select", options: ["A", "B"] }] }],
    permissions: [{ role: "R", model: "f1", level: "Editable", scope: "all" }] };
  ok("validateIR: a Select carrying its own options needs no list — buildForm mints one from them",
    !validateIR(selIr).issues.some((i) => i.code === "SELECT_NO_LIST"));

  // ── window.PAGES is judged per ASSIGNMENT, not per file ──────────────────────────────────────────
  // The rule tested the whole part body, so ONE correct line vouched for every incorrect one below it
  // — and it missed three spellings while failing the build on a correct guarded init.
  const { pagesAssignments } = await import("../proto-verify.mjs");
  const verdict = (code) => { const k = pagesAssignments(code).map((x) => x.kind);
    return k.includes("clobber") ? "clobber" : k.includes("dropped") ? "dropped" : "safe"; };
  ok("PAGES: a clobber below the correct idiom is still caught",
    verdict("window.PAGES = window.PAGES || {}; Object.assign(window.PAGES,{a:1});\nwindow.PAGES = { b: 2 };") === "clobber");
  ok("PAGES: the correct idiom passes", verdict("window.PAGES = window.PAGES || {}; Object.assign(window.PAGES,{a:1});") === "safe");
  ok("PAGES: a guarded init passes — it preserves an existing map",
    verdict("if (!window.PAGES) window.PAGES = {};\nObject.assign(window.PAGES,{a:1});") === "safe");
  ok("PAGES: ||= with empty braces passes, with a map is DROPPED",
    verdict("window.PAGES ||= {};") === "safe" && verdict("window.PAGES ||= { a: 1 };") === "dropped");
  ok("PAGES: window[\"PAGES\"] and globalThis.PAGES clobber just as thoroughly",
    verdict('window["PAGES"] = { a: 1 };') === "clobber" && verdict("globalThis.PAGES = { a: 1 };") === "clobber");
  ok("PAGES: the sneaky fallback map is DROPPED", verdict("window.PAGES = window.PAGES || { a: 1 };") === "dropped");
  ok("PAGES: an unguarded reset to {} is a clobber", verdict("window.PAGES = {};") === "clobber");
  // PAGES + NAV lift: experience.{pages,nav,landing} → top-level pages[]/nav, role IDs → names, landing flags
  const ir2 = {
    architecture: { roles: [{ id: "rm", name: "Relationship Manager" }] },
    forms: [{ id: "loan-app", name: "Loan Application" }],
    experience: {
      landing: { rm: "RM - Dashboard" },
      pages: [
        { name: "RM - Dashboard", visibleTo: ["rm"], cards: [{ label: "K", view: "kpi", source_flow: "loan-app" }] },
        { name: "Loan Application - My Requests", visibleTo: ["rm"], cards: [{ label: "Q", view: "action", source_flow: "loan-app" }] },
      ],
      nav: { menus: [{ name: "Home", submenus: [{ name: "Dashboard", page: "RM - Dashboard", visibleTo: ["rm"] }] }] },
    },
  };
  normalizeIR(ir2);
  ok("normalizeIR: lifts experience.pages → top-level pages[] with role IDs→names", ir2.pages.length === 2 && ir2.pages[0].role === "Relationship Manager");
  ok("normalizeIR: flags the role's landing page from experience.landing", ir2.pages.find((p) => p.name === "RM - Dashboard").landing === true);
  ok("normalizeIR: lifts experience.nav with visibleTo IDs→names", ir2.nav.menus[0].submenus[0].visibleTo[0] === "Relationship Manager");
  // WORKFLOW merge: top-level workflow.{processes,cases} (design shape, role IDs, on_complete graph) →
  // forms[].workflow.steps (ordered, actor=role NAME) + forms[].caseflow.
  const ir3 = {
    architecture: { roles: [{ id: "rm", name: "Relationship Manager" }, { id: "ca", name: "Credit Analyst" }] },
    forms: [{ id: "loan-app", name: "Loan Application", flowType: "Process", fields: [] }, { id: "coll", name: "Collections", flowType: "Case", fields: [] }],
    workflow: {
      processes: { "loan-app": { steps: [
        { id: "decision", name: "Decision", assignee_role: "ca", terminal: true },
        { id: "submit", name: "Submit", assignee_role: "rm", entry_condition: "start", on_complete: "review" },
        { id: "review", name: "Review", assignee_role: "ca", on_complete: "decision" },
      ] } },
      cases: { "coll": { statuses: [
        { id: "new", name: "New", is_initial: true, category: "open" },
        { id: "working", name: "Working", category: "open" },
        { id: "done", name: "Recovered", is_terminal: true, category: "closed" },
      ], transitions: [{ from: "new", to: "working" }, { from: "working", to: "done" }] } },
    },
  };
  normalizeIR(ir3);
  const wf = ir3.forms.find((f) => f.id === "loan-app").workflow;
  ok("normalizeIR: merges workflow.processes → forms[].workflow.steps, ordered by on_complete", wf.steps.map((s) => s.name).join(",") === "Submit,Review,Decision");
  ok("normalizeIR: workflow actor is the role NAME (not the id)", wf.steps[0].actor === "Relationship Manager" && wf.steps[1].actor === "Credit Analyst");
  const cf = ir3.forms.find((f) => f.id === "coll").caseflow;
  ok("normalizeIR: merges workflow.cases → forms[].caseflow with id→name transitions + categories",
    cf.statuses.length === 3 && cf.statuses[0].category === "NotStarted" && cf.statuses[2].category === "Closed" && cf.transitions[0].from === "New" && cf.transitions[0].to === "Working");
}
// Select auto-wire: a field with its OWN options must get its own app+form-scoped backing list, NOT be
// fuzzy-matched to a similarly-named list (the "Type" fields once landed on "Product Type"); and an
// auto-created backing list must be app-scoped so a generic name can't bind to a foreign app's flow.
{
  const ir = { app: { name: "Bank App" }, roles: [{ name: "R" }],
    lists: [{ id: "Product_Type_A00", name: "Product Type", items: ["Term", "Revolving"] }],
    forms: [
      { id: "borrower", name: "Borrower", fields: [{ name: "Type", type: "Select", options: ["Corporate", "SME"] }] },
      { id: "fees", name: "Fees", fields: [{ name: "Type", type: "Select", options: ["Processing", "Late"] }] },
      { id: "gl", name: "GL", fields: [{ name: "Category", type: "Select" }] },
    ] };
  buildApp(ir);
  const ref = (fid, fn) => ir.forms.find((f) => f.id === fid).fields.find((x) => x.name === fn).referredList;
  ok("select-wire: a field with its own options is NOT fuzzy-matched to the similarly-named 'Product Type' list",
    ref("borrower", "Type") !== "Product Type" && ref("borrower", "Type") !== "Product_Type_A00");
  ok("select-wire: two 'Type' fields with different options get SEPARATE backing lists",
    ref("borrower", "Type") !== ref("fees", "Type"));
  ok("select-wire: the backing list keeps the field's OWN options",
    JSON.stringify(ir.lists.find((l) => l.id === ref("borrower", "Type")).items) === JSON.stringify(["Corporate", "SME"]));
  ok("select-wire: an auto-created backing list id is app-scoped (no foreign-app collision)",
    /^Bank_App_/.test(ref("gl", "Category")));
}
// checkGateIR + validateIR: a permission (or reference) may target a reference LIST, not only a form —
// must not false-flag PERM_UNKNOWN_MODEL / PERM_MODEL_MISSING on a list model.
{
  const irL = { roles: [{ id: "r", name: "R" }], forms: [{ id: "f1", name: "F" }], lists: [{ id: "list-currency", name: "Currency" }],
    pages: [{ name: "H", landing: true }], nav: { menus: [{ submenus: [{ name: "H", page: "H", visibleTo: ["R"] }] }] },
    permissions: [{ role: "R", model: "list-currency", level: "ReadOnly", scope: "all" }] };
  ok("gate: a permission on a reference LIST is not PERM_UNKNOWN_MODEL", !checkGateIR(irL).some((i) => i.code === "PERM_UNKNOWN_MODEL"));
  ok("validateIR: a permission on a reference LIST is not PERM_MODEL_MISSING", !validateIR(irL).issues.some((i) => i.code === "PERM_MODEL_MISSING"));
}


// ── STEP CONDITIONS (LESSONS §11 — first-class in the IR) + PATCH mutators (the fast-edit layer) ──
{
  const { mutCondition, mutStepPermission, mutFieldType, mutAddField, mutAddStep, mutBranch, negateCondition, mutStepActor, mutFormula, mutRename, mutFieldSet, mutParallel } = await import("../patch.mjs");
  const condIR = { app: { name: "Capex" }, roles: [{ name: "CFO" }, { name: "CEO" }, { name: "Council" }],
    forms: [{ name: "Capex Request", flowType: "Process", fields: [
      { name: "Title", type: "Text", required: true }, { name: "Capex Value", type: "Number", required: true } ],
      workflow: { steps: [
        { name: "Submit" }, { name: "CFO Sign-off", actor: "CFO" },
        { name: "CEO Approval", actor: "CEO", condition: "Capex_Value > 500000" },
        { name: "Council Approval", actor: "Council", condition: "Capex_Value <= 500000" },
        { name: "End" } ] } }] };
  const vc = validateIR(condIR);
  ok("condition: IR with step conditions validates clean", vc.ok && !vc.issues.some((i) => i.level === "error"));
  const badTerm = JSON.parse(JSON.stringify(condIR)); badTerm.forms[0].workflow.steps[0].condition = "Capex_Value > 1";
  ok("condition: condition on the START step is an ERROR", validateIR(badTerm).issues.some((i) => i.code === "STEP_CONDITION_TERMINAL"));
  const badTok = JSON.parse(JSON.stringify(condIR)); badTok.forms[0].workflow.steps[2].condition = "Nonexistent_Field > 1";
  ok("condition: unknown field token WARNS (would build unconditional)", validateIR(badTok).issues.some((i) => i.code === "STEP_CONDITION_FIELD_MISSING"));

  const capp = buildApp(condIR);
  const cblob = capp.artifacts.find((x) => x.id === "capex-request" || x.type === "process")?.blob || capp.artifacts.find((x) => x.blob)?.blob;
  const acts = Object.values(cblob).filter((e) => e && e.Kind === "Activity");
  const ceo = acts.find((a) => a.Name === "CEO Approval"), council = acts.find((a) => a.Name === "Council Approval");
  ok("condition: CEO step carries Activity::Expression", Array.isArray(ceo?.["Activity::Expression"]) && ceo["Activity::Expression"].length === 1);
  const ex = cblob[ceo["Activity::Expression"][0]];
  const root = cblob[(ex?.["Expression::Node"] || [])[0]];
  ok("condition: AST root is '>' comparison, Category Boolean, backref to the Activity", ex?.Activity === ceo.Id && root?.Value === ">" && root?.Category === "Boolean" && root?.Syntax === "Infix");
  const leftLeaf = cblob[(root?.["Node::Node"] || [])[0]];
  ok("condition: left operand resolves to the Capex Value FIELD node", leftLeaf?.Type === "Field" && String(cblob[leftLeaf.Field]?.Name) === "Capex Value");
  ok("condition: Council step has its own (<=) expression", Boolean(council?.["Activity::Expression"]) && cblob[cblob[council["Activity::Expression"][0]]["Expression::Node"][0]]?.Value === "<=");
  ok("condition: unconditional steps carry NO expression", !acts.find((a) => a.Name === "CFO Sign-off")["Activity::Expression"]);

  // draft hygiene — the corruption classes that make the builder UI unable to delete (Store_Launch)
  const { checkHygiene } = await import("../validators.mjs");
  const hb = JSON.parse(JSON.stringify(cblob));
  ok("hygiene: clean draft passes", checkHygiene(hb).filter((i) => i.level === "error").length === 0);
  const hAct = Object.values(hb).find((e) => e && e.Kind === "Activity" && e["Activity::Permission"]?.length);
  const hCol = hb[hAct["Activity::Permission"][0]].Column;
  hb["Permission_hygdupe"] = { Id: "Permission_hygdupe", Kind: "Permission", Column: hCol, Permission: "Hidden", Activity: hAct.Id };
  hb[hCol]["Column::Permission"] = ["Permission_ghost2"];
  const hyg = checkHygiene(hb);
  ok("hygiene: duplicate (activity,column) permission → DUPLICATE_STEP_PERMISSION error", hyg.some((i) => i.code === "DUPLICATE_STEP_PERMISSION"));
  ok("hygiene: stale Column::Permission back-ref → STALE_COLUMN_PERM_REF error", hyg.some((i) => i.code === "STALE_COLUMN_PERM_REF"));
  // cross-model reference filter (child QD condition comparing against a parent-model field)
  const xb = { M1: { Id: "M1", Kind: "Model" }, M2: { Id: "M2", Kind: "Model" },
    PF: { Id: "PF", Kind: "Field", Model: "M1", Name: "City Parent" },
    CF: { Id: "CF", Kind: "Field", Model: "M2", Name: "Area Ref" },
    QD: { Id: "QD", Kind: "QueryDefinition", Field: "CF", "QueryDefinition::Criteria": ["CR"] },
    CR: { Id: "CR", Kind: "Criteria" },
    CO: { Id: "CO", Kind: "Condition", Criteria: "CR", RHSType: "Field", RHSField: "PF", LHSField: "City" } };
  ok("hygiene: child-table filter against a parent field → CROSS_MODEL_REF_FILTER warn", checkHygiene(xb).some((i) => i.code === "CROSS_MODEL_REF_FILTER"));

  // step-permission stub: update-in-place + dedupe + section addressing (Store_Launch corruption class)
  const { mutDedupePermissions } = await import("../patch.mjs");
  const cfo = acts.find((a) => a.Name === "CFO Sign-off");
  const titleCol = Object.values(cblob).find((e) => e && e.Kind === "Field" && e.Name === "Title").Column;
  // recreate the corruption: append a duplicate Permission for the same (activity, column) + a back-ref
  cblob["Permission_dupetest1"] = { Id: "Permission_dupetest1", Kind: "Permission", Column: titleCol, Permission: "Hidden", Activity: cfo.Id };
  cfo["Activity::Permission"].push("Permission_dupetest1");
  cblob[titleCol]["Column::Permission"] = ["Permission_dupetest1", "Permission_ghost_dangling"];
  const spRes = mutStepPermission(cblob, "CFO Sign-off", "Title", "Editable");
  const titlePerms = cfo["Activity::Permission"].map((id) => cblob[id]).filter((p) => p && p.Column === titleCol);
  ok("step-permission: dedupes pre-existing duplicates and updates IN PLACE", spRes.dedupedDuplicates === 1 && titlePerms.length === 1 && titlePerms[0].Permission === "Editable");
  ok("step-permission: cleans dangling Column::Permission back-refs", !(cblob[titleCol]["Column::Permission"] || []).includes("Permission_ghost_dangling"));
  ok("step-permission: never re-appends — a second call keeps ONE entity", (mutStepPermission(cblob, "CFO Sign-off", "Title", "Hidden"), cfo["Activity::Permission"].map((id) => cblob[id]).filter((p) => p && p.Column === titleCol).length === 1));
  const secRes = mutStepPermission(cblob, "CFO Sign-off", "Details", "Hidden");
  const secCol2 = Object.values(cblob).find((e) => e && e.Kind === "Column" && e.Type === "Section" && e.Name === "Details");
  ok("step-permission: addresses a SECTION by name", secRes.field === "Details" && cfo["Activity::Permission"].map((id) => cblob[id]).some((p) => p && p.Column === secCol2.Id && p.Permission === "Hidden"));
  // whole-draft repair verb
  cblob["Permission_dupetest2"] = { Id: "Permission_dupetest2", Kind: "Permission", Column: titleCol, Permission: "ReadOnly", Activity: cfo.Id };
  cfo["Activity::Permission"].push("Permission_dupetest2");
  const rep = mutDedupePermissions(cblob);
  ok("dedupe-permissions: whole-draft repair removes duplicates (newest value wins)", rep.removedDuplicates === 1 && cfo["Activity::Permission"].map((id) => cblob[id]).filter((p) => p && p.Column === titleCol).length === 1 && cfo["Activity::Permission"].map((id) => cblob[id]).find((p) => p && p.Column === titleCol).Permission === "ReadOnly");

  // patch mutators — same graph, applied "live-style" onto the built blob
  const pblob = JSON.parse(JSON.stringify(cblob));
  const pc = mutCondition(pblob, "CFO Sign-off", "Capex_Value > 0");
  ok("patch condition: grafts an expression onto an existing step", Boolean(pblob[pc.expression]) && pblob[findAct(pblob, "CFO Sign-off")]["Activity::Expression"][0] === pc.expression);
  let threw = null; try { mutCondition(pblob, "Submit", "Capex_Value > 1"); } catch (e) { threw = e.message; }
  ok("patch condition: refuses Start/End steps", /middle/.test(threw || ""));
  const ft = mutFieldType(pblob, "Title", "Textarea");
  ok("patch field-type: rewrites Type in place", ft.was === "Text" && Object.values(pblob).find((e) => e?.Kind === "Field" && e.Name === "Title").Type === "Textarea");
  const af = mutAddField(pblob, { name: "Justification", type: "Text" });
  ok("patch add-field: field + layout column + a permission on EVERY step", af.stepPermissions === 5 &&
    Object.values(pblob).filter((e) => e?.Kind === "Permission" && e.Column === af.column).length === 5);
  const as = mutAddStep(pblob, { name: "Audit Review", roleId: "Ro_x", roleName: "Auditor", after: "CFO Sign-off", condition: "Capex_Value > 1000000" });
  const pd = Object.values(pblob).find((e) => e?.Kind === "ProcessDef");
  ok("patch add-step: inserted after CFO with permissions + condition", pd["ProcessDef::Activity"][as.position] === findAct(pblob, "Audit Review") && Boolean(pblob[findAct(pblob, "Audit Review")]["Activity::Expression"]));
  function findAct(b, n) { return Object.values(b).find((e) => e?.Kind === "Activity" && e.Name === n)?.Id; }

  // add-field with a REFERENCE (QueryDefinition wired, target flow type honoured) and a SELECT (list)
  const rf = mutAddField(pblob, { name: "Vendor", type: "Reference", ref: "Vendor_A33", refType: "Form" });
  const rfField = Object.values(pblob).find((e) => e?.Kind === "Field" && e.Name === "Vendor");
  const rfQd = pblob[(rfField["Field::QueryDefinition"] || [])[0]];
  ok("patch add-field(ref): QueryDefinition wired to the live target id + flow type", rfQd?.LHSModel === "Vendor_A33" && rfQd?.FlowType === "Form" && rf.stepPermissions >= 5);
  mutAddField(pblob, { name: "Priority", type: "Select", referredList: "Priority_List_A00" });
  ok("patch add-field(select): ReferredList carried verbatim (live list id)", Object.values(pblob).find((e) => e?.Kind === "Field" && e.Name === "Priority")?.ReferredList === "Priority_List_A00");

  // branch: two mutually-exclusive conditional steps in one mutation, else-arm auto-negated
  ok("negateCondition: > flips to <=, compound refuses", negateCondition("Capex_Value > 500000") === "Capex_Value <= 500000" && negateCondition("A > 1 AND B < 2") === null);
  const br = mutBranch(pblob, { after: "CFO Sign-off", on: "Capex_Value > 1000000",
    then: { name: "Board Approval", roleId: "Ro_ceo", roleName: "Board" }, otherwise: { name: "Committee Approval", roleId: "Ro_cl", roleName: "Committee" } });
  const ceoA = pblob[findAct(pblob, "Board Approval")], clA = pblob[findAct(pblob, "Committee Approval")];
  const condOf = (act) => pblob[act["Activity::Expression"][0]].ExpressionStr;
  ok("patch branch: both arms inserted with complementary conditions + assignees",
    condOf(ceoA) === "Capex_Value > 1000000" && condOf(clA) === "Capex_Value <= 1000000" &&
    pblob[ceoA["Activity::Resource"][0]].Value === "Ro_ceo" && br.positions[1] === br.positions[0] + 1);

  // second-wave verbs: reassign approver, formula swap, rename, generic props
  const sa = mutStepActor(pblob, "CFO Sign-off", "Ro_new", "VP Finance");
  ok("patch step-actor: reassigns the approver in place", sa.now === "VP Finance" && pblob[pblob[findAct(pblob, "CFO Sign-off")]["Activity::Resource"][0]].Value === "Ro_new");
  mutFormula(pblob, "Capex Value", "1 + 1");
  const cvField = Object.values(pblob).find((e) => e?.Kind === "Field" && e.Name === "Capex Value");
  ok("patch formula: sets an Expression on an existing field", Boolean(cvField["Field::Expression"]) && pblob[cvField["Field::Expression"][0]].ExpressionStr === "1 + 1");
  mutFormula(pblob, "Capex Value", "");
  ok("patch formula: empty formula removes the Expression cleanly", !cvField["Field::Expression"] && !Object.values(pblob).some((e) => e?.Kind === "Expression" && e.Field === cvField.Id));
  const rn = mutRename(pblob, "field", "Title", "Request Title");
  ok("patch rename: label changes, id stays stable", rn.was === "Title" && Object.values(pblob).find((e) => e?.Kind === "Field" && e.Id === rn.field).Name === "Request Title");
  const fs2 = mutFieldSet(pblob, "Request Title", { Required: "false" });
  ok("patch field-set: Required toggled off", fs2.Required === false);

  // PARALLEL — first-class IR build, golden shape (Vashi_Setup_Operations)
  const parIR = JSON.parse(JSON.stringify(condIR));
  parIR.roles.push({ name: "Warehouse Head" }, { name: "HR" });
  parIR.forms[0].workflow.steps.splice(2, 2, { name: "Setup Fork", branches: [
    { name: "Warehouse Readiness", actor: "Warehouse Head" },
    { name: "Branch Head Hiring", steps: [{ name: "Branch Head Hiring", actor: "HR", condition: "Capex_Value > 100" }] } ] });
  ok("parallel: IR with a branches step validates clean", validateIR(parIR).issues.every((i) => i.level !== "error"));
  const badPar = JSON.parse(JSON.stringify(parIR)); badPar.forms[0].workflow.steps[2].branches = [{ name: "only one" }];
  ok("parallel: <2 branches is an ERROR", validateIR(badPar).issues.some((i) => i.code === "STEP_BRANCHES_TOO_FEW"));
  const papp = buildApp(parIR);
  const pb = papp.artifacts.find((x) => x.blob && Object.values(x.blob).some((e) => e?.NodeType === "Parallel"))?.blob;
  const par = Object.values(pb).find((e) => e?.NodeType === "Parallel");
  ok("parallel: golden node shape — Parallel activity with NO permissions, 2 branch PDs", par && !par["Activity::Permission"] && par["Activity::ProcessDef"].length === 2);
  const bpd = pb[par["Activity::ProcessDef"][0]];
  ok("parallel: branch ProcessDef is MINIMAL (Name + Activity backref, no WorkflowType/Model)", bpd.Kind === "ProcessDef" && bpd.Activity === par.Id && !bpd.WorkflowType && !bpd.Model);
  const inner = pb[bpd["ProcessDef::Activity"][0]];
  ok("parallel: inner step is a full UserTask (perms + assignee)", inner.NodeType === "UserTask" && inner["Activity::Permission"].length > 0 && Boolean(inner["Activity::Resource"]));
  const inner2 = pb[pb[par["Activity::ProcessDef"][1]]["ProcessDef::Activity"][0]];
  ok("parallel: branch inner steps can carry CONDITIONS too", Boolean(inner2["Activity::Expression"]));
  const rootPd = pb[par.ProcessDef];
  ok("parallel: fork sits inline in the parent order (auto-join = next sibling)", rootPd["ProcessDef::Activity"].includes(par.Id));

  // patch mutParallel on a live-style blob
  const lp = mutParallel(pblob, { after: "Audit Review", branches: [
    { name: "Legal Review", roleId: "Ro_l", roleName: "Legal" }, { name: "Compliance Review", roleId: "Ro_c", roleName: "Compliance" } ] });
  const lpar = Object.values(pblob).find((e) => e?.NodeType === "Parallel");
  ok("patch parallel: fork grafted with both arms + assignees at the right spot", lp.arms.length === 2 && lpar["Activity::ProcessDef"].length === 2 &&
    pblob[pblob[lpar["Activity::ProcessDef"][0]]["ProcessDef::Activity"][0]]["Activity::Resource"] !== undefined &&
    Object.values(pblob).find((e) => e?.Kind === "ProcessDef" && e.WorkflowType === "Sequence")["ProcessDef::Activity"][lp.position] === lpar.Id);
}


// ── ai-page stub resolve: a chart with no report is dropped, its neighbours are not ──────────────
// A ChartReport needs a report to point at. Forms usually have none, and the generator puts charts on
// them anyway — shipping report_id:"" and a widget that renders "Configure the component with a
// relevant flow to view your data". It must go, and ONLY it: the table beside it shares the flow.
{
  const { resolveAiPageStubs } = await import("../ai-page-builder.mjs");
  const fm = (id, name, cont, val) => ({
    [id]: { Id: id, Kind: "FieldMapping", Name: name, Container: cont, "FieldMapping::Property": [id + "_p"] },
    [id + "_p"]: { Id: id + "_p", Kind: "Property", Type: "Value", Value: val, FieldMapping: id },
  });
  const meta = {
    Body: { Id: "Body", Kind: "Container", Type: "Body", "Container::Component": ["ChartC", "TableC"], "Container::Container": ["CBox", "TBox"] },
    CBox: { Id: "CBox", Kind: "Container", "Container::FieldMapping": ["c1", "c2"] },
    TBox: { Id: "TBox", Kind: "Container", "Container::FieldMapping": ["t1", "t2"] },
    ChartC: { Id: "ChartC", Kind: "Component", Script: { web: "report/chart" }, Container: "CBox", Data: { category: "report", flow_id: "Class_9x", report_id: "" } },
    TableC: { Id: "TableC", Kind: "Component", Script: { web: "view/table" }, Container: "TBox", Data: { category: "view", flow_id: "Class_9x", view_id: "myitems" } },
    ...fm("c1", "flow_id", "CBox", "Class_9x"), ...fm("c2", "report_id", "CBox", ""),
    ...fm("t1", "flow_id", "TBox", "Class_9x"), ...fm("t2", "view_id", "TBox", "myitems"),
  };
  // formviewId present: the table must survive AND rebind to it (a Form table is a formview consumer —
  // "myitems" renders "Unable to display component" on dataforms; live-verified PulseFit 2026-07-31)
  const cat = [{ id: "Class_A00", name: "Class", type: "Form", family: "form", reportId: "", formviewId: "Class_View_A00", key: "class" }];
  resolveAiPageStubs(meta, cat);
  ok("ai-page: a report widget whose flow has no report is dropped", !meta.ChartC && !meta.CBox && !meta.c2);
  ok("ai-page: the table sharing that flow survives, rebound to the FORMVIEW",
    !!meta.TableC && meta.TableC.Data.flow_id === "Class_A00" && meta.TableC.Data.view_id === "Class_View_A00" && meta.t2_p.Value === "Class_View_A00");
  ok("ai-page: the dropped widget is unlinked from its parent",
    !(meta.Body["Container::Component"] || []).includes("ChartC") && !(meta.Body["Container::Container"] || []).includes("CBox"));
}

// ── ai-page stub resolve: a Form table with NO formview available is dropped, not shipped broken ──
{
  const { resolveAiPageStubs } = await import("../ai-page-builder.mjs");
  const fm = (id, name, cont, val) => ({
    [id]: { Id: id, Kind: "FieldMapping", Name: name, Container: cont, "FieldMapping::Property": [id + "_p"] },
    [id + "_p"]: { Id: id + "_p", Kind: "Property", Type: "Value", Value: val, FieldMapping: id },
  });
  const meta = {
    Body: { Id: "Body", Kind: "Container", Type: "Body", "Container::Component": ["TableC"], "Container::Container": ["TBox"] },
    TBox: { Id: "TBox", Kind: "Container", "Container::FieldMapping": ["t1", "t2"] },
    TableC: { Id: "TableC", Kind: "Component", Script: { web: "view/table" }, Container: "TBox", Data: { category: "view", flow_id: "Class_9x", view_id: "myitems" } },
    ...fm("t1", "flow_id", "TBox", "Class_9x"), ...fm("t2", "view_id", "TBox", "myitems"),
  };
  const cat = [{ id: "Class_A00", name: "Class", type: "Form", family: "form", reportId: "", formviewId: "", key: "class" }];
  resolveAiPageStubs(meta, cat);
  ok("ai-page: a Form table with no formview to bind is dropped", !meta.TableC && !meta.TBox);
}

// ── ai-page stub resolve: an unsupported widget is dropped BY ID, never by the flow's name ────────
// `unmatched` feeds a raw JSON-substring delete sweep. That is only safe while its members are
// hallucinated stubs — strings that appear nowhere in real content. Putting a MATCHED Case flow's
// name in it made the sweep delete every entity whose JSON merely contained that name: with a Case
// flow called "Grievance" it deleted the Page itself ("Appeals & Grievance Analyst Dashboard"), a
// Process table titled "Claims linked to Grievance" and a heading — and published the remains.
{
  const { resolveAiPageStubs } = await import("../ai-page-builder.mjs");
  const fm = (id, name, cont, val) => ({
    [id]: { Id: id, Kind: "FieldMapping", Name: name, Container: cont, "FieldMapping::Property": [id + "_p"] },
    [id + "_p"]: { Id: id + "_p", Kind: "Property", Type: "Value", Value: val, FieldMapping: id },
  });
  const meta = {
    Page: { Id: "Page", Kind: "Page", Name: "Appeals & Grievance Analyst Dashboard", Body: ["Body"] },
    Body: { Id: "Body", Kind: "Container", Type: "Body", "Container::Container": ["CaseBox", "ProcBox", "ChartBox", "HeadBox"] },
    // a table on a Case flow — genuinely unsupported, and the ONLY thing that may be dropped
    CaseBox: { Id: "CaseBox", Kind: "Container", Container: "Body" },
    CaseC: { Id: "CaseC", Kind: "Component", Container: "CaseBox", Data: { category: "view", flow_id: "Grievance", view_id: "myitems" } },
    ...fm("g1", "flow_id", "CaseBox", "Grievance"), ...fm("g2", "view_id", "CaseBox", "myitems"),
    // an unrelated PROCESS table whose title happens to contain the word
    ProcBox: { Id: "ProcBox", Kind: "Container", Container: "Body", Name: "Claims linked to Grievance" },
    ProcC: { Id: "ProcC", Kind: "Component", Container: "ProcBox", Data: { category: "view", flow_id: "Claim", view_id: "myitems" } },
    ...fm("c1", "flow_id", "ProcBox", "Claim"), ...fm("c2", "view_id", "ProcBox", "myitems"),
    // a CHART on the Case flow: the catalog fetches reports for the case family so this one binds
    ChartBox: { Id: "ChartBox", Kind: "Container", Container: "Body" },
    ChartC: { Id: "ChartC", Kind: "Component", Container: "ChartBox", Data: { category: "report", flow_id: "Grievance", report_id: "" } },
    ...fm("r1", "flow_id", "ChartBox", "Grievance"), ...fm("r2", "report_id", "ChartBox", ""),
    // plain copy that says the word
    HeadBox: { Id: "HeadBox", Kind: "Container", Container: "Body" },
    HeadP: { Id: "HeadP", Kind: "Property", Container: "HeadBox", Value: "Open Grievance Volume" },
  };
  const cat = [
    { id: "Grievance_A00", name: "Grievance", type: "Case", family: "case", reportId: "rep_g", formviewId: "", key: "grievance" },
    { id: "Claim_A00", name: "Claim", type: "Process", family: "process", reportId: "rep_c", formviewId: "", key: "claim" },
  ];
  resolveAiPageStubs(meta, cat);
  ok("ai-page: the Case TABLE is dropped (it cannot render)", !meta.CaseBox && !meta.CaseC);
  ok("ai-page: the PAGE is not deleted because its name contains a flow name", !!meta.Page);
  ok("ai-page: an unrelated widget is not deleted for mentioning a flow name", !!meta.ProcBox && !!meta.ProcC);
  ok("ai-page: plain copy mentioning a flow name survives", !!meta.HeadP);
  ok("ai-page: a Case CHART still binds — the table limit is about tables", !!meta.ChartBox && !!meta.ChartC);
  ok("ai-page: the surviving Process table keeps its real flow id", meta.c1_p.Value === "Claim_A00");
}


// ── the workflow gate: approval language with no Process is an ERROR, not a style choice ─────────
// Three shipped apps in a row arrived with approval domains and zero workflows; every gate passed
// because an app with no workflow is structurally valid. These pin the gate that makes it not.
{
  const { validateIR } = await import("../ir.mjs");
  const base = (forms) => ({ app: { name: "CapEx" }, roles: ["Requester", "Approver"], forms,
    journeys: [{ name: "Request approval", steps: ["submit request", "manager approves", "finance reviews"] }] });

  const noProc = validateIR(base([{ name: "CapEx Request", flowType: "Form", fields: [{ name: "Amount", type: "Number" }] }]));
  ok("gate: approval journey + zero Process flows → WORKFLOW_MISSED error",
    noProc.issues.some((i) => i.code === "WORKFLOW_MISSED" && i.level === "error"));

  const withProc = validateIR(base([{ name: "CapEx Request", flowType: "Process", fields: [{ name: "Amount", type: "Number" }],
    workflow: { steps: [{ name: "Submit", actor: "Requester" }, { name: "Approve", actor: "Approver" }] } }]));
  ok("gate: same domain WITH a stepped Process → silent",
    !withProc.issues.some((i) => i.code === "WORKFLOW_MISSED"));

  const noApproval = validateIR({ app: { name: "Gym" }, roles: ["Member"],
    forms: [{ name: "Booking", flowType: "Case", statuses: ["Booked", "Attended"], fields: [] }],
    journeys: [{ name: "Book a class", steps: ["browse classes", "book a spot"] }] });
  ok("gate: a domain with NO approval language stays silent — not every app needs a Process",
    !noApproval.issues.some((i) => i.code === "WORKFLOW_MISSED"));

  const singleStep = validateIR(base([{ name: "CapEx Request", flowType: "Process", fields: [],
    workflow: { steps: [{ name: "Submit" }] } }]));
  ok("gate: a one-step 'Process' does not count as a workflow",
    singleStep.issues.some((i) => i.code === "WORKFLOW_MISSED"));
}

// ---------------- HONEST PROTOTYPE: the prototype IS the custom UI ----------------
// The prototype used to be hand-rolled HTML with window.SEED while the runtime was React on the kf
// primitives — two artifacts, so the reviewed one and the shipped one drifted (hire-onboard,
// 2026-08-02). Now one artifact is generated and reviewed: the real custom UI, booted against
// @kissflow/app-ui's offline mock via a schema derived from the IR before the app exists.
{
  const { schemaFromIr, lowerSeed, flowId, fieldId } = await import("../schema-from-ir.mjs");

  // The ids must match what apply actually creates, or the reviewed bundle breaks on deploy.
  // Verified against a live synced schema: flow `Service Center` → `Service_Center_A00`,
  // field `Service Center Name` → `Service_Center_Name`.
  ok("schema-from-ir: flow/field ids follow apply's convention",
    flowId("Job Requisition") === "Job_Requisition_A00" && fieldId("Service Center Name") === "Service_Center_Name");

  const irSpec = { app: { name: "Hire to Onboard" }, roles: [{ name: "Recruiter" }, { name: "HR Ops" }],
    forms: [{ name: "Requisition", flowType: "Form", fields: [{ name: "Job Title", type: "Text" }, { name: "Hiring Manager", type: "User" }] },
      { name: "Interview", flowType: "Process", fields: [{ name: "Candidate", type: "Reference" }] }] };
  const { schema } = schemaFromIr(irSpec);
  ok("schema-from-ir: IR lowers to the kf-schema shape the offline mock boots from",
    schema.app.id === "Hire_to_Onboard_A00" && schema.dataModels[0].id === "Requisition_A00"
    && schema.dataModels[1].type === "Process" && schema.roles.length === 2);
  // Without roleAccess every data widget renders "Restricted" and the reviewer sees an empty app.
  ok("schema-from-ir: every role gets model access so the preview is not all-Restricted",
    schema.dataModels.every((m) => m.roleAccess.length === 2));

  const models = schema.dataModels;
  const s1 = lowerSeed({ Requisition: [{ "Job Title": "Staff Engineer", "Hiring Manager": "Priya Raman" }] }, models);
  ok("seed: human labels lower to field ids",
    s1.seed.Requisition_A00[0].Job_Title === "Staff Engineer");
  // A User/Reference field arrives from the real SDK as {_id, Name}. Seeded as a bare string, the
  // prototype renders fine and the live app prints "[object Object]" — review cannot catch that.
  ok("seed: User/Reference strings coerce to the {_id,Name} shape the real SDK returns",
    s1.seed.Requisition_A00[0].Hiring_Manager?.Name === "Priya Raman" && !!s1.seed.Requisition_A00[0].Hiring_Manager?._id);

  const s2 = lowerSeed({ Requisition: [{ "Job Title": "A", "Jobb Title": "typo" }] }, models);
  ok("seed: a mistyped field label warns instead of vanishing",
    s2.warnings.some((w) => /no field "Jobb Title"/.test(w)) && !("Jobb_Title" in s2.seed.Requisition_A00[0]));
  ok("seed: an unknown flow warns instead of vanishing",
    lowerSeed({ Ghost: [{ x: 1 }] }, models).warnings.some((w) => /no flow named "Ghost"/.test(w)));
  // Two keys normalizing to the same flow used to overwrite, dropping the first block entirely.
  const s3 = lowerSeed({ Requisition: [{ "Job Title": "A" }], "Requisition ": [{ "Job Title": "B" }] }, models);
  ok("seed: keys colliding on one flow append rather than overwrite",
    s3.seed.Requisition_A00.length === 2 && s3.warnings.some((w) => /same flow/.test(w)));

  // The workflow travels with the schema so the offline mock can advance items — without it,
  // "Approve" in the prototype does nothing and a stub handler is indistinguishable from a real one.
  const { schema: wf } = schemaFromIr({ app: { name: "X" }, roles: [{ name: "R" }],
    forms: [{ name: "Claim", flowType: "Process", fields: [], workflow: { steps: [{ name: "Submit" }, { name: "Review" }] } },
      // Statuses as OBJECTS — the shape the IR actually uses. Strings are also accepted.
      { name: "Case", flowType: "Case", fields: [{ name: "Owner", type: "User" }, { name: "Title", type: "Text" }],
        statuses: [{ name: "Open", category: "NotStarted" }, { name: "Closed", category: "Done" }] }] });
  ok("schema-from-ir: workflow steps / case statuses travel to the mock so actions can advance items",
    wf.dataModels[0].steps.join(">") === "Submit>Review" && wf.dataModels[1].steps.join(">") === "Open>Closed");

  // The mock lives in packages/app-ui (TypeScript, gitignored build output) — exercise it only when
  // it has been built, so a clean checkout does not fail on a missing artifact.
  const mockPath = new URL("../../../../packages/app-ui/dist/offline/mock-kf.js", import.meta.url);
  if (existsSync(mockPath)) {
    const { createMockKf } = await import(mockPath.href);
    const kf = createMockKf({ app: { id: "X_A00" }, roles: wf.roles, dataModels: wf.dataModels,
      seed: { Claim_A00: [{ _id: "c1", _current_step: "Submit" }] } });
    const P = kf.app.getProcess("Claim_A00");
    // getAdminItems, not getItems — the mock now mirrors the real Process surface exactly.
    const row = async () => (await P.getAdminItems({})).Data.find((r) => r._id === "c1");
    ok("mock: a seeded row keeps its seeded values", (await row())._current_step === "Submit");
    await P.submitItem({ instanceId: "c1" });
    ok("mock: submit advances the item to the next real workflow step", (await row())._current_step === "Review");
    await P.sendbackItem({ instanceId: "c1" });
    ok("mock: sendback returns the item to the previous step", (await row())._current_step === "Submit");
    await P.rejectItem({ instanceId: "c1" });
    ok("mock: reject moves the item to a terminal Rejected status", (await row())._status === "Rejected");
    const refRow = (await kf.app.getDataform("Case_A00").getItems({})).Data[0];
    ok("mock: unseeded rows still fill every field so widgets never render undefined",
      refRow.Title !== undefined && refRow.Owner !== undefined);
    // A User/Reference field is an object in the live SDK. The mock used to return a bare string, so
    // `{row.Owner}` looked right in preview and printed "[object Object]" once live.
    ok("mock: User/Reference fields carry the live {_id,Name} shape, not a bare string",
      typeof refRow.Owner === "object" && typeof refRow.Owner.Name === "string");
  } else {
    console.log("  ⓘ offline-mock tests skipped (run `npm run build` in packages/app-ui)");
  }

  // UI LINT — the generated-page gate. Each rule is a defect that shipped, passed review against
  // seeded data, and was found only by opening the live app.
  const { lintSource } = await import("../ui-lint.mjs");
  const codes = (src) => lintSource(src).map((f) => f.code);
  ok("ui-lint: getProcess(...).getItems() is caught — a Process has no such method",
    codes(`const r = await kf.app.getProcess(IV).getItems();`).includes("PROCESS_GET_ITEMS"));
  ok("ui-lint: the real Process listing methods pass",
    !codes(`await kf.app.getProcess(IV).getAdminItems(); await kf.app.getProcess(IV).getMyTasksItems();`).length);
  ok("ui-lint: getItems() on a Dataform/Board is correct and must NOT be flagged",
    !codes(`await kf.app.getDataform(C).getItems(); await kf.app.getBoard(O).getItems();`).length);
  ok("ui-lint: a bare catch {} around a read is caught — it hides why a page is empty",
    codes(`try { await load(); } catch { setRows([]); }`).includes("SWALLOWED_READ_ERROR"));
  ok("ui-lint: a bound catch that surfaces the error passes",
    !codes(`try { await load(); } catch (e) { setError(String(e.message)); }`).includes("SWALLOWED_READ_ERROR"));
  ok("ui-lint: hardcoded colour literals and text-white are caught",
    codes(`<span className="bg-green-100 text-white" style={{color:"#ff0044"}}/>`).some((c) => c === "HARDCODED_COLOR")
    && codes(`<span className="text-white"/>`).includes("TEXT_WHITE"));
  ok("ui-lint: a date rendered straight into JSX is caught",
    codes(`<td>{new Date(row.Due_Date).toLocaleDateString()}</td>`).includes("UNGUARDED_DATE"));
  // The codebase documents these defects in prose everywhere; linting comments would be pure noise.
  ok("ui-lint: occurrences inside comments are ignored",
    !codes(`// never call getProcess(x).getItems() here\n/* text-white is banned */`).length);

  // proto-extract still bridges prototypes already generated in the old hand-rolled dialect.
  const { extractRender, extractMarkup } = await import("../proto-extract.mjs");
  const pxNamed = `<script>function renderBoard(){var t=\`row {x} \${v}\`;return 1}
    window.PAGES=window.PAGES||{};Object.assign(window.PAGES,{"hr-board": renderBoard});</script>`;
  const rNamed = extractRender(pxNamed, "hr-board");
  ok("proto-extract: a renderer registered by NAME is followed to its declaration",
    !!rNamed && rNamed.includes("renderBoard") && rNamed.trim().endsWith("}"));
  // A naive brace counter terminates on the `{` inside a template literal and hands the agent a
  // truncated function — worse than handing it none.
  ok("proto-extract: braces inside template literals/strings do not truncate the renderer",
    rNamed.includes("return 1"));
  ok("proto-extract: page markup is depth-aware (nested divs do not close it early)",
    extractMarkup('<div data-page="p"><div class="a"><div>x</div></div></div><div>after</div>', "p")
      === '<div class="a"><div>x</div></div>');
}

// ── REVIEW PAGE: the client script has to PARSE ────────────────────────────────────────────────
// review.mjs emits its entire client script from inside a template literal, so every backslash in
// that script belongs to the SERVER first: `\n` became a real newline (an unterminated string that
// killed the whole page's script — every step stayed display:none and the review rendered blank),
// and `\b` became a backspace inside a regex that then matched nothing. Neither shows up in the
// markup, and both are invisible to a grep for the feature. The page is rendered and parsed here.
section("REVIEW PAGE — the emitted client script parses and carries no lost escapes");
{
  const { spawnSync } = await import("node:child_process");
  const { writeFileSync, mkdtempSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const irFile = join(mkdtempSync(join(tmpdir(), "kfrev-")), "ir.json");
  writeFileSync(irFile, JSON.stringify(poIR));
  const r = spawnSync(process.execPath, [join(__dirname, "..", "review.mjs"), irFile], { encoding: "utf8", maxBuffer: 64e6 });
  const html = r.stdout || "";
  ok("review: the page renders", r.status === 0 && html.length > 1000, (r.stderr || "").slice(0, 200));
  const scripts = [...html.matchAll(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  ok("review: the page carries its inline scripts", scripts.length >= 2, `found ${scripts.length}`);
  let bad = "";
  for (const s of scripts) { try { new Function(s); } catch (e) { bad = e.message; break; } }
  ok("review: every inline script parses", !bad, bad);
  // a lost escape does not always break the parse — \b is a valid (and useless) regex atom
  const ctrl = scripts.join("\n").split("\n").find((l) => /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(l));
  ok("review: no control character survived a lost backslash", !ctrl, ctrl ? JSON.stringify(ctrl).slice(0, 120) : "");

  // A BRD that prints "[object Object]" seven times under "Success looks like". Two journey shapes
  // reach the renderer — the rich one ({name, outcome, …}) and the story one ({id, persona, story,
  // steps}) — and only the first had a key the goals list looked for. The second fell through to the
  // OBJECT, and String() renders those words into a document a customer signs off. (Live 2026-08-08.)
  {
    const storyIR = { ...poIR, domain: { ...(poIR.domain || {}), journeys: [
      { id: "j1", persona: "Requester", story: "As a Requester, I raise a capex request and track it to approval", steps: ["raise", "track"] },
      { id: "j2", persona: "Approver", story: "As an Approver, I clear the queue within a day", steps: ["review"] },
    ] } };
    const f2 = join(mkdtempSync(join(tmpdir(), "kfrev2-")), "ir.json");
    writeFileSync(f2, JSON.stringify(storyIR));
    const out = spawnSync(process.execPath, [join(__dirname, "..", "review.mjs"), f2], { encoding: "utf8", maxBuffer: 64e6 }).stdout || "";
    ok("review: a story-shaped journey never renders as [object Object]", !out.includes("[object Object]"));
    ok("review: …it renders the story itself", out.includes("I raise a capex request and track it to approval"));
  }

  // A PARALLEL FORK IS NOT A STEP. A design-shape spec puts steps under workflow.processes.<id>,
  // and the lowering there kept only {name, actor} — so `branches` never reached anything. Two
  // consumers were wrong at once: the blueprint drew a straight line through a three-way fork, and
  // the Parallel builder reads `s.branches`, which by then did not exist, so the BUILT app was
  // linear too. (commercial-lending: "Board Sign-off" appeared nowhere, in either.)
  {
    const { normalizeIR } = await import("../builders.mjs");
    const design = {
      app: { name: "Lending" }, roles: [{ id: "cc", name: "Credit Committee" }],
      data_model: { flows: { loan: { name: "Loan", type: "process", fields: [{ name: "Amount", type: "Number" }] } } },
      workflow: { processes: { loan: { steps: [
        { id: "intake", name: "Intake", assignee_role: "cc", entry_condition: "start", on_complete: "route" },
        { id: "route", name: "Route by Amount", assignee_role: "cc", branches: [
          { name: "Small", steps: [{ id: "auto", name: "Auto-Approve", assignee_role: "cc" }] },
          { name: "Large", steps: [{ id: "comm", name: "Committee Approve", assignee_role: "cc" }, { id: "bd", name: "Board Sign-off", assignee_role: "cc" }] },
        ] },
      ] } } },
    };
    const lowered = normalizeIR(design);
    const proc = (lowered.forms || []).find((f) => (f.workflow?.steps || []).some((s) => s.branches));
    ok("lower: a parallel fork survives normalizeIR", !!proc);
    const fork = proc && proc.workflow.steps.find((s) => s.branches);
    ok("lower: …with both arms and their inner steps", !!fork && fork.branches.length === 2 && fork.branches[1].steps.length === 2);
    ok("lower: …and inner assignee_role became an actor name",
      !!fork && fork.branches[1].steps[1].actor === "Credit Committee", JSON.stringify(fork && fork.branches[1].steps[1]));

    const f3 = join(mkdtempSync(join(tmpdir(), "kfrev3-")), "ir.json");
    writeFileSync(f3, JSON.stringify(design));
    const out = spawnSync(process.execPath, [join(__dirname, "..", "review.mjs"), f3], { encoding: "utf8", maxBuffer: 64e6 }).stdout || "";
    ok("review: a fork renders as lanes, not one card", out.includes("wf2-lanes") && out.includes("joins — continues"));
    // the arms must be VISIBLY attached to the column: a stub off the fork, a rail across the lane
    // centres, a drop into each lane, and the mirror underneath. The rail is pinned at 100/(2n)% —
    // the first and last lane's centre — which is only true while the lanes divide the box equally.
    ok("review: …wired to the main flow at both ends", out.includes("wf2-fan top") && out.includes("wf2-fan bot"));
    ok("review: …with the rail spanning the OUTER lane centres", out.includes("--edge:25.000%"));
    ok("review: …and every step inside every arm is on the page",
      out.includes("Board Sign-off") && out.includes("Auto-Approve") && out.includes("Committee Approve"));
  }

  // A FORK WRITTEN AS PROSE. The designer was never told how to express one, so it wrote it into the
  // step TITLE — "Review (parallel) — Budget Approval + Sourcing Check" — and a claim in a name is
  // something nothing downstream can act on: one box, straight line, one sequential activity built.
  // The page salvages it into arms so an app already built that way reads correctly, and says it
  // read them from the name; validate rejects the shape so the next build models it.
  {
    const prose = { app: { name: "Pantry" }, roles: [{ name: "Office Manager" }, { name: "Pantry Steward" }],
      forms: [{ id: "req", name: "Pantry Request", flowType: "Process", fields: [{ name: "Item", type: "Text" }],
        workflow: { steps: [
          { name: "Raise Request", actor: "Pantry Steward" },
          { name: "Review (parallel) — Budget Approval + Sourcing Check", actor: "Office Manager", decision: ["Approve", "Reject"] },
          { name: "Request Closed", actor: "Office Manager" },
        ] } }] };
    const f4 = join(mkdtempSync(join(tmpdir(), "kfrev4-")), "ir.json");
    writeFileSync(f4, JSON.stringify(prose));
    const out = spawnSync(process.execPath, [join(__dirname, "..", "review.mjs"), f4], { encoding: "utf8", maxBuffer: 64e6 }).stdout || "";
    ok("review: a fork named in prose still draws as lanes", out.includes("wf2-lanes") && out.includes("Budget Approval") && out.includes("Sourcing Check"));
    ok("review: …and that one is connected too", out.includes("wf2-fan top") && out.includes("wf2-fan bot"));
    ok("review: …and says the arms were read from the name, not modelled", out.includes("read from the step name"));
    ok("review: outcome buttons are NOT drawn on the step — every app has the same Approve/Reject pair",
      !out.includes("wf2-dec "));

    // a decision step's ROUTING FORMULA is what a reviewer has to check against the rule it came from
    const condIR = JSON.parse(JSON.stringify(prose));
    condIR.forms[0].workflow.steps[1].condition = "Estimated_Cost > 5000000";
    const f5 = join(mkdtempSync(join(tmpdir(), "kfrev5-")), "ir.json");
    writeFileSync(f5, JSON.stringify(condIR));
    const condOut = spawnSync(process.execPath, [join(__dirname, "..", "review.mjs"), f5], { encoding: "utf8", maxBuffer: 64e6 }).stdout || "";
    ok("review: a decision step shows the expression that routes it",
      condOut.includes("Estimated_Cost &gt; 5000000") && condOut.includes("only when"));

    const { validateIR } = await import("../ir.mjs");
    const { issues } = validateIR(prose);
    ok("validate: a fork claimed in a step NAME is an error",
      issues.some((i) => i.code === "STEP_PARALLEL_IN_NAME" && i.level === "error"),
      issues.map((i) => i.code).join(","));
  }

  // ── the page is a CACHE of a render, and a stale one is refreshed on read ─────────────────────
  const { readFileSync: rf } = await import("node:fs");
  const { rendererId, stampOf, freshenReview } = await import("../refresh.mjs");
  ok("review: the page carries the identity of the renderer that made it", stampOf(html) === rendererId(),
    `stamped ${stampOf(html)}, current ${rendererId()}`);

  const runDir = dirname(irFile);
  const rev = join(runDir, "review.html");
  writeFileSync(join(runDir, "app-spec.json"), JSON.stringify(poIR));
  writeFileSync(rev, html.replace(stampOf(html), "0000deadbeef"));
  const refreshed = freshenReview(runDir);
  ok("review: a page from an older renderer is re-rendered from the IR",
    refreshed.ok && refreshed.changed && stampOf(rf(rev, "utf8")) === rendererId(), JSON.stringify(refreshed));
  ok("review: a page already on the current renderer is left alone", freshenReview(runDir).changed === false);

  // Versions published before the run bundle carry the rendered page and nothing else. Saying so is
  // the point: a silent skip would read as "everything was refreshed".
  const orphan = mkdtempSync(join(tmpdir(), "kfrev-orphan-"));
  writeFileSync(join(orphan, "review.html"), html);
  const noIr = freshenReview(orphan);
  ok("review: a page with no IR reports that it cannot be refreshed, and keeps its bytes",
    !noIr.ok && /app-spec/.test(noIr.reason) && rf(join(orphan, "review.html"), "utf8") === html, JSON.stringify(noIr));

  // A renderer that throws must never blank a page that works.
  const broken = mkdtempSync(join(tmpdir(), "kfrev-broken-"));
  writeFileSync(join(broken, "review.html"), html.replace(stampOf(html), "0000deadbeef"));
  writeFileSync(join(broken, "app-spec.json"), "{ not json");
  const badRender = freshenReview(broken);
  ok("review: a failed re-render keeps the page it had rather than replacing it with nothing",
    !badRender.ok && rf(join(broken, "review.html"), "utf8").includes("0000deadbeef"), JSON.stringify(badRender));
}

// ── IR SLICING — the single biggest token cost in a build ───────────────────────────────────────
// A mature App-Spec is ~709 KB (~177k tokens) and every agent that opens one pays for all of it.
// Each role gets only what it reads. Two failure modes matter and both are pinned: a slice that
// LEAKS (defeats the point) and a slice that DROPS something the agent cannot work without.
section("IR SLICING — each agent gets its part, and the part is still valid");
{
  const { sliceIR, sliceStats, SLICES } = await import("../slice-ir.mjs");
  const { normalizeIR: normIR } = await import("../builders.mjs");
  const ir = normIR(JSON.parse(JSON.stringify(poIR)));

  for (const role of Object.keys(SLICES)) {
    const s = sliceIR(ir, role);
    ok(`slice/${role}: still names the app`, !!s.app?.name);
    ok(`slice/${role}: is never bigger than the whole`, JSON.stringify(s).length <= JSON.stringify(ir).length);
  }

  // the data architect designs INSIDE flows — it must keep the fields
  const da = sliceIR(ir, "data-architect");
  ok("slice/data-architect: keeps full fields", (da.forms || []).some((f) => (f.fields || []).length));
  ok("slice/data-architect: does not carry pages or nav", !da.pages && !da.nav);

  // The security designer builds FIELD-LEVEL permission matrices, so it needs field NAMES. These two
  // assertions used to require the opposite — that its flows were shallow, with no field bodies — and
  // they were wrong in the way a test can be: they passed, and they pinned a slice that handed the
  // agent `fieldCount: 18` where it needed eighteen names. An agent given a count invents the names.
  // Same for the workflow designer (field_permissions keys, which STEP_PERM_FIELD_MISSING validates),
  // the integration analyst (automation field_map) and the experience designer (widget bindings).
  // Dropping field detail was worth ~21% of the field list anyway — fields in a real spec are already
  // just {name, type}. The savings come from omitting whole SECTIONS a role never reads.
  const sec = sliceIR(ir, "security");
  ok("slice/security: keeps roles and permissions", !!sec.roles?.length && !!sec.permissions?.length);
  ok("slice/security: flows keep their FIELDS — permission matrices are keyed by field name",
    (sec.forms || []).every((f) => Array.isArray(f.fields)));
  // Identity is what the SOURCE had, not a fixed shape: flowType is optional in the IR (it defaults
  // to Form, and this fixture omits it on two flows), so requiring it here failed the slice for
  // faithfully copying an absent value.
  ok("slice/security: every flow still carries identity, and its type when the source had one",
    (sec.forms || []).every((f) => f.name)
    && (ir.forms || []).every((src) => {
      const out = (sec.forms || []).find((f) => (f.id || f.name) === (src.id || src.name));
      return out && (src.flowType ? out.flowType === src.flowType : true);
    }));
  ok("slice/security: reference targets survive — the graph is still readable",
    (sec.forms || []).every((f) => Array.isArray(f.refs) || f.fieldCount === undefined));

  // …and it must be SMALLER, or the exercise is theatre
  const st = sliceStats(ir, "security");
  ok("slice/security: measurably smaller than the whole IR", st.saved > 0, `saved ${st.saved}%`);

  ok("slice: an unknown role is refused, not silently emptied",
    (() => { try { sliceIR(ir, "nope"); return false; } catch { return true; } })());
  ok("slice: the result is marked as a part, not mistaken for a whole IR", sliceIR(ir, "seed")._slice === "seed");
}

section("PAGE POLICY — --no-pages must hold through the compiler (#11)");
{
  const irWithExpPages = { app:{name:"NoPagesProbe"}, roles:[{id:"r1",name:"Approver"}],
    forms:[{name:"Req",flowType:"Process",fields:[{name:"Amt",type:"number"}]}],
    experience:{ pages:[{id:"p1",name:"Approver Home",role:"r1"}], nav:{}, landing:{r1:"Approver Home"} } };
  const clone = () => JSON.parse(JSON.stringify(irWithExpPages));
  const pageArts = (a) => a.artifacts.filter((x) => /page|nav/i.test(x.kind || x.type || "")).length;
  ok("authored mode DOES emit page/nav artifacts from experience.pages",
    pageArts(buildApp(clone())) > 0);
  // the bug: clearing ir.pages did NOT work because normalizeIR lifts experience.pages back
  const mutated = clone(); mutated.pages = [];
  ok("clearing ir.pages alone is NOT enough — normalizeIR re-lifts experience.pages (documents the trap)",
    pageArts(buildApp(mutated)) > 0);
  // the fix: pageMode:"none" is honoured even WITH experience.pages present
  ok("pageMode:'none' emits ZERO page/nav artifacts even with experience.pages present",
    pageArts(buildApp(clone(), { pageMode: "none" })) === 0);
  ok("pageMode:'none' strips experience.pages so nothing downstream can re-lift them",
    (() => { const ir = normalizeIR(clone(), { pageMode: "none" }); return (!ir.pages || !ir.pages.length) && (!ir.experience.pages || !ir.experience.pages.length) && ir.__pageMode === "none"; })());
}

console.log(`\n${"=".repeat(48)}\n${fail === 0 ? "✅" : "❌"}  ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
