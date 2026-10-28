# CIQ Sync Service

Kissflow-internal. Never cite this folder to Beiersdorf.

The service is the only bridge between the supplier portal `CIQ_Supplier_Portal_A00` and the internal app `CIQ_Digital_A00` (plan v5 §8). It does five things:

- it carries every portal↔app hand-off;
- it is the only writer of the audit trail and of CIQ Case Data;
- it writes every e-mail as a CIQ Mail Outbox row;
- it sends the reminders;
- it produces the final document, its seal and the final PDF.

Node 20+, no runtime dependency.

## How it works

**One engine.** The prototype's domain code (`prototype/src/domain/*.ts`) is bundled read-only into `vendor/domain.mjs` by `node kissflow-build/sync/build-vendor.mjs`. Every transition, guard, audit text, mail text and recipient list therefore comes from the prototype by construction (plan §11.4).

**Per trigger**, the service:
1. loads the case from Kissflow into the prototype's shape (`engine.mjs toCiqCase`);
2. applies the prototype action (for example `raiseOpenPoint`, `confirmCompleteness` or `finalRelease`);
3. translates the result into Kissflow writes (`reconcile.mjs`).

**Canonical state.** The case lives in **CIQ Case Data**:
- the JSON fields of plan §4.4;
- the rest of the prototype case and the service's bookkeeping, in the ledger field `Sync_Note` (JSON; see Gaps).

The child tables (Components, Documents, Requested_Documents, Change_Reports) are projections for the Workbench and are never read back as state. RMES lives only in the RMES forms.

**Idempotency.** Every create has a key:

| Object | Key |
|---|---|
| Review | `Review_Key = <case>-<dept>-<round>` |
| Open point | `OP_Key` |
| Query | `Query_Key = <OP>-R<round>` |
| Release | `Confirmation_Key = <case>-FR-<n>` |
| Mail | `Mail_Key` |
| Audit | `Event_Key = <trigger>#<n>` |
| Scope run | `Run_Key` |
| Change report | `CR_Key` |
| File copy | the portal attachment id |

The ledger is checkpointed right after each process-item create and each file copy. A trigger key in `ledger.applied` is never applied twice. A replay re-runs only the idempotent effects.

**Write rules** (P3, P9, D-4, D-7), all in `kissflow.mjs`:
- one write in flight per item;
- write, then read back, and re-apply what did not stick, up to 3 times;
- an item whose holder wrote it within 2 s is deferred to the next run;
- Form creates are serial;
- child rows are matched by their own key, and server row ids are re-read before a modify;
- all calls are paced at least 1 s apart;
- a 429 sets a global back-off: 1 min for Kissflow's JSON 429, 10 min for the Cloudflare HTML challenge. Any 429 or non-JSON answer is never treated as data, and the run stops at once.

**Identity** (`identity.mjs`, 15 Oct). One Kissflow user may be both an internal user and a supplier contact. In dev this is the rule: Thomas is in every app role and is the only portal user ("use myself as the supplier dev user in dev for tests"). The prototype, however, knows a person by one id with one side. So:
- A contact keeps `Contacts_Portal_User_Id` (or `contact:<Contacts_Key>`) as its id unless that Kissflow user is **shared**: a member of a department or persona role, the service's own user (`CIQ_SERVICE_USER_ID`), or a contact of more than one supplier.
- A shared contact gets the in-memory id `sup:<Supplier_Code>:<uid>`, both parts URI-encoded (a code with a space or `:` still gives a well-formed id). The run log gets one warning per such contact (ids only), and the heartbeat counts them (`overlaps=`).
- Minted ids never leave memory. Case Data, the ledger, mail keys and every write carry the Kissflow id. Only the directory's own minted ids are replaced (`kfId`, `unmint`): a supplier's free text that merely looks like `sup:<x>:<y>` is stored unchanged. Status texts and audit texts are scrubbed of minted ids. The port refuses any write body (live or dry-run) that still holds one (`IdentityLeakError`, naming the Kissflow id only: the item fails, nothing is sent).
- The input channel decides the side, never an id look-up. Workbench inputs are internal actions: a Service Request's `_created_by`, the CIQ Case Start fields, note authors and mentions, CIQ Review / Open Point step submitters. Portal inputs are supplier actions: the CIQP Request / Query / Final Release fields and their `_modified_by`.
- Look-ups for a case stay at the case's supplier: a portal e-mail or a Kissflow user id is mapped only to a contact of that supplier, never to the same person's contact at another supplier.
- On load, exactly the case's supplier positions are mapped to the contact of the case's supplier: `supplierContactIds`, `answeredBy[*].by`, `documents[].uploadedBy`, the completeness and final-release confirmations, and supplier thread entries.
- Audit `Actor_Dept` is the department the BDF actor acted in (the request's department), so the dev user is audited per department, not always as RMM.
- A portal user listed twice at one supplier keeps both rows, as before the identity layer: look-ups by id (Case_Contacts_JSON, release assignees) use the last row. The run log warns.
- With no shared user (UAT and production: portal users are external only) nothing is minted and all of this is the identity. A golden test checks it byte for byte.

**The service never submits a human step.** It submits only:
- the Start of the items it creates;
- the two Integration-service steps of CIQ Case.

It withdraws only items it started.

### Files

| File | What |
|---|---|
| `ids.mjs` | Every flow, field, step, role and list value; `verifyIds(kf)`. Expected ids of tonight's app objects are marked `expected` |
| `kissflow.mjs` | The port: admin GET/PUT, create + submit, step submit, withdraw, Form list/create/update with child rows, role members, S-2 attach/download, dry-run overlay, pacing and back-off (a `pace` object can be shared by two ports; `raw` is a guarded call for tools such as the live-e2e cleanup, never used by the service). `liveFileTransport` builds the key headers in-process from kf.mjs `loadEnv()` |
| `fake.mjs` | The in-memory fake of both containers at HTTP level, including S-2 attach/download and the 429 challenge mode |
| `engine.mjs` | The world builder, action runner, canonical case ⇄ Case Data, RMES rows ⇄ prototype, canonical JSON, seal |
| `reconcile.mjs` | The writes of plan §7 L-01…L-23, in a safe order, with the Case Data commit last |
| `handlers/` | `requests.mjs` (H-00 and the request handlers), `portal.mjs` (polling), `notes.mjs` (H-17), `reminders.mjs` (H-19/H-20), `index.mjs` (catalogue), `common.mjs` |
| `mail.mjs` | Outbox rows: the C-00 whitelist, de-duplication, the C-10 10-min debounce, retries `#2`/`#3`, dead letters |
| `audit.mjs` | Audit Event rows from the prototype's audit entries |
| `config.mjs` | Config Version rows → ConfigState; the portal bundle `ciq-bundle/1`; the seed generator; S-8 |
| `pdf.mjs`, `attach.mjs` | The final PDF (a small pure-JS PDF writer) and its attachment to `CIQ_Case_A00.Final_PDF` |
| `directory.mjs` | People from role members and the supplier master; department projection; the shared-user minting and the look-ups by side (`byEmail(email, prefer)`, `contactByEmail`, `contactIdFor`, `supplierIdFor`) |
| `identity.mjs` | The identity contract: `mintId`, `kfId` / `unmint` (members of the directory's minted ids only), `scrubMinted`, `decodeCase`, the leak scan (pure) |
| `service.mjs`, `run.mjs` | One pass, the heartbeat and the runner |
| `seed-out/` | The seed rows as JSON (§11.2). Not written to Kissflow |
| `live-e2e.mjs`, `live-e2e-scenario.mjs` | The live end-to-end driver (dev sandbox only): one throwaway case ZZT-E2E-#### walked through every step against live Kissflow, the humans played with the key, the real service run between the steps, then cleaned up. The scenario runs offline too (`test/live-e2e-driver.test.mjs`). See "Live end-to-end test" below |
| `test/` | `node --test kissflow-build/sync/test/` |

### Handlers (plan §8.2)

`handlers/index.mjs` lists them with their prototype actions. In short:

| Handler | Trigger | Prototype action |
|---|---|---|
| H-00 | every request | checks, then dispatch |
| H-01 | `case.created` | `createCase` |
| H-02 | `Answers_Rev` | `saveConfig`, `setAnswer`, `setComponents`, `setJustification`, `uploadDocument`, plus the file copy. A change in a section whose lead or co-reviewing department has completed reopens that review (the prototype's `reopenOwners`, Thomas 15 Oct): a new CIQ Review item via H-09. While locked (final release requested, completed, cancelled) every change is refused and audited "Change attempt refused"; the request's supplier JSON is then set back to the case (`restoredSupplierFields`, via reconcile step 9) and the save's uploads are marked handled (ledger `uploadsRefused`). `mirrorPendingSave` applies a save not mirrored yet before H-08, before H-09 on a locked case and before H-13 |
| H-03 | step "keep the CIQ up to date" | `confirmCompleteness` |
| H-04 | `op.raise` | `raiseOpenPoint` |
| H-05 | query completed | `supplierRespond` |
| H-06 | `op.*` | `reviewResponse`, `editOpenPoint`, `closeOpenPoint` |
| H-07, H-21 | by construction inside the actions | `growScope`, `refreshRmes` |
| H-08 | review item completed | `rmesDecision`, `completeReview`; the last one requests the release and locks the request. A waiting save goes first; the completion is dated by the item's `Completed_At` (`completedAt`), so a supplier change after it in the department's section reopens it at once (new item "Reopened", C-02; no release request) |
| H-09, H-10 | reopen, or a late activation | a new review item (`Activation_Reason` = that department's own reopen reason); release withdrawn, request unlocked. At the unlock, an Uploads row stored on the locked request without its save signal is audited "Change attempt refused" and marked handled |
| H-11 | release completed | `finalRelease`, then JSON, seal, PDF, attach, case end |
| H-12, H-13 | cancel, reactivate | `cancelCase`, `reactivateCase` |
| H-14 | reassign | `reassignReview` |
| H-15 | add a section | `extendScope` |
| H-16 | change report | `reportChange` |
| H-17 | new note | `addInternalNote` |
| H-18 | supplier changed | `updateContact`, `setContactActive` |
| H-19, H-20 | hourly, or "run now" | `runReminders` |

## Contracts with the portal UI and the Workbench

### `CIQP_Request_A00.Config_Bundle_JSON`

The portal UI reads exactly this (`config.mjs portalBundle`):

```
{
  "format": "ciq-bundle/1",
  "release": { "key": string, "label": "RS-2026.2 + CIQ-2026 v2", "ruleSetVersion": "RS-2026.2", "templateVersion": "CIQ-2026 v2", "manifestHash": string },
  "ruleSet": { "version": string, "rules": RuleData[] },   // prototype types.ts RuleData WITHOUT "basis" and "note"
  "template": TemplateData,                               // prototype types.ts TemplateData (sections → SectionData → FieldData)
  "settings": { "undefinedOrigins": string[] }            // SF-01 values without rules (G-06): ["waste","ccu","chemrec"]
}
```

- The bundle keeps the prototype's own ids and values.
- Built-in fields keep their code-side checks (`showWhen`, `validate`) by id in the prototype catalogue, so the bundle carries data only.
- `Config_Bundle_Hash` is the SHA-256 hex of the canonical JSON of the bundle. Canonical JSON means:
  - keys sorted at every level;
  - no whitespace;
  - `undefined` dropped.

  It is computed by `engine.mjs canonicalJson`.

### Portal UI writes on CIQP Request

These are conventions the service relies on:
- `Answered_By_JSON` is `{ "<key>": { "name", "email", "at" } }`. The key is a field id, an `SF-xx` id, a justification key, `K2.1:components` or an `EV:` key. The service maps the e-mail to the contact.
- **The portal UI must write the `*_By_Email` fields** with the signed-in user's e-mail: the `email` of each `Answered_By_JSON` entry, `Answers_Changed_By_Email`, `Uploaded_By_Email`, `Completeness_By_Email`, `Change_Report_By_Email`, the query's `Supplier_Responsible_Email` and the release's `Confirmed_By_Email`. The service finds the supplier actor by that e-mail among the contacts of the case's supplier. An `Answered_By_JSON` entry may carry `by` (the Kissflow user id) instead.
- The item's `_modified_by` is the fallback. It is never used when it is the key's own user: `CIQ_SERVICE_USER_ID`, or the item's `_created_by` (the service creates every portal item). In dev the key's user is also the portal user, so there only the e-mail fields can tell who acted; a write without them is recorded as "Change not applied".
- For a step **submit** (completeness, a query answer, the final release), a human `_modified_by` who is a contact of the case's supplier is the platform's record of who submitted. It wins over an e-mail field naming a different contact (logged as a warning, ids only), so a contact who may not confirm cannot confirm by writing a colleague's e-mail.
- Every file goes into `Supplier_Files` (S-2). Its metadata goes into an Uploads row with:
  - `Upload_Id` (the portal UI's own key);
  - `Upload_Attachment_Id` (the `Attach-…` id);
  - `Upload_Section_Key`;
  - `Upload_Field_Key` (a field id or `EV:…`);
  - `Upload_Doc_Kind`, `Upload_File_Name`, `Uploaded_By_Email`, `Uploaded_At`.
- A query answer with files writes `Response_Doc_Refs_JSON = ["<Upload_Id>", …]` on the query. Those uploads are applied by H-05 as the answer's documents, not by H-02.
- "Report a change": write `Change_Report_Text`, `Change_Report_Rev + 1`, `Change_Report_By_Email` and `Change_Report_At` (fields added 14 Oct). Offer the next report only after the previous rev has its receipt in `Change_Reports_JSON`.
- Completeness: write `Completeness_*`, then submit "Supplier: fill in the CIQ".
- **`Request_Locked` (Thomas, 15 Oct):** "Yes" means the service takes no supplier change. The service sets it with the label "Awaiting your final release" when it requests the release (H-08), back to "No" when the request is withdrawn (H-10) or the case is reactivated into review (H-13), and keeps it "Yes" on completed and cancelled cases (`reconcile.mjs LOCKED_PHASES`). The portal UI writes nothing on a locked request (nor on one labelled "Awaiting your final release") and still gives the release on the CIQP Final Release task. A save that still arrives is refused by the prototype's guard and audited "Change attempt refused"; nothing is mirrored and the save is not replayed, also not after a reopen: the service sets the request's `Config_Answers_JSON`, `Answers_JSON`, `Justifications_JSON`, `Components_JSON` and the stamps in `Answered_By_JSON` back to the case in the same pass, and marks the save's Uploads rows handled. Order of events (review findings, 15 Oct): a save not mirrored yet goes before a review completion, a reopen of a locked case and a reactivation (`handlers/portal.mjs mirrorPendingSave`), so a save made while the questionnaire was open is never refused by the lock the last completion sets. Open: an Uploads row refused this way stays in the portal's document list, because the admin route does not take child rows (fake default, unproven live); it is never mirrored.

### Workbench: CIQ Service Request

`Payload_JSON` per `Request_Code`. The actor is always the row's platform `_created_by`. A row changed by another user (`_modified_by` ≠ `_created_by`) is refused: a waiting row always, a Failed row unless the service's own Failed write-back is still its last write (the service user when trusted; else the stamp the service kept in this process or in host state).

| Code | Payload |
|---|---|
| `case.created` | `{ caseItemId }` (or `Object_Key`). The case item carries the case fields, written at Start |
| `case.cancel` | `{ reason }` |
| `case.reactivate` | `{ reason, dueDate? }` |
| `op.raise` | `{ dept, kind, ref: {sectionId, fieldId?, rowId?, documentId?, label}, question, justification, dueDate, responsibleId?, findingId? }` |
| `op.accepted` | `{ opId, text? }` |
| `op.returned` | `{ opId, text }` |
| `op.notaccepted` | `{ opId, text }` |
| `op.edited` | `{ opId, patch: {question?, justification?, dueDate?, responsibleId?} }` |
| `op.closed` | `{ opId, reason }` |
| `review.completed` | `{ dept }`. The reviewer first wrote and submitted its own CIQ Review step: `RMES_Decision`/`_Reason` for SAF/REG; for RMM, `Rejection_Handling` "Continue to final release" with `Rejection_Note` |
| `review.reopen` | `{ dept, reason }` |
| `review.reassign` | `{ dept, toUserId, reason }` |
| `section.add` | `{ dept, sectionId, justification }` |
| `rmes.saved` | `{ dept, results: [{criterionId, result, comment}], findings: [{op: "add", criterionId, text} \| {op: "close", findingId}], decision?: {value: "approved"\|"rejected", reason} }` |
| `supplier.changed` | `{ contactUserId, supplierCode?, change: "email"\|"deactivate"\|"reactivate", before: {email?, active?}, after: {email?}, replacementUserId? }`. Filed after the administrator changed CIQ Supplier. `contactUserId` and `replacementUserId` are Kissflow user ids. `supplierCode` (optional, new 15 Oct) names the supplier whose contact is meant. It is required only when the portal user is a contact of several suppliers; without it such a request is refused |
| `config.published` | `{ releaseRowId }` |
| `reminders.run` | `{}` |
| `followup.started` | `{ reportId, newCaseCode }` |

### Final document seal

`Final_Document_Hash` is the SHA-256 of the canonical JSON of `Final_Document_JSON`, exactly as stored. The Workbench recomputes it with WebCrypto.

The PDF's own SHA-256 goes into the "Final PDF" audit row.

## Runbook

All commands run from the project root.

**Dry run** (reads only; kf.mjs refuses every non-GET; no file transport):

```
node kissflow-build/sync/run.mjs --once --dry-run [--case CIQ-2026-0001]
```

What it does:
- It prints verifyIds, the heartbeat and the intended writes. The details go to `kissflow-build/sync/.state/dry-run-log.jsonl` and `verify-ids.json`.
- Form lists are POST routes, so a dry run cannot list Forms. The work list is therefore empty in dry-run.

| Task | Command |
|---|---|
| Start, live (UAT only, on Thomas's go) | `CIQ_SYNC_LIVE=1 node kissflow-build/sync/run.mjs --loop` (every 60 s; reminders hourly; closed cases every 15 min). Without `CIQ_SYNC_LIVE=1` the runner refuses to run live |
| Stop | Ctrl-C or SIGTERM. The current pass finishes its item; every handler is idempotent, so stopping mid-pass is safe |
| Run now | `… run.mjs --once` |
| Replay a case | `… run.mjs --replay CIQ-2026-0001` (re-runs every idempotent effect of the case's current state) |
| List failed requests | `… run.mjs --list-failed` (status Failed: attempts 1–3, the error in `Result_Note`) |
| List dead letters | `… run.mjs --dead-letters` (unsent after 3 attempts; the run log alerts once per mail) |
| Check the ids | `… run.mjs --verify-ids` (GETs only) |
| Seed rows | `node kissflow-build/sync/run.mjs --seed`, then import `seed-out/*.json` on Thomas's go (the service never writes them) |
| S-8 sizes | `node kissflow-build/sync/run.mjs --s8` |
| Rebuild the engine after a prototype change | `node kissflow-build/sync/build-vendor.mjs` (records source hashes in `vendor/PROVENANCE.json`) |
| Tests | `node --test kissflow-build/sync/test/` (offline, on the fake; includes the live-e2e driver's scenario on a fake set up like the dev sandbox). It includes the identity golden (`test/golden/identity-noop.json`, re-captured only on purpose with `CIQ_GOLDEN_WRITE=1`) and a split-all re-run of the scenario files (`CIQ_TEST_SPLIT_ALL=1`: every contact minted, the fake strict about user ids) |

### Live end-to-end test (dev sandbox, on Thomas's go)

`live-e2e.mjs` walks ONE throwaway case through the whole CIQ against live Kissflow and then deletes everything it created. In dev the key acts as the dev user (Thomas, `UsEJUfjYLM8Y`): a member of every app role and the only portal Supplier user, and the only contact of the fictional dev supplier `ZZT-SUP-DEV` (`dev-supplier.mjs`). So the driver plays RMM, every reviewer and the supplier with the key:
- a human "save" is the admin-route PUT (what the portal UI's SDK `updateItem` or the Workbench writes); the key cannot write after Start through the assignee route (P1, `050313`);
- the human step is then submitted with the key, with the instance id of the admin GET (S-5);
- file questions and requested documents get a "Cannot provide" justification; one OPTIONAL attempt attaches a file to `CIQP_Request_A00.Supplier_Files` and adds its Uploads row through the admin route (unproven), recorded PASS/FAIL without failing the run.

Between the acts the real service runs (`runOnce({ caseCode, caseOnly: true })`: no notes, retries or dead letters of other cases).

| Task | Command (from the project root) |
|---|---|
| Preflight (reads only) | `CIQ_SYNC_LIVE=1 node kissflow-build/sync/live-e2e.mjs --step 0 [--case ZZT-E2E-0001]` |
| One step | `… --step N` (1–7; every earlier step must have passed; `--force` skips that check, never the preflight) |
| The whole walk | `… --all` (steps 0–7; steps passed earlier are skipped; stops at the first failed check) |
| What exists for the case | `… --status` |
| Clean up | `… --cleanup` (= `--step 9`) |

Steps: 0 preflight (verifyIds 17/17, Release row RS-2026.1 + v1 Published, the dev user in every role the walk needs, the dev supplier and its single contact, the mail integration noted as not readable, nothing with the case code yet) · 1 RMM creates the case at Start + `case.created` · 2 the supplier fills in (no mail) · 3 completeness → reviews, RMES rows, C-02/C-03, scope run · 4 Safety raises → two query rounds → accepted (C-04…C-07) · 5 RMES + every review → final release (C-11) · 6 the release → final document, seal, PDF (downloaded, `%PDF`), case completed (C-13/C-14) · 7 a change report (C-17).

Rules it keeps:
- Without `CIQ_SYNC_LIVE=1`, or with a case code outside `ZZT-E2E-####`, it refuses before any call.
- ≥ 1 s between ALL calls: the driver's port and the service's port share one pacing and back-off state (`createPort({ pace })`; the gate queues parallel callers). The first 429 (JSON or the Cloudflare challenge) stops the run (exit 3). The back-off is kept in the ledger, so a re-run before it ends is refused without a call.
- The ledger `.state/live-e2e-<case>.json` records every item the driver creates right after the create, the service's item map after every read, the progress of every human act (a re-run never repeats an act) and each step's result. It holds ids and keys only. The service state and run log of the test are `.state/live-e2e-<case>-service-state.json` and `-run-log.jsonl`.
- Every printed line masks e-mail addresses; the dev user's e-mail is read from the role GET at run time.
- `--cleanup` finds the items through the ledger, the Case Data `Sync_Note` item map and the links on the items, and the Form rows by `Case_Code` (RMES, Scope Run, Outbox, Audit, Notes, Service Requests, Case Data last). It reads each one first and deletes it only when its `Case_Code` IS the run's code: process items by the admin DELETE, Form rows by the Form DELETE. Then it verifies 404 / absence. It never touches CIQ Supplier, CIQ Config Version or Help rows.
- Every item the service creates is also recorded in the driver's ledger the moment Kissflow gives it its id (`createPort({ onCreated })`), so an item whose create was cut off by a 429 before the service's own checkpoint is still cleaned up. Process items cannot be listed by `Case_Code` (P5), so this ledger, the Case Data item map and the links on the items are the only ways to find them.
- A re-run of a step resumes an act that a 429 interrupted: a Service Request is looked up by its key before it is filed again, and a step that is no longer at the expected step is not submitted again.
- Exit codes: 0 all PASS · 1 a check failed · 2 refused · 3 stopped on a 429.

Expect about 1,700 calls for steps 0–7 (about 30 min at 1 s pacing, measured on the fake) and about 150 for the cleanup. Every step assigned to the dev user also lands in Thomas's own Kissflow queue and notifications. If the mail integration is on, every mail of the run reaches his address.

**Heartbeat.** One line per pass:
- requests seen, done, refused, failed and deferred;
- the cases polled and what happened;
- notes, reminders, retries and dead letters;
- reads, writes, re-applied writes and warnings;
- `ABORTED` after a 429.

The Workbench "Service late" check reads the newest Done Service Request (§8.4).

**On a 429** the pass stops at once and writes nothing more:
- the HTML challenge backs off 10 min;
- Kissflow's JSON 429 backs off 1 min.

Waiting requests stay waiting; a 429 never marks a request Failed.

## Hosting

| Environment | Where | Key |
|---|---|---|
| Dev (tonight) | Thomas's Mac, `--dry-run` only | `.env` through kf.mjs |
| UAT (from 26 Oct) | AWS Lambda + EventBridge (1 min); else Google Apps Script (1-min trigger) | The host's secret store, under a dedicated "CIQ Integration Service" user in the Integration service role only (P14) |

Notes for both:
- The key is never logged, printed, stored or committed.
- The S-2 transport builds the key headers in-process.
- The signed download URL is fetched with the key only when its host is the Kissflow host.
- The host's storage keeps `.state/state.json`: the notes cursor, the last reminder run, the dead letters already alerted, and per Failed Service Request the stamp of the service's own write-back (`_modified_at`, `_modified_by` and a hash; no field value). It holds no secret. A lost state only means a replay. Without `CIQ_SERVICE_USER_ID` (or with a distrusted one), a lost state also means that a Failed request filed by someone other than the key's user can no longer be told from another user's edit: it is refused rather than retried, and is filed again.
- `CIQ_SERVICE_USER_ID` (optional) names the key's own user. The "holder wrote it in the last 2 s" check then ignores the service's own writes exactly.
- That user is **distrusted automatically** when it is also a person of the directory: a role member or a portal contact, as in dev, where the key's user is Thomas. Then `_modified_by === CIQ_SERVICE_USER_ID` proves nothing. An item then counts as the service's own only while it is exactly as the service read it back after its own last write (same `_modified_at`, `_modified_by`, status, step and fields). A time comparison is not enough: live `_modified_at` has whole seconds, so it cannot tell the holder's write in the same second from the service's. The 2 s quiet window starts at the end of that second. That user's portal writes are attributed by the portal's e-mail fields only. With the dedicated UAT user (Integration service role only) it stays trusted.

## Open dependencies (plan §14)

- **S-1: real-user SDK writes.** These are assumed by the fake:
  - reviewers write and submit their own step;
  - raisers submit accept and close;
  - the portal UI saves answers and uploads into `Supplier_Files`.

  If S-1 fails:
  - H-06 still writes the point's fields through the admin route (implemented), but the ending submit stays the raiser's;
  - a completion that never reaches the item cannot be applied: H-08 marks the request Failed and retries it.
- **S-2: proven live 14 Oct and implemented:**
  - supplier files are copied to `CIQ_Case_A00.Supplier_Files`, recorded as `Doc_Attachment_Id`;
  - the final PDF goes to `CIQ_Case_A00.Final_PDF` before the case's last submit.

  Writing a completed item stays untested, and the service never does it.
- **S-3: the mail integration (Email action, field-mapped To).** Until it runs, no row gets `Sent_Status`. Every mail is then retried as `#2` and `#3`, and then becomes a dead letter. This is expected noise until Thomas switches the integration on.
- **S-5: proven for the admin PUT and withdraw on portal items.** Still open: rerouting a task when `Assigned_Contacts` changes mid-step (H-18 replacement). That needs a second supplier user (S-7).
- **S-11: field-assigned app steps (V-19 b, `Raiser_Assignee`).** The service does not depend on it. With role assignment the Workbench and the service enforce raiser-only (D-05; tested).

## Gaps and assumptions (to settle with the app session)

| Gap | Detail |
|---|---|
| `CIQ_Case_Data_A00.Sync_Note` must be a Textarea | It holds the service ledger JSON: the canonical extras plus the bookkeeping, a few KB to about 20 KB. Plan §4.4 lists it without a type. A `Sync_State_JSON` Textarea would do the same |
| Expected ids of tonight's objects | `CIQ_Review_A00`, `CIQ_Case_Data_A00`, `CIQ_Mail_Outbox_A00`, `CIQ_Service_Request_A00`, their child table ids (`CIQ_Case_Data_A00_<Table>`) and the v5 fields. Check them with `--verify-ids` |
| RMES Findings have no own key column (P9) | Rows are matched by the linked OP key, criterion and text |
| RMES rows are created for both SAF and REG | This happens whenever the prototype creates the RMES record. The prototype creates both criteria sets at once; plan §4.10 says "when SAF or REG gets a track" |
| Internal users' e-mails | They come from the role GET user objects. Observed in the 14 Oct dry-run: the role GET returned its member (Thomas) with an e-mail. A user without one gets no mail and a warning |
| Failed-request attempts | There is no attempt field on CIQ Service Request (§4.13), so the count is kept in `Result_Note` ("Failed (attempt n/3): …"). An `Attempt_No` Number field would be cleaner |
| Change reports | `Change_Report_Text` holds only the latest report. Two reports within one poll interval (1 min) lose the first |
| Dry-run cannot read the work queue | The Form list route is a POST, and the read-only kf.mjs client may only GET. A GET form view (`/form/2/{acc}/{form}/view/{viewId}/list`) on CIQ Service Request and CIQ Case Data would let a dry-run see the queue |
| The final PDF | Written by `pdf.mjs`, a small pure-JS writer. pdf-lib was not installed, because adding an npm package needs Thomas's OK |
| E-mail change of a shared user (dev only) | One Kissflow user has one e-mail. When it changes, the role GET already shows the new address for the internal user. Since 26 Oct the prototype's contact check (`suppliers.ts` `validateContact`) only wants an e-mail unique within one supplier, and the same address may also belong to a Beiersdorf user. A `supplier.changed` "email" for the contact side is therefore applied like any H-18 change: GEN-008 and the case e-mails of open cases get the new address (tested). Portal users in UAT and production are external, so this does not arise there |
| A 429 between a create and its checkpoint (found 15 Oct by the live-e2e driver's test) | `createAndSubmit` is create + submit + read-back, and the item id reaches the ledger only after all three. A 429 (or any error) after the create leaves an item the ledger does not know, and the next pass creates it again: on the fake, a second round-1 CIQP Query, the first one left at "Supplier: respond". The live-e2e driver records every create through `createPort({ onCreated })`, so its cleanup removes the orphan. The service itself should checkpoint the id right after the create and submit an item it finds still at Start |
| `contact:<key>` ids | A contact without a portal user id still reaches `Assigned_Contacts` under its synthetic id. That is a separate change, outside the identity contract |
