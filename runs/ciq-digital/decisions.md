# Decisions: run `ciq-digital`

## Stage 1: author-brief (2026-10-07, kf-ba)

### Sources ingested
- `runs/current/brd.md` (1,033 lines), read in full:
  - **Part A** (L9–86) is `kissflow-build/ciq-digital/START-HERE.md`, verbatim. It holds the v2 overrides (BRM v2, 6 Oct) and the exact naming contract with the portal.
  - **Part B** (L90–1033) is `docs/kissflow-data-model/kissflow-data-model-plan.md`, verbatim. It holds the flow inventory, field specs, lists, workflows, roles, grants and traps.
- `context/00-glossary.md` L13 was used only to expand "RMM" (Raw Material Management) in the persona description.

### Precedence
Part A overrides Part B wherever they differ. Every difference is logged below and in the `overrides_applied` section of the domain slice.

### Scope
- **In scope:** the internal app CIQ Digital (`CIQ_Digital_A00`), Development sandbox only.
  - 28 flows: A1–A30 minus A12 and A13. That is 25 Forms plus 3 Processes: `CIQ Case`, `CIQ Review Track` and `CIQ Config Release`.
  - 33 `CIQ` lists.
  - 18 custom roles plus the default Admin and User.
  - The §7.2 grant matrix.
  - No UI: no custom React UI, no native pages, cards or nav.
- **Out of scope:**
  - The supplier portal: `CIQP *` flows, the 5 portal lists and the 11 portal roles.
  - Integrations I-1, I-3 and I-6, which the portal session builds over REST.
  - Spikes, effort and build-order planning.
  - User invitations; Thomas manages people.
- The portal is modelled only as an external system. The app reaches it through `CIQ Case.Portal_Request_Item_Id`, and the portal holds `App_Case_Item_Id`.

### Overrides applied (Part A over Part B)

| # | Override | Effect in the domain |
|---|---|---|
| v2-1 | No review version | A12 and A13 dropped. Supplier edits until PS-11. A changed value replaces the old one. Every change is traced in A27. BDF never edits answers. |
| v2-2 | Scope only grows | A11 records additions only. A manual extension needs a mandatory justification and is audited. |
| v2-3 | Documents are additive | A15 has one row per file, identified by `File_Name`, `Uploaded_At` and `Uploaded_By`. No `Doc_Version`. References use file name + upload date. Suppliers can't delete. |
| v2-4 | Internal chat | A24 holds one chronological message per row: `Case_Code`, optional `Linked_Kind` / `Linked_Key`, `Note_Text`, author and time. Never visible to suppliers. |
| v2-5 | Lead-only ownership | Only the lead department is activated. The `co` list stays in the ownership payload, read-only. |
| v2-6 | RMES | A18 is created with `Case_Code` + a timestamp. `Review_Version_Key` is removed. Sources point to a question, or to a document by file name + upload date. |
| v2-7 | Config export | Every published A6 row keeps `Payload_JSON`. Export is a UI feature; there is no model change. |
| v2-8 | Audit | A27 records the data value and the document name + upload date behind each assessment, in `Source_Refs_JSON`. |
| contract-1 | `Release_Path` | Text "Yes"/"No", not the plan's §4.4 formula. |
| contract-2 | `Overall_Approval_Required` | Text "Yes"/"No", not a Select on `CIQ Yes No`. |
| contract-3 | `Completeness_Confirm` | Added to `CIQ Case` as Text; it was absent from plan §4.4. |

### Knock-on changes made explicitly in the domain
All of these are also logged in `open-questions.md`.
- `Review_Version_Key` removed from A18.
- The intake target list is now A11, A14, A15, A18, A25, A27 and A30.
- The grant row "A11–A15" now covers A11, A14 and A15.
- `Doc_Version` was removed from A15. `File_Name` was added, and `Uploaded_By` replaces `Uploaded_By_Email`.
- The fields `*_Doc_Version` on A17, A19, A20 and A23 are replaced by the document's file name + upload date. The new field names are still proposals.
- `Note_Dept` was dropped from A24.
- These stay, but are flagged:
  - A14 `Rev_No` / `Supersedes_Key`;
  - A15 `Supersedes_Key`;
  - A19/A20 `Source_Section_Rev`;
  - A27 `Object_Version`;
  - A11 "Revert" and `Diff_JSON.removed`;
  - the key formats that contain "v1".

### Counts (domain slice)
- **Personas: 20.** The 18 custom roles, the default Admin, and the external Supplier Contact, who has no app access. The default User role, which has no grants, is a rule rather than a persona.
- **Journeys: 21.** One of them (j21, the supplier's portal work) is external and listed only because it triggers app journeys.
- **Entities: 28.** 25 Forms and 3 Processes.
- **Business rules: 116.** These cover conventions, process and gate rules, the v2 overrides, the 18 grant-matrix rows with their footnotes, and the app-relevant traps T1, T2/T14, T4/T5, T6, T7/T8, T11, T13 and T15.
- **Value sets: 33.**
- **Other sections:** the naming contract (CIQ Case, CIQ Review Track and CIQ Config Release steps; the 15 contract fields), 4 external systems, and 5 integrations described but not authored here.

### Graph
- The `domain` slice was committed at **revision 2** (base revision 1). The graph's validation returned ok with no issues.
- Read back with `ir-graph-cli slice domain`: identical to the payload.
- Private payload: `runs/current/ba/domain.json`. Commit receipt: `runs/current/ba/domain-commit-receipt.json`.
- A scratch snapshot validated with only `NO_APP_NAME`. That is expected, because the `app` slice belongs to kf-architect.

### Run stage
`brief`, unchanged (`runs status`).

### Next
kf-architect lowers the domain into the skeleton App-Spec. The open questions in `open-questions.md` carry defaults, so the pipeline can continue. Thomas should review sections A, C and E before `author-generate`.

## Stage 2: author-plan, wave 1 (2026-10-07, kf-architect)

The `architecture` slice is committed at graph **revision 3** (base revision 2). The numbering below belongs to this run; it is separate from the plan's own decision table (brd §2, D1–D20).

## D1 · Flow map and ids — 28 flows exactly as plan §3.2 minus A12/A13 (25 Forms, 3 Processes); ids reserved as `<name with underscores>_A00`
**Why:** brd L41 drops A12/A13. L223–L258 fix the names and types: A8, A9 and A16 are Processes; no Boards, Datasets or Decision Tables; no child tables in the app. L209 says Kissflow derives ids from the name, so the reserved ids are expectations, read back after creation (L85).
**Alternatives:** opaque IR slugs for flow ids. Rejected because the portal session and BUILD-LOG need Kissflow-style ids.
**Status:** `proposed`

## D2 · Roles — 18 custom roles, reuse Admin/User; one role per persona; Case Sync and Case Admin are overlay roles; the supplier gets no app role
**Why:**
- brd L66–L75 and L622 define the roles.
- Case Sync holds all reviewers, both approvers and RMM, so whoever finishes the last track runs G5 (L622).
- Case Admin holds RMM leads, with flow Admin on A9/A16 only (L657).
- Process Owner is read-only like Auditor (open question 52 default).
- Integration Service keeps its §7.2 grants (open question 55 default).
- The supplier has zero app grants (L119, BR-083).
- No members are added (L75).
**Alternatives:** fold Case Sync into RMM. Rejected because L564 names Case Sync as the step owner; RMM is only the K-20b/K-11 fallback.
**Status:** `proposed`

## D3 · A5 reference field — keep the plan name `Contact` (→ CIQ Supplier Contact)
**Why:** This is the open question 43 default. `Contact` is not on the forbidden list (L63), and A5 is not part of the portal contract.
**Alternatives:** `Case_Contact_Ref`, owner-prefixed per the L264 convention. A5 is a Form, so a later rename over REST stays possible.
**Status:** `proposed`

## D4 · Process step skeleton — CIQ Review Track gets an unconditioned Start "Create track"; every Process ends with an explicit End
**Why:**
- The contract (L61) lists only the conditional review and decision steps.
- The engine needs the first step to be a creator-owned StartEvent whose role holds the initiator grant, and the first and last steps cannot carry a condition.
- RMM, the five reviewer roles and Integration Service hold I on A16 (L643).
- An explicit End keeps "Overall approval" and "Final decision – Regulatory" as conditional middle steps (L537, "explicit terminal End").
- The Start step's name is not part of the portal contract.
**Alternatives:**
- Name it "Start", as A8 does.
- Make "Review – Regulatory" the first step. Rejected: the first step cannot be conditional.
**Status:** `proposed`

## D5 · Optional native gate fields omitted — no Open_Tracks/Sync_Gate (A9), Open_Blockers/Gate (A16), Twin_Track/Open_Num (A17)
**Why:** Open questions 25–26 default to omitting them. As a result:
- The ER map has no A17 → A16 Reference; Track_Key stays Text.
- A9 has no cross-flow aggregate.
- The build order has no graft pass after A16.
- Trap T13 stays a stated residual risk; the UI gate is the primary control (L201, L693).
**Alternatives:** include them now. A published Process cannot gain fields later (L35), but K-20/K-20b are unproven spikes.
**Status:** `proposed`

## D6 · Cross-flow links — exactly 10 native References; everything else is a Text key; Case_Code added on A23 and A29
**Why:**
- Pinned keys must never be re-pointed (L352, BR-011), and no reference may cross containers (L164).
- The 10 References are A1→A1, A2/A3/A4→A1, A5→A2, A9→A1/A3/A4, A16→A9 and A18→A9.
- The 43 Text-key links are listed in `architecture.text_key_links`, so the data architect does not add References.
- A23 and A29 get a `Case_Code` Text key (open questions 51 and 46 defaults).
- A18 has no Review_Version_Key (open question 3 default).
**Alternatives:** References for RMES_Key and Result_Key. Rejected because of the re-pointing risk and the plan's key design.
**Status:** `proposed`

## D7 · Lists — exactly the 33 §5 app lists; CIQ Country Code seeded with 32 ISO codes; no list for A24 Linked_Kind
**Why:**
- brd L485–L531 defines the lists.
- I read the open question 31 default ("seed EU/UK/TR/CN/US/CA countries") as ISO 3166-1 alpha-2 codes: the 27 EU member states, GB (the ISO code for the UK), TR, CN, US and CA.
- Lists are append-only, so more codes can be added later.
- A24 Linked_Kind stays Text written by the UI (open question 32 default), so the count stays at 33.
**Alternatives:**
- The full ISO list (about 250 codes).
- A 34th list, `CIQ Linked Kind`.
**Status:** `proposed`

## D8 · Case_Code with no UI tonight — RMM types it at Start "Create case"
**Why:** This is the open question 28 default. L342 calls for an app-generated code with a collision check, which needs the Workbench. SequenceNumber is excluded (L258, K-22).
**Alternatives:** SequenceNumber, which plan L258 rejects.
**Status:** `proposed`

## D9 · I-2 and I-4 not authored tonight — the intake session creates only the activated tracks; CIQ Final Document has no automatic writer tonight
**Why:**
- This is the open question 54 default.
- Part A (L22) gives I-1, I-3 and I-6 to the portal session and asks this run for data, lists, roles, workflows and permissions.
- Journey j04 uses the K-10 fallback (L589).
- In j11, A29 waits for I-4 or a renderer later.
**Alternatives:** author I-2 and I-4 now as inactive drafts. Integrations cannot be deleted over the API (L771).
**Status:** `proposed`
**Superseded in part by D23:** I-2 and I-4 are modelled in the IR but held out of the build.

## D10 · No UI — pages = [], no nav, no cards; build without baseline pages and delete any auto-added page before the grant pass
**Why:** brd L36, L74 and L657, and traps T2/T14 (L682, L694). A page auto-grant would turn readers of A19–A22 into editors and break REQ-CFG-004. The experience stage must emit `pages: []`.
**Alternatives:** none acceptable tonight.
**Status:** `proposed`

## Stage 2: author-plan, wave 2 (2026-10-07, kf-workflow-designer)

The `workflow` slice is committed at graph **revision 8** (first commit at revision 4, then rebased over the data architect's commits). Step names, order, owners and conditions are exactly those in `architecture.id_reservations.step_prefix_by_flow` (HR02), with the en-dash U+2013 checked byte by byte.

## D11 · Track Start "Create track" — the step owner is CIQ RMM, and seven roles may initiate
**Why:**
- The engine needs one owner role on the start step (decision D4).
- Tonight the intake session creates tracks, because I-2 is not authored (D9). Intake runs in an RMM, Safety or Regulatory session (brd L657); RMM is the owner of the case.
- The initiators are the roles that hold **I** on A16 (brd L643): CIQ RMM, the five reviewer roles (for late activation and reopen, L601) and CIQ Integration Service (for I-2 later). They are listed in `initiator_roles` for kf-security-designer, who must grant `initiator: true` to each.
**Alternatives:** CIQ Integration Service as owner. Rejected because I-2 does not exist tonight.
**Status:** `proposed`

## D12 · Send-back, Reject and e-mail switches per step — specified but not compiled; set by hand after generate
**Why:**
- The engine's process capability covers ordered, conditional, role-owned steps and per-step field permissions only. It has no per-step send-back, reject, e-mail or SLA setting.
- The plan asks for these switches:
  - send-back disabled on `CIQ Case` steps 2–4 (§6 rule 2b, R3);
  - Reject disabled on track steps 1–6 (§4.8);
  - e-mail off on "Part 2 – Beiersdorf review" (K-11).
- Each step carries them as `native_settings`, and they are listed in `workflow.meta.step_settings_not_compiled`.
- They must be set in the Process builder after generate (plan §11 step 9, L809) and proven by K-11/K-13.
- Until then, re-fire protection rests on the UI and on duplicate-track detection (brd L1028, review note 3).
**Alternatives:** drop the switches silently. Rejected.
**Status:** `proposed`

## D13 · No `decision` labels; outcomes go in fields, and Reject stays native
**Why:**
- The sequence adapter flags `decision` arrays as routing it cannot execute (FOUNDATION_OUTCOME_NOT_EXECUTABLE).
- Approve is a submit. Reject is the native Reject with a mandatory comment, which needs no modelled edge or "Rejected" step (brd L537).
- `outcome_field` records the result: `Overall_Decision` on "Overall approval" and `Track_Decision` on both final-decision steps.
**Alternatives:** keep the labels and accept an unsupported-capability finding. Rejected because it adds no behaviour.
**Status:** `proposed`

## D14 · SLAs — none set
**Why:**
- The plan names native step SLAs + `SlaBreached` as the MVP reminder mechanism (L763, L765, L989), but gives no duration and no step list; K-23 decides.
- No durations are invented, so `workflow.slas = []`.
**Alternatives:** placeholder durations. Rejected because they cannot be traced to the brd.
**Status:** `proposed`

### Stage 2 wave 2: kf-data-architect (data_model slice, graph revision 9)

## D15 · Data-model typing conventions — one type rule per field family across all 28 flows
**Why:**
- The plan's §4 intro (brd L264) fixes the families: keys and machine-written codes are Text; JSON and long text are Textarea; Yes/No answers are Selects on `CIQ Yes No` (D15 of the plan, L198); counters (`Cycle_No`, `Run_No`, `Rev_No`, `Round_No`, `Seq_No`, `Result_Rev`, `Attempts`, `Sort_Order`, `Row_Position`, `Open_Points_Open`, `Conc_Min/Max`) are Number.
- Timestamps (`*_At`, `Phase_Since`, `Lease_Until`) are DateTime. Calendar dates (`*_Due_Date`, `Valid_From/To`, `Valid_Until`, `Reactivation_Deadline`) are Date.
- Plan fields with no stated type were typed by actor. An internal BDF actor gets User (`Added_By` A5, `Raised_By`/`Closed_By` A21/A22, `Grantor`/`Delegate` A26, the last two per open question 45). A supplier or integration-written person gets Text/Email (`Uploaded_By`, `Person_*`, `Actor_*`, `Recipient`, `Sent_To`).
- `required` is set only where the plan marks R (A1, A2, A4, A6, A7, A8 `Release_Key`, A9 Start fields, A17, A21/A22 `Finding_Text`), plus A24 (see the A24 decision). The workflow designer owns step-level Mandatory.
- A17 `Blocking` defaults to "Yes" (plan L398). A9 `Overall_Approval_Required` defaults to "No" (open question 22 default).
**Alternatives:**
- Text for every actor field. Rejected for internal actors: User fields give native pickers and filters.
- Form-level `required` on integration-written fields. Rejected: the integrations' API writes would fail.
**Status:** `proposed`

## D16 · A9 contract fields — exact names and types; Release_Path and Overall_Approval_Required are plain Text; K-20b fields omitted
**Why:**
- Part A L60 names the 15 fields and overrides plan §4.4.
- `Release_Path` is Text with no formula; the G5 session writes it (open question 21). `Overall_Approval_Required` is Text "Yes"/"No", default "No" (open question 22).
- The types the contract leaves unstated follow the plan (open question 24): `Case_Code`, `Completeness_By_Name`, `Final_Release_By_Name` and `Final_Release_By_Role` are Text; `Current_Cycle` is Number; the two `*_By_Email` fields are Email; the two `*_At` fields are DateTime.
- `Open_Tracks` and `Sync_Gate` are omitted (D5).
- An offline compile shows that every field id equals its name. The longest A9 contract name is 25 characters.
**Alternatives:** keep the plan's `Release_Path` formula. Rejected because the contract says Text.
**Status:** `proposed`

## D17 · A24 CIQ Internal Note — explicit author/time fields `Note_Author` (User) and `Note_At` (DateTime); Case_Code and Note_Text required
**Why:**
- v2 override 4 (brd L49) requires author and time but names no fields. The stage brief asked for explicit fields, which overrides the open question 41 default (system created-by/at).
- The names follow the A24 owner prefix `Note_` and the plan's `<verb>_At` pattern.
- The author is always a BDF user, so the field is a User field.
- v2 marks only `Linked_Kind` (and `Linked_Key`) as optional, so `Case_Code` and `Note_Text` are required.
- `Note_Dept` is dropped (open question 40). `Linked_Kind` is Text (open question 32, D7).
**Alternatives:** the system `_created_by` / `_created_at` fields only. These are correct for native creates, but a session that posts on someone's behalf could not set them.
**Status:** `proposed`

## D18 · v2 document and RMES knock-ons — file name + upload date pairs replace every *_Doc_Version; A18 drops Review_Version_Key
**Why:**
- v2 overrides 3 and 6 (brd L45–L51), the portal session's confirmed `CIQP Query` names, and open questions 3, 4, 33–39, 48 and 51.
- A15 carries `File_Name`, `Uploaded_At`, and `Uploaded_By` (Text holding an e-mail). It has no `Doc_Version`, and `Supersedes_Key` is kept.
- The A17 Ref tuple is `Ref_Kind`, `Ref_Section_Key`, `Ref_Field_Key`, `Ref_Row_Id`, `Ref_Doc_Id`, `Ref_Doc_File_Name` (Text), `Ref_Doc_Uploaded_At` (DateTime) and `Ref_Label`, plus the internal-only `Ref_Finding_Code`.
- A19/A20 use `Source_Doc_File_Name` and `Source_Doc_Uploaded_At`.
- A21/A22 "Source keys" are the full A19/A20 `Source_*` set, including `Source_Section_Rev` (open question 48).
- A23 has `Case_Code`, `Doc_Key`, `Doc_File_Name` and `Doc_Uploaded_At`.
- A18 has `Case_Code` and `Created_At`; `RMES_Key` holds `<Case_Code>|<timestamp>`.
- A27 adds no field: the basis value and document go in `Source_Refs_JSON` (open question 39).
**Alternatives:**
- Dedicated A27 basis fields.
- A Number `Ref_Doc_Version`. Rejected by v2.
**Status:** `proposed`

## D19 · Open-question defaults applied to fields — A26 Delegation_Reason, A30 Lease_Holder, A11 Override_Justification not mandatory
**Why:**
- A26 `Reason` is renamed `Delegation_Reason` (Textarea), because generic names are banned (open question 44, R14 L1012). `Delegation_Dept` is a Select on `CIQ Department` (open question 45).
- A30 gets `Lease_Holder` (Text), the field the G4b intake lease writes its id into (open question 47, brd L751).
- A11 `Override_Justification` is a Textarea and not Form-mandatory. Mandatory-for-manual-extension is a UI gate (open question 20).
- A14 keeps `Rev_No` and `Supersedes_Key` (open question 1).
**Alternatives:**
- A30: no lease field, using `Items_JSON` instead. That would make the lease harder to read back.
- A11: Form-mandatory. That would break every non-manual run.
**Status:** `proposed`

## D20 · A19/A20 Reported_Value and Limit_Value are Number
**Why:**
- The plan leaves them untyped (L409). Limit comparisons, the seeded limits (As ≤ 0.5 mg/kg and others, L431) and native report filters need numbers. `Prefill_Value` stays Text.
- Below-LOQ results are handled by the limit set's `loqRule` (L431), not by a text value.
**Alternatives:** Text, which can hold "<0.05" verbatim but cannot be compared natively. A19–A22 are Forms, so the type can be changed later.
**Status:** `proposed`

## D21 · A10 CASE-lane mirrors keep their source types — Departments_Activated is a Multiselect on CIQ Review Dept
**Why:**
- A10 is the listable read model (brd L370–L386), and native reports must filter it.
- `Origin_Types`, `Target_Markets` and `Departments_Activated` mirror Multiselects on A9/A11, so they reuse the same lists. `Owner_RMM` is User, and `Overall_Approval_Required` is Text as on A9.
- The architecture's `used_by` for `CIQ Review Dept` does not list A10. This adds a use; it adds no list.
**Alternatives:** Text mirrors (comma-joined). Rejected: these cannot be filtered natively.
**Status:** `proposed`

## D22 · Formulas — Dept_Gate reads Select values directly; three formulas use nested IF/ISBLANK only
**Why:**
- Plan L404 and L409. The formulas:
  - `Dept_Gate` = `IF(Activated = "Yes", Dept_Code, "NONE")`, a Text field;
  - `Open_Track_Num` = `IF(Activated = "Yes", IF(Track_Closed = "Yes", 0, 1), 0)`, a Number field;
  - `Is_Pending` = `IF(Applicable = "Yes", IF(ISBLANK(Criterion_Result), 1, 0), 0)`, a Number field on both A19 and A20.
- An offline compile shows Select fields (`Activated`, `Dept_Code`, `Track_Closed`, `Criterion_Result`) as plain String field nodes. `Dept_Gate` therefore yields the list item itself (REG/SAF/QM/MIC/SUS/RMM), which is what `Dept_Gate = "<code>"` compares. No `GETVALUE` or `TOTEXT` wrapper is needed.
- Live behaviour is not yet proven on the tenant, so check a track's `Dept_Gate` value after the first create.
**Alternatives:** make `Dept_Code` Text so the formula only touches Text. Rejected, because the plan wants a Select for reporting.
**Status:** `proposed`

## D23 · I-2 and I-4 modeled in the IR but held out of compile — refines D9
**Why:**
- D9 said "I-2 and I-4 not authored tonight". Tonight nothing is authored at all, because author-generate waits for Thomas. So the `automations` slice now models both exactly as plan §10 states (brd L776, L779). I-2 is six entries, one per department.
- An offline dry-run build (`kf build --out`, scratch only) shows what the engine does with a `channel:"internal"` automation:
  - It compiles to an Integration with `IsActive:true`. The plan requires `IsActive:false` (brd L771), and none of `active`, `is_active`, `IsActive`, `enabled`, `status`, `manual` or `deferred` changes that.
  - It passes the step-entry trigger through as an unresolved event. `ItemEntersToStep` and `ItemExitsToStep` are not engine events.
  - A notify compiles with an empty FieldMap, so the `Owner_RMM` recipient is lost. GeneratePDF cannot be expressed.
  - The plan's one integration with six actions would become six separate integrations, and none of them can be deleted.
- `channel:"external"` is the only switch that stops compilation. Both I-2 and I-4 therefore carry `channel:"external"`, `class:"internal"`, `held:true`, `is_active:false` and an `engine_gaps` list. The channel value is the engine's no-compile switch. It doesn't claim that an outside system does the work.
- If Thomas approves at author-generate, they are built by hand in the Integration builder, inactive, unless the engine gains support for inactive integrations, step triggers and GeneratePDF first.
**Alternatives:**
- `channel:"internal"`. Rejected: generate would permanently create active integrations with the wrong trigger and an e-mail with no recipient or PDF.
- Omit them, as D9 did. Rejected: the integration contract would not be visible for review.
**Status:** `proposed`

## D24 · I-2 activation precondition — never activate before send-back is off on CIQ Case steps 2–4
**Why:**
- I-2 re-fires whenever `CIQ Case` re-enters "Part 2 – Beiersdorf review" and duplicates every track (brd L542, L573, L589).
- The plan prevents that by disabling send-back on CASE_S2–S4, but the engine cannot set that switch, so it is set by hand (D12).
- The precondition is recorded on all six I-2 entries (`activation.precondition`). The intake duplicate-`Track_Key` check stays as the second line.
- Note that the plan's I-2 field map does not set `Track_Key`, so intake must derive it. I did not add a mapping the plan doesn't state.
**Alternatives:** activate I-2 and rely only on the intake duplicate check. Rejected: tracks would still be created, and they notify departments.
**Status:** `proposed`

## D25 · Cross-container I-1, I-3, I-6 recorded as external — portal session owns them; not compiled here
**Why:**
- Part A gives I-1, I-3 and I-6 to the portal session over REST (brd L22, L97).
- They are recorded so that the contract is visible: trigger, step names, locators (`App_Case_Item_Id`, `Portal_Request_Item_Id`), field maps and then-Approve targets. Each carries the step-specific trigger rule (brd L542), `is_active:false` and its K-09 fallback.
- The portal flow is referenced by name ("CIQP Request", reported id `CIQP_Request_A00`). It doesn't exist in this app's data model.
- These three alone clear the gate floor (≥2, so `AUTOMATIONS_MISSING` clears without counting the held I-2/I-4).
**Alternatives:** leave them out because they aren't built here. Rejected: the gate would then rest only on held entries, and the contract would be hidden.
**Status:** `proposed`

## D26 · I-5 (SlaBreached escalation) and native step e-mails — not modeled as automations
**Why:**
- I-5 is optional in the plan (brd L780), and it needs step SLAs. `workflow.slas = []` (D14), so I-5 does not apply until K-23 sets durations. No durations are invented.
- The native task and assignment e-mails that plan §9 keeps native (brd L763) are already recorded in `workflow.notifications`, which the workflow designer owns. Repeating them here would double-count.
**Alternatives:** a placeholder I-5 entry. Rejected: there is no trigger it can attach to.
**Status:** `proposed`

## Stage 2: author-plan, wave 3 (2026-10-07, kf-security-designer)

The `security` slice is committed at graph **revision 10**. It holds 392 role × flow grants, step field permissions on A8/A9/A16 and the data-scope map. The matrix is plan §7.2 cell by cell.

## D27 · Mapping the plan legend onto the engine — E→Editable, V→ReadOnly, I→Editable+initiator, M→Act, A→not expressible
**Why:**
- The engine has two flow levels: `Editable` and `ReadOnly`. On a Process, `Editable` becomes Member `["InitiateItems"]` at apply, and `ReadOnly` becomes Member `["View"]` (LESSONS 16/18).
- **E** (Form) → `Editable`. Whether that includes `Delete` is fixed at apply; K-17 decides, and the plan accepts `["Delete"]`.
- **V** (Form) → `ReadOnly`. **V** (Process) → `ReadOnly` = Member `["View"]`, which is the plan's K-21-pass branch. If K-21 fails, the plan's fallback (I with "+ New" hidden) is a grant change after the spike.
- **I** → `Editable` + `initiator: true`.
- **M** has no engine equivalent. When the role owns a step, the engine lowers M to `Editable`, which grants InitiateItems: **broader than plan**. That applies to Case Sync and Overall Approver on A9, Config Approver on A8, and Safety/Regulatory Approver on A16. Svc on A9 owns no step, so it lowers to `ReadOnly`: View is added and there is no InitiateItems.
- **A** → see D29.
**Alternatives:**
- `scope: participating` with `initiator: false` for the M cells. Tested on a scratch copy: it still lowers to `Editable`, it narrows reading below REQ-PROC-019, and it needs per-user replay proofs. Rejected.
- Remove the Act steps so M lowers to ReadOnly. Rejected: that locks the step owners out.
**Status:** `proposed`

## D28 · Data scope — `all` for every grant; "own lane / own area" stays a convention
**Why:** REQ-PROC-019 (all internal roles read all project content) and plan §7.2/§7.3/R11. Form members can edit every row [MM §4.7], so "own lane" is enforced by sessions and the audit chain, not by a grant. T3: grants authored through `ir.permissions[]` also give report View on all items. That is acceptable for internal roles here and is reported, not hidden.
**Alternatives:** `my` or `participating` scopes. Rejected: they have no adapter for Forms and contradict REQ-PROC-019.
**Status:** `proposed`

## D29 · CIQ Case Admin — flow Admin on A9/A16 applied by REST after generate; `ReadOnly` authored as the in-engine subset
**Why:** the engine has no flow-Admin level. A `ReadOnly` grant on A9 and A16 is a strict subset of Admin: it keeps the role attached to exactly those two flows and adds no initiator. `security.post_generate_grants` lists the two Admin grants (REST `member/batch`, then read back with GET). Case Admin has no other grant.
**Alternatives:** `Editable`. Rejected: it would add a second A9 initiator (T1) and still not be Admin.
**Status:** `proposed`

## D30 · Step field permissions — the workflow handoff plus what step owners need to act
**Why:** these are carried exactly from `workflow.meta.security_handoff`:
- `Completeness_At` is Mandatory at CASE_S1, and `Completion_Trigger` is Mandatory at CASE_S3. This closes both FOUNDATION_EVIDENCE_GATE items.
- I-1's `Completeness_*` fields are Editable at S1, and I-3's `Final_Release_*` fields are Editable at S3. `Track_Decision` is Mandatory at TRK_S7/S8.
- Outcome and decision fields are ReadOnly at Start, and the pinned keys are ReadOnly after Start.
These are added, with their evidence, because the step owners must fill them:
- TRK_S1–S6: `Completion_Confirm`, `Completion_Note`, `Track_Closed` and `On_Behalf_Of` are Editable (brd L404; journey inputs; delegation REQ-PROC-039).
- TRK_S7/S8: `Decision_Reason`, `Track_Closed` and `On_Behalf_Of` are Editable.
- TRK_S0: `Decision_Reason`, `Completion_Confirm` and `Track_Closed` are ReadOnly as well (outcome fields).
- REL_S1: `Release_Manifest_JSON`, `Manifest_Hash`, `Regression_Result_JSON` and `Test_Case_Codes` are Editable (brd L440).
- CASE_S1–S3: `Cancel_Reason` and `Cancelled_At` are Editable (G8 cancellation, brd L571).
- CASE_S1: `Portal_Request_Item_Id` is Editable (the G1 write-back after Start).
Not added: the search mirrors (`Main_INCI`, `Supplier_DUNS`, `Origin_Types`, "written at intake"). They are Editable only at Start; flagged to Workflow. **Superseded by D35:** the three mirrors are now Editable at CASE_S1 and CASE_S2. **See also D42:** `Cancel_Reason` and `Cancelled_At` are also Editable at S4, and `Reactivation_Deadline` at S1–S4.
**Alternatives:** the handoff list only. Rejected: every review, decision and regression journey would hit read-only inputs.
**Status:** `proposed`

## D31 · Open-question defaults taken for grants
**Why:** open question 53: A23 is V for the QM, MIC and SUS reviewers. Open question 52: Process Owner has the same grants as Auditor. Open question 55: Svc gets its §7.2 grants. `Admin` and `User` get no grants, the supplier has no role, and no members are added (T7).
**Alternatives:** none in the plan.
**Status:** `proposed`

## D32 · T14 confirmed — the dry-run build auto-adds 23 baseline pages and 4 nav menus despite `pages = []`
**Why:** a scratch `kf build` dry run added 20 role home pages, flow pages for A8, A9 and A16, and 4 nav menus. Under NAV_GRANT_ESCALATION, a flow page escalates the V roles on that process to editors, and so to initiators. Recorded as SEC-HR1/HR2 in the security slice. Per D10, generate must suppress these pages, or delete them before the grant pass and re-audit the grants per role. No page may ever reference A19–A22 for a read-only role.
**Alternatives:** accept the baseline. Rejected: it breaks the grant matrix and REQ-CFG-004.
**Status:** `proposed`

## D33 · A16 initiators — FOUNDATION_INITIATOR_CONTRACT_MISMATCH left open for Workflow + Security
**Why:** the plan gives I on A16 to RMM, the five reviewers and Svc, and all seven hold `initiator: true`. The compiler counts only the single start owner (`ciq_rmm`, TRK_S0) as an executable initiator. Shrinking the summary to `[ciq_rmm]` would hide the fact that late activation by a reviewer (brd L601) does not replay. The repair belongs to Workflow: give TRK_S0 all seven creator roles if the step schema allows it; otherwise the platform needs a multi-initiator start adapter.
**Alternatives:** drop the reviewers' initiator grant. Rejected: that narrows below the plan and breaks late activation and reopen.
**Status:** `proposed`

## D34 · A16 multi-initiator start — the workflow schema cannot express it; FOUNDATION_INITIATOR_CONTRACT_MISMATCH stays open (kf-workflow-designer, follow-up to D33)
**Why:**
- A process step takes exactly one owner role. I tested this on the graph:
  - **`assignee_role` as an array (revision 13):** fails with `FOUNDATION_STEP_ROLE unknown role 'ciq_rmm,ciq_regulatory_reviewer,…'`. It also cleared the executable initiator set and raised `FOUNDATION_ACTION_GRANT_MISSING` on TRK_S0.
  - **An extra `assignee_roles` key (revision 12):** the compiler ignores it, and the finding stays at `actual: [ciq_rmm]`.
- I reverted TRK_S0 to the single owner `ciq_rmm` (revision 14). The seven creator roles stay in `TRK_S0.initiator_roles`, as does security's `initiator: true` on all seven. Neither is shrunk.
- The finding remains open, owned by platform. Fixing it needs a multi-initiator start adapter.
- Until then, replay cannot prove that a reviewer can start a track (late activation, reopen, brd L601) or that the Integration Service can (I-2). The native grants still allow both.
**Alternatives:**
- Shrink the initiators to `[ciq_rmm]`. Rejected: this narrows below the plan (L643).
- Use six parallel or conditional start steps. Not possible: the engine requires a single unconditioned StartEvent.
**Status:** `proposed`

## D35 · A9 search mirrors — Main_INCI, Supplier_DUNS, Origin_Types Editable at CASE_S1 and CASE_S2, ReadOnly at S3/S4 (supersedes the "Not added" line of D30)
**Why:**
- This carries the workflow handoff item for CASE_S1/S2. Intake (G4b) writes these fields at Part 2, and the open question 7 v2 default re-syncs them during Part 1/2 (brd L366).
- S3 and S4 are explicitly ReadOnly. Start keeps the engine default (Editable); the plan states nothing else for it.
- Security committed at graph revision 16. The seven A16 `initiator:true` grants are unchanged; the mismatch stays open as a platform gap (D34).
**Alternatives:** Editable only at S2, where intake runs. Rejected: the v2 re-sync can happen during Part 1.
**Status:** `proposed`

## Stage 2: author-plan, wave 4 (2026-10-07, kf-experience-designer)

The `experience` slice is committed at graph **revision 17** (base revision 16). It projects to `pages: []` and `nav: {menus: []}`; read back identical to the payload. Private payload kept in the session scratchpad only.

## D36 · Experience — no native UI: `pages = []`, `nav.menus = []`, no landing pages, no cards, no reports
**Why:** brd Part A L36 (no UI tonight; the Workbench custom UI comes later, plan §9) and D10. The slice restates SEC-HR1 (no page/card/nav/report on A19–A22 for a role that only reads them, REQ-CFG-004) and SEC-HR2 (any page on a flow escalates its V roles to editor, and on a Process to initiator). The gate warning NO_PAGES is expected by design.
**Alternatives:** process-organized role dashboards and nav. Rejected: out of scope tonight and every page would escalate V roles (T14).
**Status:** `proposed`

## D37 · Baseline suppression is a build/generate requirement (EXP-BR1/BR2)
**Why:** D32 showed the build auto-adds 20 role home pages, flow pages for A8/A9/A16 and 4 nav menus despite `pages = []`. Generate must run `kf build --no-pages` (the engine's build verb lists this flag). If generate cannot suppress the baseline, every auto-added page and nav menu is deleted before the grant pass, and the per-role grant audit must show zero pages and no V role turned Editable/initiator (plan §7.4 T14).
**Alternatives:** accept the baseline and fix grants afterwards. Rejected: the auto-grant is applied with the page and breaks REQ-CFG-004.
**Status:** `proposed`

## D38 · Intended per-role landings recorded for the later Workbench custom UI only (plan §9)
**Why:** keeps the journey design traceable without creating any native page. RMM and Case Admin → RMM dashboard; the five reviewers and Case Sync → review queue and workspace; Safety/Regulatory/Overall/Config approvers → approvals; Customs and Legal → informed list; Business Admin and platform Admin → admin console; Auditor and Process Owner → reports, audit trail, reconstruction; Integration Service and User → none. Held in `experience.deferred_custom_ui`, not compiled.
**Alternatives:** native landing pages now. Rejected per D36.
**Status:** `proposed`

## D39 · Gate blocker FORM_NO_UI (CIQ Supplier Contact.Contact_Supplier → CIQ Supplier) left open for Thomas; recommend seeding
**Why:** the mandatory Reference has no page on CIQ Supplier, so the picker is empty until suppliers exist. No page is added to clear it. Options: (a) seed fictional suppliers with kf-seed after generate (people and suppliers stay fictional); (b) a later masters page for CIQ RMM / CIQ Business Admin, who already hold E on A1–A4, so it escalates nothing. Recommended: (a) for tonight's backend-only build. The engine's `gate` takes no flags and the docs show no waiver mechanism, so the acknowledgement is recorded only as `experience.open_items[EXP-OI1].waiver_status = "proposed, pending Thomas"`; the gate still reports it as a blocker.
**Alternatives:** add a masters page now (option b). Deferred: it contradicts D10 tonight, even though it would not escalate grants.
**Status:** `proposed` (pending Thomas)

## D40 · COH-01 — read-only on A8 `CIQ Config Release` for RMM, the five reviewers, both approvers and the Overall Approver (deviates from §7.2 by read only)
**Why:**
- `CIQ Case.Release_Hash` is copied from the published release item's `Manifest_Hash`, and every config load is verified against it (brd L353, L440, L705).
- §7.2 gives those roles no grant on A8, so their sessions could not read the anchor.
- The fix adds `ReadOnly` (Member `["View"]`) with no initiator. The dry-run lowering confirms ReadOnly for all nine roles, and only CIQ Business Admin initiates A8.
**Alternatives:**
- Keep §7.2 literally. Rejected: the hash chain could not be verified.
- Copy the manifest onto a Form. Rejected: an editable row proves nothing (brd L440).
**Status:** `proposed`. This needs Thomas's confirmation; the recommended option was taken overnight under his authorisation.

## D41 · COH-02 — the five broadened M cells are recorded as deviations and reset to Member `[]` after generate
**Why:**
- The engine emits `Editable` for these cells, which means InitiateItems (D27):
  - Case Sync on A9
  - Overall Approver on A9
  - Config Approver on A8
  - Safety Approver on A16
  - Regulatory Approver on A16
- The slice now records `engine_level` and `deviation` on every grant.
- Each of the five cells is in `post_generate_grants` as a REST `member/batch` reset to `Permission: []` (K-06), followed by a GET read-back.
- If K-06 shows that `[]` cannot act, they stay Editable and the trade-off is disclosed.
**Alternatives:** accept the extra initiators silently. Rejected under T1.
**Status:** `proposed`

## D42 · COH-03/06/07 — step field changes on A9 and A16
**Why:**
- **COH-03 (A9, cancellation):** `Cancel_Reason`, `Cancelled_At` and `Reactivation_Deadline` are Editable at CASE_S4. `Reactivation_Deadline` is also Editable at CASE_S1–S3, so cancellation records it at every step (REQ-PROC-049; brd L582).
- **COH-06 (A9, Release_Path):** `Release_Path` is Mandatory at CASE_S2, so a blank value cannot silently skip final release.
- **COH-07 (A16, review steps):** `Assigned_Reviewer` and `Track_Due_Date` are Editable at TRK_S1–S6 (REQ-CTL-003).
- `Owner_RMM` is unchanged (Start only, as the plan states).
**Residual risk (RR-1, COH-06):** native Reject stays available at S2, because the engine cannot disable it and the plan uses Reject for cancellation. Any CIQ Case Sync member can therefore reject the whole case from My Tasks. Mitigations: narrow membership (SEC-HR6) and the T13 audit check.
**Alternatives:** leave Release_Path Editable. Rejected: a blank value skips final release.
**Status:** `proposed`

## D43 · COH-08/09 — membership rule and residual edit/delete risk recorded in the slice
**Why:**
- **SEC-HR6 (COH-08):** every member of CIQ Case Sync and CIQ Case Admin must also hold CIQ RMM, a reviewer role or an approver role. This is Thomas's rule to apply, because members are not added by the build (T7).
- **RR-2 (COH-09):** BDF roles with E on A14 and A15, and the owners of CASE_S1/S2 with the A9 search mirrors, can still edit or delete those supplier-value copies natively. They are tamper-evident through A27. Removing Delete waits on K-17.
**Alternatives:** none until K-17.
**Status:** `proposed`

### Wave 4 re-base (kf-experience-designer)
The `experience` slice was re-committed at graph **revision 22** (base 21), after security revisions 18 and 21. The policy is unchanged: `pages = []`, no nav, EXP-BR1–BR3 and FORM_NO_UI open for Thomas (D36–D39). Changes:
- SEC-HR6 added to the inherited hard rules. CIQ Case Sync and CIQ Case Admin get no landing of their own; their members land through their base role.
- COH-11: the deferred landings now quote contract step names with the exact en-dash.
- RMM's deferred landing now notes delegation (A26) and master data (A1–A5).
No new decision was needed.

## D44 · Workbench design notes from the portal session (as-built portal contract) — recorded only; no app fields change
**Why:**
- The portal session's review of the live portal on 2026-10-07 made these rules part of the cross-container contract.
- They govern the later Workbench custom UI. They change no field in this run.

The rules:
- `Assigned_Contacts` and `Case_Contacts_JSON` on portal items are derived only from that case's `CIQ Case Contact` rows, and are read back after create.
- Change-request triage refuses the request unless both checks pass:
  - `_created_by` is the `Portal_User_Key` of a contact of that `Case_Code`;
  - `Cycle_No` is the current cycle.
- A refusal shows a generic text and writes an audit event.
- `CIQ Case.Completeness_Confirm` stays Text. I-1 copies the portal Select `CIQP Confirm` ("Confirmed") as a string.
- `CIQP Request.App_Case_Item_Id` is required at Start, so G1 creates `CIQ Case` first.
- `Portal_Request_Item_Id` is written by RMM at `Part 1 – with supplier`, where it is Editable (D30).
- I-6 writes exactly "Yes"/"No" into the portal Select `Supplier_Release_Requested`. `Release_Path` is Mandatory at Part 2 (D42), so the source is always set.
- A17 `Rounds_JSON` stays the authoritative query history. The portal `Thread_JSON` is ReadOnly for the supplier.

**Alternatives:** none. These are the portal session's facts, not choices made here.
**Status:** `proposed`


## D45 · Post-generate grant resets and cancellation procedure (coherence second pass OPEN-1/OPEN-2) — recorded only; no slice change
**Why:** the coherence critic found these at revision 23. They are REST steps after generate, so they change no slice. Recording them here avoids another round of commits.

**OPEN-1: the D41 resets, refined**
- Apply none of them before spike K-06 proves that an act-only member can act on its step.
- **CIQ Case Sync** on `CIQ Case`: reset to Member `[]`.
- **CIQ Overall Approver** on `CIQ Case`, **CIQ Config Approver** on `CIQ Config Release`, and **CIQ Safety/Regulatory Approver** on `CIQ Review Track`: reset to Member `["View"]`, not `[]`. Two reasons:
  - they keep read access, which REQ-PROC-019, the Config Approver's after-End publish and G5's track reads need (brd L600);
  - it still drops InitiateItems.
- Read each one back with a GET.

**OPEN-2: procedures**
- **(a) Cancelling at Overall approval:** the CIQ Case Admin reassigns the task to themself, writes `Cancel_Reason`, then rejects. An admin-route reject writes no fields. K-13 proves this.
- **(b) `Reactivation_Deadline`:** written by the session that cancels. On the I-3 ending, the G5 session writes it at Part 2.
- **(c) `Release_Path`:** Mandatory only blocks a blank value. The G5 session must write exactly "Yes" or "No", because I-6 copies it into a portal Select (D44). The Workbench validates it.

**Alternatives:** re-commit the security and workflow slices. Rejected for tonight: it would re-stale the experience and coherence slices for notes that only apply after generate.
**Status:** `proposed`
