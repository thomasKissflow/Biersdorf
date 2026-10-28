// Which Kissflow environment a custom UI runs in (Thomas, 20 Oct): the Development sandbox (dev-beiersdorf.kissflow.eu)
// shows the top bar with the real role switcher; production (beiersdorf.kissflow.eu) shows no top bar at all. Each of
// those domains is one Kissflow account, so the account id the SDK handshake carries decides: the dev sandbox is
// account AcDOSunMEpSA; every other account is treated as production. The host names stay out of the bundle
// (scripts/workbench-deny.mjs DENY_HOSTS). Shared by the app UI (src/app-live) and the portal UI (src/portal).

export type AppEnv = "dev" | "prod";

export const DEV_ACCOUNT = "AcDOSunMEpSA";

export function envOf(accountId: string | undefined): AppEnv {
  return accountId === DEV_ACCOUNT ? "dev" : "prod";
}
