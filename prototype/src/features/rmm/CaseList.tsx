// Cases (/cases): the register of every CIQ case for all internal roles. Read-only except RMM's "New case"; a row
// opens the case page (reviewers with a task on the case open their review; Customs and Legal open their section).
// Phones (< 768 px, Thomas 30 Oct): the tabs scroll sideways, the search stays on the page and the other filters move
// into a sheet ("Filters", with the number set); each case is a card with the same test id as its table row.
import { FilePlus2, FolderSearch, Search, X } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Avatar, Button, Card, CardList, CardListItem, EmptyState, Mono, PageHeader, Select, Table, Tabs, Td, TextInput, Toggle, Tr, cx } from "@/components/ui";
import { PhaseBadge } from "@/components/status";
import { DEPT_LABEL, ORIGIN_LABEL, SECTION_BY_ID } from "@/domain/catalog";
import { isClosed, sectionProgress, supplierName, userById, waitingOn } from "@/domain/selectors";
import type { CiqCase, Dept, OriginType } from "@/domain/types";
import { useIsPhone } from "@/shell/useLayoutMode";
import { useStore } from "@/store/store";
import { CASE_TAB_TEST, caseMatches, type CaseTabKey } from "./caseFilters";
import { PHONE_FIELDS, PhoneFilters, usePhoneTabs } from "./phone";
import { CaseCell, DueCell, INFORMED_SECTION, OpenPointsCell, OriginFlag, ReviewChips, ReviewLegend, canManage, caseHref, caseOverdue, phaseSince } from "./shared";

const TAB_HINT: Record<CaseTabKey, string> = {
  open: "Every case that is not completed or cancelled.",
  part1: "Part 1: the supplier fills in the CIQ and confirms completeness.",
  part2: "Part 2: RMM and the departments review, then the supplier gives the final release.",
  completed: "Released by the supplier and completed. The final document is on each case.",
  cancelled: "Cancelled by RMM. RMM can reactivate a case within 12 months.",
};

const INVOLVED: Dept[] = ["REG", "SAF", "QM", "MIC", "SUS", "CUS", "LEG"];
const ORIGINS = Object.keys(ORIGIN_LABEL) as OriginType[];

export function CaseList() {
  const { state, persona, me } = useStore();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const rawTab = params.get("tab") as CaseTabKey | null;
  const tab: CaseTabKey = rawTab && rawTab in CASE_TAB_TEST ? rawTab : "open";
  const q = params.get("q") ?? "";
  const supplier = params.get("supplier") ?? "";
  const dept = params.get("dept") ?? "";
  const waiting = params.get("waiting") ?? "";
  const owner = params.get("owner") ?? "";
  const origin = params.get("origin") ?? "";
  const overdue = params.get("overdue") === "1";
  const rmm = canManage(persona);
  const ownSection = persona.dept ? INFORMED_SECTION[persona.dept] : undefined;
  const phone = useIsPhone();
  const tabsUi = usePhoneTabs(phone, tab);

  const set = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    setParams(next, { replace: true });
  };
  const anyFilter = !!(q || supplier || dept || waiting || owner || origin || overdue);
  const clear = () => setParams(tab === "open" ? {} : { tab }, { replace: true });

  const ownerId = owner === "me" ? me.id : owner;
  const filtered = state.cases.filter((c) => {
    if (!caseMatches(state, c, q)) return false;
    if (supplier && c.supplierId !== supplier) return false;
    if (dept && !c.reviews.some((r) => r.dept === dept) && !c.informed.includes(dept as never)) return false;
    if (waiting && waitingOn(c) !== waiting) return false;
    if (ownerId && c.ownerId !== ownerId) return false;
    if (origin && !(c.config.SF01 ?? []).includes(origin as OriginType)) return false;
    if (overdue && !caseOverdue(c)) return false;
    return true;
  });
  const rows = filtered
    .filter(CASE_TAB_TEST[tab])
    .sort((a, b) => (isClosed(a) || isClosed(b) ? phaseSince(b).localeCompare(phaseSince(a)) : Number(caseOverdue(b)) - Number(caseOverdue(a)) || a.dueDate.localeCompare(b.dueDate)));

  const count = (k: CaseTabKey) => filtered.filter(CASE_TAB_TEST[k]).length;
  const tabs: { value: CaseTabKey; label: string }[] = [
    { value: "open", label: "Open" },
    { value: "part1", label: "Part 1" },
    { value: "part2", label: "Part 2" },
    { value: "completed", label: "Completed" },
    { value: "cancelled", label: "Cancelled" },
  ];
  // An empty tab points to where the cases are (e.g. the demo's only case moved to Completed).
  const EMPTY_TITLE: Record<CaseTabKey, string> = { open: "No open case", part1: "No case in Part 1", part2: "No case in Part 2", completed: "No completed case yet", cancelled: "No cancelled case" };
  const other = tabs.find((t) => t.value !== tab && t.value !== "open" && count(t.value) > 0);
  const rmmUsers = state.users.filter((u) => u.side === "internal" && u.dept === "RMM");
  const reviewer = !rmm && !!persona.dept && !ownSection;

  const subtitle = rmm
    ? "Every CIQ case at Beiersdorf: its phase, who the next step is with, and the review status of RMM and each department."
    : ownSection
      ? `Every CIQ case, read-only. ${DEPT_LABEL[persona.dept!]} is informed: a case opens on ${SECTION_BY_ID[ownSection]?.code ?? ownSection}, which is part of every case.`
      : reviewer
        ? "Every CIQ case, read-only. Rows where your department has a review task open your review."
        : "Every CIQ case, read-only.";

  if (!state.cases.length) {
    return (
      <div className="space-y-5">
        <PageHeader title="Cases" subtitle={subtitle} />
        <Card data-testid="empty-cases">
          <EmptyState
            icon={<FolderSearch size={28} />}
            title="No CIQ case yet"
            action={
              rmm ? (
                <Button variant="primary" icon={<FilePlus2 size={16} />} onClick={() => nav("/cases/new")} data-testid="new-case" className={phone ? "h-11" : undefined}>
                  New case
                </Button>
              ) : undefined
            }
          >
            {rmm ? "Start the first one: choose the supplier, the material and the target markets." : "Cases appear here once Raw Material Management starts one."}
          </EmptyState>
        </Card>
      </div>
    );
  }

  // The filter controls, shared by the desktop card and the phone's sheet.
  const searchBox = (
    <div className={cx("relative", phone ? "min-w-0" : "min-w-[min(100%,240px)]", "flex-1")}>
      <Search size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-3" aria-hidden />
      <TextInput
        aria-label={phone ? "Search cases by case ID, material, INCI, BDF material no., supplier or DUNS" : "Search cases"}
        // a phone: a placeholder that fits, the full hint in the field's name
        placeholder={phone ? "Search cases" : "Search case ID, material, INCI, BDF material no., supplier or DUNS…"}
        value={q}
        onChange={(e) => set("q", e.target.value)}
        className="pl-9"
        data-testid="cases-search"
      />
    </div>
  );
  const overdueToggle = <Toggle checked={overdue} onChange={(v) => set("overdue", v ? "1" : "")} label="Overdue only" data-testid="cases-overdue" />;
  const dropdowns = (
    <>
      <FilterSelect label="Supplier" value={supplier} onChange={(v) => set("supplier", v)}>
        <option value="">All suppliers</option>
        {[...state.suppliers]
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
      </FilterSelect>
      <FilterSelect label="Department involved" value={dept} onChange={(v) => set("dept", v)}>
        <option value="">Any department</option>
        {INVOLVED.map((d) => (
          <option key={d} value={d}>
            {DEPT_LABEL[d]}
            {d === "CUS" || d === "LEG" ? " (informed)" : ""}
          </option>
        ))}
      </FilterSelect>
      <FilterSelect label="Waiting on" value={waiting} onChange={(v) => set("waiting", v)}>
        <option value="">Anyone</option>
        <option value="supplier">Supplier</option>
        <option value="bdf">Beiersdorf</option>
      </FilterSelect>
      <FilterSelect label="Origin (SF-01)" value={origin} onChange={(v) => set("origin", v)}>
        <option value="">Any origin</option>
        {ORIGINS.map((o) => (
          <option key={o} value={o}>
            {ORIGIN_LABEL[o]}
          </option>
        ))}
      </FilterSelect>
      <FilterSelect label="Owner" value={owner} onChange={(v) => set("owner", v)}>
        <option value="">Any owner</option>
        {rmmUsers.map((u) => (
          <option key={u.id} value={u.id === me.id ? "me" : u.id}>
            {u.name}
            {u.id === me.id ? " (me)" : ""}
          </option>
        ))}
      </FilterSelect>
    </>
  );
  const emptyView = (
    <div data-testid="empty-cases-view">
      <EmptyState
        icon={<FolderSearch size={28} />}
        title={anyFilter ? "No cases match these filters" : EMPTY_TITLE[tab]}
        action={
          anyFilter ? (
            <Button variant="secondary" onClick={clear}>
              Clear filters
            </Button>
          ) : other ? (
            <Button variant="secondary" onClick={() => set("tab", other.value)} data-testid="cases-empty-go">
              Show {other.label}
            </Button>
          ) : undefined
        }
      >
        {anyFilter
          ? "Try a broader search or remove a filter. The counts on the tabs above show where matching cases are."
          : other
            ? `${count(other.value) === 1 ? "1 case is" : `${count(other.value)} cases are`} in ${other.label}.`
            : tab === "cancelled"
              ? "Cancelled cases appear here; RMM can reactivate them within 12 months."
              : "Cases move here as they progress."}
      </EmptyState>
    </div>
  );
  const countNote = (
    <span className="text-[12.5px] text-ink-3" data-testid="cases-count" data-count={rows.length}>
      Showing {rows.length} of {state.cases.length} {state.cases.length === 1 ? "case" : "cases"}
    </span>
  );
  // the phone's "Filters" count: every filter but the search, which stays on the page
  const phoneFilters = [supplier, dept, waiting, owner, origin, overdue ? "1" : ""].filter(Boolean).length;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Cases"
        subtitle={subtitle}
        actions={
          rmm && (
            <Button variant="primary" icon={<FilePlus2 size={16} />} onClick={() => nav("/cases/new")} data-testid="new-case" className={phone ? "h-11" : undefined}>
              New case
            </Button>
          )
        }
      />

      <div ref={tabsUi.ref}>
        <Tabs
          tabs={tabs.map((t) => ({ value: t.value, label: <span data-testid={`cases-tab-${t.value}`}>{t.label}</span>, count: count(t.value) }))}
          value={tab}
          onChange={(v) => set("tab", v === "open" ? "" : v)}
          className={tabsUi.className}
        />
        <p className="mt-2 text-[12.5px] text-ink-3">{TAB_HINT[tab]}</p>
      </div>

      {phone ? (
        <>
          <div className={cx("flex items-center gap-2", PHONE_FIELDS)}>
            {searchBox}
            <PhoneFilters data-testid="cases-filters" active={phoneFilters} onClear={clear} clearTestId="cases-clear" results={rows.length === 1 ? "Show 1 case" : `Show ${rows.length} cases`}>
              <div className="flex min-h-11 items-center">{overdueToggle}</div>
              {dropdowns}
            </PhoneFilters>
          </div>
          {rows.length === 0 ? (
            <Card>{emptyView}</Card>
          ) : (
            <div className="space-y-3">
              <CardList label="Cases" data-testid="cases-cards">
                {rows.map((c) => (
                  <CaseCard key={c.id} c={c} ownSection={ownSection} onOpen={() => nav(caseHref(persona, c))} />
                ))}
              </CardList>
              <div className="space-y-2 px-1">
                {countNote}
                {!ownSection && <ReviewLegend />}
              </div>
            </div>
          )}
        </>
      ) : (
        <Card>
          {/* Search + switches on one row, the dropdowns on an even grid below: each filter gets the same width, a chosen
              value is not cut off, and "Clear" appearing never reflows the dropdowns. */}
          <div className="space-y-3 border-b border-line p-3">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              {searchBox}
              <div className="flex h-9 items-center gap-3">
                {overdueToggle}
                {anyFilter && (
                  <Button variant="ghost" size="sm" icon={<X size={14} />} onClick={clear} data-testid="cases-clear">
                    Clear
                  </Button>
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
              {dropdowns}
            </div>
          </div>

          {rows.length === 0 ? (
            emptyView
          ) : (
            <>
              <div className="[&_td]:px-3 [&_th]:px-3">
                <Table head={["Case", "Supplier", "Phase · waiting on", ownSection ? `Your section (${SECTION_BY_ID[ownSection]?.code ?? ownSection})` : "Reviews (RMM + departments)", "Open points", "Due", "Owner"]}>
                  {rows.map((c) => (
                    <Tr key={c.id} onClick={() => nav(caseHref(persona, c))} data-testid={`case-row-${c.id}`} data-phase={c.phase}>
                      <Td className="max-w-[220px] min-w-[180px]">
                        <CaseCell c={c} />
                      </Td>
                      <Td className="max-w-[160px] min-w-[120px]">
                        <span className="line-clamp-2 text-[12.5px] text-ink-2">{supplierName(state, c.supplierId)}</span>
                        <span className="block font-mono text-[11px] text-ink-3">{state.suppliers.find((s) => s.id === c.supplierId)?.duns}</span>
                      </Td>
                      <Td>
                        <PhaseBadge phase={c.phase} />
                        <WaitingCell c={c} />
                        <OriginFlag c={c} compact />
                      </Td>
                      <Td>{ownSection ? <SectionCell c={c} sectionId={ownSection} /> : <ReviewChips c={c} />}</Td>
                      <Td>
                        <OpenPointsCell c={c} />
                      </Td>
                      <Td>
                        <DueCell c={c} />
                      </Td>
                      <Td>
                        <OwnerAvatar id={c.ownerId} />
                      </Td>
                    </Tr>
                  ))}
                </Table>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-2.5">
                {countNote}
                {!ownSection && <ReviewLegend />}
              </div>
            </>
          )}
        </Card>
      )}
    </div>
  );
}

function FilterSelect({ label, value, onChange, children }: { label: string; value: string; onChange: (v: string) => void; children: React.ReactNode }) {
  return (
    <label className="block min-w-0">
      <span className="mb-1 block text-[11.5px] font-medium text-ink-3">{label}</span>
      <Select value={value} onChange={(e) => onChange(e.target.value)}>
        {children}
      </Select>
    </label>
  );
}

/** A case on a phone: the table row's columns as one card (same test id), the reviews (or the informed department's
 *  section) under its fields; the whole card opens the case. */
function CaseCard({ c, ownSection, onOpen }: { c: CiqCase; ownSection?: string; onOpen: () => void }) {
  const { state } = useStore();
  const on = waitingOn(c);
  return (
    <CardListItem
      data-testid={`case-row-${c.id}`}
      onClick={onOpen}
      title={c.materialName}
      badge={
        <>
          <PhaseBadge phase={c.phase} />
          {c.priority === "high" && <span className="rounded bg-warn-soft px-1 text-[10.5px] font-semibold text-ink-2 uppercase">High</span>}
        </>
      }
      meta={
        <>
          <Mono className="text-ink-2">{c.id}</Mono> · {supplierName(state, c.supplierId)}
        </>
      }
      fields={[
        // a closed case waits on nobody: no such field
        ...(on === "none" ? [] : [{ label: "Waiting on", value: on === "supplier" ? "Supplier" : "Beiersdorf" }]),
        { label: "Open points", value: <OpenPointsCell c={c} /> },
        { label: "Due", value: <DueCell c={c} /> },
        { label: "Owner", value: userById(state, c.ownerId)?.name ?? "—" },
      ]}
    >
      <span className="mb-1 block text-[11.5px] text-ink-3">{ownSection ? `Your section (${SECTION_BY_ID[ownSection]?.code ?? ownSection})` : "Reviews (RMM + departments)"}</span>
      {ownSection ? <SectionCell c={c} sectionId={ownSection} /> : <ReviewChips c={c} />}
      <OriginFlag c={c} compact />
    </CardListItem>
  );
}

/** "Waiting on" line under the phase (same tones as WaitingBadge: violet = supplier, blue = Beiersdorf). */
function WaitingCell({ c }: { c: CiqCase }) {
  const on = waitingOn(c);
  if (on === "none") return null;
  return (
    <span className="mt-1 flex items-center gap-1.5 pl-1 text-[11.5px] whitespace-nowrap text-ink-3">
      <span aria-hidden className={cx("h-1.5 w-1.5 shrink-0 rounded-full", on === "supplier" ? "bg-violet" : "bg-info")} />
      {on === "supplier" ? "With supplier" : "With Beiersdorf"}
    </span>
  );
}

/** Customs and Legal: how far the supplier is with their own section (K7 or K8). */
function SectionCell({ c, sectionId }: { c: CiqCase; sectionId: string }) {
  const sc = c.scope.find((s) => s.sectionId === sectionId);
  if (!sc || sc.applicability === "na") return <span className="text-xs text-ink-3">Not in scope</span>;
  const p = sectionProgress(c, sectionId);
  if (!p.total) return <span className="text-xs text-ink-2">In scope</span>;
  return (
    <span className={cx("text-xs whitespace-nowrap", p.done === p.total ? "font-medium text-ok" : "text-ink-2")}>
      {p.done} of {p.total} answered
    </span>
  );
}

function OwnerAvatar({ id }: { id: string }) {
  const { state } = useStore();
  const u = userById(state, id);
  if (!u) return <span className="text-ink-3">—</span>;
  return (
    <span title={u.name} className="inline-flex items-center gap-1.5">
      <Avatar initials={u.initials} size={24} />
      <span className="text-[12.5px] text-ink-2">{u.name.split(" ")[0]}</span>
    </span>
  );
}
