// P-1 root cause (21 Oct): Kissflow honours a step permission on the API only when its Column lists it in
// Column::Permission (as the builder UI writes it). The per-field permissions grafted over REST sit only in
// Activity::Permission, so they were ignored. This attaches the EXISTING permissions of the named steps (or all steps) to
// their columns. No permission value changes; nothing is added or removed except those references.
//   node perm-refs.mjs <flow> [--steps "<name>|<name>"] [--apply]
import { writeFileSync, mkdirSync } from "node:fs";
import { call, w, A, APP, PORTAL } from "./lib.mjs";

const args = process.argv.slice(2), apply = args.includes("--apply");
const flow = args[0];
const si = args.indexOf("--steps"), only = si > 0 ? args[si + 1].split("|") : null;
const app = flow.startsWith("CIQP_") ? PORTAL : APP;
if (A !== "AcDOSunMEpSA") throw new Error("not the dev sandbox");
if (!["CIQP_Request_A00", "CIQP_Query_A00", "CIQ_Case_A00"].includes(flow)) throw new Error(`${flow}: not a portal-session flow`);
const path = `/metadata/2/${A}/process/${flow}/draft?_application_id=${app}`;
const d0 = await call("GET", path);
if (d0.status !== 200 || typeof d0.body !== "object" || !d0.body[flow]) throw new Error(`draft read ${d0.status}`);
const draft = d0.body, next = structuredClone(draft);
const acts = Object.values(draft).filter((e) => e?.Kind === "Activity" && (!only || only.includes(e.Name)));
if (only && acts.length !== only.length) throw new Error(`steps not found: ${only.filter((n) => !acts.some((a) => a.Name === n)).join(", ")}`);
let added = 0, dup = 0;
const per = {};
for (const act of acts) {
  const seen = new Set();
  for (const pid of act["Activity::Permission"] || []) {
    const p = draft[pid];
    const col = p && next[p.Column];
    if (!p || p.Kind !== "Permission" || !col || col.Kind !== "Column") continue;
    const refs = col["Column::Permission"] || [];
    // one reference per (step, column): an engine duplicate pair keeps the one already referenced, else the first
    if (seen.has(p.Column) || refs.some((r) => draft[r]?.Activity === act.Id)) { if (!refs.includes(pid)) dup++; seen.add(p.Column); continue; }
    col["Column::Permission"] = [...refs, pid];
    seen.add(p.Column);
    added++;
    per[act.Name] = (per[act.Name] || 0) + 1;
  }
}
console.log(`${flow}: ${added} references to add (${dup} duplicates skipped)`, JSON.stringify(per));
if (!apply) { console.log("dry run: nothing written"); process.exit(0); }
if (!added) { console.log("nothing to change"); process.exit(0); }
mkdirSync(new URL("./backups/", import.meta.url), { recursive: true });
writeFileSync(new URL(`./backups/${flow}-before-perm-refs-${new Date().toISOString().replace(/[:.]/g, "")}.json`, import.meta.url), JSON.stringify(draft));
const put = await w.putDraft("process", flow, next).then((r) => r, (e) => ({ status: 0, body: String(e.message) }));
if (put.status >= 300 || put.status === 0) throw new Error(`PUT ${put.status} ${JSON.stringify(put.body).slice(0, 300)}`);
const pub = await call("POST", `/metadata/2/${A}/process/${flow}/publish?_application_id=${app}`, {});
if (pub.status >= 300) throw new Error(`publish ${pub.status} ${JSON.stringify(pub.body).slice(0, 300)}`);
const d1 = (await call("GET", path)).body;
const refd = new Set(Object.values(d1).filter((e) => e?.Kind === "Column").flatMap((c) => c["Column::Permission"] || []));
const total = Object.values(d1).filter((e) => e?.Kind === "Permission").length;
console.log(`PUT ${put.status}, publish ${pub.status}; read back: ${refd.size} of ${total} permissions now referenced from their column`);
