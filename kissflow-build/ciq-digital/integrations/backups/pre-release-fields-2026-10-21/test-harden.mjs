// Offline test of the 21 Oct hardening (HARDENING.md); plain node, no Kissflow call (fetch is disabled), fictional ZZT data.
//   node kissflow-build/ciq-digital/integrations/test-harden.mjs
// 1. Scripts: each hardened script (scripts/harden/) runs as Kissflow's Run script does (inputData in, return out, a throw
//    fails the run) on the accept case and every refuse case. The built script (scripts/) runs on the same input: an accept
//    must give the same output (so MAPS stay valid), a NEW guard must be one the built script let through, and an old
//    refusal must still refuse.
// 2. Drafts: harden.mjs on each snapshot draft (night-2026-10-21/snapshot, read 21 Oct 02:2x): the hardened shape, only the
//    expected entities touched, refusals on a manual change, idempotence, and an offline run of the whole chain in which
//    the script's inputs and the targets' mappings are resolved from the hardened draft's own context paths.
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
const sameOut = (a, b) => { const strip = (o) => Object.fromEntries(Object.entries(o).filter(([k]) => !TIMES.includes(k))); return JSON.stringify(strip(a)) === JSON.stringify(strip(b)) && TIMES.every((k) => !(k in a) || STAMP.test(a[k])); };

// ---- fictional fixtures, in the shape of the stored search rows (test-*-test.json): every row carries _status ----
const ME = "UsZZT00000001";
const point = (o = {}) => ({ _id: "ZZT_OP_1", _status: "InProgress", OP_Key: "ZZT-H-OP-1", Round_No: 2, Query_Key: "ZZT-H-OP-1-R2", Case_Code: "ZZT-H-C1", Cycle_No: 1, Supplier_Code: "ZZT-SUP-DEV",
  Kind_Label: "Question", Responsible_Dept_Label: "Quality Management", Responsible_Name: "ZZT Quentin Test (fictional)", Ref_Kind: "Section", Ref_Label: "K4 · ZZT test section", Ref_Section_Key: "K4",
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
    if (want === true) check(`accept: ${name} (same output as the built script)`, h.ok && b.ok && sameOut(h.out, b.out), { hardened: h.err ?? h.out, built: b.err ?? b.out });
    else if (added) check(`refuse (new guard): ${name}`, !h.ok && want.test(h.err) && b.ok, { hardened: h.err ?? "ACCEPTED", built: b.ok ? "accepted" : b.err });
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
  release: { id: "CIQ_release_requested_Final_releas_A00", key: "caseItemId", code: "case-release.js", read: ["CIQP_Request_A00", "CIQP Request - CIQ Supplier Portal"], input: "requests", targets: ["Action_RR_stamp_case", "Action_RR_update_request"],
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
  const spec = { trigger: `Trigger_${K}_webhook`, s1: `Action_${K}_read_app_item`, s2: `Action_${K}_read_target`, ps: `Action_${K}_pick`, targets: w.targets, key: w.key, extraInputs: w.extra, read: w.read, input: w.input, code: w.code };
  const code = { from: text(`./scripts/${w.code}`), to: text(`./scripts/harden/${w.code}`) };
  const r = hardenDraft(draft, spec, code, newId);
  const b = r.blob;
  check("the snapshot draft is not hardened yet (sanity)", checkHardened(draft, spec, code.to).length > 0);
  check("the hardened draft has the hardened shape, wiring and integrity", checkHardened(b, spec, code.to).length === 0, checkHardened(b, spec, code.to));
  check("7 new entities: 1 Action, 3 FieldMapping, 3 Property", r.added.length === 7 && r.added.every((x) => b[x] && !draft[x]) && r.added.filter((x) => b[x].Kind === "Action").length === 1 && r.added.filter((x) => b[x].Kind === "FieldMapping").length === 3, r.added);
  const touched = Object.keys(b).filter((k) => !r.added.includes(k) && JSON.stringify(b[k]) !== JSON.stringify(draft[k]));
  check("only the root, the script's input list and code, and the actions' Output/IsTested change", touched.every((k) => r.changed.includes(k)) && touched.filter((k) => b[k]?.Kind === "Action").every((k) => JSON.stringify({ ...draft[k], Output: undefined, IsTested: undefined }) === JSON.stringify({ ...b[k], Output: undefined, IsTested: undefined })), touched);
  check("the webhook trigger (captured Output, IsTested) is untouched", JSON.stringify(b[spec.trigger]) === JSON.stringify(draft[spec.trigger]) && b[spec.trigger].IsTested === true);
  check("every action is untested", (b[b.Root]["Integration::Action"] || []).every((a) => b[a].IsTested === undefined && b[a].Output === undefined));
  check("the target actions' mappings are untouched", w.targets.every((t) => (b[t]["Action::FieldMapping"] || []).every((fm) => JSON.stringify(b[fm]) === JSON.stringify(draft[fm]) && props(b, fm).every((p) => JSON.stringify(p) === JSON.stringify(draft[p.Id])))));
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
  const bad = chain(w.refuse);
  check(`offline chain: the refuse case stops at the script (${bad.res.err?.slice(0, 70)}…)`, !bad.res.ok);
}

console.log(`\n${fail ? "FAILED" : "ALL PASSED"}: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
