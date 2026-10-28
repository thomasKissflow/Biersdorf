// The data console's field rules (console/fields.ts): kinds, the patch an edit sends (only what changed, typed like
// the value it replaces, JSON checked, *_JSON texts as typed), child-table deltas in the app's "Table::<model>" shape,
// and the read-back check. Fictional values.
import { describe, expect, it } from "vitest";
import { editText, fieldPatch, jsonProblem, kindOf, readBackProblems, rowDrafts, showText, tableColumns, tableDelta, tableRows, tablesOf, valueText, type EditField } from "./fields";

describe("kinds and texts", () => {
  it("formula, child table, JSON text, JSON value, text", () => {
    expect(kindOf("Review_Gate", "OK", ["Review_Gate"], [])).toBe("formula");
    expect(kindOf("Table::Contacts", [], [], [])).toBe("table");
    expect(kindOf("Contacts", [], [], ["Contacts"])).toBe("table");
    expect(kindOf("Payload_JSON", '{"a":1}', [], [])).toBe("json-text");
    expect(kindOf("Owner_RMM", { _id: "UsA", Name: "A" }, [], [])).toBe("value");
    expect(kindOf("Cycle_No", 2, [], [])).toBe("text");
  });

  it("a view pretty-prints JSON; an editor starts from the text Kissflow holds", () => {
    expect(showText('{"a":1}')).toBe('{\n  "a": 1\n}');
    expect(showText("{not json")).toBe("{not json");
    expect(editText('{"a":1}', "json-text")).toBe('{"a":1}');
    expect(editText({ _id: "UsA" }, "value")).toBe('{\n  "_id": "UsA"\n}');
    expect(editText(undefined, "text")).toBe("");
    expect(jsonProblem("{", "json-text")).toMatch(/^Not valid JSON/);
    expect(jsonProblem("", "json-text")).toBeUndefined();
    expect(jsonProblem("{", "text")).toBeUndefined();
  });
});

describe("fieldPatch", () => {
  const fields: EditField[] = [
    { id: "Trade_Name", value: "Zentrol A", kind: "text" },
    { id: "Cycle_No", value: 1, kind: "text" },
    { id: "Payload_JSON", value: '{"a":1}', kind: "json-text" },
    { id: "Owner_RMM", value: { _id: "UsA", Name: "A" }, kind: "value" },
    { id: "Review_Gate", value: "", kind: "formula" },
    { id: "Change_Note", value: undefined, kind: "text" },
    { id: "Priority", value: "High", kind: "text" },
  ];
  const start = Object.fromEntries(fields.map((f) => [f.id, editText(f.value, f.kind)]));

  it("sends only what changed, typed like the value it replaces; a JSON text exactly as typed; a cleared field as null", () => {
    const { data, problems } = fieldPatch(fields, { ...start, Cycle_No: "2", Payload_JSON: '{ "a": 2 }', Owner_RMM: '{"_id":"UsB"}', Change_Note: "Fixed", Priority: "", Review_Gate: "OK" });
    expect(problems).toEqual({});
    expect(data).toEqual({ Cycle_No: 2, Payload_JSON: '{ "a": 2 }', Owner_RMM: { _id: "UsB" }, Change_Note: "Fixed", Priority: null });
  });

  it("nothing changed: nothing to send (a missing field left empty is unchanged)", () => {
    expect(fieldPatch(fields, start)).toEqual({ data: {}, problems: {} });
  });

  it("an invalid JSON text is not sent", () => {
    const { data, problems } = fieldPatch(fields, { ...start, Payload_JSON: '{"a":', Trade_Name: "Zentrol B" });
    expect(data).toEqual({ Trade_Name: "Zentrol B" });
    expect(Object.keys(problems)).toEqual(["Payload_JSON"]);
  });
});

describe("child tables", () => {
  const item = {
    _id: "PkSup1",
    "Table::Contacts": [
      { _id: "Contacts_1", Contacts_Key: "c-1", Contacts_Full_Name: "Mara Lind", Contacts_Order: 1 },
      { _id: "Contacts_2", Contacts_Key: "c-2", Contacts_Full_Name: "Ivo Sand" },
    ],
  };
  const rows = tableRows(item, "Contacts");
  const cols = tableColumns(rows);

  it("found under Table::<model> or the model; columns without system fields", () => {
    expect(tableRows({ _id: "x", Contacts: rows }, "Contacts")).toBe(rows);
    expect(tablesOf(item, ["Contacts"])).toEqual(["Contacts"]);
    expect(tablesOf({ _id: "x", "Table::Safety_Findings": [] }, ["Safety_Criteria"])).toEqual(["Safety_Criteria", "Safety_Findings"]);
    expect(cols).toEqual(["Contacts_Key", "Contacts_Full_Name", "Contacts_Order"]);
  });

  it("a changed row goes by its _id with its changed cells, a new row as _is_created with a fresh _id; unchanged: nothing", () => {
    const drafts = rowDrafts(rows, cols);
    expect(tableDelta("Contacts", rows, drafts, () => "Contacts_new")).toBeUndefined();
    drafts[0].cells.Contacts_Full_Name = "Mara Lind-Ek";
    drafts[0].cells.Contacts_Order = "2";
    drafts.push({ cells: { Contacts_Key: "c-3", Contacts_Full_Name: "Nell Aro", Contacts_Order: "" } });
    drafts.push({ cells: { Contacts_Key: "", Contacts_Full_Name: "", Contacts_Order: "" } });
    expect(tableDelta("Contacts", rows, drafts, (m) => `${m}_new`)).toEqual([
      { _id: "Contacts_1", Contacts_Full_Name: "Mara Lind-Ek", Contacts_Order: 2 },
      { _is_created: true, _id: "Contacts_new", Contacts_Key: "c-3", Contacts_Full_Name: "Nell Aro" },
    ]);
  });
});

describe("readBackProblems", () => {
  it("a user read back with its Name is the same; a new child row is found by its content, a changed one by its _id", () => {
    const sent = {
      Owner_RMM: { _id: "UsA" },
      Cycle_No: 2,
      "Table::Contacts": [
        { _id: "Contacts_1", Contacts_Full_Name: "Mara Lind-Ek" },
        { _is_created: true, _id: "Contacts_tmp", Contacts_Key: "c-3" },
      ],
    };
    const back = { _id: "PkSup1", Owner_RMM: { _id: "UsA", Name: "A" }, Cycle_No: "2", "Table::Contacts": [{ _id: "Contacts_1", Contacts_Full_Name: "Mara Lind-Ek" }, { _id: "Contacts_9", Contacts_Key: "c-3" }] };
    expect(readBackProblems(sent, back)).toEqual([]);
    expect(readBackProblems(sent, { ...back, Cycle_No: 1, "Table::Contacts": [{ _id: "Contacts_1", Contacts_Full_Name: "Mara Lind" }] })).toEqual(["Cycle_No", "Contacts row Contacts_1: Contacts_Full_Name", "Contacts new row"]);
    expect(readBackProblems({ Priority: null }, { _id: "x" })).toEqual([]);
  });

  it("valueText: empty, scalars, users, other JSON", () => {
    expect([valueText(undefined), valueText(""), valueText([]), valueText(3), valueText(false), valueText([{ _id: "A" }, { _id: "B", Name: "b" }]), valueText({ k: 1 })]).toEqual(["", "", "", "3", "false", "A,B", '{"k":1}']);
  });
});
