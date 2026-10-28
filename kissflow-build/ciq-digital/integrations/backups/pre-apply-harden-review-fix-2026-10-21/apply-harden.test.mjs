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
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { runKey, reactivate, cleanupGroups, memoryStore, activeItems, dryRun, ORDER, PACE_MS, PAUSE_MIN } from "./apply-harden.mjs";
import { createSim, snapshotDraft } from "./apply-harden-sim.mjs";
import { idsOf, DEFS } from "./integ-defs.mjs";

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
  const lines = [], timeline = [];
  const raw = {
    acc: sim.acc, domain: sim.domain,
    call: async (method, path, body) => {
      const e = { kind: "rest", method, path, at: t, ledgerLen: store.ledger.length };
      timeline.push(e);
      const r = await sim.call(method, path, body);
      e.status = r.status; e.resText = JSON.stringify(r.body ?? null);
      return r;
    },
    hook: async (url, payload) => {
      const e = { kind: "hook", method: "POST", path: url, payload, at: t, ledgerLen: store.ledger.length };
      timeline.push(e);
      const r = await sim.hook(url, payload);
      e.status = r.status; e.resText = r.text;
      return r;
    },
  };
  const h = { sim, store, lines, timeline, raw, now, advance: (ms) => { t += ms; } };
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
  check("no webhook URL (or any https URL) in the output", !/https?:\/\//.test(h.text()) && !h.text().includes("sim.invalid"));
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
  check("429 on the first preflight call: exit 75, one call, nothing switched, no pending", r2.code === 75 && h2.timeline.length === 1 && h2.store.pending === null && /nothing to switch on/.test(h2.text()));

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

console.log(`\n${fail ? "FAILED" : "ALL PASSED"}: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
