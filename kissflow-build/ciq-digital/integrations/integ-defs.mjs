// The app session's six hand-off integrations: their definitions (moved out of build.mjs on 21 Oct, unchanged, so that
// apply-harden.mjs and its offline test can use them without importing build.mjs, which runs its CLI on import and reads
// .env through integ-lib.mjs). Pure data: no Kissflow call, no file read.
export const APP = "CIQ_Digital_A00";
export const OP = ["CIQ_Open_Point_A00", "CIQ Open Point - CIQ Digital"];
export const CASE = ["CIQ_Case_A00", "CIQ Case - CIQ Digital"];
export const QUERY = ["CIQP_Query_A00", "CIQP Query - CIQ Supplier Portal"];
export const REQUEST = ["CIQP_Request_A00", "CIQP Request - CIQ Supplier Portal"];

// trigger key in the payload → the app item the integration searches; then the script; then the target actions.
// harden (21 Oct, HARDENING.md): the portal target the second search reads, by the same payload id, before the script
// (its Data becomes the script input of that name; the script is scripts/harden/<code>). The scripts' outputs are
// unchanged, except release.requested's, which also clears Release_By_Email and Release_By_Role (21 Oct, REQ-PROC-042):
// harden.clear maps them on the hardened draft (MAPS lists them too); and op.round's, which also copies the point's
// Raised_By_Email to the query (22 Oct, build.mjs MAPS).
export const DEFS = {
  opRound: {
    name: "CIQ op.round Open point question to supplier",
    desc: "Plan v6 §4.1 op.round: the app posts {opItemId}; the open point's own fields become a CIQP Query round (create and submit) and its id is stored on the point.",
    key: "opItemId", search: OP, code: "op-round.js",
    targets: [
      { id: "Action_OR_create_query", act: "create", process: QUERY },
      { id: "Action_OR_store_query_id", act: "update", process: OP },
    ],
    // twin search: no second query for the round's Query_Key; map (22 Oct): the raiser's e-mail onto the query
    harden: { read: QUERY, input: "queries", map: { Action_OR_create_query: ["Raised_By_Email"] } },
  },
  opEdited: {
    name: "CIQ op.edited Open point question edited",
    desc: "Plan v6 §4.1 op.edited: the app posts {opItemId}; the point's query (Portal_Query_Item_Id) gets its current question, justification and due date.",
    key: "opItemId", search: OP, code: "op-edited.js",
    targets: [{ id: "Action_OE_update_query", act: "update", process: QUERY }],
    harden: { read: QUERY, input: "queries" }, // reverse link: the query's App_Open_Point_Id
  },
  opClosed: {
    name: "CIQ op.closed Open point closed",
    desc: "Plan v6 §4.1 op.closed: the app posts {opItemId}; only a point with an outcome ends its query (skip and complete).",
    key: "opItemId", search: OP, code: "op-closed.js",
    targets: [{ id: "Action_OC_complete_query", act: "skip", process: QUERY }],
    harden: { read: QUERY, input: "queries" },
  },
  release: {
    name: "CIQ release.requested Final release requested",
    desc: "Plan v6 §4.1 I-5 release.requested: the app posts {caseItemId}; the case's request gets Release_Flag Requested, the lock and Release_Contacts from the case.",
    key: "caseItemId", search: CASE, code: "case-release.js",
    // 20 Oct review (portal session, HIGH): the case records when Beiersdorf asked (I-7 requires it), then the request
    targets: [{ id: "Action_RR_stamp_case", act: "update", process: CASE }, { id: "Action_RR_update_request", act: "update", process: REQUEST }],
    // reverse link: the request's App_Case_Item_Id; its Case_Phase_Label. clear: the two CIQP Request fields the portal
    // session added 21 Oct (Release_By_Name's step permissions), cleared with null like Release_At / Release_By_Name
    harden: { read: REQUEST, input: "requests", clear: { Action_RR_update_request: ["Release_By_Email", "Release_By_Role"] } },
  },
  history: {
    name: "CIQ history.updated Questions history to supplier",
    desc: "Plan v6 §4.1 history.updated: the app posts {caseItemId, questionsHistoryJson}; the case's request gets Questions_History_JSON.",
    key: "caseItemId", search: CASE, code: "case-history.js", extraInputs: ["questionsHistoryJson"],
    targets: [{ id: "Action_HU_update_request", act: "update", process: REQUEST }],
    harden: { read: REQUEST, input: "requests" },
  },
  cancelled: {
    name: "CIQ case.cancelled Case cancelled",
    desc: "Plan v6 §4.1 case.cancelled: the app posts {caseItemId, phaseLabel, locked}; the case's request gets the label and lock (known values only).",
    key: "caseItemId", search: CASE, code: "case-cancelled.js", extraInputs: ["phaseLabel", "locked"],
    targets: [{ id: "Action_CC_update_request", act: "update", process: REQUEST }],
    harden: { read: REQUEST, input: "requests" },
  },
};

/** The step ids build.mjs gives every integration (stage skeleton) and the hardened draft's second search. */
export const idsOf = (K) => ({ T: `Trigger_${K}_webhook`, S1: `Action_${K}_read_app_item`, S2: `Action_${K}_read_target`, PS: `Action_${K}_pick` });

/** The spec harden.mjs takes (build.mjs stages harden / harden-apply, apply-harden.mjs). */
export function hardenSpecOf(K) {
  const d = DEFS[K];
  if (!d) throw new Error(`unknown integration key ${K}`);
  const { T, S1, S2, PS } = idsOf(K);
  return { trigger: T, s1: S1, s2: S2, ps: PS, targets: d.targets.map((t) => t.id), key: d.key, extraInputs: d.extraInputs, read: d.harden.read, input: d.harden.input, code: d.code, clear: d.harden.clear || {}, map: d.harden.map || {} };
}
