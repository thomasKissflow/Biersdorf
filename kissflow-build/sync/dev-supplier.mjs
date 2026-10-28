// Dev only (Thomas, 15 Oct: "use myself as the supplier dev user in dev for tests"): one fictional supplier
// "ZZT Dev Supplier (fictional)" in CIQ_Supplier_A00 whose single contact is Thomas's own Kissflow user (the only portal
// user in dev). His e-mail is read from the role GET at run time; it is never written into this file.
//   node kissflow-build/sync/dev-supplier.mjs            → dry run (prints what it would write)
//   node kissflow-build/sync/dev-supplier.mjs --apply    → create once (skipped if the code exists), read back
//   node kissflow-build/sync/dev-supplier.mjs --cleanup  → delete the dev supplier row
import { client } from "../lib/kf.mjs";
import { createPort, isDeferral } from "./kissflow.mjs";
import { FLOW, F, ROLE } from "./ids.mjs";

const CODE = "ZZT-SUP-DEV";
const DEV_USER = "UsEJUfjYLM8Y"; // Thomas: member of every app role and of the portal Supplier role (dev sandbox)
const APPLY = process.argv.includes("--apply"), CLEANUP = process.argv.includes("--cleanup");
const kf = client({ readOnly: false });
const port = createPort({ kf, dryRun: !APPLY && !CLEANUP, listInDryRun: true, log: () => {} });
try {
  const members = await port.roleMembers(ROLE.RMM);
  const me = members.find((m) => m._id === DEV_USER);
  if (!me?.Email) throw new Error("the dev user's e-mail is not readable from the role GET");
  const rows = (await port.listForm(FLOW.supplier)).filter((r) => r.Supplier_Code === CODE);
  if (CLEANUP) {
    for (const r of rows) { const d = await kf.call("DELETE", `/form/2/${kf.acc}/${FLOW.supplier}/${r._id}?_application_id=CIQ_Digital_A00`, undefined, { retries: 0 }); console.log(`delete ${r._id} → ${d.status}`); }
    process.exit(0);
  }
  if (rows.length) { console.log(`exists already: ${rows.map((r) => r._id).join(", ")}`); process.exit(0); }
  const fields = { Supplier_Code: CODE, Supplier_Legal_Name: "ZZT Dev Supplier (fictional)", DUNS_Number: "999000001", Supplier_Kind: "Manufacturer", Supplier_Country_Code: "DE", Supplier_City: "Teststadt", Supplier_Active: "Yes", Supplier_Test: "Yes" };
  const contact = { Contacts_Key: `${CODE}-c1`, Contacts_Full_Name: `${me.Name} (dev supplier)`, Contacts_Email: me.Email, Contacts_Title: "Dev supplier contact", Contacts_Can_Confirm: "Yes", Contacts_Portal_User_Id: DEV_USER, Contacts_Active: "Yes" };
  if (!APPLY) { console.log(`would create ${CODE} with 1 contact (${contact.Contacts_Full_Name}, portal user ${DEV_USER}, e-mail from the role GET)`); process.exit(0); }
  const back = await port.createFormRow(FLOW.supplier, fields, { [F.supplier.contacts.table]: [contact] });
  const c = (back?.[`Table::${F.supplier.contacts.table}`] ?? [])[0];
  console.log(`created ${back?._id}: ${back?.Supplier_Code} · contact ${c?.Contacts_Full_Name} · portal user ${c?.Contacts_Portal_User_Id} · e-mail ${c?.Contacts_Email === me.Email ? "matches" : "DIFFERS"} · may confirm ${c?.Contacts_Can_Confirm}`);
} catch (e) {
  console.error(isDeferral(e) ? "Stopped: rate limit / challenge. Try later." : `Error: ${e.message}`);
  process.exit(1);
}
