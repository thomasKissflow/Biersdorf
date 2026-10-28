/**
 * Input · Select · Textarea · Checkbox · Switch · RadioCard — every field control, on theme
 * tokens.
 *
 * RETUNED 2026-08-13 from Fields.dc.html (Claude Design project "Mobile app style guide sheet",
 * 2b8a920b-a786-4430-bd63-b0bc0dbe6229) — Cards.jsx and Buttons.jsx got the same treatment first;
 * this follows their playbook (provenance comments, a token-mapping table, literal Tailwind
 * geometry over a token-driven bundle) rather than reinventing one. The old multi-language
 * (Beacon/Nimbus/Checkpoint) comparison this file used to carry is GONE — all ten non-Beacon
 * languages retired 2026-08-12, see tokens.css's own banner — so every note below describes what
 * this one page actually draws, not what three used to disagree on.
 *
 * WHAT CHANGED, per Fields.dc.html's own token-mapping table — "10px corners, a softer edge, and
 * a 3px ring instead of 2":
 *   Box radius     --radius-md, 10px (was 8px)
 *   Box edge       --color-gray-3 (was --color-border) — "a softer resting edge on white panels"
 *   Box hover      --color-text-subtle edge — NEW, a state this control never had before
 *   Box focus      --color-primary edge + --color-ring at 3px (was 2px), offset 0 (unchanged)
 *   Placeholder    --color-text-subtle (was --color-border, which "read as disabled")
 *   Checkbox       size-4.5 (18px) · --radius-sm (6px) · white 3px-stroke check
 *   Switch         track 42x24 (was 38x22), thumb 20px, off-track --color-gray-3
 *   RadioCard      NEW — see its own doc below
 *
 * GEOMETRY IS NO LONGER A TOKEN BUNDLE. `field-shape` / `field-multiline` (the @utility pair this
 * file used to build FIELD from) are DROPPED here, the same call Buttons.jsx made retiring
 * `control-shape`: "geometry unchanged from Tailwind's own scale, not new tokens." Both utilities
 * are UNCHANGED in tokens.css, at their OLD 46px fallback — and Command.jsx / FlowViews.jsx still
 * read `field-shape` directly, so as of this pass those two render a 46px field beside every other
 * field in the app at 44px. Out of scope here (this file has no reach into either), but it is a
 * real, visible divergence, not a neutral one — the same "one pixel off every other input" failure
 * FIELD's own verbatim-string contract exists to prevent, just relocated to a file this pass
 * didn't touch. Flagged for a follow-up pass on Command.jsx/FlowViews.jsx (or a --field-height
 * bump in tokens.css once Fields.dc.html's numbers are the canonical ones there too).
 *
 * THE NUMBER THIS DISCLOSES: `field-shape`'s own height fallback is 46px (the OLD Beacon number,
 * never updated because Fields.dc.html hadn't been transcribed yet — see tokens.css's file
 * banner). Fields.dc.html's own mapping table gives the box as `h-11` (44px) twice, so that is
 * what ships below — a 2px height drop across every field in the app, the same shape as Buttons.jsx
 * disclosing 42→34 on its own default size. `field-multiline`'s min-height (138px = 46×3) is
 * dropped for the same reason: composing off the new 44px height gives 132px, not 138, and half-
 * updating one without the other would leave a textarea and a single-line field disagreeing about
 * what "the field's own height" means.
 *
 * FIELD STAYS A PLAIN STRING, EXPORTED, on purpose — SearchBar/FilterBar (kit/Fx.jsx) read it
 * VERBATIM (`FIELD + " pl-9"`) so a search box is pixel-identical to a form input in every
 * language; turning it into a function or folding a prop into it would break that contract
 * silently the next time Fx.jsx is touched.
 *
 * READ-ONLY IS NOT A CSS VARIANT HERE. `:read-only` also matches a DISABLED input — a disabled
 * field is, by definition, not user-alterable — so a bare `read-only:` utility baked into FIELD
 * would strip the disabled state's own edge too, and the two would then fight over which class
 * wins with no reliable order. Input/Textarea instead read the `readOnly` prop directly in JS and
 * drop the border via an inline style, which always wins regardless of utility order — the same
 * reasoning Cards.jsx's `tone` override and Buttons.jsx's gradient background already lean on.
 *
 * NOTE — preflight is OFF (src/shadcn.css), so <input>, <select> and <textarea> keep the UA's own
 * font, border, background and (on select) its native arrow. Every one of those is reset
 * explicitly below. Drop `appearance-none` on the Select and you get two chevrons. Every border
 * below is drawn with `border-decor` (style + width) plus a plain `border-{token}` colour class —
 * not a bare `border`, which sets width only and, with preflight off, has no `border-style` to
 * pair with it (see tokens.css's own note: "the first version shipped without it and every card
 * measured 0px while the build stayed green").
 */

// EXPORTED so SearchBar can wear the identical field geometry instead of copying this string.
// A search box that is one pixel off every other input on the page is the classic way a "shared"
// design system stops being shared, and a duplicated class string is how it happens.
//
// Built from FIELD_BASE + the box's own height/padding rather than inline, so Textarea can share
// every colour/state rule without also inheriting the fixed h-11 — composing two conflicting
// height utilities in one string (h-11 alongside a min-h-* override) has no reliable winner,
// since both land in the same Tailwind layer at the same specificity.
const FIELD_BASE =
  "w-full rounded-md border-decor border-gray-3 bg-surface text-[13.5px] text-secondary font-sans leading-none " +
  "transition-colors outline-none " +
  "placeholder:text-text-subtle " +
  "enabled:hover:border-text-subtle " +
  "focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-ring focus-visible:ring-offset-0 " +
  // border-0 (width only, not -transparent, which is colour only) zeroes the edge on :disabled —
  // and does so RELIABLY, unlike the h-11/min-h split above: a `:disabled`-qualified selector
  // outranks border-decor's plain class on specificity alone, so this wins regardless of
  // Tailwind's own generation order.
  "disabled:cursor-not-allowed disabled:border-0 disabled:bg-gray-1 disabled:text-text-muted";

export const FIELD = FIELD_BASE + " h-11 px-3.5";

/** A labelled field wrapper. The label is the caption voice, not the data voice. --color-text-muted
 *  is Foundations' own token for "body copy, labels" — one token now covers both the caption above
 *  a field and the hint below it, where this used to split across two retired tokens. */
function Field({ label, hint, htmlFor, children }) {
  if (!label && !hint) return children;
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={htmlFor} className="text-xs font-semibold text-text-muted">
          {label}
        </label>
      )}
      {children}
      {hint && <p className="m-0 text-xs text-text-muted">{hint}</p>}
    </div>
  );
}

export function Input({ id, label, hint, type = "text", readOnly, className = "", ...rest }) {
  return (
    <Field label={label} hint={hint} htmlFor={id}>
      <input
        id={id}
        type={type}
        readOnly={readOnly}
        // "no edge at all — a value on display, not a control" (Fields.dc.html). An inline style
        // wins over every class-level border no matter how the utilities are ordered, which a
        // second border-color CLASS could not guarantee — see the file banner.
        style={readOnly ? { borderWidth: 0 } : undefined}
        className={FIELD + (className ? " " + className : "")}
        {...rest}
      />
    </Field>
  );
}

/**
 * Select. `options` is [{value,label}] or a plain string[].
 *
 * The chevron is drawn as a background image rather than a sibling element so the control stays
 * one focusable box — a wrapper with an absolutely-positioned icon would put the ring around the
 * wrapper instead of the control. `currentColor` is deliberate: it inherits the field's ink, so it
 * follows the disabled state without a second token. The chevron's own stroke colour is a literal,
 * not a token — Fields.dc.html's token-mapping table doesn't name it, so it stays exactly as drawn
 * rather than getting a token invented for it.
 */
export function Select({ id, label, hint, options = [], className = "", ...rest }) {
  const items = options.map((o) => (typeof o === "string" ? { value: o, label: o } : o));
  return (
    <Field label={label} hint={hint} htmlFor={id}>
      <select
        id={id}
        className={
          FIELD +
          " cursor-pointer appearance-none bg-[length:11px_7px] bg-[right_14px_center] bg-no-repeat pr-10 " +
          (className ? " " + className : "")
        }
        style={{
          // Beacon's chevron, verbatim: an 11x7 path `M1 1.3 5.5 5.5 10 1.3`, 1.6 stroke, round cap.
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='11' height='7' viewBox='0 0 11 7'%3E%3Cpath d='M1 1.3 5.5 5.5 10 1.3' fill='none' stroke='%23656e7a' stroke-width='1.6' stroke-linecap='round'/%3E%3C/svg%3E\")",
        }}
        {...rest}
      >
        {items.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Field>
  );
}

/** Textarea. Releases FIELD_BASE's fixed height for a min-height derived from the box's own new
 *  44px height — see the file banner for why that number is 132, not the old 138. Both are [OURS]:
 *  no page ever declared a multi-line field, so the derivation is the invention, kept in one place
 *  rather than smeared across the component. */
export function Textarea({ id, label, hint, rows, readOnly, className = "", ...rest }) {
  return (
    <Field label={label} hint={hint} htmlFor={id}>
      <textarea
        id={id}
        rows={rows}
        readOnly={readOnly}
        style={readOnly ? { borderWidth: 0 } : undefined}
        className={FIELD_BASE + " min-h-[132px] px-3.5 py-[11px] resize-y leading-relaxed" + (className ? " " + className : "")}
        {...rest}
      />
    </Field>
  );
}

/**
 * Label — a standalone caption for a control `Field` above doesn't fit: beside a `Checkbox` or
 * `Switch`, or captioning a custom composite that isn't one of the three fields here. Same ink
 * and weight `Field`'s own internal label uses, so a form mixing both reads as one system
 * rather than two captions that happen to be close.
 */
export function Label({ htmlFor, className = "", children }) {
  return (
    <label htmlFor={htmlFor} className={"text-xs font-semibold text-text-muted " + className}>
      {children}
    </label>
  );
}

/**
 * Checkbox — hand-rolled on a real `<input type="checkbox">`, not a Radix primitive, for the
 * same reason `Modal` is hand-rolled rather than built on `@radix-ui/react-dialog`: the job is
 * ownable directly, and a native checkbox already carries the semantics (form submission,
 * `:indeterminate`, screen-reader state) a div-based primitive re-implements. [OURS] — no page
 * declares a checkbox.
 *
 * The input sits absolutely positioned over its own visual box at opacity 0 rather than visually
 * hidden off-screen (`sr-only`), so it stays the thing a pointer actually clicks — `label htmlFor`
 * alone is enough for keyboard and screen-reader users, but a real hit target under the cursor is
 * what makes the box itself feel clickable rather than just its caption. `checked` drives the fill
 * directly from the prop rather than a CSS sibling selector, because `peer-*` only matches actual
 * siblings and the check icon lives inside the box, not beside it.
 */
export function Checkbox({ id, label, checked = false, onChange, disabled, className = "", ...rest }) {
  return (
    <label
      htmlFor={id}
      className={"inline-flex items-center gap-2 " + (disabled ? "cursor-not-allowed opacity-60 " : "cursor-pointer ") + className}
    >
      <span
        className={
          "relative grid size-4.5 flex-none place-items-center rounded-sm border-decor transition-colors " +
          "has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-0 " +
          (checked ? "border-primary bg-primary text-white" : "border-gray-3 bg-surface text-transparent")
        }
      >
        <input
          id={id}
          type="checkbox"
          checked={checked}
          onChange={onChange}
          disabled={disabled}
          className="absolute inset-0 m-0 cursor-inherit opacity-0"
          {...rest}
        />
        <svg width="10" height="8" viewBox="0 0 10 8" fill="none" aria-hidden="true" className="pointer-events-none">
          <path d="M1 4l2.5 2.5L9 1" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      {label && <span className="text-sm text-secondary">{label}</span>}
    </label>
  );
}

/**
 * Switch — the same hand-rolled reasoning as `Checkbox`, on a real checkbox input with
 * `role="switch"` for the announced semantics. [OURS] — no page declares a toggle, and track/thumb
 * sizing is a fixed pair rather than a `*-shape` utility: a switch has no rank and no per-page
 * variant to bundle the way `control-shape`/`chip-shape` do for the components that do. `checked`
 * drives both the track fill and the thumb's translate directly from the prop, for the same
 * sibling-selector reason `Checkbox` does. The slide is the mock's own spring curve, not
 * `--ease-standard` — Fields.dc.html never names it as a reusable token, only draws it on this one
 * interaction (the same call Cards.jsx made keeping its clickable-hover curve a literal).
 */
export function Switch({ id, checked = false, onChange, disabled, className = "", ...rest }) {
  return (
    <label
      htmlFor={id}
      className={
        "relative inline-flex h-6 w-[42px] flex-none items-center rounded-full p-0.5 transition-colors " +
        "has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-0 " +
        (checked ? "bg-primary " : "bg-gray-3 ") +
        (disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer") +
        (className ? " " + className : "")
      }
    >
      <input
        id={id}
        type="checkbox"
        role="switch"
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        className="sr-only"
        {...rest}
      />
      <span
        aria-hidden="true"
        className={
          "size-5 rounded-full bg-surface shadow-contact transition-transform duration-[180ms] ease-[cubic-bezier(.16,1,.3,1)] " +
          (checked ? "translate-x-[18px]" : "translate-x-0")
        }
      />
    </label>
  );
}

/**
 * RadioCard — a selectable card, for a plan/session-length picker where each option needs room for
 * a label and a value, not just a dot and a caption. NEW in Fields.dc.html: "a selected card tints
 * rather than only ringing" — unselected is a plain --color-surface row; selected swaps to
 * --color-row-selected's tint (#FFF8F3, the exact token Board's own selected-row treatment already
 * uses — reused here rather than inventing a second peach), a --color-primary edge, and
 * --color-primary-ink on the label.
 *
 * Hand-rolled on a real `<input type="radio">`, same reasoning as Checkbox/Switch above: grouping,
 * keyboard nav and form submission stay the browser's job. Ternary'd rather than composed from
 * conflicting utility classes for the same reason FIELD_BASE/FIELD are split above — `disabled`
 * and `:enabled`/`:disabled` variants only match real form controls, and this wrapper is a
 * `<label>`, not one, so the state has to be resolved in JS rather than leaned on a CSS variant
 * that would silently never match.
 */
export function RadioCard({ id, name, value, checked = false, onChange, disabled, label, hint, className = "", ...rest }) {
  return (
    <label
      htmlFor={id}
      className={
        "relative flex items-center gap-3 rounded-lg border-decor px-4 py-3.5 transition-colors " +
        "has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-0 " +
        (disabled
          ? "cursor-not-allowed opacity-60 " + (checked ? "border-primary bg-row-selected " : "border-gray-3 bg-surface ")
          : checked
            ? "cursor-pointer border-primary bg-row-selected "
            : "cursor-pointer border-gray-3 bg-surface hover:border-text-subtle ") +
        (className ? " " + className : "")
      }
    >
      <input
        id={id}
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        className="absolute inset-0 m-0 cursor-inherit opacity-0"
        {...rest}
      />
      <span className="min-w-0 flex-1">
        <span className={"block text-sm font-semibold " + (checked ? "text-primary-ink" : "text-secondary")}>{label}</span>
        {hint && <span className="mt-0.5 block text-xs text-text-muted">{hint}</span>}
      </span>
      {/* The dot indicator: 16px outer ring, 6px inner fill when selected — drawn beside the real
          input rather than swapped for it, same split as Checkbox's own tick. */}
      <span
        aria-hidden="true"
        className={"grid size-4 flex-none place-items-center rounded-full border-decor " + (checked ? "border-primary" : "border-gray-3")}
      >
        {checked && <span className="size-1.5 rounded-full bg-primary" />}
      </span>
    </label>
  );
}
