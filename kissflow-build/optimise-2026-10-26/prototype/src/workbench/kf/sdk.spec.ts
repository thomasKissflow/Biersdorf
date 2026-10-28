import { describe, expect, it } from "vitest";
import { connectKf, envelopeOf, errorText, rowsOf, totalOf, type Kf } from "./sdk";

const fakeKf = { user: { _id: "Us1", Name: "A" }, account: { _id: "Ac1" }, app: { _id: "CIQ_Digital_A00", getProcess: () => ({}), getDataform: () => ({}) }, api: async () => ({}) } as unknown as Kf;

describe("connectKf (copied handshake + timeout)", () => {
  it("does not load the SDK when not in a frame (opened directly)", async () => {
    let loaded = false;
    const c = await connectKf({ framed: false, load: async () => ((loaded = true), { initialize: async () => fakeKf }) });
    expect(c).toMatchObject({ kf: null, reason: "outside" });
    expect(loaded).toBe(false);
  });
  it("returns the handle once the host answers", async () => {
    expect((await connectKf({ framed: true, load: async () => ({ initialize: async () => fakeKf }) })).kf).toBe(fakeKf);
  });
  it("gives up after the timeout (the SDK itself waits forever)", async () => {
    expect(await connectKf({ framed: true, timeoutMs: 20, load: async () => ({ initialize: () => new Promise<never>(() => {}) }) })).toMatchObject({ kf: null, reason: "no-answer" });
  });
  it("reports a refused handshake and an answer without account/app", async () => {
    expect(await connectKf({ framed: true, load: async () => ({ initialize: () => Promise.reject("SDK can be initialized only inside the Kissflow platform.") }) })).toMatchObject({ reason: "refused", detail: "SDK can be initialized only inside the Kissflow platform." });
    expect(await connectKf({ framed: true, load: async () => ({ initialize: async () => ({ user: {} }) }) })).toMatchObject({ reason: "refused" });
  });
});

describe("rowsOf and the envelopes", () => {
  it("reads the live envelopes {Columns, Data} and {_id, Columns, Sort, Filter, Data} (no total, UI-LOG L106-L110)", () => {
    expect(rowsOf({ Columns: [], Data: [{ _id: "a" }] })).toEqual([{ _id: "a" }]);
    expect(rowsOf({ _id: "x", Columns: [], Sort: [], Filter: {}, Data: [{ _id: "b" }] })).toEqual([{ _id: "b" }]);
    expect(totalOf({ Columns: [], Data: [] })).toBeUndefined();
    expect(envelopeOf({ Columns: [], Data: [] })).toBe("{Columns,Data}");
  });
  it("reads { items, total }, bare arrays and empty objects; refuses unknown shapes", () => {
    expect(rowsOf({ items: [{ _id: "a" }], total: 7 })).toEqual([{ _id: "a" }]);
    expect(totalOf({ items: [], total: 7 })).toBe(7);
    expect(rowsOf([{ _id: "e" }])).toEqual([{ _id: "e" }]);
    expect(rowsOf({})).toEqual([]);
    expect(rowsOf(null)).toEqual([]);
    expect(() => rowsOf({ rows: [] })).toThrow(/unknown shape/);
  });
  it("errorText reads the SDK's errorMessage first", () => {
    expect(errorText({ isError: true, errorMessage: { error_code: "KISSFLOW_ERROR_050313", en_message: "You don't have permission to update the following fields" } })).toBe("KISSFLOW_ERROR_050313 You don't have permission to update the following fields");
    expect(errorText(new Error("boom"))).toBe("boom");
  });
});
