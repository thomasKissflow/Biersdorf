// configFromRows on the 12 uploaded CIQ Config Version rows (kissflow-build/config-seed/rows): the same configuration
// the prototype's empty start has, with reader E's fixes (a)–(f), and the fingerprint checks.
import { describe, expect, it } from "vitest";
import { FIRST_PAIR, preparedDraft } from "@/domain/configActions";
import { buildSeed } from "@/domain/seed";
import { str, type RawItem } from "@/portal/data/raw";
import { STRAY_CONFIG_KEY, configRows } from "../testing/rawFixtures";
import { configFromRows, releaseForPair, settingsOf, verifyConfig } from "./config";

const seed = buildSeed();
const rowOf = (rows: RawItem[], key: string) => rows.find((r) => str(r, "Config_Key") === key)!;
const withRow = (rows: RawItem[], key: string, patch: Record<string, unknown>) => rows.map((r) => (str(r, "Config_Key") === key ? { ...r, ...patch } : r));

describe("configFromRows (the uploaded rows)", () => {
  const rows = configRows();
  const out = configFromRows(rows);

  it("gives the empty start's configuration: the prepared v2 pair as the only stored pair, a draft", () => {
    expect(out.cfg.pairs).toHaveLength(1);
    const [p] = out.cfg.pairs;
    expect(p!.status).toBe("draft");
    // fix (d): the seed's createdBy "seed" reads as "system" (the prototype's own draft says "u-admin")
    expect(p!.createdBy).toBe("system");
    expect({ ...p!, createdBy: "u-admin" }).toEqual(preparedDraft(seed.ownership));
  });

  it("ownership and reminders equal the empty start's", () => {
    expect(out.ownership).toEqual(seed.ownership);
    expect(out.reminders).toEqual(seed.reminders);
    expect(out.notes).toEqual([]);
  });

  it("settings come from SET:current; the stray ZZT Settings draft is ignored (fix c)", () => {
    expect(rows.some((r) => str(r, "Config_Key") === STRAY_CONFIG_KEY)).toBe(true);
    expect(out.settings.undefinedOrigins).toEqual(["waste", "ccu", "chemrec"]);
    expect(settingsOf(rows)).toBe(out.settings);
    expect(out.settings.webhooks).toBeUndefined(); // G-15: no webhooks key tonight
  });

  it("lists every Release row (the built-in first pair's too) and finds the published one of a pair", () => {
    expect(out.releases.map((r) => [r.key, r.state])).toEqual([
      ["RS-2026.1 + v1", "Published"],
      ["RS-2026.2 + v2", "Draft"],
    ]);
    const rel = releaseForPair(out.releases, FIRST_PAIR)!;
    expect(rel.itemId).toBe(rowOf(rows, "REL:RS-2026.1 + v1")._id);
    expect(rel.raw).toBe(rowOf(rows, "REL:RS-2026.1 + v1"));
    // a draft is never a pair new cases can pin
    expect(releaseForPair(out.releases, { ruleSetVersion: "RS-2026.2", templateVersion: "CIQ-2026 v2" })).toBeUndefined();
  });

  it("keeps the same objects for the same rows (fix f), new ones when a row changes", () => {
    expect(configFromRows(configRows()).cfg).toBe(out.cfg);
    const changed = configFromRows(withRow(rows, "REL:RS-2026.2 + v2", { _modified_at: "2026-10-21T08:00:00Z" }));
    expect(changed.cfg).not.toBe(out.cfg);
    expect(changed.cfg).toEqual(out.cfg);
  });
});

describe("configFromRows (reader E fixes)", () => {
  const rows = configRows();

  it("(a) a Retired row without Published_At is a discarded draft, not a published pair", () => {
    const discarded = configFromRows(withRow(rows, "REL:RS-2026.2 + v2", { Config_State: "Retired" }));
    expect(discarded.cfg.pairs).toEqual([]);
    // with Published_At it is a superseded published pair
    const superseded = configFromRows(withRow(rows, "REL:RS-2026.2 + v2", { Config_State: "Retired", Published_At: "2026-10-02T09:00:00Z" }));
    expect(superseded.cfg.pairs.map((p) => [p.ruleSet.version, p.status, p.publishedAt])).toEqual([["RS-2026.2", "published", "2026-10-02T09:00:00Z"]]);
  });

  it("(b) a Release_Key twice: the newest row is used, with a note (dev only: FE-CLEANUP B4)", () => {
    const v2 = rowOf(rows, "REL:RS-2026.2 + v2");
    const older = { ...v2, _id: "PkCfgOlderDup", _modified_at: "2026-09-01T09:00:00Z", Change_Note: "older copy" };
    const out = configFromRows([...rows, older]);
    expect(out.releases.filter((r) => r.key === "RS-2026.2 + v2").map((r) => r.itemId)).toEqual([v2._id]);
    expect(out.cfg.pairs[0]!.changeNote).not.toBe("older copy");
    expect(out.notes.some((w) => w.includes("RS-2026.2 + v2") && w.includes("2 times"))).toBe(true);
  });

  it("(c) a singleton is chosen by its key before the newest row of its kind", () => {
    const newer = { _id: "PkCfgOwnOther", Config_Key: "OWN:test", Config_Kind: "Section ownership", Config_State: "Published", Published_At: "2026-12-01T00:00:00Z", Payload_JSON: JSON.stringify({ ownership: { GEN: { lead: "QM", co: [] } } }) };
    expect(configFromRows([...rows, newer]).ownership).toEqual(seed.ownership);
    // without OWN:current, the newest Published row of the kind
    expect(configFromRows([...rows.filter((r) => str(r, "Config_Key") !== "OWN:current"), newer]).ownership).toEqual({ GEN: { lead: "QM", co: [] } });
  });

  it("(e) Published_By becomes publishedBy of a published pair", () => {
    const out = configFromRows(withRow(rows, "REL:RS-2026.2 + v2", { Config_State: "Published", Published_At: "2026-10-05T09:00:00Z", Published_By: { _id: "UsAdminNina", Name: "Nina Hoffmann" } }));
    expect(out.cfg.pairs[0]).toMatchObject({ status: "published", publishedAt: "2026-10-05T09:00:00Z", publishedBy: "UsAdminNina" });
  });

  it("missing singletons fall back to the built-in values, with notes (B5)", () => {
    const out = configFromRows(rows.filter((r) => !["OWN:current", "REM:current"].includes(str(r, "Config_Key"))));
    expect(out.ownership).toEqual(seed.ownership);
    expect(out.reminders).toEqual(seed.reminders);
    expect(out.notes).toHaveLength(2);
  });

  it("B5: no row read at all (a failed or refused list): no singleton note, the failed read is the warning (load.ts)", () => {
    expect(configFromRows([]).notes).toEqual([]);
  });

  it("no rows at all: the built-in configuration (no stored pair)", () => {
    const out = configFromRows([]);
    expect(out.cfg.pairs).toEqual([]);
    expect(out.releases).toEqual([]);
    expect(out.settings).toEqual({});
  });
});

describe("verifyConfig", () => {
  it("every uploaded fingerprint matches, and the stored first pair equals the code", async () => {
    expect(await verifyConfig(configRows({ stray: false }))).toEqual([]);
  });

  it("warns on a changed payload and on a manifest that names other rows", async () => {
    const rows = configRows({ stray: false });
    const rem = rowOf(rows, "REM:current");
    const tampered = withRow(rows, "REM:current", { Payload_JSON: str(rem, "Payload_JSON").replace('"afterDays":7', '"afterDays":8') });
    const w = await verifyConfig(tampered);
    expect(w).toEqual(["REM:current: the content does not match its fingerprint (Content_Hash)."]);
    const missingRs = await verifyConfig(rows.filter((r) => str(r, "Config_Key") !== "RS:RS-2026.2"));
    expect(missingRs).toEqual(["REL:RS-2026.2 + v2: the row RS:RS-2026.2 it names is missing."]);
  });
});
