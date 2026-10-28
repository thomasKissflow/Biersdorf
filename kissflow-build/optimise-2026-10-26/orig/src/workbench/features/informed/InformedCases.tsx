// Informed cases (#/informed) for Customs & Trade Compliance (K7) and Legal / IP (K8, K8.1): read-only, no review step.
// Modelled on the prototype's src/features/review/InformedList.tsx, over live cases, CIQ Section rows and scope runs.
// A row opens the case view, which is read-only for these roles (their grants are the Auditor's).
import { ExternalLink, Eye } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Badge, Card, Mono, PageHeader } from "@/components/ui/primitives";
import { EmptyState, StatCard, Table, Td, Tr } from "@/components/ui/data";
import { Segmented } from "@/components/ui/form";
import { stepDef } from "../../schema";
import { useCaseList, useFormRows, useWorkbench } from "../../data/hooks";
import type { ListQuality, RunVM, SectionVM } from "../../data/viewModels";
import { ReadQualityBanner } from "../../ui/ReadQualityBanner";
import { StatusBadge } from "../../ui/badges";
import { ErrorBanner, Page, Skeleton } from "../audit/kit";
import { caseLabel, fmtDate } from "../case/shared";
import { positionText } from "../case/stepLogic";
import { defaultInformedFilter, filterInformed, informedDeptsOf, informedRows, informedStats, isClosedCase, isSubmitted, type InformedDept, type InformedFilter, type InformedRow } from "./model";

export function InformedCases() {
  const { caps } = useWorkbench();
  const depts = informedDeptsOf(caps.roles);
  const [pick, setPick] = useState<InformedDept["dept"] | undefined>(undefined);
  const [filter, setFilter] = useState<InformedFilter | null>(null);
  const dept = depts.find((d) => d.dept === pick) ?? depts[0];
  const cases = useCaseList();
  const sections = useFormRows<SectionVM>(dept ? "CIQ_Section_A00" : null);
  const runs = useFormRows<RunVM>(dept ? "CIQ_Scope_Run_A00" : null);
  const rows = useMemo(() => (dept ? informedRows(cases.data ?? [], sections.data ?? [], runs.data ?? [], dept) : []), [cases.data, sections.data, runs.data, dept]);

  if (!dept)
    return (
      <Page testId="wb-informed">
        <Card>
          <EmptyState icon={<Eye size={28} strokeWidth={1.6} />} title="This list is for informed departments">
            Customs & Trade Compliance (K7) and Legal / IP (K8, K8.1) see the cases where their sections are in scope.
          </EmptyState>
        </Card>
      </Page>
    );
  const loading = (cases.loading && !cases.data) || (sections.loading && !sections.data) || (runs.loading && !runs.data);
  return (
    <Page testId="wb-informed">
      {depts.length > 1 && (
        <div data-testid="wb-informed-dept">
          <Segmented value={dept.dept} onChange={setPick} options={depts.map((d) => ({ value: d.dept, label: d.label }))} />
        </div>
      )}
      <ErrorBanner error={cases.error || sections.error || runs.error} onRetry={() => {
          cases.reload();
          sections.reload();
          runs.reload();
        }}
      />
      <ReadQualityBanner quality={worst(cases.quality, sections.quality)} indexOnly={cases.indexOnly.size} scope="cases" />
      <InformedView dept={dept} rows={rows} filter={filter ?? defaultInformedFilter(rows)} onFilter={setFilter} loading={loading} />
    </Page>
  );
}

const worst = (a: ListQuality | undefined, b: ListQuality | undefined): ListQuality | undefined => (a === "failed" || b === "failed" ? "failed" : a && a !== "admin" && a !== "form" ? a : b && b !== "admin" && b !== "form" ? b : (a ?? b));

/** The page body (props only, so it renders in tests without the host). */
export function InformedView({ dept, rows, filter, onFilter, loading }: { dept: InformedDept; rows: InformedRow[]; filter: InformedFilter; onFilter(f: InformedFilter): void; loading?: boolean }) {
  const nav = useNavigate();
  const codes = dept.codes.join(" and ");
  const stats = informedStats(rows);
  const shown = filterInformed(rows, filter);
  return (
    <div>
      <PageHeader
        eyebrow="Informed department"
        title={`${dept.label} — informed cases`}
        subtitle={`Every running and closed case where ${codes} is in scope. You read the case and your sections; your department has no review step.`}
      />
      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard label="Active cases in scope" value={stats.active} tone="info" hint={stats.unknown ? `${codes} in scope · ${stats.unknown} more with a status you can't see` : `${codes} in scope`} onClick={() => onFilter("active")} />
        <StatCard label="Submitted to Beiersdorf" value={stats.submitted} tone="violet" hint="completeness confirmed" />
        <StatCard label="Completed" value={stats.completed} tone="ok" hint="final CIQ available" onClick={() => onFilter("closed")} />
      </div>
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
          <Segmented
            value={filter}
            onChange={onFilter}
            options={[
              { value: "active", label: "Active" },
              { value: "closed", label: "Closed" },
              { value: "all", label: "All" },
            ]}
          />
          <span className="text-xs text-ink-3">{shown.length} cases · select a row to open the case</span>
        </div>
        {filter !== "all" && stats.unknown > 0 && (
          <p className="border-b border-line bg-surface-2 px-4 py-2.5 text-[12.5px] text-ink-2" data-testid="wb-informed-unknown">
            {stats.unknown === 1 ? "1 case" : `${stats.unknown} cases`} in scope {stats.unknown === 1 ? "is" : "are"} known only from the audit log, so {stats.unknown === 1 ? "its status isn't" : "their status isn't"} shown with your access. See All.
          </p>
        )}
        {loading ? (
          <Skeleton rows={5} bare />
        ) : shown.length === 0 ? (
          <EmptyState title="No cases in this view">Cases appear here once their scope is saved and {codes} is in scope.</EmptyState>
        ) : (
          <Table head={["Case", "Supplier", "Status · step", `${codes} in scope`, "Supplier due", ""]}>
            {shown.map(({ c, sections }) => {
              const pos = c.status === "in-progress" ? positionText(c, (s) => stepDef(s).name) : "";
              return (
                <Tr key={c._id} onClick={() => nav(`/cases/${c._id}`)}>
                  <Td className="min-w-[220px]">
                    <div className="font-medium text-ink">{c.tradeName || c.title || "—"}</div>
                    <div className="mt-0.5 text-xs text-ink-3">
                      <Mono>{caseLabel(c.caseCode, c.cycleNo)}</Mono>
                      {c.mainInci ? ` · ${c.mainInci}` : ""}
                    </div>
                  </Td>
                  <Td className="text-ink-2">{c.supplierLegalName || c.supplierCode || "—"}</Td>
                  <Td>
                    <div className="flex flex-col gap-0.5">
                      <StatusBadge status={c.status} />
                      {pos && <span className="text-[12px] text-ink-2">{pos}</span>}
                    </div>
                  </Td>
                  <Td>
                    <div className="flex flex-wrap items-center gap-1.5" data-testid={`wb-informed-sections-${c._id}`}>
                      {sections.map((s) => (
                        <span key={s.key} className="text-xs text-ink-2" title={s.title || undefined}>
                          <Mono>{s.code}</Mono> {s.applicability ? s.applicability.toLowerCase() : "in scope"}
                        </span>
                      ))}
                      {!isClosedCase(c) && isSubmitted(c) && (
                        <Badge tone="info" dot>
                          Submitted
                        </Badge>
                      )}
                    </div>
                  </Td>
                  <Td className="whitespace-nowrap text-ink-2">{fmtDate(c.supplierDueDate) || "—"}</Td>
                  <Td className="w-10">
                    <Link to={`/cases/${c._id}`} onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-1 text-[12.5px] whitespace-nowrap text-brand hover:underline" data-testid={`wb-informed-open-${c._id}`}>
                      Open <ExternalLink size={12} aria-hidden />
                    </Link>
                  </Td>
                </Tr>
              );
            })}
          </Table>
        )}
      </Card>
    </div>
  );
}
