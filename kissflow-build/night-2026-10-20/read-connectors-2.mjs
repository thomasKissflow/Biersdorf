// Read-only: Control, Run script, Custom trigger, Kissflow Notification connector entities (with field names).
import { fileURLToPath } from "node:url";
import { writer } from "../lib/meta.mjs";
const w = writer(fileURLToPath(new URL("./read-requests.jsonl", import.meta.url)));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (const [id, ver] of [["Control", "2.0.0"], ["Co4m9q4JUbkV", "1.0.0"], ["Co7VWbcrzw4v", "1.0.0"], ["Co6uG4vKQvqp", "1.0.0"]]) {
  await sleep(1300);
  const r = await w.call("GET", `/connector/2/${w.acc}/${id}/metadata/${ver}`);
  const b = r.body || {};
  const ents = Object.values(b).filter((v) => v && typeof v === "object" && (v.Kind === "Trigger" || v.Kind === "Action"));
  console.log("##", id, r.status, b[b.Root]?.Name || "", "|", ents.map((e) => `${e.Kind[0]}:${e.Id}=${e.Name}${e.Description ? " (" + String(e.Description).slice(0, 120) + ")" : ""}`).join(" | ").slice(0, 1800));
}
