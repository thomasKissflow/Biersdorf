// CIQ Supplier Portal, v3 (2026-10-07): suppliers only. The single source of truth for the build scripts.
// Design: docs/kissflow-data-model/plan-v3-supplier-portal-one-role.md §4 (Thomas's rules):
//  - exactly ONE portal role, "Supplier" (all external users); the platform defaults Admin/User stay, Admin = Kissflow builders only;
//  - every portal process holds SUPPLIER steps only; every Beiersdorf decision happens in the app (CIQ Digital);
//  - every portal item carries Case_Code, Cycle_No, Supplier_Code (the supplier's own id) and the id of its app twin;
//  - BRM v2: sections stay editable until the final release (PS-11); documents additive with file name + upload date.
// The previous (v2, Beiersdorf-steps-in-portal) spec is kept as portal-spec-v2-asbuilt.mjs for the record.

export const PORTAL = "CIQ_Supplier_Portal_A00";

// ── roles: one custom role. The existing role "CIQP Supplier Contact" is renamed (its id is kept). ──
export const ROLES = [
  { name: "Supplier", renameFrom: "CIQP Supplier Contact", desc: "Every external supplier user. Acts only on items assigned to it through Assigned_Contacts; raises change requests." },
];
export const DEFAULT_ROLES = ["Admin", "User"]; // platform defaults; Admin = Kissflow builders only
export const TEST_USER = { _id: "UsEJUfjYLM8Y", Name: "Thomas", Kind: "User" };
export const TEST_USER_ROLES = []; // Thomas is portal Admin (default role) only; no Beiersdorf roles exist in the portal any more

// ── lists ──
export const LISTS = [
  { name: "CIQP Yes No", items: ["Yes", "No"] },
  { name: "CIQP Confirm", items: ["Confirmed"] },
  { name: "CIQP Response Kind", items: ["Answer", "Document", "Additional part completed", "Cannot provide"] },
  { name: "CIQP Doc Kind", items: ["SDS", "CoA", "Specification", "Analysis", "Certificate", "Statement", "Other"] },
  { name: "CIQP Change Kind", items: ["Metadata correction", "Configuration answer change", "Other correction", "Change notice"] },
];
export const LISTS_TO_DELETE = ["CIQP Dept Code"]; // department routing moved to the app

// field helpers
const T = (name, o = {}) => ({ name, type: "Text", ...o });
const TA = (name, o = {}) => ({ name, type: "Textarea", ...o });
const N = (name, o = {}) => ({ name, type: "Number", ...o });
const D = (name, o = {}) => ({ name, type: "Date", ...o });
const DT = (name, o = {}) => ({ name, type: "DateTime", ...o });
const EM = (name, o = {}) => ({ name, type: "Email", ...o });
const SEL = (name, list, o = {}) => ({ name, type: "Select", referredList: list, ...o });
const CONTACTS = { name: "Assigned Contacts", type: "MultiUser", required: true }; // K-04 verified: MultiUser field assignee routes
const HEADER = [T("Case Code", { required: true }), N("Cycle No", { required: true }), T("Supplier Code", { required: true })];
const SUPPLIER = "field:Assigned_Contacts";

// Steps: { name, assignee: "field:<FieldId>" | none (Start/End), field_permissions? }.
// Engine default: every field Editable at Start, ReadOnly at every later step; readOnlyAtStart lists the exceptions.

// ── P1 CIQP Request: the case header for the supplier + the basic-data task (PS-03/PS-04) ──
const P1 = {
  key: "P1", name: "CIQP Request", flowType: "Process",
  description: "One CIQ case cycle as the supplier sees it: case header and the basic-data task. Created from the app case.",
  fields: [
    T("Request Key", { required: true }), ...HEADER, T("App Case Item Id", { required: true }),
    T("Trade Name"), T("Main INCI"), T("BDF Material No"), T("Supplier Display Name"), T("BDF Contact Name", { required: true }), EM("BDF Contact Email", { required: true }),
    T("Markets Label"), T("Template Label"), D("Supplier Due Date", { required: true }), TA("Case Contacts JSON"), CONTACTS,
  ],
  steps: [{ name: "Issue request" }, { name: "Supplier: submit basic data", assignee: SUPPLIER }, { name: "End" }],
};

// ── P2 CIQP Section: one released section; answers and uploads, editable until the final release ──
const P2 = {
  key: "P2", name: "CIQP Section", flowType: "Process",
  description: "One released CIQ section of one case cycle: copied definition, the supplier's answers and uploads. Editable until the final release.",
  fields: [
    T("Section Item Key", { required: true }), ...HEADER, T("App Section Item Id", { required: true }),
    T("Section Key", { required: true }), T("Section Code", { required: true }), T("Section Title", { required: true }), N("Section Sort"),
    T("Applicability Label"), T("Supplier Reason"), T("Added Later"), T("Section Origin", { required: true }),
    TA("Definition JSON", { required: true }), T("Definition Hash", { required: true }),
    TA("Answers JSON"), N("Answers Rev"), DT("Answers Changed At"), T("Answers Changed By Email"), T("Editing By"), DT("Editing Since"),
    T("Supplier Responsible Email"), D("Supplier Due Date"), CONTACTS, SEL("Section Done", "CIQP Yes No"),
    SEL("Section Release Confirm", "CIQP Confirm"), // guard: Mandatory at the supplier step; the supplier UI sets it only at the final release
  ],
  child: {
    name: "CIQP Section Uploads", label: "Uploads",
    fields: [T("Upload Id"), T("Upload Field Key"), T("Upload Row Id"), SEL("Upload Doc Kind", "CIQP Doc Kind"), { name: "Upload File", type: "Attachment" }, T("Upload File Name"), T("Uploaded By Email"), DT("Uploaded At")],
  },
  readOnlyAtStart: ["Answers JSON", "Answers Rev", "Answers Changed At", "Answers Changed By Email", "Editing By", "Editing Since", "Supplier Responsible Email", "Section Done", "Section Release Confirm", "Uploads"],
  steps: [
    { name: "Release section" },
    { name: "Supplier: fill in section", assignee: SUPPLIER, field_permissions: { "Answers JSON": "Editable", "Answers Rev": "Editable", "Answers Changed At": "Editable", "Answers Changed By Email": "Editable", "Editing By": "Editable", "Editing Since": "Editable", "Supplier Responsible Email": "Editable", "Section Done": "Editable", "Section Release Confirm": "Mandatory", "Uploads": "Editable" } },
    { name: "End" },
  ],
};

// ── P3 CIQP Query: one round of one Beiersdorf open point (the review happens in the app; a return = next round) ──
const P3 = {
  key: "P3", name: "CIQP Query", flowType: "Process",
  description: "One round of a Beiersdorf question, document request or additional part. The supplier responds; the review happens in the app.",
  fields: [
    T("Query Key", { required: true }), N("Round No", { required: true }), ...HEADER, T("App Open Point Id", { required: true }),
    T("Kind Label", { required: true }), T("Responsible Department", { required: true }), T("Responsible Name", { required: true }),
    T("Ref Kind", { required: true }), T("Ref Section Key", { required: true }), T("Ref Field Key"), T("Ref Row Id"),
    T("Ref Doc Id"), T("Ref Doc File Name"), DT("Ref Doc Uploaded At"), T("Ref Label", { required: true }),
    TA("Question Text", { required: true }), TA("Supplier Justification", { required: true }), D("Supplier Due Date", { required: true }),
    TA("Previous Rounds JSON"), T("New Section Item Key"), CONTACTS,
    SEL("Response Kind", "CIQP Response Kind"), TA("Response Text"), TA("Response Doc Refs JSON"), T("Supplier Responsible Email"),
  ],
  readOnlyAtStart: ["Response Kind", "Response Text", "Response Doc Refs JSON", "Supplier Responsible Email"],
  steps: [
    { name: "Raise query" },
    { name: "Supplier: respond", assignee: SUPPLIER, field_permissions: { "Response Kind": "Mandatory", "Response Text": "Editable", "Response Doc Refs JSON": "Editable", "Supplier Responsible Email": "Editable" } },
    { name: "End" },
  ],
};

// ── P4a/P4b: the two formal supplier confirmations. Two separate flows (not one flow with a "kind" field), so each
//    completion has its own integration trigger (plan v3 review: one flow would fire both Y4 and Y5). ──
const confirmation = (key, name, description, startName, stepName) => ({
  key, name, flowType: "Process", description,
  fields: [
    T("Confirmation Key", { required: true }), ...HEADER, T("App Case Item Id", { required: true }),
    TA("Declaration Text", { required: true }), T("Declaration Text Key", { required: true }), D("Supplier Due Date"), CONTACTS,
    SEL("Supplier Confirm", "CIQP Confirm"), T("Confirmed By Name"), EM("Confirmed By Email"), T("Confirmed By Role"), DT("Confirmed At"),
  ],
  readOnlyAtStart: ["Supplier Confirm", "Confirmed By Name", "Confirmed By Email", "Confirmed By Role", "Confirmed At"],
  steps: [
    { name: startName },
    { name: stepName, assignee: SUPPLIER, field_permissions: { "Supplier Confirm": "Mandatory", "Confirmed By Name": "Mandatory", "Confirmed By Email": "Mandatory", "Confirmed By Role": "Mandatory", "Confirmed At": "Mandatory" } },
    { name: "End" },
  ],
});
const P4a = confirmation("P4a", "CIQP Completeness Confirmation", "The supplier confirms that the questionnaire is complete (PS-05). This is not the final release: data stays editable. Created from the app case.", "Request completeness confirmation", "Supplier: confirm completeness");
const P4b = confirmation("P4b", "CIQP Final Release", "The supplier's single final release of the questionnaire (PS-11). After it, nothing can be changed. Created from the app case.", "Request final release", "Supplier: release");

// ── P5 CIQP Notice: Beiersdorf → supplier message that needs an acknowledgement (change-request outcome, scope change).
//    NOT used for cancellation or closure: those must leave no open supplier task (REQ-PROC-049), so they go by e-mail from the app. ──
const P5 = {
  key: "P5", name: "CIQP Notice", flowType: "Process",
  description: "A message from Beiersdorf that the supplier acknowledges, e.g. a change-request outcome or a scope change. Not used for cancellation or closure (those go by e-mail, so no supplier task stays open).",
  fields: [
    T("Notice Key", { required: true }), T("Notice Kind", { required: true }), ...HEADER, T("App Notice Item Id", { required: true }),
    T("Notice Title", { required: true }), TA("Notice Text", { required: true }), T("Related Key"), CONTACTS,
  ],
  steps: [{ name: "Send notice" }, { name: "Supplier: acknowledge", assignee: SUPPLIER }, { name: "End" }],
};

// ── P6 CIQP Change Request: raised by the supplier; no portal step (triage and assessment happen in the app) ──
const P6 = {
  key: "P6", name: "CIQP Change Request", flowType: "Process",
  description: "A correction or change notice raised by the supplier. Triage and assessment happen in the app; the outcome comes back as a CIQP Notice.",
  fields: [
    T("CR Key", { required: true }), ...HEADER, SEL("Change Kind", "CIQP Change Kind", { required: true }),
    T("Section Key"), T("Field Key"), T("Row Id"), TA("Current Value Text"), TA("Proposed Value JSON", { required: true }), TA("Change Reason", { required: true }),
  ],
  steps: [{ name: "Submit change request" }, { name: "End" }], // Start → End verified (spike k-no-step, 2026-10-07)
};

// ── P7 CIQP Help Article (Form): supplier-agnostic FAQ ──
const P7 = {
  key: "P7", name: "CIQP Help Article", flowType: "Form",
  description: "Supplier-agnostic FAQ and quick-start guide (CIA #34). Every portal user may read every row by design.",
  fields: [T("Article Title", { required: true }), TA("Article Body", { required: true }), N("Sort Order")],
};

export const FLOWS = [P1, P2, P3, P4a, P4b, P5, P6, P7];

// ── grants. M = Member[] (act on assigned steps only); I = Member[InitiateItems]; I+V = Member[InitiateItems, View];
//    V = form Viewer[]; E = form Member[Delete]. Admin is the platform default role (Kissflow builders only): it raises the
//    items until the cross-container integrations take over, and is the manual fallback. ──
export const GRANTS = {
  "CIQP Request":        { "Supplier": "M", "Admin": "I+V" },
  "CIQP Section":        { "Supplier": "M", "Admin": "I+V" },
  "CIQP Query":          { "Supplier": "M", "Admin": "I+V" },
  "CIQP Completeness Confirmation": { "Supplier": "M", "Admin": "I+V" },
  "CIQP Final Release":  { "Supplier": "M", "Admin": "I+V" },
  "CIQP Notice":         { "Supplier": "M", "Admin": "I+V" },
  "CIQP Change Request": { "Supplier": "I", "Admin": "I+V" },
  "CIQP Help Article":   { "Supplier": "V", "Admin": "E" },
};
