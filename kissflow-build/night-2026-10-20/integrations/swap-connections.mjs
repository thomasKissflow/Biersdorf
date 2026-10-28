// 26 Oct (Thomas): replace the old API-built "CIQ ZZ Spike" connections in every CIQ integration with Thomas's access-key
// connections, so that in prod he remaps them by hand in the builder. Only each step's `Connection` object changes;
// a backup of every draft is written first; then PUT, read back, publish, and switch on again what was on.
//   node swap-connections.mjs            dry run (what would change)
//   node swap-connections.mjs --apply
import { call, A, backup, getDraft, putDraft, publish } from "./integ-lib.mjs";
const apply = process.argv.includes("--apply");
const SPIKE_P = "CnEKHrHqXRKB", SPIKE_D = "CnEKHrH5GzkY";
const TO = {
  CIQ_Digital_A00: { [SPIKE_P]: { _id: "CnEPk_z1eYLu", Name: "Kissflow Process - Thomas Access Keys - Trigger" }, [SPIKE_D]: { _id: "CnEPkdTPO3ZO", Name: "Kissflow Dataform - Thomas Access Keys" } },
  CIQ_Supplier_Portal_A00: { [SPIKE_P]: { _id: "CnEPh_RViEXP", Name: "Kissflow Process - Thomas Access Keys" }, [SPIKE_D]: { _id: "CnEPkiV8lark", Name: "Kissflow Dataform - Thomas's Access Keys" } },
};
// the legacy integrations that are OFF and unused stay as they are
const SKIP = /^(Test|CIQ Mail – send outbox mail|CIQ Z[12] )/;
let total = 0;
for (const app of Object.keys(TO)) {
  const l = (await call("GET", `/flow/2/${A}/integration?_application_id=${app}&page_number=1&page_size=100`)).body;
  for (const it of Array.isArray(l) ? l : l?.Data || []) {
    if (SKIP.test(it.Name || "")) continue;
    const b = await getDraft(it._id);
    const root = b[b.Root];
    const ids = [...(root["Integration::Trigger"] || []), ...(root["Integration::Action"] || [])];
    const hits = ids.filter((id) => TO[app][b[id]?.Connection?._id]);
    if (!hits.length) continue;
    total += hits.length;
    console.log(`${it.IsActive ? "ON " : "off"} ${it.Name}: ${hits.length} step(s) → ${[...new Set(hits.map((id) => TO[app][b[id].Connection._id].Name))].join(" / ")}`);
    if (!apply) continue;
    backup(it._id, b, "before-swap-connections");
    for (const id of hits) b[id] = { ...b[id], Connection: { ...TO[app][b[id].Connection._id] } };
    const put = await putDraft(it._id, b);
    const back = await getDraft(it._id);
    const left = JSON.stringify(back).match(new RegExp(`${SPIKE_P}|${SPIKE_D}`, "g")) || [];
    const ok = put.status < 300 && hits.every((id) => back[id]?.Connection?._id === TO[app][b[id].Connection._id]?._id || Object.values(TO[app]).some((c) => c._id === back[id]?.Connection?._id));
    console.log(`   PUT ${put.status} | read back ${ok ? "OK" : "DIFFERS"} | old ids left in the draft: ${left.length}`);
    if (!ok) { process.exitCode = 1; continue; }
    const p = await publish(it._id);
    console.log(`   publish ${p?.status ?? JSON.stringify(p).slice(0, 80)}`);
    if (it.IsActive) {
      const a = await call("PUT", `/flow/2/${A}/integration/${it._id}/activate?_application_id=${app}`, {});
      console.log(`   activate ${a.status}`);
    }
    const f = (await call("GET", `/flow/2/${A}/integration/${it._id}?_application_id=${app}`)).body || {};
    console.log(`   now: IsActive ${f.IsActive} | Status ${f.Status}${f.IsActive !== it.IsActive ? "  << CHANGED" : ""}`);
  }
}
console.log(apply ? "done" : "dry run", "| steps:", total);
