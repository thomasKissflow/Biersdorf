// A LIVE hand-off, exactly as the deployed app sends it: the webhook URL from the Settings row (SET:current
// Payload_JSON.webhooks; never printed), a text/plain POST of the JSON payload. ZZT payloads only.
//   live-hook.mjs <code> '<json payload>'
import { call, A } from "./integ-lib.mjs";
const [code, json] = process.argv.slice(2);
const payload = JSON.parse(json);
const rows = (await call("POST", `/form/2/${A}/CIQ_Config_Version_A00/list?page_number=1&page_size=100&_application_id=CIQ_Digital_A00`, {})).body;
const set = (Array.isArray(rows) ? rows : rows?.Data || []).find((r) => r.Config_Key === "SET:current");
if (!set) throw new Error("no SET:current row");
const url = JSON.parse(set.Payload_JSON || "{}")?.webhooks?.[code];
if (!url || !/^https:\/\//.test(url)) throw new Error(`no https webhook for ${code} in SET:current`);
const r = await fetch(url, { method: "POST", headers: { "Content-Type": "text/plain" }, body: JSON.stringify(payload) });
console.log(code, "webhook POST", r.status, (await r.text()).slice(0, 200));
