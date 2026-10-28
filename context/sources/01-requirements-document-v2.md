# CIQ Digitalization – Requirements Document (business flow, configuration logic and CIQ structure) – "MVP v2.0"

- **File:** `CIQ Business process requirements MVP_ v2.0.pdf` (in `Refrences_Shared_By_Client/`; lossless text dump in `context/raw/CIQ_Business_process_requirements_MVP__v2.0.md`) · **Type/format:** PDF, 14 pages, text only (0 embedded images on every page). Generated with "Microsoft: Print To PDF" from a Word file whose internal title is `CIQ_Requirements_Document_v1_Two_Phase_Process` [ReqDoc metadata] · **Author/owner, version, date:** Owner is Alexander Pevzner (Technical Product Owner) [ReqDoc p.1 cover]. The PDF author field reads "Pevzner, Alexander ext. /BSS HAM" [ReqDoc metadata]. The cover says Version 2, the running header on every page says "v1.4", and the filename says "v2.0" [ReqDoc p.1]. Dated 16 September 2026; the PDF was created 2026-09-16 09:49 UTC [ReqDoc p.1 cover; metadata]. Status: "Business process (MVP phase)". Document type: "Requirements specification (business level)" [ReqDoc p.1 cover] · **Language:** English.
- **What it is & how to use it:** This is BDF's master business-level description of the target CIQ process. The document calls itself the project's "entry point". Detailed requirements are kept in a separate "CIQ requirements matrix" [ReqDoc p.1 §1], which is very likely the BRM (inferred). Use it as the reference for:
  - the two-part process (PS-01…PS-13);
  - the section catalogue (K1…K8.1, A1…A14) and which department owns each section;
  - the configuration questions SF-01…SF-12 and the origin-type rule illustration;
  - the process for requesting additional documents;
  - the 20 RMES review requirements.

  Most tables are labelled "draft" or "draft, review", and several cells are cut off in the PDF itself. Read it as BDF's current thinking, not as a frozen specification.

---

## Structure

| § | Heading (as in document) | Page(s) | Content type / size |
|---|---|---|---|
| cover | "CIQ Digitalization – Requirements document – business flow, configuration logic and CIQ structure" + Field/Entry table | 1 | 5 rows: Document type, Version, Status, Date, Owner |
| 1 | Purpose and context | 1 | Prose, 6 paragraphs |
| 1.1 | Scope | 2 | Table Aspect / Description, 7 rows |
| 2 | Process overview aligned with the target process flow | 2 | Prose + numbered Part 1 / Part 2 |
| 2.1 | Process-step overview | 2–3 | Table ID / Process step / Responsible role / Trigger / Result – 13 rows PS-01…PS-13 |
| 3 | Detailed process description | 3 | Cross-cutting intro |
| 3.1 (3.1.1–3.1.5) | Part 1 — Collect supplier data and documents | 3–4 | One subsection each for PS-01…PS-05 |
| 3.2 (3.2.1–3.2.6) | Part 2 — Perform technical review and document results | 4–5 | PS-06, common pattern PS-07…PS-11, 4 department subprocesses |
| 3.3 (3.3.2, 3.3.3 — **no 3.3.1**) | Synchronisation, overall decision and closure | 5 | PS-12, PS-13, cancellation/reactivation |
| 3.4 | Overall process requirements | 5–6 | 6 bullets |
| 4 | CIQ structure and assignment to the business departments | 6 | Intro |
| 4.1 | Main chapters (draft, review) | 6–8 | Table ID / Chapter / Business meaning / Department / Particularity – 32 rows |
| 4.2 | Annexes | 8–9 | Table ID / Annex / Business meaning / Triggered by / Department / Particularity – 14 rows |
| 4.3 | Summary by department (draft, review) | 9 | Table Department / Sections owned / Assessment – 7 rows |
| 5 | Configuration table: automatic configuration of the questionnaire | 9 | — |
| 5.1 | Business principle | 9 | Prose + bold "core business rule" |
| 5.2 | How the scope is derived | 9–10 | 6 bullets |
| 5.3 | Identified configuration questions (draft) | 10–11 | Table ID / Configuration question / Source in the CIQ / Effect / Sections triggered – 12 rows SF-01…SF-12 |
| 5.4 | Structure of the configuration table (draft) | 11–12 | Table Origin type (SF-01) / Annex 2 mandatory / RSPO relevant / Mandatory annexes / Additional mandatory evidence / Reviewing department – 9 rows + italic footnote |
| 6 (6.1, 6.2) | Requests for additional documents by the business departments | 12 | Prose + 6 bullets |
| 7 | RMES review requirements (draft) | 12 | Intro |
| 7.1 | Review initiation, data and assignment | 13 | REQ-RMES-001…005 |
| 7.2 | Evaluation, findings and clarifications | 13 | REQ-RMES-006…012 |
| 7.3 | Decisions, output and monitoring | 14 | REQ-RMES-013…020 |

**Formatting observations (from a visual check of all 14 rendered pages):**
- Yellow text highlighting appears only on p.1, on "Raw Material Management (RMM)" and "gives Supplier Approval." No other colour marks appear in the document.
- The document has no table of contents, change history, glossary, open-points list or diagram.

---

## Full content digest

### Cover and §1 Purpose and context [ReqDoc p.1]

- CIQ = Cosmetic Ingredient Questionnaire. BDF uses it to collect all quality, safety and regulatory information on purchased raw materials.
- The 2026 edition has **8 main chapters and 14 annexes**. Today it is exchanged as a document between BDF and the supplier.
- **Current state:** the process is largely manual. RMM (Raw Material Management) is the intermediary between the BDF departments and the supplier. Every question, reminder and document passes through RMM as a single point.
- **Goal:** digitalise the process on a configurable low-code/no-code platform. The CIQ will stop being a static full questionnaire. Its scope will be derived dynamically from what the supplier provides, so suppliers only complete the sections relevant to their raw material.
- **Two-part structure** (the document calls it the organising principle for the process overview, detailed description, "task and status model", review requirements and approval gates):
  - **Part 1:** the supplier enters the requested data, uploads evidence and, when complete, gives **Supplier Approval**. Supplier Approval confirms submission for BDF review. It is **not** a BDF technical or business approval of the raw material.
  - **Part 2:** starts only after Supplier Approval. The responsible BDF departments perform the technical review. Questions, clarifications and additional-document requests go **directly between the responsible department and the supplier**. Results are documented in the internal questionnaire (e.g. RMES). Documenting results in other BDF systems is outside the core process.
- The document describes the process and business requirements and is the "entry point to the project". Detailed requirements are kept separately in the "CIQ requirements matrix".

### §1.1 Scope [ReqDoc p.2]

| Aspect | Description |
|---|---|
| In scope (project goal 2026) | Select and validate a suitable low-code/no-code solution; design and build an MVP for the CIQ process |
| In scope (business) | End-to-end process from case creation to the approved final document, including collaboration with the supplier ("IRMA process") |
| In scope (business) | Automatic configuration of the questionnaire through a business-maintained configuration table |
| In scope (business) | Requests for additional documents during the process, based on a business decision |
| In scope (business) | Task and status transparency for all parties through a dashboard |
| Out of scope (2026) | Integration with Teamcenter, B-Flow, SAP MDG and other relevant systems; scope per target system still open (**OP-13**) |
| Delimitation | The document specifies requirements, not a vendor's solution architecture |

### §2 Process overview [ReqDoc p.2]

- Two consecutive, clearly separated parts. **Supplier Approval is the formal transition gate** from Part 1 to Part 2.
- **Part 1 — Collect supplier data and documents:**
  1. RMM starts the CIQ case.
  2. The supplier enters the required metadata.
  3. The system configures the case-specific CIQ scope.
  4. The supplier completes the configured CIQ, uploads the required documents and gives Supplier Approval.
- **Part 2 — Perform technical review and document results:**
  - The applicable BDF review subprocesses are **activated dynamically and executed in parallel**.
  - Departments review the submission, run Q&A and additional-document loops with the supplier, and document their results.
  - RMES is the internal review record "where RMES applies". Other systems are outside the core process.
- "The process diagram is authoritative for the structure and sequence in this document." Existing verified business statements remain applicable. Undecided items are flagged as open decisions and "are not resolved by assumption" [ReqDoc p.2 §2]. **The diagram is not included** (see Gaps).

### §2.1 Process-step overview — PS-01…PS-13 [ReqDoc p.2–3]

| ID | Process step | Responsible role | Trigger | Result | Part / detailed in |
|---|---|---|---|---|---|
| PS-01 | Start CIQ | RMM | Business decision to initiate an IRMA CIQ case | CIQ case started | Part 1 / §3.1.1 |
| PS-02 | Enter metadata | Supplier | CIQ case made available to the supplier | Required metadata and structural data entered | Part 1 / §3.1.2 |
| PS-03 | Configure CIQ | System, using the configuration rules | Required metadata submitted | Case-specific CIQ scope and required documents determined | Part 1 / §3.1.3 |
| PS-04 | Complete CIQ and upload documents | Supplier | Configured CIQ released to the supplier | Required structured answers and evidence entered | Part 1 / §3.1.4 |
| PS-05 | Supplier Approval and submission to Beiersdorf | Supplier | Configured CIQ data and required supporting documents are complete and formal mandatory checks are passed | Supplier confirms submission; Part 1 completed; submitted version fixed for internal review; Part 2 triggered | Part 1 / §3.1.5 |
| PS-06 | Activate applicable review subprocesses | System | Supplier Approval recorded | Applicable BDF technical-review subprocesses activated dynamically; Part 2 started | Part 2 / §3.2.1 |
| PS-07 | Perform technical review in subprocess | Responsible Beiersdorf department | Review task assigned | Technical findings and preliminary review result documented | Part 2 / §3.2.2 |
| PS-08 | Clarification and additional-document loop, if required | Responsible Beiersdorf department **and supplier** | Reviewer finds an open question, inconsistency or missing document | Supplier response or additional document reviewed; loop repeated until no further query is required | Part 2 / §3.2.2, §6 |
| PS-09 | Document technical-review results | Responsible Beiersdorf department | No further query is required | Review result documented in RMES where applicable; other system-specific documentation is outside the core process | Part 2 / §3.2.2–3.2.6 |
| PS-10 | Decide whether subprocess review is complete | Responsible Beiersdorf department | Review results documented | Subprocess ready for approval or rejection | Part 2 / §3.2.2 |
| PS-11 | Approve or reject subprocess | **Authorised Beiersdorf role** (not further defined) | Subprocess review complete | Final subprocess result recorded | Part 2 / §3.2.2 |
| PS-12 | Overall CIQ approval | **Responsible role to be decided** | Required subprocess results available | Overall approval or rejection recorded | §3.3.2 |
| PS-13 | Generate final documents, file records and provide status feedback | System / responsible role "according to the final operating model" | Overall CIQ decision recorded | Final package generated and filed; status reported; case closed | §3.3.3 |

### §3 Detailed process description — cross-cutting rules [ReqDoc p.3]

- Tasks, status transparency, notifications and the dashboard apply throughout the process.
- Every action a person has to perform is an **assigned task**, visible to the authorised role.
- Internal review comments and assessments are **not visible to supplier users**.

### §3.1 Part 1 — Collect supplier data and documents

| § | Step | Stated content |
|---|---|---|
| 3.1.1 [p.3] | Start CIQ (PS-01) | RMM decides to initiate an IRMA CIQ case. The trigger is **currently outside the target system**. |
| 3.1.2 [p.3] | Enter metadata (PS-02) | The supplier first enters the required metadata and structural data for the raw material, including the configuration answers. This phase is **deliberately limited** to configuration-relevant information. **Missing mandatory entries block submission** of the metadata. |
| 3.1.3 [p.4] | Configure CIQ (PS-03) | The system evaluates the submitted metadata against the controlled configuration rules. It classifies each CIQ chapter, annex and evidence document as **mandatory, optional or not applicable** for the case. The logic is in chapter 5. The supplier is not expected to complete non-applicable sections. |
| 3.1.4 [p.4] | Complete CIQ and upload documents (PS-04) | The supplier completes the released sections and uploads evidence **at the relevant question or section**. Answers are captured as **structured data, not solely as attachments**. Mandatory fields and mandatory evidence are validated. Where the controlled rule requires a **justification for a not-applicable response**, submission is blocked until it is given. **Some suppliers upload their own documents instead of filling in the CIQ. A separate process "will be specified and implemented" for them.** |
| 3.1.5 [p.4] | Submit CIQ to Beiersdorf (PS-05) | Supplier Approval is the supplier's formal confirmation of submission and of responsibility for the information. It completes Part 1 and triggers Part 2. It is not a BDF technical review result or raw-material approval. **On Supplier Approval, the submitted data and document versions are fixed for that review cycle.** A later resubmission creates a **new review version** and does not silently overwrite the version already assessed. |

### §3.2 Part 2 — Perform technical review and document results

**3.2.1 Activate applicable review subprocesses (PS-06) [p.4]**
- After Supplier Approval, the system activates the BDF review subprocesses that apply to the case.
- Activation is **dynamic**, based on the case scope and "controlled assignment rules".
- Activated subprocesses may run **in parallel**.
- The **synchronisation point waits only for the subprocesses activated for that case**.

**3.2.2 Common pattern for every activated review subprocess (PS-07 to PS-11) [p.4]**
- Each responsible department reviews the data and evidence assigned to its subprocess and documents the result.
- When an item is missing, inconsistent or implausible, the reviewer raises a **contextual query** or **requests an additional document**. The supplier answers or uploads, and the department reviews again. The loop repeats until the department decides no further query is needed.
- Queries and requests **stay linked to the affected question, document, criterion or finding**. The supplier receives **each request as a task**.
- The **requesting department keeps responsibility** while waiting for the supplier and decides whether to accept or reject the response.
- **Open blocking requests prevent completion of the affected subprocess.**
- When no further query is needed, the department documents its results, confirms whether the review is complete, and **records approval or rejection through an authorised BDF role**. Person, timestamp, result and required rationale are **audit-trailed**.

**3.2.3 RMES / Regulatory & Safety subprocess [p.4–5]**
- Safety and Regulatory each perform their own technical review in the BDF review phase. They use structured CIQ data and also review supporting documents from the supplier.
- **RMES = Raw Material Evaluation Sheet.** It is the internal document in which Safety and Regulatory record scope, evidence, findings, conclusions and decisions. It is **not a separate review process and not a supplier questionnaire**. It is a structured internal documentation instrument and is **not visible to the supplier**.
- The RMES part will also be digitalised. The target is to **reuse relevant CIQ data directly in RMES** and to automate manual CIQ→RMES transfers "as far as technically and functionally feasible", while keeping source traceability, versioning and reviewer accountability.
- **AI-supported document review is a desired capability.** It would help Safety and Regulatory analyse supplier evidence and spot relevant information, inconsistencies or missing content. AI output must remain reviewable and **must not replace** the accountable assessment and decision of the authorised BDF reviewer.
- Results may also be documented in other BDF systems. That is outside the core CIQ process.

**3.2.4 QM subprocess [p.5]**
- QM reviews the sections assigned to it under the "approved responsibility model".
- Subprocess boundary, entry criteria, decision model and ownership are **open** and need business confirmation.

**3.2.5 RMM subprocess [p.5]**
- Today RMM documents technical-review results in **Teamcenter**.
- The target process and the system split between the digital CIQ solution and Teamcenter are **still open** and must be developed jointly. No target solution is prescribed.

**3.2.6 Sustainability subprocess [p.5]**
- Sustainability reviews its assigned sections. Its findings are documented in a **separate questionnaire**.
- "Further details and requirements will follow here."

*(No subprocess is described for Customs/Trade Compliance (K7), Legal/IP (K8/K8.1) or Microbiology as a separate unit. See Gaps RD-25.)*

### §3.3 Synchronisation, overall decision and closure [ReqDoc p.5]

- **3.3.2 Overall CIQ approval (PS-12):**
  - The final approval gate must use the **final subprocess results and all blocking open items**.
  - The **effect of a rejected subprocess on the overall CIQ case is open** and must be decided before the approval workflow is configured.
  - The section repeats that Sustainability documents its review steps and results in a separate questionnaire.
- **3.3.3 Final document, filing, status feedback and end (PS-13):**
  - After the overall decision, the system generates the defined **final document package** and versions it in **unchangeable form**.
  - It files the package against the case in the designated BDF repository (**B-Flow**) and sends the required **status feedback to "the preceding system"**.
  - The exact target systems and integration scope depend on the open integration decisions.
  - The case is then closed in the dashboards with its final status.
- **Cancellation / reactivation:** a process can be **cancelled** if the raw material is no longer relevant "for the project". A cancelled process can be **reactivated within a defined period** ("assumption: 1 year, to be confirmed").

### §3.4 Overall process requirements (all phases and subprocesses) [ReqDoc p.5–6]

1. Role-based access and separation of supplier and internal content.
2. Named task ownership, due dates, reminders and escalation.
3. Section-level and overall status transparency.
4. Versioning of submitted answers and documents.
5. Traceability from review result to source answer or document version.
6. Audit trail for submission, review, query, response, approval, rejection and reopening.

### §4 CIQ structure and department assignment [ReqDoc p.6]

The overview records all chapters and annexes of CIQ 2026 with business meaning and responsible department. It is "the basis for the review and approval logic and for the assignment of tasks and dashboard items".

#### §4.1 Main chapters (draft, review) — K1…K8.1 [ReqDoc p.6–8]

Cell text is reproduced as in the PDF. **[TRUNCATED]** marks cells that are cut off **in the PDF itself** (visually verified, not an extraction error).

| ID | Chapter | Business meaning | Department(s) | Particularity | Page |
|---|---|---|---|---|---|
| K1 | Mandatory documents | Checklist of all required evidence documents (SDS, CoA, specification, statements) | QM (lead), Regulatory, RMM, Safety | Frames all other chapters; the list's scope follows from the configuration table and is therefore case-specific | p.6 |
| K2.1 | Components and additives | Full composition per component: INCI, CAS, EC, function, additive, origin, concentration | Regulatory | Data basis for almost all later reviews; table with **any number of components** | p.6 |
| K2.2 | Byproducts and contaminations | Byproducts and contaminations, evidence from **at least two batches** | Safety (lead), QM | Limits checked against the **Beiersdorf values in Annex 14**; deviations require a justification | p.6 |
| K2.3 | Source or type of starting materials | Origin type **per component** | RMM (lead), Safety, Sustainability, Regulatory | Central configuration question **SF-01**; drives most mandatory annexes | p.6 |
| K3 | Storage conditions and handling | Storage conditions, shelf life, temperature effects | QM | Operationally relevant for goods receipt, warehousing and handling in production | p.6 |
| K4.1 | Toxicity data | Toxicological endpoints with study protocol and annex status | Safety | Assessment authority sits **exclusively with Safety** | p.6 |
| K4.2 | Environmental | "Biodegradability," **[TRUNCATED]** | "Safety, Regulatory" with a stray second line "Environmental" | *(empty)* | p.6 |
| K4.3 | Synthetic polymer microparticles | REACH polymer definition and SPM restriction scope | Safety (lead), Regulatory | Regulatory area subject to change; Annex 6 goes into more detail | p.6 |
| K5.1 | Microbiological test | Microbiological test of the raw material | Microbiology | **May be waived, but a justification is required** | p.6 |
| K5.2 | Total microbial count | Total aerobic count, yeast and moulds, specific microorganisms | Microbiology, Safety (to be informed) | **Mandatory in the CIQ**; the **challenge test** sits between 5.2 and 5.3 **without its own chapter number** | p.6 |
| K5.3 | Antimicrobial treatment | Type and maximum dose of the antimicrobial treatment | Safety | Irradiation, heat and ethylene oxide treatment | p.7 |
| K6.1 | EU REACH | Registration status, Annex XIV and XVII, SVHC | Regulatory | Detailed in Annex 10 | p.7 |
| K6.2 | UK REACH | Registration status UK including only representative | Regulatory | Detailed in Annex 11; also relevant for indirect imports | p.7 |
| K6.3 | Turkey REACH (KKDIK) | Registration status Turkey | Regulatory | Detailed in Annex 12 | p.7 |
| K6.4 | Chemical inventory listings | Listing in national chemical inventories | Regulatory | Detailed in Annex 13 | p.7 |
| K6.5 | Regulation 1223/2009 Annexes III–VI | Cosmetics regulation annexes | Regulatory, Safety | Core provision for cosmetic usability | p.7 |
| K6.6 | Ingredients Art. 19(g) / Annex III | Ingredients relevant for labelling | Regulatory, Safety | Basis for later product labelling | p.7 |
| K6.7 | Animal testing (Art. 11(2)(e)) | Animal testing status | Regulatory | Evidence required; high reputational relevance and legal requirement (cell reads "relevance.and legal requirement") | p.7 |
| K6.8 | Halal status | Halal and kosher information | Regulatory | Market-specific (no trigger given) | p.7 |
| K6.9 | Nanomaterials | Nanomaterial status including justification and evidence | Safety (lead), Regulatory | **A negative answer also requires a justification** | p.7 |
| K6.10 | Listing in pharmacopeia | Pharmacopeia monograph | QM | Workshop note: QA | p.7 |
| K6.11 | Listing as food additive | Food grade status | Safety | Workshop note: Safety | p.7 |
| K6.12 | GMP compliance and ISO certification | GMP standards and ISO certificates of the manufacturer | QM | Related to the **supplier, not the raw material**; reuse across cases to be examined (**OP-17**) | p.7 |
| K6.13 | China IECIC / NMPA | Listing in the China inventory, NMPA code | Regulatory | Workshop note: Regulatory | p.7 |
| K6.14 | California Proposition 65 | Prop 65 listing including contaminations | Regulatory and Safety jointly | Workshop note: Regulatory / Safety – shared responsibility | p.7 |
| K6.15 | Canada Hot List | Listing on the Canada Hot List | Regulatory | Workshop note: Regulatory | p.7 |
| K6.16 | Biodiversity laws | Access and benefit sharing under national biodiversity law | Regulatory | Framing chapter; the case distinctions sit in 6.16.1 | p.7 |
| K6.16.1 | Brazilian Biodiversity Law | SisGen registration and exemptions | Regulatory | Extensive case distinctions with several exemptions; trigger **SF-10** | p.7 |
| K6.17 | EUDR | "Scope and" **[TRUNCATED]** | Regulatory and Sustainability (lead) | *(empty)* | p.8 |
| K7 | Customs & foreign trade | HS code, country of origin, export control, CITES | Customs / Trade Compliance | Described as "the only section owned outside Regulatory, Safety, QM and Sustainability" | p.8 |
| K8 (row labelled "K8, K8.1") | Patent | Patents and licence | Legal / IP | "Read only for Legal" | p.8 |
| K8.1 | Additional patent information | Supplementary patent and licence details | Legal / IP | Follow-up chapter to 8; same owner | p.8 |

32 rows, 32 distinct section IDs. K8 appears only in the combined "K8, K8.1" row, and K8.1 has its own row as well.

#### §4.2 Annexes — A1…A14 [ReqDoc p.8–9]

| ID | Annex | Business meaning | Triggered by | Department(s) | Particularity | Page |
|---|---|---|---|---|---|---|
| A1 | Vegetable origin | "Feedstock, origin," **[TRUNCATED]** | Vegetable origin | Safety and Sustainability | "d traceability." **[fragment]** (probably the remnant of "…origin and traceability" – inferred) | p.8 |
| A2 | Manufacturing | "Manufacturing process," **[TRUNCATED]** | "Vegetable origin and is not stated in the CIQ (OP-19)" (grammatically broken) | Regulatory, Safety (lead) | "(OP-03)." **[fragment]** | p.8 |
| A3 | GMO | Genetically modified organisms, safety level, separation | Fermentation or GMO (SF-06) | QM / Microbiology | Workshop notes: QM (micro), evidence | p.8 |
| A4 | Hydrocarbons | MOAH, physico-chemical data for mineral oils and waxes | Mineral-oil-based (SF-07) | Safety | Workshop notes: MVP, show and hide separately, either/or/both (**OP-02**) | p.8 |
| A5 | UV filters | Approval status inside and outside the EU | UV filter (SF-04) | Regulatory | Workshop note: "dependency?" | p.8 |
| A6 | Synthetic polymers / biopolymers | Cross-linkers, monomers, molecular weight, residual monomer content | Polymer (SF-03) | Safety, Regulatory | Direct extension of chapter 4.3 | p.8 |
| A7 | Colorants | Colorant-specific information | Colorant (SF-05) | Regulatory | Substance-class specific | p.8 |
| A8 | Preservatives | Preservative-specific information | Preservative (SF-05) | Regulatory, Safety | Substance-class specific | p.8 |
| A9 | Polyaromatic hydrocarbons (PAH) | Limits and analysis for PAH | Vegetable or petrochemical origin (SF-01, SF-07) | Safety | Contains **binding Beiersdorf limits and a reference method** | p.8 |
| A10 | EU REACH | Substance-related REACH registration data | **Always** | Regulatory | **Per substance, not per raw material** | p.8 |
| A11 | UK REACH | Substance-related UK REACH data including only representative | UK market (SF-11) | Regulatory | Contains a **signed declaration by the supplier** | p.8 |
| A12 | Turkey REACH | Substance-related KKDIK data | Turkey market (SF-11) | Regulatory | Same structure as Annexes 10 and 11 | p.9 |
| A13 | Chemical inventories | Listing status per country and inventory (Y/N/E) | Target markets (SF-11) | Regulatory | Workshop notes: Regulatory, "dependency?" | p.9 |
| A14 | Moved into the main document | – | – | – | Content is covered by chapter K2 | p.9 |

#### §4.3 Summary by department (draft, review) [ReqDoc p.9]

| Department | Sections owned | Assessment (as stated) |
|---|---|---|
| Regulatory | K2.1, K2.3, K6.1–K6.8, K6.13, K6.15, K6.16, K6.16.1, A2, A5, A7, A8, A10, A11, A12, A13 | Largest review scope; leads on composition, registration and market authorisation |
| Safety | K2.2, K4.1, K4.2, K4.3, K6.9, K6.11, A4, A6, A9 | Sole assessment authority for toxicology, environment and limits |
| QM / Microbiology | K1, K3, K5.1, K5.2, K5.3, K6.10, K6.12, A3 | Leads on quality, hygiene, storage and manufacturer certification |
| Sustainability | K6.17, A1 | Small in volume but high external impact (EUDR, RSPO) |
| Customs / Trade Compliance | K7 | Single section; easily overlooked today |
| Legal / IP | K8, K8.1 | "Single section, read only" |
| Shared responsibility | K6.14 (Regulatory and Safety), K6.17 (Regulatory and Sustainability), K2.2 (Safety and QM) | Needs a rule on whether both roles approve or one takes the lead (**OP-18**) |

Counts (inferred, by counting): Regulatory 22 sections, Safety 9, QM/Microbiology 8, Sustainability 2, Customs 1, Legal 2. K6.14 appears only in the Shared row. Together they cover all 32 K-IDs and A1–A13, so every section has at least one owner in §4.3.

**Ownership reconciliation, §4.1/§4.2 vs §4.3 (inferred analysis; only multi-department or conflicting rows):**

| Section | Departments named in §4.1/§4.2 | Placement in §4.3 | Observation |
|---|---|---|---|
| K1 | QM (lead), Regulatory, RMM, Safety | QM/Microbiology | Co-reviewers dropped. RMM has no row in §4.3 at all. |
| K2.2 | Safety (lead), QM | Safety + Shared | Consistent |
| **K2.3** | **RMM (lead)**, Safety, Sustainability, Regulatory | **Regulatory** | **Lead conflict (RMM vs Regulatory)** |
| K4.2 | Safety, Regulatory (+ stray "Environmental") | Safety | Regulatory dropped |
| K4.3 | Safety (lead), Regulatory | Safety | Co-reviewer dropped |
| K5.2 | Microbiology, Safety (to be informed) | QM/Microbiology | "To be informed" role not modelled |
| **K5.3** | **Safety** | **QM/Microbiology** | **Owner conflict** |
| K6.5, K6.6 | Regulatory, Safety | Regulatory | Safety dropped |
| K6.9 | Safety (lead), Regulatory | Safety | Co-reviewer dropped |
| K6.10 | QM (workshop note "QA") | QM/Microbiology | QA vs QM naming |
| K6.14 | Regulatory and Safety jointly | Shared only | Consistent |
| K6.17 | Regulatory and Sustainability (lead) | Sustainability + Shared | Consistent |
| A1 | Safety and Sustainability | Sustainability | Safety dropped |
| **A2** | Regulatory, **Safety (lead)** | **Regulatory** | **Lead conflict** |
| A6 | Safety, Regulatory | Safety | Co-reviewer dropped |
| A8 | Regulatory, Safety | Regulatory | Co-reviewer dropped |

### §5 Configuration table: automatic configuration of the questionnaire

#### §5.1 Business principle [ReqDoc p.9]
- The CIQ has no fixed structure. Which chapters and annexes a supplier must complete follows from a few basic answers given at the start, above all the **origin type of the components**. A vegetable material triggers different mandatory annexes than a mineral-oil-based material or a polymer.
- The target system should take over this decision, **rule-based and traceable**.
- **Core business rule (bold in source):** the questionnaire is **not selected, it is generated** from the supplier's answers (metadata). The configuration table is the rule set behind this generation.

#### §5.2 How the scope is derived (stated sequence) [ReqDoc p.9–10]
1. The supplier first receives **only the basic data section with the configuration questions**.
2. Once it is submitted, the system evaluates the answers against the configuration table.
3. The system determines the **mandatory sections, optional sections, not-applicable sections and required evidence documents**.
4. **"The department" sees the derived scope and can extend or reduce it** "during the IRMA process where necessary". The document does not say which department.
5. **Only then** is the full questionnaire released to the supplier.
6. If the supplier later changes a configuration answer, the **scope is derived again**. Data already entered is "handled according to the rules" and is **not discarded silently**.

#### §5.3 Identified configuration questions (draft) — SF-01…SF-12 [ReqDoc p.10–11]

These questions were derived from "the CIQ source document". The list is a draft and must be completed and confirmed by the business departments (**OP-19**).

| ID | Configuration question | Source in the CIQ | Effect | Sections triggered |
|---|---|---|---|---|
| SF-01 | Origin type of the components (vegetable, animal, mineral, petrochemical, waste or side stream, CCU, polymer, chemical recycling) | Chapter 2.3 | Determines the majority of the mandatory annexes | A1, A2, A3, A4, A6, A7, A9, A10, A11, A12 and BSE/TSE evidence; **no annexes** for waste/side stream, CCU and chemical recycling |
| SF-02 | Are there additional production sites? | Basic data | Additional site information | Site data, no annex |
| SF-03 | Does the raw material contain polymer components or meet the REACH polymer definition? | Chapter 4.3 | Activates polymer and SPM review | K4.3, A6 |
| SF-04 | Is the material a UV filter? | Chapter 6.5 (Annex VI) | Activates the UV filter section | A5 |
| SF-05 | Is the material a colorant or a preservative? | Chapter 6.5 (Annex IV and V) | Activates substance-class annexes | A7, A8 |
| SF-06 | Is fermentation involved or are GMOs involved? | Annex 2 | Activates the GMO section | A3 |
| SF-07 | Is the material mineral-oil-based or a hydrocarbon? | Chapter 2.3 | Activates MOAH and PAH review | A4, A9 |
| SF-08 | Is the feedstock palm-based? | Annex 1 | Activates mandatory RSPO information | A1 section 5, RSPO evidence |
| SF-09 | Does the raw material fall within the scope of the EUDR? | Chapter 6.17 | Activates EUDR traceability | K6.17 |
| SF-10 | Is Brazilian genetic heritage affected? | Chapter 6.16 | Activates SisGen information | K6.16.1 |
| SF-11 | Target markets of the raw material (China, USA, Canada, UK, Turkey and others) | Basic data | Activates market-specific compliance sections | K6.2, K6.3, K6.13, K6.14, K6.15, A11, A12, A13 |
| SF-12 | Is microbiological testing required? | Chapter 5.1 | **Deactivates** the microbiological test (5.1) and the challenge test **with a justification**; total microbial count (5.2) **stays mandatory** | K5.1, K5.3 |

#### §5.4 Structure of the configuration table (draft) — origin-type illustration [ReqDoc p.11–12]

- The configuration table "maps every valid combination of answers to the resulting scope".
- The example uses origin type only. It is "a structural illustration, not a complete or business-approved rule set".
- Footnote (italic, p.12): the illustration is based on the CIQ source document, and the **binding configuration table still has to be collected with the business departments**.
- Visual check: all rows are cleanly aligned in the PDF.

| Origin type (SF-01) | Annex 2 mandatory | RSPO relevant | Mandatory annexes | Additional mandatory evidence | Reviewing department |
|---|---|---|---|---|---|
| Vegetable | Yes | No | A1, A2, A3, A9, A10, A11, A12 | Pesticide and mycotoxin analysis, sustainability certificates | Sustainability, Regulatory |
| Vegetable and palm-based | Yes | **Yes** | **Additionally** A1 section 5 | RSPO certificate with supply chain model, RSPO number on the CoA | Sustainability |
| Animal | No | No | A10, A11, A12 | BSE/TSE certificate, conformity with Annex II entry 419 | Regulatory, QM |
| Mineral | No | No | A1, A7, A10, A11, A12 | Origin and specification of the mineral source | Regulatory, Safety |
| Petrochemical | No | No | A1, A4, A9, A10, A11, A12 | MOAH value, PAH analysis against Beiersdorf limits | Safety |
| Polymer | No | No | A1, A6, A10, A11, A12 | Residual monomer content, SPM scope statement | Safety, Regulatory |
| Waste / side stream | No | No | None derived from the origin type | To be defined with the business departments (OP-19) | To be defined (OP-19) |
| Carbon capture utilisation (CCU) | No | No | None derived from the origin type | To be defined with the business departments (OP-19) | To be defined (OP-19) |
| Chemical recycling of post-consumer plastic | No | No | None derived from the origin type | To be defined with the business departments (OP-19) | To be defined (OP-19) |

### §6 Requests for additional documents by the business departments [ReqDoc p.12]

**6.1 Business principle**
- Even with a correctly derived scope, a department may need more documents or information during review. Examples given: a further batch analysis, an updated certificate, a supplementary justification.
- Such a request is **not a gap in the rule set but a deliberate business decision in an individual case**.
- **Delimitation:** the configuration table governs the **predictable** scope derived from answers. A request covers the **unpredictable individual case**. The system must keep the two **clearly distinguishable**.

**6.2 Process (stated steps)**

| # | Actor | Stated rule |
|---|---|---|
| 1 | Authorised department | Raises a request within the running case and **assigns it to the section that triggered it**. A request **may also activate an additional questionnaire section** for the supplier to complete. |
| 2 | Requesting department | Every request **must contain a business justification, a responsible person and a due date**. |
| 3 | Supplier | Receives the request as a **separate task** with a clear reference to the place concerned, **visible in the supplier dashboard**. |
| 4 | Supplier | **Provides the document or explains why it cannot be provided.** |
| 5 | Department | **Accepts or rejects** the response; the decision is recorded. On rejection, the department gives a **short explanation**. |
| 6 | System | **Open requests prevent overall approval** and are shown as **blocking in the case dashboard**. |

### §7 RMES review requirements (draft) [ReqDoc p.12–14]

**Intro [p.12]:**
- The chapter turns the **RMES template** into business requirements for Part 2.
- RMES documents the internal Safety and Regulatory assessment results, based on the supplier data and documents collected and confirmed through Supplier Approval. It is not a supplier questionnaire.
- **All requirements below are "Must" for an end-to-end Safety and Regulatory review unless the MVP decision explicitly records a deferral.** No deferral is recorded anywhere in the shared files.
- Documentation in other BDF systems is out of scope for these requirements.

| ID | Title | Requirement (condensed) | Acceptance criterion (condensed) | § / page |
|---|---|---|---|---|
| REQ-RMES-001 | Controlled start | Create **one** RMES review for the submitted CIQ version, only after the formal entry criteria are met. | If mandatory evidence is missing, no RMES review is released when submission is attempted. On a complete submission, the review is created with the **CIQ version and timestamp**. | 7.1 / p.13 |
| REQ-RMES-002 | Structured template | Represent **RMES Parts A, B, C and D** as configurable, structured review criteria, not solely as an attached document. | An authorised **business administrator** can add, deactivate, reorder and **version** a criterion **without changing historical evaluations**. | 7.1 / p.13 |
| REQ-RMES-003 | Role-based assignment | Safety criteria and approval go to authorised Safety reviewers; Regulatory criteria and approval go to authorised Regulatory reviewers. | A Regulatory reviewer **cannot issue the Safety approval**. A supplier **cannot view or edit any RMES criterion**. | 7.1 / p.13 |
| REQ-RMES-004 | Applicable scope | Derive applicable RMES criteria from raw-material characteristics, supplied composition, target markets and configuration rules. An authorised reviewer may **override applicability with a mandatory reason**. | Non-applicable criteria **remain visible in the internal record**, with the rule or override reason. | 7.1 / p.13 |
| REQ-RMES-005 | Source traceability | Every assessment references the evaluated document or structured answer **and its version**. | From a criterion, the reviewer can open the assessed source. From a source, the system can identify the related criteria and findings (bidirectional). | 7.1 / p.13 |
| REQ-RMES-006 | Criterion result | For every applicable criterion, capture availability, plausibility or listed status as appropriate, plus reviewer comment, reviewer and timestamp. | **Department approval is blocked** while any applicable criterion has no final result. | 7.2 / p.13 |
| REQ-RMES-007 | Mandatory rationale | A comment is required for any **negative, implausible or not-applicable** result and for every **manual applicability override**. | Saving or completing such a result without a rationale is rejected with a clear validation message. | 7.2 / p.13 |
| REQ-RMES-008 | Quantitative checks | Where the current controlled **BDF rule set** defines substance or impurity limits, capture the reported value, unit, applicable limit and evaluation result. | The limit and **rule-set version** used for the decision **stay reproducible after the rule set changes**. | 7.2 / p.13 |
| REQ-RMES-009 | Finding management | Create findings linked to the criterion, source and responsible department, classified at least as **blocking or non-blocking**. | A **blocking finding prevents** the department approval **and** the overall approval. | 7.2 / p.13 |
| REQ-RMES-010 | Supplier query from finding | An authorised reviewer can create a supplier query or additional-document request **directly from a finding** without re-entering context. | The request contains the affected criterion, question/document reference, **responsible supplier contact**, due date and **complete conversation history**. | 7.2 / p.13 |
| REQ-RMES-011 | Response review | **Only the department responsible for a finding** may accept or reject the supplier response, unless **formally reassigned**. | Closure records the decision, decision-maker, timestamp and **accepted evidence version**. Rejection **returns the item to the supplier with a reason**. | 7.2 / p.13 |
| REQ-RMES-012 | Reopening logic | A supplier change to data or evidence used by a completed criterion must **flag the criterion as impacted** and either **reopen** the related review or require an explicit **no-impact confirmation**. | Previously approved results are **never silently retained** after their source version changes. | 7.2 / p.13 |
| REQ-RMES-013 | Separate department approvals | Provide independent **Final Safety approval** and **Final Regulatory approval**, each with Approved/Rejected, decision-maker, timestamp and **mandatory rejection reason**. | Neither role can approve on behalf of the other **without an auditable delegation**. | 7.3 / p.14 |
| REQ-RMES-014 | Approval gate | **Overall case approval** is possible only when **both required RMES approvals are Approved** and **no blocking finding or supplier request remains open**. | When approval is attempted, the system **identifies every blocking item**. | 7.3 / p.14 |
| REQ-RMES-015 | Internal confidentiality | RMES criteria, internal comments, **findings before publication** and approval rationales are hidden from supplier users. | Supplier-role testing confirms that **only explicitly issued questions, requests and permitted attachments** are accessible. | 7.3 / p.14 |
| REQ-RMES-016 | Versioned evaluation record | Keep every RMES version, criterion result, source reference, finding, query, response and decision in an **immutable audit trail**. | An auditor can reconstruct **who assessed what, against which source and rule-set version, and when**. | 7.3 / p.14 |
| REQ-RMES-017 | Reference register | The final internal record lists the **original title and version** of every evaluated source document, and may also store the **technical storage title**. | A title mismatch does not break traceability; **both values stay searchable**. | 7.3 / p.14 |
| REQ-RMES-018 | Dashboard transparency | Dashboards show RMES progress **separately for Safety and Regulatory**, with the states **unassigned, open, waiting for supplier, overdue, reopened, approved, rejected**. | **RMM** can identify the department, criterion and blocking reason **without opening each task**. | 7.3 / p.14 |
| REQ-RMES-019 | Notifications and escalation | Notify the assigned reviewer when an RMES task or resubmission arrives. Notify the responsible supplier contact when a query is issued. Due-date reminders and escalation recipients must be **configurable**. | Each notification event is **logged against the case**. | 7.3 / p.14 |
| REQ-RMES-020 | Export and filing | After completion, generate a **readable, versioned internal RMES evaluation record** and make it available for filing with the case. | The export contains **Parts A–D, applicability decisions, results, comments, references, findings and approvals**, while respecting the supplier/internal visibility split. | 7.3 / p.14 |

### Consolidated views (compiled from the sections above; all items are stated in the document)

**A. Actors / user base named in the document**

| Actor | Where named | Stated responsibilities / rights |
|---|---|---|
| RMM (Raw Material Management) | p.1 §1; PS-01; §3.2.5; K1; K2.3; REQ-RMES-018 | Today: single intermediary for all supplier communication. Target: starts the case (PS-01); has its own RMM subprocess (documents in Teamcenter today); co-department on K1; lead on K2.3; monitors the RMES dashboard |
| Supplier / "supplier users" / "responsible supplier contact" | PS-02, PS-04, PS-05, PS-08; §3; §6.2; REQ-RMES-010, -015, -019 | Enters metadata and the CIQ, uploads evidence, gives Supplier Approval, answers queries and requests as tasks (supplier dashboard). Must not see internal content |
| System | PS-03, PS-06, PS-13 | Configures the scope, activates subprocesses, generates and files the final package |
| Responsible BDF departments: Regulatory, Safety, QM, Microbiology ("QM / Microbiology"), Sustainability, Customs / Trade Compliance, Legal / IP (+ "QA" in a workshop note) | §4; PS-07…PS-10 | Review assigned sections, raise queries/requests, document results, decide on completeness |
| "Authorised Beiersdorf role" | PS-11; §3.2.2 | Approves or rejects a subprocess (identity not defined) |
| Overall approver | PS-12 | "Responsible role to be decided" |
| Final-step role | PS-13 | "System / responsible role according to the final operating model" |
| "The department" (scope check) | §5.2 | Sees the derived scope and extends or reduces it before the full questionnaire is released |
| Authorised business administrator | REQ-RMES-002 | Maintains RMES criteria (add, deactivate, reorder, version) |
| Authorised Safety / Regulatory reviewers | REQ-RMES-003, -004, -010, -011 | Criteria, overrides, findings, queries, response decisions, final approvals |
| Auditor | REQ-RMES-016 | Reconstructs the assessment history |
| Escalation recipients | REQ-RMES-019 | Configurable |
| Document owner | Cover | Alexander Pevzner, Technical Product Owner |

**B. Systems and artefacts named**

| Item | Stated role | Ref |
|---|---|---|
| Teamcenter | RMM documents technical-review results there today. Integration out of scope 2026 | §3.2.5 p.5; §1.1 p.2 |
| B-Flow | Designated BDF repository for filing the final package. Integration out of scope 2026 | §3.3.3 p.5; §1.1 p.2 |
| SAP MDG | Integration out of scope 2026 | §1.1 p.2 |
| "Preceding system" | Receives status feedback at PS-13 (not named) | §3.3.3 p.5 |
| RMES (Raw Material Evaluation Sheet) | Internal Safety/Regulatory documentation; Parts A–D | §3.2.3; §7 |
| Configuration table | Business-maintained, controlled rule set for scope generation | §1.1; §5 |
| "Controlled assignment rules" | Drive subprocess activation | §3.2.1 |
| "Controlled BDF rule set" (limits) | Substance/impurity limits for quantitative checks | REQ-RMES-008 |
| Sustainability separate questionnaire | Where Sustainability documents findings | §3.2.6; §3.3.2 |
| Dashboards | Overall/role dashboard (§1.1, §3), case dashboard (§6.2), supplier dashboard (§6.2), RMES dashboards per Safety/Regulatory (REQ-RMES-018) | — |
| Final document package | Immutable, versioned; filed in B-Flow | §3.3.3 |
| RMES evaluation record export | Readable, versioned; Parts A–D | REQ-RMES-020 |

**C. Every blocking or validation rule stated in the document**

1. Missing mandatory metadata blocks metadata submission [p.3 §3.1.2].
2. Mandatory fields and mandatory evidence are validated at PS-04 [p.4 §3.1.4].
3. A not-applicable answer that the controlled rule requires to be justified blocks submission until justified [p.4 §3.1.4].
4. PS-05 requires complete data and documents and passed formal mandatory checks [p.3 PS-05]. Missing mandatory evidence means no RMES review is released [REQ-RMES-001].
5. Open blocking requests prevent completion of the affected subprocess [p.4 §3.2.2].
6. Open requests prevent overall approval and show as blocking [p.12 §6.2].
7. Every request needs a business justification, a responsible person and a due date [p.12 §6.2].
8. Rejecting a supplier response requires a short explanation [p.12 §6.2] or a reason [REQ-RMES-011].
9. K2.2: evidence from at least two batches; deviations from BDF limits need justification [p.6].
10. K5.1 may be waived only with a justification [p.6]. SF-12 deactivation requires a justification [p.11].
11. K6.9: a negative nanomaterial answer still requires a justification [p.7].
12. RMES: department approval is blocked while any applicable criterion lacks a final result [REQ-RMES-006]. A negative, implausible or N/A result or an override requires a rationale [REQ-RMES-007, -004]. A blocking finding blocks department and overall approval [REQ-RMES-009]. A rejection reason is mandatory [REQ-RMES-013]. Overall approval requires both RMES approvals and no open blocking item [REQ-RMES-014].
13. The final gate uses final subprocess results and all blocking open items [p.5 §3.3.2].

**D. Stated edge cases and alternative paths**

| Situation | Stated handling | Ref |
|---|---|---|
| Supplier changes a configuration answer | Scope re-derived; entered data handled "according to the rules", never discarded silently | §5.2 p.10 |
| Department disagrees with the derived scope | Can extend or reduce it before release (and "during the IRMA process") | §5.2 p.10 |
| Section not applicable | Supplier does not complete it; justification if a rule requires it | §3.1.3–3.1.4 |
| Supplier refuses to fill in the CIQ and sends own documents | Separate process, still to be specified | §3.1.4 p.4 |
| Resubmission after Supplier Approval | New review version; previous version not overwritten | §3.1.5 p.4 |
| Missing, inconsistent or implausible item in review | Query / additional-document loop, repeat until done | §3.2.2; PS-08 |
| Supplier cannot provide a requested document | Supplier explains why; department accepts or rejects | §6.2 |
| Need for a section not in the derived scope | Request may activate an additional questionnaire section | §6.2 |
| Supplier changes data used by a completed criterion | Criterion flagged; review reopened or explicit no-impact confirmation | REQ-RMES-012 |
| Reviewer disagrees with criterion applicability | Override with mandatory reason | REQ-RMES-004 |
| Other department must act (absence) | Only with an auditable delegation or a formal reassignment | REQ-RMES-011, -013 |
| Subprocess rejected | Effect on the overall case **open** | §3.3.2 p.5 |
| Raw material no longer relevant | Cancel; reactivation within a defined period (1 year, assumed) | §3.3.3 p.5 |
| AI suggestion | Must stay reviewable; never replaces the reviewer's decision | §3.2.3 p.5 |

**E. Open decisions explicitly flagged in the document**

| Open item | Ref |
|---|---|
| OP-13: integration scope per target system (Teamcenter, B-Flow, SAP MDG, others) | p.2 §1.1 |
| OP-17: reuse of supplier-level GMP/ISO data (K6.12) across cases | p.7 K6.12 |
| OP-18: shared sections — do both departments approve, or does one lead? | p.9 §4.3 |
| OP-19: configuration questions and binding configuration table to be completed and confirmed; rules for waste/CCU/chemical recycling; A2 trigger | p.8 A2; p.10 §5.3; p.11–12 §5.4 |
| OP-02: A4 show/hide separately, either/or/both | p.8 A4 |
| OP-03: attached to A2 (content truncated) | p.8 A2 |
| PS-12 overall approver "to be decided"; PS-13 role per "final operating model" | p.3 |
| Effect of a rejected subprocess on the overall case | p.5 §3.3.2 |
| QM subprocess boundary, entry criteria, decision model, ownership | p.5 §3.2.4 |
| RMM process and system split vs Teamcenter | p.5 §3.2.5 |
| Sustainability subprocess details "will follow" | p.5 §3.2.6 |
| Separate process for suppliers who send their own documents | p.4 §3.1.4 |
| Reactivation period (assumed 1 year) | p.5 §3.3.3 |
| Exact target systems / integration for PS-13 | p.5 §3.3.3 |
| Which REQ-RMES are deferred from the MVP ("unless the MVP decision explicitly records a deferral") | p.12 §7 |
| Workshop "dependency?" notes on A5 and A13 | p.8–9 |

**F. Abbreviations**
- **Expanded in the document:** CIQ = Cosmetic Ingredient Questionnaire [p.1]; RMM = Raw Material Management [p.1]; RMES = Raw Material Evaluation Sheet [p.4]; PAH = polyaromatic hydrocarbons [p.8]; CCU = carbon capture utilisation [p.11]; SPM = synthetic polymer microparticles (K4.3 title) [p.6]; KKDIK = Turkey REACH [p.7].
- **Not expanded:** IRMA, BDF, SDS, CoA, INCI, CAS, EC, SVHC, MOAH, IECIC, NMPA, EUDR, RSPO, BSE/TSE, GMP, HS, CITES, SisGen, MDG.
- Standard industry meanings (inferred from general domain knowledge): SDS = Safety Data Sheet; CoA = Certificate of Analysis; INCI = International Nomenclature of Cosmetic Ingredients; SVHC = Substance of Very High Concern; MOAH = mineral oil aromatic hydrocarbons; IECIC = Inventory of Existing Cosmetic Ingredients in China; EUDR = EU Deforestation Regulation; RSPO = Roundtable on Sustainable Palm Oil; CITES = endangered-species trade convention; SisGen = Brazil's genetic-heritage registration system.
- **IRMA is never defined.**

---

## Notable details, gaps & internal inconsistencies (cited)

IDs RD-xx are local to this note, for easy reference later.

### Document control and numbering
- **RD-01 Version conflict.**
  - The running header on all 14 pages says "Requirements Document v1.4" [ReqDoc p.1–14 header].
  - The cover says "Version 2" [p.1].
  - The filename says "v2.0".
  - The Word source title is "CIQ_Requirements_Document_v1_Two_Phase_Process" [metadata].
  - The old Feldkatalog cites a third version stream, "Ref. v3.1 (REQ-ID)" [Feldkatalog r1 col L].
  - There is no change log, so we cannot tell what changed between versions.
- **RD-02 Missing §3.3.1.** §3.3 "Synchronisation, overall decision and closure" goes straight to 3.3.2 [p.5]. The removed subsection was probably about synchronisation (inferred). Synchronisation is now covered by a single sentence in §3.2.1 [p.4].
- **RD-03 Missing authoritative diagram.** The document says the process diagram is authoritative for structure and sequence [p.2 §2]. The PDF has no images on any page (verified visually and in metadata), and no diagram is among the shared files. The source BDF calls authoritative for sequencing is therefore missing.
- **RD-04 No status model.** The document says it organises a "task and status model" [p.1 §1], but no status model is defined. The only state list is the RMES dashboard set: unassigned, open, waiting for supplier, overdue, reopened, approved, rejected [REQ-RMES-018].
- **RD-05 Self-contradiction on assumptions.** §2 says open items "are not resolved by assumption" [p.2], yet §3.3.3 uses "assumption: 1 year" for reactivation [p.5].
- **RD-06 Highlights on p.1.** Yellow highlights on "Raw Material Management (RMM)" and "gives Supplier Approval." [p.1]. Their meaning is unknown; they may mark recent edits or reviewer emphasis (inferred).
- **RD-07 Author is external.** The author field "Pevzner, Alexander ext. /BSS HAM" [metadata] suggests the owner is an external (contractor/consultant) Technical Product Owner. "HAM" is likely Hamburg (inferred).

### Cells truncated in the source PDF (visually confirmed, not extraction errors)
- **RD-08 K4.2:** business meaning is "Biodegradability," (trailing comma). The department cell has an extra line "Environmental". The particularity is empty [p.6].
- **RD-09 K6.17 (EUDR):** business meaning is "Scope and". The particularity is empty [p.8].
- **RD-10 A1:** business meaning is "Feedstock, origin,". The particularity is only "d traceability." [p.8].
- **RD-11 A2:** business meaning is "Manufacturing process,". The trigger reads "Vegetable origin and is not stated in the CIQ (OP-19)". The particularity is only "(OP-03)." [p.8]. The A2 trigger is effectively undefined.
- **RD-12 K6.7:** a typo, "relevance.and legal requirement" [p.7].
- **RD-13 K8 duplicate.** The K8 row is labelled "K8, K8.1" and K8.1 also has its own row [p.8].
- **RD-14 "Read only for Legal" is ambiguous.** Stated for K8 [p.8] and repeated as "Single section, read only" for two sections [p.9]. It could mean Legal only reads (no review or approval), or that the supplier cannot edit (inferred ambiguity).

### Structure and counting
- **RD-15 Only 13 annexes are active.** §1 says 14 annexes [p.1], but A14 has been "moved into the main document" [p.9]. Yet K2.2 still checks limits "against the Beiersdorf values in Annex 14" [p.6]. The old Feldkatalog keeps Annex 14 content as FLD-A14-101…103 under chapter 2.2, with numeric limits: As ≤ 0.5, Cd ≤ 0.1, Cr ≤ 5.0 mg/kg [Feldkatalog r25–r29].
- **RD-16 Challenge test has no ID.** It sits between 5.2 and 5.3 without a chapter number [p.6 K5.2], yet SF-12 deactivates it [p.11]. SF-12 lists **K5.3** (antimicrobial treatment) as its triggered section, which does not match its stated effect [p.11 vs p.7 K5.3]. The KB flags the same issue [KB OpenPoints NEW-08].
- **RD-17 Configuration works below annex level.** "A1 section 5" is activated by SF-08 [p.10–11], and A4 parts are shown or hidden separately (OP-02) [p.8]. Scope rules must therefore work at sub-section or question level, not only per annex (inferred).

### Department ownership
- **RD-18 K5.3 owner:** Safety in §4.1 [p.7] vs QM/Microbiology in §4.3 [p.9]. Also flagged in [KB OpenPoints NEW-09].
- **RD-19 K2.3 lead:** RMM (lead) in §4.1 [p.6] vs listed only under Regulatory in §4.3 [p.9].
- **RD-20 A2 lead:** Safety (lead) in §4.2 [p.8] vs listed only under Regulatory in §4.3 [p.9].
- **RD-21 RMM missing from §4.3.** RMM is co-department on K1, lead on K2.3, and has its own subprocess (§3.2.5) [p.6, p.5], but has no row in the department summary [p.9].
- **RD-22 Lead/co-review roles are undefined.**
  - The "Shared responsibility" row covers only K6.14, K6.17 and K2.2 [p.9].
  - §4.1/§4.2 name several departments for many more sections: K1, K2.3, K4.2, K4.3, K5.2, K6.5, K6.6, K6.9, A1, A2, A6, A8.
  - The meaning of "(lead)", of a co-department, and of "(to be informed)" (K5.2) is not defined. This is tied to OP-18.
- **RD-23 K7 claim is contradicted.** K7 is described as the only section owned outside Regulatory, Safety, QM and Sustainability [p.8]. K8/K8.1 are owned by Legal/IP and K2.3 is led by RMM [p.8, p.6].
- **RD-24 QM vs Microbiology vs QA.**
  - "Microbiology" is a separate department for K5.1/K5.2 [p.6].
  - "QM / Microbiology" is used for A3 and in §4.3 [p.8–9].
  - K6.10 carries the workshop note "QA" [p.7].
  - Whether these are one team or separate roles is unclear.
- **RD-25 Customs and Legal have no subprocess.** Customs/Trade Compliance (K7) and Legal/IP (K8/K8.1) own sections, but §3.2 describes subprocesses only for RMES (Regulatory & Safety), QM, RMM and Sustainability [p.4–5]. Whether they review or approve in Part 2 is unknown. Also flagged in [KB OpenPoints NEW-11].

### Configuration logic (§4.2 vs §5.3 vs §5.4)
- **RD-26 A10 trigger.** A10 is "Always" [p.8], but it is also listed as SF-01-triggered [p.10] and appears per origin in §5.4. It is absent from the waste, CCU and chemical-recycling rows ("none derived") [p.11–12]. Is A10 required for those materials?
- **RD-27 A11/A12 triggers.** They are triggered by target market UK/Turkey via SF-11 [p.8–9, p.11], but §5.4 makes them mandatory for every non-waste origin [p.11]. Also flagged in [KB OpenPoints NEW-07].
- **RD-28 A3 trigger.** A3 is triggered by SF-06 (fermentation/GMO) [p.8, p.10], but §5.4 makes it mandatory for every vegetable material [p.11].
- **RD-29 A1 scope.** A1 is titled "Vegetable origin" and triggered by vegetable origin [p.8], but §5.4 also makes it mandatory for mineral, petrochemical and polymer, though not for animal [p.11]. The FLM agrees ("Annex 1 active" for Bio Mass, Mineral, Petrochemical or Polymer) [FLM 'CIQ new version' r45]. A1 is likely a general feedstock/origin annex rather than vegetable-only (inferred).
- **RD-30 A7 for Mineral.** A7 (colorants, triggered by SF-05) is mandatory for Mineral origin in §5.4 [p.11]. This may reflect mineral pigments (inferred).
- **RD-31 A2 / "Annex 2 mandatory".**
  - The §5.4 column "Annex 2 mandatory" is Yes only for the vegetable rows, which duplicates their mandatory-annex lists [p.11].
  - The §4.2 trigger for A2 is truncated (RD-11).
  - SF-06's "Source in the CIQ" is "Annex 2", but SF-06 triggers A3 [p.10].
  - Also flagged in [KB OpenPoints OP-03].
- **RD-32 Overlapping triggers, no combination logic.**
  - SF-01=Polymer overlaps SF-03, and SF-01=Petrochemical overlaps SF-07 [p.10].
  - A9 is triggered by both SF-01 and SF-07 [p.8].
  - No precedence or combination logic (OR/AND, exclusions, mandatory vs optional outcome) is stated.
  - SF-01 "mineral" vs SF-07 "mineral-oil-based" are easy to confuse (inferred).
- **RD-33 Multi-component materials.** Origin type is collected per component [p.6 K2.3; p.10 SF-01], but nothing says how mixed-origin raw materials are combined. The table "maps every valid combination of answers" [p.11], which implies a combinatorial rule set (inferred). The old Feldkatalog allowed multi-select origin [Feldkatalog r31], while the newer FLM uses a radio button (single choice) [FLM 'CIQ new version' r16–r30].
- **RD-34 SF-05 needs two answers.** It asks "colorant **or** preservative?" in one question but triggers two different annexes, A7/A8 [p.10] (inferred).
- **RD-35 SF-11 has no market-to-section mapping.** No mapping from individual market to section is given [p.11]. The likely mapping (UK→K6.2/A11, Turkey→K6.3/A12, China→K6.13, USA→K6.14, Canada→K6.15) is inferred; the KB proposes the same as R-110…R-115.
  - "And others" is undefined.
  - K6.4 (inventory listings, detailed in A13) is not in the SF-11 list, but A13 is.
  - K6.8 Halal is "market-specific" but has no trigger [p.7]. Also flagged in [KB OpenPoints NEW-10].
- **RD-36 SF-12 polarity and ownership.** "Is microbiological testing required?" is phrased as a yes/no need, but its effect is deactivation [p.11]. Nothing says who answers it (supplier vs BDF Microbiology), and K5.1 requires a justification for a waiver [p.6] (inferred ambiguity).
- **RD-37 Configuration questions must move to the front.** Their current "Source in the CIQ" is spread across Chapters 2.3, 4.3, 5.1, 6.5, 6.16, 6.17 and Annexes 1–2 [p.10–11], but §5.2 requires them all in the initial basic-data step [p.9–10]. They must be pulled forward without duplicating the in-chapter questions (inferred).
- **RD-38 "Reviewing department" column doesn't match ownership.** In §5.4 it does not match the annex owners [p.11 vs p.8–9]. Petrochemical lists only Safety, although A10–A12 belong to Regulatory and A1 to Safety/Sustainability. Vegetable lists Sustainability and Regulatory, but A2 is led by Safety, A3 by QM/Micro and A9 by Safety. The column may mean "reviewer of the additional evidence" only (inferred).
- **RD-39 Sections with no stated trigger.** No trigger or "always" status is given for K2.1, K2.2, K3, K4.1, K4.2, K6.5–K6.7, K6.9–K6.12, K6.16, K7, K8, K8.1. Only K5.2 ("Mandatory in the CIQ") [p.6] and A10 ("Always") [p.8] are explicit. The KB proposes treating the rest as "always", awaiting confirmation [KB ConfigRules R-00, R-01].
- **RD-40 Three origin types have no rules.** Waste/side stream, CCU and chemical recycling have no annexes, evidence or reviewing department defined (OP-19) [p.11–12].
- **RD-41 Undefined internal scope-check step.**
  - §5.2 adds an internal step where "the department" can **extend or reduce** the derived scope before release [p.10].
  - The PS table has no such step or role: PS-03 is done by "System", and PS-04's trigger is simply "Configured CIQ released to the supplier" [p.2]. Who releases the questionnaire, and which department(s) check it, is undefined.
  - BRM REQ-CFG-007 allows only extension, with justification [BRM REQ-CFG-007].
- **RD-42 Re-derivation rules undefined.** Re-derivation handles data "according to the rules", but those rules are not given [p.10]. Nothing says until when configuration answers may change (before or after Supplier Approval). Also flagged in [KB OpenPoints NEW-14].

### Process and approval model
- **RD-43 Approver roles undefined.** PS-11 says "Authorised Beiersdorf role" (undefined), PS-12 says "to be decided", PS-13 says "according to the final operating model" [p.3].
- **RD-44 Rejection handling is open.**
  - The effect of a rejected subprocess is explicitly open [p.5 §3.3.2].
  - REQ-RMES-014 already makes Safety/Regulatory approval a precondition for overall approval [p.14]. That partly pre-empts the open question for RMES.
  - What rejection means for the supplier and the case (end, resubmission, new cycle) is undefined.
- **RD-45 "Blocking" semantics are inconsistent.**
  - §3.2.2: only "open **blocking** requests" stop subprocess completion, which implies non-blocking requests exist [p.4].
  - §6.2: **all** open requests block overall approval [p.12].
  - REQ-RMES-009: findings are blocking or non-blocking [p.13].
  - REQ-RMES-014: no blocking finding or supplier request may be open [p.14].
  - The BRM explicitly rejects any blocking/non-blocking distinction [BRM REQ-PROC-036].
- **RD-46 Fixed version vs Part 2 changes.** Supplier Approval fixes the versions [p.4 §3.1.5]. Yet in Part 2 the supplier answers queries, uploads documents and completes newly activated sections [p.4 §3.2.2; p.12 §6.2], and may change data (REQ-RMES-012). How these in-loop updates relate to the "review version" and to "resubmission" is not defined.
- **RD-47 "Supplier Approval" wording.** The word "approval" for a supplier action conflicts with the document's own insistence that it is not a BDF approval [p.1, p.4]. This is a UI-wording risk (inferred). The BRM calls the same step "completeness confirmation" [BRM REQ-PROC-014, -015].
- **RD-48 "Case" vs "project".** The document says "CIQ case". The cancellation rule mentions relevance "for the project" [p.5], which may refer to a BDF development project (inferred). The BRM uses "CIQ project" throughout.
- **RD-49 Cancellation details missing.** Who may cancel, what happens to open supplier tasks, and how reactivation works (and from which state) are not stated [p.5]. Compare [BRM REQ-PROC-049]: RMM cancels with justification, and all open tasks end.
- **RD-50 Own-document suppliers.** The separate process "will be specified and implemented" [p.4], but MVP inclusion is unknown. Also flagged in [KB OpenPoints NEW-12].
- **RD-51 Misplaced sentence.** The Sustainability "separate questionnaire" sentence is repeated inside the PS-12 overall-approval section [p.5]. It is unclear whether that questionnaire lives inside the CIQ tool.
- **RD-52 Where non-RMES results are documented.**
  - QM: unspecified.
  - Sustainability: separate questionnaire.
  - RMM: Teamcenter today.
  - Customs and Legal: not covered [p.5].
  - PS-09 mentions RMES only "where applicable" [p.3].
- **RD-53 RMES applicability.** PS-09 says "RMES where applicable" [p.3], but REQ-RMES-014 requires "both required RMES approvals" for overall approval [p.14]. Whether RMES applies to every case is unclear.
- **RD-54 Undefined "publication" of findings.** REQ-RMES-015 hides "findings before publication" [p.14], which implies a step that publishes findings to the supplier. That step is described nowhere else.
- **RD-55 RMES content missing.** RMES Parts A–D are not described and the RMES template is not shared [p.13 REQ-RMES-002]. The CIQ→RMES "mapping set" is not given (§3.2.3 says "as far as technically and functionally feasible").
- **RD-56 Four rule bases (inferred).** The document implies four distinct rule bases, each needing versioning and reproducibility:
  - the configuration table [§5];
  - "controlled assignment rules" [§3.2.1];
  - the RMES criteria applicability rules [REQ-RMES-004];
  - the limits rule set [REQ-RMES-008].

### Integration and systems
- **RD-57 B-Flow scope contradiction.** §1.1 puts integration with Teamcenter, B-Flow and SAP MDG out of scope for 2026 (OP-13) [p.2]. Yet PS-13 files the final package in B-Flow and sends status to "the preceding system" [p.5]. For the MVP this is presumably manual or simulated (inferred). Also flagged in [KB OpenPoints OP-13].
- **RD-58 Start trigger vs CIA.** PS-01's trigger is "currently outside the target system" [p.3]. BDF's functional screening lists "Process initiation via TC RM" (Teamcenter) as a **Must Have**, and **Kissflow's submitted answer claims full support** for Teamcenter-triggered start of "IRMA or RMT" processes [CIA #1.0].
- **RD-59 Unnamed "preceding system".** It is never named [p.5]. It is presumably the system that triggers the case, possibly Teamcenter (inferred).
- **RD-60 IRMA undefined.** IRMA is used four times [p.2 §1.1, p.2 PS-01, p.3 §3.1.1, p.10 §5.2] and never defined. CIA #1.0 names "IRMA, RMT" as processes [CIA #1.0]. The KB proposes an "IRMA reference" field [KB ConfigQuestions BD-04].

### Topics the document does not cover (inferred gaps)
- **RD-61** The document does not cover:
  - case or supplier volumes and concurrent users;
  - default due dates or SLAs;
  - UI languages (German/English);
  - supplier onboarding and authentication;
  - multiple supplier contacts per case (only "supplier users" / "responsible supplier contact");
  - supplier master data (beyond the OP-17 hint);
  - retention and archiving periods;
  - reporting and KPIs beyond dashboards;
  - the contents of the "final document package".
- **RD-62 Notifications.** Only partly specified: reviewer on task or resubmission, supplier contact on query [REQ-RMES-019], plus §3.4's reminders and escalation. Default recipients and timings are missing. Also flagged in [KB OpenPoints NEW-16].

### Question seeds for the clarification call (inferred; each linked to the issues above)
1. Can we get the **process diagram** referenced as authoritative, and confirm which version (v1.4 / v2 / v3.1) is current? (RD-01, RD-03)
2. Who approves at **PS-11** and **PS-12**? What happens to the case and the supplier when a subprocess or the overall CIQ is **rejected**? (RD-43, RD-44)
3. Is the end of the case a **BDF approval** (this document) or a **supplier final release plus automatic completion** (BRM)? Which model should the MVP follow? (cross-ref table below)
4. Is every open request or finding blocking, or are there **non-blocking** ones? (RD-45)
5. Who performs the **derived-scope check** before release? Can they reduce scope or only extend it? (RD-41)
6. Is origin type answered **per component or per raw material**? How are mixed origins combined? (RD-33)
7. Should §5.4's origin table override the SF-06/SF-11 triggers for A3, A11 and A12? Is A1 a general origin annex? (RD-26–RD-31)
8. Which **department owns** K5.3, K2.3 and A2? What do "lead", co-review and "to be informed" mean for tasks and approvals? (RD-18–RD-22, OP-18)
9. Do **Customs/Trade Compliance** and **Legal/IP** review and approve in Part 2, or only read? (RD-14, RD-25)
10. Which **REQ-RMES** items are in the MVP? Can BDF share the **RMES template (Parts A–D)** and the CIQ→RMES mapping? (§7, RD-55)
11. After Supplier Approval, how do query answers and newly activated sections relate to the **frozen review version**? (RD-46)
12. For the MVP, are B-Flow filing and the "preceding system" feedback **manual** (integration out of scope), and is a Teamcenter start expected (CIA #1.0)? (RD-57–RD-59)
13. Is the **own-document supplier** path and the **Sustainability separate questionnaire** in or out of the MVP? (RD-50, RD-51)
14. Who may **cancel and reactivate** a case, and is the 1-year window confirmed? (RD-49)
15. What does **IRMA** stand for, and how does it relate to RMT? (RD-60)
16. What volumes, languages and supplier-access model should the MVP assume? (RD-61)

---

## Cross-references to other documents (IDs that point elsewhere, IDs referenced but not defined)

### IDs and artefacts referenced here but not defined or shared
| Reference in ReqDoc | Where | Status in the shared files |
|---|---|---|
| OP-02, OP-03, OP-13, OP-17, OP-18, OP-19 | p.8, p.2, p.7, p.9, p.10–12 | No open-points list in the ReqDoc. **The KB's Open Points sheet defines exactly these six**, with descriptions and "Source: Doc x.y" pointing back to this document [KB OpenPoints OP-19, OP-18, OP-02, OP-03, OP-13, OP-17]. OP-01, OP-04…OP-12 and OP-14…OP-16 appear nowhere, so BDF's master open-points list was not shared (inferred). |
| "CIQ requirements matrix" | p.1 §1 | Most likely the BRM (`CIQ_Business_Requirements_Matrix_MVP.xlsx`), which uses the same PS-xx step IDs (inferred) |
| "process diagram" (authoritative) | p.2 §2 | **Not shared** |
| "CIQ source document" / "CIQ 2026" (8 chapters + 14 annexes) | p.1, p.10 §5.3, p.12 §5.4 | **Not shared.** The IKW sample is a different industry questionnaire with Annex I Plant Extracts [IKW p.16], Annex II International/Non-EU Aspects [IKW p.18] and Annex III Specific Requirements [IKW p.19]; it does not match K/A numbering |
| "RMES template" (Parts A–D) | p.12 §7; REQ-RMES-002 | **Not shared** |
| Sustainability "separate questionnaire" | p.5 | **Not shared** |
| "approved responsibility model", "controlled assignment rules", "controlled BDF rule set", "final operating model", "MVP decision", "existing verified business statements" | p.5, p.4, p.13, p.3, p.12, p.2 | **Not shared** |
| Annex 14 "Beiersdorf values" | p.6 K2.2 | A14 is retired [p.9]. Limit values appear only in the old Feldkatalog FLD-A14-101…103 [Feldkatalog r25–r29] |

### How this document's IDs recur elsewhere
- **PS-xx:** the BRM uses PS-00…PS-12 with **different meanings from PS-06 onward**, and has no PS-13 [BRM col A/B]:

| PS | ReqDoc meaning (role) | BRM meaning (phase label) |
|---|---|---|
| PS-00 | — (not used) | P0 Configuration & administration [BRM REQ-CFG-001…006] |
| PS-01…PS-05 | Start → metadata → configure → complete → Supplier Approval | Same sequence; PS-05 = "Confirm CIQ is completed (end of part 1)" [BRM REQ-PROC-014…017] |
| PS-06 | System activates subprocesses | Review subprocesses, data and documents (incl. RMES) [BRM REQ-PROC-018…024] |
| PS-07 | Department technical review | Queries, additional documents and CIQ parts [BRM REQ-PROC-029…031, REQ-ADR-001/002] |
| PS-08 | Clarification loop (department + supplier) | Supplier answers questions / uploads [BRM REQ-PROC-032, -033] |
| PS-09 | Document results (RMES) | Review of the supplier's answer (open / in progress / closed traffic light) [BRM REQ-PROC-034…036] |
| PS-10 | Decide whether the subprocess is complete | Complete subprocess, explicitly "not a business approval" [BRM REQ-PROC-038…040] |
| PS-11 | **Authorised BDF role approves/rejects subprocess** | **Final CIQ release by the supplier**, then CIQ frozen [BRM REQ-PROC-042, -043] |
| PS-12 | **Overall CIQ approval (role TBD)** | **Automatic completion** after supplier release + automatic PDF e-mailed to the RMM owner [BRM REQ-PROC-045, -046] |
| PS-13 | Final package → B-Flow, status feedback, close | — (does not exist) |

- **Other ReqDoc vs BRM conflicts:**
  - Blocking distinction: ReqDoc REQ-RMES-009 and §3.2.2 vs [BRM REQ-PROC-036] "not envisaged".
  - Scope adjustment: ReqDoc §5.2 "extend or reduce" vs [BRM REQ-CFG-007] extend only, with justification.
  - Changes after submission: ReqDoc §3.1.5 fixes versions vs [BRM REQ-PROC-007], where metadata stays changeable after PS-05 until the PS-11 release.
  - Statuses: ReqDoc REQ-RMES-018 state list vs [BRM REQ-PROC-034] open / in progress / closed and [BRM REQ-CTL-006] section states open / in progress / with the supplier / reviewed / completed.
  - Supplier notification: the ReqDoc does not say when the supplier is told about completion; [BRM REQ-PROC-040] sends exactly one notification after all subprocesses finish.
  - Cancellation: the ReqDoc adds reactivation; [BRM REQ-PROC-049] adds RMM ownership and a mandatory justification.
- **REQ-RMES-001…020:** these do **not** appear in the BRM. The BRM's RMES coverage is REQ-PROC-021 (RMES as internal instrument), REQ-PROC-022 (pre-populate CIQ data) and REQ-PROC-024 (AI-supported review), all marked **"MVP partial scope"** [BRM REQ-PROC-021, -022, -024]. The only other shared file citing a REQ-RMES ID is the KB [KB OpenPoints NEW-16 → REQ-RMES-019].
- **SF-01…SF-12:** reproduced and expanded in the KB's Config Questions and Config Rules (R-00…R-120; R-110…R-115 propose the SF-11 split) [KB ConfigRules].
  - The KB marks the §5.4 rows as "Doc: 5.4 (garbled)" / "Row alignment in source table unclear" [KB ConfigRules R-12, R-13, R-14]. In the actual PDF the table is cleanly aligned, so those caveats come from a lossy extraction, not the source.
  - The FLM origin options match SF-01's eight types and §5.4's annex lists exactly: vegetable→1, 2, 3, 9, 10, 11, 12; animal→10, 11, 12; petrochemical→1, 4, 9, 10, 11, 12; mineral→1, 7, 10, 11, 12; polymer→1, 6, 10, 11, 12; CCU / waste / chemical recycling→no annexes [FLM 'CIQ new version' r16–r30].
  - The FLM marks GMO (Annex 3) via the fermentation route as "outside test scope" [FLM 'CIQ new version' r41].
  - The palm question (SF-08) appears inside Annex 1 as FLD-A1-204 rather than in basic data [FLM 'CIQ new version' r48].
- **K / A section IDs:** reused in the KB Sections sheet and in FLM / Feldkatalog field IDs (FLD-2.x-…, FLD-A1-…, FLD-A2-…, FLD-A14-…) [FLM 'CIQ new version'; Feldkatalog].
- **KB provenance:** the KB says it "captures everything the requirements document already states" [KB ReadMe r5]. Its NEW-01…NEW-16 open points are mostly derived from this document's gaps, e.g. NEW-03 = PS-12 role, NEW-04 = rejected subprocess, NEW-06 = Annex 14, NEW-07 = origin-table conflicts [KB OpenPoints]. This supports the view that the KB was produced from this document by a build or vendor team rather than authored by BDF (inferred).
- **CIA catalogue:**
  - #1.0 "Process initiation via TC RM" is Must Have, and Kissflow's answer commits to a Teamcenter-triggered start [CIA #1.0]. This conflicts with the ReqDoc's "trigger outside the target system" and "integration out of scope 2026" [p.2–3].
  - The CIA also names "RMT" alongside IRMA [CIA #1.0]; the ReqDoc never mentions RMT.
