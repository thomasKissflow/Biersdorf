// mail.mjs (C-00 guarantees, debounce, retries, dead letters) and config.mjs (seed, portal bundle, pinning, S-8).

import { test } from "node:test";
import assert from "node:assert/strict";
import { outboxRows, mergeDebounced, flushDebounced, retryPlan } from "../mail.mjs";
import { seedRows, configFromRows, configPinnedTo, portalBundle, bundleHash, measureS8 } from "../config.mjs";
import { buildDirectory } from "../directory.mjs";
import { D, canonicalJson, sealOf } from "../engine.mjs";
import { ROLE } from "../ids.mjs";
import { people } from "./helpers.mjs";

function directory() {
  const ps = people();
  const roleMembers = {};
  for (const p of ps) for (const r of p.roles) (roleMembers[r] ??= []).push(p);
  const s1 = D.SUPPLIER_DEFS.find((d) => d.id === "s1");
  const contacts = D.contactsOfDef(s1);
  const supplierRows = [{ Supplier_Code: "s1", Supplier_Legal_Name: s1.name, DUNS_Number: s1.duns, Supplier_Active: "Yes", "Table::Contacts": contacts.map((u, i) => ({ Contacts_Key: `k${i}`, Contacts_Full_Name: u.name, Contacts_Email: u.email, Contacts_Portal_User_Id: u.id, Contacts_Active: i === 1 ? "No" : "Yes", Contacts_Can_Confirm: "Yes" })) }];
  return buildDirectory({ roleMembers, supplierRows });
}
const c = { id: "CIQ-2026-0001", supplierContactIds: ["u-sup-1", "u-sup-2"], internalNotes: [], openPoints: [{ id: "OP-0001-01", closeReason: "Covered by the confidential toxicology dossier", thread: [] }], reviews: [], confirmations: [] };

test("outbox: supplier mails only to the case's active contacts; internal mails never to a supplier; de-duplicated", () => {
  const dir = directory();
  const mails = [
    { event: "op-raised", audience: "supplier", to: ["u-sup-1", "u-sup-2", "u-sup-1", "u-saf"], subject: "s", body: "b", link: "/portal/case/X", caseId: c.id, by: "u-saf" },
    { event: "op-answered", audience: "internal", to: ["u-saf", "u-sup-1", "u-saf"], subject: "s", body: "b", link: "/review/X", caseId: c.id, by: "u-sup-1" },
    { event: "op-closed", audience: "supplier", to: ["u-sup-1"], subject: "closed", body: "Closed: Covered by the confidential toxicology dossier", link: "", caseId: c.id, by: "u-saf" },
    { event: "reminder", audience: "supplier", to: ["u-sup-2"], subject: "s", body: "b", link: "", caseId: c.id, by: "system", key: "rem-1:X:2026:reminder" },
  ];
  const { rows, dropped } = outboxRows({ directory: dir, c, mails, triggerKey: "req:R1", at: "2026-10-15T10:00:00.000Z", linkBase: { supplier: "https://portal.example.test/#" } });
  assert.deepEqual(rows.map((r) => [r.Event_Code, r.To_Emails]), [["op-raised", "elena.marquez@solvaro.example"], ["op-answered", "mira.hansen@beiersdorf.example"]]);
  assert.equal(rows[0].Mail_Key, "op-raised:req:R1:1");
  assert.equal(rows[0].Link_Url, "https://portal.example.test/#/portal/case/X");
  assert.deepEqual(dropped.map((d) => d.key), ["op-closed:req:R1:3", "rem-1:X:2026:reminder"], "an internal reason never reaches a supplier; a deactivated contact gets nothing");
});

test("C-10 debounce: one mail per case, author and recipients, 10 min after the last change; sections merged", () => {
  let p = mergeDebounced([], [{ caseId: "C", by: "u-sup-1", to: "a@x", section: "K2.2", firstAt: "2026-10-15T10:00:00.000Z", lastAt: "2026-10-15T10:00:00.000Z", subject: "C: the supplier changed data in K2.2", body: "K2.2: As 0.1 → 0.2", link: "L?s=K2.2" }]);
  p = mergeDebounced(p, [{ caseId: "C", by: "u-sup-1", to: "a@x", section: "A1", firstAt: "2026-10-15T10:05:00.000Z", lastAt: "2026-10-15T10:05:00.000Z", subject: "x", body: "A1: feedstock", link: "L?s=A1" }]);
  p = mergeDebounced(p, [{ caseId: "C", by: "u-sup-2", to: "a@x", section: "A1", firstAt: "2026-10-15T10:06:00.000Z", lastAt: "2026-10-15T10:06:00.000Z", subject: "y", body: "A1: other author", link: "L" }]);
  assert.equal(p.length, 2);
  assert.equal(flushDebounced(p, "2026-10-15T10:14:00.000Z").due.length, 0);
  const { due, keep } = flushDebounced(p, "2026-10-15T10:15:30.000Z");
  assert.equal(due.length, 1);
  assert.equal(due[0].Subject, "C: the supplier changed data");
  assert.equal(due[0].Body_Text.split("\n")[0], "K2.2: As 0.1 → 0.2");
  assert.equal(due[0].Mail_Key, "data-changed:C:u-sup-1:2026-10-15T10:00:00.000Z");
  assert.equal(keep.length, 1);
});

test("retries: no Sent_Status after 10 min → Mail_Key#2, #3; after attempt 3 a dead letter; a sent mail is left alone", () => {
  const base = { Event_Code: "op-raised", To_Emails: "a@x", Subject: "s", Body_Text: "b", Case_Code: "C", Attempt_No: 1 };
  const rows = [
    { ...base, _id: "1", Mail_Key: "m1", Created_At: "2026-10-15T10:00:00.000Z" },
    { ...base, _id: "2", Mail_Key: "m2", Created_At: "2026-10-15T10:00:00.000Z", Sent_Status: "Sent" },
    { ...base, _id: "3", Mail_Key: "m3", Created_At: "2026-10-15T09:00:00.000Z" },
    { ...base, _id: "4", Mail_Key: "m3#2", Attempt_No: 2, Created_At: "2026-10-15T09:20:00.000Z" },
    { ...base, _id: "5", Mail_Key: "m3#3", Attempt_No: 3, Created_At: "2026-10-15T09:40:00.000Z" },
  ];
  const { retries, deadLetters } = retryPlan(rows, "2026-10-15T10:11:00.000Z");
  assert.deepEqual(retries.map((r) => [r.Mail_Key, r.Attempt_No]), [["m1#2", 2]]);
  assert.ok(!("_id" in retries[0]));
  assert.deepEqual(deadLetters.map((d) => [d.Mail_Key, d.attempts]), [["m3", 3]]);
});

test("seed: RS-2026.1 + v1 Published 21 Sep 2026, RS-2026.2 + v2 Draft, the singletons; read back as the prototype's initial config", () => {
  const seed = seedRows();
  const all = Object.values(seed).flat();
  const rel1 = all.find((r) => r.Config_Key === "REL:RS-2026.1 + v1");
  assert.equal(rel1.Config_State, "Published");
  assert.equal(rel1.Published_At, "2026-09-21T10:00:00.000Z");
  assert.equal(all.find((r) => r.Config_Key === "REL:RS-2026.2 + v2").Config_State, "Draft");
  assert.deepEqual(all.filter((r) => r.Version_Label === "current").map((r) => r.Config_Kind).sort(), ["Limit set", "RMES criteria", "Regression set", "Reminders", "Section ownership", "Settings"]);
  const settings = JSON.parse(all.find((r) => r.Config_Kind === "Settings").Payload_JSON);
  assert.deepEqual(settings.undefinedOrigins, ["waste", "ccu", "chemrec"]);
  assert.deepEqual(Object.keys(settings.defaultReviewers), ["RMM", "REG", "SAF", "QM", "MIC", "SUS"]);
  // every field id of the rows exists on CIQ Config Version (inventory-app.md)
  const known = new Set(["Config_Key", "Config_Kind", "Version_Label", "Config_State", "Section_Key", "Section_Rev", "Payload_JSON", "Internal_Annotations_JSON", "Content_Hash", "Evaluator_Version", "Change_Note", "Published_By", "Published_At", "Release_Key", "Release_Label", "Release_Stage", "Release_Manifest_JSON", "Release_Bundle_JSON", "Manifest_Hash", "Regression_Result_JSON", "Test_Case_Codes"]);
  for (const r of all) for (const k of Object.keys(r)) assert.ok(known.has(k), k);
  const cfg = configFromRows(all.map((r, i) => ({ ...r, _id: `r${i}` })));
  const proto = D.baseState([], []).config;
  assert.deepEqual(cfg.cfg.pairs.map((p) => [p.ruleSet.version, p.template.version, p.status]), proto.pairs.map((p) => [p.ruleSet.version, p.template.version, p.status]));
  assert.deepEqual(JSON.parse(JSON.stringify(cfg.cfg.pairs[0].template)), JSON.parse(JSON.stringify(proto.pairs[0].template)), "v2 as data equals the prototype's prepared draft");
  assert.equal(D.currentPair({ config: cfg.cfg }).ruleSetVersion, "RS-2026.1");
  assert.deepEqual(configPinnedTo(cfg, "RS-2026.1", "CIQ-2026 v1").cfg.pairs, []);
  assert.equal(configPinnedTo(cfg, "RS-2026.2", "CIQ-2026 v2"), null, "a draft is never pinned");
});

test("portal bundle ciq-bundle/1: the contract shape, no basis or notes, SHA-256 over canonical JSON", () => {
  const seed = seedRows();
  const cfg = configFromRows(Object.values(seed).flat().map((r, i) => ({ ...r, _id: `r${i}` })));
  for (const rel of cfg.releases) {
    const b = portalBundle(rel, cfg.settings);
    assert.deepEqual(Object.keys(b).sort(), ["format", "release", "ruleSet", "settings", "template"]);
    assert.equal(b.format, "ciq-bundle/1");
    assert.equal(b.release.label, `${rel.ruleSetVersion} + ${rel.templateVersion}`);
    assert.equal(b.release.manifestHash, rel.row.Manifest_Hash);
    assert.ok(b.ruleSet.rules.every((r) => !("basis" in r) && !("note" in r) && Array.isArray(r.departments)));
    assert.ok(b.template.sections.every((s) => Array.isArray(s.fields) && "lead" in s));
    assert.deepEqual(b.settings.undefinedOrigins, ["waste", "ccu", "chemrec"]);
    assert.equal(bundleHash(b), sealOf(b));
    assert.equal(canonicalJson({ b: 1, a: [2, { d: 3, c: 4 }] }), '{"a":[2,{"c":4,"d":3}],"b":1}');
    // the engine derives the same scope from the bundle as from the built-in rules
    const answers = { SF01: ["vegetable"], SF11: ["EU", "UK"], SF12: true };
    const viaBundle = D.deriveScope(answers, b.ruleSet.version, b.template.version, rel.state === "Draft" ? { pairs: [{ ruleSet: b.ruleSet, template: b.template, status: "published", basedOn: {}, note: "", createdAt: "", createdBy: "", changeNote: "" }] } : { pairs: [] });
    const builtIn = D.deriveScope(answers, b.ruleSet.version, b.template.version, rel.state === "Draft" ? { pairs: [D.preparedDraft(cfg.ownership)].map((p) => ({ ...p, status: "published" })) } : { pairs: [] });
    assert.deepEqual(viaBundle, builtIn);
  }
});

test("S-8: every payload, bundle and answers set is measured against the proven 122 KB", () => {
  const r = measureS8();
  const bundles = r.rows.filter((x) => x.field.startsWith("Config_Bundle_JSON"));
  assert.equal(bundles.length, 2);
  for (const x of r.rows) assert.ok(x.bytes < 122 * 1024, `${x.row} ${x.field} ${x.kb} KB`);
  assert.ok(r.answers.length >= 3 && r.verdict.length >= 2);
});

test("directory: role members, persona aliases, supplier contacts (active, may confirm); projection to a department", () => {
  const roleMembers = { [ROLE.RMM]: [{ _id: "Us1", Name: "Thomas", Email: "T@x.example" }], [ROLE.SAF]: [{ _id: "Us1", Name: "Thomas", Email: "T@x.example" }], [ROLE.admin]: [{ _id: "Us1", Name: "Thomas", Email: "T@x.example" }] };
  const dir = buildDirectory({ roleMembers, supplierRows: [] });
  const users = dir.users();
  assert.equal(users.find((u) => u.id === "Us1").dept, "RMM");
  assert.ok(users.some((u) => u.id === "Us1" && u.dept === "SAF"), "alias entry for the second department");
  assert.equal(users.find((u) => u.id === "u-admin").aliasOf, "Us1");
  assert.equal(dir.users({ Us1: "SAF" }).find((u) => u.id === "Us1").dept, "SAF");
  assert.equal(dir.users({ Us1: "QM" }).find((u) => u.id === "Us1").dept, "RMM", "never projected into a role the person lacks");
  assert.equal(dir.personaIdFor("Us1", "admin"), "u-admin");
  assert.equal(dir.byEmail("t@x.example").id, "Us1");
});
