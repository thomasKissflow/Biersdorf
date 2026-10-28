// Audit rows ↔ AuditEvent / LogEvent (DESIGN §5.3): the domain's own phrases from Snapshot_JSON, the row itself when
// there is no snapshot, the latest snapshot per object as the fallback of roles that can't read the items.
import { describe, expect, it } from "vitest";
import { str, type RawItem } from "@/portal/data/raw";
import { KF_USERS, appFixtures, fixtureActing, fixtureIdentity } from "../testing/rawFixtures";
import { ACTION_LABEL, caseEntries, caseSnapshots, lastOf, logOf, parseSnapshot, readAuditRows } from "./auditMap";
import { Directory } from "./people";

const fx = appFixtures();
const dirFor = (p: "rmm" | "admin" = "rmm") => {
  const acting = fixtureActing(fixtureIdentity([p]), p);
  return new Directory(acting.me, fixtureIdentity([p]).kfUserId);
};
const rowsOf = (caseItem: string) => fx.db.audit.filter((r) => r.Case_Item_Id === caseItem);

describe("audit rows", () => {
  it("are read oldest first with their actor in the directory (department from Actor_Dept)", () => {
    const dir = dirFor();
    const rows = readAuditRows([...fx.db.audit].reverse(), dir);
    expect(rows.map((r) => Date.parse(r.at))).toEqual([...rows.map((r) => Date.parse(r.at))].sort((a, b) => a - b));
    const saf = KF_USERS["u-saf"]!._id;
    expect(rows.some((r) => r.by === saf)).toBe(true);
    expect(dir.get(saf)).toMatchObject({ name: "Dr. Mira Hansen", dept: "SAF", side: "internal" });
  });

  it("a case's history keeps the domain's phrases from Snapshot_JSON", () => {
    const dir = dirFor();
    const entries = caseEntries(readAuditRows(rowsOf("AppZZT-0003"), dir), dir);
    const actions = entries.map((e) => e.action);
    for (const a of ["Created case", "Raised query", "Returned answer to supplier", "Accepted answer", "Recorded RMES result", "Added finding", "Added internal note", "Completed QM review", "Activated review"]) expect(actions).toContain(a);
    // the domain's own wording survives (not the code's label)
    expect(entries.find((e) => e.action === "Raised query")!.detail).toMatch(/^OP-0003-01 on K1/);
    // supplier-side entries are not app rows (caseMap synthesizes what the app shows of them)
    expect(actions).not.toContain("Uploaded document");
  });

  it("a row without a snapshot reads as the code's phrase, its New_Value_Text and its actor", () => {
    const dir = dirFor();
    const row = { ...rowsOf("AppZZT-0003").find((r) => r.Action_Code === "op.accepted")!, Snapshot_JSON: "" } as RawItem;
    const [e] = caseEntries(readAuditRows([row], dir), dir);
    expect(e).toEqual({ id: "", at: row.Event_At, by: KF_USERS["u-rmm"]!._id, action: ACTION_LABEL["op.accepted"], detail: str(row, "New_Value_Text") });
    expect(parseSnapshot({ _id: "x", Snapshot_JSON: "[1,2]" })).toBeUndefined();
  });

  it("the latest snapshot per object: header, tracks, points, notes", () => {
    const dir = dirFor();
    const s = caseSnapshots(readAuditRows(rowsOf("AppZZT-0003"), dir), dir);
    const c = fx.cases["ZZT-0003"];
    expect(s.header).toMatchObject({ caseId: "ZZT-0003", itemId: "AppZZT-0003", materialName: c.materialName, ownerId: KF_USERS["u-rmm"]!._id, markets: c.config.SF11 });
    expect([...s.tracks.keys()].sort()).toEqual(c.reviews.map((r) => `${r.dept}|1`).sort());
    expect(s.tracks.get("QM|1")!.track.status).toBe("completed");
    expect(s.tracks.get("QM|1")!.confirmation).toMatchObject({ type: "dept-completion", dept: "QM", by: KF_USERS["u-qm"]!._id });
    // each point as its latest app write left it: the accepted one closed, the one answered since still "open"
    expect(s.ops.get("OP-0003-03")!.op.status).toBe("closed");
    expect(s.ops.get("OP-0003-01")!.op.status).toBe("open");
    expect([...s.notes.keys()]).toEqual(c.internalNotes.map((n) => n.id));
    expect(s.cancelled).toBeUndefined();
  });

  it("the latest of two codes decides (cancel vs reactivate); a reactivation clears the cancellation", () => {
    const dir = dirFor();
    const base = rowsOf("AppZZT-0003")[0]!;
    const cancel = { ...base, _id: "PkEvC", Action_Code: "case.cancelled", Event_At: "2026-10-25T08:00:00Z", Snapshot_JSON: JSON.stringify({ v: 1, code: "case.cancelled", audit: [], handoffs: [], cancelled: { by: KF_USERS["u-rmm"]!._id, at: "2026-10-25T08:00:00Z", reason: "Not needed.", fromPhase: "review", closedOpIds: ["OP-0003-01"] } }) };
    const react = { ...base, _id: "PkEvR", Action_Code: "case.reactivated", Event_At: "2026-10-26T08:00:00Z", Snapshot_JSON: "" };
    const once = readAuditRows([cancel], dir);
    expect(lastOf(once, ["case.cancelled", "case.reactivated"])!.code).toBe("case.cancelled");
    expect(caseSnapshots(once, dir).cancelled).toMatchObject({ reason: "Not needed.", closedOpIds: ["OP-0003-01"], by: KF_USERS["u-rmm"]!._id });
    const twice = readAuditRows([react, cancel], dir);
    expect(lastOf(twice, ["case.cancelled", "case.reactivated"])!.code).toBe("case.reactivated");
    expect(caseSnapshots(twice, dir).cancelled).toBeUndefined();
  });

  it("maps the acting user's Kissflow id to its alias inside snapshots", () => {
    const dir = dirFor("admin");
    const row = { ...rowsOf("AppZZT-0003").find((r) => r.Action_Code === "op.raised")! };
    // pretend the Business administrator's Kissflow user wrote it
    const text = String(row.Snapshot_JSON).split(KF_USERS["u-rmm"]!._id).join(KF_USERS["u-admin"]!._id);
    const [e] = caseEntries(readAuditRows([{ ...row, Snapshot_JSON: text }], dir), dir);
    expect(e!.by).toBe("u-admin");
  });
});

describe("the global log", () => {
  it("supplier-master and configuration rows without a case, from Snapshot_JSON.log, numbered L-0001…", () => {
    const dir = dirFor();
    const log = logOf(readAuditRows(fx.db.audit, dir), dir);
    expect(log).toEqual([{ id: "L-0001", at: "2026-10-12T09:30:00Z", by: KF_USERS["u-admin"]!._id, kind: "supplier", action: "Added contact", detail: "Joana Pires (QA Assistant) added to Solvaro Oleochemicals S.A.", supplierId: "SUP-ZZT-SOLVARO" }]);
  });

  it("a row without a snapshot log reads as its code's phrase", () => {
    const dir = dirFor();
    const row: RawItem = { _id: "PkEvCfg", _created_at: "2026-10-13T10:00:00Z", _created_by: { _id: KF_USERS["u-admin"]!._id, Name: "Nina Hoffmann" }, Case_Code: "", Event_At: "2026-10-13T10:00:00Z", Event_Category: "Configuration", Action_Code: "config.published", New_Value_Text: "RS-2026.2 + v2 published." };
    expect(logOf(readAuditRows([row], dir), dir)).toEqual([{ id: "L-0001", at: "2026-10-13T10:00:00Z", by: KF_USERS["u-admin"]!._id, kind: "config", action: "Published configuration", detail: "RS-2026.2 + v2 published." }]);
  });
});

describe("FE-CLEANUP C25: an Action_Code this app does not know", () => {
  it("dev names the code; production says “Other change” in History and the Audit trail", () => {
    const dir = dirFor();
    const base = { _created_at: "2026-10-13T10:00:00Z", _created_by: { _id: KF_USERS["u-admin"]!._id, Name: "Nina Hoffmann" }, Event_At: "2026-10-13T10:00:00Z", Action_Code: "foo.bar", New_Value_Text: "x" };
    const onCase: RawItem = { ...base, _id: "PkEvFoo", Case_Code: "ZZT-0003", Event_Category: "Case" };
    expect(caseEntries(readAuditRows([onCase], dir), dir)[0]!.action).toBe("foo.bar");
    expect(caseEntries(readAuditRows([onCase], dir), dir, "dev")[0]!.action).toBe("foo.bar");
    expect(caseEntries(readAuditRows([onCase], dir), dir, "prod")[0]!.action).toBe("Other change");
    const global: RawItem = { ...base, _id: "PkEvFoo2", Case_Code: "", Event_Category: "Configuration" };
    expect(logOf(readAuditRows([global], dir), dir)[0]!.action).toBe("foo.bar");
    expect(logOf(readAuditRows([global], dir), dir, "prod")[0]!.action).toBe("Other change");
    // a known code keeps its phrase everywhere; a row without a code keeps "Recorded" / "Changed" in both
    expect(caseEntries(readAuditRows([{ ...onCase, Action_Code: "case.cancelled" }], dir), dir, "prod")[0]!.action).toBe(ACTION_LABEL["case.cancelled"]);
    expect(caseEntries(readAuditRows([{ ...onCase, Action_Code: "" }], dir), dir, "prod")[0]!.action).toBe("Recorded");
    expect(logOf(readAuditRows([{ ...global, Action_Code: "" }], dir), dir, "prod")[0]!.action).toBe("Changed");
  });
});
