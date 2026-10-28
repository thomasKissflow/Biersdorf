// "View as" (WORKBENCH-DESIGN.md §5.4; WB-8): a UI-only lens shown when kf.app.getRoles() resolves. The probe is
// [unverified] as a builder signal: getRoles may answer any user in a Development account (sdk.d.ts L1297) and a
// builder-permission staff login passes it too (master L571). That is acceptable because the lens can only NARROW
// (roles, nav, tasks and the read rung), never widen. switchRole is NEVER called (ground rule 8).
// Inside Kissflow the host shows the Beiersdorf header, so the switcher is a small dock fixed at the top right: collapsed
// to an eye tab (plus the active lens), it opens on hover or keyboard focus.
import { Eye } from "lucide-react";
import { useState } from "react";
import { Select } from "@/components/ui/select";
import { cx } from "@/components/ui/primitives";
import type { RoleIr } from "../schema";
import { LENS_NOTE } from "../domain/labels";
import { byPersonaOrder, roleName, uiRoles } from "./app";
import type { Kf, KfRolesAnswer } from "./sdk";

export const LENS_KEY = "wb:viewAs";
export const BUILDER_PROBE_MS = 5000;

/** Resolves with getRoles' answer within 5 s, or null (no switcher, no lens). Never throws. */
export async function probeBuilder(kf: Kf, ms = BUILDER_PROBE_MS): Promise<KfRolesAnswer | null> {
  try {
    const getRoles = kf.app.getRoles;
    if (typeof getRoles !== "function") return null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<null>((r) => {
      timer = setTimeout(() => r(null), ms);
    });
    const got = await Promise.race([getRoles.call(kf.app), timeout]).finally(() => clearTimeout(timer));
    if (!got || typeof got !== "object") return null;
    return { roles: Array.isArray(got.roles) ? got.roles : [], currentRoles: Array.isArray(got.currentRoles) ? got.currentRoles : [] };
  } catch {
    return null;
  }
}

/** The remembered lens (sessionStorage, guarded). Only a role the user holds is ever returned. */
export function readLens(held: RoleIr[]): RoleIr | null {
  try {
    const v = globalThis.sessionStorage?.getItem(LENS_KEY) as RoleIr | null;
    return v && uiRoles(held).includes(v) ? v : null;
  } catch {
    return null;
  }
}
export function writeLens(r: RoleIr | null): void {
  try {
    if (r) globalThis.sessionStorage?.setItem(LENS_KEY, r);
    else globalThis.sessionStorage?.removeItem(LENS_KEY);
  } catch {
    /* storage blocked: the lens lasts for this page only */
  }
}

/** The select: "All my roles" or one CIQ role the user HOLDS (getRoles().roles is never offered). */
export function ViewAsSelect({ held, lens, onChange }: { held: RoleIr[]; lens: RoleIr | null; onChange(r: RoleIr | null): void }) {
  const options = byPersonaOrder(uiRoles(held));
  return (
    <label className="flex flex-col gap-1 text-[12.5px] font-medium text-ink-2">
      <span>View as</span>
      <Select aria-label="View as" value={lens ?? ""} onChange={(e) => onChange((e.target.value || null) as RoleIr | null)} className="w-full">
        <option value="">All my roles</option>
        {options.map((r) => (
          <option key={r} value={r}>
            {roleName(r)}
          </option>
        ))}
      </Select>
    </label>
  );
}

/**
 * The builder-only dock (top right). Collapsed: an eye tab, with "Viewing as <role>" while a lens is on. Hover or focus
 * inside opens the panel (the select and what the lens does); Escape, leaving or a click elsewhere closes it. The
 * collapsed panel stays in the tab order (visually hidden), so Tab reaches the select and opens the dock.
 */
export function ViewAsDock({ held, lens, onChange }: { held: RoleIr[]; lens: RoleIr | null; onChange(r: RoleIr | null): void }) {
  const [hover, setHover] = useState(false);
  const [focus, setFocus] = useState(false);
  const open = hover || focus;
  return (
    <div
      role="region"
      aria-label="Preview a role"
      data-testid="wb-viewas"
      data-open={open || undefined}
      className="fixed top-0 right-3 z-40 flex flex-col items-end"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocus={() => setFocus(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocus(false);
      }}
      onKeyDown={(e) => {
        if (e.key !== "Escape") return;
        setHover(false);
        setFocus(false);
        if (e.target instanceof HTMLElement) e.target.blur();
      }}
    >
      <div title={LENS_NOTE} className={cx("flex h-6 items-center gap-1.5 rounded-b-md border border-t-0 px-2 text-[12px] shadow-sm", lens ? "border-brand/40 bg-brand-soft text-brand" : "border-line bg-surface text-ink-3")}>
        <Eye size={14} aria-hidden />
        {lens ? (
          <span data-testid="wb-lens-badge" className="whitespace-nowrap">
            Viewing as <strong className="font-semibold">{roleName(lens)}</strong>
          </span>
        ) : (
          <span className="sr-only">View as</span>
        )}
      </div>
      <div className={open ? "mt-1 w-72 rounded-lg border border-line bg-surface p-3 shadow-lg" : "sr-only"} data-testid="wb-viewas-panel">
        <ViewAsSelect held={held} lens={lens} onChange={onChange} />
        <p className="mt-2 text-[12px] leading-snug text-ink-3">{LENS_NOTE}</p>
      </div>
    </div>
  );
}
