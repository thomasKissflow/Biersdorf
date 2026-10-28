// "How the questionnaire is generated": a compact mapping computed from the published rule set
// (RULE_SETS[0]). Inputs on the left of each row, the sections they open to the right.

import { ArrowRight, GitBranch } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Card, cx } from "@/components/ui";
import { CONFIG_QUESTIONS, MARKET_LABEL, ORIGIN_LABEL, SECTION_BY_ID } from "@/domain/catalog";
import { RULE_SETS, hasUndefinedOrigin } from "@/domain/rules";
import type { Applicability, ConfigAnswers, ConfigQuestionId, Market, OriginType } from "@/domain/types";
import { useStore } from "@/store/store";
import { NoBreakIds, PageSection } from "./shared";
import { useCallMode } from "./callMode";

const RS = RULE_SETS[0];
const DRAFT = RULE_SETS.find((r) => r.status === "draft");

interface Hit {
  sectionId: string;
  outcome: Applicability;
}

const uniqHits = (hits: Hit[]) => {
  const seen = new Map<string, Hit>();
  for (const h of hits) if (!seen.has(h.sectionId)) seen.set(h.sectionId, h);
  return [...seen.values()];
};
const fire = (cfg: ConfigAnswers, q: ConfigQuestionId | "ALWAYS", rules = RS.rules) => rules.filter((r) => r.question === q && r.when(cfg));
const hitsOf = (rules: typeof RS.rules) => uniqHits(rules.flatMap((r) => r.activates.map((sectionId) => ({ sectionId, outcome: r.outcome }))));

// Origins (SF-01): evaluate each origin on its own.
const ORIGIN_ROWS = (Object.keys(ORIGIN_LABEL) as OriginType[]).map((o) => {
  const cfg: ConfigAnswers = { SF01: [o] };
  const fired = fire(cfg, "SF01");
  return { key: o, label: ORIGIN_LABEL[o], hits: hitsOf(fired), evidence: [...new Set(fired.flatMap((r) => r.evidence ?? []))], undefinedOrigin: hasUndefinedOrigin(cfg) };
});
const ORIGINS_DEFINED = ORIGIN_ROWS.filter((r) => !r.undefinedOrigin);
const ORIGINS_UNDEFINED = ORIGIN_ROWS.filter((r) => r.undefinedOrigin);

// Specific questions: every answer option that switches something on.
const SHORT_Q: Partial<Record<ConfigQuestionId, string>> = {
  SF03: "Polymer / REACH polymer",
  SF04: "UV filter",
  SF05: "Colorant or preservative",
  SF06: "Fermentation or GMO",
  SF07: "Mineral oil or hydrocarbon",
  SF08: "Palm-based feedstock",
  SF09: "In EUDR scope",
  SF10: "Brazilian genetic heritage",
  SF12: "Microbiological test needed",
};
const QUESTION_ROWS = CONFIG_QUESTIONS.filter((q) => q.id in SHORT_Q).map((q) => {
  const answers: { label: string; cfg: ConfigAnswers }[] =
    q.kind === "yesno"
      ? [
          { label: "Yes", cfg: { [q.id]: true } as ConfigAnswers },
          { label: "No", cfg: { [q.id]: false } as ConfigAnswers },
        ]
      : (q.options ?? []).map((o) => ({ label: o.label, cfg: { [q.id]: [o.value] } as ConfigAnswers }));
  const branches = answers.map((a) => ({ label: a.label, hits: hitsOf(fire(a.cfg, q.id)) })).filter((b) => b.hits.length);
  return { key: q.id, code: q.code, label: SHORT_Q[q.id]!, branches };
});

// Markets (SF-11): one row per market rule; the label names the market(s) that trigger it.
const MARKETS = Object.keys(MARKET_LABEL) as Market[];
const MARKET_ROWS = RS.rules
  .filter((r) => r.question === "SF11")
  .map((r) => {
    const triggers = MARKETS.filter((m) => r.when({ SF11: [m] }));
    return { key: r.id, label: triggers.length === 1 ? MARKET_LABEL[triggers[0]] : r.text, hits: hitsOf([r]) };
  });
const DRAFT_MARKET_ROWS = (DRAFT?.rules ?? [])
  .filter((r) => r.question === "SF11" && !RS.rules.some((x) => x.id === r.id))
  .map((r) => ({ key: r.id, label: MARKETS.filter((m) => r.when({ SF11: [m] })).map((m) => MARKET_LABEL[m]).join(", "), hits: hitsOf([r]) }));

// Always-on content.
const ALWAYS_DOC = RS.rules.filter((r) => r.question === "ALWAYS" && r.basis === "document" && r.outcome === "mandatory");
const ALWAYS_ASSUMED = RS.rules.filter((r) => r.question === "ALWAYS" && r.basis !== "document" && r.outcome === "mandatory");
const ALWAYS_DOC_HITS = hitsOf(ALWAYS_DOC);
const ALWAYS_ASSUMED_HITS = hitsOf(ALWAYS_ASSUMED);
const EU_REACH = ALWAYS_DOC_HITS.filter((h) => SECTION_BY_ID[h.sectionId]?.title.includes("EU REACH"));

export function RuleMapping() {
  const { persona } = useStore();
  const call = useCallMode();
  const nav = useNavigate();
  const [showAssumed, setShowAssumed] = useState(false);

  return (
    <PageSection
      id="rules"
      title="How the questionnaire is generated"
      hint={<NoBreakIds text={`The supplier's metadata answers open sections live while it fills in the CIQ. Everything else stays hidden from the supplier and is kept internally with the reason. After the completeness confirmation, sections are only added. Rule set ${RS.version}, ${RS.rules.length} rules.`} />}
      action={
        call ? undefined : persona.id === "admin" ? (
          <Button size="sm" icon={<GitBranch size={14} />} iconRight={<ArrowRight size={14} />} onClick={() => nav("/admin/rules")}>
            Try it in the rule simulator
          </Button>
        ) : (
          <span className="text-[12.5px] text-ink-3">Rule simulator: available to the business administrator</span>
        )
      }
    >
      <Card className="overflow-hidden">
        <div className="grid divide-y divide-line lg:grid-cols-3 lg:divide-x lg:divide-y-0">
          <Column title="Origin of the components" code="SF-01" note="A blend gets the sections of all its origins.">
            {ORIGINS_DEFINED.map((r) => (
              <MapRow key={r.key} input={r.label} sub={r.evidence.length ? `Evidence: ${r.evidence.join(", ")}` : undefined}>
                {r.hits.length ? r.hits.map((h) => <SectionChip key={h.sectionId} hit={h} />) : <span className="text-[12px] text-ink-3">No extra section</span>}
              </MapRow>
            ))}
            <MapRow input="Waste, CCU or chemical recycling" title={ORIGINS_UNDEFINED.map((r) => r.label).join(", ")} sub="No rules yet: flagged for RMM's review">
              <span className="rounded-md border border-dashed border-line-strong px-1.5 py-0.5 text-[12px] text-ink-2">Standard sections; flagged for RMM's review</span>
            </MapRow>
          </Column>

          <Column title="Specific questions" code="SF-03 … SF-12" note="Each question opens its own section.">
            {QUESTION_ROWS.map((q) => (
              <MapRow key={q.key} input={q.label} code={q.code}>
                {q.branches.map((b) => (
                  <span key={b.label} className="inline-flex flex-wrap items-center gap-1">
                    {(q.branches.length > 1 || b.label !== "Yes") && <span className="text-[11.5px] font-medium text-ink-3">{b.label}:</span>}
                    {b.hits.map((h) => (
                      <SectionChip key={h.sectionId} hit={h} />
                    ))}
                  </span>
                ))}
              </MapRow>
            ))}
          </Column>

          <Column title="Target markets" code="SF-11" note="Set by RMM at case start; read-only for the supplier.">
            <MapRow input={MARKET_LABEL.EU} sub="Always, for every case">
              {EU_REACH.map((h) => (
                <SectionChip key={h.sectionId} hit={h} />
              ))}
            </MapRow>
            {MARKET_ROWS.map((r) => (
              <MapRow key={r.key} input={r.label}>
                {r.hits.map((h) => (
                  <SectionChip key={h.sectionId} hit={h} />
                ))}
              </MapRow>
            ))}
            {(call ? [] : DRAFT_MARKET_ROWS).map((r) => (
              <MapRow key={r.key} input={r.label} sub={`Comes with draft rule set ${DRAFT?.version}`} muted>
                {r.hits.map((h) => (
                  <SectionChip key={h.sectionId} hit={h} muted />
                ))}
              </MapRow>
            ))}
          </Column>
        </div>

        <div className="grid gap-px border-t border-line bg-line sm:grid-cols-2 xl:grid-cols-4">
          <Principle title="EU REACH always applies">
            {EU_REACH.map((h) => SECTION_BY_ID[h.sectionId]?.code).join(" and ")} are in every questionnaire, whatever the answers.
          </Principle>
          <Principle title="The stricter rule wins">
            <span className="inline-flex flex-wrap items-center gap-1">
              Mandatory <Gt /> Optional <Gt /> Not applicable
            </span>
            <span className="mt-0.5 block">when two rules touch the same section.</span>
          </Principle>
          <Principle title="Same answers, same questionnaire">
            The rule-set version is logged on the case, so every scope can be reproduced <span className="whitespace-nowrap">(REQ-PROC-009).</span>
          </Principle>
          <Principle title="Always in the questionnaire">
            {ALWAYS_DOC_HITS.length} sections stated as always in your document.{" "}
            <button type="button" onClick={() => setShowAssumed((v) => !v)} aria-expanded={showAssumed} className="font-medium text-brand hover:underline">
              {showAssumed ? "Hide" : "Show"} {ALWAYS_ASSUMED_HITS.length} more we assumed
            </button>
          </Principle>
        </div>
        {showAssumed && (
          <div className="border-t border-line bg-surface-2 px-5 py-4">
            <p className="mb-2 text-[12.5px] text-ink-2">Your document does not say whether these are always shown. We assumed yes, to confirm with each section owner.</p>
            <div className="flex flex-wrap gap-1.5">
              {ALWAYS_ASSUMED_HITS.map((h) => (
                <SectionChip key={h.sectionId} hit={h} />
              ))}
            </div>
          </div>
        )}
      </Card>
    </PageSection>
  );
}

function Column({ title, code, note, children }: { title: string; code: string; note: string; children: ReactNode }) {
  return (
    <div className="min-w-0 px-5 py-4">
      <div className="mb-3">
        <div className="flex items-baseline gap-2">
          <h3 className="text-[14px] font-semibold text-ink">{title}</h3>
          <span className="font-mono text-[11.5px] text-ink-3">{code}</span>
        </div>
        <p className="mt-0.5 text-[12px] text-ink-3">
          <NoBreakIds text={note} />
        </p>
      </div>
      <ul className="space-y-2.5">{children}</ul>
    </div>
  );
}

function MapRow({ input, code, sub, muted, title, children }: { input: string; code?: string; sub?: string; muted?: boolean; title?: string; children: ReactNode }) {
  return (
    <li title={title} className={cx("grid grid-cols-[minmax(0,0.9fr)_14px_minmax(0,1.1fr)] items-start gap-2", muted && "opacity-60")}>
      <div className="min-w-0">
        <div className="text-[13px] leading-snug font-medium text-ink">
          {code && <span className="mr-1.5 font-mono text-[11px] font-normal whitespace-nowrap text-ink-3">{code}</span>}
          {input}
        </div>
        {sub && (
          <div className="mt-0.5 text-[11.5px] leading-snug text-ink-3">
            <NoBreakIds text={sub} />
          </div>
        )}
      </div>
      <ArrowRight size={13} className="mt-[3px] text-ink-3" aria-hidden />
      <div className="flex min-w-0 flex-wrap gap-1">{children}</div>
    </li>
  );
}

function SectionChip({ hit, muted }: { hit: Hit; muted?: boolean }) {
  const sec = SECTION_BY_ID[hit.sectionId];
  const label = sec ? sec.code.replace("Annex ", "A") : hit.sectionId;
  const na = hit.outcome === "na";
  return (
    <span
      title={sec ? `${sec.code} · ${sec.title}` : hit.sectionId}
      className={cx(
        "inline-flex max-w-full items-baseline gap-1 rounded-md px-1.5 py-0.5 text-[11.5px] leading-tight",
        muted ? "border border-dashed border-line-strong text-ink-3" : na ? "bg-surface-3 text-ink-3" : "bg-brand-soft text-brand",
      )}
    >
      <span className="shrink-0 font-mono font-medium">{label}</span>
      {na ? <span>not applicable</span> : <span className={cx(!muted && "text-ink-2")}>{sec?.title}</span>}
      {hit.outcome === "optional" && <span className="font-medium">· optional</span>}
    </span>
  );
}

function Principle({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="bg-surface-2 px-5 py-3.5">
      <div className="text-[13px] font-semibold text-ink">{title}</div>
      <div className="mt-0.5 text-[12.5px] leading-snug text-ink-2">{children}</div>
    </div>
  );
}

const Gt = () => <span className="text-ink-3">&gt;</span>;
