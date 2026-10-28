# 06 - Edge cases: data, configuration, security/confidentiality, audit/compliance, non-functional

This is discovery analysis only, and nothing is being built yet. It was prepared on 2026-10-05 for the first clarification call with BDF's consultant.
Lens: what can go wrong, or what is still undefined, in the data model, the configuration rule engine, template management, confidentiality, the audit trail, retention and non-functional behaviour. Process-flow edge cases are covered in other analysis files.

---

## 0. How to read this document

**Sources.** The codes are the same as in `00-glossary.md`. All seven dumps in `context/raw/` were read in full.

| Code | File | Citation form used here |
|---|---|---|
| ReqDoc | `CIQ Business process requirements MVP_ v2.0.pdf` (14 p., owner A. Pevzner, 16 Sep 2026) | `[ReqDoc p.N §x]` |
| BRM | `CIQ_Business_Requirements_Matrix_MVP.xlsx` | `[BRM REQ-ID]` |
| FLM | `CIQ_Field_Level_Requirements_Matrix_v0.6_EN.xlsx` | `[FLM rN FLD-ID]` = sheet 'CIQ new version' row N; `[FLM changelog rN]` = 'Notes & change log'; `[Feldkatalog rN]` = old German sheet |
| KB | `CIQ_Knowledge_Baseline.xlsx` (gap sheet, origin uncertain) | `[KB ConfigQuestions SF-xx]`, `[KB ConfigRules R-xx]`, `[KB Sections Kx]`, `[KB QI Q-xxx]`, `[KB Evidence D-xx]`, `[KB OpenPoints xx]` |
| CIA | Functional screening catalogue, **with Kissflow's submitted answers** | `[CIA #n]` |
| VQ | Non-functional screening questionnaire, **with Kissflow's submitted answers** | `[VQ 'Sub-area']` |
| IKW | IKW 2019 industry questionnaire (**not** Beiersdorf's) | `[IKW p.N]` |

**Tags.**
- A plain sentence with a citation is **STATED** in the documents.
- **(inferred)** marks our reasoning or general domain knowledge. Verify it before relying on it.
- **Undefined** means no shared document covers the point.
- KB statuses "Proposed - to confirm" were proposed "by the build team" [KB ReadMe r21]. Treat KB rules such as R-01 and R-110…R-115 as **vendor proposals, not BDF statements**.

**Severity scale.**

| Severity | Meaning |
|---|---|
| **Critical** | Could produce a wrong safety or regulatory outcome, a leak of internal content to a supplier, or audit evidence that cannot be defended. Could also force a redesign of the core data model if decided late. |
| **High** | Likely to cause rework, a failed BDF acceptance test, or a significant compliance or usability gap. A decision is needed before the MVP build. |
| **Medium** | Needs a decision, but a safe default exists that we can propose. |
| **Low** | Polish. Can be decided during the build. |

**Item format.** Each item has: **Scenario**, **Docs**, **Proposed default** (always our proposal, so inferred), **Risk** and **Ask**. The Ask is phrased for the consultant, who is business-side but fine with light technical questions. The area is the section heading.

**Cell colours that matter here** (they are not in the dumps):
- BRM requirement text for REQ-CFG-008, REQ-CFG-009, REQ-PROC-020 and REQ-PROC-024 has a light-orange fill that the legend does not explain. These may be recently added or changed, so it is worth asking.
- REQ-PROC-021, -022 and -024 are "MVP partial scope".
- No requirement is marked Post-MVP.

---

## 1. Top 15 (bring these to the call)

| # | ID | Edge case | Sev. | Why it matters | Question for the consultant |
|---|---|---|---|---|---|
| 1 | E-D-01 | No combination logic is defined for rules: OR vs AND, which outcome wins (mandatory, optional or N/A), and how contradictions are handled | Critical | Two builds of "the same" table can return different scopes. Under-scoping hides mandatory safety annexes. | "When two rules disagree about a section (one says mandatory, one says not needed), which wins? Do any rules make a section *optional*?" |
| 2 | E-D-06 | Origin per component or per raw material, single or multi-select. Blends need the union of annexes. | Critical | This is the core data-model decision. FLM v0.6 uses a single radio button while CIQ 2.3 allows several answers. | "Is the origin answered once per raw material or per component? Does a blend get the annexes of *all* its origins? Is there a minimum % below which a component is ignored?" |
| 3 | E-D-03 | A mineral oil entered as origin "Mineral" means MOAH (A4) and PAH (A9) never appear | Critical | In FLM, A4 is tied only to "Petrochemical". SF-07 does not exist in FLM. | "For mineral oils and waxes, should MOAH/PAH be triggered by SF-07, by 'petrochemical', or both? What if the supplier picks 'mineral'?" |
| 4 | E-D-07 | Waste/side-stream, CCU and chemical recycling derive **no** annexes, no evidence and no reviewer. There is no "microorganism/other" origin. | High | The case could be released with almost no origin-specific scope. This is BDF's own open point OP-19. | "Until OP-19 is decided, may RMM confirm the scope manually for these origins? Do you need 'microorganism/biotech' or 'other'?" |
| 5 | E-D-18 / E-D-19 | Rule-set versioning: which version is used when a case is re-derived, and what happens when a rule is corrected while cases are in flight | Critical | Reproducibility and corrections pull in opposite directions. Auditors must be able to see why a section was or was not required. | "If a rule turns out to be wrong, should running cases stay on the old rule or be moved to the corrected one, and who decides?" |
| 6 | E-D-21 / E-D-22 / E-D-23 | Re-derivation removes or restores a section that already holds data. A Part-2 scope change activates a new department after others have finished. | High | Undefined: whether hidden data is submitted, printed or reported, whether open queries on removed sections still block, and how this interacts with the "single supplier notification" rule. | "If a section drops out after the supplier filled it, should that data be kept but excluded from submission and the PDF? What happens to open questions on it?" |
| 7 | E-D-74 | Internal content can leak to suppliers through e-mails, history/timeline, statuses, dashboards, PDFs, attachments, comments and AI output | Critical | BDF tests this explicitly with a supplier role [REQ-RMES-015, REQ-CTL-002]. | "Besides comments and findings, is anything else strictly internal, e.g. reviewer names, department status, due dates, cancellation reasons?" |
| 8 | E-D-77 / E-D-78 | Supplier boundaries are unclear: consultants serving several suppliers, corporate groups, distributor vs manufacturer, and a manufacturer hiding its composition from the distributor | Critical | "Supplier sees only their own cases" needs a definition of *who the supplier is*. The composition is the supplier's trade secret. | "Who exactly is 'the supplier': the distributor, the manufacturer or the group? Must a manufacturer be able to give its composition to BDF without the distributor seeing it?" |
| 9 | E-D-41 / E-D-53 | MOAH unit undefined ("mg/kg or %"). Limit values are hard-coded in the old field catalogue and their home (Annex 14) was dissolved. | Critical | A factor of 10,000 between the two units. REQ-RMES-008 requires the limit *and* the rule-set version to stay reproducible. | "Which unit must suppliers use for MOAH and other contaminants? Who maintains BDF limits, and can you share the current list?" |
| 10 | E-D-85 | The audit trail must link each decision to the **source version** and **rule-set version**, not just record "field changed by X" | Critical | A generic platform log does not record this on its own. Our submitted answers promise an immutable audit trail [CIA #9, #11; VQ 'Audit trail and timestamps']. | "Will auditors also want to know who *viewed* a document? Should changes to rules and permissions be part of the audit trail?" |
| 11 | E-D-67 | What the supplier may edit in Part 2, how that reopens completed reviews, and races with completion or release | High | Metadata stays changeable until PS-11 [REQ-PROC-007]. Changes must reopen or be confirmed as no-impact [REQ-RMES-012]. | "In the review phase, can the supplier change anything, or only what BDF has asked about?" |
| 12 | E-D-59 / E-D-60 | Document model: one certificate used in several places vs "linked exclusively to this question", and replacing a document that was already reviewed | High | SDS (K1 and K6.1), RSPO number on the CoA, ISO certificates. Version fixing at PS-05. | "If one certificate answers several questions, upload once and link, or upload at each question?" |
| 13 | E-D-87 / E-D-86 | No native retention or legal-hold support (our own answer), B-Flow integration out of scope for 2026, and GDPR erasure vs immutable audit | High | The tool becomes the system of record without archive rules. | "How long must CIQ records be kept? Until the B-Flow interface exists, is a manual upload of the final package acceptable?" |
| 14 | E-D-97 | Several supplier contacts editing the same CIQ at the same time | High | This is an explicit acceptance test [REQ-CTL-001]. Whole-record saves could overwrite (inferred internal design risk). | "Do several supplier colleagues fill in one questionnaire at the same time, even the same section?" |
| 15 | E-D-32 / E-D-102 | Business admins edit rules and templates without IT, and changes are promoted from test to production | High | One bad rule edit affects every new case. The client goal is "build once, runs for years". | "Who owns rules and templates after go-live? Should a second person approve changes, and must they be tested in a test environment first?" |

---

## 2. Configuration rule engine (scope derivation)

### E-D-01 · Rule combination semantics and precedence · **Critical**
- **Scenario:** SF-01 = Petrochemical, SF-07 = No, SF-03 = Yes, SF-12 = No. Several rules hit the same section with different outcomes: one rule makes it mandatory, another says not applicable, and none defines "optional". There are 8 origin values that may be multi-select and 12 questions, so a full "every valid combination" table is not maintainable (inferred).
- **Docs:**
  - Scope is classified as mandatory, optional or N/A [ReqDoc p.10 §5.2].
  - The table "maps every valid combination of answers" [ReqDoc p.11 §5.4], but it is only a structural illustration that is not business-approved [ReqDoc p.11 §5.4].
  - Nested if-then conditions or decision trees are required [BRM REQ-CFG-003].
  - The KB asks whether this is simple OR logic and whether any rule makes a section optional [KB ConfigRules R-xx]. No shared rule yields "optional".
- **Proposed default:**
  - Write rules as atomic conditions, not a combination matrix.
  - Final class = the strictest outcome (Mandatory > Optional > N/A).
  - A "deactivate" rule wins only if it is explicitly flagged as an exclusion and carries a justification.
  - Any conflict between mandatory and N/A is listed to RMM before release.
- **Risk:** Under-scoping (a missing safety annex) or over-scoping (supplier burden). The competitor will interpret the rules differently.
- **Ask:** "When two rules disagree about a section, which wins? Can you give one example where a section should be *optional* rather than mandatory?"

### E-D-02 · SF-01 "Polymer" vs SF-03 polymer question · **High**
- **Scenario:**
  - (a) SF-01 = Polymer but SF-03 = No.
  - (b) SF-03 = Yes but SF-01 = Vegetable (a biopolymer).
  - In case (a), the origin table requires an SPM scope statement while K4.3 (SPM), which would host it, is triggered only by SF-03 (inferred).
- **Docs:**
  - Polymer origin triggers A1, A6, A10–A12 plus a residual-monomer and SPM statement [ReqDoc p.11 §5.4].
  - SF-03 triggers K4.3 and A6 [ReqDoc p.10 §5.3]. A6 is triggered by "Polymer (SF-03)" [ReqDoc p.8 §4.2].
  - The KB asks which one wins [KB ConfigQuestions SF-01; KB ConfigRules R-15].
  - FLM drives Annex 6 only from FLD-2.3-01 = Polymer and has no SF-03 field [FLM r26 FLD-2.3-01].
- **Proposed default:** Treat "polymer" as a property (SF-03), not an origin. If both are kept, use the union and block the contradiction (SF-01 = Polymer with SF-03 = No) until the supplier resolves it.
- **Risk:** Microplastics (SPM) review is missed, or records contradict each other.
- **Ask:** "Is 'polymer' an origin or a property of the material? If origin = polymer but the REACH polymer answer is 'no', should the system stop the supplier?"

### E-D-03 · A mineral oil entered as "Mineral" means MOAH/PAH are missed · **Critical**
- **Scenario:** For paraffinum liquidum, petrolatum or waxes, the supplier picks "Mineral" ("mineral oil") instead of "Petrochemical". In FLM, Annex 4 (MOAH) is active only for Petrochemical, and Mineral triggers Annex 1, 7, 10, 11 and 12. A4 and A9 never appear.
- **Docs:**
  - A4 is triggered by "Mineral-oil-based (SF-07)" and A9 by "Vegetable or petrochemical origin (SF-01, SF-07)" [ReqDoc p.8 §4.2].
  - SF-07 asks whether the material is mineral-oil-based or a hydrocarbon [ReqDoc p.10 §5.3].
  - FLD-A4-101 is controlled by Petrochemical only [FLM r53 FLD-A4-101].
  - The Mineral examples are "talc, mica" [FLM r23 FLD-2.3-12] and the Fossil examples are "oil, wax, gas" [FLM r21 FLD-2.3-11].
  - FLM has no SF-07 field. The KB asks whether SF-07 can be derived from SF-01 [KB ConfigQuestions SF-07]. A4 show/hide is either/or/both (OP-02) [ReqDoc p.8; KB OpenPoints OP-02].
- **Proposed default:** SF-07 is a mandatory explicit yes/no for every material, with help-text examples. A4/A9 = SF-07 OR SF-01 includes Petrochemical. Optionally, a plausibility warning on typical mineral-oil INCI names (inferred).
- **Risk:** MOAH/PAH are contaminants with "binding Beiersdorf limits" [ReqDoc p.8 A9]. A product-safety and reputational exposure.
- **Ask:** "For mineral oils and waxes, should MOAH and PAH be triggered by the separate SF-07 question, by 'petrochemical', or both? What should happen if a supplier picks 'mineral' for a mineral oil?"

### E-D-04 · The origin table makes "conditional" annexes unconditional · **High**
- **Scenario:** A vegetable material for the EU only gets A3 (GMO), A11 (UK REACH) and A12 (Turkey REACH) as mandatory, even though their own triggers are SF-06 and SF-11. Conversely, FLM gives CCU, waste and recycling "no annexes" at all, so A10, which should be "Always", is also missing.
- **Docs:**
  - Origin rows [ReqDoc p.11-12 §5.4].
  - A3 is triggered by SF-06, A10 is "Always", A11 and A12 by the UK and Turkey markets (SF-11) [ReqDoc p.8-9 §4.2].
  - KB flags the conflict [KB OpenPoints NEW-07; KB Sections A11, A12] and has A10 always [KB ConfigRules R-00].
  - FLM follows the origin table [FLM r16 FLD-2.3-01], and CCU, waste and recycling get no annexes [FLM r24, r28, r30].
  - The old catalogue activates A10 by a checkbox in K6.1 [Feldkatalog r49 FLD-6.1-004].
- **Proposed default:** Origin rows drive only origin-specific annexes. Market annexes come only from SF-11. A10 is always shown.
- **Risk:** Large over-scoping for suppliers, or A10 is missing for novel origins.
- **Ask:** "Is the origin table meant to override the individual triggers? Does an EU-only vegetable material really need the UK and Turkey REACH annexes?"

### E-D-05 · Nested AND vs single trigger for palm/RSPO, and where SF-08 lives · **High**
- **Scenario:** SF-08 (palm) = Yes but SF-01 ≠ Vegetable. Rule R-11 (AND) does not fire. Rule R-80 (SF-08 alone) does.
- **Docs:**
  - The BRM acceptance example is "SF-01 plant-based AND SF-08 palm-based" giving A1 section 5 plus RSPO [BRM REQ-CFG-003]. In the ReqDoc, SF-08 alone activates them [ReqDoc p.10 §5.3].
  - The KB holds both rules [KB ConfigRules R-11, R-80] and asks whether the question is only asked for vegetable [KB ConfigQuestions SF-08].
  - FLM puts the palm question inside Annex 1 (FLD-A1-204), shown when Annex 1 is active for Bio Mass, Mineral, Petrochemical *or* Polymer [FLM r48 FLD-A1-204]. That contradicts the BRM acceptance that for "mineral" the palm/RSPO part of A1 is not visible [BRM REQ-PROC-009].
  - "No RSPO certification" is a deviation for BDF to assess [FLM changelog r162].
- **Proposed default:** Ask the palm question at the metadata step whenever any component is of vegetable origin. Use a single trigger (OR) for RSPO evidence.
- **Risk:** Palm-derived materials escape RSPO and EUDR checks. Sustainability has "high external impact (EUDR, RSPO)" [ReqDoc p.9 §4.3].
- **Ask:** "Should the palm question be asked in the first metadata step, so it drives scope, or only inside Annex 1? Should 'palm = yes' always trigger the RSPO part?"

### E-D-06 · Per-component vs per-material origin, and the union of annexes · **Critical**
- **Scenario:** A blend of 70% vegetable oil, 29% petrochemical ester, 1% synthetic preservative and 0.1% tocopherol (vegetable). Is origin answered once or per component? Is the scope the union? Does a 0.1% additive trigger the full vegetable annex set?
- **Docs:**
  - K2.3 is "Origin type per component" [ReqDoc p.6 §4.1]. SF-01 is "Origin type of the components" [ReqDoc p.10].
  - FLD-2.3-01 is a radio button [FLM r16–r30]. The review note says CIQ 2.3 allows several answers but a radio permits one [FLM changelog r35]. The old catalogue had 8 checkboxes, "Mehrfachauswahl möglich" (multiple selection possible) [Feldkatalog r31–r38].
  - The KB asks single vs multi and per component vs per material [KB ConfigQuestions SF-01; KB QI Q-018].
  - A1 rows are auto-generated per K2.1 component [Feldkatalog r61]. FLM moved composition fields into "Meta Data" without defining a repeatable table [FLM r10–r15; cf. Feldkatalog r24].
  - The IKW template is per main component, with pages copied for multi-component systems [IKW p.2], and lists origin types incl. microorganism and other [IKW p.4].
- **Proposed default:** Origin is captured per component (multi-select per row). Scope = union across components. Substance-specific annexes (A1, A10) repeat per component. No concentration threshold unless BDF defines one.
- **Risk:** This is the scope engine's central data-model decision. Getting it wrong late means a redesign.
- **Ask:** "Is the origin answered once per raw material or per component? Should a blend get the annexes of all its origins? Is there a minimum concentration below which a component's origin is ignored?"

### E-D-07 · Undefined or missing origins (waste, CCU, chemical recycling, microorganism, other) · **High**
- **Scenario:** A chemically recycled feedstock derives no annex, no evidence and no reviewing department, so the case is released with only "always" sections. A fermentation-derived material has no fitting SF-01 value.
- **Docs:**
  - There are no annexes for waste, CCU and chemical recycling [ReqDoc p.10 SF-01]. Evidence and department are "To be defined (OP-19)" [ReqDoc p.11-12 §5.4].
  - FLM gives these "no annexes" plus a free-text specification [FLM r24–r31]. The KB marks them as missing [KB ConfigRules R-16–R-18] and OP-19 as high priority [KB OpenPoints OP-19].
  - The IKW template offers "Microorganism" and "Other" [IKW p.4]. BDF covers fermentation only via SF-06 and FLD-A2-102 [ReqDoc p.10; FLM r41].
- **Proposed default:** These origins set a "manual scope confirmation required" flag. RMM or a department must confirm or extend the scope before release. The ReqDoc already has a department look at the derived scope before release [ReqDoc p.10 §5.2]. Use REQ-CFG-007 for extensions.
- **Risk:** Under-scoping for novel feedstocks: recycled plastics may carry contaminants (inferred), and sustainability claims go unchecked.
- **Ask:** "For waste, CCU and chemically recycled origins, who reviews and what evidence is needed? Until that's decided, may RMM confirm the scope manually? Do you need 'microorganism/biotech' or 'other' as options?"

### E-D-08 · Deactivating rules and "optional" outcomes (SF-12) · **High**
- **Scenario:** The supplier answers "micro testing not required" and K5.1 plus the challenge test switch off. Who decides that? What if a department had added K5.1 manually?
- **Docs:**
  - SF-12 deactivates K5.1 and the challenge test with a justification. K5.2 stays mandatory. The "sections" column lists K5.1 and K5.3 [ReqDoc p.11 §5.3].
  - K5.3 is antimicrobial treatment [ReqDoc p.7]. The challenge test has no chapter number [ReqDoc p.6 K5.2]. The KB flags this [KB OpenPoints NEW-08].
  - The waiver justification is enforced [BRM REQ-PROC-012 acceptance].
- **Proposed default:** The default is "required". "No" needs a justification and auto-creates an open point for Microbiology to accept. A deactivation never removes a manual department extension.
- **Risk:** The supplier self-waives a hygiene-critical test (a conflict of interest).
- **Ask:** "Who decides that micro testing is not required, the supplier or BDF Microbiology? Exactly which sections are switched off: K5.1 and the challenge test, or also K5.3?"

### E-D-09 · Scope changes triggered from inside the questionnaire (during PS-04) · **High**
- **Scenario:** The supplier ticks "See BDF REACH questionnaire (Annex 10)" in K6.1, or picks "Biotechnology/Fermentation" in Annex 2 while SF-06 = No. Whole annexes appear after the scope was released, outside the PS-03 rule engine.
- **Docs:**
  - Model: metadata, then derivation, then release [ReqDoc p.9-10 §5.2].
  - In-form triggers:
    - FLD-6.1-004 activates Annex 10 "as an additional CIQ part", with a system state and rule justification [Feldkatalog r49, r54].
    - FLD-A2-102 Fermentation leads to Annex 3 "if GMO" [FLM r41].
    - The palm chain [FLM r48–r51].
    - The tox "attached" checkbox makes an upload mandatory [Feldkatalog r41–r44].
  - These cite REQ-ADR-003, which is not in the BRM [Feldkatalog r49].
- **Proposed default:** Separate (a) field show/hide inside a released section, which is live and not versioned, from (b) section activation, which always goes through the rule engine and is logged with the rule version.
- **Risk:** Sections activated outside the engine escape rule-set versioning and the logging required by REQ-PROC-009.
- **Ask:** "Can answers inside the questionnaire add whole annexes after release, for example 'fermentation' or 'see Annex 10'? Should those additions follow the same configuration table so they are traceable?"

### E-D-10 · "Don't know" answers to configuration questions · **Medium**
- **Scenario:** The supplier cannot judge "meets the REACH polymer definition" (SF-03) or "within EUDR scope" (SF-09).
- **Docs:** The questions require regulatory judgement [ReqDoc p.10 §5.3]. The KB asks whether EUDR scope should be derived from the HS code [KB ConfigQuestions SF-09]. Handling of "unknown" is **undefined**.
- **Proposed default:** Allow "Not sure" only where BDF agrees. Treat it as "Yes" (conservative) and create an open point for the responsible department.
- **Risk:** Suppliers guess "No" to reduce effort, which under-scopes.
- **Ask:** "May suppliers answer 'not sure' to the technical configuration questions? If so, should the system assume 'yes' and let BDF decide?"

### E-D-11 · Rule outcomes that over-scope · **Medium**
- **Scenario:**
  - Mineral triggers A1 ("Vegetable origin") and A7 (colorants).
  - The pesticide analysis question is active for mineral, petrochemical and polymer.
  - A2 shows for all origins.
  - A1-103/104 and Feedstock are mandatory for all origins.
- **Docs:**
  - Origin table, Mineral row [ReqDoc p.11]. A1 title [ReqDoc p.8]. The KB says the A1/A7 rules for mineral look wrong [KB ConfigRules R-13].
  - Pesticides are controlled by Bio Mass, Mineral, Petrochemical or Polymer [FLM r45 FLD-A1-201].
  - Review notes say A2 is shown for all origins [FLM changelog r129] and A1-103/104 are mandatory for all origins [FLM changelog r126–r127]. Feedstock is mandatory [FLM r32 FLD-A1-102].
  - (inferred) Some mineral pigments are colorants, so Mineral → A7 may be partly intended. SF-05 already covers colorants.
- **Proposed default:** Configure as stated, but every over-scoped item gets an "N/A with justification" path [BRM REQ-PROC-012].
- **Risk:** Supplier frustration pushes suppliers towards "upload own documents", a separate process [ReqDoc p.4 §3.1.4].
- **Ask:** "Should a mineral or petrochemical material really get the vegetable-origin annex and a pesticide question? Is A1 meant as a general 'feedstock' annex?"

### E-D-12 · Sections with no defined trigger · **Medium**
- **Scenario:** The engine cannot decide K6.4 (inventories), K6.8 (Halal), K8.1, A2 or the challenge test.
- **Docs:**
  - K6.4 vs A13 [KB Sections K6.4]. Halal is "market-specific" with no trigger [ReqDoc p.7; KB OpenPoints NEW-10].
  - K8.1 trigger [KB Sections K8.1]. A2 trigger (OP-03) [ReqDoc p.8; KB OpenPoints OP-03].
  - The "always" list in R-01 is a KB proposal [KB ConfigRules R-01].
- **Proposed default:** Show these as "Always" until BDF decides, and mark them as provisional.
- **Risk:** The rule table ships with silent gaps.
- **Ask:** "What triggers K6.4, Halal (K6.8), K8.1 and Annex 2? Until decided, is 'always shown' acceptable?"

### E-D-13 · SF-11 target markets: who answers, and markets added later · **High**
- **Scenario:** The supplier does not know BDF's target markets. BDF later launches in a new market after approval.
- **Docs:**
  - SF-11 lists "China, USA, Canada, UK, Turkey and others" [ReqDoc p.11].
  - The KB asks who answers (target markets are a BDF fact) and what "Others" contains [KB ConfigQuestions SF-11]. The market-to-section split is a KB proposal [KB ConfigRules R-110–R-115].
  - K6.2 is also relevant for indirect imports [ReqDoc p.7].
- **Proposed default:** RMM pre-fills and owns SF-11 at case start. The market list is maintained master data. A later market is added via an additional CIQ part [BRM REQ-ADR-002], or via a new case after the CIQ is frozen.
- **Risk:** Wrong or missing market compliance sections, and RMM reworks cases.
- **Ask:** "Who knows the target markets, the supplier or BDF? What happens when BDF adds a market after the CIQ is complete?"

### E-D-14 · Consistency between answers (EUDR, palm, HS code) · **Medium**
- **Scenario:** Palm = Yes but EUDR = No. HS code (K7) suggests a different EUDR scope.
- **Docs:** SF-09 [ReqDoc p.10]. The KB asks whether EUDR scope can be derived from the HS code [KB ConfigQuestions SF-09]. Sustainability leads K6.17 [ReqDoc p.8]. (inferred) Palm oil is an EUDR commodity, but some derivatives may be out of scope, so this is not a hard rule.
- **Proposed default:** No hard blocks. Show plausibility warnings to the reviewer only.
- **Risk:** EUDR obligations are missed.
- **Ask:** "Can the supplier reliably judge EUDR scope, or should BDF Sustainability decide based on HS code and feedstock?"

### E-D-15 · Combined configuration questions (SF-05, SF-06) · **Low**
- **Scenario:** A material that is both colorant and preservative. "Fermentation **or** GMO" mixes two facts.
- **Docs:** SF-05 and SF-06 [ReqDoc p.10]. The KB proposes a split [KB ConfigQuestions SF-05, SF-06]. Fermentation also appears as an option in FLD-A2-102 [FLM r41]. The IKW template asks GMO separately [IKW p.5].
- **Proposed default:** Split into four yes/no questions.
- **Risk:** Ambiguous rules and an unclear audit trail.
- **Ask:** "Can we split 'colorant or preservative' and 'fermentation or GMO' into separate yes/no questions?"

### E-D-16 · Which department reviews: two (or three) sources of truth · **High**
- **Scenario:** The rule table says "Reviewing department: Sustainability, Regulatory" for vegetable materials. The section-responsibility map says A1 belongs to Sustainability and A2 to Safety (lead). The FLM field-level "Approval" column says A1 fields belong to Regulatory. A department gets no task for an in-scope section, or a task for nothing.
- **Docs:**
  - The origin table has a reviewing-department column [ReqDoc p.11 §5.4]. The section map is configurable, versionable, with lead and co-reviewers [BRM REQ-CFG-006].
  - Activation follows scope and "controlled assignment rules" [ReqDoc p.4 §3.2.1], and exactly the affected departments receive tasks [BRM REQ-PROC-017].
  - FLM gives A1 fields "Approval: Regulatory" [FLM r45–r51] vs A1 → Sustainability and Safety [ReqDoc p.8; p.9 §4.3]. K2.1-type fields are "Approval: RMM" [FLM r10–r15] vs K2.1 → Regulatory [ReqDoc p.6].
  - Shared sections are open (OP-18) [ReqDoc p.9 §4.3]. Customs and Legal have no subprocess [KB OpenPoints NEW-11].
- **Proposed default:** Departments are derived only from in-scope sections and the section map, which is the single source. The rule table column is documentation only.
- **Risk:** Missing or duplicate review tasks, and a "single supplier notification" sent too early.
- **Ask:** "Is the department column in the configuration table binding, or does the section-ownership list decide? What does the 'Approval' column in the field matrix mean: a per-field approver?"

### E-D-17 · Manual scope adjustment: extend only, or extend and reduce · **High**
- **Scenario:** A department extends the scope with A4, then the supplier changes SF-01 and re-derivation runs. Does the manual A4 stay? Can a department remove a mandatory section?
- **Docs:** The ReqDoc allows "extend or reduce" [ReqDoc p.10 §5.2]. The BRM allows only extension, with a justification [BRM REQ-CFG-007]. Additional parts can be added at any time [BRM REQ-ADR-002]. RMES applicability can be overridden with a reason [ReqDoc p.13 REQ-RMES-004].
- **Proposed default:** Manual overrides are stored separately from rule outcomes and survive re-derivation. Reductions, if allowed, need a justification and a named role, and are shown in the audit trail and the final PDF.
- **Risk:** Overrides are silently lost, or mandatory content is removed without trace.
- **Ask:** "Can a department remove a section the rules made mandatory, or only add? If the supplier later changes an answer, should manual additions stay?"

### E-D-18 · Rule-set versioning and reproducibility · **Critical**
- **Scenario:** Six months later an auditor asks why A9 was not required for case X.
- **Docs:**
  - A changed rule creates a new version, and cases keep their version [BRM REQ-CFG-003]. The same metadata and version give the same result, and the version is logged on the case [BRM REQ-PROC-009].
  - Limit and rule-set version must be reproducible [ReqDoc p.13 REQ-RMES-008]. The auditor reconstructs "against which source and rule-set version" [ReqDoc p.14 REQ-RMES-016].
- **Proposed default:** Store a derivation record per event: timestamp, rule-set version, input answers, per-section outcome with the rule IDs that fired, and overrides. Evaluation must be deterministic and independent of order.
- **Risk:** Rules built only as form visibility conditions are not versioned data, so reproducibility fails (inferred, internal design note).
- **Ask:** "Is it enough to show which rule version and which rules produced the scope, or must auditors be able to re-run the old rules?"

### E-D-19 · A rule is corrected while cases are in flight · **High**
- **Scenario:** Rule version v3 misses A9 for vegetable oils, and 40 cases run on v3. One supplier changes SF-11. Re-derive with v3 (consistent but wrong) or v4 (correct but inconsistent)?
- **Docs:** Existing cases keep their version [BRM REQ-CFG-003]. No retroactive changes [BRM REQ-CFG-001]. Re-derivation happens on metadata change [BRM REQ-CFG-008]. Which version re-derivation uses is **undefined**.
- **Proposed default:** Re-derivation uses the case's pinned version. An admin can migrate selected cases to a newer version with a diff preview and justification (audited). A "safety-relevant correction" flag forces a migration review.
- **Risk:** Known-wrong scopes persist, or reproducibility breaks.
- **Ask:** "If a rule turns out to be wrong, should running cases stay on the old rule or move to the corrected one, and who decides?"

### E-D-20 · Configuration integrity across versions · **High**
- **Scenario:** Template v5 deactivates A13 while rule set v7 still activates A13. The section map has no owner for a new section. A rule cycle exists, where a section is activated by an answer inside itself.
- **Docs:** Rules must reference SF questions and sections/evidence [BRM REQ-CFG-003]. The template is versioned [BRM REQ-CFG-001]. The section map is versioned [BRM REQ-CFG-006]. Compatibility between these three versioned configurations is **undefined**.
- **Proposed default:** Publishing validates that every rule target exists and is active, every in-scope section has an owner, and there are no cycles or conflicts. Rules, template and section map are released together as one "configuration release".
- **Risk:** Broken scopes in production after an innocent template change.
- **Ask:** "Should questionnaire, rule and department-assignment changes be released together as one package, or independently?"

### E-D-21 · Re-derivation removes a section that already holds data · **High**
- **Scenario:** The supplier filled A4 and uploaded a MOAH report, then changed SF-01, and A4 is no longer in scope. Undefined:
  - Is the A4 data submitted at PS-05?
  - Is it printed in the final PDF?
  - Does it appear in search and analytics?
  - Is it visible to reviewers?
  - Do open queries or findings on A4 still block completion [BRM REQ-PROC-036]?
- **Docs:**
  - Data entered is "not discarded silently" [ReqDoc p.10 §5.2].
  - Removed answers stay visible in history and become active again on revert [BRM REQ-CFG-009]. A difference list is shown and departments are notified [BRM REQ-CFG-008]. CFG-008 and CFG-009 carry the un-legended orange fill.
  - The KB asks whether such data is hidden, archived or deleted [KB OpenPoints NEW-14].
- **Proposed default:**
  - Removed-section data becomes "inactive": retained and read-only.
  - It is excluded from submission, PDF, analytics and completeness checks, and visible internally in history with a banner.
  - Open points on it close as "out of scope", referencing the derivation event. In Part 2 they close only with department confirmation.
- **Risk:** Stale data reaches reviewers, the PDF or reports. Cases cannot complete because of orphan open points.
- **Ask:** "If a section drops out after the supplier filled it, should that data be kept but excluded from submission and the PDF? What happens to open questions on that section?"

### E-D-22 · Reverting a change restores old data · **Medium**
- **Scenario:** Vegetable, then petrochemical, then back to vegetable three weeks later. The restored A1 answers and certificates are stale, or the revert happens after the A1 review was completed.
- **Docs:** Data "become active again" on revert [BRM REQ-CFG-009].
- **Proposed default:** Restored answers come back as "to be confirmed", and the supplier must re-confirm the section before PS-05. In Part 2, a restore counts as a change and triggers the REQ-RMES-012 impact check.
- **Risk:** Outdated evidence is silently re-submitted.
- **Ask:** "When old answers come back after a change is reverted, must the supplier re-confirm them?"

### E-D-23 · Re-derivation after PS-05 activates a new subprocess · **High**
- **Scenario:** Regulatory and Safety have completed. Then SF-09 changes to Yes (K6.17, Sustainability) or a market is added. The PS-11 release request may already have gone to the supplier.
- **Docs:**
  - Metadata changes after PS-05 trigger a scope-impact check [BRM REQ-PROC-007]. Activation is dynamic, and synchronisation waits only for activated subprocesses [ReqDoc p.4 §3.2.1].
  - Exactly one supplier notification is sent after all applicable departments complete [BRM REQ-PROC-040]. Additional parts can be added at any time [BRM REQ-ADR-002].
- **Proposed default:** Any Part-2 scope change re-runs activation, and new subprocesses join the synchronisation point. A pending PS-11 request is withdrawn with a neutral message.
- **Risk:** The supplier releases a CIQ that is not fully reviewed, or receives two "please release" notifications.
- **Ask:** "If the scope grows during BDF's review and a new department becomes involved, may the supplier's final release request be withdrawn and re-sent?"

### E-D-24 · Adding a configuration question or answer option later · **Medium**
- **Scenario:** SF-13 or a new origin value is added after a year. Running cases have no answer, so re-derivation receives a null input.
- **Docs:** The SF list is a draft to be completed (OP-19) [ReqDoc p.10 §5.3]. Further metadata is missing [KB ConfigQuestions BD-xx; KB OpenPoints NEW-02].
- **Proposed default:** A null input fires no rule and raises a flag. New questions apply to new cases unless an admin migrates running cases.
- **Risk:** Errors or silent scope changes on running cases.
- **Ask:** "When you add a new configuration question, should it apply to cases already running?"

---

## 3. Questionnaire template and configuration management

### E-D-25 · Where the template version pin applies · **High**
- **Scenario:** A case starts on template v4, and the Turkey REACH annex is updated in v5. A department activates A12 mid-case: v4 or v5? A cancelled case is reactivated after 10 months: v4?
- **Docs:** Started projects keep their template version [BRM REQ-CFG-001]. Additional parts can be activated at any time [BRM REQ-ADR-002]. A resubmission creates a new review version [ReqDoc p.4 §3.1.5]. Reactivation within 1 year [ReqDoc p.5 §3.3.3].
- **Proposed default:** The whole case is pinned to its start version. An explicit admin action "upgrade case to template vX" shows a diff and is audited.
- **Risk:** Mixed-version cases cannot be reproduced or reported.
- **Ask:** "When BDF adds an annex to a running case, should it use the questionnaire version the case started with, or the latest one?"

### E-D-26 · Help texts, labels and translations as versioned content · **Medium**
- **Scenario:** A help text changes the method, e.g. for the natural origin index. Older answers were given under the old instruction, and a dispute arises about what was asked.
- **Docs:** Help texts are part of the maintainable template [BRM REQ-CFG-001]. Our answer offers contextual help and videos [CIA #34]. The FLM was translated from German [FLM changelog r9].
- **Proposed default:** Help texts and labels are versioned with the template. The case records which version the supplier saw, and the PDF names the template version.
- **Risk:** Answers cannot be interpreted later.
- **Ask:** "Should a change to a help text count as a new questionnaire version?"

### E-D-27 · Deactivating questions or options used elsewhere · **High**
- **Scenario:** The option "Bio Mass (vegetable)" is relabelled or deactivated. Rules, the RMES pre-population mapping, reports and notifications that reference it break silently.
- **Docs:** Deactivating sections, questions and options is allowed [BRM REQ-CFG-001]. The RMES mapping set is agreed and documented [BRM REQ-PROC-022]. RMES criteria can change "without changing historical evaluations" [ReqDoc p.13 REQ-RMES-002].
- **Proposed default:** Run a dependency check before deactivation. Deactivated items remain readable in history.
- **Risk:** Silent wrong scopes, and empty RMES fields.
- **Ask:** "When a question is removed, should the tool warn if rules or reports still use it?"

### E-D-28 · Stable IDs for fields and options · **High**
- **Scenario:** Field IDs are renumbered or reused after go-live, or option values are stored as labels, so translations or relabelling break rules and history.
- **Docs:**
  - FLD-2.3-05 became FLD-2.3-01 [FLM changelog r94]. FLD-2.3-08 became FLD-2.3-01 [FLM changelog r108]. FLD-A2-102.1–.5 became FLD-A2-102 [FLM changelog r130–r141].
  - FLD-A4-104 was merged into FLD-A4-103 [FLM changelog r182]. Options share one ID [FLM changelog r12].
- **Proposed default:** Immutable technical keys per field and per option, separate from labels. A retired ID is never reused.
- **Risk:** Historical data is mis-mapped, and integrations later break.
- **Ask:** "Are the FLD field IDs meant to be permanent once live, including for reporting and future integrations?"

### E-D-29 · An urgent regulatory change must reach running cases · **High**
- **Scenario:** A new restriction requires a new question in all open cases. This contradicts "no retroactive change".
- **Docs:** No retroactive alteration [BRM REQ-CFG-001]. Additional parts at any time [BRM REQ-ADR-002]. SPM regulation is "subject to change" [ReqDoc p.6 K4.3].
- **Proposed default:** A bulk "activate additional part" across selected cases, audited, rather than editing the template retroactively.
- **Risk:** Compliance gaps in running cases.
- **Ask:** "If a regulation changes, must running cases get the new questions? Who decides which cases?"

### E-D-30 · Search and analytics across template versions · **Medium**
- **Scenario:** "All petrochemical-origin cases since 2027" when origin changed from radio to multi-select between versions.
- **Docs:** Cases are searchable by DUNS, INCI and origin, and composition is analysable per component [BRM REQ-PROC-006]. Our answer offers a BI export via a Snowflake add-on [VQ 'Export / BI'].
- **Proposed default:** Stable keys plus version-aware reporting views.
- **Risk:** Wrong portfolio analytics.
- **Ask:** "Which cross-case reports matter most, e.g. by origin, INCI or supplier?"

### E-D-31 · RMES template and applicability rules (a second rule engine) · **High**
- **Scenario:** RMES criteria are switched on by their own rules and versions, and must be as reproducible as the CIQ scope.
- **Docs:**
  - RMES Parts A–D are structured, versioned criteria [ReqDoc p.13 REQ-RMES-002]. Applicability is derived from characteristics, composition, markets and rules, with overrides and a reason, and non-applicable criteria stay visible [ReqDoc p.13 REQ-RMES-004].
  - RMES is "MVP partial scope" [BRM REQ-PROC-021].
  - **GAP:** the RMES template (Parts A–D) was not shared.
- **Proposed default:** One engine with two rule families (CIQ scope and RMES applicability), sharing versioning.
- **Risk:** RMES cannot be designed, and duplicate logic diverges.
- **Ask:** "Can you share the RMES template (Parts A–D)? Are RMES criteria switched on by the same configuration table as the questionnaire?"

### E-D-32 · Governance of business-admin self-service · **High**
- **Scenario:** An admin edits a rule in production, and a typo hides A4 for all new petrochemical cases for three weeks.
- **Docs:** The admin publishes "in the test environment ... without an IT ticket" [BRM REQ-CFG-001]. Our answer: no coding or IT effort [CIA #4].
- **Proposed default:** Draft, then run against reference cases (expected scopes), then four-eyes approval, then publish. Keep a change log with a business reason.
- **Risk:** A single mistake affects all new cases. This conflicts with the client goal of "runs for years without bugs" (stated to us, not in the documents).
- **Ask:** "Who owns the questionnaire and rules after go-live? Should a second person approve changes before they go live?"

---

## 4. Field validations and data quality

### E-D-33 · CAS number format, check digit and multiplicity · **High**
- **Scenario:** A literal "nnnnnnn-nn-n" mask rejects valid short CAS numbers (e.g. 50-00-0). Natural extracts have several CAS numbers or none (inferred, general chemistry).
- **Docs:** FLM: optional, format "nnnnnnn-nn-n (check digit); validated only if filled" [FLM r11 FLD-2.1-002; changelog r28]. Old catalogue: mandatory, with an open-point yellow cell E18 [Feldkatalog r18]. KB proposes mandatory [KB QI Q-007]. If there is no INCI, the IUPAC name is used, plus the Colour Index for colorants [FLM r10].
- **Proposed default:** Pattern of 2–7 digits, 2 digits, 1 check digit, with check-digit validation. Multiple CAS numbers per component are allowed. "No CAS" requires a reason.
- **Risk:** Suppliers are blocked, or invalid CAS numbers break REACH matching.
- **Ask:** "Is CAS mandatory or optional per component? May one component have several CAS numbers?"

### E-D-34 · EC number and REACH registration number share one field · **Medium**
- **Scenario:** One field accepts EINECS/ELINCS/NLP numbers (7 digits) *or* REACH registration numbers, which have a longer, different format (inferred). Neither can be validated.
- **Docs:** [FLM r12 FLD-2.1-003]. Format check [KB QI Q-008]. REACH number per substance in A10 [KB QI Q-112].
- **Proposed default:** Two separate fields.
- **Risk:** Unvalidated identifiers, and failed substance matching.
- **Ask:** "Can we split EC number and REACH registration number into two fields?"

### E-D-35 · DUNS · **Medium**
- **Scenario:** Leading zeros are lost if stored as a number. A small supplier has no DUNS. Supplier DUNS vs manufacturer DUNS. DUNS changes after an acquisition.
- **Docs:** 9-digit format check, mandatory, auto-fill from master data [FLM r7 FLD-GEN-003]. Key search field [BRM REQ-PROC-006; FLM changelog r24]. Supplier and manufacturer are separate [FLM r3, r8].
- **Proposed default:** A text field with exactly 9 digits, owned by RMM from the supplier master and read-only for the supplier. "No DUNS" is an exception with a reason.
- **Risk:** Search and supplier identity break.
- **Ask:** "Whose DUNS, supplier's or manufacturer's? Do all suppliers have one, and who enters it?"

### E-D-36 · Supplier identity entered as free text · **High**
- **Scenario:** "BASF SE", "BASF" and "Basf Personal Care" become three suppliers. The supplier dashboard fragments, and portal visibility cannot rely on free text.
- **Docs:** Supplier is mandatory at creation [BRM REQ-PROC-001]. Supplier name is free text, with Teamcenter auto-fill post-MVP [FLM r3 FLD-GEN-002]. Supplier address was dropped, still under review [FLM changelog r17]. Suppliers see only their own cases [BRM REQ-CTL-006]. The supplier contact database is only Nice-to-have [CIA #24].
- **Proposed default:** A supplier master record (ID, legal name, DUNS) in the MVP, referenced by each case.
- **Risk:** Visibility leaks between suppliers, and wrong dashboards.
- **Ask:** "Is there a supplier master (SAP/Teamcenter) whose ID we should use as the key, even before integration? Who creates new suppliers in the tool?"

### E-D-37 · One production site or several · **Medium**
- **Scenario:** The same raw material comes from two sites. Is that one case or two? GMP/ISO (K6.12) is per site.
- **Docs:** SF-02 asks about additional production sites [ReqDoc p.10]. FLM: only one site, FLD-GEN-006/-007 dropped [FLM changelog r25]. Old catalogue: several sites per project, with the yellow open point "clarify with Procurement" [Feldkatalog r7, r8]. Multi-level supplier structures [CIA #28]. Production site approval is a Must [CIA #31].
- **Proposed default:** One case = one raw material × one site. A further site means a new case, pre-filled.
- **Risk:** The data model is redone later.
- **Ask:** "Is a CIQ per raw material, or per raw material and production site? Is SF-02 still needed?"

### E-D-38 · Concentration ranges and sums · **High**
- **Scenario:** An exact value vs a range. Open-ended values ("< 0.1 %"). Trace levels. Do the components need to sum to 100%?
- **Docs:** 0–100 %, min ≤ max [FLM r15 FLD-2.1-007]. A "0–110 %" typo was corrected [FLM changelog r32–r33]. The KB asks exact or range, and must it total 100% [KB Sections K2.1]. IKW: concentration (range) in % w/w [IKW p.3].
- **Proposed default:** Min and max numbers plus an optional qualifier. A warning (not a block) if Σmin > 100 or Σmax < 100 (inferred consistency rule).
- **Risk:** Implausible compositions reach Regulatory and Safety, or valid entries are blocked.
- **Ask:** "Exact value or range per component? Should the tool check that the composition adds up to about 100%?"

### E-D-39 · Content [%] in INCI and in the raw material, plus the consistency check · **Medium**
- **Scenario:** What exactly does "consistency check against concentration range" do? Block or warn? Per component?
- **Docs:** [FLM r34 FLD-A1-103] and [FLM r35 FLD-A1-104] (the check is written in the Auto-Fill column). A review note says these are only needed when Annex 1 applies [FLM changelog r126–r127].
- **Proposed default:** Warn if the content in the raw material falls outside [min, max]. Mandatory only when Annex 1 is active.
- **Risk:** Spurious blocks.
- **Ask:** "Should a mismatch between content and concentration range block the supplier or only warn the reviewer?"

### E-D-40 · Natural origin index · **Medium**
- **Scenario:** Is it per component or per raw material? Is a third decimal rounded or rejected? Is it mandatory for petrochemicals (0)?
- **Docs:** Decimal 0–1, at most 2 decimals, mandatory [FLM r33 FLD-2.1-102; changelog r124–r125]. (inferred) Likely ISO 16128-based.
- **Proposed default:** Per raw material, 0.00–1.00. More than 2 decimals is rejected with a message, and 0 is allowed.
- **Risk:** Inconsistent sustainability data.
- **Ask:** "Is the natural origin index per raw material or per component, and calculated per ISO 16128?"

### E-D-41 · Units, especially MOAH · **Critical**
- **Scenario:** The supplier enters "1" meaning 1 %, and BDF assumes mg/kg: a factor of 10,000, so the limit check is wrong.
- **Docs:**
  - MOAH: "Number ≥ 0; unit not defined in CIQ (assumption: mg/kg or %)" [FLM r53 FLD-A4-101; changelog r174 "Clarify unit"].
  - Number with or without unit [BRM REQ-CFG-002]. Viscosity in mm²/s [FLM r55]. Heavy metals in mg/kg [Feldkatalog r27–r29]. KB "mg/kg?" [KB QI Q-102, Q-110].
  - IKW uses ppm [IKW p.7–9]. Values, units and limit are captured [ReqDoc p.13 REQ-RMES-008].
- **Proposed default:** Each quantitative field has one canonical unit shown in its label. If other units are allowed, the unit is a mandatory pick, and the system converts and stores both.
- **Risk:** A wrong safety evaluation.
- **Ask:** "Which unit must suppliers use for MOAH and other contaminant values? May they choose the unit?"

### E-D-42 · Values below the limit of quantification · **High**
- **Scenario:** The lab reports "< 0.05 mg/kg" or "n.d.". A pure number field forces the supplier to enter 0 or 0.05, both false. If the LOQ is above the BDF limit, compliance cannot be shown.
- **Docs:** BDF files are **undefined** on this. The IKW template asks for method and LOQ per metal [IKW p.7]. The old catalogue has numeric "Messwert" (measured value) fields [Feldkatalog r27].
- **Proposed default:** Value + qualifier (=, <, n.d.) + LOQ + method. The evaluation is "inconclusive" when the LOQ is above the limit.
- **Risk:** False precision, and false "compliant" results.
- **Ask:** "How should suppliers report 'below detection limit'? Should the tool flag cases where the detection limit is above the BDF limit?"

### E-D-43 · Compound field types not covered by REQ-CFG-002 · **Medium**
- **Scenario:** "Checkbox+Number" for viscosity: is "conclusion by analogy" a checkbox with the analogue's value? Is an upload required for analogy? Is the heavy-metal "Confirmed" tick set by the supplier or computed?
- **Docs:**
  - The FLM type list includes Checkbox+Number, Text/Number and Number+Unit [FLM 'CIQ new version' validation E2:E56]. REQ-CFG-002 lists neither range nor checkbox+number [BRM REQ-CFG-002].
  - Viscosity: number > 0, with an upload "if a value is entered" [FLM r55 FLD-A4-103; changelog r177–r182].
  - Heavy metals: "Confirmed=true nur wenn Wert ≤ Limit" (only if the value is at or below the limit) [Feldkatalog r27–r29].
- **Proposed default:** Model compound fields as atomic fields (choice, number, unit, upload). Computed flags are system fields that the supplier cannot edit.
- **Risk:** Inconsistent data, and suppliers asserting compliance themselves.
- **Ask:** "Is the 'confirmed' tick for heavy metals the supplier's statement or the system's calculation?"

### E-D-44 · Hidden conditional fields keep stale values · **High**
- **Scenario:** Pesticides "Yes" plus an upload, then switched to "No" plus a reason. The upload stays stored but hidden. Or palm Yes, RSPO "Mass Balance", then palm No. Hidden values could reach the PDF, analytics or RMES pre-population, or reappear on a toggle.
- **Docs:** The "mandatory if visible" pattern [FLM r19, r21, r23, r25, r27, r29, r31]. Chains FLD-A1-201→202/203 [FLM r45–r47] and FLD-A1-204→206→207→208 [FLM r48–r51].
- **Proposed default:** Hidden dependent values are kept for audit but marked inactive. They are excluded from validation, the submission snapshot, PDF, RMES mapping and analytics, and visible only in history.
- **Risk:** Contradictory data reaches reviewers or reports.
- **Ask:** "If an answer change makes follow-up fields disappear, should earlier entries be deleted or kept in history only?"

### E-D-45 · "no entry" in the Part multi-select · **Low**
- **Scenario:** "no entry" and "Leaf" are both ticked. "no entry" satisfies a mandatory field without meaning anything. The list mixes plant and animal parts (Wool next to Leaf).
- **Docs:** [FLM r18 FLD-2.1-101].
- **Proposed default:** "no entry" is exclusive and may require a reason. Options are filtered by origin.
- **Risk:** Meaningless data.
- **Ask:** "What should 'no entry' mean, and should it require a reason?"

### E-D-46 · Country of origin: free text with two different meanings · **Medium**
- **Scenario:** "Germany, Brasil, BR" as free text. The biological origin (FLD-2.3-10) and the customs origin (K7) carry the same label but mean different things (inferred).
- **Docs:** Free text, multiple countries [FLM r19 FLD-2.3-10]. Changelog: "multiple countries – to be clarified" [FLM changelog r41]. Auto-filled into A1 [Feldkatalog r60]. K7 country of origin [ReqDoc p.8; KB QI Q-088 "Country list"].
- **Proposed default:** ISO country multi-select, with distinct labels for biological origin and customs origin.
- **Risk:** EUDR and customs analytics are unusable.
- **Ask:** "Can country fields be a pick-list? Is 'country of origin' in 2.3 the same as in the customs chapter?"

### E-D-47 · Free-text fields used for logic or analytics · **Medium**
- **Scenario:** "Function", "Feedstock" and the specification fields are free text, but needed for reports or rules.
- **Docs:** Function is free text [FLM r14] vs "Dropdown?" [KB QI Q-009]. Palm detection by free text was replaced by FLD-A1-204 [FLM changelog r123]. Specifications are free text [FLM r21–r31]. Data must be analysable [BRM REQ-PROC-006].
- **Proposed default:** Controlled lists where values drive rules or reports.
- **Risk:** REQ-PROC-006 is only nominally met.
- **Ask:** "Which fields do you need to filter or report on, and should those be pick-lists?"

### E-D-48 · Locale input (decimal comma, date formats) · **Medium**
- **Scenario:** A German supplier types "0,5". 03/04/2027 is ambiguous.
- **Docs:** **Undefined.** The original catalogue is German and the FLM is English [FLM changelog r9].
- **Proposed default:** Locale-aware input, canonical storage, unambiguous display.
- **Risk:** Values off by a factor of 10, and wrong dates.
- **Ask:** "Should suppliers enter numbers and dates in their local format?"

### E-D-49 · Justifications used to bypass mandatory fields · **High**
- **Scenario:** The supplier types "." or "see spec" in 30 mandatory fields to reach PS-05. Separately, the ReqDoc says no RMES review is released when mandatory evidence is missing. Is evidence that is missing *with a justification* still "missing"?
- **Docs:**
  - A justification makes an item non-blocking, but an empty justification is rejected [BRM REQ-PROC-012]. A negative nanomaterial answer also needs a justification [ReqDoc p.7 K6.9].
  - Missing mandatory evidence means no RMES review is released [ReqDoc p.13 REQ-RMES-001].
  - The rules on justifications are themselves unsettled: an open cell comment asks whether a justification is needed at all ("Welche Begründung?", "which justification?") [Feldkatalog cell comment C46].
- **Proposed default:** A minimum length and no trivial strings. Each justified gap creates an open point for the responsible department to accept or reject. RMES starts with justified gaps flagged.
- **Risk:** Mandatory checks become hollow, and RMES-001 conflicts with REQ-PROC-012.
- **Ask:** "Should every 'cannot provide' justification become an item BDF must accept? Does a justified gap block the start of the RMES review?"

### E-D-50 · Identity of repeatable table rows · **High**
- **Scenario:** The supplier deletes component 2, so component 3 becomes 2 and the query's jump target "component 3, CAS" points at the wrong row. A1 and A2 rows auto-generated from K2.1 become orphans. INCI is edited in K2.1 after A2 was pre-filled (FLD-A2-101 is editable), so the two diverge.
- **Docs:** Query on "K2.1, component 3, field CAS number" [BRM REQ-PROC-029]. Tables of any length [BRM REQ-CFG-002]. A1 rows auto-generated from 2.1 [Feldkatalog r61]. INCI pre-fill [Feldkatalog r56; FLM r37 FLD-A2-101]. A10 per substance [ReqDoc p.8].
- **Proposed default:** Stable row IDs, not row positions. Child rows are linked to the component ID. Deleting a row that has open points is blocked. Pre-filled copies show "source changed".
- **Risk:** Queries point to the wrong data, and composition data is inconsistent.
- **Ask:** "May suppliers delete or reorder components after BDF has asked questions about them?"

### E-D-51 · Supplier contact data · **Medium**
- **Scenario:** There is no contact name field, but confirmations need a name. E-mail 2 is a shared mailbox (info@) that receives notifications.
- **Docs:**
  - Contact e-mail controls access and notification [FLM r4 FLD-GEN-008]. No name field, still under review [FLM changelog r20]. E-mail 2 is an additional notification recipient [FLM r5 FLD-GEN-009], and mandatory vs optional is debated [FLM changelog r23].
  - The old catalogue had name, phone and e-mail [Feldkatalog r12–r14]. Confirmations need a name and e-mail [BRM REQ-PROC-014].
- **Proposed default:** A contact is a named person with an e-mail. E-mail 2 must also be a named user, or receive only content-free alerts.
- **Risk:** Confirmations cannot show a name, and notifications go to uncontrolled mailboxes.
- **Ask:** "Do we need the contact's name? Can the second e-mail be a shared mailbox?"

### E-D-52 · "At least two batches" evidence · **Low**
- **Scenario:** One PDF covers two batches, or the same file is uploaded twice.
- **Docs:** At least two batches [ReqDoc p.6 K2.2]. "≥ 2 batch reports, PDF preferred" [Feldkatalog r26]. [KB Evidence D-05].
- **Proposed default:** Capture at least 2 distinct batch numbers plus uploads, and flag duplicate files.
- **Risk:** The requirement is met only formally.
- **Ask:** "Is it enough to give two batch numbers in one report?"

---

## 5. Quantitative limit checks (REQ-RMES-008)

### E-D-53 · Where BDF limits live, and their versioning · **Critical**
- **Scenario:** Limits are hard-coded in form validation. A limit changes, and old evaluations can no longer be reproduced.
- **Docs:**
  - Limit and rule-set version must stay reproducible [ReqDoc p.13 REQ-RMES-008]. K2.2 is checked against Annex 14, and deviations need a justification [ReqDoc p.6]. A14 was moved into the main document [ReqDoc p.9].
  - The KB asks where the limit values now live and who maintains them [KB Sections K2.2; KB OpenPoints NEW-06].
  - The old catalogue hard-codes As ≤ 0.5, Cd ≤ 0.1 and Cr ≤ 5.0 mg/kg, citing REQ-PROC-106, which is not in the BRM [Feldkatalog r27–r29]. A9 contains binding limits and a reference method [ReqDoc p.8].
- **Proposed default:** A versioned limit master (substance, limit, unit, method, valid-from, source), maintained by Safety. Each evaluation stores the limit version.
- **Risk:** The RMES-008 acceptance test fails, and decisions become indefensible.
- **Ask:** "Who maintains BDF limit values today, and how often do they change? Can you share the current Annex 14 / A9 limit list?"

### E-D-54 · Applicability dimensions of limits · **Medium**
- **Scenario (inferred):** Limits may differ by market or product type (leave-on vs rinse-off).
- **Docs:** **Undefined** beyond "where the ... rule set defines substance or impurity limits" [ReqDoc p.13 REQ-RMES-008].
- **Proposed default:** One global limit per substance in the MVP, with a schema that can take extra dimensions later.
- **Risk:** A redesign if limits turn out to be multidimensional.
- **Ask:** "Does a substance ever have different BDF limits depending on market or product type?"

### E-D-55 · Evaluation semantics · **High**
- **Scenario:** The value equals the limit. Rounding (0.104 vs 0.1). Two batches with different values. LOQ above the limit. Does an exceedance automatically create a blocking finding?
- **Docs:** "Confirmed only if value ≤ limit", with a justification on deviation [Feldkatalog r27–r29]. Justification if value > limit [KB QI Q-016]. The evaluation result is captured [ReqDoc p.13 REQ-RMES-008]. Findings can be blocking [ReqDoc p.13 REQ-RMES-009].
- **Proposed default:** Evaluate each batch and use the maximum. ≤ passes. No rounding before comparison. An exceedance creates a finding that the reviewer classifies.
- **Risk:** Inconsistent pass/fail between reviewers.
- **Ask:** "If two batches differ, which value counts? Should exceeding a limit automatically raise a finding?"

### E-D-56 · A limit changes in the middle of a review · **High**
- **Scenario:** A limit is tightened after PS-05 but before Safety approves.
- **Docs:** Reproducible after rule-set changes [ReqDoc p.13 REQ-RMES-008]. Version fixed at PS-05 [ReqDoc p.4 §3.1.5]. Which limit applies is **undefined**.
- **Proposed default:** Evaluate with the limit valid at evaluation time and store its version. A change before approval raises a re-evaluation flag.
- **Risk:** Approval against an outdated limit.
- **Ask:** "Which limit applies, the one valid when the supplier submitted or the one valid when Safety decides?"

---

## 6. Document handling

### E-D-57 · Allowed file types and sizes · **High**
- **Scenario:** Excel lab reports, JPG scans, password-protected PDFs (unreadable by reviewers and AI, cannot be merged into a package), digitally signed PDFs (the signature breaks if re-processed), a 300 MB tox study, ZIP files.
- **Docs:** "PDF" for the pesticide upload [FLM r46 FLD-A1-202]. "PDF preferred" [Feldkatalog r26]. "(only PDF documents from supplier)" [BRM REQ-CFG-004]. File upload per question [BRM REQ-CFG-002]. AI review [BRM REQ-PROC-024].
- **Proposed default:** An allow-list (PDF, plus images or xlsx where agreed). A per-file size limit to be agreed. Encrypted PDFs are rejected. Originals are kept byte-identical.
- **Risk:** Unreviewable evidence, and failed PDF packages.
- **Ask:** "Are only PDFs allowed? What maximum file size? Should password-protected PDFs be rejected?"

### E-D-58 · Malware scanning of supplier uploads · **High**
- **Scenario:** An infected upload is opened by a BDF reviewer and later pushed to B-Flow.
- **Docs:** **Undefined** in all BDF files. Our VQ answer covers encryption, pen tests and vulnerability management but does not mention upload scanning [VQ 'Information security'].
- **Proposed default:** Scan on upload and quarantine positives. (Internal: verify platform capability.)
- **Risk:** A security incident, and a failed BDF IT security review.
- **Ask:** "Does BDF IT require virus scanning of supplier uploads inside the tool?"

### E-D-59 · Document versions, replacing and deleting · **High**
- **Scenario:** The supplier replaces the SDS in Part 2 without being asked. The supplier deletes an upload before PS-05 (allowed?) or after (must not be). A new version is uploaded with the same file name.
- **Docs:**
  - Documents are versioned [ReqDoc p.6 §3.4]. Versions are fixed at PS-05 [ReqDoc p.4 §3.1.5; BRM REQ-PROC-016]. A query names the file and version [BRM REQ-PROC-029].
  - Closure records the accepted evidence version [ReqDoc p.13 REQ-RMES-011]. Evidence changes trigger reopening [ReqDoc p.13 REQ-RMES-012]. Status changes record the reviewed evidence version [BRM REQ-PROC-034].
- **Proposed default:** Uploads are append-only versions. Before PS-05, "delete" means withdraw (kept in audit). After PS-05, the supplier can only add versions, linked to a query or as a voluntary update that triggers the impact check.
- **Risk:** Reviewed evidence silently changes.
- **Ask:** "After submission, may suppliers replace a document on their own initiative, or only when BDF asks?"

### E-D-60 · One document used in several places · **High**
- **Scenario:** The SDS is required in K1 and also under K6.1 "numbers in SDS (attached)". The RSPO number appears on the CoA. ISO certificates are reused. The two copies diverge.
- **Docs:** Evidence is linked "exclusively" to its question, plus an overview by chapter [BRM REQ-PROC-011]. SDS in K1 [ReqDoc p.6] and in K6.1 [Feldkatalog r47]. RSPO number on the CoA [ReqDoc p.11; KB Evidence D-02]. ISO reuse (OP-17) [ReqDoc p.7].
- **Proposed default:** A per-case document register: one document (with versions) referenced from several questions. A replacement updates all references and triggers the impact check for each.
- **Risk:** Duplicate, inconsistent evidence, and reviewers assessing different versions.
- **Ask:** "If one certificate answers several questions, should the supplier upload it once and link it, or upload it at each question?"

### E-D-61 · Reuse and expiry of supplier-level documents · **Medium**
- **Scenario:** An ISO certificate expires during the review or after approval. A certificate reused across cases is replaced.
- **Docs:** K6.12 relates to the supplier, and reuse is open (OP-17) [ReqDoc p.7]. File with expiry date [KB QI Q-072]. SDS validity or maximum age [KB Evidence D-01]. IKW: recertification date and reconfirmation every two years [IKW p.2, p.12].
- **Proposed default:** No reuse in the MVP. Capture expiry dates. A warning if a document is expired at PS-05.
- **Risk:** Approval based on expired certificates.
- **Ask:** "Should the tool track certificate expiry? Is re-using supplier certificates across cases in scope?"

### E-D-62 · Document titles, versions and renaming · **Medium**
- **Scenario:** A file is renamed after review and a name-based reference breaks. File names contain umlauts or CJK characters, or duplicate each other. "Version" could mean the document's own revision (SDS rev. 4.2) or the upload count.
- **Docs:** Original title and version plus storage title, both searchable [ReqDoc p.14 REQ-RMES-017]. Manual upload and renaming must be possible (B-Flow) [CIA #12].
- **Proposed default:** An immutable internal document ID. Title, file name and the document's own revision are attributes. Renames are audited.
- **Risk:** Traceability breaks.
- **Ask:** "When you say a document's 'version', do you mean the revision printed on it (e.g. SDS rev. 4.2) or the upload version in the tool?"

### E-D-63 · Signed declarations and e-signatures · **High**
- **Scenario:** Is an in-tool confirmation (name, e-mail, timestamp) legally enough, or must a signed PDF (wet ink or qualified e-signature) be uploaded? Who is authorised to sign?
- **Docs:**
  - A11 contains a signed supplier declaration [ReqDoc p.8]. File (signed) [KB QI Q-114]. A template is not yet provided [KB Evidence D-19].
  - The old catalogue has a "Digital signature" row with no specification [Feldkatalog r15]. FLD-VER-001 is red-filled [Feldkatalog r10].
  - Confirmations record name, e-mail and timestamp, plus role at PS-11 [BRM REQ-PROC-014, REQ-PROC-042]. Text modules for supplier confirmation [CIA #5].
- **Proposed default:** An in-tool confirmation with a versioned declaration text. A signed PDF only where a regulation demands it.
- **Risk:** Declarations that are not legally valid.
- **Ask:** "Is clicking 'confirm' in the tool enough for supplier declarations, or do some (like UK REACH) need a signed document? Who at the supplier may sign?"

### E-D-64 · Internal attachments vs attachments shared with the supplier · **High**
- **Scenario:** Safety uploads an internal tox memo next to a supplier document, or attaches an internal BDF spec to a supplier query.
- **Docs:** The supplier may access only "permitted attachments" [ReqDoc p.14 REQ-RMES-015]. Internal communication area [BRM REQ-PROC-020].
- **Proposed default:** Every attachment has a visibility attribute. BDF uploads are internal by default, and an explicit, audited "share with supplier" action is required.
- **Risk:** A confidentiality breach.
- **Ask:** "Will BDF reviewers ever send documents to suppliers through the tool? Should those need an explicit 'share' step?"

### E-D-65 · K1 "mandatory documents" vs duplicate uploads · **Medium**
- **Scenario:** K1 asks for the SDS, CoA and specification, while other chapters ask for the same evidence.
- **Docs:** K1 is a checklist of required evidence derived from the configuration [ReqDoc p.6]. The KB asks whether K1 is a generated checklist or questions [KB Sections K1]. Overview by chapter [BRM REQ-PROC-011].
- **Proposed default:** K1 is a generated, read-only checklist with status per item, linking to where each item is uploaded.
- **Risk:** Duplicate uploads and status confusion.
- **Ask:** "Is K1 a list the system generates, or questions the supplier answers?"

---

## 7. Versioning, freezing, reopening

### E-D-66 · How fine-grained the review version is · **High**
- **Scenario:** In Part 2 the supplier answers three queries by changing three fields. Is that a new whole-CIQ review version, or field-level versions? Does RMES get a new version each time?
- **Docs:** The version is fixed at PS-05, and a resubmission creates a new review version without overwriting [ReqDoc p.4 §3.1.5]. Assessments refer to the PS-05 version [BRM REQ-PROC-016]. RMES is created with the CIQ version [ReqDoc p.13 REQ-RMES-001]. "Exactly one RMES data record" [BRM REQ-PROC-021].
- **Proposed default:** A case snapshot at PS-05 (v1). Part-2 changes are field or document versions tagged with the query ID. A full re-submission happens only if the case is sent back to Part 1.
- **Risk:** Version explosion, or reviews tied to the wrong version.
- **Ask:** "When the supplier answers a query by correcting data, is that a new submission of the whole CIQ or just a change to that item?"

### E-D-67 · Supplier edits in Part 2 and races with completion · **High**
- **Scenario:** The supplier edits a field that Safety has already completed. The supplier edits while a reviewer clicks "complete". The supplier edits after the PS-11 release request was sent.
- **Docs:** Metadata is changeable until PS-11 [BRM REQ-PROC-007]. Part-2 changes are audited and departments informed [BRM REQ-PROC-031]. Reopen, or explicit no-impact confirmation [ReqDoc p.13 REQ-RMES-012]. Queries are answered [BRM REQ-PROC-032].
- **Proposed default:**
  - In Part 2 the supplier edits only items with open queries, plus metadata via a "change request".
  - Changes to data used by completed reviews reopen them or require a no-impact confirmation.
  - Completion re-validates at commit time.
- **Risk:** A department approves data that changed underneath it.
- **Ask:** "During BDF's review, can the supplier change anything, or only what BDF asked about?"

### E-D-68 · Restoring historical data · **Medium**
- **Scenario:** Who restores, and does restoring overwrite newer values?
- **Docs:** It "should be possible to restore the historical data where required" [BRM REQ-PROC-016]. Reopening is audited [ReqDoc p.6 §3.4].
- **Proposed default:** A restore creates a new version that copies the old values, done by RMM or the responsible department with a reason, and triggers the impact check.
- **Risk:** History is rewritten.
- **Ask:** "Who may restore an earlier answer, and why would you need to?"

### E-D-69 · RMES pre-filled values vs later source changes · **High**
- **Scenario:** An RMES field is copied from CIQ v1. The supplier later changes the value, and RMES still shows v1. The reviewer edits the pre-filled value, which diverges from the supplier data.
- **Docs:** Pre-filled with a source reference (question, document, version) [BRM REQ-PROC-022]. Traceability [ReqDoc p.13 REQ-RMES-005]. Reopening [ReqDoc p.13 REQ-RMES-012]. "MVP partial scope" [BRM REQ-PROC-021, -022].
- **Proposed default:** RMES stores a reference plus a snapshot. On a source change it shows "source updated" and offers a refresh. Reviewer overrides need a comment and keep the source value.
- **Risk:** Assessments based on outdated data.
- **Ask:** "May Safety or Regulatory overwrite a value copied from the supplier's CIQ in RMES?"

### E-D-70 · Freezing at release, and corrections afterwards · **High**
- **Scenario:** A typo in the trade name after release, a certificate renewal, or the supplier reporting a formulation change after approval.
- **Docs:** The CIQ is frozen at the supplier's final release, and change attempts are rejected and logged [BRM REQ-PROC-043]. No change after PS-11 [BRM REQ-PROC-007]. The IKW template expects periodic reconfirmation and proactive change information [IKW p.2]. Corrections and requalification are **undefined**.
- **Proposed default:** After the freeze, a new case (change or requalification) is pre-filled from the frozen version with a diff and linked to it.
- **Risk:** Workarounds that edit frozen data.
- **Ask:** "After a CIQ is closed, how should corrections or supplier change notices be handled: a new CIQ, or an amendment?"

### E-D-71 · Cancellation and reactivation · **Medium**
- **Scenario:** Does the supplier keep access after cancellation? Is the cancellation reason visible to the supplier? On reactivation after 10 months, are old tasks and versions restored, and is the data still valid?
- **Docs:** Cancellation if the raw material is no longer relevant, with reactivation within an assumed 1 year [ReqDoc p.5 §3.3.3]. A justification is required and all tasks, including the supplier's, end [BRM REQ-PROC-049]. [KB OpenPoints NEW-15]. Manual completion by RMM in exceptions [BRM REQ-PROC-045].
- **Proposed default:** The reason stays internal and the supplier gets a neutral message. Reactivation restores the last phase with the same pinned versions. Data older than X must be re-confirmed.
- **Risk:** Confidential reasons are disclosed, and stale data is reused.
- **Ask:** "What should the supplier be told when a case is cancelled? On reactivation, must the supplier re-confirm the old data?"

### E-D-72 · Final PDF: content, timing, immutability, visibility · **High**
- **Scenario:**
  - The PDF is generated at the supplier's release, but the BDF overall decision (PS-12 in the ReqDoc) may come later.
  - Sending the PDF by e-mail creates an uncontrolled copy.
  - If the supplier receives it, internal content and names must be removed.
  - A template bug forces regeneration.
- **Docs:**
  - Auto-generated, immutable, filed and e-mailed to the RMM owner. The content is still to be confirmed by the business. It contains the confirmations from PS-05, PS-10 and PS-11 [BRM REQ-PROC-046].
  - The ReqDoc generates the package *after* the overall decision and files it in B-Flow [ReqDoc p.5 §3.3.3]. The PS-12 role is TBD [ReqDoc p.3].
  - The RMES export respects the visibility split [ReqDoc p.14 REQ-RMES-020]. PDF templates [CIA #7].
- **Proposed default:** PDF/A with a hash recorded in the audit trail. E-mail a link rather than an attachment (inferred). Separate internal and supplier variants if the supplier gets one. Regeneration creates v2 and keeps v1.
- **Risk:** The PDF misses the BDF decision, or leaks internal content.
- **Ask:** "Is the final PDF produced before or after BDF's overall decision? Does the supplier receive a copy?"

### E-D-73 · Idempotent state transitions · **Medium**
- **Scenario:** Two supplier users confirm PS-05 at the same time, or a retry after a time-out creates two RMES records, duplicate tasks or two notifications.
- **Docs:** "Exactly one RMES data record" [BRM REQ-PROC-021]. "Exactly one notification" [BRM REQ-PROC-040]. "Exactly those departments" [BRM REQ-PROC-017]. Unique project ID [BRM REQ-PROC-001].
- **Proposed default:** Transitions are guarded by state, and actions are idempotent per case and version.
- **Risk:** Acceptance tests fail on "exactly one".
- **Ask:** "If two supplier colleagues confirm at the same moment, is it fine to record the first and ignore the second?"

---

## 8. Confidentiality and access

### E-D-74 · Every channel through which internal content could reach a supplier · **Critical**
- **Scenario (inferred channels):**
  - e-mail templates with dynamic fields
  - activity or history timelines showing internal steps, names and comments
  - comment threads shared on one record
  - dashboard tiles and counts
  - status labels ("Safety: rejected")
  - PDFs and exports
  - global search
  - attachments
  - AI suggestions
  - reminder or escalation e-mails copying the supplier
  - cancellation reasons
- **Docs:**
  - Internal comments and assessments are not visible to suppliers [ReqDoc p.3 §3]. The separation is enforced throughout [BRM REQ-CTL-002].
  - RMES criteria, internal comments, unpublished findings and approval rationales are hidden [ReqDoc p.14 REQ-RMES-015].
  - Notifications contain no internal content [BRM REQ-PROC-040]. No RMES or findings for the supplier [BRM REQ-CFG-004, REQ-PROC-021].
- **Proposed default:** Internal data lives in separate internal objects, not hidden fields on supplier-facing forms (inferred design principle). Acceptance includes a supplier-role test script per channel.
- **Risk:** A single leak can disqualify the MVP and damage the supplier relationship.
- **Ask:** "Besides comments and findings, is anything else strictly internal, such as names of BDF reviewers, department status, internal due dates or cancellation reasons?"

### E-D-75 · "Findings before publication" and drafting supplier queries · **High**
- **Scenario:** A query created from a finding carries the "complete conversation history" and the RMES criterion name, which would expose internal discussion. What does "publishing" a finding mean?
- **Docs:** Unpublished findings are hidden [ReqDoc p.14 REQ-RMES-015]. A query from a finding contains the criterion, reference, contact, due date and complete history [ReqDoc p.13 REQ-RMES-010]. The supplier sees the justification [ReqDoc p.12 §6.2; BRM REQ-PROC-030].
- **Proposed default:** The supplier-facing text is written separately. The supplier sees only the question, CIQ reference, due date and BDF contact. An optional second reviewer checks the wording before it is sent.
- **Risk:** Internal reasoning leaks, which is a negotiation or legal exposure.
- **Ask:** "When a finding becomes a supplier question, what may the supplier see: only the question, or also the finding? Does anyone check the wording before sending?"

### E-D-76 · Internal communication area vs supplier Q&A · **High**
- **Scenario:** A reviewer replies in the wrong thread, @-mentions a supplier in an internal note, or copies an internal note to the supplier.
- **Docs:** An internal-only area "never" visible to the supplier [BRM REQ-PROC-020] (orange fill). Our answer: users and suppliers comment and tag each other within the process context [CIA #10].
- **Proposed default:** Physically separate threads, the audience shown explicitly in the UI, and no "move to supplier" action.
- **Risk:** Accidental disclosure.
- **Ask:** "Is the internal discussion area an MVP must, or a nice-to-have?"

### E-D-77 · Supplier organisation boundaries · **Critical**
- **Scenario:**
  - (a) A regulatory consultant uses one e-mail for several small suppliers.
  - (b) A group HQ wants to see its subsidiaries' cases.
  - (c) A distributor and a manufacturer for the same raw material.
  - (d) A contact moves to another supplier.
  - (e) Site-level contacts.
- **Docs:** Suppliers see only their own cases [BRM REQ-CTL-006] and their own project [BRM REQ-PROC-004]. Role structures per supplier [CIA #26]. Multi-level structures [CIA #28]. Supplier and manufacturer are separate fields [FLM r3, r8]. The IKW template distinguishes supplier and manufacturer [IKW p.3].
- **Proposed default:** Visibility = the case's supplier organisation **and** the named contacts on the case. One person may belong to several organisations, but access to each case is explicit. No group-level visibility in the MVP.
- **Risk:** Cross-supplier leakage of BDF and supplier data.
- **Ask:** "Who exactly is 'the supplier': distributor, manufacturer or group? Can one person (e.g. a consultant) work for several suppliers?"

### E-D-78 · Confidentiality inside the supplier side (composition) · **High**
- **Scenario (inferred):** A distributor runs the CIQ, but the manufacturer will disclose the full composition only to BDF. Without a confidential channel, the manufacturer refuses and falls back to own documents.
- **Docs:** **Undefined.** Full composition in K2.1 [ReqDoc p.6]. Several supplier contacts, with tasks assigned only by the supplier [BRM REQ-CTL-001]. Our answer: section-level read-only, editable or hidden per contact [CIA #6]. Own-document suppliers have a separate process [ReqDoc p.4 §3.1.4].
- **Proposed default:** An optional manufacturer contact with exclusive access to K2.1 and K2.2.
- **Risk:** Lower adoption, and trade-secret disputes.
- **Ask:** "Must a manufacturer be able to give its composition to BDF without its distributor seeing it?"

### E-D-79 · Supplier user self-management and invitations · **High**
- **Scenario:** A typo in the contact e-mail sends the invitation to a stranger, disclosing the trade name and BDF's interest. A supplier admin invites an outside party. A contact leaves the supplier but the account stays active. An invitation link is forwarded.
- **Docs:** The project is delivered to the supplier contact [BRM REQ-PROC-001, REQ-PROC-004]. Supplier-side task assignment is done only by the supplier [BRM REQ-CTL-001]. The e-mail is pre-filled from master data [FLM r4].
- **Proposed default:** Invitations are bound to a verified e-mail. Supplier admins invite only on registered domains, with exceptions via RMM. RMM sees the list of supplier users per case. Periodic access review.
- **Risk:** Disclosure before any review starts.
- **Ask:** "May suppliers add colleagues themselves? Should BDF see and approve who has access?"

### E-D-80 · Need-to-know inside BDF, and gaps in the role list · **Medium**
- **Scenario:** Can QM read RMES findings? Can Legal read the composition? "(only PDF documents from supplier)" is ambiguous.
- **Docs:** All internal roles read all content, editing only their own area [BRM REQ-PROC-019]. "A Regulatory reviewer can read Safety assessments (only PDF documents from supplier)" [BRM REQ-CFG-004]. The internal role list omits Customs and Legal [BRM REQ-CFG-004], although they own K7 and K8 [ReqDoc p.8; p.9 §4.3]. K8 is "Read only for Legal" [ReqDoc p.8]. [KB OpenPoints NEW-11].
- **Proposed default:** All internal roles read CIQ data and supplier documents. RMES and internal assessments are read by Safety, Regulatory and RMM, and by others only if confirmed.
- **Risk:** Over- or under-exposure internally.
- **Ask:** "What does '(only PDF documents from supplier)' in REQ-CFG-004 mean? Do Customs and Legal need user roles in the MVP?"

### E-D-81 · AI document review: data protection and traceability · **High**
- **Scenario:**
  - Confidential supplier documents go to an external AI model.
  - The supplier's NDA forbids this.
  - Model updates make results non-reproducible.
  - Scanned PDFs need OCR.
  - Source references are too coarse.
  - Reviewers accept suggestions blindly.
  - AI output leaks to the supplier.
- **Docs:** AI must stay reviewable and not replace the accountable decision [ReqDoc p.5 §3.2.3]. Suggestions are marked, carry a source reference and can be confirmed or discarded [BRM REQ-PROC-024] ("MVP partial scope", orange fill). Our answer mentions admin-governed AI and Smart OCR [VQ 'Analytics / AI']. Our subprocessor list names AWS, GCP, Snowflake and Intercom, but no AI model provider [VQ 'Subprocessors'].
- **Proposed default:** Process only within contracted subprocessors and region. Log model and version, prompt version, document version, suggestion and reviewer decision. AI output is internal only.
- **Risk:** Legal or contractual exposure, and a failed DPA review.
- **Ask:** "Are there restrictions on processing supplier documents with AI (supplier NDAs, BDF AI policy)? Which AI use cases are expected in the MVP?"

---

## 9. Identity and authentication

### E-D-82 · Supplier authentication · **High**
- **Scenario:** Password reuse. One login shared by a supplier team, which breaks per-user attribution. Dormant accounts after case closure. BDF policy may require MFA for externals.
- **Docs:** SSO is required for BDF only [CIA #20]. Our answers: SAML SSO, Google, Microsoft 365 or Kissflow authentication [VQ 'Authentication / SSO']; "SSO or username/password" [VQ 'Confidentiality model']. MFA is mentioned in our access-control answer [VQ 'Information security'], but whether it applies to external users is unclear (inferred). Per-user attribution is required [BRM REQ-CTL-001].
- **Proposed default:** Individual accounts only. MFA for suppliers if BDF requires it. Access is deactivated N days after closure.
- **Risk:** Weak authentication on the most sensitive data.
- **Ask:** "Does BDF security require MFA for supplier users? How long should suppliers keep access after a case closes?"

### E-D-83 · BDF SSO, provisioning, role mapping, leavers · **Medium**
- **Scenario:** A reviewer leaves or changes department and their tasks are orphaned. Department membership is kept in the tool vs AD groups. External BDF contractors need access (the requirements owner is listed as "ext." in the PDF metadata).
- **Docs:** SSO is a Must [CIA #20]. Role model [BRM REQ-CFG-004]. Our answer mentions syncing responsibilities via SSO [CIA #3]. The VQ guidance asked about user provisioning and SCIM [VQ 'Authentication / SSO', 'Integration capabilities'], and our answers do not mention SCIM. The PDF author is "Pevzner, Alexander ext." [ReqDoc metadata].
- **Proposed default:** SSO login. Roles are maintained in the tool by the business admin for the MVP. A leaver's tasks are reassigned by the department lead.
- **Risk:** Stale access, and orphan tasks.
- **Ask:** "Should department roles come from BDF's directory groups, or be maintained in the tool?"

### E-D-84 · Unstaffed roles and unassigned tasks · **Medium**
- **Scenario:** A Sustainability subprocess is activated but no reviewer is configured. A reviewer is on leave.
- **Docs:** Each task has exactly one named person or role [BRM REQ-CTL-003]. An "unassigned" dashboard state [ReqDoc p.14 REQ-RMES-018]. Named ownership and escalation [ReqDoc p.5 §3.4].
- **Proposed default:** Department queue, the lead assigns, and escalation to RMM after X days.
- **Risk:** Silent stalls.
- **Ask:** "Should review tasks go to a named person or to a department queue?"

---

## 10. Audit trail, retention, GDPR

### E-D-85 · What the audit trail must cover, beyond the platform log · **Critical**
- **Scenario:** A generic log says "field X changed by Y". The auditor asks which document version Safety assessed and which rule version set the scope (inferred gap). Changes to configuration and permissions also need an audit trail.
- **Docs:**
  - Immutable audit of submission, review, query, answer, release, rejection and reopening, reconstructing "who assessed what, when and on which source version" [BRM REQ-CTL-009]. Plus the rule-set version [ReqDoc p.14 REQ-RMES-016].
  - Person, timestamp, result and rationale [ReqDoc p.4 §3.2.2]. Manual overrides are auditable [BRM REQ-CFG-007].
  - Our answers: "complete, immutable audit trail" [CIA #9]; "immutable audit log" [CIA #11]; "unalterable even by platform admins" [VQ 'Audit trail and timestamps'].
- **Proposed default:** Business audit events are modelled explicitly (type, actor, on-behalf-of, UTC time, object, version references, rationale), with the platform log as a secondary source. Configuration changes are audited.
- **Risk:** Audit evidence cannot be defended, and our submitted claims are tested.
- **Ask:** "Will auditors want to know who *viewed* a document, or only who changed or decided something? Should rule and permission changes be in the audit trail?"

### E-D-86 · GDPR erasure vs an immutable audit trail and frozen PDFs · **High**
- **Scenario:** A supplier contact leaves their company and requests erasure. Their name and e-mail are in the audit trail, the frozen PDF and B-Flow.
- **Docs:** Immutable audit [BRM REQ-CTL-009; ReqDoc p.14 REQ-RMES-016]. Confirmations store name and e-mail [BRM REQ-PROC-014, -015, -042]. The PDF cannot be changed [BRM REQ-PROC-046]. Our GDPR/DPA answer [VQ 'Data protection / GDPR']. (inferred) A legal-obligation exemption may apply, which is a decision for BDF's data protection officer.
- **Proposed default:** Keep identities in audit records with restricted access. Anonymise contact master data and inactive accounts. Document this in the record of processing.
- **Risk:** Regulatory conflict, and late redesign.
- **Ask:** "Has BDF data protection defined how long supplier contact data in CIQ records is kept, and whether it can be anonymised later?"

### E-D-87 · Retention and archiving gap · **High**
- **Scenario:** Without a B-Flow interface the tool becomes the system of record. There are no retention rules or legal hold. When are cancelled cases deleted?
- **Docs:** Our answer: the platform "does not natively manage configurable records retention policies" and relies on ECM integration [VQ 'Archiving and retention']. B-Flow filing is the target, but integrations are out of scope in 2026 [ReqDoc p.2 §1.1; p.5 §3.3.3]. Manual filing in the MVP? [KB OpenPoints OP-13]. (inferred) Cosmetics product information typically has long retention obligations, to be verified with BDF.
- **Proposed default:** No deletion during the MVP. A manual export of the final package to B-Flow at closure. Retention automation comes later via B-Flow.
- **Risk:** Non-compliant archiving, and a gap in the competitor comparison.
- **Ask:** "How long must CIQ records be kept, and is B-Flow the official archive? Until the interface exists, is a manual upload acceptable?"

### E-D-88 · Delegation and its auditability · **High**
- **Scenario:** A Regulatory user completes on behalf of Safety during holidays. Who grants this? For one case or a period? How is it displayed? How is it revoked?
- **Docs:** Auditable delegation for approvals [ReqDoc p.14 REQ-RMES-013] and completions [BRM REQ-PROC-039]. "Formally reassigned" [ReqDoc p.13 REQ-RMES-011]. "Documented reassignment" [BRM REQ-PROC-034]. The mechanics are **undefined**.
- **Proposed default:** A delegation record (grantor, delegate, scope, validity, reason) granted by the department lead. Every action records both the actor and on-behalf-of.
- **Risk:** Approvals by unauthorised people that cannot be told apart in the audit.
- **Ask:** "Who may grant a delegation, and may it cross departments (e.g. Regulatory acting for Safety)?"

### E-D-89 · Blocking vs non-blocking items conflict · **High**
- **Scenario:** Safety records a non-blocking finding. Under the BRM it still blocks completion.
- **Docs:** "A distinction between blocking and non-blocking open points is not envisaged" [BRM REQ-PROC-036]. In contrast, findings are classified blocking or non-blocking [ReqDoc p.13 REQ-RMES-009]. "Open blocking requests" [ReqDoc p.4 §3.2.2]. Open requests prevent approval [ReqDoc p.12 §6.2].
- **Proposed default:** Findings have a blocking flag. Supplier queries and requests always block. Non-blocking findings are listed at approval.
- **Risk:** Approval gates behave differently from what auditors expect.
- **Ask:** "Can a finding be 'non-blocking', or does every open item block completion?"

### E-D-90 · Meaning and authority of the three confirmations · **Medium**
- **Scenario:** A junior supplier user confirms. The declaration text changes over time.
- **Docs:** Three confirmation types, each with date, name and e-mail [BRM REQ-PROC-015]. Role at PS-11 [BRM REQ-PROC-042]. Supplier Approval confirms "submission and responsibility" [ReqDoc p.4 §3.1.5]. The UI wording must be explicit [BRM REQ-PROC-014].
- **Proposed default:** Only contacts flagged "authorised to confirm" may confirm. The declaration text is versioned and stored with each confirmation.
- **Risk:** Confirmations can be disputed.
- **Ask:** "May any supplier user confirm, or only authorised persons?"

### E-D-91 · Audit export and reproducibility package · **Medium**
- **Scenario:** An external auditor requests all evidence for case X.
- **Docs:** Auditor reconstruction [BRM REQ-CTL-009; ReqDoc p.14 REQ-RMES-016]. RMES export content [ReqDoc p.14 REQ-RMES-020].
- **Proposed default:** A per-case audit dossier (readable PDF plus machine-readable data).
- **Risk:** Manual evidence gathering.
- **Ask:** "What format do auditors expect when they ask for a case's history?"

### E-D-92 · Exit and portability over many years · **Medium**
- **Scenario:** In five years BDF changes platform and needs the history, versions and rule sets, not only current records.
- **Docs:** Our answer: export as JSON plus ZIP, data erased 30 days after termination and purged from backups within 90 days [VQ 'Data ownership'; 'Data protection / GDPR']. The client goal of running for years was stated to us, not in the documents.
- **Proposed default:** Confirm internally that the export covers audit logs and history. Archiving to B-Flow reduces lock-in.
- **Risk:** Lock-in, and loss of the audit trail.
- **Ask:** "If you change platform later, do you expect a full export including history and audit trail?"

---

## 11. Notifications and dashboards

### E-D-93 · Notification logging and delivery failures · **Medium**
- **Scenario:** A supplier e-mail bounces, so the task is never seen. Spam filters. Is the content logged or only the event? E-mail 2 is a shared mailbox.
- **Docs:** Every notification event is logged at the project [BRM REQ-CTL-010]. Logged against the case, with configurable reminders and escalation [ReqDoc p.14 REQ-RMES-019]. E-mail 2 [FLM r5]. Our answers [CIA #16, #17].
- **Proposed default:** Log the event, recipients, template version, time and delivery status where available. A bounce creates a task for RMM.
- **Risk:** SLA breaches with nobody aware.
- **Ask:** "Should RMM be alerted when a supplier e-mail cannot be delivered?"

### E-D-94 · Due dates, reminders, escalation · **Medium**
- **Scenario:** The "internal due date" is shown to the supplier. Does the clock pause while a task waits on the supplier? Who escalates to whom?
- **Docs:** "Internal due date (remains flexible)" [BRM REQ-ADR-001] vs the supplier task showing a due date [BRM REQ-PROC-030]. Reminders and escalation [ReqDoc p.5 §3.4; p.14 REQ-RMES-019]. Defaults are undefined [KB OpenPoints NEW-16].
- **Proposed default:** Two dates: the supplier due date (visible) and the internal target (hidden). SLA clocks per owner.
- **Risk:** The supplier sees internal targets, and escalations go wrong.
- **Ask:** "Is the due date on a query the supplier's deadline, BDF's internal target, or both?"

### E-D-95 · Status model and derived overall status · **High**
- **Scenario:** One subprocess is rejected, one is waiting for the supplier and one is completed. What is the overall status? What does the supplier see? Do traffic lights match across views? Is the dashboard up to date?
- **Docs:**
  - Section statuses open, in progress, with supplier, reviewed, completed. The overall status is derived traceably [BRM REQ-CTL-006].
  - RMES states unassigned, open, waiting, overdue, reopened, approved, rejected [ReqDoc p.14 REQ-RMES-018]. Open-point states open, in progress, closed, with traffic lights [BRM REQ-PROC-034].
  - The effect of a rejected subprocess is open [ReqDoc p.5 §3.3.2; KB OpenPoints NEW-04].
- **Proposed default:** One documented status model with a derivation table. A limited supplier-facing set ("Action required", "Under BDF review", "Completed").
- **Risk:** Dashboards disagree, and internal states are exposed.
- **Ask:** "What should the overall status show when departments are in different states? Which statuses may the supplier see?"

---

## 12. Non-functional: performance, concurrency, availability, language, time, environments

### E-D-96 · Volumes and performance · **High**
- **Scenario (inferred):** A natural extract with 40 components, per-component annexes, 26 allergens, a metals list, 30 documents with versions and 50 open points. Form load time, PDF size and portfolio dashboards all suffer.
- **Docs:** Volumes are **undefined**. Components can be "any number" [ReqDoc p.6; BRM REQ-CFG-002]. The IKW template lists 26 fragrance allergens and 13 named metals plus "other" [IKW p.7–9]. Our answer is generic ("thousands of concurrent users") [VQ 'Scalability'].
- **Proposed default:** Test with a worst-case dataset before the MVP demo.
- **Risk:** A slow demo that loses the comparison.
- **Ask:** "Roughly how many CIQs per year, suppliers and BDF users? What is the largest composition you see, in components and documents?"

### E-D-97 · Concurrent editing by several supplier contacts · **High**
- **Scenario (inferred internal design risk):** If the questionnaire is one record saved as a whole, two users editing different sections can overwrite each other. Also the same field at the same time, and a reviewer and supplier at the same time.
- **Docs:** Two supplier users on different sections at once "without data loss" is the acceptance criterion [BRM REQ-CTL-001]. Our answer says sequential or parallel [CIA #6].
- **Proposed default:** A data model where each section or table saves independently, or optimistic locking with a conflict message.
- **Risk:** Fails an explicit acceptance test.
- **Ask:** "Do several supplier colleagues fill in one questionnaire at the same time, even the same section?"

### E-D-98 · Availability, RPO/RTO, support hours · **Medium**
- **Scenario:** A 24 h RPO can lose a supplier's day of input, including confirmations. Weekend outages fall outside 24/5 support. Maintenance windows span global time zones.
- **Docs:** Our answers: RPO 24 h, RTO 48 h [VQ 'Business continuity']; 99% uptime [VQ 'Contract flexibility']; 24/5 support [VQ 'Support model']. Global markets [ReqDoc p.11 SF-11].
- **Proposed default:** Agree targets explicitly. Consider a private cluster if stricter targets are needed.
- **Risk:** Lost submissions, and an NFR gap against the competitor.
- **Ask:** "What availability and data-loss tolerance does BDF IT expect for a supplier-facing tool?"

### E-D-99 · Data residency · **Medium**
- **Scenario:** BDF requires EU-only hosting, including backups and AI processing.
- **Docs:** Our answers: hosted primarily on GCP; EU data centres "upon request"; backups across AWS and GCP [VQ 'Architecture model', 'Data protection / GDPR', 'Information security'].
- **Proposed default:** EU region for data, backups and AI. Confirm internally.
- **Risk:** A compliance blocker.
- **Ask:** "Does BDF require EU-only hosting for data and backups?"

### E-D-100 · Multiple languages · **High**
- **Scenario:**
  - Supplier UI language (EN only, or also DE, ZH, TR, PT?).
  - Translated questions and help texts, versioned.
  - Which language is binding for declarations.
  - Free-text answers in other languages.
  - Notification and PDF language.
  - Translations must not change stored codes.
- **Docs:** **Undefined** in the BDF requirements. The FLM was translated from German [FLM changelog r9]. Regional language support via partners [VQ 'Support model']. Supplier guidance [CIA #34].
- **Proposed default:** English only in the MVP. Labels kept separate from codes for later languages.
- **Risk:** Low supplier adoption, and mis-answers.
- **Ask:** "Which languages must suppliers be able to use? Is English the binding language?"

### E-D-101 · Time zones · **Medium**
- **Scenario:** Is "due 15 March" end of day in Hamburg or in the supplier's local time? Reminders arrive at 02:00 local time. PDF timestamps are printed without a zone.
- **Docs:** Timestamps on confirmations and audit [BRM REQ-PROC-014, REQ-CTL-009]. Due dates [BRM REQ-ADR-001, REQ-CTL-003]. Time-zone handling is **undefined**.
- **Proposed default:** Store UTC. Due dates in CET/CEST, shown with the zone. The PDF prints the UTC offset.
- **Risk:** Disputes over overdue tasks.
- **Ask:** "Are deadlines based on Hamburg time?"

### E-D-102 · Test vs production, and promoting configuration · **High**
- **Scenario (inferred):**
  - Configuration is published in test, but how does it reach production?
  - Rule tables stored as data do not travel with app deployments, so the environments drift.
  - Real supplier data ends up in test.
  - Test e-mails reach real suppliers.
- **Docs:** The admin "publishes ... in the test environment" [BRM REQ-CFG-001]. Our answer: an isolated sandbox and process simulator [VQ 'Change management and training'].
- **Proposed default:** One promotion path, with the template, rules and section map moved as one versioned package. Test sends no external e-mail except to an allow-list. Synthetic test data only.
- **Risk:** Production misconfiguration and GDPR issues.
- **Ask:** "Should the business admin test changes in a test environment and then publish to production themselves? May test ever contain real supplier data?"

### E-D-103 · Maintainability over many years · **Medium**
- **Scenario (inferred):** Platform releases change behaviour. Hundreds of admin changes over years. Nobody remembers why rule R-14 exists.
- **Docs:** The client goal "built once, runs for years" was stated to us, not in the documents. No-code configuration [CIA #4]. Regression testing is not mentioned anywhere.
- **Proposed default:** A change log with business reasons, an automated regression set of reference cases, and configuration documentation generated from the data.
- **Risk:** Decay and hidden defects.
- **Ask:** "Who will support the app after go-live, and how should changes be tested before release?"

---

## 13. Integrations (later phases, but keys must be designed now)

### E-D-104 · Teamcenter trigger: duplicates and correlation keys · **Medium**
- **Scenario:** A duplicate trigger creates two cases. A trigger arrives for a raw material that already has an active case. MVP manual cases later need linking to Teamcenter objects.
- **Docs:** The trigger is currently outside the target system [ReqDoc p.3 §3.1.1]. Integrations are out of scope in 2026 (OP-13) [ReqDoc p.2 §1.1]. Teamcenter start is a Must [CIA #1]. BDF material number / IRMA reference [KB ConfigQuestions BD-04]. Teamcenter auto-fill is post-MVP [FLM r3].
- **Proposed default:** Store the external reference as a unique key from day one. A duplicate check on (supplier, raw material, site, active).
- **Risk:** Duplicates, and costly retrofitting.
- **Ask:** "Which BDF reference (material number, IRMA ID) identifies a case, so we can link it to Teamcenter later?"

### E-D-105 · B-Flow filing and status feedback · **Medium**
- **Scenario:** Filing fails but the case shows closed. A retry duplicates documents in B-Flow. Status feedback is sent before the overall decision. In the MVP filing is manual.
- **Docs:** File in B-Flow and give status feedback [ReqDoc p.5 §3.3.3]. Our answers [CIA #12, #15, #18]. Re-run of failed integrations [CIA #33].
- **Proposed default:** A state "closed – filing pending" until confirmed. Idempotent filing by document ID. A failure queue visible to RMM.
- **Risk:** Records are missing from the archive.
- **Ask:** "Which status values must go back to Teamcenter, and when?"

### E-D-106 · Source of truth for master data · **Medium**
- **Scenario:** A contact e-mail changes in SAP but not in the tool.
- **Docs:** Auto-fill from supplier master data [FLM r4, r7–r9]. SAP MDG is on the integration list [ReqDoc p.2 §1.1]. Supplier contact database is Nice-to-have [CIA #24].
- **Proposed default:** A local master in the MVP. Later, sync in one defined direction.
- **Risk:** Notifications go to the wrong person.
- **Ask:** "Which system owns supplier and contact data today?"

---

## 14. Specification data quality found during the hunt

### E-D-107 · Requirement traceability gaps in the shared files · **Medium**
- **Scenario:** We test against requirement IDs we cannot see, and review notes are lost.
- **Docs:**
  - The FLM and the old catalogue cite IDs that are not in the BRM: REQ-PROC-003, -104, -106, REQ-CFG-102, -103, -105, REQ-CTL-012 and REQ-ADR-003 [FLM r3–r5, r8, r16; Feldkatalog r27, r49].
  - The old catalogue's column L is "Ref. v3.1 (REQ-ID)" [Feldkatalog r1].
  - FLM column B "CIQ Requirement ID" is **hidden**.
  - The changelog refers to a "Remarks / Open Points" column that **no longer exists** in 'CIQ new version' (columns A–M). Its [Review] notes are truncated at about 200 characters **in the source .xlsx itself** (verified) [FLM changelog r23, r35, r123, r126, r132, r162].
- **Proposed default:** Ask for the v3.1 catalogue, or confirmation that the BRM supersedes it, and the full review notes.
- **Risk:** Hidden requirements surface at acceptance.
- **Ask:** "Can you share the v3.1 requirements catalogue, or confirm the BRM replaces it, and the full text of the [Review] notes in the field matrix?"

---

## 15. INTERNAL (Kissflow only, do not share): submitted answers that these edge cases will test

Nothing below states how our platform behaves. Each row lists something to **verify internally** before the MVP.

| Our submitted claim | Where | Edge cases that test it | Verify |
|---|---|---|---|
| "complete, immutable audit trail", "immutable audit log", "unalterable even by platform admins" | [CIA #9], [CIA #11], [VQ 'Audit trail and timestamps'] | E-D-85, E-D-18, E-D-88, E-D-86 | Does the native log capture source-version and rule-version links? Can an admin delete attachments or items? Can the log be exported? |
| Section-level permissions per supplier contact (read-only, editable, hidden) | [CIA #6] | E-D-78, E-D-97, E-D-74 | Field-level security vs record-level. Is concurrent editing of one item safe? |
| Contextual Q&A where users and suppliers comment and tag | [CIA #10] | E-D-76, E-D-74, E-D-75 | Can internal and external threads be strictly separated on one record? |
| No-code authorisation matrix for BDF and suppliers per process area | [CIA #19] | E-D-80, E-D-77, E-D-64 | Per-attachment visibility. Portal user scoping by supplier organisation. |
| External portal with per-supplier role structures | [CIA #26] | E-D-77, E-D-79, E-D-82 | Domain restrictions, supplier-admin invites, MFA for portal users. |
| Teamcenter and B-Flow integrations "fully"/"seamlessly"; re-run failed runs | [CIA #1, #12, #15, #18, #32, #33] | E-D-104, E-D-105 | Idempotency, failure queues, document ID handling. |
| AI assistance governed by admins; Smart OCR | [VQ 'Analytics / AI'] | E-D-81 | Which model provider, which region, and is it on the subprocessor list [VQ 'Subprocessors']? |
| No native configurable retention or legal hold | [VQ 'Archiving and retention'] | E-D-87, E-D-86, E-D-92 | Our weakest admitted point. Prepare a mitigation (B-Flow export, manual archive procedure). |
| RPO 24 h, RTO 48 h, 99% uptime, 24/5 support | [VQ 'Business continuity', 'Contract flexibility', 'Support model'] | E-D-98 | Whether a private cluster or a better SLA can be offered. |
| Isolated sandbox and process simulator | [VQ 'Change management and training'] | E-D-102, E-D-32 | How configuration-as-data (rule tables, limit masters) is promoted between environments. |
| Encryption, pen tests, vulnerability management | [VQ 'Information security'] | E-D-58 | Malware scanning of uploads. |

---

## 16. Severity summary

| Severity | Count | IDs |
|---|---|---|
| Critical | 9 | E-D-01, 03, 06, 18, 41, 53, 74, 77, 85 |
| High | 54 | E-D-02, 04, 05, 07, 08, 09, 13, 16, 17, 19, 20, 21, 23, 25, 27, 28, 29, 31, 32, 33, 36, 38, 42, 44, 49, 50, 55, 56, 57, 58, 59, 60, 63, 64, 66, 67, 69, 70, 72, 75, 76, 78, 79, 81, 82, 86, 87, 88, 89, 95, 96, 97, 100, 102 |
| Medium | 41 | E-D-10, 11, 12, 14, 22, 24, 26, 30, 34, 35, 37, 39, 40, 43, 46, 47, 48, 51, 54, 61, 62, 65, 68, 71, 73, 80, 83, 84, 90, 91, 92, 93, 94, 98, 99, 101, 103, 104, 105, 106, 107 |
| Low | 3 | E-D-15, 45, 52 |
| **Total** | **107** | |
