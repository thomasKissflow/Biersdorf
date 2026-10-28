// Deletes every item the 21 Oct night tests created (manifest.json), in the dev sandbox only.
//   node cleanup.mjs            dry run: lists what would be deleted, and reads each item's current state
//   node cleanup.mjs --apply    deletes them, then reads each back (404 = gone) and marks it in manifest.json
//   … --keep <id,id>            leaves those items in place
// Order: portal queries and requests first, then the app's open points, reviews and cases, then the forms.
import { call, A, manifest, markDeleted } from "./lib.mjs";

const apply = process.argv.includes("--apply");
const ORDER = ["CIQP_Query_A00", "CIQP_Request_A00", "CIQ_Open_Point_A00", "CIQ_Review_A00", "CIQ_Case_A00"];
const rank = (x) => (x.kind === "form" ? 10 : ORDER.indexOf(x.flow) < 0 ? 9 : ORDER.indexOf(x.flow));
const path = (x) => (x.kind === "form" ? `/form/2/${A}/${x.flow}/${x.id}?_application_id=${x.app}` : `/process/2/${A}/admin/${x.flow}/${x.id}?_application_id=${x.app}`);
const ki = process.argv.indexOf("--keep"), keep = new Set(ki > 0 ? process.argv[ki + 1].split(",") : []); // items kept for a later check
// 22 Oct night: items a doubled runner created but its twin's manifest write lost are kept in manifest-orphans.json
import { existsSync, readFileSync } from "node:fs";
const orphanFile = new URL("./manifest-orphans.json", import.meta.url);
for (const o of existsSync(orphanFile) ? JSON.parse(readFileSync(orphanFile, "utf8")).items : []) if (!manifest.items.some((x) => x.id === o.id)) manifest.items.push(o);
const todo = manifest.items.filter((x) => !x.deleted && !keep.has(x.id)).sort((a, b) => rank(a) - rank(b));
if (!/^AcDOSunMEpSA$/.test(A)) { console.error(`refused: account ${A} is not the dev sandbox`); process.exit(1); }
console.log(`${apply ? "DELETING" : "dry run:"} ${todo.length} items in ${A}`);
let gone = 0, left = 0;
for (const x of todo) {
  const before = await call("GET", path(x));
  const state = before.status === 200 ? `${before.body?._status ?? "form"} ${before.body?._current_step ?? ""}`.trim() : `GET ${before.status}`;
  if (!apply) { console.log(`  would delete ${x.flow} ${x.id} (${x.note}) — now ${state}`); continue; }
  if (before.status === 404) { markDeleted(x.id, "already gone (GET 404)"); gone++; continue; }
  const d = await call("DELETE", path(x));
  const g = await call("GET", path(x));
  console.log(`  ${x.flow} ${x.id} (${x.note}): DELETE ${d.status}, GET ${g.status}`);
  if (g.status === 404) { markDeleted(x.id, `DELETE ${d.status}, GET 404`); gone++; } else left++;
}
if (apply) console.log(`done: ${gone} gone, ${left} still there${left ? " (see above)" : ""}`);
