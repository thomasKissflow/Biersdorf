# 04 — Contradictions & Gaps Register (CIQ discovery)

**Purpose.** A traceable list of every place where the client documents disagree, are internally inconsistent, reference something we do not have, or leave a business rule undefined. Each item has a precise question we can ask BDF's consultant.
**Status.** Discovery only. Nothing is built. Prepared 5 Oct 2026 for the first clarification call.
**Sources read in full:** all seven dumps in `context/raw/`. Ambiguous PDF table cells were re-checked with layout-mode extraction of the original PDF, and workbook fills, comments and metadata were re-checked in the original `.xlsx` files.

---

## 0. How to read this register

| Item | Meaning |
|---|---|
| **C-xx** | Contradiction. Section 1 = between documents, Section 2 = inside one document |
| **G-xx** | Gap: an artefact, ID or definition that is referenced but not provided (Section 3) |
| **K-xx** | Open item in the Knowledge Baseline that another document already answers (Section 4) |
| **BR-xx** | Undefined business rule that blocks a long-lived, bug-free build (Section 5) |
| **CRITICAL** | Blocks the core data model or workflow. A wrong guess means a rebuild |
| **HIGH** | Significant rework or wrong behaviour in a core flow |
| **MEDIUM** | Rework or configuration change that stays local |
| **LOW** | Editorial or cosmetic issue, or a small clarification |
| **STATED vs (inferred)** | Every sentence with a citation is stated in the source. "Why it matters", "Default" and anything marked **(inferred)** is our own reasoning |

Citation codes follow `context/00-glossary.md`. "Default" means the default **we recommend** if BDF does not decide. It is not a BDF statement. **[file metadata]** means properties stored inside the file (author, dates, sensitivity label, fills). Row numbers are Excel rows.

### 0.1 Document chronology (which source is likely the most current)

| Doc | Date evidence | Authorship evidence |
|---|---|---|
| CIA functional catalogue | File name `09062026`; created 2026-06-10 [file metadata] | No author field. Contains Kissflow's answers |
| VQ non-functional questionnaire | Created 2026-06-10 [file metadata] | Creator "Pevzner, Alexander" [file metadata]. Contains Kissflow's answers |
| BRM requirements matrix | Created 2026-09-15. BDF sensitivity label "Intern-ohne-Richtlinien" set 2026-09-15 [file metadata] | BDF tenant label |
| ReqDoc (PDF) | "Date 16 September 2026" [ReqDoc p.1]. PDF created 2026-09-16 [ReqDoc metadata] | "Owner Alexander Pevzner (Technical Product Owner)" [ReqDoc p.1]. The PDF author is "Pevzner, Alexander ext. /BSS HAM" [ReqDoc metadata] |
| FLM field matrix v0.6 | Created 2026-09-18. **Last modified 2026-10-02** [file metadata] | Last modified by "Pevzner, Alexander" [file metadata] |
| KB Knowledge Baseline | No document properties at all. Zip entries dated 2026-10-05 [file metadata] | No author and no BDF label. Read Me says some content was "proposed by the build team" [KB 'Read Me' r21] |
| IKW sample | 2019 [IKW p.1] | IKW industry association, **not BDF** |

**(inferred)** The FLM is the newest BDF-edited artefact. Where it differs from the PDF or BRM it may reflect later decisions; one example is "aligned with business departments" [FLM changelog r25]. However, the FLM is still v0.6 and has open "[Review]" items. The KB looks like vendor or build-team output and is not validated by BDF: it has no BDF metadata, its "Customer answer" columns are empty, and it uses "Stage 1/Stage 2" wording that does not appear in the BDF documents. Treat its "Proposed" values as unconfirmed.

### 0.2 Seed-list verification

| Seed | Verdict | Register ID |
|---|---|---|
| (a) End of process: PDF approval vs matrix supplier release | **CONFIRMED**, extended with REQ-RMES-013/014 and the PDF scope line | C-01, C-05 |
| (b) Step numbering differs | **CONFIRMED**, crosswalk added | C-02 |
| (c) Blocking vs non-blocking | **CONFIRMED**. The PDF also contradicts itself (§3.2.2 vs §6.2) | C-03 |
| (d) Metadata changeable until PS-11 vs versions fixed at Supplier Approval | **PARTIALLY CONFIRMED**. This is a tension rather than a literal contradiction. The real open point is how the supplier may change data in Part 2 | C-04, C-35 |
| (e) Annex 1 / Annex 2 / metadata owners | **CONFIRMED**, extended with BSE/TSE, K2.2, K2.3 and the undefined meaning of the "Approval" column | C-10 |
| (f) Origin table vs annex triggers | **CONFIRMED**, extended: A10 is activated by a K6.1 checkbox in the old Feldkatalog, and the Feldkatalog's Mineral row differs | C-06 |
| (g) SF-01 single vs multi, per component | **CONFIRMED** | C-07 |
| (h) Component table vs single fields | **CONFIRMED**, extended: FLD-2.1-008 and FLD-A1-106 were removed without a change-log entry | C-08, C-42 |
| (i) PS-02 config-only vs FLM Meta Data with composition | **CONFIRMED**, extended: 10 of the 12 configuration questions have no field in the FLM (SF-02 dropped, SF-06 and SF-08 sit inside annexes) | C-09 |
| (j) Production sites | **CONFIRMED** | C-14 |
| (k) Contact name, supplier address | **CONFIRMED**, extended: the "responsible BDF owner" field required by REQ-PROC-001 is missing | C-15 |
| (l) Integrations | **CONFIRMED** | C-16 |
| (m) Extend or reduce vs extend only | **CONFIRMED** | C-17 |
| (n) Reactivation within 1 year | **CONFIRMED** | C-23 |
| (o) RMES Must vs MVP partial scope | **CONFIRMED**. None of REQ-RMES-001…020 appears in the BRM | C-24 |
| (p) SF-12 / K5.3 / challenge test / K5.3 owner | **CONFIRMED** | C-31 |
| (q) Customs K7 / Legal K8 without a subprocess | **CONFIRMED**. Both roles are also missing from REQ-CFG-004 | C-12 |
| (r) Supplier-side task assignment vs RMM naming the contact | **CONFIRMED** (tension) | C-25 |
| (s) FLD-A1-103/104 mandatory for all origins | **CONFIRMED**, extended to FLD-A1-102 and FLD-2.1-102 | C-41 |
| (t) Version labels, §3.3.1 missing | **CONFIRMED**, extended with a duplicate K8.1 and garbled cells | C-33 |
| (u) Annex 14 moved into the main document | **CONFIRMED**. Limit values exist only for 3 metals in the old Feldkatalog | C-22, G-09 |
| (v) Feldkatalog comment C46 | **CONFIRMED**. The comment sits on FLD-6.1-001 and is unresolved | C-44, C-19 |

### 0.3 Top questions for tomorrow (highest business value)

1. **C-01** At the end, does Beiersdorf approve or reject the raw material in the tool, or does the case close after the supplier's final release?
2. **G-01 / G-02 / G-04** Can you share the process diagram (which the PDF calls authoritative), the CIQ 2026 questionnaire itself (Word), and the current draft of the configuration table?
3. **C-06** For each annex, what activates it: the origin type, a specific question, or either one?
4. **C-07 / C-08** Is the composition a table of components, and can one material have more than one origin type?
5. **C-09 / C-18** Are all configuration questions asked up front? Does anyone at BDF check the generated scope before the supplier sees it?
6. **C-04** After submission, can the supplier still edit answers freely, or only when a department asks?
7. **C-19** Can the supplier skip any mandatory field with a justification, or only fields BDF allows?
8. **C-24 / G-08** Which RMES capabilities must the MVP show? Is there a written MVP scope or test scope?
9. **C-16** Should the MVP demonstrate any integration (even mocked), given the Must Have items in your functional catalogue?
10. **G-20** How will you test and score the two MVPs (scenarios, users, sample materials, timeline)?
11. **BR-01** When the documents disagree, which one wins?
12. **C-11 / C-32** Who gets a review task: the section owners or the origin's "reviewing department"? Which of the two ownership tables in the PDF is right?

---

## 1. Contradictions between documents

### C-01 — End of process: BDF approval/rejection vs supplier final release and automatic completion · CRITICAL · seed (a)

- **ReqDoc says:**
  - PS-10 "Decide whether subprocess review is complete". PS-11 "Approve or reject subprocess", done by an "Authorised Beiersdorf role". PS-12 "Overall CIQ approval", responsible role "to be decided", result "Overall approval or rejection recorded". PS-13 generate final documents, file them, report status, close the case [ReqDoc p.3 §2.1].
  - The department "records approval or rejection through an authorised Beiersdorf role" [ReqDoc p.4 §3.2.2].
  - "The effect of a rejected subprocess on the overall CIQ case also remains open" [ReqDoc p.5 §3.3.2].
  - Scope runs "from case creation to the approved final document" [ReqDoc p.2 §1.1].
  - There are separate "Final Safety approval and Final Regulatory approval, each with Approved/Rejected" [ReqDoc p.14 REQ-RMES-013], and an overall case approval gate [ReqDoc p.14 REQ-RMES-014].
  - There is **no supplier step after PS-05.**
- **BRM says:**
  - PS-10 completion "is not a business approval of the raw material" [BRM REQ-PROC-038].
  - The supplier receives exactly one notification asking for the final release once all departments have completed [BRM REQ-PROC-040].
  - PS-11 is the **supplier's** final CIQ release [BRM REQ-PROC-042], after which the CIQ is frozen [BRM REQ-PROC-043].
  - PS-12 completes the project automatically: "a manual completion step by RMM is not required" [BRM REQ-PROC-045]. A PDF is e-mailed to the RMM owner [BRM REQ-PROC-046].
  - "none of the confirmations is presented as a Beiersdorf raw material approval" [BRM REQ-PROC-015].
  - **No BRM requirement records a BDF approve/reject outcome.**
- **CIA says (all Must Have):**
  - Subprocess approval "may only be carried out by the respective BDF responsible persons" [CIA #11].
  - "Approval of the entire process and generation of the final document" [CIA #14].
  - The final document is stored in B-Flow [CIA #15] and the final status is sent to Teamcenter [CIA #18].
  - Kissflow answered that it "supports multi-stage final approval workflows" [CIA #14].
- **KB** assumes the PDF model: "Overall approver (PS-12)" and "Effect of a rejected subprocess" [KB 'Open Points' r5–r6].
- **Why it matters (inferred):** The end of the state machine differs in who acts (BDF or supplier), in the number of steps, in the possible outcomes (approved/rejected vs completed) and in what the closing PDF certifies. Choosing wrong breaks the workflow, dashboards, notifications and closing-document content. It is also the most visible step in a head-to-head MVP comparison.
- **Default (inferred):**
  1. Each department completes its review with an explicit outcome (Accepted / Rejected + reason).
  2. An optional "Overall BDF decision" step follows. The role is configurable (default: RMM owner) and the step can be switched off.
  3. The supplier gives the final release only after a positive decision.
  4. The case then completes automatically and an immutable PDF is generated.

  Either source model can then be configured without a rebuild.
- **Ask:** "At the end of the review, does Beiersdorf formally approve or reject the raw material inside the tool (PDF PS-11/PS-12), or does the process end with the supplier's final release and automatic closure (matrix PS-11/PS-12)? If both, in which order, and who is the overall approver?"

### C-02 — Process-step numbering and confirmation wording differ · HIGH · seed (b)

| ReqDoc PS-01…PS-13 [ReqDoc p.2–3 §2.1] | BRM PS-00…PS-12 [BRM col B] |
|---|---|
| – | PS-00 configuration & administration (REQ-CFG-001…004, -006) |
| PS-01 Start CIQ (RMM) | PS-01 Create CIQ project manually (REQ-PROC-001) |
| PS-02 Enter metadata (Supplier) | PS-02 Enter meta data (REQ-PROC-004…007) |
| PS-03 Configure CIQ (System) | PS-03 Configure CIQ template (REQ-PROC-009/010, REQ-CFG-007…009) |
| PS-04 Complete CIQ, upload documents | PS-04 same (REQ-PROC-011/012, REQ-CTL-001) |
| PS-05 "Supplier Approval and submission to Beiersdorf" | PS-05 "Confirm CIQ is completed": a completeness confirmation that is explicitly **not** a release (REQ-PROC-014…017) |
| PS-06 Activate applicable review subprocesses (System) | Activation sits inside PS-05 (REQ-PROC-017). BRM PS-06 = "Review subprocesses, data and documents" |
| PS-07 Perform technical review | BRM PS-06 (REQ-PROC-018…024) |
| PS-08 Clarification and additional-document loop | BRM PS-07 query, PS-08 answer, PS-09 review of the answer (REQ-PROC-029…036, REQ-ADR-001/002) |
| PS-09 Document technical-review results (RMES) | No own step (RMES sits under BRM PS-06, REQ-PROC-021/022) |
| PS-10 Decide whether subprocess review is complete | PS-10 Complete subprocess (REQ-PROC-038…040) |
| PS-11 **Approve or reject subprocess** | PS-11 **CIQ release by the supplier** (REQ-PROC-042/043) |
| PS-12 **Overall CIQ approval** | PS-12 **Complete CIQ automatically** (REQ-PROC-045/046/049) |
| PS-13 Final documents, filing, status feedback | Partly covered by BRM PS-12 (REQ-PROC-046) |

- **Wording conflicts:**
  - The PDF calls PS-05 "Supplier Approval" [ReqDoc p.1 §1; p.3; p.4 §3.1.5]. The BRM requires the UI to say it is "the completeness confirmation and not the final CIQ release" [BRM REQ-PROC-014], and it keeps the word "release" for its PS-11 [BRM REQ-PROC-015].
  - The PDF says "case" and the BRM says "project".
- **Cross-references using different schemes:**
  - "after the CIQ release in PS-11 no further change is possible" uses BRM numbering [BRM REQ-PROC-007].
  - "PS-06 to PS-10" also uses BRM numbering [BRM REQ-PROC-016].
  - The KB uses PDF numbering: "Overall approver (PS-12)" [KB 'Open Points' r5].
- **Why it matters (inferred):** Any rule that cites a PS number is ambiguous. Step names become task names, status labels, audit events and dashboard filters. The wording of supplier confirmations also carries legal weight.
- **Default (inferred):** Use BRM numbering and labels as the master, because the PDF says "Detailed requirements are maintained separately in the CIQ requirements matrix" [ReqDoc p.1 §1]. Keep this crosswalk alongside.
- **Ask:** "Which step model is the master: the PDF's PS-01…PS-13 or the matrix's PS-00…PS-12? Should step PS-05 be called 'Supplier Approval' or 'completeness confirmation' in the supplier's screen?"

### C-03 — Do all open points block, and what do they block? · HIGH · seed (c)

- **BRM:**
  - All open points (queries, document requests, subsequently activated parts, findings) block subprocess completion. "A distinction between blocking and non-blocking open points is not envisaged" [BRM REQ-PROC-036].
  - An activated additional part "blocks the completion of the requesting subprocess" [BRM REQ-ADR-002].
- **ReqDoc §7:**
  - Findings are classified "at least as blocking or non-blocking". "A blocking finding prevents the respective department approval and the overall approval" [ReqDoc p.13 REQ-RMES-009].
  - Overall approval is possible only if "no blocking finding or supplier request remains open" [ReqDoc p.14 REQ-RMES-014].
- **ReqDoc contradicts itself:**
  - "Open **blocking** requests prevent completion of the affected subprocess" [ReqDoc p.4 §3.2.2]. This implies non-blocking requests exist.
  - "Open requests prevent **overall approval** and are shown as blocking" [ReqDoc p.12 §6.2]. This implies all requests block, and the gate is overall approval rather than subprocess completion.
- **Why it matters (inferred):** This drives a classification attribute on findings and requests, the completion validation, and the "blocking reason" shown on dashboards [ReqDoc p.14 REQ-RMES-018]. If non-blocking items exist, a reviewer can close with items still open, and those items need follow-up after closure.
- **Default (inferred):** Add a classification attribute that defaults to "blocking" for every open point. Keep a "non-blocking" option switched off. Any open blocking item stops subprocess completion, and the case-level gate re-checks all of them.
- **Ask:** "Can a reviewer ever complete their review while a finding or query is still open (a 'non-blocking' note)? Or must every open point be closed first, as the matrix says?"

### C-04 — Supplier changes after Supplier Approval: fixed version vs still changeable · HIGH · seed (d)

- **ReqDoc:**
  - "On Supplier Approval, the submitted supplier data and document versions are fixed for that review cycle. A later resubmission creates a new review version and does not silently overwrite the version previously assessed" [ReqDoc p.4 §3.1.5].
  - The PS-05 result is "submitted version fixed for internal review" [ReqDoc p.3 §2.1].
- **BRM:**
  - Metadata "must remain changeable up to the last process step permitted by the business". "A metadata change after PS-05 is possible … triggers the check for scope impact (REQ-CFG-008); after the CIQ release in PS-11 no further change is possible" [BRM REQ-PROC-007].
  - "Changes to metadata and other data during the review phase" are audit-trailed and shown to the affected departments [BRM REQ-PROC-031].
  - Reviews refer to the version fixed at PS-05 [BRM REQ-PROC-016].
  - Reopening on source change is required [ReqDoc p.13 REQ-RMES-012].
- **Tension (inferred):** In the PDF, changes arrive as a *resubmission* that starts a new review cycle. In the BRM, the supplier edits directly during Part 2. "The last process step permitted by the business" is never defined.
- **Why it matters (inferred):** This decides edit permissions per stage, how fine-grained versioning is, and whether a Part-2 change re-derives the scope and reopens completed reviews. Uncontrolled edits during review are the most common source of audit gaps.
- **Default (inferred):**
  - After PS-05, supplier data is read-only except:
    - items addressed by an open query, request or activated part;
    - metadata, which changes only through an explicit "change request". That creates a new version, triggers re-derivation (REQ-CFG-008) and flags the affected reviews (RMES-012).
  - Everything is locked at the final release.
- **Ask:** "After the supplier has submitted, may they still edit answers freely while departments review, or only when a department asks them to? Until which step exactly may metadata change?"

### C-05 — RMES holds approvals vs "RMES is not an approval step" · HIGH

- **BRM:**
  - RMES is "not as a supplier questionnaire and not as an approval step" [BRM REQ-PROC-021].
  - Safety and Regulatory *complete* their reviews separately [BRM REQ-PROC-039].
- **ReqDoc:**
  - RMES "is therefore not a separate review process"; it is a documentation instrument [ReqDoc p.5 §3.2.3].
  - Yet: "independent Final Safety approval and Final Regulatory approval, each with Approved/Rejected" [ReqDoc p.14 REQ-RMES-013].
  - "The department approval is blocked while any applicable criterion has no final result" [ReqDoc p.13 REQ-RMES-006].
  - There is an overall approval gate [ReqDoc p.14 REQ-RMES-014].
- **Why it matters (inferred):** This decides whether Safety and Regulatory need Approved/Rejected decision fields and the permissions around them (RMES-003). It is tied to C-01.
- **Default (inferred):** The RMES record holds the criterion results plus a department outcome field (Approved/Rejected). The workflow action is "complete review", and it carries that outcome. This satisfies both documents.
- **Ask:** "Do Safety and Regulatory record a formal 'approved/rejected' decision on the raw material in RMES, or do they only document results and complete their review?"

### C-06 — Origin configuration table vs annex triggers · CRITICAL · seed (f)

The §5.4 origin table "is a structural illustration, not a complete or business-approved rule set" [ReqDoc p.11 §5.4]. The binding table "has to be collected with the business departments" [ReqDoc p.12].

| Sub | Annex | §4.2 / §5.3 trigger | §5.4 origin table | FLM (latest) | Old Feldkatalog |
|---|---|---|---|---|---|
| a | **A1** (titled "Vegetable origin") | "Vegetable origin" [ReqDoc p.8 §4.2] | Vegetable, **Mineral, Petrochemical, Polymer** [ReqDoc p.11] | Annex 1 active for Bio Mass, Mineral, Petrochemical, Polymer [FLM r16, r20, r22, r26; r45 FLD-A1-201] | Vegetable, Petrochemical, Polymer. **Not Mineral** [Feldkatalog r31, r33, r34, r37] |
| b | **A2** Manufacturing process | "Vegetable origin and is not stated in the CIQ (OP-19)", marked "(OP-03)" [ReqDoc p.8, verified in layout mode]. SF-06's source is "Annex 2" [ReqDoc p.10] | Column "Annex 2 mandatory" = Yes only for Vegetable (and vegetable + palm) [ReqDoc p.11]. BRM agrees: "SF-01 = plant-based -> A2 mandatory" [BRM REQ-PROC-010] | Manufacturing-process block shown for **all** origins [FLM r37–43]. Change log: "[Review] … only triggered by Bio Mass (vegetable); currently shown for all origins" [FLM changelog r129]. This includes CCU, waste and recycling, which the FLM itself says need "no annexes" [FLM r24, r28, r30] | – |
| c | **A3** GMO | SF-06 fermentation/GMO [ReqDoc p.8, p.10] | Mandatory for **every** Vegetable [ReqDoc p.11] | Bio Mass controls "Annex 1, 2, 3, 9, 10, 11, 12" [FLM r16]. **Also** the A2 option "Biotechnology / Fermentation" → "Annex 3 (GMO), if GMO – outside test scope" [FLM r41] | – |
| d | **A7** Colorants | SF-05 colorant [ReqDoc p.8, p.10] | Mandatory for **Mineral** [ReqDoc p.11] | Mineral → "Annex 1, 7, 10, 11, 12" [FLM r22] | Mineral → A10, A11, A12 only [Feldkatalog r33] |
| e | **A10** EU REACH | "Always" [ReqDoc p.8] | "None derived" for Waste, CCU, Chemical recycling [ReqDoc p.11–12] | No annex for CCU, waste, recycling [FLM r24, r28, r30] | Activated by the K6.1 checkbox "STEUERUNG: See BDF REACH questionnaire (Annex 10)" (conditionally mandatory → "Annex 10 wird aktiviert") plus a system field "Annex 10 aktiviert" [Feldkatalog r45, r49, r54]. KB says "Always" [KB 'Config Rules' r2] |
| f | **A11 / A12** UK / Turkey REACH | "UK market (SF-11)" / "Turkey market (SF-11)" [ReqDoc p.8–9]. SF-11 triggers A11 and A12 [ReqDoc p.11] | Mandatory for Vegetable, Animal, Mineral, Petrochemical, Polymer [ReqDoc p.11] | Same as §5.4 [FLM r16, r17, r20, r22, r26]. **SF-11 has no field in the FLM** | Same as §5.4 [Feldkatalog r31–37] |
| g | **Overlaps** | SF-03 polymer → K4.3, A6. SF-07 mineral oil → A4, A9 [ReqDoc p.10]. A9 "Vegetable or petrochemical origin (SF-01, SF-07)" [ReqDoc p.8] | SF-01 Polymer → A6. SF-01 Petrochemical → A4, A9 [ReqDoc p.11] | Annex 4 controlled only by origin = Petrochemical [FLM r53–55]. There is no SF-07 field | KB flags the overlaps [KB 'Config Questions' r2, r8; 'Config Rules' r8–9] |

Also: SF-01 is listed as triggering "A1, A2, A3, A4, A6, A7, A9, A10, A11, A12 and BSE/TSE evidence" [ReqDoc p.10 §5.3]. A13 is not in the origin table at all [ReqDoc p.11].

- **Why it matters (inferred):** The scope engine "blocks … core of the app" [KB 'Open Points' r2]. Every conflicting trigger either over-asks suppliers (burden, lower data quality) or under-asks (compliance gap). Trigger semantics (union? precedence?) must be fixed before rules are modelled, and later changes need versioned rules [BRM REQ-CFG-003].
- **Default (inferred):** Store rules as rows in a versioned rule table. Evaluate them as a union, so any trigger activates the annex. Seed the table from §5.3 and §5.4 combined. Mark the conflicting rows a–g as "pending BDF" so they can be switched without a redeploy.
- **Ask:** "For each annex, what is the single source of truth for activation: the origin type, a specific question (SF-03…SF-12), or both (either one activates)?
  1. Is A1 needed for mineral, petrochemical and polymer?
  2. Is A2 for vegetable only, or for all?
  3. Is A3 needed for every vegetable material, or only with fermentation/GMO?
  4. Is A7 needed for every mineral, or only for colorants?
  5. Is A10 always required, including CCU, waste and recycling, or only when ticked in K6.1?
  6. Are A11/A12 driven by origin, or only by UK/Turkey target markets?"

### C-07 — SF-01 origin type: single vs multiple; per raw material vs per component · CRITICAL · seed (g)

- **ReqDoc:**
  - SF-01 is "Origin type of the components" [ReqDoc p.10 §5.3].
  - K2.3 means "Origin type per component" [ReqDoc p.6 §4.1].
  - The configuration table "maps every valid combination of answers to the resulting scope" [ReqDoc p.11 §5.4].
- **FLM (latest):**
  - FLD-2.3-01 is a **Radio button**: one value, one field per raw material, in Meta Data [FLM r16–30].
  - Change log: "[Review] CIQ 2.3 allows several answers ("More than one answer is possible") – a radio button permits only one origin per component. Please confir[m]" [FLM changelog r35]. The text is truncated in the source.
- **Old Feldkatalog:** eight separate Yes/No origin fields of type "Checkbox / Multi-Select", "Mehrfachauswahl möglich" (multiple selection possible) [Feldkatalog r31–38].
- **KB:** "Multi-select (per component?)" [KB 'Config Questions' r2] and "Origin type per component" [KB 'Question Inventory' r20].
- **IKW (reference only):** each origin type is answered Yes/No independently, and the list includes microorganism and "other" [IKW p.4].
- **Why it matters (inferred):** Single vs multiple, and per material vs per component, changes the data model (one value vs a table), rule evaluation (one origin vs a set), and dependent fields (Part, Country, specification). Changing this after go-live means migrating every case.
- **Default (inferred):** Model origin as multi-select per component. Derive the material-level origin set as the union across components. A single-choice UI can still be configured if BDF wants it.
- **Ask:** "Can one raw material have more than one origin type, for example a vegetable oil with a petrochemical additive? Is the origin answered once per raw material or per component?"

### C-08 — Composition: repeatable component table vs single fields · CRITICAL · seed (h)

- **ReqDoc:**
  - K2.1 is "Full composition per component … Table with any number of components" [ReqDoc p.6 §4.1].
  - A10 is "Per substance, not per raw material" [ReqDoc p.8 §4.2].
- **BRM:**
  - Field types include "repeatable tables (e.g. component list of any length)" [BRM REQ-CFG-002].
  - K2.1 must be "analysed per component as a data record (INCI, CAS, EC, function, concentration)" [BRM REQ-PROC-006].
  - Acceptance example: "A query on K2.1, component 3, field CAS number" [BRM REQ-PROC-029].
- **Old Feldkatalog:**
  - FLD-2.1-008 "Komponentenzeile (Tabelle)" is repeatable, mandatory, with "Beliebige Anzahl Zeilen; mind. 1" (any number of rows, at least 1), citing REQ-CFG-102 [Feldkatalog r24].
  - The Annex 1 table has one row per component, auto-generated from 2.1 (FLD-A1-106) [Feldkatalog r61].
- **FLM (latest):**
  - Single INCI, CAS, EC, Additive, Function and Concentration fields inside "Meta Data" [FLM r10–15]. There is no table.
  - A2's INCI is a single field although the change log describes it as "per INCI component" [FLM r37; changelog r129].
  - FLD-2.1-008 and FLD-A1-106 are gone, and the change log does not record the removal (inferred from changelog r16–r182).
- **KB:** Q-006…Q-012 are all "Yes - per component" [KB 'Question Inventory' r8–14].
- **IKW (reference):** the template covers one main component, and pages are copied for multi-component systems. Additives are listed as repeated blocks [IKW p.2, p.6–7].
- **Why it matters (inferred):** Without per-component records, REQ-PROC-006 (analysable per component) and REQ-PROC-029 (query on a table row) cannot pass. The per-substance REACH annexes (A10–A12) also need a component key.
- **Default (inferred):** Build a repeatable component table (minimum one row) with stable row IDs. Annexes that repeat per component (A1 table, A2, A10–A12) become child tables keyed by component.
- **Ask:** "Is the composition a table of components, each with INCI, CAS and concentration, as the PDF and matrix say? Or is the new field matrix right that one INCI per raw material is enough? If it is a table, which annexes repeat per component?"

### C-09 — What the metadata step contains · HIGH · seed (i)

- **ReqDoc:**
  - "This phase is deliberately limited to the information needed for configuration" [ReqDoc p.3 §3.1.2].
  - "The supplier initially receives the basic data section with the configuration questions only" [ReqDoc p.9 §5.2].
- **BRM:** the supplier "may only maintain the basic data and the configuration questions required to derive the project-specific CIQ scope" [BRM REQ-PROC-004].
- **FLM 'Meta Data' contains more than configuration data:**
  - Composition fields: INCI, CAS, EC, additive, function, concentration [FLM r10–15].
  - Annex 1 table fields, "Moved from Annex 1 table 1 into the Meta Data block" [FLM r32, r34–35; changelog r126–127].
  - Natural origin index [FLM r33].
- **Inverse problem:** of SF-01…SF-12, only SF-01 has a metadata field (FLD-2.3-01).
  - SF-08 (palm) is asked **inside Annex 1** (FLD-A1-204) [FLM r48].
  - SF-06 (fermentation/GMO) exists only as an option **inside Annex 2** ("Biotechnology / Fermentation") [FLM r41].
  - SF-02 was dropped [FLM changelog r25].
  - SF-03, -04, -05, -07, -09, -10, -11 and -12 have no field at all (inferred from FLM r2–r55).
- **Why it matters (inferred):** If configuration questions live inside annexes, the scope cannot be derived once at PS-03. Answers inside the released scope would cascade into further activations, which needs a different engine design and a different supplier experience.
- **Default (inferred):**
  - Tier 1 (metadata) = identification fields plus all SF questions.
  - Tier 2 = everything else.
  - Conditional sub-sections are allowed only *inside* already-released sections.
- **Ask:** "Should all twelve configuration questions be asked up front in the metadata step? The field matrix puts composition data up front and moves the palm and fermentation questions into Annex 1 and Annex 2. Which approach is intended?"

### C-10 — Who owns or approves Annex 1, Annex 2, BSE/TSE, K2.x and the metadata fields · HIGH · seed (e)

| Item | ReqDoc §4.1 / §4.2 | ReqDoc §4.3 summary | ReqDoc §5.4 "Reviewing dept" | FLM "Approval" | Old Feldkatalog "Approval" |
|---|---|---|---|---|---|
| A1 | Safety and Sustainability [p.8] | Sustainability only [p.9] | Vegetable: Sustainability, Regulatory [p.11] | **Regulatory** for FLD-A1-201…208 [FLM r45–51]. **RMM** for A1 fields in Meta Data (FLD-A1-102/103/104) [FLM r32, r34, r35] | Sustainability / Safety (A1-101), Sustainability (A1-102…106) [Feldkatalog r56–61] |
| A2 | Regulatory, Safety **(lead)** [p.8] | Regulatory only [p.9] | – | **RMM** [FLM r37–43] | – |
| BSE/TSE + Annex II entry 419 (animal) | – | not assigned | Regulatory, QM [p.11] | **RMM** (upload on the Source-of-origin = Animal option) [FLM r17] | – |
| K2.1 composition | Regulatory [p.6] | Regulatory [p.9] | – | **RMM** [FLM r10–15] | RMM [Feldkatalog r17–23] |
| K2.2 | Safety (lead), QM [p.6] | Safety + shared [p.9] | – | (no K2.2 rows) | RMM / Regulatory / Safety / **Sustainability** [Feldkatalog r26–29] |
| K2.3 origin | RMM (lead), Safety, Sustainability, Regulatory [p.6] | Regulatory only [p.9] | – | RMM [FLM r16–30] | Vegetable = **Supplier**; others = RMM / Regulatory / Safety / Sustainability [Feldkatalog r31–38] |
| DUNS, manufacturer, site | – | – | – | RMM [FLM r7–9] | **Supplier** [Feldkatalog r5–7] |

- Neither the FLM legend [FLM changelog r1–6] nor the Feldkatalog defines what "Approval" means. For example, the Annex 4 fields that the supplier fills in have Approval = Safety [FLM r53–55]. So "Approval" is not "who enters the data" (inferred).
- **Why it matters (inferred):** Section ownership drives task creation [BRM REQ-PROC-017], edit rights [BRM REQ-PROC-019] and lead/co-review configuration [BRM REQ-CFG-006]. A wrong owner means the wrong department gets tasks and the right one cannot complete.
- **Default (inferred):** Keep ownership in a configurable table (section → lead, co-reviewers, informed), seeded from §4.1 because it is the most granular. Read FLM "Approval" as "field-level reviewer" only once BDF confirms that.
- **Ask:** "What does the 'Approval' column in the field matrix mean? Is it the department that reviews that field? If so, why are Annex 1 fields Regulatory and the metadata fields RMM, when the PDF names Sustainability/Safety and Regulatory?"

### C-11 — Two competing ways to decide who reviews: section ownership vs origin-based "Reviewing department" · HIGH

- **Section-based:**
  - The §4 ownership table is "the basis for the review and approval logic and for the assignment of tasks" [ReqDoc p.6 §4].
  - "Exactly those departments affected according to the section assignment receive a task" [BRM REQ-PROC-017; REQ-CFG-006].
- **Origin-based:**
  - The §5.4 table has a "Reviewing department" column per origin, e.g. Petrochemical → **Safety only**, Animal → **Regulatory, QM** [ReqDoc p.11–12].
  - The KB repeats this as "Review departments activated" [KB 'Config Rules' r1–r29].
- **Conflict example:** Petrochemical activates A10, A11 and A12 [ReqDoc p.11], which §4.3 assigns to Regulatory [ReqDoc p.9]. Yet the origin row names Safety only. The Animal row names QM, but QM owns no animal-specific section in §4.3 [ReqDoc p.9].
- **Why it matters (inferred):** The two mechanisms produce different reviewer sets, so tasks are missing or extra. The synchronisation point waits only for the subprocesses activated for the case [ReqDoc p.4 §3.2.1].
- **Default (inferred):** Derive reviewers only from the ownership of activated sections. Show the origin "reviewing department" for information only.
- **Ask:** "Who gets a review task: the owners of the activated sections, or the 'reviewing department' listed per origin in the configuration table? For a petrochemical material, does Regulatory review A10–A12?"

### C-12 — Customs (K7) and Legal (K8) own sections but have no review subprocess or role · MEDIUM · seed (q)

- **ReqDoc:**
  - K7 is owned by Customs / Trade Compliance: "The only section owned outside Regulatory, Safety, QM and Sustainability".
  - K8/K8.1 is owned by Legal / IP, "Read only for Legal" [ReqDoc p.8 §4.1].
  - Summary: "Single section; easily overlooked today" and "Single section, read only" [ReqDoc p.9 §4.3].
- §3.2 describes subprocesses only for RMES (Regulatory & Safety), QM, RMM and Sustainability [ReqDoc p.4–5 §3.2.3–3.2.6].
- **BRM** role model: RMM, Regulatory, Safety, QM, Microbiology, Sustainability, business administrator. **No Customs, no Legal** [BRM REQ-CFG-004].
- **KB:** NEW-11 [KB 'Open Points' r18]; "Does Legal approve or only read?" [KB 'Sections' r33].
- **Why it matters (inferred):** If Customs and Legal are reviewers, they need roles, tasks and a place in the synchronisation point. If they are not, nobody validates K7/K8 data, and the HS code drives customs handling.
- **Default (inferred):** Customs and Legal get read-only "informed" roles and a notification when Part 2 starts. They have no blocking subprocess. This can be configured to make them reviewers later.
- **Ask:** "Do Customs/Trade Compliance and Legal/IP review and complete anything in the tool, with a task that can block closure? Or do they only read K7 and K8?"

### C-13 — Is Microbiology a separate department? Is RMM a reviewer? · MEDIUM

- **Microbiology:**
  - It is a separate role [BRM REQ-CFG-004] and the sole owner of K5.1 [ReqDoc p.6].
  - It is merged into "QM / Microbiology" in the summary [ReqDoc p.9 §4.3] and for A3 [ReqDoc p.8].
  - No Microbiology subprocess is described [ReqDoc p.4–5 §3.2].
  - The KB lists "Microbiology" as its own review department [KB 'Config Rules' r2].
- **RMM:**
  - RMM co-owns K1 and leads K2.3 [ReqDoc p.6 §4.1], and is the "Approval" on most metadata [FLM r2–43].
  - RMM's subprocess "is still open" [ReqDoc p.5 §3.2.5], and RMM is absent from the §4.3 summary [ReqDoc p.9].
  - Today RMM is the single intermediary; in the target state departments talk to the supplier directly [ReqDoc p.1 §1, p.2 §2].
- **Why it matters (inferred):** This sets how many parallel subprocesses a case has and what the synchronisation waits for. RMM has two roles: case owner and possible reviewer.
- **Default (inferred):** Microbiology is its own role, mapped to the QM subprocess and configurable. RMM gets a "case owner" role, plus an optional RMM review subprocess that is switched off by default.
- **Ask:** "Is Microbiology its own review subprocess or part of QM? Does RMM review content (K1, K2.3) as a subprocess, or only coordinate the case?"

### C-14 — Production sites: one or many; is site approval in scope? · MEDIUM · seed (j)

- **ReqDoc:** SF-02 "Are there additional production sites?" → "Site data, no annex" [ReqDoc p.10 §5.3].
- **Old Feldkatalog:**
  - FLD-GEN-005: "Mehrere Standorte je CIQ-Projekt möglich" (several sites per CIQ project possible) [Feldkatalog r7].
  - FLD-GEN-006/007 cover further sites (SF-02). FLD-GEN-007 notes further sites are "nur informativ, nicht liefer-freigegeben" (informational only, not approved for delivery) [Feldkatalog r8–9].
  - Open point: "Offener Punkt, mit Proc klären" (open point, clarify with Proc) [Feldkatalog r8 col O].
- **FLM (latest):** "Only one production site (aligned with business departments) – FLD-GEN-006/-007 (further production sites) are dropped" [FLM changelog r25]. FLD-GEN-005 is a single mandatory field [FLM r9].
- **CIA:** multi-level supplier structures (Nice to Have) [CIA #28]; extension (Nice) [#29]; site qualification process (Nice) [#30]; **"Production Site Approval" (Must Have)** [CIA #31]. Kissflow answered that all are supported.
- **KB:** asks which fields per site [KB 'Config Questions' r3].
- **Why it matters (inferred):** One site vs many changes case identity (one case per material per site?) and the supplier master structure. Site approval (CIA #31) would be a separate process that neither the PDF nor the BRM describes.
- **Default (inferred):** One production site per case, following the latest decision in the FLM. Keep a supplier/site master so a second site becomes a new case for the same material. Site approval stays outside the MVP unless BDF says otherwise.
- **Ask:** "Can you confirm that one CIQ case is one raw material from one production site? If the same material comes from two sites, is that two cases? Is 'production site approval' (Must Have in your functional catalogue) part of this MVP?"

### C-15 — Contact name and role, supplier address, and the "responsible BDF owner" · MEDIUM · seed (k)

- **FLM change log:**
  - "[Review] No field for the contact person's name in the new structure – confirm (field catalogue FLD-VER-003)" [FLM changelog r20].
  - "[Review] Supplier address is no longer captured … please confirm that it is not required" [FLM changelog r17].
- **BRM requires these details:**
  - The completeness confirmation is recorded with "name, e-mail and timestamp" [BRM REQ-PROC-014].
  - All three confirmations carry "date, name and e-mail" [BRM REQ-PROC-015].
  - The final release carries "name, role, e-mail and timestamp" [BRM REQ-PROC-042].
- **Missing creation field:** BRM REQ-PROC-001 makes "responsible BDF owner" mandatory at creation. The FLM's Process Start section has trade name, supplier name and contact e-mails, but **no BDF owner field** [FLM r2–5]. The final PDF goes to "the responsible RMM owner" [BRM REQ-PROC-046].
- **Old Feldkatalog** had: person responsible (Muss), phone/fax (Soll), company responsible (red cell), and a "Digital signature" row (yellow cell) [Feldkatalog r10–15].
- **IKW (reference):** captures the supplier's address when it differs from the manufacturer's, and whether a contract manufacturer is used [IKW p.3].
- **Why it matters (inferred):** The release evidence needs a name and role. If these come from user accounts, supplier user profiles need a role attribute. The BDF owner drives routing of the PDF and of RMM tasks.
- **Default (inferred):** Take name and e-mail from the logged-in user. Capture "role/function" at the confirmation step. Add a BDF owner field (user picker) at creation. Keep supplier address optional.
- **Ask:** "When the supplier confirms or releases, should their name and role come from their user account or from a field they fill in? Do you need the supplier's address? Who is the 'responsible BDF owner': always the RMM who created the case?"

### C-16 — Integrations and master data: out of scope for 2026, yet assumed elsewhere · HIGH · seed (l)

- **ReqDoc:**
  - "Out of scope (2026): Integration with Teamcenter, B-Flow, SAP MDG and other relevant systems – the scope per target system is still open (OP-13)" [ReqDoc p.2 §1.1].
  - PS-01's "trigger is currently outside the target system" [ReqDoc p.3 §3.1.1].
  - **Yet** PS-13 files the final package "in the designated Beiersdorf repository (B-Flow) and provides the required status feedback to the preceding system" [ReqDoc p.5 §3.3.3].
  - Today RMM documents results in Teamcenter [ReqDoc p.5 §3.2.5].
- **BRM:** manual creation by RMM [BRM REQ-PROC-001]. The PDF is filed on the project and e-mailed to RMM [BRM REQ-PROC-046]. There is no integration requirement.
- **FLM:**
  - FLD-GEN-002: "Auto-fill from Teamcenter master data possible (post-MVP, REQ-PROC-104)" [FLM r3].
  - Contact e-mail is "pre-filled automatically from supplier master data" [FLM r4].
  - DUNS, manufacturer and site are "Auto-fill from master data" [FLM r7–9].
- **CIA Must Have:** start via Teamcenter [#1]; B-Flow storage including manual upload and rename [#12]; final document in B-Flow [#15]; status to Teamcenter [#18]; APIs to Teamcenter, B-Flow and SAP [#32]; low-code API configuration [#33]. The supplier contact database is only Nice to Have [#24]. Kissflow answered "fully supports" or "seamlessly integrates" [CIA #1, #12, #15, #18, #32].
- **Why it matters (inferred):** In the MVP there is no master-data source unless we build one, so "auto-fill" fields need manual entry and an internal supplier master. There is also an expectation risk: evaluators may test the Must Have integrations even though the PDF puts them out of scope.
- **Default (inferred):** For the MVP:
  - RMM creates cases manually.
  - An internal supplier master (DUNS, name, contacts) is the auto-fill source.
  - The final PDF is stored in the app and e-mailed.
  - Integration points are designed as documented webhooks or stubs, not live connections.
- **Ask:** "For the MVP test, should we show any integration, even a mock (Teamcenter start, B-Flow filing, status back)? Or is everything manual in 2026, as the PDF says? Where should supplier master data (name, DUNS, contacts) come from in the MVP?"

### C-17 — Departments may "extend or reduce" the scope vs "extend" only · MEDIUM · seed (m)

- **ReqDoc:** "The department sees the derived scope and can extend or reduce it during the IRMA process where necessary" [ReqDoc p.10 §5.2].
- **BRM:** "Authorised departments must be able to extend the derived scope with a mandatory justification". Reduction is not mentioned [BRM REQ-CFG-007]. Additional parts can be activated at any time [BRM REQ-ADR-002].
- **ReqDoc §7:** a reviewer may override applicability of RMES criteria (internal only, in both directions) with a mandatory reason [ReqDoc p.13 REQ-RMES-004].
- **Why it matters (inferred):** Reducing scope removes supplier obligations, must handle data already entered [BRM REQ-CFG-009], and can create a compliance gap. It therefore needs restricted rights and an audit trail.
- **Default (inferred):** Support both directions, each with a mandatory justification and an audit flag. Only the section's lead department may reduce. Removed data is retained (REQ-CFG-009 behaviour).
- **Ask:** "May a department also switch off a section the rules made mandatory, or only add sections? Who may do that?"

### C-18 — Is there a human scope check before the full questionnaire is released? · HIGH

- **ReqDoc §5.2** describes this sequence:
  1. The supplier gets basic data only.
  2. The system evaluates the answers and determines the scope.
  3. "The department sees the derived scope and can extend or reduce it".
  4. "**Only then** is the full questionnaire released to the supplier" [ReqDoc p.9–10 §5.2].

  The PS-04 trigger is "Configured CIQ released to the supplier" [ReqDoc p.2]. **But** PS-03's only actor is "System, using the configuration rules" [ReqDoc p.2 §2.1].
- **BRM:** there is no release or approval step between PS-03 and PS-04. Derivation is automatic [BRM REQ-PROC-009] and extension can happen "during" the process [BRM REQ-CFG-007].
- **Why it matters (inferred):** A human gate means every case waits for RMM or a department before the supplier can continue. That adds a task, a due date and a notification, and lengthens lead time.
- **Default (inferred):** Release automatically after derivation, with an optional "scope check by RMM" step that is switched off by default.
- **Ask:** "After the system generates the questionnaire scope, does someone at Beiersdorf (RMM or a department) check it before the supplier sees the full questionnaire, or is it released automatically?"

### C-19 — Can any mandatory item be satisfied by a justification? · HIGH

- **ReqDoc:** "Where the controlled rule requires a justification for a not-applicable response, submission is blocked until that justification is provided" [ReqDoc p.4 §3.1.4]. Here a justification applies only where a rule asks for one.
- **BRM:** "If the supplier cannot provide a mandatory field or a mandatory piece of evidence, they must give a written justification …; only with this justification does the item cease to be treated as blocking" [BRM REQ-PROC-012]. Here **any** mandatory item can be bypassed with a justification.
- **Old Feldkatalog:**
  - It has a per-field column "Begründung b. N/A" (justification if N/A) [Feldkatalog r1 col J], e.g. A14 limits: "Ja (bei Abweichung)" (yes, on deviation) [Feldkatalog r27–29].
  - A cell comment asks whether a justification is needed at all [Feldkatalog comment C46].
- **New FLM** has no such column [FLM 'CIQ new version' r1].
- **PDF examples** of justifications: K5.1 waiver [ReqDoc p.6]; a negative K6.9 answer [ReqDoc p.7]; K2.2 deviations [ReqDoc p.6].
- **Why it matters (inferred):** This sets the validation pattern for every mandatory field and upload. If the "justify instead of answer" path is universal, every field needs a companion justification and reviewers must assess each one.
- **Default (inferred):** Add a per-field setting "N/A allowed with justification" (default off). Always allow a "cannot provide + reason" path on evidence uploads. Justified gaps automatically show up as review items for the owning department.
- **Ask:** "Can a supplier skip *any* mandatory field by writing a justification (matrix REQ-PROC-012), or only specific fields where Beiersdorf allows it (PDF)? Who decides that per field?"

### C-20 — Palm / RSPO logic (SF-08) · HIGH

- **ReqDoc:**
  - SF-08 "Is the feedstock palm-based?" is a configuration question that triggers "A1 section 5, RSPO evidence" [ReqDoc p.10 §5.3].
  - For the "Vegetable and palm-based" row, required evidence is "RSPO certificate with supply chain model, RSPO number on the CoA" [ReqDoc p.11 §5.4].
- **BRM:**
  - Nested rule: "SF-01 plant-based AND SF-08 palm-based reproducibly returns A1 section 5 plus RSPO evidence" [BRM REQ-CFG-003].
  - "For type of origin 'mineral', A3 (GMO) and the palm/RSPO part of A1 are not visible to the supplier" [BRM REQ-PROC-009].
- **FLM:**
  - The palm question FLD-A1-204 sits **inside Annex 1** and is shown whenever Annex 1 is active: **Bio Mass, Mineral, Petrochemical or Polymer** [FLM r48]. The change log confirms "Palm use is now captured explicitly via FLD-A1-204" [FLM changelog r123].
  - RSPO options include "No RSPO certification" [FLM r49]. Yet the change log says "RSPO Mass Balance is the minimum for palm – 'No RSPO certification' is a deviation to be assessed by BDF" [FLM changelog r162].
  - There is no RSPO certificate upload and no RSPO-number-on-CoA field (inferred from FLM r45–51).
  - The FLD-A1-208 upload is "a BDF extension – please confirm" [FLM changelog r172].
- **Why it matters (inferred):** The FLM design fails a BRM acceptance test (mineral must not see the palm part). RSPO evidence is high-impact for Sustainability [ReqDoc p.9 §4.3].
- **Default (inferred):** Show the palm question only when the origin includes vegetable. Make the RSPO certificate upload mandatory when palm = Yes. Allow "No RSPO", but raise an automatic finding for Sustainability.
- **Ask:** "Should the palm-oil question appear only for vegetable materials (matrix) or for every material with Annex 1 (field matrix)? If a palm-based material has no RSPO certificate, is that allowed with a justification, or does it block submission?"

### C-21 — Pesticide and mycotoxin analysis: for which origins? · MEDIUM

- **ReqDoc:** "Pesticide and mycotoxin analysis, sustainability certificates" is additional evidence for **Vegetable** only [ReqDoc p.11 §5.4].
- **FLM:** "Pesticides analysis available" is mandatory whenever Annex 1 is active (**Bio Mass, Mineral, Petrochemical or Polymer**) [FLM r45–47]. There is no mycotoxin field and no "sustainability certificates" field (inferred from FLM rows).
- **IKW (reference):** pesticide screening is asked for plant extracts; pesticides and mycotoxins appear in the impurity list [IKW p.8, p.16].
- **Why it matters (inferred):** Asking a mineral or polymer supplier for a pesticide analysis creates noise ("No + reason"). A missing mycotoxin question is a compliance gap.
- **Default (inferred):** Ask for pesticide and mycotoxin analysis for vegetable origin only, and hide the questions otherwise.
- **Ask:** "Should pesticide and mycotoxin analysis be requested only for vegetable materials, or also for mineral, petrochemical and polymer ones?"

### C-22 — Annex 14 limits: the referenced annex no longer exists · HIGH · seed (u)

- **ReqDoc:**
  - K2.2: "Limits checked against the Beiersdorf values in Annex 14; deviations require a justification" [ReqDoc p.6 §4.1].
  - A14: "Moved into the main document … Content is covered by chapter K2" [ReqDoc p.9 §4.2].
  - The CIQ has "eight main chapters and 14 annexes" [ReqDoc p.1 §1].
- **Old Feldkatalog:**
  - Section header "2.2 – Byproducts and contaminations (inkl. Annex 14: Heavy Metals, Residues/Limits, Specific Impurities, CMR)".
  - Limits: **As ≤ 0.5, Cd ≤ 0.1, Cr ≤ 5.0 mg/kg**, with "Confirmed=true nur wenn Wert ≤ Limit" (only if value ≤ limit), a justification on deviation, citing REQ-PROC-106 [Feldkatalog r25–29].
- **New FLM:** no K2.2 rows at all [FLM r2–55].
- **ReqDoc §7:** capture "reported values, units, applicable limit and evaluation result", and keep the limit and rule-set version reproducible [ReqDoc p.13 REQ-RMES-008].
- **KB:** NEW-06 [KB 'Open Points' r13].
- **IKW (reference):** the industry impurity list is much broader: 13 named metals plus solvents, monomers, nitrosamines, 1,4-dioxane and PAH [IKW p.7–9].
- **Why it matters (inferred):** Limit checking is quantitative logic. It needs a versioned limit table (substance, unit, limit, method) and a decision on whether the supplier sees the limits. Without it, RMES-008 cannot be met.
- **Default (inferred):** A versioned limit master table, with evaluation computed in the app. Seed it from the Feldkatalog values marked "unconfirmed". The supplier sees pass/fail prompts only if BDF allows.
- **Ask:** "Where are Beiersdorf's limit values (former Annex 14 and the PAH limits in Annex 9) maintained today, who owns them, and may the supplier see them while filling in the form?"

### C-23 — Cancellation and reactivation · MEDIUM · seed (n)

- **ReqDoc:** "A process can be cancelled if the associated raw material is no longer relevant … A cancelled process can be reactivated within a defined period (assumption: 1 year, to be confirmed)" [ReqDoc p.5 §3.3.3].
- **BRM:**
  - Cancellation requires a justification, "ends all open tasks, including those at the supplier", and the project is "identifiable as cancelled". **No reactivation** [BRM REQ-PROC-049].
  - RMM can also trigger completion manually "in exceptional cases (e.g. cancellation)" [BRM REQ-PROC-045].
- **KB:** NEW-15 [KB 'Open Points' r22].
- **Why it matters (inferred):** Reactivation needs a specific state, data retention for the period, re-created tasks and renewed supplier access. These are hard to add cleanly later.
- **Default (inferred):** A "Cancelled" state that RMM can reactivate within a configurable period (default 365 days), resuming at the last active step. After the period, the case becomes a read-only archive.
- **Ask:** "Can a cancelled case be reactivated? Within what period, by whom, and does it resume where it stopped or restart?"

### C-24 — RMES requirements: "Must" vs "MVP partial scope"; RMES missing from the matrix · HIGH · seed (o)

- **ReqDoc §7:** "All requirements below are Must requirements for an end-to-end Safety and Regulatory review unless the MVP decision explicitly records a deferral" [ReqDoc p.12 §7].
- **BRM:**
  - REQ-PROC-021 (RMES instrument), REQ-PROC-022 (pre-population) and REQ-PROC-024 (AI review) are "MVP partial scope", which means "Partly in the MVP; the exact scope still has to be defined" [BRM r27–29; BRM Legend r5].
  - **None of REQ-RMES-001…020 appears in the BRM** (inferred from BRM rows 2–52). Yet the PDF says detailed requirements live in the matrix [ReqDoc p.1 §1].
- The "MVP decision" record was not shared (see G-08).
- **Why it matters (inferred):** RMES is the largest internal feature: 20 requirements covering configurable criteria, findings, approvals, export and the audit record. Sizing and the evaluation depend on it.
- **Default (inferred):**
  - In the MVP: one RMES record per submitted version (RMES-001), a small configurable criteria set (RMES-002), findings with queries (RMES-009/010), separate department outcomes (RMES-013) and supplier invisibility (RMES-015).
  - Deferred: AI review (REQ-PROC-024). RMES-020 export becomes a simple PDF.
- **Ask:** "Which RMES capabilities must the MVP show? Can you share the RMES template (Parts A–D) and tell us which of REQ-RMES-001…020 are deferred?"

### C-25 — Supplier-side task assignment vs BDF naming the supplier contact · MEDIUM · seed (r)

- **BRM:** "The assignment of tasks on the supplier side takes place exclusively on the supplier's side" [BRM REQ-CTL-001].
- **But BDF names supplier people elsewhere:**
  - RMM creates the project with a mandatory "supplier contact" [BRM REQ-PROC-001].
  - The "named supplier contact" receives access and the metadata task [BRM REQ-PROC-004].
  - Every task has "exactly one named responsible person or responsible role" [BRM REQ-CTL-003].
  - A query contains the "responsible supplier contact" [ReqDoc p.13 REQ-RMES-010].
  - The contact e-mail is set by RMM [FLM r4–5].
- **CIA (Must Have):** "No-code assignment of roles to suppliers. The role structure should be individually configurable for each supplier" [CIA #26]. "Assignment of persons to roles separately for BDF and individual suppliers" [CIA #27].
- **Why it matters (inferred):** We need a supplier-side coordinator role that can invite colleagues and reassign work. We also need a rule on whether BDF can address a query to a specific supplier person.
- **Default (inferred):** RMM names the primary supplier contact, who becomes the supplier coordinator. The coordinator can add colleagues and reassign supplier tasks. BDF queries go to the coordinator by default.
- **Ask:** "Who decides which person at the supplier answers which section: Beiersdorf when raising a query, or the supplier's main contact? Can the supplier invite colleagues themselves?"

### C-26 — Status vocabularies differ across documents · MEDIUM

| Object | Statuses | Source |
|---|---|---|
| Section | open, in progress, with the supplier, reviewed, completed | [BRM REQ-CTL-006] |
| Open point | open, in progress, closed (traffic light) | [BRM REQ-PROC-034] |
| RMES progress | unassigned, open, waiting for supplier, overdue, reopened, approved, rejected | [ReqDoc p.14 REQ-RMES-018] |
| Subprocess | completed [BRM REQ-PROC-038] vs approved/rejected | [ReqDoc p.3 PS-11] |
| Case | final status; cancelled; "closed in the dashboards with its final status" | [BRM REQ-PROC-045, -049; ReqDoc p.5 §3.3.3] |

- The overall status "must be derived traceably from the section and subprocess statuses" [BRM REQ-CTL-006], but no derivation rule is given.
- **Why it matters (inferred):** The status model is the backbone of every dashboard and gate. Inconsistent value lists lead to refactoring later.
- **Default (inferred):** One status model per object (case, subprocess, section, open point, task) with explicit derivation rules. We draft it and BDF signs it off.
- **Ask:** "Can we agree one list of statuses each for the case, the department review, the section and the query? We will propose a draft; who on your side signs it off?"

### C-27 — What a request must contain · LOW

- **ReqDoc:** "Every request must contain a business justification, a responsible person and a due date" [ReqDoc p.12 §6.2].
- **BRM:**
  - Only "a responsible person and an internal due date (remains flexible)" block sending [BRM REQ-ADR-001]. An object reference is also mandatory [BRM REQ-PROC-029].
  - Yet the supplier sees "reference, justification, responsible person and due date" [BRM REQ-PROC-030].
- **Default (inferred):** Require reference, justification, responsible person and due date.
- **Ask:** "Must every query carry a written justification (PDF), or only a person and due date (matrix)?"

### C-28 — Field matrix requirement IDs follow an older numbering than the BRM · MEDIUM

- The FLM column "CIQ Requirement ID" is **hidden** [FLM 'CIQ new version' hidden col B].
  - It cites REQ-PROC-005 on almost every data field, including annex fields such as MOAH [FLM r10–55]. In the BRM, REQ-PROC-005 is "Mandatory field check for metadata".
  - It cites REQ-PROC-010 on upload fields [FLM r45–46, r51, r55]. In the BRM, REQ-PROC-010 is the mandatory/optional/N.A. classification; uploads are REQ-PROC-011.
  - DUNS is "Key search field (REQ-PROC-005)" [FLM changelog r24]. In the BRM, search is REQ-PROC-006.
- The **Feldkatalog**:
  - cites REQ-PROC-033 for the INCI auto-fill into Annex 1 [Feldkatalog r56, r61], while BRM REQ-PROC-033 is "Complete communication history";
  - titles its (hidden) column "Ref. v3.1 (REQ-ID)" [Feldkatalog r1 col L].
- REQ-PROC-003 (supplier access) [FLM r4–5] appears to be today's REQ-PROC-004 (inferred).
- **Why it matters (inferred):** Acceptance testing and change-impact analysis over several years depend on a reliable field-to-requirement trace.
- **Default (inferred):** We keep our own trace from fields to current BRM IDs and flag every mismatch.
- **Ask:** "The field matrix references requirement IDs from an older catalogue ('v3.1'). Is the current Business Requirements Matrix the master? Can you share v3.1 or a mapping?"

### C-29 — Old Feldkatalog vs new FLM vs KB proposals: field-level decisions disagree · LOW

| Field | Old Feldkatalog | New FLM | KB |
|---|---|---|---|
| CAS No. | Muss (mandatory); cell E18 yellow = open [Feldkatalog r18] | Optional, validated if filled [FLM r11] | Proposed mandatory "Yes" [KB 'Question Inventory' r9] |
| EC number | Soll (should) [Feldkatalog r19] | Optional [FLM r12] | "?" [KB r10] |
| DUNS | Mandatory at start (PS-01), Approval Supplier [Feldkatalog r5] | Meta Data (PS-02), Approval RMM [FLM r7] | – |
| Supplier | "name & address" [Feldkatalog r4] | name only [FLM r3; changelog r16–17] | BD-01 "name and supplier ID" |
| Production site | "city & country", several possible [Feldkatalog r7] | "name & address", one only [FLM r9; changelog r25] | – |
| Source of origin per component (text) | FLD-2.1-006 [Feldkatalog r22] | Replaced by a single FLD-A1-102 Feedstock in Meta Data [changelog r123] | Q-011 per component |
| Function | Free text [Feldkatalog r21] | Free text [FLM r14] | "Dropdown?" [KB r11] |

- **Default (inferred):** Where the FLM v0.6 covers a field, it supersedes the old Feldkatalog. KB proposals stay unconfirmed.
- **Ask:** "Can we treat the field matrix v0.6 as superseding the old German field catalogue wherever they overlap?"

### C-30 — BDF requirements vs Kissflow's own submitted answers (expectation risk) · MEDIUM

- **CIA #34:** "User guide / explainer video to be provided by the vendor; FAQs" (Must Have). Kissflow answered that "the specific content is tailored by the customer" [CIA #34].
- **CIA #12:** "Manually upload, rename the documents must be possible". Kissflow's answer covers automatic transfer only [CIA #12].
- **CIA #5:** text modules must be "maintained flexibly and transferable into documents". Kissflow's answer covers PDF generation, not maintaining text modules [CIA #5].
- **Retention:** Kissflow "does not natively manage configurable records retention policies or regulatory retention schedules" [VQ r23]. Meanwhile BDF requires:
  - an immutable final package [ReqDoc p.5 §3.3.3] and an immutable audit trail [ReqDoc p.14 REQ-RMES-016];
  - reactivation within a period [ReqDoc p.5].

  With B-Flow out of scope in 2026 [ReqDoc p.2], retention must happen inside the tool (inferred).
- **Integrations** were answered "fully supports" while BDF scoped them out for 2026 (see C-16).
- **Why it matters (inferred):** The evaluators will compare our MVP with our written answers.
- **Ask:** "For the MVP evaluation, do you expect us to deliver supplier guidance material (guide, video, FAQ) and to demonstrate document retention and archiving rules?"

---

## 2. Contradictions inside a single document

### C-31 — ReqDoc: SF-12 switches off K5.3; the challenge test has no chapter; two owners for K5.3 · MEDIUM · seed (p)

- **SF-12's effect is described as:** "Deactivates the microbiological test (5.1) and the challenge test with a justification; the total microbial count (5.2) stays mandatory". The sections it triggers are "**K5.1, K5.3**" [ReqDoc p.11 §5.3].
- **Problem 1 — K5.3 is a different topic:** K5.3 is "Antimicrobial treatment" (irradiation, heat, ethylene oxide) [ReqDoc p.7 §4.1].
- **Problem 2 — the challenge test has no section ID:** "the challenge test sits between 5.2 and 5.3 without its own chapter number" [ReqDoc p.6 K5.2].
- **Problem 3 — two owners for K5.3:** **Safety** [ReqDoc p.7 §4.1] vs **QM / Microbiology** [ReqDoc p.9 §4.3].
- **(inferred)** SF-12 "Is microbiological testing required?" asks the supplier something that sounds like a BDF decision.
- **KB:** NEW-08, NEW-09 [KB 'Open Points' r15–16].
- **IKW (reference):** the challenge test sits inside the microbiology chapter [IKW p.11].
- **Why it matters (inferred):** A wrong deactivation either hides safety-relevant treatment data or keeps the challenge test always on. The challenge test needs its own section ID for rules and ownership.
- **Default (inferred):** Add a section "K5.2a Challenge test" owned by Microbiology. SF-12 = No switches off K5.1 and K5.2a, with a justification. K5.3 always applies, with the §4.1 owner (Safety) pending confirmation.
- **Ask:** "When microbiological testing is waived, which parts are switched off: only the micro test and the challenge test, or also K5.3 antimicrobial treatment? Who reviews K5.3, Safety or QM/Microbiology? And who answers SF-12, the supplier?"

### C-32 — ReqDoc: the §4.1/§4.2 department table vs the §4.3 summary · HIGH

| Section | §4.1 / §4.2 | §4.3 summary |
|---|---|---|
| K1 | QM (lead), Regulatory, RMM, Safety [p.6] | QM only [p.9] |
| K2.3 | **RMM (lead)**, Safety, Sustainability, Regulatory [p.6] | Regulatory only. **No RMM row** in §4.3 [p.9] |
| K4.2 | Safety, Regulatory ("Environmental") [p.6, layout-verified] | Safety only |
| K4.3 | Safety (lead), Regulatory [p.6] | Safety only |
| K5.2 | Microbiology, Safety (to be informed) [p.6] | QM / Microbiology |
| K5.3 | Safety [p.7] | QM / Microbiology |
| K6.5, K6.6 | Regulatory, Safety [p.7] | Regulatory (as part of K6.1–K6.8) |
| K6.9 | Safety (lead), Regulatory [p.7] | Safety only |
| K6.14 | Regulatory and Safety jointly [p.7] | Neither department row lists it. Only the "Shared" row does |
| A1 | Safety and Sustainability [p.8] | Sustainability only |
| A2 | Regulatory, Safety (lead) [p.8] | Regulatory only |
| A6 | Safety, Regulatory [p.8] | Safety only |
| A8 | Regulatory, Safety [p.8] | Regulatory only |

- The "Shared responsibility" row lists only K6.14, K6.17 and K2.2, and asks for a lead rule (OP-18) [ReqDoc p.9]. Yet a dozen more sections name several departments in §4.1.
- **Why it matters (inferred):** These tables are the seed data for ownership configuration [BRM REQ-CFG-006] and decide how many reviewers each section has.
- **Default (inferred):** Use §4.1/§4.2 as the master because they are more granular. The department marked "(lead)", or listed first, is the lead; the others are co-reviewers.
- **Ask:** "Section 4.1 and the summary in 4.3 disagree for about a dozen sections (we have the list). Which table is right? For sections with several departments, who leads, and do the co-reviewers also have to complete?"

### C-33 — ReqDoc: version labels, structure and garbled cells · LOW · seed (t)

- **Version labels:** the page header says "Requirements Document **v1.4**" on all 14 pages. The title block says "Version **2**" [ReqDoc p.1]. The file name says "v2.0". The embedded Word title is "CIQ_Requirements_Document_**v1_Two_Phase_Process**" [ReqDoc metadata].
- **Missing §3.3.1:** §3.3 "Synchronisation, overall decision and closure" starts at §3.3.2 [ReqDoc p.5]. Synchronisation is only described inside §3.2.1 [ReqDoc p.4].
- **K8.1 appears twice:** "K8, K8.1 Patent" and "K8.1 Additional patent information" [ReqDoc p.8].
- **Duplicated sentence:** the separate Sustainability questionnaire is mentioned in both §3.2.6 and §3.3.2 [ReqDoc p.5].
- **Garbled cells** (confirmed in layout mode):
  - A1 particularity "d traceability" [p.8].
  - A2 trigger "Vegetable origin and is not stated in the CIQ (OP-19)" [p.8].
  - K4.2 "Biodegradability, … Safety, Regulatory Environmental" [p.6].
  - K6.17 business meaning "Scope and" [p.8].
- **(inferred)** The §3.4 bullet list ends with a semicolon [ReqDoc p.6], so it may be truncated.
- The status is "Business process (MVP phase)". Chapters are marked "(draft, review)" or "(draft)" [ReqDoc p.6, p.9, p.10, p.11, p.12].
- **Ask:** "Is 'v2.0 dated 16 Sep 2026' the latest? Was a section 3.3.1 removed? Could you send the Word original? Some cells are cut off in the PDF (A1, A2, K4.2, K6.17)."

### C-34 — BRM: read rights between departments · MEDIUM

- "A Regulatory reviewer can read Safety assessments (**only PDF documents from supplier**) but cannot edit them" [BRM REQ-CFG-004]. The parenthesis restricts *what* can be read.
- "**All internal roles must be able to read all project content**; only their own business area is editable" [BRM REQ-PROC-019].
- Legal is "Read only" [ReqDoc p.8].
- **Default (inferred):** All internal roles read all content and edit only their own areas. An internal-only notes area stays hidden from suppliers [BRM REQ-PROC-020].
- **Ask:** "Can every Beiersdorf reviewer see every other department's assessments and comments, or only the supplier's documents?"

### C-35 — BRM: which version does an assessment refer to? · MEDIUM

- "Every review assessment in PS-06 to PS-10 refers to the version of the answer or document fixed in PS-05" [BRM REQ-PROC-016].
- But:
  - every status change records "the reviewed evidence version" [BRM REQ-PROC-034];
  - Part-2 changes inform the affected departments [BRM REQ-PROC-031];
  - closure records the "accepted evidence version" [ReqDoc p.13 REQ-RMES-011].
- "It should be possible to restore the historical data where required" [BRM REQ-PROC-016], but who restores, and to what, is undefined.
- **Default (inferred):** Every assessment references an explicit version ID. That is the PS-05 snapshot at first, and later versions once data is updated through the query loop.
- **Ask:** (combine with C-04) "When an answer changes during review, does the department's assessment move to the new version? What does 'restore historical data' mean in practice?"

### C-36 — BRM: internal due date vs due date shown to the supplier · LOW

- REQ-ADR-001 requires an "internal due date (remains flexible)" [BRM REQ-ADR-001].
- The supplier sees "reference, justification, responsible person and due date" [BRM REQ-PROC-030].
- **Ask:** "Is the due date on a query shown to the supplier, or kept internal?"

### C-37 — BRM: "exactly one responsible" vs shared sections and parallel supplier contacts · MEDIUM

- "Exactly one named responsible person or responsible role" per task, and "for every open action … exactly one task with a responsible person" [BRM REQ-CTL-003].
- Yet there are lead and co-reviewing departments [BRM REQ-CFG-006], shared sections [ReqDoc p.9 OP-18], and several supplier contacts working in parallel [BRM REQ-CTL-001].
- **Ask:** "For a shared section (e.g. K2.2, Safety + QM), is there one task for the lead, or one task per department?"

### C-38 — BRM: manual completion "e.g. cancellation" vs a separate cancellation; final statuses · LOW

- "RMM must still be able to trigger the completion manually in exceptional cases (e.g. cancellation)" [BRM REQ-PROC-045].
- Cancellation is its own requirement, with a justification [BRM REQ-PROC-049].
- "Without a release from PS-11 no automatic completion takes place" [BRM REQ-PROC-045].
- **Ask:** "Besides 'cancelled', can RMM force-close a case as 'completed' without the supplier's release? Which final statuses exist?"

### C-39 — BRM: additional parts "at any time" vs the final-release sequence and freeze · MEDIUM

- Departments may activate additional parts "throughout the entire process" [BRM REQ-ADR-002].
- The supplier is asked for the final release only once all departments have completed [BRM REQ-PROC-040], and the CIQ is frozen on release [BRM REQ-PROC-043].
- It is undefined whether a department that has already completed can reopen and add an annex (inferred).
- **Ask:** "Until when can a department add an annex or a question? Also after it has completed its own review, or after the supplier has been asked for the final release?"

### C-40 — BRM: workbook integrity · LOW

- The legend says "Yellow cell — Open business question - see sheet 'Open points'" [BRM Legend r7]. The workbook has only two sheets, "Requirements Matrix" and "Legend". No matrix cell has the legend's yellow (FFFF00), and column I "Open question / comment" is empty in all 51 rows [file metadata; BRM col I].
- A light-orange fill on the requirement text of REQ-CFG-008, REQ-CFG-009, REQ-PROC-020 and REQ-PROC-024 is not explained in the legend [file metadata].
- The "Post-MVP" legend category is used by no requirement [BRM col H].
- Some MVP-marked requirements use "should": REQ-PROC-011 (document overview), REQ-PROC-020 and REQ-PROC-024 [BRM].
- There are gaps in the ID numbering (see G-05).
- **Ask:** "What does the orange highlight on four requirements mean (re-derivation, data retention, internal communication, AI review): new, changed or contested? Is there an 'Open points' sheet we did not receive?"

### C-41 — FLM: Annex 1 data mandatory for all origins · MEDIUM · seed (s)

- FLD-A1-103 "Content [%] in INCI" and FLD-A1-104 "Content [%] in raw material" are Mandatory, with Dependent = No [FLM r34–35].
- The FLM's own change log says: "[Review] In the CIQ only required if Annex 1 applies (Bio Mass, Mineral, Petrochemical, Polymer); currently mandatory for all origins" [FLM changelog r126–127].
- **Extended:**
  - FLD-A1-102 Feedstock ("e.g. sunflower, palm, soy") is mandatory for all origins, including animal, CCU, waste and recycling [FLM r32].
  - FLD-2.1-102 Natural origin index is mandatory for all origins [FLM r33].
- **Ask:** "Should feedstock and the Annex 1 content percentages be asked for every material, or only when Annex 1 applies?"

### C-42 — FLM: change-log integrity · MEDIUM

- **Remarks truncated at about 200 characters in the source cells** (checked in the workbook):
  - r23 ends "…Bitte entscheid" ("please decid…");
  - r35 ends "Please confir";
  - r123 ends "…does not need to be rul";
  - r126 ends "please conf";
  - r132 ends "check single";
  - r162 ends "CoA of ea" [FLM changelog].

  Several open questions are therefore incomplete.
- **Missing column:** the change log refers to a column "Remarks / Open Points" that does not exist in 'CIQ new version' (columns A–M) [FLM 'CIQ new version' r1; changelog r17, r20 …]. The "[Review]" open points are therefore invisible in the matrix itself.
- **Silent removals:** none of these appear in the new sheet, and the change log does not record their removal:
  - FLD-2.1-008 (component table);
  - FLD-A1-101, FLD-A1-105, FLD-A1-106 (Annex 1 table);
  - FLD-2.2-001 and FLD-A14-101…103;
  - FLD-4.1-*, FLD-6.1-*;
  - FLD-VER-001/003/004/005.

  Only the removals of FLD-2.1-006, FLD-GEN-006/007 and FLD-A4-104 are logged [changelog r25, r123, r182]. (inferred: the rest may simply be outside the "test scope" [FLM r41].)
- **Sheet vs log mismatch:** the change log says "multiple countries – to be clarified" [changelog r41], but the sheet says only "multiple countries" [FLM r19].
- **Legend colours not applied:** green/orange/blue fills are not used in 'CIQ new version'; only the separator rows are coloured [file metadata].
- **Ask:** "Several review remarks in the change log are cut off at 200 characters. Could you send the full list of open points for the field matrix? Were K2.2, K4.1, K6.1 and the component table deliberately removed, or are they just outside the test scope?"

### C-43 — FLM: field types do not fit the stated validations · LOW

- FLD-2.1-007 concentration is "Number+Unit", yet "range min–max allowed; min ≤ max" [FLM r15]. A range needs two numbers.
- FLD-A4-103 is "Checkbox+Number", where the checkbox chooses between "Conclusion by analogy / Own value", which are mutually exclusive [FLM r55].
- FLD-2.3-10 country is "Text … multiple countries" with no controlled list [FLM r19].
- FLD-A2-102 is Single-select, while the CIQ uses checkboxes (multiple) [FLM changelog r132].
- FLD-A1-103/104 are "Number" with "0–100 %" [FLM r34–35]. The MOAH unit is undefined [changelog r174].
- The type list offers "Radio button", "Single-select" and "Dropdown" without defining the difference [FLM data validation E2:E56].
- **Ask:** "Should countries be chosen from a standard list, and can concentrations be entered as a min–max range?"

### C-44 — Old Feldkatalog: internal inconsistencies and an unresolved comment · LOW · seed (v)

- **Cell comment C46** on FLD-6.1-001 "Reg.-status: Registration Numbers listed below":
  - Pevzner: "Hier bitte prüfen, ob die Begründung notwendig ist" (please check whether the justification is necessary).
  - "Kommentar Wieke: Welche Begründung?" (which justification?).
  - The comment is unresolved, and the row's "Begründung b. N/A" column says "Nein" (no) [Feldkatalog r46, comment C46].
- **Approval inconsistency:** the vegetable origin row has Approval = "Supplier", while the other origin rows have "RMM / Regulatory / Safety / Sustainability" [Feldkatalog r31–38].
- **Sites contradict each other:** FLD-GEN-005 says several sites are possible per project; FLD-GEN-007 says further sites are informational only [Feldkatalog r7, r9].
- **Empty or ID-less rows:** FLD-VER-002 and FLD-4.1-103 are empty rows. The "Digital signature" row has no ID and is highlighted yellow [Feldkatalog r11, r15, r43].
- **Unmapped priority level:** "Soll" (should) is used for e.g. FLD-2.1-003, FLD-4.1-* and FLD-6.1-*, but the harmonisation maps only Muss/ja, kann/nein and Bedingt-Muss [Feldkatalog r19, r40–48; FLM changelog r10].
- **Colours without a legend:** yellow (open) cells C8, K8, O8, C9, K9, K10, C13, C15, E18, and red A10:C10, have no legend in the sheet.
- **Ask:** "Who is 'Wieke' (from the comment in the field catalogue), and what was decided about the justification for REACH registration status? Is a digital signature needed for the supplier's sign-off?"

---

## 3. Gaps: referenced but missing artefacts, IDs and definitions

### G-01 — The authoritative process diagram · CRITICAL
- **Referenced:** "The process diagram is authoritative for the structure and sequence in this document" [ReqDoc p.2 §2].
- **Missing:** all 14 PDF pages contain 0 embedded images [ReqDoc dump page headers]. No other file contains a diagram.
- **Impact (inferred):** the tie-breaker for C-01, C-02 and C-18 is missing.
- **Ask:** "Could you share the process diagram (BPMN, Visio or a picture) that the PDF calls authoritative?"

### G-02 — The CIQ 2026 questionnaire itself (Word template) · CRITICAL
- **Referenced in the ReqDoc:**
  - the "2026 edition … eight main chapters and 14 annexes … exchanged as a document" [ReqDoc p.1 §1];
  - "derived from the CIQ source document" [ReqDoc p.10 §5.3];
  - "Structural illustration based on the CIQ source document" [ReqDoc p.12].
- **Referenced in the FLM:**
  - legend: "source: CIQ 2026 Word template / field catalogue" [FLM changelog r2];
  - quotes such as "CIQ 2.3", "CIQ footnote 3" and "CIQ Annex 4 section 3" [FLM changelog r30, r35, r177].
- **Missing.** The IKW file is explicitly not BDF's and cannot replace it.
- **Impact (inferred):** there is no question inventory for most chapters and annexes [KB 'Open Points' r3 NEW-01].
- **Ask:** "May we receive the current CIQ 2026 questionnaire (Word), even as a confidential reference?"

### G-03 — Field-level specification covers only a small part of the CIQ · CRITICAL
- **What the FLM covers:** Process Start (4 fields), Meta Data (about 22 fields), Annex 2 (3 fields), Annex 1 (7 fields) and Annex 4 (3 fields) [FLM r2–55]. Annex 3 is "outside test scope" [FLM r41].
- **What it does not cover:** K1, K2.2, K3, K4, K5, K6, K7, K8, A3 and A5–A13.
- **BRM acceptance tests reference unspecified content:**
  - a Turkey REACH section [BRM REQ-CFG-001];
  - a K2.2 batch certificate [BRM REQ-PROC-011];
  - the K5.1 waiver [BRM REQ-PROC-012];
  - "K2.1, component 3, CAS" [BRM REQ-PROC-029];
  - A3 hidden for mineral [BRM REQ-PROC-009].
- **Ask:** "Is the field matrix v0.6 the complete MVP test scope? If so, how will the matrix acceptance tests that mention K2.2, K5.1 and Turkey REACH be run?"

### G-04 — Binding configuration table (OP-19) · CRITICAL
- **Referenced:**
  - the SF list "is a draft and has to be completed and confirmed by the business departments (OP-19)" [ReqDoc p.10 §5.3];
  - "The binding configuration table has to be collected with the business departments" [ReqDoc p.12].
- **Missing:**
  - combination rules and exclusions [KB 'Config Rules' r30];
  - rules for waste, CCU and recycling [ReqDoc p.11–12].
- **Ask:** "What is the current state of the configuration table, who owns it, and when will a binding version exist? Can we work with a draft?"

### G-05 — Requirement catalogue "v3.1" and requirement IDs that are cited but never defined · HIGH

| ID | Cited in | Apparent meaning |
|---|---|---|
| REQ-PROC-003 | [FLM r4, r5; Feldkatalog r12, r14] | Supplier access and notification |
| REQ-PROC-104 | [FLM r3; Feldkatalog r4] | Teamcenter master-data pre-fill (post-MVP) |
| REQ-PROC-106 | [Feldkatalog r27–29] | Quantitative limit check |
| REQ-CFG-102 | [Feldkatalog r24, r61] | Repeatable table field type |
| REQ-CFG-103 | [FLM r16–30, r48–49; Feldkatalog r31–38, r49] | Configuration rule (origin, palm) |
| REQ-CFG-105 | [FLM r8, r9; Feldkatalog r6–14] | Supplier structure (manufacturer, sites, contacts) |
| REQ-CTL-012 | [FLM r5; Feldkatalog r14] | Notification recipients |
| REQ-ADR-003 | [Feldkatalog r49] | K6.1 checkbox activates Annex 10 |

- The source is "Ref. v3.1 (REQ-ID)" [Feldkatalog r1 col L, a hidden column]. That catalogue was not shared.
- **BRM numbering gaps** (possibly deleted or deferred requirements):
  - REQ-CFG-005;
  - REQ-PROC-002, -003, -008, -013, -023, -025…-028, -037, -041, -044, -047, -048;
  - REQ-CTL-004, -005, -007, -008 (REQ-CTL-012, cited by the FLM, lies above the highest BRM number, REQ-CTL-010);
  - REQ-ADR-003 [BRM col C].
- REQ-RMES-001…020 exist only in the PDF [ReqDoc p.13–14].
- **Ask:** "Were the missing requirement numbers deleted on purpose (descoped), or moved elsewhere? Can you share catalogue v3.1?"

### G-06 — Register of open points (OP-xx) · HIGH
- **Referenced in the PDF:** OP-02 [p.8], OP-03 [p.8], OP-13 [p.2], OP-17 [p.7], OP-18 [p.9], OP-19 [p.8, p.10–12].
- **Never shown:** OP-01, OP-04…OP-12 and OP-14…OP-16.
- **Elsewhere:**
  - the BRM legend points to the missing "Open points" sheet [BRM Legend r7];
  - the Feldkatalog has "Offener Punkt, mit Proc klären" (open point, clarify with Proc) [Feldkatalog r8 col O];
  - FLM "[Review]" items exist only in the change log [FLM changelog].
- **Ask:** "Could we get the full open-points list (OP-01 to OP-19+) with its current status? It probably answers several of our questions."

### G-07 — RMES template (Parts A–D) and the CIQ→RMES mapping · HIGH
- **Referenced:**
  - "This chapter translates the RMES template into business requirements" [ReqDoc p.12 §7];
  - Parts A–D [ReqDoc p.13 REQ-RMES-002; p.14 REQ-RMES-020];
  - "the mapping set is agreed with the business and documented" [BRM REQ-PROC-022].
- **Missing:** the template, its criteria, and the field mapping.
- **Ask:** "Can you share the current RMES template and any list of CIQ fields that are copied into RMES today?"

### G-08 — MVP decision record and test scope · HIGH
- **Referenced:**
  - "unless the MVP decision explicitly records a deferral" [ReqDoc p.12 §7];
  - "MVP partial scope … exact scope still has to be defined" [BRM Legend r5];
  - "outside test scope" [FLM r41].
- **Also open:** the KB "In MVP? (Y/N)" column is empty [KB 'Sections' col L]; NEW-05 [KB 'Open Points' r8].
- **Ask:** "Is there a written MVP scope (sections, annexes, subprocesses, roles) that both vendors build against?"

### G-09 — Beiersdorf limit values and reference methods · HIGH
- **Referenced:**
  - Annex 14 values [ReqDoc p.6 K2.2];
  - "binding Beiersdorf limits and a reference method" for PAH [ReqDoc p.8 A9];
  - a "current controlled BDF rule set" [ReqDoc p.13 REQ-RMES-008].
- **Also missing:** microbial limits ("Limits?") [KB 'Sections' r11] and the MOAH unit [FLM changelog r174].
- **Partly available:** 3 heavy-metal limits [Feldkatalog r27–29].
- **Ask:** see C-22.

### G-10 — Specifications for the QM, RMM and Sustainability subprocesses, and Sustainability's separate questionnaire · HIGH
- **Referenced:**
  - QM: "boundary, entry criteria, decision model and ownership are open" [ReqDoc p.5 §3.2.4];
  - RMM: the split with Teamcenter "is still open … does not prescribe a target solution" [ReqDoc p.5 §3.2.5];
  - Sustainability: "documented in a separate questionnaire. Further details and requirements will follow" [ReqDoc p.5 §3.2.6, §3.3.2].
- **Tension:** Sustainability reviews A1, K6.17 and vegetable cases [ReqDoc p.9, p.11], yet records its review outside the tool.
- **Ask:** "For the MVP, do QM, RMM and Sustainability work in the tool with tasks and completion? Can you share the Sustainability questionnaire?"

### G-11 — Process for suppliers who send their own documents · MEDIUM
- **Referenced:** "A separate process will be specified and implemented for these suppliers" [ReqDoc p.4 §3.1.4]; NEW-12 [KB 'Open Points' r19].
- **IKW (reference):** the IKW template exists for cases where a supplier's own documentation is insufficient [IKW p.2].
- **Ask:** "Roughly what share of suppliers send their own documents? Is that process part of this MVP, or should the tool at least let RMM upload a document pack instead of answers?"

### G-12 — Final document package, PDF content and text modules · MEDIUM
- **Referenced:**
  - "The content of the PDF still has to be confirmed by the business" [BRM REQ-PROC-046];
  - the "defined final document package" [ReqDoc p.5 §3.3.3];
  - the "closing document" showing three confirmations [BRM REQ-PROC-015];
  - text modules for supplier confirmations [CIA #5]; [CIA #7, #14].
- **Ask:** "Is there a current layout or example of the final CIQ document and the confirmation texts the supplier signs?"

### G-13 — Catalogue of evidence documents · MEDIUM
- **Referenced:** K1 "statements" [ReqDoc p.6]. The KB marks "Statements (which?)", "Other evidence documents" and "Which certificates?" as missing [KB 'Evidence Documents' r5, r8, r22]. SDS validity or maximum age is not defined [KB 'Evidence Documents' r2].
- **Ask:** "Is there a list of standard evidence documents (statements, certificates) with validity rules, e.g. maximum SDS age?"

### G-14 — Templates the supplier must use · MEDIUM
- **Referenced:**
  - the UK REACH "signed declaration by the supplier" [ReqDoc p.8 A11];
  - "(or BDF template)" for BSE/TSE and entry 419 [FLM changelog r38];
  - the "BDF REACH questionnaire (Annex 10)" [Feldkatalog r45, r49].
- **Ask:** "Can you share the BDF templates that suppliers download and sign (UK REACH declaration, BSE/TSE, REACH questionnaire)?"

### G-15 — Role and authorisation matrix · MEDIUM
- **Referenced:** [BRM REQ-CFG-004, REQ-CTL-002]; Read/Write/Customize per process area [CIA #19]. No matrix is provided, and the Customs/Legal roles are missing (C-12).

### G-16 — Notification, escalation and dashboard definitions · LOW
- **Referenced:**
  - configurable reminders and escalation recipients [ReqDoc p.14 REQ-RMES-019];
  - [BRM REQ-CTL-010, REQ-ADR-001]; NEW-16 [KB 'Open Points' r23];
  - dashboards [ReqDoc p.2 §1.1; BRM REQ-CTL-006; ReqDoc p.14 REQ-RMES-018; CIA #21–23].
- **Missing:** event lists, default due dates and KPIs.

### G-17 — "IRMA" and "RMT" are never defined · MEDIUM
- **Referenced:** IRMA in [ReqDoc p.2 §1.1; p.2 PS-01; p.3 §3.1.1; p.10 §5.2]; "IRMA, RMT" [CIA #1]. RMT appears nowhere else.
- **Ask:** "What do IRMA and RMT stand for? Is RMT a second process that should use the same tool?"

### G-18 — "Existing verified business statements" · LOW
- **Referenced:** "Existing verified business statements remain applicable" [ReqDoc p.2 §2]. The source is unknown.
- **Ask:** "Which document holds the 'existing verified business statements'?"

### G-19 — Volumes, user base, languages and supplier login (BDF's own non-functional requirements) · MEDIUM
- **Missing:** no BDF document states the number of suppliers, cases per year, internal users, languages or how suppliers authenticate (inferred, from all seven files).
- **Related evidence:** BDF asked vendors about scalability [VQ r18], data residency [VQ r20] and hosting [VQ r17] without stating targets. SSO is required for BDF users only [CIA #20].
- **Impact (inferred):** licensing (Kissflow prices per user [VQ r32]), supplier-portal design, performance.
- **Ask:** "Roughly how many CIQ cases per year, how many supplier companies and supplier users, and how many internal reviewers? In which languages must suppliers work?"

### G-20 — How the two MVPs will be evaluated · HIGH (inferred)
- **Referenced:** the 2026 goal is to "Select and validate a suitable low-code/no-code solution; design and build an MVP" [ReqDoc p.2 §1.1].
- **Missing:** no test scenarios, scoring, sample data, test users or timeline appear in any document (inferred).
- **Ask:** "How will you test and compare the two MVPs: scenarios, test users, sample raw materials, scoring criteria and timeline? Can we get the same test data the evaluators will use?"

### G-21 — VQ section numbering skips "2." · LOW
- **Observed:** the areas are numbered 1, 3, 4, 5, 6, 7 [VQ r5–r42]. (inferred) Section 2 may be the functional catalogue (CIA).

---

## 4. Knowledge Baseline items that other documents already answer

The KB's "Customer answer / confirmation" columns are all empty [KB 'Config Questions' col K, 'Config Rules' col J, 'Open Points' col H]. The answers below come from other files. **Answered** = settled by another document. **Partial** = only partly settled. **Conflicting** = another document answers it, but differently from a third source.

| ID | KB item | Answer found elsewhere | Status |
|---|---|---|---|
| K-01 | NEW-02 / BD-xx: Stage-1 metadata fields not listed [KB 'Open Points' r4; 'Config Questions' r20] | FLM "Process Start" + "Meta Data" rows [FLM r2–35]. Creation data [BRM REQ-PROC-001] | Answered, but conflicts with "configuration only" (C-09) |
| K-02 | BD-01: supplier name and ID; pre-filled by RMM? [KB r14] | RMM enters the supplier at creation [BRM REQ-PROC-001]; FLD-GEN-002 in Process Start, Approval RMM [FLM r3]; supplier ID = DUNS, 9 digits [FLM r7] | Answered |
| K-03 | BD-02: manufacturer name and address [KB r15] | FLD-GEN-004, mandatory, name & address [FLM r8] | Answered |
| K-04 | BD-03: trade name [KB r16] | FLD-GEN-001 [FLM r2]; mandatory at creation [BRM REQ-PROC-001] | Answered |
| K-05 | BD-05: INCI name [KB r18] | FLD-2.1-001: INCI, IUPAC if none, plus Colour Index for colorants [FLM r10] | Answered |
| K-06 | BD-06: one or several supplier users? split by topic? [KB r19] | Several contacts in parallel; assignment on the supplier side [BRM REQ-CTL-001]; FLD-GEN-008 mandatory + FLD-GEN-009 optional second e-mail [FLM r4–5]; [CIA #6] | Answered (see C-25) |
| K-07 | SF-02: which fields per site? [KB 'Config Questions' r3] | "Only one production site … FLD-GEN-006/-007 … dropped" [FLM changelog r25] | Answered: SF-02 obsolete. Conflicting with [ReqDoc p.10; CIA #31] (C-14) |
| K-08 | SF-07: derivable from SF-01? [KB r8] | Annex 4 controlled by FLD-2.3-01 = Petrochemical; no SF-07 field [FLM r53–55] | Answered de facto; needs confirmation |
| K-09 | SF-08: only asked when SF-01 = Vegetable? [KB r9] | Asked whenever Annex 1 is active (Bio Mass, Mineral, Petrochemical, Polymer) [FLM r48] | Answered, conflicting with [BRM REQ-PROC-009] (C-20) |
| K-10 | SF-01: single or multi? per component? [KB r2] | Radio (single), per raw material [FLM r16]; still under "[Review]" [FLM changelog r35] | Partial (C-07) |
| K-11 | A1: origin table also lists mineral/petrochemical/polymer — intended? [KB 'Sections' r35; 'Config Rules' r7] | Annex 1 active for those origins [FLM r20, r22, r26, r45, r48] | Answered (FLM confirms §5.4) |
| K-12 | A7 for mineral "look[s] wrong" [KB 'Config Rules' r7] | Mineral → "Annex 1, 7, 10, 11, 12" [FLM r22] | Answered (FLM confirms §5.4); still conflicts with SF-05 (C-06d) |
| K-13 | NEW-07 / A11, A12: origin vs SF-11 [KB 'Open Points' r14; 'Sections' r45–46] | FLM keeps origin-based A10–A12 for five origins [FLM r16, r17, r20, r22, r26]; SF-11 has no field | Partial |
| K-14 | OP-03: what triggers A2? [KB 'Open Points' r10; 'Sections' r36] | "Annex 2 mandatory" = Yes for vegetable only [ReqDoc p.11]; "SF-01 = plant-based -> A2 mandatory" [BRM REQ-PROC-010]; FLM shows A2 for all origins, under review [FLM r37–43; changelog r129] | Partial / conflicting (C-06b) |
| K-15 | OP-02: Annex 4 show/hide [KB 'Open Points' r9] | A4 fields: MOAH; viscosity availability → value + analytical data [FLM r53–55; changelog r177, r182] | Partial |
| K-16 | K2.1: exact value or range? total 100 %? [KB 'Sections' r3] | Range min–max, 0–100 %, min ≤ max [FLM r15; changelog r32–33] | Answered (range); 100 % total still open |
| K-17 | K2.3: who reviews? [KB 'Sections' r5] | RMM (lead), Safety, Sustainability, Regulatory [ReqDoc p.6 §4.1]; Approval RMM [FLM r16–30] | Answered (RMM leads) |
| K-18 | K2.2 / NEW-06: where do the Annex 14 limits live? [KB 'Sections' r4; 'Open Points' r13] | Merged into 2.2 with As/Cd/Cr limits [Feldkatalog r25–29] | Partial (old version, 3 metals) |
| K-19 | K4.1: list of endpoints? [KB 'Sections' r7] | logKow; acute oral; acute dermal; skin irritation; rule "'attached' ticked → upload mandatory" [Feldkatalog r39–44] | Partial (old version) |
| K-20 | K6.1: Q-044…Q-046 status, Annex XIV/XVII, SVHC [KB 'Question Inventory' r46–49] | 4 registration-status options; CAS/details for XIV, XVII, SVHC; A10 activation checkbox [Feldkatalog r45–54] | Partial (old version) |
| K-21 | K1: generated checklist or questions? [KB 'Sections' r2] | "the scope of this list follows from the configuration table and is therefore specific to each case" [ReqDoc p.6] | Partial (derived list; UI still open) |
| K-22 | D-06: pesticide and mycotoxin analysis [KB 'Evidence Documents' r7] | Pesticides Yes → PDF upload, No → reason [FLM r45–47]; no mycotoxin field | Partial (C-21) |
| K-23 | D-08: RSPO certificate with supply chain model [KB r9] | RSPO options MB / SG / IP / none → other certification [FLM r49–51] | Partial (no certificate upload; C-20) |
| K-24 | D-09 / D-10: BSE/TSE and entry 419 — linked section "?" [KB r10–11] | Upload required on Source of origin = Animal, in Meta Data [FLM r17; changelog r37–38] | Answered |
| K-25 | D-11: mineral source specification [KB r12] | FLD-2.3-12 Mineral specification, free text [FLM r23] | Partial |
| K-26 | D-12 / Q-102: MOAH value and unit [KB 'Evidence Documents' r13; 'Question Inventory' r104] | FLD-A4-101 number ≥ 0; "unit not defined in CIQ (assumption: mg/kg or %)" [FLM r53; changelog r174] | Partial (unit open) |
| K-27 | Q-007 / Q-008: CAS mandatory (proposed Yes), EC "?" [KB 'Question Inventory' r9–10] | Both Optional, validated if filled [FLM r11–12; changelog r28–29] | Answered (KB proposal superseded) |
| K-28 | Q-009: function as dropdown? [KB r11] | Free text, e.g. preservative, solvent [FLM r14] | Answered (weakens analysability) |
| K-29 | Q-095 / Q-096: A1 feedstock and geographic origin [KB r97–98] | FLD-A1-102 Feedstock [FLM r32]; FLD-2.3-10 Country of origin, auto-fills A1 [FLM r19] | Answered |
| K-30 | Q-099: A2 questions missing [KB r101] | FLD-A2-101…103: INCI pre-fill; process Chemical / Physical / Enzymatic / Biotech-Fermentation / Other; free text [FLM r37–43] | Partial |
| K-31 | NEW-14: scope change after data entry (hide/archive/delete) [KB 'Open Points' r21] | Re-derivation shows a difference list and notifies departments [BRM REQ-CFG-008]; data retained, visible in history, reactivated on revert [BRM REQ-CFG-009] | Answered |
| K-32 | OP-13: final filing manual in MVP? [KB 'Open Points' r11] | PDF filed on the CIQ project and e-mailed to RMM [BRM REQ-PROC-046]; integrations out of scope 2026 [ReqDoc p.2] | Answered for MVP (CIA expectations differ, C-16) |
| K-33 | NEW-16: due dates and escalation [KB 'Open Points' r23] | Responsible person + internal due date mandatory; notifications configurable [BRM REQ-ADR-001]; configurable reminders and escalation [ReqDoc p.14 REQ-RMES-019] | Partial (mechanism yes, values no) |
| K-34 | NEW-05: MVP scope [KB 'Open Points' r8] | All 51 BRM requirements are "MVP", 3 are "MVP partial scope", none Post-MVP [BRM col H]; A3 "outside test scope" [FLM r41]; REQ-PROC-104 post-MVP [FLM r3] | Partial |
| K-35 | NEW-03 / NEW-04: overall approver; effect of a rejected subprocess [KB 'Open Points' r5–6] | The BRM model has no overall BDF approval and no rejection: it completes automatically after the supplier's release [BRM REQ-PROC-042, -045] | Answered differently → C-01 |
| K-36 | NEW-15: cancellation / reactivation [KB 'Open Points' r22] | Cancellation with justification, ending all tasks incl. supplier's [BRM REQ-PROC-049] | Partial (reactivation open, C-23) |
| K-37 | SF-11: who answers, supplier or BDF? [KB 'Config Questions' r12] | The supplier enters the metadata including the configuration answers [ReqDoc p.2 §2, p.3 §3.1.2]; "generated from the supplier answers" [ReqDoc p.9 §5.1] | Answered (business sense to confirm, BR-19) |
| K-38 | Q-034 / SF-12: waiver justification [KB 'Question Inventory' r36] | Empty or N.A. without justification is rejected, verified with SF-12/K5.1 [BRM REQ-PROC-012] | Answered |
| K-39 | K8: does Legal approve or only read? [KB 'Sections' r33] | "Read only for Legal" [ReqDoc p.8]; "Single section, read only" [ReqDoc p.9] | Partial (wording ambiguous, C-12) |
| K-40 | NEW-12: own-document suppliers in the MVP? [KB 'Open Points' r19] | "A separate process will be specified and implemented" [ReqDoc p.4 §3.1.4] | Partial (implies a separate process) |
| K-41 | R-16…R-18: waste / CCU / recycling rules [KB 'Config Rules' r10–12] | "no annexes" / "No annex required" [FLM r24, r28, r30; changelog r69, r96, r110]; free-text specification fields [FLM r25, r29, r31] | Partial (evidence and reviewers still "To be defined" [ReqDoc p.11–12]) |

**KB items still open everywhere** (no answer in any document): SF-03 vs SF-01 polymer precedence; SF-05 split and "both"; SF-09 derivable from the HS code; SF-11 "Others" list; K6.4 trigger; K6.8 Halal trigger; K8.1 trigger; K5.2 organisms and limits; challenge-test owner; K6.12 supplier-level reuse (OP-17); OP-18 lead rule; A9 limits; A13 inventories per market; combination rules (R-xx); BD-04 BDF material number / IRMA reference.

---

## 5. Undefined business rules that block a long-lived, bug-free build

Each rule below is one the platform cannot "work out later" without data migration or workflow rework (inferred).

| ID | Undefined rule | Evidence | Default (inferred) | Ask | Sev. |
|---|---|---|---|---|---|
| BR-01 | **Which document wins when sources disagree** | The diagram is "authoritative" [ReqDoc p.2 §2] but missing (G-01). "Detailed requirements are maintained … in the CIQ requirements matrix" [ReqDoc p.1 §1]. The FLM is newest [file metadata] and records business alignment [FLM changelog r25]. The KB has no BDF authorship [KB 'Read Me' r21] | Process: diagram > BRM > PDF. Fields: FLM v0.6 > Feldkatalog. KB is input only | "When documents disagree, which one is the master: the PDF, the requirements matrix, or the field matrix?" | CRITICAL |
| BR-02 | **Outcome and rejection semantics:** what a rejected subprocess does to the case; whether a rejected case can be resubmitted; the list of final states | "remains open and must be decided before the approval workflow is configured" [ReqDoc p.5 §3.3.2]; resubmission creates a new review version [ReqDoc p.4 §3.1.5]; no reject in the BRM [BRM REQ-PROC-038…046]; no internal content to the supplier [BRM REQ-PROC-040] | Any rejected mandatory subprocess → case outcome "Rejected" after the overall decision. The supplier gets a neutral message. RMM can open a new review cycle. Final states: Completed-Approved, Completed-Rejected, Cancelled | "If one department rejects, is the whole case rejected? Can the supplier then correct and resubmit within the same case?" | CRITICAL |
| BR-03 | **Rule-engine semantics:** OR/AND, precedence, where "optional" comes from, exclusions, version pinning | Rules must map to SF IDs, support nested conditions and be versioned [BRM REQ-CFG-003]. Mandatory/optional/N.A. per section [BRM REQ-PROC-010; ReqDoc p.10 §5.2], but no rule yields "optional". Combination rules missing [KB 'Config Rules' r30]. Running cases keep their template version [BRM REQ-CFG-001] | Union of activations; explicit "optional" flag per rule row; each case pinned to rule-set and template version | "If two rules apply to one section, does 'mandatory' always win? Which rules make a section optional rather than mandatory?" | CRITICAL |
| BR-04 | **Re-derivation during Part 2:** activating new departments mid-review; reopening completed reviews; sections that fall away | Re-derivation shows a diff and notifies departments [BRM REQ-CFG-008]; metadata changes after PS-05 [BRM REQ-PROC-007]; reopen or no-impact confirmation [ReqDoc p.13 REQ-RMES-012] | In Part 2 a re-derivation is a *proposed* scope change confirmed by RMM. New departments get tasks. Completed reviews reopen only if their sections changed | "If a supplier changes the origin type while departments are reviewing, should the new scope apply immediately, and are already-completed reviews reopened?" | HIGH |
| BR-05 | **Versioning model:** what a "review cycle", "resubmission" and "version" are (answer, document, case); restoring history | Versions fixed "for that review cycle" [ReqDoc p.4 §3.1.5]; "resubmission" is never defined [BRM REQ-CTL-010; ReqDoc p.14 REQ-RMES-019]; "versioning of submitted answers and documents" [ReqDoc p.6 §3.4]; restore historical data [BRM REQ-PROC-016]; one RMES per CIQ version [ReqDoc p.13 REQ-RMES-001, -016] | Version history at field and document level always. Case snapshots at PS-05 and at final release. A new review cycle only through an explicit resubmission | "What exactly is a 'resubmission' — a full new submission of the whole CIQ, or an answer to one query?" | HIGH |
| BR-06 | **Open-point lifecycle:** withdraw or cancel a query; accept a non-delivery; supplier never answers; reassignment | Status set only by the responsible department [BRM REQ-PROC-034]; repeatable loop [BRM REQ-PROC-035]; justified non-delivery [BRM REQ-PROC-032]; "documented reassignment" without a mechanism [BRM REQ-PROC-034] | Add a "withdrawn" status (with reason). Escalate to RMM N days after the due date. Reassignment by the department lead, audited | "What happens if the supplier never answers a query, or says the document doesn't exist and the department disagrees? Can a department withdraw a query?" | HIGH |
| BR-07 | **Justification / N.A. rules per field** | See C-19 [ReqDoc p.4 §3.1.4; BRM REQ-PROC-012; Feldkatalog col J; comment C46] | Per-field setting, default off | See C-19 | HIGH |
| BR-08 | **Lead / co-review, "informed" roles, four-eyes approval, delegation and deputies** | OP-18 [ReqDoc p.9]; "Safety (to be informed)" [ReqDoc p.6 K5.2]; PS-11 "Authorised Beiersdorf role" differs from PS-10 "Responsible Beiersdorf department" [ReqDoc p.3]; "auditable delegation" [BRM REQ-PROC-039; ReqDoc p.14 REQ-RMES-013]; no rule for absence | The lead completes the section after the co-reviewers have completed their part. "Informed" = notification only. Delegation through deputy assignment, audited. Four-eyes off by default | "For shared sections, must both departments complete? Must the person who approves differ from the person who reviewed? How do deputies work during absence?" | HIGH |
| BR-09 | **Visibility rules:** cross-department reads; "publication" of findings; what the supplier sees in dashboards and notifications | Internal content hidden from the supplier [ReqDoc p.3 §3; BRM REQ-CTL-002]; "findings before publication" — publication is never defined [ReqDoc p.14 REQ-RMES-015]; internal comms area [BRM REQ-PROC-020]; N.A. sections documented internally [BRM REQ-PROC-009]; no internal content in notifications [BRM REQ-PROC-040] | The supplier sees its own cases, its own tasks, issued queries and section-level status ("with supplier" / "under review"), never findings or RMES. Findings become visible only as a query | "Is a finding ever shown to the supplier directly ('published'), or only via a query?" | HIGH |
| BR-10 | **Identity of supplier and case; reuse of data** | Supplier name [FLM r3]; DUNS (9 digits) [FLM r7]; manufacturer [FLM r8]; single site [FLM r9]; unique case ID [BRM REQ-PROC-001]; GMP/ISO reuse open [ReqDoc p.7 K6.12, OP-17]; BDF material number only "Proposed" [KB 'Config Questions' r17] | Master tables for Supplier (DUNS), Manufacturer, Site and Material. Case = material × supplier × site, with a duplicate warning. Supplier-level certificates stored once and referenced | "What uniquely identifies a case — material plus supplier plus site? Should GMP/ISO certificates be stored once per supplier and reused?" | HIGH |
| BR-11 | **Supplier user lifecycle:** onboarding, login, supplier administrator, contact changes and leavers | Access for the named contact [BRM REQ-PROC-004]; several contacts [BRM REQ-CTL-001]; supplier roles configurable [CIA #26, #27]; SSO for BDF only [CIA #20]; optional second e-mail [FLM r5] | Invitation-based external accounts with MFA. The supplier coordinator manages colleagues. RMM can replace the contact; open tasks move with it | "How do supplier users get access, and who manages them when a contact leaves the supplier?" | MEDIUM |
| BR-12 | **Supplier final release:** refusal, timeout or corrections at release | Release only after all departments complete [BRM REQ-PROC-042]; no auto-completion without release [BRM REQ-PROC-045]; no rule for refusal or corrections | The release task has a due date and reminders. The supplier can raise a correction, which reopens the affected sections as a new version | "What if the supplier does not give the final release, or wants to correct something at that point?" | MEDIUM |
| BR-13 | **Limit evaluation:** units, comparison, what happens on exceedance, whether the supplier sees limits | [ReqDoc p.6 K2.2, p.8 A9, p.13 REQ-RMES-008; Feldkatalog r27–29] | An exceedance creates an automatic blocking finding for Safety. The supplier must justify the deviation. Limits are hidden from the supplier unless BDF allows | See C-22 | MEDIUM |
| BR-14 | **Document metadata and validity** (title, version, issue date, expiry) | The original title and version of every evaluated document must be listed [ReqDoc p.14 REQ-RMES-017]; a query names "the file name and version" [BRM REQ-PROC-029]; SDS age and ISO certificate expiry are questions [KB 'Evidence Documents' r2; 'Question Inventory' r74]; FLM upload fields carry no metadata [FLM r46, r51, r55] | Each upload captures document type, title, version or issue date, and an optional expiry date | "For each uploaded document, do you need its title, version and expiry date captured — for example to warn when a certificate expires?" | MEDIUM |
| BR-15 | **Requalification and change notification over the years** | The IKW recommends regular reconfirmation (for example every two years) and supplier-initiated updates [IKW p.2] (reference only). No BDF document covers re-qualification (inferred) | Out of MVP scope. The data model supports "copy case into a new review cycle" and expiry reminders later | "Must a CIQ be renewed periodically, or when the supplier changes something? Is that in scope for this tool?" | MEDIUM |
| BR-16 | **Retention, archiving, deletion** | Immutable final package [ReqDoc p.5 §3.3.3]; immutable audit trail [BRM REQ-CTL-009; ReqDoc p.14 REQ-RMES-016]; reactivation period [ReqDoc p.5]; B-Flow out of scope in 2026 [ReqDoc p.2]; Kissflow has no native retention policies [VQ r23]; (inferred) GDPR deletion of supplier-contact data | Keep all case data in the app during 2026. Final PDF immutable. Deletion only through an admin procedure | "How long must case records and documents be kept, and where — in the tool or in B-Flow later?" | MEDIUM |
| BR-17 | **Default due dates, reminders, escalation recipients** | See G-16 | Default 10 working days per supplier task; reminder at -2 and +1 days; escalation to RMM | "What deadlines and reminder rules do you use today for suppliers and for reviewers?" | LOW |
| BR-18 | **Languages** (inferred) | The FLM was translated to English and the German catalogue kept "as historical reference" [FLM changelog r9]. Target markets include UK, Turkey, China and Brazil [ReqDoc p.11 SF-11; p.7 K6.16.1]. No language requirement is stated | English UI for suppliers and internal users. German as an option | "Must the supplier screens be multilingual? Do internal users need German?" | MEDIUM |
| BR-19 | **Controlled value lists and their completeness** | The origin list has no "Other" or microorganism option, while the IKW lists both [IKW p.4]; SF-11 "Others" list is open [KB 'Config Questions' r12]; countries are free text [FLM r19]; function is free text [FLM r14]; MOAH unit is open [FLM changelog r174]; who answers SF-11 (K-37) | Admin-maintained lists (origins, countries, markets, functions, units) | "Which answer lists should be fixed lists (origin, country, market, function), and who maintains them?" | MEDIUM |
| BR-20 | **Boundaries for AI-supported review** | AI output must be reviewable and must not replace the decision [ReqDoc p.5 §3.2.3]; marked, source-referenced, confirm/discard [BRM REQ-PROC-024]; "MVP partial scope" [BRM r29]; (inferred) confidentiality of supplier documents | Optional; an admin toggle; suggestions stored separately and never auto-applied | "Should AI document review appear in the MVP? Are there restrictions on processing supplier documents with AI?" | LOW |
| BR-21 | **Legal weight of supplier confirmations / e-signature** | Supplier Approval "confirms submission and responsibility" [ReqDoc p.4 §3.1.5]; the release confirms correctness [BRM REQ-PROC-042]; UK REACH "signed declaration" [ReqDoc p.8 A11]; open "Digital signature" row [Feldkatalog r15]; text modules for supplier confirmations [CIA #5] | Click-to-confirm with identity, timestamp and a versioned confirmation text. Qualified e-signature out of scope | "Is a click-confirmation with name and timestamp sufficient, or do you need an electronic signature for supplier confirmations?" | MEDIUM |
| BR-22 | **Composition plausibility** | 0–100 %, min ≤ max [FLM r15]; consistency of A1-104 vs 2.1-007 [FLM r35]; "Must total 100%?" [KB 'Sections' r3]; natural origin index 0–1 [FLM r33]; CAS check digit [FLM r11] | A warning (not a block) when concentrations don't add up; a hard block on format errors | "Should the system block submission if component concentrations don't add up to 100 %, or only warn?" | LOW |
| BR-23 | **Governance of template and rule changes in production** | Business admins publish template changes "without an IT ticket"; running cases keep their version [BRM REQ-CFG-001]; versioned rule set [BRM REQ-CFG-003]; RMES criteria versioning [ReqDoc p.13 REQ-RMES-002] | Test → approve → publish flow for template and rule changes, with version notes. Only business admins publish | "Who may change the questionnaire and rules in production, and must a change be tested and approved before publishing?" | MEDIUM |

---

*End of register: 30 cross-document contradictions (C-01…C-30), 14 single-document contradictions (C-31…C-44), 21 gaps (G-01…G-21), 41 KB items answered elsewhere (K-01…K-41), and 23 undefined business rules (BR-01…BR-23).*
