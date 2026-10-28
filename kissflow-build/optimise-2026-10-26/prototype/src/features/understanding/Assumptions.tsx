// Assumptions to confirm: one row per assumption with Correct / Needs change and an optional note.
// Answers live in page state only (workshop capture); nothing is written to the store.

import { Check, MessageSquarePlus, PenLine, RotateCcw } from "lucide-react";
import { useEffect, useRef } from "react";
import { Button, Card, DemoNote, TextArea, cx } from "@/components/ui";
import { ASSUMPTIONS_LIST } from "@/domain/catalog";
import { STEPS } from "./content";
import { CodeChip, EMPTY_REVIEW, NoBreakIds, PageSection, reviewCounts, stickyMargin, type AssumptionReview, type Reviews, type Verdict } from "./shared";
import { useCallMode } from "./callMode";
import { VerdictBadge } from "./VerdictBadge";

/** Which map steps each assumption sits behind (for the "see step" links). */
const STEPS_BY_ASSUMPTION: Record<string, { id: string; n: number; card: string }[]> = {};
for (const s of STEPS) for (const a of s.assumptions) (STEPS_BY_ASSUMPTION[a] ??= []).push({ id: s.id, n: s.n, card: s.card });

export function Assumptions({ reviews, onChange, onReset, flash, onOpenStep }: { reviews: Reviews; onChange: (id: string, patch: Partial<AssumptionReview>) => void; onReset: () => void; flash: string | null; onOpenStep: (stepId: string) => void }) {
  const total = ASSUMPTIONS_LIST.length;
  const { correct, change, open } = reviewCounts(reviews, total);
  const touched = Object.values(reviews).some((r) => r.verdict || r.note.trim());

  return (
    <PageSection
      id="assumptions"
      title="Assumptions to confirm"
      hint="Where your documents disagree or say nothing, we had to choose. Each choice below is a question for you. Mark it correct, or tell us what should change."
      action={<DemoNote>answers captured during the workshop, not saved</DemoNote>}
    >
      <Card>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 border-b border-line px-5 py-4">
          <div className="min-w-[220px] flex-1">
            <p className="text-[13.5px] text-ink">
              <span className="font-semibold">
                {correct} of {total}
              </span>{" "}
              confirmed in this session
              {change > 0 && (
                <>
                  <span className="text-ink-3"> · </span>
                  <span className="font-semibold">{change}</span> {change === 1 ? "needs" : "need"} change
                </>
              )}
              <span className="text-ink-3"> · {open} open</span>
            </p>
            <div className="mt-2 flex h-1.5 w-full max-w-md overflow-hidden rounded-full bg-surface-3" role="img" aria-label={`${correct} confirmed, ${change} need change, ${open} open`}>
              <span className="h-full bg-ok transition-[width] duration-300" style={{ width: `${(correct / total) * 100}%` }} />
              <span className="h-full bg-warn transition-[width] duration-300" style={{ width: `${(change / total) * 100}%` }} />
            </div>
          </div>
          <Button variant="ghost" size="sm" icon={<RotateCcw size={14} />} onClick={onReset} disabled={!touched}>
            Clear answers
          </Button>
        </div>
        <ol className="divide-y divide-line">
          {ASSUMPTIONS_LIST.map((a) => (
            <AssumptionRow key={a.id} a={a} review={reviews[a.id] ?? EMPTY_REVIEW} flash={flash === a.id} onChange={(patch) => onChange(a.id, patch)} onOpenStep={onOpenStep} />
          ))}
        </ol>
      </Card>
    </PageSection>
  );
}

function AssumptionRow({ a, review, flash, onChange, onOpenStep }: { a: (typeof ASSUMPTIONS_LIST)[number]; review: AssumptionReview; flash: boolean; onChange: (patch: Partial<AssumptionReview>) => void; onOpenStep: (stepId: string) => void }) {
  const call = useCallMode();
  const rowRef = useRef<HTMLLIElement>(null);
  const wantFocus = useRef(false);
  const focusNote = () => {
    wantFocus.current = true;
  };
  const showNote = review.noteOpen || review.verdict === "change" || review.note.trim().length > 0;
  const steps = STEPS_BY_ASSUMPTION[a.id] ?? [];

  const choose = (v: Verdict) => {
    const next = review.verdict === v ? undefined : v;
    onChange({ verdict: next });
    if (next === "change") focusNote();
  };

  useEffect(() => {
    if (flash) rowRef.current?.focus({ preventScroll: true });
  }, [flash]);

  // Focus the note after it has rendered (opened by "Needs change" or "Note").
  useEffect(() => {
    if (!wantFocus.current || !showNote) return;
    wantFocus.current = false;
    rowRef.current?.querySelector("textarea")?.focus();
  }, [showNote, review.verdict]);

  return (
    <li ref={rowRef} id={`assumption-${a.id}`} tabIndex={-1} style={stickyMargin(40)} className={cx("px-5 py-4 transition-colors duration-700 outline-none", flash ? "bg-brand-soft" : "bg-transparent")}>
      <div className="grid gap-x-6 gap-y-3 md:grid-cols-[minmax(0,1fr)_auto]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <CodeChip tone="brand">{a.id}</CodeChip>
            <h3 className="text-[14px] font-semibold text-ink">{a.topic}</h3>
            <VerdictBadge verdict={review.verdict} />
          </div>
          <p className="mt-1.5 max-w-[72ch] text-[13.5px] leading-relaxed text-pretty text-ink">
            <NoBreakIds text={a.text} />
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-ink-3">
            <span>
              Basis:{" "}
              <span className="text-ink-2">
                <NoBreakIds text={a.source} />
              </span>
            </span>
            {a.question != null && !call && <span>Question {a.question} in our call list</span>}
            {steps.length > 0 && (
              <span className="inline-flex flex-wrap items-center gap-x-1">
                In the map:
                {steps.map((s, i) => (
                  <span key={s.id}>
                    <button type="button" onClick={() => onOpenStep(s.id)} className="rounded font-medium text-brand hover:underline" title={s.card}>
                      step {s.n}
                    </button>
                    {i < steps.length - 1 ? "," : ""}
                  </span>
                ))}
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-start gap-2 md:justify-end">
          <VerdictButton active={review.verdict === "correct"} tone="ok" icon={<Check size={14} />} onClick={() => choose("correct")}>
            Correct
          </VerdictButton>
          <VerdictButton active={review.verdict === "change"} tone="warn" icon={<PenLine size={14} />} onClick={() => choose("change")}>
            Needs change
          </VerdictButton>
          {/* Once the note is open the button keeps its slot (invisible) on wide screens, so the Correct /
              Needs change pair stays in one column across rows and never slides under the cursor. */}
          <Button
            variant="ghost"
            size="sm"
            icon={<MessageSquarePlus size={14} />}
            aria-hidden={showNote || undefined}
            tabIndex={showNote ? -1 : undefined}
            className={cx(showNote && "pointer-events-none max-md:hidden md:invisible")}
            onClick={() => {
              onChange({ noteOpen: true });
              focusNote();
            }}
          >
            Note
          </Button>
        </div>
      </div>
      {showNote && (
        <div className="mt-3 max-w-[72ch]">
          <label htmlFor={`note-${a.id}`} className="sr-only">
            Note for {a.id}
          </label>
          <TextArea
            id={`note-${a.id}`}
            value={review.note}
            onChange={(e) => onChange({ note: e.target.value })}
            placeholder={review.verdict === "change" ? "What should change? For example who decides, or which document applies." : "Optional note from the discussion"}
            className="min-h-[64px] text-[13.5px]"
          />
        </div>
      )}
    </li>
  );
}

function VerdictButton({ active, tone, icon, onClick, children }: { active: boolean; tone: "ok" | "warn"; icon: React.ReactNode; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cx(
        "inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[13px] font-medium whitespace-nowrap transition-colors duration-150",
        !active && "border-line-strong bg-surface text-ink-2 hover:bg-surface-2 hover:text-ink",
        active && tone === "ok" && "border-ok bg-ok-soft text-ok",
        active && tone === "warn" && "border-warn bg-warn-soft text-[color-mix(in_oklch,var(--warn)_70%,var(--ink))]",
      )}
    >
      {icon}
      {children}
    </button>
  );
}
