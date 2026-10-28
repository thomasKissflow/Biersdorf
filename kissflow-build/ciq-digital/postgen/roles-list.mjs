// Read-only: list the app's roles (id, name, member count). No writes.
import { client } from "../../lib/kf.mjs";
const kf = client({ readOnly: true });
const r = await kf.call("GET", `/app_role/2/${kf.acc}/list?_application_id=CIQ_Digital_A00&page_number=1&page_size=100`);
const rows = Array.isArray(r.body) ? r.body : r.body?.Data || [];
console.log(`status ${r.status} · ${rows.length} roles`);
for (const x of rows) console.log(`${x._id}  ${x.Name}  users=${x.UserCount ?? "?"}`);
