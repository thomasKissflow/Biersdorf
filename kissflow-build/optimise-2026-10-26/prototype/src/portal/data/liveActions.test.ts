// The supplier's v5 writes against an in-memory portal that behaves like Kissflow where it matters: task reads and
// writes need the item's current activity instance, DateTimes with milliseconds are refused, a submit ignores Mandatory
// fields and moves the request on ("fill in the CIQ" → "keep the CIQ up to date" → "give the final release" → "view the
// released CIQ", or back to "keep" when Release_Flag is "Reopened"), and an update replaces an Attachment value.
import { describe, expect, it, vi } from "vitest";
import { DEV_ACCOUNT } from "@/shell/env";
import { DEV_WEBHOOKS, NO_WEBHOOKS, webhooksFor, STEPS, UPLOADS_TABLE, type FlowKey, type StepKey, type Webhooks } from "../kf/portal";
import type { KfData } from "../kf/sdk";
import type { PortalClient } from "./client";
import { PORTAL_USERS, fixtureSet, loadedFor } from "./fixtures";
import { REOPENED_TEXT, liveActions, type LiveData, type Task } from "./liveActions";
import { emptyNotes, groupBundles, toSupplierSide, type LocalNotes } from "./map";
import { childRows, type RawItem } from "./raw";
import { fileOfDocument, loadSupplierData, withSavedRequests } from "./LiveSupplierStore";

const who = (u: (typeof PORTAL_USERS)["elena"]) => ({ id: u._id, name: u.Name, email: u.Email });
const elena = who(PORTAL_USERS.elena);
const ravi = who(PORTAL_USERS.ravi);
const NOW = "2026-10-15T12:00:00.000Z";
const stepOfActivity = (a: string) => (Object.keys(STEPS) as StepKey[]).find((k) => STEPS[k].activity === a)!;

/** In-memory portal over the fixture items; records every write in order. */
function portal(opts: { onUpdate?: (id: string, data: KfData, items: Map<string, RawItem>) => void } = {}) {
  const fx = fixtureSet();
  const items = new Map<string, RawItem>(fx.items.map(({ item }) => [item._id, structuredClone(item)]));
  const tasks = new Map<string, Task>(fx.tasks.map(([id, act, activity]) => [id, { act, step: stepOfActivity(activity) }]));
  const log: string[] = [];
  let seq = 0;
  const task = (id: string, act: string) => {
    const t = tasks.get(id);
    if (!t || t.act !== act) throw new Error("KISSFLOW_ERROR_050302 You don't have permission to access this item.");
    return t;
  };
  const noMs = (d: KfData) => {
    for (const [k, v] of Object.entries(d)) if (/_At$|_Since$/.test(k) && typeof v === "string" && /\.\d{3}Z$/.test(v)) throw new Error(`Invalid datetime ${k}`);
  };
  const client = {
    accountId: "AcTEST",
    async getFull(_f: FlowKey, id: string, act: string) {
      task(id, act);
      return structuredClone(items.get(id)!);
    },
    async update(f: FlowKey, id: string, act: string, data: KfData) {
      task(id, act);
      noMs(data);
      log.push(`update ${f} ${id} ${Object.keys(data).sort().join(",")}`);
      items.set(id, { ...items.get(id)!, ...data });
      opts.onUpdate?.(id, data, items);
    },
    /** My open tasks, at one step when asked (the SDK's activity filter), as the real client lists them. */
    async listTasks(_f: FlowKey, activityId?: string) {
      return [...tasks.entries()].filter(([, t]) => !activityId || STEPS[t.step].activity === activityId).map(([id, t]) => ({ ...items.get(id)!, _activity_instance_id: t.act }));
    },
    /** A submit ignores Mandatory fields (proven live, 21 Oct); after the release step the go-to reads Release_Flag. */
    async submit(f: FlowKey, id: string, act: string) {
      const t = task(id, act);
      log.push(`submit ${f} ${id} ${STEPS[t.step].name}`);
      const next: StepKey | undefined = t.step === "fill" ? "keep" : t.step === "keep" ? "release" : t.step === "release" ? (items.get(id)!.Release_Flag === "Reopened" ? "keep" : "released") : undefined;
      if (next) {
        tasks.set(id, { act: `Act${next}${++seq}`, step: next });
        items.set(id, { ...items.get(id)!, _current_step: STEPS[next].name });
      } else {
        tasks.delete(id);
        items.set(id, { ...items.get(id)!, _status: "Completed" });
      }
    },
    async uploadFile(file: File) {
      log.push(`upload ${file.name}`);
      return { id: `Attach-new${++seq}`, key: `k/${file.name}`, name: file.name, size: file.size };
    },
    webhooks: [] as { url: string; payload: unknown }[],
    async postWebhook(url: string, payload: unknown) {
      (client as unknown as { webhooks: { url: string; payload: unknown }[] }).webhooks.push({ url, payload });
    },
    async updateChildRow(f: FlowKey, id: string, act: string, tableId: string, rowId: string, data: KfData) {
      task(id, act);
      noMs(data);
      log.push(`updateRow ${f} ${id} ${tableId} ${Object.keys(data).sort().join(",")}`);
      const it = items.get(id)!;
      const key = `Table::${tableId}`;
      items.set(id, { ...it, [key]: ((it[key] as Record<string, unknown>[]) ?? []).map((r) => (r._id === rowId ? { ...r, ...data } : r)) });
    },
    async addChildRow(f: FlowKey, id: string, act: string, tableId: string, row: KfData) {
      task(id, act);
      noMs(row);
      log.push(`addRow ${f} ${id} ${tableId}`);
      const it = items.get(id)!;
      const key = `Table::${tableId}`;
      items.set(id, { ...it, [key]: [...((it[key] as unknown[]) ?? []), { _id: `row-${++seq}`, ...row }] });
    },
  } as unknown as PortalClient;
  return { client, items, tasks, log };
}

function dataFor(p: ReturnType<typeof portal>, me = elena, local: LocalNotes = emptyNotes()): LiveData {
  const loaded = loadedFor(me.id).map((l) => ({ ...l, item: { ...structuredClone(p.items.get(l.item._id)!), _activity_instance_id: p.tasks.get(l.item._id)?.act } }));
  const bundles = groupBundles(loaded);
  const mine = new Map([...p.tasks].filter(([id]) => loaded.some((l) => l.item._id === id)));
  return { bundles, tasks: mine, side: toSupplierSide(bundles, me, local), loadedAt: NOW };
}
const acts = (p: ReturnType<typeof portal>, me = elena, local?: LocalNotes) => liveActions(p.client, dataFor(p, me, local), me, { now: () => NOW, wait: async () => {}, local });
const json = (it: RawItem, k: string) => JSON.parse(String(it[k] ?? "null"));

describe("answers on the request", () => {
  it("merges an answer into Answers_JSON through the request task, with Scope_JSON and Requested_Docs_JSON", async () => {
    const p = portal();
    await acts(p).patchRequest("ZZT-0002", { set: { "FLD-GEN-004": "Plant 2, Tarragona" } });
    expect(p.log).toEqual(["update request PkReq2 Answered_By_JSON,Answers_Changed_At,Answers_Changed_By_Email,Answers_JSON,Answers_Rev,Editing_By,Editing_Since,Requested_Docs_JSON,Scope_JSON"]);
    const it = p.items.get("PkReq2")!;
    expect(json(it, "Answers_JSON")["FLD-GEN-004"]).toBe("Plant 2, Tarragona");
    expect(json(it, "Answered_By_JSON")["FLD-GEN-004"]).toMatchObject({ name: "Elena Márquez", email: elena.email, at: "2026-10-15T12:00:00Z" });
    expect(String(it.Scope_JSON)).not.toMatch(/\bR-\d|SF-\d/);
  });

  it("a metadata answer in Part 1 re-derives the scope it writes: sections open and close live", async () => {
    const p = portal();
    const a = acts(p);
    await a.patchRequest("ZZT-0001", { config: { SF01: ["vegetable"] } });
    expect(json(p.items.get("PkReq1")!, "Scope_JSON").some((r: { sectionId: string; applicability: string }) => r.sectionId === "A2" && r.applicability !== "na")).toBe(true);
    await acts(p).patchRequest("ZZT-0001", { config: { SF01: ["animal"] } });
    expect(json(p.items.get("PkReq1")!, "Scope_JSON").find((r: { sectionId: string }) => r.sectionId === "A2")?.applicability).toBe("na");
    expect(json(p.items.get("PkReq1")!, "Config_Answers_JSON")).toEqual({ SF01: ["animal"] });
  });

  it("a metadata answer in Part 2 only grows the scope it writes (B-28)", async () => {
    const p = portal();
    const before = json(p.items.get("PkReq3")!, "Scope_JSON") as { sectionId: string; applicability: string }[];
    await acts(p).patchRequest("ZZT-0003", { config: { SF01: ["animal"], SF07: true } });
    const after = json(p.items.get("PkReq3")!, "Scope_JSON") as { sectionId: string; applicability: string; addedLater?: boolean }[];
    for (const b of before.filter((x) => x.applicability !== "na")) expect(after.find((x) => x.sectionId === b.sectionId)?.applicability).not.toBe("na");
    expect(after.some((x) => x.addedLater)).toBe(true);
  });

  it("refuses on a locked request without writing", async () => {
    const p = portal();
    p.items.set("PkReq3", { ...p.items.get("PkReq3")!, Request_Locked: "Yes", Case_Phase_Label: "Completed" });
    await expect(acts(p).patchRequest("ZZT-0003", { set: { "FLD-GEN-004": "x" } })).rejects.toThrow(/closed/);
    expect(p.log.filter((l) => l.startsWith("update"))).toEqual([]);
  });

  it("two contacts at the same moment: the lost write is re-applied on top of the colleague's", async () => {
    let raced = false;
    const p = portal({
      onUpdate: (id, data, items) => {
        if (raced || id !== "PkReq2" || !data.Answers_JSON) return;
        raced = true; // Ravi's save from the state before Elena's lands right after hers and replaces it
        const it = items.get(id)!;
        const old = JSON.parse(String(fixtureSet().items.find((x) => x.item._id === "PkReq2")!.item.Answers_JSON));
        items.set(id, { ...it, Answers_JSON: JSON.stringify({ ...old, "FLD-GEN-005": "Ravi's site" }) });
      },
    });
    await acts(p).patchRequest("ZZT-0002", { set: { "FLD-GEN-004": "Elena's maker" } });
    const ans = json(p.items.get("PkReq2")!, "Answers_JSON");
    expect(ans).toMatchObject({ "FLD-GEN-004": "Elena's maker", "FLD-GEN-005": "Ravi's site" });
    expect(p.log.filter((l) => l.startsWith("update request PkReq2"))).toHaveLength(2);
  });
});

describe("uploads", () => {
  it("stores the file, adds it to Supplier_Files (keeping the others), adds its Uploads row, then signals the service", async () => {
    const p = portal();
    const filesBefore = (p.items.get("PkReq2")!.Supplier_Files as unknown[]).length;
    const r = await acts(p).uploadDocument("ZZT-0002", { name: "sds.pdf", kind: "SDS", sectionId: "K1", fieldId: "FLD-K1-001" }, new File(["%PDF"], "sds.pdf"));
    expect(p.log).toEqual(["upload sds.pdf", "update request PkReq2 Supplier_Files", "addRow request PkReq2 CIQP_Request_A00_Uploads", "update request PkReq2 Answers_Changed_At,Answers_Changed_By_Email,Answers_Rev,Documents_JSON,Editing_By,Editing_Since"]);
    const it = p.items.get("PkReq2")!;
    expect((it.Supplier_Files as unknown[]).length).toBe(filesBefore + 1);
    const row = childRows(it, UPLOADS_TABLE, "Upload_Id").find((x) => x.Upload_Id === r.uploadId)!;
    expect(row).toMatchObject({ Upload_Section_Key: "K1", Upload_Field_Key: "FLD-K1-001", Upload_Doc_Kind: "SDS", Upload_File_Name: "sds.pdf", Uploaded_By_Email: elena.email, Upload_Attachment_Id: r.attachmentId });
    expect(row).not.toHaveProperty("Upload_File");
  });

  it("refuses an upload on a locked request before storing anything", async () => {
    const p = portal();
    await expect(acts(p).uploadDocument("ZZT-0005", { name: "x.pdf", kind: "Other", sectionId: "K1" }, new File(["x"], "x.pdf"))).rejects.toThrow(/closed/);
    expect(p.log).toEqual([]);
  });
});

describe("completeness (B-09, B-10, B-11)", () => {
  it("writes the Completeness_* fields, reads them back, then submits “fill in the CIQ”", async () => {
    const p = portal();
    await acts(p).confirmCompleteness("ZZT-0002");
    expect(p.log).toEqual(["update request PkReq2 Completeness_At,Completeness_By_Email,Completeness_By_Name,Completeness_By_Role,Completeness_Confirm,Requested_Docs_JSON,Review_Depts,Scope_JSON", "submit request PkReq2 Supplier: fill in the CIQ"]);
    expect(p.items.get("PkReq2")).toMatchObject({ Completeness_Confirm: "Confirmed", Completeness_By_Name: "Elena Márquez", Completeness_At: "2026-10-15T12:00:00Z", _current_step: STEPS.keep.name });
  });

  it("refuses while something is missing, without any write", async () => {
    const p = portal();
    await expect(acts(p).confirmCompleteness("ZZT-0001")).rejects.toThrow(/must be completed or justified first/);
    expect(p.log).toEqual([]);
  });

  it("refuses a contact who may not confirm", async () => {
    const p = portal();
    await expect(acts(p, ravi).confirmCompleteness("ZZT-0002")).rejects.toThrow(/only a colleague who may confirm/);
    expect(p.log).toEqual([]);
  });
});

describe("questions", () => {
  it("answers through the query's task: Response_* and the responsible e-mail, read back, then submit", async () => {
    const p = portal();
    const local = emptyNotes();
    const a = acts(p, elena, local);
    const c = dataFor(p).side.cases.find((x) => x.id === "ZZT-0003")!;
    const op = c.openPoints.find((x) => x.status === "open" && x.rounds === 1)!;
    await a.supplierRespond("ZZT-0003", op.id, { text: "Twelve months from production." });
    expect(p.log).toEqual(["update query PkQ3a Response_Kind,Response_Text,Supplier_Responsible_Email", "submit query PkQ3a Supplier: respond"]);
    expect(p.items.get("PkQ3a")).toMatchObject({ Response_Kind: "Answer", Response_Text: "Twelve months from production.", Supplier_Responsible_Email: elena.email, _status: "Completed" });
    expect(local.answers.get(op.id)?.text).toBe("Twelve months from production.");
  });

  it("answers a returned round with a document: stored at the question's item first, referenced, no Answers_Rev signal", async () => {
    const p = portal();
    const c = dataFor(p).side.cases.find((x) => x.id === "ZZT-0003")!;
    const op = c.openPoints.find((x) => x.rounds === 2)!;
    await acts(p).supplierRespond("ZZT-0003", op.id, { text: "Address attached.", documentName: "address.pdf", file: new File(["%PDF"], "address.pdf") });
    expect(p.log).toEqual(["upload address.pdf", "update request PkReq3 Supplier_Files", "addRow request PkReq3 CIQP_Request_A00_Uploads", "update request PkReq3 Documents_JSON", "update query PkQ3b Response_Doc_Refs_JSON,Response_Kind,Response_Text,Supplier_Responsible_Email", "submit query PkQ3b Supplier: respond"]);
    const q = p.items.get("PkQ3b")!;
    expect(q.Response_Kind).toBe("Document");
    const ref = JSON.parse(String(q.Response_Doc_Refs_JSON))[0];
    expect(ref.uploadId).toMatch(/^UP-/);
    expect(ref.attachmentId).toMatch(/^Attach-new/);
    expect(childRows(p.items.get("PkReq3")!, UPLOADS_TABLE, "Upload_Id").some((r) => r.Upload_Id === ref.uploadId && r.Upload_Attachment_Id === ref.attachmentId)).toBe(true);
  });

  it("refuses a question that is not my open task", async () => {
    const p = portal();
    const c = dataFor(p).side.cases.find((x) => x.id === "ZZT-0003")!;
    const closed = c.openPoints.find((x) => x.status === "closed")!;
    await expect(acts(p).supplierRespond("ZZT-0003", closed.id, { text: "x" })).rejects.toThrow(/not one of your open tasks/);
  });
});

describe("final release (B-33)", () => {
  it("writes who released (name, e-mail, role: REQ-PROC-042) and when on the request at its release step, submits it, and remembers it (16 Oct)", async () => {
    const p = portal();
    const local = emptyNotes();
    await acts(p, elena, local).finalRelease("ZZT-0004");
    expect(p.log).toEqual(["update request PkReq4 Release_At,Release_By_Email,Release_By_Name,Release_By_Role", "submit request PkReq4 Supplier: give the final release"]);
    expect(p.items.get("PkReq4")).toMatchObject({ Release_By_Name: "Elena Márquez", Release_By_Email: elena.email, Release_By_Role: "Supplier contact", Release_At: "2026-10-15T12:00:00Z", _current_step: STEPS.released.name });
    expect(local.releases.get("ZZT-0004")).toMatchObject({ type: "final-release", name: "Elena Márquez", email: elena.email, role: "Supplier contact" });
    expect(local.released.get("ZZT-0004")?.request).toMatchObject({ Release_By_Email: elena.email, Release_By_Role: "Supplier contact" });
  });

  it("re-applies the release until Kissflow keeps the e-mail too (read back)", async () => {
    let lost = false;
    const p = portal({
      onUpdate: (id, data, items) => {
        if (lost || id !== "PkReq4" || !data.Release_By_Email) return;
        lost = true; // the first write lands without the e-mail
        const { Release_By_Email: _gone, ...rest } = items.get(id)!;
        void _gone;
        items.set(id, rest as RawItem);
      },
    });
    await acts(p).finalRelease("ZZT-0004");
    expect(p.log.filter((l) => l.startsWith("update request PkReq4"))).toHaveLength(2);
    expect(p.items.get("PkReq4")).toMatchObject({ Release_By_Email: elena.email });
  });

  it("refuses while a mandatory item is missing, without writing", async () => {
    const p = portal();
    const it = p.items.get("PkReq4")!;
    const answers = json(it, "Answers_JSON");
    delete answers["FLD-GEN-004"];
    p.items.set("PkReq4", { ...it, Answers_JSON: JSON.stringify(answers) });
    await expect(acts(p).finalRelease("ZZT-0004")).rejects.toThrow(/not possible yet/);
    expect(p.log).toEqual([]);
  });

  it("the request is locked at the final release (Thomas, 15 Oct): answers, metadata, rows and uploads are refused before any write; the release is still given", async () => {
    const p = portal();
    expect(p.items.get("PkReq4")).toMatchObject({ Request_Locked: "Yes", Case_Phase_Label: "Awaiting your final release" });
    const a = acts(p);
    await expect(a.patchRequest("ZZT-0004", { set: { "FLD-GEN-004": "x" } })).rejects.toThrow(/Your questionnaire is locked because Beiersdorf has requested your final release/);
    await expect(a.patchRequest("ZZT-0004", { config: { SF02: true } })).rejects.toThrow(/locked/);
    await expect(a.patchRequest("ZZT-0004", { components: [] })).rejects.toThrow(/locked/);
    await expect(a.patchRequest("ZZT-0004", { just: { "K6.8": "x" } })).rejects.toThrow(/locked/);
    await expect(a.uploadDocument("ZZT-0004", { name: "x.pdf", kind: "Other", sectionId: "K1" }, new File(["x"], "x.pdf"))).rejects.toThrow(/locked/);
    await expect(a.reportChange("ZZT-0004", "x")).rejects.toThrow(/Your questionnaire is locked/);
    expect(p.log).toEqual([]);
    await a.finalRelease("ZZT-0004");
    expect(p.log).toEqual(["update request PkReq4 Release_At,Release_By_Email,Release_By_Name,Release_By_Role", "submit request PkReq4 Supplier: give the final release"]);
  });

  it("at the release step without the lock fields written yet: the step itself refuses every change before any read or write", async () => {
    const p = portal();
    // the request moved to "give the final release"; Beiersdorf's side has not written Request_Locked or the label yet
    p.items.set("PkReq4", { ...p.items.get("PkReq4")!, Request_Locked: "No", Case_Phase_Label: "With Beiersdorf" });
    const a = acts(p);
    await expect(a.patchRequest("ZZT-0004", { set: { "FLD-GEN-005": "x" } })).rejects.toThrow(/Your questionnaire is locked because Beiersdorf has requested your final release/);
    await expect(a.patchRequest("ZZT-0004", { just: { "K6.8": "x" } })).rejects.toThrow(/Your change was not saved/);
    await expect(a.uploadDocument("ZZT-0004", { name: "x.pdf", kind: "Other", sectionId: "K1" }, new File(["x"], "x.pdf"))).rejects.toThrow(/Your questionnaire is locked/);
    expect(p.log).toEqual([]);
    // the release itself is still given
    await a.finalRelease("ZZT-0004");
    expect(p.log.at(-1)).toBe("submit request PkReq4 Supplier: give the final release");
  });

  it("a lock the service writes after the page loaded is seen on the fresh read: nothing is written", async () => {
    const p = portal();
    const a = acts(p); // loaded in review
    p.items.set("PkReq3", { ...p.items.get("PkReq3")!, Request_Locked: "Yes", Case_Phase_Label: "Awaiting your final release" });
    await expect(a.patchRequest("ZZT-0003", { set: { "FLD-GEN-004": "x" } })).rejects.toThrow(/Your questionnaire is locked/);
    await expect(a.uploadDocument("ZZT-0003", { name: "x.pdf", kind: "Other", sectionId: "K1" }, new File(["x"], "x.pdf"))).rejects.toThrow(/Your questionnaire is locked/);
    expect(p.log).toEqual([]);
    // unlocked again (a reviewer reopened: back to review): the write goes through
    p.items.set("PkReq3", { ...p.items.get("PkReq3")!, Request_Locked: "No", Case_Phase_Label: "With Beiersdorf" });
    await a.patchRequest("ZZT-0003", { set: { "FLD-GEN-004": "x" } });
    expect(p.log.filter((l) => l.startsWith("update request PkReq3"))).toHaveLength(1);
  });

  it("Ravi holds the release step too (every case contact is in Release_Contacts) but may not give it (B-11)", async () => {
    const p = portal();
    await expect(acts(p, ravi).finalRelease("ZZT-0004")).rejects.toThrow(/only a colleague who may confirm/);
    expect(p.log).toEqual([]);
  });
});

describe("report a change (B-36)", () => {
  it("writes text, rev + 1, reporter and time together on the completed request", async () => {
    const p = portal();
    await acts(p).reportChange("ZZT-0005", "The supplier of the antioxidant changes in November.");
    expect(p.log).toEqual(["update request PkReq5 Change_Report_At,Change_Report_By_Email,Change_Report_Rev,Change_Report_Text"]);
    expect(p.items.get("PkReq5")).toMatchObject({ Change_Report_Rev: 2, Change_Report_By_Email: elena.email, Change_Report_At: "2026-10-15T12:00:00Z" });
  });

  it("a second report is added on top of the first, which is kept (Thomas, 22 Oct: append)", async () => {
    const p = portal();
    p.items.set("PkReq5", { ...p.items.get("PkReq5")!, Change_Report_Rev: 2, Change_Report_Text: "Report 2 · earlier\nthe first one", Change_Report_At: "2026-10-15T11:59:00Z" });
    await acts(p).reportChange("ZZT-0005", "another");
    const it = p.items.get("PkReq5")!;
    expect(it.Change_Report_Rev).toBe(3);
    expect(String(it.Change_Report_Text)).toMatch(/^Report 3 · 2026-10-15T12:00:00Z · .+\nanother\n\nReport 2 · earlier\nthe first one$/);
  });

  it("is only for a completed request", async () => {
    await expect(acts(portal()).reportChange("ZZT-0003", "x")).rejects.toThrow(/directly in the questionnaire/);
  });
});

describe("fast saves and file previews (Thomas, 16 Oct)", () => {
  it("a save resolves with the request as read back, so the page shows it without reading every task again", async () => {
    const p = portal();
    const back = await acts(p).patchRequest("ZZT-0003", { set: { "FLD-GEN-004": "Solvaro, Tarragona" } });
    expect(json(back, "Answers_JSON")["FLD-GEN-004"]).toBe("Solvaro, Tarragona");
    const before = { ...dataFor(p), warnings: [] };
    const after = withSavedRequests(before, new Map([["ZZT-0003", back]]), elena, emptyNotes());
    expect(after.side.cases.find((c) => c.id === "ZZT-0003")?.answers["FLD-GEN-004"]).toBe("Solvaro, Tarragona");
    expect(after.tasks).toBe(before.tasks); // the tasks stay as loaded: no list call
    expect(after.bundles.find((b) => b.code === "ZZT-0003")?.request?._activity_instance_id).toBe(before.bundles.find((b) => b.code === "ZZT-0003")?.request?._activity_instance_id);
  });

  it("finds the stored Kissflow file of an uploaded document for the preview", async () => {
    const p = portal();
    const up = await acts(p).uploadDocument("ZZT-0003", { name: "sds.pdf", kind: "SDS", sectionId: "K1", fieldId: "FLD-K1-001" }, new File(["x"], "sds.pdf"));
    const d = { ...dataFor(p), warnings: [] };
    expect(fileOfDocument(d, up.uploadId)).toMatchObject({ id: up.attachmentId, name: "sds.pdf" });
    expect(fileOfDocument(d, "UP-unknown")).toBeUndefined();
  });
});

describe("removing an uploaded file (plan v6 D-12) and the released step (D-11)", () => {
  it("the contact removes their own upload: the row stays, marked removed, and the file is no longer listed", async () => {
    const p = portal();
    const up = await acts(p).uploadDocument("ZZT-0003", { name: "wrong.pdf", kind: "SDS", sectionId: "K1", fieldId: "FLD-K1-001" }, new File(["x"], "wrong.pdf"));
    p.log.length = 0;
    await acts(p).removeDocument("ZZT-0003", up.uploadId);
    expect(p.log).toEqual(["updateRow request PkReq3 CIQP_Request_A00_Uploads Upload_Removed_At,Upload_Removed_By_Email", "update request PkReq3 Answers_Changed_At,Answers_Changed_By_Email,Answers_Rev,Documents_JSON,Editing_By,Editing_Since"]);
    const row = childRows(p.items.get("PkReq3")!, UPLOADS_TABLE, "Upload_Id").find((r) => r.Upload_Id === up.uploadId)!;
    expect(row).toMatchObject({ Upload_Removed_At: "2026-10-15T12:00:00Z", Upload_Removed_By_Email: elena.email });
    const c = dataFor(p).side.cases.find((x) => x.id === "ZZT-0003")!;
    expect(c.documents.some((d) => d.id === up.uploadId)).toBe(false);
  });

  it("refuses a colleague's upload, and any removal while the questionnaire is locked", async () => {
    const p = portal();
    const up = await acts(p).uploadDocument("ZZT-0003", { name: "x.pdf", kind: "SDS", sectionId: "K1" }, new File(["x"], "x.pdf"));
    p.log.length = 0;
    await expect(acts(p, ravi).removeDocument("ZZT-0003", up.uploadId)).rejects.toThrow(/Only the colleague who uploaded/);
    p.items.set("PkReq3", { ...p.items.get("PkReq3")!, Request_Locked: "Yes", Case_Phase_Label: "Awaiting your final release" });
    await expect(acts(p).removeDocument("ZZT-0003", up.uploadId)).rejects.toThrow(/locked/);
    expect(p.log).toEqual([]);
  });

  it("a released request is held at 'view the released CIQ': completed, read-only, and a change can be reported there", async () => {
    const p = portal();
    const c = dataFor(p).side.cases.find((x) => x.id === "ZZT-0005")!;
    expect(c.phase).toBe("completed");
    await expect(acts(p).patchRequest("ZZT-0005", { set: { "FLD-GEN-004": "x" } })).rejects.toThrow(/closed/);
    await acts(p).reportChange("ZZT-0005", "A new site from 2027.");
    expect(p.log.at(-1)).toBe("update request PkReq5 Change_Report_At,Change_Report_By_Email,Change_Report_Rev,Change_Report_Text");
  });
});

describe("sync to the app case (plan v6 §4.2)", () => {
  it("keeps Documents_JSON on the request: the upload is in it, a removed file is not", async () => {
    const p = portal();
    const up = await acts(p).uploadDocument("ZZT-0003", { name: "sds.pdf", kind: "SDS", sectionId: "K1", fieldId: "FLD-K1-001" }, new File(["x"], "sds.pdf"));
    const docs = () => JSON.parse(String(p.items.get("PkReq3")!.Documents_JSON ?? "[]")) as { uploadId: string; fileName: string; uploadedByEmail: string }[];
    expect(docs().find((d) => d.uploadId === up.uploadId)).toMatchObject({ fileName: "sds.pdf", uploadedByEmail: elena.email });
    await acts(p).removeDocument("ZZT-0003", up.uploadId);
    expect(docs().some((d) => d.uploadId === up.uploadId)).toBe(false);
  });

  it("request.changed carries only the request id, and nothing is sent without a URL", async () => {
    const p = portal();
    const sent = (p.client as unknown as { webhooks: { url: string; payload: unknown }[] }).webhooks;
    await liveActions(p.client, dataFor(p), elena, { now: () => NOW, wait: async () => undefined, webhooks: NO_WEBHOOKS }).patchRequest("ZZT-0003", { set: { "FLD-GEN-004": "x" } });
    expect(sent).toEqual([]);
    const a = liveActions(p.client, dataFor(p), elena, { now: () => NOW, wait: async () => undefined, requestChangedUrl: "https://hook.example/request-changed" });
    await a.patchRequest("ZZT-0003", { set: { "FLD-GEN-004": "y" } });
    await new Promise((r) => setTimeout(r, 0));
    expect(sent).toEqual([{ url: "https://hook.example/request-changed", payload: { portalRequestItemId: "PkReq3", idempotencyKey: expect.stringMatching(/^HO-requestChanged-/) } }]);
  });
});

describe("hand-offs to Beiersdorf's app (plan v6 §4, §4.1; built and switched on 20 Oct)", () => {
  const HOOKS = { requestChanged: "https://hook.example/rc", completenessConfirmed: "https://hook.example/i2", queryAnswered: "https://hook.example/i4", releaseGiven: "https://hook.example/i7" };
  /** The fake client with every webhook POST also in the write log, to see its place among the writes. */
  const wired = () => {
    const p = portal();
    const sent = (p.client as unknown as { webhooks: { url: string; payload: Record<string, unknown> }[] }).webhooks;
    const post = p.client.postWebhook.bind(p.client);
    p.client.postWebhook = async (url: string, payload: unknown) => {
      p.log.push(`webhook ${url}`);
      return post(url, payload);
    };
    return { p, sent };
  };
  const hookActs = (p: ReturnType<typeof portal>, o: Parameters<typeof liveActions>[3] = {}) => liveActions(p.client, dataFor(p), elena, { now: () => NOW, wait: async () => {}, webhooks: HOOKS, ...o });
  const flush = () => new Promise((r) => setTimeout(r, 0));

  it("completeness: I-2 gets only the request id, after the submit of “fill in the CIQ”", async () => {
    const { p, sent } = wired();
    await hookActs(p).confirmCompleteness("ZZT-0002");
    await flush();
    expect(p.log.slice(-2)).toEqual(["submit request PkReq2 Supplier: fill in the CIQ", "webhook https://hook.example/i2"]);
    expect(sent).toEqual([{ url: HOOKS.completenessConfirmed, payload: { portalRequestItemId: "PkReq2", idempotencyKey: expect.stringMatching(/^HO-completenessConfirmed-[a-z0-9]+-[a-z0-9]+$/) } }]);
  });

  it("an answer: I-4 gets only the query id, after the submit of “respond”", async () => {
    const { p, sent } = wired();
    const op = dataFor(p).side.cases.find((x) => x.id === "ZZT-0003")!.openPoints.find((x) => x.status === "open" && x.rounds === 1)!;
    await hookActs(p).supplierRespond("ZZT-0003", op.id, { text: "Twelve months from production." });
    await flush();
    expect(p.log.slice(-2)).toEqual(["submit query PkQ3a Supplier: respond", "webhook https://hook.example/i4"]);
    expect(sent.map((x) => x.payload)).toEqual([{ portalQueryItemId: "PkQ3a", idempotencyKey: expect.stringMatching(/^HO-queryAnswered-/) }]);
  });

  it("the final release: I-7 gets only the request id, after the submit of “give the final release”", async () => {
    const { p, sent } = wired();
    await hookActs(p).finalRelease("ZZT-0004");
    await flush();
    expect(p.log.slice(-2)).toEqual(["submit request PkReq4 Supplier: give the final release", "webhook https://hook.example/i7"]);
    expect(sent.map((x) => x.payload)).toEqual([{ portalRequestItemId: "PkReq4", idempotencyKey: expect.stringMatching(/^HO-releaseGiven-/) }]);
  });

  it("nothing is posted when the action is refused", async () => {
    const { p, sent } = wired();
    await expect(hookActs(p).confirmCompleteness("ZZT-0001")).rejects.toThrow(/must be completed or justified first/);
    await expect(hookActs(p, {}).finalRelease("ZZT-0002")).rejects.toThrow();
    await flush();
    expect(sent).toEqual([]);
  });

  it("a hand-off that can't be sent is reported, and the action still succeeds", async () => {
    const { p } = wired();
    p.client.postWebhook = async () => {
      throw new Error("the webhook could not be reached");
    };
    const problems: string[] = [];
    await hookActs(p, { onSyncProblem: (t) => problems.push(t) }).confirmCompleteness("ZZT-0002");
    await flush();
    expect(p.items.get("PkReq2")).toMatchObject({ Completeness_Confirm: "Confirmed", _current_step: STEPS.keep.name });
    expect(problems).toEqual([expect.stringMatching(/^Your confirmation is saved, but it has not reached Beiersdorf yet \(the webhook could not be reached\)\. Please let your Beiersdorf contact know\.$/)]);
  });

  const LATE = "Kissflow did not answer within 30 s. If you were saving or sending, reload to see whether it went through.";
  it("a submit that went through but answered too late still hands off (I-2), once", async () => {
    const { p, sent } = wired();
    const submit = p.client.submit.bind(p.client);
    p.client.submit = async (f: FlowKey, id: string, act: string) => {
      await submit(f, id, act); // Kissflow did it…
      throw new Error(LATE); // …but its answer was lost
    };
    await hookActs(p).confirmCompleteness("ZZT-0002");
    await flush();
    expect(sent.map((x) => x.payload.portalRequestItemId)).toEqual(["PkReq2"]);
  });

  it("a submit refused without moving the step hands off nothing, and its error stands", async () => {
    const { p, sent } = wired();
    p.client.submit = async () => {
      throw new Error("KISSFLOW_ERROR_050312 Validation failed");
    };
    await expect(hookActs(p).confirmCompleteness("ZZT-0002")).rejects.toThrow(/050312/);
    await expect(hookActs(p).finalRelease("ZZT-0004")).rejects.toThrow(/050312/);
    const op = dataFor(p).side.cases.find((x) => x.id === "ZZT-0003")!.openPoints.find((x) => x.status === "open" && x.rounds === 1)!;
    await expect(hookActs(p).supplierRespond("ZZT-0003", op.id, { text: "x" })).rejects.toThrow(/050312/);
    await flush();
    expect(sent).toEqual([]);
  });

  it("a late answer to the respond and release submits still hands off (I-4, I-7) when the item moved on", async () => {
    const { p, sent } = wired();
    const submit = p.client.submit.bind(p.client);
    p.client.submit = async (f: FlowKey, id: string, act: string) => {
      if (id === "PkReq4") p.tasks.set(id, { act: "ActReleased", step: "released" }); // the release step → "view the released CIQ"
      else await submit(f, id, act); // the query's respond step ends it
      throw new Error(LATE);
    };
    const op = dataFor(p).side.cases.find((x) => x.id === "ZZT-0003")!.openPoints.find((x) => x.status === "open" && x.rounds === 1)!;
    await hookActs(p).supplierRespond("ZZT-0003", op.id, { text: "Twelve months." });
    await hookActs(p).finalRelease("ZZT-0004");
    await flush();
    expect(sent.map((x) => x.url)).toEqual([HOOKS.queryAnswered, HOOKS.releaseGiven]);
  });

  it("a change report whose hand-off fails says so, instead of promising the next save", async () => {
    const p = portal();
    p.client.postWebhook = async () => {
      throw new Error("offline");
    };
    const problems: string[] = [];
    await hookActs(p, { onSyncProblem: (t) => problems.push(t) }).reportChange("ZZT-0005", "Our supplier changed the plant.");
    await flush();
    expect(problems).toEqual(["Your report is saved, but it has not reached Beiersdorf yet (offline). Please let your Beiersdorf contact know."]);
  });

  it("by default each hand-off goes to the page's own account (Thomas, 21 Oct): on the Kissflow host around the page when the client knows it, else as the relative path; an unknown account sends nothing", async () => {
    const KEYS = Object.keys(NO_WEBHOOKS) as (keyof Webhooks)[];
    const tokenOf = (u: string) => u.slice(u.lastIndexOf("/webhook/") + "/webhook/".length);
    // the sandbox's own page: exactly its stored URLs (compared without printing: a hook URL carries its token)
    const dev = webhooksFor(DEV_ACCOUNT, new URL(DEV_WEBHOOKS.requestChanged).hostname);
    for (const u of Object.values(dev)) expect(/^https:\/\/dev-beiersdorf\.kissflow\.eu\/integration\/2\/AcDOSunMEpSA\/webhook\/[A-Za-z0-9_-]{30,}$/.test(u)).toBe(true);
    expect(KEYS.every((k) => dev[k] === DEV_WEBHOOKS[k])).toBe(true);
    expect(new Set(Object.values(dev)).size).toBe(4);
    // any other account, host unknown: its own path, the same tokens
    const rel = webhooksFor("AcTEST");
    expect(KEYS.every((k) => rel[k] === `/integration/2/AcTEST/webhook/${tokenOf(DEV_WEBHOOKS[k])}`)).toBe(true);
    expect(webhooksFor(undefined)).toEqual(NO_WEBHOOKS);
    expect(webhooksFor("")).toEqual(NO_WEBHOOKS);
    // the fake client's account is AcTEST and it knows no parent host: the relative path of AcTEST's I-2
    const a = wired();
    await liveActions(a.p.client, dataFor(a.p), elena, { now: () => NOW, wait: async () => {} }).confirmCompleteness("ZZT-0002");
    await flush();
    expect(a.sent.length).toBe(1);
    expect(a.sent[0]!.url === webhooksFor("AcTEST").completenessConfirmed && a.sent[0]!.url.startsWith("/integration/2/AcTEST/webhook/")).toBe(true);
    // a client that knows its Kissflow parent: that host, the page's account
    const b = wired();
    const parent = `acme-prod.kissflow.${"com"}`;
    b.p.client.parentHost = parent;
    await liveActions(b.p.client, dataFor(b.p), elena, { now: () => NOW, wait: async () => {} }).confirmCompleteness("ZZT-0002");
    await flush();
    expect(b.sent.map((x) => new URL(x.url).hostname)).toEqual([parent]);
    expect(b.sent[0]!.url === `https://${parent}/integration/2/AcTEST/webhook/${tokenOf(DEV_WEBHOOKS.completenessConfirmed)}`).toBe(true);
  });
});

describe("review fixes (20 Oct night)", () => {
  it("a reopen (Release_Flag 'Reopened') unlocks the request at 'keep', even with the release lock and label left on it", async () => {
    const p = portal();
    p.items.set("PkReq4", { ...p.items.get("PkReq4")!, Release_Flag: "Reopened", Request_Locked: "Yes", Case_Phase_Label: "Awaiting your final release", _current_step: STEPS.keep.name });
    p.tasks.set("PkReq4", { act: "ActReq4Back", step: "keep" });
    const c = dataFor(p).side.cases.find((x) => x.id === "ZZT-0004")!;
    expect(c.phase).toBe("review");
    await acts(p).patchRequest("ZZT-0004", { set: { "FLD-GEN-005": "Plant 3" } });
    expect(p.log.some((l) => l.startsWith("update request PkReq4"))).toBe(true);
  });

  it("a file sent with a question answer is in Documents_JSON too", async () => {
    const p = portal();
    const c = dataFor(p).side.cases.find((x) => x.id === "ZZT-0003")!;
    const open = c.openPoints.find((x) => x.status === "open")!;
    await acts(p).supplierRespond("ZZT-0003", open.id, { text: "See the attached analysis.", file: new File(["x"], "analysis.pdf") }, c);
    const docs = JSON.parse(String(p.items.get("PkReq3")!.Documents_JSON ?? "[]")) as { fileName: string }[];
    expect(docs.some((d) => d.fileName === "analysis.pdf")).toBe(true);
  });

  it("a file that answers a question Beiersdorf has not closed can't be removed", async () => {
    const p = portal();
    const up = await acts(p).uploadDocument("ZZT-0003", { name: "x.pdf", kind: "SDS", sectionId: "K1" }, new File(["x"], "x.pdf"));
    const d = dataFor(p);
    const c = d.side.cases.find((x) => x.id === "ZZT-0003")!;
    const open = c.openPoints.find((x) => x.status !== "closed")!;
    open.thread.push({ id: "m-test", at: NOW, by: elena.id, side: "supplier", text: "answer", action: "answered", documentId: up.uploadId });
    await expect(liveActions(p.client, d, elena, { now: () => NOW, wait: async () => undefined }).removeDocument("ZZT-0003", up.uploadId)).rejects.toThrow(/answers a question/);
  });
});

describe("release-step moves while loading (Thomas, 21 Oct: a submit ignores Mandatory fields)", () => {
  const load = (p: ReturnType<typeof portal>, local: LocalNotes = emptyNotes()) => loadSupplierData(p.client, elena, local);
  const sent = (p: ReturnType<typeof portal>) => (p.client as unknown as { webhooks: unknown[] }).webhooks;
  /** Beiersdorf's release request (I-5): the flag, the lock and the label on the request, still at "keep". */
  const requestRelease = (p: ReturnType<typeof portal>, id: string) => p.items.set(id, { ...p.items.get(id)!, Release_Flag: "Requested", Request_Locked: "Yes", Case_Phase_Label: "Awaiting your final release" });
  const moveNote = (w: string[]) => w.filter((x) => /could not be (moved on|returned)/.test(x));

  it("a plain load moves nothing: not the waiting states either (the release step with 'Requested', 'keep' with 'Reopened', the released request)", async () => {
    const p = portal();
    expect(p.items.get("PkReq4")).toMatchObject({ Release_Flag: "Requested" }); // at its release step, awaiting the release
    p.items.set("PkReq3", { ...p.items.get("PkReq3")!, Release_Flag: "Reopened" }); // at "keep", back after a reopen
    p.items.set("PkReq5", { ...p.items.get("PkReq5")!, Release_Flag: "Requested" }); // at "view the released CIQ"
    p.items.set("PkReq2", { ...p.items.get("PkReq2")!, Release_Flag: "Requested" }); // at "fill in the CIQ"
    p.items.set("PkReq1", { ...p.items.get("PkReq1")!, Release_Flag: "Reopened" });
    const d = await load(p);
    expect(p.log).toEqual([]);
    expect(d.tasks.get("PkReq4")?.step).toBe("release");
    expect(d.tasks.get("PkReq3")?.step).toBe("keep");
    expect(moveNote(d.warnings)).toEqual([]);
  });

  it("at 'keep' with Release_Flag 'Requested': submits 'keep' (no field written, no hand-off) and shows the reloaded request at the final release", async () => {
    const p = portal();
    requestRelease(p, "PkReq3");
    const d = await load(p);
    expect(p.log).toEqual(["submit request PkReq3 Supplier: keep the CIQ up to date"]);
    expect(sent(p)).toEqual([]);
    // the data is the reload after the move: the request's task is now its release step
    expect(d.tasks.get("PkReq3")?.step).toBe("release");
    expect(d.bundles.find((b) => b.code === "ZZT-0003")?.step).toBe("release");
    expect(d.side.extras.get("ZZT-0003")?.releaseId).toBe("PkReq3");
    expect(d.side.cases.find((c) => c.id === "ZZT-0003")?.phase).toBe("final-release");
    expect(moveNote(d.warnings)).toEqual([]);
    // a new page load (no notes of its own) finds it waiting at the release step: nothing more is submitted
    await load(p);
    expect(p.log).toHaveLength(1);
  });

  it("at 'give the final release' with Release_Flag 'Reopened': submits it without the release fields, and the go-to returns the request to editing", async () => {
    const p = portal();
    // a reviewer reopened (I-6): flag, unlock and label; the request is still at its release step
    p.items.set("PkReq4", { ...p.items.get("PkReq4")!, Release_Flag: "Reopened", Request_Locked: "No", Case_Phase_Label: "With Beiersdorf" });
    const d = await load(p);
    expect(p.log).toEqual(["submit request PkReq4 Supplier: give the final release"]);
    expect(p.items.get("PkReq4")).not.toHaveProperty("Release_By_Name");
    expect(p.items.get("PkReq4")).not.toHaveProperty("Release_At");
    expect(sent(p)).toEqual([]);
    expect(d.tasks.get("PkReq4")?.step).toBe("keep");
    expect(d.side.cases.find((c) => c.id === "ZZT-0004")?.phase).toBe("review");
    // editable again, through the task the reload found
    // a new page load (no notes of its own) finds it at "keep" with "Reopened": nothing more is submitted
    await load(p);
    expect(p.log.filter((l) => l.startsWith("submit"))).toHaveLength(1);
    await liveActions(p.client, d, elena, { now: () => NOW, wait: async () => {} }).patchRequest("ZZT-0004", { set: { "FLD-GEN-005": "Plant 3" } });
    expect(p.log.at(-1)).toMatch(/^update request PkReq4 /);
  });

  it("on one page the request moves at every new visit of a step: requested → reopened → requested again", async () => {
    const p = portal();
    const local = emptyNotes();
    requestRelease(p, "PkReq3");
    expect((await load(p, local)).tasks.get("PkReq3")?.step).toBe("release"); // (a)
    // Beiersdorf reopens while the page stays open (I-6): the next reload returns the request to editing
    p.items.set("PkReq3", { ...p.items.get("PkReq3")!, Release_Flag: "Reopened", Request_Locked: "No", Case_Phase_Label: "With Beiersdorf" });
    const back = await load(p, local);
    expect(back.tasks.get("PkReq3")?.step).toBe("keep"); // (b)
    expect(back.side.cases.find((c) => c.id === "ZZT-0003")?.phase).toBe("review");
    // and requests the release again: moved on once more
    requestRelease(p, "PkReq3");
    const again = await load(p, local);
    expect(again.tasks.get("PkReq3")?.step).toBe("release");
    expect(again.side.cases.find((c) => c.id === "ZZT-0003")?.phase).toBe("final-release");
    expect(p.log.filter((l) => l.startsWith("submit"))).toEqual([
      "submit request PkReq3 Supplier: keep the CIQ up to date",
      "submit request PkReq3 Supplier: give the final release",
      "submit request PkReq3 Supplier: keep the CIQ up to date",
    ]);
    expect(p.items.get("PkReq3")).not.toHaveProperty("Release_By_Name");
    expect(moveNote(again.warnings)).toEqual([]);
  });

  it("a final release clicked after Beiersdorf reopened is refused without a write; the reload then returns the request to editing", async () => {
    const p = portal();
    const local = emptyNotes();
    const d = await load(p, local); // loaded while the release was requested
    expect(d.side.cases.find((c) => c.id === "ZZT-0004")?.phase).toBe("final-release");
    p.items.set("PkReq4", { ...p.items.get("PkReq4")!, Release_Flag: "Reopened", Request_Locked: "No", Case_Phase_Label: "With Beiersdorf" });
    await expect(liveActions(p.client, d, elena, { now: () => NOW, wait: async () => {}, local }).finalRelease("ZZT-0004")).rejects.toThrow(REOPENED_TEXT);
    expect(p.log).toEqual([]);
    expect(sent(p)).toEqual([]);
    const after = await load(p, local);
    expect(p.log).toEqual(["submit request PkReq4 Supplier: give the final release"]);
    expect(p.items.get("PkReq4")).not.toHaveProperty("Release_By_Name");
    expect(after.tasks.get("PkReq4")?.step).toBe("keep");
  });

  it("never moves a closed request: cancelled, completed, or locked outside the release (older items)", async () => {
    const p = portal();
    expect(p.items.get("PkReq6")).toMatchObject({ Case_Phase_Label: "Cancelled", Request_Locked: "Yes" });
    p.items.set("PkReq6", { ...p.items.get("PkReq6")!, Release_Flag: "Requested" }); // at "keep", cancelled
    p.items.set("PkReq4", { ...p.items.get("PkReq4")!, Release_Flag: "Reopened", Case_Phase_Label: "Cancelled" }); // at its release step
    const d = await load(p);
    expect(p.log).toEqual([]);
    expect(d.tasks.get("PkReq6")?.step).toBe("keep");
    expect(d.tasks.get("PkReq4")?.step).toBe("release");
    expect(moveNote(d.warnings)).toEqual([]);
    for (const closed of [{ Case_Phase_Label: "Completed", Request_Locked: "Yes" }, { Case_Phase_Label: "With Beiersdorf", Request_Locked: "Yes" }]) {
      const q = portal();
      q.items.set("PkReq3", { ...q.items.get("PkReq3")!, Release_Flag: "Requested", ...closed }); // at "keep"
      await load(q);
      expect(q.log).toEqual([]);
    }
  });

  it("the activity instance decides whether it moved, not the host's step filter: a host that ignores it can't hide a failed move", async () => {
    const p = portal();
    requestRelease(p, "PkReq3");
    const listTasks = p.client.listTasks.bind(p.client);
    p.client.listTasks = (f: FlowKey) => listTasks(f); // every task of the flow, for every step asked
    const submit = vi.fn(async () => {}); // Kissflow takes the submit but the request stays at "keep"
    p.client.submit = submit;
    const d = await load(p);
    expect(submit).toHaveBeenCalledTimes(1);
    expect(moveNote(d.warnings)).toEqual([expect.stringMatching(/^ZZT-0003: Beiersdorf has requested your final release, but the request could not be moved on to it \(Kissflow kept it at “Supplier: keep the CIQ up to date”\)/)]);
    // a move that went through counts there too (a new activity instance)
    const q = portal();
    requestRelease(q, "PkReq3");
    const listQ = q.client.listTasks.bind(q.client);
    q.client.listTasks = (f: FlowKey) => listQ(f);
    const e = await load(q);
    expect(q.log).toEqual(["submit request PkReq3 Supplier: keep the CIQ up to date"]);
    expect(e.tasks.get("PkReq3")?.step).toBe("release");
    expect(moveNote(e.warnings)).toEqual([]);
  });

  it("moves an item at most once per page load: a reload never submits it again, a new page load does", async () => {
    const p = portal();
    requestRelease(p, "PkReq3");
    const submit = vi.fn(async () => {}); // Kissflow takes the submit but the request stays at "keep"
    p.client.submit = submit;
    const local = emptyNotes();
    const first = await load(p, local);
    const again = await load(p, local);
    expect(submit).toHaveBeenCalledTimes(1);
    const note = "ZZT-0003: Beiersdorf has requested your final release, but the request could not be moved on to it (Kissflow kept it at “Supplier: keep the CIQ up to date”). Close and reopen the portal to try again; if this stays, tell your Beiersdorf contact.";
    expect(moveNote(first.warnings)).toEqual([note]);
    expect(moveNote(again.warnings)).toEqual([note]); // still waiting for the move: still said
    await load(p); // a new page load (its own notes) tries once more
    expect(submit).toHaveBeenCalledTimes(2);
  });

  it("a failed submit never blocks the page: the request loads where it is, with a warning; a late answer that moved it counts", async () => {
    const p = portal();
    requestRelease(p, "PkReq3");
    p.client.submit = async () => {
      throw new Error("KISSFLOW_ERROR_050302 You don't have permission to submit this item.");
    };
    const d = await load(p);
    expect(d.tasks.get("PkReq3")?.step).toBe("keep");
    expect(d.side.cases.find((c) => c.id === "ZZT-0003")?.phase).toBe("final-release"); // read-only, awaiting the release
    expect(d.side.cases.map((c) => c.id)).toContain("ZZT-0002"); // everything else loaded
    expect(moveNote(d.warnings)).toEqual([expect.stringMatching(/^ZZT-0003: Beiersdorf has requested your final release, but the request could not be moved on to it \(KISSFLOW_ERROR_050302 You don't have permission to submit this item\.\)/)]);
    // the submit went through, but its answer was lost: where the request stands decides
    const q = portal();
    requestRelease(q, "PkReq3");
    const submit = q.client.submit.bind(q.client);
    q.client.submit = async (f: FlowKey, id: string, act: string) => {
      await submit(f, id, act);
      throw new Error("Kissflow did not answer within 30 s. If you were saving or sending, reload to see whether it went through.");
    };
    const e = await load(q);
    expect(e.tasks.get("PkReq3")?.step).toBe("release");
    expect(moveNote(e.warnings)).toEqual([]);
  });
});
