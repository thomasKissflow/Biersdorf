// CIQ Supplier Portal: the single source of truth for what the build scripts create.
// Derived from docs/kissflow-data-model/kissflow-data-model-plan.md §3.1, §4.1–4.3, §5, §6.1, §6.3, §7.1–7.2,
// adjusted for the BRM v2 (context/sources/02b-…): no review version (sections stay editable until the final
// release), documents additive with file name + upload date (no versions, no upload in the query thread),
// scope only grows (sections are never withdrawn by a re-derivation).
// Field display names are chosen so that the server-assigned field ids equal the plan's ids (slug of the name).

export const PORTAL = "CIQ_Supplier_Portal_A00";

// ── roles (plan §7.1; CIQP BDF Sync only if K-09 fails, so not created) ──
export const ROLES = [
  { name: "CIQP Supplier Contact", desc: "All external supplier users. Acts only on steps assigned to it through Assigned_Contacts. No View grant." },
  { name: "CIQP BDF RMM", desc: "Beiersdorf raw material managers: issue requests, scope check, review wait step, change-request triage." },
  { name: "CIQP BDF Case Admin", desc: "RMM leads: flow admin on portal processes for the cancellation cascade only." },
  { name: "CIQP BDF Regulatory", desc: "Regulatory Affairs: raises and reviews its own queries and change requests." },
  { name: "CIQP BDF Safety", desc: "Product Safety: raises and reviews its own queries and change requests." },
  { name: "CIQP BDF QM", desc: "Quality Management: raises and reviews its own queries and change requests." },
  { name: "CIQP BDF Microbiology", desc: "Microbiology: raises and reviews its own queries and change requests." },
  { name: "CIQP BDF Sustainability", desc: "Sustainability: raises and reviews its own queries and change requests." },
  { name: "CIQP BDF Reader", desc: "Every internal Beiersdorf user: read all portal items (REQ-PROC-019)." },
  { name: "CIQP Integration Service", desc: "Identity for cross-container integrations I-1, I-3, I-6 (membership need confirmed by K-09)." },
];
// internal test membership: the key's own user (Thomas) is added to every internal BDF role, so the
// morning walkthrough can act on Beiersdorf steps. Supplier roles stay empty (Thomas invites portal users).
export const TEST_USER = { _id: "UsEJUfjYLM8Y", Name: "Thomas", Kind: "User" };
export const TEST_USER_ROLES = ROLES.map((r) => r.name).filter((n) => n.startsWith("CIQP BDF"));

// ── lists (plan §5, portal) ──
export const LISTS = [
  { name: "CIQP Yes No", items: ["Yes", "No"] },
  { name: "CIQP Confirm", items: ["Confirmed"] },
  { name: "CIQP Response Kind", items: ["Answer", "Document", "Additional part completed", "Cannot provide"] },
  { name: "CIQP Doc Kind", items: ["SDS", "CoA", "Specification", "Analysis", "Certificate", "Statement", "Other"] },
  { name: "CIQP Change Kind", items: ["Metadata correction", "Configuration answer change", "Other correction", "Change notice"] },
  { name: "CIQP Dept Code", items: ["REG", "SAF", "QM", "MIC", "SUS", "RMM"] },
];

// field helpers
const T = (name, o = {}) => ({ name, type: "Text", ...o });
const TA = (name, o = {}) => ({ name, type: "Textarea", ...o });
const N = (name, o = {}) => ({ name, type: "Number", ...o });
const D = (name, o = {}) => ({ name, type: "Date", ...o });
const DT = (name, o = {}) => ({ name, type: "DateTime", ...o });
const EM = (name, o = {}) => ({ name, type: "Email", ...o });
const SEL = (name, list, o = {}) => ({ name, type: "Select", referredList: list, ...o });
const CONTACTS = { name: "Assigned Contacts", type: "MultiUser" }; // K-04: MultiUser publishes and routes (verified 2026-10-07)

const DEPTS = [
  ["REG", "Regulatory"], ["SAF", "Safety"], ["QM", "QM"], ["MIC", "Microbiology"], ["SUS", "Sustainability"], ["RMM", "RMM"],
];
const deptRole = (code, label) => (code === "RMM" ? "CIQP BDF RMM" : `CIQP BDF ${label}`);

// Steps: { name, actor? (role name) | assignee: "field:<FieldId>", condition?, field_permissions? }
// Every field not listed is Editable at Start and ReadOnly elsewhere (engine default).

// ── P1 CIQP Request (plan §4.1 + §6.1) ──
const P1 = {
  key: "P1", name: "CIQP Request", flowType: "Process",
  description: "Supplier-facing lifecycle of one CIQ case cycle: basic data, scope check, questionnaire, review wait, final release.",
  fields: [
    T("Request Key", { required: true }), T("Case Code", { required: true }), N("Cycle No", { required: true }),
    T("App Case Item Id", { required: true }), T("Trade Name"), T("Supplier Display Name"),
    T("BDF Contact Name", { required: true }), EM("BDF Contact Email", { required: true }),
    T("Markets Label"), T("Template Label"), D("Supplier Due Date", { required: true }),
    TA("Case Contacts JSON"), { ...CONTACTS, required: true }, TA("Released Scope JSON"),
    SEL("Completeness Confirm", "CIQP Confirm"), T("Completeness By Name"), EM("Completeness By Email"), DT("Completeness At"), T("Completeness Text Key"),
    SEL("Supplier Release Requested", "CIQP Yes No"),
    SEL("Final Release Confirm", "CIQP Confirm"), T("Final Release By Name"), EM("Final Release By Email"), T("Final Release By Role"), DT("Final Release At"), T("Final Release Text Key"),
    TA("Supplier Notice"),
  ],
  readOnlyAtStart: ["Completeness Confirm", "Completeness By Name", "Completeness By Email", "Completeness At", "Completeness Text Key", "Final Release Confirm", "Final Release By Name", "Final Release By Email", "Final Release By Role", "Final Release At", "Final Release Text Key", "Supplier Release Requested"],
  steps: [
    { name: "Issue request" },
    { name: "Supplier: basic data and configuration", assignee: "field:Assigned_Contacts" },
    { name: "Beiersdorf: scope check", actor: "CIQP BDF RMM", field_permissions: { "Released Scope JSON": "Editable", "Supplier Notice": "Editable", "Supplier Due Date": "Editable", "Case Contacts JSON": "Editable", "Trade Name": "Editable", "Supplier Display Name": "Editable", "Markets Label": "Editable", "Template Label": "Editable", "BDF Contact Name": "Editable", "BDF Contact Email": "Editable", "Assigned Contacts": "Editable" } },
    { name: "Supplier: questionnaire", assignee: "field:Assigned_Contacts", field_permissions: { "Completeness Confirm": "Mandatory", "Completeness By Name": "Mandatory", "Completeness By Email": "Mandatory", "Completeness At": "Mandatory", "Completeness Text Key": "Mandatory" } },
    { name: "Beiersdorf: review in progress", actor: "CIQP BDF RMM", field_permissions: { "Supplier Release Requested": "Mandatory", "Supplier Notice": "Editable", "Released Scope JSON": "Editable", "Case Contacts JSON": "Editable", "Supplier Due Date": "Editable", "Trade Name": "Editable", "Supplier Display Name": "Editable", "Markets Label": "Editable", "Template Label": "Editable", "BDF Contact Name": "Editable", "BDF Contact Email": "Editable", "Assigned Contacts": "Editable" } },
    { name: "Supplier: final release", assignee: "field:Assigned_Contacts", condition: 'Supplier_Release_Requested = "Yes"', field_permissions: { "Final Release Confirm": "Mandatory", "Final Release By Name": "Mandatory", "Final Release By Email": "Mandatory", "Final Release By Role": "Mandatory", "Final Release At": "Mandatory", "Final Release Text Key": "Mandatory" } },
    { name: "End" },
  ],
};

// ── P2 CIQP Section (plan §4.2, v2: no revisions, editable until final release, additive uploads) ──
const P2 = {
  key: "P2", name: "CIQP Section", flowType: "Process",
  description: "One released CIQ section of one case cycle: copied definition, the supplier's answers and uploads. Editable until the final release.",
  fields: [
    T("Section Item Key", { required: true }), T("Case Code", { required: true }), N("Cycle No", { required: true }),
    T("Section Key", { required: true }), T("Section Code", { required: true }), T("Section Title", { required: true }), N("Section Sort"),
    T("Applicability Label"), T("Supplier Reason"), T("Added Later"), T("Section Origin", { required: true }),
    TA("Definition JSON", { required: true }), T("Definition Hash", { required: true }),
    TA("Answers JSON"), N("Answers Rev"), DT("Answers Changed At"), T("Editing By"), DT("Editing Since"),
    T("Supplier Responsible Email"), { ...CONTACTS, required: true }, SEL("Section Done", "CIQP Yes No"),
    SEL("Section Release Confirm", "CIQP Confirm"), // guard: Mandatory at the supplier step, set by the supplier UI only at the final release (PS-11)
  ],
  child: {
    name: "CIQP Section Uploads", label: "Uploads",
    fields: [T("Upload Id"), T("Upload Field Key"), T("Upload Row Id"), SEL("Upload Doc Kind", "CIQP Doc Kind"), { name: "Upload File", type: "Attachment" }, T("Upload File Name"), T("Uploaded By Email"), DT("Uploaded At")],
  },
  readOnlyAtStart: ["Answers JSON", "Answers Rev", "Answers Changed At", "Editing By", "Editing Since", "Supplier Responsible Email", "Section Done", "Section Release Confirm", "Uploads"],
  steps: [
    { name: "Release section" },
    { name: "Supplier: fill in section", assignee: "field:Assigned_Contacts", field_permissions: { "Answers JSON": "Editable", "Answers Rev": "Editable", "Answers Changed At": "Editable", "Editing By": "Editable", "Editing Since": "Editable", "Supplier Responsible Email": "Editable", "Section Done": "Editable", "Section Release Confirm": "Mandatory", "Uploads": "Editable" } },
    { name: "End" },
  ],
};

// ── P3 CIQP Query (plan §4.3, v2: document references by file name + upload date; no upload in the thread) ──
const P3 = {
  key: "P3", name: "CIQP Query", flowType: "Process",
  description: "Supplier side of one Beiersdorf open point: question, reference, supplier due date, response and thread.",
  fields: [
    T("Query Key", { required: true }), T("Case Code", { required: true }), N("Cycle No", { required: true }),
    SEL("Dept Code", "CIQP Dept Code", { required: true }), T("Kind Label", { required: true }),
    T("Ref Kind", { required: true }), T("Ref Section Key", { required: true }), T("Ref Field Key"), T("Ref Row Id"),
    T("Ref Doc Id"), T("Ref Doc File Name"), DT("Ref Doc Uploaded At"), T("Ref Label", { required: true }),
    TA("Question Text", { required: true }), TA("Supplier Justification", { required: true }), T("Responsible Name", { required: true }),
    D("Supplier Due Date", { required: true }), SEL("Response Required", "CIQP Yes No", { required: true }), { ...CONTACTS, required: true },
    N("Round No"), SEL("Response Kind", "CIQP Response Kind"), TA("Response Text"), TA("Response Doc Refs JSON"),
    TA("Thread JSON"), T("Supplier Outcome Label"), T("New Section Item Key"), T("Supplier Responsible Email"),
  ],
  readOnlyAtStart: ["Response Kind", "Response Text", "Response Doc Refs JSON", "Supplier Outcome Label", "Supplier Responsible Email"],
  steps: [
    { name: "Raise query" },
    { name: "Supplier: respond", assignee: "field:Assigned_Contacts", condition: 'Response_Required = "Yes"', field_permissions: { "Response Kind": "Mandatory", "Response Text": "Editable", "Response Doc Refs JSON": "Editable", "Supplier Responsible Email": "Editable", "Thread JSON": "ReadOnly" } },
    ...DEPTS.map(([code, label]) => ({ name: `Beiersdorf review - ${label}`, actor: deptRole(code, label), condition: `Dept_Code = "${code}"`, field_permissions: { "Supplier Due Date": "Editable", "Round No": "Editable", "Thread JSON": "Editable", "Supplier Outcome Label": "Editable", "New Section Item Key": "Editable", "Assigned Contacts": "Editable" } })),
    { name: "End" },
  ],
};

// ── P4 CIQP Change Request (plan §4.3; v2: mainly post-release attempts and fields the supplier cannot edit) ──
const P4 = {
  key: "P4", name: "CIQP Change Request", flowType: "Process",
  description: "Supplier-initiated change request: triaged by RMM, assessed by the owning department. After the final release every request is refused and logged.",
  fields: [
    T("CR Key", { required: true }), T("Case Code", { required: true }), N("Cycle No", { required: true }),
    SEL("Change Kind", "CIQP Change Kind", { required: true }), T("Section Key"), T("Field Key"), T("Row Id"),
    TA("Current Value Text"), TA("Proposed Value JSON", { required: true }), TA("Change Reason", { required: true }),
    SEL("Dept Code", "CIQP Dept Code"), TA("BDF Response Text"), T("Supplier Outcome Label"),
  ],
  readOnlyAtStart: ["Dept Code", "BDF Response Text", "Supplier Outcome Label"],
  steps: [
    { name: "Submit change request" },
    { name: "Beiersdorf: triage", actor: "CIQP BDF RMM", field_permissions: { "Dept Code": "Mandatory", "BDF Response Text": "Editable", "Supplier Outcome Label": "Editable" } },
    ...DEPTS.map(([code, label]) => ({ name: `Beiersdorf: assess - ${label}`, actor: deptRole(code, label), condition: `Dept_Code = "${code}"`, field_permissions: { "BDF Response Text": "Editable", "Supplier Outcome Label": "Editable" } })),
    { name: "End" },
  ],
};

// ── P5 CIQP Help Article (Form; supplier-agnostic FAQ, every portal user may read every row by design) ──
const P5 = {
  key: "P5", name: "CIQP Help Article", flowType: "Form",
  description: "Supplier-agnostic FAQ and quick-start guide (CIA #34). Every portal user may read every row by design.",
  fields: [T("Article Title", { required: true }), TA("Article Body", { required: true }), N("Sort Order")],
};

export const FLOWS = [P1, P2, P3, P4, P5];

// ── grants (plan §7.2, portal). I = Member[InitiateItems]; V = process Member[View] / form Viewer[];
//    M = Member[] (act on assigned steps only); A = flow Admin; E = form Member[Delete]. Combined codes are unions. ──
export const GRANTS = {
  "CIQP Request":        { "CIQP Supplier Contact": "M", "CIQP BDF RMM": "I+V", "CIQP BDF Case Admin": "A", "CIQP BDF Regulatory": "V", "CIQP BDF Safety": "V", "CIQP BDF QM": "V", "CIQP BDF Microbiology": "V", "CIQP BDF Sustainability": "V", "CIQP BDF Reader": "V", "CIQP Integration Service": "A" },
  "CIQP Section":        { "CIQP Supplier Contact": "M", "CIQP BDF RMM": "I+V", "CIQP BDF Case Admin": "A", "CIQP BDF Regulatory": "I+V", "CIQP BDF Safety": "I+V", "CIQP BDF QM": "I+V", "CIQP BDF Microbiology": "I+V", "CIQP BDF Sustainability": "I+V", "CIQP BDF Reader": "V" },
  "CIQP Query":          { "CIQP Supplier Contact": "M", "CIQP BDF RMM": "I+V", "CIQP BDF Case Admin": "A", "CIQP BDF Regulatory": "I+V", "CIQP BDF Safety": "I+V", "CIQP BDF QM": "I+V", "CIQP BDF Microbiology": "I+V", "CIQP BDF Sustainability": "I+V", "CIQP BDF Reader": "V" },
  "CIQP Change Request": { "CIQP Supplier Contact": "I", "CIQP BDF RMM": "V", "CIQP BDF Case Admin": "A", "CIQP BDF Regulatory": "V", "CIQP BDF Safety": "V", "CIQP BDF QM": "V", "CIQP BDF Microbiology": "V", "CIQP BDF Sustainability": "V", "CIQP BDF Reader": "V" },
  "CIQP Help Article":   { "CIQP Supplier Contact": "V", "CIQP BDF RMM": "E", "CIQP BDF Reader": "V" },
};
