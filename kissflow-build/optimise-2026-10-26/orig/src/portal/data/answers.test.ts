import { describe, expect, it } from "vitest";
import type { KfData } from "../kf/sdk";
import { COMPONENTS_KEY, LockedError, RELEASE_LOCKED_SAVE_TEXT, applyPatch, docFields, isClosedRequest, missingKeys, readDoc, saveRequest, type RequestIO } from "./answers";
import type { RawItem } from "./raw";

const elena = { id: "UsElena", name: "Elena Márquez", email: "elena.marquez@solvaro.example" };
const ravi = { id: "UsRavi", name: "Ravi Menon", email: "ravi.menon@solvaro.example" };
let clock = 0;
const now = () => `2026-10-15T09:00:${String(clock++ % 60).padStart(2, "0")}Z`;

/** One request item in memory; `onWrite` lets a test play a colleague who writes at the same moment. */
function memoryIO(item: RawItem, onWrite?: (n: number, item: RawItem) => void): RequestIO & { writes: KfData[]; item: RawItem } {
  const io = {
    item,
    writes: [] as KfData[],
    async read() {
      return structuredClone(io.item);
    },
    async write(d: KfData) {
      io.writes.push(d);
      io.item = { ...io.item, ...d };
      onWrite?.(io.writes.length, io.item);
    },
  };
  return io;
}

describe("the request's JSON documents (plan v5 §3.1)", () => {
  it("merges per key and stamps every key with name, e-mail, time and user id", () => {
    const doc = readDoc({ _id: "x", Answers_JSON: '{"FLD-1":"a","FLD-2":"b"}', Config_Answers_JSON: '{"SF01":["animal"],"SF11":["EU"]}' });
    expect(doc.config).toEqual({ SF01: ["animal"] }); // SF11 is Beiersdorf's, never read as the supplier's
    const next = applyPatch(doc, { set: { "FLD-1": "z" }, config: { SF03: true, SF11: ["CN"] }, just: { "FLD-3": "n/a" }, components: [] }, elena, "2026-10-15T09:00:00Z");
    expect(next.answers).toEqual({ "FLD-1": "z", "FLD-2": "b" });
    expect(next.config).toEqual({ SF01: ["animal"], SF03: true });
    expect(next.answeredBy["FLD-1"]).toEqual({ name: "Elena Márquez", email: "elena.marquez@solvaro.example", at: "2026-10-15T09:00:00Z", by: "UsElena" });
    expect(Object.keys(next.answeredBy).sort()).toEqual(["FLD-1", "FLD-3", COMPONENTS_KEY, "SF03"].sort());
  });

  it("removes a justification that was emptied, and writes only the JSON fields the patch touches", () => {
    const doc = readDoc({ _id: "x", Justifications_JSON: '{"FLD-1":"old"}' });
    const next = applyPatch(doc, { just: { "FLD-1": " " } }, elena, "t");
    expect(next.justifications).toEqual({});
    expect(Object.keys(docFields(next, { just: { "FLD-1": "" } })).sort()).toEqual(["Answered_By_JSON", "Justifications_JSON"]);
    expect(missingKeys(next, { just: { "FLD-1": "" } })).toEqual([]);
  });

  it("reads unreadable JSON as empty instead of failing", () => {
    expect(readDoc({ _id: "x", Answers_JSON: "{oops", Components_JSON: '"not rows"' })).toMatchObject({ answers: {}, components: undefined });
  });
});

describe("saveRequest: write, read back, re-apply (P3)", () => {
  it("writes the merged keys, Answers_Rev + 1 and the change stamps without milliseconds", async () => {
    const io = memoryIO({ _id: "PkReq", Answers_JSON: '{"FLD-2":"b"}', Answers_Rev: 4 });
    const r = await saveRequest(io, { set: { "FLD-1": "a" } }, elena, now, () => ({ Scope_JSON: "[]" }));
    expect(r).toMatchObject({ rev: 5, tries: 1 });
    const w = io.writes[0];
    expect(JSON.parse(String(w.Answers_JSON))).toEqual({ "FLD-1": "a", "FLD-2": "b" });
    expect(w).toMatchObject({ Answers_Rev: 5, Answers_Changed_By_Email: elena.email, Editing_By: elena.email, Scope_JSON: "[]" });
    expect(String(w.Answers_Changed_At)).toMatch(/:\d\dZ$/);
    expect(w).not.toHaveProperty("Config_Answers_JSON"); // untouched documents are never rewritten
  });

  it("two contacts within ~0.1 s: the lost save is noticed on read-back and re-applied, keeping both answers", async () => {
    const io = memoryIO({ _id: "PkReq", Answers_JSON: "{}", Answers_Rev: 1 }, (n, item) => {
      // Ravi saved from the same old state right after Elena's first write: his write replaces hers
      if (n === 1) io.item = { ...item, Answers_JSON: '{"FLD-RAVI":"r"}', Answered_By_JSON: JSON.stringify({ "FLD-RAVI": { name: ravi.name, email: ravi.email, at: "t" } }), Answers_Rev: 2 };
    });
    const r = await saveRequest(io, { set: { "FLD-ELENA": "e" } }, elena, now);
    expect(r.tries).toBe(2);
    expect(JSON.parse(String(io.item.Answers_JSON))).toEqual({ "FLD-RAVI": "r", "FLD-ELENA": "e" });
    expect(Object.keys(JSON.parse(String(io.item.Answered_By_JSON))).sort()).toEqual(["FLD-ELENA", "FLD-RAVI"]);
    expect(io.item.Answers_Rev).toBe(3);
  });

  it("gives up after 3 lost saves with a plain message (no field ids)", async () => {
    const io = memoryIO({ _id: "PkReq", Answers_JSON: "{}" }, () => {
      io.item = { ...io.item, Answers_JSON: "{}" };
    });
    await expect(saveRequest(io, { set: { "FLD-1": "a" } }, elena, now)).rejects.toThrow(/colleague saved this questionnaire at the same moment/);
    expect(io.writes).toHaveLength(3);
  });

  it("refuses without writing on a locked request (completed or cancelled)", async () => {
    const io = memoryIO({ _id: "PkReq", Request_Locked: "Yes" });
    await expect(saveRequest(io, { set: { "FLD-1": "a" } }, elena, now)).rejects.toBeInstanceOf(LockedError);
    await expect(saveRequest(io, { set: { "FLD-1": "a" } }, elena, now)).rejects.toThrow(/This request is closed/);
    expect(io.writes).toHaveLength(0);
  });

  it("refuses without writing while the final release is requested (Thomas, 15 Oct), locked or only labelled so", async () => {
    for (const item of [{ _id: "PkReq", Request_Locked: "Yes", Case_Phase_Label: "Awaiting your final release" }, { _id: "PkReq", Request_Locked: "No", Case_Phase_Label: "Awaiting your final release" }]) {
      const io = memoryIO(item);
      await expect(saveRequest(io, { set: { "FLD-1": "a" } }, elena, now)).rejects.toThrow(RELEASE_LOCKED_SAVE_TEXT);
      expect(io.writes).toHaveLength(0);
      expect(isClosedRequest(item)).toBe(false);
    }
    expect(RELEASE_LOCKED_SAVE_TEXT.startsWith("Your questionnaire is locked because Beiersdorf has requested your final release.")).toBe(true);
  });
});
