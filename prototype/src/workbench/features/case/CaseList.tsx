// §8.2 Cases list #/cases (every role with View on Case): the read ladder plus the F8 case index. Client-side search
// and filters; test cases hidden by default; "+ New case" only for canInitiate(CIQ_Case_A00); ReadQualityBanner when
// the rung is not admin; index-only rows say their status is not readable.
import { FilePlus2, Search } from "lucide-react";
import { useMemo } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Badge, Button, Card, Mono, PageHeader } from "@/components/ui/primitives";
import { EmptyState } from "@/components/ui/data";
import { TextInput, Toggle } from "@/components/ui/form";
import { Select } from "@/components/ui/select";
import { DEPTS, stepDef, type Dept } from "../../schema";
import { useCaseList, useWorkbench } from "../../data/hooks";
import { CASE_STEPPER, DEPT_LABEL, personLabel } from "../../domain/labels";
import { ReadQualityBanner } from "../../ui/ReadQualityBanner";
import { LaneChip, StatusBadge } from "../../ui/badges";
import { filterCases, filterChoices, NO_FILTERS, type CaseFilters, type StatusFilter } from "./caseFilters";
import { ErrorBanner, LoadingCard, Page, caseLabel, fmtDate, isOverdue } from "./shared";
import { positionText } from "./stepLogic";

export function CaseList() {
  const { caps } = useWorkbench();
  const nav = useNavigate();
  const list = useCaseList();
  const [params, setParams] = useSearchParams();
  const f: CaseFilters = {
    q: params.get("q") ?? "",
    status: (params.get("status") as StatusFilter) ?? "",
    step: params.get("step") ?? "",
    supplier: params.get("supplier") ?? "",
    owner: params.get("owner") ?? "",
    dept: (params.get("dept") as Dept) ?? "",
    showTest: params.get("test") === "1",
  };
  const set = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    setParams(next, { replace: true });
  };
  const rows = useMemo(() => filterCases(list.data ?? [], f), [list.data, f.q, f.status, f.step, f.supplier, f.owner, f.dept, f.showTest]); // eslint-disable-line react-hooks/exhaustive-deps
  const choices = useMemo(() => filterChoices(list.data ?? []), [list.data]);
  const anyFilter = JSON.stringify({ ...f, showTest: false }) !== JSON.stringify({ ...NO_FILTERS, showTest: false });
  return (
    <Page testId="wb-cases">
      <PageHeader
        title="Cases"
        subtitle="Every CIQ case you can read, with its position and its department reviews."
        actions={
          caps.canInitiate("CIQ_Case_A00") && (
            <Button variant="primary" icon={<FilePlus2 size={16} />} onClick={() => nav("/cases/new")} data-testid="wb-cases-new">
              New case
            </Button>
          )
        }
      />
      <ReadQualityBanner quality={list.quality} indexOnly={list.indexOnly.size} what="Cases" scope="cases" />
      <ErrorBanner error={list.error} onRetry={list.reload} />
      <Card className="p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-56 flex-1">
            <Search size={15} className="pointer-events-none absolute top-2.5 left-2.5 text-ink-3" aria-hidden />
            <TextInput className="pl-8" placeholder="Search code, material, INCI, supplier…" value={f.q} onChange={(e) => set("q", e.target.value)} data-testid="wb-cases-search" aria-label="Search cases" />
          </div>
          <div className="w-40">
            <Select value={f.status} onChange={(e) => set("status", e.target.value)} aria-label="Status">
              <option value="">All statuses</option>
              <option value="in-progress">In progress</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </Select>
          </div>
          <div className="w-44">
            <Select value={f.step} onChange={(e) => set("step", e.target.value)} aria-label="Step">
              <option value="">All steps</option>
              {CASE_STEPPER.filter((s) => s.key !== "END").map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </Select>
          </div>
          <div className="w-48">
            <Select value={f.supplier} onChange={(e) => set("supplier", e.target.value)} aria-label="Supplier">
              <option value="">All suppliers</option>
              {choices.suppliers.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="w-40">
            <Select value={f.owner} onChange={(e) => set("owner", e.target.value)} aria-label="Owner">
              <option value="">All owners</option>
              {choices.owners.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="w-40">
            <Select value={f.dept} onChange={(e) => set("dept", e.target.value)} aria-label="Active department">
              <option value="">Any department</option>
              {DEPTS.map((d) => (
                <option key={d} value={d}>
                  {DEPT_LABEL[d]}
                </option>
              ))}
            </Select>
          </div>
          <Toggle checked={f.showTest} onChange={(v) => set("test", v ? "1" : "")} label="Test cases" />
          {anyFilter && (
            <Button size="sm" variant="ghost" onClick={() => setParams(f.showTest ? { test: "1" } : {}, { replace: true })}>
              Clear
            </Button>
          )}
        </div>
      </Card>
      {list.loading && !list.data ? (
        <LoadingCard label="Loading cases…" rows={6} />
      ) : (
        <Card>
          {rows.length ? (
            <div className="relative overflow-x-auto scrollbar-thin">
              <table className="w-full text-left text-[13px]">
                <thead>
                  <tr className="border-b border-line text-ink-3">
                    {["Case", "Material", "Main INCI", "BDF material", "Supplier", "Owner", "Status · step", "Department reviews", "Supplier due"].map((h) => (
                      <th key={h} className="px-4 py-2.5 font-medium whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((c) => {
                    const idx = list.indexOnly.has(c._id);
                    const pos = positionText(c, (s) => stepDef(s).name);
                    return (
                      <tr key={c._id} onClick={() => nav(`/cases/${c._id}`)} className="cursor-pointer border-b border-line transition-colors last:border-0 hover:bg-surface-2" data-testid={`wb-cases-row-${c._id}`}>
                        <td className="px-4 py-2.5 whitespace-nowrap">
                          <Link to={`/cases/${c._id}`} onClick={(e) => e.stopPropagation()} className="font-medium text-ink hover:underline">
                            <Mono>{caseLabel(c.caseCode, c.cycleNo)}</Mono>
                          </Link>
                          {c.isTest && (
                            <Badge tone="violet" className="ml-1.5">
                              test
                            </Badge>
                          )}
                        </td>
                        <td className="px-4 py-2.5">{c.tradeName || "—"}</td>
                        <td className="px-4 py-2.5 text-ink-2">{c.mainInci || "—"}</td>
                        <td className="px-4 py-2.5">{c.bdfMaterialNo || "—"}</td>
                        <td className="px-4 py-2.5">{c.supplierLegalName || c.supplierCode || "—"}</td>
                        <td className="px-4 py-2.5">{personLabel(c.ownerRmm, c.bdfContactName, c.bdfContactEmail)}</td>
                        <td className="px-4 py-2.5">
                          {idx ? (
                            <Badge tone="neutral">Hidden</Badge>
                          ) : (
                            <div className="flex flex-col gap-0.5">
                              <StatusBadge status={c.status} />
                              {c.status === "in-progress" && <span className="text-[12px] text-ink-2">{pos || (list.quality === "admin" && c.readQuality !== "full" ? "Step not readable" : "—")}</span>}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="flex flex-wrap gap-1">
                            {DEPTS.map((d) => (
                              <LaneChip key={d} dept={d} lane={c.lanes[d]} />
                            ))}
                          </div>
                        </td>
                        <td className={`px-4 py-2.5 whitespace-nowrap ${c.status === "in-progress" && isOverdue(c.supplierDueDate) ? "font-medium text-bad" : ""}`}>{fmtDate(c.supplierDueDate) || "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (list.data ?? []).length && anyFilter ? (
            <EmptyState title="No case matches these filters" action={<Button onClick={() => setParams({}, { replace: true })}>Clear filters</Button>} />
          ) : list.quality === "admin" ? (
            <EmptyState title="No cases yet">{caps.canInitiate("CIQ_Case_A00") ? "Create the first case with New case." : "Cases appear here once RMM creates them."}</EmptyState>
          ) : (
            <EmptyState title="No cases you can read">
              You see the cases you created or have a task on. If you expected to see cases here, ask the Business administrator to check your roles.
            </EmptyState>
          )}
        </Card>
      )}
    </Page>
  );
}
