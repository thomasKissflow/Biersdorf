// Test-flow fix (within Thomas's approval for the spike flows): CIQ ZZ Spike Register.Open_Lines (embedded child SUM) never
// computes. App Builder published it with LHSModel = the parent form. Hypothesis (manual §4.4 shape 1): LHSModel = the CHILD
// model (Spike_Lines), LHSRootModel = the parent. Usage: node graft-open-lines.mjs [--apply]
import { fileURLToPath } from "node:url";
import { writeFileSync } from "node:fs";
import { writer, preflight } from "../../lib/meta.mjs";
const APPLY = process.argv.includes("--apply");
const w = writer(fileURLToPath(new URL("./graft-requests.jsonl", import.meta.url)));
const REG = "CIQ_ZZ_Spike_Register_A00", AGG = "AggregateDefinition_xond6i";
const live = (await w.getDraft("form", REG)).body; const agg = live[AGG];
const out = { at: new Date().toISOString(), apply: APPLY, before: { LHSModel: agg?.LHSModel, LHSRootModel: agg?.LHSRootModel, FlowType: agg?.FlowType, AggregateField: agg?.AggregateField } };
if (!agg || agg.Field !== "Open_Lines") throw new Error("aggregate not found");
if (agg.LHSModel === "Spike_Lines") { console.log("already child", JSON.stringify(out)); process.exit(0); }
const next = { ...live, [AGG]: { ...agg, LHSModel: "Spike_Lines" } };
const pf = preflight(REG, next); out.preflight = { errors: pf.errors, warnings: pf.warnings.length };
if (!APPLY || pf.errors.length) { console.log(JSON.stringify(out, null, 1)); process.exit(0); }
const pd = await w.putDraft("form", REG, next); out.putDraft = pd.status; if (pd.status >= 300) out.putBody = JSON.stringify(pd.body).slice(0, 300);
const pub = pd.status < 300 ? await w.publish("form", REG) : { status: -1 }; out.publish = pub.status; if (pub.status >= 300) out.publishBody = JSON.stringify(pub.body).slice(0, 300);
out.after = (({ LHSModel, LHSRootModel, FlowType, AggregateField }) => ({ LHSModel, LHSRootModel, FlowType, AggregateField }))((await w.getDraft("form", REG)).body[AGG] || {});
writeFileSync(fileURLToPath(new URL("./graft-open-lines-result.json", import.meta.url)), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 1));
