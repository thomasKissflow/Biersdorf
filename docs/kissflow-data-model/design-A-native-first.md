# Design A — Native-first Kissflow data model for CIQ (internal app + supplier portal)

> **INTERNAL — Kissflow only.** Planning document. Nothing is built yet. Written 2026-10-06, after call 1 ("went amazing"), before we receive the access keys and the two container ids.
>
> **Angle A = native-first.** Use native Kissflow wherever it can carry a BDF acceptance criterion: Processes with one step per department, native forms and child tables for questionnaire sections, native lists, grants and step permissions, and native task inboxes. Where native cannot pass a criterion, this document says so and names the **smallest** custom piece that closes the gap.
>
> **Inputs read:** `~/Downloads/master.md` (cited **[MM §x]**), `prototype/src/domain/{types,catalog,rules,actions,selectors}.ts` (the model the client validated), `context/analysis/01, 02, 03, 07`, `context/sources/02` (BRM, 51 requirements) and `context/sources/05` (FLM v0.6).
>
> **Evidence tags used below**
> - **NATIVE**: a platform primitive our manual proves. Cited.
> - **NATIVE?**: a native primitive whose exact behaviour our manual does not prove. Each one has a spike in §13.
> - **CUSTOM**: a small piece of our own code. Each one is listed in §10.
> - **PORTAL-UNVERIFIED**: anything about Kissflow Portals beyond the two lines in our manual (see §2.1).

---

## 0. Summary

**Shape.** There are two containers. The supplier **portal** holds the 5 flows a supplier must act on or read. The internal **app** holds 23 internal-only flows: configuration, masters, review, RMES and registers. That is 28 flows in all. There are about 38 option lists, a few of them in both containers. The app has 17 roles and the portal has 10.

**The native spine.**

1. `CIQ_Case` is a portal process. It contains the supplier steps and the RMM gates.
2. Its "Complete questionnaire" step fans out, through a native integration, into `CIQ_Questionnaire_Part` items. This is one generic portal process with all CIQ sections as native form sections, and native visibility driven by a `Part_Sections` text. There is one item per section group.
3. Queries and document requests are `CIQ_Open_Point` items. This portal process has one review step per department, gated by a step condition, and a native send-back loop.
4. The completeness confirmation starts `CIQ_Review` in the app. This process has native **parallel branches per department**, each switched on or off by a step condition. The join is the BDF synchronisation point.
5. The join advances the case to the supplier's "Final release" step. Its native assignment e-mail is the single supplier notification (REQ-PROC-040).

**Configuration is data, versioned natively.** The template, rule set, section ownership, RMES criteria and limits are each a *process item per version*, with the rows in a child table. Completing the item freezes it, which gives native immutability. A Config Approver step gives four-eyes publishing. Cases pin version codes at creation by copying them from `CIQ_Active_Config` through autofill.

**Custom pieces.** There are six small ones (§10):

| # | Piece | What it does |
|---|---|---|
| C1 | Scope engine | Rule evaluator plus regression runner |
| C2 | Completeness confirmer | Checks every part before PS-05 and submits them |
| C3 | RMES initialiser | Creates criteria, pre-fills them and runs the limit checks |
| C4 | Blocker list | A read-only field component |
| C5 | Admin helpers | Copy-forward, checksum, regression |
| C6 | Operations | Reminder job, PDF fallback and cancel cascade |

Prototype-parity screens (a review workspace and the RMM cockpit) are optional (C7).

**What native cannot carry.** Honest gaps, detailed in §6.4 and Appendix A:

| Gap | Requirement |
|---|---|
| Evaluating the business-maintained rule table | REQ-CFG-003 |
| Help-text and label edits pinned per version | REQ-CFG-001 |
| Per-answer attribution | REQ-CTL-001; needs S-N5 |
| A field-exact jump target | REQ-PROC-029 |
| Per-section status roll-up | REQ-CTL-006 |
| Logging *attempted* edits after freeze | REQ-PROC-043 |
| Due-date-driven reminders | REQ-RMES-019 |
| RMES pre-fill | REQ-PROC-022 |
| A PDF of a dynamically scoped CIQ | REQ-PROC-046; needs S-07 |

**What decides this design.** These spikes, all in §13:

| Spike | Question |
|---|---|
| P-02, P-03, P-05 | How portals behave and connect to the app |
| S-01 | Can a step assignee come from a User field? |
| S-02 | Do supplier items stay isolated? |
| S-03 | Do concurrent edits to one item persist? |
| S-04 | Do conditional parallel branches skip and join correctly? |
| S-N1 | Is a required field skipped while hidden? |
| S-N3 | Can a required formula field act as a submit gate? |

**Effort.** About **22-30 builder-days** (§14). Native-first does not buy speed over a custom-UI design (07: 26-33 days). What it buys is platform-native tasks, inbox, send-back, freeze and history, plus less code to maintain. It **costs UX parity with the prototype the client just validated**. That gap is risk R6.

---

## 1. Principles

| # | Principle | Why | Basis |
|---|---|---|---|
| N1 | **Native spine, custom only at the edges.** Use custom code only where our manual proves native cannot do it: rule evaluation, multi-record loops, a PDF of dynamic scope | The angle; less code to keep alive "for years" | [MM §0.2 #10; §4.4; §4.8] |
| N2 | **Split by audience.** A flow lives in the **portal** if and only if a supplier must create it, act on it or read it. Everything else lives in the **app**. A supplier role never gets any grant on an app flow | Separation by construction | REQ-CTL-002, REQ-RMES-015; [MM §3.4, §6.7] |
| N3 | **Supplier-visible flows carry zero internal fields.** Security never depends on `Hidden` step permissions | Hidden fields may still travel in API payloads, history or e-mails | 07 P2; S-08 |
| N4 | **One writer per record.** Parallel work goes to separate items: parts per group, one open point per question, criterion rows per department form | Last writer wins on one instance; concurrent child-table writes are lost | [MM §6.6, §14 #26, #83]; REQ-CTL-001 |
| N5 | **Freeze = completion.** A completed process item is read-only for business users. We use this for the review version (parts), config versions and write-once registers | Native immutability without code | [MM §3.6]; 07 F-17; S-N7 |
| N6 | **Pin versions as data at case creation.** The case takes a snapshot of the template, rule-set, ownership, RMES and limit versions from `CIQ_Active_Config` through autofill. Everything downstream copies the pinned codes | REQ-CFG-001/-003: running cases keep their versions | [MM §4.4 lookup + autofill] |
| N7 | **Additive schema evolution.** Never edit or delete a published questionnaire field or list item. Add a new one and gate it by version | Native fields change live for every item | [MM §3.3, §4.2]; REQ-CFG-001 |
| N8 | **Status comes from system fields** (`_current_step`, `_status`) plus a mandatory *closure select* at the closing step. Never from a custom Status select | A custom Status select is never auto-set | [MM §3.6, §14 #66] |
| N9 | **Naming hygiene.** Prefix every flow, list and field with `CIQ`. No fields called `Name`, `Status`, `Type`, `Country`, `Category` or `Priority`. Spell it `Textarea`. Use a Select from a Yes/No list (not a Boolean) for questions that must be answered | Account-wide name collisions; a Boolean cannot express "not answered" | [MM §2.3, §3.3, §4.4, §14 #4-6] |
| N10 | **Prove it on the tenant.** Read back every write, test as the real assignee, run a leak test per channel | "200 is a claim, not evidence" | [MM §0.2, §9.1, §9.4] |

---

## 2. Containers and topology

### 2.1 What our manual says about portals (and nothing more)

- "**Application** — container of flows, pages, roles, nav… **Portals are a parallel external-facing variant.**" [MM §2.1]
- `GET /flow/2/{acc}/portal/{app}/flow` "**works for portal AND application containers**" [MM §3.3].

Everything else is **PORTAL-UNVERIFIED** and becomes a spike in §13:

- whether flows can be authored inside a portal through the same `/flow/2/…?_application_id=` and `/metadata/2/…` routes
- whether internal (account) users can hold portal roles
- how external users are invited and licensed
- whether references, aggregates and integrations work across containers
- whether portals have dev/prod promotion
- whether custom components run in portal forms and pages

### 2.2 Topologies

| Id | Topology | When | What changes |
|---|---|---|---|
| **T1 (default)** | **Split by audience.** Supplier-touching runtime (`CIQ_Case`, `CIQ_Questionnaire_Part`, `CIQ_Open_Point`, `CIQ_Change_Request`, `CIQ_Active_Config`, portal lists) in the **portal**. Everything internal in the **app**. Internal users also hold *mirror roles* in the portal | P-02 passes (internal users can hold portal roles and act on portal steps) **and** P-03 and P-05 pass (cross-container reference, aggregate and integration) | — |
| T1b | Split, with the review runtime co-located | P-02 passes but P-03 or P-05 fail | `CIQ_Review`, `CIQ_RMES_Criterion_SAF/_REG`, `CIQ_Finding` and `CIQ_Notification_Log` move into the **portal**, with **zero** supplier-role membership. Configuration, masters, notes, confirmations, audit and final documents stay in the app. The schema is identical; only the container id changes. Native aggregates, references and integrations then stay intra-container |
| T3 | Everything in the portal | Cross-container edges fail **and** we want one place | The app keeps only configuration and admin UI, read by the custom scope engine through `kf.api` [MM §6.8] |
| T4 | Mediated supplier layer | P-02 fails (internal users cannot act in portal flows) or S-01/S-02 fail (no per-supplier isolation) | Fallback from 07 §4.1: a server-side service under a service identity. +3-5 days, plus a BDF IT acceptance question |

**Decision gate D-1:** end of spike day 1 (§13). Every flow below is tagged with its T1 container. A **(→P)** mark means it moves to the portal under T1b.

---

## 3. Flow inventory

Flow names are **logical**. The platform assigns ids from `slug(Name)` + `_A0x`, so we read the real ids back after creation [MM §2.3].

Legend:
- **Container:** app, portal, or shared (a portal flow that internal roles also act on).
- **Type rationale** follows the decision order in [MM §2.2]: List? → Form if it has no stages → Process if structured routing → Board if unstructured.

### 3.1 Inventory table

| # | Flow | Container | Type | Type rationale [MM §2.2/§4.2] | Purpose | Key fields (detail in §3.2) | Creates | Edits | Reads |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `CIQ_Case` | **shared** (portal) | **Process** | Cross-role gates (RMM → supplier → RMM → supplier → BDF → supplier) with tasks, SLAs and step history. A Form could never gain this later [MM §4.2] | One CIQ case = one supplier × one raw material. The supplier-facing backbone (PS-01…PS-12) | Case_ID, header, Supplier_Contacts (dynamic assignee), SF-01…SF-12, Active_Sections, Config_Flags, pinned versions, PS-05 and PS-11 confirmations | RMM (portal role BDF RMM) | Supplier contacts at their steps; RMM at gates | Supplier: only their own participated items; all internal roles: all items |
| 2 | `CIQ_Questionnaire_Part` | **shared** (portal) | **Process** | The supplier fills it in, then it freezes on completion (review version). Additional parts need a department review step with send-back [MM §3.6, §4.6] | One item per case × section group (or one additional section). It holds the native questionnaire fields. Generic: all sections are native form sections, shown when listed in `Part_Sections` | Case ref, Part_Group, Part_Sections, Config_Flags, Template_Version_No, section fields, K2.1 child table, Is_Additional block | Integration (initial parts); department reviewer (additional parts) | Supplier contacts (Fill in); department role (additional-part review) | Supplier: own; internal: all |
| 3 | `CIQ_Open_Point` | **shared** (portal) | **Process** | Query → supplier answer → department review, with an unlimited loop. That is native send-back with a mandatory comment [MM §3.6, §14 #81] | Queries, document requests and finding-based queries, each pinned to an object | Case ref, Raising_Dept, OP_Kind, Ref_* object reference, Question, Justification, Responsible_BDF, Due_Date, Answer block, Review_Outcome, Is_Open helpers | Department reviewers, RMM | Supplier (answer); raising department (review) | Supplier: own; internal: all |
| 4 | `CIQ_Change_Request` | **shared** (portal) | **Process** | The supplier raises it and RMM decides. Structured, two roles | A supplier change to data after PS-05 (REQ-PROC-007, -031) | Case ref, Ref_*, Current_Value, Proposed_Value, Reason, CR_Decision, Scope_Impact, Depts_To_Inform | Supplier contacts | RMM | Supplier: own; internal: all |
| 5 | `CIQ_Active_Config` | portal | **Form** (1 row) | A register with no lifecycle [MM §2.2]. It must sit next to `CIQ_Case` for the autofill snapshot | Pointer to the currently published config versions, the confirmation texts and the supplier-facing limits | Active_* version codes, Overall_Approval_Enabled, Completeness_Text, Final_Release_Text, Lim_As/Cd/Cr | Business Admin | Business Admin (also via publish integration) | RMM at case creation (autofill) |
| 6 | `CIQ_Supplier` | app | Form | Master data [MM §2.2] | Supplier company master | Supplier_Company_Name, Supplier_DUNS, Supplier_Country_Code, Supplier_Kind, Parent_Supplier, Teamcenter_Supplier_ID, SAP_Vendor_No | RMM, Business Admin | RMM, Business Admin | All internal |
| 7 | `CIQ_Supplier_Contact` | app | Form | Master data | Supplier contacts, linked to portal users | Supplier ref, Contact_Full_Name, Contact_Email, Portal_User, Contact_Role_At_Supplier, Is_Coordinator | RMM | RMM | All internal |
| 8 | `CIQ_Raw_Material` | app | Form | Master data | Raw material master | Trade_Name, Main_INCI, Supplier ref, BDF_Material_No, Teamcenter_Item_ID, SAP_Material_No | RMM | RMM | All internal |
| 9 | `CIQ_Field_Registry` | app | Form | Catalogue, no lifecycle | Maps FLM field ids to native portal field ids. Feeds open-point references, the RMES pre-fill mapping, the PDF and the auditor view | Field_ID, Native_Field_Id, Field_Label, Section_Code, Field_Kind, Requiredness, Owner_Dept, Introduced_In_No, Retired_In_No, NA_Allowed | Business Admin | Business Admin | All internal |
| 10 | `CIQ_Template_Version` | app | **Process** + child table | Draft → test → four-eyes publish. **Completion freezes the version** (N5) | Questionnaire template version: which sections, which group, help text, introduced or retired | Template_Version_Code/_No, Change_Note, child `Template_Sections` | Business Admin | Business Admin (draft); Config Approver (approve) | All internal |
| 11 | `CIQ_Rule_Set` | app | **Process** + child table | Same as #10. Rules are rows; the version is the item | The business-maintained control table (REQ-CFG-003) | Rule_Set_Code, Change_Note, Regression_Report, child `Rules` (2-clause conditions, outcome, sections, evidence, departments, precedence) | Business Admin | as #10 | All internal |
| 12 | `CIQ_Ownership_Version` | app | **Process** + child table | as #10 | Section → lead, co-reviewing and informed departments (REQ-CFG-006) | child `Section_Owners` | Business Admin | as #10 | All internal |
| 13 | `CIQ_RMES_Template` | app | **Process** + child table | as #10 | RMES criteria for Parts A-D, versioned (REQ-RMES-002) | child `Criteria` | Business Admin | as #10 | Safety, Regulatory, Auditor |
| 14 | `CIQ_Limit_Set` | app | **Process** + child table | as #10 | BDF limits, reproducible per version (REQ-RMES-008) | child `Limits` | Business Admin | as #10 | Safety, Regulatory, Auditor |
| 15 | `CIQ_Text_Module` | app | Form | Catalogue | Versioned confirmation and declaration texts (CIA #5) | Text_Key, Text_Version, Text_Body, Text_Use | Business Admin | Business Admin | All internal |
| 16 | `CIQ_Reminder_Rule` | app | Form | Configuration register | Reminder and escalation settings (prototype `ReminderSettings`) | Reminder_Event, Recipient_Rule, After_Days, Escalate_To, Escalate_After_Days, Reminder_Enabled | Business Admin | Business Admin | RMM, Business Admin |
| 17 | `CIQ_Scope_Run` | app | **Process (write-once)** | An immutable derivation record: created and submitted, Start→End, so it is read-only at once (N5, S-N7) | Explainable scope per run: inputs, version, fired rules, M/O/N.A., manual extensions, diff | Case_ID, Run_No, Run_Trigger, versions, Input_Snapshot, child `Scope_Items`, Diff_* | RMM (through C1) | nobody (frozen) | All internal |
| 18 | `CIQ_Review` (→P) | app | **Process** | Structured review with a **native Parallel node**, one branch per department, a step condition per branch and an auto-join [MM §4.6] | One item per case × review cycle = the Part 2 container **and** the RMES record header ("exactly one RMES record per confirmed CIQ", REQ-PROC-021) | Case_ID, Review_Version, Review_Depts, Act_*, per-department blocks (assigned reviewer, note, blockers, gate, completion, decision), pinned RMES and limit versions | Integration (at PS-05) | Each department at its own branch step | All internal |
| 19 | `CIQ_RMES_Criterion_SAF` (→P) | app | Form | Rows are edited and reopened (REQ-RMES-012), so they must not freeze. **One form per department, so Regulatory cannot edit Safety natively** (Viewer on the other form) | Safety criterion results | Review ref, Criterion_Code, RMES_Part, Applicable, Source_*, Prefilled_Value, Result, Result_Comment, limit block, AI block, Impacted, helpers | C3 (Safety session) | Safety reviewers | All internal |
| 20 | `CIQ_RMES_Criterion_REG` (→P) | app | Form | as #19 | Regulatory criterion results | as #19 | C3 (Regulatory session) | Regulatory reviewers | All internal |
| 21 | `CIQ_Finding` (→P) | app | **Process** | Only the owning department may close it. That is a static role on a conditional step [MM §4.6] | Findings linked to a criterion and a source; blocking or non-blocking (REQ-RMES-009) | Review ref, Owning_Dept, Criterion_Code, Finding_Text, Blocking, Source_*, Linked_OP_ID, Finding_Closed | Safety and Regulatory reviewers (and C3 automatically) | Owning department | All internal |
| 22 | `CIQ_Internal_Note` | app | **Process (write-once)** | Notes must not be editable by others afterwards | BDF-only discussion (REQ-PROC-020) | Case_ID, Linked_Section, Linked_Finding_ID, Author_Dept, Note_Text | All internal | nobody | All internal |
| 23 | `CIQ_Confirmation` | app | **Process (write-once)** | An immutable act | Internal confirmations with no other home: scope release, cancellation, reactivation, manual completion, delegation used | Confirmation_Kind, Case_ID, Review_Version, Person, Person_Name/Email/Role, Justification, On_Behalf_Of | RMM, departments | nobody | All internal |
| 24 | `CIQ_Delegation` | app | **Process** | Grant → approve, two roles | Auditable delegation (REQ-PROC-039, REQ-RMES-013) | Grantor, Delegate, Dept, Delegation_Scope, Case_ID, Valid_From/To, Reason | Department reviewers and approvers | Approver (approve) | All internal |
| 25 | `CIQ_Closure` | app | **Process** | Switchable overall approval (step condition) after the final release [MM §4.6] | Closure container: optional BDF overall decision, then triggers the PDF | Case_ID, Review_Version, Overall_Approval_Enabled, Overall_Decision, Overall_Reason | Integration (on case completion) | Overall Approver | RMM, Auditor, Owner |
| 26 | `CIQ_Final_Document` | app | **Process (write-once)** | An immutable artefact | Final CIQ PDF and RMES export, with a hash (REQ-PROC-046, REQ-RMES-020) | Case_ID, Review_Version, Doc_Kind, Final_File, File_SHA256, Emailed_To, BFlow_* keys | Integration or C6 | nobody | RMM, Auditor, Owner |
| 27 | `CIQ_Audit_Event` | app | **Process (write-once)** | Append-only | Business audit events that native item history does not capture (§7.5) | Case_ID, Event_Kind, Actor, Object_*, Old/New, Reason, versions, Prev_Hash, Event_Hash | C1-C6 in user sessions | nobody | Auditor, RMM, Business Admin |
| 28 | `CIQ_Notification_Log` (→P) | app | **Process (write-once)** | Append-only | Every notification event logged at the case (REQ-CTL-010) | Case_ID, Notification_Event, Recipient_Desc, Channel, Sent_At, Source_Item_ID | Integrations, C6 | nobody | RMM, Auditor, Business Admin |
| L | ~30 **Lists** | app + portal | **List** | Option sets for Selects. They must be populated and use exact strings [MM §3.8] | §4 | — | Builder | Builder (append-only) | — |

**Not used, and why:**
- **No Boards.** Every lifecycle has cross-role gates [MM §2.2]. Board members see every card through `{id}_all` [MM §3.7, §5.4].
- **No Datasets.** Sharing is UI-only and the admin key has no dataset scope [MM §11.4].
- **No Decision Tables.** They are plan-gated (`403 YourPlanNotSupport`). They are only an optional accelerator if S-11 passes [MM §4.4, §15].

### 3.2 Field specifications (core flows)

Rules applied to every table below:

- Field ids derive from the names [MM §2.3].
- `Req` means required at the step that owns the field (step-level Mandatory). Fields owned by later steps are ReadOnly at Start [MM §4.6, §14 #53].
- "Yes/No" means a Select backed by `CIQ Yes No`, never a Boolean (N9).
- "Confirm" means a Select backed by `CIQ Confirm` (one item, "Confirmed"). A required Boolean can be satisfied by `false`, so it cannot force the tick [MM §4.4]. S-N2 verifies this.

#### 3.2.1 `CIQ_Case` (portal, Process)

| Field | Type | Req (step) | List / ref | Notes and requirement |
|---|---|---|---|---|
| Case_ID | SequenceNumber (prefix `CIQ-YYYY-`) → fallback Text formula on `_request_number` | auto | — | Unique ID (REQ-PROC-001). S-12 |
| Case_Priority | Select | Start | CIQ Case Priority | Normal / High |
| Supplier_Master_ID | Text (→ Reference `CIQ_Supplier` + autofill if P-03 passes) | Start | — | Cross-container link |
| GEN_002_Supplier_Name | Text | Start | — | FLM r3 |
| GEN_001_Trade_Name | Text | Start | — | FLM r2; REQ-PROC-001 |
| Main_INCI | Text | — | — | Search field (REQ-PROC-006) |
| BDF_Material_No | Text | — | — | Teamcenter/IRMA key (§11); search |
| RMM_Owner | User | Start | — | "Responsible BDF owner" (REQ-PROC-001); receives the PDF (REQ-PROC-046) |
| Supplier_Contacts | User (multi) | Start | — | **Assignee source for every supplier step** (S-01). Portal users only (P-04) |
| GEN_008_Contact_Email | Email | Start | — | FLM r4 |
| GEN_009_Contact_Email_2 | Email | — | — | FLM r5; extra notification recipient |
| SF11_Target_Markets | Multiselect | Start | CIQ Market | Owned by RMM (AS-06); ReadOnly for the supplier |
| Case_Due_Date | Date | Start | — | `YYYY-MM-DD` [MM §3.5] |
| Config_Ref | Reference → `CIQ_Active_Config` (lookup + **autofill**) | Start | — | Copies the fields below **once**: the snapshot = the pin (N6) |
| Template_Version / Template_Version_No | Text / Number | auto (RO) | — | e.g. "CIQ-2026 v1" / 1 (REQ-CFG-001) |
| Rule_Set_Version | Text | auto (RO) | — | "RS-2026.1" (REQ-CFG-003, REQ-PROC-009 "version logged") |
| Ownership_Version, RMES_Template_Version, Limit_Set_Version | Text | auto (RO) | — | REQ-CFG-006, REQ-RMES-002, -008 |
| Overall_Approval_Enabled | Yes/No | auto (RO) | CIQ Yes No | Switchable PS-12 gate (AS-01) |
| Lim_As_mg_kg, Lim_Cd_mg_kg, Lim_Cr_mg_kg | Number | auto (RO) | — | Supplier-facing K2.2 limits, pinned |
| Completeness_Text, Final_Release_Text | Textarea | auto (RO) | — | Versioned declaration texts (REQ-PROC-014) |
| GEN_003_DUNS | Text | Basic data | — | 9 digits: native validation (S-N4), else a C-component |
| GEN_004_Manufacturer, GEN_005_Production_Site | Textarea | Basic data | — | FLM r8-r9; one site (FLM changelog r25) |
| SF01_Origins | Multiselect | Basic data | CIQ Origin Type | Union semantics (AS-04) |
| SF02, SF03, SF04, SF06, SF07, SF08, SF09, SF10, SF12 | Yes/No (one field each, e.g. `SF07_Mineral_Oil`) | Basic data | CIQ Yes No | Explicit answer required (REQ-PROC-005) |
| SF05_Colorant_Preservative | Multiselect | Basic data | CIQ Colorant Preservative | Includes "Neither" so the field is still required |
| Config_Flags | Textarea (RO for the supplier) | Scope check (C1) | — | `;SF01=vegetable;SF07=Yes;SF12=No;…` drives every config-dependent visibility in parts |
| Active_Sections, Mandatory_Sections, Optional_Sections | Textarea | Scope check (C1) | — | `;GEN;K1;K2.1;A1;…` |
| Active_PG1 … Active_PG7 | Textarea | Scope check (C1) | — | Active sections per part group; copied into each part by integration |
| Review_Depts | Text | Scope check (C1) | — | `;REG;SAF;QM;MIC;SUS;`: lead departments of the active sections (prototype `departmentsForScope`) |
| Scope_Run_ID | Text | Scope check (C1) | — | Links to `CIQ_Scope_Run` |
| Scope_Released | Confirm | Scope check | CIQ Confirm | RMM releases the questionnaire (ReqDoc §5.2) |
| Parts_Open | Number (cross-flow SUM aggregate over Part.Is_Open where Case = `_id`) | — | — | S-05 |
| PS05_Gate | Text formula `IF(Parts_Open=0,"OK","")` | Complete questionnaire | — | **Required formula gate** (S-N3). C2 is the primary path |
| PS05_Confirmation | Confirm | Complete questionnaire | CIQ Confirm | Completeness confirmation, **not** the final release (REQ-PROC-014) |
| PS05_Name, PS05_Email | Text, Email | Complete questionnaire | — | Name, e-mail; the timestamp comes from step history (REQ-PROC-014/-015) |
| Review_Version | Number | auto | — | 1 at the first PS-05; +1 on resubmission (written by C2) |
| Review_Item_ID | Text | auto | — | `CIQ_Review` id (written by integration or C3) |
| PS11_Confirmation | Confirm | Final release | CIQ Confirm | REQ-PROC-042 |
| PS11_Name, PS11_Role, PS11_Email | Text, Text, Email | Final release | — | Name, role, e-mail (REQ-PROC-042) |
| External_Source, Teamcenter_Request_ID | Select, Text | — | CIQ Case Source | Integration keys (§11) |

#### 3.2.2 `CIQ_Questionnaire_Part` (portal, Process): structure

| Field | Type | Req | Notes |
|---|---|---|---|
| Case | Reference → `CIQ_Case`; lookup + autofill of Case_ID, Supplier_Contacts, Config_Flags, Template_Version_No, Lim_* and Review_Version | Start | Same-container reference. A User-field autofill is S-N14 |
| Part_Group | Select (CIQ Part Group) | Start | PG1…PG7 (below), or `ADD` for an additional part |
| Part_Sections | Textarea | Start | e.g. `;K6.1;K6.5;K6.7;` **Every form section's visibility formula reads this field** (S-N8) |
| Has_Active_Sections | Formula `Part_Sections <> ""` | — | Step condition of "Fill in": empty groups skip straight to End |
| Supplier_Section_Owner | Email | — | Supplier-side assignment as data, with no user-directory leak (REQ-CTL-001; §6 L8) |
| Is_Additional | Yes/No | Start | "Subsequently activated" marker (REQ-ADR-002) |
| AP_Requesting_Dept, AP_Justification, AP_Responsible, AP_Due_Date, AP_Ref_Label | Select (CIQ Dept), Textarea, User, Date, Text | Start, if additional | REQ-ADR-001 fields for additional parts |
| AP_Review_Outcome | Select (CIQ OP Outcome) | Additional-part review | Closes the additional part |
| Part_Submitted | Confirm | Fill in | Required at Fill in. Helper for Is_Open |
| Is_Open | Formula `IF(Part_Submitted="Confirmed" AND (Is_Additional<>"Yes" OR NOT(ISBLANK(AP_Review_Outcome))),0,1)` | — | Counted into Case.Parts_Open and Review.X_Open_Additional. A `_status`-based formula is preferred if S-N12 passes |
| Is_Open_REG … Is_Open_SUS | Formula `IF(AND(Is_Additional="Yes", AP_Requesting_Dept="Regulatory"), Is_Open, 0)` (and so on) | — | Blocks the requesting department (REQ-ADR-002) |
| *Section fields* | per section, below | — | Native fields with native visibility |

**Part groups.** These are data in the `Template_Sections` child rows, so BDF can split a group if two contacts need the same chapter at the same time (S-03):
- **PG1** Documents & composition: K1, K2.1, K2.2, K2.3
- **PG2** Handling, toxicology & microbiology: K3, K4.1, K4.2, K4.3, K5.1, K5.2, K5.3
- **PG3** Regulatory status: K6.1-K6.17, K6.16.1
- **PG4** Customs & patents: K7, K8, K8.1
- **PG5** Origin annexes: A1, A2, A3, A9
- **PG6** Substance annexes: A4-A8
- **PG7** REACH & inventories: A10-A13

**MVP section content** (FLM v0.6 plus the prototype `FIELDS`). Field naming is `<Section>_<FLM short id>_<label>`, and the full mapping lives in `CIQ_Field_Registry`.

| Section (form section visibility) | Native fields (type; visibility / validation) | FLM / prototype source |
|---|---|---|
| K1 `CONTAINS(Part_Sections,";K1;")` | K1_001_SDS, K1_002_CoA, K1_003_Specification (Attachment, Req) | ReqDoc §4.1 K1 |
| K2.1 | **Child table `K21_Components`**: Comp_INCI (Text, Req), Comp_CAS (Text; check digit by C-component or S-N4), Comp_EC (Text), Comp_Function (Text, Req), Comp_Additive (Yes/No, Req), Comp_Origin (Select CIQ Origin Type), Comp_Conc_Min_Pct, Comp_Conc_Max_Pct (Number 0-100). Plus K21_102_Natural_Origin_Index (Number 0-1, Req). The **row `_id` is the stable row id** | FLM r10-r15, r33; Feldkatalog r24 |
| K2.2 | K22_001_Batch_Evidence (Attachment, Req, ≥ 2 batches); K22_A14_101_Arsenic_mg_kg, _102_Cadmium, _103_Chromium (Number, Req); K22_Over_Limit (formula against the pinned Lim_*); K22_002_Over_Limit_Justification (Textarea, visible and Req when over the limit) | Feldkatalog r26-r29; REQ-RMES-008 |
| K2.3 | K23_11_Fossil_Spec … K23_16_ChemRec_Spec (Text; each visible and Req when `CONTAINS(Config_Flags,";SF01=<origin>;")`); K21_101_Plant_Part (Multiselect CIQ Plant Part; vegetable or animal); K23_10_Country_Of_Origin (Text) | FLM r16-r31 |
| K5.1 (in PG2, **always included** so the waiver can be justified) | K51_001_Micro_Test_Report (Attachment; visible and Req when `;SF12=Yes;`); K51_002_Waiver_Justification (Textarea; visible and Req when `;SF12=No;`) | REQ-PROC-012 test case |
| A1 | A1_102_Feedstock (Text), A1_103_Content_In_INCI_Pct, A1_104_Content_In_RM_Pct (Number 0-100), A1_201_Pesticide_Analysis (Yes/No) → A1_202_Pesticide_PDF (Attachment, shown on Yes) / A1_203_Pesticide_Reason (Textarea, shown on No); A1_204_Palm_Feedstock (Yes/No) → A1_206_RSPO (Select CIQ RSPO Model) → A1_207_Other_Cert (Yes/No) → A1_208_Other_Cert_Name (Text) + A1_208_Certificate (Attachment) | FLM r32-r35, r45-r51 |
| A2 | A2_101_INCI_IUPAC (Text; pre-filled from Main_INCI by autofill); A2_102_Mfg_Process (Multiselect CIQ Manufacturing Process); A2_103_Mfg_Process_Other (Text; shown when "Other" is selected) | FLM r37-r43 |
| A4 | A4_101_MOAH_mg_kg (Number ≥ 0); A4_102_Viscosity_Availability (Select CIQ Viscosity Availability); A4_103_Viscosity_mm2_s (Number > 0) + A4_103_Analytical_Data (Attachment), shown unless "Not available" | FLM r53-r55 |
| Every other section (K3, K4.x, K5.2, K5.3, K6.x, K7, K8, A3, A5-A13) | Placeholder: `<Sec>_Statement` (Textarea) + `<Sec>_Evidence` (Attachment). Real content is added later (N7) | 07 F-01 (placeholders) |
| K6.3 Turkey REACH (questionnaire **v2**, added the native way) | K63_001_KKDIK_Reg_No (Text, Req), K63_002_KKDIK_Confirmation (Attachment, Req). Section visibility: `AND(CONTAINS(Part_Sections,";K6.3;"), Template_Version_No >= 2)` | prototype `draftFields.ts`; BRM REQ-CFG-001 scenario |

**Workflow:**
1. Start
2. **Fill in**: assignee = Supplier_Contacts (dynamic, S-01); condition `Has_Active_Sections`
3. *Additional-part review – Regulatory | Safety | QM | Microbiology | Sustainability | RMM*: six conditional steps, each `AND(Is_Additional="Yes", AP_Requesting_Dept="<dept>")`, owned by the matching portal department role; native send-back to Fill in
4. End (frozen)

#### 3.2.3 `CIQ_Open_Point` (portal, Process)

| Field | Type | Req (step) | Notes and requirement |
|---|---|---|---|
| Case | Reference → `CIQ_Case` (autofill Case_ID, Supplier_Contacts, Supplier name, Trade name, Review_Version) | Start | |
| OP_Code | Text formula on `_request_number`, or set by the raising UI | auto | "OP-0142-03" |
| Raising_Dept | Select CIQ Dept | Start | Selects which department review step fires |
| OP_Kind | Select CIQ OP Kind (Query, Document request, Finding query) | Start | REQ-PROC-034 types. Additional parts use flow #2 |
| Ref_Kind | Select CIQ Ref Kind (Section, Field, Table row, Document, Finding) | Start | **The query cannot be sent without a reference** (REQ-PROC-029): native step-Mandatory |
| Ref_Section | Select CIQ Section Code | Start | |
| Ref_Field_ID | Text (FLM id, e.g. FLD-2.1-002) | — | Picked from `CIQ_Field_Registry` (C7) or typed |
| Ref_Part | Reference → `CIQ_Questionnaire_Part` | — | **Native jump target at item level** (opens the frozen part) |
| Ref_Row_ID, Ref_Row_Label | Text, Text | — | Child-row `_id` of `K21_Components`, plus "component 3 · Glycerin" |
| Ref_Doc_Name, Ref_Doc_Version | Text, Text | — | "File name and version" (REQ-PROC-029) |
| Ref_Finding_Code | Text | — | Opaque code only. The finding content stays in the app (REQ-RMES-015) |
| Ref_Label | Text | Start | "K2.1 › component 3 › CAS number". Human-readable and **written for the supplier** |
| Question, Justification | Textarea, Textarea | Start | ReqDoc §6.2 |
| Responsible_BDF | User | Start | REQ-ADR-001; shown to the supplier (REQ-PROC-030) |
| Due_Date | Date | Start | REQ-ADR-001 |
| Answer | Textarea | Supplier response (visible and Req unless Cannot_Provide = Yes) | REQ-PROC-032 |
| Answer_Document | Attachment | — | New evidence version |
| Corrected_Value | Text | — | A Part 2 delta for the referenced field (P5 append-only) |
| Cannot_Provide, Cannot_Provide_Reason | Yes/No, Textarea (visible and Req on Yes) | Supplier response | Justified non-delivery (REQ-PROC-032) |
| Review_Outcome | Select CIQ OP Outcome (Accepted, Not accepted – final) | Department review | Closes the point (REQ-PROC-034) |
| Accepted_Evidence_Version | Text | Department review | "Reviewed evidence version" (REQ-PROC-034, REQ-RMES-011) |
| Note_To_Supplier | Textarea | — | Visible to the supplier (label says so) |
| Is_Open | Formula `IF(ISBLANK(Review_Outcome),1,0)` (or `_status`, S-N12) | — | Withdrawn items: S-N12 |
| Is_Open_REG … Is_Open_SUS, Is_Open_RMM | Formula `IF(Raising_Dept="Regulatory",Is_Open,0)` (and so on) | — | Summed by `CIQ_Review` (S-05) |

**Workflow:**
1. Start (raise)
2. **Supplier response**: Supplier_Contacts, dynamic
3. *Review answer – Regulatory | Safety | QM | Microbiology | Sustainability | RMM*: six conditional steps on `Raising_Dept`, each owned by the matching portal department role. **Send-back to Supplier response** carries a mandatory comment ("returned with justification", REQ-PROC-034/-035)
4. End (closed)

Withdrawal by BDF is the native *withdraw* by the initiator (S-N11).

#### 3.2.4 `CIQ_Change_Request` (portal, Process)

**Fields:**
- Case (ref, autofill)
- Ref_Section, Ref_Field_ID, Ref_Label
- Current_Value (Text), Proposed_Value (Textarea, Req), Reason (Textarea, Req), CR_Attachment
- CR_Decision (Select: Accepted / Not accepted, Req at RMM step)
- Scope_Impact (Yes/No)
- Depts_To_Inform (Multiselect CIQ Dept)
- Note_To_Supplier

**Workflow:**
1. Start (supplier initiates)
2. **Assess change – RMM** (portal role BDF RMM)
3. End

Accepted changes are Part 2 deltas. C1 re-runs scope when Scope_Impact = Yes. C3 flags impacted criteria (REQ-PROC-031, REQ-RMES-012).

#### 3.2.5 `CIQ_Review` (app; →P in T1b; Process)

**Header fields:**
- Case_ID, Portal_Case_Item_ID, Supplier_Name, Trade_Name (copied by integration)
- Review_Version (Number)
- Review_Depts (Text)
- Template_Version, Rule_Set_Version, RMES_Template_Version, Limit_Set_Version
- Overall_Approval_Enabled
- Scope_Run (Reference → `CIQ_Scope_Run`, set by C3)
- Reopen_Of (Reference → `CIQ_Review`), Cycle_Reason
- Any_Rejected: formula `OR(SAF_Decision="Rejected", REG_Decision="Rejected")`

**Per-department block.** X ∈ {REG, SAF, QM, MIC, SUS}; RMM optional (AS-07).

| Field | Type | Notes |
|---|---|---|
| Act_X | Formula `CONTAINS(Review_Depts,";X;")` | Step condition of X's branch (REQ-PROC-017) |
| X_Assigned_Reviewer | User | Named owner (REQ-CTL-003); set by the lead or by claiming |
| X_Review_Note | Textarea | Internal |
| X_Open_Points | Aggregate SUM of `CIQ_Open_Point.Is_Open_X` for this case | S-05 / P-03 (cross-container in T1) |
| X_Open_Additional | Aggregate SUM of `CIQ_Questionnaire_Part.Is_Open_X` | REQ-ADR-002 |
| SAF/REG only: X_Pending_Criteria, X_Negative_No_Comment, X_Blocking_Findings | Aggregates over `CIQ_RMES_Criterion_X.Is_Pending`, `.Is_Negative_No_Comment` and `CIQ_Finding.Is_Open_Blocking` | REQ-RMES-006, -007, -009; REQ-PROC-039 |
| X_Blockers | Formula: sum of the above | |
| X_Gate | Formula `IF(X_Blockers=0,"OK","")`, **Req at X review** | Native completion gate (S-N3). C4 lists the blockers by name (REQ-PROC-036) |
| X_Review_Completed | Confirm, Req at X review; label "Review completed — not a raw-material approval" | PS-10 completion (REQ-PROC-038); person and time from step history |
| SAF/REG: X_Decision | Select CIQ Dept Decision (Approved / Rejected), Req at X final decision | REQ-RMES-013 |
| SAF/REG: X_Decision_Reason | Textarea, visible and Req when Rejected (S-N1) | Mandatory rejection reason |
| X_On_Behalf_Of | User | Delegation stamp (REQ-PROC-039) |
| X_Track_Status | Formula → "Not activated" / "Waiting for supplier" / "In review" / "Completed" / "Approved" / "Rejected" | Native dashboard dimension (REQ-CTL-006, REQ-RMES-018) |

**Workflow:**
1. Start (integration)
2. **Parallel**:
   - **REG**: *Regulatory review* (CIQ Regulatory Reviewer; condition Act_REG) → *Regulatory final decision* (CIQ Regulatory Approver; condition Act_REG)
   - **SAF**: *Safety review* → *Safety final decision* (same pattern)
   - **QM**: *QM review* (condition Act_QM)
   - **MIC**: *Microbiology review* (condition Act_MIC)
   - **SUS**: *Sustainability review* (condition Act_SUS)
3. Auto-join
4. *Outcome decision*: condition `AND(Any_Rejected, Overall_Approval_Enabled="Yes")`; CIQ Overall Approver. Native Reject ends the review as rejected (AS-02)
5. End

Step field permissions: in X's steps only X_* fields are Editable and everything else is ReadOnly ("read all, edit own", REQ-PROC-019) [MM §4.6]. Native *Reject* is discouraged on department steps, because it would end the whole item (S-N9). A department's rejection is a **field value**.

#### 3.2.6 RMES criterion forms (app; →P)

`CIQ_RMES_Criterion_SAF` and `CIQ_RMES_Criterion_REG` have identical fields:

- **Identity:** Review (Reference → `CIQ_Review`, Req); Case_ID; Review_Version; RMES_Template_Version; Criterion_Code; RMES_Part (Select A-D); Criterion_Title
- **Applicability:** Applicable (Yes/No); Applicability_Reason (Textarea, required by C3 when overridden; REQ-RMES-004, -007)
- **Source:** Source_Section; Source_Field_ID; Source_Part_Item_ID; Source_Row_ID; Source_Version; Source_Label (REQ-RMES-005); Prefilled_Value (Textarea, REQ-PROC-022)
- **Result:** Result (Select CIQ RMES Result); Result_Comment; Assessed_By (User); Assessed_At (DateTime)
- **Limit check:** Limit_Key; Reported_Value; Reported_Unit; Limit_Value; Limit_Comparator; Limit_Pass (formula) (REQ-RMES-008)
- **AI:** AI_Suggestion (Textarea); AI_Source (Text); AI_Status (Select CIQ AI Status) (REQ-PROC-024)
- **Impact:** Impacted (Yes/No); Impact_Note (REQ-RMES-012)
- **Helpers:**
  - Is_Pending = `IF(AND(Applicable="Yes", ISBLANK(Result)),1,0)`
  - Is_Negative_No_Comment = `IF(AND(OR(Result="Implausible",Result="Not available",Result="Not listed",Result="Not applicable"), ISBLANK(Result_Comment)),1,0)`

#### 3.2.7 `CIQ_Finding` (app; →P; Process)

**Fields:**
- Review (ref), Case_ID
- Owning_Dept (Select Safety / Regulatory)
- Criterion_Code, Criterion_Row_ID
- Finding_Text (Textarea, Req)
- Blocking (Yes/No; default Yes, because BRM REQ-PROC-036 says "all block", while REQ-RMES-009 allows the classification)
- Source_Label, Source_Section, Source_Field_ID, Source_Version
- Linked_OP_ID, Linked_OP_Code (a finding becomes a query, REQ-RMES-010)
- Resolution_Note
- Finding_Closed (Confirm, Req at the resolve step)
- Is_Open_Blocking = `IF(AND(Blocking="Yes", Finding_Closed<>"Confirmed"),1,0)`

**Workflow:**
1. Start (Safety or Regulatory reviewer, or C3 for an automatic limit exceedance)
2. *Resolve – Safety* (condition Owning_Dept = Safety) or *Resolve – Regulatory*
3. End

#### 3.2.8 `CIQ_Scope_Run` (app, write-once Process)

**Header fields:**
- Case_ID, Portal_Case_Item_ID, Run_No
- Run_Trigger (Select: Initial, Configuration change, Manual extension, Revert, Part 2 change)
- Rule_Set_Version, Template_Version, Ownership_Version
- Input_Snapshot (Textarea JSON of the SF answers)
- Active_Sections, Review_Depts
- Diff_Added, Diff_Removed, Diff_Changed (REQ-CFG-008)
- Depts_Notified (Multiselect)
- Manual_Check_Needed (Yes/No; origins without rules, OP-19)
- Run_Checksum

**Child table `Scope_Items`:** Section_Code, Applicability, Scope_Origin, Fired_Rules, Reason, Justification, Decided_By, Decided_At, Added_Later.

This record satisfies "N.A. parts hidden from the supplier but documented internally with the rule justification" (REQ-PROC-009) and "triggering rule and answer per section" (REQ-PROC-010).

#### 3.2.9 Configuration processes (app)

**Common to all five:**
- Header: `<X>_Version_Code`, Change_Note (Req), Supersedes (Reference to self), Config_Checksum (written by C5), Regression_Report (Attachment; rule set only)
- **Workflow:**
  1. Start (Business Admin)
  2. *Prepare draft* (Business Admin)
  3. *Test* (Business Admin; regression evidence required for rule sets)
  4. *Approve publication* (CIQ Config Approver; native send-back to *Prepare draft* with a comment)
  5. End = **published and frozen**
- On ItemCompleted, an integration runs `UpdateAnItem` on `CIQ_Active_Config` (P-05). Otherwise the Business Admin updates the pointer by hand.

| Flow | Child table and columns |
|---|---|
| `CIQ_Template_Version` | `Template_Sections`: Section_Code (Select), Section_Title, Section_Kind (Select), Parent_Section, Sort_Order, Part_Group (Select), Introduced_In_No, Retired_In_No, Help_Text, Has_Field_Content (Yes/No) |
| `CIQ_Rule_Set` | `Rules`: Rule_Code; Config_Question (Select SF-01…SF-12, ALWAYS); Clause1_Question / Clause1_Operator / Clause1_Value; Clause_Join (AND / OR / none); Clause2_Question / Clause2_Operator / Clause2_Value; Advanced_Condition (Textarea, optional nested expression); Condition_Text; Activates_Sections (Text `;A1;A9;`); Outcome (Select CIQ Applicability); Evidence_Required (Textarea); Rule_Depts (Multiselect CIQ Dept); Rule_Basis (Select); Precedence (Number); Rule_Note; Rule_Active (Yes/No). **The flat two-clause row natively expresses "SF-01 plant-based AND SF-08 palm-based"** (REQ-CFG-003 acceptance). Seed: R-00…R-121 from `prototype/src/domain/rules.ts` |
| `CIQ_Ownership_Version` | `Section_Owners`: Section_Code, Lead_Dept (Select), Co_Depts (Multiselect), Informed_Depts (Multiselect). Seed: `SECTIONS` lead/co from `catalog.ts` (K2.2 = Safety lead, QM co, REQ-CFG-006) |
| `CIQ_RMES_Template` | `Criteria`: Criterion_Code, RMES_Part, Owning_Dept, Criterion_Title, Source_Section, Source_Field_ID, Applicability_Condition (Text, e.g. `section:A4` / `market:non-EU`), Result_Kind (Select: Availability / Plausibility / Listed status), Limit_Key, Sort_Order, Criterion_Active. Seed: R-A1…S-D1 from `actions.ts rmesCriteria` |
| `CIQ_Limit_Set` | `Limits`: Limit_Key, Substance, Source_Field_ID, Limit_Comparator (Select), Limit_Value (Number), Limit_Unit (Select CIQ Unit), Reference_Method, Limit_Source. Seed: BDF-LIM-2026.1 (As ≤ 0.5, Cd ≤ 0.1, Cr ≤ 5.0 mg/kg; MOAH ≤ 1.0 mg/kg) |

#### 3.2.10 Registers and the remaining flows (app)

**`CIQ_Confirmation` fields:**
- Confirmation_Kind (Select)
- Case_ID, Review_Version, Dept
- Person (User), Person_Name, Person_Email, Person_Role
- Confirmed_At (DateTime)
- Text_Key, Text_Version
- Justification (Textarea; required by kind, enforced by S-N1 visibility)
- On_Behalf_Of (User)

**`CIQ_Audit_Event` fields:**
- Case_ID
- Event_Kind (Select CIQ Audit Event Kind)
- Actor (User), Actor_Side (Select BDF / Supplier / System), On_Behalf_Of
- Object_Kind, Object_Item_ID, Object_Version
- Section_Code, Field_ID
- Old_Value, New_Value, Reason
- Rule_Set_Version, Template_Version, Limit_Set_Version
- Prev_Hash, Event_Hash
- Writer (Text: component id)

**`CIQ_Notification_Log` fields:**
- Case_ID
- Notification_Event (Select)
- Recipient_Desc, Channel
- Sent_At (DateTime)
- Source_Flow, Source_Item_ID

**`CIQ_Final_Document` fields:**
- Case_ID, Review_Version
- Doc_Kind (Select: CIQ final PDF / RMES export)
- Final_File (Attachment), File_SHA256
- Generated_At, Emailed_To
- Technical_Title
- BFlow_Document_ID, BFlow_Filed_At

**`CIQ_Closure`:**
- Fields: Case_ID, Review_Version, Overall_Approval_Enabled, Overall_Decision (Select, Req at the step), Overall_Reason (visible and Req when Rejected)
- Workflow:
  1. Start
  2. *Overall approval* (condition enabled; CIQ Overall Approver)
  3. End
- On ItemCompleted, the PDF is generated (S-07 / C6).

**`CIQ_Delegation`:**
- Fields: Grantor, Delegate (User), Dept, Delegation_Scope (Select Case / Period), Case_ID, Valid_From, Valid_To, Delegation_Reason
- Workflow:
  1. Start (grantor)
  2. *Approve delegation* (the department's Approver role)
  3. End

The task itself moves through native *reassign* in the UI or the SDK `reassignItem`. The REST reassign returns 500 [MM §3.6, §6.2].

**Masters:**
- **`CIQ_Supplier`**: Supplier_Company_Name (Req), Supplier_DUNS (Req, 9 digits), Supplier_Country_Code, Supplier_Kind (Select Manufacturer / Distributor), Parent_Supplier (Reference to self; CIA #28), Teamcenter_Supplier_ID, SAP_Vendor_No, Supplier_Active.
- **`CIQ_Supplier_Contact`**: Supplier (Reference), Contact_Full_Name (FLM changelog R2 gap), Contact_Email (Req), Portal_User (User; P-04), Contact_Role_At_Supplier (Select CIQ Supplier Role; CIA #25 as data), Is_Coordinator, Contact_Active.
- **`CIQ_Raw_Material`**: Trade_Name (Req), Main_INCI, Supplier (Reference), BDF_Material_No, Teamcenter_Item_ID, SAP_Material_No, IRMA_Ref.

---

## 4. Lists (option sets)

All lists are app-prefixed [MM §2.3, §3.8]. All are **populated before any Select that references them**, and their values are append-only: never remove an item a live record uses [MM §3.8, §14 #3]. Lists are flows of their container. Portal forms use **portal** lists unless P-03 proves cross-container lists work.

| List | Container | Items (exact strings) | Used by |
|---|---|---|---|
| CIQ Yes No | both | Yes, No | SF answers, Yes/No questions, flags |
| CIQ Confirm | both | Confirmed | Every confirmation select |
| CIQ Origin Type | portal | Vegetable (bio mass), Animal, Mineral, Petrochemical / fossil, Polymer, Waste / side stream, Carbon capture (CCU), Chemical recycling of post-consumer plastic | SF01, Comp_Origin |
| CIQ Market | portal | European Union, United Kingdom, Turkey, China, USA, Canada, Other markets | SF11 |
| CIQ Colorant Preservative | portal | Colorant, Preservative, Neither | SF05 |
| CIQ Section Code | both | GEN, K1, K2.1, K2.2, K2.3, K3, K4.1, K4.2, K4.3, K5.1, K5.2, K5.3, K6.1 … K6.17, K6.16.1, K7, K8, K8.1, A1 … A13 | Ref_Section, Template_Sections, Scope_Items |
| CIQ Part Group | both | PG1 Documents & composition, PG2 Handling, toxicology & microbiology, PG3 Regulatory status, PG4 Customs & patents, PG5 Origin annexes, PG6 Substance annexes, PG7 REACH & inventories, ADD Additional part | Part_Group |
| CIQ Dept | both | RMM, Regulatory, Safety, QM, Microbiology, Sustainability, Customs, Legal | Raising_Dept, owners, AP_Requesting_Dept |
| CIQ OP Kind | portal | Query, Document request, Finding query | OP_Kind |
| CIQ Ref Kind | portal | Section, Field, Table row, Document, Finding | Ref_Kind |
| CIQ OP Outcome | portal | Accepted, Not accepted – final | Review_Outcome, AP_Review_Outcome |
| CIQ Plant Part | portal | Bark, Bean, Flower, Fruit, Fruit pulp, Germ, Kernel, Leaf, Nut, Peel, Rhizome, Root, Seed, Shell, Shoot, Skin, Tree, Trunk, Wool, No entry | K21_101 |
| CIQ RSPO Model | portal | Mass Balance, Segregated, Identity Preserved, No RSPO certification | A1_206 |
| CIQ Manufacturing Process | portal | Chemical, Physical, Enzymatic, Biotechnology / Fermentation, Other | A2_102 |
| CIQ Viscosity Availability | portal | Not available, Conclusion by analogy, Own value | A4_102 |
| CIQ Case Priority | portal | Normal, High | Case_Priority |
| CIQ Case Source | portal | Manual, Teamcenter | External_Source |
| CIQ Applicability | app | Mandatory, Optional, Not applicable | Rules.Outcome, Scope_Items |
| CIQ Scope Origin | app | Rule, Manual extension, Subsequently activated, Removed by re-derivation | Scope_Items |
| CIQ Config Question | app | SF-01 … SF-12, ALWAYS | Rules |
| CIQ Condition Operator | app | includes, equals, does not equal, is answered | Rules clauses |
| CIQ Clause Join | app | AND, OR, none | Rules |
| CIQ Rule Basis | app | Document, Our assumption | Rules |
| CIQ Section Kind | app | Basic, Chapter, Annex | Template_Sections |
| CIQ Field Kind | app | Text, Long text, Number, Decimal, Range, Yes/No, Single choice, Multiple choice, Date, Table, File upload, E-mail | Field Registry |
| CIQ Requiredness | app | Mandatory, Optional, Mandatory if shown | Field Registry |
| CIQ RMES Part | app | A, B, C, D | Criteria |
| CIQ RMES Result | app | Available, Not available, Plausible, Implausible, Listed, Not listed, Not applicable | Result |
| CIQ RMES Result Kind | app | Availability, Plausibility, Listed status | Criteria template |
| CIQ Dept Decision | app | Approved, Rejected | SAF/REG decision, Overall_Decision |
| CIQ AI Status | app | Proposed, Confirmed, Discarded | AI_Status |
| CIQ Unit | app | mg/kg, %, mm²/s, ppm | Limits, Reported_Unit (one fixed unit per question, Q-18) |
| CIQ Limit Comparator | app | ≤, <, ≥ | Limits |
| CIQ Confirmation Kind | app | Scope release, Cancellation, Reactivation, Manual completion, Delegation used | Confirmation |
| CIQ Audit Event Kind | app | Scope derived, Manual extension, Scope re-derived, Change accepted, Change attempt refused, Delegation, Reassignment, Cancellation cascade, PDF generated, Config published, Impact flagged | Audit_Event |
| CIQ Notification Event | app | Supplier task created, Query issued, Answer received, Review task created, Final release requested, PDF sent, Reminder, Escalation | Notification_Log |
| CIQ Supplier Role | app | Key Account Manager, Quality, Regulatory, Other | Contact role (CIA #25 as data) |
| CIQ Final Doc Kind | app | CIQ final PDF, RMES export | Final_Document |
| CIQ Run Trigger | app | Initial, Configuration change, Manual extension, Revert, Part 2 change | Scope_Run |

Seed values must equal the list strings exactly. A mismatch is dropped silently at create and only surfaces at submit [MM §3.5, §8.1].

---

## 5. Process designs

### 5.1 End-to-end mapping (case phases ↔ native steps ↔ BRM)

| Prototype phase | Native carrier | Actor (role) | Mechanism | BRM |
|---|---|---|---|---|
| (create) | `CIQ_Case` Start | BDF RMM (portal) | Step-Mandatory header blocks creation; Case_ID; config pin by autofill | REQ-PROC-001 |
| metadata | `CIQ_Case` "Basic data & configuration" | Supplier_Contacts (dynamic, S-01) | The only supplier-visible content at this point: parts don't exist yet | REQ-PROC-004, -005 |
| scope-check | `CIQ_Case` "Scope check" | BDF RMM | C1 derives and writes; RMM may extend (justification required) and release. Native send-back to Basic data | REQ-PROC-009, -010, REQ-CFG-007 |
| (release) | Integration: Case **ItemEntersToStep** "Complete questionnaire" → 7 × `CreateAndSubmitItem` into `CIQ_Questionnaire_Part` (Part_Group literal; Part_Sections ← Active_PGn; Case ref) | system | **Native fan-out.** Integrations allow 1 trigger and ≥1 action; field copy only [MM §4.8]. Empty groups skip by condition | REQ-PROC-004 (release) |
| supplier-input | Part items "Fill in" (parallel, one per group) + Case "Complete questionnaire" | Supplier_Contacts | Native drafts; native required-when-visible validation; C2 checks every part and submits at PS-05 | REQ-PROC-011, -012, REQ-CTL-001 |
| (PS-05) | Case submit at "Complete questionnaire" | Supplier | PS05_Confirmation + name/e-mail + gate. Parts completed = **frozen review version** | REQ-PROC-014, -016 |
| review | Integration: Case **ItemEntersToStep** "BDF review" → `CreateAndSubmitItem` `CIQ_Review` (copies Case_ID, Review_Depts, versions, Review_Version) | system | Parallel branches with Act_X conditions. Unaffected departments get nothing | REQ-PROC-017, -018, -021 |
| review (loop) | `CIQ_Open_Point` and additional `CIQ_Questionnaire_Part` items | Department ⇄ supplier | Native send-back loop; static department steps | REQ-PROC-029…036, REQ-ADR-001/-002 |
| review (complete) | `CIQ_Review` X review (+ X final decision) | Department / Approver roles | Gate + Confirm + Decision | REQ-PROC-036, -038, -039 |
| (sync) | `CIQ_Review` auto-join → End; integration **ItemCompleted** → `Approve` the portal case step "BDF review" | system | Native join waits only for activated branches (S-04) | ReqDoc §3.2.1 |
| final-release | `CIQ_Case` "Final release" | Supplier_Contacts | **Its native assignment e-mail is the single supplier notification** | REQ-PROC-040, -042 |
| completed | `CIQ_Case` End | system | Natively frozen; no editable step remains | REQ-PROC-043, -045 |
| overall-approval (switchable) | Integration: Case ItemCompleted → `CIQ_Closure` → "Overall approval" (condition) | CIQ Overall Approver | Native step condition; native Reject with comment | AS-01; ReqDoc PS-12 |
| (PDF) | Integration: Closure ItemCompleted → GeneratePDF → `CIQ_Final_Document` (S-07) or C6 | system | | REQ-PROC-046 |
| cancelled | Case native *withdraw* by RMM (initiator) + `CIQ_Confirmation` (Cancellation) + C6 cascade | RMM | | REQ-PROC-049 |
| rejected | `CIQ_Review` "Outcome decision" native Reject → RMM natively **Rejects** the case at "BDF review" (RMM is the assignee there) with a neutral comment | Overall Approver, RMM | | AS-02 |

### 5.2 How the dynamic set of departments is handled

1. **Activation is data.** C1 computes `Review_Depts` at the scope check from the pinned `CIQ_Ownership_Version`: the lead departments of all M/O sections, which is the prototype's AS-07/OP-18 assumption. C1 writes it to the case.
2. **The fan-out is native.** The integration copies `Review_Depts` into `CIQ_Review`. Each branch carries the step condition `Act_X`, so **exactly** the affected departments get a task and an e-mail. A department that is not activated gets nothing (REQ-PROC-017) [MM §4.6].
3. **The sync is native.** The Parallel node auto-joins at the next sibling. Skipped branches must not block the join, and an item whose branches are all false must reach End (**S-04**).
4. **Late activation in Part 2** (a re-derivation adds a department, W-11). A running Parallel node cannot grow a branch. Native-first answer: a new `CIQ_Review` item with `Reopen_Of` set, carrying only the new department (Act flags), created by C1 under RMM's re-derivation. The case's "BDF review" step is approved only when **both** items have completed: C1 sets `Review_Items_Open` on the case, and the RMM approves by hand if needed (stuck-case tile, C7). This edge case stays partly custom.
5. **Reopening a completed department** (REQ-RMES-012, prototype `reopenReview`) works the same way: a new review item carrying that department only. Reopening after the supplier's final release is impossible by design, because the case is frozen.
6. **Shared sections** (K2.2, K6.14, K6.17; OP-18): the lead department completes. Co-reviewers read the section and raise open points under their own department, which then block *their* branch only if they are activated. This follows the prototype's assumption and stays configurable through `Section_Owners.Co_Depts`.
7. **Customs and Legal** are informed only (AS-07). They get no branch, only read grants and a notification list.

### 5.3 How the supplier steps work

- **Assignee.** Every supplier step (Case: Basic data, Complete questionnaire, Final release; Part: Fill in; Open Point: Supplier response) is assigned to the **User field `Supplier_Contacts`**. On parts and open points that field is autofilled from the case (S-N14). This needs a **dynamic assignee from a field**: **S-01**. Our manual says the *engine* cannot author this ("no dynamic per-record assignee") [MM §4.6]. The builder may be able to. If neither can, isolation needs T4.
- **Several contacts.** Each contact on the list can act ("any one"). Different section groups are different items, so two contacts on two groups never collide (N4). Two contacts on the *same* group depend on S-03. The group map is data, so BDF can split a hot group.
- **Supplier-side assignment** ("only the supplier assigns", REQ-CTL-001) is `Supplier_Section_Owner` (Email) on each part. It is data and opens no user picker (§6 L8).
- **One task per request** (REQ-PROC-030). Each open point and each additional part is its own item, so the supplier gets its own native task and e-mail for each.
- **Single release notification** (REQ-PROC-040). Only the case's "Final release" step notifies after the join, because department completions sit on the internal `CIQ_Review` item. **S-08** confirms that assignment e-mails can be kept free of internal content, and checks whether the e-mails per part at release can be reduced to one digest. Otherwise we have a notification flood (07 E-P-92).
- **Change of a configuration answer during PS-04** (REQ-CFG-008): the supplier natively **sends back** "Complete questionnaire" → "Scope check" with a mandatory comment. RMM re-runs C1. The diff is stored on `CIQ_Scope_Run`. The parts' `Part_Sections` are updated through the process-admin route (S-N10). Values in sections that are now hidden are retained (S-N1b), so a revert restores them (REQ-CFG-009).

### 5.4 Workflow-authoring rules that bite here

- **StartEvent defaults all fields to Editable.** Set every supplier, decision and gate field to ReadOnly at Start [MM §4.6, §14 #53].
- **Add a terminal End marker to every process** [MM §4.6, §14 #54].
- **Conditions are `Activity::Expression` formulas using `=`**, never Criteria [MM §4.6, §14 #52].
- **Do not model "Rejected" steps**, because native reject and send-back exist [MM §3.6, §14 #81]. Exception: in `CIQ_Review` a department's rejection is a *field*, so it does not kill the parallel item (S-N9).
- **One Permission entity per (Activity, Column).** The questionnaire-part form has about 150 fields × 9 steps ≈ 1,350 Permission entities. Run the hygiene check (dedupe) before every putDraft [MM §3.3, §4.6, §14 #57]. S-10 measures publish time.
- **A field added after the workflow exists gets no per-step permission** and is blocked everywhere. Use the `add-field` patch verb, which adds them [MM §3.3, §14 #56]. This matters for REQ-CFG-001 additions such as K6.3.

---

## 6. Roles, grants, isolation

### 6.1 Roles

The default roles **Admin** and **User** exist in every container; reuse them and do not recreate them [MM §3.2].

**App roles (internal):**

| Role | Members (synthetic in the MVP) | Purpose |
|---|---|---|
| Admin (default) | 2 named platform admins **only** | Process admin. The admin update and delete routes bypass the freeze; see R10 |
| User (default) | — | No grants |
| CIQ RMM | Raw Material Managers | Owns cases, runs the scope check, cancels, sees everything |
| CIQ Regulatory Reviewer / Safety Reviewer / QM Reviewer / Microbiology Reviewer / Sustainability Reviewer | Department reviewers | Branch steps, criteria, findings |
| CIQ Regulatory Approver / Safety Approver | Authorised decision makers | REQ-RMES-013 final decisions |
| CIQ Customs / CIQ Legal | Informed departments | Read-only (AS-07) |
| CIQ Overall Approver | TBD (W-02) | Switchable PS-12 decision |
| CIQ Business Admin | Configuration owners | Configuration drafts, masters, registry |
| CIQ Config Approver | Second person | Four-eyes publishing |
| CIQ Auditor | Auditors | Read all, plus the audit registers |
| CIQ Business Owner | Process owner | Reports |

**Portal roles.** Mirror roles are needed because a portal step's AppRole must belong to the portal container (PORTAL-UNVERIFIED, P-02).

| Role | Members |
|---|---|
| Admin (portal default) | Platform admins |
| CIQ Supplier Contact | **External users, all suppliers.** Isolation is never by role (§6.3) |
| BDF RMM | = CIQ RMM members |
| BDF Regulatory / BDF Safety / BDF QM / BDF Microbiology / BDF Sustainability | = the matching reviewers. They act on open-point and additional-part review steps and raise open points |
| BDF Read Only | Customs, Legal, Auditor, Owner, the approvers |
| BDF Config Admin | = CIQ Business Admin; maintains `CIQ_Active_Config` |

Membership is set with `PUT /app_role/2/{acc}/{roleId}?_application_id={container}` and `Users:[{_id,Name,Kind:"User"}]`. That call is flaky (about 1 in 15), so retry and **verify with a per-role GET (`UserCount`)** [MM §3.2]. Mirror-role membership is kept equal to the app role by a small sync script (Appendix C).

### 6.2 Grant matrix

`POST /flow/2/{acc}/{family}/{flow}/member/batch?_application_id={container}` with `_application_id` in the body [MM §3.4].

Notation:
- **M+I** = Member, `["InitiateItems"]`
- **M** = Member, `[]` (participates, cannot raise)
- **V-p** = Member, `["View"]` (read-only process)
- **R** = report View grant
- **F-E** = Form Member (edit; `["Delete"]` per our manual, see trap T12)
- **F-V** = Form Viewer, `[]`
- — = no access at all

**Portal:**

| Flow | CIQ Supplier Contact | BDF RMM | BDF dept reviewers | BDF Read Only | BDF Config Admin |
|---|---|---|---|---|---|
| CIQ_Case | **M only if S-02 shows participation needs membership, else —; never R** | M+I, R | M, R | V-p, R | — |
| CIQ_Questionnaire_Part | **M or —; never R** | M+I, R | M+I (additional parts), R | V-p, R | — |
| CIQ_Open_Point | **M or —; never R** | M+I, R | M+I, R | V-p, R | — |
| CIQ_Change_Request | **M+I; never R** | M, R | V-p, R | V-p, R | — |
| CIQ_Active_Config (Form) | — | F-V | F-V | F-V | F-E |

**App** (the supplier has nothing here):

| Flow | RMM | Dept reviewers (each) | REG/SAF Approver | Customs/Legal | Overall Approver | Business Admin | Config Approver | Auditor | Owner |
|---|---|---|---|---|---|---|---|---|---|
| CIQ_Supplier / _Contact / _Raw_Material | F-E | F-V | F-V | F-V | F-V | F-E | F-V | F-V | F-V |
| CIQ_Field_Registry, _Text_Module, _Reminder_Rule | F-V | F-V | F-V | F-V | F-V | F-E | F-V | F-V | F-V |
| Config processes (#10-#14) | R | R | R | R | R | M+I, R | M, R | R | R |
| CIQ_Scope_Run | M+I, R | R | R | R | R | R | — | R | R |
| CIQ_Review | M, R | M, R (acts on own branch) | M, R | R | M, R | — | — | R | R |
| CIQ_RMES_Criterion_SAF | F-V | Safety: **F-E**; others F-V | SAF Approver F-V | F-V | F-V | — | — | F-V | F-V |
| CIQ_RMES_Criterion_REG | F-V | Regulatory: **F-E**; others F-V | REG Approver F-V | F-V | F-V | — | — | F-V | F-V |
| CIQ_Finding | R | Safety/Regulatory: M+I, R; others R | R | R | R | — | — | R | R |
| CIQ_Internal_Note | M+I, R | M+I, R | M+I, R | M+I, R | M+I, R | — | — | R | R |
| CIQ_Confirmation | M+I, R | M+I, R | M+I, R | R | M+I, R | — | — | R | R |
| CIQ_Delegation | R | M+I, R | M, R (approve) | — | — | — | — | R | — |
| CIQ_Closure | R | R | R | R | M, R | — | — | R | R |
| CIQ_Final_Document | R | R | R | R | R | — | — | R | R |
| CIQ_Audit_Event | M+I, R | M+I | M+I | — | M+I | M+I | — | R | — |
| CIQ_Notification_Log | R | — | — | — | — | R | — | R | — |

### 6.3 Known escalation traps (and what we do about each)

| # | Trap | Source | Mitigation |
|---|---|---|---|
| T1 | `Editable` on a Process silently includes `InitiateItems`. There is no "act on my step but can't raise" grant, so reviewers become co-initiators of `CIQ_Review`, `CIQ_Case` and so on | [MM §3.4, §4.7, §14 #20] | Prefer the `M` (`[]`) shape through raw REST and read it back. If the engine forces M+I, hide "+ New" on pages and audit unexpected items |
| T2 | **Page auto-grant.** A native page card on a flow grants role membership + report View on *every* flow it references, and **escalates viewers to Editable** | [MM §3.4, §4.7, §14 #21] | **No native page for the supplier role references any CIQ flow.** Suppliers use the native task inbox and item forms (or a custom portal UI). On app pages, criterion forms only appear on the owning department's page. **Re-run the grant read-back after every page apply** |
| T3 | Report View = **all items** of the flow | [MM §3.4, §4.7] | Never give R to CIQ Supplier Contact. S-02 tests it |
| T4 | Roles start with `UserCount 0` and submit fails with 403 | [MM §3.2, §14 #7] | Add members, verify by GET, final membership pass |
| T5 | `423` grant lock during publish | [MM §3.4, §14 #16] | Serial grants with retry, a final re-grant pass, and a status check of each grant response |
| T6 | `scope: my-items` is a view convention, not row security | [MM §4.7] | Never cite it as isolation; use only §6.4 L3 |
| T7 | Missing default page, nav `VisibleTo` or flow access → "role sees nothing" | [MM §4.7 trifecta] | Every role has a landing page (internal) or the task inbox (supplier) |
| T8 | Cross-app *linked-role* grants may need a tenant admin in Studio | [MM §6.7, §11 rule 4] | Portal mirror roles; ask for the tenant admin early |
| T9 | Admin role = process admin → admin update and delete routes | [MM §3.6, §14 #11] | 2 named members; hash chain (§7.5); VQ r12 wording reframed (07 §8.2) |
| T10 | A Case/Board grant with `["Delete"]` is rejected | [MM §3.4, §14 #17] | N/A (no boards) |
| T11 | Dataset sharing is UI-only | [MM §11.4] | Lists only |
| T12 | A Form "edit" grant shape carries `["Delete"]`. Criterion rows could then be deleted by their own department | [MM §3.4 table] | S-N13 tests `Member` + `[]`. Otherwise C3 checks the row count against the template and logs an Audit_Event on a mismatch |

### 6.4 Supplier isolation and internal confidentiality

| Layer | Control | Proven by |
|---|---|---|
| L1 Container | Internal-only flows live in the app (T1). The supplier role does not exist there | P-01, P-02 |
| L2 Flow grant | The supplier role never has report View. It is a Member only where it must raise items (`CIQ_Change_Request`), or where participation needs membership | S-02 |
| L3 Item participation | A supplier sees only items where they are an assignee (via `Supplier_Contacts`) or the initiator (change requests) | **S-01, S-02** (the load-bearing pair) |
| L4 Field design | Supplier-visible flows hold **no** internal content: no decisions, no rule justifications, no RMES, no findings text, no internal notes (N3). Review_Depts and the section lists are routing data, not assessments | Review of the field lists (§3.2) |
| L5 Comments and history | Internal discussion happens only in `CIQ_Internal_Note`. Comments on portal steps are labelled "visible to supplier" (RMM scope check, department review) | S-08 (what history a supplier participant sees) |
| L6 E-mails | Assignment e-mail templates are checked for leaks. No internal fields in any template | S-08 |
| L7 Pages | No native page cards on CIQ flows for the supplier role (T2) | Grant read-back after page apply |
| L8 Directory leak | A User-field picker in the portal might list **other suppliers' contacts**. Suppliers never edit a User field: contacts are set by RMM, and supplier-side assignment is an Email field | Review of the field lists; S-02 |
| L9 Test | Two synthetic competing suppliers; a "leaky-vs-scoped" fixture; a leak test per channel: inbox, item URL, `kf.api` GET of the other supplier's item and attachment, search, reports, e-mails, history, PDF | [MM §6.7, §9.4]; 07 move 3 |
| Internal confidentiality | All internal roles read all project content and edit only their own area (REQ-PROC-019). This is enforced by step permissions on `CIQ_Review`, department-split criterion forms, and static department steps on open points and findings. RMES is never in a portal flow (REQ-RMES-015). Customs and Legal are read-only | §6.2 |

---

## 7. Versioning and immutability

### 7.1 Questionnaire template (REQ-CFG-001): native, with one honest gap

- **A question is a native field** in `CIQ_Questionnaire_Part`. **A version is a `CIQ_Template_Version` process item** (frozen at publish).
- **The case pins `Template_Version_No` at creation** (autofill snapshot, N6). C1 only puts a section into `Part_Sections` if the pinned template contains it.
- **New content is additive** (N7). The admin adds the K6.3 fields with the `add-field` patch verb, or in the builder in the **dev** environment. The section visibility is version-gated (`Template_Version_No >= 2`). Promotion to prod is the "publish without an IT ticket" step: Kissflow dev/prod [MM §1.1], P-06.
- **Result.** A running v1 case never shows K6.3 and a new case does. This is the BRM REQ-CFG-001 scenario.
- **Gap.** Changing the *label or help text* of an existing published field changes it for running cases. Native-first answer: freeze labels; put changing guidance into a version-gated "info" field; or accept cosmetic drift with an Audit_Event. **If BDF tests "a help-text change does not affect a running case" literally, only a data-driven template renderer (07 F-01/F-02) passes.** This is a risk to raise.
- **Builder rights.** The business administrator needs builder (developer) rights on the portal to add fields. That is "no IT ticket" but it **is** builder work. Reframe CIA #4 accordingly (07 §8.1).

### 7.2 Rule set, ownership, RMES template, limit set (REQ-CFG-003, -006; REQ-RMES-002, -008)

- **One frozen process item per version.** Rows sit in a child table. Four-eyes approval is the Config Approver step. Completion makes the item read-only (N5, S-N7).
- **Copy-forward** to a new draft is C5, because integrations cannot copy child rows [MM §4.8].
- **Pinning.** Cases pin version *codes*. C1 and C3 load exactly the pinned items, so the same inputs and the same version give the same result (REQ-PROC-009).
- **Regression.** C5 replays reference cases against draft and published versions before approval (prototype `RegressionCheck`). The report is attached as `Regression_Report`.
- **Tamper evidence.** `Config_Checksum` (SHA-256 over the rows, written by C5 at publish) is verified by C1 and C3 at load. A mismatch blocks derivation and writes an Audit_Event.

### 7.3 Review version (REQ-PROC-016) and Part 2 changes

- **PS-05** submits every part, which freezes it [MM §3.6]. `Review_Version` = 1.
- **Every Part 2 assessment** references Review_Version and the part item ids (criteria `Source_*`).
- **Part 2 changes are append-only deltas**: an open-point answer with `Corrected_Value` and `Answer_Document`, or an accepted `CIQ_Change_Request`. The "current" CIQ = the frozen v1 plus accepted deltas, so history can be restored by construction.
- **A formal resubmission** (W-09) creates new part items (Review_Version + 1, copied by C2) and a new `CIQ_Review` item. That is one RMES record per confirmed version (REQ-RMES-001, -016).

### 7.4 Freeze at final release (REQ-PROC-043)

When the case reaches End, no editable step remains anywhere. Parts are already completed. Open points must all be closed, because the department gates require it before the join. Natively, an edit is **impossible**: there is no edit affordance.

**Gap.** "A change attempt is rejected **and logged**." Native offers nothing to attempt, so nothing is logged. A literal test needs a C7 UI that offers "request change" after release and logs the refusal as `Change attempt refused`.

### 7.5 Audit (REQ-CTL-009, REQ-RMES-016)

**Layer 1: native item history** on every process item: step, actor, time, action, send-back comments [MM §6.2 `getProgress`]. That covers submission, review, query, answer, release, rejection and the decisions.

**Layer 2: write-once registers** (`CIQ_Scope_Run`, `CIQ_Confirmation`, `CIQ_Internal_Note`, `CIQ_Final_Document`, `CIQ_Notification_Log`, `CIQ_Audit_Event`). They are created and submitted, so they are Completed and read-only (S-N7). `CIQ_Audit_Event` holds only what native history misses:
- scope derivation, manual extension and re-derivation diff
- change accepted and impact flagged
- reassignment and delegation used
- cancellation cascade
- PDF hash
- config published
- refused change attempts

**Hash chain.** Each event stores `Prev_Hash` and `Event_Hash`. A C7 verifier shows breaks. This keeps the record tamper-evident even against the admin routes (T9).

**Per-answer attribution** (REQ-CTL-001 "per answer"). Native = part-level `_modified_by` plus whatever field-level history Kissflow keeps (**S-N5**). If S-N5 fails, the only native-first fallback is a custom field-change logger, which is heavy. Raise it as a risk and propose part-level attribution with section-granular parts.

---

## 8. Open points, queries, document requests, findings

### 8.1 Object model

| Concept | Carrier | Object reference | Status / traffic light |
|---|---|---|---|
| Query / document request / finding query | `CIQ_Open_Point` | `Ref_Kind` + `Ref_Section` + `Ref_Field_ID` + `Ref_Part` (Reference) + `Ref_Row_ID` (child-row `_id`) + `Ref_Doc_Name/Version` + `Ref_Finding_Code` + **`Ref_Label` (Req)** | `_current_step`: Supplier response = **red / open**; Review answer – X = **amber / in progress**; End with Review_Outcome = **green / closed** (REQ-PROC-034, W-20 default) |
| Additional part | `CIQ_Questionnaire_Part` with `Is_Additional = Yes` | `Part_Sections` (the activated section) + AP_* fields | Fill in = red; additional-part review = amber; End = green |
| Supplier change request | `CIQ_Change_Request` | Ref_Section / Ref_Field_ID / Ref_Label | RMM step = amber; End = closed |
| Finding (internal) | `CIQ_Finding` | Criterion_Code / Row_ID + Source_* | Internal only; open until Finding_Closed |
| Finding → query | C3 or C7 button (or copy by hand) creates a `CIQ_Open_Point` with `Ref_Kind = Finding`, `Ref_Finding_Code`, and the supplier-safe question; sets `Linked_OP_ID` on the finding | — | REQ-RMES-010 |

### 8.2 Rules mapped to native mechanics

| Requirement | Native mechanism |
|---|---|
| "No reference → cannot send" (REQ-PROC-029) | Step-Mandatory `Ref_Kind`, `Ref_Section`, `Ref_Label` at Start |
| "No responsible or due date → cannot send" (REQ-ADR-001) | Step-Mandatory `Responsible_BDF`, `Due_Date`, `Justification` at Start |
| "Only the responsible department sets the status" (REQ-PROC-034) | The review step is owned by the static department role chosen by `Raising_Dept`. Others cannot act [MM §4.6]. A documented reassignment is a native task reassign plus a `CIQ_Delegation` record |
| "Every status change records person, time, result, evidence version" | Step history (person, time, action) + `Review_Outcome` + `Accepted_Evidence_Version` (Req at the review step) |
| "Rejected answer goes back with justification; unlimited loop" (REQ-PROC-034/-035) | Native **send-back** to Supplier response with a mandatory comment [MM §3.6] |
| "Answer, document or justified non-delivery" (REQ-PROC-032) | Answer / Answer_Document / Cannot_Provide + Cannot_Provide_Reason (required when visible, S-N1) |
| "Full history at the object" (REQ-PROC-033) | One item per point. Its native history *is* the thread (S-08 checks what the supplier sees) |
| "All open points block completion; each named" (REQ-PROC-036) | `Is_Open_X` → `CIQ_Review.X_Open_Points` aggregate → `X_Gate` required (S-05, S-N3). **C4** renders the named blocker list (type, section, status, responsible) |
| Jump target (REQ-PROC-029 "points to exactly that field") | **Native: item-level.** `Ref_Part` opens the frozen part, and `Ref_Label` names the exact field or row. **Field-focus jump is custom**: a C7 portal page that deep-links into the section and highlights the field, as the prototype does |
| "Open requests block overall approval" (ReqDoc §6.2) | The case can only reach "Final release" after the join, and the join needs every gate to be OK |

---

## 9. RMES model

| Element | Carrier | Notes |
|---|---|---|
| RMES record (one per confirmed CIQ version; CIQ version + timestamp) | **`CIQ_Review` item** | Created at PS-05 by integration (REQ-PROC-021). App container, so a supplier has no route to it (REQ-RMES-015) |
| Criteria template, Parts A-D, versioned | `CIQ_RMES_Template` child rows | REQ-RMES-002; historical evaluations untouched because rows are copied at instantiation |
| Criterion results | `CIQ_RMES_Criterion_SAF` / `_REG` rows | **C3** instantiates them in the department's own session: each department creates only its own rows, so there is no race; idempotent on (Review, Criterion_Code). Applicability comes from `Applicability_Condition` against the scope and markets (REQ-RMES-004). Pre-fill comes from the frozen parts through `Source_Field_ID` → `CIQ_Field_Registry.Native_Field_Id`, with `Source_*` populated (REQ-PROC-022, REQ-RMES-005) |
| Result rules | Native Select; `Is_Pending` / `Is_Negative_No_Comment` helpers → aggregates on `CIQ_Review` → `X_Gate` | REQ-RMES-006, -007; REQ-PROC-039 |
| Quantitative limit checks | Criterion limit block; `Limit_Pass` formula on own fields (values copied by C3 from the pinned `CIQ_Limit_Set`) | REQ-RMES-008 reproducible: Limit_Set_Version is stamped on the row. An exceedance makes C3 create a **blocking** `CIQ_Finding` automatically (07 BR-13) |
| Findings | `CIQ_Finding` process | REQ-RMES-009, -010, -011 |
| Reopening on source change | C1/C3 set `Impacted = Yes` (Impact_Note) on criteria whose `Source_Field_ID`/`Source_Part_Item_ID` match an accepted change. `Impacted` rows count as pending until re-assessed or confirmed "no impact" | REQ-RMES-012 |
| Final Safety / Regulatory decisions | `CIQ_Review` "X final decision" steps (static Approver roles) | REQ-RMES-013. A Regulatory user cannot act on the Safety step without delegation (REQ-PROC-039, REQ-RMES-003) |
| Approval gate | Overall approval reachable only after the join, where every gate is OK; `Any_Rejected` routes to "Outcome decision" | REQ-RMES-014 |
| RMES dashboard (7 states) | `X_Track_Status` formula + `_current_step` → native report grouped per department; "overdue" from step SLA or Due_Date | REQ-RMES-018 (native report); a richer view is C7 |
| Export | `CIQ_Final_Document` Doc_Kind = RMES export (GeneratePDF S-07 or C6) | REQ-RMES-020 |
| AI suggestion | Criterion AI block; inference through a BDF-approved endpoint called by C3 or an HTTP connector (plan-gated native agents [MM §4.8, §15]) | REQ-PROC-024 (MVP partial) |

---

## 10. Custom UI: what stays native, and how the custom pieces read and write

### 10.1 What stays native

- **Forms:** every questionnaire form, field and child table, with visibility formulas, required-when-visible rules and native validation.
- **Steps and tasks:** all step routing, tasks, the task inbox, assignment e-mails, send-back loops, reject and withdraw.
- **Data handling:** attachments at the question; parallel branches and the join; step-level field permissions; aggregates and formulas.
- **Masters and configuration editing:** native forms and child tables.
- **Reports and charts** for basic dashboards.
- **Item history** as audit layer 1.

### 10.2 Custom pieces

| # | Piece | Kind [MM §6.1, §6.9] | Runs as | Reads | Writes | Requirements |
|---|---|---|---|---|---|---|
| C1 | **Scope engine**: a pure deterministic evaluator (the prototype's `rules.ts` semantics: union, mandatory > optional > N.A., "no rule fired" flagged) plus a scope-check UI with manual extension (justification required) and diff | App page component (or field component on the case step, P-08) | RMM (assignee of "Scope check") | Case SF answers (`kf.api` portal path, P-07); pinned `CIQ_Rule_Set` / `CIQ_Template_Version` / `CIQ_Ownership_Version` rows (SDK `getItem`, S-06) | Case `Config_Flags`, `Active_*`, `Review_Depts`, `Scope_Run_ID` (assignee route `POST /process/2/{acc}/{proc}/{item}/{act}` [MM §6.6]); `CIQ_Scope_Run` + `Scope_Items` (create + submit; child rows through `initForm → getTable().addRow` [MM §6.2]); `CIQ_Audit_Event` | REQ-PROC-009, -010, REQ-CFG-003, -007, -008, -009 |
| C2 | **Completeness confirmer**: per part `initForm(id)` → `getValidationErrors()` → blocker list grouped by section → then `submitItem` for each part (sequential) → enables the case submit | Portal field or page component (P-08); native fallback: individual part submits + `PS05_Gate` | Supplier | Part items (participant) | Part submits; `Review_Version` | REQ-PROC-012, -014, -016 |
| C3 | **RMES initialiser**: instantiate criteria, pre-fill with source refs, limit checks, automatic findings, impact flags | App field component on the "Safety review" / "Regulatory review" steps | Safety or Regulatory reviewer | Pinned RMES template and limit set; frozen parts; Field Registry | Criterion rows (sequential dataform create + submit [MM §3.5]); `CIQ_Finding`; `CIQ_Review.Scope_Run` | REQ-PROC-021, -022, REQ-RMES-004…009, -012 |
| C4 | **Blocker list**: read-only list of open points, additional parts, pending criteria and blocking findings with type, section, status and responsible | App field component on department steps | Reviewer | OP / Part (portal, `kf.api`), criteria, findings | — | REQ-PROC-036 "each named" |
| C5 | **Admin helpers**: copy-forward draft from version, checksum at publish, regression runner over reference cases | App page (Business Admin) | Business Admin | Configuration items; reference cases | New draft items and child rows; `Config_Checksum`; `Regression_Report` | REQ-CFG-001, -003 |
| C6 | **Operations**: due-date reminder and escalation job (from `CIQ_Reminder_Rule` + open-point `Due_Date`), PDF fallback renderer (if S-07 fails; draw on a template, never flatten [MM §6.15]), cancellation cascade (withdraw parts and open points, end tasks, verify none left) | Scheduled runner (Scheduler trigger → HTTP → a small service with server-side keys [MM §4.8, §6.7]) **or** an RMM "send reminders" button in the MVP; cascade = RMM page action | Service / RMM | OPs, parts, reminder rules | Notification_Log, Audit_Event, Final_Document | REQ-RMES-019, REQ-PROC-046, -049 |
| C7 *(optional, for prototype parity)* | **Review workspace** (sections + criteria + open points side by side), **RMM cockpit** (bottlenecks without opening cases, per-section status roll-up), **auditor reconstruction**, **supplier portal page** with field-exact jump and per-section progress | App custom UI pages (architecture A or B [MM §6.1]); portal custom page (P-08) | Each role (gated by `kf.user.AppRoles`, never the dev switcher as a gate [MM §6.7]) | All of the above | Same write paths as native | REQ-CTL-006 (section level), REQ-PROC-029 (field jump), REQ-PROC-043 (attempt log) |

### 10.3 Rules for every custom piece

- **No admin keys in any bundle.** Components use the signed-in user's session (`kf.app.*`, `kf.api`) [MM §0.2 #4, §6.7].
- **`kf.api` bodies are plain objects**, never `JSON.stringify` [MM §6.3]. Evaluate `isLive()` on every call.
- **Dataform creates are strictly sequential** (`for … await`), with a refresh at the end; never keep the draft id [MM §3.5, §14 #25]. **Child-table writes are sequential** [MM §6.6].
- **Writes are verified by read-back.** A `050313 PermissionDeniedToUpdate` names the fields to strip [MM §6.6].
- **Every component has a designed empty, error and "all fine" state**, and a failure is scoped to that component [MM §6.13].

---

## 11. Later integrations: keys to store now

| System | Direction (later) | Key fields we create now | Mechanism later [MM §4.8] |
|---|---|---|---|
| Teamcenter / IRMA (case start, CIA #1) | TC → Kissflow | `CIQ_Case.External_Source`, `Teamcenter_Request_ID` (idempotency key), `BDF_Material_No`; `CIQ_Raw_Material.Teamcenter_Item_ID`, `IRMA_Ref` | Webhook trigger → `CreateAndSubmitItem` CIQ_Case (StartEvent only, as API keys can only submit the StartEvent [MM §3.6]); dedupe on `Teamcenter_Request_ID` |
| Teamcenter status feedback (CIA #18) | Kissflow → TC | `Case_ID`, `BDF_Material_No`, final status from `_status`; `CIQ_Audit_Event` (PDF generated) | Case/Closure ItemCompleted → HTTP connector |
| B-Flow DMS (CIA #12, #15) | Kissflow → B-Flow | `CIQ_Final_Document.BFlow_Document_ID`, `BFlow_Filed_At`, `Technical_Title`, `File_SHA256`; later a per-evidence register with `Original_Title` / `Technical_Title` (REQ-RMES-017) | HTTP / middleware (file transfer unproven) |
| SAP MDG (supplier master) | SAP ↔ Kissflow | `CIQ_Supplier.SAP_Vendor_No`, `Supplier_DUNS` (natural key), `Teamcenter_Supplier_ID`; `CIQ_Raw_Material.SAP_Material_No` | Scheduler + HTTP + upsert by natural key (idempotent second pull [MM §6.15, §8.2]) |
| SSO (CIA #20) | — | none (platform setting) | Entra ID SAML for BDF users. Supplier authentication: invitation + MFA (Q-15) |

Integration limits to design around: exactly 1 trigger and at least 1 action; no field-change trigger; no arithmetic; no per-row loops; no multi-create; a human must activate; created integrations cannot be deleted through the API [MM §4.8].

---

## 12. Build order

This follows [MM §4.11] and [MM §16-R1], adapted for two containers. Every step ends with a **read-back**.

| # | Step | Detail | Verify |
|---|---|---|---|
| 0 | **Read-only first** | Credentials check with `GET /flow/2/{acc}/portal/{APP_ID}/flow` and `…/{PORTAL_ID}/flow`, then the role lists of both containers (P-01). No writes until D-1 | Printed inventory |
| 1 | **Spikes** (§13) on real, reusable shells. The first `CIQ_Case` shell **is** the spike, because flows are effectively permanent [MM §3.9] | Decide T1 / T1b / T3 / T4 (D-1) | Spike log in `MEMORY-LOCAL.md` |
| 2 | **Roles** in both containers (reuse Admin/User; `POST /app_role/2/{acc}/`) | App: 17. Portal: 10 | `GET /app_role/2/{acc}/list` |
| 3 | **Role members** (synthetic test users: 1 per internal role, 2 suppliers × 2 contacts) | `PUT … Users[]`, retry | Per-role GET `UserCount` [MM §3.2] |
| 4 | **Lists**, PASS 1 shells + PASS 1b items, both containers | §4 | `GET /flow/2/{acc}/list/{id}/items` exact strings |
| 5 | **Masters and catalogues** (app): Supplier, Supplier_Contact, Raw_Material, Field_Registry, Text_Module, Reminder_Rule | Forms; `Supplier` before `Contact` / `Raw_Material` (referenced before referencer) | Draft → publish → fields GET |
| 6 | **Configuration processes** (app): Template_Version, Rule_Set, Ownership_Version, RMES_Template, Limit_Set (child tables) | Seed v1 items (RS-2026.1, CIQ-2026 v1, ownership, RMES criteria, BDF-LIM-2026.1) and walk them to End as Business Admin + Config Approver | Items Completed; rows read back |
| 7 | **`CIQ_Active_Config`** (portal form) + its 1 row | Pointing at the v1 codes | Row read back |
| 8 | **Portal runtime**: `CIQ_Case` → `CIQ_Questionnaire_Part` (refs Case) → `CIQ_Open_Point` (refs Case, Part) → `CIQ_Change_Request` | Fields, child table, visibility formulas | Publish; hygiene check; S-10 timing |
| 9 | **App runtime**: `CIQ_Scope_Run` → `CIQ_Review` → criterion forms (ref Review) → `CIQ_Finding` → registers, Delegation, Closure, Final_Document, Audit_Event, Notification_Log | | Publish |
| 10 | **Late-bound fields**: aggregates and lookups whose targets now exist (Case.Parts_Open; Review.X_* aggregates; part autofills) | `add-field` patch or graft with per-step permissions [MM §3.3, §4.9] | Values on a test item |
| 11 | **Workflows**: steps, Parallel node, conditions (`=`), per-step field permissions (Start ReadOnly overrides), End markers, SLAs | [MM §4.6] | Reachability check by hand [MM §4.1] |
| 12 | **Grants** (§6.2): member/batch per flow, serial with 423 retry; **final re-grant pass** | Supplier role: **no report grants** | `GET …/member` per flow; diff against the matrix |
| 13 | **Integrations** (drafts, server-resolved 2-pass): part fan-out, Part 2 start, review complete → approve case, closure, PDF, config pointer, notification log (~10) | **A human activates each one** [MM §4.8] | Trigger once each; read back |
| 14 | **Custom pieces** C1-C6 (+ C7 if chosen); internal native pages and nav (none on supplier-role pages that reference CIQ flows) | | Harness + live, role × page [MM §9.2] |
| 15 | **Seed**: deterministic synthetic data: 2 competing suppliers, the prototype's reference materials (CIQ-2026-0131…0150) | Sequential; ledger; masters first [MM §8.2] | Counts per flow |
| 16 | **Advance** one case end-to-end **as real assignees** (supplier login, each department login) | API keys cannot advance past Start [MM §3.6, §15] | Step history |
| 17 | **QA**: role × flow matrix, leak test per channel, the 32 BRM scenarios, then a re-grant read-back | | Report + `HANDOFF.md` |

---

## 13. Risks and spikes (run as soon as we have the keys)

Setup for every REST call:
```
set -a; . ./.env; set +a
H=(-H "X-Access-Key-Id: $KF_ACCESS_KEY_ID" -H "X-Access-Key-Secret: $KF_ACCESS_KEY_SECRET" -H "Content-Type: application/json")
B="https://$KF_DOMAIN"; A=$KF_ACCOUNT_ID
```
Keys stay in `.env` and never in chat or docs [MM §1.1].

### 13.1 Day 1: load-bearing (decide topology D-1 at the end of the day)

| Id | Question | Exact check | Pass | If it fails |
|---|---|---|---|---|
| **P-01** | What are the two containers? | `curl "$B/flow/2/$A/portal/$PORTAL_ID/flow" "${H[@]}"`; same with `$APP_ID`; `curl "$B/flow/2/$A/application/$PORTAL_ID" "${H[@]}"`; `curl "$B/flow/2/$A/app/$PORTAL_ID/info" "${H[@]}"`; `curl "$B/app_role/2/$A/list?_application_id=$PORTAL_ID" "${H[@]}"` | Both resolve; portal roles list | Ask the account owner what the portal id points to |
| **P-02** | Can we author in the portal, and can internal users hold portal roles? | `POST $B/flow/2/$A/process/?_application_id=$PORTAL_ID {"Name":"CIQ Case","Description":"CIQ supplier-facing case"}` → `GET /metadata/2/$A/process/{id}/draft` → PUT a 2-step blob → `POST …/publish`. `POST $B/app_role/2/$A/ {"Name":"BDF RMM","_application_id":"$PORTAL_ID"}` → `PUT /app_role/2/$A/{roleId}?_application_id=$PORTAL_ID {"Name":"BDF RMM","_application_id":…,"Users":[{"_id":"<internal user>","Name":"…","Kind":"User"}]}` → per-role GET `UserCount` | Flow published in the portal; internal user is a member | T4, or authoring in the builder UI only |
| **P-04** | How do external users exist? | Builder UI: invite 2 synthetic supplier users to the portal (the human does this; we never create accounts). Then create a case item with `{"Supplier_Contacts":[{"_id":"<portalUserId>"}]}` and read it back | A portal user can be put in a User field | Email field + T4 |
| **S-01** | Dynamic assignee from a field | Builder UI: on CIQ_Case "Basic data", assign to the **field** `Supplier_Contacts`. Create one item for supplier A. As A (separate browser profile): `kf.app.getProcess("<CIQ_Case id>").getMyTasksItems()` shows it; as B it does not | Task routes to the named contacts only | T4 (mediated layer); supplier steps cannot be native tasks |
| **S-02** | Row isolation for a non-admin participant | As supplier A: `getMyItems({status:"all"})`, `getParticipatedItems()`; `kf.api("/process/2/"+acc+"/<flow>/<B's item>/<B's act>?_response_type=full")` → expect 403 / `00010`; `kf.api("/process/2/"+acc+"/<flow>/myitems?_response_type=full")`; `kf.api("/flow/2/"+acc+"/process/<flow>/report?_application_id="+PORTAL_ID)` → expect 403; open B's attachment URL; global search for B's Case_ID. Repeat for all 4 portal processes | A sees only its own; every probe of B fails | T4 |
| **S-03** | Concurrent writes to different fields of one item | Two users at the same time: `proc.updateItem({instanceId, activityInstanceId:<REG act>, data:{REG_Review_Note:"x"}})` and `{…<SAF act>…, data:{SAF_Review_Note:"y"}}` on one CIQ_Review item; then `GET …?_response_type=full`. Repeat with two supplier contacts on one part item (same act) | Both values persist | CIQ_Review → per-department track items (07 design, with a custom sync); parts → one section per item |
| **S-04** | Parallel + conditions + join | 3-branch spike inside the real CIQ_Review shell: flags (Yes, No, Yes) → 2 tasks, then join; (No, No, No) → item reaches End. `proc.getProgress({instanceId})` | Native "wait only on activated" | Per-department items + C-sync (07 F-11) |
| **P-03** | Cross-container reference and aggregate | App form field Reference with QueryDefinition `LHSModel:<portal CIQ_Case id>`, `LHSModelApplicationId:$PORTAL_ID`; publish; create with `{"Case":{"_id":"<portal item>"}}`; read back. Then a SUM aggregate on CIQ_Review over portal `CIQ_Open_Point.Is_Open_REG` with `LHSModelApplicationId` [MM §4.4 shape 2] | Value resolves | **T1b**: move CIQ_Review, criteria, findings and Notification_Log to the portal |
| **P-05** | Cross-container integration | `POST $B/flow/2/$A/integration?_application_id=$APP_ID`: trigger = portal CIQ_Case `ItemEntersToStep` "BDF review"; action = `CreateAndSubmitItem` app CIQ_Review; resolve the fields with `GET …/integration/{id}/action/{actionEntityId}/fields`; PUT; publish; **the human activates**; move a case to the step; read back the review. Reverse: CIQ_Review `ItemCompleted` → `Approve` on the portal case | Items created and advanced | T1b (intra-portal integrations) or a manual RMM approval at "BDF review" |
| **S-N1** | Required-when-hidden (the native conditional-mandatory) and value retention | Field `X` Required with visibility formula: false → `POST /process/2/$A/{proc}/{item}/{act}/submit` succeeds; true + empty → 400 `FormValidationError` naming `X`. Hide → show: value retained, also after submit (S-N1b) | FLM's "mandatory if visible" is native | C2 validator does conditional-required in code; REQ-CFG-009 retention through Scope_Run snapshots |
| **S-N3** | Required formula gate | ReadOnly formula `Gate = IF(N=0,"OK","")`, step-Mandatory; with N=1 → submit 400 | Native completion gates | C4 component blocks the submit button; native submit stays possible, so this is a weaker gate |

### 13.2 Day 2: mechanics

| Id | Question | Exact check | Pass | If it fails |
|---|---|---|---|---|
| S-05 | Cross-flow aggregates (Process and Form targets) | Publish CIQ_Review with SUM over `CIQ_RMES_Criterion_SAF.Is_Pending` (Criteria `Review` = `_id`) and over Open_Point; create 2 rows; read the review | Live counts | C4 computes counts; gate is UI-only |
| S-06 | Child tables on process items via SDK; read back | `const f = await kf.app.getProcess("<Scope_Run>").initForm(id); f.getTable("<Scope_Items id>").addRow({...})`; GET full | Rows persist | Store scope items as JSON Textarea + flat text fields |
| S-N7 | Write-once process | Start→End process; create + `/submit` → `_status` Completed; a Member `POST …/{item}/{act}` update → refused | Immutable registers | Forms + hash chain |
| S-N8 | Section visibility formulas with `CONTAINS` on a Textarea | Part form, 3 sections gated on `Part_Sections` | Sections show and hide | One field per section flag (Yes/No) written by integration |
| S-N9 | Reject inside a Parallel branch | Native Reject on "Safety review" → whole item? Can reject be disabled per step? | Known behaviour; disable or train | Field-based decisions only (already the design) |
| S-N10 | Process-admin update from a user session | As RMM (process admin of Part): `kf.api("/process/2/"+acc+"/admin/<Part>/"+id, {method:"PUT", body:{Part_Sections:";K1;"}})` → read back | Re-derivation can update parts | Re-derivation = withdraw + recreate parts (data copied by C1) |
| S-N12 | Formulas on system fields | `IF(_status="Completed",0,1)`, `_request_number` in a formula | Clean `Is_Open` / Case_ID | Closure selects (already the design) |
| S-N14 | Autofill of a multi-User field through a Reference | Part/OP Reference to Case with autofill of `Supplier_Contacts`; then dynamic assignee on that field | Assignee resolves | Integration copies the users; C2/C1 write them |
| S-07 | GeneratePDF with a dynamic scope | Integration on CIQ_Closure `ItemCompleted` → GeneratePDF (template with a child table) → attach to `CIQ_Final_Document` | PDF filed | C6 renderer (webhook → render → attach) |
| S-08 | What a supplier participant sees, and e-mail control | As a supplier: history and `getProgress` on the case and an open point with internal step comments; read the assignment e-mails; check whether e-mails can be disabled or batched per step | No internal leak; e-mails controllable | Comment discipline + C6 digest sender |
| S-09 | Integration copying User fields and the dynamic assignee | CreateAndSubmitItem Part with `Supplier_Contacts` mapped → is the task assigned? Admin delete → `_deleted_by` present? | Fan-out works natively | C1 creates parts sequentially in the RMM session |

### 13.3 Day 3: limits and plan

| Id | Question | Exact check | Pass | If it fails |
|---|---|---|---|---|
| S-10 | Form size / permission volume | Publish Part with about 150 fields, 1 child table, 9 steps (about 1,350 Permission entities); time it; open the form | < 60 s publish; form usable | Split Part into 2-3 processes by part group (same fields, fewer per form) |
| S-11 | Plan | Decision Tables (`403 YourPlanNotSupport`?), portal user licence tier, AI features | Know the accelerators | Rules as data (default) |
| S-12 | Unique ID | SequenceNumber with prefix on CIQ_Case; create an item [MM §4.4, §14 #59] | Native ID | Text formula on `_request_number` (S-N12) or C1 writes the ID |
| S-N2 | Single-option Select as confirmation | Required Confirm field empty → submit 400 | Confirmations enforced | Mandatory text "type CONFIRM" |
| S-N4 | Native validation | Text regex or length (DUNS 9 digits), Number min/max | Native format checks | C-component input fields (DUNS, CAS) |
| S-N5 | Field-level change history | Edit 2 fields as 2 users; inspect the activity or history API and UI | Per-answer attribution is native | Part-level attribution + section-granular parts; or a C7 logger |
| S-N6 | Child-table reporting | Native report on `K21_Components` columns, filter INCI | K2.1 analysable per component (REQ-PROC-006) | Component register mirrored at freeze by C2 |
| S-N11 | Initiator withdraw at a later step | RMM withdraws a case sitting at "Complete questionnaire" | Native cancellation | Admin delete is not acceptable; C6 + a Cancelled flag |
| S-N13 | Form edit grant without Delete | member/batch `Role:"Member"`, `Permission:[]` on a criterion form; try edit and delete as that role | Edit without delete | Row-count check in C3 + audit |
| P-06 | Dev → prod for the portal | Builder UI: does the portal have a dev environment and a deploy? | REQ-CFG-001 "test environment" natively | Test mode: draft template version + test cases flagged (07 Q-16) |
| P-07 | `kf.api` from an app custom page to portal routes | As RMM in an app page: `kf.api("/process/2/"+acc+"/<CIQ_Case>/"+item+"/"+act+"?_application_id="+PORTAL_ID, {method:"POST", body:{Config_Flags:";SF12=No;"}})` → read back | C1/C4 can work across containers | Host C1/C4 in the portal |
| P-08 | Custom components in portal forms and pages | Builder UI: add a field component to a portal form | C2 (and C7 supplier page) possible | C2 → native fallback (individual part submits + `PS05_Gate`) |

### 13.4 Ranked risks

| Rank | Risk | Spikes | Mitigation |
|---|---|---|---|
| R1 | Portal semantics unknown: authoring, internal users, cross-container edges | P-01…P-08 | Topology ladder T1 → T1b → T3 → T4, with the same schema |
| R2 | No native dynamic assignee → supplier steps leak or cannot be native | S-01, S-N14 | T4 mediated layer (+3-5 days) |
| R3 | Supplier row isolation (one leak disqualifies) | S-02, S-08 | §6.4 layers + leak test per channel |
| R4 | Five departments writing one `CIQ_Review` item in parallel lose data | S-03 | Per-department track items |
| R5 | Required-when-hidden not native → conditional mandatory needs code | S-N1 | C2 validator |
| **R6** | **Expectation gap: the client validated a custom React prototype.** Native forms and the inbox look and flow differently (no guided scope preview, no side-by-side review, no field-exact jump, no RMM cockpit) | — | Show a native walkthrough early; budget C7 (+4-6 days) for the 3 screens BDF reacted to most; the data model is UI-agnostic, so C7 adds UI only |
| R7 | Configuration changes need builder rights; label and help-text edits are not version-pinned (CIA #4 / REQ-CFG-001 literal test) | P-06 | Additive rule N7; reframe CIA #4; a data-driven renderer if BDF insists |
| R8 | A form with ~150 fields × 9 steps → publish hygiene and performance | S-10 | Hygiene check; split Part per group if needed |
| R9 | Integrations: human activation, cannot be deleted, no loops | P-05, S-09 | Few, deliberate integrations; on the real containers only |
| R10 | Audit claim ("unalterable even by admins", VQ r12) vs admin routes | S-N7, S-09 | 2 admins, hash chain, reframed wording |
| R11 | Notification flood (7 parts at release) and leaks in templates | S-08 | Digest sender (C6) |
| R12 | Flows and integrations are effectively permanent [MM §3.9] | — | Spikes run on the real shells; no throwaway flows in the BDF containers |

---

## 14. Effort estimate

Calibrated on [MM §17]. Design dominates, and apply itself takes minutes. This design document is the design for the data layer.

| Work package | Builder-days | Basis |
|---|---|---|
| Spikes P-01…P-08, S-01…S-12, S-N1…S-N14 (mostly 15-30 min builder or API checks, batched) + D-1 | 2-3 | 07 §10 |
| Backend native: roles in 2 containers, ~38 lists, 28 flows (5 config processes with child tables; the ~150-field part form; parallel review), grants, re-grant, about 10 integrations (activation included) | 5-7 | MM §17 "large native app 3-5+ d" + 2 containers, manual portal work and integrations |
| C1 scope engine + scope-check UI + diff | 3-4 | Prototype `rules.ts` and tests are reusable |
| C2 completeness confirmer | 0.75-1 | |
| C3 RMES initialiser + limits + automatic findings + impact flags | 1.5-2 | |
| C4 blocker list | 0.5 | |
| C5 admin helpers (copy-forward, checksum, regression) | 1-1.5 | Prototype `RegressionCheck` |
| C6 reminders, PDF fallback, cancellation cascade | 1.5-2.5 | PDF fallback only if S-07 fails |
| Native internal pages, nav, reports and charts | 1-1.5 | [MM §5] |
| Seed (deterministic, 2 suppliers, 8 reference materials) + advance as real assignees | 1-1.5 | [MM §8] |
| QA: role × flow, leak tests, 32 BRM scenarios, re-grant read-back | 3-4 | [MM §9] |
| Supplier guide, FAQ, 3-minute video (CIA #34) | 1 | [MM §10.4] |
| **Total (native-first, no C7)** | **≈ 22-30** | |
| *Optional C7 (prototype-parity screens)* | *+4-6* | R6 |
| *If T4 is needed (mediated supplier layer)* | *+3-5* | 07 §4.1 |

**Calendar:** about 3 weeks with 2 builders (one on backend + C1/C3, one on C2/C4-C6 + QA) once D-1 is taken.

**BDF dependencies** (unchanged from 07):
- rule table v1.0 (OP-19)
- RMES template and limits (G-07)
- MVP test content (G-20)
- who holds the overall approval (W-02)

---

## Appendix A: BRM acceptance-criteria coverage (all 51)

Legend:
- **N**: native and proven in our manual
- **N?**: native, depends on a spike
- **N+C**: native carrier plus a custom piece
- **C**: custom
- **G**: gap under native-first; needs C7, a different design, or a reframed acceptance

| REQ | Mechanism | Cov. |
|---|---|---|
| CFG-001 | Additive version-gated fields + `CIQ_Template_Version` + pin + dev→prod (P-06). Label and help-text pinning: G | N? / G |
| CFG-002 | Native Text, Select, Multiselect, Number, Date, child table, Attachment; read out by REST or report (S-N6) | N |
| CFG-003 | `CIQ_Rule_Set` child rows (2-clause AND/OR), frozen versions; evaluation in C1 | N+C |
| CFG-004 | Per-flow grants, step permissions, department-split criterion forms; supplier has nothing in the app | N? (S-02) |
| CFG-006 | `CIQ_Ownership_Version` → C1 → Review_Depts → step conditions | N+C |
| PROC-001 | Start step-Mandatory; Case_ID (S-12); native history | N? |
| PROC-004 | Parts do not exist before release; dynamic assignee (S-01); portal login (P-04) | N? |
| PROC-005 | Native submit validation names the fields; required-when-visible (S-N1) | N? |
| PROC-006 | Native structured fields; list-view search on DUNS, INCI, SF01; K2.1 child-table report (S-N6) | N? |
| PROC-007 | Part 1: send-back to Scope check; Part 2: `CIQ_Change_Request` + C1 impact; frozen after PS-11 | N+C |
| PROC-009 | C1 + `CIQ_Scope_Run` (N.A. documented with rule) + native visibility hides N.A. | N+C |
| PROC-010 | `Scope_Items` (rule + answer per section) | N+C |
| CFG-007 | C1 enforces the justification; Scope_Items origin = Manual extension; Audit_Event | C |
| CFG-008 | C1 diff → Scope_Run.Diff_*; department notice via Depts_Notified | C |
| CFG-009 | Hidden values retained (S-N1b) → a revert restores them | N? |
| PROC-011 | Attachment field at the question; opened from the review; chapter overview via native report or C7 | N |
| PROC-012 | Required-when-visible + justification fields (SF-12/K5.1); C2 blocker list | N? / C |
| CTL-001 | Section-group items (parallel without loss); supplier assignment as Email; per-answer attribution (S-N5) | N? / G |
| PROC-014 | Case S3 Confirm + name and e-mail + text from Active_Config; step history time | N |
| PROC-015 | PS05_*, X_Review_Completed, PS11_* + history → PDF | N |
| PROC-016 | Completed parts = frozen review version; deltas only | N |
| PROC-017 | Integration → CIQ_Review; Act_X conditions (S-04, P-05) | N? |
| PROC-018 | Native Parallel (S-03) | N? |
| PROC-019 | Step field permissions + View grants; static roles | N |
| PROC-020 | `CIQ_Internal_Note` (app) | N |
| PROC-021 | One `CIQ_Review` per confirmed version = RMES header; app only | N |
| PROC-022 | C3 pre-fill with Source_* through Field Registry mapping | C |
| PROC-024 | Criterion AI columns; endpoint call by C3 | N+C |
| PROC-029 | Ref_* Mandatory; item-level jump native; field-exact jump C7 | N / G |
| PROC-030 | One OP or part item = one supplier task with reference, justification, responsible, due date | N? (S-01) |
| ADR-001 | Step-Mandatory Responsible_BDF, Due_Date | N |
| ADR-002 | Additional part item, marked, department review step, counted in X_Blockers | N? |
| PROC-031 | `CIQ_Change_Request` + C1/C3 impact flags + Depts_To_Inform | N+C |
| PROC-032 | Answer / document / Cannot_Provide + reason | N? (S-N1) |
| PROC-033 | One item per point; native history (S-08) | N |
| PROC-034 | Static department review steps; `_current_step` light; Accepted_Evidence_Version | N |
| PROC-035 | Native send-back loop | N |
| PROC-036 | Aggregates + required gate (S-05, S-N3); C4 names the blockers | N? + C |
| PROC-038 | Confirm "review completed — not a raw-material approval" + history | N |
| PROC-039 | Static Approver roles; negative-without-comment aggregate; Delegation + reassign | N? |
| PROC-040 | Join → "Final release" assignment e-mail = the single notification (S-08, P-05) | N? |
| PROC-042 | S5 reachable only after the join; name, role, e-mail fields | N |
| PROC-043 | Natively frozen; "attempt logged" is G (C7) | N / G |
| PROC-045 | Case End right after release; manual completion = RMM withdraw + Confirmation | N |
| PROC-046 | GeneratePDF (S-07) or C6 + `CIQ_Final_Document` + SHA | N? / C |
| PROC-049 | Native withdraw (S-N11) + C6 cascade + Confirmation | N+C |
| CTL-002 | §6.4 layers; leak tests | N? (S-02) |
| CTL-003 | Every step has a role assignee; named owner field; reassign | N |
| CTL-006 | Project (`_current_step`), subprocess (X_Track_Status), open points: native reports. Per-section status: G (C7) | N / G |
| CTL-009 | Native history + write-once registers + Audit_Event hash chain; admin caveat | N+C |
| CTL-010 | Integrations write `CIQ_Notification_Log` per notifying step; C6 for reminders | N? + C |

**Tally:**

| Coverage | Count |
|---|---|
| Natively carried (N) | 19 |
| Natively carried, but spike-dependent (N?) | 20 |
| Native carrier plus custom piece (N+C) | 9 |
| Mostly custom (C) | 3 (CFG-007, CFG-008, PROC-022) |
| Also carry a residual gap (G) under pure native | 5 (CFG-001 labels, CTL-001 per answer, PROC-029 field jump, PROC-043 attempt log, CTL-006 per section) |

The first four rows count each requirement once, by its first mark, and add up to 51. The G row overlaps them. PROC-012 also becomes custom if S-N1 fails. The 5 gaps are closed by C7 or by a data-driven renderer.

## Appendix B: prototype → Kissflow entity map

| Prototype (`types.ts`) | Kissflow carrier |
|---|---|
| `CiqCase` header, `config: ConfigAnswers`, `phase`, `phaseHistory` | `CIQ_Case` fields; phase = `_current_step`; history = native |
| `scope: ScopeItem[]` | `CIQ_Scope_Run.Scope_Items` + `CIQ_Case.Active_*` |
| `answers`, `justifications`, `components` | `CIQ_Questionnaire_Part` native fields + `K21_Components` child table |
| `answeredBy` | Native history (S-N5) / part `_modified_by` |
| `documents: DocumentRef[]` (version) | Attachment fields on parts; new versions on `CIQ_Open_Point.Answer_Document` |
| `reviews: ReviewTrack[]` | `CIQ_Review` per-department blocks + branch steps |
| `informed` (CUS, LEG) | Read grants + Ownership `Informed_Depts` |
| `openPoints: OpenPoint[]`, `thread: Message[]` | `CIQ_Open_Point` items + native history and send-back comments; additional parts = `CIQ_Questionnaire_Part` (Is_Additional) |
| `rmes: RmesRecord`, `RmesCriterion`, `LimitCheck`, `aiSuggestion` | `CIQ_Review` header + `CIQ_RMES_Criterion_SAF/_REG` |
| `Finding` | `CIQ_Finding` |
| `confirmations: Confirmation[]` | Case PS05_* / PS11_*, Review X_*, `CIQ_Confirmation` |
| `overall` | `CIQ_Closure` |
| `audit: AuditEvent[]` | Native history + `CIQ_Audit_Event` |
| `internalNotes` | `CIQ_Internal_Note` |
| `cancelled` | Native withdraw + `CIQ_Confirmation` (Cancellation) |
| `TemplateVersion`, `RuleSet`, `Rule`, `ownership`, `reminders` | `CIQ_Template_Version`, `CIQ_Rule_Set` (+ `Rules`), `CIQ_Ownership_Version`, `CIQ_Reminder_Rule`; `activeRuleSet` → `CIQ_Active_Config` |
| `User`, `Supplier`, `Persona` | Kissflow users + roles (§6.1), `CIQ_Supplier`, `CIQ_Supplier_Contact` |

## Appendix C: scripts we will need (no secrets; `.env` only)

| Script | Purpose |
|---|---|
| `scripts/inventory.mjs` | P-01 read-only listing of both containers (flows, roles, members) |
| `scripts/roles-sync.mjs` | Create roles in both containers; keep portal mirror-role members equal to app roles; retry + verify `UserCount` [MM §3.2] |
| `scripts/lists.mjs` | Create and populate §4 lists; diff the live items |
| `scripts/grants.mjs` | Apply §6.2 serially with 423 retry; read back `…/member`; **assert no report grant for CIQ Supplier Contact** |
| `scripts/seed-config.mjs` | Seed v1 configuration items (rules from `prototype/src/domain/rules.ts`, sections and owners from `catalog.ts`, RMES criteria, limits) |
| `scripts/seed-cases.mjs` + `cleanup.mjs` | Deterministic synthetic cases; ledger by Case_ID; masters first; sequential [MM §8.2] |
| `scripts/leak-test.md` | Manual checklist per channel for the two synthetic suppliers [MM §9.4] |
