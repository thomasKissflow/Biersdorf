// S-OP (tests-2026-10-21/SPEC.md §4): open points, every department in turn across runs (live/op/plan.ts: R1 QM, R2
// SAF + REG, R3 MIC + SUS + RMM). S1–S4 make the suite's own case in review (live/op/setup.ts). Then each point,
// numbered by the spec's steps: 1 its department raises it with Thomas as raiser (op.round makes the supplier's CIQP
// Query); 2 an edit while the query is open goes out as op.edited; 3 the supplier answers through the PORTAL's own
// writer as Thomas (I-4 puts the answer on the point); 4 the raiser accepts, returns it (round 2: op.round again, a new
// query) or closes it while the query is open (op.closed). history.updated rewrites the request's questions history
// after every change (checked at each decision and at the end, so a late history never stops a point's own steps).
// 5 (T1, T2): Thread_JSON (every round's text) on each point; the questions history on the request, as stored and as
// the supplier's portal maps it. R1 and R4 keep their items (the ledger names each one's stage); R2, R3 and any offline
// rehearsal delete this suite's own items at the end (C1). R4 (op/plan.ts) leaves one point at each stage (answered;
// returned, round 2 open; accepted; closed while its query was open; edited, waiting for the supplier), and its stages
// name, after each item's step and status as read back, what the last passing step proved on it (and a later step on
// it that did not pass: T1 and T2 name a failed thread check on the point, or the request, it concerns), with the
// point's planned stage when its last step did not pass.
// Every step is one recorded step (live/lib/results.ts) whose evidence is a read-back: the raw Kissflow fields that
// matter and the point as the app maps it, compared with the point the domain wrote (as map/roundtrip.test.ts). A step
// whose dependency did not pass is not-run; a StopError ends the suite at once (the recorder saved what it had).
// Time: the suite has its own timeout (TIMEOUT_MS; the config's 20 minutes would cut a live run off before its clean-up)
// and a budget: a step starts only while it, the thread checks and the clean-up still fit before that timeout; else it
// is not-run ("time budget") and the clean-up runs. A hand-off whose poll gave up (I-1, op.round) may still create its
// portal item: the clean-up (and the R1/R4 showcase) first sweeps for such items and adopts them (live/op/cleanup.ts).
//   offline: npx vitest run --config vitest.live.config.ts live/op.live.ts   (RUN=R1|R2|R3|R4 rehearses that run;
//            OP_BUDGET_MIN=<n> rehearses a shorter budget)
//   live:    LIVE=1 RUN=R1 npx vitest run --config vitest.live.config.ts live/op.live.ts
//            (KF_GAP_MS=8000 slows the pace: the suite's timeout and budget grow with it)
import { isDeepStrictEqual } from "node:util";
import { describe, expect, it } from "vitest";
import * as A from "@/domain/actions";
import { DEPT_LABEL } from "@/domain/catalog";
import type { OpenPoint } from "@/domain/types";
import { actingAs } from "@/app-live/identity";
import { FLOWS, LIST, STEP_NAMES, STEPS } from "@/app-live/ids";
import { parseThread } from "@/app-live/map/trackMap";
import { questionsHistory } from "@/app-live/shared/questionsHistory";
import { heldOp } from "@/app-live/write/guards";
import { nameOfIn, toKfIds } from "@/app-live/write/encode";
import { json, num, str, userIds, type RawItem } from "@/portal/data/raw";
import { FLOWS as PORTAL_FLOWS, STEPS as PORTAL_STEPS } from "@/portal/kf/portal";
import { diff, fingerprint } from "./lib/fingerprint";
import { GAP_MS } from "./lib/queue";
import type { StepCtx, Status } from "./lib/results";
import { LIVE_RUNS, RUN, bootPortal, createWorld, type Performed, perform } from "./lib/world";
import { OP_FIELDS, OP_PICK, PSEUDO_ID, QUERY_FIELDS, QUERY_PICK, answerKeys, assignedTo, day, editKeys, idSet, opKeys, pick, same, stepName } from "./op/check";
import { POLL_WINDOW_MS, cleanupCalls, deleteOwn, ownItems, sweepLate, type LateHandoff } from "./op/cleanup";
import { meter } from "./op/meter";
import { planOf, textsOf, type PointFlow, type PointPlan } from "./op/plan";
import { RUN_SCOPE, caseIn, inDays, ledgerIdOf, polled, refLabel, sectionFor, session, setupCase, setupCompleteness, setupReviews, setupSupplier, written, type OpCase, type OpSupplier } from "./op/setup";

/** One live call: the gap after the previous call's end (2.5 s, or KF_GAP_MS) plus its own answer (≈0.8 s median,
 *  ≈1.5 s p90 in the 20 Oct request logs). */
const CALL_MS = GAP_MS + 1500;
/** The suite's own timeout: a live run makes ≈500–620 calls (R1–R3, the meter's estimate; R4 ≈750, ≈1000 after S-CASE
 *  R4, whose items every load reads too) at ≈CALL_MS each, plus the polls' waits, far past the config's 20 minutes: the
 *  plan's minutes at the 2.5 s pace (90; R4 120), longer in proportion at a slower one (KF_GAP_MS=8000: ×2.4). */
const TIMEOUT_MS = Math.round(((planOf(RUN).timeoutMin ?? 90) * 60_000 * CALL_MS) / 4000);
/** Kept free at the end: a call cut off at 60 s can hold the queue for up to 5 minutes (queue.ts LATE_MAX_MS). */
const MARGIN_MS = 10 * 60_000;
const mins = (ms: number) => Math.round(ms / 60_000);

/** The time the steps may use, the clean-up included: TIMEOUT_MS − MARGIN_MS for a live run and its offline rehearsal;
 *  env OP_BUDGET_MIN only shortens it; any other offline run (every run's points in one go) has no budget. */
function budgetOf(run: string): number {
  const max = TIMEOUT_MS - MARGIN_MS;
  const env = Number(process.env.OP_BUDGET_MIN) * 60_000;
  if (env > 0) return Math.min(env, max);
  return (LIVE_RUNS as readonly string[]).includes(run) ? max : Number.POSITIVE_INFINITY;
}

/** One point through its steps: what the suite knows of it so far. */
interface Point {
  plan: PointPlan;
  T: ReturnType<typeof textsOf>;
  opId: string;
  itemId: string;
  /** Its CIQP Query per round (ledger items). */
  queries: string[];
  /** The point as the domain left it at the last app write (what the screen wrote). */
  wrote?: OpenPoint;
  /** Its last step's name (the thread checks depend on every point's last step). */
  last: string;
}

/** The questions-history entry of a point, as recorded (no texts beyond what the checks need). */
interface Hist {
  opId?: string;
  statusCode?: string;
  rounds?: number;
  thread?: { side?: string; action?: string; text?: string }[];
}
const historyOf = (it: RawItem | undefined): Hist[] | undefined => {
  const v = json<unknown>(it, "Questions_History_JSON", undefined);
  return Array.isArray(v) ? (v as Hist[]) : undefined;
};
/** An item that has ended (the live _current_step of an ended item is not known for sure: the status decides). */
const ENDED = new Set(["Completed", "Withdrawn"]);
const histSummary = (h: Hist[] | undefined) => h?.map((x) => ({ opId: x.opId, statusCode: x.statusCode, rounds: x.rounds, messages: x.thread?.length ?? 0 }));

/** The texts the point's Thread_JSON must hold once its flow is done (the raiser's writes persist the answers, G14). */
function persistedTexts(pt: Point): string[] {
  const { T } = pt;
  switch (pt.plan.flow) {
    case "return-accept":
      return [T.question, T.answer1, T.returnReason, T.answer2];
    case "accept":
      return [T.question, T.answer1];
    case "return":
      return [T.question, T.answer1, T.returnReason];
    default:
      return [T.question];
  }
}
/** The supplier-visible status the request's history ends with. An answer reaches the history with the next app write
 *  on the case (any raiser's): before that the point still shows as open there. */
const finalStatus = (flow: PointPlan["flow"], laterWrite: boolean) => ({ "return-accept": "accepted", accept: "accepted", close: "closed", answered: laterWrite ? "answered" : "open", return: "open", open: "open" })[flow];
/** The rounds a point's flow ends with (a return opens round 2). */
const roundsOf = (flow: PointFlow) => (flow === "return-accept" || flow === "return" ? 2 : 1);
/** Flows the raiser decides (the point ends); the others are left open, with the raiser or the supplier. */
const DECIDED = new Set<PointFlow>(["return-accept", "accept", "close"]);
/** R4: the stage each flow leaves its point at (named in its ledger stage when its last step did not pass). */
const PLANNED: Record<PointFlow, string> = {
  "return-accept": "accepted after a second round (End)",
  accept: "accepted (End)",
  close: "closed while its query was open",
  answered: "answered, awaiting the raiser's decision",
  return: "returned, round 2 open at the supplier",
  open: "waiting for the supplier",
};

describe("S-OP: open points, every department in turn across runs (SPEC §4)", () => {
  it("raise, edit, the supplier's answer, accept / return / close, the threads", async () => {
    // offline R4: the fake I-2's Approve moves the case (Thomas back in Integration service), while the held roles stay
    // as read at 02:30 (case/data.ts caseStepsHeld); live reads the roles
    const w = await createWorld({ caseStepsHeld: planOf(RUN).caseStepsHeld === true });
    const plan = planOf(w.run);
    const raw = { app: w.client, portal: w.portal };
    // offline: everything outside the ledger must be untouched at the end (S-INTEGRITY's check reads everything live)
    const printBefore = w.live ? undefined : await fingerprint(raw, w.ledger);
    const m = meter(w);
    const rec = w.recorder("S-OP");
    const before = new Set(w.ledger.latest().map((e) => e.id));
    const sess = session(w);
    const status = new Map<string, Status>();
    const calls: [string, number][] = [];
    /** Hand-offs whose poll gave up: their portal item may still come (the clean-up's sweep looks for it). */
    const late: LateHandoff[] = [];
    /** Wall-clock start (the sweep compares Kissflow's _modified_at with it). */
    const since = Date.now();
    const t0 = w.clock.now();
    /** Time used so far: live, the clock; offline, what live would take (CALL_MS per metered call, plus the polls'
     *  waits on the virtual clock). */
    const used = () => w.clock.now() - t0 + (w.live ? 0 : m.calls * CALL_MS);
    const budget = budgetOf(w.run);
    /** The most calls one step has made so far (the estimate of the next step, and of each thread check). */
    let biggest = 0;
    /** R4 (plan.proofs): what the last passing step proved on each item (its ledger stage names it), and the last step on
     *  it that did not pass. A step names its items (touch) and what it proved on each (prove); both count when it ends. */
    const proved = new Map<string, string>();
    const unproved = new Map<string, string>();
    let touched: string[] = [];
    let pending: [string, string][] = [];
    const touch = (...ids: (string | undefined)[]) => void (plan.proofs && touched.push(...ids.filter((x): x is string => !!x)));
    const prove = (id: string | undefined, what: string) => void (plan.proofs && id && pending.push([id, what]));

    /** One recorded step after its dependencies passed, while it still fits the time budget (`last`: the clean-up or
     *  a showcase, which always runs); its notes say how many Kissflow calls it made (offline: would make), which
     *  integrations ran (offline), and whether a hand-off failed after its save. */
    async function step(name: string, deps: string[], fn: (s: StepCtx) => Promise<void>, o: { last?: boolean } = {}): Promise<boolean> {
      const bad = deps.find((d) => status.get(d) !== "pass");
      if (bad !== undefined) {
        status.set(name, rec.notRun(name, `depends on "${bad}", which is ${status.get(bad) ?? "not run"}`).status);
        return false;
      }
      // this step, the two thread checks (each at most the biggest step so far) and the clean-up, after what is used
      const rest = (3 * biggest + cleanupCalls(w, before, plan.keep)) * CALL_MS + (late.length ? POLL_WINDOW_MS : 0);
      if (!o.last && used() + rest > budget) {
        const why = `time budget: ${mins(used())} of ${mins(budget)} min used; this step, the thread checks and the clean-up need ≈${mins(rest)} min more (the suite's own timeout is ${mins(TIMEOUT_MS)} min), so the clean-up runs now`;
        status.set(name, rec.notRun(name, why).status);
        return false;
      }
      const c0 = m.calls;
      const runs0 = w.offline?.integrations.runs.length ?? 0;
      const p0 = w.problems.length;
      touched = [];
      pending = [];
      const r = await rec.step(name, async (s) => {
        try {
          await fn(s);
          const failed = w.problems.slice(p0);
          s.check("no hand-off failed after its save", !failed.length, failed.map((x) => `${x.code}: ${x.why}`));
        } finally {
          s.note(w.live ? "kissflowCalls" : "kissflowCalls (estimated live)", m.calls - c0);
          if (w.offline) s.note("integration runs (offline fakes)", w.offline.integrations.runs.slice(runs0).map((x) => ({ code: x.code, ok: x.ok, detail: x.detail })));
        }
      });
      status.set(name, r.status);
      if (r.status === "pass") for (const [id, what] of pending) proved.set(id, what), unproved.delete(id);
      else for (const id of new Set([...touched, ...pending.map(([id]) => id)])) unproved.set(id, `"${name}" ${r.status}`);
      calls.push([name, m.calls - c0]);
      biggest = Math.max(biggest, m.calls - c0);
      return r.status === "pass";
    }

    // ------------------------------------------------------------------ the started case of its own
    let sup: OpSupplier | undefined;
    let k: OpCase | undefined;
    const S = ["S1 supplier: the run's supplier with the self contact", "S2 case: createCase, I-1 creates its CIQP Request", "S3 completeness: the supplier fills in and confirms (portal), I-2", "S4 reviews: I-2 starts the review tracks (E-A)"] as const;
    await step(S[0], [], async (s) => void (sup = await setupSupplier(w, s, sess)));
    await step(S[1], [S[0]], async (s) => {
      k = await setupCase(w, s, sess, plan, sup!, late);
      prove(k.caseItemId, "started by createCase; I-1 made and linked its CIQP Request");
      prove(k.requestId, "made by I-1 for the case, assigned to the self contact");
    });
    await step(S[2], [S[1]], async (s) => {
      touch(k!.caseItemId, k!.requestId);
      await setupCompleteness(w, s, sess, plan, k!);
      prove(k!.caseItemId, "started; the supplier's completeness recorded by I-2 (phase Review)");
      prove(k!.requestId, "completeness confirmed by the self contact (the portal's own writers)");
    });
    await step(S[3], [S[2]], async (s) => {
      touch(k!.caseItemId);
      await setupReviews(w, s, sess, k!, plan.depts);
      if (!plan.proofs) return;
      // the load setupReviews ended with (the session keeps it: no call)
      const b = await sess.view("rmm");
      const depts = (caseIn(b.state, k!.code)?.reviews ?? []).map((r) => r.dept);
      for (const d of depts) prove(b.mapped.index.reviews.get(`${k!.code}|${d}`)?.itemId, "started by I-2 (E-A)");
      prove(k!.caseItemId, `started; the supplier's completeness recorded by I-2 (phase Review); reviews ${depts.join(", ")} started by I-2 (E-A); the open points are on their own lines`);
    });
    const code = () => k!.code;

    // ------------------------------------------------------------------ helpers of the point steps
    /** The questions history the last history.updated carried (what the integration must write on the request). */
    let history: unknown;
    const pointIn = (r: Performed, pt: Point) => caseIn(r.next, code())!.openPoints.find((x) => x.id === pt.opId)!;
    /** After an app write: the domain's point, and the history it sent. */
    function wrote(r: Performed, pt: Point): OpenPoint {
      const op = pointIn(r, pt);
      pt.wrote = op;
      if (r.result?.handoffs.some((h) => h.code === "history.updated" && h.status === "sent")) history = JSON.parse(questionsHistory(caseIn(r.next, code())!, nameOfIn(r.next)));
      return op;
    }
    const sent = (r: Performed, c: string) => !!r.result?.handoffs.some((h) => h.code === c && h.status === "sent");
    /** The raiser's next load: the point as the app maps it, compared with the point the domain wrote. */
    async function readPoint(s: StepCtx, pt: Point) {
      const back = await sess.view(pt.plan.persona);
      const bp = caseIn(back.state, code())?.openPoints.find((x) => x.id === pt.opId);
      s.readBack("the open point as the raiser's screen maps it", bp ? opKeys(bp) : null);
      if (pt.wrote) same(s, "read back = written (the screens' fields, roundtrip opKeys, and the raiser's edits)", opKeys(pt.wrote), bp && opKeys(bp));
      return { back, bp };
    }
    /** history.updated: the request's questions history becomes the one the screen sent. */
    async function checkHistory(s: StepCtx) {
      const want = history;
      const got = await w.hooks.poll(() => w.portal.adminGet("request", k!.requestId), (it) => isDeepStrictEqual(json<unknown>(it, "Questions_History_JSON", null), want));
      s.note("history.updated poll", polled(got));
      s.readBack("CIQP Request questions history (per point)", histSummary(historyOf(got.value)));
      s.check("history.updated: the request's questions history is the one the screen sent", got.ok);
    }
    const opRaw = async (s: StepCtx, pt: Point, it?: RawItem) => {
      const op = it ?? (await w.client.adminGet("op", pt.itemId));
      s.readBack("CIQ Open Point (raw)", pick(op, OP_FIELDS, OP_PICK));
      return op;
    };
    const queryRaw = async (s: StepCtx, qid: string, it?: RawItem) => {
      const q = it ?? (await w.portal.adminGet("query", qid));
      s.readBack("CIQP Query (raw)", pick(q, QUERY_FIELDS, QUERY_PICK));
      return q;
    };
    const deptStep = (pt: Point) => STEP_NAMES[STEPS.op[pt.plan.dept]]!;
    const me = () => w.identity.kfUserId;

    /** The query of the point's current round matches the point the domain wrote, and the point as stored (`it`): op.round
     *  copies the point's own fields and assigns its portal contacts (Portal_Contact_Ids). */
    function queryMatches(s: StepCtx, q: RawItem, op: OpenPoint, pt: Point, it: RawItem) {
      s.check(`the query is round ${op.rounds}: Query_Key ${op.id}-R${op.rounds}, Round_No ${op.rounds}`, str(q, "Query_Key") === `${op.id}-R${op.rounds}` && num(q, "Round_No") === op.rounds);
      s.check("the query names the point and the case", str(q, "App_Open_Point_Id") === pt.itemId && str(q, "Case_Code") === code());
      s.check("the query has the point's question, note (justification) and due date", str(q, "Question_Text") === op.question && str(q, "Supplier_Justification") === (op.justification || "—") && str(q, "Supplier_Due_Date").slice(0, 10) === day(op.dueDate));
      s.check("the query's reference is the point's section", str(q, "Ref_Section_Key") === op.ref.sectionId && str(q, "Ref_Label") === op.ref.label);
      const labels = { Kind_Label: str(q, "Kind_Label"), Responsible_Department: str(q, "Responsible_Department"), Supplier_Code: str(q, "Supplier_Code") };
      const want = { Kind_Label: LIST.kindLabel[op.kind], Responsible_Department: DEPT_LABEL[op.dept], Supplier_Code: k!.supplierCode };
      s.check("the query's kind, department and supplier are the point's (the encoder's labels, the case's supplier code)", !!want.Supplier_Code && isDeepStrictEqual(labels, want), labels);
      s.check(`the query is at "${PORTAL_STEPS.respond.name}"`, stepName(q) === PORTAL_STEPS.respond.name, stepName(q));
      // exactly the case's supplier side: anyone more would see a question of a case that is not theirs
      const to = idSet(userIds(q, "Assigned_Contacts"));
      const of = { point: idSet(str(it, "Portal_Contact_Ids").split(/[,;\s]+/).filter(Boolean)), request: idSet(k!.contacts) };
      s.check("the query is assigned to exactly the point's portal contacts, which are the request's (the self contact among them)", to.includes(w.who.id) && isDeepStrictEqual(to, of.point) && isDeepStrictEqual(to, of.request), { query: to, ...of });
    }

    // ------------------------------------------------------------------ the point steps
    async function raise(s: StepCtx, pt: Point) {
      const p = pt.plan;
      const b = await sess.view(p.persona);
      const c0 = caseIn(b.state, code())!;
      s.check(`the case has a ${p.dept} review track to raise on`, c0.reviews.some((r) => r.dept === p.dept && r.status !== "completed"), c0.reviews.map((r) => r.dept));
      const sectionId = sectionFor(c0, p.dept, p.sectionId);
      if (sectionId !== p.sectionId) s.note("section", `${p.sectionId} does not apply to this case; the point refers to ${sectionId}`);
      const input: A.RaiseInput = { dept: p.dept, kind: "query", ref: { sectionId, label: refLabel(sectionId) }, question: pt.T.question, justification: pt.T.justification, dueDate: inDays(14) };
      const r = await perform(w, b, "raiseOpenPoint", [code(), input], (st, by) => A.raiseOpenPoint(st, by, code(), input));
      sess.dirty();
      if (!written(s, "raiseOpenPoint", r)) return;
      pt.opId = caseIn(r.next, code())!.openPoints.find((x) => !c0.openPoints.some((y) => y.id === x.id))!.id;
      const op = wrote(r, pt);
      pt.itemId = ledgerIdOf(w, FLOWS.op.id, `OP_Key=${op.id}`);
      touch(pt.itemId);
      s.note("open point", { opId: op.id, itemId: pt.itemId });
      s.check("op.round and history.updated went out", sent(r, "op.round") && sent(r, "history.updated"));
      // op.round (I-3): a CIQP Query round 1, linked on the point
      const linked = await w.hooks.poll(() => w.client.adminGet("op", pt.itemId), (it) => !!str(it, "Portal_Query_Item_Id"));
      s.note("op.round poll", polled(linked));
      const it = await opRaw(s, pt, linked.value);
      if (!s.check("op.round linked a CIQP Query on the point (Portal_Query_Item_Id)", linked.ok)) {
        late.push({ code: "op.round", itemId: pt.itemId });
        return;
      }
      const qid = str(it, "Portal_Query_Item_Id");
      w.adopt(PORTAL_FLOWS.query.id, qid, `${op.id}-R1 query (S-OP)`, PORTAL_STEPS.respond.name);
      pt.queries.push(qid);
      s.check(`the point is at "${deptStep(pt)}"`, stepName(it) === deptStep(pt), stepName(it));
      s.check("it is held by the raiser (Raiser_Assignee, the step's assignee)", userIds(it, "Raiser_Assignee").includes(me()) && assignedTo(it).includes(me()));
      s.check("its fields are the point's: key, department, round 1, open", str(it, "OP_Key") === op.id && str(it, "OP_Dept") === p.dept && num(it, "Round_No") === 1 && str(it, "OP_Progress") === LIST.opProgress.open);
      queryMatches(s, await queryRaw(s, qid), op, pt, it);
      const { back } = await readPoint(s, pt);
      s.check("the writers' index holds the point's task at its department step", !!heldOp(back.ctx(), back.state, code(), op.id));
      prove(pt.itemId, `raised by ${p.dept} with Thomas as raiser (Raiser_Assignee); op.round made its round-1 query`);
      prove(qid, `round-1 query of ${op.id} (${p.dept}), made by op.round, assigned to the self contact, awaiting the supplier`);
    }

    async function edit(s: StepCtx, pt: Point) {
      const b = await sess.view(pt.plan.persona);
      const patch: A.OpenPointPatch = { question: pt.T.editedQuestion, justification: pt.T.editedJustification, dueDate: inDays(21) };
      const r = await perform(w, b, "editOpenPoint", [code(), pt.opId, patch], (st, by) => A.editOpenPoint(st, by, code(), pt.opId, patch));
      sess.dirty();
      if (!written(s, "editOpenPoint", r)) return;
      const op = wrote(r, pt);
      s.check("an edit of an open point goes to its query (op.edited), no new round", sent(r, "op.edited") && !sent(r, "op.round") && op.rounds === 1);
      const qid = pt.queries.at(-1)!;
      touch(pt.itemId, qid);
      const got = await w.hooks.poll(() => w.portal.adminGet("query", qid), (it) => str(it, "Question_Text") === op.question);
      s.note("op.edited poll", polled(got));
      const q = await queryRaw(s, qid, got.value);
      s.check("op.edited: the query has the new question", got.ok);
      s.check("op.edited: the query has the new note (justification) and due date", str(q, "Supplier_Justification") === op.justification && str(q, "Supplier_Due_Date").slice(0, 10) === day(op.dueDate));
      s.check("op.edited: the query is marked as changed (Edited_At)", !!str(q, "Edited_At"));
      const it = await opRaw(s, pt);
      s.check("the point holds the new question, note and due date", str(it, "Question_Text") === op.question && str(it, "Supplier_Justification") === op.justification && str(it, "Supplier_Due_Date").slice(0, 10) === day(op.dueDate));
      await readPoint(s, pt);
      prove(pt.itemId, `raised by ${pt.plan.dept} (Thomas as raiser); its question, note and due date edited (Thread_JSON edits), op.edited updated its open query`);
      prove(qid, `round-1 query of ${op.id} (${pt.plan.dept}), edited by op.edited (question, note, due date; Edited_At), awaiting the supplier`);
    }

    async function answer(s: StepCtx, pt: Point, round: 1 | 2) {
      const text = round === 1 ? pt.T.answer1 : pt.T.answer2;
      const b = await sess.view(pt.plan.persona); // the raiser's state before the answer (the domain's expectation)
      const pb = await bootPortal(w, RUN_SCOPE);
      const qid = pb.data.side.extras.get(code())?.queryOf[pt.opId];
      touch(pt.itemId, pt.queries.at(-1));
      if (!s.check(`the supplier's portal shows the point's round-${round} query as a task`, !!qid && qid === pt.queries.at(-1), qid)) return;
      await pb.actions.supplierRespond(code(), pt.opId, { text });
      sess.dirty();
      s.note("supplier side", "the portal's own writer (liveActions supplierRespond) as the self contact; it posts I-4 (queryAnswered)");
      const got = await w.hooks.poll(() => w.client.adminGet("op", pt.itemId), (it) => str(it, "Response_Text") === text && str(it, "OP_Progress") === LIST.opProgress["in-progress"]);
      s.note("I-4 poll", polled(got));
      const q = await queryRaw(s, qid!);
      const it = await opRaw(s, pt, got.value);
      s.check("the query holds the answer and has ended (Supplier: respond submitted)", str(q, "Response_Kind") === "Answer" && str(q, "Response_Text") === text && ENDED.has(str(q, "_status")), str(q, "_status"));
      s.check('I-4: the point has Response_* and OP_Progress "In progress"', got.ok && str(it, "Response_Kind") === "Answer");
      s.check("I-4: Supplier_Responsible_Email is the self contact's (its e-mail known)", !!w.who.email && str(it, "Supplier_Responsible_Email").toLowerCase() === w.who.email.toLowerCase());
      s.check(`the point stays at "${deptStep(pt)}" with the raiser`, stepName(it) === deptStep(pt) && assignedTo(it).includes(me()), stepName(it));
      // what the raiser's screen must show: the domain's own supplierRespond on the loaded state, as the self contact
      const exp = A.supplierRespond(b.state, sup!.selfId, code(), pt.opId, { text });
      const want = A.wasRefused(b.state, exp) ? undefined : caseIn(exp, code())?.openPoints.find((x) => x.id === pt.opId);
      if (!want) s.check("the domain takes the self contact's answer on the loaded state", false, exp.toasts.at(-1)?.text);
      const back = await sess.view(pt.plan.persona);
      const bp = caseIn(back.state, code())?.openPoints.find((x) => x.id === pt.opId);
      s.readBack("the open point as the raiser's screen maps it", bp ? answerKeys(bp) : null);
      if (want) same(s, "the raiser's screen shows the answer as the domain records it", answerKeys(want), bp && answerKeys(bp));
      s.note("the answer is attributed to", bp?.thread.at(-1)?.by === sup!.selfId ? "the self contact" : (bp?.thread.at(-1)?.by ?? null));
      prove(pt.itemId, `raised by ${pt.plan.dept} (Thomas as raiser); answered by the supplier in round ${round} (the portal's writer; I-4: Response_*, OP_Progress In progress), awaiting the raiser's decision`);
      prove(qid, `round-${round} query of ${pt.opId}, answered by the supplier (Supplier: respond submitted), ended`);
    }

    async function giveBack(s: StepCtx, pt: Point) {
      const b = await sess.view(pt.plan.persona);
      const reason = pt.T.returnReason;
      const r = await perform(w, b, "reviewResponse", [code(), pt.opId, "return", reason], (st, by) => A.reviewResponse(st, by, code(), pt.opId, "return", reason));
      sess.dirty();
      if (!written(s, "reviewResponse return", r)) return;
      const op = wrote(r, pt);
      s.check("the domain starts round 2 (open again)", op.rounds === 2 && op.status === "open");
      s.check("op.round and history.updated went out again", sent(r, "op.round") && sent(r, "history.updated"));
      const old = pt.queries.at(-1);
      touch(pt.itemId);
      const linked = await w.hooks.poll(() => w.client.adminGet("op", pt.itemId), (it) => !!str(it, "Portal_Query_Item_Id") && str(it, "Portal_Query_Item_Id") !== old);
      s.note("op.round poll", polled(linked));
      const it = await opRaw(s, pt, linked.value);
      if (!s.check("op.round linked a NEW CIQP Query on the point", linked.ok)) {
        late.push({ code: "op.round", itemId: pt.itemId });
        return;
      }
      const qid = str(it, "Portal_Query_Item_Id");
      w.adopt(PORTAL_FLOWS.query.id, qid, `${op.id}-R2 query (S-OP)`, PORTAL_STEPS.respond.name);
      pt.queries.push(qid);
      s.check(`the point is round 2: Round_No 2, Query_Key ${op.id}-R2, OP_Progress "Open", the reason kept`, num(it, "Round_No") === 2 && str(it, "Query_Key") === `${op.id}-R2` && str(it, "OP_Progress") === LIST.opProgress.open && str(it, "Return_Reason") === reason);
      s.check(`it stays at "${deptStep(pt)}" with the raiser`, stepName(it) === deptStep(pt) && assignedTo(it).includes(me()), stepName(it));
      const t = parseThread(it)?.thread ?? [];
      s.check("Thread_JSON has two rounds: round 1's answer persisted, the return opens round 2", t.some((x) => x.side === "supplier" && x.text === pt.T.answer1) && t.some((x) => x.action === "returned" && x.newRound === true && x.text === reason));
      queryMatches(s, await queryRaw(s, qid), op, pt, it);
      await readPoint(s, pt);
      await checkHistory(s);
      prove(pt.itemId, `raised by ${pt.plan.dept} (Thomas as raiser); answered in round 1, returned by the raiser (the reason kept, Thread_JSON with both rounds): round 2 open at the supplier (op.round made a new query); history.updated`);
      prove(qid, `round-2 query of ${op.id} (${pt.plan.dept}), made by op.round after the return, assigned to the self contact, awaiting the supplier`);
    }

    async function accept(s: StepCtx, pt: Point) {
      const b = await sess.view(pt.plan.persona);
      const r = await perform(w, b, "reviewResponse", [code(), pt.opId, "accept", ""], (st, by) => A.reviewResponse(st, by, code(), pt.opId, "accept", ""));
      sess.dirty();
      if (!written(s, "reviewResponse accept", r)) return;
      const op = wrote(r, pt);
      touch(pt.itemId);
      s.check("the domain closes the point as accepted", op.status === "closed" && op.outcome === "accepted");
      s.check("history.updated went out (no op.round, no op.closed)", sent(r, "history.updated") && !sent(r, "op.round") && !sent(r, "op.closed"));
      const it = await opRaw(s, pt);
      s.check('the point ended: OP_Outcome "Accepted", Completed', str(it, "OP_Outcome") === LIST.opOutcome.accepted && str(it, "_status") === "Completed", str(it, "_status"));
      s.check("Closed_At and Closed_By (the raiser) are set", !!str(it, "Closed_At") && userIds(it, "Closed_By").includes(me()));
      s.check("Thread_JSON keeps the last answer and the acceptance", (parseThread(it)?.thread ?? []).some((x) => x.action === "accepted") && (parseThread(it)?.thread ?? []).some((x) => x.side === "supplier" && x.text === (pt.plan.flow === "accept" ? pt.T.answer1 : pt.T.answer2)));
      await readPoint(s, pt);
      await checkHistory(s);
      prove(pt.itemId, `raised by ${pt.plan.dept} (Thomas as raiser); answered by the supplier, accepted by the raiser: ended (OP_Outcome Accepted, Closed_At and Closed_By); history.updated wrote the request's questions history`);
    }

    async function close(s: StepCtx, pt: Point) {
      const b = await sess.view(pt.plan.persona);
      const reason = pt.T.closeReason;
      const r = await perform(w, b, "closeOpenPoint", [code(), pt.opId, reason], (st, by) => A.closeOpenPoint(st, by, code(), pt.opId, reason));
      sess.dirty();
      if (!written(s, "closeOpenPoint", r)) return;
      const op = wrote(r, pt);
      s.check("the domain closes the point (withdrawn)", op.status === "closed" && op.outcome === "withdrawn");
      s.check("op.closed and history.updated went out (the query was open)", sent(r, "op.closed") && sent(r, "history.updated"));
      const qid = pt.queries.at(-1)!;
      touch(pt.itemId, qid);
      const got = await w.hooks.poll(() => w.portal.adminGet("query", qid), (q) => str(q, "_status") !== "InProgress");
      s.note("op.closed poll", polled(got));
      const q = await queryRaw(s, qid, got.value);
      s.check("op.closed: the open query has ended, unanswered", got.ok && ENDED.has(str(q, "_status")) && !str(q, "Response_Text"), str(q, "_status"));
      const it = await opRaw(s, pt);
      s.check('the point ended: OP_Outcome "Withdrawn" with the internal reason, Completed', str(it, "OP_Outcome") === LIST.opOutcome.withdrawn && str(it, "Outcome_Reason") === reason && str(it, "_status") === "Completed", str(it, "_status"));
      await readPoint(s, pt);
      await checkHistory(s);
      prove(pt.itemId, `raised by ${pt.plan.dept} (Thomas as raiser); closed by the raiser while its query was open: ended (OP_Outcome Withdrawn, the internal reason kept); history.updated`);
      prove(qid, `round-1 query of ${op.id}, ended unanswered by op.closed`);
    }

    // ------------------------------------------------------------------ every point of the run
    const points: Point[] = plan.points.map((p) => ({ plan: p, T: textsOf(p, w.text), opId: "", itemId: "", queries: [], last: "" }));
    for (const pt of points) {
      const n = (what: string) => `${pt.plan.key} ${pt.plan.dept} ${what}`;
      const raised = n("1 raise: op.round makes the CIQP Query");
      await step(raised, [...S], (s) => raise(s, pt));
      pt.last = raised;
      const edited = n("2 edit: op.edited updates the query");
      if (pt.plan.edit) await step(edited, [raised], (s) => edit(s, pt));
      if (pt.plan.flow === "open") {
        // left with the supplier: its round-1 query open (edited first when the plan says so)
        if (pt.plan.edit) pt.last = edited;
        continue;
      }
      if (pt.plan.flow === "close") {
        pt.last = n("4 close while the query is open: op.closed");
        await step(pt.last, [raised], (s) => close(s, pt));
        continue;
      }
      let prev = n("3 supplier answer, round 1 (portal writer, I-4)");
      await step(prev, [raised], (s) => answer(s, pt, 1));
      if (pt.plan.flow === "return-accept" || pt.plan.flow === "return") {
        const back = n("4 return: round 2, a new query (op.round)");
        await step(back, [prev], (s) => giveBack(s, pt));
        if (pt.plan.flow === "return") {
          // left with the supplier: round 2's query open
          pt.last = back;
          continue;
        }
        prev = n("3 supplier answer, round 2 (portal writer, I-4)");
        await step(prev, [back], (s) => answer(s, pt, 2));
      }
      if (pt.plan.flow === "answered") {
        pt.last = prev;
        continue;
      }
      pt.last = n("4 accept: the point ends, history.updated");
      await step(pt.last, [prev], (s) => accept(s, pt));
    }

    // ------------------------------------------------------------------ the threads
    const finals = points.map((pt) => pt.last);
    /** R4: the step's checks on one point; one that fails names the step on that point's line too (touch). */
    const onPoint = (s: StepCtx, pt: Point): StepCtx => ({ ...s, check: (label, ok, detail) => (ok || touch(pt.itemId), s.check(label, ok, detail)) });
    await step("T1 thread: Thread_JSON holds every round's text", finals, async (s0) => {
      // a point whose check fails names T1 on its line; a throw names it on the point it stopped at and every later one
      let at = 0;
      try {
        for (const [i, pt] of points.entries()) {
          at = i;
          const s = onPoint(s0, pt);
          const it = await w.client.adminGet("op", pt.itemId);
          const text = str(it, "Thread_JSON");
          const doc = parseThread(it);
          const got = (doc?.thread ?? []).map((x) => ({ side: x.side, action: x.action, text: x.text, ...(x.newRound ? { newRound: true } : {}) }));
          s.readBack(`${pt.opId} Thread_JSON`, got);
          if (!s.check(`${pt.opId}: Thread_JSON parses as {thread, edits}`, !!doc)) continue;
          const want = (pt.wrote?.thread ?? []).map((x) => ({ side: x.side, action: x.action, text: x.text, ...(x.newRound ? { newRound: true } : {}) }));
          same(s, `${pt.opId}: Thread_JSON is the thread the screen last wrote`, { thread: want }, { thread: got });
          const missing = persistedTexts(pt).filter((t) => !got.some((x) => x.text === t));
          s.check(`${pt.opId}: every round's text is in it (question, answers, return reason)`, !missing.length, missing);
          s.check(`${pt.opId}: edits recorded (${pt.plan.edit ? "question, note, due date" : "none"})`, pt.plan.edit ? (doc!.edits.map((e) => e.field).sort().join() === "dueDate,justification,question") : !doc!.edits.length, doc!.edits.map((e) => e.field));
          // the values too: what the screen last wrote, with Kissflow ids as the encoder writes them (threadJson)
          const who = { identity: w.identity, acting: actingAs(w.identity, pt.plan.persona) };
          same(s, `${pt.opId}: the edits are the ones the screen wrote (field, from, to, by, at)`, { edits: toKfIds(pt.wrote?.edits ?? [], who).map(editKeys) }, { edits: doc!.edits.map(editKeys) });
          s.check(`${pt.opId}: no stand-in id in it (self:, contact:, mail:, u-…)`, !PSEUDO_ID.test(text), text.match(PSEUDO_ID)?.[0]);
          if (pt.plan.flow === "answered") {
            // the answer is not persisted until the raiser writes again; the screen shows it from Response_* (G14)
            const bp = caseIn((await sess.view(pt.plan.persona)).state, code())?.openPoints.find((x) => x.id === pt.opId);
            s.check(`${pt.opId}: the raiser's screen shows the waiting answer (from Response_*)`, !!bp?.thread.some((x) => x.side === "supplier" && x.text === pt.T.answer1) && bp?.status === "in-progress");
          }
        }
        at = points.length;
      } finally {
        touch(...points.slice(at).map((pt) => pt.itemId));
      }
    });
    await step("T2 thread: the questions history on the request", finals, async (s) => {
      // the request's line names T2 when it does not pass (named first: a check may end the step early, a call may throw)
      touch(k!.requestId);
      const req = await w.portal.adminGet("request", k!.requestId);
      const hist = historyOf(req);
      s.readBack("CIQP Request questions history (per point)", histSummary(hist));
      if (!s.check("Questions_History_JSON parses as a list", !!hist)) return;
      s.check("it is the history the screen last sent (history.updated)", isDeepStrictEqual(hist, history));
      for (const [i, pt] of points.entries()) {
        const p = onPoint(s, pt);
        const h = hist!.find((x) => x.opId === pt.opId);
        const want = finalStatus(pt.plan.flow, i < points.length - 1);
        const rounds = roundsOf(pt.plan.flow);
        p.check(`${pt.opId}: on the request, ${want}, ${rounds} round(s)`, h?.statusCode === want && h?.rounds === rounds, { statusCode: h?.statusCode, rounds: h?.rounds });
        const texts = (h?.thread ?? []).map((x) => x.text);
        const missing = persistedTexts(pt).filter((t) => !texts.includes(t));
        p.check(`${pt.opId}: the supplier sees every round's text`, !missing.length, missing);
      }
      s.check("no internal reason reaches the supplier (close reasons)", !points.some((pt) => pt.plan.flow === "close" && JSON.stringify(hist).includes(pt.T.closeReason)));
      // the supplier's screen: the portal's own load maps the history (and any open query) into its points
      const pc = (await bootPortal(w, RUN_SCOPE)).data.side.cases.find((c) => c.id === code());
      s.readBack("the points as the supplier's portal maps them", pc?.openPoints.map((x) => ({ id: x.id, status: x.status, rounds: x.rounds, messages: x.thread.length })) ?? null);
      for (const pt of points) {
        const sp = pc?.openPoints.find((x) => x.id === pt.opId);
        const decided = DECIDED.has(pt.plan.flow);
        onPoint(s, pt).check(`${pt.opId}: the supplier's portal shows it ${decided ? "closed" : "not closed"}, with every round's text`, !!sp && (sp.status === "closed") === decided && persistedTexts(pt).every((t) => sp.thread.some((x) => x.text === t)), sp && { status: sp.status, rounds: sp.rounds });
      }
      prove(k!.requestId, `completeness confirmed by the self contact; its questions history is the one the screen last sent (history.updated): ${points.length} points with every round's text, as the supplier's portal maps them`);
    });

    // ------------------------------------------------------------------ R1 and R4 keep their items; the others clean up
    /** R4: an item's stage, its step and status as read back, then what the last passing step proved on it, a later step
     *  on it that did not pass, and for a point whose last step did not pass the stage its plan meant to leave it at. */
    const provenStage = (id: string, it: RawItem) => {
      const read = [stepName(it), str(it, "_status")].filter(Boolean).join(", ") || "not read back";
      const pt = points.find((x) => x.itemId === id);
      const missed = pt && status.get(pt.last) !== "pass" ? `; its planned stage "${PLANNED[pt.plan.flow]}${pt.plan.edit && pt.plan.flow === "open" ? ", edited first" : ""}" NOT reached ("${pt.last}" ${status.get(pt.last) ?? "not run"})` : "";
      const not = unproved.get(id);
      return `${read}: ${proved.get(id) ?? "nothing verified"}${not ? `; NOT verified: ${not} (see the results)` : ""}${missed}`;
    };
    if (plan.keep) {
      await step(`${plan.run} showcase: late portal items adopted, the ledger names each item's stage`, [], async (s) => {
        await sweepLate(w, s, before, { since, late });
        const rows: Record<string, unknown>[] = [];
        for (const e of ownItems(w, before).reverse()) {
          const it =
            e.flow === FLOWS.case.id || e.flow === FLOWS.review.id || e.flow === FLOWS.op.id
              ? await w.client.adminGet(e.flow === FLOWS.case.id ? "case" : e.flow === FLOWS.review.id ? "review" : "op", e.id)
              : e.flow === PORTAL_FLOWS.request.id || e.flow === PORTAL_FLOWS.query.id
                ? await w.portal.adminGet(e.flow === PORTAL_FLOWS.request.id ? "request" : "query", e.id)
                : undefined;
          const stage = !it ? e.stage : plan.proofs ? provenStage(e.id, it) : ENDED.has(str(it, "_status")) ? str(it, "_status") : stepName(it) || str(it, "_status");
          if (stage !== e.stage) w.adopt(e.flow, e.id, e.what, stage);
          rows.push({ flow: e.flow, id: e.id, what: e.what, stage });
        }
        s.readBack("this suite's items and their stages (kept for Thomas)", rows);
        s.check("every item of the suite has a stage", rows.every((r) => !!r.stage));
      }, { last: true });
    } else
      await step("C1 clean-up: adopt late portal items, delete this suite's ledger items (withdraw, admin DELETE, GET 404)", [], async (s) => {
        await sweepLate(w, s, before, { since, late });
        await deleteOwn(w, s, before);
      }, { last: true });

    rec.save();
    const total = calls.reduce((a, [, n]) => a + n, 0);
    const time = w.live ? `${mins(used())} min` : `≈${mins(used())} min live at ≈${CALL_MS / 1000} s per call plus the polls' waits`;
    console.log(`S-OP ${w.run} (${w.live ? "live" : "offline"}): ${rec.steps.map((x) => x.status).filter((x) => x === "pass").length}/${rec.steps.length} pass; ${total} Kissflow calls${w.live ? "" : " (estimated live)"}, ${time} (budget ${Number.isFinite(budget) ? `${mins(budget)} min` : "none"})\n${calls.map(([n, c]) => `  ${String(c).padStart(4)}  ${n}`).join("\n")}\nresults: ${rec.file}`);
    if (printBefore) {
      const after = await fingerprint(raw, w.ledger);
      expect(diff(printBefore, after, new Set(w.ledger.latest().map((e) => e.id)))).toMatchObject({ changed: [], removed: [], added: [] });
    }
    const notPass = rec.steps.filter((x) => (w.live ? x.status === "fail" : x.status !== "pass")).map((x) => `${x.name}: ${x.status} (${x.reason ?? ""})`);
    expect(notPass).toEqual([]);
  }, TIMEOUT_MS);
});
