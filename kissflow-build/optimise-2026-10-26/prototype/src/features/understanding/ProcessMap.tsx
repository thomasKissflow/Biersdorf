// The swimlane: lanes are columns, steps run top to bottom. Part 1 is one supplier step, closed by the
// completeness gate. In Part 2, RMM (step 4) and the departments (step 5) review side by side in one row,
// and both ask the supplier directly; the release waits for all of them (step 6) before the closure.

import { ArrowLeftRight, Cpu, Factory, MoveHorizontal, UserRound, Users } from "lucide-react";
import { useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from "react";
import { Card, cx } from "@/components/ui";
import { DEPT_SHORT, REVIEW_DEPTS } from "@/domain/catalog";
import { Connectors, useNodeBoxes, type Edge } from "./Connectors";
import { BAND_RAIL, GHOSTS, LANES, STEPS, type Band, type LaneId, type StepDef } from "./content";

const LANE_COL: Record<LaneId, number> = { supplier: 2, system: 3, rmm: 4, depts: 5 };
const LANE_ICON = { Factory, Cpu, UserRound, Users };

// Grid rows: 1 lane headers · 2–3 steps 1–2 · 4 gate · 5 step 3 · 6 steps 4 and 5 · 7 query loop under RMM ·
// 8 step 6 · 9–10 steps 7–8.
const gridRow = (row: number) => (row <= 2 ? row + 1 : row <= 4 ? row + 2 : row + 3);
const GATE_ROW = 4;
const LOOP_ROW = 7;
const CLOSURE_ROW = gridRow(6);
const LAST_ROW = gridRow(7);

const place = (lane: LaneId, row: number): CSSProperties => ({ gridColumn: LANE_COL[lane], gridRow: gridRow(row) });

// Step 3 forks into RMM's review (4) and the departments' review (5); both join again into the final
// release (7). The supplier talks to RMM straight across the row and to the departments along the loop
// row below RMM's card, so no line runs through a card.
const EDGES: Edge[] = [
  { from: "s1", to: "s2", kind: "flow", route: "down" },
  { from: "s2", to: "s3", kind: "flow", route: "down" },
  { from: "s3", to: "s4", kind: "flow", route: "down" },
  { from: "s3", to: "s5", kind: "flow", route: "down" },
  { from: "g5", to: "s4", kind: "loop", route: "side", both: true },
  { from: "g5", to: "s5", kind: "loop", route: "under", via: "loop-label", land: 0.25, both: true },
  { from: "s4", to: "g6", kind: "flow", route: "down", bridge: true },
  { from: "s5", to: "s6", kind: "flow", route: "down" },
  { from: "g6", to: "s7", kind: "flow", route: "down" },
  { from: "s6", to: "s7", kind: "flow", route: "down" },
  { from: "s7", to: "s8", kind: "flow", route: "down" },
  { from: "s8", to: "g8", kind: "flow", route: "side" },
];

export function ProcessMap({ selected, onOpen }: { selected: string | null; onOpen: (stepId: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const { boxes, size } = useNodeBoxes(ref);
  const scroller = useRef<HTMLDivElement>(null);
  const scrolls = useOverflowsX(scroller);

  return (
    <Card className="overflow-hidden">
      {scrolls && (
        <div className="flex items-center gap-2 border-b border-line bg-surface-2 px-4 py-2 text-[12px] text-ink-2">
          <MoveHorizontal size={14} className="shrink-0 text-ink-3" aria-hidden />
          Scroll sideways to see all four lanes
        </div>
      )}
      <div ref={scroller} className="overflow-x-auto scrollbar-thin">
        <div ref={ref} className="relative isolate min-w-[920px] p-4 lg:p-5">
          <div className="grid gap-x-2 gap-y-3" style={{ gridTemplateColumns: "30px repeat(3, minmax(0, 1fr)) minmax(0, 1.3fr)", gridTemplateRows: `repeat(${LAST_ROW}, auto)` }}>
            {/* Lane headers and lane backgrounds */}
            {LANES.map((l) => {
              const Icon = LANE_ICON[l.icon];
              return (
                <div key={l.id} style={{ gridColumn: LANE_COL[l.id], gridRow: 1 }} className="flex items-start gap-2 px-2 pb-1">
                  <span className={cx("mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg", l.id === "supplier" ? "bg-violet-soft text-violet" : "bg-surface-3 text-ink-2")}>
                    <Icon size={15} strokeWidth={1.9} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[13px] leading-tight font-semibold text-ink">{l.label}</span>
                    <span className="mt-0.5 block text-[11.5px] leading-snug text-ink-3">{l.sub}</span>
                  </span>
                </div>
              );
            })}
            {LANES.map((l) => (
              <div key={`bg-${l.id}`} aria-hidden style={{ gridColumn: LANE_COL[l.id], gridRow: `2 / ${LAST_ROW + 1}` }} className="rounded-xl bg-surface-2" />
            ))}

            {/* Phase bands in the left gutter */}
            <BandRail band="part1" style={{ gridColumn: 1, gridRow: `2 / ${GATE_ROW}` }} />
            <div aria-hidden style={{ gridColumn: 1, gridRow: GATE_ROW }} className="flex items-center justify-center">
              <span className="h-2.5 w-2.5 rotate-45 rounded-[2px] bg-brand" />
            </div>
            <BandRail band="part2" style={{ gridColumn: 1, gridRow: `${GATE_ROW + 1} / ${CLOSURE_ROW}` }} />
            <BandRail band="closure" style={{ gridColumn: 1, gridRow: `${CLOSURE_ROW} / ${LAST_ROW + 1}` }} />

            {/* Gate between Part 1 and Part 2 */}
            <div style={{ gridColumn: "2 / -1", gridRow: GATE_ROW }} className="relative z-[2] grid grid-cols-subgrid items-center py-1.5">
              <div aria-hidden style={{ gridColumn: "1 / -1", gridRow: 1 }} className="mx-1 border-t-2 border-dashed border-brand/60" />
              <div style={{ gridColumn: "3 / 5", gridRow: 1 }} className="justify-self-center rounded-full bg-brand px-3 py-1 text-[12px] font-medium whitespace-nowrap text-brand-ink shadow-card">
                Gate: Part 1 closes, the reviews start
              </div>
            </div>

            {/* Query loop label: sits on the departments' loop line, which passes below RMM's card */}
            <div data-node="loop-label" style={{ gridColumn: LANE_COL.system, gridRow: LOOP_ROW }} className="relative z-[2] self-center justify-self-center">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-1 text-[11.5px] font-medium whitespace-nowrap text-ink-2 shadow-card">
                <ArrowLeftRight size={13} className="text-ink-3" />
                Direct, no relay through RMM
              </span>
            </div>

            {STEPS.map((s) => (
              <StepCard key={s.id} step={s} selected={selected === s.id} onOpen={onOpen} />
            ))}
            {GHOSTS.map((g) => (
              <button
                key={g.id}
                data-node={g.id}
                type="button"
                onClick={() => onOpen(g.opens)}
                style={place(g.lane, g.row)}
                className="relative z-[2] mx-2 self-center rounded-lg border border-dashed border-line-strong bg-surface px-3 py-2 text-left text-[12px] leading-snug text-ink-2 transition-colors duration-200 hover:border-brand hover:text-ink"
              >
                {g.label}
              </button>
            ))}
          </div>
          <Connectors edges={EDGES} boxes={boxes} size={size} />
        </div>
      </div>
      <Legend />
    </Card>
  );
}

/** True while the element's content is wider than its box (the map then scrolls sideways). */
function useOverflowsX(ref: RefObject<HTMLElement | null>) {
  const [over, setOver] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setOver(el.scrollWidth > el.clientWidth + 1);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    return () => ro.disconnect();
  }, [ref]);
  return over;
}

function StepCard({ step: s, selected, onOpen }: { step: StepDef; selected: boolean; onOpen: (id: string) => void }) {
  const gate = !!s.gate;
  return (
    <button
      type="button"
      data-node={s.id}
      onClick={() => onOpen(s.id)}
      style={place(s.lane, s.row)}
      aria-label={`Step ${s.n}: ${s.title}`}
      className={cx(
        "group relative z-[2] mx-2 self-center rounded-lg border py-2.5 pr-3 pl-4 text-left transition-[border-color,box-shadow] duration-200",
        gate ? "border-brand bg-brand text-brand-ink shadow-card hover:shadow-pop" : "border-line bg-surface shadow-card hover:border-brand hover:shadow-pop",
        selected && "ring-2 ring-brand ring-offset-2 ring-offset-surface-2",
      )}
    >
      <span
        aria-hidden
        className={cx(
          "absolute -top-2 -left-2 flex h-5 min-w-5 items-center justify-center rounded-full border px-1 text-[11px] leading-none font-semibold tabular-nums transition-colors",
          gate ? "border-brand bg-brand-ink text-brand" : "border-line-strong bg-surface text-ink-2 group-hover:border-brand group-hover:text-brand",
          selected && !gate && "border-brand bg-brand text-brand-ink group-hover:text-brand-ink",
        )}
      >
        {s.n}
      </span>
      <span className={cx("block text-[13px] leading-snug font-semibold text-balance", gate ? "text-brand-ink" : "text-ink")}>{s.card}</span>
      {s.id === "s5" ? (
        <span className="mt-1.5 flex flex-wrap gap-1">
          {REVIEW_DEPTS.map((d) => (
            <span key={d} className="rounded bg-surface-3 px-1.5 py-px text-[10.5px] font-medium text-ink-2">
              {DEPT_SHORT[d]}
            </span>
          ))}
        </span>
      ) : (
        <span className={cx("mt-0.5 line-clamp-2 block text-[12px] leading-snug", gate ? "text-brand-ink/85" : "text-ink-3")}>{s.short}</span>
      )}
    </button>
  );
}

function BandRail({ band, style }: { band: Band; style: CSSProperties }) {
  return (
    <div style={style} className="flex justify-center">
      <div className="flex w-6 justify-center rounded-full bg-surface-2 py-3">
        <span className="rotate-180 text-[11px] font-semibold whitespace-nowrap text-ink-2 [writing-mode:vertical-rl]">{BAND_RAIL[band]}</span>
      </div>
    </div>
  );
}

function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-line bg-surface-2 px-5 py-3 text-[12px] text-ink-2">
      <span className="inline-flex items-center gap-2">
        <span className="h-3 w-5 rounded-sm bg-brand" /> Gate between Part 1 and Part 2
      </span>
      <span className="inline-flex items-center gap-2">
        <svg width="22" height="6" aria-hidden>
          <line x1="1" y1="3" x2="21" y2="3" strokeDasharray="4 3" strokeWidth="1.5" className="stroke-ink-3" />
        </svg>
        Query loop: RMM or a department and the supplier talk directly
      </span>
      <span className="inline-flex items-center gap-2">
        <span className="h-3 w-5 rounded-sm border border-dashed border-line-strong bg-surface" /> Another lane that acts in the same step
      </span>
      <span className="ml-auto text-ink-3">Click any step for the details</span>
    </div>
  );
}
