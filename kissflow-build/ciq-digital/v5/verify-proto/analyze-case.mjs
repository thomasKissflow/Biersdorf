import { readFileSync } from "node:fs";
const L = (n) => JSON.parse(readFileSync(`./live/${n}.json`, "utf8"));
const d = L("case.draft").body;
const ents = Object.entries(d).filter(([k, e]) => e && typeof e === "object" && e.Kind);
const kinds = {}; for (const [, e] of ents) kinds[e.Kind] = (kinds[e.Kind] || 0) + 1;
console.log("Root", d.Root, "PublishedAt", d.PublishedAt, "kinds", kinds);
const acts = ents.filter(([, e]) => e.Kind === "Activity");
for (const [k, a] of acts) {
  const res = (a["Activity::Resource"] || []).map((r) => d[r]).map((r) => r && `${r.ValueType}:${r.DisplayValue}(${r.Value})`);
  const ex = (a["Activity::Expression"] || []).map((x) => d[x]);
  console.log(k, a.NodeType, JSON.stringify(a.Name), "res", res, "expr", ex.length, "perms", (a["Activity::Permission"]||[]).length, "SLA", JSON.stringify(a.Deadline ?? a.SLA ?? a["Activity::Deadline"] ?? null), "sendback", a.IsSendbackEnabled);
}
const pd = ents.filter(([, e]) => e.Kind === "ProcessDef");
for (const [k, p] of pd) console.log("ProcessDef", k, p.Name, p["ProcessDef::Activity"]);
// dangling refs
const keys = new Set(Object.keys(d));
let dangling = [];
for (const [k, e] of ents) for (const [p, v] of Object.entries(e)) {
  if (!p.includes("::")) continue;
  for (const ref of Array.isArray(v) ? v : [v]) if (typeof ref === "string" && !keys.has(ref) && /^(Activity|Permission|Resource|Expression|Node|ProcessDef|Field|Column|Row|Section)_?/.test(ref)) dangling.push(`${k}.${p} -> ${ref}`);
}
console.log("dangling", dangling.length, dangling.slice(0, 10));
const removed = ["Activity_1feompb","Activity_1a281c6","Activity_on1xvu","Activity_xnbq22","Activity_1armoq0","Activity_1kxceje","Activity_1252uy3","Activity_h505sh","Activity_vrfxbc","Activity_1lo09cp","Activity_dullxt","Activity_luckcl"];
console.log("removed still present:", removed.filter((r) => keys.has(r)));
// any remaining string ref to removed ids anywhere
const s = JSON.stringify(d); console.log("text refs to removed:", removed.filter((r) => s.includes(r)));
