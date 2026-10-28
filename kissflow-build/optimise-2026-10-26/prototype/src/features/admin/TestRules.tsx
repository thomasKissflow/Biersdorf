// "Test rules" on /admin/rules: the regression comparison and the one-material simulator in one tab. Both run on the
// built-in reference materials and never on cases, so they work on an empty system (spec §4 Admin).
import { FlaskConical, GitCompareArrows } from "lucide-react";
import type { ReactNode } from "react";
import { cx } from "@/components/ui";
import type { RuleSet } from "@/domain/types";
import { RegressionCheck } from "./RegressionCheck";
import { ScopeSimulator } from "./ScopeSimulator";

export type TestView = "compare" | "try";

function ViewButton({ value, current, onClick, icon, children }: { value: TestView; current: TestView; onClick: () => void; icon: ReactNode; children: ReactNode }) {
  const on = value === current;
  return (
    <button
      type="button"
      role="tab"
      aria-selected={on}
      data-testid={`test-rules-view-${value}`}
      onClick={onClick}
      className={cx("inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] transition-colors", on ? "bg-surface font-semibold text-ink shadow-card" : "text-ink-2 hover:text-ink")}
    >
      {icon}
      {children}
    </button>
  );
}

/** How the two sides are named: the pair used for new cases, and what the draft would publish. */
export interface TestLabels {
  base: string;
  draft: string;
  /** The questionnaire new requests get after publishing ("v3", or "v2" when it stays). */
  draftTemplate: string;
}

export function TestRules({
  base,
  draft,
  labels,
  view,
  onView,
  material,
  onMaterial,
}: {
  base: RuleSet;
  draft: RuleSet | undefined;
  labels?: TestLabels;
  view: TestView;
  onView: (v: TestView) => void;
  material?: string;
  onMaterial: (id: string) => void;
}) {
  return (
    <div className="space-y-4" data-testid="test-rules">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label="Test rules" className="inline-flex flex-wrap gap-1 rounded-lg border border-line bg-surface-2 p-1">
          <ViewButton value="compare" current={view} onClick={() => onView("compare")} icon={<GitCompareArrows size={14} />}>
            {draft ? `Compare ${labels?.draft ?? draft.version} with ${labels?.base ?? base.version}` : "Compare rule sets"}
          </ViewButton>
          <ViewButton value="try" current={view} onClick={() => onView("try")} icon={<FlaskConical size={14} />}>
            Try one material
          </ViewButton>
        </div>
        <p className="text-[12.5px] text-ink-3">Runs on built-in example materials, never on cases.</p>
      </div>
      {view === "compare" ? (
        <RegressionCheck base={base} draft={draft} labels={labels} onTry={onMaterial} />
      ) : (
        // Keyed by the material, so "Try it" from the comparison starts the simulator from that material.
        <ScopeSimulator key={material ?? "default"} initial={material} />
      )}
    </div>
  );
}
