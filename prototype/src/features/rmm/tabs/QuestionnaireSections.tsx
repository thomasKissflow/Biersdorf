// The building blocks of the case Questionnaire tab (read-only): the scope and evidence card, the metadata answers, a
// section with its answers list (question | answer | answered by and when), its documents, requested documents and
// open points, the documents-only sections, the focus card Customs (K7) and Legal (K8) open, and the not-applicable
// sections with their rule reasons (internal only).
import { Building2, ChevronRight, CircleCheck, CircleDashed, CircleDot, CircleSlash, FileText, Lock, Paperclip, TriangleAlert } from "lucide-react";
import { useState, type ReactNode } from "react";
import { DocName } from "@/components/DocName";
import { MENTION_HINT, MentionTextArea, MentionsYou, NoteNotified, NoteText } from "@/components/mentions";
import { RequestedDocsList, SectionUploadRow } from "@/components/RequestedDocs";
import { Badge, Button, Card, Mono, Table, Td, TrafficLight, Tr, cx, type Tone } from "@/components/ui";
import { CONFIG_QUESTIONS, DEPT_SHORT, MARKET_LABEL, ORIGIN_LABEL, fieldOf, fieldsOf, sectionOf } from "@/domain/catalog";
import { additiveText, concText } from "@/domain/composition";
import { mentionableUsers } from "@/domain/mentions";
import { check } from "@/domain/permissions";
import { evidenceFieldIds, isSlotKey, requestedDocStatus, requestedDocuments, sectionUploadRequired, slotKey } from "@/domain/requestedDocs";
import { requiredEvidence } from "@/domain/rules";
import { REQUIRED_CONFIG, answerOf, answeredByOf, fmtDate, formatValue, hasValue, isClosed, isVisible, requiredFields, unansweredConfig, userName } from "@/domain/selectors";
import type { AppState, CiqCase, ConfigQuestionId, FieldDef, Market, OpenPoint, OriginType, ScopeItem } from "@/domain/types";
import { useStore } from "@/store/store";
import { sectionCode, sectionTitleIn, undefinedOriginLabels } from "../shared";
import { Attribution, SourceNote } from "./Attribution";
import { METADATA_ID, type OutlineItem, type OutlineStatus } from "./questionnaireOutline";

// ------------------------------------------------------------------------------------------------ small pieces

/** The short code the navigator shows: "K2.1", "A4", "GEN", "SF". */
export function shortCode(c: CiqCase, id: string): string {
  if (id === METADATA_ID) return "SF";
  if (id === "GEN") return "GEN";
  const sec = sectionOf(id, c.templateVersion);
  return (sec?.code ?? id).replace("Annex ", "A");
}

/** The section's title; the metadata block has its own. */
export const titleOf = (c: CiqCase, id: string) => (id === METADATA_ID ? "Metadata answers" : sectionTitleIn(id, c.templateVersion));

const STATUS_ICON: Record<OutlineStatus | "na", { icon: typeof CircleCheck; cls: string; label: string }> = {
  complete: { icon: CircleCheck, cls: "text-ok", label: "Complete" },
  missing: { icon: CircleDashed, cls: "text-warn", label: "Missing items" },
  optional: { icon: CircleDot, cls: "text-ink-3", label: "Nothing required" },
  docs: { icon: FileText, cls: "text-ink-3", label: "Documents only" },
  na: { icon: CircleSlash, cls: "text-ink-3", label: "Not applicable" },
};

export function StatusIcon({ status, size = 15 }: { status: OutlineStatus | "na"; size?: number }) {
  const s = STATUS_ICON[status];
  const Icon = s.icon;
  return <Icon size={size} className={cx("shrink-0", s.cls)} aria-label={s.label} />;
}

/** The status of a section in plain words, as a pill. */
export function StatusPill({ c, item }: { c: CiqCase; item: OutlineItem }) {
  const closed = isClosed(c);
  const map: Record<OutlineStatus, { tone: Tone; text: string }> = {
    complete: { tone: "ok", text: `Complete · ${item.done} of ${item.total}` },
    missing: { tone: "warn", text: `${item.total - item.done} ${closed ? "not answered" : "missing"} · ${item.done} of ${item.total}` },
    optional: { tone: "neutral", text: item.sc?.applicability === "optional" ? "Optional" : "Nothing required" },
    docs: { tone: "neutral", text: "Documents only" },
  };
  const m = map[item.status];
  return (
    <Badge tone={m.tone} dot data-testid={`q-status-${item.id}`}>
      {m.text}
    </Badge>
  );
}

const POINT_STATE = { open: "With the supplier", "in-progress": "Answered, waiting for Beiersdorf", closed: "Closed" } as const;

/** Unresolved open points as chips; a click opens the case's Open points tab. */
export function OpChips({ ops, onOpen, compact }: { ops: OpenPoint[]; onOpen: () => void; compact?: boolean }) {
  if (!ops.length) return null;
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      {ops.map((p) => (
        <button
          key={p.id}
          type="button"
          onClick={onOpen}
          title={`${p.question} (${POINT_STATE[p.status]})`}
          className="inline-flex items-center rounded-full border border-line bg-surface px-2 py-0.5 transition-colors hover:bg-surface-2"
          data-testid={`q-op-${p.id}`}
        >
          <TrafficLight status={p.status} label={compact ? p.id : `${p.id} · ${DEPT_SHORT[p.dept]}`} />
        </button>
      ))}
    </span>
  );
}

/** The code before a section title: "K2.1" in mono, "Annex 4" as a word. */
function CodeLabel({ code }: { code: string }) {
  if (!code) return null;
  return code.startsWith("Annex") ? <span className="text-[12.5px] font-medium text-ink-3">{code}</span> : <Mono className="text-[12.5px] font-medium text-ink-3">{code}</Mono>;
}

/** One "label value" pair of a section's meta line. */
function Meta({ k, children, wide }: { k: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className={cx("flex min-w-0 gap-1.5", wide && "basis-full sm:basis-auto")}>
      <dt className="shrink-0 text-ink-3">{k}</dt>
      <dd className="min-w-0 text-ink-2">{children}</dd>
    </div>
  );
}

/** Header of a section: code and title, what it covers, the status; then applicability, lead and why in scope. */
function SectionHeader({ c, item, extra }: { c: CiqCase; item: OutlineItem; extra?: ReactNode }) {
  const { state } = useStore();
  const id = item.id;
  const sec = sectionOf(id, c.templateVersion);
  const sc = item.sc;
  const code = sectionCode(id, c.templateVersion);
  const own = state.ownership[id] ?? { lead: sec?.lead, co: sec?.co ?? [] };
  return (
    <div className="border-b border-line px-4 py-3.5 sm:px-5">
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <div className="min-w-0 flex-1 basis-[240px]">
          <h3 className="flex flex-wrap items-baseline gap-x-2 text-[15.5px] leading-snug font-semibold text-ink">
            <CodeLabel code={code} />
            <span className="min-w-0">{sec?.title ?? id}</span>
          </h3>
          {sec?.meaning && <p className="mt-0.5 text-[13px] text-ink-3">{sec.meaning}</p>}
        </div>
        <StatusPill c={c} item={item} />
      </div>
      {sc && (
        <dl className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1 text-[12.5px]">
          <Meta k="Applies">
            {sc.applicability === "mandatory" ? "Mandatory" : sc.applicability === "optional" ? "Optional" : "Not applicable"}
            {sc.manual ? " · added by hand" : ""}
          </Meta>
          <Meta k={sec?.hasFields === false ? "Owned by" : "Lead"}>
            {own.lead ? DEPT_SHORT[own.lead] : "—"}
            {own.co.length > 0 && <span className="text-ink-3"> · co-review {own.co.map((d) => DEPT_SHORT[d]).join(", ")}</span>}
          </Meta>
          <Meta k={sc.manual ? "Added" : "Why in scope"} wide>
            {sc.manual ? `by ${userName(state, sc.manual.by)} on ${fmtDate(sc.manual.at)}: ${sc.manual.justification}` : sc.reason}
          </Meta>
        </dl>
      )}
      {(sc?.addedLater || item.changed || extra) && (
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          {sc?.addedLater && <Badge tone="info">Added after completeness</Badge>}
          {item.changed && (
            <Badge tone="warn" dot>
              Changed after completeness
            </Badge>
          )}
          {extra}
        </div>
      )}
    </div>
  );
}

/** Column heads of the answers list (desktop); on phones each answer stacks. */
const ROW_GRID = "md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)_minmax(10.5rem,1.3fr)]";

function AnswersHead({ first = "Question" }: { first?: string }) {
  return (
    <div aria-hidden className={cx("hidden gap-x-4 border-b border-line bg-surface-2 px-5 py-1.5 text-[11px] font-semibold tracking-wide text-ink-3 uppercase md:grid", ROW_GRID)}>
      <span>{first}</span>
      <span>Answer</span>
      <span>Answered by</span>
    </div>
  );
}

/** The stacked "name / time" attribution is two lines high: moved up so its avatar centres on the question's first line. */
const STACKED_OFFSET = "md:-mt-1.5";

/** One answer row: question | answer | answered by and when. */
function AnswerRow({ label, sub, value, by, testId, changed }: { label: ReactNode; sub?: ReactNode; value: ReactNode; by: ReactNode; testId?: string; changed?: boolean }) {
  return (
    <div className={cx("grid grid-cols-1 gap-x-4 gap-y-1.5 px-4 py-3 sm:px-5", ROW_GRID, changed && "bg-warn-soft/35")} data-testid={testId}>
      <dt className="min-w-0 text-[13px] leading-5 text-ink-2">
        {label}
        {sub}
      </dt>
      <dd className="min-w-0 text-[13.5px] leading-5 break-words text-ink">{value}</dd>
      <dd className="flex min-w-0 items-start">{by}</dd>
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ scope and evidence

type EvidenceState = "received" | "justified" | "missing" | "optional";

/** Whether the supplier provided an evidence item of the rules: at its requested-document slot (evidence no question
 *  collects, spec §8.5), else at the question that collects it (EVIDENCE_FIELDS). Not provided is "missing" only where
 *  it blocks: a mandatory slot, or a question the case requires (mandatory, in a section mandatory for the case); an
 *  optional slot or an optional question left empty is "optional". */
function evidenceState(c: CiqCase, doc: string): EvidenceState | undefined {
  const slot = requestedDocuments(c).find((x) => x.key === slotKey(doc));
  if (slot) {
    const st = requestedDocStatus(c, slot);
    return st === "missing" && slot.optional ? "optional" : st;
  }
  const ids = evidenceFieldIds(doc);
  if (!ids?.length) return undefined;
  if (ids.some((id) => hasValue(c.answers[id]))) return "received";
  if (ids.some((id) => !!c.justifications[id])) return "justified";
  const required = ids.some((id) => {
    const f = fieldOf(id, c.templateVersion);
    return !!f && requiredFields(c, f.sectionId).some((x) => x.id === id);
  });
  return required ? "missing" : "optional";
}

const EVIDENCE_DOT: Record<EvidenceState, string> = { received: "bg-ok", justified: "bg-ink-3", missing: "bg-warn", optional: "bg-line-strong" };
const EVIDENCE_TEXT: Record<EvidenceState, { cls: string; text: string }> = {
  received: { cls: "text-ok", text: "· received" },
  justified: { cls: "text-ink-2", text: "· justified" },
  missing: { cls: "text-warn", text: "· missing" },
  optional: { cls: "text-ink-3", text: "· optional, not provided" },
};

const releaseOf = (c: CiqCase) => c.confirmations.find((x) => x.type === "final-release")?.at;

/** Live scope: how the sections came about, and the evidence the rules ask for (merged from the former Scope tab). */
export function ScopeCard({ c }: { c: CiqCase }) {
  const part1 = c.phase === "supplier-input" || c.phase === "metadata" || c.phase === "scope-check";
  const completeness = c.confirmations.filter((x) => x.type === "completeness").at(-1);
  const open = unansweredConfig(c).length;
  const origins = undefinedOriginLabels(c);
  const evidence = requiredEvidence(c.config, c.ruleSetVersion);
  const n = (a: ScopeItem["applicability"]) => c.scope.filter((s) => s.applicability === a).length;
  const later = c.scope.filter((s) => s.addedLater).length;
  const received = c.liveScope ? evidence.filter((e) => evidenceState(c, e.doc) === "received").length : 0;
  return (
    <Card id="q-scope" className="scroll-mt-20 overflow-hidden" data-testid="q-scope">
      <div className="px-4 py-3.5 sm:px-5">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <h3 className="text-[15.5px] font-semibold text-ink">Scope and evidence</h3>
          <Badge tone={part1 ? "violet" : "neutral"}>{c.phase === "completed" ? "Frozen" : part1 ? "Follows the supplier's answers" : "Only grows"}</Badge>
        </div>
        <p className="mt-1 text-[13px] text-ink-3">
          {n("mandatory")} mandatory · {n("optional")} optional · {n("na")} not applicable{later ? ` · ${later} added after completeness` : ""} · rule set <Mono className="text-[12px]">{c.ruleSetVersion}</Mono>
        </p>
        {c.phase === "completed" ? (
          <p className="mt-2 text-[13.5px] text-ink-2">Frozen with the final release{releaseOf(c) ? ` on ${fmtDate(releaseOf(c)!)}` : ""}. The released scope is part of the final document.</p>
        ) : c.phase === "cancelled" ? (
          <p className="mt-2 text-[13.5px] text-ink-2">The case is cancelled; the scope stays as it was{completeness ? ` (fixed at the completeness confirmation on ${fmtDate(completeness.at)})` : ""}.</p>
        ) : part1 ? (
          <p className="mt-2 text-[13.5px] text-ink-2">
            The rules derive the sections from the target markets and the supplier's metadata answers as they answer. Until the completeness confirmation, sections open and close with the answers; what the supplier entered in a section that closes is kept.
            {open > 0 && <span className="mt-1 block text-[12.5px] text-ink-3">{open} required metadata question{open === 1 ? "" : "s"} still unanswered, so more sections may open.</span>}
          </p>
        ) : (
          <p className="mt-2 text-[13.5px] text-ink-2">Fixed at the completeness confirmation{completeness ? ` on ${fmtDate(completeness.at)}` : ""}. A changed metadata answer can now only add sections; nothing under review disappears. A department can add a section with a justification.</p>
        )}
      </div>
      {origins.length > 0 && (
        <div className="flex items-start gap-2.5 border-t border-line bg-warn-soft px-4 py-3 text-[13px] text-ink sm:px-5">
          <TriangleAlert size={16} className="mt-px shrink-0 text-warn" aria-hidden />
          <p>
            <span className="font-medium">No rules for this origin yet: {origins.join(", ")}.</span> The supplier got the standard sections; the case is flagged in RMM's review, where RMM or a department can ask for more.
          </p>
        </div>
      )}
      {evidence.length > 0 && (
        <div className="border-t border-line px-4 py-3 sm:px-5" data-testid="q-evidence">
          <p className="flex flex-wrap items-baseline justify-between gap-x-3 text-xs font-medium text-ink-3">
            <span>Evidence the rules ask for{c.liveScope ? ", and whether the supplier provided it" : ""}</span>
            {c.liveScope && (
              <span className="font-normal">
                {received} of {evidence.length} received
              </span>
            )}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {evidence.map((e) => {
              const st = c.liveScope ? evidenceState(c, e.doc) : undefined;
              return (
                <span
                  key={`${e.ruleId}-${e.doc}`}
                  data-testid={`q-evidence-${e.ruleId}-${e.doc.replace(/[^a-z0-9]+/gi, "-")}`}
                  data-state={st ?? ""}
                  className="inline-flex max-w-full flex-wrap items-center gap-x-1.5 rounded-md border border-line bg-surface-2 px-2 py-0.5 text-[12.5px] text-ink-2"
                >
                  {st && <span aria-hidden className={cx("h-1.5 w-1.5 shrink-0 rounded-full", EVIDENCE_DOT[st])} />}
                  <span className="min-w-0">{e.doc}</span> <Mono className="text-[11px] text-ink-3">{e.ruleId}</Mono>
                  {st && <span className={cx("text-[11.5px] font-medium", EVIDENCE_TEXT[st].cls)}>{EVIDENCE_TEXT[st].text}</span>}
                </span>
              );
            })}
          </div>
        </div>
      )}
    </Card>
  );
}

// ------------------------------------------------------------------------------------------------ metadata

function configAnswer(c: CiqCase, id: ConfigQuestionId): string | null {
  const v = c.config[id];
  if (v === undefined) return null;
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (id === "SF01") return (v as OriginType[]).map((o) => ORIGIN_LABEL[o]).join(", ") || null;
  if (id === "SF11") return (v as Market[]).map((m) => MARKET_LABEL[m]).join(", ") || "—";
  if (id === "SF05") return (v as string[]).length ? (v as string[]).map((x) => x[0].toUpperCase() + x.slice(1)).join(", ") : "Neither";
  return String(v);
}

/** The metadata answers SF-01 to SF-12, as an answers list like every section. */
export function MetadataPanel({ c, item, onOpenPoints }: { c: CiqCase; item: OutlineItem; onOpenPoints: () => void }) {
  const { state } = useStore();
  return (
    <Card id={`q-${METADATA_ID}`} className="scroll-mt-20 overflow-hidden" data-testid="q-metadata" data-status={item.status}>
      <div className="border-b border-line px-4 py-3.5 sm:px-5">
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
          <div className="min-w-0 flex-1 basis-[240px]">
            <h3 className="flex flex-wrap items-baseline gap-x-2 text-[15.5px] leading-snug font-semibold text-ink">
              <Mono className="text-[12.5px] font-medium text-ink-3">SF-01 to SF-12</Mono>
              <span>Metadata answers</span>
            </h3>
            <p className="mt-0.5 text-[13px] text-ink-3">The rules open the sections from these answers. SF-05 is optional; SF-11 is set by RMM.</p>
          </div>
          <StatusPill c={c} item={item} />
        </div>
        {(item.changed || item.ops.length > 0) && (
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            {item.changed && (
              <Badge tone="warn" dot>
                Changed after completeness
              </Badge>
            )}
            <OpChips ops={item.ops} onOpen={onOpenPoints} />
          </div>
        )}
      </div>
      <AnswersHead />
      <dl className="divide-y divide-line">
        {CONFIG_QUESTIONS.map((q) => {
          const a = configAnswer(c, q.id);
          const by = c.answeredBy[q.id];
          const req = (REQUIRED_CONFIG as readonly string[]).includes(q.id);
          return (
            <AnswerRow
              key={q.id}
              testId={`q-meta-${q.id}`}
              label={
                <>
                  {q.label}
                  {req && <span className="text-ink-3">{"\u00a0*"}</span>}
                </>
              }
              sub={<Mono className="mt-0.5 block text-[10.5px] text-ink-3">{q.code}</Mono>}
              value={a ? <span className="font-medium">{a}</span> : <span className="text-ink-3 italic">{isClosed(c) ? "Not answered" : "Not answered yet"}</span>}
              by={q.answeredBy === "rmm" ? <SourceNote icon={<Building2 size={11} />}>Set by RMM</SourceNote> : by ? <Attribution state={state} by={by.by} at={by.at} stacked className={STACKED_OFFSET} /> : null}
            />
          );
        })}
      </dl>
    </Card>
  );
}

// ------------------------------------------------------------------------------------------------ a section

function FieldAnswer({ c, f, since, onOpenPoints }: { c: CiqCase; f: FieldDef; since?: string; onOpenPoints: () => void }) {
  const { state } = useStore();
  // A derived field (FLD-A1-105, L6) shows its source's answer and who gave it.
  const v = answerOf(c, f);
  const by = answeredByOf(c, f);
  const just = c.justifications[f.id];
  // M8: the supplier's soft warning (never a blocker)
  const hint = f.hint && v !== undefined ? f.hint(v, c) : null;
  const doc = f.type === "file" && typeof v === "string" ? c.documents.find((d) => d.id === v) : undefined;
  // A file question lists its earlier uploads; any other question the documents stored at it (an answer to a query).
  const later = c.documents.filter((d) => d.fieldId === f.id && d.id !== doc?.id);
  const error = hasValue(v) && f.validate ? f.validate(v!) : null;
  const changedLater = !!since && !!by && Date.parse(by.at) > Date.parse(since);
  const ops = c.openPoints.filter((p) => p.ref.fieldId === f.id && !p.ref.rowId && p.status !== "closed");
  let value: ReactNode;
  if (doc) {
    value = (
      <span className="inline-flex max-w-full items-center gap-1.5">
        <Paperclip size={13} className="shrink-0 text-ink-3" aria-hidden />
        <DocName id={doc.id} name={doc.name} className="min-w-0 font-medium [overflow-wrap:anywhere]" />
      </span>
    );
  } else if (hasValue(v)) {
    value = (
      <span className="whitespace-pre-line">
        {formatValue(v)}
        {f.unit && typeof v === "number" ? ` ${f.unit}` : ""}
      </span>
    );
  } else if (just) {
    value = <span className="text-ink-2 italic">Not provided</span>;
  } else {
    value =
      f.required === "optional" && !f.derivedFrom ? (
        <span className="text-ink-3 italic">Not answered (optional)</span>
      ) : (
        <span className="inline-flex items-center gap-1.5 text-ink-3 italic" data-missing="true">
          <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-warn" />
          {isClosed(c) ? "Not answered" : "Not answered yet"}
        </span>
      );
  }
  return (
    <AnswerRow
      testId={`q-field-${f.id}`}
      changed={changedLater}
      label={
        <>
          {f.label}
          {f.required !== "optional" && <span className="text-ink-3">{"\u00a0*"}</span>}
        </>
      }
      sub={<Mono className="mt-0.5 block text-[10.5px] text-ink-3">{f.id}</Mono>}
      value={
        <>
          {value}
          {just && <span className="mt-1 block rounded-md bg-surface-2 px-2.5 py-1.5 text-[13px] text-ink-2">Justification: {just}</span>}
          {later.length > 0 && (
            <span className="mt-1 block text-[12px] text-ink-3">
              {f.type === "file" ? "Also uploaded" : "Documents at this question"}:{" "}
              {later.map((d, i) => (
                <span key={d.id}>
                  {i > 0 && ", "}
                  <DocName id={d.id} name={d.name} className="[overflow-wrap:anywhere]" /> ({fmtDate(d.uploadedAt)})
                </span>
              ))}
            </span>
          )}
          {error && <span className="mt-1 block text-[12px] font-medium text-bad">{error}</span>}
          {hint && <span className="mt-1 block text-[12px] text-ink-2">Check: {hint}</span>}
          {f.derivedFrom && <span className="mt-1 block text-[12px] text-ink-3">Filled in from {fieldOf(f.derivedFrom, c.templateVersion)?.label ?? f.derivedFrom}.</span>}
          {(changedLater || ops.length > 0) && (
            <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {changedLater && (
                <Badge tone="warn" dot>
                  Changed after completeness
                </Badge>
              )}
              <OpChips ops={ops} onOpen={onOpenPoints} compact />
            </span>
          )}
        </>
      }
      by={by ? <Attribution state={state} by={by.by} at={by.at} stacked className={STACKED_OFFSET} /> : f.sectionId === "GEN" && hasValue(v) ? <SourceNote icon={<Building2 size={11} />}>Pre-filled at case creation</SourceNote> : null}
    />
  );
}

function Composition({ c, since }: { c: CiqCase; since?: string }) {
  const { state } = useStore();
  const by = c.answeredBy["K2.1:components"];
  if (!c.components.length) return <p className="border-b border-line px-4 py-3 text-[13px] text-ink-3 italic sm:px-5">{isClosed(c) ? "No components were entered." : "No components entered yet."}</p>;
  const changedLater = !!since && !!by && Date.parse(by.at) > Date.parse(since);
  return (
    <div className="border-b border-line" data-testid="q-composition">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 px-4 pt-3 pb-1 sm:px-5">
        <span className="flex flex-wrap items-center gap-2 text-[13px] font-medium text-ink-2">
          Composition · {c.components.length} component{c.components.length > 1 ? "s" : ""}
          {changedLater && (
            <Badge tone="warn" dot>
              Changed after completeness
            </Badge>
          )}
        </span>
        {by && <Attribution state={state} by={by.by} at={by.at} />}
      </div>
      <Table dense head={["#", "INCI / IUPAC", "CAS", "EC / REACH no.", "Function", "Origin", "Additive", "Concentration"]}>
        {c.components.map((r, i) => (
          <Tr key={r.id}>
            <Td className="text-ink-3">{i + 1}</Td>
            <Td className="font-medium">{r.inci}</Td>
            <Td className="whitespace-nowrap">
              <Mono>{r.cas ?? "—"}</Mono>
            </Td>
            <Td className="whitespace-nowrap">
              <Mono>{r.ec ?? "—"}</Mono>
            </Td>
            <Td className="text-ink-2">{r.fn}</Td>
            <Td className="text-ink-2">{ORIGIN_LABEL[r.origin].split(" (")[0]}</Td>
            <Td className="text-ink-2">{additiveText(r.additive)}</Td>
            <Td className="whitespace-nowrap">{concText(r)}</Td>
          </Tr>
        ))}
      </Table>
    </div>
  );
}

/** A section with questions: header, answers list, composition (K2.1), requested documents and other documents. */
export function SectionPanel({ c, item, since, focused, onOpenPoints, footer }: { c: CiqCase; item: OutlineItem; since?: string; focused?: boolean; onOpenPoints: () => void; footer?: ReactNode }) {
  const { state } = useStore();
  const id = item.id;
  // The section and its fields as the case's own questionnaire version defines them (spec §8.1).
  const fields = fieldsOf(id, c.templateVersion).filter((f) => isVisible(f, c));
  const fieldIds = new Set(fields.map((f) => f.id));
  // Files of requested documents are listed with their document; files at a question with the question.
  const otherDocs = c.documents.filter((d) => d.sectionId === id && !isSlotKey(d.fieldId) && (!d.fieldId || !fieldIds.has(d.fieldId))).sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
  // Points on the whole section, a component row or a document; those on a question show at its answer, those on a
  // requested document at its row.
  const headerOps = item.ops.filter((p) => !p.ref.fieldId || p.ref.rowId || (!fieldIds.has(p.ref.fieldId) && !isSlotKey(p.ref.fieldId)));
  return (
    // With a notes footer the card does not clip: the note box's @mention list may reach past its bottom edge.
    <Card id={`q-${id}`} className={cx("scroll-mt-20", !footer && "overflow-hidden", focused && "ring-2 ring-brand/30")} data-testid={`q-section-${id}`} data-applicability={item.sc?.applicability} data-status={item.status} data-focus={focused ? "true" : undefined}>
      <SectionHeader c={c} item={item} extra={headerOps.length ? <OpChips ops={headerOps} onOpen={onOpenPoints} /> : undefined} />
      {id === "K2.1" && <Composition c={c} since={since} />}
      {fields.length > 0 && (
        <>
          <AnswersHead />
          <dl className="divide-y divide-line">
            {fields.map((f) => (
              <FieldAnswer key={f.id} c={c} f={f} since={since} onOpenPoints={onOpenPoints} />
            ))}
          </dl>
        </>
      )}
      {/* a documents-only section whose version requires the upload (29 Oct): its status, then its files below */}
      <SectionUploadRow c={c} state={state} sectionId={id} className="border-t-0" inset="px-4 sm:px-5" who={(by, at) => <Attribution state={state} by={by} at={at} />} />
      <RequestedDocsList
        c={c}
        state={state}
        sectionId={id}
        since={since}
        className={fields.length || id === "K2.1" || sectionUploadRequired(c, id) ? undefined : "border-t-0"}
        inset="px-4 sm:px-5"
        who={(by, at) => <Attribution state={state} by={by} at={at} />}
        action={(slot) => <OpChips ops={c.openPoints.filter((p) => p.ref.fieldId === slot.key && p.status !== "closed")} onOpen={onOpenPoints} compact />}
      />
      {otherDocs.length > 0 && <DocList state={state} title={fields.length || id === "K2.1" ? "Other documents in this section" : "Documents in this section"} docs={otherDocs} since={since} />}
      {footer && <div className="border-t border-line">{footer}</div>}
    </Card>
  );
}

function DocList({ state, title, docs, since }: { state: AppState; title: string; docs: CiqCase["documents"]; since?: string }) {
  return (
    <div className="border-t border-line px-4 py-3 sm:px-5" data-testid="q-other-docs">
      <p className="text-xs font-medium text-ink-3">{title}</p>
      <ul className="mt-1.5 space-y-2">
        {docs.map((d) => (
          <li key={d.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[13px]">
            <span className="inline-flex min-w-0 items-center gap-1.5">
              <Paperclip size={13} className="shrink-0 text-ink-3" aria-hidden />
              <DocName id={d.id} name={d.name} className="min-w-0 font-medium text-ink [overflow-wrap:anywhere]" />
              {since && Date.parse(d.uploadedAt) > Date.parse(since) && (
                <Badge tone="warn" dot>
                  Changed {fmtDate(d.uploadedAt)}
                </Badge>
              )}
            </span>
            <Attribution state={state} by={d.uploadedBy} at={d.uploadedAt} />
          </li>
        ))}
      </ul>
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ documents only

/** The documents-only sections of a group, compact: what was uploaded and why the section is in scope. */
export function DocsOnlyList({ c, items, title, onSelect }: { c: CiqCase; items: OutlineItem[]; title: string; onSelect: (id: string) => void }) {
  return (
    <Card className="overflow-hidden" data-testid="q-docs-only">
      <div className="border-b border-line px-4 py-3 sm:px-5">
        <h3 className="text-[14px] font-semibold text-ink">
          {title} <span className="font-normal text-ink-3">· {items.length}</span>
        </h3>
        <p className="mt-0.5 text-[12.5px] text-ink-3">Answered with documents only: the CIQ template document, a statement or a certificate. The upload is optional and does not block completeness.</p>
      </div>
      <ul className="divide-y divide-line">
        {items.map((i) => {
          const docs = c.documents.filter((d) => d.sectionId === i.id);
          return (
            <li key={i.id} id={`q-${i.id}`} data-testid={`q-section-${i.id}`} data-status="docs" className="scroll-mt-20">
              <button type="button" onClick={() => onSelect(i.id)} className="group flex w-full items-start gap-3 px-4 py-2.5 text-left transition-colors hover:bg-surface-2 sm:px-5">
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-baseline gap-x-2 text-[13.5px] text-ink">
                    <CodeLabel code={sectionCode(i.id, c.templateVersion)} />
                    <span className="font-medium">{sectionTitleIn(i.id, c.templateVersion)}</span>
                    {i.sc?.addedLater && <Badge tone="info">Added after completeness</Badge>}
                    {i.changed && (
                      <Badge tone="warn" dot>
                        Changed
                      </Badge>
                    )}
                  </span>
                  <span className="mt-0.5 block text-[12px] text-ink-3">{i.sc?.manual ? `Added by hand: ${i.sc.manual.justification}` : `Why in scope: ${i.sc?.reason ?? "—"}`}</span>
                  {docs.length > 0 && (
                    <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12.5px] text-ink-2">
                      {docs.map((d) => (
                        <span key={d.id} className="inline-flex min-w-0 items-center gap-1 [overflow-wrap:anywhere]">
                          <Paperclip size={12} className="shrink-0 text-ink-3" aria-hidden />
                          {d.name} <span className="text-ink-3">({fmtDate(d.uploadedAt)})</span>
                        </span>
                      ))}
                    </span>
                  )}
                </span>
                <span className="flex shrink-0 items-center gap-2 pt-0.5">
                  {i.ops.length > 0 && <span className="rounded-full bg-bad-soft px-1.5 text-[11px] font-semibold text-bad">{i.ops.length}</span>}
                  <span className="text-[12px] whitespace-nowrap text-ink-3">{docs.length ? `${docs.length} ${docs.length === 1 ? "document" : "documents"}` : isClosed(c) ? "No document" : "No document yet"}</span>
                  <ChevronRight size={15} className="text-ink-3 transition-transform group-hover:translate-x-0.5" aria-hidden />
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

/**
 * A documents-only section opened on its own (Customs on K7, Legal on K8 by their link, anyone from the navigator):
 * what the section covers, its documents, the questions on it, and the internal notes on it with a note box for those
 * who may post.
 */
export function FocusSection({ c, item }: { c: CiqCase; item: OutlineItem }) {
  const { state } = useStore();
  const id = item.id;
  const sec = sectionOf(id, c.templateVersion);
  const code = sectionCode(id, c.templateVersion);
  const docs = c.documents.filter((d) => d.sectionId === id).sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
  const ops = c.openPoints.filter((p) => p.ref.sectionId === id);
  const name = code || sec?.title;
  return (
    // Not overflow-hidden: the note box's @mention list may reach past the card's bottom edge.
    <Card id={`q-${id}`} data-testid={`q-section-${id}`} data-focus="true" data-status="docs" className="scroll-mt-20 ring-2 ring-brand/30">
      <SectionHeader c={c} item={item} />
      <p className="border-b border-line bg-surface-2 px-4 py-2.5 text-[13px] text-ink-2 sm:px-5">
        The supplier may answer this section with the CIQ template document, a statement or a certificate. The upload is optional and does not block completeness.{isClosed(c) ? "" : c.phase === "final-release" ? " The supplier's questionnaire is locked while the final release is requested." : " Documents can be added until the final release is requested."}
      </p>
      <div className="border-b border-line px-4 py-3 sm:px-5" data-testid={`q-focus-docs-${id}`}>
        <p className="text-xs font-medium text-ink-3">Documents on {name}</p>
        {docs.length ? (
          <ul className="mt-1.5 space-y-2">
            {docs.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[13px]">
                <span className="inline-flex min-w-0 items-center gap-1.5">
                  <Paperclip size={13} className="shrink-0 text-ink-3" aria-hidden />
                  <DocName id={d.id} name={d.name} className="min-w-0 font-medium text-ink [overflow-wrap:anywhere]" />
                </span>
                <Attribution state={state} by={d.uploadedBy} at={d.uploadedAt} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-[13px] text-ink-3 italic">{isClosed(c) ? "No document was uploaded to this section." : "No document uploaded to this section yet."}</p>
        )}
      </div>
      <div className="border-b border-line px-4 py-3 sm:px-5">
        <p className="text-xs font-medium text-ink-3">Questions to the supplier on {name}</p>
        {ops.length ? (
          <ul className="mt-1.5 space-y-1.5">
            {ops.map((p) => (
              <li key={p.id} className="flex flex-wrap items-baseline gap-x-2 text-[13px]">
                <Mono className="text-[11.5px] text-ink-3">{p.id}</Mono>
                <span className="min-w-0 text-ink">{p.question}</span>
                <span className="text-[12px] text-ink-3">· {POINT_STATE[p.status]}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-[13px] text-ink-3 italic">No question on this section.</p>
        )}
      </div>
      <SectionNotes c={c} item={item} />
    </Card>
  );
}

/** The note box's example fits the section: the HS code for Customs on K7, a patent for Legal on K8. */
function notePlaceholder(id: string, name: string): string {
  if (id === "K7") return `A note for colleagues on ${name}, e.g. the HS code or a licence question. Type @ to mention someone.`;
  if (id.startsWith("K8")) return `A note for colleagues on ${name}, e.g. a patent or licence question. Type @ to mention someone.`;
  return `A note for colleagues on ${name}. Type @ to mention someone.`;
}

/**
 * The internal notes on one section, newest first, with a note box for those who may post. @mentions work as on the
 * Internal notes tab: the box suggests Beiersdorf colleagues, a saved note shows its mentions as chips and whom it
 * e-mailed.
 */
export function SectionNotes({ c, item }: { c: CiqCase; item: OutlineItem }) {
  const { state, me, addInternalNote } = useStore();
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const id = item.id;
  const name = sectionCode(id, c.templateVersion) || sectionOf(id, c.templateVersion)?.title || id;
  const notes = c.internalNotes.filter((n) => n.sectionId === id).sort((a, b) => b.at.localeCompare(a.at));
  const denied = check(state, me.id, "note.add", c);
  return (
    <div className="px-4 py-3 sm:px-5" data-testid={`q-focus-notes-${id}`}>
      <p className="flex items-center gap-1 text-xs font-medium text-ink-3">
        <Lock size={11} aria-hidden />
        Internal notes on {name}
      </p>
      {notes.length > 0 && (
        <ul className="mt-2 space-y-2.5">
          {notes.map((n) => (
            <li key={n.id} id={`note-${n.id}`} tabIndex={-1} className="text-[13px] text-ink focus:outline-none">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <Attribution state={state} by={n.by} at={n.at} />
                <MentionsYou note={n} meId={me.id} />
              </div>
              <div className="pl-[30px]">
                <NoteText note={n} users={state.users} meId={me.id} className="mt-1 whitespace-pre-line [overflow-wrap:anywhere]" />
                <NoteNotified state={state} note={n} />
              </div>
            </li>
          ))}
        </ul>
      )}
      {denied ? (
        notes.length === 0 && <p className="mt-1 text-[13px] text-ink-3 italic">{isClosed(c) ? "No internal notes were written on this section." : "No internal notes on this section yet."}</p>
      ) : (
        <div className="mt-2 space-y-2">
          <MentionTextArea
            value={text}
            onChange={setText}
            people={mentionableUsers(state)}
            meId={me.id}
            placeholder={notePlaceholder(id, name)}
            className="min-h-[56px]"
            aria-label={`Internal note on ${name}`}
            data-testid={`q-focus-note-${id}`}
          />
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
            <p className="min-w-0 text-[12px] text-ink-3">{MENTION_HINT}</p>
            <Button
              size="sm"
              variant="secondary"
              disabled={!text.trim() || sending}
              className="ml-auto"
              data-testid={`q-focus-note-add-${id}`}
              onClick={() => {
                const body = text.trim();
                if (!body || sending) return;
                const r = addInternalNote(c.id, body, id);
                // the live app resolves false when the note did not reach Kissflow: the text stays (APP-SAVING-GAPS gap 6)
                setSending(true);
                void Promise.resolve(r).then((ok) => {
                  setSending(false);
                  if (ok !== false) setText((now) => (now.trim() === body ? "" : now));
                });
              }}
            >
              {sending ? "Sending…" : "Add note"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ not applicable

/** The K5.1 waiver: not applicable because SF-12 = No, with the mandatory justification. */
export const waiverOf = (c: CiqCase) => (c.justifications["FLD-5.1-002"] && c.scope.find((s) => s.sectionId === "K5.1")?.applicability === "na" ? c.justifications["FLD-5.1-002"] : null);

function NaRow({ c, s, highlight }: { c: CiqCase; s: ScopeItem; highlight?: boolean }) {
  const waiver = s.sectionId === "K5.1" ? waiverOf(c) : null;
  return (
    <li id={`q-${s.sectionId}`} data-testid={`q-na-${s.sectionId}`} className={cx("scroll-mt-20 px-4 py-2.5 sm:px-5", highlight && "bg-brand-soft/50")}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13.5px]">
        <StatusIcon status="na" size={14} />
        <CodeLabel code={sectionCode(s.sectionId, c.templateVersion)} />
        <span className="text-ink-2">{sectionTitleIn(s.sectionId, c.templateVersion)}</span>
        {waiver && <Badge tone="neutral">Waived with a justification</Badge>}
      </div>
      <p className="mt-0.5 pl-[22px] text-[12px] text-ink-3">{s.reason}</p>
      {waiver && (
        <p className="mt-1.5 ml-[22px] rounded-md bg-surface-2 px-2.5 py-1.5 text-[13px] text-ink-2" data-testid="q-waiver">
          Justification: {waiver}
        </p>
      )}
    </li>
  );
}

/** The sections that do not apply, with the rule reason: internal only (REQ-PROC-009), collapsed by default. */
export function NotApplicableCard({ c, rows, open, setOpen, highlight }: { c: CiqCase; rows: ScopeItem[]; open: boolean; setOpen: (v: boolean) => void; highlight?: string | null }) {
  // A waived mandatory test is never folded away: the K5.1 waiver shows under the closed card.
  const waiver = rows.some((s) => s.sectionId === "K5.1") ? waiverOf(c) : null;
  return (
    <Card id="q-na" className="scroll-mt-20 overflow-hidden" data-testid="q-not-applicable">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-2 sm:px-5" data-testid="q-not-applicable-toggle">
        <span className="min-w-0">
          <span className="block text-[14px] font-semibold text-ink">
            Not applicable <span className="font-normal text-ink-3">· {rows.length}</span>
          </span>
          <span className="mt-0.5 flex items-center gap-1.5 text-[12.5px] text-ink-3">
            <Lock size={12} className="shrink-0" aria-hidden /> Internal view: the supplier never sees these sections or the reasons.
          </span>
        </span>
        <ChevronRight size={16} className={cx("shrink-0 text-ink-3 transition-transform", open && "rotate-90")} aria-hidden />
      </button>
      {!open && waiver && (
        <p className="border-t border-line px-4 py-2.5 text-[13px] text-ink-2 sm:px-5" data-testid="q-waiver-summary">
          <span className="font-medium text-ink">
            {sectionCode("K5.1", c.templateVersion) || "K5.1"} {sectionTitleIn("K5.1", c.templateVersion)} is waived.
          </span>{" "}
          Justification: {waiver}
        </p>
      )}
      {open && (
        <ul className="divide-y divide-line border-t border-line">
          {rows.map((s) => (
            <NaRow key={s.sectionId} c={c} s={s} highlight={highlight === s.sectionId} />
          ))}
        </ul>
      )}
    </Card>
  );
}

/** A not-applicable section opened on its own: why it does not apply (and the K5.1 waiver). */
export function NaSection({ c, s }: { c: CiqCase; s: ScopeItem }) {
  const sec = sectionOf(s.sectionId, c.templateVersion);
  const code = sectionCode(s.sectionId, c.templateVersion);
  const waiver = s.sectionId === "K5.1" ? waiverOf(c) : null;
  // a derived field (L6) is never stored, so it keeps nothing
  const kept = fieldsOf(s.sectionId, c.templateVersion).filter((f) => !f.derivedFrom && hasValue(c.answers[f.id])).length;
  return (
    <Card id={`q-${s.sectionId}`} className="scroll-mt-20 overflow-hidden" data-testid={`q-section-${s.sectionId}`} data-applicability="na" data-status="na">
      <div className="border-b border-line px-4 py-3.5 sm:px-5">
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
          <div className="min-w-0 flex-1 basis-[240px]">
            <h3 className="flex flex-wrap items-baseline gap-x-2 text-[15.5px] leading-snug font-semibold text-ink">
              <CodeLabel code={code} />
              <span>{sec?.title ?? s.sectionId}</span>
            </h3>
            {sec?.meaning && <p className="mt-0.5 text-[13px] text-ink-3">{sec.meaning}</p>}
          </div>
          <Badge tone="neutral">{waiver ? "Not applicable · waived" : "Not applicable"}</Badge>
        </div>
      </div>
      <dl className="space-y-2 px-4 py-3 text-[13px] sm:px-5">
        <Meta k="Why not applicable">{s.reason}</Meta>
        {waiver && <Meta k="Justification">{waiver}</Meta>}
        {kept > 0 && <Meta k="Kept answers">{`${kept} answer${kept === 1 ? "" : "s"} from when the section applied; they come back if it opens again.`}</Meta>}
      </dl>
      <p className="flex items-center gap-1.5 border-t border-line px-4 py-2.5 text-[12.5px] text-ink-3 sm:px-5">
        <Lock size={12} className="shrink-0" aria-hidden /> Internal view: the supplier never sees this section or the reason.
      </p>
    </Card>
  );
}

