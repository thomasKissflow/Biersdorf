// RmesSummary (§8.12; WB-D9). Final contract (§12.2): RmesSummary({ c: CaseVM; dept: "SAF" | "REG" }).
// READ-ONLY: no inputs, no lock written, no link to the editing route (ground rule 7). Every internal role reads
// every record ("the other department reads"), so the Overall Approver sees the non-voided RMES row: header counts,
// each criterion's result and comment, and the findings with blocking/state. If the Form read fails, the summary
// says so; that is not a blocker by itself.
import { Badge, Card, CardHeader } from "@/components/ui/primitives";
import { Table, Td, Tr } from "@/components/ui/data";
import { useFormRows } from "../../data/hooks";
import type { CaseVM, RmesVM } from "../../data/viewModels";
import { Skeleton } from "../review/kit";
import { planDuplicates, RMES_DEPT_LABEL, RMES_FLOW } from "./model";

export interface RmesSummaryProps {
  c: CaseVM;
  dept: "SAF" | "REG";
}

export function RmesSummary({ c, dept }: RmesSummaryProps) {
  const rows = useFormRows<RmesVM>(RMES_FLOW[dept], { Case_Item_Id: c._id });
  const { keep: row, duplicates } = planDuplicates(rows.data ?? []);
  const label = `${RMES_DEPT_LABEL[dept]} RMES`;
  return (
    <Card data-testid={`wb-approval-rmes-${dept}`} data-readonly="true">
      <CardHeader title={label} subtitle="Read-only summary of the evaluation sheet." />
      <div className="px-4 py-3 text-[13px]">
        {rows.loading && !rows.data ? (
          <Skeleton rows={2} />
        ) : rows.error || rows.quality === "failed" ? (
          <p className="text-bad" data-testid={`wb-approval-rmes-${dept}-unread`}>
            The {label} sheet could not be read{rows.error ? `: ${rows.error}` : "."} This is not a blocker by itself.
          </p>
        ) : !row ? (
          <p className="text-ink-3">No {label} sheet exists for this case.</p>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Badge tone={row.openCriteriaCount ? "warn" : row.openCriteriaCount === 0 ? "ok" : "neutral"}>open criteria: {row.openCriteriaCount ?? "not counted"}</Badge>
              <Badge tone={row.openBlockingFindingsCount ? "warn" : row.openBlockingFindingsCount === 0 ? "ok" : "neutral"}>blocking findings: {row.openBlockingFindingsCount ?? "not counted"}</Badge>
              {duplicates.length > 0 && <Badge tone="warn">{duplicates.length} newer duplicate(s) not voided yet</Badge>}
            </div>
            {row.criteria.length > 0 && (
              <Table head={["Criterion", "Applicable", "Result", "Comment", "Open"]} dense>
                {row.criteria.map((x) => (
                  <Tr key={x._id || x.code}>
                    <Td>
                      <span className="font-mono text-[12px]">{x.code}</span> <span className="text-ink-2">{x.title}</span>
                    </Td>
                    <Td>{x.applicable || "—"}</Td>
                    <Td>{x.result || <span className="text-ink-3">no result</span>}</Td>
                    <Td className="max-w-[280px] whitespace-pre-wrap">{x.comment || (x.applicable === "No" ? String(x.v.Criteria_Override_Reason ?? "") : "") || "—"}</Td>
                    <Td>{x.openNum === null ? (x.applicable === "No" ? "—" : <Badge tone="warn">blank</Badge>) : x.openNum > 0 ? <Badge tone="warn">open</Badge> : <Badge tone="ok">done</Badge>}</Td>
                  </Tr>
                ))}
              </Table>
            )}
            {row.findings.length > 0 ? (
              <ul className="space-y-1">
                {row.findings.map((f) => (
                  <li key={f._id || f.text} className="flex flex-wrap items-center gap-2">
                    <Badge tone={f.blocking === "Yes" && f.state !== "Closed" ? "bad" : "neutral"}>{f.blocking === "Yes" ? "blocking" : "not blocking"}</Badge>
                    <Badge>{f.state || "no state"}</Badge>
                    {f.criterionCode && <span className="font-mono text-[12px]">{f.criterionCode}</span>}
                    <span className="text-ink">{f.text}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-ink-3">No findings.</p>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
