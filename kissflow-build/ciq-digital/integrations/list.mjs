// Read-only: the app's integrations with Status and IsActive.
import { call, A } from "./integ-lib.mjs";
const l = (await call("GET", `/flow/2/${A}/integration/?_application_id=CIQ_Digital_A00&page_number=1&page_size=100`)).body;
for (const x of Array.isArray(l) ? l : l?.Data || []) console.log(`${x.IsActive ? "ON " : "off"} ${x.Status?.padEnd(5)} ${x._id}  ${x.Name}`);
