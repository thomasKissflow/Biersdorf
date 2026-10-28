// The supplier's uploads at "keep the CIQ up to date" (21 Oct, part of Thomas's permission fix): the Uploads table's
// existing Editable permission at "keep" is attached to the table's column, the way the builder stores it (only the
// fill-in one was). No value changes.   node uploads-keep-ref.mjs [--apply]
import { writeFileSync } from "node:fs";
import { call, w, A, PORTAL } from "./lib.mjs";
const apply = process.argv.includes("--apply"), FLOW = "CIQP_Request_A00";
if (A !== "AcDOSunMEpSA") throw new Error("not the dev sandbox");
const path = `/metadata/2/${A}/process/${FLOW}/draft?_application_id=${PORTAL}`;
const d0 = await call("GET", path);
if (d0.status !== 200 || !d0.body?.[FLOW]) throw new Error(`draft read ${d0.status}`);
const draft = d0.body, next = structuredClone(draft);
const col = Object.values(draft).find((e) => e?.Kind === "Column" && e.Type === "Model" && e.Name === "Uploads");
const keep = Object.values(draft).find((e) => e?.Kind === "Activity" && e.Name === "Supplier: keep the CIQ up to date");
const p = (keep["Activity::Permission"] || []).map((id) => draft[id]).find((x) => x?.Column === col.Id);
if (!p) throw new Error("no Uploads permission at keep");
const refs = col["Column::Permission"] || [];
if (refs.includes(p.Id)) { console.log("already attached:", p.Id, p.Permission); process.exit(0); }
if (refs.some((r) => draft[r]?.Activity === keep.Id)) throw new Error("another keep permission is attached already");
next[col.Id]["Column::Permission"] = [...refs, p.Id];
console.log(`Uploads (${col.Id}) at keep: attach ${p.Id} (${p.Permission})`);
if (!apply) { console.log("dry run"); process.exit(0); }
writeFileSync(new URL(`./backups/${FLOW}-before-uploads-keep-${new Date().toISOString().replace(/[:.]/g, "")}.json`, import.meta.url), JSON.stringify(draft));
const put = await w.putDraft("process", FLOW, next).then((r) => r, (e) => ({ status: 0, body: String(e.message) }));
if (put.status >= 300 || put.status === 0) throw new Error(`PUT ${put.status}`);
const pub = await call("POST", `/metadata/2/${A}/process/${FLOW}/publish?_application_id=${PORTAL}`, {});
if (pub.status >= 300) throw new Error(`publish ${pub.status}`);
const d1 = (await call("GET", path)).body;
console.log(`PUT ${put.status}, publish ${pub.status}; read back attached: ${(d1[col.Id]["Column::Permission"] || []).includes(p.Id)}`);
