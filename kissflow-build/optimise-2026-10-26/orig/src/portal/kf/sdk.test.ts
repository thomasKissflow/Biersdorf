import { describe, expect, it } from "vitest";
import { connectKf, errorText, kfDateTime, rowsOf, totalOf, type Kf } from "./sdk";

const fakeKf = { user: { _id: "Us1", Name: "A" }, account: { _id: "Ac1" }, app: { getProcess: () => ({}), getDataform: () => ({}) }, api: async () => ({}) } as unknown as Kf;

describe("connectKf", () => {
  it("does not wait when the page is not inside a frame (opened directly)", async () => {
    let loaded = false;
    const c = await connectKf({
      framed: false,
      load: async () => {
        loaded = true;
        return { initialize: async () => fakeKf };
      },
    });
    expect(c).toMatchObject({ kf: null, reason: "outside" });
    expect(loaded).toBe(false);
  });

  it("returns the SDK handle once the host answers the handshake", async () => {
    const c = await connectKf({ framed: true, load: async () => ({ initialize: async () => fakeKf }) });
    expect(c.kf).toBe(fakeKf);
  });

  it("gives up after the timeout when the host never answers (the SDK itself waits forever)", async () => {
    const c = await connectKf({ framed: true, timeoutMs: 30, load: async () => ({ initialize: () => new Promise<never>(() => {}) }) });
    expect(c).toMatchObject({ kf: null, reason: "no-answer" });
  });

  it("reports a refused handshake with the SDK's own message", async () => {
    const c = await connectKf({ framed: true, load: async () => ({ initialize: () => Promise.reject("SDK can be initialized only inside the Kissflow platform.") }) });
    expect(c).toMatchObject({ kf: null, reason: "refused", detail: "SDK can be initialized only inside the Kissflow platform." });
  });

  it("rejects a handshake answer without an app or account", async () => {
    const c = await connectKf({ framed: true, load: async () => ({ initialize: async () => ({ user: {} }) }) });
    expect(c).toMatchObject({ kf: null, reason: "refused" });
  });
});

describe("rowsOf / totalOf", () => {
  it("reads every list envelope the host may answer with: the SDK's documented { items, total } first", () => {
    expect(rowsOf({ items: [{ _id: "a" }], total: 7 })).toEqual([{ _id: "a" }]);
    expect(rowsOf({ Items: [{ _id: "b" }], Total: 1 })).toEqual([{ _id: "b" }]);
    expect(rowsOf({ Data: [{ _id: "c" }], count: 1 })).toEqual([{ _id: "c" }]);
    expect(rowsOf({ data: [{ _id: "d" }] })).toEqual([{ _id: "d" }]);
    expect(rowsOf([{ _id: "e" }])).toEqual([{ _id: "e" }]);
    expect(rowsOf({})).toEqual([]);
    expect(totalOf({ items: [], total: 7 })).toBe(7);
    expect(totalOf({ Data: [], count: 3 })).toBe(3);
    expect(totalOf([{ _id: "x" }])).toBeUndefined();
  });

  it("refuses an envelope it does not know instead of reading it as an empty list", () => {
    expect(() => rowsOf({ rows: [{ _id: "a" }], size: 1 })).toThrow(/rows, size/);
  });
});

describe("errorText", () => {
  it("uses the SDK's errorMessage (string or Kissflow envelope) before anything else", () => {
    expect(errorText({ isError: true, errorMessage: "You don't have permission to submit this item." })).toBe("You don't have permission to submit this item.");
    expect(errorText({ isError: true, errorMessage: { error_code: "KISSFLOW_ERROR_050313", en_message: "Permission denied to update Trade_Name" } })).toBe("KISSFLOW_ERROR_050313 Permission denied to update Trade_Name");
    expect(errorText({ message: "instanceId is required" })).toBe("instanceId is required");
    expect(errorText(new Error("boom"))).toBe("boom");
    expect(errorText("plain")).toBe("plain");
  });
});

describe("kfDateTime", () => {
  it("writes DateTimes without milliseconds (Kissflow rejects them; CAFM sdk.ts, live)", () => {
    expect(kfDateTime(new Date("2026-10-07T12:34:56.789Z"))).toBe("2026-10-07T12:34:56Z");
  });
});
