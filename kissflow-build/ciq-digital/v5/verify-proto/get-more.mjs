import { writeFileSync, appendFileSync } from "node:fs";
import { client } from "../../../lib/kf.mjs";
const kf = client({ readOnly: true });
if (kf.acc !== "AcDOSunMEpSA" || kf.domain !== "dev-beiersdorf.kissflow.eu") throw new Error("not DEV");
const Q = "_application_id=CIQ_Digital_A00";
for (const l of ["CIQ_Department_A00","CIQ_RMES_Result_A00","CIQ_Actor_Side_A00","CIQ_Contact_Role_A00"]) {
  await new Promise((r) => setTimeout(r, 1500));
  const path = `/flow/2/${kf.acc}/list/${l}/items?${Q}`;
  const r = await kf.call("GET", path, undefined, { retries: 0 });
  appendFileSync("./requests.jsonl", JSON.stringify({ at: new Date().toISOString(), method: "GET", path, status: r.status }) + "\n");
  if (typeof r.body === "string" && /<html|just a moment/i.test(r.body)) throw new Error("STOP HTML");
  if (r.status === 429) throw new Error("STOP 429");
  writeFileSync(`./live/list.${l}.json`, JSON.stringify({ path, status: r.status, at: new Date().toISOString(), body: r.body }, null, 1));
  console.log(r.status, l, JSON.stringify(r.body));
}
