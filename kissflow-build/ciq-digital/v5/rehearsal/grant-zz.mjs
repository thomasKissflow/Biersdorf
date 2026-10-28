// The ONE grant the app session cleared (2026-10-14, 23:25 IST): "Admin / Developer" as Member + InitiateItems on the two
// ZZ TEST processes only, so the key (Thomas) can submit Start again. Reads members before and after.
import { w, A, Q, CASE, POINT, save, sleep } from "./lib.mjs";
const ROLE = { _id: "RoEK3_3Jy9XU", Name: "Admin / Developer", _application_id: "CIQ_Digital_A00", Kind: "AppRole", Role: "Member", Permission: ["InitiateItems"] };
const out = { at: new Date().toISOString() };
const members = async (p) => { const m = await w.call("GET", `/flow/2/${A}/process/${p}/member?${Q}`); if (m.status !== 200 || !Array.isArray(m.body)) throw new Error(`members ${p} → ${m.status}: not a JSON array`); return m.body.map((x) => ({ id: x._id, name: x.Name, role: x.Role, perm: x.Permission })); };
for (const p of [CASE, POINT]) {
  const before = await members(p);
  let r = await w.call("POST", `/flow/2/${A}/process/${p}/member/batch?${Q}`, [ROLE]);
  if (r.status === 423) { await sleep(2000); r = await w.call("POST", `/flow/2/${A}/process/${p}/member/batch?${Q}`, [ROLE]); }
  const after = await members(p);
  const got = after.find((x) => x.id === ROLE._id);
  out[p] = { before, post: r.status, postBody: r.status >= 300 ? JSON.stringify(r.body).slice(0, 300) : undefined, after, ok: !!got && got.role === "Member" && (got.perm || []).includes("InitiateItems") };
}
save("grant-result.json", out);
console.log(JSON.stringify(out, null, 1));
