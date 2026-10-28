// T1 acceptance (§12.1): createCase call order and the idempotent "Finish setup", with a fake actions layer, plus the
// §8.3 sequence end-to-end on T0's real actions over the fake host (the S06 command order).
import { describe, expect, it } from "vitest";
import { fakeClient, fakeRuntime } from "../../testkit/fakeClient";
import { createActions } from "../../data/actions";
import { toAuditVM, toSectionVM } from "../../data/map";
import type { AuditInput, RawItem } from "../../data/viewModels";
import { pinnedFixture, supplierFixture, T1_ME, caseFixture } from "../case/t1.fixtures";
import {
  buildBasicSection,
  buildCaseData,
  cancellationOf,
  createCase,
  defaultNewCaseInput,
  deriveContacts,
  finishSetup,
  newCaseConfigFrom,
  newCaseProblems,
  postCreateKeys,
  reactivationBlocker,
  setupGaps,
  type CreateCaseDeps,
  type NewCaseInput,
} from "./createCase";

const NOW = new Date("2026-10-08T10:00:00Z");

async function cfg(o = {}) {
  const c = newCaseConfigFrom(await pinnedFixture(o));
  if (!c) throw new Error("no cfg");
  return c;
}
function input(over: Partial<NewCaseInput> = {}): NewCaseInput {
  return {
    ...defaultNewCaseInput(NOW, null),
    supplier: supplierFixture(),
    contactIds: ["Contacts_aaaaaaaaa1", "Contacts_aaaaaaaaa3"],
    tradeName: "Lumen Calendula Extract",
    mainInci: "Calendula Officinalis Flower Extract",
    bdfMaterialNo: "BDF-100200",
    ...over,
  };
}

/** A fake actions layer recording every call in order. */
function fakeDeps(o: { failSection?: boolean; failAudit?: boolean } = {}) {
  const calls: { op: string; flow?: string; data?: Record<string, unknown>; post?: Record<string, unknown>; event?: AuditInput }[] = [];
  const deps: CreateCaseDeps = {
    now: () => NOW,
    me: T1_ME,
    async createProcessItem(flow, data, opts) {
      const draft = { instanceId: "PkNew01", activityInstanceId: "ActStart" };
      const post = opts?.postCreate?.(draft);
      calls.push({ op: "createProcessItem", flow, data, post: post?.fields });
      return { instanceId: draft.instanceId };
    },
    async createFormRow(flow, data) {
      calls.push({ op: "createFormRow", flow, data });
      if (o.failSection) throw new Error("Form submit failed");
      return { itemId: "FmSec01" };
    },
    async writeAudit(event) {
      calls.push({ op: "writeAudit", event });
      if (o.failAudit) throw new Error("audit failed");
      return { itemId: "FmEv01", eventKey: "EV-1" };
    },
  };
  return { deps, calls };
}

describe("createCase (§8.3) with a fake actions layer", () => {
  it("runs create → BASIC section → Item created, in that order, with the _id-derived keys after the create", async () => {
    const { deps, calls } = fakeDeps();
    const r = await createCase(deps, input(), await cfg());
    expect(calls.map((c) => c.op)).toEqual(["createProcessItem", "createFormRow", "writeAudit"]);
    const create = calls[0];
    expect(create.flow).toBe("CIQ_Case_A00");
    // Case_Code / Request_Key are NOT in the create data: they derive from the new _id (POST_CREATE_KEYS)
    expect(create.data).not.toHaveProperty("Case_Code");
    expect(create.data).not.toHaveProperty("Request_Key");
    expect(create.post).toEqual({ Case_Code: "CIQ-2026-PkNew01", Request_Key: "CIQ-2026-PkNew01-C1-REQ" });
    expect(create.data).toMatchObject({
      Cycle_No: 1,
      Supplier_Code: "SUP-NWB",
      Supplier_Legal_Name: "Northwind Botanicals GmbH",
      Owner_RMM: { _id: T1_ME._id },
      BDF_Contact_Name: T1_ME.Name,
      BDF_Contact_Email: T1_ME.Email,
      Portal_Contact_Ids: "PuMira01",
      Confirm_Contact_Ids: "PuMira01",
      Supplier_Contact_Emails: "mira.castell@example.test,ines.varga@example.test",
      Release_Item_Id: "FmRel01",
      Manifest_Hash: "mhash-0001",
      Overall_Approval_Required: "No",
      Case_Test: "No",
      Template_Label: "template-default-v1@1.0",
    });
    const section = calls[1];
    expect(section.flow).toBe("CIQ_Section_A00");
    expect(section.data).toMatchObject({ Section_Item_Key: "CIQ-2026-PkNew01-C1-BASIC", Section_Key: "BASIC", Section_Origin: "Template", Case_Item_Id: "PkNew01", Case_Code: "CIQ-2026-PkNew01", Definition_Hash: "hash-section-definition-BASIC-v1" });
    expect(String(section.data?.Definition_JSON)).toContain('"sectionKey":"BASIC"');
    const ev = calls[2].event!;
    expect(ev).toMatchObject({ category: "Item created", actionCode: "case.created", caseItemId: "PkNew01", caseCode: "CIQ-2026-PkNew01", objectKind: "Case" });
    expect((ev.snapshot as Record<string, unknown>).Case_Code).toBe("CIQ-2026-PkNew01");
    expect(r).toMatchObject({ instanceId: "PkNew01", caseCode: "CIQ-2026-PkNew01", setup: { section: "created", audit: "created" } });
  });

  it("creates nothing when no selected contact can confirm with a portal user id (S07); the keys are never problems", async () => {
    const { deps, calls } = fakeDeps();
    const i = input({ contactIds: ["Contacts_aaaaaaaaa3"] });
    const ps = newCaseProblems(i, await cfg());
    expect(ps.map((p) => p.field)).toEqual(["Confirm_Contact_Ids"]);
    expect(ps.some((p) => p.field === "Case_Code" || p.field === "Request_Key")).toBe(false);
    await expect(createCase(deps, i, await cfg())).rejects.toThrow(/Nothing was created/);
    expect(calls).toHaveLength(0);
  });

  it("refuses up front without a BASIC Section definition in the pinned release", async () => {
    const { deps, calls } = fakeDeps();
    await expect(createCase(deps, input(), await cfg({ noBasicDef: true }))).rejects.toThrow(/BASIC/);
    expect(calls).toHaveLength(0);
  });

  it("a failed BASIC section does not throw (the case exists): the audit row is still written and setup reports it", async () => {
    const { deps, calls } = fakeDeps({ failSection: true });
    const r = await createCase(deps, input(), await cfg());
    expect(calls.map((c) => c.op)).toEqual(["createProcessItem", "createFormRow", "writeAudit"]);
    expect(r.setup).toMatchObject({ section: "failed", audit: "created" });
    expect(r.setup.messages[0]).toMatch(/BASIC section was not created/);
  });

  it("Finish setup is idempotent: it creates only the missing rows, and nothing once both exist", async () => {
    const c = await cfg();
    const fields = { ...buildCaseData(input(), c, T1_ME), ...postCreateKeys("PkNew01", NOW) };
    // only the audit row is missing
    const a = fakeDeps();
    expect(await finishSetup(a.deps, fields, "PkNew01", c, { sectionExists: true, auditExists: false })).toMatchObject({ section: "exists", audit: "created" });
    expect(a.calls.map((x) => x.op)).toEqual(["writeAudit"]);
    // both exist: nothing is sent
    const b = fakeDeps();
    expect(await finishSetup(b.deps, fields, "PkNew01", c, { sectionExists: true, auditExists: true })).toMatchObject({ section: "exists", audit: "exists" });
    expect(b.calls).toHaveLength(0);
    // setupGaps decides by key from complete lists, and says nothing when a list is partial
    const kase = { _id: "PkNew01", caseCode: "CIQ-2026-PkNew01", cycleNo: 1 };
    const sec = [{ sectionItemKey: "CIQ-2026-PkNew01-C1-BASIC" }];
    const ev = [{ actionCode: "case.created", caseItemId: "PkNew01" }];
    expect(setupGaps(kase, [], [], { sections: true, events: true })).toEqual({ section: true, audit: true });
    expect(setupGaps(kase, sec, [], { sections: true, events: true })).toEqual({ section: false, audit: true });
    expect(setupGaps(kase, sec, ev, { sections: true, events: true })).toBeNull();
    expect(setupGaps(kase, [], [], { sections: false, events: true })).toBeNull();
  });

  it("derives the contact fields (comma-separated) and the case contacts JSON", () => {
    const s = supplierFixture();
    const d = deriveContacts(s.contacts);
    expect(d.Portal_Contact_Ids).toBe("PuMira01,PuTeo01");
    expect(d.Confirm_Contact_Ids).toBe("PuMira01,PuTeo01");
    expect(JSON.parse(d.Case_Contacts_JSON)[2]).toEqual({ name: "Ines Varga", email: "ines.varga@example.test", role: "Sales", canConfirm: false, portalUserId: null });
  });

  it("reactivation keeps the Case_Code, takes the next cycle and points at the old item, within reactivationDays", async () => {
    const c = await cfg();
    const old = caseFixture({ _status: "Rejected" }, "PkOld01");
    const d = buildCaseData(input(), c, T1_ME, { from: old });
    expect(d).toMatchObject({ Case_Code: "CIQ-2026-PkOld01", Cycle_No: 2, Request_Key: "CIQ-2026-PkOld01-C2-REQ", Reactivates_Case_Item: "PkOld01" });
    expect(postCreateKeys("PkNew9", NOW, { from: old })).toEqual({ Case_Code: "CIQ-2026-PkOld01", Request_Key: "CIQ-2026-PkOld01-C2-REQ" });
    const cancel = toAuditVM({ _id: "FmEv9", Event_Category: "Cancellation", Case_Item_Id: "PkOld01", Event_At: "2026-09-01T10:00:00Z" } as RawItem);
    expect(cancellationOf([cancel], "PkOld01")?._id).toBe("FmEv9");
    expect(reactivationBlocker(old, [cancel], { reactivationDays: 365 }, NOW)).toBeNull();
    expect(reactivationBlocker(old, [cancel], { reactivationDays: 10 }, NOW)).toMatch(/period/);
    expect(reactivationBlocker(old, [], { reactivationDays: 365 }, NOW)).toMatch(/No cancellation event/);
    expect(reactivationBlocker(caseFixture({}, "PkLive"), [cancel], { reactivationDays: 365 }, NOW)).toMatch(/Only a cancelled case/);
  });
});

describe("createCase on T0's real actions over the fake host (S06 order)", () => {
  it("create → read back → Case_Code + Request_Key at Start → read back → submit → F3 (discard first) → F8 (discard first)", async () => {
    const client = fakeClient();
    const rt = fakeRuntime(client, { me: T1_ME, now: () => NOW });
    const deps: CreateCaseDeps = { ...createActions(rt), now: () => NOW, me: T1_ME };
    const r = await createCase(deps, input(), await cfg());
    const ops = client.calls.map((c) => `${c.op}${c.flow ? `:${c.flow}` : ""}`);
    const seq = ops.filter((o) => !o.startsWith("formList"));
    expect(seq).toEqual([
      "create:CIQ_Case_A00",
      "getItem:CIQ_Case_A00",
      "update:CIQ_Case_A00",
      "getItem:CIQ_Case_A00",
      "getItem:CIQ_Case_A00",
      "submit:CIQ_Case_A00",
      "formDiscard:CIQ_Section_A00",
      "formCreate:CIQ_Section_A00",
      "formSubmit:CIQ_Section_A00",
      "formGet:CIQ_Section_A00",
      "formDiscard:CIQ_Audit_Event_A00",
      "formCreate:CIQ_Audit_Event_A00",
      "formSubmit:CIQ_Audit_Event_A00",
      "formGet:CIQ_Audit_Event_A00",
    ]);
    const update = client.calls.find((c) => c.op === "update")!;
    expect(update.data).toEqual({ Case_Code: `CIQ-2026-${r.instanceId}`, Request_Key: `CIQ-2026-${r.instanceId}-C1-REQ` });
    const item = client.items.get(`CIQ_Case_A00:${r.instanceId}`)!;
    expect(item._status).toBe("In progress");
    const sec = toSectionVM(client.forms.get("CIQ_Section_A00")![0]);
    expect(sec.sectionItemKey).toBe(`CIQ-2026-${r.instanceId}-C1-BASIC`);
    const ev = toAuditVM(client.forms.get("CIQ_Audit_Event_A00")![0]);
    expect(ev).toMatchObject({ category: "Item created", actionCode: "case.created", caseItemId: r.instanceId });
    expect((ev.snapshot as Record<string, unknown>).Trade_Name).toBe("Lumen Calendula Extract");
    expect(client.ops("update").filter((c) => c.flow === "CIQ_Audit_Event_A00")).toHaveLength(0);
  });
});

describe("F7: the BASIC row writes list values only", () => {
  it("a lead / query owner / co-reviewer outside its list is left out, never sent", async () => {
    const c = await cfg();
    const bad = { ...c, basic: { ...c.basic!, lead: "XYZ", queryOwner: "CUS", co: ["SAF", "LEG"] } };
    const row = buildBasicSection({ Case_Code: "CIQ-2026-Pk1", Cycle_No: 1 }, "Pk1", bad);
    expect(row).not.toHaveProperty("Lead_Dept");
    expect(row).not.toHaveProperty("Query_Owner_Dept");
    expect(row.Co_Review_Depts).toBe("SAF");
    const good = buildBasicSection({ Case_Code: "CIQ-2026-Pk1", Cycle_No: 1 }, "Pk1", { ...c, basic: { ...c.basic!, lead: "RMM", queryOwner: "RMM", co: [] } });
    expect(good).toMatchObject({ Lead_Dept: "RMM", Query_Owner_Dept: "RMM" });
  });
});
