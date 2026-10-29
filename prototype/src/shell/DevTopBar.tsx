// The Development sandbox's top bar (Thomas, 20 Oct), shared by the app and portal UIs: a "Development" badge, then
// (right) whatever the UI passes: its role switcher and person chip. Production renders no top bar at all.
// Also: the role switcher. It lists the UI's roles; a role the user already holds switches the screens only (onHeld),
// any other role is a REAL Kissflow role switch (devRoles.switchTo → kf.app.switchRole: the user leaves their current
// role(s) and joins the chosen one), after a one-line confirmation that names the roles they leave.
// On a phone (< 768 px, Thomas 30 Oct) the bar is compact: one 48 px row inside the phone header (PhoneChrome.tsx),
// "Dev" for the badge, the switcher's label cut shorter, 44 px targets.
// Test ids: dev-top-bar (data-compact on a phone), role-switcher (data-persona), role-menu, switch-role-<key>,
// switch-role-confirm-box, switch-role-confirm, role-switch-error.
import { ArrowLeftRight, Check, ChevronDown } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { cx } from "@/components/ui";
import { useIsPhone } from "./useLayoutMode";

export function DevTopBar({ children }: { children: ReactNode }) {
  if (useIsPhone())
    return (
      // inside the phone header's sticky block, which carries data-app-header for the toasts
      <div data-testid="dev-top-bar" data-compact="true" className="flex h-12 items-center gap-2 border-b border-line pr-[max(0.75rem,env(safe-area-inset-right))] pl-[max(0.75rem,env(safe-area-inset-left))]">
        <span className="shrink-0 rounded-md bg-warn-soft px-2 py-0.5 text-[11.5px] font-semibold text-warn" title="Development sandbox" aria-label="Development sandbox">
          Dev
        </span>
        <div className="ml-auto flex min-w-0 items-center gap-1.5">{children}</div>
      </div>
    );
  return (
    <header data-app-header data-testid="dev-top-bar" className="sticky top-0 z-30 border-b border-line bg-surface/90 backdrop-blur">
      <div className="flex h-14 items-center gap-3 px-4 lg:px-8">
        <span className="rounded-md bg-warn-soft px-2 py-0.5 text-[11.5px] font-semibold text-warn" title="Development sandbox">
          Development
        </span>
        <div className="ml-auto flex items-center gap-2">{children}</div>
      </div>
    </header>
  );
}

/** A Kissflow role as getRoles names it. */
export interface RoleRef {
  id: string;
  name: string;
}

/** The SDK's dev-only role calls (kf.app.getRoles / switchRole), as a UI wires them. */
export interface DevRoles {
  /** Every role and the ones the user holds now. Rejects outside a Development account. */
  list(): Promise<{ all: RoleRef[]; current: RoleRef[] }>;
  /** switchRole, then whatever the UI needs to act in the new role; resolves when done. */
  switchTo(role: RoleRef): Promise<void>;
}

export interface SwitchOption<K extends string> {
  key: K;
  label: string;
  /** The role behind the option, used when getRoles did not answer (or does not list it). */
  role: RoleRef;
  /** Matches a role from getRoles to this option (by id first, then name). */
  matches?(r: RoleRef): boolean;
}

/** Closes a popover on an outside click or Escape. */
export function useDismiss(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && close();
    const k = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("mousedown", h);
    window.addEventListener("keydown", k);
    return () => {
      window.removeEventListener("mousedown", h);
      window.removeEventListener("keydown", k);
    };
  }, [open, close]);
  return ref;
}

export function RoleSwitcher<K extends string>({
  options,
  current,
  currentLabel,
  held,
  onHeld,
  devRoles,
  onSwitched,
  heldRoleNames = [],
  note = "Development only. A role you hold switches the screens; any other role switches your Kissflow role.",
}: {
  options: SwitchOption<K>[];
  current: K;
  currentLabel: string;
  held: K[];
  onHeld(key: K): void;
  devRoles?: DevRoles;
  /** After a real switch (e.g. go to the new role's landing page). */
  onSwitched?(key: K): void;
  /** The roles the user holds now, named in the confirmation when getRoles has not answered. */
  heldRoleNames?: string[];
  note?: string;
}) {
  const [open, setOpen] = useState(false);
  const [roles, setRoles] = useState<{ all: RoleRef[]; current: RoleRef[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<K | null>(null);
  const [busy, setBusy] = useState(false);
  const close = useCallback(() => {
    if (busy) return;
    setOpen(false);
    setConfirm(null);
  }, [busy]);
  const ref = useDismiss(open, close);
  const phone = useIsPhone();

  useEffect(() => {
    if (!open || !devRoles) return;
    let live = true;
    setError(null);
    devRoles.list().then(
      (r) => live && setRoles(r),
      (e: unknown) => live && setError(e instanceof Error ? e.message : String(e)),
    );
    return () => {
      live = false;
    };
  }, [open, devRoles]);

  const roleOf = (o: SwitchOption<K>): RoleRef => roles?.all.find((r) => (o.matches ? o.matches(r) : r.id === o.role.id || r.name === o.role.name)) ?? o.role;
  const leaving = roles ? roles.current.map((r) => r.name || r.id).filter(Boolean) : heldRoleNames;

  const pick = (o: SwitchOption<K>) => {
    if (o.key === current) return close();
    if (held.includes(o.key)) {
      setOpen(false);
      onHeld(o.key);
      return;
    }
    if (!devRoles) return setError("Switching your Kissflow role is not available here.");
    setConfirm(o.key);
  };
  const doSwitch = async (o: SwitchOption<K>) => {
    if (!devRoles) return;
    setBusy(true);
    try {
      await devRoles.switchTo(roleOf(o));
      setOpen(false);
      setConfirm(null);
      onSwitched?.(o.key);
    } catch (e) {
      setError(`Kissflow did not switch your role: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div ref={ref} className={cx("relative", phone && "min-w-0")}>
      <button
        type="button"
        onClick={() => (open ? close() : setOpen(true))}
        data-testid="role-switcher"
        data-persona={current}
        className={cx("flex items-center gap-2 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[13px] text-ink shadow-card transition-colors hover:bg-surface-2", phone && "min-h-11 max-w-full")}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <ArrowLeftRight size={14} className={phone ? "shrink-0 text-ink-3" : "text-ink-3"} aria-hidden />
        <span className="hidden text-ink-3 sm:inline">Role:</span>
        <span className={phone ? "min-w-0 max-w-[150px] truncate font-medium" : "max-w-[200px] truncate font-medium"}>{currentLabel}</span>
        <ChevronDown size={14} className={cx(phone ? "shrink-0 text-ink-3 transition-transform" : "text-ink-3 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div
          role="menu"
          aria-label="Switch role"
          data-testid="role-menu"
          // a phone: the width of the screen, under the bar (the switcher sits left of the person chip there)
          className={phone ? "fixed inset-x-3 top-[calc(env(safe-area-inset-top,0px)+3.25rem)] z-50 flex max-h-[calc(100dvh-5rem)] flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-pop" : "absolute right-0 z-50 mt-2 flex max-h-[calc(100dvh-5rem)] w-[min(340px,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-pop"}
        >
          <div className="shrink-0 border-b border-line px-4 py-2.5 text-[12px] text-ink-3">{note}</div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-2 scrollbar-thin">
            {options.map((o) => {
              const isCurrent = o.key === current;
              const holds = held.includes(o.key);
              return (
                <div key={o.key}>
                  <button
                    type="button"
                    role="menuitemradio"
                    aria-checked={isCurrent}
                    disabled={busy}
                    onClick={() => pick(o)}
                    data-testid={`switch-role-${o.key}`}
                    className={cx("flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-[13px] transition-colors disabled:opacity-60", isCurrent ? "bg-brand-soft font-medium text-ink" : "text-ink-2 hover:bg-surface-2", phone && "min-h-11")}
                  >
                    <span className="min-w-0 flex-1 truncate">{o.label}</span>
                    {holds && !isCurrent && <span className="shrink-0 text-[11px] text-ink-3">held</span>}
                    <Check size={15} aria-hidden className={cx("shrink-0 text-brand", !isCurrent && "invisible")} />
                  </button>
                  {confirm === o.key && (
                    <div className="mx-2 my-1 rounded-lg border border-warn/30 bg-warn-soft px-3 py-2 text-[12.5px] text-ink" data-testid="switch-role-confirm-box">
                      <p>
                        Switch your Kissflow role to <b>{o.label}</b>?{leaving.length ? ` You leave: ${leaving.join(", ")}.` : ""}
                      </p>
                      <div className="mt-2 flex gap-2">
                        <button type="button" disabled={busy} onClick={() => void doSwitch(o)} data-testid="switch-role-confirm" className="rounded-md bg-brand px-2.5 py-1 text-[12.5px] font-semibold text-white disabled:opacity-60">
                          {busy ? "Switching…" : "Switch role"}
                        </button>
                        <button type="button" disabled={busy} onClick={() => setConfirm(null)} className="rounded-md px-2.5 py-1 text-[12.5px] text-ink-2 hover:bg-surface-2">
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {error && (
            <p role="alert" data-testid="role-switch-error" className="shrink-0 border-t border-line bg-bad-soft px-4 py-2 text-[12.5px] text-ink">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/** The height the shared screens' sticky panels leave for a top bar (features/* `--app-header-h`; their fallback is the
 *  prototype's own header). Set on a live shell's root: the dev top bar is 56 px + its 1 px border; production has none. */
export const headerOffsetStyle = (hasTopBar: boolean) => ({ "--app-header-h": hasTopBar ? "57px" : "0px" }) as CSSProperties;
