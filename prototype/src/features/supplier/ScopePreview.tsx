// Live preview of the case-specific questionnaire while the supplier answers the metadata (configuration)
// questions. Computed with the same rule engine (deriveScope) the store runs. Embedded in the questionnaire's
// metadata entry (D-1) it shows the case's own scope, which after the completeness confirmation only grows.
import { FileCheck2, Layers, UserCheck } from "lucide-react";
import { useMemo, type ReactNode } from "react";
import { Card, cx, useProduction } from "@/components/ui";
import { requestedDocuments, slotKey } from "@/domain/requestedDocs";
import { deriveScope, hasUndefinedOrigin, requiredEvidence } from "@/domain/rules";
import type { CiqCase, ScopeItem } from "@/domain/types";
import { isLiveScope, sectionMeta } from "./lib";

/** "Origin includes Vegetable → R-10; …" → [{ condition, rule }] */
function reasons(item: ScopeItem) {
  return item.reason.split("; ").map((r) => {
    const [condition, rule] = r.split(" → ");
    return { condition, rule };
  });
}

/** Origins without rules (waste, CCU, chemical recycling) on a live-scope case: neutral, no scope check (D-1). */
export const UNDEFINED_ORIGIN_NOTE = "There are no specific rules yet for waste, CCU or chemically recycled origins. You get the standard sections; Beiersdorf may ask for more.";

export function ScopePreview({ c, footer, scope: given, embedded = false }: { c: CiqCase; footer?: ReactNode; scope?: ScopeItem[]; embedded?: boolean }) {
  const derived = useMemo(() => deriveScope(c.config, c.ruleSetVersion, c.templateVersion), [c.config, c.ruleSetVersion, c.templateVersion]);
  const scope = given ?? derived;
  // Sections that apply for an empty answer set are the baseline; everything beyond it was added by an answer.
  const baseline = useMemo(() => new Set(deriveScope({}, c.ruleSetVersion, c.templateVersion).filter((s) => s.applicability !== "na").map((s) => s.sectionId)), [c.ruleSetVersion, c.templateVersion]);
  const evidence = useMemo(() => [...new Set(requiredEvidence(c.config, c.ruleSetVersion).map((e) => e.doc))], [c.config, c.ruleSetVersion]);
  // a requested document Beiersdorf's rules let the supplier leave out (29 Oct) says so
  const optionalDocs = useMemo(() => new Set(isLiveScope(c) ? requestedDocuments(c).filter((x) => x.optional).map((x) => x.key) : []), [c]);
  const mandatory = scope.filter((s) => s.applicability === "mandatory").length;
  const optional = scope.filter((s) => s.applicability === "optional").length;
  const added = scope.filter((s) => s.applicability !== "na" && !baseline.has(s.sectionId));
  const annexes = added.filter((s) => sectionMeta(s.sectionId, c.templateVersion).kind === "annex");
  const chapters = added.filter((s) => sectionMeta(s.sectionId, c.templateVersion).kind !== "annex");
  const originAnswered = !!c.config.SF01?.length;

  return (
    <Card className={cx("flex flex-col", !embedded && "lg:max-h-[calc(100vh-140px)]")}>
      <div className="shrink-0 border-b border-line px-4 py-3">
        <h3 className="text-[15px] font-semibold text-ink">{embedded ? "What your answers switch on" : "Your questionnaire will include …"}</h3>
        <p className="mt-0.5 text-[12.5px] text-ink-3">{embedded ? "Your questionnaire follows these answers. You only fill in what applies to your material." : "Updates live as you answer. You only fill in what applies to your material."}</p>
      </div>
      <div className={cx("min-h-0 flex-1 space-y-4 px-4 py-4", !embedded && "overflow-y-auto scrollbar-thin")}>
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg bg-surface-2 px-3 py-2.5">
            <p className="text-[22px] leading-none font-semibold text-ink">{mandatory}</p>
            <p className="mt-1 text-[12px] text-ink-2">mandatory sections</p>
          </div>
          <div className="rounded-lg bg-surface-2 px-3 py-2.5">
            <p className="text-[22px] leading-none font-semibold text-ink">{optional}</p>
            <p className="mt-1 text-[12px] text-ink-2">optional sections</p>
          </div>
        </div>

        <Block icon={<Layers size={14} />} title="Annexes added because of your answers">
          {annexes.length ? (
            <List items={annexes} templateVersion={c.templateVersion} />
          ) : (
            <p className="text-[12.5px] text-ink-3">{originAnswered ? "No origin-specific annexes for these answers. Annex 10 (EU REACH) always applies." : "Answer the origin question to see which annexes apply."}</p>
          )}
        </Block>

        {chapters.length > 0 && (
          <Block icon={<Layers size={14} />} title="Additional chapters">
            <List items={chapters} templateVersion={c.templateVersion} />
          </Block>
        )}

        {c.config.SF12 === false && scope.find((s) => s.sectionId === "K5.1")?.applicability === "na" && <p className="rounded-lg bg-surface-2 px-3 py-2 text-[12.5px] text-ink-2">K5.1 Microbiological test is waived. You will be asked for a short justification instead; K5.2 total microbial count stays mandatory.</p>}

        <Block icon={<FileCheck2 size={14} />} title="Evidence you will be asked for">
          <ul className="flex flex-wrap gap-1.5">
            {evidence.map((e) => (
              <li key={e} className="rounded-md border border-line bg-surface px-2 py-0.5 text-[12px] text-ink-2">
                {e}
                {optionalDocs.has(slotKey(e)) && <span className="text-ink-3"> (optional)</span>}
              </li>
            ))}
          </ul>
        </Block>

        {/* Live-scope cases show the neutral note at the origin question itself (MetadataQuestions). */}
        {!isLiveScope(c) && hasUndefinedOrigin(c.config) && (
          <p className="flex items-start gap-2 rounded-lg bg-warn-soft px-3 py-2 text-[12.5px] text-ink">
            <UserCheck size={14} className="mt-0.5 shrink-0" />
            For waste, CCU or chemically recycled origins there are no rules yet. Beiersdorf checks your questionnaire scope manually before releasing it.
          </p>
        )}
      </div>
      {footer && <div className="shrink-0 rounded-b-card border-t border-line bg-surface-2 px-4 py-3">{footer}</div>}
    </Card>
  );
}

function Block({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 flex items-center gap-1.5 text-[12.5px] font-semibold text-ink">
        <span className="text-ink-3">{icon}</span>
        {title}
      </p>
      {children}
    </div>
  );
}

function List({ items, templateVersion }: { items: ScopeItem[]; templateVersion: string }) {
  // Rule ids are internal (no rule ids towards the supplier, REQ-PROC-009); they show only with the prototype notes.
  const production = useProduction();
  return (
    <ul className="space-y-1.5">
      {items.map((s) => {
        const def = sectionMeta(s.sectionId, templateVersion);
        return (
          <li key={s.sectionId} className="rounded-lg border border-line px-2.5 py-1.5">
            <p className="text-[13px] text-ink">
              <span className="font-mono text-[11.5px] text-ink-3">{def.code}</span> {def.title}
              {s.applicability === "optional" && <span className="text-ink-3"> (optional)</span>}
            </p>
            <p className="text-[11.5px] text-ink-3">
              Because:{" "}
              {reasons(s)
                .filter((r) => r.rule)
                .map((r) => r.condition.charAt(0).toLowerCase() + r.condition.slice(1))
                .join("; ")}
              {!production && <span className="ml-1 font-mono">({s.firedRules.join(", ")})</span>}
            </p>
          </li>
        );
      })}
    </ul>
  );
}
