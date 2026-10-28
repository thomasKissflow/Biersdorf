// The live reads behind the dashboard and the reports: cases (read ladder + F8 index), open points and change requests
// (read ladder), audit events and scope runs (Forms). Reads only, through the existing hooks; nothing is written.
import { useMemo } from "react";
import { useCaseList, useFormRows } from "../../data/hooks";
import { toCrVM, toPointVM } from "../../data/map";
import type { AuditVM, ListQuality, RawItem, RunVM } from "../../data/viewModels";
import { coverageOf, scopeOps, type Coverage, type OpsInput } from "./metrics";

export interface Ops {
  data: OpsInput | null;
  quality: Record<keyof Coverage, ListQuality | undefined>;
  coverage: Coverage;
  indexOnly: number;
  loading: boolean;
  error: string | null;
  warnings: string[];
  reload(): void;
}

// Off rung 1 a list row carries its step (§6.3), as the case list trusts it.
const trust = (q: ListQuality | undefined) => ({ trustStep: q !== "admin" });

export function useOps(): Ops {
  const cases = useCaseList();
  const points = useFormRows<RawItem>("CIQ_Open_Point_A00");
  const crs = useFormRows<RawItem>("CIQ_Change_Request_A00");
  const events = useFormRows<AuditVM>("CIQ_Audit_Event_A00");
  const runs = useFormRows<RunVM>("CIQ_Scope_Run_A00");
  const all = [cases, points, crs, events, runs];
  const quality = { cases: cases.quality, points: points.quality, crs: crs.quality, events: events.quality, runs: runs.quality };
  const coverage = useMemo(() => coverageOf(quality, cases.indexOnly.size), [cases.quality, points.quality, crs.quality, events.quality, runs.quality, cases.indexOnly.size]); // eslint-disable-line react-hooks/exhaustive-deps
  const data = useMemo<OpsInput | null>(
    () =>
      cases.data
        ? scopeOps({
            cases: cases.data,
            points: (points.data ?? []).map((r) => toPointVM(r, "row", trust(points.quality))),
            crs: (crs.data ?? []).map((r) => toCrVM(r, "row", trust(crs.quality))),
            events: events.data ?? [],
            runs: runs.data ?? [],
          })
        : null,
    [cases.data, points.data, crs.data, events.data, runs.data, points.quality, crs.quality],
  );
  return {
    data,
    quality,
    coverage,
    indexOnly: cases.indexOnly.size,
    loading: all.some((l) => l.loading),
    error: all.map((l) => l.error).filter(Boolean).join(" · ") || null,
    warnings: [...new Set(all.flatMap((l) => l.warnings))],
    reload: () => all.forEach((l) => l.reload()),
  };
}
