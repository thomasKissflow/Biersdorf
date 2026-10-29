// The console's Orphans page (/data/orphans, 26 Oct): every row or item that names a CIQ Case item that no longer exists
// among the case items (the admin list, each missing id confirmed by its own read: a case listed only by the index is
// no proof it exists, and one missing from the list may still be a draft). Grouped by the missing case (its code and
// id) with counts per flow; "Delete these N items" runs the grouped delete (CaseDeleteDialog) for that case: the typed
// code (its id when no code is known), children first, each read back, paced (cascade.ts runDelete). This is how a case
// deleted alone (the drawer's Delete took only the case on 26 Oct; since 27 Oct it takes everything that belongs to the
// case, CaseCascadeDialog.tsx) is cleaned up. The page reads when it is opened and
// when Read again is clicked, never otherwise: after a grouped delete the deleted items leave the groups here and the
// session's lists (session.ts) without a read.
// Phones (< 768 px, Thomas 30 Oct): the groups without their Delete button (the shell says to use a larger screen).
import { Ghost, RefreshCw, Trash2 } from "lucide-react";
import { useState } from "react";
import { Badge, Button, Card, EmptyState, Mono, PageHeader } from "@/components/ui";
import { useIsPhone } from "@/shell/useLayoutMode";
import { useDataConsole } from "./ConsoleContext";
import { CaseDeleteDialog } from "./CaseDeleteDialog";
import { FLOW_OF_PART, PART_LABEL, countsOf, findOrphans, type CaseTarget, type OrphanGroup } from "./cascade";
import { useAsync } from "./common";

/** A group's test hook: its case item id, or its code when only the code is known. */
export const groupKey = (t: CaseTarget) => t.id || `code-${t.code}`;

function GroupCard({ g, onDelete }: { g: OrphanGroup; onDelete: () => void }) {
  const key = groupKey(g.target);
  const phone = useIsPhone();
  return (
    <Card className="p-4" data-testid={`orphan-group-${key}`} data-items={g.items.length} data-state={g.state}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold text-ink">{g.target.code || "No case code"}</h3>
          <p className="mt-0.5 text-[12.5px] text-ink-3">
            {g.target.id ? (
              <>
                Case item <Mono>{g.target.id}</Mono>
              </>
            ) : (
              "No case item id: these rows name only the code"
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {g.state === "gone" ? (
            <Badge tone="bad" dot>
              Case item deleted
            </Badge>
          ) : (
            <Badge tone="warn" dot>
              Not confirmed
            </Badge>
          )}
          {g.state === "gone" && !phone && (
            <Button variant="danger" size="sm" icon={<Trash2 size={14} />} onClick={onDelete} data-testid={`orphan-delete-${key}`}>
              Delete these {g.items.length} item{g.items.length === 1 ? "" : "s"}
            </Button>
          )}
        </div>
      </div>
      {g.why && <p className="mt-2 text-[12.5px] text-ink-2">Its read did not say it is gone: {g.why}</p>}
      <ul className="mt-3 flex flex-wrap gap-2">
        {countsOf(g.items).map(({ part, n }) => (
          <li key={part} className="rounded-md border border-line bg-surface-2 px-2.5 py-1 text-[12.5px] text-ink-2" data-testid={`orphan-count-${key}-${part}`} data-count={n}>
            {PART_LABEL[part]} <span className="font-medium text-ink tabular-nums">{n}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function OrphansPage() {
  const { client, session } = useDataConsole();
  const q = useAsync(() => findOrphans(client), [client]);
  const [target, setTarget] = useState<CaseTarget | null>(null);
  /** Items deleted since the scan (by part and id): they leave their groups without a new scan. */
  const [removed, setRemoved] = useState<{ scan: unknown; ids: Set<string> }>({ scan: undefined, ids: new Set() });
  const gone = removed.scan === q.data ? removed.ids : new Set<string>();
  const groups = (q.data?.groups ?? []).map((g) => ({ ...g, items: g.items.filter((x) => !gone.has(`${x.part}|${x.id}`)) })).filter((g) => g.items.length > 0);
  const phone = useIsPhone();
  return (
    <div className="space-y-5" data-testid="data-orphans">
      <PageHeader
        eyebrow="CIQ Digital"
        title="Orphans"
        subtitle="Rows and items that name a CIQ Case item that no longer exists: the CIQ screens still find such a case by them, and can't read it. Each group is one deleted case."
        actions={
          <Button variant="ghost" icon={<RefreshCw size={15} />} onClick={() => void q.reload()} disabled={q.loading} data-testid="orphans-reload" className={phone ? "h-11" : undefined}>
            {q.loading ? "Reading…" : "Read again"}
          </Button>
        }
      />
      {q.data?.errors.length ? (
        <div role="alert" className="rounded-lg border border-warn/40 bg-warn-soft px-4 py-3 text-[12.5px] text-ink-2" data-testid="orphans-errors">
          <p className="font-medium text-ink">Not everything could be read, so the list may be incomplete:</p>
          <ul className="mt-1 space-y-0.5">
            {q.data.errors.map((e) => (
              <li key={e.part}>
                {PART_LABEL[e.part]}: {e.error}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {q.loading && !q.data ? (
        <Card className="p-6 text-[13px] text-ink-3">Reading every process and form of CIQ Digital, and the supplier portal…</Card>
      ) : q.error ? (
        <Card>
          <EmptyState title="Could not look for orphans" data-testid="orphans-error">
            {q.error}
          </EmptyState>
        </Card>
      ) : groups.length === 0 ? (
        <Card>
          <EmptyState icon={<Ghost size={18} />} title="No orphans" data-testid="orphans-none">
            Every row that names a case names one that exists.
          </EmptyState>
        </Card>
      ) : (
        <div className="space-y-3" data-testid="orphans-groups" data-groups={groups.length}>
          {groups.map((g) => (
            <GroupCard key={groupKey(g.target)} g={g} onDelete={() => setTarget(g.target)} />
          ))}
        </div>
      )}
      {target && (
        <CaseDeleteDialog
          open
          target={target}
          onClose={() => setTarget(null)}
          onDone={(result) => {
            setRemoved({ scan: q.data, ids: new Set([...gone, ...result.done.map((x) => `${x.part}|${x.id}`)]) });
            for (const x of result.done) {
              const f = FLOW_OF_PART[x.part];
              if (f) session.removeRow(f, x.id);
            }
          }}
        />
      )}
    </div>
  );
}
