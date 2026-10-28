// The pure parts of the writers (DESIGN §7.1): field encoding (dates without milliseconds, users and the acting
// user's alias, Select texts, compact), the read-back comparison and writeVerified's re-apply, the Mandatory gate,
// staleCheck, the webhook settings and the hand-off states, and the audit row's fields and snapshot.
import { describe, expect, it } from "vitest";
import type { OpenPoint, User } from "@/domain/types";
import type { RawItem } from "@/portal/data/raw";
import { DEV_ACCOUNT } from "../env";
import { LIST, MANDATORY, STEPS } from "../ids";
import { createFakeClient } from "../kf/fakeClient";
import { parseSnapshot } from "../map/auditMap";
import { parseThread } from "../map/trackMap";
import { fixtureActing, fixtureIdentity } from "../testing/rawFixtures";
import type { AppClient, AuditInput, LiveIndex, WriteCtx } from "../types";
import { EVENT_CATEGORY, auditRowData, eventKey } from "./audit";
import { compact, contactRow, countryCode, criterionRow, findingRow, kfDate, kfDateTimeOf, supplierFields, threadJson, toKfIds, userRef } from "./encode";
import { HANDED_OVER, HANDOFF_CODES, PENDING_NO_TARGET, PENDING_NO_URL, handoff, hookToken, hookUrl, webhooksOf } from "./handoff";
import { QUEUE_TEXT, STALE_TEXT, StaleError, VerifyError, assertMandatory, missingOf, rowsMissing, sameValue, staleCheck, writeVerified } from "./verify";

const NO_MS = /\.\d{3}Z$/;
const emptyIndex = (): LiveIndex => ({ cases: new Map(), reviews: new Map(), ops: new Map(), rmes: new Map(), suppliers: new Map(), releases: [], settings: {}, caseBanners: new Map() });

function who(persona: "rmm" | "admin") {
  const identity = fixtureIdentity([persona]);
  return { identity, acting: fixtureActing(identity, persona) };
}

describe("encode", () => {
  it("writes Dates as yyyy-mm-dd and DateTimes without milliseconds", () => {
    expect(kfDate("2026-11-30T00:00:00.000Z")).toBe("2026-11-30");
    expect(kfDate("2026-11-30")).toBe("2026-11-30");
    expect(kfDate("not a date")).toBe("");
    expect(kfDateTimeOf("2026-10-24T09:00:00.123Z")).toBe("2026-10-24T09:00:00Z");
    expect(kfDateTimeOf("2026-10-24T09:00:00.123Z")).not.toMatch(NO_MS);
    expect(kfDateTimeOf(undefined)).toBe("");
  });

  it("drops empty values, never a 0 or false", () => {
    expect(compact({ a: "", b: undefined, c: null, d: [], e: 0, f: false, g: "x" })).toEqual({ e: 0, f: false, g: "x" });
  });

  it("maps the acting user's alias to its Kissflow id and never writes a stand-in as a user", () => {
    const admin = who("admin");
    expect(admin.acting.me.id).toBe("u-admin");
    expect(userRef("u-admin", admin)).toEqual({ _id: admin.identity.kfUserId });
    const rmm = who("rmm");
    // as RMM, "u-admin" is the static first-configuration administrator, not this user
    expect(userRef("u-admin", rmm)).toBeUndefined();
    for (const id of ["system", "role:QM", "contact:c-joana", "mail:x@y.example", ""]) expect(userRef(id, rmm)).toBeUndefined();
    expect(userRef("UsElena", rmm)).toEqual({ _id: "UsElena" });
    expect(toKfIds({ by: "u-admin", deep: [{ by: "u-admin" }], other: "UsX" }, admin)).toEqual({ by: admin.identity.kfUserId, deep: [{ by: admin.identity.kfUserId }], other: "UsX" });
  });

  it("writes Thread_JSON as {thread, edits}, which the mapper reads back", () => {
    const op = {
      id: "OP-0003-09",
      thread: [
        { id: "m1", at: "2026-10-24T09:00:00.000Z", by: "UsRmmKatrin", side: "internal", text: "Please send the SDS.", action: "raised" },
        { id: "m2", at: "2026-10-24T10:00:00.000Z", by: "UsElena", side: "supplier", text: "Attached.", action: "answered", documentId: "up-1" },
      ],
      edits: [{ at: "2026-10-24T11:00:00.000Z", by: "UsRmmKatrin", field: "dueDate", from: "2026-11-01", to: "2026-11-15" }],
    } as unknown as OpenPoint;
    const text = threadJson(op, who("rmm"));
    const back = parseThread({ _id: "x", Thread_JSON: text } as RawItem)!;
    expect(back.thread.map((m) => [m.side, m.action, m.documentId])).toEqual([["internal", "raised", undefined], ["supplier", "answered", "up-1"]]);
    expect(back.edits).toHaveLength(1);
  });

  it("encodes RMES rows with the live option texts and no formula field", () => {
    const row = criterionRow({ id: "S-A1", part: "A", dept: "SAF", title: "T", source: { sectionId: "K2.2", fieldId: "FLD-A14-101", version: 1, label: "K2.2" }, result: "not-listed", comment: "c", by: "UsSafMira", at: "2026-10-24T09:00:00.500Z", limit: { substance: "Cd", value: 1, unit: "mg/kg", limit: 0.1, limitSetVersion: "L1", pass: false } }, who("rmm"));
    expect(row).toMatchObject({ Criteria_Code: "S-A1", Criteria_Part: "A", Criteria_Applicable: LIST.yes, Criteria_Result: LIST.rmesResult["not-listed"], Criteria_Recorded_By: { _id: "UsSafMira" }, Criteria_Recorded_At: "2026-10-24T09:00:00Z", Criteria_Limit_Pass: LIST.no, Criteria_Reported_Value: 1 });
    expect(row).not.toHaveProperty("Criteria_Open_Num");
    expect(findingRow({ id: "0003-F2", criterionId: "S-B1", dept: "SAF", text: "x", blocking: true, status: "open" })).toEqual({ Findings_Key: "0003-F2", Findings_Criterion_Code: "S-B1", Findings_Text: "x", Findings_Blocking: LIST.yes, Findings_State: "open" });
  });

  it("encodes the supplier master with the live country list and Yes/No texts", () => {
    expect(countryCode("Spain")).toBe("ES");
    expect(countryCode("ES")).toBe("ES");
    expect(countryCode("United Kingdom")).toBe("GB");
    expect(countryCode("Brazil")).toBe("");
    expect(supplierFields({ id: "s9", name: "Kestrel Polymers Ltd", duns: "209558317", country: "United Kingdom", city: "Runcorn", type: "distributor", contactIds: [] })).toEqual({ Supplier_Code: "s9", Supplier_Legal_Name: "Kestrel Polymers Ltd", DUNS_Number: "209558317", Supplier_Kind: LIST.supplierKind.distributor, Supplier_Country_Code: "GB", Supplier_City: "Runcorn", Supplier_Active: LIST.yes });
    const u: User = { id: "u-s9-1", name: "Oliver Grant", email: "oliver.grant@kestrel.example", side: "supplier", title: "Regulatory Lead", supplierId: "s9", initials: "OG", mayConfirm: false };
    expect(contactRow(u)).toEqual({ Contacts_Key: "u-s9-1", Contacts_Full_Name: "Oliver Grant", Contacts_Email: "oliver.grant@kestrel.example", Contacts_Title: "Regulatory Lead", Contacts_Can_Confirm: LIST.no, Contacts_Active: LIST.yes });
  });
});

describe("verify", () => {
  it("compares read-backs as Kissflow returns them", () => {
    expect(sameValue({ _id: "Us1" }, { _id: "Us1", Name: "A", Kind: "User" })).toBe(true);
    expect(sameValue([{ _id: "Us1" }], [{ _id: "Us1", Name: "A" }])).toBe(true);
    expect(sameValue([{ _id: "Us1" }], [{ _id: "Us2" }])).toBe(false);
    expect(sameValue(3, "3")).toBe(true);
    expect(sameValue(0, undefined)).toBe(false);
    expect(sameValue("2026-11-30", "2026-11-30T00:00:00Z")).toBe(true);
    expect(sameValue("2026-10-24T09:00:00Z", "2026-10-24T09:00:00.000Z")).toBe(true);
    expect(missingOf({ A: "x", B: 1, "Table::T": [], _id: "q" }, { _id: "i", A: "x", B: 2 })).toEqual(["B"]);
  });

  it("finds child rows by _id (an update) or by key (a new row)", () => {
    const back = { _id: "i", "Table::T": [{ _id: "T_1", K: "a", V: "1" }, { _id: "T_2", K: "b", V: "2" }] } as RawItem;
    expect(rowsMissing(back, "T", "K", [{ _id: "T_1", V: "1" }, { K: "b", V: "2" }])).toEqual([]);
    expect(rowsMissing(back, "T", "K", [{ _id: "T_1", V: "9" }, { _is_created: true, _id: "T_new", K: "c" }])).toEqual(["T.T_1", "T.c"]);
  });

  it("writeVerified re-applies a lost write, skips one already held, and gives up after 3 tries", async () => {
    let stored: RawItem = { _id: "i", A: "old" };
    let writes = 0;
    let lose = 1;
    const read = async () => ({ ...stored });
    const write = async () => {
      writes++;
      if (lose-- > 0) return; // the first write is lost (two writes within ~0.1 s, plan v5 P3)
      stored = { ...stored, A: "new" };
    };
    const back = await writeVerified(read, write, (b) => missingOf({ A: "new" }, b));
    expect([back.A, writes]).toEqual(["new", 2]);
    writes = 0;
    await writeVerified(read, write, (b) => missingOf({ A: "new" }, b));
    expect(writes).toBe(0);
    await expect(writeVerified(read, async () => undefined, (b) => missingOf({ A: "other" }, b))).rejects.toBeInstanceOf(VerifyError);
  });

  it("gates on the step's Mandatory fields and on Review_Gate = OK", () => {
    const full = Object.fromEntries(MANDATORY[STEPS.review.QM]!.map((k) => [k, k === "Review_Gate" ? "OK" : k === "Completed_By" ? { _id: "Us1" } : "x"]));
    expect(assertMandatory({ _id: "i", ...full }, STEPS.review.QM)).toEqual([]);
    expect(assertMandatory({ _id: "i", ...full, Review_Gate: "" }, STEPS.review.QM)).toEqual(["Review_Gate"]);
    expect(assertMandatory({ _id: "i", ...full, Completed_By: { _id: "" } }, STEPS.review.QM)).toEqual(["Completed_By"]);
    expect(assertMandatory({ _id: "i" }, STEPS.op.QM)).toEqual(["OP_Outcome"]);
  });

  it("staleCheck refuses a moved _modified_at and a task that left the queue", async () => {
    const it0 = { _id: "PkOp1", _status: "InProgress", _created_by: { _id: "UsQmLena", Name: "Lena Krause" }, _modified_at: "2026-10-24T08:00:00Z", OP_Dept: "QM", Raiser_Assignee: [{ _id: "UsQmLena" }], _current_context: [{ _context_activity_id: STEPS.op.QM, _context_activity_instance_id: "Act1" }] } as RawItem;
    const fake = createFakeClient({ items: { op: [it0] }, me: { _id: "UsQmLena", Name: "Lena Krause" } });
    const ctx = { client: fake };
    await expect(staleCheck(ctx, "op", { itemId: "PkOp1", act: "Act1", modifiedAt: "2026-10-24T08:00:00Z" })).resolves.toMatchObject({ _id: "PkOp1" });
    fake.set("PkOp1", { Response_Text: "answered meanwhile" });
    await expect(staleCheck(ctx, "op", { itemId: "PkOp1", act: "Act1", modifiedAt: "2026-10-24T08:00:00Z" })).rejects.toThrow(STALE_TEXT.op);
    await expect(staleCheck(ctx, "op", { itemId: "PkOp1", act: "ActOther" })).rejects.toThrow(new StaleError(QUEUE_TEXT.op));
  });
});

describe("hand-offs", () => {
  it("reads only https URLs of known codes from the Settings payload (m3: never http, a hook URL can carry a token)", () => {
    expect(HANDOFF_CODES).toHaveLength(12);
    expect(HANDOFF_CODES).toContain("case.started");
    expect(webhooksOf({ webhooks: { "op.round": "https://hooks.example/round", "op.closed": "javascript:alert(1)", "nope.code": "https://x.example" } })).toEqual({ "op.round": "https://hooks.example/round" });
    expect(webhooksOf({ "history.updated": "https://hooks.example/h" })).toEqual({ "history.updated": "https://hooks.example/h" });
    expect(webhooksOf({ webhooks: { "history.updated": "http://127.0.0.1:9/h", "op.round": "http://hooks.example/round" } })).toEqual({});
    expect(webhooksOf({ undefinedOrigins: [] })).toEqual({});
  });

  it("production (Thomas, 21 Oct): a stored URL gives its token; the URL is built on the running account and Kissflow host", () => {
    // SET:current as copied from the dev sandbox: production differs in its domain and its account, the tokens are the same
    const DEV_HOST = "dev-beiersdorf.kissflow.eu", PROD_HOST = "ciq-prod.kissflow.com", PROD_ACCOUNT = "AcPRODZZT";
    const stored = (token: string) => `https://${DEV_HOST}/integration/2/${DEV_ACCOUNT}/webhook/${token}`;
    const settings = { webhooks: { "op.round": stored("hk-Round_1"), "op.closed": "https://hooks.example/integration/2/AcOTHER/webhook/hkClosed", "history.updated": `http://${DEV_HOST}/integration/2/${DEV_ACCOUNT}/webhook/hk-H` } };
    // dev host + dev account: the URL as stored
    expect(webhooksOf(settings, { accountId: DEV_ACCOUNT, host: DEV_HOST })).toEqual({ "op.round": stored("hk-Round_1"), "op.closed": `https://${DEV_HOST}/integration/2/${DEV_ACCOUNT}/webhook/hkClosed` });
    // production: its own host and account, the same token; the stored host and account are never used
    expect(webhooksOf(settings, { accountId: PROD_ACCOUNT, host: PROD_HOST })).toEqual({
      "op.round": `https://${PROD_HOST}/integration/2/${PROD_ACCOUNT}/webhook/hk-Round_1`,
      "op.closed": `https://${PROD_HOST}/integration/2/${PROD_ACCOUNT}/webhook/hkClosed`,
    });
    // no acceptable Kissflow page around the frame: the relative path, for kf.api
    const relative = { "op.round": `/integration/2/${PROD_ACCOUNT}/webhook/hk-Round_1`, "op.closed": `/integration/2/${PROD_ACCOUNT}/webhook/hkClosed` };
    expect(webhooksOf(settings, { accountId: PROD_ACCOUNT })).toEqual(relative);
    for (const host of ["hooks.example", "kissflow.eu", `${PROD_HOST}.attacker.example`, "evil-kissflow.com", ""]) expect(webhooksOf(settings, { accountId: PROD_ACCOUNT, host })).toEqual(relative);
    // the live suites' one-argument call: as stored (http stays refused)
    expect(webhooksOf(settings)).toEqual({ "op.round": stored("hk-Round_1"), "op.closed": "https://hooks.example/integration/2/AcOTHER/webhook/hkClosed" });
    expect(webhooksOf({ "op.round": ` ${stored("hk-R")} ` }, { accountId: PROD_ACCOUNT, host: PROD_HOST })).toEqual({ "op.round": `https://${PROD_HOST}/integration/2/${PROD_ACCOUNT}/webhook/hk-R` });
    expect(hookUrl("hk-R", { accountId: PROD_ACCOUNT, host: PROD_HOST })).toBe(`https://${PROD_HOST}/integration/2/${PROD_ACCOUNT}/webhook/hk-R`);
    expect(hookUrl("hk-R", { accountId: "Ac/../x" })).toBeUndefined(); // an account id that would change the path
  });

  it("a stored URL without a token gives the screens no URL, so its hand-off is pending", () => {
    const hook = `https://dev-beiersdorf.kissflow.eu/integration/2/${DEV_ACCOUNT}/webhook`;
    expect(hookToken(`${hook}/hk-R_1`)).toBe("hk-R_1");
    expect(hookToken("https://hooks.example/integration/2/AcOTHER/webhook/hk-R_1")).toBe("hk-R_1"); // the stored host is never used
    // only exactly /integration/2/<account>/webhook/<token> gives a token (as the portal's hookToken): never another segment
    const none = [
      `${hook}/`,
      hook, // no token, no trailing slash: not "webhook"
      `https://dev-beiersdorf.kissflow.eu/integration/2/${DEV_ACCOUNT}`, // not the account id
      `https://dev-beiersdorf.kissflow.eu/process/2/${DEV_ACCOUNT}/admin/CIQ_Case_A00`, // a REST path: not the flow id
      "https://hooks.example/closed", // another kind of URL
      `${hook}/hk-R_1/x`,
      `https://dev-beiersdorf.kissflow.eu/x/integration/2/${DEV_ACCOUNT}/webhook/hk-R_1`,
      `${hook}/hk-R_1?x=1`, // a query or fragment is never dropped silently
      `${hook}/hk-R_1#y`,
      `${hook}/hk-R_1?`,
      `https://u:p@dev-beiersdorf.kissflow.eu/integration/2/${DEV_ACCOUNT}/webhook/hk-R_1`,
      `${hook}/hk-R\t_1`, // the URL parser would drop the tab and change the token
      `http://dev-beiersdorf.kissflow.eu/integration/2/${DEV_ACCOUNT}/webhook/hk-R_1`,
      `${hook}/hk.R_1`,
      `${hook}/a%2Fb`,
      "https://dev-beiersdorf.kissflow.eu",
      "https://dev-beiersdorf.kissflow.eu/w/..",
      "not a url",
    ];
    for (const url of none) {
      expect(hookToken(url), url).toBeUndefined();
      expect(webhooksOf({ "op.round": url }, { accountId: DEV_ACCOUNT, host: "dev-beiersdorf.kissflow.eu" })).toEqual({});
      expect(webhooksOf({ "op.round": url }, { accountId: DEV_ACCOUNT })).toEqual({});
    }
    // the live suites' one-argument call keeps every https URL as stored (their offline fakes end in a code, "op.round")
    expect(webhooksOf({ "op.round": "https://hooks.invalid/app/op.round" })).toEqual({ "op.round": "https://hooks.invalid/app/op.round" });
  });

  it("is pending without a target or a URL, sent (handed over) with a URL; a failed POST goes to onHandoffProblem", async () => {
    const fake = createFakeClient({ items: {}, me: { _id: "UsRmmKatrin", Name: "Katrin Vogel" } });
    const payload = { opItemId: "PkOpOP000302" };
    expect(await handoff({ client: fake, webhooks: {} }, "op.closed", null)).toEqual({ code: "op.closed", status: "pending", detail: PENDING_NO_TARGET });
    expect(await handoff({ client: fake, webhooks: {} }, "op.closed", payload)).toEqual({ code: "op.closed", status: "pending", detail: PENDING_NO_URL });
    const sent = await handoff({ client: fake, webhooks: { "op.closed": "https://hooks.example/closed" } }, "op.closed", payload);
    expect(sent).toEqual({ code: "op.closed", status: "sent", detail: HANDED_OVER, key: expect.stringMatching(/^HO-op\.closed-[a-z0-9]+-[a-z0-9]{6}$/) });
    await new Promise((go) => setTimeout(go, 0));
    // m2: every POST carries the idempotency key, the same one the status records
    expect(fake.hooks).toEqual([{ url: "https://hooks.example/closed", payload: { ...payload, idempotencyKey: sent.key } }]);
    expect(await handoff({ client: fake, webhooks: { "op.closed": "https://hooks.example/closed" } }, "op.closed", payload, "REL-x-R1")).toMatchObject({ key: "REL-x-R1" });
    expect(fake.hooks[1]!.payload).toEqual({ ...payload, idempotencyKey: "REL-x-R1" });
    // fire-and-forget (gap 5): the failure comes after the status, to onHandoffProblem only, never as a rejection
    const down = createFakeClient({ items: {}, me: { _id: "UsRmmKatrin", Name: "Katrin Vogel" } }, { refuse: { postWebhook: "The webhook answered 500." } });
    const problems: string[][] = [];
    const told = await handoff({ client: down, webhooks: { "op.closed": "https://hooks.example/closed" }, onHandoffProblem: (code, key, why) => problems.push([code, key, why]) }, "op.closed", payload);
    expect(told).toMatchObject({ status: "sent", detail: HANDED_OVER });
    await new Promise((go) => setTimeout(go, 0));
    expect(problems).toEqual([["op.closed", told.key, "The webhook answered 500."]]);
    // without a reporter, and with a client that throws at once, nothing escapes either
    const throwing: AppClient = {
      ...down,
      postWebhook: () => {
        throw new Error("no fetch on this page");
      },
    };
    expect(await handoff({ client: throwing, webhooks: { "op.closed": "https://hooks.example/closed" } }, "op.closed", payload)).toMatchObject({ status: "sent" });
  });
});

describe("audit rows", () => {
  it("carry the event key, category, actor, object, hand-offs and a snapshot with Kissflow ids", () => {
    const { identity, acting } = who("admin");
    const index = emptyIndex();
    const ctx: WriteCtx = { client: createFakeClient({ items: {}, me: { _id: identity.kfUserId, Name: identity.name } }), identity, acting, index, webhooks: {}, now: () => "2026-10-24T09:00:00.456Z", containerOk: true };
    const x: AuditInput = {
      code: "supplier.changed",
      object: { kind: "Supplier", key: "SUP-ZZT-SOLVARO", itemId: "PkSupSolvaro" },
      ref: { flow: "supplier", itemId: "PkSupSolvaro" },
      entries: [],
      log: [{ id: "L-0002", at: "2026-10-24T09:00:00.456Z", by: "u-admin", kind: "supplier", action: "Added contact", detail: "Ines Duarte added.", supplierId: "SUP-ZZT-SOLVARO" }],
      handoffs: [{ code: "history.updated", status: "pending", detail: PENDING_NO_URL }],
    };
    const row = auditRowData(ctx, x);
    expect(String(row.Event_Key)).toMatch(/^EV-LOG-20261024090000-[a-z0-9]{4}$/);
    expect(eventKey("ZZT-0003", "2026-10-24T09:00:00Z")).toMatch(/^EV-ZZT-0003-20261024090000-[a-z0-9]{4}$/);
    expect(row).toMatchObject({ Event_At: "2026-10-24T09:00:00Z", Event_Category: EVENT_CATEGORY["supplier.changed"], Action_Code: "supplier.changed", Actor_Side: "BDF", Actor_Name: identity.name, Actor_Email: identity.email, Actor_Role_Id: acting.roleId, Object_Kind: "Supplier", Object_Key: "SUP-ZZT-SOLVARO", Ref_Flow_Id: "CIQ_Supplier_A00", Notify_Channel: "webhook", New_Value_Text: "Ines Duarte added." });
    expect(row).not.toHaveProperty("Case_Code");
    expect(row).not.toHaveProperty("Actor_Dept");
    expect(JSON.parse(String(row.Notify_Recipient))).toEqual(x.handoffs);
    const snap = parseSnapshot(row as RawItem)!;
    expect(snap).toMatchObject({ v: 1, code: "supplier.changed", audit: [], handoffs: x.handoffs });
    expect(snap.log![0]!.by).toBe(identity.kfUserId);
  });

  it("m5: a Case object's own item id is its Case_Item_Id, before the index entry under its code (R-13, a new case)", () => {
    const { identity, acting } = who("rmm");
    const index = emptyIndex();
    // the index names another case item under the same code (R-13), or a case just created is not indexed yet
    index.cases.set("ZZT-0003", { caseId: "ZZT-0003", itemId: "AppZZT-0003-old", cycleNo: 2, supplierCode: "SUP-ZZT-SOLVARO", readable: true, contacts: [] });
    const ctx: WriteCtx = { client: createFakeClient({ items: {}, me: { _id: identity.kfUserId, Name: identity.name } }), identity, acting, index, webhooks: {}, now: () => "2026-10-24T09:00:00Z", containerOk: true };
    const base = { code: "case.cancelled" as const, caseId: "ZZT-0003", entries: [], handoffs: [] };
    expect(auditRowData(ctx, { ...base, object: { kind: "Case", key: "ZZT-0003", itemId: "AppZZT-0003-new" } }).Case_Item_Id).toBe("AppZZT-0003-new");
    expect(auditRowData(ctx, { ...base, object: { kind: "Case", key: "ZZT-0003" } }).Case_Item_Id).toBe("AppZZT-0003-old");
    // any other object joins its case through the index
    expect(auditRowData(ctx, { ...base, code: "op.closed", object: { kind: "Open point", key: "OP-0003-01", itemId: "PkOp1" } }).Case_Item_Id).toBe("AppZZT-0003-old");
  });
});
