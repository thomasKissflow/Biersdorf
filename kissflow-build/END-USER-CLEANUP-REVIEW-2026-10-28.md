# End-user cleanup review: 28 Oct 2026

**Kissflow-internal.** Never cite this file to Beiersdorf.

Thomas asked on 28 Oct: "if you find anything else that might not be needed for the end user let me know, so we can review and remove if needed".

This file lists what may be internal or technical noise on the end-user screens:
- **App (CIQ Digital):** RMM, the department reviewers, Customs/Legal, Business administrator, Auditor and Business owner.
- **Supplier portal.**

Out of scope: the Admin / Developer data console, the Diagnostics pages, the dev-only top bar and role switcher.

**Nothing in this list has been removed.** Each item has a recommendation for review:
- **remove**
- **reword**
- **keep**
- **move to Diagnostics**

The one change that was made, the Basis column, is described in §0.

## How to read it

- **Prod:** "yes" means the element also shows in production. In the live app every screen in `src/features/*` renders the same in dev and prod. The live stores set `ProductionContext` to true in both (`app-live/LiveAppStore.tsx:576`, `portal/data/LiveSupplierStore.tsx:626`). So the prototype-only `DemoNote`s and `!production` bits are already hidden there.
- **Screenshot:** the paths are under `prototype/`.
  - **App:** the new harness scenario `end-user-tour` shows each screen as production does (`env=prod`, fictional ZZT data). Run it with `node scripts/harness-applive.mjs end-user-tour`. It writes `dist-applive/harness-end-user-tour-<screen>.png`.
  - **Portal:** the screenshots come from the existing `scripts/harness-portal.mjs` scenarios, in `dist-portal/`.
  - The screenshots show the top of each page (1280×900). Some elements sit further down the page. For those, the code reference (`src/…:line`) points to the exact place.
  - The Business administrator's and Auditor's screenshots carry the prod notice "Some data could not be loaded… Reload · Details" (A-S2). The emulated host refuses a few reads for these roles.
- **Codes we keep everywhere unless a row says otherwise:** case code (CIQ-2026-0003), open-point id (OP-0003-01), CIQ section codes (K2.1, Annex 4), DUNS, BDF material no., INCI/CAS/EC. They are business references, used in the e-mails and by the supplier.

---

## 0. Done today: the Basis column

**Where it was.** The "Basis" column appeared only on the **Rules** page (`/admin/rules`), the rule table of the configuration editor. That page is where the Business administrator lands and where the Auditor reads the rules.

The column showed Requirements document / Agreed with Beiersdorf / Not in the requirements / Optional for every case. No other app screen shows a rule's basis:
- not the case's Questionnaire tab
- not the review workspace
- not the Questionnaire configuration page

The supplier portal never showed it either: no screen reads `rule.basis`, and the built portal contains none of the labels.

**Removed** (`prototype/src/features/admin/RuleList.tsx`):
- the Basis column
- the basis filter next to the search ("All / Requirements document / Agreed / Not in the requirements")
- the basis counts in the list subtitle ("… 18 from the requirements document · 7 agreed with Beiersdorf …"). The subtitle now reads "26 rules. The strictest outcome wins."

The filter and the counts showed the same information as the column. A filter on a value the table no longer shows would be confusing.

**Kept:**
- every rule's `basis` in the data: the release bundles, the Config Version rows and the `SET:current` settings, untouched
- the rule form's own **Basis** field (`RuleEditor.tsx`), as asked. See A-B1: after this change it is the only place a basis is visible.

**Tests:**
- new unit test `src/features/admin/RuleList.test.tsx`
- the app harness checks the Rules page has no Basis column, no basis filter and no basis counts, for the Business administrator in dev and prod and for the Auditor (`noBasis` in `scripts/harness-applive.mjs`)
- the portal harness checks the metadata questions and K2.1 show no basis (`fill-live-scope`)

**Builds** (offline, not deployed):
- **App:** `prototype/dist-applive/ciq-app-ui-9d9d136188.zip`.
- **Portal:** `prototype/dist-portal/ciq-portal-ui-c3d995ea00.zip`. Its behaviour is unchanged: it differs from `14825103b9` only in the embedded build time.
- **Rollback:** the previous zips (`ciq-app-ui-f87fb2c3d4.zip`, `ciq-portal-ui-14825103b9.zip`) are in `kissflow-build/optimise-2026-10-26/rollback-zips/before-basis/`.

**Screenshots:**
- `dist-applive/harness-ba-config-access-prod-rules.png`
- `dist-applive/harness-ba-config-access-dev-rules.png`
- `dist-applive/harness-end-user-tour-admin-rules.png`

---

## Highlights: the ones most worth a decision

1. **Rule form "Basis" field (A-B1).** It is now the only place the basis shows, and a basis-only edit still marks the rule "Changed in draft". Recommendation: remove it with the column and keep a silent default in the data.
2. **Field ids under every answer (A-Q1).** "FLD-GEN-003" sits under every question on the case's Questionnaire tab, for every internal role.
3. **Rule ids and requirement ids in reasons (A-Q3, A-R1).** "Why in scope: Origin includes Vegetable → R-10 · kept: … (REQ-CFG-008)" appears in the case Questionnaire tab and the review workspace. The portal already strips these with `supplierReason()`.
4. **Rule ids on evidence and requested documents (A-Q4, A-Q5).** "SDS R-00 · received" and "Requested by rule R-12, R-14".
5. **Version strings on working screens (A-O1, A-Q6, A-Q7, A-N3).** "CIQ-2026 v1", "RS-2026.1" appear on Overview, the Questionnaire tab, the Scope card and New case. Keep them in History and the Final document only.
6. **Buttons the live app refuses (A-O3, A-R8, A-R9, A-B9).**
   - Reactivate on cancelled cases
   - Add a section
   - Reopen my review (departments)
   - Run reminders now

   They all lead to "not available in this version yet".
7. **RMES criteria (A-R3).** The criteria R-A1 … S-D1 are prototype examples shown as real in prod, and their codes appear on every row.
8. **"Requirements document" provenance (A-B3, A-B4, A-B5).**
   - Section owners: "Matches the requirements document"
   - built-in rule notes
   - the first version's change note: "… from requirements document v2.0 §5.3–5.4"
9. **Portal: "SF" metadata code (P-1, P-2, P-3).**
   - in the section list and Next/Previous
   - "SF-01 · …" in the completeness check
   - "Because: polymer (SF-03) is Yes" in the scope preview, with a casing bug: "uV filter"
10. **Portal: technical messages to suppliers (P-11, P-15, P-16, P-17).**
    - "Connecting to Kissflow…"
    - load-warning lines naming Kissflow process steps and item ids
    - raw webhook errors in a save toast
    - the raw JS error on the page error

---

## A. App: CIQ Digital

### A-Q · Case page, Questionnaire tab (`/cases/:id?tab=questionnaire`): RMM, departments, Customs/Legal, Auditor

Screenshots:
- `dist-applive/harness-end-user-tour-case-questionnaire-scope.png` (Scope and evidence)
- `dist-applive/harness-end-user-tour-case-questionnaire-section.png` (a section, K1)
- `dist-applive/harness-doc-preview-questionnaire.png`

| # | Element (as rendered) | Why it may not be needed | Rec. | Code |
|---|---|---|---|---|
| A-Q1 | A field id in small mono under **every** question label, e.g. "FLD-GEN-003", "FLD-K1-002" | Internal field-matrix id; nobody refers to a question by it | **remove** | `features/rmm/tabs/QuestionnaireSections.tsx:393` |
| A-Q2 | Metadata card: "SF-01 to SF-12" header, the code under each question, and "SF-02 and SF-05 are optional; SF-11 is set by RMM." | Requirement-document codes. The portal hides them in prod | **reword** (no codes) | `QuestionnaireSections.tsx:297,300,331` |
| A-Q3 | "Why in scope:" / "Why not applicable:" with rule ids and codes: "Origin includes Vegetable → R-10", "UV filter (SF-04) is Yes → R-40", "… · kept: the scope only grows after the completeness confirmation (REQ-CFG-008)". Shown in the section header, the documents-only list, the not-applicable list and card, and the navigator tooltip. "No rule activates this section for these answers" is engine wording | Rule ids, SF codes and a requirement id mean nothing to reviewers | **reword**: keep the plain condition, drop "→ R-xx", "(SF-xx)" and "(REQ-…)" (reuse `supplierReason()`, `portal/data/scope.ts:95`) | `QuestionnaireSections.tsx:136-137,565,750,817`, `QuestionnaireTab.tsx:282`; text `domain/rules.ts:126,138,231`, `domain/conditions.ts:135` |
| A-Q4 | Rule id next to each evidence chip: "SDS **R-00** · received" | Internal rule reference | **remove** the id | `QuestionnaireSections.tsx:264` |
| A-Q5 | Requested documents: "Requested by rule R-12, R-14 · <condition>". Header: "Requested documents · asked for by the rules, no question collects them" | Rule ids. The header describes how the list is built | **reword**: "Requested documents"; keep the condition, drop the rule ids | `components/RequestedDocs.tsx:43,63`; `domain/requestedDocs.ts:139` |
| A-Q6 | "· rule set **RS-2026.1**" in the Scope and evidence summary | A version string users can't act on (it is also on Overview and in History) | **remove** | `QuestionnaireSections.tsx:220` |
| A-Q7 | "Read-only · **CIQ-2026 v1**" in the summary bar | Template version, duplicated | **remove** the version, keep "Read-only" | `QuestionnaireTab.tsx:122-125` |
| A-Q8 | Navigator, phone picker and Previous/Next show "GEN" and "SF" as codes ("GEN General information", "SF Metadata answers") | Internal ids, not CIQ numbering (K2.1, A4 are fine) | **remove** for GEN and SF | `QuestionnaireSections.tsx:26-31` (`shortCode`), `QuestionnaireTab.tsx:196,313,392` |
| A-Q9 | "Applies: Mandatory · added by hand" / "Added by hand: …" | Developer wording | **reword**: "added during the review" | `QuestionnaireSections.tsx:130,565` |
| A-Q10 | Scope card, Part 2: "A department can add a section with a justification." | Not true live: adding a section is refused (`extendScope: false`) | **remove** in live (gate on `useLiveFeatures().extendScope`) | `QuestionnaireSections.tsx:232`; `components/liveFeatures.tsx:32` |

### A-O · Case page header, Overview tab and actions (`/cases/:id`): RMM; others read-only

Screenshot: `dist-applive/harness-end-user-tour-case-overview.png`

| # | Element | Why it may not be needed | Rec. | Code |
|---|---|---|---|---|
| A-O1 | Case facts: "Questionnaire: CIQ-2026 v1", "Rule set: RS-2026.1" (mono) | Configuration versions on a working screen | **remove** (keep them in History and the Final document). Harness ids `case-template-version` and `case-rule-set` would need updating | `features/rmm/tabs/OverviewTab.tsx:86-87` |
| A-O2 | Change-report id "CIQ-2026-0003-cr1 · name · date" (also in History: "… (X-cr1)") | A synthetic id (`${caseId}-cr${rev}`) | **remove** the id, keep name and date | `OverviewTab.tsx:49`; `domain/actions.ts:255` |
| A-O3 | **Reactivate** button on cancelled cases. The dialog ends with "Reactivating a case is not available in this version yet." | Prototype-only; the button can never work live | **remove** in live (a `reactivate` live-feature flag) | `features/rmm/CaseDetail.tsx:172-176`, `CaseActions.tsx:81-128`; refusal `app-live/api.ts:423` |
| A-O4 | Reactivation promises: "RMM can reactivate it until <date>", "RMM can reactivate the case within 12 months.", the Cancelled tab hint and empty state | Promise something live does not do | **remove** in live | `CaseDetail.tsx:219`, `CaseActions.tsx:75`, `CaseList.tsx:19,218` |
| A-O5 | RMES progress: criterion code plus raw lower-case result, e.g. "R-A1 INCI and CAS…: negative" / "implausible" | Checklist codes and unformatted states | **reword**: title only, result as a label/badge | `OverviewTab.tsx:341` |
| A-O6 | DUNS twice: header "· DUNS 087342615" and Case facts | Duplicated | **keep one** (Case facts) | `CaseDetail.tsx:109`, `OverviewTab.tsx:79` |

### A-H · Case page, History, Internal notes and Final document tabs

Screenshots:
- `dist-applive/harness-end-user-tour-case-history.png`
- `dist-applive/harness-end-user-tour-case-notes.png`
- `dist-applive/harness-end-user-tour-case-final-document.png`

| # | Element | Why it may not be needed | Rec. | Code |
|---|---|---|---|---|
| A-H1 | "Configuration: Questionnaire CIQ-2026 v1 with rule set RS-2026.1. **7 rules fired**: …" | The versions are audit facts (keep), but "rules fired" is engine wording | **keep the versions, reword** "N rules fired" | `features/rmm/tabs/HistoryTab.tsx:48` |
| A-H2 | Closure row "… sealed (seal **3fa94c0b12de77a1**)" | A 16-hex hash | **remove** the code, keep "sealed" (tooltip at most) | `HistoryTab.tsx:95` |
| A-H3 | Event details with versions: "Created case: … Questionnaire CIQ-2026 v1, rule set RS-2026.1. …", "Derived scope: Rule set RS-2026.1 applied to …". The same entries show in the RMM Dashboard's Recent activity | Technical detail in the activity feed | **reword** without versions (at least off the Dashboard) | `domain/actions.ts:252,258`; `HistoryTab.tsx:192`, `features/rmm/Dashboard.tsx:419` |
| A-H4 | History summary "… Computed from the case record." | Implementation aside | **remove** the sentence | `HistoryTab.tsx:112` |
| A-H5 | Final document footer "CIQ-2026-0003-FD · generated …" and "Document seal <16-hex>" | The -FD id repeats the case id; the hex is a hash. The header badge "Document seal: unchanged" says what matters | **remove** both on screen. Check against the PDF (`kissflow-build/final-pdf`) so screen and PDF stay alike | `features/rmm/tabs/FinalDocumentTab.tsx:277,280` |
| A-H6 | Final document metadata: "SF-01 to SF-12 · they set the scope" and an SF code before each question | Requirement codes | **remove** on screen (unless the PDF must keep them) | `FinalDocumentTab.tsx:51,57` |
| A-H7 | Notes placeholder "e.g. @Dr. Mira Hansen the MOAH value is borderline; …" | A prototype demo person, not in the live directory | **reword**: "e.g. @colleague …" | `features/rmm/tabs/NotesTab.tsx:114` |

### A-N · Cases list, New case, Suppliers: RMM; the Business administrator maintains suppliers

Screenshots:
- `dist-applive/harness-end-user-tour-rmm-cases.png`
- `dist-applive/harness-end-user-tour-new-case.png`
- `dist-applive/harness-end-user-tour-suppliers.png`
- `dist-applive/harness-end-user-tour-supplier-detail.png`
- `dist-applive/harness-dev-portal-user-linked.png`

| # | Element | Why it may not be needed | Rec. | Code |
|---|---|---|---|---|
| A-N1 | Cases filter "Origin **(SF-01)**" | Requirement code | **remove** the code | `features/rmm/CaseList.tsx:176` |
| A-N2 | New case: "Target markets **(SF-11)**" and "Basic data and the metadata questions **SF-01 to SF-12** first…" | Codes | **reword** without codes | `features/rmm/NewCase.tsx:287,367` |
| A-N3 | New case side note "Uses questionnaire **CIQ-2026 v1** and rule set **RS-2026.1**. Running cases keep the versions they started with." | Versions RMM can't choose | **remove** (or move to Diagnostics). Harness ids `newcase-rule-set` and `newcase-template-version` would need updating | `NewCase.tsx:380-390` |
| A-N4 | Supplier company card "Source: Supplier master" / "Imported from the supplier master" | The same for every live supplier; derived from the prototype seed's `DEMO_SUPPLIER_IDS` | **remove** the row | `features/suppliers/SupplierDetail.tsx:11,58,216` |
| A-N5 | Contact window (read-only for the BA): "Portal user ID: UsAbc123…", hint "Set by a holder of the Admin / Developer role." | A raw Kissflow user id and a technical role name | **reword**: "Supplier portal access: linked / not linked" | `features/suppliers/forms.tsx:444-449` |
| A-N6 | Deactivate contact: "… replacing a contact on running cases is not available in this version yet." | Version wording | **reword**: "… can't be deactivated while named on open cases. Complete or cancel those cases first." | `forms.tsx:524`, `app-live/write/guards.ts:47` |

### A-R · Review workspace and My reviews (`/review`, `/review/:caseId`): departments and RMM

Screenshots:
- `dist-applive/harness-end-user-tour-review-queue.png`
- `dist-applive/harness-end-user-tour-review-workspace.png`
- `dist-applive/harness-end-user-tour-review-rmes.png`
- `dist-applive/harness-saf-review-completed.png`

| # | Element | Why it may not be needed | Rec. | Code |
|---|---|---|---|---|
| A-R1 | Under each section header: "Why in scope: Origin includes Vegetable → R-10; Any target market outside the EU → R-115 · kept: … (REQ-CFG-008)" | Same as A-Q3 | **reword** (drop rule ids and REQ id) | `features/review/SectionContent.tsx:171`; `domain/rules.ts:126,231` |
| A-R2 | Requested documents "Requested by rule R-10 · …" | Same as A-Q5 | **reword** | `components/RequestedDocs.tsx:43,63` |
| A-R3 | **RMES criteria R-A1 … S-D1** are hard-coded examples. The code says "real template is still to be shared by BDF (G-07)". The only disclaimer is a DemoNote, hidden live | Prototype content that reviewers will read as real | **replace** with BDF's template, or show a visible "example criteria" notice until then (content, not just noise) | `domain/actions.ts:583-601`; `app-live/write/activation.ts:41`; `RmesTab.tsx:102` |
| A-R4 | Criterion codes in mono before every title ("R-A1", "S-B1"), also "On S-A1 · …", the Add-finding dropdown "S-A1 · title", "S-A1 · title · recorded for Safety" | The criteria are already grouped by Part and department | **remove** the codes | `features/review/CriterionRow.tsx:94`, `RmesTab.tsx:43`, `RmesSide.tsx:131,242`, `AskModals.tsx:332` |
| A-R5 | Finding ids "0003-F1" on each finding card and "CIQ-2026-0003 · finding 0003-F1" | Findings are internal, never quoted in mails | **remove** | `RmesSide.tsx:125`, `AskModals.tsx:310` |
| A-R6 | "Source: K2.1 composition table" (↗ "Open the source section") under each criterion; "Reference (the criterion's source)"; "OP-0003-02 on the same source" | The jump is useful; "source" is jargon | **reword** ("Check in K2.1 composition table ↗", "Related open point …"); drop the non-clickable copy | `CriterionRow.tsx:16-24`, `RmesTab.tsx:54`, `AskModals.tsx:323`, `RmesSide.tsx:134` |
| A-R7 | "Limit ≤ 0.5 mg/kg · limit set **BDF-LIM-2026.1**" on field rows and in the RMES limit box | A version string the prototype made up | **remove** from field rows; keep in RMES only if BDF names limit sets this way | `SectionContent.tsx:118`, `CriterionRow.tsx:44`; `domain/catalog.ts:240` |
| A-R8 | **Add a section** (and phone "+ Section"). The modal then says "Adding a section to the scope is not available in this version yet." | Refused live (`extendScope: false`) | **remove** (hide while the flag is off) | `features/review/SectionNav.tsx:77,155-158`, `AskModals.tsx:229` |
| A-R9 | **Reopen my review** for departments; live only shows a refusal toast | Refused live (`deptReopen: false`) | **remove** for departments while the flag is off | `features/review/CompletePanel.tsx:211-213` |
| A-R10 | RMES header "Record created 12 Oct 2026 for CIQ-2026-0003 · internal, never visible to the supplier" | The case code is in the page header | **remove** "for CIQ-…" | `RmesTab.tsx:88` |
| A-R11 | Empty RMES: "… created the next time a Safety or Regulatory reviewer with a review task on the case opens CIQ Digital." | Explains the load mechanics | **reword**: "The RMES record appears shortly after the review starts." | `RmesTab.tsx:71` |
| A-R12 | Mention hint twice: placeholder "… Type @ to mention someone." and below it "Type @ to mention a colleague. They get an e-mail…" | Duplicated | **remove** the placeholder sentence | `features/review/InternalNotes.tsx:58,65` |
| A-R13 | "Not a raw-material approval" three times on one screen | Duplicated | **keep once** (completion bar) | `CompletePanel.tsx:20-21,200`, `RmesSide.tsx:107` |
| A-R14 | "Mandatory · manual" plus "Added during the review" on one header | Two badges for one fact | **remove** " · manual" when `addedLater` | `SectionContent.tsx:159-160` |
| A-R15 | Completed bar "Jana Kraus (jana.kraus@…) · date · …" | The e-mail is not needed next to the name | **remove** the e-mail (minor) | `CompletePanel.tsx:200` |

### A-B · Business administrator: Rules, Questionnaire, Section owners, Reminders (`/admin/*`); the Auditor reads Rules only (A-B2, A-B3, A-B14)

Screenshots:
- `dist-applive/harness-end-user-tour-admin-rules.png`
- `dist-applive/harness-end-user-tour-admin-questionnaire.png`
- `dist-applive/harness-end-user-tour-admin-owners.png`
- `dist-applive/harness-end-user-tour-admin-reminders.png`
- `dist-applive/harness-end-user-tour-admin-section.png` (section editor, K1)
- `dist-applive/harness-end-user-tour-auditor-rules.png`
- `dist-applive/harness-ba-config-live-draft.png`

| # | Element | Why it may not be needed | Rec. | Code |
|---|---|---|---|---|
| A-B1 | Rule form **Basis** field ("Where the rule comes from": Requirements document / Agreed with Beiersdorf / Not in the requirements) | Kissflow's bake-off provenance. After today's change it is shown nowhere else. A new rule defaults to "Agreed with Beiersdorf". The basis is part of the rule's change key, so a basis-only edit marks the rule "Changed in draft" and makes a new rule-set version with no change in behaviour | **remove** the field (keep a silent default in the data; drop `basis` from the change key). Kept today, as asked. `harness-prototype.mjs:2139` checks `rule-basis` | `features/admin/RuleEditor.tsx:242,353-362`; `editorModel.ts:51`; `domain/configActions.ts:342`, `features/admin/config.ts:37` |
| A-B2 | Built-in rule notes under the rules: "Stated as 'always' in the requirements document." (R-00), "Not stated in the requirements document; every case gets these chapters." (R-01), "Split of the SF-11 rule per market." (R-110). Raw ids in "A3, A11 and A12 open through their own questions (SF-06, SF-11)." (R-10) and "Colorants (A7) open through SF-05." (R-13) | Requirements-document provenance and raw ids | **remove** the provenance notes; **reword** R-10/R-13 with "Annex 3…"; keep R-02, R-16, R-70, R-80, R-120 (business meaning) | `domain/builtinRules.ts:16-43`, shown at `RuleList.tsx` (note under the condition) |
| A-B3 | First version's change note: "First digital CIQ 2026 template: 8 chapters and 12 annexes (Turkey REACH K6.3 / Annex 12 not yet included), with rule set RS-2026.1 from requirements document v2.0 §5.3–5.4." | A § reference to our requirements document. The row's date (21 Sep 2026) and publisher come from the prototype's built-in first pair, not from a real publish | **reword**: "First version: CIQ 2026 template, 8 chapters and 12 annexes."; check the date and publisher wording | `domain/configActions.ts:30,191`; `domain/builtinRules.ts:46`; shown `ConfigBar.tsx:142` |
| A-B4 | Section owners: "Matches the requirements document" / "3 sections changed from the requirements document"; restore "Restore K2.2 to the requirements document" | Requirements-document provenance | **reword**: "Matches the original setup" / "Restore the original owners" | `features/admin/OwnershipMatrix.tsx:125,171` |
| A-B5 | Section owners callout "K2.2, K6.14 and K6.17 have more than one department … a co-reviewer … asks the supplier through the lead." | Hard-coded list, and it contradicts the workspace (any reviewer asks directly) | **reword** or derive from the data | `OwnershipMatrix.tsx:109` |
| A-B6 | Question ids in mono in the read-only section view (a published version's section): "FLD-GEN-001" (tooltip "Question id"). The draft's section editor shows them only as the tooltip "Question id FLD-…" | Internal field ids | **remove** the visible id (tooltip may stay) | `features/admin/SectionDrawer.tsx:99-101`, `QuestionnaireEditor.tsx:387` |
| A-B7 | Test rules: "A1: mandatory → optional" (raw section id and values); Answers column "Markets EU, UK · SF-03, SF-07, SF-05 colorant + preservative, micro waived" | Raw ids, values and shorthand | **reword** with section codes and the outcome labels | `RegressionCheck.tsx:94-95,111`, `ScopeSimulator.tsx:308`; `features/admin/config.ts:94-96` |
| A-B8 | Example material "Triglyceride for Turkey (tests the draft)": "Only RS-2026.2 with questionnaire v2 asks for Turkey REACH (K6.3, Annex 12)." | Written for the prototype's prepared RS-2026.2 draft, which live does not have | **reword** without version numbers | `domain/referenceMaterials.ts:27`, `ScopeSimulator.tsx:132` |
| A-B9 | Reminders page **Run reminders now** card with "Check as of: Today / In 3 days / … / In 30 days" | A demo/test control; refused live (`reminders: false`). The page itself is hidden from the menu (Thomas, 15 Oct) | **move to Diagnostics** or remove | `features/admin/ReminderSettings.tsx:133-169` |
| A-B10 | Reminders page subtitle "… Maintained by the business, without IT." and the run card's "Reminders run daily. Run them now …" | Pitch wording; "run daily" is not true live | **remove** | `ReminderSettings.tsx:142,224` |
| A-B11 | Reminder row "Certificate expiring (closed case)" "… No expiry dates are recorded yet, so nothing is sent." | A row that can never send | **remove** until expiry dates exist | `ReminderSettings.tsx:20`; `domain/seed.ts:95` |
| A-B12 | E-mail template preview "From: Beiersdorf CIQ <ciq-noreply@beiersdorf.example>" | A fake `.example` address; Kissflow sends from its own | **remove** the From line (or show the real sender) | `features/admin/MailTemplates.tsx:52`; `domain/mail.ts:12` |
| A-B13 | Mail channel hints: "Open-point e-mail: One reusable e-mail for every open-point event, in the portal and the app", "Task notification: The task e-mail of the app or the supplier portal" | Delivery implementation | **remove** the channel hint (keep the "Final document" badge) | `MailTemplates.tsx:70,105`; `mailTemplateData.ts:34-44` |
| A-B14 | Page subtitles "The business changes these rules…" / "The business changes them in a new version…" | Consultant voice on BDF's own screens | **reword** (low priority) | `RuleTable.tsx:105`, `TemplateManager.tsx:107` |

### A-A · Auditor: Audit trail (`/audit`); its read-only Rules page is covered by A-B2, A-B3 and A-B14

Screenshot: `dist-applive/harness-end-user-tour-auditor-audit-trail.png`

| # | Element | Why it may not be needed | Rec. | Code |
|---|---|---|---|---|
| A-A1 | "Recorded RMES result" detail "S-A1: not-listed — comment" (also `na`, `implausible`) | Raw criterion id and raw value | **reword** with the criterion title and the result label ("Not listed") | `domain/actions.ts:961`; live `app-live/write/actions.ts:505`; `features/reports/EventLog.tsx:177` |
| A-A2 | "Added finding: 0003-F1 (blocking) on S-A1: …", "Closed finding: 0003-F1", "Criteria added because the scope grew: S-C2 MOAH value…" | Internal ids; "Closed finding" says nothing else | **reword** with the criterion and finding text | `domain/actions.ts:639,974,996` |
| A-A3 | The Who cell falls back to the raw user id when a person is unknown | Rare, but a Kissflow id | **reword**: "Unknown user" | `features/reports/Who.tsx:31` |

### A-W · Business owner: Reports (`/reports`)

Screenshot: `dist-applive/harness-end-user-tour-owner-reports.png`

| # | Element | Why it may not be needed | Rec. | Code |
|---|---|---|---|---|
| A-W1 | "Origin (SF-01)" table head; takeaway "No case has answered the origin question (SF-01) yet." | Requirement code | **remove** the code | `features/reports/IntakeCards.tsx:80`, `reportData.ts:258` |
| A-W2 | Takeaway "… switches on Annex 1, Annex 2 and Annex 9 (R-10)." | Rule id | **remove** "(R-10)" | `reportData.ts:262-263` |

### A-S · App shell: every role

Screenshots:
- `dist-applive/harness-prod-no-topbar-prod-collapsed.png`
- `dist-applive/harness-end-user-tour-admin-rules.png` (A-S2 at the top)

| # | Element | Why it may not be needed | Rec. | Code |
|---|---|---|---|---|
| A-S1 | Unsent-items banner "You have 1 unsent item: Review CIQ-2026-0003-SAF-1. It reached Kissflow but was not sent on." with "Send or discard" linking **to Diagnostics** | Technical wording, an internal key (Review_Key), and it sends normal users to Diagnostics | **reword** ("1 change was not finished: <case> <what>"); offer Send/Discard inline | `app-live/AppLiveShell.tsx:148-160`; `app-live/load.ts:642` |
| A-S2 | Prod load notice "Some data could not be loaded… Reload · **Details**", where Details opens Diagnostics | The only other normal-screen link to Diagnostics in prod | **keep** Reload, drop Details (or link to a plain help text) | `AppLiveShell.tsx:172-174` |

---

## P. Supplier portal

**Basis:** the portal shows no Basis anywhere:
- no screen reads `rule.basis` or a rule's note
- the built `dist-portal/zip/index.html` contains none of the basis labels

One data point remains. The built-in rule set, with its basis and internal notes, is compiled into the portal JavaScript as the fallback for a request without a pinned bundle. It is never shown, but it can be read in the browser's devtools. Strip basis and note from the portal build if that matters.

Screenshots:
- `dist-portal/harness-supplier-home.png`
- `dist-portal/harness-fill-live-scope-metadata.png`
- `dist-portal/harness-completeness-confirmed.png`
- `dist-portal/harness-questions-answered.png`
- `dist-portal/harness-answer-attachment-sent.png`
- `dist-portal/harness-prod-no-topbar-expanded.png`

| # | Screen · element | Why it may not be needed | Rec. | Code |
|---|---|---|---|---|
| P-1 | Request page: the metadata pseudo-section's code "SF" in mono in the section list, "SF · Metadata questions" in the phone picker, "Next: SF · Metadata questions", a bare "SF" on Previous | An internal code, not hidden like GEN's | **remove** (hide the code as for GEN) | `features/supplier/lib.ts:63-69`, `Questionnaire.tsx:93,227`, `SectionPanel.tsx:138,146` |
| P-2 | Completeness check: group "SF Metadata questions" with "SF-01 · What is the origin of the raw material?"; the same labels in the release blockers | The codes are hidden on the questions in prod but leak here | **remove** the codes | `domain/selectors.ts:157`; `Completeness.tsx:100,106`, `lib.ts:243` |
| P-3 | Scope preview "What your answers switch on": "Because: polymer (SF-03) is Yes", "uV filter (SF-04) is Yes" (casing bug), and an empty "Because:" for sections Beiersdorf added | Question codes, a casing bug, an empty reason | **reword** (drop the codes as `portal/data/scope.ts:95-106` does; fix the casing; hide an empty "Because") | `features/supplier/ScopePreview.tsx:117-122`; `domain/conditions.ts:135` |
| P-4 | Composition table (K2.1): row id in mono next to "Component 1", e.g. "c1"; after a delete "Component 1" shows "c2" | An internal row key, confusing after deletes | **remove** | `features/supplier/ComponentTable.tsx:133` |
| P-5 | "Metadata" label plus the title "Metadata questions", and "metadata" in task rows, help and FAQ ("start with the metadata questions (0 of 11 answered)") | Design term rather than supplier language; the label repeats the title | **reword**, e.g. "Questions about your material" | `MetadataQuestions.tsx:86,89`, `TaskList.tsx:45-46`, `SupplierHelp.tsx:43,47,62,123` and others |
| P-6 | Help texts: "One production site per CIQ (aligned with business departments)." and "Activates the synthetic polymer microparticle review." (other SF help texts use "Activates …" too) | An internal decision note and engine wording | **reword** ("Adds the … section"); drop the bracket | `domain/catalog.ts:191-210,251` |
| P-7 | Origin note "There are no specific rules yet for waste, CCU or chemically recycled origins…" | Exposes a gap in Beiersdorf's rule set | **reword**: "For these origins you get the standard sections; Beiersdorf may ask for more." | `ScopePreview.tsx:20`, shown `MetadataQuestions.tsx:63` |
| P-8 | Answer drawer header: open-point id in mono, e.g. "OP-0001-01" (falls back to the Kissflow item id without a Query_Key) | Mostly a business reference, but the item-id fallback is not | **keep** the OP id; **remove** the item-id fallback | `AnswerDrawer.tsx:126`; `portal/data/map.ts:385` |
| P-9 | Conversation "Handed the question to <reviewer name>." | An internal hand-over between BDF reviewers | **remove** (or "Beiersdorf changed who handles this question") | `AnswerDrawer.tsx:42-43` |
| P-10 | "Asked by <reviewer name>, Beiersdorf" in the drawer, task rows and "Questions for you"; "Beiersdorf Beiersdorf asked" for system-raised questions | Names internal reviewers (decide with BDF); the duplicated word is a bug | **keep or reword** "Asked by Beiersdorf" (BDF's call); **remove** the duplicate | `AnswerDrawer.tsx:146-151,307,310`, `TaskList.tsx:55-56`, `PhaseViews.tsx:106,128` |
| P-11 | "Refers to: Go to GEN" / "Go to K6.18" when a query has no Ref_Label (falls back to the raw section id) | Raw key ("GEN" is "General" elsewhere) | **reword** with the section label | `portal/data/map.ts:487`; `AnswerDrawer.tsx:140,200,220,323` |
| P-12 | Loader "Connecting to Kissflow…" | Vendor name on a Beiersdorf portal | **reword**: "Loading your requests…" | `portal/PortalApp.tsx:137` |
| P-13 | No-access page "… has no Supplier or Admin role in this portal (roles: X, Y)" | Kissflow role names | **remove** the roles part | `portal/PortalApp.tsx:65` |
| P-14 | Contact named by their Kissflow user id when Assigned_Contacts has no name or e-mail ("X can confirm completeness…", "Answered by X") | A raw id instead of a name (data-dependent) | **reword**: "A colleague" | `portal/data/map.ts:194-197,567-569` |
| P-15 | Load-warnings box: "N items could not be read in full…" expands to "CIQP Request Pk…: listed without its step, so it can't be opened.", "ZZT-0003: no pinned questionnaire version on the request yet…", "… (Kissflow kept it at “Supplier: keep the CIQ up to date”)" | Kissflow process names, item ids, step names, pinning detail | **move to Diagnostics**; keep one plain sentence | `portal/supplier/PortalSupplierShell.tsx:83-94`; `LiveSupplierStore.tsx:86,93,122`, `map.ts:691,695` |
| P-16 | Save toast "Saved, but Beiersdorf's copy was not updated yet (<raw webhook error>). It updates with your next save." | Internal sync detail the supplier can't act on | **move to Diagnostics** (console), keep a plain line at most | `portal/data/liveActions.ts:84-93` |
| P-17 | Page error "Something in this request is not in the shape the portal expects (<JS error message>)." and toasts like "Kissflow answered with a different item (Pk…)" | Raw technical messages | **reword** to plain text; detail to the console/Diagnostics | `portal/PageBoundary.tsx:19`; `portal/data/client.ts:28,30,182,192,195` |
| P-18 | Help with no requests and no live help articles shows the old four-step flow ("Answer the basic questions" as its own step) and points to "Corrections", which no longer exists | Stale content | **remove** the old-flow branch | `features/supplier/SupplierHelp.tsx:20-37,85-86,139-142` |
| P-19 | My requests with no requests: three zero tiles ("0 requests in progress", "0 tasks due", "0 completed") above "No requests yet" | Duplicated empty state | **remove** the tiles when empty | `features/supplier/SupplierHome.tsx:28,81-87` |
| P-20 | Footer "Beiersdorf Supplier Portal · Raw material questionnaires" repeats the side pane | Duplicated | **remove** one (low priority) | `PortalSupplierShell.tsx:55,107` |
| P-21 | Admin's supplier preview only (not suppliers): field id "FLD-2.1-102", SF codes and rule ids "(R-10, R-30)" show, because `DemoSupplierStore` leaves `ProductionContext` false | The preview differs from what suppliers see | **reword**: set `ProductionContext` true in the demo store | `portal/demo/DemoSupplierStore.tsx:31-36`; `FieldRenderer.tsx:248-252`, `ConfigQuestions.tsx:45`, `ScopePreview.tsx:123` |

---

## Considered and kept

- **Case code, open-point ids, CIQ section codes, DUNS, BDF material no., INCI/CAS/EC.** These are business references:
  - the e-mail templates fill in `{Case ID}` and `{Open point}`
  - suppliers quote them
  - K2.1/Annex 4 is the CIQ template's own numbering
- **Rule ids, SF codes and version labels on the Business administrator and Auditor configuration screens.** These cover the Rules table, "Edit rule R-10", Test rules, "RS-2026.1 + v1" and the version history. The administrator needs a handle to edit, delete and search, and the auditor reconstructs which version applied. Remove them only from the working screens (A-Q, A-R, A-W, A-N).
- **Versions in History and in the Final document header.** They are the audit record and match the sealed PDF (A-H1 keeps them).
- **Department short codes in the small review chips** (QM, MIC, SAF…). Space is tight, and the full name is in the tooltip.
- **The final-document seal fingerprint in the audit entry** "Generated final document". This is tamper evidence for the Auditor (A-H2 and A-H5 are about the case screens only).
- **Already hidden live:** every `DemoNote` ("Prototype: …"), the AI suggestion box, the "Demo action" badge, Download CSV, and the dev top bar / role switcher / person chip. The raw action code for an unknown audit event shows in dev only (`app-live/map/auditMap.ts:200`).
