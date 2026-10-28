// Align CIQ Digital's app roles with the clickable prototype's personas (Thomas approved, chat 2026-10-09:
// "Rename to prototype names", "Add 3 missing roles", "Rename technical roles").
//   --dry-run        read everything, print the plan, write nothing
//   --create-only    create the 3 new roles (+ Thomas as member, + Auditor/Reader's grants), no renames
//   --rename-only    rename the 11 existing roles (members kept: PUT sends the current members back)
//   (no flag)        both
// Rename shape = the portal session's verified one (GET current Members → PUT {Name, Description, _application_id, Users}).
// Every write is read back. Log: roles-requests.jsonl. Result: roles-align-result.json.
import { fileURLToPath } from "node:url";
import { writeFileSync } from "node:fs";
import { writer } from "../../lib/meta.mjs";
const here = (f) => fileURLToPath(new URL(f, import.meta.url));
const argv = process.argv.slice(2);
const DRY = argv.includes("--dry-run"), CREATE = !argv.includes("--rename-only"), RENAME = !argv.includes("--create-only");
const w = writer(here("./roles-requests.jsonl"));
const A = w.acc, APP = "CIQ_Digital_A00", Q = `_application_id=${APP}`;
const THOMAS = { _id: "UsEJUfjYLM8Y", Name: "Thomas", Kind: "User" };
const RENAMES = [
  ["CIQ RMM", "Raw Material Manager (RMM)", "Owns CIQ cases: starts them, sets target markets, watches bottlenecks, escalates, cancels or closes."],
  ["CIQ Regulatory Reviewer", "Regulatory Affairs reviewer", "Reviews the Regulatory sections, asks the supplier directly, records the RMES and gives the final Regulatory decision."],
  ["CIQ Safety Reviewer", "Product Safety reviewer", "Reviews the Safety sections, asks the supplier directly, records the RMES and gives the final Safety decision."],
  ["CIQ QM Reviewer", "Quality Management reviewer", "Reviews the QM sections, asks the supplier directly and completes the QM review."],
  ["CIQ Microbiology Reviewer", "Microbiology reviewer", "Reviews the Microbiology sections, asks the supplier directly and completes the Microbiology review."],
  ["CIQ Sustainability Reviewer", "Sustainability reviewer", "Reviews the Sustainability sections, asks the supplier directly and completes the Sustainability review."],
  ["CIQ Overall Approver", "Overall approver", "Gives the overall Beiersdorf approve/reject decision."],
  ["CIQ Business Admin", "Business administrator", "Maintains the questionnaire, the rule table, section ownership and reminders. Every change is versioned."],
  ["CIQ Reader", "Auditor", "Reconstructs who assessed what, when, on which source and rule-set version. Read-only."],
  ["CIQ Case Admin", "Case administrator", "Technical: flow admin on the CIQ processes for repairs and cancellations."],
  ["CIQ Integration Service", "Integration service", "Technical: the identity of the portal and app integrations. Not a person."],
];
const NEW = [
  ["Customs & Trade Compliance", "Owns K7 (HS code, export control, CITES). Informed and read-only."],
  ["Legal / IP", "Owns K8 and K8.1 (patents and licences). Informed and read-only."],
  ["Business owner (reports)", "Process owner: lead times, bottlenecks, supplier performance and the value of the digital CIQ. Read-only."],
];
const FLOWS = [
  ["process", "CIQ_Case_A00"], ["process", "CIQ_Open_Point_A00"], ["process", "CIQ_Change_Request_A00"],
  ["form", "CIQ_Supplier_A00"], ["form", "CIQ_Config_Version_A00"], ["form", "CIQ_Section_A00"], ["form", "CIQ_Scope_Run_A00"],
  ["form", "CIQ_RMES_Safety_A00"], ["form", "CIQ_RMES_Regulatory_A00"], ["form", "CIQ_Internal_Note_A00"], ["form", "CIQ_Audit_Event_A00"],
];
const rows = (b) => (Array.isArray(b) ? b : b?.Data || []);
const out = { at: new Date().toISOString(), dry: DRY, renames: [], created: [], grants: [] };
const list = rows((await w.call("GET", `/app_role/2/${A}/list?${Q}&page_number=1&page_size=100`)).body);
const byName = Object.fromEntries(list.map((r) => [r.Name, r._id]));
const membersOf = async (id) => ((await w.call("GET", `/app_role/2/${A}/${id}?${Q}`)).body || {});
// The Reader/Auditor role's grants are the template for the 3 new read-only roles.
const readerId = byName["CIQ Reader"] || byName["Auditor"];
if (!readerId) { console.error("Reader/Auditor role not found"); process.exit(2); }
const readerGrants = [];
for (const [family, flow] of FLOWS) {
  const m = rows((await w.call("GET", `/flow/2/${A}/${family}/${flow}/member?${Q}&page_number=1&page_size=100`)).body);
  const g = m.find((x) => x._id === readerId);
  readerGrants.push({ family, flow, Role: g?.Role ?? null, Permission: g?.Permission ?? null });
}
console.log("Auditor/Reader grants used as the template:", readerGrants.map((g) => `${g.flow}:${g.Role}${JSON.stringify(g.Permission)}`).join(" "));

if (CREATE) for (const [name, desc] of NEW) {
  let id = byName[name] || null;
  const row = { name, existed: !!id };
  if (!DRY && !id) {
    const cr = await w.call("POST", `/app_role/2/${A}/`, { Name: name, Description: desc, _application_id: APP });
    id = cr.body?._id || null; row.create = cr.status;
    if (!id) { row.error = JSON.stringify(cr.body).slice(0, 200); out.created.push(row); continue; }
  }
  row.id = id;
  if (!DRY && id) {
    for (let i = 0; i < 4; i++) {
      const g = await membersOf(id);
      if ((g.Members || []).some((u) => u._id === THOMAS._id)) break;
      await w.call("PUT", `/app_role/2/${A}/${id}?${Q}`, { Name: name, Description: desc, _application_id: APP, Users: [...(g.Members || []).map((u) => ({ _id: u._id, Name: u.Name, Kind: u.Kind || "User" })), THOMAS] });
      await new Promise((r) => setTimeout(r, 1200));
    }
    row.members = ((await membersOf(id)).Members || []).map((u) => u.Name);
    for (const t of readerGrants.filter((x) => x.Role)) {
      const r = await w.call("POST", `/flow/2/${A}/${t.family}/${t.flow}/member/batch?${Q}`, [{ _id: id, Name: name, _application_id: APP, Role: t.Role, Permission: t.Permission, Kind: "AppRole" }]);
      out.grants.push({ role: name, flow: t.flow, write: r.status });
    }
  }
  out.created.push(row);
}
if (RENAME) for (const [from, to, desc] of RENAMES) {
  const id = byName[from] || byName[to];
  const row = { from, to, id, already: !byName[from] && !!byName[to] };
  if (!id) { row.error = "not found"; out.renames.push(row); continue; }
  if (!DRY && !row.already) {
    const cur = await membersOf(id);
    const users = (cur.Members || []).map((u) => ({ _id: u._id, Name: u.Name, Kind: u.Kind || "User" }));
    const put = await w.call("PUT", `/app_role/2/${A}/${id}?${Q}`, { Name: to, Description: desc, _application_id: APP, Users: users });
    const back = await membersOf(id);
    row.put = put.status; row.membersBefore = users.length; row.membersAfter = (back.Members || []).length; row.nameAfter = back.Name;
    row.ok = back.Name === to && row.membersAfter === row.membersBefore;
  }
  out.renames.push(row);
}
// read back the new roles' grants
if (!DRY && CREATE) for (const c of out.created.filter((x) => x.id)) {
  for (const t of readerGrants.filter((x) => x.Role)) {
    const m = rows((await w.call("GET", `/flow/2/${A}/${t.family}/${t.flow}/member?${Q}&page_number=1&page_size=100`)).body);
    const g = m.find((x) => x._id === c.id);
    const ok = !!g && g.Role === t.Role && JSON.stringify([...(g.Permission || [])].sort()) === JSON.stringify([...(t.Permission || [])].sort());
    (c.grantsOk ??= []).push(`${t.flow}:${ok ? "OK" : "MISMATCH"}`);
  }
}
writeFileSync(here(DRY ? "./roles-align.dry.json" : "./roles-align-result.json"), JSON.stringify(out, null, 2));
for (const r of out.renames) console.log(`rename ${r.from} → ${r.to} · id ${r.id}${DRY ? "" : ` · put ${r.put} · members ${r.membersBefore}→${r.membersAfter} · ${r.ok ? "OK" : r.already ? "already" : "CHECK"}`}`);
for (const c of out.created) console.log(`new ${c.name} · ${c.existed ? "exists" : DRY ? "would create" : `created ${c.create}`} · id ${c.id ?? "-"} · members ${JSON.stringify(c.members ?? null)} · grants ${(c.grantsOk || []).filter((x) => x.endsWith("OK")).length}/${readerGrants.filter((x) => x.Role).length}`);
