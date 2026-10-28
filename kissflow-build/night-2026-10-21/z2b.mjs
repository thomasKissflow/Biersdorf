// Pass 3, Z2b: every item of the five processes that the night tests did NOT create, read one by one: was any modified
// since the night began? (The admin list rows carry no modified time, so Z2 could not tell.)
import { call, A, APP, PORTAL, manifest, results, scenario, saveResults, procGet, RateLimited } from "./lib.mjs";
const RUN_START = Date.parse("2026-10-20T20:58:00Z");
const mine = new Set(manifest.items.map((i) => i.id));
try {
  const t = scenario("Z2b", "items outside the night tests, read one by one: none modified since the night began (except the app session's own ZZT tests)");
  for (const [flow, app] of [["CIQ_Case_A00", APP], ["CIQ_Review_A00", APP], ["CIQ_Open_Point_A00", APP], ["CIQP_Request_A00", PORTAL], ["CIQP_Query_A00", PORTAL]]) {
    const ids = [];
    for (let page = 1; page <= 20; page++) {
      const r = await call("GET", `/process/2/${A}/admin/${flow}/item?page_number=${page}&page_size=100&_application_id=${app}`);
      const d = Array.isArray(r.body?.Data) ? r.body.Data : [];
      ids.push(...d.map((x) => x._id));
      if (d.length < 100) break;
    }
    const others = ids.filter((id) => !mine.has(id));
    const touched = [], peer = [];
    for (const id of others) {
      const it = await procGet(flow, app, id);
      const code = String(it?.Case_Code || "");
      const mod = Date.parse(it?._modified_at || "");
      if (Number.isFinite(mod) && mod >= RUN_START) (code.startsWith("ZZT") ? peer : touched).push({ id, code, modified: it._modified_at, by: it?._modified_by?.Name });
    }
    t.check(`${flow}: ${ids.length} items, ${others.length} not created tonight by this runner; none of those outside ZZT test data modified since the night began`, !touched.length,
      { touched, peerZztModified: peer.length, peerCodes: [...new Set(peer.map((p) => p.code.slice(0, 12)))] });
  }
  t.done();
  console.log("Z2b done", t.s.pass);
} catch (e) {
  if (e instanceof RateLimited) { console.log("RATE LIMITED", e.message); saveResults(); process.exit(75); }
  throw e;
}
