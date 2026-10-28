> **SUPERSEDED (2026-10-07).** This log records the overnight v1 run (`runs/ciq-digital`, 28 flows), which was **never generated** and must not be. What replaced it:
> - **Data model:** `docs/kissflow-data-model/app-plan-v4-processes-and-forms.md` (11 flows: 3 Processes and 8 Data Forms), under Thomas's rules.
> - **Test harness:** "CIQ ZZ Spike …" flows are LIVE in CIQ_Digital_A00; results are in `SPIKES.md`.
> - **Real backend:** App Builder run `runs/ciq-digital-v4` (brief and plan started 2026-10-07). Generate waits for Thomas's approval of the dry-run list, and for the parallel-steps runtime test.

# CIQ Digital: build log (`CIQ_Digital_A00`)

**Status (2026-10-07, 03:54):** the plan is complete and passed a dry run. **Nothing has been written to Kissflow.**

The run went `author-brief` → `author-plan` (snapshot **v1**) → `author-preview` and stopped there, before `author-generate`:
- CLAUDE.md requires Thomas's approval before `author-generate`, because published flows can't be deleted.
- The overnight request reached this session as a relay from the portal session, and a relay isn't his own approval.

## Morning checklist for Thomas

**1. Decide these before generating:**

| # | Decision | Recommendation | Ref |
|---|---|---|---|
| 1 | **Approve `author-generate`** for the change list below | Approve once 2–5 are settled | — |
| 2 | **Lists would be created as "CIQ Yes No A00", not "CIQ Yes No".** The compiler builds a list's display name from its id. Tested offline: a list id without `_A00` compiles as "CIQ Yes No". Fixing it means re-keying the 33 list ids in the data model (`/author-refine`). How Kissflow treats a client-supplied list id is untested. Names still start with `CIQ `, stay unique, and aren't part of the portal contract | Fix with `/author-refine` before generating, if the clean names matter for the demo. Otherwise accept | this log |
| 3 | **`FORM_NO_UI` gate blocker.** `CIQ Supplier Contact.Contact_Supplier` is a mandatory Reference, and no page shows `CIQ Supplier` (no UI tonight). The gate has no waiver flag | Seed fictional suppliers after generate (`/author-seed`). Option (b) is a later masters page for RMM/Business Admin, who already edit A1–A4 | D39 |
| 4 | **Confirm a deviation from plan §7.2:** ReadOnly (no create) on `CIQ Config Release` for RMM, the 5 reviewers, both approvers and the Overall Approver. Without it, nobody can read the release anchor (`Manifest_Hash`) that every case pins and every config load verifies | Confirm | D40 |
| 5 | **I-2 (track fan-out) and I-4 (final PDF).** The engine can only emit internal automations as **active**, with the wrong trigger and no GeneratePDF. Both are modelled but held out of the build; 0 integrations will be emitted. Build them by hand later, inactive | Build later by hand. Never activate I-2 before send-back is off on `CIQ Case` steps 2–4 | D23, D24 |

**2. Generate.** Run it from the repo root (where `.kf-env` is). It must **not** create pages:
- A default build auto-adds 20 role home pages, flow pages for `CIQ Config Release`, `CIQ Case` and `CIQ Review Track`, and 4 nav menus.
- Those flow pages would turn read-only roles into editors and creators (trap T14).
- The dry run with `--no-pages` emits none of them.
- Before approving, check that `author-generate` passes `--no-pages`. If it can't, delete every auto-added page and menu before anyone uses the app, then re-audit grants per role (D37).

**3. After generating, by hand or over REST.** App Builder 1.0.0 can't edit the app afterwards.
1. **Read back** the real flow, field and step ids, and send `CIQ Case`'s to the portal session for I-1/I-3/I-6.
2. **Process builder switches the engine can't set** (D12):
   - send-back off on `Part 2 – Beiersdorf review`, `Awaiting supplier final release` and `Overall approval`;
   - Reject off on `Review – Regulatory` … `Review – RMM`;
   - e-mail off on `Part 2 – Beiersdorf review`.
3. **Grant fixes over REST.** The engine has no act-only grant; spike K-06 must pass first (D41, D45):
   - CIQ Case Sync on `CIQ Case` → Member `[]`.
   - CIQ Overall Approver on `CIQ Case`, CIQ Config Approver on `CIQ Config Release`, and CIQ Safety/Regulatory Approver on `CIQ Review Track` → Member `["View"]`. This removes their ability to create items and keeps read access.
4. **Flow Admin** for CIQ Case Admin on `CIQ Case` and `CIQ Review Track` (D29).
5. **Membership rule** (SEC-HR6): every member of CIQ Case Sync or CIQ Case Admin must also hold an RMM, reviewer or approver role. No users were invited.
6. **Seed** fictional suppliers (decision 3 above).

## Where this was built

| What | Value |
|---|---|
| Sandbox | `https://dev-beiersdorf.kissflow.eu`, "Beiersdorf kf-dev", account `AcDOSunMEpSA` |
| Connected as | thomas@kissflow.com (own access key, through the connect page) |
| App | CIQ Digital, `CIQ_Digital_A00`, custom UI off |
| Build folder | Repo root (`.kf-env`, `runs/`, `MEMORY.md`) |
| Run | `runs/ciq-digital/`; plan snapshot `versions/v1/`; decisions D1–D45 in `decisions.md`; 56 open questions in `open-questions.md` |
| Requirement fed in | `runs/ciq-digital/brd.md`. Part A is `START-HERE.md` (wins on conflicts); Part B is `docs/kissflow-data-model/kissflow-data-model-plan.md` |
| Portal | `CIQ_Supplier_Portal_A00`: never touched by this session |

## Preview change list (what `author-generate` would create)

The dry run plans **482 artifacts** with **0 errors and 0 warnings**:
- 25 Form flows and 3 Process flows, with 454 fields
- 33 lists
- 20 roles (Admin and User reused, plus 18 custom)
- 401 flow permissions
- 0 pages, 0 nav menus, 0 integrations (with `--no-pages`)

A dry run can't tell what already exists in the sandbox. Going by START-HERE ("holds only the default Admin and User roles, no flows"), every flow, list and custom role would be **created** new.

### Flows

Ids are the planned ones. Kissflow assigns the real ids, so read them back after generating.

| # | Flow | Planned id | Type | Fields |
|---|---|---|---|---|
| A1 | CIQ Supplier | `CIQ_Supplier_A00` | Form | 9 |
| A2 | CIQ Supplier Contact | `CIQ_Supplier_Contact_A00` | Form | 8 |
| A3 | CIQ Supplier Site | `CIQ_Supplier_Site_A00` | Form | 6 |
| A4 | CIQ Raw Material | `CIQ_Raw_Material_A00` | Form | 8 |
| A5 | CIQ Case Contact | `CIQ_Case_Contact_A00` | Form | 8 |
| A6 | CIQ Config Version | `CIQ_Config_Version_A00` | Form | 13 |
| A7 | CIQ Section Definition | `CIQ_Section_Definition_A00` | Form | 13 |
| A8 | CIQ Config Release | `CIQ_Config_Release_A00` | Process | 6 |
| A9 | CIQ Case | `CIQ_Case_A00` | Process | 53 |
| A10 | CIQ Case Index | `CIQ_Case_Index_A00` | Form | 30 |
| A11 | CIQ Scope Run | `CIQ_Scope_Run_A00` | Form | 20 |
| A14 | CIQ Component | `CIQ_Component_A00` | Form | 17 |
| A15 | CIQ Document | `CIQ_Document_A00` | Form | 19 |
| A16 | CIQ Review Track | `CIQ_Review_Track_A00` | Process | 21 |
| A17 | CIQ Open Point | `CIQ_Open_Point_A00` | Form | 29 |
| A18 | CIQ RMES Record | `CIQ_RMES_Record_A00` | Form | 11 |
| A19 | CIQ RMES Safety Result | `CIQ_RMES_Safety_Result_A00` | Form | 33 |
| A20 | CIQ RMES Regulatory Result | `CIQ_RMES_Regulatory_Result_A00` | Form | 33 |
| A21 | CIQ Safety Finding | `CIQ_Safety_Finding_A00` | Form | 20 |
| A22 | CIQ Regulatory Finding | `CIQ_Regulatory_Finding_A00` | Form | 20 |
| A23 | CIQ AI Suggestion | `CIQ_AI_Suggestion_A00` | Form | 7 |
| A24 | CIQ Internal Note | `CIQ_Internal_Note_A00` | Form | 6 |
| A25 | CIQ Confirmation | `CIQ_Confirmation_A00` | Form | 16 |
| A26 | CIQ Delegation | `CIQ_Delegation_A00` | Form | 8 |
| A27 | CIQ Audit Event | `CIQ_Audit_Event_A00` | Form | 20 |
| A28 | CIQ Notification Log | `CIQ_Notification_Log_A00` | Form | 5 |
| A29 | CIQ Final Document | `CIQ_Final_Document_A00` | Form | 7 |
| A30 | CIQ Portal Link | `CIQ_Portal_Link_A00` | Form | 8 |

A12 `CIQ Review Version` and A13 `CIQ Section Snapshot` are dropped by v2 override 1.

### Roles (20)
- **Reused defaults:** Admin, User. Neither gets any flow permission.
- **Created:** CIQ RMM · CIQ Regulatory Reviewer · CIQ Safety Reviewer · CIQ QM Reviewer · CIQ Microbiology Reviewer · CIQ Sustainability Reviewer · CIQ Safety Approver · CIQ Regulatory Approver · CIQ Customs · CIQ Legal · CIQ Overall Approver · CIQ Business Admin · CIQ Config Approver · CIQ Auditor · CIQ Process Owner · CIQ Case Sync · CIQ Case Admin · CIQ Integration Service.
- No role has members.

### Lists (33)

Display names as compiled (see decision 2); item counts in brackets:

CIQ AI State (3) · CIQ Actor Side (3) · CIQ Case Phase (9) · CIQ Case Priority (2) · CIQ Config Kind (10) · CIQ Config State (4) · CIQ Confirm (1) · CIQ Confirmation Kind (10) · CIQ Contact Role (5) · CIQ Country Code (32: EU-27 + GB, TR, CN, US, CA) · CIQ Decision (3) · CIQ Department (8) · CIQ Doc Kind (7) · CIQ Finding State (3) · CIQ Impact Resolution (2) · CIQ Index Lane (7) · CIQ Job State (4) · CIQ Lane State (9) · CIQ Market (7) · CIQ OP Kind (5) · CIQ OP Outcome (3) · CIQ OP Phase (3) · CIQ Origin Type (8) · CIQ RMES Part (4) · CIQ RMES Result (8) · CIQ Review Dept (6) · CIQ Scope Trigger (5) · CIQ Section Kind (4) · CIQ Site Kind (2) · CIQ Supplier Kind (3) · CIQ Unit (6) · CIQ Waiting On (3) · CIQ Yes No (2).

Each display name also gets an " A00" suffix as compiled.

### Grants (401 flow permissions)

Legend:
- **E** = Editable. On a Process this also means "can create items".
- **V** = ReadOnly.
- **·** = none.

Read across: this matches plan §7.2 except for D40 (A8 readers) and the broadened cells in D41.

| Flow | RMM | REG-R | SAF-R | QM-R | MIC-R | SUS-R | SAF-A | REG-A | CUS | LEG | OVR | BA | CA | AUD | PO | SYNC | CADM | SVC |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| A1 | E | V | V | V | V | V | V | V | V | V | V | E | V | V | V | · | · | E |
| A2 | E | V | V | V | V | V | V | V | V | V | V | E | V | V | V | · | · | E |
| A3 | E | V | V | V | V | V | V | V | V | V | V | E | V | V | V | · | · | E |
| A4 | E | V | V | V | V | V | V | V | V | V | V | E | V | V | V | · | · | E |
| A5 | E | V | V | V | V | V | V | V | V | V | V | · | · | V | V | · | · | E |
| A6 | V | V | V | V | V | V | V | V | V | V | V | E | E | V | V | · | · | V |
| A7 | V | V | V | V | V | V | V | V | V | V | V | E | E | V | V | · | · | V |
| A8 | V | V | V | V | V | V | V | V | · | · | V | E | E | V | V | · | · | · |
| A9 | E | V | V | V | V | V | V | V | V | V | E | · | · | V | V | E | V | V |
| A10 | E | E | E | E | E | E | E | E | V | V | V | · | · | V | V | E | · | E |
| A11 | E | E | E | E | E | E | E | E | V | V | V | · | · | V | V | · | · | E |
| A14 | E | E | E | E | E | E | E | E | V | V | V | · | · | V | V | · | · | E |
| A15 | E | E | E | E | E | E | E | E | V | V | V | · | · | V | V | · | · | E |
| A16 | E | E | E | E | E | E | E | E | V | V | V | · | · | V | V | · | V | E |
| A17 | E | E | E | E | E | E | E | E | V | V | V | · | · | V | V | · | · | · |
| A18 | E | E | E | V | V | V | E | E | V | V | V | · | · | V | V | · | · | · |
| A19 | V | V | E | V | V | V | E | V | V | V | V | · | · | V | V | · | · | · |
| A20 | V | E | V | V | V | V | V | E | V | V | V | · | · | V | V | · | · | · |
| A21 | V | V | E | V | V | V | E | V | V | V | V | · | · | V | V | · | · | · |
| A22 | V | E | V | V | V | V | V | E | V | V | V | · | · | V | V | · | · | · |
| A23 | V | E | E | V | V | V | E | E | V | V | V | · | · | V | V | · | · | · |
| A24 | E | E | E | E | E | E | E | E | E | E | E | · | · | V | V | · | · | · |
| A25 | E | E | E | E | E | E | E | E | V | V | E | E | E | V | V | · | · | E |
| A26 | E | V | V | V | V | V | E | E | V | V | V | · | · | V | V | · | · | · |
| A27 | E | E | E | E | E | E | E | E | E | E | E | E | E | V | V | · | · | E |
| A28 | E | E | E | E | E | E | E | E | E | E | E | E | E | V | V | · | · | E |
| A29 | V | V | V | V | V | V | V | V | V | V | V | · | · | V | V | · | · | E |
| A30 | E | E | E | E | E | E | E | E | · | · | · | · | · | V | V | · | · | E |

### Irreversible once generated
- **Processes:** the 3 Processes (`CIQ Config Release`, `CIQ Case`, `CIQ Review Track`) can't be changed over REST after publish. Their steps, owners, conditions and per-step field rules are final.
- **Flows:** none of the 28 can be deleted.
- **Lists:** append-only (values in use can't be removed). Their display names are as compiled.
- **Integrations:** none are emitted. They would be permanent, which is why I-2 and I-4 are held.

## Contract for the portal session

**Contract-name check: no contract name changes or is truncated.** The independent checks (`checks/preview-checks-2026-10-07.txt`, 58/58 pass) confirm:
- every field id equals its name (none of the 454 truncated);
- the step names are byte-exact with the U+2013 en-dash.

`CIQ Case`: planned id `CIQ_Case_A00`, read the real one back after generate.

| # | Step (exact) | Kind | Owner | Condition |
|---|---|---|---|---|
| 0 | Create case | Start | CIQ RMM | — |
| 1 | Part 1 – with supplier | User task | CIQ RMM | — |
| 2 | Part 2 – Beiersdorf review | User task | CIQ Case Sync | — |
| 3 | Awaiting supplier final release | User task | CIQ RMM | `Release_Path = "Yes"` |
| 4 | Overall approval | User task | CIQ Overall Approver | `Overall_Approval_Required = "Yes"` |
| 5 | End | End | — | — |

**Contract fields on `CIQ Case`** (compiled name and type; field id equals the name):

| Field | Type | Where it can be edited |
|---|---|---|
| `Case_Code` | Text, required | Start only |
| `Current_Cycle` | Number | — |
| `Portal_Request_Item_Id` | Text | Part 1 |
| `Completeness_Confirm` | Text | Part 1 (I-1 writes "Confirmed") |
| `Completeness_By_Name` | Text | Part 1 |
| `Completeness_By_Email` | Email | Part 1 |
| `Completeness_At` | DateTime | Part 1, **Mandatory** |
| `Final_Release_By_Name` | Text | Awaiting supplier final release |
| `Final_Release_By_Email` | Email | Awaiting supplier final release |
| `Final_Release_By_Role` | Text | Awaiting supplier final release |
| `Final_Release_At` | DateTime | Awaiting supplier final release |
| `Completion_Trigger` | Text | Awaiting supplier final release, **Mandatory** |
| `Release_Path` | Text, "Yes"/"No" | Part 2, **Mandatory** |
| `Supplier_Notice_Text` | Textarea | Part 2 |
| `Overall_Approval_Required` | Text, "Yes"/"No", default "No" | Start only |

`CIQ Review Track` (planned id `CIQ_Review_Track_A00`) steps, in order:
1. Create track (Start)
2. Review – Regulatory
3. Review – Safety
4. Review – QM
5. Review – Microbiology
6. Review – Sustainability
7. Review – RMM
8. Final decision – Safety
9. Final decision – Regulatory
10. End

Each review step is conditioned on `Dept_Gate = "<REG|SAF|QM|MIC|SUS|RMM>"`, where `Dept_Gate = IF(Activated = "Yes", Dept_Code, "NONE")`.

`CIQ Open Point` reference tuple, the same names as the portal's `CIQP Query`:
`Ref_Kind`, `Ref_Section_Key`, `Ref_Field_Key`, `Ref_Row_Id`, `Ref_Doc_Id`, `Ref_Doc_File_Name` (Text), `Ref_Doc_Uploaded_At` (DateTime), `Ref_Label`, plus the internal `Ref_Finding_Code`.

**Real ids:** none exist yet, because generate is held. Read them back after generate.

## Deviations from the plan, and why

| What | Why | Ref |
|---|---|---|
| A12/A13 dropped. A15 is one row per file (`File_Name`, `Uploaded_At`, `Uploaded_By`). Every `*_Doc_Version` becomes file name + upload date. A24 is chat-shaped. A18 has no `Review_Version_Key` | v2 overrides 1–8 (START-HERE) | D16–D18 |
| `Release_Path` and `Overall_Approval_Required` are Text, not a formula or Select; `Completeness_Confirm` added | Naming contract (START-HERE) | D16 |
| "Create track" Start step added to `CIQ Review Track`; explicit End on every Process | The engine needs an unconditioned first step and no condition on the last business step | D4 |
| K-20/K-20b native gate fields (`Open_Tracks`, `Sync_Gate`, …) omitted | Optional in the plan; can't be added to a published Process later without REST patching | D5 |
| ReadOnly on A8 for RMM, reviewers, approvers and the Overall Approver | Contradiction in plan §7.2 vs §4.11 (COH-01). **Needs Thomas** | D40 |
| Five "M" (act-only) cells become Editable, which includes creating items: Case Sync and Overall Approver on A9, Config Approver on A8, both approvers on A16 | The engine has no act-only grant. Fixed by a REST reset after generate | D27, D41, D45 |
| CIQ Case Admin authored as ReadOnly on A9/A16 instead of flow Admin | The engine can't express flow Admin; grant it over REST | D29 |
| Additional editable fields: cancellation fields at Overall approval; search mirrors at Part 1/2; `Assigned_Reviewer`/`Track_Due_Date` at review steps; `Release_Path` Mandatory at Part 2 | Coherence findings COH-03/06/07; intake writes the search mirrors | D35, D42 |
| A26 `Reason` renamed `Delegation_Reason`; A30 gains `Lease_Holder`; A24 gains `Note_Author`/`Note_At` | Generic name rule; open-question defaults; START-HERE ("author and time") | D17, D19 |
| I-2/I-4 held out of the build | The engine would create them active with the wrong trigger | D23 |
| No SLAs | The plan gives no durations | D14 |

## Known gaps and residual risks
- **Process switches.** The send-back, Reject and e-mail switches aren't compiled. Until they're set by hand, a native send-back into Part 2 would re-fire I-2 (D12).
- **Track creators.** `FOUNDATION_INITIATOR_CONTRACT_MISMATCH` on `CIQ Review Track` stays open: the engine gives a start step only one owner role. All seven creator roles keep their create grant (D34).
- **Native Reject at Part 2.** Any CIQ Case Sync member could reject the whole case from My Tasks (RR-1).
- **Editable copies.** BDF roles with Edit on the copies (A14/A15, the search mirrors) can edit or delete them natively until K-17 allows removing Delete (RR-2).
- **Spikes not run.** Most K-spikes (K-06 act-only grants, K-09 integration identity and Approve semantics, K-10 all-skipped track, K-13 per-step disabling, K-17 delete) have not run. Several fixes above depend on them.
- **I-1/I-3 identity (COH-04).** CIQ Integration Service only views `CIQ Case`. The identity question is in the portal session's K-09 checks.

## Open questions to review
`runs/ciq-digital/open-questions.md` holds 56 questions, each with the default the plan took. Review sections **A** (knock-ons of dropping A12/A13), **C** (`CIQ Case` contract fields) and **E** (documents) before generating.

## For Thomas: observations outside this build
- **The portal session publishes as it goes.** It reports five portal flows published overnight (`CIQP_Request_A00`, `CIQP_Section_A00`, `CIQP_Query_A00`, `CIQP_Change_Request_A00`, `CIQP_Help_Article_A00`), republished after a review, with 403/403 live checks passing.
- **The portal route conflicts with CLAUDE.md as written.** CLAUDE.md says "build only with the App Builder plugin" and "never put an access key in a file". The portal session builds over REST with keys read from `.env` (chmod 600). Plan §10 records that route as decided on 2026-10-07; CLAUDE.md doesn't reflect it yet. Worth reconciling.

## Stage log

Clock times are given only where checked (run created 02:31, preview done 03:54); the rest is in order.

| Step | Stage / check | Result |
|---|---|---|
| 1 | `runs new ciq-digital`; `brd.md` written (Part A + Part B) | pass |
| 2 | author-brief (kf-ba): domain slice committed at graph rev 2, read back identical | pass |
| 3 | Check: 28 entities (25 Form + 3 Process); A12/A13 dropped | pass |
| 4 | Check: all 12 contract step names present byte-exact (U+2013) | pass |
| 5 | Check: all 15 `CIQ Case` contract fields present with the stated types | pass |
| 6 | author-plan wave 1 (kf-architect): architecture at rev 3, read back identical. 28 flows, 10 References, 20 roles, 33 lists, `pages = []` | pass |
| 7 | Wave 2: workflow (rev 8) ∥ data model (rev 9); verify 0 errors | pass |
| 8 | Check: "Create track" is the Start form, not an extra task | pass |
| 9 | Check: the A17 Ref tuple matches the portal's live `CIQP Query` tuple | pass |
| 10 | Gate (rev 9): `AUTOMATIONS_MISSING` + `FORM_NO_UI` | open |
| 11 | Wave 3: security (rev 10) ∥ automations (rev 11). Grants match §7.2, including the A19–A22 asymmetry; `AUTOMATIONS_MISSING` cleared; I-2/I-4 held | pass |
| 12 | Engine findings: no act-only grant (5 cells broadened), no flow Admin, baseline pages auto-added (T14) | recorded |
| 13 | Follow-ups: A16 multi-initiator not expressible (rev 15, D34); search mirrors Editable at Part 1/2 (rev 16) | partial |
| 14 | Wave 4: experience (rev 17), `pages = []`, `--no-pages` requirement | pass |
| 15 | Coherence pass 1 (rev 17): **FAIL**. COH-01 blocker (no read access to the release anchor), 5 medium | fail |
| 16 | Repairs: security rev 18 (D40–D43); workflow scenarios rev 19; re-commits rev 20–22, so no slice is stale | pass |
| 17 | Coherence pass 2 (rev 23): **PASS-WITH-ISSUES**. All internal journeys complete; 4 low items recorded in D45 | pass |
| 18 | Snapshot **v1 — initial plan** | pass |
| 19 | author-preview: `verify` 0 errors (2 expected warnings: AUTO_SELF on the held I-4, NO_PAGES) | pass |
| 20 | Dry-run build, default: 482 artifacts, 0 errors, **plus 24 auto-added pages and 4 nav menus** | flag |
| 21 | Dry-run build, `--no-pages`: 482 artifacts, 0 errors, no pages or menus | pass |
| 22 | Independent checks on the compiled output: **58/58 pass** (`checks/check-preview.mjs`, result in `checks/preview-checks-2026-10-07.txt`) | pass |
| 23 | Per-step field rules compiled as planned (Mandatory `Completeness_At`, `Release_Path`, `Completion_Trigger`, `Track_Decision`; pinned keys ReadOnly) | pass |
| 24 | List display names compile with an " A00" suffix; tested offline that a suffix-free id fixes it | flag |
| 25 | **Stopped before author-generate. Waiting for Thomas** (03:54) | held |
