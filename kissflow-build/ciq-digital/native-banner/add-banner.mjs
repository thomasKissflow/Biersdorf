// 28 Oct (Thomas): a user who opens a CIQ process in Kissflow's own form by mistake sees only a message pointing to the
// app's custom UI. Copies Thomas's sample in CIQ_Case_A00 (built in the builder, 27 Oct) to the other app processes:
// every top-level section and child table is hidden (IsHidden), and one untitled section with a RichText element (the
// sample's exact text and link) is appended. No field, permission or step changes. Backup, PUT, read back, publish.
//   node add-banner.mjs            dry run
//   node add-banner.mjs --apply
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { writer } from "../../lib/meta.mjs";
const here = (f) => fileURLToPath(new URL(f, import.meta.url));
const apply = process.argv.includes("--apply");
const w = writer(here("./banner-requests.jsonl"));
const SAMPLE = "CIQ_Case_A00", TARGETS = ["CIQ_Review_A00", "CIQ_Open_Point_A00"];
const rid = (p) => `${p}_${Math.random().toString(36).slice(2, 12).padEnd(10, "x")}`;

// the sample: the RichText element's Description (text + link) and the section's shape
const sample = (await w.getDraft("process", SAMPLE)).body;
const rich = Object.values(sample).find((e) => e && e.Kind === "Column" && e.Type === "RichText");
if (!rich?.Description) throw new Error("no RichText sample in CIQ_Case_A00");
const richSection = sample[sample[rich.Row]?.Column];
console.log("sample text:", JSON.parse(rich.Description).map((p) => p.nodes.map((n) => n.text ?? n.data?.text).join("")).join(" | ").slice(0, 200));

for (const id of TARGETS) {
  const b = (await w.getDraft("process", id)).body;
  if (!b || !b[id]) throw new Error(`no draft for ${id}`);
  const model = b[id];
  const rows = model["Model::Row"] || [];
  if (rows.some((r) => (b[r]?.["Row::Column"] || []).some((c) => (b[b[c]?.["Column::Row"]?.[0]]?.["Row::Column"] || []).some((x) => b[x]?.Type === "RichText")))) { console.log(id, "already has the message: skipped"); continue; }
  const tops = rows.flatMap((r) => b[r]?.["Row::Column"] || []).filter((c) => b[c] && !b[c].IsHidden);
  console.log(id, "| hide:", tops.map((c) => `${b[c].Type}:${JSON.stringify(b[c].Name)}`).join(", "), "| then add the message section");
  if (!apply) continue;
  mkdirSync(here("./backups"), { recursive: true });
  writeFileSync(here(`./backups/${id}.before-banner.${new Date().toISOString().replace(/[:.]/g, "-")}.json`), JSON.stringify(b));
  for (const c of tops) {
    // as the sample's hidden "Details": IsHidden plus an empty Appearance/Style pair
    const ap = rid("Appearance"), st = rid("Style");
    b[ap] = { Id: ap, Kind: "Appearance", Column: c, "Appearance::Style": [st] };
    b[st] = { Id: st, Kind: "Style", Appearance: ap };
    b[c] = { ...b[c], IsHidden: true, "Column::Appearance": [...(b[c]["Column::Appearance"] || []), ap] };
  }
  const outer = rid("Row"), sec = rid("Column"), inner = rid("Row"), rt = rid("Column");
  b[outer] = { Id: outer, Kind: "Row", Model: id, "Row::Column": [sec] };
  b[sec] = { Id: sec, Kind: "Column", Type: "Section", Start: richSection?.Start ?? 0, End: richSection?.End ?? 6, Name: richSection?.Name ?? "\n", Row: outer, "Column::Row": [inner] };
  b[inner] = { Id: inner, Kind: "Row", Column: sec, "Row::Column": [rt] };
  b[rt] = { Id: rt, Kind: "Column", Type: "RichText", Start: rich.Start ?? 0, End: rich.End ?? 6, Row: inner, Description: rich.Description };
  b[id] = { ...model, "Model::Row": [...rows, outer] };
  const put = await w.putDraft("process", id, b);
  console.log("   PUT", put.status, put.status >= 300 ? JSON.stringify(put.body).slice(0, 300) : "");
  if (put.status >= 300) { process.exitCode = 1; continue; }
  const back = (await w.getDraft("process", id)).body;
  const ok = back[rt]?.Description === rich.Description && (back[id]["Model::Row"] || []).includes(outer) && tops.every((c) => back[c]?.IsHidden === true);
  const perms = (x) => Object.values(x).filter((e) => e?.Kind === "Permission").length;
  console.log("   read back", ok ? "OK" : "DIFFERS", "| permissions before/after", perms(b), perms(back), "| fields", Object.values(back).filter((e) => e?.Kind === "Field").length);
  if (!ok) { process.exitCode = 1; continue; }
  const p = await w.publish("process", id);
  console.log("   publish", p.status, p.status >= 300 ? JSON.stringify(p.body).slice(0, 300) : "");
}
