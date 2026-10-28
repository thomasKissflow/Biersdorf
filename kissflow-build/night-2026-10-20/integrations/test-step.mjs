// Runs the builder's per-step Test over REST and prints the step output.  node test-step.mjs <integrationId> <trigger|action> <entityId> [app]
import { call, A } from "./integ-lib.mjs";
const [id, seg, eid, app = "CIQ_Digital_A00"] = process.argv.slice(2);
const t = await call("POST", `/integration/2/${A}/${id}/${seg}/${eid}/test?_application_id=${app}`, {});
console.log("test", t.status, JSON.stringify(t.body).slice(0, 1500));
await new Promise((r) => setTimeout(r, 2500));
const o = await call("GET", `/integration/2/${A}/${id}/${seg}/${eid}/output?_application_id=${app}`);
console.log("output", o.status, JSON.stringify(o.body).slice(0, 3000));
