// data-display.mjs — Donut · Legend · Table · StatTile · MetricCard · ProgressBar · SegmentBar ·
// ProgressList.
//
// starter/lib/nav.json's "Data" group, the row-and-figure half of it — ModelChart/BarChart/HBars/
// LineChart/GaugeRing/FunnelChart/Heatmap/StackedBar are charts and stay out of this file; these
// eight are the ones that show a COMPOSITION, a LIST, or a FIGURE rather than a series. Every
// snippet below is the HTML equivalent of the real component in starter/src/components/kit/,
// transcribed from its actual className string and inline styles, not re-invented — so a
// prototype and the built app produce the same DOM shape and the same computed styles under all
// three languages.
//
// Two Entries hold three components between them, on purpose, because starter's own pages do:
// donut.jsx renders Donut and Legend as one topic (a ring needs its key beside it to mean
// anything), and progress.jsx renders all three progress components on one page because "a
// ProgressBar specimen is only meaningful beside a SegmentBar one — the difference is what each
// scales against." Table and StatTile get their own, matching starter's one-component pages.
//
// StatTile and MetricCard are SEPARATE entries even though they draw the same metric-role card,
// because the thing that distinguishes them is a decision each one records and the other refuses:
// StatTile has no icon slot on purpose (its alarm state recolours the figure instead), MetricCard
// carries the icon chip and the trend line. Folding them into one entry would print one of those
// two positions and silently drop the other.

import { dedent } from "./_schema.mjs";

// ── Calendar's month grid, and Agenda's rows — generated markup ─────────────────────────────────
// REWRITTEN 2026-08-13 against kit/Calendar.jsx's own redesign (Calendar.dc.html) — the previous
// generator here transcribed the OLD component: --tone-*-dot (Foundations' rewrite names no
// --tone-* property at all any more, so every dot silently painted nothing), border-row-divider
// (retired, the current rule is border-gray-1), a "pending" event tone (dropped — Foundations'
// tone set is success/warning/info/danger, neutral), an accent-filled Selected state (now
// --color-primary-bg fill / -primary-ink ink), no Today ring, no trailing blanks (a month that
// doesn't end on a Sunday never completed its last row), and no Agenda half at all. Generated
// rather than typed out — a 31-cell grid times two Calendar specimens, plus three Agenda
// specimens with up to nine dated rows, is more repeated near-identical markup than this file
// hand-types anywhere else, and a generator can't let one cell's tone or interactivity drift from
// its neighbours the way a hand-copied one already had.
const CAL_WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// Foundations' own tone map (tokens.css §Tones), transcribed from Calendar.jsx's own `toneVars`:
// danger has no -dot token of its own ("dot reuses --color-danger, per Foundations" — inventing
// one is exactly what Calendar.jsx's own comment says not to do); neutral/unrecognised falls back
// to gray-1/secondary/text-muted, the same triplet Table's rowTone and StatusChip's neutral read.
const calToneVars = (tone) => {
  if (tone === "danger") return { dot: "var(--color-danger)", bg: "var(--color-danger-bg)", ink: "var(--color-danger-ink)" };
  if (tone === "neutral" || !tone) return { dot: "var(--color-text-muted)", bg: "var(--color-gray-1)", ink: "var(--color-secondary)" };
  return {
    dot: `var(--color-${tone}-dot, var(--color-text-muted))`,
    bg: `var(--color-${tone}-bg, var(--color-gray-1))`,
    ink: `var(--color-${tone}-ink, var(--color-secondary))`,
  };
};

// Inner-only grid rules, mirroring `cellRules` in kit/Calendar.jsx exactly: no left rule in the
// first column, no top rule in the first row, so adjacent cells share one 1px seam and the outer
// edge is left to the card. `idx` is the 0-based grid position, lead AND trailing blanks included.
const calCellRules = (idx) => (idx % 7 === 0 ? "" : "border-l ") + (idx < 7 ? "" : "border-t ") + "border-gray-1";

// Builds one Calendar grid exactly as kit/Calendar.jsx would (Calendar.jsx:87-168) — the weekday
// strip, lead/trailing blanks, and one cell per day with its marked/selected/today state, so the
// August (interactive) and September (inert) specimens below are both derived from ONE
// transcription of the real cell/tone/interactive rules rather than two hand-typed grids.
function calendarHtml({ days, lead = 0, events = [], selected, today, interactive: hasOnSelect = false }) {
  const byDay = new Map();
  for (const e of events) {
    const k = Number(e.day);
    if (!byDay.has(k)) byDay.set(k, []);
    byDay.get(k).push(e);
  }
  const trailing = (7 - ((lead + days) % 7)) % 7;

  const weekdayRow = CAL_WEEKDAYS.map((w) => `<span class="text-[11px] font-bold text-text-muted">${w.slice(0, 2)}</span>`).join("\n        ");

  const blank = (idx) => `<div aria-hidden="true" class="aspect-square cursor-default p-0.5 text-border ${calCellRules(idx)}"></div>`;
  const leadCells = Array.from({ length: lead }, (_, i) => blank(i));

  const dayCells = Array.from({ length: days }, (_, i) => i + 1).map((d) => {
    const marks = byDay.get(d) ?? [];
    const marked = marks.length > 0;
    const on = Number(selected) === d;
    const isToday = today != null && Number(today) === d;
    const cellInteractive = hasOnSelect && marked;
    const tag = cellInteractive ? "button" : "div";
    const label = marked ? `${d} — ${marks.length} event${marks.length > 1 ? "s" : ""}` : String(d);
    const innerClass =
      "flex h-full w-full flex-col items-center justify-center gap-1 rounded-lg border-0 p-1 text-center transition-colors " +
      (cellInteractive ? "cursor-pointer outline-none focus-visible:ring focus-visible:ring-ring " : "cursor-default ") +
      (on
        ? "bg-primary-bg text-primary-ink font-medium "
        : "bg-transparent text-secondary font-normal " + (cellInteractive ? "hover:bg-row-hover " : "")) +
      (isToday ? "inset-ring inset-ring-primary " : "");
    const dots = marked
      ? `<span class="flex justify-center gap-[3px]" aria-hidden="true">` +
        marks
          .slice(0, 3)
          .map((m) => `<span class="h-[5px] w-[5px] flex-none rounded-full" style="background: ${on ? "var(--color-primary-ink)" : calToneVars(m.tone).dot}"></span>`)
          .join("") +
        `</span>`
      : "";
    return (
      `<div class="aspect-square p-0.5 ${calCellRules(lead + d - 1)}">` +
      `<${tag}${cellInteractive ? ` type="button"` : ""}${cellInteractive ? ` aria-pressed="${on}"` : ""} aria-label="${label}" class="${innerClass}">` +
      `<span class="font-mono text-[13px] leading-none tabular-nums">${d}</span>${dots}` +
      `</${tag}>` +
      `</div>`
    );
  });

  const trailingCells = Array.from({ length: trailing }, (_, i) => blank(lead + days + i));
  const grid = [...leadCells, ...dayCells, ...trailingCells].join("\n        ");

  return dedent(`
    <div>
      <div class="mb-2 grid grid-cols-7 border-b border-gray-2 pb-2 text-center">
        ${weekdayRow}
      </div>
      <div class="grid grid-cols-7" role="grid">
        ${grid}
      </div>
    </div>
  `);
}

// Builds one Agenda list exactly as kit/Calendar.jsx would (Calendar.jsx:193-289) — filtered-to-a-
// day vs whole-month, the weekday abbreviation (needs `lead`, same fact Calendar's own grid needs
// it for), the tone spine + kind pill, and the empty state, so the three Agenda specimens below
// are derived from ONE transcription rather than three hand-typed variants.
function agendaHtml({ events = [], day, title, lead, clickable = false, showClear = false }) {
  const filtered =
    day != null
      ? events.filter((e) => Number(e.day) === Number(day))
      : [...events].sort((a, b) => Number(a.day) - Number(b.day));

  const headerRow =
    `<div class="mb-3 flex items-baseline justify-between gap-3">` +
    (title ? `<h3 class="m-0 font-display text-lg font-medium leading-none tracking-[-.015em] text-secondary">${title}</h3>` : "") +
    `<span class="ml-auto flex-none font-mono text-[11px] text-text-muted">${filtered.length} event${filtered.length === 1 ? "" : "s"}</span>` +
    `</div>`;

  const body =
    filtered.length === 0
      ? dedent(`
          <div class="flex flex-col items-center gap-2 py-10 text-center">
            <svg width="28" height="26" viewBox="0 0 28 26" aria-hidden="true" class="text-text-muted">
              <rect x="0.75" y="4.75" width="26.5" height="20.5" rx="3" fill="none" stroke="currentColor" stroke-width="1.5"></rect>
              <path d="M0.75 10.25h26.5" fill="none" stroke="currentColor" stroke-width="1.5"></path>
              <path d="M7 0.75v6.5M21 0.75v6.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"></path>
              <path d="M10.5 17.5h7" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"></path>
            </svg>
            <p class="m-0 text-sm font-medium text-secondary">Nothing scheduled</p>
            <p class="m-0 max-w-[220px] text-xs text-text-muted">Pick a marked day, or clear the selection to see the whole month.</p>
          </div>
        `)
      : dedent(`
          <ul class="m-0 flex list-none flex-col p-0">
        ${filtered
          .map((e) => {
            const tv = calToneVars(e.tone);
            const weekday = lead != null ? CAL_WEEKDAYS[(((lead + Number(e.day) - 1) % 7) + 7) % 7] : null;
            const rowClass =
              "flex items-stretch gap-3 border-b border-gray-1 py-2.5 transition-colors last:border-0 " +
              (clickable ? "cursor-pointer hover:bg-row-hover" : "");
            return (
              `<li class="list-none">` +
              `<div class="${rowClass}"${clickable ? ` role="button" tabindex="0"` : ""}>` +
              `<div class="flex w-[34px] flex-none flex-col items-center justify-center gap-0.5 text-center">` +
              `<span class="font-mono text-[13px] font-medium leading-none text-secondary">${e.day}</span>` +
              (weekday ? `<span class="font-mono text-[9px] font-medium uppercase leading-none text-text-muted">${weekday}</span>` : "") +
              `</div>` +
              `<span class="w-[2px] flex-none self-stretch rounded-full" style="background: ${tv.dot}" aria-hidden="true"></span>` +
              `<div class="flex min-w-0 flex-1 items-center gap-2">` +
              `<span class="min-w-0 flex-1 truncate text-[13px] font-medium leading-[1.4] text-secondary">${e.title}</span>` +
              (e.time ? `<span class="flex-none font-mono text-[11px] text-text-muted">${e.time}</span>` : "") +
              (e.kind
                ? `<span class="flex h-5 flex-none items-center rounded-full px-2 text-[10px] font-medium" style="background: ${tv.bg}; color: ${tv.ink}">${e.kind}</span>`
                : "") +
              `</div>` +
              `</div>` +
              `</li>`
            );
          })
          .join("\n        ")}
          </ul>
        `);

  const clearBtn =
    day != null && showClear
      ? dedent(`
          <div class="mt-4">
            <button type="button" class="inline-flex h-8 items-center gap-1.5 rounded-full bg-gray-1 px-3 text-xs font-medium text-secondary outline-none transition-colors hover:bg-gray-2 focus-visible:ring focus-visible:ring-ring">
              <svg width="9" height="9" viewBox="0 0 11 11" aria-hidden="true"><path d="M1 1l9 9M10 1l-9 9" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"></path></svg>
              Whole month
            </button>
          </div>
        `)
      : "";

  return dedent(`
    <div>
      ${headerRow}
      ${body}
      ${clearBtn}
    </div>
  `);
}

// Calendar.jsx's own specimen fixture (specimens/calendar.jsx) — transcribed verbatim, including
// the drop of the old "pending" tone (retired; Foundations names no --color-pending-*).
const CAL_EVENTS = [
  { day: 4, title: "Class survey renewal", time: "09:00", tone: "info", kind: "Survey" },
  { day: 9, title: "Warranty parts review", time: "11:30", tone: "warning", kind: "Review" },
  { day: 9, title: "Crew rotation brief", time: "14:00", tone: "info", kind: "Ops" },
  { day: 12, title: "Drydock inspection sign-off", time: "10:00", tone: "success", kind: "Inspection" },
  { day: 18, title: "Survey — MV Northern Compass", time: "09:00", tone: "danger", kind: "Survey" },
  { day: 18, title: "Warranty review board", time: "14:00", tone: "warning", kind: "Review" },
  { day: 18, title: "Parts delivery — CLM-4420", time: "16:30", tone: "info", kind: "Logistics" },
  { day: 21, title: "Certificate renewal", time: "09:00", tone: "success", kind: "Certificate" },
  { day: 26, title: "Fleet safety drill", time: "13:00", tone: "info", kind: "Drill" },
];

// ── Table's rows, generated markup ──────────────────────────────────────────────────────────────
// Transcribed verbatim from starter/src/specimens/_fixtures.js's CLAIMS/CLAIM_COLUMNS — the same
// six rows and five columns kit/Tables.jsx's own specimen page renders, and the same tone→chip map
// kit/Chips.jsx's StatusChip renders them with. Built by a generator, like CAL_GRID above, rather
// than hand-typed across up to seven near-identical specimens (selection, sort, row tone, density,
// …) — the surface a transcription slip hides in is six rows times up to seven specimens, not 31
// calendar cells, but the reasoning is the same.
const TABLE_CLAIMS = [
  { ref: "CLM-4417", title: "Compressor seal failure", owner: "R. Iyer", tone: "danger", status: "Rejected", days: 12 },
  { ref: "CLM-4418", title: "Panel delamination", owner: "S. Kaur", tone: "warning", status: "Awaiting you", days: 4 },
  { ref: "CLM-4419", title: "Coolant line leak", owner: "M. Osei", tone: "success", status: "Approved", days: 1 },
  { ref: "CLM-4420", title: "Firmware rollback", owner: "T. Nakamura", tone: "warning", status: "At risk", days: 9 },
  { ref: "CLM-4421", title: "Bearing wear, unit 12", owner: "A. Bianchi", tone: "info", status: "On hold", days: 6 },
  { ref: "CLM-4422", title: "Housing crack", owner: "D. Fischer", tone: "neutral", status: "Draft", days: 0 },
];
const TABLE_COLUMNS = [
  { key: "ref", label: "Ref", mono: true, width: "8.5rem" },
  { key: "title", label: "Claim" },
  { key: "owner", label: "Owner" },
  { key: "status", label: "Status" },
  { key: "days", label: "Days open", align: "right", mono: true, width: "7rem" },
];
// owner/days made sortable for the sort specimen only — mirrors specimens/table.jsx's own
// SORT_COLUMNS, so the other specimens below don't sprout chevrons with no onSort wired.
const TABLE_SORT_COLUMNS = TABLE_COLUMNS.map((c) => (c.key === "owner" || c.key === "days" ? { ...c, sortable: true } : c));

// StatusChip's own five tones (kit/Chips.jsx TONES), colour AND shape — Table drops one straight
// into the status cell, so both the pill/dot anatomy (h-7/gap-1.5/px-3/text-sm, size-1.75 dot) and
// the colour have to match Chips.jsx's md size exactly, not a Table-owned invention. Chips.jsx's
// own 2026-08-13 redesign reads Tailwind's stock palette directly, deliberately NOT a contract
// token ("Tones use Tailwind's own palette rather than a token of ours... and no Foundations entry
// to keep in sync" — tokens.css's Foundations rewrite retired --tone-* entirely and never minted a
// neutral tone token, which is the gap Chips.jsx's redesign closes this way). Transcribed verbatim
// — lint-catalog.mjs's STOCK.color allowlist now carries this exact five-tone palette for it.
const TABLE_CHIP_TONES = {
  success: { bg: "bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-500" },
  warning: { bg: "bg-amber-50", text: "text-amber-700", dot: "bg-amber-500" },
  info: { bg: "bg-blue-50", text: "text-blue-700", dot: "bg-blue-500" },
  danger: { bg: "bg-rose-50", text: "text-rose-700", dot: "bg-rose-500" },
  neutral: { bg: "bg-slate-100", text: "text-slate-700", dot: "bg-slate-400" },
};
const tableChip = (tone, label) => {
  const t = TABLE_CHIP_TONES[tone] ?? TABLE_CHIP_TONES.neutral;
  return (
    `<span class="inline-flex flex-none items-center whitespace-nowrap rounded-full font-sans font-medium leading-none ${t.bg} ${t.text} h-7 gap-1.5 px-3 text-sm">` +
    `<span class="flex-none rounded-full size-1.75 ${t.dot}" aria-hidden="true"></span>${label}</span>`
  );
};

// Fields.jsx's own <Checkbox/> markup, reused rather than re-declared — Tables.jsx's own file
// banner: "a table's selection control and a form's checkbox are the same control."
const tableCheckbox = (checked) =>
  `<label class="inline-flex items-center gap-2 cursor-pointer">` +
  `<span class="relative grid size-4.5 flex-none place-items-center rounded-sm border-decor transition-colors has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-0 ${checked ? "border-primary bg-primary text-white" : "border-gray-3 bg-surface text-transparent"}">` +
  `<input type="checkbox" aria-label="Select row" class="absolute inset-0 m-0 cursor-inherit opacity-0"${checked ? " checked" : ""}>` +
  `<svg width="10" height="8" viewBox="0 0 10 8" fill="none" aria-hidden="true" class="pointer-events-none"><path d="M1 4l2.5 2.5L9 1" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"></path></svg>` +
  `</span></label>`;

// The ONE box not built on Checkbox — indeterminate is a ref-set DOM property, not a prop that
// component takes (Tables.jsx's own file banner). Mirrors Checkbox's exact classes.
const tableHeaderCheckbox = (checked, indeterminate) => {
  const filled = checked || indeterminate;
  return (
    `<label class="inline-flex cursor-pointer items-center">` +
    `<span class="relative grid size-4.5 flex-none place-items-center rounded-sm border-decor transition-colors has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-0 ${filled ? "border-primary bg-primary text-white" : "border-gray-3 bg-surface text-transparent"}">` +
    `<input type="checkbox" aria-label="Select all rows" class="absolute inset-0 m-0 cursor-inherit opacity-0"${checked ? " checked" : ""}>` +
    (indeterminate
      ? `<span class="block h-[1.5px] w-2 rounded-full bg-current" aria-hidden="true"></span>`
      : `<svg width="10" height="8" viewBox="0 0 10 8" fill="none" aria-hidden="true" class="pointer-events-none"><path d="M1 4l2.5 2.5L9 1" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"></path></svg>`) +
    `</span></label>`
  );
};

const TABLE_HEADER_TEXT = "font-mono text-[9px] font-normal uppercase tracking-[.13em]";

// Row tone's own hover, one step darker in the SAME hue — Tables.jsx's own TONE_HOVER, spelled out
// in full per-tone for the same reason Chips.jsx's TONES object is (a template-built class never
// appears complete in source text, so Tailwind's scanner would never see it).
const TABLE_TONE_HOVER = {
  success: "hover:bg-[color-mix(in_srgb,var(--color-success-bg)_94%,black)]",
  warning: "hover:bg-[color-mix(in_srgb,var(--color-warning-bg)_94%,black)]",
  info: "hover:bg-[color-mix(in_srgb,var(--color-info-bg)_94%,black)]",
  danger: "hover:bg-[color-mix(in_srgb,var(--color-danger-bg)_94%,black)]",
};

// Builds one <table> exactly as kit/Tables.jsx would for the given rows/options — mirrors the
// component's own cellPad/bg-priority/sort logic line for line (Tables.jsx:200-304), so every
// specimen below is derived from ONE transcription of the real rules rather than a hand-copied
// variant per specimen. Two deliberate departures from a byte-for-byte transcription, both because
// the goal is the SAME COMPUTED STYLES the real component produces, not a copy of a string bug:
//   1. The row's own tone reads the literal `bg-<tone>-bg` utility class rather than Tables.jsx's
//      own `bg-[var(--color-<tone>-bg)]` arbitrary value — proven this session (StatTile's delta
//      pill) that a `-bg`-suffixed token resolves to an EMPTY STRING through a raw `var()` in this
//      catalog's Tailwind CDN JIT runtime, even though the identical class works fine in the
//      starter app's own build. Same token, same colour, the form that actually paints here.
//   2. Tables.jsx:265+277 concatenates a toned+clickable row's classes with NO space between
//      TONE_HOVER's value and "cursor-pointer" (`bg + (clickable ? "cursor-pointer" : "")`), which
//      merges into one unmatched token and drops BOTH the hover darken and the pointer cursor — a
//      real defect in the shipped component. A snippet transcribes computed styles, and a merged
//      token computes no style at all, so the space is added back below rather than reproduced.
function tableHtml(columns, rows, opts = {}) {
  const { selectable = false, selected = [], sort = null, rowTone = null, clickable = false, compact = false } = opts;
  const selectedSet = new Set(selected);
  const cellPad = (compact ? "py-2.5" : "py-[13px]") + " px-5";
  const allChecked = selectable && rows.length > 0 && rows.every((r) => selectedSet.has(r.ref));
  const someChecked = selectable && rows.some((r) => selectedSet.has(r.ref));

  const theadCells = columns
    .map((c) => {
      const right = c.align === "right";
      const active = sort && sort.key === c.key;
      const widthAttr = c.width ? ` style="width: ${c.width}"` : "";
      const ariaSort = c.sortable ? ` aria-sort="${active ? (sort.dir === "desc" ? "descending" : "ascending") : "none"}"` : "";
      const thBase = `${cellPad} ${TABLE_HEADER_TEXT} text-text-muted ${right ? "text-right" : "text-left"}`;
      let inner;
      if (c.sortable) {
        const dir = active ? sort.dir : "asc";
        const btnClass =
          `${TABLE_HEADER_TEXT} inline-flex w-full cursor-pointer items-center gap-1 border-0 bg-transparent p-0 ` +
          `outline-none transition-colors duration-[120ms] ease-standard focus-visible:ring focus-visible:ring-ring focus-visible:ring-offset-1 ` +
          (right ? "justify-end " : "justify-start ") +
          (active ? "text-primary" : "text-text-muted hover:text-secondary");
        const chevronClass = `flex-none transition duration-200 ease-standard ${dir === "desc" ? "rotate-180 " : ""}${active ? "" : "opacity-40"}`;
        inner =
          `<button type="button" class="${btnClass}"><span>${c.label ?? c.key}</span>` +
          `<svg width="8" height="5" viewBox="0 0 8 5" fill="none" aria-hidden="true" class="${chevronClass}">` +
          `<path d="M1 1l3 3 3-3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"></path></svg></button>`;
      } else {
        inner = c.label ?? c.key;
      }
      return `<th scope="col"${widthAttr}${ariaSort} class="${thBase}">${inner}</th>`;
    })
    .join("\n            ");

  const headCheckboxCell = selectable
    ? `<th scope="col" class="${cellPad} w-0">${tableHeaderCheckbox(allChecked, someChecked && !allChecked)}</th>\n            `
    : "";

  const bodyRows = rows
    .map((r) => {
      const tone = rowTone ? rowTone(r) : null;
      const toned = tone && tone !== "neutral";
      const isSelected = selectable && selectedSet.has(r.ref);
      // Built as discrete tokens, joined with a single space — Tables.jsx:265+277 builds this same
      // string by raw concatenation and drops the space between a toned row's hover class and
      // "cursor-pointer" (see tableHtml's own banner above); an array join can't reproduce that.
      const bgTokens = toned
        ? [`bg-${tone}-bg`, clickable ? TABLE_TONE_HOVER[tone] : null]
        : isSelected
        ? ["bg-row-selected"]
        : clickable
        ? ["hover:bg-row-hover"]
        : [];
      const trClass = ["border-b border-gray-1 transition-colors last:border-0", ...bgTokens, clickable ? "cursor-pointer" : null]
        .filter(Boolean)
        .join(" ");
      const checkboxCell = selectable ? `<td class="${cellPad}">${tableCheckbox(isSelected)}</td>\n              ` : "";
      const dataCells = columns
        .map((c) => {
          const right = c.align === "right";
          const cls = `${cellPad} align-middle text-sm ${right ? "text-right" : "text-left"} ${c.mono ? "font-mono tabular-nums text-text-muted" : "text-secondary"}`;
          const value = c.key === "status" ? tableChip(r.tone, r.status) : c.key === "days" ? r.days || "—" : r[c.key];
          return `<td class="${cls}">${value}</td>`;
        })
        .join("\n              ");
      return `            <tr class="${trClass}">\n              ${checkboxCell}${dataCells}\n            </tr>`;
    })
    .join("\n");

  return dedent(`
    <div class="w-full overflow-x-auto">
      <table class="w-full min-w-max border-collapse text-left">
        <thead>
          <tr class="border-y border-gray-2 bg-row-hover">
            ${headCheckboxCell}${theadCells}
          </tr>
        </thead>
        <tbody>
${bodyRows}
        </tbody>
      </table>
    </div>
  `);
}

/** @type {import("./_schema.mjs").Entry[]} */
export default [
  {
    id: "donut",
    name: "Donut · Legend",
    category: "Data",
    starterTwin: "kit/Donut.jsx",
    summary: "A composition ring, and the key beside it.",
    blurb:
      "[SOURCE] Donut.dc.html (Claude Design project \"Mobile app style guide sheet\"). The " +
      "groove is stroke-track — the same token every bar's trough and GaugeRing's own groove " +
      "read. Segments walk --chart-1..6 — SIX steps, not eight, per tokens.css's own chart-ramp " +
      "note — the same ramp DataCharts.dc.html names, so a legend beside a bar chart and a legend " +
      "beside a donut on the same screen agree because both read the same six tokens, not because " +
      "they happen to match today. A per-datum color always wins over the ramp; that's also the " +
      "entire de-emphasis-walk mechanism below — no separate prop for it.",
    footer:
      "[OURS]: drawing each slice as one dashed <circle> with a rotate transform rather than " +
      "building it as an arc path — cheaper, rounder, and it keeps a slice one element so a hover " +
      "title lands on the whole thing rather than half of it. Caps are strokeLinecap=\"butt\", " +
      "stated explicitly now — round caps and gaps both misread the last slice's size. NEW: the " +
      "legend is the interactive surface, not the ring — hovering a row thickens that arc (stroke " +
      "width steps up per size), fades the rest to 35% opacity, and swaps the center figure to " +
      "that row's own value + label; the ring never reacts to its own hover, so activeIndex is a " +
      "controlled pair lifted to the caller (see the second specimen, pinned on \"Approved\" since " +
      "a static snippet has no hover state of its own). Legend's dot is size-2 (8px) now, one step " +
      "up from chip-dot (7px), since it labels a thicker arc than a status chip labels a status.",
    bindings: [
      { field: "segments", type: "array<{key,label,value,color?}>", example: '[{ key: "approved", label: "Approved", value: 311 }, …]', note: "proportioned against their OWN total — a per-datum color wins over the ramp; that's also how the de-emphasis walk works, no separate prop" },
      { field: "size", type: '"sm" | "md" | "lg"', example: '"lg"', note: "84/9 · 120/12 · 172/15 (box px / stroke px). Thickness scales with the ring, never independently — no separate thickness prop anymore" },
      { field: "activeIndex", type: "number | null", example: "0", note: "controlled, not internal state — thickens + focuses that segment, fades the rest to 35%, swaps the center figure to that segment's own value/label. Wire it to Legend's onActiveChange" },
      { field: "caption", type: "string", example: '"total"', note: "resting caption under the figure; swaps to the active segment's own label on hover" },
      { field: "sublabel", type: "string", example: '"380"', note: "overrides the resting figure — defaults to the computed total" },
      { field: "label", type: "string", example: '"Claims by outcome"', note: "caption below the ring, and the aria-label when there is no data" },
      { field: "items", type: "array<{key,label,value?,color?}>", example: '[{ key: "approved", label: "Approved", value: 311 }, …]', note: "Legend's own list — same shape as segments, usually the same array" },
      { field: "showValue", type: "boolean", example: "true", note: "prints the count in the data voice beside each swatch" },
      { field: "showPercent", type: "boolean", example: "true", note: "right-aligned, fixed-width column, against the items' own total" },
    ],
    specimens: [
      {
        label: "three sizes, empty, and a single segment",
        html: dedent(`
          <div class="flex flex-wrap items-end gap-6">
            <div style="width: 84px; height: 84px">
              <svg viewBox="0 0 140 140" role="img" aria-label="Composition" class="block h-full w-full">
                <circle cx="70" cy="70" r="54" fill="none" class="stroke-track" stroke-width="9"></circle>
                <circle cx="70" cy="70" r="54" fill="none" stroke="var(--chart-1)" stroke-width="9" stroke-linecap="butt"
                        stroke-dasharray="277.68 61.61" transform="rotate(-90.00 70 70)"
                        class="transition-[stroke-width,opacity] duration-move"><title>Approved: 311</title></circle>
                <circle cx="70" cy="70" r="54" fill="none" stroke="var(--chart-2)" stroke-width="9" stroke-linecap="butt"
                        stroke-dasharray="37.50 301.79" transform="rotate(204.63 70 70)"
                        class="transition-[stroke-width,opacity] duration-move"><title>Open: 42</title></circle>
                <circle cx="70" cy="70" r="54" fill="none" stroke="var(--chart-3)" stroke-width="9" stroke-linecap="butt"
                        stroke-dasharray="16.07 323.22" transform="rotate(244.42 70 70)"
                        class="transition-[stroke-width,opacity] duration-move"><title>In review: 18</title></circle>
                <circle cx="70" cy="70" r="54" fill="none" stroke="var(--chart-4)" stroke-width="9" stroke-linecap="butt"
                        stroke-dasharray="8.04 331.26" transform="rotate(261.47 70 70)"
                        class="transition-[stroke-width,opacity] duration-move"><title>Rejected: 9</title></circle>
                <text x="70" y="66" text-anchor="middle" fill="currentColor" class="text-secondary font-mono font-medium tracking-[-.02em]" style="font-size: 13px">380</text>
                <text x="70" y="84" text-anchor="middle" fill="currentColor" class="text-text-muted text-[11px]">total</text>
              </svg>
            </div>
            <div style="width: 120px; height: 120px">
              <svg viewBox="0 0 140 140" role="img" aria-label="Composition" class="block h-full w-full">
                <circle cx="70" cy="70" r="54" fill="none" class="stroke-track" stroke-width="12"></circle>
                <circle cx="70" cy="70" r="54" fill="none" stroke="var(--chart-1)" stroke-width="12" stroke-linecap="butt"
                        stroke-dasharray="277.68 61.61" transform="rotate(-90.00 70 70)"
                        class="transition-[stroke-width,opacity] duration-move"><title>Approved: 311</title></circle>
                <circle cx="70" cy="70" r="54" fill="none" stroke="var(--chart-2)" stroke-width="12" stroke-linecap="butt"
                        stroke-dasharray="37.50 301.79" transform="rotate(204.63 70 70)"
                        class="transition-[stroke-width,opacity] duration-move"><title>Open: 42</title></circle>
                <circle cx="70" cy="70" r="54" fill="none" stroke="var(--chart-3)" stroke-width="12" stroke-linecap="butt"
                        stroke-dasharray="16.07 323.22" transform="rotate(244.42 70 70)"
                        class="transition-[stroke-width,opacity] duration-move"><title>In review: 18</title></circle>
                <circle cx="70" cy="70" r="54" fill="none" stroke="var(--chart-4)" stroke-width="12" stroke-linecap="butt"
                        stroke-dasharray="8.04 331.26" transform="rotate(261.47 70 70)"
                        class="transition-[stroke-width,opacity] duration-move"><title>Rejected: 9</title></circle>
                <text x="70" y="66" text-anchor="middle" fill="currentColor" class="text-secondary font-mono font-medium tracking-[-.02em]" style="font-size: 15px">380</text>
                <text x="70" y="84" text-anchor="middle" fill="currentColor" class="text-text-muted text-[11px]">total</text>
              </svg>
            </div>
            <div style="width: 172px; height: 172px">
              <svg viewBox="0 0 140 140" role="img" aria-label="Composition" class="block h-full w-full">
                <circle cx="70" cy="70" r="54" fill="none" class="stroke-track" stroke-width="15"></circle>
                <circle cx="70" cy="70" r="54" fill="none" stroke="var(--chart-1)" stroke-width="15" stroke-linecap="butt"
                        stroke-dasharray="277.68 61.61" transform="rotate(-90.00 70 70)"
                        class="transition-[stroke-width,opacity] duration-move"><title>Approved: 311</title></circle>
                <circle cx="70" cy="70" r="54" fill="none" stroke="var(--chart-2)" stroke-width="15" stroke-linecap="butt"
                        stroke-dasharray="37.50 301.79" transform="rotate(204.63 70 70)"
                        class="transition-[stroke-width,opacity] duration-move"><title>Open: 42</title></circle>
                <circle cx="70" cy="70" r="54" fill="none" stroke="var(--chart-3)" stroke-width="15" stroke-linecap="butt"
                        stroke-dasharray="16.07 323.22" transform="rotate(244.42 70 70)"
                        class="transition-[stroke-width,opacity] duration-move"><title>In review: 18</title></circle>
                <circle cx="70" cy="70" r="54" fill="none" stroke="var(--chart-4)" stroke-width="15" stroke-linecap="butt"
                        stroke-dasharray="8.04 331.26" transform="rotate(261.47 70 70)"
                        class="transition-[stroke-width,opacity] duration-move"><title>Rejected: 9</title></circle>
                <text x="70" y="66" text-anchor="middle" fill="currentColor" class="text-secondary font-mono font-medium tracking-[-.02em]" style="font-size: 19px">380</text>
                <text x="70" y="84" text-anchor="middle" fill="currentColor" class="text-text-muted text-[11px]">total</text>
              </svg>
            </div>
            <div style="width: 120px; height: 120px">
              <svg viewBox="0 0 140 140" role="img" aria-label="No data" class="block h-full w-full">
                <circle cx="70" cy="70" r="54" fill="none" class="stroke-track" stroke-width="12"></circle>
                <text x="70" y="76" text-anchor="middle" fill="currentColor" class="text-text-muted font-mono" style="font-size: 15px">—</text>
              </svg>
              <div class="mt-1 text-center text-xs text-text-muted">No data</div>
            </div>
            <div style="width: 120px; height: 120px">
              <svg viewBox="0 0 140 140" role="img" aria-label="Composition" class="block h-full w-full">
                <circle cx="70" cy="70" r="54" fill="none" class="stroke-track" stroke-width="12"></circle>
                <circle cx="70" cy="70" r="54" fill="none" stroke="var(--chart-1)" stroke-width="12" stroke-linecap="butt"
                        stroke-dasharray="339.29 0.00" transform="rotate(-90.00 70 70)"
                        class="transition-[stroke-width,opacity] duration-move"><title>Complete: 1</title></circle>
                <text x="70" y="66" text-anchor="middle" fill="currentColor" class="text-secondary font-mono font-medium tracking-[-.02em]" style="font-size: 15px">100%</text>
                <text x="70" y="84" text-anchor="middle" fill="currentColor" class="text-text-muted text-[11px]">complete</text>
              </svg>
            </div>
          </div>
        `),
      },
      {
        label: "hover a legend row to focus the ring — \"the legend is the interactive surface, not the ring\" (pinned on Approved; a static snippet has no hover of its own)",
        html: dedent(`
          <div class="flex flex-wrap items-center gap-6">
            <div style="width: 172px; height: 172px">
              <svg viewBox="0 0 140 140" role="img" aria-label="Composition" class="block h-full w-full">
                <circle cx="70" cy="70" r="54" fill="none" class="stroke-track" stroke-width="15"></circle>
                <circle cx="70" cy="70" r="54" fill="none" stroke="var(--chart-1)" stroke-width="19" stroke-linecap="butt"
                        stroke-dasharray="277.68 61.61" transform="rotate(-90.00 70 70)" opacity="1"
                        class="transition-[stroke-width,opacity] duration-move"><title>Approved: 311</title></circle>
                <circle cx="70" cy="70" r="54" fill="none" stroke="var(--chart-2)" stroke-width="15" stroke-linecap="butt"
                        stroke-dasharray="37.50 301.79" transform="rotate(204.63 70 70)" opacity="0.35"
                        class="transition-[stroke-width,opacity] duration-move"><title>Open: 42</title></circle>
                <circle cx="70" cy="70" r="54" fill="none" stroke="var(--chart-3)" stroke-width="15" stroke-linecap="butt"
                        stroke-dasharray="16.07 323.22" transform="rotate(244.42 70 70)" opacity="0.35"
                        class="transition-[stroke-width,opacity] duration-move"><title>In review: 18</title></circle>
                <circle cx="70" cy="70" r="54" fill="none" stroke="var(--chart-4)" stroke-width="15" stroke-linecap="butt"
                        stroke-dasharray="8.04 331.26" transform="rotate(261.47 70 70)" opacity="0.35"
                        class="transition-[stroke-width,opacity] duration-move"><title>Rejected: 9</title></circle>
                <text x="70" y="66" text-anchor="middle" fill="currentColor" class="text-secondary font-mono font-medium tracking-[-.02em]" style="font-size: 19px">311</text>
                <text x="70" y="84" text-anchor="middle" fill="currentColor" class="text-text-muted text-[11px]">Approved</text>
              </svg>
            </div>
            <ul class="m-0 flex list-none flex-col gap-y-0.5 p-0 min-w-[180px]">
              <li class="-mx-2 flex items-center gap-2 rounded-md bg-row-hover px-2 py-1 transition-colors hover:bg-row-hover">
                <span class="size-2 flex-none rounded-full" style="background: var(--chart-1)"></span>
                <span class="min-w-0 flex-1 truncate text-xs text-ink-soft">Approved</span>
                <span class="flex-none font-mono text-xs font-semibold tabular-nums text-secondary">311</span>
                <span class="w-[38px] flex-none text-right text-[11px] tabular-nums text-text-muted">82%</span>
              </li>
              <li class="-mx-2 flex items-center gap-2 rounded-md px-2 py-1 transition-colors hover:bg-row-hover">
                <span class="size-2 flex-none rounded-full" style="background: var(--chart-2)"></span>
                <span class="min-w-0 flex-1 truncate text-xs text-ink-soft">Open</span>
                <span class="flex-none font-mono text-xs font-semibold tabular-nums text-secondary">42</span>
                <span class="w-[38px] flex-none text-right text-[11px] tabular-nums text-text-muted">11%</span>
              </li>
              <li class="-mx-2 flex items-center gap-2 rounded-md px-2 py-1 transition-colors hover:bg-row-hover">
                <span class="size-2 flex-none rounded-full" style="background: var(--chart-3)"></span>
                <span class="min-w-0 flex-1 truncate text-xs text-ink-soft">In review</span>
                <span class="flex-none font-mono text-xs font-semibold tabular-nums text-secondary">18</span>
                <span class="w-[38px] flex-none text-right text-[11px] tabular-nums text-text-muted">5%</span>
              </li>
              <li class="-mx-2 flex items-center gap-2 rounded-md px-2 py-1 transition-colors hover:bg-row-hover">
                <span class="size-2 flex-none rounded-full" style="background: var(--chart-4)"></span>
                <span class="min-w-0 flex-1 truncate text-xs text-ink-soft">Rejected</span>
                <span class="flex-none font-mono text-xs font-semibold tabular-nums text-secondary">9</span>
                <span class="w-[38px] flex-none text-right text-[11px] tabular-nums text-text-muted">2%</span>
              </li>
            </ul>
          </div>
        `),
      },
      {
        label: "one emphasis slice, and a de-emphasis walk (--color-secondary -> -ink-soft -> -text-muted -> -text-subtle -> -border)",
        html: dedent(`
          <div class="flex flex-wrap items-center gap-6">
            <div style="width: 172px; height: 172px">
              <svg viewBox="0 0 140 140" role="img" aria-label="Composition" class="block h-full w-full">
                <circle cx="70" cy="70" r="54" fill="none" class="stroke-track" stroke-width="15"></circle>
                <circle cx="70" cy="70" r="54" fill="none" stroke="var(--color-primary)" stroke-width="15" stroke-linecap="butt"
                        stroke-dasharray="210.36 128.93" transform="rotate(-90.00 70 70)"
                        class="transition-[stroke-width,opacity] duration-move"><title>Primary channel: 62</title></circle>
                <circle cx="70" cy="70" r="54" fill="none" stroke="var(--color-secondary)" stroke-width="15" stroke-linecap="butt"
                        stroke-dasharray="47.50 291.79" transform="rotate(133.20 70 70)"
                        class="transition-[stroke-width,opacity] duration-move"><title>Referral: 14</title></circle>
                <circle cx="70" cy="70" r="54" fill="none" stroke="var(--color-ink-soft)" stroke-width="15" stroke-linecap="butt"
                        stroke-dasharray="37.32 301.97" transform="rotate(183.60 70 70)"
                        class="transition-[stroke-width,opacity] duration-move"><title>Organic: 11</title></circle>
                <circle cx="70" cy="70" r="54" fill="none" stroke="var(--color-text-muted)" stroke-width="15" stroke-linecap="butt"
                        stroke-dasharray="27.14 312.15" transform="rotate(223.20 70 70)"
                        class="transition-[stroke-width,opacity] duration-move"><title>Paid: 8</title></circle>
                <circle cx="70" cy="70" r="54" fill="none" stroke="var(--color-text-subtle)" stroke-width="15" stroke-linecap="butt"
                        stroke-dasharray="10.18 329.11" transform="rotate(252.00 70 70)"
                        class="transition-[stroke-width,opacity] duration-move"><title>Partner: 3</title></circle>
                <circle cx="70" cy="70" r="54" fill="none" stroke="var(--color-border)" stroke-width="15" stroke-linecap="butt"
                        stroke-dasharray="6.79 332.51" transform="rotate(262.80 70 70)"
                        class="transition-[stroke-width,opacity] duration-move"><title>Other: 2</title></circle>
                <text x="70" y="66" text-anchor="middle" fill="currentColor" class="text-secondary font-mono font-medium tracking-[-.02em]" style="font-size: 19px">100%</text>
                <text x="70" y="84" text-anchor="middle" fill="currentColor" class="text-text-muted text-[11px]">total</text>
              </svg>
            </div>
            <ul class="m-0 flex list-none flex-col gap-y-0.5 p-0 min-w-[180px]">
              <li class="-mx-2 flex items-center gap-2 rounded-md px-2 py-1 transition-colors hover:bg-row-hover">
                <span class="size-2 flex-none rounded-full" style="background: var(--color-primary)"></span>
                <span class="min-w-0 flex-1 truncate text-xs text-ink-soft">Primary channel</span>
                <span class="flex-none font-mono text-xs font-semibold tabular-nums text-secondary">62</span>
                <span class="w-[38px] flex-none text-right text-[11px] tabular-nums text-text-muted">62%</span>
              </li>
              <li class="-mx-2 flex items-center gap-2 rounded-md px-2 py-1 transition-colors hover:bg-row-hover">
                <span class="size-2 flex-none rounded-full" style="background: var(--color-secondary)"></span>
                <span class="min-w-0 flex-1 truncate text-xs text-ink-soft">Referral</span>
                <span class="flex-none font-mono text-xs font-semibold tabular-nums text-secondary">14</span>
                <span class="w-[38px] flex-none text-right text-[11px] tabular-nums text-text-muted">14%</span>
              </li>
              <li class="-mx-2 flex items-center gap-2 rounded-md px-2 py-1 transition-colors hover:bg-row-hover">
                <span class="size-2 flex-none rounded-full" style="background: var(--color-ink-soft)"></span>
                <span class="min-w-0 flex-1 truncate text-xs text-ink-soft">Organic</span>
                <span class="flex-none font-mono text-xs font-semibold tabular-nums text-secondary">11</span>
                <span class="w-[38px] flex-none text-right text-[11px] tabular-nums text-text-muted">11%</span>
              </li>
              <li class="-mx-2 flex items-center gap-2 rounded-md px-2 py-1 transition-colors hover:bg-row-hover">
                <span class="size-2 flex-none rounded-full" style="background: var(--color-text-muted)"></span>
                <span class="min-w-0 flex-1 truncate text-xs text-ink-soft">Paid</span>
                <span class="flex-none font-mono text-xs font-semibold tabular-nums text-secondary">8</span>
                <span class="w-[38px] flex-none text-right text-[11px] tabular-nums text-text-muted">8%</span>
              </li>
              <li class="-mx-2 flex items-center gap-2 rounded-md px-2 py-1 transition-colors hover:bg-row-hover">
                <span class="size-2 flex-none rounded-full" style="background: var(--color-text-subtle)"></span>
                <span class="min-w-0 flex-1 truncate text-xs text-ink-soft">Partner</span>
                <span class="flex-none font-mono text-xs font-semibold tabular-nums text-secondary">3</span>
                <span class="w-[38px] flex-none text-right text-[11px] tabular-nums text-text-muted">3%</span>
              </li>
              <li class="-mx-2 flex items-center gap-2 rounded-md px-2 py-1 transition-colors hover:bg-row-hover">
                <span class="size-2 flex-none rounded-full" style="background: var(--color-border)"></span>
                <span class="min-w-0 flex-1 truncate text-xs text-ink-soft">Other</span>
                <span class="flex-none font-mono text-xs font-semibold tabular-nums text-secondary">2</span>
                <span class="w-[38px] flex-none text-right text-[11px] tabular-nums text-text-muted">2%</span>
              </li>
            </ul>
          </div>
        `),
      },
      {
        label: "standalone — dot, label, value, and its share of the total",
        html: dedent(`
          <ul class="m-0 flex list-none flex-col gap-y-0.5 p-0 max-w-[220px]">
            <li class="-mx-2 flex items-center gap-2 rounded-md px-2 py-1 transition-colors hover:bg-row-hover">
              <span class="size-2 flex-none rounded-full" style="background: var(--chart-1)"></span>
              <span class="min-w-0 flex-1 truncate text-xs text-ink-soft">Approved</span>
              <span class="flex-none font-mono text-xs font-semibold tabular-nums text-secondary">311</span>
              <span class="w-[38px] flex-none text-right text-[11px] tabular-nums text-text-muted">82%</span>
            </li>
            <li class="-mx-2 flex items-center gap-2 rounded-md px-2 py-1 transition-colors hover:bg-row-hover">
              <span class="size-2 flex-none rounded-full" style="background: var(--chart-2)"></span>
              <span class="min-w-0 flex-1 truncate text-xs text-ink-soft">Open</span>
              <span class="flex-none font-mono text-xs font-semibold tabular-nums text-secondary">42</span>
              <span class="w-[38px] flex-none text-right text-[11px] tabular-nums text-text-muted">11%</span>
            </li>
            <li class="-mx-2 flex items-center gap-2 rounded-md px-2 py-1 transition-colors hover:bg-row-hover">
              <span class="size-2 flex-none rounded-full" style="background: var(--chart-3)"></span>
              <span class="min-w-0 flex-1 truncate text-xs text-ink-soft">In review</span>
              <span class="flex-none font-mono text-xs font-semibold tabular-nums text-secondary">18</span>
              <span class="w-[38px] flex-none text-right text-[11px] tabular-nums text-text-muted">5%</span>
            </li>
            <li class="-mx-2 flex items-center gap-2 rounded-md px-2 py-1 transition-colors hover:bg-row-hover">
              <span class="size-2 flex-none rounded-full" style="background: var(--chart-4)"></span>
              <span class="min-w-0 flex-1 truncate text-xs text-ink-soft">Rejected</span>
              <span class="flex-none font-mono text-xs font-semibold tabular-nums text-secondary">9</span>
              <span class="w-[38px] flex-none text-right text-[11px] tabular-nums text-text-muted">2%</span>
            </li>
          </ul>
        `),
      },
    ],
  },

  {
    id: "table",
    name: "Table",
    category: "Data",
    starterTwin: "kit/Tables.jsx",
    summary: "A real <table>, so a screen reader announces the column a cell belongs to.",
    blurb:
      "Columns and rows, with the language's own header band, row rule, density and mono voice. " +
      "Four row states at two different weights: hover and selection are half-strength washes, a " +
      "row's own tone is full-strength and always wins — a selected, hovered claim that failed " +
      "still reads as failed.",
    footer:
      "A row rule is not the same colour as a panel's own edge — Beacon draws rows one step " +
      "quieter than a container border, which is why the rule reads border-gray-1 rather than " +
      "border-border. The header band's near-white fill is not a new literal either: bg-row-hover " +
      "already resolves to that exact value, so the band reuses it instead of minting a second " +
      "token for the same colour.",
    bindings: [
      { field: "columns", type: "array<{key,label,align?,mono?,width?,sortable?}>", example: '[{ key: "ref", label: "Ref", mono: true, width: "8.5rem" }, …]', note: 'align:"right" pairs with tabular numerals; mono is the data voice — refs, IDs, dates; sortable renders that header as a chevron button' },
      { field: "rows", type: "array<{…keyed by column.key}>", example: '{ ref: "CLM-4417", title: "Compressor seal failure", owner: "R. Iyer", days: 12 }', note: "a cell value may be a node — a status column drops a <StatusChip/> straight in" },
      { field: "onRowClick", type: "(row, i) => void", example: "—", note: "supplying it makes rows hoverable (bg-row-hover) and clickable; omit and they're inert" },
      { field: "rowKey", type: "(row, i) => string", example: "(r) => r.ref", note: "stable key — also what selection is keyed by, so it has to identify a row, not its position" },
      { field: "selected / onSelect", type: "key[] / (nextKeys) => void", example: '["CLM-4419"]', note: "adds the checkbox column; onSelect receives the whole NEXT array — Table never owns selection itself" },
      { field: "sort / onSort", type: "{key,dir} / (key) => void", example: '{ key: "days", dir: "desc" }', note: "sort is display-only, Table doesn't reorder rows; onSort fires when a sortable header is clicked" },
      { field: "rowTone", type: "(row) => tone", example: '(r) => r.tone === "danger" ? "danger" : undefined', note: "tints a row at full strength (success/warning/info/danger) — always wins over hover and selection" },
      { field: "compact", type: "boolean", example: "true", note: "the one density knob — 10px cell padding instead of 13px, table-wide" },
      { field: "empty", type: "string", example: '"No claims match this filter."', note: "shown instead of an empty table when rows.length is 0" },
    ],
    specimens: [
      {
        label: "rows with chips in a cell",
        html: tableHtml(TABLE_COLUMNS, TABLE_CLAIMS),
      },
      {
        label: "onRowClick — rows become hoverable",
        html: tableHtml(TABLE_COLUMNS.slice(0, 4), TABLE_CLAIMS.slice(0, 3), { clickable: true }),
      },
      {
        label: "selected — checkbox column, header box toggles all",
        html:
          tableHtml(TABLE_COLUMNS, TABLE_CLAIMS, { selectable: true, selected: ["CLM-4419"] }) +
          `\n<p class="m-0 mt-3 text-xs text-text-muted">1 of 6 selected.</p>`,
      },
      {
        label: "sort — a sortable header becomes a button with a rotating chevron",
        html: tableHtml(
          TABLE_SORT_COLUMNS,
          [...TABLE_CLAIMS].sort((a, b) => b.days - a.days),
          { sort: { key: "days", dir: "desc" } }
        ),
      },
      {
        label: "rowTone — full strength, and it wins over hover/selection",
        html:
          tableHtml(TABLE_COLUMNS, TABLE_CLAIMS, {
            selectable: true,
            selected: ["CLM-4417"],
            clickable: true,
            rowTone: (r) => (r.tone === "danger" ? "danger" : undefined),
          }) +
          `\n<p class="m-0 mt-3 text-xs leading-relaxed text-text-muted">CLM-4417 is both selected and hoverable, and still reads as a full-strength danger row — selection and hover only ever lift a plain row; a row's own tone owns the fill.</p>`,
      },
      {
        label: "compact — the one density knob",
        html: tableHtml(TABLE_COLUMNS, TABLE_CLAIMS, { compact: true }),
      },
      {
        label: "empty",
        html: dedent(`
          <p class="m-0 py-6 text-center text-sm text-text-muted">No claims match this filter.</p>
        `),
      },
    ],
  },

  {
    id: "stat-tile",
    name: "StatTile",
    category: "Data",
    starterTwin: "kit/Cards.jsx",
    summary: "A label, a figure and an optional unit — plus, when the number has a history, a tone pill and a spark.",
    blurb:
      "DEFAULT TO THE FIRST SPECIMEN BELOW (delta + spark), not the second. A page agent computing " +
      "a KPI row from real seed data almost always HAS a history to show — a count grouped by date, " +
      "a level checked against a threshold across recent readings, a status derived from a date " +
      "range — even when no field is literally named \"history\". Reach for the second, bare " +
      "specimen only when a metric truly has no computable historical dimension anywhere in the " +
      "seed (e.g. a first-run empty state), never as the default shape for \"a row of KPI tiles\". " +
      "This is the one component in the cookbook where copying the FIRST matching example verbatim " +
      "(the cookbook's own house rule) has repeatedly produced bare tiles across unrelated apps " +
      "because the bare specimen used to sort first — fixed by reordering, but the underlying " +
      "judgment call is the page agent's: derive a real series, don't reach for the shortcut.\n\n" +
      "[SOURCE] in Beacon — a label, a 32px Poppins figure with tabular numerals (\"Tabular numerals " +
      "so columns align\"), and a unit on the baseline. The tile itself is [OURS]: the source names " +
      "the TYPE but pairs it with no container. It sits on a metric-role card, which is exactly " +
      "what card-pad-metric was named for.\n\n" +
      "The delta pill and the sparkline are [OURS] and both are OPTIONAL — pass neither and this " +
      "is the plain tile it has always been, byte for byte. They were briefly drafted as a second " +
      "component and folded back in, because the split could not be defended: a KPI tile that " +
      "shows its trend is not a different component from one that does not, it is the same tile " +
      "with more to say. Two entries would have meant two specimens to keep in step, two names for " +
      "a page agent to choose between on a distinction the reader never sees, and a second card " +
      "anatomy free to drift from this one.",
    footer:
      "alarm recolours the FIGURE, not a badge beside it — Beacon's own behaviour, where an " +
      "overdue count turns primary-strong. That is a state on the number, which is why there is " +
      "no icon slot here; when a card needs a category chip as well, that is MetricCard.\n\n" +
      "TONE IS THE CLAIM, and it is passed rather than derived from the delta's sign: a rising " +
      "overdue count and a rising completion rate are opposite news, so no rule about + and − can " +
      "get both right. It colours the pill AND the spark together, both from --tone-*-fg, so a " +
      "card cannot disagree with itself; omit it and both fall back to the accent, which is the " +
      "honest rendering for a figure that is simply moving. tone also supersedes alarm on the " +
      "figure when both are given — alarm says \"look at this\", tone says what kind of news it is, " +
      "and the more specific statement wins.\n\n" +
      "The spark is the shell's own .kit-spark, which existed and was drawn by nothing — no " +
      "catalog entry referenced it, so no page agent knew it was there.\n\n" +
      "2026-08-13, later still — found by a sibling agent auditing the prototype against this " +
      "entry: the wrapper and the spark had both drifted independently of the delta-pill fix " +
      "above. Cards.jsx's own redesign (found and fixed elsewhere in this catalog the same day) " +
      "moved every Card anatomy — including StatTile's own `<Card role=\"metric\">` wrapper — off " +
      "`shadow-card bg-card text-card-foreground` onto `shadow-panel bg-surface text-secondary`; " +
      "this entry never got that follow-up. Separately, `.kit-spark`'s shared-CSS-class mechanism " +
      "described above is itself now stale: the real `Spark` (Cards.jsx, unexported, StatTile's own " +
      "anatomy) draws a REAL per-instance `<linearGradient>` (opacity .22→0, `useId()`-keyed so " +
      "multiple tiles never collide on one `<defs>` id) rather than colouring a shared class via " +
      "CSS — `.kit-spark`'s tone modifiers (`.warning` etc.) don't exist in the real component at " +
      "all. Rewritten below to match exactly.",
    bindings: [
      { field: "label", type: "string", example: '"Open claims"', note: "caption above the figure, in text-kpi-label" },
      { field: "value", type: "node", example: '"42"', note: "the figure itself — tabular numerals so a row of tiles aligns column-wise" },
      { field: "unit", type: "string", example: '"this month"', note: "sits on the figure's baseline, in the muted meta ink" },
      { field: "alarm", type: "boolean", example: "true", note: "recolours the FIGURE to --primary — an attention state on the number, not a badge beside it" },
      { field: "delta", type: "string", example: '"−2 wk"', note: "OPTIONAL. A tinted pill at the top right, attached to the label rather than trailing the figure. Text, not a number: it carries its own period, so \"−2 wk\" and \"1 closed\" are both legal" },
      { field: "tone", type: '"success" · "danger" · "warning" · "info"', example: '"danger"', note: "OPTIONAL. Colours the pill, the spark and the figure together, uniformly — one state. Passed, not derived from the delta's sign — see the footer" },
      { field: "deltaTone", type: '"success" · "danger" · "warning" · "info"', example: '"success"', note: "OPTIONAL, falls back to tone. Lets the PILL diverge from tone/figure/spark — three independent colours a single tone can't express (a green pill, a plain dark figure, the language's own default spark). This is what the first specimen row demonstrates." },
      { field: "series", type: "array<number>", example: "[8, 9, 7, 10, 9, 12, 10]", note: "OPTIONAL. Draws the filled area spark along the card's foot. 2+ points renders one; omit it and the card draws no spark at all, StatTile's own behaviour for a metric with no history yet" },
    ],
    specimens: [
      {
        // 2026-08-13 — rewritten to match starter/src/specimens/stat-tile.jsx's real second
        // specimen exactly (parity.jsx side-by-side caught the drift; this had invented its own
        // content and its own single-`tone` colouring, missing the whole point of the real
        // component's `deltaTone` prop — a pill that can diverge from the figure and the spark,
        // not just three more copies of one-tone-colours-everything). Two tiles below use
        // deltaTone alone (figure stays plain, spark stays the language's own default colour,
        // ONLY the pill takes the tone) — the third uses `tone` instead, uniformly colouring
        // figure + pill + spark together, which is the deliberate contrast case the label points
        // at. The fourth carries no series prop at all, so no spark renders — StatTile's own
        // documented behaviour for a metric with no history yet.
        //
        // 2026-08-13, later same day — pill background moved OFF style="background: var(--tone-X-
        // bg)" and onto a literal bg-X-bg/text-X-ink class pair. Root-caused live (a user screenshot
        // of this exact row showed tile 3's pill and spark area rendering as flat, colourless gray):
        // getComputedStyle confirmed --tone-warning-fg resolves fine but --tone-warning-bg comes back
        // completely EMPTY, and the underlying --color-warning-bg it aliases is equally empty — not
        // frozen-wrong like the earlier @theme inline bug, genuinely never emitted onto :root at all.
        // Checked systematically: every -bg AND -dot tone token is empty; every -fg/-ink one resolves.
        // No utility class anywhere in the whole page reads any of the six by name either way, so
        // this isn't the "needs a triggering class" mechanism already found for shadow-sidebar in the
        // usual sense — but the fix is the same proven shape: reference the value through an actual
        // Tailwind utility CLASS, not a raw var() in inline style/hand-authored CSS. Verified live
        // before rolling out: injecting class="bg-warning-bg text-warning-ink" onto a bare test
        // element resolved both correctly, where the equivalent inline style had not. This is a
        // large, pre-existing, previously-undiscovered gap — 63 more var(--tone-*-bg) sites and an
        // unknown number of -dot sites remain across identity.mjs/process.mjs/surfaces.mjs/
        // behaviour.mjs, flagged to the user rather than swept silently; only this file's own
        // StatTile sites are fixed here.
        //
        // 2026-08-13, later still — moved to FIRST specimen (was second). Page agents copy the
        // cookbook's FIRST matching example verbatim; with the bare tile sorting first, every KPI
        // row across multiple unrelated app builds came back with no delta/spark even though the
        // real seed data had a computable history — traced to this ordering, not to any one build.
        // This is now the example an agent sees first, matching the blurb's explicit default.
        label: "DEFAULT — delta + series: deltaTone lets the pill read independently of the figure and the spark",
        bare: true,
        html: dedent(`
          <div class="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
            <section class="bg-surface shadow-panel text-secondary rounded-xl card-pad-metric">
              <div class="flex items-start justify-between gap-3">
                <p class="m-0 min-w-0 truncate text-kpi-label text-text-muted">System uptime</p>
                <span class="flex-none rounded-full px-2 py-0.5 font-mono text-data font-semibold tabular-nums bg-success-bg text-success-ink">+0.1</span>
              </div>
              <p class="m-0 flex items-baseline gap-2" style="margin-top: var(--kpi-gap, 12px)">
                <span class="font-display text-[28px] font-medium tracking-[-.028em] tabular-nums leading-none text-secondary">99.9</span>
                <span class="text-kpi-label text-text-subtle">%</span>
              </p>
              <svg class="mt-4 block h-8 -mx-5 w-[calc(100%+40px)]" viewBox="0 0 120 32" preserveAspectRatio="none" aria-hidden="true">
                <defs>
                  <linearGradient id="st-spark-1" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stop-color="var(--color-primary)" stop-opacity=".22"></stop>
                    <stop offset="1" stop-color="var(--color-primary)" stop-opacity="0"></stop>
                  </linearGradient>
                </defs>
                <path fill="url(#st-spark-1)" stroke="none" d="M0.0 7.6 L13.3 10.4 L26.7 16.0 L40.0 27.2 L53.3 30.0 L66.7 18.8 L80.0 13.2 L93.3 7.6 L106.7 2.0 L120.0 4.8 L120 32 L0 32 Z"></path>
                <path fill="none" stroke="var(--color-primary)" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round" d="M0.0 7.6 L13.3 10.4 L26.7 16.0 L40.0 27.2 L53.3 30.0 L66.7 18.8 L80.0 13.2 L93.3 7.6 L106.7 2.0 L120.0 4.8"></path>
              </svg>
            </section>
            <section class="bg-surface shadow-panel text-secondary rounded-xl card-pad-metric">
              <div class="flex items-start justify-between gap-3">
                <p class="m-0 min-w-0 truncate text-kpi-label text-text-muted">Error rate</p>
                <span class="flex-none rounded-full px-2 py-0.5 font-mono text-data font-semibold tabular-nums bg-danger-bg text-danger-ink">+0.2</span>
              </div>
              <p class="m-0 flex items-baseline gap-2" style="margin-top: var(--kpi-gap, 12px)">
                <span class="font-display text-[28px] font-medium tracking-[-.028em] tabular-nums leading-none text-secondary">0.4</span>
                <span class="text-kpi-label text-text-subtle">%</span>
              </p>
              <svg class="mt-4 block h-8 -mx-5 w-[calc(100%+40px)]" viewBox="0 0 120 32" preserveAspectRatio="none" aria-hidden="true">
                <defs>
                  <linearGradient id="st-spark-2" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stop-color="var(--color-primary)" stop-opacity=".22"></stop>
                    <stop offset="1" stop-color="var(--color-primary)" stop-opacity="0"></stop>
                  </linearGradient>
                </defs>
                <path fill="url(#st-spark-2)" stroke="none" d="M0.0 30.0 L13.3 26.5 L26.7 28.3 L40.0 19.5 L53.3 12.5 L66.7 16.0 L80.0 7.3 L93.3 9.0 L106.7 3.8 L120.0 2.0 L120 32 L0 32 Z"></path>
                <path fill="none" stroke="var(--color-primary)" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round" d="M0.0 30.0 L13.3 26.5 L26.7 28.3 L40.0 19.5 L53.3 12.5 L66.7 16.0 L80.0 7.3 L93.3 9.0 L106.7 3.8 L120.0 2.0"></path>
              </svg>
            </section>
            <section class="bg-surface shadow-panel text-secondary rounded-xl card-pad-metric">
              <div class="flex items-start justify-between gap-3">
                <p class="m-0 min-w-0 truncate text-kpi-label text-text-muted">Open claims (uniform)</p>
                <span class="flex-none rounded-full px-2 py-0.5 font-mono text-data font-semibold tabular-nums bg-warning-bg text-warning-ink">+6</span>
              </div>
              <p class="m-0 flex items-baseline gap-2" style="margin-top: var(--kpi-gap, 12px)">
                <span class="font-display text-[28px] font-medium tracking-[-.028em] tabular-nums leading-none" style="color: var(--color-warning-ink)">42</span>
                <span class="text-kpi-label text-text-subtle">this month</span>
              </p>
              <svg class="mt-4 block h-8 -mx-5 w-[calc(100%+40px)]" viewBox="0 0 120 32" preserveAspectRatio="none" aria-hidden="true">
                <defs>
                  <linearGradient id="st-spark-3" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stop-color="var(--color-warning-ink)" stop-opacity=".22"></stop>
                    <stop offset="1" stop-color="var(--color-warning-ink)" stop-opacity="0"></stop>
                  </linearGradient>
                </defs>
                <path fill="url(#st-spark-3)" stroke="none" d="M0.0 30.0 L20.0 20.7 L40.0 23.0 L60.0 11.3 L80.0 4.3 L100.0 9.0 L120.0 2.0 L120 32 L0 32 Z"></path>
                <path fill="none" stroke="var(--color-warning-ink)" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round" d="M0.0 30.0 L20.0 20.7 L40.0 23.0 L60.0 11.3 L80.0 4.3 L100.0 9.0 L120.0 2.0"></path>
              </svg>
            </section>
            <section class="bg-surface shadow-panel text-secondary rounded-xl card-pad-metric">
              <div class="flex items-start justify-between gap-3">
                <p class="m-0 min-w-0 truncate text-kpi-label text-text-muted">No series</p>
                <span class="flex-none rounded-full px-2 py-0.5 font-mono text-data font-semibold tabular-nums bg-info-bg text-info-ink">new</span>
              </div>
              <p class="m-0 flex items-baseline gap-2" style="margin-top: var(--kpi-gap, 12px)">
                <span class="font-display text-[28px] font-medium tracking-[-.028em] tabular-nums leading-none text-secondary">7</span>
                <span class="text-kpi-label text-text-subtle">approvals</span>
              </p>
            </section>
          </div>
        `),
      },
      {
        label: "FALLBACK ONLY — a row with no computable history at all, not the default shape for a KPI row",
        bare: true,
        html: dedent(`
          <div class="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
            <section class="bg-surface shadow-panel text-secondary rounded-xl card-pad-metric">
              <p class="m-0 text-kpi-label text-text-muted">Open claims</p>
              <p class="m-0 flex items-baseline gap-2" style="margin-top: var(--kpi-gap, 12px)">
                <span class="font-display text-[28px] font-medium tracking-[-.028em] tabular-nums leading-none text-secondary">42</span>
                <span class="text-kpi-label text-text-subtle">this month</span>
              </p>
            </section>
            <section class="bg-surface shadow-panel text-secondary rounded-xl card-pad-metric">
              <p class="m-0 text-kpi-label text-text-muted">Awaiting you</p>
              <p class="m-0 flex items-baseline gap-2" style="margin-top: var(--kpi-gap, 12px)">
                <span class="font-display text-[28px] font-medium tracking-[-.028em] tabular-nums leading-none text-primary">7</span>
                <span class="text-kpi-label text-text-subtle">approvals</span>
              </p>
            </section>
            <section class="bg-surface shadow-panel text-secondary rounded-xl card-pad-metric">
              <p class="m-0 text-kpi-label text-text-muted">Closed</p>
              <p class="m-0 flex items-baseline gap-2" style="margin-top: var(--kpi-gap, 12px)">
                <span class="font-display text-[28px] font-medium tracking-[-.028em] tabular-nums leading-none text-secondary">311</span>
                <span class="text-kpi-label text-text-subtle">ytd</span>
              </p>
            </section>
            <section class="bg-surface shadow-panel text-secondary rounded-xl card-pad-metric">
              <p class="m-0 text-kpi-label text-text-muted">Median age</p>
              <p class="m-0 flex items-baseline gap-2" style="margin-top: var(--kpi-gap, 12px)">
                <span class="font-display text-[28px] font-medium tracking-[-.028em] tabular-nums leading-none text-secondary">4.2</span>
                <span class="text-kpi-label text-text-subtle">days</span>
              </p>
            </section>
          </div>
        `),
      },
    ],
  },

  {
    id: "metric-card",
    name: "MetricCard",
    category: "Data",
    starterTwin: "kit/Compat.jsx",
    summary: "StatTile's richer sibling — an icon chip, the figure, and a trend line.",
    blurb:
      "The same metric-role card StatTile draws, with two things StatTile deliberately refuses. " +
      "That refusal is on the record in kit/Cards.jsx and in StatTile's own footer here, in the " +
      "same words: alarm recolours the FIGURE, \"which is why there is no icon slot here\". So the " +
      "anatomy went where the props already were — MetricCard has always ACCEPTED icon and delta, " +
      "it simply rendered the icon as inline text beside the label. Two components, two answers, " +
      "both stated. Reach for StatTile when the number is the whole story and MetricCard when it " +
      "needs a category and a direction.",
    footer:
      "The chip's RADIUS is the contract's and its SIZE is not: `rounded-lg` is the \"a surface " +
      "inside a surface steps down one rung\" token Card's nested specimen reads, and a chip on a " +
      "card is exactly that; 44px is stock Tailwind, the same way KanbanBoard's column width and " +
      "FunnelChart's bar height are. Colour, radius, shadow and type come from the contract — " +
      "structural lengths do not have to. The fill is --accent, the tint every language already " +
      "keeps for a quiet inset, because no language declares a KPI icon tile at all. THE TREND " +
      "ARROW IS DRAWN, NOT TYPED: a ▲ character inherits the font and shifts its weight and " +
      "baseline across Poppins, Archivo and Manrope, where an SVG triangle sits identically in all " +
      "three — Breadcrumb's argument for its separator, and it wins here for the same reason. One " +
      "path, rotated 180° for a fall, so the two directions cannot drift apart. A delta of exactly " +
      "zero renders nothing rather than a flat 0%, and the arrow is aria-hidden with the direction " +
      "carried on the label instead, so a screen reader hears \"up 12 percent\" rather than \"12%\".",
    bindings: [
      { field: "icon", type: "node", example: "<svg width=\"16\" height=\"16\">…</svg>", note: "rides in an --accent chip at the card's rounded-lg rung; omit it and the figure takes the full width, which is StatTile" },
      { field: "label", type: "string", example: '"Open claims"', note: "caption above the figure, in text-kpi-label, truncating rather than wrapping" },
      { field: "value", type: "node", example: '"42"', note: "the figure — tabular numerals so a row of tiles aligns column-wise" },
      { field: "sub", type: "string", example: '"this month"', note: "sits on the figure's baseline, in the muted meta ink" },
      { field: "delta", type: "number", example: "12", note: "signed. Success above zero, danger below; exactly zero renders NOTHING rather than a flat 0%" },
      { field: "deltaLabel", type: "string", example: '"vs last month"', note: "what the delta is measured against — without it a percentage is a number with no claim attached" },
      { field: "tone", type: "tone name", example: '"indigo"', note: "colours the figure through the legacy tone names, which resolve to the language's own chart ramp" },
      { field: "spark / featured", type: "any", example: "—", note: "accepted and DROPPED rather than faked — no language declares a KPI sparkline, and one drawn in an un-themed colour is worse than none" },
    ],
    specimens: [
      {
        label: "a row of four — three with an icon chip, two with a trend, one with neither. The fourth is what StatTile draws.",
        bare: true,
        html: dedent(`
          <div class="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
            <section class="bg-surface shadow-panel text-secondary rounded-xl card-pad-metric">
              <div class="flex items-start gap-4">
                <span class="grid h-11 w-11 flex-none place-items-center rounded-lg bg-accent text-accent-foreground" aria-hidden="true">
                  <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
                    <path d="M2 2h5v5H2zM9 2h5v5H9zM2 9h5v5H2zM9 9h5v5H9z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"></path>
                  </svg>
                </span>
                <div class="min-w-0 flex-1">
                  <p class="m-0 truncate text-kpi-label text-muted-foreground">Open claims</p>
                  <p class="m-0 flex items-baseline gap-2" style="margin-top: var(--kpi-gap, 12px)">
                    <span class="font-display text-kpi" style="color: var(--chart-1)">42</span>
                    <span class="text-kpi-label text-meta-foreground">this month</span>
                  </p>
                  <p class="m-0 mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs">
                    <span class="inline-flex items-center gap-1 font-mono text-data font-semibold tabular-nums" aria-label="up 12 percent" style="color: var(--color-success-ink)">
                      <svg width="7" height="6" viewBox="0 0 7 6" aria-hidden="true"><path d="M3.5 0 7 6H0z" fill="currentColor"></path></svg>12%
                    </span>
                    <span class="text-muted-foreground">vs last month</span>
                  </p>
                </div>
              </div>
            </section>
            <section class="bg-surface shadow-panel text-secondary rounded-xl card-pad-metric">
              <div class="flex items-start gap-4">
                <span class="grid h-11 w-11 flex-none place-items-center rounded-lg bg-accent text-accent-foreground" aria-hidden="true">
                  <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
                    <path d="M8 1.5 14.5 13h-13z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"></path>
                  </svg>
                </span>
                <div class="min-w-0 flex-1">
                  <p class="m-0 truncate text-kpi-label text-muted-foreground">At risk</p>
                  <p class="m-0 flex items-baseline gap-2" style="margin-top: var(--kpi-gap, 12px)">
                    <span class="font-display text-kpi" style="color: var(--chart-3)">7</span>
                    <span class="text-kpi-label text-meta-foreground">approvals</span>
                  </p>
                  <p class="m-0 mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs">
                    <span class="inline-flex items-center gap-1 font-mono text-data font-semibold tabular-nums" aria-label="down 4 percent" style="color: var(--color-danger-ink)">
                      <svg width="7" height="6" viewBox="0 0 7 6" aria-hidden="true" class="rotate-180"><path d="M3.5 0 7 6H0z" fill="currentColor"></path></svg>4%
                    </span>
                    <span class="text-muted-foreground">vs last month</span>
                  </p>
                </div>
              </div>
            </section>
            <section class="bg-surface shadow-panel text-secondary rounded-xl card-pad-metric">
              <div class="flex items-start gap-4">
                <span class="grid h-11 w-11 flex-none place-items-center rounded-lg bg-accent text-accent-foreground" aria-hidden="true">
                  <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
                    <path d="M13.5 4.5 6.5 12 2.5 8" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"></path>
                  </svg>
                </span>
                <div class="min-w-0 flex-1">
                  <p class="m-0 truncate text-kpi-label text-muted-foreground">Closed</p>
                  <p class="m-0 flex items-baseline gap-2" style="margin-top: var(--kpi-gap, 12px)">
                    <span class="font-display text-kpi" style="color: var(--chart-2)">311</span>
                    <span class="text-kpi-label text-meta-foreground">ytd</span>
                  </p>
                </div>
              </div>
            </section>
            <section class="bg-surface shadow-panel text-secondary rounded-xl card-pad-metric">
              <div class="flex items-start gap-4">
                <div class="min-w-0 flex-1">
                  <p class="m-0 truncate text-kpi-label text-muted-foreground">Median age</p>
                  <p class="m-0 flex items-baseline gap-2" style="margin-top: var(--kpi-gap, 12px)">
                    <span class="font-display text-kpi" style="color: var(--chart-4)">4.2</span>
                    <span class="text-kpi-label text-meta-foreground">days</span>
                  </p>
                </div>
              </div>
            </section>
          </div>
        `),
      },
      {
        label: "the icon is optional — the same row without it, which is what StatTile is",
        bare: true,
        html: dedent(`
          <div class="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
            <section class="bg-surface shadow-panel text-secondary rounded-xl card-pad-metric">
              <div class="flex items-start gap-4">
                <div class="min-w-0 flex-1">
                  <p class="m-0 truncate text-kpi-label text-muted-foreground">Open claims</p>
                  <p class="m-0 flex items-baseline gap-2" style="margin-top: var(--kpi-gap, 12px)">
                    <span class="font-display text-kpi" style="color: var(--chart-1)">42</span>
                    <span class="text-kpi-label text-meta-foreground">this month</span>
                  </p>
                  <p class="m-0 mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs">
                    <span class="inline-flex items-center gap-1 font-mono text-data font-semibold tabular-nums" aria-label="up 12 percent" style="color: var(--color-success-ink)">
                      <svg width="7" height="6" viewBox="0 0 7 6" aria-hidden="true"><path d="M3.5 0 7 6H0z" fill="currentColor"></path></svg>12%
                    </span>
                    <span class="text-muted-foreground">vs last month</span>
                  </p>
                </div>
              </div>
            </section>
            <section class="bg-surface shadow-panel text-secondary rounded-xl card-pad-metric">
              <div class="flex items-start gap-4">
                <div class="min-w-0 flex-1">
                  <p class="m-0 truncate text-kpi-label text-muted-foreground">At risk</p>
                  <p class="m-0 flex items-baseline gap-2" style="margin-top: var(--kpi-gap, 12px)">
                    <span class="font-display text-kpi" style="color: var(--chart-3)">7</span>
                    <span class="text-kpi-label text-meta-foreground">approvals</span>
                  </p>
                  <p class="m-0 mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs">
                    <span class="inline-flex items-center gap-1 font-mono text-data font-semibold tabular-nums" aria-label="down 4 percent" style="color: var(--color-danger-ink)">
                      <svg width="7" height="6" viewBox="0 0 7 6" aria-hidden="true" class="rotate-180"><path d="M3.5 0 7 6H0z" fill="currentColor"></path></svg>4%
                    </span>
                    <span class="text-muted-foreground">vs last month</span>
                  </p>
                </div>
              </div>
            </section>
          </div>
        `),
      },
      {
        label: "<BigStat/>",
        html: dedent(`
          <span class="font-display text-kpi" style="color: var(--chart-5)">1,284</span>
        `),
      },
    ],
  },

  {
    id: "calendar",
    name: "Calendar · Agenda",
    category: "Data",
    starterTwin: "kit/Calendar.jsx",
    summary: "A month grid with event markers, and the dated list that reads beside it.",
    blurb:
      "[OURS], no design language declares a calendar — every value below is still a token " +
      "tokens.css already holds: the row hover, the grid rule, the tone map, the data voice. TWO " +
      "components, not one, sharing a data shape and nothing else: the old cookbook fused a month " +
      "grid and an upcoming rail into a single 12-column block, which meant neither could be used " +
      "alone — a page that wants only \"what is next\" had to render a month it did not need.",
    footer:
      "DATES ARE STRINGS AND NUMBERS, never Date objects. A prototype's SEED is JSON and a " +
      "Kissflow date field arrives as an ISO string; parsing to a Date and back is exactly where " +
      "timezone drift enters a component that has no business knowing about timezones. So `day` " +
      "is the number printed in the cell, and nothing here computes one from the other — " +
      "including `lead`, the count of blank cells before day 1 (Agenda's own weekday abbreviation " +
      "needs that same fact, which is why it takes `lead` too). Leading AND trailing blanks now " +
      "render, so the grid always completes to full rows. A marked day draws at most THREE dots " +
      "however many events it holds: a cell is not a legend. Today is a 1px INSET ring, not a " +
      "fill, so it survives sitting on a Selected cell instead of competing with it — Selected " +
      "itself is a fill (--color-primary-bg / -primary-ink), which is also why a selected day's " +
      "dots recolour to -primary-ink: a coloured dot on a coloured fill is illegible. A day is a " +
      "real target only when it is BOTH marked and `onSelect` is supplied — \"an empty day is not " +
      "a target.\" Agenda's spine reads the SAME token as the day's own dot, so the grid and the " +
      "list key together by construction, not by two authors agreeing today.",
    bindings: [
      { field: "days", type: "number", example: "31", note: "how many cells the month has — the caller's fact, not computed" },
      { field: "lead", type: "number", example: "4", note: "blank cells before day 1. Which weekday the month starts on is a fact about that month in that year." },
      { field: "events", type: "array<{day,title,time,tone,kind}>", example: '{ day: 18, title: "Survey — MV Northern Compass", tone: "danger", kind: "Survey" }', note: "marks a day with up to three tone dots; Agenda reads the same array" },
      { field: "selected / onSelect", type: "number / fn", example: "18", note: "supplying onSelect makes cells real buttons, and only on MARKED days — an empty day is not a target. Omit it and the grid is inert" },
      { field: "today", type: "number", example: "12", note: "a 1px inset ring, not a fill — stacks with Selected instead of competing with it" },
      { field: "title / lead", type: "string / number", example: '"Upcoming" / 4', note: "Agenda: caller-supplied facts it cannot derive — title because Agenda has no month/year context, lead because a row's weekday abbreviation needs to know where day 1 sat" },
      { field: "day", type: "number", example: "18", note: "Agenda: filters to one day. Omit it and every event lists, day-ascending" },
      { field: "onSelect / onClear", type: "fn / fn", example: "—", note: "Agenda: onSelect makes rows clickable; onClear renders the \"Whole month\" pill, shown only once a day is set" },
    ],
    specimens: [
      {
        label: "Calendar — events + onSelect: August, day 18 selected, day 12 is today",
        html: calendarHtml({ days: 31, lead: 4, events: CAL_EVENTS, selected: 18, today: 12, interactive: true }),
      },
      {
        label: "Calendar — inert: no onSelect, so the cells are not buttons",
        html: calendarHtml({ days: 30, lead: 0, events: [{ day: 2, tone: "info" }, { day: 14, tone: "success" }] }),
      },
      {
        label: "Agenda — filtered to one day, with the clear-selection pill",
        html: agendaHtml({ events: CAL_EVENTS, day: 18, lead: 4, clickable: true, showClear: true }),
      },
      {
        label: "Agenda — day omitted: the whole month, day-ascending",
        html: agendaHtml({ events: CAL_EVENTS, title: "Upcoming", lead: 4 }),
      },
      {
        label: "Agenda — events={[]}: the empty state",
        html: agendaHtml({ events: [] }),
      },
    ],
  },

  {
    id: "progress",
    name: "ProgressBar · SegmentBar · ProgressList",
    category: "Data",
    starterTwin: "kit/Progress.jsx",
    summary: "One rail, reused three ways: bare, split proportionally, or listed with labels.",
    blurb:
      "A progress rail and a chart bar are the same object, so they share the track token — " +
      "bg-track — everywhere. The height doesn't have to match: this page draws it at h-1.5 " +
      "(6px), DataCharts' own bars at h-2.5 (10px). One token, two heights, on purpose. The fill " +
      "is --color-primary unset, or a tone's own -dot value with it (the solid dot value, " +
      "\"exactly where a tone's full strength is allowed to appear\") — a caller-supplied tone, " +
      "never derived from the number itself.",
    footer:
      "ProgressList is not HBars wearing a different name, though it looks like one. HBars scales " +
      "every row against the largest VALUE in the set, so its longest bar always reaches the end " +
      "of its track; ProgressList scales each row against its own MAX, so a row at 40% looks like " +
      "40% regardless of what the others do. Using HBars for completion figures is the classic way " +
      "to make three-quarters done look finished. indeterminate is a fixed ~34%-wide fill in " +
      "--color-border, not a tone and not primary — there is no known value to colour toward — " +
      "and sends no aria-valuenow at all rather than a dishonest 0 or the fixed 34. [OURS]: the " +
      "fill below reads as a literal bg-<tone>-dot/bg-primary/bg-border CLASS, not " +
      "Progress.jsx's own inline `style=\"background: var(--color-<tone>-dot, var(--color-<tone>-" +
      "ink))\"` — this session's StatTile fix found every -bg AND -dot tone token empty through a " +
      "raw var() in this catalog's runtime (checked systematically; only -fg/-ink tokens resolve), " +
      "so the same class-based fix applies here. danger has no --color-danger-dot token to begin " +
      "with (\"dot reuses --color-danger, per Foundations\"), so its fill reads bg-danger directly, " +
      "same as Calendar's event dots do.",
    bindings: [
      { field: "value", type: "number", example: "68", note: "ProgressBar: a percentage unless max is given" },
      { field: "max", type: "number", example: "100", note: "ProgressBar: value is read against this, not against the largest value in a set" },
      { field: "tone", type: "enum", example: '"danger"', note: "ProgressBar: unset takes --color-primary" },
      { field: "label", type: "string", example: '"Marine"', note: "ProgressBar: adds the label column at min-w-22, truncating rather than wrapping" },
      { field: "showValue", type: "boolean", example: "true", note: "ProgressBar/ProgressList: appends the percentage in the data voice" },
      { field: "indeterminate", type: "boolean", example: "true", note: "ProgressBar: a fixed ~34% fill in --color-border; no percentage announced — aria-valuenow is omitted, not sent as 0" },
      { field: "segments", type: "array<{key,label,value,color?}>", example: '[{ key: "approved", label: "Approved", value: 311 }, …]', note: "SegmentBar: proportioned within the row, not against 100. A zero-value segment is skipped, not a zero-width sliver" },
      { field: "legend", type: "boolean", example: "true", note: "SegmentBar: the key below, with counts in the data voice" },
      { field: "items", type: "array<{label,value,max?,tone?}>", example: '[{ label: "Marine", value: 92 }, { label: "Energy", value: 12, tone: "danger" }]', note: "ProgressList: each row scaled against its OWN max, not the largest value in the set" },
    ],
    specimens: [
      {
        label: "ProgressBar — bare, labelled, toned",
        html: dedent(`
          <div class="flex flex-col gap-4">
            <div class="flex items-center gap-bar">
              <span class="relative h-1.5 flex-1 overflow-hidden rounded-full bg-track" role="progressbar" aria-valuenow="68" aria-valuemin="0" aria-valuemax="100" aria-label="Progress">
                <span class="absolute inset-y-0 left-0 rounded-full bg-primary transition-[width] duration-[160ms] ease-standard" style="width: 68%"></span>
              </span>
            </div>
            <div class="flex items-center gap-bar">
              <span class="min-w-22 truncate text-xs text-text-muted" title="Marine">Marine</span>
              <span class="relative h-1.5 flex-1 overflow-hidden rounded-full bg-track" role="progressbar" aria-valuenow="92" aria-valuemin="0" aria-valuemax="100" aria-label="Marine">
                <span class="absolute inset-y-0 left-0 rounded-full bg-primary transition-[width] duration-[160ms] ease-standard" style="width: 92%"></span>
              </span>
              <span class="min-w-value text-right font-mono text-data tabular-nums text-secondary">92%</span>
            </div>
            <div class="flex items-center gap-bar">
              <span class="min-w-22 truncate text-xs text-text-muted" title="Energy">Energy</span>
              <span class="relative h-1.5 flex-1 overflow-hidden rounded-full bg-track" role="progressbar" aria-valuenow="12" aria-valuemin="0" aria-valuemax="100" aria-label="Energy">
                <span class="absolute inset-y-0 left-0 rounded-full bg-danger transition-[width] duration-[160ms] ease-standard" style="width: 12%"></span>
              </span>
              <span class="min-w-value text-right font-mono text-data tabular-nums text-secondary">12%</span>
            </div>
          </div>
        `),
      },
      {
        label: "ProgressBar — indeterminate: no value to announce",
        html: dedent(`
          <div class="flex items-center gap-bar">
            <span class="min-w-22 truncate text-xs text-text-muted" title="Syncing">Syncing</span>
            <span class="relative h-1.5 flex-1 overflow-hidden rounded-full bg-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-label="Syncing">
              <span class="absolute inset-y-0 left-0 rounded-full bg-border transition-[width] duration-[160ms] ease-standard" style="width: 34%"></span>
            </span>
          </div>
        `),
      },
      {
        label: "SegmentBar — segments carry no radius of their own, the track clips them to the language's",
        html: dedent(`
          <div class="flex flex-col gap-2.5">
            <span class="flex h-1.5 w-full overflow-hidden rounded-full bg-track" role="progressbar" aria-valuenow="100" aria-valuemin="0" aria-valuemax="100" aria-label="Distribution">
              <span class="h-full" title="Approved: 311" style="width: 85.91%; background: var(--chart-1)"></span>
              <span class="h-full" title="Open: 42" style="width: 11.60%; background: var(--chart-2)"></span>
              <span class="h-full" title="Rejected: 9" style="width: 2.49%; background: var(--chart-3)"></span>
            </span>
            <div class="flex flex-wrap gap-x-4 gap-y-1.5">
              <span class="flex items-center gap-1.5 text-xs text-text-muted">
                <span class="size-1.75 flex-none rounded-full" style="background: var(--chart-1)"></span>
                Approved
                <span class="font-mono text-data tabular-nums text-secondary">311</span>
              </span>
              <span class="flex items-center gap-1.5 text-xs text-text-muted">
                <span class="size-1.75 flex-none rounded-full" style="background: var(--chart-2)"></span>
                Open
                <span class="font-mono text-data tabular-nums text-secondary">42</span>
              </span>
              <span class="flex items-center gap-1.5 text-xs text-text-muted">
                <span class="size-1.75 flex-none rounded-full" style="background: var(--chart-3)"></span>
                Rejected
                <span class="font-mono text-data tabular-nums text-secondary">9</span>
              </span>
            </div>
          </div>
        `),
      },
      {
        label: "ProgressList — completion by department, each row scaled against its own max",
        html: dedent(`
          <ul class="m-0 flex list-none flex-col gap-bar p-0">
            <li>
              <div class="flex items-center gap-bar">
                <span class="min-w-22 truncate text-xs text-text-muted" title="Marine">Marine</span>
                <span class="relative h-1.5 flex-1 overflow-hidden rounded-full bg-track" role="progressbar" aria-valuenow="92" aria-valuemin="0" aria-valuemax="100" aria-label="Marine">
                  <span class="absolute inset-y-0 left-0 rounded-full bg-primary transition-[width] duration-[160ms] ease-standard" style="width: 92%"></span>
                </span>
                <span class="min-w-value text-right font-mono text-data tabular-nums text-secondary">92%</span>
              </div>
            </li>
            <li>
              <div class="flex items-center gap-bar">
                <span class="min-w-22 truncate text-xs text-text-muted" title="Aviation">Aviation</span>
                <span class="relative h-1.5 flex-1 overflow-hidden rounded-full bg-track" role="progressbar" aria-valuenow="68" aria-valuemin="0" aria-valuemax="100" aria-label="Aviation">
                  <span class="absolute inset-y-0 left-0 rounded-full bg-success-dot transition-[width] duration-[160ms] ease-standard" style="width: 68%"></span>
                </span>
                <span class="min-w-value text-right font-mono text-data tabular-nums text-secondary">68%</span>
              </div>
            </li>
            <li>
              <div class="flex items-center gap-bar">
                <span class="min-w-22 truncate text-xs text-text-muted" title="Rail">Rail</span>
                <span class="relative h-1.5 flex-1 overflow-hidden rounded-full bg-track" role="progressbar" aria-valuenow="41" aria-valuemin="0" aria-valuemax="100" aria-label="Rail">
                  <span class="absolute inset-y-0 left-0 rounded-full bg-warning-dot transition-[width] duration-[160ms] ease-standard" style="width: 41%"></span>
                </span>
                <span class="min-w-value text-right font-mono text-data tabular-nums text-secondary">41%</span>
              </div>
            </li>
            <li>
              <div class="flex items-center gap-bar">
                <span class="min-w-22 truncate text-xs text-text-muted" title="Energy">Energy</span>
                <span class="relative h-1.5 flex-1 overflow-hidden rounded-full bg-track" role="progressbar" aria-valuenow="12" aria-valuemin="0" aria-valuemax="100" aria-label="Energy">
                  <span class="absolute inset-y-0 left-0 rounded-full bg-danger transition-[width] duration-[160ms] ease-standard" style="width: 12%"></span>
                </span>
                <span class="min-w-value text-right font-mono text-data tabular-nums text-secondary">12%</span>
              </div>
            </li>
          </ul>
        `),
      },
    ],
  },
];
