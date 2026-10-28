// Small controls of the configuration editor, each with its own test hooks: a segmented choice whose buttons are
// `<testid>-<value>`, department chips `<testid>-<DEPT>` and the "New in draft" / "Changed in draft" marks.
import type { ReactNode } from "react";
import { Badge, cx } from "@/components/ui";
import { DEPT_LABEL, DEPT_SHORT } from "@/domain/catalog";
import type { Dept } from "@/domain/types";

/** Buttons for a small set of options (larger targets than a list). The group gets `data-testid` and `data-value`. */
export function Choice<T extends string>({
  value,
  onChange,
  options,
  disabled,
  "data-testid": testId,
  "aria-label": ariaLabel,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode; hint?: string }[];
  disabled?: boolean;
  "data-testid": string;
  "aria-label"?: string;
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} data-testid={testId} data-value={value} className="inline-flex max-w-full flex-wrap gap-0.5 rounded-lg border border-line-strong bg-surface-2 p-0.5">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            title={o.hint}
            disabled={disabled}
            data-testid={`${testId}-${o.value}`}
            onClick={() => onChange(o.value)}
            className={cx(
              "h-8 rounded-md px-3 text-[13px] font-medium whitespace-nowrap transition-colors disabled:cursor-not-allowed",
              on ? "bg-surface text-ink shadow-card ring-1 ring-brand/30" : "text-ink-3 hover:text-ink",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Toggle chips for departments. */
export function DeptChips({ value, onChange, options, testPrefix, invalid }: { value: Dept[]; onChange: (v: Dept[]) => void; options: Dept[]; testPrefix: string; invalid?: boolean }) {
  return (
    <div className={cx("flex flex-wrap gap-1.5 rounded-lg", invalid && "ring-2 ring-bad/25 ring-offset-2 ring-offset-surface")}>
      {options.map((d) => {
        const on = value.includes(d);
        return (
          <button
            type="button"
            key={d}
            aria-pressed={on}
            title={DEPT_LABEL[d]}
            data-testid={`${testPrefix}-${d}`}
            onClick={() => onChange(on ? value.filter((x) => x !== d) : [...value, d])}
            className={cx("rounded-full border px-3 py-1 text-[13px] transition-colors", on ? "border-brand bg-brand-soft font-medium text-brand" : "border-line-strong bg-surface text-ink-2 hover:border-ink-3")}
          >
            {DEPT_SHORT[d]}
          </button>
        );
      })}
    </div>
  );
}

/** The departments in the order the forms offer them: the reviewing departments first, then RMM and the informed. */
export const DEPT_ORDER: Dept[] = ["REG", "SAF", "QM", "MIC", "SUS", "RMM", "CUS", "LEG"];

export type Mark = "new" | "changed" | "retired";

const MARK: Record<Mark, { tone: "brand" | "info" | "neutral"; draft: string; short: string }> = {
  new: { tone: "brand", draft: "New in draft", short: "New" },
  changed: { tone: "info", draft: "Changed in draft", short: "Changed" },
  retired: { tone: "neutral", draft: "Retired in draft", short: "Retired" },
};

/** "New in draft" / "Changed in draft" (or "New" with the version as tooltip for a published version). */
export function MarkBadge({ mark, inDraft, version, "data-testid": testId }: { mark: Mark | undefined; inDraft: boolean; version?: string; "data-testid"?: string }) {
  if (!mark) return null;
  const m = MARK[mark];
  return (
    <span data-testid={testId} data-mark={mark} title={inDraft ? undefined : `${m.short} in ${version ?? "this version"}`} className="inline-flex">
      <Badge tone={m.tone}>{inDraft ? m.draft : m.short}</Badge>
    </span>
  );
}

/** A labelled block of a form ("When", "Then", …) with its own small heading. */
export function FormBlock({ label, hint, children, className }: { label: ReactNode; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx("space-y-2", className)}>
      <div>
        <h3 className="text-xs font-semibold tracking-wide text-ink-3 uppercase">{label}</h3>
        {hint && <p className="mt-0.5 text-[12.5px] text-ink-3">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

/** An inline message under a control. */
export function InlineError({ children, "data-testid": testId }: { children: ReactNode; "data-testid"?: string }) {
  if (!children) return null;
  return (
    <p data-testid={testId} role="alert" className="text-xs font-medium text-bad">
      {children}
    </p>
  );
}
