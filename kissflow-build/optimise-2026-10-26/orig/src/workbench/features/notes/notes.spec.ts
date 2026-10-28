// T3 notes (§8.16, BR-064): the F7 row builder, edit by the author only, the text-only edit patch, the linked filter,
// and the create/edit writes on the fake host (create lane: discard first; no delete). Fictional people only.
import { describe, expect, it } from "vitest";
import { fakeClient, fakeRuntime, ME } from "../../testkit/fakeClient";
import { createActions } from "../../data/actions";
import { toNoteVM } from "../../data/map";
import type { RawItem } from "../../data/viewModels";
import { buildNoteRow, canEditNote, noteEditPatch, notesFor, NOTE_FLOW } from "./notes";

const c = { _id: "PkC4", caseCode: "CIQ-2026-PkC4", cycleNo: 1 };
const now = new Date("2026-10-08T10:15:30.250Z");
const seq = () => {
  let x = 0.31;
  return () => (x = (x * 7.13 + 0.17) % 1);
};

describe("buildNoteRow", () => {
  it("Note_Key, the case keys, Note_Text, Note_Author = me, Note_Dept from the role, Note_At without ms", () => {
    const row = buildNoteRow({ c, me: { _id: "UsJo" }, dept: "SAF", text: "  Check the impurity profile with REG.  ", now, rnd: seq() });
    expect(row).toMatchObject({ Case_Code: "CIQ-2026-PkC4", Cycle_No: 1, Case_Item_Id: "PkC4", Note_Text: "Check the impurity profile with REG.", Note_Author: { _id: "UsJo" }, Note_Dept: "SAF", Note_At: "2026-10-08T10:15:30Z" });
    expect(String(row.Note_Key)).toMatch(/^NOTE-/);
    expect(row).not.toHaveProperty("Linked_Kind");
  });
  it("Linked_* when linked; no Note_Dept for roles without a department (reader, approver, admin)", () => {
    const row = buildNoteRow({ c, me: { _id: "UsMax" }, dept: "", text: "Noted", linked: { kind: "Open point", key: "CIQ-2026-PkC4-C1-OPx1" }, now });
    expect(row).toMatchObject({ Linked_Kind: "Open point", Linked_Key: "CIQ-2026-PkC4-C1-OPx1" });
    expect(row).not.toHaveProperty("Note_Dept");
  });
});

describe("edit by the author only (BR-064)", () => {
  const note = (author: unknown) => toNoteVM({ _id: "FmN1", Note_Key: "NOTE-1", Case_Item_Id: "PkC4", Note_Text: "Draft text", Note_Author: author } as RawItem);
  it("the author may edit; anyone else may not; an unreadable author means nobody", () => {
    expect(canEditNote(note({ _id: "UsJo", Name: "Jo Weber" }), { _id: "UsJo" })).toBe(true);
    expect(canEditNote(note("UsJo"), { _id: "UsJo" })).toBe(true);
    expect(canEditNote(note({ _id: "UsJo" }), { _id: "UsSam" })).toBe(false);
    expect(canEditNote(note(null), { _id: "UsJo" })).toBe(false);
  });
  it("the edit patch holds the text only", () => {
    expect(noteEditPatch("  New text ")).toEqual({ fields: { Note_Text: "New text" } });
  });
});

describe("notesFor", () => {
  const rows = [
    toNoteVM({ _id: "a", Case_Item_Id: "PkC4", Note_Text: "old", Note_At: "2026-10-01T08:00:00Z" } as RawItem),
    toNoteVM({ _id: "b", Case_Item_Id: "PkC4", Note_Text: "linked", Note_At: "2026-10-03T08:00:00Z", Linked_Kind: "Section", Linked_Key: "K2.1" } as RawItem),
    toNoteVM({ _id: "c", Case_Item_Id: "PkC4", Note_Text: "new", Note_At: "2026-10-05T08:00:00Z" } as RawItem),
  ];
  it("newest first; with a link, only the linked notes", () => {
    expect(notesFor(rows).map((n) => n._id)).toEqual(["c", "b", "a"]);
    expect(notesFor(rows, { kind: "Section", key: "K2.1" }).map((n) => n._id)).toEqual(["b"]);
  });
});

describe("writes on the fake host", () => {
  it("add: discard the open F7 draft first, create, submit, verify; edit: one update of Note_Text; no delete", async () => {
    const host = fakeClient();
    const a = createActions(fakeRuntime(host));
    const row = buildNoteRow({ c, me: ME, dept: "RMM", text: "First note", now });
    const r = await a.createFormRow(NOTE_FLOW, row, "Note_Key");
    expect(host.calls.map((x) => x.op)).toEqual(["formDiscard", "formCreate", "formSubmit", "formGet"]);
    const stored = toNoteVM(host.forms.get(NOTE_FLOW)![0]);
    expect(canEditNote(stored, ME)).toBe(true);
    const e = await a.updateFormRow(NOTE_FLOW, r.itemId, noteEditPatch("First note, corrected"));
    expect(e.ok).toBe(true);
    expect(host.ops("formUpdate").map((x) => x.data)).toEqual([{ Note_Text: "First note, corrected" }]);
    expect(host.ops().some((x) => /delete/i.test(x.op))).toBe(false);
  });
  it("two notes are created one after the other (one create lane)", async () => {
    const host = fakeClient();
    const a = createActions(fakeRuntime(host));
    await Promise.all([a.createFormRow(NOTE_FLOW, buildNoteRow({ c, me: ME, dept: "RMM", text: "One", now, rnd: seq() }), "Note_Key"), a.createFormRow(NOTE_FLOW, buildNoteRow({ c, me: ME, dept: "RMM", text: "Two", now: new Date(now.getTime() + 1000), rnd: seq() }), "Note_Key")]);
    expect(host.calls.map((x) => x.op)).toEqual(["formDiscard", "formCreate", "formSubmit", "formGet", "formDiscard", "formCreate", "formSubmit", "formGet"]);
    expect(host.forms.get(NOTE_FLOW)).toHaveLength(2);
  });
});
