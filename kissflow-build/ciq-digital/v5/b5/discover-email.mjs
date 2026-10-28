// READ-ONLY: save the Email connector's metadata (SendEmail input fields) for the B5 build.
import { writeFileSync } from "node:fs";
import { client } from "../../../lib/kf.mjs";
const kf = client({ readOnly: true });
await new Promise((r) => setTimeout(r, 1200));
const r = await kf.get(`/connector/2/${kf.acc}/CoOj46v9fVh37/metadata/1.0.6`);
if (r.status !== 200 || typeof r.body !== "object") throw new Error(`STOP: ${r.status}`);
writeFileSync(new URL("./email-connector-1.0.6.json", import.meta.url), JSON.stringify(r.body, null, 1));
const b = r.body, se = b.SendEmail;
console.log(JSON.stringify({ keys: Object.keys(se), auth: b.Authentication001 }, null, 1));
for (const f of se["InputFields::Field"] || []) console.log(JSON.stringify(b[f]));
