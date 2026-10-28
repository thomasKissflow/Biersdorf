// Clean-up (verifier finding, 15 Oct): take back the temporary "Admin / Developer" Member grant on the two ZZ TEST processes
// (added by grant-zz.mjs on 14 Oct; before that both flows had no members). Touches nothing else. Reads members back.
import { w, A, Q, CASE, POINT, save, sleep } from "./lib.mjs";
const ROLE_ID = "RoEK3_3Jy9XU";
const out = { at: new Date().toISOString() };
const members = async (p) => { const m = await w.call("GET", `/flow/2/${A}/process/${p}/member?${Q}`); if (m.status !== 200 || !Array.isArray(m.body)) throw new Error(`members ${p} → ${m.status}: not a JSON array`); return m.body.map((x) => ({ id: x._id, name: x.Name, role: x.Role })); };
for (const p of [CASE, POINT]) {
  const before = await members(p);
  await sleep(1200);
  let d = null;
  if (before.some((x) => x.id === ROLE_ID)) {
    d = await w.call("DELETE", `/flow/2/${A}/process/${p}/member/${ROLE_ID}?${Q}`);
    if (d.status === 423) { await sleep(2000); d = await w.call("DELETE", `/flow/2/${A}/process/${p}/member/${ROLE_ID}?${Q}`); }
    await sleep(1200);
  }
  const after = await members(p);
  out[p] = { before, delete: d?.status ?? "not a member", after, ok: !after.some((x) => x.id === ROLE_ID) };
  await sleep(1200);
}
save("revoke-result.json", out);
console.log(JSON.stringify(out, null, 1));
