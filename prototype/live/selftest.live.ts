// Offline self-test of the live suite's infrastructure (live/lib). It never calls Kissflow, whatever LIVE says: the REST
// layer runs over a stub transport (scripted answers in the live shapes of the request logs), the world over the fakes.
// Covered: the path guard (refused routes never reach the transport), ledger-only writes (both guard layers), the
// ledger timing (an id is recorded before the next call), StopError on a 429 and on HTML (no retry, latched, the
// checkpoint, the 20-minute state file), the redacting request log (webhooks as "webhook:<code>"), pacing on the
// injected clock, the My tasks / admin list emulation from _current_context, the boot role read, the results recorder,
// the fake integrations, and one offline world round (createCase → I-1 → the request, guards and fingerprint).
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import * as A from "@/domain/actions";
import { APP_ID, FLOWS, OTHER_ROLES, ROLES, STEPS, STEP_NAMES } from "@/app-live/ids";
import { AppError } from "@/app-live/kf/client";
import { createFakeClient } from "@/app-live/kf/fakeClient";
import { configRows } from "@/app-live/testing/rawFixtures";
import { SYNCED_REQUEST_FIELDS } from "@/app-live/shared/handoff";
import { PORTAL_ID, STEPS as PORTAL_STEPS } from "@/portal/kf/portal";
import { createFakeIntegrations } from "./lib/fakeIntegrations";
import { createFakePortal } from "./lib/fakePortal";
import { diff, fingerprint } from "./lib/fingerprint";
import { APP_HOOK_CODES, checkIntegrations, pollUntil } from "./lib/hooks";
import { createLedger } from "./lib/ledger";
import {
  DEV_HOST,
  GuardError,
  KfError,
  THOMAS,
  classifyPath,
  createGuard,
  createLiveClient,
  createRequestLog,
  createRest,
  heldSteps,
  loadKfModule,
  isDevHookUrl,
  readHeldRoles,
  redactDeep,
  redactUrls,
  type FetchLike,
  type Transport,
} from "./lib/liveClient";
import { createLivePortalClient } from "./lib/livePortalClient";
import { LATE_MAX_MS, StopError, createQueue, realClock, virtualClock } from "./lib/queue";
import { recorder } from "./lib/results";
import { boot, bootPortal, cleanupRun, createWorld, perform, tagOf } from "./lib/world";

const ACC = "AcDOSunMEpSA";
const QA = `_application_id=${APP_ID}`;
const QP = `_application_id=${PORTAL_ID}`;
const HOOK = "https://hooks.invalid/app/case.started";
const TAG = tagOf("SELF");

type Answer = { status: number; body: unknown };
const OK: Answer = { status: 200, body: {} };

/** The REST layer over a stub transport and a virtual clock; every transport call is recorded. */
function rig(o: { answer?: (method: string, path: string, body: unknown) => Answer; held?: string[]; fetchFails?: string } = {}) {
  const clock = virtualClock();
  const queue = createQueue({ clock });
  const ledger = createLedger({ run: "SELF" });
  const log = createRequestLog();
  const guard = createGuard({ ledger, tag: TAG });
  const calls: { method: string; path: string; body: unknown; start: number }[] = [];
  const ctl: { answer?: (method: string, path: string, body: unknown) => Answer } = { answer: o.answer };
  const transport: Transport = {
    acc: ACC,
    domain: DEV_HOST,
    async call(method, path, body) {
      calls.push({ method, path, body, start: clock.now() });
      const r = (ctl.answer ?? (() => OK))(method, path, body);
      clock.advance(200); // every call takes 200 ms of virtual time
      return r;
    },
  };
  const posts: { url: string; body: string; start: number }[] = [];
  const fetchImpl: FetchLike = async (url, init) => {
    posts.push({ url, body: init.body, start: clock.now() });
    clock.advance(100);
    if (o.fetchFails) throw new TypeError(o.fetchFails);
    return { status: 200, text: async () => '{"status":"success"}' };
  };
  const rest = createRest({ transport, queue, log, guard, fetchImpl });
  // as read live at 02:30 on 21 Oct (SPEC §2): Thomas is in Business administrator only
  const holder = { userId: THOMAS, roleIds: new Set(o.held ?? [ROLES.admin.id]) };
  return {
    clock,
    queue,
    ledger,
    log,
    guard,
    calls,
    posts,
    rest,
    client: createLiveClient(rest, holder),
    portal: createLivePortalClient(rest, holder),
    /** Replaces the scripted answers from here on. */
    set answer(f: (method: string, path: string, body: unknown) => Answer) {
      ctl.answer = f;
    },
  };
}

const refusedBy = async (p: Promise<unknown>, cls: new (...a: never[]) => Error = GuardError) => {
  const e = await p.then(() => undefined, (x: unknown) => x);
  expect(e, "expected a refusal").toBeInstanceOf(cls);
  return e as Error;
};

// ------------------------------------------------------------------------------------------------ the path guard

describe("path guard: only SPEC §2's routes leave the suite", () => {
  const refused: [string, string][] = [
    ["PUT", `/metadata/2/${ACC}/process/CIQ_Case_A00/draft`],
    ["POST", `/metadata/2/${ACC}/process/CIQ_Case_A00/publish`],
    ["GET", `/metadata/2/${ACC}/integration/CIQ_I_1_Case_to_supplier_request_A00/draft/test`],
    ["PUT", `/flow/2/${ACC}/integration/CIQ_op_round_Open_point_question_t_A00/deactivate`],
    ["POST", `/flow/2/${ACC}/integration/`],
    ["POST", `/integration/2/${ACC}/CIQ_I_1_Case_to_supplier_request_A00/action/Action_I1_create_request/test`],
    ["PUT", `/app_role/2/${ACC}/RoEKl87f38Xw?${QA}`],
    ["POST", `/app_role/2/${ACC}/?${QA}`],
    ["POST", `/flow/2/${ACC}/process/CIQ_Case_A00/member/batch`],
    ["GET", `/flow/2/${ACC}/process/CIQ_Case_A00/member`],
    ["POST", `/flow/2/${ACC}/list/CIQ_Priority_A00/items`],
    ["GET", `/connector/2/${ACC}/subscription`],
    ["POST", `/upload/2/${ACC}/`],
    ["POST", `/form/2/${ACC}/CIQ_Config_Version_A00?${QA}`],
    ["POST", `/form/2/${ACC}/CIQ_Config_Version_A00/PkCfg01?${QA}`],
    ["DELETE", `/form/2/${ACC}/CIQ_Config_Version_A00/PkCfg01?${QA}`],
    ["POST", `/process/2/${ACC}/CIQP_Request_A00?${QP}`],
    ["POST", `/process/2/${ACC}/CIQ_Case_Thomas_A00?${QA}`],
    ["POST", `/process/2/${ACC}/CIQ_Case_A00/PkC1/PkA1/sendback?${QA}`],
    ["GET", `/process/2/AcOTHER/admin/CIQ_Case_A00/PkC1?${QA}`],
    ["GET", `https://${DEV_HOST}/process/2/${ACC}/admin/CIQ_Case_A00/PkC1?${QA}`],
    ["GET", `/process/2/${ACC}/admin/CIQ_Case_A00/PkC1`],
    ["GET", `/process/2/${ACC}/admin/CIQ_Case_A00/PkC1?${QP}`],
    ["GET", `/process/2/${ACC}/admin/CIQ_Case_A00/../../x?${QA}`],
  ];
  it.each(refused)("refuses %s %s before any call", async (method, path) => {
    const r = rig();
    await refusedBy(r.rest.call(method, path, {}));
    expect(r.calls).toEqual([]);
    expect(r.log.entries).toEqual([]);
  });

  it("finds kissflow-build/lib/kf.mjs (loading it reads nothing: no .env, no call)", async () => {
    expect(typeof (await loadKfModule()).client).toBe("function");
  });

  it("lets the item and list reads through", () => {
    const reads: [string, string][] = [
      ["GET", `/process/2/${ACC}/admin/CIQ_Case_A00/PkC1?${QA}`],
      ["GET", `/process/2/${ACC}/CIQ_Open_Point_A00/myitems?${QA}&page_number=1&page_size=50`],
      ["GET", `/process/2/${ACC}/CIQ_Open_Point_A00/PkO1/PkA1?${QA}`],
      ["GET", `/process/2/${ACC}/admin/CIQP_Request_A00/PkR1?${QP}`],
      ["GET", `/form/2/${ACC}/CIQ_Supplier_A00/FmS1?${QA}`],
      ["POST", `/form/2/${ACC}/CIQ_Config_Version_A00/list?${QA}&page_number=1&page_size=50`],
      ["GET", `/flow/2/${ACC}/integration/?${QA}&page_number=1&page_size=300`],
      ["GET", `/flow/2/${ACC}/process/?${QP}`],
      ["GET", `/app_role/2/${ACC}/list?${QA}`],
      ["GET", `/app_role/2/${ACC}/RoEKl89I5nGx?${QA}`],
      ["GET", `/metadata/2/${ACC}/process/CIQ_Case_A00/draft?${QA}`],
    ];
    for (const [m, p] of reads) expect(classifyPath(m, p, ACC), `${m} ${p}`).toEqual({ read: true });
  });
});

// ------------------------------------------------------------------------------------------------ ledger-only writes

describe("writes: only this run's ledger items, only this run's data", () => {
  it("refuses every write to an item outside the ledger, at both layers, before any call", async () => {
    const r = rig();
    const c = r.client;
    await refusedBy(c.update("case", "PkThomas", "PkA1", { Priority: "High" }));
    await refusedBy(c.submit("op", "PkThomas", "PkA1"));
    await refusedBy(c.withdraw("case", "PkThomas", "x"));
    await refusedBy(c.adminPut("review", "PkThomas", { Open_Count: 0 }));
    await refusedBy(c.remove("case", "PkThomas"));
    await refusedBy(c.remove("supplier", "FmThomasSupplier"));
    await refusedBy(c.formUpdate("supplier", "FmThomasSupplier", { Supplier_City: "x" }));
    await refusedBy(c.discard("case", "PkThomas"));
    // the floor, without the flow-level wrapper
    await refusedBy(r.rest.call("PUT", `/process/2/${ACC}/admin/CIQ_Case_A00/PkThomas?${QA}`, {}));
    await refusedBy(r.rest.call("POST", `/process/2/${ACC}/CIQ_Case_A00/PkThomas/PkA1/submit?${QA}`, {}));
    await refusedBy(r.rest.call("DELETE", `/form/2/${ACC}/CIQ_Supplier_A00/FmThomasSupplier?${QA}`));
    // the portal: only adopted items; never a create
    await refusedBy(r.portal.update("request", "PkPortalSessionReq", "PkA1", { Answers_Rev: 9 }));
    await refusedBy(r.portal.adminUpdate("query", "PkPortalSessionQry", { Response_Text: "x" }));
    await refusedBy(r.portal.create("request", {}));
    expect(r.calls).toEqual([]);
  });

  it("sends a ledger item's writes on the SPEC §2 routes, exactly", async () => {
    const r = rig();
    r.guard.record(FLOWS.case.id, "PkC1", "a run case", "Start");
    r.guard.record(FLOWS.supplier.id, "FmS1", "the run supplier", "saved");
    r.guard.record("CIQP_Request_A00", "PkR1", "its request", "fill");
    r.answer = (m, p) => (m === "GET" && p.includes("/admin/CIQP_Request_A00/PkR1") ? { status: 200, body: { _id: "PkR1", App_Case_Item_Id: "PkC1" } } : OK);
    await r.client.update("case", "PkC1", "PkA1", { Priority: "High" });
    await r.client.submit("case", "PkC1", "PkA1");
    await r.client.withdraw("case", "PkC1", "ZZT-N21-SELF withdrawn");
    await r.client.adminPut("case", "PkC1", { Release_Requested_At: "2026-10-21T01:00:00Z" });
    await r.client.formUpdate("supplier", "FmS1", { Supplier_City: "Reus" });
    await r.client.remove("supplier", "FmS1");
    await r.client.remove("case", "PkC1");
    await r.portal.update("request", "PkR1", "PkRA1", { Answers_Rev: 2 });
    await r.portal.submit("request", "PkR1", "PkRA1");
    expect(r.calls.map((x) => [x.method, x.path, x.body])).toEqual([
      ["POST", `/process/2/${ACC}/CIQ_Case_A00/PkC1/PkA1?${QA}`, { Priority: "High" }],
      ["POST", `/process/2/${ACC}/CIQ_Case_A00/PkC1/PkA1/submit?${QA}`, {}],
      ["POST", `/process/2/${ACC}/CIQ_Case_A00/PkC1/withdraw?${QA}`, { Comment: "ZZT-N21-SELF withdrawn" }],
      ["PUT", `/process/2/${ACC}/admin/CIQ_Case_A00/PkC1?${QA}`, { Release_Requested_At: "2026-10-21T01:00:00Z" }],
      ["POST", `/form/2/${ACC}/CIQ_Supplier_A00/FmS1?${QA}`, { Supplier_City: "Reus" }],
      ["DELETE", `/form/2/${ACC}/CIQ_Supplier_A00/FmS1?${QA}`, undefined],
      ["DELETE", `/process/2/${ACC}/admin/CIQ_Case_A00/PkC1?${QA}`, undefined],
      // an adopted portal item is read once (is it this run's?) before its first write
      ["GET", `/process/2/${ACC}/admin/CIQP_Request_A00/PkR1?${QP}`, undefined],
      ["POST", `/process/2/${ACC}/CIQP_Request_A00/PkR1/PkRA1?${QP}`, { Answers_Rev: 2 }],
      ["POST", `/process/2/${ACC}/CIQP_Request_A00/PkR1/PkRA1/submit?${QP}`, {}],
    ]);
  });

  it("creates only this run's data, and records the new id before the next call", async () => {
    let atNextCall: boolean | undefined;
    const r = rig({
      answer: (m, p) => {
        if (m === "POST" && p.startsWith(`/process/2/${ACC}/CIQ_Case_A00?`)) return { status: 200, body: { _id: "PkNew1" } }; // no step named
        if (m === "GET" && p.includes("/admin/CIQ_Case_A00/PkNew1")) {
          atNextCall = r.ledger.has("PkNew1");
          return { status: 200, body: { _id: "PkNew1", _current_context: [{ _context_activity_instance_id: "PkNewAct" }] } };
        }
        return OK;
      },
    });
    const made = await r.client.create("case", { Case_Code: `${TAG}-C01`, Trade_Name: `${TAG} Glycerin` });
    expect(made).toEqual({ id: "PkNew1", act: "PkNewAct" });
    expect(atNextCall).toBe(true);
    expect(r.ledger.latest()).toMatchObject([{ run: "SELF", flow: "CIQ_Case_A00", app: APP_ID, id: "PkNew1", stage: "Start" }]);
    // not this run's: no tag, no ledger item named
    await refusedBy(r.client.create("case", { Case_Code: "CIQ-2026-0042", Trade_Name: "Thomas test" }));
    await refusedBy(r.client.create("review", { Review_Key: "x", Case_Item_Id: "PkThomasCase", Case_Code: "CIQ-2026-0042" }));
    await refusedBy(r.client.formCreate("config", { Config_Key: `${TAG}-SET` }));
    expect(r.calls.filter((c) => c.method !== "GET")).toHaveLength(1);
  });

  it("refuses a new row naming someone else's item, even when its text carries the run tag", async () => {
    const r = rig();
    r.guard.record(FLOWS.case.id, "PkC1", "a run case", "Start");
    await refusedBy(r.client.formCreate("note", { Case_Item_Id: "PkThomasCase", Note_Text: `${TAG} a note on Thomas's own case` }));
    await refusedBy(r.client.formCreate("audit", { Case_Item_Id: "PkC1", Object_Item_Id: "PkThomasOp", Event_Key: `EV-${TAG}` }));
    await r.client.formCreate("audit", { Case_Item_Id: "PkC1", Object_Item_Id: "PkC1", Event_Key: `EV-${TAG}` }).catch(() => undefined); // ours: it goes out
    expect(r.calls.map((c) => c.method)).toEqual(["POST"]);
  });

  it("matches the ledger by flow: a form's draft id (draft_<user>) opens no other form, a payload key names its flow", async () => {
    const r = rig();
    r.guard.record(FLOWS.note.id, "draft_UsEJUfjYLM8Y", "a note (draft)", "draft");
    r.guard.record(FLOWS.op.id, "PkOp1", "a run point", "Start");
    r.guard.knowHook("case.started", HOOK);
    await refusedBy(r.client.formUpdate("supplier", "draft_UsEJUfjYLM8Y", { Supplier_City: "x" }));
    await refusedBy(r.client.update("case", "PkOp1", "PkA1", {}));
    await refusedBy(r.client.postWebhook(HOOK, { caseItemId: "PkOp1" }));
    expect(r.calls).toEqual([]);
    expect(r.posts).toEqual([]);
  });

  it("records a form row's draft before its submit, and the new id after", async () => {
    let draftKnown: boolean | undefined;
    const r = rig({
      answer: (m, p) => {
        if (m === "POST" && p.startsWith(`/form/2/${ACC}/CIQ_Internal_Note_A00?`)) return { status: 200, body: { _id: "draft_UsEJUfjYLM8Y" } };
        if (p.includes("/draft_UsEJUfjYLM8Y/submit")) {
          draftKnown = r.ledger.has("draft_UsEJUfjYLM8Y");
          return { status: 200, body: { _id: "FmNote1" } };
        }
        return OK;
      },
    });
    r.guard.record(FLOWS.case.id, "PkC1", "a run case", "Start");
    expect(await r.client.formCreate("note", { Case_Item_Id: "PkC1", Note_Text: `${TAG} a note` })).toBe("FmNote1");
    expect(draftKnown).toBe(true);
    expect(r.ledger.latest().map((e) => [e.id, e.stage])).toEqual([["PkC1", "Start"], ["draft_UsEJUfjYLM8Y", "draft"], ["FmNote1", "saved"]]);
  });
});

// ------------------------------------------------------------------------------------------------ StopError

describe("StopError: a 429 or an HTML answer stops the run", () => {
  it("throws on a 429, without retry, latches, runs the checkpoint once and logs the answer", async () => {
    const r = rig({ answer: () => ({ status: 429, body: "<!DOCTYPE html><html><head><title>Just a moment...</title></head></html>" }) });
    let checkpoints = 0;
    r.queue.onStop(() => checkpoints++);
    const e = await refusedBy(r.client.adminGet("case", "PkC1"), StopError);
    expect((e as StopError).status).toBe(429);
    expect(r.calls).toHaveLength(1); // no retry
    await refusedBy(r.client.adminGet("case", "PkC2"), StopError);
    await refusedBy(r.rest.webhook(HOOK, {}, "case.started"), Error);
    expect(r.calls).toHaveLength(1); // nothing after the stop
    expect(r.posts).toHaveLength(0);
    expect(checkpoints).toBe(1);
    expect(r.log.entries).toMatchObject([{ method: "GET", status: 429 }]);
    expect(r.log.entries[0]!.err).toMatch(/429/);
  });

  it("throws on an HTML answer with a 200 status (a Cloudflare challenge)", async () => {
    const r = rig({ answer: () => ({ status: 200, body: "<html><body>Just a moment...</body></html>" }) });
    await refusedBy(r.client.formList("audit"), StopError);
    expect(r.queue.stopped()?.message).toMatch(/HTML answer/);
  });

  it("keeps every process of the suite paused for 20 minutes through the state file", async () => {
    const file = join(mkdtempSync(join(tmpdir(), "live-queue-")), "queue-state.json");
    const clock = virtualClock();
    const q1 = createQueue({ clock, stateFile: file });
    await refusedBy(q1.run("GET x", async () => q1.check(429, "", "GET x")), StopError);
    clock.advance(10 * 60 * 1000);
    const q2 = createQueue({ clock, stateFile: file });
    let called = false;
    await refusedBy(q2.run("GET y", async () => void (called = true)), StopError);
    expect(called).toBe(false);
    clock.advance(11 * 60 * 1000);
    const q3 = createQueue({ clock, stateFile: file });
    await q3.run("GET z", async () => void (called = true));
    expect(called).toBe(true);
  });

  it("ends the recorder: the step is not-run, the checkpoint is written, later steps are not-run", async () => {
    const dir = `${mkdtempSync(join(tmpdir(), "live-results-"))}/`;
    const r = rig({ answer: () => ({ status: 429, body: "" }) });
    const rec = recorder({ suite: "stop", run: "SELF", dir, queue: r.queue });
    await refusedBy(rec.step("reads the case", async () => void (await r.client.adminGet("case", "PkC1"))), StopError);
    expect((await rec.step("later", async (s) => s.readBack("x", 1))).status).toBe("not-run");
    const saved = JSON.parse(readFileSync(rec.file, "utf8")) as { stopped?: string; counts: Record<string, number> };
    expect(saved.stopped).toMatch(/429/);
    expect(saved.counts["not-run"]).toBe(2);
  });
});

// ------------------------------------------------------------------------------------------------ pacing and the log

describe("pacing and the request log", () => {
  it("keeps 2500 ms between calls (REST and webhooks alike) on the injected clock, without waiting", async () => {
    const r = rig();
    r.guard.record(FLOWS.case.id, "PkC1", "a run case", "Start");
    r.guard.knowHook("case.started", HOOK);
    const t0 = Date.now();
    await r.client.adminGet("case", "PkC1").catch(() => undefined); // {} is no item: the call still went out
    await r.client.postWebhook(HOOK, { caseItemId: "PkC1" });
    await r.client.formList("audit");
    await r.client.adminGet("case", "PkC1").catch(() => undefined);
    expect(Date.now() - t0).toBeLessThan(1000);
    const starts = r.queue.history.map((h) => h.at);
    expect(starts).toHaveLength(4);
    const ends = [200, 100, 200]; // each call's own duration (the stub's virtual time)
    for (let i = 1; i < starts.length; i++) expect(starts[i]! - (starts[i - 1]! + ends[i - 1]!)).toBeGreaterThanOrEqual(2500);
  });

  it("logs a webhook as webhook:<code>: never its URL, never a body", async () => {
    const r = rig();
    r.guard.record(FLOWS.case.id, "PkC1", "a run case", "Start");
    r.guard.knowHook("case.started", HOOK);
    expect(await r.client.postWebhook(HOOK, { caseItemId: "PkC1", idempotencyKey: "k" })).toBe("fetch");
    expect(r.posts).toEqual([{ url: HOOK, body: JSON.stringify({ caseItemId: "PkC1", idempotencyKey: "k" }), start: expect.any(Number) }]);
    expect(r.log.entries).toEqual([{ at: expect.any(String), method: "POST", path: "webhook:case.started", status: 200, ms: 100 }]);
    expect(JSON.stringify(r.log.entries)).not.toMatch(/https?:|caseItemId/);
  });

  it("redacts a URL out of a failed POST's error, and refuses unknown URLs and non-ledger items", async () => {
    const r = rig({ fetchFails: `fetch failed: ${HOOK}?token=secret` });
    r.guard.record(FLOWS.case.id, "PkC1", "a run case", "Start");
    r.guard.knowHook("case.started", HOOK);
    const e = await refusedBy(r.client.postWebhook(HOOK, { caseItemId: "PkC1" }), Error);
    expect(e.message).not.toMatch(/https?:|secret/);
    expect(r.log.entries[0]).toMatchObject({ path: "webhook:case.started", status: 0, err: "fetch failed: <url>" });
    await refusedBy(r.client.postWebhook("https://example.invalid/other", { caseItemId: "PkC1" }));
    await refusedBy(r.client.postWebhook(HOOK, { caseItemId: "PkThomasCase" }));
    await refusedBy(r.client.postWebhook(HOOK, { note: "no item" }));
    expect(r.posts).toHaveLength(1);
    expect(redactUrls(`see https://${DEV_HOST}/process/2/${ACC}/admin/CIQ_Case_A00/PkC1 and https://hooks.invalid/x?y=1`)).toBe(`see https://${DEV_HOST}/process/2/${ACC}/admin/CIQ_Case_A00/PkC1 and <url>`);
  });

  it("bounds a call that does not answer (no retry); the next waits for the late answer, then the gap (no overlap)", async () => {
    vi.useFakeTimers();
    try {
      const starts: number[] = [];
      const queue = createQueue({ clock: realClock });
      const guard = createGuard({ ledger: createLedger({ run: "SELF" }), tag: TAG });
      const transport: Transport = {
        acc: ACC,
        domain: DEV_HOST,
        call: () => {
          starts.push(Date.now());
          // the first call answers at 70 s, ten seconds after its cut-off
          return starts.length === 1 ? new Promise((r) => setTimeout(() => r({ status: 200, body: { _id: "PkC1" } }), 70000)) : Promise.resolve({ status: 200, body: { Data: [] } });
        },
      };
      const rest = createRest({ transport, queue, log: createRequestLog(), guard });
      const t0 = Date.now();
      const hung = rest.call("GET", `/process/2/${ACC}/admin/CIQ_Case_A00/PkC1?${QA}`).then(() => "answered", (e: Error) => e.message);
      await vi.advanceTimersByTimeAsync(60000);
      expect(await hung).toMatch(/did not answer within 60 s; not retried/);
      const next = rest.pages("GET", `/process/2/${ACC}/CIQ_Case_A00/myitems?${QA}`);
      await vi.advanceTimersByTimeAsync(20000);
      expect(await next).toEqual([]);
      expect(starts).toHaveLength(2); // no retry
      expect(starts[1]! - t0).toBeGreaterThanOrEqual(70000 + 2500); // after the late answer and the gap
      expect(queue.stopped()).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it("stops the run when a cut-off call has not answered LATE_MAX_MS later (nothing may overlap it)", async () => {
    vi.useFakeTimers();
    try {
      let n = 0;
      const queue = createQueue({ clock: realClock });
      const guard = createGuard({ ledger: createLedger({ run: "SELF" }), tag: TAG });
      const transport: Transport = { acc: ACC, domain: DEV_HOST, call: () => (++n === 1 ? new Promise(() => undefined) : Promise.resolve({ status: 200, body: { Data: [] } })) };
      const rest = createRest({ transport, queue, log: createRequestLog(), guard });
      const hung = rest.call("GET", `/process/2/${ACC}/admin/CIQ_Case_A00/PkC1?${QA}`).catch((e: Error) => e);
      await vi.advanceTimersByTimeAsync(60000);
      expect(await hung).toBeInstanceOf(Error);
      const next = rest.call("GET", `/process/2/${ACC}/admin/CIQ_Case_A00/PkC2?${QA}`).catch((e: Error) => e);
      await vi.advanceTimersByTimeAsync(LATE_MAX_MS);
      const e = await next;
      expect(e).toBeInstanceOf(StopError);
      expect([n, queue.stopped()]).toEqual([1, e]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("holds the next call for a webhook POST that was cut off as well", async () => {
    vi.useFakeTimers();
    try {
      const starts: number[] = [];
      const queue = createQueue({ clock: realClock });
      const ledger = createLedger({ run: "SELF" });
      const guard = createGuard({ ledger, tag: TAG });
      guard.record(FLOWS.case.id, "PkC1", "a run case", "Start");
      guard.knowHook("case.started", HOOK);
      const transport: Transport = { acc: ACC, domain: DEV_HOST, call: async () => (starts.push(Date.now()), { status: 200, body: { _id: "PkC1" } }) };
      const fetchImpl: FetchLike = () => new Promise((r) => setTimeout(() => r({ status: 200, text: async () => "{}" }), 65000));
      const rest = createRest({ transport, queue, log: createRequestLog(), guard, fetchImpl });
      const t0 = Date.now();
      const posted = rest.webhook(HOOK, { caseItemId: "PkC1" }, "case.started").catch((e: Error) => e.message);
      await vi.advanceTimersByTimeAsync(60000);
      expect(await posted).toMatch(/webhook:case\.started did not answer within 60 s/);
      const next = rest.call("GET", `/process/2/${ACC}/admin/CIQ_Case_A00/PkC1?${QA}`);
      await vi.advanceTimersByTimeAsync(10000);
      await next;
      expect(starts[0]! - t0).toBeGreaterThanOrEqual(65000 + 2500);
    } finally {
      vi.useRealTimers();
    }
  });

  it("turns a Kissflow error envelope into its own text", async () => {
    const r = rig({ answer: () => ({ status: 404, body: { type: "ValidationExceptions", error_code: "KISSFLOW_ERROR_050201", en_message: "This item has moved out of your queue." } }) });
    const e = (await refusedBy(r.client.getTask("review", "PkR1", "PkA1"), KfError)) as KfError;
    expect([e.message, e.status]).toEqual(["KISSFLOW_ERROR_050201 This item has moved out of your queue.", 404]);
  });
});

// ------------------------------------------------------------------------------------------------ emulations

/** An admin GET answer at one step, assigned as given (the live _current_context shape). */
const at = (id: string, activityId: string, act: string, to: { _id: string; Kind: string }[], o: { named?: boolean; status?: string } = {}) => ({
  _id: id,
  _status: o.status ?? "InProgress",
  _modified_at: "2026-10-21T01:00:00Z",
  _current_step: STEP_NAMES[activityId],
  _current_context: [{ _context_current_step: STEP_NAMES[activityId], _context_assigned_to: to.map((u) => ({ ...u, Name: u._id })), NodeType: "UserTask", ...(o.named ? {} : { _context_activity_id: activityId }), _context_activity_instance_id: act }],
});
const ME = { _id: THOMAS, Kind: "User" };

describe("emulations: admin list and My tasks from _current_context", () => {
  const items: Record<string, unknown> = {
    PkOpMine: at("PkOpMine", STEPS.op.RMM, "PkActOpMine", [ME]),
    PkOpOther: at("PkOpOther", STEPS.op.QM, "PkActOpOther", [{ _id: "UsSomeoneElse", Kind: "User" }]),
    PkCaseRun: at("PkCaseRun", STEPS.case.waiting, "PkActCase", [{ _id: OTHER_ROLES.integration.id, Kind: "AppRole" }], { named: true }),
    PkReviewQm: at("PkReviewQm", STEPS.review.QM, "PkActRev", [{ _id: ROLES.qm.id, Kind: "AppRole" }]),
    PkDraft: at("PkDraft", STEPS.op.start, "PkActDraft", [ME], { status: "Draft" }),
  };
  const myitems: Record<string, string[]> = { CIQ_Open_Point_A00: ["PkOpMine", "PkOpOther", "PkDraft"], CIQ_Case_A00: [], CIQ_Review_A00: ["PkReviewQm"] };
  const answer = (m: string, p: string): Answer => {
    const mine = /\/process\/2\/[^/]+\/([A-Za-z0-9_]+)\/myitems/.exec(p);
    if (mine) return { status: 200, body: { Columns: [], Data: (myitems[mine[1]!] ?? []).map((id) => ({ _id: id, _status: "InProgress" })) } };
    const admin = /\/admin\/[A-Za-z0-9_]+\/([A-Za-z0-9_]+)\?/.exec(p);
    if (m === "GET" && admin) return items[admin[1]!] ? { status: 200, body: items[admin[1]!] } : { status: 404, body: { error_code: "KISSFLOW_ERROR_01015", en_message: `The item, ${admin[1]}, could not be located.` } };
    return OK;
  };

  it("lists My items ∪ the ledger ids, reads each by admin GET, and keeps only the steps Thomas holds", async () => {
    const r = rig({ answer });
    r.guard.record(FLOWS.case.id, "PkCaseRun", "a run case", "Start"); // not in My items (an adopted item)
    r.guard.record(FLOWS.case.id, "PkGone", "deleted earlier", "deleted");
    expect((await r.client.adminList("op")).map((x) => x._id)).toEqual(["PkOpMine", "PkOpOther"]); // no draft
    expect((await r.client.myTasks("op", STEPS.op.RMM)).map((x) => [x._id, x._activity_instance_id])).toEqual([["PkOpMine", "PkActOpMine"]]);
    expect(await r.client.myTasks("op", STEPS.op.QM)).toEqual([]);
    // a 404 is a deleted item, whatever its code (21 Oct: 145 admin GETs answered 404/050201 across every log and none of
    // those items read 200 again), so it is left out; a refusal that is not a 404 is reported, not hidden
    const gone = rig({ answer: (m, p) => (p.includes("/admin/") ? { status: 404, body: { error_code: "KISSFLOW_ERROR_050201", en_message: "This item has moved out of your queue." } } : answer(m, p)) });
    expect(await gone.client.adminList("op")).toEqual([]);
    const moved = rig({ answer: (m, p) => (p.includes("/admin/") ? { status: 400, body: { error_code: "KISSFLOW_ERROR_050201", en_message: "This item has moved out of your queue." } } : answer(m, p)) });
    await refusedBy(moved.client.adminList("op"), KfError);
    // the case's waiting step is held by Integration service, which has no members since 02:30 (SPEC §2) …
    expect(await r.client.myTasks("case", STEPS.case.waiting)).toEqual([]);
    // … review department steps by the reviewer roles, which Thomas does not hold either
    expect(await r.client.myTasks("review", STEPS.review.QM)).toEqual([]);
  });

  it("holds a step through a role Thomas is a member of (a step named only by its _context_current_step)", async () => {
    const r = rig({ answer, held: [ROLES.admin.id, OTHER_ROLES.integration.id] });
    r.guard.record(FLOWS.case.id, "PkCaseRun", "a run case", "Start");
    expect((await r.client.myTasks("case", STEPS.case.waiting)).map((x) => [x._id, x._activity_instance_id])).toEqual([["PkCaseRun", "PkActCase"]]);
  });

  it("shares one load's listings and admin reads inside oneRead", async () => {
    const r = rig({ answer });
    await r.client.oneRead(async () => {
      await r.client.adminList("op");
      for (const a of [STEPS.op.RMM, STEPS.op.QM, STEPS.op.SAF]) await r.client.myTasks("op", a);
      await r.client.adminGet("op", "PkOpMine");
    });
    expect(r.calls.map((c) => c.path.split("?")[0])).toEqual([
      `/process/2/${ACC}/CIQ_Open_Point_A00/myitems`,
      `/process/2/${ACC}/admin/CIQ_Open_Point_A00/PkOpMine`,
      `/process/2/${ACC}/admin/CIQ_Open_Point_A00/PkOpOther`,
      `/process/2/${ACC}/admin/CIQ_Open_Point_A00/PkDraft`,
    ]);
    await r.client.adminGet("op", "PkOpMine"); // outside: read again
    expect(r.calls).toHaveLength(5);
  });

  it("scope run (opt-in): one load lists the ledger items only, and the form lists only this run's rows", async () => {
    const r = rig({
      answer: (m, p) => {
        if (m === "POST" && p.includes("/CIQ_Audit_Event_A00/list")) return { status: 200, body: { Data: [{ _id: "FmA1", Case_Item_Id: "PkOpMine" }, { _id: "FmA2", Case_Item_Id: "PkThomasCase" }] } };
        if (m === "POST" && p.includes("/CIQ_Config_Version_A00/list")) return { status: 200, body: { Data: [{ _id: "PkCfg01", Config_Key: "SET:current" }] } };
        return answer(m, p);
      },
    });
    r.guard.record(FLOWS.op.id, "PkOpMine", "a run point", "Start");
    const got = await r.client.oneRead(async () => ({ op: await r.client.adminList("op"), audit: await r.client.formList("audit"), config: await r.client.formList("config") }), { scope: "run" });
    expect([got.op.map((x) => x._id), got.audit.map((x) => x._id), got.config.map((x) => x._id)]).toEqual([["PkOpMine"], ["FmA1"], ["PkCfg01"]]);
    expect(r.calls.some((c) => c.path.includes("/myitems"))).toBe(false);
    expect((await r.client.formList("audit")).map((x) => x._id)).toEqual(["FmA1", "FmA2"]); // outside: everything
  });

  it("heldSteps reads a context by its activity id, else its step name", () => {
    const steps = { [STEPS.op.RMM]: STEP_NAMES[STEPS.op.RMM]! };
    const holder = { userId: THOMAS, roleIds: new Set<string>() };
    expect(heldSteps(at("x", STEPS.op.RMM, "a1", [ME], { named: true }) as never, steps, holder)).toEqual([{ activityId: STEPS.op.RMM, act: "a1" }]);
    expect(heldSteps({ _id: "y", _current_context: [] }, steps, holder)).toEqual([]);
  });

  it("emulates the portal's My tasks the same way", async () => {
    const req = { _id: "PkReq1", _status: "InProgress", _current_context: [{ _context_current_step: PORTAL_STEPS.fill.name, _context_activity_id: PORTAL_STEPS.fill.activity, _context_activity_instance_id: "PkRAct", _context_assigned_to: [{ ...ME, Name: "Thomas" }] }] };
    const r = rig({ answer: (_m, p) => (p.includes("/myitems") ? { status: 200, body: { Data: [] } } : p.includes("/admin/CIQP_Request_A00/PkReq1") ? { status: 200, body: req } : OK) });
    r.guard.record("CIQP_Request_A00", "PkReq1", "the run's request", "fill");
    expect((await r.portal.listTasks("request", PORTAL_STEPS.fill.activity)).map((x) => [x._id, x._activity_instance_id])).toEqual([["PkReq1", "PkRAct"]]);
    expect(await r.portal.listTasks("request", PORTAL_STEPS.keep.activity)).toEqual([]);
    await refusedBy(r.portal.uploadFile(new File(["x"], "x.pdf")), Error);
  });

  it("reads the roles Thomas holds at boot (members of the roles that have any)", async () => {
    const r = rig({
      answer: (_m, p) => {
        if (p.startsWith(`/app_role/2/${ACC}/list`)) return { status: 200, body: [{ _id: ROLES.admin.id, Name: ROLES.admin.name, UserCount: 1 }, { _id: OTHER_ROLES.integration.id, Name: OTHER_ROLES.integration.name, UserCount: 1 }, { _id: ROLES.qm.id, Name: ROLES.qm.name, UserCount: 0 }] };
        if (p.includes(ROLES.admin.id) || p.includes(OTHER_ROLES.integration.id)) return { status: 200, body: { Members: [{ _id: THOMAS, Kind: "User", Name: "Thomas", Email: "thomas@example.invalid" }] } };
        return OK;
      },
    });
    expect(await readHeldRoles(r.rest, APP_ID, THOMAS)).toEqual({ roles: [{ ...ROLES.admin }, { ...OTHER_ROLES.integration }].map(({ id, name }) => ({ id, name })), name: "Thomas", email: "thomas@example.invalid" });
    expect(r.calls).toHaveLength(3); // the empty role is not read
  });
});

// ------------------------------------------------------------------------------------------------ results

describe("results: pass needs a read-back; 050201 on a review step is blocked", () => {
  it("classifies each step and writes the file, redacted", async () => {
    const dir = `${mkdtempSync(join(tmpdir(), "live-results-"))}/`;
    const rec = recorder({ suite: "rec", run: "SELF", dir });
    expect((await rec.step("pass", (s) => (s.readBack("case", { _id: "PkC1" }), void s.check("ok", true)))).status).toBe("pass");
    expect((await rec.step("no read-back", (s) => void s.check("ok", true))).status).toBe("fail");
    expect((await rec.step("failed check", (s) => (s.readBack("x", 1), void s.check("phase is Review", false, "Supplier filling in the CIQ")))).reason).toBe("failed: phase is Review");
    const queueText = "KISSFLOW_ERROR_050201 This item has moved out of your queue.";
    expect(await rec.step("complete review", () => Promise.reject(new Error(queueText)), { reviewStep: true })).toMatchObject({ status: "blocked", reason: expect.stringMatching(/^050201: .*moved out of your queue/) });
    expect(await rec.step("other 050201", () => Promise.reject(new Error(queueText)))).toMatchObject({ status: "fail", reason: queueText });
    expect(await rec.step("I-2 approve", () => Promise.reject(new Error(queueText)), { heldBy: "Integration service" })).toMatchObject({ status: "blocked", reason: expect.stringMatching(/^050201: the step is held by Integration service, which has no members/) });
    expect((await rec.step("blocked", (s) => s.block("no reviewer"))).status).toBe("blocked");
    expect((await rec.step("skipped", (s) => s.skip("dependency failed"))).status).toBe("not-run");
    await rec.step("evidence", (s) => s.readBack("hook", `posted to ${HOOK}`));
    const saved = readFileSync(rec.file, "utf8");
    expect(JSON.parse(saved).counts).toEqual({ pass: 2, fail: 3, blocked: 3, "not-run": 1 });
    expect(saved).not.toMatch(/hooks\.invalid/);
  });
});

// ------------------------------------------------------------------------------------------------ fake integrations

describe("fake integrations: the 12 hand-offs' effects, with their guards", () => {
  async function setup(o: { caseStepsHeld?: boolean } = {}) {
    const me = { _id: "UsSelf", Name: "Self Contact" };
    const fake = createFakeClient({ items: { config: configRows() }, me: { ...me, roles: [ROLES.admin.id] } }, { admin: true, enforceMandatory: false });
    const portal = createFakePortal({ me });
    const fi = createFakeIntegrations({ app: fake, portal, ...o });
    const contacts = JSON.stringify([{ _id: "UsSelf" }]);
    const c = await fake.create("case", { Case_Code: `${TAG}-C01`, Cycle_No: 1, Trade_Name: `${TAG} Glycerin`, Supplier_Legal_Name: `${TAG} Supplier`, Portal_Assignees_JSON: contacts, Release_Assignees_JSON: contacts });
    await fake.submit("case", c.id, c.act);
    return { me, fake, portal, fi, caseId: c.id };
  }
  const ok = (r: { ok: boolean; detail: string }) => expect(r, r.detail).toMatchObject({ ok: true });
  const no = (r: { ok: boolean; detail: string }, why: RegExp) => expect(r).toMatchObject({ ok: false, detail: expect.stringMatching(why) });

  it("I-1, request.changed, I-2: request created and linked, answers copied, completeness recorded", async () => {
    const { fake, portal, fi, caseId } = await setup();
    ok(fi.dispatch("case.started", { caseItemId: caseId }));
    const kase = () => fake.find(caseId)!.item;
    const rid = String(kase().Portal_Request_Item_Id);
    const req = () => portal.find(rid)!.item;
    expect(req()).toMatchObject({ App_Case_Item_Id: caseId, Case_Code: `${TAG}-C01`, Request_Key: `${TAG}-C01|1`, Supplier_Display_Name: `${TAG} Supplier`, Case_Phase_Label: "Filling in", Request_Locked: "No", Assigned_Contacts: [{ _id: "UsSelf" }] });
    expect([portal.stepOf(rid), kase().Case_Phase]).toEqual(["fill", "Supplier filling in the CIQ"]);
    no(fi.dispatch("case.started", { caseItemId: caseId }), /already has its CIQP Request/);
    no(fi.dispatch("case.started", { caseItemId: "PkNobody" }), /was not found/);

    portal.set(rid, { Answers_JSON: '{"FLD-GEN-001":"x"}', Answers_Rev: 2 });
    ok(fi.dispatch("requestChanged", { portalRequestItemId: rid }));
    expect(kase()).toMatchObject({ Answers_JSON: '{"FLD-GEN-001":"x"}', Answers_Rev: 2, Change_Report_Text: null });
    expect(SYNCED_REQUEST_FIELDS.every((f) => f in kase())).toBe(true);

    no(fi.dispatch("completenessConfirmed", { portalRequestItemId: rid }), /completeness is not confirmed/);
    portal.set(rid, { Completeness_Confirm: "Confirmed", Completeness_By_Name: "Self Contact", Completeness_At: "2026-10-21T02:00:00Z" });
    // SPEC §2 (02:30): the fields are recorded, then the Approve fails (Integration service has no members)
    no(fi.dispatch("completenessConfirmed", { portalRequestItemId: rid }), /recorded the completeness.*050201.*Integration service, which has no members/);
    expect([fake.stepOf(caseId)?.activityId, kase().Case_Phase, kase().Completeness_Confirm, kase().Completeness_At]).toEqual([STEPS.case.waiting, "Review", "Confirmed", "2026-10-21T02:00:00Z"]);
    // 25 Oct: the reviews are I-2's last step, after the Approve: the refused Approve leaves the review.started row only
    expect([fake.db.review.filter((r) => r.Case_Item_Id === caseId).length, fake.db.audit.filter((r) => r.Case_Item_Id === caseId && r.Action_Code === "review.started").length]).toEqual([0, 1]);
    no(fi.dispatch("completenessConfirmed", { portalRequestItemId: rid }), /already has its completeness/);
  });

  it("I-2 moves the case to review when Integration service has a member again", async () => {
    const { fake, portal, fi, caseId } = await setup({ caseStepsHeld: true });
    ok(fi.dispatch("case.started", { caseItemId: caseId }));
    const rid = String(fake.find(caseId)!.item.Portal_Request_Item_Id);
    portal.set(rid, { Completeness_Confirm: "Confirmed" });
    ok(fi.dispatch("completenessConfirmed", { portalRequestItemId: rid }));
    expect(fake.stepOf(caseId)?.activityId).toBe(STEPS.case.release);
    expect(fake.db.review.filter((r) => r.Case_Item_Id === caseId).map((r) => r.Review_Dept)).toEqual(["RMM"]);
  });

  it("op.round, op.edited, I-4, op.closed: a query per round, edited, answered, completed", async () => {
    const { fake, portal, fi, caseId } = await setup();
    ok(fi.dispatch("case.started", { caseItemId: caseId }));
    const p = await fake.create("op", { OP_Key: `${TAG}-OP-1`, OP_Dept: "RMM", Case_Item_Id: caseId, Case_Code: `${TAG}-C01`, Round_No: 1, Question_Text: `${TAG} Which grade?`, Portal_Contact_Ids: "UsSelf", Raiser_Assignee: [{ _id: "UsSelf" }] });
    await fake.submit("op", p.id, p.act);
    const op = () => fake.find(p.id)!.item;
    ok(fi.dispatch("op.round", { opItemId: p.id }));
    const qid = String(op().Portal_Query_Item_Id);
    expect(portal.find(qid)!.item).toMatchObject({ Query_Key: `${TAG}-OP-1-R1`, Round_No: 1, App_Open_Point_Id: p.id, Question_Text: `${TAG} Which grade?`, Supplier_Justification: "—", Assigned_Contacts: [{ _id: "UsSelf" }] });
    expect(portal.stepOf(qid)).toBe("respond");

    fake.set(p.id, { Question_Text: `${TAG} Which grade, exactly?` });
    ok(fi.dispatch("op.edited", { opItemId: p.id }));
    expect(portal.find(qid)!.item).toMatchObject({ Question_Text: `${TAG} Which grade, exactly?`, Edited_At: expect.stringMatching(/Z$/) });

    no(fi.dispatch("queryAnswered", { portalQueryItemId: qid }), /has no answer/);
    portal.set(qid, { Response_Kind: "Answer", Response_Text: `${TAG} USP grade.` });
    ok(fi.dispatch("queryAnswered", { portalQueryItemId: qid }));
    expect(op()).toMatchObject({ Response_Kind: "Answer", Response_Text: `${TAG} USP grade.`, OP_Progress: "In progress" });

    no(fi.dispatch("op.closed", { opItemId: p.id }), /still open/);
    fake.set(p.id, { OP_Outcome: "Withdrawn" });
    ok(fi.dispatch("op.closed", { opItemId: p.id }));
    expect([portal.stepOf(qid), portal.find(qid)!.item._status]).toEqual(["end", "Completed"]);
    no(fi.dispatch("op.round", { opItemId: p.id }), /is closed/);
  });

  it("I-5, history, I-6, I-7, cancel: the request asked, reopened, released; the case completed", async () => {
    const { fake, portal, fi, caseId } = await setup();
    ok(fi.dispatch("case.started", { caseItemId: caseId }));
    const rid = String(fake.find(caseId)!.item.Portal_Request_Item_Id);
    const req = () => portal.find(rid)!.item;
    portal.set(rid, { Completeness_Confirm: "Confirmed" });
    no(fi.dispatch("completenessConfirmed", { portalRequestItemId: rid }), /050201/); // the fields only (SPEC §2)

    no(fi.dispatch("history.updated", { caseItemId: caseId, questionsHistoryJson: "{}" }), /not a list/);
    ok(fi.dispatch("history.updated", { caseItemId: caseId, questionsHistoryJson: "[]" }));
    expect(req().Questions_History_JSON).toBe("[]");

    no(fi.dispatch("releaseGiven", { portalRequestItemId: rid }), /has no final release/);
    ok(fi.dispatch("release.requested", { caseItemId: caseId }));
    expect(req()).toMatchObject({ Release_Flag: "Requested", Request_Locked: "Yes", Case_Phase_Label: "Awaiting your final release", Release_At: null, Release_Contacts: [{ _id: "UsSelf" }] });
    expect(fake.find(caseId)!.item.Release_Requested_At).toMatch(/Z$/);
    ok(fi.dispatch("review.reopened", { caseItemId: caseId }));
    expect(req()).toMatchObject({ Release_Flag: "Reopened", Request_Locked: "No", Case_Phase_Label: "With Beiersdorf" });
    no(fi.dispatch("review.reopened", { caseItemId: caseId }), /not waiting for its final release/);
    ok(fi.dispatch("release.requested", { caseItemId: caseId }));

    portal.set(rid, { Release_By_Name: "Self Contact", Release_At: new Date(Date.now() + 1000).toISOString().replace(/\.\d{3}Z$/, "Z") });
    ok(fi.dispatch("releaseGiven", { portalRequestItemId: rid }));
    expect(fake.find(caseId)!.item).toMatchObject({ Final_Release_Confirm: "Confirmed", Final_Release_By_Name: "Self Contact", Case_Phase: "Completed", _status: "Completed" });
    expect(fake.stepOf(caseId)?.activityId).toBe(STEPS.case.end); // Skip and complete, from "Waiting for supplier: CIQ"

    no(fi.dispatch("case.cancelled", { caseItemId: caseId, phaseLabel: "Withdrawn", locked: "Yes" }), /is not accepted/);
    ok(fi.dispatch("case.cancelled", { caseItemId: caseId, phaseLabel: "Cancelled", locked: "Yes" }));
    expect(req()).toMatchObject({ Case_Phase_Label: "Cancelled", Request_Locked: "Yes" });
    no(fi.dispatch("requestChanged", { portalRequestItemId: rid }), /the case was cancelled/);
    no(fi.dispatch("change.received", { portalRequestItemId: rid }), /no integration is built/);
    expect(fi.runs.filter((x) => !x.ok).map((x) => x.code)).toEqual(["completenessConfirmed", "history.updated", "releaseGiven", "review.reopened", "case.cancelled", "requestChanged", "change.received"]);
  });

  it("the fake portal holds the steps as live: keep refuses its submit, release writes two fields only", async () => {
    const { fake, portal, fi, caseId, me } = await setup();
    ok(fi.dispatch("case.started", { caseItemId: caseId }));
    const rid = String(fake.find(caseId)!.item.Portal_Request_Item_Id);
    const client = portal.client({ me, onWebhook: () => undefined });
    const [task] = await client.listTasks("request", PORTAL_STEPS.fill.activity);
    await client.submit("request", rid, String(task!._activity_instance_id));
    const [keep] = await client.listTasks("request", PORTAL_STEPS.keep.activity);
    await expect(client.submit("request", rid, String(keep!._activity_instance_id))).rejects.toThrow(/Keep_Open_Gate/);
    await expect(client.update("request", rid, String(task!._activity_instance_id), { Answers_Rev: 3 })).rejects.toThrow(/050201/);
    portal.move(rid, "release");
    const [rel] = await client.listTasks("request", PORTAL_STEPS.release.activity);
    await expect(client.update("request", rid, String(rel!._activity_instance_id), { Answers_Rev: 3 })).rejects.toThrow(/050313/);
  });
});

// ------------------------------------------------------------------------------------------------ the offline world

describe("offline world: the app's own writers, the guards, the hooks and the fingerprint together", () => {
  it("creates a run case; I-1 makes its request; nothing outside the ledger changes", async () => {
    const w = await createWorld({ live: false, run: "SELF" });
    expect(w.hooks.codes()).toEqual({ app: expect.arrayContaining(APP_HOOK_CODES), portal: ["requestChanged", "completenessConfirmed", "queryAnswered", "releaseGiven"] });
    expect(w.hooks.missing()).toEqual([]);
    expect(await checkIntegrations(w.client)).toMatchObject({ ok: true, problems: [] });
    expect(w.identity.personas).toHaveLength(11);
    const before = await fingerprint({ app: w.client, portal: w.portal }, w.ledger);
    expect(before.errors).toEqual([]);

    const rmm = await boot(w, "rmm");
    const input: A.NewCaseInput = { materialName: w.text("Glycerin"), inci: "Glycerin", materialNo: w.key("RM-1"), supplierId: "SUP-ZZT-SOLVARO", contactIds: ["UsElena", "UsRavi"], markets: ["EU"], dueDate: "2026-11-30T17:00:00.000Z", priority: "normal" };
    const code = w.key("C01");
    const made = await perform(w, rmm, "createCase", [input], (s, by) => A.createCase(s, by, input, undefined, code).state);
    expect(made.result, made.refused ?? made.result?.message).toMatchObject({ ok: true });
    const caseRow = w.ledger.latest().find((e) => e.flow === FLOWS.case.id)!;
    expect(caseRow.what).toContain(code);
    // the screen's own hand-off reached the fake I-1 through the guarded client
    expect(w.offline!.integrations.runs).toMatchObject([{ code: "case.started", ok: true }]);
    const polled = await pollUntil(() => w.client.adminGet("case", caseRow.id), (it) => !!it.Portal_Request_Item_Id, { clock: w.clock });
    expect(polled).toMatchObject({ ok: true, polls: 1 });
    const rid = String(polled.value!.Portal_Request_Item_Id);
    w.adopt("CIQP_Request_A00", rid, `${code} request`, "fill");
    expect(await w.portal.adminGet("request", rid)).toMatchObject({ App_Case_Item_Id: caseRow.id, Case_Code: code });

    // a fixture case is someone else's: the guards refuse it, and the fingerprint shows nothing else changed
    const other = w.offline!.app.db.case[0]!._id;
    await refusedBy(w.client.adminPut("case", other, { Priority: "High" }));
    await refusedBy(w.hooks.post("case.cancelled", { caseItemId: other, phaseLabel: "Cancelled", locked: "Yes" }));
    const after = await fingerprint({ app: w.client, portal: w.portal }, w.ledger);
    expect(diff(before, after, new Set(w.ledger.latest().map((e) => e.id)))).toMatchObject({ changed: [], removed: [], added: [] });

    // a refusal by the domain writes nothing
    const again = await perform(w, rmm, "createCase", [{ ...input, contactIds: [] }], (s, by) => A.createCase(s, by, { ...input, contactIds: [] }).state);
    expect(again.result).toBeUndefined();
    expect(again.refused).toBeTruthy();

    // scope run: the same load, with the run's items only (no fixture case, no other supplier)
    const own = await boot(w, "rmm", { scope: "run" });
    expect(own.state.cases.map((c) => c.id)).toEqual([code]);
    expect(rmm.state.cases.length).toBeGreaterThan(1);

    // the portal side boots as the self contact (offline: the fixture user, who is no contact of this supplier)
    const p = await bootPortal(w);
    expect(p.data.bundles.some((b) => b.code === code)).toBe(false);
    expect(w.log.entries).toEqual([]); // offline: no REST call at all
  });
});

// ------------------------------------------------------------------------------------------------ safety (lib review, 21 Oct)

/** A webhook URL's shape, with a made-up secret (offline only: never a real one). */
const DEV_HOOK = `https://${DEV_HOST}/integration/2/${ACC}/webhook/ZZTfakeSecret123`;

describe("safety: the dev sandbox only, before any call", () => {
  it("createRest refuses a transport of another account or host", () => {
    const call = vi.fn();
    for (const t of [{ acc: "AcOTHER", domain: DEV_HOST }, { acc: ACC, domain: "beiersdorf.kissflow.eu" }])
      expect(() => createRest({ transport: { ...t, call }, queue: createQueue({ clock: virtualClock() }), log: createRequestLog(), guard: createGuard({ ledger: createLedger({ run: "SELF" }), tag: TAG }) })).toThrow(/dev sandbox/);
    expect(call).not.toHaveBeenCalled();
  });

  it("classifyPath refuses another account even when the caller names it as its own", () => {
    expect(() => classifyPath("GET", `/process/2/AcOTHER/admin/CIQ_Case_A00/PkC1?${QA}`, "AcOTHER")).toThrow(GuardError);
  });

  it("never POSTs to a webhook that is not the dev sandbox's, even a known one", async () => {
    const r = rig();
    r.guard.record(FLOWS.case.id, "PkC1", "a run case", "Start");
    const bad = [`https://beiersdorf.kissflow.eu/integration/2/${ACC}/webhook/x`, `https://${DEV_HOST}/integration/2/AcOTHER/webhook/x`, `http://${DEV_HOST}/integration/2/${ACC}/webhook/x`, `https://${DEV_HOST}:8443/integration/2/${ACC}/webhook/x`];
    for (const url of bad) {
      r.guard.knowHook("case.started", url);
      await refusedBy(r.client.postWebhook(url, { caseItemId: "PkC1" }));
      await refusedBy(r.rest.webhook(url, { caseItemId: "PkC1" }, "case.started"));
    }
    expect(r.posts).toEqual([]);
    expect([isDevHookUrl(DEV_HOOK), isDevHookUrl(HOOK)]).toEqual([true, true]);
  });
});

describe("safety: routes and ledger-only writes", () => {
  it("refuses a route word in an item's place (reject, skip, import, …), even on a ledger item", async () => {
    const r = rig();
    r.guard.record(FLOWS.case.id, "PkC1", "a run case", "Start");
    r.guard.record(FLOWS.supplier.id, "FmS1", "the run supplier", "saved");
    await refusedBy(r.rest.call("POST", `/process/2/${ACC}/CIQ_Case_A00/PkC1/reject?${QA}`, {}));
    await refusedBy(r.rest.call("POST", `/process/2/${ACC}/CIQ_Case_A00/PkC1/skip/submit?${QA}`, {}));
    expect(() => classifyPath("POST", `/form/2/${ACC}/CIQ_Supplier_A00/import?${QA}`, ACC)).toThrow(GuardError);
    expect(r.calls).toEqual([]);
  });

  it("never links a run item to someone else's (the integrations follow the links)", async () => {
    const r = rig();
    r.guard.record(FLOWS.case.id, "PkC1", "a run case", "Start");
    r.guard.record("CIQP_Request_A00", "PkR1", "its request", "fill");
    await refusedBy(r.client.adminPut("case", "PkC1", { Portal_Request_Item_Id: "PkPortalSessionReq" }));
    await refusedBy(r.client.update("case", "PkC1", "PkA1", { Portal_Request_Item_Id: "PkPortalSessionReq" }));
    expect(r.calls).toEqual([]);
    await r.client.adminPut("case", "PkC1", { Portal_Request_Item_Id: "PkR1" });
    await r.client.adminPut("case", "PkC1", { Portal_Request_Item_Id: "" });
    expect(r.calls).toHaveLength(2);
  });

  it("writes a form draft id only by the submit right after its create (it names the user's next draft after that)", async () => {
    let n = 0;
    const r = rig({
      answer: (m, p) => {
        if (m === "POST" && p.startsWith(`/form/2/${ACC}/CIQ_Internal_Note_A00?`)) return { status: 200, body: { _id: "draft_UsEJUfjYLM8Y" } };
        if (p.includes("/draft_UsEJUfjYLM8Y/submit")) return { status: 200, body: { _id: `FmNote${++n}` } };
        return OK;
      },
    });
    r.guard.record(FLOWS.case.id, "PkC1", "a run case", "Start");
    expect(await r.client.formCreate("note", { Case_Item_Id: "PkC1", Note_Text: `${TAG} a note` })).toBe("FmNote1");
    const after = r.calls.length;
    await refusedBy(r.client.formUpdate("note", "draft_UsEJUfjYLM8Y", { Note_Text: `${TAG} x` }));
    await refusedBy(r.client.remove("note", "draft_UsEJUfjYLM8Y"));
    await refusedBy(r.rest.call("POST", `/form/2/${ACC}/CIQ_Internal_Note_A00/draft_UsEJUfjYLM8Y/submit?${QA}`, {}));
    expect(r.calls).toHaveLength(after);
    expect(await r.client.formCreate("note", { Case_Item_Id: "PkC1", Note_Text: `${TAG} another` })).toBe("FmNote2"); // a new create arms it again
  });

  it("refuses a form submit that names no new row (the draft id is never recorded as the row)", async () => {
    const r = rig({ answer: (m, p) => (m === "POST" && p.startsWith(`/form/2/${ACC}/CIQ_Internal_Note_A00?`) ? { status: 200, body: { _id: "draft_UsEJUfjYLM8Y" } } : OK) });
    r.guard.record(FLOWS.case.id, "PkC1", "a run case", "Start");
    const e = await refusedBy(r.client.formCreate("note", { Case_Item_Id: "PkC1", Note_Text: `${TAG} a note` }), AppError);
    expect(e.message).toMatch(/without the new row's id.*NOT in the ledger/);
    expect(r.ledger.byRun().filter((x) => x.id === "draft_UsEJUfjYLM8Y").map((x) => x.stage)).toEqual(["draft"]);
  });

  it("writes an adopted portal item only once an admin GET shows it is this run's", async () => {
    const r = rig({
      answer: (m, p) => {
        if (m === "GET" && p.includes("/admin/CIQP_Request_A00/PkTheirs")) return { status: 200, body: { _id: "PkTheirs", App_Case_Item_Id: "PkPortalSessionCase", Case_Code: "ZZT-PORTAL-7" } };
        if (m === "GET" && p.includes("/admin/CIQP_Request_A00/PkOurs")) return { status: 200, body: { _id: "PkOurs", App_Case_Item_Id: "PkC1", Case_Code: `${TAG}-C01` } };
        return OK;
      },
    });
    r.guard.record(FLOWS.case.id, "PkC1", "a run case", "Start");
    r.guard.record("CIQP_Request_A00", "PkTheirs", "adopted by mistake", "fill");
    r.guard.record("CIQP_Request_A00", "PkOurs", "its request", "fill");
    await refusedBy(r.portal.adminUpdate("request", "PkTheirs", { Release_Flag: "Requested" }));
    await refusedBy(r.portal.adminDelete("request", "PkTheirs"));
    await r.portal.update("request", "PkOurs", "PkRA1", { Answers_Rev: 2 });
    await r.portal.submit("request", "PkOurs", "PkRA1");
    expect(r.calls.map((c) => `${c.method} ${c.path.split("?")[0]!.split("/").slice(-2).join("/")}`)).toEqual(["GET CIQP_Request_A00/PkTheirs", "GET CIQP_Request_A00/PkTheirs", "GET CIQP_Request_A00/PkOurs", "POST PkOurs/PkRA1", "POST PkRA1/submit"]);
  });

  it("adopts a new id for the portal processes only; a new stage of a ledger item always", async () => {
    const w = await createWorld({ live: false, run: "SELF", seed: "config" });
    expect(() => w.adopt(FLOWS.case.id, "PkThomasCase", "Thomas's case", "Start")).toThrow(GuardError);
    expect(() => w.adopt(FLOWS.supplier.id, "FmThomasSupplier", "x", "saved")).toThrow(GuardError);
    w.adopt("CIQP_Request_A00", "PkReq1", `${w.tag} request`, "fill");
    w.guard.record(FLOWS.case.id, "PkC1", "a run case", "Start");
    w.adopt(FLOWS.case.id, "PkC1", "a run case", "Waiting for supplier: CIQ");
    expect(w.ledger.latest().map((e) => [e.id, e.stage])).toEqual([["PkReq1", "fill"], ["PkC1", "Waiting for supplier: CIQ"]]);
  });
});

describe("safety: pacing and StopError across the suite's processes", () => {
  const stateFile = () => join(mkdtempSync(join(tmpdir(), "live-queue-")), "queue-state.json");

  it("a stop another running process latched holds here at once, and no save erases it", async () => {
    const file = stateFile();
    const clock = virtualClock();
    const q1 = createQueue({ clock, stateFile: file });
    const q2 = createQueue({ clock, stateFile: file });
    await q2.run("GET a", async () => undefined);
    await refusedBy(q1.run("GET x", async () => q1.check(429, "", "GET x")), StopError);
    let called = false;
    await refusedBy(q2.run("GET y", async () => void (called = true)), StopError);
    expect([called, q2.stopped()?.message]).toEqual([false, expect.stringMatching(/^Paused: Stopped on GET x: 429/)]);
    clock.advance(60000);
    await refusedBy(createQueue({ clock, stateFile: file }).run("GET z", async () => undefined), StopError);
  });

  it("a call that was in flight when another process stopped does not erase that stop with its save", async () => {
    const file = stateFile();
    const clock = virtualClock();
    const q1 = createQueue({ clock, stateFile: file });
    const q2 = createQueue({ clock, stateFile: file });
    let release!: () => void;
    const inFlight = q2.run("GET slow", () => new Promise<void>((r) => (release = r)));
    await Promise.resolve();
    await refusedBy(q1.run("GET x", async () => q1.check(429, "", "GET x")), StopError);
    release();
    await inFlight;
    expect(JSON.parse(readFileSync(file, "utf8"))).toMatchObject({ stoppedAt: expect.any(Number), why: expect.stringMatching(/429/) });
    await refusedBy(createQueue({ clock, stateFile: file }).run("GET z", async () => undefined), StopError);
  });

  it("paces against the last call of another process of the suite", async () => {
    const file = stateFile();
    const clock = virtualClock();
    const q1 = createQueue({ clock, stateFile: file });
    const q2 = createQueue({ clock, stateFile: file });
    await q1.run("GET a", async () => clock.advance(200));
    const end = clock.now();
    await q2.run("GET b", async () => undefined);
    expect(q2.history[0]!.at - end).toBeGreaterThanOrEqual(2500);
  });

  it("never writes a URL into the state file", async () => {
    const file = stateFile();
    const q = createQueue({ clock: virtualClock(), stateFile: file });
    await refusedBy(q.run("x", async () => {
      throw new StopError(`Stopped on a POST to ${DEV_HOOK}`);
    }), StopError);
    expect(readFileSync(file, "utf8")).not.toMatch(/ZZTfakeSecret123|https?:/);
  });
});

describe("safety: redaction everywhere a webhook URL could travel", () => {
  it("redacts escaped, encoded and scheme-less webhook URLs; keeps Kissflow REST URLs", () => {
    const texts = [DEV_HOOK.replace(/\//g, "\\/"), encodeURIComponent(DEV_HOOK), `connect to ${DEV_HOOK.replace("https://", "")} failed`, `"${DEV_HOOK}"`];
    for (const t of texts) expect(redactUrls(t), t).not.toMatch(/ZZTfakeSecret123/);
    const rest = `https://${DEV_HOST}/process/2/${ACC}/admin/CIQ_Case_A00/PkC1`;
    expect(redactUrls(`see ${rest}`)).toBe(`see ${rest}`);
    expect(redactUrls(`/flow/2/${ACC}/integration/?${QA}`)).toBe(`/flow/2/${ACC}/integration/?${QA}`); // the status list stays
  });

  it("redacts object keys and an Error's message and cause (results evidence)", async () => {
    const err = new Error("fetch failed", { cause: new Error(`connect to ${DEV_HOOK}`) });
    const out = redactDeep({ [DEV_HOOK]: "case.started", err }) as Record<string, unknown>;
    expect(JSON.stringify(out)).not.toMatch(/ZZTfakeSecret123/);
    expect(out.err).toMatchObject({ name: "Error", message: "fetch failed", cause: { message: "connect to <url>" } });
    const dir = `${mkdtempSync(join(tmpdir(), "live-results-"))}/`;
    const rec = recorder({ suite: "keys", run: "SELF", dir });
    await rec.step("hooks posted", (s) => (s.readBack("posted", { [DEV_HOOK]: 1 }), s.note("err", err)));
    expect(readFileSync(rec.file, "utf8")).not.toMatch(/ZZTfakeSecret123/);
  });

  it("redacts a Kissflow error text naming a webhook, and the ledger's what", async () => {
    const r = rig({ answer: () => ({ status: 400, body: { error_code: "KISSFLOW_ERROR_0", en_message: `bad hook ${DEV_HOOK}` } }) });
    const e = await refusedBy(r.client.adminGet("case", "PkC1"), KfError);
    expect(e.message).toBe("KISSFLOW_ERROR_0 bad hook <url>");
    r.guard.record("CIQP_Request_A00", "PkR9", `posted to ${DEV_HOOK}`, "fill");
    expect(JSON.stringify(r.ledger.byRun())).not.toMatch(/ZZTfakeSecret123/);
  });
});

describe("safety: R2/R3 teardown (cleanupRun) and cleanup.mjs", () => {
  it("cleanupRun deletes this run's items newest first, withdraws what is in progress, skips drafts, leaves the rest alone", async () => {
    const w = await createWorld({ live: false, run: "R2" });
    const before = await fingerprint({ app: w.client, portal: w.portal }, w.ledger);
    const rmm = await boot(w, "rmm");
    const input: A.NewCaseInput = { materialName: w.text("Glycerin"), inci: "Glycerin", materialNo: w.key("RM-1"), supplierId: "SUP-ZZT-SOLVARO", contactIds: ["UsElena", "UsRavi"], markets: ["EU"], dueDate: "2026-11-30T17:00:00.000Z", priority: "normal" };
    const made = await perform(w, rmm, "createCase", [input], (s, by) => A.createCase(s, by, input, undefined, w.key("C01")).state);
    expect(made.result).toMatchObject({ ok: true });
    const caseId = w.ledger.latest().find((e) => e.flow === FLOWS.case.id)!.id;
    const rid = String((await w.client.adminGet("case", caseId)).Portal_Request_Item_Id);
    w.adopt("CIQP_Request_A00", rid, `${w.key("C01")} request`, "fill");
    const ours = w.ledger.latest().filter((e) => e.stage !== "draft").map((e) => e.id);
    const drafts = w.ledger.latest().filter((e) => e.stage === "draft").map((e) => e.id);
    expect(drafts.length).toBeGreaterThan(0); // the audit rows' drafts
    const withdrawn: string[] = [];
    const report = await cleanupRun({ ...w, client: { ...w.client, withdraw: (f, id, c) => (withdrawn.push(id), w.client.withdraw(f, id, c)) } });
    expect(withdrawn).toEqual([caseId]); // the case was in progress (at "Waiting for supplier: CIQ")
    expect(report.failed).toEqual([]);
    expect(report.deleted.map((d) => d.id)).toEqual([...ours].reverse());
    expect(report.skipped).toEqual([...drafts].reverse().map((id) => ({ flow: expect.any(String), id, why: "a form draft" })));
    expect(report.gone).toEqual([]);
    expect(w.offline!.app.find(caseId)).toBeUndefined();
    expect(w.offline!.portal.find(rid)).toBeUndefined();
    expect(w.ledger.latest().filter((e) => ours.includes(e.id)).every((e) => e.stage === "deleted")).toBe(true);
    const after = await fingerprint({ app: w.client, portal: w.portal }, w.ledger);
    expect(diff(before, after, new Set(w.ledger.latest().map((e) => e.id)))).toMatchObject({ changed: [], removed: [], added: [] });
  });

  it("cleanupRun refuses the showcase run live and throws a StopError on at once", async () => {
    const w = await createWorld({ live: false, run: "R2", seed: "config" });
    await refusedBy(cleanupRun({ ...w, live: true, run: "R1" }));
    w.guard.record(FLOWS.case.id, "PkC1", "a run case", "Start");
    w.guard.record(FLOWS.case.id, "PkC2", "a run case", "Start");
    let reads = 0;
    const stopped = { ...w, client: { ...w.client, adminGet: async () => (reads++, Promise.reject(new StopError("Stopped on GET: 429"))) } };
    await refusedBy(cleanupRun(stopped), StopError);
    expect(reads).toBe(1);
  });

  it("cleanup.mjs plans from the ledger only and deletes newest first, paced, stopping on a 429", async () => {
    const file = fileURLToPath(new URL("../../kissflow-build/ciq-digital/tests-2026-10-21/cleanup.mjs", import.meta.url));
    type Line = { run: string; flow: string; app: string; id: string; stage: string; what?: string };
    type Item = { flow: string; id: string; stage: string };
    const mod = (await import(file)) as {
      planCleanup(lines: Line[], run?: string): { items: Item[]; skipped: (Item & { why: string })[] };
      applyCleanup(plan: unknown, d: Record<string, unknown>): Promise<{ deleted: Item[]; gone: Item[]; failed: unknown[]; notReached: Item[]; stopped?: string }>;
    };
    const L = (flow: string, id: string, stage: string, app = flow.startsWith("CIQP_") ? PORTAL_ID : APP_ID, run = "R2"): Line => ({ run, flow, app, id, stage });
    const lines = [
      L("CIQ_Supplier_A00", "FmS1", "saved"),
      L("CIQ_Case_A00", "PkC1", "Start"),
      L("CIQ_Internal_Note_A00", "draft_UsEJUfjYLM8Y", "draft"),
      L("CIQ_Internal_Note_A00", "FmN1", "saved"),
      L("CIQP_Request_A00", "PkR1", "fill"),
      L("CIQ_Case_A00", "PkC1", "Waiting for supplier: CIQ"),
      L("CIQ_Case_A00", "PkShow", "Start", APP_ID, "R1"),
      L("CIQ_Config_Version_A00", "PkCfg01", "saved"),
      L("CIQ_Case_Thomas_A00", "PkT", "Start"),
      L("CIQ_Review_A00", "PkGone", "deleted"),
      L("CIQ_Review_A00", "PkRv", "Start", PORTAL_ID),
    ];
    const plan = mod.planCleanup(lines, "R2");
    expect(plan.items.map((i) => [i.flow, i.id, i.stage])).toEqual([
      ["CIQP_Request_A00", "PkR1", "fill"],
      ["CIQ_Internal_Note_A00", "FmN1", "saved"],
      ["CIQ_Case_A00", "PkC1", "Waiting for supplier: CIQ"],
      ["CIQ_Supplier_A00", "FmS1", "saved"],
    ]);
    expect(plan.skipped.map((s) => s.id)).toEqual(["draft_UsEJUfjYLM8Y", "PkCfg01", "PkT", "PkGone", "PkRv"]);

    const clock = virtualClock();
    const calls: { m: string; p: string; body: unknown; at: number }[] = [];
    const gone = { status: 404, body: { error_code: "KISSFLOW_ERROR_01015", en_message: "The item could not be located." } };
    const deleted = new Set<string>();
    const call = async (m: string, p: string, body: unknown) => {
      calls.push({ m, p: p.split("?")[0]!, body, at: clock.now() });
      clock.advance(150);
      const id = p.split("?")[0]!.split("/").at(-1)!;
      if (m === "DELETE" && id === "FmS1") return { status: 429, body: "" };
      if (m === "DELETE") return deleted.add(id), { status: 200, body: {} };
      if (m === "GET") return deleted.has(id) ? gone : { status: 200, body: { _id: id, _status: id === "PkR1" ? "InProgress" : "Completed" } };
      return { status: 200, body: {} };
    };
    const recorded: Line[] = [];
    const out = await mod.applyCleanup(plan, { call, now: clock.now, sleep: clock.sleep, state: null, log: () => undefined, record: (l: Line) => recorded.push(l) });
    expect(calls.map((c) => `${c.m} ${c.p.split("/").slice(-2).join("/")}`)).toEqual([
      "GET CIQP_Request_A00/PkR1",
      "POST PkR1/withdraw",
      "DELETE CIQP_Request_A00/PkR1",
      "GET CIQP_Request_A00/PkR1",
      "DELETE CIQ_Internal_Note_A00/FmN1",
      "GET CIQ_Internal_Note_A00/FmN1",
      "GET CIQ_Case_A00/PkC1",
      "DELETE CIQ_Case_A00/PkC1",
      "GET CIQ_Case_A00/PkC1",
      "DELETE CIQ_Supplier_A00/FmS1",
    ]);
    for (let i = 1; i < calls.length; i++) expect(calls[i]!.at - (calls[i - 1]!.at + 150)).toBeGreaterThanOrEqual(2500);
    expect(out.deleted.map((d) => d.id)).toEqual(["PkR1", "FmN1", "PkC1"]);
    expect([out.stopped, out.notReached.map((x) => x.id)]).toEqual([expect.stringMatching(/429/), ["FmS1"]]);
    expect(recorded.map((l) => [l.id, l.stage])).toEqual([["PkR1", "deleted"], ["FmN1", "deleted"], ["PkC1", "deleted"]]);
    expect(calls.every((c) => plan.items.some((i) => c.p.includes(`/${i.id}`)))).toBe(true); // never an id outside the ledger
  });

  it("cleanup.mjs stops when a call does not answer in time (no call may overlap it)", async () => {
    const file = fileURLToPath(new URL("../../kissflow-build/ciq-digital/tests-2026-10-21/cleanup.mjs", import.meta.url));
    const mod = (await import(file)) as { applyCleanup(plan: unknown, d: Record<string, unknown>): Promise<{ deleted: unknown[]; stopped?: string; notReached: unknown[] }> };
    const clock = virtualClock();
    let n = 0;
    const plan = { items: [{ run: "R2", flow: "CIQ_Supplier_A00", app: APP_ID, kind: "form", id: "FmS1", stage: "saved" }, { run: "R2", flow: "CIQ_Supplier_A00", app: APP_ID, kind: "form", id: "FmS2", stage: "saved" }], skipped: [] };
    const out = await mod.applyCleanup(plan, { call: () => (n++, new Promise(() => undefined)), now: clock.now, sleep: clock.sleep, state: null, log: () => undefined, record: () => undefined, timeoutMs: 20 });
    expect([n, out.stopped, out.notReached.length]).toEqual([1, expect.stringMatching(/did not answer/), 2]);
  });
});

describe("the clock window (KF_WINDOW, 22 Oct: the two sessions take turns by the hour)", () => {
  it("waits only outside the window, to its next start, across the hour", async () => {
    const { windowWaitMs } = await import("./lib/queue");
    const at = (h: number, m: number, s = 0) => new Date(2026, 9, 22, h, m, s).getTime();
    const w = [0, 28] as const;
    expect(windowWaitMs(at(1, 10), w)).toBe(0);
    expect(windowWaitMs(at(1, 28, 59), w)).toBe(0);
    expect(windowWaitMs(at(1, 29), w)).toBe(at(2, 0) - at(1, 29));
    expect(windowWaitMs(at(1, 45, 30), w)).toBe(at(2, 0) - at(1, 45, 30));
    expect(windowWaitMs(at(23, 50), w)).toBe(new Date(2026, 9, 23, 0, 0).getTime() - at(23, 50));
    expect(windowWaitMs(at(1, 10), [30, 58])).toBe(at(1, 30) - at(1, 10));
    expect(windowWaitMs(at(1, 10), undefined)).toBe(0);
  });
});
