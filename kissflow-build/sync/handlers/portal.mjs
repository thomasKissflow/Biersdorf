// Portal polling (plan v5 §8.2): the items whose ids the service stored, read with the admin GET (P5: no listing).
//   H-05 a CIQP Query completed (the supplier answered)          → supplierRespond
//   H-02 CIQP Request Answers_Rev changed (the supplier saved)    → saveConfig / setAnswer / setComponents /
//        setJustification / uploadDocument — which also give H-07 (Part 2 growth), H-21 (RMES refresh) and, since
//        Thomas 15 Oct, the reopen of a completed review whose department owns the changed section (H-09: a new
//        CIQ Review item). While the final release is requested the request is locked: a save that still arrives is
//        refused and logged "Change attempt refused", nothing is mirrored (as after the release, B-35), and the request's
//        supplier JSON is set back to the case (the refused values neither stay on display nor come back after a reopen;
//        refused uploads are marked handled). A save still waiting to be mirrored goes before a Workbench action that
//        locks or unlocks the questionnaire (mirrorPendingSave: H-08, H-09/H-10, H-13), so the lock only refuses what
//        reached the request after it.
//   H-03 the request moved to "keep the CIQ up to date"          → confirmCompleteness
//   H-11 CIQP Final Release completed                            → finalRelease (+ final document, seal, case end)
//   H-16 Change_Report_Rev changed (completed case)              → reportChange
//   H-08 a CIQ Review item seen completed                        → completeReview (see requests.mjs)
// H-10 (release withdrawn) and H-09 (late activation) are effects of the actions above, carried out by reconcile.mjs.
// Order per case: answers to queries first (their uploads are claimed), then saves, completeness, release, reports.
// Every actor here is a SUPPLIER actor (identity.mjs): found by the portal's own *_By_Email fields at the case's supplier,
// else by the item's platform modifier mapped to its contact; never by an id look-up that could land on an internal user.
// The modifier is never used when it is the key's own user (CIQ_SERVICE_USER_ID, or the item's creator: the service
// creates every portal item): that write is the service's, or (dev) the key's user is also the portal user and only the
// e-mail fields can tell. For a step SUBMIT (completeness, a query answer, the final release) a human modifier who is a
// contact of the case's supplier is the platform's own record of who acted: it wins over a client-written e-mail that
// names a different contact (the mismatch is logged, ids only).

import { FLOW, F, STEP } from "../ids.mjs";
import { D, A, J, readLedger } from "../engine.mjs";
import { flushDebounced } from "../mail.mjs";
import { LOCKED_PHASES } from "../reconcile.mjs";
import { kfId as kfIdOf } from "../identity.mjs";
import { loadCase, applyToCase, writeAudit, commitLedger, contactByEmail } from "./common.mjs";
import { reviewCompleted } from "./requests.mjs";

const RESPONSE_CANNOT = "Cannot provide";

const idOf = (v) => (v && typeof v === "object" ? v._id : v);

/** The item's platform modifier as a contact of supplier `code`, unless it is the key's own user. */
function modifierContact(ctx, item, code) {
  const mod = idOf(item?._modified_by);
  if (!mod) return undefined;
  if ((ctx.port.serviceUserId && mod === ctx.port.serviceUserId) || mod === idOf(item?._created_by)) return undefined;
  return ctx.directory.contactIdFor(mod, code);
}

/**
 * The supplier actor of a portal write: by e-mail (the portal's own fields) at supplier `code`, else the item's platform
 * modifier mapped to its contact (never the key's own user). `submitted`: the item's step was submitted, so its human
 * modifier is the submitter and wins over an e-mail naming another contact.
 */
function supplierActor(ctx, email, item, code, { submitted = false } = {}) {
  const byMail = contactByEmail(ctx, email, code)?.id;
  const byMod = modifierContact(ctx, item, code);
  if (submitted && byMod && byMail && byMail !== byMod) {
    const what = `${item?._id ?? "?"}`;
    ctx.log?.({ ev: "actor-mismatch", item: what, email_contact: ctx.directory.kfId(byMail), modifier: ctx.directory.kfId(byMod) });
    ctx.warnings?.add(`identity: portal item ${what} names contact ${ctx.directory.kfId(byMail)} in its e-mail field, but was submitted by ${ctx.directory.kfId(byMod)}: the submitter is used`);
    return byMod;
  }
  return byMail ?? byMod ?? null;
}

// L5/H1 (matrix v0.6, 28 Oct): an unanswered Additive stays null and a blank or non-numeric concentration stays null, as
// the portal stores them (never false, never 0); the domain's completeness check then asks for them
const numOrNull = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const normComp = (r) => {
  const o = { id: String(r.id), inci: r.inci ?? "", fn: r.fn ?? "", additive: typeof r.additive === "boolean" ? r.additive : null, origin: r.origin, concMin: numOrNull(r.concMin), concMax: numOrNull(r.concMax) };
  if (r.cas) o.cas = r.cas;
  if (r.ec) o.ec = r.ec;
  return o;
};
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** Every upload id a query answer points to (Response_Doc_Refs_JSON): those are applied by H-05, never by H-02. */
async function claimedUploads(ctx, cs) {
  const ids = new Set();
  for (const op of cs.before.openPoints) {
    for (const [k, qid] of Object.entries(cs.ledger.items)) {
      if (!k.startsWith(`query:${op.id}:`)) continue;
      const q = await ctx.port.getProcessItemAdmin(FLOW.query, qid);
      for (const u of J(q?.Response_Doc_Refs_JSON, [])) ids.add(typeof u === "string" ? u : u.uploadId ?? u.Upload_Id);
    }
  }
  return ids;
}

/** H-05: a completed CIQP Query becomes the supplier's answer on the point. */
async function queryAnswers(ctx, code, req) {
  let done = 0;
  for (;;) {
    const cs = await loadCase(ctx, code);
    const L = cs.ledger;
    let hit = null;
    for (const op of cs.before.openPoints.filter((p) => p.status === "open")) {
      const qid = L.items[`query:${op.id}:r${op.rounds}`];
      if (!qid || L.queriesSeen?.[qid]) continue;
      const q = await ctx.port.getProcessItemAdmin(FLOW.query, qid);
      if (q?._status === "Completed") {
        hit = { op, q };
        break;
      }
    }
    if (!hit) return done;
    const { op, q } = hit;
    const actor = supplierActor(ctx, q.Supplier_Responsible_Email, q, cs.before.supplierId, { submitted: true });
    const uploads = (req?.[`Table::${F.request.uploads.table}`] ?? []).filter((u) => J(q.Response_Doc_Refs_JSON, []).some((x) => (typeof x === "string" ? x : x.uploadId ?? x.Upload_Id) === u.Upload_Id));
    const cannot = q.Response_Kind === RESPONSE_CANNOT;
    const text = (q.Response_Text ?? "").trim() || (uploads.length ? `Document provided: ${uploads.map((u) => u.Upload_File_Name).join(", ")}.` : "");
    const at = q._completed_at ?? q._modified_at ?? ctx.now();
    const steps = [
      ...uploads.slice(1).map((u) => ({ label: `upload ${u.Upload_Id}`, fn: (w) => A.uploadDocument(w, actor, code, { name: u.Upload_File_Name, kind: u.Upload_Doc_Kind || "Other", sectionId: op.ref.sectionId, fieldId: op.ref.fieldId }, at, true).state, after: mapUpload(L, u) })),
      { label: "answer", fn: (w) => A.supplierRespond(w, actor ?? "unknown", code, op.id, { text, cannotProvide: cannot, documentName: uploads[0]?.Upload_File_Name }, at), after: uploads[0] ? mapUpload(L, uploads[0]) : undefined },
    ];
    L.queriesSeen = { ...(L.queriesSeen ?? {}), [q._id]: true };
    const r = await applyToCase(ctx, cs, { triggerKey: `qa:${q._id}`, actorId: actor, at, steps, opts: { portalRef: q._id } });
    if (r.refused || r.refusals?.some((x) => x.label === "answer")) {
      const why = r.text ?? r.refusals.find((x) => x.label === "answer")?.text;
      await writeAudit(ctx, [{ at, by: actor ?? "system", action: "Answer not applied", detail: `${op.id}: ${why}` }], { key: `qa:${q._id}#refused`, caseCode: code, category: "Open point" });
      await commitLedger(ctx, cs);
    }
    done++;
  }
}

const mapUpload = (L, u) => (state) => {
  const c = state.cases[0];
  const doc = c.documents.at(-1);
  if (doc) {
    L.uploads = { ...(L.uploads ?? {}), [u.Upload_Id]: doc.id };
    if (u.Upload_Attachment_Id) L.uploadAtt = { ...(L.uploadAtt ?? {}), [u.Upload_Id]: u.Upload_Attachment_Id };
  }
  return state;
};

/**
 * The request's supplier JSON brought back to the canonical case, for a save refused on a locked request (B-04, B-35;
 * Thomas, 15 Oct): only the keys that differ, with their stamps as the case has them. Otherwise the portal would keep
 * showing the refused values as saved, and the next save after a reopen would mirror them with their old stamps.
 */
function restoredSupplierFields(ctx, c, req, refusedUploads) {
  const dir = ctx.directory;
  const kfId = (id) => kfIdOf(id, dir.mintedIds);
  const who = J(req.Answered_By_JSON, {});
  const touched = new Set();
  const out = {};
  const restoreStamp = (k) => {
    const st = c.answeredBy?.[k];
    if (st) who[k] = { name: dir.nameOf(st.by), email: dir.emailOf(st.by) || "", at: st.at, by: kfId(st.by) };
    else delete who[k];
    touched.add(k);
  };
  const cfg = J(req.Config_Answers_JSON, {});
  const cfgKeys = Object.keys({ ...cfg, ...c.config }).filter((k) => /^SF\d\d$/.test(k) && k !== "SF11" && !same(cfg[k], c.config[k]));
  if (cfgKeys.length) {
    for (const k of cfgKeys) {
      if (c.config[k] === undefined) delete cfg[k];
      else cfg[k] = c.config[k];
      restoreStamp(k);
    }
    out.Config_Answers_JSON = JSON.stringify(cfg);
  }
  // the same keys supplierSave compares (BDF-set values and file answers are never on the request's Answers_JSON)
  const ans = J(req.Answers_JSON, {});
  const ansKeys = Object.keys({ ...ans, ...c.answers }).filter((k) => !D.BDF_SET_FIELDS.includes(k) && D.fieldOf(k, c.templateVersion, ctx.config.cfg)?.type !== "file" && !same(ans[k] ?? null, c.answers[k] ?? null));
  if (ansKeys.length) {
    for (const k of ansKeys) {
      if (c.answers[k] === undefined) delete ans[k];
      else ans[k] = c.answers[k];
      restoreStamp(k);
    }
    out.Answers_JSON = JSON.stringify(ans);
  }
  const just = J(req.Justifications_JSON, {});
  const justKeys = Object.keys({ ...just, ...c.justifications }).filter((k) => (just[k] ?? "") !== (c.justifications[k] ?? ""));
  if (justKeys.length) {
    for (const k of justKeys) {
      if (c.justifications[k]) just[k] = c.justifications[k];
      else delete just[k];
      restoreStamp(k);
    }
    out.Justifications_JSON = JSON.stringify(just);
  }
  const rows = J(req.Components_JSON, null);
  if (Array.isArray(rows) && !same(rows.map(normComp), c.components.map(normComp))) {
    out.Components_JSON = JSON.stringify(c.components);
    restoreStamp("K2.1:components");
  }
  for (const u of refusedUploads) if (u.Upload_Field_Key && !touched.has(u.Upload_Field_Key) && who[u.Upload_Field_Key] && !same(who[u.Upload_Field_Key], c.answeredBy?.[u.Upload_Field_Key])) restoreStamp(u.Upload_Field_Key);
  if (touched.size) out.Answered_By_JSON = JSON.stringify(who);
  return out;
}

/**
 * H-02 catch-up (Thomas, 15 Oct): mirror a save the portal took that the service has not mirrored yet, before a
 * Workbench action that locks or unlocks the questionnaire (a review completion, a reopen, a reactivation). A save made
 * while the questionnaire was open is then never refused by the lock that action sets; one that reached a locked request
 * is refused and set back before the action unlocks it. `whenLocked`: only if the case is locked now.
 */
export async function mirrorPendingSave(ctx, code, { whenLocked = false } = {}) {
  const cs = await loadCase(ctx, code);
  const id = cs?.ledger.items.request;
  if (!id || (whenLocked && !LOCKED_PHASES.has(cs.before.phase))) return false;
  const req = await ctx.port.getProcessItemAdmin(FLOW.request, id);
  if (!req || Number(req.Answers_Rev ?? 0) <= (cs.ledger.answersRev ?? 0)) return false;
  return supplierSave(ctx, code, req);
}

/** H-02: mirror a supplier save into the canonical case with the prototype's own actions (attribution per key). */
async function supplierSave(ctx, code, req) {
  const cs = await loadCase(ctx, code);
  const L = cs.ledger;
  const rev = Number(req.Answers_Rev ?? 0);
  if (rev <= (L.answersRev ?? 0)) return false;
  const c = cs.before;
  // On a locked case (final release requested, completed, cancelled) the prototype's guard refuses every supplier write.
  const locked = LOCKED_PHASES.has(c.phase);
  const who = J(req.Answered_By_JSON, {});
  const code0 = c.supplierId;
  const fallbackActor = supplierActor(ctx, req.Answers_Changed_By_Email, req, code0);
  const actorOf = (k) => contactByEmail(ctx, who[k]?.email, code0)?.id ?? (who[k]?.by ? ctx.directory.contactIdFor(who[k].by, code0) : undefined) ?? fallbackActor;
  const atOf = (k) => who[k]?.at ?? req.Answers_Changed_At ?? ctx.now();
  const steps = [];
  // metadata (SF-01…SF-12; SF-11 stays RMM's)
  const cfg = J(req.Config_Answers_JSON, {});
  const cfgKeys = Object.keys({ ...cfg, ...c.config }).filter((k) => /^SF\d\d$/.test(k) && k !== "SF11" && !same(cfg[k], c.config[k]));
  const byActor = new Map();
  for (const k of cfgKeys) {
    const a = actorOf(k);
    (byActor.get(a) ?? byActor.set(a, []).get(a)).push(k);
  }
  for (const [a, keys] of byActor) steps.push({ label: `config ${keys.join(",")}`, fn: (w) => A.saveConfig(w, a, code, Object.fromEntries(keys.map((k) => [k, cfg[k]])), keys.map(atOf).sort().at(-1)) });
  // answers (BDF-set GEN fields and file questions are not answers the supplier writes here)
  const ans = J(req.Answers_JSON, {});
  for (const k of Object.keys({ ...ans, ...c.answers })) {
    if (D.BDF_SET_FIELDS.includes(k)) continue;
    const f = D.fieldOf(k, c.templateVersion, ctx.config.cfg);
    if (f?.type === "file") continue;
    if (!(k in ans) && !(k in c.answers)) continue;
    if (same(ans[k] ?? null, c.answers[k] ?? null)) continue;
    steps.push({ label: `answer ${k}`, fn: (w) => A.setAnswer(w, actorOf(k), code, k, ans[k] ?? null, atOf(k)) });
  }
  // K2.1 rows
  const rows = J(req.Components_JSON, null);
  if (Array.isArray(rows) && !same(rows.map(normComp), c.components.map(normComp))) steps.push({ label: "components", fn: (w) => A.setComponents(w, actorOf("K2.1:components"), code, rows.map(normComp), atOf("K2.1:components")) });
  // justifications
  const just = J(req.Justifications_JSON, {});
  for (const k of Object.keys({ ...just, ...c.justifications })) if ((just[k] ?? "") !== (c.justifications[k] ?? "")) steps.push({ label: `justification ${k}`, fn: (w) => A.setJustification(w, actorOf(k), code, k, just[k] ?? "", atOf(k)) });
  // uploads not yet mirrored, not refused on a locked request and not claimed by a query answer
  const claimed = await claimedUploads(ctx, cs);
  const refusedUploads = [];
  for (const u of req[`Table::${F.request.uploads.table}`] ?? []) {
    if (!u.Upload_Id || L.uploads?.[u.Upload_Id] || L.uploadsRefused?.[u.Upload_Id] || claimed.has(u.Upload_Id)) continue;
    if (locked) refusedUploads.push(u);
    const actor = contactByEmail(ctx, u.Uploaded_By_Email, code0)?.id ?? fallbackActor;
    steps.push({ label: `upload ${u.Upload_Id}`, fn: (w) => A.uploadDocument(w, actor, code, { name: u.Upload_File_Name ?? u.Upload_Id, kind: u.Upload_Doc_Kind || "Other", sectionId: u.Upload_Section_Key || "GEN", fieldId: u.Upload_Field_Key || undefined }, u.Uploaded_At ?? atOf(u.Upload_Field_Key)).state, after: mapUpload(L, u) });
  }
  L.answersRev = rev;
  L.answersChangedAt = req.Answers_Changed_At;
  if (!steps.length) {
    await commitLedger(ctx, cs);
    return true;
  }
  // Locked: every step is refused (and logged by the prototype's guard); the uploads are marked handled for good and the
  // request's JSON is set back to the case in the same reconcile pass, before the ledger commit (a deferral retries both).
  if (refusedUploads.length) L.uploadsRefused = { ...(L.uploadsRefused ?? {}), ...Object.fromEntries(refusedUploads.map((u) => [u.Upload_Id, true])) };
  const requestFields = locked ? restoredSupplierFields(ctx, c, req, refusedUploads) : undefined;
  const r = await applyToCase(ctx, cs, { triggerKey: `ans:${code}:${rev}`, actorId: fallbackActor, at: req.Answers_Changed_At ?? ctx.now(), steps, opts: { portalRef: req._id, answersRev: rev, ...(requestFields ? { requestFields } : {}) } });
  // A change the prototype refused without its own audit entry is still recorded (B-04, B-35). On a locked case (the
  // final release requested since Thomas, 15 Oct; completed; cancelled) the prototype's guard has already logged each
  // attempt as "Change attempt refused" (in r.newAudit, written by the reconcile pass), so nothing is added here.
  const silent = (r.refusals ?? []).filter((x) => !/Change attempt refused/.test(x.text));
  if (silent.length && !locked) {
    await writeAudit(ctx, silent.map((x) => ({ at: req.Answers_Changed_At ?? ctx.now(), by: fallbackActor ?? "system", action: "Change not applied", detail: `${x.label}: ${x.text}` })), { key: `ans:${code}:${rev}#refused`, caseCode: code, category: "Change attempt" });
  }
  if (r.already) await commitLedger(ctx, cs);
  return true;
}

/** H-03: the supplier submitted "fill in the CIQ" (completeness, B-10). */
async function completeness(ctx, code, req) {
  const cs = await loadCase(ctx, code);
  if (cs.before.phase !== "supplier-input") return false;
  const step = ctx.port.currentStep(req);
  if (step?.name !== STEP.request.keep.name) return false;
  const actor = supplierActor(ctx, req.Completeness_By_Email, req, cs.before.supplierId, { submitted: true });
  const at = req.Completeness_At ?? ctx.now();
  const key = `cmp:${code}:${req.Answers_Rev ?? 0}`;
  if (cs.ledger.completenessRefused === key) return false;
  const r = await applyToCase(ctx, cs, { triggerKey: key, actorId: actor, at, fn: (w) => A.confirmCompleteness(w, actor ?? "unknown", code, at), opts: { portalRef: req._id } });
  if (r.refused) {
    // The portal UI allowed it but the service's engine finds blockers (or data was lost, P3): do not move the case.
    // The supplier keeps the item at "keep the CIQ up to date"; the next save is checked again.
    cs.ledger.completenessRefused = key;
    cs.ledger.alerts = [...(cs.ledger.alerts ?? []), { at: ctx.now(), what: `completeness not applied: ${r.text}` }].slice(-50);
    await writeAudit(ctx, [{ at, by: actor ?? "system", action: "Completeness confirmation not applied", detail: r.text }], { key: `${key}#refused`, caseCode: code, category: "Case" });
    await commitLedger(ctx, cs);
  }
  return !r.refused;
}

/** H-11: the supplier gave the final release. */
async function finalRelease(ctx, code) {
  const cs = await loadCase(ctx, code);
  const relId = cs.ledger.items.releaseCurrent;
  if (!relId || cs.ledger.releasesSeen?.[relId]) return false;
  const rel = await ctx.port.getProcessItemAdmin(FLOW.release, relId);
  if (rel?._status !== "Completed") return false;
  const actor = supplierActor(ctx, rel.Confirmed_By_Email, rel, cs.before.supplierId, { submitted: true });
  const at = rel.Confirmed_At ?? rel._modified_at ?? ctx.now();
  cs.ledger.releasesSeen = { ...(cs.ledger.releasesSeen ?? {}), [relId]: true };
  const r = await applyToCase(ctx, cs, { triggerKey: `rel:${relId}`, actorId: actor, at, fn: (w) => A.finalRelease(w, actor ?? "unknown", code, at), opts: { portalRef: relId } });
  if (r.refused) {
    await writeAudit(ctx, [{ at, by: actor ?? "system", action: "Final release not applied", detail: r.text }], { key: `rel:${relId}#refused`, caseCode: code, category: "Case" });
    await commitLedger(ctx, cs);
  }
  return !r.refused;
}

/** H-16: "Report a change" on a completed case. The reporter is Change_Report_By_Email / Change_Report_At (portal fields
 *  added 14 Oct); older items without them fall back to Answers_Changed_By_Email / Answers_Changed_At. */
async function changeReport(ctx, code, req) {
  const cs = await loadCase(ctx, code);
  const rev = Number(req.Change_Report_Rev ?? 0);
  if (rev <= (cs.ledger.changeReportRev ?? 0)) return false;
  const actor = supplierActor(ctx, req.Change_Report_By_Email ?? req.Answers_Changed_By_Email, req, cs.before.supplierId);
  const at = req.Change_Report_At ?? req.Answers_Changed_At ?? req._modified_at ?? ctx.now();
  cs.ledger.changeReportRev = rev;
  const r = await applyToCase(ctx, cs, { triggerKey: `cr:${code}:${rev}`, actorId: actor, at, fn: (w) => A.reportChange(w, actor ?? "unknown", code, req.Change_Report_Text ?? "", at), opts: { portalRef: req._id } });
  if (r.refused) {
    await writeAudit(ctx, [{ at, by: actor ?? "system", action: "Change report not applied", detail: r.text }], { key: `cr:${code}:${rev}#refused`, caseCode: code, category: "Change request" });
    await commitLedger(ctx, cs);
  }
  return true;
}

/** H-08 by polling: a CIQ Review item completed in the Workbench (the request may follow; whichever is first applies). */
async function reviewCompletions(ctx, code) {
  let n = 0;
  const cs = await loadCase(ctx, code);
  for (const t of cs.before.reviews.filter((r) => r.status !== "completed" && r.itemId)) {
    const item = await ctx.port.getProcessItemAdmin(FLOW.review, t.itemId);
    if (item?._status !== "Completed" || t.refusedItemId === item._id) continue;
    const fresh = await loadCase(ctx, code);
    const res = await reviewCompleted(ctx, { cs: fresh, dept: t.dept, actor: item.Completed_By?._id ?? item._modified_by?._id, at: item.Completed_At ?? item._modified_at ?? ctx.now(), key: `rv:${item._id}`, fromPoll: true });
    if (!res.note?.startsWith("not completed")) n++;
  }
  return n;
}

/** Due C-10 mails of the debounce buffer (10 min of quiet). */
async function flushMail(ctx, code) {
  const cs = await loadCase(ctx, code);
  if (!cs.ledger.pendingMail?.length) return 0;
  const { due, keep } = flushDebounced(cs.ledger.pendingMail, ctx.now(), ctx.debounceMs);
  if (!due.length) return 0;
  const keys = await ctx.index(FLOW.outbox, "Mail_Key");
  for (const r of due) {
    if (keys.has(r.Mail_Key)) continue;
    await ctx.port.createFormRow(FLOW.outbox, r);
    keys.add(r.Mail_Key);
  }
  cs.ledger.pendingMail = keep;
  await commitLedger(ctx, cs);
  return due.length;
}

/** One case's portal poll, in the order above. Returns what happened. */
export async function pollCase(ctx, row, { closedToo = false } = {}) {
  const code = row.Case_Code;
  const fresh = (await ctx.port.getFormRow(FLOW.caseData, row._id)) ?? row;
  const L = readLedger(fresh);
  const phase = L.core.phase;
  const out = { case: code, answers: 0, saves: 0, completeness: 0, release: 0, reports: 0, reviews: 0, mails: 0 };
  const closed = phase === "completed" || phase === "cancelled";
  if (closed && !closedToo) return out;
  const req = L.items.request ? await ctx.port.getProcessItemAdmin(FLOW.request, L.items.request) : null;
  if (!req) return out;
  if (!closed) {
    out.answers = await queryAnswers(ctx, code, req);
    out.saves = (await supplierSave(ctx, code, req)) ? 1 : 0;
    out.completeness = (await completeness(ctx, code, req)) ? 1 : 0;
    out.release = (await finalRelease(ctx, code)) ? 1 : 0;
    out.reviews = await reviewCompletions(ctx, code);
  } else {
    // a closed case (every 15 min): "Report a change", and changes that are refused and logged (B-04, B-35)
    out.saves = (await supplierSave(ctx, code, req)) ? 1 : 0;
  }
  out.reports = (await changeReport(ctx, code, req)) ? 1 : 0;
  out.mails = await flushMail(ctx, code);
  return out;
}
