// Reconcile: bring Kissflow in line with the canonical case after a prototype action (plan v5 §7 L-01…L-23, §8.2).
//
// Input: the case before and after the action (prototype CiqCase), the new audit entries and mails the action produced.
// Output: Kissflow writes, each idempotent by its own key and verified by reading it back (kissflow.mjs):
//   Case Data row · CIQ Case fields and its two service-held steps · CIQ Review items (one per activation) ·
//   CIQ Open Point items · CIQP Query items (one per round) · CIQP Request service fields · CIQP Final Release ·
//   RMES rows · Scope Run rows · final document + seal · Audit Event rows · Mail Outbox rows.
// Order: creates first (checkpointed in the ledger right after each create), field writes, withdrawals, the final
// document, the case step submits, audit and outbox rows, and the Case Data commit last.
//
// The service never submits a human step: only the Start of items it creates and the two Integration-service steps
// of CIQ Case. It only withdraws items it started.
//
// Identity (identity.mjs): the canonical case in memory may carry minted supplier ids (`sup:<code>:<uid>`) for a Kissflow
// user who is also internal. Every value written here carries the Kissflow id: USER / MULTIUSER fields through
// userVal / contactsVal, id lists and JSON through kfId / unmint, and the Case Data commit through unmint. Both replace
// only the directory's own minted ids (a supplier's free text that looks like one is never changed). Name and e-mail
// look-ups use the in-memory id, so they resolve to the right side. Audit rows get the department each BDF actor acted
// in (opts.project, the same projection the world was built with).

import { FLOW, F, STEP, LIST } from "./ids.mjs";
import { D, caseDataFields, criterionRow, sealOf, LEDGER_FIELD, isoDate, rmesFromRows } from "./engine.mjs";
import { outboxRows, mergeDebounced } from "./mail.mjs";
import { auditRow } from "./audit.mjs";
import { kfId as kfIdOf, unmint as unmintOf } from "./identity.mjs";

export const RELEASE_TEXT = "Final CIQ release: the information and evidence are correct and complete. The CIQ is frozen.";
/** Phases in which CIQP_Request_A00.Request_Locked is "Yes": the supplier can change nothing (plan v5 §3.1). */
export const LOCKED_PHASES = new Set(["final-release", "completed", "cancelled"]);
const KIND_LABEL = { query: "Question", "document-request": "Document request", "additional-part": "Additional section", finding: "Question" };
const SUPPLIER_STATUS = { open: "Waiting for your answer", "in-progress": "With Beiersdorf" };

const raiserOf = (op) => (op.createdBy === "system" ? op.responsibleId : op.createdBy);
const refKind = (ref) => (ref.rowId ? "Component row" : ref.documentId ? "Document" : ref.fieldId ? "Field" : "Section");
const strip = (o) => {
  for (const k of Object.keys(o)) if (o[k] === undefined) delete o[k];
  return o;
};
const live = (item) => item && (item._status === "InProgress" || item._status === "Draft");
const ended = (item) => item && ["Completed", "Withdrawn", "Rejected"].includes(item._status);

// ---------------------------------------------------------------------------------------------- supplier-visible views

/** One open point as the supplier may see it (L-13): no "note" entries, no internal close reason. */
export function supplierPointView(op, directory, c) {
  const docName = (id) => (id ? c.documents.find((d) => d.id === id)?.name : undefined);
  const nameOf = (id, side) => (side === "supplier" ? directory.nameOf(id) : id === "system" ? "Beiersdorf" : directory.nameOf(id));
  const outcome = op.status !== "closed" ? undefined : op.outcome === "accepted" ? "Accepted" : D.closedByCancellation(op) ? "Closed: the request was withdrawn" : op.outcome === "withdrawn" ? "Closed, no answer needed" : "Closed";
  return {
    opId: op.id,
    kind: KIND_LABEL[op.kind],
    ref: op.ref.label,
    sectionId: op.ref.sectionId,
    fieldId: op.ref.fieldId,
    rowId: op.ref.rowId,
    question: op.question,
    justification: op.justification,
    dueDate: op.dueDate,
    status: op.status === "closed" ? outcome : SUPPLIER_STATUS[op.status],
    // stable code next to the wording (portal UI parses this, not the label): open · answered · accepted · not-accepted · closed · withdrawn-with-case
    statusCode: op.status !== "closed" ? (op.status === "open" ? "open" : "answered") : op.outcome === "accepted" ? "accepted" : D.closedByCancellation(op) ? "withdrawn-with-case" : op.outcome === "withdrawn" ? "closed" : "not-accepted",
    rounds: op.rounds,
    thread: op.thread.filter((m) => m.action !== "note").map((m) => strip({ at: m.at, side: m.side, by: nameOf(m.by, m.side), action: m.action, verb: D.SUPPLIER_MESSAGE_TEXT[m.action], text: m.text, document: docName(m.documentId), newRound: m.newRound })),
    edits: (op.edits ?? []).map((e) => ({ at: e.at, field: e.field, from: e.field === "responsibleId" ? directory.nameOf(e.from) : e.from, to: e.field === "responsibleId" ? directory.nameOf(e.to) : e.to })),
  };
}

export const bdfSet = (c) => ({ "FLD-GEN-001": c.answers["FLD-GEN-001"], "FLD-GEN-002": c.answers["FLD-GEN-002"], "FLD-GEN-003": c.answers["FLD-GEN-003"], "FLD-GEN-008": c.answers["FLD-GEN-008"], "FLD-GEN-009": c.answers["FLD-GEN-009"], SF11: c.config.SF11 ?? [] });

const activeContacts = (c, directory) => c.supplierContactIds.filter((id) => directory.byId(id)?.active !== false);

// ---------------------------------------------------------------------------------------------- the reconcile pass

/**
 * @param {object} ctx  run context: { port, directory, config, now(), log, linkBase, attacher, index(flow, keyField) }
 * @param {object} cs   case store: { row, ledger, before, caseItemId, caseItem }
 * @param {object} after0  the canonical case after the action
 * @param {object} fx   { newAudit, newMails, newLog, newChangeReports }
 * @param {object} opts { triggerKey, actorId, at, portalRef, answersRev, activation, extraAudit, caseFields, scopeTrigger, reason }
 */
export async function reconcile(ctx, cs, after0, fx = {}, opts = {}) {
  const { port, directory } = ctx;
  // identity.mjs: every value written carries the Kissflow id; only this directory's minted ids are replaced
  const kfId = (id) => kfIdOf(id, directory.mintedIds);
  const unmint = (v) => unmintOf(v, directory.mintedIds);
  const userVal = (id) => (id ? { _id: kfId(id) } : undefined);
  const contactsVal = (ids) => ids.map((id) => ({ _id: kfId(id) }));
  const nowIso = ctx.now();
  const after = structuredClone(after0);
  const before = cs.before;
  const L = cs.ledger;
  const key = opts.triggerKey ?? `replay:${nowIso}`;
  const report = { created: [], updated: [], withdrawn: [], submitted: [], audit: 0, mails: 0, dropped: [] };
  const cache = new Map();
  const get = async (flow, id, fresh = false) => {
    if (!id) return null;
    if (!fresh && cache.has(id)) return cache.get(id);
    const it = await port.getProcessItemAdmin(flow, id);
    cache.set(id, it);
    return it;
  };
  const write = async (flow, id, fields) => {
    const desired = strip({ ...fields });
    if (!Object.keys(desired).length) return;
    const r = await port.adminUpdate(flow, id, desired);
    if (r.attempts) report.updated.push(`${flow}/${id}:${Object.keys(desired).join(",")}`);
    cache.delete(id);
  };
  const checkpoint = async () => {
    if (cs.row?._id) await port.updateFormRow(FLOW.caseData, cs.row._id, { [LEDGER_FIELD]: JSON.stringify(unmint(L)) });
  };
  if (fx.newChangeReports?.length) L.changeReports = [...(L.changeReports ?? []), ...fx.newChangeReports.filter((r) => r.caseId === after.id && !(L.changeReports ?? []).some((x) => x.id === r.id)).map(unmint)];
  const caseItemId = cs.caseItemId;
  const phaseChanged = before?.phase !== after.phase;
  const contacts = activeContacts(after, directory);

  // ---------------------------------------------------------------- 0. Case Data row (L-03) exists
  if (!cs.row) {
    const created = await port.createFormRow(FLOW.caseData, caseDataFields(unmint(after), unmint(L), { now: nowIso, fields: { Case_Item_Id: caseItemId, Supplier_Name: supplierName(ctx, after), Supplier_DUNS: supplierDuns(ctx, after), Owner_RMM_Name: directory.nameOf(after.ownerId), Owner_RMM_Email: directory.emailOf(after.ownerId) } }));
    cs.row = created;
    L.items.caseData = created._id;
    report.created.push(`${FLOW.caseData}/${created._id}`);
  }

  // ---------------------------------------------------------------- 1. the portal twin CIQP Request (L-04)
  if (!L.items.request && after.phase !== "cancelled" && after.phase !== "completed") {
    const owner = directory.byId(after.ownerId);
    const bundle = opts.supplierBundle;
    const fields = strip({
      Request_Key: `${after.id}-REQ`,
      Case_Code: after.id,
      Cycle_No: 1,
      Supplier_Code: after.supplierId,
      App_Case_Item_Id: caseItemId,
      Trade_Name: after.materialName,
      Main_INCI: after.inci,
      BDF_Material_No: after.materialNo,
      Supplier_Display_Name: supplierName(ctx, after),
      BDF_Contact_Name: owner?.name ?? "",
      BDF_Contact_Email: owner?.email || undefined,
      Markets_Label: (after.config.SF11 ?? []).join(", "),
      Template_Label: after.templateVersion,
      Supplier_Due_Date: isoDate(after.dueDate),
      Case_Contacts_JSON: JSON.stringify(contacts.map((id) => ({ id: kfId(id), name: directory.nameOf(id), email: directory.emailOf(id), title: directory.byId(id)?.title || "Supplier contact", mayConfirm: directory.byId(id)?.mayConfirm !== false }))),
      Assigned_Contacts: contactsVal(contacts),
      Rule_Set_Version: after.ruleSetVersion,
      Template_Version: after.templateVersion,
      Config_Bundle_JSON: bundle ? JSON.stringify(bundle.json) : undefined,
      Config_Bundle_Hash: bundle?.hash,
      BDF_Set_JSON: JSON.stringify(bdfSet(after)),
      Case_Phase_Label: LIST.portalPhaseLabel[after.phase],
      Request_Locked: "No",
      Answers_Rev: 0,
      Change_Report_Rev: 0,
    });
    const r = await port.createAndSubmit(FLOW.request, fields);
    L.items.request = r.id;
    report.created.push(`${FLOW.request}/${r.id}`);
    await checkpoint();
  }

  // ---------------------------------------------------------------- 2. review tracks → CIQ Review items (L-07)
  const newAuditFor = (re) => (fx.newAudit ?? []).filter((a) => re.test(a.action)).at(-1);
  // A reopen's own reason: one save may reopen several departments for different sections (Thomas, 15 Oct: the
  // section owners' reviews reopen on a supplier change), so the audit row of THIS department is taken.
  const ownReopenAudit = (dept) => (fx.newAudit ?? []).filter((a) => a.action === `Reopened ${D.DEPT_SHORT[dept]} review`).at(-1);
  const reopenAuditOf = (dept) => ownReopenAudit(dept) ?? newAuditFor(/^Reopened .* review/);
  for (const t of after.reviews) {
    const prev = before?.reviews.find((r) => r.dept === t.dept);
    t.round = t.round ?? prev?.round ?? 1;
    t.itemId = t.itemId ?? prev?.itemId ?? L.items[`review:${t.dept}:${t.round}`];
    if (prev && prev.assigneeId !== t.assigneeId) t.lastActivityAt = opts.at ?? nowIso;
    const item = await get(FLOW.review, t.itemId);
    const open = t.status !== "completed";
    if (after.phase === "cancelled") {
      if (open && live(item)) {
        await write(FLOW.review, item._id, { Track_Status: LIST.trackStatus.ended });
        await port.withdraw(FLOW.review, item._id, `Case cancelled: ${after.cancelled?.reason ?? ""}`.trim());
        report.withdrawn.push(`${FLOW.review}/${item._id}`);
      }
      continue;
    }
    if (after.phase === "completed") continue;
    if (open && !live(item)) {
      // The reviewer completed the item and its completion is not processed yet (H-08 does it): leave it.
      if (item?._status === "Completed" && prev?.status !== "completed" && t.status !== "reopened" && t.refusedItemId !== item._id) continue;
      // A new activation: first review at completeness, a late track, a reopen, a reactivation or a refused completion.
      let kind;
      let reason = "";
      if (!prev) {
        kind = before?.phase === "supplier-input" ? "Completeness" : "Added later";
        reason = kind === "Completeness" ? "Completeness confirmed" : (newAuditFor(/^Activated review/)?.detail ?? "");
      } else if (prev.status === "completed" || (t.status === "reopened" && ownReopenAudit(t.dept))) {
        // (a completion applied after a later supplier change in the department's section reopens in the same pass:
        // the item was open before, completed by the reviewer, and the track is reopened now; Thomas, 15 Oct)
        kind = "Reopened";
        reason = reopenAuditOf(t.dept)?.detail ?? opts.reason ?? "";
      } else {
        kind = "Reactivated";
        reason = t.refusedItemId === item?._id ? `Completion not accepted: ${t.refusedReason ?? ""}`.trim() : (opts.reason ?? (before?.phase === "cancelled" ? "Case reactivated" : "The previous review item ended"));
      }
      if (item && ended(item)) t.round += 1;
      const rkey = `review:${t.dept}:${t.round}`;
      let id = L.items[rkey];
      if (!id) {
        const assignee = directory.byId(t.assigneeId);
        const r = await port.createAndSubmit(
          FLOW.review,
          strip({
            Review_Key: `${after.id}-${t.dept}-${t.round}`,
            Case_Code: after.id,
            Cycle_No: 1,
            Case_Item_Id: caseItemId,
            Supplier_Code: after.supplierId,
            Trade_Name: after.materialName,
            Review_Dept: t.dept,
            Round_No: t.round,
            Activation_Kind: kind,
            Activation_Reason: reason || undefined,
            Activated_By_Name: opts.actorId && opts.actorId !== "system" ? directory.nameOf(opts.actorId) : "System",
            Assignee_User: userVal(t.assigneeId),
            Assignee_Name: assignee?.name,
            Assignee_Email: assignee?.email || undefined,
            Track_Status: LIST.trackStatus[t.status],
            Open_Count: openCount(after, t.dept),
            RMES_Gaps: rmesGaps(after, t.dept),
          }),
        );
        id = r.id;
        L.items[rkey] = id;
        report.created.push(`${FLOW.review}/${id}`);
        await checkpoint();
      }
      t.itemId = id;
      t.items = [...new Set([...(t.items ?? []), id])];
      continue;
    }
    if (open && live(item)) {
      const assignee = directory.byId(t.assigneeId);
      await write(
        FLOW.review,
        item._id,
        diff(item, {
          Track_Status: LIST.trackStatus[t.status],
          Open_Count: openCount(after, t.dept),
          RMES_Gaps: rmesGaps(after, t.dept),
          Assignee_User: userVal(t.assigneeId),
          Assignee_Name: assignee?.name,
          Assignee_Email: assignee?.email || undefined,
          Reassign_Reason: prev && prev.assigneeId !== t.assigneeId ? opts.reason : undefined,
        }),
      );
    }
  }
  for (const a of fx.newAudit ?? []) for (const t of after.reviews) if (a.by && a.by === t.assigneeId) t.lastActivityAt = a.at;

  // ---------------------------------------------------------------- 3. open points → CIQ Open Point + CIQP Query (L-10…L-13)
  for (const op of after.openPoints) {
    op.itemId = op.itemId ?? L.items[`op:${op.id}`];
    let opItem = await get(FLOW.openPoint, op.itemId);
    if (!op.itemId) {
      if (op.status === "closed" && after.phase === "cancelled") continue;
      const raiser = raiserOf(op);
      const resp = directory.byId(op.responsibleId);
      // V-19(b): the "Open point – <Dept>" steps are assigned from the MultiUser Raiser_Assignee (the raiser; for a
      // system-raised point its responsible person). Sent from the start so the field can go live at any time; while the
      // field does not exist yet, a create naming it is retried once without it.
      const opFields = strip({
          OP_Key: op.id,
          Round_No: op.rounds,
          Case_Code: after.id,
          Cycle_No: 1,
          Supplier_Code: after.supplierId,
          Case_Item_Id: caseItemId,
          OP_Kind: LIST.opKind[op.kind],
          OP_Dept: op.dept,
          Raised_By_Dept: op.dept,
          OP_To_Supplier: "Yes",
          Raised_By_User: userVal(raiser),
          Raised_By_Name: op.createdBy === "system" ? "System" : directory.nameOf(op.createdBy),
          Ref_Kind: refKind(op.ref),
          Ref_Label: op.ref.label,
          Ref_Section_Key: op.ref.sectionId,
          Ref_Field_Key: op.ref.fieldId,
          Ref_Row_Id: op.ref.rowId,
          Ref_Doc_Id: op.ref.documentId,
          Ref_Internal_Key: op.findingId,
          Kind_Label: KIND_LABEL[op.kind],
          Question_Text: op.question,
          Supplier_Justification: op.justification?.trim() ? op.justification : "—",
          Responsible_User: userVal(op.responsibleId),
          Responsible_Name: resp?.name,
          Responsible_Dept_Label: D.DEPT_LABEL[op.dept],
          Supplier_Due_Date: isoDate(op.dueDate),
          OP_Progress: LIST.opProgress[op.status] ?? "Open",
          Thread_JSON: JSON.stringify(unmint({ thread: op.thread, edits: op.edits ?? [] })),
          Portal_Contact_Ids: contacts.map(kfId).join(","),
          Raiser_Assignee: raiser ? [userVal(raiser)] : undefined,
        });
      let r;
      try {
        r = await port.createAndSubmit(FLOW.openPoint, opFields);
      } catch (e) {
        if (!/Raiser_Assignee/.test(String(e?.message))) throw e;
        const { Raiser_Assignee, ...without } = opFields;
        r = await port.createAndSubmit(FLOW.openPoint, without);
      }
      op.itemId = r.id;
      L.items[`op:${op.id}`] = r.id;
      report.created.push(`${FLOW.openPoint}/${r.id}`);
      await checkpoint();
      opItem = await get(FLOW.openPoint, r.id, true);
    }

    // queries: one live CIQP Query for the current round while the point is open (L-11)
    op.queries = op.queries ?? {};
    for (const [k, v] of Object.entries(L.items)) {
      const m = new RegExp(`^query:${op.id}:r(\\d+)$`).exec(k);
      if (m) op.queries[m[1]] = v;
    }
    for (const [round, qid] of Object.entries(op.queries)) {
      const wantLive = op.status === "open" && Number(round) === op.rounds && after.phase !== "cancelled";
      if (wantLive) continue;
      const q = await get(FLOW.query, qid);
      if (live(q)) {
        await port.withdraw(FLOW.query, qid, op.status === "closed" ? "Closed by Beiersdorf" : "Superseded by a new round");
        report.withdrawn.push(`${FLOW.query}/${qid}`);
      }
    }
    if (op.status === "open" && after.phase !== "cancelled" && after.phase !== "completed") {
      const qkey = `query:${op.id}:r${op.rounds}`;
      let qid = L.items[qkey];
      const resp = directory.byId(op.responsibleId);
      const qFields = {
        Question_Text: op.question,
        Supplier_Justification: op.justification?.trim() ? op.justification : "—",
        Supplier_Due_Date: isoDate(op.dueDate),
      };
      if (!qid) {
        const view = supplierPointView(op, directory, after);
        const r = await port.createAndSubmit(
          FLOW.query,
          strip({
            Query_Key: `${op.id}-R${op.rounds}`,
            Round_No: op.rounds,
            Case_Code: after.id,
            Cycle_No: 1,
            Supplier_Code: after.supplierId,
            App_Open_Point_Id: op.itemId,
            Kind_Label: KIND_LABEL[op.kind],
            Responsible_Department: D.DEPT_LABEL[op.dept],
            Responsible_Name: resp?.name ?? "Beiersdorf",
            Ref_Kind: refKind(op.ref),
            Ref_Section_Key: op.ref.sectionId,
            Ref_Field_Key: op.ref.fieldId,
            Ref_Row_Id: op.ref.rowId,
            Ref_Doc_Id: op.ref.documentId,
            Ref_Doc_File_Name: op.ref.documentId ? after.documents.find((d) => d.id === op.ref.documentId)?.name : undefined,
            Ref_Label: op.ref.label,
            ...qFields,
            Previous_Rounds_JSON: op.rounds > 1 ? JSON.stringify(view.thread) : undefined,
            Assigned_Contacts: contactsVal(contacts),
          }),
        );
        qid = r.id;
        L.items[qkey] = qid;
        op.queries[op.rounds] = qid;
        report.created.push(`${FLOW.query}/${qid}`);
        await checkpoint();
      } else {
        // An edit while the question is open (AS-08, B-17): the open query shows the change ("Changed by Beiersdorf").
        const q = await get(FLOW.query, qid);
        if (live(q)) {
          // a contact replaced on the case (H-18) also takes over the open question (rerouting mid-step: S-5/S-7)
          const who = diff(q, { Assigned_Contacts: contacts.length ? contactsVal(contacts) : undefined });
          if (Object.keys(who).length) await write(FLOW.query, qid, who);
          const d = diff(q, qFields);
          if (Object.keys(d).length) {
            const lastEdit = (op.edits ?? []).at(-1);
            await write(FLOW.query, qid, { ...d, Edited_At: lastEdit?.at ?? nowIso, Edit_Note: `Changed by Beiersdorf: ${[...new Set((op.edits ?? []).filter((e) => e.at === lastEdit?.at).map((e) => (e.field === "dueDate" ? "due date" : e.field === "responsibleId" ? "responsible person" : e.field)))].join(", ") || "question"}` });
          }
        }
      }
    }

    // the point's own fields (admin route while it is in progress, P1)
    if (live(opItem)) {
      const lastSupplier = [...op.thread].reverse().find((m) => m.side === "supplier");
      const lastReturn = [...op.thread].reverse().find((m) => m.action === "returned");
      const resp = directory.byId(op.responsibleId);
      const qidNow = op.queries?.[op.rounds];
      const closed = op.status === "closed";
      const desired = diff(opItem, {
        Round_No: op.rounds,
        OP_Progress: closed ? undefined : LIST.opProgress[op.status],
        OP_Outcome: closed ? LIST.opOutcome[op.outcome] : undefined,
        Outcome_Reason: closed ? (op.closeReason ?? [...op.thread].reverse().find((m) => m.action === "note")?.text) : undefined,
        Return_Reason: lastReturn?.text,
        Question_Text: op.question,
        Supplier_Justification: op.justification?.trim() ? op.justification : "—",
        Supplier_Due_Date: isoDate(op.dueDate),
        Responsible_User: userVal(op.responsibleId),
        Responsible_Name: resp?.name,
        // V-19(b): a system-raised point follows its responsible person (B-26 reassign). Only on items that carry the field;
        // whether Kissflow moves an open task when the field changes mid-step is unproven (S-5/S-7).
        Raiser_Assignee: !closed && op.createdBy === "system" && opItem && "Raiser_Assignee" in opItem && op.responsibleId ? [userVal(op.responsibleId)] : undefined,
        Thread_JSON: JSON.stringify(unmint({ thread: op.thread, edits: op.edits ?? [] })),
        Response_Kind: lastSupplier ? (lastSupplier.action === "cannot-provide" ? LIST.responseKind.cannot : lastSupplier.documentId ? LIST.responseKind.document : LIST.responseKind.answer) : undefined,
        Response_Text: lastSupplier?.text,
        Supplier_Responsible_Email: lastSupplier ? directory.emailOf(lastSupplier.by) || undefined : undefined,
        Closed_At: op.closedAt,
        Closed_By: op.closedBy && op.closedBy !== "system" ? userVal(op.closedBy) : undefined,
        Query_Key: qidNow ? `${op.id}-R${op.rounds}` : undefined,
        Portal_Query_Item_Id: qidNow,
      });
      await write(FLOW.openPoint, opItem._id, desired);
      if (closed && D.closedByCancellation(op)) {
        await port.withdraw(FLOW.openPoint, opItem._id, op.closeReason ?? "Case cancelled");
        report.withdrawn.push(`${FLOW.openPoint}/${opItem._id}`);
      }
    }
  }

  // ---------------------------------------------------------------- 3b. supplier files → CIQ_Case_A00.Supplier_Files (L-05, S-2)
  // Every new portal file (CIQP_Request_A00.Supplier_Files, described by an Uploads row) is downloaded and attached to
  // the case, once: deduplicated by the portal attachment id (Doc_Key), checkpointed right after each copy.
  if (L.items.request && Object.keys(L.uploads ?? {}).length) {
    const reqF = await get(FLOW.request, L.items.request, true);
    const rows = reqF?.[`Table::${F.request.uploads.table}`] ?? [];
    let caseF = await get(FLOW.caseProc, caseItemId, true);
    for (const uploadId of Object.keys(L.uploads)) {
      const u = rows.find((r) => r.Upload_Id === uploadId);
      const att = u?.Upload_Attachment_Id;
      if (!att) continue;
      L.uploadAtt = { ...(L.uploadAtt ?? {}), [uploadId]: att };
      if (L.files?.[att]) continue;
      if (!live(caseF)) {
        L.alerts = [...(L.alerts ?? []), { at: nowIso, what: `file ${att} not copied: the case item is ${caseF?._status}` }].slice(-50);
        continue;
      }
      const meta = (reqF[F.request.files] ?? []).find((a) => a.id === att);
      const name = meta?.name ?? u.Upload_File_Name ?? att;
      const taken = new Set(Object.values(L.files ?? {}).map((f) => f.id));
      const dup = (caseF[F.caseProc.files] ?? []).find((a) => a.name === name && (meta?.size === undefined || a.size === meta.size) && !taken.has(a.id));
      let copy = dup;
      if (!copy) {
        const file = await port.downloadFile(FLOW.request, reqF._id, F.request.files, att);
        if (!file) continue; // dry-run: nothing downloaded
        copy = await port.attachFile(FLOW.caseProc, caseItemId, F.caseProc.files, { name, bytes: file.bytes, contentType: file.contentType });
        report.created.push(`file ${att} → ${copy.id}`);
      }
      L.files = { ...(L.files ?? {}), [att]: { id: copy.id, name: copy.name, size: copy.size } };
      await checkpoint();
      caseF = await get(FLOW.caseProc, caseItemId, true);
    }
  }

  // ---------------------------------------------------------------- 4. RMES rows (L-08, H-21)
  if (after.rmes) {
    for (const dept of ["SAF", "REG"]) {
      const form = dept === "SAF" ? FLOW.rmesSaf : FLOW.rmesReg;
      const critTable = F.rmes.criteria[dept];
      const findTable = F.rmes.findings[dept];
      const crit = after.rmes.criteria.filter((x) => x.dept === dept);
      const finds = after.rmes.findings.filter((x) => x.dept === dept);
      if (!crit.length && !finds.length) continue;
      const header = { RMES_Key: `${after.id}-RMES-${dept}`, Case_Item_Id: caseItemId, Case_Code: after.id, Cycle_No: 1, Open_Criteria_Count: crit.filter((x) => !x.result).length, Open_Blocking_Findings_Count: finds.filter((f) => f.status === "open").length };
      const findingRow = (f) => strip({ Findings_Text: f.text, Findings_Criterion_Code: f.criterionId || undefined, Findings_Blocking: "Yes", Findings_State: f.status, Findings_Linked_OP_Key: f.openPointId });
      let rowId = L.items[`rmes:${dept}`];
      if (!rowId) {
        const row = await port.createFormRow(form, { ...header, Result_Case: caseItemId ? { _id: caseItemId } : undefined, RMES_Voided: "No" }, { [critTable]: crit.map(criterionRow), [findTable]: finds.map(findingRow) });
        rowId = row._id;
        L.items[`rmes:${dept}`] = rowId;
        report.created.push(`${form}/${rowId}`);
        await checkpoint();
        continue;
      }
      const cur = cs.rmesRows?.[dept] ?? (await port.getFormRow(form, rowId));
      const known = new Set((cur?.[`Table::${findTable}`] ?? []).map((r) => `${r.Findings_Linked_OP_Key ?? ""}|${r.Findings_Criterion_Code ?? ""}|${r.Findings_Text ?? ""}`));
      const newFindings = finds.filter((f) => !known.has(`${f.openPointId ?? ""}|${f.criterionId || ""}|${f.text}`));
      // Only the service's own columns are written; the department's results, comments and who/when are never touched.
      await port.updateFormRow(form, rowId, diffRow(cur, { Open_Criteria_Count: header.Open_Criteria_Count, Open_Blocking_Findings_Count: header.Open_Blocking_Findings_Count }), {
        [critTable]: { key: "Criteria_Code", upsert: crit.map(criterionRow) },
        ...(newFindings.length ? { [findTable]: { key: "Findings_Text", upsert: newFindings.map(findingRow) } } : {}),
      });
    }
  }

  // ---------------------------------------------------------------- 5. Scope Run rows (§4.9)
  const scopeRun = scopeRunTrigger(before, after, opts);
  if (scopeRun) {
    const skey = `scopeRun:${key}`;
    if (!L.items[skey]) {
      const n = (L.scopeRuns ?? 0) + 1;
      const input = { config: after.config, ruleSetVersion: after.ruleSetVersion, templateVersion: after.templateVersion };
      const row = await port.createFormRow(
        FLOW.scopeRun,
        strip({
          Run_Key: `${after.id}-SR-${n}`,
          Case_Code: after.id,
          Cycle_No: 1,
          Case_Item_Id: caseItemId,
          Run_No: n,
          Scope_Trigger: scopeRun.trigger,
          Related_Key: key,
          Rule_Set_Version: after.ruleSetVersion,
          Evaluator_Version: "prototype-domain@vendor",
          Input_JSON: JSON.stringify(input),
          Input_Hash: sealOf(input),
          Result_JSON: JSON.stringify(after.scope),
          Added_Section_Keys: scopeRun.added.join(", ") || undefined,
          Lead_Departments: after.reviews.map((r) => r.dept).join(", "),
          Override_Justification: scopeRun.justification,
          Run_At: opts.at ?? nowIso,
        }),
      );
      L.scopeRuns = n;
      L.items[skey] = row._id;
      report.created.push(`${FLOW.scopeRun}/${row._id}`);
      await checkpoint();
    }
  }

  // ---------------------------------------------------------------- 6. the final release item (L-14, L-15)
  const relKey = L.items.releaseCurrent;
  const relItem = await get(FLOW.release, relKey);
  if (after.phase === "final-release" && !live(relItem) && !(relItem && relItem._status === "Completed" && !L.releasesSeen?.[relKey])) {
    const n = (L.releaseCount ?? 0) + 1;
    const confirmers = contacts.filter((id) => directory.byId(id)?.mayConfirm !== false);
    const r = await port.createAndSubmit(FLOW.release, { Confirmation_Key: `${after.id}-FR-${n}`, Case_Code: after.id, Cycle_No: 1, Supplier_Code: after.supplierId, App_Case_Item_Id: caseItemId, Declaration_Text: RELEASE_TEXT, Declaration_Text_Key: "FR-2026-1", Assigned_Contacts: contactsVal(confirmers) });
    L.releaseCount = n;
    L.items[`release:${n}`] = r.id;
    L.items.releaseCurrent = r.id;
    L.releaseRequestedAt = opts.at ?? nowIso;
    report.created.push(`${FLOW.release}/${r.id}`);
    await checkpoint();
  } else if (after.phase === "final-release" && live(relItem)) {
    const confirmers = contacts.filter((id) => directory.byId(id)?.mayConfirm !== false);
    await write(FLOW.release, relItem._id, diff(relItem, { Assigned_Contacts: confirmers.length ? contactsVal(confirmers) : undefined }));
  } else if (after.phase !== "final-release" && after.phase !== "completed" && live(relItem)) {
    await port.withdraw(FLOW.release, relItem._id, after.phase === "cancelled" ? "Case cancelled" : "A review reopened: the release is requested again when every review has completed");
    report.withdrawn.push(`${FLOW.release}/${relItem._id}`);
  }

  // ---------------------------------------------------------------- 7. the final document and its seal (§10, H-11)
  let seal = cs.row?.Final_Document_Hash;
  if (after.finalDocument && !before?.finalDocument) {
    seal = sealOf(after.finalDocument);
    const shortSeal = `SHA-256 ${seal.slice(0, 16)}…`;
    for (const a of fx.newAudit ?? []) a.detail = a.detail?.replaceAll(after.finalDocument.fingerprint, shortSeal);
    for (const m of fx.newMails ?? []) m.body = m.body?.replaceAll(after.finalDocument.fingerprint, shortSeal);
    // 1. JSON + seal → Case Data first
    await port.updateFormRow(FLOW.caseData, cs.row._id, { Final_Document_JSON: JSON.stringify(after.finalDocument), Final_Document_Hash: seal });
    // 2.–3. PDF + attach (S-2 open: the attacher says so)
    const att = await (ctx.attacher ?? notAttached).attach({ caseCode: after.id, caseItemId, caseDataRowId: cs.row._id, document: after.finalDocument, seal });
    (fx.extraAudit ??= []).push({ at: opts.at ?? nowIso, by: "system", action: "Final PDF", detail: att.attached ? `Final PDF attached to ${att.where}${att.pdfSha256 ? ` (PDF SHA-256 ${att.pdfSha256.slice(0, 16)}…, ${att.size} bytes)` : ""}; document seal ${shortSeal}.` : `Final PDF ${att.note}. The final document JSON and its seal ${shortSeal} are filed on the case data.` });
    L.finalPdf = att;
  }

  // ---------------------------------------------------------------- 8. CIQ Case fields (admin route) and the service-held steps
  const caseItem = await get(FLOW.caseProc, caseItemId, true);
  if (live(caseItem)) {
    const compl = after.confirmations.find((x) => x.type === "completeness");
    const rel = after.confirmations.find((x) => x.type === "final-release");
    const cancelled = after.phase === "cancelled" ? after.cancelled : undefined;
    const enteredFR = [...after.phaseHistory].reverse().find((p) => p.phase === "final-release");
    await write(
      FLOW.caseProc,
      caseItemId,
      diff(caseItem, {
        Case_Phase: LIST.casePhase[after.phase],
        Case_Data_Item_Id: cs.row?._id,
        Portal_Request_Item_Id: L.items.request,
        Request_Key: L.items.request ? `${after.id}-REQ` : undefined,
        Origin_Types: (after.config.SF01 ?? []).join(", ") || undefined,
        Undefined_Origin: D.hasUndefinedOrigin(after.config) ? "Yes" : "No",
        Portal_Contact_Ids: after.supplierContactIds.map(kfId).join(","),
        Supplier_Contact_Emails: contacts.map((id) => directory.emailOf(id)).filter(Boolean).join(", "),
        Supplier_Due_Date: isoDate(after.dueDate),
        Completeness_Confirm: compl ? "Confirmed" : undefined,
        Completeness_By_Name: compl?.name,
        Completeness_By_Email: compl?.email || undefined,
        Completeness_By_Role: compl?.role || undefined,
        Completeness_At: compl?.at,
        RMES_Key: after.rmes ? `${after.id}-RMES` : undefined,
        RMES_Created_At: after.rmes?.createdAt,
        Release_Requested_At: enteredFR?.at,
        Portal_Release_Item_Id: L.items.releaseCurrent,
        Final_Release_Confirm: rel ? "Confirmed" : undefined,
        Final_Release_By_Name: rel?.name,
        Final_Release_By_Email: rel?.email || undefined,
        Final_Release_By_Role: rel?.role || undefined,
        Final_Release_At: rel?.at,
        Final_Document_Hash: after.finalDocument ? seal : undefined,
        Final_Document_At: after.finalDocument?.generatedAt,
        Completion_Trigger: after.finalDocument ? after.finalDocument.trigger : undefined,
        Cancel_Reason: cancelled?.reason,
        Cancelled_By_Name: cancelled ? directory.nameOf(cancelled.by) : undefined,
        Cancelled_At: cancelled?.at,
        Cancelled_From_Phase: cancelled?.fromPhase ? LIST.casePhase[cancelled.fromPhase] : undefined,
        ...(opts.caseFields ?? {}),
      }),
    );
    const step = port.currentStep(await get(FLOW.caseProc, caseItemId, true));
    // completeness → submit "Waiting for supplier: CIQ" (L-06, H-03 step 7)
    if (step?.name === STEP.caseProc.waitingSupplier.name && after.phase !== "supplier-input" && after.phase !== "cancelled" && compl) {
      await port.submitStep(FLOW.caseProc, caseItemId, { expectStep: STEP.caseProc.waitingSupplier.name });
      report.submitted.push(`${FLOW.caseProc}/${caseItemId}:${step.name}`);
    }
    // release + final document → submit "Beiersdorf review and final release" (H-11 step 5): the case ends
    const step2 = port.currentStep(await get(FLOW.caseProc, caseItemId, true));
    if (after.phase === "completed" && after.finalDocument && step2?.name === STEP.caseProc.review.name) {
      await port.submitStep(FLOW.caseProc, caseItemId, { expectStep: STEP.caseProc.review.name });
      report.submitted.push(`${FLOW.caseProc}/${caseItemId}:${step2.name}`);
    }
  }

  // ---------------------------------------------------------------- 9. the portal request's service fields (L-13, L-19)
  const reqItem = await get(FLOW.request, L.items.request, true);
  if (live(reqItem)) {
    const rel = after.confirmations.find((x) => x.type === "final-release");
    const lockedNow = LOCKED_PHASES.has(after.phase);
    // Unlocking (H-10, H-13): an Uploads row that reached the locked request without a save signal (its upload notice
    // was refused by the portal's lock) and was never mirrored is not taken over later either; it is logged.
    if (reqItem.Request_Locked === "Yes" && !lockedNow) {
      for (const u of reqItem[`Table::${F.request.uploads.table}`] ?? []) {
        if (!u.Upload_Id || L.uploads?.[u.Upload_Id] || L.uploadsRefused?.[u.Upload_Id]) continue;
        L.uploadsRefused = { ...(L.uploadsRefused ?? {}), [u.Upload_Id]: true };
        const by = directory.contactByEmail(u.Uploaded_By_Email, after.supplierId)?.id;
        (fx.extraAudit ??= []).push({ at: u.Uploaded_At ?? opts.at ?? nowIso, by: by ?? "system", action: "Change attempt refused", detail: `${by ? directory.nameOf(by) : "A supplier contact"} added the document ${u.Upload_File_Name ?? u.Upload_Id} while the questionnaire was locked; it is not taken over.`, sectionId: u.Upload_Section_Key || undefined });
      }
    }
    await write(
      FLOW.request,
      reqItem._id,
      diff(reqItem, {
        // a save refused on a locked request: its supplier JSON set back to the case (handlers/portal.mjs H-02)
        ...(opts.requestFields ?? {}),
        Case_Phase_Label: LIST.portalPhaseLabel[after.phase],
        // Thomas, 15 Oct: locked from the release request (H-08) until it is withdrawn (H-10) or the case is reactivated
        // into review (H-13); for good once completed or cancelled. The release itself is its own CIQP Final Release task.
        Request_Locked: lockedNow ? "Yes" : "No",
        Questions_History_JSON: JSON.stringify(after.openPoints.map((op) => supplierPointView(op, directory, after))),
        Manual_Scope_JSON: JSON.stringify(after.scope.filter((x) => x.manual).map((x) => ({ sectionId: x.sectionId, applicability: x.applicability, addedLater: !!x.addedLater, at: x.manual.at }))),
        BDF_Set_JSON: JSON.stringify(bdfSet(after)),
        Release_By_Name: rel?.name,
        Release_At: rel?.at,
        Change_Reports_JSON: L.changeReports?.length ? JSON.stringify(L.changeReports.map((r) => ({ id: r.id, at: r.at, text: r.text }))) : undefined,
        Supplier_Due_Date: isoDate(after.dueDate),
        Assigned_Contacts: contacts.length ? contactsVal(contacts) : undefined,
      }),
    );
  }

  // ---------------------------------------------------------------- 10. audit rows (§4.12) and outbox rows (§4.5)
  const audits = [...(fx.newAudit ?? []), ...(fx.extraAudit ?? [])];
  const auditKeys = await ctx.index(FLOW.audit, "Event_Key");
  let ai = 0;
  for (const a of audits) {
    const k = `${key}#${++ai}`;
    if (auditKeys.has(k)) continue;
    await port.createFormRow(FLOW.audit, auditRow({ key: k, entry: a, directory, caseCode: after.id, caseItemId, portalRef: opts.portalRef, answersRev: opts.answersRev, project: opts.project }));
    auditKeys.add(k);
    report.audit++;
  }
  for (const e of fx.newLog ?? []) {
    const k = `${key}#log${++ai}`;
    if (auditKeys.has(k)) continue;
    await port.createFormRow(FLOW.audit, auditRow({ key: k, entry: e, directory, caseCode: after.id, project: opts.project }));
    auditKeys.add(k);
    report.audit++;
  }
  const { rows, debounced, dropped } = outboxRows({ directory, c: after, mails: fx.newMails ?? [], triggerKey: key, at: nowIso, linkBase: ctx.linkBase });
  report.dropped.push(...dropped);
  const mailKeys = await ctx.index(FLOW.outbox, "Mail_Key");
  for (const r of rows) {
    if (mailKeys.has(r.Mail_Key)) continue;
    await port.createFormRow(FLOW.outbox, r);
    mailKeys.add(r.Mail_Key);
    report.mails++;
  }
  if (debounced.length) L.pendingMail = mergeDebounced(L.pendingMail, debounced);
  for (const d of dropped) L.alerts = [...(L.alerts ?? []), { at: nowIso, what: `mail ${d.key}: ${d.why}` }].slice(-50);

  // ---------------------------------------------------------------- 11. commit the canonical state (Case Data, last)
  if (opts.triggerKey) {
    L.applied = [...new Set([...(L.applied ?? []), opts.triggerKey])].slice(-300);
  }
  const fields = caseDataFields(unmint(after), unmint(L), {
    now: nowIso,
    fields: strip({
      Case_Item_Id: caseItemId,
      Portal_Request_Item_Id: L.items.request,
      Portal_Release_Item_Id: L.items.releaseCurrent,
      Supplier_Name: supplierName(ctx, after),
      Supplier_DUNS: supplierDuns(ctx, after),
      Owner_RMM_Name: directory.nameOf(after.ownerId),
      Owner_RMM_Email: directory.emailOf(after.ownerId) || undefined,
      Answers_Rev: L.answersRev,
      Answers_Changed_At: L.answersChangedAt,
      Final_Document_Hash: seal,
    }),
  });
  await port.updateFormRow(FLOW.caseData, cs.row._id, diffRow(cs.row, fields), childTables(after, L, ctx));
  cs.row = { ...cs.row, ...fields };
  cs.before = after;
  return { report, after };
}

// ---------------------------------------------------------------------------------------------- helpers

import { notAttached } from "./attach.mjs";

function supplierName(ctx, c) {
  return ctx.directory.suppliers.find((s) => s.id === c.supplierId)?.name ?? c.manufacturer ?? "";
}
function supplierDuns(ctx, c) {
  return ctx.directory.suppliers.find((s) => s.id === c.supplierId)?.duns ?? String(c.answers["FLD-GEN-003"] ?? "");
}

export const openCount = (c, dept) => c.openPoints.filter((p) => p.dept === dept && p.status !== "closed").length;
export const rmesGaps = (c, dept) => (dept === "SAF" || dept === "REG") && c.rmes ? c.rmes.criteria.filter((x) => x.dept === dept && !x.result).length + c.rmes.findings.filter((f) => f.dept === dept && f.status === "open").length : 0;

/** Only the fields whose wanted value differs from the item (undefined = leave alone). */
function diff(item, wanted) {
  const out = {};
  for (const [k, v] of Object.entries(wanted)) {
    if (v === undefined) continue;
    const have = item?.[k];
    const same = v && typeof v === "object" ? (Array.isArray(v) ? JSON.stringify(v.map((x) => x?._id ?? x).sort()) === JSON.stringify((have ?? []).map((x) => x?._id ?? x).sort()) : (have?._id ?? have) === v._id) : String(have ?? "") === String(v);
    if (!same) out[k] = v;
  }
  return out;
}
const diffRow = diff;

function scopeRunTrigger(before, after, opts) {
  if (opts.scopeTrigger) return { trigger: opts.scopeTrigger, added: after.scope.filter((x) => x.addedLater && !before?.scope.find((b) => b.sectionId === x.sectionId)?.addedLater).map((x) => x.sectionId), justification: opts.reason };
  if (!before) return null;
  const hadCompl = before.confirmations.some((x) => x.type === "completeness");
  const hasCompl = after.confirmations.some((x) => x.type === "completeness");
  if (!hadCompl && hasCompl) return { trigger: "Completeness", added: [] };
  if (hadCompl) {
    const added = after.scope.filter((x) => x.addedLater && !before.scope.find((b) => b.sectionId === x.sectionId)?.addedLater).map((x) => x.sectionId);
    if (added.length) return { trigger: "Added later", added };
  }
  if (before.phase === "cancelled" && after.phase !== "cancelled") return { trigger: "Reactivation", added: [] };
  return null;
}

/** The Case Data child tables (projections; matched by own keys, P9). */
function childTables(c, L, ctx) {
  const T = F.caseData;
  const slots = D.requestedDocuments(c, ctx.config.cfg);
  const uploadOf = Object.fromEntries(Object.entries(L.uploads ?? {}).map(([u, d]) => [d, u]));
  // L5 (matrix v0.6, 28 Oct): Additive has no default, so an unanswered row (null) is written empty, never "No"; a
  // legacy false (the old checkbox) stays "No", as in the app, the portal and the final document
  const additive = (a) => (a === true ? "Yes" : a === false ? "No" : undefined);
  const comps = c.components.map((r) =>
    strip({ Comp_Row_Id: r.id, Comp_INCI: r.inci, Comp_CAS_No: r.cas || undefined, Comp_EC_No: r.ec || undefined, Comp_Function: r.fn, Comp_Is_Additive: additive(r.additive), Comp_Origin: r.origin, Comp_Conc_Min: r.concMin, Comp_Conc_Max: r.concMax }),
  );
  const docs = c.documents.map((d) => {
    const uid = uploadOf[d.id];
    const att = uid ? L.uploadAtt?.[uid] : undefined;
    return strip({ Doc_Key: att ?? uid ?? d.id, Doc_Section_Key: d.sectionId, Doc_Field_Key: d.fieldId, Doc_File_Name: d.name, Doc_Kind: d.kind, Doc_Attachment_Id: att ? L.files?.[att]?.id : undefined, Doc_Uploaded_By: ctx.directory.emailOf(d.uploadedBy) || ctx.directory.nameOf(d.uploadedBy), Doc_Uploaded_At: d.uploadedAt });
  });
  const reqs = slots.map((x) => {
    const st = D.requestedDocStatus(c, x);
    return strip({ Req_Key: x.key, Req_Doc_Name: x.doc, Req_Section_Key: x.sectionId, Req_Rule_Ids: x.ruleIds.join(", "), Req_Why_Text: x.why, Req_Status: st === "received" ? "Received" : st === "justified" ? "Not provided, justified" : "Missing", Req_Justification: c.justifications[x.key], Req_Added_Later: x.addedLater ? "Yes" : "No", Req_Kept: x.kept ? "Yes" : "No" });
  });
  // stored reports carry the Kissflow id of their (supplier) author: name and e-mail come from the contact
  const crs = (L.changeReports ?? []).map((r) => {
    const by = ctx.directory.supplierIdFor(r.by, c.supplierId);
    return strip({ CR_Key: r.id, CR_Text: r.text, CR_By_Name: ctx.directory.nameOf(by), CR_By_Email: ctx.directory.emailOf(by) || undefined, CR_At: r.at });
  });
  const keysOf = (rows, k) => rows.map((r) => r[k]);
  return {
    [T.components.table]: { key: T.components.key, upsert: comps, removeMissing: true, keep: keysOf(comps, T.components.key) },
    [T.documents.table]: { key: T.documents.key, upsert: docs, removeMissing: true },
    [T.requestedDocs.table]: { key: T.requestedDocs.key, upsert: reqs, removeMissing: true, keep: keysOf(reqs, T.requestedDocs.key) },
    [T.changeReports.table]: { key: T.changeReports.key, upsert: crs },
  };
}

export { rmesFromRows };
