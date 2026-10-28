// Read-only: an integration entity's resolved field schema, without the dropdown code.  node dump-fields.mjs <id> <trigger|action> <entityId>
import { fieldsOf } from "./integ-lib.mjs";
const [id, seg, eid] = process.argv.slice(2);
const r = await fieldsOf(id, seg, eid);
const strip = (f) => { const c = { ...f }; if (c.Dropdown) c.Dropdown = { Id: c.Dropdown.Id, FieldId: c.Dropdown.FieldId, FieldName: c.Dropdown.FieldName }; delete c.Code; return c; };
console.log(r.status);
for (const f of Array.isArray(r.body) ? r.body : []) console.log(JSON.stringify(strip(f)).slice(0, 400));
if (!Array.isArray(r.body)) console.log(JSON.stringify(r.body).slice(0, 600));
