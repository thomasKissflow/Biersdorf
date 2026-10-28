#!/usr/bin/env node
// Writes test/fixtures/kissflow.json: the fake Kissflow the offline test serves, and the app's own final document of the
// completed case ZZT-0005 (the parity target). Usage: node kissflow-build/final-pdf/test/make-fixtures.mjs
//
// The items are the app's live-shaped test fixtures (prototype/src/app-live/testing/rawFixtures.ts: fictional ZZT cases,
// Solvaro contacts, *.example addresses), given the system fields a live admin read carries (night-2026-10-21
// runner-requests.jsonl response bodies) and checked against the live field lists (night-2026-10-21/snapshot): a
// business field the live flow does not have stops the script. The expected document is toAppState as the app's RMM
// screen runs it on the same items. Reads the prototype read-only; writes only inside final-pdf/test.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../..");
const esbuild = await import(pathToFileURL(resolve(root, "prototype/node_modules/esbuild/lib/main.js")).href);
const SNAP = resolve(root, "kissflow-build/night-2026-10-21/snapshot");
const REQUESTS = resolve(root, "kissflow-build/night-2026-10-21/runner-requests.jsonl");

// The fixture module is bundled into test/.tmp (that depth keeps rawFixtures' config-seed path valid) and removed after.
const tmp = resolve(here, ".tmp");
mkdirSync(tmp, { recursive: true });
const entry = resolve(tmp, "fx-entry.ts");
writeFileSync(
  entry,
  `export { harnessFixtures, fixtureSnapshot, fixtureIdentity, fixtureActing } from "../../../../prototype/src/app-live/testing/rawFixtures";
export { toAppState } from "../../../../prototype/src/app-live/map/toAppState";
`,
);
const outfile = resolve(tmp, "fx.mjs");
try {
  await esbuild.build({ entryPoints: [entry], bundle: true, format: "esm", platform: "node", target: "node20", outfile, tsconfig: resolve(root, "prototype/tsconfig.json"), logLevel: "warning" });
  var fx = await import(pathToFileURL(outfile).href);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

// ---------------------------------------------------------------- live shapes

const FLOW_IDS = { case: "CIQ_Case_A00", review: "CIQ_Review_A00", op: "CIQ_Open_Point_A00", audit: "CIQ_Audit_Event_A00", note: "CIQ_Internal_Note_A00", rmesSAF: "CIQ_RMES_Safety_A00", rmesREG: "CIQ_RMES_Regulatory_A00", supplier: "CIQ_Supplier_A00", config: "CIQ_Config_Version_A00" };
const KIND = { case: "process", review: "process", op: "process" };
const liveFields = (flow) => {
  const file = resolve(SNAP, `CIQ_Digital_A00.${KIND[flow] ?? "form"}.${FLOW_IDS[flow]}.json`);
  const d = JSON.parse(readFileSync(file, "utf8")).draft;
  return new Set(d[d.Root]["Model::Field"]);
};

// The system keys of live admin item reads (runner-requests.jsonl), per flow.
const sysKeys = {};
for (const line of readFileSync(REQUESTS, "utf8").split("\n")) {
  if (!line) continue;
  const o = JSON.parse(line);
  if (o.method !== "GET" || o.status !== 200 || typeof o.res !== "object" || !o.res) continue;
  const m = o.path.match(/^\/(?:process\/2\/[^/]+\/admin|form\/2\/[^/]+)\/([A-Za-z_0-9]+)\/[A-Za-z0-9_]+\?/);
  if (!m) continue;
  for (const k of Object.keys(o.res)) if (k.startsWith("_") || k === "Name") (sysKeys[m[1]] ??= new Set()).add(k);
}

const label = { case: "CIQ Case", review: "CIQ Review", op: "CIQ Open Point", audit: "CIQ Audit Event", note: "CIQ Internal Note", rmesSAF: "CIQ RMES Safety", rmesREG: "CIQ RMES Regulatory", supplier: "CIQ Supplier", config: "CIQ Config Version" };
/**
 * Two closed open points on the completed case ZZT-0005, so part 4 of its document has content (rawFixtures gives
 * open points to ZZT-0003 only). Shapes are the fixtures' own CIQ Open Point and 'op.raised' audit rows:
 * - OP-0005-01, an RMM query: answered with an attachment, returned (round 2), changed by the raiser (AS-08), answered,
 *   accepted;
 * - OP-0005-02, a Safety document request: cannot provide, then closed as not accepted. Its internal note and
 *   Outcome_Reason must never reach the document.
 */
function addClosedPoints(items) {
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const user = (id, name) => ({ _id: id, Name: name, Kind: "User" });
  const katrin = user("UsRmmKatrin", "Katrin Vogel");
  const mira = user("UsSafMira", "Dr. Mira Hansen");
  const base = items.op.find((o) => o.OP_Key === "OP-0003-03");
  const row = items.audit.find((r) => r.Action_Code === "op.raised");
  if (!base || !row) throw new Error("rawFixtures changed: no OP-0003-03 or op.raised row to copy");
  const msg = (key, n, at, by, side, action, text, extra = {}) => ({ id: `${key}-m${n}`, at, by, side, action, text, ...extra });
  const point = (p) => {
    const it = clone(base);
    for (const k of ["_current_context", "Portal_Query_Item_Id"]) delete it[k];
    return Object.assign(it, {
      _id: p.id, _status: "Completed", _current_step: "End", _created_at: p.thread[0].at.replace(".000Z", "Z"), _modified_at: p.closedAt, _created_by: p.by, _modified_by: p.by,
      OP_Key: p.key, Round_No: p.rounds, Query_Key: `${p.key}-R${p.rounds}`, Case_Code: "ZZT-0005", Case_Item_Id: "AppZZT-0005",
      OP_Kind: p.kind, OP_Dept: p.dept, Raised_By_Dept: p.dept, Ref_Section_Key: p.section, Ref_Label: p.label, Question_Text: p.thread[0].text,
      Responsible_User: p.by, Responsible_Name: p.by.Name, Responsible_Dept_Label: p.deptLabel, Supplier_Due_Date: "2026-10-27",
      OP_Progress: "In progress", Response_Kind: p.responseKind, Response_Text: p.responseText, Response_Doc_Refs_JSON: "[]", Supplier_Responsible_Email: p.responder,
      OP_Outcome: p.outcome, Closed_At: p.closedAt, Closed_By: p.by, Raised_By_User: p.by, Raised_By_Name: p.by.Name, Raiser_Assignee: [{ _id: p.by._id }],
      Thread_JSON: JSON.stringify({ thread: p.thread, edits: [] }),
      ...(p.reason ? { Outcome_Reason: p.reason } : {}),
    });
  };
  const k1 = "OP-0005-01";
  const k2 = "OP-0005-02";
  const points = [
    point({
      id: "PkOpOP000501", key: k1, kind: "Query", dept: "RMM", deptLabel: "Raw Material Management", section: "K1", label: "K1 › specification", by: katrin, rounds: 2,
      responseKind: "Answered", responseText: "24 months from production.", responder: "ravi.menon@solvaro.example", outcome: "Accepted", closedAt: "2026-10-20T12:00:00Z",
      thread: [
        msg(k1, 1, "2026-10-20T08:00:00.000Z", "UsRmmKatrin", "internal", "raised", "Please confirm the shelf life stated on the specification."),
        msg(k1, 2, "2026-10-20T09:00:00.000Z", "UsElena", "supplier", "answered", "See the attached statement.", { documentId: "ZZT-0005-d3" }),
        msg(k1, 3, "2026-10-20T10:00:00.000Z", "UsRmmKatrin", "internal", "returned", "The statement gives no shelf life. Please state it.", { newRound: true }),
        msg(k1, 4, "2026-10-20T10:05:00.000Z", "UsRmmKatrin", "internal", "edited", "Due date changed to 27 Oct 2026."),
        msg(k1, 5, "2026-10-20T11:00:00.000Z", "UsRavi", "supplier", "answered", "24 months from production."),
        msg(k1, 6, "2026-10-20T12:00:00.000Z", "UsRmmKatrin", "internal", "accepted", "Accepted."),
      ],
    }),
    point({
      id: "PkOpOP000502", key: k2, kind: "Document request", dept: "SAF", deptLabel: "Product Safety", section: "K4.1", label: "K4.1 › toxicity data", by: mira, rounds: 1,
      responseKind: "Cannot provide", responseText: "No dossier exists for this grade.", responder: "elena.marquez@solvaro.example", outcome: "Not accepted", closedAt: "2026-10-20T11:30:00Z",
      reason: "ZZT internal reason: never in the document",
      thread: [
        msg(k2, 1, "2026-10-20T08:30:00.000Z", "UsSafMira", "internal", "raised", "Please send the full toxicological dossier."),
        msg(k2, 2, "2026-10-20T09:30:00.000Z", "UsElena", "supplier", "cannot-provide", "No dossier exists for this grade."),
        msg(k2, 3, "2026-10-20T11:30:00.000Z", "UsSafMira", "internal", "note", "ZZT internal note: never in the document"),
      ],
    }),
  ];
  items.op.push(...points);
  // their 'op.raised' history rows (the service finds the points through them when the q search finds nothing)
  points.forEach((p, i) => {
    const r = clone(row);
    const at = p._created_at;
    const snap = JSON.parse(r.Snapshot_JSON);
    const first = JSON.parse(p.Thread_JSON).thread[0];
    snap.audit = [{ ...snap.audit[0], id: `ZZT-0005-op${i + 1}`, at: first.at, by: p.Raised_By_User._id, detail: `${p.OP_Key} on ${p.Ref_Label}: ${p.Question_Text}`, sectionId: p.Ref_Section_Key }];
    snap.op = { ...snap.op, id: p.OP_Key, caseId: "ZZT-0005", dept: p.OP_Dept, kind: p.OP_Kind === "Query" ? "query" : "document-request", ref: { sectionId: p.Ref_Section_Key, label: p.Ref_Label }, question: p.Question_Text, responsibleId: p.Raised_By_User._id, dueDate: "2026-10-27T08:00:00.000Z", createdAt: first.at, createdBy: p.Raised_By_User._id, thread: [first] };
    Object.assign(r, {
      _id: `PkEvZZT0005op${i + 1}`, _created_at: at, _modified_at: at, _created_by: p.Raised_By_User, _modified_by: p.Raised_By_User,
      Event_Key: `EV-ZZT-0005-${at.replace(/\D/g, "").slice(0, 14)}-op${i + 1}`, Case_Code: "ZZT-0005", Case_Item_Id: "AppZZT-0005", Event_At: at,
      Actor_Name: p.Raised_By_Name, Actor_Dept: p.OP_Dept, Object_Key: p.OP_Key, Object_Item_Id: p._id, Ref_Item_Id: p._id,
      New_Value_Text: snap.audit[0].detail, Snapshot_JSON: JSON.stringify(snap),
    });
    for (const k of ["Actor_Email", "Actor_Role_Id"]) delete r[k];
    items.audit.push(r);
  });
}

let counter = 0;
/** The system fields a live admin read adds (values plausible, fictional). */
function liveSystem(flow, it) {
  const process = !!KIND[flow];
  const done = it._status === "Completed";
  const extra = {
    Name: it.Name ?? `${label[flow]} ${it.Case_Code ?? it.Event_Key ?? it.Config_Key ?? it.Supplier_Code ?? ""}`.trim(),
    _flow_name: label[flow],
    _application_id: "CIQ_Digital_A00",
    _flow_type: process ? "Process" : "Form",
    _doc_version: 1,
    ...(process
      ? {
          _stage: done ? "Completed" : "InProgress",
          _counter: ++counter,
          _progress: done ? 100 : 50,
          _root_process_instance: it._id,
          _meta_version: "1792443489369723",
          ...(done ? { _completed_at: it._modified_at, _last_completed_step: "End" } : { _current_assigned_to: [it._created_by] }),
        }
      : {}),
  };
  const known = sysKeys[FLOW_IDS[flow]];
  const out = { ...it };
  for (const [k, v] of Object.entries(extra)) if (out[k] === undefined && (!known || known.has(k) || k === "Name")) out[k] = v;
  return out;
}

const raw = fx.harnessFixtures().items;
addClosedPoints(raw);
const db = {};
const problems = [];
for (const flow of Object.keys(FLOW_IDS)) {
  const fields = liveFields(flow);
  db[flow] = (raw[flow] ?? []).map((it) => {
    for (const k of Object.keys(it)) {
      if (k.startsWith("_") || k === "Name") continue;
      const field = k.startsWith("Table::") ? null : k;
      if (field && !fields.has(field)) problems.push(`${flow} ${it._id}: ${k} is not a live ${FLOW_IDS[flow]} field`);
    }
    return liveSystem(flow, it);
  });
}
if (problems.length) {
  console.error(problems.join("\n"));
  throw new Error(`${problems.length} fixture field(s) differ from the live field lists`);
}

// ---------------------------------------------------------------- the app's own document (the RMM screen, full read)

const snap = fx.fixtureSnapshot("rmm", "full");
snap.items = { case: db.case, review: db.review, op: db.op };
snap.forms = { audit: db.audit, note: db.note, rmesSAF: db.rmesSAF, rmesREG: db.rmesREG, supplier: db.supplier, config: db.config };
const identity = fx.fixtureIdentity(["rmm"]);
const app = fx.toAppState({ snap, identity, acting: fx.fixtureActing(identity, "rmm") });
const done = app.state.cases.find((c) => c.id === "ZZT-0005");
if (!done?.finalDocument) throw new Error("the fixture case ZZT-0005 has no final document in the app's view");

const sha = (p) => createHash("sha256").update(readFileSync(p)).digest("hex").slice(0, 16);
const out = {
  note: "Generated by test/make-fixtures.mjs from prototype/src/app-live/testing/rawFixtures.ts (fictional ZZT data). Do not edit.",
  sources: { rawFixtures: sha(resolve(root, "prototype/src/app-live/testing/rawFixtures.ts")), toAppState: sha(resolve(root, "prototype/src/app-live/map/toAppState.ts")), finalDocument: sha(resolve(root, "prototype/src/domain/finalDocument.ts")), makeFixtures: sha(fileURLToPath(import.meta.url)) },
  loadedAt: snap.loadedAt,
  db,
  expected: { "ZZT-0005": { view: "rmm, full read", doc: done.finalDocument } },
};
const target = resolve(here, "fixtures/kissflow.json");
mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, JSON.stringify(out, null, 1) + "\n");
const counts = Object.fromEntries(Object.entries(db).map(([k, v]) => [k, v.length]));
console.log(`test/fixtures/kissflow.json written (${readFileSync(target).length} bytes): ${JSON.stringify(counts)}; ZZT-0005 seal ${done.finalDocument.fingerprint}`);
if (!existsSync(target)) throw new Error("not written");
