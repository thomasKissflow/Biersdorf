// ZZT only: the portal session's test request PkEP13vfhEiE around the case-level integration tests.
//   save     remember the fields the tests change (once; never overwritten)
//   restore  put them back (admin PUT), read back
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { call, A } from "./integ-lib.mjs";
const F = new URL("./zzt-request-original.json", import.meta.url);
const R = "PkEP13vfhEiE", Q = "_application_id=CIQ_Supplier_Portal_A00";
const KEYS = ["Release_Flag", "Request_Locked", "Case_Phase_Label", "Questions_History_JSON"];
const get = async () => (await call("GET", `/process/2/${A}/admin/CIQP_Request_A00/${R}?${Q}`)).body;
const mode = process.argv[2];
if (mode === "save") {
  if (existsSync(F)) { console.log("already saved", readFileSync(F, "utf8")); process.exit(0); }
  const r = await get();
  const keep = { ...Object.fromEntries(KEYS.map((k) => [k, r?.[k] ?? null])), Release_Contacts: (r?.Release_Contacts || []).map((u) => ({ _id: u._id })) };
  writeFileSync(F, JSON.stringify(keep, null, 1));
  console.log("saved", JSON.stringify(keep));
}
if (mode === "restore") {
  const keep = JSON.parse(readFileSync(F, "utf8"));
  const body = { Release_Flag: keep.Release_Flag ?? "", Request_Locked: keep.Request_Locked ?? "No", Case_Phase_Label: keep.Case_Phase_Label ?? "Filling in", Questions_History_JSON: keep.Questions_History_JSON ?? "", Release_Contacts: keep.Release_Contacts };
  const p = await call("PUT", `/process/2/${A}/admin/CIQP_Request_A00/${R}?${Q}`, body);
  const r = await get();
  console.log("restore", p.status, "read-back", JSON.stringify({ ...Object.fromEntries(KEYS.map((k) => [k, r?.[k] ?? null])), Release_Contacts: (r?.Release_Contacts || []).map((u) => u._id) }));
}
if (mode === "show") {
  const r = await get();
  console.log(JSON.stringify({ _current_step: r?._current_step, ...Object.fromEntries(KEYS.map((k) => [k, r?.[k] ?? null])), Release_Contacts: (r?.Release_Contacts || []).map((u) => u._id) }));
}
