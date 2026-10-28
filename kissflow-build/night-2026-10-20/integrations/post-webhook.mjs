// Posts a JSON payload to an integration's webhook (URL kept in state.json, never printed), as the screens will:
// Content-Type text/plain, body = the JSON text.   node post-webhook.mjs <KEY> '<json>'   |   node post-webhook.mjs <KEY> --set-url <url>
import { load, save } from "./integ-lib.mjs";
const [KEY, a, b] = process.argv.slice(2);
const s = load();
const st = (s.integrations[KEY] ||= {});
if (a === "--set-url") { if (!/\/integration\/2\/[A-Za-z0-9]+\/webhook\/[A-Za-z0-9_-]{30,}$/.test(b || "")) throw new Error("not a webhook URL"); st.webhookUrl = b; save(s); console.log(KEY, "URL stored"); process.exit(0); }
if (!st.webhookUrl) throw new Error(`no webhook URL for ${KEY}`);
JSON.parse(a);
const r = await fetch(st.webhookUrl, { method: "POST", headers: { "Content-Type": "text/plain;charset=UTF-8" }, body: a });
console.log(KEY, "webhook", r.status, (await r.text()).slice(0, 120));
