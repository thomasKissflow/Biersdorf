# Kissflow capability fact sheet for the CIQ v5 build (Kissflow-internal)

Compiled 2026-10-14 from our own evidence files. No Kissflow API call was made and `.env` was not read. Never cite this file, `docs/` or the memory notes to Beiersdorf.

## How to read it

**Tags** (each claim carries one):
- **VERIFIED-LIVE**: observed on the dev sandbox `AcDOSunMEpSA` (or, where stated, read live from connector metadata). The evidence is given as `file:line`.
- **DOCUMENTED**: stated in `~/Downloads/master.md` (cited as `MM §x:line`), or in vendor source/metadata where stated. Not re-tested by us.
- **UNVERIFIED**: an assumption, a plan claim, or something only seen with the account-admin key. The named test settles it.
- **Decision**: a Thomas or Beiersdorf decision, not a platform fact.

**Admin-key caveat.** Almost every VERIFIED-LIVE result was obtained with Thomas's account key, which acts as Thomas (account admin, member of every app role). Such a result proves what the platform *allows*. It does not prove what a non-admin user or a supplier can do.

**Evidence abbreviations** (paths relative to the project root unless noted):

| Code | File |
|---|---|
| SP | `kissflow-build/ciq-digital/SPIKES.md` |
| RS | `kissflow-build/ciq-digital/RESUME.md` |
| BLA | `kissflow-build/ciq-digital/BUILD-LOG.md` (v1 run, superseded) |
| BLP | `kissflow-build/ciq-supplier-portal/BUILD-LOG.md` |
| K9 | `kissflow-build/ciq-supplier-portal/K09-PREP.md` |
| UI | `kissflow-build/ciq-supplier-portal/UI-LOG.md` |
| PA | `kissflow-build/ciq-supplier-portal/PARITY.md` |
| PSPEC | `kissflow-build/ciq-supplier-portal/portal-spec.mjs` |
| CON | `kissflow-build/ciq-supplier-portal/connectors-2026-10-07.json` (account connector subscriptions, read 2026-10-06T22:07Z) |
| CDEF | `kissflow-build/ciq-digital/spikes/k09f-dataform-connector-result.json` (Dataform 1.5.4 and Process 3.7.6 connector metadata) |
| IRQ | `kissflow-build/ciq-digital/spikes/integration-requests.jsonl` |
| DEC | `runs/ciq-digital-v4/decisions.md` |
| PV3 | `docs/kissflow-data-model/plan-v3-supplier-portal-one-role.md` |
| PV4 | `docs/kissflow-data-model/app-plan-v4-processes-and-forms.md` |
| DMP | `docs/kissflow-data-model/kissflow-data-model-plan.md` |
| CALL | `context/decisions/2026-10-09-client-call.md` |
| MEM/x | `~/.claude/projects/-Users-thomas-Documents-Kissflow-Projects-POC-Beiersdorf/memory/x.md` |
| MM | `~/Downloads/master.md` |

---

## 0. Where our live evidence overrides master.md

Trust these corrections over the manual.

| master.md says | Live finding | Tag |
|---|---|---|
| "There is no dynamic per-record assignee" (MM §4.6:399) | A step can be assigned from a MultiUser field on the item: `Resource{ValueType:"Field",Value:<id>,Field:<id>}`. Every portal supplier step routes this way | VERIFIED-LIVE BLP:28, BLP:103, MEM/beiersdorf-poc:84 |
| An API key cannot act after StartEvent (MM §3.6:257, §14 #7) | The key acts as its user. It **can** submit, reject and withdraw a later step when that user is in the step's role. It **cannot** update fields after Start (`050313`) | VERIFIED-LIVE SP:76, SP:119, SP:140-146 |
| Child-table writes on processes 500 over REST (MM §3.6:261, §15) | Child rows are writable over REST with the key `"Table::<ChildModelId>"`, on Forms and on Processes at Start; after Start only the step's assignee can write | VERIFIED-LIVE SP:89-102 |
| The host installs `window.kf` asynchronously (MM §6.1:496, §6.3:532) | The host never installs `window.kf`. A custom UI must bundle `@kissflow/lowcode-client-sdk` and `await initialize()` | VERIFIED-LIVE UI:21-27, UI:102; MEM/kissflow-custom-ui-sdk-handshake:11 |
| "There may be no Case/Dataform connector" (MM §4.8:421) | A Kissflow Dataform connector (1.5.4) exists; a Form ItemCreated trigger fired a live integration | VERIFIED-LIVE SP:32, SP:72; CDEF |
| No multi-create in integrations (MM §4.8:418) | The Process connector lists an action "Create and submit items in bulk". Runtime untested | VERIFIED-LIVE (metadata only) CDEF:755; runtime UNVERIFIED |
| `kf.api` body must be a plain object, never stringified (MM §6.3:531) | For lowcode-client-sdk 1.0.49 write bodies, CAFM's live evidence says a JSON string plus a Content-Type header. Conflicting evidence: prefer the SDK's typed methods; use `kf.api` writes only after a live check | UNVERIFIED on this tenant; UI:42, MEM/kissflow-custom-ui-sdk:18 |
| (our v1 log) "Processes can't be changed over REST after publish" (BLA:159) | A clean graft on a published process works (draft PUT 200, publish 200), including adding fields with per-step permissions | VERIFIED-LIVE SP:49, BLP:10 |

---

## 1. Data objects

### 1.1 Which object to use

| Object | What it is | Use in CIQ | Tag |
|---|---|---|---|
| **Process** | Structured workflow: Start → user steps → End. Items land in My Items / My Tasks | Only where a record moves through steps with SLAs (Thomas's rule). Must be decided up front: a Form can never become a Process | DOCUMENTED MM §2.1:122, §4.2:347; Decision MEM/kissflow-process-vs-form-rule:11-14 |
| **Dataform (Form)** | A typed record with no workflow; editable after publish | All pure data: masters, configuration versions, notes, audit, RMES sheets | DOCUMENTED MM §2.1:121 |
| **Board (Case)** | Unstructured kanban workflow; statuses moved freely | Not used. Every board member sees every card through the `{id}_all` view, which rules it out for supplier data | DOCUMENTED MM §2.1:123, §5.4:482; Decision DEC:51 |
| **List** | A string option set that backs a Select/Multiselect | Only stable platform enums (Yes/No, kinds) | DOCUMENTED MM §2.1:124, §3.8 |
| **Dataset** | A richer table that can feed Select/Reference fields; sharing is UI-only | Not used: the admin API key has no dataset scope | DOCUMENTED MM §2.1:124, §11.4:784-785; Decision DEC:51 |

### 1.2 Process

| Feature | Object / shape | Limits | Tag |
|---|---|---|---|
| Steps | Activities `StartEvent → UserTask(s) → EndEvent`; append an explicit End, the last step becomes a no-assignee EndEvent | Start/End actors are ignored; Start defaults every field Editable, so set decision fields ReadOnly at Start | DOCUMENTED MM §4.6:399-400 |
| Role assignee | `Resource{ValueType:"AppRole",Value:roleId}` | Role must have members, or submit is refused ("moved out of your queue") | VERIFIED-LIVE SP:76, SP:117-118 |
| **Field assignee** | `Resource{ValueType:"Field",Value:<fieldId>,Field:<fieldId>}` on a MultiUser field | Without the `Field` attribute the submit fails. All assignee fields empty → submit refused "There is no assignee for the next step". "Any one of two contacts" semantics untested (MT-1). Field assignee with a single `User` field in the app is untested (PV4:115 "K-FA") | VERIFIED-LIVE BLP:103, BLP:28; any-of UNVERIFIED |
| Multi-assignee semantics | The connector describes "approved by an assignee at this step… the item may or may not advance" depending on assignment configuration | Shape and default unknown | DOCUMENTED (connector metadata) CDEF:707; UNVERIFIED |
| **Parallel branches** | `Parallel` activity, one nested ProcessDef per branch, auto-join at the next step | Fork with any subset of branches, all six, one, or **none** (block skipped cleanly, no hang); simultaneous branch submits all 200; the join waits for every open branch and fires once. Tested with one-step branches only | VERIFIED-LIVE SP:129-133, DEC:499 |
| Conditions / skip | Formula on the activity (`=`, `!=`), on formula fields or Selects | Unmatched condition → step skipped; if nothing else runs the item completes. A Select value not in its list is silently dropped at create | VERIFIED-LIVE SP:74, SP:135, BLP:106; DOCUMENTED MM §4.6:401 |
| Blank vs 0 | A new item reads an unset Number as blank, not 0 | Gate formulas must treat blank explicitly ("blank holds") | VERIFIED-LIVE DEC:499, SP:75 |
| **Send-back** | Native per step; switch `IsSendbackEnabled` on the step's model permission (set by graft, read back true) | Over the API key every form of `…/sendback` returns 500 (17 body shapes). Real-user send-back (native form or SDK `sendbackItem`) never tested; whether the switch is the right one is unknown | VERIFIED-LIVE SP:147, DEC:500; real-user UNVERIFIED |
| Reject | `POST /process/2/{acc}/{proc}/{item}/{act}/reject {Comment}` | Status becomes "Rejected" (terminal); **ItemCompleted does not fire**. Native Reject is on every step unless switched off (builder switch, shape unknown) | VERIFIED-LIVE SP:145; switch UNVERIFIED BLA:36, BLP:125 |
| Withdraw | `POST /process/2/{acc}/{proc}/{item}/withdraw {Comment}` | Status "Withdrawn"; no completion event. The connector describes withdraw as an initiator action | VERIFIED-LIVE SP:146 |
| Reassign | SDK `reassignItem`; REST `reassign` | REST reassign 500s in other projects | DOCUMENTED MM §3.6:257, §6.2:512; UNVERIFIED here |
| **SLAs** | Per-step deadline; triggers `SlaBreached` and `SlaBreachedStep` exist | No SLA durations set in our app (values "set by BDF"). No REST shape known for setting them. Native SLA reminder/escalation e-mails, and an SLA that follows a date field, are untested (K-23) | VERIFIED-LIVE (metadata) CDEF:719; durations not set RS:24; behaviour UNVERIFIED |
| Process with no user step | Publishes; the item completes at submit | Banned by Thomas's rule (no "process without steps") | VERIFIED-LIVE BLP:104; Decision MEM/kissflow-process-vs-form-rule:13 |
| Terminal states | Completed / Rejected / Withdrawn; a finished item keeps one empty `_current_context` | Read state from `_status` / `_current_step`, never a custom Status Select | VERIFIED-LIVE K9:41; DOCUMENTED MM §3.6:260 |
| Create | `POST /process/2/{acc}/{proc}` creates a real item at Start (no draft step) | Required validation runs only at submit | VERIFIED-LIVE SP:73; DOCUMENTED MM §3.6:242-246 |
| Field writes after Start | Assignee route `POST …/{item}/{act}` | **Refused for the key for every field** (`050313`), even Editable/Mandatory ones; fields in a submit body are ignored. Real-user SDK `updateItem` after Start untested (K-WB) | VERIFIED-LIVE SP:141-142; real user UNVERIFIED |
| Admin write | `PUT /process/2/{acc}/admin/{proc}/{item}` | Writes any field regardless of step permissions (needs flow/account admin). On a **completed** item untested | VERIFIED-LIVE SP:143; completed-item UNVERIFIED |
| Mandatory | Step-level Mandatory | **Not enforced on a key submit.** Field-level `Required` at Start **is** enforced (400 "Value is required"). Native-form enforcement untested | VERIFIED-LIVE SP:144, BLP:109, DEC:492 |
| Reads | REST `/myitems` only (sparse); SDK `getMyItems`, `getMyTasksItems`, `getAdminItems`, per-item `getItem` | `getParticipatedItems` fails platform-wide (§8) | DOCUMENTED MM §3.6:251, §6.5:553; VERIFIED-LIVE DEC:501, UI:106-113 |
| Delete | Plain DELETE at Start; admin DELETE after | Test items deleted and verified gone | VERIFIED-LIVE BLP:9; DOCUMENTED MM §3.6:252-253 |
| Change after publish | Graft (getDraft → putDraft → publish); fields added after the workflow need a Permission per step | Fields on a published Process can't be deleted afterwards | VERIFIED-LIVE SP:49, BLP:10, BLP:105; DOCUMENTED MM §3.3:196 |

### 1.3 Dataform (Form)

| Feature | Detail | Tag |
|---|---|---|
| Create | `POST /form/2/{acc}/{form}` opens the user's **single** draft (`draft_<userId>`); submit returns the real item with a **new** `_id` | DOCUMENTED MM §3.5:225-232 |
| Concurrent creates by one user | Collide (409, 404 on submit, mixed data). Creates must be sequential per user, including for the sync service | VERIFIED-LIVE SP:158 |
| Update | `POST /form/2/{acc}/{form}/{item}` (fields and `Table::` rows) | VERIFIED-LIVE SP:94, SP:100 |
| Triggers | A Form ItemCreated trigger fires an integration (≈6 s) | VERIFIED-LIVE SP:72 |
| Grants | Per Form, not per row: every member can edit every row | DOCUMENTED MM §4.7:409-410; PV4:32 |
| No steps, no SLA | By definition | DOCUMENTED MM §2.1:121 |

### 1.4 Board (Case)
Not used in CIQ. Facts if it comes back: create needs `Prefix` and `ItemType`; items need `Summary`; boards render blank until case members are granted; moves via `…/{item}/{statusId}/move`; a Kissflow Board connector exists. DOCUMENTED MM §3.7, §5.4; connector VERIFIED-LIVE CON:55.

### 1.5 "List" versus Dataset (and lookups)

| Claim | Tag |
|---|---|
| A **List** is a flat array of strings. Created as a flow; items set with `POST /flow/2/{acc}/list/{listId}/items {"ListItems":[…]}`, which **replaces** the whole set | DOCUMENTED MM §3.8:287-290 |
| Our 5 portal lists and 22 app lists were published and read back exactly; list deletes work | VERIFIED-LIVE BLP:76-87, BLP:107, RS:21 |
| Every Select materialises a backing List; an empty list blocks all submits of a required Select; a value not equal to a list item is silently dropped | DOCUMENTED MM §3.8:291, §3.5:235; VERIFIED-LIVE BLP:106 |
| "Lookup to a list" = a Select bound by `ReferredList`. A List is not a record and cannot carry extra columns | DOCUMENTED MM §4.10:437 |
| List names collide account-wide; author ids without `_A00` for clean display names (generated app list ids still carry `_A00`) | DOCUMENTED MM §2.3:149; VERIFIED-LIVE SP:40, K9:18 |
| "Lists are append-only" (BLA:161, DEC:99) is a planning assumption; the endpoint replaces the set, and the effect on existing items holding a removed value is untested | UNVERIFIED |
| A **Dataset** is a richer table; it can feed Select/Reference fields; its sharing is UI-only and the admin key gets 403 on every dataset route; a Kissflow Dataset connector (2.0.14) is subscribed | DOCUMENTED MM §2.1:124, §11.4:784-785; connector VERIFIED-LIVE CON:43 |
| A **Reference** ("lookup") targets another flow's item: value `{_id}`; a bare string is dropped; every reference is a lookup of the target's display field; `filter` is silently dropped by the builder | DOCUMENTED MM §3.5:234, §4.4:386 |
| Native Reference RMES → CIQ Case (`Result_Case`) is live in the app | VERIFIED-LIVE DEC:65, DEC:498 (read-back 442/0) |

### 1.6 Child tables

| Feature | Detail | Tag |
|---|---|---|
| Model | Embedded `Model::Model`; child model id = the spec id (`Rounds`, `Contacts`, `Components`, …) | DOCUMENTED MM §2.1:126; VERIFIED-LIVE K9:19 |
| REST shape | Add `{"Table::<ChildModelId>":[{"_id":"<ChildModelId>_<rand10>","_index":n,"_is_created":true,…}]}`; modify `{_id,…}`; delete `{_id,"_is_deleted":true}`. The bare id gives 404 | VERIFIED-LIVE SP:89-101 |
| Server ids | A Form create **replaces** the client's row `_id`s; a modify with an unknown row `_id` **adds a duplicate row**. Always re-read and write by server ids; carry your own Text row key | VERIFIED-LIVE RS:29-30, DEC:499 |
| Process rows | Writable at Start by the key; after Start only the step's assignee | VERIFIED-LIVE SP:102 |
| Concurrency | Two writers each adding one row at once: 5/5 lost a row | VERIFIED-LIVE SP:156 |
| Step permissions | Only the **table** key can carry a step permission; column keys are rejected (`STEP_PERM_FIELD_MISSING`). Whether columns render and are editable in the native form is untested | VERIFIED (offline compile) SP:36, MEM/kissflow-app-builder-plugin:32; render UNVERIFIED SP:181 |
| Ids | A header field and a child column with the same id collide; use prefixed column ids | VERIFIED (offline) SP:39 |
| Formulas | Child formula columns compute server-side | VERIFIED-LIVE RS:31 |
| Aggregates over rows | Not reliable (see 1.7) | VERIFIED-LIVE SP:103 |
| Attachment column | An Attachment column in a child table publishes (`CIQP Section` › Uploads › `Upload File`) | VERIFIED-LIVE PSPEC:70-71, BLP:9; upload into it UNVERIFIED (PA:44-45) |
| Integrations | Cannot create, read, copy or update child rows | DOCUMENTED MM §4.8:418 |
| Child-model grants on a Form | Compile as a separate FlowPermission; whether the platform honours them is unknown (K-17) | UNVERIFIED DEC:356-368 |
| Maximum rows | No documented or tested limit | UNVERIFIED |

### 1.7 Field types

| Type | What we know | Tag |
|---|---|---|
| Canonical set | `Text, Textarea, Number, Currency, Date, DateTime, Select, Multiselect, Boolean, Checkbox, Checklist, Reference, User, Attachment, Image, Email, Signature, Slider, StarRating, SequenceNumber, Geolocation, Table`. `TextArea` (capital A) passes the draft and fails at publish | DOCUMENTED MM §4.3:382, §3.3:198 |
| **MultiUser** | Published on all portal processes (`Assigned Contacts`) and used as the step-assignee source | VERIFIED-LIVE PSPEC:37, BLP:28 |
| User | Carries `Attributes:[Status,FirstName,LastName,ProfilePicture]`, `SourceFlowId:"UserAbstract"` | DOCUMENTED MM §4.10:442 |
| Text → MultiUser copy by integration (two comma-separated ids) | Untested (K-09d). Verified fallback: a REST create at Start with `Assigned_Contacts:[{_id}]` + submit routes the task | UNVERIFIED; fallback VERIFIED-LIVE DEC:492 |
| **Long text / JSON** | No JSON type; JSON lives in Textarea. A 122 KB Textarea round-trips byte-identical (160 KB in the v2 run). Upper limit unknown | VERIFIED-LIVE BLP:108 |
| Attachment | Published on Forms (`CIQ Audit Event.Event_File`), Processes (`CIQ Case.Final_PDF`) and child rows. **No plain REST upload from an API key is known**; files go through SDK `kf.client.uploadFile` / `openFilePicker` | Schema VERIFIED-LIVE DEC:318, DEC:498; upload DOCUMENTED MM §6.6:566, §6.2:521 |
| Reference | See 1.5 | — |
| **Formula** | Full grammar (`IF`, `ISBLANK`, `DATEDIFF`, …); computes server-side, also over blanks and in child columns. Cross-model tokens (`Ref.Field`) silently compile to nothing | VERIFIED-LIVE SP:105, RS:31; DOCUMENTED MM §4.4:387, :390 |
| **Aggregation** | App Builder's embedded SUM never computes; re-pointed it sums **across all items**; the cross-flow SUM stays blank. Do not gate on aggregates: gate on Number count fields that the UI writes, plus formulas | VERIFIED-LIVE SP:38, SP:103-104, SP:109 |
| SequenceNumber | Needs a prefix chain; server generation 500s on some tenants | DOCUMENTED MM §4.4:385; UNVERIFIED here |
| Currency | Plain number; unit pinned to the field | DOCUMENTED MM §3.5:236 |
| Email/Date/Number | Reject `''`; omit blanks | DOCUMENTED MM §3.5:237 |
| DateTime via SDK | Milliseconds are rejected; write `…:ssZ` | VERIFIED-LIVE in CAFM, not on this tenant: UI:41 |
| System `Name` | Auto-generated, API-immutable; never author a field called `Name`; avoid generic names (`Status`, `Type`, …) | DOCUMENTED MM §2.3:148-149, §4.4:393 |

### 1.8 Ids and unique keys

| Claim | Tag |
|---|---|
| **No native unique-key constraint** is documented or was observed. `Supplier_Code` "unique" (PV3:36) is design intent only. Uniqueness must be enforced by the Workbench/sync service (natural Text key, check before create, local ledger) | UNVERIFIED (absence); pattern DOCUMENTED MM §8.2:697 |
| Ids are platform-assigned: flows `slug(Name)_A0x`; field id = name with underscores; step ids `Activity_xxxx`; roles `Ro…`; users `Us…`; process items `Pk…`; connections `Cn…`. Read them back, never guess | VERIFIED-LIVE K9:9-20, SP:20-26; DOCUMENTED MM §2.3:146-147 |
| Form item id changes on submit | DOCUMENTED MM §3.5:232 |
| Identity across containers is by our own keys (`Case_Code`, `Cycle_No`, `Supplier_Code`, twin item ids), all Required at Start on portal items | VERIFIED-LIVE BLP:21-23, BLP:50-54 |

---

## 2. Apps versus portals

| Claim | Tag |
|---|---|
| A portal is a **separate container** with its own app id (`CIQ_Supplier_Portal_A00`), roles and user management; it is authored over REST exactly like an app | VERIFIED-LIVE BLP:4-9; MEM/beiersdorf-poc:63 |
| `GET /flow/2/{acc}/portal/{app}/flow` works for portal and app containers | DOCUMENTED MM §3.3:192 |
| App Builder 1.0.0 cannot reach portals; portal work is REST plus the old engine | Decision/user-confirmed MEM/kissflow-app-builder-plugin:15 |
| Portal roles are ordinary app roles. Ours: exactly Admin, Supplier, User; renaming keeps the id; role deletes work | VERIFIED-LIVE BLP:56-64, BLP:107 |
| **Rule:** one portal role `Supplier`, supplier-only steps; every Beiersdorf step and role in the app; every portal item has an app twin | Decision PV3:18-24, MEM/kissflow-portal-external-only:8-13 |
| Portal users are invited by a portal Admin (Thomas today); a Beiersdorf-operable onboarding path is open | UNVERIFIED PV3:55 |
| **What a portal user sees:** items they started, their open tasks, and items they acted on ("participated"). Participated fails (§8), so in practice: started + open tasks. A completed request disappears for its contacts | Rule from UI:62; failure VERIFIED-LIVE (admin/builder sessions) UI:113, DEC:501; supplier-user behaviour UNVERIFIED |
| Supplier isolation (supplier A cannot list or GET supplier B's items) | UNVERIFIED (K-05, MT-2) |
| Process `Member []` stops a supplier from creating items | UNVERIFIED: with the admin key `[]` still allowed it (BLP:70) |
| The portal hosts a custom UI; the SDK handshake works there | VERIFIED-LIVE UI:13-15, UI:99-104 |
| Thomas shared the portal flows with the app (for lookups). Our admin key reads every portal flow under the app id anyway, so the sharing itself is unproven | Sharing UNVERIFIED BLP:89-97; admin read VERIFIED-LIVE BLP:95 |
| **Cross-container Reference/lookup** (app field pointing at a portal item) | UNVERIFIED (K-07, K-14) |
| Linked roles across containers (an app role granted on a portal flow) | UNVERIFIED (K-18, DMP:824) |
| **Cross-container integrations** (portal trigger → app action and back) have never been run (K-09a). The Dataform connector's form picker lists forms of Application **and** Portal containers, but the Process connector's process picker filters to the integration's own `_application_id` on low-code accounts, so a cross-container Process target may not be selectable | UNVERIFIED; picker scripts VERIFIED-LIVE (metadata) IRQ:8, IRQ:11 |
| The account key can read and write both containers (so a server-side sync service is a working bridge) | VERIFIED-LIVE BLP:95, DEC:492 |
| Signed-out, the dev sandbox redirects to the **production** sign-in page; never sign in there | VERIFIED-LIVE SP:187 |

---

## 3. Integrations

### 3.1 Model and authoring

| Claim | Tag |
|---|---|
| Exactly **1 trigger + ≥1 action**; item-level triggers only, **no field-change trigger**; field map = copy a source field or a quoted literal; no arithmetic, no per-row loops, no child rows; UPDATE needs the target `_id` | DOCUMENTED MM §4.8:418 |
| A trigger is bound to **one flow** (`form_id` / `process_id` selector) | VERIFIED-LIVE SP:58-61 |
| REST authoring recipe: SystemApiKey connection per connector → skeleton → resolve trigger/action fields → bind selector → re-resolve → map (`context.<triggerId>.<field>` or literal) → publish | VERIFIED-LIVE SP:50-62 |
| Connections: Dataform 1.5.4 `CnEKHrH5GzkY`, Process 3.7.6 `CnEKHrHqXRKB` (reuse) | VERIFIED-LIVE SP:50, K9:20 |
| **Switching on is manual** in the Integration builder: `PUT …/on` 403, `POST …/on` 404 | VERIFIED-LIVE SP:53, IRQ:33-34 |
| On switch-on, the builder **runs each integration once with a sample payload** (it wrote two Log rows with item `SampleInstance001`). An e-mail integration will likely send a sample mail at activation | VERIFIED-LIVE SP:78; mail side effect UNVERIFIED |
| Latency ≈6 s from event to target row | VERIFIED-LIVE SP:119, SP:163 |
| Mapping a trigger `_id` into a Text field works | VERIFIED-LIVE SP:72, DEC:307 |
| App Builder creates integrations **incomplete** (no trigger, no action) and switched off; it refuses to apply with fewer than 2 automations, `--force` doesn't waive it; its `notify` action is unsupported | VERIFIED-LIVE SP:41, SP:43, RS:21; DEC:309, DEC:451 |
| Created integrations cannot be deleted through the public API | DOCUMENTED MM §4.8:423 |

### 3.2 Triggers available (connector metadata, read live)

| Connector | Triggers | Fired live by us |
|---|---|---|
| Kissflow Dataform 1.5.4 | ItemCreated, ItemUpdated ("a user edits and submits an existing item"), ItemDeleted | ItemCreated: yes (SP:72) |
| Kissflow Process 3.7.6 | ItemCreated, Comment added, DraftItemSubmitted, ItemAdvancesToNextStep, ItemRejected, ItemWithdrawn, SlaBreached, ItemReassigned, ItemSentBack, ItemCompleted, **ItemEntersToStep**, ItemExitsToStep, ProcessStepSubmit, ItemRejectedStep, SlaBreachedStep, ItemReassignedStep, **ProcessStepBeforeEnter** ("irrespective of the skip conditions") | ItemCompleted: yes (SP:119, SP:163) |
| Schedule | "Scheduler by Kissflow" 1.0.7 subscribed | no |
| Webhook-in | "Webhooks by Kissflow" 1.0.0 and "Custom trigger by Kissflow" 1.0.0 subscribed; trigger/action shapes not read | no |

Evidence: VERIFIED-LIVE (metadata) CDEF:585-773, SP:32, CON:19, CON:25, CON:49. Everything not fired live is UNVERIFIED at runtime. Open questions: does ItemEntersToStep fire for a step skipped by its condition (K-09i)? does a send-back re-fire it (K-09h)? Rejection and withdrawal do **not** fire ItemCompleted (VERIFIED-LIVE SP:145-146).

### 3.3 Actions available

| Connector | Actions | Tested |
|---|---|---|
| Kissflow Dataform | Create and submit, Update, Fetch one, Fetch many, Delete | Create and submit: yes (SP:51-52, SP:72) |
| Kissflow Process | Create and submit, Update an item, **Generate a PDF**, Create and submit **in bulk**, **Approve an item**, Search an item, **Skip and complete** | none |
| Others subscribed | Email 1.0.6, HTTP 2.0.0, Kissflow Notification 1.0.0, Dataset, Board, Project | none |

Evidence: VERIFIED-LIVE (metadata) CDEF:737-773, CON:7-67. There is **no** reject, send-back or withdraw action.

UNVERIFIED and design-critical (K-09): which identity "Approve an item" acts as and whether it needs step-role membership (K-09b); whether "Update an item" may write a process item after Start, which the key cannot (K-09b/c); action conditions (K-09g); Form-to-Process and cross-container wiring (K-09a/f).

---

## 4. Notifications and e-mail

| Claim | Tag |
|---|---|
| Native task e-mails exist, with a per-step "e-mail" switch that only the process builder sets (shape unknown) | DOCUMENTED BLA:37, BLA:237; shape UNVERIFIED BLP:125 |
| Whether a supplier receives a native task e-mail on a field-assigned portal step, and what it says | UNVERIFIED (K-11) |
| Native SLA reminders/escalations as the notification mechanism (the reason for Thomas's "Process only with SLAs" rule) | UNVERIFIED (K-23); no SLA set yet RS:24 |
| Email connector (1.0.6) is subscribed; master says native notify stitches go Email connector → SendEmail with To/Subject/Body mapped in the builder | Presence VERIFIED-LIVE CON:67; behaviour DOCUMENTED MM §4.8:422, UNVERIFIED here |
| HTTP connector (2.0.0) is subscribed, for an outbound call to an external mailer | Presence VERIFIED-LIVE CON:31; UNVERIFIED |

**Thomas's R-1** (one generic webhook e-mail for "open point raised / answered", portal and app; suppliers never get internal content): CALL:75-80, MEM/ciq-open-point-notify-and-pdf-thread:13-19, :31.

What the platform allows, by evidence:
- One integration has exactly one trigger on one flow (above). So "one integration for every open-point event in both containers" cannot be literally one integration.
- An integration can't look up or compare values, so the recipient e-mail and the supplier-safe text must already be on the trigger item (DOCUMENTED MM §4.8:418; PV3:54).
- **Pattern that reuses verified pieces:** a notification "outbox" Form per container. Every open-point event creates one outbox row carrying recipient, subject and supplier-safe body (written by the Workbench or portal UI, or by an integration "Create and submit" into a Form, which is VERIFIED-LIVE SP:51, SP:72). One integration per container: Dataform ItemCreated → Email (or → HTTP → one external mailer). The Form trigger is VERIFIED-LIVE; the Email/HTTP action and a field-mapped "To" are UNVERIFIED.
- Expect a sample run (possibly a sample mail) when it is switched on (SP:78).

---

## 5. Custom UI (Workbench in the app, supplier UI in the portal)

"Workbench" is our name for the app's custom UI, not a Kissflow product.

| Claim | Tag |
|---|---|
| A custom UI is an Application component (zip with `manifest.json {"Category":"Application","Framework":"React"}`, ≤5 MB) served full-screen at `/view/application/<appId>/ui` in a cross-origin iframe | DOCUMENTED MM §2.1:133, §10.1:757, §6.11:593 |
| Enable it with `PUT /flow/2/{acc}/application/{app} {_is_custom_ui_enabled:true}`; upload by script; component goes Live | VERIFIED-LIVE DEC:501, UI:15, RS:25 |
| A portal needs a builder **deploy click** after upload; no deploy API is known | VERIFIED-LIVE (observation) UI:16 |
| Bundle `@kissflow/lowcode-client-sdk` (1.0.49) and `await initialize()` (posts `CC_INITIALIZE`); race it with a timeout, it waits forever otherwise | VERIFIED-LIVE UI:21-31; MEM/kissflow-custom-ui-sdk-handshake:11-15 |
| SDK surface: Dataform get/create/update/submit/delete; Process getMyItems, getMyTasksItems, getParticipatedItems, getAdminItems, getItem, createItem, updateItem, submitItem, rejectItem, sendbackItem, withdrawItem, reassignItem, getAdminItem/updateAdminItem, getProgress, openForm; form engine `initForm(id) → getTable(id).addRow`; `kf.client.uploadFile/openFilePicker/getImageUrl`; `kf.user.AppRoles`; `kf.api` (raw REST as the user) | DOCUMENTED MM §6.2:502-524 |
| List answers seen live: My items `{Columns,Data}` (sparse rows with step + activity id); My tasks and All items (admin) `{_id,Columns,Sort,Filter,Data}`; no total/count key; admin list returns 30 of 125 fields and no activity id | VERIFIED-LIVE UI:106-109, DEC:501 |
| Lists page 50 rows by default; getItem/updateItem/submitItem need `activityInstanceId` | DOCUMENTED (SDK 1.0.49 source) UI:39-40 |
| `getAdminItems` answers for Thomas | VERIFIED-LIVE UI:110 |
| Whether the portal Admin role (Member + Initiate + View, not flow Admin) can use admin routes | UNVERIFIED UI:131 |
| **Writes as the user only through the SDK or the native UI**; a page-session `fetch` write gets 403 "Invalid access" | VERIFIED-LIVE RS:32, K9:40 |
| **A real user's SDK `updateItem` after Start** (the Workbench's main write path) | UNVERIFIED (K-WB, DEC:484); fallback `openForm` to the native task form |
| SDK child-row add and file upload (`uploadFile → initForm(item, task) → getTable(Uploads).addRow → read back`) | Implemented, UNVERIFIED in Kissflow PA:22, PA:44-45; `uploadFile` present in the portal host VERIFIED-LIVE UI:105 |
| `kf.user.AppRoles` carries the live role names (production role signal); `getRoles()` answers only in a builder session | VERIFIED-LIVE DEC:501, UI:104; DOCUMENTED MM §6.2:525 |
| A no-pages app's tasks do **not** show in the Kissflow home queue; users work in the Workbench | VERIFIED-LIVE RS:34 |
| Browser tooling cannot click or type inside the cross-origin frame; real-user write tests need Thomas | VERIFIED-LIVE DEC:502 |
| Native pages auto-grant their roles as editors (escalation); generate with `--no-pages` (default adds 24 pages + 4 menus) | DOCUMENTED MM §3.4:219; VERIFIED (offline dry run) BLA:26-30, DEC:282 |

---

## 6. Permissions

| Claim | Tag |
|---|---|
| Roles are per container (`app_role`); every container has default Admin and User; membership via `PUT …/app_role/{id}` with `Users[]` (other keys silently no-op; flaky, verify by GET) | DOCUMENTED MM §3.2:174-182 |
| Flow grants via `POST …/{family}/{flow}/member/batch` with `Role` Member/Viewer/Admin and a `Permission` array; `DELETE …/member/{roleId}` removes a grant | DOCUMENTED MM §3.4:203-214; VERIFIED-LIVE BLP:66-74, MEM/beiersdorf-poc:88 |
| Process: `["InitiateItems"]` to raise items; "Editable" always includes InitiateItems; our step-owner roles were reset to Member `["View"]` | DOCUMENTED MM §3.4:212, :216; VERIFIED-LIVE DEC:500 |
| Whether a Member `["View"]` step owner still gets My Tasks and cannot create, as a non-admin | UNVERIFIED (K-06/K-21) DEC:354 |
| Flow **Admin** for CIQ Case Admin on the 3 processes, granted over REST | VERIFIED-LIVE DEC:500 |
| Form: Member `["Delete"]` edits, Viewer reads; every member edits every row; no-Delete member (append-only) untested | DOCUMENTED MM §3.4:214, §4.7; UNVERIFIED (K-17) |
| Step field permissions Editable/ReadOnly/Hidden/Mandatory, one per (step, field); compiled 2525 cells and read back; branch-scoped lane permissions publish | DOCUMENTED MM §4.6:403; VERIFIED-LIVE DEC:498, SP:33, BLP:41-49 |
| Child tables take table-level step permissions only (see 1.6) | VERIFIED (offline) SP:36 |
| **Data scope** (`my-items`, `my-team`) is a view convention, not row-level security; row-level report scoping exists per a platform owner, shape unknown | DOCUMENTED MM §4.7:409, §15:938 |
| App Builder apply adds the connecting developer to **every** role and creates an "All Items" report View grant per role | VERIFIED-LIVE SP:42, DEC:497 |
| Admin-key results are not proof: ReadOnly-at-Start isn't enforced for it, and `Member []` still let it create | VERIFIED-LIVE (admin only) MEM/beiersdorf-poc:86, BLP:70 |
| A custom UI's nav decides what a role sees; Kissflow grants decide what it can read/write; gate by `AppRoles` | DOCUMENTED MM §3.4:220, §6.7:570-573 |
| Role list endpoint returns 10 rows by default; pass `page_size=100` | VERIFIED-LIVE MEM/beiersdorf-poc:89 |
| Re-running `kf apply` on plan rev 31 would rename the live roles back to the old names | VERIFIED-LIVE (state) DEC:511 |

---

## 7. Versioning configuration data (rule sets, questionnaire templates)

| Claim | Tag |
|---|---|
| Changing a Form's fields changes them live for every item; there is no per-item schema version. Questionnaire templates and rules therefore have to be **data**, not native fields | DOCUMENTED MM §3.3:196; DMP:130 |
| App Builder saves versions of the app definition (e.g. `v20261008184121`); that versions the build, not business data | VERIFIED-LIVE DEC:497 |
| Decision Tables are plan-gated (403), so rules are evaluated by our own evaluator (Workbench, portal UI, sync service) | DOCUMENTED MM §4.4:392; UNVERIFIED on this plan (K-22) |
| Datasets are unusable for config (no API-key scope, UI-only sharing) | DOCUMENTED MM §11.4:784-785 |
| Lists are replaced wholesale and Selects drop unmatched values; version-specific answer options belong inline in the JSON definition, not in Lists | DOCUMENTED MM §3.8:287, §3.5:235; design DMP:418 |
| JSON payloads in Textarea round-trip at 122 KB | VERIFIED-LIVE BLP:108 |
| Rows in a child table are writable/readable by REST, but the server replaces row `_id`s at create, so each rule/field row needs its own Text key | VERIFIED-LIVE SP:100-101, RS:29 |
| Form members can edit any row, including a "Published" one; the admin route writes any process field; so immutability is **tamper-evident** (content hash + audit), never "unalterable" | DOCUMENTED MM §4.7; VERIFIED-LIVE SP:143; design DMP:391, DMP:990 |
| "A completed process item is frozen" was the old reason to use Processes for releases; it was never tested | UNVERIFIED MEM/kissflow-process-vs-form-rule:16 |

**Model in plan v4** (PV4:53, PV4:209): one Form `CIQ Config Version`, one row per (kind, version): template, section definitions, rule set, ownership, RMES criteria, limits, texts, settings, and **Release** rows holding the full bundle (`Release_Bundle_JSON` + hash). Copy-on-write: publishing never edits a row. A case pins the Release row id, hash and manifest at Start (PV4:128). The prototype's editor (draft via "Create new version" → edit → "Check & publish" with a change note; fields resolved per case version) is the reference behaviour: MEM/ciq-prototype-final-2026-10-14:52-55. Decision context: since 9 Oct the supplier's answers open and close sections live (MEM/ciq-process-decisions-2026-10-09:14), so the **portal UI also needs the pinned rules and definitions**. Because app→portal sharing and lookups are unverified, carry them into a portal item as JSON (large Textarea is verified).

---

## 8. Platform defects and traps we hit

| # | Defect | Effect on design | Evidence |
|---|---|---|---|
| D-1 | **`getParticipatedItems` fails** ("some error occured") on every process, portal and app | Suppliers lose sight of completed items; keep needed context on items they still hold, or a supplier-readable record (K9 options A/B/C) | VERIFIED-LIVE UI:113, DEC:501, K9:37, RS:33 |
| D-2 | **Key cannot update fields after Start** (`050313`, every field); submit body fields ignored | Sync service writes in-progress items through the admin route only; humans write their own steps | VERIFIED-LIVE SP:141-143 |
| D-3 | **Send-back returns 500** over the key, 17 shapes, also with `IsSendbackEnabled=true` | Never build a path that depends on an automated send-back; real-user send-back untested | VERIFIED-LIVE SP:147 |
| D-4 | **No write locking**: simultaneous writes lose data (admin route 9/10 rounds, Form route 5/10, child rows 5/5); stale `_doc_version` accepted; window under ≈0.1 s | One writer in flight per item; write-then-verify (re-read, re-apply up to 3 times) | VERIFIED-LIVE SP:152-156, DEC:457-460 |
| D-5 | **Step Mandatory not enforced on key submits** (field-level Required at Start is) | The UI enforces gates before `submitItem`; use Required-at-Start for portal hand-off data | VERIFIED-LIVE SP:144, BLP:109 |
| D-6 | **Integrations switch on only in the builder** (403/404 over REST) | Every integration needs a Thomas click; plan for it | VERIFIED-LIVE SP:53, IRQ:33-34 |
| D-7 | Same-user simultaneous Form creates collide on the single draft | Serial creates per user/service | VERIFIED-LIVE SP:158 |
| D-8 | Aggregates (embedded and cross-flow) don't compute correctly | Number counts written by the UI + formulas | VERIFIED-LIVE SP:38, SP:103-104 |
| D-9 | Child-row ids replaced on create; unknown row id on modify adds a duplicate | Re-read rows; own row keys | VERIFIED-LIVE RS:29-30 |
| D-10 | Page-session `fetch` writes get 403 | All UI writes through the SDK | VERIFIED-LIVE RS:32 |
| D-11 | No-pages app: tasks absent from the home queue | Workbench is the only task surface | VERIFIED-LIVE RS:34 |
| D-12 | Switching an integration on runs it once with sample data | Expect test rows/mails on activation | VERIFIED-LIVE SP:78 |
| D-13 | Reject/withdraw don't fire ItemCompleted | Cancellation needs its own trigger (Z2 uses an audit row) | VERIFIED-LIVE SP:145-146, DEC:476 |
| D-14 | App Builder: cross-flow SUM published against its own flow; integrations incomplete; ≥2 automations floor; developer added to all roles | REST grafts after generate | VERIFIED-LIVE SP:38, SP:41-43 |
| D-15 | Signed-out dev URL redirects to production sign-in | Never sign in there | VERIFIED-LIVE SP:187 |
| D-16 | The dev account showed "trial ends in 5 days" on 9 Oct | Check with Kissflow before the bake-off | VERIFIED-LIVE (banner) RS:35 |
| D-17 | Published flows and created integrations can't be deleted through the API | Name spikes `ZZ`; create rarely | DOCUMENTED MM §3.9:296, §4.8:423 |

---

## 9. Attachments and external generation (AS-12: external script → PDF → attach to the case)

**Decision** (AS-12, 12 Oct): no RMM click. The supplier's final release hits a webhook; an external script (Apps Script or Lambda) renders the PDF, including every open-point round as text (R-2), and attaches it to the case process. CALL:106-110, MEM/ciq-assumption-answers-2026-10-12:27-31.

| Step | What we know | Tag |
|---|---|---|
| Trigger | CIQP Final Release ItemCompleted (portal) or CIQ Case ItemCompleted (app). ItemCompleted fires within an app | VERIFIED-LIVE SP:119 (app); portal side UNVERIFIED |
| Call out | HTTP connector (outbound) and "Webhooks by Kissflow" are subscribed; shapes not read. Alternative: the script polls (Scheduler, or its own cron) | Presence VERIFIED-LIVE CON:25, CON:31; UNVERIFIED |
| Read the data | The account key reads Form items with child rows (`GET /form/2/{acc}/{form}/{item}` returns `Table::…`), process items via the admin GET, and both containers | VERIFIED-LIVE SP:96, SP:100, BLP:95; admin GET DOCUMENTED MM §3.6:248 |
| Hash | An integration can't hash; the script computes it | DOCUMENTED DMP:733 |
| **Attach** | **No plain REST upload from an API key is known.** master records a production Lambda that attached a PDF to a process item, without the mechanism. Writes after Start need the admin route; on a **completed** item untested; attachment value format unknown | DOCUMENTED MM §6.6:566, §6.15:615; UNVERIFIED (K-15) |
| Native alternative | Process connector action "Generate a PDF document" exists; template control and whether it can carry the open-point threads are unknown | VERIFIED-LIVE (metadata) CDEF:749; UNVERIFIED |
| Fallback home | `CIQ Audit Event.Event_File` (Form row, category "Final PDF") if a completed case refuses the attachment; still needs the upload mechanism | Schema VERIFIED-LIVE DEC:318, DEC:498 |
| User-session upload | SDK `uploadFile` then attach (proven live in another project, Ardee); contradicts "no click" unless the next Workbench session does it automatically | DOCUMENTED MM §6.2:521; MEM/post-call-k21-k09:37 |
| Supplier uploads | Child table `Uploads` with an Attachment column exists in CIQP Section; upload from the portal UI is untested ("Test upload" in Diagnostics) | Schema VERIFIED-LIVE PSPEC:70-71; upload UNVERIFIED PA:44 |
| File size unit | Not documented | PA:23 |

**Cheapest next step:** run the control experiment that settled child rows: capture the network call of one native attachment upload in the builder, then test K-15 on a `ZZ` spike process item that has reached End.

---

## 10. Build-tool and process constraints

| Claim | Tag |
|---|---|
| App Builder 1.0.0: Dev sandbox only; no portal support; no incremental editing after generate (later changes via REST/patch) | MEM/kissflow-app-builder-plugin:15-17 (user-confirmed) |
| Generate, role-membership changes and deploys need Thomas's fresh, explicit, per-action approval (auto-mode guard) | MEM/kissflow-auto-mode-guard:11-25 |
| Before the first write to a container, show Thomas the change list; read back every write | CLAUDE.md "Writes" |
| Flow names are unique account-wide: app flows `CIQ `, portal flows `CIQP ` | CLAUDE.md; DOCUMENTED MM §2.3:149 |

---

## 11. Open tests that decide the v5 design

| Test | Settles | Blocks |
|---|---|---|
| K-WB | Real user's SDK `updateItem` at a later step | The Workbench write path (else native-form fallback) |
| Real-user send-back | Native/SDK `sendbackItem` works; which switch | Open-point Return design |
| K-19P | Two lanes saved at the same moment by real users | Lanes on one case item vs one record per department |
| K-09 a–i | Cross-container trigger/action, Approve identity, UpdateAnItem after Start, Text→MultiUser, closing portal items, action conditions, send-back re-fire, skipped-step triggers | Every X/Y integration; fallback is a sync service |
| K-15 | Attachment upload by an external script to a (completed) case | AS-12 PDF |
| K-05 / MT-1/2/3 | Supplier isolation, any-of assignment, `Member []` initiation, supplier view of completed items | Portal security claims to BDF |
| K-06 / K-21 | Member `["View"]` step owner works as a non-admin | Reviewer grants |
| K-17 | Form member without Delete; child-model grants | Append-only audit and config |
| K-11 / K-23 | Native e-mails per step, SLA reminders, SLA from a date field | R-1 design and Thomas's SLA rule |
| K-14 / K-07 | App reads portal items (sharing, lookups) | K2.1 component data in the app, PDF content |
| Email/HTTP/Webhook connectors | Action/trigger shapes and field-mapped recipients | R-1 and AS-12 |
