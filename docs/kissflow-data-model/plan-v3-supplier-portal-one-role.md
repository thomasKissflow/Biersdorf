# CIQ on Kissflow, plan v3: Beiersdorf works in the app, suppliers work in the portal

> **Superseded in part by the client call of 9 Oct 2026** (`context/decisions/2026-10-09-client-call.md`). There is no RMM scope check or scope release: the supplier answers the metadata questions and sections open or close live. RMM reviews in Part 2 in parallel with the departments and completes like them. The ending is the requirements-matrix ending only: there is no overall approval and no overall approver. Where this document says otherwise, the decisions file wins.

> **INTERNAL to Kissflow.** Written 2026-10-07 after Thomas's correction; reviewed the same day by two independent checkers (facts, requirements), whose corrections are applied below.
> - **Portal:** rebuilt to this plan on Thomas's go and verified live. 306/306 read-back checks and 15/15 smoke tests pass; the record is `kissflow-build/ciq-supplier-portal/BUILD-LOG.md`.
> - **App:** not generated. Thomas starts it.
>
> Where it differs, v3 supersedes the portal and role design in `kissflow-data-model-plan.md` (§1 "Option P", §3.1, §6.1, §6.3, §7.1–§7.3).
>
> **Tags:**
> - **[verified]**: tested live in the sandbox (evidence in the BUILD-LOG).
> - **[manual]**: stated in `master.md`.
> - **[unverified]**: an assumption that a named test must settle before we rely on it.

## 1. The rules (Thomas, 7 Oct)

1. **Two user populations.** Beiersdorf staff are **app users only**. Supplier users (for example supp1 and supp2 of each supplier) are **portal users only**. A portal is an app whose users are external.
2. **The portal has exactly one role: `Supplier`.** Besides it, only the platform defaults exist: Admin, for Kissflow builders only, and User, with no grants.
3. **Portal processes hold supplier steps only.** Every Beiersdorf decision happens in the app.
4. **Every portal item has a twin in the app**, and Beiersdorf users work in the app UI only.
   - Thomas has shared the portal flows with the app, so the app can use lookups and read portal data. **[unverified]** with our admin key; to be confirmed by the first app lookup.
5. **A supplier master in the app** (`CIQ Supplier` with the supplier id, `CIQ Supplier Contact` with the portal user id) identifies which supplier a portal user belongs to.

## 2. Roles

| Container | Roles |
|---|---|
| **Portal** | `Supplier` (all external users). Admin and User defaults only. **[verified]**: exactly these three exist |
| **App** | The 18 roles of plan §7.1: CIQ RMM; the CIQ Regulatory, Safety, QM, Microbiology and Sustainability Reviewers; CIQ Safety Approver; CIQ Regulatory Approver; CIQ Customs; CIQ Legal; CIQ Overall Approver; CIQ Business Admin; CIQ Config Approver; CIQ Auditor; CIQ Process Owner; CIQ Case Sync; CIQ Case Admin; CIQ Integration Service |

## 3. Supplier master (app)

| App Form | Key fields | Purpose |
|---|---|---|
| **CIQ Supplier** | `Supplier_Code` (the supplier id, unique), `Supplier_Legal_Name`, `DUNS_Number`, `Supplier_Kind`, `Supplier_Country_Code`, SAP/Teamcenter ids, `Supplier_Active` | One row per supplier |
| **CIQ Supplier Contact** | `Contact_Full_Name`, `Contact_Email`, `Contact_Supplier` (Reference → CIQ Supplier), **`Portal_User_Id`**, `Contact_Role` (Coordinator / Quality / Regulatory / …), `Can_Confirm`, `Contact_Active` | Which supplier a portal user belongs to |
| **CIQ Case Contact** | `Case_Code`, `Contact` (Reference → CIQ Supplier Contact), `Is_Primary`, `Can_Confirm_On_Case`, `Removed_At` | Which of the supplier's users work on a case |

- **Portal user ids for integrations.** An integration copies only fields of its own trigger item **[manual]**. So every app item that creates a portal item (CIQ Case, CIQ Section, CIQ Open Point, CIQ Supplier Notice) carries **`Portal_Contact_Ids`** (Text, comma-separated). The RMM session refreshes it whenever CIQ Case Contact changes.
  - Copying a two-id Text value into the portal's MultiUser `Assigned_Contacts` is **[unverified, K-09d]**. The verified fallback is a REST create at Start with `Assigned_Contacts: [{_id}]` (smoke P1).
  - **Source field per integration** (app plan v4 rev 31, confirmed by the app session on 8 Oct). Format: Supplier-role portal user ids, comma-separated, no spaces.

    | Integrations | Source field |
    |---|---|
    | X1 | `CIQ_Case_A00.Portal_Contact_Ids` |
    | X2 | `CIQ_Section_A00.Portal_Contact_Ids` |
    | X3 | `CIQ_Open_Point_A00.Portal_Contact_Ids` |
    | X4, X5 | `CIQ_Case_A00.Confirm_Contact_Ids` (only contacts allowed to confirm) |
    | X6 and notices from a change request | `CIQ_Change_Request_A00.Portal_Contact_Ids` |

    `CIQ_Supplier_A00.Contact_Portal_Ids_Text` is a master summary and is read by no integration.
  - An empty value blocks the portal submit **[verified]**, so a case can't start until every contact has a `Portal_User_Id`.
- **Checking that a user belongs to the case's supplier.** An integration can't run this check: it can't look up or compare values **[manual]**. So the Workbench, or the sync service, computes it after the fact and **flags** mismatches to RMM. Nothing is silently ignored.
- **Onboarding** (decision §11-5). A portal user is invited by a portal Admin (today Thomas), and the id is recorded in the master. A path that BDF can run from the app is open.

## 4. Portal: as built and verified

Every supplier step is assigned from `Assigned_Contacts` (MultiUser). **[verified]** for routing, for refusal when it's empty, and that no step is owned by a role. "Any one of two contacts" is **[unverified, MT-1]**.

| Flow | Steps | Created by | For |
|---|---|---|---|
| **CIQP Request** | Issue request → *Supplier: submit basic data* → End | the app (X1) | The case header and the basic-data task (PS-03/04) |
| **CIQP Section** (+ Uploads table) | Release section → *Supplier: fill in section* → End | the app (X2), one per section **including BASIC** | Answers and uploads, editable until PS-11. A Mandatory guard field blocks an accidental submit |
| **CIQP Query** | Raise query → *Supplier: respond* → End | the app (X3), one per round | Question, document request or additional part. A follow-up is a new round |
| **CIQP Completeness Confirmation** | Request completeness confirmation → *Supplier: confirm completeness* → End | the app (X4) | PS-05 |
| **CIQP Final Release** | Request final release → *Supplier: release* → End | the app (X5) | PS-11 |
| **CIQP Notice** | Send notice → *Supplier: acknowledge* → End | the app (X6) | Messages that need an acknowledgement. **Not** used for cancellation or closure: those go by e-mail, so no supplier task is left open (REQ-PROC-049) |
| **CIQP Change Request** | Submit change request → End (no step) | **the supplier** | A correction, a "Change notice" (configuration or metadata answer changed → RMM re-derives) or a post-release attempt |
| **CIQP Help Article** (Form) | — | builders, for now | The supplier FAQ |

**Grants:**

| Flow(s) | Supplier | Admin |
|---|---|---|
| Request, Section, Query, both confirmations, Notice | Member [] | Member [InitiateItems, View] |
| Change Request | Member [InitiateItems] | Member [InitiateItems, View] |
| Help Article | Viewer | Member [Delete] |

All read back exactly. Whether `Member []` really stops a supplier from creating items is **[unverified, MT-3]**: with the admin key, any membership allowed it.

**Every portal item carries** `Case_Code`, `Cycle_No`, `Supplier_Code` and its app twin's id (`App_Case_Item_Id`, `App_Section_Item_Id`, `App_Open_Point_Id` or `App_Notice_Item_Id`). All are required at Start **[verified]**.

**Deferred, and why:**
- **Per-save items** ("CIQP Section Save") and **per-upload items** ("CIQP Document") were in the first draft. They exist only to push copies to the app. With the sharing Thomas set up, the app should read sections and uploads directly, through lookups or reads.
- They'll be added (a new flow, which is additive) only if:
  - the sharing test fails;
  - or uploads turn out to be deletable by suppliers (MT-6). Integrations can't copy child-table rows **[manual]**.

## 5. App: what must change before generate (for the app session, when Thomas starts it)

1. **CIQ Case** takes over the Beiersdorf steps:
   - Start;
   - *Waiting for supplier: basic data* (CIQ RMM; Y1);
   - **Scope check** (CIQ RMM);
   - *Waiting for supplier: completeness PS-05* (Y4);
   - **Part 2 – Beiersdorf review** (CIQ Case Sync; I-2 fan-out);
   - *Waiting for supplier: final release PS-11* (condition `Release_Path = "Yes"`; Y5);
   - Overall approval (condition);
   - End.

   RMM owns the waiting steps, so RMM can advance them by hand.
2. **CIQ Open Point becomes a Process**: Start → *Waiting for supplier* (Y3) → *Review – <dept>* ×6 → End. A Form can't become a Process later **[manual]**, so this must be decided before generate.
   - A return is a new round. Whether a send-back re-fires X3 is **[unverified, K-09/K-13]**; the fallback is a "Return" outcome routed forward.
   - ~~CIQ Open Point Round Form rows created by Y3~~ **Superseded by app plan v4:** rounds are a Rounds child table on CIQ Open Point, written by the reviewer's Workbench (integrations can't write child rows). Y3 only updates the point's scalar response fields.
   - `Return_Reason` is mandatory on a return. The reviewer keeps a supplier-safe `Thread_Text`, which X3 copies into the next round's `Previous_Rounds_JSON`.
3. **CIQ Change Request** (Process; the twin of CIQP Change Request): Start (Y6) → Triage (CIQ RMM) → *Assess – <dept>* → End. The outcome goes out through X6.
   - For a "Change notice" (configuration or metadata changed): RMM re-derives the scope, and the affected lead departments get a task. This is REQ-CFG-008 / REQ-PROC-031: *automatic = a native task to RMM and the departments*, not a silent re-derivation.
4. **Twin registers:**
   - **CIQ Section**: carries `Definition_JSON`, `Definition_Hash`, `Section_Origin`, `Portal_Contact_Ids`, and a portal lookup to its CIQP Section.
   - **CIQ Supplier Notice**: acknowledgement via Y8.
   - **CIQ Portal Link**: the ledger.
5. **Supplier master** as in §3, plus `Portal_Contact_Ids` on the X-source items.
6. **Freeze in the app (REQ-PROC-043).** Y5 copies `Final_Release_At` and each section's `Answers_Rev`. Data that arrives after it is marked "Rejected change attempt" and logged. The PDF is generated only from frozen values.
7. **Structured data (REQ-PROC-006):** A14 Components and the search mirrors are rebuilt by an app session (RMM or reviewer Workbench) when BASIC or K2.1 changes, or by the sync service.
8. **Supplier due dates on every twin**, copied to the portal items. Reminders: portal step SLAs, which builders set once (K-23), or the sync service.
9. **Unchanged:** configuration, rule sets, RMES, findings, audit, internal chat, Case Index, plus the v2 drops (A12, A13).

## 6. Integrations (the only automated bridge)

**Limits [manual]:**
- One trigger and at least one action.
- Item-level triggers only (no field-change trigger).
- The field map copies a field or a literal.
- No loops, no multi-create, no child-row copy.
- Updates need the target `_id`.
- Activation is done by a human.
- Integrations can't be deleted through the API.

**Status: all [unverified] until K-09.** Supplier-side triggers fire on completion (ItemCompleted or DraftItemSubmitted), never on "created" (a create only opens a draft).

| Id | Trigger | Action |
|---|---|---|
| X1 | App CIQ Case enters *Waiting: basic data* | Portal: create CIQP Request (BASIC is created by X2 from its own CIQ Section row). Material identity goes along: `Trade_Name`, `Main_INCI`, `BDF_Material_No` (same names as on CIQ Case; the last two added 2026-10-07, Thomas) |
| X2 | App CIQ Section created | Portal: create CIQP Section |
| X3 | App CIQ Open Point enters *Waiting for supplier* | Portal: create CIQP Query (round n). **Action condition `OP_To_Supplier = "Yes"` on the integration itself** (COH-03, app session, 7 Oct): internal kinds (Department review, Contact update, Internal review) carry "No" and must never reach the portal, and the entry trigger may fire even when the conditional step is skipped [unverified, K-09g/i] |
| X4 / X5 | App CIQ Case enters *Waiting: PS-05* / *Waiting: PS-11* | Portal: create CIQP Completeness Confirmation / CIQP Final Release |
| X6 | App CIQ Supplier Notice created | Portal: create CIQP Notice |
| Y1 | Portal CIQP Request completed | App: update CIQ Case, then Approve *Waiting: basic data* |
| Y3 | Portal CIQP Query completed | App (v4): UpdateAnItem on the CIQ Open Point found by `App_Open_Point_Id` (the point), copying `Response_Kind`, `Response_Text`, `Response_Doc_Refs_JSON` and `Round_No`, then Approve *Waiting for supplier*. Whether the connector may update after Start is **[unverified, K-09b/c]**; a key can't (app night tests) |
| Y4 / Y5 | Portal Completeness Confirmation / Final Release completed (two flows, so two triggers) | App: update CIQ Case, then Approve the waiting step |
| Y6 | Portal CIQP Change Request completed | App: create CIQ Change Request |
| Y8 | Portal CIQP Notice completed | App: update CIQ Supplier Notice (acknowledged) |
| Close | App case ends (PS-11, a department rejection with no release, manual completion, cancellation) | Portal: close every open item of the case. **Mechanism [unverified, K-09e]**: it must be operable from the app, not by a Kissflow admin |

**Spike K-09 must prove:**
- (a) cross-container trigger → action, in both directions;
- (b) Approve on an app step, which identity acts, and whether it needs CIQ RMM membership or flow Admin (COH-04), plus refusal on a wrong step;
- (c) updates respect step permissions;
- (d) copies of Text → MultiUser (two ids), Textarea (large), Date and Select;
- (e) closing or withdrawing a portal item from the app side;
- (f) Form triggers and actions through the "Kissflow Dataform" connector (`Co4mIEiAdtSb`; its metadata hasn't been read yet). If Forms can't be wired, CIQ Section and Notice become Processes, decided before generate;
- (g) action conditions (IfAction);
- (h) whether a send-back re-fires ItemEntersToStep;
- (i) whether ItemEntersToStep or ProcessStepBeforeEnter fires for a step its condition skips (COH-03). Test X3 both ways: OP_To_Supplier "No" creates no CIQP Query, "Yes" creates exactly one;
- timing note (app D15): in the app, "Open items check – before release request" always runs once, as an RMM task, before X5 fires. The X5 legs must complete that task first.

## 7. Journey and edge cases

| # | Who / where | What happens |
|---|---|---|
| 1 | RMM, app | Creates the case. The supplier and contacts come from the master. The app creates the BASIC CIQ Section row → X1 and X2 → portal request + BASIC section for supp1 + supp2 |
| 2 | Supplier, portal | Fills in BASIC, then submits the basic data → Y1 → the app case moves to Scope check |
| 3 | RMM, app | Scope check: derives, extends, releases → creates CIQ Section rows → X2 → one portal section per row |
| 4 | Supplier, portal | Fills sections, uploads → completeness confirmation (X4 → Y4) → the case enters Part 2 (I-2) |
| 5 | Departments, app | Review. Open points (X3 → response → Y3 → accept, or a new round). RMES |
| 6 | Supplier, portal | Keeps editing until PS-11. The app reads the changes (sharing). A configuration change → a CIQP Change Request "Change notice" → Y6 → RMM and departments get native tasks |
| 7 | App → portal | All departments complete → X5 final-release task → Y5 → the supplier UI submits all sections (freeze) → End → PDF |

**Edge cases:**
- **Additional part:** the department creates a CIQ Section (origin Additional) and an Open Point → X2 + X3. The supplier answers the round with "Additional part completed".
- **Cancellation and closure:** e-mail to the contacts, plus the Close action. No new supplier task.
- **Contact change:** the new contacts apply to new items. Open items need a reassign **[unverified, K-13]**.
- **Reactivation:** a new cycle creates new CIQ Section rows carrying the retained answers and definitions → X1 and X2 rebuild the supplier side.
- **Question for BDF:** the period between "all departments completed" and PS-11 (plan open decision 21).

## 8. Fallbacks if K-09 fails a part

- **Approvals (Y1, Y3, Y4, Y5):** RMM advances the waiting step by hand in the app.
  - Corrected 8 Oct (app session, SPIKES.md "Night tests"): a sync service's key **can** approve a later step when its user is in the step's role, but can't update that item's fields after Start (only the admin route can) **[verified]**.
- **Item creation and field copies:** a small server-side sync service with an API key. It can create items, set fields at create, update via admin routes **[unverified]** and admin-delete **[verified]**.
- **Files:** no automated fallback. An API key has no plain attachment upload **[manual]**. The app would read files through the sharing, or the supplier UI uploads them to both sides.

## 9. Done today vs remaining

**Done (portal, verified):**
- one role;
- 8 supplier-only flows;
- grants;
- 9 Beiersdorf roles and the CIQP Dept Code list deleted;
- smoke-tested;
- help article updated.

**Remaining:**
- the supplier-user tests (MORNING-TESTS);
- K-09;
- the app changes in §5;
- the integrations;
- the custom UIs.

## 10. Order of work

1. Supplier-user tests: MT-1, MT-2, MT-3 and MT-6 are blocking.
2. App: Thomas starts the app session with §5. The decisions above are needed before generate (Open Point and Section as Process or Form, depending on K-09f).
3. K-09: needs one throwaway flow in each container, and the app half needs Thomas's OK.
4. Integrations one by one, each tested end-to-end with real supplier users.
5. Seed a fictional supplier master and run the journey test for two suppliers. Then the custom UIs.

## 11. Decisions needed from Thomas

1. ~~Name of the single portal role~~: built as **`Supplier`**.
2. Can one portal login work for two suppliers? If yes: one CIQ Supplier Contact row per supplier, and the case decides which applies.
3. If integrations can't approve or copy something: accept a manual RMM step and/or a server-side sync service (§8)?
4. May K-09 create throwaway flows and integrations (they can't be deleted) in both containers? The app half belongs to the app session.
5. How do new supplier users get portal access in production: a portal Admin invites them, or a BDF-operable path from the app?
