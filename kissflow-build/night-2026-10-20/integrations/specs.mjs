// The screen-started hand-offs this session builds (plan v6 §4, §4.1; split agreed with the app session on 20 Oct).
// Each is a webhook whose payload carries only the id of the item the screen acted on; every write target is read from
// Kissflow by the script steps. Built by webhook-integ.mjs.
const CASE = { process: "CIQ_Case_A00", label: "CIQ Case - CIQ Digital" };
const REQUEST = { process: "CIQP_Request_A00", label: "CIQP Request - CIQ Supplier Portal" };
const QUERY = { process: "CIQP_Query_A00", label: "CIQP Query - CIQ Supplier Portal" };
const OPEN_POINT = { process: "CIQ_Open_Point_A00", label: "CIQ Open Point - CIQ Digital" };
const SYNCED = ["Config_Answers_JSON", "Answers_JSON", "Answered_By_JSON", "Justifications_JSON", "Components_JSON", "Scope_JSON", "Requested_Docs_JSON", "Documents_JSON",
  "Answers_Rev", "Answers_Changed_At", "Answers_Changed_By_Email", "Change_Report_Text", "Change_Report_Rev", "Change_Report_By_Email", "Change_Report_At"];
const from = (step, ...fields) => Object.fromEntries(fields.map((f) => [f, { step, path: f }]));

export const SPECS = {
  // request.changed · portal · the supplier's screen after every save, upload, removal or change report: {portalRequestItemId}
  RC: {
    id: "CIQP_Request_changed_to_case_A00", app: "CIQ_Supplier_Portal_A00", name: "CIQP Request changed to case",
    desc: "Plan v6 §4.2 request.changed: the supplier's screen posts {portalRequestItemId}; the request's 15 answer fields are copied to the CIQ Case named by its App_Case_Item_Id, which must link exactly this request.",
    steps: [
      { tag: "request", kind: "search", ...REQUEST, lookup: { trigger: "portalRequestItemId" } },
      { tag: "pick", kind: "script", file: "scripts/rc-pick.js", inputs: { requestId: { trigger: "portalRequestItemId" }, rows: { rows: "request" } } },
      { tag: "case", kind: "search", ...CASE, lookup: { step: "pick", path: "caseId" } },
      { tag: "check", kind: "script", file: "scripts/rc-case.js", inputs: { caseId: { step: "pick", path: "caseId" }, requestId: { step: "pick", path: "requestId" }, rows: { rows: "case" } } },
      { tag: "update", kind: "update", ...CASE, map: { _id: { step: "check", path: "caseId" }, ...from("pick", ...SYNCED) } },
    ],
  },
  // I-1 · app · the RMM's screen after the Start submit: {caseItemId}
  I1: {
    id: "CIQ_I_1_Case_to_supplier_request_A00", app: "CIQ_Digital_A00", name: "CIQ I-1 Case to supplier request",
    desc: "Plan v6 I-1 (case.started): the RMM's screen posts {caseItemId} after the Start submit; the supplier's CIQP Request is created in the portal and its id stored on the case. Idempotent: refuses a case that already has its request.",
    steps: [
      { tag: "case", kind: "search", ...CASE, lookup: { trigger: "caseItemId" } },
      { tag: "twins", kind: "search", ...REQUEST, lookup: { trigger: "caseItemId" } },
      { tag: "check", kind: "script", file: "scripts/i1-case-started.js", inputs: { caseId: { trigger: "caseItemId" }, rows: { rows: "case" }, requests: { rows: "twins" } } },
      { tag: "request", kind: "create", ...REQUEST, map: {
        Request_Key: { step: "check", path: "requestKey" }, Cycle_No: { step: "check", path: "cycleNo" }, App_Case_Item_Id: { step: "check", path: "caseId" },
        Supplier_Display_Name: { step: "check", path: "Supplier_Legal_Name" },
        ...from("check", "Case_Code", "Supplier_Code", "Trade_Name", "Main_INCI", "BDF_Material_No", "BDF_Contact_Name", "BDF_Contact_Email", "Markets_Label", "Template_Label",
          "Supplier_Due_Date", "Rule_Set_Version", "Template_Version", "Config_Bundle_JSON", "Config_Bundle_Hash", "BDF_Set_JSON", "Case_Contacts_JSON"),
        Case_Phase_Label: { value: "Filling in" }, Request_Locked: { value: "No" }, Manual_Scope_JSON: { value: "[]" },
        Assigned_Contacts: { list: { step: "check", path: "assignees" } }, Release_Contacts: { list: { step: "check", path: "releaseAssignees" } },
      } },
      { tag: "link", kind: "update", ...CASE, map: { _id: { step: "check", path: "caseId" }, Portal_Request_Item_Id: { step: "request", path: "_id" }, Case_Phase: { value: "Supplier filling in the CIQ" } } },
    ],
  },
  // I-2 · portal · the supplier's screen after the fill-in submit with completeness confirmed: {portalRequestItemId}
  I2: {
    app: "CIQ_Supplier_Portal_A00", name: "CIQP Completeness confirmed to case",
    desc: "Plan v6 I-2 (completeness.confirmed): the supplier's screen posts {portalRequestItemId}; the confirmation and the answers go to the request's own app case, which then moves from 'Waiting for supplier: CIQ' to review. Idempotent.",
    steps: [
      { tag: "request", kind: "search", ...REQUEST, lookup: { trigger: "portalRequestItemId" } },
      { tag: "req", kind: "script", file: "scripts/i2-completeness.js", inputs: { requestId: { trigger: "portalRequestItemId" }, rows: { rows: "request" } } },
      { tag: "case", kind: "search", ...CASE, lookup: { step: "req", path: "caseId" } },
      { tag: "check", kind: "script", file: "scripts/i2-case.js", inputs: { caseId: { step: "req", path: "caseId" }, requestId: { step: "req", path: "requestId" }, rows: { rows: "case" } } },
      { tag: "record", kind: "update", ...CASE, map: { _id: { step: "check", path: "caseId" },
        ...from("req", "Completeness_Confirm", "Completeness_By_Name", "Completeness_By_Email", "Completeness_By_Role", "Completeness_At", ...SYNCED), Case_Phase: { value: "Review" } } },
      { tag: "move", kind: "approve", ...CASE, map: { instance_id: { step: "check", path: "caseId" }, activity_id: { step: "check", path: "activityInstanceId" } } },
    ],
  },
  // I-4 · portal · the supplier's screen after the "Supplier: respond" submit: {portalQueryItemId}
  I4: {
    app: "CIQ_Supplier_Portal_A00", name: "CIQP Query answered to open point",
    desc: "Plan v6 I-4 (query.answered): the supplier's screen posts {portalQueryItemId}; the answer goes to the query's own app open point (App_Open_Point_Id), which shows it as in progress.",
    steps: [
      { tag: "query", kind: "search", ...QUERY, lookup: { trigger: "portalQueryItemId" } },
      { tag: "answer", kind: "script", file: "scripts/i4-query-answered.js", inputs: { queryId: { trigger: "portalQueryItemId" }, rows: { rows: "query" } } },
      { tag: "op", kind: "search", ...OPEN_POINT, lookup: { step: "answer", path: "opId" } },
      { tag: "current", kind: "script", file: "scripts/i4-point.js", inputs: { opId: { step: "answer", path: "opId" }, queryId: { trigger: "portalQueryItemId" }, rows: { rows: "op" } } },
      { tag: "point", kind: "update", ...OPEN_POINT, map: { _id: { step: "current", path: "opId" },
        ...from("answer", "Response_Kind", "Response_Text", "Response_Doc_Refs_JSON", "Supplier_Responsible_Email"), OP_Progress: { value: "In progress" } } },
    ],
  },
  // I-6 · app · the reviewer's screen after reopening a review: {caseItemId}
  I6: {
    app: "CIQ_Digital_A00", name: "CIQ Review reopened to supplier request",
    desc: "Plan v6 I-6 (review.reopened): the app screen posts {caseItemId}; the case's own CIQP Request is unlocked and flagged Reopened, so the supplier's screen returns it to editing.",
    steps: [
      { tag: "case", kind: "search", ...CASE, lookup: { trigger: "caseItemId" } },
      { tag: "check", kind: "script", file: "scripts/i6-review-reopened.js", inputs: { caseId: { trigger: "caseItemId" }, rows: { rows: "case" } } },
      { tag: "req", kind: "search", ...REQUEST, lookup: { step: "check", path: "requestId" } },
      { tag: "waiting", kind: "script", file: "scripts/i6-request.js", inputs: { requestId: { step: "check", path: "requestId" }, caseId: { step: "check", path: "caseId" }, rows: { rows: "req" } } },
      { tag: "request", kind: "update", ...REQUEST, map: { _id: { step: "waiting", path: "requestId" }, Release_Flag: { value: "Reopened" }, Request_Locked: { value: "No" }, Case_Phase_Label: { value: "With Beiersdorf" } } },
    ],
  },
  // I-7 · portal · the supplier's screen after "give the final release": {portalRequestItemId}
  I7: {
    app: "CIQ_Supplier_Portal_A00", name: "CIQP Final release to case",
    desc: "Plan v6 I-7 (release.given): the supplier's screen posts {portalRequestItemId}; the release goes to the request's own app case, which is then completed. Refuses a case that has no completeness or is already released.",
    steps: [
      { tag: "request", kind: "search", ...REQUEST, lookup: { trigger: "portalRequestItemId" } },
      { tag: "rel", kind: "script", file: "scripts/i7-release-given.js", inputs: { requestId: { trigger: "portalRequestItemId" }, rows: { rows: "request" } } },
      { tag: "case", kind: "search", ...CASE, lookup: { step: "rel", path: "caseId" } },
      { tag: "check", kind: "script", file: "scripts/i7-case.js", inputs: { caseId: { step: "rel", path: "caseId" }, requestId: { step: "rel", path: "requestId" }, releaseAt: { step: "rel", path: "releaseAt" }, rows: { rows: "case" } } },
      { tag: "record", kind: "update", ...CASE, map: { _id: { step: "check", path: "caseId" }, Final_Release_Confirm: { value: "Confirmed" },
        Final_Release_By_Name: { step: "rel", path: "releaseByName" }, Final_Release_At: { step: "rel", path: "releaseAt" },
        Final_Release_By_Email: { step: "rel", path: "releaseByEmail" }, Final_Release_By_Role: { step: "rel", path: "releaseByRole" }, Case_Phase: { value: "Completed" } } },
      { tag: "complete", kind: "complete", ...CASE, map: { instance_id: { step: "check", path: "caseId" } } },
    ],
  },
};
