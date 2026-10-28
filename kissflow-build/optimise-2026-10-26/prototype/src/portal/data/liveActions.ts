// The supplier's actions as live portal writes, as the signed-in contact, through the SDK only (page fetch writes get
// 403). Every write targets one of the contact's open tasks and goes through its CURRENT activity instance; every write
// is read back and re-applied (≤3) when Kissflow lost it (no locking, two writes within ~0.1 s lose one: plan v5 P3).
// The caller (LiveSupplierStore) runs these on one serial chain and reloads afterwards.
//
// Writes, by action (plan v5 §3.1–§3.3):
//   answers          CIQP Request: the touched JSON fields + Scope_JSON + Requested_Docs_JSON + Answers_Rev …
//   upload           kf.client.uploadFile → Supplier_Files (+ the new file) → an Uploads row → Answers_Rev + 1
//   completeness     CIQP Request: Completeness_* → submit "Supplier: fill in the CIQ"
//   answer a query   (upload) → CIQP Query: Response_* + Supplier_Responsible_Email → submit "Supplier: respond"
//   final release    CIQP Request at "Supplier: give the final release" (16 Oct): Release_By_Name + Release_By_Email +
//                    Release_By_Role + Release_At (REQ-PROC-042; e-mail and role since 21 Oct) → submit
//                    (an open CIQP Final Release from before 16 Oct: Supplier_Confirm + Confirmed_* → submit)
//   release moves    on load (moveAtReleaseSteps, Thomas 21 Oct): submit "keep the CIQ up to date" when Release_Flag is
//                    "Requested", submit "give the final release" when it is "Reopened"; no field write, no hand-off
//   report a change  CIQP Request: Change_Report_Text, _Rev + 1, _By_Email, _At (completed requests only; since 20 Oct at
//                    "view the released CIQ")
//   remove a file    the Uploads row: Upload_Removed_At + Upload_Removed_By_Email (soft delete, plan v6 D-12)
// Thomas, 15 Oct: while the final release is requested the questionnaire is locked (Request_Locked "Yes", label
// "Awaiting your final release"): answers, uploads and their signals are refused before any write. Since 16 Oct the
// request itself is at "give the final release", where Kissflow keeps every answer field read-only.
import { BUILTIN_SECTIONS, fieldOf } from "@/domain/catalog";
import { isSlotKey } from "@/domain/requestedDocs";
import { completenessBlockers, departmentsForScope, releaseBlockers } from "@/domain/selectors";
import type { CiqCase, Confirmation, DocKind } from "@/domain/types";
import { inferDocKind } from "@/features/supplier/lib";
import { FILES_FIELD, STEPS, UPLOADS_TABLE, mailHookFor, webhooksFor, type FlowKey, type StepKey, type Webhooks } from "../kf/portal";
import { errorText, kfDateTime, type KfData, type KfFileMeta } from "../kf/sdk";
import { RELEASE_LOCKED_TEXT } from "@/domain/permissions";
import { LOCKED_TEXT, LockedError, RELEASE_LOCKED_SAVE_TEXT, isAwaitingRelease, isClosedRequest, isReopened, isWriteLocked, lockedText, saveRequest, type AnswerPatch, type Who } from "./answers";
import type { PortalClient } from "./client";
import { attachmentsOf, caseOfRequest, documentsJsonOf, emptyNotes, phaseOf, requestStepOf, type CaseBundle, type CaseExtra, type Loaded, type LocalNotes, type SupplierSide } from "./map";
import { childRows, num, str, type RawItem } from "./raw";
import { requestedDocRows, scopeRows } from "./scope";

export interface Task {
  act: string;
  step: StepKey;
}

export interface LiveData {
  bundles: CaseBundle[];
  /** The contact's open tasks: item id → activity instance and step. */
  tasks: Map<string, Task>;
  side: SupplierSide;
  loadedAt: string;
}

export const NOT_YOURS = "This item is not one of your open tasks any more (it may have been completed or withdrawn). Reload the page to see its current state.";
/** Beiersdorf reopened the review after the page loaded: no release is written; the reload returns the request to editing. */
export const REOPENED_TEXT = "Beiersdorf has reopened the review, so your final release was not given and nothing was saved. The page reloads with the questionnaire open for your changes again.";

/** Drop empty values: Kissflow rejects "" for typed fields (master.md §3.5). */
const compact = (o: KfData): KfData => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== ""));

export interface ActionOpts {
  now?: () => string;
  wait?: (ms: number) => Promise<void>;
  /** What this page did that the service hasn't written back yet (kept by the store across reloads). */
  local?: LocalNotes;
  /** The hand-off webhooks (plan v6 §4.1); default: the account's, on the Kissflow host around the page when it is
   *  known, else as relative paths (portal.ts webhooksFor). An empty URL sends nothing. */
  webhooks?: Partial<Webhooks>;
  /** Shorthand for `webhooks.requestChanged`. */
  requestChangedUrl?: string;
  /** Told when a hand-off could not be sent (the action itself succeeded). */
  onSyncProblem?: (text: string) => void;
}

export function liveActions(client: PortalClient, data: LiveData, me: Who, opts: ActionOpts = {}) {
  const now = opts.now ?? (() => new Date().toISOString());
  const wait = opts.wait ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const local = opts.local ?? emptyNotes();
  const hooks: Webhooks = { ...webhooksFor(client.accountId, client.parentHost), ...opts.webhooks, ...(opts.requestChangedUrl !== undefined ? { requestChanged: opts.requestChangedUrl } : {}) };
  /** One hand-off (plan v6 §4.1): only the id of the item this screen acted on, plus an idempotency key; the integration
   *  reads the rest from Kissflow. Sent after the action succeeded and never blocks it; a failure is only reported. */
  const handoff = (kind: keyof Webhooks, payload: Record<string, string>, problem: (why: string) => string) => {
    const url = hooks[kind];
    if (!url) return;
    const idempotencyKey = `HO-${kind}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    void client.postWebhook(url, { ...payload, idempotencyKey }).catch((e) => opts.onSyncProblem?.(problem(e instanceof Error ? e.message : String(e))));
  };
  const TELL = "Please let your Beiersdorf contact know.";
  /** request.changed: the request's supplier data onto its app case. A failed one heals with the next save, except after
   *  a change report (no save is possible there), which says so. */
  const requestChanged = (requestId: string, problem: (why: string) => string = (why) => `Saved, but Beiersdorf's copy was not updated yet (${why}). It updates with your next save.`) =>
    handoff("requestChanged", { portalRequestItemId: requestId }, problem);
  /** 22 Oct (Thomas): e-mails through the portal's "Mail Integration - Thomas" ({To, Subject, Body}); best effort, after the
   *  action succeeded, never blocking it. No URL (no token in the build) or no address: nothing is sent. */
  const esc = (v: string) => v.replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]!);
  const sendMail = (to: string[], subject: string, html: string) => {
    const url = mailHookFor(client.accountId, client.parentHost);
    const list = [...new Set(to.map((e) => e.trim()).filter((e) => /^[^@\s]+@[^@\s]+$/.test(e)))];
    if (!url || !list.length) return;
    void client.postWebhook(url, { To: list.join(", "), Subject: subject, Body: `<html><body>${html}<p>Sent automatically by the CIQ supplier portal.</p></body></html>` }).catch(() => {});
  };
  /** "Data changed" (one mail per change, Thomas): only once the completeness is confirmed; to the case's RMM contact. */
  const changeMail = (b: CaseBundle, what: string) => {
    const r = b.request;
    if (!r || str(r, "Completeness_Confirm") !== "Confirmed") return;
    const code = str(r, "Case_Code") || b.code, trade = str(r, "Trade_Name");
    sendMail([str(r, "BDF_Contact_Email")], `${code}: the supplier changed the CIQ`,
      `<p>${esc(me.name || "The supplier")} changed the CIQ of ${esc(code)}${trade ? ` (${esc(trade)})` : ""}: ${esc(what)}.</p><p>Please open CIQ Digital to see the change.</p>`);
  };
  /** Submits a step, then posts its hand-off. A submit that went through although its answer was lost (the 30 s bound)
   *  must still hand off, or Beiersdorf never learns of it: when the submit fails, `moved()` looks for the item at the
   *  step(s) after it among my tasks, and only a move proves it went through. Without a move the submit's error stands. */
  async function submitAndHandOff(flow: FlowKey, id: string, act: string, moved: () => Promise<boolean>, kind: keyof Webhooks, payload: Record<string, string>, problem: (why: string) => string) {
    try {
      await client.submit(flow, id, act);
    } catch (e) {
      const went = await moved().catch(() => false);
      if (!went) throw e;
    }
    handoff(kind, payload, problem);
  }
  const atStep = async (flow: FlowKey, id: string, steps: StepKey[]) => {
    for (const k of steps) if ((await client.listTasks(flow, STEPS[k].activity)).some((r) => r._id === id)) return true;
    return false;
  };
  /** Every DateTime written to Kissflow goes without milliseconds (Kissflow rejects them; CAFM, verified live). */
  const stamp = () => kfDateTime(new Date(now()));

  const bundleOf = (caseId: string): CaseBundle => {
    const b = data.bundles.find((x) => x.code === caseId);
    if (!b?.request) throw new Error(`Request ${caseId} is not available to you.`);
    return b;
  };
  const extraOf = (caseId: string): CaseExtra => {
    const x = data.side.extras.get(caseId);
    if (!x) throw new Error(`Request ${caseId} is not available to you.`);
    return x;
  };
  const taskOf = (id: string | undefined, steps: StepKey[]): Task => {
    const t = id ? data.tasks.get(id) : undefined;
    if (!t || !steps.includes(t.step)) throw new Error(NOT_YOURS);
    return t;
  };

  /** Read and write one task item; the read is always the full item through the task. */
  const io = (flow: FlowKey, id: string, act: string) => ({
    read: async (): Promise<RawItem> => {
      const full = await client.getFull(flow, id, act);
      if (!full) throw new Error("This item can't be read back, so nothing was saved.");
      return full;
    },
    write: (d: KfData) => client.update(flow, id, act, d),
  });

  /** The request task of a case: its io, step and the bundle. A request at its release step takes no change. */
  function requestOf(caseId: string, steps: StepKey[] = ["fill", "keep"]) {
    const b = bundleOf(caseId);
    if (b.step === "release" && !steps.includes("release")) throw new LockedError(RELEASE_LOCKED_SAVE_TEXT);
    if (b.step === "released" && !steps.includes("released")) throw new LockedError(LOCKED_TEXT);
    const t = taskOf(b.request!._id, steps);
    return { b, t, rq: io("request", b.request!._id, t.act) };
  }

  /** A supplier change on a request this page loaded at the final release (its release task is open) is refused at
   *  once, also before the service's lock reaches the request item (Thomas, 15 Oct). */
  const refuseAtRelease = (b: CaseBundle) => {
    if (phaseOf(b, local) === "final-release") throw new LockedError(RELEASE_LOCKED_SAVE_TEXT);
  };

  /** Scope_JSON + Requested_Docs_JSON for the request as it will be after the write (supplier wording, no rule ids). */
  const derived = (b: CaseBundle, after: RawItem): KfData => {
    const { c, config } = caseOfRequest(b, after, me, local);
    return { Scope_JSON: JSON.stringify(scopeRows(c.scope)), Requested_Docs_JSON: JSON.stringify(requestedDocRows(c, config)) };
  };

  /** Writes `data`, reads back, re-applies until `holds(back)` (≤3). */
  async function writeVerified(x: { read(): Promise<RawItem>; write(d: KfData): Promise<void> }, data: (cur: RawItem) => KfData, holds: (back: RawItem) => boolean, what: string) {
    for (let i = 0; i < 3; i++) {
      const cur = await x.read();
      await x.write(data(cur));
      if (holds(await x.read())) return;
    }
    throw new Error(`${what} could not be saved: Kissflow did not keep it after 3 attempts. Please try again.`);
  }

  /** Merges a patch into the request (answers, metadata, rows, justifications); resolves with the request as read
   *  back after the save, so the page can show it without reloading every task. */
  async function patchRequest(caseId: string, patch: AnswerPatch): Promise<RawItem> {
    const { b, rq } = requestOf(caseId);
    refuseAtRelease(b);
    const saved = await saveRequest(rq, patch, me, stamp, (doc, cur) =>
      derived(b, { ...cur, Config_Answers_JSON: JSON.stringify(doc.config), Answers_JSON: JSON.stringify(doc.answers), Justifications_JSON: JSON.stringify(doc.justifications), ...(doc.components ? { Components_JSON: JSON.stringify(doc.components) } : {}) }),
    );
    requestChanged(b.request!._id);
    changeMail(b, "updated answers");
    return saved.item;
  }

  /** The service's change signal for a write that holds no answer (an upload): Answers_Rev + 1, verified. */
  async function bumpRev(x: ReturnType<typeof io>) {
    let want = 0;
    await writeVerified(
      x,
      (cur) => {
        if (isWriteLocked(cur)) throw new LockedError(lockedText(cur));
        const at = stamp();
        want = (num(cur, "Answers_Rev") ?? 0) + 1;
        // Documents_JSON follows the Uploads rows as just read (plan v6 §4.2)
        return { Answers_Rev: want, Answers_Changed_At: at, Answers_Changed_By_Email: me.email, Editing_By: me.email, Editing_Since: at, Documents_JSON: documentsJsonOf(cur) };
      },
      (back) => (num(back, "Answers_Rev") ?? 0) >= want && str(back, "Documents_JSON") === documentsJsonOf(back),
      "The upload notice",
    );
  }

  /**
   * Stores a file: kf.client.uploadFile, then the file is added to Supplier_Files (the current files + the new one:
   * an update replaces the value), then its Uploads row (where it belongs in the questionnaire), each read back.
   * `signal`: bump Answers_Rev afterwards so the service mirrors it (not for a query answer: the answer carries it).
   */
  async function uploadDocument(caseId: string, doc: { name: string; kind: DocKind; sectionId: string; fieldId?: string }, file: File, signal = true): Promise<{ uploadId: string; attachmentId: string }> {
    const { b, rq } = requestOf(caseId);
    refuseAtRelease(b);
    const cur = await rq.read();
    if (isWriteLocked(cur)) throw new LockedError(lockedText(cur));
    const meta: KfFileMeta = await client.uploadFile(file);
    const attachmentId = String(meta.id ?? "");
    if (!attachmentId) throw new Error(`Kissflow stored ${file.name} without an id, so it can't be added to the questionnaire.`);
    const has = (it: RawItem) => attachmentsOf(it).some((f) => String(f.id ?? "") === attachmentId);
    await writeVerified(rq, (cur) => ({ [FILES_FIELD]: has(cur) ? attachmentsOf(cur) : [...attachmentsOf(cur), meta] }), has, `${file.name}`);
    const uploadId = `UP-${stamp().replace(/\D/g, "")}-${Math.random().toString(36).slice(2, 7)}`;
    const c = data.side.cases.find((x) => x.id === b.code);
    const sectionId = (doc.fieldId && !isSlotKey(doc.fieldId) ? fieldOf(doc.fieldId, c?.templateVersion, data.side.config)?.sectionId : undefined) ?? doc.sectionId;
    const row = compact({ Upload_Id: uploadId, Upload_Section_Key: sectionId, Upload_Field_Key: doc.fieldId, Upload_Doc_Kind: doc.kind, Upload_File_Name: meta.name || file.name, Uploaded_By_Email: me.email, Uploaded_At: stamp(), Upload_Attachment_Id: attachmentId });
    const stored = async () => {
      for (let i = 0; i < 3; i++) {
        const full = await rq.read().catch(() => null);
        if (childRows(full ?? undefined, UPLOADS_TABLE, "Upload_Id").some((r) => r.Upload_Id === uploadId)) return true;
        await wait(1000);
      }
      return false;
    };
    let ok = false;
    for (let attempt = 0; attempt < 3 && !ok; attempt++) {
      await client.addChildRow("request", b.request!._id, data.tasks.get(b.request!._id)!.act, UPLOADS_TABLE, row);
      ok = await stored();
    }
    if (!ok) throw new Error(`${file.name} was stored, but Kissflow did not keep its place in the questionnaire. Please try again.`);
    if (signal) await bumpRev(rq);
    else await writeVerified(rq, (cur) => ({ Documents_JSON: documentsJsonOf(cur) }), (back) => str(back, "Documents_JSON") === documentsJsonOf(back), "The file list");
    requestChanged(b.request!._id);
    changeMail(b, "uploaded a document");
    return { uploadId, attachmentId };
  }

  const contactOf = (caseId: string) => {
    const x = extraOf(caseId);
    const lower = (s?: string) => (s ?? "").trim().toLowerCase();
    return x.contacts.find((k) => (k.id && k.id === me.id) || (k.email && lower(k.email) === lower(me.email)) || (!k.id && !k.email && k.name === me.name));
  };
  /** B-11: only a contact who may confirm confirms and releases. Unknown contacts list: allowed (Kissflow assigned it). */
  const mayConfirm = (caseId: string) => {
    const x = extraOf(caseId);
    if (!x.contacts.length) return true;
    const k = contactOf(caseId);
    return !!k && k.mayConfirm !== false;
  };
  const MAY_NOT = "You can fill in this questionnaire, but only a colleague who may confirm can confirm it or give the final release.";
  const roleOf = (caseId: string) => contactOf(caseId)?.role || "Supplier contact";

  /**
   * Removes a file from the questionnaire (plan v6 D-12): its Uploads row gets Upload_Removed_At and
   * Upload_Removed_By_Email, the screens stop listing it, and the row and the file stay in Kissflow for the audit.
   * Only the contact who uploaded it, and only while the questionnaire is editable.
   */
  async function removeDocument(caseId: string, uploadId: string): Promise<void> {
    const { b, t, rq } = requestOf(caseId);
    refuseAtRelease(b);
    const cur = await rq.read();
    if (isWriteLocked(cur)) throw new LockedError(lockedText(cur));
    const rows = childRows(cur, UPLOADS_TABLE, "Upload_Id").filter((r) => str(r, "Upload_Id") === uploadId && !str(r, "Upload_Removed_At"));
    if (!rows.length) {
      if (childRows(cur, UPLOADS_TABLE, "Upload_Id").some((r) => str(r, "Upload_Id") === uploadId)) return; // already removed
      throw new Error("This file is no longer on the questionnaire. Reload to see the current list.");
    }
    const lower = (s: string) => s.trim().toLowerCase();
    if (rows.some((r) => lower(str(r, "Uploaded_By_Email")) !== lower(me.email))) throw new Error("Only the colleague who uploaded this file can remove it.");
    const kase = data.side.cases.find((c) => c.id === b.code);
    if (kase?.openPoints.some((p) => p.status !== "closed" && p.thread.some((m) => m.documentId === uploadId))) throw new Error("This file answers a question Beiersdorf has not closed yet, so it can't be removed. Send a new file with your answer instead.");
    const data2 = { Upload_Removed_At: stamp(), Upload_Removed_By_Email: me.email };
    const removed = async () => {
      for (let i = 0; i < 3; i++) {
        const full = await rq.read().catch(() => null);
        const left = childRows(full ?? undefined, UPLOADS_TABLE, "Upload_Id").filter((r) => str(r, "Upload_Id") === uploadId);
        if (left.length && left.every((r) => str(r, "Upload_Removed_At"))) return true;
        await wait(800);
      }
      return false;
    };
    const rowIds = rows.map((r) => str(r, "_id"));
    if (rowIds.some((id) => !id)) throw new Error("Kissflow listed this file without its row id, so it can't be removed. Reload and try again.");
    for (const rowId of rowIds) await client.updateChildRow("request", b.request!._id, t.act, UPLOADS_TABLE, rowId, data2);
    if (!(await removed())) {
      // the form route did not keep it: the child-table delta through the item update, once
      await client.update("request", b.request!._id, t.act, { [`Table::${UPLOADS_TABLE}`]: rowIds.map((rowId) => ({ _id: rowId, ...data2 })) });
      if (!(await removed())) throw new Error("The file could not be removed: Kissflow did not keep the change. Please try again.");
    }
    await bumpRev(rq); // Answers_Rev + Documents_JSON without the removed file
    requestChanged(b.request!._id);
    changeMail(b, "removed a document");
  }

  return {
    patchRequest,
    uploadDocument,
    removeDocument,

    /** B-09/B-10/B-11: zero blockers on the freshly read request and a contact who may confirm; then the
     *  Completeness_* fields (read back) and the submit of "Supplier: fill in the CIQ". */
    async confirmCompleteness(caseId: string): Promise<void> {
      const { b, t, rq } = requestOf(caseId, ["fill"]);
      if (!mayConfirm(caseId)) throw new Error(MAY_NOT);
      const fresh = await rq.read();
      if (isWriteLocked(fresh)) throw new LockedError(lockedText(fresh));
      const { c, config } = caseOfRequest(b, fresh, me, local);
      const blockers = completenessBlockers(c, config);
      if (blockers.length) throw new Error(`${blockers.length} item${blockers.length === 1 ? "" : "s"} must be completed or justified first. Use “Check completeness” to see ${blockers.length === 1 ? "it" : "them"}.`);
      const at = stamp();
      // 22 Oct (load-time redesign): the departments whose review the confirmation starts, as the app computes them; the
      // completeness integration (I-2) copies them to the case and creates their reviews (plus RMM's own)
      // the portal does not read OWN:current: the built-in section owners (the app's own default when that row is unread)
      const ownership = Object.fromEntries(BUILTIN_SECTIONS.map((x) => [x.id, { lead: x.lead, co: [...x.co] }]));
      const depts = departmentsForScope(c.scope ?? [], ownership).filter((d) => d !== "RMM");
      const fields: KfData = { Completeness_Confirm: "Confirmed", Completeness_By_Name: me.name, Completeness_By_Email: me.email, Completeness_By_Role: roleOf(caseId), Completeness_At: at, Review_Depts: depts.join(",") };
      await writeVerified(rq, (cur) => ({ ...fields, ...derived(b, cur) }), (back) => str(back, "Completeness_Confirm") === "Confirmed" && str(back, "Completeness_By_Email") === me.email, "Your confirmation");
      // I-2: the confirmation and the answers onto the app case, which moves on to Beiersdorf's review
      const rid = b.request!._id;
      await submitAndHandOff("request", rid, t.act, () => atStep("request", rid, ["keep"]), "completenessConfirmed", { portalRequestItemId: rid }, (why) => `Your confirmation is saved, but it has not reached Beiersdorf yet (${why}). ${TELL}`);
    },

    /** An answer to an open question; with a file, the file is stored in the questionnaire at the item the question
     *  refers to first and the answer references it (Upload_Id + Upload_Attachment_Id). Nothing is sent if that fails. */
    async supplierRespond(caseId: string, opId: string, input: { text: string; cannotProvide?: boolean; documentName?: string; file?: File }, c?: CiqCase): Promise<void> {
      const x = extraOf(caseId);
      const qid = x.queryOf[opId];
      const t = taskOf(qid, ["respond"]);
      const kase = c ?? data.side.cases.find((k) => k.id === caseId);
      const op = kase?.openPoints.find((p) => p.id === opId);
      let refs: string | undefined;
      if (input.file) {
        const f = op?.ref.fieldId ? fieldOf(op.ref.fieldId, kase?.templateVersion, data.side.config) : undefined;
        const up = await uploadDocument(caseId, { name: input.file.name, kind: f && f.type === "file" ? inferDocKind(f) : "Other", sectionId: op?.ref.sectionId ?? "GEN", fieldId: op?.ref.fieldId }, input.file, false);
        refs = JSON.stringify([{ uploadId: up.uploadId, attachmentId: up.attachmentId, fileName: input.file.name, sectionKey: op?.ref.sectionId, fieldKey: op?.ref.fieldId }]);
      }
      const kind = input.cannotProvide ? "Cannot provide" : input.file || input.documentName ? "Document" : op?.kind === "additional-part" ? "Additional part completed" : "Answer";
      const fields = compact({ Response_Kind: kind, Response_Text: input.text, Response_Doc_Refs_JSON: refs, Supplier_Responsible_Email: me.email });
      const q = io("query", qid!, t.act);
      await writeVerified(q, () => fields, (back) => str(back, "Response_Kind") === kind && str(back, "Response_Text") === input.text, "Your answer");
      // the question as the supplier can still read it (after the submit its query is no longer theirs): for the mail
      const qi = await q.read().catch(() => null);
      // I-4: the answer onto Beiersdorf's open point. A query ends at its respond step, so "moved" = no longer my task there
      await submitAndHandOff("query", qid!, t.act, async () => !(await atStep("query", qid!, ["respond"])), "queryAnswered", { portalQueryItemId: qid! }, (why) => `Your answer is sent, but it has not reached Beiersdorf yet (${why}). ${TELL}`);
      local.answers.set(opId, { id: `${opId}-local`, at: now(), by: me.id, side: "supplier", text: input.text, action: input.cannotProvide ? "cannot-provide" : "answered" });
      // 22 Oct (Thomas): the raiser and the RMM get an e-mail through "Mail Integration - Thomas"; best effort, after the
      // answer is saved and handed off (a failed mail never undoes the answer)
      void (async () => {
        const rqi = bundleOf(caseId).request;
        const code = str(rqi ?? {}, "Case_Code") || caseId, trade = str(rqi ?? {}, "Trade_Name");
        const question = str(qi ?? {}, "Question_Text");
        sendMail([str(qi ?? {}, "Raised_By_Email"), str(rqi ?? {}, "BDF_Contact_Email")], `${code}: the supplier answered your question`,
          `<p>${esc(me.name || "The supplier")} answered the question on ${esc(code)}${trade ? ` (${esc(trade)})` : ""}.</p>`
          + (question ? `<p><b>Question:</b> ${esc(question)}</p>` : "") + `<p><b>Answer (${esc(kind)}):</b> ${esc(input.text)}</p><p>Please open CIQ Digital to review the answer.</p>`);
      })().catch(() => {});
    },

    /** B-33 first (on the freshly read request), then who released and when, and the submit of the release step. */
    async finalRelease(caseId: string): Promise<void> {
      const b = bundleOf(caseId);
      const x = extraOf(caseId);
      const t = taskOf(x.releaseId, ["release"]);
      if (!mayConfirm(caseId)) throw new Error(MAY_NOT);
      if (x.releaseId === b.request!._id) {
        // 16 Oct: the request's own "give the final release" step. Who released (name, e-mail, role: REQ-PROC-042; the
        // e-mail and role fields since 21 Oct) and when are its only writable fields; the submit holds the request at
        // "view the released CIQ" (Release_Flag not "Reopened": the go-to is skipped).
        const rq = io("request", b.request!._id, t.act);
        const fresh = await rq.read();
        // reopened since the page loaded (Release_Flag "Reopened", plan v6 D-10): no release on it; the reload's move
        // submits the step without the release fields, and the go-to returns the request to editing
        if (isReopened(fresh)) throw new Error(REOPENED_TEXT);
        const { c, config } = caseOfRequest(b, fresh, me, local);
        const blockers = releaseBlockers(c, config);
        if (blockers.length) throw new Error(`The final release is not possible yet: ${blockers.map((k) => k.supplierLabel ?? k.label).slice(0, 3).join("; ")}${blockers.length > 3 ? ` (and ${blockers.length - 3} more)` : ""}.`);
        const at = stamp();
        const role = roleOf(caseId);
        const given: KfData = { Release_By_Name: me.name, Release_By_Email: me.email, Release_By_Role: role, Release_At: at };
        await writeVerified(rq, () => given, (back) => str(back, "Release_By_Name") === me.name && str(back, "Release_By_Email") === me.email && !!str(back, "Release_At"), "Your final release");
        // I-7: the release onto the app case, which completes. After its release step the request is held at "view the
        // released CIQ" (or back at "keep up to date" when Beiersdorf reopened it meanwhile)
        const rid = b.request!._id;
        await submitAndHandOff("request", rid, t.act, () => atStep("request", rid, ["released", "keep"]), "releaseGiven", { portalRequestItemId: rid }, (why) => `Your final release is saved, but it has not reached Beiersdorf yet (${why}). ${TELL}`);
        local.releases.set(caseId, { type: "final-release", by: me.id, name: me.name, email: me.email, role, at, reviewVersion: 1 });
        // the request has ended, so the next reload no longer lists it: keep it on this page, released and read-only
        local.released.set(caseId, { ...b, step: undefined, queries: [], releases: [], request: { ...fresh, ...given, Case_Phase_Label: "Completed", Request_Locked: "Yes" } });
        return;
      }
      const reqTask = data.tasks.get(b.request!._id);
      const fresh = reqTask ? await io("request", b.request!._id, reqTask.act).read() : b.request!;
      // the lock of the release step itself does not stop the release (Thomas, 15 Oct); a closed request does
      const now = phaseOf({ ...b, request: fresh }, local);
      if (now === "completed" || now === "cancelled") throw new LockedError(LOCKED_TEXT);
      const { c, config } = caseOfRequest(b, fresh, me, local);
      const blockers = releaseBlockers(c, config);
      if (blockers.length) throw new Error(`The final release is not possible yet: ${blockers.map((k) => k.supplierLabel ?? k.label).slice(0, 3).join("; ")}${blockers.length > 3 ? ` (and ${blockers.length - 3} more)` : ""}.`);
      const at = stamp();
      const role = roleOf(caseId);
      const fields: KfData = { Supplier_Confirm: "Confirmed", Confirmed_By_Name: me.name, Confirmed_By_Email: me.email, Confirmed_By_Role: role, Confirmed_At: at };
      const rel = io("finalRelease", x.releaseId!, t.act);
      await writeVerified(rel, () => fields, (back) => str(back, "Supplier_Confirm") === "Confirmed" && str(back, "Confirmed_By_Email") === me.email, "Your final release");
      await client.submit("finalRelease", x.releaseId!, t.act);
      const confirmation: Confirmation = { type: "final-release", by: me.id, name: me.name, email: me.email, role, at, reviewVersion: 1 };
      local.releases.set(caseId, confirmation);
    },

    /**
     * B-36 "Report a change" on a completed request: Change_Report_Text, Change_Report_Rev + 1, Change_Report_By_Email
     * and Change_Report_At together, read back. Refused while the previous report has no receipt yet (the service
     * answers within about a minute), so a quick second report never overwrites the first.
     */
    async reportChange(caseId: string, text: string): Promise<void> {
      const { b, rq } = requestOf(caseId, ["keep", "released"]);
      // at "view the released CIQ" (20 Oct) the request is released by Kissflow's own step, whatever its label says
      const releasedStep = b.step === "released";
      const x = extraOf(caseId);
      void x; // 22 Oct (Thomas: append): no wait for a receipt; every report is kept
      if (!text.trim()) throw new Error("Describe what has changed.");
      let rev = 0;
      let full = "";
      await writeVerified(
        rq,
        (cur) => {
          if (!releasedStep && isAwaitingRelease(cur) && !isClosedRequest(cur)) throw new Error(RELEASE_LOCKED_TEXT);
          if (!releasedStep && (!isClosedRequest(cur) || str(cur, "Case_Phase_Label").toLowerCase() === "cancelled")) throw new Error("Until the final release you change the answers directly in the questionnaire.");
          // 22 Oct (Thomas: append): the new report on top, every earlier one kept below it, each with its number, time,
          // name and e-mail; Change_Report_Rev counts the reports
          const curRev = num(cur, "Change_Report_Rev") ?? 0;
          rev = curRev + 1;
          const at = stamp();
          const prev = str(cur, "Change_Report_Text").trim();
          full = `Report ${rev} · ${at} · ${me.name || me.email} (${me.email})\n${text.trim()}` + (prev ? `\n\n${prev}` : "");
          return { Change_Report_Text: full, Change_Report_Rev: rev, Change_Report_By_Email: me.email, Change_Report_At: at };
        },
        (back) => (num(back, "Change_Report_Rev") ?? 0) === rev && str(back, "Change_Report_Text") === full,
        "Your report",
      );
      requestChanged(b.request!._id, (why) => `Your report is saved, but it has not reached Beiersdorf yet (${why}). ${TELL}`);
      {
        const r = b.request!, code = str(r, "Case_Code") || b.code;
        sendMail([str(r, "BDF_Contact_Email")], `${code}: the supplier reported a change`, `<p>${esc(me.name || "The supplier")} reported a change on the released CIQ of ${esc(code)}:</p><p>${esc(text.trim())}</p><p>Please open CIQ Digital to review it.</p>`);
      }
    },
  };
}

export type LiveActions = ReturnType<typeof liveActions>;

/** The request steps the screen moves on by itself (Thomas, 21 Oct): from where, on which Release_Flag, to where. */
const RELEASE_MOVES: { from: StepKey; flag: string; to: StepKey; problem: string }[] = [
  { from: "keep", flag: "Requested", to: "release", problem: "Beiersdorf has requested your final release, but the request could not be moved on to it" },
  { from: "release", flag: "Reopened", to: "keep", problem: "Beiersdorf reopened the review, but the request could not be returned to you for changes" },
];

/**
 * The release-step moves (Thomas, 21 Oct). A REST/SDK submit ignores Mandatory fields (proven live), so the supplier's
 * screen moves its request itself while loading, through the task it holds:
 * - at "keep the CIQ up to date" with Release_Flag "Requested": submit "keep", no field written (Keep_Open_Gate is a
 *   formula) → the request is at "give the final release", where the screen offers the final release;
 * - at "give the final release" with Release_Flag "Reopened": submit it without Release_By_Name or Release_At →
 *   Kissflow's go-to returns the request to "keep the CIQ up to date" (editable again).
 * At most once per task per page load (local.moves: the step and activity instance it was submitted from), never on
 * a closed request (cancelled, completed, or locked outside the release: isClosedRequest), and no hand-off is posted.
 * Once the request is listed at another step or task that move is over, so a later release request or reopen on the
 * same page moves it again. Afterwards the item must no longer be my task at that same activity instance (moved on,
 * also past me): the activity instance decides, not the host's step filter. A move that failed never blocks the
 * page: it is a load warning, repeated while the request still waits at that task. `moved`: something moved, so the
 * caller reads everything again.
 */
export async function moveAtReleaseSteps(client: PortalClient, loaded: Loaded[], local: LocalNotes): Promise<{ moved: boolean; warnings: string[] }> {
  const warnings: string[] = [];
  let moved = false;
  for (const l of loaded) {
    const act = l.item._activity_instance_id;
    if (l.flow !== "request" || typeof act !== "string") continue;
    const id = l.item._id;
    const from = requestStepOf(l.item, l.listedAt);
    const mark = local.moves.get(id);
    if (mark && (mark.step !== from || mark.act !== act)) local.moves.delete(id); // listed elsewhere: that move is over
    const move = RELEASE_MOVES.find((m) => m.from === from && str(l.item, "Release_Flag") === m.flag);
    if (!move || isClosedRequest(l.item)) continue;
    const held = local.moves.get(id);
    if (held) {
      if (held.failed) warnings.push(held.failed);
      continue;
    }
    local.moves.set(id, { step: from, act, failed: "" });
    let refused: unknown;
    try {
      await client.submit("request", id, act);
    } catch (e) {
      refused = e; // it may still have gone through (its answer lost to the 30 s bound): where the item stands decides
    }
    const went = await client
      .listTasks("request", STEPS[from].activity)
      .then((rows) => !rows.some((r) => r._id === id && r._activity_instance_id === act))
      .catch(() => false);
    if (went) {
      moved = true;
      continue;
    }
    const why = refused !== undefined ? errorText(refused) : `Kissflow kept it at “${STEPS[from].name}”`;
    const failed = `${str(l.item, "Case_Code") || id}: ${move.problem} (${why}). Close and reopen the portal to try again; if this stays, tell your Beiersdorf contact.`;
    local.moves.set(id, { step: from, act, failed });
    warnings.push(failed);
  }
  return { moved, warnings };
}
