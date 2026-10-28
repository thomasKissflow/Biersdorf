// Test kit (specs only; never imported by the app): pins the read-back activity ids for one test, so a spec does not
// depend on whether the committed generated.ts carries server ids (WORKBENCH-DESIGN.md §4.4). `as const` is types
// only, so the generated STEPS object is mutated in place and restored by the returned function (call it in
// afterEach or finally). Vitest isolates spec files, so a pin never leaks into another file.
import { STEPS, type StepIr } from "../schema/generated";

type MutableSteps = Record<string, { serverActivityId: string | null }>;

/** Exactly these steps get a server activity id; every other step is "unknown" (null). `{}` = no read-back at all.
 *  Returns the restore. */
export function pinServerActivityIds(ids: Partial<Record<StepIr, string>>): () => void {
  const w = STEPS as unknown as MutableSteps;
  const saved = Object.keys(w).map((k) => [k, w[k].serverActivityId] as const);
  for (const k of Object.keys(w)) w[k].serverActivityId = (ids as Record<string, string | undefined>)[k] ?? null;
  return () => {
    for (const [k, v] of saved) w[k].serverActivityId = v;
  };
}
