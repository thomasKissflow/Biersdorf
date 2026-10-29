// Review tracks, open points (with the supplier-answer synthesis, G14), RMES and notes, checked against the domain
// objects the fixture items were written from (testing/rawFixtures.ts).
import { describe, expect, it } from "vitest";
import type { OpenPoint, User } from "@/domain/types";
import { str, type RawItem } from "@/portal/data/raw";
import { LIST, STEPS } from "../ids";
import { KF_USERS, UNPERSISTED_ANSWER, appFixtures, fixtureActing, fixtureIdentity, opItemId } from "../testing/rawFixtures";
import type { TaskRef } from "../types";
import type { AuditRow, CaseSnapshots } from "./auditMap";
import { Directory } from "./people";
import { closeByCancellation, notesOf, openPointsOf, parseThread, reviewsOf, rmesOf, type TrackCtx } from "./trackMap";

const fx = appFixtures();
const c3 = fx.cases["ZZT-0003"];
const ITEM3 = "AppZZT-0003";
const rmm = KF_USERS["u-rmm"]!._id;

function ctx(tasks: TaskRef[] = [], me = "rmm" as const): TrackCtx & { warnings: string[]; notes: string[] } {
  const acting = fixtureActing(fixtureIdentity([me]), me);
  const dir = new Directory(acting.me, acting.me.id);
  for (const id of ["UsElena", "UsRavi"]) dir.contact(id, { name: id === "UsElena" ? "Elena Márquez" : "Ravi Menon", email: id === "UsElena" ? KF_USERS["u-sup-1"]!.Email : KF_USERS["u-sup-2"]!.Email, supplierId: "SUP-ZZT-SOLVARO" });
  return { caseId: "ZZT-0003", caseItemId: ITEM3, ownerId: rmm, supplierId: "SUP-ZZT-SOLVARO", dir, tasks: new Map(tasks.map((t) => [t.itemId, t])), warnings: [], notes: [] };
}
const noSnaps = (): CaseSnapshots => ({ tracks: new Map(), ops: new Map(), notes: new Map() });
const items = (flow: "review" | "op", caseItem = ITEM3) => structuredClone(fx.db[flow].filter((it) => it.Case_Item_Id === caseItem));
const same = (a: string | undefined, b: string | undefined) => Date.parse(a ?? "") === Date.parse(b ?? "");
/** The domain thread with the fixture's ids, times compared as instants. */
const threadKey = (p: OpenPoint) => p.thread.map((m) => [m.id, m.by, m.side, m.action, m.text, Date.parse(m.at), m.newRound ?? false]);

describe("open points", () => {
  it("a list row whose full read failed (sparse) is not live, so history.updated waits (M3)", () => {
    const its = items("op");
    const sparseId = its[0]!._id;
    const { refs } = openPointsOf(its, new Map(), { ...ctx(), sparse: new Set([sparseId]) }, new Set());
    expect(refs.find((r) => r.itemId === sparseId)?.live).toBe(false);
    expect(refs.filter((r) => r.itemId !== sparseId).every((r) => r.live)).toBe(true);
  });

  it("map to the domain's points (status, rounds, thread, refs)", () => {
    const x = ctx();
    const { points } = openPointsOf(items("op"), new Map(), x, new Set());
    expect(points.map((p) => p.id)).toEqual(c3.openPoints.map((p) => p.id));
    for (const want of c3.openPoints) {
      const got = points.find((p) => p.id === want.id)!;
      expect({ status: got.status, outcome: got.outcome, rounds: got.rounds, dept: got.dept, kind: got.kind, question: got.question, justification: got.justification, createdBy: got.createdBy, responsibleId: got.responsibleId, ref: got.ref }).toEqual({ status: want.status, outcome: want.outcome, rounds: want.rounds, dept: want.dept, kind: want.kind, question: want.question, justification: want.justification, createdBy: want.createdBy, responsibleId: want.responsibleId, ref: want.ref });
      expect(threadKey(got)).toEqual(threadKey(want));
      expect(same(got.dueDate.slice(0, 10), want.dueDate.slice(0, 10))).toBe(true);
    }
    expect(x.warnings).toEqual([]);
  });

  it("appends the supplier's answer that arrived after the raiser's last write, exactly once (G14)", () => {
    const [id] = UNPERSISTED_ANSWER;
    const it = items("op").find((i) => i.OP_Key === id)!;
    expect(parseThread(it)!.thread.some((m) => m.side === "supplier")).toBe(false); // the stored thread lacks it
    const got = openPointsOf([it], new Map(), ctx(), new Set()).points[0]!;
    const want = c3.openPoints.find((p) => p.id === id)!;
    expect(got.status).toBe("in-progress");
    expect(got.thread.filter((m) => m.side === "supplier")).toHaveLength(1);
    expect(threadKey(got)).toEqual(threadKey(want));
    // the raiser's next write persists it: then nothing is appended again
    const persisted = { ...it, Thread_JSON: JSON.stringify({ thread: got.thread, edits: [] }) };
    expect(openPointsOf([persisted], new Map(), ctx(), new Set()).points[0]!.thread).toHaveLength(got.thread.length);
    // a returned point (new round, "Open") keeps its old Response_* without a new answer
    const returned = openPointsOf([items("op").find((i) => i.OP_Key === "OP-0003-02")!], new Map(), ctx(), new Set()).points[0]!;
    expect(returned.thread.at(-1)!.action).toBe("returned");
    expect(returned.status).toBe("open");
  });

  it("synthesizes 'cannot provide' with the first referenced upload", () => {
    const it = { ...items("op").find((i) => i.OP_Key === "OP-0003-04")!, OP_Progress: LIST.opProgress["in-progress"], Response_Kind: "Cannot provide", Response_Text: "No dossier exists.", Response_Doc_Refs_JSON: JSON.stringify([{ uploadId: "ZZT-0003-d2" }]), Supplier_Responsible_Email: KF_USERS["u-sup-2"]!.Email, _modified_at: "2026-10-24T09:00:00Z" };
    const m = openPointsOf([it], new Map(), ctx(), new Set()).points[0]!.thread.at(-1)!;
    expect(m).toEqual({ id: "OP-0003-04-m2", at: "2026-10-24T09:00:00Z", by: "UsRavi", side: "supplier", text: "No dossier exists.", action: "cannot-provide", documentId: "ZZT-0003-d2" });
  });

  it("an unreadable or bare-array thread starts from the raised question", () => {
    const base = items("op").find((i) => i.OP_Key === "OP-0003-04")!;
    for (const Thread_JSON of ["[]", "not json", ""]) {
      const p = openPointsOf([{ ...base, Thread_JSON }], new Map(), ctx(), new Set()).points[0]!;
      expect(p.thread).toEqual([{ id: "OP-0003-04-m1", at: base._created_at, by: KF_USERS["u-saf"]!._id, side: "internal", text: base.Question_Text, action: "raised" }]);
    }
  });

  it("closed by an outcome or an ended item; Completed without an outcome → withdrawn with a note (dev only)", () => {
    const base = items("op").find((i) => i.OP_Key === "OP-0003-04")!;
    const x = ctx();
    const done = openPointsOf([{ ...base, _status: "Completed" }], new Map(), x, new Set()).points[0]!;
    expect([done.status, done.outcome]).toEqual(["closed", "withdrawn"]);
    expect(x.notes).toHaveLength(1);
    expect(x.warnings).toHaveLength(0);
    const na = openPointsOf([{ ...base, OP_Outcome: LIST.opOutcome["not-accepted"], Outcome_Reason: "x", Closed_At: "2026-10-24T10:00:00Z", Closed_By: { _id: KF_USERS["u-saf"]!._id } }], new Map(), ctx(), new Set()).points[0]!;
    expect([na.status, na.outcome, na.closedAt, na.closedBy, na.closeReason]).toEqual(["closed", "not-accepted", "2026-10-24T10:00:00Z", KF_USERS["u-saf"]!._id, undefined]);
  });

  it("a duplicate OP_Key gets a suffix and a note (R-13, B10); a snapshot never beats a live item", () => {
    const x = ctx();
    const it = items("op").find((i) => i.OP_Key === "OP-0003-04")!;
    const dup = { ...it, _id: "PkOpDup", _created_at: "2026-10-24T08:00:00Z" };
    const snapOp = { ...c3.openPoints.find((p) => p.id === "OP-0003-04")!, question: "stale snapshot" };
    const r = openPointsOf([dup, it], new Map([["OP-0003-04", { op: snapOp, itemId: it._id, at: "2026-10-23T10:00:00Z" }]]), x, new Set());
    expect(r.points.map((p) => p.id)).toEqual(["OP-0003-04", "OP-0003-04·2"]);
    expect(r.points[0]!.question).toBe(it.Question_Text);
    expect(r.refs.map((f) => f.itemId)).toEqual([it._id, "PkOpDup"]);
    expect(x.notes).toHaveLength(1);
    expect(x.warnings).toHaveLength(0);
  });

  it("refs carry the held task, the portal query and the modification stamp", () => {
    const it = items("op").find((i) => i.OP_Key === "OP-0003-01")!;
    const task: TaskRef = { flow: "op", itemId: it._id, act: "ActHeld", activityId: STEPS.op.RMM };
    const ref = openPointsOf([it], new Map(), ctx([task]), new Set()).refs[0]!;
    expect(ref).toEqual({ caseId: "ZZT-0003", opId: "OP-0003-01", itemId: opItemId("OP-0003-01"), act: "ActHeld", activityId: STEPS.op.RMM, roundNo: 1, portalQueryItemId: "PkQ3a", modifiedAt: it._modified_at, live: true });
  });

  it("an item read without its task (admin, by id) carries its step but no act id, so no writer acts on it", () => {
    const it = items("op").find((i) => i.OP_Key === "OP-0003-01")!;
    expect(Array.isArray(it._current_context) && it._current_context.length).toBeTruthy(); // the step it reports
    const ref = openPointsOf([it], new Map(), ctx(), new Set()).refs[0]!;
    expect([ref.act, ref.activityId]).toEqual([undefined, STEPS.op.RMM]);
    // a held task's own row (load.ts keeps _activity_instance_id only there) does carry it
    const held = openPointsOf([{ ...it, _activity_instance_id: "ActRow" }], new Map(), ctx(), new Set()).refs[0]!;
    expect(held.act).toBe("ActRow");
  });

  it("points a cancellation closed show closed by it", () => {
    const { points } = openPointsOf(items("op"), new Map(), ctx(), new Set());
    const closed = closeByCancellation(points, { by: rmm, at: "2026-10-25T08:00:00Z", reason: "Not needed.", closedOpIds: ["OP-0003-04"] });
    const p = closed.find((x) => x.id === "OP-0003-04")!;
    expect([p.status, p.outcome, p.closeReason, p.thread.at(-1)!.action]).toEqual(["closed", "withdrawn", "Case cancelled: Not needed.", "withdrawn"]);
    expect(closed.find((x) => x.id === "OP-0003-01")!.status).toBe("in-progress");
  });
});

describe("review tracks", () => {
  const points = () => openPointsOf(items("op"), new Map(), ctx(), new Set()).points;

  it("map to the domain's tracks (status from the item and the open points, G17)", () => {
    const r = reviewsOf(items("review"), new Map(), points(), ctx());
    expect(r.reviews.map((t) => [t.dept, t.status, t.assigneeId])).toEqual(c3.reviews.map((t) => [t.dept, t.status, t.assigneeId]));
    expect(r.completions.map((k) => [k.dept, k.by, Date.parse(k.at)])).toEqual(c3.confirmations.filter((k) => k.type === "dept-completion").map((k) => [k.dept, k.by, Date.parse(k.at)]));
    expect(r.refs.find((f) => f.dept === "QM")).toMatchObject({ reviewKey: "ZZT-0003-QM-1", roundNo: 1, live: true });
  });

  it("decision, reopened round with lastCompletedAt, withdrawn item dropped", () => {
    const list = items("review");
    const saf = list.find((i) => i.Review_Dept === "SAF")!;
    saf.RMES_Decision = LIST.decision.rejected;
    saf.RMES_Decision_Reason = "Tox data missing.";
    const qm1 = list.find((i) => i.Review_Dept === "QM")!;
    const qm2 = { ...qm1, _id: "PkRevQM2", _status: "InProgress", Round_No: 2, Activation_Kind: "Reopened", Review_Key: "ZZT-0003-QM-2", _created_at: "2026-10-24T08:00:00Z" };
    const mic = { ...list.find((i) => i.Review_Dept === "MIC")!, _status: "Withdrawn" };
    const x = ctx();
    const r = reviewsOf([...list.filter((i) => i.Review_Dept !== "MIC"), qm2, mic], new Map(), points(), x);
    expect(r.reviews.find((t) => t.dept === "SAF")).toMatchObject({ decision: "rejected", decisionReason: "Tox data missing.", status: "waiting-supplier" });
    expect(r.reviews.find((t) => t.dept === "QM")).toMatchObject({ status: "reopened", lastCompletedAt: str(qm1, "Completed_At") });
    expect(r.reviews.find((t) => t.dept === "QM")!.completedAt).toBeUndefined();
    expect(r.refs.find((f) => f.dept === "QM")).toMatchObject({ itemId: "PkRevQM2", roundNo: 2, reviewKey: "ZZT-0003-QM-2" });
    expect(r.reviews.some((t) => t.dept === "MIC")).toBe(false);
    // B8: a withdrawn review is an ended state, not a read problem: a note, never a load warning
    expect(x.notes.some((w) => w.includes("withdrawn"))).toBe(true);
    expect(x.warnings.some((w) => w.includes("withdrawn"))).toBe(false);
    // the reopened round's earlier completion keeps its confirmation, as the domain keeps it
    expect(r.completions.filter((k) => k.dept === "QM")).toHaveLength(1);
  });

  it("waiting for the supplier wins over reopened (as the domain's retrack)", () => {
    const list = items("review");
    const rmmItem = list.find((i) => i.Review_Dept === "RMM")!;
    rmmItem.Activation_Kind = "Reopened";
    expect(reviewsOf(list, new Map(), points(), ctx()).reviews.find((t) => t.dept === "RMM")!.status).toBe("waiting-supplier");
    expect(reviewsOf(list, new Map(), [], ctx()).reviews.find((t) => t.dept === "RMM")!.status).toBe("reopened");
  });

  it("without an assignee: RMM's goes to the case owner, a department's to its inactive role user", () => {
    const list = items("review").map((i) => ({ ...i, Assignee_User: undefined }));
    const x = ctx();
    const r = reviewsOf(list, new Map(), [], x);
    expect(r.reviews.find((t) => t.dept === "RMM")!.assigneeId).toBe(rmm);
    expect(r.reviews.find((t) => t.dept === "REG")!.assigneeId).toBe("role:REG");
    const role = x.dir.get("role:REG") as User;
    expect([role.active, role.dept, role.name]).toEqual([false, undefined, "Regulatory Affairs reviewers"]);
  });

  it("m16: a list row (not read in full) takes the decision, assignee and completion time it lacks from its snapshot; its own status still wins", () => {
    const full = items("review").find((i) => i.Review_Dept === "SAF")!;
    // a live My items row (21 Oct) as the history places it (toAppState): its status and system fields plus the case,
    // department, round and key; no RMES_Decision, Assignee_User, Completed_At, not even _created_at
    const row = { _id: full._id, Name: "CIQ Review from Katrin Vogel", _status: "Completed", _completed_at: "2026-10-24T07:30:00Z", _modified_at: "2026-10-24T07:30:00Z", Case_Item_Id: ITEM3, Review_Dept: "SAF", Round_No: 1, Review_Key: "ZZT-0003-SAF-1" } as RawItem;
    const safUser = KF_USERS["u-saf"]!._id;
    const snap: CaseSnapshots["tracks"] = new Map([["SAF|1", { itemId: full._id, at: "2026-10-24T07:00:00Z", track: { dept: "SAF", status: "in-review", assigneeId: safUser, startedAt: "2026-10-20T08:00:00Z", completedAt: "2026-10-24T07:00:00Z", decision: "approved", decisionReason: "", roundNo: 1 } }]]);
    const sparse = { ...ctx(), sparse: new Set([full._id]) };
    const saf = reviewsOf([row], snap, [], sparse).reviews.find((t) => t.dept === "SAF")!;
    expect(saf).toMatchObject({ status: "completed", decision: "approved", assigneeId: safUser, completedAt: "2026-10-24T07:00:00Z", startedAt: "2026-10-20T08:00:00Z" });
    // the same row read in full: the item is the truth (no decision recorded on it)
    const read = reviewsOf([row], snap, [], ctx()).reviews.find((t) => t.dept === "SAF")!;
    expect(read.decision).toBeUndefined();
    // without Completed_At, Kissflow's own completion time, not its last change
    expect(reviewsOf([{ ...row, _modified_at: "2026-10-25T09:00:00Z" }], snap, [], ctx()).reviews.find((t) => t.dept === "SAF")!.completedAt).toBe("2026-10-24T07:30:00Z");
  });

  it("continue after rejection from Rejection_*", () => {
    const list = items("review");
    Object.assign(list.find((i) => i.Review_Dept === "RMM")!, { _status: "Completed", Completed_By: { _id: rmm }, Completed_At: "2026-10-24T08:00:00Z", Rejection_Handling: LIST.continueRelease, Rejection_Note: "Agreed with SAF.", Rejected_Depts_Covered: "SAF, REG" });
    expect(reviewsOf(list, new Map(), [], ctx()).reviews[0]!.continueAfterRejection).toEqual({ note: "Agreed with SAF.", by: rmm, at: "2026-10-24T08:00:00Z", depts: ["SAF", "REG"] });
  });
});

describe("RMES", () => {
  const rows = () => [...fx.db.rmesSAF, ...fx.db.rmesREG].filter((r) => r.Case_Item_Id === ITEM3).map((item) => ({ dept: (fx.db.rmesSAF.includes(item) ? "SAF" : "REG") as "SAF" | "REG", item: structuredClone(item) }));

  it("maps both departments' records: the record and the row's index entry only (28 Oct)", () => {
    const r = rmesOf(rows(), ctx());
    const want = c3.rmes!;
    expect(r.rmes).toMatchObject({ criteria: [], findings: [] });
    expect(Date.parse(r.rmes!.createdAt)).toBe(Date.parse(want.createdAt));
    expect(r.refs.map((f) => f.dept).sort()).toEqual(["REG", "SAF"]);
    for (const f of r.refs) expect(f).toMatchObject({ caseId: "ZZT-0003", criteriaRows: {}, findingRows: {} });
  });

  it("a legacy row's criteria and findings are not read, so they never block; voided rows are skipped; no row → no record", () => {
    const list = rows();
    const saf = list.find((r) => r.dept === "SAF")!.item;
    // as the retired criteria RMES left a row: a criterion without a result and an open blocking finding
    saf["Table::Safety_Criteria"] = [{ _id: "Safety_Criteria_legacy0001", Criteria_Code: "S-B1", Criteria_Part: "B", Criteria_Title: "Toxicological profile available and plausible", Criteria_Result: "Not available" }];
    saf["Table::Safety_Findings"] = [{ _id: "Safety_Findings_legacy0001", Findings_Key: "0003-F1", Findings_Text: "Sensitisation data missing", Findings_Blocking: LIST.yes, Findings_State: "open" }];
    const x = ctx();
    const got = rmesOf(list, x);
    expect(got.rmes).toMatchObject({ criteria: [], findings: [] });
    expect(got.refs.find((f) => f.dept === "SAF")).toMatchObject({ criteriaRows: {}, findingRows: {} });
    expect(x.notes).toEqual([]);
    expect(rmesOf(list.map((r) => ({ ...r, item: { ...r.item, RMES_Voided: LIST.yes } })), ctx()).rmes).toBeUndefined();
    expect(rmesOf([], ctx())).toEqual({ refs: [] });
  });

  it("a list row has no _created_at (live, 29 Oct): the record's time is its rmes.saved creation row's", () => {
    // as Kissflow's form list returns them: business fields and _id only
    const listed = rows().map((r) => ({ ...r, item: Object.fromEntries(Object.entries(r.item).filter(([k]) => !/^_(created|modified)_(at|by)$/.test(k))) as RawItem }));
    const saf = listed.find((r) => r.dept === "SAF")!.item;
    const reg = listed.find((r) => r.dept === "REG")!.item;
    const row = (objectItemId: string, at: string, state: string): AuditRow => ({ row: { _id: `PkEv${at}`, Object_State: state }, at, code: "rmes.saved", caseItemId: ITEM3, caseCode: "ZZT-0003", category: "RMES", objectItemId, by: "system" });
    expect(rmesOf(listed, ctx()).rmes!.createdAt).toBe("");
    // the earlier department's creation; a later decision row (not "Created") never counts
    const history = [row(reg._id, "2026-10-21T09:00:00Z", "Created"), row(saf._id, "2026-10-20T08:00:00Z", "Created"), row(saf._id, "2026-10-19T07:00:00Z", "Approved")];
    expect(rmesOf(listed, ctx(), history).rmes!.createdAt).toBe("2026-10-20T08:00:00Z");
    // a full read's own _created_at still wins
    expect(Date.parse(rmesOf(rows(), ctx(), history).rmes!.createdAt)).toBe(Date.parse(c3.rmes!.createdAt));
    // two Safety list rows: the one with the later rmes.saved row is the record; without any history, the same one on
    // every load whatever the list order
    const twin = { dept: "SAF" as const, item: { ...saf, _id: `${saf._id}Z` } };
    const two = [listed.find((r) => r.dept === "SAF")!, twin];
    const later = [...history, row(twin.item._id, "2026-10-22T10:00:00Z", "Created")];
    expect(rmesOf(two, ctx(), later).refs[0]!.itemId).toBe(twin.item._id);
    expect(rmesOf(two, ctx(), [...later, row(saf._id, "2026-10-23T10:00:00Z", "Approved")]).refs[0]!.itemId).toBe(saf._id);
    expect(rmesOf(two, ctx()).refs[0]!.itemId).toBe(rmesOf([...two].reverse(), ctx()).refs[0]!.itemId);
  });
});

describe("internal notes", () => {
  it("map with their section and resolved mentions", () => {
    const x = ctx();
    x.dir.internal(KF_USERS["u-saf"]!._id, { name: "Dr. Mira Hansen", email: KF_USERS["u-saf"]!.Email, dept: "SAF" });
    const notes = notesOf(fx.db.note.filter((n) => n.Case_Item_Id === ITEM3) as RawItem[], new Map(), x);
    expect(notes.map((n) => [n.id, n.by, n.dept, n.text, n.sectionId, n.mentions])).toEqual(c3.internalNotes.map((n) => [n.id, n.by, n.dept, n.text, n.sectionId, n.mentions]));
  });

  it("an unknown mentioned e-mail becomes an internal user with the mentioned name", () => {
    const x = ctx();
    const row = { ...fx.db.note[0]!, Note_Mentions_Emails: "new.person@beiersdorf.example", Note_Mentions_Names: "New Person" };
    const [n] = notesOf([row], noSnaps().notes, x);
    expect(n!.mentions).toEqual(["mail:new.person@beiersdorf.example"]);
    expect(x.dir.get("mail:new.person@beiersdorf.example")).toMatchObject({ name: "New Person", side: "internal" });
  });
});
