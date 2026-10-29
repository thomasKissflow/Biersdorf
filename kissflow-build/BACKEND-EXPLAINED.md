# The CIQ backend, explained (status 15 Oct, 08:50 IST)

**Kissflow-internal. For Thomas. Never cite this file to Beiersdorf.** The client-facing version is `ciq-digital/BACKEND-SHOWCASE.md`.

> **29 Oct: the RMES changed.** BDF scoped it to 8 fields filled automatically from the CIQ (e-mail of 28 Oct). The app no longer records RMES criteria, results or findings, and there is no RMES refresh: the RMES rows are header-only records, the RMES tab is a read-only sheet derived from the case, and only the Safety / Regulatory decision (`RMES_Decision` on CIQ Review) gates the review (`RMES_Gaps` = decision missing). The RMES lines below describe the earlier design. See `RMES-REPLY-DRAFT-2026-10-29.md` and `prototype/src/app-live/DESIGN.md` "RMES (28 Oct)".

This note explains how the v5 backend works, and checks what is really built today. The design is `docs/kissflow-data-model/plan-v5-final.md` (cited as "plan §n").

## How to read the tags

Every claim carries one of three tags.

| Tag | Meaning |
|---|---|
| **[verified live today · Ex]** | Read from the DEV sandbox today, by my own GET or from a snapshot file written today. Ex is the evidence below |
| **[verified earlier · file]** | Proven before today. The file holds the evidence |
| **[planned / not proven]** | Designed, and sometimes coded, but never seen working in Kissflow |

"(code)" means I read the source code today. Code shows what the software will try to do. It does not prove that Kissflow accepts it.

**Evidence:**

| Key | What |
|---|---|
| **E1** | My own GETs today, 08:43–08:48 IST: 61 calls, at least 2 s apart, 0 × 429, nothing written. They covered:<ul><li>the integration lists of both containers;</li><li>one spike integration (404);</li><li>the rows of CIQ Config Version, CIQ Case Data and CIQ Mail Outbox;</li><li>one run of `ciq-supplier-portal/verify-portal.mjs`: **433/434 at 08:46**.</li></ul>The project's `verify-report.json` was left unchanged: this run's report went to my scratchpad |
| **E2** | The app session's GET-only read-back today, 08:36–08:37 IST: `ciq-digital/postgen/readback-v5-result.json` (**167 PASS, 0 FAIL, 5 WARN**), with snapshots in `ciq-digital/postgen/live-v5/` |
| **E3** | The app session's applies and walks this morning, 08:26–08:33 IST, each read back:<ul><li>`ciq-digital/v5/b2/walk-result.json`;</li><li>`v5/b3/review-result.json`;</li><li>`v5/b4/case-result.json` and `op-result.json`;</li><li>`v5/grants-v5-result.json`;</li><li>`postgen/roles-align-result.json`;</li><li>`v5/rehearsal/walks-result.json` (S-11)</li></ul> |
| **E4** | Sync service, today:<ul><li>`sync/.state/verify-ids.json` (08:40);</li><li>`sync/.state/run-log.jsonl` (08:41, the first live smoke);</li><li>my local run of `node --test kissflow-build/sync/test/`: **55/55** at 08:47 (offline, no Kissflow call)</li></ul> |
| **E5** | Night of 14 Oct:<ul><li>`ciq-supplier-portal/NIGHT-2026-10-14.md` and `spikes/s5-result.json`, `spikes/s2*-result.json`;</li><li>`ciq-digital/NIGHT-2026-10-14.md`, `v5/b1/walk-result.json`, `v5/fixer/case-attach-result.json`, `v5/b5/map-result.json`;</li><li>`MORNING-2026-10-15.md`</li></ul> |

---

## 1. The backend in one minute

- There are **two Kissflow containers**: the **portal** for suppliers and the **app** for Beiersdorf.
- People work only on the items they hold:
  - the supplier in the portal UI;
  - Beiersdorf staff in the Workbench.
- A small external program, the **CIQ Sync Service**, is the only bridge between the two containers. Every minute it:
  - copies supplier answers into the app;
  - creates the reviews, open points and portal tasks;
  - writes the audit trail;
  - writes one row per e-mail.
- **One Kissflow integration** turns each e-mail row into an e-mail.
- Beiersdorf screens read **one row per case** (CIQ Case Data), which the service keeps up to date.
- The supplier screens read **one portal item per case** (CIQP Request), which the service fills with supplier-safe copies.

---

## 2. The two containers, and why

```
 SUPPLIER PORTAL  CIQ_Supplier_Portal_A00          INTERNAL APP  CIQ_Digital_A00
 role: Supplier (external users only)             roles: RMM, 5 reviewer roles, Customs, Legal,
                                                  Business admin, Auditor, Business owner,
                                                  Case admin, Integration service
 ┌──────────────────────────────┐                 ┌───────────────────────────────────────┐
 │ CIQP Request   (the CIQ)     │                 │ CIQ Case        (backbone process)    │
 │ CIQP Query     (1 per round) │                 │ CIQ Review      (1 per dept review)   │
 │ CIQP Final Release           │                 │ CIQ Open Point  (1 per point)         │
 │ CIQP Help Article (form)     │                 │ CIQ Case Data   (read model, form)    │
 └──────────────┬───────────────┘                 │ CIQ Service Request (commands, form)  │
                │                                 │ CIQ Mail Outbox (1 row = 1 mail)      │
                │       ┌────────────────────┐    │ CIQ Audit Event, Config Version,      │
                └──────►│  CIQ Sync Service  │◄──►│ Supplier, Scope Run, RMES ×2, Note    │
                  admin │ (Node, API key,    │    └──────────────────┬────────────────────┘
                  GET/  │  every 60 s)       │                       │ row created
                  PUT   └────────────────────┘                       ▼
                                                   "CIQ Mail – send outbox mail" ──► e-mail
```

**Why two containers.** Your rule from 7 Oct (plan §1.1 R3):
- The portal holds external users only, with one role, `Supplier`.
- Portal processes have supplier steps only.
- Every Beiersdorf decision is an app step.
- Every portal item has an app twin.

So a supplier can never see an internal step, field, note or RMES result. They are not in the container the supplier logs into.

**Why a service in the middle, and no native cross-container integrations** (plan §0):
- A Kissflow integration can't loop, can't copy child rows, and can't see another container's processes.
- The service uses only routes we have tested: create + submit, the admin write, withdraw, Form create/update/list, and file attach.

---

## 3. Who does what

| Actor | Does | Where it writes |
|---|---|---|
| **Supplier contact** | Fills in the CIQ, uploads files, confirms completeness, answers questions, gives the final release, reports a change | Only its own portal items: CIQP Request, CIQP Query, CIQP Final Release |
| **RMM** | Creates the case; raises and decides own points; cancels or reactivates | CIQ Case at Start, then CIQ Service Request rows |
| **Department reviewer** | Reviews, raises and decides points, records RMES results and the decision, completes its review | Its own CIQ Review step, its own open point step, its own RMES form, Service Request rows, notes |
| **Business administrator** | Suppliers and contacts; configuration (rules, questionnaire versions, reminders) | CIQ Supplier, CIQ Config Version, Service Request rows |
| **CIQ Sync Service** (program) | Every hand-off between the containers; the read model; the audit trail; the content and recipients of every mail; reminders; the final document, PDF and seal | Both containers, through the API key: admin GET/PUT, create + submit, withdraw, Form rows, file attach |
| **Kissflow integration** "CIQ Mail – send outbox mail" | Sends one e-mail per outbox row and marks the row "Sent" | CIQ Mail Outbox (`Sent_Status`) |
| **Kissflow itself** | Routes steps, assigns tasks, enforces Required at Start | — |

**The service submits only two kinds of steps:**
- the Start of items it creates itself;
- the two "Integration service" steps of CIQ Case.

It never submits a human step [planned / not proven; code `sync/README.md`].

---

## 4. The life of one case, end to end

The fictional supplier "Solvaro" has two contacts, Elena and Ravi; the material is new. "Svc" is the sync service.

```
 RMM (app)        Svc               Supplier (portal)         Reviewers (app)        Svc
 create case ──► invite ──────────► fill in the CIQ ──► confirm ──► reviews + points ◄──► queries
                 (≤1 min)            (live scope, files)    │          │                     │
                                                            ▼          ▼                     │
                                     keep the CIQ up to date ◄──── all reviews done ──► final release
                                     (held until the end)                                    │
                                                                       PDF + seal + case End ◄┘
```

| # | What happens | Who | Container · item · step | Fields written (by whom) | What the supplier sees |
|---|---|---|---|---|---|
| 1 | **Case created** | RMM in the Workbench | App · CIQ Case · Start "Create case", then submitted | 21 Mandatory fields (`Case_Code`, material, supplier, contacts `Portal_Contact_Ids`/`Confirm_Contact_Ids`/`Supplier_Contact_Emails`, pinned `Release_Key`/`Rule_Set_Version`/`Template_Version`, …) by RMM. Then a Service Request `case.created` | Nothing yet |
| 2 | **Invitation** (H-01) | Svc, ≤1 min | Portal · new **CIQP Request**, Start submitted → "Supplier: fill in the CIQ" (assigned by field `Assigned_Contacts`). App · new **CIQ Case Data** row | Request: header, `Assigned_Contacts`, `Config_Bundle_JSON` + hash, `BDF_Set_JSON`, `Case_Contacts_JSON`, `Case_Phase_Label` = Filling in. Case: `Portal_Request_Item_Id`, `Case_Data_Item_Id`, `Case_Phase` (admin PUT). Outbox row C-01 | A task "Fill in the CIQ" and the invitation mail |
| 3 | **Filling in** (H-02) | Supplier in the portal UI | Portal · CIQP Request · "fill in the CIQ" | By the supplier: `Config_Answers_JSON`, `Answers_JSON`, `Answered_By_JSON`, `Justifications_JSON`, `Components_JSON`, `Scope_JSON`, `Requested_Docs_JSON`, `Answers_Rev` + 1. Files: `Supplier_Files` plus one `CIQP_Request_A00_Uploads` row each. Svc mirrors them to CIQ Case Data (JSON fields and child rows) and copies the files to `CIQ_Case.Supplier_Files` | Its questionnaire; sections open and close live |
| 4 | **Completeness** (H-03) | Supplier confirms; Svc reacts | Portal · the request moves to "Supplier: keep the CIQ up to date". App · the case moves to "Beiersdorf review and final release" | Supplier: `Completeness_*`, then submit. Svc:<ul><li>copies it to the case;</li><li>fixes the scope (Scope Run row);</li><li>creates one **CIQ Review** per in-scope department + RMM;</li><li>creates the RMES rows for SAF/REG;</li><li>sets `Case_Phase` = Review and the label "With Beiersdorf".</li></ul>Mails C-02, C-03 | The same request, still editable ("keep it up to date") |
| 5 | **Question** (H-04) | Reviewer raises (a Service Request `op.raise`); Svc creates | App · new **CIQ Open Point** at "Open point – <Dept>". Portal · new **CIQP Query** at "Supplier: respond" | Point: question, reference, `Raised_By_User`, `Thread_JSON`. Query: question, justification, due date. Request: `Questions_History_JSON`. Review: `Open_Count` + 1. Mail C-04 | A question task and a mail |
| 6 | **Answer** (H-05) | Supplier answers; Svc copies | Portal · the CIQP Query completes. App · the open point gets `Response_*`, `OP_Progress` = In progress | Supplier: `Response_Kind/Text/Doc_Refs_JSON`. Svc: admin PUT on the point. Mail C-05 to the raiser | The question moves to its history |
| 7 | **Decision** (H-06) | Raiser: accept, return, not accepted, edit or close | App · the open point's step (accept/close = the raiser's own submit with `OP_Outcome`) | Return or edit after an answer = a **new round**, so a new CIQP Query. Mails C-06…C-09 | A new round, or the point shown as closed |
| 8 | **Review done** (H-08) | Reviewer submits its own CIQ Review step | App · CIQ Review → End | `Review_Confirm`, `Completed_*`, `RMES_Decision` (SAF/REG). Svc updates `Tracks_JSON` | Nothing |
| 9 | **Release requested** (H-08) | Svc, when every review is done | Portal · new **CIQP Final Release** at "Supplier: release", assigned to the contacts who may confirm | Case: `Portal_Release_Item_Id`, `Case_Phase` = Awaiting final release. Mail C-11 | "Give the final release" |
| 10 | **Final release** (H-11) | Supplier releases; Svc closes | Portal · the release completes. App · the case completes | Svc:<ol><li>copies the release to the case;</li><li>writes `Final_Document_JSON` + `Final_Document_Hash` on Case Data;</li><li>renders the PDF and attaches it to `CIQ_Case.Final_PDF`;</li><li>sets `Request_Locked` = Yes, label Completed;</li><li>submits the case to End.</li></ol>Mails C-13, C-14 | The CIQ read-only, with "Report a change" |
| 11 | **After** (H-16) | Supplier reports a change | Portal · the request (still at the keep step) | Supplier: `Change_Report_Text/Rev/By/At`. Svc: a `Change_Reports` row (CR-NNNN) on Case Data and a receipt in `Change_Reports_JSON`. Mail C-17 | Its report with a receipt number |

**Side paths:**
- Cancel and reactivate (H-12, H-13) are Service Requests. The service withdraws or re-creates the open items and locks or unlocks the request.
- Late sections and reopened reviews (H-07, H-09) withdraw the release task (H-10) and send the case back to Review.

**How much of this has run live.** Each piece has been tried on its own:
- the case steps, walked to Completed [verified earlier · E5 `v5/b1/walk-result.json`];
- the open point steps, walked [verified live today · E3 `b2/walk-result.json`];
- portal create, admin write and withdraw [verified earlier · E5 `s5-result.json`];
- file attach [verified earlier · E5 `s2*-result.json`, `case-attach-result.json`].

The whole chain, driven by the service, has **not run yet** [planned / not proven]. See §9.

---

## 5. How the supplier reads data in the portal

**One item per case.** Each case has exactly one **CIQP Request** item, "the CIQ".
- It is assigned through its MultiUser field `Assigned_Contacts`, both at "Supplier: fill in the CIQ" and at "Supplier: keep the CIQ up to date" [verified live today · E1 verify-portal: "assignee = field Assigned_Contacts" PASS on both steps].
- Only the named contacts get the task.
- The Supplier role is `Member []` on the three processes [verified live today · E1]. Whether `[]` really stops a supplier from starting items is S-7 [planned / not proven].

**How the portal UI reads it** (code: `prototype/src/portal/data/LiveSupplierStore.tsx`, `client.ts`):
1. It lists the contact's open tasks through the SDK's **My Tasks**, one list per supplier step, using the activity filter:
   - request "fill";
   - request "keep";
   - query "respond";
   - release "release".
2. It reads each item in full with **`getItem({instanceId, activityInstanceId})`**, through that task's activity instance. A process item can't be read in full without it [verified earlier · plan P4].
3. It maps the fields to the prototype's screens (`map.ts`), in the case's pinned configuration (`bundle.ts`).

**"Participated" is broken platform-wide** [verified earlier · plan P4, "proven broken"]. A supplier would lose sight of a request once its last task ended. So the request never ends:
- after completeness it waits at "keep the CIQ up to date";
- the Mandatory formula `Keep_Open_Gate` (always blank) stops a native "Submit" from ending it [verified live today · E1, field present; that native Submit is really refused is [planned / not proven]].

Kissflow therefore shows the request "in progress" forever. Our UI shows the real phase.

**What the supplier sees is a copy, written by the service** (supplier-safe only):

| Field on CIQP Request | Holds | Written by |
|---|---|---|
| `Config_Bundle_JSON` + `Config_Bundle_Hash` | The case's pinned questionnaire + rules (no internal notes, no rule basis), about 23 KB | Svc at Start |
| `BDF_Set_JSON` | The values Beiersdorf sets, shown locked (trade name, supplier, DUNS, contact e-mails, markets) | Svc |
| `Case_Phase_Label` | Filling in · With Beiersdorf · Awaiting your final release · Completed · Cancelled | Svc |
| `Questions_History_JSON` | Every question's supplier-visible thread, kept after its query items end | Svc |
| `Change_Reports_JSON` | Receipts of "Report a change" | Svc |
| `Release_By_Name/At`, `Request_Locked`, `Manual_Scope_JSON` | The release copy, the lock, the sections a department added | Svc |
| `Answers_JSON`, `Scope_JSON`, `Components_JSON`, … | The supplier's own answers | Supplier |

All these fields exist and are published [verified live today · E1, verify-portal]. They are ReadOnly for the supplier at both steps [verified earlier · E5 portal night log 22:50]. The service writes them through the admin route [verified earlier · E5 S-5 14/14].

**The supplier never reads an app item.** The portal can't read app forms, and no sharing is used (plan §7, §11.3).

**The other supplier items:**
- **Questions:** one **CIQP Query** per round, at "Supplier: respond".
- **Final release:** one **CIQP Final Release**, at "Supplier: release" [verified live today · E1, steps and field assignee].

**Files:**
- Every upload is added to the request's Attachment field `Supplier_Files`. One field holds them all, side by side; by API key an upload adds and never replaces [verified earlier · E5 S-2c].
- Each upload gets one `CIQP_Request_A00_Uploads` row (section, field or `EV:` key, kind, name, who, when, `Upload_Attachment_Id`) [verified live today · E1, child table and columns present].
- The supplier's own upload through the custom UI is **S-1** [planned / not proven].

**Today the portal UI is still the 7 Oct bundle.**
- The v5 UI (zip `ciq-portal-ui-14ec6b266f`) is built and tested locally but **not deployed** [verified earlier · `ciq-supplier-portal/deploy-report.json` 7 Oct; E5 MORNING brief].
- So no supplier can use the v5 model yet.

---

## 6. How the app (Workbench) reads

**The problem.** People can list only the process items they started or hold a task on. "Participated" is broken, and the REST process list is `/myitems` only (plan P4, P5). An RMM therefore can't list "all cases".

**The answer: CIQ Case Data,** one Form row per case.
- A Form lists all its rows for its Viewers.
- Every internal role is a Viewer; the service is the only Member and so the only writer [verified live today · E2 `members.CIQ_Case_Data_A00.json`].
- That a real non-admin Viewer can list the rows is S-7 [planned / not proven].

| Group | What the row holds |
|---|---|
| Summary for lists and dashboards | Supplier, material, owner, `Case_Phase`, due date, versions |
| Supplier data | `Answers_JSON`, `Scope_JSON` (with internal detail), … |
| Work summaries | `Tracks_JSON` (one entry per CIQ Review), `Open_Points_JSON`, `Confirmations_JSON` |
| Final document | `Final_Document_JSON`, `Final_Document_Hash`, `Final_PDF` |
| Child tables | Components, Documents, Requested_Documents, Change_Reports |

**What stays out of the row:**
- nothing role-restricted goes in: no RMES results, no note text, no decision reasons;
- RMES stays in the two RMES forms, visible to their own department and the Auditor only [verified live today · E2 members].

**What else the Workbench reads:**
- its own task items: "My reviews" (CIQ Review) and own open points;
- Config Version, Supplier, Internal Note and Audit Event rows.

It never reads portal items. Only the service does, with the admin GET.

**How the Workbench acts.** It writes a **CIQ Service Request** row, for example `op.raise`, `case.cancel` or `review.reopen`. The service then:
- takes "who asked" from the row's platform `_created_by`, never from the payload;
- checks the role and the prototype's own guards;
- acts, and writes `Request_Status` (Done · Refused · Failed) and an audit row.

**Today:**
- The Case Data form exists with all 43 header fields and 4 child tables [verified live today · E2]. It has **0 rows** [verified live today · E1], because the service has not run live yet.
- The live Workbench is still the **9 Oct v4 bundle** [verified earlier · `ciq-digital/STATUS-2026-10-14.md` §1.4]. It knows nothing of v5.
- The Workbench rework onto Case Data and Service Requests is planned: app session, about 4–5 days [planned / not proven].

---

## 7. The mail path

```
 any handler ──► CIQ Mail Outbox row ──(Dataform "item created")──► Email "Send an email"
 (Svc builds      Mail_Key, To_Emails,                              To ← To_Emails
  recipients,     Subject, Body_Text,                               Subject ← Subject
  C-00 whitelist) Event_Code, …                                     Body ← Body_Text
                                                      └──► Dataform "Update an item": Sent_Status = "Sent"
 no "Sent" after 10 min → Svc writes Mail_Key#2, then #3, then dead letter (Workbench Diagnostics)
```

- **One integration for both directions.** This is your R-1 "one generic e-mail integration". The open-point events C-04…C-09 are the "point raised / answered" mails.
- **Supplier mails** use only whitelisted facts, and no internal mail ever goes to a supplier. This lives in the service's mail builder, which uses the prototype's texts (code `sync/mail.mjs`).
- **Status:**
  - built and bound [verified live today · E2: trigger ItemCreated + SendEmail + UpdateAnItem, 7 bindings];
  - **OFF**, never run (`ExecutedCount` 0), and the outbox has 0 rows [verified live today · E1].
- **Proven pieces:** a Form trigger fires an integration in about 6 s [verified earlier · plan §4.6].
- **Not proven (S-3):**
  - the Email action with a field-mapped `To`;
  - action 2 writing `Sent_Status`.

  Switching it on is builder-only and sends one sample mail [verified earlier · plan P6].

---

## 8. The integrations we need

### 8.1 The one Kissflow integration

| Name | Purpose | Trigger | Source → target | Built | Proven |
|---|---|---|---|---|---|
| CIQ Mail – send outbox mail | Send every e-mail | Dataform "item created" on CIQ Mail Outbox | Outbox row → e-mail; then the same row's `Sent_Status` | Yes, **OFF** [verified live today · E1, E2] | Trigger pattern [verified earlier]; Email action + write-back = S-3 [planned / not proven] |

**Integrations that must not run:**
- Z1, Z2: empty shells, OFF [verified live today · E1].
- The two "CIQ ZZ Spike log" integrations:
  - at 08:36 they were listed ON [verified live today · E2];
  - at 08:43 they were no longer listed, and a GET of one returns 404 [verified live today · E1].

  So they were removed this morning, presumably in the builder [planned / not proven who].
- **Portal integrations: none,** and none are planned [verified live today · E1: 0 listed].

### 8.2 The sync service handlers (H-00…H-21)

How the service finds work:
- **request:** a new CIQ Service Request row (Form list, every 60 s);
- **poll:** the admin GET of the portal items whose ids it stored (every 60 s; closed cases every 15 min);
- **hourly:** the hourly timer;
- **note cursor:** new CIQ Internal Note rows.

| H | Purpose | Trigger | Source → target | Direction |
|---|---|---|---|---|
| H-00 | Check every request (who asked, role, guards); refuse, or dispatch; audit | request | Service Request → status + Audit Event | app → app |
| H-01 | Start a case: read model, portal request, invitation | request `case.created` | CIQ Case → CIQ Case Data (new) + CIQP Request (new) + case fields | app → portal |
| H-02 | Mirror supplier saves; recompute scope; copy files | poll: `Answers_Rev` changed | CIQP Request → CIQ Case Data (+ files → `CIQ_Case.Supplier_Files`) | portal → app |
| H-03 | Completeness: fix scope, create reviews and RMES rows, move the case | poll: request at "keep the CIQ up to date" | CIQP Request → CIQ Case, CIQ Review (new), RMES, Scope Run | portal → app |
| H-04 | Raise an open point | request `op.raise` (or a system point) | → CIQ Open Point (new) + CIQP Query (new) + `Questions_History_JSON` | app → portal |
| H-05 | Supplier answered | poll: CIQP Query completed | CIQP Query → CIQ Open Point | portal → app |
| H-06 | Raiser accepts, returns, rejects, edits or closes | request `op.*` | → new query round, query edit or withdraw; point fields | app → portal |
| H-07 | Scope grew in Part 2 | from H-02 | → Scope Run, review reopen, system point | portal → app |
| H-08 | Review done; all done → ask for the release | poll of the review item + request `review.completed` | CIQ Review → CIQP Final Release (new) | app → portal |
| H-09 | Reopen or late activation | request `review.reopen` / H-07 | → new CIQ Review | app → app |
| H-10 | Withdraw the release request | from H-07/H-09 | → CIQP Final Release withdrawn; label | app → portal |
| H-11 | Final release: document, seal, PDF, lock, end | poll: CIQP Final Release completed | CIQP Final Release → CIQ Case + Case Data; PDF → `Final_PDF`; request lock | portal → app (+ portal lock) |
| H-12 | Cancel | request `case.cancel` | → withdraw queries, release, reviews, points; lock | app → portal |
| H-13 | Reactivate (≤ 365 d) | request `case.reactivate` | → re-create reviews and release; unlock | app → portal |
| H-14 | Reassign a review | request `review.reassign` | → CIQ Review assignee; system points follow | app → app |
| H-15 | A department adds a section | request `section.add` | → `Manual_Scope_JSON`, reviews, system point | app → portal |
| H-16 | Change report | poll: `Change_Report_Rev` changed | CIQP Request → Case Data `Change_Reports` + receipt | portal → app |
| H-17 | @mention mails | note cursor | Internal Note → outbox | app → mail |
| H-18 | Supplier contact changed | request `supplier.changed` | CIQ Supplier → `BDF_Set_JSON`, `Assigned_Contacts` on open portal items | app → portal |
| H-19 | Reminders and escalations | hourly | Config "Reminders" row → outbox | app → mail |
| H-20 | "Run reminders now" | request `reminders.run` | as H-19 | app → mail |
| H-21 | RMES refresh after a Part 2 change | from H-02/H-07 | → RMES rows, SAF/REG reopen | app → app |

**Status of all 22 handlers:**
- **Coded and tested offline:** every handler is in `kissflow-build/sync/` (catalogue `handlers/index.mjs`). The 55 tests run against an in-memory fake of both containers and all pass [verified live today · E4, 55/55 at 08:47]. One earlier run showed 29 failures while the portal session was editing files. The two re-runs both gave 55/55.
- **Ids:** `--verify-ids` found all 17 flows, with 0 missing fields or tables [verified live today · E4].
- **Live:** the first live run was a smoke at 08:41 today, an unknown request code expected to be refused. Its audit-row create failed with HTTP 400: "The date/time 2026-10-15T03:11:04.453Z is invalid" (milliseconds). The request was left Failed, attempt 1 of 3 [verified live today · E4 `run-log.jsonl`]. **No handler is proven live yet** [planned / not proven].

### 8.3 Release → final document → PDF → attach (AS-12)

- **AS-12 asked for:** a webhook on the release, then an external script makes the PDF, then the PDF is attached, with no RMM click.
- **v5 does the same without a webhook** (H-11). The service sees the completed CIQP Final Release within a minute, then in this order:
  1. writes `Final_Document_JSON` and the seal (SHA-256 of the canonical JSON) to CIQ Case Data;
  2. renders the PDF (`sync/pdf.mjs`, a pure-JS writer);
  3. attaches it to `CIQ_Case_A00.Final_PDF`;
  4. writes `Final_Document_Hash/At`;
  5. only then submits the case to End.
- **Attaching by key** to `Final_PDF` (and `Supplier_Files`) on an in-progress case works, even though the field is ReadOnly at the step [verified earlier · E5 `v5/fixer/case-attach-result.json`, 12/12].
- **The full H-11 chain** on a real release [planned / not proven].

### 8.4 Reminders

- **H-19 runs hourly** from the "Reminders" configuration row:

  | Reminder | When | Escalation |
  |---|---|---|
  | rem-1, supplier task not started | 7 d | RMM after 14 d |
  | rem-2, question unanswered | 5 d | 10 d |
  | rem-3, review idle | 5 d | 10 d |
  | rem-5, final release pending | 3 d | 7 d |

  Each reminder has an idempotency key, so none is sent twice.
- **The row is seeded** [verified live today · E1, `REM:current` Published].
- **The handler** is coded and tested offline [verified live today · E4]. It has not run live [planned / not proven].
- **Native Kissflow SLAs are not used:**
  - none on the case's service step (plan amended 15 Oct, V-35) [verified live today · E2];
  - none found on the CIQ Review steps either [verified live today · E2 snapshot `CIQ_Review_A00.draft.json`], although plan §4.2 still says "rem-3: 5 d";
  - the portal spec sets none on CIQP Final Release, although plan §3.3 says "rem-5 (3 days)".

  See gap G-8.

### 8.5 Optional client-facing patterns (**not in the MVP**)

| Pattern | Idea | Status |
|---|---|---|
| **Vendor-master endpoint** (bulk suppliers and contacts) | SAP or Beiersdorf's integration platform upserts CIQ Supplier + Contacts by business key, never deletes, then files `supplier.changed`. Three options:<ul><li>A: direct REST;</li><li>B: a thin `PUT /vendors/{code}` / `POST /vendors:batch` endpoint next to the service;</li><li>C: a "Webhooks by Kissflow" trigger + Dataform action (header only; no child rows)</li></ul> | Pattern only. The Form create/update routes are tested; B and C are not built [planned / not proven] |
| **Automatic portal user for a new contact** | A contact row is added → a webhook or the service invites the e-mail as a portal user in the Supplier role → writes `Contacts_Portal_User_Id` → the service puts the user into `Assigned_Contacts` | Pattern only. The invite API for external users is untested. MVP: you invite by hand [planned / not proven] |
| **Final-document webhook to DMS/Teamcenter** | CIQ Case "item completed" → HTTP action posts `{caseItemId, Case_Code}` → the receiver reads `Final_PDF` and checks the seal | Pattern only. The "item completed" trigger fires in about 6 s [verified earlier · plan §13]; the HTTP action is not built [planned / not proven] |

**Retired:** the planned X/Y cross-container integrations and spike K-09. The service replaces them (plan §0).

---

## 9. Sanity check: plan v5 against the live sandbox

### 9.1 App `CIQ_Digital_A00`

| Object | Plan v5 | Live today | Result |
|---|---|---|---|
| **CIQ Case** (process) | 4 steps; 2 service steps owned by Integration service; +19 fields incl. `Supplier_Files`; Start 21 Mandatory / 11 Editable; ~81 unused fields Hidden | Exactly that: 144/144 published, Hidden at all 4 steps, in-use fields ReadOnly at the service steps [verified live today · E2]. A ZZT case walked to Completed on 14 Oct [verified earlier · E5] | **OK** |
| **CIQ Review** (process, new) | 30 fields, `Review_Gate`, 6 role steps conditioned on `Review_Dept`; SLA "rem-3: 5 d" | Created 08:28 today. 30 fields, 4 Required, formula, 6 owners + conditions [verified live today · E2, E3]. No SLA; **no item walked yet** | **OK**; small gaps G-8, G-9 |
| **CIQ Open Point** (process) | "Waiting for supplier" removed; 6 steps renamed "Open point – <Dept>"; +5 fields; `Open_Num` fix; `OP_Dept` Required; unused Hidden | All PASS [verified live today · E2]. 2 ZZT points walked to Completed (REG accepted, RMM not accepted) [verified live today · E3] | **OK**. Field assignment to the raiser (V-19 b) not applied: G-5 |
| **CIQ Case Data** (form, new) | 43 header fields + 4 child tables; `Sync_Note` Textarea | PASS [verified live today · E2]; 0 rows [verified live today · E1] | **OK** (empty until the service runs) |
| **CIQ Mail Outbox** (form, new) | 12 fields | PASS [E2]; 0 rows [E1] (both verified live today) | **OK** |
| **CIQ Service Request** (form, new) | 10 fields incl. `Attempt_No` | PASS [verified live today · E2] | **OK** |
| **CIQ Supplier** | +`Supplier_City`, `Contacts_Key/Title/Deactivated_At` | PASS [verified live today · E2] | **OK** |
| **CIQ Config Version** (seeded?) | RS-2026.1 + v1 Published; RS-2026.2 + v2 Draft; 6 singleton rows | **Seeded:** 13 rows = the 12 seed rows (3 Published + 3 Draft + 6 singletons) + 1 old test row "ZZT-1008-1843-G-CFG" (Settings, Draft) [verified live today · E1] | **OK**. The test row is Draft, so the service ignores it (code `config.mjs`) |
| **CIQ Scope Run** | unchanged | fields match the service [verified live today · E2] | **OK** |
| **RMES Safety / Regulatory** | +`Findings_Key`; own department only + Auditor | PASS; grants: own reviewer role Member, Auditor + Case admin Viewer, service Member [verified live today · E2] | **OK** |
| **CIQ Internal Note** | +2 mention fields | PASS [verified live today · E2] | **OK** |
| **CIQ Audit Event** | written by the service only; +3 categories | Lists PASS; every person Viewer, Integration service Member [verified live today · E2] | **OK** |
| **Lists** | 5 new, 3 extended (old values kept) | 8/8 PASS [verified live today · E2] | **OK** |
| **Roles** (renames) | 11 D38 names; Overall approver retired | 9 exact. "Case administrator" and "Integration service" lack "(technical)". "Overall approver" still exists, with 1 member (you) and no grants [verified live today · E2, E3] | **GAP G-6** (cosmetic + your call) |
| **Grants §6** | 15 flows; Form "Edit" = Member without Delete | Applied 08:28. The re-check finds 0 changes on all 15 flows [verified live today · E2, E3] | **OK**. Whether Members without Delete can still create rows = S-6 |
| **Integration: CIQ Mail** | built, then ON (S-3) | Live, **OFF**, never run [verified live today · E1] | **GAP G-2** |
| **2 × CIQ ZZ Spike integrations** | switched off | Gone (404) [verified live today · E1] | **OK** |
| **Z1 / Z2 shells** | stay OFF | OFF [verified live today · E1] | **OK** |
| **Not used:** CIQ Section, CIQ Change Request | Case admin only | Case admin only [verified live today · E2] | **OK** |
| **Workbench custom UI** | v5 rework on Case Data + Service Requests | Still the 9 Oct v4 bundle [verified earlier · STATUS-2026-10-14 §1.4] | **GAP G-4** |

### 9.2 Portal `CIQ_Supplier_Portal_A00`

`verify-portal.mjs` passes **433/434** at 08:46 today [verified live today · E1].

| Object | Plan v5 | Live today | Result |
|---|---|---|---|
| **CIQP Request** | 16 kept fields + v5 header fields; child `CIQP_Request_A00_Uploads` (+`Upload_Attachment_Id`); `Supplier_Files`; steps Issue request → fill in the CIQ → keep the CIQ up to date → End; both supplier steps field-assigned | All present and published; steps in order; both steps `Assigned_Contacts` [verified live today · E1]. Service writes at both steps [verified earlier · E5 S-5] | **OK** |
| **CIQP Query** | +`Edited_At`, `Edit_Note`; "Supplier: respond" field-assigned | PASS [verified live today · E1] | **OK** |
| **CIQP Final Release** | "Supplier: release" field-assigned; SLA rem-5 (3 d) | Step and assignee PASS [verified live today · E1]; no SLA in the spec | **OK**; small gap G-8 |
| **CIQP Help Article** | 9 FAQs rewritten; Supplier Viewer | Viewer PASS [verified live today · E1]; 9/9 rows matched on 14 Oct [verified earlier · E5] | **OK** |
| **5 unused flows** (Section, Completeness Confirmation, Notice, Change Request, ZZ Spike Assignee) | no Supplier grant | Isolation PASS: no Supplier access, no step owned by a role [verified live today · E1] | **OK** |
| **Roles** | Supplier (external users only), Admin, User | Exactly these 3. **Supplier has 1 member: you** (the one FAIL) [verified live today · E1] | **GAP G-7** |
| **Grants** | Supplier `Member []` on Request, Query, Final Release; Viewer on Help | PASS [verified live today · E1] | **OK** (does `[]` stop starting items? S-7) |
| **Portal integrations** | none | 0 [verified live today · E1] | **OK** |
| **Portal custom UI** | v5 one-item UI with S-1 Diagnostics | Built (`ciq-portal-ui-14ec6b266f.zip`), **not deployed**; live is the 7 Oct bundle [verified earlier · `deploy-report.json`, E5] | **GAP G-3** |

### 9.3 Sync service

| Item | State | Result |
|---|---|---|
| Code, 22 handlers, one rules engine (the prototype's domain code bundled) | Built [verified earlier · E5; code] | OK |
| Tests | 55/55 offline [verified live today · E4] | OK |
| Ids against live | 17/17 flows, 0 missing fields or tables [verified live today · E4] | OK |
| Configuration seed | Imported, 13 rows [verified live today · E1] | OK |
| Live run | First smoke 08:41: audit write refused (DateTime with milliseconds) [verified live today · E4] | **GAP G-1** |
| Raiser field assignment | H-04 does not write `Raiser_Assignee` (code `reconcile.mjs`) | **GAP G-5** (only if V-19 b is applied) |
| Hosting and identity | Your Mac; the key acts as you; the Integration service role holds only you [verified live today · E2] | **GAP G-10** (UAT) |

---

## 10. Gaps, what closes each, and who

| # | Gap | What closes it | Owner |
|---|---|---|---|
| **G-1** | The service has not run live successfully. Its first smoke failed on an audit-row date with milliseconds | Write DateTimes without milliseconds in the audit write (as `seed-import.mjs` already does); re-run the smoke; then run one ZZT case end to end with `CIQ_SYNC_LIVE=1` | **Portal session** (running the smoke now) |
| **G-2** | The mail integration is OFF; S-3 is unproven | Switch it ON in the builder (one sample mail goes out). Then one harmless outbox row to yourself: check the `To` mapping and that `Sent_Status` = Sent leaves the other fields intact | **You, in the builder**; then the portal session checks the row |
| **G-3** | The v5 portal UI is not deployed, so S-1 can't run | Your OK → deploy `ciq-portal-ui-14ec6b266f.zip` → your S-1 Diagnostics clicks (about 10 min) | **You + portal session** |
| **G-4** | The Workbench is the 9 Oct v4 bundle. No screen can create a v5 case, file a Service Request or read Case Data | The Workbench rework (about 4–5 days); until then, demo cases start by script | **App session** |
| **G-5** | Open points are role-assigned. V-19 b (raiser field assignment) is ready (`v5/b2/b2-raiser.mjs`, dry run; S-11 proven at 08:31 today) but not applied. **The service doesn't fill `Raiser_Assignee`**, so after the apply every `op.raise` would be refused ("There is no assignee for the next step") | First the service writes `Raiser_Assignee` = the raiser in H-04 (+ a test); then `node b2-raiser.mjs --apply`; then readback-v5's owner check moves to Field | **Portal session** first, then a **script you run** (app session's), then the **app session** re-reads |
| **G-6** | Two role names lack "(technical)". "Overall approver" still exists with you as member | Rename the two (optional); delete the role or remove your membership | **You** (role changes are guarded) |
| **G-7** | Only one real user. Every app role and the portal Supplier role hold just you, so S-7, S-6, S-10 and the S-5 re-routing can't be tested | Invite 2 internal + 2 supplier test users (fictional names, your plus-addresses); leave the Supplier role; then run the per-user tests | **You**, then **both sessions** test |
| **G-8** | No native SLA on the CIQ Review steps or CIQP Final Release, although plan §4.2/§3.3 still name rem-3 / rem-5 | Either amend the plan (reminders from the service only, like the case step, V-35), or set the SLAs by hand in the builder (no REST shape is proven) | **Your decision**; the session that owns the plan records it |
| **G-9** | CIQ Review is built but no item has been walked | One ZZT review per a department step (create → step → End), as was done for Open Point | **App session** |
| **G-10** | UAT readiness: the key acts as you; no host | A dedicated "CIQ Integration Service" user in the Integration service role only; choose the host (V-03) | **You** |
| **G-11** | (Small) An old ZZT "Settings" Draft row sits in Config Version | Optional tidy; it is ignored | App session, on your OK |

---

## 11. Known limits and open tests

| Test | Question | State | Fallback if it fails |
|---|---|---|---|
| **S-1** | Can a real user save through our UIs? Supplier answers, upload, submit; reviewer step writes and submit; Form rows; opening a supplier file from the Workbench | Not run: the v5 portal UI isn't deployed and the Workbench isn't reworked [planned / not proven] | Workbench: the native task form, or a Service Request applied by the service. **Portal: a blocker**; escalate to Kissflow product |
| **S-3** | Does the Email action send to a field-mapped `To`, and does action 2 write `Sent_Status`? | Not run: the integration is OFF [verified live today · E1] | HTTP → an external mailer, or the service sends the mail itself |
| **S-7** | Per-user behaviour:<ul><li>View-member reviewers get their step tasks;</li><li>Viewers list Case Data;</li><li>suppliers are isolated;</li><li>`Member []` can't start items</li></ul> | Not run: no test users [verified live today · E2, E1] | Adjust grants; document the limits for BDF |
| **S-9** | Do mail deep links reach a custom-UI route? | Not run [planned / not proven] | Links open the app or portal home, and the mail names the case |
| **S-10** | Do field-assigned portal steps send native Kissflow e-mails (duplicates of ours)? | Not run [planned / not proven] | Switch native e-mails off per step in the builder |
| S-6 | Can a Form member without Delete still create rows? | Not run (grants already applied without Delete) | Give Delete back and call the audit "tamper-evident" |
| S-11 | Can an app step be assigned from a MultiUser field? | **Proven** at 08:31 today; an empty assignee is refused [verified live today · E3] | — |
| S-2, S-5, S-8, S-12 | Files by key; portal admin writes and withdraw; sizes; parallel-block removal | **Proven** 14 Oct [verified earlier · E5] | — |

**Limits that stay by design:**
- **About one minute of delay** on every cross-container effect (the service's 60 s cycle). Mails go out about 6 s after their row.
- **The service is a single point of failure** for hand-offs, mails and audit:
  - people can still work on their own items while it is down;
  - their requests queue up and are replayed (idempotent keys).
- **No write locking in Kissflow.** Every writer reads back and re-applies up to 3 times.
- **The supplier's request shows "in progress" forever** in Kissflow (the keep-open step).
- **Thomas is every user in DEV.** Per-user rules are unproven until G-7.

---

## 12. How to re-check (read-only)

| Check | Command | Note |
|---|---|---|
| App, against plan v5 | `node kissflow-build/ciq-digital/postgen/readback-v5.mjs` | GET only, about 48 calls; overwrites its result file |
| Portal | `node kissflow-build/ciq-supplier-portal/verify-portal.mjs` | GET only, about 55 calls, **unpaced**: run it when no other session is calling the API |
| Service ids | `node kissflow-build/sync/run.mjs --verify-ids` | GET only |
| Service tests | `node --test kissflow-build/sync/test/` | Offline |
