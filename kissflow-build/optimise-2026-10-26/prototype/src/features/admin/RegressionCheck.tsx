// "Compare the draft with the active rules": every built-in reference material is derived with the active and the
// draft rule set, so the administrator sees that a rule change does only what it should before publishing
// (REQ-CFG-003). It never reads cases: the reference materials are fixed answer sets (domain/referenceMaterials).
import { CircleCheck, FlaskConical } from "lucide-react";
import { useState } from "react";
import { Badge, Card, EmptyState, Mono, Segmented, Table, Td, Tr } from "@/components/ui";
import type { RuleSet } from "@/domain/types";
import { runRegression, type RegressionMode } from "./regression";
import type { TestLabels } from "./TestRules";
import { SectionChips, configSummary, shortVersion } from "./shared";

export function RegressionCheck({ base, draft, labels, onTry }: { base: RuleSet; draft: RuleSet | undefined; labels?: TestLabels; onTry: (materialId: string) => void }) {
  const [mode, setMode] = useState<RegressionMode>("new-request");

  if (!draft) {
    return (
      <Card>
        <EmptyState data-testid="regression-no-draft" icon={<CircleCheck size={22} />} title={`No draft to compare: ${base.version} is used for new cases`}>
          The comparison runs while a draft is open. Create a new version to change the rules; you can still try one material against the current rules.
        </EmptyState>
      </Card>
    );
  }

  const rows = runRegression(base, draft, mode);
  const changed = rows.filter((r) => r.changed);
  const unexpected = changed.filter((r) => !r.expected);
  const draftTpl = draft.templateVersion;
  // Plain names for both sides: "RS-2026.3 + v2" (used for new cases) → what the draft would publish.
  const baseName = labels?.base ?? base.version;
  const draftName = labels?.draft ?? draft.version;
  const draftTplName = labels?.draftTemplate || shortVersion(draftTpl);

  return (
    <Card data-testid="regression-check">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-4 py-3">
        <div className="min-w-0">
          <h3 className="flex flex-wrap items-center gap-2 text-[15px] font-semibold text-ink">
            <FlaskConical size={16} className="text-brand" />
            <span>
              <Mono className="text-[14px]">{baseName}</Mono> → <Mono className="text-[14px]">{draftName}</Mono>
            </span>
          </h3>
          <p className="mt-0.5 text-[13px] text-ink-3" data-testid="regression-summary" data-count={changed.length}>
            {rows.length} example materials · {rows.length - changed.length} unchanged · {changed.length} changed
            {changed.length > 0 && (unexpected.length ? ` (${unexpected.length} not explained by a changed rule)` : " (all expected)")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-ink-3">Compare as</span>
          <Segmented<RegressionMode>
            value={mode}
            onChange={setMode}
            options={[
              { value: "new-request", label: `New request (${draftTplName})` },
              { value: "pinned", label: "Running case (own version)" },
            ]}
          />
        </div>
      </div>

      <div className="border-b border-line bg-surface-2 px-4 py-2.5 text-[13px] text-ink-2">
        {mode === "new-request" ? (
          <>
            Each material is derived as if it were requested after publishing (rules and questionnaire of {draftName}).{" "}
            {changed.length === 0
              ? "No material changes."
              : unexpected.length === 0
                ? "Only materials hit by the changed rules or sections change, which is exactly what the draft intends."
                : "Some changes are not explained by a changed rule or section: check them before publishing."}
          </>
        ) : (
          <>Running cases keep their rule set and questionnaire version. Even with the draft rules on their own questionnaire version, their scope does not change: nothing changes retroactively.</>
        )}
      </div>

      <Table head={["Example material", "Answers", `Mandatory · ${baseName}`, `Mandatory · ${draftName}`, "Difference", "Result"]}>
        {rows.map((r) => {
          const s = configSummary(r.m.config);
          return (
            <Tr key={r.m.id} data-testid={`regression-row-${r.m.id}`} data-status={!r.changed ? "unchanged" : r.expected ? "expected" : "unexpected"}>
              <Td className="min-w-[200px] align-top">
                <div className="font-medium text-ink">{r.m.label}</div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-ink-3">
                  <span>Questionnaire {shortVersion(r.m.templateVersion)}</span>
                  <button type="button" data-testid={`regression-try-${r.m.id}`} onClick={() => onTry(r.m.id)} className="font-medium text-brand hover:underline">
                    Try it
                  </button>
                </div>
              </Td>
              <Td className="min-w-[200px] align-top text-[12.5px]">
                <div className="text-ink">{s.origins}</div>
                <div className="text-ink-3">
                  Markets {s.markets}
                  {s.flags && ` · ${s.flags}`}
                </div>
              </Td>
              <Td className="align-top tabular-nums">{r.before}</Td>
              <Td className="align-top tabular-nums">
                <span className={r.after !== r.before ? "font-semibold text-ink" : undefined}>{r.after}</span>
              </Td>
              <Td className="min-w-[180px] align-top">
                {!r.changed ? (
                  <span className="text-ink-3">—</span>
                ) : (
                  <div className="space-y-1">
                    {r.diff.added.length > 0 && <SectionChips ids={r.diff.added} tone="ok" prefix="+ " />}
                    {r.diff.removed.length > 0 && <SectionChips ids={r.diff.removed} tone="bad" prefix="− " />}
                    {r.diff.changed.map((d) => (
                      <div key={d.sectionId} className="text-xs text-ink-2">
                        {d.sectionId}: {d.from} → {d.to}
                      </div>
                    ))}
                  </div>
                )}
              </Td>
              <Td className="align-top">
                {!r.changed ? (
                  <Badge tone="ok" dot>
                    No change
                  </Badge>
                ) : (
                  <div className="space-y-1">
                    <Badge tone={r.expected ? "info" : "warn"} dot>
                      Changes
                    </Badge>
                    <div className="text-xs whitespace-nowrap text-ink-3">{r.expected ? `Expected${r.firing.length ? ` · ${r.firing.join(", ")}` : ""}` : "Not explained by a changed rule"}</div>
                  </div>
                )}
              </Td>
            </Tr>
          );
        })}
      </Table>
      <div className="border-t border-line px-4 py-2.5 text-xs text-ink-3">The example materials are fixed answer sets, one per typical origin or question pattern. No case is read or changed.</div>
    </Card>
  );
}
