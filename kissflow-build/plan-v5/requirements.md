# CIQ final app: requirements for the Kissflow build (from the finalised prototype, 14 Oct 2026)

Kissflow-internal. Read-only extraction; nothing was called in Kissflow. Never cite this file to Beiersdorf.

The finalised clickable prototype is the ground truth. Where a document and the domain code differ, the code's behaviour is listed and the difference is named in section G.

**Sources** (cited as `file:line`; every path is under the project root):

| Short name | Path |
|---|---|
| `FINAL-APP-SPEC.md` | `prototype/FINAL-APP-SPEC.md` |
| `DEMO-GUIDE.md` | `prototype/DEMO-GUIDE.md` |
| `MANUAL-CHECKLIST.md` | `prototype/MANUAL-CHECKLIST.md` |
| `OVERNIGHT-LOG.md` | `prototype/OVERNIGHT-LOG.md` |
| `client-call.md` | `context/decisions/2026-10-09-client-call.md` |
| `types.ts`, `actions.ts`, `selectors.ts`, `mail.ts`, `configActions.ts`, `requestedDocs.ts`, `finalDocument.ts`, `permissions.ts`, `suppliers.ts`, `catalog.ts`, `rules.ts`, `builtinRules.ts`, `conditions.ts`, `reminders.ts`, `mentions.ts`, `seed.ts`, `core.ts`, `invariants.ts`, `metrics.ts`, `referenceMaterials.ts` | `prototype/src/domain/<name>` |
| `Gates.tsx`, `App.tsx` | `prototype/src/layout/Gates.tsx`, `prototype/src/App.tsx` (route table only) |

**Containers:** "app" = `CIQ_Digital_A00` (internal app, internal custom UI "Workbench"); "portal" = `CIQ_Supplier_Portal_A00` (supplier portal UI). Every portal item has an app twin (CLAUDE.md portal rule).

---

## A. Entities and their attributes

### A.1 Case and its parts

**A-01 Case (CIQ case).** One per raw material and supplier request. Attributes:
- `id` `CIQ-<year>-<NNNN>`, first one CIQ-2026-0001 (`actions.ts:190-192`, `FINAL-APP-SPEC.md:222`);
- `materialName` (trade name), `inci` (main INCI), `materialNo` (BDF material no.; stored on every case, AS-10) (`types.ts:393-396`, `client-call.md:98`);
- `supplierId`, `supplierContactIds` (1–2 active contacts of that supplier) (`types.ts:397,400`, `suppliers.ts:97-107`);
- `manufacturer`, `site` (start values; the supplier's GEN-004/-005 answers override them for display) (`types.ts:398-399`, `selectors.ts:74-77`);
- `ownerId` (RMM case owner), `createdAt`, `dueDate`, `priority` normal/high (`types.ts:401-403,426`);
- `phase` and `phaseHistory[]` {phase, at} (`types.ts:404,423`, `types.ts:387-390`);
- `templateVersion`, `ruleSetVersion`: the configuration pair pinned at creation (`types.ts:405-406`, `FINAL-APP-SPEC.md:275`);
- `config`: the metadata answers SF-01…SF-12 (A-06) (`types.ts:407`);
- `scope[]` (A-07), `answers{}`, `answeredBy{}`, `justifications{}` (A-08), `components[]` (A-09), `documents[]` (A-10), `requestedDocs[]` (A-11) (`types.ts:408-415,441`);
- `reviews[]` (A-15), `informed[]` = CUS, LEG (`types.ts:415-416`);
- `openPoints[]` (A-12), `rmes` (A-16), `confirmations[]` (A-18), `audit[]` (A-19), `internalNotes[]` (A-17) (`types.ts:417-420,428`);
- `cancelled` {by, at, reason, fromPhase} while cancelled (`types.ts:424-425`);
- `finalDocument` (A-22), generated once at the release (`types.ts:435-436`);
- `liveScope` = true on every case of the final app (the scope follows the metadata answers) (`types.ts:429-434`, `actions.ts:241`).
- Creation-only inputs that must be stored for the audit: duplicate reason (`duplicateNote`) and follow-up link (`followUpOf` {caseId, reportId}) (`actions.ts:162-165,245-249`).
- `reviewVersion` and `DocumentRef.version` are deprecated and never shown (no "review version", BRM v2 REQ-PROC-016) (`types.ts:421-422`, `FINAL-APP-SPEC.md:220`).

**A-02 Phase.** `supplier-input` (Part 1, one supplier step) → `review` (Part 2) → `final-release` → `completed`; plus `cancelled`. Labels "Supplier filling in the CIQ", "Review (RMM and departments)", "Awaiting final release", "Completed", "Cancelled". Part mapping: supplier-input = Part 1; review and final-release = Part 2; completed and cancelled = Closed. "Waiting on" (supplier / Beiersdorf / none): supplier-input and final-release wait on the supplier; review waits on the supplier only when every non-completed track is waiting-supplier. Stepper: Questionnaire · Beiersdorf review · Final release. The legacy phases `metadata` and `scope-check` are not built. (`types.ts:207-222`, `selectors.ts:33-61`, `FINAL-APP-SPEC.md:199`)

**A-03 Metadata (configuration) questions SF-01…SF-12.** Answered by the supplier inside the CIQ, except SF-11 (target markets), which RMM sets at case start and the supplier sees read-only. (`types.ts:33-48`, `catalog.ts:165-223`)

| Id | Question | Kind | Options |
|---|---|---|---|
| SF-01 | Origin of the components | multi | vegetable, animal, mineral, petrochemical, polymer, waste, ccu, chemrec |
| SF-02 | Additional production sites | yes/no | |
| SF-03 | Polymers / REACH polymer definition | yes/no | |
| SF-04 | UV filter | yes/no | |
| SF-05 | Colorant or preservative | multi | colorant, preservative |
| SF-06 | Fermentation or GMO | yes/no | |
| SF-07 | Mineral-oil based / hydrocarbon | yes/no | |
| SF-08 | Palm-based feedstock | yes/no | |
| SF-09 | In EUDR scope | yes/no | |
| SF-10 | Brazilian genetic heritage | yes/no | |
| SF-11 | Target markets (RMM) | multi | EU, UK, TR, CN, US, CA, OTHER |
| SF-12 | Microbiological testing required | yes/no | |

Required for the completeness gate: SF-01, -03, -04, -06, -07, -08, -09, -10, -12; SF-02 and SF-05 optional; SF-11 is RMM's (`selectors.ts:104-114`). Value lists: `types.ts:21-31`, labels `catalog.ts:54-73`.

**A-04 Scope item** (one per section of the case's questionnaire version): `sectionId`, `applicability` mandatory / optional / na, `firedRules[]`, `reason` (e.g. "Origin includes Vegetable → R-10"), `manual` {by, at, justification} for a department's extension, `addedLater` (added after the completeness confirmation). Kissflow: a "Scope" child table on the case. (`types.ts:196-205`, `rules.ts:126-138`)

**A-05 Answers.** `answers` keyed by field id; values are text, number, yes/no, list, range {min, max} or empty (`types.ts:112-120`). `answeredBy` {by, at} per field id, metadata id, `K2.1:components` and requested-document key: every answer shows who entered it and when (REQ-CTL-001) (`types.ts:410-411`, `FINAL-APP-SPEC.md:30`). `justifications` keyed by field id, section id (e.g. the K5.1 waiver) or requested-document key (`types.ts:413`). Beiersdorf-set GEN fields, locked for the supplier: FLD-GEN-001 trade name, -002 supplier name, -003 DUNS, -008/-009 contact e-mails (`selectors.ts:65-72`, `actions.ts:221-227`).

**A-06 Components table (K2.1).** One row per component: `id`, `inci`, `cas`, `ec`, `fn` (function), `additive` (yes/no), `origin` (SF-01 values), `concMin`, `concMax` (%). Kissflow: child table. (`types.ts:122-132`, `client-call.md:93`)

**A-07 Document.** `id`, `name` (file name), `kind` SDS / CoA / Specification / Analysis / Certificate / Statement / Other, `sectionId`, `fieldId` (the question, or a requested-document key), `uploadedBy`, `uploadedAt`, `sizeKb`. Documents are referenced by file name and upload date, several files per question are kept side by side, a new file never replaces an old one. A file is the answer only of a file question; a file sent with an open-point answer sits next to its question. (`types.ts:224-237`, `actions.ts:515-533`, `FINAL-APP-SPEC.md:220`)

**A-08 Requested document (slot)** (spec §8.5): evidence a fired rule asks for that no question collects. `key` `EV:<slug of the name>`, `doc` (name), `sectionId` (first live section the rule switches on, else K1), `ruleIds` (internal only), `why` (supplier wording, no rule ids), `conditions` (internal wording), `addedLater`, `kept`. Status per slot: Received (a file) · Not provided, justified · Missing. Kissflow child table "Requested documents" on the case item and on its portal twin with columns Document name, Key, Section, Requested by rule (internal), Attachment (several files), Uploaded by, Uploaded at, Cannot provide, Justification; the portal never shows the rule column. (`types.ts:444-467`, `requestedDocs.ts:127-139`, `FINAL-APP-SPEC.md:384-404`, `DEMO-GUIDE.md:147`)

### A.2 Review and clarification

**A-09 Review track.** `dept` RMM / REG / SAF / QM / MIC / SUS, `status` in-review / waiting-supplier / completed / reopened (not-started exists but is unused), `assigneeId`, `startedAt`, `completedAt`, `decision` approved/rejected and `decisionReason` (SAF and REG only), `continueAfterRejection` {note, by, at, depts} (RMM track only). On a cancelled case every unfinished track shows "Ended". (`types.ts:239-252`, `selectors.ts:361-363`)

**A-10 Open point.** `id` `OP-<last 4 digits of case id>-<NN>`, `caseId`, `dept` (the raising track, RMM included), `kind` query / document-request / additional-part / finding, `ref` {sectionId, fieldId, rowId, documentId, label}, `question`, `justification`, `responsibleId` (internal user of the point's department), `dueDate`, `status` open (with the supplier) / in-progress (answered, with Beiersdorf) / closed, `outcome` accepted / not-accepted / withdrawn, `createdAt`, `createdBy` (user or "system"), `rounds`, `thread[]`, `edits[]`, `closedAt`, `closedBy`, `closeReason` (internal, never to the supplier). (`types.ts:254-315`, `actions.ts:719-735`)

**A-11 Open-point history entry (thread message).** `id`, `at`, `by`, `side` internal/supplier, `text`, `action` raised / answered / returned / accepted / cannot-provide / note / edited / withdrawn, `documentId`, `newRound`. Every entry except `note` is supplier-visible. Internal and supplier labels: `selectors.ts:328-351`. (`types.ts:265-280`)

**A-12 Open-point edit.** `at`, `by`, `field` question / justification / dueDate / responsibleId, `from`, `to` (`types.ts:282-289`).

**A-13 RMES record** (Safety and Regulatory internal evaluation). `createdAt`, `criteria[]`, `findings[]` (`types.ts:352-358`).
- Criterion: `id`, `part` A–D, `dept` SAF/REG, `title`, `source` {sectionId, fieldId, documentId, label}, `result` available / plausible / listed / not-listed / negative / implausible / na, `comment`, `by`, `at`, `limit` {substance, value, unit, limit, limitSetVersion, pass}, `aiSuggestion` (`types.ts:317-340`).
- Criteria template (placeholder until BDF shares the real one, G-07): R-A1, R-A2, R-B1, R-B2, S-A1 (heavy metals limit check), S-B1, S-C1, S-D1, plus S-C2 MOAH when Annex 4 is in scope, R-C1 pesticides when Annex 1 is in scope, R-D1 inventories when a market is outside the EU (`actions.ts:538-568`). Limits: As ≤ 0.5, Cd ≤ 0.1, Cr ≤ 5.0 mg/kg, MOAH ≤ 1.0 mg/kg, limit set BDF-LIM-2026.1 (`catalog.ts:235-240`, `actions.ts:564`).
- Finding: `id`, `criterionId`, `dept`, `text`, `blocking` (legacy: every open finding blocks), `status` open/closed, `openPointId` (`types.ts:342-350`, `selectors.ts:209-210`).
- The decision (Approved/Rejected + reason) sits on the SAF/REG review track (A-09).

**A-14 Internal note.** `id`, `at`, `by`, `dept`, `text` (mentions stay in it as "@<name>"), `sectionId` (optional), `mentions[]` (user ids of active internal users, first mention first). Beiersdorf only. (`types.ts:655-669`, `mentions.ts:1-5,63-72`)

**A-15 Confirmation.** `type` completeness / dept-completion (every track, RMM included; `dept` says whose) / final-release / cancellation, `by`, `name`, `email`, `role`, `at`, `dept`, `note`. Recorded with name, e-mail, role and time. Fixed notes: completeness "data and documents provided from the supplier's point of view. Not a Beiersdorf approval."; completion "… Not a raw-material approval."; release "the information and evidence are correct and complete. The CIQ is frozen." (`types.ts:360-374`, `actions.ts:84-88,656,1001-1006,1102`, `FINAL-APP-SPEC.md:32,62`)

**A-16 Change report** (after the release): `id` CR-NNNN, `caseId`, `at`, `by`, `text` (`types.ts:646-653`, `actions.ts:1171`).

### A.3 Audit, mail and the final document

**A-17 Case audit event.** `id`, `at`, `by` (user or "system"), `action` (short verb phrase), `detail`, `sectionId`. Every action and every refused change attempt on a closed case is audited. (`types.ts:376-385`, `core.ts:29-31`, `actions.ts:119-125`)

**A-18 Global log** (supplier master and configuration changes): `id` L-NNNN, `at`, `by`, `kind` supplier/config, `action`, `detail`, `supplierId` (`types.ts:635-644`, `core.ts:37-40`).

**A-19 Mail / notification.** `id`, `at`, `to[]` (user ids), `by`, `event` (C-01…C-20), `channel` open-point-webhook / task-notification / final-document, `audience` supplier/internal, `subject`, `body`, `caseId`, `opId`, `sectionId`, `link` (deep link to the item), `readBy[]`, `key` (idempotency). (`types.ts:585-633`, `FINAL-APP-SPEC.md:84-93`)

**A-20 Final document and its seal.** Generated once at the release, immutable, internal only. `id` `<caseId>-FD`, `caseId`, `generatedAt`, `trigger` ("Final release by …"), `fingerprint` (shown as "Document seal": a hash over the content, re-checkable), and (`types.ts:469-583`, `finalDocument.ts:85-189`, `OVERNIGHT-LOG.md:81`):
- `header`: case ID, material, INCI, material no., supplier name, DUNS, manufacturer, site, markets, questionnaire version, rule set version, owner name, created, released;
- `metadata`: SF-01…SF-12 as released with who/when, SF-11 marked as set by Beiersdorf (`finalDocument.ts:45-54`);
- `sections`: every section in scope (plus a waived K5.1 with its justification) with code, title, applicability, addedLater, answers {label, value with unit, by, at, justification}, the section justification, and the requested documents that are not missing (`finalDocument.ts:96-110`);
- `components`: the K2.1 rows;
- `evidence`: file name, section, question, uploader, upload date; a requested document that was justified instead, with justification, who and when (`finalDocument.ts:111-179`);
- `threads`: per open point: ref, kind, raised by/at, result (Accepted / Not accepted / Closed, no answer needed / Withdrawn with the case cancellation), rounds round by round with who, when, side, action, text; attachments by name only; the internal "not accepted" reason is replaced by "Closed as not accepted." (`finalDocument.ts:56-81,180`);
- `confirmations`: completeness, each track completion (labelled with the department), final release; not the cancellation (`finalDocument.ts:181-183`);
- Never contains RMES criteria, findings, decisions, internal notes or internal reasons (`FINAL-APP-SPEC.md:72`, `finalDocument.ts:1-5`).

### A.4 Master data and people

**A-21 Supplier.** `id`, `name`, `duns` (exactly 9 digits after removing spaces and dashes, unique), `country`, `city`, `type` manufacturer/distributor, `contactIds`, `active` (deactivated, never deleted). Imported data master, no onboarding flow. Demo start: Solvaro Oleochemicals S.A., DUNS 471203958, Tarragona, Spain, manufacturer. (`types.ts:688-698`, `suppliers.ts:34-73`, `FINAL-APP-SPEC.md:8,157`, `seed.ts:56`)

**A-22 Supplier contact** (portal user). `id`, `name`, `email` (valid, unique across every user of every supplier and Beiersdorf), `title`, `supplierId`, `active`, `deactivatedAt`, `mayConfirm` (may confirm completeness and give the final release; default true). Demo start: Elena Márquez (Regulatory Manager), Ravi Menon (QA Specialist). (`types.ts:671-686`, `suppliers.ts:76-88,162-168`, `seed.ts:56`)

**A-23 Internal user and role.** `id`, `name`, `email`, `title`, `dept` RMM / REG / SAF / QM / MIC / SUS / CUS / LEG, or a role without department: Business administrator, Auditor, Business owner. One person per role in the demo; 11 role holders (Katrin Vogel RMM, Dr. Jonas Albrecht REG, Dr. Mira Hansen SAF, Lena Krause QM, Tobias Keller MIC, Sophie Wagner SUS, Felix Schulz CUS, Dr. Anna Becker LEG, Nina Hoffmann Admin, Paul Neumann Auditor, Dr. Claudia Richter Owner). Review departments: REG, SAF, QM, MIC, SUS; informed: CUS, LEG. (`types.ts:5-15`, `seed.ts:25-38`, `catalog.ts:26-52`, `FINAL-APP-SPEC.md:262`)

### A.5 Configuration

**A-24 Configuration pair (release).** Rule set `RS-2026.N` + questionnaire `CIQ-2026 vM`. `ruleSet` {version, rules[]}, `template` {version, sections[]}, `status` draft/published, `basedOn` {ruleSetVersion, templateVersion}, `note` (at creation), `createdAt`, `createdBy`, `changeNote` (required to publish), `publishedAt`, `publishedBy`. At most one draft; published pairs never change; status shown as Draft / Used for new cases / Superseded, running cases keep it. The built-in first pair RS-2026.1 + v1 (published 21 Sep 2026) is not stored; the prepared RS-2026.2 + v2 (Turkey REACH: K6.3 with KKDIK number + confirmation upload, Annex 12, rule R-111) is the initial draft. (`types.ts:780-803`, `configActions.ts:29-52,284-315`, `FINAL-APP-SPEC.md:272-277`)

**A-25 Rule (data).** `id` R-NN, `question` (follows the condition; "ALWAYS"), `condition`, `activates[]` (section ids), `outcome` mandatory / optional / na, `evidence[]` (document names), `departments[]` (reviewed by), `basis` document ("Requirements document") / agreed ("Agreed with Beiersdorf") / not-stated ("Not in the requirements") / open ("Open question"), `note`, `flagsCase` (opens nothing, flags the case for RMM). (`types.ts:149-167`, `conditions.ts:234-240`)

**A-26 Rule condition (declarative).** `always`; `includes-any` {question, values} (SF-01, SF-05, SF-11); `any-except` {question, values} (e.g. any market outside the EU); `is` {question, true|false}; `yes-or-unanswered` {question}. One evaluator and one plain-sentence builder ("Origin includes Vegetable", "Any target market outside the EU"); an unanswered multi-choice never matches. Validation: question exists, kind fits the question, values known, includes-any needs ≥ 1 value, any-except must leave ≥ 1 value unticked. (`types.ts:134-147`, `conditions.ts:10-82,141-166`)

**A-27 Built-in rule sets.** RS-2026.1 = 25 rules R-00, R-01, R-02, R-10, R-12…R-16, R-30, R-40, R-50, R-51, R-60, R-70, R-80, R-90, R-100, R-110, R-112…R-115, R-120, R-121; RS-2026.2 adds R-111 (Turkey). They must be loaded as data with identical behaviour (proven over ~4,600 answer sets). (`builtinRules.ts:12-49`, `FINAL-APP-SPEC.md:287`, `OVERNIGHT-LOG.md:74`)

**A-28 Questionnaire version, section and field (data).**
- Version: `version`, `sections[]` in order (`types.ts:774-778`).
- Section: `id` (from the code: "K6.18", "Annex 14" → "A14"), `code`, `title`, `kind` basic / chapter / annex, `meaning` ("What does this section cover?"), `lead` (department), `co[]` (co-reviewers), `documentsOnly`, `fields[]`, `retired`, `trigger` text (built-in only) (`types.ts:756-772`).
- Field: `id` (FLD-<section>-NNN, never reused across versions), `label`, `type` text / email / number / decimal / range / yesno / single / multi / file / longtext, `required` mandatory / optional / conditional (built-in only), `options[]` {value, label} for choice types, `unit` (number/decimal; "" = no unit), `help`, `owner` (department) (`types.ts:72-110,740-754`, `configActions.ts:910-917`).
- Built-in catalogue: 46 sections (GEN, K1…K8.1, Annex 1…13; v1 leaves out K6.3 and Annex 12) and 49 fields incl. K1 evidence slots FLD-K1-004…010 (live-scope only) (`catalog.ts:87-138,242-354,380-390`).
- Built-in fields keep their conditional visibility (`showWhen`) and validation (`validate`), e.g. DUNS 9 digits, e-mail, % 0–100, natural origin index 0–1, K2.2 above-limit justification, A1 pesticide branch, A1 RSPO branch, A4 viscosity branch, K5.1 report vs waiver by SF-12. Admin-created fields: e-mail format and whole-number checks only. (`catalog.ts:230-354,470-494`)

**A-29 Section owners.** Per section: `lead` department and `co[]` departments. The lead of each in-scope section gets a review track; co-reviewers get data-changed mails when they have a track. Initial values from the catalogue. Not versioned (a change applies to running cases from then on). (`types.ts:817`, `seed.ts:78`, `selectors.ts:217-236`, `actions.ts:1213-1228`, `OVERNIGHT-LOG.md:74`)

**A-30 Reminder setting.** `id`, `event`, `recipient`, `afterDays`, `escalateTo`, `escalateAfterDays`, `enabled`. Defaults: rem-1 supplier task not started 7 d / escalate RMM owner 14 d; rem-2 query or document request unanswered 5 d / requesting reviewer + RMM 10 d; rem-3 review task idle 5 d / RMM owner 10 d; rem-5 final release pending 3 d / RMM owner 7 d; rem-6 certificate expiring (closed case) disabled, no data in the MVP. (`types.ts:828-836`, `seed.ts:90-96`, `reminders.ts:5-6`, `DEMO-GUIDE.md:142`)

**A-31 Reference materials for "Test rules".** Eight fixed answer sets (sunflower, palm, mineral oil, paraffin, acrylate, TiO2, CCU, Turkey), each with a template version and "what to look for"; never run on cases. (`referenceMaterials.ts:1-28`, `FINAL-APP-SPEC.md:183`)

**A-32 Derived supplier task** (portal task list): `caseId`, `kind` questionnaire / query / final-release, `title`, `detail`, `due`, `openPointId`. Fill in the CIQ (supplier-input), Give the final release (final-release), and one per open point with status open in review or final-release ("Answer a question from Beiersdorf", "Provide a requested document", "Complete an additional section"); only for cases the contact is named on, none once deactivated. (`selectors.ts:263-288,416-421`)

---

## B. Workflow, state transitions and guards

Every refused action leaves the data unchanged and shows the reason (`core.ts:17-20`). Every step below is audited (A-17).

### B.1 Part 1: case start and supplier input

**B-01 Create the case (RMM).** Guards, in order: actor is RMM; trade name, main INCI and BDF material no. not empty; supplier from the master and active; 1–2 distinct active contacts of that supplier; ≥ 1 target market; due date today or later; owner is an RMM user. An empty submit lists every missing item. Effects: next case ID; pins the newest published pair; SF-11 = the chosen markets; scope derived at once; GEN-001/-002/-003/-008/-009 pre-filled from the case and the master; phase supplier-input; audits "Created case", "Derived scope", "Invited supplier contacts"; invitation mail (C-01). No review task yet. (`actions.ts:168-255`, `FINAL-APP-SPEC.md:25-27`, `DEMO-GUIDE.md:25`)

**B-02 Duplicate warning.** An open case for the same supplier and the same material number (ignoring spaces, dashes, case) shows a warning and asks for a reason; creating it anyway is audited with the reason. (`selectors.ts:399-405`, `actions.ts:249`, `MANUAL-CHECKLIST.md:14`)

**B-03 Follow-up case.** From a change report RMM starts a new, pre-filled case; it is audited as a follow-up of the earlier case and report. (`actions.ts:245-248`, `MANUAL-CHECKLIST.md:126`, `OVERNIGHT-LOG.md:63`)

**B-04 Supplier write guard (all supplier data).** Answers, metadata, component rows, justifications and uploads need an active contact named on the case and phase supplier-input, review or final-release. On a completed or cancelled case every attempt is refused and logged ("Change attempt refused"); completed: "Use Report a change instead". (`actions.ts:115-128`, `permissions.ts:86,130-134`, `FINAL-APP-SPEC.md:63`)

**B-05 Beiersdorf-set fields are locked.** GEN trade name, supplier, DUNS and contact e-mails cannot be changed by the supplier; SF-11 always stays RMM's value. (`actions.ts:301,452`, `selectors.ts:65-72`, `OVERNIGHT-LOG.md:55`)

**B-06 Scope derivation.** Deterministic: same answers + same rule set → same scope. Only sections of the case's questionnaire version count; strictest outcome wins (mandatory > optional > N.A.; equal outcomes list every rule); a section no rule touches is N.A. "No rule activates this section for these answers". (`rules.ts:101,111-140`)

**B-07 Metadata answer in Part 1 (live scope).** Each change re-derives the scope: sections open AND close live; answers in a closed section are kept and come back when it reopens; a manual extension is never lowered; audited only when the scope changes. (`actions.ts:285-321`, `FINAL-APP-SPEC.md:29`, `client-call.md:15-16`)

**B-08 Requested documents follow the answers until completeness.** Derived from the fired rules' evidence minus what a question collects (the question in the case's version and its section in scope); placed in the asking rule's first live section, else K1 (GEN as last resort); two rules asking for the same document share one slot. Uploads and justifications are kept when a slot closes. (`requestedDocs.ts:48-83`, `FINAL-APP-SPEC.md:388-394`)

**B-09 Completeness blockers.** Unanswered required metadata questions; in every mandatory section each visible non-optional field without a value and without a justification; a value failing its validation; K2.1 with no component row; K5.1 waived (SF-12 = No) without the waiver justification FLD-5.1-002; every missing requested document (in mandatory and optional sections; internal label "… (requested by rule R-xx)", supplier label "… (requested document)"). Optional sections block nothing else. (`selectors.ts:123-128,152-187`, `FINAL-APP-SPEC.md:31,396`)

**B-10 Confirm completeness (gate).** Guards: phase supplier-input; active named contact with `mayConfirm`; zero blockers (the supplier sees them named; "Confirm" stays disabled; declaration plus checkbox). Effects: phase review; completeness confirmation; tracks: RMM (assignee = case owner) plus the lead department of every in-scope section among REG, SAF, QM, MIC, SUS; CUS and LEG informed; an RMES record when SAF or REG has a track; the requested-document list is fixed on the case; an origin without rules is flagged for RMM; mails C-02 and C-03. (`actions.ts:638-689`, `selectors.ts:217-230`, `FINAL-APP-SPEC.md:32-36`, `MANUAL-CHECKLIST.md:30-33`)

**B-11 A contact without `mayConfirm`** can fill in but cannot confirm or release ("Ask a colleague who may confirm"). (`permissions.ts:135-140`, `MANUAL-CHECKLIST.md:125`)

**B-12 Parallel contacts.** Two contacts may work at the same time; every answer and upload shows who entered it and when. (`FINAL-APP-SPEC.md:30`, `actions.ts:455,528-532`)

### B.2 Part 2: review

**B-13 Track status automation.** A track with an open point of its own (status open) is waiting-supplier, otherwise in-review; completed tracks are untouched. (`actions.ts:139-147`, `invariants.ts:47-51`)

**B-14 Raise an open point.** Guards: phase review (in final-release: "Reopen your review to ask"); actor is a member of the raising track's department and that track exists and is not completed; question not empty; the section is not N.A.; due date today or later; the responsible person is an active internal user of the point's department. Reference: a field, a K2.1 row or a document. Effects: ID, status open, rounds 1, thread "raised", track → waiting-supplier, mail C-04. RMM may ask on any section. (`actions.ts:693-741`, `permissions.ts:103-110,150-151`, `FINAL-APP-SPEC.md:38,41,45`, `MANUAL-CHECKLIST.md:41`)

**B-15 Supplier answers an open point.** Guards: active named contact; the point is open (answered → "with Beiersdorf"; closed → "Beiersdorf closed this question"); text required. Options: answer, upload a document stored at the question (no separate data-changed mail), or cannot provide with a reason. The supplier can also correct the field itself. Effects: status in-progress, thread entry, mail C-05. A K2.1 row Beiersdorf asked about cannot be deleted while the point is unresolved. (`actions.ts:743-768,467-469`, `permissions.ts:143-149`, `FINAL-APP-SPEC.md:46`)

**B-16 Raiser decides: accept / return / close as not accepted.** Only the raiser (for a system-raised point: its responsible person); the point must be answered (in-progress); return and not-accepted need a reason. Accept → closed/accepted. Return → open, rounds + 1, due date = later of the old due date and now + 7 days, new round. Not accepted → closed/not-accepted with an internal "note" entry; for SAF/REG also a closed finding. Mails C-06, C-07, C-09. (`actions.ts:770-801`, `permissions.ts:77-78,152-160`)

**B-17 Raiser edits (AS-08).** Only the raiser; not closed; question not empty; due date today or later; responsible in the point's department and active; refused when nothing changed. Editing the question of an answered point starts a new round (status open, rounds + 1); changing only due date, justification or responsible does not. Each change is kept in `edits` and as an "edited" thread entry visible to the supplier ("Changed by Beiersdorf"). Mail C-08. (`actions.ts:803-868`, `FINAL-APP-SPEC.md:47-50`)

**B-18 Raiser closes (withdraws).** Only the raiser; any unresolved status; internal reason required (never shown to the supplier). Outcome withdrawn; supplier sees "Closed, no answer needed". Mail C-09. (`actions.ts:870-894`, `DEMO-GUIDE.md:52`)

**B-19 Every unresolved open point blocks the completion of the track that raised it** (no blocking/non-blocking split). (`FINAL-APP-SPEC.md:51`, `selectors.ts:198-206`, `client-call.md:101-103`)

**B-20 RMES results.** Guards (B-20…B-23): phase review; the case has an RMES record; actor in the criterion's department (SAF/REG); that track not completed. A comment is required for negative, implausible or N.A. (`actions.ts:896-918`)

**B-21 Findings.** Add a finding on a criterion (text required); turn a finding into a query to the supplier (kind finding, justification "Needed for the internal evaluation"; the finding links the open point); close a finding. (`actions.ts:920-952`)

**B-22 Safety/Regulatory decision.** Only the department itself; every own criterion has a result; Approved is refused while an own finding is open; Rejected needs a reason. Rejected flags the case for RMM and reopens a completed RMM review. The supplier never sees it. (`actions.ts:954-975`, `FINAL-APP-SPEC.md:57-59`)

**B-23 RMES follows Part 2.** After a Part 2 change the record gains newly applicable criteria (e.g. MOAH after a late Annex 4) and re-computes limit checks; recorded results stay; a completed SAF/REG track that owns a new criterion is reopened. An RMES record is created when SAF or REG joins late. (`actions.ts:570-601,626-628`)

**B-24 Complete a review.** Guards: phase review; the track exists; actor in the track's department; not already completed; no blockers: own unresolved points; for SAF/REG also criteria without result, open findings, no decision. RMM: when a SAF/REG decision is Rejected and RMM has not covered it, RMM must choose "Continue to final release" with a note (stored on the RMM track and audited) or cancel the case (B-31). The undefined-origin flag never blocks. Completion is not an approval. Effects: completed, dept-completion confirmation; when every track is completed → phase final-release and exactly one release-requested mail (C-11). No manual case completion exists. (`actions.ts:977-1027`, `selectors.ts:198-215,365-375`, `FINAL-APP-SPEC.md:56-60,261`)

**B-25 Reopen a review.** Part 2 only; actor in the track's department; the track is completed; reason required. Status reopened. In final-release the case goes back to review and the release request is withdrawn (C-12); it goes out again when every track has completed. (`actions.ts:1029-1047`, `FINAL-APP-SPEC.md:55`)

**B-26 Reassign within the department.** Case open; actor in the track's department; target is another active internal user of that department; reason required. System-raised points of the track follow the new assignee; points a person raised stay with that person. Mail C-02 to the new assignee. (`actions.ts:1049-1069`, `FINAL-APP-SPEC.md:175`)

**B-27 Late activation of tracks (system).** A missing track is added in review with its assignee; a completed one is reopened; RMES created if SAF/REG joins; a final-release case goes back to review with the request withdrawn. Mails C-02, C-12. (`actions.ts:605-636`)

**B-28 Grow-only metadata change in Part 2.** The scope only grows: a section may open or become stricter, never close or drop from mandatory to optional ("kept"). For each added or upgraded section: addedLater; its lead track activated or reopened; a system open point (additional-part, due in 14 days, responsible = the track's assignee); new requested-document slots are added ("Added after your completeness confirmation"), old ones kept. A newly chosen origin without rules flags the case and reopens RMM's review. A final-release case goes back to review. Mails C-10 and the lead-track mail. (`actions.ts:323-395`, `rules.ts:221-259`, `requestedDocs.ts:87-112`, `FINAL-APP-SPEC.md:54,394`)

**B-29 A department adds a missing section (REQ-ADR-002).** Part 2 and phase review only; a reviewing department (not RMM); its own track open; justification required; the section is in the case's version and not already mandatory. Effects: mandatory with manual {by, at, justification}, addedLater; lead and asking tracks activated; an additional-part open point owned by the asker (14 days); the supplier gets a task. RMM never adds sections. (`actions.ts:397-439`, `permissions.ts:167-168`, `FINAL-APP-SPEC.md:42,39`)

**B-30 Supplier changes during Part 2.** Any answer, row, justification or document may change until the final release; each change is audited with name and time, mails C-10, refreshes RMES, and marks the section "changed since your review" for each track (since its completion, else since the completeness confirmation). (`actions.ts:441-536`, `selectors.ts:433-457`, `FINAL-APP-SPEC.md:52-53`)

### B.3 Ending, cancellation, after the release

**B-31 Cancel (RMM).** Any phase before completion; justification required. Every unresolved open point is closed as withdrawn ("Closed: the request was withdrawn."; reason "Case cancelled: …"), every task ends, unfinished tracks show "Ended"; cancellation confirmation; `fromPhase` kept. Mails C-15. (`actions.ts:1109-1139`, `FINAL-APP-SPEC.md:76-77`)

**B-32 Reactivate (RMM).** Only a cancelled case; within 365 days of the cancellation; justification required; optional new due date (today or later). Returns to the phase it had; earlier data kept; closed points stay closed. Mails C-16. (`actions.ts:1141-1161`, `selectors.ts:355-359`, `FINAL-APP-SPEC.md:78`)

**B-33 Release blockers.** The request is out (phase final-release, i.e. every track completed); no unresolved open point; no completeness blocker (B-09) — e.g. a cleared mandatory field. Reasons are listed to the supplier in its wording. (`selectors.ts:377-397`, `FINAL-APP-SPEC.md:61`)

**B-34 Final release (supplier).** Phase final-release; active named contact with `mayConfirm`; no release blocker. Effects in one step: final-release confirmation; the CIQ is frozen; the case completes automatically; the final document is generated once (A-20) and filed on the case; mails C-13 and C-14. (`actions.ts:1071-1107`, `FINAL-APP-SPEC.md:60-75`)

**B-35 Frozen after the release.** Every change attempt is refused and logged; the released case never changes. (`FINAL-APP-SPEC.md:63,79`, `actions.ts:119-125`)

**B-36 Report a change (supplier).** Named contact; phase completed only (before it the supplier edits directly); text required. Change report + audit; mail C-17; RMM may start a pre-filled follow-up case (B-03). (`actions.ts:1163-1176`, `FINAL-APP-SPEC.md:79`)

**B-37 Internal notes and @mentions.** Internal users except Admin, Owner and Auditor; not on a closed case; text required. "@<name>" of an active internal user mentions that person (case and accents ignored, longest name wins, an e-mail address is no mention, a leading "Dr." may be left out); suppliers can never be mentioned. Mail C-20 to each mentioned person except the writer. (`actions.ts:1178-1196`, `permissions.ts:169-173`, `mentions.ts:41-72`)

### B.4 Supplier master

**B-38 Add supplier (admin).** Name; DUNS 9 digits and unique; country; type; ≥ 1 contact, each with a name and a valid e-mail unique across all users and within the form. A similar name is a warning, not an error. (`suppliers.ts:51-94,172-185`, `FINAL-APP-SPEC.md:150-155`)

**B-39 Edit supplier / deactivate / reactivate (admin).** Same validation; deactivation refused while the supplier has open cases; an inactive supplier cannot be chosen for a new case and its contacts can no longer open the portal; history and closed cases kept; reactivate makes it selectable again. Running cases keep their start data. (`suppliers.ts:189-208`, `FINAL-APP-SPEC.md:148`)

**B-40 Add / edit contact (admin).** Same contact validation; an e-mail change updates GEN-008/-009 on the contact's open cases (audited); earlier answers and confirmations keep the old name. (`suppliers.ts:210-250,109-123`)

**B-41 Deactivate / reactivate contact (admin).** Never deleted. Refused for the supplier's last active contact. On each open case it is named on: replaced by a chosen active contact of the same supplier (required where it is the only case contact; the replacement gets the invitation), or simply removed when another case contact remains; GEN e-mails follow. A deactivated contact keeps its history and name on answers, gets no more mail or tasks and cannot open the portal. Reactivating gives no case access by itself. No "Edit case contacts" on an existing case. (`suppliers.ts:150-158,252-297`, `FINAL-APP-SPEC.md:149,156,169`)

### B.5 Configuration (admin)

**B-42 Create a new version (draft).** Refused while a draft exists. Copies the newest published pair; working numbers per side RS-2026.(highest + 1) and v(highest + 1); section owners copied from the Section owners setting; optional note. (`configActions.ts:258-269,588-620`, `FINAL-APP-SPEC.md:302`)

**B-43 Discard draft.** Drops the draft only; logged with its changes. (`configActions.ts:622-632`)

**B-44 Add / edit / delete a rule in the draft.** Condition valid (A-26); every activated section exists in the draft; ≥ 1 reviewing department; new ids continue the R-numbering and are never reused; editing a published rule inside the draft is allowed; deleting removes it from the draft only. (`configActions.ts:634-692`, `FINAL-APP-SPEC.md:305`)

**B-45 Add / edit a section.** Code normalised ("k 6.20" → "K6.20", "a 14" → "Annex 14"); the code, and for a new section its derived id, must not match any section of any version (built-in, published, draft, retired included) by the key that ignores case, spaces, leading zeros, a trailing dot and treats "Annex" = "A"; the section being edited is not compared with itself; message names the clashing section and where it is ("in this draft", "retired in this draft", "in published version v3", "in the built-in catalogue"); new sections are inserted after the last section of their kind that sorts before them; switching to documents-only is refused while it has questions; GEN cannot be documents-only. (`configActions.ts:694-877`, `FINAL-APP-SPEC.md:307-308`)

**B-46 Retire / restore a section.** Retire hides it for new cases on that version, never deletes; GEN cannot be retired; rules pointing at it are flagged. Restore brings it back. (`configActions.ts:879-903`, `FINAL-APP-SPEC.md:309`)

**B-47 Add / edit / move / remove a question.** Only in a draft section that is not retired and not documents-only; option texts unique; generated id FLD-<section>-NNN; number/decimal unit "" = none, unset = check fails; removing keeps it in earlier versions. (`configActions.ts:905-976`, `FINAL-APP-SPEC.md:310`)

**B-48 Validate the draft (8 checks, publish blocked while one fails).** 1 the draft changes the rules or the questionnaire; 2 every rule switches on ≥ 1 existing non-retired section, or asks for evidence, or flags the case; 3 every live section is switched on by ≥ 1 rule with outcome ≠ N.A.; 4 no empty codes, titles, question or option labels; 5 choice questions have ≥ 2 options; 6 number questions have a unit or "no unit"; 7 section codes unique; 8 non-documents-only sections have ≥ 1 question. Warnings (not blocking): rules pointing at retired/unknown sections. Information (not blocking): evidence no question collects, with where its upload slot goes. Each failing check links to what to fix. (`configActions.ts:443-562`, `FINAL-APP-SPEC.md:311-321`, `MANUAL-CHECKLIST.md:82`)

**B-49 Publish.** Needs a change, a change note and a passing validation. Only the changed side gets its new number (rules only → RS-2026.(N+1) + kept vM; questionnaire only → kept RS + v(M+1); both → both); the kept side is stored as an identical copy and never defines its version; numbers grow per side; the previous pair becomes "Superseded, running cases keep it"; new cases use the new pair; a questionnaire change writes new/changed section owners into the Section owners setting; logged with "Rules only" / "Questionnaire only" / "Rules and questionnaire"; toast names the pair and how many running cases keep the old one. (`configActions.ts:68-113,978-1031`, `FINAL-APP-SPEC.md:276-277,322,355`)

**B-50 Version pinning.** A case keeps its pair for good; every screen that lists a case's fields resolves them in the case's questionnaire version (supplier questionnaire, completeness blockers, review workspace, case Questionnaire tab, final document): a field added in v3 never appears on a v1 case. (`actions.ts:197-198`, `selectors.ts:116-121`, `FINAL-APP-SPEC.md:275,293`)

**B-51 Section owners and reminder settings (admin).** Changing a section's lead/co applies to open cases from then on (new tracks, added sections, change mails) and to the draft unless the draft changed that section; reminder settings changes are logged. (`actions.ts:1213-1239`)

**B-52 Origins without rules** (waste, CCU, chemical recycling): standard sections only, the "Beiersdorf may ask for more" note to the supplier, and an informational flag in RMM's review (never blocking). (`rules.ts:185-196`, `selectors.ts:238-245`, `builtinRules.ts:24`, `client-call.md:17-20`, `MANUAL-CHECKLIST.md:22`)

---

## C. Events that send mail

General rules (C-00): recipients de-duplicated; unknown and deactivated users get nothing; a mail with no recipient left is not sent; a `key` makes a mail idempotent; channel = open-point-webhook for every `op-*` event, final-document for the final document, task-notification otherwise; supplier mails are built only from whitelisted supplier-visible facts (case ID, material, reference, question, due date, the return text) and never carry notes, RMES, findings, decisions or internal reasons; an internal mail never goes to a supplier contact; every mail deep-links to its item. (`mail.ts:1-4,39-83,96-188`, `invariants.ts:77-97`, `FINAL-APP-SPEC.md:84-99`, `client-call.md:75-80`)

R-1: one common generic webhook e-mail integration, in the portal and the app, for every open-point event (`client-call.md:75-80`).

| # | Event | When | Recipients | Audience / channel | Source |
|---|---|---|---|---|---|
| C-01 | invitation | case created; a replacement contact takes over; (a contact added to a case) | every active case contact (or only the new one); wording depends on the phase | supplier / task-notification | `actions.ts:253,281`, `suppliers.ts:293`, `mail.ts:125-137` |
| C-02 | review-assigned | completeness confirmed; track activated or reopened later; review reassigned | the assignee of each track concerned | internal / task-notification | `actions.ts:670,632-633,1067`, `mail.ts:216-229` |
| C-03 | informed | completeness confirmed | every active Customs user and every active Legal user; link opens K7 / K8 | internal / task-notification | `actions.ts:671-687` |
| C-04 | op-raised | open point raised (by a reviewer or the system) | every active case contact | supplier / open-point-webhook | `actions.ts:740`, `mail.ts:138-141` |
| C-05 | op-answered | supplier answers or says it cannot provide | the raiser (responsible person for a system point) + the responsible person, once each; may quote the answer and the document name | internal / open-point-webhook | `actions.ts:767`, `mail.ts:196-214` |
| C-06 | op-returned | raiser returns the answer | case contacts, with the return text and new due date | supplier / open-point-webhook | `actions.ts:799`, `mail.ts:146-149` |
| C-07 | op-accepted | raiser accepts | case contacts | supplier / open-point-webhook | `actions.ts:799`, `mail.ts:150-153` |
| C-08 | op-edited | raiser edits the point | case contacts; current text and due date; "please answer the changed question" on a new round | supplier / open-point-webhook | `actions.ts:866`, `mail.ts:142-145` |
| C-09 | op-closed | raiser closes (withdraws) or closes as not accepted | case contacts; no reason | supplier / open-point-webhook | `actions.ts:799,892`, `mail.ts:154-157` |
| C-10 | data-changed | supplier changes an answer, row, justification, document or metadata answer after completeness | assignees of the tracks whose department leads or co-reviews the section, plus RMM's track; mails of one burst (same case, author, recipients, unread, within 30 min) merge | internal / task-notification | `actions.ts:441-445,355`, `mail.ts:14-15,49-64,231-242,271-275` |
| C-10a | data-changed ("<section> added to your review") | a metadata change adds a section to an already open department track | that track's assignee | internal / task-notification | `actions.ts:341-374` |
| C-11 | release-requested | the last track completes | case contacts, exactly once per request | supplier / task-notification | `actions.ts:1021-1025`, `mail.ts:158-161` |
| C-12 | release-withdrawn | a reopen or late activation sends a final-release case back to review | case contacts | supplier / task-notification | `actions.ts:634,1045`, `mail.ts:162-165` |
| C-13 | release-receipt | final release given | case contacts | supplier / task-notification | `actions.ts:1080`, `mail.ts:166-171` |
| C-14 | final-document | case completed | the RMM owner; link to the Final document tab | internal / final-document | `actions.ts:1081-1086` |
| C-15 | cancelled | RMM cancels | case contacts (supplier text) and the assignees of unfinished tracks except the canceller | both / task-notification | `actions.ts:1136-1137`, `mail.ts:172-175` |
| C-16 | reactivated | RMM reactivates | case contacts and assignees of unfinished tracks except the actor | both / task-notification | `actions.ts:1158-1159`, `mail.ts:176-179` |
| C-17 | change-reported | supplier reports a change after the release | the RMM owner | internal / task-notification | `actions.ts:1174` |
| C-18 | reminder | rem-1: fill-in task N days after the invitation and when overdue; rem-2: each open point N days after it went to the supplier (per round) and when overdue; rem-5: final release N days after the request; rem-3: idle review task (no activity of the assignee for N days) | rem-1/2/5: case contacts; rem-3: the track assignee | supplier or internal / task-notification | `reminders.ts:34-76` |
| C-19 | escalation | the escalation days of rem-1/2/3/5 have passed | rem-1, rem-5: RMM owner; rem-2: the point's raiser + RMM owner; rem-3: RMM owner, or the Business owner for RMM's own track | internal / task-notification | `reminders.ts:40-41,52-53,65-66,74-75` |
| C-20 | note-mention | an internal note mentions someone | each mentioned active internal user once, never the writer, never a supplier; quotes the note; link opens the note in the review workspace (if the person's department reviews the case) or in the case's Internal notes tab | internal / task-notification | `mail.ts:244-269`, `mentions.ts:68-72,95-103`, `MANUAL-CHECKLIST.md:97` |

**C-21 Reminder idempotency.** Each reminder/escalation has a key per case/phase start, per point round or per track activity, so a run never sends the same mail twice. (`reminders.ts:1-3,38-75`)

**C-22 Mail templates** are shown statically on the Reminders page. (`FINAL-APP-SPEC.md:186`)

---

## D. Permissions per role

**D-01 Capability matrix** (domain guard `check`; a screen that shows a control the user may not use still cannot change anything). (`permissions.ts:1-18,25-180`)

| Capability | RMM | REG, SAF, QM, MIC, SUS | CUS, LEG | Admin | Auditor | Owner | Supplier contact |
|---|---|---|---|---|---|---|---|
| Read cases and case page | all | all | all (land on K7/K8) | all (no menu entry) | all | all | only cases it is named on, while active |
| Read the final document | yes | yes | yes | yes | yes | yes | never |
| Create, cancel, reactivate a case | yes | – | – | – | – | – | – |
| Suppliers: look up | yes, read-only | – | – | yes | – | – | – |
| Suppliers: add, edit, (de)activate, contacts | – | – | – | **only** | – | – | – |
| Configuration: rules, questionnaire, section owners, reminders, run reminders | – | – | – | **only** | Rules (versions, history) read-only | – | – |
| Fill in CIQ, metadata, rows, justify, upload | – | – | – | – | – | – | named + active, open phase |
| Confirm completeness, give final release | – | – | – | – | – | – | named + active + mayConfirm |
| Report a change | – | – | – | – | – | – | named + active, completed case |
| Answer an open point | – | – | – | – | – | – | named + active, point open |
| Raise an open point | own RMM track, any section | own dept track | – | – | – | – | – |
| Accept / return / edit / close an open point | raiser only | raiser only | – | – | – | – | – |
| Complete, reopen, reassign a review | RMM track | own dept track | – | – | – | – | – |
| RMES results, findings, decision | – | SAF / REG own | – | – | – | – | – |
| Add a missing section | – | yes (own open track) | – | – | – | – | – |
| Post internal notes (@mentions) | yes | yes | yes | – (read) | – (read) | – (read) | never |

Sources: `permissions.ts:112-174`, `FINAL-APP-SPEC.md:144,213-216,357-359`, `DEMO-GUIDE.md:94`.

**D-02 Supplier isolation.** A contact sees only the cases it is named on (not every case of its supplier), and never internal routes, notes, RMES, findings, decisions, rule ids, other suppliers, the final document or internal reasons. A deactivated contact sees nothing and can do nothing. Contacts of a second supplier see nothing of Solvaro. (`FINAL-APP-SPEC.md:214`, `selectors.ts:407-421`, `permissions.ts:80-84,97-102`, `DEMO-GUIDE.md:112`)

**D-03 Beiersdorf never changes answers;** only supplier contacts write the questionnaire. (`permissions.ts:98`, `FINAL-APP-SPEC.md:39`)

**D-04 RMM never adds sections;** it asks the supplier or the department instead. (`permissions.ts:167-168`, `FINAL-APP-SPEC.md:39`)

**D-05 Raiser-only open points (AS-08).** Only the person who raised a point accepts, returns, edits or closes it; for a system-raised point the responsible person acts as raiser. (`permissions.ts:77-78,152-160`, `client-call.md:101-105`)

**D-06 Track actions only by members of the track's department;** the track must exist on the case. (`permissions.ts:103-110`)

**D-07 Customs and Legal:** read-only, may post internal notes; no review task. (`FINAL-APP-SPEC.md:215`, `catalog.ts:721-740`)

**D-08 Admin, Business owner, Auditor:** read cases only; the Admin alone maintains the supplier master and the configuration; RMM looks suppliers up read-only ("Maintained by the business administrator."), every other role gets NoAccess on Suppliers. (`FINAL-APP-SPEC.md:144,216`, `OVERNIGHT-LOG.md:72`)

**D-09 Route access follows the menu;** Cases and the case page are open to every internal role; the Admin area is Admin (edit) and Auditor (read-only). (`Gates.tsx:9-27`)

**D-10 Supplier-facing wording.** No field-matrix ids, no SF codes in requested-document reasons, no rule ids, no "Pre-filled by RMM"; internal close reasons and "not accepted" notes stay internal. (`OVERNIGHT-LOG.md:59,78`, `requestedDocs.ts:138-139`, `types.ts:265-268,313-314`)

**D-11 Mentions** list only active Beiersdorf users. (`mentions.ts:11-12`, `MANUAL-CHECKLIST.md:97`)

---

## E. Screens per role (custom UIs)

### E.1 Navigation (both UIs)

**E-01 Menus and landing pages.** (`FINAL-APP-SPEC.md:101-111`, `catalog.ts:681-775`, `App.tsx:64-90`, `DEMO-GUIDE.md:116-126`)

| Role | Landing | Menu |
|---|---|---|
| RMM | Dashboard | Dashboard · My reviews · Cases · Suppliers (read-only) |
| REG, SAF, QM, MIC, SUS | My reviews | My reviews · Cases |
| Customs, Legal | Cases | Cases (read-only; case opens on K7 / K8) |
| Business administrator | Rules | Rules · Questionnaire · Section owners · Reminders · Suppliers |
| Auditor | Audit trail | Audit trail · Cases · Rules (read-only) |
| Business owner | Reports | Reports · Cases |
| Supplier contact (portal) | My requests | My requests · Help |

**E-02 Global rules.** Every list, dashboard and tile has a designed empty state; metrics without data show "—" (never 0 %, NaN, "0 d"); dates "9 Oct 2026" (with time "9 Oct 2026, 14:05"); plain English, no "prototype", "review version", "assumption" or AS-xx. (`FINAL-APP-SPEC.md:18-21,218-223`, `selectors.ts:310-326`)

### E.2 Internal Workbench (app `CIQ_Digital_A00`)

**E-03 RMM Dashboard.** Zero cases: start card with [New case] and [Suppliers (n)]. Live: 4 tiles My open cases · With supplier · With Beiersdorf · Overdue open points; "Needs your action": My review · Department rejected · Release pending · Overdue at supplier · Origin without rules · No activity; My cases; Bottlenecks by review (only while in review); Recent activity. Lead time and first-time-right only on Reports. (`FINAL-APP-SPEC.md:126-134`)

**E-04 Cases list (all internal roles).** Tabs Open · Part 1 · Part 2 · Completed · Cancelled with counts; search by material, INCI, material no., supplier, DUNS; filters; read-only except RMM's actions; "New case" button for RMM. (`FINAL-APP-SPEC.md:136-139`, `MANUAL-CHECKLIST.md:99`)

**E-05 New case (RMM).** Trade name, main INCI, material no., supplier picker (active suppliers and their active contacts; search over suppliers, contacts and city; a contact filter above 3 contacts), 1–2 case contacts, owner, target markets, due date, priority; shows the questionnaire version ("CIQ-2026 v3"); duplicate warning with reason; empty submit lists every missing item; no "Add a supplier": "Ask the business administrator to add it in Suppliers." with a link to the read-only Suppliers pages. (`FINAL-APP-SPEC.md:141`, `OVERNIGHT-LOG.md:78`, `DEMO-GUIDE.md:25,93`, `MANUAL-CHECKLIST.md:14,102`)

**E-06 Case page header and tabs.** Header: material, IDs, supplier, phase, waiting on, due. Tabs: Overview (facts, tracks, confirmations, scope summary, change reports with "Start a new case") · Questionnaire · Open points · Documents · Internal notes · History · Final document (only once completed). RMM actions: Open my review · Cancel (justification) · Reactivate (justification, within 12 months). Reviewers: Open review. No "Edit case contacts". (`FINAL-APP-SPEC.md:159-170`, `OVERNIGHT-LOG.md:63`, `MANUAL-CHECKLIST.md:95,98`)

**E-07 Case Questionnaire tab.** Summary bar "n of m sections with questions complete" with filters and counts (Missing items, With open points, Changed after completeness, Not applicable); navigator (section picker on narrow screens) with Previous / Next and browser Back; per section "why in scope" and each answer with who and when; Not applicable folded with reasons, K5.1 waiver visible; requested-document rows read-only with status and the rule. (`FINAL-APP-SPEC.md:163,400`, `DEMO-GUIDE.md:54`, `MANUAL-CHECKLIST.md:96`)

**E-08 Open points and Documents tabs.** All points of the case with thread, rounds and status; documents by file name, section, question, uploader and date. (`FINAL-APP-SPEC.md:164-165`)

**E-09 Internal notes tab** with the @mention composer (suggestions of active Beiersdorf colleagues, ↑/↓, Enter, Escape); a mention shows as a chip, "Mentions you", "E-mailed …"; suppliers see nothing. (`MANUAL-CHECKLIST.md:97`, `DEMO-GUIDE.md:55`)

**E-10 History tab.** The audit events plus the "who assessed what" summary (Reconstruct merged in); no "E-mails sent" view. (`FINAL-APP-SPEC.md:167`, `OVERNIGHT-LOG.md:80`)

**E-11 Final document tab.** On-screen document (A-20) with "Document seal: unchanged" badge, seal code and footer; opened from the final-document mail. (`FINAL-APP-SPEC.md:75`, `OVERNIGHT-LOG.md:81`, `DEMO-GUIDE.md:62-64`)

**E-12 Customs / Legal case view.** Opens on the K7 or K8 card: what it covers, documents, questions, note box; read-only. (`FINAL-APP-SPEC.md:107`, `OVERNIGHT-LOG.md:60`, `MANUAL-CHECKLIST.md:36-37`)

**E-13 My reviews (RMM and departments).** To review · Waiting for supplier · Completed with counts and one inline alert. (`FINAL-APP-SPEC.md:172,264`, `selectors.ts:423-431`)

**E-14 Review workspace.** Header: case, phase, my track, Reassign within the department. Section nav with "changed since your review" markers; section content with Ask on a field, row or document (RMM: any section, whole CIQ); "Add missing section" for departments; RMES tab (SAF/REG: criteria with results and comments, limit checks, AI suggestion to confirm or discard, findings, decision Approved/Rejected + reason); right rail: My open points (accept, return, edit, close for the raiser) and Internal notes; completion bar with the listed blockers, the SAF/REG decision and RMM's rejection choice; RMM sees the origin-without-rules flag and evidence chips incl. requested-document status. (`FINAL-APP-SPEC.md:174-180,400`, `MANUAL-CHECKLIST.md:39-56`, `types.ts:339`)

**E-15 Suppliers list and detail.** List: Supplier · DUNS · Country · Type · Contacts · Open cases · Status. Detail: company, contacts table (name, title, e-mail, may confirm, active), their cases, history. Admin: add/edit supplier and contacts, deactivate/reactivate (with replacement dialog); RMM read-only with "Maintained by the business administrator." (`FINAL-APP-SPEC.md:143-157`, `suppliers.ts:134-148`)

**E-16 Admin: Rules.** Draft bar ("Published: RS-2026.2 + v2 · used for new cases" + [Create new version]; with a draft "Draft · Rules RS-2026.3 (3 changes) · questionnaire stays v2" + [Check & publish] [Discard draft]); version history (pair, kind, date, who, change note, cases using it; selecting a release shows its rule set); grouped rule list with "New in draft"/"Changed in draft" marks, [Add rule], Edit/Delete, "Changes in draft" summary; Test rules (simulator + regression on reference materials, never on cases). (`FINAL-APP-SPEC.md:183,326-338`, `DEMO-GUIDE.md:80-91`)

**E-17 Rule form (sentence).** When [question] [is Yes / is No / includes any of / any value except] → then [sections, searchable] become [Mandatory / Optional / Not applicable] · ask for evidence (15 known documents as chips + "Not in the list?") · reviewed by [departments] · basis · note; live preview sentence; information line for uncollected evidence; lead department pre-ticked when opened from a section hint. (`FINAL-APP-SPEC.md:331-338`, `conditions.ts:251-270`, `rules.ts:160-176`, `DEMO-GUIDE.md:90`)

**E-18 Admin: Questionnaire.** Versions ("Used for new cases with rules RS-2026.3"); catalogue with [Add section], Edit / Retire / Restore; section form (code with inline duplicate check and Save disabled, title, kind, meaning, lead, co-reviewers, Documents only / Questions); field list (add, edit, up/down, remove); field form (label, type, Mandatory/Optional, options, unit or "no unit", help, owner) with supplier-view preview; hint "A new section needs a rule that switches it on" + [Create the rule]; a started form stays open on outside click, Cancel/Escape closes. (`FINAL-APP-SPEC.md:184,340-346`, `DEMO-GUIDE.md:83-89`)

**E-19 Check & publish.** "What will be published" in plain words; the 8-check list (green/red, each with a link to fix); warnings and information; change summary (rules, sections, questions added/changed/removed/retired); "Test the draft" (regression before/after); number of running cases keeping the old version; change note (required); [Publish]. (`FINAL-APP-SPEC.md:348-355`, `DEMO-GUIDE.md:92`)

**E-20 Admin: Section owners** (lead and co-reviewers per section). (`FINAL-APP-SPEC.md:185`, `actions.ts:1213-1228`)

**E-21 Admin: Reminders.** Settings per reminder, static mail templates, "Run reminders now" (prototype, see F-05). (`FINAL-APP-SPEC.md:186`)

**E-22 Reports (Business owner).** Pipeline now · Lead time · Intake and workload (RMM included) · Clarifications and supplier performance; CSV export; empty states. KPIs: open, with supplier, with Beiersdorf, overdue cases, overdue points, average lead time, completed, first-time-right, average rounds; pipeline per phase; workload per track; lead time by phase; cases by origin; monthly flow; supplier performance; query hotspots per section. (`FINAL-APP-SPEC.md:189-191`, `metrics.ts:47-179`, `MANUAL-CHECKLIST.md:109`)

**E-23 Audit trail (Auditor).** Event log with filters; a case ID opens the case History tab. (`FINAL-APP-SPEC.md:193`)

**E-24 Inbox** (envelope in the top bar of every shell, unread count, list + reading pane, deep links, mark read). In Kissflow: see F-04. (`FINAL-APP-SPEC.md:99`)

### E.3 Supplier portal UI (portal `CIQ_Supplier_Portal_A00`)

**E-25 My requests.** Zero: "No requests yet" with a link to Help. Live: task rows (fill in the CIQ with % done; each question with an Answer drawer; give the final release), then requests grouped needs action · with Beiersdorf · closed. "Welcome back" only for a returning contact. Tasks are merged in (no separate Tasks page). (`FINAL-APP-SPEC.md:195-197,111`, `OVERNIGHT-LOG.md:59`)

**E-26 Request page.** Header and 3-step stepper Questionnaire · Beiersdorf review · Final release. (`FINAL-APP-SPEC.md:199-205`)
- supplier-input: completeness bar and modal (blockers named; declaration + checkbox); navigator with GEN and the metadata questions first; live sections with "New" and "Closed" notes; undefined-origin note;
- review: banner, "Questions for you", the questionnaire still editable;
- final-release: release card, disabled with reasons when blocked; note that edits go back to Beiersdorf; questions; questionnaire;
- completed: release banner, the supplier's own confirmations, question history read-only, frozen questionnaire, "Report a change";
- cancelled: neutral banner, questionnaire read-only;
- never "Read-only" over an editable questionnaire.

**E-27 Supplier questionnaire details.** GEN locked fields (set by Beiersdorf); metadata questions in plain words; K2.1 component table; "Documents only · optional" chapters with an upload; SF-12 = No waiver box right under the question; above-limit note with "Write the justification" that focuses the box; attribution per answer; "Requested documents" block at the end of a section (name, why in plain words, uploader, files with who/when, "Cannot provide? Add a justification", "Added after your completeness confirmation"). (`MANUAL-CHECKLIST.md:17-26`, `OVERNIGHT-LOG.md:59,78`, `FINAL-APP-SPEC.md:399`)

**E-28 Answer drawer.** Answer, document (stored at the question, only referenced from the reply), or cannot provide; badges "Changed by Beiersdorf" and "Closed, no answer needed". (`FINAL-APP-SPEC.md:207-209`)

**E-29 Help.** How it works (the new flow), FAQs (including which e-mails come), the Beiersdorf contacts; no video. (`FINAL-APP-SPEC.md:211`)

---

## F. Prototype-only items and their real replacement

| # | Prototype item | Real app |
|---|---|---|
| F-01 | Demo menu "View as" (people by role and supplier, task and unread counts), personas `sup:<userId>` (`FINAL-APP-SPEC.md:117-122`) | Real sign-in: internal users as app users with roles; each supplier contact as a portal user with the one `Supplier` role (Thomas manages portal users) |
| F-02 | "Show prototype notes" toggle, DemoNotes (`FINAL-APP-SPEC.md:19,119`) | Dropped |
| F-03 | "Reset to empty start", localStorage store, `SCHEMA` (`FINAL-APP-SPEC.md:11-12,120`, `seed.ts:12-14,104-108`) | Dev sandbox data; masters (users, Solvaro + contacts, configuration, reminders, owners) seeded by import; published flows cannot be deleted, so no reset |
| F-04 | Simulated inbox: `AppState.mails`, envelope drawer, `readBy`, unread count (`FINAL-APP-SPEC.md:82-99`) | Real e-mail: the generic webhook integration for open-point events (R-1) and Kissflow/portal task notifications for the rest; links become Kissflow item and portal URLs; read state is the mail client's |
| F-05 | "Run reminders now" with "+days" (`FINAL-APP-SPEC.md:80`, `reminders.ts:1-3`, `MANUAL-CHECKLIST.md:115`) | A scheduled job (daily integration or Kissflow step SLA reminders and escalations) using the same settings and idempotency keys |
| F-06 | Final document built in the browser, cyrb53 "seal", on screen only (`finalDocument.ts:19-31`, `FINAL-APP-SPEC.md:75`) | AS-12: the release hits a webhook; an external script (Google Apps Script or AWS Lambda) builds the PDF with the same content and attaches it to the case; seal = a hash of the PDF stored on the case (`client-call.md:106-110`) |
| F-07 | Uploads are file names with a size (`actions.ts:502-536`) | Real attachment fields (several files per question / slot) |
| F-08 | One person per role; assignee = the role's persona (`actions.ts:130-137`, `FINAL-APP-SPEC.md:262`) | Department groups; a track is assigned to a member of the department (default holder), reassignable |
| F-09 | Toast refusals and success toasts (`core.ts:13-27`) | Kissflow validation / custom-UI messages; the same guard texts |
| F-10 | Clock clamped to 6 Oct 2026 for seeded history (`selectors.ts:23-28`) | Server time |
| F-11 | Live portal legacy branch (`metadata`, `scope-check`, cases without `liveScope`), portal demo preview `DemoSupplierStore` (`FINAL-APP-SPEC.md:13,16`, `types.ts:217-222`) | Not built: the final app has only live-scope cases |
| F-12 | RMES criteria template and AI suggestion are fixed texts (`actions.ts:538-568`) | BDF's real RMES template when shared (G-07); AI suggestion is a later feature |
| F-13 | Client page `/understanding/call` (`FINAL-APP-SPEC.md:114`) | Not part of the app |
| F-14 | Store-synced registry and caches of versions (`catalog.ts:356-375,631-675`, `rules.ts:91-99`) | Configuration read from Kissflow datasets/forms at runtime |
| F-15 | Data-changed mail burst merging in memory (`mail.ts:14-15,49-64`) | Merge in the webhook (debounce) or accept one mail per change |
| F-16 | Test rules on built-in reference materials, run in the browser (`referenceMaterials.ts:1-3`) | Same engine in the custom UI; reference materials as a dataset |
| F-17 | Reports computed in the browser, CSV export (`metrics.ts`) | Custom UI over Kissflow data, or Kissflow reports with export |
| F-18 | "Publish v2" shortcut (`actions.ts:1200-1211`) | Same as publishing the prepared draft |
| F-19 | `updateCaseContacts` still exists in the domain (`actions.ts:257-283`) | Not offered: no "Edit case contacts" (`FINAL-APP-SPEC.md:169`) |

---

## G. Differences and open points to settle in the plan

**G-01 Final document format.** The spec says on-screen only, no download (`FINAL-APP-SPEC.md:75`); AS-12 says an attached PDF made by an external script (`client-call.md:106-110`). The Kissflow build follows AS-12, and the case shows it.

**G-02 Mail event list.** Spec §2 lists 20 events without `note-mention` (`FINAL-APP-SPEC.md:85-89`); the domain has 21 (`types.ts:587-607`). Build all 21.

**G-03 Blocking flag on findings** still exists (`types.ts:347`) but every open finding blocks (`DEMO-GUIDE.md:138`, `selectors.ts:209-210`). Drop the flag or ignore it.

**G-04 Section owners are not versioned:** a changed lead applies to running cases (`OVERNIGHT-LOG.md:74`). Still open with Thomas.

**G-05 Basis labels and default** ("Agreed with Beiersdorf" / "Not in the requirements") need Thomas's confirmation (`OVERNIGHT-LOG.md:74`).

**G-06 The undefined-origin list** (waste, CCU, chemical recycling) is fixed in code, not configurable (`rules.ts:185-186`, `OVERNIGHT-LOG.md:74`).

**G-07 New fields FLD-K1-004…010 and the Requested documents child table** must go into `docs/kissflow-data-model/kissflow-data-model-plan.md` first, then to the app session (`DEMO-GUIDE.md:144-147`).

**G-08 Admin, Owner and Auditor read cases** although Cases is not in the Admin menu (`FINAL-APP-SPEC.md:108,216`, `Gates.tsx:21-26`).

**G-09 Multiple decision rejections.** RMM's "continue" note covers the departments rejected at that time; a later rejection by the other department needs a new choice (`selectors.ts:368-375`, `actions.ts:1011`).

---

## H. The 10 requirements most likely to be hard in Kissflow

1. **Live, rule-driven scope in the portal** (B-06…B-08, B-28): every metadata answer re-evaluates rules held as data and opens or closes sections live, keeping answers; after completeness the scope only grows and triggers tracks, open points and slots. Kissflow forms cannot show or hide sections from a rule table; this needs the custom UI plus a server-side scope write on each answer.
2. **Questionnaire and rules as versioned data with an admin editor** (A-24…A-28, B-42…B-50): admin-added sections and fields, per-version field resolution, one-sided version numbers, the 8-check validation and the code-duplicate key. Kissflow form schemas are fixed, so answers must be stored generically (e.g. a key/value child table) and rendered by the custom UI; otherwise every edit means a form change and republish by IT.
3. **A dynamic set of parallel review tracks** (B-10, B-24…B-27): RMM plus only the lead departments concerned, activated or reopened late, one release request when all complete, withdrawn on reopen. Kissflow process parallel branches are fixed at design time.
4. **Portal↔app twin sync of everything** (A-01, CLAUDE.md twin rule, `client-call.md:104`): answers, rows, documents, requested documents, open-point threads and edits, confirmations, both directions and supplier-safe.
5. **The open-point lifecycle** (B-13…B-19): raiser-only accept/return/edit/close, rounds and new-round rules, edit history visible to the supplier, track status auto waiting-supplier, blocking the raiser's track.
6. **Mail per event through one generic webhook** (C-00…C-22): computed recipients (raiser + responsible, tracks using the section, informed teams, mentions), supplier whitelisting, burst merging, idempotent reminders and escalations.
7. **Final document at release** (A-20, B-34, F-06): webhook → external script → PDF with every thread round by round, exclusions of RMES and notes, attached, immutable, sealed.
8. **Per-contact supplier isolation and the supplier master** (A-21, A-22, B-38…B-41, D-02): a contact sees only cases it is named on (not its whole supplier's), `mayConfirm`, deactivation with replacement on open cases, admin-only maintenance.
9. **Lifecycle reversals** (B-25, B-27, B-31, B-32): cancel in any phase with every task and point withdrawn, reactivate within 12 months back to the earlier phase, final-release back to review. Kissflow processes do not step back to arbitrary earlier steps.
10. **Per-answer attribution, freeze and change tracking** (A-05, B-30, B-35): who/when on every field, "changed since your review" per track, data-changed mails, refused-and-logged attempts after the release. Kissflow tracks item-level changes, not per-field attribution the UI can query.

Close behind: the Requested documents child table written by the scope logic (A-08), RMES criteria that follow the scope with limit checks (B-23), and the reports metrics (E-22).
