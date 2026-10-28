// Small status chips: item status, step, read quality, evidence level, department lane.
import { Badge, type Tone } from "@/components/ui/primitives";
import type { Dept, StepIr } from "../schema";
import { DEPT_LABEL, STATUS_LABEL, STATUS_TONE, stepLabel } from "../domain/labels";
import type { Evidence, ItemStatus, LaneVM, ListQuality, ReadQuality } from "../data/viewModels";

export function StatusBadge({ status }: { status: ItemStatus }) {
  return (
    <Badge tone={STATUS_TONE[status]} dot>
      {STATUS_LABEL[status]}
    </Badge>
  );
}

export function StepBadge({ step, pending }: { step: StepIr | null | undefined; pending?: boolean }) {
  if (pending) return <span className="text-ink-3">…</span>;
  return <Badge tone={step ? "brand" : "neutral"}>{step ? stepLabel(step) : "Step not readable"}</Badge>;
}

const QUALITY: Record<ListQuality | ReadQuality, { label: string; tone: Tone }> = {
  admin: { label: "complete list", tone: "ok" },
  viewer: { label: "viewer route", tone: "info" },
  "mine+tasks": { label: "only your items and tasks", tone: "warn" },
  form: { label: "complete list", tone: "ok" },
  failed: { label: "not readable", tone: "bad" },
  full: { label: "full read", tone: "ok" },
  row: { label: "list row", tone: "neutral" },
  index: { label: "index only", tone: "warn" },
};
export function QualityBadge({ quality }: { quality: ListQuality | ReadQuality }) {
  const q = QUALITY[quality];
  return <Badge tone={q.tone}>{q.label}</Badge>;
}

export function EvidenceBadge({ evidence }: { evidence: Evidence }) {
  const tone: Tone = evidence === "activity" ? "ok" : evidence === "block-unique" ? "info" : evidence === "item" ? "warn" : "bad";
  return <Badge tone={tone}>{evidence ?? "unresolved"}</Badge>;
}

export function LaneChip({ dept, lane }: { dept: Dept; lane: Pick<LaneVM, "active" | "complete"> }) {
  if (!lane.active) return null;
  return (
    <Badge tone={lane.complete ? "ok" : "neutral"} dot>
      {DEPT_LABEL[dept]}
    </Badge>
  );
}
