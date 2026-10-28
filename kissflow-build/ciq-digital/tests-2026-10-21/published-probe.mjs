// Read-only: try the published-metadata routes of one process (status + top-level shape only). Paced, no retry.
import { client } from "../../lib/kf.mjs";
const kf = client({ readOnly: true });
if (kf.acc !== "AcDOSunMEpSA" || kf.domain !== "dev-beiersdorf.kissflow.eu") throw new Error("not dev");
const [proc, app] = process.argv.slice(2);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (const p of [`/metadata/2/${kf.acc}/process/${proc}?_application_id=${app}`, `/metadata/2/${kf.acc}/process/${proc}/published?_application_id=${app}`]) {
  await sleep(2500);
  const r = await kf.call("GET", p, undefined, { retries: 0 });
  if (r.status === 429 || (typeof r.body === "string" && /<html|just a moment/i.test(r.body))) { console.log("STOP", r.status); process.exit(2); }
  const b = r.body;
  const kinds = b && typeof b === "object" ? Object.values(b).reduce((m, e) => (e && e.Kind ? ((m[e.Kind] = (m[e.Kind] || 0) + 1), m) : m), {}) : {};
  console.log(p.split("?")[0].split("/").slice(-2).join("/"), r.status, JSON.stringify(kinds).slice(0, 200), typeof b === "object" ? "" : String(b).slice(0, 120));
  if (r.status === 200 && kinds.Permission) { const fs = await import("node:fs"); fs.writeFileSync(new URL(`./published-${proc}.json`, import.meta.url), JSON.stringify(b)); console.log("saved"); break; }
}
