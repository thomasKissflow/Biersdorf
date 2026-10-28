# START HERE: overnight build of the CIQ Digital app (for the "App Builder - CIQ Digital" session)

Thomas authorised an **unattended overnight build** in the Development sandbox on 2026-10-07. Build the **internal app backend**: data models, lists, roles, workflows and permissions. When something is unclear, take the recommended option, note it in `kissflow-build/ciq-digital/BUILD-LOG.md`, and keep going. Thomas reviews in the morning.

## Where you build

| What | Value |
|---|---|
| Sandbox | `https://dev-beiersdorf.kissflow.eu` ("Beiersdorf kf-dev", account `AcDOSunMEpSA`). **Never** touch the parent production account `beiersdorf.kissflow.eu` |
| Your container | **CIQ Digital**, app id `CIQ_Digital_A00`. Today it holds only the default Admin and User roles, no flows |
| Tooling | The App Builder plugin (`/app-builder:*`). If this folder isn't connected yet, run `/app-builder:connect https://dev-beiersdorf.kissflow.eu`, pick **CIQ Digital**, and paste the key only into the browser page. That step needs Thomas. If Thomas isn't there, stop and leave a note in BUILD-LOG.md |
| Not yours | The **supplier portal** `CIQ_Supplier_Portal_A00` and the **cross-container integrations** I-1, I-3 and I-6. Another session builds both over REST. **Never write to the portal.** |

## What to build

- **Source of truth:** `docs/kissflow-data-model/kissflow-data-model-plan.md`.
  - §3.2: the flow inventory A1–A30.
  - §4.4–§4.12: fields.
  - §5: lists.
  - §6.1–§6.2: CIQ Case and Review Track steps.
  - §7.1–§7.2: roles and grants.
  - §7.4: the traps.
- **Feed it in:** pass this file plus the plan to `/app-builder:author-brief`, so the brief captures the v2 overrides below and the names contract.
- **Command path:** `author-brief` → `author-plan` → `author-preview` (dry run) → `author-generate`. Skip `author-review` (nobody is awake to review it).
- **Before generating:** compare the proposed model with plan §3.2 and the contract below, and fix any drift with `author-refine`. App Builder 1.0.0 can't edit the app after generating, so get the model right first.
- **UI:** none tonight. No custom React UI and no `/app-builder:deploy`. The Workbench custom UI comes later.

### v2 requirements overrides (the BRM v2 of 6 Oct supersedes the plan where they differ; see `context/sources/02b-…`)

1. **No review version** (REQ-PROC-016).
   - **Drop A12 `CIQ Review Version` and A13 `CIQ Section Snapshot`.**
   - The supplier edits answers in the portal until the final release (PS-11). A changed value replaces the old one. Every change is traced in A27 `CIQ Audit Event`.
   - BDF roles never edit CIQ answers.
2. **The scope only grows** (REQ-CFG-008/009). A11 `CIQ Scope Run` records additions only; sections are never removed. Manual extension needs a mandatory justification and is audited (ex-REQ-CFG-007).
3. **Documents are additive** (REQ-PROC-011/029/033/034).
   - A15 `CIQ Document` has one row per uploaded file: `File_Name`, `Uploaded_At`, `Uploaded_By`.
   - **No `Doc_Version`.** References to a document use file name + upload date.
   - Suppliers can't delete documents.
4. **Internal chat** (REQ-PROC-020). A24 `CIQ Internal Note` becomes a chronological chat message per row: `Case_Code`, optional `Linked_Kind` (Section / Finding / Open point) and `Linked_Key`, `Note_Text`, author and time. It is never visible to suppliers.
5. **Section ownership is lead-only** (REQ-CFG-006). Keep the `co` list in the payload for K2.2 = Safety lead + QM co-reviewer (the acceptance criterion still mentions it), read-only.
6. **RMES** (REQ-PROC-021/022). A18 `CIQ RMES Record` is created with the CIQ project id (`Case_Code`) + timestamp, not a version. Source references point to a question, or to a document by file name + upload date.
7. **Config export** (REQ-CFG-001/003). Every published `CIQ Config Version` row keeps its `Payload_JSON`. Export is a UI feature; there's no model change.
8. **Audit** (REQ-CTL-009). A27 records the data value and the document name + upload date that each assessment was based on.

## Contract with the portal (exact names; the integrations depend on them)

| App side (you build) | Must be exactly |
|---|---|
| Process | `CIQ Case`, with steps in this order: Start "Create case" → `Part 1 – with supplier` (CIQ RMM) → `Part 2 – Beiersdorf review` (CIQ Case Sync) → `Awaiting supplier final release` (CIQ RMM, condition `Release_Path = "Yes"`) → `Overall approval` (CIQ Overall Approver, condition `Overall_Approval_Required = "Yes"`) → End |
| `CIQ Case` fields the integrations read or write | `Case_Code`, `Current_Cycle`, `Trade_Name`, `Main_INCI`, `BDF_Material_No` (X1, see below), `Portal_Request_Item_Id` (Text: the portal request's item id), `Completeness_Confirm` (Text), `Completeness_By_Name`, `Completeness_By_Email`, `Completeness_At`, `Final_Release_By_Name`, `Final_Release_By_Email`, `Final_Release_By_Role`, `Final_Release_At`, `Completion_Trigger` (Text), `Release_Path` (Text Yes/No), `Supplier_Notice_Text` (Textarea), `Overall_Approval_Required` (Text Yes/No) |
| Process | `CIQ Review Track`, with steps `Review – Regulatory`, `Review – Safety`, `Review – QM`, `Review – Microbiology`, `Review – Sustainability`, `Review – RMM` (condition `Dept_Gate = "<code>"`), then `Final decision – Safety`, `Final decision – Regulatory`, then End |
| Naming | Every app flow and list name starts with `CIQ ` (the portal uses `CIQP `). Flow and list names are unique across the whole account |
| Field-name rule | Never name a field `Name`, `Status`, `Type`, `Country`, `Priority`, `Category`, `Currency` or `Project`. Use owner prefixes (plan §4 conventions) |
| What the portal holds | `CIQP Request` (field `App_Case_Item_Id` = the CIQ Case item id), `CIQP Section`, `CIQP Query`, `CIQP Change Request`, `CIQP Help Article` |
| X1 material identity (added 2026-10-07, Thomas) | When the app creates the `CIQP Request`, it also sends `Trade_Name`, `Main_INCI` and `BDF_Material_No` from the CIQ Case (same names on both sides). The supplier UI shows them under the material name. The CIQ Case therefore needs a `BDF_Material_No` field (Text) next to `Main_INCI` |

## Roles (plan §7.1)

| Kind | Roles |
|---|---|
| Defaults | `Admin` and `User` |
| Custom (18) | CIQ RMM; CIQ Regulatory Reviewer; CIQ Safety Reviewer; CIQ QM Reviewer; CIQ Microbiology Reviewer; CIQ Sustainability Reviewer; CIQ Safety Approver; CIQ Regulatory Approver; CIQ Customs; CIQ Legal; CIQ Overall Approver; CIQ Business Admin; CIQ Config Approver; CIQ Auditor; CIQ Process Owner; CIQ Case Sync; CIQ Case Admin; CIQ Integration Service |

- Grants follow §7.2. Safety results and findings (A19/A21) are editable by Safety only; Regulatory results and findings (A20/A22) by Regulatory only.
- **No native page or card may give a read-only role access to A19–A22.** A page auto-grant would make that role an editor.
- **Don't invite users.** Thomas manages people.

## When you finish

1. Read everything back: flows, fields, steps and grants per role.
2. Write `kissflow-build/ciq-digital/BUILD-LOG.md` with:
   - what exists (flow ids, step names, role ids);
   - every deviation from the plan, and why;
   - every check that passed or failed;
   - open questions.
3. List the real ids of `CIQ Case`, its step names and the contract fields, so the portal session can wire I-1, I-3 and I-6.

## Portal as built: v3, supplier-only (7 Oct 2026, verified live; supersedes every earlier portal note in this file)

The design is `docs/kissflow-data-model/plan-v3-supplier-portal-one-role.md`; **its §5 lists what the app must change before generate**. The record is `kissflow-build/ciq-supplier-portal/BUILD-LOG.md`.

**Rules:**
- The portal has ONE role, `Supplier`. No Beiersdorf role or step exists in the portal.
- Every Beiersdorf decision is an app step.

| Portal flow | ID | Supplier step | The app twin's id it carries (required) |
|---|---|---|---|
| CIQP Request | `CIQP_Request_A00` | Supplier: submit basic data | `App_Case_Item_Id` |
| CIQP Section | `CIQP_Section_A00` | Supplier: fill in section | `App_Section_Item_Id` |
| CIQP Query | `CIQP_Query_A00` | Supplier: respond | `App_Open_Point_Id` |
| CIQP Completeness Confirmation | `CIQP_Completeness_Confirmation_A00` | Supplier: confirm completeness | `App_Case_Item_Id` |
| CIQP Final Release | `CIQP_Final_Release_A00` | Supplier: release | `App_Case_Item_Id` |
| CIQP Notice | `CIQP_Notice_A00` | Supplier: acknowledge | `App_Notice_Item_Id` |
| CIQP Change Request | `CIQP_Change_Request_A00` | none (supplier-initiated, completes at once) | — (the app twin is created from it) |

- **Every item** also carries `Case_Code`, `Cycle_No`, `Supplier_Code` (required) and `Assigned_Contacts` (MultiUser, required; the portal user ids).
- **Field lists:** `kissflow-build/ciq-supplier-portal/portal-spec.mjs`.
- **Department codes:** Dept_Code and the CIQP Dept Code list are gone from the portal. Department routing is the app's.
