import { ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Badge, Button, Drawer, IconButton, KeyValue } from "@/components/ui";
import { ASSUMPTIONS_LIST, PERSONA_BY_ID } from "@/domain/catalog";
import { useStore } from "@/store/store";
import { BAND_LABEL, LANES, STEP_BY_ID, STEP_ORDER } from "./content";
import { CodeChip, EMPTY_REVIEW, NoBreakIds, firstName, type Reviews } from "./shared";
import { VerdictBadge } from "./VerdictBadge";
import { callText, useCallMode } from "./callMode";

const ASSUMPTION_BY_ID = Object.fromEntries(ASSUMPTIONS_LIST.map((a) => [a.id, a]));

export function StepDrawer({ stepId, onClose, onNavigate, reviews, onGoToAssumption }: { stepId: string | null; onClose: () => void; onNavigate: (id: string) => void; reviews: Reviews; onGoToAssumption: (id: string) => void }) {
  const { state, persona: current, setPersona } = useStore();
  const nav = useNavigate();
  const call = useCallMode();
  const step = stepId ? STEP_BY_ID[stepId] : undefined;
  const order = STEP_ORDER;
  const idx = step ? order.indexOf(step.id) : -1;
  const prev = idx > 0 ? order[idx - 1] : undefined;
  const next = idx >= 0 && idx < order.length - 1 ? order[idx + 1] : undefined;

  useEffect(() => {
    if (!step) return;
    const h = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.key === "ArrowRight" && next) onNavigate(next);
      if (e.key === "ArrowLeft" && prev) onNavigate(prev);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [step, next, prev, onNavigate]);

  if (!step) return null;

  const lane = LANES.find((l) => l.id === step.lane)!;
  const alsoLane = step.alsoLane ? LANES.find((l) => l.id === step.alsoLane) : undefined;
  const p = step.persona ? PERSONA_BY_ID[step.persona] : undefined;
  const user = p ? state.users.find((u) => u.id === p.userId) : undefined;

  const viewAs = () => {
    if (!p) return;
    setPersona(p.id);
    onClose();
    nav(p.landing);
  };

  return (
    <Drawer
      open
      onClose={onClose}
      width={560}
      title={`Step ${step.n} · ${step.title}`}
      subtitle={BAND_LABEL[step.band]}
      footer={
        <div className="flex w-full items-center justify-between gap-3">
          <div className="flex items-center gap-1">
            <IconButton label="Previous step" disabled={!prev} onClick={() => prev && onNavigate(prev)} className="disabled:pointer-events-none disabled:opacity-40">
              <ChevronLeft size={16} />
            </IconButton>
            <span className="min-w-[64px] text-center text-[12px] text-ink-3 tabular-nums">
              {idx + 1} of {order.length}
            </span>
            <IconButton label="Next step" disabled={!next} onClick={() => next && onNavigate(next)} className="disabled:pointer-events-none disabled:opacity-40">
              <ChevronRight size={16} />
            </IconButton>
          </div>
          {call ? (
            <span />
          ) : p && user ? (
            <Button variant="primary" size="sm" onClick={viewAs} iconRight={<ArrowRight size={14} />}>
              {current.id === p.id ? `Open ${firstName(user.name)}'s start page` : `View as ${firstName(user.name)}`}
            </Button>
          ) : (
            <span className="text-[12px] text-ink-3">Automatic step, no person acts here</span>
          )}
        </div>
      }
    >
      <div className="space-y-6">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={step.lane === "supplier" ? "violet" : "neutral"}>{lane.label}</Badge>
          {alsoLane && <Badge tone={alsoLane.id === "supplier" ? "violet" : "neutral"}>{alsoLane.label}</Badge>}
          {step.gate && <Badge tone="brand">Gate between Part 1 and Part 2</Badge>}
        </div>

        <KeyValue
          cols={1}
          items={[
            { k: "Who", v: step.who },
            ...(p && user && !call ? [{ k: "Shown in the prototype as", v: `${user.name}, ${p.label}` }] : []),
            { k: "Where it comes from", v: <NoBreakIds text={step.source} /> },
          ]}
        />

        <section>
          <h3 className="mb-1.5 text-[13px] font-semibold text-ink">What happens</h3>
          <p className="text-[13.5px] leading-relaxed text-pretty text-ink-2">
            <NoBreakIds text={call ? callText(step.what) : step.what} />
          </p>
        </section>

        <section>
          <h3 className="mb-2 text-[13px] font-semibold text-ink">Rules and validations</h3>
          <ul className="space-y-2">
            {step.rules.map((r) => (
              <li key={r} className="flex gap-2.5 text-[13px] leading-snug text-ink-2">
                <span aria-hidden className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-ink-3" />
                <span>
                  <NoBreakIds text={r} />
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h3 className="mb-2 text-[13px] font-semibold text-ink">Beiersdorf requirement IDs</h3>
          <div className="flex flex-wrap gap-1.5">
            {step.reqs.map((r) => (
              <CodeChip key={r}>{r}</CodeChip>
            ))}
          </div>
        </section>

        {!call && step.assumptions.length > 0 && (
          <section>
            <h3 className="mb-2 text-[13px] font-semibold text-ink">{step.assumptions.length === 1 ? "Assumption behind this step" : "Assumptions behind this step"}</h3>
            <div className="space-y-2">
              {step.assumptions.map((id) => {
                const a = ASSUMPTION_BY_ID[id];
                if (!a) return null;
                return (
                  <div key={id} className="rounded-lg border border-line bg-surface-2 p-3">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <CodeChip tone="brand">{a.id}</CodeChip>
                      <span className="text-[13px] font-semibold text-ink">{a.topic}</span>
                      <span className="ml-auto">
                        <VerdictBadge verdict={(reviews[id] ?? EMPTY_REVIEW).verdict} />
                      </span>
                    </div>
                    <p className="text-[13px] leading-snug text-ink-2">
                      <NoBreakIds text={a.text} />
                    </p>
                    <button type="button" onClick={() => onGoToAssumption(id)} className="mt-2 text-[12.5px] font-medium text-brand hover:underline">
                      Confirm or change it in the list
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </div>
    </Drawer>
  );
}
