# CIQ Digital vs. Field-Level Requirements Matrix v0.6 (EN): conformance report

Kissflow-internal. Do not cite or share with Beiersdorf. 28 Oct 2026.

- **Reference:** `Refrences_Shared_By_Client/CIQ_Field_Level_Requirements_Matrix_v0.6_EN.xlsx`, sheet "CIQ new version" (50 rows), and its change log (Notes sheet). The historical German sheet "Feldkatalog (Feldebene)" was used for background only.
- **Method:** the 50 rows were split into four slices (A–D). In each slice one reviewer compared the matrix with the code, and a second reviewer (the skeptic) re-checked the comparison independently. **The statuses below are the skeptic's final verdicts.** Where the two disagreed, the report says so.
- **Scope of the check:** read-only review of `prototype/src`, which holds the questionnaire catalogue, the rules, and the supplier and reviewer screens of both the portal and the internal app. Nothing was run against Kissflow, `.env` was not read and no project file was changed. Slice B ran one local domain probe (a scratch script that changes no project files).
- **References:** every `file:line` below is relative to `prototype/src/`. "Row" is the 0-based position in the matrix data (row 0 = FLD-GEN-001).

---

## 1. Summary

| Status | Rows | Share |
|---|---:|---:|
| Match | 11 | 22 % |
| Partial | 22 | 44 % |
| Deviation | 17 | 34 % |
| Missing | 0 | – |
| Uncertain | 0 | – |
| **Total** | **50** | |

Of the 39 rows that are not a match: 3 are high severity, 18 medium and 18 low.

How to read the counts:

- **One field can have several rows.** The 50 rows hold 39 distinct field IDs: FLD-2.3-01 (Source of origin) has 8 rows, one per option, and FLD-A2-102 (Manufacturing process) has 5. An issue on one of these fields is counted on every row of that field. The 17 deviations come from about 8 root causes.
- **Why "missing" is 0.** Every matrix field exists in the app. What is missing is always an attribute of a field: an upload, a pre-fill or a check. Those rows are counted as partial or deviation.
- **Where the reviewers disagreed.** On 5 rows the skeptic raised the comparer's *partial* to *deviation*: FLD-A1-102, FLD-A1-103 and FLD-A1-104 (rows 29, 31, 32), FLD-A1-204 (row 43) and FLD-A4-102 (row 48). The comparer's own totals were 11 match, 27 partial and 12 deviation.

Main findings:

1. **Show/hide is built as the matrix says.** 21 rows are marked Dependent = Yes. For 20 of them the app's show/hide condition matches the matrix's "Controlled by" exactly. The exception is FLD-A2-101, whose pre-fill is missing (§3). "Conditional mandatory" means *required only while visible* everywhere in the app (selectors.ts:82-85, 121-128).
2. **High severity: the K2.1 composition table is not enforced.** Mandatory INCI, mandatory Function and the concentration rules exist only as messages in the UI. A blank or invalid component row passes the completeness confirmation.
3. **Origin decides fewer annexes than the matrix says.** The app follows AS-05, agreed with Beiersdorf on 12 Oct (the matrix file was last modified on 2 Oct). Annexes A3, A7, A11 and A12 open through their own questions, not through the origin, and A10 is always on.
4. **Two uploads attached to non-file fields are not built:** the FLD-A1-208 certificate and the FLD-A4-103 analytical data.
5. **Approval routing differs from the matrix.** Annex 1 is decided by Sustainability, where the matrix says Regulatory. Annex 2 is decided by Safety and K2.1 by Regulatory, where the matrix says RMM.
6. **Three fields are in Annex 1 instead of the always-shown block:** FLD-A1-102, -103 and -104. The matrix shows them for every case.
7. **Palm is asked twice** (SF-08 and FLD-A1-204), and the two answers are not linked.
8. **Number checks are missing:** max. 2 decimals for the natural origin index, MOAH ≥ 0 and viscosity > 0.

---

## 2. Deviations to fix

**Change-type legend**

| Label | What it means |
|---|---|
| **Config** | A new configuration version made in the app's config editor: a questionnaire version, a rule-set version, or both. Only new cases get it; running cases keep their pinned versions. |
| **Owners** | The Section owners setting (Admin › Section owners). It is not versioned. |
| **Code** | A change in `prototype/src`, followed by new app and portal bundles. A change to a built-in field in `domain/catalog.ts` changes questionnaire v1 and v2 for **every** case, running cases included, because v1 and v2 hold exactly the built-in fields (`BUILTIN_FIELDS`, catalog.ts:243). |

Facts that decide between Config and Code:

- A configuration version that changes a built-in field's **type** drops that field's `showWhen` and `validate` (catalog.ts:475, 487-488). So a type change on a conditional field, or on a field that other fields depend on, has to be made in code.
- A question the administrator adds has **no `showWhen`** (hydrateField, catalog.ts:472-492). A new *conditional* field therefore needs code.
- Rule conditions can only test the metadata questions SF-xx. They cannot test a questionnaire field, because every condition kind takes a `ConfigQuestionId` (domain/types.ts:140-145). The metadata questions themselves are code (`CONFIG_QUESTIONS`, catalog.ts:180-233).
- The config editor can add, edit, reorder and remove questions *within* a section. It cannot move a question to another section (features/admin/QuestionnaireEditor.tsx:361-407; domain/configActions.ts:953-968).

### 2.1 High

| # | Field ID (rows) | Matrix | App (file:line) | Suggested fix | Change |
|---|---|---|---|---|---|
| H1 | FLD-2.1-001 INCI (7), FLD-2.1-005 Function (11), FLD-2.1-007 Concentration range (12). The same enforcement gap applies to FLD-2.1-002 and -003 (M1, M2). | INCI and Function are mandatory for every component. Concentration is mandatory, 0–100 %, min ≤ max. | **Marked in the UI only.** The table shows an asterisk, plus "Required" after blur (features/supplier/ComponentTable.tsx:151, 160, 172; checks at :24-32, 114-116).<br><br>**Saved unchecked.** The domain write (domain/actions.ts:501-510) and the portal write (portal/data/LiveSupplierStore.tsx:450-456) store rows without checking them.<br><br>**One gate only.** `completenessBlockers` checks only that at least one row exists (domain/selectors.ts:181). The portal's confirm uses the same gate (portal/data/liveActions.ts:361-362).<br><br>**Blank concentration becomes 0.** It is stored as 0 (ComponentTable.tsx:18-22) and shows as "0–0 %" in the RMM tab, the review table and the final document (QuestionnaireSections.tsx:460; FinalDocumentTab.tsx:204; review/ComponentTable.tsx:53).<br><br>**Probe result:** a blank row, an 80–120 % row and a 60–10 % row all reached phase *review*. | **Shared check:** add one shared per-row check in the domain and call it from `completenessBlockers`. It raises a blocker per row for: an empty INCI, an empty Function, a missing min or max, a value outside 0–100, and min > max.<br><br>**Blank concentration:** store it as `null` (types.ts:130-131) and show it as "—".<br><br>Because both containers use the same gate, one fix covers the portal and the app. | Code |

### 2.2 Medium

| # | Field ID (rows) | Matrix | App (file:line) | Suggested fix | Change |
|---|---|---|---|---|---|
| M1 | FLD-2.1-002 CAS No. (8) | CAS format with check digit, validated only if filled | Format and check digit are implemented correctly (features/supplier/cas.ts:4-12), but only in the UI. An invalid CAS is stored and does not block (ComponentTable.tsx:114, 154; selectors.ts:181). Scalar fields, by contrast, do block on a failed `validate` (selectors.ts:179). | Move `casError` into the domain. Raise a blocker when the field is filled and invalid (part of the H1 per-row check). | Code |
| M2 | FLD-2.1-003 EC number (9) | EINECS / ELINCS / NLP **or REACH registration no.**, validated only if filled | Only the format 123-456-7 is accepted (cas.ts:15-21). A REACH number such as 01-2119457892-27-0000 gets "Use the EC format 123-456-7". The check is UI-only, and the label and placeholder don't mention REACH (ComponentTable.tsx:157-158). | Also accept `/^01-\d{10}-\d{2}-\d{4}$/`. Relabel to "EC number (EINECS/ELINCS/NLP) or REACH registration no.". Enforce when filled. | Code |
| M3 | FLD-2.1-102 Natural origin index (30) | 0–1, decimal, max. 2 decimals | The 0–1 range is checked and blocks. The 2-decimal limit is not checked; only the help text mentions it (catalog.ts:269). The probe accepted 0.333. | Extend `validate`: if `Math.abs(v*100 − Math.round(v*100)) > 1e-9`, return "Max. 2 decimals". | Code |
| M4 | FLD-2.3-01 Source of origin: Bio Mass (13), Animal (14), Petrochemical (17), Mineral (19), Polymer (23) | Annexes opened by each origin:<br>• Bio Mass: 1, 2, 3, 9, 10, 11, 12<br>• Animal: 10, 11, 12<br>• Petrochemical: 1, 4, 9, 10, 11, 12<br>• Mineral: 1, 7, 10, 11, 12<br>• Polymer: 1, 6, 10, 11, 12 | The rules follow AS-05 (builtinRules.ts:3-4):<br>• A3 opens only through SF-06 = Yes (:29).<br>• A7 opens only through SF-05 = Colorant (:27).<br>• A11 opens only through SF-11 = UK (:34).<br>• A12 opens only through SF-11 = TR (:43-48), and only in RS-2026.2.<br><br>Questionnaire v1 has no A12 at all (catalog.ts:384), and RS-2026.2/v2 is still only the editable draft. | **Decision D1.** If the matrix wins: in a new rule-set version, add A3 to R-10, A7 to R-13, and A11 + A12 to R-10, R-12, R-13, R-14 and R-15. A12 also needs questionnaire v2 published. | Config (rule set + questionnaire v2) |
| M5 | FLD-2.3-01: Bio Mass (13), Petrochemical (17), Polymer (23) | Upload Required: No. Polymer opens Annex 1, 6, 10, 11 and 12 only. | The app asks for extra uploads, each required while visible:<br>• FLD-K1-005 Sustainability certificates (Vegetable)<br>• FLD-K1-008 PAH analysis (Petrochemical)<br>• FLD-K1-009 Residual monomer content and FLD-K1-010 SPM scope statement (Polymer)<br>(catalog.ts:261-266; rules.ts:164-173)<br><br>Polymer also opens chapter K4.3 (R-15, builtinRules.ts:23). All of this comes from ReqDoc §5.4, not from the matrix. | **Decision D4.** To drop them: remove the questions in a new questionnaire version, and remove the evidence items and K4.3 in a new rule-set version. Then check `EVIDENCE_FIELDS` (rules.ts:160-176) so that the evidence does not come back as a requested-document slot. | Config. Check whether rules.ts needs a code change too. |
| M6 | FLD-2.3-01 field type: rows 13, 14, 17, 19, 23 (also on 21, 25, 27) | Radio button: one origin. [Review] R4 is still open. | SF-01 is a multi-select at material level (catalog.ts:182-190). Each component row also has a single-select origin (ComponentTable.tsx:163-170). This follows AS-04 (catalog.ts:823).<br><br>Nothing checks that the component origins agree with SF-01:<br>• a new row defaults to `origins[0]` (:70);<br>• a stale origin is kept (:165);<br>• the scope is derived from SF-01 only (rules.ts:116-140). | **Decision D6** (R4). Independent of R4: add a completeness check that every component's origin is one of the SF-01 answers. | Code |
| M7 | FLD-A1-102 Feedstock (29), FLD-A1-103 Content % in INCI (31), FLD-A1-104 Content % in raw material (32) | Meta Data block: always shown, mandatory for every case, approval RMM. The change log says they were moved out of Annex 1 table 1. Open points R5/R6 (on 103/104) propose "only if Annex 1 applies". | The three fields are in section A1 (catalog.ts:300-302). They are shown and required only while A1 is in scope (selectors.ts:124-127), so they are never asked for materials that are only Animal, CCU, Waste or Chemical recycling. The A1 lead SUS decides on them (catalog.ts:125). | **Decision D3.** If the matrix wins: move the three fields to K2.3 (lead RMM). For 103/104, R5 proposes exactly what the app does today, so BDF may simply accept it. | Code (the editor cannot move a field between sections) |
| M8 | FLD-A1-104 (32) | Consistency check against the concentration range FLD-2.1-007 | Not built: catalog.ts:302 has only the 0–100 % check. FLD-A1-104 is one value per case, while the ranges are per component. | Add a soft warning when FLD-A1-104 is outside the related component's [min, max], or outside the total. First ask BDF which component it refers to. | Code |
| M9 | FLD-A2-101 INCI / IUPAC (33) | Pre-filled from FLD-2.1-001; editable | Nothing pre-fills it; only seed data writes it (actions.ts:229-235; richFixture.ts:229). The help text "Pre-filled from the composition; editable." is therefore untrue (catalog.ts:323). | Pre-fill it from the case's main INCI (types.ts:398) or from the component INCIs when A2 opens. Until then, remove the help text. | Pre-fill: Code. Help text: Config. |
| M10 | FLD-A2-102 Manufacturing process (34; same issue, low, on 35-38) | Single-select. Open [Review]: the CIQ uses checkboxes. | Multi-select, with the help "Several may apply." (catalog.ts:328, 333) | **Decision D7.** If single: set the type to single and change FLD-A2-103's `showWhen` to an equality check. | Code. A type change in config would break FLD-A2-103's `showWhen` (catalog.ts:335). |
| M11 | Approval: FLD-A1-201…208 (40-46), FLD-A2-101…103 (33-39), K2.1 (7-12, 30), FLD-A1-102/103/104 (29, 31, 32) | A1-2xx: Regulatory. A2, K2.1 and A1-10x: RMM. (40 rows say RMM, 7 Regulatory, 3 Safety, so the column is deliberate.) | Review is routed by the section lead only (selectors.ts:221-236):<br>• A1: lead SUS, co SAF (catalog.ts:125)<br>• A2: lead SAF, co REG (:126)<br>• K2.1: lead REG (:94)<br><br>RMM's whole-CIQ track always exists (actions.ts:704), but it is "Not a raw-material approval" (actions.ts:1058). The per-field `owner` and the rule `departments` are display text only. | **Decision D2.** Either change the leads in Section owners (A1 → REG; A2 and K2.1 → RMM), or confirm the current leads with BDF. Note that the ReqDoc names Regulatory for K2.1. | Owners (setting). Field-owner text: Config. |
| M12 | FLD-A1-204 Palm used as feedstock (43). Extra Annex 1 trigger on 40 and 43. | FLD-A1-204 is the explicit palm input (change log row 32). Annex 1 opens only for Bio Mass, Mineral, Petrochemical or Polymer. | Palm is asked twice:<br>• SF-08 (catalog.ts:208) opens A1 on its own and requests RSPO evidence (R-80, builtinRules.ts:31).<br>• FLD-A1-204 (catalog.ts:306) shows FLD-A1-206.<br><br>The two answers are not linked. With SF-08 = Yes and A1-204 = No, the RSPO fields stay hidden, yet the RSPO evidence still counts as collected, because requestedDocs.ts:58-62 checks only the section scope, not whether the field is visible. | **Decision D5.** Preferred: drop SF-08, open A1 by origin only, and let A1-204 drive RSPO. Alternative: keep SF-08 and A1-204 in sync. At minimum, count the RSPO evidence as collected only while FLD-A1-206 is visible. | Code (a rule cannot test A1-204, and SF-08 is code) |
| M13 | FLD-A1-208 Other certification (name) (46) | Upload Required: Yes, a certificate attached to this field. Open [Review]: the upload is a BDF extension. | Text field only, with no upload. FieldRenderer offers an upload only for type `file` (FieldRenderer.tsx:95-97, 174-191). The label "…, certificate attached" promises an upload that cannot be made (catalog.ts:320). | Add a conditional file field shown when FLD-A1-207 = Yes, or support attachments on text fields; wait for BDF's answer first. Fix the label now. | New field: Code. Label: Config. |
| M14 | FLD-A4-101 MOAH concentration (47) | Number ≥ 0. Annex 4 opens only for Petrochemical. Unit to be clarified ([Review]). | No `validate`, so negative values are accepted (catalog.ts:338; actions.ts:487-499). A4 also opens through SF-07 = Yes (R-70, builtinRules.ts:30). The unit mg/kg is one of the matrix's own assumptions. | Add `validate`: v < 0 → "Must be 0 or more". Confirm the unit with BDF. Decide whether SF-07 may open A4. | Check: Code. SF-07 trigger: Config. |
| M15 | FLD-A4-103 Kinematic viscosity (49) | Number > 0. Upload Required: Yes, analytical data if a value is entered. Type Checkbox + Number. | No `validate`, so 0 and negative values are accepted. No upload: only the help text "Attach analytical data if you enter a value." (catalog.ts:353). The analogy / own-value choice sits in A4-102. | Add `validate`: v ≤ 0 → "Must be greater than 0". Add a conditional file field shown when a value is entered. Optionally restructure together with A4-102 (L11). | Code |

### 2.3 Low

| # | Field ID (rows) | Matrix | App (file:line) | Suggested fix | Change |
|---|---|---|---|---|---|
| L1 | FLD-GEN-009 Contact person e-mail 2 (3) | E-mail format validation; manual entry possible | No `validate` (catalog.ts:248; FLD-GEN-008 at :247 has one). The value can only come from a second master contact and cannot be typed by hand. The live app cannot change contacts after case start (app-live/api.ts:391). | Add FLD-GEN-008's `validate`. It shows inline only, because optional fields are not format-checked at completeness (selectors.ts:127, 176-179). Ask BDF about a typed, notification-only e-mail (D9). | Code |
| L2 | FLD-GEN-004 Manufacturer (5), FLD-GEN-005 Production site (6) | Auto-fill from master data "possible" | Not pre-filled. The supplier master holds no address or site (actions.ts:218-219, 229-235; types.ts:691-705). | Optional. Pre-fill the manufacturer from the master's name, city and country when the supplier type is manufacturer, or record this as a simplification. | Code |
| L3 | FLD-GEN-005 (6), related | One production site; FLD-GEN-006/-007 dropped | Metadata question SF-02 "Are there additional production sites?" is still asked, and no rule uses it (catalog.ts:211; features/supplier/ConfigQuestions.tsx:29-35). The help text carries the internal remark "(aligned with business departments)" (catalog.ts:251). | Remove SF-02. Its other references are conditions.ts:119, features/understanding/content.ts:96, features/rmm/tabs/QuestionnaireSections.tsx:300 and the test fixtures. Shorten the help text to "One production site per CIQ." | SF-02: Code. Help text: Config or Code. |
| L4 | FLD-2.1-001 label and guidance (7) | "INCI (European) / IUPAC". If there is no INCI, the IUPAC name; for colorants, also the Colour Index no. | Labelled "INCI name", with no guidance (ComponentTable.tsx:151-152) | Rename the column and add the help text. | Code (the component table is not a catalogue field) |
| L5 | FLD-2.1-004 Additive (10) | Mandatory Yes/No, no default | A checkbox that defaults to No (ComponentTable.tsx:70, 137) | Optional: an explicit Yes/No (`boolean \| null`) checked in the per-row check. Follow-up fields wait for the BDF [Review]. | Code |
| L6 | FLD-2.3-10 Country of origin (16) | Controls "Annex 1 – Country of origin (auto-fill)" | Neither the matrix nor the app has such an Annex 1 field (catalog.ts:293, 300-320). | Ask BDF which field it means. If one is needed, add a read-only A1 field pre-filled from FLD-2.3-10. | Code |
| L7 | FLD-2.3-01: CCU (21), Waste (25), Chemical recycling (27) | No annexes | A10 is always on (R-00, builtinRules.ts:16). A11 (UK) and A13 (any non-EU market) open by market (:34, :38). The case is flagged for RMM (R-16, :24). | **Decision D1.** Confirm that A10 and the market annexes apply to these origins, or exempt them by splitting A10 out of R-00. | Config (rule set) |
| L8 | FLD-A2-102: Physical, Enzymatic, Biotechnology / Fermentation, Other (35-38) | Single-select. Biotechnology / Fermentation controls Annex 3 if GMO, "outside test scope". | Multi-select. The option drives nothing; A3 opens through SF-06 (builtinRules.ts:29). | As M10. Optionally flag Biotechnology / Fermentation together with SF-06 = No for the reviewer. | Code |
| L9 | FLD-A2-103 Manufacturing process (individual) (39) | Free text, e.g. hydrolysis, refining, synthesis, fermentation | No help or example text (catalog.ts:335) | Add the example as help text. | Config |
| L10 | FLD-A1-203 Reason if not present (42) | Text | Long text (catalog.ts:305). This is equivalent, so it is minor. | Optional: change the type to text. | Code (a type change in config drops its `showWhen`) |
| L11 | FLD-A4-102 Viscosity availability (48) | Options: Not available / Available. The analogy / own-value choice belongs in FLD-A4-103. | Three options: Not available / Available — conclusion by analogy / Available — own value (catalog.ts:344-348). Also opened by SF-07. The captured data is equivalent. | Reduce to two options and move the choice to A4-103, or get BDF's OK on the current form. | Code (A4-103's `showWhen` tests these values, catalog.ts:353) |
| L12 | FLD-A1-202, -203, -206, -207 (41, 42, 44, 45) | Approval: Regulatory | Decided by the A1 lead, SUS | Covered by M11. | Owners |

**Side issues (confirmed, but not matrix attributes; both low, both code):**

- **Final document header uses current master data.** The header takes the supplier name and DUNS from the *current* master (domain/finalDocument.ts:86, 134-135). A master edit, however, states that running cases keep their start data (domain/suppliers.ts:218). Use the case's FLD-GEN-002 and FLD-GEN-003 instead.
- **The supplier's refusal text offers an edit nobody can make.** On a locked BDF field it says "Ask <owner> to change it" (actions.ts:492), but no capability lets anyone edit the trade name, supplier or DUNS after case start (domain/permissions.ts:26-31). Reword the text, or add an RMM edit action.

---

## 3. Show/hide (dependency) table

### 3.1 Every row the matrix marks Dependent = Yes (21)

| Row | Field | Matrix "Controlled by" | App `showWhen` / scope (file:line) | Match |
|---|---|---|---|---|
| 2 | FLD-GEN-008 Contact e-mail | Supplier master data | The value comes from the first active case contact's master e-mail (actions.ts:232; suppliers.ts:119-131). Live, it is fixed at case start (app-live/api.ts:391). Always visible. | Yes |
| 15 | FLD-2.1-101 Part | FLD-2.3-01 = Bio Mass (vegetable) or Animal | SF01 includes vegetable or animal (catalog.ts:292) | Yes |
| 16 | FLD-2.3-10 Country of origin | FLD-2.3-01 = Bio Mass or Animal | SF01 includes vegetable or animal (catalog.ts:293) | Yes (its own "Controls" auto-fill is missing, L6) |
| 18 | FLD-2.3-11 Fossil specification | FLD-2.3-01 = Petrochemical | hasOrigin('petrochemical') (catalog.ts:286) | Yes |
| 20 | FLD-2.3-12 Mineral specification | FLD-2.3-01 = Mineral | hasOrigin('mineral') (catalog.ts:287) | Yes |
| 22 | FLD-2.3-13 CCU specification | FLD-2.3-01 = CCU | hasOrigin('ccu') (catalog.ts:288) | Yes |
| 24 | FLD-2.3-14 Polymer specification | FLD-2.3-01 = Polymer | hasOrigin('polymer') (catalog.ts:289) | Yes |
| 26 | FLD-2.3-15 Waste specification | FLD-2.3-01 = Waste / Side stream | hasOrigin('waste') (catalog.ts:290) | Yes |
| 28 | FLD-2.3-16 Chemical recycling specification | FLD-2.3-01 = Chemical recycling | hasOrigin('chemrec') (catalog.ts:291) | Yes |
| 33 | FLD-A2-101 INCI / IUPAC | FLD-2.1-001 (pre-fill) | No pre-fill. Shown whenever A2 is in scope (A2 opens for vegetable only, builtinRules.ts:19). | **No** (M9) |
| 39 | FLD-A2-103 Manufacturing process (individual) | FLD-A2-102 = Other | FLD-A2-102 includes 'Other' (catalog.ts:335). This is the multi-select form of the same test. | Yes |
| 40 | FLD-A1-201 Pesticides analysis available | Annex 1 active (Bio Mass, Mineral, Petrochemical, Polymer) | A1 opens through R-10, R-13, R-14 and R-15 (builtinRules.ts:19, 21-23), **plus** SF-08 = Yes (R-80, :31) | Yes, with one extra trigger |
| 41 | FLD-A1-202 Pesticides analysis (upload) | FLD-A1-201 = Yes | `=== true` (catalog.ts:304) | Yes |
| 42 | FLD-A1-203 Reason if not present | FLD-A1-201 = No | `=== false` (catalog.ts:305) | Yes |
| 43 | FLD-A1-204 Palm used as feedstock | Annex 1 active | As row 40, including the extra SF-08 trigger | Yes, with one extra trigger (palm duplication, M12) |
| 44 | FLD-A1-206 RSPO certification | FLD-A1-204 = Yes | `=== true` (catalog.ts:317) | Yes |
| 45 | FLD-A1-207 Other certification available | FLD-A1-206 = No RSPO certification | `=== 'No RSPO certification'` (catalog.ts:319) | Yes |
| 46 | FLD-A1-208 Other certification (name) | FLD-A1-207 = Yes | `=== true` (catalog.ts:320) | Yes |
| 47 | FLD-A4-101 MOAH | Annex 4 active (Petrochemical) | A4 opens through R-14 (builtinRules.ts:22), **plus** SF-07 = Yes (R-70, :30) | Yes, with one extra trigger |
| 48 | FLD-A4-102 Viscosity availability | Annex 4 active (Petrochemical) | As row 47 | Yes, with one extra trigger |
| 49 | FLD-A4-103 Viscosity value | FLD-A4-102 = Available | `'Conclusion by analogy' \|\| 'Own value'`, the two "Available" options (catalog.ts:353) | Yes (equivalent) |

Caveat on all conditional chains: a required yes/no controller (FLD-A1-201, FLD-A1-204) and FLD-A4-102 offer "Cannot provide? Add a justification" (FieldRenderer.tsx:54, 278-282). A justification satisfies completeness, and the dependent fields then stay hidden. The matrix chain "Yes → upload, No → reason" can therefore be skipped. The BRM allows this (REQ-PROC-012), so it is not counted as a deviation (decision D10).

### 3.2 Rows the matrix shows always (Controlled by = n/a) but the app makes conditional

| Row | Field | Matrix | App | Match |
|---|---|---|---|---|
| 29 | FLD-A1-102 Feedstock | n/a; Meta Data; mandatory | Section A1, only while A1 is in scope (catalog.ts:300) | **No** (M7) |
| 31 | FLD-A1-103 Content % in INCI | n/a; Meta Data; mandatory ([Review] R5 open) | Section A1 (catalog.ts:301) | **No** (M7) |
| 32 | FLD-A1-104 Content % in raw material | n/a; Meta Data; mandatory ([Review] R6 open) | Section A1 (catalog.ts:302) | **No** (M7) |

All other rows with Controlled by = n/a have no `showWhen` in the app. FLD-GEN-009 has a value tie to the second contact, but no show/hide dependency; the skeptic refuted the comparer's "Dependent" deviation on it.

### 3.3 Annexes opened by each origin (the "Controls" column of FLD-2.3-01)

| Row | Origin | Matrix opens | App opens through the origin (rule) | Opened in the app by something else, or not at all |
|---|---|---|---|---|
| 13 | Bio Mass (vegetable) | Part, Country; A1, 2, 3, 9, 10, 11, 12 | Part, Country; A1, A2, A9 (R-10); A10 (R-00, always); upload K1-005 | A3 through SF-06; A11 through SF-11 UK; A12 through SF-11 TR, v2 only |
| 14 | Animal | Part, Country; A10, 11, 12 | Part, Country; A10 (always); uploads K1-006/007 (the matrix asks for them) | A11 and A12 by market only |
| 17 | Petrochemical | FLD-2.3-11; A1, 4, 9, 10, 11, 12 | FLD-2.3-11; A1, A4, A9 (R-14); A10; extra upload K1-008 | A11 and A12 by market only |
| 19 | Mineral | FLD-2.3-12; A1, 7, 10, 11, 12 | FLD-2.3-12; A1 (R-13); A10 | A7 through SF-05 Colorant; A11 and A12 by market only |
| 21 | CCU | FLD-2.3-13; no annexes | FLD-2.3-13; A10 (always); case flagged for RMM (R-16) | A11 and A13 can open by market |
| 23 | Polymer | FLD-2.3-14; A1, 6, 10, 11, 12 | FLD-2.3-14; A1, A6, **K4.3** (R-15); A10; extra uploads K1-009/010 | A11 and A12 by market only |
| 25 | Waste / side stream | FLD-2.3-15; no annexes | FLD-2.3-15; A10; flagged for RMM | A11 and A13 by market |
| 27 | Chemical recycling | FLD-2.3-16; no annexes | FLD-2.3-16; A10; flagged for RMM | A11 and A13 by market |

All eight specification and follow-up fields match. The annex lists differ by design (AS-05). Mitigating context for BDF: the matrix itself marks Annex 3 "outside test scope", and the sheet has no fields at all for A3, A7 and A9–A12.

---

## 4. Open review points and decisions

### 4.1 Open [Review] points in the v0.6 change log that affect the build

| Field | Open point (paraphrased) | What the app does today |
|---|---|---|
| FLD-GEN-002 | The supplier address is no longer captured; BDF to confirm it is not needed. | Name only; the master holds no address (types.ts:691-705). |
| FLD-GEN-008 | No field for the contact person's name; BDF to confirm. | No questionnaire field. The name exists on the master contact and in Case_Contacts_JSON (app-live/shared/caseStartPayload.ts:110). A locked "Contact person" field could be filled from the contact if BDF wants it. |
| FLD-2.1-004 | Either define the additive follow-up fields or set Controls to No. | No follow-up fields; the flag drives nothing. This is consistent with either answer. |
| FLD-2.3-01 (R4) | The CIQ allows several origins, but a radio button allows only one per component; BDF to confirm. | Multi-select SF-01 at material level, plus a single origin per component (AS-04). |
| FLD-A1-103 / -104 (R5, R6) | In the CIQ these are required only when Annex 1 applies, but the matrix makes them mandatory for all origins; BDF to confirm. | The app already does "only when A1 applies". |
| FLD-A2-101 | Annex 2 is triggered only by Bio Mass in the CIQ; also "per INCI component". | Vegetable only (matches). One field per case, not one per component. |
| FLD-A2-102 | The CIQ uses checkboxes (multi-select); check whether single-select is right. | Multi-select, chosen before the decision. |
| FLD-A1-208 | The CIQ asks only for free text; the upload is a BDF extension; BDF to confirm. | Free text, no upload; the label wrongly says "certificate attached". |
| FLD-A4-101 | Clarify the unit. | mg/kg; RMES limit check at 1.0 mg/kg (actions.ts:607-609). |

### 4.2 Remarks without a [Review] tag that still affect the build

| Remark | Effect in the app |
|---|---|
| FLD-2.1-001 / FLD-A2-101: "pre-fill of FLD-A2-101" | Not built (M9). The final sheet says Controls = No on FLD-2.1-001 (cell J10). The pre-fill is defined on FLD-A2-101 itself. |
| FLD-2.3-10: "multiple countries – to be clarified" | Free text with the help "separate with commas". |
| FLD-2.3-01 Animal: BSE/TSE certificate and entry 419 "(or BDF template)" | The upload slots FLD-K1-006/-007 exist. No BDF template is offered for download (domain/referenceMaterials.ts has none). |
| FLD-A1-206: "No RSPO certification" is a deviation for BDF to assess; the RSPO no. must be on the CoA | Supplier help text only, no reviewer flag. R-80 maps "RSPO number on the CoA" to the K1 CoA upload (rules.ts:175), so no RSPO certificate file is ever collected. |
| FLD-A4-102: options simplified; the value type moves to A4-103 | Not followed (L11). |
| FLD-A4-103: the former upload field FLD-A4-104 was removed, and the upload now belongs to this field | Not built (M15). |
| Origin-to-annex lists (change log rows 33, 35, 43, 54, 67, 80, 94, 108) | These restate ReqDoc §5.4. The app follows AS-05 (M4, L7). |

Resolved in v0.6, so no action is needed: FLD-GEN-009 is Optional; the FLD-GEN-003 label is fixed; FLD-GEN-005 is one site; FLD-2.1-002/-003 are "validated only if filled"; FLD-2.1-007 is 0–100 % with min ≤ max; FLD-2.1-102 has the decimal type; FLD-A1-102 palm use is captured through FLD-A1-204.

### 4.3 Decisions for Thomas

| # | Decision | Options | Recommendation |
|---|---|---|---|
| D1 | Origin → annex mapping (M4, L7) | (a) Keep AS-05. (b) Follow the matrix: add A3, A7, A11 and A12 to the origin rules, publish questionnaire v2 for A12, and exempt CCU, Waste and Chemical recycling from A10. | (a). AS-05 was agreed after the matrix date. Get BDF's written confirmation that AS-05 overrides the matrix's lists. |
| D2 | Approval routing (M11) | (a) Change Section owners: A1 lead REG; A2 and K2.1 lead RMM. (b) Keep SUS, SAF and REG, and confirm them with BDF. | Ask BDF. The matrix column is deliberate (40 RMM, 7 Regulatory, 3 Safety), but the ReqDoc names Regulatory for K2.1. This is a settings change, not code. |
| D3 | FLD-A1-102/103/104 placement (M7) | (a) Move them to K2.3, always shown. (b) Keep them in A1. | For 103/104, wait for BDF's R5/R6 answer. For A1-102 (Feedstock) the matrix has no open point: move it unless BDF agrees otherwise. |
| D4 | Items not in the matrix: uploads K1-005, -008, -009, -010; K4.3 from Polymer; SF-07 opening A4; SF-08 opening A1 (M5, M12, M14) | Keep them (they come from ReqDoc §5.4) or drop them. | Keep the uploads and K4.3, which are defensible from the ReqDoc, and tell BDF. Drop SF-08 (D5). |
| D5 | Palm asked twice (M12) | (a) Drop SF-08 and let A1-204 drive RSPO. (b) Sync the two answers. | (a). The matrix change log already moved palm to FLD-A1-204. |
| D6 | Origin type (M6, R4) | Multi-select SF-01 plus one origin per component (today), or a radio button | Keep today's model until BDF answers R4. Add the consistency check either way. |
| D7 | FLD-A2-102 single or multi (M10) | — | Wait for BDF. The CIQ uses checkboxes, so multi-select is likely. |
| D8 | Uploads attached to text and number fields (M13, M15) | Build companion conditional file fields, or support attachments on any field | Build FLD-A4-103's upload now (no open point). Wait on FLD-A1-208 (open point), but fix its label now. |
| D9 | FLD-GEN-009 typed by hand, notification only (L1) | Allow free text on New case, or keep "second master contact only" | Ask BDF. Add the format check either way. |
| D10 | "Cannot provide" on yes/no controllers (§3.1 caveat) | Keep it, or hide it on FLD-A1-201, FLD-A1-204 and FLD-A4-102 | Hide it on controllers. Otherwise the matrix chains can be skipped. |
| D11 | Viscosity structure (L11) | Restructure to the matrix's form, or keep the current one | Keep it; the data captured is equivalent. Tell BDF. |

### 4.4 Candidates to remove because the end user does not need them (for review)

1. **SF-02** "Are there additional production sites?": no rule uses it, and v0.6 drops further sites (L3).
2. **SF-08** "Is any feedstock palm-based?": it duplicates FLD-A1-204 (M12, D5).
3. **FLD-GEN-005 help text** "(aligned with business departments)": internal wording shown to suppliers (L3).
4. **FLD-A2-101 help text** "Pre-filled from the composition; editable.": untrue today (M9).
5. **FLD-A1-208 label** "…, certificate attached": promises an upload that does not exist (M13).
6. The extra K1 uploads **FLD-K1-005, -008, -009, -010**, if BDF does not want them (D4).

---

## 5. Outside the matrix's scope (not deviations)

v0.6 covers only GEN, the K2.1 composition, K2.3 origin, and parts of Annexes 1, 2 and 4. The app also has:

- **K1 Mandatory documents:** FLD-K1-001…003 (SDS, CoA, specification) and FLD-K1-004 Statements, plus the rule-evidence uploads FLD-K1-005…010.
- **K2.2 Byproducts and contaminations:** FLD-2.2-001 (batch evidence), the heavy-metal fields FLD-A14-101…103 and FLD-2.2-002 (justification above the limit).
- **K5.1 Microbiological test:** FLD-5.1-001 and FLD-5.1-002, driven by SF-12.
- **Documents-only sections** (no fields): K3, K4.1, K4.2, K4.3, K5.2, K5.3, K6.1–K6.17 (including K6.16.1), K7, K8, K8.1, A3, A5, A6, A7, A8, A9, A10, A11, A12, A13.
- **Metadata questions** SF-02 to SF-12. Only SF-01 corresponds to a matrix field, FLD-2.3-01. SF-11 (target markets) is set by RMM.
- **In K2.1:** the per-component Origin column (types.ts:129). v0.6 dropped FLD-2.1-006; the nearest matrix field is FLD-2.3-01.
- **On New case:** the case-level "Main INCI" (NewCase.tsx:86).
- **Version differences:** questionnaire v1 leaves out K6.3 and A12 (catalog.ts:384).

---

## 6. What I could not determine

1. **The deployed bundles.** Whether the internal app bundle (dist-applive, built 27 Oct) and the portal bundle match this source. Every finding is from `prototype/src`.
2. **The live configuration.** Whether dev has a newer published questionnaire or rule-set version, or a Section owners change (`OWN:current`, app-live/map/config.ts:119, 164), that overrides the built-in leads, rules or fields.
3. **Notification-only contacts.** Whether the mail integration actually sends to `Supplier_Contact_Emails`, which would make a second contact without a portal user a notification-only recipient.
4. **The Annex 1 auto-fill target.** Which Annex 1 field "Country of origin (auto-fill)" is meant to fill (FLD-2.3-10). The matrix defines none.
5. **The FLD-A1-104 reference.** Which component's range FLD-A1-104 should be checked against.
6. **Truncated remarks.** The full text of the remarks cut off at 200 characters in the source cells (R4 on FLD-2.3-01, FLD-A1-206 RSPO, FLD-A2-102).
7. **Invalid master DUNS.** Whether the live supplier master can hold a DUNS that fails the 9-digit check. It would block completeness, and the supplier could not fix it.
8. **Dropping evidence fields.** Whether removing an evidence upload in a configuration version makes `requestedDocs` add a slot for it again (M5).
9. **Tests.** No live test was run. The only execution was the slice B domain probe, which was not re-run by the skeptic.

---

## Appendix: verdict rows by slice

Abbreviations: **C** = comparer status; **F** = skeptic's final status; **Sev** = severity. A **bold** F marks a row where the skeptic differs from the comparer.

### A — Start and general information (rows 0-6)

| Row | Field | C | F | Sev | Confirmed deviations | Skeptic notes |
|---|---|---|---|---|---|---|
| 0 | FLD-GEN-001 Trade name | match | match | – | – | RMM must enter it (stricter than "can be pre-filled"). The "Ask <owner>" refusal text offers an edit nobody can make. |
| 1 | FLD-GEN-002 Supplier (name) | match | match | – | – | Open BDF point on the address. The final document uses the current master name. |
| 2 | FLD-GEN-008 Contact e-mail | match | match | – | – | The re-sync after contact changes applies to the prototype only; live, contacts are fixed at case start. |
| 3 | FLD-GEN-009 Contact e-mail 2 | partial | partial | low | No e-mail `validate`; no manual entry | Refuted: a "Dependent" deviation (there is no show/hide dependency). |
| 4 | FLD-GEN-003 DUNS | match | match | – | – | The final document uses the current master DUNS. |
| 5 | FLD-GEN-004 Manufacturer | partial | partial | low | No pre-fill ("possible" in the matrix) | – |
| 6 | FLD-GEN-005 Production site | partial | partial | low | No pre-fill; SF-02 still asked | Refuted: SF-02 as a "Controls" deviation (it is a separate question). Added: internal help text. |

### B — Composition (rows 7-12, 30)

| Row | Field | C | F | Sev | Confirmed deviations | Skeptic notes |
|---|---|---|---|---|---|---|
| 7 | FLD-2.1-001 INCI / IUPAC | deviation | deviation | high | Mandatory not enforced; label; no IUPAC / Colour Index guidance; approval REG + RMM | Refuted: Controls "uncertain" (cell J10 = No; the pre-fill belongs to FLD-A2-101). A blank INCI prints empty in the final document. |
| 8 | FLD-2.1-002 CAS | partial | partial | medium | Check is UI-only; approval | – |
| 9 | FLD-2.1-003 EC | deviation | deviation | medium | REACH reg. no. rejected; UI-only; guidance; approval | – |
| 10 | FLD-2.1-004 Additive | partial | partial | low | Defaults to No; no explicit Yes/No | Controls is an open BDF point, not a deviation. |
| 11 | FLD-2.1-005 Function | deviation | deviation | high | Mandatory not enforced; approval | Placeholder differs from the matrix examples (cosmetic). |
| 12 | FLD-2.1-007 Concentration | deviation | deviation | high | Blank stored as 0; range rules UI-only; single value needs two entries; approval | The 0–0 % shows in the final document. The FLD-A1-104 cross-check is not built. |
| 30 | FLD-2.1-102 Natural origin index | partial | partial | medium | No 2-decimal check; owner REG | – |

### C — Origin (rows 13-29, 31-32)

| Row | Field | C | F | Sev | Confirmed deviations | Skeptic notes |
|---|---|---|---|---|---|---|
| 13 | FLD-2.3-01 Bio Mass | partial | partial | medium | Type multi vs radio; A3, A11, A12 not by origin; extra upload K1-005 | No check that component origins agree with SF-01. |
| 14 | FLD-2.3-01 Animal | partial | partial | medium | Type; A11, A12 not by origin | Refuted: the approval deviation (the field owner is display only; RMM reviews GEN). |
| 15 | FLD-2.1-101 Part | match | match | – | – | The "No entry" exclusivity check was dropped (not a matrix rule). |
| 16 | FLD-2.3-10 Country of origin | partial | partial | low | Annex 1 auto-fill target missing | The target field does not exist in the matrix either. |
| 17 | FLD-2.3-01 Petrochemical | partial | partial | medium | Type; A11, A12; extra upload K1-008 | – |
| 18 | FLD-2.3-11 Fossil spec. | match | match | – | – | – |
| 19 | FLD-2.3-01 Mineral | partial | partial | medium | Type; A7 not by origin; A11, A12 | – |
| 20 | FLD-2.3-12 Mineral spec. | match | match | – | – | – |
| 21 | FLD-2.3-01 CCU | partial | partial | low | Type; A10 always on | Added: A11 and A13 can open by market. |
| 22 | FLD-2.3-13 CCU spec. | match | match | – | – | – |
| 23 | FLD-2.3-01 Polymer | partial | partial | medium | Type; A11, A12; extra K4.3; extra uploads K1-009/010 | Added: K4.3 (the comparer had it as a match). |
| 24 | FLD-2.3-14 Polymer spec. | match | match | – | – | – |
| 25 | FLD-2.3-01 Waste | partial | partial | low | Type; A10 always on | Added: market annexes. |
| 26 | FLD-2.3-15 Waste spec. | match | match | – | – | – |
| 27 | FLD-2.3-01 Chemical recycling | partial | partial | low | Type; A10 always on | Added: market annexes. |
| 28 | FLD-2.3-16 Chem. rec. spec. | match | match | – | – | – |
| 29 | FLD-A1-102 Feedstock | partial | **deviation** | medium | In A1, not always shown; mandatory only in A1; approval by A1 lead SUS | Approval evidence corrected from the field owner to the section lead. SF-08 duplicates A1-204. |
| 31 | FLD-A1-103 Content % in INCI | partial | **deviation** | medium | In A1; mandatory only in A1; approval SUS | R5 proposes exactly the app's behaviour. |
| 32 | FLD-A1-104 Content % in raw material | partial | **deviation** | medium | In A1; mandatory only in A1; no consistency check; approval SUS | R6 = R5, still open. |

### D — Annexes 1, 2 and 4 (rows 33-49)

| Row | Field | C | F | Sev | Confirmed deviations | Skeptic notes |
|---|---|---|---|---|---|---|
| 33 | FLD-A2-101 INCI / IUPAC | deviation | deviation | medium | No pre-fill (misleading help); approval SAF | "Per component" left open. |
| 34 | FLD-A2-102 Chemical | deviation | deviation | medium | Multi vs single; approval SAF | – |
| 35 | FLD-A2-102 Physical | deviation | deviation | low | Type; approval | – |
| 36 | FLD-A2-102 Enzymatic | deviation | deviation | low | Type; approval | – |
| 37 | FLD-A2-102 Biotech / Fermentation | deviation | deviation | low | Type; does not drive A3; approval | A3 is outside the test scope; SF-06 covers it. |
| 38 | FLD-A2-102 Other | deviation | deviation | low | Type; approval | The control of FLD-A2-103 works. |
| 39 | FLD-A2-103 Individual process | partial | partial | low | No example help text; approval | – |
| 40 | FLD-A1-201 Pesticides available | partial | partial | medium | Approval SUS, not Regulatory; extra A1 trigger SF-08 | Added: the SF-08 trigger; "Cannot provide" can skip the chain. |
| 41 | FLD-A1-202 Pesticides upload | partial | partial | low | Approval | PDF is a picker filter only. |
| 42 | FLD-A1-203 Pesticides reason | partial | partial | low | Long text vs text; approval | – |
| 43 | FLD-A1-204 Palm used | partial | **deviation** | medium | Palm asked twice, not linked, RSPO evidence silently "collected"; approval | – |
| 44 | FLD-A1-206 RSPO | partial | partial | low | Approval | Label shorter; no reviewer flag for "No RSPO". |
| 45 | FLD-A1-207 Other certification | partial | partial | low | Approval | – |
| 46 | FLD-A1-208 Other certification name | deviation | deviation | medium | No certificate upload; misleading label; approval | – |
| 47 | FLD-A4-101 MOAH | partial | partial | medium | No ≥ 0 check; extra A4 trigger SF-07 | Refuted: unit "uncertain" (mg/kg is a matrix assumption; still an open point). |
| 48 | FLD-A4-102 Viscosity availability | partial | **deviation** | low | Three options vs two; extra trigger SF-07 | Label has no "Mineral oil –" prefix (cosmetic). |
| 49 | FLD-A4-103 Viscosity value | deviation | deviation | medium | No upload; no > 0 check; number only, no checkbox | – |
