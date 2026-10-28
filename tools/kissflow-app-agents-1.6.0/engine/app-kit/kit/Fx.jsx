/**
 * CountUp · toast · Toaster · FilterBar · CustomEmbed · StoresMap — the remainder.
 *
 * The last of the legacy exports, ported so nothing is left behind. None of them is declared by
 * any design language — they are product behaviour, not surface — so all are [OURS], composed
 * from tokens each language already has.
 *
 * `Toaster` is the one that matters structurally: it is the LAST thing pulling kf-ui.css into
 * every page, because app-shell.jsx imports it from ../legacy. Swapping that import to this file
 * is what finally unloads the legacy stylesheet from the app.
 */

import { useEffect, useRef, useState } from "react";

import { Button } from "./Buttons.jsx";
import { StatusChip } from "./Chips.jsx";
import { FIELD } from "./Fields.jsx";

/* ── CountUp ───────────────────────────────────────────────────────────────────────────────── */

/**
 * A figure that animates to its value.
 *
 * Reads the language's own move duration rather than a fixed 750ms, so a number settles at the
 * same speed a bar grows — 220ms under Beacon and Checkpoint, 180ms under Nimbus. Respects
 * prefers-reduced-motion by jumping straight to the value: an animated figure is decoration, and
 * decoration is the first thing that setting is asking you to drop.
 */
export function CountUp({ value, duration, className = "" }) {
  const target = Number(value) || 0;
  const [n, setN] = useState(target);
  const from = useRef(target);

  useEffect(() => {
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const ms = duration ?? (parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--motion-duration-move")) || 220);
    if (reduced || !ms) { setN(target); from.current = target; return; }

    const start = performance.now();
    const a = from.current;
    let raf;
    const tick = (t) => {
      const p = Math.min(1, (t - start) / (ms * 3));
      // ease-out: fast then settling, which is what a counter should feel like
      setN(Math.round(a + (target - a) * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
      else from.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);

  return <span className={"font-mono tabular-nums " + className}>{n.toLocaleString()}</span>;
}

/* ── Toaster ───────────────────────────────────────────────────────────────────────────────────
 * A module-level queue plus a component that renders it. Same shape as the legacy one, so
 * `toast("Saved")` from anywhere still works with no context provider — which is the whole
 * reason it was built that way and why changing it would break every existing caller. */

let queue = [];
let notify = null;
let seq = 0;

/** toast(message, tone) — tone is a StatusChip tone name, so a toast and a status chip agree. */
export function toast(message, tone = "success", ms = 4000) {
  const item = { id: ++seq, message, tone };
  queue = [...queue, item];
  notify?.(queue);
  setTimeout(() => {
    queue = queue.filter((t) => t.id !== item.id);
    notify?.(queue);
  }, ms);
}

export function Toaster() {
  const [items, setItems] = useState(queue);
  useEffect(() => {
    notify = setItems;
    return () => { notify = null; };
  }, []);
  if (!items.length) return null;
  return (
    <div
      className="pointer-events-none fixed bottom-6 left-1/2 z-[60] flex -translate-x-1/2 flex-col items-center gap-2"
      role="status"
      aria-live="polite"
    >
      {items.map((t) => (
        <div
          key={t.id}
          className="border-decor border-edge shadow-overlay card-pad-metric pointer-events-auto flex items-center gap-2.5 rounded-lg bg-card text-sm text-card-foreground"
        >
          <StatusChip tone={t.tone}>{t.tone}</StatusChip>
          {t.message}
        </div>
      ))}
    </div>
  );
}

/* ── SearchBar ─────────────────────────────────────────────────────────────────────────────── */

/**
 * SearchBar — a search box, zero or more dropdown narrowers, and a result count.
 *
 * NOT the same thing as FilterBar, though both sit at the top of a list. FilterBar is a CLOSED
 * set: four pills, one active, and the whole vocabulary is visible at once. SearchBar is OPEN —
 * free text against an unknown corpus, plus dropdowns whose options come from the data. Merging
 * them would mean one component whose shape depends on a prop, and the two are read differently
 * enough (a pill row is scanned, a search box is typed into) that the shapes should stay apart.
 *
 * The input wears kit/Fields.jsx's exported FIELD string verbatim, so a search box and a form
 * input are the same height, radius, fill and focus ring in every language. The icon rides as a
 * positioned sibling with pl-9 clearing it — NOT as a background image, which is the trick Select
 * uses and the one thing about Select that does not follow the language (a data URI cannot read
 * the host cascade, so its chevron is frozen at Beacon's ink). A real element inherits
 * currentColor and moves with the theme.
 */
export function SearchBar({
  value,
  onChange,
  placeholder = "Search…",
  selects = [],
  count,
  className = "",
}) {
  const [local, setLocal] = useState("");
  const current = value ?? local;
  return (
    <div className={"flex flex-wrap items-center gap-2.5 " + className}>
      <div className="relative min-w-[14rem] flex-1">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true">
          <svg width="14" height="14" viewBox="0 0 14 14">
            <circle cx="6" cy="6" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
            <path d="M9.5 9.5 13 13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </span>
        <input
          type="search"
          value={current}
          placeholder={placeholder}
          aria-label={placeholder}
          onChange={(e) => { setLocal(e.target.value); onChange?.(e.target.value); }}
          className={FIELD + " pl-9"}
        />
      </div>
      {selects.map((s, i) => (
        <select
          key={s.name ?? i}
          aria-label={s.label ?? s.name}
          value={s.value}
          onChange={(e) => s.onChange?.(e.target.value)}
          // FIELD bakes in w-full for the common case (a form field owns its whole row); a
          // narrower composed inline in SearchBar needs to size to its own content instead, and
          // `w-full`/`w-auto` are the same Tailwind layer at equal specificity — appending
          // `w-auto` after `w-full` has no reliable winner (the exact failure FIELD's own file
          // banner names for height). Strip it rather than fight the cascade.
          className={FIELD.replace("w-full ", "") + " w-auto flex-none cursor-pointer"}
        >
          {(s.options ?? []).map((o) => {
            const opt = typeof o === "string" ? { value: o, label: o } : o;
            return <option key={opt.value} value={opt.value}>{opt.label}</option>;
          })}
        </select>
      ))}
      {count != null && (
        <span className="ml-auto flex-none whitespace-nowrap font-mono text-data tabular-nums text-muted-foreground">
          {count}
        </span>
      )}
    </div>
  );
}

/* ── FilterBar ─────────────────────────────────────────────────────────────────────────────── */

/**
 * A row of mutually-exclusive filters. Structurally TabStrip's job, and it delegates to the same
 * geometry so a filter row and a tab row are the same height in every language — but kept under
 * its own name because the generator and existing pages call it FilterBar, and because a filter
 * is semantically a control rather than navigation (no `role="tab"`).
 */
export function FilterBar({ filters = [], value, onChange, className = "" }) {
  const opts = filters.map((f) => (typeof f === "string" ? { value: f, label: f } : f));
  const [local, setLocal] = useState(opts[0]?.value);
  const current = value ?? local;
  const pick = (v) => { setLocal(v); onChange?.(v); };

  if (!opts.length) return null;
  return (
    <div className={"flex flex-wrap items-center gap-1.5 " + className}>
      {opts.map((o) => {
        const on = o.value === current;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            onClick={() => pick(o.value)}
            className={
              "tab-shape inline-flex cursor-pointer items-center gap-2 whitespace-nowrap border-0 font-sans leading-none " +
              "transition-colors outline-none focus-visible:ring focus-visible:ring-ring " +
              (on
                ? "bg-strong font-bold text-strong-foreground hover:bg-strong-hover"
                : "bg-transparent font-medium text-muted-foreground hover:bg-muted hover:text-foreground")
            }
          >
            {o.label}
            {o.count != null && (
              <span className={"font-mono text-data tabular-nums " + (on ? "opacity-80" : "text-meta-foreground")}>{o.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/* ── Embeds ────────────────────────────────────────────────────────────────────────────────────
 * Integration wrappers, not design components — there is nothing for a design language to say
 * about an iframe. Ported anyway so the legacy folder has no exports without a kit/ home, and
 * given the surrounding chrome (a card, a title, a sandbox) that the language DOES own. */

/** An external page in an iframe. `sandbox` is on by default and narrow on purpose: an embed
 *  that can script the parent is a hole in the app, and a caller who genuinely needs more should
 *  have to say so. */
export function CustomEmbed({ src, title = "Embedded content", height = 420, sandbox = "allow-scripts allow-same-origin allow-forms", className = "" }) {
  if (!src) return null;
  return (
    <iframe
      src={src}
      title={title}
      sandbox={sandbox}
      style={{ height }}
      className={"border-decor border-edge w-full rounded-lg bg-card " + className}
    />
  );
}

/**
 * StoresMap — locations on a map.
 *
 * The legacy one embedded a map provider. This renders the list and links out rather than
 * embedding, because an embedded third-party map is the one component here that cannot follow
 * the design language at all — it paints its own tiles, its own controls and its own typography
 * inside an iframe we do not style. A list that themes correctly is more honest than a map that
 * never will; `onSelect` is where a caller wires a real map if they want one.
 */
export function StoresMap({ locations = [], onSelect, className = "" }) {
  if (!locations.length) {
    return <p className="m-0 py-6 text-center text-sm text-muted-foreground">No locations.</p>;
  }
  return (
    <ul className={"m-0 flex list-none flex-col p-0 " + className}>
      {locations.map((l, i) => (
        <li key={l.id ?? i} className="row-shape flex items-center justify-between gap-4 border-b border-row-divider last:border-0">
          <span className="min-w-0">
            <span className="block truncate text-sm text-foreground">{l.name ?? l.label}</span>
            {l.address && <span className="block truncate text-xs text-meta-foreground">{l.address}</span>}
          </span>
          {onSelect && <Button rank="outline" onClick={() => onSelect(l)}>Open</Button>}
        </li>
      ))}
    </ul>
  );
}
