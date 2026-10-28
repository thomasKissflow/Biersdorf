// Questionnaire tab of the case page, read-only. A summary bar (how many sections are complete, filters: all, missing
// items, open points, changed after completeness, not applicable), a section navigator grouped like the questionnaire
// (Basic data · Metadata · Chapters · Annexes, the not-applicable sections folded away with their reasons) and, on
// the right, either every section (filtered) or one section in focus. A section shows what it covers, its lead and why
// it is in scope, then its answers as question | answer | answered by and when, its documents, requested documents
// and open points. ?s=<sectionId> opens one section (Customs K7 and Legal K8 get their card with the note box);
// ?s=scope the scope and evidence, ?s=SF the metadata answers. Changes after the completeness confirmation are marked.
import { ArrowLeft, ChevronLeft, ChevronRight, LayoutList, Lock, Route } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { Button, Card, EmptyState, Mono, ProgressBar, Select, cx } from "@/components/ui";
import type { CiqCase } from "@/domain/types";
import { INFORMED_SECTION } from "../shared";
import { DocsOnlyList, FocusSection, MetadataPanel, NaSection, NotApplicableCard, ScopeCard, SectionNotes, SectionPanel, StatusIcon, shortCode, titleOf } from "./QuestionnaireSections";
import { GROUPS, GROUP_LABEL, METADATA_ID, SCOPE_ID, buildOutline, matchesFilter, navOrder, type Outline, type OutlineFilter, type OutlineItem } from "./questionnaireOutline";

const FILTERS: { value: OutlineFilter; label: string; dot?: string }[] = [
  { value: "all", label: "All sections" },
  { value: "missing", label: "Missing items", dot: "bg-warn" },
  { value: "points", label: "With open points", dot: "bg-bad" },
  { value: "changed", label: "Changed after completeness", dot: "bg-warn" },
  { value: "na", label: "Not applicable", dot: "bg-ink-3" },
];

const EMPTY_FILTER: Record<OutlineFilter, string> = {
  all: "No section is open yet. Sections open as the supplier answers the metadata questions.",
  missing: "Nothing is missing: every required answer and requested document is there.",
  points: "No section has an unresolved open point.",
  changed: "The supplier changed nothing after the completeness confirmation.",
  na: "Every section applies to this material.",
};

export function QuestionnaireTab({ c }: { c: CiqCase }) {
  const [params, setParams] = useSearchParams();
  const target = params.get("s");
  const outline = useMemo(() => buildOutline(c), [c]);
  const naTarget = !!target && outline.na.some((s) => s.sectionId === target);
  const [filter, setFilter] = useState<OutlineFilter>("all");
  const [naOpen, setNaOpen] = useState(naTarget);
  const paneRef = useRef<HTMLDivElement>(null);
  const firstScroll = useRef(true);

  // The selection lives in the URL (?s=), so a mail link, the browser's back button and a reload keep it. Picking a
  // section adds a history entry (Back returns to the previous section or to All sections); a filter does not.
  const sel = target === SCOPE_ID || (target && (outline.items.some((i) => i.id === target) || naTarget)) ? target : null;
  const select = (id: string | null, replace = false) => {
    const next = new URLSearchParams(params);
    if (id) next.set("s", id);
    else next.delete("s");
    if (next.toString() !== params.toString()) setParams(next, { replace });
  };
  const chooseFilter = (f: OutlineFilter) => {
    setFilter(f);
    if (f === "na") setNaOpen(true);
    select(null, true);
  };
  const openPoints = () => {
    const next = new URLSearchParams(params);
    next.set("tab", "points");
    next.delete("s");
    setParams(next, { replace: true });
  };

  // A deep link scrolls to its section once it is on the page; a section or filter chosen further down the page starts
  // at the top of the pane. A filter chosen at the top never moves the page.
  useEffect(() => {
    const first = firstScroll.current;
    firstScroll.current = false;
    if (!sel && first) return;
    const t = window.setTimeout(() => {
      const el = paneRef.current;
      if (!el) return;
      const top = el.getBoundingClientRect().top;
      if (top < 64 || (first && top > window.innerHeight * 0.5)) el.scrollIntoView({ behavior: first ? "auto" : "smooth", block: "start" });
    }, 40);
    return () => window.clearTimeout(t);
  }, [sel, filter]);

  return (
    <div className="space-y-4" data-testid="q-tab" data-mode={sel ? "section" : "all"} data-selected={sel ?? ""}>
      <SummaryBar c={c} outline={outline} filter={sel ? null : filter} onFilter={chooseFilter} />
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[272px_minmax(0,1fr)]">
        <Navigator c={c} outline={outline} filter={filter} sel={sel} onSelect={select} naOpen={naOpen} setNaOpen={setNaOpen} />
        <div ref={paneRef} className="min-w-0 scroll-mt-20 space-y-4">
          <MobilePicker c={c} outline={outline} sel={sel} onSelect={select} />
          {sel ? (
            <FocusView c={c} outline={outline} filter={filter} sel={sel} onSelect={select} onOpenPoints={openPoints} />
          ) : (
            <AllView c={c} outline={outline} filter={filter} onSelect={select} onOpenPoints={openPoints} naOpen={naOpen} setNaOpen={setNaOpen} />
          )}
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ summary bar

function SummaryBar({ c, outline, filter, onFilter }: { c: CiqCase; outline: Outline; filter: OutlineFilter | null; onFilter: (f: OutlineFilter) => void }) {
  // Sections only (the metadata block has its own card), so the counts add up to "All sections".
  const sections = outline.items.filter((i) => i.id !== METADATA_ID);
  const counted = sections.filter((i) => i.status === "complete" || i.status === "missing");
  const complete = counted.filter((i) => i.status === "complete").length;
  const docsOnly = sections.filter((i) => i.status === "docs").length;
  const optional = sections.filter((i) => i.status === "optional").length;
  return (
    <Card className="overflow-hidden" data-testid="q-summary">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3 sm:px-5">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5" data-testid="q-summary-complete" data-complete={complete} data-total={counted.length}>
          <div className="w-28 shrink-0">
            <ProgressBar value={complete} max={counted.length || 1} tone={complete === counted.length ? "ok" : "brand"} />
          </div>
          <p className="text-[14px] text-ink">
            <span className="font-semibold tabular-nums">
              {complete} of {counted.length}
            </span>{" "}
            sections with questions complete
            {docsOnly > 0 && <span className="text-[13px] text-ink-3"> · {docsOnly} answered with documents only</span>}
            {optional > 0 && <span className="text-[13px] text-ink-3"> · {optional} with nothing required</span>}
          </p>
        </div>
        <p className="flex items-center gap-1.5 text-[12.5px] text-ink-3">
          <Lock size={12} className="shrink-0" aria-hidden />
          Read-only · <Mono className="text-[12px] text-ink-2">{c.templateVersion}</Mono>
        </p>
      </div>
      <div className="border-t border-line px-4 py-2.5 sm:px-5">
        {/* Phones: one row that scrolls sideways instead of a stack of chips. */}
        <div role="toolbar" aria-label="Show sections" className="-mx-4 flex items-center gap-1.5 overflow-x-auto px-4 pb-0.5 scrollbar-thin sm:mx-0 sm:flex-wrap sm:px-0">
          {FILTERS.filter((f) => f.value !== "changed" || !!outline.since).map((f) => {
            const n = outline.counts[f.value];
            const on = filter === f.value;
            return (
              <button
                key={f.value}
                type="button"
                aria-pressed={on}
                disabled={!n && f.value !== "all"}
                onClick={() => onFilter(f.value)}
                data-testid={`q-filter-${f.value}`}
                data-count={n}
                className={cx(
                  "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[13px] whitespace-nowrap transition-colors disabled:cursor-default disabled:opacity-45",
                  on ? "border-brand/40 bg-brand-soft font-medium text-brand" : "border-line-strong bg-surface text-ink-2 enabled:hover:bg-surface-2 enabled:hover:text-ink",
                )}
              >
                {f.dot && n > 0 && <span aria-hidden className={cx("h-1.5 w-1.5 rounded-full", f.dot)} />}
                {f.label}
                <span className={cx("tabular-nums", on ? "text-brand" : "text-ink-3")}>{n}</span>
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-[12px] text-ink-3">Beiersdorf never changes answers. Every answer shows who entered it and when{outline.since ? "; changes after the completeness confirmation are marked and listed in the History" : ""}.</p>
      </div>
    </Card>
  );
}

// ------------------------------------------------------------------------------------------------ navigator

function navMeta(i: OutlineItem): ReactNode {
  if (i.status === "complete" || i.status === "missing") return <span className={cx("tabular-nums", i.status === "complete" ? "text-ok" : "text-ink-2")}>{`${i.done}/${i.total}`}</span>;
  if (i.status === "docs" && i.docs) return <span className="tabular-nums text-ink-3">{i.docs === 1 ? "1 doc" : `${i.docs} docs`}</span>;
  return null;
}

function NavButton({ id, active, onClick, children, testId, title }: { id?: string; active: boolean; onClick: () => void; children: ReactNode; testId: string; title?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "true" : undefined}
      title={title}
      data-testid={testId}
      data-id={id}
      className={cx("flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] leading-[18px] transition-colors", active ? "bg-brand-soft text-ink" : "text-ink-2 hover:bg-surface-2 hover:text-ink")}
    >
      {children}
    </button>
  );
}

/** Keeps an icon or a dot on the first line of a row whose title may wrap to two lines. */
function Lead({ children }: { children: ReactNode }) {
  return <span className="flex h-[18px] shrink-0 items-center">{children}</span>;
}

function NavItem({ c, i, active, onSelect }: { c: CiqCase; i: OutlineItem; active: boolean; onSelect: (id: string) => void }) {
  const title = titleOf(c, i.id);
  return (
    <NavButton id={i.id} active={active} onClick={() => onSelect(i.id)} testId={`q-outline-${i.id}`} title={`${shortCode(c, i.id)} ${title}`}>
      <Lead>
        <StatusIcon status={i.status} />
      </Lead>
      <span className={cx("w-11 shrink-0 font-mono text-[11px]", active ? "font-medium text-brand" : "text-ink-3")}>{shortCode(c, i.id)}</span>
      <span className={cx("line-clamp-2 min-w-0 flex-1", active ? "font-medium" : (i.status === "docs" || i.status === "optional") && "text-ink-3")}>{title}</span>
      {i.changed && (
        <Lead>
          <span aria-label="changed after completeness" title="Changed after completeness" className="h-1.5 w-1.5 rounded-full bg-warn" />
        </Lead>
      )}
      {i.ops.length > 0 && (
        <span title={`${i.ops.length} unresolved open point${i.ops.length === 1 ? "" : "s"}`} className="mt-px shrink-0 rounded-full bg-bad-soft px-1.5 text-[11px] leading-4 font-semibold text-bad">
          {i.ops.length}
        </span>
      )}
      <span className="shrink-0 text-[11.5px]">{navMeta(i)}</span>
    </NavButton>
  );
}

function GroupLabel({ children, count }: { children: ReactNode; count?: number }) {
  return (
    <p className="flex items-baseline justify-between px-2 pt-3 pb-1 text-[11px] font-semibold tracking-wide text-ink-3 uppercase">
      <span>{children}</span>
      {count !== undefined && <span className="font-normal tabular-nums">{count}</span>}
    </p>
  );
}

function Navigator({ c, outline, filter, sel, onSelect, naOpen, setNaOpen }: { c: CiqCase; outline: Outline; filter: OutlineFilter; sel: string | null; onSelect: (id: string | null) => void; naOpen: boolean; setNaOpen: (v: boolean) => void }) {
  const showNa = naOpen || outline.na.some((s) => s.sectionId === sel);
  const ref = useRef<HTMLElement>(null);
  // The selected row stays in view in the (scrolling) navigator: a deep link to K7 or K8, Previous / Next. Only the
  // navigator scrolls, never the page.
  useEffect(() => {
    const nav = ref.current;
    const row = nav?.querySelector<HTMLElement>('[aria-current="true"]');
    if (!nav || !row || nav.scrollHeight <= nav.clientHeight) return;
    const n = nav.getBoundingClientRect();
    const r = row.getBoundingClientRect();
    if (r.top < n.top || r.bottom > n.bottom) nav.scrollTop += r.top - n.top - (n.height - r.height) / 2;
  }, [sel, filter, showNa]);
  return (
    <nav
      ref={ref}
      aria-label="Questionnaire sections"
      data-testid="q-outline"
      className="hidden rounded-card border border-line bg-surface p-2 shadow-card scrollbar-thin xl:sticky xl:top-[calc(var(--app-header-h,56px)_+_24px)] xl:block xl:max-h-[calc(100vh_-_var(--app-header-h,56px)_-_40px)] xl:self-start xl:overflow-y-auto"
    >
      <NavButton active={!sel} onClick={() => onSelect(null)} testId="q-outline-all">
        <Lead>
          <LayoutList size={15} className="text-ink-3" aria-hidden />
        </Lead>
        <span className="min-w-0 flex-1 truncate">{FILTERS.find((f) => f.value === filter)?.label}</span>
        <span className="shrink-0 text-[11.5px] text-ink-3 tabular-nums">{outline.counts[filter]}</span>
      </NavButton>
      <NavButton active={sel === SCOPE_ID} onClick={() => onSelect(SCOPE_ID)} testId="q-outline-scope">
        <Lead>
          <Route size={15} className="text-ink-3" aria-hidden />
        </Lead>
        <span className="min-w-0 flex-1 truncate">Scope and evidence</span>
      </NavButton>
      {filter !== "na" &&
        GROUPS.map((g) => {
          const items = outline.items.filter((i) => i.group === g && matchesFilter(i, filter));
          if (!items.length) return null;
          return (
            <div key={g} data-testid={`q-outline-group-${g}`}>
              <GroupLabel count={g === "chapter" || g === "annex" ? items.length : undefined}>{GROUP_LABEL[g]}</GroupLabel>
              <div className="space-y-px">
                {items.map((i) => (
                  <NavItem key={i.id} c={c} i={i} active={sel === i.id} onSelect={onSelect} />
                ))}
              </div>
            </div>
          );
        })}
      {outline.na.length > 0 && (
        <div className="mt-2 border-t border-line pt-1" data-testid="q-outline-group-na">
          <button type="button" onClick={() => setNaOpen(!showNa)} aria-expanded={showNa} className="flex w-full items-center justify-between gap-2 rounded-lg px-2 pt-2 pb-1 text-left text-[11px] font-semibold tracking-wide text-ink-3 uppercase hover:text-ink" data-testid="q-outline-na-toggle">
            <span>Not applicable</span>
            <span className="flex items-center gap-1 font-normal tabular-nums">
              {outline.na.length}
              <ChevronRight size={13} className={cx("transition-transform", showNa && "rotate-90")} aria-hidden />
            </span>
          </button>
          {showNa && (
            <div className="space-y-px">
              {outline.na.map((s) => (
                <NavButton key={s.sectionId} id={s.sectionId} active={sel === s.sectionId} onClick={() => onSelect(s.sectionId)} testId={`q-outline-${s.sectionId}`} title={`${shortCode(c, s.sectionId)} ${titleOf(c, s.sectionId)}: ${s.reason}`}>
                  <Lead>
                    <StatusIcon status="na" />
                  </Lead>
                  <span className="w-11 shrink-0 font-mono text-[11px] text-ink-3">{shortCode(c, s.sectionId)}</span>
                  <span className="line-clamp-2 min-w-0 flex-1 text-ink-3">{titleOf(c, s.sectionId)}</span>
                </NavButton>
              ))}
            </div>
          )}
        </div>
      )}
    </nav>
  );
}

/** Phones and narrow windows: the navigator as one grouped picker. */
function MobilePicker({ c, outline, sel, onSelect }: { c: CiqCase; outline: Outline; sel: string | null; onSelect: (id: string | null) => void }) {
  const STATUS_WORD = { complete: "complete", missing: "missing items", optional: "optional", docs: "documents only" } as const;
  return (
    <div className="xl:hidden" data-testid="q-picker">
      <Select value={sel ?? ""} onChange={(e) => onSelect(e.target.value || null)} aria-label="Section" data-testid="q-section-select">
        <option value="">All sections · {outline.counts.all}</option>
        <option value={SCOPE_ID}>Scope and evidence</option>
        {GROUPS.map((g) => {
          const items = outline.items.filter((i) => i.group === g);
          if (!items.length) return null;
          return (
            <optgroup key={g} label={GROUP_LABEL[g]}>
              {items.map((i) => (
                <option key={i.id} value={i.id}>
                  {`${shortCode(c, i.id)} ${titleOf(c, i.id)} · ${STATUS_WORD[i.status]}${i.ops.length ? ` · ${i.ops.length} open point${i.ops.length === 1 ? "" : "s"}` : ""}${i.changed ? " · changed" : ""}`}
                </option>
              ))}
            </optgroup>
          );
        })}
        {outline.na.length > 0 && (
          <optgroup label="Not applicable">
            {outline.na.map((s) => (
              <option key={s.sectionId} value={s.sectionId}>
                {`${shortCode(c, s.sectionId)} ${titleOf(c, s.sectionId)}`}
              </option>
            ))}
          </optgroup>
        )}
      </Select>
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ the right pane

/** Customs (K7) and Legal (K8) write their notes on their section's card, whatever the section holds. */
const NOTE_SECTIONS = new Set(Object.values(INFORMED_SECTION));

function SectionBody({ c, outline, item, focused, onSelect, onOpenPoints }: { c: CiqCase; outline: Outline; item: OutlineItem; focused?: boolean; onSelect: (id: string) => void; onOpenPoints: () => void }) {
  if (item.id === METADATA_ID) return <MetadataPanel c={c} item={item} onOpenPoints={onOpenPoints} />;
  if (item.status === "docs") return focused ? <FocusSection c={c} item={item} /> : <DocsOnlyList c={c} items={[item]} title={titleOf(c, item.id)} onSelect={onSelect} />;
  return <SectionPanel c={c} item={item} since={outline.since} focused={focused} onOpenPoints={onOpenPoints} footer={focused && NOTE_SECTIONS.has(item.id) ? <SectionNotes c={c} item={item} /> : undefined} />;
}

function AllView({ c, outline, filter, onSelect, onOpenPoints, naOpen, setNaOpen }: { c: CiqCase; outline: Outline; filter: OutlineFilter; onSelect: (id: string) => void; onOpenPoints: () => void; naOpen: boolean; setNaOpen: (v: boolean) => void }) {
  if (filter === "na") return outline.na.length ? <NotApplicableCard c={c} rows={outline.na} open={naOpen} setOpen={setNaOpen} /> : <Empty text={EMPTY_FILTER.na} />;
  const shown = outline.items.filter((i) => matchesFilter(i, filter));
  const noSections = outline.counts.all === 0;
  return (
    <>
      {filter === "all" && <ScopeCard c={c} />}
      {GROUPS.map((g) => {
        const items = shown.filter((i) => i.group === g);
        if (!items.length) return null;
        const full = items.filter((i) => i.status !== "docs");
        const docs = items.filter((i) => i.status === "docs");
        return (
          <section key={g} className="space-y-3" data-testid={`q-group-${g}`} aria-label={GROUP_LABEL[g]}>
            <h2 className="flex items-baseline gap-2 px-1 pt-2 text-[12px] font-semibold tracking-wide text-ink-3 uppercase">
              {GROUP_LABEL[g]}
              {(g === "chapter" || g === "annex") && <span className="font-normal tabular-nums">· {items.length}</span>}
            </h2>
            {full.map((i) => (
              <SectionBody key={i.id} c={c} outline={outline} item={i} onSelect={onSelect} onOpenPoints={onOpenPoints} />
            ))}
            {docs.length > 0 && <DocsOnlyList c={c} items={docs} title={g === "annex" ? "Annexes answered with documents" : g === "basic" ? "Basic data answered with documents" : "Chapters answered with documents"} onSelect={onSelect} />}
          </section>
        );
      })}
      {(noSections || (filter !== "all" && !shown.length)) && <Empty text={EMPTY_FILTER[noSections ? "all" : filter]} />}
      {filter === "all" && outline.na.length > 0 && <NotApplicableCard c={c} rows={outline.na} open={naOpen} setOpen={setNaOpen} />}
    </>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <Card>
      <EmptyState title="Nothing to show">{text}</EmptyState>
    </Card>
  );
}

function FocusView({ c, outline, filter, sel, onSelect, onOpenPoints }: { c: CiqCase; outline: Outline; filter: OutlineFilter; sel: string; onSelect: (id: string | null) => void; onOpenPoints: () => void }) {
  // Previous / Next follow the navigator: the filtered list when the section is in it, else every section.
  const filtered = navOrder(outline, filter);
  const order = filtered.includes(sel) ? filtered : sel === SCOPE_ID ? [SCOPE_ID, ...navOrder(outline, "all")] : outline.na.some((s) => s.sectionId === sel) ? navOrder(outline, "na") : navOrder(outline, "all");
  const idx = order.indexOf(sel);
  const prev = idx > 0 ? order[idx - 1] : undefined;
  const next = idx >= 0 && idx < order.length - 1 ? order[idx + 1] : undefined;
  const item = outline.items.find((i) => i.id === sel);
  const na = outline.na.find((s) => s.sectionId === sel);
  const label = (id: string) => (id === SCOPE_ID ? "Scope and evidence" : `${shortCode(c, id)} ${titleOf(c, id)}`);
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2" data-testid="q-focus-bar">
        <Button variant="ghost" size="sm" icon={<ArrowLeft size={14} />} onClick={() => onSelect(null)} data-testid="q-show-all">
          All sections
        </Button>
      </div>
      {sel === SCOPE_ID ? <ScopeCard c={c} /> : item ? <SectionBody c={c} outline={outline} item={item} focused onSelect={onSelect} onOpenPoints={onOpenPoints} /> : na ? <NaSection c={c} s={na} /> : null}
      {(prev || next) && (
        <div className="grid grid-cols-2 gap-3" data-testid="q-prev-next">
          <div className="min-w-0">
            {prev && (
              <button type="button" onClick={() => onSelect(prev)} className="group flex w-full min-w-0 items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-left shadow-card transition-colors hover:bg-surface-2" data-testid="q-prev">
                <ChevronLeft size={16} className="shrink-0 text-ink-3" aria-hidden />
                <span className="min-w-0">
                  <span className="block text-[11.5px] text-ink-3">Previous</span>
                  <span className="block truncate text-[13px] font-medium text-ink">{label(prev)}</span>
                </span>
              </button>
            )}
          </div>
          <div className="min-w-0">
            {next && (
              <button type="button" onClick={() => onSelect(next)} className="group flex w-full min-w-0 items-center justify-end gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-right shadow-card transition-colors hover:bg-surface-2" data-testid="q-next">
                <span className="min-w-0">
                  <span className="block text-[11.5px] text-ink-3">Next</span>
                  <span className="block truncate text-[13px] font-medium text-ink">{label(next)}</span>
                </span>
                <ChevronRight size={16} className="shrink-0 text-ink-3" aria-hidden />
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
}
