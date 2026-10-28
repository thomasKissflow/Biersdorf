// REST graft (Thomas approved 2026-10-07): re-point CIQ ZZ Spike Case.Open_Count (cross-flow SUM) at CIQ ZZ Spike Register.
// App Builder 1.0.0 published it with LHSModel = the case itself (SPIKES.md). Manual §4.4 shape 2: LHSModel = target flow.
// Usage: node graft-open-count.mjs [--apply]   (default = dry run: read + preflight only)
import { writeFileSync } from "node:fs";
import { writer, preflight } from "../../lib/meta.mjs";
const APPLY = process.argv.includes("--apply");
const w = writer(fileURLToPath(new URL("./graft-requests.jsonl", import.meta.url)));
const CASE = "CIQ_ZZ_Spike_Case_A00", REG = "CIQ_ZZ_Spike_Register_A00", AGG = "AggregateDefinition_1mdoyvz";
const out = { at: new Date().toISOString(), apply: APPLY };
const live = (await w.getDraft("process", CASE)).body;
const agg = live[AGG];
out.before = { LHSModel: agg?.LHSModel, FlowType: agg?.FlowType, AggregateField: agg?.AggregateField, LHSRootModel: agg?.LHSRootModel ?? null };
if (!agg || agg.Field !== "Open_Count") throw new Error("aggregate not found as expected");
if (agg.LHSModel === REG) { out.note = "already points at Register; nothing to do"; console.log(JSON.stringify(out, null, 1)); process.exit(0); }
if (agg.LHSModel !== CASE) throw new Error(`unexpected LHSModel ${agg.LHSModel}; stopping`);
const next = { ...live, [AGG]: { ...agg, LHSModel: REG } };   // ONE attribute changes; everything else as fetched
const changed = Object.keys(next).filter((k) => JSON.stringify(next[k]) !== JSON.stringify(live[k]));
out.changedEntities = changed;
const pf = preflight(CASE, next);
out.preflight = { errors: pf.errors, warnings: pf.warnings.length };
if (!APPLY || pf.errors.length) { console.log(JSON.stringify(out, null, 1)); process.exit(pf.errors.length ? 1 : 0); }
const pd = await w.putDraft("process", CASE, next); out.putDraft = pd.status;
if (pd.status >= 300) out.putBody = JSON.stringify(pd.body).slice(0, 400);
const pub = pd.status < 300 ? await w.publish("process", CASE) : { status: -1, body: null }; out.publish = pub.status;
if (pub.status >= 300) out.publishBody = JSON.stringify(pub.body).slice(0, 400);
const back = (await w.getDraft("process", CASE)).body[AGG];
out.after = { LHSModel: back?.LHSModel, FlowType: back?.FlowType, AggregateField: back?.AggregateField, criteria: back?.["QueryDefinition::Criteria"] };
out.ok = back?.LHSModel === REG && pub.status < 300;
writeFileSync(new URL("./graft-open-count-result.json", import.meta.url), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 1));
