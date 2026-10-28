// The data console's import (console/importRows.ts) on the fake client: columns mapped from labels or ids (and what is
// left out), rows planned by the form's natural key, created strictly one at a time and each read back and compared by
// SHA-256, skipped when their key is held, "differs" when the read-back does not hold a field, and halted at the first
// failure. The real seed JSON (kissflow-build, Kissflow-internal: read in place) goes into an empty CIQ Config Version
// as 12 verified rows. Fictional rows otherwise.
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createFakeClient } from "../kf/fakeClient";
import type { AppClient } from "../types";
import { differingFields, fieldIdOf, importSummary, jsonRows, keyOf, planImport, readImportFile, rowsFingerprint, runImport, sha256Hex, sheetRows } from "./importRows";

const SEED_JSON = fileURLToPath(new URL("../../../../kissflow-build/night-2026-10-21/prod-seed/config-version.json", import.meta.url));
const me = { _id: "UsDevAdmin", Name: "Jonas Falk" };
const fake = () => createFakeClient({ items: {}, me });
const ROWS = [
  { Config_Key: "ZZT:one", Config_Kind: "Settings", Payload_JSON: '{"a":1}' },
  { Config_Key: "ZZT:two", Config_Kind: "Settings", Payload_JSON: '{"b":2}', Section_Rev: 3 },
  { Config_Key: "ZZT:three", Config_Kind: "Reminders" },
];

describe("columns and rows", () => {
  it("a label's id is the label with its spaces replaced by underscores; an id stays", () => {
    expect(["Config Key", " Release  Bundle JSON ", "Config_Key", "Change_Note"].map(fieldIdOf)).toEqual(["Config_Key", "Release_Bundle_JSON", "Config_Key", "Change_Note"]);
  });

  it("an xlsx sheet: the header row names the fields; system fields, child tables, empty and repeated headers are left out; empty cells too", () => {
    const { columns, rows } = sheetRows({
      name: "S",
      rows: [
        ["Config Key", "Payload JSON", "_id", "Table::Contacts", null, "Config_Key"],
        ["ZZT:a", '{"x":1}', "Pk1", "[]", "stray", "ZZT:other"],
        [null, null, null, null, null, null],
        ["ZZT:b", null, null, null, null, null],
      ],
    });
    expect(columns.map((c) => [c.header, c.field])).toEqual([["Config Key", "Config_Key"], ["Payload JSON", "Payload_JSON"], ["_id", null], ["Table::Contacts", null], ["", null], ["Config_Key", null]]);
    expect(columns[5].note).toMatch(/named twice/);
    expect(rows).toEqual([{ Config_Key: "ZZT:a", Payload_JSON: '{"x":1}' }, { Config_Key: "ZZT:b" }]);
  });

  it("a JSON file: an array of rows keyed by field id; nulls and empty texts left out; a JSON object in a *_JSON field sent as its text", () => {
    const r = jsonRows(JSON.stringify([{ Config_Key: "ZZT:a", Payload_JSON: { x: 1 }, Change_Note: null, _id: "Pk1", Name: "x", Version_Label: "" }, { Config_Key: "ZZT:b", Section_Rev: 2 }]));
    expect(r.rows).toEqual([{ Config_Key: "ZZT:a", Payload_JSON: '{"x":1}' }, { Config_Key: "ZZT:b", Section_Rev: 2 }]);
    expect(r.columns.filter((c) => !c.field).map((c) => c.header)).toEqual(["_id", "Name"]);
    expect(r.notes).toEqual(["Payload_JSON: a JSON value in the file is sent as its JSON text."]);
    expect(() => jsonRows("{")).toThrow(/not valid JSON/);
    expect(() => jsonRows('{"rows": []}')).toThrow(/a list of rows/);
    expect(() => jsonRows("[1, 2]")).toThrow(/a list of rows/);
  });

  it("readImportFile goes by the extension", async () => {
    const enc = new TextEncoder();
    expect((await readImportFile("seed.JSON", enc.encode(JSON.stringify(ROWS)))).rows).toEqual(ROWS);
    await expect(readImportFile("seed.csv", enc.encode("a;b"))).rejects.toThrow("Choose a .json or .xlsx file.");
  });
});

describe("plan", () => {
  it("new, already in the form, twice in the file, without a key", () => {
    const plans = planImport([...ROWS, { Config_Key: "ZZT:one" }, { Config_Kind: "x" }, { Config_Key: "  " }], "Config_Key", ["ZZT:two"]);
    expect(plans.map((p) => [p.n, p.key, p.status])).toEqual([
      [1, "ZZT:one", "new"],
      [2, "ZZT:two", "exists"],
      [3, "ZZT:three", "new"],
      [4, "ZZT:one", "duplicate"],
      [5, "", "no-key"],
      [6, "", "no-key"],
    ]);
  });

  it("keys and values compare as text (a number key, a user read back with its Name)", async () => {
    expect(keyOf({ Run_Key: 12 }, "Run_Key")).toBe("12");
    expect(await differingFields({ Section_Rev: 3, Owner_RMM: { _id: "UsA" } }, { _id: "x", Section_Rev: "3", Owner_RMM: { _id: "UsA", Name: "A" } })).toEqual([]);
    expect(await differingFields({ Change_Note: "abc" }, { _id: "x", Change_Note: "abcd" })).toEqual([{ field: "Change_Note", sent: 3, back: 4 }]);
    expect(await sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    // the fields' order does not count, their values do
    expect(await rowsFingerprint(ROWS)).toBe(await rowsFingerprint(ROWS.map((r) => Object.fromEntries(Object.entries(r).reverse()))));
    expect(await rowsFingerprint(ROWS)).not.toBe(await rowsFingerprint([{ ...ROWS[0], Config_Kind: "Other" }, ROWS[1], ROWS[2]]));
  });
});

describe("runImport on the fake client", () => {
  it("creates the new rows strictly one at a time (create + submit, then a full read), each verified; a second run skips them all", async () => {
    const c = fake();
    const seen: string[] = [];
    let inFlight = 0;
    let most = 0;
    const counted: AppClient = {
      ...c,
      formCreate: async (f, d) => {
        most = Math.max(most, ++inFlight);
        try {
          return await c.formCreate(f, d);
        } finally {
          inFlight--;
        }
      },
    };
    const results = await runImport(counted, "config", planImport(ROWS, "Config_Key", []), { onRow: (r) => seen.push(`${r.n}:${r.outcome}`) });
    expect(results.map((r) => r.outcome)).toEqual(["created", "created", "created"]);
    expect(seen).toEqual(["1:created", "2:created", "3:created"]);
    expect(most).toBe(1);
    expect(c.calls.map((x) => x.m)).toEqual(["formCreate", "formGet", "formCreate", "formGet", "formCreate", "formGet"]);
    expect(c.db.config.map((r) => r.Config_Key)).toEqual(["ZZT:one", "ZZT:two", "ZZT:three"]);
    expect(results.every((r) => r.id && c.db.config.some((x) => x._id === r.id))).toBe(true);
    expect(importSummary(results)).toBe("3 created, 0 differ, 0 skipped, 0 failed");

    const again = await runImport(c, "config", planImport(ROWS, "Config_Key", (await c.formList("config")).map((r) => keyOf(r, "Config_Key"))));
    expect(again.map((r) => r.outcome)).toEqual(["skipped", "skipped", "skipped"]);
    expect(c.db.config).toHaveLength(3);
  });

  it("a row Kissflow holds differently is reported with the fields that differ", async () => {
    const c = fake();
    const lossy: AppClient = { ...c, formGet: async (f, id) => ({ ...(await c.formGet(f, id)), Payload_JSON: '{"a":1,"cut":true}' }) };
    const [r] = await runImport(lossy, "config", planImport([ROWS[0]], "Config_Key", []));
    expect(r).toMatchObject({ outcome: "differs", diffs: [{ field: "Payload_JSON", sent: 7, back: 18 }] });
  });

  it("the first failure stops the import: the rows after it are not sent", async () => {
    let n = 0;
    const c = createFakeClient({ items: {}, me }, { refuse: { formCreate: () => (++n === 2 ? "KISSFLOW_ERROR_050302 You don't have permission." : undefined) } });
    const results = await runImport(c, "config", planImport(ROWS, "Config_Key", []));
    expect(results.map((r) => r.outcome)).toEqual(["created", "failed", "not-run"]);
    expect(results[1].reason).toContain("050302");
    expect(results[2].reason).toMatch(/stopped at the failure/);
    expect(c.db.config).toHaveLength(1);
  });

  it("stop() before a row leaves it and the rest unsent", async () => {
    const c = fake();
    let asked = 0;
    const results = await runImport(c, "config", planImport(ROWS, "Config_Key", []), { stop: () => ++asked > 1 });
    expect(results.map((r) => r.outcome)).toEqual(["created", "not-run", "not-run"]);
  });

  it.skipIf(!existsSync(SEED_JSON))("the configuration seed (12 rows, cells of ~25,000 characters) into an empty CIQ Config Version: 12 created and verified", async () => {
    const c = fake();
    const source = await readImportFile("config-version.json", new Uint8Array(readFileSync(SEED_JSON)));
    expect(source.columns.every((col) => col.field)).toBe(true);
    const results = await runImport(c, "config", planImport(source.rows, "Config_Key", []));
    expect(results.map((r) => r.outcome)).toEqual(Array(12).fill("created"));
    expect(c.db.config.map((r) => r.Config_Key)).toEqual(source.rows.map((r) => r.Config_Key));
    for (const row of source.rows) {
      const held = c.db.config.find((r) => r.Config_Key === row.Config_Key)!;
      for (const [k, v] of Object.entries(row)) expect(held[k]).toBe(v);
    }
  });
});
