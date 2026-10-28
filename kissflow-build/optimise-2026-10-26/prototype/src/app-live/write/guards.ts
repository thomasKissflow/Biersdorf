// Live-only pre-checks (DESIGN §6 "Live pre-guard" column). Owner C.
// The store runs liveGuard BEFORE the pure domain action (DESIGN §6 step 2): a text refuses the action with a danger
// toast and nothing is written. These checks cover only what the domain can't know: whether this role holds the
// Kissflow task the write needs, whether the item and child-row ids are known (a child row written with an unknown
// `_id` is ADDED as a duplicate, never updated), whether the configuration release exists, and the parts of a method
// that are out of scope tonight (§1.2). The domain's own rules still run after this (no domain logic is copied here).
// The texts are the user's (FE-CLEANUP C22, 22 Oct): what can't be done and what to do, no Kissflow item, flow or list
// names, in both environments.
import { DEPT_SHORT } from "@/domain/catalog";
import { currentPair, pairLabel } from "@/domain/configActions";
import type { NewCaseInput } from "@/domain/actions";
import { contactDeactivationImpact, type SupplierInput, type SupplierPatch } from "@/domain/suppliers";
import type { AppState, ReviewDept } from "@/domain/types";
import { STEPS } from "../ids";
import { NOT_IN_APP } from "../kf/client";
import { releaseForPair } from "../map/config";
import type { CaseRef, OpRef, ReviewRef, RmesRef, SupplierRef, WritableMethod, WriteCtx } from "../types";
import { NO_PORTAL_CONTACT } from "../userText";
import { countryCode, isPortalUser } from "./encode";

/** Why an RMES record is missing: an unreadable case never gets one (write/activation.ts ensureRmes), so "reload" would not help. */
function rmesMissing(ctx: WriteCtx, caseId: string): string {
  return ctx.index.cases.get(caseId)?.readable === false ? GUARD_TEXT.rmesCaseUnreadable : GUARD_TEXT.rmesUnknown;
}

export const GUARD_TEXT = {
  caseUnknown: "This case can't be changed from your role right now. Reload and try again.",
  opNotHeld: "This open point is not one of your open tasks in Kissflow (it may have moved on). Reload to see its current state.",
  reviewNotHeld: (dept: ReviewDept) => `The ${DEPT_SHORT[dept]} review of this case is not one of your open tasks in Kissflow (it may have moved on). Reload to see its current state.`,
  rmesUnknown: "The RMES record could not be read; reload.",
  rmesCaseUnreadable: "The RMES record can't be prepared because your role can't read this case's questionnaire. Ask your CIQ administrator to check your role's access.",
  rowUnknown: "This RMES entry is not fully loaded yet. Reload and try again.",
  rmmCompleted: "RMM has completed its review. Ask RMM to reopen it before you record Rejected.",
  reopenNotRmm: "Ask RMM: only RMM can restart a review in this version.",
  noEmail: "Your Kissflow account has no e-mail address, and the supplier needs one to reach Beiersdorf. Ask the administrator to add it, then start the case.",
  noRelease: (pair: string) => `Questionnaire ${pair} has no published version, so a case can't be started on it. Ask the Business administrator.`,
  // caseStartPayload's backstop reads the same (userText.ts startText, C21+); TEST-GUIDE-PROD quotes its first sentence
  noPortalContact: NO_PORTAL_CONTACT,
  noConfirmer: "None of the chosen contacts with a portal user may confirm completeness. Choose a contact who may confirm.",
  supplierUnknown: "This supplier is not fully loaded yet. Reload and try again.",
  // a new contact could get a key one of the unread rows holds
  contactsUnread: "This supplier's contacts could not be loaded just now. Reload, then add the contact.",
  contactUnknown: "This contact is not fully loaded yet. Reload and try again.",
  contactOnOpenCases: "This contact is named on open cases. Replacing a contact on running cases is not available in this version yet.",
  country: (c: string) => `“${c}” is not in the country list. Use a country of the list (EU countries, United Kingdom, Turkey, China, USA, Canada) or its two-letter code.`,
} as const;

// ---------------------------------------------------------------------------------- the refs a writer needs

/** The case's item in the index (every listed case has one: items and audit rows are keyed by it). */
export const caseRefOf = (ctx: Pick<WriteCtx, "index">, caseId: string): CaseRef | undefined => {
  const r = ctx.index.cases.get(caseId);
  return r?.itemId ? r : undefined;
};

/** The open point's item when this user holds its department step (raiser field assignment, G-11). */
export function heldOp(ctx: Pick<WriteCtx, "index">, s: AppState, caseId: string, opId: string): (OpRef & { itemId: string; act: string; activityId: string }) | undefined {
  const op = s.cases.find((c) => c.id === caseId)?.openPoints.find((p) => p.id === opId);
  const r = ctx.index.ops.get(opId);
  if (!op || !r?.live || !r.itemId || !r.act || r.activityId !== STEPS.op[op.dept]) return undefined;
  return r as OpRef & { itemId: string; act: string; activityId: string };
}

/** The department's review item of the case (latest round) when this user holds its department step. */
export function heldReview(ctx: Pick<WriteCtx, "index">, caseId: string, dept: ReviewDept): (ReviewRef & { itemId: string; act: string; activityId: string }) | undefined {
  const r = ctx.index.reviews.get(`${caseId}|${dept}`);
  if (!r?.live || !r.itemId || !r.act || r.activityId !== STEPS.review[dept]) return undefined;
  return r as ReviewRef & { itemId: string; act: string; activityId: string };
}

export const rmesRefOf = (ctx: Pick<WriteCtx, "index">, caseId: string, dept: "SAF" | "REG"): RmesRef | undefined => ctx.index.rmes.get(`${caseId}|${dept}`);

export const supplierRefOf = (ctx: Pick<WriteCtx, "index">, supplierId: string | undefined): SupplierRef | undefined => (supplierId ? ctx.index.suppliers.get(supplierId) : undefined);

/** The supplier row and contact row of a contact (by its domain user id). */
export function contactRowOf(ctx: Pick<WriteCtx, "index">, s: AppState, userId: string): { sup: SupplierRef; rowId: string } | undefined {
  const sup = supplierRefOf(ctx, s.users.find((u) => u.id === userId)?.supplierId);
  const rowId = sup?.contactRows[userId];
  return sup && rowId ? { sup, rowId } : undefined;
}

// ---------------------------------------------------------------------------------- the guard

const caseOf = (s: AppState, id: string) => s.cases.find((c) => c.id === id);

function createCaseGuard(ctx: WriteCtx, s: AppState, input: NewCaseInput | undefined): string | null {
  if (!ctx.identity.email.trim()) return GUARD_TEXT.noEmail;
  const pair = currentPair(s);
  if (!releaseForPair(ctx.index.releases, pair)) return GUARD_TEXT.noRelease(pairLabel(pair.ruleSetVersion, pair.templateVersion));
  // the same rule caseStartPayload applies (shared/caseStartPayload.ts:102), checked before the domain's state changes
  const contacts = (input?.contactIds ?? []).map((id) => s.users.find((u) => u.id === id)).filter((u) => !!u && u.active !== false);
  const portal = contacts.filter((u) => isPortalUser(u!.id));
  if (contacts.length && !portal.length) return GUARD_TEXT.noPortalContact;
  if (portal.length && !portal.some((u) => u!.mayConfirm !== false)) return GUARD_TEXT.noConfirmer;
  return null;
}

/** The criterion's or finding's department on the case's RMES record. */
const rmesDeptOf = (s: AppState, caseId: string, key: { criterionId?: string; findingId?: string }): "SAF" | "REG" | undefined => {
  const r = caseOf(s, caseId)?.rmes;
  if (key.criterionId) return r?.criteria.find((x) => x.id === key.criterionId)?.dept;
  return r?.findings.find((x) => x.id === key.findingId)?.dept;
};

/** Null when the live write can go ahead, else the refusal text (DESIGN §6 pre-guards). */
export function liveGuard(method: WritableMethod, ctx: WriteCtx, state: AppState, args: unknown[]): string | null {
  if (!ctx.containerOk) return NOT_IN_APP;
  const caseId = typeof args[0] === "string" ? args[0] : "";
  switch (method) {
    case "createCase":
      return createCaseGuard(ctx, state, args[0] as NewCaseInput | undefined);
    case "raiseOpenPoint":
    case "addInternalNote":
    case "cancelCase":
      return caseRefOf(ctx, caseId) ? null : GUARD_TEXT.caseUnknown;
    case "findingToQuery": {
      if (!caseRefOf(ctx, caseId)) return GUARD_TEXT.caseUnknown;
      const findingId = String(args[1] ?? "");
      const dept = rmesDeptOf(state, caseId, { findingId });
      if (!dept) return null; // the domain refuses an unknown finding
      return rmesRefOf(ctx, caseId, dept)?.findingRows[findingId] ? null : GUARD_TEXT.rowUnknown;
    }
    case "reviewResponse":
    case "editOpenPoint":
    case "closeOpenPoint":
      return heldOp(ctx, state, caseId, String(args[1] ?? "")) ? null : GUARD_TEXT.opNotHeld;
    case "recordCriterion":
    case "addFinding": {
      const criterionId = String(args[1] ?? "");
      const dept = rmesDeptOf(state, caseId, { criterionId });
      if (!dept) return null; // the domain refuses an unknown criterion
      const r = rmesRefOf(ctx, caseId, dept);
      if (!r) return rmesMissing(ctx, caseId);
      return method === "addFinding" || r.criteriaRows[criterionId] ? null : GUARD_TEXT.rowUnknown;
    }
    case "closeFinding": {
      const findingId = String(args[1] ?? "");
      const dept = rmesDeptOf(state, caseId, { findingId });
      if (!dept) return null;
      const r = rmesRefOf(ctx, caseId, dept);
      if (!r) return rmesMissing(ctx, caseId);
      return r.findingRows[findingId] ? null : GUARD_TEXT.rowUnknown;
    }
    case "rmesDecision": {
      const dept = args[1] as "SAF" | "REG";
      if (!heldReview(ctx, caseId, dept)) return GUARD_TEXT.reviewNotHeld(dept);
      if (!caseOf(state, caseId)?.rmes || !rmesRefOf(ctx, caseId, dept)) return rmesMissing(ctx, caseId);
      // the domain would reopen RMM's completed review, which Safety and Regulatory can't write in Kissflow
      if (args[2] === "rejected" && caseOf(state, caseId)?.reviews.find((r) => r.dept === "RMM")?.status === "completed") return GUARD_TEXT.rmmCompleted;
      return null;
    }
    case "completeReview": {
      const dept = args[1] as ReviewDept;
      if (!heldReview(ctx, caseId, dept)) return GUARD_TEXT.reviewNotHeld(dept);
      // without the record, reviewBlockers would skip the RMES checks (domain/selectors.ts:208)
      if ((dept === "SAF" || dept === "REG") && (!caseOf(state, caseId)?.rmes || !rmesRefOf(ctx, caseId, dept))) return rmesMissing(ctx, caseId);
      return null;
    }
    case "reassignReview": {
      const dept = args[1] as ReviewDept;
      return heldReview(ctx, caseId, dept) ? null : GUARD_TEXT.reviewNotHeld(dept);
    }
    case "reopenReview":
      if (args[1] !== "RMM") return GUARD_TEXT.reopenNotRmm;
      return caseRefOf(ctx, caseId) ? null : GUARD_TEXT.caseUnknown;
    case "addSupplier": {
      const input = args[0] as SupplierInput | undefined;
      return input && input.country.trim() && !countryCode(input.country) ? GUARD_TEXT.country(input.country.trim()) : null;
    }
    case "updateSupplier": {
      if (!supplierRefOf(ctx, caseId)) return GUARD_TEXT.supplierUnknown;
      const patch = args[1] as SupplierPatch | undefined;
      return patch?.country !== undefined && patch.country.trim() && !countryCode(patch.country) ? GUARD_TEXT.country(patch.country.trim()) : null;
    }
    case "addContact": {
      const sup = supplierRefOf(ctx, caseId);
      if (!sup) return GUARD_TEXT.supplierUnknown;
      // the domain picks the new key from the rows it knows (Supplier.contactKeys), and this load knows none of them
      return sup.contactsUnread ? GUARD_TEXT.contactsUnread : null;
    }
    case "updateContact":
      return contactRowOf(ctx, state, caseId) ? null : GUARD_TEXT.contactUnknown;
    case "setContactActive":
      if (!contactRowOf(ctx, state, caseId)) return GUARD_TEXT.contactUnknown;
      // the case.contacts cascade is not built tonight (DESIGN §1.2)
      if (args[1] === false && contactDeactivationImpact(state, caseId).openCases.length) return GUARD_TEXT.contactOnOpenCases;
      return null;
  }
  return null;
}
