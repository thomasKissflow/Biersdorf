// The live StoreApi of the internal app (DESIGN §6 "Store flow"). Owner D. A pure factory: no React, no Kissflow call;
// LiveAppStore gives it the current state, the write context and the serial chain (ApiDeps), so it is testable alone.
// Every supported method runs the same steps:
//   0. no writer for it (owner C) → "<what> is not available in this version yet." (warning toast)
//   1. the prototype's own pure action (domain/actions.ts, domain/suppliers.ts) as the acting user; a refusal copies the
//      domain's toast and returns the method's "refused" value (the domain's own reason first: it tells the user what
//      to change). No domain rule is repeated here.
//   2. outside CIQ_Digital_A00 → danger toast, nothing saved
//   3. C's live pre-guard, on the accepted action only → danger toast with its reason
//   4. the domain's result becomes the optimistic state (mails and toasts stripped), so the screens update at once
//   5. the writer goes on the serial chain with the write context and state of the click (APP-SAVING-GAPS gap 4: its
//      stale checks compare with the data the user acted on); the method returns its success value at once, and the
//      screens that wait for the outcome (StoreApi `void | Promise<boolean>`, createCase `string | Promise<string>`)
//      get a promise of whether it reached Kissflow (gap 6). completeReview's job first reads everything again and
//      decides from that (gap 9: Kissflow's Review_Gate trusts the counts it writes), refusing when that read could not
//      read a part again or the review changed since the click (reviewGateCheck).
//   6. when the writer settles, the store toasts the finalized text (finalize); every result is logged (enqueueJob).
//      A failure's toast names its cause in plain words in production (userText.ts); the log keeps the raw cause.
//      A save that moved no step shows Kissflow's read-backs; a step move, an item-writing hand-off or a failure reads
//      everything again (gap 1). After a failure, the jobs queued behind it are not sent (gap 2).
// Methods the live app does not offer (supplier side, inbox, reminders, configuration editor, reactivation, …) toast
// why and return their typed "nothing happened" value, as LiveSupplierStore.tsx:365-473 does for the portal.
import * as A from "@/domain/actions";
import { validateDraft } from "@/domain/configActions";
import { mentionRecipients, parseMentions } from "@/domain/mentions";
import { nowIso } from "@/domain/selectors";
import * as M from "@/domain/suppliers";
import type { AppState, InternalPersonaId, ReviewDept, Toast } from "@/domain/types";
import { errorText } from "@/portal/kf/sdk";
import type { StoreApi } from "@/store/store";
import type { AppEnv } from "./env";
import { NOT_IN_APP } from "./kf/client";
import { notReadAgain } from "./load";
import type { HandoffCode } from "./shared/handoff";
import type { Acting, LiveSnapshot, LiveWriters, WritableMethod, WriteCtx, WriteResult } from "./types";
import { HANDOFF_PROBLEM, NOT_READ_AGAIN_PLAIN, errorFor } from "./userText";
import { heldReview } from "./write/guards";
import { STALE_TEXT } from "./write/verify";

type Tone = Toast["tone"];

/** A read of everything inside a job (ApiDeps.fresh). `snap` absent: nothing is known about what it could not read. */
export interface Fresh {
  state: AppState;
  ctx: WriteCtx;
  snap?: LiveSnapshot;
}

export const NA = (what: string) => `${what} is not available in this version yet.`;
export const CONFIG_NOT_LIVE = "Configuration changes are not live in this version. The configuration shown is the one cases use.";
export const ASK_RMM = "Ask RMM: only RMM can restart a review in this version.";
export const MAILS_NOT_LIVE = " E-mail notifications are not live yet.";
export const NOT_HELD = "You don't hold this role in Kissflow, so you can't work in it here.";

/** What each writable method does, for the "not available" toast when owner C has no writer for it. */
export const WHAT: Record<WritableMethod, string> = {
  createCase: "Creating a case",
  raiseOpenPoint: "Raising an open point",
  reviewResponse: "Deciding on the supplier's answer",
  editOpenPoint: "Editing an open point",
  closeOpenPoint: "Closing an open point",
  recordCriterion: "Recording RMES results",
  addFinding: "Adding a finding",
  closeFinding: "Closing a finding",
  findingToQuery: "Asking the supplier about a finding",
  rmesDecision: "Recording the RMES decision",
  completeReview: "Completing a review",
  addInternalNote: "Internal notes",
  reassignReview: "Reassigning a review",
  reopenReview: "Reopening a review",
  cancelCase: "Cancelling a case",
  addSupplier: "Adding a supplier",
  updateSupplier: "Changing a supplier",
  addContact: "Adding a contact",
  updateContact: "Changing a contact",
  setContactActive: "Deactivating or reactivating a contact",
};

export interface ApiDeps {
  /** The state the screens see now (optimistic state included, the store's toasts in it). */
  state(): AppState;
  acting: Acting;
  /** The write context as of now (client, index of the last load, webhooks, containerOk). */
  ctx(): WriteCtx;
  writers: LiveWriters;
  toast(tone: Tone, text: string): void;
  dismiss(id: string): void;
  optimistic(next: AppState): void;
  /** Puts the job on the serial chain (enqueueJob); the store toasts its finalized result, logs it and shows what it
   *  saved (or reads again). Resolves with that result once the screens show it. */
  enqueue(label: string, job: () => Promise<WriteResult>): Promise<WriteResult>;
  /** Gap 9: everything read again NOW (call it inside a job: it is on the chain already), shown, and given as the
   *  writer's state (no optimistic state) and write context, with the snapshot read (what it could not read again). */
  fresh(): Promise<Fresh>;
  reload(): void;
  /** Switches to a persona the user holds (LiveAppStore → onPersona → reload). */
  setPersona(id: InternalPersonaId): void;
  /** Owner C's liveGuard (DESIGN §6 step 2). Absent: no live pre-check. */
  guard?: (method: WritableMethod, ctx: WriteCtx, state: AppState, args: unknown[]) => string | null;
}

/** The new toasts an action added (by id), the last one that is not a refusal. */
function domainToast(prev: AppState, next: AppState): { tone: Tone; text: string } | undefined {
  const before = new Set(prev.toasts.map((t) => t.id));
  const t = next.toasts.filter((x) => !before.has(x.id) && !x.refusal).at(-1);
  return t ? { tone: t.tone, text: t.text } : undefined;
}

/** A writer's failure as a result (a thrown error included): its cause raw in dev, in plain words in production (the
 *  raw one then in `detail`, for the Writes log). */
export function failedResult(e: unknown, env?: AppEnv): WriteResult {
  const shown = errorFor(env, e);
  const raw = errorText(e);
  return { ok: false, tone: "danger", message: `Not saved: ${shown}`, handoffs: [], warnings: [], ...(shown !== raw ? { detail: raw } : {}) };
}

/**
 * The text and tone the store shows when a write settles: the writer's own message, else the success text (the
 * domain's own toast, else the store's text). A failure keeps the writer's message ("Not saved." when it gave none).
 * A pending hand-off adds nothing (A10, 22 Oct: no system passes it on; the Writes log and the audit row keep
 * "pending"), and handoff.ts never gives "failed" (a POST that fails later is WriteCtx.onHandoffProblem).
 */
export function finalize(r: WriteResult, success: { tone: Tone; text: string }): WriteResult {
  if (!r.ok) return { ...r, tone: r.tone ?? "danger", message: r.message || "Not saved." };
  return { ...r, tone: r.tone ?? success.tone, message: r.message || success.text };
}

/** A hand-off POST that failed after its save went through (WriteCtx.onHandoffProblem; handoff.ts never waits for it):
 *  the store's warning toast. Dev names the hand-off and Kissflow's answer; production says what it means for the
 *  supplier (C13). */
export const handoffProblemText = (code: HandoffCode, why: string, env?: AppEnv) =>
  env === "prod" ? HANDOFF_PROBLEM : `Saved, but its hand-off to the supplier portal (${code}) failed: ${why.trim().replace(/[.\s]+$/, "")}. Diagnostics lists it.`;

/** A mail POST that failed after its save went through (WriteCtx.onMailProblem; write/mail.ts never waits for it): the
 *  store's warning toast. Production says only that the supplier contacts got no e-mail. */
export const mailProblemText = (what: string, why: string, env?: AppEnv) =>
  env === "prod" ? "Saved, but the e-mail to the supplier contacts could not be sent." : `Saved, but the e-mail (${what}) failed: ${why.trim().replace(/[.\s]+$/, "")}.`;

/** Why a job's fresh read cannot decide (gap 9), with the toast's tone; undefined: decide from it. */
export type FreshCheck = (f: Fresh, clicked: WriteCtx) => { tone: Tone; text: string } | undefined;

/**
 * Complete review's checks on its fresh read (gap 9). The read must be one: a part the review gate is decided from that
 * could not be read again (kept from an earlier load, or the case's RMES record without its criteria and findings) would
 * count as "no gap" (load.ts notReadAgain). And the review item must be the one the user acted on: its `_modified_at`
 * in the fresh read must still be the click's (the writer's staleCheck now compares with a read made just before, so
 * it can't see that; our own earlier writes moved the click's stamp along, write/actions.ts updateHeld).
 */
export const reviewGateCheck =
  (caseId: string, dept: ReviewDept): FreshCheck =>
  (f, clicked) => {
    const unread = f.snap ? notReadAgain(f.snap, caseId) : undefined;
    // production does not name the flows (C17)
    if (unread) return { tone: "warning", text: clicked.env === "prod" ? NOT_READ_AGAIN_PLAIN : unread };
    const at = heldReview(clicked, caseId, dept)?.modifiedAt;
    const now = heldReview(f.ctx, caseId, dept)?.modifiedAt;
    if (at && now && at !== now && Date.parse(at) !== Date.parse(now)) return { tone: "danger", text: STALE_TEXT.review };
    return undefined;
  };

// ---------------------------------------------------------------------------------- the store's write jobs

/** Gap 2: the text of a job that was not sent because a job queued before it failed. */
export const NOT_SENT = "Not sent: an earlier change on this page was not saved, so this one was not sent either. Check the screen and try again.";

/** What the store keeps between its write jobs (one per LiveAppStore). */
export interface WriteChain {
  /** Jobs enqueued and not settled: the read after them waits for the last one. */
  pending: number;
  /** Bumped by every failed job (gap 2): a job enqueued before the bump is not sent. */
  failEpoch: number;
  /** Since the last read, a job moved a step, sent a hand-off that writes its item back, or failed: the last job of the
   *  run reads everything again. */
  readOwed: boolean;
}
export const newWriteChain = (): WriteChain => ({ pending: 0, failEpoch: 0, readOwed: false });

/** What a write job needs from the store (LiveAppStore; tests pass their own). */
export interface JobDeps {
  /** The store's one chain: every write and every read, in order (LiveSupplierStore.tsx:229-235). */
  serial<T>(fn: () => Promise<T>): Promise<T>;
  /** The header's "Saving…" counter. */
  saving(delta: number): void;
  /** Logs the settled job (Diagnostics) and toasts its text. */
  report(label: string, r: WriteResult): void;
  /** Bumped by every accepted action's optimistic state. */
  generation(): number;
  dropOptimistic(): void;
  /** Shows the job's read-backs (`saved`, `auditRow`) on the loaded data, without reading anything (load.ts
   *  withSaved); false when it could not, then the run reads everything again. */
  showSaved(r: WriteResult): boolean;
  /** Reads everything again, with the load-time effects (the store's loadNow(true); already on the chain); false when
   *  the read failed (the read stays owed). */
  read(): Promise<boolean>;
  /** Where the screen runs (a thrown job's toast, failedResult). */
  env?: AppEnv;
}

/**
 * One write job on the store's chain (DESIGN §6 steps 5–6, APP-SAVING-GAPS gaps 1, 2 and 6). When it runs: if a job
 * queued before it failed in the meantime, it is not sent (NOT_SENT: it was built on that job's optimistic state, e.g. a
 * Complete review clicked on a criterion result that never reached Kissflow; the portal refuses a task action over
 * unsaved answers, LiveSupplierStore.tsx:324). Otherwise the writer runs. The result is logged and toasted; a failure
 * bumps `failEpoch` and drops the optimistic state (what the screens showed did not reach Kissflow). A save that moved
 * no step (`moved: false`) shows its read-backs at once; a step move, an item-writing hand-off, an unknown `moved` or a
 * failure owes a read of everything, done once after the last queued job (a click during the run waits behind it and
 * does not start a second one); a read that failed, or could not read a part again (load.ts keepUnread), stays owed,
 * so the next job reads again instead of showing its read-backs on the data from before the step move. After the last
 * job the optimistic state goes when no action came after this one's. Resolves with the result once that is on screen
 * (a writer's throw is a failed result, not a rejection).
 */
export function enqueueJob(c: WriteChain, d: JobDeps, label: string, job: () => Promise<WriteResult>): Promise<WriteResult> {
  c.pending++;
  d.saving(1);
  const epoch = c.failEpoch;
  const gen = d.generation();
  return d.serial(async () => {
    const skipped = c.failEpoch !== epoch;
    let r: WriteResult;
    if (skipped) r = { ok: false, tone: "warning", message: NOT_SENT, handoffs: [], warnings: [] };
    else {
      try {
        r = await job();
      } catch (e) {
        r = failedResult(e, d.env);
      }
    }
    c.pending--;
    d.saving(-1); // the write settled; a read after it counts as a read
    d.report(label, r);
    // a job that was not sent wrote nothing: it is no new failure (a job clicked after the failure, on the screen
    // without its optimistic state, still goes, and keeps its own optimistic state)
    if (!r.ok && !skipped) {
      c.failEpoch++;
      d.dropOptimistic();
    }
    if (!r.ok || r.moved !== false || !d.showSaved(r)) c.readOwed = true;
    if (c.pending === 0) {
      if (c.readOwed) {
        c.readOwed = false;
        if (!(await d.read().catch(() => false))) c.readOwed = true;
      } else if (d.generation() === gen) d.dropOptimistic();
    }
    return r;
  });
}

export function createLiveApi(deps: ApiDeps): StoreApi {
  const { acting } = deps;
  const by = acting.me.id;
  const na = (what: string) => deps.toast("warning", NA(what));
  const configNa = () => deps.toast("warning", CONFIG_NOT_LIVE);

  /** What a method that went no further than this page gives a screen that waits for the outcome. */
  const notSaved = () => Promise.resolve(false);

  /**
   * Steps 0–5 for one method. `run` is the pure domain action; its `value` is what the method returns when it went
   * through (an id, true, …). `text` is the store's success text when the domain gave none. Returns that value at once
   * and `saved`: whether the write reached Kissflow (false at once when it was refused here; never rejects), for the
   * screens that keep the user's input until then (gap 6). `ownText`: the domain's toast promises what the live app
   * does not do (m9: cancel → "can be reactivated"). `fresh` (gap 9): the job reads everything again first; `fresh`
   * gets that read and the click's write context and says why it cannot decide (a part not read again, the item
   * changed since the click); otherwise the domain action runs again on it. A refusal there (or by the live guard) is
   * the job's result and nothing is written.
   */
  function write<R>(method: WritableMethod, args: unknown[], run: (s: AppState) => { state: AppState; value: R }, refused: R, text: (prev: AppState, value: R) => string, o: { ownText?: boolean; fresh?: FreshCheck } = {}): { value: R; saved: Promise<boolean> } {
    const no = { value: refused, saved: notSaved() };
    const writer = deps.writers[method];
    if (!writer) {
      na(WHAT[method]);
      return no;
    }
    const prev = deps.state();
    // m7: the domain first, so its own refusal ("fill in the question") is what the user reads
    const r = run(prev);
    if (A.wasRefused(prev, r.state)) {
      const t = r.state.toasts.at(-1);
      if (r.state !== prev && t && t.id !== prev.toasts.at(-1)?.id) deps.toast(t.tone, t.text);
      return no;
    }
    // the write context of the click (gap 4): its index is the load the user acted on, so heldOp and staleCheck compare
    // Kissflow's stamp with what the user saw (a reload that finished before the job runs must not hide a change)
    const ctx = deps.ctx();
    if (!ctx.containerOk) {
      deps.toast("danger", NOT_IN_APP);
      return no;
    }
    const why = deps.guard?.(method, ctx, prev, args);
    if (why) {
      deps.toast("danger", why);
      return no;
    }
    const next = r.state;
    const success = (o.ownText ? undefined : domainToast(prev, next)) ?? { tone: "success" as const, text: text(prev, r.value) };
    deps.optimistic({ ...next, toasts: [], mails: [] });
    const done = deps.enqueue(method, async () => {
      try {
        if (!o.fresh) return finalize(await writer(ctx, prev, next, args), success);
        // gap 9: decide from what Kissflow holds now (a point raised or a finding added by a colleague since the load)
        const f = await deps.fresh();
        const why = o.fresh(f, ctx);
        if (why) return { ok: false, tone: why.tone, message: why.text, handoffs: [], warnings: [] };
        const again = run(f.state).state;
        if (A.wasRefused(f.state, again)) {
          const t = again.toasts.at(-1);
          return { ok: false, tone: t?.tone ?? "danger", message: t?.text || "Not saved.", handoffs: [], warnings: [] };
        }
        const guard = deps.guard?.(method, f.ctx, f.state, args);
        if (guard) return { ok: false, tone: "danger", message: guard, handoffs: [], warnings: [] };
        return finalize(await writer(f.ctx, f.state, again, args), success);
      } catch (e) {
        return failedResult(e, ctx.env);
      }
    });
    return { value: r.value, saved: done.then((x) => x.ok, () => false) };
  }
  type Text = string | ((prev: AppState) => string);
  const textOf = (text: Text) => (prev: AppState) => (typeof text === "string" ? text : text(prev));
  /** A domain action that returns the state: true when it went through. */
  const act = (method: WritableMethod, args: unknown[], fn: (s: AppState) => AppState, text: Text, o: { ownText?: boolean; fresh?: FreshCheck } = {}): boolean =>
    write(method, args, (s) => ({ state: fn(s), value: true }), false, textOf(text), o).value;
  /** The same for a screen that waits for the outcome (gap 6): whether it reached Kissflow. */
  const actSaved = (method: WritableMethod, args: unknown[], fn: (s: AppState) => AppState, text: Text): Promise<boolean> =>
    write(method, args, (s) => ({ state: fn(s), value: true }), false, textOf(text)).saved;

  const state = deps.state();
  return {
    state,
    persona: acting.persona,
    me: acting.me,
    setPersona: (id) => {
      if (id === acting.personaId) return;
      if ((deps.ctx().identity.personas as string[]).includes(id)) deps.setPersona(id as InternalPersonaId);
      else deps.toast("danger", NOT_HELD);
    },
    reset: () => deps.reload(),
    notify: (tone, text) => deps.toast(tone, text),
    dismissToast: (id) => deps.dismiss(id),

    createCase: (input) => {
      const w = write(
        "createCase",
        [input],
        (s) => {
          const r = A.createCase(s, by, input);
          // a refusal comes back with id "" and the domain's toast
          return { state: r.id || A.wasRefused(s, r.state) ? r.state : A.refuse(s, "The case could not be created."), value: r.id };
        },
        "",
        (_prev, id) => `${id} created and the supplier contacts invited.`,
      );
      // gap 6: the new case's id once it reached Kissflow ("" when it did not), so New case opens it only then
      return w.saved.then((ok) => (ok ? w.value : ""));
    },
    updateCaseContacts: () => (na("Changing the case contacts"), false),
    saveConfig: () => na("Changing the supplier's answers"),
    submitMetadata: () => na("Changing the supplier's answers"),
    extendScope: () => na("Adding a section to the scope"),
    setAnswer: () => na("Changing the supplier's answers"),
    setComponents: () => na("Changing the supplier's answers"),
    setJustification: () => na("Changing the supplier's answers"),
    uploadDocument: () => (na("Uploading documents"), ""),
    confirmCompleteness: () => na("Confirming completeness"),

    raiseOpenPoint: (id, input) => actSaved("raiseOpenPoint", [id, input], (s) => A.raiseOpenPoint(s, by, id, input), "Sent to the supplier as a task."),
    supplierRespond: () => na("Answering an open point"),
    reviewResponse: (id, op, d, t) =>
      actSaved("reviewResponse", [id, op, d, t], (s) => A.reviewResponse(s, by, id, op, d, t), d === "accept" ? "Answer accepted." : d === "return" ? "Returned to the supplier." : "Closed as not accepted."),
    editOpenPoint: (id, op, patch) => act("editOpenPoint", [id, op, patch], (s) => A.editOpenPoint(s, by, id, op, patch), "Open point changed."),
    closeOpenPoint: (id, op, reason) => act("closeOpenPoint", [id, op, reason], (s) => A.closeOpenPoint(s, by, id, op, reason), "Open point closed."),
    recordCriterion: (id, c, r, t) => void act("recordCriterion", [id, c, r, t], (s) => A.recordCriterion(s, by, id, c, r, t), "RMES result saved."),
    addFinding: (id, c, t, bl) => actSaved("addFinding", [id, c, t, bl], (s) => A.addFinding(s, by, id, c, t, bl), "Finding added."),
    findingToQuery: (id, f, q, d) => actSaved("findingToQuery", [id, f, q, d], (s) => A.findingToQuery(s, by, id, f, q, d), "Sent to the supplier as a task."),
    closeFinding: (id, f) => void act("closeFinding", [id, f], (s) => A.closeFinding(s, by, id, f), "Finding closed."),
    rmesDecision: (id, d, dec, r) => void act("rmesDecision", [id, d, dec, r], (s) => A.rmesDecision(s, by, id, d, dec, r), "Decision recorded."),
    // gap 9: its job reads everything again first (Kissflow's Review_Gate trusts the counts the writer sends)
    completeReview: (id, d, opts) => void act("completeReview", [id, d, opts], (s) => A.completeReview(s, by, id, d, nowIso(), opts), "Review completed.", { fresh: reviewGateCheck(id, d) }),
    reopenReview: (id, d, r) => {
      // DESIGN §1.2: only RMM can create the next round of a review (Init on CIQ Review)
      if (d !== "RMM") return deps.toast("warning", ASK_RMM);
      void act("reopenReview", [id, d, r], (s) => A.reopenReview(s, by, id, d, r), "Review reopened.");
    },
    reassignReview: (id, d, to, r) => act("reassignReview", [id, d, to, r], (s) => A.reassignReview(s, by, id, d, to, r), "Review reassigned."),
    finalRelease: () => na("The final release"),
    // the domain says it "can be reactivated within 12 months"; reactivation is not available live (m9)
    cancelCase: (id, r) => void act("cancelCase", [id, r], (s) => A.cancelCase(s, by, id, r), `${id} cancelled.`, { ownText: true }),
    reactivateCase: () => (na("Reactivating a case"), false),
    reportChange: () => (na("Reporting a change"), false),
    addInternalNote: (id, t, sec) =>
      actSaved("addInternalNote", [id, t, sec], (s) => A.addInternalNote(s, by, id, t, sec), (prev) =>
        // the domain would mail the mentioned colleagues; live, mails are not sent yet (DESIGN §1.2)
        mentionRecipients(prev, { by, mentions: parseMentions(prev, t) }).length ? `Note added.${MAILS_NOT_LIVE}` : "Note added.",
      ),

    addSupplier: (input) =>
      write(
        "addSupplier",
        [input],
        (s) => {
          const r = M.addSupplier(s, by, input);
          return { state: r.state, value: r.id };
        },
        null,
        () => "Supplier added.",
      ).value,
    updateSupplier: (sid, patch) => act("updateSupplier", [sid, patch], (s) => M.updateSupplier(s, by, sid, patch), "Supplier saved."),
    addContact: (sid, input) =>
      write(
        "addContact",
        [sid, input],
        (s) => {
          const r = M.addContact(s, by, sid, input);
          return { state: r.state, value: r.id };
        },
        null,
        () => "Contact added.",
      ).value,
    updateContact: (uid, patch) => act("updateContact", [uid, patch], (s) => M.updateContact(s, by, uid, patch), "Contact saved."),
    setContactActive: (uid, active, rep) => act("setContactActive", [uid, active, rep], (s) => M.setContactActive(s, by, uid, active, rep), "Contact saved."),

    markMailRead: () => na("The inbox"),
    markAllMailsRead: () => na("The inbox"),
    runReminders: () => (na("Running reminders"), 0),

    publishTemplateV2: () => configNa(),
    setOwnership: () => configNa(),
    updateReminder: () => configNa(),
    createDraft: () => (configNa(), false),
    discardDraft: () => (configNa(), false),
    upsertRule: () => (configNa(), null),
    deleteRule: () => (configNa(), false),
    upsertSection: () => (configNa(), null),
    retireSection: () => (configNa(), false),
    restoreSection: () => (configNa(), false),
    upsertField: () => (configNa(), null),
    moveField: () => (configNa(), false),
    removeField: () => (configNa(), false),
    validateDraft: () => validateDraft(deps.state()),
    publishDraft: () => (configNa(), false),
  };
}
