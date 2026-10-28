// Offline test of the 21 Oct hardening (HARDENING.md); plain node, no Kissflow call (fetch is disabled), fictional ZZT data.
//   node kissflow-build/ciq-digital/integrations/test-harden.mjs
// 1. Scripts: each hardened script (scripts/harden/) runs as Kissflow's Run script does (inputData in, return out, a throw
//    fails the run) on the accept case and every refuse case. The built script (scripts/) runs on the same input: an accept
//    must give the same output (so MAPS stay valid; release.requested adds only Release_By_Email and Release_By_Role, both
//    null), a NEW guard must be one the built script let through, and an old refusal must still refuse.
// 2. Drafts: harden.mjs on each snapshot draft (night-2026-10-21/snapshot, read 21 Oct 02:2x): the hardened shape, only the
//    expected entities touched, refusals on a manual change, idempotence, and an offline run of the whole chain in which
//    the script's inputs and the targets' mappings are resolved from the hardened draft's own context paths (release:
//    Release_At, Release_By_Name, Release_By_Email and Release_By_Role resolve to null).
import { readFileSync } from "node:fs";
import { hardenDraft, checkHardened, integrity, wiring } from "./harden.mjs";

globalThis.fetch = () => { throw new Error("test-harden is offline: no Kissflow call"); };
const here = (f) => new URL(f, import.meta.url);
const text = (f) => readFileSync(here(f), "utf8");
let pass = 0, fail = 0;
const check = (name, ok, detail) => { ok ? pass++ : fail++; console.log(`  ${ok ? "ok  " : "FAIL"} ${name}${ok || detail === undefined ? "" : " — " + JSON.stringify(detail).slice(0, 400)}`); };
/** Kissflow's Run script: the code is a function body over inputData that returns an object or throws. */
const run = (code, inputData) => { try { return { ok: true, out: new Function("inputData", code)(structuredClone(inputData)) }; } catch (e) { return { ok: false, err: e.message }; } };
const STAMP = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/;
const TIMES = ["Edited_At", "releaseRequestedAt"];
// key order doesn't matter to a mapping: compared sorted
const sameOut = (a, b) => { const strip = (o) => Object.fromEntries(Object.entries(o).filter(([k]) => !TIMES.includes(k)).sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0))); return JSON.stringify(strip(a)) === JSON.stringify(strip(b)) && TIMES.every((k) => !(k in a) || STAMP.test(a[k])); };
// 21 Oct (REQ-PROC-042): the only keys a hardened script adds to the built one's output; and what it must clear (null)
// the hardened scripts' outputs the built ones lack: release.requested clears two fields (21 Oct); op.round copies the
// raiser's e-mail onto the query (22 Oct)
const NEW_KEYS = { "case-release.js": { Release_By_Email: null, Release_By_Role: null }, "op-round.js": { Raised_By_Email: "zzt.quentin@example.invalid" } };
const NULLS = { "case-release.js": ["Release_At", "Release_By_Name", "Release_By_Email", "Release_By_Role"] };

// ---- fictional fixtures, in the shape of the stored search rows (test-*-test.json): every row carries _status ----
const ME = "UsZZT00000001";
const point = (o = {}) => ({ _id: "ZZT_OP_1", _status: "InProgress", OP_Key: "ZZT-H-OP-1", Round_No: 2, Query_Key: "ZZT-H-OP-1-R2", Case_Code: "ZZT-H-C1", Cycle_No: 1, Supplier_Code: "ZZT-SUP-DEV",
  Kind_Label: "Question", Responsible_Dept_Label: "Quality Management", Responsible_Name: "ZZT Quentin Test (fictional)", Raised_By_Email: "zzt.quentin@example.invalid", Ref_Kind: "Section", Ref_Label: "K4 · ZZT test section", Ref_Section_Key: "K4",
  Question_Text: "ZZT round-2 question (fictional).", Supplier_Justification: "ZZT justification (fictional).", Supplier_Due_Date: "2026-11-04", Portal_Contact_Ids: ME, Portal_Query_Item_Id: "ZZT_Q_R1", ...o });
const query = (o = {}) => ({ _id: "ZZT_Q_R1", _status: "Completed", App_Open_Point_Id: "ZZT_OP_1", Query_Key: "ZZT-H-OP-1-R1", Round_No: 1, ...o });
const kase = (o = {}) => ({ _id: "ZZT_CASE_1", _status: "InProgress", Case_Code: "ZZT-H-C1", Cycle_No: 1, Case_Phase: "Review", Portal_Request_Item_Id: "ZZT_REQ_1", Release_Assignees_JSON: JSON.stringify([{ _id: ME }]), ...o });
const request = (o = {}) => ({ _id: "ZZT_REQ_1", _status: "InProgress", App_Case_Item_Id: "ZZT_CASE_1", Case_Code: "ZZT-H-C1", Case_Phase_Label: "Filling in", ...o });
const foreignQuery = query({ _id: "ZZT_Q_OTHER", App_Open_Point_Id: "ZZT_OP_OTHER", Query_Key: "ZZT-H-OP-9-R1", _status: "InProgress" });
const foreignRequest = request({ _id: "ZZT_REQ_OTHER", App_Case_Item_Id: "ZZT_CASE_OTHER", Case_Code: "ZZT-H-C9" });
const hist = JSON.stringify([{ opKey: "ZZT-H-OP-1", round: 1, question: "ZZT question (fictional)", answer: "ZZT answer", outcome: "Accepted" }]);

// accept: true, or the refusal the hardened script must give (a RegExp); added: a guard the built script didn't have
const CASES = {
  "op-round.js": [
    ["round 2: only round 1's query exists", { opItemId: "ZZT_OP_1", rows: [point()], queries: [query()] }, true],
    ["round 1: no query yet (search Data [])", { opItemId: "ZZT_OP_1", rows: [point({ Round_No: 1, Query_Key: "ZZT-H-OP-1-R1", Portal_Query_Item_Id: "" })], queries: [] }, true],
    ["round 1: the empty search arrives as \"\"", { opItemId: "ZZT_OP_1", rows: [point({ Round_No: 1, Query_Key: "ZZT-H-OP-1-R1", Portal_Query_Item_Id: "" })], queries: "" }, true],
    ["round 1: the empty search arrives undefined", { opItemId: "ZZT_OP_1", rows: [point({ Round_No: 1, Query_Key: "ZZT-H-OP-1-R1", Portal_Query_Item_Id: "" })] }, true],
    ["rows and queries arrive as JSON text", { opItemId: "ZZT_OP_1", rows: JSON.stringify([point()]), queries: JSON.stringify([query()]) }, true],
    ["Completed point without OP_Outcome (pass 1: REST submit ignores Mandatory)", { opItemId: "ZZT_OP_1", rows: [point({ _status: "Completed" })], queries: [query()] }, /is Completed: no new round/, "added"],
    ["a point row without _status", { opItemId: "ZZT_OP_1", rows: [point({ _status: undefined })], queries: [query()] }, /is \(no status\): no new round/, "added"],
    ["resent round: its query exists and is linked", { opItemId: "ZZT_OP_1", rows: [point({ Portal_Query_Item_Id: "ZZT_Q_R2" })], queries: [query(), query({ _id: "ZZT_Q_R2", Query_Key: "ZZT-H-OP-1-R2", Round_No: 2, _status: "InProgress" })] }, /already has CIQP Query ZZT_Q_R2 for ZZT-H-OP-1-R2/, "added"],
    ["retry after a failed link: the round's query exists, unlinked", { opItemId: "ZZT_OP_1", rows: [point()], queries: [query(), query({ _id: "ZZT_Q_R2", Query_Key: "ZZT-H-OP-1-R2", Round_No: 2, _status: "InProgress" })] }, /already has CIQP Query ZZT_Q_R2/, "added"],
    ["twin by the derived key (point without Query_Key)", { opItemId: "ZZT_OP_1", rows: [point({ Query_Key: "" })], queries: JSON.stringify([query({ _id: "ZZT_Q_R2", Query_Key: "ZZT-H-OP-1-R2" })]) }, /already has CIQP Query ZZT_Q_R2/, "added"],
    ["the query search is unreadable text", { opItemId: "ZZT_OP_1", rows: [point()], queries: "not json {" }, /search of its CIQP Queries is unreadable/, "added"],
    ["the query search is an object, not a list", { opItemId: "ZZT_OP_1", rows: [point()], queries: { _id: "ZZT_Q_R1" } }, /unreadable/, "added"],
    ["InProgress point with an outcome", { opItemId: "ZZT_OP_1", rows: [point({ OP_Outcome: "Withdrawn" })], queries: [query()] }, /is closed \(Withdrawn\): no new round/],
    ["no portal contact", { opItemId: "ZZT_OP_1", rows: [point({ Portal_Contact_Ids: "" })], queries: [] }, /names no portal contact/],
    ["an id the search didn't return", { opItemId: "ZZT_OP_X", rows: [point()], queries: [] }, /CIQ Open Point ZZT_OP_X was not found/],
    ["no id", { opItemId: "", rows: [point()], queries: [] }, /\(no id\) was not found/],
  ],
  "op-edited.js": [
    ["the linked query names the point back", { opItemId: "ZZT_OP_1", rows: [point({ Portal_Query_Item_Id: "ZZT_Q_R2" })], queries: [query(), query({ _id: "ZZT_Q_R2", Query_Key: "ZZT-H-OP-1-R2", _status: "InProgress" })] }, true],
    ["queries arrive as JSON text", { opItemId: "ZZT_OP_1", rows: [point()], queries: JSON.stringify([query({ _status: "InProgress" })]) }, true],
    ["Completed point without OP_Outcome", { opItemId: "ZZT_OP_1", rows: [point({ _status: "Completed" })], queries: [query()] }, /is Completed: nothing to edit/, "added"],
    ["preset Portal_Query_Item_Id: another point's query", { opItemId: "ZZT_OP_1", rows: [point({ Portal_Query_Item_Id: "ZZT_Q_OTHER" })], queries: [query(), foreignQuery] }, /CIQP Query ZZT_Q_OTHER does not name open point ZZT-H-OP-1 \(ZZT_OP_1\) back/, "added"],
    ["preset Portal_Query_Item_Id the search doesn't return", { opItemId: "ZZT_OP_1", rows: [point({ Portal_Query_Item_Id: "ZZT_Q_GHOST" })], queries: [query()] }, /ZZT_Q_GHOST does not name open point/, "added"],
    ["empty query search", { opItemId: "ZZT_OP_1", rows: [point()], queries: [] }, /does not name open point/, "added"],
    ["closed point", { opItemId: "ZZT_OP_1", rows: [point({ OP_Outcome: "Accepted" })], queries: [query()] }, /is closed \(Accepted\): nothing to edit/],
    ["no query yet", { opItemId: "ZZT_OP_1", rows: [point({ Portal_Query_Item_Id: "" })], queries: [] }, /has no supplier query yet/],
    ["an id the search didn't return", { opItemId: "ZZT_OP_X", rows: [point()], queries: [query()] }, /was not found/],
  ],
  "op-closed.js": [
    ["closed point (Completed: closing completes it) whose query names it back", { opItemId: "ZZT_OP_1", rows: [point({ _status: "Completed", OP_Outcome: "Accepted", Portal_Query_Item_Id: "ZZT_Q_R2" })], queries: [query(), query({ _id: "ZZT_Q_R2", Query_Key: "ZZT-H-OP-1-R2", _status: "InProgress" })] }, true],
    ["InProgress point with an outcome (admin PUT)", { opItemId: "ZZT_OP_1", rows: [point({ OP_Outcome: "Withdrawn" })], queries: JSON.stringify([query({ _status: "InProgress" })]) }, true],
    ["preset Portal_Query_Item_Id: another point's query", { opItemId: "ZZT_OP_1", rows: [point({ OP_Outcome: "Withdrawn", Portal_Query_Item_Id: "ZZT_Q_OTHER" })], queries: [query(), foreignQuery] }, /CIQP Query ZZT_Q_OTHER does not name open point/, "added"],
    ["preset Portal_Query_Item_Id the search doesn't return", { opItemId: "ZZT_OP_1", rows: [point({ OP_Outcome: "Withdrawn", Portal_Query_Item_Id: "ZZT_Q_GHOST" })], queries: [] }, /ZZT_Q_GHOST does not name open point/, "added"],
    ["no outcome", { opItemId: "ZZT_OP_1", rows: [point()], queries: [query()] }, /is still open: its query stays/],
    ["no query", { opItemId: "ZZT_OP_1", rows: [point({ OP_Outcome: "Withdrawn", Portal_Query_Item_Id: "" })], queries: [] }, /has no supplier query/],
    ["an id the search didn't return", { opItemId: "ZZT_OP_X", rows: [point()], queries: [] }, /was not found/],
  ],
  "case-release.js": [
    ["case in review, its request names it back", { caseItemId: "ZZT_CASE_1", rows: [kase()], requests: [request()] }, true],
    ["requests arrive as JSON text", { caseItemId: "ZZT_CASE_1", rows: [kase()], requests: JSON.stringify([request()]) }, true],
    ["case Case_Phase Cancelled", { caseItemId: "ZZT_CASE_1", rows: [kase({ Case_Phase: "Cancelled" })], requests: [request()] }, /Case ZZT-H-C1 is cancelled: no final release/, "added"],
    ["request Case_Phase_Label Cancelled", { caseItemId: "ZZT_CASE_1", rows: [kase()], requests: [request({ Case_Phase_Label: "Cancelled" })] }, /CIQP Request ZZT_REQ_1: the case was cancelled/, "added"],
    ["preset Portal_Request_Item_Id: another case's request", { caseItemId: "ZZT_CASE_1", rows: [kase({ Portal_Request_Item_Id: "ZZT_REQ_OTHER" })], requests: [request(), foreignRequest] }, /CIQP Request ZZT_REQ_OTHER does not name case ZZT-H-C1 \(ZZT_CASE_1\) back/, "added"],
    ["preset Portal_Request_Item_Id the search doesn't return", { caseItemId: "ZZT_CASE_1", rows: [kase({ Portal_Request_Item_Id: "ZZT_REQ_GHOST" })], requests: [request()] }, /ZZT_REQ_GHOST does not name case/, "added"],
    ["empty request search", { caseItemId: "ZZT_CASE_1", rows: [kase()], requests: [] }, /does not name case/, "added"],
    ["no release contact", { caseItemId: "ZZT_CASE_1", rows: [kase({ Release_Assignees_JSON: "[]" })], requests: [request()] }, /names no release contact/],
    ["no request", { caseItemId: "ZZT_CASE_1", rows: [kase({ Portal_Request_Item_Id: "" })], requests: [] }, /has no supplier request/],
    ["an id the search didn't return", { caseItemId: "ZZT_CASE_X", rows: [kase()], requests: [] }, /CIQ Case ZZT_CASE_X was not found/],
  ],
  "case-history.js": [
    ["history list, its request names the case back", { caseItemId: "ZZT_CASE_1", rows: [kase()], requests: [request()], questionsHistoryJson: hist }, true],
    ["history arrives as a list (not text)", { caseItemId: "ZZT_CASE_1", rows: [kase()], requests: JSON.stringify([request()]), questionsHistoryJson: JSON.parse(hist) }, true],
    ["preset Portal_Request_Item_Id: another case's request", { caseItemId: "ZZT_CASE_1", rows: [kase({ Portal_Request_Item_Id: "ZZT_REQ_OTHER" })], requests: [request(), foreignRequest], questionsHistoryJson: hist }, /ZZT_REQ_OTHER does not name case ZZT-H-C1/, "added"],
    ["preset Portal_Request_Item_Id the search doesn't return", { caseItemId: "ZZT_CASE_1", rows: [kase({ Portal_Request_Item_Id: "ZZT_REQ_GHOST" })], requests: [], questionsHistoryJson: hist }, /ZZT_REQ_GHOST does not name case/, "added"],
    ["history is not JSON", { caseItemId: "ZZT_CASE_1", rows: [kase()], requests: [request()], questionsHistoryJson: "not json {" }, /is not JSON/],
    ["history is an object", { caseItemId: "ZZT_CASE_1", rows: [kase()], requests: [request()], questionsHistoryJson: '{"a":1}' }, /is not a list/],
    ["no request", { caseItemId: "ZZT_CASE_1", rows: [kase({ Portal_Request_Item_Id: "" })], requests: [], questionsHistoryJson: hist }, /has no supplier request/],
    ["an id the search didn't return", { caseItemId: "ZZT_CASE_X", rows: [kase()], requests: [], questionsHistoryJson: hist }, /was not found/],
  ],
  "case-cancelled.js": [
    ["Cancelled + Yes, its request names the case back", { caseItemId: "ZZT_CASE_1", rows: [kase({ Case_Phase: "Cancelled" })], requests: [request()], phaseLabel: "Cancelled", locked: "Yes" }, true],
    ["a repeat on a request already labelled Cancelled", { caseItemId: "ZZT_CASE_1", rows: [kase()], requests: JSON.stringify([request({ Case_Phase_Label: "Cancelled" })]), phaseLabel: "Cancelled", locked: "Yes" }, true],
    ["preset Portal_Request_Item_Id: another case's request", { caseItemId: "ZZT_CASE_1", rows: [kase({ Portal_Request_Item_Id: "ZZT_REQ_OTHER" })], requests: [request(), foreignRequest], phaseLabel: "Cancelled", locked: "Yes" }, /ZZT_REQ_OTHER does not name case ZZT-H-C1/, "added"],
    ["preset Portal_Request_Item_Id the search doesn't return", { caseItemId: "ZZT_CASE_1", rows: [kase({ Portal_Request_Item_Id: "ZZT_REQ_GHOST" })], requests: [], phaseLabel: "Cancelled", locked: "Yes" }, /ZZT_REQ_GHOST does not name case/, "added"],
    ["another label", { caseItemId: "ZZT_CASE_1", rows: [kase()], requests: [request()], phaseLabel: "Completed", locked: "Yes" }, /phaseLabel "Completed" is not accepted/],
    ["unlocked", { caseItemId: "ZZT_CASE_1", rows: [kase()], requests: [request()], phaseLabel: "Cancelled", locked: "No" }, /locked "No" is not accepted/],
    ["no request", { caseItemId: "ZZT_CASE_1", rows: [kase({ Portal_Request_Item_Id: "" })], requests: [], phaseLabel: "Cancelled", locked: "Yes" }, /has no supplier request/],
    ["an id the search didn't return", { caseItemId: "ZZT_CASE_X", rows: [kase()], requests: [], phaseLabel: "Cancelled", locked: "Yes" }, /was not found/],
  ],
};

console.log("== 1. scripts (scripts/harden/ against scripts/, same input)");
for (const [file, cases] of Object.entries(CASES)) {
  const built = text(`./scripts/${file}`), hard = text(`./scripts/harden/${file}`);
  console.log(`-- ${file}`);
  for (const [name, input, want, added] of cases) {
    const h = run(hard, input), b = run(built, input);
    const plus = NEW_KEYS[file] ? `, plus ${Object.keys(NEW_KEYS[file]).join(", ")}` : "";
    if (want === true) {
      check(`accept: ${name} (same output as the built script${plus})`, h.ok && b.ok && Object.keys(NEW_KEYS[file] || {}).every((k) => !(k in b.out)) && sameOut(h.out, { ...b.out, ...NEW_KEYS[file] }), { hardened: h.err ?? h.out, built: b.err ?? b.out });
      if (NULLS[file]) check(`accept: ${name}: ${NULLS[file].join(", ")} are null (cleared)`, h.ok && NULLS[file].every((k) => k in h.out && h.out[k] === null), h.err ?? NULLS[file].map((k) => `${k}=${JSON.stringify(h.out[k])}`));
    } else if (added) check(`refuse (new guard): ${name}`, !h.ok && want.test(h.err) && b.ok, { hardened: h.err ?? "ACCEPTED", built: b.ok ? "accepted" : b.err });
    else check(`refuse (kept): ${name}`, !h.ok && want.test(h.err) && !b.ok, { hardened: h.err ?? "ACCEPTED", built: b.ok ? "ACCEPTED" : b.err });
  }
}

// ---- 2. drafts ----
// the expectations here are written independently of build.mjs DEFS: the app item and portal target each one must read
const SNAP = "../../night-2026-10-21/snapshot/CIQ_Digital_A00.integration.";
const WANT = {
  opRound: { id: "CIQ_op_round_Open_point_question_t_A00", key: "opItemId", code: "op-round.js", read: ["CIQP_Query_A00", "CIQP Query - CIQ Supplier Portal"], input: "queries", targets: ["Action_OR_create_query", "Action_OR_store_query_id"],
    ctx: { rows: [point({ Portal_Query_Item_Id: "" })], target: [query()] }, refuse: { rows: [point({ _status: "Completed" })], target: [query()] } },
  opEdited: { id: "CIQ_op_edited_Open_point_question__A00", key: "opItemId", code: "op-edited.js", read: ["CIQP_Query_A00", "CIQP Query - CIQ Supplier Portal"], input: "queries", targets: ["Action_OE_update_query"],
    ctx: { rows: [point()], target: [query({ _status: "InProgress" })] }, refuse: { rows: [point({ Portal_Query_Item_Id: "ZZT_Q_OTHER" })], target: [query(), foreignQuery] } },
  opClosed: { id: "CIQ_op_closed_Open_point_closed_A00", key: "opItemId", code: "op-closed.js", read: ["CIQP_Query_A00", "CIQP Query - CIQ Supplier Portal"], input: "queries", targets: ["Action_OC_complete_query"],
    ctx: { rows: [point({ OP_Outcome: "Withdrawn" })], target: [query({ _status: "InProgress" })] }, refuse: { rows: [point({ OP_Outcome: "Withdrawn", Portal_Query_Item_Id: "ZZT_Q_OTHER" })], target: [foreignQuery] } },
  // clear: the CIQP Request fields added 21 Oct, which the snapshot draft doesn't map yet; nulls: what the request update clears
  release: { id: "CIQ_release_requested_Final_releas_A00", key: "caseItemId", code: "case-release.js", read: ["CIQP_Request_A00", "CIQP Request - CIQ Supplier Portal"], input: "requests", targets: ["Action_RR_stamp_case", "Action_RR_update_request"],
    clear: { Action_RR_update_request: ["Release_By_Email", "Release_By_Role"] }, nulls: { Action_RR_update_request: ["Release_At", "Release_By_Name", "Release_By_Email", "Release_By_Role"] },
    ctx: { rows: [kase()], target: [request()] }, refuse: { rows: [kase()], target: [request({ Case_Phase_Label: "Cancelled" })] } },
  history: { id: "CIQ_history_updated_Questions_hist_A00", key: "caseItemId", code: "case-history.js", extra: ["questionsHistoryJson"], read: ["CIQP_Request_A00", "CIQP Request - CIQ Supplier Portal"], input: "requests", targets: ["Action_HU_update_request"],
    payload: { questionsHistoryJson: hist }, ctx: { rows: [kase()], target: [request()] }, refuse: { rows: [kase({ Portal_Request_Item_Id: "ZZT_REQ_OTHER" })], target: [request(), foreignRequest] } },
  cancelled: { id: "CIQ_case_cancelled_Case_cancelled_A00", key: "caseItemId", code: "case-cancelled.js", extra: ["phaseLabel", "locked"], read: ["CIQP_Request_A00", "CIQP Request - CIQ Supplier Portal"], input: "requests", targets: ["Action_CC_update_request"],
    payload: { phaseLabel: "Cancelled", locked: "Yes" }, ctx: { rows: [kase()], target: [request()] }, refuse: { rows: [kase({ Portal_Request_Item_Id: "ZZT_REQ_GHOST" })], target: [request()] } },
};
let seq = 0;
const newId = (p) => `${p}_zzt${(++seq).toString(36)}`;
const get = (o, path) => path.reduce((v, k) => (Array.isArray(v) ? v.map((x) => x?.[k]) : v?.[k]), o);
const props = (b, fmId) => (b[fmId]?.["FieldMapping::Property"] || []).map((p) => b[p]).filter(Boolean);

console.log("\n== 2. drafts (harden.mjs on the snapshot drafts of 21 Oct 02:2x)");
for (const [K, w] of Object.entries(WANT)) {
  console.log(`-- ${K} ${w.id}`);
  const draft = JSON.parse(text(`${SNAP}${w.id}.json`)).draft;
  const spec = { trigger: `Trigger_${K}_webhook`, s1: `Action_${K}_read_app_item`, s2: `Action_${K}_read_target`, ps: `Action_${K}_pick`, targets: w.targets, key: w.key, extraInputs: w.extra, read: w.read, input: w.input, code: w.code, clear: w.clear || {} };
  const code = { from: text(`./scripts/${w.code}`), to: text(`./scripts/harden/${w.code}`) };
  const r = hardenDraft(draft, spec, code, newId);
  const b = r.blob;
  const nc = Object.values(spec.clear).flat().length; // release: +1 FieldMapping and +1 Property per cleared field
  const fmsNamed = (blob, a, n) => (blob[a]["Action::FieldMapping"] || []).map((x) => blob[x]).filter((f) => f?.Name === n);
  check("the snapshot draft is not hardened yet (sanity)", checkHardened(draft, spec, code.to).length > 0);
  check("the hardened draft has the hardened shape, wiring and integrity", checkHardened(b, spec, code.to).length === 0, checkHardened(b, spec, code.to));
  check(`${7 + 2 * nc} new entities: 1 Action, ${3 + nc} FieldMapping, ${3 + nc} Property`, r.added.length === 7 + 2 * nc && r.added.every((x) => b[x] && !draft[x]) && r.added.filter((x) => b[x].Kind === "Action").length === 1 && r.added.filter((x) => b[x].Kind === "FieldMapping").length === 3 + nc && r.added.filter((x) => b[x].Kind === "Property").length === 3 + nc, r.added);
  const touched = Object.keys(b).filter((k) => !r.added.includes(k) && JSON.stringify(b[k]) !== JSON.stringify(draft[k]));
  // an action that clears a field also lists its new mappings: the old list, then only added ids
  const listOk = (k) => { const was = draft[k]["Action::FieldMapping"] || [], now = b[k]["Action::FieldMapping"] || []; return JSON.stringify(now.slice(0, was.length)) === JSON.stringify(was) && now.slice(was.length).every((x) => r.added.includes(x)) && (spec.clear[k] ? now.length === was.length + spec.clear[k].length : now.length === was.length); };
  check(`only the root, the script's input list and code, and the actions' Output/IsTested change${nc ? " (and the cleared fields' new mappings)" : ""}`, touched.every((k) => r.changed.includes(k)) && touched.filter((k) => b[k]?.Kind === "Action").every((k) => listOk(k) && JSON.stringify({ ...draft[k], Output: undefined, IsTested: undefined }) === JSON.stringify({ ...b[k], Output: undefined, IsTested: undefined, "Action::FieldMapping": draft[k]["Action::FieldMapping"] })), touched);
  check("the webhook trigger (captured Output, IsTested) is untouched", JSON.stringify(b[spec.trigger]) === JSON.stringify(draft[spec.trigger]) && b[spec.trigger].IsTested === true);
  check("every action is untested", (b[b.Root]["Integration::Action"] || []).every((a) => b[a].IsTested === undefined && b[a].Output === undefined));
  check("the target actions' existing mappings are untouched", w.targets.every((t) => (draft[t]["Action::FieldMapping"] || []).every((fm) => JSON.stringify(b[fm]) === JSON.stringify(draft[fm]) && props(b, fm).every((p) => JSON.stringify(p) === JSON.stringify(draft[p.Id])))));
  for (const [a, names] of Object.entries(spec.clear)) for (const n of names) {
    const [fm, ...more] = fmsNamed(b, a, n), p = fm && props(b, fm.Id);
    check(`new mapping ${a}.${n} = context.${spec.ps}.${n} (FieldId ${n}, String, "${n.replace(/_/g, " ")}"; the snapshot had none)`, !fmsNamed(draft, a, n).length && !more.length && fm?.FieldId === n && fm.Type === "String" && fm.Label === n.replace(/_/g, " ") && fm.Action === a && fm.IsRequired === false && p.length === 1 && p[0].Type === "Field" && p[0].Field === `context.${spec.ps}.${n}` && p[0].FieldMapping === fm.Id, { fm, p });
  }
  check("no reference reads a later step, before or after", wiring(draft).length === 0 && wiring(b).length === 0, wiring(b));
  check("no dangling or unreached entity, before or after", integrity(draft).problems.length === 0 && integrity(b).problems.length === 0 && integrity(b).unreached.length === integrity(draft).unreached.length, integrity(b));
  check("the draft it was given is not mutated", JSON.stringify(draft) === JSON.stringify(JSON.parse(text(`${SNAP}${w.id}.json`)).draft));
  let again; try { again = hardenDraft(b, spec, code, newId).already; } catch (e) { again = e.message; }
  check("applied twice: already hardened, nothing changes", again === true, again);
  const refuses = (label, mutate, re) => { const t = structuredClone(draft); mutate(t); let err = null; try { hardenDraft(t, spec, code, newId); } catch (e) { err = e; } check(`refuses a manual change: ${label}`, err !== null && re.test(err.message), err?.message ?? "applied"); return err; };
  const edited = refuses("the script code was edited in the builder", (t) => { const fm = t[spec.ps]["Action::FieldMapping"].map((x) => t[x]).find((f) => f.Name === "js_code"); const p = t[fm["FieldMapping::Property"][0]]; p.Code += "\n// manual"; }, /code differs from scripts\//);
  check("the code refusal carries the builder's change as a line diff (build.mjs prints it)", (edited?.diff || []).some((l) => /^\+\s*\d+ \/\/ manual$/.test(l)) && (edited?.diff || []).every((l) => l.startsWith("+")), edited?.diff);
  refuses("the run order was changed", (t) => { t[t.Root]["Integration::Action"] = [spec.ps, spec.s1, ...spec.targets]; }, /run order is/);
  refuses("a script input was added", (t) => { const fm = t[spec.ps]["Action::FieldMapping"].map((x) => t[x]).find((f) => f.Name === "input_fields"); t.FM_manual = { Id: "FM_manual", Kind: "FieldMapping", Name: "manual", FieldMapping: fm.Id }; fm["FieldMapping::FieldMapping"] = [...fm["FieldMapping::FieldMapping"], "FM_manual"]; }, /inputs are/);
  refuses("a half-done hardening (the step exists, the code is old)", (t) => { t[spec.s2] = { Id: spec.s2, Kind: "Action", Type: "Search" }; }, /partly hardened/);
  for (const [a, names] of Object.entries(spec.clear)) {
    const [n0, n1] = names, entry = (n, o = {}) => ({ Id: `FM_${n}`, Kind: "FieldMapping", Type: "String", FieldId: n, Label: n.replace(/_/g, " "), Name: n, IsRequired: false, Action: a, ...o });
    const addEntry = (t, fm, p) => { t[fm.Id] = fm; t[a]["Action::FieldMapping"] = [...t[a]["Action::FieldMapping"], fm.Id]; if (p) { t[p.Id] = p; fm["FieldMapping::Property"] = [p.Id]; } };
    refuses(`${n0} was mapped to something else in the builder`, (t) => addEntry(t, entry(n0), { Id: "P_manual", Kind: "Property", FieldMapping: `FM_${n0}`, Type: "Field", Field: `context.${spec.ps}.Release_By_Name`, Name: n0 }), new RegExp(`${a}\\.${n0} is already mapped to context\\.${spec.ps}\\.Release_By_Name`));
    // harden-apply passes the live field schema: a field that isn't published there stops it
    const schema = (ns, label) => ns.map((n) => ({ Kind: "Field", Id: n, Name: n, Label: label ? `${n} (${label})` : n.replace(/_/g, " "), Type: "String", IsRequired: false }));
    let err = null; try { hardenDraft(draft, spec, code, newId, { [a]: schema([n0]) }); } catch (e) { err = e.message; }
    check(`refuses: the live schema has no ${n1} (field not published)`, new RegExp(`${n1} is not in ${a}'s field schema`).test(err || ""), err ?? "applied");
    const live = hardenDraft(draft, spec, code, newId, { [a]: schema(names, "live") });
    check("with the live schema, the new entries take its FieldId, Label and Type", names.every((n) => fmsNamed(live.blob, a, n).length === 1 && fmsNamed(live.blob, a, n)[0].Label === `${n} (live)`) && checkHardened(live.blob, spec, code.to).length === 0, names.map((n) => fmsNamed(live.blob, a, n)));
    // a map run after the fields were published leaves an unbound entry for each: harden binds it, no second entry
    const t = structuredClone(draft); addEntry(t, entry(n0));
    const r2 = hardenDraft(t, spec, code, newId), bound = fmsNamed(r2.blob, a, n0);
    check(`an unbound ${n0} entry (a later map run) is bound, not duplicated`, bound.length === 1 && bound[0].Id === `FM_${n0}` && props(r2.blob, bound[0].Id)[0]?.Field === `context.${spec.ps}.${n0}` && r2.changed.includes(`FM_${n0}`) && checkHardened(r2.blob, spec, code.to).length === 0 && integrity(r2.blob).problems.length === 0, { bound, problems: checkHardened(r2.blob, spec, code.to) });
    // and a hardened draft that lost a cleared field's mapping is not "already hardened"
    const lost = structuredClone(b), lfm = fmsNamed(lost, a, n1)[0]; for (const p of lfm?.["FieldMapping::Property"] || []) delete lost[p]; if (lfm) lfm["FieldMapping::Property"] = [];
    let half; try { half = hardenDraft(lost, spec, code, newId).already; } catch (e) { half = e.message; }
    check(`a hardened draft whose ${n1} mapping was removed is "partly hardened"`, new RegExp(`partly hardened.*${a}\\.${n1} is not mapped`).test(String(half)), half);
  }

  // the chain offline: the script's inputs from the hardened draft's own mappings, the code from the draft, then every
  // target mapping that reads the script must find its value in the script's output
  const payload = { [w.key]: w.ctx.rows[0]._id, ...(w.payload || {}) };
  const chain = (c) => {
    const ctx = { [spec.trigger]: payload, [spec.s1]: { _id: "search", Data: c.rows }, [spec.s2]: { _id: w.read[0], Data: c.target } };
    const inputsFm = b[spec.ps]["Action::FieldMapping"].map((x) => b[x]).find((f) => f.Name === "input_fields");
    const inputData = Object.fromEntries(inputsFm["FieldMapping::FieldMapping"].map((x) => b[x]).map((f) => { const [, step, ...path] = props(b, f.Id)[0].Field.split("."); return [f.Name, get(ctx[step], path)]; }));
    const codeFm = b[spec.ps]["Action::FieldMapping"].map((x) => b[x]).find((f) => f.Name === "js_code");
    return { inputData, res: run(props(b, codeFm.Id)[0].Code, inputData) };
  };
  const ok = chain(w.ctx);
  check(`offline chain: inputs ${Object.keys(ok.inputData).join(", ")} resolve from the draft and the script accepts`, ok.res.ok, ok.res.err);
  const missing = [];
  for (const t of w.targets) for (const fm of b[t]["Action::FieldMapping"]) for (const p of props(b, fm)) {
    const m = p.Type === "Field" && new RegExp(`^context\\.${spec.ps}\\.(.+)$`).exec(p.Field);
    if (m && ok.res.ok && get(ok.res.out, m[1].split(".")) === undefined) missing.push(`${t}.${b[fm].Name} ← ${m[1]}`);
  }
  check("offline chain: every target mapping that reads the script finds its value", ok.res.ok && missing.length === 0, missing);
  for (const [a, names] of Object.entries(w.nulls || {})) {
    const got = names.map((n) => { const fm = fmsNamed(b, a, n)[0], f = fm && props(b, fm.Id)[0]?.Field, m = f && new RegExp(`^context\\.${spec.ps}\\.(.+)$`).exec(f); return [n, m && ok.res.ok ? get(ok.res.out, m[1].split(".")) : "(unmapped)"]; });
    check(`offline chain: ${a} sets ${names.join(", ")} to null (cleared)`, got.every(([, v]) => v === null), got);
  }
  const bad = chain(w.refuse);
  check(`offline chain: the refuse case stops at the script (${bad.res.err?.slice(0, 70)}…)`, !bad.res.ok);
}

console.log(`\n${fail ? "FAILED" : "ALL PASSED"}: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
