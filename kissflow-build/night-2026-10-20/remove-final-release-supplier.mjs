// Plan v6 §3.1: CIQP Final Release is no longer used (the release is a step of CIQP Request): remove the Supplier grant.
import { writer } from "../lib/meta.mjs";
import { fileURLToPath } from "node:url";
const w = writer(fileURLToPath(new URL("./grant-requests.jsonl", import.meta.url)));
const A = w.acc, P = "CIQ_Supplier_Portal_A00", F = "CIQP_Final_Release_A00";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const list = async () => { await sleep(1200); const r = await w.call("GET", `/flow/2/${A}/process/${F}/member?_application_id=${P}&page_number=1&page_size=100`); return Array.isArray(r.body) ? r.body : r.body?.Data || []; };
const sup = (await list()).find((m) => m.Name === "Supplier" || m._id === "RoEK4XPKXCvH");
if (!sup) { console.log("Supplier has no grant on CIQP Final Release: nothing to do"); process.exit(0); }
await sleep(1200);
const d = await w.call("DELETE", `/flow/2/${A}/process/${F}/member/${sup._id}?_application_id=${P}`);
const after = await list();
console.log(`DELETE ${d.status} · members now: ${after.map((m) => m.Name).join(", ")}`);
