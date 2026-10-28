// Read-only: the Kissflow Process connector's definition (3.7.6), and the action entries we use (fields of each).
import { writeFileSync } from "node:fs";
import { call, A } from "./integ-lib.mjs";
const r = await call("GET", `/connector/2/${A}/ComaBsL8ZTSMM/metadata/3.7.6`);
writeFileSync(new URL("./connector-process-3.7.6.json", import.meta.url), JSON.stringify(r.body, null, 1));
const b = r.body || {};
for (const id of ["CreateAndSubmitItem", "UpdateAnItem", "Action_Kh4Jb2AoG", "Action_admin_skip_complete", "Action_-SkflzwKj", "Action_-2Kg0WTjS"]) {
  const e = b[id];
  console.log(id, e ? JSON.stringify({ Name: e.Name, Type: e.Type, Description: e.Description, keys: Object.keys(e) }).slice(0, 400) : "(absent)");
}
