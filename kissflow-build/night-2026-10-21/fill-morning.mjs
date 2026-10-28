// Fills the night results into MORNING-2026-10-22.md (between <!--X--> markers; the first time, the bare placeholders),
// from results.json and gallery.mjs only: no Kissflow call. Re-run it whenever the runner has moved on.
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const file = new URL("../MORNING-2026-10-22.md", import.meta.url);
const r = JSON.parse(readFileSync(new URL("./results.json", import.meta.url)));
const tally = (p) => { const sc = Object.entries(r.scenarios).filter(([k]) => k.split(".")[0] === p); const ch = sc.flatMap(([, s]) => s.checks || []); return { n: sc.length, done: sc.every(([, s]) => s.done), ok: ch.filter((c) => c.pass).length, all: ch.length }; };
const fmt = (p) => { const t = tally(p); return !t.n ? "not run yet" : `${t.ok}/${t.all}${t.done ? "" : " so far"}`; };
const stages = ["NG1", "NG2", "NG3", "NG4", "NG5", "NG6"].map((p) => `${p} ${fmt(p)}`).join(", ");
const n3 = tally("N3"), nv = tally("NV1"), nfm = ["NFM.audit", "NFM.note", "NFM.rmesSAF", "NFM.rmesREG", "NFM.scope", "NFM.supplier", "NFM.help"].map((k) => r.scenarios[k]).filter(Boolean);
const n3text = !n3.n ? "queued (after NG6)" : `${n3.ok}/${n3.all}${n3.done ? "" : " so far"}` + (nv.n ? `; then NV1 reviews ${nv.ok}/${nv.all}` : "") + (nfm.length ? `, NFM forms ${nfm.flatMap((s) => s.checks).filter((c) => c.pass).length}/${nfm.flatMap((s) => s.checks).length}` : "");
const pdf = process.env.PDFN3 || "queued: on ZZT-NT2-N3 once N3, its reviews (NV1) and its audit rows and supplier (NFM) exist, so the reads that run 1 could not cover get exercised. I add the result here.";
const gallery = execFileSync("node", [fileURLToPath(new URL("./gallery.mjs", import.meta.url))], { encoding: "utf8" }).trim()
  + `\n\nAs of ${new Date().toLocaleTimeString("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit" })} IST; the runner is still going ("running" rows move on). Open each case in the app (as RMM) and its request in the portal. ZZT-NT2-N1 (completed, with run 1's PDF in Final PDF) is there too: case \`PkEPW_MFtpCd\`.`;
let s = readFileSync(file, "utf8");
const put = (key, val) => {
  const re = new RegExp(`<!--${key}-->[\\s\\S]*?<!--/${key}-->`);
  const block = `<!--${key}-->${val}<!--/${key}-->`;
  if (re.test(s)) s = s.replace(re, block);
  else if (s.includes(key)) s = s.replace(key, block);
  else throw new Error("no slot " + key);
};
put("STAGES", stages); put("N3RESULT", n3text); put("PDFN3", pdf); put("GALLERY", "\n" + gallery + "\n");
writeFileSync(file, s);
console.log({ stages, n3text });
