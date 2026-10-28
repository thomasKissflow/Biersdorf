// The app client against a scripted SDK handle (DESIGN §7.1): paging, list envelopes, 429 retry (the screens' backoff,
// and the data console's longer one with Retry-After, 26 Oct), the 30 s bound, the
// calls in flight (at most 6, in order), the admin REST fallback, form create's new id, the webhook route order (no-cors
// fetch first, kf.api on the URL's path only when it throws; a relative URL by kf.api only), the Kissflow host around the
// frame, and writes refused outside CIQ_Digital_A00.
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Kf, KfDataform, KfProcess } from "@/portal/kf/sdk";
import { APP_ID } from "../ids";
import { AppError, CONSOLE_IN_FLIGHT, CONSOLE_RETRY, CONSOLE_RETRY_BUDGET_MS, MAX_IN_FLIGHT, NOT_IN_APP, PAGE_SIZE, RATE_LIMITED, RateLimitError, consoleClientOptions, createAppClient, kfCode, newFormQueue, pool, retryAfterMs } from "./client";

const noSleep = async () => {};
const page = (tag: string, n: number) => Array.from({ length: n }, (_, i) => ({ _id: `${tag}${i}` }));

function fakeKf(proc: Partial<KfProcess> = {}, form: Partial<KfDataform> = {}, extra: Partial<Kf> & { appId?: string } = {}) {
  const apiCalls: { url: string; opts?: { method?: string; body?: unknown; headers?: Record<string, string> } }[] = [];
  const flows: string[] = [];
  const { appId = APP_ID, ...rest } = extra;
  const kf = {
    user: { _id: "UsRmm1", Name: "Ruth Brandt" },
    account: { _id: "AcTEST" },
    app: {
      _id: appId,
      getProcess: (id: string) => (flows.push(id), proc as KfProcess),
      getDataform: (id: string) =>
        (flows.push(id),
        {
          getItems: async () => ({ Data: [] }),
          getItem: async (o: { itemId: string }) => ({ _id: o.itemId }),
          createItem: async () => ({ _id: "Draft_1" }),
          submitItem: async () => ({ _id: "FmNew42" }),
          updateItem: async () => ({}),
          deleteItem: async () => ({}),
          ...form,
        }) as KfDataform,
    },
    api: async (url: string, opts?: { method?: string; body?: unknown; headers?: Record<string, string> }) => {
      apiCalls.push({ url, opts });
      return { _id: url.split("?")[0].split("/").pop() }; // the item routes answer with the item
    },
    ...rest,
  } as unknown as Kf;
  return { kf, apiCalls, flows };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("lists: paging and envelopes", () => {
  it("pages until a short page, on a host that answers 50 rows per page whatever is asked (a cap)", async () => {
    const asked: unknown[] = [];
    const { kf, flows } = fakeKf({
      getAdminItems: async (o) => {
        asked.push(o);
        return { Data: o?.pageNumber === 3 ? page("c", 7) : page(`p${o?.pageNumber}-`, 50) };
      },
    });
    const c = createAppClient(kf, { sleep: noSleep });
    expect(await c.adminList("case")).toHaveLength(107);
    expect(asked).toEqual([1, 2, 3].map((pageNumber) => ({ pageNumber, pageSize: PAGE_SIZE })));
    expect(flows).toEqual(["CIQ_Case_A00"]);
  });

  it("26 Oct: asks PAGE_SIZE (200) rows a call; a host that honours it reads 120 rows in one call plus one empty read", async () => {
    const all = page("h", 120);
    const asked: number[] = [];
    const { kf } = fakeKf({
      getAdminItems: async (o) => {
        asked.push(Number(o?.pageNumber));
        const n = Number(o?.pageNumber), size = Number(o?.pageSize);
        return { Data: all.slice((n - 1) * size, n * size) };
      },
    });
    const c = createAppClient(kf, { sleep: noSleep });
    expect(PAGE_SIZE).toBe(200);
    expect(await c.adminList("case")).toHaveLength(120);
    expect(asked).toEqual([1, 2]);
  });

  it("26 Oct: a page under HOST_PAGE_FLOOR (50) is the last one: one call; a host capping at 100 is read to the end", async () => {
    let calls = 0;
    const small = fakeKf({ getMyItems: async () => (calls++, page("s", 30)) });
    expect(await createAppClient(small.kf, { sleep: noSleep }).myItems("review")).toHaveLength(30);
    expect(calls).toBe(1);
    const all = page("k", 240);
    const asked: number[] = [];
    const capped = fakeKf({
      getAdminItems: async (o) => {
        asked.push(Number(o?.pageNumber));
        const n = Number(o?.pageNumber);
        return { Data: all.slice((n - 1) * 100, n * 100) };
      },
    });
    expect(await createAppClient(capped.kf, { sleep: noSleep }).adminList("case")).toHaveLength(240);
    expect(asked).toEqual([1, 2, 3]);
  });

  it("stops when the host ignores the page number and repeats a page", async () => {
    let n = 0;
    const { kf } = fakeKf({ getMyItems: async () => (n++, page("r", 50)) });
    const c = createAppClient(kf, { sleep: noSleep });
    expect(await c.myItems("review")).toHaveLength(50);
    expect(n).toBe(2);
  });

  it("reads { Data }, { items, total } (stopping at the total) and a bare array", async () => {
    const all = page("x", 100);
    const asked: number[] = [];
    const { kf } = fakeKf(
      {
        getMyTasksItems: async (o) => {
          asked.push(Number(o?.pageNumber));
          const n = Number(o?.pageNumber);
          return { items: all.slice((n - 1) * 50, n * 50), total: 100 };
        },
        getMyItems: async () => [{ _id: "a" }, { _id: "b" }],
      },
      { getItems: async () => ({ _id: "view", Columns: [], Data: [{ _id: "Fm1" }] }) },
    );
    const c = createAppClient(kf, { sleep: noSleep });
    expect(await c.myTasks("op", "Activity_1go37bt")).toHaveLength(100);
    expect(asked).toEqual([1, 2]);
    expect((await c.myItems("case")).map((r) => r._id)).toEqual(["a", "b"]);
    expect((await c.formList("audit")).map((r) => r._id)).toEqual(["Fm1"]);
  });

  it("refuses an envelope it does not know instead of reading it as an empty list", async () => {
    const { kf } = fakeKf({ getMyItems: async () => ({ rows: [{ _id: "a" }], size: 1 }) });
    const c = createAppClient(kf, { sleep: noSleep });
    await expect(c.myItems("case")).rejects.toThrow(/unknown shape \(keys: rows, size\)/);
  });

  it("takes a Kissflow error answer for an error, not for a list", async () => {
    const { kf } = fakeKf({ getAdminItems: async () => ({ error_code: "KISSFLOW_ERROR_00010", en_message: "Access denied" }) });
    const c = createAppClient(kf, { sleep: noSleep });
    await expect(c.adminList("op")).rejects.toThrow("KISSFLOW_ERROR_00010 Access denied");
  });

  it("filters My tasks by step and keeps every activity instance of an item", async () => {
    const seen: unknown[] = [];
    const { kf } = fakeKf({
      getMyTasksItems: async (o) => (
        seen.push(o),
        { _id: "view", Columns: [], Sort: [], Filter: [], Data: [{ _id: "Pk1", _activity_instance_id: "A1" }, { _id: "Pk1", _activity_instance_id: "A2" }] }
      ),
    });
    const c = createAppClient(kf, { sleep: noSleep });
    const rows = await c.myTasks("review", "Activity_12d3ab4");
    expect(rows.map((r) => r._activity_instance_id)).toEqual(["A1", "A2"]);
    expect(seen).toEqual([{ pageNumber: 1, pageSize: 200, activityId: "Activity_12d3ab4" }]);
  });
});

describe("retries and bounds", () => {
  it("backs off on 429 and then succeeds", async () => {
    let n = 0;
    const sleep = vi.fn(async (_ms: number) => {});
    const { kf } = fakeKf({
      getMyItems: async () => {
        if (++n < 3) throw n === 1 ? { status: 429, en_message: "Too many requests" } : { isError: true, errorMessage: { status: 429 } };
        return [{ _id: "t1" }];
      },
    });
    const c = createAppClient(kf, { sleep });
    expect((await c.myItems("op")).map((r) => r._id)).toEqual(["t1"]);
    expect(sleep).toHaveBeenCalledTimes(2);
    const [first, second] = sleep.mock.calls.map((a) => Number(a[0]));
    expect(first).toBeGreaterThanOrEqual(600);
    expect(second).toBeGreaterThanOrEqual(1200);
  });

  it("gives up after the retries", async () => {
    let n = 0;
    const { kf } = fakeKf({ getMyItems: async () => (n++, Promise.reject({ status: 429, en_message: "Too many requests" })) });
    const c = createAppClient(kf, { sleep: noSleep, retries: 2 });
    await expect(c.myItems("op")).rejects.toBeInstanceOf(AppError);
    expect(n).toBe(3);
  });

  it("does not retry a refusal, and keeps Kissflow's own text and code", async () => {
    let n = 0;
    const { kf } = fakeKf({
      submitItem: async () => {
        n++;
        throw { isError: true, errorMessage: { error_code: "KISSFLOW_ERROR_050201", en_message: "This item has moved out of your queue." } };
      },
    });
    const c = createAppClient(kf, { sleep: noSleep });
    const err = await c.submit("review", "Pk1", "Act1").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).message).toBe("KISSFLOW_ERROR_050201 This item has moved out of your queue.");
    expect(kfCode(err)).toBe("050201");
    expect(n).toBe(1);
  });

  it("bounds every call at 30 s by default (the SDK itself waits forever)", async () => {
    vi.useFakeTimers();
    const { kf } = fakeKf({ getMyItems: () => new Promise(() => {}) });
    const c = createAppClient(kf, { sleep: noSleep });
    const done = expect(c.myItems("case")).rejects.toThrow("Kissflow did not answer within 30 s.");
    await vi.advanceTimersByTimeAsync(29999);
    await vi.advanceTimersByTimeAsync(1);
    await done;
  });

  it("takes a shorter bound when asked", async () => {
    const { kf } = fakeKf({ getItem: () => new Promise(() => {}) });
    const c = createAppClient(kf, { sleep: noSleep, callTimeoutMs: 20 });
    await expect(c.getTask("op", "Pk1", "Act1")).rejects.toThrow(/did not answer/);
  });
});

describe("the data console's rate-limit backoff (26 Oct, after Thomas's 429s)", () => {
  const limited = { isError: true, errorMessage: { status: 429, en_message: "Too Many Requests" } };

  it("a fake that answers 429 twice and then 200: waits 1 s then 2 s (exponential, + jitter) and succeeds", async () => {
    let n = 0;
    const waits: number[] = [];
    const notes: number[] = [];
    const { kf, apiCalls } = fakeKf({}, {}, { api: async (url: string) => (apiCalls.push({ url }), n++ < 2 ? Promise.reject(limited) : {}) } as never);
    const c = createAppClient(kf, consoleClientOptions({ sleep: async (ms) => void waits.push(ms), onRateLimit: (ms) => void notes.push(ms) }));
    await c.adminDelete!("op", "PkOp1");
    expect(n).toBe(3);
    expect(waits).toHaveLength(2);
    expect(waits[0]).toBeGreaterThanOrEqual(1000);
    expect(waits[0]).toBeLessThanOrEqual(1200);
    expect(waits[1]).toBeGreaterThanOrEqual(2000);
    expect(waits[1]).toBeLessThanOrEqual(2400);
    expect(notes).toEqual(waits); // the console says it waits
  });

  it("honours a Retry-After the answer carries (seconds, an HTTP date, in headers or on the error)", async () => {
    let n = 0;
    const waits: number[] = [];
    const { kf } = fakeKf({ getMyItems: async () => (n++ < 1 ? Promise.reject({ ...limited, errorMessage: { ...limited.errorMessage, headers: { "Retry-After": "3" } } }) : [{ _id: "t1" }]) });
    const c = createAppClient(kf, consoleClientOptions({ sleep: async (ms) => void waits.push(ms) }));
    expect((await c.myItems("op")).map((r) => r._id)).toEqual(["t1"]);
    expect(waits).toEqual([3000]);
    const now = Date.parse("2026-10-26T10:00:00Z");
    expect(retryAfterMs({ status: 429, retryAfter: 2 }, now)).toBe(2000);
    expect(retryAfterMs({ errorMessage: { retry_after: "4" } }, now)).toBe(4000);
    expect(retryAfterMs({ response: { headers: new Headers({ "Retry-After": "Mon, 26 Oct 2026 10:00:05 GMT" }) } }, now)).toBe(5000);
    expect(retryAfterMs(new Error("429 Too Many Requests; Retry-After: 7"), now)).toBe(7000);
    expect(retryAfterMs({ status: 429 }, now)).toBeUndefined();
  });

  it(`gives up after about ${CONSOLE_RETRY_BUDGET_MS / 1000} s waited in all, with the plain text (a RateLimitError)`, async () => {
    let n = 0;
    const waits: number[] = [];
    const { kf } = fakeKf({ getMyItems: async () => (n++, Promise.reject(limited)) });
    const c = createAppClient(kf, consoleClientOptions({ sleep: async (ms) => void waits.push(ms), random: () => 0.99 }));
    const err = await c.myItems("op").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(RateLimitError);
    expect((err as Error).message).toBe(RATE_LIMITED);
    expect(RATE_LIMITED).toBe("Kissflow is limiting requests right now. Wait a minute, then try again.");
    const total = waits.reduce((a, b) => a + b, 0);
    expect(total).toBeLessThanOrEqual(CONSOLE_RETRY_BUDGET_MS);
    expect(total).toBeGreaterThan(CONSOLE_RETRY_BUDGET_MS - 1000);
    // 1 s, 2 s, 4 s, 8 s, each + up to 20 % jitter, then what is left of the 30 s
    expect(waits.slice(0, 4).every((w, i) => w >= 1000 * 2 ** i && w <= 1200 * 2 ** i)).toBe(true);
    expect(n).toBe(waits.length + 1);
  });

  it("a Retry-After beyond the 30 s gives up at once; the policy alone: 1 s, 2 s, 4 s, 8 s …", () => {
    expect(CONSOLE_RETRY.wait(0, 0, 31000, () => 0)).toBeUndefined();
    expect(CONSOLE_RETRY.wait(2, 10000, 5000, () => 0)).toBe(5000);
    expect([0, 1, 2, 3, 4].map((a) => CONSOLE_RETRY.wait(a, 0, undefined, () => 0))).toEqual([1000, 2000, 4000, 8000, 16000]);
    expect(CONSOLE_RETRY.wait(4, 15000, undefined, () => 0)).toBe(15000); // cut to what is left of the 30 s
    expect(CONSOLE_RETRY.wait(5, 29500, undefined, () => 0)).toBeUndefined();
  });

  it("a call still rate-limited is not tried again by the REST route (the form delete, the admin read)", async () => {
    const { kf, apiCalls } = fakeKf({ getAdminItem: async () => Promise.reject(limited) }, { deleteItem: async () => Promise.reject(limited) });
    const c = createAppClient(kf, consoleClientOptions({ sleep: noSleep }));
    await expect(c.formDelete!("note", "FmNote1")).rejects.toThrow(RATE_LIMITED);
    await expect(c.adminGet("case", "AppZZT-0001")).rejects.toBeInstanceOf(RateLimitError);
    expect(apiCalls).toEqual([]);
  });

  it("the CIQ screens keep their own backoff and Kissflow's text", async () => {
    let n = 0;
    const waits: number[] = [];
    const { kf } = fakeKf({ getMyItems: async () => (n++, Promise.reject(limited)) });
    const err = await createAppClient(kf, { sleep: async (ms) => void waits.push(ms), random: () => 0 }).myItems("op").catch((e: unknown) => e);
    expect(waits).toEqual([600, 1200, 1800]);
    expect(err).toBeInstanceOf(AppError);
    expect(err).not.toBeInstanceOf(RateLimitError);
    expect((err as Error).message).toBe("Too Many Requests");
  });

  it(`the console's client keeps at most ${CONSOLE_IN_FLIGHT} calls in flight; it shares the screens' one-draft-per-form queue`, async () => {
    const sent: string[] = [];
    const open = new Map<string, (v: unknown) => void>();
    const { kf } = fakeKf({ getItem: (o) => new Promise((ok) => (sent.push(o.instanceId), open.set(o.instanceId, ok))) });
    const c = createAppClient(kf, consoleClientOptions({ sleep: noSleep }));
    const all = Promise.all(["Pk1", "Pk2", "Pk3", "Pk4"].map((id) => c.getTask("op", id, "Act1")));
    await new Promise((r) => setTimeout(r, 0));
    expect(sent).toEqual(["Pk1", "Pk2"]);
    open.get("Pk1")!({ _id: "Pk1" });
    await new Promise((r) => setTimeout(r, 0));
    expect(sent).toEqual(["Pk1", "Pk2", "Pk3"]);
    for (const id of ["Pk2", "Pk3"]) open.get(id)!({ _id: id });
    await new Promise((r) => setTimeout(r, 0));
    open.get("Pk4")!({ _id: "Pk4" });
    expect((await all).map((x) => x._id)).toEqual(["Pk1", "Pk2", "Pk3", "Pk4"]);
    // one form create at a time across both clients
    let inCreate = 0;
    let most = 0;
    const slowForm = { createItem: async () => (inCreate++, (most = Math.max(most, inCreate)), await new Promise((r) => setTimeout(r, 2)), { _id: "Draft_1" }), submitItem: async () => (inCreate--, { _id: "FmNew" }) };
    const both = fakeKf({}, slowForm);
    const queue = newFormQueue();
    const screens = createAppClient(both.kf, { sleep: noSleep, formQueue: queue });
    const console_ = createAppClient(both.kf, consoleClientOptions({ sleep: noSleep, formQueue: queue }));
    await Promise.all([screens.formCreate("audit", {}), console_.formCreate("audit", {})]);
    expect(most).toBe(1);
  });
});

describe("calls in flight", () => {
  /** getItem answers only when the test lets it; `sent` lists the instance ids as they go out. */
  function held() {
    const sent: string[] = [];
    const open = new Map<string, (v: unknown) => void>();
    const { kf } = fakeKf({ getItem: (o) => new Promise((ok) => (sent.push(o.instanceId), open.set(o.instanceId, ok))) });
    const answer = async (id: string) => {
      open.get(id)!({ _id: id });
      await new Promise((r) => setTimeout(r, 0));
    };
    return { kf, sent, answer };
  }

  it(`keeps at most ${MAX_IN_FLIGHT} calls in flight; the others go out in the order they came, one per answer`, async () => {
    const { kf, sent, answer } = held();
    const c = createAppClient(kf, { sleep: noSleep });
    const ids = Array.from({ length: MAX_IN_FLIGHT + 3 }, (_, i) => `Pk${i}`);
    const all = Promise.all(ids.map((id) => c.getTask("op", id, "Act1")));
    await new Promise((r) => setTimeout(r, 0));
    expect(sent).toEqual(ids.slice(0, MAX_IN_FLIGHT));
    await answer("Pk3");
    expect(sent).toEqual(ids.slice(0, MAX_IN_FLIGHT + 1));
    for (const id of ids.slice(0, 3)) await answer(id);
    expect(sent).toEqual(ids);
    for (const id of ids.slice(4)) await answer(id);
    expect((await all).map((it) => it._id)).toEqual(ids);
  });

  it("frees the slot of a refused call, and takes another limit when asked", async () => {
    let n = 0;
    const { kf } = fakeKf({ getItem: async () => (n++, Promise.reject({ isError: true, errorMessage: "Refused" })) });
    const c = createAppClient(kf, { sleep: noSleep, maxInFlight: 1 });
    const out = await Promise.allSettled(["Pk1", "Pk2", "Pk3"].map((id) => c.getTask("op", id, "Act1")));
    expect(out.map((o) => o.status)).toEqual(["rejected", "rejected", "rejected"]);
    expect(n).toBe(3);
  });

  it("starts the 30 s bound when the call goes out, not while it waits for its turn", async () => {
    vi.useFakeTimers();
    const { kf, sent, answer } = held();
    const c = createAppClient(kf, { sleep: noSleep, maxInFlight: 1 });
    const first = c.getTask("op", "Pk1", "Act1");
    const second = c.getTask("op", "Pk2", "Act1").catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(20000);
    expect(sent).toEqual(["Pk1"]);
    const answered = answer("Pk1");
    await vi.advanceTimersByTimeAsync(1);
    await answered;
    expect((await first)._id).toBe("Pk1");
    expect(sent).toEqual(["Pk1", "Pk2"]);
    // 20 s waiting + 20 s out: still within its own 30 s
    await vi.advanceTimersByTimeAsync(20000);
    const late = answer("Pk2");
    await vi.advanceTimersByTimeAsync(1);
    await late;
    expect(await second).toEqual({ _id: "Pk2", _activity_instance_id: "Act1" });
  });
});

describe("item reads", () => {
  it("adminGet uses the SDK's admin call when it answers", async () => {
    const { kf, apiCalls } = fakeKf({ getAdminItem: async (o) => ({ _id: o.instanceId, Trade_Name: "Zetanol" }) });
    const c = createAppClient(kf, { sleep: noSleep });
    expect(await c.adminGet("case", "PkC1")).toEqual({ _id: "PkC1", Trade_Name: "Zetanol" });
    expect(apiCalls).toEqual([]);
  });

  it("adminGet falls back to the admin REST route of the app", async () => {
    const { kf, apiCalls } = fakeKf({ getAdminItem: async () => Promise.reject({ isError: true, errorMessage: "Unknown command" }) });
    const c = createAppClient(kf, { sleep: noSleep });
    expect((await c.adminGet("op", "PkO9"))._id).toBe("PkO9");
    expect(apiCalls).toEqual([{ url: "/process/2/AcTEST/admin/CIQ_Open_Point_A00/PkO9?_application_id=CIQ_Digital_A00", opts: { method: "GET" } }]);
  });

  it("adminGet goes straight to REST when the SDK has no admin call", async () => {
    const { kf, apiCalls } = fakeKf({});
    const c = createAppClient(kf, { sleep: noSleep });
    expect((await c.adminGet("review", "PkR1"))._id).toBe("PkR1");
    expect(apiCalls.map((a) => a.url)).toEqual(["/process/2/AcTEST/admin/CIQ_Review_A00/PkR1?_application_id=CIQ_Digital_A00"]);
  });

  it.each(["KISSFLOW_ERROR_050313", "KISSFLOW_ERROR_050312"])("adminGet does not fall back on a data refusal (%s)", async (code) => {
    const { kf, apiCalls } = fakeKf({
      getAdminItem: async () => Promise.reject({ isError: true, errorMessage: { error_code: code, en_message: "Refused" } }),
    });
    const c = createAppClient(kf, { sleep: noSleep });
    await expect(c.adminGet("case", "PkC1")).rejects.toThrow(`${code} Refused`);
    expect(apiCalls).toEqual([]);
  });

  it("adminGet names both causes when the SDK and REST both fail, and never takes an error body for the item", async () => {
    const both = fakeKf(
      { getAdminItem: async () => Promise.reject({ isError: true, errorMessage: "Unknown command" }) },
      {},
      { api: (async () => Promise.reject({ error_code: "KISSFLOW_ERROR_00010", en_message: "Access denied" })) as unknown as Kf["api"] },
    );
    await expect(createAppClient(both.kf, { sleep: noSleep }).adminGet("case", "PkC1")).rejects.toThrow(/Unknown command \(SDK\); KISSFLOW_ERROR_00010 Access denied \(REST\)/);
    const body = fakeKf({}, {}, { api: (async () => ({ _id: "err-1", error_code: "KISSFLOW_ERROR_01015", en_message: "Document not found" })) as unknown as Kf["api"] });
    await expect(createAppClient(body.kf, { sleep: noSleep }).adminGet("case", "PkC1")).rejects.toThrow("Document not found");
  });

  it("getTask reads through the activity instance, keeps it on the item, and refuses another item", async () => {
    const asked: unknown[] = [];
    const { kf } = fakeKf({ getItem: async (o) => (asked.push(o), o.instanceId === "PkX" ? { _id: "PkOther" } : { _id: o.instanceId, Question_Text: "Q" }) });
    const c = createAppClient(kf, { sleep: noSleep });
    expect(await c.getTask("op", "PkO1", "Act7")).toEqual({ _id: "PkO1", Question_Text: "Q", _activity_instance_id: "Act7" });
    expect(asked).toEqual([{ instanceId: "PkO1", activityInstanceId: "Act7" }]);
    await expect(c.getTask("op", "PkX", "Act8")).rejects.toThrow(/different item \(PkOther\)/);
  });

  it("getById probes the viewer route of the app", async () => {
    const { kf, apiCalls } = fakeKf({});
    const c = createAppClient(kf, { sleep: noSleep });
    expect((await c.getById("case", "PkC2"))._id).toBe("PkC2");
    expect(apiCalls).toEqual([{ url: "/process/2/AcTEST/CIQ_Case_A00/PkC2?_application_id=CIQ_Digital_A00", opts: { method: "GET" } }]);
  });

  it("formGet reads the row by its item id", async () => {
    const asked: unknown[] = [];
    const { kf, flows } = fakeKf({}, { getItem: async (o) => (asked.push(o), { _id: o.itemId, RMES_Key: "ZZT-0001-RMES-SAF" }) });
    const c = createAppClient(kf, { sleep: noSleep });
    expect((await c.formGet("rmesSAF", "FmR1")).RMES_Key).toBe("ZZT-0001-RMES-SAF");
    expect(asked).toEqual([{ itemId: "FmR1" }]);
    expect(flows).toEqual(["CIQ_RMES_Safety_A00"]);
  });
});

describe("process writes", () => {
  it("create returns the new item and the Start step's activity instance", async () => {
    const created: unknown[] = [];
    const { kf } = fakeKf({ createItem: async (o) => (created.push(o), { _id: "PkNew", _activity_instance_id: "ActNew" }) });
    const c = createAppClient(kf, { sleep: noSleep });
    expect(await c.create("op", { OP_Key: "ZZT-0001-QM-1" })).toEqual({ id: "PkNew", act: "ActNew" });
    expect(created).toEqual([{ data: { OP_Key: "ZZT-0001-QM-1" } }]);
  });

  it("create finds the activity instance in _current_context, then in the draft list", async () => {
    const ctx = fakeKf({ createItem: async () => ({ _id: "PkA", _current_context: [{ _context_activity_instance_id: "ActCtx" }] }) });
    expect(await createAppClient(ctx.kf, { sleep: noSleep }).create("review", {})).toEqual({ id: "PkA", act: "ActCtx" });
    const drafts: unknown[] = [];
    const listed = fakeKf({
      createItem: async () => ({ _id: "PkB" }),
      getMyItems: async (o) => (drafts.push(o), { Columns: [], Data: [{ _id: "PkZ", _activity_instance_id: "ActZ" }, { _id: "PkB", _activity_instance_id: "ActB" }] }),
    });
    expect(await createAppClient(listed.kf, { sleep: noSleep }).create("review", {})).toEqual({ id: "PkB", act: "ActB" });
    expect(drafts).toEqual([{ status: "draft", pageNumber: 1, pageSize: 200 }]);
    const none = fakeKf({ createItem: async () => ({ _id: "PkC" }), getMyItems: async () => ({ Data: [] }) });
    await expect(createAppClient(none.kf, { sleep: noSleep }).create("case", {})).rejects.toThrow(/created CIQ_Case_A00 item PkC without naming its step/);
  });

  it("update, submit and discard pass the SDK's own option shapes", async () => {
    const seen: string[] = [];
    const { kf } = fakeKf({
      updateItem: async (o) => (seen.push(`update ${JSON.stringify(o)}`), {}),
      submitItem: async (o) => (seen.push(`submit ${JSON.stringify(o)}`), {}),
      discardItem: async (o) => (seen.push(`discard ${JSON.stringify(o)}`), {}),
    });
    const c = createAppClient(kf, { sleep: noSleep });
    await c.update("op", "Pk1", "Act1", { OP_Outcome: "Accepted" });
    await c.submit("op", "Pk1", "Act1");
    await c.discard("case", "Pk2");
    expect(seen).toEqual([
      'update {"instanceId":"Pk1","activityInstanceId":"Act1","data":{"OP_Outcome":"Accepted"}}',
      'submit {"instanceId":"Pk1","activityInstanceId":"Act1"}',
      'discard {"instanceId":"Pk2"}',
    ]);
  });

  it("takes a Kissflow error answer to a write for an error", async () => {
    const { kf } = fakeKf({
      updateItem: async () => ({ error_code: "KISSFLOW_ERROR_050313", en_message: "You don't have permission to update the following fields" }),
    });
    const c = createAppClient(kf, { sleep: noSleep });
    await expect(c.update("op", "Pk1", "Act1", { Thread_JSON: "{}" })).rejects.toThrow(/^KISSFLOW_ERROR_050313/);
  });
});

describe("form writes", () => {
  it("formCreate creates a draft, submits it, and returns the submit's NEW id", async () => {
    const seen: string[] = [];
    const { kf } = fakeKf(
      {},
      {
        createItem: async (o) => (seen.push(`create ${JSON.stringify(o)}`), { _id: "Draft_7" }),
        submitItem: async (o) => (seen.push(`submit ${JSON.stringify(o)}`), { _id: "FmAudit42" }),
      },
    );
    const c = createAppClient(kf, { sleep: noSleep });
    expect(await c.formCreate("audit", { Event_Key: "EV-ZZT-0001-20261020210000-ab12" })).toBe("FmAudit42");
    expect(seen).toEqual(['create {"data":{"Event_Key":"EV-ZZT-0001-20261020210000-ab12"}}', 'submit {"itemId":"Draft_7"}']);
  });

  it("m1: formCreate takes a bare string answer for the new id (the SDK unwraps a one-key {_id})", async () => {
    const { kf } = fakeKf({}, { submitItem: async () => "FmAudit77" as unknown as { _id: string } });
    expect(await createAppClient(kf, { sleep: noSleep }).formCreate("audit", {})).toBe("FmAudit77");
  });

  it("formCreate keeps the draft id when the submit answers without one", async () => {
    const { kf } = fakeKf({}, { submitItem: async () => ({}) });
    expect(await createAppClient(kf, { sleep: noSleep }).formCreate("note", {})).toBe("Draft_1");
  });

  it("formCreate runs one create at a time per form (one draft per user per form)", async () => {
    const order: string[] = [];
    let n = 0;
    const { kf } = fakeKf(
      {},
      {
        createItem: async () => {
          const k = ++n;
          order.push(`create ${k}`);
          await new Promise((r) => setTimeout(r, 5));
          return { _id: `Draft_${k}` };
        },
        submitItem: async (o) => (order.push(`submit ${o.itemId}`), { _id: `Fm_${o.itemId}` }),
      },
    );
    const c = createAppClient(kf, { sleep: noSleep });
    expect(await Promise.all([c.formCreate("audit", {}), c.formCreate("audit", {})])).toEqual(["Fm_Draft_1", "Fm_Draft_2"]);
    expect(order).toEqual(["create 1", "submit Draft_1", "create 2", "submit Draft_2"]);
  });

  it("a failed formCreate does not block the next one", async () => {
    let n = 0;
    const { kf } = fakeKf({}, { createItem: async () => (++n === 1 ? Promise.reject({ en_message: "boom" }) : { _id: "Draft_2" }) });
    const c = createAppClient(kf, { sleep: noSleep });
    await expect(c.formCreate("note", {})).rejects.toThrow("boom");
    expect(await c.formCreate("note", {})).toBe("FmNew42");
  });

  it("formUpdate sends child rows as Table:: deltas unchanged", async () => {
    const seen: unknown[] = [];
    const { kf } = fakeKf({}, { updateItem: async (o) => (seen.push(o), {}) });
    const c = createAppClient(kf, { sleep: noSleep });
    const data = { "Table::Safety_Criteria": [{ _id: "Safety_Criteria_ab12cd34ef", Criteria_Result: "Available" }], Open_Criteria_Count: 3 };
    await c.formUpdate("rmesSAF", "FmR1", data);
    expect(seen).toEqual([{ itemId: "FmR1", data }]);
  });
});

describe("webhooks", () => {
  const url = "https://dev-beiersdorf.kissflow.eu/integration/2/AcTEST/webhook/ZZT-hook";
  const path = "/integration/2/AcTEST/webhook/ZZT-hook";
  const failedToFetch = () => Promise.reject(new TypeError("Failed to fetch"));

  it("posts by the browser's fetch first: no-cors, text/plain, the JSON text as the body; kf.api is not called", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 200 }));
    const { kf, apiCalls } = fakeKf();
    const c = createAppClient(kf, { sleep: noSleep, fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(await c.postWebhook(url, { opItemId: "PkOp1", idempotencyKey: "HO-op.round-x" })).toBe("fetch");
    expect(fetchImpl.mock.calls).toEqual([[url, { method: "POST", mode: "no-cors", headers: { "Content-Type": "text/plain" }, body: '{"opItemId":"PkOp1","idempotencyKey":"HO-op.round-x"}' }]]);
    expect(apiCalls).toEqual([]);
  });

  it("fire-and-forget: any answer counts as sent (no-cors answers are opaque), and kf.api is never called after it", async () => {
    for (const status of [200, 404, 502]) {
      const fetchImpl = vi.fn(async () => new Response(null, { status }));
      const { kf, apiCalls } = fakeKf();
      expect(await createAppClient(kf, { sleep: noSleep, fetchImpl: fetchImpl as unknown as typeof fetch }).postWebhook(url, { a: 1 })).toBe("fetch");
      expect(apiCalls).toEqual([]);
    }
  });

  it("falls back to kf.api only when fetch THROWS (a CSP refusal, offline): a JSON string body with application/json", async () => {
    const order: string[] = [];
    const fetchImpl = vi.fn(async () => (order.push("fetch"), failedToFetch()));
    const { kf, apiCalls } = fakeKf({}, {}, { api: (async (u: string, o: unknown) => (order.push("sdk"), apiCalls.push({ url: u, opts: o as never }), {})) as unknown as Kf["api"] });
    const c = createAppClient(kf, { sleep: noSleep, fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(await c.postWebhook(url, { caseItemId: "AppZZT-0003" })).toBe("sdk");
    expect(order).toEqual(["fetch", "sdk"]);
    // on the URL's path: the SDK sends it to the account's own domain
    expect(apiCalls).toEqual([{ url: path, opts: { method: "POST", headers: { "Content-Type": "application/json" }, body: '{"caseItemId":"AppZZT-0003"}' } }]);
    // a fetch that throws at once (no fetch on the page) counts as thrown too
    const bare = fakeKf();
    const sync = (() => {
      throw new TypeError("fetch is not a function");
    }) as unknown as typeof fetch;
    expect(await createAppClient(bare.kf, { sleep: noSleep, fetchImpl: sync }).postWebhook(url, { a: 1 })).toBe("sdk");
    expect(bare.apiCalls).toHaveLength(1);
  });

  it("a relative URL (no Kissflow page around the frame) goes by kf.api only, never by fetch", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 200 }));
    const { kf, apiCalls } = fakeKf();
    const c = createAppClient(kf, { sleep: noSleep, fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(await c.postWebhook(path, { opItemId: "PkOp1", idempotencyKey: "HO-op.round-x" })).toBe("sdk");
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(apiCalls).toEqual([{ url: path, opts: { method: "POST", headers: { "Content-Type": "application/json" }, body: '{"opItemId":"PkOp1","idempotencyKey":"HO-op.round-x"}' } }]);
    const none = fakeKf({}, {}, { api: undefined as unknown as Kf["api"] });
    await expect(createAppClient(none.kf, { sleep: noSleep, fetchImpl: fetchImpl as unknown as typeof fetch }).postWebhook(path, {})).rejects.toThrow("This page has no Kissflow API route (not available).");
    // "//host/…" names a host: not a path on the account's domain
    const other = fakeKf();
    expect(await createAppClient(other.kf, { sleep: noSleep, fetchImpl: fetchImpl as unknown as typeof fetch }).postWebhook("//hooks.example/w", {})).toBe("fetch");
    expect(other.apiCalls).toEqual([]);
  });

  it("knows the Kissflow host around the frame (env.ts hookHostOf), none outside an https Kissflow page", () => {
    const { kf } = fakeKf();
    expect(createAppClient(kf, { page: { location: { ancestorOrigins: ["https://dev-beiersdorf.kissflow.eu"] } } }).hookHost).toBe("dev-beiersdorf.kissflow.eu");
    expect(createAppClient(kf, { page: { document: { referrer: "https://ciq-prod.kissflow.com/view" } } }).hookHost).toBe("ciq-prod.kissflow.com");
    expect(createAppClient(kf, { page: { location: { ancestorOrigins: ["http://127.0.0.1:5340"] } } }).hookHost).toBeUndefined();
    expect(createAppClient(kf).hookHost).toBeUndefined(); // vitest's node: no window
  });

  it("never sends a second time when fetch gave no answer within the bound (the POST may have gone out)", async () => {
    vi.useFakeTimers();
    try {
      const fetchImpl = vi.fn(() => new Promise<Response>(() => {}));
      const { kf, apiCalls } = fakeKf();
      const c = createAppClient(kf, { sleep: noSleep, fetchImpl: fetchImpl as unknown as typeof fetch, callTimeoutMs: 1000 });
      const pending = c.postWebhook(url, { a: 1 }).catch((e: unknown) => e);
      await vi.advanceTimersByTimeAsync(1500);
      expect(String(await pending)).toMatch(/The webhook did not answer within 1 s/);
      expect(apiCalls).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("names both routes when both fail, fetch first", async () => {
    const { kf } = fakeKf({}, {}, { api: (async () => Promise.reject({ error_code: "KISSFLOW_ERROR_050302", en_message: "No permission" })) as unknown as Kf["api"] });
    const c = createAppClient(kf, { sleep: noSleep, fetchImpl: failedToFetch as unknown as typeof fetch });
    await expect(c.postWebhook(url, {})).rejects.toThrow("Failed to fetch (fetch); KISSFLOW_ERROR_050302 No permission (SDK)");
    const none = fakeKf({}, {}, { api: undefined as unknown as Kf["api"] });
    await expect(createAppClient(none.kf, { sleep: noSleep, fetchImpl: failedToFetch as unknown as typeof fetch }).postWebhook(url, {})).rejects.toThrow("Failed to fetch (fetch); This page has no Kissflow API route (not available). (SDK)");
  });
});

describe("container guard", () => {
  it("refuses every write outside CIQ_Digital_A00 before calling Kissflow; reads still work", async () => {
    const touched: string[] = [];
    const spy = (name: string) => async () => (touched.push(name), { _id: "x", _activity_instance_id: "a" });
    const { kf, apiCalls } = fakeKf(
      { createItem: spy("create"), updateItem: spy("update"), submitItem: spy("submit"), discardItem: spy("discard"), getMyItems: async () => [{ _id: "r" }] },
      { createItem: spy("fcreate"), updateItem: spy("fupdate") },
      { appId: "CIQ_Supplier_Portal_A00" },
    );
    const c = createAppClient(kf, { sleep: noSleep, fetchImpl: vi.fn() as unknown as typeof fetch });
    expect(c.appId).toBe("CIQ_Supplier_Portal_A00");
    for (const p of [
      c.create("case", {}),
      c.update("op", "Pk1", "A1", {}),
      c.submit("op", "Pk1", "A1"),
      c.discard("case", "Pk1"),
      c.formCreate("note", {}),
      c.formUpdate("note", "Fm1", {}),
      c.postWebhook("https://example.invalid/hook", {}),
    ])
      await expect(p).rejects.toThrow(NOT_IN_APP);
    expect(touched).toEqual([]);
    expect(apiCalls).toEqual([]);
    expect(await c.myItems("case")).toEqual([{ _id: "r" }]);
  });

  it("knows the account and the container", () => {
    const { kf } = fakeKf();
    const c = createAppClient(kf);
    expect([c.accountId, c.appId]).toEqual(["AcTEST", "CIQ_Digital_A00"]);
  });
});

describe("file preview (27 Oct)", () => {
  const files = [{ id: "Attach_1", key: "upload/2/AcTEST/Attach_1/a.pdf", name: "a.pdf" }, { id: "Attach_2", key: "upload/2/AcTEST/Attach_2/b.pdf", name: "b.pdf" }];

  it("calls kf.client.openFilePreview with the files and the index (clamped), and resolves when it does", async () => {
    const asked: unknown[] = [];
    const { kf } = fakeKf({}, {}, { client: { openFilePreview: async (a: unknown) => void asked.push(a) } } as Partial<Kf>);
    const c = createAppClient(kf, { sleep: noSleep });
    await c.previewFiles!(files, 1);
    await c.previewFiles!(files, 7);
    await c.previewFiles!(files);
    expect(asked).toEqual([{ files, indexOfFile: 1 }, { files, indexOfFile: 1 }, { files, indexOfFile: 0 }]);
  });

  it("has no 30 s bound and holds no call slot: other calls go out while the preview is open", async () => {
    vi.useFakeTimers();
    let close!: () => void;
    const sent: string[] = [];
    const { kf } = fakeKf({ getItem: async (o) => (sent.push(o.instanceId), { _id: o.instanceId }) }, {}, { client: { openFilePreview: () => new Promise<void>((ok) => (close = ok)) } } as Partial<Kf>);
    const c = createAppClient(kf, { sleep: noSleep, maxInFlight: 1 });
    let done = false;
    const open = c.previewFiles!(files, 0).then(() => (done = true));
    await vi.advanceTimersByTimeAsync(45000);
    expect(done).toBe(false);
    expect((await c.getTask("op", "Pk1", "Act1"))._id).toBe("Pk1");
    expect(sent).toEqual(["Pk1"]);
    close();
    await open;
    expect(done).toBe(true);
  });

  it("refuses without the SDK's preview or without a file; the host's refusal comes back as an AppError; works outside the app container", async () => {
    const none = createAppClient(fakeKf().kf, { sleep: noSleep });
    await expect(none.previewFiles!(files)).rejects.toThrow("Opening files is not available here.");
    const { kf } = fakeKf({}, {}, { appId: "CIQ_Supplier_Portal_A00", client: { openFilePreview: async () => Promise.reject({ isError: true, errorMessage: "KISSFLOW_ERROR_050302 No permission" }) } } as Partial<Kf> & { appId: string });
    const c = createAppClient(kf, { sleep: noSleep });
    await expect(c.previewFiles!([])).rejects.toThrow("There is no stored file to open.");
    const e = await c.previewFiles!(files).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(AppError);
    expect(String((e as Error).message)).toMatch(/050302/);
  });
});

describe("pool", () => {
  it("keeps at most `lanes` calls in flight and the input order", async () => {
    let inFlight = 0;
    let peak = 0;
    const out = await pool([5, 1, 4, 2, 3], 2, async (n) => {
      peak = Math.max(peak, ++inFlight);
      await new Promise((r) => setTimeout(r, n));
      inFlight--;
      return n * 10;
    });
    expect(out).toEqual([50, 10, 40, 20, 30]);
    expect(peak).toBe(2);
    expect(await pool([], 4, async () => 1)).toEqual([]);
  });
});

describe("the colleague directory's reads (27 Oct, @mentions)", () => {
  it("a role by the per-role REST GET in the app, the account's users by one page; an error envelope or no API route is an error", async () => {
    const { kf, apiCalls } = fakeKf({}, {}, { api: (async (u: string, o: unknown) => (apiCalls.push({ url: u, opts: o as never }), u.startsWith("/user/") ? [{ _id: "U1", Name: "A", Kind: "User", Email: "a@x.example" }] : { _id: "RoX", Members: [] })) as unknown as Kf["api"] });
    const c = createAppClient(kf, { sleep: noSleep });
    expect(await c.roleMembers!("RoEKl85WB1yE")).toEqual({ _id: "RoX", Members: [] });
    expect(await c.accountUsers!()).toEqual([{ _id: "U1", Name: "A", Kind: "User", Email: "a@x.example" }]);
    expect(apiCalls).toEqual([
      { url: `/app_role/2/AcTEST/RoEKl85WB1yE?_application_id=${APP_ID}`, opts: { method: "GET" } },
      { url: "/user/2/AcTEST?page_number=1&page_size=500", opts: { method: "GET" } },
    ]);
    const refused = fakeKf({}, {}, { api: (async () => ({ error_code: "KISSFLOW_ERROR_050302", en_message: "No permission" })) as unknown as Kf["api"] });
    await expect(createAppClient(refused.kf, { sleep: noSleep }).roleMembers!("RoX")).rejects.toThrow(/050302/);
    const none = fakeKf({}, {}, { api: undefined as unknown as Kf["api"] });
    await expect(createAppClient(none.kf, { sleep: noSleep }).accountUsers!()).rejects.toThrow(/no Kissflow API route/);
  });
});
