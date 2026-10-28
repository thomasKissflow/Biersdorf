import { Fragment, type CSSProperties, type ReactNode } from "react";
import { cx } from "@/components/ui";

/** Workshop answers per assumption. Local component state only: nothing is saved. */
export type Verdict = "correct" | "change";
export interface AssumptionReview {
  verdict?: Verdict;
  note: string;
  noteOpen?: boolean;
}
export type Reviews = Record<string, AssumptionReview>;

export const EMPTY_REVIEW: AssumptionReview = { note: "" };

export function reviewCounts(reviews: Reviews, total: number) {
  const values = Object.values(reviews);
  const correct = values.filter((r) => r.verdict === "correct").length;
  const change = values.filter((r) => r.verdict === "change").length;
  return { correct, change, open: Math.max(0, total - correct - change) };
}

/** "Dr. Jonas Albrecht" → "Jonas". */
export function firstName(full: string): string {
  return full.replace(/^(Dr\.|Prof\.)\s+/i, "").split(/\s+/)[0] ?? full;
}

export const SECTION_IDS = ["process", "assumptions", "rules", "roles", "scope", "needs", "timeline"] as const;
export type SectionId = (typeof SECTION_IDS)[number];

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

/** In-page navigation. The app uses a HashRouter, so plain #anchors would change the route. */
export function scrollToId(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  const reduce = prefersReducedMotion();
  const before = window.scrollY;
  el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  if (reduce) return;
  // Some renderers (background tabs, screen recorders) never advance a smooth scroll: jump instead.
  window.setTimeout(() => {
    const top = el.getBoundingClientRect().top;
    if (window.scrollY === before && (top > 240 || top < 0)) el.scrollIntoView({ block: "start" });
  }, 600);
}

/**
 * Bottom edge of everything sticky at the top of the page (shell header + section nav), in px.
 * SectionNav measures it and sets it on the page root, because the shell header is taller below
 * lg (it carries the mobile nav row). Sections and anchored rows use it as their scroll margin.
 */
export const STICKY_VAR = "--understanding-sticky";
export const stickyMargin = (extra: number): CSSProperties => ({ scrollMarginTop: `calc(var(${STICKY_VAR}, 104px) + ${extra}px)` });

/** Keeps IDs such as REQ-PROC-009 or AS-09 on one line inside running text. */
const ID_RE = /((?:REQ|AS|SF|PS|OP|RS|CIQ)-[A-Z0-9]+(?:[-.][A-Z0-9]+)*)/g;
export function NoBreakIds({ text }: { text: string }) {
  const parts = text.split(ID_RE);
  if (parts.length === 1) return <>{text}</>;
  return <>{parts.map((p, i) => (i % 2 ? <span key={i} className="whitespace-nowrap">{p}</span> : <Fragment key={i}>{p}</Fragment>))}</>;
}

/** A page section with a real heading; offsets for the sticky shell header and section nav. */
export function PageSection({ id, title, hint, action, children, className }: { id: SectionId; title: ReactNode; hint?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className={className} style={stickyMargin(24)}>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <div className="min-w-0">
          <h2 id={`${id}-title`} className="text-[17px] font-semibold tracking-tight text-balance text-ink">
            {title}
          </h2>
          {hint && <p className="mt-1 max-w-3xl text-[13px] text-pretty text-ink-2">{hint}</p>}
        </div>
        {action && <div className="flex max-w-full shrink-0 flex-wrap items-center gap-2">{action}</div>}
      </div>
      {children}
    </section>
  );
}

/** Small mono chip for a requirement ID, rule ID or section code. */
export function CodeChip({ children, tone = "neutral", title }: { children: ReactNode; tone?: "neutral" | "brand" | "muted"; title?: string }) {
  return (
    <span
      title={title}
      className={cx(
        "inline-flex items-center rounded-md px-1.5 py-0.5 font-mono text-[11.5px] leading-tight tracking-tight whitespace-nowrap",
        tone === "brand" && "bg-brand-soft text-brand",
        tone === "neutral" && "bg-surface-3 text-ink-2",
        tone === "muted" && "border border-dashed border-line-strong text-ink-3",
      )}
    >
      {children}
    </span>
  );
}
