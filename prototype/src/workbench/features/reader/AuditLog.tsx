// #/audit (§8.15): the F8 list, read-only for everyone (the Reader has V on CIQ_Audit_Event_A00). Filters: case code,
// category, actor, side, date range. Shown as a table or a timeline. Nothing on this page writes.
import { List, ListTree, SearchX } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { EmptyState, Table, Td, Tr } from "@/components/ui/data";
import { Field, Segmented, TextInput } from "@/components/ui/form";
import { Badge, Button, Card, Mono, PageHeader } from "@/components/ui/primitives";
import { Select } from "@/components/ui/select";
import { listValues } from "../../schema";
import { useFormRows } from "../../data/hooks";
import type { AuditVM } from "../../data/viewModels";
import { ReadQualityBanner } from "../../ui/ReadQualityBanner";
import { AuditTimeline } from "../audit/AuditTimeline";
import { actionLabel, actorLine, fmtDateTime, sortEventsNewestFirst } from "../audit/format";
import { ErrorBanner, Page, Skeleton, WarningList } from "../audit/kit";
import { EMPTY_FILTERS, caseCodesIn, filterAudit, isFiltered, type AuditFilters } from "./filters";

const PAGE = 100;

export function AuditLog() {
  const rows = useFormRows<AuditVM>("CIQ_Audit_Event_A00");
  const [filters, setFilters] = useState<AuditFilters>(EMPTY_FILTERS);
  const [view, setView] = useState<"table" | "timeline">("table");
  const [limit, setLimit] = useState(PAGE);
  const all = useMemo(() => sortEventsNewestFirst(rows.data ?? []), [rows.data]);
  const matched = useMemo(() => filterAudit(all, filters), [all, filters]);
  const shown = matched.slice(0, limit);
  const codes = useMemo(() => caseCodesIn(all), [all]);
  const set = (p: Partial<AuditFilters>) => {
    setFilters((f) => ({ ...f, ...p }));
    setLimit(PAGE);
  };

  return (
    <Page testId="wb-audit">
      <PageHeader
        eyebrow="Oversight"
        title="Audit log"
        subtitle="Every event the CIQ Workbench recorded. Read-only: audit events are never edited or deleted."
        actions={
          <Segmented<"table" | "timeline">
            value={view}
            onChange={setView}
            options={[
              { value: "table", label: "Table" },
              { value: "timeline", label: "Timeline" },
            ]}
          />
        }
      />
      <ErrorBanner error={rows.error} onRetry={rows.reload} />
      <ReadQualityBanner quality={rows.quality} what="Audit events" />
      <WarningList warnings={rows.warnings} />
      <Card className="p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Case code">
            <TextInput list="wb-audit-case-codes" value={filters.caseCode} onChange={(e) => set({ caseCode: e.target.value })} placeholder="e.g. CIQ-2026-…" data-testid="wb-audit-filter-case" />
            <datalist id="wb-audit-case-codes">
              {codes.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </Field>
          <Field label="Category">
            <div data-testid="wb-audit-filter-category">
              <Select value={filters.category} onChange={(e) => set({ category: e.target.value })} aria-label="Category">
                <option value="">All categories</option>
                {listValues("CIQ_Event_Category").map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </div>
          </Field>
          <Field label="Actor">
            <TextInput value={filters.actor} onChange={(e) => set({ actor: e.target.value })} placeholder="Name or e-mail" data-testid="wb-audit-filter-actor" />
          </Field>
          <Field label="Side">
            <div data-testid="wb-audit-filter-side">
              <Select value={filters.side} onChange={(e) => set({ side: e.target.value })} aria-label="Side">
                <option value="">All sides</option>
                {listValues("CIQ_Actor_Side").map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
            </div>
          </Field>
          <Field label="From (day, UTC)">
            <TextInput type="date" value={filters.from} onChange={(e) => set({ from: e.target.value })} data-testid="wb-audit-filter-from" />
          </Field>
          <Field label="To (day, UTC)">
            <TextInput type="date" value={filters.to} onChange={(e) => set({ to: e.target.value })} data-testid="wb-audit-filter-to" />
          </Field>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3 text-[13px] text-ink-3">
          <span data-testid="wb-audit-count">
            <span className="font-semibold text-ink">{matched.length}</span> of {all.length} events
          </span>
          {isFiltered(filters) && (
            <Button size="sm" variant="ghost" onClick={() => set(EMPTY_FILTERS)} data-testid="wb-audit-filter-clear">
              Clear filters
            </Button>
          )}
        </div>
      </Card>

      {rows.loading && !rows.data ? (
        <Skeleton rows={6} testId="wb-audit-loading" />
      ) : !all.length ? (
        <Card>
          <EmptyState title={rows.quality === "failed" ? "The audit log could not be read" : "No audit events yet"}>
            {rows.quality === "failed" ? "Try again in a moment." : "Events appear here once cases, points or configuration change."}
          </EmptyState>
        </Card>
      ) : !matched.length ? (
        <Card>
          <EmptyState icon={<SearchX size={22} />} title="No events match these filters" action={<Button onClick={() => set(EMPTY_FILTERS)}>Clear filters</Button>} />
        </Card>
      ) : view === "timeline" ? (
        <Card className="p-4">
          <AuditTimeline events={shown} />
        </Card>
      ) : (
        <Card>
          <Table head={["When", "Event", "Category", "Actor", "Case", "Reason"]} dense>
            {shown.map((e) => (
              <Tr key={e._id}>
                <Td className="whitespace-nowrap text-ink-2">{fmtDateTime(e.at)}</Td>
                <Td>
                  <span data-testid={`wb-audit-row-${e.eventKey || e._id}`}>{actionLabel(e)}</span>
                </Td>
                <Td>
                  <Badge tone="neutral">{e.category || "—"}</Badge>
                </Td>
                <Td className="text-ink-2">{actorLine(e)}</Td>
                <Td>
                  {e.caseItemId ? (
                    <Link to={`/cases/${e.caseItemId}`} className="text-brand hover:underline">
                      <Mono>{e.caseCode || e.caseItemId}</Mono>
                    </Link>
                  ) : (
                    <Mono className="text-ink-3">{e.caseCode || "—"}</Mono>
                  )}
                </Td>
                <Td className="max-w-[22rem] text-ink-2">
                  <span className="line-clamp-2">{e.eventReason || "—"}</span>
                </Td>
              </Tr>
            ))}
          </Table>
        </Card>
      )}
      {matched.length > shown.length && (
        <div className="flex justify-center">
          <Button icon={view === "table" ? <List size={14} /> : <ListTree size={14} />} onClick={() => setLimit((n) => n + PAGE)} data-testid="wb-audit-more">
            Show {Math.min(PAGE, matched.length - shown.length)} more
          </Button>
        </div>
      )}
    </Page>
  );
}
