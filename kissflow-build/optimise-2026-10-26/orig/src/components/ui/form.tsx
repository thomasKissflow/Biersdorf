import { Loader2, Paperclip, Upload } from "lucide-react";
import { createContext, useContext, useId, useState, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from "react";
import { cx } from "./primitives";

// The enclosing Field's label. A control inside a Field that has no name of its own (aria-label,
// aria-labelledby, or an id a <label htmlFor> could point at) is named by it and marked required with it, so a
// screen reader announces "Section, combo box, required, K4.3 …" instead of only the value.
const FieldLabelContext = createContext<{ labelId: string; required?: boolean } | undefined>(undefined);
export const useFieldLabel = () => useContext(FieldLabelContext);

function useFieldA11y(own: { id?: string; "aria-label"?: string; "aria-labelledby"?: string; "aria-required"?: boolean | "true" | "false" }) {
  const field = useFieldLabel();
  if (!field || own.id || own["aria-label"] || own["aria-labelledby"]) return {};
  return { "aria-labelledby": field.labelId, "aria-required": own["aria-required"] ?? (field.required || undefined) };
}

export function Field({ label, hint, error, required, children, aside }: { label: ReactNode; hint?: ReactNode; error?: ReactNode; required?: boolean; children: ReactNode; aside?: ReactNode }) {
  const labelId = useId();
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <label id={labelId} className="text-[13px] font-medium text-ink">
          {label}
          {/* the asterisk is visual only; the control inside announces "required" through aria-required */}
          {required && (
            <span aria-hidden className="ml-0.5 text-bad">
              *
            </span>
          )}
        </label>
        {aside}
      </div>
      <FieldLabelContext.Provider value={{ labelId, required }}>{children}</FieldLabelContext.Provider>
      {hint && !error && <p className="text-xs text-ink-3">{hint}</p>}
      {error && <p className="text-xs font-medium text-bad">{error}</p>}
    </div>
  );
}

// Border colour is chosen per state (see borderCls), never stacked: cx is plain clsx, so two border colours
// would be decided by CSS order, and the red invalid border lost to the grey default.
const inputCls = "w-full rounded-lg border bg-surface px-3 text-[14px] text-ink placeholder:text-ink-3 transition-colors focus:outline-none focus:ring-2 focus:ring-brand/25 disabled:bg-surface-2 disabled:text-ink-3";

const borderCls = (invalid?: boolean) => (invalid ? "border-bad focus:border-bad focus:ring-bad/20" : "border-line-strong focus:border-brand");

export function TextInput({ className, invalid, ...rest }: InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  const a11y = useFieldA11y(rest);
  return <input aria-invalid={invalid || undefined} {...a11y} className={cx(inputCls, borderCls(invalid), "h-9", className)} {...rest} />;
}

export function TextArea({ className, invalid, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }) {
  const a11y = useFieldA11y(rest);
  return <textarea aria-invalid={invalid || undefined} {...a11y} className={cx(inputCls, borderCls(invalid), "min-h-[76px] py-2", className)} {...rest} />;
}

export function Checkbox({ checked, onChange, label, description, disabled, "data-testid": testId }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; description?: ReactNode; disabled?: boolean; "data-testid"?: string }) {
  return (
    <label className={cx("flex cursor-pointer items-start gap-2.5 rounded-lg px-1 py-1", disabled && "cursor-not-allowed opacity-60")}>
      <input type="checkbox" data-testid={testId} disabled={disabled} checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--brand)]" />
      <span>
        <span className="text-[13.5px] text-ink">{label}</span>
        {description && <span className="block text-xs text-ink-3">{description}</span>}
      </span>
    </label>
  );
}

/** Segmented Yes/No (or any small set) — larger targets than radios. */
export function Segmented<T extends string | boolean>({ value, onChange, options, disabled }: { value: T | undefined; onChange: (v: T) => void; options: { value: T; label: string }[]; disabled?: boolean }) {
  return (
    // shrink-0: beside a long label in a flex row it keeps its natural width (the label wraps instead); it only wraps
    // its options when the container itself is narrower than the control.
    <div className="inline-flex max-w-full shrink-0 flex-wrap rounded-lg border border-line-strong bg-surface-2 p-0.5">
      {options.map((o) => (
        <button
          type="button"
          key={String(o.value)}
          disabled={disabled}
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          className={cx("h-8 min-w-16 rounded-md px-3 text-[13px] font-medium whitespace-nowrap transition-colors disabled:cursor-not-allowed", value === o.value ? "bg-surface text-ink shadow-card" : "text-ink-3 hover:text-ink")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({ checked, onChange, label, "data-testid": testId }: { checked: boolean; onChange: (v: boolean) => void; label?: ReactNode; "data-testid"?: string }) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2.5">
      <button type="button" role="switch" data-testid={testId} aria-checked={checked} onClick={() => onChange(!checked)} className={cx("relative inline-block h-5 w-9 shrink-0 rounded-full p-0 transition-colors", checked ? "bg-brand" : "bg-line-strong")}>
        <span aria-hidden className={cx("absolute top-0.5 left-0 h-4 w-4 rounded-full bg-white shadow-card transition-transform", checked ? "translate-x-[18px]" : "translate-x-0.5")} />
      </button>
      {label && <span className="text-[13.5px] text-ink">{label}</span>}
    </label>
  );
}

export function ChipMulti({ value, onChange, options, disabled }: { value: string[]; onChange: (v: string[]) => void; options: { value: string; label: string }[]; disabled?: boolean }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const on = value.includes(o.value);
        return (
          <button
            type="button"
            key={o.value}
            disabled={disabled}
            aria-pressed={on}
            onClick={() => onChange(on ? value.filter((x) => x !== o.value) : [...value, o.value])}
            className={cx("rounded-full border px-3 py-1 text-[13px] transition-colors disabled:cursor-not-allowed", on ? "border-brand bg-brand-soft font-medium text-brand" : "border-line-strong bg-surface text-ink-2 hover:border-ink-3")}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * A file box. In the prototype no file leaves the browser (we record the name, upload date and who uploaded it); the
 * live portal stores it in Kissflow. Documents are referenced by file name and upload date (spec §5), so `version` is
 * accepted for old callers but never shown. When `onFile` returns a promise (an upload), the box shows
 * "Uploading <file>…" with a spinner and takes no other file until it settles.
 */
export function FileDrop({ onFile, current, disabled, accept = ".pdf" }: { onFile: (name: string, sizeKb: number, file: File) => void | Promise<unknown>; current?: { name: string; version?: number; meta?: ReactNode }; disabled?: boolean; accept?: string }) {
  const [busy, setBusy] = useState<string | null>(null);
  const pick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = ""; // the same file can be picked again after a failed upload
    if (!f) return;
    const r = onFile(f.name, Math.max(1, Math.round(f.size / 1024)), f);
    if (r && typeof (r as Promise<unknown>).then === "function") {
      setBusy(f.name);
      void Promise.resolve(r)
        .catch(() => undefined)
        .finally(() => setBusy(null));
    }
  };
  if (busy) {
    return (
      <div role="status" aria-live="polite" aria-busy="true" data-testid="file-uploading" className="flex items-center gap-2 rounded-lg border border-dashed border-brand/50 bg-brand-soft/40 px-3 py-2.5 text-[13px] text-ink-2">
        <Loader2 size={15} className="shrink-0 animate-spin text-brand" aria-hidden="true" />
        <span className="min-w-0 [overflow-wrap:anywhere]">
          Uploading <span className="font-medium text-ink">{busy}</span>…
        </span>
      </div>
    );
  }
  return (
    <div className={cx("rounded-lg border border-dashed px-3 py-2.5", current ? "border-line bg-surface-2" : "border-line-strong")}>
      {current ? (
        // On phones the details drop to their own line, so neither the file name nor the details get cut short.
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[13px]">
          <Paperclip size={14} className="shrink-0 text-ink-3" />
          <span className="min-w-0 font-medium text-ink max-sm:flex-1 max-sm:[overflow-wrap:anywhere] sm:truncate" title={current.name}>
            {current.name}
          </span>
          {current.meta && <span className="min-w-0 text-xs text-ink-3 max-sm:order-last max-sm:basis-full max-sm:pl-[22px] sm:truncate">{current.meta}</span>}
          {!disabled && (
            <label className="ml-auto shrink-0 cursor-pointer text-[12.5px] font-medium text-brand hover:underline">
              Replace
              <input type="file" accept={accept} className="sr-only" onChange={pick} />
            </label>
          )}
        </div>
      ) : (
        <label className={cx("flex cursor-pointer items-center gap-2 text-[13px] text-ink-2", disabled && "pointer-events-none opacity-60")}>
          <Upload size={15} className="text-brand" />
          <span>
            <span className="font-medium text-brand">Upload a file</span> or drop it here (PDF)
          </span>
          <input type="file" accept={accept} className="sr-only" onChange={pick} />
        </label>
      )}
    </div>
  );
}
