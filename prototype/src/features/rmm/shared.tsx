// Small building blocks shared by the RMM screens and the Case 360 page.
import { Ban, BadgeCheck, Check, Circle, CircleDot, CircleSlash, Hourglass, Lock, RotateCcw } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Avatar, Badge, Card, CardHeader, EmptyState, Mono, TrafficLight, cx, type Tone } from "@/components/ui";
import { useStore } from "@/store/store";
import { DEPT_SHORT, ORIGIN_LABEL, REVIEW_TRACK_DEPTS, sectionLabel, sectionOf, shownCode } from "@/domain/catalog";
import { undefinedOrigins } from "@/domain/rules";
import { DAY, isClosed, isOverdue, nowIso, relDays, fmtDate, rmmFlags, trackView, userById, type TrackView } from "@/domain/selectors";
import type { AppState, CiqCase, ConfirmationType, Dept, Persona, Phase, ReviewDept, ReviewTrack } from "@/domain/types";

/** Compact phase names for chart axes and dense cells. The full name is PHASE_LABEL. */
export const PHASE_SHORT: Record<Phase, string> = {
  "supplier-input": "Supplier fills in",
  review: "Review",
  "final-release": "Final release",
  completed: "Completed",
  cancelled: "Cancelled",
  // Legacy phases of the live portal's old flow; the prototype never produces them.
  metadata: "Basic data (portal)",
  "scope-check": "Scope check (portal)",
};

export const CONFIRMATION_LABEL: Record<ConfirmationType, string> = {
  completeness: "Completeness confirmation",
  "dept-completion": "Review completion",
  "final-release": "Final release",
  cancellation: "Cancellation",
};

/** Label of one confirmation: RMM's own review completion reads as such, not as a department's. */
export const confirmationLabel = (type: ConfirmationType, dept?: Dept) => (type === "dept-completion" && dept ? `${CONFIRMATION_LABEL[type]} · ${DEPT_SHORT[dept]}` : CONFIRMATION_LABEL[type]);

/**
 * The section's code for display, as the case's questionnaire version defines it (`templateVersion` =
 * c.templateVersion, spec §8.1; without one, the newest definition). Empty when the title already starts with it
 * ("General" → "General information").
 */
export const sectionCode = (id: string, templateVersion?: string) => {
  const sec = sectionOf(id, templateVersion);
  return shownCode(sec?.code ?? id, sec?.title ?? "");
};
/** The section's title in the case's questionnaire version; the id for an unknown section. */
export const sectionTitleIn = (id: string, templateVersion?: string) => sectionOf(id, templateVersion)?.title ?? id;

const isAnnex = (id: string, templateVersion?: string) => sectionOf(id, templateVersion)?.kind === "annex";

/** Section ids with chapters (and the basic-data sections) first, then annexes; order within each group is kept. */
export const chaptersThenAnnexes = (ids: string[], templateVersion?: string) => [...ids.filter((id) => !isAnnex(id, templateVersion)), ...ids.filter((id) => isAnnex(id, templateVersion))];

/** <optgroup>s "Chapters" / "Annexes" for a section dropdown, as in the reviewer's "Activate a section" list, in the
 *  case's questionnaire version. Returns plain elements, not a component, because Select reads its <option>/<optgroup>
 *  children directly. */
export function sectionOptionGroups(ids: string[], templateVersion?: string): ReactNode[] {
  const ordered = chaptersThenAnnexes(ids, templateVersion);
  return [
    { label: "Chapters", ids: ordered.filter((id) => !isAnnex(id, templateVersion)) },
    { label: "Annexes", ids: ordered.filter((id) => isAnnex(id, templateVersion)) },
  ]
    .filter((g) => g.ids.length)
    .map((g) => (
      <optgroup key={g.label} label={g.label}>
        {g.ids.map((id) => (
          <option key={id} value={id}>
            {sectionLabel(id, templateVersion)}
          </option>
        ))}
      </optgroup>
    ));
}

/** Only RMM (the case owner) may cancel or reactivate a case. */
export const canManage = (p: Persona) => p.id === "rmm";

/** Has a Part 2 review lane: RMM (whole CIQ) and the five section-owning departments. */
export const isReviewDept = (d: unknown): d is ReviewDept => REVIEW_TRACK_DEPTS.includes(d as ReviewDept);

/** The section an informed department owns and opens a case on: Customs K7, Legal K8. */
export const INFORMED_SECTION: Partial<Record<Dept, string>> = { CUS: "K7", LEG: "K8" };

/** Department reviewers jump straight into their review when they have a track on the case. RMM owns the case and
 *  lands on the case page, which links to its own review ("Open my review"). Customs and Legal open the case on their
 *  own section (K7, K8), read-only. */
export function caseHref(p: Persona, c: CiqCase): string {
  if (!canManage(p) && isReviewDept(p.dept) && c.reviews.some((r) => r.dept === p.dept)) return `/review/${c.id}`;
  const own = p.dept ? INFORMED_SECTION[p.dept] : undefined;
  if (own) return `/cases/${c.id}?tab=questionnaire&s=${own}`;
  return `/cases/${c.id}`;
}

/** Labels of the case's origins without rules (waste, CCU, chemical recycling), for the RMM flag. */
export const undefinedOriginLabels = (c: CiqCase) => undefinedOrigins(c.config).map((o) => ORIGIN_LABEL[o]);

/** Badge for a case flagged for RMM's Part 2 review (origin without rules). Informational: it never blocks.
 *  `compact`: a one-line hint for dense table cells. */
export function OriginFlag({ c, compact }: { c: CiqCase; compact?: boolean }) {
  const flags = rmmFlags(c);
  if (!flags.length) return null;
  if (compact)
    return (
      <span title={flags.join(" ")} className="mt-1 flex items-center gap-1.5 pl-1 text-[11.5px] whitespace-nowrap text-ink-2">
        <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-warn" />
        Flagged for RMM
      </span>
    );
  return (
    <span title={flags.join(" ")}>
      <Badge tone="warn" dot>
        Flagged for RMM · origin without rules
      </Badge>
    </span>
  );
}

export const daysSince = (iso: string) => Math.max(0, Math.floor((Date.parse(nowIso()) - Date.parse(iso)) / DAY));
export const phaseSince = (c: CiqCase) => c.phaseHistory.at(-1)?.at ?? c.createdAt;
export const lastActivity = (c: CiqCase) => c.audit.reduce((m, a) => (a.at > m ? a.at : m), c.createdAt);
export const unresolvedPoints = (c: CiqCase) => c.openPoints.filter((p) => p.status !== "closed");
export const overduePoints = (c: CiqCase) => c.openPoints.filter((p) => p.status === "open" && isOverdue(p.dueDate));

/** Case-level overdue: due date passed while open, or an open point waiting past its due date. */
export const caseOverdue = (c: CiqCase) => !isClosed(c) && (isOverdue(c.dueDate) || overduePoints(c).length > 0);

export function firstName(state: AppState, id: string): string {
  const u = userById(state, id);
  return u ? u.name.replace(/^Dr\. /, "").split(" ")[0] : id;
}

// ------------------------------------------------------------------------------------------ layout

/** One "no access" state for a page outside the person's role, with a link to their own home page. */
export function NoAccess({ children }: { children?: ReactNode }) {
  const { persona } = useStore();
  return (
    <Card data-testid="no-access">
      <EmptyState
        icon={<Lock size={28} />}
        title="You don't have access to this page"
        action={
          <Link to={persona.landing} className="text-[13px] font-medium text-brand hover:underline">
            Go to your home page
          </Link>
        }
      >
        {children}
      </EmptyState>
    </Card>
  );
}

/**
 * Card header whose action (a segmented filter, a badge, a prototype note) moves below the title on
 * phones, so a wide control never squeezes the title and subtitle into a one-word-per-line column.
 * "row" puts the action in its own bordered strip; "inline" puts it under the subtitle.
 */
export function ResponsiveCardHeader({ title, subtitle, action, mobile = "row" }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode; mobile?: "row" | "inline" }) {
  if (!action) return <CardHeader title={title} subtitle={subtitle} />;
  const desktop = <div className="hidden sm:block">{action}</div>;
  if (mobile === "inline") {
    return (
      <CardHeader
        title={title}
        subtitle={
          <>
            {subtitle}
            <span className="mt-1.5 flex sm:hidden">{action}</span>
          </>
        }
        action={desktop}
      />
    );
  }
  return (
    <>
      <CardHeader title={title} subtitle={subtitle} action={desktop} />
      <div className="border-b border-line px-4 py-2.5 sm:hidden">{action}</div>
    </>
  );
}

// ------------------------------------------------------------------------------------------ cells

export function CaseCell({ c, compact }: { c: CiqCase; compact?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-2">
        <span className="truncate font-medium text-ink">{c.materialName}</span>
        {c.priority === "high" && <span className="rounded bg-warn-soft px-1 text-[10.5px] font-semibold text-ink-2 uppercase">High</span>}
      </div>
      <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-ink-3">
        <Mono className="shrink-0 text-[11.5px] whitespace-nowrap text-ink-2">{c.id}</Mono>
        {!compact && (
          <>
            <span aria-hidden>·</span>
            <span className="truncate">{c.inci}</span>
          </>
        )}
      </div>
    </div>
  );
}

const TRACK_ICON: Record<TrackView, { icon: typeof Check; tone: string; label: string }> = {
  "not-started": { icon: Circle, tone: "text-ink-3", label: "Not started" },
  "in-review": { icon: CircleDot, tone: "text-info", label: "In review" },
  "waiting-supplier": { icon: Hourglass, tone: "text-violet", label: "Waiting for supplier" },
  completed: { icon: Check, tone: "text-ok", label: "Completed" },
  reopened: { icon: RotateCcw, tone: "text-warn", label: "Reopened" },
  ended: { icon: CircleSlash, tone: "text-ink-3", label: "Ended (case cancelled)" },
};

/** One shared wording for a case without review tasks yet (Cases table and Dashboard). */
export const STARTS_AT_COMPLETENESS = "Starts at completeness";

function ReviewChip({ c, r }: { c: CiqCase; r: ReviewTrack }) {
  const t = TRACK_ICON[trackView(c, r)];
  const I = t.icon;
  const decision = r.decision === "approved" ? " · decision Approved" : r.decision === "rejected" ? " · decision Rejected" : "";
  const label = `${DEPT_SHORT[r.dept]}: ${t.label}${decision}`;
  return (
    <span title={label} aria-label={label} className={cx("inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11.5px] font-medium", r.decision === "rejected" ? "border-bad/40 bg-bad-soft text-bad" : "border-line bg-surface-2 text-ink-2")}>
      <I size={11} strokeWidth={2.6} className={t.tone} aria-hidden />
      {r.dept === "MIC" ? "Micro" : r.dept === "SUS" ? "Sust." : DEPT_SHORT[r.dept]}
      {r.decision === "approved" && <BadgeCheck size={12} className="text-ok" aria-hidden />}
      {r.decision === "rejected" && <Ban size={11} className="text-bad" aria-hidden />}
    </span>
  );
}

/** One chip per department track: shape + colour for status (never colour alone), full text on hover. */
export function ReviewChips({ c }: { c: CiqCase }) {
  if (!c.reviews.length) return <span className="text-xs text-ink-3">{isClosed(c) ? "—" : STARTS_AT_COMPLETENESS}</span>;
  return (
    <div className="flex max-w-[260px] min-w-[196px] flex-wrap gap-1">
      {c.reviews.map((r) => (
        <ReviewChip key={r.dept} c={c} r={r} />
      ))}
    </div>
  );
}

export function ReviewLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11.5px] text-ink-3">
      {(Object.keys(TRACK_ICON) as TrackView[]).map((k) => {
        const t = TRACK_ICON[k];
        const I = t.icon;
        return (
          <span key={k} className="inline-flex items-center gap-1">
            <I size={11} strokeWidth={2.6} className={t.tone} aria-hidden />
            {t.label}
          </span>
        );
      })}
      <span className="inline-flex items-center gap-1">
        <BadgeCheck size={12} className="text-ok" aria-hidden /> Decision approved
      </span>
      <span className="inline-flex items-center gap-1">
        <Ban size={11} className="text-bad" aria-hidden /> Decision rejected
      </span>
    </div>
  );
}

export function OpenPointsCell({ c }: { c: CiqCase }) {
  const open = c.openPoints.filter((p) => p.status === "open").length;
  const checking = c.openPoints.filter((p) => p.status === "in-progress").length;
  const late = overduePoints(c).length;
  if (!c.openPoints.length) return <span className="text-xs text-ink-3">None</span>;
  return (
    <div className="whitespace-nowrap">
      {open > 0 ? <TrafficLight status="open" label={`${open} open`} /> : checking > 0 ? <TrafficLight status="in-progress" label={`${checking} to check`} /> : <TrafficLight status="closed" label={`${c.openPoints.length} closed`} />}
      {open > 0 && checking > 0 && <div className="mt-0.5 pl-[42px] text-[11.5px] whitespace-nowrap text-ink-3">+{checking} to check</div>}
      {late > 0 && <div className="mt-0.5 pl-[42px] text-[11.5px] font-medium whitespace-nowrap text-bad">{late} overdue</div>}
    </div>
  );
}

export function DueCell({ c }: { c: CiqCase }) {
  if (isClosed(c)) return <span className="text-xs whitespace-nowrap text-ink-3">Closed {fmtDate(phaseSince(c))}</span>;
  const late = isOverdue(c.dueDate);
  return (
    <div className="whitespace-nowrap">
      <div className={cx("text-[13px]", late ? "font-medium text-bad" : "text-ink")}>{late ? `Overdue ${relDays(c.dueDate).replace(" ago", "")}` : relDays(c.dueDate)}</div>
      <div className="text-[11.5px] text-ink-3">{fmtDate(c.dueDate)}</div>
    </div>
  );
}

export function PersonCell({ state, id, sub }: { state: AppState; id: string; sub?: ReactNode }) {
  const u = userById(state, id);
  if (!u) return <span className="text-ink-3">{id === "system" ? "System" : "—"}</span>;
  return (
    <span className="inline-flex min-w-0 items-center gap-2">
      <Avatar initials={u.initials} side={u.side} size={24} />
      <span className="min-w-0">
        <span className="block truncate text-[13px] text-ink">{u.name}</span>
        {sub && <span className="block truncate text-[11.5px] text-ink-3">{sub}</span>}
      </span>
    </span>
  );
}

/** Tone for an audit action, so a long trail can be scanned. Text always carries the meaning. */
export function auditTone(action: string, by: string, detail = ""): Tone {
  const a = action.toLowerCase();
  if (a.includes("decision")) return detail.startsWith("REJECTED") ? "bad" : detail.startsWith("APPROVED") ? "ok" : "brand";
  if (a.includes("cancel") || a.includes("reject") || a.includes("not accepted") || a.includes("refused")) return "bad";
  if (a.includes("withdrew") || a.includes("withdrawn")) return "neutral";
  if (a.includes("completed") || a.includes("accepted") || a.includes("final release") || a.includes("confirmed")) return "ok";
  if (a.includes("flagged")) return "warn";
  if (a.includes("created") || a.includes("reactivated") || a.includes("extended") || a.includes("generated")) return "brand";
  if (a.includes("query") || a.includes("requested") || a.includes("returned") || a.includes("finding") || a.includes("additional")) return "warn";
  if (by === "system") return "neutral";
  return "info";
}
