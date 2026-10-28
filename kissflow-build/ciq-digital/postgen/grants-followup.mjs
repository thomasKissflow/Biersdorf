// Post-generate grants (security.post_generate_grants[0..13]) — Thomas approved the REST follow-ups (chat, 2026-10-09).
// [0..2]  CIQ Case Admin → flow Admin on CIQ Case, CIQ Open Point, CIQ Change Request.
// [3..13] reviewers / overall approver → Process Member Permission ["View"] (removes InitiateItems; never []).
// [14] (no-Delete on forms) waits for K-17 (needs a non-admin user); [15] waits for K-09b. Not touched here.
//   node kissflow-build/ciq-digital/postgen/grants-followup.mjs --dry-run   (reads current members, prints the plan)
//   node kissflow-build/ciq-digital/postgen/grants-followup.mjs             (writes, then reads every cell back)
import { fileURLToPath } from "node:url";
import { readFileSync, writeFileSync } from "node:fs";
import { writer } from "../../lib/meta.mjs";
const here = (f) => fileURLToPath(new URL(f, import.meta.url));
const DRY = process.argv.includes("--dry-run");
const w = writer(here("./grants-requests.jsonl"));
const A = w.acc, APP = "CIQ_Digital_A00";
const spec = JSON.parse(readFileSync(here("../../../runs/current/app-spec.json"), "utf8"));
const rb = JSON.parse(readFileSync(here("./readback-result.json"), "utf8"));
const roleName = Object.fromEntries((spec.roles || []).map((r) => [r.id, r.name]));
const roleId = rb.ids.roles; // name → live id
const cells = spec.security.post_generate_grants.slice(0, 14).map((g, i) => ({
  i, flow: g.flow, roleIr: g.role, name: roleName[g.role], id: roleId[roleName[g.role]],
  Role: /flow Admin/.test(g.grant) ? "Admin" : "Member", Permission: /flow Admin/.test(g.grant) ? [] : ["View"],
}));
const bad = cells.filter((c) => !c.name || !c.id || !/^CIQ_(Case|Open_Point|Change_Request)_A00$/.test(c.flow));
if (bad.length) { console.error("unresolved cells:", JSON.stringify(bad)); process.exit(2); }

const members = async (flow) => {
  const r = await w.call("GET", `/flow/2/${A}/process/${flow}/member?_application_id=${APP}&page_number=1&page_size=100`);
  const rows = Array.isArray(r.body) ? r.body : r.body?.Data || [];
  return Object.fromEntries(rows.map((m) => [m._id, { Role: m.Role, Permission: m.Permission || [] }]));
};
const out = { at: new Date().toISOString(), dry: DRY, cells: [] };
const before = {};
for (const f of [...new Set(cells.map((c) => c.flow))]) before[f] = await members(f);
for (const c of cells) {
  const b = before[c.flow][c.id] || null;
  const row = { ...c, before: b };
  const atTarget = !!b && b.Role === c.Role && JSON.stringify([...(b.Permission || [])].sort()) === JSON.stringify([...c.Permission].sort());
  if (atTarget) row.skipped = "already at target (read live)";
  if (!DRY && !atTarget) {
    const r = await w.call("POST", `/flow/2/${A}/process/${c.flow}/member/batch?_application_id=${APP}`,
      [{ _id: c.id, Name: c.name, _application_id: APP, Role: c.Role, Permission: c.Permission, Kind: "AppRole" }]);
    row.write = r.status;
    if (r.status >= 300) row.error = JSON.stringify(r.body).slice(0, 300);
  }
  out.cells.push(row);
}
if (!DRY) {
  await new Promise((r) => setTimeout(r, 1500));
  const after = {};
  for (const f of [...new Set(cells.map((c) => c.flow))]) after[f] = await members(f);
  for (const row of out.cells) {
    const a = after[row.flow][row.id] || null;
    row.after = a;
    row.ok = !!a && a.Role === row.Role && JSON.stringify([...(a.Permission || [])].sort()) === JSON.stringify([...row.Permission].sort());
  }
}
for (const r of out.cells) console.log(`[${r.i}] ${r.flow.padEnd(24)} ${r.name.padEnd(28)} before ${JSON.stringify(r.before)} → want ${r.Role} ${JSON.stringify(r.Permission)}${DRY ? "" : ` · write ${r.write} · after ${JSON.stringify(r.after)} · ${r.ok ? "OK" : "MISMATCH"}`}`);
writeFileSync(here(DRY ? "./grants-followup.dry.json" : "./grants-followup-result.json"), JSON.stringify(out, null, 2));
if (!DRY && out.cells.some((r) => !r.ok)) process.exit(1);
