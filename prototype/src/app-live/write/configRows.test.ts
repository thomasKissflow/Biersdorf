// The row serialiser (write/configRows.ts) against the prod seed (kissflow-build/night-2026-10-21/prod-seed/
// config-version.json, read in place, never copied: SET:current carries webhook tokens, so it is compared by equality
// only and never printed): the built-in first pair and the prepared draft give exactly the seed's rows (every JSON
// text and hash; Published_At as Kissflow stores it), the singletons too; and configFromRows of serialised rows gives
// back the same configuration (the round trip).
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import * as A from "@/domain/actions";
import { RS1 } from "@/domain/builtinRules";
import { BUILTIN_SECTIONS, builtinTemplateData } from "@/domain/catalog";
import { FIRST_PAIR, preparedDraft } from "@/domain/configActions";
import { UNDEFINED_ORIGINS } from "@/domain/rules";
import { baseState } from "@/domain/seed";
import type { AppState, ConfigPair } from "@/domain/types";
import type { RawItem } from "@/portal/data/raw";
import { configFromRows, verifyConfig } from "../map/config";
import { CONFIG_KEY, EVALUATOR_VERSION, contentHash, fingerprintProblem, pairRows, singletonRow, type PairRowsInput } from "./configRows";

const SEED = fileURLToPath(new URL("../../../../kissflow-build/night-2026-10-21/prod-seed/config-version.json", import.meta.url));
const haveSeed = existsSync(SEED);
const seedRows = (): Record<string, unknown>[] => (haveSeed ? (JSON.parse(readFileSync(SEED, "utf8")) as Record<string, unknown>[]) : []);
const seedRow = (key: string) => seedRows().find((r) => r.Config_Key === key)!;

/** The seed's first-pair time (config.mjs SEED_AT; builtinRules.ts RS1.publishedAt). */
const SEED_AT = "2026-09-21T10:00:00.000Z";
const ownership = (): AppState["ownership"] => Object.fromEntries(BUILTIN_SECTIONS.map((x) => [x.id, { lead: x.lead, co: [...x.co] }]));

/** config.mjs seedRows' v1 argument. */
const firstPairInput = (): PairRowsInput => ({
  ruleSet: { version: RS1.version, rules: RS1.rules.map((r) => JSON.parse(JSON.stringify(r))) },
  template: builtinTemplateData(RS1.templateVersion, ownership()),
  state: "Published",
  publishedAt: SEED_AT,
  changeNote: FIRST_PAIR.changeNote,
  basedOn: null,
  note: "Built-in first configuration (prototype configActions.ts FIRST_PAIR).",
  createdAt: SEED_AT,
  createdBy: "seed",
  undefinedOrigins: [...UNDEFINED_ORIGINS],
});

/** config.mjs seedRows' v2 argument (the prepared draft). */
const draftInput = (d: ConfigPair = preparedDraft(ownership())): PairRowsInput => ({
  ruleSet: d.ruleSet,
  template: d.template,
  state: "Draft",
  changeNote: d.changeNote,
  basedOn: d.basedOn,
  note: d.note,
  createdAt: d.createdAt,
  createdBy: "seed",
  undefinedOrigins: [...UNDEFINED_ORIGINS],
});

describe.skipIf(!haveSeed)("pairRows: byte-identical to the prod seed (sync/config.mjs releaseRows)", () => {
  it("the built-in first pair: RS:RS-2026.1, TPL:CIQ-2026 v1 and REL:RS-2026.1 + v1 exactly, Published_At without milliseconds", async () => {
    const out = await pairRows(firstPairInput());
    expect(out.keys).toEqual({ rs: "RS:RS-2026.1", tpl: "TPL:CIQ-2026 v1", rel: "REL:RS-2026.1 + v1" });
    expect(out.rs).toEqual(seedRow("RS:RS-2026.1"));
    expect(out.tpl).toEqual(seedRow("TPL:CIQ-2026 v1"));
    expect(out.rel).toEqual(seedRow("REL:RS-2026.1 + v1"));
    // the texts themselves, not only their parsed values
    for (const k of ["Payload_JSON", "Content_Hash"]) expect(out.rs[k]).toBe(seedRow("RS:RS-2026.1")[k]);
    for (const k of ["Release_Bundle_JSON", "Release_Manifest_JSON", "Content_Hash", "Manifest_Hash", "Published_At"]) expect(out.rel[k]).toBe(seedRow("REL:RS-2026.1 + v1")[k]);
    expect(out.rel.Published_At).toBe("2026-09-21T10:00:00Z");
    expect(out.hashes.manifest).toBe(seedRow("REL:RS-2026.1 + v1").Manifest_Hash);
  });

  it("the prepared draft (RS-2026.2 + v2): the three Draft rows exactly, no Published_At", async () => {
    const out = await pairRows(draftInput());
    expect(out.rs).toEqual(seedRow("RS:RS-2026.2"));
    expect(out.tpl).toEqual(seedRow("TPL:CIQ-2026 v2"));
    expect(out.rel).toEqual(seedRow("REL:RS-2026.2 + v2"));
    for (const k of ["Release_Bundle_JSON", "Release_Manifest_JSON", "Content_Hash", "Manifest_Hash"]) expect(out.rel[k]).toBe(seedRow("REL:RS-2026.2 + v2")[k]);
    expect("Published_At" in out.rel).toBe(false);
  });

  it("the singletons: OWN:current and REM:current from the domain's values, the others from their own payloads", async () => {
    const seed = { publishedAt: SEED_AT, changeNote: "Seed (plan v5 §11.2)." };
    expect(await singletonRow(CONFIG_KEY.ownership, { ownership: ownership() }, seed)).toEqual(seedRow("OWN:current"));
    expect(await singletonRow(CONFIG_KEY.reminders, { reminders: baseState([], []).reminders }, seed)).toEqual(seedRow("REM:current"));
    for (const key of ["RMES:current", "LIM:current", "REG:current"]) {
      const s = seedRow(key);
      expect(await singletonRow(key, JSON.parse(String(s.Payload_JSON)), { publishedAt: String(s.Published_At), changeNote: String(s.Change_Note) })).toEqual(s);
    }
    // SET:current holds the webhook tokens: compared, never printed
    const set = seedRow(CONFIG_KEY.settings);
    const again = await singletonRow(CONFIG_KEY.settings, JSON.parse(String(set.Payload_JSON)), { publishedAt: String(set.Published_At), changeNote: String(set.Change_Note) });
    const same = Object.keys(again).length === Object.keys(set).length && Object.keys(set).every((k) => again[k] === set[k]);
    expect(same).toBe(true);
  });

  it("verifyConfig over the prod seed reports nothing: every fingerprint, every manifest, and the first pair equals the built-in code (28 Oct, matrix v0.6)", async () => {
    expect(await verifyConfig(asItems(seedRows()))).toEqual([]);
  });

  it("every seed row passes the read-back fingerprint check; a changed text does not", async () => {
    for (const r of seedRows()) expect(await fingerprintProblem(r), String(r.Config_Key)).toBeUndefined();
    const rem = seedRow("REM:current");
    expect(await fingerprintProblem({ ...rem, Payload_JSON: String(rem.Payload_JSON).replace('"afterDays":7', '"afterDays":8') })).toBe("Payload_JSON does not match its Content_Hash");
    const rel = seedRow("REL:RS-2026.2 + v2");
    expect(await fingerprintProblem({ ...rel, Manifest_Hash: "0".repeat(64) })).toBe("Release_Manifest_JSON does not match its Manifest_Hash");
  });
});

describe("pairRows", () => {
  it("names its keys, hashes the canonical JSON and writes Evaluator_Version", async () => {
    const out = await pairRows(draftInput());
    expect(out.keys).toEqual({ rs: "RS:RS-2026.2", tpl: "TPL:CIQ-2026 v2", rel: "REL:RS-2026.2 + v2" });
    expect(out.rs.Content_Hash).toBe(await contentHash(JSON.parse(String(out.rs.Payload_JSON))));
    expect(out.rel.Content_Hash).toBe(await contentHash(JSON.parse(String(out.rel.Release_Bundle_JSON))));
    expect([out.rs, out.tpl, out.rel].every((r) => r.Evaluator_Version === EVALUATOR_VERSION && r.Config_State === "Draft")).toBe(true);
    const m = JSON.parse(String(out.rel.Release_Manifest_JSON)) as Record<string, unknown>;
    expect(m).toMatchObject({ ruleSetKey: "RS:RS-2026.2", templateKey: "TPL:CIQ-2026 v2", ruleSetHash: out.rs.Content_Hash, templateHash: out.tpl.Content_Hash, bundleHash: out.rel.Content_Hash });
  });

  it("a published pair: Published_At as a Kissflow DateTime, Published_By as a user, the bundle keeps the ISO time", async () => {
    const out = await pairRows({ ...draftInput(), state: "Published", publishedAt: "2026-10-26T09:15:42.318Z", publishedBy: "UsAdminNina" });
    expect(out.rel.Published_At).toBe("2026-10-26T09:15:42Z");
    expect(out.rs.Published_By).toEqual({ _id: "UsAdminNina" });
    expect(JSON.parse(String(out.rel.Release_Bundle_JSON)).publishedAt).toBe("2026-10-26T09:15:42.318Z");
  });
});

// ---------------------------------------------------------------------------------- round trip

/** Rows as Kissflow lists them: an _id and system fields each. */
const asItems = (rows: Record<string, unknown>[], at = "2026-10-26T09:00:00Z"): RawItem[] => rows.map((r, i) => ({ _id: `FmCfgRT${i}`, _created_at: at, _modified_at: at, ...r }) as RawItem);
/** A pair as the reader gives it (publishedAt as stored: a Kissflow DateTime). */
const asRead = (p: ConfigPair): ConfigPair => (p.publishedAt ? { ...p, publishedAt: p.publishedAt.replace(/\.\d{3}Z$/, "Z") } : p);

describe("the round trip: configFromRows(serialised rows) gives the same configuration", () => {
  it("the first pair and a draft created, edited and saved by the domain", async () => {
    const s0 = A.toast(baseState([{ id: "u-admin", name: "Nina Hoffmann", email: "", side: "internal", title: "Business administrator", initials: "NH" }], []), "info", "start");
    const s1 = A.discardDraft(s0, "u-admin", "2026-10-26T08:00:00.000Z");
    const s2 = A.createDraft(s1, "u-admin", "Fictional test draft", "2026-10-26T08:01:00.000Z");
    const d0 = s2.config.pairs.find((p) => p.status === "draft")!;
    const rule = d0.ruleSet.rules.find((r) => r.id === "R-10") ?? d0.ruleSet.rules[3]!;
    const s3 = A.upsertRule(s2, "u-admin", { ...rule, departments: [...new Set([...rule.departments, "QM" as const])] }, "2026-10-26T08:02:00.000Z").state;
    const d = s3.config.pairs.find((p) => p.status === "draft")!;
    const singles = [await singletonRow(CONFIG_KEY.ownership, { ownership: s3.ownership }), await singletonRow(CONFIG_KEY.reminders, { reminders: s3.reminders })];
    const rows = [...Object.values(await pairRows(firstPairInput())).slice(0, 3), ...Object.values(await pairRows({ ...draftInput(d), createdBy: d.createdBy })).slice(0, 3), ...singles] as Record<string, unknown>[];
    const read = configFromRows(asItems(rows));
    expect(read.cfg).toEqual(s3.config);
    expect(read.notes).toEqual([]);
    expect(await verifyConfig(asItems(rows))).toEqual([]);
  });

  it("a published pair (Published_At, Published_By, the change note) and the next draft", async () => {
    const s0 = baseState([{ id: "u-admin", name: "Nina Hoffmann", email: "", side: "internal", title: "Business administrator", initials: "NH" }], []);
    const s1 = A.publishDraft(s0, "u-admin", "Turkey REACH for the Turkey market.", "2026-10-26T08:05:00.000Z");
    const p = s1.config.pairs[0]!;
    expect(p.status).toBe("published");
    const s2 = A.createDraft(s1, "u-admin", "", "2026-10-26T08:06:00.000Z");
    const d = s2.config.pairs[1]!;
    const pub = await pairRows({ ruleSet: p.ruleSet, template: p.template, state: "Published", publishedAt: p.publishedAt, publishedBy: p.publishedBy, changeNote: p.changeNote, basedOn: p.basedOn, note: p.note, createdAt: p.createdAt, createdBy: p.createdBy, undefinedOrigins: [...UNDEFINED_ORIGINS] });
    const draft = await pairRows({ ...draftInput(d), createdBy: d.createdBy });
    const read = configFromRows(asItems([pub.rs, pub.tpl, pub.rel, draft.rs, draft.tpl, draft.rel] as Record<string, unknown>[]));
    expect(read.cfg).toEqual({ pairs: [asRead(p), d] });
    expect(read.releases.map((r) => [r.key, r.state])).toEqual([
      ["RS-2026.2 + v2", "Published"],
      ["RS-2026.3 + v3", "Draft"],
    ]);
  });

  it("the singletons give the ownership and the reminders back", async () => {
    const own = { ...ownership(), K2: { lead: "SAF" as const, co: ["REG" as const] } };
    const rem = baseState([], []).reminders.map((r, i) => (i === 0 ? { ...r, afterDays: r.afterDays + 2 } : r));
    const read = configFromRows(asItems([await singletonRow(CONFIG_KEY.ownership, { ownership: own }), await singletonRow(CONFIG_KEY.reminders, { reminders: rem })] as Record<string, unknown>[]));
    expect(read.ownership).toEqual(own);
    expect(read.reminders).toEqual(rem);
  });
});
