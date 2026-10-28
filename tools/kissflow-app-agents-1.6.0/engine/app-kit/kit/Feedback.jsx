/**
 * EmptyState · NoAccess · Skeleton — the three surfaces for when there is nothing to show yet.
 *
 * REDESIGNED 2026-08-13 from Feedback.dc.html (Claude Design project "Mobile app style guide
 * sheet", 2b8a920b-a786-4430-bd63-b0bc0dbe6229) — see tokens.css's own banner for the wider
 * migration this belongs to (eleven design languages retired to one, Beacon, sourced from this
 * project page by page). [OURS] in the sense that no doc had declared these three before —
 * product-screen conditions, not a happy-path drawing — but every value below now reads a real
 * Foundations/Cards token rather than the retired `--tone-*` / `.text-foreground` layer this file
 * used to point at.
 *
 * The one real decision, unchanged from before and restated by Feedback.dc.html itself: an empty
 * state is NOT an error. Muted ink, no tone — tinting it turns "no rows yet" into "something is
 * wrong". NoAccess is the one exception, and even there the tone is quiet: a permission boundary
 * is a fact about the viewer, not a failure, so its chip stays neutral, never danger/warning.
 *
 * Token mapping (verbatim, no new tokens):
 *   empty icon     size-6 (24px) · --color-border      — "the one place icons go to 24px"; every
 *                  other icon in the kit is smaller (StatusChip's is size-3.5, for one)
 *   empty title    text-base font-semibold · --color-secondary   — "the card-title voice"
 *   empty message  --color-text-muted · max-w-sm (~36ch), centered
 *   restricted     <StatusChip tone="neutral"/> — reused, not hand-rolled; Chips.jsx already
 *                  carries the tone map (see its own file banner), so this stays in sync with
 *                  every other neutral chip in the kit for free instead of pointing at the
 *                  `--tone-neutral-*` custom properties Foundations dropped
 *   skeleton bar   --color-gray-1 fill · --radius-sm corners
 *   skeleton motion animate-pulse, 1.6s, opacity-only — NOT a travelling shimmer gradient, "which
 *                  would be a colour the palette does not have". Tailwind's own `animate-pulse`
 *                  keyframe is already opacity-only (50% { opacity: .5 }); only its default 2s
 *                  duration needs overriding, done inline rather than minting a token for one
 *                  number tokens.css doesn't own.
 *
 * bg-gray-1, not bg-track: Feedback.dc.html's own mapping names --color-gray-1 for the skeleton
 * fill. The old file read bg-track here on Nimbus-specific reasoning ("under Nimbus that is ink
 * at 12%, so it sits on glass") that no longer applies now that Nimbus is retired — see tokens.css's
 * banner — so this follows the new doc's literal token rather than carrying the old one forward.
 */
import { StatusChip } from "./Chips.jsx";

/** Generic empty state. `action` takes a <Button/>. */
export function EmptyState({ title = "Nothing here yet", message, action, icon, className = "" }) {
  return (
    <div className={"flex flex-col items-center gap-3 py-10 text-center " + className}>
      {icon && (
        <span className="flex-none text-border [&>svg]:size-6" aria-hidden="true">
          {icon}
        </span>
      )}
      <p className="m-0 font-display text-base font-semibold leading-tight text-secondary">{title}</p>
      {message && <p className="m-0 max-w-sm text-sm leading-relaxed text-text-muted">{message}</p>}
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}

/**
 * NoAccess — the permission boundary.
 *
 * Kept separate from EmptyState rather than made a tone of it, because they answer different
 * questions: "there is nothing to show" invites you to create something, "you may not see this"
 * does not. Merging them produces an empty state with a Create button the viewer cannot use — so
 * there is deliberately NO action slot here at all, not even an optional one.
 */
export function NoAccess({ what = "this data", message, className = "" }) {
  return (
    <div className={"flex flex-col items-center gap-3 py-10 text-center " + className}>
      <StatusChip tone="neutral">Restricted</StatusChip>
      <p className="m-0 font-display text-base font-semibold leading-tight text-secondary">
        No access to {what}.
      </p>
      <p className="m-0 max-w-sm text-sm leading-relaxed text-text-muted">
        {message ?? "Your role does not include this. Ask an administrator if you think that is wrong."}
      </p>
    </div>
  );
}

/**
 * Skeleton — a loading placeholder.
 *
 * `lines` draws a paragraph, the last line short (62% width) — a block of equal-length bars
 * reads as a table rather than as text. `circle` borrows the avatar's shape: `rounded-avatar`,
 * the same Tailwind utility Avatar.jsx itself reads (bridging --radius-avatar) rather than the
 * old `avatar-shape` bundling utility — Avatar.jsx moved off that in its own redesign (see its
 * file banner), so this follows suit for the same shape from the same source. A circle is square
 * by construction: `height`/`width` are treated as one interchangeable side so a caller passing
 * only one still gets a circle, never an oval; with neither, it defaults to size-10 (40px),
 * Avatar's own `md` — the common case of a skeleton avatar sitting beside skeleton text lines
 * (see the empty-state specimen).
 *
 * Callers keeping a real row's padding around a "skeleton in place" composition is what keeps
 * layout from jumping when real data lands — that discipline lives at the call site, not here.
 */
export function Skeleton({ lines = 1, height, width, circle = false, className = "" }) {
  if (lines > 1) {
    return (
      <div className={"flex flex-col gap-2 " + className} aria-hidden="true">
        {Array.from({ length: lines }).map((_, i) => (
          <span
            key={i}
            className="h-3 animate-pulse rounded-sm bg-gray-1"
            style={{ width: i === lines - 1 ? "62%" : "100%", animationDuration: "1.6s" }}
          />
        ))}
      </div>
    );
  }
  const side = height ?? width;
  return (
    <span
      className={
        "block animate-pulse bg-gray-1 " +
        (circle ? "rounded-avatar " + (side == null ? "size-10 " : "") : "h-3 rounded-sm ") +
        className
      }
      style={{
        height: circle ? side : height,
        width: circle ? side : width,
        animationDuration: "1.6s",
      }}
      aria-hidden="true"
    />
  );
}
