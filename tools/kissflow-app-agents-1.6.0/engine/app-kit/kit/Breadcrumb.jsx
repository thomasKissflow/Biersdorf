import { ChevronRight, House } from "lucide-react";

/**
 * Breadcrumb — an ancestor trail.
 *
 * REDESIGNED 2026-08-13 from Breadcrumb.dc.html (Claude Design project "Mobile app style guide
 * sheet", 2b8a920b-a786-4430-bd63-b0bc0dbe6229). The old banner here explained that none of the
 * three retired languages (Beacon v2.1, Checkpoint, Nimbus) named a breadcrumb at all, so every
 * decision in the previous version was [OURS]. That is no longer true — Breadcrumb.dc.html is
 * its own page now, with an explicit token-mapping table, transcribed below as [SOURCE]:
 *
 *   Ancestor link    --color-text-muted, text-xs, no underline, hover -> --color-secondary
 *   Current page     --color-secondary, font-semibold, aria-current="page", NOT a link
 *   Separator        --color-border, size-3.5, chevron-right (was a hand-drawn 5x9 SVG wedge)
 *   Ellipsis (NEW)   --color-border — "same weight as the separator, since it is one"
 *   Trail gap        gap-1.5
 *   Link focus       --color-ring, ring-2, --radius-sm — "since the target is text"
 *
 * "The leaf is inert" survives the migration unchanged: the doc's own page identity is a plain
 * heading, so an unclickable current-page item still matches it, and it is the accessible
 * behaviour regardless of what the doc says.
 *
 * The separator is now a real Lucide icon rather than a drawn SVG wedge — Breadcrumb.dc.html's
 * own reasoning: "a text character shifts its weight and baseline with the font, where an icon
 * sits identically at any size." A hand-drawn path has the same font-independence an SVG icon
 * does, so this is a consolidation (one fewer bespoke path in the kit), not a fix.
 *
 * `maxItems` and `homeIcon` are NEW, both [SOURCE] from the doc's own API table.
 *
 * `maxItems` collapses the MIDDLE, not a truncation from one end — "keep the first item + the
 * last two, those are the ones people actually click." The threshold only decides WHETHER to
 * collapse; the collapsed shape is always first + ellipsis + last two, regardless of the number
 * past the prop. Collapsing only fires when there is an actual middle to hide (more than 3
 * items) — with 3 or fewer, first + last two is already the whole trail, and drawing an ellipsis
 * that hides nothing would be worse than not collapsing.
 *
 * `homeIcon` draws beside the FIRST item's label specifically — not "whichever item happens to
 * render first," which after a collapse is still index 0, so the two features compose without
 * extra bookkeeping.
 */

// The label, optionally with the home icon — shared across all three ink states below so the
// icon isn't duplicated per branch.
function crumbLabel(label, showHomeIcon) {
  if (!showHomeIcon) return label;
  return (
    <span className="inline-flex items-center gap-1">
      <House className="size-3.5 flex-none" aria-hidden="true" />
      {label}
    </span>
  );
}

function Crumb({ item, isCurrent, isFirst, homeIcon }) {
  const label = typeof item === "string" ? item : item.label;
  const href = typeof item === "string" ? undefined : item.href;
  const content = crumbLabel(label, isFirst && homeIcon);

  // The leaf is deliberately inert regardless of whether it carries an href — see file banner.
  if (isCurrent) {
    return (
      <span aria-current="page" className="text-xs font-semibold text-secondary">
        {content}
      </span>
    );
  }
  if (href) {
    return (
      <a
        href={href}
        className="rounded-sm text-xs text-text-muted no-underline transition-colors hover:text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {content}
      </a>
    );
  }
  return <span className="text-xs text-text-muted">{content}</span>;
}

export function Breadcrumb({ items = [], maxItems, homeIcon = false, className = "" }) {
  if (!items.length) return null;

  // Collapse only when there's a real middle to hide — see file banner.
  const collapse = maxItems && items.length > maxItems && items.length > 3;
  const trail = collapse
    ? [
        { idx: 0 },
        { ellipsis: true },
        { idx: items.length - 2 },
        { idx: items.length - 1 },
      ]
    : items.map((_, idx) => ({ idx }));

  return (
    <nav aria-label="Breadcrumb" className={className}>
      <ol className="m-0 flex list-none flex-wrap items-center gap-1.5 p-0">
        {trail.map((entry, i) => (
          <li key={entry.ellipsis ? "ellipsis" : entry.idx} className="flex items-center gap-1.5">
            {i > 0 && <ChevronRight className="size-3.5 flex-none text-border" aria-hidden="true" />}
            {entry.ellipsis ? (
              <span className="text-xs text-border">…</span>
            ) : (
              <Crumb
                item={items[entry.idx]}
                isCurrent={entry.idx === items.length - 1}
                isFirst={entry.idx === 0}
                homeIcon={homeIcon}
              />
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
