// The audit trail's event log (AuditTrail.tsx): filters, then the events newest first, 50 at a time. Phones (< 768 px,
// Thomas 30 Oct): the search stays on the page and the other filters move into a sheet ("Filters", with the number
// set); each event is a card with the row's test id.
import { ChevronDown, History, Search, SearchX, X } from "lucide-react";
import { useMemo, useState, type ElementType } from "react";
import { Link } from "react-router-dom";
import { Badge, Button, Card, CardList, CardListItem, EmptyState, Mono, Segmented, Select, Table, Td, TextInput, Tr, cx } from "@/components/ui";
import { SECTION_BY_ID } from "@/domain/catalog";
import { fmtDateTime } from "@/domain/selectors";
import type { AppState } from "@/domain/types";
import { PHONE_FIELDS, PHONE_TAPS, PhoneFilters } from "@/features/rmm/phone";
import { useIsPhone } from "@/shell/useLayoutMode";
import { AREA_LABEL, EMPTY_FILTERS, actionsInLog, filterEvents, isFiltered, peopleInLog, type AuditFilters, type EventArea, type FlatEvent } from "./auditData";
import { Who } from "./Who";

const PAGE = 50;

/** The case ID opens the case's History tab; supplier-master and configuration events name their area. */
function Where({ e }: { e: FlatEvent }) {
  if (e.area === "case")
    return (
      <>
        <Link to={`/cases/${e.caseId}?tab=history`} className="text-brand hover:underline" title="Open the case history">
          <Mono>{e.caseId}</Mono>
        </Link>
        <span className="block max-w-[160px] truncate text-xs text-ink-3">{e.material}</span>
      </>
    );
  return (
    <>
      <Badge tone={e.area === "supplier" ? "violet" : "neutral"}>{AREA_LABEL[e.area]}</Badge>
      {e.material && <span className="mt-0.5 block max-w-[160px] truncate text-xs text-ink-3">{e.material}</span>}
    </>
  );
}

export function EventLog({ state, events, filters, setFilters }: { state: AppState; events: FlatEvent[]; filters: AuditFilters; setFilters: (f: AuditFilters) => void }) {
  const [order, setOrder] = useState<"newest" | "oldest">("newest");
  const sig = JSON.stringify(filters) + order;
  const [page, setPage] = useState({ sig, n: PAGE });
  const limit = page.sig === sig ? page.n : PAGE;

  const people = useMemo(() => peopleInLog(events), [events]);
  const actions = useMemo(() => actionsInLog(events), [events]);
  const cases = useMemo(() => [...state.cases].sort((a, b) => b.id.localeCompare(a.id)), [state.cases]);
  const areas = useMemo(() => (["case", "supplier", "config"] as EventArea[]).filter((a) => events.some((e) => e.area === a)), [events]);
  const matched = useMemo(() => {
    const m = filterEvents(events, filters);
    return order === "newest" ? m : [...m].reverse();
  }, [events, filters, order]);
  const shown = matched.slice(0, limit);
  const set = (patch: Partial<AuditFilters>) => setFilters({ ...filters, ...patch });
  const phone = useIsPhone();
  const ListBox: ElementType = phone ? "div" : Card;

  if (events.length === 0) {
    return (
      <Card>
        <EmptyState data-testid="empty-audit" icon={<History size={22} />} title="No activity yet">
          Every action on a CIQ case appears here, with who did it and when, together with the changes to the suppliers and the configuration.
        </EmptyState>
      </Card>
    );
  }

  const countNote = (
    <span className={cx(!phone && "ml-auto", "text-[13px] text-ink-3")} data-testid="audit-count" data-count={matched.length}>
      <span className="font-semibold text-ink">{matched.length}</span> of {events.length} events
    </span>
  );
  // The filter controls, shared by the desktop card and the phone's sheet.
  const searchBox = (
    <div className={phone ? "relative min-w-0 flex-1" : "relative"}>
      <Search size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-3" />
      <TextInput
        data-testid="audit-search"
        value={filters.q}
        onChange={(e) => set({ q: e.target.value })}
        // a phone: a placeholder that fits, the full hint in the field's name
        placeholder={phone ? "Search events" : "Search action, detail, case, material or person"}
        className="pl-9"
        aria-label={phone ? "Search the audit trail by action, detail, case, material or person" : "Search the audit trail"}
      />
    </div>
  );
  const caseSelect = (
    <Select data-testid="audit-filter-case" value={filters.caseId} onChange={(e) => set({ caseId: e.target.value, area: e.target.value ? "case" : filters.area })} aria-label="Filter by case">
      <option value="">{cases.length ? `All cases (${cases.length})` : "All cases"}</option>
      {cases.map((c) => (
        <option key={c.id} value={c.id}>
          {c.id} · {c.materialName}
        </option>
      ))}
    </Select>
  );
  const personSelect = (
    <Select data-testid="audit-filter-person" value={filters.person} onChange={(e) => set({ person: e.target.value })} aria-label="Filter by person">
      <option value="">All people</option>
      {people.internal.length > 0 && (
        <optgroup label="Beiersdorf">
          {people.internal.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </optgroup>
      )}
      {people.supplier.length > 0 && (
        <optgroup label="Supplier">
          {people.supplier.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} ({p.org})
            </option>
          ))}
        </optgroup>
      )}
      {people.system.length > 0 && (
        <optgroup label="Automatic">
          <option value="system">System</option>
        </optgroup>
      )}
    </Select>
  );
  const actionSelect = (
    <Select data-testid="audit-filter-action" value={filters.action} onChange={(e) => set({ action: e.target.value })} aria-label="Filter by action type">
      <option value="">All action types ({actions.length})</option>
      {actions.map((a) => (
        <option key={a} value={a}>
          {a}
        </option>
      ))}
    </Select>
  );
  const areaSwitch = (
    <>
      {areas.length > 1 && (
        <Segmented<"" | EventArea>
          value={filters.area}
          onChange={(v) => set({ area: v, caseId: v === "case" ? filters.caseId : "" })}
          options={[{ value: "", label: "Everything" }, ...areas.map((a) => ({ value: a, label: AREA_LABEL[a] }))]}
        />
      )}
    </>
  );
  const sideSwitch = (
    <Segmented<"" | FlatEvent["side"]>
      value={filters.side}
      onChange={(v) => set({ side: v })}
      options={[
        { value: "", label: "All sides" },
        { value: "internal", label: "Beiersdorf" },
        { value: "supplier", label: "Supplier" },
        { value: "system", label: "System" },
      ]}
    />
  );
  const orderSwitch = (
    <Segmented<"newest" | "oldest">
      value={order}
      onChange={setOrder}
      options={[
        { value: "newest", label: "Newest first" },
        { value: "oldest", label: "Oldest first" },
      ]}
    />
  );

  return (
    <div className="space-y-4">
      {phone ? (
        <div className={cx("flex flex-wrap items-center gap-2", PHONE_FIELDS)}>
          {searchBox}
          <PhoneFilters
            data-testid="audit-filters"
            active={[filters.caseId, filters.person, filters.action, filters.side, filters.area].filter(Boolean).length}
            onClear={() => setFilters({ ...EMPTY_FILTERS, q: filters.q })}
            clearTestId="audit-clear"
            results={matched.length === 1 ? "Show 1 event" : `Show ${matched.length} events`}
          >
            {caseSelect}
            {personSelect}
            {actionSelect}
            <div className={cx("flex flex-col items-start gap-3", PHONE_TAPS)}>
              {areaSwitch}
              {sideSwitch}
              {orderSwitch}
            </div>
          </PhoneFilters>
          <p className="w-full px-1">{countNote}</p>
        </div>
      ) : (
        <Card className="p-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(0,1.6fr)_repeat(3,minmax(0,1fr))]">
            {searchBox}
            {caseSelect}
            {personSelect}
            {actionSelect}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            {areaSwitch}
            {sideSwitch}
            {orderSwitch}
            {countNote}
            {isFiltered(filters) && (
              <Button size="sm" variant="ghost" data-testid="audit-clear" icon={<X size={14} />} onClick={() => setFilters(EMPTY_FILTERS)}>
                Clear filters
              </Button>
            )}
          </div>
        </Card>
      )}
      {/* a phone: the event cards straight on the page, not boxed twice */}
      <ListBox className={phone ? "min-w-0 space-y-3" : "min-w-0"}>
        {matched.length === 0 ? (
          phone ? (
            <Card>
              <EmptyState data-testid="audit-no-match" icon={<SearchX size={22} />} title="No event matches these filters" action={<Button onClick={() => setFilters(EMPTY_FILTERS)} className="h-11">Clear filters</Button>}>
                Try a broader search term or another case, person or action type.
              </EmptyState>
            </Card>
          ) : (
          <EmptyState data-testid="audit-no-match" icon={<SearchX size={22} />} title="No event matches these filters" action={<Button onClick={() => setFilters(EMPTY_FILTERS)}>Clear filters</Button>}>
            Try a broader search term or another case, person or action type.
          </EmptyState>
          )
        ) : phone ? (
          <>
            <CardList label="Events">
              {shown.map((e) => (
                <CardListItem
                  key={`${e.caseId}-${e.id}`}
                  data-testid={`audit-row-${e.id}`}
                  title={e.action}
                  meta={
                    <time dateTime={e.at} title={new Date(e.at).toUTCString()}>
                      {fmtDateTime(e.at)}
                    </time>
                  }
                >
                  <span className="block">{e.detail}</span>
                  {e.sectionId && <span className="mt-1 block text-xs text-ink-3">{e.sectionId === "GEN" ? "General information" : `Section ${SECTION_BY_ID[e.sectionId]?.code ?? e.sectionId}`}</span>}
                  <span className="mt-2.5 flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                    <Who state={state} by={e.by} />
                    <span className="text-right">
                      <Where e={e} />
                    </span>
                  </span>
                </CardListItem>
              ))}
            </CardList>
            <div className="flex flex-wrap items-center justify-between gap-3 px-1 text-[12.5px] text-ink-3">
              <span>
                Showing {shown.length} of {matched.length}. A case ID opens the case's history.
              </span>
              {shown.length < matched.length && (
                <Button data-testid="audit-more" icon={<ChevronDown size={14} />} onClick={() => setPage({ sig, n: limit + PAGE })} className="h-11 w-full">
                  Show {Math.min(PAGE, matched.length - shown.length)} more
                </Button>
              )}
            </div>
          </>
        ) : (
          <>
            <Table head={["Time", "Case", "Who", "Action", "Detail"]}>
              {shown.map((e) => (
                <Tr key={`${e.caseId}-${e.id}`} data-testid={`audit-row-${e.id}`} data-area={e.area}>
                  <Td className="align-top whitespace-nowrap text-ink-2">
                    <time dateTime={e.at} title={new Date(e.at).toUTCString()}>
                      {fmtDateTime(e.at)}
                    </time>
                  </Td>
                  <Td className="align-top">
                    <Where e={e} />
                  </Td>
                  <Td className="align-top">
                    <Who state={state} by={e.by} />
                  </Td>
                  <Td className="min-w-[150px] align-top font-medium">{e.action}</Td>
                  <Td className="min-w-[260px] align-top text-ink-2">
                    {e.detail}
                    {e.sectionId && <span className="mt-1 block text-xs text-ink-3">{e.sectionId === "GEN" ? "General information" : `Section ${SECTION_BY_ID[e.sectionId]?.code ?? e.sectionId}`}</span>}
                  </Td>
                </Tr>
              ))}
            </Table>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3 text-[12.5px] text-ink-3">
              <span>
                Showing {shown.length} of {matched.length}. A case ID opens the case's history.
              </span>
              {shown.length < matched.length && (
                <Button size="sm" data-testid="audit-more" icon={<ChevronDown size={14} />} onClick={() => setPage({ sig, n: limit + PAGE })}>
                  Show {Math.min(PAGE, matched.length - shown.length)} more
                </Button>
              )}
            </div>
          </>
        )}
      </ListBox>
    </div>
  );
}
