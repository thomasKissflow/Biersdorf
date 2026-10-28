// Write queues (WORKBENCH-DESIGN.md §7.1; D32 one-write-in-flight, dec L458).
// - Container check FIRST: when the handshake's app id is not APP_ID, every enqueue and create rejects with
//   WrongContainerError before anything is sent. Hiding buttons is not the enforcement; this is.
// - One serial chain per item (`flow:_id`): process steps and the item share one chain (SPIKES L152).
// - Uncertain items: a write, submit or discard that timed out may still land later, so every further write to the
//   item is refused locally until Re-read (or a reload) clears the mark.
// - "Last save failed" (§7.3 step 1) is a FIELD-SAVE fact: write-then-verify records it from its SaveResult
//   (recordSave). A thrown submit, reject or send-back never sets it (WL-03).
// - One create lane per session for every Form and Process create; plus navigator.locks("ciq-wb-create") when it
//   exists, inside try/catch (a sandboxed frame may reject it; then the in-memory lane alone is used).
import { APP_ID, type FlowId } from "../schema";
import type { NormPatch } from "./writeVerified";

export class WrongContainerError extends Error {
  constructor(appId: string | null | undefined) {
    super(`This Workbench is running in ${appId ? `"${appId}"` : "an unknown container"}, not ${APP_ID}. Nothing is saved here.`);
    this.name = "WrongContainerError";
  }
}
export class UncertainItemError extends Error {
  constructor() {
    super("The last save to this item did not answer. Press Re-read before saving again.");
    this.name = "UncertainItemError";
  }
}

export interface UncertainInfo {
  since: number;
  kind: "write" | "submit" | "discard" | "create" | "reject";
  /** The normalised patch that timed out (for the Re-read compare, per field type; WL-10). */
  patch?: NormPatch;
  /** A reject that timed out: the F8 Cancellation event it belongs to (case.cancel.failed after a settle, WL-06). */
  cancel?: { eventKey: string; caseCode: string; cycleNo: number | null; caseItemId: string };
}

export interface LockManagerLike {
  request(name: string, cb: () => Promise<unknown>): Promise<unknown>;
}

export interface WriteQueue {
  /** Per-item serial chain. Rejects (before running fn) on a wrong container or an uncertain item. */
  enqueue<T>(itemKey: string, fn: () => Promise<T>): Promise<T>;
  /** The one create lane (Form and Process creates: create → submit → verify, then the next). */
  create<T>(fn: () => Promise<T>): Promise<T>;
  /** Resolves when everything queued on the item so far has finished (never rejects). */
  idle(itemKey: string): Promise<void>;
  /** True when the item's last FIELD SAVE did not verify (submitStep refuses: "the last save failed"). */
  lastFailed(itemKey: string): boolean;
  /** Records the outcome of a field save (write-then-verify, the admin lane write, a passing K-WB Re-read). */
  recordSave(itemKey: string, ok: boolean): void;
  markUncertain(itemKey: string, info: Omit<UncertainInfo, "since">): void;
  uncertain(itemKey: string): UncertainInfo | undefined;
  clearUncertain(itemKey: string): void;
  uncertainItems(): [string, UncertainInfo][];
  /** Throws WrongContainerError when the container is wrong. */
  assertContainer(): void;
  readonly containerOk: boolean;
}

export const itemKey = (flow: FlowId, id: string): string => `${flow}:${id}`;

export function createWriteQueue(o: { appId: string | null | undefined; expectedAppId?: string; locks?: LockManagerLike | null; now?: () => number }): WriteQueue {
  const expected = o.expectedAppId ?? APP_ID;
  const containerOk = o.appId === expected;
  const now = o.now ?? (() => Date.now());
  const chains = new Map<string, Promise<unknown>>();
  const failed = new Map<string, boolean>();
  const uncertainMap = new Map<string, UncertainInfo>();
  let createChain: Promise<unknown> = Promise.resolve();
  const locks =
    o.locks !== undefined
      ? o.locks
      : typeof navigator !== "undefined" && (navigator as unknown as { locks?: LockManagerLike }).locks?.request
        ? (navigator as unknown as { locks: LockManagerLike }).locks
        : null;

  const assertContainer = () => {
    if (!containerOk) throw new WrongContainerError(o.appId);
  };

  /** Runs fn under navigator.locks when possible. A lock that cannot be taken (sandboxed frame) falls back to the
   *  in-memory lane; an error from fn itself is never retried. */
  async function withLock<T>(fn: () => Promise<T>): Promise<T> {
    if (!locks) return fn();
    let started = false;
    try {
      return (await locks.request("ciq-wb-create", () => {
        started = true;
        return fn();
      })) as T;
    } catch (e) {
      if (started) throw e;
      return fn();
    }
  }

  return {
    containerOk,
    assertContainer,
    enqueue<T>(key: string, fn: () => Promise<T>): Promise<T> {
      const prev = chains.get(key) ?? Promise.resolve();
      const run = prev.then(
        () => undefined,
        () => undefined,
      ).then(async () => {
        assertContainer();
        if (uncertainMap.has(key)) throw new UncertainItemError();
        return fn();
      });
      chains.set(key, run.catch(() => undefined));
      return run;
    },
    create<T>(fn: () => Promise<T>): Promise<T> {
      const run = createChain.then(
        () => undefined,
        () => undefined,
      ).then(() => {
        assertContainer();
        return withLock(fn);
      });
      createChain = run.catch(() => undefined);
      return run;
    },
    async idle(key) {
      await (chains.get(key) ?? Promise.resolve());
    },
    lastFailed: (key) => failed.get(key) === true,
    recordSave(key, ok) {
      failed.set(key, !ok);
    },
    markUncertain(key, info) {
      uncertainMap.set(key, { ...info, since: now() });
    },
    uncertain: (key) => uncertainMap.get(key),
    clearUncertain(key) {
      uncertainMap.delete(key);
      failed.set(key, false);
    },
    uncertainItems: () => [...uncertainMap.entries()],
  };
}
