import { useMemo, useState } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { DemoNote, PageHeader } from "@/components/ui";
import { useStore } from "@/store/store";
import { EMPTY_FILTERS, flattenAudit, type AuditFilters } from "./auditData";
import { EventLog } from "./EventLog";

/**
 * Auditor view (REQ-CTL-009, REQ-RMES-016): the event log of every case, with the supplier-master and configuration
 * changes. A case's own reconstruction (who assessed what, phases) is on the case's History tab; the former
 * ?view=reconstruct&case=… link redirects there. ?case=… opens the log filtered to that case.
 */
export function AuditTrail() {
  const { state } = useStore();
  const [params] = useSearchParams();
  const caseParam = params.get("case");
  const known = caseParam && state.cases.some((c) => c.id === caseParam) ? caseParam : "";
  const [filters, setFilters] = useState<AuditFilters>(() => (known ? { ...EMPTY_FILTERS, caseId: known, area: "case" } : EMPTY_FILTERS));
  const events = useMemo(() => flattenAudit(state), [state]);

  if (params.get("view") === "reconstruct" && known) return <Navigate to={`/cases/${known}?tab=history`} replace />;

  return (
    <div data-testid="audit-trail">
      <PageHeader
        eyebrow="Audit"
        title="Audit trail"
        subtitle="Every action on every CIQ case: who did what and when, on which value or document. Changes to the suppliers and the configuration are listed too."
        actions={
          <div className="max-w-[calc(100vw-2rem)]">
            <DemoNote>the log is append-only here; in production it is tamper-evident</DemoNote>
          </div>
        }
      />
      <EventLog state={state} events={events} filters={filters} setFilters={setFilters} />
    </div>
  );
}
