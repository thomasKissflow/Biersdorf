// The builder's per-step Test for one of the app session's integrations (RECIPE step 7), then publish and switch-on.
//   node kissflow-build/ciq-digital/integrations/test-chain.mjs <key> test       every action in run order; stops at the first
//        failure; a PASSED step gets {Output, IsTested:true} stored on it, as the builder does (never on a failed one)
//   node kissflow-build/ciq-digital/integrations/test-chain.mjs <key> activate   publish, then switch on (refused unless every
//        step, the webhook trigger included, has passed), then read back Status / IsActive
// The webhook trigger's own test runs in the builder (its URL is only there); this script checks it passed first.
// Every test REALLY runs the step (a create creates, an update updates): ZZT items only.
import { writeFileSync } from "node:fs";
import { call, A, load, save, backup, getDraft, putDraft, publish } from "./integ-lib.mjs";

const APP = "CIQ_Digital_A00";
const [K, mode] = process.argv.slice(2);
const s = load();
const st = s.integrations[K];
if (!st?.id || !["test", "activate"].includes(mode)) { console.error("usage: test-chain.mjs <key> <test|activate>"); process.exit(1); }
const out = { key: K, id: st.id, at: new Date().toISOString(), mode, steps: [] };
const finish = (code) => { writeFileSync(new URL(`./test-${K}-${mode}.json`, import.meta.url), JSON.stringify(out, null, 1)); process.exit(code); };

const b0 = await getDraft(st.id);
const root = b0[b0.Root];
const trigger = (root["Integration::Trigger"] || [])[0];
const actions = root["Integration::Action"] || [];
if (!b0[trigger]?.IsTested) { out.refused = "the webhook trigger has not passed its builder test yet"; console.log(out.refused); finish(2); }

if (mode === "test") {
  backup(st.id, b0, "before-tests");
  for (const eid of actions) {
    const t = await call("POST", `/integration/2/${A}/${st.id}/action/${eid}/test?_application_id=${APP}`, {});
    const ok = t.status < 300 && t.body && typeof t.body === "object" && t.body.status !== "error" && !t.body.error_code;
    out.steps.push({ step: eid, status: t.status, ok, answer: JSON.stringify(t.body).slice(0, 1500) });
    console.log(ok ? "PASS" : "FAIL", eid, t.status, JSON.stringify(t.body).slice(0, 600));
    if (!ok) { out.result = `stopped at ${eid}`; finish(1); }
    const b = await getDraft(st.id);
    b[eid] = { ...b[eid], Output: t.body, IsTested: true };
    const r = await putDraft(st.id, b);
    if (r.status >= 300) { out.result = `could not store the output of ${eid}: ${r.status}`; console.log(out.result); finish(1); }
  }
  const back = await getDraft(st.id);
  out.tested = actions.map((eid) => `${eid}:${back[eid]?.IsTested ? "tested" : "NOT tested"}`);
  out.result = out.tested.every((x) => x.endsWith(":tested")) ? "every action passed" : "incomplete";
  console.log(out.result, out.tested.join(" "));
  st.tested = out.result; save(s);
  finish(0);
}

if (mode === "activate") {
  const untested = [trigger, ...actions].filter((eid) => !b0[eid]?.IsTested);
  if (untested.length) { out.refused = `not every step passed its test: ${untested.join(", ")}`; console.log(out.refused); finish(2); }
  const pub = await publish(st.id);
  out.publish = pub.status;
  console.log("publish", pub.status, pub.status >= 300 ? JSON.stringify(pub.body).slice(0, 400) : "");
  if (pub.status >= 300) finish(1);
  const on = await call("PUT", `/flow/2/${A}/integration/${st.id}/activate?_application_id=${APP}`, {});
  out.activate = on.status;
  console.log("activate", on.status, on.status >= 300 ? JSON.stringify(on.body).slice(0, 400) : "");
  const list = (await call("GET", `/flow/2/${A}/integration/?_application_id=${APP}&page_number=1&page_size=100`)).body;
  const me = (Array.isArray(list) ? list : list?.Data || []).find((x) => x._id === st.id);
  out.readBack = { Status: me?.Status, IsActive: me?.IsActive };
  console.log("read-back", JSON.stringify(out.readBack));
  st.active = me?.IsActive ?? null; save(s);
  finish(on.status < 300 && me?.IsActive ? 0 : 1);
}
