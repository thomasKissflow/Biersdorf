// Read-only: every CIQ Supplier row with its Contacts child rows (no e-mail addresses printed: masked), and the latest
// "Supplier master" audit rows the app wrote.
// The form list is a POST that only reads (master.md §3.5), so this uses the writer client's paced call; nothing is written.
import { call, A as ACC } from "../integrations/integ-lib.mjs";
const kf = { acc: ACC, call };
const A = kf.acc, Q = "_application_id=CIQ_Digital_A00";
const sleep = async () => {}; // integ-lib's call is paced already
const mask = (e) => (typeof e === "string" && e.includes("@") ? e.replace(/^(.).*(@.*)$/, "$1…$2") : e);
const list = (await kf.call("POST", `/form/2/${A}/CIQ_Supplier_A00/list?page_number=1&page_size=100&${Q}`, {})).body;
const rows = Array.isArray(list) ? list : list?.Data || [];
console.log("suppliers:", rows.length);
for (const s of rows) {
  await sleep(1200);
  const full = (await kf.call("GET", `/form/2/${A}/CIQ_Supplier_A00/${s._id}?${Q}`)).body;
  const contacts = full?.Contacts || full?.["Table::Contacts"] || [];
  console.log(`\n${s._id} ${full?.Supplier_Code} "${full?.Supplier_Legal_Name}" created ${full?._created_at} modified ${full?._modified_at} by ${full?._modified_by?.Name ?? "?"}`);
  console.log("  child keys:", Object.keys(full || {}).filter((k) => /contact/i.test(k)).join(", "), "| rows:", Array.isArray(contacts) ? contacts.length : typeof contacts);
  for (const c of Array.isArray(contacts) ? contacts : []) console.log("   ", JSON.stringify({ _id: c._id, Key: c.Contacts_Key, Name: c.Contacts_Full_Name, Email: mask(c.Contacts_Email), Portal: c.Contacts_Portal_User_Id, Active: c.Contacts_Active, Confirm: c.Contacts_Can_Confirm }));
}
await sleep(1200);
const al = (await kf.call("POST", `/form/2/${A}/CIQ_Audit_Event_A00/list?page_number=1&page_size=100&${Q}`, {})).body;
const ar = (Array.isArray(al) ? al : al?.Data || []).filter((r) => r.Event_Category === "Supplier master" || r.Action_Code === "supplier.changed");
console.log(`\nsupplier audit rows: ${ar.length}`);
for (const r of ar.slice(-8)) console.log("  ", r.Event_At, r.Object_Key, r.Object_Item_Id, (r.New_Value_Text || "").slice(0, 120));
