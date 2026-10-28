// cli-args.mjs — pure resolvers for the apply command's --mode / --target flags (#11). Kept out of
// cli.mjs (which parses process.argv and calls process.exit on import) so the resolution logic is unit
// testable in isolation. Neither function touches the environment except through the `env` argument.

/**
 * Resolve the execution STRATEGY from the apply flags.
 *   --mode express        → the fast, self-answering path (internally "quick")
 *   --mode comprehensive  → the deep, specialist-wave, human-signoff path
 *   --quick               → DEPRECATED alias for --mode express (warns)
 *   (neither)             → comprehensive, the stricter default before a live mutation
 *
 * Returns { mode: "express"|"comprehensive", deprecated: boolean }. `mode` is the user-facing name;
 * buildRequest() maps "express"→"quick" for the pipeline. Throws on an unknown --mode value so a typo
 * fails loudly instead of silently running comprehensive.
 */
export function resolveMode(args = []) {
  const i = args.indexOf("--mode");
  if (i >= 0) {
    const v = String(args[i + 1] ?? "").toLowerCase();
    if (v === "express" || v === "quick") return { mode: "express", deprecated: false };
    if (v === "comprehensive") return { mode: "comprehensive", deprecated: false };
    throw new Error(`--mode must be express|comprehensive (got ${JSON.stringify(args[i + 1] ?? "")})`);
  }
  if (args.includes("--quick")) return { mode: "express", deprecated: true };
  return { mode: "comprehensive", deprecated: false };
}

/**
 * Resolve the TARGET environment an apply should mutate, and what that means for prod-first creation.
 *   --target dev   → build directly in dev; never route app-creation through prod (prodFirst:false)
 *   --target prod  → require prod creds and create-in-prod→await-in-dev (prodFirst:true)
 *   (neither)      → env KF_TARGET if set, else AUTO: prod-first when prod creds exist, dev otherwise
 *
 * Returns { target, prodFirst, hasProdCreds }. prodFirst is a tri-state: true (force prod-first),
 * false (force dev-direct), or undefined (let applyIR auto-detect from creds — the historical default).
 * Throws when --target prod is asked for but no prod creds are configured, so the flag can't silently
 * fall back to dev and mutate the wrong place.
 */
export function resolveTarget(args = [], env = {}) {
  const hasProdCreds = Boolean(
    (env.KISSFLOW_PROD_ACCOUNT_ID || env.KF_PROD_ACCOUNT_ID) &&
    (env.KISSFLOW_PROD_API_KEY || env.KF_PROD_API_KEY) &&
    (env.KISSFLOW_PROD_API_SECRET || env.KF_PROD_API_SECRET),
  );
  const i = args.indexOf("--target");
  const raw = i >= 0 ? String(args[i + 1] ?? "").toLowerCase() : (env.KF_TARGET ? String(env.KF_TARGET).toLowerCase() : "");
  if (raw && raw !== "dev" && raw !== "prod") throw new Error(`--target must be dev|prod (got ${JSON.stringify(args[i + 1] ?? env.KF_TARGET)})`);
  if (raw === "dev") return { target: "dev", prodFirst: false, hasProdCreds };
  if (raw === "prod") {
    if (!hasProdCreds) throw new Error("--target prod needs prod creds (KISSFLOW_PROD_ACCOUNT_ID/API_KEY/API_SECRET or KF_PROD_*) — refusing to fall back to dev");
    return { target: "prod", prodFirst: true, hasProdCreds };
  }
  // AUTO: undefined prodFirst lets applyIR keep its historical auto-detect (prod-first iff prod creds).
  return { target: hasProdCreds ? "prod" : "dev", prodFirst: undefined, hasProdCreds };
}
