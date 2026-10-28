// CIQ Supplier Portal custom UI: root. Waits for the Kissflow SDK, then routes by the signed-in user's real
// portal role (kf.user.AppRoles; Admin first when both are held):
//   supplier → live supplier screens (portal items, real writes)
//   admin    → admin console, plus the supplier screens with demo data under /portal
//   none     → a plain "no access" page
// The role is state (mode.tsx): in the Development sandbox the top bar's role switcher acts in another held role, or
// switches the user's Kissflow role for real and the portal follows (Thomas, 20 Oct). Production has no switcher.
// Opened outside Kissflow it says so at once and offers only the demo preview, never pretending to be live. Inside
// Kissflow, a handshake that fails or gets no answer says so, with Retry.
import { Eye, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { HashRouter, Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { Button, Card, EmptyState } from "@/components/ui";
import { adminRoutes } from "./admin/adminRoutes";
import { BrandLoader } from "./BrandLoader";
import { LiveSupplierStore } from "./data/LiveSupplierStore";
import { DemoSupplierStore } from "./demo/DemoSupplierStore";
import { connectKf, type Kf } from "./kf/sdk";
import { PortalModeProvider, usePortalMode } from "./mode";
import { PortalSupplierShell } from "./supplier/PortalSupplierShell";
import { supplierChildRoutes } from "./supplier/supplierRoutes";
import { ThemeProvider } from "./theme";

type Boot = { state: "connecting" } | { state: "live"; kf: Kf; readyMs: number } | { state: "outside" } | { state: "failed"; detail: string };

const demoLayout = (
  <Route
    element={
      <DemoSupplierStore>
        <PortalSupplierShell demo />
      </DemoSupplierStore>
    }
  >
    {supplierChildRoutes(true)}
  </Route>
);

function Offline() {
  const navigate = useNavigate();
  return (
    <div className="mx-auto max-w-xl p-10">
      <Card>
        <EmptyState
          title="Not running inside Kissflow"
          action={
            <Button icon={<Eye size={15} />} onClick={() => navigate("/portal")}>
              Open demo preview
            </Button>
          }
        >
          This is the CIQ Supplier Portal interface. Open it from the portal in Kissflow to see your cases. The demo preview uses fictional data and sends nothing anywhere.
        </EmptyState>
      </Card>
    </div>
  );
}

function NoAccess() {
  const { kf, roles: held } = usePortalMode();
  const roles = held.map((r) => r.name).filter(Boolean);
  return (
    <div className="mx-auto max-w-xl p-10">
      <Card>
        <EmptyState title="No access to the supplier portal">
          Your account ({kf?.user?.Email || kf?.user?.Name}) has no Supplier or Admin role in this portal{roles.length ? ` (roles: ${roles.join(", ")})` : ""}. Ask your Beiersdorf contact to invite you.
        </EmptyState>
      </Card>
    </div>
  );
}

function SupplierApp() {
  const { kf, client } = usePortalMode();
  const me = useMemo(() => ({ id: kf!.user._id, name: kf!.user.Name, email: kf!.user.Email ?? "" }), [kf]);
  return (
    <LiveSupplierStore client={client!} me={me}>
      <Routes>
        <Route element={<PortalSupplierShell demo={false} />}>{supplierChildRoutes(false)}</Route>
        <Route path="*" element={<Navigate to="/portal" replace />} />
      </Routes>
    </LiveSupplierStore>
  );
}

function AdminApp() {
  const { demo } = usePortalMode();
  return (
    <Routes>
      {adminRoutes()}
      {demoLayout}
      <Route path="*" element={<Navigate to={demo ? "/portal" : "/admin"} replace />} />
    </Routes>
  );
}

function RoleRoutes() {
  const { kf, role } = usePortalMode();
  if (!kf)
    return (
      <Routes>
        {demoLayout}
        <Route path="*" element={<Offline />} />
      </Routes>
    );
  if (role === "supplier") return <SupplierApp />;
  if (role === "admin") return <AdminApp />;
  return <NoAccess />;
}

function ConnectFailed({ detail, onRetry }: { detail: string; onRetry: () => void }) {
  return (
    <div className="mx-auto max-w-xl p-10">
      <Card>
        <EmptyState
          title="Couldn't connect to Kissflow"
          action={
            <Button variant="primary" icon={<RefreshCw size={15} />} onClick={onRetry}>
              Try again
            </Button>
          }
        >
          {detail} If this keeps happening, reload the page.
        </EmptyState>
      </Card>
    </div>
  );
}

function Portal() {
  const [boot, setBoot] = useState<Boot>({ state: "connecting" });
  const connect = useCallback(() => {
    setBoot({ state: "connecting" });
    void connectKf().then((c) => setBoot(c.kf ? { state: "live", kf: c.kf, readyMs: c.ms } : c.reason === "outside" ? { state: "outside" } : { state: "failed", detail: c.detail }));
  }, []);
  useEffect(connect, [connect]);

  if (boot.state === "connecting") return <BrandLoader label="Connecting to Kissflow…" />;
  if (boot.state === "failed") return <ConnectFailed detail={boot.detail} onRetry={connect} />;
  const kf = boot.state === "live" ? boot.kf : null;
  return (
    <HashRouter>
      {/* inside the router: a role switch goes to the new role's landing page (mode.tsx) */}
      <PortalModeProvider kf={kf} readyMs={boot.state === "live" ? boot.readyMs : 0}>
        <RoleRoutes />
      </PortalModeProvider>
    </HashRouter>
  );
}

export function PortalApp() {
  return (
    <ThemeProvider>
      <Portal />
    </ThemeProvider>
  );
}
