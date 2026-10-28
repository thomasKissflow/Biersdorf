// Results of a suite (SPEC §1 "Honesty", §5): results/<run>/<suite>.json under tests-2026-10-21/, written after every
// step (so a StopError leaves a checkpoint), and a step recorder. Each step is pass, fail (with the exact Kissflow
// answer), blocked (with the platform reason) or not-run:
// - a step passes only with at least one read-back recorded and every check true;
// - a thrown error fails it with the error's own text, except a 050201 on a step held by a role without members:
//   `reviewStep` (a review department step, SPEC §2) or `heldBy` (e.g. "Integration service": the case's waiting and
//   release steps since 21 Oct 02:30), which is blocked with the platform reason;
// - s.block(reason) and s.skip(reason) end a step as blocked / not-run;
// - a StopError marks the step not-run, saves, and is thrown on (the run stops); after it every step is not-run.
// Evidence is redacted (no URL that is not a Kissflow REST path) before it is written.
import { mkdirSync, writeFileSync } from "node:fs";
import { errorText } from "@/portal/kf/sdk";
import { TESTS_DIR } from "./ledger";
import { redactDeep } from "./liveClient";
import { StopError, type Queue } from "./queue";

export const RESULTS_DIR = `${TESTS_DIR}results/`;

export type Status = "pass" | "fail" | "blocked" | "not-run";

export interface Check {
  label: string;
  ok: boolean;
  detail?: unknown;
}
export interface StepResult {
  name: string;
  status: Status;
  /** Why it is not a pass: the failed checks, the Kissflow answer, the platform reason. */
  reason?: string;
  evidence: { readBacks: { what: string; value: unknown }[]; checks: Check[]; notes: Record<string, unknown> };
  ms: number;
  at: string;
}

export interface StepCtx {
  /** Records a read-back (what was read, and what of it matters). Required for a pass. */
  readBack(what: string, value: unknown): void;
  /** Records a check; returns `ok`. Any false check fails the step. */
  check(label: string, ok: boolean, detail?: unknown): boolean;
  /** Extra evidence (ids, counts, hand-off runs). */
  note(key: string, value: unknown): void;
  /** Ends the step as blocked (the platform reason, e.g. "050201: …"). */
  block(reason: string): never;
  /** Ends the step as not-run. */
  skip(reason: string): never;
}

export interface Recorder {
  readonly suite: string;
  readonly run: string;
  readonly file: string;
  readonly steps: StepResult[];
  step(name: string, fn: (s: StepCtx) => Promise<void> | void, o?: BlockedOn): Promise<StepResult>;
  /** Records a step that was not run (a dependency failed). */
  notRun(name: string, reason: string): StepResult;
  save(): void;
}

class EndStep extends Error {
  constructor(
    readonly status: "blocked" | "not-run",
    reason: string,
  ) {
    super(reason);
  }
}

/** Where a 050201 is the expected platform answer: the step is held by a role with no members. */
export interface BlockedOn {
  /** A review department step (held by the department's reviewer role). */
  reviewStep?: boolean;
  /** The role that holds the step, e.g. "Integration service". */
  heldBy?: string;
}

/** The status of a thrown error: blocked for a 050201 where `o` expects it, else fail with its text. */
export function classify(e: unknown, o: BlockedOn = {}): { status: "fail" | "blocked"; reason: string } {
  const text = errorText(e);
  const role = o.heldBy ?? (o.reviewStep ? "the department's reviewer role" : undefined);
  if (role && /050201/.test(text)) return { status: "blocked", reason: `050201: the step is held by ${role}, which has no members (${text})` };
  return { status: "fail", reason: text };
}

export function recorder(o: { suite: string; run: string; dir?: string; queue?: Queue; now?: () => number }): Recorder {
  const dir = `${o.dir ?? RESULTS_DIR}${o.run}/`;
  const file = `${dir}${o.suite}.json`;
  const now = o.now ?? (() => Date.now());
  const startedAt = new Date(now()).toISOString();
  const steps: StepResult[] = [];
  let stop: StopError | undefined;

  const save = () => {
    mkdirSync(dir, { recursive: true });
    const counts = Object.fromEntries((["pass", "fail", "blocked", "not-run"] as const).map((s) => [s, steps.filter((x) => x.status === s).length]));
    writeFileSync(file, JSON.stringify(redactDeep({ suite: o.suite, run: o.run, startedAt, savedAt: new Date(now()).toISOString(), counts, ...(stop ? { stopped: stop.message } : {}), steps }), null, 1));
  };
  // the queue's checkpoint: a stop inside a fire-and-forget POST still saves what is known
  o.queue?.onStop((e) => {
    stop ??= e;
    save();
  });
  const push = (r: StepResult) => {
    steps.push(r);
    save();
    return r;
  };
  const empty = (): StepResult["evidence"] => ({ readBacks: [], checks: [], notes: {} });

  return {
    suite: o.suite,
    run: o.run,
    file,
    steps,
    save,
    notRun: (name, reason) => push({ name, status: "not-run", reason, evidence: empty(), ms: 0, at: new Date(now()).toISOString() }),
    async step(name, fn, opts = {}) {
      const at = new Date(now()).toISOString();
      stop ??= o.queue?.stopped();
      if (stop) return push({ name, status: "not-run", reason: `stopped: ${stop.message}`, evidence: empty(), ms: 0, at });
      const evidence = empty();
      const ctx: StepCtx = {
        readBack: (what, value) => void evidence.readBacks.push({ what, value: structuredClone(value) }),
        check(label, ok, detail) {
          evidence.checks.push({ label, ok: !!ok, ...(detail !== undefined ? { detail: structuredClone(detail) } : {}) });
          return !!ok;
        },
        note: (key, value) => void (evidence.notes[key] = structuredClone(value)),
        block: (reason) => {
          throw new EndStep("blocked", reason);
        },
        skip: (reason) => {
          throw new EndStep("not-run", reason);
        },
      };
      const t0 = now();
      let status: Status;
      let reason: string | undefined;
      try {
        await fn(ctx);
        const failed = evidence.checks.filter((c) => !c.ok);
        if (failed.length) [status, reason] = ["fail", `failed: ${failed.map((c) => c.label).join("; ")}`];
        else if (!evidence.readBacks.length) [status, reason] = ["fail", "no read-back recorded: a step never passes without one"];
        else status = "pass";
      } catch (e) {
        if (e instanceof EndStep) [status, reason] = [e.status, e.message];
        else if (e instanceof StopError) {
          stop ??= e;
          [status, reason] = ["not-run", `stopped: ${e.message}`];
        } else ({ status, reason } = classify(e, opts));
      }
      // a stop during the step (a fire-and-forget POST) ends the run after it
      stop ??= o.queue?.stopped();
      const r = push({ name, status, ...(reason ? { reason } : {}), evidence, ms: now() - t0, at });
      if (stop) throw stop;
      return r;
    },
  };
}
