// Spike K-06 / K-21: what can a role with Member["View"] or Member[] do on a process?
// On the throwaway ZZ spike process, the key's user is reached ONLY through the portal Admin role grant.
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { writer } from "../../lib/meta.mjs";
const P = "CIQ_Supplier_Portal_A00", PROC = "ZZ_Spike_Assignee_A00", ADMIN_ROLE = "RoEK3_yhR4wx", ME = "UsEJUfjYLM8Y";
const w = writer(fileURLToPath(new URL("./spike-requests.jsonl", import.meta.url)));
const A = w.acc, results = [];
const members = async () => (await w.call("GET", `/flow/2/${A}/process/${PROC}/member?_application_id=${P}`)).body;
for (const perm of [["View"], [], ["InitiateItems"]]) {
  const g = await w.call("POST", `/flow/2/${A}/process/${PROC}/member/batch?_application_id=${P}`, [{ _id: ADMIN_ROLE, Name: "Admin", _application_id: P, Role: "Member", Permission: perm, Kind: "AppRole" }]);
  const m = (Array.isArray(await members()) ? await members() : []).map((x) => `${x.Name}:${x.Role}${JSON.stringify(x.Permission)}`);
  const cr = await w.call("POST", `/process/2/${A}/${PROC}?_application_id=${P}`, { Probe_Title: `grant ${JSON.stringify(perm)}`, Probe_A1: { _id: ME } });
  const sub = cr.body?._id ? await w.call("POST", `/process/2/${A}/${PROC}/${cr.body._id}/${cr.body._activity_instance_id}/submit?_application_id=${P}`, {}) : { status: -1 };
  const del = cr.body?._id ? await w.call("DELETE", `/process/2/${A}/admin/${PROC}/${cr.body._id}?_application_id=${P}`) : { status: -1 };
  const r = { permission: perm, grant: g.status, membersAfterGrant: m, create: cr.status, submit: sub.status, submitErr: sub.status >= 300 ? sub.body?.en_message : undefined, cleanup: del.status };
  results.push(r); console.log(JSON.stringify(r));
}
writeFileSync(new URL("./k21-result.json", import.meta.url), JSON.stringify(results, null, 2));
