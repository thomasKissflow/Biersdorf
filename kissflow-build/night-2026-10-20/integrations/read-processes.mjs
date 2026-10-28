// Read-only: the account's processes as the connector's picker lists them (name + app), and the open-point/query flows.
import { call, A } from "./integ-lib.mjs";
for (let p = 1; p <= 3; p++) {
  const r = await call("GET", `/flow/2/${A}/process?page_size=50&page_number=${p}`);
  const l = Array.isArray(r.body) ? r.body : [];
  for (const x of l) if (/^CIQ/.test(x._id)) console.log(x._id, "|", x.Name, "|", x._application_id || "", "|", x.Status || "");
  if (l.length < 50) break;
}
