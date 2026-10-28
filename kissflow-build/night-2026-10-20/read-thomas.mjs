// Read-only: Thomas's own objects (CIQ Case - Thomas, his integrations) and the full sharing lists.
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { client } from "../lib/kf.mjs";
const here = (f) => fileURLToPath(new URL(f, import.meta.url));
const kf = client({ readOnly: true });
const A = kf.acc;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const get = async (p) => { await sleep(1000); return kf.get(p); };
mkdirSync(here("./live"), { recursive: true });
const save = (name, r) => { writeFileSync(here(`./live/${name}.json`), JSON.stringify(r.body, null, 1)); console.log(name, r.status, typeof r.body === "object" ? Object.keys(r.body || {}).length + " keys" : String(r.body).slice(0, 80)); };
save("CIQ_Case_Thomas_A00.draft", await get(`/metadata/2/${A}/process/CIQ_Case_Thomas_A00/draft`));
const ints = (await get(`/flow/2/${A}/integration/?_application_id=CIQ_Digital_A00&page_number=1&page_size=50`)).body;
const list = Array.isArray(ints) ? ints : ints?.Data || [];
for (const i of list.filter((x) => /Thomas|^Test$/.test(x.Name))) save(`integration.${i._id}.draft`, await get(`/metadata/2/${A}/integration/${i._id}/draft`));
save("app-flows", await get(`/flow/2/${A}/application/CIQ_Digital_A00/flow`));
save("portal-flows", await get(`/flow/2/${A}/portal/CIQ_Supplier_Portal_A00/flow`));
