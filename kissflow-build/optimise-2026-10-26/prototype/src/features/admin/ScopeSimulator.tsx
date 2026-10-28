// "Try one material": set metadata answers (or start from a built-in reference material), pick the rule set and the
// questionnaire version, and see the derived scope, evidence and review departments at once. Nothing is saved.
import { ChevronDown, ChevronRight, FlaskConical, ShieldAlert } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge, Card, CardHeader, ChipMulti, Mono, Segmented, Select, cx } from "@/components/ui";
import { ApplicabilityBadge } from "@/components/status";
import { CONFIG_QUESTIONS, DEPT_LABEL, DEPT_SHORT, SECTION_BY_ID } from "@/domain/catalog";
import { draftSideNames } from "@/domain/configActions";
import { RULE_SETS, deriveScope, hasUndefinedOrigin, pairedTemplate, requiredEvidence, ruleSet, sectionsInTemplate } from "@/domain/rules";
import { REFERENCE_MATERIALS } from "@/domain/referenceMaterials";
import { departmentsForScope } from "@/domain/selectors";
import type { ConfigAnswers, Dept, ScopeItem } from "@/domain/types";
import { useStore } from "@/store/store";
import { SectionChips, scopeDiff, shortVersion } from "./shared";

const PRESETS = REFERENCE_MATERIALS;

function ScopeList({ items, empty }: { items: ScopeItem[]; empty: string }) {
  if (!items.length) return <p className="px-4 py-3 text-[13px] text-ink-3">{empty}</p>;
  return (
    <ul className="divide-y divide-line">
      {items.map((it) => {
        const sec = SECTION_BY_ID[it.sectionId];
        return (
          <li key={it.sectionId} className="flex items-start gap-3 px-4 py-2">
            <Mono className="w-[66px] shrink-0 pt-px text-ink-2">{sec.code}</Mono>
            <div className="min-w-0 flex-1">
              <div className="text-[13px] text-ink">{sec.title}</div>
              <div className="text-xs text-ink-3">{it.reason}</div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** `initial`: the reference material to start from (default: the first one). */
export function ScopeSimulator({ initial }: { initial?: string }) {
  const { state } = useStore();
  const start = PRESETS.find((p) => p.id === initial) ?? PRESETS[0];
  const [config, setConfig] = useState<ConfigAnswers>(start.config);
  const [preset, setPreset] = useState<string | null>(start.id);
  const [rs, setRs] = useState(state.activeRuleSet);
  const [tpl, setTpl] = useState(() => pairedTemplate(state.activeRuleSet));
  const [showNa, setShowNa] = useState(false);
  // The open draft is listed under its working numbers; it is named by the numbers publishing would give, so a side
  // the draft does not change shows the version it keeps (a questionnaire-only draft never shows an RS-2026.4).
  const names = useMemo(() => draftSideNames(state), [state.config, state.ownership]);
  const rsName = (v: string) => (names && v === names.ruleSet.working ? names.ruleSet.shown : v);
  const tplName = (v: string) => shortVersion(names && v === names.template.working ? names.template.shown : v);
  const isDraft = (r: string, t: string) => !!names && (r === names.ruleSet.working || t === names.template.working);
  const pairName = (r: string, t: string) => `${rsName(r)} · ${tplName(t)}${isDraft(r, t) ? " (draft)" : ""}`;

  const patch = (p: ConfigAnswers) => {
    setConfig((c) => ({ ...c, ...p }));
    setPreset(null);
  };
  const applyPreset = (id: string) => {
    const p = PRESETS.find((x) => x.id === id)!;
    setConfig(p.config);
    setPreset(id);
  };
  const pickRuleSet = (v: string) => {
    setRs(v);
    setTpl(pairedTemplate(v));
  };

  const result = useMemo(() => {
    const scope = deriveScope(config, rs, tpl);
    const mandatory = scope.filter((s) => s.applicability === "mandatory");
    const optional = scope.filter((s) => s.applicability === "optional");
    const na = scope.filter((s) => s.applicability === "na");
    const evidence = requiredEvidence(config, rs);
    const manual = hasUndefinedOrigin(config);
    const depts = departmentsForScope(scope, state.ownership);
    const informed = (["CUS", "LEG"] as Dept[]).filter((d) => scope.some((s) => s.applicability !== "na" && state.ownership[s.sectionId]?.lead === d));
    const ledBy = (d: Dept) => scope.filter((s) => s.applicability !== "na" && state.ownership[s.sectionId]?.lead === d).length;
    const ledCodes = (d: Dept) => scope.filter((s) => s.applicability !== "na" && state.ownership[s.sectionId]?.lead === d).map((s) => SECTION_BY_ID[s.sectionId]?.code ?? s.sectionId);
    const inTpl = new Set(sectionsInTemplate(tpl));
    const ignored = [
      ...new Set(
        ruleSet(rs)
          .rules.filter((r) => r.when(config))
          .flatMap((r) => r.activates),
      ),
    ].filter((id) => !inTpl.has(id));
    // Compare with the version before (the next one for the first); always read from the older to the newer.
    const idx = Math.max(0, RULE_SETS.findIndex((r) => r.version === rs));
    const other = RULE_SETS[idx > 0 ? idx - 1 : 1] ?? RULE_SETS[idx];
    const otherScope = deriveScope(config, other.version, other.templateVersion);
    const otherIsOlder = RULE_SETS.indexOf(other) < idx;
    const diff = otherIsOlder ? scopeDiff(otherScope, scope) : scopeDiff(scope, otherScope);
    const from = otherIsOlder ? pairName(other.version, other.templateVersion) : pairName(rs, tpl);
    const to = otherIsOlder ? pairName(rs, tpl) : pairName(other.version, other.templateVersion);
    const alwaysIds = new Set(
      ruleSet(rs)
        .rules.filter((r) => r.question === "ALWAYS")
        .map((r) => r.id),
    );
    const byAnswers = mandatory.filter((s) => s.firedRules.some((id) => !alwaysIds.has(id)));
    const always = mandatory.filter((s) => !byAnswers.includes(s));
    return { scope, mandatory, byAnswers, always, optional, na, evidence, manual, depts, informed, ledBy, ledCodes, ignored, diff, from, to };
  }, [config, rs, tpl, state.ownership, state.config, names]);

  const activePreset = PRESETS.find((p) => p.id === preset);
  const hasDraft = RULE_SETS.some((r) => r.status === "draft");
  const yesNo = CONFIG_QUESTIONS.filter((q) => q.kind === "yesno");
  const diffEmpty = !result.diff.added.length && !result.diff.removed.length && !result.diff.changed.length;

  return (
    <div className="grid gap-5 xl:grid-cols-[420px_minmax(0,1fr)]">
      {/* ------------------------------------------------ answers */}
      <Card className="self-start">
        <CardHeader title="Metadata answers (SF-01 to SF-12)" subtitle="Answer as a supplier would, or start from an example material." />
        <div className="space-y-5 px-4 py-4">
          <div>
            <div className="mb-1.5 text-xs font-medium text-ink-3">Start from</div>
            <div className="flex flex-wrap gap-1.5">
              {PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  data-testid={`try-material-${p.id}`}
                  aria-pressed={preset === p.id}
                  onClick={() => applyPreset(p.id)}
                  className={cx(
                    "rounded-lg border px-2.5 py-1 text-left text-[12.5px] transition-colors",
                    preset === p.id ? "border-brand bg-brand-soft font-medium text-brand" : "border-line-strong bg-surface text-ink-2 hover:border-ink-3 hover:text-ink",
                  )}
                >
                  {p.id === "turkey" && !hasDraft ? "Triglyceride for Turkey (Turkey REACH)" : p.label}
                </button>
              ))}
            </div>
            <p className="mt-2 text-[12.5px] text-ink-3">{activePreset ? activePreset.look : "Custom answers: the result updates as you change them."}</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block min-w-0 space-y-1">
              <span className="text-xs font-medium text-ink-3">Rule set</span>
              <Select value={rs} aria-label="Rule set" data-testid="sim-rule-set" onChange={(e) => pickRuleSet(e.target.value)}>
                {RULE_SETS.map((r) => (
                  <option key={r.version} value={r.version}>
                    {r.status === "draft" && names && !names.ruleSet.changed ? `Draft: rules stay ${names.ruleSet.shown}` : `${r.version} (${r.status === "published" ? "used for new cases" : r.status})`}
                  </option>
                ))}
              </Select>
            </label>
            <label className="block min-w-0 space-y-1">
              <span className="text-xs font-medium text-ink-3">Questionnaire</span>
              <Select value={tpl} aria-label="Questionnaire" data-testid="sim-questionnaire" onChange={(e) => setTpl(e.target.value)}>
                {state.templates.map((t) => (
                  <option key={t.version} value={t.version}>
                    {t.status === "draft" && names && !names.template.changed ? `Draft: questionnaire stays ${shortVersion(names.template.shown)}` : `${shortVersion(t.version)} (${t.status})`}
                  </option>
                ))}
              </Select>
            </label>
          </div>

          {CONFIG_QUESTIONS.filter((q) => q.kind === "multi").map((q) => (
            <div key={q.id}>
              <div className="mb-1.5 flex items-baseline gap-2">
                <Mono className="text-ink-3">{q.code}</Mono>
                <span className="text-[13px] font-medium text-ink">{q.label}</span>
              </div>
              <ChipMulti
                value={(config[q.id] as string[] | undefined) ?? []}
                onChange={(v) => patch({ [q.id]: v } as ConfigAnswers)}
                options={q.id === "SF11" ? (q.options ?? []).map((o) => ({ value: o.value, label: o.value === "OTHER" ? "Other" : o.value })) : (q.options ?? [])}
              />
            </div>
          ))}

          <div className="space-y-2.5">
            {yesNo.map((q) => (
              <div key={q.id} className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <Mono className="mr-1.5 text-ink-3">{q.code}</Mono>
                  <span className="text-[13px] text-ink">{q.label}</span>
                </div>
                <Segmented<"yes" | "no">
                  value={config[q.id] === true ? "yes" : config[q.id] === false ? "no" : undefined}
                  onChange={(v) => patch({ [q.id]: v === "yes" } as ConfigAnswers)}
                  options={[
                    { value: "yes", label: "Yes" },
                    { value: "no", label: "No" },
                  ]}
                />
              </div>
            ))}
          </div>
        </div>
      </Card>

      {/* ------------------------------------------------ result */}
      <div className="min-w-0 space-y-4">
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
            <div className="flex items-center gap-2">
              <FlaskConical size={16} className="text-brand" />
              <h3 className="text-[15px] font-semibold text-ink">Derived scope</h3>
              <span className="text-[13px] text-ink-3" data-testid="sim-pair">
                <Mono>{rsName(rs)}</Mono> · questionnaire {tplName(tpl)}
                {isDraft(rs, tpl) ? " (draft)" : ""}
              </span>
            </div>
            <span className="text-xs text-ink-3">A test only: no case is created or changed</span>
          </div>
          <div className="grid grid-cols-3 divide-x divide-line">
            {[
              { label: "Mandatory", n: result.mandatory.length, cls: "text-brand" },
              { label: "Optional", n: result.optional.length, cls: "text-ink" },
              { label: "Not applicable", n: result.na.length, cls: "text-ink-3" },
            ].map((k) => (
              <div key={k.label} className="px-4 py-3">
                <div className="text-[12.5px] text-ink-3">{k.label}</div>
                <div className={cx("mt-0.5 text-[26px] leading-none font-semibold tracking-tight", k.cls)}>{k.n}</div>
              </div>
            ))}
          </div>
          {result.manual && (
            <div className="flex items-start gap-3 border-t border-line bg-warn-soft px-4 py-3 text-[13px]">
              <ShieldAlert size={16} className="mt-px shrink-0 text-[color-mix(in_oklch,var(--warn)_75%,var(--ink))]" />
              <div>
                <p className="font-semibold text-ink">Origin without rules: flagged for RMM's review</p>
                <p className="text-ink-2">
                  No rules exist yet for a waste, carbon-capture or chemically recycled origin. The supplier gets the standard sections below; the case is flagged on RMM's review, where RMM or a department asks the
                  supplier for more if needed.
                </p>
              </div>
            </div>
          )}
          {result.ignored.length > 0 && (
            <div className="border-t border-line px-4 py-2.5 text-[12.5px] text-ink-3">
              Rules point to <SectionChips ids={result.ignored} />, which questionnaire {tplName(tpl)} does not have: they are ignored for this version.
            </div>
          )}
        </Card>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title="Who reviews" subtitle="RMM always reviews the whole CIQ; departments: lead of every active section (Section owners)." />
            <div className="space-y-2 px-4 py-3">
              <div className="flex items-center justify-between gap-2 text-[13px]">
                <span className="text-ink">{DEPT_LABEL.RMM}</span>
                <span className="text-xs text-ink-3">whole CIQ (always)</span>
              </div>
              {result.depts.length === 0 && <p className="text-[13px] text-ink-3">No department review: check the answers.</p>}
              {result.depts.map((d) => (
                <div key={d} className="flex items-center justify-between gap-2 text-[13px]">
                  <span className="text-ink">{DEPT_LABEL[d]}</span>
                  <span className="text-xs text-ink-3">
                    leads {result.ledBy(d)} {result.ledBy(d) === 1 ? "section" : "sections"}
                  </span>
                </div>
              ))}
              {result.informed.length > 0 && <p className="border-t border-line pt-2 text-[12.5px] text-ink-3">Informed, read-only: {result.informed.map((d) => `${DEPT_SHORT[d]} (${result.ledCodes(d).join(", ")})`).join(", ")}.</p>}
            </div>
          </Card>
          <Card>
            <CardHeader title="Evidence the supplier must upload" subtitle="Required by the rules that fired." />
            <ul className="space-y-1.5 px-4 py-3">
              {result.evidence.length === 0 && <li className="text-[13px] text-ink-3">No rule-specific evidence.</li>}
              {result.evidence.map((e) => (
                <li key={`${e.ruleId}-${e.doc}`} className="flex items-baseline gap-2 text-[13px]">
                  <Mono className="w-12 shrink-0 text-ink-3">{e.ruleId}</Mono>
                  <span className="text-ink">{e.doc}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>

        <Card>
          <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
            <h3 className="text-[15px] font-semibold text-ink">Rule-set comparison</h3>
            <span className="text-[13px] text-ink-3" data-testid="sim-compare">
              <Mono>{result.from}</Mono> → <Mono>{result.to}</Mono>, same answers
            </span>
          </div>
          <div className="px-4 py-3 text-[13px]">
            {diffEmpty ? (
              <span className="text-ink-2">
                <Badge tone="ok" dot>
                  No change
                </Badge>{" "}
                <span className="ml-1">Both rule sets derive the same scope for these answers.</span>
              </span>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="info" dot>
                  Changes
                </Badge>
                {result.diff.added.length > 0 && (
                  <span className="flex items-center gap-1.5 text-ink-2">
                    Added <SectionChips ids={result.diff.added} tone="ok" prefix="+ " />
                  </span>
                )}
                {result.diff.removed.length > 0 && (
                  <span className="flex items-center gap-1.5 text-ink-2">
                    Removed <SectionChips ids={result.diff.removed} tone="bad" prefix="− " />
                  </span>
                )}
                {result.diff.changed.map((c) => (
                  <span key={c.sectionId} className="text-ink-2">
                    {SECTION_BY_ID[c.sectionId].code}: {c.from} → {c.to}
                  </span>
                ))}
              </div>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title={`Mandatory sections (${result.mandatory.length})`} subtitle="Shown to the supplier; complete before the completeness confirmation." />
          <div className="border-b border-line bg-surface-2 px-4 py-1.5 text-xs font-semibold tracking-wide text-ink-3 uppercase">Activated by these answers ({result.byAnswers.length})</div>
          <ScopeList items={result.byAnswers} empty="No section is activated by a specific answer." />
          <div className="border-y border-line bg-surface-2 px-4 py-1.5 text-xs font-semibold tracking-wide text-ink-3 uppercase">Required for every case ({result.always.length})</div>
          <ScopeList items={result.always} empty="None." />
        </Card>
        <Card>
          <CardHeader title={`Optional sections (${result.optional.length})`} subtitle="Shown to the supplier; may stay empty." />
          <ScopeList items={result.optional} empty="No optional section." />
        </Card>
        <Card>
          <button type="button" onClick={() => setShowNa((v) => !v)} aria-expanded={showNa} className="flex w-full items-start gap-2 px-4 py-3 text-left">
            {showNa ? <ChevronDown size={16} className="mt-1 shrink-0 text-ink-3" /> : <ChevronRight size={16} className="mt-1 shrink-0 text-ink-3" />}
            <span className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <span className="text-[15px] font-semibold whitespace-nowrap text-ink">Not applicable ({result.na.length})</span>
              <span className="text-[13px] text-ink-3">Hidden from the supplier, kept internally with the reason</span>
            </span>
            <span className="mt-0.5 shrink-0">
              <ApplicabilityBadge a="na" />
            </span>
          </button>
          {showNa && (
            <div className="border-t border-line">
              <ScopeList items={result.na} empty="Every section applies." />
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
