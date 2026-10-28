// Offline test of apply-harden.mjs (plain node, no Kissflow call: fetch is disabled; the transport is the stub of
// apply-harden-sim.mjs on a virtual clock; the store is in memory, so no file is written).
//   node kissflow-build/ciq-digital/integrations/apply-harden.test.mjs
// 1. Happy path: all six keys in HARDENING.md's order on one stub: the phase order of every run (preflight, fixture,
//    1 OFF, 2 PUT, 3 trigger Test then the webhook, 4 Tests, 5, 6 publish then activate, the live checks, clean-up),
//    pacing >= 6 s, every refusal's expected text equal to the message the hardened script really throws, every
//    integration ON with its hardened version published, every ZZT item deleted, no URL in the output.
// 2. A failure at each step 1–6: switched back ON (the published version still the unhardened one), the backup printed;
//    a failed switch-on is reported loudly and not retried.
// 3. A 429 or an HTML answer: no further call; the pending switch-on command printed and refused until the pause is over.
// 4. The ledger: an intent before every create, every item's id recorded before the call after the answer that reveals it.
// 5. Interrupt, non-dev account, a pending switch-on, the guard-regression detection, cleanup, and the dry run.
// 6. The review fixes of 21 Oct (evening): dev-only webhook URLs, the script's answer checked before a target step, the
//    ZZT marker before a delete, the release backstop and op.closed proven live, keys out of order, lost creates and late
//    items cleaned, the unhardened backup on a re-run, the pause and the lock, signals during the pacing wait, a network
//    error on the switch-on, --reactivate after a publish, the refusal window against slow hand-offs.
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { runKey, reactivate, cleanupGroups, memoryStore, activeItems, unresolvedIntents, dryRun, redact, ORDER, PACE_MS, PAUSE_MIN } from "./apply-harden.mjs";
import { createSim, snapshotDraft } from "./apply-harden-sim.mjs";
import { idsOf, DEFS, hardenSpecOf } from "./integ-defs.mjs";
import { hardenDraft } from "./harden.mjs";

globalThis.fetch = () => { throw new Error("apply-harden.test is offline: no network"); };
const here = (f) => new URL(f, import.meta.url);
const STATE = JSON.parse(readFileSync(here("./state.json"), "utf8"));
const IDS = Object.fromEntries(ORDER.map((k) => [k, STATE.integrations[k].id]));
const SELF = "node kissflow-build/ciq-digital/integrations/apply-harden.mjs";
let pass = 0, fail = 0;
const check = (name, ok, detail) => { ok ? pass++ : fail++; console.log(`  ${ok ? "ok  " : "FAIL"} ${name}${ok || detail === undefined ? "" : " — " + JSON.stringify(detail).slice(0, 500)}`); };

function harness({ state = STATE, ledger = [] } = {}) {
  let t = Date.parse("2026-10-22T08:00:00Z");
  const now = () => t, sleep = async (ms) => { t += ms; };
  const sim = createSim({ ids: IDS, now });
  const store = memoryStore(state, structuredClone(ledger));
  const lines = [], timeline = [], deferred = [];
  // a hand-off the platform runs late: h.deferHook(url) → ms; it lands at the first call after it is due
  const flush = async () => { for (const d of [...deferred]) if (d.due <= t) { deferred.splice(deferred.indexOf(d), 1); await sim.hook(d.url, d.payload); } };
  const raw = {
    acc: sim.acc, domain: sim.domain,
    call: async (method, path, body) => {
      await flush();
      const e = { kind: "rest", method, path, at: t, ledgerLen: store.ledger.length };
      timeline.push(e);
      const r = await sim.call(method, path, body);
      e.status = r.status; e.resText = JSON.stringify(r.body ?? null);
      return r;
    },
    hook: async (url, payload) => {
      await flush();
      const e = { kind: "hook", method: "POST", path: url, payload, at: t, ledgerLen: store.ledger.length };
      timeline.push(e);
      const late = h.deferHook?.(url, payload);
      if (late) { deferred.push({ due: t + late, url, payload }); e.status = 200; e.resText = '{"status":"success"}'; return { status: 200, text: e.resText }; }
      const r = await sim.hook(url, payload);
      e.status = r.status; e.resText = r.text;
      return r;
    },
  };
  const h = { sim, store, lines, timeline, raw, now, deferred, flush, advance: (ms) => { t += ms; } };
  h.opts = (extra = {}) => ({ raw, store, out: (l) => lines.push(l), now, sleep, ...extra });
  h.run = (K, extra) => runKey(K, h.opts(extra));
  h.text = () => lines.join("\n");
  return h;
}
const hardened = (draft, K) => (draft?.[draft.Root]?.["Integration::Action"] || []).includes(idsOf(K).S2);
const isCreate = (e) => e.kind === "rest" && e.method === "POST" && /^\/process\/2\/[^/]+\/[^/]+\?_application_id=/.test(e.path);
const after = (tl, i, pred) => { for (let j = i + 1; j < tl.length; j++) if (pred(tl[j])) return j; return -1; };
/** n-th (1-based) call matching pred gets `res` instead of the stub's answer; `then` runs once at that moment. */
const injectAt = (h, pred, nth, res, then) => { let k = 0; h.sim.inject = (c) => { if (pred(c, h) && ++k === nth) { then?.(h); return typeof res === "function" ? res(h) : res; } return undefined; }; };
const pathHas = (s) => (c) => c.kind === "rest" && c.path.includes(s);
/** Rewrites the js_code of the script step PS in a draft (in place). */
function setScript(b, PS, fn) {
  const fm = (b[PS]?.["Action::FieldMapping"] || []).map((x) => b[x]).find((x) => x?.Name === "js_code");
  const pr = b[(fm?.["FieldMapping::Property"] || [])[0]];
  if (!pr || typeof pr.Code !== "string") throw new Error(`no js_code on ${PS}`);
  pr.Code = fn(pr.Code);
  return b;
}
const hookOf = (h, code) => (c) => c.kind === "hook" && c.path.includes(h.sim.token(code));
const OK_HOOK = { status: 200, text: '{"status":"success"}' };

// ------------------------------------------------------------------------------------------------ 1. happy path
console.log("\n== 1. happy path: the six keys in HARDENING.md's order on one stub");
{
  const h = harness();
  for (const K of ORDER) {
    const from = h.timeline.length, id = IDS[K], { T, S2 } = idsOf(K);
    const r = await h.run(K);
    check(`${K}: exit 0`, r.code === 0, r.rec.result);
    const tl = h.timeline.slice(from);
    const ix = (pred, start = -1) => after(tl, start, pred);
    const iList = ix((e) => e.method === "GET" && e.path.includes("/integration/?"));
    const iOff = ix((e) => e.path.includes(`/integration/${id}/deactivate`));
    const iPut = ix((e) => e.method === "PUT" && e.path.endsWith(`/integration/${id}/draft`));
    const iTrig = ix((e) => e.path.includes(`/trigger/${T}/test`));
    const iCap = ix((e) => e.kind === "hook", iTrig);
    const iTest = ix((e) => /\/action\/[^/]+\/test\?/.test(e.path));
    const iPub = ix((e) => e.path.endsWith(`/integration/${id}/publish`));
    const iOn = ix((e) => e.path.includes(`/integration/${id}/activate`));
    const iGuard = ix((e) => e.kind === "hook", iOn);
    const creates = tl.map((e, i) => (isCreate(e) ? i : -1)).filter((i) => i >= 0);
    check(`${K}: order preflight → fixture → 1 OFF → 2 PUT → 3 trigger Test → webhook → 4 Tests → 6 publish → activate → live checks`,
      iList === 0 && creates.every((i) => i < iOff) && iOff < iPut && iPut < iTrig && iTrig + 1 === iCap && iCap < iTest && iTest < iPub && iPub + 1 === iOn && iOn < iGuard,
      { iList, creates, iOff, iPut, iTrig, iCap, iTest, iPub, iOn, iGuard });
    const gaps = tl.slice(1).map((e, i) => e.at - tl[i].at);
    check(`${K}: every call >= ${PACE_MS / 1000} s after the previous one (${tl.length} calls)`, gaps.every((g) => g >= PACE_MS), Math.min(...gaps));
    const x = h.sim.integ[id];
    const want = r.rec.fixture?.P1 ?? r.rec.fixture?.c1;
    check(`${K}: ON, Live, the published version hardened (${S2}), its trigger sample the new ZZT payload (${DEFS[K].key})`,
      x.active && x.status === "Live" && hardened(x.published, K) && x.published[T].IsTested === true && !!want && x.published[T].Output?.[DEFS[K].key] === want,
      { active: x.active, hardened: hardened(x.published, K), out: x.published[T].Output, want });
    const refusals = r.rec.checks.filter((c) => c.kind === "refused"), accepts = r.rec.checks.filter((c) => c.kind === "accepted");
    check(`${K}: every live check passed (${r.rec.checks.length})`, r.rec.checks.length > 0 && r.rec.checks.every((c) => c.pass), r.rec.checks.filter((c) => !c.pass));
    for (const c of refusals) {
      const run = h.sim.runs.find((x2) => x2.payload?.idempotencyKey === c.sent.idempotencyKey);
      check(`${K}: refused by the hardened script with exactly the printed text: "${c.expect.slice(0, 90)}"`, run && run.ok === false && run.message === c.expect, run);
    }
    for (const c of accepts) {
      const run = h.sim.runs.find((x2) => x2.payload?.idempotencyKey === c.sent.idempotencyKey);
      check(`${K}: the accepted live call ran the whole hardened chain (${c.code})`, run?.ok === true, run);
    }
    check(`${K}: state.json updated (hardened, tested, active)`, /^applied /.test(h.store.state.integrations[K].hardened) && h.store.state.integrations[K].active === true);
  }
  check("every ZZT item deleted (the stub holds none) and the ledger has no open item", h.sim.items.size === 0 && activeItems(h.store.ledger).length === 0, { items: [...h.sim.items.keys()], open: activeItems(h.store.ledger) });
  check("no webhook URL, token (or any https URL) in the output", !/https?:\/\//.test(h.text()) && !h.text().includes("ZZTSIMTOKEN"));
  check("the captures were posted while OFF: no live run was lost or ran during a capture", !h.sim.runs.some((x) => x.lost));
  check("rate: never more than 10 calls in any 60 s window", h.timeline.every((e, i) => h.timeline.filter((f) => f.at >= e.at && f.at < e.at + 60000).length <= 10));

  // 4. the ledger: an intent before every create; every id recorded before the call after the one that revealed it
  console.log("\n== 4. the ledger is written before the calls");
  const tl = h.timeline;
  const creates = tl.map((e, i) => (isCreate(e) ? i : -1)).filter((i) => i >= 0);
  check(`an intent line is in the ledger before each of the ${creates.length} creates`, creates.every((i) => { const last = h.store.ledger[tl[i].ledgerLen - 1]; return last?.ev === "intent" && tl[i].path.includes(`/${last.flow}?`); }));
  const misses = [];
  for (const c of h.sim.created) {
    const j = tl.findIndex((e) => e.resText?.includes(c.id));
    if (j < 0 || j + 1 >= tl.length) { misses.push({ id: c.id, why: "never revealed" }); continue; }
    if (!h.store.ledger.slice(0, tl[j + 1].ledgerLen).some((e) => e.ev === "created" && e.id === c.id)) misses.push({ id: c.id, revealedBy: tl[j].path, next: tl[j + 1].path });
  }
  check(`each of the ${h.sim.created.length} items (fixture creates, I-1's request, the Test's and the live call's queries) is in the ledger before the next call`, !misses.length, misses);
}

// ------------------------------------------------------------------------------------------------ 2. failure at each step
console.log("\n== 2. a failure at each step after 1 switches it back ON (history; the published version stays the unhardened one)");
{
  const K = "history", id = IDS[K], { T, S1 } = idsOf(K);
  const off = (h) => !h.sim.integ[id].active;
  const err = { status: 500, body: { status: "error", error_code: "ZZT_INJECTED", message: "injected" } };
  const POINTS = [
    ["1 the switch-off answers 500", (c) => pathHas(`/integration/${id}/deactivate`)(c), 1, err],
    ["2 the live draft's re-read fails", (c, h) => off(h) && c.method === "GET" && pathHas(`/integration/${id}/draft`)(c), 1, err],
    ["2 the draft PUT fails", (c) => c.method === "PUT" && pathHas(`/integration/${id}/draft`)(c), 1, err],
    ["2 the read-back is not hardened", (c, h) => off(h) && c.method === "GET" && pathHas(`/integration/${id}/draft`)(c), 2, () => ({ status: 200, body: snapshotDraft(id) })],
    ["3 the trigger Test fails", pathHas(`/trigger/${T}/test`), 1, err],
    ["3 the webhook POST fails", (c, h) => c.kind === "hook" && off(h), 1, { status: 500, text: "injected" }],
    ["3 the capture is lost (200, but no sample)", (c, h) => c.kind === "hook" && off(h), 1, { status: 200, text: '{"status":"success"}' }],
    ["4 a step Test fails", pathHas("/action/"), 1, { status: 400, body: { status: "error", error_code: "ZZT_INJECTED" } }],
    ["4 storing a Test's Output fails", (c) => c.method === "PUT" && pathHas(`/integration/${id}/draft`)(c), 2, err],
    ["5 the trigger sample PUT fails", (c) => c.method === "PUT" && pathHas(`/integration/${id}/draft`)(c), 6, err],
    ["5 the draft read back before the publish is no longer the hardened one", (c, h) => off(h) && c.method === "GET" && pathHas(`/integration/${id}/draft`)(c), 10,
      (h) => ({ status: 200, body: setScript(structuredClone(h.sim.integ[id].draft), idsOf(K).PS, (code) => `${code}\n// changed in the builder`) })],
    ["6 the publish fails", pathHas(`/integration/${id}/publish`), 1, err],
  ];
  for (const [label, pred, nth, res] of POINTS) {
    const h = harness();
    injectAt(h, pred, nth, res);
    const r = await h.run(K);
    const x = h.sim.integ[id];
    const lastOn = h.timeline.map((e) => e.path).lastIndexOf(h.timeline.find((e) => e.path.includes(`/integration/${id}/activate`))?.path);
    check(`${label}: exit 1, ON again, the published version unhardened, "ROLLBACK" and the backup printed`,
      r.code === 1 && x.active === true && !hardened(x.published, K) && lastOn >= 0 && /ROLLBACK/.test(h.text()) && /backup of the unhardened draft: backups\//.test(h.text()),
      { code: r.code, active: x.active, hardened: hardened(x.published, K), result: r.rec.result });
    if (label.startsWith("3 the capture is lost")) check("   … stopped at step 4 by the capture check (the Test read the old sample)", /capture did not land/.test(r.rec.result) && r.rec.result.includes(S1), r.rec.result);
    if (label.startsWith("5 the draft read back")) check("   … stopped at step 5 by the hardening check, before the publish", /^step 5: .*no longer the hardened one/.test(r.rec.result) && !h.timeline.some((e) => e.path.includes("/publish")), r.rec.result);
  }
  // the failure IS the switch-on: loud, not retried
  const h = harness();
  injectAt(h, pathHas(`/integration/${id}/activate`), 1, err);
  const r = await h.run(K);
  const ons = h.timeline.filter((e) => e.path.includes(`/integration/${id}/activate`)).length;
  check("6 the switch-on fails: exit 3, said loudly (MAY BE OFF + the --reactivate command), not retried, still OFF", r.code === 3 && ons === 1 && h.sim.integ[id].active === false && /MAY BE OFF/.test(h.text()) && h.text().includes(`${SELF} ${K} --reactivate --apply`), { code: r.code, ons });
  const h2 = harness();
  injectAt(h2, pathHas(`/integration/${id}/activate`), 1, { status: 200, body: { IsActive: false } });
  const r2 = await h2.run(K);
  check("6 the switch-on answers IsActive false: exit 3, loud, not retried", r2.code === 3 && h2.timeline.filter((e) => e.path.includes(`/integration/${id}/activate`)).length === 1 && /MAY BE OFF/.test(h2.text()));
  // the rollback's own switch-on fails
  const h3 = harness();
  let k3 = 0;
  h3.sim.inject = (c) => { if (pathHas("/action/")(c)) return { status: 400, body: { status: "error", error_code: "ZZT_INJECTED" } }; if (pathHas(`/integration/${id}/activate`)(c) && ++k3 === 1) return err; return undefined; };
  const r3 = await h3.run(K);
  check("a failed step, then the rollback switch-on fails too: exit 3, loud", r3.code === 3 && /the rollback switch-on failed/.test(h3.text()) && h3.sim.integ[id].active === false);
}

// ------------------------------------------------------------------------------------------------ 3. 429 / HTML
console.log("\n== 3. a 429 or an HTML answer stops the run at once; the switch-on is left as one printed command");
{
  const K = "history", id = IDS[K];
  const h = harness();
  injectAt(h, pathHas("/action/"), 2, { status: 429, body: "Too Many Requests" });
  const r = await h.run(K);
  const i429 = h.timeline.findIndex((e) => e.status === 429);
  check("429 at a step Test (OFF): exit 75, no call after it (no switch-on attempted)", r.code === 75 && i429 === h.timeline.length - 1 && h.sim.integ[id].active === false, { code: r.code, i429, n: h.timeline.length });
  check("   … the exact command and the 20-min pause printed, the pending switch-on written", h.text().includes(`${SELF} ${K} --reactivate --apply`) && h.text().includes(`${PAUSE_MIN} min`) && h.store.pending?.key === K && Date.parse(h.store.pending.notBefore) === h.timeline[i429].at + PAUSE_MIN * 60000, h.store.pending);
  const n0 = h.timeline.length;
  const early = await reactivate(K, h.opts());
  check("   … --reactivate before the pause is over: refused, no call", early.code === 2 && h.timeline.length === n0);
  h.advance(PAUSE_MIN * 60000);
  const late = await reactivate(K, h.opts());
  check("   … --reactivate after the pause: one activate + the read-back, ON, pending cleared", late.code === 0 && h.timeline.length === n0 + 2 && h.sim.integ[id].active && h.store.pending === null);
  check("   … the published version is still the unhardened one (the run stopped before step 6)", !hardened(h.sim.integ[id].published, K));

  const hb = harness();
  hb.store.pending = { key: "opRound", id: IDS.opRound, at: "x", notBefore: "x", command: `${SELF} opRound --reactivate --apply` };
  const rb = await hb.run(K);
  check("a pending switch-on blocks a new run (exit 2, only the dev check, no call)", rb.code === 2 && hb.timeline.length === 0 && /pending/.test(rb.rec.result));

  const h2 = harness();
  injectAt(h2, (c) => c.kind === "rest", 1, { status: 429, body: {} });
  const r2 = await h2.run(K);
  check("429 on the first preflight call: exit 75, one call, nothing switched, the pause written (no switch-on)", r2.code === 75 && h2.timeline.length === 1 && h2.store.pending?.switchOn === false && !h2.store.pending.command && /nothing to switch on/.test(h2.text()) && h2.store.lock === null, h2.store.pending);
  const again = await h2.run(K);
  check("   … a run right after it: refused by the pause (exit 2), no call", again.code === 2 && h2.timeline.length === 1 && /pause/.test(again.rec.result), again.rec.result);
  h2.advance(PAUSE_MIN * 60000);
  const later = await h2.run(K);
  check("   … after the pause: the run starts (the pause cleared) and ends with exit 0", later.code === 0 && h2.store.pending === null, later.rec.result);

  const h3 = harness();
  injectAt(h3, (c) => c.method === "PUT" && pathHas(`/integration/${id}/draft`)(c), 1, { status: 403, body: "<!DOCTYPE html><html><title>Just a moment...</title></html>" });
  const r3 = await h3.run(K);
  check("a Cloudflare HTML answer at step 2's PUT: treated as a 429 (exit 75, pending, no further call)", r3.code === 75 && h3.store.pending?.key === K && h3.timeline.at(-1).status === 403);

  const h4 = harness();
  injectAt(h4, (c, hh) => c.kind === "hook" && !hh.sim.integ[id].active, 1, { status: 429, text: "Too Many Requests" });
  const r4 = await h4.run(K);
  check("429 on the capture webhook: exit 75, pending, no further call", r4.code === 75 && h4.store.pending?.key === K && h4.timeline.at(-1).kind === "hook");

  const h5 = harness();
  let k5 = 0;
  h5.sim.inject = (c) => { if (pathHas("/action/")(c)) return { status: 400, body: { status: "error", error_code: "ZZT_INJECTED" } }; if (pathHas(`/integration/${id}/activate`)(c) && ++k5 === 1) return { status: 429, body: {} }; return undefined; };
  const r5 = await h5.run(K);
  check("a step fails, then the rollback's switch-on gets a 429: exit 75, pending, the command printed", r5.code === 75 && h5.store.pending?.key === K && h5.text().includes(`${SELF} ${K} --reactivate --apply`));

  const h6b = harness();
  let k6 = 0;
  h6b.sim.inject = (c) => { if (k6 === -1) return undefined; if (isCreate(c)) { k6 = 1; return undefined; } if (k6 === 1) { k6 = -1; return { status: 429, body: {} }; } return undefined; };
  const r6 = await h6b.run("opRound");
  const ledgerC1 = h6b.store.ledger.filter((e) => e.role === "C1").map((e) => e.ev);
  check("ledger: a 429 on the call right after the first create leaves the intent AND the created id in the ledger", r6.code === 75 && ledgerC1.join(",") === "intent,created" && h6b.sim.created.length === 1 && h6b.store.ledger.some((e) => e.id === h6b.sim.created[0].id), { code: r6.code, ledgerC1 });
  check("   … and prints the open item and its clean-up command", h6b.text().includes(`C1=${h6b.sim.created[0].id} (case)`) && h6b.text().includes(`${SELF} cleanup case --apply`));
}

// ------------------------------------------------------------------------------------------------ 5. other guards
console.log("\n== 5. interrupt, non-dev account, guard regressions, clean-up, dry run");
{
  const K = "history", id = IDS[K];
  const h = harness();
  const abort = { flag: false };
  let k = 0;
  h.sim.inject = (c) => { if (pathHas("/action/")(c) && ++k === 2) abort.flag = true; return undefined; };
  const r = await h.run(K, { abort });
  check("Ctrl-C during step 4: stops before the next call, switches back ON (exit 1)", r.code === 1 && h.sim.integ[id].active === true && /interrupted/.test(r.rec.result), r.rec.result);

  const ho = harness();
  const ro = await ho.run("opEdited");
  check("opEdited before opRound: stops in the fixture (exit 2), nothing created, nothing switched", ro.code === 2 && ho.sim.created.length === 0 && !ho.timeline.some((e) => /deactivate|activate/.test(e.path)) && /run the keys in HARDENING.md's order/.test(ro.rec.result), ro.rec.result);

  const h2 = harness();
  h2.raw.acc = "AcPRODUCTION0";
  const r2 = await h2.run(K);
  check("a non-dev account: refused before any call (exit 2)", r2.code === 2 && h2.timeline.length === 0);

  // a missing guard must make a live check FAIL: publish the unhardened version behind the orchestrator's back
  for (const [KK, label] of [["opRound", "op.round's twin guard"], ["history", "history's reverse link"]]) {
    const hg = harness();
    const iid = IDS[KK];
    hg.sim.inject = (c) => { if (pathHas(`/integration/${iid}/activate`)(c)) hg.sim.integ[iid].published = snapshotDraft(iid); return undefined; };
    const rg = await hg.run(KK);
    const failed = rg.rec.checks.filter((c) => !c.pass).map((c) => c.label);
    check(`a regression (the unhardened version live) is caught by the live checks: ${label} (exit 1, no clean-up)`, rg.code === 1 && failed.length > 0 && !/^7 /m.test(hg.text()), failed);
  }

  // cleanup of what a stopped run left
  const hc = harness();
  injectAt(hc, (c, hh) => c.kind === "rest" && !hh.sim.integ[IDS.opRound].active && c.path.includes("/publish"), 1, { status: 500, body: {} });
  const rc = await hc.run("opRound");
  const openBefore = activeItems(hc.store.ledger).length;
  const cl = await cleanupGroups("all", hc.opts());
  check(`cleanup all after a stopped run: ${openBefore} open items deleted, 404 read back, the stub empty`, rc.code === 1 && openBefore >= 5 && cl.code === 0 && activeItems(hc.store.ledger).length === 0 && hc.sim.items.size === 0, { rc: rc.code, openBefore, cl: cl.code, left: [...hc.sim.items.keys()] });

  // the dry run: offline, writes nothing
  const files = () => ({ ledger: existsSync(here("./apply-harden-ledger.jsonl")), pending: existsSync(here("./apply-harden-PENDING.json")), runs: existsSync(here("./apply-harden-runs")), backups: readdirSync(here("./backups")).length });
  const f0 = files();
  const out = [];
  const code = await dryRun("release", { out: (l) => out.push(l) });
  const text = out.join("\n");
  check("dry run release: exit 0, no file written (ledger, pending, runs, backups)", code === 0 && JSON.stringify(files()) === JSON.stringify(f0), { f0, f1: files() });
  check("   … it lists the switch-off, the PUT, the capture, the Tests, the publish and the switch-on with their paths", [`/integration/${IDS.release}/deactivate`, `/integration/${IDS.release}/draft`, `/trigger/Trigger_release_webhook/test`, "<webhook release.requested: URL from SET:current, not printed>", "/action/Action_release_read_target/test", `/integration/${IDS.release}/publish`, `/integration/${IDS.release}/activate`].every((s) => text.includes(s)));
  check("   … no URL in it, and placeholders instead of ids", !/https?:\/\//.test(text) && !/PkSIM\d/.test(text) && text.includes("<R1>") && text.includes("<C2>"));
}

// ------------------------------------------------------------------------------------------------ 6. review fixes
console.log("\n== 6. the review fixes (21 Oct, evening)");
{
  const K = "history", id = IDS[K], { PS } = idsOf(K);
  const err400 = { status: 400, body: { status: "error", error_code: "ZZT_INJECTED" } };

  // 6.1 webhook URLs: only the dev sandbox's own
  for (const [what, url] of [["another host", `https://example.invalid/integration/2/AcDOSunMEpSA/webhook/${"a".repeat(40)}`], ["another account on the dev host", `https://dev-beiersdorf.kissflow.eu/integration/2/AcOTHER00000/webhook/${"a".repeat(40)}`], ["no token", "https://dev-beiersdorf.kissflow.eu/integration/2/AcDOSunMEpSA/webhook/"]]) {
    const h = harness();
    injectAt(h, pathHas("/CIQ_Config_Version_A00/list"), 1, (hh) => ({ status: 200, body: { Data: [{ _id: "SIMCFG01", Config_Key: "SET:current", Payload_JSON: JSON.stringify({ webhooks: { "history.updated": url, "case.started": hh.sim.url("case.started") } }) }] } }));
    const r = await h.run(K);
    check(`a webhook URL on ${what} in SET:current: refused in the preflight (exit 2), no POST, the value not printed`, r.code === 2 && !h.timeline.some((e) => e.kind === "hook") && !h.text().split(url).slice(1).some((rest) => !rest.startsWith("<token>")) && /not a webhook of AcDOSunMEpSA/.test(r.rec.result), r.rec.result);
  }
  check("redact hides a webhook token even without the scheme", !redact("POST /integration/2/AcDOSunMEpSA/webhook/ZZTSIMTOKEN_abcdefgh0000 failed").includes("ZZTSIMTOKEN"));

  // 6.2 the script's Test answer must name the fixture's target before any target step runs
  {
    const h = harness();
    injectAt(h, pathHas(`/action/${PS}/test`), 1, { status: 200, body: { _id: "PkNOTZZT0001", Questions_History_JSON: "[]" } });
    const r = await h.run(K);
    check("history: the script's Test answer names another request: stopped at step 4 before the target step's Test, ON again, unhardened published",
      r.code === 1 && /^step 4: .*names _id PkNOTZZT0001/.test(r.rec.result) && !h.timeline.some((e) => e.path.includes("/action/Action_HU_update_request/test")) && h.sim.integ[id].active && !hardened(h.sim.integ[id].published, K), r.rec.result);
    const h2 = harness();
    injectAt(h2, pathHas(`/action/${idsOf("opRound").PS}/test`), 1, { status: 200, body: { opItemId: "PkNOTZZT0002", App_Open_Point_Id: "PkNOTZZT0002", Query_Key: "BDF-OP-0042-R1" } });
    const r2 = await h2.run("opRound");
    check("opRound: the script's Test answer names another point: no create Test, no R1q in the ledger, ON again",
      r2.code === 1 && !h2.timeline.some((e) => e.path.includes("/action/Action_OR_create_query/test")) && !h2.store.ledger.some((e) => e.role === "R1q") && h2.sim.integ[IDS.opRound].active, r2.rec.result);
  }

  // 6.3 clean-up deletes nothing without the ZZT marker
  {
    const h = harness();
    h.sim.items.set("PkREAL000001", { proc: "CIQP_Query_A00", data: { _id: "PkREAL000001", _status: "InProgress", Query_Key: "BDF-OP-0042-R1", App_Open_Point_Id: "PkREALPOINT1" } });
    h.store.ledger.push({ ev: "created", role: "R1q", flow: "CIQP_Query_A00", id: "PkREAL000001", code: "x", group: "op" });
    const cl = await cleanupGroups("all", h.opts());
    check("clean-up: an item without the ZZT-N21-A3 marker is NOT deleted (exit 1, no withdraw or DELETE, said so)", cl.code === 1 && h.sim.items.has("PkREAL000001") && /NOT deleted/.test(h.text()) && !h.timeline.some((e) => e.method === "DELETE" || e.path.includes("/withdraw")), h.text().split("\n").slice(-3));
  }

  // 6.4 the release backstop is checked on C1, so it fails when the backstop is missing from the live script
  {
    const h = harness();
    for (const k of ["opRound", "opEdited", "opClosed", "history"]) await h.run(k);
    const rid = IDS.release, rPS = idsOf("release").PS;
    h.sim.inject = (c) => { if (pathHas(`/integration/${rid}/activate`)(c)) setScript(h.sim.integ[rid].published, rPS, (code) => code.split("\n").filter((l) => !l.includes("is cancelled: no final release")).join("\n")); return undefined; };
    const r = await h.run("release");
    const failed = r.rec.checks.filter((c) => !c.pass).map((c) => c.label);
    check("release live with its case-side backstop removed: the backstop check FAILS (exit 1), and only it", r.code === 1 && failed.length === 1 && /backstop/.test(failed[0]), failed);
  }

  // 6.5 op.closed has a live accepted call (P4 → R4q)
  {
    const h = harness();
    for (const k of ["opRound", "opEdited"]) await h.run(k);
    const cid = IDS.opClosed;
    h.sim.inject = (c) => (hookOf(h, "op.closed")(c) && h.sim.integ[cid].active ? OK_HOOK : undefined);
    const r = await h.run("opClosed");
    check("opClosed with every live op.closed POST dropped: its live accepted check FAILS (exit 1)", r.code === 1 && r.rec.checks.some((c) => c.kind === "accepted" && !c.pass), r.rec.checks.map((c) => `${c.pass}:${c.label.slice(0, 50)}`));
  }

  // 6.6 the case group's order is enforced
  for (const first of ["release", "cancelled"]) {
    const h = harness();
    const r = await h.run(first);
    check(`${first} run first: stopped in its fixture (exit 2), nothing created or switched`, r.code === 2 && h.sim.created.length === 0 && !h.timeline.some((e) => /activate/.test(e.path)) && /HARDENING.md's order/.test(r.rec.result), r.rec.result);
  }
  {
    const h = harness();
    await h.run("opRound");
    const n = h.sim.created.length;
    const r = await h.run("release");
    check("release after opRound but without history: exit 2, nothing created", r.code === 2 && h.sim.created.length === n && /history has not ended with exit 0/.test(r.rec.result), r.rec.result);
    h.sim.inject = (c) => (pathHas("/action/Action_HU_update_request/test")(c) ? err400 : undefined);
    const rh = await h.run("history");
    h.sim.inject = null;
    const r2 = await h.run("release");
    check("release after a history that failed (exit 1): exit 2", rh.code === 1 && r2.code === 2 && /history has not ended with exit 0/.test(r2.rec.result), r2.rec.result);
  }

  // 6.7 a create whose answer is lost: found by its code at the clean-up
  {
    const h = harness();
    const orig = h.raw.call;
    let k = 0;
    h.raw.call = async (m, p, b) => { const r = await orig(m, p, b); if (m === "POST" && /\/CIQ_Case_A00\?/.test(p) && ++k === 1) throw new TypeError("fetch failed"); return r; };
    const r = await h.run("opRound");
    h.raw.call = orig;
    const lost = unresolvedIntents(h.store.ledger);
    check("a create whose answer is lost: exit 2 (before the switch-off), the intent printed with the clean-up command", r.code === 2 && lost.length === 1 && lost[0].role === "C1" && /answer was lost/.test(h.text()) && h.text().includes(`${SELF} cleanup case --apply`), { code: r.code, lost });
    const cl = await cleanupGroups("all", h.opts());
    check("   … cleanup all finds it by its code and deletes it (the stub empty)", cl.code === 0 && h.sim.items.size === 0 && unresolvedIntents(h.store.ledger).length === 0, [...h.sim.items.keys()]);
  }

  // 6.8 a hand-off that lands after its poll: the clean-up sweep finds and deletes its item
  {
    const h = harness();
    const rid = IDS.opRound;
    let held = null;
    h.sim.inject = (c) => { if (!held && hookOf(h, "op.round")(c) && h.sim.integ[rid].active && hardened(h.sim.integ[rid].published, "opRound")) { held = c; return OK_HOOK; } return undefined; };
    const r = await h.run("opRound");
    h.sim.inject = null;
    await h.sim.hook(held.path, held.body); // it lands now, after the run
    const late = [...h.sim.items.values()].filter((x) => x.proc === "CIQP_Query_A00" && /-R2$/.test(x.data.Query_Key)).map((x) => x.data._id);
    const cl = await cleanupGroups("all", h.opts());
    check("the accepted op.round lands after its poll: the run fails (exit 1) and says so; cleanup all sweeps the late R2 query and deletes it", r.code === 1 && /may still create an item later/.test(h.text()) && late.length === 1 && cl.code === 0 && h.sim.items.size === 0, { code: r.code, late, cl: cl.code, left: [...h.sim.items.keys()] });
  }

  // 6.9 a re-run: the printed unhardened backup really is the unhardened draft
  {
    const h = harness();
    h.sim.inject = (c) => (pathHas("/action/Action_HU_update_request/test")(c) ? err400 : undefined);
    const r1 = await h.run(K), r2 = await h.run(K);
    const line = h.lines.filter((l) => /backup of the unhardened draft/.test(l)).at(-1) || "";
    const f = (r2.rec.backups.unhardened || "").replace(/ \(dry run: not written\)$/, "");
    check("a re-run after a failure: the backup printed as unhardened is unhardened (the first run's), and its own step-2 backup is called already hardened",
      r1.code === 1 && r2.code === 1 && !!f && line.includes(f) && h.store.backups[f] && !hardened(h.store.backups[f], K) && hardened(h.store.backups[r2.rec.backups.beforeHarden.replace(/ \(dry run: not written\)$/, "")], K) && /already hardened/.test(h.text()), { line, f });
  }

  // 6.10 a 429 while ON: the pause holds for every run and the clean-up
  {
    const h = harness();
    let k = 0;
    h.sim.inject = (c) => (hookOf(h, "history.updated")(c) && h.sim.integ[id].active && ++k === 1 ? { status: 429, text: "Too Many Requests" } : undefined);
    const r = await h.run(K);
    h.sim.inject = null;
    check("a 429 at a live check (ON): exit 75, the pause written (no switch-on), the clean-up command says not before", r.code === 75 && h.store.pending?.switchOn === false && h.sim.integ[id].active && /clean them up when done \(not before /.test(h.text()), h.store.pending);
    const n0 = h.timeline.length;
    const cl = await cleanupGroups("all", h.opts()), rr = await h.run("release");
    check("   … right after: the clean-up and the next key refuse (exit 2), no call", cl.code === 2 && rr.code === 2 && h.timeline.length === n0, { cl: cl.code, rr: rr.code });
    h.advance(PAUSE_MIN * 60000);
    const cl2 = await cleanupGroups("all", h.opts());
    check("   … after the pause: the clean-up runs (exit 0, the pause cleared, the stub empty)", cl2.code === 0 && h.store.pending === null && h.sim.items.size === 0);
  }

  // 6.11 one run at a time; a killed run's "may be OFF" survives in the lock
  {
    const h = harness();
    let seen = null;
    h.sim.inject = (c) => { if (seen === null && pathHas(`/integration/${id}/draft`)(c) && !h.sim.integ[id].active) seen = structuredClone(h.store.lock); return undefined; };
    await h.run(K);
    check("during the OFF window the lock says MAY BE OFF (what a SIGKILL would leave); after the run it is gone", seen?.mayBeOff === true && seen.key === K && h.store.lock === null, seen);
    const base = { pid: 424242, what: `${K} --apply`, key: K, id, at: "2026-10-22T07:59:00Z" };
    const h1 = harness();
    h1.store.lock = { ...base, mayBeOff: false };
    const r1 = await h1.run("release", { pidAlive: () => true });
    check("another live run holds the lock: refused (exit 2), no call", r1.code === 2 && h1.timeline.length === 0 && /another apply-harden run/.test(r1.rec.result), r1.rec.result);
    const h2 = harness();
    h2.store.lock = { ...base, mayBeOff: true, published: false };
    h2.sim.integ[id].active = false; // as the killed run left it
    const r2 = await h2.run("opRound", { pidAlive: () => false });
    check("a dead run's lock says MAY BE OFF: every run refuses (exit 2, no call) and names the --reactivate command", r2.code === 2 && h2.timeline.length === 0 && r2.rec.result.includes(`${SELF} ${K} --reactivate --apply`), r2.rec.result);
    const ra = await reactivate(K, h2.opts({ pidAlive: () => false }));
    check("   … --reactivate: ON, the lock released", ra.code === 0 && h2.sim.integ[id].active && h2.store.lock === null);
    const h3 = harness();
    h3.store.lock = { ...base, mayBeOff: false };
    const r3 = await h3.run("opRound", { pidAlive: () => false });
    check("a dead run's lock that left nothing OFF: taken over, the run ends with exit 0, the lock released", r3.code === 0 && h3.store.lock === null && /stale lock taken over/.test(h3.text()), r3.rec.result);
  }

  // 6.12 a signal during the pacing wait: no call after it but the forced switch-on
  {
    const h = harness();
    const abort = { flag: false };
    let at = -1;
    const sleep = async (ms) => { h.advance(ms); if (!abort.flag && !h.sim.integ[id].active && h.timeline.some((e) => e.path.includes("/action/"))) { abort.flag = true; at = h.timeline.length; } };
    const r = await h.run(K, { abort, sleep });
    const afterSig = h.timeline.slice(at).map((e) => e.path.split("?")[0]);
    check("a signal during the pacing wait: no further call except the forced switch-on and its read-back; ON (exit 1)", r.code === 1 && at > 0 && afterSig.length === 2 && afterSig[0].endsWith(`/integration/${id}/activate`) && h.sim.integ[id].active && /interrupted/.test(r.rec.result), afterSig);
  }

  // 6.13 a network error on step 6's switch-on: loud, no second call
  {
    const h = harness();
    const orig = h.raw.call;
    let k = 0;
    h.raw.call = async (m, p, b) => { if (p.includes(`/integration/${id}/activate`)) { k++; throw new TypeError("fetch failed"); } return orig(m, p, b); };
    const r = await h.run(K);
    check("a network error on step 6's switch-on: exit 3, loud, one switch-on call only, the lock keeps MAY BE OFF", r.code === 3 && k === 1 && /MAY BE OFF/.test(h.text()) && h.store.lock?.mayBeOff === true && h.store.lock?.published === true, { code: r.code, k, lock: h.store.lock });
  }

  // 6.14 a 429 between the publish and the switch-on: --reactivate says the live checks never ran
  {
    const h = harness();
    injectAt(h, pathHas(`/integration/${id}/activate`), 1, { status: 429, body: {} });
    const r = await h.run(K);
    check("a 429 on step 6's switch-on (after the publish): exit 75, the pending switch-on says published", r.code === 75 && h.store.pending?.published === true && h.store.pending?.switchOn === true);
    h.advance(PAUSE_MIN * 60000);
    const ra = await reactivate(K, h.opts());
    check("   … --reactivate: ON, and it says the hardened version is live without its live checks, and how to run them", ra.code === 0 && h.sim.integ[id].active && /live checks \(HARDENING step 6\) never ran/.test(h.text()) && h.text().includes(`${SELF} ${K} --apply again`));
  }

  // 6.15 slow hand-offs: the refusal window can't be trusted, the run fails
  {
    const h = harness();
    h.sim.inject = (c) => { if (pathHas(`/integration/${id}/activate`)(c)) h.sim.integ[id].published = snapshotDraft(id); return undefined; };
    h.deferHook = (url) => (h.sim.integ[id].active && url.includes(h.sim.token("history.updated")) ? 50000 : 0);
    const r = await h.run(K);
    const win = r.rec.checks.find((c) => /refusal window/.test(c.label));
    const ref = r.rec.checks.find((c) => c.kind === "refused");
    check("the unhardened version live and 50-s hand-offs: the refusal check is fooled, the window check fails the run (exit 1)", r.code === 1 && ref?.pass === true && win?.pass === false, r.rec.checks.map((c) => `${c.pass}:${c.label.slice(0, 60)}`));
  }
}

// ------------------------------------------------------------------------------------------------ 7. the 22 Oct upgrade
console.log("\n== 7. op.round hardened on 21 Oct is upgraded: the current script and the Raised_By_Email mapping (22 Oct)");
{
  const K = "opRound", id = IDS[K], spec = hardenSpecOf(K);
  const text = (f) => readFileSync(here(`./scripts/${f}`), "utf8");
  const prev = text("harden/op-round.2026-10-21.js"), cur = text("harden/op-round.js");
  let n = 0;
  const ids = (p) => `${p}_T7_${++n}`;
  /** The draft as the 21 Oct run left it: hardened with the earlier script, no output mapping (as built then). */
  const as21 = () => hardenDraft(snapshotDraft(id), { ...spec, map: {} }, { from: text("op-round.js"), to: prev }, ids).blob;
  const scriptOf = (b) => { const fm = (b[idsOf(K).PS]?.["Action::FieldMapping"] || []).map((x) => b[x]).find((x) => x?.Name === "js_code"); return b[(fm?.["FieldMapping::Property"] || [])[0]]?.Code; };
  const mapsRaiser = (b) => (b.Action_OR_create_query?.["Action::FieldMapping"] || []).map((x) => b[x]).some((fm) => fm?.Name === "Raised_By_Email" && (fm["FieldMapping::Property"] || []).some((p) => b[p]?.Field === `context.${idsOf(K).PS}.Raised_By_Email`));
  check("the 21 Oct draft runs the earlier script and does not map Raised_By_Email", scriptOf(as21()) === prev && !mapsRaiser(as21()) && prev !== cur);

  const h = harness();
  h.sim.integ[id].draft = as21();
  h.sim.integ[id].published = as21();
  const r = await h.run(K);
  const x = h.sim.integ[id];
  check("upgrade: exit 0, step 2 PUT the upgraded draft (the plan says so)", r.code === 0 && h.timeline.some((e) => e.method === "PUT" && e.path.includes(`/integration/${id}/draft`)) && /step 2 upgrades it/.test(h.text()), r.rec.result);
  check("   … ON, Live, the published version runs the current script and maps Raised_By_Email", x.active && x.status === "Live" && scriptOf(x.published) === cur && mapsRaiser(x.published));
  check("   … every live check passed, the raiser's e-mail on both rounds' queries among them", r.rec.checks.length > 0 && r.rec.checks.every((c) => c.pass) && r.rec.checks.some((c) => /Raised_By_Email/.test(c.label)), r.rec.checks.filter((c) => !c.pass));
  // op.round is the op group's first key: its items (and the case pair they hang on) stay until the clean-up
  const cl = await cleanupGroups("all", h.opts());
  check("   … the clean-up deletes every ZZT item", cl.code === 0 && h.sim.items.size === 0 && activeItems(h.store.ledger).length === 0, [...h.sim.items.keys()]);

  // a 21 Oct draft changed in the builder since: refused before anything is written
  const h2 = harness();
  const changed = setScript(as21(), idsOf(K).PS, (c) => c + "\n// edited in the builder");
  h2.sim.integ[id].draft = changed;
  h2.sim.integ[id].published = structuredClone(changed);
  const r2 = await h2.run(K);
  check("a hardened draft whose script is neither the 21 Oct one nor the current one: refused at the preflight, nothing written", r2.code !== 0 && /partly hardened, fix by hand first/.test(h2.text()) && !h2.timeline.some((e) => e.method === "PUT" || isCreate(e)), r2.rec.result);

  // the upgraded draft again: already current, no PUT
  const done = structuredClone(x.published);
  const again = hardenDraft(done, spec, { from: text("op-round.js"), to: cur, prev }, ids);
  check("the upgraded draft is already current: nothing to change", again.already === true);
}

console.log(`\n${fail ? "FAILED" : "ALL PASSED"}: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
