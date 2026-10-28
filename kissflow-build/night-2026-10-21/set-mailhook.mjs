// 22 Oct (Thomas: the screens call "Mail Integration - Thomas"): SET:current's Payload_JSON gets the top-level key
// "mailHook" = the full webhook URL from .env MAIL_WEBHOOK_URL (the app rebuilds it for the host and account it runs on),
// and Content_Hash is recomputed as the app checks it (sha256 of canonicalJson(payload)). Every other key is kept.
// Never prints the URL or its token.   node set-mailhook.mjs [--apply]
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { call, A, APP } from "./lib.mjs";

const apply = process.argv.includes("--apply");
if (A !== "AcDOSunMEpSA") throw new Error("not the dev sandbox");
const env = readFileSync(new URL("../../.env", import.meta.url), "utf8");
const url = (env.match(/^MAIL_WEBHOOK_URL=(.*)$/m)?.[1] || "").trim().replace(/^["']|["']$/g, "");
if (!/^https:\/\/[a-z0-9.-]+\.kissflow\.(eu|com)\/integration\/2\/[A-Za-z0-9_-]+\/webhook\/[A-Za-z0-9_-]+$/.test(url)) throw new Error("MAIL_WEBHOOK_URL is not a Kissflow webhook URL");
const canon = (v) => Array.isArray(v) ? `[${v.map((x) => (x === undefined ? "null" : canon(x))).join(",")}]`
  : v && typeof v === "object" ? `{${Object.keys(v).sort().filter((k) => v[k] !== undefined).map((k) => `${JSON.stringify(k)}:${canon(v[k])}`).join(",")}}`
  : JSON.stringify(v);
const F = "CIQ_Config_Version_A00";
const list = await call("GET", `/form/2/${A}/${F}/list?_application_id=${APP}&page_number=1&page_size=100`);
const rows = Array.isArray(list.body) ? list.body : list.body?.Data || [];
const hit = rows.find((r) => r.Config_Key === "SET:current");
if (!hit) throw new Error(`SET:current not found (list ${list.status}, ${rows.length} rows)`);
const path = `/form/2/${A}/${F}/${hit._id}?_application_id=${APP}`;
const row = (await call("GET", path)).body;
const payload = JSON.parse(row.Payload_JSON);
console.log("SET:current", hit._id, "keys:", Object.keys(payload).join(", "), "| mailHook now:", payload.mailHook ? "set" : "none", "| hash ok before:", createHash("sha256").update(canon(payload)).digest("hex") === row.Content_Hash);
payload.mailHook = url;
const text = JSON.stringify(payload), hash = createHash("sha256").update(canon(payload)).digest("hex");
if (!apply) { console.log("dry run: would write mailHook (", url.length, "chars) and a new Content_Hash"); process.exit(0); }
writeFileSync(new URL(`./backups/SET-current-before-mailhook-${Date.now()}.json`, import.meta.url), JSON.stringify({ _id: hit._id, Payload_JSON: row.Payload_JSON, Content_Hash: row.Content_Hash }));
const put = await call("POST", path, { Payload_JSON: text, Content_Hash: hash });
const back = (await call("GET", path)).body;
const bp = JSON.parse(back.Payload_JSON || "{}");
console.log("PUT", put.status, "| read back: mailHook", bp.mailHook === url ? "ok" : "MISMATCH", "| hash", back.Content_Hash === hash && createHash("sha256").update(canon(bp)).digest("hex") === hash ? "ok" : "MISMATCH", "| keys:", Object.keys(bp).join(", "));
