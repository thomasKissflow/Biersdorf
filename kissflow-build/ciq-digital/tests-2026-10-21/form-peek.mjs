// Read-only: one form item's top-level keys and its Contacts rows (e-mails masked to their domain). Paced, no retry.
import { client } from "../../lib/kf.mjs";
const kf = client({ readOnly: true });
if (kf.acc !== "AcDOSunMEpSA" || kf.domain !== "dev-beiersdorf.kissflow.eu") throw new Error("not dev");
const [form, id] = process.argv.slice(2);
await new Promise((r) => setTimeout(r, 2500));
const r = await kf.call("GET", `/form/2/${kf.acc}/${form}/${id}?_application_id=CIQ_Digital_A00`, undefined, { retries: 0 });
if (r.status === 429 || (typeof r.body === "string" && /<html|just a moment/i.test(r.body))) { console.log("STOP"); process.exit(2); }
const b = r.body || {};
const mask = (e) => (typeof e === "string" && e.includes("@") ? "…@" + e.split("@")[1] : e);
console.log(r.status, "keys:", Object.keys(b).filter((k) => k.startsWith("_")).sort().join(","), "| _created_by:", JSON.stringify(b._created_by ?? null));
for (const row of b["Table::Contacts"] || []) console.log("  contact", row.Contacts_Key, "|", row.Contacts_Full_Name, "|", mask(row.Contacts_Email), "| portal:", row.Contacts_Portal_User_Id || "-");
