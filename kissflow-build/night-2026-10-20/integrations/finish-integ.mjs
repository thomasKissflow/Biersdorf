// After a server-side sample capture and passed step tests: put the new sample into the draft trigger's Output (same
// shape as before, only the ids replaced), publish, switch the integration on, read it back.
//   node finish-integ.mjs <KEY> '<payload json>'
import { call, A, load, getDraft, putDraft, publish } from "./integ-lib.mjs";
import { SPECS } from "./specs.mjs";
const [KEY, json] = process.argv.slice(2);
const s = load(), st = s.integrations[KEY], spec = SPECS[KEY], T = `Trigger_${KEY}_webhook`;
const sample = JSON.parse(json);
const b = await getDraft(st.id);
const out = b[T].Output;
const target = out && typeof out === "object" && out.body && typeof out.body === "object" ? out.body : out;
for (const [k, v] of Object.entries(sample)) target[k] = v;
const acts = Object.values(b).filter((e) => e?.Kind === "Action");
if (!b[T].IsTested || acts.some((a) => !a.IsTested)) throw new Error(`untested: ${[T, ...acts.filter((a) => !a.IsTested).map((a) => a.Id)].join(", ")}`);
console.log("draft sample", (await putDraft(st.id, b)).status);
const pub = await publish(st.id);
console.log("publish", pub.status, pub.status >= 300 ? JSON.stringify(pub.body).slice(0, 200) : "");
const act = await call("PUT", `/flow/2/${A}/integration/${st.id}/activate?_application_id=${spec.app}`, {});
console.log("activate", act.status, JSON.stringify({ IsActive: act.body?.IsActive }));
const list = await call("GET", `/flow/2/${A}/integration/?_application_id=${spec.app}&page_number=1&page_size=100`);
const row = (list.body?.Data || list.body || []).find?.((x) => x._id === st.id);
console.log("read back:", JSON.stringify(row ? { Status: row.Status, IsActive: row.IsActive } : list.status));
