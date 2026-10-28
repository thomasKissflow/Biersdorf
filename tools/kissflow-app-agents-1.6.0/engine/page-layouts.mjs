// page-layouts.mjs — the PER-PAGE layout layer of the design system.
//
// Two-layer model: the DesignLanguage (design-language.mjs) is ONE identity per app — same palette,
// type, shape, container on every page. THIS module is the second layer: each page's COMPOSITION is
// chosen from the page's JOB and priority, so an approval queue, an intake form, a registry and an
// analytics review read as different pages — never the uniform stat-row → chart → table template.
//
// kf-ux-architect emits per page:  layout: { archetype, hero: "<widgetId>", emphasis: ["<id>", …] }
// kf-prototype-builder (and the parallel role agents) COMPOSE the page per that archetype's rules.
// layoutFor(page) back-fills a sensible archetype when a spec predates this layer.
//
// IMAGERY POLICY (deliberate restraint): stock photography (royalty-free, per the spec's
// meta.imagery hints) appears ONLY where a photo carries information — entity cards in a directory
// grid and a detail header thumbnail. Never page-wide hero backgrounds, never decorative filler on
// queues/analytics/forms. `imagery: "none"` archetypes get NO photos.

export const PAGE_LAYOUTS = {
  command: {
    when: "role landing / overview — 'how is my world doing right now'",
    hero: "KPI band (3-4 stats) + the role's ONE most important operational widget directly under it",
    compose: [
      "row 1 — KPI band: 3-4 stat cards with real seeded values and deltas",
      "row 2 — the primary pair: main trend chart (span 7-8) beside the top secondary (span 4-5)",
      "row 3 — operational strip: the role's queue/pipeline/list at comfortable height",
    ],
    grid: "12-col; KPIs equal-width; charts 7/5 or 8/4 split; strip full-width",
    imagery: "none",
    forbid: ["burying the KPI band mid-page", "more than 2 chart rows"],
  },
  queue: {
    when: "approver / reviewer worklist — the job is to DECIDE on items",
    hero: "the queue table/list itself — FIRST, full-width, tall (≥50vh), with row actions (approve/reject/open)",
    compose: [
      "row 1 — the queue (hero): every column that informs the decision, row actions inline",
      "row 2 — decision context BELOW the queue: 2-3 small stats + at most one small chart",
    ],
    grid: "queue full-width first; context small-span after",
    imagery: "none",
    forbid: ["a create/New button (approvers don't initiate)", "KPI band above the queue", "charts before the queue"],
  },
  intake: {
    when: "initiator / requester — the job is to RAISE things and track mine",
    hero: "the create action — a prominent primary button (opens the form popup) in a lead card that explains what to raise",
    compose: [
      "row 1 — lead: create-action card (span 7-8) beside 'my status' mini-stats (span 4-5)",
      "row 2 — 'My items' list: everything I've raised, with status pills",
      "row 3 (optional) — one small helper: recent activity or a simple status chart",
    ],
    grid: "lead 8/4; my-items full-width",
    imagery: "none",
    forbid: ["a KPI wall (an initiator isn't monitoring the org)", "other people's queues"],
  },
  analytics: {
    when: "review / reporting / exec analysis — the job is to UNDERSTAND",
    hero: "the chart grid — 2×2 (or 2+1) charts dominate the page",
    compose: [
      "row 1 — compact KPI strip (small, single-line stats)",
      "rows 2-3 — the chart grid: trend, breakdown, comparison; every chart titled with the question it answers",
      "last — one supporting table (top-N), short",
    ],
    grid: "KPIs slim; charts 6/6 pairs; table full-width short",
    imagery: "none",
    forbid: ["tall raw tables", "action buttons scattered among charts"],
  },
  operations: {
    when: "day-to-day multi-flow operator — the job is to WORK several queues",
    hero: "the work surface: tabs (one per flow) or a split of the two main lists — dense",
    compose: [
      "row 1 — slim workload strip (counts per queue)",
      "row 2 — the tabbed/split work surface, dense rows, inline actions",
    ],
    grid: "full-width work surface; compact density regardless of app density",
    imagery: "none",
    forbid: ["chart-heavy dashboards", "hiding a queue behind a 4th tab when only 2-3 flows matter"],
  },
  board: {
    when: "pipeline / stage-managed work — the job is to MOVE items through stages",
    hero: "the kanban board, full-width",
    compose: [
      "row 1 — slim WIP strip (per-stage counts, aging)",
      "row 2 — the board (hero): one column per stage, cards with the 2-3 fields that matter",
    ],
    grid: "board full-width; columns equal",
    imagery: "none",
    forbid: ["burying the board below charts"],
  },
  directory: {
    when: "registry / catalog / roster — the job is to FIND and browse entities",
    hero: "a searchable CARD GRID of the entities",
    compose: [
      "row 1 — search + filter bar, with count",
      "row 2 — the card grid (hero): each card = stock photo thumb (when the entity is photographable — vessel, property, person, product) + name + 2-3 key fields + status pill",
      "row 3 (optional) — one aggregate strip (by-category counts)",
    ],
    grid: "cards 3-4 per row (density-dependent)",
    imagery: "card-thumb — stock photo per card from meta.imagery hints; skip photos for abstract entities (a GL account gets an icon tile, not a stock photo)",
    forbid: ["a bare table when the entity is visual", "photos on abstract entities"],
  },
  "master-detail": {
    when: "single-record focus — the job is to INSPECT one thing deeply",
    hero: "the split: selector list (span 4) + detail panel (span 8)",
    compose: [
      "left — compact selector list with search",
      "right — detail: header (title, status, key facts; ONE contextual thumb image if the entity is photographable) + sectioned fields + related-items tabs + timeline",
    ],
    grid: "4/8 split, full height",
    imagery: "detail-thumb — a single small header image where meaningful; otherwise none",
    forbid: ["detail data flattened into a giant form", "losing the list when a record is open"],
  },
  calendar: {
    when: "schedule-driven work — meetings, deadlines, bookings",
    hero: "the calendar/agenda view",
    compose: [
      "row 1 — the calendar (hero) span 8 beside 'upcoming' agenda list span 4",
      "row 2 (optional) — slim stats (this week / overdue)",
    ],
    grid: "8/4",
    imagery: "none",
    forbid: [],
  },
};

// Heuristic back-fill for specs that predate the layout layer: map a page's declared archetype /
// title / widget mix to a layout id. ux-architect SHOULD emit page.layout explicitly; this keeps old
// specs building sensibly.
export function layoutFor(page = {}) {
  if (page.layout && page.layout.archetype && PAGE_LAYOUTS[page.layout.archetype]) return page.layout.archetype;
  const a = String(page.archetype || "").toLowerCase();
  const t = String(page.title || page.name || "").toLowerCase();
  const widgets = page.widgets || [];
  const has = (ty) => widgets.some((w) => String(w.type || "").toLowerCase().includes(ty));
  if (a.includes("board") || has("kanban")) return "board";
  if (a.includes("queue") || /approval|review queue|worklist|inbox/.test(t)) return "queue";
  if (a.includes("directory") || a.includes("registry") || /roster|catalog|register|directory/.test(t)) return "directory";
  if (a.includes("detail") || has("detail")) return "master-detail";
  if (a.includes("calendar") || has("calendar") || /meeting|schedule|deadline/.test(t)) return "calendar";
  if (a.includes("analytics") || /report|analysis|nav|p&l|valuation/.test(t)) return "analytics";
  if (a.includes("intake") || /new |raise|request|submit/.test(t)) return "intake";
  if (a.includes("ops") || /desk|processing|operations/.test(t)) return "operations";
  return "command";
}

// Compact text brief for ONE layout — embedded in role-agent prompts so composition rules travel
// with the task instead of relying on the agent re-deriving them.
// UNIVERSAL_CARD_RULE — cross-cutting, applies under every archetype above, so it lives here once
// rather than repeated in each PAGE_LAYOUTS.compose[] entry. 2026-08-13: a chart widget shipped with
// no card at all (bare div, no bg-surface/shadow-panel/rounded-xl) while its sibling page on the same
// app got it right — proof the omission isn't "the pattern was unknown", it's "remembering to apply
// it on every single widget is the part that drops under time pressure." Most cookbook chart/table
// specimens (LineChart, Donut, HBars, Heatmap, GaugeRing, ProgressList, …) are deliberately card-less
// on their own — the composing page always supplies the card, exactly like StatTile's own card is
// part of ITS specimen. Stated explicitly so it can't be missed the way an implicit convention was.
const UNIVERSAL_CARD_RULE =
  "EVERY row/grid widget gets its own bg-surface shadow-panel rounded-xl card — no exceptions, no " +
  "bare full-bleed sections. Most chart/table cookbook specimens (LineChart, Donut, HBars, Heatmap, " +
  "GaugeRing, ProgressList, …) are deliberately card-less on their own; the calling page must supply " +
  "the wrapper AND the heading (<h3> inside the card, above the injection target div), the same way " +
  "every other section on the page does. Before shipping a page, check every widget on it has one — " +
  "an omission here has shipped silently before.";

export function layoutBrief(id) {
  const L = PAGE_LAYOUTS[id] || PAGE_LAYOUTS.command;
  return [
    `LAYOUT «${id}» — ${L.when}`,
    `HERO (first, most space): ${L.hero}`,
    ...L.compose.map((c) => `  • ${c}`),
    `Grid: ${L.grid}`,
    `Imagery: ${L.imagery}`,
    L.forbid.length ? `NEVER: ${L.forbid.join("; ")}` : "",
    UNIVERSAL_CARD_RULE,
  ].filter(Boolean).join("\n");
}

// The full contract block for agent docs / the conductor prompt.
export function layoutContract() {
  return Object.keys(PAGE_LAYOUTS).map((k) => layoutBrief(k)).join("\n\n");
}
