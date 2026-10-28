// T3 Business Admin (§8.13): copy-on-write versioning, the state-only Retire patch (WB-D6), publish (state then F8),
// the release manifest and hash builder, and the release sequence on the fake host. No delete anywhere.
import { describe, expect, it } from "vitest";
import { fakeClient, fakeRuntime } from "../../testkit/fakeClient";
import { createActions } from "../../data/actions";
import { toConfigVM } from "../../data/map";
import type { ConfigVM, RawItem } from "../../data/viewModels";
import { parseManifest, sha256Hex } from "../../domain/config";
import {
  CONFIG_FLOW,
  buildBundle,
  buildManifest,
  buildRelease,
  createRelease,
  draftEditPatch,
  hashSelection,
  newConfigData,
  newVersionData,
  nextReleaseKey,
  nextVersionNo,
  payloadSkeleton,
  publishConfig,
  retireConfig,
  retirePatch,
  splitVersion,
  templatePreview,
  validatePayload,
  validateSelection,
} from "./config";

const TEMPLATE = JSON.stringify({ sections: [{ sectionKey: "BASIC", default: "Mandatory" }, { sectionKey: "GEN", default: "Optional" }] });
const DEF_BASIC = JSON.stringify({ sectionKey: "BASIC", code: "1", title: "Basic data", sort: 1, fields: [{ key: "trade_name", label: "Trade name", type: "Text", required: true }] });
const DEF_GEN = JSON.stringify({ sectionKey: "GEN", code: "2", title: "General", sort: 2, fields: [] });
const SETTINGS = JSON.stringify({ deptReviewMode: false, overallApprovalRequired: true, defaultSupplierDueDays: 14, reactivationDays: 365 });

const cfg = (id: string, o: Record<string, unknown>): ConfigVM => toConfigVM({ _id: id, ...o } as RawItem);
const pub = (id: string, key: string, kind: string, payload: string, o: Record<string, unknown> = {}) =>
  cfg(id, { Config_Key: key, Config_Kind: kind, Config_State: "Published", Payload_JSON: payload, Published_At: "2026-10-01T08:00:00Z", Version_Label: "v1", ...o });

describe("keys and copy-on-write versions", () => {
  it("splitVersion / nextVersionNo", () => {
    expect(splitVersion("template-main-v3")).toEqual({ base: "template-main", n: 3 });
    expect(splitVersion("legacy-key")).toEqual({ base: "legacy-key", n: 1 });
    expect(nextVersionNo([{ configKey: "template-main-v1" }, { configKey: "template-main-v4" }, { configKey: "settings-main-v9" }], "template-main")).toBe(5);
  });
  it("New version copies a Published row into a NEW Draft: next key, no publish fields; Section_Rev + 1", () => {
    const src = pub("Fm1", "section-definition-BASIC-v2", "Section definition", DEF_BASIC, { Section_Key: "BASIC", Section_Rev: 2, Content_Hash: "abc", Published_By: { _id: "UsRobin" }, Internal_Annotations_JSON: '{"note":"x"}' });
    const rows = [src, pub("Fm0", "section-definition-BASIC-v1", "Section definition", DEF_BASIC, { Section_Key: "BASIC", Section_Rev: 1 })];
    const d = newVersionData(src, rows);
    expect(d).toEqual({
      Config_Key: "section-definition-BASIC-v3",
      Config_Kind: "Section definition",
      Config_State: "Draft",
      Version_Label: "v3",
      Section_Key: "BASIC",
      Section_Rev: 3,
      Payload_JSON: DEF_BASIC,
      Internal_Annotations_JSON: '{"note":"x"}',
      Change_Note: "Copied from section-definition-BASIC-v2",
    });
    for (const k of ["Published_By", "Published_At", "Content_Hash"]) expect(d).not.toHaveProperty(k);
    expect(() => newVersionData(cfg("FmR", { Config_Kind: "Release", Config_Key: "release-REL-1-v1" }), [])).toThrow(/not versioned/);
  });
  it("a brand-new draft: Section definitions take the key and rev from the payload; a Release is refused", () => {
    const rows = [pub("Fm0", "section-definition-BASIC-v1", "Section definition", DEF_BASIC, { Section_Key: "BASIC", Section_Rev: 1 })];
    expect(newConfigData({ kind: "Section definition", payloadJson: DEF_BASIC }, rows)).toMatchObject({ Config_Key: "section-definition-BASIC-v2", Section_Key: "BASIC", Section_Rev: 2, Config_State: "Draft" });
    expect(newConfigData({ kind: "Settings", name: "main", payloadJson: SETTINGS }, [])).toEqual({ Config_Key: "settings-main-v1", Config_Kind: "Settings", Config_State: "Draft", Version_Label: "v1", Payload_JSON: SETTINGS });
    expect(() => newConfigData({ kind: "Release", payloadJson: "[]" }, [])).toThrow(/release builder/);
  });
  it("every skeleton payload validates for its kind", () => {
    for (const k of ["Template", "Section definition", "Section ownership", "RMES criteria", "Text bundle", "Settings", "Rule set"]) expect(validatePayload(k, payloadSkeleton(k)).ok).toBe(true);
    expect(validatePayload("Template", "{").ok).toBe(false);
    expect(validatePayload("Section definition", JSON.stringify({ sectionKey: " ", code: "1", title: "t", sort: 1, fields: [] })).ok).toBe(false);
  });
  it("draft edits patch only the changed editable fields; a Published row is never edited", () => {
    const d = cfg("Fm1", { Config_Key: "settings-main-v1", Config_Kind: "Settings", Config_State: "Draft", Payload_JSON: SETTINGS, Version_Label: "v1", Change_Note: "first" });
    expect(draftEditPatch(d, { payloadJson: SETTINGS, changeNote: "second", versionLabel: "v1", annotationsJson: "" }).fields).toEqual({ Change_Note: "second" });
    expect(() => draftEditPatch({ ...d, state: "Published" }, { payloadJson: "{}", changeNote: "", versionLabel: "", annotationsJson: "" })).toThrow(/Only a Draft/);
  });
});

describe("publish and the state-only Retire (WB-D6) on the fake host", () => {
  const host = (rows: Record<string, unknown>[], script = {}) => {
    const c = fakeClient({ script });
    c.forms.set(CONFIG_FLOW, rows.map((r) => ({ ...r }) as RawItem));
    return { c, a: createActions(fakeRuntime(c)) };
  };
  const draft = { _id: "FmD", Config_Key: "settings-main-v2", Config_Kind: "Settings", Config_State: "Draft", Payload_JSON: SETTINGS };
  const published = { _id: "FmP", Config_Key: "settings-main-v1", Config_Kind: "Settings", Config_State: "Published", Payload_JSON: SETTINGS, Content_Hash: "h", Published_At: "2026-10-01T08:00:00Z" };

  it("publish: ONE state patch (Published, by, at without ms, Content_Hash = sha256 of the stored payload), THEN the F8 row", async () => {
    const { c, a } = host([draft]);
    const o = await publishConfig(a, toConfigVM(draft as RawItem), { me: { _id: "UsRobin" }, now: new Date("2026-10-08T10:00:00.789Z") });
    expect(o.save?.ok).toBe(true);
    expect(o.audit).toMatchObject({ ok: true });
    const upd = c.ops("formUpdate").filter((x) => x.flow === CONFIG_FLOW);
    expect(upd).toHaveLength(1);
    expect(upd[0].data).toEqual({ Config_State: "Published", Published_By: { _id: "UsRobin" }, Published_At: "2026-10-08T10:00:00Z", Content_Hash: await sha256Hex(SETTINGS) });
    const ops = c.calls.map((x) => `${x.op}:${x.flow}`);
    expect(ops.indexOf(`formUpdate:${CONFIG_FLOW}`)).toBeLessThan(ops.indexOf("formCreate:CIQ_Audit_Event_A00"));
    expect(c.forms.get("CIQ_Audit_Event_A00")![0]).toMatchObject({ Event_Category: "Configuration", Action_Code: "config.publish", Object_Key: "settings-main-v2", Old_Value_Text: "Draft", New_Value_Text: "Published" });
  });
  it("publish refuses a Published row and an invalid payload, writing nothing", async () => {
    const { c, a } = host([published]);
    expect((await publishConfig(a, toConfigVM(published as RawItem), { me: { _id: "UsRobin" }, now: new Date() })).refused).toMatch(/Only a Draft/);
    const bad = { ...draft, Payload_JSON: "{" };
    expect((await publishConfig(a, toConfigVM(bad as RawItem), { me: { _id: "UsRobin" }, now: new Date() })).refused).toMatch(/Not published/);
    expect(c.ops("formUpdate")).toHaveLength(0);
    expect(c.ops("formCreate")).toHaveLength(0);
  });
  it("retire: the verified F8 config.retire row FIRST, then exactly one update { Config_State: 'Retired' }", async () => {
    expect(retirePatch()).toEqual({ fields: { Config_State: "Retired" } });
    const { c, a } = host([published]);
    const o = await retireConfig(a, toConfigVM(published as RawItem), "Superseded by v2");
    expect(o.save?.ok).toBe(true);
    const ops = c.calls.map((x) => `${x.op}:${x.flow}`);
    expect(ops.indexOf("formSubmit:CIQ_Audit_Event_A00")).toBeLessThan(ops.indexOf(`formUpdate:${CONFIG_FLOW}`));
    const upd = c.ops("formUpdate").filter((x) => x.flow === CONFIG_FLOW);
    expect(upd.map((u) => u.data)).toEqual([{ Config_State: "Retired" }]);
    expect(c.forms.get(CONFIG_FLOW)![0]).toMatchObject({ Config_State: "Retired", Payload_JSON: SETTINGS, Content_Hash: "h", Published_At: "2026-10-01T08:00:00Z" });
    expect(c.forms.get("CIQ_Audit_Event_A00")![0]).toMatchObject({ Action_Code: "config.retire", Object_Key: "settings-main-v1", Old_Value_Text: "Published", New_Value_Text: "Retired", Event_Reason: "Superseded by v2" });
  });
  it("retire: when the F8 row fails, nothing is updated; a Draft or a blank reason is refused", async () => {
    const { c, a } = host([published], { formSubmit: () => ({ error: "boom" }) });
    const o = await retireConfig(a, toConfigVM(published as RawItem), "Superseded");
    expect(o.refused).toMatch(/could not be recorded/);
    expect(c.ops("formUpdate")).toHaveLength(0);
    expect((await retireConfig(a, toConfigVM(draft as RawItem), "x")).refused).toMatch(/Only a Published/);
    expect((await retireConfig(a, toConfigVM(published as RawItem), " ")).refused).toMatch(/reason is required/);
  });
});

describe("release manifest and hash builder", () => {
  const rows = [
    pub("FmS", "settings-main-v1", "Settings", SETTINGS),
    pub("FmG", "section-definition-GEN-v1", "Section definition", DEF_GEN, { Section_Key: "GEN", Section_Rev: 1 }),
    pub("FmT", "template-main-v1", "Template", TEMPLATE),
    pub("FmB", "section-definition-BASIC-v2", "Section definition", DEF_BASIC, { Section_Key: "BASIC", Section_Rev: 2 }),
  ];
  it("validateSelection: one row per kind (per section key for definitions), exactly one Template, Published only", () => {
    expect(validateSelection(rows).errors).toEqual([]);
    expect(validateSelection([...rows, pub("FmT2", "template-main-v2", "Template", TEMPLATE)]).errors.join(" ")).toMatch(/Only one row per Template/);
    expect(validateSelection([...rows, pub("FmB1", "section-definition-BASIC-v1", "Section definition", DEF_BASIC, { Section_Key: "BASIC" })]).errors.join(" ")).toMatch(/Section definition BASIC/);
    expect(validateSelection(rows.filter((r) => r.kind !== "Template")).errors.join(" ")).toMatch(/needs one Template/);
    expect(validateSelection([{ ...rows[0], state: "Draft" }, rows[2]]).errors.join(" ")).toMatch(/not Published/);
    expect(validateSelection(rows.filter((r) => r._id !== "FmG")).warnings.join(" ")).toMatch(/No Section definition selected for: GEN/);
    expect(validateSelection([]).errors[0]).toMatch(/at least one/);
  });
  it("manifest: ordered by kind, content hashes recomputed from the stored payloads; bundle carries the payloads", async () => {
    const { hashes, mismatches } = await hashSelection(rows);
    expect(mismatches).toEqual([]);
    const m = buildManifest(rows, hashes);
    expect(m.map((e) => e.configKey)).toEqual(["template-main-v1", "section-definition-BASIC-v2", "section-definition-GEN-v1", "settings-main-v1"]);
    expect(m[1]).toEqual({ configKey: "section-definition-BASIC-v2", kind: "Section definition", itemId: "FmB", contentHash: await sha256Hex(DEF_BASIC), sectionKey: "BASIC", sectionRev: 2 });
    expect(parseManifest(JSON.stringify(m)).ok).toBe(true);
    const b = buildBundle(rows, m);
    expect(b[0]).toMatchObject({ configKey: "template-main-v1", payloadJson: TEMPLATE, versionLabel: "v1" });
  });
  it("buildRelease: Manifest_Hash = sha256 of the stored manifest string; key REL-<yyyymmdd>-<n>; a hash mismatch blocks", async () => {
    const now = new Date("2026-10-08T10:00:00Z");
    const existing = [cfg("FmR1", { Config_Kind: "Release", Release_Key: "REL-20261008-1", Config_Key: "release-REL-20261008-1-v1" })];
    expect(nextReleaseKey(existing, now)).toBe("REL-20261008-2");
    const r = await buildRelease(rows, { label: "October baseline", stage: "Live", changeNote: "" }, [...rows, ...existing], now);
    expect(r.manifestHash).toBe(await sha256Hex(r.manifestJson));
    expect(r.data).toMatchObject({ Config_Kind: "Release", Config_State: "Draft", Release_Key: "REL-20261008-2", Release_Stage: "Live", Release_Label: "October baseline", Manifest_Hash: r.manifestHash, Release_Manifest_JSON: r.manifestJson });
    expect(JSON.parse(String(r.data.Release_Bundle_JSON))).toHaveLength(4);
    await expect(buildRelease([{ ...rows[0], contentHash: "deadbeef" }, rows[2]], { label: "x", stage: "Test", changeNote: "" }, rows, now)).rejects.toThrow(/hash mismatch/);
    await expect(buildRelease(rows, { label: "x", stage: "", changeNote: "" }, rows, now)).rejects.toThrow(/stage/);
  });
  it("createRelease on the fake host: create the Release draft, publish it (Content_Hash = Manifest_Hash), then F8 release.publish; no other F2 row is updated", async () => {
    const c = fakeClient();
    c.forms.set(CONFIG_FLOW, rows.map((r) => ({ ...r.raw }) as RawItem));
    const a = createActions(fakeRuntime(c));
    const res = await createRelease(a, rows, { label: "October baseline", stage: "Test", changeNote: "First" }, rows, { me: { _id: "UsRobin" }, now: new Date("2026-10-08T10:00:00Z") });
    expect(res.error).toBeUndefined();
    expect(res.publish?.save?.ok).toBe(true);
    expect(res.publish?.audit).toMatchObject({ ok: true });
    const upd = c.ops("formUpdate").filter((x) => x.flow === CONFIG_FLOW);
    expect(upd).toHaveLength(1);
    expect(upd[0].id).toBe(res.itemId);
    expect(upd[0].data).toMatchObject({ Config_State: "Published", Content_Hash: res.built!.manifestHash });
    const ev = c.forms.get("CIQ_Audit_Event_A00")![0];
    expect(ev).toMatchObject({ Event_Category: "Configuration", Action_Code: "release.publish", Object_Key: "REL-20261008-1" });
    expect(String(ev.Config_Keys).split(",")).toHaveLength(4);
    expect(c.ops().some((x) => /delete/i.test(x.op))).toBe(false);
  });
});

describe("template preview", () => {
  it("the newest Published Template's order and defaults, joined with the newest Published definitions", () => {
    const rows = [
      pub("FmT", "template-main-v1", "Template", TEMPLATE),
      pub("FmB1", "section-definition-BASIC-v1", "Section definition", JSON.stringify({ ...JSON.parse(DEF_BASIC), title: "Old title" }), { Section_Key: "BASIC", Section_Rev: 1, Published_At: "2026-09-01T00:00:00Z" }),
      pub("FmB2", "section-definition-BASIC-v2", "Section definition", DEF_BASIC, { Section_Key: "BASIC", Section_Rev: 2, Published_At: "2026-10-01T00:00:00Z" }),
      cfg("FmGd", { Config_Key: "section-definition-GEN-v1", Config_Kind: "Section definition", Config_State: "Draft", Section_Key: "GEN", Payload_JSON: DEF_GEN }),
    ];
    const p = templatePreview(rows)!;
    expect(p.sections.map((s) => [s.sectionKey, s.default, s.title, s.defined])).toEqual([
      ["BASIC", "Mandatory", "Basic data", true],
      ["GEN", "Optional", "", false],
    ]);
    expect(templatePreview([])).toBeNull();
  });
});
