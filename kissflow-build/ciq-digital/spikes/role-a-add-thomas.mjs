// Thomas approved (chat, 2026-10-07 night): add Thomas (the key's user, UsEJUfjYLM8Y) to the test role CIQ ZZ Spike Role A only.
// Keeps any existing users. Retry and verify by GET (the PUT is occasionally flaky).
import { fileURLToPath } from "node:url";
import { writer } from "../../lib/meta.mjs";
const w = writer(fileURLToPath(new URL("./runtime-requests.jsonl", import.meta.url)));
const A = w.acc, APP = "CIQ_Digital_A00", ROLE = "RoEKHLFdFsUJ";
const THOMAS = { _id: "UsEJUfjYLM8Y", Name: "Thomas", Kind: "User" };
const get = async () => (await w.call("GET", `/app_role/2/${A}/${ROLE}?_application_id=${APP}`)).body || {};
for (let i = 1; i <= 4; i++) {
  const g = await get();
  const users = g.Members || g.Users || [];
  if (users.some((u) => u._id === THOMAS._id)) { console.log("verified: Role A members =", users.map((u) => u.Name).join(", "), "| UserCount", g.UserCount); process.exit(0); }
  const r = await w.call("PUT", `/app_role/2/${A}/${ROLE}?_application_id=${APP}`, { Name: g.Name, _application_id: APP, Users: [...users.map((u) => ({ _id: u._id, Name: u.Name, Kind: u.Kind || "User" })), THOMAS] });
  console.log(`attempt ${i}: PUT ${r.status}`, r.status >= 300 ? JSON.stringify(r.body).slice(0, 200) : "");
  await new Promise((res) => setTimeout(res, 1500));
}
console.log("NOT verified after 4 attempts"); process.exit(1);
