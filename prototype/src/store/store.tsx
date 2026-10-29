// App store: holds AppState, binds every pure action to the current persona's user and persists to localStorage
// (per-browser demo data; "Reset to empty start" restores buildSeed()). The persona is per browser tab (sessionStorage),
// and a change made in another tab is picked up at once (storage event), so an RMM window and a supplier window side
// by side never overwrite each other's work.
// Every state the store adopts (load, commit, another tab's save) syncs the configuration registry first
// (syncRegistry(state.config)): the version-less look-ups (SECTIONS, SECTION_BY_ID, FIELDS, FIELD_BY_ID, RULE_SETS,
// ruleSet(v), fieldsOf(id, v) without a config) then include the admin-created versions before anything renders.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import * as A from "@/domain/actions";
import { PERSONA_BY_ID } from "@/domain/catalog";
import { configVersions, validateDraft, type DraftValidation } from "@/domain/configActions";
import { checkInvariants } from "@/domain/invariants";
import { markAllMailsRead, markMailRead } from "@/domain/mail";
import { joinPeople, mentionRecipients, parseMentions } from "@/domain/mentions";
import { check, type Capability } from "@/domain/permissions";
import { keepPersonaId, personaOf, resolvePersonaId } from "@/domain/personas";
import { runReminders } from "@/domain/reminders";
import { syncRegistry } from "@/domain/rules";
import { rememberFile } from "@/store/fileUrls";
import { SCHEMA, buildSeed } from "@/domain/seed";
import { DAY, nowIso, userName } from "@/domain/selectors";
import * as M from "@/domain/suppliers";
import type {
  AnswerValue,
  AppState,
  CiqCase,
  ComponentRow,
  ConfigAnswers,
  Dept,
  DocKind,
  Persona,
  PersonaId,
  ReminderSetting,
  ReviewDept,
  Toast,
  User,
} from "@/domain/types";

const KEY = "bdf-ciq-prototype";
const TAB_PERSONA = (key: string) => `${key}:persona`;

function tabPersona(key: string): string | null {
  try {
    return sessionStorage.getItem(TAB_PERSONA(key));
  } catch {
    return null; // no session storage: use the saved persona
  }
}

/** Old saved state of the current SCHEMA, with this tab's persona; otherwise the seed. A supplier tab stays on the
 *  supplier side (keepPersonaId); only an internal persona that no longer resolves falls back to RMM. */
function load(seed: () => AppState, key: string): AppState {
  const tab = tabPersona(key);
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw) as AppState;
      if (parsed.schema === SCHEMA) {
        const personaId = keepPersonaId(parsed, tab ?? parsed.personaId) ?? "rmm";
        const s: AppState = { ...parsed, mails: parsed.mails ?? [], log: parsed.log ?? [], changeReports: parsed.changeReports ?? [], config: parsed.config ?? { pairs: [] }, personaId, toasts: [] };
        syncRegistry(s.config);
        return s;
      }
    }
  } catch {
    /* storage unavailable or unreadable: fall back to the seed */
  }
  const fresh = seed();
  syncRegistry(fresh.config);
  return tab ? { ...fresh, personaId: keepPersonaId(fresh, tab) ?? fresh.personaId } : fresh;
}

function save(s: AppState, key: string) {
  try {
    localStorage.setItem(key, JSON.stringify({ ...s, toasts: [] }));
  } catch {
    /* ignore */
  }
  try {
    sessionStorage.setItem(TAB_PERSONA(key), s.personaId);
  } catch {
    /* ignore */
  }
}

export interface StoreApi {
  state: AppState;
  persona: Persona;
  me: User;
  /** Static ids ("rmm", …), derived supplier ids ("sup:<userId>") and the legacy "supplier" / "supplier2". */
  setPersona(id: PersonaId): void;
  /** Back to the start state (the empty start in the app); keeps the current persona when it still exists. */
  reset(): void;
  notify(tone: Toast["tone"], text: string): void;
  dismissToast(id: string): void;

  /** The new case id, or "" when the domain refused (the toast says why). In the live app a Promise of the id once the
   *  case reached Kissflow ("" when it did not): New case opens it only then. */
  createCase(input: A.NewCaseInput): string | Promise<string>;
  /** RMM: the 1–2 case contacts. */
  updateCaseContacts(caseId: string, contactIds: string[]): boolean;
  /** A metadata answer. Before the completeness confirmation the sections open and close live; after it they only grow. */
  saveConfig(caseId: string, patch: ConfigAnswers): void;
  /** Legacy: the live portal's separate basic-data submit (old flow). The prototype has no such step. */
  submitMetadata(caseId: string): void;
  /** Part 2 only: a reviewing department adds a section with a justification (REQ-ADR-002). */
  extendScope(caseId: string, sectionId: string, justification: string): void;
  setAnswer(caseId: string, fieldId: string, value: AnswerValue): void;
  setComponents(caseId: string, rows: ComponentRow[]): void;
  setJustification(caseId: string, key: string, text: string): void;
  /** The new document's id ("" when refused); a Promise in the live portal, where the upload can fail ("" then).
   *  `file` is the picked file itself; the prototype only records its name. */
  uploadDocument(caseId: string, doc: { name: string; kind: DocKind; sectionId: string; fieldId?: string; sizeKb?: number }, file?: File): string | Promise<string>;
  confirmCompleteness(caseId: string): void;

  /** RMM (any section) or a department raises a query, document request or additional part; input.dept is the raising
   *  track. In the live app a Promise of whether it reached Kissflow (the screen keeps the question until then). */
  raiseOpenPoint(caseId: string, input: A.RaiseInput): void | Promise<boolean>;
  /** In the live portal a Promise of whether the answer really reached Beiersdorf. */
  supplierRespond(caseId: string, opId: string, input: { text: string; cannotProvide?: boolean; documentName?: string; sizeKb?: number; file?: File }): void | Promise<boolean>;
  /** In the live app a Promise of whether the decision reached Kissflow (the screen keeps the reason until then). */
  reviewResponse(caseId: string, opId: string, decision: "accept" | "return" | "not-accepted", text: string): void | Promise<boolean>;
  /** AS-08, raiser only. Editing the question of an answered point starts a new round. */
  editOpenPoint(caseId: string, opId: string, patch: A.OpenPointPatch): boolean;
  /** AS-08, raiser only: withdraw with an internal reason. */
  closeOpenPoint(caseId: string, opId: string, reason: string): boolean;
  /** The Safety / Regulatory decision (outside the RMES, which is a read-only sheet: domain/rmesSheet.ts). */
  rmesDecision(caseId: string, dept: "SAF" | "REG", decision: "approved" | "rejected", reason: string): void;
  /** RMM or a department completes its review track; the last one sends the single final-release request. RMM passes
   *  `continueNote` when a department recorded Rejected ("Continue to final release"). */
  completeReview(caseId: string, dept: ReviewDept, opts?: A.CompleteOptions): void;
  reopenReview(caseId: string, dept: ReviewDept, reason: string): void;
  /** Hands the track to another member of the same department. */
  reassignReview(caseId: string, dept: ReviewDept, toUserId: string, reason: string): boolean;
  finalRelease(caseId: string): void;
  cancelCase(caseId: string, reason: string): void;
  /** Within 12 months, with a justification; `dueDate` optionally sets a new case due date. */
  reactivateCase(caseId: string, reason: string, dueDate?: string): boolean;
  /** After the release: the supplier reports a change (the released case stays unchanged). */
  reportChange(caseId: string, text: string): boolean;
  /** "@<full name>" of an active internal user in the text mentions that person: they get one e-mail with a link to
   *  the note (never the writer, never a supplier contact). In the live app a Promise of whether the note reached
   *  Kissflow (the screen keeps the text until then). */
  addInternalNote(caseId: string, text: string, sectionId?: string): void | Promise<boolean>;

  /** Supplier master (the Business administrator only; RMM reads). Ids of the new records, or null when refused
   *  (validate first: validateSupplier). */
  addSupplier(input: M.SupplierInput): string | null;
  updateSupplier(supplierId: string, patch: M.SupplierPatch): boolean;
  addContact(supplierId: string, input: M.ContactInput): string | null;
  updateContact(userId: string, patch: Partial<M.ContactInput>): boolean;
  /** Deactivating a contact named on open cases needs `replacementId` when a case would lose its last contact. */
  setContactActive(userId: string, active: boolean, replacementId?: string): boolean;

  /** The current persona's inbox. */
  markMailRead(mailId: string, read?: boolean): void;
  markAllMailsRead(): void;
  /** Admin demo action "Run reminders now"; `daysAhead` runs it as of a later day. Returns the number of mails sent. */
  runReminders(daysAhead?: number): number;

  /** Publishes the prepared draft RS-2026.2 + v2 with its own change note (= publishDraft). */
  publishTemplateV2(): void;
  setOwnership(sectionId: string, lead: Dept, co: Dept[]): void;
  updateReminder(id: string, patch: Partial<ReminderSetting>): void;

  // Configuration editor (spec §8.2), Business administrator only (config.manage); every change is in the log.
  // Booleans: true = it went through (false: refused, the toast says why, or nothing changed). Ids: "" never; null
  // when refused. Read the draft with draftPair(state), draftChanges(state), validateDraft(state), configVersions(state).
  /** Copies the newest published pair into the next numbers (RS-2026.(N+1) + v(N+1)). Refused while a draft exists. */
  createDraft(note: string): boolean;
  discardDraft(): boolean;
  /** Adds (no id) or changes a rule of the draft; the rule id, or null when refused. */
  upsertRule(rule: A.RuleInput): string | null;
  deleteRule(ruleId: string): boolean;
  /** Adds (no id: the id comes from the code, "Annex 14" → "A14") or changes a draft section; its id, or null. */
  upsertSection(section: A.SectionInput): string | null;
  /** Hidden for new cases on the draft version; never deleted. Rules pointing at it are flagged. */
  retireSection(sectionId: string): boolean;
  restoreSection(sectionId: string): boolean;
  /** Adds (no id: "FLD-K6.18-001") or changes a question of a draft section; its id, or null. */
  upsertField(sectionId: string, field: A.FieldInput): string | null;
  moveField(sectionId: string, fieldId: string, dir: "up" | "down"): boolean;
  removeField(sectionId: string, fieldId: string): boolean;
  /** The §8.2 checklist of the draft (undefined without a draft). Pure; the same as validateDraft(state). */
  validateDraft(): DraftValidation | undefined;
  /** Needs a change note and a passing check. New cases use the new pair; running cases keep theirs. */
  publishDraft(changeNote: string): boolean;
}

/** Exported so the portal can provide its own StoreApi (live portal data) to the shared supplier screens. */
export const StoreContext = createContext<StoreApi | null>(null);
const Ctx = StoreContext;

/** The supplier-master actions the harness may try (dry run) through `window.__ciq.trySupplierAction`. */
const SUPPLIER_ACTIONS = {
  addSupplier: (s: AppState, by: string, input: M.SupplierInput) => M.addSupplier(s, by, input).state,
  updateSupplier: (s: AppState, by: string, id: string, patch: M.SupplierPatch) => M.updateSupplier(s, by, id, patch),
  addContact: (s: AppState, by: string, supplierId: string, input: M.ContactInput) => M.addContact(s, by, supplierId, input).state,
  updateContact: (s: AppState, by: string, userId: string, patch: Partial<M.ContactInput>) => M.updateContact(s, by, userId, patch),
  setContactActive: (s: AppState, by: string, userId: string, active: boolean, replacementId?: string) => M.setContactActive(s, by, userId, active, replacementId),
};
type SupplierActionName = keyof typeof SUPPLIER_ACTIONS;

/** The configuration actions (spec §8.2) the harness may try (dry run) through `window.__ciq.tryConfigAction`. */
const CONFIG_ACTIONS = {
  createDraft: (s: AppState, by: string, note: string) => A.createDraft(s, by, note),
  discardDraft: (s: AppState, by: string) => A.discardDraft(s, by),
  upsertRule: (s: AppState, by: string, input: A.RuleInput) => A.upsertRule(s, by, input).state,
  deleteRule: (s: AppState, by: string, ruleId: string) => A.deleteRule(s, by, ruleId),
  upsertSection: (s: AppState, by: string, input: A.SectionInput) => A.upsertSection(s, by, input).state,
  retireSection: (s: AppState, by: string, id: string) => A.retireSection(s, by, id),
  upsertField: (s: AppState, by: string, sectionId: string, input: A.FieldInput) => A.upsertField(s, by, sectionId, input).state,
  removeField: (s: AppState, by: string, sectionId: string, fieldId: string) => A.removeField(s, by, sectionId, fieldId),
  publishDraft: (s: AppState, by: string, note: string) => A.publishDraft(s, by, note),
};
type ConfigActionName = keyof typeof CONFIG_ACTIONS;

const fallbackUser = (id: string): User => ({ id, name: "Unknown user", email: "", side: "internal", title: "", initials: "?" });

/**
 * `seed` builds the start state (default: the empty start); `storageKey` separates saved demo data (the portal's demo
 * preview uses the rich fixture under its own key).
 */
export function StoreProvider({ children, seed = buildSeed, storageKey = KEY }: { children: ReactNode; seed?: () => AppState; storageKey?: string }) {
  const [state, setState] = useState<AppState>(() => load(seed, storageKey));
  const ref = useRef(state);
  ref.current = state;
  const lastProblems = useRef("");

  const commit = useCallback(
    (next: AppState) => {
      syncRegistry(next.config);
      ref.current = next;
      setState(next);
      save(next, storageKey);
      // A broken domain rule shows up as a console error (the end-to-end harness fails on console errors).
      const problems = checkInvariants(next).join("\n");
      if (problems && problems !== lastProblems.current) console.error(`[CIQ] consistency problem(s):\n${problems}`);
      lastProblems.current = problems;
    },
    [storageKey],
  );

  // For the end-to-end harness: read the state and the consistency check from the page, ask the permission check, and
  // try a supplier-master action as someone on a copy of the state (the domain's own answer; nothing is saved).
  useEffect(() => {
    (window as unknown as { __ciq?: unknown }).__ciq = {
      state: () => ref.current,
      invariants: () => checkInvariants(ref.current),
      check: (userId: string, cap: Capability) => check(ref.current, userId, cap),
      validateDraft: () => validateDraft(ref.current),
      configVersions: () => configVersions(ref.current),
      trySupplierAction: (name: SupplierActionName, by: string, ...args: unknown[]): string | null => {
        const prev = ref.current;
        const next = (SUPPLIER_ACTIONS[name] as (s: AppState, by: string, ...a: unknown[]) => AppState)(prev, by, ...args);
        return A.wasRefused(prev, next) ? (next.toasts.at(-1)?.text ?? "Refused.") : null;
      },
      tryConfigAction: (name: ConfigActionName, by: string, ...args: unknown[]): string | null => {
        const prev = ref.current;
        const next = (CONFIG_ACTIONS[name] as (s: AppState, by: string, ...a: unknown[]) => AppState)(prev, by, ...args);
        return A.wasRefused(prev, next) ? (next.toasts.at(-1)?.text ?? "Refused.") : null;
      },
    };
  }, []);

  // Another tab saved: take its data (keep this tab's persona and toasts) before the next action here.
  useEffect(() => {
    const h = (e: StorageEvent) => {
      if (e.key !== storageKey || !e.newValue) return;
      try {
        const parsed = JSON.parse(e.newValue) as AppState;
        if (parsed.schema !== SCHEMA) return;
        const cur = ref.current;
        const personaId = keepPersonaId(parsed, cur.personaId) ?? "rmm";
        let next: AppState = { ...parsed, personaId, toasts: cur.toasts };
        // This tab's contact was deactivated in another window: say so (the tab stays on the supplier side).
        const before = personaOf(cur, cur.personaId);
        const after = personaOf(next, personaId);
        const was = before && cur.users.find((u) => u.id === before.userId);
        const now = after && next.users.find((u) => u.id === after.userId);
        if (was && now && was.id === now.id && was.active !== false && now.active === false) next = A.toast(next, "info", `${now.name} is no longer active. This window shows no requests any more.`);
        else if (was && now && was.id !== now.id) next = A.toast(next, "info", `${was.name} is no longer available. Now viewing as ${now.name}.`);
        syncRegistry(next.config);
        ref.current = next;
        setState(next);
      } catch {
        /* ignore a broken write */
      }
    };
    window.addEventListener("storage", h);
    return () => window.removeEventListener("storage", h);
  }, [storageKey]);

  // Idempotent (identity check): the registry always matches the state this provider renders.
  syncRegistry(state.config);
  const persona = personaOf(state, state.personaId) ?? PERSONA_BY_ID.rmm;
  const me = state.users.find((u) => u.id === persona.userId) ?? fallbackUser(persona.userId);

  const api = useMemo<StoreApi>(() => {
    const by = () => (personaOf(ref.current, ref.current.personaId) ?? PERSONA_BY_ID.rmm).userId;
    /** Runs a domain action as the persona; adds `success` only when the domain did not refuse. True = it went through. */
    const run = (fn: (s: AppState, by: string) => AppState, success?: string): boolean => {
      const prev = ref.current;
      const next = fn(prev, by());
      if (next === prev) return false;
      const refused = A.wasRefused(prev, next);
      commit(refused || !success ? next : A.toast(next, "success", success));
      return !refused;
    };
    const withId = <T,>(fn: (s: AppState, by: string) => { state: AppState; id: T }, empty: T): T => {
      const prev = ref.current;
      const r = fn(prev, by());
      commit(r.state);
      return A.wasRefused(prev, r.state) ? empty : r.id;
    };
    /** Like withId, but an unchanged save (same state back with an id) still answers with the id. */
    const savedId = (fn: (s: AppState, by: string) => { state: AppState; id: string }): string | null => {
      const prev = ref.current;
      const r = fn(prev, by());
      if (r.state === prev) return r.id || null;
      commit(r.state);
      return A.wasRefused(prev, r.state) ? null : r.id || null;
    };
    return {
      state,
      persona,
      me,
      setPersona: (id) => {
        const r = resolvePersonaId(ref.current, id);
        if (!r) return commit(A.refuse(ref.current, "This person cannot be selected (no longer active)."));
        commit({ ...ref.current, personaId: r, toasts: [] });
      },
      reset: () => {
        const fresh = seed();
        const personaId = keepPersonaId(fresh, ref.current.personaId) ?? "rmm";
        commit(A.toast({ ...fresh, personaId }, "info", fresh.cases.length ? "Demo data reset." : "Back to the empty start: no cases and no mails."));
      },
      notify: (tone, text) => commit(A.toast(ref.current, tone, text)),
      dismissToast: (id) => commit({ ...ref.current, toasts: ref.current.toasts.filter((t) => t.id !== id) }),

      createCase: (input) => {
        const prev = ref.current;
        const r = A.createCase(prev, by(), input);
        if (A.wasRefused(prev, r.state) || !r.id) {
          commit(r.state);
          return "";
        }
        commit(A.toast(r.state, "success", `${r.id} created and the supplier contacts invited.`));
        return r.id;
      },
      updateCaseContacts: (id, ids) => run((s, b) => A.updateCaseContacts(s, b, id, ids)),
      saveConfig: (id, patch) => void run((s, b) => A.saveConfig(s, b, id, patch)),
      submitMetadata: () => commit(A.toast(ref.current, "info", "The metadata questions are part of the CIQ now: answer them in the questionnaire, then confirm completeness.")),
      extendScope: (id, sec, j) => void run((s, b) => A.extendScope(s, b, id, sec, j)),
      setAnswer: (id, f, v) => void run((s, b) => A.setAnswer(s, b, id, f, v)),
      setComponents: (id, rows) => void run((s, b) => A.setComponents(s, b, id, rows)),
      setJustification: (id, k, t) => void run((s, b) => A.setJustification(s, b, id, k, t)),
      uploadDocument: (id, doc, file) => {
        const prev = ref.current;
        const r = A.uploadDocument(prev, by(), id, doc);
        const refused = A.wasRefused(prev, r.state);
        if (!refused) rememberFile(r.docId, file); // openable in this session (DocName)
        commit(r.state);
        return refused ? "" : r.docId;
      },
      confirmCompleteness: (id) => void run((s, b) => A.confirmCompleteness(s, b, id)),

      raiseOpenPoint: (id, input) => void run((s, b) => A.raiseOpenPoint(s, b, id, input), "Sent to the supplier as a task."),
      supplierRespond: (id, op, input) => void run((s, b) => A.supplierRespond(s, b, id, op, input), "Answer sent to Beiersdorf."),
      reviewResponse: (id, op, d, t) => void run((s, b) => A.reviewResponse(s, b, id, op, d, t), d === "accept" ? "Answer accepted." : d === "return" ? "Returned to the supplier." : "Closed as not accepted."),
      editOpenPoint: (id, op, patch) => run((s, b) => A.editOpenPoint(s, b, id, op, patch)),
      closeOpenPoint: (id, op, reason) => run((s, b) => A.closeOpenPoint(s, b, id, op, reason)),
      rmesDecision: (id, d, dec, r) => void run((s, b) => A.rmesDecision(s, b, id, d, dec, r), "Decision recorded."),
      completeReview: (id, d, opts) => void run((s, b) => A.completeReview(s, b, id, d, nowIso(), opts)),
      reopenReview: (id, d, r) => void run((s, b) => A.reopenReview(s, b, id, d, r)),
      reassignReview: (id, d, to, r) => run((s, b) => A.reassignReview(s, b, id, d, to, r)),
      finalRelease: (id) => void run((s, b) => A.finalRelease(s, b, id)),
      cancelCase: (id, r) => void run((s, b) => A.cancelCase(s, b, id, r)),
      reactivateCase: (id, reason, due) => run((s, b) => A.reactivateCase(s, b, id, reason, nowIso(), due)),
      reportChange: (id, text) => run((s, b) => A.reportChange(s, b, id, text)),
      addInternalNote: (id, t, sec) => {
        // "@<name>" mentions a colleague: the domain mails each one; the toast says who was told.
        const told = mentionRecipients(ref.current, { by: by(), mentions: parseMentions(ref.current, t) }).map((u) => userName(ref.current, u));
        void run((s, b) => A.addInternalNote(s, b, id, t, sec), told.length ? `Note added. ${joinPeople(told)} ${told.length === 1 ? "gets" : "get"} an e-mail.` : "Note added.");
      },

      addSupplier: (input) => withId((s, b) => M.addSupplier(s, b, input), null),
      updateSupplier: (id, patch) => run((s, b) => M.updateSupplier(s, b, id, patch)),
      addContact: (sid, input) => withId((s, b) => M.addContact(s, b, sid, input), null),
      updateContact: (uid, patch) => run((s, b) => M.updateContact(s, b, uid, patch)),
      setContactActive: (uid, active, rep) => run((s, b) => M.setContactActive(s, b, uid, active, rep)),

      markMailRead: (mailId, read = true) => commit(markMailRead(ref.current, by(), mailId, read)),
      markAllMailsRead: () => commit(markAllMailsRead(ref.current, by())),
      runReminders: (daysAhead = 0) => {
        const before = ref.current.mails.length;
        const at = new Date(Date.parse(nowIso()) + daysAhead * DAY).toISOString();
        run((s, b) => runReminders(s, at, b));
        return ref.current.mails.length - before;
      },

      publishTemplateV2: () => void run((s, b) => A.publishTemplateV2(s, b)),
      setOwnership: (sec, lead, co) => void run((s, b) => A.setOwnership(s, b, sec, lead, co)),
      updateReminder: (id, patch) => void run((s, b) => A.updateReminder(s, b, id, patch)),

      createDraft: (note) => run((s, b) => A.createDraft(s, b, note)),
      discardDraft: () => run((s, b) => A.discardDraft(s, b)),
      upsertRule: (rule) => savedId((s, b) => A.upsertRule(s, b, rule)),
      deleteRule: (ruleId) => run((s, b) => A.deleteRule(s, b, ruleId)),
      upsertSection: (section) => savedId((s, b) => A.upsertSection(s, b, section)),
      retireSection: (sectionId) => run((s, b) => A.retireSection(s, b, sectionId)),
      restoreSection: (sectionId) => run((s, b) => A.restoreSection(s, b, sectionId)),
      upsertField: (sectionId, field) => savedId((s, b) => A.upsertField(s, b, sectionId, field)),
      moveField: (sectionId, fieldId, dir) => run((s, b) => A.moveField(s, b, sectionId, fieldId, dir)),
      removeField: (sectionId, fieldId) => run((s, b) => A.removeField(s, b, sectionId, fieldId)),
      validateDraft: () => validateDraft(ref.current),
      publishDraft: (note) => run((s, b) => A.publishDraft(s, b, note)),
    };
  }, [state, persona, me, commit, seed]);

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useStore(): StoreApi {
  const v = useContext(Ctx);
  if (!v) throw new Error("useStore outside StoreProvider");
  return v;
}

export function useCase(id: string | undefined): CiqCase | undefined {
  const { state } = useStore();
  return state.cases.find((c) => c.id === id);
}
