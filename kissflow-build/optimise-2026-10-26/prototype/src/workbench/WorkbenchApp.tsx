// CIQ Workbench root (WORKBENCH-DESIGN.md §5.1). Boot states, copied from the portal's PortalApp:
//   connecting → BrandLoader · outside → "Not running inside Kissflow" (no demo mode) · failed → "Couldn't connect" +
//   Try again · no-access → the user's role names, no item reads · live → the shell.
import { useCallback, useEffect, useMemo, useState } from "react";
import { HashRouter, useRoutes } from "react-router-dom";
import { BrandLoader } from "./BrandLoader";
import { WorkbenchData } from "./data/hooks";
import { heldRolesOf, uiRoles } from "./kf/app";
import { connectKf, type Kf } from "./kf/sdk";
import { ConnectFailed } from "./shell/ConnectFailed";
import { NoAccess } from "./shell/NoAccess";
import { Offline } from "./shell/Offline";
import { buildRoutes } from "./shell/routes";
import { ThemeProvider } from "./theme";

type Boot = { state: "connecting" } | { state: "live"; kf: Kf; readyMs: number } | { state: "outside" } | { state: "failed"; detail: string };

function Routes() {
  const routes = useMemo(() => buildRoutes(), []);
  return useRoutes(routes);
}

function Live({ kf, readyMs }: { kf: Kf; readyMs: number }) {
  const held = useMemo(() => heldRolesOf(kf.user), [kf]);
  if (!uiRoles(held.held).length) return <NoAccess kf={kf} />;
  return (
    <WorkbenchData kf={kf} readyMs={readyMs}>
      <HashRouter>
        <Routes />
      </HashRouter>
    </WorkbenchData>
  );
}

function Boot() {
  const [boot, setBoot] = useState<Boot>({ state: "connecting" });
  const connect = useCallback(() => {
    setBoot({ state: "connecting" });
    void connectKf().then((c) => setBoot(c.kf ? { state: "live", kf: c.kf, readyMs: c.ms } : c.reason === "outside" ? { state: "outside" } : { state: "failed", detail: c.detail }));
  }, []);
  useEffect(connect, [connect]);
  if (boot.state === "connecting") return <BrandLoader label="Connecting to Kissflow…" />;
  if (boot.state === "outside") return <Offline />;
  if (boot.state === "failed") return <ConnectFailed detail={boot.detail} onRetry={connect} />;
  return <Live kf={boot.kf} readyMs={boot.readyMs} />;
}

export function WorkbenchApp() {
  return (
    <ThemeProvider>
      <Boot />
    </ThemeProvider>
  );
}
