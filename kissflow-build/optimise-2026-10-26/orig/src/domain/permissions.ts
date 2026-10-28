// Who may do what (spec §4 Permissions, §7). One place for the screens and the actions: `can` answers yes or no,
// `check` gives the reason when the answer is no. The actions use `check` as their guard, so a screen that shows a
// control the user may not use still cannot change anything.
//
// Rules in short:
// - Internal users read every case. Supplier contacts see only the cases they are named on (legacy live-portal cases
//   without liveScope: every case of their supplier), and never internal content or the final document.
// - RMM (any RMM user) creates, cancels and reactivates cases and edits the case contacts.
// - Only the Business administrator maintains the supplier master: adds, edits, deactivates and reactivates suppliers
//   and their contacts (Thomas, 14 Oct). RMM looks suppliers and contacts up, read-only. Only the administrator
//   changes the configuration.
// - A review track is acted on by members of its department (RMM's track: RMM users).
// - Only the raiser handles an open point: accept, return, edit, close (AS-08). For a point the system raised, the
//   responsible person acts as the raiser.
// - Customs and Legal are read-only but may post internal notes; Admin, Business owner and Auditor read only.
// - Supplier data is written only by a named, active contact while the case is open and until Beiersdorf requests the
//   final release: from then on the questionnaire is locked (Thomas, 15 Oct; a reopened review unlocks it again).
//   Completeness and the final release need a contact who may confirm.

import { DEPT_SHORT, INTERNAL_PERSONAS, REVIEW_DEPTS } from "./catalog";
import { fmtDate, isClosed } from "./selectors";
import type { AppState, CiqCase, Dept, InternalPersonaId, OpenPoint, ReviewDept, User } from "./types";

export type Role = InternalPersonaId | "supplier" | "unknown";

export type Capability =
  | "case.view"
  | "case.create"
  | "case.cancel"
  | "case.reactivate"
  | "case.editContacts"
  | "supplier.view"
  | "supplier.manage"
  | "config.manage"
  | "reminders.run"
  | "ciq.edit"
  | "ciq.confirm"
  | "ciq.release"
  | "ciq.reportChange"
  | "op.respond"
  | "op.raise"
  | "op.decide"
  | "op.edit"
  | "op.close"
  | "review.complete"
  | "review.reopen"
  | "review.reassign"
  | "rmes.record"
  | "rmes.decide"
  | "scope.extend"
  | "note.add"
  | "finalDocument.view";

/** Extra context for track- and point-level capabilities. */
export interface CapabilityTarget {
  /** The review track concerned (op.raise, review.*, rmes.*). */
  dept?: ReviewDept;
  /** The open point concerned (op.respond, op.decide, op.edit, op.close). */
  opId?: string;
}

export const userOf = (s: AppState, id: string): User | undefined => s.users.find((u) => u.id === id);
export const isActiveUser = (u: User | undefined): boolean => !!u && u.active !== false;
export const userMayConfirm = (u: User | undefined): boolean => !!u && u.mayConfirm !== false;

/** The role a user holds. Department users map by department; Admin, Auditor and Business owner by their persona. */
export function roleOf(s: AppState, userId: string): Role {
  const u = userOf(s, userId);
  if (!u) return "unknown";
  if (u.side === "supplier") return "supplier";
  if (u.dept) return u.dept.toLowerCase() as Role;
  return (INTERNAL_PERSONAS.find((p) => p.userId === userId)?.id as InternalPersonaId | undefined) ?? "unknown";
}

const isRmm = (u: User | undefined) => !!u && u.side === "internal" && u.dept === "RMM";
const isReviewDept = (d: Dept | undefined): d is ReviewDept => !!d && (d === "RMM" || (REVIEW_DEPTS as Dept[]).includes(d));

/** The person who handles an open point (AS-08): its raiser, or the responsible person for a system-raised point. */
export const raiserOf = (op: Pick<OpenPoint, "createdBy" | "responsibleId">): string => (op.createdBy === "system" ? op.responsibleId : op.createdBy);

/** A supplier contact's access to a case: named on it (or, on a legacy live-portal case, of the same supplier). */
export function isCaseContact(c: CiqCase, u: User | undefined): boolean {
  if (!u || u.side !== "supplier" || u.supplierId !== c.supplierId) return false;
  return c.liveScope ? c.supplierContactIds.includes(u.id) : true;
}

/** Phases in which the supplier may change its data. Not final-release since Thomas, 15 Oct: RELEASE_LOCKED_TEXT. */
const OPEN_FOR_SUPPLIER_DATA = new Set(["supplier-input", "review", "metadata"]);

/** Why the supplier cannot change anything while Beiersdorf waits for the final release (Thomas, 15 Oct). Supplier wording. */
export const RELEASE_LOCKED_TEXT = "Your questionnaire is locked because Beiersdorf has requested your final release. If something must change, contact Beiersdorf; they can reopen the review.";

/** Null when allowed, otherwise the reason in plain English. "system" may do everything. */
export function check(s: AppState, userId: string, cap: Capability, c?: CiqCase, target: CapabilityTarget = {}): string | null {
  if (userId === "system") return null;
  const u = userOf(s, userId);
  if (!u) return "Unknown user.";
  const internal = u.side === "internal";
  const role = roleOf(s, userId);
  const op = target.opId && c ? c.openPoints.find((p) => p.id === target.opId) : undefined;
  if (target.opId && !op && cap.startsWith("op.")) return "This open point no longer exists.";
  const contactGuard = (): string | null => {
    if (u.side !== "supplier") return "Only the supplier's contacts work on the questionnaire. Beiersdorf never changes answers.";
    if (!isActiveUser(u)) return "This contact is no longer active.";
    if (!c || !isCaseContact(c, u)) return "You are not a contact on this request.";
    return null;
  };
  const trackGuard = (): string | null => {
    if (!internal) return "Only Beiersdorf reviewers can do this.";
    const d = target.dept;
    if (!d) return "No review track given.";
    if (u.dept !== d) return d === "RMM" ? "Only RMM can act on RMM's review." : `Only ${DEPT_SHORT[d]} can act on the ${DEPT_SHORT[d]} review.`;
    if (c && !c.reviews.some((r) => r.dept === d)) return `${DEPT_SHORT[d]} has no review task on ${c.id}.`;
    return null;
  };

  switch (cap) {
    case "case.view":
      if (internal) return null;
      return c && isActiveUser(u) && isCaseContact(c, u) ? null : "This request is not available.";
    case "finalDocument.view":
      return internal ? null : "The final document is internal to Beiersdorf.";
    case "case.create":
    case "case.cancel":
    case "case.reactivate":
    case "case.editContacts":
      return isRmm(u) ? null : "Only RMM can do this.";
    case "supplier.view":
      return isRmm(u) || role === "admin" ? null : "The supplier master is for Raw Material Management and the business administrator.";
    case "supplier.manage":
      return role === "admin" ? null : "Only the business administrator maintains the supplier master.";
    case "config.manage":
    case "reminders.run":
      return role === "admin" ? null : "Only the business administrator changes the configuration.";
    case "ciq.edit": {
      const g = contactGuard();
      if (g) return g;
      if (c?.phase === "final-release") return RELEASE_LOCKED_TEXT;
      return c && OPEN_FOR_SUPPLIER_DATA.has(c.phase) ? null : "The questionnaire can no longer be changed.";
    }
    case "ciq.confirm":
    case "ciq.release": {
      const g = contactGuard();
      if (g) return g;
      return userMayConfirm(u) ? null : "This contact may not confirm. Ask a colleague who may confirm.";
    }
    case "ciq.reportChange":
      return contactGuard();
    case "op.respond": {
      const g = contactGuard();
      if (g) return g;
      if (!op) return "No open point given.";
      if (op.status === "closed") return op.closedAt ? `Beiersdorf closed this question on ${fmtDate(op.closedAt)}.` : "Beiersdorf closed this question.";
      return op.status === "open" ? null : "Your answer is with Beiersdorf; wait for their response.";
    }
    case "op.raise":
      return trackGuard();
    case "op.decide":
    case "op.edit":
    case "op.close": {
      if (!internal) return "Only Beiersdorf can do this.";
      if (!op) return "No open point given.";
      const raiser = raiserOf(op);
      if (userId !== raiser) return `Only ${userOf(s, raiser)?.name ?? "the person who raised it"} can change this open point.`;
      return null;
    }
    case "review.complete":
    case "review.reopen":
    case "review.reassign":
    case "rmes.record":
    case "rmes.decide":
      return trackGuard();
    case "scope.extend":
      return internal && isReviewDept(u.dept) && u.dept !== "RMM" ? null : "Only a reviewing department can add a section. RMM asks the supplier or the department concerned instead.";
    case "note.add":
      if (!internal) return "Internal notes are for Beiersdorf only.";
      if (role === "admin" || role === "owner" || role === "auditor") return "This role reads the internal notes only.";
      if (c && isClosed(c)) return "The case is closed: no new notes.";
      return null;
  }
}

/** True when the user may do it (see `check` for the reason when not). */
export function can(s: AppState, userId: string, cap: Capability, c?: CiqCase, target?: CapabilityTarget): boolean {
  return check(s, userId, cap, c, target) === null;
}
