// Shared helpers for the Part 2 review screens (local to this feature folder): the departments and RMM's lane.
import { Check, Clock, RotateCcw, X } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Badge, Card, EmptyState, cx, type Tone } from "@/components/ui";
import { DEPT_LABEL, DEPT_SHORT, REVIEW_TRACK_DEPTS, sectionOf } from "@/domain/catalog";
import { DAY, fmtDate, nowIso, rmmFlags, trackView, type TrackView } from "@/domain/selectors";
import type { CiqCase, Dept, DocumentRef, FieldDef, ObjectRef, ReviewDept, ReviewTrack, TrackStatus } from "@/domain/types";
import { useStore } from "@/store/store";

/** Has a Part 2 review lane: RMM (the whole CIQ) and the five section-owning departments. */
export const isReviewDept = (d?: Dept): d is ReviewDept => !!d && (REVIEW_TRACK_DEPTS as Dept[]).includes(d);
/** RMM's lane: reads the whole CIQ, asks the supplier on any section, writes internal notes and completes its own review. */
export const isRmmLane = (d?: Dept): d is "RMM" => d === "RMM";
export const isRmesDept = (d?: Dept): d is "SAF" | "REG" => d === "SAF" || d === "REG";

/** The current persona's review department, if it has one. */
export function useReviewer() {
  const { persona, me, state } = useStore();
  const dept = isReviewDept(persona.dept) ? persona.dept : undefined;
  return { persona, me, state, dept };
}

// ------------------------------------------------------------------ dates

export const plusDaysIso = (days: number) => new Date(Date.parse(nowIso()) + days * DAY).toISOString();
export const toDateInput = (iso: string) => iso.slice(0, 10);
export const fromDateInput = (d: string) => new Date(`${d}T16:00:00.000Z`).toISOString();
export const todayInput = () => nowIso().slice(0, 10);

// ------------------------------------------------------------------ references

/** A section's code and title as the case's questionnaire version defines them (`templateVersion` = c.templateVersion,
 *  spec §8.1); without a version, the newest definition. Unknown ids print as themselves. */
export const secCode = (id: string, templateVersion?: string) => sectionOf(id, templateVersion)?.code ?? id;
export const secTitle = (id: string, templateVersion?: string) => sectionOf(id, templateVersion)?.title ?? id;

/** A document as people refer to it: file name and upload date (no versions, BRM v2 REQ-PROC-029). */
export const docLabel = (d: Pick<DocumentRef, "name" | "uploadedAt">) => `${d.name}, uploaded ${fmtDate(d.uploadedAt)}`;

/** What a reviewer can point a supplier request at (REQ-PROC-029). */
export interface AskTarget {
  ref: ObjectRef;
  defaultKind?: "query" | "document-request";
  /** For table rows: the column the question is about, appended to the label. */
  attributes?: string[];
}

export function fieldTarget(f: FieldDef, doc?: DocumentRef, templateVersion?: string): AskTarget {
  const code = secCode(f.sectionId, templateVersion);
  return {
    ref: { sectionId: f.sectionId, fieldId: f.id, documentId: doc?.id, label: doc ? `${code} › ${f.label} (${docLabel(doc)})` : `${code} › ${f.label}` },
    defaultKind: f.type === "file" ? "document-request" : "query",
  };
}

export function docTarget(d: DocumentRef, fieldLabel?: string, templateVersion?: string): AskTarget {
  return {
    ref: { sectionId: d.sectionId, fieldId: d.fieldId, documentId: d.id, label: `${secCode(d.sectionId, templateVersion)} › ${fieldLabel ? `${fieldLabel} (${docLabel(d)})` : docLabel(d)}` },
    defaultKind: "document-request",
  };
}

export function sectionTarget(sectionId: string, templateVersion?: string): AskTarget {
  return { ref: { sectionId, label: `${secCode(sectionId, templateVersion)} › ${secTitle(sectionId, templateVersion)}` } };
}

// ------------------------------------------------------------------ RMES record

/** While the case's RMES record does not exist yet: when it is created (the decision and, live, the completion need
 *  it). Prototype: with the Safety / Regulatory review task; live: on that reviewer's own next load (FE-CLEANUP A14). */
export const rmesRecordPending = (instant: boolean) =>
  instant ? "The internal RMES record is created when Safety or Regulatory gets a review task on the case." : "The internal RMES record is created the next time a Safety or Regulatory reviewer with a review task on the case opens CIQ Digital.";

// ------------------------------------------------------------------ case facts

export function decisionEvent(c: CiqCase, dept: ReviewDept) {
  return [...c.audit].reverse().find((a) => a.action === `Final ${DEPT_SHORT[dept]} decision`);
}

export function completionOf(c: CiqCase, dept: ReviewDept) {
  return [...c.confirmations].reverse().find((x) => x.type === "dept-completion" && x.dept === dept);
}

export function completenessOf(c: CiqCase) {
  return [...c.confirmations].reverse().find((x) => x.type === "completeness");
}

// ------------------------------------------------------------------ small visual pieces

/** Badge for a case flagged for RMM's review (origin without rules). Informational: it never blocks. */
export function OriginFlag({ c, compact }: { c: CiqCase; compact?: boolean }) {
  const flags = rmmFlags(c);
  if (!flags.length) return null;
  if (compact)
    return (
      <span title={flags.join(" ")} className="mt-1 flex items-center gap-1.5 pl-1 text-[11.5px] whitespace-nowrap text-ink-2">
        <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-warn" />
        Origin without rules
      </span>
    );
  return (
    <span title={flags.join(" ")}>
      <Badge tone="warn" dot>
        Flagged for you · origin without rules
      </Badge>
    </span>
  );
}

const CHIP: Record<TrackStatus, { tone: string; icon: ReactNode; text: string }> = {
  "not-started": { tone: "bg-surface-3 text-ink-3", icon: <span className="h-1.5 w-1.5 rounded-full bg-ink-3" />, text: "not started" },
  "in-review": { tone: "bg-info-soft text-info", icon: <span className="h-1.5 w-1.5 rounded-full bg-info" />, text: "in review" },
  "waiting-supplier": { tone: "bg-violet-soft text-violet", icon: <Clock size={10} strokeWidth={2.5} />, text: "waiting for supplier" },
  completed: { tone: "bg-ok-soft text-ok", icon: <Check size={10} strokeWidth={3} />, text: "completed" },
  reopened: { tone: "bg-warn-soft text-ink-2", icon: <RotateCcw size={10} strokeWidth={2.5} />, text: "reopened" },
};

/** Tiny per-review chip (RMM or a department): code + status glyph (never colour alone; full text in the title). */
export function MiniTrack({ track }: { track: ReviewTrack }) {
  const rejected = track.decision === "rejected";
  const m = CHIP[track.status];
  const text = `${DEPT_LABEL[track.dept]}: ${m.text}${track.decision ? ` · ${track.decision}` : ""}`;
  return (
    // `relative` keeps the absolutely positioned sr-only text inside the chip; otherwise it escapes the
    // table's horizontal scroller and widens the whole page on phones.
    <span title={text} className={cx("relative inline-flex h-5 shrink-0 items-center gap-1 rounded px-1.5 text-[10.5px] font-semibold tracking-wide", rejected ? "bg-bad-soft text-bad" : m.tone)}>
      {rejected ? <X size={10} strokeWidth={3} /> : m.icon}
      {track.dept}
      <span className="sr-only">{text}</span>
    </span>
  );
}

export function DeptProgress({ c }: { c: CiqCase }) {
  const done = c.reviews.filter((r) => r.status === "completed").length;
  return (
    <div className="flex flex-col items-start gap-1">
      <span className="text-[12px] whitespace-nowrap text-ink-2">
        {done} of {c.reviews.length} done
      </span>
      <span className="flex gap-1">
        {c.reviews.map((r) => (
          <MiniTrack key={r.dept} track={r} />
        ))}
      </span>
    </div>
  );
}

const TRACK_TONE: Record<TrackView, Tone> = { "not-started": "neutral", "in-review": "info", "waiting-supplier": "violet", completed: "ok", reopened: "warn", ended: "neutral" };
const TRACK_TEXT: Record<TrackView, string> = { "not-started": "Not started", "in-review": "In review", "waiting-supplier": "Waiting for supplier", completed: "Completed", reopened: "Reopened", ended: "Ended" };

/** Review chip for case headers (RMM or a department): name, track status and (Safety / Regulatory) decision. */
export function DeptTrackChip({ c, track }: { c: CiqCase; track: ReviewTrack }) {
  const v = trackView(c, track);
  return (
    <span className="inline-flex items-center gap-2 rounded-lg border border-line bg-surface px-2.5 py-1 text-[12.5px]">
      <span className="font-medium text-ink">{DEPT_SHORT[track.dept]}</span>
      <Badge tone={TRACK_TONE[v]} dot>
        {TRACK_TEXT[v]}
      </Badge>
      {track.decision && <Badge tone={track.decision === "approved" ? "ok" : "bad"}>{track.decision === "approved" ? "Approved" : "Rejected"}</Badge>}
    </span>
  );
}

/** Calm full-width notice (no side-border accent). */
export function Notice({ tone = "info", icon, title, children, action, testId }: { tone?: "info" | "warn" | "ok" | "neutral" | "bad"; icon?: ReactNode; title?: ReactNode; children?: ReactNode; action?: ReactNode; testId?: string }) {
  const bg = { info: "bg-info-soft", warn: "bg-warn-soft", ok: "bg-ok-soft", neutral: "bg-surface-2", bad: "bg-bad-soft" }[tone];
  const fg = { info: "text-info", warn: "text-ink-2", ok: "text-ok", neutral: "text-ink-3", bad: "text-bad" }[tone];
  return (
    <div data-testid={testId} className={cx("flex flex-wrap items-start gap-3 rounded-lg px-3.5 py-3 text-[13px]", bg)}>
      {icon && <span className={cx("mt-0.5 shrink-0", fg)}>{icon}</span>}
      <div className="min-w-0 flex-1 text-ink-2">
        {title && <p className="font-medium text-ink">{title}</p>}
        {children && <div className={title ? "mt-0.5" : undefined}>{children}</div>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

/** For people without a review lane: Customs and Legal (informed, read-only), Admin, Business owner and Auditor. */
export function NotReviewer({ caseId }: { caseId?: string }) {
  const { persona } = useStore();
  const informed = persona.dept === "CUS" || persona.dept === "LEG";
  return (
    <Card data-testid="workspace-not-reviewer">
      <EmptyState
        title={informed ? "Customs and Legal follow cases read-only" : "Reviews are done by RMM and the department reviewers"}
        action={
          <Link to={caseId ? `/cases/${caseId}` : "/cases"} className="text-[13px] font-medium text-brand hover:underline">
            {caseId ? "Open the case page" : "Go to Cases"}
          </Link>
        }
      >
        {informed
          ? "You have no review task. The case page shows every answer, K7 and K8 included, and you can post internal notes there."
          : "Your role reads the cases without a review task. The case page shows every answer, open point and document."}
      </EmptyState>
    </Card>
  );
}
