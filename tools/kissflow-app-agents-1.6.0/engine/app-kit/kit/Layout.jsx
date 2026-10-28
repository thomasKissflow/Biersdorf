/**
 * PageHeader · Grid · Split · Bento — page furniture and layout.
 *
 * REDESIGNED 2026-08-13 from Layout.dc.html (Claude Design project "Mobile app style guide
 * sheet", 2b8a920b-a786-4430-bd63-b0bc0dbe6229). Its own line: "spacing only, plus one new
 * token" — --sidebar-width, already in tokens.css. [SOURCE] tags below are that page's; [OURS]
 * is a call this file makes that the page does not.
 *
 * NO AppShell HERE. Layout.dc.html's own "THE SHELL" section (sidebar / top bar / content area)
 * describes the app chrome, but that chrome is NOT built from this file and never has been — grep
 * this repo's history and there is no AppShell export at any point. The app's actual root layout
 * is src/components/app-shell.jsx (mounted at src/main.jsx), styled by the separate `.shell` /
 * `.sidebar` / `.nav-item` / `.topbar` / `.content` rules in src/index.css on the shadcn/--kf-*
 * alias system — an older stack this migration has not reached. Porting THE SHELL's numbers
 * (--sidebar-width, the nav item ring, the 68px no-fill top bar) means editing THAT file, not
 * this one; out of scope for this pass. What follows is the five components this file has
 * actually always exported.
 *
 * These are the least token-hungry components in the set and that is the point of writing them
 * down: a layout primitive should consume SPACING and nothing else. No language declares a
 * "grid" or a "split", and none should — Foundations' own spacing note is "Base unit all gap/
 * padding/margin numbers multiply", and a column count is not a design-language decision. So
 * everything here composes the ordinary 4px scale and reads exactly one contract token: --bar-gap,
 * via `gap-bar`, is deliberately NOT used here either, because a layout gap is not a bar gap.
 *
 * PageHeader is the exception and takes `on-canvas`, because a page title sits on the ground
 * rather than inside a card — which under a translucent language means a plate that crosses
 * whatever sits behind it. Same reasoning as the catalog chrome in gallery-kit.jsx.
 */

/**
 * Page breadcrumb (optional) · title · one-line summary/actions · optional stat row.
 *
 * [SOURCE] Layout.dc.html's PageHeader anatomy: a breadcrumb above the title, the title itself
 * at 27px/500/-.028em — "a distinct size from anything else in the type scale, this page's own
 * addition" — and below it, an optional row of small stat/label pairs on a --color-gray-3 rule,
 * "a step stronger than a normal row rule, since it's a section-level divider."
 *
 * `breadcrumb` is a slot, not a rendered Breadcrumb — this file does not import
 * `./Breadcrumb.jsx` (a component with its own in-flight migration), so a caller passes
 * `breadcrumb={<Breadcrumb …/>}` and gets the doc's "reuses the already-ported Breadcrumb"
 * behaviour without this file coupling to that one's API.
 *
 * `stats` is `[{ label, value }]`, [OURS] — the doc names the pattern but not a data shape.
 *
 * Every addition is optional and additive: `<PageHeader title="…"/>` alone still renders exactly
 * the two lines it always has (kit-smoke-test.jsx's own usage).
 */
export function PageHeader({ breadcrumb, title, subtitle, actions, stats, className = "" }) {
  return (
    <header className={"mb-6 flex flex-col gap-4 " + className}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          {breadcrumb && <div className="on-canvas mb-1.5">{breadcrumb}</div>}
          <h1 className="on-canvas m-0 font-display text-[27px] font-medium leading-tight tracking-[-.028em] text-secondary">
            {title}
          </h1>
          {subtitle && (
            <p className="on-canvas m-0 mt-2 max-w-2xl text-sm leading-relaxed text-text-muted">{subtitle}</p>
          )}
        </div>
        {/* 34px pills, at most one primary — [SOURCE] "one primary at most". A caller discipline:
            PageHeader renders whatever `actions` holds and cannot enforce a rank count over an
            arbitrary node. */}
        {actions && <div className="flex flex-none flex-wrap items-center gap-2.5">{actions}</div>}
      </div>
      {stats?.length > 0 && (
        <div className="flex flex-wrap items-baseline gap-6 border-t border-gray-3 pt-4">
          {stats.map((s, i) => (
            <div key={s.label ?? i} className="flex items-baseline gap-1.5">
              <span className="font-display text-sm font-semibold text-secondary">{s.value}</span>
              <span className="text-xs text-text-muted">{s.label}</span>
            </div>
          ))}
        </div>
      )}
    </header>
  );
}

/**
 * Grid — equal columns that collapse at the breakpoints, not at arbitrary widths.
 *
 * `cols` is a max, not a fixed count: 1 below sm, 2 below lg, then `cols`. [SOURCE] Layout.dc.html:
 * "column counts are not a design decision, they are a max… all four break at the same two
 * places" — COLS[6] used to break that rule (3 below lg, not 2); fixed to match 2/3/4.
 * Hard-coding the responsive steps rather than accepting a prop keeps every grid in the app
 * breaking at the same two places, which is what makes a page read as one page.
 */
const COLS = {
  2: "sm:grid-cols-2",
  3: "sm:grid-cols-2 lg:grid-cols-3",
  4: "sm:grid-cols-2 lg:grid-cols-4",
  6: "sm:grid-cols-2 lg:grid-cols-6",
};

// [SOURCE] "gap defaults to the shell's own 14px rhythm" — gap-3.5, the content area's own
// panel-to-panel gap, is the default everywhere in this file a gap is a default rather than a
// caller-supplied override.
export function Grid({ cols = 3, gap = "gap-3.5", className = "", children }) {
  return <div className={`grid grid-cols-1 ${COLS[cols] ?? COLS[3]} ${gap} ${className}`}>{children}</div>;
}

/**
 * Split — a main column and a rail. The rail is `lg:` only; below that it stacks BELOW the main
 * content rather than above it, because a rail is secondary by definition and pushing it above
 * the thing it annotates inverts that on the one viewport where you can least afford it.
 * (gallery-kit's language picker does the opposite on purpose — a control you are about to use
 * is not a rail.)
 */
export function Split({ rail, railWidth = "18rem", side = "right", className = "", children }) {
  const left = side === "left";
  return (
    // ONE copy of each child, reordered rather than re-rendered. The obvious way to write this —
    // a mobile block and a desktop block behind `lg:hidden` / `hidden lg:grid` — mounts every
    // child twice, which duplicates form state, effects and network calls at every viewport.
    // `gridTemplateColumns` is inert while the container is display:flex, so it can sit inline
    // and only take effect at lg. gap-3.5 — same 14px rhythm as Grid/Bento, per Layout.dc.html:
    // "used consistently for panel-to-panel spacing throughout the app".
    <div
      className={"flex flex-col gap-3.5 lg:grid lg:items-start " + className}
      style={{ gridTemplateColumns: left ? `${railWidth} 1fr` : `1fr ${railWidth}` }}
    >
      <div className={"min-w-0 order-1 " + (left ? "lg:order-2" : "lg:order-1")}>{children}</div>
      <div className={"order-2 " + (left ? "lg:order-1" : "lg:order-2")}>{rail}</div>
    </div>
  );
}

/**
 * Bento — a grid where a child may claim two columns or two rows.
 *
 * `<Bento.Item span="2x1">`. Deliberately only three spans: a bento with arbitrary spans stops
 * being a layout and becomes a canvas, and every card in it has to be designed for its own box.
 */
export function Bento({ cols = 4, gap = "gap-3.5", className = "", children }) {
  return (
    <div className={`grid grid-cols-1 ${COLS[cols] ?? COLS[4]} ${gap} auto-rows-[minmax(0,1fr)] ${className}`}>
      {children}
    </div>
  );
}

// Exactly three spans, [SOURCE] "more turns a layout into a canvas" — "1x1" is not a fourth span,
// it is the no-span default (empty class), so the lookup admits no value this table does not
// name; there is no row/col-number escape hatch for a caller to reach past it.
const SPAN = { "1x1": "", "2x1": "sm:col-span-2", "1x2": "sm:row-span-2", "2x2": "sm:col-span-2 sm:row-span-2" };

Bento.Item = function BentoItem({ span = "1x1", className = "", children }) {
  return <div className={`${SPAN[span] ?? ""} ${className}`}>{children}</div>;
};

/**
 * Separator — a rule between sections. `border-gray-3` — [SOURCE] Layout.dc.html: "reads
 * --color-gray-3, the functional rule weight, one step stronger than a row divider" — the same
 * step this file's own PageHeader stat-row uses above. Previously read `border-border`
 * (--color-border, #C8CACE), justified by a rule specific to a design language (Checkpoint) that
 * has since retired (see tokens.css banner, 2026-08-12) — that argument no longer applies to
 * this app's one remaining language, and gray-3 is what the current doc actually names.
 */
export function Separator({ orientation = "horizontal", className = "" }) {
  return (
    <div
      role="separator"
      aria-orientation={orientation}
      className={
        (orientation === "vertical" ? "h-full w-px border-l " : "w-full h-px border-t ") +
        "border-gray-3 flex-none " +
        className
      }
    />
  );
}
