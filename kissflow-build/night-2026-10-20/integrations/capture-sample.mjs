// Captures a webhook trigger's test sample over REST (the builder's "Test trigger"): starts the trigger test (it
// listens), POSTs the given payload to the webhook meanwhile, stores the received sample as the trigger's Output +
// IsTested (as the builder does). The integration must be OFF.   node capture-sample.mjs <KEY> '<payload json>'
import { call, A, load, getDraft, putDraft } from "./integ-lib.mjs";
import { SPECS } from "./specs.mjs";
const [KEY, json] = process.argv.slice(2);
const s = load(), st = s.integrations[KEY], spec = SPECS[KEY], T = `Trigger_${KEY}_webhook`;
const payload = { ...JSON.parse(json), idempotencyKey: `ZZT-NT-capture-${KEY}-${Date.now().toString(36)}` };
const listening = call("POST", `/integration/2/${A}/${st.id}/trigger/${T}/test?_application_id=${spec.app}`, {});
await new Promise((r) => setTimeout(r, 6000));
const post = await fetch(st.webhookUrl, { method: "POST", headers: { "Content-Type": "text/plain;charset=UTF-8" }, body: JSON.stringify(payload) });
console.log("webhook POST", post.status);
const t = await listening;
console.log("trigger test", t.status, JSON.stringify(t.body).slice(0, 300));
const got = t.body && typeof t.body === "object" && t.body.status !== "error" && JSON.stringify(t.body).includes(Object.values(JSON.parse(json))[0]);
if (!got) { console.log("NOT captured"); process.exit(1); }
const b = await getDraft(st.id);
b[T] = { ...b[T], Output: t.body, IsTested: true };
console.log("stored", (await putDraft(st.id, b)).status);
