// Portal-wide context: the SDK handle, the signed-in user's portal role, the environment, and the Admin's demo-mode
// flag. The demo flag is a per-browser convenience (localStorage, guarded): it never changes what Kissflow allows.
// The role is state (Thomas, 20 Oct): it starts as the first portal role the user holds (Admin first: portal.ts
// portalRoleOf). In the Development sandbox (src/shell/env.ts) the top bar's role switcher can act in another held role
// (setRole: the screens only), or move the user into another role for real (devRoles: kf.app.switchRole; the user
// leaves their current role(s)); the roles are then read again from getRoles().currentRoles and the UI follows. Either
// way the UI goes to the new role's landing page. Production has no switcher. Must sit inside the router.
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import type { DevRoles, RoleRef } from "@/shell/DevTopBar";
import { envOf, type AppEnv } from "@/shell/env";
import { createClient, type PortalClient } from "./data/client";
import type { Kf } from "./kf/sdk";
import { heldPortalRoles, type HeldRole, type PortalRole } from "./kf/portal";

const DEMO_KEY = "ciq-portal-demo";

/** Where each role starts. */
export const LANDING: Record<PortalRole, string> = { admin: "/admin", supplier: "/portal", none: "/" };

export interface PortalMode {
  kf: Kf | null;
  /** The role the UI acts in: a portal role the user holds, or "none". */
  role: PortalRole;
  /** The portal roles the user holds now (Admin first). */
  held: HeldRole[];
  /** The user's Kissflow roles now: the handshake's, or getRoles' after a dev role switch. */
  roles: RoleRef[];
  /** Act in another held role (screens only), and go to its landing page. A role not held is ignored. */
  setRole(r: HeldRole): void;
  /** "dev" only in the Development sandbox; outside Kissflow (the offline demo) it is "prod": no top bar. */
  env: AppEnv;
  /** Only in dev, and only when the SDK offers getRoles and switchRole. */
  devRoles?: DevRoles;
  readyMs: number;
  demo: boolean;
  setDemo(v: boolean): void;
  /** All Kissflow calls go through this client; null outside Kissflow. */
  client: PortalClient | null;
}

const ModeContext = createContext<PortalMode | null>(null);

function readDemo(): boolean {
  try {
    return localStorage.getItem(DEMO_KEY) === "1";
  } catch {
    return false;
  }
}

/** Roles as the handshake (AppRoles) or getRoles answers them, tolerant of missing fields. */
const roleRefs = (rs: { _id?: unknown; Name?: unknown }[] | undefined): RoleRef[] =>
  (Array.isArray(rs) ? rs : []).map((r) => ({ id: String(r?._id ?? ""), name: String(r?.Name ?? "") })).filter((r) => r.id || r.name);

/** The SDK's dev-only role switch (index.d.ts: app.switchRole, SWITCH_ROLE), which the portal's facade does not type. */
type DevKfApp = Kf["app"] & { switchRole?(args: { roleId?: string; roleName?: string }): Promise<unknown> };

export function PortalModeProvider({ kf, readyMs, children }: { kf: Kf | null; readyMs: number; children: ReactNode }) {
  // a ref: useNavigate's function changes with every page, which would rebuild devRoles (and re-list the roles)
  const navigate = useNavigate();
  const nav = useRef(navigate);
  nav.current = navigate;
  const [demo, setDemoState] = useState<boolean>(readDemo);
  const setDemo = useCallback((v: boolean) => {
    setDemoState(v);
    try {
      localStorage.setItem(DEMO_KEY, v ? "1" : "0");
    } catch {
      /* storage unavailable: the flag lasts for this page only */
    }
  }, []);
  const [roles, setRoles] = useState<RoleRef[]>(() => roleRefs(kf?.user?.AppRoles));
  const [picked, setPicked] = useState<HeldRole | undefined>(undefined);
  const held = useMemo(() => (kf ? heldPortalRoles(roles) : []), [kf, roles]);
  const role: PortalRole = picked && held.includes(picked) ? picked : (held[0] ?? "none");
  const setRole = useCallback(
    (r: HeldRole) => {
      if (!held.includes(r)) return;
      setPicked(r);
      nav.current(LANDING[r]);
    },
    [held],
  );
  const env = useMemo(() => envOf(kf?.account?._id), [kf]);
  // dev only: the SDK's real role switch; both calls answer only in a Development account
  const devRoles = useMemo<DevRoles | undefined>(() => {
    if (!kf || env !== "dev") return undefined;
    const app: DevKfApp = kf.app;
    const getRoles = app.getRoles?.bind(app);
    const switchRole = app.switchRole?.bind(app);
    if (!getRoles || !switchRole) return undefined;
    const list = async () => {
      const got = await getRoles();
      const all = roleRefs(got?.roles);
      // currentRoles may carry ids only: take the names from the full list
      const current = roleRefs(got?.currentRoles).map((r) => ({ id: r.id, name: r.name || all.find((a) => a.id === r.id)?.name || "" }));
      return { all, current };
    };
    return {
      list,
      async switchTo(target) {
        await switchRole(target.id ? { roleId: target.id } : { roleName: target.name });
        // the switch is done: when the roles can't be read again, or come back without the target yet (Kissflow applies
        // the switch asynchronously), act in the target role, as switchRole moves the user into exactly that role
        const read = await list().catch(() => null);
        const has = (rs: RoleRef[]) => rs.some((r) => (target.id && r.id === target.id) || (!!target.name && r.name === target.name));
        const current = read && has(read.current) ? read.current : [target];
        // the new role and its landing page in one render, so the old role's screens never show at the new URL
        setPicked(undefined);
        setRoles(current);
        nav.current(LANDING[heldPortalRoles(current)[0] ?? "none"]);
      },
    };
  }, [kf, env]);
  const client = useMemo(() => (kf ? createClient(kf) : null), [kf]);
  const value = useMemo<PortalMode>(
    () => ({ kf, role, held, roles, setRole, env, ...(devRoles ? { devRoles } : {}), readyMs, demo, setDemo, client }),
    [kf, role, held, roles, setRole, env, devRoles, readyMs, demo, setDemo, client],
  );
  return <ModeContext.Provider value={value}>{children}</ModeContext.Provider>;
}

/** The mode, or null outside the provider (pages that also render on their own, e.g. in tests). */
export function useOptionalPortalMode(): PortalMode | null {
  return useContext(ModeContext);
}

export function usePortalMode(): PortalMode {
  const v = useContext(ModeContext);
  if (!v) throw new Error("usePortalMode outside PortalModeProvider");
  return v;
}

/** For tests: a mode without Kissflow calls. */
export const PortalModeContext = ModeContext;
