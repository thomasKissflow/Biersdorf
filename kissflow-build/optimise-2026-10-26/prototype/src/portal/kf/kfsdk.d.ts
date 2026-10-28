// The package's "exports" map does not resolve its own types; the portal uses the typed facade in sdk.ts.
declare module "@kissflow/lowcode-client-sdk" {
  const sdk: { initialize(): Promise<unknown> };
  export default sdk;
}
