// Pure state transitions. Every action takes the current state, the acting user id, its arguments and an optional
// timestamp (fixtures replay real flows with historic timestamps), and returns a new state. Guards (permissions.ts and
// the phase rules of spec §1) return the state unchanged plus a refusal toast, so nothing fails silently and the store
// shows no success message. Every relevant step also sends its simulated mail (mail.ts).

import { CONFIG_BY_ID, DEPT_SHORT, HEAVY_METAL_LIMITS, INTERNAL_PERSONAS, LIMIT_SET_VERSION, ORIGIN_LABEL, fieldOf, sectionOf } from "./catalog";
import { currentPair, draftPair, publishDraft } from "./configActions";
import { audit, getCase, logEvent, mapCase, refuse, setPhase, toast } from "./core";
import { buildFinalDocument } from "./finalDocument";
import { answeredMail, caseLink, dataChangedMail, deptUserIds, internalMail, noteMentionMails, reviewAssignedMail, reviewLink, supplierMail } from "./mail";
import { joinPeople, mentionRecipients, parseMentions } from "./mentions";
import { RELEASE_LOCKED_TEXT, check, isActiveUser, userOf } from "./permissions";
import { isSlotKey, requestedDocuments, slotName, slotSection, storableSlots } from "./requestedDocs";
import { deriveScope, diffScope, growScope, undefinedOrigins } from "./rules";
import {
  PHASE_LABEL,
  canReactivate,
  completenessBlockers,
  departmentsForScope,
  duplicateOpenCases,
  fmtDate,
  formatValue,
  isClosed,
  isSetByBdf,
  nowIso,
  ownsSection,
  rejectedDepts,
  rejectionNeedsRmmChoice,
  releaseBlockers,
  reviewBlockers,
  reviewDeptOf,
  rmmFlags,
  scopeOf,
  sectionsChangedSince,
  userName,
} from "./selectors";
import { syncContactAnswers, validateCaseContacts } from "./suppliers";
import type {
  AnswerValue,
  AppState,
  CiqCase,
  ComponentRow,
  ConfigAnswers,
  ConfigQuestionId,
  Confirmation,
  ConfirmationType,
  Dept,
  DocKind,
  InternalNote,
  Market,
  Message,
  ObjectRef,
  OpenPoint,
  OpenPointEdit,
  OpenPointKind,
  ReminderSetting,
  ReviewDept,
  ReviewTrack,
  RmesCriterion,
  RmesResult,
  ScopeItem,
} from "./types";

export { refuse, toast, uid, wasRefused } from "./core";
// The configuration editor's actions (spec §8.2) live in configActions.ts; re-exported so `A.createDraft(…)` works.
export {
  createDraft,
  deleteRule,
  discardDraft,
  moveField,
  publishDraft,
  removeField,
  restoreSection,
  retireSection,
  upsertField,
  upsertRule,
  upsertSection,
  validateDraft,
  type FieldInput,
  type RuleInput,
  type SectionInput,
} from "./configActions";

const DAY_MS = 86_400_000;

function confirm(s: AppState, c: CiqCase, by: string, at: string, type: ConfirmationType, dept?: Dept, note?: string): CiqCase {
  const u = s.users.find((x) => x.id === by);
  const conf: Confirmation = { type, by, name: u?.name ?? by, email: u?.email ?? "", role: u?.title ?? "", at, dept, reviewVersion: c.reviewVersion, note };
  return { ...c, confirmations: [...c.confirmations, conf] };
}

/** A section's code (the newest definition: codes are stable across versions). */
const codeOf = (sectionId: string, c?: Pick<CiqCase, "templateVersion">, s?: Pick<AppState, "config">) => sectionOf(sectionId, c?.templateVersion, s?.config)?.code ?? sectionId;
const codesOf = (ids: string[], c?: Pick<CiqCase, "templateVersion">, s?: Pick<AppState, "config">) => ids.map((id) => codeOf(id, c, s)).join(", ") || "none";
/** A section of the case's questionnaire version (pure: the state's config). */
const secOf = (s: AppState, c: Pick<CiqCase, "templateVersion">, sectionId: string) => sectionOf(sectionId, c.templateVersion, s.config);
/** A field of the case's questionnaire version (pure: the state's config). */
const fieldIn = (s: AppState, c: Pick<CiqCase, "templateVersion"> | undefined, fieldId: string) => fieldOf(fieldId, c?.templateVersion, s.config);
const showConfig = (k: ConfigQuestionId, v: ConfigAnswers[ConfigQuestionId]) =>
  k === "SF01" && Array.isArray(v) ? (v as string[]).map((o) => ORIGIN_LABEL[o as keyof typeof ORIGIN_LABEL] ?? o).join(", ") || "—" : formatValue(v as AnswerValue | undefined);
const flagDetail = (config: ConfigAnswers) =>
  `Origin without rules: ${undefinedOrigins(config).map((o) => ORIGIN_LABEL[o]).join(", ")}. The supplier got the standard sections only; RMM checks in its review whether more is needed and asks the supplier if so.`;
const scopeSummary = (scope: ScopeItem[]) =>
  `${scope.filter((x) => x.applicability === "mandatory").length} mandatory sections, ${scope.filter((x) => x.applicability === "optional").length} optional, ${scope.filter((x) => x.applicability === "na").length} not applicable`;
const isPart2 = (c: CiqCase) => c.phase === "review" || c.phase === "final-release";
/** User text followed by our own full stop: drop the text's own closing punctuation first (no "..") . */
const sentence = (t: string) => t.trim().replace(/[.!?…]+$/, "");
/** Customs and Legal read the case on their own section (spec §3). */
const INFORMED_SECTION: Record<"CUS" | "LEG", string> = { CUS: "K7", LEG: "K8" };
/** A due date counts until the end of its day. */
const notBeforeToday = (due: string, at: string) => !Number.isNaN(Date.parse(due)) && Date.parse(due) + DAY_MS > Date.parse(at);
const short = (v: unknown) => {
  const t = (typeof v === "string" ? v : formatValue(v as AnswerValue | undefined)).replace(/\s+/g, " ").trim();
  return t.length > 80 ? `${t.slice(0, 77)}…` : t;
};

/**
 * Guard for every supplier-data write (answers, metadata, rows, justifications, uploads, requested-document
 * justifications). A completed or cancelled case refuses and LOGS the attempt (REQ-PROC-043); so does a case waiting
 * for the final release, whose questionnaire is locked (Thomas, 15 Oct: a reviewer reopens its review if something
 * must change). Otherwise the actor must be an active contact named on the case.
 */
function supplierWriteGuard(s: AppState, by: string, c: CiqCase | undefined, at: string, what: string): AppState | null {
  if (!c) return refuse(s, "This request no longer exists.");
  if (isClosed(c)) {
    const why = c.phase === "completed" ? "the CIQ is frozen since the final release" : "the case is cancelled";
    const logged = mapCase(s, c.id, (x) => audit(x, by, at, "Change attempt refused", `${userName(s, by)} tried to change ${what}; ${why}.`));
    return refuse(logged, c.phase === "completed" ? "The CIQ is frozen after the final release. Use “Report a change” instead." : "This request was withdrawn; it can no longer be changed.");
  }
  if (c.phase === "final-release") {
    const logged = mapCase(s, c.id, (x) => audit(x, by, at, "Change attempt refused", `${userName(s, by)} tried to change ${what}; the questionnaire is locked while Beiersdorf waits for the final release.`));
    return refuse(logged, RELEASE_LOCKED_TEXT);
  }
  const denied = check(s, by, "ciq.edit", c);
  return denied ? refuse(s, denied) : null;
}

/** Review assignee: RMM's whole-CIQ review goes to the case owner; a department's to its role holder (the persona). */
function assigneeFor(s: AppState, c: CiqCase, d: ReviewDept): string {
  if (d === "RMM") return c.ownerId;
  const primary = INTERNAL_PERSONAS.find((p) => p.dept === d)?.userId;
  const pu = primary ? userOf(s, primary) : undefined;
  if (pu && pu.dept === d && isActiveUser(pu)) return pu.id;
  return s.users.find((u) => u.side === "internal" && u.dept === d && isActiveUser(u))?.id ?? `u-${d.toLowerCase()}`;
}

/** Re-evaluates the open tracks after points changed: waiting-supplier only while one of its points waits for the supplier. */
function retrack(reviews: ReviewTrack[], ops: OpenPoint[]): ReviewTrack[] {
  return reviews.map((r) => {
    if (r.status === "completed") return r;
    const waiting = ops.some((p) => p.dept === r.dept && p.status === "open");
    if (waiting) return r.status === "waiting-supplier" ? r : { ...r, status: "waiting-supplier" };
    return r.status === "waiting-supplier" ? { ...r, status: "in-review" } : r;
  });
}

// ---------------------------------------------------------------------------------- Part 1

export interface NewCaseInput {
  materialName: string;
  inci: string;
  materialNo: string;
  supplierId: string;
  /** One or two active contacts of the supplier: they get the invitation and see the request. */
  contactIds: string[];
  markets: Market[];
  dueDate: string;
  priority: "normal" | "high";
  ownerId?: string;
  /** Why the case is started although an open case exists for the same supplier and material number (audited). */
  duplicateNote?: string;
  /** Started for a change the supplier reported after the release of an earlier case (spec §1.12, audited). */
  followUpOf?: { caseId: string; reportId: string };
}

/** Why a new case would be refused (null = it can be created). The New case form shows the same messages. */
export function newCaseProblem(s: AppState, by: string, input: NewCaseInput, at = nowIso()): string | null {
  const denied = check(s, by, "case.create");
  if (denied) return denied;
  if (!input.materialName.trim()) return "Enter the trade name.";
  if (!input.inci.trim()) return "Enter the main INCI.";
  if (!input.materialNo.trim()) return "Enter the Beiersdorf material number.";
  const sup = s.suppliers.find((x) => x.id === input.supplierId);
  if (!sup) return "Choose a supplier from the supplier master.";
  if (sup.active === false) return `${sup.name} is inactive.`;
  const contacts = validateCaseContacts(s, sup.id, input.contactIds);
  if (contacts) return contacts;
  if (!input.markets.length) return "Choose at least one target market.";
  if (!input.dueDate || !notBeforeToday(input.dueDate, at)) return "The due date must be today or later.";
  const owner = userOf(s, input.ownerId ?? by);
  if (!owner || owner.dept !== "RMM") return "The case owner must be a Raw Material Manager.";
  return null;
}

export function createCase(s: AppState, by: string, input: NewCaseInput, at = nowIso(), forcedId?: string): { state: AppState; id: string } {
  const problem = newCaseProblem(s, by, input, at);
  if (problem) return { state: refuse(s, problem), id: "" };
  const year = at.slice(0, 4);
  const next = Math.max(0, ...s.cases.filter((c) => c.id.startsWith(`CIQ-${year}-`)).map((c) => Number(c.id.split("-")[2]) || 0)) + 1;
  const id = forcedId ?? `CIQ-${year}-${String(next).padStart(4, "0")}`;
  const sup = s.suppliers.find((x) => x.id === input.supplierId)!;
  const contactIds = [...new Set(input.contactIds)];
  const contact = userOf(s, contactIds[0]);
  const contact2 = userOf(s, contactIds[1] ?? "");
  // New cases use the newest published configuration pair; the case keeps it for good (spec §8.1).
  const { ruleSetVersion, templateVersion: template } = currentPair(s);
  const dups = duplicateOpenCases(s, input.supplierId, input.materialNo);
  // The supplier opens the CIQ directly: the scope is derived at once from the RMM-set markets (SF-11) and then
  // follows the supplier's metadata answers live (saveConfig).
  const config: ConfigAnswers = { SF11: input.markets };
  const scope = deriveScope(config, ruleSetVersion, template, s.config);
  let c: CiqCase = {
    id,
    materialName: input.materialName.trim(),
    inci: input.inci.trim(),
    materialNo: input.materialNo.trim(),
    supplierId: input.supplierId,
    manufacturer: sup.name,
    site: "",
    supplierContactIds: contactIds,
    ownerId: input.ownerId ?? by,
    createdAt: at,
    dueDate: input.dueDate,
    phase: "supplier-input",
    templateVersion: template,
    ruleSetVersion,
    config,
    scope,
    answers: {
      "FLD-GEN-001": input.materialName.trim(),
      "FLD-GEN-002": sup.name,
      "FLD-GEN-008": contact?.email ?? "",
      ...(contact2 ? { "FLD-GEN-009": contact2.email } : {}),
      "FLD-GEN-003": sup.duns,
    },
    answeredBy: {},
    components: [],
    justifications: {},
    documents: [],
    reviews: [],
    informed: [],
    openPoints: [],
    confirmations: [],
    audit: [],
    reviewVersion: 0,
    phaseHistory: [{ phase: "supplier-input", at }],
    priority: input.priority,
    internalNotes: [],
    liveScope: true,
  };
  const names = contactIds.map((x) => userOf(s, x)).filter(Boolean).map((u) => `${u!.name} <${u!.email}>`);
  c = audit(c, by, at, "Created case", `Case created for ${c.materialName} (${sup.name}, DUNS ${sup.duns}). Questionnaire ${template}, rule set ${ruleSetVersion}. Target markets: ${input.markets.join(", ")}. Due ${fmtDate(input.dueDate)}.`);
  if (input.followUpOf) {
    const rep = s.changeReports.find((r) => r.id === input.followUpOf!.reportId);
    c = audit(c, by, at, "Follow-up case", `Started for the change reported on ${input.followUpOf.caseId} (${input.followUpOf.reportId})${rep ? `: “${rep.text}”` : "."}`);
  }
  if (dups.length) c = audit(c, by, at, "Created despite an open case", `Open case${dups.length > 1 ? "s" : ""} for the same supplier and material number: ${dups.map((x) => x.id).join(", ")}.${input.duplicateNote?.trim() ? ` Reason: ${input.duplicateNote.trim()}` : ""}`);
  c = audit(c, "system", at, "Derived scope", `Rule set ${ruleSetVersion} applied to the target markets: ${scopeSummary(scope)}. More sections open as the supplier answers the metadata questions.`);
  c = audit(c, "system", at, "Invited supplier contacts", `Invitation and task “Fill in the CIQ” sent to ${names.join(" and ")}.`);
  let state: AppState = { ...s, cases: [c, ...s.cases] };
  state = supplierMail(state, c, "invitation", by, at);
  return { state, id };
}

/** RMM changes the case contacts (1–2 active contacts of the case's supplier). New contacts get the invitation. */
export function updateCaseContacts(s: AppState, by: string, caseId: string, contactIds: string[], at = nowIso()): AppState {
  const c = getCase(s, caseId);
  if (!c) return refuse(s, "This case no longer exists.");
  const denied = check(s, by, "case.editContacts", c);
  if (denied) return refuse(s, denied);
  if (isClosed(c)) return refuse(s, "The case is closed: its contacts can no longer change.");
  const problem = validateCaseContacts(s, c.supplierId, contactIds);
  if (problem) return refuse(s, problem);
  const ids = [...new Set(contactIds)];
  if (ids.join() === c.supplierContactIds.join()) return refuse(s, "The contacts are unchanged.", "info");
  const added = ids.filter((x) => !c.supplierContactIds.includes(x));
  const removed = c.supplierContactIds.filter((x) => !ids.includes(x));
  let next = mapCase(s, caseId, (x) => {
    const synced = syncContactAnswers(s, { ...x, supplierContactIds: ids });
    const mails = synced.answers["FLD-GEN-008"] !== x.answers["FLD-GEN-008"] || synced.answers["FLD-GEN-009"] !== x.answers["FLD-GEN-009"];
    return audit(
      synced,
      by,
      at,
      "Changed case contacts",
      `${removed.length ? `Removed: ${removed.map((x2) => userName(s, x2)).join(", ")}. ` : ""}${added.length ? `Added: ${added.map((x2) => userName(s, x2)).join(", ")}. ` : ""}${mails ? "The contact e-mails in General information follow the case contacts." : ""}`.trim(),
    );
  });
  if (added.length) next = supplierMail(next, getCase(next, caseId)!, "invitation", by, at, undefined, { to: added });
  return toast(next, "success", "Case contacts updated.");
}

/**
 * The supplier answers a metadata question (SF-11 stays RMM-owned).
 * - Part 1 (before the completeness confirmation): the scope is re-derived and sections open AND close freely.
 *   Answers in a section that closes stay in c.answers and come back if it reopens (AS-03). Audited only when the
 *   scope actually changes, since the screen saves on every click.
 * - Part 2 (review): the scope only grows (REQ-CFG-008, growScope). Every added section gets its lead department's
 *   track activated or reopened, and one 'additional-part' open point, so the supplier gets a task and that
 *   department's completion waits for it. A newly chosen origin without rules flags the case for RMM and reopens a
 *   completed RMM review. These grow-only effects are the metadata answers' own rule (B-28); the section owners' reopen
 *   of part2Change does not apply to them. In final-release the questionnaire is locked (Thomas, 15 Oct): the guard
 *   refuses and logs.
 * - Legacy portal phase 'metadata': the answers are only stored.
 */
export function saveConfig(s: AppState, by: string, caseId: string, patch: ConfigAnswers, at = nowIso()): AppState {
  const c = getCase(s, caseId);
  const blocked = supplierWriteGuard(s, by, c, at, "the metadata answers");
  if (blocked) return blocked;
  const cur = c!;
  const config: ConfigAnswers = { ...cur.config, ...patch, SF11: cur.config.SF11 };
  const changed = (Object.keys(config) as ConfigQuestionId[]).filter((k) => JSON.stringify(config[k]) !== JSON.stringify(cur.config[k]));
  if (!changed.length) return s;
  const answeredBy = { ...cur.answeredBy, ...Object.fromEntries(changed.map((k) => [k, { by, at }])) };
  if (cur.phase === "metadata") return mapCase(s, caseId, (x) => ({ ...x, config, answeredBy }));
  const derived = deriveScope(config, cur.ruleSetVersion, cur.templateVersion, s.config);

  if (!isPart2(cur)) {
    // A manual extension (always mandatory) is never lowered by a re-derivation (REQ-CFG-007).
    const scope = derived.map((d) => {
      const b = cur.scope.find((x) => x.sectionId === d.sectionId);
      return b?.manual && d.applicability !== "mandatory" ? b : { ...d, manual: b?.manual };
    });
    const d = diffScope(cur.scope, scope);
    return mapCase(s, caseId, (x) => {
      const y: CiqCase = { ...x, config, scope, answeredBy };
      if (!d.added.length && !d.removed.length && !d.changed.length) return y;
      const ch = d.changed.map((z) => `${codeOf(z.sectionId, cur, s)} ${z.from} → ${z.to}`).join(", ");
      return audit(y, by, at, "Scope follows answers", `${changed.map((k) => CONFIG_BY_ID[k].code).join(", ")} answered. Opened: ${codesOf(d.added, cur, s)}. Closed: ${codesOf(d.removed, cur, s)}.${ch ? ` Changed: ${ch}.` : ""}${d.removed.length ? " Answers in closed sections are kept and come back if they open again." : ""}`);
    });
  }

  // Part 2: the scope only grows, and so do the requested documents (requestedDocs.ts).
  const g = growScope(cur.scope, derived);
  const grown = [...g.added, ...g.upgraded];
  const newOrigins = undefinedOrigins(config).filter((o) => !undefinedOrigins(cur.config).includes(o));
  const what = changed.map((k) => `${CONFIG_BY_ID[k].code}: ${showConfig(k, cur.config[k])} → ${showConfig(k, config[k])}`).join("; ");
  const slotsBefore = new Set(requestedDocuments(cur, s.config).map((x) => x.key));
  const slotsAfter = requestedDocuments({ ...cur, config, scope: g.scope }, s.config);
  const newSlots = slotsAfter.filter((x) => !slotsBefore.has(x.key));
  const docsLine = newSlots.length ? ` Documents now requested: ${newSlots.map((x) => `${x.doc} (${codeOf(x.sectionId, cur, s)})`).join(", ")}.` : "";
  let next = mapCase(s, caseId, (x) =>
    audit(
      { ...x, config, scope: g.scope, answeredBy, ...(newSlots.length ? { requestedDocs: storableSlots(slotsAfter) } : {}) },
      by,
      at,
      "Changed metadata answer after completeness",
      `${what}. After the completeness confirmation the scope only grows. Added: ${codesOf(grown, cur, s)}. Kept although no longer derived: ${codesOf(g.kept, cur, s)}.${docsLine} The reviewers concerned are told.`,
    ),
  );
  // Lead tracks that are already open get no review-assigned mail from activateTracks: tell them here (REQ-CFG-008).
  const openLeads = new Map<ReviewDept, string[]>();
  for (const id of grown) {
    const d = reviewDeptOf(s.ownership, id);
    const tr = cur.reviews.find((r) => r.dept === d);
    if (tr && tr.status !== "completed") openLeads.set(d, [...(openLeads.get(d) ?? []), id]);
  }
  for (const id of grown) next = activateTracks(next, caseId, [reviewDeptOf(s.ownership, id)], at, `${codeOf(id, cur, s)} was added by a changed metadata answer`);
  if (newOrigins.length) {
    // The flag belongs in RMM's Part 2 review: a completed RMM review is reopened (and a case waiting for the final
    // release goes back to review). The flag itself never blocks RMM's completion.
    next = mapCase(next, caseId, (y) => audit(y, "system", at, "Flagged for RMM", flagDetail(config)));
    next = activateTracks(next, caseId, ["RMM"], at, "An origin without rules was added after the completeness confirmation");
  }
  next = dataChangedMail(next, getCase(next, caseId)!, by, at, "GEN", `${grown.length ? `${what}. Sections added: ${codesOf(grown, cur, s)}` : what}${newSlots.length ? `. Documents now requested: ${newSlots.map((x) => x.doc).join(", ")}` : ""}`);
  for (const [d, ids] of openLeads) {
    const c2 = getCase(next, caseId)!;
    const tr = c2.reviews.find((r) => r.dept === d);
    if (!tr || d === "RMM") continue; // RMM reads the data-changed mail above
    next = internalMail(
      next,
      [tr.assigneeId],
      {
        by,
        event: "data-changed",
        subject: `${c2.id}: ${codesOf(ids, cur, s)} added to your ${DEPT_SHORT[d]} review`,
        body: `${codesOf(ids, cur, s)} ${ids.length > 1 ? "were" : "was"} added by the supplier's changed answer (${what}).\nAn additional-section point is open in your name for ${c2.materialName} (${c2.id}); your review waits for the supplier's answer.`,
        link: reviewLink(c2.id, undefined, ids[0]),
        caseId: c2.id,
        sectionId: ids[0],
      },
      at,
    );
  }
  for (const id of grown) {
    const dept = reviewDeptOf(s.ownership, id);
    const sec = secOf(s, cur, id);
    next = raiseOpenPoint(
      next,
      "system",
      caseId,
      {
        dept,
        kind: "additional-part",
        ref: { sectionId: id, label: `${sec?.code ?? id} · ${sec?.title ?? ""}` },
        question: `Please complete the additional section ${sec?.code ?? id}; it now applies because of your changed answer.`,
        justification: "Added by a changed metadata answer after the completeness confirmation",
        dueDate: new Date(Date.parse(at) + 14 * DAY_MS).toISOString(),
        responsibleId: getCase(next, caseId)!.reviews.find((r) => r.dept === dept)?.assigneeId,
      },
      at,
    );
  }
  return refreshRmes(next, caseId, at);
}

/**
 * Part 2 only: a department adds a section with a justification (REQ-CFG-007, REQ-ADR-002). Before the completeness
 * confirmation the scope follows the supplier's metadata answers, and RMM asks the supplier instead of adding sections.
 * The section's lead track is activated or reopened, and the asking department raises the 'additional-part' open point.
 */
export function extendScope(s: AppState, by: string, caseId: string, sectionId: string, justification: string, at = nowIso()): AppState {
  const c = getCase(s, caseId);
  if (!c) return refuse(s, "This case no longer exists.");
  if (!isPart2(c)) return refuse(s, "Before the completeness confirmation the scope follows the supplier's metadata answers. Sections can be added during the review.");
  const denied = check(s, by, "scope.extend", c);
  if (denied) return refuse(s, denied);
  // Same rule as a query: only an open review of the asker's own department adds a section.
  if (c.phase !== "review") return refuse(s, "Every review has completed. Reopen your review to add a section.");
  const own = c.reviews.find((r) => r.dept === userOf(s, by)?.dept);
  if (!own) return refuse(s, `${DEPT_SHORT[userOf(s, by)!.dept as ReviewDept] ?? "Your department"} has no review task on ${c.id}.`);
  if (own.status === "completed") return refuse(s, "Your review is completed. Reopen it to add a section.");
  if (!justification.trim()) return refuse(s, "A justification is required to add a section.");
  const sc = scopeOf(c, sectionId);
  if (!sc) return refuse(s, `${codeOf(sectionId, c, s)} is not part of this questionnaire version.`);
  if (sc.applicability === "mandatory") return refuse(s, `${codeOf(sectionId, c, s)} is already mandatory for this case.`, "info");
  const asker = userOf(s, by)!.dept as ReviewDept;
  const lead = reviewDeptOf(s.ownership, sectionId);
  let next = mapCase(s, caseId, (x) =>
    audit(
      { ...x, scope: x.scope.map((y) => (y.sectionId === sectionId ? { ...y, applicability: "mandatory", manual: { by, at, justification }, addedLater: true, reason: `Added during the review: ${justification}` } : y)) },
      by,
      at,
      "Extended scope",
      `${codeOf(sectionId, c, s)} made mandatory. Justification: ${justification}`,
      sectionId,
    ),
  );
  // Dynamic activation applies to late scope too: the lead reviews the new section, the asker owns the open point.
  next = activateTracks(next, caseId, [lead, asker], at, `${codeOf(sectionId, c, s)} was added`);
  next = raiseOpenPoint(
    next,
    by,
    caseId,
    { dept: asker, kind: "additional-part", ref: { sectionId, label: `${codeOf(sectionId, c, s)} · ${secOf(s, c, sectionId)?.title ?? ""}` }, question: `Please complete the additional section ${codeOf(sectionId, c, s)}.`, justification, dueDate: new Date(Date.parse(at) + 14 * DAY_MS).toISOString() },
    at,
  );
  return toast(refreshRmes(next, caseId, at), "success", `${codeOf(sectionId, c, s)} added. The supplier has a task to complete it.`);
}

/**
 * A supplier change after the completeness confirmation: audit, the section owners' reopen (below) and the
 * data-changed mail. The reopen goes first, so the data-changed mails of one burst still merge into one (mail.ts).
 */
function part2Change(s: AppState, by: string, caseId: string, at: string, sectionId: string, action: string, what: string): AppState {
  let next = mapCase(s, caseId, (x) => audit(x, by, at, action, what, sectionId));
  next = reopenOwners(next, caseId, at, sectionId);
  return dataChangedMail(next, getCase(next, caseId)!, by, at, sectionId, what);
}

/**
 * Thomas, 15 Oct: once a department has completed its review, a supplier change in a section it leads or co-reviews
 * (section owners, A-29) reopens that review automatically: an answer, a K2.1 row, a justification, an upload or a
 * requested-document justification. RMM's whole-CIQ review reopens only for a section RMM leads or co-reviews. The
 * existing reopen path (activateTracks): status reopened, actor "system", the reason in plain words, audit, and one
 * review-assigned mail to the track's assignee; while the track stays reopened further changes add no mail (one per
 * burst). The "changed since your review" markers keep counting from the undone completion (lastCompletedAt).
 * Metadata answers keep their own grow-only rule (saveConfig, B-28).
 */
function reopenOwners(s: AppState, caseId: string, at: string, sectionId: string): AppState {
  const c = getCase(s, caseId);
  if (!c || c.phase !== "review") return s;
  const depts = c.reviews.filter((r) => r.status === "completed" && ownsSection(s, r.dept, sectionId)).map((r) => r.dept);
  if (!depts.length) return s;
  return activateTracks(s, caseId, depts, at, `The supplier changed ${joinSections(s, c, [sectionId])} after your review`);
}

/** Sections in plain words for a reopen reason: "General information", "K2.1", "K1 and K2.2". */
function joinSections(s: AppState, c: CiqCase, sectionIds: string[]): string {
  const names = sectionIds.map((id) => {
    const sec = secOf(s, c, id);
    return sec?.kind === "basic" ? sec.title : codeOf(id, c, s);
  });
  return names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}` : (names[0] ?? "");
}

export function setAnswer(s: AppState, by: string, caseId: string, fieldId: string, value: AnswerValue, at = nowIso()): AppState {
  const c = getCase(s, caseId);
  const label = fieldIn(s, c, fieldId)?.label ?? fieldId;
  const blocked = supplierWriteGuard(s, by, c, at, `the answer “${label}”`);
  if (blocked) return blocked;
  if (isSetByBdf(c!, fieldId)) return refuse(s, `${label} is set by Beiersdorf at case start. Ask ${userName(s, c!.ownerId)} to change it.`);
  const prev = c!.answers[fieldId];
  if (JSON.stringify(prev ?? null) === JSON.stringify(value ?? null)) return s;
  const next = mapCase(s, caseId, (x) => ({ ...x, answers: { ...x.answers, [fieldId]: value }, answeredBy: { ...x.answeredBy, [fieldId]: { by, at } } }));
  if (!isPart2(c!)) return next;
  const sectionId = fieldIn(s, c, fieldId)?.sectionId ?? "GEN";
  return refreshRmes(part2Change(next, by, caseId, at, sectionId, "Changed answer after completeness", `${label}: “${short(prev ?? "—")}” → “${short(value ?? "—")}”`), caseId, at);
}

export function setComponents(s: AppState, by: string, caseId: string, rows: ComponentRow[], at = nowIso()): AppState {
  const c = getCase(s, caseId);
  const blocked = supplierWriteGuard(s, by, c, at, "the composition table (K2.1)");
  if (blocked) return blocked;
  const cur = c!;
  if (JSON.stringify(cur.components) === JSON.stringify(rows)) return s;
  // A row Beiersdorf asked about cannot be deleted while the question is open.
  const asked = cur.openPoints.filter((p) => p.status !== "closed" && p.ref.rowId && !rows.some((r) => r.id === p.ref.rowId));
  if (asked.length) return refuse(s, `Beiersdorf asked about this component (${asked.map((p) => p.ref.label).join(", ")}). Answer the question instead of removing the row.`);
  const next = mapCase(s, caseId, (x) => ({ ...x, components: rows, answeredBy: { ...x.answeredBy, "K2.1:components": { by, at } } }));
  if (!isPart2(cur)) return next;
  const added = rows.filter((r) => !cur.components.some((o) => o.id === r.id));
  const removed = cur.components.filter((o) => !rows.some((r) => r.id === o.id));
  const changed = rows.filter((r) => {
    const o = cur.components.find((x) => x.id === r.id);
    return o && JSON.stringify(o) !== JSON.stringify(r);
  });
  const what = [added.length && `added ${added.map((r) => r.inci || r.id).join(", ")}`, removed.length && `removed ${removed.map((r) => r.inci || r.id).join(", ")}`, changed.length && `changed ${changed.map((r) => r.inci || r.id).join(", ")}`].filter(Boolean).join("; ");
  return part2Change(next, by, caseId, at, "K2.1", "Changed composition after completeness", `Composition table: ${what || "rows reordered"}`);
}

export function setJustification(s: AppState, by: string, caseId: string, key: string, text: string, at = nowIso()): AppState {
  const c = getCase(s, caseId);
  const slot = isSlotKey(key) && c ? slotName(c, key, s.config) : undefined;
  const label = slot ?? fieldIn(s, c, key)?.label ?? codeOf(key, c, s);
  const blocked = supplierWriteGuard(s, by, c, at, `the justification for “${label}”`);
  if (blocked) return blocked;
  const prev = c!.justifications[key] ?? "";
  if (prev === (text.trim() ? text : "")) return s;
  const next = mapCase(s, caseId, (x) => {
    const j = { ...x.justifications };
    if (text.trim()) j[key] = text;
    else delete j[key];
    return { ...x, justifications: j, answeredBy: { ...x.answeredBy, [key]: { by, at } } };
  });
  if (!isPart2(c!)) return next;
  const sectionId = isSlotKey(key) ? (slotSection(c!, key, s.config) ?? "GEN") : (fieldIn(s, c, key)?.sectionId ?? key);
  return part2Change(next, by, caseId, at, sectionId, "Changed justification after completeness", `Justification for ${label}${slot ? " (requested document)" : ""}: “${short(prev || "—")}” → “${short(text || "—")}”`);
}

/** Stores a document at its question. `quiet` (an answer to an open point) sends no data-changed mail: the answer mail covers it. */
export function uploadDocument(
  s: AppState,
  by: string,
  caseId: string,
  doc: { name: string; kind: DocKind; sectionId: string; fieldId?: string; sizeKb?: number },
  at = nowIso(),
  quiet = false,
): { state: AppState; docId: string } {
  const c = getCase(s, caseId);
  const blocked = supplierWriteGuard(s, by, c, at, `the documents (${doc.name})`);
  if (blocked) return { state: blocked, docId: "" };
  if (!doc.name.trim()) return { state: refuse(s, "The document has no file name."), docId: "" };
  const cur = c!;
  // A requested document (requestedDocs.ts): the file goes to its slot, in the slot's section; it is no answer.
  const slot = isSlotKey(doc.fieldId) ? requestedDocuments(cur, s.config).find((x) => x.key === doc.fieldId) : undefined;
  if (isSlotKey(doc.fieldId) && !slot && !cur.documents.some((d) => d.fieldId === doc.fieldId)) return { state: refuse(s, "This document is not requested for this case."), docId: "" };
  if (slot) doc = { ...doc, sectionId: slot.sectionId };
  const prior = cur.documents.filter((d) => d.fieldId && d.fieldId === doc.fieldId);
  const docId = `${caseId}-d${cur.documents.length + 1}`;
  const where = `${codeOf(doc.sectionId, cur, s)}${doc.fieldId ? ` › ${isSlotKey(doc.fieldId) ? `requested document ${slotName(cur, doc.fieldId, s.config)}` : (fieldIn(s, cur, doc.fieldId)?.label ?? doc.fieldId)}` : ""}`;
  // Only a file question takes the document as its answer. A document stored at another question (e.g. the answer to
  // a query on a number) sits next to that question and leaves its answer as it is.
  const fileAnswer = !!doc.fieldId && !isSlotKey(doc.fieldId) && (fieldIn(s, cur, doc.fieldId)?.type ?? "file") === "file";
  let state = mapCase(s, caseId, (x) => {
    const y: CiqCase = {
      ...x,
      documents: [...x.documents, { id: docId, name: doc.name, kind: doc.kind, sectionId: doc.sectionId, fieldId: doc.fieldId, version: prior.length + 1, uploadedBy: by, uploadedAt: at, sizeKb: doc.sizeKb ?? 180 + ((x.documents.length * 137) % 900) }],
      answers: fileAnswer ? { ...x.answers, [doc.fieldId!]: docId } : x.answers,
      answeredBy: fileAnswer ? { ...x.answeredBy, [doc.fieldId!]: { by, at } } : x.answeredBy,
    };
    return audit(y, by, at, "Uploaded document", `${doc.name} at ${where}.${prior.length ? ` Added next to ${prior.map((p) => p.name).join(", ")}.` : ""}`, doc.sectionId);
  });
  if (isPart2(cur)) {
    // An upload is a change in its section: its completed owners' reviews reopen (Thomas, 15 Oct), also for a file sent
    // with an answer to a question (`quiet`: the answer mail covers the data-changed one).
    state = reopenOwners(state, caseId, at, doc.sectionId);
    if (!quiet) state = dataChangedMail(state, getCase(state, caseId)!, by, at, doc.sectionId, `new document ${doc.name} at ${where}`);
  }
  return { state, docId };
}

// RMES criteria templates (Parts A–D). The real template is still to be shared by BDF (G-07).
function rmesCriteria(c: CiqCase): RmesCriterion[] {
  const v = c.reviewVersion;
  const has = (sec: string) => c.scope.some((x) => x.sectionId === sec && x.applicability !== "na");
  const list: RmesCriterion[] = [
    { id: "R-A1", part: "A", dept: "REG", title: "INCI and CAS of every component are consistent", source: { sectionId: "K2.1", version: v, label: "K2.1 composition table" } },
    { id: "R-A2", part: "A", dept: "REG", title: "EU REACH registration status listed for each substance", source: { sectionId: "A10", version: v, label: "Annex 10" } },
    { id: "R-B1", part: "B", dept: "REG", title: "Status under Reg. 1223/2009 Annexes III–VI", source: { sectionId: "K6.5", version: v, label: "K6.5" } },
    { id: "R-B2", part: "B", dept: "REG", title: "Animal testing statement available (Art. 11(2)(e))", source: { sectionId: "K6.7", version: v, label: "K6.7" } },
    { id: "S-A1", part: "A", dept: "SAF", title: "Byproducts and contaminants within BDF limits", source: { sectionId: "K2.2", fieldId: "FLD-A14-101", version: v, label: "K2.2 heavy metals" } },
    { id: "S-B1", part: "B", dept: "SAF", title: "Toxicological profile available and plausible", source: { sectionId: "K4.1", version: v, label: "K4.1" } },
    { id: "S-C1", part: "C", dept: "SAF", title: "Nanomaterial status plausible, justification given", source: { sectionId: "K6.9", version: v, label: "K6.9" } },
  ];
  if (has("A4")) list.push({ id: "S-C2", part: "C", dept: "SAF", title: "MOAH value assessed against BDF threshold", source: { sectionId: "A4", fieldId: "FLD-A4-101", version: v, label: "Annex 4 MOAH" } });
  if (has("A1")) list.push({ id: "R-C1", part: "C", dept: "REG", title: "Pesticide analysis available or justified", source: { sectionId: "A1", fieldId: "FLD-A1-201", version: v, label: "Annex 1 pesticides" } });
  if ((c.config.SF11 ?? []).some((m) => m !== "EU")) list.push({ id: "R-D1", part: "D", dept: "REG", title: "Listed in the chemical inventories of all target markets", source: { sectionId: "A13", version: v, label: "Annex 13" } });
  list.push({ id: "S-D1", part: "D", dept: "SAF", title: "Overall safety conclusion documented", source: { sectionId: "K4.1", version: v, label: "Safety summary" } });
  // Limit checks from structured answers (REQ-RMES-008)
  const hm = HEAVY_METAL_LIMITS.map((m) => ({ m, v: c.answers[m.fieldId] })).filter((x) => typeof x.v === "number");
  const s1 = list.find((x) => x.id === "S-A1")!;
  if (hm.length) {
    const worst = hm.reduce((a, b) => ((b.v as number) / b.m.limit > (a.v as number) / a.m.limit ? b : a));
    s1.limit = { substance: worst.m.substance, value: worst.v as number, unit: worst.m.unit, limit: worst.m.limit, limitSetVersion: LIMIT_SET_VERSION, pass: (worst.v as number) <= worst.m.limit };
  }
  const moah = c.answers["FLD-A4-101"];
  const s2 = list.find((x) => x.id === "S-C2");
  if (s2 && typeof moah === "number") s2.limit = { substance: "MOAH", value: moah, unit: "mg/kg", limit: 1.0, limitSetVersion: LIMIT_SET_VERSION, pass: moah <= 1.0 };
  const tox = list.find((x) => x.id === "S-B1")!;
  tox.aiSuggestion = "AI suggestion: the uploaded SDS lists acute oral toxicity LD50 > 2000 mg/kg (rat) on page 4; no skin sensitisation data found. Please verify.";
  return list;
}

/**
 * Keeps the RMES record current in Part 2 (REQ-RMES-012): criteria that now apply (e.g. MOAH after a late Annex 4)
 * are added, and the limit checks follow the current answers. Recorded results, comments and who/when stay as they are.
 */
function refreshRmes(s: AppState, caseId: string, at: string): AppState {
  const c = getCase(s, caseId);
  if (!c?.rmes || !isPart2(c)) return s;
  const fresh = rmesCriteria(c);
  const stored = c.rmes.criteria;
  const criteria: RmesCriterion[] = [
    ...stored.map((old) => {
      const f = fresh.find((x) => x.id === old.id);
      if (!f) return old;
      const y: RmesCriterion = { ...old };
      if (f.limit) y.limit = f.limit;
      else delete y.limit;
      return y;
    }),
    ...fresh.filter((f) => !stored.some((o) => o.id === f.id)),
  ];
  const added = criteria.filter((x) => !stored.some((o) => o.id === x.id));
  if (JSON.stringify(criteria) === JSON.stringify(stored)) return s;
  const next = mapCase(s, caseId, (x) => {
    const y: CiqCase = { ...x, rmes: { ...x.rmes!, criteria } };
    return added.length ? audit(y, "system", at, "Updated RMES record", `Criteria added because the scope grew: ${added.map((a) => `${a.id} ${a.title}`).join("; ")}.`) : y;
  });
  // A new criterion needs a result before its department may complete (REQ-RMES-006): a completed Safety or
  // Regulatory review that owns one is reopened (mail; a pending release request is withdrawn).
  const reopen = [...new Set(added.map((a) => a.dept))].filter((d) => c.reviews.find((r) => r.dept === d)?.status === "completed");
  if (!reopen.length) return next;
  return activateTracks(next, caseId, reopen, at, `RMES criterion ${added.filter((a) => reopen.includes(a.dept)).map((a) => a.id).join(", ")} now applies`);
}

export const COMPLETENESS_CONFIRMED = "Completeness confirmed. Beiersdorf can now review your questionnaire. You can still correct data and add documents until Beiersdorf requests your final release.";

/**
 * Makes sure the given tracks are active after a late scope growth or an RMM flag: a missing track is added in review,
 * a completed one is reopened (each assignee gets a mail); the RMES record is created if Safety or Regulatory join
 * late; and a case waiting for the final release goes back to review (the release request is withdrawn, mail to the
 * supplier, and sent again once every track has completed).
 */
function activateTracks(s: AppState, caseId: string, depts: ReviewDept[], at: string, why: string): AppState {
  const c0 = getCase(s, caseId)!;
  const activated: ReviewDept[] = [];
  const reopened: ReviewDept[] = [];
  let y = c0;
  for (const d of new Set(depts)) {
    const tr = y.reviews.find((r) => r.dept === d);
    if (!tr) {
      y = audit({ ...y, reviews: [...y.reviews, { dept: d, status: "in-review", assigneeId: assigneeFor(s, y, d), startedAt: at }] }, "system", at, "Activated review", `${DEPT_SHORT[d]} review activated: ${why}.`);
      activated.push(d);
    } else if (tr.status === "completed") {
      y = audit({ ...y, reviews: y.reviews.map((r) => (r.dept === d ? { ...r, status: "reopened", completedAt: undefined, lastCompletedAt: r.completedAt ?? r.lastCompletedAt } : r)) }, "system", at, `Reopened ${DEPT_SHORT[d]} review`, `${why}.`);
      reopened.push(d);
    }
  }
  if (!y.rmes && y.reviews.some((r) => r.dept === "SAF" || r.dept === "REG")) {
    y = audit({ ...y, rmes: { createdAt: at, reviewVersion: y.reviewVersion, criteria: rmesCriteria(y), findings: [] } }, "system", at, "Created RMES record", `Safety or Regulatory joined the review: ${why}.`);
  }
  const withdrawn = y.phase === "final-release" && y.reviews.some((r) => r.status !== "completed");
  if (withdrawn) y = audit(setPhase(y, "review", at), "system", at, "Final-release request withdrawn", `${why}; the release request is sent again once every review has completed.`);
  let next = mapCase(s, caseId, () => y);
  if (activated.length) next = reviewAssignedMail(next, y, activated, "system", at, `A review task was added: ${why}.`);
  if (reopened.length) next = reviewAssignedMail(next, y, reopened, "system", at, `Your completed review was reopened: ${why}.`);
  if (withdrawn) next = supplierMail(next, y, "release-withdrawn", "system", at);
  return next;
}

/**
 * The supplier confirms completeness: the gate that closes Part 1 (blocked by unanswered mandatory fields and, for
 * liveScope cases, unanswered metadata questions). The system then activates only the relevant department reviews,
 * assigns the whole CIQ to RMM as its own review task, informs Customs and Legal, and flags an origin without rules.
 */
export function confirmCompleteness(s: AppState, by: string, caseId: string, at = nowIso()): AppState {
  const c = getCase(s, caseId);
  if (!c) return refuse(s, "This request no longer exists.");
  if (isClosed(c)) return supplierWriteGuard(s, by, c, at, "the completeness confirmation")!;
  if (c.phase !== "supplier-input") return refuse(s, "Completeness can only be confirmed while the supplier fills in the CIQ.", "info");
  const denied = check(s, by, "ciq.confirm", c);
  if (denied) return refuse(s, denied);
  const blockers = completenessBlockers(c, s.config);
  if (blockers.length) return refuse(s, `${blockers.length} item(s) must be completed or justified first.`);
  const depts = departmentsForScope(c.scope, s.ownership);
  const who = userOf(s, by);
  let y: CiqCase = { ...c, reviewVersion: c.reviewVersion + 1 };
  y = setPhase(y, "review", at);
  y = confirm(s, y, by, at, "completeness", undefined, "Completeness confirmation: data and documents provided from the supplier's point of view. Not a Beiersdorf approval.");
  y = {
    ...y,
    reviews: [{ dept: "RMM", status: "in-review", assigneeId: assigneeFor(s, c, "RMM"), startedAt: at }, ...depts.map((d) => ({ dept: d, status: "in-review" as const, assigneeId: assigneeFor(s, c, d), startedAt: at }))],
    informed: ["CUS", "LEG"],
  };
  y = { ...y, rmes: depts.some((d) => d === "SAF" || d === "REG") ? { createdAt: at, reviewVersion: y.reviewVersion, criteria: rmesCriteria(y), findings: [] } : undefined };
  // The requested documents are fixed now; after the confirmation they only grow, like the scope.
  const slots = requestedDocuments(c, s.config);
  if (slots.length) y = { ...y, requestedDocs: storableSlots(slots) };
  y = audit(y, by, at, "Confirmed completeness", `Confirmed by ${who?.name ?? by}${who?.email ? ` <${who.email}>` : ""}. Part 1 completed; the review starts.`);
  y = audit(y, "system", at, "Activated reviews", `CIQ assigned to RMM (${userName(s, c.ownerId)}) for the whole-CIQ review; review tasks created for ${depts.map((d) => DEPT_SHORT[d]).join(", ") || "no department"}; Customs and Legal informed.${y.rmes ? " One RMES record created." : ""}`);
  if (rmmFlags(y).length) y = audit(y, "system", at, "Flagged for RMM", flagDetail(y.config));
  let next = mapCase(s, caseId, () => y);
  next = reviewAssignedMail(next, y, y.reviews.map((r) => r.dept), "system", at, `${who?.name ?? "The supplier"} confirmed completeness of the CIQ.`);
  for (const d of ["CUS", "LEG"] as const) {
    const sec = INFORMED_SECTION[d];
    next = internalMail(
      next,
      deptUserIds(next, d),
      {
        by: "system",
        event: "informed",
        subject: `${c.id}: for your information`,
        body: `The supplier confirmed completeness of the CIQ for ${c.materialName} (${c.id}). ${DEPT_SHORT[d]} is informed and can read the case; the link opens ${sec} · ${secOf(s, c, sec)?.title ?? ""}.`,
        link: `${caseLink(c.id, "questionnaire")}&s=${sec}`,
        caseId: c.id,
        sectionId: sec,
      },
      at,
    );
  }
  return toast(next, "success", COMPLETENESS_CONFIRMED);
}

// ---------------------------------------------------------------------------------- Part 2: open points

export interface RaiseInput {
  dept: ReviewDept;
  kind: OpenPointKind;
  ref: ObjectRef;
  question: string;
  justification: string;
  dueDate: string;
  responsibleId?: string;
}

/** A query, document request, additional part or finding question to the supplier (spec §1.5–1.6). */
export function raiseOpenPoint(s: AppState, by: string, caseId: string, input: RaiseInput, at = nowIso()): AppState {
  const c = getCase(s, caseId);
  if (!c) return refuse(s, "This case no longer exists.");
  if (!input.question.trim()) return refuse(s, "A query needs a question.");
  if (c.phase !== "review") return refuse(s, c.phase === "final-release" ? "Every review has completed. Reopen your review to ask the supplier." : "Questions to the supplier are raised during the review.");
  if (by !== "system") {
    const denied = check(s, by, "op.raise", c, { dept: input.dept });
    if (denied) return refuse(s, denied);
    if (c.reviews.find((r) => r.dept === input.dept)?.status === "completed") return refuse(s, "Your review is completed. Reopen it to ask the supplier.");
  }
  if (scopeOf(c, input.ref.sectionId)?.applicability === "na") return refuse(s, `${codeOf(input.ref.sectionId, c, s)} does not apply to this case.`);
  if (!input.dueDate || !notBeforeToday(input.dueDate, at)) return refuse(s, "The due date must be today or later.");
  const responsibleId = input.responsibleId ?? by;
  const resp = userOf(s, responsibleId);
  if (by !== "system" && (!resp || resp.side !== "internal" || resp.dept !== input.dept || !isActiveUser(resp))) return refuse(s, `The responsible person must be a Beiersdorf user of ${DEPT_SHORT[input.dept]}.`);
  const n = c.openPoints.length + 1;
  const op: OpenPoint = {
    id: `OP-${c.id.slice(-4)}-${String(n).padStart(2, "0")}`,
    caseId,
    dept: input.dept,
    kind: input.kind,
    ref: input.ref,
    question: input.question.trim(),
    justification: input.justification,
    responsibleId,
    dueDate: input.dueDate,
    status: "open",
    createdAt: at,
    createdBy: by,
    rounds: 1,
    thread: [{ id: `${c.id}-m${n}-1`, at, by, side: "internal", text: input.question.trim(), action: "raised" }],
  };
  const ops = [...c.openPoints, op];
  let y: CiqCase = { ...c, openPoints: ops, reviews: retrack(c.reviews, ops) };
  y = audit(y, by, at, input.kind === "document-request" ? "Requested document" : input.kind === "additional-part" ? "Activated additional section" : "Raised query", `${op.id} on ${input.ref.label}: ${op.question} Due ${fmtDate(op.dueDate)}; responsible ${userName(s, responsibleId)}.`, input.ref.sectionId);
  const next = mapCase(s, caseId, () => y);
  return supplierMail(next, y, "op-raised", by, at, op);
}

export function supplierRespond(s: AppState, by: string, caseId: string, opId: string, input: { text: string; cannotProvide?: boolean; documentName?: string; sizeKb?: number }, at = nowIso()): AppState {
  const c0 = getCase(s, caseId);
  if (!c0) return refuse(s, "This request no longer exists.");
  if (isClosed(c0)) return supplierWriteGuard(s, by, c0, at, `the answer to ${opId}`)!;
  const denied = check(s, by, "op.respond", c0, { opId });
  if (denied) return refuse(s, denied);
  if (!input.text.trim()) return refuse(s, input.cannotProvide ? "Please explain why it cannot be provided." : "Please write a short answer.");
  const op0 = c0.openPoints.find((p) => p.id === opId)!;
  let state = s;
  let documentId: string | undefined;
  if (input.documentName) {
    const r = uploadDocument(state, by, caseId, { name: input.documentName, kind: "Analysis", sectionId: op0.ref.sectionId, fieldId: op0.ref.fieldId, sizeKb: input.sizeKb }, at, true);
    if (!r.docId) return r.state;
    state = r.state;
    documentId = r.docId;
  }
  state = mapCase(state, caseId, (c) => {
    const ops = c.openPoints.map((p) =>
      p.id === opId ? { ...p, status: "in-progress" as const, thread: [...p.thread, { id: `${p.id}-m${p.thread.length + 1}`, at, by, side: "supplier" as const, text: input.text.trim(), action: input.cannotProvide ? ("cannot-provide" as const) : ("answered" as const), documentId }] } : p,
    );
    const y: CiqCase = { ...c, openPoints: ops, reviews: retrack(c.reviews, ops) };
    return audit(y, by, at, input.cannotProvide ? "Justified non-delivery" : "Answered query", `${opId}: ${input.text.trim()}${input.documentName ? ` (document ${input.documentName})` : ""}`, op0.ref.sectionId);
  });
  const c1 = getCase(state, caseId)!;
  return answeredMail(state, c1, c1.openPoints.find((p) => p.id === opId)!, by, at, input.text, !!input.cannotProvide, input.documentName);
}

/** The raiser decides on the supplier's answer: accept, return (a new round) or close as not accepted. */
export function reviewResponse(s: AppState, by: string, caseId: string, opId: string, decision: "accept" | "return" | "not-accepted", text: string, at = nowIso()): AppState {
  const c0 = getCase(s, caseId);
  if (!c0) return refuse(s, "This case no longer exists.");
  if (isClosed(c0)) return refuse(s, "The case is closed.");
  const denied = check(s, by, "op.decide", c0, { opId });
  if (denied) return refuse(s, denied);
  const op0 = c0.openPoints.find((p) => p.id === opId)!;
  if (op0.status === "closed") return refuse(s, "This open point is already closed.", "info");
  if (op0.status === "open") return refuse(s, "The supplier has not answered yet. You can edit or close the point instead.");
  if (decision !== "accept" && !text.trim()) return refuse(s, "Please give a short reason.");
  let next = mapCase(s, caseId, (c) => {
    const ops = c.openPoints.map((p): OpenPoint => {
      if (p.id !== opId) return p;
      const msg: Message = { id: `${p.id}-m${p.thread.length + 1}`, at, by, side: "internal", text: text.trim() || "Accepted.", action: decision === "return" ? "returned" : "accepted" };
      if (decision === "accept") return { ...p, status: "closed", outcome: "accepted", closedAt: at, closedBy: by, thread: [...p.thread, msg] };
      if (decision === "not-accepted") return { ...p, status: "closed", outcome: "not-accepted", closedAt: at, closedBy: by, thread: [...p.thread, { ...msg, action: "note" }] };
      // A returned point gets a fresh due date (7 days), so it is not overdue the moment it goes back.
      const fresh = new Date(Math.max(Date.parse(p.dueDate), Date.parse(at) + 7 * DAY_MS)).toISOString();
      return { ...p, status: "open", rounds: p.rounds + 1, dueDate: fresh, thread: [...p.thread, { ...msg, newRound: true }] };
    });
    let y: CiqCase = { ...c, openPoints: ops, reviews: retrack(c.reviews, ops) };
    y = audit(y, by, at, decision === "accept" ? "Accepted answer" : decision === "return" ? "Returned answer to supplier" : "Closed as not accepted", `${opId}${text.trim() ? `: ${text.trim()}` : ""}`, op0.ref.sectionId);
    if (decision === "not-accepted" && c.rmes && (op0.dept === "SAF" || op0.dept === "REG")) {
      y = { ...y, rmes: { ...c.rmes, findings: [...c.rmes.findings, { id: `${opId}-F`, criterionId: "", dept: op0.dept, text: `Not accepted: ${op0.question}`, blocking: false, status: "closed", openPointId: opId }] } };
    }
    return y;
  });
  const c1 = getCase(next, caseId)!;
  next = supplierMail(next, c1, decision === "accept" ? "op-accepted" : decision === "return" ? "op-returned" : "op-closed", by, at, c1.openPoints.find((p) => p.id === opId));
  return next;
}

export interface OpenPointPatch {
  question?: string;
  justification?: string;
  dueDate?: string;
  responsibleId?: string;
}

/**
 * AS-08: the raiser edits its open point (question, justification, due date, responsible). Editing the question of a
 * point the supplier has answered starts a new round to the supplier; changing only the due date or the justification
 * does not. Every change is kept in the point's history (thread entry + edits) and reaches the supplier (mail).
 */
export function editOpenPoint(s: AppState, by: string, caseId: string, opId: string, patch: OpenPointPatch, at = nowIso()): AppState {
  const c = getCase(s, caseId);
  if (!c) return refuse(s, "This case no longer exists.");
  if (isClosed(c)) return refuse(s, "The case is closed.");
  const denied = check(s, by, "op.edit", c, { opId });
  if (denied) return refuse(s, denied);
  const op = c.openPoints.find((p) => p.id === opId)!;
  if (op.status === "closed") return refuse(s, "A closed open point cannot be edited.");
  if (patch.question !== undefined && !patch.question.trim()) return refuse(s, "The question cannot be empty.");
  if (patch.dueDate !== undefined && !notBeforeToday(patch.dueDate, at)) return refuse(s, "The due date must be today or later.");
  if (patch.responsibleId !== undefined) {
    const r = userOf(s, patch.responsibleId);
    if (!r || r.side !== "internal" || r.dept !== op.dept || !isActiveUser(r)) return refuse(s, `The responsible person must be a Beiersdorf user of ${DEPT_SHORT[op.dept]}.`);
  }
  const edits: OpenPointEdit[] = [];
  const add = (field: OpenPointEdit["field"], from: string, to: string) => from !== to && edits.push({ at, by, field, from, to });
  if (patch.question !== undefined) add("question", op.question, patch.question.trim());
  if (patch.justification !== undefined) add("justification", op.justification, patch.justification.trim());
  if (patch.dueDate !== undefined && fmtDate(patch.dueDate) !== fmtDate(op.dueDate)) add("dueDate", op.dueDate, patch.dueDate);
  if (patch.responsibleId !== undefined) add("responsibleId", op.responsibleId, patch.responsibleId);
  if (!edits.length) return refuse(s, "Nothing changed.", "info");
  const questionChanged = edits.some((e) => e.field === "question");
  const newRound = questionChanged && op.status === "in-progress";
  const parts = edits.map((e) =>
    e.field === "question"
      ? `Question changed from “${e.from}” to “${e.to}”.`
      : e.field === "justification"
        ? `Justification changed to “${e.to}”.`
        : e.field === "dueDate"
          ? `Due date changed from ${fmtDate(e.from)} to ${fmtDate(e.to)}.`
          : `Responsible person changed from ${userName(s, e.from)} to ${userName(s, e.to)}.`,
  );
  let next = mapCase(s, caseId, (x) => {
    const ops = x.openPoints.map((p): OpenPoint => {
      if (p.id !== opId) return p;
      const msg: Message = { id: `${p.id}-m${p.thread.length + 1}`, at, by, side: "internal", text: parts.join(" "), action: "edited", ...(newRound ? { newRound: true } : {}) };
      return {
        ...p,
        question: patch.question?.trim() ?? p.question,
        justification: patch.justification?.trim() ?? p.justification,
        dueDate: patch.dueDate ?? p.dueDate,
        responsibleId: patch.responsibleId ?? p.responsibleId,
        status: newRound ? "open" : p.status,
        rounds: newRound ? p.rounds + 1 : p.rounds,
        edits: [...(p.edits ?? []), ...edits],
        thread: [...p.thread, msg],
      };
    });
    return audit({ ...x, openPoints: ops, reviews: retrack(x.reviews, ops) }, by, at, "Edited open point", `${opId}: ${parts.join(" ")}${newRound ? " The supplier answers again (new round)." : ""}`, op.ref.sectionId);
  });
  const c1 = getCase(next, caseId)!;
  next = supplierMail(next, c1, "op-edited", by, at, c1.openPoints.find((p) => p.id === opId), { newRound });
  return toast(next, "success", newRound ? "Open point changed and sent to the supplier again." : "Open point changed. The supplier sees the change.");
}

/**
 * AS-08: the raiser closes (withdraws) its open point in any unresolved state, with an internal reason. It stops
 * blocking the track; the supplier is told it needs no answer (without the reason).
 */
export function closeOpenPoint(s: AppState, by: string, caseId: string, opId: string, reason: string, at = nowIso()): AppState {
  const c = getCase(s, caseId);
  if (!c) return refuse(s, "This case no longer exists.");
  if (isClosed(c)) return refuse(s, "The case is closed.");
  const denied = check(s, by, "op.close", c, { opId });
  if (denied) return refuse(s, denied);
  const op = c.openPoints.find((p) => p.id === opId)!;
  if (op.status === "closed") return refuse(s, "This open point is already closed.", "info");
  if (!reason.trim()) return refuse(s, "Please give a short internal reason for closing the point.");
  let next = mapCase(s, caseId, (x) => {
    const ops = x.openPoints.map((p): OpenPoint =>
      p.id === opId
        ? { ...p, status: "closed", outcome: "withdrawn", closedAt: at, closedBy: by, closeReason: reason.trim(), thread: [...p.thread, { id: `${p.id}-m${p.thread.length + 1}`, at, by, side: "internal", text: "Closed by Beiersdorf: no answer needed.", action: "withdrawn" }] }
        : p,
    );
    return audit({ ...x, openPoints: ops, reviews: retrack(x.reviews, ops) }, by, at, "Closed open point (no answer needed)", `${opId} on ${op.ref.label} closed by the raiser. Internal reason: ${reason.trim()}`, op.ref.sectionId);
  });
  const c1 = getCase(next, caseId)!;
  next = supplierMail(next, c1, "op-closed", by, at, c1.openPoints.find((p) => p.id === opId));
  return toast(next, "success", "Open point closed. The supplier is told no answer is needed.");
}

// ---------------------------------------------------------------------------------- Part 2: RMES

function rmesGuard(s: AppState, by: string, c: CiqCase | undefined, dept: "SAF" | "REG"): string | null {
  if (!c) return "This case no longer exists.";
  if (c.phase !== "review") return "The internal evaluation is recorded during the review.";
  if (!c.rmes) return "This case has no RMES record.";
  const denied = check(s, by, "rmes.record", c, { dept });
  if (denied) return denied;
  if (c.reviews.find((r) => r.dept === dept)?.status === "completed") return `The ${DEPT_SHORT[dept]} review is completed. Reopen it to change the evaluation.`;
  return null;
}

export function recordCriterion(s: AppState, by: string, caseId: string, criterionId: string, result: RmesResult, comment: string, at = nowIso()): AppState {
  const c = getCase(s, caseId);
  const cr = c?.rmes?.criteria.find((x) => x.id === criterionId);
  if (!cr) return refuse(s, "This RMES criterion no longer exists.");
  const blocked = rmesGuard(s, by, c, cr.dept);
  if (blocked) return refuse(s, blocked);
  if ((result === "negative" || result === "implausible" || result === "na") && !comment.trim()) return refuse(s, "A comment is required for a negative, implausible or N.A. result.");
  return mapCase(s, caseId, (x) =>
    audit({ ...x, rmes: { ...x.rmes!, criteria: x.rmes!.criteria.map((y) => (y.id === criterionId ? { ...y, result, comment, by, at } : y)) } }, by, at, "Recorded RMES result", `${criterionId}: ${result}${comment ? ` — ${comment}` : ""}.`),
  );
}

export function addFinding(s: AppState, by: string, caseId: string, criterionId: string, text: string, blocking: boolean, at = nowIso()): AppState {
  const c = getCase(s, caseId);
  const cr = c?.rmes?.criteria.find((x) => x.id === criterionId);
  if (!cr) return refuse(s, "This RMES criterion no longer exists.");
  const blocked = rmesGuard(s, by, c, cr.dept);
  if (blocked) return refuse(s, blocked);
  if (!text.trim()) return refuse(s, "Describe the finding.");
  return mapCase(s, caseId, (x) => {
    const id = `${x.id.slice(-4)}-F${x.rmes!.findings.length + 1}`;
    return audit({ ...x, rmes: { ...x.rmes!, findings: [...x.rmes!.findings, { id, criterionId, dept: cr.dept, text, blocking, status: "open" }] } }, by, at, "Added finding", `${id} (${blocking ? "blocking" : "non-blocking"}) on ${criterionId}: ${text}`);
  });
}

export function findingToQuery(s: AppState, by: string, caseId: string, findingId: string, question: string, dueDate: string, at = nowIso()): AppState {
  const c = getCase(s, caseId);
  const f = c?.rmes?.findings.find((x) => x.id === findingId);
  const cr = c?.rmes?.criteria.find((x) => x.id === f?.criterionId);
  if (!c || !f || !cr) return refuse(s, "This finding no longer exists.");
  const next = raiseOpenPoint(s, by, caseId, { dept: f.dept, kind: "finding", ref: { sectionId: cr.source.sectionId, fieldId: cr.source.fieldId, label: cr.source.label }, question, justification: "Needed for the internal evaluation", dueDate }, at);
  const after = getCase(next, caseId)!;
  if (after.openPoints.length === c.openPoints.length) return next; // refused
  const op = after.openPoints.at(-1)!;
  return mapCase(next, caseId, (x) => (x.rmes ? { ...x, rmes: { ...x.rmes, findings: x.rmes.findings.map((y) => (y.id === findingId ? { ...y, openPointId: op.id } : y)) } } : x));
}

export function closeFinding(s: AppState, by: string, caseId: string, findingId: string, at = nowIso()): AppState {
  const c = getCase(s, caseId);
  const f = c?.rmes?.findings.find((x) => x.id === findingId);
  if (!f) return refuse(s, "This finding no longer exists.");
  const blocked = rmesGuard(s, by, c, f.dept);
  if (blocked) return refuse(s, blocked);
  return mapCase(s, caseId, (x) => audit({ ...x, rmes: { ...x.rmes!, findings: x.rmes!.findings.map((y) => (y.id === findingId ? { ...y, status: "closed" } : y)) } }, by, at, "Closed finding", findingId));
}

/**
 * Safety or Regulatory records its internal decision (REQ-RMES-013). Rejected needs a reason and flags the case for
 * RMM (AS-02): RMM's completion then needs an explicit "continue" (or RMM cancels), and a completed RMM review is
 * reopened. The supplier never sees the decision.
 */
export function rmesDecision(s: AppState, by: string, caseId: string, dept: "SAF" | "REG", decision: "approved" | "rejected", reason: string, at = nowIso()): AppState {
  const c = getCase(s, caseId);
  if (!c) return refuse(s, "This case no longer exists.");
  if (userOf(s, by)?.dept !== dept) return refuse(s, `Only ${DEPT_SHORT[dept]} can give the ${DEPT_SHORT[dept]} decision.`);
  const blocked = rmesGuard(s, by, c, dept);
  if (blocked) return refuse(s, blocked);
  if (decision === "rejected" && !reason.trim()) return refuse(s, "A rejection reason is mandatory.");
  const pending = c.rmes?.criteria.filter((x) => x.dept === dept && !x.result) ?? [];
  if (pending.length) return refuse(s, `${pending.length} RMES criteria still have no result.`);
  if (c.rmes?.findings.some((f) => f.dept === dept && f.status === "open") && decision === "approved") return refuse(s, "A finding is still open. Close it, or ask the supplier about it, first.");
  let next = mapCase(s, caseId, (x) => audit({ ...x, reviews: x.reviews.map((r) => (r.dept === dept ? { ...r, decision, decisionReason: reason } : r)) }, by, at, `Final ${DEPT_SHORT[dept]} decision`, `${decision === "approved" ? "Approved" : "Rejected"}${reason ? ` — ${reason}` : ""}`));
  if (decision === "rejected") {
    next = mapCase(next, caseId, (x) => audit(x, "system", at, "Flagged for RMM", `${DEPT_SHORT[dept]} recorded an internal Rejected decision. RMM agrees with ${DEPT_SHORT[dept]} whether to cancel the case or to continue to the final release.`));
    if (getCase(next, caseId)!.reviews.find((r) => r.dept === "RMM")?.status === "completed") next = activateTracks(next, caseId, ["RMM"], at, `${DEPT_SHORT[dept]} recorded an internal Rejected decision`);
  }
  return next;
}

// ---------------------------------------------------------------------------------- Part 2: tracks

export interface CompleteOptions {
  /** RMM only, when a department recorded Rejected: the note of the explicit choice "Continue to final release". */
  continueNote?: string;
  /**
   * The moment the reviewer completed, when the completion is applied later (the live sync service, H-08: the CIQ
   * Review item's Completed_At). Supplier changes already in the case that came after that moment, in a section the
   * department leads or co-reviews, reopen its review right after the completion (Thomas, 15 Oct), exactly as if the
   * change had reached a completed review; the release request is then not sent. Metadata answers keep their own
   * grow-only rule (B-28).
   */
  completedAt?: string;
}

/** RMM or a department completes its review (not a raw-material approval). The last completion, RMM's included, sends the single final-release request. */
export function completeReview(s: AppState, by: string, caseId: string, dept: ReviewDept, at = nowIso(), opts: CompleteOptions = {}): AppState {
  const c = getCase(s, caseId);
  if (!c) return refuse(s, "This case no longer exists.");
  if (c.phase !== "review") return refuse(s, "Reviews can only be completed while the case is in review.");
  const track = c.reviews.find((r) => r.dept === dept);
  if (!track) return refuse(s, `${DEPT_SHORT[dept]} has no review task on ${caseId}.`);
  const denied = check(s, by, "review.complete", c, { dept });
  if (denied) return refuse(s, denied);
  if (track.status === "completed") return refuse(s, `The ${DEPT_SHORT[dept]} review is already completed.`, "info");
  const blockers = reviewBlockers(c, dept);
  if (blockers.length) return refuse(s, `Cannot complete: ${blockers.length} open item(s). ${blockers[0]}`);
  const pendingRejection = dept === "RMM" ? rejectionNeedsRmmChoice(c) : [];
  const continueNote = opts.continueNote?.trim() ?? "";
  if (pendingRejection.length && !continueNote)
    return refuse(s, `${pendingRejection.map((d) => DEPT_SHORT[d]).join(" and ")} recorded Rejected. Choose: continue to the final release with a note, or cancel the case with a justification.`);
  const flags = dept === "RMM" ? rmmFlags(c) : [];
  const note =
    dept === "RMM"
      ? // The continue-after-rejection choice stays on the track and in the audit: the confirmation goes into the final
        // document, which holds no RMES decision.
        `RMM review completed: whole CIQ reviewed, no open query.${flags.length ? ` Flag reviewed: ${flags.join(" ")}` : ""} Not a raw-material approval.`
      : "Review completed: assigned data and documents reviewed, no open query. Not a raw-material approval.";
  let state = mapCase(s, caseId, (x) => {
    let y: CiqCase = {
      ...x,
      reviews: x.reviews.map((r) =>
        r.dept === dept ? { ...r, status: "completed", completedAt: at, ...(pendingRejection.length ? { continueAfterRejection: { note: continueNote, by, at, depts: rejectedDepts(x) } } : {}) } : r,
      ),
    };
    if (pendingRejection.length) y = audit(y, by, at, "Continue after rejection", `RMM continues to the final release despite the Rejected decision of ${pendingRejection.map((d) => DEPT_SHORT[d]).join(" and ")}: ${continueNote}`);
    y = confirm(s, y, by, at, "dept-completion", dept, note);
    y = audit(y, by, at, `Completed ${DEPT_SHORT[dept]} review`, dept === "RMM" ? "Whole CIQ reviewed; no open points." : "All assigned sections reviewed; no open points.");
    return y;
  });
  // A completion applied after supplier changes that came later than it (opts.completedAt): reopened at once (rule 1).
  const late = opts.completedAt ? sectionsChangedSince(getCase(state, caseId)!, opts.completedAt, s.config, { metadata: false }).filter((sec) => ownsSection(s, dept, sec)) : [];
  if (late.length) {
    state = activateTracks(state, caseId, [dept], at, `The supplier changed ${joinSections(s, c, late)} after your review`);
    // the "changed since your review" markers count from the reviewer's own completion, so the later change shows
    state = mapCase(state, caseId, (x) => ({ ...x, reviews: x.reviews.map((r) => (r.dept === dept ? { ...r, lastCompletedAt: opts.completedAt } : r)) }));
  }
  const after = getCase(state, caseId)!;
  // The single final-release request waits for RMM and every activated department (REQ-PROC-040).
  if (after.reviews.every((r) => r.status === "completed")) {
    const depts = after.reviews.filter((r) => r.dept !== "RMM").length;
    state = mapCase(state, caseId, (x) => audit(setPhase(x, "final-release", at), "system", at, "All reviews completed", `${depts ? `RMM and ${depts === 1 ? "1 department review" : `${depts} department reviews`}` : "The RMM review"} completed. One request for the final release sent to the supplier.`));
    state = supplierMail(state, getCase(state, caseId)!, "release-requested", "system", at);
  }
  return toast(state, "success", `${DEPT_SHORT[dept]} review completed.`);
}

/** A reviewer reopens its completed review (with a reason). In final-release the release request is withdrawn and the
 *  supplier's questionnaire unlocks again (back to review). */
export function reopenReview(s: AppState, by: string, caseId: string, dept: ReviewDept, reason: string, at = nowIso()): AppState {
  const c = getCase(s, caseId);
  if (!c) return refuse(s, "This case no longer exists.");
  if (!isPart2(c)) return refuse(s, "A review can be reopened only before the final release.");
  const denied = check(s, by, "review.reopen", c, { dept });
  if (denied) return refuse(s, denied);
  if (c.reviews.find((r) => r.dept === dept)?.status !== "completed") return refuse(s, `The ${DEPT_SHORT[dept]} review is not completed.`, "info");
  if (!reason.trim()) return refuse(s, "Please give a reason for reopening.");
  const withdraw = c.phase === "final-release";
  let next = mapCase(s, caseId, (x) => {
    let y: CiqCase = { ...x, reviews: x.reviews.map((r) => (r.dept === dept ? { ...r, status: "reopened", completedAt: undefined, lastCompletedAt: r.completedAt ?? r.lastCompletedAt } : r)) };
    y = audit(y, by, at, `Reopened ${DEPT_SHORT[dept]} review`, `${sentence(reason)}.`);
    if (withdraw) y = audit(setPhase(y, "review", at), "system", at, "Final-release request withdrawn", `${DEPT_SHORT[dept]} reopened its review; the release request is sent again once every review has completed.`);
    return y;
  });
  if (withdraw) next = supplierMail(next, getCase(next, caseId)!, "release-withdrawn", by, at);
  return toast(next, "success", `${DEPT_SHORT[dept]} review reopened.`);
}

/** Hands a review track to another member of the same department, with a reason (documented reassignment). */
export function reassignReview(s: AppState, by: string, caseId: string, dept: ReviewDept, toUserId: string, reason: string, at = nowIso()): AppState {
  const c = getCase(s, caseId);
  if (!c) return refuse(s, "This case no longer exists.");
  if (isClosed(c)) return refuse(s, "The case is closed.");
  const denied = check(s, by, "review.reassign", c, { dept });
  if (denied) return refuse(s, denied);
  const tr = c.reviews.find((r) => r.dept === dept)!;
  const to = userOf(s, toUserId);
  if (!to || to.side !== "internal" || to.dept !== dept || !isActiveUser(to)) return refuse(s, `Choose another member of ${DEPT_SHORT[dept]}.`);
  if (to.id === tr.assigneeId) return refuse(s, `${to.name} already has this review.`, "info");
  if (!reason.trim()) return refuse(s, "Please give a reason for the reassignment.");
  const from = tr.assigneeId;
  let next = mapCase(s, caseId, (x) => {
    // System-raised points of the track follow the reviewer; points a person raised stay with that person (AS-08).
    const ops = x.openPoints.map((p) => (p.dept === dept && p.status !== "closed" && p.createdBy === "system" && p.responsibleId === from ? { ...p, responsibleId: to.id } : p));
    return audit({ ...x, openPoints: ops, reviews: x.reviews.map((r) => (r.dept === dept ? { ...r, assigneeId: to.id } : r)) }, by, at, `Reassigned ${DEPT_SHORT[dept]} review`, `${userName(s, from)} → ${to.name}: ${reason.trim()}`);
  });
  next = reviewAssignedMail(next, getCase(next, caseId)!, [dept], by, at, `${userName(s, by)} handed this review to you: ${reason.trim()}`);
  return toast(next, "success", `Review handed to ${to.name}.`);
}

// ---------------------------------------------------------------------------------- the ending

/** With the release the case completes automatically and the final document is generated once (AS-12, R-2). */
function complete(s: AppState, caseId: string, by: string, at: string): AppState {
  let next = mapCase(s, caseId, (c) => audit(setPhase(c, "completed", at), "system", at, "Case completed", "Completed automatically after the supplier's final release."));
  const c = getCase(next, caseId)!;
  const doc = buildFinalDocument(next, c, at, `Final release by ${userName(next, by)}`);
  next = mapCase(next, caseId, (x) => audit({ ...x, finalDocument: doc }, "system", at, "Generated final document", `Final document generated automatically, sealed and filed on the case (document seal ${doc.fingerprint}). Sent to the RMM owner. It cannot be changed.`));
  const done = getCase(next, caseId)!;
  next = supplierMail(next, done, "release-receipt", by, at);
  next = internalMail(
    next,
    [done.ownerId],
    { by: "system", event: "final-document", subject: `${done.id}: final document ready`, body: `The supplier gave the final release of ${done.materialName} (${done.id}) and the case is completed. The final document was generated automatically and sealed (document seal ${doc.fingerprint}). It holds the released answers, the evidence list, every open-point thread and all confirmations.`, link: caseLink(done.id, "final-document"), caseId: done.id },
    at,
  );
  return next;
}

/** The supplier's final release: the CIQ is frozen, the case completes automatically and the final document goes to RMM (BRM PS-11, PS-12). */
export function finalRelease(s: AppState, by: string, caseId: string, at = nowIso()): AppState {
  const c = getCase(s, caseId);
  if (!c) return refuse(s, "This request no longer exists.");
  if (c.phase === "completed") return refuse(s, "The final release was already given.", "info");
  if (c.phase === "cancelled") return supplierWriteGuard(s, by, c, at, "the final release")!;
  if (c.phase !== "final-release") return refuse(s, "The final release is requested only after RMM and every activated department have completed their review.");
  const denied = check(s, by, "ciq.release", c);
  if (denied) return refuse(s, denied);
  const blockers = releaseBlockers(c, s.config);
  if (blockers.length) return refuse(s, `The release is not possible yet: ${blockers.map((b) => b.supplierLabel ?? b.label).join("; ")}.`);
  let next = mapCase(s, caseId, (x) => {
    const y = confirm(s, x, by, at, "final-release", undefined, "Final CIQ release: the information and evidence are correct and complete. The CIQ is frozen.");
    return audit(y, by, at, "Gave final release", "CIQ frozen: every answer and upload is locked.");
  });
  next = complete(next, caseId, by, at);
  return toast(next, "success", "Final release recorded. The CIQ is now frozen.");
}

/** RMM cancels the case in any phase before completion, with a justification (REQ-PROC-049). */
export function cancelCase(s: AppState, by: string, caseId: string, reason: string, at = nowIso()): AppState {
  const c = getCase(s, caseId);
  if (!c) return refuse(s, "This case no longer exists.");
  const denied = check(s, by, "case.cancel", c);
  if (denied) return refuse(s, denied);
  if (c.phase === "completed") return refuse(s, "A completed case cannot be cancelled.");
  if (c.phase === "cancelled") return refuse(s, "The case is already cancelled.", "info");
  if (!reason.trim()) return refuse(s, "A justification is required to cancel.");
  const open = c.openPoints.filter((p) => p.status !== "closed");
  const assignees = c.reviews.filter((r) => r.status !== "completed").map((r) => r.assigneeId);
  let next = mapCase(s, caseId, (x) => {
    const ops = x.openPoints.map((p): OpenPoint =>
      p.status === "closed" ? p : { ...p, status: "closed", outcome: "withdrawn", closedAt: at, closedBy: by, closeReason: `Case cancelled: ${reason.trim()}`, thread: [...p.thread, { id: `${p.id}-m${p.thread.length + 1}`, at, by, side: "internal", text: "Closed: the request was withdrawn.", action: "withdrawn" }] },
    );
    let y: CiqCase = setPhase({ ...x, openPoints: ops, reviews: retrack(x.reviews, ops), cancelled: { by, at, reason: reason.trim(), fromPhase: x.phase } }, "cancelled", at);
    y = confirm(s, y, by, at, "cancellation", undefined, reason.trim());
    const ended = x.reviews.filter((r) => r.status !== "completed").map((r) => DEPT_SHORT[r.dept]);
    return audit(
      y,
      by,
      at,
      "Cancelled case",
      `${sentence(reason)}. Every open task ended, the supplier's included${ended.length ? `; review tasks ended: ${ended.join(", ")}` : ""}${open.length ? `; ${open.length === 1 ? "1 open point" : `${open.length} open points`} closed` : ""}.`,
    );
  });
  const done = getCase(next, caseId)!;
  next = supplierMail(next, done, "cancelled", by, at);
  next = internalMail(next, assignees.filter((x) => x !== by), { by, event: "cancelled", subject: `${done.id}: case cancelled`, body: `${userName(s, by)} cancelled ${done.materialName} (${done.id}): ${reason.trim()}\nYour review task on it has ended.`, link: caseLink(done.id), caseId: done.id }, at);
  return toast(next, "info", `${caseId} cancelled. It can be reactivated within 12 months.`);
}

/** RMM reactivates a cancelled case within 12 months, with a justification; it returns to the phase it had. Withdrawn points stay closed. */
export function reactivateCase(s: AppState, by: string, caseId: string, reason: string, at = nowIso(), dueDate?: string): AppState {
  const c = getCase(s, caseId);
  if (!c) return refuse(s, "This case no longer exists.");
  const denied = check(s, by, "case.reactivate", c);
  if (denied) return refuse(s, denied);
  if (c.phase !== "cancelled") return refuse(s, "Only a cancelled case can be reactivated.", "info");
  if (!canReactivate(c, at)) return refuse(s, "The 12-month window for reactivation has passed. Start a new case instead.");
  if (!reason.trim()) return refuse(s, "A justification is required to reactivate.");
  if (dueDate !== undefined && !notBeforeToday(dueDate, at)) return refuse(s, "The new due date must be today or later.");
  const before = c.cancelled?.fromPhase ?? [...c.phaseHistory].reverse().find((p) => p.phase !== "cancelled")?.phase ?? "supplier-input";
  let next = mapCase(s, caseId, (x) => {
    let y = setPhase({ ...x, cancelled: undefined, dueDate: dueDate ?? x.dueDate, reviews: retrack(x.reviews, x.openPoints) }, before, at);
    y = audit(y, by, at, "Reactivated case", `${sentence(reason)}. Back to “${PHASE_LABEL[before]}”. Earlier data kept; closed open points stay closed.${dueDate ? ` New due date ${fmtDate(dueDate)}.` : ""}`);
    return y;
  });
  const done = getCase(next, caseId)!;
  next = supplierMail(next, done, "reactivated", by, at);
  next = internalMail(next, done.reviews.filter((r) => r.status !== "completed").map((r) => r.assigneeId).filter((x) => x !== by), { by, event: "reactivated", subject: `${done.id}: case reactivated`, body: `${userName(s, by)} reactivated ${done.materialName} (${done.id}): ${reason.trim()}\nYour review task on it is open again.`, link: reviewLink(done.id), caseId: done.id }, at);
  return toast(next, "success", `${caseId} reactivated.`);
}

/** After the release: the supplier reports a change. The released case never changes; RMM is told and may start a new case. */
export function reportChange(s: AppState, by: string, caseId: string, text: string, at = nowIso()): AppState {
  const c = getCase(s, caseId);
  if (!c) return refuse(s, "This request no longer exists.");
  const denied = check(s, by, "ciq.reportChange", c);
  if (denied) return refuse(s, denied);
  if (c.phase === "final-release") return refuse(s, RELEASE_LOCKED_TEXT);
  if (c.phase !== "completed") return refuse(s, "Until the final release you change the answers directly in the questionnaire.");
  if (!text.trim()) return refuse(s, "Describe what has changed.");
  const id = `CR-${String(s.changeReports.length + 1).padStart(4, "0")}`;
  let next: AppState = { ...s, changeReports: [...s.changeReports, { id, caseId, at, by, text: text.trim() }] };
  next = mapCase(next, caseId, (x) => audit(x, by, at, "Reported a change after release", `${id}: ${text.trim()} The released CIQ stays unchanged.`));
  next = internalMail(next, [c.ownerId], { by, event: "change-reported", subject: `${c.id}: the supplier reported a change`, body: `${userName(s, by)} reported a change to the released CIQ of ${c.materialName} (${c.id}):\n“${text.trim()}”\nThe released case stays unchanged. Start a new case from the case overview if the change needs a new questionnaire.`, link: caseLink(c.id, "overview"), caseId: c.id }, at);
  return toast(next, "success", "Thank you. Beiersdorf has been told and will contact you if a new questionnaire is needed.");
}

/**
 * An internal note. "@<name>" of an active internal user mentions that person (InternalNote.mentions); everyone
 * mentioned except the writer gets one note-mention mail with a link to the note. Supplier contacts cannot be mentioned.
 */
export function addInternalNote(s: AppState, by: string, caseId: string, text: string, sectionId?: string, at = nowIso()): AppState {
  const c = getCase(s, caseId);
  if (!c) return refuse(s, "This case no longer exists.");
  const denied = check(s, by, "note.add", c);
  if (denied) return refuse(s, denied);
  if (!text.trim()) return refuse(s, "The note is empty.");
  const u = userOf(s, by);
  const body = text.trim();
  const mentions = parseMentions(s, body);
  const note: InternalNote = { id: `${c.id}-n${c.internalNotes.length + 1}`, at, by, dept: u?.dept, text: body, sectionId, mentions };
  const told = mentionRecipients(s, note);
  const where = sectionId ? `On ${codeOf(sectionId, c, s)}.` : "On the case.";
  const next = mapCase(s, caseId, (x) => audit({ ...x, internalNotes: [...x.internalNotes, note] }, by, at, "Added internal note", told.length ? `${where} Mentioned ${joinPeople(told.map((id) => userName(s, id)))}.` : where));
  return noteMentionMails(next, getCase(next, caseId)!, note, at);
}

// ---------------------------------------------------------------------------------- Admin

/**
 * The earlier "Publish v2" button: publishes the prepared draft RS-2026.2 + v2 with its own change note (the same as
 * publishDraft). Refused once v2 is published, or when the open draft is another version.
 */
export function publishTemplateV2(s: AppState, by: string, at = nowIso()): AppState {
  const denied = check(s, by, "config.manage");
  if (denied) return refuse(s, denied);
  const d = draftPair(s);
  if (s.config.pairs.some((p) => p.template.version === "CIQ-2026 v2" && p.status === "published")) return refuse(s, "Questionnaire v2 is already published.", "info");
  if (!d || d.template.version !== "CIQ-2026 v2") return refuse(s, "There is no prepared questionnaire v2 to publish.", "info");
  return publishDraft(s, by, d.changeNote || "Questionnaire v2 and rule set RS-2026.2.", at);
}

export function setOwnership(s: AppState, by: string, sectionId: string, lead: Dept, co: Dept[], at = nowIso()): AppState {
  const denied = check(s, by, "config.manage");
  if (denied) return refuse(s, denied);
  const before = s.ownership[sectionId];
  let next: AppState = { ...s, ownership: { ...s.ownership, [sectionId]: { lead, co } } };
  // The draft's section follows the setting, unless the draft itself changes that section's owners.
  const d = draftPair(s);
  const sec = d?.template.sections.find((x) => x.id === sectionId);
  const same = (a?: { lead: Dept; co: Dept[] }, b?: { lead: Dept; co: Dept[] }) => !!a && !!b && a.lead === b.lead && [...a.co].sort().join() === [...b.co].sort().join();
  if (d && sec && (!before || same(sec, before))) {
    const config = { pairs: next.config.pairs.map((p) => (p === d ? { ...p, template: { ...p.template, sections: p.template.sections.map((x) => (x.id === sectionId ? { ...x, lead, co: [...co] } : x)) } } : p)) };
    next = { ...next, config };
  }
  next = logEvent(next, { at, by, kind: "config", action: "Changed section ownership", detail: `${codeOf(sectionId, undefined, s)}: lead ${before?.lead ?? "—"} → ${lead}; co-reviewers ${(before?.co ?? []).join(", ") || "none"} → ${co.join(", ") || "none"}.` });
  return toast(next, "success", `Ownership of ${codeOf(sectionId, undefined, s)} updated. Open cases follow it from now on: new review tasks, added sections and change mails.`);
}

export function updateReminder(s: AppState, by: string, id: string, patch: Partial<ReminderSetting>, at = nowIso()): AppState {
  const denied = check(s, by, "config.manage");
  if (denied) return refuse(s, denied);
  const cur = s.reminders.find((r) => r.id === id);
  if (!cur) return refuse(s, "This reminder no longer exists.");
  const changes = (Object.keys(patch) as (keyof ReminderSetting)[]).filter((k) => patch[k] !== cur[k]).map((k) => `${k}: ${String(cur[k])} → ${String(patch[k])}`);
  if (!changes.length) return s;
  const next: AppState = { ...s, reminders: s.reminders.map((r) => (r.id === id ? { ...r, ...patch } : r)) };
  return logEvent(next, { at, by, kind: "config", action: "Changed reminder", detail: `${cur.event}: ${changes.join("; ")}.` });
}

