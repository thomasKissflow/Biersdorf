import { readFileSync } from "node:fs";
import { validateBlob, checkHygiene } from "../../../../tools/kissflow-app-agents-1.6.0/engine/validators.mjs";
for (const f of process.argv.slice(2)) {
  const b = JSON.parse(readFileSync(f, "utf8"));
  const issues = [...validateBlob({ label: b.Root, blob: b }), ...checkHygiene(b, b.Root)];
  console.log(f.split("/").pop(), issues.length, JSON.stringify(issues.map((i) => ({ l: i.level, c: i.code, m: String(i.message || i.msg || "").slice(0, 220) })), null, 0));
}
