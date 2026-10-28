// Read-only: which portal flows grant the Supplier role, and how.
import { client } from "../lib/kf.mjs";
const kf = client({ readOnly: true });
const A = kf.acc, P = "CIQ_Supplier_Portal_A00";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (const [t, id] of [["process", "CIQP_Request_A00"], ["process", "CIQP_Query_A00"], ["process", "CIQP_Final_Release_A00"], ["process", "CIQP_Section_A00"], ["process", "CIQP_Completeness_Confirmation_A00"], ["process", "CIQP_Notice_A00"], ["process", "CIQP_Change_Request_A00"], ["process", "ZZ_Spike_Assignee_A00"], ["form", "CIQP_Help_Article_A00"]]) {
  await sleep(1000);
  const r = await kf.get(`/flow/2/${A}/${t}/${id}/member?_application_id=${P}&page_number=1&page_size=100`);
  const rows = Array.isArray(r.body) ? r.body : r.body?.Data || [];
  console.log(id.padEnd(36), r.status, rows.map((m) => `${m.Name || m._id}:${m.Role || m.MemberType || ""}${m.Permission ? "[" + [].concat(m.Permission).join(",") + "]" : ""}`).join(" | "));
}
