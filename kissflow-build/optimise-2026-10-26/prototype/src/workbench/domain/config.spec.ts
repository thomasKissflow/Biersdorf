import { describe, expect, it } from "vitest";
import { checkContentHash, loadPinnedConfig, parseManifest, parsePayload, parseSettings, pickPinnedRelease, ruleSetVersion, sha256Hex } from "./config";
import { toConfigVM } from "../data/map";
import type { RawItem } from "../data/viewModels";

const row = (f: Record<string, unknown>) => toConfigVM({ _id: String(f._id), ...f } as RawItem);

describe("config payloads and the content hash", () => {
  it("sha256 hex of the stored Payload_JSON (Web Crypto)", async () => {
    expect(await sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
  it("checkContentHash: equal → ok; changed payload → mismatch", async () => {
    const h = await sha256Hex('{"texts":{"a":"b"}}');
    expect((await checkContentHash({ payloadJson: '{"texts":{"a":"b"}}', configKey: "t" }, { contentHash: h, configKey: "t" })).ok).toBe(true);
    expect((await checkContentHash({ payloadJson: '{"texts":{"a":"c"}}', configKey: "t" }, { contentHash: h, configKey: "t" })).ok).toBe(false);
  });
  it("parsers per kind; Settings defaults; countsPolicy only when given", () => {
    expect(parsePayload("Template", '{"sections":[{"sectionKey":"BASIC","default":"Mandatory"}]}').ok).toBe(true);
    expect(parsePayload("Template", '{"sections":[{"sectionKey":"BASIC","default":"Maybe"}]}').ok).toBe(false);
    expect(parsePayload("RMES criteria", '{"criteria":[{"code":"A1","part":"A","title":"Identity","dept":"SAF"}]}').ok).toBe(true);
    expect(parsePayload("Section ownership", '{"owners":{"GEN":{"lead":"REG","co":[],"queryOwner":"REG"}}}').ok).toBe(true);
    expect(parsePayload("Text bundle", "not json").ok).toBe(false);
    const s = parseSettings("{}");
    expect(s.ok && s.value).toEqual({ deptReviewMode: false, overallApprovalRequired: false, defaultSupplierDueDays: 14, reactivationDays: 365 });
    const a = parseSettings('{"countsPolicy":"attest","defaultSupplierDueDays":21}');
    expect(a.ok && a.value).toMatchObject({ countsPolicy: "attest", defaultSupplierDueDays: 21 });
    expect(parseManifest('[{"configKey":"x"}]').ok).toBe(false);
  });
  it("F7: list values are checked before publishing (Lead_Dept, Query_Owner_Dept, co-reviewers, Criteria_Part)", () => {
    expect(parsePayload("Section ownership", '{"owners":{"BASIC":{"lead":"RMM","co":[],"queryOwner":"CUS"}}}')).toMatchObject({ ok: false, error: expect.stringMatching(/queryOwner "CUS"/) });
    expect(parsePayload("Section ownership", '{"owners":{"GEN":{"lead":"XYZ","co":[],"queryOwner":"REG"}}}')).toMatchObject({ ok: false, error: expect.stringMatching(/lead "XYZ"/) });
    expect(parsePayload("Section ownership", '{"owners":{"GEN":{"lead":"CUS","co":["SAF","LEG"],"queryOwner":"REG"}}}')).toMatchObject({ ok: false, error: expect.stringMatching(/co-reviewer LEG/) });
    expect(parsePayload("Section ownership", '{"owners":{"GEN":{"lead":"CUS","co":["SAF"],"queryOwner":""}}}').ok).toBe(true);
    expect(parsePayload("RMES criteria", '{"criteria":[{"code":"A1","part":"E","title":"Identity","dept":"SAF"}]}')).toMatchObject({ ok: false, error: expect.stringMatching(/part "E"/) });
  });
  it("pinned release: Published, Live (Test for test cases), newest Published_At", () => {
    const rows = [
      row({ _id: "r1", Config_Kind: "Release", Config_State: "Published", Release_Stage: "Live", Published_At: "2026-10-01T00:00:00Z" }),
      row({ _id: "r2", Config_Kind: "Release", Config_State: "Published", Release_Stage: "Live", Published_At: "2026-10-05T00:00:00Z" }),
      row({ _id: "r3", Config_Kind: "Release", Config_State: "Draft", Release_Stage: "Live", Published_At: "2026-10-09T00:00:00Z" }),
      row({ _id: "r4", Config_Kind: "Release", Config_State: "Published", Release_Stage: "Test", Published_At: "2026-10-07T00:00:00Z" }),
    ];
    expect(pickPinnedRelease(rows)?._id).toBe("r2");
    expect(pickPinnedRelease(rows, { test: true })?._id).toBe("r4");
  });
  it("loadPinnedConfig: Settings → countsPolicy; hash mismatch reported; Rule_Set_Version falls back to none (manual-wb-1)", async () => {
    const settings = '{"countsPolicy":"attest"}';
    const rows = [
      row({ _id: "s1", Config_Key: "settings-x-v1", Config_Kind: "Settings", Payload_JSON: settings }),
      row({ _id: "rs", Config_Key: "rule-set-x-v2", Config_Kind: "Rule set", Version_Label: "2.0", Payload_JSON: "{}" }),
      row({
        _id: "rel",
        Config_Kind: "Release",
        Config_State: "Published",
        Release_Stage: "Live",
        Release_Manifest_JSON: JSON.stringify([{ configKey: "settings-x-v1", kind: "Settings", itemId: "s1", contentHash: await sha256Hex(settings) }]),
      }),
    ];
    const p = await loadPinnedConfig(rows, "rel", { checkHashes: true });
    expect(p).toMatchObject({ countsPolicy: "attest", countsPolicySource: "settings", hashMismatches: [] });
    expect(ruleSetVersion(p)).toBe("none (manual-wb-1)");
    const withRule = { manifest: [...p!.manifest, { configKey: "rule-set-x-v2", kind: "Rule set", itemId: "rs", contentHash: "z" }], rows: new Map([...p!.rows, ["rule-set-x-v2", rows[1]]]) };
    expect(ruleSetVersion(withRule)).toBe("rule-set-x-v2@2.0");
    const bad = await loadPinnedConfig([{ ...rows[0], payloadJson: '{"countsPolicy":"fail-closed"}' }, rows[2]], "rel", { checkHashes: true });
    expect(bad?.hashMismatches.map((m) => m.configKey)).toEqual(["settings-x-v1"]);
    expect(await loadPinnedConfig(rows, "missing")).toBeNull();
  });
});
