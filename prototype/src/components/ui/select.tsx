// Custom dropdown (select-only combobox + listbox). Replaces the native <select>, whose open list is drawn by
// the OS and whose arrow cannot be positioned. Drop-in compatible: same props as before (value, onChange with
// e.target.value, disabled, className, aria-label, invalid, placeholder) and the same <option>/<optgroup>
// children, so no call site changes.
//
// - The arrow is part of the trigger, so it stays centred even when a grid or flex row stretches the wrapper.
// - The list renders in a portal (never clipped by tables, cards, modals or drawers). It is at least as wide as
//   the trigger, grows to fit long options (up to LIST_MAX_W), lines up with the trigger's left edge (or its
//   right edge when there is no room on the right), and opens upwards only when it fits better there.
// - It follows the trigger when the page scrolls and closes once the trigger scrolls out of view.
// - Keyboard like a native select: ↑/↓, Home/End, Enter/Space, Escape (closes only the list, never the modal
//   or drawer around it), Tab and type-to-jump. A resting mouse pointer never overrides the keyboard.
// - Screen readers hear the name (aria-label, aria-labelledby, a wrapping <label> or the enclosing Field's
//   label) and the current value, like a native select.

import { Check, ChevronDown } from "lucide-react";
import {
  Children,
  Fragment,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type SelectHTMLAttributes,
} from "react";
import { createPortal } from "react-dom";
import { useFieldLabel } from "./form";
import { cx } from "./primitives";

interface Opt {
  value: string;
  label: ReactNode;
  text: string;
  disabled?: boolean;
  group?: string;
}

function textOf(n: ReactNode): string {
  if (n === null || n === undefined || typeof n === "boolean") return "";
  if (typeof n === "string" || typeof n === "number") return String(n);
  if (Array.isArray(n)) return n.map(textOf).join("");
  if (isValidElement(n)) return textOf((n.props as { children?: ReactNode }).children);
  return "";
}

/** Reads <option> / <optgroup> / fragments / mapped arrays into a flat option list. */
function parseOptions(children: ReactNode, group?: string, out: Opt[] = []): Opt[] {
  Children.forEach(children, (ch) => {
    if (!isValidElement(ch)) return;
    const p = ch.props as { value?: unknown; children?: ReactNode; disabled?: boolean; label?: string };
    if (ch.type === Fragment) parseOptions(p.children, group, out);
    else if (ch.type === "optgroup") parseOptions(p.children, p.label, out);
    else if (ch.type === "option") {
      const text = textOf(p.children);
      out.push({ value: p.value === undefined ? text : String(p.value), label: p.children, text, disabled: p.disabled, group });
    }
  });
  return out;
}

export type SelectProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, "onChange"> & {
  /** On the trigger; each option gets `<data-testid>-option-<value>`. */
  "data-testid"?: string;
  invalid?: boolean;
  placeholder?: string;
  onChange?: (e: ChangeEvent<HTMLSelectElement>) => void;
};

interface Placement {
  left: number;
  width: number;
  maxHeight: number;
  top?: number;
  bottom?: number;
}

const GAP = 6; // between trigger and list
const MARGIN = 8; // between list and screen edge
const LIST_MAX_W = 420; // a list grows past its trigger's width to fit long options, up to this
const LIST_MAX_H = 320;

const samePlace = (a: Placement | null, b: Placement) =>
  !!a && a.left === b.left && a.width === b.width && a.maxHeight === b.maxHeight && a.top === b.top && a.bottom === b.bottom;

/** Is (the middle of) the trigger still visible inside every scrolling/clipping box around it and the viewport? */
function inView(el: HTMLElement): boolean {
  const r = el.getBoundingClientRect();
  let top = 0;
  let bottom = window.innerHeight;
  let left = 0;
  let right = window.innerWidth;
  for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
    const s = getComputedStyle(p);
    if (s.overflowX !== "visible" || s.overflowY !== "visible") {
      const c = p.getBoundingClientRect();
      top = Math.max(top, c.top);
      bottom = Math.min(bottom, c.bottom);
      left = Math.max(left, c.left);
      right = Math.min(right, c.right);
    }
  }
  const cy = (r.top + r.bottom) / 2;
  return cy > top && cy < bottom && r.right > left + 8 && r.left < right - 8;
}

export function Select({ className, children, invalid, value, defaultValue, onChange, disabled, id, name, placeholder, title, "aria-label": ariaLabel, "aria-labelledby": ariaLabelledBy, "data-testid": testId }: SelectProps) {
  const options = useMemo(() => parseOptions(children), [children]);
  const [inner, setInner] = useState(() => String(defaultValue ?? options[0]?.value ?? ""));
  const current = value !== undefined && value !== null ? String(value) : inner;
  const selectedIndex = options.findIndex((o) => o.value === current);
  const selected = selectedIndex >= 0 ? options[selectedIndex] : undefined;
  // An empty-value option worded like "Select a supplier…" is a prompt, not a choice: show it muted.
  const isPrompt = (o?: Opt) => !!o && o.value === "" && /^(select|choose|pick)\b/i.test(o.text.trim());
  const enabled = useMemo(() => options.map((o, i) => (o.disabled ? -1 : i)).filter((i) => i >= 0), [options]);
  // Name: own aria-label / aria-labelledby first, else the enclosing Field's label. A wrapping <label> also
  // names the trigger natively (it is a labelable <button>).
  const field = useFieldLabel();
  const labelledBy = ariaLabelledBy ?? (ariaLabel ? undefined : field?.labelId);

  const [open, setOpen] = useState(false);
  const [active, setActiveState] = useState(-1);
  const [place, setPlace] = useState<Placement | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  // follow: scroll the active option into view (keyboard moves); centre: show the selected option in the
  // middle of the list on open, until the user moves.
  const scrollMode = useRef<"none" | "follow" | "centre">("none");
  const fromLabel = useRef(false);
  const uid = useId();
  const listId = `${uid}-listbox`;
  const optId = (i: number) => `${uid}-opt-${i}`;

  const setActive = (i: number, how: "follow" | "centre" | "none" = "follow") => {
    scrollMode.current = how;
    setActiveState(i);
  };

  const position = useCallback(() => {
    const b = btn.current;
    if (!b) return;
    const r = b.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    const vh = window.innerHeight;
    const el = list.current;
    // Width: at least the trigger; wider when an option needs it (up to LIST_MAX_W); never wider than the screen.
    let content = r.width;
    if (el) {
      const prev = el.style.width;
      el.style.width = "max-content";
      content = Math.ceil(el.getBoundingClientRect().width) + 1; // round up: a fraction short wraps the longest option
      el.style.width = prev;
    }
    // A list only a few pixels wider than its trigger looks misaligned: keep the trigger's width then (the
    // longest option wraps instead).
    if (content - r.width < 24) content = r.width;
    const width = Math.min(Math.floor(vw - MARGIN * 2), Math.max(r.width, Math.min(content, LIST_MAX_W)));
    // Left edge on the trigger's left edge; if that runs off the right of the screen, right edges line up instead.
    let left = r.left;
    if (left + width > vw - MARGIN) left = r.right - width;
    left = Math.round(Math.max(MARGIN, Math.min(left, vw - MARGIN - width)));
    // Height of the whole list at that width (estimated before the first render).
    let natural: number;
    if (el) {
      const prev = el.style.width;
      el.style.width = `${width}px`;
      natural = el.scrollHeight + 2;
      el.style.width = prev;
    } else {
      const groups = new Set(options.map((o) => o.group).filter(Boolean)).size;
      natural = options.length * 38 + groups * 30 + 10;
    }
    natural = Math.min(LIST_MAX_H, natural);
    const below = vh - r.bottom - GAP - MARGIN;
    const above = r.top - GAP - MARGIN;
    // Downwards when it fits; upwards when it fits there instead; otherwise wherever there is more room.
    const up = natural > below && (natural <= above || above > below);
    const maxHeight = Math.round(Math.max(120, Math.min(LIST_MAX_H, up ? above : below)));
    const next: Placement = up ? { left, width, maxHeight, bottom: Math.round(vh - r.top + GAP) } : { left, width, maxHeight, top: Math.round(r.bottom + GAP) };
    setPlace((p) => (samePlace(p, next) ? p : next));
  }, [options]);

  // Place on open, then once more after the list has rendered and can be measured (both before paint).
  const mounted = open && place !== null;
  useLayoutEffect(() => {
    if (open) position();
  }, [open, mounted, position]);

  useEffect(() => {
    if (!open) return;
    const onScroll = (e: Event) => {
      if (list.current && e.target instanceof Node && list.current.contains(e.target)) return;
      // Follow the trigger while it is visible; close once it has scrolled out of its container or the screen,
      // so the list never floats over unrelated content.
      if (btn.current && !inView(btn.current)) setOpen(false);
      else position();
    };
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (btn.current?.contains(t) || list.current?.contains(t)) return;
      setOpen(false);
    };
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", position);
    window.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", position);
      window.removeEventListener("mousedown", onDown);
    };
  }, [open, position]);

  // Clicking a wrapping <label> only focuses the trigger, like a native select (the browser forwards the click
  // to the button; without this it would toggle the list).
  useEffect(() => {
    const b = btn.current;
    if (!b?.labels?.length) return;
    const labels = [...b.labels];
    const mark = (e: MouseEvent) => {
      if (b.contains(e.target as Node)) return;
      fromLabel.current = true;
      setTimeout(() => (fromLabel.current = false), 0);
    };
    labels.forEach((l) => l.addEventListener("click", mark));
    return () => labels.forEach((l) => l.removeEventListener("click", mark));
  }, []);

  // Keep the active option (and its group header) visible. Scrolls the list itself, never the page.
  useLayoutEffect(() => {
    const ul = list.current;
    if (!open || active < 0 || !ul || scrollMode.current === "none") return;
    const el = ul.querySelector<HTMLElement>(`[data-index="${active}"]`);
    if (!el) return;
    if (scrollMode.current === "centre") {
      ul.scrollTop = el.offsetTop - (ul.clientHeight - el.offsetHeight) / 2;
      return;
    }
    const head = el.previousElementSibling as HTMLElement | null;
    const top = (head?.getAttribute("role") === "presentation" ? head.offsetTop : el.offsetTop) - 4;
    const bottom = el.offsetTop + el.offsetHeight + 4;
    if (top < ul.scrollTop) ul.scrollTop = top;
    else if (bottom > ul.scrollTop + ul.clientHeight) ul.scrollTop = bottom - ul.clientHeight;
  }, [open, active, place]);

  const openList = (dir: 1 | -1 = 1) => {
    if (disabled) return;
    const start = selectedIndex >= 0 && !options[selectedIndex].disabled ? selectedIndex : dir === -1 ? (enabled.at(-1) ?? -1) : (enabled[0] ?? -1);
    setActive(start, "centre");
    setOpen(true);
  };

  const close = (focus = true) => {
    setOpen(false);
    if (focus) btn.current?.focus();
  };

  const choose = (i: number) => {
    const o = options[i];
    if (!o || o.disabled) return;
    if (value === undefined) setInner(o.value);
    if (o.value !== current) {
      const target = { value: o.value, name };
      onChange?.({ target, currentTarget: target } as unknown as ChangeEvent<HTMLSelectElement>);
    }
    close();
  };

  const move = (d: 1 | -1) => {
    if (!enabled.length) return;
    const at = enabled.indexOf(active);
    setActive(at < 0 ? (d === 1 ? enabled[0] : enabled.at(-1)!) : enabled[Math.min(enabled.length - 1, Math.max(0, at + d))]);
  };

  // Type-to-jump, like a native select: repeated letters cycle, a quick word matches a prefix.
  const typed = useRef({ buf: "", at: 0 });
  const findTyped = (ch: string): number | undefined => {
    const now = Date.now();
    const buf = now - typed.current.at > 700 ? ch : typed.current.buf + ch;
    typed.current = { buf, at: now };
    const from = active >= 0 ? active : Math.max(0, selectedIndex);
    const step = buf.length === 1 ? 1 : 0;
    for (let k = 0; k < options.length; k++) {
      const i = (from + step + k) % options.length;
      if (!options[i].disabled && options[i].text.trim().toLowerCase().startsWith(buf.toLowerCase())) return i;
    }
    return undefined;
  };

  const onKeyDown = (e: ReactKeyboardEvent<HTMLButtonElement>) => {
    const printable = e.key.length === 1 && e.key !== " " && !e.metaKey && !e.ctrlKey && !e.altKey;
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openList(e.key === "ArrowUp" ? -1 : 1);
      } else if (printable) {
        const hit = findTyped(e.key);
        if (hit !== undefined) choose(hit);
      }
      return;
    }
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        move(1);
        break;
      case "ArrowUp":
        e.preventDefault();
        move(-1);
        break;
      case "Home":
        e.preventDefault();
        setActive(enabled[0] ?? -1);
        break;
      case "End":
        e.preventDefault();
        setActive(enabled.at(-1) ?? -1);
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        if (active >= 0) choose(active);
        break;
      case "Escape":
        // close only the list, never the modal or drawer around it
        e.preventDefault();
        e.stopPropagation();
        close();
        break;
      case "Tab":
        setOpen(false);
        break;
      default:
        if (printable) {
          const hit = findTyped(e.key);
          if (hit !== undefined) setActive(hit);
        }
    }
  };

  return (
    <div className={cx("w-full", className)}>
      <button
        ref={btn}
        type="button"
        role="combobox"
        data-testid={testId}
        data-value={current}
        id={id}
        title={title}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open && active >= 0 ? optId(active) : undefined}
        aria-label={ariaLabel}
        aria-labelledby={labelledBy}
        aria-invalid={invalid || undefined}
        aria-required={field?.required || undefined}
        onClick={() => {
          if (fromLabel.current) {
            fromLabel.current = false;
            btn.current?.focus();
            return;
          }
          if (open) close(false);
          else openList();
        }}
        onKeyDown={onKeyDown}
        className={cx(
          // Size containment: the trigger's intrinsic width is fixed (like an <input>'s) instead of following the
          // chosen value, so a long value truncates rather than widening an auto-sized grid/flex column, and the
          // layout does not jump when the value changes.
          "flex h-9 w-full items-center gap-2 rounded-lg border bg-surface pr-[11px] pl-3 text-left text-[14px] text-ink transition-[border-color,box-shadow] duration-150 [contain-intrinsic-inline-size:10rem] [contain:inline-size] focus:outline-none disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-ink-3",
          invalid ? "border-bad focus-visible:ring-2 focus-visible:ring-bad/20" : open ? "border-brand ring-2 ring-brand/25" : "border-line-strong hover:border-ink-3 focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/25",
        )}
      >
        <span className={cx("min-w-0 flex-1 truncate", (!selected || isPrompt(selected)) && "text-ink-3")}>{selected ? selected.label : (placeholder ?? "Select…")}</span>
        <ChevronDown aria-hidden size={16} strokeWidth={2} className={cx("shrink-0 text-ink-3 transition-transform duration-150", open && "rotate-180", disabled && "opacity-50")} />
      </button>
      {open &&
        place &&
        createPortal(
          <ul
            ref={list}
            id={listId}
            role="listbox"
            aria-label={ariaLabel}
            aria-labelledby={labelledBy}
            tabIndex={-1}
            onMouseDown={(e) => e.preventDefault() /* keep focus on the trigger */}
            style={{ position: "fixed", left: place.left, width: place.width, maxHeight: place.maxHeight, top: place.top, bottom: place.bottom }}
            className="z-[70] overflow-y-auto overscroll-contain rounded-xl border border-line bg-surface p-1 shadow-pop scrollbar-thin"
          >
            {options.map((o, i) => {
              const prompt = isPrompt(o);
              const isSel = i === selectedIndex && !prompt;
              const header = o.group && o.group !== options[i - 1]?.group;
              return (
                <Fragment key={`${o.group ?? ""}-${o.value}-${i}`}>
                  {header && (
                    <li role="presentation" className="px-2.5 pt-2.5 pb-1 text-[11px] font-semibold tracking-wide text-ink-3 uppercase first:pt-1.5">
                      {o.group}
                    </li>
                  )}
                  <li
                    id={optId(i)}
                    data-index={i}
                    data-testid={testId ? `${testId}-option-${o.value}` : undefined}
                    role="option"
                    aria-selected={isSel}
                    aria-disabled={o.disabled || undefined}
                    // Only a pointer that actually moves highlights an option: when the list opens or scrolls under a
                    // resting pointer the browser sends events without movement, and those must not override the keyboard.
                    onMouseMove={(e) => {
                      if (o.disabled || i === active || (e.movementX === 0 && e.movementY === 0)) return;
                      setActive(i, "none");
                    }}
                    onClick={() => choose(i)}
                    className={cx(
                      "flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-[13.5px] leading-snug",
                      isSel ? "font-medium text-brand" : prompt ? "text-ink-3" : "text-ink",
                      i === active && !o.disabled && "bg-ink/8",
                      o.disabled && "cursor-not-allowed opacity-50",
                    )}
                  >
                    <span className="min-w-0 flex-1 break-words">{o.label}</span>
                    <Check aria-hidden size={15} strokeWidth={2.25} className={cx("shrink-0 text-brand", !isSel && "invisible")} />
                  </li>
                </Fragment>
              );
            })}
            {options.length === 0 && <li className="px-2.5 py-2 text-[13px] text-ink-3">No options</li>}
          </ul>,
          document.body,
        )}
    </div>
  );
}
