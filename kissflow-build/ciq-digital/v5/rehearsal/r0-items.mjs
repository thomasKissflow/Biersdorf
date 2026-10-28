// R0b (read-only): list every live item of the two ZZ test processes and where it sits.
// Sources: item ids created in earlier spike logs (spikes/runtime-requests.jsonl, create responses) + /myitems
// (the key user started them all). Each item is read with the admin GET. Writes r0-items-result.json.
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { w, A, Q, CASE, POINT, adminGet, ctx, save } from "./lib.mjs";

const ids = { [CASE]: new Set(), [POINT]: new Set() };
const logs = ["runtime-requests.jsonl", "graft-requests.jsonl"].map((f) => fileURLToPath(new URL(`../../spikes/${f}`, import.meta.url)));
logs.push(fileURLToPath(new URL("./requests.jsonl", import.meta.url)));
for (const f of logs) {
  if (!existsSync(f)) continue;
  for (const line of readFileSync(f, "utf8").split("\n").filter(Boolean)) {
    let e; try { e = JSON.parse(line); } catch { continue; }
    for (const p of [CASE, POINT]) {
      if (e.method === "POST" && e.path?.startsWith(`/process/2/${A}/${p}?`)) {
        const res = typeof e.res === "string" ? (() => { try { return JSON.parse(e.res); } catch { return {}; } })() : e.res;
        if (res?._id) ids[p].add(res._id);
      }
      const m = e.path?.match(new RegExp(`/process/2/${A}/(?:admin/)?${p}/(Pk[A-Za-z0-9]+)`));
      if (m) ids[p].add(m[1]);
    }
  }
}
const out = { at: new Date().toISOString(), myitems: {}, items: {} };
for (const p of [CASE, POINT]) {
  const r = await w.call("GET", `/process/2/${A}/${p}/myitems?page_number=1&page_size=200&${Q}`);
  const rows = Array.isArray(r.body) ? r.body : r.body?.Data || [];
  out.myitems[p] = { status: r.status, count: rows.length };
  for (const x of rows) if (x._id) ids[p].add(x._id);
  out.items[p] = [];
  for (const id of ids[p]) {
    const s = await adminGet(p, id);
    out.items[p].push({ id, status: s._status ?? s.message ?? "?", steps: ctx(s).map((c) => c.step), name: s.Name, created: s._created_at });
  }
}
save("r0-items-result.json", out);
for (const p of [CASE, POINT]) {
  console.log(p, out.myitems[p], "known ids:", out.items[p].length);
  const inProg = out.items[p].filter((x) => x.steps.length);
  for (const x of inProg) console.log("  in progress:", x.id, x.status, JSON.stringify(x.steps));
  const tally = {}; for (const x of out.items[p]) tally[x.status] = (tally[x.status] || 0) + 1; console.log("  status tally:", JSON.stringify(tally));
}
