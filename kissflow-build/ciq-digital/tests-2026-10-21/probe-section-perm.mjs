// Probe (21 Oct): does the assignee route update a field that is Editable at a step whose section has NO step permission?
// No-op write: the field's CURRENT value goes back. Only a ledger item. Paced 2.5 s, no retry, stops on 429/HTML.
//   node probe-section-perm.mjs <proc> <itemId> <app> <field>
import { readFileSync } from "node:fs";
import { client } from "../../lib/kf.mjs";
const [proc, id, app, field] = process.argv.slice(2);
if (!readFileSync(new URL("./ledger.jsonl", import.meta.url), "utf8").includes(`"id":"${id}"`)) throw new Error("not a ledger item");
const kf = client({ readOnly: false });
if (kf.acc !== "AcDOSunMEpSA" || kf.domain !== "dev-beiersdorf.kissflow.eu") throw new Error("not dev");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const call = async (m, p, b) => { await sleep(2500); const r = await kf.call(m, p, b, { retries: 0 }); if (r.status === 429 || (typeof r.body === "string" && /<html|just a moment/i.test(r.body))) { console.log("STOP", r.status); process.exit(2); } return r; };
const g = (await call("GET", `/process/2/${kf.acc}/admin/${proc}/${id}?_application_id=${app}`)).body;
const ctx = (g._current_context || [])[0] || {};
const act = ctx._context_activity_instance_id;
console.log("step:", g._current_step, "| assigned:", (ctx._context_assigned_to || []).map((a) => a.Name).join(","), "| act:", act, "|", field, "=", JSON.stringify(g[field]));
if (!act) throw new Error("no activity instance");
const u = await call("POST", `/process/2/${kf.acc}/${proc}/${id}/${act}?_application_id=${app}`, { [field]: g[field] });
console.log("update (same value):", u.status, typeof u.body === "object" ? JSON.stringify(u.body).slice(0, 300) : String(u.body).slice(0, 200));
const g2 = (await call("GET", `/process/2/${kf.acc}/admin/${proc}/${id}?_application_id=${app}`)).body;
console.log("after:", field, "=", JSON.stringify(g2[field]), "| modified", g._modified_at, "→", g2._modified_at);
