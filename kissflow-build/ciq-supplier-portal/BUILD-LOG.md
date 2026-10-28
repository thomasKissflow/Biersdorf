# CIQ Supplier Portal: build log (v3, supplier-only)

| | |
|---|---|
| Sandbox | `https://dev-beiersdorf.kissflow.eu` ("Beiersdorf kf-dev", account `AcDOSunMEpSA`) |
| Container | **CIQ Supplier Portal** `CIQ_Supplier_Portal_A00` |
| Rebuilt | 7 Oct 2026, over REST, on Thomas's go ("fix the portal now") |
| Design | `docs/kissflow-data-model/plan-v3-supplier-portal-one-role.md` |
| Status | **324 / 324 read-back checks pass** (`verify-report.json`; 306 before the change below, plus the two new fields and, for all 8 flows, checks that every spec field is PUBLISHED with the spec's type and Required flag, read from runtime `allfields`); **16 / 16 runtime smoke tests pass**, plus 3 / 3 admin-key baselines as recorded (`smoke-report.json`). Every test item was deleted and verified gone |
| Change, 7 Oct | `CIQP Request` gained `Main_INCI` and `BDF_Material_No` (Text, optional; Thomas: "yes add INCI and material number to the portal request"). Dry-run diff against the live draft first: only the two fields, their layout rows and per-step permissions added, nothing removed. Draft PUT 200, publish 200 (09:55:39Z). Read back: draft and runtime `allfields` both list them; a second dry run shows zero difference; smoke P1-material stores and reads both values back |
| Claims audit | An independent auditor checked 112 claims in this log against the evidence. Its 10 corrections are applied, including republishing the CIQP Notice description |

The overnight v2 build put Beiersdorf roles and steps inside the portal. That was wrong for this use case and has been removed. Its record is kept in `*-v2-asbuilt.*`, `review/` and `../../docs/kissflow-data-model/kissflow-data-model-plan.md` §0.

Every claim here is backed by a read-back or a request log in this folder. Anything that needs real supplier users is marked **unverified** and is in `MORNING-TESTS.md`.

## The rules this build follows (Thomas, 7 Oct)

1. **One portal role, `Supplier`**, for every external user (for example supp1 and supp2 of each supplier). Besides it, only the platform defaults exist: `Admin` (Kissflow builders only) and `User` (no grants).
2. **Supplier steps only.** Every Beiersdorf decision happens in the app.
3. **Item identity:**
   - Every **app-created** portal item (Request, Section, Query, both confirmations, Notice) carries its app twin's id, plus `Case_Code`, `Cycle_No` and `Supplier_Code` (the supplier's own id from the app's supplier master).
   - The supplier-created **Change Request** carries `Case_Code`, `Cycle_No` and `Supplier_Code`. Its app twin is created from it (Y6), so it has no twin id.
   - The Help Article carries none.

## Processes and steps

All supplier steps are assigned from the item's `Assigned_Contacts` field (MultiUser), so only the named contacts get the task. No step is owned by a role (verified: "no step owned by a role" passes for every process).

| # | Flow (ID) | Steps | Who creates it | What it is for |
|---|---|---|---|---|
| P1 | **CIQP Request** (`CIQP_Request_A00`) | Issue request → **Supplier: submit basic data** → End | The app (case created) | The case as the supplier sees it: header, contacts, due date. The basic-data task (PS-03/04) |
| P2 | **CIQP Section** (`CIQP_Section_A00`), with child table **Uploads** | Release section → **Supplier: fill in section** → End | The app (one per released section) | The copied section definition, the supplier's answers and uploads. Editable until the final release. `Section_Release_Confirm` is Mandatory at the supplier step (read back). Whether that refuses an accidental submit is **unverified** (MT-7) |
| P3 | **CIQP Query** (`CIQP_Query_A00`) | Raise query → **Supplier: respond** → End | The app (one item per round) | A question, document request or additional part. The review happens in the app. A follow-up is a new round, with earlier rounds in `Previous_Rounds_JSON` |
| P4a | **CIQP Completeness Confirmation** (`CIQP_Completeness_Confirmation_A00`) | Request completeness confirmation → **Supplier: confirm completeness** → End | The app | PS-05. Data stays editable afterwards (v2) |
| P4b | **CIQP Final Release** (`CIQP_Final_Release_A00`) | Request final release → **Supplier: release** → End | The app | PS-11, the single final release |
| P5 | **CIQP Notice** (`CIQP_Notice_A00`) | Send notice → **Supplier: acknowledge** → End | The app | A message that needs an acknowledgement (change-request outcome, scope change). Not used for cancellation or closure: those go by e-mail, so no supplier task is left open |
| P6 | **CIQP Change Request** (`CIQP_Change_Request_A00`) | Submit change request → End (**no portal step**) | **The supplier** | A correction, change notice or post-release attempt. It completes at once; triage and assessment happen in the app |
| P7 | **CIQP Help Article** (`CIQP_Help_Article_A00`, Form) | — | Kissflow builders | 5 supplier guides, marked draft text for Beiersdorf review. One was updated for v3 (follow-up questions are new rounds) |

**Step field rules (verified by read-back):**
- At Start every field is Editable, except the supplier's answer fields, which are ReadOnly at Start.
- At each supplier step only that step's answer fields are Editable:

  | Step | Editable | Mandatory |
  |---|---|---|
  | Supplier: fill in section | `Answers_JSON`, `Answers_Rev`, `Answers_Changed_At/_By_Email`, `Editing_By/_Since`, `Supplier_Responsible_Email`, `Section_Done`, `Uploads` | `Section_Release_Confirm` |
  | Supplier: respond | `Response_Text`, `Response_Doc_Refs_JSON`, `Supplier_Responsible_Email` | `Response_Kind` |
  | Both confirmations | — | `Supplier_Confirm`, `Confirmed_By_Name/_Email/_Role/_At` |
- **Required fields.** `Required = true` is read back on every flow:
  - `Supplier_Code` on all processes;
  - `Assigned_Contacts` and the app twin id on every process except CIQP Change Request;
  - `Supplier_Justification` (query) and `Change_Reason` (change request).
- **Refusal smoke-tested** for: `Assigned_Contacts`, `App_Case_Item_Id` and `Supplier_Code` on CIQP Request; `App_Notice_Item_Id` on Notice; `Supplier_Justification` on Query; `Change_Reason` on Change Request.

## Roles (verified: exactly Admin, Supplier, User)

| Role | ID | Members | Use |
|---|---|---|---|
| **Supplier** | `RoEK4XPKXCvH` (the old "CIQP Supplier Contact", renamed in place) | 0, until Thomas invites the supplier users | Every external user |
| Admin (default) | `RoEK3_yhR4wx` | Thomas | Kissflow builders only. Raises items until the integrations take over, and is the manual fallback |
| User (default) | `RoEK3_ymADTV` | 0 | No grants |

The nine Beiersdorf roles were deleted: CIQP BDF RMM, Case Admin, Regulatory, Safety, QM, Microbiology, Sustainability, Reader, and CIQP Integration Service. Each delete returned 200 and the role list was read back.

## Grants (read back: Role and Permission match; no other role holds membership)

| Flow | Supplier | Admin |
|---|---|---|
| CIQP Request, Section, Query, Completeness Confirmation, Final Release, Notice | Member [] (read back). That it stops suppliers from creating items is **unverified** (MT-3): with the admin key, `[]` still allowed it | Member [InitiateItems, View] |
| CIQP Change Request | Member [InitiateItems] | Member [InitiateItems, View] |
| CIQP Help Article (Form) | Viewer | Member [Delete] |

The rebuild removed 35 Beiersdorf-role memberships, all with status 200 (`build-requests.jsonl`, 04:25:46–04:26:16 UTC).

## Lists

| List | Values |
|---|---|
| CIQP Yes No | Yes, No |
| CIQP Confirm | Confirmed |
| CIQP Response Kind | Answer, Document, Additional part completed, Cannot provide |
| CIQP Doc Kind | SDS, CoA, Specification, Analysis, Certificate, Statement, Other |
| CIQP Change Kind | Metadata correction, Configuration answer change, Other correction, Change notice |

- Values were read back exactly.
- **CIQP Dept Code** was deleted, because department routing lives in the app (verified absent).

## Sharing portal flows with the app (Thomas, 7 Oct)

Thomas shared the portal flows with the app, so the app can use lookups and read portal data.

**Not confirmable with our key:**
- The flow metadata shows no sharing field, and the definitions were unchanged (verified, 403/403 before the rebuild).
- Because our key is the portal Admin, every portal flow answers under the app's ID too (`sharing-probe-2026-10-07.json`; it includes the throwaway flow, which Thomas republished with the others at 04:13, so it may be shared as well). A read with the admin key therefore can't prove the sharing.

So the sharing is **unverified** until an app flow uses a portal lookup, or a non-admin app user reads portal data. Run that test first once the app exists.

## Verified platform facts used here (spikes in `spikes/`)

| Fact | Evidence |
|---|---|
| A step can be assigned from a `MultiUser` field: `Resource {ValueType:"Field", Value:<id>, Field:<id>}`. Without the `Field` attribute the submit fails. With all assignee fields empty the submit is refused ("There is no assignee for the next step") | `k04d`/`k04f-result.json` (empty-assignee refusal: k04f M3). Separately, smoke P1-requires-Assigned_Contacts shows the field is Required at Start |
| A process with **no user step** publishes; its item completes at submit; the creator still lists it in My Items and can read it | `k-no-step-result.json`; smoke P6-completes. Admin key; for a non-admin supplier see MT-3 |
| Role-assigned steps can be removed from a published process by a clean re-PUT; items still run | Before: the throwaway flow had two Admin-role steps ("Spike yes"/"Spike no", `k-select-conditions.mjs`, 21:51 UTC; Thomas republished it at 04:13). After: Start → End, publish 200, item completed (`k-no-step-result.json`). This rebuild did the same on four live flows (`build-requests.jsonl`, verify 306/306) |
| Select-based step conditions route; an unmatched value is dropped | `k-select-result.json` (no portal step uses a condition now) |
| Role rename in place keeps the id; role and list deletes work | `build-state.json` log, read back |
| A 122 KB Textarea round-trips byte-identical (160 KB in the v2 run) | `smoke-report.json` (122 KB) and `smoke-report-v2-asbuilt.json` (160 KB) |
| ~~The API key can't act on any step after Start~~ **Corrected 8 Oct** (app session, `../ciq-digital/SPIKES.md` "Night tests", `k-perm`/`k-actions-result.json`). The key acts as its user: it **can** submit, reject and withdraw a later step when that user is the step's assignee (role member). It **can't** update fields after Start (`050313` for every field, even Editable ones); only the admin route `PUT /process/2/{acc}/admin/{proc}/{item}` writes them. Send-back over the key returns 500. Step-level Mandatory is not enforced on a key submit. Field-level Required at Start **is** (smoke P1/P5/P6-requires: 400 "Value is required"). Our k04e refusal came from a 0-member role and a reused Start activity id | `k04e-result.json`; app-side evidence above |

## Open items

1. **Morning tests** (`MORNING-TESTS.md`): 14 tests with real supplier users. MT-1, MT-2, MT-3 and MT-6 are blocking.
2. **App ↔ portal integrations:** they wait for the app. The plan v3 §6 list and the review corrections are in the plan document. Spike K-09 comes first:
   - cross-container create and approve;
   - updates that respect step permissions;
   - Text → MultiUser copy of portal user ids;
   - Form triggers;
   - closing portal items;
   - action conditions;
   - send-back re-fire.

   **Files** have no automated path (plan v3 §8): the app reads them through the sharing, or the supplier UI uploads them to both sides.
3. **Sharing:** confirm it with the first app lookup (see above).
4. **Per-step switches** (send-back, reject, e-mail): MT-12 captures the setting's shape.
5. **Throwaway flow `ZZ Spike Assignee`:** still in the portal for MT-12. Archive and delete it afterwards.

## How to rebuild or re-verify

```
node kissflow-build/ciq-supplier-portal/build-portal.mjs all        # idempotent: roles (rename), lists, flows, grants, cleanup
node kissflow-build/ciq-supplier-portal/build-portal.mjs flows P1 --dry-run   # read-only: diff one flow against its live draft
node kissflow-build/ciq-supplier-portal/verify-portal.mjs           # read-only; 324 checks (draft and published fields)
node kissflow-build/ciq-supplier-portal/smoke-tests.mjs             # creates test items, then deletes them (verified)
node kissflow-build/ciq-supplier-portal/seed-morning-tests.mjs      # dry run; add --apply once the supplier users exist
```

## 15–16 Oct (night): deadlines and the final-release step (Thomas's OK; portal only, app untouched)

- **Deadlines** (`set-deadlines.mjs`, run by Thomas): CIQP Request "Supplier: fill in the CIQ" = `Supplier_Due_Date` (Thomas's own setting), reminders 7 days before + 1 day after; CIQP Query "Supplier: respond" = `Supplier_Due_Date`, reminders 2 days before + 1 day after. Recipient `Assigned_Contacts.get(0)` (the shape the builder made). PUT 200, publish 200, read back OK.
- **Final release as a step in CIQP Request** (`add-release-step.mjs`): steps now Issue request → fill in the CIQ → keep the CIQ up to date → **Supplier: give the final release** (assigned from the new MultiUser `Release_Contacts`; every field ReadOnly except `Release_By_Name` and `Release_At`, Mandatory; deadline 3 days, reminders 1 day before + 1 day after) → **GotoTask** back to "keep the CIQ up to date" when the new Text `Release_Flag` = "Reopened" → End. PUT 200, publish 200, read back OK. Backup of the previous draft: `backup-CIQP_Request_A00-draft-2026-10-15T193451744Z.json`.
- Still to do: the CIQP Final Release process is no longer needed (Supplier grant still on it); the deployed portal UI still uses CIQP Final Release for the release and must move to the step; whoever moves the request into the release step must clear `Release_Flag`, or a "Reopened" left over loops it back.
