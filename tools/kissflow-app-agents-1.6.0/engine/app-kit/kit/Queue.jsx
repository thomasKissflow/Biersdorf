/**
 * ApprovalRow · WipStrip — an inbox row that carries its own decision, and the per-stage counter
 * above it.
 *
 * REDESIGNED 2026-08-13 from Queue.dc.html (Claude Design project "Mobile app style guide sheet",
 * 2b8a920b-a786-4430-bd63-b0bc0dbe6229). [OURS] in the same sense the old banner claimed: no
 * design language declares an inbox row or a per-stage counter strip, so every VALUE below is a
 * token tokens.css already holds — the tone map StatusChip/Avatar/Card already read, the row rule
 * Table's own rows will read once it is ported, the `--color-track` groove PhotoCard's own stat
 * bar already fills — and the COMPOSITION stays the decision. Token mapping (verbatim, no new
 * tokens):
 *
 *   Row rule       --color-gray-1, border-TOP (was border-bottom/--row-divider) — "the same
 *                  divider a table row reads, so a queue and a register line up"
 *   Row hover      --color-row-hover, PENDING ROWS ONLY (was gated on clickability instead —
 *                  see WHOLE-ROW CLICK below)
 *   Age            font-mono 13px, --color-danger-ink past SLA, --color-secondary otherwise
 *                  (was font-mono text-data, one untinted colour always)
 *   Approve        primary rank, small size (was control-shape's own default size)
 *   Reject         outline rank at rest, hover → --color-danger-bg fill + --color-danger
 *                  border/ink (was the rank's own neutral hover)
 *   Decided row    opacity-60 · tone-tinted outcome chip replaces the two buttons (NEW state,
 *                  see `decided` below)
 *   WipStrip cell  --color-gray-1 left-border between cells, none on the first · mono 20px figure
 *                  (was each stage its own gapped metric-role Card with a --kpi-text 32px figure)
 *   Bar at rest    --color-text-subtle fill on a --color-track rail (NEW — the old strip drew no
 *                  bar at all, only an optional `alert` string)
 *   Over cap       count ink AND bar fill both --color-danger (ink specifically -ink), cap shown
 *                  beside the count — "14/10" (replaces the old freeform `alert` string entirely)
 *
 * WHOLE-ROW CLICK WAS THE BUG THIS PASS FIXES. The pre-migration file made the ENTIRE row
 * clickable whenever `onOpen` was supplied — role="button", a row-level onClick — and then
 * stopped the click from bubbling out of the Approve/Reject group with its own stopPropagation.
 * Its own comment even named the shape it was working around ("the row itself may be clickable,
 * and approving something must never also navigate to it") without noticing that IS the nested
 * click target the file's WHY-NOT-A-TABLE-ROW banner argues against one paragraph up: a decision
 * sitting inside a bigger click target it has to fight with stopPropagation to survive. Queue.dc.html
 * settles it the other way — onOpen now lives ONLY on the title (rendered as its own reset
 * <button>, never a wrapper around the row), so a click anywhere else on the row does nothing at
 * all, decided or not, and no stopPropagation is needed anywhere in this file any more.
 *
 * `decided` is NEW: "approved" | "rejected" | undefined. A decided row does NOT vanish or
 * reorder — it keeps its exact position in whatever list rendered it, drops to opacity-60, and
 * swaps its two buttons for a tone-tinted outcome pill (built on StatusChip — already the row's
 * own status pill, so the outcome reuses it rather than hand-rolling a second badge) — "so the
 * person can see what they just did and the list does not jump under the cursor mid-review."
 * ApprovalQueue itself needed no change for this: it already spreads `{...it}` onto each row, so
 * a caller merges `decided` onto an item's own object the same way it already supplies
 * title/meta/tone — see specimens/queue.jsx's WiredQueue for the wiring.
 *
 * AGE'S DANGER STATE reads the row's own `tone`, not a second prop: Queue.dc.html's API table
 * kept the row's signature at (title, meta, owner, status, tone, age) with no `late`/`overdue`
 * addition, and this row already has exactly one axis for "something is wrong here" — the same
 * `tone` that already recolours the avatar and the status chip. Minting a second, independent
 * "is this late" flag would let a row disagree with itself (danger tone, calm age, or the
 * reverse); reading tone===​"danger" for the age figure keeps the row's one word of judgment
 * consistent across all three places it shows up.
 */

import { Check, X } from "lucide-react";

import { Button } from "./Buttons.jsx";
import { StatusChip } from "./Chips.jsx";
import { Avatar } from "./Avatar.jsx";
import { Card } from "./Cards.jsx";

/** The two decided outcomes. [OURS]: Queue.dc.html names the two tones and icons ("approved =
 *  success tone bg/ink + check icon, rejected = danger tone bg/ink + X icon") but not a label —
 *  a fixed "Approved"/"Rejected" is the state being reported, independent of whatever verb
 *  `actionLabels` used for the button that produced it (a leave request is Granted by pressing a
 *  button labelled "Grant", but the outcome pill reports the state, not the verb). Built on
 *  StatusChip rather than a second pill implementation — same component the row's own `status`
 *  already renders, and its `icon` prop already wins over the dot for exactly this case. */
const OUTCOME = {
  approved: { tone: "success", label: "Approved", Icon: Check },
  rejected: { tone: "danger", label: "Rejected", Icon: X },
};

/**
 * ApprovalRow — one item awaiting a decision: who, what, how long, and the two answers.
 *
 * `age` takes the data voice, because every language gives a number the mono face. It is the
 * only figure on the row and the one most likely to be scanned down a column.
 */
export function ApprovalRow({
  title,
  meta,
  owner,
  tone = "neutral",
  status,
  age,
  onApprove,
  onReject,
  onOpen,
  decided,
  actionLabels = { approve: "Approve", reject: "Reject" },
  className = "",
}) {
  const outcome = OUTCOME[decided];
  return (
    <div
      className={
        "row-shape flex items-center gap-4 border-t border-gray-1 first:border-0 transition-colors " +
        (outcome ? "opacity-60 " : "hover:bg-row-hover ") +
        className
      }
    >
      {owner && <Avatar name={owner} tone={tone} />}
      <div className="min-w-0 flex-1">
        {/* onOpen is the ROW's only click affordance, and it lives here and nowhere else — see
            the file banner. A reset <button>, not a wrapper div: real keyboard/click semantics
            for free, no onKeyDown to hand-roll, and `font-sans` is explicit because preflight is
            off (tokens.css's own note) — a bare <button> keeps the UA's own font otherwise. */}
        {onOpen ? (
          <button
            type="button"
            onClick={onOpen}
            className="m-0 block w-full truncate border-0 bg-transparent p-0 text-left font-sans text-sm font-medium leading-snug text-foreground outline-none hover:underline focus-visible:ring focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
          >
            {title}
          </button>
        ) : (
          <p className="m-0 truncate text-sm font-medium leading-snug text-foreground">{title}</p>
        )}
        {meta && <p className="m-0 mt-0.5 truncate font-mono text-data tabular-nums text-meta-foreground">{meta}</p>}
      </div>
      {status && <StatusChip tone={tone}>{status}</StatusChip>}
      {/* [SOURCE] "font-mono 13px, --color-danger-ink if past SLA/late, --color-secondary
          otherwise" — 13px is Queue.dc.html's own number, not the (currently unbridged, see
          tokens.css's banner) --text-data scale, so it is a literal the same way Cards.jsx's
          CardTitle/StatTile hold their own explicit pixel sizes. */}
      {age && (
        <span
          className="hidden flex-none font-mono text-[13px] tabular-nums text-secondary sm:inline"
          style={tone === "danger" ? { color: "var(--color-danger-ink)" } : undefined}
        >
          {age}
        </span>
      )}
      {outcome ? (
        <StatusChip tone={outcome.tone} icon={<outcome.Icon />} className="flex-none">
          {outcome.label}
        </StatusChip>
      ) : (
        (onApprove || onReject) && (
          <div className="flex flex-none items-center gap-2">
            {onReject && (
              <Button
                rank="outline"
                size="sm"
                onClick={onReject}
                // "neutral at rest, danger only under the cursor" — Button's own outline hover
                // (tokens.css/Buttons.jsx: border-border/bg-surface/text-secondary) has to lose
                // to this one, and two flat Tailwind classes of equal specificity are ordered by
                // the compiled stylesheet, not by className string order — so this wins on
                // `!important` rather than on a hope about generation order.
                className="enabled:hover:!border-[var(--color-danger)] enabled:hover:!bg-[var(--color-danger-bg)] enabled:hover:!text-[var(--color-danger)]"
              >
                {actionLabels.reject}
              </Button>
            )}
            {onApprove && (
              <Button rank="primary" size="sm" onClick={onApprove}>
                {actionLabels.approve}
              </Button>
            )}
          </div>
        )
      )}
    </div>
  );
}

/** ApprovalQueue — the rows plus the empty state, so a caller never has to write the `.length`
 *  check that every caller otherwise writes slightly differently. Renders `items` in the order
 *  given and never filters or reorders on `decided` — a decided row is still an item, drawn in
 *  its own place by ApprovalRow above. */
export function ApprovalQueue({ items = [], empty = "Nothing waiting on you.", className = "", ...row }) {
  if (!items.length) return <p className="m-0 py-6 text-center text-sm text-muted-foreground">{empty}</p>;
  return (
    <div className={"flex flex-col " + className}>
      {items.map((it, i) => (
        <ApprovalRow
          key={it.id ?? i}
          {...it}
          onApprove={row.onApprove && (() => row.onApprove(it))}
          onReject={row.onReject && (() => row.onReject(it))}
          onOpen={row.onOpen && (() => row.onOpen(it))}
          actionLabels={row.actionLabels}
        />
      ))}
    </div>
  );
}

/** Foundations' own tone map (tokens.css §Tones) has no `--color-danger-dot` — "dot reuses
 *  --color-danger" is its own note, the same reading Calendar.jsx's `toneVars` already gives.
 *  Neutral/unset reuses --color-text-muted, per the same map. A CSS-level var(x, fallback) means
 *  a typo degrades to a visible muted dot rather than an invisible one. */
function stageDot(tone) {
  if (tone === "danger") return "var(--color-danger)";
  if (tone === "neutral" || !tone) return "var(--color-text-muted)";
  return `var(--color-${tone}-dot, var(--color-text-muted))`;
}

/**
 * WipStrip — per-stage counts, the band that leads a board page.
 *
 * ONE STRIP, NOT A GRID OF CARDS. Queue.dc.html draws the cells joined, "inner rules only, like
 * a calendar's grid" — border-left between cells, none on the first, same shape as Calendar.jsx's
 * own `cellRules`. That reads as one panel, so the strip wraps itself in `Card role="bare"` (no
 * padding of its own; each cell carries `card-pad-metric`) rather than each stage being its own
 * shadow-panel Card in a gapped grid the way the old file drew it — "usable standalone" is the
 * point of that panel, since a queue page drops this straight above ApprovalQueue with no card of
 * its own around it (see specimens/queue.jsx). `flex`, not the old auto-fit grid: a strip that
 * wraps to a second line breaks the shared-rule seam between cells (there is no rule to draw
 * between a cell and the one above it), so cells stay in one row and the strip scrolls instead —
 * the same trade-off Table.jsx makes for a wide table.
 */
export function WipStrip({ stages = [], className = "" }) {
  if (!stages.length) return null;
  return (
    <Card role="bare" className={"flex overflow-x-auto " + className}>
      {stages.map((s, i) => {
        const cap = s.cap;
        const overCap = cap != null && Number(s.count) > cap;
        const pct = cap > 0 ? Math.min(100, (Number(s.count) / cap) * 100) : Number(s.count) > 0 ? 100 : 0;
        return (
          <div
            key={s.key ?? s.label ?? i}
            className={"min-w-[9rem] flex-1 card-pad-metric " + (i === 0 ? "" : "border-l border-gray-1")}
          >
            <p className="m-0 flex items-center gap-1.5 truncate text-kpi-label text-text-muted">
              <span className="size-1.75 flex-none rounded-full" style={{ background: stageDot(s.tone) }} aria-hidden="true" />
              {s.label}
            </p>
            {/* [SOURCE] "a big mono figure (20px)" — its own size, not text-kpi's 32px (that
                scale is StatTile's, a different figure). Over cap: ink → --color-danger-ink and
                the cap rides along in the same figure, "14/10" — under/at cap it's the raw count. */}
            <p
              className="m-0 font-mono text-[20px] font-semibold leading-none tabular-nums"
              style={{ marginTop: "var(--kpi-gap, 12px)", ...(overCap ? { color: "var(--color-danger-ink)" } : null) }}
            >
              {overCap ? `${s.count}/${cap}` : s.count}
            </p>
            {/* The rail is PhotoCard's own stat-bar shape (bg-track groove, h-bar/rounded-bar) —
                reused rather than redrawn, same --color-track/--color-text-subtle pairing. */}
            <span className="mt-2.5 block h-bar w-full overflow-hidden rounded-bar bg-track">
              <span
                className="block h-full rounded-bar transition-[width] duration-move"
                style={{ width: `${pct}%`, background: overCap ? "var(--color-danger)" : "var(--color-text-subtle)" }}
              />
            </span>
          </div>
        );
      })}
    </Card>
  );
}
