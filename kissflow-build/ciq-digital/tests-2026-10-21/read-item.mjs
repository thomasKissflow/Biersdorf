// Read-only: admin GET of one process item (selected fields), paced 2.5 s, no retry, stops on 429/HTML.
//   node read-item.mjs <proc> <id> [app] [field,field,...]
import { client } from "../../lib/kf.mjs";
const kf = client({ readOnly: true });
if (kf.acc !== "AcDOSunMEpSA" || kf.domain !== "dev-beiersdorf.kissflow.eu") throw new Error("not dev");
const [proc, id, app = "CIQ_Digital_A00", fields] = process.argv.slice(2);
await new Promise((r) => setTimeout(r, 2500));
const r = await kf.call("GET", `/process/2/${kf.acc}/admin/${proc}/${id}?_application_id=${app}`, undefined, { retries: 0 });
if (r.status === 429 || (typeof r.body === "string" && /<html|just a moment/i.test(r.body))) { console.log("STOP", r.status); process.exit(2); }
const b = r.body || {};
const keys = fields ? fields.split(",") : ["_status", "_current_step", "_modified_at"];
console.log(r.status, JSON.stringify(Object.fromEntries(keys.map((k) => [k, b[k] ?? null]))), JSON.stringify((b._current_context || []).map((c) => ({ step: c._context_current_step, to: (c._context_assigned_to || []).map((a) => a.Name) }))));
