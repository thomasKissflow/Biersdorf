// S-CASE (tests-2026-10-21/SPEC.md §4): one case through its whole life, the app's screens' code on one side and the
// supplier portal's on the other, Thomas standing in for every role and for the supplier's self contact. Each spec step
// is one recorded step (live/lib/results.ts) with its read-back: the Kissflow fields as the app maps them (load.ts +
// toAppState, compared with the domain object the writer was given, as map/roundtrip.test.ts does) and the raw fields
// that matter. Steps:
//    0 the 12 integrations are ON (read-only)        6a/6b RMES Safety / Regulatory: ensureRmes, then saveRmes
//    1 supplier master (the app's addSupplier)       7  review completion: expected blocked (050201), the gate by admin PUT
//    2 a Start draft (the app's own Start gate)      8  release.requested, as E-B leaves it (played, see below)
//    3 a started case, I-1 makes its request         9  the supplier's final release, I-7 completes the case
//   4a the supplier saves answers (request.changed) 10  a second case, started then cancelled (case.cancelled)
//   4b the supplier confirms completeness (I-2)     11  cleanup (R2, R3 and offline): withdraw, delete, GET 404
//   4c I-2's Approve: blocked (R4: moves the case)  (R1 and R4 keep everything: the showcases)
//    5 the reviews (I-2's E-A, 22 Oct)
// R4 (21 Oct evening: Thomas is back in Integration service, so I-2's Approve moves a case on) leaves its items at
// distinct stages for Thomas (case/data.ts tracksOf): the kept draft (2); C01 completed by I-7 (3–5, 8, 9: no RMES
// steps); C03 kept in review after I-2's Approve, its reviews started, RMES Safety and Regulatory with criteria, a result
// and a finding, its completion blocked (the same steps, names suffixed "(in-review case)"); C02 cancelled (10). C03's
// steps also name in the ledger what each proved on the case, its reviews and its RMES records (TrackPlan.stays), and
// a step of it that did not pass names itself there as NOT verified (settle: also when it threw before its own line or
// was not-run). R4's supplier line names its read-back and Thomas's portal user on its self contact (supplierStage).
// A step whose input failed is "not-run" (its deps); a StopError ends the run (the recorder saves, then rethrows). Each
// step notes its Kissflow calls (offline an estimate, case/calls.ts) and fails when a hand-off it sent was refused
// after its save (w.problems). A step is "blocked" only by its own s.block, where it saw the platform reason (4c: the
// key's user is not in Integration service; 7: Kissflow's 050201 on the review task), never by a 050201 elsewhere.
// Codes carry the run and the suite's attempt ("ZZT-N21-R2-SC1-C01", case/data.ts), every load reads the run's items
// only and this suite's supplier row only (the self contact belongs to one supplier per load). The data varies by run
// (case/data.ts), and so do the review departments each run expects. Ledger stages are the step and status as read
// back, with what the step proved only when its checks passed (the morning list prints them).
// Where the app's or the portal's code can't be used as it is, the step says so in its evidence ("approximated"):
// - the suite renames the domain's new supplier `s<n>` to the run's code, and links the self contact's portal user
//   (Contacts_Portal_User_Id: the app's contact writer does not write it);
// - the draft: the domain never leaves a Mandatory Start field blank, so the material number is blanked in its result;
// - ensureRmes needs the department's review task, which nobody can hold (the reviewer roles have no members): the
//   suite gives it the live activity instance;
// - the final-release request is E-B's (22 Oct), an integration on a review's completion, which nobody can complete
//   (the same empty roles): the suite plays it (playRelease), with the release.requested hand-off whose integration
//   writes the request's release fields, and E-B's history row;
// - the final release: the portal writer when the request is at its release step, else (nothing moves it there yet)
//   the portal writer's own gates (B-33, B-11) on the request, admin PUT of the two fields it writes, then I-7's webhook.
// I-1's requests the suite's poll did not see linked are looked for (My items) and adopted, so the cleanup deletes them.
// Run: env -u LIVE npx vitest run --config vitest.live.config.ts live/case.live.ts   (offline; RUN=R1…R4 rehearses)
//      LIVE=1 RUN=R2 npx vitest run --config vitest.live.config.ts live/case.live.ts
//      (KF_GAP_MS=8000 slows the pace; each step's timeout grows with it)
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as A from "@/domain/actions";
import { departmentsForScope, releaseBlockers } from "@/domain/selectors";
import * as M from "@/domain/suppliers";
import type { AppState, CiqCase, InternalPersonaId, ReviewDept } from "@/domain/types";
import { FLOWS, LIST, OTHER_ROLES, ROLES, STEPS, STEP_NAMES, TABLES } from "@/app-live/ids";
import { runLoadEffects } from "@/app-live/load";
import { caseStepOf } from "@/app-live/map/caseMap";
import { parseSnapshot } from "@/app-live/map/auditMap";
import { selfContactId } from "@/app-live/map/people";
import { SYNCED_REQUEST_FIELDS } from "@/app-live/shared/handoff";
import type { FlowKey, ProcessKey, WriteCtx, WriteResult } from "@/app-live/types";
import { ensureRmes } from "@/app-live/write/activation";
import { recordAudit, work } from "@/app-live/write/audit";
import { handoff } from "@/app-live/write/handoff";
import { contactRow, countsOf, countryCode, rmesFlowOf, supplierFields } from "@/app-live/write/encode";
import { missingOf, rowsMissing } from "@/app-live/write/verify";
import { missingKeys, readDoc } from "@/portal/data/answers";
import { bundleHashMatches } from "@/portal/data/bundle";
import { caseContactsOf, caseOfRequest, requestStepOf } from "@/portal/data/map";
import { childRows, num, str, userIds, type RawItem } from "@/portal/data/raw";
import { FLOWS as PORTAL_FLOWS, STEPS as PORTAL_STEPS } from "@/portal/kf/portal";
import { errorText, kfDateTime } from "@/portal/kf/sdk";
import { meter, type Meter } from "./case/calls";
import { caseIn, caseKeys, contactKeys, critKeys, filled, findingKeys, instant, pseudoIds, requestVsCase, supplierKeys } from "./case/compare";
import { caseInput, caseStepsHeld, codesOf, dataOf, keepsItems, renameSupplier, supplierInput, tracksOf, type Codes, type LifeStep, type TrackPlan } from "./case/data";
import { blockersAfter, fillPatch } from "./case/fill";
import { checkIntegrations, type Polled } from "./lib/hooks";
import { GuardError, KfError } from "./lib/liveClient";
import { GAP_MS, StopError } from "./lib/queue";
import type { Recorder, StepCtx, StepResult } from "./lib/results";
import { RUN as RUN_NAME, boot, bootPortal, createWorld, perform, type Booted, type World } from "./lib/world";

const SUITE = "S-CASE";
/** Every load reads this run's items and rows only (live: a full load reads every item Thomas ever created). */
const RUN = { scope: "run" } as const;
const CONTACTS = TABLES.contacts;
const CASE_FLOW = FLOWS.case.id;
const REQUEST_FLOW = PORTAL_FLOWS.request.id;
const WAITING = STEP_NAMES[STEPS.case.waiting]!;
const RMES_STEP = { SAF: "6a RMES Safety", REG: "6b RMES Regulatory" } as const;
/** Each step's timeout: the config's 20 minutes at the 2.5 s pace (one call ≈ the gap + 1.5 s), longer in proportion at
 *  a slower one (KF_GAP_MS=8000: ≈48 minutes; R4's biggest step makes ≈90 calls). */
const STEP_TIMEOUT_MS = Math.round((20 * 60_000 * (GAP_MS + 1500)) / 4000);

/** What the steps hand on to each other (each lifecycle case's own: its Track). */
interface Shared {
  /** The RMM's load after the supplier master: the state the two case creates start from (steps 2, 3). */
  pre?: Booted;
  supplier?: { code: string; itemId: string; selfId: string; placeholderId: string };
  /** The RMM's load after the final release (9): where the later cases start from (R4's case kept in review, 10). */
  released?: Booted;
}

/** One lifecycle case (case/data.ts tracksOf) and what its steps hand on to each other. */
interface Track extends TrackPlan {
  kase?: { code: string; itemId: string; requestId?: string; next: AppState };
  /** The portal page after the save (4a): the completeness is confirmed on it (4b), as the supplier would. */
  portal?: Awaited<ReturnType<typeof bootPortal>>;
  reviews: Partial<Record<ReviewDept, string>>;
  depts: ReviewDept[];
  /** Safety's and Regulatory's view of the case after their RMES step: the counts their completion would send (7). */
  rmesView: Partial<Record<"SAF" | "REG", CiqCase>>;
  /** A track that stays (R4's case kept in review): what its steps proved on the case so far, in order. */
  proved: string[];
  /** A track that stays: the case as last read (settle names a step's failure without a new call), and the entry of
   *  `proved` the last caseStage wrote, by step. */
  last?: RawItem;
  wrote?: { step: string; at: number };
}
/** A lifecycle step's name on a track ("5 reviews (E-A) (in-review case)"; the main case's as it was). */
const nm = (t: TrackPlan, base: string) => `${base}${t.suffix}`;

// ---------------------------------------------------------------------------------- small helpers

/** The writer's result, or an error with the refusal or the writer's own message (the step then fails with it). */
function written(r: { refused?: string; result?: WriteResult }, what: string): WriteResult {
  if (r.refused) throw new Error(`${what} was refused before any write: ${r.refused}`);
  if (!r.result?.ok) throw new Error(`${what}: ${r.result?.message ?? "no result"}`);
  return r.result;
}
const pick = (it: RawItem | undefined, keys: readonly string[]) => Object.fromEntries(keys.map((k) => [k, it?.[k] ?? null]));
/** The live activity instance of an item's (first) current step. */
const actOf = (it: RawItem | undefined) => str(Array.isArray(it?._current_context) ? (it!._current_context[0] as Record<string, unknown>) : undefined, "_context_activity_instance_id");
/**
 * Kissflow (or the fake) says the item is gone. Before a delete only its 404 "could not be located" (01015) counts: an
 * admin GET also answers 404 with 050201 for an item that moved on and still exists (the request logs of 20 Oct).
 * After a delete or discard that succeeded, any 404 (as lib/world.ts cleanupRun).
 */
const isGone = (e: unknown, afterDelete = false) =>
  e instanceof KfError ? e.status === 404 && (afterDelete || /01015|could not be located/i.test(e.message)) : !(e instanceof StopError) && !(e instanceof GuardError) && /01015/.test(errorText(e));
const sameText = (a: unknown, b: unknown) => String(a ?? "") === String(b ?? "");
/** A ledger stage as read back: the item's step and status, then what the step proved (only when its checks passed). */
const stageOf = (it: RawItem | undefined, proved?: string | false) => {
  const at = [str(it, "_current_step"), str(it, "_status")].filter(Boolean).join(", ") || "not read back";
  return proved ? `${at}: ${proved}` : at;
};
/**
 * A lifecycle case's ledger stage: stageOf for the main case. A track that stays (R4's case kept in review) is left at
 * its last step, so its stage names everything its steps proved so far, in order, and a step whose checks had failed
 * when it wrote the line as NOT verified (the morning list prints the latest line).
 */
function caseStage(t: Track, it: RawItem | undefined, step: string, proved: string | false): string {
  if (!t.stays) return stageOf(it, proved);
  seen(t, it);
  t.proved.push(proved || `NOT verified: "${step}" (see the results)`);
  t.wrote = { step, at: t.proved.length - 1 };
  return stageOf(it, `${t.stays}; ${t.proved.join("; ")}`);
}
/** A track that stays: the case as just read (its step and status head the next line settle writes). */
const seen = (t: Track, it: RawItem | undefined) => void (t.stays && it && (t.last = it));
const caseCodeOf = (what: string) => /Case_Code=(\S+)/.exec(what)?.[1] ?? "";
/** The fields of `keys` filled on either side (the rest compare blank to blank: no evidence). */
const filledOf = (keys: readonly string[], a: RawItem | undefined, b: RawItem | undefined) => keys.filter((k) => filled(a?.[k]) || filled(b?.[k]));
/** The ledger id of an item of `flowId` whose `what` names `key` (e.g. "Case_Code=ZZT-N21-R1-C01"). */
function ledgerId(w: World, flowId: string, key: string): string {
  const e = w.ledger.latest().find((x) => x.flow === flowId && x.stage !== "draft" && new RegExp(`=${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\s|$)`).test(x.what));
  if (!e) throw new Error(`No ${flowId} item for ${key} in the ${w.run} ledger.`);
  return e.id;
}
/** An admin GET that should answer "gone" (after a delete or discard). */
async function gone(read: () => Promise<unknown>): Promise<{ gone: boolean; answer: string }> {
  try {
    await read();
    return { gone: false, answer: "the item still reads back" };
  } catch (e) {
    if (e instanceof StopError) throw e;
    return { gone: isGone(e, true), answer: errorText(e) };
  }
}
/** A write context in which this user holds the department's review task at `act` (ensureRmes decides on it). */
function heldReviewCtx(b: Booted, code: string, dept: ReviewDept, act: string): WriteCtx {
  const ctx = b.ctx();
  const reviews = new Map(ctx.index.reviews);
  const ref = reviews.get(`${code}|${dept}`);
  if (ref) reviews.set(`${code}|${dept}`, { ...ref, act, activityId: STEPS.review[dept] });
  return { ...ctx, index: { ...ctx.index, reviews } };
}
/** The release request's idempotency key per case and RMM round (as the app's ensureRelease keyed it before 22 Oct). */
const releaseKey = (caseItemId: string, round: number): string => `REL-${caseItemId}-R${round}`;

/** E-B, played (approximated): the release.requested hand-off (its integration writes the request's release fields and
 *  the case's Release_Requested_At) and E-B's history row (the row the portal session's E-B writes, 22 Oct). */
async function playRelease(b: Booted, c: CiqCase, caseItemId: string) {
  const ctx = b.ctx();
  const w = work();
  const key = releaseKey(caseItemId, 1);
  const release = await handoff(ctx, "release.requested", { caseItemId }, key);
  w.handoffs.push(release);
  const depts = c.reviews.filter((t) => t.dept !== "RMM").length;
  const detail = `${depts ? `RMM and ${depts === 1 ? "1 department review" : `${depts} department reviews`}` : "The RMM review"} completed. One request for the final release sent to the supplier.`;
  await recordAudit(ctx, w, { code: "release.requested", caseId: c.id, object: { kind: "Case", key: c.id, itemId: caseItemId, state: LIST.phase["final-release"] }, entries: [{ id: "", at: ctx.now(), by: "system", action: "All reviews completed", detail }] }, `${c.id}: the final-release request`, [release]);
  return { ok: release.status === "sent" && !w.warnings.length, handoffs: w.handoffs, warnings: w.warnings, key };
}
const factsOf = (b: Booted) => ({ reads: b.snap.reads, audit: b.snap.forms.audit, ...(b.snap.kept ? { kept: b.snap.kept } : {}) });
const auditOf = (b: Booted, caseItemId: string) => b.snap.forms.audit.filter((r) => str(r, "Case_Item_Id") === caseItemId);

/**
 * The loads see this suite's supplier row only. The app maps the self contact to ONE supplier (map/people.ts Directory:
 * the first row that lists the portal user wins), and the other suites of a run make their own supplier with the same
 * self contact; a load that lists theirs first would refuse this suite's case contacts. Other forms are untouched.
 */
function ownSupplierRows(w: World, code: string): void {
  const list = w.client.formList;
  w.client = { ...w.client, formList: async (f) => (f === "supplier" ? (await list(f)).filter((r) => str(r, "Supplier_Code") === code) : list(f)) };
}

/** The app or portal flow behind a ledger flow id (cleanup). */
const APP_FLOW_KEY = new Map<string, FlowKey>(Object.entries(FLOWS).map(([k, f]) => [f.id, k as FlowKey]));
const PROCESSES = new Set<FlowKey>(["case", "review", "op"]);

// ---------------------------------------------------------------------------------- the suite

describe("S-CASE: a case from the supplier master to the final release, and a cancelled one", { timeout: STEP_TIMEOUT_MS }, () => {
  let w: World;
  let rec: Recorder;
  let calls: Meter;
  const done = new Map<string, StepResult>();
  const S: Shared = {};
  /** The run's lifecycle cases (registered now: the steps are tests, collected before beforeAll creates the world). */
  const tracks: Track[] = tracksOf(RUN_NAME).map((p) => ({ ...p, reviews: {}, depts: [], rmesView: {}, proved: [] }));
  /** R4 (a track that stays): the kept items' ledger stages name what the steps proved, the supplier's too. */
  const proofs = tracks.some((t) => !!t.stays);
  let d: ReturnType<typeof dataOf>;
  let C: Codes;
  /** The run's ledger lines before this suite: what comes after is this suite's (the cleanup deletes only that). */
  let start = 0;
  /** When the suite started, less 5 minutes for Kissflow's clock: My items rows changed before it are not I-1's for
   *  this suite's cases. */
  let since = 0;
  /** The supplier row as step 1 left it (supplierStage): its id once saved, whether the self contact's portal user was
   *  written, and that link as read back. */
  let sup1: { itemId: string; linkWritten: boolean; linked?: boolean } | undefined;

  beforeAll(async () => {
    // offline R4: the fake I-2's Approve moves the case (Thomas back in Integration service), while the held roles stay
    // as read at 02:30 (case/data.ts caseStepsHeld: 4c's live poll is not rehearsed); live reads the roles
    w = await createWorld({ caseStepsHeld: caseStepsHeld(RUN_NAME) });
    calls = meter(w);
    rec = w.recorder(SUITE);
    d = dataOf(w.run);
    start = w.ledger.byRun().length;
    since = Date.now() - 5 * 60_000;
    const earlier = new Set(w.ledger.byRun().filter((e) => e.flow === FLOWS.supplier.id && e.stage !== "draft" && e.what.includes(`Supplier_Code=${w.key("SC")}`)).map((e) => e.id));
    C = codesOf({ run: w.run, key: (x) => w.key(x), attempt: earlier.size + 1 });
    ownSupplierRows(w, C.supplier);
  });
  afterAll(() => {
    if (!rec) return;
    rec.save();
    const line = (r: StepResult) => `${r.status.padEnd(8)} ${r.name}${r.evidence.notes.calls !== undefined ? ` [${String(r.evidence.notes.calls)} calls]` : ""}${r.reason ? ` — ${r.reason.slice(0, 160)}` : ""}`;
    const kept = keepsItems(w.run) ? `\nshowcase (kept):\n${mine().map((e) => `  ${e.flow} ${e.id} ${e.what}: ${e.stage}`).join("\n")}` : "";
    console.log(`${SUITE} ${w.run} (${w.live ? "live" : "offline"}): ${rec.file}\n${rec.steps.map(line).join("\n")}\n${calls.estimated ? "estimated live calls" : "calls"}: ${calls.count()}${kept}`);
  });

  /** This suite's ledger items (their latest stage), in the order they appeared; a form's draft id (stage "draft"
   *  only) is no item of its own. */
  const mine = () => {
    const ids = new Set(w.ledger.byRun().slice(start).map((e) => e.id));
    return w.ledger.latest().filter((e) => ids.has(e.id) && e.stage !== "draft");
  };

  /**
   * One recorded step: not-run when a step it needs did not pass; its calls in the evidence. `codes` are the hand-offs
   * it sends ("portal" for the portal writers'): a "sent" hand-off only started its POST, so one Kissflow refused later
   * (w.problems) fails the step with that answer; every problem that came up during the step is in its evidence. A
   * thrown error fails the step (a 050201 too: only the step's own s.block records blocked). After a StopError every
   * step is the recorder's not-run "stopped: …" (no call is made).
   */
  let stopped = false;
  /** The running step's failed checks so far: a ledger stage names only what passed before it was written. */
  let failedChecks = 0;
  const clean = () => failedChecks === 0;
  async function step(name: string, deps: string[], fn: (s: StepCtx) => Promise<void>, codes: string[] = []): Promise<void> {
    const bad = stopped ? [] : deps.filter((x) => done.get(x)?.status !== "pass");
    if (bad.length) {
      done.set(name, rec.notRun(name, `needs ${bad.map((x) => `"${x}" (${done.get(x)?.status ?? "not recorded"})`).join(", ")}`));
      return;
    }
    const before = calls.count();
    const p0 = w.problems.length;
    try {
      const r = await rec.step(name, async (raw) => {
        failedChecks = 0;
        const s: StepCtx = { ...raw, check: (label, ok, detail) => (ok || failedChecks++, raw.check(label, ok, detail)) };
        try {
          await fn(s);
        } finally {
          s.note("calls", calls.count() - before);
          if (w.problems.length > p0) s.note("hand-off problems", w.problems.slice(p0));
        }
        const own = w.problems.slice(p0).filter((x) => codes.includes(x.code));
        if (codes.length) s.check(`no hand-off of the step failed after its save (${codes.join(", ")})`, !own.length, own);
      });
      done.set(name, r);
    } catch (e) {
      // the recorder saved the step as not-run and rethrew: the run stops here (this test fails with it)
      if (e instanceof StopError) stopped = true;
      const last = rec.steps.at(-1);
      if (last?.name === name) done.set(name, last);
      throw e;
    }
  }

  /**
   * After a step of a track that stays (R4's case kept in review), passed or not: one that did not pass names itself in
   * the case's stage as NOT verified (the morning list prints the latest line), whether it threw or returned before its
   * own line, was not-run, or failed after a line that claimed a proof (that entry is replaced). A blocked step wrote
   * its own line (4c, 7). The case's step and status as last read: no call (a ledger line only, after a stop too).
   */
  function settle(t: Track, name: string): void {
    if (!t.stays || !t.kase) return;
    const status = done.get(name)?.status ?? "not recorded";
    const own = t.wrote?.step === name ? t.wrote.at : -1;
    if (status === "pass" || (status === "blocked" && own >= 0)) return;
    const not = `NOT verified: "${name}" (${status}, see the results)`;
    if (own < 0) t.proved.push(not);
    else if (t.proved[own]!.startsWith("NOT verified")) return;
    else t.proved[own] = not;
    w.adopt(CASE_FLOW, t.kase.itemId, `Case_Code=${t.kase.code}`, stageOf(t.last, `${t.stays}; ${t.proved.join("; ")}`));
  }

  /** R4: the supplier row's stage after step 1 (passed or not), from its read-back: what the step proved, and Thomas's
   *  portal user on its self contact, which the morning list must name (his dev load takes the self contact from the
   *  first supplier row that carries it; S-FORMS unlinks its own supplier, this one keeps it for the case's contacts). */
  function supplierStage(): void {
    if (!proofs || !sup1) return;
    const line = w.ledger.latest().find((e) => e.flow === FLOWS.supplier.id && e.id === sup1!.itemId);
    if (!line) return;
    const ok = done.get("1 supplier master")?.status === "pass";
    const link =
      sup1.linked === true
        ? "its self contact carries Thomas's portal user (Contacts_Portal_User_Id): clear it before his next dev load"
        : sup1.linked === false
          ? "its self contact does not carry Thomas's portal user (the link did not read back)"
          : sup1.linkWritten
            ? "its self contact MAY carry Thomas's portal user (written, not read back): check Contacts_Portal_User_Id"
            : "no portal user written";
    w.adopt(line.flow, sup1.itemId, line.what, `form row, ${ok ? "header and both contact rows as written (form GET), mapped back by the RMM's load" : `NOT verified: "1 supplier master" (see the results)`}; ${link}`);
  }

  /**
   * I-1's CIQP Requests for `cases` (case item id → code) that the ledger lacks: linked only after the suite's poll gave
   * up (`linked`: ids read off the cases) or never linked (`search`: My items, whose rows are sparse live, without
   * App_Case_Item_Id, so only the rows changed since the suite started are read in full; offline the rows are whole).
   * Each is adopted only when it reads back naming one of these cases and its code, never anyone else's item; an
   * unreadable one is left out. Returns the adopted ids.
   */
  async function adoptLate(cases: Map<string, string>, linked: string[], search: boolean): Promise<string[]> {
    const rows: RawItem[] = linked.map((id) => ({ _id: id }));
    if (search) for (const r of await w.portal.listMine("request")) if (str(r, "App_Case_Item_Id") || !(Date.parse(str(r, "_modified_at")) < since)) rows.push(r);
    const found: string[] = [];
    for (const row of rows) {
      if (w.ledger.has(row._id) || found.includes(row._id)) continue;
      let it = row;
      if (!str(it, "App_Case_Item_Id")) {
        try {
          it = await w.portal.adminGet("request", row._id);
        } catch (e) {
          if (e instanceof StopError) throw e;
          continue;
        }
      }
      const code = cases.get(str(it, "App_Case_Item_Id"));
      if (!code || str(it, "Case_Code") !== code) continue;
      w.adopt(REQUEST_FLOW, it._id, `Request_Key=${code}|1`, stageOf(it, "made by I-1, not seen linked by the suite's poll"));
      found.push(it._id);
    }
    return found;
  }

  /** I-1 linked no request within the poll: one it made all the same enters the ledger now (the cleanup deletes it, the
   *  morning list names it), then the step fails. */
  async function noLink(s: StepCtx, itemId: string, code: string, polled: Polled<RawItem>): Promise<never> {
    const found = await adoptLate(new Map([[itemId, code]]), [], true);
    s.note("I-1's requests found unlinked (adopted)", found);
    throw new Error(`I-1 did not link a CIQP Request to ${code} within ${polled.ms / 1000} s${polled.error ? ` (${polled.error})` : ""}${found.length ? `; it made ${found.join(", ")}, now in the ledger` : ""}.`);
  }

  it("0 the integrations are ON (read-only)", async () => {
    await step("0 integrations ON", [], async (s) => {
      const r = await checkIntegrations(w.client);
      s.readBack("integration lists (both apps)", r.states.map((x) => `${x.code}: ${x.status ?? "not listed"} ${x.isActive ? "ON" : "OFF"}`));
      s.check("all 12 integrations Live and ON", r.ok, r.problems);
      s.check("every built hand-off has its webhook URL (by code)", !w.hooks.missing().length, w.hooks.missing());
    });
  });

  it("1 supplier master: the app's addSupplier, Thomas as self contact and a placeholder", async () => {
    await step("1 supplier master", [], async (s) => {
      const adm = await boot(w, "admin", RUN);
      const code = C.supplier;
      const selfEmail = C.selfEmail;
      const input = supplierInput(d, C, { tagText: (x) => w.text(x), selfName: w.who.name });
      let domainId = "";
      const r = await perform(w, adm, "addSupplier", [input], (st, by) => {
        const x = M.addSupplier(st, by, input);
        domainId = x.id ?? "";
        return renameSupplier(st, x.state, domainId, code);
      });
      const res = written(r, "addSupplier");
      s.note("approximated", `the domain named the supplier "${domainId}"; the suite renamed it to "${code}" before the app's writer encoded it (the run tag on every supplier code, SPEC §1)`);
      const sup = r.next.suppliers.find((x) => x.id === code)!;
      const [self, placeholder] = sup.contactIds.map((id) => r.next.users.find((u) => u.id === id)!);
      const itemId = res.saved?.find((x) => x.flow === "supplier")?.item._id ?? ledgerId(w, FLOWS.supplier.id, code);
      s.note("CIQ Supplier", itemId);
      sup1 = { itemId, linkWritten: false };

      // the self contact's portal user: the app's contact writer has no field for it (encode.ts contactRow)
      const first = await w.client.formGet("supplier", itemId);
      const selfRow = childRows(first, CONTACTS, "Contacts_Key").find((x) => str(x, "Contacts_Key") === self!.id);
      if (!selfRow) throw new Error(`The self contact's row (${self!.id}) is not on the supplier row.`);
      sup1.linkWritten = true;
      await w.client.formUpdate("supplier", itemId, { [`Table::${CONTACTS}`]: [{ _id: str(selfRow, "_id"), Contacts_Portal_User_Id: w.who.id }] });
      s.note("not the app's writer", "Contacts_Portal_User_Id of the self contact written by a form update (by the row's _id): no app writer writes it");

      const got = await w.client.formGet("supplier", itemId);
      const rows = childRows(got, CONTACTS, "Contacts_Key");
      s.readBack("CIQ Supplier (form GET)", { ...pick(got, Object.keys(supplierFields(sup))), contacts: rows.map((x) => pick(x as RawItem, ["Contacts_Key", "Contacts_Full_Name", "Contacts_Email", "Contacts_Title", "Contacts_Can_Confirm", "Contacts_Active", "Contacts_Portal_User_Id"])) });
      s.check("every header field as written (supplierFields)", !missingOf(supplierFields(sup), got).length, missingOf(supplierFields(sup), got));
      s.check("two contact rows, no duplicate", rows.length === 2 && new Set(rows.map((x) => str(x, "Contacts_Key"))).size === 2, rows.length);
      for (const u of [self!, placeholder!]) s.check(`contact row ${u.id} as written (contactRow)`, !rowsMissing(got, CONTACTS, "Contacts_Key", [contactRow(u)]).length, rowsMissing(got, CONTACTS, "Contacts_Key", [contactRow(u)]));
      const byKey = (k: string) => rows.find((x) => str(x, "Contacts_Key") === k);
      sup1.linked = str(byKey(self!.id), "Contacts_Portal_User_Id") === w.who.id;
      s.check("the self contact's portal user is the key's user", str(byKey(self!.id), "Contacts_Portal_User_Id") === w.who.id, str(byKey(self!.id), "Contacts_Portal_User_Id"));
      s.check("the placeholder has no portal user", !str(byKey(placeholder!.id), "Contacts_Portal_User_Id"));

      const listRow = (await w.client.oneRead(() => w.client.formList("supplier"), RUN)).find((x) => x._id === itemId);
      s.readBack("CIQ Supplier (list row keys)", listRow ? Object.keys(listRow) : null);
      s.check("the list row is there and has no child table", !!listRow && !Object.keys(listRow).some((k) => k === CONTACTS || k.startsWith("Table::")) && !childRows(listRow, CONTACTS, "Contacts_Email").length);
      s.check("its audit row: supplier.changed", str(res.auditRow, "Action_Code") === "supplier.changed" && str(res.auditRow, "Object_Item_Id") === itemId, pick(res.auditRow, ["Action_Code", "Object_Item_Id"]));

      // as the RMM who starts the case sees it (load.ts + toAppState)
      const rmm = await boot(w, "rmm", RUN);
      const want = { ...supplierKeys(r.next, code)!, country: countryCode(input.country) };
      s.readBack("mapped supplier (RMM)", supplierKeys(rmm.state, code));
      s.check("the supplier reads back as written (country as its live code)", JSON.stringify(supplierKeys(rmm.state, code)) === JSON.stringify(want), { got: supplierKeys(rmm.state, code), want });
      for (const u of [self!, placeholder!]) s.check(`contact ${u.email} reads back as written`, JSON.stringify(contactKeys(rmm.state, u.email)) === JSON.stringify(contactKeys(r.next, u.email)), { got: contactKeys(rmm.state, u.email), want: contactKeys(r.next, u.email) });
      const selfId = rmm.state.users.find((u) => u.email === selfEmail)?.id ?? "";
      s.check("the self contact maps to self:<the key's user>", selfId === selfContactId(w.who.id), selfId);
      const placeholderId = rmm.state.users.find((u) => u.email === placeholder!.email)?.id ?? "";
      s.check("the placeholder keeps the domain's id", placeholderId === placeholder!.id, placeholderId);
      S.supplier = { code, itemId, selfId, placeholderId };
      S.pre = rmm;
    }).finally(supplierStage);
  });

  /** The case input for the run supplier, with both its contacts. */
  const caseOf = (materialNo: string) => caseInput(d, { tagText: (x) => w.text(x), materialNo, supplierId: S.supplier!.code, contactIds: [S.supplier!.selfId, S.supplier!.placeholderId] });

  it("2 draft: the app's Start gate leaves a draft; it is discarded (R1 and R4 keep one)", async () => {
    await step("2 draft", ["1 supplier master"], async (s) => {
      const pre = S.pre!;
      const input = caseOf(C.materialNo(1));
      const codes = C.drafts;
      s.note("approximated", "the domain never leaves a Mandatory Start field blank; the suite blanks the material number in its result, so BDF_Material_No is missing for the app's own gate (assertMandatory)");
      for (const code of codes) {
        const r = await perform(w, pre, "createCase", [input], (st, by) => {
          const next = A.createCase(st, by, input, undefined, code).state;
          return { ...next, cases: next.cases.map((c) => (c.id === code ? { ...c, materialNo: "" } : c)) };
        });
        if (r.refused) throw new Error(`createCase ${code} was refused: ${r.refused}`);
        s.check(`${code}: the writer stopped at the gate and left a draft`, r.result?.ok === false && /draft/i.test(r.result.message ?? "") && /BDF_Material_No/.test(r.result.message ?? ""), r.result?.message);
      }
      const b = await boot(w, "rmm", RUN);
      const seen = new Map<string, { it: RawItem | undefined; ok: boolean }>();
      for (const code of codes) {
        const id = ledgerId(w, CASE_FLOW, code);
        const it = b.snap.items.case.find((x) => x._id === id);
        s.readBack(`${code} (the draft as loaded)`, { ...pick(it, ["_status", "_current_step", "Case_Code", "Trade_Name", "Supplier_Code", "Main_INCI", "BDF_Material_No", "Owner_RMM", "Portal_Contact_Ids", "Release_Key"]), draft: b.drafts.find((x) => x.itemId === id) ?? null });
        const ok = [
          s.check(`${code}: a Start draft (Diagnostics lists it)`, str(it, "_status") === "Draft" && caseStepOf(it) === "start" && b.drafts.some((x) => x.itemId === id && x.label.includes(code))),
          s.check(`${code}: its fields are there, BDF_Material_No is not`, str(it, "Case_Code") === code && str(it, "Trade_Name") === input.materialName && str(it, "Supplier_Code") === S.supplier!.code && !!str(it, "Portal_Contact_Ids") && !str(it, "BDF_Material_No")),
          s.check(`${code}: not part of any case, but blocks a twin (ownDraftKeys)`, !caseIn(b.state, code) && !!b.mapped.index.ownDraftKeys?.has(`case|${code}`)),
        ].every(Boolean);
        seen.set(code, { it, ok });
      }
      // Diagnostics' Discard (LiveAppStore discardDraft: client.discard; live, the admin DELETE: no REST discard route)
      const discard = codes[0]!;
      const id = ledgerId(w, CASE_FLOW, discard);
      await w.client.discard("case", id);
      const after = await gone(() => w.client.adminGet("case", id));
      s.readBack(`${discard} after the discard (admin GET)`, after.answer);
      s.check(`${discard}: discarded, the GET answers not found`, after.gone, after.answer);
      w.adopt(CASE_FLOW, id, `Case_Code=${discard}`, after.gone ? "discarded" : `Draft, still there after the discard (${after.answer})`);
      const kept = codes[1] && seen.get(codes[1]);
      if (kept) w.adopt(CASE_FLOW, ledgerId(w, CASE_FLOW, codes[1]!), `Case_Code=${codes[1]}`, stageOf(kept.it, kept.ok && "Create case unsent, BDF_Material_No missing"));
    });
  });

  /** The lifecycle steps 3–9 of one case (case/data.ts tracksOf): the run's main case, and R4's case kept in review. Each
   *  step's name carries the track's suffix; a step the track does not take is not registered. */
  function lifecycle(t: Track): void {
    const has = (x: LifeStep) => t.steps.includes(x);
    const n = (base: string) => nm(t, base);
    /** step(), then settle: a case kept in review names a step of it that did not pass. */
    const tstep = (name: string, deps: string[], fn: (s: StepCtx) => Promise<void>, codes?: string[]) => step(name, deps, fn, codes).finally(() => settle(t, name));
    if (has("3")) it(`3 started: createCase, I-1 makes the request${t.suffix}`, async () => {
      await tstep(n("3 started (I-1)"), ["1 supplier master"], async (s) => {
        const code = C[t.code];
        const input = caseOf(C.materialNo(t.materialNo));
        // the main case starts from the RMM's load after the supplier master; a later one (R4's case kept in review) from
        // the load after the final release when there is one (it knows the cases made since)
        const pre = t.code === "main" ? S.pre! : (S.released ?? S.pre!);
        const r = await perform(w, pre, "createCase", [input], (st, by) => A.createCase(st, by, input, undefined, code).state);
        const res = written(r, "createCase");
        const itemId = str(res.auditRow, "Case_Item_Id") || ledgerId(w, CASE_FLOW, code);
        t.kase = { code, itemId, next: r.next };
        s.check("case.started was handed over", res.handoffs.some((h) => h.code === "case.started" && h.status === "sent"), res.handoffs);

        const polled = await w.hooks.poll(() => w.client.adminGet("case", itemId), (it) => !!str(it, "Portal_Request_Item_Id"));
        s.note("I-1 poll", { ok: polled.ok, polls: polled.polls, ms: polled.ms, ...(polled.error ? { error: polled.error } : {}) });
        seen(t, polled.value);
        if (polled.value) w.adopt(CASE_FLOW, itemId, `Case_Code=${code}`, stageOf(polled.value));
        if (!polled.ok) await noLink(s, itemId, code, polled);
        const kase = polled.value!;
        const rid = str(kase, "Portal_Request_Item_Id");
        w.adopt(REQUEST_FLOW, rid, `Request_Key=${code}|1`, "linked to its case by I-1");
        t.kase.requestId = rid;
        const req = await w.portal.adminGet("request", rid);
        w.adopt(REQUEST_FLOW, rid, `Request_Key=${code}|1`, stageOf(req));
        s.readBack("CIQ Case (admin GET)", pick(kase, ["_status", "_current_step", "Case_Code", "Case_Phase", "Portal_Request_Item_Id", "Portal_Contact_Ids", "Confirm_Contact_Ids", "Portal_Assignees_JSON", "Release_Assignees_JSON", "Case_Contacts_JSON", "Owner_RMM"]));
        s.readBack("CIQP Request (admin GET)", pick(req, ["_status", "_current_step", "Request_Key", "App_Case_Item_Id", "Case_Code", "Case_Phase_Label", "Request_Locked", "Assigned_Contacts", "Release_Contacts", "Config_Bundle_Hash"]));
        s.check(`the case is at "${WAITING}"`, caseStepOf(kase) === "waiting" && str(kase, "_status") === "InProgress", [str(kase, "_current_step"), str(kase, "_status")]);
        for (const c of requestVsCase(kase, req)) s.check(c.label, c.ok, c.detail);
        s.check("the bundle matches its hash (the portal's own check)", (await bundleHashMatches(req)) === true);
        const contacts = caseContactsOf(req);
        s.check("the request's contacts: the self contact by its portal user, the placeholder without one", contacts.length === 2 && contacts.some((k) => k.id === w.who.id && k.mayConfirm !== false) && contacts.some((k) => !k.id && k.mayConfirm === false), contacts);
        s.check("the request is assigned to the self contact only", JSON.stringify(userIds(req, "Assigned_Contacts")) === JSON.stringify([w.who.id]), userIds(req, "Assigned_Contacts"));
        // the placeholder may not confirm and has no portal user: the self contact is the one release contact
        s.check("its release contact is the self contact only", JSON.stringify(userIds(req, "Release_Contacts")) === JSON.stringify([w.who.id]), userIds(req, "Release_Contacts"));
        s.check("no pseudo id in the case's or the request's user fields", !pseudoIds(kase).length && !pseudoIds(req).length, [...pseudoIds(kase), ...pseudoIds(req)]);

        const b = await boot(w, "rmm", RUN);
        const rows = auditOf(b, itemId);
        const created = rows.find((x) => str(x, "Action_Code") === "case.created");
        const snap = parseSnapshot(created);
        s.readBack("case.created (audit row)", { ...pick(created, ["Action_Code", "Object_State", "Ref_Flow_Id", "Ref_Item_Id", "Ref_Activity_Instance_Id", "Notify_Channel"]), handoffs: snap?.handoffs ?? null });
        s.check("case.created row with its snapshot, naming the case and its Start step", !!snap && str(created, "Ref_Item_Id") === itemId && !!str(created, "Ref_Activity_Instance_Id") && snap.case?.caseId === code);
        s.check("its hand-offs: case.started sent", !!snap?.handoffs.some((h) => h.code === "case.started" && h.status === "sent"), snap?.handoffs);
        s.check("no pseudo id in the audit row", !pseudoIds(created).length, pseudoIds(created));
        const got = caseIn(b.state, code);
        s.readBack("mapped case (RMM)", got ? { ...caseKeys(got), phase: got.phase } : null);
        s.check("the case reads back as the domain wrote it (caseKeys)", !!got && JSON.stringify(caseKeys(got)) === JSON.stringify(caseKeys(caseIn(r.next, code)!)), got && { got: caseKeys(got), want: caseKeys(caseIn(r.next, code)!) });
        s.check("phase supplier-input; the index knows the item and its request", got?.phase === "supplier-input" && b.mapped.index.cases.get(code)?.itemId === itemId && b.mapped.index.cases.get(code)?.portalRequestItemId === rid);
      }, ["case.started"]);
    });

    if (has("4a")) it(`4a the supplier saves answers through the portal's writer (request.changed)${t.suffix}`, async () => {
      await tstep(n("4a answers saved (request.changed)"), [n("3 started (I-1)")], async (s) => {
        const { code, itemId, requestId: rid } = t.kase!;
        const p = await bootPortal(w, RUN);
        const bnd = p.data.bundles.find((x) => x.code === code);
        s.check(`the request is the self contact's task at "${PORTAL_STEPS.fill.name}"`, !!bnd?.request && bnd.step === "fill" && bnd.request._id === rid, bnd?.step);
        if (!bnd?.request) throw new Error(`The portal does not show ${code} to the self contact.`);
        const fill = fillPatch(bnd, bnd.request, w.who, d.config, (x) => w.text(x));
        s.note("fill-in", fill.summary);
        s.check("everything missing can be answered (no requested document: the suite uploads no files)", !fill.unfillable.length, fill.unfillable.map((x) => x.label));
        const saved = await p.actions.patchRequest(code, fill.patch);
        w.assertRunning();
        s.readBack("CIQP Request after the save (the writer's read-back)", pick(saved, ["Answers_Rev", "Answers_Changed_At", "Answers_Changed_By_Email", "Scope_JSON"]));
        s.check("every answer of the patch is on the request", !missingKeys(readDoc(saved), fill.patch).length, missingKeys(readDoc(saved), fill.patch));
        s.check("the portal shows nothing missing any more", !blockersAfter(bnd, saved, {}, w.who).length, blockersAfter(bnd, saved, {}, w.who).map((x) => x.label));

        const rev = num(saved, "Answers_Rev");
        const polled = await w.hooks.poll(() => w.client.adminGet("case", itemId), (it) => num(it, "Answers_Rev") === rev);
        s.note("request.changed poll", { ok: polled.ok, polls: polled.polls, ms: polled.ms });
        seen(t, polled.value);
        if (!polled.ok) throw new Error(`request.changed did not bring Answers_Rev ${rev} to the case within ${polled.ms / 1000} s.`);
        const req = await w.portal.adminGet("request", rid!);
        const kase = polled.value!;
        const off = SYNCED_REQUEST_FIELDS.filter((k) => !sameText(req[k], kase[k]));
        const held = filledOf(SYNCED_REQUEST_FIELDS, req, kase);
        s.readBack("CIQ Case: the 15 supplier-data fields", pick(kase, SYNCED_REQUEST_FIELDS));
        s.check(`the case holds the request's ${SYNCED_REQUEST_FIELDS.length} supplier-data fields (${held.length} hold something; blank on both: ${SYNCED_REQUEST_FIELDS.filter((k) => !held.includes(k)).join(", ") || "none"})`, !off.length, Object.fromEntries(off.map((k) => [k, { request: req[k], case: kase[k] }])));
        // two blanks compare equal: what the save itself left filled (its own read-back) must be filled on the case
        const lost = SYNCED_REQUEST_FIELDS.filter((k) => filled(saved[k]) && !filled(kase[k]));
        s.check("every field the save left filled on the request is filled on the case", !lost.length, lost);
        t.portal = p;
      }, ["portal"]);
    });

    if (has("4b")) it(`4b the supplier confirms completeness (I-2's fields)${t.suffix}`, async () => {
      await tstep(n("4b completeness confirmed (I-2 fields)"), [n("4a answers saved (request.changed)")], async (s) => {
        const { code, itemId, requestId: rid } = t.kase!;
        // the page as it was after the save: the task is still at "fill in the CIQ"; the writer reads the request again
        await t.portal!.actions.confirmCompleteness(code);
        w.assertRunning();
        const polled = await w.hooks.poll(() => w.client.adminGet("case", itemId), (it) => str(it, "Completeness_Confirm") === LIST.confirm);
        s.note("I-2 poll", { ok: polled.ok, polls: polled.polls, ms: polled.ms });
        seen(t, polled.value);
        const req = await w.portal.adminGet("request", rid!);
        s.readBack("CIQP Request", pick(req, ["_current_step", "Completeness_Confirm", "Completeness_By_Name", "Completeness_By_Email", "Completeness_By_Role", "Completeness_At"]));
        const moved = s.check(`the request moved to "${PORTAL_STEPS.keep.name}"`, requestStepOf(req) === "keep", str(req, "_current_step"));
        const named = s.check("its completeness names the self contact", str(req, "Completeness_Confirm") === LIST.confirm && str(req, "Completeness_By_Name") === w.who.name && str(req, "Completeness_By_Email") === w.who.email && !!str(req, "Completeness_At"));
        w.adopt(REQUEST_FLOW, rid!, `Request_Key=${code}|1`, stageOf(req, moved && named && "completeness confirmed"));
        if (!polled.ok) throw new Error(`I-2 did not record the completeness on the case within ${polled.ms / 1000} s.`);
        const kase = polled.value!;
        const fields = ["Completeness_Confirm", "Completeness_By_Name", "Completeness_By_Email", "Completeness_By_Role", "Completeness_At", ...SYNCED_REQUEST_FIELDS];
        const off = fields.filter((k) => !sameText(req[k], kase[k]));
        s.readBack("CIQ Case (admin GET)", pick(kase, ["_current_step", "Case_Phase", "Completeness_Confirm", "Completeness_By_Name", "Completeness_At", "Answers_Rev"]));
        const copied = s.check(`I-2 copied Completeness_* and the 15 fields (${filledOf(fields, req, kase).length} of ${fields.length} hold something)`, !off.length, Object.fromEntries(off.map((k) => [k, { request: req[k], case: kase[k] }])));
        const review = s.check("Case_Phase is Review", str(kase, "Case_Phase") === LIST.phase.review, str(kase, "Case_Phase"));
        w.adopt(CASE_FLOW, itemId, `Case_Code=${code}`, caseStage(t, kase, n("4b completeness confirmed (I-2 fields)"), copied && review && "completeness and the 15 fields recorded by I-2"));
      }, ["portal"]);
    });

    // the run's expectation (the step decides by the roles read at boot): R4 is 21 Oct evening, Thomas back in the role
    const moves = caseStepsHeld(RUN_NAME) ? "expected to move it: Thomas is back in Integration service" : "expected blocked: Integration service has no members";
    if (has("4c")) it(`4c I-2's Approve moves the case on (${moves})${t.suffix}`, async () => {
      await tstep(n("4c I-2 Approve"), [n("4b completeness confirmed (I-2 fields)")], async (s) => {
        // I-2 acts as the key's user: its Approve can act only when that user is in Integration service (the app roles
        // read live at boot: no extra call). Then wait for the move; else one read shows where the case is
        const roles = w.heldRoles.app.map((r) => r.name);
        const held = w.heldRoles.app.some((r) => r.id === OTHER_ROLES.integration.id);
        const read = () => w.client.adminGet("case", t.kase!.itemId);
        const it = held ? (await w.hooks.poll(read, (x) => caseStepOf(x) !== "waiting")).value : await read();
        seen(t, it);
        s.readBack("CIQ Case step", pick(it, ["_status", "_current_step"]));
        s.note("app roles of the key's user (read at boot)", roles);
        if (!w.live && !held && caseStepsHeld(w.run)) s.note("offline", "the fake I-2's Approve moved the case, but the held roles stay as read at 02:30 (Business administrator), so this is the one-read branch, not the live poll");
        const at = caseStepOf(it);
        if (at === "release") {
          s.check(`at "${STEP_NAMES[STEPS.case.release]}"`, true);
          w.adopt(CASE_FLOW, t.kase!.itemId, `Case_Code=${t.kase!.code}`, caseStage(t, it, n("4c I-2 Approve"), "moved on by I-2's Approve"));
          return;
        }
        if (!s.check(`still at "${WAITING}"`, at === "waiting", str(it, "_current_step"))) return;
        if (!s.check(`not moved, and the key's user is not in ${OTHER_ROLES.integration.name} (else I-2's Approve should have acted)`, !held, roles)) return;
        if (t.stays) w.adopt(CASE_FLOW, t.kase!.itemId, `Case_Code=${t.kase!.code}`, caseStage(t, it, n("4c I-2 Approve"), `I-2's Approve blocked: the key's user is not in ${OTHER_ROLES.integration.name}`));
        const fake = w.offline?.integrations.runs.filter((x) => x.code === "completenessConfirmed").at(-1);
        s.block(
          `050201 expected: "${WAITING}" is held by ${OTHER_ROLES.integration.name}, and the key's user, whom I-2 acts as, is not in it (app roles read at boot: ${roles.join(", ") || "none"}; SPEC §2: the role has no members since 21 Oct 02:30). I-2 recorded the completeness and the 15 fields (4b); its Approve did not move the case.${fake ? ` The fake I-2 answered: ${fake.detail}` : " The integration's run history is not on the suite's routes."}`,
        );
      });
    });

    if (has("5")) it(`5 reviews: I-2 starts them (E-A)${t.suffix}`, async () => {
      await tstep(n("5 reviews (E-A)"), [n("4b completeness confirmed (I-2 fields)")], async (s) => {
        const { code, itemId } = t.kase!;
        const pre = await boot(w, "rmm", RUN);
        seen(t, pre.snap.items.case.find((x) => x._id === itemId));
        const c0 = caseIn(pre.state, code);
        if (c0?.phase !== "review") throw new Error(`${code} does not read as in review (${c0?.phase ?? "not loaded"}).`);
        const want: ReviewDept[] = ["RMM", ...departmentsForScope(c0.scope, pre.state.ownership)];
        t.depts = want;
        // the scope as loaded (SET:current's rule set) against what the run's data must activate: a rule set that drops a
        // department is a fail here, not a quietly smaller run (6a/6b never go unrun for it)
        const sorted = (x: ReviewDept[]) => JSON.stringify([...x].sort());
        s.check(`the scope activates the run's departments (case/data.ts: ${d.reviews.join(", ")})`, sorted(want) === sorted(d.reviews), { scope: want, run: d.reviews });
        // 22 Oct (load-time redesign): I-2 creates the round-1 reviews (E-A, before its Approve) from the case's
        // Review_Depts; the integration's connection creates them, so the suite finds them by Kissflow's search on the case
        // item id and adopts them into the ledger (the clean-up deletes them)
        const found = await w.hooks.poll(
          async () => (await w.client.adminSearch("review", itemId)).filter((x) => str(x, "Case_Item_Id") === itemId),
          (rows) => sorted(rows.map((x) => str(x, "Review_Dept") as ReviewDept)) === sorted(want),
        );
        s.note("E-A poll", { polls: found.polls, ms: found.ms });
        const kase0 = await w.client.adminGet("case", itemId);
        s.readBack("CIQ Case (Review_Depts)", pick(kase0, ["Review_Depts", "Case_Phase", "_current_step"]));
        s.check("the case's Review_Depts names the scope's departments", sorted(str(kase0, "Review_Depts").split(",").map((x) => x.trim()).filter(Boolean) as ReviewDept[]) === sorted(want.filter((x) => x !== "RMM")), str(kase0, "Review_Depts"));
        s.check("I-2 started one review per department the scope activates, and RMM's", found.ok, found.value.map((x) => str(x, "Review_Dept")));
        for (const raw of found.value) w.adopt(FLOWS.review.id, raw._id, `Review_Key=${code}-${str(raw, "Review_Dept")}-1`, stageOf(raw, "started by I-2 (E-A)"));

        const b = await boot(w, "rmm", RUN);
        const c = caseIn(b.state, code)!;
        const got = c.reviews.map((r) => r.dept);
        s.readBack("mapped reviews (RMM)", c.reviews.map((r) => ({ dept: r.dept, status: r.status, assigneeId: r.assigneeId, startedAt: r.startedAt })));
        s.check("RMM's screen shows one review per department, and RMM's", JSON.stringify([...got].sort()) === JSON.stringify([...want].sort()), { got, want });
        s.check("each in review, started; RMM's assigned to the case owner", c.reviews.every((r) => r.status === "in-review" && !!r.startedAt) && c.reviews.find((r) => r.dept === "RMM")?.assigneeId === c.ownerId);
        const kase = b.snap.items.case.find((x) => x._id === itemId);
        seen(t, kase);
        for (const dept of want) {
          const raw = found.value.find((x) => str(x, "Review_Dept") === dept);
          const name = STEP_NAMES[STEPS.review[dept]]!;
          s.readBack(`CIQ Review ${dept}`, pick(raw, ["_status", "_current_step", "Review_Key", "Case_Code", "Case_Item_Id", "Cycle_No", "Supplier_Code", "Trade_Name", "Review_Dept", "Round_No", "Activation_Kind", "Track_Status", "Assignee_User", "Open_Count", "RMES_Gaps"]));
          if (!raw) {
            s.check(`${dept}: its review item reads back`, false);
            continue;
          }
          t.reviews[dept] = raw._id;
          s.check(`${dept}: at "${name}"`, str(raw, "_current_step") === name && str(raw, "_status") === "InProgress", str(raw, "_current_step"));
          s.check(
            `${dept}: its fields name the case`,
            str(raw, "Review_Key") === `${code}-${dept}-1` && str(raw, "Case_Code") === code && str(raw, "Case_Item_Id") === itemId && num(raw, "Cycle_No") === 1 && str(raw, "Supplier_Code") === S.supplier!.code && str(raw, "Trade_Name") === str(kase, "Trade_Name") && str(raw, "Review_Dept") === dept && num(raw, "Round_No") === 1 && str(raw, "Activation_Kind") === "Completeness" && str(raw, "Track_Status") === LIST.track["in-review"],
          );
        }
        // E-A's ONE case-level history row: every track, no review item id (map/auditMap.ts reads `tracks`)
        const rows = auditOf(b, itemId).filter((x) => str(x, "Action_Code") === "review.started");
        const snap = rows.length === 1 ? parseSnapshot(rows[0]) : undefined;
        s.readBack("review.started (audit row)", rows.map((x) => pick(x, ["Object_Kind", "Object_Item_Id", "New_Value_Text"])));
        s.check("one review.started row for the case, with every review's track", rows.length === 1 && str(rows[0], "Object_Item_Id") === itemId && sorted((snap?.tracks ?? []).map((x) => x.dept)) === sorted(want), rows.length);
        for (const r of rows) w.adopt(FLOWS.audit.id, r._id, `Case_Code=${code} Action_Code=review.started (E-A)`, "saved");
        // the case kept in review: its stage names the reviews (the load above read it: no extra call)
        if (t.stays) w.adopt(CASE_FLOW, itemId, `Case_Code=${code}`, caseStage(t, kase, n("5 reviews (E-A)"), clean() && `reviews ${want.join(", ")} started by I-2 (E-A)`));
      });
    });

    for (const dept of ["SAF", "REG"] as const) {
      const persona: InternalPersonaId = dept === "SAF" ? "saf" : "reg";
      const name = n(RMES_STEP[dept]);
      if (has(dept === "SAF" ? "6a" : "6b")) it(`${name}: ensureRmes creates the record, saveRmes writes a result and a finding`, async () => {
        // by the run's data only: step 5 fails when the live scope drops a department the data activates
        if (!d.reviews.includes(dept)) {
          done.set(name, rec.notRun(name, `the run's data activates no ${dept} review (${d.reviews.join(", ")})`));
          settle(t, name);
          return;
        }
        await tstep(name, [n("5 reviews (E-A)")], async (s) => {
          const { code, itemId } = t.kase!;
          const flow = rmesFlowOf(dept);
          const b0 = await boot(w, persona, RUN);
          // the reviewer's own session: runLoadEffects remembers an attempt as "ensureRmes|<case>", without the department,
          // and the store keeps that memory across persona switches, so after Safety's record the same session never
          // attempts Regulatory's (an app finding for the dev role switch); a reviewer's own session starts empty
          const session = new Set<string>();
          if (w.attempted.has(`ensureRmes|${code}`)) s.note("app finding", `this session already attempted "ensureRmes|${code}" as another reviewer: with the dev role switch the store would not attempt the ${dept} record; run in the reviewer's own session`);
          if (!b0.mapped.index.rmes.has(`${code}|${dept}`)) {
            // the store's own path first: ensureRmes acts only where this user holds the department's review task
            let eff = (await runLoadEffects({ acting: b0.acting, state: b0.state, ctx: b0.ctx(), effects: { ensureRmes }, attempted: session, facts: factsOf(b0) })).find((x) => x.effect === "ensureRmes");
            w.assertRunning();
            s.note("ensureRmes as loaded", eff?.result.message ?? "nothing: the review task is not held");
            if (!eff || eff.note) {
              const act = actOf(b0.snap.items.review.find((x) => x._id === t.reviews[dept]));
              if (!act) throw new Error(`The ${dept} review has no current step to hold.`);
              s.note("approximated", `"${STEP_NAMES[STEPS.review[dept]]}" is held by ${ROLES[persona].name}, which has no members (SPEC §2); ensureRmes ran with the review's live activity instance (${act}) as held. The RMES write itself needs no task.`);
              eff = (await runLoadEffects({ acting: b0.acting, state: b0.state, ctx: heldReviewCtx(b0, code, dept, act), effects: { ensureRmes }, attempted: session, facts: factsOf(b0) })).find((x) => x.effect === "ensureRmes");
              w.assertRunning();
              s.note("ensureRmes", eff?.result.message);
            }
            for (const k of session) w.attempted.add(k);
            s.check("ensureRmes created the record", eff?.result.ok === true && !eff.note, eff?.result.message);
          }
          const b1 = await boot(w, persona, RUN);
          const rr = b1.mapped.index.rmes.get(`${code}|${dept}`);
          const crits = caseIn(b1.state, code)?.rmes?.criteria.filter((x) => x.dept === dept) ?? [];
          if (!rr || !crits.length) throw new Error(`The ${dept} RMES record of ${code} did not read back (${rr ? "no criteria" : "no row"}).`);
          const plan = { ...d.rmes[dept], comment: d.rmes[dept].comment && w.text(d.rmes[dept].comment) };
          const cr = crits.find((x) => !x.result) ?? crits[0]!;
          const cr2 = crits.find((x) => x.id !== cr.id) ?? cr;
          const r1 = await perform(w, b1, "recordCriterion", [code, cr.id, plan.result, plan.comment], (st, by) => A.recordCriterion(st, by, code, cr.id, plan.result, plan.comment));
          written(r1, `recordCriterion ${cr.id}`);
          const text = w.text(plan.finding);
          const r2 = await perform(w, { ...b1, state: r1.next }, "addFinding", [code, cr2.id, text, plan.blocking], (st, by) => A.addFinding(st, by, code, cr2.id, text, plan.blocking));
          written(r2, `addFinding on ${cr2.id}`);
          const finding = caseIn(r2.next, code)!.rmes!.findings.find((f) => f.dept === dept && f.text === text)!;

          const got = await w.client.formGet(flow, rr.itemId);
          const rows = childRows(got, TABLES[dept].criteria, "Criteria_Code");
          const frows = childRows(got, TABLES[dept].findings, "Findings_Key");
          const row = rows.find((x) => str(x, "Criteria_Code") === cr.id);
          const frow = frows.find((x) => str(x, "Findings_Key") === finding.id);
          s.readBack(`CIQ RMES ${dept} (form GET)`, { ...pick(got, ["RMES_Key", "Case_Item_Id", "Case_Code", "Open_Criteria_Count", "Open_Blocking_Findings_Count", "RMES_Voided"]), criteria: rows.map((x) => pick(x as RawItem, ["Criteria_Code", "Criteria_Result", "Criteria_Comment", "Criteria_Recorded_At"])), findings: frows.map((x) => pick(x as RawItem, ["Findings_Key", "Findings_Criterion_Code", "Findings_Text", "Findings_Blocking", "Findings_State"])) });
          s.check("the header names the case", str(got, "RMES_Key") === `${code}-RMES-${dept}` && str(got, "Case_Item_Id") === itemId && str(got, "RMES_Voided") === LIST.no);
          s.check(`one row per planned criterion (${crits.length}), no duplicate`, rows.length === crits.length && new Set(rows.map((x) => str(x, "Criteria_Code"))).size === rows.length, rows.length);
          s.check(`${cr.id}: the result as recorded`, str(row, "Criteria_Result") === LIST.rmesResult[plan.result] && sameText(row?.Criteria_Comment, plan.comment || undefined) && !!str(row, "Criteria_Recorded_At") && JSON.stringify(userIds(row, "Criteria_Recorded_By")) === JSON.stringify([w.identity.kfUserId]), pick(row as RawItem, ["Criteria_Result", "Criteria_Comment", "Criteria_Recorded_By"]));
          s.check(`${finding.id}: one finding row as added`, frows.filter((x) => str(x, "Findings_Key") === finding.id).length === 1 && str(frow, "Findings_Text") === text && str(frow, "Findings_Blocking") === (plan.blocking ? LIST.yes : LIST.no) && str(frow, "Findings_State") === "open" && str(frow, "Findings_Criterion_Code") === cr2.id);
          s.check("the open counts follow", num(got, "Open_Criteria_Count") === crits.filter((x) => x.id !== cr.id && !x.result).length && num(got, "Open_Blocking_Findings_Count") === (plan.blocking ? 1 : 0), pick(got, ["Open_Criteria_Count", "Open_Blocking_Findings_Count"]));

          const b2 = await boot(w, persona, RUN);
          const back = caseIn(b2.state, code)?.rmes;
          const crBack = back?.criteria.find((x) => x.id === cr.id);
          const fBack = back?.findings.find((x) => x.id === finding.id);
          const crWant = caseIn(r2.next, code)!.rmes!.criteria.find((x) => x.id === cr.id)!;
          s.readBack(`mapped RMES ${dept}`, { criterion: crBack ? critKeys(crBack) : null, finding: fBack ? findingKeys(fBack) : null });
          s.check("the criterion reads back as recorded", !!crBack && JSON.stringify(critKeys(crBack)) === JSON.stringify(critKeys(crWant)), crBack && { got: critKeys(crBack), want: critKeys(crWant) });
          s.check("the finding reads back as added", !!fBack && JSON.stringify(findingKeys(fBack)) === JSON.stringify(findingKeys(finding)), fBack && { got: findingKeys(fBack), want: findingKeys(finding) });
          t.rmesView[dept] = caseIn(b2.state, code);
          const saved = auditOf(b2, itemId).filter((x) => str(x, "Action_Code") === "rmes.saved" && str(x, "Object_Item_Id") === rr.itemId);
          s.check("three rmes.saved rows (record, result, finding)", ["RMES record", "RMES criterion", "RMES finding"].every((k) => saved.some((x) => str(x, "Object_Kind") === k)), saved.map((x) => str(x, "Object_Kind")));
          if (t.stays) {
            // the case kept in review: the RMES row (a form row: no step) and the case name what this step proved
            const what = `${RMES_STEP[dept].slice(3)}: ${crits.length} criteria, ${cr.id} ${plan.result}, finding ${finding.id} ${plan.blocking ? "blocking" : "not blocking"} and open`;
            const line = w.ledger.latest().find((e) => e.id === rr.itemId);
            if (line) w.adopt(line.flow, rr.itemId, line.what, clean() ? `form row, ${what}; open counts ${num(got, "Open_Criteria_Count")} criteria, ${num(got, "Open_Blocking_Findings_Count")} blocking` : `form row, NOT verified: "${name}" (see the results)`);
            w.adopt(CASE_FLOW, itemId, `Case_Code=${code}`, caseStage(t, b2.snap.items.case.find((x) => x._id === itemId), name, clean() && what));
          }
        });
      });
    }

    if (has("7")) it(`7 review completion (expected blocked: 050201), the gate by admin PUT${t.suffix}`, async () => {
      await tstep(n("7 review completion"), [n("5 reviews (E-A)")], async (s) => {
        const { code } = t.kase!;
        const b = await boot(w, "rmm", RUN);
        const c = caseIn(b.state, code)!;
        // the screen's own path: RMM completes its review (no open point of its own)
        const r = await perform(w, b, "completeReview", [code, "RMM", {}], (st, by) => A.completeReview(st, by, code, "RMM"));
        w.assertRunning();
        s.note("completeReview (the app)", r.refused ?? r.result?.message ?? (r.result?.ok ? "completed" : "no message"));
        if (r.result?.ok) {
          // someone holds the RMM review step again: then completion works and this is a pass
          const back = await w.client.adminGet("review", t.reviews.RMM!);
          s.readBack("CIQ Review RMM", pick(back, ["_status", "_current_step", "Review_Gate", "Review_Confirm", "Completed_At"]));
          const completed = s.check("completed", str(back, "_status") === "Completed", str(back, "_status"));
          if (t.stays) w.adopt(FLOWS.review.id, back._id, `Review_Key=${code}-RMM-1`, stageOf(back, completed && "completed by the app's completeReview"));
          return;
        }
        // Kissflow's answer to the writer's first call: staleCheck's read through the review task. Only THIS answer may
        // block the step: a 050201 from any other call (the admin GET or PUT below) fails it with its text
        const rv = await w.client.adminGet("review", t.reviews.RMM!);
        let answer = "";
        try {
          await w.client.getTask("review", rv._id, actOf(rv));
          answer = "the task route answered with the item";
        } catch (e) {
          if (e instanceof StopError) throw e;
          answer = errorText(e);
        }
        s.note("Kissflow (the review's task read)", answer);

        // Review_Gate: the counts each department's completion would send (countsOf on its own view), by admin PUT. Both
        // formula branches come from real counts: Safety and Regulatory have RMES gaps, the others none
        let gatesOk = true;
        const gate = async (dept: ReviewDept, counts: { Open_Count: number; RMES_Gaps: number }) => {
          const id = t.reviews[dept]!;
          await w.client.adminPut("review", id, counts);
          const back = await w.client.adminGet("review", id);
          const want = counts.Open_Count + counts.RMES_Gaps === 0 ? "OK" : "";
          s.readBack(`CIQ Review ${dept}: Review_Gate`, { ...counts, Review_Gate: str(back, "Review_Gate") });
          const ok = s.check(`${dept}: Review_Gate "${want}" for ${counts.Open_Count} + ${counts.RMES_Gaps}`, str(back, "Review_Gate") === want, str(back, "Review_Gate"));
          gatesOk = ok && gatesOk;
          // the case kept in review: each review stays at its step, with the counts and the gate this step proved
          if (t.stays) w.adopt(FLOWS.review.id, id, `Review_Key=${code}-${dept}-1`, stageOf(back, ok && `started by I-2 (E-A); counts ${counts.Open_Count} open + ${counts.RMES_Gaps} RMES gaps (admin PUT), Review_Gate "${want}"${/050201/.test(answer) ? "; completion blocked (050201)" : ""}`));
        };
        const skipped: string[] = [];
        const gated: string[] = [];
        for (const dept of t.depts) {
          if (!t.reviews[dept]) continue;
          // Safety and Regulatory count their RMES gaps from their own view (the RMM reads no RMES record): without it
          // (6a/6b did not pass) their counts are unknown, and nothing is written
          const rmes = dept === "SAF" || dept === "REG";
          if (rmes && !t.rmesView[dept]) {
            skipped.push(dept);
            // the case kept in review: that review's line says so (this load read it: no extra call)
            if (t.stays) w.adopt(FLOWS.review.id, t.reviews[dept]!, `Review_Key=${code}-${dept}-1`, stageOf(b.snap.items.review.find((x) => x._id === t.reviews[dept]), `started by I-2 (E-A); counts and Review_Gate NOT written (${dept === "SAF" ? "6a" : "6b"} did not pass)`));
          } else {
            await gate(dept, countsOf((rmes ? t.rmesView[dept] : undefined) ?? c, dept));
            gated.push(dept);
          }
        }
        if (skipped.length) s.note("gates not written", `${skipped.join(", ")}: the RMES step did not pass, so the counts are unknown`);
        s.note("approximated", "the counts written by admin PUT (P-RO), as each department's completion would write them (countsOf on that department's view)");
        // "every" only when no department was left out (a skipped one is no failed check: the step still ends blocked)
        const gates = skipped.length ? `Review_Gate checked for ${gated.join(", ") || "none"}, NOT for ${skipped.map((x) => `${x} (${x === "SAF" ? "6a" : "6b"} did not pass)`).join(", ")}` : "every Review_Gate checked";
        if (t.stays) w.adopt(CASE_FLOW, t.kase!.itemId, `Case_Code=${code}`, caseStage(t, b.snap.items.case.find((x) => x._id === t.kase!.itemId), n("7 review completion"), clean() && gatesOk && /050201/.test(answer) && `review completion blocked (050201: the reviewer roles have no members), ${gates}`));
        if (gatesOk && /050201/.test(answer)) s.block(`050201: "${STEP_NAMES[STEPS.review.RMM]}" is held by ${ROLES.rmm.name}, which has no members; the app refused first (${r.refused ?? "no write"}). Kissflow: ${answer}`);
        s.check("Kissflow refuses the review task with 050201", /050201/.test(answer), answer);
      });
    });

    if (has("8")) it(`8 release requested, as E-B leaves it (played)${t.suffix}`, async () => {
      await tstep(n("8 release requested"), [n("5 reviews (E-A)")], async (s) => {
        const { code, itemId, requestId: rid } = t.kase!;
        const b = await boot(w, "rmm", RUN);
        const c = caseIn(b.state, code)!;
        // R4's C01 takes no step 7 (its in-review case shows the blocked completion)
        s.note("approximated", `E-B sends the request when the last review completes; completion is blocked (${t.steps.includes("7") ? "step 7" : "050201: the reviewer roles have no members; this case takes no step 7"}), so the suite plays E-B: the release.requested hand-off and E-B's history row.`);
        const res = await playRelease(b, c, itemId);
        w.assertRunning();
        s.note("playRelease", { handoffs: res.handoffs, warnings: res.warnings });
        s.check("release.requested sent with the case's release key", res.ok && res.handoffs.some((h) => h.code === "release.requested" && h.status === "sent" && h.key === res.key), res.handoffs);

        const kase = await w.hooks.poll(() => w.client.adminGet("case", itemId), (it) => !!str(it, "Release_Requested_At"));
        const req = await w.hooks.poll(() => w.portal.adminGet("request", rid!), (it) => str(it, "Release_Flag") === "Requested");
        s.readBack("CIQ Case", pick(kase.value, ["_current_step", "Release_Requested_At", "Release_Assignees_JSON"]));
        s.readBack("CIQP Request", pick(req.value, ["_current_step", "Release_Flag", "Request_Locked", "Case_Phase_Label", "Release_Contacts"]));
        s.check("the case has Release_Requested_At", kase.ok, { polls: kase.polls, ms: kase.ms });
        const locked = s.check("the request: Release_Flag Requested, locked, awaiting the final release", req.ok && str(req.value, "Request_Locked") === LIST.yes && str(req.value, "Case_Phase_Label") === "Awaiting your final release", pick(req.value, ["Release_Flag", "Request_Locked", "Case_Phase_Label"]));
        const want = JSON.parse(str(kase.value, "Release_Assignees_JSON") || "[]") as { _id: string }[];
        s.check("Release_Contacts = the case's release contacts", JSON.stringify(userIds(req.value, "Release_Contacts").sort()) === JSON.stringify(want.map((u) => u._id).sort()), userIds(req.value, "Release_Contacts"));
        // both lists empty would match: the self contact is the one who may release
        const toSelf = s.check("Release_Contacts = the self contact only", JSON.stringify(userIds(req.value, "Release_Contacts")) === JSON.stringify([w.who.id]), userIds(req.value, "Release_Contacts"));
        w.adopt(REQUEST_FLOW, rid!, `Request_Key=${code}|1`, stageOf(req.value, locked && toSelf && "final release requested, locked"));

        const b2 = await boot(w, "rmm", RUN);
        const row = auditOf(b2, itemId).find((x) => str(x, "Action_Code") === "release.requested");
        s.readBack("release.requested (audit row)", pick(row, ["Action_Code", "Object_State", "Notify_Recipient"]));
        s.check("its release.requested row", !!row && str(row, "Object_State") === LIST.phase["final-release"]);
        s.check("the case reads as awaiting the final release", caseIn(b2.state, code)?.phase === "final-release", caseIn(b2.state, code)?.phase);
      }, ["release.requested"]);
    });

    if (has("9")) it(`9 final release: the supplier releases, I-7 completes the case${t.suffix}`, async () => {
      await tstep(n("9 final release (I-7)"), [n("8 release requested")], async (s) => {
        const { code, itemId, requestId: rid } = t.kase!;
        const req0 = await w.portal.adminGet("request", rid!);
        if (requestStepOf(req0) === "release") {
          const p = await bootPortal(w, RUN);
          await p.actions.finalRelease(code);
          w.assertRunning();
          s.note("how", `the portal's own writer (finalRelease) at "${PORTAL_STEPS.release.name}"`);
        } else {
          // nothing moves the request to its release step live yet: the portal writer's own gates on the request as read
          // (finalRelease: B-11 a contact who may confirm, B-33 no release blocker), then the two fields that step's
          // writer writes, then I-7
          const p = await bootPortal(w, RUN);
          const bnd = p.data.bundles.find((x) => x.code === code);
          if (!bnd) throw new Error(`The portal does not show ${code} to the self contact.`);
          const { c: pc, extra, config } = caseOfRequest(bnd, req0, w.who, p.local);
          const blockers = releaseBlockers(pc, config).map((x) => x.supplierLabel ?? x.label);
          // liveActions' contactOf and mayConfirm, which it does not export
          const me = extra.contacts.find((k) => (k.id && k.id === w.who.id) || (k.email && k.email.trim().toLowerCase() === w.who.email.trim().toLowerCase()) || (!k.id && !k.email && k.name === w.who.name));
          const may = !extra.contacts.length || (!!me && me.mayConfirm !== false);
          s.readBack("the portal's release gates (caseOfRequest on the request)", { phase: pc.phase, blockers, mayConfirm: may });
          s.check("the self contact may confirm (B-11)", may, me ?? extra.contacts);
          s.check("no release blocker (B-33)", !blockers.length, blockers);
          if (!may || blockers.length) throw new Error(`The portal's finalRelease would refuse the release of ${code}: nothing is written.`);
          await w.portal.adminUpdate("request", rid!, { Release_By_Name: w.who.name, Release_At: kfDateTime(new Date()) });
          await w.hooks.post("releaseGiven", { portalRequestItemId: rid! });
          s.note("approximated", `the request is at "${str(req0, "_current_step")}", not at "${PORTAL_STEPS.release.name}": admin PUT of Release_By_Name and Release_At (what the portal's finalRelease writes there), then the releaseGiven webhook (I-7)`);
        }
        const req = await w.portal.adminGet("request", rid!);
        s.readBack("CIQP Request", pick(req, ["_current_step", "Release_Flag", "Release_By_Name", "Release_At"]));
        const holds = s.check("the request holds the release", str(req, "Release_By_Name") === w.who.name && !!str(req, "Release_At"));
        w.adopt(REQUEST_FLOW, rid!, `Request_Key=${code}|1`, stageOf(req, holds && "released"));
        // I-7 writes Final_Release_* first and its Skip and complete ends the case some seconds later (live 21 Oct:
        // about 17 s after the release), so the poll waits for the end, not for the fields
        const polled = await w.hooks.poll(() => w.client.adminGet("case", itemId), (it) => !!str(it, "Final_Release_At") && str(it, "_status") === "Completed", { maxMs: 120000 });
        s.note("I-7 poll", { ok: polled.ok, polls: polled.polls, ms: polled.ms });
        const kase = polled.ok ? polled.value! : await w.client.adminGet("case", itemId);
        if (!str(kase, "Final_Release_At")) throw new Error(`I-7 did not record the final release on the case within ${polled.ms / 1000} s.`);
        s.readBack("CIQ Case", pick(kase, ["_status", "_current_step", "Final_Release_Confirm", "Final_Release_By_Name", "Final_Release_At", "Case_Phase"]));
        // a completed item has no current step live (_current_step null), as the app's own phase rule allows
        const ended = s.check("the case reached End", str(kase, "_status") === "Completed" && (caseStepOf(kase) === "end" || !str(kase, "_current_step")), [str(kase, "_status"), str(kase, "_current_step")]);
        const copied = s.check("Final_Release_* from the request", str(kase, "Final_Release_Confirm") === LIST.confirm && str(kase, "Final_Release_By_Name") === str(req, "Release_By_Name") && instant(str(kase, "Final_Release_At")) === instant(str(req, "Release_At")));
        w.adopt(CASE_FLOW, itemId, `Case_Code=${code}`, stageOf(kase, ended && copied && "completed by I-7, Final_Release_* from the request"));
        const b = await boot(w, "rmm", RUN);
        s.check("the case reads as completed", caseIn(b.state, code)?.phase === "completed", caseIn(b.state, code)?.phase);
        S.released = b;
      }, ["portal"]);
    });
  }
  for (const t of tracks) lifecycle(t);

  it("10 cancel: a second case is started, then cancelled (case.cancelled)", async () => {
    await step("10 cancelled case", ["1 supplier master"], async (s) => {
      const code = C.cancel;
      const input = caseOf(C.materialNo(2));
      const pre = S.released ?? (await boot(w, "rmm", RUN));
      const made = await perform(w, pre, "createCase", [input], (st, by) => A.createCase(st, by, input, undefined, code).state);
      const res = written(made, `createCase ${code}`);
      const itemId = str(res.auditRow, "Case_Item_Id") || ledgerId(w, CASE_FLOW, code);
      const linked = await w.hooks.poll(() => w.client.adminGet("case", itemId), (it) => !!str(it, "Portal_Request_Item_Id"));
      if (linked.value) w.adopt(CASE_FLOW, itemId, `Case_Code=${code}`, stageOf(linked.value));
      if (!linked.ok) await noLink(s, itemId, code, linked);
      const rid = str(linked.value, "Portal_Request_Item_Id");
      w.adopt(REQUEST_FLOW, rid, `Request_Key=${code}|1`, "linked to its case by I-1");

      const b = await boot(w, "rmm", RUN);
      const reason = w.text(d.cancelReason);
      const r = await perform(w, b, "cancelCase", [code, reason], (st, by) => A.cancelCase(st, by, code, reason));
      const done2 = written(r, `cancelCase ${code}`);
      s.check("case.cancelled was handed over", done2.handoffs.some((h) => h.code === "case.cancelled" && h.status === "sent"), done2.handoffs);
      const req = await w.hooks.poll(() => w.portal.adminGet("request", rid), (it) => str(it, "Case_Phase_Label") === "Cancelled");
      s.readBack("CIQP Request", pick(req.value, ["_current_step", "Case_Phase_Label", "Request_Locked"]));
      const locked = s.check("the request's phase label is Cancelled, locked", req.ok && str(req.value, "Request_Locked") === LIST.yes, { polls: req.polls, label: str(req.value, "Case_Phase_Label") });
      w.adopt(REQUEST_FLOW, rid, `Request_Key=${code}|1`, stageOf(req.value, locked && "cancelled, locked"));
      const kase = await w.client.adminGet("case", itemId);
      s.readBack("CIQ Case", pick(kase, ["_status", "_current_step", "Case_Phase"]));
      // the app writes nothing on the case after Start (write/actions.ts cancelCase): its audit row cancels it
      const stays = s.check(`as the app does it: the item stays at "${WAITING}", the history cancels it`, str(kase, "_status") === "InProgress" && caseStepOf(kase) === "waiting", [str(kase, "_status"), str(kase, "_current_step")]);
      const b2 = await boot(w, "rmm", RUN);
      const c = caseIn(b2.state, code);
      const row = auditOf(b2, itemId).find((x) => str(x, "Action_Code") === "case.cancelled");
      s.readBack("case.cancelled (audit row)", pick(row, ["Action_Code", "Object_State", "Event_Reason"]));
      const cancelled = s.check("the case reads as cancelled, with its reason", c?.phase === "cancelled" && c.cancelled?.reason === reason && str(row, "Event_Reason") === reason, c?.phase);
      w.adopt(CASE_FLOW, itemId, `Case_Code=${code}`, stageOf(kase, stays && cancelled && "cancelled by its history row; the app leaves the item here"));
    }, ["case.started", "case.cancelled"]);
  });

  it("11 cleanup: R2, R3 (and offline) delete their own items; R1 and R4 keep the showcase", async () => {
    const name = "11 cleanup";
    if (keepsItems(w.run)) {
      done.set(name, rec.notRun(name, `${w.run} is the showcase: its ${mine().filter((e) => e.stage !== "discarded").length} items stay at the stages the ledger names`));
      return;
    }
    await step(name, [], async (s) => {
      const out: string[] = [];
      const cases = new Map(mine().filter((e) => e.flow === CASE_FLOW).map((e) => [e.id, caseCodeOf(e.what)]));
      const linked: string[] = [];
      let unlinked = false;
      // this suite's items, newest first; a case's first read names I-1's request, which the ledger may lack
      for (const e of mine().reverse()) {
        const cur = await drop(s, e, out);
        if (e.flow !== CASE_FLOW || !cur) continue;
        const rid = str(cur, "Portal_Request_Item_Id");
        if (rid && !w.ledger.has(rid)) linked.push(rid);
        if (!rid && str(cur, "_status") !== "Draft") unlinked = true;
      }
      // I-1's requests the ledger missed (linked after the suite's poll, or never linked): adopted, then deleted too
      const late = await adoptLate(cases, linked, unlinked);
      s.note("I-1's requests found at the cleanup (adopted)", late);
      for (const id of late) await drop(s, w.ledger.latest().find((e) => e.id === id)!, out);
      s.readBack("this suite's ledger items after the cleanup", out);
    });
  });

  /**
   * Deletes one item of this suite, recording what happened in `out`: an admin GET first (gone only on 01015: a 404
   * with 050201 is an item that moved on, deleted all the same), an app process withdrawn while InProgress, the admin
   * DELETE, then a GET that must answer 404. Returns the first read (undefined when the item was gone or the read refused).
   */
  async function drop(s: StepCtx, e: { flow: string; id: string; what: string }, out: string[]): Promise<RawItem | undefined> {
    const key = APP_FLOW_KEY.get(e.flow);
    const portal = e.flow === REQUEST_FLOW ? "request" : e.flow === PORTAL_FLOWS.query.id ? "query" : undefined;
    const read = portal ? () => w.portal.adminGet(portal, e.id) : key && PROCESSES.has(key) ? () => w.client.adminGet(key as ProcessKey, e.id) : key ? () => w.client.formGet(key as Exclude<FlowKey, ProcessKey>, e.id) : undefined;
    if (!read) {
      s.check(`${e.flow} ${e.id}: a flow the cleanup knows`, false);
      return undefined;
    }
    let cur: RawItem | undefined;
    let note = "";
    try {
      cur = (await read()) as RawItem;
    } catch (err) {
      if (err instanceof StopError) throw err;
      if (isGone(err)) {
        out.push(`${e.flow} ${e.id}: already gone`);
        return undefined;
      }
      note = `, read refused (${errorText(err)})`;
    }
    if (cur && key && PROCESSES.has(key) && str(cur, "_status") === "InProgress") {
      try {
        await w.client.withdraw(key as ProcessKey, e.id, w.text("Test cleanup."));
        note = ", withdrawn";
      } catch (err) {
        if (err instanceof StopError) throw err;
        note = `, withdraw refused (${errorText(err)})`;
      }
    }
    const was = str(cur, "_status") || (cur ? "row" : "unread");
    try {
      if (portal) await w.portal.adminDelete(portal, e.id);
      else await w.client.remove(key!, e.id);
    } catch (err) {
      if (err instanceof StopError) throw err;
      s.check(`${e.flow} ${e.id} (${e.what}): deleted`, false, errorText(err));
      out.push(`${e.flow} ${e.id}: ${was}${note}, delete refused`);
      return cur;
    }
    const after = await gone(read);
    s.check(`${e.flow} ${e.id} (${e.what}): deleted, GET answers not found`, after.gone, after.answer);
    if (after.gone) w.adopt(e.flow, e.id, e.what, "deleted");
    out.push(`${e.flow} ${e.id}: ${was}${note}, deleted${after.gone ? "" : ` but still there (${after.answer})`}`);
    return cur;
  }

  it("records every step; offline the expected outcome", () => {
    if (!rec) throw new Error("the world was not created");
    const by = (status: string) => rec.steps.filter((x) => x.status === status).map((x) => x.name);
    expect(rec.steps.filter((x) => x.status === "fail").map((x) => `${x.name}: ${x.reason}`)).toEqual([]);
    // the RMES steps of every department the run's data activates run on each track that takes them, live too (step 5
    // checks the live scope)
    const rmes = tracks.flatMap((t) => (["SAF", "REG"] as const).filter((x) => d.reviews.includes(x) && t.steps.includes(x === "SAF" ? "6a" : "6b")).map((x) => nm(t, RMES_STEP[x])));
    expect(rec.steps.filter((x) => rmes.includes(x.name) && x.status === "not-run").map((x) => `${x.name}: ${x.reason}`)).toEqual([]);
    if (w.live) return;
    // offline, as the roles were read live at 02:30 on 21 Oct: I-2's Approve and review completion are blocked; R4 as on
    // 21 Oct evening (Integration service has a member again): review completion only
    const held = caseStepsHeld(w.run);
    expect(by("blocked")).toEqual(tracks.flatMap((t) => [...(!held && t.steps.includes("4c") ? [nm(t, "4c I-2 Approve")] : []), ...(t.steps.includes("7") ? [nm(t, "7 review completion")] : [])]));
    expect(by("not-run")).toEqual(keepsItems(w.run) ? ["11 cleanup"] : []);
  });
});
