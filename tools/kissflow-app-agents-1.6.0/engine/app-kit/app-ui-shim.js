// Shim: lets starter-kit components (src/components/kit/*) that import "@kissflow/app-ui"
// run on this app's SDK, @kissflow/app-core. Wired via the vite alias in vite.config.js —
// the kit files stay verbatim copies of the starter, which is what keeps them diffable
// against their source.
//
// useKf / usePageTitle are the same hooks under both packages. useKfDev is app-ui's offline
// dev-mode role simulator; outside dev mode its documented contract is "active is false and
// canAccess returns true for all" (app-ui src/offline/dev-context.ts) — which is exactly the
// deployed situation here, so the shim returns that resting state.
export { useKf, usePageTitle } from "@kissflow/app-core";

const DEV_RESTING = {
  active: false,
  roleId: null,
  roleName: null,
  canAccess: () => true,
};

export function useKfDev() {
  return DEV_RESTING;
}
