// All items of one CIQ Digital flow (the portal's admin FlowTable, src/portal/admin/FlowTable.tsx): a process through
// its admin list, a form through its list, read ONCE a session (session.ts; Refresh reads again); search over every
// listed value; a status filter for processes; PAGE_ROWS rows a page. Rows open the item drawer; a form also gets "New
// row". 26 Oct, after Thomas's 429s: the admin list carries no current step (CAFM D55), and the table no longer reads
// every open item for it: "Show steps" reads the steps of the open rows on the CURRENT page (at most PAGE_ROWS reads,
// the console client's 2 at a time), kept per item id + status for the session (the drawer's full read gives one too);
// nothing is read again after a write. Checkboxes and "Delete selected (N)" delete the chosen items strictly one at a
// time, paced, with Stop (BulkDelete.tsx); chosen CIQ Cases with everything that belongs to them (27 Oct).
import { RefreshCw, Search, Plus, Trash2, ListChecks } from "lucide-react";
import { useMemo, useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import { Badge, Button, Card, EmptyState, Mono, PageHeader, Select, Table, Td, TextInput, Tr } from "@/components/ui";
import { fmtDateTime } from "@/domain/selectors";
import { itemState, str, type RawItem } from "@/portal/data/raw";
import type { FlowKey } from "../types";
import { BulkDeleteDialog } from "./BulkDelete";
import { DATA_PATH, FLOW_LABEL, FLOW_NAME, KEY_FIELD, SUMMARY_FIELDS, isConsoleFlow, isProcess, statusTone } from "./common";
import { useDataConsole } from "./ConsoleContext";
import { isSystem, valueText } from "./fields";
import { ItemDrawer, NEW_ROW } from "./ItemDrawer";
import { readAtText, useFlowList, useSessionVersion } from "./session";

/** Rows a page; also the most step reads one "Show steps" makes. */
export const PAGE_ROWS = 25;

export function FlowTable() {
  const { key } = useParams();
  const { session } = useDataConsole();
  const flow = (isConsoleFlow(key) ? key : "case") as FlowKey;
  const proc = isProcess(flow) ? flow : null;
  const q = useFlowList(session, flow);
  useSessionVersion(session); // kept steps
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | "open" | "completed" | "ended">("all");
  const [page, setPage] = useState(0);
  const [openId, setOpenId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const [stepNote, setStepNote] = useState<string | null>(null);
  const [readingSteps, setReadingSteps] = useState(false);
  /** Scalar business fields seen on any listed item (never-filled fields are absent from an item). */
  const knownFields = useMemo(() => {
    const keys = new Set<string>();
    for (const r of q.rows ?? []) for (const [k, v] of Object.entries(r)) if (!isSystem(k) && !k.startsWith("Table::") && (v == null || typeof v !== "object")) keys.add(k);
    return [...keys].sort();
  }, [q.rows]);
  /** Each row's text for the search, lower-cased once per list. */
  const haystack = useMemo(() => new Map((q.rows ?? []).map((r) => [r._id, JSON.stringify(r).toLowerCase()])), [q.rows]);

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (q.rows ?? [])
      .filter((r) => !proc || status === "all" || itemState(r) === status)
      .filter((r) => !needle || haystack.get(r._id)!.includes(needle))
      .sort((a, b) => str(b, "_modified_at").localeCompare(str(a, "_modified_at")));
  }, [q.rows, search, status, proc, haystack]);

  const pages = Math.max(1, Math.ceil(rows.length / PAGE_ROWS));
  const at = Math.min(page, pages - 1); // a delete may shorten the list under the current page
  const pageRows = rows.slice(at * PAGE_ROWS, at * PAGE_ROWS + PAGE_ROWS);
  const keyOf = (r: RawItem) => str(r, KEY_FIELD[flow]) || r._id;
  const stepOf = (r: RawItem): string | undefined => (proc ? str(r, "_current_step") || session.stepOf(proc, r) : undefined);
  /** The current page's open items whose step is not known: what "Show steps" reads. */
  const stepless = proc ? pageRows.filter((r) => itemState(r) === "open" && !stepOf(r)) : [];
  // the selection counts only rows still listed (a deleted one leaves it)
  const chosen = (q.rows ?? []).filter((r) => selected.has(r._id));
  const pageAll = pageRows.length > 0 && pageRows.every((r) => selected.has(r._id));

  const narrow = (f: () => void) => {
    f();
    setPage(0);
    setSelected(new Set()); // what is chosen stays in view: a filter change clears it
  };
  const toggle = (id: string, on: boolean) =>
    setSelected((s) => {
      const n = new Set(s);
      if (on) n.add(id);
      else n.delete(id);
      return n;
    });
  const togglePage = (on: boolean) =>
    setSelected((s) => {
      const n = new Set(s);
      for (const r of pageRows) {
        if (on) n.add(r._id);
        else n.delete(r._id);
      }
      return n;
    });
  const showSteps = async () => {
    if (!proc || !stepless.length) return;
    setReadingSteps(true);
    setStepNote(null);
    const r = await session.readSteps(proc, stepless);
    setReadingSteps(false);
    if (r.error) setStepNote(`Not every step could be read: ${r.error}`);
  };

  if (!isConsoleFlow(key)) return <Navigate to={DATA_PATH} replace />;
  const summary = SUMMARY_FIELDS[flow];
  const head = [
    <input key="all" type="checkbox" className="h-4 w-4 accent-[var(--brand)]" aria-label="Select every row on this page" checked={pageAll} disabled={!pageRows.length} onChange={(e) => togglePage(e.target.checked)} data-testid="data-select-page" />,
    "Key",
    ...summary,
    ...(proc ? ["Current step", "Status"] : []),
    "Modified",
  ];
  const noun = proc ? "items" : "rows";
  return (
    <div className="space-y-5" data-testid={`data-flow-${flow}`}>
      <PageHeader
        eyebrow={proc ? "Process" : "Form"}
        title={FLOW_LABEL[flow]}
        subtitle={`${FLOW_NAME[flow]} · ${q.rows ? `${q.rows.length} ${noun}` : "…"} · key ${KEY_FIELD[flow]}`}
        actions={
          !proc && (
            <Button variant="primary" icon={<Plus size={15} />} onClick={() => setOpenId(NEW_ROW)} data-testid="data-new-row">
              New row
            </Button>
          )
        }
      />
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-sm">
          <Search size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-3" />
          <TextInput className="pl-9" placeholder="Search any value…" value={search} onChange={(e) => narrow(() => setSearch(e.target.value))} aria-label="Search" data-testid="data-search" />
        </div>
        {proc && (
          <div className="w-56">
            <Select value={status} onChange={(e) => narrow(() => setStatus(e.target.value as typeof status))} aria-label="Status" data-testid="data-status">
              <option value="all">All statuses</option>
              <option value="open">Open</option>
              <option value="completed">Completed</option>
              <option value="ended">Rejected or withdrawn</option>
            </Select>
          </div>
        )}
        {proc && (
          <Button variant="ghost" icon={<ListChecks size={15} />} onClick={() => void showSteps()} disabled={readingSteps || !stepless.length} title="Reads the current step of the open items on this page" data-testid="data-show-steps" data-count={stepless.length}>
            {readingSteps ? "Reading steps…" : stepless.length ? `Show steps (${stepless.length})` : "Show steps"}
          </Button>
        )}
        <div className="ml-auto flex items-center gap-2">
          <span className="text-[12.5px] text-ink-3" data-testid="data-read-at">
            {readAtText(q)}
          </span>
          <Button variant="ghost" icon={<RefreshCw size={15} />} onClick={() => void q.refresh()} disabled={q.loading} data-testid="data-refresh">
            Refresh
          </Button>
        </div>
      </div>
      {chosen.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-surface-2 px-4 py-2.5 text-[13px]" data-testid="data-selection" data-count={chosen.length}>
          <span className="text-ink">
            {chosen.length} {chosen.length === 1 ? (proc ? "item" : "row") : noun} selected
          </span>
          {pageAll && rows.length > pageRows.length && chosen.length < rows.length && (
            <button type="button" className="font-medium text-brand hover:underline" onClick={() => setSelected(new Set(rows.map((r) => r._id)))} data-testid="data-select-matching">
              Select all {rows.length} that match
            </button>
          )}
          <button type="button" className="font-medium text-ink-2 hover:underline" onClick={() => setSelected(new Set())} data-testid="data-select-none">
            Clear
          </button>
          <Button variant="danger" size="sm" className="ml-auto" icon={<Trash2 size={14} />} onClick={() => setBulkOpen(true)} data-testid="data-bulk-delete">
            Delete selected ({chosen.length})
          </Button>
        </div>
      )}
      {stepNote && (
        <p role="alert" className="text-[12.5px] text-bad" data-testid="data-steps-error">
          {stepNote}
        </p>
      )}
      {q.error && q.rows && (
        <p role="alert" className="text-[12.5px] text-bad" data-testid="data-reload-error">
          Could not read the list again: {q.error} The rows below are the ones read before.
        </p>
      )}
      <Card>
        {q.loading && !q.rows ? (
          <div className="p-6 text-[13px] text-ink-3">Loading…</div>
        ) : q.error && !q.rows ? (
          <EmptyState title="Could not load the items" data-testid="data-load-error">
            {q.error}
          </EmptyState>
        ) : rows.length === 0 ? (
          <EmptyState title={proc ? "No items" : "No rows"}>{search || status !== "all" ? "Nothing matches the filter." : proc ? "This process has no items yet." : "This form has no rows yet. Add one, or import a file."}</EmptyState>
        ) : (
          <Table head={head}>
            {pageRows.map((r) => (
              <Tr key={r._id} onClick={() => setOpenId(r._id)} data-testid={`data-row-${r._id}`}>
                <Td className="w-10" onClick={(e) => e.stopPropagation()}>
                  <input type="checkbox" className="h-4 w-4 accent-[var(--brand)]" aria-label={`Select ${keyOf(r)}`} checked={selected.has(r._id)} onChange={(e) => toggle(r._id, e.target.checked)} data-testid={`data-select-${r._id}`} />
                </Td>
                <Td>
                  <Mono>{keyOf(r)}</Mono>
                </Td>
                {summary.map((f) => (
                  <Td key={f} className="max-w-[260px] truncate">
                    {valueText(r[f]) || "—"}
                  </Td>
                ))}
                {proc && <Td data-testid={`data-step-${r._id}`}>{stepOf(r) || (session.readingStep(r) ? "…" : <span className="text-ink-3">—</span>)}</Td>}
                {proc && (
                  <Td>
                    <Badge tone={statusTone(str(r, "_status"))} dot>
                      {str(r, "_status") || "—"}
                    </Badge>
                  </Td>
                )}
                <Td>{fmtDateTime(str(r, "_modified_at"))}</Td>
              </Tr>
            ))}
          </Table>
        )}
      </Card>
      {rows.length > PAGE_ROWS && (
        <div className="flex flex-wrap items-center justify-between gap-3 text-[12.5px] text-ink-3" data-testid="data-pager" data-page={at + 1} data-pages={pages}>
          <span data-testid="data-page-info">
            {at * PAGE_ROWS + 1}–{at * PAGE_ROWS + pageRows.length} of {rows.length}
          </span>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" disabled={at === 0} onClick={() => setPage(at - 1)} data-testid="data-page-prev">
              Previous
            </Button>
            <span>
              Page {at + 1} of {pages}
            </span>
            <Button variant="ghost" size="sm" disabled={at >= pages - 1} onClick={() => setPage(at + 1)} data-testid="data-page-next">
              Next
            </Button>
          </div>
        </div>
      )}
      <ItemDrawer flow={flow} id={openId} knownFields={knownFields} onClose={() => setOpenId(null)} onCreated={(id) => setOpenId(id)} />
      {bulkOpen && (
        <BulkDeleteDialog
          flow={flow}
          items={chosen.map((r) => ({ id: r._id, key: keyOf(r) }))}
          onClose={(left) => {
            setBulkOpen(false);
            setSelected(new Set(left)); // what was not deleted stays chosen, to try again
          }}
        />
      )}
    </div>
  );
}
