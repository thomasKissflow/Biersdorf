// Read-only: members of the spike roles, and the caller's identity on the task.
import { fileURLToPath } from "node:url";
import { writer } from "../../lib/meta.mjs";
const w = writer(fileURLToPath(new URL("./runtime-requests.jsonl", import.meta.url)));
const A = w.acc, APP = "CIQ_Digital_A00";
const list = (await w.call("GET", `/app_role/2/${A}/list?_application_id=${APP}`)).body;
const roles = (list?.Data || list || []).filter((r) => /Spike/.test(r.Name));
for (const r of roles) {
  const g = (await w.call("GET", `/app_role/2/${A}/${r._id}?_application_id=${APP}`)).body || {};
  console.log(r._id, r.Name, "UserCount:", g.UserCount, "Users:", JSON.stringify((g.Users || g.Members || []).map((u) => u.Name || u._id)));
}
