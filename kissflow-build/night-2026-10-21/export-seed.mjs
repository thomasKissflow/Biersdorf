// Exports the dev configuration rows and the portal Help articles for the prod import (read-only on dev):
// writes prod-seed/config-version.json and prod-seed/help-article.json; build-seed.py turns them into the xlsx.
import { writeFileSync, mkdirSync } from "node:fs";
import { call, A, APP, PORTAL } from "./lib.mjs";
mkdirSync(new URL("./prod-seed/", import.meta.url), { recursive: true });
const list = async (form, app) => (await call("POST", `/form/2/${A}/${form}/list?page_number=1&page_size=200&_application_id=${app}`, {})).body?.Data || [];
const strip = (x) => Object.fromEntries(Object.entries(x).filter(([k]) => !k.startsWith("_") && k !== "Name"));
const cfg = (await list("CIQ_Config_Version_A00", APP)).filter((x) => !String(x.Config_Key).startsWith("ZZT")).map(strip);
const help = (await list("CIQP_Help_Article_A00", PORTAL)).filter((x) => x.Article_Title !== "Test").map(strip);
writeFileSync(new URL("./prod-seed/config-version.json", import.meta.url), JSON.stringify(cfg, null, 1));
writeFileSync(new URL("./prod-seed/help-article.json", import.meta.url), JSON.stringify(help, null, 1));
console.log("config rows", cfg.length, cfg.map((x) => x.Config_Key).join(", "));
console.log("help articles", help.length);
