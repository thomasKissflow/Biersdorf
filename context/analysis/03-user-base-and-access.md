# 03 - User base, personas and access (BDF CIQ digitalisation)

Discovery analysis only. Nothing is being built. Prepared 2026-10-05 for the first clarification call with BDF's consultant.

Source codes, tags and the PDF-vs-BRM step crosswalk are defined in `02-modules-and-data-model.md` §0 and §2:
- STATED statements carry a citation; **(inferred)** marks our own reasoning; **CONFLICT** and **GAP** as defined there.
- Step numbers follow the **BRM** unless marked "PDF".

---

## 0. Key reading notes

1. **The only explicit internal role list** is "RMM, Regulatory, Safety, QM, Microbiology, Sustainability, business administrator" [BRM REQ-CFG-004].
   - **Customs / Trade Compliance and Legal / IP are not in it**, although they own sections K7 and K8/K8.1 [ReqDoc p.9 §4.3].
   - No auditor role is listed, although auditors are named in acceptance criteria [BRM REQ-CTL-009; ReqDoc p.14 REQ-RMES-016].
2. **The BRM "Responsible role" column (col G) uses these values:**
   - Business Administrator; System Administrator / Business Owner; Business Administrator / departments
   - RMM; RMM / System / Supplier; Supplier; Supplier / RMM; Supplier / System; Supplier / Beiersdorf; Supplier / department
   - System; System / Business Administrator; System / departments; System / RMM; System / Audit
   - Authorised BDF department; Responsible BDF department; Safety / Regulatory
   - all process roles; all authorised roles

   [BRM col G r2-r52]
3. **Today RMM is the single point of contact.** "Every question, every reminder and every document passes through this single point" [ReqDoc p.1 §1]. In the target process, questions and document requests "are exchanged directly between the responsible department and the supplier" [ReqDoc p.1 §1]. **(inferred)** RMM's role moves from relaying messages to owning and monitoring the case. The reviewing departments get direct contact with suppliers, which is a change-management topic.
4. **The documents contain no volume figures at all:** no counts of suppliers, cases, users, languages or countries. See §9.
5. **People named in the documents** (stakeholders, not system personas):
   - Alexander Pevzner, "Technical Product Owner" [ReqDoc p.1]. The PDF author metadata reads "Pevzner, Alexander ext. /BSS HAM". **(inferred)** "ext." suggests he is an external consultant.
   - "Wieke", who commented on a field-catalogue cell [Feldkatalog comment C46].
   - "Proc", in "Offener Punkt, mit Proc klären" (open point, clarify with Proc) [Feldkatalog r8 col O]. **(inferred)** Possibly Procurement. Unconfirmed.

---

## 1. Persona catalogue (overview)

| ID | Persona | Side | One-line role | Main sources |
|---|---|---|---|---|
| P-01 | **RMM (Raw Material Management), case owner** | Internal | Starts, owns, monitors and closes CIQ cases; co-reviewer of K1 and lead on K2.3 | [ReqDoc p.1, p.3 §3.1.1, p.6; BRM REQ-PROC-001, -045, -046, -049] |
| P-02 | **Regulatory reviewer** | Internal | Largest review scope; RMES Regulatory criteria and decision | [ReqDoc p.9 §4.3; ReqDoc p.13-14 REQ-RMES-003, -013] |
| P-03 | **Safety reviewer** (incl. Toxicology; possibly Environmental Safety) | Internal | Sole authority for toxicology, environment and limits; RMES Safety criteria and decision | [ReqDoc p.6 K4.1, p.9 §4.3; Feldkatalog r40-r44; KB Sections K4.2] |
| P-04 | **QM reviewer** | Internal | Quality, storage, manufacturer certification; lead on K1 | [ReqDoc p.5 §3.2.4, p.9 §4.3] |
| P-05 | **Microbiology reviewer** | Internal | K5.1 and K5.2 microbiology; A3 together with QM | [ReqDoc p.6, p.8; BRM REQ-CFG-004] |
| P-06 | **Sustainability reviewer** | Internal | EUDR (K6.17), vegetable origin (A1), RSPO; separate questionnaire | [ReqDoc p.5 §3.2.6, p.9 §4.3] |
| P-07 | **Customs / Trade Compliance reviewer** | Internal | K7: HS code, country of origin, export control, CITES | [ReqDoc p.8 K7, p.9 §4.3] |
| P-08 | **Legal / IP** | Internal | K8 and K8.1 patents and licences; "read only" | [ReqDoc p.8 K8, p.9 §4.3] |
| P-09 | **Overall CIQ approver** (role TBD; PDF model only) | Internal | PS-12 overall approval or rejection | [ReqDoc p.3 PS-12; KB OpenPoints NEW-03] |
| P-10 | **Business Administrator** | Internal | Maintains template, rule set, section responsibility, RMES criteria and notifications | [BRM REQ-CFG-001, -002, -003, -006, REQ-CTL-010; ReqDoc p.13 REQ-RMES-002] |
| P-11 | **System Administrator / Business Owner** | Internal | Role and permission model; separation of supplier and internal content | [BRM REQ-CFG-004; BRM REQ-CTL-002] |
| P-12 | **Auditor** | Internal (or external; unknown) | Reconstructs who assessed what, when and on which source version | [BRM REQ-CTL-009; ReqDoc p.14 REQ-RMES-016] |
| P-13 | **Delegate / substitute / reassignee** | Internal | Acts on behalf of a reviewer or department through an auditable delegation | [ReqDoc p.13-14 REQ-RMES-011, -013; BRM REQ-PROC-034, -039] |
| P-20 | **Supplier primary contact** | External | Named contact who gets access; enters data; gives the supplier confirmations | [BRM REQ-PROC-004; FLM 'CIQ new version' r4; FLM changelog r20] |
| P-21 | **Additional supplier contacts** | External | Work on the same CIQ in parallel; extra notification recipient | [BRM REQ-CTL-001; FLM r5; CIA #6] |
| P-22 | **Supplier-side roles (KAM, QM ...) / supplier coordinator** | External | Supplier-defined roles; assign tasks on the supplier side | [CIA #25, #26, #27; BRM REQ-CTL-001] |
| P-23 | **Manufacturer / production site** (if different from the supplier) | External | Source of manufacturing and site data; site qualification | [FLM r8-r9; CIA #28-#31; IKW p.3] |
| P-24 | **"Own-document" supplier** | External | Sends own documents instead of filling in the CIQ; separate process | [ReqDoc p.4 §3.1.4; KB OpenPoints NEW-12] |

---

## 2. Persona details

### P-01 - RMM (Raw Material Management), case owner

- **Who:** today the intermediary between BDF departments and suppliers [ReqDoc p.1 §1]. In the target process RMM is the "responsible BDF owner" of a CIQ project [BRM REQ-PROC-001].
- **Per step:**
  - **PS-01.** Decides to start an "IRMA CIQ case" [ReqDoc p.3 §3.1.1]. Creates the project with supplier, trade name, supplier contact and BDF owner, and releases it to the supplier [BRM REQ-PROC-001]. Can pre-fill the trade name [FLM r2]. Is shown as "Approval" for the process-start fields [FLM r2-r5].
  - **PS-02/PS-03.** Is shown as "Approval" for every Meta Data field in FLM v0.6 [FLM r7-r35]; the meaning is unclear (see U-09).
    - **(inferred)** RMM may be "the department" that sees the derived scope and "can extend or reduce it" [ReqDoc p.10 §5.2].
    - The old catalogue had open points on whether some metadata belongs to RMM or the supplier: "RMM / Supplier" in yellow [Feldkatalog r8-r10, cells K8, K9, K10].
  - **Part 2.**
    - Lead on K2.3 and co-owner of K1 [ReqDoc p.6 §4.1].
    - **CONFLICT:** the department summary does not mention RMM at all [ReqDoc p.9 §4.3].
    - The RMM subprocess is documented in Teamcenter today, and its target is "still open" [ReqDoc p.5 §3.2.5].
  - **Monitoring.** Identifies bottlenecks without opening cases [BRM REQ-CTL-006]. Sees "department, criterion and blocking reason" in RMES progress [ReqDoc p.14 REQ-RMES-018].
  - **Closure.**
    - Receives the final PDF by e-mail [BRM REQ-PROC-046].
    - Can complete a project manually in exceptional cases [BRM REQ-PROC-045].
    - Cancels projects with a justification [BRM REQ-PROC-049].
    - **(inferred)** Reactivates cancelled cases [ReqDoc p.5 §3.3.3].
- **Sees and edits:**
  - Reads all project content [BRM REQ-PROC-019].
  - Edits the case-creation data [BRM REQ-PROC-001] and its own business area [BRM REQ-PROC-019].
  - Whether RMM may edit supplier answers on the supplier's behalf is not stated.
- **Notifications:** the final PDF [BRM REQ-PROC-046]. **(inferred)** Escalations; the escalation recipients are configurable [ReqDoc p.14 REQ-RMES-019].
- **Dashboards:**
  - Status control with bottlenecks [BRM REQ-CTL-006; CIA #23].
  - Supplier projects [CIA #21].
  - Personal workload [CIA #22].
  - RMES progress per Safety and Regulatory [ReqDoc p.14 REQ-RMES-018].
  - Blocking open requests per case [ReqDoc p.12 §6.2].

### P-02 - Regulatory reviewer

- **Who:** "Largest review scope. Leads on composition, registration and market authorisation" [ReqDoc p.9 §4.3].
- **Sections owned** (summary [ReqDoc p.9 §4.3]): K2.1, K2.3, K6.1-K6.8, K6.13, K6.15, K6.16, K6.16.1, A2, A5, A7, A8, A10, A11, A12, A13.
  - **Shared:** K6.14 (with Safety) and K6.17 (with Sustainability).
  - **Also named in the detail tables where another department leads or is listed first:** K1 (QM lead), K2.3 (RMM lead), K4.2, K4.3 (Safety lead), K6.9 (Safety lead), A2 (Safety lead), A6 (Safety first) [ReqDoc p.6-8 §4.1-4.2].
  - **FLM v0.6 'Approval' = Regulatory** for all Annex 1 fields [FLM r45-r51]. **CONFLICT:** the ReqDoc gives A1 to Safety and Sustainability.
- **Per step:**
  - Gets a task and a notification when Part 2 starts [BRM REQ-PROC-017].
  - Reviews its sections and raises queries, document requests and additional parts [BRM REQ-PROC-029, REQ-ADR-001, -002].
  - Accepts or rejects supplier responses, as the only one allowed to set the status [BRM REQ-PROC-034].
  - Documents Regulatory RMES criteria [ReqDoc p.13 REQ-RMES-003, -006].
  - Completes its subprocess independently of Safety [BRM REQ-PROC-039].
  - Gives the "Final Regulatory approval" [ReqDoc p.14 REQ-RMES-013].
  - Can extend the scope as an "authorised department" [BRM REQ-CFG-007].
  - Can use the AI document review [BRM REQ-PROC-024].
- **Restriction:** "A Regulatory reviewer cannot issue the Safety approval" [ReqDoc p.13 REQ-RMES-003].
- **Notifications:** Part 2 start [BRM REQ-PROC-017]; RMES task or resubmission [REQ-RMES-019]; supplier answer [BRM REQ-CTL-010]; supplier change to a source it used [BRM REQ-PROC-031]; scope re-derivation [BRM REQ-CFG-008].
- **Dashboards:** workload [CIA #22]; RMES Regulatory progress [REQ-RMES-018]; open-point traffic lights [BRM REQ-PROC-034].

### P-03 - Safety reviewer (incl. Toxicology)

- **Who:** "Sole assessment authority for toxicology, environment and limits" [ReqDoc p.9 §4.3]. For K4.1, "Assessment authority sits exclusively with Safety" [ReqDoc p.6].
  - The old catalogue labels the K4.1 owner "Safety / Toxicology" [Feldkatalog r40-r44].
  - The KB asks whether K4.2 belongs to "Environmental Safety" [KB Sections K4.2].
  - **(inferred)** Safety may have sub-teams.
- **Sections owned** (summary): K2.2, K4.1, K4.2, K4.3, K6.9, K6.11, A4, A6, A9 [ReqDoc p.9].
  - **Shared:** K6.14 (with Regulatory) and K2.2 (with QM).
  - **Also named in the detail tables where another department leads or is listed first:** K1 (QM lead), K2.3 (RMM lead), K6.5, K6.6, A8 (Regulatory first), A1 (with Sustainability) [ReqDoc p.6-8]. Safety is lead on A2 [ReqDoc p.8].
  - **"To be informed"** on K5.2 [ReqDoc p.6].
  - Owner of K5.3 per the chapter table [ReqDoc p.7]. **CONFLICT:** the summary assigns K5.3 to QM/Microbiology [ReqDoc p.9; KB OpenPoints NEW-09].
  - FLM 'Approval' = Safety for Annex 4 [FLM r53-r55].
- **Per step:** as P-02, with the Safety RMES criteria, the "Final Safety approval" [REQ-RMES-013] and the **quantitative limit checks** [REQ-RMES-008]. The K2.2 limits come from the BDF values [ReqDoc p.6].
- **Notifications and dashboards:** as P-02, plus the informed role on K5.2 (inferred: a notification only).

### P-04 - QM reviewer

- **Who:** "Leads on quality, hygiene, storage and manufacturer certification" [ReqDoc p.9]. The QM subprocess "boundary, entry criteria, decision model and ownership are open" [ReqDoc p.5 §3.2.4].
- **Sections owned:** K1 (lead), K3, K6.10 ("Workshop note: QA"), K6.12 [ReqDoc p.6-7]. In the summary, as "QM / Microbiology": K1, K3, K5.1, K5.2, K5.3, K6.10, K6.12, A3 [ReqDoc p.9]. Co-reviewer of K2.2 [BRM REQ-CFG-006 acceptance; ReqDoc p.6].
- **Per step:** reviews its sections; can read the Safety sections but "cannot assess or complete them" [BRM REQ-PROC-019 acceptance]; completes its subprocess [BRM REQ-PROC-038].
- **Supplier-level data:** K6.12 GMP/ISO is supplier-related and could be reused across cases (OP-17) [ReqDoc p.7].

### P-05 - Microbiology reviewer

- **Who:** listed as a separate internal role [BRM REQ-CFG-004]. The department summary merges it as "QM / Microbiology" [ReqDoc p.9]. **CONFLICT:** see U-06.
- **Sections:** K5.1 microbiological test [ReqDoc p.6], K5.2 total microbial count (with Safety informed) [ReqDoc p.6], A3 GMO together with QM [ReqDoc p.8]. The KB proposes Microbiology for the challenge test without a chapter number [KB Sections K5.x].
- **Special logic:** the micro test can be waived (SF-12) with a mandatory justification; K5.2 stays mandatory [ReqDoc p.11 SF-12; BRM REQ-PROC-012 acceptance].

### P-06 - Sustainability reviewer

- **Who:** "Small in volume but with high external impact (EUDR, RSPO)" [ReqDoc p.9]. Documents its findings "in a separate questionnaire" [ReqDoc p.5 §3.2.6; ReqDoc p.5 §3.3.2].
- **Sections:** K6.17 EUDR (lead, shared with Regulatory) and A1 vegetable origin [ReqDoc p.8-9]. Co-reviewer of K2.3 [ReqDoc p.6]. Reviewing department for the vegetable and palm rules [ReqDoc p.11 §5.4].
  - Evidence: D-06 pesticide/mycotoxin analysis, D-07 sustainability certificates, D-08 RSPO certificate [KB Evidence].
  - **CONFLICT:** FLM v0.6 marks the Annex 1 fields, including RSPO and palm, as 'Approval' = Regulatory [FLM r45-r51].

### P-07 - Customs / Trade Compliance reviewer

- **Who:** "The only section owned outside Regulatory, Safety, QM and Sustainability" [ReqDoc p.8 K7]. "Single section; easily overlooked today" [ReqDoc p.9].
- **Section:** K7 (HS code, country of origin, export control, CITES) [ReqDoc p.8].
- **GAP:** not in the role list [BRM REQ-CFG-004], and no subprocess is described [KB OpenPoints NEW-11]. The KB asks: "Is Customs a reviewer in Part 2?" [KB Sections K7].

### P-08 - Legal / IP

- **Who and section:** K8 and K8.1 patents and licences, "Read only for Legal" [ReqDoc p.8], "Single section, read only" [ReqDoc p.9].
- **GAP:** not in the role list [BRM REQ-CFG-004]. The KB asks: "Does Legal approve or only read?" [KB Sections K8].
- **(inferred)** Legal may be informed only, with no completion task.

### P-09 - Overall CIQ approver (TBD)

- **Stated:** PS-12 "Overall CIQ approval - Responsible role to be decided" [ReqDoc p.3]. The gate uses "the final subprocess results and all blocking open items" [ReqDoc p.5 §3.3.2]. "Overall case approval must be possible only when both required RMES approvals are Approved and no blocking finding or supplier request remains open" [ReqDoc p.14 REQ-RMES-014].
- **CONFLICT:** the BRM has no BDF overall approver. The project completes automatically after the supplier's final release [BRM REQ-PROC-045]. See M-01 and U-02.

### P-10 - Business Administrator

- **Responsibilities:**
  - Template maintenance "without an IT ticket" [BRM REQ-CFG-001] and field types [BRM REQ-CFG-002].
  - The rule set [BRM REQ-CFG-003], together with the System for derivation [BRM REQ-PROC-009 col G].
  - Section responsibility, together with the departments ("Business Administrator / departments") [BRM REQ-CFG-006].
  - Notifications [BRM REQ-CTL-010 col G].
  - RMES criteria, as "an authorised business administrator" [ReqDoc p.13 REQ-RMES-002].
- **Works in:** a test environment, then publishes [BRM REQ-CFG-001 acceptance].
- **Unknown:** whether this is one central team or one administrator per department, whether changes need a second person's approval, and whether administrators also see case data (see U-16).

### P-11 - System Administrator / Business Owner

- **Responsibilities:** the role and authorisation model [BRM REQ-CFG-004] and consistent role-based separation [BRM REQ-CTL-002]. Expected to configure authorisations without code [CIA #19].

### P-12 - Auditor

- **Stated:** "An auditor can reconstruct who assessed what, when and on which source version" [BRM REQ-CTL-009]. "... against which source and rule-set version, and when" [ReqDoc p.14 REQ-RMES-016]. BRM col G for REQ-CTL-009 = "System / Audit".
- **Unknown:** whether this is internal QA, an external authority or certification auditor, or a function of each role. Also unknown: whether auditors need their own login, read-only access to everything, and exports.

### P-13 - Delegate / substitute / reassignee

- **Stated:**
  - "Neither role can approve on behalf of the other without an auditable delegation" [ReqDoc p.14 REQ-RMES-013].
  - "Completion on behalf of the other department is only possible via an auditable delegation" [BRM REQ-PROC-039].
  - Response review only by the responsible department "unless formally reassigned" [ReqDoc p.13 REQ-RMES-011].
  - Status set only by the responsible department "unless a documented reassignment has taken place" [BRM REQ-PROC-034].
- **Unknown:** who grants a delegation, for how long, and whether it covers absence cover or only cross-department cover.

### P-20 - Supplier primary contact

- **Who:** "Primary supplier contact; receives access and task notification" [FLM changelog r20; FLM r4 FLD-GEN-008, mandatory, pre-filled from supplier master data]. The new structure has no field for the contact's name [FLM changelog r20].
- **Per step:**
  - **PS-02.** Gets access and a task. Only basic data and configuration questions are visible and editable [BRM REQ-PROC-004]. Must fill all mandatory metadata [BRM REQ-PROC-005].
  - **PS-04.** Completes the released sections and uploads evidence [ReqDoc p.4 §3.1.4; BRM REQ-PROC-011]. Gives written justifications for anything that cannot be provided [BRM REQ-PROC-012].
  - **PS-05.** Completeness confirmation ("Supplier Approval"), recorded with name, e-mail and timestamp [BRM REQ-PROC-014]. It "confirms submission and responsibility for the provided information" [ReqDoc p.4 §3.1.5].
  - **PS-08.** Answers queries, uploads requested documents, completes activated parts or justifies non-delivery [BRM REQ-PROC-032].
  - **During Part 2.** Can still correct metadata until the last step the business permits [BRM REQ-PROC-007].
  - **PS-11.** Final CIQ release with name, role, e-mail and timestamp, confirming that the information "is correct and complete" [BRM REQ-PROC-042]. After that, everything is frozen [BRM REQ-PROC-043].
- **Sees:** only their own cases [BRM REQ-CTL-006]; only the released scope [BRM REQ-PROC-009]; only "explicitly issued questions, requests and permitted attachments" [ReqDoc p.14 REQ-RMES-015].
- **Never sees:** internal comments, assessments, findings or RMES content [BRM REQ-CTL-002; BRM REQ-CFG-004; ReqDoc p.13 REQ-RMES-003].
- **Notifications:**
  - Task at start [BRM REQ-PROC-004].
  - Each request as a task [BRM REQ-PROC-030].
  - Query issued [ReqDoc p.14 REQ-RMES-019].
  - **No** message per completed subprocess, and exactly one message asking for the final release [BRM REQ-PROC-040].
  - **(inferred)** Cancellation, since their tasks are ended [BRM REQ-PROC-049].
- **Dashboard:** a supplier dashboard with one task per request, showing reference, justification, responsible person and due date [BRM REQ-PROC-030; ReqDoc p.12 §6.2]. Jump links to the affected field [BRM REQ-PROC-029].
- **Old sign-off block** in the Feldkatalog: "Company responsible for providing information" (row in red), "Person responsible for providing information", phone/fax, e-mail and "Digital signature" (open) [Feldkatalog r10-r15].

### P-21 - Additional supplier contacts

- **Stated:**
  - "Contact person e-mail 2", optional, "Additional recipient of notifications (if filled)" [FLM r5]. It was previously debated as mandatory [FLM changelog r23].
  - "Several authorised supplier contacts must be able to work on one CIQ in parallel ... user and timestamp are identifiable per answer and document" [BRM REQ-CTL-001; CIA #6].
- **Unknown:** whether e-mail 2 gets a login or only e-mails; whether further contacts can be added beyond two; who invites them (RMM or the supplier); and **which contact may give PS-05 and PS-11**.

### P-22 - Supplier-side roles (KAM, QM ...) / supplier coordinator

- **Stated:**
  - No-code roles in the contact database "such as Key Account Manager or QM" [CIA #25, Nice].
  - A role structure configurable per supplier [CIA #26, Must].
  - Person-to-role assignment, separately for BDF and suppliers [CIA #27, Must].
  - "The assignment of tasks on the supplier side takes place exclusively on the supplier's side" [BRM REQ-CTL-001].
- **(inferred)** A supplier coordinator persona is needed: someone at the supplier who distributes sections and queries to colleagues, for example QM for technical data and the KAM for commercial and contact data.
- **CONFLICT (soft):** a BDF query names a "responsible supplier contact" [ReqDoc p.13 REQ-RMES-010], yet supplier-side assignment is the supplier's job [BRM REQ-CTL-001]. See U-04.

### P-23 - Manufacturer / production site

- **Stated:** "Manufacturer (name & address)" and "Production site (name & address)" are mandatory metadata [FLM r8-r9], with "only one production site" [FLM changelog r25]. Multi-level supplier structures, production-site qualification and production-site approval appear in [CIA #28-#31]. The industry template separates manufacturer, production site, supplier and contract manufacturer [IKW p.3].
- **Unknown:** whether a manufacturer that is not the supplier (a trader or distributor scenario) gets its own access, for example for confidential composition data.

### P-24 - "Own-document" supplier

- **Stated:** "There are a number of suppliers who upload their own documents instead of completing the CIQ questionnaire. A separate process will be specified and implemented for these suppliers" [ReqDoc p.4 §3.1.4].
- **Unknown:** how many such suppliers there are, whether they are in the MVP, and who re-keys their data into structured form (an RMM or department workload). The RMES pre-fill [BRM REQ-PROC-022] would not work for them **(inferred)**.

---

## 3. Section ownership master table

Columns:
- **§4.1/4.2** = per-section table [ReqDoc p.6-9].
- **§4.3** = department summary [ReqDoc p.9].
- **KB lead** = vendor-drafted proposal [KB Sections].
- **FLM / Feldkatalog** = 'Approval' column.
- **Flag** marks conflicts.

| Section | §4.1/4.2 departments (lead) | §4.3 summary | KB lead | FLM v0.6 / Feldkatalog 'Approval' | Flag |
|---|---|---|---|---|---|
| Process start / Meta data | - | - | - | RMM for all fields [FLM r2-r35]. Old: GEN-001/002 RMM; DUNS, manufacturer, site, origin = Supplier [Feldkatalog r3-r7, r31] | Meaning of "Approval" unclear (U-09) |
| K1 Mandatory documents | QM (lead), Regulatory, RMM, Safety | QM/Micro | QM | - | Summary omits the co-reviewers |
| K2.1 Components | Regulatory | Regulatory | Regulatory | RMM [FLM r10-r15; Feldkatalog r17-r24] | **CONFLICT** RMM vs Regulatory |
| K2.2 Byproducts / contaminations | Safety (lead), QM | Safety; shared Safety+QM | Safety | "RMM / Regulatory / Safety / Sustainability" [Feldkatalog r26-r29] | Shared (OP-18); 4 departments in the old catalogue |
| K2.3 Source / origin type | RMM (lead), Safety, Sustainability, Regulatory | Regulatory | RMM | RMM [FLM r16-r31]; old: Supplier / "RMM / Regulatory / Safety / Sustainability" [Feldkatalog r31-r38] | **CONFLICT** lead RMM vs Regulatory |
| K3 Storage | QM | QM | QM | - | - |
| K4.1 Toxicity | Safety | Safety | Safety | "Safety / Toxicology" [Feldkatalog r40-r44] | - |
| K4.2 Environmental | "Safety, Regulatory, Environmental" (garbled cell) | Safety | Safety (Environmental Safety?) | - | Verify |
| K4.3 Synthetic polymer microparticles | Safety (lead), Regulatory | Safety | Safety | - | - |
| K5.1 Micro test | Microbiology | QM/Micro | Microbiology | - | - |
| K5.2 Total microbial count | Microbiology, Safety (to be informed) | QM/Micro | Microbiology | - | "Informed" role |
| K5.x Challenge test | (no chapter number) | - | ? | - | **GAP** (NEW-08) |
| K5.3 Antimicrobial treatment | Safety | QM/Micro | ? | - | **CONFLICT** (NEW-09) |
| K6.1-K6.4 REACH EU/UK/TR, inventories | Regulatory | Regulatory | Regulatory | K6.1 = Regulatory [Feldkatalog r46-r54] | - |
| K6.5 Reg. 1223/2009 Annexes III-VI | Regulatory, Safety | Regulatory | Regulatory | - | Co-reviewer dropped in summary |
| K6.6 Art. 19(g) / Annex III | Regulatory, Safety | Regulatory | Regulatory | - | Same |
| K6.7 Animal testing | Regulatory | Regulatory | Regulatory | - | - |
| K6.8 Halal | Regulatory | Regulatory | Regulatory | - | Trigger missing (NEW-10) |
| K6.9 Nanomaterials | Safety (lead), Regulatory | Safety | Safety | - | - |
| K6.10 Pharmacopeia | QM ("Workshop note: QA") | QM/Micro | QM | - | QA vs QM wording |
| K6.11 Food grade | Safety | Safety | Safety | - | - |
| K6.12 GMP / ISO | QM | QM/Micro | QM | - | Supplier-level (OP-17) |
| K6.13 China IECIC / NMPA | Regulatory | Regulatory | Regulatory | - | - |
| K6.14 California Prop 65 | Regulatory and Safety jointly | Shared | Shared (OP-18) | - | Shared (OP-18) |
| K6.15 Canada Hot List | Regulatory | Regulatory | Regulatory | - | - |
| K6.16 / K6.16.1 Biodiversity / Brazil | Regulatory | Regulatory | Regulatory | - | - |
| K6.17 EUDR | Regulatory and Sustainability (lead) | Sustainability; shared Reg+Sust | Unclear (OP-18) | - | Shared (OP-18) |
| K7 Customs and foreign trade | Customs / Trade Compliance | Customs | Customs | - | Role missing from REQ-CFG-004 |
| K8 / K8.1 Patent | Legal / IP ("Read only for Legal") | Legal, "read only" | Legal | - | Owner but read-only? |
| A1 Vegetable origin | Safety and Sustainability | Sustainability | Sustainability | **Regulatory** [FLM r45-r51]; old: "Sustainability / Safety", Sustainability [Feldkatalog r56-r61] | **CONFLICT** |
| A2 Manufacturing process | Regulatory, Safety (lead) | **Regulatory** | Safety | **RMM** [FLM r37-r43] | **CONFLICT** (three different owners) |
| A3 GMO | QM / Microbiology | QM/Micro | QM | - | QM vs Micro split |
| A4 Hydrocarbons | Safety | Safety | Safety | Safety [FLM r53-r55] | - |
| A5 UV filters | Regulatory | Regulatory | Regulatory | - | - |
| A6 Synthetic polymers | Safety, Regulatory | Safety | Safety | - | - |
| A7 Colorants | Regulatory | Regulatory | Regulatory | - | - |
| A8 Preservatives | Regulatory, Safety | Regulatory | Regulatory | - | - |
| A9 PAH | Safety | Safety | Safety | - | - |
| A10-A13 REACH / inventories annexes | Regulatory | Regulatory | Regulatory | - | - |
| A14 | Moved into the main document | - | - | Heavy-metal limits [Feldkatalog r27-r29] | Where limits live (NEW-06) |

**Section counts per department in the §4.3 summary (count of IDs listed):**
- Regulatory 22
- Safety 9
- QM/Micro 8
- Sustainability 2
- Customs 1
- Legal 2
- Shared 3
- RMM 0

**(inferred)** Regulatory carries most of the review workload.

---

## 4. Step x role matrix (who acts, who is informed)

Key: **A** = acts / owns the task; **C** = contributes; **I** = informed / notified; **V** = views; "-" = no role stated.

| Step (BRM; PDF in brackets) | Supplier primary | Supplier others | RMM | Reviewing departments | Safety / Regulatory (RMES) | Overall approver | Business Admin | System |
|---|---|---|---|---|---|---|---|---|
| PS-00 Configure template, rules, responsibility, roles | - | - | - | C (section responsibility) [REQ-CFG-006] | C (RMES criteria) [REQ-RMES-002] | - | **A** [REQ-CFG-001..003, -006] | - |
| PS-01 Start CIQ | I (access + task) [REQ-PROC-004] | - | **A** [REQ-PROC-001] | - | - | - | - | C (ID, audit) |
| PS-02 Enter metadata | **A** [REQ-PROC-004, -005] | C? [REQ-CTL-001] | V; "Approval" on fields [FLM] | - | - | - | - | C (validation) |
| PS-03 Configure CIQ (derive scope; department review of scope) | V (released scope only) | V | ? ("the department") [ReqDoc p.10 §5.2] | C (extend scope with justification) [REQ-CFG-007] | - | - | - | **A** (derivation) [REQ-PROC-009] |
| PS-04 Complete CIQ, upload | **A** [ReqDoc p.4 §3.1.4] | **A** (parallel) [REQ-CTL-001] | V | - | - | - | - | C (validation) |
| PS-05 Supplier Approval / completeness confirmation | **A** [REQ-PROC-014] | ? (who may confirm) | I? | I + task [REQ-PROC-017] | I [REQ-RMES-019] | - | - | **A** (freeze, start Part 2) [REQ-PROC-016, -017] |
| PS-06 Activate subprocesses | - | - | V | I + task [REQ-PROC-017] | I + task; RMES record created [REQ-PROC-021] | - | - | **A** [ReqDoc p.4 §3.2.1] |
| PS-07 Queries, document requests, additional parts (PDF PS-07/08) | I + task [REQ-PROC-030] | I (e-mail 2) [FLM r5] | V | **A** [REQ-PROC-029, REQ-ADR-001, -002] | **A** (incl. query from finding) [REQ-RMES-010] | - | - | C |
| PS-08 Answer / upload (PDF PS-08) | **A** [REQ-PROC-032] | **A** | V | I [REQ-CTL-010] | I | - | - | - |
| PS-09 Review answer (PDF PS-08/09) | I (if rejected) [REQ-PROC-034] | - | V | **A** (only the responsible department) [REQ-PROC-034] | **A** [REQ-RMES-011] | - | - | - |
| (PDF PS-09) Document results / RMES | - | - | V [REQ-RMES-018] | A (own systems; Sustainability's separate questionnaire) | **A** [REQ-RMES-006..009] | - | - | C (pre-fill) [REQ-PROC-022] |
| PS-10 Complete subprocess | - | - | V | **A** [REQ-PROC-038] | **A**, separately [REQ-PROC-039] | - | - | C (blocks on open points) [REQ-PROC-036] |
| (PDF PS-11) Approve / reject subprocess | - | - | - | **A** ("authorised Beiersdorf role") | **A** (Final Safety / Final Regulatory approval) [REQ-RMES-013] | - | - | - |
| PS-11 Supplier final release (BRM only) | **A** [REQ-PROC-042] | ? | I? | - | - | - | - | C (single notification) [REQ-PROC-040] |
| (PDF PS-12) Overall approval | - | - | ? | - | - | **A** (TBD) [ReqDoc p.3] | - | C (gate) [REQ-RMES-014] |
| PS-12 Complete CIQ, final PDF (PDF PS-13) | ? (gets the PDF? see M-14) | - | I (PDF e-mail) [REQ-PROC-046]; A (manual exception) [REQ-PROC-045] | - | - | - | - | **A** (auto-complete, PDF) [REQ-PROC-045, -046] |
| Cancel / reactivate | I (tasks ended) [REQ-PROC-049] | I | **A** [REQ-PROC-049] | I? | I? | - | - | C |

---

## 5. Access matrix (role x data area)

Key:
- **W** = create / edit
- **R** = read
- **-** = no access (stated)
- **?** = not stated
- **R/W*** = with the restriction in the footnote

Citations are in the footnotes below the table.

| Role \ Data area | Case metadata (start fields) | Config answers & derived scope | CIQ sections: own department | CIQ sections: other departments | Evidence documents | Supplier queries & history | Internal notes | Findings | RMES criteria & results | Confirmations / approvals | Audit trail | Admin config (template, rules, responsibility, RMES criteria, notifications) | Roles & permissions |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **Supplier primary contact** | R? / W (metadata until PS-11) [1] | W answers; R released scope only; N/A parts hidden [2] | W released sections, n/a [3] | W released sections, n/a [3] | W own uploads; R own [4] | R/W issued items only [5] | - [6] | - (before publication) [7] | - [8] | W own (PS-05, PS-11); BDF decisions - [9] | ? | - | W* supplier-side task assignment [10] |
| **Additional supplier contact** | ? | W? [11] | W? [11] | W? [11] | W? [11] | ? | - [6] | - [7] | - [8] | ? (who may confirm) | ? | - | ? |
| **RMM (owner)** | W at creation [12] | R; W? (scope extension) [13] | W* K2.3 lead / K1 co [14] | R [15] | R [15] | R; W for own sections [16] | R/W [17] | R [15] | R [18] | W cancel / manual completion [19] | ? | - | - |
| **Regulatory** | R [15] | R; W extend scope [13] | W [15] | R [15], **CONFLICT** [20] | R [15], **CONFLICT** [20] | R/W own [16] | R/W [17] | W own; R others [21] | W Regulatory criteria; R Safety? [22] | W Final Regulatory approval / completion [23] | ? | - | - |
| **Safety** | R [15] | R; W extend scope [13] | W [15] | R [15] | R [15] | R/W own [16] | R/W [17] | W own; R others [21] | W Safety criteria; R Regulatory? [22] | W Final Safety approval / completion [23] | ? | - | - |
| **QM** | R [15] | R; W extend scope [13] | W [15] | R, cannot assess [15] | R [15] | R/W own [16] | R/W [17] | R [15] | R? [24] | W completion [25] | ? | - | - |
| **Microbiology** | R [15] | R; W? [13] | W [15] | R [15] | R [15] | R/W own [16] | R/W [17] | R [15] | R? [24] | W completion [25] | ? | - | - |
| **Sustainability** | R [15] | R; W? [13] | W [15] | R [15] | R [15] | R/W own [16] | R/W [17] | R [15] | R? [24] | W completion [25] | ? | - | - |
| **Customs / Trade Compliance** | ? [26] | ? | W? K7 [26] | ? | ? | ? | ? | ? | ? | ? | ? | - | - |
| **Legal / IP** | ? [26] | ? | **R only** for K8/K8.1? [27] | ? | ? | ? | ? | ? | ? | ? | ? | - | - |
| **Business Administrator** | ? | W (rule set) [28] | ? | ? | ? | ? | ? | ? | ? | - | ? | **W** [28] | - |
| **System Admin / Business Owner** | ? | ? | ? | ? | ? | ? | ? | ? | ? | - | ? | ? | **W** [29] |
| **Auditor** | R (inferred) | R (inferred) | R (inferred) | R (inferred) | R (inferred) | R (inferred) | R? | R (inferred) | R [30] | R [30] | **R** [30] | ? | - |
| **Overall approver (TBD)** | R? | R? | n/a | R? | R? | R? | R? | R? | R? | W overall approval [31] | ? | - | - |

**Footnotes**
1. The supplier enters "metadata and structural data" [ReqDoc p.3 §3.1.2]. Metadata stays changeable until the business-permitted step and is locked after PS-11 [BRM REQ-PROC-007]. RMM fills the process-start fields [BRM REQ-PROC-001; FLM r2-r5]. Whether the supplier can edit them is not stated.
2. [BRM REQ-PROC-004]: config questions only at first. N/A parts "must not be presented to the supplier" [BRM REQ-PROC-009]. The supplier does not see the internal rule justification (inferred from REQ-PROC-009).
3. The supplier completes "the released sections" [ReqDoc p.4 §3.1.4]. Department ownership does not apply to suppliers. Everything is locked after PS-11 [BRM REQ-PROC-043].
4. [BRM REQ-PROC-011; BRM REQ-CTL-001]. After PS-05, uploads become new versions only [ReqDoc p.4 §3.1.5].
5. One task per request [BRM REQ-PROC-030], answer or non-delivery [BRM REQ-PROC-032], full history at the object [BRM REQ-PROC-033]. Only "explicitly issued questions, requests and permitted attachments" [ReqDoc p.14 REQ-RMES-015].
6. Internal communication "never [visible] to the supplier" [BRM REQ-PROC-020; ReqDoc p.3 §3].
7. "A supplier contact sees no internal assessments, findings or RMES content" [BRM REQ-CFG-004]; [BRM REQ-CTL-002]. "Findings before publication ... hidden" [ReqDoc p.14 REQ-RMES-015] implies that a finding becomes visible only once it is issued as a query.
8. "A supplier cannot view or edit any RMES criterion" [ReqDoc p.13 REQ-RMES-003].
9. [BRM REQ-PROC-014, -042]. The single supplier notification "must not contain any internal assessments, findings or comments" [BRM REQ-PROC-040]. Whether the supplier ever sees the BDF outcome is unknown.
10. "Assignment of tasks on the supplier side takes place exclusively on the supplier's side" [BRM REQ-CTL-001]. A role structure per supplier [CIA #26].
11. Parallel work by "several authorised supplier contacts" [BRM REQ-CTL-001]. E-mail 2 is only stated as a notification recipient [FLM r5].
12. [BRM REQ-PROC-001; FLM r2-r5].
13. "Authorised departments must be able to extend the derived scope" [BRM REQ-CFG-007]. "The department ... can extend or reduce it" [ReqDoc p.10 §5.2]. Which departments are authorised is not stated. Additional CIQ parts can also be activated by an "authorised department" [BRM REQ-ADR-002].
14. RMM is lead on K2.3 and co-owner of K1 [ReqDoc p.6 §4.1]. It is absent from §4.3, and the RMM subprocess is open [ReqDoc p.5 §3.2.5].
15. "All internal roles must be able to read all project content; only their own business area is editable" [BRM REQ-PROC-019]. "A QM reviewer can read the Safety sections but cannot assess or complete them" [BRM REQ-PROC-019 acceptance].
16. Status is set "exclusively by the responsible department, unless a documented reassignment" [BRM REQ-PROC-034]. "Only the department responsible for a finding may accept or reject" [ReqDoc p.13 REQ-RMES-011].
17. "Visible only to authorised BDF roles" [BRM REQ-PROC-020]. Which roles count as "authorised" is not specified.
18. RMM must identify "the department, criterion and blocking reason" [ReqDoc p.14 REQ-RMES-018]. Full content is readable per [BRM REQ-PROC-019].
19. [BRM REQ-PROC-049; BRM REQ-PROC-045].
20. **CONFLICT:** "A Regulatory reviewer can read Safety assessments (only PDF documents from supplier) but cannot edit them" [BRM REQ-CFG-004 acceptance] vs "All internal roles must be able to read all project content" [BRM REQ-PROC-019]. See §6 C-1.
21. Findings are linked to the "responsible department" [ReqDoc p.13 REQ-RMES-009]. Other departments read them per [BRM REQ-PROC-019].
22. Safety criteria are assigned to Safety reviewers and Regulatory criteria to Regulatory reviewers [ReqDoc p.13 REQ-RMES-003]. Read access to the other department's RMES part is not explicitly stated beyond [BRM REQ-PROC-019] and the REQ-CFG-004 caveat.
23. [ReqDoc p.14 REQ-RMES-013; BRM REQ-PROC-039]. Acting for the other department requires an auditable delegation.
24. RMES is "the structured internal documentation instrument for the work performed by the two departments" [ReqDoc p.5 §3.2.3]. Hidden from suppliers [REQ-RMES-015]. Readable by other internal roles only by implication of [BRM REQ-PROC-019].
25. [BRM REQ-PROC-038].
26. Customs and Legal own sections [ReqDoc p.9 §4.3] but are not in the role model [BRM REQ-CFG-004], and no subprocess is described [KB OpenPoints NEW-11].
27. "Read only for Legal" [ReqDoc p.8 K8]; "Single section, read only" [ReqDoc p.9].
28. [BRM REQ-CFG-001, -002, -003, -006; BRM REQ-CTL-010; ReqDoc p.13 REQ-RMES-002].
29. [BRM REQ-CFG-004; BRM REQ-CTL-002; CIA #19].
30. [BRM REQ-CTL-009; ReqDoc p.14 REQ-RMES-016]. The auditor must reconstruct the full history, so read access to every area is needed **(inferred)**.
31. [ReqDoc p.3 PS-12; ReqDoc p.14 REQ-RMES-014]. PDF model only.

---

## 6. Conflicting or ambiguous access statements

| # | Conflict | Statement A | Statement B | Why it matters | Question |
|---|---|---|---|---|---|
| C-1 | Cross-department read access | "A Regulatory reviewer can read Safety assessments (**only PDF documents from supplier**) but cannot edit them" [BRM REQ-CFG-004] | "**All internal roles must be able to read all project content**; only their own business area is editable" [BRM REQ-PROC-019] | Decides whether access is restricted per document or per assessment, or is a simple read-all. It also affects RMES and internal-note visibility | U-03 |
| C-2 | Legal: owner but "read only" | K8 "Read only for Legal" [ReqDoc p.8]; "Single section, read only" [ReqDoc p.9] | Legal is listed as the owning department of K8/K8.1 [ReqDoc p.8, p.9 §4.3] | Is there a Legal review task, completion or approval at all? | U-05 |
| C-3 | Departments missing from the role model | Internal roles = RMM, Regulatory, Safety, QM, Microbiology, Sustainability, business admin [BRM REQ-CFG-004] | Customs/Trade Compliance owns K7; Legal owns K8 [ReqDoc p.9 §4.3] | Role design and subprocess activation | U-05 |
| C-4 | Microbiology vs QM | Microbiology is a separate role [BRM REQ-CFG-004]; K5.1 owner "Microbiology" [ReqDoc p.6] | "QM / Microbiology" as one department in the summary [ReqDoc p.9]; A3 "QM / Microbiology" [ReqDoc p.8] | Number of subprocesses and completion tasks | U-06 |
| C-5 | Section owners disagree | §4.1/4.2 tables [ReqDoc p.6-9] | §4.3 summary [ReqDoc p.9] and FLM 'Approval' [FLM r2-r55] (K2.1, K2.3, K5.3, A1, A2) | Review routing; task distribution must "follow exactly this configuration" [BRM REQ-CFG-006] | M-09 |
| C-6 | Shared sections | "Both roles approve or one takes the lead (OP-18)" [ReqDoc p.9] | Status set "exclusively by the responsible department" [BRM REQ-PROC-034] | Who closes open points on K2.2, K6.14 and K6.17? | M-09 |
| C-7 | Who assigns supplier-side work | Supplier-side assignment "exclusively on the supplier's side" [BRM REQ-CTL-001] | A BDF query contains the "responsible supplier contact" [ReqDoc p.13 REQ-RMES-010] | Does BDF pick the recipient of a query, or does the supplier route it? | U-04 |
| C-8 | Who signs off | BDF approve/reject per subprocess plus an overall approver [ReqDoc p.3; REQ-RMES-013, -014] | Department completion plus supplier final release; no BDF approval [BRM REQ-PROC-015, -038, -042, -045] | Persona list (does an approver exist?), permissions, final PDF content | M-01, U-02 |
| C-9 | Who adjusts the scope, and how | "The department sees the derived scope and can extend **or reduce** it" [ReqDoc p.10 §5.2] | "Authorised departments ... **extend** the derived scope with a mandatory justification" [BRM REQ-CFG-007] | Which persona holds the scope-confirmation task in Part 1; whether reducing the scope is allowed | M-11 |
| C-10 | Who owns metadata | The supplier enters metadata [ReqDoc p.3 §3.1.2; BRM REQ-PROC-004] | FLM 'Approval' = RMM for every metadata field [FLM r2-r35]; the old catalogue had "Supplier" or "RMM / Supplier" with open-point yellow cells [Feldkatalog r5-r10] | Does RMM pre-fill, verify or approve metadata? | U-09 |
| C-11 | RMES visibility to non-RMES departments | RMES is for Safety and Regulatory [ReqDoc p.5 §3.2.3; REQ-RMES-003] | All internal roles read all project content [BRM REQ-PROC-019] | Can QM, Sustainability, Customs and Legal read RMES content and approval rationales? | U-03 |
| C-12 | Findings visible to the supplier? | Supplier sees "no ... findings" [BRM REQ-CFG-004; BRM REQ-CTL-002] | "Findings **before publication**" are hidden [ReqDoc p.14 REQ-RMES-015], which implies a publish step | Is there a "publish finding to supplier" action distinct from "create query"? | U-15 |

---

## 7. Notification matrix (event -> recipient)

| Event | Recipient | Content constraint | Source |
|---|---|---|---|
| Case started; metadata task | Named supplier contact (plus e-mail 2 if filled) | Task notification | [BRM REQ-PROC-004; FLM r5] |
| Scope re-derived after a config change | Affected departments | Difference list | [BRM REQ-CFG-008] |
| Supplier Approval / completeness confirmation (Part 2 start) | Exactly the affected departments | Task plus notification; unaffected departments get nothing | [BRM REQ-PROC-017] |
| RMES task created or resubmission arrives | Assigned Safety / Regulatory reviewer | - | [ReqDoc p.14 REQ-RMES-019] |
| Query, document request or additional part issued | Responsible supplier contact | Separate task with reference, justification, responsible person, due date | [BRM REQ-PROC-030; REQ-RMES-019] |
| Supplier answer, upload or non-delivery | Responsible reviewer / department | - | [BRM REQ-CTL-010] |
| Supplier changes data in Part 2 | Departments whose assessment uses the changed source | Audit entry plus information | [BRM REQ-PROC-031; REQ-RMES-012] |
| Response rejected | Supplier | Justification | [BRM REQ-PROC-034; ReqDoc p.12 §6.2] |
| Individual subprocess completed | **Nobody on the supplier side** | - | [BRM REQ-PROC-040] |
| Last applicable subprocess completed | Supplier: **exactly one** notification requesting the final release | No internal assessments, findings or comments | [BRM REQ-PROC-040] |
| Supplier final release; final PDF generated | Responsible RMM owner (e-mail with the PDF) | PDF content still to be confirmed | [BRM REQ-PROC-046] |
| Due date approaching or overdue | Assignee; configurable escalation recipients | - | [ReqDoc p.5 §3.4; REQ-RMES-019; KB OpenPoints NEW-16] |
| New task, query, answer, resubmission or decision (generic) | Responsible persons | Every notification logged at the project | [BRM REQ-CTL-010] |
| Cancellation | (inferred) Supplier and active departments | Tasks ended | [BRM REQ-PROC-049] |
| K5.2 results | Safety "(to be informed)" | (inferred) Information only | [ReqDoc p.6 K5.2] |

---

## 8. Dashboards per persona

| Persona | Dashboard needs (stated) | Source |
|---|---|---|
| Supplier contacts | Own cases only; one task per request with reference, justification, responsible person and due date; jump-to-field; status per own case | [BRM REQ-CTL-006, REQ-PROC-030, -029; ReqDoc p.12 §6.2] |
| RMM | Bottlenecks without opening cases; overall status traced to subprocesses; RMES progress per Safety/Regulatory with department, criterion and blocking reason; supplier projects; blocking requests per case | [BRM REQ-CTL-006; REQ-RMES-018; CIA #21, #23; ReqDoc p.12 §6.2] |
| Every BDF reviewer | Own tasks with project, step, status and due date; personal workload; open-point traffic lights; open points blocking completion | [BRM REQ-CTL-003; CIA #22; BRM REQ-PROC-034, -036] |
| Safety / Regulatory | RMES states: unassigned, open, waiting for supplier, overdue, reopened, approved, rejected | [ReqDoc p.14 REQ-RMES-018] |
| Process owner / management (inferred: the Business Owner) | Aggregated overall status across subprocesses; critical or open steps; SLA breaches | [CIA #13, #23] |
| All | Section status (open, in progress, with the supplier, reviewed, completed) | [BRM REQ-CTL-006] |

**Ambiguity:** the "Supplier Projects Dashboard" is described as an "overview of ongoing projects at a supplier" [CIA #21]. It is unclear whether this is an internal view per supplier or a view inside the supplier portal (U-15).

---

## 9. Unknowns about the user base and volumes

The shared documents give **no figures** for any of the following.

| Dimension | What the documents say | Why it matters (inferred) | Question ID |
|---|---|---|---|
| Number of active suppliers / supplier companies | Nothing | Portal accounts, licensing (Kissflow prices "per-user-per-month ... Regular, Lite" [VQ 'Pricing model']), onboarding effort | U-01 |
| Supplier contacts per supplier | "Several authorised supplier contacts" [BRM REQ-CTL-001]; two e-mail fields [FLM r4-r5] | Licensing, invitation flow, support load | U-01, U-04 |
| New CIQ cases per year / concurrent open cases | Nothing. Today every question passes through RMM, a "single point" [ReqDoc p.1] | Dashboard design, RMM workload, performance testing | U-01 |
| Average and peak case duration; SLA per step | Due dates required [BRM REQ-CTL-003]; defaults undefined [KB OpenPoints NEW-16] | Reminder and escalation configuration | M-25 |
| Components per raw material | "Any number" [ReqDoc p.6 K2.1]; "mind. 1" (at least 1) [Feldkatalog r24] | Table UX, A10 per-substance instances, Annex 1 row generation | M-04 |
| Documents per case; file sizes | Nothing; "≥ 2 batch reports" for K2.2 [Feldkatalog r26] | Storage, B-Flow transfer volumes | U-01 |
| BDF users per department (RMM, Regulatory, Safety, QM, Micro, Sustainability, Customs, Legal) | Nothing | Licensing, assignment rules (pool vs named), delegation | U-01, U-07 |
| Languages (UI, questionnaire content, help texts, PDF) | FLM "fully translated into English"; the German Feldkatalog is kept as history [FLM changelog r9]. Kissflow mentioned "regional partners" for language [VQ 'Support model'] | Supplier adoption, translation of template versions, PDF language | U-10 |
| Supplier countries / time zones | Target markets China, USA, Canada, UK, Turkey [ReqDoc p.11 SF-11]; Brazilian biodiversity [ReqDoc p.7]. **(inferred)** an international supplier base | Language, due-date logic, data residency (EU hosting "upon request" [VQ 'Data protection / GDPR']) | U-10 |
| BDF entities / sites using the tool | Nothing ("BSS HAM" in the author metadata only) | Org-unit filters, dashboards per site | U-10 |
| Number of "own-document" suppliers | "A number of suppliers" [ReqDoc p.4 §3.1.4] | Size of MOD-25; manual re-keying effort | M-16 |
| Template and rule change frequency | Regulatory area "subject to change" [ReqDoc p.6 K4.3] | Versioning and testing workflow for admins | U-16 |
| Supplier authentication | SSO for BDF users only [CIA #20]. Kissflow listed SAML, Google, O365 and Kissflow login [VQ 'Authentication / SSO'] | Supplier onboarding friction, MFA, shared mailboxes | U-11 |
| Retention period / reactivation window | Reactivation "assumption: 1 year" [ReqDoc p.5 §3.3.3]. Kissflow: no native retention policies [VQ 'Archiving and retention'] | Archiving design | M-15, M-27 |
| Re-qualification frequency | Not in BDF documents. The industry practice is to reconfirm "e.g. in two year intervals" [IKW p.2] | A recurring case type would multiply volumes | M-26 |

---

## 10. Kissflow statements already on record that affect users and access

These were submitted in the screening and will be held against the MVP (inferred):

- **Authorisation.** A no-code authorisation matrix, "Read, Write, Customize ... independently ... for Beiersdorf internal users and external suppliers per process area" [CIA #19]. Permissions "Read-only, editable, hidden ... per section or stage" [CIA #6].
- **SSO.** SAML v2 with Azure AD, Okta and OneLogin [CIA #20]. The VQ answer lists Okta/OneLogin SAML, Google, Microsoft O365 and Kissflow authentication [VQ 'Authentication / SSO'].
- **Supplier portal.** "Dedicated External Portal ... unique role structures ... individually configured for each supplier" [CIA #26]. Distinct person-to-role assignment for BDF and suppliers [CIA #27].
- **Security.** RBAC, MFA and least privilege [VQ 'Information security']. RBAC and data isolation [VQ 'Confidentiality model'].
- **Licensing.** Per user per month, tiered as Regular and Lite [VQ 'Pricing model']. **(inferred)** The number of supplier users and how often they use the tool directly drive cost, so U-01 is commercially relevant too.
