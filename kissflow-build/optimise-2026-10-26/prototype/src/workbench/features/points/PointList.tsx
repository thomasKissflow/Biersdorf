// PointList (§8.9). Final contract (§12.2): PointList({ points: PointVM[]; onOpen(id: string): void }).
// Props only: no reads, no writes. Used by T1's case "Open points" tab and by T2's lane workspace.
import { ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/primitives";
import { EmptyState, Table, Td, Tr } from "@/components/ui/data";
import { DEPT_LABEL } from "../../domain/labels";
import { pointOpenness } from "../../data/counts";
import type { PointVM } from "../../data/viewModels";
import { StatusBadge, StepBadge } from "../../ui/badges";
import { fmtDate } from "../audit/format";

export interface PointListProps {
  points: PointVM[];
  onOpen(id: string): void;
}

const dept = (d: string) => DEPT_LABEL[d as keyof typeof DEPT_LABEL] ?? d;

/** Open first, then by internal due date. */
export function sortPoints(points: PointVM[]): PointVM[] {
  return [...points].sort((a, b) => {
    const oa = pointOpenness(a).open ? 0 : 1;
    const ob = pointOpenness(b).open ? 0 : 1;
    if (oa !== ob) return oa - ob;
    return String(a.internalDueDate || "9999").localeCompare(String(b.internalDueDate || "9999"));
  });
}

export function PointList({ points, onOpen }: PointListProps) {
  if (!points.length)
    return (
      <div data-testid="wb-points" data-empty="true">
        <EmptyState title="No open points">No points are visible for this case with your access.</EmptyState>
      </div>
    );
  return (
    <div data-testid="wb-points">
      <Table head={["Point", "Kind", "Department", "Reference", "Round", "Response", "Outcome", "Status", "Internal due", ""]} dense>
        {sortPoints(points).map((p) => (
          <Tr key={p._id} onClick={() => onOpen(p._id)}>
            <Td className="font-mono text-[12.5px] whitespace-nowrap" data-testid={`wb-point-row-${p._id}`}>
              {/* UX-07: a real link (keyboard and screen readers); the row click stays a convenience */}
              <Link to={`/points/${p._id}`} onClick={(e) => e.stopPropagation()} className="text-brand hover:underline">
                {p.opKey || p._id}
              </Link>
            </Td>
            <Td>
              {p.kind || "—"}
              {p.toSupplier && (
                <Badge tone="violet" className="ml-1.5">
                  supplier
                </Badge>
              )}
            </Td>
            <Td>
              {dept(p.dept)}
              {p.raisedByDept && p.raisedByDept !== p.dept && <span className="text-ink-3"> · by {dept(p.raisedByDept)}</span>}
            </Td>
            <Td className="max-w-[260px] truncate" title={p.questionText}>
              {p.refLabel || "—"}
            </Td>
            <Td>{p.roundNo ?? "—"}</Td>
            <Td>{p.responseKind ? <Badge tone="info">{p.responseKind}</Badge> : <span className="text-ink-3">none</span>}</Td>
            <Td>{p.outcome ? <Badge tone={p.outcome === "Accepted" ? "ok" : "neutral"}>{p.outcome}</Badge> : <span className="text-ink-3">open</span>}</Td>
            <Td>{p.step ? <StepBadge step={p.step} /> : <StatusBadge status={p.status} />}</Td>
            <Td className="whitespace-nowrap">{fmtDate(p.internalDueDate)}</Td>
            <Td>
              <ChevronRight size={15} className="text-ink-3" aria-hidden />
            </Td>
          </Tr>
        ))}
      </Table>
    </div>
  );
}
