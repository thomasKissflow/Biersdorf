# RAW DUMP: CIQ_Knowledge_Baseline.xlsx

Source: `Refrences_Shared_By_Client/CIQ_Knowledge_Baseline.xlsx` — lossless cell dump (generated). Row numbers = Excel rows.

## Sheet: Read Me  (dims A1:B24, state=visible)
- Merged: ['A4:B4', 'A16:B16', 'A2:B2', 'A15:B15', 'A7:B7', 'A11:B11', 'A10:B10', 'A5:B5', 'A13:B13', 'A14:B14', 'A1:B1', 'A9:B9', 'A8:B8', 'A3:B3', 'A6:B6', 'A12:B12']

| Row | A | B |
|---|---|---|
| 1 | CIQ Digitalization - Knowledge Baseline & Gap Sheet |  |
| 4 | Purpose |  |
| 5 | Captures everything the requirements document already states about the CIQ questionnaire, its configuration logic and section ownership, and marks what is missing so Beiersdorf can complete it. The target structure maps directly onto app fields, visibility rules and review assignments. |  |
| 7 | Tabs |  |
| 8 | Config Questions - the Stage 1 questions the supplier answers before the questionnaire is generated (SF-01..SF-12) plus proposed basic-data fields. |  |
| 9 | Sections - every CIQ chapter and annex with owner department, trigger and notes. |  |
| 10 | Config Rules - the rule set: which answer activates which section, evidence and review department. |  |
| 11 | Question Inventory - field-level list of the Stage 2 questions. Pre-filled where the document names data points; one placeholder row per section for the rest. |  |
| 12 | Evidence Documents - evidence/uploads named in the document and when they are required. |  |
| 13 | Open Points - open decisions and inconsistencies found in the document that block the build. |  |
| 15 | How to fill in |  |
| 16 | Edit only the yellow columns (Customer answer / comments / confirmation). Add new rows freely, especially in Question Inventory. The grey 'EXAMPLE' row at the top of Question Inventory shows the expected level of detail. |  |
| 18 | Status legend |  |
| 19 | From document | Stated clearly in the requirements document. |
| 20 | From document - verify | Taken from the document, but the source table was ambiguous or garbled - please verify. |
| 21 | Proposed - to confirm | Not in the document; proposed by the build team as a sensible default - please confirm or correct. |
| 22 | Missing - customer to provide | Not in the document; Beiersdorf needs to provide it. |
| 23 | Inconsistency - clarify | The document contradicts itself here - please clarify. |
| 24 | Yellow column | Beiersdorf input. |

## Sheet: Config Questions  (dims A1:K220, state=visible)
- DATA VALIDATION list on I2:I220: "From document,From document - verify,Proposed - to confirm,Missing - customer to provide,Inconsistency - clarify,Example"
- Autofilter: $A$1:$K$20

| Row | A | B | C | D | E | F | G | H | I | J | K |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | ID | Category | Question | Source in CIQ | Proposed answer type | Known answer options | Effect (per document) | Sections / evidence triggered | Status | Open questions for Beiersdorf | Customer answer |
| 2 | SF-01 | Configuration | Origin type of the components | Chapter 2.3 | Multi-select (per component?) | Vegetable; Animal; Mineral; Petrochemical; Waste or side stream; CCU; Polymer; Chemical recycling | Determines the majority of the mandatory annexes | A1, A2, A3, A4, A6, A7, A9, A10, A11, A12 and BSE/TSE evidence; no annexes for waste/side stream, CCU, chemical recycling | From document | Single or multi-select? Answered per component (K2.3 says 'per component') or once per raw material? 'Polymer' overlaps with SF-03 - which wins? Rules for waste / CCU / recycling still undefined (OP-19). |  |
| 3 | SF-02 | Configuration | Are there additional production sites? | Basic data | Yes/No + repeating site table | Yes; No | Additional site information | Site data, no annex | From document | Which fields per site (name, address, country, GMP/ISO)? |  |
| 4 | SF-03 | Configuration | Does the raw material contain polymer components or meet the REACH polymer definition? | Chapter 4.3 | Yes/No | Yes; No | Activates polymer and SPM review | K4.3, A6 | From document |  |  |
| 5 | SF-04 | Configuration | Is the material a UV filter? | Chapter 6.5 (Annex VI) | Yes/No | Yes; No | Activates the UV filter section | A5 | From document |  |  |
| 6 | SF-05 | Configuration | Is the material a colorant or a preservative? | Chapter 6.5 (Annex IV and V) | Multi-select | Colorant; Preservative; Neither | Activates substance-class annexes | A7 (colorant), A8 (preservative) | Proposed - to confirm | Document combines two questions - split into two Yes/No questions? Can a material be both? |  |
| 7 | SF-06 | Configuration | Is fermentation involved or are GMOs involved? | Annex 2 | Yes/No (or two separate Yes/No) | Yes; No | Activates the GMO section | A3 | From document | Does this also trigger Annex 2 (manufacturing process)? A2 trigger is unclear (OP-03). |  |
| 8 | SF-07 | Configuration | Is the material mineral-oil-based or a hydrocarbon? | Chapter 2.3 | Yes/No | Yes; No | Activates MOAH and PAH review | A4, A9 | From document | Is this derivable from SF-01 = Mineral/Petrochemical instead of a separate question? A4 show/hide either/or/both (OP-02). |  |
| 9 | SF-08 | Configuration | Is the feedstock palm-based? | Annex 1 | Yes/No | Yes; No | Activates mandatory RSPO information | A1 section 5, RSPO evidence | From document | Only asked when SF-01 = Vegetable? |  |
| 10 | SF-09 | Configuration | Does the raw material fall within the scope of the EUDR? | Chapter 6.17 | Yes/No | Yes; No | Activates EUDR traceability | K6.17 | From document | Can the supplier judge EUDR scope, or should it be derived from HS code (K7)? |  |
| 11 | SF-10 | Configuration | Is Brazilian genetic heritage affected? | Chapter 6.16 | Yes/No | Yes; No | Activates SisGen information | K6.16.1 | From document |  |  |
| 12 | SF-11 | Configuration | Target markets of the raw material | Basic data | Multi-select | China; USA; Canada; UK; Turkey; Others (list?) | Activates market-specific compliance sections | K6.2, K6.3, K6.13, K6.14, K6.15, A11, A12, A13 | From document | Confirm market-to-section mapping (see Config Rules). Full list of 'Others'? Who answers - supplier or Beiersdorf (target markets are a Beiersdorf fact)? Does K6.8 Halal depend on markets? |  |
| 13 | SF-12 | Configuration | Is microbiological testing required? | Chapter 5.1 | Yes/No + justification if No | Yes; No | Deactivates micro test (5.1) and challenge test with justification; total microbial count (5.2) stays mandatory | K5.1, K5.3 (per table) | Inconsistency - clarify | Table says K5.3 but K5.3 is antimicrobial treatment; the challenge test has no chapter number. Which sections are really switched off? |  |
| 14 | BD-01 | Basic data | Supplier name and supplier ID | Not specified | Lookup (supplier master) |  | Case identification | - | Proposed - to confirm | Pre-filled by RMM at case start? |  |
| 15 | BD-02 | Basic data | Manufacturer name and address (if different from supplier) | Not specified | Text |  | Case identification / K6.12 | - | Proposed - to confirm |  |  |
| 16 | BD-03 | Basic data | Trade name of the raw material | Not specified | Text |  | Case identification | - | Proposed - to confirm |  |  |
| 17 | BD-04 | Basic data | Beiersdorf material number / IRMA reference | Not specified | Text |  | Case identification | - | Proposed - to confirm | Entered by RMM at PS-01? |  |
| 18 | BD-05 | Basic data | INCI name of the raw material | Not specified | Text |  | Case identification | - | Proposed - to confirm |  |  |
| 19 | BD-06 | Basic data | Supplier contact person(s) and roles | Not specified | Repeating table |  | Task assignment | - | Proposed - to confirm | One or several supplier users? Split by topic? |  |
| 20 | BD-xx | Basic data | [Other metadata / structural data required at PS-02] | Section 3.1.2 |  |  |  |  | Missing - customer to provide | Document mentions 'metadata and structural data' but does not list them. |  |

## Sheet: Sections  (dims A1:M248, state=visible)
- DATA VALIDATION list on J2:J248: "From document,From document - verify,Proposed - to confirm,Missing - customer to provide,Inconsistency - clarify,Example"
- Autofilter: $A$1:$M$48

| Row | A | B | C | D | E | F | G | H | I | J | K | L | M |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | ID | Type | Title | Business meaning | Responsible department(s) | Lead | Applicability | Triggered by | Particularity / notes | Status | Open questions for Beiersdorf | In MVP? (Y/N) | Customer comments |
| 2 | K1 | Chapter | Mandatory documents | Checklist of all required evidence documents (SDS, CoA, specification, statements) | QM, Regulatory, RMM, Safety | QM | Always | Scope derived from config table | Frames all other chapters; list is case-specific. | From document | Is K1 a generated checklist (system output) or questions the supplier answers? |  |  |
| 3 | K2.1 | Chapter | Components and additives | Full composition per component: INCI, CAS, EC, function, additive, origin, concentration | Regulatory | Regulatory | Always (proposed) | - | Data basis for almost all later reviews. Table with any number of components. | From document | Concentration as exact value or range? Must total 100%? |  |  |
| 4 | K2.2 | Chapter | Byproducts and contaminations | Byproducts and contaminations, evidence from at least two batches | Safety, QM | Safety | Always (proposed) | - | Limits checked against Beiersdorf values in Annex 14; deviations need justification. | Inconsistency - clarify | Annex 14 was moved into the main document - where do the limit values now live and who maintains them? |  |  |
| 5 | K2.3 | Chapter | Source or type of starting materials | Origin type per component | RMM, Safety, Sustainability, Regulatory | RMM | Always (proposed) | Hosts SF-01 | Central configuration question SF-01; drives most mandatory annexes. | From document | Summary table lists K2.3 under Regulatory only - who reviews it? |  |  |
| 6 | K3 | Chapter | Storage conditions and handling | Storage conditions, shelf life, temperature | QM | QM | Always (proposed) | - | Operationally relevant for goods receipt, warehousing, production. | From document |  |  |  |
| 7 | K4.1 | Chapter | Toxicity data | Toxicological endpoints with study protocol and annex status | Safety | Safety | Always (proposed) | - | Assessment authority exclusively with Safety. | From document - verify | List of endpoints? |  |  |
| 8 | K4.2 | Chapter | Environmental effects | Biodegradability | Safety (Environmental Safety?) | Safety | Always (proposed) | - |  | From document - verify | Source table garbled - confirm owner. |  |  |
| 9 | K4.3 | Chapter | Synthetic polymer microparticles | REACH polymer definition and SPM restriction scope | Safety, Regulatory | Safety | Conditional | SF-03 | Regulatory area subject to change; Annex 6 goes into more detail. | From document - verify |  |  |  |
| 10 | K5.1 | Chapter | Microbiological test | Microbiological test of the raw material | Microbiology | Microbiology | Conditional | SF-12 | May be waived, but justification required. | From document |  |  |  |
| 11 | K5.2 | Chapter | Total microbial count | Total aerobic count, yeast and moulds, specific microorganisms | Microbiology, Safety (informed) | Microbiology | Always | - | Mandatory; stays mandatory even if SF-12 = No. | From document | Which specific microorganisms? Limits? |  |  |
| 12 | K5.x | Chapter | Challenge test | Preservation efficacy test | Microbiology? | ? | Conditional | SF-12 | Sits between 5.2 and 5.3 without its own chapter number. | Inconsistency - clarify | Treat as its own section? Owner? |  |  |
| 13 | K5.3 | Chapter | Antimicrobial treatment | Type and maximum dose of antimicrobial treatment | Safety (chapter table) / QM-Micro (summary) | ? | Always (proposed) | SF-12 (per SF table?) | Irradiation, heat, ethylene oxide. | Inconsistency - clarify | Chapter table says Safety, summary says QM/Microbiology. Is it switched off by SF-12? |  |  |
| 14 | K6.1 | Chapter | EU REACH | Registration status, Annex XIV and XVII, SVHC | Regulatory | Regulatory | Always | - | Detailed in Annex 10. | From document |  |  |  |
| 15 | K6.2 | Chapter | UK REACH | Registration status UK incl. only representative | Regulatory | Regulatory | Conditional | SF-11 = UK | Detailed in Annex 11; also relevant for indirect imports. | From document | How are indirect imports captured? |  |  |
| 16 | K6.3 | Chapter | Turkey REACH (KKDIK) | Registration status Turkey | Regulatory | Regulatory | Conditional | SF-11 = Turkey | Detailed in Annex 12. | From document |  |  |  |
| 17 | K6.4 | Chapter | Chemical inventory listings | Listing in national chemical inventories | Regulatory | Regulatory | ? | SF-11? (A13 is triggered, K6.4 not listed) | Detailed in Annex 13. | Inconsistency - clarify | Is K6.4 always shown or only with target markets? |  |  |
| 18 | K6.5 | Chapter | Regulation 1223/2009 Annexes III-VI | Cosmetics regulation annexes | Regulatory, Safety | Regulatory | Always (proposed) | - | Core provision for cosmetic usability. Hosts SF-04, SF-05. | From document |  |  |  |
| 19 | K6.6 | Chapter | Ingredients Art. 19(g) / Annex III | Ingredients relevant for labelling | Regulatory, Safety | Regulatory | Always (proposed) | - | Basis for later product labelling. | From document |  |  |  |
| 20 | K6.7 | Chapter | Animal testing (Art. 11(2)(e)) | Animal testing status | Regulatory | Regulatory | Always (proposed) | - | Evidence required; high reputational relevance and legal requirement. | From document |  |  |  |
| 21 | K6.8 | Chapter | Halal status | Halal and kosher information | Regulatory | Regulatory | ? | Market-specific - trigger not defined |  | Missing - customer to provide | Which market or answer triggers K6.8? |  |  |
| 22 | K6.9 | Chapter | Nanomaterials | Nanomaterial status incl. justification and evidence | Safety, Regulatory | Safety | Always (proposed) | - | A negative answer also requires justification. | From document |  |  |  |
| 23 | K6.10 | Chapter | Pharmacopeia | Listing in pharmacopeia monograph | QM | QM | Always (proposed) | - | Workshop note: QA. | From document |  |  |  |
| 24 | K6.11 | Chapter | Food grade status | Listing as food additive | Safety | Safety | Always (proposed) | - | Workshop note: Safety. | From document |  |  |  |
| 25 | K6.12 | Chapter | GMP compliance and ISO certification | GMP standards and ISO certificates of the manufacturer | QM | QM | Always (proposed) | - | Supplier-related, not material-related; reuse across cases (OP-17). | From document | Store at supplier level and reuse? |  |  |
| 26 | K6.13 | Chapter | China IECIC / NMPA | Listing in China inventory, NMPA code | Regulatory | Regulatory | Conditional | SF-11 = China |  | From document |  |  |  |
| 27 | K6.14 | Chapter | California Proposition 65 | Prop 65 listing incl. contaminations | Regulatory, Safety (joint) | Shared (OP-18) | Conditional | SF-11 = USA | Shared responsibility. | From document | Both approve or one leads? |  |  |
| 28 | K6.15 | Chapter | Canada Hot List | Listing on the Canada Hot List | Regulatory | Regulatory | Conditional | SF-11 = Canada |  | From document |  |  |  |
| 29 | K6.16 | Chapter | Biodiversity laws | Access and benefit sharing under national biodiversity law | Regulatory | Regulatory | Always (proposed) | - | Framing chapter; case distinctions in 6.16.1. | From document |  |  |  |
| 30 | K6.16.1 | Chapter | Brazilian Biodiversity Law | SisGen registration and exemptions | Regulatory | Regulatory | Conditional | SF-10 | Extensive case distinctions with several exemptions. | From document | Provide the exemption decision tree. |  |  |
| 31 | K6.17 | Chapter | EUDR | Scope and traceability | Regulatory, Sustainability | Unclear (OP-18) | Conditional | SF-09 | Summary lists it under Sustainability. | From document - verify | Who leads? |  |  |
| 32 | K7 | Chapter | Customs & foreign trade | HS code, country of origin, export control, CITES | Customs / Trade Compliance | Customs | Always (proposed) | - | Only section owned outside Reg/Safety/QM/Sustainability; easily overlooked. | From document | Is Customs a reviewer in Part 2? Not listed as a subprocess. |  |  |
| 33 | K8 | Chapter | Patent | Patents and licence | Legal / IP | Legal | Always (proposed) | - | Read only for Legal. | From document | Does Legal approve or only read? |  |  |
| 34 | K8.1 | Chapter | Additional patent information | Supplementary patent and licence details | Legal / IP | Legal | Conditional | Answer in K8? | Follow-up chapter to 8. | Proposed - to confirm | What in K8 triggers K8.1? |  |  |
| 35 | A1 | Annex | Vegetable origin | Feedstock, origin, traceability | Safety, Sustainability | Sustainability | Conditional | SF-01 = Vegetable; section 5 via SF-08 |  | From document - verify | Origin table also lists A1 for mineral, petrochemical, polymer - intended? |  |  |
| 36 | A2 | Annex | Manufacturing process | Manufacturing process | Regulatory, Safety | Safety | Conditional | Unclear - 'vegetable origin and ... not stated in the CIQ' | OP-03, OP-19. | Inconsistency - clarify | What triggers A2? |  |  |
| 37 | A3 | Annex | GMO | Genetically modified organisms, safety level, separation | QM / Microbiology | QM | Conditional | SF-06 (and SF-01 = Vegetable per origin table) | Workshop notes: QM (micro), evidence. | From document |  |  |  |
| 38 | A4 | Annex | Hydrocarbons | MOAH, physico-chemical data for mineral oils and waxes | Safety | Safety | Conditional | SF-07 | MVP: show/hide either/or/both (OP-02). | From document |  |  |  |
| 39 | A5 | Annex | UV filters | Approval status inside and outside the EU | Regulatory | Regulatory | Conditional | SF-04 | Workshop note: dependency? | From document |  |  |  |
| 40 | A6 | Annex | Synthetic polymers / biopolymers | Cross-linkers, monomers, molecular weight, residual monomer content | Safety, Regulatory | Safety | Conditional | SF-03 | Direct extension of chapter 4.3. | From document |  |  |  |
| 41 | A7 | Annex | Colorants | Colorant-specific information | Regulatory | Regulatory | Conditional | SF-05 = Colorant | Substance-class specific. | From document |  |  |  |
| 42 | A8 | Annex | Preservatives | Preservative-specific information | Regulatory, Safety | Regulatory | Conditional | SF-05 = Preservative | Substance-class specific. | From document |  |  |  |
| 43 | A9 | Annex | Polyaromatic hydrocarbons (PAH) | Limits and analysis for PAH | Safety | Safety | Conditional | SF-01 = Vegetable or Petrochemical; SF-07 | Contains binding Beiersdorf limits and a reference method. | From document | Provide limit values and reference method. |  |  |
| 44 | A10 | Annex | EU REACH | Substance-related REACH registration data | Regulatory | Regulatory | Always | - | Per substance, not per raw material (repeating). | From document |  |  |  |
| 45 | A11 | Annex | UK REACH | Substance-related UK REACH data incl. only representative | Regulatory | Regulatory | Conditional | SF-11 = UK | Contains a signed declaration by the supplier. | Inconsistency - clarify | Origin table lists A11 as mandatory for all origin types, contradicting SF-11 trigger. |  |  |
| 46 | A12 | Annex | Turkey REACH | Substance-related KKDIK data | Regulatory | Regulatory | Conditional | SF-11 = Turkey | Same structure as Annexes 10 and 11. | Inconsistency - clarify | Same contradiction as A11. |  |  |
| 47 | A13 | Annex | Chemical inventories | Listing status per country and inventory (Y/N/E) | Regulatory | Regulatory | Conditional | SF-11 | Workshop note: dependency? | From document | Which countries/inventories per market? |  |  |
| 48 | A14 | Annex | Moved into main document | Covered by chapter K2 | - | - | Not applicable | - |  | From document |  |  |  |

## Sheet: Config Rules  (dims A1:Z230, state=visible)
- DATA VALIDATION list on H2:H230: "From document,From document - verify,Proposed - to confirm,Missing - customer to provide,Inconsistency - clarify,Example"
- Autofilter: $A$1:$J$30

| Row | A | B | C | D | E | F | G | H | I | J |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Rule ID | Config question | Condition | Sections activated (mandatory) | Additional evidence required | Review departments activated | Source | Status | Notes / conflicts | Customer confirmation |
| 2 | R-00 | - | Always (every case) | K1, K5.2, K6.1, A10 | SDS, CoA, specification, statements (K1) | QM, Microbiology, Regulatory | Doc: 4.1, 4.2, 5.3 | From document | Only these are explicitly 'always' in the document. |  |
| 3 | R-01 | - | Always (every case) - proposed | K2.1, K2.2, K2.3, K3, K4.1, K4.2, K5.3, K6.5, K6.6, K6.7, K6.9, K6.10, K6.11, K6.12, K6.16, K7, K8 |  | Regulatory, Safety, QM, RMM, Customs, Legal | Inferred | Proposed - to confirm | Document does not say whether these are always shown. |  |
| 4 | R-10 | SF-01 | = "Vegetable" [=Vegetable] | A1, A2, A3, A9, A10, A11, A12 | Pesticide and mycotoxin analysis; sustainability certificates | Sustainability, Regulatory | Doc: 5.4 | From document | A3 and A11/A12 conflict with their own triggers (SF-06, SF-11). |  |
| 5 | R-11 | SF-01 + SF-08 | "Vegetable AND palm-based" = "Yes" | A1 section 5 | RSPO certificate with supply chain model; RSPO number on the CoA | Sustainability | Doc: 5.4 | From document |  |  |
| 6 | R-12 | SF-01 | Animal | A10, A11, A12 | BSE/TSE certificate; conformity with Annex II entry 419 | Regulatory, QM | Doc: 5.4 (garbled) | From document - verify | Row alignment in source table unclear. |  |
| 7 | R-13 | SF-01 | Mineral | A1, A7, A10, A11, A12 | Origin and specification of the mineral source | Regulatory, Safety | Doc: 5.4 (garbled) | From document - verify | A1 (vegetable) and A7 (colorants) for mineral look wrong - verify. |  |
| 8 | R-14 | SF-01 | Petrochemical | A1, A4, A9, A10, A11, A12 | MOAH value; PAH analysis against Beiersdorf limits | Safety | Doc: 5.4 (garbled) | From document - verify | Overlaps with SF-07. |  |
| 9 | R-15 | SF-01 | Polymer | A1, A6, A10, A11, A12 | Residual monomer content; SPM scope statement | Safety, Regulatory | Doc: 5.4 | From document - verify | Overlaps with SF-03. |  |
| 10 | R-16 | SF-01 | Waste or side stream | None derived | To be defined | To be defined | Doc: 5.4 | Missing - customer to provide | OP-19 |  |
| 11 | R-17 | SF-01 | CCU | None derived | To be defined | To be defined | Doc: 5.4 | Missing - customer to provide | OP-19 |  |
| 12 | R-18 | SF-01 | Chemical recycling of post-consumer plastic | None derived | To be defined | To be defined | Doc: 5.4 | Missing - customer to provide | OP-19 |  |
| 13 | R-20 | SF-02 | Yes | Site data (no annex) |  | - | Doc: 5.3 | From document |  |  |
| 14 | R-30 | SF-03 | Yes | K4.3, A6 |  | Safety, Regulatory | Doc: 5.3 | From document |  |  |
| 15 | R-40 | SF-04 | Yes | A5 |  | Regulatory | Doc: 5.3 | From document |  |  |
| 16 | R-50 | SF-05 | Colorant | A7 |  | Regulatory | Doc: 5.3 | From document |  |  |
| 17 | R-51 | SF-05 | Preservative | A8 |  | Regulatory, Safety | Doc: 5.3 | From document |  |  |
| 18 | R-60 | SF-06 | Yes | A3 |  | QM / Microbiology | Doc: 5.3 | From document | Also A2? |  |
| 19 | R-70 | SF-07 | Yes | A4, A9 |  | Safety | Doc: 5.3 | From document |  |  |
| 20 | R-80 | SF-08 | Yes | A1 section 5 | RSPO evidence | Sustainability | Doc: 5.3 | From document |  |  |
| 21 | R-90 | SF-09 | Yes | K6.17 |  | Regulatory, Sustainability | Doc: 5.3 | From document |  |  |
| 22 | R-100 | SF-10 | Yes | K6.16.1 |  | Regulatory | Doc: 5.3 | From document |  |  |
| 23 | R-110 | SF-11 | includes UK | K6.2, A11 |  | Regulatory | Proposed split of doc 5.3 | Proposed - to confirm |  |  |
| 24 | R-111 | SF-11 | includes Turkey | K6.3, A12 |  | Regulatory | Proposed split of doc 5.3 | Proposed - to confirm |  |  |
| 25 | R-112 | SF-11 | includes China | K6.13 |  | Regulatory | Proposed split of doc 5.3 | Proposed - to confirm |  |  |
| 26 | R-113 | SF-11 | includes USA | K6.14 |  | Regulatory, Safety | Proposed split of doc 5.3 | Proposed - to confirm |  |  |
| 27 | R-114 | SF-11 | includes Canada | K6.15 |  | Regulatory | Proposed split of doc 5.3 | Proposed - to confirm |  |  |
| 28 | R-115 | SF-11 | any market selected | A13 (and K6.4?) |  | Regulatory | Proposed split of doc 5.3 | Proposed - to confirm | Which inventories per market? |  |
| 29 | R-120 | SF-12 | No | K5.1 and challenge test NOT applicable (justification mandatory); K5.2 stays mandatory | Justification | Microbiology | Doc: 5.3 | Inconsistency - clarify | Table also lists K5.3 - clarify. |  |
| 30 | R-xx |  | [Combination rules / exclusions] |  |  |  |  | Missing - customer to provide | Is it simple OR logic (any trigger = mandatory)? Any rules that make a section optional rather than mandatory? |  |

### Formulas
- C4: = "Vegetable" => Vegetable

## Sheet: Question Inventory  (dims A1:N320, state=visible)
- DATA VALIDATION list on M2:M320: "From document,From document - verify,Proposed - to confirm,Missing - customer to provide,Inconsistency - clarify,Example"
- Autofilter: $A$1:$N$120

| Row | A | B | C | D | E | F | G | H | I | J | K | L | M | N |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Q-ID | Section | Question / field | Answer type | Options / unit | Mandatory | Repeating (table) | Show when | N/A allowed (with justification) | Evidence upload | Reviewing department | Visible to supplier | Status | Customer comments |
| 2 | EXAMPLE | K3 - Storage conditions and handling | Recommended storage temperature | Range (min-max) | degC | Yes | No | Always | No | No | QM | Yes | Example | Use this level of detail for every question |
| 3 | Q-001 | K1 - Mandatory documents | SDS upload | File |  | Yes | No | Section visible | No | Yes | QM | Yes | From document |  |
| 4 | Q-002 | K1 - Mandatory documents | Certificate of Analysis (CoA) upload | File |  | Yes | No | Section visible | No | Yes | QM | Yes | From document |  |
| 5 | Q-003 | K1 - Mandatory documents | Specification upload | File |  | Yes | No | Section visible | No | Yes | QM | Yes | From document |  |
| 6 | Q-004 | K1 - Mandatory documents | Statements upload (which statements?) | File |  | ? | ? | Section visible | ? | Yes | QM | Yes | Proposed - to confirm |  |
| 7 | Q-005 | K1 - Mandatory documents | [Remaining questions of this section - please add rows] |  |  |  |  |  |  |  | QM | Yes | Missing - customer to provide |  |
| 8 | Q-006 | K2.1 - Components and additives | INCI name | Text |  | Yes | Yes - per component | Section visible | No | No | Regulatory | Yes | From document |  |
| 9 | Q-007 | K2.1 - Components and additives | CAS number | Text (format check) |  | Yes | Yes - per component | Section visible | ? | No | Regulatory | Yes | Proposed - to confirm |  |
| 10 | Q-008 | K2.1 - Components and additives | EC number | Text (format check) |  | ? | Yes - per component | Section visible | ? | No | Regulatory | Yes | Proposed - to confirm |  |
| 11 | Q-009 | K2.1 - Components and additives | Function | Dropdown? |  | Yes | Yes - per component | Section visible | No | No | Regulatory | Yes | Proposed - to confirm |  |
| 12 | Q-010 | K2.1 - Components and additives | Additive | Yes/No |  | Yes | Yes - per component | Section visible | No | No | Regulatory | Yes | From document |  |
| 13 | Q-011 | K2.1 - Components and additives | Origin | Dropdown (= SF-01 values?) |  | Yes | Yes - per component | Section visible | No | No | Regulatory | Yes | Proposed - to confirm |  |
| 14 | Q-012 | K2.1 - Components and additives | Concentration | Number or range | % | Yes | Yes - per component | Section visible | No | No | Regulatory | Yes | From document |  |
| 15 | Q-013 | K2.1 - Components and additives | [Remaining questions of this section - please add rows] |  |  |  |  |  |  |  | Regulatory | Yes | Missing - customer to provide |  |
| 16 | Q-014 | K2.2 - Byproducts and contaminations | Byproduct / contaminant | Text |  | ? | Yes | Section visible | ? | No | Safety | Yes | Proposed - to confirm |  |
| 17 | Q-015 | K2.2 - Byproducts and contaminations | Measured value batch 1 / batch 2 | Number | unit? | Yes | Yes | Section visible | No | Yes (analysis) | Safety | Yes | Proposed - to confirm |  |
| 18 | Q-016 | K2.2 - Byproducts and contaminations | Justification for deviation from Beiersdorf limit | Long text |  | If value > limit | Yes | Value > limit | No | No | Safety | Yes | From document |  |
| 19 | Q-017 | K2.2 - Byproducts and contaminations | [Remaining questions of this section - please add rows] |  |  |  |  |  |  |  | Safety | Yes | Missing - customer to provide |  |
| 20 | Q-018 | K2.3 - Source or type of starting materials | Origin type per component | Dropdown | SF-01 values | Yes | Yes - per component | Section visible | No | No | RMM | Yes | From document |  |
| 21 | Q-019 | K2.3 - Source or type of starting materials | [Remaining questions of this section - please add rows] |  |  |  |  |  |  |  | RMM | Yes | Missing - customer to provide |  |
| 22 | Q-020 | K3 - Storage conditions and handling | Storage conditions | Long text |  | Yes | No | Section visible | No | No | QM | Yes | From document |  |
| 23 | Q-021 | K3 - Storage conditions and handling | Shelf life | Number | months | Yes | No | Section visible | No | No | QM | Yes | From document |  |
| 24 | Q-022 | K3 - Storage conditions and handling | Storage temperature | Range | degC | Yes | No | Section visible | No | No | QM | Yes | From document |  |
| 25 | Q-023 | K3 - Storage conditions and handling | [Remaining questions of this section - please add rows] |  |  |  |  |  |  |  | QM | Yes | Missing - customer to provide |  |
| 26 | Q-024 | K4.1 - Toxicity data | Toxicological endpoint | Dropdown | endpoint list? | ? | Yes - per endpoint | Section visible | ? | No | Safety | Yes | Proposed - to confirm |  |
| 27 | Q-025 | K4.1 - Toxicity data | Study protocol / result | Text + file |  | ? | Yes - per endpoint | Section visible | ? | Yes | Safety | Yes | Proposed - to confirm |  |
| 28 | Q-026 | K4.1 - Toxicity data | Annex status | Dropdown? |  | ? | Yes - per endpoint | Section visible | ? | No | Safety | Yes | Proposed - to confirm |  |
| 29 | Q-027 | K4.1 - Toxicity data | [Remaining questions of this section - please add rows] |  |  |  |  |  |  |  | Safety | Yes | Missing - customer to provide |  |
| 30 | Q-028 | K4.2 - Environmental effects | Biodegradability | Dropdown + value? |  | ? | No | Section visible | ? | ? | Safety | Yes | Proposed - to confirm |  |
| 31 | Q-029 | K4.2 - Environmental effects | [Remaining questions of this section - please add rows] |  |  |  |  |  |  |  | Safety | Yes | Missing - customer to provide |  |
| 32 | Q-030 | K4.3 - Synthetic polymer microparticles | Meets REACH polymer definition | Yes/No |  | Yes | No | SF-03 = Yes | No | No | Safety | Yes | From document |  |
| 33 | Q-031 | K4.3 - Synthetic polymer microparticles | In scope of SPM restriction | Yes/No + justification |  | Yes | No | SF-03 = Yes | No | ? | Safety | Yes | Proposed - to confirm |  |
| 34 | Q-032 | K4.3 - Synthetic polymer microparticles | [Remaining questions of this section - please add rows] |  |  |  |  |  |  |  | Safety | Yes | Missing - customer to provide |  |
| 35 | Q-033 | K5.1 - Microbiological test | Microbiological test result | Text + file |  | Yes | No | SF-12 = Yes | Yes | Yes | Microbiology | Yes | From document |  |
| 36 | Q-034 | K5.1 - Microbiological test | Justification for waiving the test | Long text |  | If waived | No | SF-12 = No | - | No | Microbiology | Yes | From document |  |
| 37 | Q-035 | K5.1 - Microbiological test | [Remaining questions of this section - please add rows] |  |  |  |  |  |  |  | Microbiology | Yes | Missing - customer to provide |  |
| 38 | Q-036 | K5.2 - Total microbial count | Total aerobic count | Number | CFU/g | Yes | No | Section visible | No | ? | Microbiology | Yes | Proposed - to confirm |  |
| 39 | Q-037 | K5.2 - Total microbial count | Yeast and moulds | Number | CFU/g | Yes | No | Section visible | No | ? | Microbiology | Yes | Proposed - to confirm |  |
| 40 | Q-038 | K5.2 - Total microbial count | Specific microorganisms | Absent/Present per organism | list? | Yes | Yes - per organism | Section visible | No | ? | Microbiology | Yes | Proposed - to confirm |  |
| 41 | Q-039 | K5.2 - Total microbial count | [Remaining questions of this section - please add rows] |  |  |  |  |  |  |  | Microbiology | Yes | Missing - customer to provide |  |
| 42 | Q-040 | K5.x - Challenge test | [Remaining questions of this section - please add rows] |  |  |  |  |  |  |  | ? | Yes | Missing - customer to provide |  |
| 43 | Q-041 | K5.3 - Antimicrobial treatment | Type of antimicrobial treatment | Multi-select | Irradiation; Heat; Ethylene oxide; None | Yes | No | Section visible | No | No | ? | Yes | From document |  |
| 44 | Q-042 | K5.3 - Antimicrobial treatment | Maximum dose | Number | unit per type? | If treated | No | Treatment <> None | No | No | ? | Yes | Proposed - to confirm |  |
| 45 | Q-043 | K5.3 - Antimicrobial treatment | [Remaining questions of this section - please add rows] |  |  |  |  |  |  |  | ? | Yes | Missing - customer to provide |  |
| 46 | Q-044 | K6.1 - EU REACH | EU REACH registration status | Dropdown |  | Yes | Per substance (A10) | Section visible | No | ? | Regulatory | Yes | Proposed - to confirm |  |
| 47 | Q-045 | K6.1 - EU REACH | Listed in REACH Annex XIV / XVII | Yes/No |  | Yes | Per substance | Section visible | No | No | Regulatory | Yes | From document |  |
| 48 | Q-046 | K6.1 - EU REACH | Contains SVHC | Yes/No |  | Yes | Per substance | Section visible | No | No | Regulatory | Yes | From document |  |
| 49 | Q-047 | K6.1 - EU REACH | [Remaining questions of this section - please add rows] |  |  |  |  |  |  |  | Regulatory | Yes | Missing - customer to provide |  |
| 50 | Q-048 | K6.2 - UK REACH | UK REACH registration status | Dropdown |  | Yes | Per substance (A11) | SF-11 = UK | No | No | Regulatory | Yes | From document |  |
| 51 | Q-049 | K6.2 - UK REACH | Only representative | Text |  | ? | No | SF-11 = UK | ? | No | Regulatory | Yes | Proposed - to confirm |  |
| 52 | Q-050 | K6.2 - UK REACH | [Remaining questions of this section - please add rows] |  |  |  |  |  |  |  | Regulatory | Yes | Missing - customer to provide |  |
| 53 | Q-051 | K6.3 - Turkey REACH (KKDIK) | KKDIK registration status | Dropdown |  | Yes | Per substance (A12) | SF-11 = Turkey | No | No | Regulatory | Yes | From document |  |
| 54 | Q-052 | K6.3 - Turkey REACH (KKDIK) | [Remaining questions of this section - please add rows] |  |  |  |  |  |  |  | Regulatory | Yes | Missing - customer to provide |  |
| 55 | Q-053 | K6.4 - Chemical inventory listings | Listed in national chemical inventories | Per country Y/N/E |  | ? | Per country (A13) | SF-11? | ? | No | Regulatory | Yes | Proposed - to confirm |  |
| 56 | Q-054 | K6.4 - Chemical inventory listings | [Remaining questions of this section - please add rows] |  |  |  |  |  |  |  | Regulatory | Yes | Missing - customer to provide |  |
| 57 | Q-055 | K6.5 - Regulation 1223/2009 Annexes III-VI | Status under Annexes III-VI of Reg. 1223/2009 | Dropdown per annex |  | Yes | ? | Section visible | No | No | Regulatory | Yes | Proposed - to confirm |  |
| 58 | Q-056 | K6.5 - Regulation 1223/2009 Annexes III-VI | [Remaining questions of this section - please add rows] |  |  |  |  |  |  |  | Regulatory | Yes | Missing - customer to provide |  |
| 59 | Q-057 | K6.6 - Ingredients Art. 19(g) / Annex III | Contains labelling-relevant ingredients (Art. 19(g) / Annex III) | Yes/No + list |  | Yes | ? | Section visible | No | No | Regulatory | Yes | Proposed - to confirm |  |
| 60 | Q-058 | K6.6 - Ingredients Art. 19(g) / Annex III | [Remaining questions of this section - please add rows] |  |  |  |  |  |  |  | Regulatory | Yes | Missing - customer to provide |  |
| 61 | Q-059 | K6.7 - Animal testing (Art. 11(2)(e)) | Animal testing status | Dropdown |  | Yes | No | Section visible | No | Yes | Regulatory | Yes | From document |  |
| 62 | Q-060 | K6.7 - Animal testing (Art. 11(2)(e)) | [Remaining questions of this section - please add rows] |  |  |  |  |  |  |  | Regulatory | Yes | Missing - customer to provide |  |
| 63 | Q-061 | K6.8 - Halal status | Halal status | Dropdown |  | ? | No | ? | ? | Yes (certificate?) | Regulatory | Yes | Proposed - to confirm |  |
| 64 | Q-062 | K6.8 - Halal status | Kosher status | Dropdown |  | ? | No | ? | ? | Yes (certificate?) | Regulatory | Yes | Proposed - to confirm |  |
| 65 | Q-063 | K6.8 - Halal status | [Remaining questions of this section - please add rows] |  |  |  |  |  |  |  | Regulatory | Yes | Missing - customer to provide |  |
| 66 | Q-064 | K6.9 - Nanomaterials | Nanomaterial (Yes/No) | Yes/No |  | Yes | No | Section visible | No | Yes | Safety | Yes | From document |  |
| 67 | Q-065 | K6.9 - Nanomaterials | Justification (required for Yes and No) | Long text |  | Yes | No | Section visible | No | No | Safety | Yes | From document |  |
| 68 | Q-066 | K6.9 - Nanomaterials | [Remaining questions of this section - please add rows] |  |  |  |  |  |  |  | Safety | Yes | Missing - customer to provide |  |
| 69 | Q-067 | K6.10 - Pharmacopeia | Listed in pharmacopeia monograph (which) | Yes/No + text |  | ? | No | Section visible | ? | ? | QM | Yes | Proposed - to confirm |  |
| 70 | Q-068 | K6.10 - Pharmacopeia | [Remaining questions of this section - please add rows] |  |  |  |  |  |  |  | QM | Yes | Missing - customer to provide |  |
| 71 | Q-069 | K6.11 - Food grade status | Listed as food additive / food grade | Yes/No + text |  | ? | No | Section visible | ? | ? | Safety | Yes | Proposed - to confirm |  |
| 72 | Q-070 | K6.11 - Food grade status | [Remaining questions of this section - please add rows] |  |  |  |  |  |  |  | Safety | Yes | Missing - customer to provide |  |
| 73 | Q-071 | K6.12 - GMP compliance and ISO certification | GMP standard applied | Dropdown |  | ? | No | Section visible | ? | Yes | QM | Yes | Proposed - to confirm |  |
| 74 | Q-072 | K6.12 - GMP compliance and ISO certification | ISO certificates | File + expiry date |  | ? | Yes | Section visible | ? | Yes | QM | Yes | Proposed - to confirm |  |
| 75 | Q-073 | K6.12 - GMP compliance and ISO certification | [Remaining questions of this section - please add rows] |  |  |  |  |  |  |  | QM | Yes | Missing - customer to provide |  |
| 76 | Q-074 | K6.13 - China IECIC / NMPA | Listed in IECIC | Yes/No |  | Yes | No | SF-11 = China | No | No | Regulatory | Yes | From document |  |
| 77 | Q-075 | K6.13 - China IECIC / NMPA | NMPA code | Text |  | ? | No | SF-11 = China | ? | No | Regulatory | Yes | Proposed - to confirm |  |
| 78 | Q-076 | K6.13 - China IECIC / NMPA | [Remaining questions of this section - please add rows] |  |  |  |  |  |  |  | Regulatory | Yes | Missing - customer to provide |  |
| 79 | Q-077 | K6.14 - California Proposition 65 | Prop 65 listed substances incl. contaminations | Yes/No + list |  | Yes | Yes | SF-11 = USA | No | No | Shared (OP-18) | Yes | From document |  |
| 80 | Q-078 | K6.14 - California Proposition 65 | [Remaining questions of this section - please add rows] |  |  |  |  |  |  |  | Shared (OP-18) | Yes | Missing - customer to provide |  |
| 81 | Q-079 | K6.15 - Canada Hot List | Listed on Canada Hot List | Yes/No |  | Yes | No | SF-11 = Canada | No | No | Regulatory | Yes | From document |  |
| 82 | Q-080 | K6.15 - Canada Hot List | [Remaining questions of this section - please add rows] |  |  |  |  |  |  |  | Regulatory | Yes | Missing - customer to provide |  |
| 83 | Q-081 | K6.16 - Biodiversity laws | Access and benefit sharing applicable | Yes/No |  | Yes | No | Section visible | No | ? | Regulatory | Yes | Proposed - to confirm |  |
| 84 | Q-082 | K6.16 - Biodiversity laws | [Remaining questions of this section - please add rows] |  |  |  |  |  |  |  | Regulatory | Yes | Missing - customer to provide |  |
| 85 | Q-083 | K6.16.1 - Brazilian Biodiversity Law | SisGen registration / exemption | Dropdown + number |  | Yes | No | SF-10 = Yes | No | Yes | Regulatory | Yes | From document |  |
| 86 | Q-084 | K6.16.1 - Brazilian Biodiversity Law | [Remaining questions of this section - please add rows] |  |  |  |  |  |  |  | Regulatory | Yes | Missing - customer to provide |  |
| 87 | Q-085 | K6.17 - EUDR | EUDR scope / traceability data | ? |  | Yes | ? | SF-09 = Yes | No | ? | Unclear (OP-18) | Yes | Proposed - to confirm |  |
| 88 | Q-086 | K6.17 - EUDR | [Remaining questions of this section - please add rows] |  |  |  |  |  |  |  | Unclear (OP-18) | Yes | Missing - customer to provide |  |
| 89 | Q-087 | K7 - Customs & foreign trade | HS code | Text |  | Yes | No | Section visible | No | No | Customs | Yes | From document |  |
| 90 | Q-088 | K7 - Customs & foreign trade | Country of origin | Country list |  | Yes | No | Section visible | No | No | Customs | Yes | From document |  |
| 91 | Q-089 | K7 - Customs & foreign trade | Export control classification | Text |  | ? | No | Section visible | ? | No | Customs | Yes | Proposed - to confirm |  |
| 92 | Q-090 | K7 - Customs & foreign trade | CITES relevant | Yes/No |  | ? | No | Section visible | ? | ? | Customs | Yes | Proposed - to confirm |  |
| 93 | Q-091 | K7 - Customs & foreign trade | [Remaining questions of this section - please add rows] |  |  |  |  |  |  |  | Customs | Yes | Missing - customer to provide |  |
| 94 | Q-092 | K8 - Patent | Patents and licences | Long text |  | ? | ? | Section visible | ? | ? | Legal | Yes | Proposed - to confirm |  |
| 95 | Q-093 | K8 - Patent | [Remaining questions of this section - please add rows] |  |  |  |  |  |  |  | Legal | Yes | Missing - customer to provide |  |
| 96 | Q-094 | K8.1 - Additional patent information | [Remaining questions of this section - please add rows] |  |  |  |  |  |  |  | Legal | Yes | Missing - customer to provide |  |
| 97 | Q-095 | A1 - Vegetable origin | Feedstock / plant species | Text |  | Yes | ? | SF-01 = Vegetable | No | ? | Sustainability | Yes | Proposed - to confirm |  |
| 98 | Q-096 | A1 - Vegetable origin | Geographic origin / traceability | Text |  | Yes | ? | SF-01 = Vegetable | No | ? | Sustainability | Yes | Proposed - to confirm |  |
| 99 | Q-097 | A1 - Vegetable origin | RSPO supply chain model, RSPO number (section 5) | Dropdown + text |  | Yes | No | SF-08 = Yes | No | Yes | Sustainability | Yes | From document |  |
| 100 | Q-098 | A1 - Vegetable origin | [Remaining questions of this section - please add rows] |  |  |  |  |  |  |  | Sustainability | Yes | Missing - customer to provide |  |
| 101 | Q-099 | A2 - Manufacturing process | [Remaining questions of this section - please add rows] |  |  |  |  |  |  |  | Safety | Yes | Missing - customer to provide |  |
| 102 | Q-100 | A3 - GMO | GMO involved / safety level / separation | Structured |  | Yes | No | SF-06 = Yes | No | Yes | QM | Yes | From document |  |
| 103 | Q-101 | A3 - GMO | [Remaining questions of this section - please add rows] |  |  |  |  |  |  |  | QM | Yes | Missing - customer to provide |  |
| 104 | Q-102 | A4 - Hydrocarbons | MOAH value | Number | mg/kg? | Yes | No | SF-07 = Yes | No | Yes | Safety | Yes | Proposed - to confirm |  |
| 105 | Q-103 | A4 - Hydrocarbons | [Remaining questions of this section - please add rows] |  |  |  |  |  |  |  | Safety | Yes | Missing - customer to provide |  |
| 106 | Q-104 | A5 - UV filters | UV filter approval status EU / non-EU | Per market |  | Yes | Yes | SF-04 = Yes | No | ? | Regulatory | Yes | Proposed - to confirm |  |
| 107 | Q-105 | A5 - UV filters | [Remaining questions of this section - please add rows] |  |  |  |  |  |  |  | Regulatory | Yes | Missing - customer to provide |  |
| 108 | Q-106 | A6 - Synthetic polymers / biopolymers | Cross-linkers / monomers / molecular weight / residual monomer content | Structured |  | Yes | Yes | SF-03 = Yes | No | ? | Safety | Yes | Proposed - to confirm |  |
| 109 | Q-107 | A6 - Synthetic polymers / biopolymers | [Remaining questions of this section - please add rows] |  |  |  |  |  |  |  | Safety | Yes | Missing - customer to provide |  |
| 110 | Q-108 | A7 - Colorants | [Remaining questions of this section - please add rows] |  |  |  |  |  |  |  | Regulatory | Yes | Missing - customer to provide |  |
| 111 | Q-109 | A8 - Preservatives | [Remaining questions of this section - please add rows] |  |  |  |  |  |  |  | Regulatory | Yes | Missing - customer to provide |  |
| 112 | Q-110 | A9 - Polyaromatic hydrocarbons (PAH) | PAH values against Beiersdorf limits | Number per PAH | mg/kg? | Yes | Yes - per PAH | SF-07 or SF-01 | No | Yes | Safety | Yes | Proposed - to confirm |  |
| 113 | Q-111 | A9 - Polyaromatic hydrocarbons (PAH) | [Remaining questions of this section - please add rows] |  |  |  |  |  |  |  | Safety | Yes | Missing - customer to provide |  |
| 114 | Q-112 | A10 - EU REACH | REACH registration number per substance | Text |  | Yes | Yes - per substance | Section visible | ? | No | Regulatory | Yes | Proposed - to confirm |  |
| 115 | Q-113 | A10 - EU REACH | [Remaining questions of this section - please add rows] |  |  |  |  |  |  |  | Regulatory | Yes | Missing - customer to provide |  |
| 116 | Q-114 | A11 - UK REACH | Signed supplier declaration | File (signed) |  | Yes | No | SF-11 = UK | No | Yes | Regulatory | Yes | From document |  |
| 117 | Q-115 | A11 - UK REACH | [Remaining questions of this section - please add rows] |  |  |  |  |  |  |  | Regulatory | Yes | Missing - customer to provide |  |
| 118 | Q-116 | A12 - Turkey REACH | [Remaining questions of this section - please add rows] |  |  |  |  |  |  |  | Regulatory | Yes | Missing - customer to provide |  |
| 119 | Q-117 | A13 - Chemical inventories | Listing status per country and inventory | Y / N / E |  | Yes | Yes - per country | SF-11 | No | No | Regulatory | Yes | From document |  |
| 120 | Q-118 | A13 - Chemical inventories | [Remaining questions of this section - please add rows] |  |  |  |  |  |  |  | Regulatory | Yes | Missing - customer to provide |  |

## Sheet: Evidence Documents  (dims A1:I222, state=visible)
- DATA VALIDATION list on G2:G222: "From document,From document - verify,Proposed - to confirm,Missing - customer to provide,Inconsistency - clarify,Example"
- Autofilter: $A$1:$I$22

| Row | A | B | C | D | E | F | G | H | I |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Doc ID | Document | Required when | Linked section | Reviewing department | Source | Status | Notes | Customer comments |
| 2 | D-01 | Safety Data Sheet (SDS) | Always | K1 | QM / Regulatory / Safety | Doc 4.1 | From document | Validity / max age? |  |
| 3 | D-02 | Certificate of Analysis (CoA) | Always | K1 | QM | Doc 4.1 | From document | RSPO number must appear on CoA when palm-based. |  |
| 4 | D-03 | Specification | Always | K1 | QM | Doc 4.1 | From document |  |  |
| 5 | D-04 | Statements (which?) | Always? | K1 | ? | Doc 4.1 | Missing - customer to provide | List of standard statements needed. |  |
| 6 | D-05 | Batch analyses (min. 2 batches) for byproducts/contaminations | Always? | K2.2 | Safety, QM | Doc 4.1 | From document |  |  |
| 7 | D-06 | Pesticide and mycotoxin analysis | SF-01 = Vegetable | A1 | Sustainability, Regulatory | Doc 5.4 | From document |  |  |
| 8 | D-07 | Sustainability certificates | SF-01 = Vegetable | A1 | Sustainability | Doc 5.4 | From document | Which certificates? |  |
| 9 | D-08 | RSPO certificate with supply chain model | SF-08 = Yes | A1 section 5 | Sustainability | Doc 5.4 | From document |  |  |
| 10 | D-09 | BSE/TSE certificate | SF-01 = Animal | ? | Regulatory, QM | Doc 5.3/5.4 | From document |  |  |
| 11 | D-10 | Conformity with Annex II entry 419 (Reg. 1223/2009) | SF-01 = Animal | K6.5? | Regulatory | Doc 5.4 | From document |  |  |
| 12 | D-11 | Origin and specification of the mineral source | SF-01 = Mineral | ? | Regulatory, Safety | Doc 5.4 | From document - verify |  |  |
| 13 | D-12 | MOAH value | SF-01 = Petrochemical / SF-07 | A4 | Safety | Doc 5.4 | From document |  |  |
| 14 | D-13 | PAH analysis against Beiersdorf limits | SF-01 = Petrochemical / SF-07 | A9 | Safety | Doc 5.4 | From document |  |  |
| 15 | D-14 | Residual monomer content | SF-01 = Polymer / SF-03 | A6 | Safety | Doc 5.4 | From document |  |  |
| 16 | D-15 | SPM scope statement | SF-01 = Polymer / SF-03 | K4.3 | Safety, Regulatory | Doc 5.4 | From document |  |  |
| 17 | D-16 | Animal testing evidence | Always | K6.7 | Regulatory | Doc 4.1 | From document |  |  |
| 18 | D-17 | Nanomaterial evidence | Always | K6.9 | Safety | Doc 4.1 | From document |  |  |
| 19 | D-18 | GMP / ISO certificates of the manufacturer | Always? | K6.12 | QM | Doc 4.1 | From document | Reuse across cases (OP-17). |  |
| 20 | D-19 | UK REACH signed supplier declaration | SF-11 = UK | A11 | Regulatory | Doc 4.2 | From document | Template? |  |
| 21 | D-20 | Microbiological test report | SF-12 = Yes | K5.1 | Microbiology | Doc 4.1 | Proposed - to confirm |  |  |
| 22 | D-xx | [Other evidence documents] |  |  |  |  | Missing - customer to provide | Full evidence list per section needed. |  |

## Sheet: Open Points  (dims A1:H23, state=visible)
- Autofilter: $A$1:$H$23

| Row | A | B | C | D | E | F | G | H |
|---|---|---|---|---|---|---|---|---|
| 1 | ID | Topic | Description | Impact on app build | Source | Priority | Beiersdorf owner | Decision / answer |
| 2 | OP-19 | Configuration questions & rules | Configuration questions are a draft; binding configuration table to be collected with departments. Waste/CCU/recycling rules undefined. | Blocks the scope engine - core of the app. | Doc 5.3/5.4 | High |  |  |
| 3 | NEW-01 | CIQ question inventory | The document lists chapters but not the individual questions, answer types, validations or evidence per question. | Blocks form design for Stage 2. | Gap | High |  |  |
| 4 | NEW-02 | Stage 1 metadata fields | 'Metadata and structural data' at PS-02 are not listed beyond SF-01..SF-12. | Blocks initial supplier form. | Doc 3.1.2 | High |  |  |
| 5 | NEW-03 | Overall approver (PS-12) | Responsible role for overall CIQ approval is 'to be decided'. | Blocks approval workflow. | Doc 2.1 | High |  |  |
| 6 | NEW-04 | Effect of a rejected subprocess | Effect of one rejected subprocess on the overall case is open. | Blocks approval workflow. | Doc 3.3.2 | High |  |  |
| 7 | OP-18 | Shared sections | K2.2, K6.14, K6.17: both departments approve or one leads? | Review task assignment. | Doc 4.3 | High |  |  |
| 8 | NEW-05 | MVP scope | Which subprocesses (RMES, QM, RMM, Sustainability, Customs, Legal) and sections are in the MVP? | Sizing and release plan. | Gap | High |  |  |
| 9 | OP-02 | Annex 4 display | Show/hide A4 parts either/or/both in MVP. | Visibility rules in A4. | Doc 4.2 | Medium |  |  |
| 10 | OP-03 | Annex 2 trigger | What triggers the manufacturing-process annex? | Scope rule. | Doc 4.2 | Medium |  |  |
| 11 | OP-13 | Integrations | Teamcenter, B-Flow, SAP MDG scope per target system open; out of scope 2026, but PS-13 files to B-Flow. | Final filing step - manual in MVP? | Doc 1.1 / 3.3.3 | Medium |  |  |
| 12 | OP-17 | Supplier-level data reuse | GMP/ISO (K6.12) relates to supplier; reuse across cases. | Supplier master vs case data model. | Doc 4.1 | Medium |  |  |
| 13 | NEW-06 | Annex 14 references | K2.2 checks limits against Annex 14, but A14 was moved into the main document. | Where limit values are stored. | Doc 4.1 / 4.2 | Medium |  |  |
| 14 | NEW-07 | Origin table vs triggers | Origin table makes A3, A11, A12 mandatory for vegetable (and A11/A12 for all origins), contradicting SF-06/SF-11 triggers. A1/A7 appear for mineral. | Rule conflicts. | Doc 5.4 | Medium |  |  |
| 15 | NEW-08 | SF-12 / challenge test | SF-12 lists K5.1, K5.3; K5.3 is antimicrobial treatment and challenge test has no chapter number. | Micro section design. | Doc 5.3 | Medium |  |  |
| 16 | NEW-09 | K5.3 owner | Chapter table says Safety; summary says QM/Microbiology. | Review assignment. | Doc 4.1 / 4.3 | Low |  |  |
| 17 | NEW-10 | K6.8 Halal trigger | Market-specific but no trigger defined. | Scope rule. | Doc 4.1 | Low |  |  |
| 18 | NEW-11 | Customs & Legal in Part 2 | K7 and K8 have owners but no review subprocess is described. | Review subprocess list. | Doc 3.2 / 4.3 | Medium |  |  |
| 19 | NEW-12 | Own-document suppliers | Suppliers who upload their own documents instead of the CIQ need a separate process. | In MVP or not? | Doc 3.1.4 | Medium |  |  |
| 20 | NEW-13 | QM, RMM, Sustainability subprocesses | Boundaries, entry criteria and decision models open; Sustainability uses a separate questionnaire. | Subprocess design. | Doc 3.2.4-3.2.6 | Medium |  |  |
| 21 | NEW-14 | Scope change after data entry | How data in sections that fall out of scope is handled (hide, archive, delete). | Data handling rules. | Doc 5.2 | Medium |  |  |
| 22 | NEW-15 | Cancellation / reactivation period | Assumption 1 year, to be confirmed. | Case lifecycle. | Doc 3.3.3 | Low |  |  |
| 23 | NEW-16 | Due dates, reminders, escalation | Default due dates and escalation recipients per task type not defined. | Notification configuration. | Doc 3.4 / REQ-RMES-019 | Low |  |  |
