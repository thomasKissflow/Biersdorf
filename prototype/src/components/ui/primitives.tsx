import clsx from "clsx";
import { useContext, createContext, Children, forwardRef, type ButtonHTMLAttributes, type HTMLAttributes, type ReactNode } from "react";

export const cx = clsx;

type Variant = "primary" | "secondary" | "ghost" | "danger" | "subtle";
type Size = "sm" | "md";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
  iconRight?: ReactNode;
}

const variants: Record<Variant, string> = {
  primary: "bg-brand text-brand-ink hover:bg-brand-hover shadow-card",
  secondary: "bg-surface text-ink border border-line-strong hover:bg-surface-2 shadow-card",
  ghost: "text-ink-2 hover:bg-surface-2 hover:text-ink",
  subtle: "bg-brand-soft text-brand hover:brightness-95",
  danger: "bg-bad text-brand-ink hover:brightness-95 shadow-card",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({ variant = "secondary", size = "md", icon, iconRight, className, children, ...rest }, ref) {
  // A plain-text label truncates instead of pushing the button past its container on narrow screens.
  const textOnly = Children.toArray(children).every((c) => typeof c === "string" || typeof c === "number");
  return (
    <button
      ref={ref}
      className={cx(
        "inline-flex max-w-full items-center justify-center gap-1.5 rounded-lg font-medium whitespace-nowrap transition-[background,color,filter,transform] duration-150 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50",
        size === "sm" ? "h-8 px-2.5 text-[13px]" : "h-9 px-3.5 text-sm",
        variants[variant],
        className,
      )}
      {...rest}
    >
      {icon}
      {textOnly && children !== undefined && children !== null && children !== "" ? <span className="truncate">{children}</span> : children}
      {iconRight}
    </button>
  );
});

export function IconButton({ label, children, className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button aria-label={label} title={label} className={cx("inline-flex h-8 w-8 items-center justify-center rounded-lg text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink", className)} {...rest}>
      {children}
    </button>
  );
}

export type Tone = "neutral" | "brand" | "ok" | "warn" | "bad" | "info" | "violet";

const tones: Record<Tone, string> = {
  neutral: "bg-surface-3 text-ink-2",
  brand: "bg-brand-soft text-brand",
  ok: "bg-ok-soft text-ok",
  warn: "bg-warn-soft text-[color-mix(in_oklch,var(--warn)_70%,var(--ink))]",
  bad: "bg-bad-soft text-bad",
  info: "bg-info-soft text-info",
  violet: "bg-violet-soft text-violet",
};

export const toneDot: Record<Tone, string> = {
  neutral: "bg-ink-3",
  brand: "bg-brand",
  ok: "bg-ok",
  warn: "bg-warn",
  bad: "bg-bad",
  info: "bg-info",
  violet: "bg-violet",
};

/** Status pill: always carries text, never colour alone. */
export function Badge({ tone = "neutral", dot, children, className, "data-testid": testId }: { tone?: Tone; dot?: boolean; children: ReactNode; className?: string; "data-testid"?: string }) {
  return (
    <span data-testid={testId} className={cx("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap", tones[tone], className)}>
      {dot && <span className={cx("h-1.5 w-1.5 rounded-full", toneDot[tone])} />}
      {children}
    </span>
  );
}

export function Card({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cx("rounded-card border border-line bg-surface shadow-card", className)} {...rest}>
      {children}
    </div>
  );
}

export function CardHeader({ title, subtitle, action, className }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cx("flex flex-wrap items-start justify-between gap-x-3 gap-y-2 border-b border-line px-4 py-3", className)}>
      <div className="min-w-0 flex-1 basis-[220px]">
        <h3 className="text-[15px] font-semibold text-ink">{title}</h3>
        {subtitle && <p className="mt-0.5 text-[13px] text-ink-3">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function Avatar({ initials, side = "internal", size = 28 }: { initials: string; side?: "internal" | "supplier"; size?: number }) {
  return (
    <span
      style={{ width: size, height: size, fontSize: size * 0.38 }}
      className={cx("inline-flex shrink-0 items-center justify-center rounded-full font-semibold", side === "supplier" ? "bg-violet-soft text-violet" : "bg-brand-soft text-brand")}
    >
      {initials}
    </span>
  );
}

export function Mono({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cx("font-mono text-[12.5px] tracking-tight whitespace-nowrap", className)}>{children}</span>;
}

export function Divider({ className }: { className?: string }) {
  return <hr className={cx("border-line", className)} />;
}

export function SectionTitle({ children, hint, action }: { children: ReactNode; hint?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3">
      <div>
        <h2 className="text-base font-semibold text-ink">{children}</h2>
        {hint && <p className="text-[13px] text-ink-3">{hint}</p>}
      </div>
      {action}
    </div>
  );
}

export function PageHeader({ title, subtitle, eyebrow, actions, children }: { title: ReactNode; subtitle?: ReactNode; eyebrow?: ReactNode; actions?: ReactNode; children?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && <div className="mb-1 text-xs font-semibold tracking-wide text-brand uppercase">{eyebrow}</div>}
        <h1 className="text-[22px] leading-tight font-semibold tracking-tight text-ink">{title}</h1>
        {subtitle && <p className="mt-1 max-w-3xl text-[13.5px] text-ink-2">{subtitle}</p>}
        {children}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/**
 * True where prototype-only notes and controls are hidden: the live supplier portal, the client call view, and the
 * prototype itself while the demo menu's "Show prototype notes" is off (the default; layout/demoNotes.tsx).
 */
export const ProductionContext = createContext(false);
export const useProduction = () => useContext(ProductionContext);

/** Honest label for anything the prototype shows but does not really do. Shown only with "Show prototype notes". */
export function DemoNote({ children }: { children: ReactNode }) {
  if (useContext(ProductionContext)) return null;
  return <span className="inline-flex items-center gap-1 rounded-md border border-dashed border-line-strong px-1.5 py-0.5 text-[11px] text-ink-3">Prototype: {children}</span>;
}
