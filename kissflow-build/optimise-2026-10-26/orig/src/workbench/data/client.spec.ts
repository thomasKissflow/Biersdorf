// client.ts: paging and dedupe by _id|act, envelopes, rate limits, timeouts, the read-only admin fallback, the ladder.
import { describe, expect, it, vi } from "vitest";
import type { Kf, KfProcess } from "../kf/sdk";
import { createClient, isFieldRefusal, isMovedOut, refusedFieldsOf, TimeoutError, WbError } from "./client";

function fakeKf(proc: Partial<KfProcess>, api = vi.fn(async (url: string) => ({ _id: url.split("?")[0].split("/").pop() }))) {
  return {
    kf: { user: { _id: "Us1", Name: "Dev Builder" }, account: { _id: "AcTEST" }, app: { _id: "CIQ_Digital_A00", getProcess: () => proc as KfProcess, getDataform: () => ({}) }, api } as unknown as Kf,
    api,
  };
}
const noSleep = async () => {};
const rows = (n: number, from = 0, act?: (i: number) => string) => Array.from({ length: n }, (_, i) => ({ _id: `Pk${from + i}`, ...(act ? { _activity_instance_id: act(from + i) } : {}) }));

describe("paging", () => {
  it("reads past 50 and past 100 rows, stopping on a short page (live envelopes have no total)", async () => {
    const all = rows(120);
    const { kf } = fakeKf({ getMyItems: async (o) => ({ Columns: [], Data: all.slice(((o?.pageNumber ?? 1) - 1) * 50, (o?.pageNumber ?? 1) * 50) }) });
    expect(await createClient(kf, { sleep: noSleep }).listMine("CIQ_Case_A00")).toHaveLength(120);
  });
  it("task lists dedupe by _id|act: three Part 2 activities of one case across a page boundary each appear once", async () => {
    // page 1: 49 single tasks + case X act a; page 2: case X act a again (repeat), act b, act c, then a short page
    const p1 = [...rows(49, 0, (i) => `A${i}`), { _id: "PkX", _activity_instance_id: "a" }];
    const p2 = [{ _id: "PkX", _activity_instance_id: "a" }, { _id: "PkX", _activity_instance_id: "b" }, { _id: "PkX", _activity_instance_id: "c" }];
    const { kf } = fakeKf({ getMyTasksItems: async (o) => ({ _id: "v", Columns: [], Sort: [], Filter: {}, Data: (o?.pageNumber ?? 1) === 1 ? p1 : p2 }) });
    const got = await createClient(kf, { sleep: noSleep }).listTasks("CIQ_Case_A00");
    expect(got).toHaveLength(52);
    expect(got.filter((r) => r._id === "PkX").map((r) => r._activity_instance_id)).toEqual(["a", "b", "c"]);
  });
  it("stops when a page brings no new row (a host that ignores the page number)", async () => {
    const page = rows(50);
    const get = vi.fn(async () => ({ Data: page }));
    const { kf } = fakeKf({ getMyItems: get });
    expect(await createClient(kf, { sleep: noSleep }).listMine("CIQ_Case_A00")).toHaveLength(50);
    expect(get).toHaveBeenCalledTimes(2);
  });
  it("stops on the reported total", async () => {
    const get = vi.fn(async () => ({ items: rows(50), total: 50 }));
    const { kf } = fakeKf({ getMyItems: get });
    await createClient(kf, { sleep: noSleep }).listMine("CIQ_Case_A00");
    expect(get).toHaveBeenCalledTimes(1);
  });
  it("throws after 200 full pages instead of returning a silently cut list", async () => {
    let n = 0;
    const { kf } = fakeKf({ getMyItems: async () => ({ Data: rows(50, 50 * n++) }) });
    await expect(createClient(kf, { sleep: noSleep }).listMine("CIQ_Case_A00")).rejects.toThrow(/not read completely/);
  });
  it("refuses an unknown envelope instead of reading it as empty", async () => {
    const { kf } = fakeKf({ getMyItems: async () => ({ rows: [] }) });
    await expect(createClient(kf, { sleep: noSleep }).listMine("CIQ_Case_A00")).rejects.toThrow(/unknown shape/);
  });
});

describe("calls", () => {
  it("retries a rate-limited call (×3) and then succeeds", async () => {
    let n = 0;
    const sleep = vi.fn(noSleep);
    const { kf } = fakeKf({ getMyTasksItems: async () => (++n < 3 ? Promise.reject({ status: 429 }) : [{ _id: "t1", _activity_instance_id: "a" }]) });
    expect(await createClient(kf, { sleep }).listTasks("CIQ_Case_A00")).toHaveLength(1);
    expect(sleep).toHaveBeenCalledTimes(2);
  });
  it("a call that never answers rejects with TimeoutError (not a failure: the caller marks the item uncertain)", async () => {
    const { kf } = fakeKf({ updateItem: () => new Promise(() => {}) });
    await expect(createClient(kf, { callTimeoutMs: 20 }).update("CIQ_Case_A00", "Pk1", "A1", { X: 1 })).rejects.toBeInstanceOf(TimeoutError);
  });
  it("getAdminItem falls back to the admin REST route as a GET only, with _application_id = APP_ID", async () => {
    const { kf, api } = fakeKf({ getAdminItem: () => Promise.reject({ isError: true, errorMessage: "not available here" }) });
    const it = await createClient(kf, { sleep: noSleep }).getAdminItem("CIQ_Case_A00", "Pk9");
    expect(it._id).toBe("Pk9");
    expect(api).toHaveBeenCalledWith("/process/2/AcTEST/admin/CIQ_Case_A00/Pk9?_application_id=CIQ_Digital_A00", { method: "GET" });
  });
  it("getAdminItem does not fall back on a data refusal", async () => {
    const { kf, api } = fakeKf({ getAdminItem: () => Promise.reject({ error_code: "KISSFLOW_ERROR_050312", en_message: "no" }) });
    await expect(createClient(kf, { sleep: noSleep }).getAdminItem("CIQ_Case_A00", "Pk9")).rejects.toBeInstanceOf(WbError);
    expect(api).not.toHaveBeenCalled();
  });
  it("openForm is bounded to 8 s and reports hang / refusal", async () => {
    const hang = fakeKf({ openForm: () => new Promise(() => {}) });
    expect(await createClient(hang.kf, { openFormTimeoutMs: 20 }).openForm("CIQ_Case_A00", "Pk1", "A1")).toBe("timeout");
    const refuse = fakeKf({ openForm: () => Promise.reject({ isError: true, errorMessage: "no" }) });
    expect(await createClient(refuse.kf).openForm("CIQ_Case_A00", "Pk1", "A1")).toBe("refused");
    const ok = fakeKf({ openForm: () => undefined });
    expect(await createClient(ok.kf).openForm("CIQ_Case_A00", "Pk1", "A1")).toBe("opened");
  });
  it("refusal helpers: 050313, moved out of your queue, refused field names", () => {
    const e = { isError: true, errorMessage: { error_code: "KISSFLOW_ERROR_050313", en_message: "You don't have permission to update the following fields: SAF_Open_Count, SAF_RMES_Gaps" } };
    expect(isFieldRefusal(e)).toBe(true);
    expect(refusedFieldsOf(e, ["SAF_Open_Count", "SAF_RMES_Gaps", "SAF_Review_Confirm"])).toEqual(["SAF_Open_Count", "SAF_RMES_Gaps"]);
    expect(isMovedOut({ isError: true, errorMessage: "This item has moved out of your queue" })).toBe(true);
  });
});

describe("read ladder (§6.2)", () => {
  it("rung 1 when the admin list answers", async () => {
    const { kf } = fakeKf({ getAdminItems: async () => ({ Data: rows(3) }) });
    const r = await createClient(kf, { sleep: noSleep }).readLadder("CIQ_Case_A00");
    expect(r.quality).toBe("admin");
  });
  it("falls to mine ∪ tasks (deduped by _id) when the admin list is refused; the viewer rung stays disabled", async () => {
    const { kf } = fakeKf({
      getAdminItems: () => Promise.reject({ isError: true, errorMessage: "no admin access" }),
      getMyItems: async () => ({ Data: rows(2) }),
      getMyTasksItems: async () => ({ Data: [{ _id: "Pk1", _activity_instance_id: "a" }, { _id: "Pk7", _activity_instance_id: "b" }] }),
    });
    const r = await createClient(kf, { sleep: noSleep }).readLadder("CIQ_Case_A00");
    expect(r.quality).toBe("mine+tasks");
    expect(r.rows.map((x) => x._id).sort()).toEqual(["Pk0", "Pk1", "Pk7"]);
    expect(r.tried.map((t) => [t.rung, t.ok])).toEqual([
      ["admin", false],
      ["viewer", false],
      ["mine+tasks", true],
    ]);
  });
  it("skipAdmin sends no admin list call (the View as lens)", async () => {
    const admin = vi.fn(async () => ({ Data: [] }));
    const { kf } = fakeKf({ getAdminItems: admin, getMyItems: async () => [], getMyTasksItems: async () => [] });
    await createClient(kf, { sleep: noSleep }).readLadder("CIQ_Case_A00", { skipAdmin: true });
    expect(admin).not.toHaveBeenCalled();
  });
});
