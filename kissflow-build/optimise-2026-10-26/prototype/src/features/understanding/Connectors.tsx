// Measured SVG connectors for the swimlane map. Nodes carry data-node="<id>"; after layout we read
// their boxes relative to the map and draw elbow arrows between them. Re-measures on resize and
// once web fonts are ready, so the lines always meet the cards.

import { useCallback, useId, useLayoutEffect, useState, type RefObject } from "react";

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type EdgeKind = "flow" | "loop";

export interface Edge {
  from: string;
  to: string;
  kind: EdgeKind;
  /**
   * "down": bottom of `from` to top of `to`, with an elbow when the centres differ. Down edges that
   * share a target (a join) or a source (a fork) turn at one common height, so their runs merge.
   * "side": horizontal between two nodes in one row.
   * "under": from the bottom of `from` down to the middle of the `via` node, across, and up into the
   * bottom of `to`, so a loop passes below a card instead of through it.
   */
  route: "down" | "side" | "under";
  /** "under" only: the node whose vertical middle carries the horizontal run (e.g. a label on the line). */
  via?: string;
  /** "under" only: where along the width of `to` the line arrives (0…1, default the centre). */
  land?: number;
  /** Arrowheads at both ends (query loop). */
  both?: boolean;
  /** Painted over a gap in the lane colour, so a loop line it crosses reads as passing underneath. */
  bridge?: boolean;
}

export function useNodeBoxes(ref: RefObject<HTMLDivElement | null>) {
  const [boxes, setBoxes] = useState<Record<string, Box>>({});
  const [size, setSize] = useState({ w: 0, h: 0 });

  const measure = useCallback(() => {
    const root = ref.current;
    if (!root) return;
    const base = root.getBoundingClientRect();
    const next: Record<string, Box> = {};
    root.querySelectorAll<HTMLElement>("[data-node]").forEach((el) => {
      const r = el.getBoundingClientRect();
      next[el.dataset.node!] = { x: r.left - base.left, y: r.top - base.top, w: r.width, h: r.height };
    });
    setBoxes(next);
    setSize({ w: base.width, h: base.height });
  }, [ref]);

  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    measure();
    const ro = new ResizeObserver(() => measure());
    ro.observe(root);
    root.querySelectorAll<HTMLElement>("[data-node]").forEach((el) => ro.observe(el));
    let alive = true;
    document.fonts?.ready.then(() => alive && measure()).catch(() => undefined);
    return () => {
      alive = false;
      ro.disconnect();
    };
  }, [measure, ref]);

  return { boxes, size };
}

/** How far above the target an elbow turns: just above it, so the horizontal run stays clear of other rows. */
const turnOffset = (gap: number) => Math.min(14, Math.max(6, gap / 2));

function downPath(a: Box, b: Box, turn?: number): string {
  const x1 = a.x + a.w / 2;
  const y1 = a.y + a.h;
  const x2 = b.x + b.w / 2;
  const y2 = b.y - 1;
  if (Math.abs(x1 - x2) < 2) return `M${x1},${y1} V${y2}`;
  const yt = turn ?? y2 - turnOffset(y2 - y1);
  const dir = x2 > x1 ? 1 : -1;
  const r = Math.max(0, Math.min(8, Math.abs(x2 - x1) / 2, (yt - y1) / 1.5, (y2 - yt) / 1.2));
  return [`M${x1},${y1}`, `V${yt - r}`, `Q${x1},${yt} ${x1 + dir * r},${yt}`, `H${x2 - dir * r}`, `Q${x2},${yt} ${x2},${yt + r}`, `V${y2}`].join(" ");
}

function sidePath(a: Box, b: Box): string {
  const leftToRight = a.x < b.x;
  const x1 = leftToRight ? a.x + a.w : a.x;
  const x2 = leftToRight ? b.x - 1 : b.x + b.w + 1;
  const y = (a.y + a.h / 2 + b.y + b.h / 2) / 2;
  return `M${x1},${y} H${x2}`;
}

function underPath(a: Box, b: Box, via: Box, land = 0.5): string {
  const x1 = a.x + a.w / 2;
  const y1 = a.y + a.h;
  const x2 = b.x + b.w * land;
  const y2 = b.y + b.h + 1;
  const y = via.y + via.h / 2;
  const dir = x2 > x1 ? 1 : -1;
  const r = Math.max(0, Math.min(8, Math.abs(x2 - x1) / 2, (y - y1) / 1.5, (y - y2) / 1.5));
  return [`M${x1},${y1}`, `V${y - r}`, `Q${x1},${y} ${x1 + dir * r},${y}`, `H${x2 - dir * r}`, `Q${x2},${y} ${x2},${y - r}`, `V${y2}`].join(" ");
}

const edgeKey = (e: Edge) => `${e.from}-${e.to}`;

/** Common turn heights for joins (several down edges into one node) and forks (several out of one node). */
function sharedTurns(edges: Edge[], boxes: Record<string, Box>): Record<string, number> {
  const down = edges.filter((e) => e.route === "down" && boxes[e.from] && boxes[e.to]);
  const turns: Record<string, number> = {};
  const groups = (by: (e: Edge) => string) => {
    const m = new Map<string, Edge[]>();
    for (const e of down) m.set(by(e), [...(m.get(by(e)) ?? []), e]);
    return [...m.values()].filter((g) => g.length > 1);
  };
  for (const g of groups((e) => e.to)) {
    const y2 = boxes[g[0].to].y - 1;
    const y1 = Math.max(...g.map((e) => boxes[e.from].y + boxes[e.from].h));
    for (const e of g) turns[edgeKey(e)] = y2 - turnOffset(y2 - y1);
  }
  for (const g of groups((e) => e.from)) {
    const y1 = boxes[g[0].from].y + boxes[g[0].from].h;
    const y2 = Math.min(...g.map((e) => boxes[e.to].y - 1));
    for (const e of g) turns[edgeKey(e)] ??= y2 - turnOffset(y2 - y1);
  }
  return turns;
}

export function Connectors({ edges, boxes, size }: { edges: Edge[]; boxes: Record<string, Box>; size: { w: number; h: number } }) {
  const uid = `cx${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  if (!size.w) return null;
  const turns = sharedTurns(edges, boxes);
  const paths = edges.flatMap((e) => {
    const a = boxes[e.from];
    const b = boxes[e.to];
    if (!a || !b) return [];
    const via = e.via ? boxes[e.via] : undefined;
    if (e.route === "under" && !via) return [];
    const d = e.route === "down" ? downPath(a, b, turns[edgeKey(e)]) : e.route === "under" ? underPath(a, b, via!, e.land) : sidePath(a, b);
    return [{ e, d }];
  });
  const marker = `url(#${uid}-arrow)`;
  // Loops first, then the gaps of bridging lines, then the flow on top.
  const loops = paths.filter((p) => p.e.kind === "loop");
  const flows = paths.filter((p) => p.e.kind === "flow");
  return (
    <svg aria-hidden className="pointer-events-none absolute inset-0 z-[1] overflow-visible" width={size.w} height={size.h} viewBox={`0 0 ${size.w} ${size.h}`}>
      <defs>
        <marker id={`${uid}-arrow`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" markerUnits="userSpaceOnUse" orient="auto-start-reverse">
          <path d="M0,1 L9,5 L0,9 z" className="fill-ink-3" />
        </marker>
      </defs>
      {loops.map(({ e, d }) => (
        <path key={edgeKey(e)} d={d} fill="none" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" strokeDasharray="4 4" markerEnd={marker} markerStart={e.both ? marker : undefined} className="stroke-ink-3" />
      ))}
      {flows
        .filter((p) => p.e.bridge)
        .map(({ e, d }) => (
          <path key={`gap-${edgeKey(e)}`} d={d} fill="none" strokeWidth={8} className="stroke-surface-2" />
        ))}
      {flows.map(({ e, d }) => (
        <path key={edgeKey(e)} d={d} fill="none" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" markerEnd={marker} markerStart={e.both ? marker : undefined} className="stroke-ink-3" />
      ))}
    </svg>
  );
}
