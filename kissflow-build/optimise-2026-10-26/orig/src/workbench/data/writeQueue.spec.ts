import { describe, expect, it } from "vitest";
import { createWriteQueue, UncertainItemError, WrongContainerError } from "./writeQueue";

const tick = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("write queue (§7.1)", () => {
  it("no overlap per item: writes to one item run one after another; other items run in parallel", async () => {
    const q = createWriteQueue({ appId: "CIQ_Digital_A00", locks: null });
    const log: string[] = [];
    let inFlight = 0;
    let maxInFlight = 0;
    const job = (name: string) => async () => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      log.push(`start ${name}`);
      await tick(5);
      log.push(`end ${name}`);
      inFlight--;
    };
    await Promise.all([q.enqueue("a", job("a1")), q.enqueue("a", job("a2")), q.enqueue("a", job("a3"))]);
    expect(log).toEqual(["start a1", "end a1", "start a2", "end a2", "start a3", "end a3"]);
    expect(maxInFlight).toBe(1);
    const started: string[] = [];
    await Promise.all([q.enqueue("x", async () => (started.push("x"), tick(5))), q.enqueue("y", async () => (started.push("y"), tick(5)))]);
    expect(started).toEqual(["x", "y"]);
  });
  it("a failed call does not block the chain; lastFailed is a SAVE fact recorded from the result (WL-03)", async () => {
    const q = createWriteQueue({ appId: "CIQ_Digital_A00", locks: null });
    // a thrown submit / reject / send-back is not a failed save
    await expect(q.enqueue("a", async () => Promise.reject(new Error("boom")))).rejects.toThrow("boom");
    expect(q.lastFailed("a")).toBe(false);
    expect(await q.enqueue("a", async () => 1)).toBe(1);
    // a save that did not verify resolves with a result; write-then-verify records it
    q.recordSave("a", false);
    expect(q.lastFailed("a")).toBe(true);
    await q.enqueue("a", async () => 2); // another queued call does not clear it
    expect(q.lastFailed("a")).toBe(true);
    q.recordSave("a", true);
    expect(q.lastFailed("a")).toBe(false);
    q.recordSave("a", false);
    q.clearUncertain("a"); // Re-read of an uncertain item clears it too
    expect(q.lastFailed("a")).toBe(false);
  });
  it("creates are serialised in ONE lane across forms and processes", async () => {
    const q = createWriteQueue({ appId: "CIQ_Digital_A00", locks: null });
    let inFlight = 0;
    let max = 0;
    const c = () => q.create(async () => {
      inFlight++;
      max = Math.max(max, inFlight);
      await tick(3);
      inFlight--;
    });
    await Promise.all([c(), c(), c()]);
    expect(max).toBe(1);
  });
  it("a wrong container refuses EVERY write and create before anything runs", async () => {
    const q = createWriteQueue({ appId: "CIQ_Supplier_Portal_A00", locks: null });
    let ran = false;
    await expect(q.enqueue("a", async () => (ran = true))).rejects.toBeInstanceOf(WrongContainerError);
    await expect(q.create(async () => (ran = true))).rejects.toBeInstanceOf(WrongContainerError);
    expect(ran).toBe(false);
    expect(q.containerOk).toBe(false);
    await expect(createWriteQueue({ appId: undefined, locks: null }).enqueue("a", async () => 1)).rejects.toBeInstanceOf(WrongContainerError);
  });
  it("an uncertain item refuses further writes until cleared", async () => {
    const q = createWriteQueue({ appId: "CIQ_Digital_A00", locks: null });
    q.markUncertain("a", { kind: "write", patch: { fields: { X: 1 }, tables: {} } });
    await expect(q.enqueue("a", async () => 1)).rejects.toBeInstanceOf(UncertainItemError);
    expect(q.uncertainItems().map(([k]) => k)).toEqual(["a"]);
    q.clearUncertain("a");
    expect(await q.enqueue("a", async () => 2)).toBe(2);
  });
  it("navigator.locks is used when it works and skipped when the request rejects (sandboxed frame)", async () => {
    const used: string[] = [];
    const ok = createWriteQueue({ appId: "CIQ_Digital_A00", locks: { request: async (name, cb) => (used.push(name), cb()) } });
    expect(await ok.create(async () => "x")).toBe("x");
    expect(used).toEqual(["ciq-wb-create"]);
    const broken = createWriteQueue({ appId: "CIQ_Digital_A00", locks: { request: async () => Promise.reject(new Error("SecurityError")) } });
    expect(await broken.create(async () => "y")).toBe("y");
    let runs = 0;
    const failing = createWriteQueue({ appId: "CIQ_Digital_A00", locks: { request: async (_n, cb) => cb() } });
    await expect(failing.create(async () => (runs++, Promise.reject(new Error("create failed"))))).rejects.toThrow("create failed");
    expect(runs).toBe(1); // an error from the create itself is never retried without the lock
  });
});
