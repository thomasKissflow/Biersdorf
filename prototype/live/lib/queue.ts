// The ONE serial queue of the live suite (tests-2026-10-21/SPEC.md §1 "Pacing"). Every Kissflow call, REST and webhook
// POST alike, goes through `run`: one at a time, at least `gapMs` (2500 ms) from the end of the previous call to the start
// of the next (the portal session shares the key and got a Cloudflare 429 at 1.3 s). A 429 or an HTML body ("Just a
// moment…") is a StopError: no retry, the queue latches (every later call throws the same StopError without calling),
// the onStop hooks run once (the results checkpoint) and, live, the state file blocks every process for 20 minutes.
// The clock is injected: offline a virtual clock advances on sleep, so nothing waits.
// A call cut off at 60 s (liveClient.ts: kf.mjs and fetch cannot be aborted) may still be on the wire: it throws a
// CutOffError carrying the late call, and the next call waits until that one settles, then the gap (no overlap); one
// that has not settled LATE_MAX_MS after the cut-off stops the run. The state file is re-read before every call (a stop
// or a call of another process of the suite counts here at once) and merged on write (one process never erases
// another's stop).
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

// 21 Oct: three 429s came about 23-25 min into a run at 2.5 s (about 600 calls in a rolling window shared with the portal
// session); a live run can slow down with KF_GAP_MS (never below 2500)
export const CALL_GAP_MS = Math.max(2500, Number(process.env.KF_GAP_MS) || 2500);

/** KF_WINDOW="a-b": calls only in minutes a..b of each hour (22 Oct: even 8 s from each session tripped the shared key's limit,
 *  so the two sessions take turns by the clock). Unset: no window. */
export const WINDOW: readonly [number, number] | undefined = (() => {
  const m = /^(\d{1,2})-(\d{1,2})$/.exec(process.env.KF_WINDOW ?? "");
  return m && +m[1] <= +m[2] && +m[2] < 60 ? [+m[1], +m[2]] : undefined;
})();

/** How long until `t` (ms) is inside the window: 0 inside it, else until its next start minute. */
export function windowWaitMs(t: number, w: readonly [number, number] | undefined = WINDOW): number {
  if (!w) return 0;
  const d = new Date(t);
  const m = d.getMinutes();
  if (m >= w[0] && m <= w[1]) return 0;
  const next = new Date(d);
  next.setSeconds(0, 0);
  if (m > w[1]) next.setHours(d.getHours() + 1);
  next.setMinutes(w[0]);
  return next.getTime() - t;
}

/** The hold file every live run watches unless KF_HOLD_FILE names another: kissflow-build/ciq-digital/tests-2026-10-21/HOLD. */
export const HOLD_FILE = process.env.KF_HOLD_FILE ?? fileURLToPath(new URL("../../../kissflow-build/ciq-digital/tests-2026-10-21/HOLD", import.meta.url));

/** While the hold file exists every live call waits (15 s steps); remove it to resume (22 Oct: Thomas tests by hand in dev). */
export function holdWaitMs(file = process.env.LIVE === "1" ? HOLD_FILE : process.env.KF_HOLD_FILE): number {
  return file && existsSync(file) ? 15_000 : 0;
}

/** The pace the suites budget their timeouts with: the call gap, stretched by the share of each hour a window leaves idle. */
export const GAP_MS = WINDOW ? Math.round((CALL_GAP_MS * 60) / (WINDOW[1] - WINDOW[0] + 1)) : CALL_GAP_MS;
/** After a StopError nothing calls Kissflow for this long (both sessions pause). */
export const PAUSE_MS = 20 * 60 * 1000;

export class StopError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "StopError";
  }
}

/** A call that did not answer within its bound: `late` is the call itself, which may still answer (never sent again). */
export class CutOffError extends Error {
  constructor(
    message: string,
    readonly late: Promise<unknown>,
  ) {
    super(message);
    this.name = "CutOffError";
  }
}

/** How long after a cut-off the queue waits for the late call to settle before it stops the run. */
export const LATE_MAX_MS = 5 * 60 * 1000;

/** Persisted text never carries a URL (a webhook URL is its own secret). */
const noUrls = (t: string) => t.replace(/(https?|wss?)(:|%3A)(\/\/|\\\/\\\/|%2F%2F)[^\s"'<>)\]}]+/gi, "<url>");

export interface Clock {
  now(): number;
  sleep(ms: number): Promise<void>;
}

export const realClock: Clock = { now: () => Date.now(), sleep: (ms) => new Promise((r) => setTimeout(r, ms)) };

/** A clock that only moves when something sleeps on it (offline: pacing and polls cost no real time). */
export function virtualClock(start = Date.parse("2026-10-21T00:00:00Z")): Clock & { advance(ms: number): void } {
  let t = start;
  return {
    now: () => t,
    sleep: async (ms) => {
      t += Math.max(0, ms);
    },
    advance: (ms) => {
      t += ms;
    },
  };
}

/** Why an answer means "stop now" (429, a Cloudflare challenge or any HTML page), or undefined. */
export function challengeOf(status: number, body: unknown): string | undefined {
  if (status === 429) return "429 Too Many Requests";
  if (typeof body === "string" && /<html|<!doctype html|just a moment/i.test(body)) return `HTML answer (status ${status}${/just a moment/i.test(body) ? ', "Just a moment…"' : ""})`;
  return undefined;
}

export interface QueueOptions {
  gapMs?: number;
  clock?: Clock;
  /** Live only: last call time and the stop, shared by every process of the suite (vitest runs files in turn). */
  stateFile?: string;
}

interface QueueState {
  lastCallAt?: number;
  stoppedAt?: number;
  why?: string;
}

export interface Queue {
  readonly clock: Clock;
  readonly gapMs: number;
  /** Runs one Kissflow call in its turn. A StopError thrown by `call` (see check) latches the queue. */
  run<T>(label: string, call: () => Promise<T>): Promise<T>;
  /** Throws a StopError when the answer is a 429 or HTML (call it inside `run`, before reading the body). */
  check(status: number, body: unknown, label: string): void;
  stopped(): StopError | undefined;
  /** A checkpoint hook, run once when the queue stops; returns its remover. */
  onStop(fn: (e: StopError) => void): () => void;
  /** When each call started (clock ms) and its label, in order (pacing evidence). */
  readonly history: { label: string; at: number }[];
}

function readState(file: string | undefined): QueueState {
  if (!file || !existsSync(file)) return {};
  try {
    return JSON.parse(readFileSync(file, "utf8")) as QueueState;
  } catch {
    return {};
  }
}

const later = (a: number | undefined, b: number | undefined) => (a === undefined ? b : b === undefined ? a : Math.max(a, b));

export function createQueue(o: QueueOptions = {}): Queue {
  const clock = o.clock ?? realClock;
  const gapMs = o.gapMs ?? CALL_GAP_MS;
  const state = readState(o.stateFile);
  // merged with what is on disk (another process may have called or stopped since), written whole (a rename)
  const save = () => {
    if (!o.stateFile) return;
    const disk = readState(o.stateFile);
    const stopLater = (disk.stoppedAt ?? Number.NEGATIVE_INFINITY) > (state.stoppedAt ?? Number.NEGATIVE_INFINITY);
    const merged: QueueState = {
      ...(later(disk.lastCallAt, state.lastCallAt) !== undefined ? { lastCallAt: later(disk.lastCallAt, state.lastCallAt) } : {}),
      ...(stopLater ? { stoppedAt: disk.stoppedAt, why: disk.why } : state.stoppedAt !== undefined ? { stoppedAt: state.stoppedAt, why: state.why } : {}),
    };
    mkdirSync(dirname(o.stateFile), { recursive: true });
    const tmp = `${o.stateFile}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(merged));
    renameSync(tmp, o.stateFile);
  };
  let lastEnd = state.lastCallAt ?? Number.NEGATIVE_INFINITY;
  let stop: StopError | undefined;
  const pausedBy = (s: QueueState): StopError | undefined =>
    s.stoppedAt !== undefined && clock.now() - s.stoppedAt < PAUSE_MS
      ? new StopError(`Paused: ${s.why ?? "a stop"} at ${new Date(s.stoppedAt).toISOString()}; no Kissflow call before ${new Date(s.stoppedAt + PAUSE_MS).toISOString()}.`)
      : undefined;
  // a stop another process latched less than 20 minutes ago still holds
  stop = pausedBy(state);
  const hooks = new Set<(e: StopError) => void>();
  const history: { label: string; at: number }[] = [];
  let chain: Promise<unknown> = Promise.resolve();
  /** A call cut off at its bound that may still be on the wire, and when it settled. */
  let late: { done: Promise<void>; at?: number } | undefined;

  function checkpoint(e: StopError) {
    for (const fn of hooks) {
      try {
        fn(e);
      } catch {
        // a checkpoint is best effort; the stop stands
      }
    }
  }

  function latch(e: StopError): StopError {
    if (stop) return stop;
    stop = e;
    state.stoppedAt = clock.now();
    state.why = noUrls(e.message);
    save();
    checkpoint(e);
    return e;
  }

  /** Before each call: another process's stop latches here too (without restarting its pause); its last call paces. */
  function sync() {
    if (!o.stateFile) return;
    const disk = readState(o.stateFile);
    if (disk.lastCallAt !== undefined) lastEnd = Math.max(lastEnd, disk.lastCallAt);
    const theirs = stop ? undefined : pausedBy(disk);
    if (theirs) {
      stop = theirs;
      checkpoint(theirs);
    }
  }

  function noteLate(p: Promise<unknown>) {
    const rec: { done: Promise<void>; at?: number } = { done: Promise.resolve() };
    rec.done = p.then(
      () => undefined,
      () => undefined,
    ).then(() => {
      rec.at = clock.now();
      state.lastCallAt = Math.max(state.lastCallAt ?? Number.NEGATIVE_INFINITY, rec.at);
      save();
    });
    late = rec;
  }

  /** Waits for a cut-off call to settle (bounded by LATE_MAX_MS of real time); its end then counts as the last call's. */
  async function awaitLate(): Promise<void> {
    const l = late;
    if (!l) return;
    if (l.at === undefined) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const bound = new Promise<void>((r) => {
        timer = setTimeout(r, LATE_MAX_MS);
        (timer as { unref?: () => void }).unref?.();
      });
      await Promise.race([l.done, bound]).finally(() => clearTimeout(timer));
    }
    if (l.at === undefined)
      throw latch(new StopError(`A call cut off at its bound had still not answered ${Math.round(LATE_MAX_MS / 60000)} minutes later: stopping, so that no call overlaps it. Nothing calls Kissflow for 20 minutes.`));
    late = undefined;
    lastEnd = Math.max(lastEnd, l.at);
  }

  return {
    clock,
    gapMs,
    history,
    run<T>(label: string, call: () => Promise<T>): Promise<T> {
      const p = chain.then(async () => {
        if (stop) throw stop;
        await awaitLate();
        // the gap from the last call of any process of the suite (re-read after each wait: one may have called since)
        for (;;) {
          sync();
          if (stop) throw stop;
          // a HOLD file (KF_HOLD_FILE) pauses every call until it is removed, e.g. while Thomas tests by hand in dev (22 Oct)
          const wait = Math.max(lastEnd + gapMs - clock.now(), windowWaitMs(clock.now()), holdWaitMs());
          if (wait <= 0) break;
          const before = clock.now();
          await clock.sleep(wait);
          if (clock.now() === before) break; // a test clock whose sleep does not move it: one sleep is the wait
        }
        history.push({ label, at: clock.now() });
        try {
          return await call();
        } catch (e) {
          if (e instanceof StopError) throw latch(e);
          if (e instanceof CutOffError) noteLate(e.late);
          throw e;
        } finally {
          lastEnd = Math.max(lastEnd, clock.now());
          state.lastCallAt = Math.max(state.lastCallAt ?? Number.NEGATIVE_INFINITY, lastEnd);
          save();
        }
      });
      chain = p.catch(() => undefined);
      return p;
    },
    check(status, body, label) {
      const why = challengeOf(status, body);
      if (why) throw new StopError(`Stopped on ${label}: ${why}. No retry; nothing calls Kissflow for 20 minutes.`, status);
    },
    stopped: () => stop,
    onStop(fn) {
      hooks.add(fn);
      return () => hooks.delete(fn);
    },
  };
}

let shared: Queue | undefined;
/** The process-wide queue (created on first use with these options; later options are ignored). */
export function sharedQueue(o: QueueOptions = {}): Queue {
  return (shared ??= createQueue(o));
}
