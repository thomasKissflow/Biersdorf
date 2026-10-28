/**
 * Modal · Sheet — the two surfaces that block the page behind them.
 *
 * REDESIGNED 2026-08-13 from Overlay.dc.html (Claude Design project "Mobile app style guide
 * sheet", 2b8a920b-a786-4430-bd63-b0bc0dbe6229). Its own opening line: "the two surfaces that
 * block the page behind them. Both trap focus, lock scroll, and hand focus back on close." Token
 * mapping, transcribed as [SOURCE] below:
 *
 *   Scrim             --color-scrim, click to dismiss                (already wired — `bg-scrim`)
 *   Panel fill/radius --color-surface · --radius-lg (12px)            (the mapping table's own row,
 *                                                                       taken literally over a "16px"
 *                                                                       aside elsewhere in the prose —
 *                                                                       and NOT --radius-xl, which is
 *                                                                       Cards.jsx's own 16px panel
 *                                                                       radius, a different page's call)
 *   Panel shadow/pad  --shadow-overlay · p-7, no border on Modal       (Sheet takes one — see below)
 *   Panel width       34rem (Modal) / 26rem (Sheet), both capped 100%
 *   Title             text-lg font-semibold — "one step above a card title" (CardTitle is 15px)
 *   Footer rule       --color-gray-2 — "the functional divider, not the inner gray-1"
 *   Close button      32px square · --color-gray-1 hover bg · --color-secondary hover ink —
 *                     "a quiet icon button"
 *
 * SHEET'S TWO DIFFERENCES FROM MODAL, both [SOURCE]: it slides from an edge instead of centring,
 * and — the page's own callout — "a sheet keeps square corners against its edge": only the two
 * corners on the side facing the PAGE round at --radius-lg (`rounded-l-lg` for a right sheet,
 * `rounded-r-lg` for a left one); the two against the viewport edge stay square, because rounding
 * them would cut a notch out of the screen's own corner. And unlike Modal, a Sheet takes a border
 * on that same inner edge — --color-gray-2, the footer rule's own weight — because without
 * Modal's scrim-framed centring, the page-facing edge is the only thing separating the panel from
 * the content beside it.
 *
 * DESTRUCTIVE CONFIRM, shown in the spec's live Modal demo: the destructive action fills solid
 * --color-danger — "the one place a tone appears at full strength on a button, because the tint
 * would read as a status rather than an action." That is Buttons.jsx's own `tone="danger"` (see
 * its file banner — same phrase, off the same page), not anything this file renders; a confirm
 * dialog reaches for it in its footer, dismiss to the LEFT of it like any other footer here.
 *
 * ACCESSIBILITY, unchanged by this pass — carried forward from the previous banner rather than
 * restated as new. This traps focus, locks body scroll, and restores focus to whatever opened it.
 * It was shipped without those and that was wrong — a dialog that announces `aria-modal` while
 * letting Tab walk into the page behind it is worse than one that makes no claim, because a
 * screen-reader user is told the background is inert when it is not.
 *
 * Still NOT done, and stated rather than implied: neither Modal nor Sheet portals to `document.
 * body`, so an overlay rendered inside a `transform`ed or `overflow:hidden` ancestor will be
 * clipped by it; and neither marks the background `inert`, so assistive tech that ignores
 * aria-modal can still reach the page behind. Both want a portal, which is a bigger architecture
 * change than a restyle should make on its own — reach for a dialog primitive on a screen where
 * either matters.
 */

import { useEffect, useRef } from "react";

const FOCUSABLE =
  'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

// The close control both Modal and Sheet share — 32px square, "a quiet icon button": transparent
// until hovered, then --color-gray-1 under it and --color-secondary ink, per Overlay.dc.html.
function CloseButton({ onClose }) {
  return (
    <button
      type="button"
      onClick={onClose}
      aria-label="Close"
      className="grid h-8 w-8 flex-none place-items-center rounded-sm border-0 bg-transparent leading-none text-text-muted transition-colors hover:bg-gray-1 hover:text-secondary focus-visible:outline-none focus-visible:ring focus-visible:ring-ring"
    >
      <svg width="12" height="12" viewBox="0 0 11 11" aria-hidden="true">
        <path d="M1 1l9 9M10 1l-9 9" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    </button>
  );
}

export function Modal({ open, onClose, title, footer, width = "34rem", className = "", children }) {
  const panel = useRef(null);
  const returnTo = useRef(null);

  useEffect(() => {
    if (!open) return;

    // Remember what had focus so it can be handed back — losing your place in the page on close
    // is the single most disorienting thing a dialog can do to a keyboard user.
    returnTo.current = document.activeElement;

    // Scroll lock. Padding compensates for the scrollbar's width so the page behind does not
    // jump sideways as it disappears.
    const { overflow, paddingRight } = document.body.style;
    const gap = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = "hidden";
    if (gap > 0) document.body.style.paddingRight = `${gap}px`;

    // Move focus INTO the dialog. The panel itself is the fallback target, which is why it
    // carries tabIndex={-1} — focusing the first control instead would skip the title on a
    // screen reader.
    const first = panel.current?.querySelector(FOCUSABLE);
    (first ?? panel.current)?.focus?.();

    const onKey = (e) => {
      if (e.key === "Escape") return onClose?.();
      if (e.key !== "Tab" || !panel.current) return;
      const items = [...panel.current.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null);
      if (!items.length) return e.preventDefault();
      const [head, tail] = [items[0], items[items.length - 1]];
      // Wrap at both ends. Without the shift-Tab branch, focus escapes backwards out of the
      // dialog on the first keypress, which is the half-implemented trap that is worse than none.
      if (!e.shiftKey && document.activeElement === tail) { e.preventDefault(); head.focus(); }
      else if (e.shiftKey && (document.activeElement === head || document.activeElement === panel.current)) {
        e.preventDefault(); tail.focus();
      }
    };

    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      document.body.style.paddingRight = paddingRight;
      returnTo.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
      {/* The scrim — --color-scrim, dims the page behind, click to dismiss. */}
      <div className="absolute inset-0 bg-scrim" onClick={onClose} aria-hidden="true" />
      <div
        ref={panel}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === "string" ? title : undefined}
        style={{ width, maxWidth: "100%" }}
        className={
          // outline-none because the panel is a PROGRAMMATIC focus target (tabIndex -1), not a
          // keyboard-reachable one — without it the browser draws its own ring around the whole
          // dialog the moment it opens. No border — Overlay.dc.html, verbatim: "no border on a
          // modal; a sheet takes one on its inner edge."
          "rounded-lg shadow-overlay p-7 relative max-h-full overflow-auto outline-none bg-surface text-secondary " +
          className
        }
      >
        {title && (
          <div className="mb-4 flex items-start justify-between gap-4">
            <h2 className="m-0 font-display text-lg font-semibold leading-tight tracking-tight">{title}</h2>
            {onClose && <CloseButton onClose={onClose} />}
          </div>
        )}
        <div className="text-sm leading-relaxed">{children}</div>
        {footer && (
          // The functional rule — --color-gray-2, not the inner --color-gray-1.
          <div className="mt-6 flex flex-wrap items-center justify-end gap-2.5 border-t border-gray-2 pt-4">{footer}</div>
        )}
      </div>
    </div>
  );
}

/**
 * Sheet — a panel that slides in from a screen edge, for a task that wants more room than
 * `Modal`'s centred width but should still block the page behind it. [OURS] entirely — none of
 * the three languages this app used to carry ever named a drawer, and Overlay.dc.html doesn't
 * give it a distinct component either, only the "slides from an edge" callout under Modal's own
 * spec (see file banner).
 *
 * Same accessibility contract as `Modal` above — focus trap, scroll lock, focus return —
 * duplicated rather than factored into a shared hook. The two differ in exactly one place (how
 * the panel enters: centred and static vs. an edge and a slide), and kit's other file-local
 * patterns make the same call for a two-caller duplication (`Fields.jsx`'s `Field` wrapper is
 * private to that file rather than shared) — one extra layer of indirection for two call sites
 * costs more to read than it saves to write.
 *
 * The scrim reads the same `bg-scrim` Modal's does.
 */
export function Sheet({ open, onClose, title, footer, side = "right", width = "26rem", className = "", children }) {
  const panel = useRef(null);
  const returnTo = useRef(null);

  useEffect(() => {
    if (!open) return;
    returnTo.current = document.activeElement;
    const { overflow, paddingRight } = document.body.style;
    const gap = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = "hidden";
    if (gap > 0) document.body.style.paddingRight = `${gap}px`;

    const first = panel.current?.querySelector(FOCUSABLE);
    (first ?? panel.current)?.focus?.();

    const onKey = (e) => {
      if (e.key === "Escape") return onClose?.();
      if (e.key !== "Tab" || !panel.current) return;
      const items = [...panel.current.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null);
      if (!items.length) return e.preventDefault();
      const [head, tail] = [items[0], items[items.length - 1]];
      if (!e.shiftKey && document.activeElement === tail) { e.preventDefault(); head.focus(); }
      else if (e.shiftKey && (document.activeElement === head || document.activeElement === panel.current)) {
        e.preventDefault(); tail.focus();
      }
    };

    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      document.body.style.paddingRight = paddingRight;
      returnTo.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  const edge = side === "left" ? "left-0" : "right-0";
  // The inner edge — the one facing the page content, not the viewport — is the only one that
  // takes a border AND the only side allowed to round. See file banner.
  const innerBorder = side === "left" ? "border-r" : "border-l";
  const innerRadius = side === "left" ? "rounded-r-lg" : "rounded-l-lg";

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-scrim" onClick={onClose} aria-hidden="true" />
      <div
        ref={panel}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === "string" ? title : undefined}
        style={{ width, maxWidth: "100%" }}
        className={
          `absolute inset-y-0 ${edge} ${innerRadius} ${innerBorder} border-gray-2 shadow-overlay flex flex-col overflow-auto outline-none bg-surface text-secondary p-7 ` +
          className
        }
      >
        {title && (
          <div className="mb-4 flex items-start justify-between gap-4">
            <h2 className="m-0 font-display text-lg font-semibold leading-tight tracking-tight">{title}</h2>
            {onClose && <CloseButton onClose={onClose} />}
          </div>
        )}
        <div className="flex-1 text-sm leading-relaxed">{children}</div>
        {footer && (
          <div className="mt-6 flex flex-wrap items-center justify-end gap-2.5 border-t border-gray-2 pt-4">{footer}</div>
        )}
      </div>
    </div>
  );
}
