// Domain-aware status badges. Use these everywhere so a status always looks the same.
import { DEPT_SHORT } from "@/domain/catalog";
import { PHASE_LABEL, type TrackView } from "@/domain/selectors";
import type { Applicability, Dept, OpenPointKind, Phase } from "@/domain/types";
import { Badge, type Tone } from "./ui/primitives";

const PHASE_TONE: Record<Phase, Tone> = {
  "supplier-input": "violet",
  review: "info",
  "final-release": "violet",
  completed: "ok",
  cancelled: "neutral",
  // legacy phases of the live portal's old flow
  metadata: "violet",
  "scope-check": "warn",
};

export function PhaseBadge({ phase }: { phase: Phase }) {
  return (
    <Badge tone={PHASE_TONE[phase]} dot>
      {PHASE_LABEL[phase]}
    </Badge>
  );
}

const TRACK: Record<TrackView, { tone: Tone; label: string }> = {
  "not-started": { tone: "neutral", label: "Not started" },
  "in-review": { tone: "info", label: "In review" },
  "waiting-supplier": { tone: "violet", label: "Waiting for supplier" },
  completed: { tone: "ok", label: "Completed" },
  reopened: { tone: "warn", label: "Reopened" },
  ended: { tone: "neutral", label: "Ended (case cancelled)" },
};

/** `status` is a track's status, or "ended" for an unfinished track of a cancelled case (selectors.trackView). */
export function TrackBadge({ status }: { status: TrackView }) {
  return (
    <Badge tone={TRACK[status].tone} dot>
      {TRACK[status].label}
    </Badge>
  );
}

export function DecisionBadge({ decision }: { decision?: "approved" | "rejected" }) {
  if (!decision) return <Badge tone="neutral">No decision</Badge>;
  return <Badge tone={decision === "approved" ? "ok" : "bad"}>{decision === "approved" ? "Approved" : "Rejected"}</Badge>;
}

export function ApplicabilityBadge({ a, manual }: { a: Applicability; manual?: boolean }) {
  const map = { mandatory: { tone: "brand" as Tone, label: "Mandatory" }, optional: { tone: "neutral" as Tone, label: "Optional" }, na: { tone: "neutral" as Tone, label: "Not applicable" } }[a];
  return (
    <Badge tone={map.tone} className={a === "na" ? "opacity-70" : undefined}>
      {map.label}
      {manual ? " · manual" : ""}
    </Badge>
  );
}

// "finding": a question raised from a retired RMES finding (legacy data only); on screen it is a query, as in the
// completion bar (features/review/lib.ts KIND_TEXT)
const KIND: Record<OpenPointKind, string> = { query: "Query", "document-request": "Document request", "additional-part": "Additional section", finding: "Query" };
export const kindLabel = (k: OpenPointKind) => KIND[k];

export function DeptBadge({ dept }: { dept: Dept }) {
  return <Badge tone="neutral">{DEPT_SHORT[dept]}</Badge>;
}

export function WaitingBadge({ on }: { on: "supplier" | "bdf" | "none" }) {
  if (on === "none") return null;
  return <Badge tone={on === "supplier" ? "violet" : "info"}>{on === "supplier" ? "With supplier" : "With Beiersdorf"}</Badge>;
}
