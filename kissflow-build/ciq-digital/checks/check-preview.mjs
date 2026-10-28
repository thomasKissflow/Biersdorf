// Independent checks on the dry-run build output (no Kissflow calls).
// Usage: node check-preview.mjs <preview-dir>
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const dir = process.argv[2];
const results = [];
const check = (id, ok, detail = "") => results.push({ id, ok, detail });
const load = (p) => JSON.parse(readFileSync(p, "utf8"));
const blobs = (sub) =>
  existsSync(join(dir, sub)) ? readdirSync(join(dir, sub)).filter((f) => f.endsWith(".blob.json")).map((f) => load(join(dir, sub, f))) : [];
const entities = (blob, kind) => Object.values(blob).filter((v) => v && v.Kind === kind);
const root = (blob) => blob[blob.Root];

// ---------- artifact families ----------
const families = readdirSync(dir).sort();
check("ARTIFACT-FAMILIES", JSON.stringify(families) === JSON.stringify(["form", "list", "permission", "process", "role"]), families.join(","));
check("NO-PAGES-OR-NAV", !families.some((f) => /page|nav|experience/i.test(f)), "no page/nav artifacts in build output");
check("NO-INTEGRATIONS", !families.some((f) => /integration|automation|connector/i.test(f)), "no integration artifacts in build output");

// ---------- flows ----------
const forms = blobs("form");
const procs = blobs("process");
const models = [...forms, ...procs].map(root);
check("FLOW-COUNT-FORMS", forms.length === 25, `${forms.length} Form models`);
check("FLOW-COUNT-PROCESSES", procs.length === 3, `${procs.length} Process models`);
check("FLOW-NAMES-CIQ-PREFIX", models.every((m) => m.Name.startsWith("CIQ ")), models.filter((m) => !m.Name.startsWith("CIQ ")).map((m) => m.Name).join(",") || "all 28 start with 'CIQ '");
check("NO-A12-A13", !models.some((m) => /Review Version|Section Snapshot/.test(m.Name)), "CIQ Review Version / CIQ Section Snapshot absent");
const nameSet = new Set(models.map((m) => m.Name));
check("FLOW-NAMES-UNIQUE", nameSet.size === models.length, `${nameSet.size} unique of ${models.length}`);

// ---------- fields ----------
const FORBIDDEN = ["Name", "Status", "Type", "Country", "Priority", "Category", "Currency", "Project"];
let allFields = [];
for (const b of [...forms, ...procs]) for (const f of entities(b, "Field")) allFields.push({ model: root(b).Name, ...f });
check("FIELD-TOTAL", allFields.length === 454, `${allFields.length} fields`);
const forb = allFields.filter((f) => FORBIDDEN.includes(f.Name) || FORBIDDEN.includes(f.Id));
check("FIELD-NO-FORBIDDEN-NAMES", forb.length === 0, forb.map((f) => `${f.model}.${f.Id}`).join(",") || "none");
const trunc = allFields.filter((f) => f.Id !== f.Name);
check("FIELD-ID-EQUALS-NAME", trunc.length === 0, trunc.map((f) => `${f.model}.${f.Name}->${f.Id}`).join(",") || "all field ids equal names (no truncation in compile)");
check("NO-DOC-VERSION", !allFields.some((f) => /Doc_Version|Review_Version_Key/.test(f.Id)), "no *_Doc_Version / Review_Version_Key");

// ---------- CIQ Case contract ----------
const caseBlob = procs.find((b) => root(b).Name === "CIQ Case");
const caseFields = Object.fromEntries(entities(caseBlob, "Field").map((f) => [f.Id, f]));
const CONTRACT = {
  Case_Code: "Text", Current_Cycle: "Number", Portal_Request_Item_Id: "Text", Completeness_Confirm: "Text",
  Completeness_By_Name: "Text", Completeness_By_Email: "Email", Completeness_At: "DateTime",
  Final_Release_By_Name: "Text", Final_Release_By_Email: "Email", Final_Release_By_Role: "Text", Final_Release_At: "DateTime",
  Completion_Trigger: "Text", Release_Path: "Text", Supplier_Notice_Text: "Textarea", Overall_Approval_Required: "Text",
};
for (const [id, type] of Object.entries(CONTRACT)) {
  const f = caseFields[id];
  check(`CONTRACT-FIELD ${id}`, !!f && f.Type === type && !f.Formula, f ? `${f.Type}${f.Formula ? " (formula!)" : ""}` : "MISSING");
}
check("CASE-ID", root(caseBlob).Id === "CIQ_Case_A00", root(caseBlob).Id);

// ---------- process steps ----------
function steps(blob) {
  const pd = entities(blob, "ProcessDef")[0];
  return pd["ProcessDef::Activity"].map((id) => {
    const a = blob[id];
    const res = (a["Activity::Resource"] || []).map((r) => blob[r].Value);
    const expr = (a["Activity::Expression"] || []).map((e) => blob[e].ExpressionStr);
    return { name: a.Name, node: a.NodeType, roles: res, cond: expr[0] || null };
  });
}
const EXPECT_CASE = [
  ["Create case", "StartEvent", [], null],
  ["Part 1 – with supplier", "UserTask", ["ciq_rmm"], null],
  ["Part 2 – Beiersdorf review", "UserTask", ["ciq_case_sync"], null],
  ["Awaiting supplier final release", "UserTask", ["ciq_rmm"], 'Release_Path = "Yes"'],
  ["Overall approval", "UserTask", ["ciq_overall_approver"], 'Overall_Approval_Required = "Yes"'],
  ["End", "EndEvent", [], null],
];
const trkBlob = procs.find((b) => root(b).Name === "CIQ Review Track");
const EXPECT_TRK = [
  ["Create track", "StartEvent", [], null],
  ["Review – Regulatory", "UserTask", ["ciq_regulatory_reviewer"], 'Dept_Gate = "REG"'],
  ["Review – Safety", "UserTask", ["ciq_safety_reviewer"], 'Dept_Gate = "SAF"'],
  ["Review – QM", "UserTask", ["ciq_qm_reviewer"], 'Dept_Gate = "QM"'],
  ["Review – Microbiology", "UserTask", ["ciq_microbiology_reviewer"], 'Dept_Gate = "MIC"'],
  ["Review – Sustainability", "UserTask", ["ciq_sustainability_reviewer"], 'Dept_Gate = "SUS"'],
  ["Review – RMM", "UserTask", ["ciq_rmm"], 'Dept_Gate = "RMM"'],
  ["Final decision – Safety", "UserTask", ["ciq_safety_approver"], 'Dept_Gate = "SAF"'],
  ["Final decision – Regulatory", "UserTask", ["ciq_regulatory_approver"], 'Dept_Gate = "REG"'],
  ["End", "EndEvent", [], null],
];
function cmpSteps(label, blob, expected) {
  const got = steps(blob);
  check(`${label}-STEP-COUNT`, got.length === expected.length, `${got.length} steps`);
  expected.forEach(([name, node, roles, cond], i) => {
    const g = got[i] || {};
    const ok = g.name === name && g.node === node && JSON.stringify(g.roles) === JSON.stringify(roles) && g.cond === cond;
    check(`${label}-STEP ${i} "${name}"`, ok, ok ? "byte-exact name, node, owner, condition" : JSON.stringify(g));
  });
}
cmpSteps("CASE", caseBlob, EXPECT_CASE);
cmpSteps("TRACK", trkBlob, EXPECT_TRK);
const dg = entities(trkBlob, "Field").find((f) => f.Id === "Dept_Gate");
check("TRACK-DEPT_GATE-FORMULA", !!dg, dg ? JSON.stringify({ Type: dg.Type, Formula: dg.Formula || dg.FormulaStr || dg.Expression }).slice(0, 160) : "MISSING");

// ---------- permissions ----------
const perms = blobs("permission").map(root);
check("PERMISSION-COUNT", perms.length === 401, `${perms.length} flow permissions`);
const level = (role, model) => (perms.find((p) => p.Role === role && p.Model === model) || {}).Level || "-";
const roleDocs = readdirSync(join(dir, "role")).map((f) => f.replace(".doc.json", ""));
check("ROLE-COUNT", roleDocs.length === 20, roleDocs.length + " roles");
check("ADMIN-USER-NO-GRANTS", !perms.some((p) => p.Role === "admin" || p.Role === "user"), "default Admin/User have no flow permissions");

const READERS_SAF = ["ciq_rmm", "ciq_regulatory_reviewer", "ciq_qm_reviewer", "ciq_microbiology_reviewer", "ciq_sustainability_reviewer", "ciq_regulatory_approver", "ciq_customs", "ciq_legal", "ciq_overall_approver", "ciq_auditor", "ciq_process_owner"];
const READERS_REG = ["ciq_rmm", "ciq_safety_reviewer", "ciq_qm_reviewer", "ciq_microbiology_reviewer", "ciq_sustainability_reviewer", "ciq_safety_approver", "ciq_customs", "ciq_legal", "ciq_overall_approver", "ciq_auditor", "ciq_process_owner"];
const NONE = ["ciq_business_admin", "ciq_config_approver", "ciq_case_sync", "ciq_integration_service", "ciq_case_admin"];
const RMES = {
  CIQ_RMES_Safety_Result_A00: [["ciq_safety_reviewer", "ciq_safety_approver"], READERS_SAF],
  CIQ_Safety_Finding_A00: [["ciq_safety_reviewer", "ciq_safety_approver"], READERS_SAF],
  CIQ_RMES_Regulatory_Result_A00: [["ciq_regulatory_reviewer", "ciq_regulatory_approver"], READERS_REG],
  CIQ_Regulatory_Finding_A00: [["ciq_regulatory_reviewer", "ciq_regulatory_approver"], READERS_REG],
};
for (const [model, [editors, readers]] of Object.entries(RMES)) {
  const bad = [];
  for (const r of editors) if (level(r, model) !== "Editable") bad.push(`${r}=${level(r, model)} (want Editable)`);
  for (const r of readers) if (level(r, model) !== "ReadOnly") bad.push(`${r}=${level(r, model)} (want ReadOnly)`);
  for (const r of NONE) if (level(r, model) !== "-") bad.push(`${r}=${level(r, model)} (want none)`);
  const editorsAll = perms.filter((p) => p.Model === model && p.Level === "Editable").map((p) => p.Role).sort();
  check(`RMES-ASYMMETRY ${model}`, bad.length === 0, bad.join("; ") || `editors: ${editorsAll.join(",")}`);
}
const a9Edit = perms.filter((p) => p.Model === "CIQ_Case_A00" && p.Level === "Editable").map((p) => p.Role).sort();
check("A9-EDITABLE-ROLES (= InitiateItems at apply)", JSON.stringify(a9Edit) === JSON.stringify(["ciq_case_sync", "ciq_overall_approver", "ciq_rmm"]), a9Edit.join(",") + "  [case_sync + overall_approver are the documented D27/D41 broadening]");
const a8 = perms.filter((p) => p.Model === "CIQ_Config_Release_A00").map((p) => `${p.Role}:${p.Level}`).sort();
check("A8-GRANTS", a8.filter((x) => x.endsWith("Editable")).length === 2, a8.join(", "));

// ---------- lists ----------
const lists = readdirSync(join(dir, "list")).map((f) => load(join(dir, "list", f)));
const listNames = lists.map((l) => (l[l.Root] || l).Name || (l[l.Root] || l).name).filter(Boolean);
check("LIST-COUNT", lists.length === 33, `${lists.length} lists`);
check("LIST-NAMES-CIQ-PREFIX", listNames.length === 33 && listNames.every((n) => n.startsWith("CIQ ")), listNames.filter((n) => !n.startsWith("CIQ ")).join(",") || "all start with 'CIQ '");

// ---------- report ----------
const pass = results.filter((r) => r.ok).length;
for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"} | ${r.id} | ${r.detail}`);
console.log(`\n${pass}/${results.length} checks pass`);
process.exitCode = pass === results.length ? 0 : 1;
