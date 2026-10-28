// The live configuration writers (write/config.ts) on the fake client holding the 12 seed rows (kissflow-build/
// config-seed/rows, through testing/rawFixtures.ts configRows): which rows each writer writes, in which order, with
// which fields; the read-back of every write (a Content_Hash Kissflow did not keep, content that no longer matches its
// fingerprint); the reuse of discarded rows; the release written last and a publish that stops before it; a draft
// changed in the meantime; the Business administrator's form rights refused; the audit rows; and the reload (toAppState
// of the rows as Kissflow then holds them) giving the domain's configuration. Fictional people only.
import { describe, expect, it } from "vitest";
import * as A from "@/domain/actions";
import { currentPair, draftPair } from "@/domain/configActions";
import type { AppState, ConfigPair, InternalPersonaId } from "@/domain/types";
import { json, str, type RawItem } from "@/portal/data/raw";
import { AppError } from "../kf/client";
import { FAKE_ERRORS, createFakeClient, type FakeCall, type FakeOptions } from "../kf/fakeClient";
import { releaseForPair, verifyConfig } from "../map/config";
import { toAppState } from "../map/toAppState";
import { configRows, fixtureActing, fixtureIdentity, fixtureSnapshot } from "../testing/rawFixtures";
import type { ConfigMethod, WriteCtx } from "../types";
import { CONFIG_TEXT } from "./config";
import { liveWriters } from "./actions";

const AT = (min: number) => `2026-10-26T09:${String(min).padStart(2, "0")}:00.000Z`;

function setup(o: { rows?: RawItem[]; opts?: FakeOptions; env?: "dev" | "prod" } = {}) {
  const identity = fixtureIdentity(["admin"]);
  const acting = fixtureActing(identity, "admin");
  const client = createFakeClient({ items: { config: o.rows ?? configRows({ stray: false }), audit: [] }, me: { _id: identity.kfUserId, Name: identity.name } }, { now: () => "2026-10-26T09:00:00Z", ...o.opts });
  const view = (persona: InternalPersonaId = "admin") => {
    const id = persona === "admin" ? identity : fixtureIdentity([persona]);
    const base = fixtureSnapshot(persona, "full");
    const snap = { ...base, forms: { ...base.forms, config: structuredClone(client.db.config), audit: [...base.forms.audit, ...structuredClone(client.db.audit)] } };
    return toAppState({ snap, identity: id, acting: persona === "admin" ? acting : fixtureActing(id, persona) });
  };
  let mapped = view();
  const ctx = (): WriteCtx => ({ client, identity, acting, index: mapped.index, webhooks: {}, now: () => "2026-10-26T09:30:00Z", containerOk: true, ...(o.env ? { env: o.env } : {}) });
  /** A store method: the domain on the loaded state, its writer, then a reload. */
  async function act(method: ConfigMethod, fn: (s: AppState) => AppState, args: unknown[] = []) {
    const prev = mapped.state;
    const next = fn(prev);
    if (A.wasRefused(prev, next)) throw new Error(`the domain refused: ${next.toasts.at(-1)?.text}`);
    const from = client.calls.length;
    const r = await liveWriters[method]!(ctx(), prev, next, args);
    const calls = client.calls.slice(from);
    mapped = view();
    return { r, prev, next, calls, state: mapped.state };
  }
  const row = (key: string) => client.db.config.find((r) => str(r, "Config_Key") === key);
  return { client, identity, act, view, row, state: () => mapped.state, reload: () => void (mapped = view()), ctx };
}

/** "<method> <Config_Key> <sent keys>" of every config write, in order. */
function writesOf(t: ReturnType<typeof setup>, calls: FakeCall[]): string[] {
  return calls
    .filter((c) => (c.m === "formCreate" || c.m === "formUpdate") && c.flow === "config")
    .map((c) => `${c.m} ${str(t.client.db.config.find((r) => r._id === c.id), "Config_Key") || str(c.data as RawItem, "Config_Key")} ${Object.keys(c.data as object).sort().join(",")}`);
}
const auditCreates = (calls: FakeCall[]) => calls.filter((c) => c.m === "formCreate" && c.flow === "audit");
const BUNDLE = "Content_Hash,Manifest_Hash,Release_Bundle_JSON,Release_Manifest_JSON";
const PAYLOAD = "Content_Hash,Payload_JSON";
const by = "u-admin";
/** A rule of the draft with one more department (a rules change). */
const ruleChange = (s: AppState) => {
  const r = draftPair(s)!.ruleSet.rules[3]!;
  const add = (["RMM", "REG", "SAF", "QM", "MIC", "SUS"] as const).find((d) => !r.departments.includes(d))!;
  return { ...r, departments: [...r.departments, add] };
};
/** The draft's first question of a section relabelled (a questionnaire change). */
const fieldChange = (s: AppState, sectionId = "K1") => {
  const f = draftPair(s)!.template.sections.find((x) => x.id === sectionId)!.fields[0]!;
  return { ...f, label: `${f.label} (as per specification)` };
};
/** Two pairs alike but for who (the people map per persona) and the DateTime format of publishedAt. */
const withoutPeople = (p: ConfigPair) => ({ ...p, createdBy: "", publishedBy: "", ...(p.publishedAt ? { publishedAt: p.publishedAt.replace(/\.\d{3}Z$/, "Z") } : {}) });

describe("discardDraft", () => {
  it("RS, TPL, then REL to Retired with no Published_At; one config.draft.discarded row; the reload has no draft", async () => {
    const t = setup();
    const { r, calls, state } = await t.act("discardDraft", (s) => A.discardDraft(s, by, AT(1)));
    expect(r.ok, r.message).toBe(true);
    expect(writesOf(t, calls)).toEqual(["formUpdate RS:RS-2026.2 Config_State", "formUpdate TPL:CIQ-2026 v2 Config_State", "formUpdate REL:RS-2026.2 + v2 Config_State"]);
    for (const k of ["RS:RS-2026.2", "TPL:CIQ-2026 v2", "REL:RS-2026.2 + v2"]) expect([str(t.row(k)!, "Config_State"), str(t.row(k)!, "Published_At")]).toEqual(["Retired", ""]);
    expect(t.client.db.config).toHaveLength(12); // nothing deleted
    expect(r).toMatchObject({ moved: false, handoffs: [] });
    expect(r.saved!.map((x) => str(x.item, "Config_Key"))).toEqual(["RS:RS-2026.2", "TPL:CIQ-2026 v2", "REL:RS-2026.2 + v2"]);
    const [a] = t.client.db.audit;
    expect(a).toMatchObject({ Action_Code: "config.draft.discarded", Event_Category: "Configuration", Object_Kind: "Configuration draft", Object_Key: "RS-2026.2 + v2", Object_State: "Retired", Ref_Flow_Id: "CIQ_Config_Version_A00", Object_Item_Id: t.row("REL:RS-2026.2 + v2")!._id });
    expect(a!.Case_Code).toBeUndefined();
    const snap = json<{ log: { action: string; by: string }[]; config: { subject: string; rows: { key: string }[] } }>(a!, "Snapshot_JSON", { log: [], config: { subject: "", rows: [] } });
    expect(snap.log.map((e) => [e.action, e.by])).toEqual([["Discarded draft", t.identity.kfUserId]]);
    expect(snap.config.rows.map((x) => x.key)).toEqual(["RS:RS-2026.2", "TPL:CIQ-2026 v2", "REL:RS-2026.2 + v2"]);
    expect(state.config.pairs).toEqual([]);
    expect(state.log.at(-1)).toMatchObject({ kind: "config", action: "Discarded draft", by });
    expect(await verifyConfig(t.client.db.config)).toEqual([]);
  });
});

describe("createDraft", () => {
  it("after a discard: the three discarded rows are reused as Draft (no new row), REL last; the reload shows the domain's draft", async () => {
    const t = setup();
    await t.act("discardDraft", (s) => A.discardDraft(s, by, AT(1)));
    const { r, next, calls, state } = await t.act("createDraft", (s) => A.createDraft(s, by, "Fictional ZZT test version", AT(2)), ["Fictional ZZT test version"]);
    expect(r.ok, r.message).toBe(true);
    expect(calls[0]).toMatchObject({ m: "formList", flow: "config" }); // a fresh list first: never a twin
    expect(writesOf(t, calls).map((x) => x.split(" ").slice(0, -1).join(" "))).toEqual(["formUpdate RS:RS-2026.2", "formUpdate TPL:CIQ-2026 v2", "formUpdate REL:RS-2026.2 + v2"]);
    expect(t.client.db.config).toHaveLength(12);
    expect(["RS:RS-2026.2", "TPL:CIQ-2026 v2", "REL:RS-2026.2 + v2"].map((k) => str(t.row(k)!, "Config_State"))).toEqual(["Draft", "Draft", "Draft"]);
    // the creator as a Kissflow id in the bundle; read back as the acting alias
    expect(json<{ createdBy: string }>(t.row("REL:RS-2026.2 + v2")!, "Release_Bundle_JSON", { createdBy: "" }).createdBy).toBe(t.identity.kfUserId);
    expect(draftPair(state)).toEqual(draftPair(next));
    expect(t.client.db.audit.map((x) => x.Action_Code)).toEqual(["config.draft.discarded", "config.draft.created"]);
    expect(await verifyConfig(t.client.db.config)).toEqual([]);
  });

  it("on an empty form: creates RS, TPL, then REL (create = draft + submit), each read back", async () => {
    const t = setup({ rows: [] });
    const { r, calls, state } = await t.act("createDraft", (s) => A.createDraft(s, by, "", AT(2)));
    expect(r.ok, r.message).toBe(true);
    const seq = calls.filter((c) => c.flow === "config").map((c) => `${c.m}${c.m === "formCreate" ? ` ${str(c.data as RawItem, "Config_Key")}` : ""}`);
    expect(seq).toEqual(["formList", "formCreate RS:RS-2026.2", "formGet", "formCreate TPL:CIQ-2026 v2", "formGet", "formCreate REL:RS-2026.2 + v2", "formGet"]);
    expect(state.config.pairs.map((p) => [p.ruleSet.version, p.status])).toEqual([["RS-2026.2", "draft"]]);
  });

  it("refuses while Kissflow holds a draft this screen did not know, and never reuses a published number", async () => {
    const t = setup();
    const prev = { ...t.state(), config: { pairs: [] } };
    const next = A.createDraft(prev, by, "", AT(2));
    const r = await liveWriters.createDraft!(t.ctx(), prev, next, [""]);
    expect(r).toMatchObject({ ok: false, tone: "danger", message: CONFIG_TEXT.draftExists });
    // RS-2026.2 published (by another session), its draft release discarded
    const u = setup();
    u.client.set(u.row("RS:RS-2026.2")!._id, { Config_State: "Published", Published_At: "2026-10-20T08:00:00Z" });
    u.client.set(u.row("REL:RS-2026.2 + v2")!._id, { Config_State: "Retired" });
    u.reload();
    const { r: r2, calls } = await u.act("createDraft", (s) => A.createDraft(s, by, "", AT(2)));
    expect(r2).toMatchObject({ ok: false, tone: "danger", message: CONFIG_TEXT.numberTaken("RS-2026.2") });
    expect(writesOf(u, calls)).toEqual([]);
  });
});

describe("draft edits", () => {
  it("write only the rows whose content changed: a rule → RS and REL, a question → TPL and REL; no audit row; the reload equals", async () => {
    const t = setup();
    const a = await t.act("upsertRule", (s) => A.upsertRule(s, by, ruleChange(s), AT(3)).state);
    expect(a.r.ok, a.r.message).toBe(true);
    expect(writesOf(t, a.calls)).toEqual([`formUpdate RS:RS-2026.2 ${PAYLOAD}`, `formUpdate REL:RS-2026.2 + v2 ${BUNDLE}`]);
    expect(auditCreates(a.calls)).toEqual([]);
    expect(draftPair(a.state)).toEqual(draftPair(a.next));
    const b = await t.act("upsertField", (s) => A.upsertField(s, by, "K1", fieldChange(s), AT(4)).state);
    expect(writesOf(t, b.calls)).toEqual([`formUpdate TPL:CIQ-2026 v2 ${PAYLOAD}`, `formUpdate REL:RS-2026.2 + v2 ${BUNDLE}`]);
    expect(draftPair(b.state)).toEqual(draftPair(b.next));
    const c = await t.act("retireSection", (s) => A.retireSection(s, by, "K6.3", AT(5)));
    expect(writesOf(t, c.calls).map((x) => x.split(" ")[1])).toEqual(["TPL:CIQ-2026", "REL:RS-2026.2"]);
    expect(draftPair(c.state)!.template.sections.find((x) => x.id === "K6.3")!.retired).toBe(true);
    expect(t.client.db.audit).toEqual([]);
    expect(await verifyConfig(t.client.db.config)).toEqual([]);
  });

  it("a draft published or discarded in the meantime: refused as stale, nothing written", async () => {
    const t = setup();
    t.client.set(t.row("REL:RS-2026.2 + v2")!._id, { Config_State: "Retired" });
    const { r, calls } = await t.act("upsertRule", (s) => A.upsertRule(s, by, ruleChange(s), AT(3)).state);
    expect(r).toMatchObject({ ok: false, tone: "danger", message: CONFIG_TEXT.draftGone });
    // the release is read first: nothing of the gone draft is written
    expect(writesOf(t, calls)).toEqual([]);
    const u = setup();
    u.client.set(u.row("RS:RS-2026.2")!._id, { Config_State: "Published", Published_At: "2026-10-20T08:00:00Z" });
    const s2 = await u.act("upsertRule", (s) => A.upsertRule(s, by, ruleChange(s), AT(3)).state);
    expect(s2.r).toMatchObject({ ok: false, tone: "danger", message: CONFIG_TEXT.draftGone });
    expect(writesOf(u, s2.calls)).toEqual([]);
  });
});

describe("publishDraft", () => {
  it("RS, TPL, then REL to Published (Published_At without ms, Change_Note, Published_By); REL last; new cases pin it", async () => {
    const t = setup();
    // the draft gives K1 another lead: the publish applies it to the Section owners setting (configActions publishDraft)
    await t.act("upsertSection", (s) => {
      const x = draftPair(s)!.template.sections.find((y) => y.id === "K1")!;
      return A.upsertSection(s, by, { id: x.id, code: x.code, title: x.title, kind: x.kind, meaning: x.meaning, lead: "SAF", co: x.co.filter((d) => d !== "SAF"), documentsOnly: !!x.documentsOnly }, AT(9)).state;
    });
    const note = "Adds Turkey REACH (KKDIK) for the fictional ZZT test.";
    const { r, calls, state } = await t.act("publishDraft", (s) => A.publishDraft(s, by, note, AT(10)), [note]);
    expect(r.ok, r.message).toBe(true);
    const w = writesOf(t, calls);
    expect(w.slice(0, 3)).toEqual(["formUpdate RS:RS-2026.2 Change_Note,Config_State,Published_At,Published_By", "formUpdate TPL:CIQ-2026 v2 Change_Note,Config_State,Published_At,Published_By", "formUpdate REL:RS-2026.2 + v2 Change_Note,Config_State,Content_Hash,Manifest_Hash,Published_At,Published_By,Release_Bundle_JSON,Release_Manifest_JSON"]);
    // the questionnaire release sets the owners of its new sections (configActions publishDraft), after the release
    expect(w.slice(3)).toEqual([`formUpdate OWN:current ${PAYLOAD}`]);
    const rel = t.row("REL:RS-2026.2 + v2")!;
    expect([str(rel, "Config_State"), str(rel, "Published_At"), str(rel, "Change_Note"), (rel.Published_By as { _id: string })._id]).toEqual(["Published", "2026-10-26T09:10:00Z", note, t.identity.kfUserId]);
    expect(currentPair(state)).toEqual({ ruleSetVersion: "RS-2026.2", templateVersion: "CIQ-2026 v2" });
    expect(releaseForPair(t.view().index.releases, currentPair(state))?.itemId).toBe(rel._id);
    expect(state.config.pairs[0]).toMatchObject({ status: "published", publishedBy: by, changeNote: note, publishedAt: "2026-10-26T09:10:00Z" });
    expect(state.ownership.K1?.lead).toBe("SAF");
    const [a] = t.client.db.audit;
    const snap = json<{ config: { subject: string; changes: { rules: { added: string[] } } } }>(a!, "Snapshot_JSON", { config: { subject: "", changes: { rules: { added: [] } } } });
    expect([a!.Action_Code, a!.Object_Kind, a!.Object_Key, a!.Object_State]).toEqual(["config.published", "Configuration release", "RS-2026.2 + v2", "Published"]);
    expect(snap.config.changes.rules.added).toContain("R-111");
    expect(await verifyConfig(t.client.db.config)).toEqual([]);
  });

  it("publishTemplateV2 publishes the prepared v2 the same way", async () => {
    const t = setup();
    const { r, state } = await t.act("publishTemplateV2", (s) => A.publishTemplateV2(s, by, AT(10)));
    expect(r.ok, r.message).toBe(true);
    expect(currentPair(state).templateVersion).toBe("CIQ-2026 v2");
  });

  it("rules only: the draft release takes the result's key, the kept questionnaire's row stays, the unused number is retired", async () => {
    const t = setup();
    await t.act("publishDraft", (s) => A.publishDraft(s, by, "v2 for the fictional test.", AT(10)));
    await t.act("createDraft", (s) => A.createDraft(s, by, "", AT(11)));
    const relId = t.row("REL:RS-2026.3 + v3")!._id;
    const tplV2 = structuredClone(t.row("TPL:CIQ-2026 v2")!);
    await t.act("upsertRule", (s) => A.upsertRule(s, by, ruleChange(s), AT(12)).state);
    const { r, calls, state } = await t.act("publishDraft", (s) => A.publishDraft(s, by, "Sustainability reviews one more rule.", AT(13)));
    expect(r.ok, r.message).toBe(true);
    const w = writesOf(t, calls).map((x) => x.split(" ").slice(0, -1).join(" "));
    // RS, (TPL kept: untouched), REL renamed last, then the working questionnaire number retired
    expect(w).toEqual(["formUpdate RS:RS-2026.3", "formUpdate REL:RS-2026.3 + v2", "formUpdate TPL:CIQ-2026 v3"]);
    expect(t.row("REL:RS-2026.3 + v3")).toBeUndefined();
    expect(t.row("REL:RS-2026.3 + v2")!._id).toBe(relId);
    expect(t.row("TPL:CIQ-2026 v2")).toEqual(tplV2);
    expect([str(t.row("TPL:CIQ-2026 v3")!, "Config_State"), str(t.row("TPL:CIQ-2026 v3")!, "Published_At")]).toEqual(["Retired", ""]);
    const m = json<Record<string, string>>(t.row("REL:RS-2026.3 + v2")!, "Release_Manifest_JSON", {});
    expect([m.templateKey, m.templateHash]).toEqual(["TPL:CIQ-2026 v2", str(tplV2, "Content_Hash")]);
    expect(state.config.pairs.map((p) => `${p.ruleSet.version} + ${p.template.version} ${p.status}`)).toEqual(["RS-2026.2 + CIQ-2026 v2 published", "RS-2026.3 + CIQ-2026 v2 published"]);
    expect(currentPair(state)).toEqual({ ruleSetVersion: "RS-2026.3", templateVersion: "CIQ-2026 v2" });
    expect(await verifyConfig(t.client.db.config)).toEqual([]);
  });

  it("stops before its release: RS and TPL are marked published (harmless), the draft stays, Publish again finishes", async () => {
    let block = true;
    const t = setup({ opts: { refuse: { formUpdate: (c) => (block && c.flow === "config" && str(t.client.db.config.find((x) => x._id === c.id), "Config_Kind") === "Release" ? "KISSFLOW_ERROR_00500 Something went wrong." : undefined) } } });
    const first = await t.act("publishDraft", (s) => A.publishDraft(s, by, "v2 for the fictional test.", AT(10)));
    expect(first.r).toMatchObject({ ok: false, tone: "warning" });
    expect(first.r.message).toBe("Rule set RS-2026.2 is marked published. Questionnaire v2 is marked published. Not finished: KISSFLOW_ERROR_00500 Something went wrong. " + CONFIG_TEXT.retryPublish("RS-2026.1 + v1"));
    expect(str(t.row("RS:RS-2026.2")!, "Config_State")).toBe("Published");
    expect(draftPair(first.state)?.ruleSet.version).toBe("RS-2026.2");
    expect(currentPair(first.state).ruleSetVersion).toBe("RS-2026.1");
    expect(t.client.db.audit).toEqual([]);
    block = false;
    const again = await t.act("publishDraft", (s) => A.publishDraft(s, by, "v2 for the fictional test.", AT(11)));
    expect(again.r.ok, again.r.message).toBe(true);
    expect(currentPair(again.state).ruleSetVersion).toBe("RS-2026.2");
    expect(t.client.db.audit.map((x) => x.Action_Code)).toEqual(["config.published"]);
  });
});

describe("singletons", () => {
  it("setOwnership: OWN:current (Payload_JSON + Content_Hash), then the draft's section that follows it; one config.ownership.changed row", async () => {
    const t = setup();
    const { r, calls, state } = await t.act("setOwnership", (s) => A.setOwnership(s, by, "K2.1", "SAF", ["REG"], AT(20)));
    expect(r.ok, r.message).toBe(true);
    expect(writesOf(t, calls)).toEqual([`formUpdate OWN:current ${PAYLOAD}`, `formUpdate TPL:CIQ-2026 v2 ${PAYLOAD}`, `formUpdate REL:RS-2026.2 + v2 ${BUNDLE}`]);
    expect(state.ownership["K2.1"]).toEqual({ lead: "SAF", co: ["REG"] });
    expect(draftPair(state)!.template.sections.find((x) => x.id === "K2.1")).toMatchObject({ lead: "SAF", co: ["REG"] });
    expect(t.client.db.audit.map((x) => [x.Action_Code, x.Object_Key])).toEqual([["config.ownership.changed", "OWN:current"]]);
    expect(await verifyConfig(t.client.db.config)).toEqual([]);
  });

  it("a missing singleton is created whole; updateReminder writes REM:current; one config.reminders.changed row", async () => {
    const t = setup({ rows: configRows({ stray: false }).filter((x) => str(x, "Config_Key") !== "OWN:current") });
    const own = await t.act("setOwnership", (s) => A.setOwnership(s, by, "K3", "QM", [], AT(20)));
    expect(own.r.ok, own.r.message).toBe(true);
    expect(own.calls.find((c) => c.m === "formCreate" && c.flow === "config")?.data).toMatchObject({ Config_Key: "OWN:current", Config_Kind: "Section ownership", Version_Label: "current", Config_State: "Published", Published_At: "2026-10-26T09:30:00Z" });
    const rem = own.state.reminders[1]!;
    const { r, calls, state } = await t.act("updateReminder", (s) => A.updateReminder(s, by, rem.id, { afterDays: rem.afterDays + 3 }, AT(21)));
    expect(r.ok, r.message).toBe(true);
    expect(writesOf(t, calls)).toEqual([`formUpdate REM:current ${PAYLOAD}`]);
    expect(state.reminders.find((x) => x.id === rem.id)!.afterDays).toBe(rem.afterDays + 3);
    expect(t.client.db.audit.map((x) => x.Action_Code)).toEqual(["config.ownership.changed", "config.reminders.changed"]);
    expect(state.log.filter((e) => e.kind === "config").map((e) => e.action)).toEqual(["Changed section ownership", "Changed reminder"]);
  });
});

describe("read-backs and refusals", () => {
  it("a Content_Hash Kissflow did not keep is a failure, so is content that no longer matches its fingerprint", async () => {
    const t = setup();
    const real = t.client.formUpdate;
    t.client.formUpdate = (f, id, data) => real(f, id, f === "config" ? { ...data, ...(data.Content_Hash ? { Content_Hash: "0".repeat(64) } : {}) } : data);
    const a = await t.act("upsertRule", (s) => A.upsertRule(s, by, ruleChange(s), AT(3)).state);
    expect(a.r).toMatchObject({ ok: false, tone: "danger", message: "Not saved: Kissflow did not keep Content_Hash after 3 attempts." });
    // a stored text changed behind the hash: the state flip reads it back and stops
    const u = setup({ env: "prod" });
    const rs = u.row("RS:RS-2026.2")!;
    u.client.set(rs._id, { Payload_JSON: str(rs, "Payload_JSON").replace('"R-00"', '"R-0X"') });
    const b = await u.act("discardDraft", (s) => A.discardDraft(s, by, AT(1)));
    expect(b.r).toMatchObject({ ok: false, tone: "danger", message: `Not saved: ${CONFIG_TEXT.fingerprint}` });
    expect(b.r.detail).toContain("RS:RS-2026.2");
  });

  it("the Business administrator's form rights refused: the clear text (production: no code), Kissflow's answer in the Writes log", async () => {
    const refusal = FAKE_ERRORS.fields("CIQ_Config_Version_A00", ["Payload_JSON"]);
    for (const env of ["prod", "dev"] as const) {
      const t = setup({ env, opts: { refuse: { formUpdate: (c) => (c.flow === "config" ? refusal : undefined) } } });
      const { r } = await t.act("upsertRule", (s) => A.upsertRule(s, by, ruleChange(s), AT(3)).state);
      expect(r.ok).toBe(false);
      if (env === "prod") {
        expect(r.message).toBe(`Not saved: ${CONFIG_TEXT.rights}`);
        expect(r.message).not.toMatch(/0503|_A00|Payload_JSON/);
        expect(r.detail).toContain("050313");
      } else expect(r.message).toBe(`Not saved: ${CONFIG_TEXT.rights.replace(/\.$/, "")} (${refusal.replace(/\.$/, "")}).`);
    }
    // a create refused (050302 by the emulated host's wording) and a list value Kissflow does not have (050312)
    const t = setup({ rows: [], env: "prod", opts: { refuse: { formCreate: (c) => (c.flow === "config" ? "KISSFLOW_ERROR_050302 You don't have permission to access this item." : undefined) } } });
    expect((await t.act("createDraft", (s) => A.createDraft(s, by, "", AT(2)))).r.message).toBe(`Not saved: ${CONFIG_TEXT.rights}`);
    const v = setup({ rows: [], env: "prod", opts: { refuse: { formCreate: (c) => (c.flow === "config" ? FAKE_ERRORS.select("Config_State", "Draft") : undefined) } } });
    expect((await v.act("createDraft", (s) => A.createDraft(s, by, "", AT(2)))).r.message).toBe(`Not saved: ${CONFIG_TEXT.rejected}`);
  });

  it("the fake keeps the live lists: a Config_State outside Draft / Published / Retired is Kissflow's validation", async () => {
    const t = setup();
    const id = t.row("REM:current")!._id;
    await expect(t.client.formUpdate("config", id, { Config_State: "Test" })).rejects.toThrow(AppError);
    await expect(t.client.formCreate("config", { Config_Key: "ZZT:x" })).rejects.toThrow("050312");
  });
});

describe("who created and published, as the screens name them", () => {
  it("the Business administrator reads the alias; another role the publisher by name (Published_By)", async () => {
    const t = setup();
    await t.act("publishDraft", (s) => A.publishDraft(s, by, "v2 for the fictional test.", AT(10)));
    const { state } = await t.act("createDraft", (s) => A.createDraft(s, by, "", AT(11)));
    expect(state.config.pairs.map((p) => [p.status, p.status === "draft" ? p.createdBy : p.publishedBy])).toEqual([
      ["published", by],
      ["draft", by],
    ]);
    const auditor = t.view("auditor").state;
    const pub = auditor.config.pairs[0]!;
    expect(pub.publishedBy).toBe(t.identity.kfUserId);
    expect(auditor.users.find((u) => u.id === t.identity.kfUserId)?.name).toBe(t.identity.name);
    expect(withoutPeople(pub)).toEqual(withoutPeople(state.config.pairs[0]!));
  });
});
