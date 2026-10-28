// Offline only: apply the B2 "steps" mutation to the live OP draft snapshot in memory and check hygiene. No calls.
import { readFileSync, writeFileSync } from "node:fs";
import { removeActivities } from "../rehearsal/lib.mjs";
const b = JSON.parse(readFileSync(new URL("./live/CIQ_Open_Point_A00.draft.json", import.meta.url), "utf8"));
const refsTo = (id) => Object.entries(b).flatMap(([k, v]) => v && typeof v === "object" ? Object.entries(v).filter(([p, val]) => (Array.isArray(val) ? val : [val]).includes(id)).map(([p]) => `${k}.${p}`) : []);
console.log("refs to Activity_4k7uck before:", refsTo("Activity_4k7uck").filter((r) => !r.startsWith("Activity_4k7uck.") && !/^Permission_|^Resource_|^Expression_/.test(r)));
const removed = removeActivities(b, ["Activity_4k7uck"]);
console.log("removed", removed);
writeFileSync(new URL("./sim-op-after-steps.json", import.meta.url), JSON.stringify(b));
