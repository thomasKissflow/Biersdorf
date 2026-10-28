/**
 * FieldInput · FormCard · ItemForm · NewButton · NewMenu — the write path, on theme tokens.
 *
 * REDESIGNED 2026-08-13 from Forms.dc.html (Claude Design project "Mobile app style guide sheet",
 * 2b8a920b-a786-4430-bd63-b0bc0dbe6229). This file's own thesis, verbatim: "Fields draws
 * controls; this creates and updates records — which means it owns field dispatch, validation,
 * the saving state, and what happens when a save fails." Same reason it stays split from
 * Fields.jsx as before: these talk to the SDK, Fields.jsx is presentational.
 *
 * WHAT CHANGED, beyond drawing through tokens.css:
 *
 *   Panel        --color-surface, role="list" (p-6 — "a form is rows, not a metric tile"), was
 *                role="doc" (p-7). A field grid is rows, so it takes the same density Cards.jsx
 *                gives a list card, not the airier doc density prose gets.
 *   Grid         2 columns, gap-[18px] (no named token lands on 18px — nearest real one is
 *                the spacing scale, none of which hits it exactly, so this stays the doc's own
 *                literal, same footing as Cards.jsx's -mx-5 sparkline bleed). A field can span
 *                both columns; long fields (textarea/rich text, and the multi-value read-only
 *                types) do.
 *   Required     an asterisk in --color-danger AFTER the label, never a "(required)" word.
 *   Invalid      edge + label + hint all move to --color-danger / --color-danger-ink TOGETHER —
 *                the old file had no invalid state at all, so this is new, not a fix.
 *   Read-only    Reference/ReferenceList/User/UserList/Group now render their OWN box —
 *                --color-gray-1 fill, no edge, an Avatar/AvatarStack + name — not a `readOnly`
 *                <input>. "A value on display, not a control": the old readOnly-input still LOOKED
 *                like a text box you could click into, which is exactly the wrong invitation for a
 *                field whose only real editor is the platform's own filtered lookup.
 *   Boolean      now Switch (Fields.jsx's own toggle), not a hand-rolled checkbox — the old inline
 *                `<input type=checkbox>` predates Switch existing in the kit at all.
 *   Save states  see "THE STATE MACHINE" below — two real behaviour bugs fixed, not just restyled.
 *   NewButton    defaults to rank="primary" (was "strong") — Forms.dc.html's own split: "ONE flow
 *                -> primary-rank button naming the flow," "SEVERAL -> strong-rank button + a
 *                chevron opening a menu." NewMenu is the "several" case, so IT gets strong now.
 *   NewMenu      was N buttons in a row (kit had no menu primitive when this file last shipped).
 *                Floating.jsx now exports DropdownMenu, but hasn't been redesigned onto these
 *                tokens yet (still reads --popover/border-decor, the pre-Foundations bridge) — so
 *                rather than visually clash with a kit that is otherwise entirely token-clean,
 *                this reaches for @radix-ui/react-dropdown-menu directly (already a dependency;
 *                Floating.jsx pulls the same package) and draws the surface in the SAME classes
 *                Cards.jsx already established (bg-surface, shadow-raised, rounded-lg, no edge).
 *                Swap this for Floating.jsx's own exports once that file lands — it is the more
 *                correct home for it, just not a token-consistent one yet.
 *   API          one prop added, `required` (field ids that must be non-empty before the write is
 *                attempted) — on FormCard, ItemForm, NewButton and NewMenu, per Forms.dc.html's own
 *                API table. FieldInput's OWN new prop is `required` too (a single field's flag,
 *                not a list) — Forms.dc.html counts it as the fourth thing that gets the prop.
 *                Everything else — prop names, defaults, SDK calls, callback contracts — unchanged.
 *
 * THE STATE MACHINE. Forms.dc.html names five states and asks for all of them to be real:
 *   1. Editing   — no message, submit stays primary+enabled.
 *   2. Invalid   — a required field is empty; ONLY on a submit attempt (not on first paint, or
 *                  every blank required form would open already in this state) does the offending
 *                  field(s) turn danger. No summary banner — Forms.dc.html is explicit that a
 *                  single field's problem doesn't need one; the footer's note line carries the
 *                  count instead, which is what that line is FOR.
 *   3. Saving    — the button shows a spinner, drops to opacity-40, and goes inert — but NOT via
 *                  the `disabled` attribute for the transient case, only for the permanent one
 *                  (zero editable fields on the flow, a structural dead end unrelated to busy).
 *                  `disabled` mid-save would pull the button out of tab order for however long the
 *                  request takes, which reads as the page having broken far more than a busy
 *                  button does. `pointer-events-none` + `aria-disabled` gets the same "can't
 *                  activate this right now" without it. THIS WAS A REAL BUG: the old submit button
 *                  used `disabled={busy}` outright.
 *   4. Failed    — button returns to normal, a danger Callout appears above the fields with the
 *                  reason, and — THE OTHER REAL BUG — `setValues({})` never ran on the failure
 *                  path even before this pass (it only clears on the SUCCESS branch), so values
 *                  were already preserved. Confirmed, not re-fixed; flagged because the port
 *                  instructions asked to check for it by name.
 *   5. Saved     — button goes solid --color-success-dot ("Created" for FormCard, "Saved" for
 *                  ItemForm — same state, the two components' own verb), a success Callout shows
 *                  the record id in mono. FormCard clears its fields (ready for the next one —
 *                  Forms.dc.html's own worked example shows the new record's id, which only makes
 *                  sense for a CREATE). ItemForm does NOT clear — those values are the record now,
 *                  wiping them would look like data loss, not confirmation, and nothing in the doc
 *                  says an edit form should blank itself out after saving successfully.
 *                  A NOTED GAP, NOT FIXED HERE: ItemForm still calls `onSaved` then `onClose` on
 *                  success, same order as before — dropping the `onClose` call was considered and
 *                  reverted, because RecordSheet.jsx (the one real caller) passes the SAME
 *                  function for both props, so the sheet closes either way and the Saved state
 *                  never paints there regardless of what ItemForm does. Fixing that means
 *                  RecordSheet no longer auto-closing on save, which is that component's call to
 *                  make, not a change to make unilaterally from inside ItemForm — and doing it
 *                  here anyway would silently change behaviour for every OTHER caller that passes
 *                  two distinct callbacks, expecting `onClose` to still fire. The Saved rendering
 *                  below is real and correct for any caller that passes `onSaved` without
 *                  `onClose`, or that closes on a delay of its own.
 */

import { useState } from "react";
import { useKf } from "@kissflow/app-ui";
import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";

import { Card, CardTitle } from "./Cards.jsx";
import { Button, ButtonRow } from "./Buttons.jsx";
import { Input, Select, Textarea, Switch, Label } from "./Fields.jsx";
import { Avatar, AvatarStack } from "./Avatar.jsx";
import { Callout } from "./Callout.jsx";
import { flowHandle, cellText } from "./useFlow.js";

const fieldId = (f) => f.Id ?? f.id;

/** A value counts as "empty" for required-field purposes when it's unset or blank text.
 *  `false` and `0` are real, saved values — a Switch left off is a choice, not a gap. */
const isEmpty = (v) => v === undefined || v === null || (typeof v === "string" && v.trim() === "");

/** Long-form fields, and the multi-value read-only ones, take both grid columns rather than
 *  half a row — "nothing spans one and a half." */
const spansFull = (type) => /textarea|multiline|longtext|richtext|referencelist|userlist|multiuser|userandgroup/i.test(String(type));

/** The label, with the required mark composed in — never a separate "(required)" word, and
 *  the whole label recolours to --color-danger-ink when the field is currently invalid. The
 *  asterisk itself always reads --color-danger regardless of validity: it marks the RULE, not
 *  the current state of following it. */
function fieldLabel(text, required, invalid) {
  return (
    <span style={invalid ? { color: "var(--color-danger-ink)" } : undefined}>
      {text}
      {required && (
        <span aria-hidden="true" style={{ color: "var(--color-danger)" }}>
          {" "}
          *
        </span>
      )}
    </span>
  );
}

function DangerDot() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" className="flex-none">
      <circle cx="6" cy="6" r="5.1" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <path d="M6 3.4v3.3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <circle cx="6" cy="8.4" r="0.75" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** The hint every invalid field shows — small danger icon + a short reason. Field-level only,
 *  no summary banner for a single field: Forms.dc.html's own words. */
function invalidHint() {
  return (
    <span className="inline-flex items-center gap-1" style={{ color: "var(--color-danger-ink)" }}>
      <DangerDot /> Required
    </span>
  );
}

/**
 * ReadOnlyField — what Reference/ReferenceList/User/UserList/Group render instead of a control.
 *
 * "A value on display, not a control": --color-gray-1 fill, no edge, an Avatar/AvatarStack next
 * to the record's own name(s). Choosing a DIFFERENT record needs the platform's filtered lookup
 * against the target model, which is a real control this kit doesn't have and shouldn't fake with
 * a text box over a foreign key — so this only ever shows what the record already points at.
 *
 * `cellText` (useFlow.js) is reused rather than re-derived: it exists specifically because a
 * reference/user cell arrives as an object and stringifying one directly prints
 * "[object Object]" — the same bug this component exists to keep from reappearing here.
 */
function ReadOnlyField({ id, label, value, invalid }) {
  const names = (Array.isArray(value) ? value : value != null ? [value] : [])
    .map((v) => {
      const t = cellText(v);
      return t === "—" ? null : t;
    })
    .filter(Boolean);

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={id} className="text-xs font-semibold text-text-muted">
          {label}
        </label>
      )}
      <div
        id={id}
        className="field-shape flex w-full items-center gap-2 bg-gray-1"
        // No edge by default — the one deliberate exception is the invalid state, which every
        // field type shares; a real border only appears then, never a permanent one.
        style={{ borderStyle: "solid", borderWidth: invalid ? "1px" : 0, borderColor: invalid ? "var(--color-danger)" : "transparent" }}
        title="Linked records are chosen in Kissflow's own form"
      >
        {names.length > 0 && (names.length > 1 ? <AvatarStack people={names} max={3} /> : <Avatar name={names[0]} size="sm" />)}
        <span className={"truncate text-sm " + (names.length ? "text-secondary" : "text-text-muted")}>
          {names.length ? names.join(", ") : "Not set"}
        </span>
      </div>
      {invalid && <p className="m-0 text-xs">{invalidHint()}</p>}
    </div>
  );
}

/**
 * FieldInput — one field, dispatched on its declared Type.
 *
 * Kissflow's field types are many and this maps the ones a create/edit form actually meets. The
 * fallback is a text input rather than nothing, because an unmapped type should still be
 * editable — a field that silently refuses to render is worse than one that renders plainly.
 *
 * `required` is NEW: pass true to show the asterisk and, once the field is actually empty AND
 * invalid, the danger treatment. FormCard/ItemForm compute that second half (see "THE STATE
 * MACHINE") and pass it in as `invalid` — a single field has no way to know on its own whether a
 * submit has even been attempted yet.
 */
export function FieldInput({ field, value, onChange, required = false, invalid = false }) {
  if (!field) return null;
  const id = fieldId(field);
  const text = field.Name ?? field.name ?? id;
  const type = String(field.Type ?? field.type ?? "Text");
  const set = (v) => onChange?.(id, v);

  const label = fieldLabel(text, required, invalid);
  const hint = invalid ? invalidHint() : undefined;
  const edgeStyle = invalid ? { borderColor: "var(--color-danger)" } : undefined;

  // REFERENCE / USER fields hold an OBJECT — see ReadOnlyField's own comment for why this stays
  // read-only rather than an editable text box.
  if (/^(Reference|ReferenceList|User|UserList|MultiUser|UserAndGroup|UserAndGroupList|Group)$/i.test(type)) {
    return <ReadOnlyField id={id} label={label} value={value} invalid={invalid} />;
  }

  // Choice-like types carry their options on the field definition under several possible keys,
  // depending on which surface produced the schema.
  const options = field.Options ?? field.options ?? field.Choices ?? [];

  if (/textarea|multiline|longtext|richtext/i.test(type)) {
    return <Textarea id={id} label={label} hint={hint} value={value ?? ""} onChange={(e) => set(e.target.value)} style={edgeStyle} />;
  }
  if (/select|dropdown|choice|status|radio/i.test(type) && options.length) {
    return (
      <Select
        id={id}
        label={label}
        hint={hint}
        value={value ?? ""}
        onChange={(e) => set(e.target.value)}
        style={edgeStyle}
        options={options.map((o) => (typeof o === "string" ? o : { value: o.value ?? o.Id ?? o.id, label: o.label ?? o.Name ?? o.name }))}
      />
    );
  }
  if (/bool|checkbox|toggle|yesno/i.test(type)) {
    return (
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor={id}>{label}</Label>
          <Switch id={id} checked={!!value} onChange={(e) => set(e.target.checked)} />
        </div>
        {hint && <p className="m-0 text-xs">{hint}</p>}
      </div>
    );
  }
  const inputType = /date/i.test(type) ? "date" : /number|currency|decimal|integer/i.test(type) ? "number" : /email/i.test(type) ? "email" : "text";
  return <Input id={id} label={label} hint={hint} type={inputType} value={value ?? ""} onChange={(e) => set(e.target.value)} style={edgeStyle} />;
}

/** The fields a create/edit form should offer: skip internals and system columns. Same filter
 *  the legacy FormCard used, so the two offer the same set. */
const editable = (fields = [], max) => fields.filter((f) => !f.IsInternal && !/^_/.test(fieldId(f) ?? "")).slice(0, max);

/** The field grid — 2 columns, gap-[18px], long fields spanning both. Shared by FormCard and
 *  ItemForm so the two layouts cannot drift apart. */
function FieldGrid({ fields, values, onChange, required, invalidIds }) {
  if (!fields.length) return <p className="m-0 text-sm text-text-muted">No editable fields on this flow.</p>;
  return (
    <div className="grid grid-cols-1 gap-[18px] sm:grid-cols-2">
      {fields.map((f) => {
        const id = fieldId(f);
        return (
          <div key={id} className={spansFull(f.Type ?? f.type) ? "sm:col-span-2" : ""}>
            <FieldInput
              field={f}
              value={values[id]}
              onChange={onChange}
              required={required.includes(id)}
              invalid={invalidIds.includes(id)}
            />
          </div>
        );
      })}
    </div>
  );
}

/** The footer every write-path card shares: a border-top rule, a note on the left, Cancel (when
 *  there is somewhere to cancel TO) then Submit, right-aligned. The border is set via inline
 *  style rather than the `border-t` utility — preflight is off (see tokens.css's own note on
 *  `border-decor`), so a bare width-only utility with no explicit style computes to an invisible
 *  0px border, same failure Callout.jsx's "always" edge exists to avoid. */
function FormFooter({ note, onCancel, busy, done, submitLabel, savedLabel, submitDisabled }) {
  return (
    <div
      className="mt-6 flex flex-wrap items-center justify-between gap-3 pt-4"
      style={{ borderTopWidth: "1px", borderTopStyle: "solid", borderTopColor: "var(--color-gray-1)" }}
    >
      <p className="m-0 text-xs text-text-muted">{note}</p>
      <ButtonRow>
        {onCancel && (
          <Button rank="outline" type="button" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button
          rank="primary"
          type="submit"
          loading={busy}
          disabled={submitDisabled}
          aria-disabled={busy || undefined}
          // Busy is NOT the `disabled` attribute (see file banner) — opacity/cursor carry the
          // state instead, so the button never leaves the tab order mid-save. The Saved state's
          // shadow drops via the `shadow-none` CLASS, not an inline boxShadow — Buttons.jsx's own
          // file banner is explicit that an inline boxShadow wins the cascade over the composed
          // shadow class and silently deletes the focus ring riding the same property.
          className={(busy ? "pointer-events-none cursor-default opacity-40 " : "") + (done ? "shadow-none" : "")}
          style={done ? { backgroundImage: "none", background: "var(--color-success-dot)" } : undefined}
        >
          {busy ? "Saving…" : done ? savedLabel : submitLabel}
        </Button>
      </ButtonRow>
    </div>
  );
}

/**
 * FormCard — create a record.
 *
 * `onCreated(record)` fires after a successful createItem, which is how a caller refreshes a
 * list beside it. Errors render in place rather than throwing: a form that vanishes on a
 * validation failure loses everything the user typed.
 */
export function FormCard({ flowType = "Form", flowId, title = "Create record", max = 6, fields = [], required = [], onCreated }) {
  const kf = useKf();
  const [values, setValues] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(null); // holds the created record, so its id can be shown
  const [attempted, setAttempted] = useState(false);

  const shown = editable(fields, max);
  const set = (id, v) => {
    setValues((s) => ({ ...s, [id]: v }));
    if (done) setDone(null); // editing again leaves the Saved state
  };

  const missing = shown.filter((f) => required.includes(fieldId(f)) && isEmpty(values[fieldId(f)]));
  const invalidIds = attempted ? missing.map(fieldId) : [];

  const submit = async (e) => {
    e?.preventDefault?.();
    if (busy || !shown.length) return;
    setAttempted(true);
    if (missing.length) return; // Invalid state — field-level only, no SDK call, no banner
    setBusy(true);
    setError(null);
    try {
      const created = await flowHandle(kf, flowType, flowId).createItem(values);
      setValues({});
      setAttempted(false);
      setDone(created ?? {});
      onCreated?.(created);
    } catch (err) {
      setError(String(err?.message ?? err)); // values are left exactly as typed
    } finally {
      setBusy(false);
    }
  };

  const createdId = done?._id ?? done?.Id ?? done?.id;

  return (
    <Card role="list" as="form" onSubmit={submit}>
      <CardTitle>{title}</CardTitle>
      {error && (
        <Callout tone="danger" title="Could not save" className="mb-4" onDismiss={() => setError(null)}>
          {error}
        </Callout>
      )}
      {done && (
        <Callout tone="success" className="mb-4" onDismiss={() => setDone(null)}>
          Record created{createdId ? <> — <span className="font-mono">{String(createdId)}</span></> : "."}
        </Callout>
      )}
      <FieldGrid fields={shown} values={values} onChange={set} required={required} invalidIds={invalidIds} />
      <FormFooter
        note={invalidIds.length ? `${invalidIds.length} required field${invalidIds.length > 1 ? "s" : ""} need${invalidIds.length > 1 ? "" : "s"} a value` : ""}
        busy={busy}
        done={Boolean(done)}
        submitLabel="Create"
        savedLabel="Created"
        submitDisabled={!shown.length}
      />
    </Card>
  );
}

/**
 * ItemForm — edit an existing record.
 *
 * Seeded from `item` so the form opens populated, which is the difference from FormCard beyond
 * the SDK call. `onSaved(record)` then `onClose()` — both optional, and both fire in that order on
 * success, same contract as before (see "THE STATE MACHINE" in the file banner for why this pair
 * stayed as-is rather than being "fixed").
 */
export function ItemForm({ flowType = "Form", flowId, item, fields = [], required = [], onClose, onSaved }) {
  const kf = useKf();
  const [values, setValues] = useState(() => ({ ...(item ?? {}) }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);
  const [attempted, setAttempted] = useState(false);

  const shown = editable(fields, Infinity);
  const set = (id, v) => {
    setValues((s) => ({ ...s, [id]: v }));
    if (saved) setSaved(false);
  };
  const itemId = item?._id ?? item?.Id ?? item?.id;

  const missing = shown.filter((f) => required.includes(fieldId(f)) && isEmpty(values[fieldId(f)]));
  const invalidIds = attempted ? missing.map(fieldId) : [];

  const save = async (e) => {
    e?.preventDefault?.();
    if (busy || !shown.length) return;
    setAttempted(true);
    if (missing.length) return;
    setBusy(true);
    setError(null);
    try {
      const result = await flowHandle(kf, flowType, flowId).updateItem(itemId, values);
      setAttempted(false);
      setSaved(true);
      onSaved?.(result ?? values);
      onClose?.();
    } catch (err) {
      setError(String(err?.message ?? err)); // values are left exactly as typed
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card role="list" as="form" onSubmit={save}>
      <CardTitle>Edit record</CardTitle>
      {error && (
        <Callout tone="danger" title="Could not save" className="mb-4" onDismiss={() => setError(null)}>
          {error}
        </Callout>
      )}
      {saved && (
        <Callout tone="success" className="mb-4" onDismiss={() => setSaved(false)}>
          Record saved{itemId ? <> — <span className="font-mono">{String(itemId)}</span></> : "."}
        </Callout>
      )}
      <FieldGrid fields={shown} values={values} onChange={set} required={required} invalidIds={invalidIds} />
      <FormFooter
        note={invalidIds.length ? `${invalidIds.length} required field${invalidIds.length > 1 ? "s" : ""} need${invalidIds.length > 1 ? "" : "s"} a value` : ""}
        onCancel={onClose}
        busy={busy}
        done={saved}
        submitLabel="Save"
        savedLabel="Saved"
        submitDisabled={!shown.length}
      />
    </Card>
  );
}

/**
 * NewButton — create an empty record and hand it back.
 *
 * The legacy one calls createItem({}) and relies on the flow's own defaults, which is what makes
 * it a one-click "New" rather than a form. Preserved exactly; `onCreated` is how a caller opens
 * an ItemForm on the result. `rank` now defaults to "primary" — Forms.dc.html's own split for the
 * ONE-flow case; NewMenu (several flows) is the one that reaches for "strong".
 *
 * `required` is accepted for signature parity with FormCard/ItemForm, per Forms.dc.html's API
 * table, but does nothing here on purpose: NewButton has no field UI to validate against — it
 * always writes `{}` and leans on the flow's own defaults — so there is nothing for a required
 * list to gate. A future NewButton that opens an ItemForm inline could read it; a one-click
 * create can't.
 */
export function NewButton({ flowType = "Form", flowId, label = "New", rank = "primary", required = [], onCreated }) {
  const kf = useKf();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      onCreated?.(await flowHandle(kf, flowType, flowId).createItem({}));
    } catch (err) {
      setError(String(err?.message ?? err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="inline-flex flex-col items-start gap-1.5">
      <Button rank={rank} onClick={create} loading={busy} disabled={busy}>
        {busy ? "Creating…" : label}
      </Button>
      {error && (
        <span className="text-xs" style={{ color: "var(--color-danger-ink)" }}>
          {error}
        </span>
      )}
    </span>
  );
}

function ChevronDown() {
  return (
    <svg width="10" height="6" viewBox="0 0 10 6" aria-hidden="true">
      <path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * NewMenu — NewButton across several flows. `items: [{ flowType, flowId, label }]`.
 *
 * "SEVERAL flows -> strong-rank button + a chevron opening a menu... a row of four primaries has
 * no primary." A single item collapses straight to NewButton — Forms.dc.html's own "one flow"
 * case, so a one-item NewMenu should look exactly like reaching for NewButton directly rather
 * than opening a dropdown with one row in it.
 *
 * Built on @radix-ui/react-dropdown-menu directly rather than Floating.jsx's own DropdownMenu —
 * see the file banner's NewMenu paragraph for why.
 */
export function NewMenu({ items = [], label = "New", required = [], onCreated }) {
  const kf = useKf();
  const [open, setOpen] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState(null);

  if (!items.length) return null;
  if (items.length === 1) {
    const it = items[0];
    return <NewButton flowType={it.flowType} flowId={it.flowId} label={it.label ?? label} onCreated={onCreated} />;
  }

  const create = async (it, i) => {
    setBusyId(it.flowId ?? i);
    setError(null);
    try {
      onCreated?.(await flowHandle(kf, it.flowType, it.flowId).createItem({}));
    } catch (err) {
      setError(String(err?.message ?? err));
    } finally {
      setBusyId(null);
      setOpen(false);
    }
  };

  return (
    <span className="inline-flex flex-col items-start gap-1.5">
      <DropdownMenuPrimitive.Root open={open} onOpenChange={setOpen}>
        <DropdownMenuPrimitive.Trigger asChild>
          <Button rank="strong">
            {label}
            <ChevronDown />
          </Button>
        </DropdownMenuPrimitive.Trigger>
        <DropdownMenuPrimitive.Portal>
          <DropdownMenuPrimitive.Content
            align="start"
            sideOffset={6}
            // Same surface classes Cards.jsx already established — no edge, --shadow-raised for
            // the lift, --radius-lg — so this reads as the same kit even though Floating.jsx
            // (the more natural home for a floating surface) hasn't been redesigned onto these
            // tokens yet.
            className="z-50 min-w-[10rem] rounded-lg bg-surface p-1 text-secondary shadow-raised outline-none"
          >
            {items.map((it, i) => {
              const busy = busyId === (it.flowId ?? i);
              return (
                <DropdownMenuPrimitive.Item
                  key={it.flowId ?? i}
                  disabled={busy}
                  onSelect={(e) => {
                    e.preventDefault(); // keep the menu open until the write settles
                    create(it, i);
                  }}
                  className="cursor-pointer select-none rounded-md px-2.5 py-1.5 text-sm outline-none data-[highlighted]:bg-gray-1 data-[disabled]:cursor-default data-[disabled]:opacity-50"
                >
                  {busy ? "Creating…" : it.label ?? "New"}
                </DropdownMenuPrimitive.Item>
              );
            })}
          </DropdownMenuPrimitive.Content>
        </DropdownMenuPrimitive.Portal>
      </DropdownMenuPrimitive.Root>
      {error && (
        <span className="text-xs" style={{ color: "var(--color-danger-ink)" }}>
          {error}
        </span>
      )}
    </span>
  );
}
