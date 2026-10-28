// After-generate switch (workflow.meta.after_generate_switches.CIQ_Open_Point_A00.send_back = "ON only at OPNT_R_*"),
// Thomas approved the REST follow-ups incl. "the send-back switch on review steps" (chat, 2026-10-09).
// Same shape as tested on the Spike Point (SPIKES "Night tests"): IsSendbackEnabled=true on each review step's
// model-level permission. Whether it is the right switch stays [unverified] until a real user sends back.
// The original draft is saved first; `--revert` restores it.
import { fileURLToPath } from "node:url";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { writer } from "../../lib/meta.mjs";
const here = (f) => fileURLToPath(new URL(f, import.meta.url));
const w = writer(here("./sendback-requests.jsonl"));
const P = "CIQ_Open_Point_A00";
const BEFORE = here("./live/process/CIQ_Open_Point_A00.before-sendback.json");
if (process.argv.includes("--revert")) {
  const orig = JSON.parse(readFileSync(BEFORE, "utf8"));
  const p = await w.putDraft("process", P, orig); const q = await w.publish("process", P);
  console.log("revert: put", p.status, "publish", q.status); process.exit(p.status < 300 && q.status < 300 ? 0 : 1);
}
const d = (await w.getDraft("process", P)).body;
if (!existsSync(BEFORE)) writeFileSync(BEFORE, JSON.stringify(d, null, 1));
const acts = Object.values(d).filter((e) => e && e.Kind === "Activity" && /^Review – /.test(e.Name || ""));
const done = [];
for (const a of acts) {
  const mp = (a["Activity::Permission"] || []).map((id) => d[id]).find((p) => p && d[p.Column]?.Type === "Model");
  if (!mp) { console.log("no model-level permission on", a.Name); process.exit(2); }
  mp.IsSendbackEnabled = true; done.push(`${a.Name} → ${mp.Id}`);
}
if (acts.length !== 6) { console.log("expected 6 review steps, found", acts.length); process.exit(2); }
const put = await w.putDraft("process", P, d);
console.log("put draft:", put.status, put.status >= 300 ? JSON.stringify(put.body).slice(0, 300) : "");
if (put.status >= 300) process.exit(1);
const pub = await w.publish("process", P);
console.log("publish:", pub.status, pub.status >= 300 ? JSON.stringify(pub.body).slice(0, 300) : "");
if (pub.status >= 300) process.exit(1);
const back = (await w.getDraft("process", P)).body;
const ok = acts.every((a) => {
  const mp = (back[a.Id]?.["Activity::Permission"] || []).map((id) => back[id]).find((p) => p && back[p.Column]?.Type === "Model");
  return mp?.IsSendbackEnabled === true;
});
console.log(done.join("\n"));
console.log("read back: IsSendbackEnabled on all 6 review steps =", ok, "| PublishedAt", back.PublishedAt);
process.exit(ok ? 0 : 1);
