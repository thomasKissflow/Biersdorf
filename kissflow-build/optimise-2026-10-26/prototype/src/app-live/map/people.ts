// The people the internal screens name (DESIGN §5.2 "Users"): the signed-in user, every Beiersdorf user a live item
// names in a User field or an audit row, the supplier contacts (CIQ Supplier rows, the case's Case_Contacts_JSON and
// supplier e-mail stamps), placeholder "role:<DEPT>" users for review tracks nobody holds, and the inactive "u-admin"
// the built-in first configuration names (FIRST_PAIR.publishedBy).
// Pure: no SDK, no Kissflow call. Ids stay Kissflow user ids, except the acting user's alias (me.id = "u-admin",
// "u-auditor" or "u-owner" for those personas, DESIGN §3.4): its Kissflow id maps to me.id on the Beiersdorf side; and
// the signed-in user as a supplier contact (dev, 21 Oct: one Kissflow user is staff and the dev supplier's portal
// contact), which is "self:<Kissflow id>" on the supplier side in every persona (selfContactId; the writers send the
// Kissflow id again, write/encode.ts kfIdOfContact).
import { DEPT_LABEL } from "@/domain/catalog";
import type { Dept, ReviewDept, User } from "@/domain/types";
import { refUser, str, userIds, type RawItem } from "@/portal/data/raw";
import type { LiveSnapshot } from "../types";

const DEPTS = new Set<Dept>(["RMM", "REG", "SAF", "QM", "MIC", "SUS", "CUS", "LEG"]);
/** A live Select text (Review_Dept, OP_Dept, Note_Dept, Actor_Dept, …) as a department, or undefined. */
export const deptOf = (v: unknown): Dept | undefined => (typeof v === "string" && DEPTS.has(v.trim() as Dept) ? (v.trim() as Dept) : undefined);
const REVIEW_DEPTS = new Set<ReviewDept>(["RMM", "REG", "SAF", "QM", "MIC", "SUS"]);
export const reviewDeptOf = (v: unknown): ReviewDept | undefined => (typeof v === "string" && REVIEW_DEPTS.has(v.trim() as ReviewDept) ? (v.trim() as ReviewDept) : undefined);

const lower = (s?: string) => (s ?? "").trim().toLowerCase();

export function initialsOf(name: string): string {
  return (
    name
      .replace(/^Dr\. /, "")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]!.toUpperCase())
      .join("") || "?"
  );
}

/** "ben.two@example.com" → "Ben Two": a readable name when only an e-mail is known (as portal/data/map.ts). */
export function nameFromEmail(email: string): string {
  return (
    email
      .split("@")[0]!
      .split(/[._-]+/)
      .filter(Boolean)
      .map((w) => w[0]!.toUpperCase() + w.slice(1))
      .join(" ") || email
  );
}

export interface InternalInfo {
  name?: string;
  email?: string;
  dept?: Dept;
}

export interface ContactInfo {
  name?: string;
  email?: string;
  title?: string;
  supplierId?: string;
  mayConfirm?: boolean;
  active?: boolean;
  deactivatedAt?: string;
}

/** The user who stands in for a domain user id nobody could name (never a picker target). */
const UNKNOWN_INTERNAL = "Beiersdorf user";
const UNKNOWN_CONTACT = "Supplier contact";

/** The signed-in user as a supplier contact: a user apart from the Beiersdorf one, so the domain sees a supplier
 *  contact (contactsOf, validateCaseContacts) and never the same person on both sides (Thomas, 21 Oct: one dev user is
 *  RMM and the portal contact of the dev supplier; under its own id the contact was the internal user, so no case could
 *  be created). Every persona gives it the same id. */
const SELF = "self:";
export const selfContactId = (kfUserId: string): string => `${SELF}${kfUserId}`;
/** The Kissflow user id behind a contact's domain id: "self:<id>" → <id>; every other id as it is. */
export const kfIdOfContact = (id: string): string => (id.startsWith(SELF) ? id.slice(SELF.length) : id);

/** The static Business administrator of the built-in first configuration (FIRST_PAIR.publishedBy, reader E fix d). */
export const STATIC_ADMIN: User = { id: "u-admin", name: "Business administrator", email: "", side: "internal", title: "Business administrator", initials: "BA", active: false };

export class Directory {
  private readonly users = new Map<string, User>();
  private readonly alias = new Map<string, string>();
  /** Stand-ins ensure() made before anything named the person: real data replaces them. */
  private readonly stubs = new Set<string>();

  constructor(
    readonly me: User,
    private readonly kfUserId: string,
  ) {
    this.users.set(me.id, { ...me });
    if (kfUserId && kfUserId !== me.id) this.alias.set(kfUserId, me.id);
    if (me.id !== STATIC_ADMIN.id) this.users.set(STATIC_ADMIN.id, { ...STATIC_ADMIN });
  }

  /** The domain id of a Kissflow user id (the acting user's alias applied). "" and "system" stay as they are. */
  id(kfId: string): string {
    return this.alias.get(kfId) ?? kfId;
  }

  /** The domain id of a supplier contact's Kissflow (portal) user id: the signed-in user's own id is the self contact
   *  (selfContactId), every other id stays. */
  contactId(kfId: string): string {
    return kfId && kfId === this.kfUserId ? selfContactId(kfId) : kfId;
  }

  get(id: string): User | undefined {
    return this.users.get(this.id(id));
  }

  /** True while the user is only a stand-in (nothing has named it yet). */
  isStub(id: string): boolean {
    return this.stubs.has(this.id(id));
  }

  /** A Beiersdorf user named by a User field or an audit row. The signed-in user always wins; otherwise the first
   *  known department and the first real name stick. Returns the domain id ("" for no reference). */
  internal(kfId: string | undefined, info: InternalInfo = {}): string {
    if (!kfId || kfId === "system") return kfId ?? "";
    const id = this.id(kfId);
    const u = this.users.get(id);
    const name = (info.name ?? "").trim();
    if (!u) {
      this.users.set(id, { id, name: name || UNKNOWN_INTERNAL, email: info.email ?? "", side: "internal", title: info.dept ? DEPT_LABEL[info.dept] : "Beiersdorf", ...(info.dept ? { dept: info.dept } : {}), initials: initialsOf(name || UNKNOWN_INTERNAL) });
      return id;
    }
    if (id === this.me.id || u.side !== "internal") return id;
    if (this.stubs.delete(id)) delete u.active;
    if (name && (u.name === UNKNOWN_INTERNAL || u.name === id)) {
      u.name = name;
      u.initials = initialsOf(name);
    }
    if (info.email && !u.email) u.email = info.email;
    if (info.dept && !u.dept) {
      u.dept = info.dept;
      if (u.title === "Beiersdorf") u.title = DEPT_LABEL[info.dept];
    }
    return id;
  }

  /** A {_id, Name} User field of an item (the first id of a MultiUser field). */
  userField(it: RawItem | Record<string, unknown> | undefined, key: string, info: InternalInfo = {}): string {
    const ref = refUser(it, key);
    const id = ref?.id ?? userIds(it, key)[0];
    if (!id) return "";
    return this.internal(id, { ...info, name: info.name || (ref && ref.name !== ref.id ? ref.name : undefined) });
  }

  /** A supplier contact; known fields are filled, never blanked. Returns its domain id (the signed-in user's own
   *  portal user id is the self contact): callers keep that id, not the one they passed. */
  contact(given: string, info: ContactInfo = {}): string {
    const id = this.contactId(given);
    const u = this.users.get(id);
    const name = (info.name ?? "").trim();
    if (!u) {
      const shown = name || (info.email ? nameFromEmail(info.email) : UNKNOWN_CONTACT);
      this.users.set(id, {
        id,
        name: shown,
        email: info.email ?? "",
        side: "supplier",
        title: info.title || "Supplier contact",
        ...(info.supplierId ? { supplierId: info.supplierId } : {}),
        initials: initialsOf(shown),
        active: info.active ?? true,
        ...(info.deactivatedAt ? { deactivatedAt: info.deactivatedAt } : {}),
        mayConfirm: info.mayConfirm ?? true,
      });
      return id;
    }
    if (u.side !== "supplier") return id;
    if (this.stubs.delete(id)) {
      u.active = info.active ?? true;
      u.mayConfirm = info.mayConfirm ?? true;
    }
    if (name && (u.name === UNKNOWN_CONTACT || (u.email && u.name === nameFromEmail(u.email)))) {
      u.name = name;
      u.initials = initialsOf(name);
    }
    if (info.email && !u.email) u.email = info.email;
    if (info.title && (u.title === "Supplier contact" || !u.title)) u.title = info.title;
    if (info.supplierId && !u.supplierId) u.supplierId = info.supplierId;
    if (info.mayConfirm !== undefined) u.mayConfirm = info.mayConfirm;
    if (info.active !== undefined) u.active = info.active;
    if (info.deactivatedAt) u.deactivatedAt = info.deactivatedAt;
    return id;
  }

  /** The supplier contact behind a stamp (portal user id, e-mail or name); an unknown e-mail becomes "mail:<email>". */
  contactOf(x: { id?: string; email?: string; name?: string }, supplierId?: string): string {
    const id = x.id ? this.contactId(x.id) : "";
    if (id && this.users.get(id)?.side === "supplier") return id;
    const email = lower(x.email);
    if (email) for (const u of this.users.values()) if (u.side === "supplier" && lower(u.email) === email) return u.id;
    const name = (x.name ?? "").trim();
    if (name) for (const u of this.users.values()) if (u.side === "supplier" && u.name === name) return u.id;
    if (x.id) return this.contact(x.id, { name, email: x.email, supplierId });
    if (email) return this.contact(`mail:${email}`, { name, email: x.email, supplierId });
    if (name) return this.contact(`name:${name}`, { name, supplierId });
    return "system";
  }

  /** contactOf by e-mail only (Supplier_Responsible_Email, Completeness_By_Email, Documents_JSON uploadedByEmail, …). */
  contactIdByEmail(email: string, name?: string, supplierId?: string): string {
    return this.contactOf({ email, name }, supplierId);
  }

  /** Any user by e-mail (internal or supplier), e.g. the @-mentions of a note. */
  byEmail(email: string): string | undefined {
    const e = lower(email);
    if (!e) return undefined;
    for (const u of this.users.values()) if (lower(u.email) === e) return u.id;
    return undefined;
  }

  /** The placeholder of a department's review role ("Regulatory Affairs reviewers"): inactive, no department, so it
   *  is never offered as a responsible person or reassignment target (DESIGN §5.2 .assigneeId). */
  roleUser(dept: ReviewDept): string {
    const id = `role:${dept}`;
    if (!this.users.has(id)) this.users.set(id, { id, name: `${DEPT_LABEL[dept]} reviewers`, email: "", side: "internal", title: "Review role", initials: dept.slice(0, 2), active: false });
    return id;
  }

  /** Makes sure a referenced id names somebody (an inactive stand-in when nobody could name it). A Kissflow id on the
   *  supplier side (a thread message, a completeness or release stamp) is the contact's id (contactId), on the
   *  Beiersdorf side the user's (id). */
  ensure(id: string | undefined, side: User["side"] = "internal"): string {
    if (!id || id === "system") return id ?? "";
    const did = side === "supplier" ? this.contactId(id) : this.id(id);
    if (!this.users.has(did)) {
      if (side === "supplier") this.contact(did, { active: false });
      else this.users.set(did, { id: did, name: UNKNOWN_INTERNAL, email: "", side: "internal", title: "Beiersdorf", initials: initialsOf(UNKNOWN_INTERNAL), active: false });
      this.stubs.add(did);
    }
    return did;
  }

  list(): User[] {
    return [...this.users.values()];
  }
}

/**
 * Every Beiersdorf user the live items name, with the department their context gives (DESIGN §5.2): Owner_RMM → RMM,
 * Raised_By_User → Raised_By_Dept, Completed_By / Assignee_User → Review_Dept, Responsible_User → OP_Dept,
 * Note_Author → Note_Dept, RMES Criteria_Recorded_By → SAF/REG, audit _created_by → Actor_Dept. Run before mapping so
 * thread and snapshot ids resolve to real names.
 */
export function registerPeople(snap: LiveSnapshot, dir: Directory): void {
  for (const it of snap.items.case) {
    const owner = refUser(it, "Owner_RMM");
    const creator = refUser(it, "_created_by");
    dir.userField(it, "Owner_RMM", { dept: "RMM", ...(owner && creator && owner.id === creator.id ? { email: str(it, "BDF_Contact_Email"), name: str(it, "BDF_Contact_Name") || undefined } : {}) });
  }
  for (const it of snap.items.review) {
    const dept = reviewDeptOf(str(it, "Review_Dept"));
    dir.userField(it, "Assignee_User", { dept, name: str(it, "Assignee_Name") || undefined, email: str(it, "Assignee_Email") || undefined });
    dir.userField(it, "Completed_By", { dept, name: str(it, "Completed_By_Name") || undefined, email: str(it, "Completed_By_Email") || undefined });
  }
  for (const it of snap.items.op) {
    const raisedDept = deptOf(str(it, "Raised_By_Dept"));
    dir.userField(it, "Raised_By_User", { dept: raisedDept, name: str(it, "Raised_By_Name") || undefined });
    dir.userField(it, "Responsible_User", { dept: deptOf(str(it, "OP_Dept")), name: str(it, "Responsible_Name") || undefined });
    dir.userField(it, "Closed_By");
    for (const id of userIds(it, "Raiser_Assignee")) dir.internal(id, { dept: raisedDept });
  }
  for (const it of snap.forms.note) dir.userField(it, "Note_Author", { dept: deptOf(str(it, "Note_Dept")) });
  for (const [flow, dept] of [["rmesSAF", "SAF"], ["rmesREG", "REG"]] as const) {
    for (const it of snap.forms[flow]) {
      for (const v of Object.values(it)) {
        if (!Array.isArray(v)) continue;
        for (const r of v) if (r && typeof r === "object" && "Criteria_Recorded_By" in r) dir.userField(r as Record<string, unknown>, "Criteria_Recorded_By", { dept });
      }
    }
  }
  for (const it of snap.forms.audit) {
    if (str(it, "Actor_Side") && str(it, "Actor_Side") !== "BDF") continue;
    dir.userField(it, "_created_by", { dept: deptOf(str(it, "Actor_Dept")), name: str(it, "Actor_Name") || undefined, email: str(it, "Actor_Email") || undefined });
  }
  for (const it of snap.forms.config) dir.userField(it, "Published_By");
}
