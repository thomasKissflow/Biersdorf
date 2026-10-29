// All items of one portal process (admin listing), with search and a status filter. Rows open the item drawer.
// Phones (Thomas, 30 Oct): one card per item; the drawer opens read-only (AdminShell's "Use a larger screen to edit").
import { Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import { Badge, Card, CardList, CardListItem, EmptyState, Mono, PageHeader, Select, Table, Td, TextInput, Tr } from "@/components/ui";
import { fmtDateTime } from "@/domain/selectors";
import { useIsPhone } from "@/shell/useLayoutMode";
import type { FlowKey } from "../kf/portal";
import { itemState, str, type RawItem } from "../data/raw";
import { usePortalMode } from "../mode";
import { FLOW_LABEL, KEY_FIELD, PROCESS_KEYS, statusTone, useAsync } from "./common";
import { ItemDrawer } from "./ItemDrawer";

/** The admin list carries no current step (CAFM D55, live), so open items get it from their own admin read, four at
 *  a time. Capped so a large list can't flood Kissflow; the cap is shown under the table. */
const STEP_READS = 100;
function useCurrentSteps(flow: FlowKey, rows: RawItem[] | undefined): { steps: Map<string, string>; keyOf: (r: RawItem) => string; capped: number } {
  const { client } = usePortalMode();
  // keyed by id AND last change, so an item that moved on is read again while an unchanged one is not
  const [steps, setSteps] = useState(new Map<string, string>());
  const known = useRef(steps);
  known.current = steps;
  const keyOf = (r: RawItem) => `${r._id}|${str(r, "_modified_at")}`;
  const need = useMemo(() => (rows ?? []).filter((r) => !str(r, "_current_step") && itemState(r) === "open"), [rows]);
  const unread = need.filter((r) => !steps.has(keyOf(r)));
  useEffect(() => {
    if (!client || !need.length) return;
    let alive = true;
    const queue = need.filter((r) => !known.current.has(keyOf(r))).slice(0, STEP_READS);
    const worker = async () => {
      for (let r = queue.shift(); r && alive; r = queue.shift()) {
        const k = keyOf(r);
        const step = await client.adminGet(flow, r._id).then((x) => str(x, "_current_step"), () => "");
        if (alive) setSteps((m) => new Map(m).set(k, step || "—"));
      }
    };
    void Promise.all([worker(), worker(), worker(), worker()]);
    return () => {
      alive = false;
    };
  }, [client, flow, need]);
  return { steps, keyOf, capped: Math.max(0, unread.length - STEP_READS) };
}

export function FlowTable() {
  const { key } = useParams();
  const flow = key as FlowKey;
  const { client } = usePortalMode();
  const q = useAsync(() => client!.listAll(flow), [client, flow]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | "open" | "completed" | "ended">("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const { steps, keyOf, capped } = useCurrentSteps(flow, q.data);
  const phone = useIsPhone();
  /** Scalar business fields seen on any item of this process (never-filled fields are absent from an item). */
  const knownFields = useMemo(() => {
    const keys = new Set<string>();
    for (const r of q.data ?? []) for (const [k, v] of Object.entries(r)) if (!k.startsWith("_") && (v == null || typeof v !== "object")) keys.add(k);
    return [...keys].sort();
  }, [q.data]);

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (q.data ?? [])
      .filter((r) => status === "all" || itemState(r) === status)
      .filter((r) => !needle || JSON.stringify(r).toLowerCase().includes(needle))
      .sort((a, b) => str(b, "_modified_at").localeCompare(str(a, "_modified_at")));
  }, [q.data, search, status]);

  if (!PROCESS_KEYS.includes(flow)) return <Navigate to="/admin" replace />;
  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Process" title={FLOW_LABEL[flow]} subtitle={`${q.data?.length ?? 0} items in total`} />
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-sm">
          <Search size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-3" />
          <TextInput className="pl-9" placeholder="Search key, case, supplier…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search" />
        </div>
        <div className="w-56">
          <Select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} aria-label="Status">
            <option value="all">All statuses</option>
            <option value="open">Open</option>
            <option value="completed">Completed</option>
            <option value="ended">Rejected or withdrawn</option>
          </Select>
        </div>
      </div>
      {phone && !q.error && rows.length > 0 ? (
        <CardList label={FLOW_LABEL[flow]} data-testid="flow-cards">
          {rows.map((r) => (
            <CardListItem
              key={r._id}
              data-testid={`flow-item-${r._id}`}
              title={<Mono>{str(r, KEY_FIELD[flow]) || r._id}</Mono>}
              badge={
                <Badge tone={statusTone(str(r, "_status"))} dot>
                  {str(r, "_status") || "—"}
                </Badge>
              }
              meta={`Modified ${fmtDateTime(str(r, "_modified_at"))}`}
              fields={[
                { label: "Case", value: str(r, "Case_Code") || "—" },
                { label: "Supplier", value: str(r, "Supplier_Code") || "—" },
                { label: "Current step", value: str(r, "_current_step") || steps.get(keyOf(r)) || (itemState(r) === "open" ? "…" : "—") },
              ]}
              onClick={() => setOpenId(r._id)}
            />
          ))}
        </CardList>
      ) : (
        <Card>
          {q.loading && !q.data ? (
            <div className="p-6 text-[13px] text-ink-3">Loading…</div>
          ) : q.error ? (
            <EmptyState title="Could not load the items">{q.error}</EmptyState>
          ) : rows.length === 0 ? (
            <EmptyState title="No items">{search || status !== "all" ? "Nothing matches the filter." : "This process has no items yet."}</EmptyState>
          ) : (
            <Table head={["Key", "Case", "Supplier", "Current step", "Status", "Modified"]}>
              {rows.map((r) => (
                <Tr key={r._id} onClick={() => setOpenId(r._id)}>
                  <Td>
                    <Mono>{str(r, KEY_FIELD[flow]) || r._id}</Mono>
                  </Td>
                  <Td>{str(r, "Case_Code") || "—"}</Td>
                  <Td>{str(r, "Supplier_Code") || "—"}</Td>
                  <Td>{str(r, "_current_step") || steps.get(keyOf(r)) || (itemState(r) === "open" ? "…" : "—")}</Td>
                  <Td>
                    <Badge tone={statusTone(str(r, "_status"))} dot>
                      {str(r, "_status") || "—"}
                    </Badge>
                  </Td>
                  <Td>{fmtDateTime(str(r, "_modified_at"))}</Td>
                </Tr>
              ))}
            </Table>
          )}
        </Card>
      )}
      {capped > 0 && <p className="text-[12.5px] text-ink-3">Current step is read for {STEP_READS} open items at a time; {capped} more show "…". Open an item to see its step.</p>}
      <ItemDrawer flow={flow} id={openId} knownFields={knownFields} onClose={() => setOpenId(null)} onChanged={() => void q.reload()} />
    </div>
  );
}
