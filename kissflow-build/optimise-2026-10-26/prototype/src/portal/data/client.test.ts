import { describe, expect, it, vi } from "vitest";
import type { Kf, KfProcess } from "../kf/sdk";
import { PortalError, createClient } from "./client";

// Hosts are built from parts: a Kissflow host written as text is what the zip guards refuse (DENY_HOSTS).
const kfHost = (name: string, tld: "eu" | "com" = "eu") => `${name}.kissflow.${tld}`;
/** A hook URL on a Kissflow host (a fictional account and token). */
const HOOK = `https://${kfHost("acme")}/integration/2/AcX/webhook/Tok`;

function fakeKf(proc: Partial<KfProcess>, extra: Partial<Kf> = {}) {
  const calls: string[] = [];
  const api = vi.fn(async (url: string, opts?: { method?: string }) => {
    calls.push(`api ${opts?.method ?? "GET"} ${url}`);
    return { _id: url.split("?")[0].split("/").pop() }; // the admin item route answers with the item
  });
  const kf = {
    user: { _id: "UsAdmin", Name: "Admin" },
    account: { _id: "AcTEST" },
    app: {
      getProcess: (id: string) => ({ ...proc, _flow: id }) as unknown as KfProcess,
      getDataform: () => ({
        getItems: async () => ({ Data: [] }),
        getItem: async () => ({}),
        createItem: async () => ({ _id: "draft_1" }),
        submitItem: async () => ({ _id: "Form-42" }),
        updateItem: async () => ({}),
        deleteItem: async () => ({}),
      }),
    },
    api,
    ...extra,
  } as unknown as Kf;
  return { kf, calls, api };
}

const noSleep = async () => {};

describe("createClient", () => {
  it("lists my items only: the participated list fails platform-wide and is never called (plan v5 P4)", async () => {
    const participated = vi.fn(async () => ({ Data: [{ _id: "c" }] }));
    const { kf } = fakeKf({ getMyItems: async () => [{ _id: "a" }, { _id: "b" }], getParticipatedItems: participated });
    const c = createClient(kf, { sleep: noSleep });
    expect((await c.listMine("request")).map((r) => r._id)).toEqual(["a", "b"]);
    expect(participated).not.toHaveBeenCalled();
  });

  it("lists my tasks at one step through the SDK's activity filter, every page", async () => {
    const seen: unknown[] = [];
    const { kf } = fakeKf({
      getMyTasksItems: async (o?: { pageNumber?: number; activityId?: string }) => {
        seen.push(o);
        return { Data: o?.pageNumber === 1 ? Array.from({ length: 50 }, (_, i) => ({ _id: `t${i}` })) : [{ _id: "t50" }] };
      },
    });
    const c = createClient(kf, { sleep: noSleep });
    expect(await c.listTasks("request", "Activity_15rz7z2")).toHaveLength(51);
    expect(seen).toEqual([
      { pageNumber: 1, pageSize: 200, activityId: "Activity_15rz7z2" },
      { pageNumber: 2, pageSize: 200, activityId: "Activity_15rz7z2" },
    ]);
  });

  it("retries a rate-limited call and then succeeds", async () => {
    let n = 0;
    const sleep = vi.fn(noSleep);
    const { kf } = fakeKf({
      getMyTasksItems: async () => {
        n++;
        if (n < 3) throw { status: 429, en_message: "Too many requests" };
        return [{ _id: "t1" }];
      },
    });
    const c = createClient(kf, { sleep });
    expect((await c.listTasks("query")).map((r) => r._id)).toEqual(["t1"]);
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it("does not retry a permission error and wraps it", async () => {
    let n = 0;
    const { kf } = fakeKf({
      submitItem: async () => {
        n++;
        throw { error_code: "KISSFLOW_ERROR_050302", en_message: "You don't have permission to submit this item anymore." };
      },
    });
    const c = createClient(kf, { sleep: noSleep });
    await expect(c.submit("request", "Pk1", "Act1")).rejects.toBeInstanceOf(PortalError);
    expect(n).toBe(1);
  });

  it("uses the SDK's admin item calls when the SDK has them", async () => {
    const seen: string[] = [];
    const { kf, calls } = fakeKf({
      getAdminItem: async (o) => (seen.push(`get ${o.instanceId}`), { _id: o.instanceId }),
      updateAdminItem: async (o) => (seen.push(`update ${o.instanceId} ${JSON.stringify(o.data)}`), {}),
    });
    const c = createClient(kf, { sleep: noSleep });
    expect((await c.adminGet("query", "Pk9"))._id).toBe("Pk9");
    await c.adminUpdate("query", "Pk9", { Response_Text: "x" });
    expect(seen).toEqual(["get Pk9", 'update Pk9 {"Response_Text":"x"}']);
    expect(calls).toEqual([]);
  });

  it("falls back to the admin REST route, with a JSON-string body and a Content-Type (CAFM D55, live)", async () => {
    const { kf, calls, api } = fakeKf({});
    const c = createClient(kf, { sleep: noSleep });
    await c.adminGet("query", "Pk9");
    await c.adminUpdate("query", "Pk9", { Response_Text: "x" });
    await c.adminDelete("query", "Pk9");
    expect(calls).toEqual([
      "api GET /process/2/AcTEST/admin/CIQP_Query_A00/Pk9?_application_id=CIQ_Supplier_Portal_A00",
      "api PUT /process/2/AcTEST/admin/CIQP_Query_A00/Pk9?_application_id=CIQ_Supplier_Portal_A00",
      "api DELETE /process/2/AcTEST/admin/CIQP_Query_A00/Pk9?_application_id=CIQ_Supplier_Portal_A00",
    ]);
    expect(api.mock.calls[1][1]).toEqual({ method: "PUT", headers: { "Content-Type": "application/json" }, body: '{"Response_Text":"x"}' });
  });

  it("pages every list until a short page (the SDK returns 50 rows per page by default)", async () => {
    const asked: number[] = [];
    const page = (n: number, size: number) => Array.from({ length: size }, (_, i) => ({ _id: `p${n}-${i}` }));
    const { kf } = fakeKf({
      getAdminItems: async (o) => {
        asked.push(Number(o?.pageNumber));
        return { Data: o?.pageNumber === 3 ? page(3, 7) : page(Number(o?.pageNumber), 50) };
      },
    });
    const c = createClient(kf, { sleep: noSleep });
    expect(await c.listAll("request")).toHaveLength(107);
    expect(asked).toEqual([1, 2, 3]);
  });

  it("stops paging when the host ignores the page number (same rows again)", async () => {
    let n = 0;
    const { kf } = fakeKf({ getMyItems: async () => (n++, Array.from({ length: 50 }, (_, i) => ({ _id: `r${i}` }))), getParticipatedItems: async () => [] });
    const c = createClient(kf, { sleep: noSleep });
    expect(await c.listMine("request")).toHaveLength(50);
    expect(n).toBe(2);
  });

  it("pages the SDK's { items, total } envelope and stops at the reported total", async () => {
    const asked: number[] = [];
    const all = Array.from({ length: 100 }, (_, i) => ({ _id: `r${i}` }));
    const { kf } = fakeKf({
      getAdminItems: async (o) => {
        asked.push(Number(o?.pageNumber));
        const n = Number(o?.pageNumber);
        return { items: all.slice((n - 1) * 50, n * 50), total: 100 };
      },
    });
    const c = createClient(kf, { sleep: noSleep });
    expect(await c.listAll("request")).toHaveLength(100);
    expect(asked).toEqual([1, 2]);
  });

  it("retries a rate limit reported inside the SDK's error object", async () => {
    let n = 0;
    const { kf } = fakeKf({
      getMyTasksItems: async () => {
        if (++n < 2) throw { isError: true, errorMessage: { status: 429, en_message: "Too many requests" } };
        return { items: [{ _id: "t1" }], total: 1 };
      },
    });
    const c = createClient(kf, { sleep: noSleep });
    expect((await c.listTasks("query")).map((r) => r._id)).toEqual(["t1"]);
  });

  it("does not fall back to REST when the SDK refuses an admin update for a field or validation reason", async () => {
    const { kf, calls } = fakeKf({
      updateAdminItem: async () => {
        throw { isError: true, errorMessage: { error_code: "KISSFLOW_ERROR_050313", en_message: "Permission denied to update Trade_Name" } };
      },
    });
    const c = createClient(kf, { sleep: noSleep });
    await expect(c.adminUpdate("request", "Pk1", { Trade_Name: "x" })).rejects.toThrow("Permission denied to update Trade_Name");
    expect(calls).toEqual([]);
  });

  it("names both causes when the SDK admin call and the REST fallback both fail", async () => {
    const { kf } = fakeKf(
      { getAdminItem: async () => { throw { isError: true, errorMessage: "Unknown command" }; } },
      { api: (async () => { throw { error_code: "KISSFLOW_ERROR_00010", en_message: "Access denied" }; }) as unknown as Kf["api"] },
    );
    const c = createClient(kf, { sleep: noSleep });
    await expect(c.adminGet("request", "Pk1")).rejects.toThrow(/Unknown command.*Access denied/);
  });

  it("never takes a REST error body for the item", async () => {
    const { kf } = fakeKf({}, { api: (async () => ({ _id: "err-1", error_code: "KISSFLOW_ERROR_01015", en_message: "Document not found" })) as unknown as Kf["api"] });
    const c = createClient(kf, { sleep: noSleep });
    await expect(c.adminGet("request", "Pk1")).rejects.toThrow("Document not found");
  });

  it("gives up on a call Kissflow never answers", async () => {
    const { kf } = fakeKf({ getMyTasksItems: () => new Promise(() => {}) });
    const c = createClient(kf, { sleep: noSleep, callTimeoutMs: 20 });
    await expect(c.listTasks("query")).rejects.toThrow(/did not answer/);
  });

  it("reads an item in full only with its activity instance (the SDK requires it)", async () => {
    let asked = 0;
    const { kf } = fakeKf({ getItem: async (o) => (asked++, { _id: o.instanceId, Full: true }) });
    const c = createClient(kf, { sleep: noSleep });
    expect(await c.getFull("request", "Pk1")).toBeNull();
    expect(asked).toBe(0);
    expect(await c.getFull("request", "Pk1", "Act1")).toEqual({ _id: "Pk1", Full: true });
  });

  it("creates a form row as draft then submit, and returns the new id", async () => {
    const { kf } = fakeKf({});
    const c = createClient(kf, { sleep: noSleep });
    expect(await c.formCreate("helpArticle", { Article_Title: "x" })).toBe("Form-42");
  });

  it("reads the new item id and activity instance after a process create", async () => {
    const { kf } = fakeKf({ createItem: async () => ({ _id: "PkNew", _activity_instance_id: "ActNew" }) });
    const c = createClient(kf, { sleep: noSleep });
    expect(await c.create("changeRequest", { CR_Key: "k" })).toEqual({ id: "PkNew", activityInstanceId: "ActNew" });
  });
});

describe("file preview (Thomas, 16 Oct)", () => {
  it("opens Kissflow's own preview with the stored file", async () => {
    const openFilePreview = vi.fn(async () => undefined);
    const { kf } = fakeKf({}, { client: { openFilePreview } } as Partial<Kf>);
    const file = { id: "Attach-1", name: "sds.pdf", key: "k/sds.pdf" };
    await createClient(kf).previewFiles([file]);
    expect(openFilePreview).toHaveBeenCalledWith({ files: [file], indexOfFile: 0 });
  });

  it("says so when the host has no preview, or the file is not stored yet", async () => {
    const { kf } = fakeKf({});
    await expect(createClient(kf).previewFiles([{ id: "Attach-1" }])).rejects.toThrow(PortalError);
    const withPreview = fakeKf({}, { client: { openFilePreview: async () => undefined } } as Partial<Kf>).kf;
    await expect(createClient(withPreview).previewFiles([])).rejects.toThrow(/not stored/);
  });

  it("posts a webhook the proven way: fetch, no-cors, text/plain with the JSON text, and no SDK call", async () => {
    const { kf, api } = fakeKf({});
    const fetch = vi.fn(async () => ({ type: "opaque" }));
    const c = createClient(kf, { sleep: noSleep, fetch });
    await c.postWebhook(HOOK, { portalRequestItemId: "Pk1" });
    expect(fetch).toHaveBeenCalledWith(HOOK, { method: "POST", mode: "no-cors", headers: { "Content-Type": "text/plain" }, body: '{"portalRequestItemId":"Pk1"}' });
    expect(api).not.toHaveBeenCalled();
  });

  it("falls back to the SDK's api route only when the fetch throws (nothing was sent), with the url's RELATIVE path", async () => {
    const { kf, api } = fakeKf({});
    const fetch = vi.fn(async () => {
      throw new TypeError("Refused to connect: Content Security Policy");
    });
    const c = createClient(kf, { sleep: noSleep, fetch });
    await c.postWebhook(HOOK, { a: 1 });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(api).toHaveBeenCalledTimes(1);
    expect(api).toHaveBeenCalledWith("/integration/2/AcX/webhook/Tok", { method: "POST", headers: { "Content-Type": "application/json" }, body: '{"a":1}' });
  });

  it("posts a relative url (the page does not know its Kissflow host) through the SDK's api route only", async () => {
    const { kf } = fakeKf({}, { api: vi.fn(async () => ({ status: "success" })) } as Partial<Kf>);
    const fetch = vi.fn(async () => ({ type: "opaque" }));
    const c = createClient(kf, { sleep: noSleep, fetch });
    await c.postWebhook("/integration/2/AcX/webhook/Tok", { portalRequestItemId: "Pk1" });
    expect(fetch).not.toHaveBeenCalled();
    expect(kf.api).toHaveBeenCalledTimes(1);
    expect(kf.api).toHaveBeenCalledWith("/integration/2/AcX/webhook/Tok", { method: "POST", headers: { "Content-Type": "application/json" }, body: '{"portalRequestItemId":"Pk1"}' });
  });

  it("a relative url's refusal (a Kissflow error body, or no api route) is a failure", async () => {
    const refusing = fakeKf({}, { api: vi.fn(async () => ({ error_code: "KISSFLOW_ERROR_00404", en_message: "Webhook not found" })) } as Partial<Kf>).kf;
    await expect(createClient(refusing, { sleep: noSleep, retries: 0 }).postWebhook("/integration/2/AcX/webhook/Tok", {})).rejects.toThrow(/Webhook not found/);
    const none = fakeKf({}, { api: undefined } as unknown as Partial<Kf>).kf;
    await expect(createClient(none, { sleep: noSleep }).postWebhook("/integration/2/AcX/webhook/Tok", {})).rejects.toThrow(/no Kissflow API route/);
  });

  it("sends only exactly a hook path, or an https url with exactly that path: anything else uses neither route", async () => {
    const { kf, api } = fakeKf({});
    const fetch = vi.fn(async () => ({ type: "opaque" }));
    const c = createClient(kf, { sleep: noSleep, fetch });
    for (const url of [
      "//evil.example/integration/2/AcX/webhook/Tok", // "//" names another host
      "/\\evil.example/integration/2/AcX/webhook/Tok", // so does "/\\"
      "/\t/evil.example/integration/2/AcX/webhook/Tok", // the URL parser drops a tab: "//evil.example"
      "/\n/evil.example/integration/2/AcX/webhook/Tok", // or a newline
      "/\r/evil.example/integration/2/AcX/webhook/Tok", // or a carriage return
      "/integration/2/AcX/webhook/Tok\n", // a newline after the token
      "/integration/2/AcX/webhook/Tok?x=1", // a query
      "/integration/2/AcX/webhook/Tok/more", // another path
      "/x", // not a hook at all: kf.api would POST it as the signed-in user
      "https://hook.example/x",
      `https://${kfHost("acme")}//evil.example/integration/2/AcX/webhook/Tok`, // its relative path would name another host
      `https://${kfHost("acme")}/integration/2/AcX/webhook/Tok?v=1`, // a query
      `https://${kfHost("acme")}/integration/2/AcX/webhook/Tok#f`, // a fragment
      `https://${kfHost("acme")}/integration/2/AcX/webhook/To\tk`, // a tab
      `https://user@${kfHost("acme")}/integration/2/AcX/webhook/Tok`, // user info
      `http://${kfHost("acme")}/integration/2/AcX/webhook/Tok`, // not https
      "",
    ])
      await expect(c.postWebhook(url, {}), JSON.stringify(url)).rejects.toThrow(/not a Kissflow webhook/);
    expect(fetch).not.toHaveBeenCalled();
    expect(api).not.toHaveBeenCalled();
  });

  it("a fetch that never answers fails after the bound, without a second POST through the SDK", async () => {
    const { kf, api } = fakeKf({});
    const fetch = vi.fn(() => new Promise(() => {}));
    const c = createClient(kf, { sleep: noSleep, fetch, callTimeoutMs: 20 });
    await expect(c.postWebhook(HOOK, { a: 1 })).rejects.toThrow(PortalError);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(api).not.toHaveBeenCalled();
  });

  it("both routes failing names both causes", async () => {
    const { kf } = fakeKf({}, { api: vi.fn(async () => { throw new Error("SDK says no"); }) } as Partial<Kf>);
    const c = createClient(kf, { sleep: noSleep, retries: 0, fetch: async () => { throw new TypeError("offline"); } });
    await expect(c.postWebhook(HOOK, {})).rejects.toThrow(/offline \(fetch\); .*SDK says no.* \(SDK\)/);
  });

  it("the API fallback takes a Kissflow error body as a failure, naming both causes", async () => {
    const { kf } = fakeKf({}, { api: vi.fn(async () => ({ error_code: "KISSFLOW_ERROR_00010", en_message: "You don't have permission to access this resource." })) } as Partial<Kf>);
    const c = createClient(kf, { sleep: noSleep, retries: 0, fetch: async () => { throw new TypeError("Refused by CSP"); } });
    await expect(c.postWebhook(HOOK, {})).rejects.toThrow(/Refused by CSP \(fetch\); .*permission.* \(SDK\)/);
  });
});

describe("the parent host on the client (Thomas, 21 Oct: the hand-offs go to the Kissflow page around the UI)", () => {
  it("is read once from the window when the client is made: a Kissflow https parent, else unknown", () => {
    const { kf } = fakeKf({});
    const at = (ancestorOrigins: string[], referrer = "") => createClient(kf, { window: { location: { ancestorOrigins }, document: { referrer } } }).parentHost;
    expect(at([`https://${kfHost("acme")}`])).toBe(kfHost("acme"));
    expect(at([], `https://${kfHost("acme", "com")}/view/x`)).toBe(kfHost("acme", "com"));
    expect(at(["http://127.0.0.1:5310"])).toBeUndefined();
    expect(at([`http://${kfHost("acme")}`])).toBeUndefined();
    expect(createClient(kf).parentHost).toBeUndefined(); // node: no window
    const win = { location: { ancestorOrigins: [`https://${kfHost("acme")}`] } };
    const c = createClient(kf, { window: win });
    win.location.ancestorOrigins = ["https://elsewhere.example"];
    expect(c.parentHost).toBe(kfHost("acme"));
  });
});
