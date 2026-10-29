// The questionnaire: sticky section navigator (only sections that apply) + the selected section.
// Selection lives in the URL (?s=K2.1&f=FLD-…) so tasks and the completeness check can deep-link.
// Live-scope cases (D-1): the metadata questions are the second General entry (?s=SF), and the sections follow the
// answers live; sections that just opened carry a "New" marker until the supplier opens them.
import { CheckCircle2, Circle, CircleDot, FileText, Info, Lock } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Badge, Select, cx } from "@/components/ui";
import { sectionUploadRequired, sectionUploadStatus, sectionUploads } from "@/domain/requestedDocs";
import type { CiqCase } from "@/domain/types";
import { CompletenessHeader } from "./Completeness";
import { METADATA_SECTION, firstOpenEntry, isLiveScope, navEntries, navProgress, requestedRefs, sectionCode, sectionCodeShown, sectionKind, sectionLabelOf, sectionMeta, sectionTitle, supplierSections, type SupplierSection } from "./lib";
import { MetadataQuestions } from "./MetadataQuestions";
import { SectionPanel } from "./SectionPanel";

/** v2 (BRM v2 REQ-PROC-016): answers stay editable until the final release is requested (locked from then on, Thomas
 *  15 Oct: the request page passes `locked`). `confirmable` shows the completeness
 *  check and confirmation, which is only offered before completeness was confirmed. */
export function Questionnaire({ c, locked, confirmable = !locked }: { c: CiqCase; locked: boolean; confirmable?: boolean }) {
  const [params, setParams] = useSearchParams();
  const sections = supplierSections(c); // real sections ("N sections apply")
  const entries = navEntries(c); // navigator order; the metadata entry only on live-scope cases
  const requested = requestedRefs(c);
  const topRef = useRef<HTMLDivElement>(null);
  const fresh = useFreshSections(c, sections);

  const fallback = locked ? (entries.find((s) => requested.sections.has(s.sectionId)) ?? entries[0]) : (firstOpenEntry(c) ?? entries[0]);
  const wanted = params.get("s");
  const sel = entries.find((s) => s.sectionId === wanted) ?? fallback;
  // A link (task, e-mail) to a section the answers have closed since: say so instead of switching silently (SUP-31).
  const gone = isLiveScope(c) && !!wanted && wanted !== sel?.sectionId && c.scope.some((x) => x.sectionId === wanted) ? wanted : null;
  const idx = entries.findIndex((s) => s.sectionId === sel?.sectionId);

  const select = (sectionId: string, fieldId?: string, rowId?: string) => {
    setParams(
      (prev) => {
        const n = new URLSearchParams(prev);
        n.set("s", sectionId);
        n.delete("row");
        n.delete("f");
        // a K2.1 component row (a completeness blocker on it) opens that row; else a question, or the section's top
        if (rowId) n.set("row", rowId);
        else if (fieldId) n.set("f", fieldId);
        return n;
      },
      { replace: true },
    );
  };

  // keep the top of the section in view when switching sections from the navigator
  const selId = sel?.sectionId;
  const { seen } = fresh;
  useEffect(() => {
    if (selId) seen(selId); // a new section counts as seen once it is open, however it was opened
  }, [selId, seen]);
  const navRef = useRef<HTMLElement>(null);
  // keep the active entry visible inside the (scrolling) navigator, e.g. after "Next" from the last sections
  useEffect(() => {
    const box = navRef.current;
    const item = box?.querySelector<HTMLElement>('[aria-current="true"]');
    if (!box || !item || box.scrollHeight <= box.clientHeight) return;
    const b = box.getBoundingClientRect();
    const r = item.getBoundingClientRect();
    if (r.top < b.top + 8) box.scrollBy({ top: r.top - b.top - 48, behavior: "smooth" });
    else if (r.bottom > b.bottom - 8) box.scrollBy({ top: r.bottom - b.bottom + 48, behavior: "smooth" });
  }, [selId]);
  const focusField = params.get("f");
  const focusRow = params.get("row");
  useEffect(() => {
    if (focusField || focusRow) return;
    const el = topRef.current;
    if (el && el.getBoundingClientRect().top < 120) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 128, behavior: "smooth" });
  }, [selId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!sel) return null;

  // Sections as the case's own questionnaire version defines them (spec §8.1).
  const tv = c.templateVersion;
  const groups: { title: string; items: SupplierSection[] }[] = [
    { title: "General", items: entries.filter((s) => sectionKind(s.sectionId, tv) === "basic") },
    { title: "Chapters", items: entries.filter((s) => sectionKind(s.sectionId, tv) === "chapter") },
    { title: "Annexes", items: entries.filter((s) => sectionKind(s.sectionId, tv) === "annex") },
  ].filter((g) => g.items.length);

  return (
    <div className="space-y-5" data-testid="q-root" data-template-version={c.templateVersion}>
      {confirmable && <CompletenessHeader c={c} onJump={select} />}
      <div ref={topRef} className="grid grid-cols-1 gap-6 lg:grid-cols-[272px_minmax(0,1fr)]">
        {/* Mobile: compact selector, grouped like the desktop navigator */}
        <div className="lg:hidden">
          <Select value={sel.sectionId} onChange={(e) => select(e.target.value)} aria-label="Section">
            {groups.map((g) => (
              <optgroup key={g.title} label={g.title}>
                {g.items.map((s) => (
                  <option key={s.sectionId} value={s.sectionId}>
                    {sectionLabelOf(s.sectionId, tv)}
                    {fresh.has(s.sectionId) ? " (new)" : ""}
                  </option>
                ))}
              </optgroup>
            ))}
          </Select>
        </div>
        {/* The card itself is the scroll box, so its border and rounded corners stay visible while the list scrolls. */}
        <nav
          ref={navRef}
          aria-label="Questionnaire sections"
          className="hidden rounded-card border border-line bg-surface shadow-card scrollbar-thin lg:sticky lg:top-[calc(var(--app-header-h,108px)_+_16px)] lg:block lg:max-h-[calc(100vh_-_var(--app-header-h,108px)_-_32px)] lg:self-start lg:overflow-y-auto"
        >
          <div className="p-2">
            <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 px-2 pt-1.5 pb-1 text-[12px] text-ink-3">
              <span>{sections.length === 1 ? "1 section applies" : `${sections.length} sections apply`} to this material</span>
              {locked && (
                <span className="inline-flex items-center gap-1">
                  <Lock size={11} /> read-only
                </span>
              )}
            </p>
            {groups.map((g) => (
              <div key={g.title} className="mt-1.5">
                <p className="px-2 pt-1.5 pb-1 text-[11px] font-semibold tracking-wide text-ink-3 uppercase">{g.title}</p>
                <ul className="space-y-0.5">
                  {g.items.map((s) => (
                    <NavItem key={s.sectionId} c={c} s={s} active={s.sectionId === sel.sectionId} requested={requested.sections.has(s.sectionId)} fresh={fresh.has(s.sectionId)} onClick={() => select(s.sectionId)} />
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </nav>
        <div className="min-w-0 space-y-3">
          {gone && (
            <p className="flex items-start gap-2 rounded-lg border border-line bg-surface-2 px-3 py-2 text-[12.5px] text-ink-2" role="status" data-testid="section-no-longer-applies">
              <Info size={14} className="mt-0.5 shrink-0 text-ink-3" />
              <span>
                {sectionCode(gone, tv)} {sectionTitle(gone, tv)} no longer applies to your answers. Your entries there are kept and come back if it reopens.
              </span>
            </p>
          )}
          {sel.sectionId === METADATA_SECTION ? (
            <MetadataQuestions c={c} locked={locked} focusField={focusField} prev={entries[idx - 1]} next={entries[idx + 1]} onSelect={(id) => select(id)} />
          ) : (
            <SectionPanel c={c} sec={sel} locked={locked} requested={requested} focusField={focusField} focusRow={focusRow} prev={entries[idx - 1]} next={entries[idx + 1]} onSelect={(id) => select(id)} />
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Sections that opened while the supplier is on the page (live-scope cases): marked "New" until opened. Tracks the
 * visible section ids, so it catches every scope change the store makes, whatever caused it.
 */
function useFreshSections(c: CiqCase, sections: SupplierSection[]) {
  const live = isLiveScope(c);
  const ids = sections.map((s) => s.sectionId);
  const key = ids.join("|");
  const last = useRef<{ caseId: string; ids: string[] } | null>(null);
  const [fresh, setFresh] = useState<ReadonlySet<string>>(new Set());
  useEffect(() => {
    const prev = last.current;
    last.current = { caseId: c.id, ids };
    if (!live || !prev || prev.caseId !== c.id) {
      setFresh((f) => (f.size ? new Set() : f));
      return;
    }
    const opened = ids.filter((id) => !prev.ids.includes(id));
    const closed = prev.ids.filter((id) => !ids.includes(id));
    if (!opened.length && !closed.length) return;
    setFresh((f) => new Set([...f, ...opened].filter((id) => !closed.includes(id))));
  }, [c.id, key, live]); // eslint-disable-line react-hooks/exhaustive-deps
  const seen = useCallback((id: string) => setFresh((f) => (f.has(id) ? new Set([...f].filter((x) => x !== id)) : f)), []);
  return { has: (id: string) => fresh.has(id), seen };
}

function NavItem({ c, s, active, requested, fresh, onClick }: { c: CiqCase; s: SupplierSection; active: boolean; requested: boolean; fresh: boolean; onClick: () => void }) {
  const tv = c.templateVersion;
  const def = sectionMeta(s.sectionId, tv);
  const meta = s.sectionId === METADATA_SECTION;
  const p = navProgress(c, s);
  const complete = p.total > 0 && p.done >= p.total;
  // Chapters answered with documents only (the CIQ template document, a statement or a certificate): never blocking,
  // unless the questionnaire version requires the upload for a mandatory section ("Documents · mandatory upload") or
  // the rules ask for a requested document there (then counted like a question).
  const upload = !def.hasFields && !s.waived && sectionUploadRequired(c, s.sectionId);
  const template = !def.hasFields && !s.waived && p.total === 0;
  const docCount = template || upload ? sectionUploads(c, s.sectionId).length : 0;
  const uploadDetail = () => {
    if (p.total > 1) return complete ? "complete" : `${p.done} of ${p.total}`;
    const st = sectionUploadStatus(c, s.sectionId);
    return st === "received" ? `${docCount} document${docCount === 1 ? "" : "s"} added` : st === "justified" ? "justification given" : "mandatory upload";
  };
  const kind = s.waived ? "Waived" : template ? "Documents only" : upload ? "Documents" : s.applicability === "mandatory" ? "Mandatory" : "Optional";
  const detail = meta
    ? complete
      ? "all answered"
      : `${p.done} of ${p.total} answered`
    : s.waived
      ? complete
        ? "justification given"
        : "justification needed"
      : template
        ? docCount
          ? `${docCount} document${docCount === 1 ? "" : "s"} added`
          : "optional upload"
        : upload
          ? uploadDetail()
          : p.total === 0
          ? c.config.SF01?.length
            ? "nothing to answer"
            : "opens with your origin answer"
          : complete
          ? "complete"
          : `${p.done} of ${p.total}`;
  const addedLater = isLiveScope(c) && !!s.addedLater;
  return (
    <li>
      <button
        onClick={onClick}
        data-testid={`q-nav-${s.sectionId}`}
        title={`${sectionLabelOf(s.sectionId, tv)}${addedLater ? " · added after your completeness confirmation" : ""}`}
        aria-current={active ? "true" : undefined}
        className={cx("flex w-full items-start gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors", active ? "bg-brand-soft" : "hover:bg-surface-2")}
      >
        <span className="mt-0.5 shrink-0">
          {complete ? (
            <CheckCircle2 size={15} className="text-ok" aria-label="Complete" />
          ) : template ? (
            <FileText size={15} className="text-ink-3" aria-label="Documents only" />
          ) : p.done > 0 ? (
            <CircleDot size={15} className="text-brand" aria-label="In progress" />
          ) : (
            <Circle size={15} className="text-ink-3" aria-label="Not started" />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-1.5">
            {sectionCodeShown(s.sectionId, tv) && <span className="shrink-0 font-mono text-[11px] text-ink-3">{def.code}</span>}
            <span className={cx("truncate text-[13px]", active ? "font-semibold text-brand" : "text-ink")}>{def.title}</span>
            {fresh && (
              <Badge tone="ok" className="ml-auto shrink-0 self-center">
                New
              </Badge>
            )}
          </span>
          <span className="flex flex-wrap items-center gap-x-1.5 text-[11.5px] text-ink-3">
            {kind} · {detail}
            {addedLater && <span className="font-medium text-ok">· added later</span>}
            {requested && <span className="font-medium text-violet">· requested</span>}
          </span>
        </span>
      </button>
    </li>
  );
}
