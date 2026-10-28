// Supplier-portal helpers. Everything here is a supplier-safe VIEW over the domain: it never exposes
// department names, review statuses, RMES content, findings or internal notes.

import { useMemo } from "react";
import type { Tone } from "@/components/ui";
import { CONFIG_BY_ID, codeTitle, sectionOf, shownCode } from "@/domain/catalog";
import { REQUIRED_CONFIG, completenessBlockers, hasValue, isClosed, isConfigAnswered, releaseBlockers, sectionProgress, supplierTasks, unansweredConfig, type Blocker, type SupplierTask } from "@/domain/selectors";
import type { Applicability, CiqCase, Confirmation, ConfigQuestionId, DocKind, DocumentRef, FieldDef, Message, OpenPoint, OpenPointEdit, OpenPointKind, Phase, SectionDef } from "@/domain/types";
import { useStore } from "@/store/store";

/** The required metadata questions: one list in the domain (the completeness gate uses it too), re-exported here. */
export { REQUIRED_CONFIG, isConfigAnswered, unansweredConfig };

export const firstName = (name: string) => name.replace(/^Dr\. /, "").split(" ")[0];

/**
 * The requests this contact may see: its own company's, and of those only the ones it is named on (spec §4). Cases
 * from the live portal (old flow, no liveScope) are already scoped by Kissflow, so every one of them stays visible.
 * A deactivated contact sees nothing.
 */
export function visibleToContact(cases: CiqCase[], me: { id: string; supplierId?: string; active?: boolean }): CiqCase[] {
  if (me.active === false) return [];
  // The live portal's me.supplierId comes from the cases themselves and may be blank: compare as before ("" included).
  const sid = me.supplierId ?? "";
  return cases.filter((c) => c.supplierId === sid && (!isLiveScope(c) || c.supplierContactIds.includes(me.id)));
}

/** Own cases only: a supplier contact never sees another supplier's request, nor a colleague's it is not named on. */
export function useSupplierScope() {
  const { state, me } = useStore();
  const supplierId = me.supplierId ?? "";
  const cases = useMemo(() => visibleToContact(state.cases, me), [state.cases, me]);
  const supplier = state.suppliers.find((s) => s.id === supplierId);
  return { supplierId, supplier, cases };
}

/** The contact's open tasks over the requests it may see, earliest due first (REQ-PROC-030). */
export function useSupplierTasks(): SupplierTask[] {
  const { state, me } = useStore();
  if (me.active === false) return [];
  return supplierTasks(state, me.supplierId ?? "", me.id);
}

export interface SupplierSection {
  sectionId: string;
  applicability: Applicability;
  /** K5.1 switched off by SF-12 = No: the supplier still owes the waiver justification. */
  waived?: boolean;
  /** Activated after the completeness confirmation (a changed metadata answer or a Beiersdorf extension). */
  addedLater?: boolean;
}

/**
 * The scope follows the supplier's metadata answers live (D-1): the questionnaire carries SF-01…SF-12 and the
 * completeness gate needs them. Set on every prototype case; cases from the live portal keep the old flow (a separate
 * basic-data step, then the sections arrive with Beiersdorf's release), so every screen keeps its old output there.
 */
export const isLiveScope = (c: Pick<CiqCase, "liveScope">) => c.liveScope === true;

/** Navigator pseudo-section for the metadata questions (live-scope cases). Never in c.scope, never a SectionPanel. */
export const METADATA_SECTION = "SF";

const METADATA_META: Pick<SectionDef, "code" | "title" | "kind" | "meaning" | "hasFields"> = {
  code: "SF",
  title: "Metadata questions",
  kind: "basic",
  meaning: "Your answers decide which chapters and annexes this questionnaire contains.",
  hasFields: true,
};

/**
 * Catalog data of a navigator entry, as defined in the case's questionnaire version (`templateVersion`, spec §8.1): a
 * section added or renamed in a later version shows that version's code and title only on cases that run on it.
 * Without a version, the newest definition. Tolerates the metadata pseudo-section and unknown ids (never throws).
 */
export function sectionMeta(id: string, templateVersion?: string): Pick<SectionDef, "code" | "title" | "kind" | "meaning" | "hasFields"> {
  if (id === METADATA_SECTION) return METADATA_META;
  return sectionOf(id, templateVersion) ?? { code: id, title: id, kind: "chapter", meaning: "", hasFields: false };
}
export const sectionCode = (id: string, templateVersion?: string) => sectionMeta(id, templateVersion).code;
/** "K2.1 · Components", or the title alone when it starts with the code ("General information"). */
export const sectionLabelOf = (id: string, templateVersion?: string) => {
  const m = sectionMeta(id, templateVersion);
  return codeTitle(m.code, m.title);
};
/** The code to print next to the title (empty for "General information"). */
export const sectionCodeShown = (id: string, templateVersion?: string) => {
  const m = sectionMeta(id, templateVersion);
  return shownCode(m.code, m.title);
};
export const sectionTitle = (id: string, templateVersion?: string) => sectionMeta(id, templateVersion).title;
export const sectionKind = (id: string, templateVersion?: string) => sectionMeta(id, templateVersion).kind;

/** Sections presented to the supplier, in questionnaire order. N.A. parts are never shown (REQ-PROC-009). */
export function supplierSections(c: Pick<CiqCase, "scope" | "config">): SupplierSection[] {
  const out: SupplierSection[] = [];
  for (const s of c.scope) {
    if (s.applicability !== "na") out.push({ sectionId: s.sectionId, applicability: s.applicability, addedLater: s.addedLater });
    else if (s.sectionId === "K5.1" && c.config.SF12 === false) out.push({ sectionId: s.sectionId, applicability: "na", waived: true });
  }
  return out;
}

/** Navigator entries: the sections plus, on live-scope cases, the metadata questions right after GEN. */
export function navEntries(c: CiqCase): SupplierSection[] {
  const sections = supplierSections(c);
  if (!isLiveScope(c)) return sections;
  const meta: SupplierSection = { sectionId: METADATA_SECTION, applicability: "mandatory" };
  const gen = sections.findIndex((s) => s.sectionId === "GEN");
  return [...sections.slice(0, gen + 1), meta, ...sections.slice(gen + 1)];
}

export const WAIVER_FIELD = "FLD-5.1-002";

export const metadataProgress = (c: Pick<CiqCase, "config">) => ({ done: REQUIRED_CONFIG.length - unansweredConfig(c).length, total: REQUIRED_CONFIG.length });

export function navProgress(c: CiqCase, sec: SupplierSection): { done: number; total: number } {
  if (sec.sectionId === METADATA_SECTION) return metadataProgress(c);
  if (sec.waived) return { done: c.justifications[WAIVER_FIELD] || hasValue(c.answers[WAIVER_FIELD]) ? 1 : 0, total: 1 };
  return sectionProgress(c, sec.sectionId);
}

/** Required answers over every navigator entry (live-scope cases count the required metadata questions too). */
export function overallProgress(c: CiqCase): { done: number; total: number; pct: number } {
  let done = 0;
  let total = 0;
  for (const s of navEntries(c)) {
    const p = navProgress(c, s);
    done += Math.min(p.done, p.total);
    total += p.total;
  }
  return { done, total, pct: total ? Math.round((done / total) * 100) : 0 };
}

/** The first navigator entry with something required still missing. */
export const firstOpenEntry = (c: CiqCase) =>
  navEntries(c).find((s) => {
    const p = navProgress(c, s);
    return p.done < p.total;
  });

const isConfigId = (id: string | undefined): id is ConfigQuestionId => !!id && id in CONFIG_BY_ID;

/**
 * The completeness blockers as the supplier navigates them: unanswered metadata questions point at the metadata entry,
 * and everything follows the navigator order (GEN, metadata questions, chapters, annexes).
 */
export function supplierBlockers(c: CiqCase): Blocker[] {
  const order = new Map(navEntries(c).map((e, i) => [e.sectionId, i]));
  const at = (b: Blocker) => order.get(b.sectionId) ?? order.size;
  return completenessBlockers(c)
    .map((b) => (isConfigId(b.fieldId) ? { ...b, sectionId: METADATA_SECTION } : b))
    // A requested document in the supplier's words (no rule ids).
    .map((b) => (b.supplierLabel ? { ...b, label: b.supplierLabel } : b))
    .map((b, i) => ({ b, i }))
    .sort((x, y) => at(x.b) - at(y.b) || x.i - y.i)
    .map((x) => x.b);
}

/** After the completeness confirmation, before the final release: a changed metadata answer only adds sections. */
export const isPart2 = (c: Pick<CiqCase, "phase">) => c.phase === "review" || c.phase === "final-release";

const RANK = (s?: SupplierSection) => (!s || s.waived ? 0 : s.applicability === "optional" ? 1 : 2);

/** What a changed metadata answer did to the supplier's sections. Ids, in questionnaire order. */
export interface SectionDelta {
  opened: string[];
  closed: string[];
  nowMandatory: string[];
  nowOptional: string[];
  /** K5.1 switched to the waiver justification (SF-12 = No) / back to the full test section. */
  waived: string[];
  unwaived: string[];
  /** Would have closed or become optional by the rules, but stays because the scope only grows after completeness. */
  kept: string[];
}

export function sectionDelta(before: SupplierSection[], after: SupplierSection[], predicted?: SupplierSection[]): SectionDelta {
  const b = new Map(before.map((s) => [s.sectionId, s]));
  const a = new Map(after.map((s) => [s.sectionId, s]));
  const p = predicted && new Map(predicted.map((s) => [s.sectionId, s]));
  const d: SectionDelta = { opened: [], closed: [], nowMandatory: [], nowOptional: [], waived: [], unwaived: [], kept: [] };
  for (const s of after) {
    const was = b.get(s.sectionId);
    if (!was) d.opened.push(s.sectionId);
    else if (s.waived && !was.waived) d.waived.push(s.sectionId);
    else if (!s.waived && was.waived) d.unwaived.push(s.sectionId);
    else if (RANK(s) > RANK(was)) d.nowMandatory.push(s.sectionId);
    else if (RANK(s) < RANK(was)) d.nowOptional.push(s.sectionId);
    else if (p && RANK(p.get(s.sectionId)) < RANK(s)) d.kept.push(s.sectionId);
  }
  for (const s of before) if (!a.has(s.sectionId)) d.closed.push(s.sectionId);
  return d;
}

export const isEmptyDelta = (d: SectionDelta) => Object.values(d).every((x) => x.length === 0);

export const openQuestions = (c: CiqCase) => c.openPoints.filter((p) => p.status === "open");
export const answeredQuestions = (c: CiqCase) => c.openPoints.filter((p) => p.status === "in-progress");
export const closedQuestions = (c: CiqCase) => c.openPoints.filter((p) => p.status === "closed");

/** Hide internal-only messages ("note" = not-accepted closure note). */
export const visibleThread = (op: OpenPoint): Message[] => op.thread.filter((m) => m.action !== "note");

export const lastVisible = (op: OpenPoint) => visibleThread(op).at(-1);
export const wasReturned = (op: OpenPoint) => op.status === "open" && lastVisible(op)?.action === "returned";

/** AS-08: the raiser closed the question without needing an answer (also every open question of a withdrawn request). */
export const isWithdrawn = (op: OpenPoint) => op.status === "closed" && op.outcome === "withdrawn";

/** AS-08: when the raiser last changed the question, its reason, due date or the person handling it. */
export const changedAt = (op: OpenPoint): string | undefined => op.edits?.at(-1)?.at ?? op.thread.filter((m) => m.action === "edited").at(-1)?.at;

/** The raiser's changes recorded with one "edited" thread entry (same author and time). */
export const editsOf = (op: OpenPoint, m: Message): OpenPointEdit[] => (op.edits ?? []).filter((e) => e.at === m.at && e.by === m.by);

/** The supplier's own two confirmations (REQ-PROC-015): completeness and the final release. No department completions. */
export const ownConfirmations = (c: Pick<CiqCase, "confirmations">): Confirmation[] => c.confirmations.filter((x) => x.type === "completeness" || x.type === "final-release");

/** Every document stored at a questionnaire item (a field, else the section itself: documents at no field), newest
 *  first. Never versioned. */
export function documentsAt(c: Pick<CiqCase, "documents" | "answers">, sectionId: string, fieldId?: string): DocumentRef[] {
  const linked = fieldId ? c.answers[fieldId] : undefined;
  return c.documents
    .filter((d) => (fieldId ? d.fieldId === fieldId || d.id === linked : d.sectionId === sectionId && !d.fieldId))
    .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt) || b.id.localeCompare(a.id));
}

/** Why the final release cannot be given yet, worded for the supplier, with jump targets (spec §1.9). */
export interface SupplierReleaseBlocker {
  label: string;
  /** A question: opens the answer drawer. */
  opId?: string;
  /** A missing item: jumps into the questionnaire. */
  sectionId?: string;
  fieldId?: string;
}

export function supplierReleaseBlockers(c: CiqCase): SupplierReleaseBlocker[] {
  return releaseBlockers(c).map((b) => {
    const op = b.opId ? c.openPoints.find((p) => p.id === b.opId) : undefined;
    if (op) return { opId: op.id, label: op.status === "open" ? `Answer Beiersdorf's question on ${op.ref.label}` : `Beiersdorf is still checking your answer on ${op.ref.label}` };
    if (isConfigId(b.fieldId)) return { label: b.label, sectionId: METADATA_SECTION, fieldId: b.fieldId };
    return { label: b.supplierLabel ?? b.label, sectionId: b.sectionId, fieldId: b.fieldId };
  });
}

const KIND_FOR_SUPPLIER: Record<OpenPointKind, string> = {
  query: "Question from Beiersdorf",
  "document-request": "Document request",
  "additional-part": "Additional section to complete",
  finding: "Question from Beiersdorf", // a finding only reaches the supplier as a question (REQ-RMES-015)
};
export const supplierKindLabel = (k: OpenPointKind) => KIND_FOR_SUPPLIER[k];

/** The justification of a finding-based question references the internal finding id: never show it. */
export const supplierJustification = (op: OpenPoint) => (op.kind === "finding" || /finding/i.test(op.justification) ? "" : op.justification);

/** Query parameters that deep-link into the questionnaire. */
export function caseLink(caseId: string, p: { s?: string; f?: string; row?: string; q?: string } = {}) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(p)) if (v) qs.set(k, v);
  const str = qs.toString();
  return `/portal/case/${caseId}${str ? `?${str}` : ""}`;
}

export function refLink(op: OpenPoint) {
  return caseLink(op.caseId, { s: op.ref.sectionId, f: op.ref.fieldId, row: op.ref.rowId });
}

/** Document kind from the field the file is uploaded to. */
export function inferDocKind(f: FieldDef): DocKind {
  const l = f.label.toLowerCase();
  if (/safety data sheet|\bsds\b/.test(l)) return "SDS";
  if (/certificate of analysis|\bcoa\b/.test(l)) return "CoA";
  if (/specification/.test(l)) return "Specification";
  if (/certif/.test(l)) return "Certificate";
  if (/analys|report|evidence|test/.test(l)) return "Analysis";
  if (/statement|conformity/.test(l)) return "Statement";
  return "Other";
}

// ------------------------------------------------------------------ supplier-worded status

/** Live-scope cases: one supplier step (D-1). Live portal (old flow): the basic questions come first. */
export function supplierSteps(c: Pick<CiqCase, "liveScope">): { key: string; label: string }[] {
  const steps = [
    { key: "questionnaire", label: "Questionnaire" },
    { key: "review", label: "Beiersdorf review" },
    { key: "release", label: "Final release" },
  ];
  return isLiveScope(c) ? steps : [{ key: "basic", label: "Basic questions" }, ...steps];
}

const STEP_OF: Record<Phase, string> = {
  metadata: "basic", // live portal only (old flow)
  "scope-check": "basic", // live portal only (old flow)
  "supplier-input": "questionnaire",
  review: "review",
  "final-release": "release",
  completed: "release",
  cancelled: "questionnaire",
};

/** The last working phase (for closed cases the stepper shows how far the request got). */
export function stepKey(c: CiqCase): string {
  const live = isLiveScope(c);
  let key = STEP_OF[c.phase];
  if (c.phase === "cancelled") {
    const before = c.cancelled?.fromPhase ?? [...c.phaseHistory].reverse().find((p) => p.phase !== "cancelled")?.phase ?? (live ? "supplier-input" : "metadata");
    key = STEP_OF[before];
  }
  return live && key === "basic" ? "questionnaire" : key;
}

/** "Step 2 of 3", counted on the case's own stepper. */
export function stepText(c: CiqCase): string {
  const steps = supplierSteps(c);
  const at = Math.max(0, steps.findIndex((s) => s.key === stepKey(c)));
  return `Step ${at + 1} of ${steps.length}`;
}

export interface SupplierStatus {
  label: string;
  tone: Tone;
  /** True when the next move is the supplier's. */
  action: boolean;
  cta: string;
  to: string;
  /** 0–100 for the progress bar. */
  progress: number;
  progressLabel: string;
  /** Due date relevant for the supplier (earliest open question, else the case due date); none when closed. */
  due?: string;
}

export function supplierStatus(c: CiqCase): SupplierStatus {
  const open = openQuestions(c).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const q = open.length;
  const qDue = open[0]?.dueDate;
  const base = { to: caseLink(c.id) };
  const step = stepText(c);
  switch (c.phase) {
    // live portal only (old flow): the basic questions are their own step, then Beiersdorf releases the sections
    case "metadata": {
      const answered = REQUIRED_CONFIG.length - unansweredConfig(c).length;
      return { ...base, label: "Answer the basic questions", tone: "brand", action: true, cta: answered ? "Continue basic questions" : "Answer the basic questions", progress: Math.round((answered / REQUIRED_CONFIG.length) * 100), progressLabel: `${step} · ${answered} of ${REQUIRED_CONFIG.length} questions answered`, due: c.dueDate };
    }
    case "scope-check":
      return { ...base, label: "Beiersdorf is preparing your questionnaire", tone: "info", action: false, cta: "View", progress: 25, progressLabel: `${step} · basic questions submitted`, due: c.dueDate };
    case "supplier-input": {
      const p = overallProgress(c);
      const missing = supplierBlockers(c).length;
      const next = firstOpenEntry(c);
      const live = isLiveScope(c);
      const meta = metadataProgress(c);
      const metaOpen = live && meta.done < meta.total;
      return {
        label: `Fill in the questionnaire — ${p.pct} %`,
        tone: "brand",
        action: true,
        cta: live && meta.done === 0 ? "Start the questionnaire" : "Continue questionnaire",
        to: caseLink(c.id, { s: next?.sectionId }),
        progress: p.pct,
        progressLabel: `${step} · ${metaOpen ? `metadata questions: ${meta.done} of ${meta.total} answered` : missing ? `${missing} item${missing === 1 ? "" : "s"} still open` : "ready to confirm"}`,
        due: c.dueDate,
      };
    }
    case "review":
      if (q)
        return { label: `Beiersdorf is reviewing · ${q} question${q === 1 ? "" : "s"} for you`, tone: "brand", action: true, cta: q === 1 ? "Answer the question" : "Answer the questions", to: q === 1 ? caseLink(c.id, { q: open[0].id }) : caseLink(c.id), progress: isLiveScope(c) ? 75 : 100, progressLabel: `${step} · completeness confirmed · you can still correct data until Beiersdorf requests your final release`, due: qDue };
      return { ...base, label: "Beiersdorf is reviewing", tone: "info", action: false, cta: "View submission", progress: 75, progressLabel: `${step} · completeness confirmed · you can still correct data until Beiersdorf requests your final release`, due: c.dueDate };
    case "final-release":
      return { ...base, label: q ? `Final release needed · ${q} question${q === 1 ? "" : "s"} for you` : "Final release needed", tone: "brand", action: true, cta: "Give the final release", progress: isLiveScope(c) ? 90 : 100, progressLabel: `${step} · all Beiersdorf reviews complete · questionnaire locked`, due: qDue && qDue < c.dueDate ? qDue : c.dueDate };
    case "completed":
      return { ...base, label: "Completed", tone: "ok", action: false, cta: "View", progress: 100, progressLabel: "Released and filed by Beiersdorf" };
    case "cancelled":
      return { ...base, label: "Withdrawn by Beiersdorf", tone: "neutral", action: false, cta: "View", progress: 0, progressLabel: "No further action needed" };
  }
}

export const releasedAt = (c: CiqCase) => c.confirmations.find((x) => x.type === "final-release")?.at ?? c.phaseHistory.find((p) => p.phase === "completed")?.at;
export const submittedAt = (c: CiqCase) => [...c.confirmations].reverse().find((x) => x.type === "completeness")?.at;
export const closedAt = (c: CiqCase) => [...c.phaseHistory].reverse().find((p) => p.phase === c.phase)?.at;

export { isClosed };

/** Due-date wording used across the portal. */
export function dueParts(due: string, now: string): { overdue: boolean; days: number } {
  const days = Math.round((Date.parse(due) - Date.parse(now)) / 86_400_000);
  return { overdue: days < 0, days };
}

/** What Beiersdorf currently asks about (open points with status "open"). On a live-portal case (old flow) these stay
 *  editable after submission while everything else is locked; the questionnaire marks them "Requested by Beiersdorf". */
export interface RequestedRefs {
  fields: Set<string>;
  sections: Set<string>;
  /** Sections asked about as a whole (no specific field), e.g. "K6.9 › Nanomaterials". */
  wholeSections: Set<string>;
  rows: Set<string>;
}

export function requestedRefs(c: CiqCase): RequestedRefs {
  const ops = openQuestions(c);
  return {
    fields: new Set(ops.flatMap((p) => (p.ref.fieldId ? [p.ref.fieldId] : []))),
    sections: new Set(ops.map((p) => p.ref.sectionId)),
    wholeSections: new Set(ops.filter((p) => !p.ref.fieldId && !p.ref.rowId).map((p) => p.ref.sectionId)),
    rows: new Set(ops.flatMap((p) => (p.ref.rowId ? [p.ref.rowId] : []))),
  };
}
