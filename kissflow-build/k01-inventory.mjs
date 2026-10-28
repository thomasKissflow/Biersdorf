// K-01: read-only inventory of both containers. GET requests only; writes a JSON snapshot per container.
// Run: node kissflow-build/k01-inventory.mjs
import { writeFileSync } from "node:fs";
import { client } from "./lib/kf.mjs";

const kf = client({ readOnly: true });
const stamp = new Date().toISOString().slice(0, 10);
const FLOW_TYPES = ["form", "process", "case", "list", "dataset"];

const brief = (r) =>
  r.status === 200 ? "200" : `${r.status} ${r.body?.error_code ?? ""} ${r.body?.en_message ?? r.body?.message ?? ""}`.trim();
const rows = (body) => (Array.isArray(body) ? body : body?.Data ?? body?.data ?? body?.items ?? []);

async function inventory(appId, folder) {
  const out = { appId, takenAt: new Date().toISOString(), checks: {} };

  const info = await kf.get(`/flow/2/${kf.acc}/app/${appId}/info`);
  out.checks.info = brief(info);
  out.app = info.status === 200 ? info.body : null;

  const roles = await kf.get(`/app_role/2/${kf.acc}/list?_application_id=${appId}`);
  out.checks.roles = brief(roles);
  out.roles = rows(roles.body).map((r) => ({ _id: r._id, Name: r.Name, UserCount: r.UserCount }));

  out.flows = {};
  for (const t of FLOW_TYPES) {
    const r = await kf.get(`/flow/2/${kf.acc}/${t}/?_application_id=${appId}&page_number=1&page_size=300`);
    out.checks[`flows.${t}`] = brief(r);
    out.flows[t] = rows(r.body).map((f) => ({ _id: f._id, Name: f.Name, Status: f.Status ?? f.FlowStatus }));
  }

  writeFileSync(new URL(`./${folder}/inventory-${stamp}.json`, import.meta.url), JSON.stringify(out, null, 2));
  return out;
}

const results = [];
for (const [appId, folder] of [[kf.portalId, "ciq-supplier-portal"], [kf.appId, "ciq-digital"]]) {
  const o = await inventory(appId, folder);
  results.push(o);
  console.log(`\n== ${appId}  (app name: ${o.app?.Name ?? "?"})`);
  console.log("checks:", JSON.stringify(o.checks));
  console.log("roles:", o.roles.map((r) => `${r.Name}(${r.UserCount ?? "?"})`).join(", ") || "none");
  for (const [t, list] of Object.entries(o.flows)) if (list.length) console.log(`${t}:`, list.map((f) => f.Name).join(", "));
}

const ex = await kf.get(`/flow/2/${kf.acc}/explore`);
const flows = rows(ex.body);
console.log(`\n== account-wide explore: ${brief(ex)}, ${Array.isArray(flows) ? flows.length : "?"} entries`);
if (Array.isArray(flows) && flows.length) {
  const names = flows.map((f) => f.Name).filter(Boolean);
  console.log("names starting with CIQ:", names.filter((n) => /^CIQ/i.test(n)).join(", ") || "none");
}
