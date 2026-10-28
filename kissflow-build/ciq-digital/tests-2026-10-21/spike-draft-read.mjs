// Read-only: the live draft of CIQ ZZ Spike Point (saved), with the Spike review step's permissions and the section column.
import { writeFileSync } from "node:fs";
import { client } from "../../lib/kf.mjs";
const kf = client({ readOnly: true });
if (kf.acc !== "AcDOSunMEpSA" || kf.domain !== "dev-beiersdorf.kissflow.eu") throw new Error("not dev");
await new Promise((r) => setTimeout(r, 2500));
const r = await kf.call("GET", `/metadata/2/${kf.acc}/process/CIQ_ZZ_Spike_Point_A00/draft?_application_id=CIQ_Digital_A00`, undefined, { retries: 0 });
if (r.status !== 200 || typeof r.body !== "object") { console.log("bad read", r.status); process.exit(2); }
const d = r.body;
writeFileSync(new URL(`./spike-point-draft-${new Date().toISOString().replace(/[:.]/g, "")}.json`, import.meta.url), JSON.stringify(d, null, 1));
const acts = Object.values(d).filter((e) => e?.Kind === "Activity");
const rev = acts.find((a) => a.Name === "Spike review");
const cols = Object.fromEntries(Object.values(d).filter((e) => e?.Kind === "Column").map((c) => [c.Id, c]));
console.log("root", d.Root, "| Spike review", rev?.Id, "| perms", (rev?.["Activity::Permission"] || []).length);
for (const pid of rev?.["Activity::Permission"] || []) { const p = d[pid]; const c = cols[p.Column]; console.log("  ", pid, c?.Type, c?.Type === "Section" ? c.Name : String(c?.["Column::Field"]), p.Permission); }
console.log("sections:", Object.values(cols).filter((c) => c.Type === "Section").map((c) => `${c.Id}:${c.Name}`).join(", "));
