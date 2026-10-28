# A1: the Details-section permission for CIQ Review and CIQ Open Point (dry run, 21 Oct)

**Kissflow-internal.** Development sandbox only. This script has written nothing.

**Status at 10:14 UTC: the change is already live.** The portal session applied it to both flows on Thomas's instruction and published them at 10:05 UTC, using its own `night-2026-10-21/section-perm.mjs` (with the back-ref). The re-run dry run reads that state:
- all 12 department steps have an Editable Details permission that is listed on the section column;
- no conflicts, and `--apply` would do **nothing**.

This script stays as the check and the fallback. The app session holds its writes on these two flows.

- Script: `section-perms.mjs`.
- Full data: `section-perms-dryrun.json` (10:14 UTC).
- Live drafts:
  - `backups/*.dryrun.2026-10-21T0955.json`: before any section permission. This is the restore point.
  - `backups/*.dryrun.2026-10-21T101431731Z.json`: as the portal session published them.

## The change

On the user route (the SDK's `updateItem`), the **section's** step permission decides which fields can be written (proven live 21 Oct). Without one, every write is refused with 050313.

Kissflow honours a step permission only when its column also lists it in `Column::Permission`, which is the back-ref the builder writes. The evidence is from CIQP Request at "keep the CIQ up to date", 21 Oct:
- at 09:51:52 UTC, the section permission with its back-ref let an `Answers_JSON` save through;
- at 09:51:59, the Uploads table's Editable permission without a back-ref was refused (050313).

So the change has 3 parts at each of the 12 department steps:
1. one Permission `{Kind: "Permission", Column: <Details>, Permission: "Editable", Activity: <step>}`;
2. its id appended to the step's `Activity::Permission`;
3. its id appended to the section's `Column::Permission`.

If an Editable section permission is already at a step without its back-ref, it gets the back-ref only. Every other permission is left exactly as it is: Thomas's 240 + 480 per-step field permissions are untouched. The script asserts this before the PUT and again on the read-back.

| Flow | Details column | Live section permissions (portal session, 10:05 UTC) |
|---|---|---|
| CIQ Review | `Column_lys1rs` | `Permission_spmvhy52ug0` … `ug5`, Regulatory → RMM |
| CIQ Open Point | `Column_waac5d` | `Permission_spmvhy4rpn0`, `rpn1`, `rpo2` … `rpo5`, Regulatory → RMM |

- Each one is the same shape as this script's, under the portal session's own ids.
- **Preflight:** 0 errors. The 2 warnings are the usual ones on the platform's SendBackToInitiator.
- **The app's writers fit:** every field the screens write at these steps is already Editable or Mandatory there. That covers:
  - open points: decide, return, edit, close, and close on cancel;
  - reviews: complete, the RMES decision (REG and SAF only), the RMM continue-after-rejection, and reassign.

  So no field permission needs to change.

## What the publish contained

- **The live draft is the 09:55 draft plus the section change, and nothing else.** A raw diff per flow shows:
  - 6 new permissions, the 6 department steps' lists, and the section column;
  - plus `PublishedAt` and `_meta_version`.
- **The 09:55 drafts equalled what v6 published on 19 Oct at 20:52 UTC.** That is the v6 backups plus their 22 (Review) and 11 (Open Point) permission changes, so the 10:05 publish carried nothing else.
- **Publish times:** 10:05:36 (Review) and 10:05:22 (Open Point), seconds after the portal session's PUTs.
- **How the script reports it:**
  - `otherThanV6` lists exactly those 6 + 7 differences, with `publishedSinceV6: yes`.
  - `besidesThisChange` (19) is the same change under the portal session's ids instead of this script's: 6 added, 6 absent, 7 lists.

## Fields this opens on the user route (the "trust fields")

These fields sit inside Details but are ReadOnly or Hidden at the step itself. Since 10:05 UTC the step's assignee can write them through REST or the SDK. The app's screens never send them. The lists are identical at 09:55 and 10:14.

**CIQ Review** (none of them Hidden):

| Steps | Fields that become writable |
|---|---|
| All six | Review_Key, Case_Code, Cycle_No, **Case_Item_Id**, Supplier_Code, Trade_Name, **Review_Dept** (the step conditions), Round_No, Activation_Kind, Activation_Reason, Activated_By_Name, Track_Status |
| Regulatory, Safety | also Rejection_Handling, Rejection_Note, Rejected_Depts_Covered (15 in all) |
| QM, Microbiology, Sustainability | also RMES_Decision, RMES_Decision_Reason, and the three Rejection_* fields (17) |
| RMM | also RMES_Decision, RMES_Decision_Reason (14) |

Some trust-relevant fields are already writable at every department step and are unchanged by this fix:
- Open_Count and RMES_Gaps, the **Review_Gate inputs** (Editable since v6);
- Review_Confirm, **Completed_By / _Name / _Email / _At**, Assignee_*, Reassign_Reason, On_Behalf_Of.

Review_Gate itself is a formula, Mandatory and computed.

**CIQ Open Point.** The same 42 fields at all six steps:
- **ReadOnly (28):**
  - OP_Key, Case_Code, Cycle_No, Supplier_Code, **Case_Item_Id**, OP_Kind;
  - **OP_Dept** (the step conditions), Raised_By_Dept, OP_To_Supplier;
  - Ref_Kind, Ref_Section_Key, Ref_Field_Key, Ref_Row_Id, Ref_Doc_Id, Ref_Doc_File_Name, Ref_Doc_Uploaded_At, Ref_Label, Ref_Internal_Key, Responsible_Dept_Label;
  - **Portal_Contact_Ids**, **Response_Kind, Response_Text, Response_Doc_Refs_JSON** (the supplier's answer as I-4 delivers it), Supplier_Responsible_Email, **Portal_Query_Item_Id** (trusted by op.edited and op.closed);
  - Raised_By_User, Raised_By_Name, **Raiser_Assignee** (assigns the department steps).
- **Hidden (14):** Internal_Justification, Internal_Due_Date, New_Section_Item_Key, Thread_Text, Awaiting_Response, Accepted_Doc_File_Name, Accepted_Doc_Uploaded_At, Reviewed_By, Reviewed_By_Email, Reviewed_At, Reviewed_Answers_Rev, Late_Decision, Late_Decision_Reason, On_Behalf_Of.
- Open_Num and Start_Gate are formulas.
- Start_Gate's inputs (OP_To_Supplier, Ref_*, Portal_Contact_Ids, Awaiting_Response …) only gate the Start step, which is not changed.

**Who can do this, and the risk:** only the step's assignee can, and these are internal Beiersdorf users (department role or raiser). The sharpest risks:
- re-routing the item by changing Review_Dept or OP_Dept;
- re-pointing the links that the hand-offs trust (Case_Item_Id, Portal_Query_Item_Id; see morning §4 item 8);
- forging the supplier's relayed answer (Response_*).

**Why they open, and the fix after the MVP:** the app flows' field permissions carry no back-ref (0 `Column::Permission` entries besides the 6 new ones). They are probably ignored on the API for that reason, rather than because of the Editable section. There are two candidate fixes:
- attach the existing field permissions to their columns (the portal session's `perm-refs.mjs` way). This is cheaper, but **untested on app flows**: prove with one ZZT item that a ReadOnly field is then refused and the screens' writes still pass;
- move these fields into a second section that is ReadOnly at the department steps (the "section layout per step").

## Child tables

- **CIQ Review:** none.
- **CIQ Open Point:** the **Rounds** table (10 fields).
  - It is a top-level table, outside Details, so the section permission does not cover it. Its own step permission is Hidden at all six department steps, with no back-ref.
  - No app screen writer (`actions.ts`) and no app hand-off script writes `Table::Rounds`, so it needs nothing.
  - On CIQP Request, an Editable table permission without its back-ref was refused (050313), even at "keep", where the section was already Editable (09:51:59 UTC). So anything that ever writes Rounds on the user route needs an Editable permission on the table column with its back-ref, tested first.

## Apply (only if the live state changes; Thomas's OK and the one-writer agreement for these two flows)

`node kissflow-build/ciq-digital/v7/section-perms.mjs [review|op] --apply [--accept-other]`

- **The run:**
  1. Re-read the draft.
  2. **Refuse if it differs from the dry-run backup**, or if the plan differs from the dry run's (re-run the dry run in that case).
  3. **Refuse if the draft holds other differences from what v6 published** (`otherThanV6`), because a publish would publish them too. `--accept-other` overrides this once they have been reviewed.
  4. Back up. Backup names run to the millisecond and are never overwritten.
  5. PUT (meta.mjs `putDraft` guard).
  6. Publish.
  7. Read back:
     - the draft's `PublishedAt` must move;
     - the 6 section permissions must be Editable with their back-ref, in the draft and in the published Blob of the publish answer;
     - every existing permission must be kept;
     - the server must have made no other change to the PUT draft.
- **A publish that failed after the PUT** (an error, a timeout or a stop) leaves `pending/<flow>.json`. The next `--apply`, after a fresh dry run, publishes that very draft instead of answering "nothing to add".
- **Guards:** one call every 3 s, no retries, and it stops on a 429 or an HTML answer.
- **Tested offline** against a fake server: 73 checks in 13 scenarios. They cover:
  - the happy path, then a run with nothing to do;
  - a refusal on drift;
  - recovery after a failed publish, after a PUT that landed but timed out, and after a publish that changed nothing;
  - the refusal on other changes, and `--accept-other`;
  - a read-back failure that stops before the next flow;
  - two backups in the same minute;
  - an existing permission with no back-ref, which gets the back-ref only;
  - the portal session's shape, which gives nothing to do.

## Open points

1. **Prove the live state at a department step.** Edit one ZZT open point at "Open point – …" and expect 200. The user-route proof so far is on CIQP Request only.
2. **Hidden inside an Editable section** is presumed writable like ReadOnly. Only ReadOnly was proven.
3. **The Start steps are untouched.** The create route keeps ReadOnly and Hidden fields there anyway (morning §4 item 8).
