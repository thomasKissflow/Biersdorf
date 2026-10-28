# CIQ Digitalization – Knowledge Baseline & Gap Sheet

> **Authorship confirmed (2026-10-06):** Kissflow's own team made this sheet for internal reference. It is **not** a Beiersdorf document. Wherever the notes below say "build team / vendor, origin uncertain", read "Kissflow internal". Don't name it or cite it to the client. Its open points can go to Beiersdorf as our own structured question list.

- **File:** `CIQ_Knowledge_Baseline.xlsx` (in `Refrences_Shared_By_Client/`) · **Type/format:** Excel workbook, 7 sheets (Read Me plus 6 working tabs), built as a fill-in template with yellow input columns, colour-coded status cells and dropdown validation · **Author/owner, version, date:** **not stated anywhere in the content.** The file has **no document properties at all** (no `docProps/core.xml` or `app.xml`, so no creator, author, created or modified date). Every zip entry is time-stamped **2026-10-05 07:13**, the day this note was written. The package layout (`mx`/`mv` namespaces, an empty drawing per sheet, an empty `persons` list) matches the CIA catalogue and the BRM, which suggests a Google-Sheets-style xlsx export (inferred). Correction to the brief: "creator = openpyxl" is recorded in the **BRM** (created 2026-09-15) and the **FLM** (created 2026-09-18, last modified by Pevzner 2026-10-02). It is **not** recorded in this file. · **Language:** English.
- **What it is and how to use it:** A gap analysis written **for** Beiersdorf ("marks what is missing so Beiersdorf can complete it" [KB ReadMe r5]). Its defaults are "proposed by the build team" [KB ReadMe r21], and its open points "block the build" [KB ReadMe r13]. It turns the requirements PDF's configuration questions (SF-xx), chapters and annexes (K/A) and evidence into app-shaped tables: config questions, then rules, then sections, then questions, then evidence, then reviewers. Every source reference points to the **requirements PDF only** ("Doc x.y", plus REQ-RMES-019). It never cites the Business Requirements Matrix (BRM) or the Field-Level Matrix (FLM). It is therefore most likely a recent analysis by a build team or vendor, not a BDF-approved requirement (inferred). **Every BDF-input column is empty.** Treat it as a ready-made question backlog and as a skeleton for the scope engine. Check every item against the cross-check below first: the BRM and FLM already answer or contradict a good part of it.

Citation keys: KB = this file (sheet, Excel row r, ID); ReqDoc = CIQ Business process requirements MVP v2.0 PDF; BRM = Business Requirements Matrix; FLM = Field-Level Requirements Matrix v0.6 ('CIQ new version' sheet rows; "changelog" = 'Notes & change log' sheet rows; "Feldkatalog" = old German sheet rows); CIA = functional screening catalogue; IKW = internet sample questionnaire (not BDF).

---

## Structure

| Sheet | Used range | Data rows | Columns (meaning) | Yellow BDF-input columns | Status column (dropdown) |
|---|---|---|---|---|---|
| **Read Me** | A1:B24 | Text, r1–r24 | Title, Purpose, Tabs, How to fill in, Status legend | n/a | n/a |
| **Config Questions** | A1:K220 (data r2–r20) | 19 = 12 SF + 6 BD + 1 BD-xx placeholder | A ID · B Category · C Question · D Source in CIQ · E Proposed answer type · F Known answer options · G Effect (per document) · H Sections / evidence triggered · I Status · J Open questions for Beiersdorf | **K Customer answer** | I (validation I2:I220) |
| **Sections** | A1:M248 (data r2–r48) | 47 = 33 chapters (K1…K8.1 incl. KB-invented "K5.x") + 14 annexes (A1–A14) | A ID · B Type · C Title · D Business meaning · E Responsible department(s) · F Lead · G Applicability · H Triggered by · I Particularity/notes · J Status · K Open questions | **L In MVP? (Y/N)**, **M Customer comments** | J (J2:J248) |
| **Config Rules** | A1:Z230 (data r2–r30, cols A–J only) | 29 rules | A Rule ID · B Config question · C Condition · D Sections activated (mandatory) · E Additional evidence required · F Review departments activated · G Source · H Status · I Notes/conflicts | **J Customer confirmation** | H (H2:H230) |
| **Question Inventory** | A1:N320 (data r2–r120) | 1 grey EXAMPLE row + 118 Q-IDs (Q-001…Q-118): 72 concrete questions + 46 placeholder rows (one per section) | A Q-ID · B Section · C Question/field · D Answer type · E Options/unit · F Mandatory · G Repeating (table) · H Show when · I N/A allowed (with justification) · J Evidence upload · K Reviewing department · L Visible to supplier · M Status | **N Customer comments** | M (M2:M320) |
| **Evidence Documents** | A1:I222 (data r2–r22) | 21 = D-01…D-20 + D-xx placeholder | A Doc ID · B Document · C Required when · D Linked section · E Reviewing department · F Source · G Status · H Notes | **I Customer comments** | G (G2:G222) |
| **Open Points** | A1:H23 | 22 = 6 OP-xx (from ReqDoc) + 16 NEW-xx (KB-created) | A ID · B Topic · C Description · D Impact on app build · E Source · F Priority | **G Beiersdorf owner**, **H Decision / answer** | None. Priority High/Medium/Low instead |

**Formatting (checked in the original file):** headers are navy (1F3864) and the input columns yellow (FFF2CC). Status cells are colour-coded: From document = green E2EFDA · From document – verify = light orange FCE4D6 · Proposed – to confirm = blue DDEBF7 · Missing – customer to provide = orange F8CBAD · Inconsistency – clarify = red FFC7CE. The EXAMPLE row (Question Inventory r2) is grey (EDEDED). Every data sheet has its panes frozen at C2. Validation and print ranges run about 200 rows past the data, so BDF can add rows ("Add new rows freely, especially in Question Inventory" [KB ReadMe r16]). The workbook has no cell comments.

**Status legend** [KB ReadMe r18–r24]. Short forms used in this note are in brackets.

| Status | Meaning |
|---|---|
| From document [From doc] | Stated clearly in the requirements document |
| From document – verify [Verify] | Taken from the document, but the source table was ambiguous or garbled |
| Proposed – to confirm [Proposed] | Not in the document; a sensible default proposed by the build team |
| Missing – customer to provide [Missing] | Not in the document; Beiersdorf must provide it |
| Inconsistency – clarify [Inconsistency] | The document contradicts itself |
| Yellow column | Beiersdorf input |

---

## Full content digest

### 1. Read Me
- Title: "CIQ Digitalization - Knowledge Baseline & Gap Sheet" [KB ReadMe r1].
- Purpose: to capture everything the requirements document already says about the CIQ questionnaire, its configuration logic and section ownership, and to mark what is missing. "The target structure maps directly onto app fields, visibility rules and review assignments" [KB ReadMe r5].
- Tabs [r8–r13]: Config Questions = "the Stage 1 questions the supplier answers before the questionnaire is generated (SF-01..SF-12) plus proposed basic-data fields". Sections = every chapter and annex, with owner, trigger and notes. Config Rules = which answer activates which section, evidence and reviewing department. Question Inventory = field-level list of the "Stage 2" questions, pre-filled where the document names data points, with one placeholder row per section for the rest. Evidence Documents. Open Points = "open decisions and inconsistencies ... that block the build".
- How to fill in [r16]: edit only the yellow columns, add rows freely, and use the grey EXAMPLE row as the expected level of detail.
- Note: "Stage 1" and "Stage 2" are the KB's own terms. In ReqDoc terms, Stage 1 = PS-02 metadata and Stage 2 = PS-04, the full CIQ; both sit inside ReqDoc "Part 1" [ReqDoc p.2 §2, p.3–4 §3.1].

### 2. Config Questions (Stage 1)

**SF-01 … SF-12 (configuration questions; taken from ReqDoc §5.3, pp.10–11)**

| r | ID | Question | Source in CIQ | Proposed answer type | Known options | Effect | Sections / evidence triggered | Status | KB open questions |
|---|---|---|---|---|---|---|---|---|---|
| 2 | SF-01 | Origin type of the components | Ch. 2.3 | Multi-select (per component?) | Vegetable; Animal; Mineral; Petrochemical; Waste or side stream; CCU; Polymer; Chemical recycling | Determines the majority of the mandatory annexes | A1, A2, A3, A4, A6, A7, A9, A10, A11, A12 and BSE/TSE evidence; no annexes for waste/side stream, CCU, chemical recycling | From doc | Single or multi-select? Answered per component (K2.3 says "per component") or once per raw material? "Polymer" overlaps SF-03: which wins? Waste/CCU/recycling rules undefined (OP-19) |
| 3 | SF-02 | Are there additional production sites? | Basic data | Yes/No + repeating site table | Yes; No | Additional site information | Site data, no annex | From doc | Which fields per site (name, address, country, GMP/ISO)? |
| 4 | SF-03 | Does the raw material contain polymer components or meet the REACH polymer definition? | Ch. 4.3 | Yes/No | Yes; No | Activates polymer and SPM review | K4.3, A6 | From doc | none |
| 5 | SF-04 | Is the material a UV filter? | Ch. 6.5 (Annex VI) | Yes/No | Yes; No | Activates the UV filter section | A5 | From doc | none |
| 6 | SF-05 | Is the material a colorant or a preservative? | Ch. 6.5 (Annex IV and V) | Multi-select | Colorant; Preservative; Neither | Activates substance-class annexes | A7 (colorant), A8 (preservative) | Proposed | The document combines two questions: split into two Yes/No? Can a material be both? |
| 7 | SF-06 | Is fermentation involved or are GMOs involved? | Annex 2 | Yes/No (or two separate Yes/No) | Yes; No | Activates the GMO section | A3 | From doc | Does this also trigger Annex 2 (manufacturing process)? The A2 trigger is unclear (OP-03) |
| 8 | SF-07 | Is the material mineral-oil-based or a hydrocarbon? | Ch. 2.3 | Yes/No | Yes; No | Activates MOAH and PAH review | A4, A9 | From doc | Derivable from SF-01 = Mineral/Petrochemical instead of a separate question? A4 show/hide either/or/both (OP-02) |
| 9 | SF-08 | Is the feedstock palm-based? | Annex 1 | Yes/No | Yes; No | Activates mandatory RSPO information | A1 section 5, RSPO evidence | From doc | Only asked when SF-01 = Vegetable? |
| 10 | SF-09 | Does the raw material fall within the scope of the EUDR? | Ch. 6.17 | Yes/No | Yes; No | Activates EUDR traceability | K6.17 | From doc | Can the supplier judge EUDR scope, or should it be derived from the HS code (K7)? |
| 11 | SF-10 | Is Brazilian genetic heritage affected? | Ch. 6.16 | Yes/No | Yes; No | Activates SisGen information | K6.16.1 | From doc | none |
| 12 | SF-11 | Target markets of the raw material | Basic data | Multi-select | China; USA; Canada; UK; Turkey; Others (list?) | Activates market-specific compliance sections | K6.2, K6.3, K6.13, K6.14, K6.15, A11, A12, A13 | From doc | Confirm the market-to-section mapping (see Config Rules). Full list of "Others"? Who answers, supplier or Beiersdorf (target markets are a Beiersdorf fact)? Does K6.8 Halal depend on markets? |
| 13 | SF-12 | Is microbiological testing required? | Ch. 5.1 | Yes/No + justification if No | Yes; No | Deactivates the micro test (5.1) and challenge test, with justification; total microbial count (5.2) stays mandatory | K5.1, K5.3 (per table) | **Inconsistency** | The table says K5.3, but K5.3 is antimicrobial treatment and the challenge test has no chapter number. Which sections are really switched off? |

**BD-01 … BD-06, BD-xx (basic-data fields proposed by the KB; not in ReqDoc)**

| r | ID | Field | Source | Proposed answer type | Effect | Status | KB open questions |
|---|---|---|---|---|---|---|---|
| 14 | BD-01 | Supplier name and supplier ID | Not specified | Lookup (supplier master) | Case identification | Proposed | Pre-filled by RMM at case start? |
| 15 | BD-02 | Manufacturer name and address (if different from supplier) | Not specified | Text | Case identification / K6.12 | Proposed | none |
| 16 | BD-03 | Trade name of the raw material | Not specified | Text | Case identification | Proposed | none |
| 17 | BD-04 | Beiersdorf material number / IRMA reference | Not specified | Text | Case identification | Proposed | Entered by RMM at PS-01? |
| 18 | BD-05 | INCI name of the raw material | Not specified | Text | Case identification | Proposed | none |
| 19 | BD-06 | Supplier contact person(s) and roles | Not specified | Repeating table | Task assignment | Proposed | One or several supplier users? Split by topic? |
| 20 | BD-xx | [Other metadata / structural data required at PS-02] | Section 3.1.2 | n/a | n/a | **Missing** | The document mentions "metadata and structural data" but does not list them |

Customer answer column K is empty for all 19 rows.

### 3. Sections (every chapter and annex)

Column L "In MVP? (Y/N)" and column M "Customer comments" are **empty for all 47 rows**.

| r | ID | Title | Business meaning | Responsible dept(s) | Lead | Applicability | Triggered by | Notes | Status | KB open question |
|---|---|---|---|---|---|---|---|---|---|---|
| 2 | K1 | Mandatory documents | Checklist of all required evidence (SDS, CoA, specification, statements) | QM, Regulatory, RMM, Safety | QM | Always | Scope derived from config table | Frames all other chapters; list is case-specific | From doc | Is K1 a generated checklist (system output) or questions the supplier answers? |
| 3 | K2.1 | Components and additives | Full composition per component: INCI, CAS, EC, function, additive, origin, concentration | Regulatory | Regulatory | Always (proposed) | none | Data basis for almost all later reviews; table with any number of components | From doc | Concentration as exact value or range? Must it total 100%? |
| 4 | K2.2 | Byproducts and contaminations | Byproducts/contaminations, evidence from at least two batches | Safety, QM | Safety | Always (proposed) | none | Limits checked against BDF values in Annex 14; deviations need justification | **Inconsistency** | Annex 14 was moved into the main document: where do the limit values now live, and who maintains them? |
| 5 | K2.3 | Source or type of starting materials | Origin type per component | RMM, Safety, Sustainability, Regulatory | RMM | Always (proposed) | Hosts SF-01 | Central config question SF-01; drives most mandatory annexes | From doc | The summary table lists K2.3 under Regulatory only: who reviews it? |
| 6 | K3 | Storage conditions and handling | Storage conditions, shelf life, temperature | QM | QM | Always (proposed) | none | Relevant for goods receipt, warehousing, production | From doc | none |
| 7 | K4.1 | Toxicity data | Tox endpoints with study protocol and annex status | Safety | Safety | Always (proposed) | none | Assessment authority exclusively with Safety | Verify | List of endpoints? |
| 8 | K4.2 | Environmental effects | Biodegradability | Safety (Environmental Safety?) | Safety | Always (proposed) | none | none | Verify | Source table garbled: confirm owner |
| 9 | K4.3 | Synthetic polymer microparticles | REACH polymer definition and SPM restriction scope | Safety, Regulatory | Safety | Conditional | SF-03 | Regulatory area subject to change; Annex 6 goes into more detail | Verify | none |
| 10 | K5.1 | Microbiological test | Micro test of the raw material | Microbiology | Microbiology | Conditional | SF-12 | May be waived, but justification required | From doc | none |
| 11 | K5.2 | Total microbial count | Total aerobic count, yeast and moulds, specific microorganisms | Microbiology, Safety (informed) | Microbiology | **Always** | none | Stays mandatory even if SF-12 = No | From doc | Which specific microorganisms? Limits? |
| 12 | **K5.x** (KB-invented ID) | Challenge test | Preservation efficacy test | Microbiology? | ? | Conditional | SF-12 | Sits between 5.2 and 5.3 without its own chapter number | **Inconsistency** | Treat as its own section? Owner? |
| 13 | K5.3 | Antimicrobial treatment | Type and maximum dose of antimicrobial treatment | Safety (chapter table) / QM-Micro (summary) | ? | Always (proposed) | SF-12 (per SF table?) | Irradiation, heat, ethylene oxide | **Inconsistency** | Chapter table says Safety, summary says QM/Microbiology. Is it switched off by SF-12? |
| 14 | K6.1 | EU REACH | Registration status, Annex XIV and XVII, SVHC | Regulatory | Regulatory | **Always** | none | Detailed in Annex 10 | From doc | none |
| 15 | K6.2 | UK REACH | UK registration status incl. only representative | Regulatory | Regulatory | Conditional | SF-11 = UK | Detailed in Annex 11; also relevant for indirect imports | From doc | How are indirect imports captured? |
| 16 | K6.3 | Turkey REACH (KKDIK) | Registration status Turkey | Regulatory | Regulatory | Conditional | SF-11 = Turkey | Detailed in Annex 12 | From doc | none |
| 17 | K6.4 | Chemical inventory listings | Listing in national chemical inventories | Regulatory | Regulatory | **?** | SF-11? (A13 is triggered, K6.4 not listed) | Detailed in Annex 13 | **Inconsistency** | Is K6.4 always shown, or only with target markets? |
| 18 | K6.5 | Reg. 1223/2009 Annexes III–VI | Cosmetics regulation annexes | Regulatory, Safety | Regulatory | Always (proposed) | none | Core provision for cosmetic usability; hosts SF-04, SF-05 | From doc | none |
| 19 | K6.6 | Ingredients Art. 19(g) / Annex III | Ingredients relevant for labelling | Regulatory, Safety | Regulatory | Always (proposed) | none | Basis for later product labelling | From doc | none |
| 20 | K6.7 | Animal testing (Art. 11(2)(e)) | Animal testing status | Regulatory | Regulatory | Always (proposed) | none | Evidence required; high reputational relevance and legal requirement | From doc | none |
| 21 | K6.8 | Halal status | Halal and kosher information | Regulatory | Regulatory | **?** | Market-specific: trigger not defined | none | **Missing** | Which market or answer triggers K6.8? |
| 22 | K6.9 | Nanomaterials | Nano status incl. justification and evidence | Safety, Regulatory | Safety | Always (proposed) | none | A negative answer also requires justification | From doc | none |
| 23 | K6.10 | Pharmacopeia | Listing in pharmacopeia monograph | QM | QM | Always (proposed) | none | Workshop note: QA | From doc | none |
| 24 | K6.11 | Food grade status | Listing as food additive | Safety | Safety | Always (proposed) | none | Workshop note: Safety | From doc | none |
| 25 | K6.12 | GMP compliance and ISO certification | GMP standards and ISO certificates of the manufacturer | QM | QM | Always (proposed) | none | Supplier-related, not material-related; reuse across cases (OP-17) | From doc | Store at supplier level and reuse? |
| 26 | K6.13 | China IECIC / NMPA | Listing in China inventory, NMPA code | Regulatory | Regulatory | Conditional | SF-11 = China | none | From doc | none |
| 27 | K6.14 | California Proposition 65 | Prop 65 listing incl. contaminations | Regulatory, Safety (joint) | Shared (OP-18) | Conditional | SF-11 = USA | Shared responsibility | From doc | Both approve, or one leads? |
| 28 | K6.15 | Canada Hot List | Listing on the Canada Hot List | Regulatory | Regulatory | Conditional | SF-11 = Canada | none | From doc | none |
| 29 | K6.16 | Biodiversity laws | Access and benefit sharing under national biodiversity law | Regulatory | Regulatory | Always (proposed) | none | Framing chapter; case distinctions in 6.16.1 | From doc | none |
| 30 | K6.16.1 | Brazilian Biodiversity Law | SisGen registration and exemptions | Regulatory | Regulatory | Conditional | SF-10 | Extensive case distinctions with several exemptions | From doc | Provide the exemption decision tree |
| 31 | K6.17 | EUDR | Scope and traceability | Regulatory, Sustainability | Unclear (OP-18) | Conditional | SF-09 | Summary lists it under Sustainability | Verify | Who leads? |
| 32 | K7 | Customs and foreign trade | HS code, country of origin, export control, CITES | Customs / Trade Compliance | Customs | Always (proposed) | none | Only section owned outside Reg/Safety/QM/Sustainability; easily overlooked | From doc | Is Customs a reviewer in Part 2? Not listed as a subprocess |
| 33 | K8 | Patent | Patents and licence | Legal / IP | Legal | Always (proposed) | none | Read only for Legal | From doc | Does Legal approve, or only read? |
| 34 | K8.1 | Additional patent information | Supplementary patent and licence details | Legal / IP | Legal | Conditional | Answer in K8? | Follow-up chapter to 8 | Proposed | What in K8 triggers K8.1? |
| 35 | A1 | Vegetable origin | Feedstock, origin, traceability | Safety, Sustainability | Sustainability | Conditional | SF-01 = Vegetable; section 5 via SF-08 | none | Verify | The origin table also lists A1 for mineral, petrochemical, polymer: intended? |
| 36 | A2 | Manufacturing process | Manufacturing process | Regulatory, Safety | Safety | Conditional | Unclear: "vegetable origin and ... not stated in the CIQ" | OP-03, OP-19 | **Inconsistency** | What triggers A2? |
| 37 | A3 | GMO | GMOs, safety level, separation | QM / Microbiology | QM | Conditional | SF-06 (and SF-01 = Vegetable per origin table) | Workshop notes: QM (micro), evidence | From doc | none |
| 38 | A4 | Hydrocarbons | MOAH, physico-chemical data for mineral oils and waxes | Safety | Safety | Conditional | SF-07 | MVP: show/hide either/or/both (OP-02) | From doc | none |
| 39 | A5 | UV filters | Approval status inside and outside the EU | Regulatory | Regulatory | Conditional | SF-04 | Workshop note: dependency? | From doc | none |
| 40 | A6 | Synthetic polymers / biopolymers | Cross-linkers, monomers, molecular weight, residual monomer content | Safety, Regulatory | Safety | Conditional | SF-03 | Direct extension of chapter 4.3 | From doc | none |
| 41 | A7 | Colorants | Colorant-specific information | Regulatory | Regulatory | Conditional | SF-05 = Colorant | Substance-class specific | From doc | none |
| 42 | A8 | Preservatives | Preservative-specific information | Regulatory, Safety | Regulatory | Conditional | SF-05 = Preservative | Substance-class specific | From doc | none |
| 43 | A9 | Polyaromatic hydrocarbons (PAH) | Limits and analysis for PAH | Safety | Safety | Conditional | SF-01 = Vegetable or Petrochemical; SF-07 | Contains binding BDF limits and a reference method | From doc | Provide limit values and reference method |
| 44 | A10 | EU REACH | Substance-related REACH registration data | Regulatory | Regulatory | **Always** | none | Per substance, not per raw material (repeating) | From doc | none |
| 45 | A11 | UK REACH | Substance-related UK REACH data incl. only representative | Regulatory | Regulatory | Conditional | SF-11 = UK | Contains a signed supplier declaration | **Inconsistency** | The origin table lists A11 as mandatory for all origin types, contradicting the SF-11 trigger |
| 46 | A12 | Turkey REACH | Substance-related KKDIK data | Regulatory | Regulatory | Conditional | SF-11 = Turkey | Same structure as Annexes 10 and 11 | **Inconsistency** | Same contradiction as A11 |
| 47 | A13 | Chemical inventories | Listing status per country and inventory (Y/N/E) | Regulatory | Regulatory | Conditional | SF-11 | Workshop note: dependency? | From doc | Which countries/inventories per market? |
| 48 | A14 | Moved into main document | Covered by chapter K2 | n/a | n/a | Not applicable | none | none | From doc | none |

Applicability tally: Always 4 (K1, K5.2, K6.1, A10) · Always (proposed) 17 · Conditional 23 · "?" 2 (K6.4, K6.8) · Not applicable 1 (A14).

### 4. Config Rules

Customer confirmation column J is empty for all 29 rows.

| r | Rule | Config Q | Condition | Sections activated (mandatory) | Additional evidence | Review depts activated | Source | Status | Notes / conflicts |
|---|---|---|---|---|---|---|---|---|---|
| 2 | R-00 | none | Always (every case) | K1, K5.2, K6.1, A10 | SDS, CoA, specification, statements (K1) | QM, Microbiology, Regulatory | Doc 4.1, 4.2, 5.3 | From doc | "Only these are explicitly 'always' in the document" |
| 3 | R-01 | none | Always (every case), proposed | K2.1, K2.2, K2.3, K3, K4.1, K4.2, K5.3, K6.5, K6.6, K6.7, K6.9, K6.10, K6.11, K6.12, K6.16, K7, K8 | none | Regulatory, Safety, QM, RMM, Customs, Legal | Inferred | Proposed | The document does not say whether these are always shown |
| 4 | R-10 | SF-01 | = "Vegetable" (cell C4 is stored as a formula `= "Vegetable"`, an import artefact) | A1, A2, A3, A9, A10, A11, A12 | Pesticide and mycotoxin analysis; sustainability certificates | Sustainability, Regulatory | Doc 5.4 | From doc | A3 and A11/A12 conflict with their own triggers (SF-06, SF-11) |
| 5 | R-11 | SF-01 + SF-08 | "Vegetable AND palm-based" = "Yes" | A1 section 5 | RSPO certificate with supply chain model; RSPO number on the CoA | Sustainability | Doc 5.4 | From doc | none |
| 6 | R-12 | SF-01 | Animal | A10, A11, A12 | BSE/TSE certificate; conformity with Annex II entry 419 | Regulatory, QM | Doc 5.4 (garbled) | Verify | Row alignment in source table unclear |
| 7 | R-13 | SF-01 | Mineral | A1, A7, A10, A11, A12 | Origin and specification of the mineral source | Regulatory, Safety | Doc 5.4 (garbled) | Verify | A1 (vegetable) and A7 (colorants) for mineral look wrong: verify |
| 8 | R-14 | SF-01 | Petrochemical | A1, A4, A9, A10, A11, A12 | MOAH value; PAH analysis against BDF limits | Safety | Doc 5.4 (garbled) | Verify | Overlaps with SF-07 |
| 9 | R-15 | SF-01 | Polymer | A1, A6, A10, A11, A12 | Residual monomer content; SPM scope statement | Safety, Regulatory | Doc 5.4 | Verify | Overlaps with SF-03 |
| 10 | R-16 | SF-01 | Waste or side stream | None derived | To be defined | To be defined | Doc 5.4 | Missing | OP-19 |
| 11 | R-17 | SF-01 | CCU | None derived | To be defined | To be defined | Doc 5.4 | Missing | OP-19 |
| 12 | R-18 | SF-01 | Chemical recycling of post-consumer plastic | None derived | To be defined | To be defined | Doc 5.4 | Missing | OP-19 |
| 13 | R-20 | SF-02 | Yes | Site data (no annex) | none | none | Doc 5.3 | From doc | none |
| 14 | R-30 | SF-03 | Yes | K4.3, A6 | none | Safety, Regulatory | Doc 5.3 | From doc | none |
| 15 | R-40 | SF-04 | Yes | A5 | none | Regulatory | Doc 5.3 | From doc | none |
| 16 | R-50 | SF-05 | Colorant | A7 | none | Regulatory | Doc 5.3 | From doc | none |
| 17 | R-51 | SF-05 | Preservative | A8 | none | Regulatory, Safety | Doc 5.3 | From doc | none |
| 18 | R-60 | SF-06 | Yes | A3 | none | QM / Microbiology | Doc 5.3 | From doc | Also A2? |
| 19 | R-70 | SF-07 | Yes | A4, A9 | none | Safety | Doc 5.3 | From doc | none |
| 20 | R-80 | SF-08 | Yes | A1 section 5 | RSPO evidence | Sustainability | Doc 5.3 | From doc | none |
| 21 | R-90 | SF-09 | Yes | K6.17 | none | Regulatory, Sustainability | Doc 5.3 | From doc | none |
| 22 | R-100 | SF-10 | Yes | K6.16.1 | none | Regulatory | Doc 5.3 | From doc | none |
| 23 | R-110 | SF-11 | includes UK | K6.2, A11 | none | Regulatory | Proposed split of doc 5.3 | Proposed | none |
| 24 | R-111 | SF-11 | includes Turkey | K6.3, A12 | none | Regulatory | Proposed split of doc 5.3 | Proposed | none |
| 25 | R-112 | SF-11 | includes China | K6.13 | none | Regulatory | Proposed split of doc 5.3 | Proposed | none |
| 26 | R-113 | SF-11 | includes USA | K6.14 | none | Regulatory, Safety | Proposed split of doc 5.3 | Proposed | none |
| 27 | R-114 | SF-11 | includes Canada | K6.15 | none | Regulatory | Proposed split of doc 5.3 | Proposed | none |
| 28 | R-115 | SF-11 | any market selected | A13 (and K6.4?) | none | Regulatory | Proposed split of doc 5.3 | Proposed | Which inventories per market? |
| 29 | R-120 | SF-12 | No | K5.1 and challenge test NOT applicable (justification mandatory); K5.2 stays mandatory | Justification | Microbiology | Doc 5.3 | **Inconsistency** | The table also lists K5.3: clarify |
| 30 | R-xx | none | [Combination rules / exclusions] | none | none | none | none | **Missing** | Is it simple OR logic (any trigger = mandatory)? Any rules that make a section optional rather than mandatory? |

Numbering: R-00/R-01 = baseline; R-1x = SF-01 values; R-20…R-120 = SF-02…SF-12 (×10); R-11x = SF-11 per market.

### 5. Question Inventory (Stage 2)

Column L "Visible to supplier" = **Yes for all 118 rows**: no internal-only fields are modelled. Column N "Customer comments" is empty except the EXAMPLE row. "SecVis" = "Section visible". "[placeholder]" = "[Remaining questions of this section - please add rows]". Every placeholder has status Missing, and all its other cells are blank apart from the reviewer.

EXAMPLE (r2, grey): K3 – "Recommended storage temperature" · Range (min–max) · °C · Mandatory Yes · Repeating No · Show Always · N/A No · Evidence No · QM · visible Yes · status Example · comment "Use this level of detail for every question".

| r | Q-ID | Section | Question / field | Answer type | Options / unit | Mand. | Repeating | Show when | N/A w/ justif. | Evidence | Reviewer | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 3 | Q-001 | K1 | SDS upload | File | none | Yes | No | SecVis | No | Yes | QM | From doc |
| 4 | Q-002 | K1 | Certificate of Analysis (CoA) upload | File | none | Yes | No | SecVis | No | Yes | QM | From doc |
| 5 | Q-003 | K1 | Specification upload | File | none | Yes | No | SecVis | No | Yes | QM | From doc |
| 6 | Q-004 | K1 | Statements upload (which statements?) | File | none | ? | ? | SecVis | ? | Yes | QM | Proposed |
| 7 | Q-005 | K1 | [placeholder] | | | | | | | | QM | Missing |
| 8 | Q-006 | K2.1 | INCI name | Text | none | Yes | Yes, per component | SecVis | No | No | Regulatory | From doc |
| 9 | Q-007 | K2.1 | CAS number | Text (format check) | none | Yes | Yes, per component | SecVis | ? | No | Regulatory | Proposed |
| 10 | Q-008 | K2.1 | EC number | Text (format check) | none | ? | Yes, per component | SecVis | ? | No | Regulatory | Proposed |
| 11 | Q-009 | K2.1 | Function | Dropdown? | none | Yes | Yes, per component | SecVis | No | No | Regulatory | Proposed |
| 12 | Q-010 | K2.1 | Additive | Yes/No | none | Yes | Yes, per component | SecVis | No | No | Regulatory | From doc |
| 13 | Q-011 | K2.1 | Origin | Dropdown (= SF-01 values?) | none | Yes | Yes, per component | SecVis | No | No | Regulatory | Proposed |
| 14 | Q-012 | K2.1 | Concentration | Number or range | % | Yes | Yes, per component | SecVis | No | No | Regulatory | From doc |
| 15 | Q-013 | K2.1 | [placeholder] | | | | | | | | Regulatory | Missing |
| 16 | Q-014 | K2.2 | Byproduct / contaminant | Text | none | ? | Yes | SecVis | ? | No | Safety | Proposed |
| 17 | Q-015 | K2.2 | Measured value batch 1 / batch 2 | Number | unit? | Yes | Yes | SecVis | No | Yes (analysis) | Safety | Proposed |
| 18 | Q-016 | K2.2 | Justification for deviation from BDF limit | Long text | none | If value > limit | Yes | Value > limit | No | No | Safety | From doc |
| 19 | Q-017 | K2.2 | [placeholder] | | | | | | | | Safety | Missing |
| 20 | Q-018 | K2.3 | Origin type per component | Dropdown | SF-01 values | Yes | Yes, per component | SecVis | No | No | RMM | From doc |
| 21 | Q-019 | K2.3 | [placeholder] | | | | | | | | RMM | Missing |
| 22 | Q-020 | K3 | Storage conditions | Long text | none | Yes | No | SecVis | No | No | QM | From doc |
| 23 | Q-021 | K3 | Shelf life | Number | months | Yes | No | SecVis | No | No | QM | From doc |
| 24 | Q-022 | K3 | Storage temperature | Range | °C | Yes | No | SecVis | No | No | QM | From doc |
| 25 | Q-023 | K3 | [placeholder] | | | | | | | | QM | Missing |
| 26 | Q-024 | K4.1 | Toxicological endpoint | Dropdown | endpoint list? | ? | Yes, per endpoint | SecVis | ? | No | Safety | Proposed |
| 27 | Q-025 | K4.1 | Study protocol / result | Text + file | none | ? | Yes, per endpoint | SecVis | ? | Yes | Safety | Proposed |
| 28 | Q-026 | K4.1 | Annex status | Dropdown? | none | ? | Yes, per endpoint | SecVis | ? | No | Safety | Proposed |
| 29 | Q-027 | K4.1 | [placeholder] | | | | | | | | Safety | Missing |
| 30 | Q-028 | K4.2 | Biodegradability | Dropdown + value? | none | ? | No | SecVis | ? | ? | Safety | Proposed |
| 31 | Q-029 | K4.2 | [placeholder] | | | | | | | | Safety | Missing |
| 32 | Q-030 | K4.3 | Meets REACH polymer definition | Yes/No | none | Yes | No | SF-03 = Yes | No | No | Safety | From doc |
| 33 | Q-031 | K4.3 | In scope of SPM restriction | Yes/No + justification | none | Yes | No | SF-03 = Yes | No | ? | Safety | Proposed |
| 34 | Q-032 | K4.3 | [placeholder] | | | | | | | | Safety | Missing |
| 35 | Q-033 | K5.1 | Microbiological test result | Text + file | none | Yes | No | SF-12 = Yes | Yes | Yes | Microbiology | From doc |
| 36 | Q-034 | K5.1 | Justification for waiving the test | Long text | none | If waived | No | SF-12 = No | n/a | No | Microbiology | From doc |
| 37 | Q-035 | K5.1 | [placeholder] | | | | | | | | Microbiology | Missing |
| 38 | Q-036 | K5.2 | Total aerobic count | Number | CFU/g | Yes | No | SecVis | No | ? | Microbiology | Proposed |
| 39 | Q-037 | K5.2 | Yeast and moulds | Number | CFU/g | Yes | No | SecVis | No | ? | Microbiology | Proposed |
| 40 | Q-038 | K5.2 | Specific microorganisms | Absent/Present per organism | list? | Yes | Yes, per organism | SecVis | No | ? | Microbiology | Proposed |
| 41 | Q-039 | K5.2 | [placeholder] | | | | | | | | Microbiology | Missing |
| 42 | Q-040 | K5.x | [placeholder] (challenge test) | | | | | | | | ? | Missing |
| 43 | Q-041 | K5.3 | Type of antimicrobial treatment | Multi-select | Irradiation; Heat; Ethylene oxide; None | Yes | No | SecVis | No | No | ? | From doc |
| 44 | Q-042 | K5.3 | Maximum dose | Number | unit per type? | If treated | No | Treatment <> None | No | No | ? | Proposed |
| 45 | Q-043 | K5.3 | [placeholder] | | | | | | | | ? | Missing |
| 46 | Q-044 | K6.1 | EU REACH registration status | Dropdown | none | Yes | Per substance (A10) | SecVis | No | ? | Regulatory | Proposed |
| 47 | Q-045 | K6.1 | Listed in REACH Annex XIV / XVII | Yes/No | none | Yes | Per substance | SecVis | No | No | Regulatory | From doc |
| 48 | Q-046 | K6.1 | Contains SVHC | Yes/No | none | Yes | Per substance | SecVis | No | No | Regulatory | From doc |
| 49 | Q-047 | K6.1 | [placeholder] | | | | | | | | Regulatory | Missing |
| 50 | Q-048 | K6.2 | UK REACH registration status | Dropdown | none | Yes | Per substance (A11) | SF-11 = UK | No | No | Regulatory | From doc |
| 51 | Q-049 | K6.2 | Only representative | Text | none | ? | No | SF-11 = UK | ? | No | Regulatory | Proposed |
| 52 | Q-050 | K6.2 | [placeholder] | | | | | | | | Regulatory | Missing |
| 53 | Q-051 | K6.3 | KKDIK registration status | Dropdown | none | Yes | Per substance (A12) | SF-11 = Turkey | No | No | Regulatory | From doc |
| 54 | Q-052 | K6.3 | [placeholder] | | | | | | | | Regulatory | Missing |
| 55 | Q-053 | K6.4 | Listed in national chemical inventories | Per country Y/N/E | none | ? | Per country (A13) | SF-11? | ? | No | Regulatory | Proposed |
| 56 | Q-054 | K6.4 | [placeholder] | | | | | | | | Regulatory | Missing |
| 57 | Q-055 | K6.5 | Status under Annexes III–VI of Reg. 1223/2009 | Dropdown per annex | none | Yes | ? | SecVis | No | No | Regulatory | Proposed |
| 58 | Q-056 | K6.5 | [placeholder] | | | | | | | | Regulatory | Missing |
| 59 | Q-057 | K6.6 | Contains labelling-relevant ingredients (Art. 19(g) / Annex III) | Yes/No + list | none | Yes | ? | SecVis | No | No | Regulatory | Proposed |
| 60 | Q-058 | K6.6 | [placeholder] | | | | | | | | Regulatory | Missing |
| 61 | Q-059 | K6.7 | Animal testing status | Dropdown | none | Yes | No | SecVis | No | Yes | Regulatory | From doc |
| 62 | Q-060 | K6.7 | [placeholder] | | | | | | | | Regulatory | Missing |
| 63 | Q-061 | K6.8 | Halal status | Dropdown | none | ? | No | ? | ? | Yes (certificate?) | Regulatory | Proposed |
| 64 | Q-062 | K6.8 | Kosher status | Dropdown | none | ? | No | ? | ? | Yes (certificate?) | Regulatory | Proposed |
| 65 | Q-063 | K6.8 | [placeholder] | | | | | | | | Regulatory | Missing |
| 66 | Q-064 | K6.9 | Nanomaterial (Yes/No) | Yes/No | none | Yes | No | SecVis | No | Yes | Safety | From doc |
| 67 | Q-065 | K6.9 | Justification (required for Yes and No) | Long text | none | Yes | No | SecVis | No | No | Safety | From doc |
| 68 | Q-066 | K6.9 | [placeholder] | | | | | | | | Safety | Missing |
| 69 | Q-067 | K6.10 | Listed in pharmacopeia monograph (which) | Yes/No + text | none | ? | No | SecVis | ? | ? | QM | Proposed |
| 70 | Q-068 | K6.10 | [placeholder] | | | | | | | | QM | Missing |
| 71 | Q-069 | K6.11 | Listed as food additive / food grade | Yes/No + text | none | ? | No | SecVis | ? | ? | Safety | Proposed |
| 72 | Q-070 | K6.11 | [placeholder] | | | | | | | | Safety | Missing |
| 73 | Q-071 | K6.12 | GMP standard applied | Dropdown | none | ? | No | SecVis | ? | Yes | QM | Proposed |
| 74 | Q-072 | K6.12 | ISO certificates | File + expiry date | none | ? | Yes | SecVis | ? | Yes | QM | Proposed |
| 75 | Q-073 | K6.12 | [placeholder] | | | | | | | | QM | Missing |
| 76 | Q-074 | K6.13 | Listed in IECIC | Yes/No | none | Yes | No | SF-11 = China | No | No | Regulatory | From doc |
| 77 | Q-075 | K6.13 | NMPA code | Text | none | ? | No | SF-11 = China | ? | No | Regulatory | Proposed |
| 78 | Q-076 | K6.13 | [placeholder] | | | | | | | | Regulatory | Missing |
| 79 | Q-077 | K6.14 | Prop 65 listed substances incl. contaminations | Yes/No + list | none | Yes | Yes | SF-11 = USA | No | No | Shared (OP-18) | From doc |
| 80 | Q-078 | K6.14 | [placeholder] | | | | | | | | Shared (OP-18) | Missing |
| 81 | Q-079 | K6.15 | Listed on Canada Hot List | Yes/No | none | Yes | No | SF-11 = Canada | No | No | Regulatory | From doc |
| 82 | Q-080 | K6.15 | [placeholder] | | | | | | | | Regulatory | Missing |
| 83 | Q-081 | K6.16 | Access and benefit sharing applicable | Yes/No | none | Yes | No | SecVis | No | ? | Regulatory | Proposed |
| 84 | Q-082 | K6.16 | [placeholder] | | | | | | | | Regulatory | Missing |
| 85 | Q-083 | K6.16.1 | SisGen registration / exemption | Dropdown + number | none | Yes | No | SF-10 = Yes | No | Yes | Regulatory | From doc |
| 86 | Q-084 | K6.16.1 | [placeholder] | | | | | | | | Regulatory | Missing |
| 87 | Q-085 | K6.17 | EUDR scope / traceability data | ? | none | Yes | ? | SF-09 = Yes | No | ? | Unclear (OP-18) | Proposed |
| 88 | Q-086 | K6.17 | [placeholder] | | | | | | | | Unclear (OP-18) | Missing |
| 89 | Q-087 | K7 | HS code | Text | none | Yes | No | SecVis | No | No | Customs | From doc |
| 90 | Q-088 | K7 | Country of origin | Country list | none | Yes | No | SecVis | No | No | Customs | From doc |
| 91 | Q-089 | K7 | Export control classification | Text | none | ? | No | SecVis | ? | No | Customs | Proposed |
| 92 | Q-090 | K7 | CITES relevant | Yes/No | none | ? | No | SecVis | ? | ? | Customs | Proposed |
| 93 | Q-091 | K7 | [placeholder] | | | | | | | | Customs | Missing |
| 94 | Q-092 | K8 | Patents and licences | Long text | none | ? | ? | SecVis | ? | ? | Legal | Proposed |
| 95 | Q-093 | K8 | [placeholder] | | | | | | | | Legal | Missing |
| 96 | Q-094 | K8.1 | [placeholder] | | | | | | | | Legal | Missing |
| 97 | Q-095 | A1 | Feedstock / plant species | Text | none | Yes | ? | SF-01 = Vegetable | No | ? | Sustainability | Proposed |
| 98 | Q-096 | A1 | Geographic origin / traceability | Text | none | Yes | ? | SF-01 = Vegetable | No | ? | Sustainability | Proposed |
| 99 | Q-097 | A1 | RSPO supply chain model, RSPO number (section 5) | Dropdown + text | none | Yes | No | SF-08 = Yes | No | Yes | Sustainability | From doc |
| 100 | Q-098 | A1 | [placeholder] | | | | | | | | Sustainability | Missing |
| 101 | Q-099 | A2 | [placeholder] | | | | | | | | Safety | Missing |
| 102 | Q-100 | A3 | GMO involved / safety level / separation | Structured | none | Yes | No | SF-06 = Yes | No | Yes | QM | From doc |
| 103 | Q-101 | A3 | [placeholder] | | | | | | | | QM | Missing |
| 104 | Q-102 | A4 | MOAH value | Number | mg/kg? | Yes | No | SF-07 = Yes | No | Yes | Safety | Proposed |
| 105 | Q-103 | A4 | [placeholder] | | | | | | | | Safety | Missing |
| 106 | Q-104 | A5 | UV filter approval status EU / non-EU | Per market | none | Yes | Yes | SF-04 = Yes | No | ? | Regulatory | Proposed |
| 107 | Q-105 | A5 | [placeholder] | | | | | | | | Regulatory | Missing |
| 108 | Q-106 | A6 | Cross-linkers / monomers / molecular weight / residual monomer content | Structured | none | Yes | Yes | SF-03 = Yes | No | ? | Safety | Proposed |
| 109 | Q-107 | A6 | [placeholder] | | | | | | | | Safety | Missing |
| 110 | Q-108 | A7 | [placeholder] | | | | | | | | Regulatory | Missing |
| 111 | Q-109 | A8 | [placeholder] | | | | | | | | Regulatory | Missing |
| 112 | Q-110 | A9 | PAH values against BDF limits | Number per PAH | mg/kg? | Yes | Yes, per PAH | SF-07 or SF-01 | No | Yes | Safety | Proposed |
| 113 | Q-111 | A9 | [placeholder] | | | | | | | | Safety | Missing |
| 114 | Q-112 | A10 | REACH registration number per substance | Text | none | Yes | Yes, per substance | SecVis | ? | No | Regulatory | Proposed |
| 115 | Q-113 | A10 | [placeholder] | | | | | | | | Regulatory | Missing |
| 116 | Q-114 | A11 | Signed supplier declaration | File (signed) | none | Yes | No | SF-11 = UK | No | Yes | Regulatory | From doc |
| 117 | Q-115 | A11 | [placeholder] | | | | | | | | Regulatory | Missing |
| 118 | Q-116 | A12 | [placeholder] | | | | | | | | Regulatory | Missing |
| 119 | Q-117 | A13 | Listing status per country and inventory | Y / N / E | none | Yes | Yes, per country | SF-11 | No | No | Regulatory | From doc |
| 120 | Q-118 | A13 | [placeholder] | | | | | | | | Regulatory | Missing |

**Question Inventory summary**
- 118 Q-IDs in 46 sections (all except A14): **72 concrete questions** and **46 "Missing – customer to provide" rows**. Every Missing row is a placeholder, exactly one per section. Status split: From doc 32 · Proposed 40 · Missing 46 (+ 1 Example).
- **6 sections have no concrete question at all**: K5.x (challenge test), K8.1, A2, A7, A8, A12.
- 41 of the 72 concrete questions still contain a "?" somewhere. By column: N/A-allowed 21, Mandatory 19, Evidence 18, Repeating 7, Options/unit 6, Answer type 5, Show-when 3, Reviewer 2, Question 1.
- Reviewer distribution (all 118 rows): Regulatory 48 · Safety 25 · QM 16 · Microbiology 7 · Customs 5 · "?" 4 (K5.x, K5.3) · Sustainability 4 · Legal 3 · RMM 2 · Shared (OP-18) 2 · Unclear (OP-18) 2.

| Section | Concrete Qs | of which From doc / Proposed | Placeholder |
|---|---|---|---|
| K1 | 4 | 3 / 1 | Q-005 |
| K2.1 | 7 | 3 / 4 | Q-013 |
| K2.2 | 3 | 1 / 2 | Q-017 |
| K2.3 | 1 | 1 / 0 | Q-019 |
| K3 | 3 | 3 / 0 | Q-023 |
| K4.1 | 3 | 0 / 3 | Q-027 |
| K4.2 | 1 | 0 / 1 | Q-029 |
| K4.3 | 2 | 1 / 1 | Q-032 |
| K5.1 | 2 | 2 / 0 | Q-035 |
| K5.2 | 3 | 0 / 3 | Q-039 |
| K5.x | 0 | none | Q-040 |
| K5.3 | 2 | 1 / 1 | Q-043 |
| K6.1 | 3 | 2 / 1 | Q-047 |
| K6.2 | 2 | 1 / 1 | Q-050 |
| K6.3 | 1 | 1 / 0 | Q-052 |
| K6.4 | 1 | 0 / 1 | Q-054 |
| K6.5 | 1 | 0 / 1 | Q-056 |
| K6.6 | 1 | 0 / 1 | Q-058 |
| K6.7 | 1 | 1 / 0 | Q-060 |
| K6.8 | 2 | 0 / 2 | Q-063 |
| K6.9 | 2 | 2 / 0 | Q-066 |
| K6.10 | 1 | 0 / 1 | Q-068 |
| K6.11 | 1 | 0 / 1 | Q-070 |
| K6.12 | 2 | 0 / 2 | Q-073 |
| K6.13 | 2 | 1 / 1 | Q-076 |
| K6.14 | 1 | 1 / 0 | Q-078 |
| K6.15 | 1 | 1 / 0 | Q-080 |
| K6.16 | 1 | 0 / 1 | Q-082 |
| K6.16.1 | 1 | 1 / 0 | Q-084 |
| K6.17 | 1 | 0 / 1 | Q-086 |
| K7 | 4 | 2 / 2 | Q-091 |
| K8 | 1 | 0 / 1 | Q-093 |
| K8.1 | 0 | none | Q-094 |
| A1 | 3 | 1 / 2 | Q-098 |
| A2 | 0 | none | Q-099 |
| A3 | 1 | 1 / 0 | Q-101 |
| A4 | 1 | 0 / 1 | Q-103 |
| A5 | 1 | 0 / 1 | Q-105 |
| A6 | 1 | 0 / 1 | Q-107 |
| A7 | 0 | none | Q-108 |
| A8 | 0 | none | Q-109 |
| A9 | 1 | 0 / 1 | Q-111 |
| A10 | 1 | 0 / 1 | Q-113 |
| A11 | 1 | 1 / 0 | Q-115 |
| A12 | 0 | none | Q-116 |
| A13 | 1 | 1 / 0 | Q-118 |
| **Total** | **72** | **32 / 40** | **46** |

### 6. Evidence Documents

Customer comments column I is empty for all 21 rows.

| r | Doc ID | Document | Required when | Linked section | Reviewing dept | Source | Status | Notes |
|---|---|---|---|---|---|---|---|---|
| 2 | D-01 | Safety Data Sheet (SDS) | Always | K1 | QM / Regulatory / Safety | Doc 4.1 | From doc | Validity / max age? |
| 3 | D-02 | Certificate of Analysis (CoA) | Always | K1 | QM | Doc 4.1 | From doc | RSPO number must appear on the CoA when palm-based |
| 4 | D-03 | Specification | Always | K1 | QM | Doc 4.1 | From doc | none |
| 5 | D-04 | Statements (which?) | Always? | K1 | ? | Doc 4.1 | **Missing** | List of standard statements needed |
| 6 | D-05 | Batch analyses (min. 2 batches) for byproducts/contaminations | Always? | K2.2 | Safety, QM | Doc 4.1 | From doc | none |
| 7 | D-06 | Pesticide and mycotoxin analysis | SF-01 = Vegetable | A1 | Sustainability, Regulatory | Doc 5.4 | From doc | none |
| 8 | D-07 | Sustainability certificates | SF-01 = Vegetable | A1 | Sustainability | Doc 5.4 | From doc | Which certificates? |
| 9 | D-08 | RSPO certificate with supply chain model | SF-08 = Yes | A1 section 5 | Sustainability | Doc 5.4 | From doc | none |
| 10 | D-09 | BSE/TSE certificate | SF-01 = Animal | ? | Regulatory, QM | Doc 5.3/5.4 | From doc | none |
| 11 | D-10 | Conformity with Annex II entry 419 (Reg. 1223/2009) | SF-01 = Animal | K6.5? | Regulatory | Doc 5.4 | From doc | none |
| 12 | D-11 | Origin and specification of the mineral source | SF-01 = Mineral | ? | Regulatory, Safety | Doc 5.4 | Verify | none |
| 13 | D-12 | MOAH value | SF-01 = Petrochemical / SF-07 | A4 | Safety | Doc 5.4 | From doc | none |
| 14 | D-13 | PAH analysis against BDF limits | SF-01 = Petrochemical / SF-07 | A9 | Safety | Doc 5.4 | From doc | none |
| 15 | D-14 | Residual monomer content | SF-01 = Polymer / SF-03 | A6 | Safety | Doc 5.4 | From doc | none |
| 16 | D-15 | SPM scope statement | SF-01 = Polymer / SF-03 | K4.3 | Safety, Regulatory | Doc 5.4 | From doc | none |
| 17 | D-16 | Animal testing evidence | Always | K6.7 | Regulatory | Doc 4.1 | From doc | none |
| 18 | D-17 | Nanomaterial evidence | Always | K6.9 | Safety | Doc 4.1 | From doc | none |
| 19 | D-18 | GMP / ISO certificates of the manufacturer | Always? | K6.12 | QM | Doc 4.1 | From doc | Reuse across cases (OP-17) |
| 20 | D-19 | UK REACH signed supplier declaration | SF-11 = UK | A11 | Regulatory | Doc 4.2 | From doc | Template? |
| 21 | D-20 | Microbiological test report | SF-12 = Yes | K5.1 | Microbiology | Doc 4.1 | Proposed | none |
| 22 | D-xx | [Other evidence documents] | none | none | none | none | **Missing** | Full evidence list per section needed |

### 7. Open Points (sheet order)

"Beiersdorf owner" (G) and "Decision / answer" (H) are **empty for all 22**.

| r | ID | Topic | Description | Impact on app build | Source | Priority |
|---|---|---|---|---|---|---|
| 2 | OP-19 | Configuration questions and rules | Config questions are a draft; the binding configuration table is still to be collected with the departments. Waste/CCU/recycling rules undefined | Blocks the scope engine, the core of the app | Doc 5.3/5.4 | High |
| 3 | NEW-01 | CIQ question inventory | The document lists chapters but not the individual questions, answer types, validations or evidence per question | Blocks form design for Stage 2 | Gap | High |
| 4 | NEW-02 | Stage 1 metadata fields | "Metadata and structural data" at PS-02 are not listed beyond SF-01..SF-12 | Blocks the initial supplier form | Doc 3.1.2 | High |
| 5 | NEW-03 | Overall approver (PS-12) | The role responsible for overall CIQ approval is "to be decided" | Blocks the approval workflow | Doc 2.1 | High |
| 6 | NEW-04 | Effect of a rejected subprocess | Effect of one rejected subprocess on the overall case is open | Blocks the approval workflow | Doc 3.3.2 | High |
| 7 | OP-18 | Shared sections | K2.2, K6.14, K6.17: do both departments approve, or does one lead? | Review task assignment | Doc 4.3 | High |
| 8 | NEW-05 | MVP scope | Which subprocesses (RMES, QM, RMM, Sustainability, Customs, Legal) and sections are in the MVP? | Sizing and release plan | Gap | High |
| 9 | OP-02 | Annex 4 display | Show/hide A4 parts either/or/both in MVP | Visibility rules in A4 | Doc 4.2 | Medium |
| 10 | OP-03 | Annex 2 trigger | What triggers the manufacturing-process annex? | Scope rule | Doc 4.2 | Medium |
| 11 | OP-13 | Integrations | Teamcenter, B-Flow, SAP MDG scope per target system open; out of scope 2026, but PS-13 files to B-Flow | Final filing step: manual in MVP? | Doc 1.1 / 3.3.3 | Medium |
| 12 | OP-17 | Supplier-level data reuse | GMP/ISO (K6.12) relates to the supplier; reuse across cases | Supplier master vs case data model | Doc 4.1 | Medium |
| 13 | NEW-06 | Annex 14 references | K2.2 checks limits against Annex 14, but A14 was moved into the main document | Where limit values are stored | Doc 4.1 / 4.2 | Medium |
| 14 | NEW-07 | Origin table vs triggers | The origin table makes A3, A11, A12 mandatory for vegetable (and A11/A12 for all origins), contradicting the SF-06/SF-11 triggers. A1/A7 appear for mineral | Rule conflicts | Doc 5.4 | Medium |
| 15 | NEW-08 | SF-12 / challenge test | SF-12 lists K5.1 and K5.3; K5.3 is antimicrobial treatment and the challenge test has no chapter number | Micro section design | Doc 5.3 | Medium |
| 16 | NEW-09 | K5.3 owner | Chapter table says Safety; summary says QM/Microbiology | Review assignment | Doc 4.1 / 4.3 | Low |
| 17 | NEW-10 | K6.8 Halal trigger | Market-specific, but no trigger defined | Scope rule | Doc 4.1 | Low |
| 18 | NEW-11 | Customs and Legal in Part 2 | K7 and K8 have owners, but no review subprocess is described | Review subprocess list | Doc 3.2 / 4.3 | Medium |
| 19 | NEW-12 | Own-document suppliers | Suppliers who upload their own documents instead of the CIQ need a separate process | In MVP or not? | Doc 3.1.4 | Medium |
| 20 | NEW-13 | QM, RMM, Sustainability subprocesses | Boundaries, entry criteria and decision models open; Sustainability uses a separate questionnaire | Subprocess design | Doc 3.2.4–3.2.6 | Medium |
| 21 | NEW-14 | Scope change after data entry | How data in sections that fall out of scope is handled (hide, archive, delete) | Data handling rules | Doc 5.2 | Medium |
| 22 | NEW-15 | Cancellation / reactivation period | Assumption: 1 year, to be confirmed | Case lifecycle | Doc 3.3.3 | Low |
| 23 | NEW-16 | Due dates, reminders, escalation | Default due dates and escalation recipients per task type not defined | Notification configuration | Doc 3.4 / REQ-RMES-019 | Low |

Priority tally: **High 7** (OP-19, NEW-01, NEW-02, NEW-03, NEW-04, OP-18, NEW-05) · **Medium 11** (OP-02, OP-03, OP-13, OP-17, NEW-06, NEW-07, NEW-08, NEW-11, NEW-12, NEW-13, NEW-14) · **Low 4** (NEW-09, NEW-10, NEW-15, NEW-16).

### 8. Status statistics (counted in the original file)

| Sheet | Rows | From doc | Verify | Proposed | Missing | Inconsistency | Example |
|---|---|---|---|---|---|---|---|
| Config Questions | 19 | 10 | 0 | 7 (SF-05, BD-01…BD-06) | 1 (BD-xx) | 1 (SF-12) | 0 |
| Sections | 47 | 33 | 5 (K4.1, K4.2, K4.3, K6.17, A1) | 1 (K8.1) | 1 (K6.8) | 7 (K2.2, K5.x, K5.3, K6.4, A2, A11, A12) | 0 |
| Config Rules | 29 | 13 | 4 (R-12…R-15) | 7 (R-01, R-110…R-115) | 4 (R-16, R-17, R-18, R-xx) | 1 (R-120) | 0 |
| Question Inventory | 119 | 32 | 0 | 40 | 46 (all placeholders) | 0 | 1 |
| Evidence Documents | 21 | 17 | 1 (D-11) | 1 (D-20) | 2 (D-04, D-xx) | 0 | 0 |
| **Total (5 sheets)** | **235** | **105** | **10** | **56** | **54** | **9** | **1** |
| Open Points | 22 | no status column: High 7 / Medium 11 / Low 4 | | | | | |

**Customer-input columns:** a programmatic check of every yellow column (Config Questions K, Sections L/M, Config Rules J, Question Inventory N, Evidence I, Open Points G/H) found **0 filled cells**. The only text is the instruction in the EXAMPLE row (N2).

---

## Notable details, gaps & internal inconsistencies (cited)

**Provenance and nature**
1. The authorship is unknown and the file has no metadata (see header). The wording ("proposed by the build team", "block the build", "maps directly onto app fields" [KB ReadMe r5, r13, r21]) is an implementer's. The source citations are 100% ReqDoc section numbers, plus REQ-RMES-019 [KB OpenPoints r23]. It never cites a BRM ID (REQ-PROC/CFG/CTL/ADR) or an FLM field ID. It is therefore a build-team or vendor-side gap analysis of the **requirements PDF only** (inferred). Ask the consultant who wrote it and whether BDF intends to fill it in.
2. The KB does not say which ReqDoc version it read. Its section references (3.1.2, 3.1.4, 3.2.4–3.2.6, 3.3.2, 3.3.3, 5.2–5.4) match v2.0. The ReqDoc header says "Requirements Document v1.4" while its cover table says "Version 2" [ReqDoc p.1].
3. It uses the **ReqDoc PS numbering** (PS-12 = "Overall CIQ approval", PS-13 = B-Flow filing [KB OpenPoints r5, r11]). The BRM numbers the steps differently: PS-11 = final CIQ release by the supplier, PS-12 = automatic completion [BRM REQ-PROC-042, REQ-PROC-045]. A KB "PS-xx" must not be read with BRM meaning.
4. Scope of the sheet: it covers **questionnaire configuration only** (Part 1 content plus reviewer assignment). It has no tab for RMES criteria (ReqDoc §7, REQ-RMES-001…020), roles and permissions, the task and status model, dashboards, notifications or the final PDF. All 118 questions are "Visible to supplier = Yes" [KB QI col L]. Internal-only data such as RMES Parts A–D [ReqDoc p.13 REQ-RMES-002] is therefore not represented.

**Internal inconsistencies and errors in the KB itself**
5. **The Lead column mixes stated and inferred leads without flagging the difference.** ReqDoc marks "(lead)" explicitly only for K1 QM, K2.2 Safety, K2.3 RMM, K4.3 Safety, K6.9 Safety, K6.17 Sustainability and A2 Safety [ReqDoc pp.6–8]. The KB still assigns single leads for K6.5, K6.6 (Regulatory), A1 (Sustainability), A3 (QM), A6 (Safety) and A8 (Regulatory), all with status "From doc" [KB Sections r18, r19, r35, r37, r40, r42].
6. **K6.17 lead: the KB says "Unclear (OP-18)"** [KB Sections r31], but ReqDoc p.8 reads "Regulatory and Sustainability (lead)", and §4.3 lists K6.17 under Sustainability [ReqDoc p.9]. The doubt comes from K6.17 also being on the shared-responsibility list [ReqDoc p.9].
7. **The K4.2 owner drops Regulatory.** The KB has "Safety (Environmental Safety?)" [KB Sections r8], while the garbled ReqDoc row reads "Biodegradability, Safety, Regulatory" [ReqDoc p.6]. §4.3 lists K4.2 under Safety only [ReqDoc p.9].
8. **R-00 overstates the source.** It claims K1, K5.2, K6.1 and A10 are "explicitly 'always'" [KB ConfigRules r2]. ReqDoc says "Always" only for A10 [p.8] and "Mandatory in the CIQ" for K5.2 [p.6]. It describes K1 as case-specific [p.6] and gives no applicability for K6.1. "K6.1 Always" is therefore a KB inference marked "From doc" [KB Sections r14].
9. **The Config Rules produce only "mandatory" sections**, with no "optional" or "not applicable" outputs [KB ConfigRules col D header]. ReqDoc §3.1.3 / §5.2 [pp.4, 10] and BRM REQ-PROC-010 require a three-way classification (mandatory / optional / not applicable). R-xx only asks the question [KB ConfigRules r30].
10. The status logic is uneven. SF-05 is "Proposed" because of the proposed split [KB CQ r6], while SF-01, whose answer type ("Multi-select (per component?)") is equally a proposal, is "From doc" [KB CQ r2]. Q-041 adds the option "None", which is not in ReqDoc, yet is "From doc" [KB QI r43].
11. **Some "documents" are really data values.** D-12 "MOAH value" and D-14 "Residual monomer content" are values, not documents (inferred) [KB Evidence r13, r15]. The FLM models MOAH as a number field [FLM 'CIQ new version' r53 FLD-A4-101].
12. Artefact: Config Rules C4 is stored as the formula `= "Vegetable"` [KB ConfigRules r4, formula note]. It is harmless, but it shows the text was imported programmatically (inferred).
13. **"K5.x" is an ID the KB invented** for the challenge test, which ReqDoc never numbers [ReqDoc p.6].
14. QM vs Microbiology: the KB treats them as separate review departments [KB ConfigRules r2, r29], ReqDoc §4.3 treats them as one ("QM / Microbiology") [ReqDoc p.9], and BRM lists them as separate roles [BRM REQ-CFG-004]. This needs a decision on the role model (inferred).

**ReqDoc inconsistencies the KB did not flag** (relevant to the same tables)
15. **A2 owner:** the annex table gives "Regulatory, Safety (lead)" [ReqDoc p.8], but §4.3 lists A2 under Regulatory only [p.9]. The KB shows Safety as lead with status "Inconsistency" only for the trigger [KB Sections r36].
16. **A1:** "Safety and Sustainability" [p.8] vs §4.3 Sustainability only [p.9]. **A6:** "Safety, Regulatory" vs §4.3 Safety. **A8:** "Regulatory, Safety" vs §4.3 Regulatory. **RMM has no row in the §4.3 summary**, although it leads K2.3 and co-owns K1 [pp.6, 9].
17. **Who may change the scope:** ReqDoc §5.2 lets departments "extend or reduce" the derived scope [p.10], while BRM REQ-CFG-007 only allows them to **extend** it (with a mandatory justification).

---

## Cross-references to other documents

### A. IDs and terms in the KB that point elsewhere
| ID / term | Defined in | Note |
|---|---|---|
| SF-01…SF-12 | ReqDoc §5.3 pp.10–11 | Also required as rule anchors by BRM REQ-CFG-003. In the FLM only SF-01 (as FLD-2.3-01) and SF-08 (as FLD-A1-204) are realised; SF-02 appears in the old Feldkatalog r8 |
| K1…K8.1, A1…A14 | ReqDoc §4.1–4.3 pp.6–9 | "K5.x" exists only in the KB |
| PS-01, PS-02, PS-12, PS-13 | ReqDoc §2.1 pp.2–3 | Numbering differs from the BRM after PS-06 (see item 3) |
| OP-02, OP-03, OP-13, OP-17, OP-18, OP-19 | Referenced by ReqDoc [pp.2, 7–9, 10–12] but **never defined there** | OP-01, OP-04…OP-12, OP-14…OP-16 appear in **no** shared file. The BRM legend says "Yellow cell = Open business question – see sheet 'Open points'", but the BRM has no such sheet [BRM Legend r7]. A master open-points list exists at BDF but was not shared (inferred) |
| REQ-RMES-019 | ReqDoc p.14 | The only REQ ID the KB cites |
| "Doc x.y" sources | ReqDoc sections | All KB "Source" cells |
| IRMA, RMES, B-Flow, Teamcenter, SAP MDG, Annex 14 | ReqDoc pp.1–2, 4–5, 8–9 | No definitions inside the KB |

**IDs defined only in the KB:** BD-01…BD-06, BD-xx, R-00…R-120, R-xx, Q-001…Q-118, D-01…D-20, D-xx, NEW-01…NEW-16, K5.x.

**KB to FLM field mapping** (useful when the two are discussed side by side)

| KB item | FLM / Feldkatalog field(s) |
|---|---|
| BD-01 Supplier name / ID | FLD-GEN-002 Supplier (name) [FLM r3]; FLD-GEN-003 DUNS [FLM r7] |
| BD-02 Manufacturer | FLD-GEN-004 [FLM r8] |
| BD-03 Trade name | FLD-GEN-001 [FLM r2] |
| BD-04 BDF material no. / IRMA ref | none |
| BD-05 INCI | FLD-2.1-001 INCI (European) / IUPAC [FLM r10] |
| BD-06 Supplier contacts | FLD-GEN-008, FLD-GEN-009 [FLM r4–r5]; old FLD-VER-003/-005 [Feldkatalog r12, r14] |
| SF-01 / Q-011 / Q-018 | FLD-2.3-01 Source of origin (+ FLD-2.1-101 Part, FLD-2.3-10 Country, FLD-2.3-11…16 specification fields) [FLM r16–r31] |
| SF-02 | FLD-GEN-006/-007 [Feldkatalog r8–r9], dropped in v0.6 [FLM changelog r25] |
| SF-08 / Q-097 / D-08 | FLD-A1-204, -206, -207, -208 [FLM r48–r51] |
| Q-006…Q-012 (K2.1) | FLD-2.1-001…-007 [FLM r10–r15] |
| Q-095 / Q-096 | FLD-A1-102 Feedstock [FLM r32]; FLD-2.1-101 Part [r18]; FLD-2.3-10 Country of origin [r19] |
| Q-099 (A2 placeholder) | FLD-A2-101…-103 [FLM r37–r43] |
| Q-102 (A4) | FLD-A4-101…-103 [FLM r53–r55] |
| Q-014…Q-016, D-05 (K2.2) | FLD-2.2-001, FLD-A14-101…-103 [Feldkatalog r26–r29] |
| Q-024…Q-026 (K4.1) | FLD-4.1-001, -101, -102, -104 [Feldkatalog r40–r44] |
| Q-044…Q-046, Q-112 (K6.1/A10) | FLD-6.1-001…-009 [Feldkatalog r46–r54] |
| D-06 / D-07 | FLD-A1-201…-203 pesticides; FLD-A1-207/-208 other certification [FLM r45–r51] |
| D-09 / D-10 / D-11 / D-12 | FLD-2.3-01 = Animal upload [FLM r17]; FLD-2.3-12 [r23]; FLD-A4-101 [r53] |

### B. Cross-check: which KB items the BRM or FLM already answer or contradict

Verdict key: **Answered** = BDF documents give a usable answer · **Partial** = part of it is answered · **Contradicted** = the BDF documents say something different from the KB's premise or default · **Open** = still unanswered.

**B1. Open Points**

| KB ID | Verdict | What the BRM / FLM say |
|---|---|---|
| OP-19 Config Qs and rules (waste/CCU/recycling) | **Partial** | FLM puts SF-01 into practice as the radio field FLD-2.3-01 with all 8 options. The per-option annex lists are identical to ReqDoc §5.4. **Waste / CCU / chemical recycling have "no annexes"**, only a mandatory free-text specification (FLD-2.3-13/-15/-16) [FLM r24–r31; changelog r68–r69, r94–r96, r108–r110]. BRM REQ-CFG-003 requires a versioned, business-maintained rule set with nested if-then and decision trees, each rule tied to SF-01…SF-12. Still open: the binding table for SF-02…SF-12, plus evidence and reviewers for waste/CCU/recycling |
| NEW-01 Question inventory | **Partial** | FLM v0.6 defines 39 field IDs (50 rows), but only for Process Start, Meta Data, Annex 2, Annex 1 (pesticides, palm/RSPO) and Annex 4 [FLM 'CIQ new version' r2–r55]. The old Feldkatalog adds K2.2/A14, K4.1, K6.1/A10 and the A1 table [Feldkatalog r25–r61]. BRM REQ-CFG-001/-002 say business admins must maintain sections, questions, help texts, options, mandatory fields and evidence **without IT** (field types: text, yes/no, single/multi choice, number ± unit, date, repeatable table, file upload). Most chapters (K3, K5, K6.2–K6.17, K7, K8, A3, A5–A13) remain undefined |
| NEW-02 Stage 1 metadata | **Largely answered** | Case creation needs supplier, trade name, supplier contact and responsible BDF owner, plus a unique ID [BRM REQ-PROC-001]. At first the supplier sees only basic data and config questions [BRM REQ-PROC-004]. Search keys are DUNS, INCI and type of origin [BRM REQ-PROC-006]. The FLM lists the fields: Process Start (FLD-GEN-001/-002/-008/-009) and Meta Data (DUNS, Manufacturer, Production site, INCI/IUPAC, CAS, EC, Additive?, Function, Concentration range, Source of origin and its sub-fields, Feedstock, Natural origin index, Content % in INCI and in raw material) [FLM r2–r35]. **Tension:** ReqDoc says PS-02 is "deliberately limited to the information needed for configuration" [p.3 §3.1.2], yet the FLM Meta Data block already holds the full K2.1 composition and Annex 1 values (inferred) |
| NEW-03 Overall approver (PS-12) | **Contradicted / reframed** | The BRM has **no internal overall approval**. PS-11 = final CIQ release by the **supplier** [BRM REQ-PROC-042]. PS-12 = **automatic** completion, with manual RMM completion only in exceptional cases such as cancellation [BRM REQ-PROC-045]. There are three confirmations (PS-05, PS-10, PS-11), and "none ... is presented as a Beiersdorf raw material approval" [BRM REQ-PROC-015]. Subprocess completion "is not a business approval" [BRM REQ-PROC-038]. **Conflicts with** ReqDoc PS-11/PS-12 [p.3], REQ-RMES-013/-014 (Final Safety / Final Regulatory approval, overall approval gate) [p.14], and CIA #11 / #14 (subprocess approval; final approval). Needs an explicit BDF decision |
| NEW-04 Effect of a rejected subprocess | **Reframed (Open)** | In the BRM a subprocess is **completed**, never rejected [BRM REQ-PROC-038]. Every open point blocks completion, with no blocking / non-blocking distinction [BRM REQ-PROC-036]. A non-accepted answer goes back to the supplier [BRM REQ-PROC-034]. ReqDoc REQ-RMES-013 still has Approved/Rejected. What happens when the material is technically unacceptable is not described anywhere (inferred) |
| OP-18 Shared sections | **Partial** | Lead and co-reviewing departments are configurable and versionable. Example: K2.2 has Safety as lead and QM as co-reviewer, and PS-06 task distribution follows this setup [BRM REQ-CFG-006]. All internal roles read everything; only their own area is editable [BRM REQ-PROC-019]. Not defined: whether the co-reviewer must also complete or approve |
| NEW-05 MVP scope | **Partial** | All 51 BRM requirements are "MVP". Only REQ-PROC-021 (RMES), -022 (pre-populating RMES) and -024 (AI review) are "MVP partial scope", and none is Post-MVP [BRM col H]. The internal roles are RMM, Regulatory, Safety, QM, Microbiology, Sustainability and business administrator, with **no Customs or Legal** [BRM REQ-CFG-004]. **Annex 3 (GMO) is "outside test scope"** [FLM r41; changelog r139–r140]. Teamcenter auto-fill is post-MVP (REQ-PROC-104) [FLM r3]. The FLM's field coverage (Meta Data, A1 part, A2, A4) suggests the MVP/test questionnaire slice (inferred). The section-level "In MVP?" column is still empty |
| OP-02 A4 display | **Open** | FLM A4 has MOAH concentration plus kinematic-viscosity availability and value, shown when origin = Petrochemical. There is no either/or split [FLM r53–r55]. Options were simplified versus the CIQ [changelog r177] |
| OP-03 A2 trigger | **Partial / conflicting** | ReqDoc's own origin table answers it: "Annex 2 mandatory" = Yes for Vegetable only [p.11 §5.4]. BRM example: "SF-01 = plant-based -> A2 mandatory" [BRM REQ-PROC-010]. **But** FLM v0.6 currently shows A2 **for all origins**, flagged "[Review] ... please confirm" [FLM changelog r129]. FLM also uses a single-select manufacturing process (Chemical / Physical / Enzymatic / Biotechnology-Fermentation / Other), while the CIQ uses checkboxes [FLM r38–r42; changelog r132] |
| OP-13 Integrations / B-Flow | **Answered for MVP (BRM) but contradicted elsewhere** | MVP closure means an automatic immutable PDF, **filed at the CIQ project and emailed to the RMM owner**, with no B-Flow step [BRM REQ-PROC-046]. Cases are created manually by RMM [BRM REQ-PROC-001]. Teamcenter auto-fill is post-MVP [FLM r3]. **Conflicts with** ReqDoc PS-13 B-Flow filing [p.5 §3.3.3] and the CIA Must-Haves #1.0 (Teamcenter trigger), #12 / #15 (B-Flow storage), #18 (status API to Teamcenter) and #32 (API to TC, B-Flow, SAP) |
| OP-17 Supplier-level reuse (K6.12) | **Open** | The FLM assumes supplier **master data** exists: DUNS, manufacturer, production site and contact e-mail are "auto-fill from master data" [FLM r4, r7–r9]. K6.12 is not in the FLM. CIA #24 (contact database, Nice to have) and #28–#31 (supplier structures, site qualification and approval) are related |
| NEW-06 Annex 14 limits | **Partial** | The old Feldkatalog places Annex 14 content (heavy metals, residues/limits, specific impurities, CMR) under K2.2, with BDF limits per field: As ≤ 0.5, Cd ≤ 0.1, Cr ≤ 5.0 mg/kg, "Confirmed" only if within the limit, justification on deviation [Feldkatalog r25–r29]. ReqDoc REQ-RMES-008 requires the limit and rule-set version to stay reproducible [p.13]. FLM v0.6 has no K2.2 fields. Who maintains the limit list is still open |
| NEW-07 Origin table vs triggers | **Not resolved; the FLM sides with the origin table** | FLM v0.6 repeats the origin table: Bio Mass → A1, 2, 3, 9, 10, 11, 12; Animal → A10, 11, 12; Petrochemical → A1, 4, 9, 10, 11, 12; **Mineral → A1, 7, 10, 11, 12**; Polymer → A1, 6, 10, 11, 12 [FLM r16, r17, r20, r22, r26]. Annex 1 is active for Bio Mass, Mineral, Petrochemical and Polymer [FLM r45, r48]. The older Feldkatalog had Mineral → A10–A12 only [Feldkatalog r33], so A1/A7 for mineral was a deliberate later choice (inferred). **New conflict:** CCU / Waste / Chemical recycling get "no annexes" [FLM r24, r28, r30], so A10, which ReqDoc says applies "Always" [p.8], would not be triggered for them |
| NEW-08 SF-12 / challenge test | **Open** | BRM only confirms that waiving the micro test (SF-12 / K5.1) needs a written justification [BRM REQ-PROC-012] |
| NEW-09 K5.3 owner | **Open** | Not in the BRM or FLM |
| NEW-10 K6.8 Halal trigger | **Open** | Not in the BRM or FLM. IKW p.19 shows Kosher / Halal / Vegan as plain Yes/No (industry sample only) |
| NEW-11 Customs and Legal in Part 2 | **Open (BRM hints "no")** | Customs and Legal are absent from the BRM role list [BRM REQ-CFG-004] (inferred: not reviewers in the MVP). ReqDoc: K8 "Read only for Legal" [p.8] |
| NEW-12 Own-document suppliers | **Open** | No BRM or FLM requirement covers it. Likely outside the MVP (inferred) |
| NEW-13 QM / RMM / Sustainability subprocesses | **Partial** | The BRM gives one generic pattern for all departments: auto-created review tasks for exactly the affected departments [REQ-PROC-017], parallel work [REQ-PROC-018], a department-specific scope [REQ-PROC-019], and explicit completion [REQ-PROC-038]. Department-specific boundaries and decision models are still open |
| NEW-14 Scope change after data entry | **Answered** | The scope is re-derived after a metadata or config change, with a **difference list** and notification of the affected departments [BRM REQ-CFG-008]. Data is **retained and recoverable**: answers in removed sections stay visible in the history and reactivate if the change is reverted [BRM REQ-CFG-009]. Metadata stays changeable until PS-11; a change after PS-05 is audit-trailed and triggers a scope-impact check [BRM REQ-PROC-007]. Changes in Part 2 notify the departments that use the changed source [BRM REQ-PROC-031]. Caveat: the requirement text of REQ-CFG-008 and -009 has a light-orange fill that the BRM legend does not explain. They may be recent additions or edits, so confirm they are final |
| NEW-15 Cancellation / reactivation | **Partial** | Cancellation needs a justification and ends all open tasks, including the supplier's [BRM REQ-PROC-049]. **Reactivation is not mentioned in the BRM.** The "1 year" assumption exists only in ReqDoc [p.5 §3.3.3] |
| NEW-16 Due dates / reminders / escalation | **Partial** | Every request needs a responsible person and an internal (flexible) due date, and automated notifications are configurable [BRM REQ-ADR-001]. Every task has a due date [BRM REQ-CTL-003]. Notification events are new task, query, answer, resubmission and decision [BRM REQ-CTL-010]. Reminders and escalation are configurable [ReqDoc REQ-RMES-019]. Default durations and escalation recipients are still undefined |

**B2. Config Questions**

| KB item | Verdict | Evidence |
|---|---|---|
| SF-01 single or multi / per component | **Partial (conflicting)** | FLM: **radio button (single)**, in Meta Data next to the component fields [FLM r16–r31]. Its own review note: "CIQ 2.3 allows several answers ... a radio button permits only one origin per component. Please confirm" [FLM changelog r35]. The old Feldkatalog allowed multi-select [Feldkatalog r31–r38] |
| SF-01 vs SF-03 "Polymer" overlap | **Partial** | The FLM triggers A6 from origin = Polymer and has no separate SF-03 field [FLM r26]. K4.3 is not covered |
| SF-02 additional production sites | **Contradicted** | "Only one production site (aligned with business departments) – FLD-GEN-006/-007 (further production sites) are dropped" [FLM changelog r25]. FLD-GEN-005 Production site is mandatory [FLM r9]. SF-02 was already an open point in the old catalogue [Feldkatalog r8, col O]. It conflicts with ReqDoc SF-02 [p.10] and CIA #28–#31 (site structures, qualification and approval) |
| SF-06 → A2? | **Reverse dependency in FLM** | A3 is driven *from* the A2 option "Biotechnology / Fermentation" "if GMO", and is outside the test scope [FLM r41] |
| SF-07 derivable from SF-01? | **Answered in the FLM design** | A4 is active when FLD-2.3-01 = Petrochemical. There is no SF-07 field [FLM r53–r55] |
| SF-08 only when Vegetable? | **Contradicted between BDF docs** | FLM asks "Palm (kernel) oil is used as feedstock" whenever Annex 1 is active (Bio Mass, **Mineral**, Petrochemical, Polymer). RSPO model choices are Mass Balance / Segregated / Identity Preserved / No RSPO certification [FLM r48–r49]. **But** BRM REQ-PROC-009 says that for origin "mineral" the palm/RSPO part of A1 is not shown to the supplier. RSPO Mass Balance is the minimum; "No RSPO certification" is a deviation assessed by BDF [FLM changelog r162]. The nested rule SF-01 plant-based AND SF-08 palm-based gives A1 §5 plus RSPO evidence [BRM REQ-CFG-003] |
| SF-11 who answers | **Partial** | The supplier answers the configuration questions [BRM REQ-PROC-004]. The market list and the market-to-section mapping are not addressed |
| SF-12 justification | **Answered (principle)** | BRM REQ-PROC-012 |
| SF-04, SF-05, SF-09, SF-10 | **Open** | Not in the BRM or FLM |
| BD-01 pre-filled by RMM? | **Answered** | RMM creates the case with supplier, trade name, contact and BDF owner [BRM REQ-PROC-001]. Trade name "can be pre-filled by RMM at case creation" [FLM r2]. Supplier name is mandatory, with Teamcenter auto-fill post-MVP [FLM r3]. The supplier ID is in practice the DUNS (9 digits, mandatory) [FLM r7] (inferred) |
| BD-02 "if different" | **Contradicted** | Manufacturer (name & address) is **mandatory** for every case [FLM r8] |
| BD-03, BD-05 | **Answered** | FLM r2, r10. INCI falls back to IUPAC, plus the Colour Index no. for colorants |
| BD-04 BDF material no. / IRMA ref | **Open** | No such field. The BRM only requires a unique CIQ project ID [BRM REQ-PROC-001] |
| BD-06 one or several supplier users | **Answered** | Several supplier contacts can work in parallel with per-answer attribution, and task assignment on the supplier side is the supplier's own business [BRM REQ-CTL-001]. The FLM has two e-mail fields; e-mail 1 is mandatory and drives access and notification [FLM r4–r5]. There is no contact-name field [FLM changelog r20 Review] |
| BD-xx other metadata | **Largely answered** | See NEW-02 |

**B3. Sections, Rules, Questions, Evidence**

| KB item | Verdict | Evidence |
|---|---|---|
| R-12…R-15 "verify (garbled)" | **Corroborated** | FLM v0.6 repeats the same annex lists for Animal, Mineral, Petrochemical and Polymer [FLM r17, r20, r22, r26]. BSE/TSE plus entry 419 is required for Animal [FLM r17] |
| R-16…R-18 | **Partial** | No annexes, just a free-text specification [FLM r24–r31] |
| R-xx combination logic and "optional" | **Partial** | Nested AND rules and decision trees are required [BRM REQ-CFG-003]. Mandatory / optional / N.A. classification, with the triggering rule shown per section [BRM REQ-PROC-010]. The derivation must be reproducible and log the rule-set version [BRM REQ-PROC-009]. Departments may add parts at any time [BRM REQ-ADR-002] |
| A1 "for mineral/petrochemical/polymer intended?" | **Answered (yes, per FLM)** | Annex 1 is active for Bio Mass, Mineral, Petrochemical and Polymer [FLM r45, r48] |
| A1 reviewer | **Contradicted** | The FLM "Approval" for Annex 1 fields is **Regulatory** [FLM r45–r51], versus Sustainability (KB, ReqDoc §4.3) and "Sustainability / Safety" in the old Feldkatalog [r56–r61] |
| A2 / K2.1 / K2.3 reviewers | **Contradicted** | The FLM "Approval" for Meta Data (incl. K2.1 composition and the SF-01 origin) and for the Annex 2 fields is **RMM** [FLM r7–r43]. ReqDoc has K2.1 = Regulatory and A2 = Safety (lead) [pp.6, 8]. The meaning of the FLM "Approval" column is not defined anywhere (inferred) |
| K1 generated or answered | **Partial** | Evidence is classified per project [BRM REQ-PROC-010], with an overview of uploads by chapter [BRM REQ-PROC-011]. This suggests a system-generated checklist (inferred) |
| K2.1 exact value or range / total 100% | **Partial** | Range allowed, 0–100%, min ≤ max (a "0–110%" typo was corrected) [FLM r15; changelog r32–r33]. Whether the total must reach 100% is not addressed |
| Q-007 CAS (KB: mandatory) | **Contradicted** | CAS is **optional**, validated only if filled [FLM r11]. The old catalogue had it as Muss [Feldkatalog r18] |
| Q-008 EC | **Answered** | Optional [FLM r12] |
| Q-009 Function (KB: dropdown?) | **Contradicted** | Free text, mandatory [FLM r14] |
| Q-010 Additive | **Partial** | Yes/No mandatory; follow-up fields still open [FLM r13; changelog r30] |
| Q-006…Q-012 placed in Stage 2 | **Contradicted** | The FLM places the K2.1 fields in **Meta Data (Stage 1)** [FLM r10–r15] |
| Q-095 / Q-096 (A1 feedstock and origin) | **Answered** | Feedstock is free text and mandatory (it replaces old FLD-2.1-006, and palm detection now uses FLD-A1-204) [FLM r32; changelog r123]. Part is a multi-select of 19 plant/animal parts plus "no entry" [FLM r18]. Country of origin is free text, may list several countries, and is "to be clarified" [FLM r19; changelog r41]. FLM also adds a Natural origin index (0–1) and Content % in INCI and in raw material (with a consistency check against concentration) [FLM r33–r35]. Content % should apply only if Annex 1 applies [FLM changelog r126 Review] |
| Q-099 (A2 placeholder) | **Answered (draft)** | FLD-A2-101 INCI pre-filled from FLD-2.1-001; FLD-A2-102 process type; FLD-A2-103 free text if "Other" [FLM r37–r43] |
| Q-102 MOAH unit | **Open** | "Unit not defined in CIQ (assumption: mg/kg or %)" [FLM r53]; "[Review] Clarify unit" [changelog r174] |
| Q-024…Q-026 K4.1 endpoints | **Partial** | logKow, then the endpoints acute oral, acute dermal, (blank FLD-4.1-103), skin irritation. An "attached" checkbox makes the study upload mandatory [Feldkatalog r40–r44] |
| Q-044 / A10 "Always" | **Contradicted (old catalogue)** | K6.1 offers 4 status checkboxes. "See BDF REACH questionnaire (Annex 10)" **activates Annex 10** as an extra CIQ part [Feldkatalog r46–r49, r54], which contradicts "A10 = Always" [ReqDoc p.8; KB R-00] |
| Column "N/A allowed (with justification)" (21 "?") | **Answered (general rule)** | Any mandatory field or evidence that cannot be provided stops blocking only once a written justification is given [BRM REQ-PROC-012]. In practice "N/A with justification" applies to every mandatory item |
| D-05 "Always?" | **Answered** | ≥ 2 batch reports, "Immer bei 2.2" (always at K2.2), PDF preferred [Feldkatalog r26]. Upload linked at K2.2 [BRM REQ-PROC-011] |
| D-06 (Vegetable only; Sustainability) | **Contradicted** | Only the **pesticide** analysis is modelled (Yes → upload, No → reason), for all four Annex-1 origins, with Regulatory approval. Mycotoxin is absent [FLM r45–r47] |
| D-07 | **Partial** | "Other certification" name plus certificate upload. The upload "is a BDF extension – please confirm" [FLM r50–r51; changelog r172] |
| D-08 RSPO certificate | **Gap in FLM** | RSPO is a select field with **no upload** [FLM r49]. The RSPO certificate number must appear on the CoA [FLM changelog r162] |
| D-09 / D-10 linked section "?" | **Answered** | The upload sits on Source of origin = Animal: BSE/TSE certificate plus confirmation of entry no. 419, or a BDF template [FLM r17; changelog r38] |
| D-11 mineral source | **Partial** | It is a free-text "Mineral specification" (e.g. talc, mica), not a document [FLM r23] |
| Evidence missing from KB | **New items** | Viscosity analytical data [FLM r55]; K4.1 study reports [Feldkatalog r41–r44]; SDS / company statement as REACH evidence [Feldkatalog r47–r48]; other-certification certificate [FLM r51] |

### C. Still open after the cross-check (candidate topics for the consultant call, inferred)
1. **Who approves the raw material?** The BRM model (completion + supplier release + auto-close) conflicts with ReqDoc REQ-RMES-013/-014 and CIA #11/#14 (NEW-03/NEW-04).
2. **The binding configuration table**, especially SF-11 market mapping, SF-04/05/09/10, the challenge test and K5.3 under SF-12, and the evidence and reviewers for waste/CCU/recycling (OP-19, NEW-08).
3. **Is the origin table or the specific trigger authoritative?** This covers A3, A11, A12, A1/A7 for mineral, A10 for CCU/waste/recycling, and the palm question for mineral (NEW-07; FLM vs BRM REQ-PROC-009).
4. **One origin per component, or several?** (FLM changelog r35)
5. **Production sites:** a single site in the CIQ (FLM) versus SF-02 and the CIA site-approval Must-Have.
6. **What does the FLM "Approval" column mean** (RMM / Regulatory / Safety)? How does it relate to the section-owner model and BRM REQ-CFG-006 lead / co-reviewer?
7. **MVP questionnaire slice:** does "test scope" equal the FLM coverage (Meta Data, A1, A2, A4)? Are Customs and Legal in the MVP? Who fills the "In MVP?" column?
8. **Who maintains Annex 14 / A9 limit values and reference methods**, and with what versioning (NEW-06; REQ-RMES-008)?
9. **Supplier master data:** where does it come from in the MVP (no Teamcenter until post-MVP)? Is K6.12 GMP/ISO reused across cases (OP-17)?
10. **Who authored this Knowledge Baseline, and will BDF fill in its yellow columns?** If so, Kissflow could use it as the shared Q&A log.

### D. Other shared documents
- **CIA catalogue:** the integration Must-Haves (#1.0, #12, #15, #18, #32) conflict with the "manual in MVP" reading of OP-13. #11 and #14 (approvals) bear on NEW-03. #24–#31 (contact database, supplier structures, production-site qualification and approval) bear on SF-02, BD-06 and OP-17. #4 / #19 (no-code questionnaires and authorisations) correspond to BRM REQ-CFG-001 / -004.
- **IKW 2019 sample (not BDF):** useful only as **illustrative** content for KB placeholders. It covers antimicrobial treatments (gamma/beta irradiation, moist/dry heat, ethylene oxide, electron beam) [IKW p.10]; specific micro-organisms (Candida albicans, E. coli, P. aeruginosa, S. aureus) and a preservative challenge test [IKW p.11]; contaminant lists (heavy metals, solvents, monomers, nitrosamines, mycotoxins, pesticides, PAH, CMR) [IKW pp.8–9]; and Kosher / Halal / Vegan [IKW p.19]. It must not be presented as BDF's content.
