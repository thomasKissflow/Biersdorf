// Read-only: saves a flow's live draft to live/<id>.draft.json.  node read-draft.mjs <process|form> <flowId>
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { client } from "../lib/kf.mjs";
const here = (f) => fileURLToPath(new URL(f, import.meta.url));
const [type, id] = process.argv.slice(2);
const kf = client({ readOnly: true });
const r = await kf.get(`/metadata/2/${kf.acc}/${type}/${id}/draft`);
mkdirSync(here("./live"), { recursive: true });
if (r.status !== 200 || typeof r.body !== "object" || !r.body[id]) { console.log(`${id}: not readable (${r.status})`); process.exit(1); }
writeFileSync(here(`./live/${id}.draft.json`), JSON.stringify(r.body, null, 1));
console.log(`${id}: ${Object.keys(r.body).length} entries → live/${id}.draft.json`);
