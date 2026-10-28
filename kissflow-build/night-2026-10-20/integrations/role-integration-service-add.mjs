// Thomas approved (chat, 2026-10-20): add Thomas (UsEJUfjYLM8Y, the user of the Kissflow Process connection CnEKHrHqXRKB)
// to the app role "Integration service" (RoEKl89I5nGx), so integrations can submit the case steps that role holds (I-2).
// Keeps the role's name, description and any existing members; verifies by GET.
import { writeFileSync } from "node:fs";
import { call, A } from "./integ-lib.mjs";
const APP = "CIQ_Digital_A00", ROLE = "RoEKl89I5nGx";
const THOMAS = { _id: "UsEJUfjYLM8Y", Name: "Thomas", Kind: "User" };
const get = async () => (await call("GET", `/app_role/2/${A}/${ROLE}?_application_id=${APP}`)).body || {};
const before = await get();
writeFileSync(new URL(`./backups/role-${ROLE}.before.json`, import.meta.url), JSON.stringify(before, null, 1));
if (before.Name !== "Integration service") throw new Error(`unexpected role ${before.Name}`);
for (let i = 1; i <= 4; i++) {
  const g = await get();
  const users = g.Members || g.Users || [];
  if (users.some((u) => u._id === THOMAS._id)) { console.log("verified:", g.Name, "members =", users.map((u) => u.Name).join(", "), "| UserCount", g.UserCount); process.exit(0); }
  const r = await call("PUT", `/app_role/2/${A}/${ROLE}?_application_id=${APP}`, { Name: g.Name, Description: g.Description || "", _application_id: APP, Users: [...users.map((u) => ({ _id: u._id, Name: u.Name, Kind: u.Kind || "User" })), THOMAS] });
  console.log(`attempt ${i}: PUT ${r.status}`, r.status >= 300 ? JSON.stringify(r.body).slice(0, 200) : "");
}
console.log("NOT verified after 4 attempts"); process.exit(1);
