// The data console's client writes (26 Oct) on both app clients: the real client against a scripted SDK handle (the
// SDK's admin update and form delete first, the REST route by kf.api when the SDK call fails for another reason than
// the data, the process delete by the admin REST route only, the bodies as JSON text, everything refused outside
// CIQ_Digital_A00 before any call; the case delete's routes into the supplier portal, by kf.api with the portal's
// _application_id) and the fake client (flow Admin only for the process writes, any field at any step but system
// fields and formulas, a deleted item read as live answers for one, every call logged). Fictional data.
import { describe, expect, it } from "vitest";
import type { Kf, KfDataform, KfProcess } from "@/portal/kf/sdk";
import { APP_ID, STEPS } from "../ids";
import { NOT_IN_APP, createAppClient } from "./client";
import { FAKE_ERRORS, createFakeClient } from "./fakeClient";

const noSleep = async () => {};
type Api = { url: string; opts?: { method?: string; body?: unknown; headers?: Record<string, string> } };

function fakeKf(proc: Partial<KfProcess>, form: Partial<KfDataform>, appId: string = APP_ID, answer: (a: Api) => unknown = () => ({})) {
  const api: Api[] = [];
  const kf = {
    user: { _id: "UsDev", Name: "Jonas Falk" },
    account: { _id: "AcTEST" },
    app: { _id: appId, getProcess: () => proc as KfProcess, getDataform: () => form as KfDataform },
    api: async (url: string, opts?: Api["opts"]) => {
      api.push({ url, opts });
      return answer({ url, opts });
    },
  } as unknown as Kf;
  return { kf, api };
}

describe("real client", () => {
  it("adminUpdate: the SDK's updateAdminItem first; nothing by REST when it answers", async () => {
    const seen: unknown[] = [];
    const { kf, api } = fakeKf({ updateAdminItem: async (o) => (seen.push(o), {}) }, {});
    await createAppClient(kf, { sleep: noSleep }).adminUpdate!("case", "PkCase1", { Trade_Name: "Zentrol B" });
    expect(seen).toEqual([{ instanceId: "PkCase1", data: { Trade_Name: "Zentrol B" } }]);
    expect(api).toEqual([]);
  });

  it("adminUpdate: when the SDK call fails (not about the data), the admin REST PUT with the JSON text; both failing names both causes", async () => {
    const { kf, api } = fakeKf({ updateAdminItem: async () => Promise.reject(new Error("Unknown command")) }, {});
    await createAppClient(kf, { sleep: noSleep }).adminUpdate!("op", "Pk Op/1", { OP_Progress: "Open" });
    expect(api).toEqual([{ url: "/process/2/AcTEST/admin/CIQ_Open_Point_A00/Pk%20Op%2F1?_application_id=CIQ_Digital_A00", opts: { method: "PUT", headers: { "Content-Type": "application/json" }, body: '{"OP_Progress":"Open"}' } }]);
    const both = fakeKf({ updateAdminItem: async () => Promise.reject(new Error("Unknown command")) }, {}, APP_ID, () => ({ error_code: "KISSFLOW_ERROR_050302", en_message: "No permission" }));
    await expect(createAppClient(both.kf, { sleep: noSleep }).adminUpdate!("op", "PkOp1", {})).rejects.toThrow(/Unknown command \(SDK\); .*050302.* \(REST\)/);
  });

  it("adminUpdate: a refusal about the data (050313) is reported as it is, without a REST retry", async () => {
    const { kf, api } = fakeKf({ updateAdminItem: async () => Promise.reject(new Error("KISSFLOW_ERROR_050313 PermissionDeniedToUpdate: Review_Gate")) }, {});
    await expect(createAppClient(kf, { sleep: noSleep }).adminUpdate!("review", "PkRev1", { Review_Gate: "OK" })).rejects.toThrow("050313");
    expect(api).toEqual([]);
  });

  it("adminDelete: the admin REST DELETE, never the SDK's process deleteItem", async () => {
    let sdk = 0;
    const { kf, api } = fakeKf({ deleteItem: async () => (sdk++, {}) }, {});
    await createAppClient(kf, { sleep: noSleep }).adminDelete!("review", "PkRev1");
    expect(sdk).toBe(0);
    expect(api).toEqual([{ url: "/process/2/AcTEST/admin/CIQ_Review_A00/PkRev1?_application_id=CIQ_Digital_A00", opts: { method: "DELETE" } }]);
  });

  it("adminDelete: an error envelope in the answer is an error", async () => {
    const { kf } = fakeKf({}, {}, APP_ID, () => ({ error_code: "KISSFLOW_ERROR_01015", en_message: "Item not found" }));
    await expect(createAppClient(kf, { sleep: noSleep }).adminDelete!("case", "PkGone")).rejects.toThrow("Item not found");
  });

  it("formDelete: the SDK's deleteItem({itemId}); the form REST DELETE when the SDK call fails", async () => {
    const seen: unknown[] = [];
    const ok = fakeKf({}, { deleteItem: async (o) => (seen.push(o), {}) });
    await createAppClient(ok.kf, { sleep: noSleep }).formDelete!("config", "PkCfg1");
    expect(seen).toEqual([{ itemId: "PkCfg1" }]);
    expect(ok.api).toEqual([]);
    const fallback = fakeKf({}, { deleteItem: async () => Promise.reject(new Error("Not supported")) });
    await createAppClient(fallback.kf, { sleep: noSleep }).formDelete!("supplier", "PkSup1");
    expect(fallback.api).toEqual([{ url: "/form/2/AcTEST/CIQ_Supplier_A00/PkSup1?_application_id=CIQ_Digital_A00", opts: { method: "DELETE" } }]);
  });

  it("the supplier portal's CIQP items (the case delete): the admin REST routes by kf.api, in the portal's container", async () => {
    const answer = (a: Api) => (a.opts?.method === "GET" && a.url.includes("/item?") ? { Data: a.url.includes("page_number=1&") ? [{ _id: "PkReq3", App_Case_Item_Id: "AppZZT-0003" }] : [] } : a.opts?.method === "GET" ? { _id: "PkQ3a", Query_Key: "OP-0003-01-R1" } : {});
    const { kf, api } = fakeKf({}, {}, APP_ID, answer);
    const c = createAppClient(kf, { sleep: noSleep });
    expect(await c.portalList!("request", "AppZZT-0003")).toEqual([{ _id: "PkReq3", App_Case_Item_Id: "AppZZT-0003" }]);
    expect(api[0]).toEqual({ url: "/process/2/AcTEST/admin/CIQP_Request_A00/item?page_number=1&page_size=200&q=AppZZT-0003&_application_id=CIQ_Supplier_Portal_A00", opts: { method: "GET" } });
    expect(api).toHaveLength(1); // a page under the host floor is the last one
    await c.portalList!("query");
    expect(api[1]!.url).toBe("/process/2/AcTEST/admin/CIQP_Query_A00/item?page_number=1&page_size=200&_application_id=CIQ_Supplier_Portal_A00");
    expect(await c.portalGet!("query", "PkQ3a")).toMatchObject({ _id: "PkQ3a" });
    await c.portalDelete!("query", "Pk Q/3a");
    expect(api.slice(-2)).toEqual([
      { url: "/process/2/AcTEST/admin/CIQP_Query_A00/PkQ3a?_application_id=CIQ_Supplier_Portal_A00", opts: { method: "GET" } },
      { url: "/process/2/AcTEST/admin/CIQP_Query_A00/Pk%20Q%2F3a?_application_id=CIQ_Supplier_Portal_A00", opts: { method: "DELETE" } },
    ]);
    // a refusal is the platform's own message (the console then lists the portal's items to delete there)
    const refused = fakeKf({}, {}, APP_ID, () => ({ error_code: "KISSFLOW_ERROR_050302", en_message: "You don't have permission to access this application." }));
    await expect(createAppClient(refused.kf, { sleep: noSleep }).portalList!("request", "AppZZT-0003")).rejects.toThrow("050302");
    await expect(createAppClient(refused.kf, { sleep: noSleep }).portalDelete!("request", "PkReq3")).rejects.toThrow("050302");
  });

  it("outside CIQ_Digital_A00 every console write is refused before any call", async () => {
    let calls = 0;
    const count = async () => (calls++, {});
    const { kf, api } = fakeKf({ updateAdminItem: count, deleteItem: count }, { deleteItem: count }, "CIQ_Supplier_Portal_A00");
    const c = createAppClient(kf, { sleep: noSleep });
    await expect(c.adminUpdate!("case", "Pk1", { A: 1 })).rejects.toThrow(NOT_IN_APP);
    await expect(c.adminDelete!("case", "Pk1")).rejects.toThrow(NOT_IN_APP);
    await expect(c.formDelete!("config", "Pk1")).rejects.toThrow(NOT_IN_APP);
    await expect(c.portalDelete!("request", "PkReq1")).rejects.toThrow(NOT_IN_APP);
    expect(calls).toBe(0);
    expect(api).toEqual([]);
  });
});

describe("fake client", () => {
  const me = { _id: "UsDev", Name: "Jonas Falk" };
  const seed = () => ({
    me,
    items: {
      op: [{ _id: "PkOp1", _status: "InProgress", _current_step: "Open point – QM", OP_Key: "ZZT-OP-1", OP_Outcome: "", Raiser_Assignee: [{ _id: "UsOther" }], _created_by: { _id: "UsOther", Name: "Ola" } }],
      config: [{ _id: "PkCfg1", Config_Key: "ZZT:one", Change_Note: "Seed" }],
    },
    tasks: [{ flow: "op" as const, itemId: "PkOp1", act: "ActOp1", activityId: STEPS.op.QM }],
  });

  it("adminUpdate needs flow Admin; writes a field the step would refuse, recomputes formulas, logs the call; refuses formulas and system fields", async () => {
    await expect(createFakeClient(seed()).adminUpdate("op", "PkOp1", { OP_Outcome: "Accepted" })).rejects.toThrow(FAKE_ERRORS.admin);
    const c = createFakeClient(seed(), { admin: true });
    await c.adminUpdate("op", "PkOp1", { OP_Key: "ZZT-OP-1b", OP_Outcome: "Accepted" });
    const back = await c.adminGet("op", "PkOp1");
    expect(back).toMatchObject({ OP_Key: "ZZT-OP-1b", OP_Outcome: "Accepted", Open_Num: 0 });
    expect(c.stepOf("PkOp1")?.activityId).toBe(STEPS.op.QM); // no step moves
    await expect(c.adminUpdate("op", "PkOp1", { Open_Num: 1 })).rejects.toThrow("050313");
    await expect(c.adminUpdate("op", "PkOp1", { _status: "Completed" })).rejects.toThrow("050313");
    expect(c.calls.filter((x) => x.m === "adminUpdate").map((x) => [x.id, x.error ? "refused" : "ok"])).toEqual([["PkOp1", "ok"], ["PkOp1", "refused"], ["PkOp1", "refused"]]);
  });

  it("adminDelete (flow Admin) and formDelete remove the item; a deleted process item reads as live answered for one (26 Oct)", async () => {
    const c = createFakeClient(seed(), { admin: true });
    await expect(c.adminGet("op", "PkNever")).rejects.toThrow("01015"); // never there: not found
    await c.adminDelete("op", "PkOp1");
    // the admin read (SDK, then REST), the viewer route and the task read, as Thomas's RMM load showed them
    await expect(c.adminGet("op", "PkOp1")).rejects.toThrow(FAKE_ERRORS.deleted);
    expect(FAKE_ERRORS.deleted).toMatch(/KISSFLOW_ERROR_050201 This item has moved out of your queue\./);
    await expect(c.getById("op", "PkOp1")).rejects.toThrow(FAKE_ERRORS.deletedById);
    await expect(c.getTask("op", "PkOp1", "ActOp1")).rejects.toThrow("050201");
    await expect(c.adminDelete("op", "PkOp1")).rejects.toThrow("050201");
    expect(c.gone.has("PkOp1")).toBe(true);
    expect(c.tasks()).toEqual([]);
    await c.formDelete("config", "PkCfg1");
    await expect(c.formGet("config", "PkCfg1")).rejects.toThrow("01015");
    await expect(c.formDelete("config", "PkCfg1")).rejects.toThrow("01015");
    await expect(createFakeClient(seed()).adminDelete("op", "PkOp1")).rejects.toThrow(FAKE_ERRORS.admin);
  });

  it("the supplier portal's items: listed by Kissflow's search, read, deleted (flow Admin); a deleted one reads as deleted", async () => {
    const portal = { request: [{ _id: "PkReq1", Request_Key: "ZZT-0001-REQ", App_Case_Item_Id: "AppZZT-0001", Case_Code: "ZZT-0001" }, { _id: "PkReq2", Request_Key: "ZZT-0002-REQ", App_Case_Item_Id: "AppZZT-0002", Case_Code: "ZZT-0002" }] };
    const c = createFakeClient({ ...seed(), portal }, { admin: true });
    expect((await c.portalList("request", "AppZZT-0001")).map((r) => r._id)).toEqual(["PkReq1"]);
    expect((await c.portalList("request")).map((r) => r._id)).toEqual(["PkReq1", "PkReq2"]);
    expect(await c.portalList("query", "ZZT-0001")).toEqual([]);
    await c.portalDelete("request", "PkReq1");
    await expect(c.portalGet("request", "PkReq1")).rejects.toThrow(FAKE_ERRORS.deleted);
    expect(c.portal.request.map((r) => r._id)).toEqual(["PkReq2"]);
    await expect(createFakeClient({ ...seed(), portal }).portalList("request")).rejects.toThrow(FAKE_ERRORS.admin);
    await expect(createFakeClient({ ...seed(), portal }, { admin: true, appId: "CIQ_Supplier_Portal_A00" }).portalDelete("request", "PkReq2")).rejects.toThrow(NOT_IN_APP);
  });

  it("refused outside the app, as the real client", async () => {
    const c = createFakeClient(seed(), { admin: true, appId: "CIQ_Supplier_Portal_A00" });
    await expect(c.formDelete("config", "PkCfg1")).rejects.toThrow(NOT_IN_APP);
    await expect(c.adminUpdate("op", "PkOp1", { OP_Outcome: "Accepted" })).rejects.toThrow(NOT_IN_APP);
    expect(c.db.config).toHaveLength(1);
  });
});
