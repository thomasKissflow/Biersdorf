// P-1 fix (Thomas, 21 Oct: "prove on spike, then section Editable"; the spike's own submit was refused, so the proof
// runs on CIQP Request "keep" first): give a form's Details section an Editable step permission at the named steps, so a
// screen's user-route save is accepted there. Every field permission stays exactly as Thomas set it.
//   node section-perm.mjs <flow> "<step name>" ["<step name>" …]           dry run: re-reads the live draft, lists the change
//   node section-perm.mjs <flow> "<step name>" … --apply                  backs up, PUTs the draft, publishes, reads back
import { writeFileSync, mkdirSync } from "node:fs";
import { call, w, A, APP, PORTAL } from "./lib.mjs";

const args = process.argv.slice(2), apply = args.includes("--apply");
const [flow, ...steps] = args.filter((a) => a !== "--apply");
const app = flow.startsWith("CIQP_") ? PORTAL : APP;
if (A !== "AcDOSunMEpSA") throw new Error("not the dev sandbox");
if (!["CIQP_Request_A00", "CIQP_Query_A00", "CIQ_Case_A00", "CIQ_Open_Point_A00", "CIQ_Review_A00"].includes(flow)) throw new Error(`${flow}: not a flow of this fix`); // Open Point and Review: on Thomas's instruction, 21 Oct (the app session holds its writes)
const path = `/metadata/2/${A}/process/${flow}/draft?_application_id=${app}`;
const d0 = await call("GET", path);
if (d0.status !== 200 || typeof d0.body !== "object" || !d0.body[flow]) throw new Error(`draft read ${d0.status}`);
const draft = d0.body, next = structuredClone(draft);
const section = Object.values(draft).find((e) => e?.Kind === "Column" && e.Type === "Section" && e.Name === "Details");
if (!section) throw new Error("no Details section");
const changes = [];
for (const name of steps) {
  const act = Object.values(draft).find((e) => e?.Kind === "Activity" && e.Name === name);
  if (!act) throw new Error(`no step "${name}"`);
  const has = (act["Activity::Permission"] || []).map((id) => draft[id]).find((p) => p?.Column === section.Id);
  if (has) { changes.push(`${name}: the section already has ${has.Permission} (unchanged)`); continue; }
  const id = `Permission_sp${Date.now().toString(36)}${changes.length}`;
  next[id] = { Id: id, Kind: "Permission", Column: section.Id, Permission: "Editable", Activity: act.Id };
  next[act.Id]["Activity::Permission"] = [...(next[act.Id]["Activity::Permission"] || []), id];
  next[section.Id]["Column::Permission"] = [...(next[section.Id]["Column::Permission"] || []), id];
  changes.push(`${name} (${act.Id}): Details section → Editable (${id})`);
}
console.log(`${flow}:\n  ${changes.join("\n  ")}`);
if (!apply) { console.log("dry run: nothing written"); process.exit(0); }
if (!changes.some((c) => c.includes("→ Editable"))) { console.log("nothing to change"); process.exit(0); }
mkdirSync(new URL("./backups/", import.meta.url), { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "");
writeFileSync(new URL(`./backups/${flow}-before-section-perm-${stamp}.json`, import.meta.url), JSON.stringify(draft));
const put = await w.putDraft("process", flow, next).then((r) => r, (e) => ({ status: 0, body: String(e.message) }));
if (put.status >= 300 || put.status === 0) throw new Error(`PUT ${put.status} ${JSON.stringify(put.body).slice(0, 300)}`);
const pub = await call("POST", `/metadata/2/${A}/process/${flow}/publish?_application_id=${app}`, {});
if (pub.status >= 300) throw new Error(`publish ${pub.status} ${JSON.stringify(pub.body).slice(0, 300)}`);
const d1 = (await call("GET", path)).body;
const back = steps.map((name) => {
  const act = Object.values(d1).find((e) => e?.Kind === "Activity" && e.Name === name);
  const p = (act?.["Activity::Permission"] || []).map((id) => d1[id]).find((x) => x?.Column === section.Id);
  return `${name}: ${p?.Permission ?? "MISSING"}`;
});
console.log(`PUT ${put.status}, publish ${pub.status}; read back: ${back.join("; ")}`);
