// Live internal UI of CIQ_Digital_A00: root. Waits for the Kissflow SDK handshake, works out who is signed in and
// which CIQ roles they hold (identity.ts, DESIGN §3.4), then renders the prototype's internal screens on live data
// through LiveAppStore (the StoreApi of DESIGN §6) inside the production shell:
//   no CIQ role (incl. Case administrator or Integration service only) → NoRolePage, no item reads
//   opened outside Kissflow → says so at once, nothing else (no demo: the prototype is the demo)
//   handshake fails or gets no answer → says so, with Try again
// The acting persona is the first held role in PERSONA_ORDER, or the one this user last picked in this browser
// (guarded localStorage, a per-viewer convenience; Kissflow decides what each role may do). In the Development sandbox
// (env.ts) the top bar's role switcher picks a held role through the store's setPersona → onPersona here, or moves
// the user into another role for real (kf.app.switchRole; appEnv.tsx); the identity is then rebuilt from getRoles and
// the store starts over for the new role. Production (beiersdorf.kissflow.eu) has no switcher.
// The Admin / Developer role (26 Oct) adds the data console under /data (console/): beside the CIQ screens for a user
// who also holds a CIQ persona, or as the whole app (instead of NoRolePage) for one who holds none. The console has its
// own client (26 Oct, after Thomas's 429s: 2 calls in flight, a longer backoff; kf/client.ts consoleClientOptions); the
// CIQ screens' client is unchanged; both share the one-draft-per-form queue.
// The boot pages say what to do in plain words (FE-CLEANUP C4, C5, C7, C11): the handshake's failure in every
// environment (it is not known yet), with Kissflow's answer folded away; a start failure and the no-role page keep the
// raw message and role names in the Development sandbox only.
import { RefreshCw } from "lucide-react";
import { Component, useCallback, useEffect, useMemo, useState, type ErrorInfo, type ReactNode } from "react";
import { HashRouter, Route, Routes } from "react-router-dom";
import { Button, Card, EmptyState, ProductionContext } from "@/components/ui";
import type { InternalPersonaId } from "@/domain/types";
import { BrandLoader } from "@/portal/BrandLoader";
import { connectKf, type Kf } from "@/portal/kf/sdk";
import { ThemeProvider } from "@/portal/theme";
import { AppEnvContext, useAppEnv, type AppEnvValue, type DevRoles } from "./appEnv";
import { AppLiveShell } from "./AppLiveShell";
import { DataConsoleProvider } from "./console/ConsoleContext";
import { DataConsoleOnly, dataConsoleRoutes } from "./console/dataRoutes";
import { createRateSignal } from "./console/rateSignal";
import { envOf, type AppEnv } from "./env";
import { identityOf, withRoles } from "./identity";
import { consoleClientOptions, createAppClient, newFormQueue } from "./kf/client";
import { asAppKf } from "./kf/sdk";
import { LiveAppStore } from "./LiveAppStore";
import { Home, internalChildRoutes } from "./routes";
import type { Identity, LiveRoleRef } from "./types";
import { CONNECT_FAILED, NO_ROLE, START_FAILED, trimEnd } from "./userText";

type Boot = { state: "connecting" } | { state: "live"; kf: Kf } | { state: "outside" } | { state: "failed"; detail: string };

const PERSONA_KEY = (kfUserId: string) => `ciq-applive:persona:${kfUserId}`;

/** The persona this user last picked here, if they still hold it. */
function rememberedPersona(identity: Identity): InternalPersonaId | undefined {
  try {
    const v = localStorage.getItem(PERSONA_KEY(identity.kfUserId));
    return identity.personas.find((p) => p === v);
  } catch {
    return undefined; // storage blocked in the Kissflow frame: the default persona
  }
}

function rememberPersona(kfUserId: string, id: InternalPersonaId) {
  try {
    localStorage.setItem(PERSONA_KEY(kfUserId), id);
  } catch {
    /* storage unavailable: the choice lasts for this page only */
  }
}

function Page({ testId, title, action, children }: { testId: string; title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <div className="mx-auto max-w-xl p-10" data-testid={testId}>
      <Card>
        <EmptyState title={title} action={action}>
          {children}
        </EmptyState>
      </Card>
    </div>
  );
}

function Outside() {
  return (
    <Page testId="outside" title="Not running inside Kissflow">
      This is the CIQ Digital app. Open it from Kissflow to see your cases.
    </Page>
  );
}

export function ConnectFailed({ detail, onRetry }: { detail: string; onRetry: () => void }) {
  return (
    <Page
      testId="connect-failed"
      title="Couldn't connect to Kissflow"
      action={
        <Button variant="primary" icon={<RefreshCw size={15} />} onClick={onRetry}>
          Try again
        </Button>
      }
    >
      {CONNECT_FAILED}
      {detail && (
        <details className="mt-3 text-left text-[12px] text-ink-3" data-testid="connect-failed-detail">
          <summary className="cursor-pointer">Technical details</summary>
          <p className="mt-1">{detail}</p>
        </details>
      )}
    </Page>
  );
}

/** DESIGN §3.4: a signed-in user without a CIQ persona. The role names Kissflow sent are dev's (C7). */
export function NoRolePage({ identity }: { identity: Identity }) {
  const { env } = useAppEnv();
  const roles = identity.roles.map((r) => r.name).filter(Boolean);
  return (
    <Page testId="no-role" title="No access to CIQ Digital">
      {env === "prod"
        ? NO_ROLE(identity.email)
        : `Your Kissflow account${identity.email ? ` (${identity.email})` : ""} has no CIQ role in this app (${roles.length ? `roles: ${roles.join(", ")}` : "no roles"}). Case administrator and Integration service work in Kissflow directly.`}
    </Page>
  );
}

/** Keeps a failure while starting (reading the identity, building the store) from leaving an empty frame. The pages
 *  have their own boundary (PageBoundary) inside the shell. */
export class StartBoundary extends Component<{ children: ReactNode; env: AppEnv }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("CIQ Digital could not start:", error, info.componentStack);
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <Page
        testId="start-failed"
        title="CIQ Digital could not start"
        action={
          <Button variant="primary" icon={<RefreshCw size={15} />} onClick={() => window.location.reload()}>
            Reload
          </Button>
        }
      >
        {this.props.env === "prod" ? START_FAILED : `Something went wrong while opening the app (${trimEnd(this.state.error.message)}). Reload the page; if it stays, tell your CIQ administrator.`}
      </Page>
    );
  }
}

const roleRefs = (rs: { _id?: unknown; Name?: unknown }[] | undefined): LiveRoleRef[] =>
  (Array.isArray(rs) ? rs : []).map((r) => ({ id: String(r?._id ?? ""), name: String(r?.Name ?? "") })).filter((r) => r.id || r.name);

function LiveApp({ kf }: { kf: Kf }) {
  const [identity, setIdentity] = useState<Identity>(() => identityOf(kf));
  // per role set: what a role was refused (load.ts adminRefused) must not carry over a dev role switch
  // the console's client (26 Oct): its own limiter and backoff, the same one-draft-per-form queue
  const { client, consoleClient, rate } = useMemo(() => {
    const formQueue = newFormQueue();
    const signal = createRateSignal();
    return { client: createAppClient(kf, { formQueue }), consoleClient: createAppClient(kf, consoleClientOptions({ formQueue, onRateLimit: signal.emit })), rate: signal };
  }, [kf, identity]);
  const env = useMemo(() => envOf(kf.account?._id), [kf]);
  const [personaId, setPersonaId] = useState<InternalPersonaId | undefined>(() => (env === "dev" ? rememberedPersona(identity) : undefined) ?? identity.personas[0]);
  const onPersona = useCallback(
    (id: InternalPersonaId) => {
      if (!identity.personas.includes(id)) return; // only held personas (the store toasts the refusal)
      rememberPersona(identity.kfUserId, id);
      setPersonaId(id);
    },
    [identity],
  );
  // dev only: the SDK's real role switch (appEnv.tsx); both calls answer only in a Development account
  const devRoles = useMemo<DevRoles | undefined>(() => {
    const app = asAppKf(kf).app;
    const getRoles = app.getRoles?.bind(app);
    const switchRole = app.switchRole?.bind(app);
    if (env !== "dev" || !getRoles || !switchRole) return undefined;
    const list = async () => {
      const got = await getRoles();
      const all = roleRefs(got?.roles);
      // currentRoles may carry ids only: take the names from the full list
      const current = roleRefs(got?.currentRoles).map((r) => ({ id: r.id, name: r.name || all.find((a) => a.id === r.id)?.name || "" }));
      return { all, current };
    };
    return {
      list,
      async switchTo(role) {
        await switchRole(role.id ? { roleId: role.id } : { roleName: role.name });
        // the switch is done: when the roles can't be read again, or come back without the target yet (Kissflow applies
        // the switch asynchronously), act in the target role, as switchRole moves the user into exactly that role
        const read = await list().catch(() => null);
        const has = (rs: LiveRoleRef[]) => rs.some((r) => (role.id && r.id === role.id) || (!!role.name && r.name === role.name));
        const current = read && has(read.current) ? read.current : [role];
        const next = withRoles(identity, current);
        const first = next.personas[0];
        if (first) rememberPersona(next.kfUserId, first);
        setIdentity(next);
        setPersonaId(first);
      },
    };
  }, [kf, env, identity]);
  const envValue = useMemo<AppEnvValue>(() => ({ env, ...(devRoles ? { devRoles } : {}) }), [env, devRoles]);
  if (!personaId) {
    return (
      <AppEnvContext.Provider value={envValue}>
        {identity.developer ? <DataConsoleOnly client={consoleClient} rate={rate} identity={identity} /> : <NoRolePage identity={identity} />}
      </AppEnvContext.Provider>
    );
  }
  return (
    <AppEnvContext.Provider value={envValue}>
      {/* a new set of roles (dev switch) starts the store over: what each role may read differs */}
      <LiveAppStore key={identity.roles.map((r) => r.id).join(",")} client={client} identity={identity} personaId={personaId} onPersona={onPersona}>
        <DataConsoleProvider client={consoleClient} rate={rate} identity={identity} besideCiq>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route element={<AppLiveShell />}>{internalChildRoutes()}</Route>
            {identity.developer && dataConsoleRoutes()}
            <Route path="*" element={<Home />} />
          </Routes>
        </DataConsoleProvider>
      </LiveAppStore>
    </AppEnvContext.Provider>
  );
}

function Connect() {
  const [boot, setBoot] = useState<Boot>({ state: "connecting" });
  const connect = useCallback(() => {
    setBoot({ state: "connecting" });
    void connectKf().then((c) => setBoot(c.kf ? { state: "live", kf: c.kf } : c.reason === "outside" ? { state: "outside" } : { state: "failed", detail: c.detail }));
  }, []);
  useEffect(connect, [connect]);

  // one label from the page's own loader to the shell (C11)
  if (boot.state === "connecting") return <BrandLoader label="Loading CIQ Digital…" />;
  if (boot.state === "failed") return <ConnectFailed detail={boot.detail} onRetry={connect} />;
  if (boot.state === "outside") return <Outside />;
  return (
    <StartBoundary env={envOf(boot.kf.account?._id)}>
      <LiveApp kf={boot.kf} />
    </StartBoundary>
  );
}

export function AppLiveApp() {
  useEffect(() => {
    document.title = "CIQ Digital · Beiersdorf";
  }, []);
  return (
    <ThemeProvider>
      <ProductionContext.Provider value={true}>
        <HashRouter>
          <Connect />
        </HashRouter>
      </ProductionContext.Provider>
    </ThemeProvider>
  );
}
