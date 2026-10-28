// 27 Oct (Thomas): steps that act on the OTHER container's processes use a connection for that container:
//   app integrations, steps on a portal process (CIQP_*)   → "Kissflow Process - For Portal Actions"
//   portal integrations, steps on an app process (CIQ_*)    → "Kissflow Process - For App Actions" (its id given as argv)
// Only each step's `Connection` changes. Backup, PUT, read back, publish, and switch on again what was on.
//   node swap-container-connections.mjs portal [--apply]
//   node swap-container-connections.mjs app <For-App-Actions connection id> [--apply]
import { call, A, backup, getDraft, putDraft, publish } from "./integ-lib.mjs";
const [side, maybeId] = process.argv.slice(2), apply = process.argv.includes("--apply");
const PLAN = {
  portal: { app: "CIQ_Digital_A00", target: /^CIQP_/, to: { _id: "CnEREosN6dQb", Name: "Kissflow Process - For Portal Actions" } },
  app: { app: "CIQ_Supplier_Portal_A00", target: /^CIQ_(?!.*Audit)/, to: maybeId && !maybeId.startsWith("--") ? { _id: maybeId, Name: "Kissflow Process - For App Actions" } : null },
}[side];
if (!PLAN || !PLAN.to) throw new Error("usage: portal [--apply] | app <connection id> [--apply]");
if (side === "app") { const c = (await call("GET", `/integration/2/${A}/connection/${PLAN.to._id}`)).body; if (c?.Name !== PLAN.to.Name) throw new Error(`connection ${PLAN.to._id} is "${c?.Name}", not ${PLAN.to.Name}`); }
const SKIP = /^(Test|CIQ Mail – send outbox mail|CIQ Z[12] |Mail Integration|Communicate to App)/;
const PROCESS_CONNECTOR = "ComaBsL8ZTSMM";
let total = 0;
const l = (await call("GET", `/flow/2/${A}/integration?_application_id=${PLAN.app}&page_number=1&page_size=100`)).body;
for (const it of Array.isArray(l) ? l : l?.Data || []) {
  if (SKIP.test(it.Name || "")) continue;
  const b = await getDraft(it._id), root = b[b.Root];
  const ids = [...(root["Integration::Trigger"] || []), ...(root["Integration::Action"] || [])];
  const targetOf = (s) => { const fm = (s["Action::FieldMapping"] || s["Trigger::FieldMapping"] || []).map((x) => b[x]).find((f) => f?.Name === "process_id"); return fm ? (b[(fm["FieldMapping::Property"] || [])[0]]?.Value || []).join("") : ""; };
  const hits = ids.filter((id) => b[id]?.Connector?._id === PROCESS_CONNECTOR && PLAN.target.test(targetOf(b[id])) && b[id]?.Connection?._id !== PLAN.to._id);
  if (!hits.length) continue;
  total += hits.length;
  console.log(`${it.IsActive ? "ON " : "off"} ${it.Name}: ${hits.map((id) => `${b[id].Name} (${targetOf(b[id])})`).join(", ")}`);
  if (!apply) continue;
  backup(it._id, b, `before-container-connections-${side}`);
  for (const id of hits) b[id] = { ...b[id], Connection: { ...PLAN.to } };
  const put = await putDraft(it._id, b), back = await getDraft(it._id);
  const ok = put.status < 300 && hits.every((id) => back[id]?.Connection?._id === PLAN.to._id);
  console.log(`   PUT ${put.status} | read back ${ok ? "OK" : "DIFFERS"}`);
  if (!ok) { process.exitCode = 1; continue; }
  const p = await publish(it._id);
  console.log(`   publish ${p?.status ?? JSON.stringify(p).slice(0, 80)}`);
  if (it.IsActive) console.log(`   activate ${(await call("PUT", `/flow/2/${A}/integration/${it._id}/activate?_application_id=${PLAN.app}`, {})).status}`);
  const f = (await call("GET", `/flow/2/${A}/integration/${it._id}?_application_id=${PLAN.app}`)).body || {};
  console.log(`   now: IsActive ${f.IsActive} | Status ${f.Status}${f.IsActive !== it.IsActive ? "  << CHANGED" : ""}`);
}
console.log(apply ? "done" : "dry run", "| steps:", total);
