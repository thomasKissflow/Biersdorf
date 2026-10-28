// A supplier contact's supplier-portal user (26 Oct, Thomas): the shape check (components/portalUser.tsx), the CIQ
// screens' writer for a holder of Admin / Developer (write/actions.ts setContactPortalUser: a Table::Contacts delta with
// only {_id, Contacts_Portal_User_Id}, read back, one supplier.changed row), what changes in the app (the contact's id
// is its portal user: New case is no longer refused; a running case still names the person, found by e-mail) and the
// data console's own write (console/PortalUsers.tsx). Fictional people only.
import { describe, expect, it } from "vitest";
import { PORTAL_USER_ID, portalUserIdProblem } from "@/components/portalUser";
import type { AppState } from "@/domain/types";
import { json, str, type RawItem } from "@/portal/data/raw";
import { portalProblemIn, writePortalUser } from "../console/PortalUsers";
import { createFakeClient } from "../kf/fakeClient";
import { toAppState } from "../map/toAppState";
import { NO_PORTAL_CONTACT, SECOND_SUPPLIER, appFixtures, fixtureActing, fixtureIdentity, fixtureSnapshot } from "../testing/rawFixtures";
import type { WriteCtx } from "../types";
import { PORTAL_TEXT, setContactPortalUser } from "./actions";
import { GUARD_TEXT, liveGuard } from "./guards";

const HENRIK = "contact:c-henrik";
const NEW_ID = "UsZztHenrik01";

function setup(o: { developer?: boolean } = {}) {
  const identity = { ...fixtureIdentity(["admin"]), developer: o.developer ?? true };
  const acting = fixtureActing(identity, "admin");
  const client = createFakeClient({ items: { supplier: structuredClone(appFixtures().db.supplier), audit: [] }, me: { _id: identity.kfUserId, Name: identity.name } });
  const view = () => {
    const base = fixtureSnapshot("admin", "full");
    return toAppState({ snap: { ...base, forms: { ...base.forms, supplier: structuredClone(client.db.supplier), audit: [...base.forms.audit, ...structuredClone(client.db.audit)] } }, identity, acting });
  };
  let mapped = view();
  const ctx = (): WriteCtx => ({ client, identity, acting, index: mapped.index, webhooks: {}, now: () => "2026-10-26T10:00:00Z", containerOk: true });
  const link = async (contactId: string, value: string) => {
    const from = client.calls.length;
    const r = await setContactPortalUser(ctx(), mapped.state, contactId, value);
    const calls = client.calls.slice(from);
    mapped = view();
    return { r, calls, state: mapped.state };
  };
  return { client, identity, link, state: () => mapped.state, ctx };
}

const nordhafenCase = (s: AppState, contactIds: string[]) => ({ materialName: "ZZT test material", inci: "Aqua", materialNo: "RM-900001", supplierId: SECOND_SUPPLIER.code, contactIds, markets: ["EU" as const], dueDate: "2026-11-30", priority: "normal" as const, ownerId: s.users[0]!.id });
const contactRow = (c: ReturnType<typeof setup>, key: string) => (c.client.db.supplier.flatMap((s) => (s["Table::Contacts"] as RawItem[] | undefined) ?? [])).find((r) => str(r, "Contacts_Key") === key)!;

describe("portalUserIdProblem", () => {
  it("takes a Kissflow user id (trimmed), refuses anything else; empty clears", () => {
    for (const ok of ["UsElena", "UsZztHenrik01", "  UsEKl8_aB-9x  ", ""]) expect(portalUserIdProblem(ok), ok).toBeUndefined();
    for (const bad of ["Us", "Usab", "henrik.lund@nordhafen.example", "AcDOSunMEpSA", "Us Henrik", "Us<script>", `Us${"x".repeat(41)}`]) expect(portalUserIdProblem(bad), bad).toBeTruthy();
    expect(PORTAL_USER_ID.test("UsZztHenrik01")).toBe(true);
  });
});

describe("setContactPortalUser (the supplier screens, Admin / Developer)", () => {
  it("links a contact: only {_id, Contacts_Portal_User_Id} in a Table::Contacts delta, read back, one supplier.changed row; New case is no longer refused", async () => {
    const t = setup();
    const s0 = t.state();
    // before: Nordhafen's only contact has no portal user, so New case refuses
    expect(liveGuard("createCase", t.ctx(), s0, [nordhafenCase(s0, [HENRIK])])).toBe(GUARD_TEXT.noPortalContact);
    const { r, calls, state } = await t.link(HENRIK, `  ${NEW_ID} `);
    expect(r.ok, r.message).toBe(true);
    expect(r.message).toBe(PORTAL_TEXT.linked("Henrik Lund"));
    const up = calls.filter((c) => c.m === "formUpdate" && c.flow === "supplier");
    expect(up.map((c) => c.data)).toEqual([{ "Table::Contacts": [{ _id: "Contacts_chenrik", Contacts_Portal_User_Id: NEW_ID }] }]);
    expect(calls.some((c) => c.m === "formGet" && c.flow === "supplier")).toBe(true);
    expect(str(contactRow(t, "c-henrik"), "Contacts_Portal_User_Id")).toBe(NEW_ID);
    expect(r.moved).toBe(true); // the contact's id changes: the store reads everything again
    const [a] = t.client.db.audit;
    expect([a!.Action_Code, a!.Event_Category, a!.Object_Key, a!.Object_State]).toEqual(["supplier.changed", "Supplier master", SECOND_SUPPLIER.code, "Portal user linked"]);
    expect(json<{ log: { action: string }[] }>(a!, "Snapshot_JSON", { log: [] }).log.map((e) => e.action)).toEqual(["Linked portal user"]);
    expect(str(a!, "New_Value_Text")).not.toContain(NEW_ID);
    // after: the contact IS its portal user, and New case goes ahead
    const sup = state.suppliers.find((x) => x.id === SECOND_SUPPLIER.code)!;
    expect(sup.contactIds).toEqual([NEW_ID]);
    expect(state.users.find((u) => u.id === NEW_ID)).toMatchObject({ name: "Henrik Lund", side: "supplier", supplierId: SECOND_SUPPLIER.code });
    expect(liveGuard("createCase", t.ctx(), state, [nordhafenCase(state, [NEW_ID])])).toBeNull();
  });

  it("clears a link (an empty id), so the contact is a contact without a portal user again", async () => {
    const t = setup();
    await t.link(HENRIK, NEW_ID);
    const { r, calls, state } = await t.link(NEW_ID, "");
    expect(r.ok, r.message).toBe(true);
    expect(calls.find((c) => c.m === "formUpdate")?.data).toEqual({ "Table::Contacts": [{ _id: "Contacts_chenrik", Contacts_Portal_User_Id: "" }] });
    expect(state.suppliers.find((x) => x.id === SECOND_SUPPLIER.code)!.contactIds).toEqual([HENRIK]);
    expect(t.client.db.audit.map((x) => json<{ log: { action: string }[] }>(x, "Snapshot_JSON", { log: [] }).log[0]!.action)).toEqual(["Linked portal user", "Removed portal user"]);
  });

  it("refuses without Admin / Developer, a malformed id and a portal user another contact has; nothing written", async () => {
    const none = setup({ developer: false });
    expect((await none.link(HENRIK, NEW_ID)).r).toMatchObject({ ok: false, message: `Not saved: ${PORTAL_TEXT.notDeveloper}` });
    const t = setup();
    expect((await t.link(HENRIK, "Henrik Lund")).r.ok).toBe(false);
    const elena = appFixtures().users["u-sup-1"]!._id;
    expect((await t.link(HENRIK, elena)).r).toMatchObject({ ok: false, message: `Not saved: ${PORTAL_TEXT.held("Elena Márquez")}` });
    expect(t.client.calls.filter((c) => c.m === "formUpdate" || c.m === "formCreate")).toEqual([]);
  });

  it("a running case keeps naming the person: a changed link is found by the contact's e-mail (Kissflow's case is not changed)", async () => {
    const t = setup();
    const ravi = appFixtures().users["u-sup-2"]!._id;
    const c0 = t.state().cases.find((c) => c.id === "ZZT-0003")!;
    expect(c0.supplierContactIds).toContain(ravi);
    const { r, state } = await t.link(ravi, "UsZztRavi02");
    expect(r.ok, r.message).toBe(true);
    const c = state.cases.find((x) => x.id === "ZZT-0003")!;
    expect(c.supplierContactIds).toContain("UsZztRavi02");
    expect(c.supplierContactIds).not.toContain(ravi);
    expect(state.users.filter((u) => u.email === "ravi.menon@solvaro.example").map((u) => u.id)).toEqual(["UsZztRavi02"]);
  });
});

describe("the data console's portal-user column (console/PortalUsers.tsx)", () => {
  it("writes only the row's portal user, reads the item back, and says when Kissflow does not hold it", async () => {
    const t = setup();
    const item = t.client.db.supplier.find((x) => str(x, "Supplier_Code") === SECOND_SUPPLIER.code)!;
    const back = await writePortalUser(t.client, item._id, "Contacts_chenrik", ` ${NEW_ID} `);
    expect(t.client.calls.filter((c) => c.m === "formUpdate").map((c) => c.data)).toEqual([{ "Table::Contacts": [{ _id: "Contacts_chenrik", Contacts_Portal_User_Id: NEW_ID }] }]);
    expect(str((back["Table::Contacts"] as RawItem[])[0]!, "Contacts_Portal_User_Id")).toBe(NEW_ID);
    await expect(writePortalUser(t.client, item._id, "Contacts_chenrik", "not an id")).rejects.toThrow("Kissflow user id");
    const lossy = { ...t.client, formUpdate: async () => undefined };
    await expect(writePortalUser(lossy, item._id, "Contacts_chenrik", "UsZztOther01")).rejects.toThrow("the read-back holds “UsZztHenrik01”");
  });

  it("refuses a portal user another contact row of the supplier holds", () => {
    const rows = [
      { _id: "r1", Contacts_Full_Name: "Elena Márquez", Contacts_Portal_User_Id: "UsElena" },
      { _id: "r2", Contacts_Full_Name: NO_PORTAL_CONTACT.name },
    ];
    expect(portalProblemIn(rows, "r2", "UsElena")).toBe("Already the portal user of Elena Márquez.");
    expect(portalProblemIn(rows, "r1", "UsElena")).toBeUndefined();
    expect(portalProblemIn(rows, "r2", "")).toBeUndefined();
  });
});
