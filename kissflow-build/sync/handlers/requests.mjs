// H-00 and the request-driven handlers (plan v5 §4.13, §8.2): the Workbench's CIQ Service Request rows.
//
// H-00 checks every request, in this order:
//   1. who asked = the row's platform `_created_by` (never a payload field);
//   2. a row whose `_modified_by` differs from `_created_by` is refused (another user changed the request): a waiting
//      row always; a Failed row unless its last write is the service's own Failed write-back (the row is exactly as the
//      service read it back: the service user when trusted, else the stamp kept in this process or in host state);
//   3. role membership (role GET);
//   4. the prototype's own guards (the same `check` rules and phase/text guards as the domain code).
// Refused → Request_Status Refused + the guard text + an audit "Refused". Failed (an error) → retried on the next run,
// up to 3 attempts. A deferral (429, challenge page, back-off, the holder wrote moments ago) writes nothing at all.
// Status texts never carry an in-memory id (identity.mjs `scrub`), so the status write-back itself cannot be refused by
// the leak guard; if it still fails, the run log and the heartbeat say so.
//
// Identity (identity.mjs): a Service Request is a Workbench input, so its actor is always the INTERNAL person behind
// `_created_by`, even when that Kissflow user is also a supplier contact (dev). Contact ids named in payloads or case
// fields (Portal_Contact_Ids, contactUserId, replacementUserId) are Kissflow user ids and are mapped to the contact of
// the case's / payload's supplier.

import { FLOW, LIST, ROLE } from "../ids.mjs";
import { D, A, J, toIsoDay, runAction, caseIn, readLedger } from "../engine.mjs";
import { configPinnedTo, portalBundle, bundleHash } from "../config.mjs";
import { reconcile } from "../reconcile.mjs";
import { isDeferral, stampOf, sameStamp } from "../kissflow.mjs";
import { loadCase, newCaseStore, applyToCase, worldFor, otherCaseStubs, writeAudit, commitLedger } from "./common.mjs";
import { runRemindersFor } from "./reminders.mjs";
import { mirrorPendingSave } from "./portal.mjs";

const REVIEW = ["RMM", "REG", "SAF", "QM", "MIC", "SUS"];
const DEPT_REVIEWERS = ["REG", "SAF", "QM", "MIC", "SUS"];

/** Which roles may file which request (H-00 step 3). `dept` = the payload's department must be one of the actor's. */
export const REQUEST_ROLES = {
  "case.created": { any: ["RMM"] },
  "case.cancel": { any: ["RMM"] },
  "case.reactivate": { any: ["RMM"] },
  "followup.started": { any: ["RMM"] },
  "op.raise": { dept: REVIEW },
  "op.accepted": { any: REVIEW },
  "op.returned": { any: REVIEW },
  "op.notaccepted": { any: REVIEW },
  "op.edited": { any: REVIEW },
  "op.closed": { any: REVIEW },
  "review.completed": { dept: REVIEW },
  "review.reopen": { dept: REVIEW },
  "review.reassign": { dept: REVIEW },
  "section.add": { dept: DEPT_REVIEWERS },
  "rmes.saved": { dept: ["SAF", "REG"] },
  "supplier.changed": { any: ["admin"] },
  "config.published": { any: ["admin"] },
  "reminders.run": { any: ["admin"] },
};

export const MAX_ATTEMPTS = 3;
const attemptOf = (row) => Number(/attempt (\d+)\/\d+/.exec(row.Result_Note ?? "")?.[1] ?? 0);
const CHANGED_BY_OTHER = "This request was changed by another user after it was filed. File it again.";

/** The rows the service still has to work on: waiting (blank status) or Failed with attempts left; oldest first. */
export function pendingRequests(rows) {
  return rows
    .filter((r) => !r.Request_Status || (r.Request_Status === LIST.requestStatus.failed && attemptOf(r) < MAX_ATTEMPTS))
    .sort((a, b) => String(a._created_at ?? "").localeCompare(String(b._created_at ?? "")) || String(a._id).localeCompare(String(b._id)));
}

async function setStatus(ctx, row, status, note, extra = {}) {
  const text = String(ctx.directory?.scrub ? ctx.directory.scrub(String(note ?? "")) : (note ?? "")).slice(0, 4000);
  const res = await ctx.port.updateFormRow(FLOW.serviceRequest, row._id, { Request_Status: status, Result_Note: text, Processed_At: ctx.now(), ...extra });
  // A Failed row is retried: remember exactly how the service left it, so a later edit by someone else is noticed (H-00 2)
  if (status === LIST.requestStatus.failed) ctx.requestStamps?.set(row._id, res?.row ? stampOf(res.row) : null);
  else ctx.requestStamps?.delete(row._id);
}

/** Is the row exactly as the service's own last (Failed) write-back left it? */
function serviceWroteLast(ctx, row) {
  if (ctx.port.isOwnWrite?.(row)) return true;
  const stamp = ctx.requestStamps?.get(row._id);
  return sameStamp(stamp, row);
}

/** H-00: check and run one Service Request. Returns "done" | "refused" | "failed" | "deferred". */
export async function processRequest(ctx, row, allRows = []) {
  const code = row.Request_Code;
  const actor = row._created_by?._id ?? row._created_by;
  const payload = J(row.Payload_JSON, {});
  const key = `req:${row.Request_Key}`;
  const refuse = async (text, caseCode) => {
    await writeAudit(ctx, [{ at: row._created_at ?? ctx.now(), by: actor, action: `Refused: ${code}`, detail: text }], { key: `${key}#refused`, caseCode: caseCode ?? row.Case_Code, category: "Access", reason: text, objectKind: "Service request", objectKey: row.Request_Key, project: actor && payload.dept ? { [actor]: payload.dept } : undefined });
    await setStatus(ctx, row, LIST.requestStatus.refused, text);
    ctx.stats.refused++;
    return "refused";
  };
  try {
    // 1 + 2: the platform's own actor, and nobody else changed the row (waiting, or Failed since the service's write-back)
    if (!actor) return await refuse("The request has no platform author.");
    const modBy = row._modified_by?._id ?? row._modified_by;
    if (modBy && modBy !== actor) {
      if (!row.Request_Status) return await refuse(CHANGED_BY_OTHER);
      if (row.Request_Status === LIST.requestStatus.failed && !serviceWroteLast(ctx, row)) return await refuse(CHANGED_BY_OTHER);
    }
    if (allRows.some((r) => r !== row && r.Request_Key === row.Request_Key && r.Request_Status === LIST.requestStatus.done)) {
      await setStatus(ctx, row, LIST.requestStatus.done, "Duplicate of a request already carried out (same Request_Key).");
      return "done";
    }
    // 3: role membership
    const rule = REQUEST_ROLES[code];
    if (!rule) return await refuse(`Unknown request "${code}".`);
    const dept = payload.dept;
    if (rule.dept) {
      if (!dept || !rule.dept.includes(dept)) return await refuse(`The request needs one of these departments: ${rule.dept.join(", ")}.`);
      if (!ctx.directory.isMember(actor, dept)) return await refuse(`You are not a member of ${D.DEPT_SHORT[dept] ?? dept}.`);
    } else if (!rule.any.some((r) => ctx.directory.isMember(actor, r))) {
      return await refuse(`Only ${rule.any.map((r) => (r === "admin" ? "the business administrator" : (D.DEPT_SHORT[r] ?? r))).join(" or ")} can do this.`);
    }
    // 4: the handler (prototype guards inside)
    const h = HANDLERS[code];
    const res = await h(ctx, { row, actor, payload, key, at: row._created_at ?? ctx.now() });
    if (res?.refused) return await refuse(res.text, res.caseCode);
    await setStatus(ctx, row, LIST.requestStatus.done, res?.note ?? "Done.", res?.itemId ? { Result_Item_Id: res.itemId } : {});
    ctx.stats.done++;
    return "done";
  } catch (e) {
    if (isDeferral(e)) {
      ctx.stats.deferred++;
      ctx.log({ ev: "deferred", request: row.Request_Key, why: e.message });
      if (e.unreadable || e.backoff) throw e; // stop the run: nothing more is asked of Kissflow
      return "deferred";
    }
    const n = attemptOf(row) + 1;
    ctx.stats.failed++;
    ctx.log({ ev: "failed", request: row.Request_Key, attempt: n, error: ctx.directory?.scrub ? ctx.directory.scrub(String(e.message)) : e.message });
    try {
      await setStatus(ctx, row, LIST.requestStatus.failed, `Failed (attempt ${n}/${MAX_ATTEMPTS}): ${e.message}`);
    } catch (e2) {
      if (isDeferral(e2)) throw e2;
      // the row keeps its old status and is picked up again; say so, never silently
      const why = ctx.directory?.scrub ? ctx.directory.scrub(String(e2.message)) : String(e2.message);
      ctx.log({ ev: "status-write-failed", request: row.Request_Key, attempt: n, error: why });
      ctx.warnings?.add(`request ${row.Request_Key}: the Failed status could not be written (${why})`);
    }
    return "failed";
  }
}

// ---------------------------------------------------------------------------------------------- helpers

async function caseOrRefuse(ctx, code) {
  const cs = code ? await loadCase(ctx, code) : null;
  return cs;
}
const notFound = (code) => ({ refused: true, text: `Case ${code ?? "(none)"} is not known to the service yet.` });

/** Run one case action for a request: load, apply, reconcile. */
async function caseAction(ctx, req, { project = {}, fn, opts = {}, onRefused }) {
  const cs = await caseOrRefuse(ctx, req.row.Case_Code);
  if (!cs) return notFound(req.row.Case_Code);
  const r = await applyToCase(ctx, cs, { triggerKey: req.key, actorId: req.actor, at: req.at, project, fn: (w) => fn(w, cs.before), opts });
  if (r.already) return { note: "Already carried out." };
  if (r.refused) {
    if (onRefused) await onRefused(cs, r);
    return { refused: true, text: r.text, caseCode: cs.before.id };
  }
  return { note: summary(r.report), after: r.after, cs };
}

const summary = (rep) => (rep ? `Done: ${rep.created.length} created, ${rep.withdrawn.length} withdrawn, ${rep.audit} audit row(s), ${rep.mails} mail(s).` : "Done.");
const opOf = (cs, opId) => cs.before.openPoints.find((p) => p.id === opId);

// ---------------------------------------------------------------------------------------------- handlers

/** Service-owned CIQ Case fields (plan v5 §4.1). A create can store them although they are ReadOnly at Start (app
 *  verifier, 15 Oct), so H-01 never trusts them: Text ones are cleared, and any forged value is audited as a change attempt. */
export const SERVICE_OWNED_CASE_FIELDS = {
  text: ["Cancel_Reason", "Cancelled_By_Name", "Cancelled_From_Phase", "Reactivate_Reason", "Portal_Release_Item_Id", "Final_Document_Hash", "Case_Data_Item_Id"],
  other: ["Cancelled_At", "Reactivated_At", "Release_Requested_At", "Final_Document_At", "Undefined_Origin", "Case_Phase"],
};
const blank = (v) => v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);

/** H-01 case.created: Case Data row, the portal request (header, contacts, bundle, BDF-set values), case fields; C-01. */
async function caseCreated(ctx, req) {
  const caseItemId = req.payload.caseItemId ?? req.row.Object_Key;
  const item = await ctx.port.getProcessItemAdmin(FLOW.caseProc, caseItemId);
  if (!item) return { refused: true, text: "The case item does not exist." };
  const code = item.Case_Code;
  const existing = ctx.caseRows.find((r) => r.Case_Code === code);
  if (existing) {
    if (existing.Case_Item_Id === caseItemId) return { note: "Already carried out." };
    // H-01 step 4: Kissflow has no unique key; a clash is refused and RMM is told.
    const { outboxRows } = await import("../mail.mjs");
    const mails = [{ to: [req.actor], by: "system", event: "alert", audience: "internal", subject: `${code}: case number already in use`, body: `The case number ${code} is already used by another case. The new case item was not taken over by the service. Please cancel it and start the case again.`, link: `/cases/${code}`, caseId: code }];
    const { rows } = outboxRows({ directory: ctx.directory, c: null, mails, triggerKey: req.key, at: ctx.now(), linkBase: ctx.linkBase });
    for (const r of rows) await ctx.port.createFormRow(FLOW.outbox, r);
    return { refused: true, text: `Case_Code ${code} is already used by another case (no native unique key; the service checks it).`, caseCode: code };
  }
  // forged service-owned fields: clear the Text ones (reconcile then writes the real values) and audit the attempt
  const forged = [...SERVICE_OWNED_CASE_FIELDS.text, ...SERVICE_OWNED_CASE_FIELDS.other].filter((f) => !blank(item[f]));
  if (forged.length) {
    const clear = Object.fromEntries(SERVICE_OWNED_CASE_FIELDS.text.filter((f) => !blank(item[f])).map((f) => [f, ""]));
    if (Object.keys(clear).length) await ctx.port.adminUpdate(FLOW.caseProc, caseItemId, clear);
    await writeAudit(ctx, [{ at: req.at, by: req.actor, action: "Change attempt refused", detail: `Service-owned case fields were filled at creation and are ignored: ${forged.map((f) => `${f} = ${JSON.stringify(item[f])}`).join("; ")}` }], { key: `${req.key}:forged`, caseCode: code, caseItemId, category: "Change attempt" });
  }
  const pinned = configPinnedTo(ctx.config, item.Rule_Set_Version, item.Template_Version);
  if (!pinned) return { refused: true, text: `The pinned configuration ${item.Rule_Set_Version} + ${item.Template_Version} is not a published release.` };
  const by = req.actor;
  const input = {
    materialName: item.Trade_Name ?? "",
    inci: item.Main_INCI ?? "",
    materialNo: item.BDF_Material_No ?? "",
    supplierId: item.Supplier_Code,
    contactIds: String(item.Portal_Contact_Ids ?? "").split(/[,;\s]+/).filter(Boolean).map((id) => ctx.directory.contactIdFor(id, item.Supplier_Code) ?? id),
    markets: String(item.Target_Markets_Text ?? "").split(/[,;\s]+/).filter(Boolean),
    dueDate: toIsoDay(item.Supplier_Due_Date),
    priority: String(item.Priority ?? "Normal").toLowerCase() === "high" ? "high" : "normal",
    ownerId: item.Owner_RMM?._id ?? item.Owner_RMM ?? by,
    duplicateNote: item.Duplicate_Reason || undefined,
    followUpOf: item.Follow_Up_Of_Case ? { caseId: item.Follow_Up_Of_Case, reportId: item.Follow_Up_Of_Report ?? "" } : undefined,
  };
  const world = worldFor(ctx, otherCaseStubs(ctx, code), { project: { [by]: "RMM", [input.ownerId]: "RMM" }, config: pinned });
  const r = runAction(world, code, (w) => A.createCase(w, by, input, req.at, code).state);
  if (r.refused) return { refused: true, text: r.refusal, caseCode: code };
  const after = caseIn(r.state, code);
  const release = ctx.config.releases.find((x) => x.ruleSetVersion === after.ruleSetVersion && x.templateVersion === after.templateVersion);
  const json = release ? portalBundle(release, ctx.config.settings) : null;
  const cs = newCaseStore(caseItemId);
  const res = await reconcile(ctx, cs, after, r, { triggerKey: req.key, actorId: by, at: req.at, project: { [by]: "RMM", [input.ownerId]: "RMM" }, supplierBundle: json ? { json, hash: bundleHash(json) } : null });
  ctx.caseRows.push(cs.row);
  return { note: summary(res.report), itemId: cs.ledger.items.request };
}

/** H-04 op.raise (also a finding turned into a query, B-21). */
async function opRaise(ctx, req) {
  const p = req.payload;
  const project = { [req.actor]: p.dept, ...(p.responsibleId ? { [p.responsibleId]: p.dept } : {}) };
  return caseAction(ctx, req, {
    project,
    fn: (w, c) =>
      p.findingId
        ? A.findingToQuery(w, req.actor, c.id, p.findingId, p.question ?? "", p.dueDate)
        : A.raiseOpenPoint(w, req.actor, c.id, { dept: p.dept, kind: p.kind ?? "query", ref: p.ref ?? { sectionId: "GEN", label: "General information" }, question: p.question ?? "", justification: p.justification ?? "", dueDate: p.dueDate, responsibleId: p.responsibleId }, req.at),
  });
}

/** H-06 the raiser decides or edits (raiser only, D-05). */
function opDecide(decision) {
  return async (ctx, req) => {
    const p = req.payload;
    const opId = p.opId ?? req.row.Object_Key;
    const cs = await loadCase(ctx, req.row.Case_Code);
    if (!cs) return notFound(req.row.Case_Code);
    const op = opOf(cs, opId);
    const dept = op?.dept;
    const project = dept ? { [req.actor]: dept, ...(p.patch?.responsibleId ? { [p.patch.responsibleId]: dept } : {}) } : {};
    const fn = (w, c) => {
      if (decision === "edited") return A.editOpenPoint(w, req.actor, c.id, opId, p.patch ?? {}, req.at);
      if (decision === "closed") return A.closeOpenPoint(w, req.actor, c.id, opId, p.reason ?? p.text ?? "", req.at);
      return A.reviewResponse(w, req.actor, c.id, opId, decision, p.text ?? p.reason ?? "", req.at);
    };
    const r = await applyToCase(ctx, cs, { triggerKey: req.key, actorId: req.actor, at: req.at, project, fn: (w) => fn(w, cs.before) });
    if (r.already) return { note: "Already carried out." };
    if (r.refused) return { refused: true, text: r.text, caseCode: cs.before.id };
    return { note: summary(r.report) };
  };
}

/** The SAF/REG decision recorded on the review item, as the prototype's value. */
const decisionOn = (item) => (item?.RMES_Decision === "Approved" ? "approved" : item?.RMES_Decision === "Rejected" ? "rejected" : undefined);

/**
 * H-08 a review completed (the request, or the item seen completed by polling). The reviewer submitted the CIQ Review
 * item in the Workbench; the service applies completeReview (RMES decision first, from the item). If the prototype
 * refuses (blockers), the review is re-activated with a new item and the refusal is recorded.
 * Thomas, 15 Oct: a supplier save still waiting to be mirrored goes first (the portal took it while the questionnaire
 * was open, so the lock a last completion sets must not refuse it), and the completion is dated by the item's own
 * Completed_At: a supplier change that came after it, in a section the department owns, reopens the review at once
 * (completeReview opts.completedAt; a new CIQ Review item, C-02).
 */
export async function reviewCompleted(ctx, { cs, dept, actor, at, key, fromPoll = false }) {
  if (await mirrorPendingSave(ctx, cs.before.id)) cs = await loadCase(ctx, cs.before.id);
  const t = cs.before.reviews.find((r) => r.dept === dept);
  if (!t) return { refused: true, text: `${D.DEPT_SHORT[dept]} has no review task on ${cs.before.id}.` };
  if (t.status === "completed") return { note: "Already completed." };
  const item = t.itemId ? await ctx.port.getProcessItemAdmin(FLOW.review, t.itemId) : null;
  if (!item || item._status !== "Completed") {
    if (fromPoll) return { note: "not completed yet" };
    throw new Error(`the ${D.DEPT_SHORT[dept]} review item is not completed yet; retried on the next run`);
  }
  const by = actor ?? item.Completed_By?._id ?? item._modified_by?._id;
  const steps = [];
  const dec = decisionOn(item);
  if ((dept === "SAF" || dept === "REG") && dec && dec !== t.decision) steps.push({ label: "decision", fn: (w) => A.rmesDecision(w, by, cs.before.id, dept, dec, item.RMES_Decision_Reason ?? "", at) });
  const continueNote = dept === "RMM" && item.Rejection_Handling === LIST.rejectionHandling.continue ? (item.Rejection_Note ?? "") : undefined;
  const completedAt = item.Completed_At ?? item._completed_at ?? at;
  steps.push({ label: "complete", fn: (w) => A.completeReview(w, by, cs.before.id, dept, at, { ...(continueNote ? { continueNote } : {}), completedAt }) });
  const world = worldFor(ctx, [cs.before], { project: { [by]: dept } });
  const { runSequence } = await import("../engine.mjs");
  const r = runSequence(world, cs.before.id, steps);
  // completed, or completed and reopened at once for a later supplier change (both are the completion applied)
  const completed = !r.refusals.some((x) => x.label === "complete");
  if (!completed) {
    const why = r.refusals.at(-1)?.text ?? "refused";
    // Keep the case consistent: the track stays open with a NEW review item (the ended one cannot be resumed, P10).
    const after = structuredClone(cs.before);
    const tr = after.reviews.find((x) => x.dept === dept);
    tr.refusedItemId = item._id;
    tr.refusedReason = why;
    await reconcile(ctx, cs, after, { newAudit: [{ at, by, action: `Review completion not accepted`, detail: `${D.DEPT_SHORT[dept]}: ${why} A new review task was created.` }] }, { triggerKey: key, actorId: by, at, project: { [by]: dept } });
    return { refused: true, text: why, caseCode: cs.before.id };
  }
  const after = caseIn(r.state, cs.before.id);
  const res = await reconcile(ctx, cs, after, r, { triggerKey: key, actorId: by, at, project: { [by]: dept } });
  return { note: summary(res.report) };
}

async function reviewCompletedReq(ctx, req) {
  const cs = await loadCase(ctx, req.row.Case_Code);
  if (!cs) return notFound(req.row.Case_Code);
  if (cs.ledger.applied.includes(req.key)) return { note: "Already carried out." };
  return reviewCompleted(ctx, { cs, dept: req.payload.dept, actor: req.actor, at: req.at, key: req.key });
}

/** rmes.saved: the department saved RMES results / findings / its decision (B-20…B-22). Guards and audit texts are the
 *  prototype's (recordCriterion, addFinding, closeFinding, rmesDecision); the RMES row itself was written by the department. */
async function rmesSaved(ctx, req) {
  const p = req.payload;
  const dept = p.dept;
  const cs = await loadCase(ctx, req.row.Case_Code);
  if (!cs) return notFound(req.row.Case_Code);
  // The state as it was before the department's save: results named in the payload are taken back out first.
  const base = structuredClone(cs.before);
  if (base.rmes) {
    for (const x of p.results ?? []) {
      const cr = base.rmes.criteria.find((y) => y.id === x.criterionId);
      if (cr) {
        delete cr.result;
        delete cr.comment;
      }
    }
    base.rmes.findings = base.rmes.findings.filter((f) => !(p.findings ?? []).some((x) => x.op === "add" && x.text === f.text && x.criterionId === f.criterionId));
  }
  const steps = [
    ...(p.results ?? []).map((x) => ({ label: `result ${x.criterionId}`, fn: (w) => A.recordCriterion(w, req.actor, base.id, x.criterionId, x.result, x.comment ?? "", req.at) })),
    ...(p.findings ?? []).map((x) => ({ label: `finding ${x.op}`, fn: (w) => (x.op === "close" ? A.closeFinding(w, req.actor, base.id, x.findingId, req.at) : A.addFinding(w, req.actor, base.id, x.criterionId, x.text, true, req.at)) })),
  ];
  if (p.decision) steps.push({ label: "decision", fn: (w) => A.rmesDecision(w, req.actor, base.id, dept, p.decision.value, p.decision.reason ?? "", req.at) });
  const world = worldFor(ctx, [base], { project: { [req.actor]: dept } });
  const { runSequence } = await import("../engine.mjs");
  const r = runSequence(world, base.id, steps);
  if (r.refusals.length) return { refused: true, text: r.refusals.map((x) => x.text).join(" "), caseCode: base.id };
  const res = await reconcile(ctx, { ...cs, before: cs.before }, caseIn(r.state, base.id), r, { triggerKey: req.key, actorId: req.actor, at: req.at, project: { [req.actor]: dept } });
  return { note: summary(res.report) };
}

/**
 * H-18 supplier.changed: a contact's e-mail changed, or a contact was deactivated (with a replacement) / reactivated.
 * `contactUserId` and `replacementUserId` are Kissflow user ids; the optional `supplierCode` names the supplier whose
 * contact is meant (needed only when the portal user is a contact of several suppliers).
 */
async function supplierChanged(ctx, req) {
  const p = req.payload;
  const by = ctx.directory.personaIdFor(req.actor, "admin");
  const codes = ctx.directory.suppliersOfUid(p.contactUserId);
  if (!p.supplierCode && codes.length > 1) return { refused: true, text: `This portal user is a contact of ${codes.length} suppliers (${codes.join(", ")}). File the change again with the supplier's code (supplierCode).` };
  const notThere = { refused: true, text: `This portal user is not a contact of ${p.supplierCode}.` };
  if (p.supplierCode && codes.length && !codes.includes(p.supplierCode)) return notThere;
  const contact = ctx.directory.byId(ctx.directory.contactIdFor(p.contactUserId, p.supplierCode) ?? p.contactUserId);
  if (!contact) return { refused: true, text: "This contact is not known to the service." };
  if (p.supplierCode && contact.supplierId !== p.supplierCode) return notThere;
  // Open cases that name the contact, loaded in full.
  const stores = [];
  for (const r of ctx.caseRows) {
    const L = readLedger(r);
    if (["completed", "cancelled"].includes(L.core.phase) || !(L.core.contactIds ?? []).map((id) => ctx.directory.supplierIdFor(id, r.Supplier_Code)).includes(contact.id)) continue;
    stores.push(await loadCase(ctx, r.Case_Code));
  }
  // The world as it was before the administrator's change (the payload carries it), then the prototype action.
  const before = p.before ?? {};
  const users = ctx.directory.users({}).map((u) => (u.id === contact.id ? { ...u, ...(before.email ? { email: before.email.toLowerCase() } : {}), ...(before.active !== undefined ? { active: before.active } : {}) } : u));
  const { buildWorld } = await import("../engine.mjs");
  const world = buildWorld({ users, suppliers: ctx.directory.suppliers, config: ctx.config, cases: stores.map((s) => s.before), changeReports: [] });
  const fn =
    p.change === "email"
      ? (w) => D.updateContact(w, by, contact.id, { email: p.after?.email ?? contact.email }, req.at)
      : (w) => D.setContactActive(w, by, contact.id, p.change === "reactivate", p.replacementUserId ? (ctx.directory.contactIdFor(p.replacementUserId, contact.supplierId) ?? p.replacementUserId) : p.replacementUserId, req.at);
  const r = runAction(world, null, fn);
  if (r.refused) return { refused: true, text: r.refusal };
  let n = 0;
  for (const cs of stores) {
    const after = caseIn(r.state, cs.before.id);
    const audits = after.audit.slice(cs.before.audit.length);
    const mails = r.newMails.filter((m) => m.caseId === cs.before.id);
    if (!audits.length && !mails.length && JSON.stringify(after) === JSON.stringify(cs.before)) continue;
    // reconcile with the directory as it is now (the administrator's change is live)
    await reconcile(ctx, cs, after, { newAudit: audits, newMails: mails }, { triggerKey: `${req.key}:${cs.before.id}`, actorId: req.actor, at: req.at });
    n++;
  }
  await writeAudit(ctx, r.newLog, { key: `${req.key}#log`, category: "Supplier master", objectKind: "Supplier", objectKey: contact.supplierId });
  return { note: `Done: ${n} open case(s) updated.` };
}

/** config.published: the Workbench published a release (B-49); the service checks its hashes and records it. */
async function configPublished(ctx, req) {
  const rel = ctx.config.releaseByRowId[req.payload.releaseRowId ?? req.row.Object_Key];
  if (!rel) return { refused: true, text: "The release row is not known (reload the configuration)." };
  const content = bundleHash(rel.bundle);
  const stated = rel.row.Content_Hash;
  if (stated && stated !== content) return { refused: true, text: `The release ${rel.row.Release_Label} does not match its content hash.` };
  const json = portalBundle(rel, ctx.config.settings);
  const size = Buffer.byteLength(JSON.stringify(json));
  await writeAudit(ctx, [{ at: req.at, by: req.actor, kind: "config", action: "Published configuration", detail: `${rel.row.Release_Label}: content hash verified; supplier bundle ${Math.round(size / 102.4) / 10} KB.` }], { key: `${req.key}#cfg`, category: "Configuration", objectKind: "Configuration", objectKey: rel.row.Release_Key });
  return { note: "Release recorded." };
}

async function followupStarted(ctx, req) {
  await writeAudit(ctx, [{ at: req.at, by: req.actor, action: "Follow-up case started", detail: `Follow-up of ${req.row.Case_Code} (${req.payload.reportId ?? ""}): ${req.payload.newCaseCode ?? ""}`.trim() }], { key: `${req.key}#fu`, caseCode: req.row.Case_Code, category: "Case" });
  return { note: "Recorded." };
}

/** H-20 reminders.run: H-19 now (business administrator only, prototype check reminders.run). */
async function remindersRun(ctx, req) {
  const by = ctx.directory.personaIdFor(req.actor, "admin");
  const probe = worldFor(ctx, []);
  const denied = D.check(probe, by, "reminders.run");
  if (denied) return { refused: true, text: denied };
  const n = await runRemindersFor(ctx, { now: ctx.now(), keyPrefix: req.key });
  return { note: `Reminders run: ${n} e-mail(s).` };
}

export const HANDLERS = {
  "case.created": caseCreated,
  "case.cancel": (ctx, req) => caseAction(ctx, req, { project: { [req.actor]: "RMM" }, fn: (w, c) => A.cancelCase(w, req.actor, c.id, req.payload.reason ?? "", req.at) }),
  // H-13: reactivation unlocks the questionnaire; a save that reached the cancelled request goes first (refused)
  "case.reactivate": async (ctx, req) => {
    await mirrorPendingSave(ctx, req.row.Case_Code, { whenLocked: true });
    return caseAction(ctx, req, {
      project: { [req.actor]: "RMM" },
      fn: (w, c) => A.reactivateCase(w, req.actor, c.id, req.payload.reason ?? "", req.at, req.payload.dueDate ? toIsoDay(req.payload.dueDate) : undefined),
      opts: { caseFields: { Reactivate_Reason: req.payload.reason, Reactivated_At: req.at }, reason: req.payload.reason, scopeTrigger: undefined },
    });
  },
  "op.raise": opRaise,
  "op.accepted": opDecide("accept"),
  "op.returned": opDecide("return"),
  "op.notaccepted": opDecide("not-accepted"),
  "op.edited": opDecide("edited"),
  "op.closed": opDecide("closed"),
  "review.completed": reviewCompletedReq,
  // H-09/H-10: a reopen in final-release unlocks the questionnaire; a save that reached the locked request goes first (refused)
  "review.reopen": async (ctx, req) => {
    await mirrorPendingSave(ctx, req.row.Case_Code, { whenLocked: true });
    return caseAction(ctx, req, { project: { [req.actor]: req.payload.dept }, fn: (w, c) => A.reopenReview(w, req.actor, c.id, req.payload.dept, req.payload.reason ?? "", req.at), opts: { reason: req.payload.reason } });
  },
  "review.reassign": (ctx, req) =>
    caseAction(ctx, req, { project: { [req.actor]: req.payload.dept, [req.payload.toUserId]: req.payload.dept }, fn: (w, c) => A.reassignReview(w, req.actor, c.id, req.payload.dept, req.payload.toUserId, req.payload.reason ?? "", req.at), opts: { reason: req.payload.reason } }),
  "section.add": (ctx, req) =>
    caseAction(ctx, req, { project: { [req.actor]: req.payload.dept }, fn: (w, c) => A.extendScope(w, req.actor, c.id, req.payload.sectionId, req.payload.justification ?? "", req.at), opts: { scopeTrigger: "Department addition", reason: req.payload.justification } }),
  "rmes.saved": rmesSaved,
  "followup.started": followupStarted,
  "supplier.changed": supplierChanged,
  "config.published": configPublished,
  "reminders.run": remindersRun,
};

export { commitLedger, ROLE };
