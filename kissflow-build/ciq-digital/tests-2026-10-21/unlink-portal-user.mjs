// The R1 S-CASE showcase supplier: Thomas's portal user off its self contact (so his own dev load keeps ONE self contact, on
// "ZZT Dev Supplier"), as S-FORMS F12a does: a one-field Table::Contacts delta by the row's _id. Ledger item only. Paced.
import { readFileSync } from "node:fs";
import { client } from "../../lib/kf.mjs";
const [id] = process.argv.slice(2), F = "CIQ_Supplier_A00", Q = "_application_id=CIQ_Digital_A00", THOMAS = "UsEJUfjYLM8Y";
if (!readFileSync(new URL("./ledger.jsonl", import.meta.url), "utf8").includes(`"id":"${id}"`)) throw new Error("not a ledger item");
const kf = client({ readOnly: false });
if (kf.acc !== "AcDOSunMEpSA" || kf.domain !== "dev-beiersdorf.kissflow.eu") throw new Error("not dev");
const call = async (m, p, b) => { await new Promise((r) => setTimeout(r, 2500)); const r = await kf.call(m, p, b, { retries: 0 }); if (r.status === 429 || (typeof r.body === "string" && /<html|just a moment/i.test(r.body))) { console.log("STOP"); process.exit(2); } return r; };
const rows = (b) => b["Table::Contacts"] || [];
const g = (await call("GET", `/form/2/${kf.acc}/${F}/${id}?${Q}`)).body;
const row = rows(g).find((r) => r.Contacts_Portal_User_Id === THOMAS);
if (!row) { console.log("no row linked to Thomas; nothing to do"); process.exit(0); }
const u = await call("POST", `/form/2/${kf.acc}/${F}/${id}?${Q}`, { "Table::Contacts": [{ _id: row._id, Contacts_Portal_User_Id: "" }] });
const g2 = (await call("GET", `/form/2/${kf.acc}/${F}/${id}?${Q}`)).body;
console.log("update", u.status, "| linked to Thomas after:", rows(g2).filter((r) => r.Contacts_Portal_User_Id === THOMAS).length, "| rows:", rows(g2).length, "| keys:", rows(g2).map((r) => r.Contacts_Key).join(","));
