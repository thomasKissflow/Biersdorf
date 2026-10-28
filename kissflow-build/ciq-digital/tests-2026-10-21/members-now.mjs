// Read-only: the flow members (grants) of the process flows the tests act on. 2.5 s pacing, no retry, stops on 429/HTML.
import { client } from "../../lib/kf.mjs";
const kf = client({ readOnly: true });
if (kf.acc !== "AcDOSunMEpSA" || kf.domain !== "dev-beiersdorf.kissflow.eu") throw new Error("not dev");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (const [app, id] of [["CIQ_Digital_A00", "CIQ_Open_Point_A00"], ["CIQ_Digital_A00", "CIQ_Case_A00"], ["CIQ_Digital_A00", "CIQ_Review_A00"], ["CIQ_Supplier_Portal_A00", "CIQP_Request_A00"], ["CIQ_Supplier_Portal_A00", "CIQP_Query_A00"]]) {
  await sleep(2500);
  const r = await kf.call("GET", `/flow/2/${kf.acc}/process/${id}/member?_application_id=${app}&page_number=1&page_size=100`, undefined, { retries: 0 });
  if (r.status === 429 || (typeof r.body === "string" && /<html|just a moment/i.test(r.body))) { console.log("STOP", r.status); process.exit(2); }
  const rows = Array.isArray(r.body) ? r.body : r.body?.Data || [];
  console.log(id.padEnd(22), r.status, rows.map((m) => `${m.Name || m._id}(${m.Kind || m.MemberType || ""}):${m.Role || ""}${m.Permission ? "[" + [].concat(m.Permission).join(",") + "]" : ""}`).join(" | "));
}
