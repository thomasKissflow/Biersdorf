// Sets the js_code of a Run script step in an integration draft (backup first, read back).  node set-code.mjs <integrationId> <actionId> <file.js>
import { readFileSync } from "node:fs";
import { getDraft, putDraft, backup } from "./integ-lib.mjs";
const [id, aid, file] = process.argv.slice(2);
const code = readFileSync(file, "utf8");
const b = await getDraft(id);
backup(id, b, `before-code-${aid}`);
const fm = (b[aid]?.["Action::FieldMapping"] || []).find((x) => b[x]?.Name === "js_code");
if (!fm) throw new Error("no js_code mapping on " + aid);
const pid = b[fm]["FieldMapping::Property"]?.[0];
if (!pid || b[pid]?.Type !== "Code") throw new Error("js_code property missing or not Code");
b[pid] = { ...b[pid], Code: code };
const r = await putDraft(id, b);
console.log("PUT", r.status, r.status >= 300 ? JSON.stringify(r.body).slice(0, 300) : "");
const back = await getDraft(id);
console.log("read-back code matches:", back[pid]?.Code === code);
