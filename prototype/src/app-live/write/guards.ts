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
import { contactDeactivationImpact, type ContactInput, type SupplierInput, type SupplierPatch } from "@/domain/suppliers";
import type { AppState, ReviewDept } from "@/domain/types";
import { portalUserIdProblem } from "@/components/portalUser";
import { STEPS } from "../ids";
import { NOT_IN_APP } from "../kf/client";
import { releaseForPair } from "../map/config";
import { kfIdOfContact } from "../map/people";
import type { CaseRef, OpRef, ReviewRef, RmesRef, SupplierRef, WritableMethod, WriteCtx } from "../types";
import { NO_PORTAL_CONTACT } from "../userText";
import { isConfigMethod } from "./config";
import { countryCode, isPortalUser } from "./encode";

export const GUARD_TEXT = {
  caseUnknown: "This case can't be changed from your role right now. Reload and try again.",
  opNotHeld: "This open point is not one of your open tasks in Kissflow (it may have moved on). Reload to see its current state.",
  reviewNotHeld: (dept: ReviewDept) => `The ${DEPT_SHORT[dept]} review of this case is not one of your open tasks in Kissflow (it may have moved on). Reload to see its current state.`,
  // the record is created on the reviewer's load (write/activation.ts ensureRmes), also for a case the role can't read
  rmesUnknown: "Your department's RMES record of this case was not found. Reload the page (close and reopen CIQ Digital): the record is created then.",
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
  // 26 Oct: the configuration editor is the Business administrator's (CIQ Config Version create and edit)
  configNotAdmin: "Only the Business administrator changes the configuration.",
  // 26 Oct: the supplier form offers only the list's countries; this is its backstop (Kissflow stores another value EMPTY)
  // (FE-CLEANUP C22: "the country list", never Kissflow's list by name)
  country: (c: string) => `“${c}” is not in the country list. Choose a country from the list.`,
  // 26 Oct: a contact's supplier-portal user, set on the supplier forms by a holder of Admin / Developer
  portalNotDeveloper: "Only a holder of the Admin / Developer role links supplier-portal users.",
  portalHeld: (name: string) => `This portal user is already linked to ${name}.`,
  portalTwice: "Two contacts have the same portal user ID. Each contact needs its own: the app knows a contact by this ID, so two contacts with one ID would be one person.",
} as const;

/**
 * Why these portal user ids can't be saved (26 Oct), else null. `entries`: the contacts being given a portal user now
 * (`contactId`: an existing contact, absent for a new one; `value` trimmed here, empty = none). Only a holder of Admin /
 * Developer sets one; each must be shaped like a Kissflow user id (portalUserIdProblem); no two may be the same, and none
 * may be the portal user of another contact, of this supplier or any other: a contact's id in the app IS its portal user
 * id (map/suppliersMap.ts contactIdOf), so a shared id would make two people one.
 */
export function portalIdsProblem(ctx: Pick<WriteCtx, "identity">, state: AppState, entries: readonly { contactId?: string; value: string }[]): string | null {
  const given = entries.map((e) => ({ ...e, value: e.value.trim() })).filter((e) => e.value);
  if (!given.length) return null;
  if (!ctx.identity.developer) return GUARD_TEXT.portalNotDeveloper;
  for (const e of given) {
    const shape = portalUserIdProblem(e.value);
    if (shape) return shape;
  }
  if (new Set(given.map((e) => e.value)).size !== given.length) return GUARD_TEXT.portalTwice;
  // the contacts named here may hand their ids on to each other (a swap is one save)
  const changing = new Set(entries.map((e) => e.contactId).filter((x): x is string => !!x));
  for (const e of given) {
    const other = state.users.find((u) => u.side === "supplier" && !changing.has(u.id) && kfIdOfContact(u.id) === e.value);
    if (other) return GUARD_TEXT.portalHeld(other.name);
  }
  return null;
}

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

/** Null when the live write can go ahead, else the refusal text (DESIGN §6 pre-guards). */
export function liveGuard(method: WritableMethod, ctx: WriteCtx, state: AppState, args: unknown[]): string | null {
  if (!ctx.containerOk) return NOT_IN_APP;
  // the domain refuses everyone without config.manage already; live, only the Business administrator holds the rights
  if (isConfigMethod(method)) return ctx.acting.personaId === "admin" ? null : GUARD_TEXT.configNotAdmin;
  const caseId = typeof args[0] === "string" ? args[0] : "";
  switch (method) {
    case "createCase":
      return createCaseGuard(ctx, state, args[0] as NewCaseInput | undefined);
    case "raiseOpenPoint":
    case "addInternalNote":
    case "cancelCase":
      return caseRefOf(ctx, caseId) ? null : GUARD_TEXT.caseUnknown;
    case "reviewResponse":
    case "editOpenPoint":
    case "closeOpenPoint":
      return heldOp(ctx, state, caseId, String(args[1] ?? "")) ? null : GUARD_TEXT.opNotHeld;
    case "rmesDecision": {
      const dept = args[1] as "SAF" | "REG";
      if (!heldReview(ctx, caseId, dept)) return GUARD_TEXT.reviewNotHeld(dept);
      if (!caseOf(state, caseId)?.rmes || !rmesRefOf(ctx, caseId, dept)) return GUARD_TEXT.rmesUnknown;
      // the domain would reopen RMM's completed review, which Safety and Regulatory can't write in Kissflow
      if (args[2] === "rejected" && caseOf(state, caseId)?.reviews.find((r) => r.dept === "RMM")?.status === "completed") return GUARD_TEXT.rmmCompleted;
      return null;
    }
    case "completeReview": {
      const dept = args[1] as ReviewDept;
      if (!heldReview(ctx, caseId, dept)) return GUARD_TEXT.reviewNotHeld(dept);
      // Safety and Regulatory complete with the case's RMES record present (REQ-PROC-021: created on their load)
      if ((dept === "SAF" || dept === "REG") && (!caseOf(state, caseId)?.rmes || !rmesRefOf(ctx, caseId, dept))) return GUARD_TEXT.rmesUnknown;
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
      if (input && input.country.trim() && !countryCode(input.country)) return GUARD_TEXT.country(input.country.trim());
      return portalIdsProblem(ctx, state, (input?.contacts ?? []).map((c) => ({ value: c.portalUserId ?? "" })));
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
      if (sup.contactsUnread) return GUARD_TEXT.contactsUnread;
      return portalIdsProblem(ctx, state, [{ value: (args[1] as ContactInput | undefined)?.portalUserId ?? "" }]);
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
