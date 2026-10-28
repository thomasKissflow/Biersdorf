// The data console's calls after Thomas's "429 Too Many Requests" (26 Oct): a delete is ONE call (remove.ts deleteItem;
// since 27 Oct the console deletes a CIQ Case with everything that belongs to it, caseDelete.test.ts) and nothing after it; the session reads each list once and changes it locally after a write; steps are read only
// for the rows asked for (the current page's "Show steps") and kept per item id + status; the bulk delete goes strictly
// one at a time, BULK_GAP_MS apart, stops when asked and pauses on a 429 that outlasts the console client's backoff,
// which a scripted SDK handle answering 429 twice and then 200 shows it honours. Fictional data.
import { describe, expect, it } from "vitest";
import type { Kf, KfProcess } from "@/portal/kf/sdk";
import type { RawItem } from "@/portal/data/raw";
import { APP_ID } from "../ids";
import { CONSOLE_RETRY_BUDGET_MS, RATE_LIMITED, RateLimitError, consoleClientOptions, createAppClient } from "../kf/client";
import { createFakeClient, type FakeClient } from "../kf/fakeClient";
import type { AppClient } from "../types";
import { PAGE_ROWS } from "./FlowTable";
import { BULK_GAP_MS, deleteItem, deleteProblem, runBulkDelete } from "./remove";
import { ConsoleSession } from "./session";

const me = { _id: "UsDev", Name: "Jonas Falk" };
const at = (n: number) => `2026-10-26T09:${String(n % 60).padStart(2, "0")}:00Z`;
/** 30 open open-points, 2 cases (one open), 3 notes: enough for two pages of open points. */
function seed() {
  return {
    me,
    items: {
      case: [
        { _id: "AppZZT-0101", _status: "InProgress", _current_step: "Waiting for supplier: CIQ", Case_Code: "ZZT-0101", _modified_at: at(1) },
        { _id: "AppZZT-0102", _status: "Completed", _current_step: "End", Case_Code: "ZZT-0102", _modified_at: at(2) },
      ],
      op: Array.from({ length: 30 }, (_, i) => ({ _id: `PkOp${i}`, _status: "InProgress", _current_step: "Open point – QM", OP_Key: `ZZT-OP-${i}`, Case_Item_Id: "AppZZT-0101", _modified_at: at(i) })),
      note: [0, 1, 2].map((i) => ({ _id: `FmNote${i}`, Note_Key: `N-${i}`, Case_Code: "ZZT-0101", Case_Item_Id: "AppZZT-0101" })),
    },
  };
}
const dev = (): FakeClient => createFakeClient(seed(), { admin: true });
const callsSince = (c: FakeClient, from: number) => c.calls.slice(from).map((x) => `${x.m}${x.flow ? ` ${x.flow}` : ""}${x.id ? ` ${x.id}` : ""}`);

describe("the plain delete: one call, then nothing", () => {
  it("deleteItem: a form row: formDelete only; a process item: the admin delete only; a case item alone too (the console's case delete cascades: caseDelete.ts)", async () => {
    const c = dev();
    let from = c.calls.length;
    await deleteItem(c, "note", "FmNote0");
    expect(callsSince(c, from)).toEqual(["formDelete note FmNote0"]);
    from = c.calls.length;
    await deleteItem(c, "op", "PkOp0");
    expect(callsSince(c, from)).toEqual(["adminDelete op PkOp0"]);
    from = c.calls.length;
    await deleteItem(c, "case", "AppZZT-0101");
    // no dependency search, no portal, no read-back
    expect(callsSince(c, from)).toEqual(["adminDelete case AppZZT-0101"]);
    expect(c.db.case.map((x) => x._id)).toEqual(["AppZZT-0102"]);
    expect(c.db.op).toHaveLength(29); // the case's open points stay (the Orphans page's)
    expect(c.db.note).toHaveLength(2);
  });

  it("a refusal is thrown with Kissflow's text (shown in the dialog); 'not found' says it may be gone already", async () => {
    const c = createFakeClient(seed(), { admin: true, refuse: { adminDelete: "KISSFLOW_ERROR_050302 You don't have permission to delete this item." } });
    await expect(deleteItem(c, "op", "PkOp1")).rejects.toThrow("050302");
    await expect(deleteItem(dev(), "note", "FmNoteNever")).rejects.toThrow("01015");
    expect(deleteProblem("KISSFLOW_ERROR_01015 Document not found (FmNoteNever)")).toMatch(/may be deleted already: Refresh the list/);
    expect(deleteProblem("KISSFLOW_ERROR_050302 No")).toBe("KISSFLOW_ERROR_050302 No");
  });
});

describe("the session: each list read once, changed locally after a write", () => {
  it("ensure reads a list once (the overview and the flow page share it); a delete drops the row without a read; Refresh reads again", async () => {
    const c = dev();
    const s = new ConsoleSession(c, () => "2026-10-26T10:00:00Z");
    expect(s.list("op")).toMatchObject({ loading: true }); // never read: shown as loading
    s.ensure("op");
    s.ensure("op");
    await s.refresh("op"); // the read in flight, not another one
    s.ensure("op");
    expect(c.calls.filter((x) => x.m === "adminList")).toHaveLength(1);
    expect(s.list("op")).toMatchObject({ loading: false, readAt: "2026-10-26T10:00:00Z" });
    expect(s.list("op").rows).toHaveLength(30);
    const from = c.calls.length;
    await deleteItem(c, "op", "PkOp3");
    s.removeRow("op", "PkOp3");
    expect(s.list("op").rows!.map((r) => r._id)).not.toContain("PkOp3");
    expect(s.list("op").rows).toHaveLength(29);
    expect(callsSince(c, from)).toEqual(["adminDelete op PkOp3"]); // no list re-read after the delete
    await s.refresh("op");
    expect(c.calls.filter((x) => x.m === "adminList")).toHaveLength(2);
  });

  it("an edit's read-back replaces the row; a created row joins the list; neither reads the list", async () => {
    const c = dev();
    const s = new ConsoleSession(c);
    await s.refresh("note");
    const from = c.calls.length;
    s.putRow("note", { _id: "FmNote1", Note_Key: "N-1b" } as RawItem);
    s.putRow("note", { _id: "FmNote9", Note_Key: "N-9" } as RawItem);
    expect(s.list("note").rows!.map((r) => `${r._id}:${String(r.Note_Key)}`)).toEqual(["FmNote9:N-9", "FmNote0:N-0", "FmNote1:N-1b", "FmNote2:N-2"]);
    expect(c.calls.length).toBe(from);
  });

  it("a failed read stays until Refresh (a later visit does not read again by itself); the rows read before are kept", async () => {
    let refuse = true;
    const c = createFakeClient(seed(), { admin: true, refuse: { formList: () => (refuse ? "KISSFLOW_ERROR_050302 No access" : undefined) } });
    const s = new ConsoleSession(c);
    await s.refresh("note");
    expect(s.list("note")).toMatchObject({ loading: false, error: "KISSFLOW_ERROR_050302 No access" });
    s.ensure("note");
    expect(c.calls.filter((x) => x.m === "formList")).toHaveLength(1);
    refuse = false;
    await s.refresh("note");
    expect(s.list("note").rows).toHaveLength(3);
    refuse = true;
    await s.refresh("note");
    expect(s.list("note")).toMatchObject({ error: "KISSFLOW_ERROR_050302 No access" });
    expect(s.list("note").rows).toHaveLength(3);
  });
});

describe("current steps: only the rows asked for, kept per item id + status", () => {
  it(`reads the given page's open rows (at most ${PAGE_ROWS}), never again for the same id + status; a full read gives one for free`, async () => {
    const c = dev();
    const s = new ConsoleSession(c);
    await s.refresh("op");
    const rows = s.list("op").rows!;
    expect(rows.some((r) => "_current_step" in r)).toBe(false); // the admin list has no step (CAFM D55)
    const page1 = rows.slice(0, PAGE_ROWS);
    let from = c.calls.length;
    expect(await s.readSteps("op", page1)).toEqual({ read: PAGE_ROWS });
    expect(callsSince(c, from)).toEqual(page1.map((r) => `adminGet op ${r._id}`));
    expect(s.stepOf("op", page1[0]!)).toBe("Open point – QM");
    // the same page again: nothing read
    from = c.calls.length;
    expect(await s.readSteps("op", page1)).toEqual({ read: 0 });
    expect(c.calls.length).toBe(from);
    // the item moved to another status: read again
    const moved = { ...page1[0]!, _status: "Completed" };
    expect((await s.readSteps("op", [moved])).read).toBe(1);
    // a full read (the drawer's) gives the step of a row on the next page: no read for it
    const next = rows[PAGE_ROWS]!;
    s.noteStep("op", await c.adminGet("op", next._id));
    from = c.calls.length;
    expect(await s.readSteps("op", [next])).toEqual({ read: 0 });
    expect(c.calls.length).toBe(from);
    // Refresh reads the list again and forgets the kept steps
    await s.refresh("op");
    expect(s.stepOf("op", page1[1]!)).toBeUndefined();
  });

  it("a read that fails is not kept and is reported; a rate-limited one stops the rest", async () => {
    const c = createFakeClient(seed(), { admin: true, refuse: { adminGet: (x) => (x.id === "PkOp1" ? "KISSFLOW_ERROR_050302 No" : undefined) } });
    const s = new ConsoleSession(c);
    await s.refresh("op");
    const rows = s.list("op").rows!.filter((r) => ["PkOp0", "PkOp1", "PkOp2"].includes(r._id));
    expect(await s.readSteps("op", rows)).toEqual({ read: 2, error: "KISSFLOW_ERROR_050302 No" });
    expect(s.stepOf("op", rows.find((r) => r._id === "PkOp1")!)).toBeUndefined();
    let n = 0;
    const limited: AppClient = { ...c, adminGet: async () => (n++, Promise.reject(new RateLimitError(RATE_LIMITED))) };
    const s2 = new ConsoleSession(limited);
    expect((await s2.readSteps("op", s.list("op").rows!.slice(0, 10))).error).toBe(RATE_LIMITED);
    expect(n).toBe(2); // the two lanes' first reads; nothing after the 429
  });
});

describe("the bulk delete: one at a time, paced, stoppable, paused by a lasting 429", () => {
  /** A client whose deletes are timed: at most one may be in flight. */
  function timed(c: FakeClient) {
    let inFlight = 0;
    let most = 0;
    const slow = <A extends unknown[]>(fn: (...a: A) => Promise<void>) => async (...a: A) => {
      inFlight++;
      most = Math.max(most, inFlight);
      await new Promise((ok) => setTimeout(ok, 1));
      try {
        await fn(...a);
      } finally {
        inFlight--;
      }
    };
    const client: AppClient = { ...c, adminDelete: slow(c.adminDelete), formDelete: slow(c.formDelete) };
    return { client, most: () => most };
  }

  it(`deletes strictly one at a time, ${BULK_GAP_MS} ms apart, one call per item`, async () => {
    const c = dev();
    const { client, most } = timed(c);
    const items = ["PkOp0", "PkOp1", "PkOp2", "PkOp3"].map((id) => ({ id, key: id }));
    const waits: number[] = [];
    const progress: number[] = [];
    const deleted: string[] = [];
    const from = c.calls.length;
    const r = await runBulkDelete(client, "op", items, { sleep: async (ms) => void waits.push(ms), onProgress: (p) => progress.push(p.done), onDeleted: (x) => deleted.push(x.id) });
    expect(r).toMatchObject({ failed: [], remaining: [] });
    expect(r.deleted.map((x) => x.id)).toEqual(items.map((x) => x.id));
    expect(deleted).toEqual(items.map((x) => x.id));
    expect(waits).toEqual([BULK_GAP_MS, BULK_GAP_MS, BULK_GAP_MS]);
    expect(most()).toBe(1);
    expect(callsSince(c, from)).toEqual(items.map((x) => `adminDelete op ${x.id}`));
    expect(progress).toEqual([0, 1, 2, 3, 4]);
  });

  it("Stop ends it before the next item; a refusal is noted and the run goes on", async () => {
    const c = createFakeClient(seed(), { admin: true, refuse: { formDelete: (x) => (x.id === "FmNote1" ? "KISSFLOW_ERROR_050302 No" : undefined) } });
    const items = ["FmNote0", "FmNote1", "FmNote2"].map((id) => ({ id, key: id }));
    const r = await runBulkDelete(c, "note", items, { sleep: async () => {} });
    expect(r.deleted.map((x) => x.id)).toEqual(["FmNote0", "FmNote2"]);
    expect(r.failed).toEqual([{ id: "FmNote1", key: "FmNote1", why: "KISSFLOW_ERROR_050302 No" }]);
    const c2 = dev();
    let stop = false;
    const r2 = await runBulkDelete(c2, "op", ["PkOp5", "PkOp6", "PkOp7"].map((id) => ({ id, key: id })), { sleep: async () => {}, onDeleted: () => (stop = true), stop: () => stop });
    expect(r2).toMatchObject({ stopped: true, remaining: [{ id: "PkOp6" }, { id: "PkOp7" }] });
    expect(r2.deleted.map((x) => x.id)).toEqual(["PkOp5"]);
    expect(c2.calls.filter((x) => x.m === "adminDelete")).toHaveLength(1);
  });

  it("a 429 that outlasts the backoff pauses the run there with the plain text; Continue finishes it", async () => {
    const c = dev();
    let limited = true;
    const client: AppClient = { ...c, adminDelete: async (f, id) => (limited && id === "PkOp9" ? Promise.reject(new RateLimitError(RATE_LIMITED)) : c.adminDelete(f, id)) };
    const items = ["PkOp8", "PkOp9", "PkOp10"].map((id) => ({ id, key: id }));
    const r = await runBulkDelete(client, "op", items, { sleep: async () => {} });
    expect(r).toMatchObject({ paused: RATE_LIMITED, remaining: [{ id: "PkOp9" }, { id: "PkOp10" }], failed: [] });
    limited = false;
    const again = await runBulkDelete(client, "op", r.remaining, { sleep: async () => {} });
    expect(again.deleted.map((x) => x.id)).toEqual(["PkOp9", "PkOp10"]);
  });

  it("through the console's real client: Kissflow answers 429 twice, then 200; the client waits about 1 s and 2 s and the run goes on", async () => {
    let n = 0;
    const deletes: string[] = [];
    const kf = {
      user: me,
      account: { _id: "AcTEST" },
      app: { _id: APP_ID, getProcess: () => ({}) as KfProcess, getDataform: () => ({}) },
      api: async (url: string, opts?: { method?: string }) => {
        if (opts?.method !== "DELETE") return {};
        if (url.includes("/PkOp2?") && n++ < 2) return Promise.reject({ isError: true, errorMessage: { status: 429, en_message: "Too Many Requests" } });
        deletes.push(url.split("?")[0]!.split("/").pop()!);
        return {};
      },
    } as unknown as Kf;
    const waits: number[] = [];
    const sleep = async (ms: number) => void waits.push(ms);
    const client = createAppClient(kf, consoleClientOptions({ sleep, random: () => 0.5 }));
    const r = await runBulkDelete(client, "op", ["PkOp1", "PkOp2", "PkOp3"].map((id) => ({ id, key: id })), { sleep });
    expect(r).toMatchObject({ failed: [], remaining: [] });
    expect(deletes).toEqual(["PkOp1", "PkOp2", "PkOp3"]);
    // the pause, the client's two backoff waits (1 s and 2 s, +10 % jitter at random 0.5), the pause
    expect(waits).toEqual([BULK_GAP_MS, 1100, 2200, BULK_GAP_MS]);
    expect(waits.slice(1, 3).reduce((a, b) => a + b, 0)).toBeLessThan(CONSOLE_RETRY_BUDGET_MS);
  });
});
