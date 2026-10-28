// Golden (identity contract, NO-OP): the standard e2e walk with the default fixture (no Kissflow user is both internal
// and a supplier contact), projected onto every identity-bearing value the service writes. The fixture
// test/golden/identity-noop.json was captured BEFORE identity.mjs existed (15 Oct); with no shared uid the identity
// layer must be a pure no-op, so the projection stays byte-identical.
// Re-captured on purpose on 15 Oct for Thomas's two rules (the questionnaire locks at the release request; a supplier
// change reopens the section owners' completed reviews): the walk now has the refused save while locked, QM's reopen
// before the late origin change, and the owners' reopens with their re-completions. Only those parts of the projection
// changed (checked line by line against the earlier capture); the split-all run still has to reproduce it byte for byte.
//   Re-capture only on purpose: CIQ_GOLDEN_WRITE=1 node --test kissflow-build/sync/test/
// Re-captured on purpose on 27 Oct for the final PDF's new layout (pdf.mjs, the app's Final document tab): only the
// ledger's finalPdf pdfSha256 and size changed.
// Re-captured on purpose on 28 Oct for the matrix v0.6 configuration (checked field by field against the 27 Oct
// capture): the metadata answers without SF-02 and SF-08; FLD-A1-102/103/104 answered in K2.3 instead of Annex 1; no
// Sustainability review (Annex 1 is led by Regulatory, so a vegetable case without SF-09 has no SUS track: its review
// item, mails, completions and confirmations are gone); and, following from that, the fake's item ids, the request
// numbers and the clock (one step less per completion round) shifted. Nothing else changed.
// Re-captured on purpose on 28 Oct (implementer 2) for the matrix v0.6 checks (checked field by field against the
// capture above): the late petrochemical origin now needs its component (D6), so the walk saves a second K2.1 row
// with the Annex 4 answers (one more "Changed composition after completeness" audit event; the release item ids shift
// by one); the final document's Annex 1 holds the derived FLD-A1-105 Country of origin (L6), and its components the
// new row, so the seal and the final PDF's SHA-256 and size changed; FLD-A2-101 is answered one fill round later
// (07:07 instead of 07:05: the service's domain pre-fills it at the metadata answer (M9), the simulator's next save,
// which unlike the portal screen carries no pre-fill, mirrors it away, and the next fill round answers it). The
// answers themselves, every identity value and every mail recipient are unchanged.
// Stripped: child-row _id (random rand10 ids of the port and Date.now() ids of the portal simulator). Request keys are
// renumbered from 1 (the simulator's request counter is shared by every test of the process).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { uiClient } from "../fake.mjs";
import { setup, fillUntilComplete, fillFor, PLAIN_CONFIG, FLOW } from "./helpers.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(here, "golden", "identity-noop.json");
const C = "CIQ-2026-0001";
const REVIEWER = { RMM: "u-rmm", REG: "u-reg", SAF: "u-saf", QM: "u-qm", MIC: "u-mic", SUS: "u-sus" };

async function recordRmes(h, dept) {
  const form = dept === "SAF" ? FLOW.rmesSaf : FLOW.rmesReg;
  const table = dept === "SAF" ? "Safety_Criteria" : "Regulatory_Criteria";
  const rowId = h.ledger(C).items[`rmes:${dept}`];
  const open = h.fake.item(rowId)[`Table::${table}`].filter((x) => !x.Criteria_Result);
  if (!open.length) return;
  const who = REVIEWER[dept];
  const cl = uiClient(h.fake, who);
  await cl.call("POST", `/form/2/${cl.acc}/${form}/${rowId}?_application_id=CIQ_Digital_A00`, { [`Table::${table}`]: open.map((x) => ({ _id: x._id, Criteria_Result: "Available", Criteria_Recorded_At: h.clock.now().toISOString() })) });
  await h.wb(who).request("rmes.saved", C, { dept, results: open.map((x) => ({ criterionId: x.Criteria_Code, result: "available", comment: "" })) });
  await h.run();
}

async function completeReview(h, dept) {
  const who = REVIEWER[dept];
  if (dept === "SAF" || dept === "REG") await recordRmes(h, dept);
  const item = h.reviewItem(C, dept);
  await h.wb(who).actAtStep(FLOW.review, item._id, { Review_Confirm: "Confirmed", Completed_By: { _id: who }, Completed_At: h.clock.now().toISOString(), ...(dept === "SAF" || dept === "REG" ? { RMES_Decision: "Approved" } : {}) });
  await h.wb(who).request("review.completed", C, { dept }, item._id);
  await h.run();
}

/** The e2e.test.mjs walk, without its assertions. */
export async function standardWalk(h) {
  const rmm = h.wb("u-rmm");
  const saf = h.wb("u-saf");
  const elena = h.sup("u-sup-1");
  const ravi = h.sup("u-sup-2");
  const caseItem = await rmm.createCase({ Case_Code: C });
  await rmm.request("case.created", C, { caseItemId: caseItem }, caseItem);
  await h.run();
  await elena.save(C, { config: PLAIN_CONFIG });
  await ravi.save(C, { answers: { "FLD-GEN-004": "Solvaro Oleochemicals S.A., Tarragona" } });
  await h.run();
  await fillUntilComplete(h, C);
  await elena.confirmCompleteness(C);
  await h.run();
  await saf.request("op.raise", C, { dept: "SAF", kind: "query", ref: { sectionId: "K2.2", fieldId: "FLD-A14-101", label: "K2.2 › Arsenic (As) content" }, question: "Please confirm the arsenic value with the batch analysis.", justification: "Needed for the heavy-metal evaluation", dueDate: "2026-11-30T00:00:00.000Z" });
  await h.run();
  const opId = h.ciq(C).openPoints[0].id;
  await elena.answer(C, opId, 1, { text: "As is 0.05 mg/kg in batch 2408-117." });
  await h.run();
  await saf.request("op.returned", C, { opId, text: "Please attach the full batch analysis report." }, opId);
  await h.run();
  await elena.save(C, { uploads: [{ id: "UP-AN-1", sectionId: "K2.2", fieldId: "FLD-A14-101", name: "batch-analysis-2408-117.pdf", kind: "Analysis" }] });
  await elena.answer(C, opId, 2, { kind: "Document", text: "Full report attached.", uploadIds: ["UP-AN-1"] });
  await h.run();
  await saf.actAtStep(FLOW.openPoint, h.opItem(C, opId)._id, { OP_Outcome: "Accepted" });
  await saf.request("op.accepted", C, { opId }, opId);
  await h.run();
  for (const d of ["REG", "SAF", "QM", "MIC", "RMM"]) await completeReview(h, d);
  // locked while the release is requested: refused and logged (Thomas, 15 Oct); QM reopens, which unlocks it
  await elena.save(C, { config: { SF01: ["vegetable", "petrochemical"] } });
  await h.run();
  await h.wb("u-qm").request("review.reopen", C, { dept: "QM", reason: "The palm and mineral oil answers must be updated" });
  await h.run();
  await elena.save(C, { config: { SF01: ["vegetable", "petrochemical"] } });
  await h.run();
  h.tick(11 * 60_000);
  await h.run();
  const ap = h.ciq(C).openPoints.find((p) => p.kind === "additional-part");
  const f = fillFor(h, C);
  await elena.save(C, { answers: f.answers, justifications: f.justifications, uploads: f.uploads, components: f.components });
  await h.run();
  await elena.answer(C, ap.id, 1, { kind: "Additional part completed", text: "Annex 4 is completed." });
  await h.run();
  await saf.actAtStep(FLOW.openPoint, h.opItem(C, ap.id)._id, { OP_Outcome: "Accepted" });
  await saf.request("op.accepted", C, { opId: ap.id }, ap.id);
  await h.run();
  // the K2.3 answer reopened RMM and Regulatory (section owners; no Sustainability track without SF-09); QM's own
  // reopen waits too
  for (const d of ["SAF", "QM", "REG", "RMM"]) await completeReview(h, d);
  h.tick(11 * 60_000);
  await h.run();
  await elena.release(C);
  await h.run();
  await ravi.save(C, { answers: { "FLD-GEN-005": "New site in Reus" } });
  h.tick(16 * 60_000);
  await h.run();
  await elena.reportChange(C, "We changed the production site to Reus.");
  h.tick(16 * 60_000);
  await h.run();
  return caseItem;
}

const IDENTITY_FIELD = /^(Owner_RMM|Assignee_User|Responsible_User|Raised_By_User|Completed_By|Closed_By|Note_Author|Run_By|Published_By|Criteria_Recorded_By|Assigned_Contacts|Raiser_Assignee|Portal_Contact_Ids|Confirm_Contact_Ids|Case_Contacts_JSON|Thread_JSON|Questions_History_JSON|Previous_Rounds_JSON|Supplier_Contact_Emails)$|_Email$|_By_Name$|_By$|^Doc_Uploaded_By$|^CR_By_/;

/** Every identity-bearing value of the fake, deterministic. */
export function projection(h) {
  const out = {};
  const pick = (row, all) => {
    const o = {};
    for (const [k, v] of Object.entries(row)) {
      if (k === "_created_by" || k === "_modified_by") o[k] = v?._id ?? v;
      else if (k.startsWith("Table::")) {
        const rows = (v ?? []).map((r) => pick(Object.fromEntries(Object.entries(r).filter(([x]) => x !== "_id")), false)).filter((r) => Object.keys(r).length);
        if (rows.length) o[k] = rows;
      } else if (all || IDENTITY_FIELD.test(k)) o[k] = v;
    }
    return o;
  };
  for (const flow of Object.keys(h.fake.schema).sort()) {
    const rows = h.fake.rows(flow);
    if (!rows.length) continue;
    if (flow === FLOW.outbox) out[flow] = rows.map((r) => ({ Mail_Key: r.Mail_Key, Event_Code: r.Event_Code, Audience: r.Audience, To_Emails: r.To_Emails }));
    else if (flow === FLOW.audit) out[flow] = rows.map((r) => ({ Event_Key: r.Event_Key, Action_Code: r.Action_Code, Actor_Side: r.Actor_Side, Actor_Name: r.Actor_Name, Actor_Email: r.Actor_Email, Actor_Dept: r.Actor_Dept }));
    else if (flow === FLOW.caseData)
      out[flow] = rows.map((r) => ({ ...pick(r, false), ...Object.fromEntries(Object.entries(r).filter(([k]) => /_JSON$/.test(k) || k === "Sync_Note")) }));
    else out[flow] = rows.map((r) => ({ _id: r._id, ...pick(r, false) }));
  }
  return out;
}

/** Request keys renumbered from 1 (RQ-<user>-<n>; the counter is module-wide in helpers.mjs). */
export function normaliseRequestKeys(h, text) {
  const ns = h.requests().map((r) => Number(/^RQ-.+-(\d+)$/.exec(r.Request_Key ?? "")?.[1])).filter((n) => Number.isFinite(n));
  const base = Math.min(...ns) - 1;
  return text.replace(/RQ-([A-Za-z0-9_-]+)-(\d+)(?=["#:,\]\s\\]|$)/g, (_, who, n) => `RQ-${who}-${Number(n) - base}`);
}

test("golden: with no shared Kissflow user, the identity layer is a no-op (byte-identical projection of the e2e walk)", async () => {
  const h = setup();
  await standardWalk(h);
  const text = normaliseRequestKeys(h, JSON.stringify(projection(h), null, 1));
  if (process.env.CIQ_GOLDEN_WRITE === "1") {
    mkdirSync(dirname(FIXTURE), { recursive: true });
    writeFileSync(FIXTURE, text + "\n");
    return;
  }
  assert.ok(existsSync(FIXTURE), `missing ${FIXTURE}: capture it with CIQ_GOLDEN_WRITE=1`);
  const want = readFileSync(FIXTURE, "utf8").replace(/\n$/, "");
  if (text !== want) {
    const a = text.split("\n");
    const b = want.split("\n");
    const i = a.findIndex((l, k) => l !== b[k]);
    assert.fail(`projection differs from the golden at line ${i + 1}:\n  got:  ${a[i]}\n  want: ${b[i]}`);
  }
  assert.ok(!text.includes("sup:"), "no minted id in any write");
});
