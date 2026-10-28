// Read-only: the subscribed connectors and the triggers/actions of the ones the integrations use.
//   node kissflow-build/night-2026-10-20/read-connectors.mjs
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { writer } from "../lib/meta.mjs";
const here = (f) => fileURLToPath(new URL(f, import.meta.url));
const w = writer(here("./read-requests.jsonl"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const subs = (await w.call("GET", `/connector/2/${w.acc}/subscription?page_number=1&page_size=200`)).body;
const list = Array.isArray(subs) ? subs : subs?.Data || [];
console.log("subscribed:", list.map((c) => `${c.Name} ${c.VersionName || c.Version} (${c._id})`).join("; "));
const want = /^(Kissflow Process|Kissflow Dataform|HTTP|Webhooks by Kissflow|Scheduler|Email)/i;
const out = {};
for (const c of list.filter((c) => want.test(c.Name))) {
  await sleep(1300);
  const r = await w.call("GET", `/connector/2/${w.acc}/${c._id}/metadata/${c.VersionName || c.Version}`);
  const b = r.body || {};
  const ents = Object.values(b).filter((v) => v && typeof v === "object" && (v.Kind === "Trigger" || v.Kind === "Action"));
  out[c.Name] = { id: c._id, version: c.VersionName || c.Version, status: r.status, entities: ents.map((e) => ({ Kind: e.Kind, Id: e.Id, Name: e.Name, Type: e.Type })) };
  console.log("##", c.Name, r.status, ents.map((e) => `${e.Kind[0]}:${e.Id}=${e.Name}`).join(" | ").slice(0, 1500));
}
writeFileSync(here("./connectors.json"), JSON.stringify(out, null, 1));
