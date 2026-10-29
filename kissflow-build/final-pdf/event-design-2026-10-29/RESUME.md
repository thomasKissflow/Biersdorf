# Paused 29 Oct: the final PDF by events (resume here)

**Kissflow-internal.** Thomas paused the work before the build. Nothing has been written to Kissflow for this change. The two skeleton integrations, CIQP Request and both UIs are exactly as they were. The dev UIs are app `ciq-app-ui-cfd65e5766` and portal `ciq-portal-ui-233cc982e5`.

## What Thomas asked for (29 Oct)

The 5-minute polling goes. Instead:
1. **"CIQ Case Item exits final step – final release PDF Email"** (`CIQ_Case_Item_exits_final_step_fin_A00`, app, skeleton, OFF) POSTs the case instance id to the Apps Script web app (`doPost`).
2. **The script** reads the case, builds the PDF, and attaches it to the app case (`CIQ_Case_A00.Final_PDF`) and to the portal request. It writes the hash and the audit row.
3. **The script** then calls **"CIQ Case - Send Final Release to RMM"** (`CIQ_Case_Send_Final_Release_to_RMM_A00`, app, skeleton, OFF): webhook → Search an item → Get user data → Send an email, with the case's Final PDF attached.
4. **Both integrations are skeletons:** finish and test them.

## Thomas's decisions

| Question | Decision |
|---|---|
| The PDF in the portal | A new Attachment field `Final_PDF` on `CIQP_Request_A00`, read-only for the supplier, and a "Download final PDF" link in the portal's released view (portal UI deploy to dev). |
| What the supplier gets | A **supplier-safe copy**: the same content, but Beiersdorf people shown only as "Beiersdorf" plus their department, with no names or e-mail addresses. It has its own seal. The app keeps the full internal PDF. This is data-model plan row 13. |
| Who gets the e-mail | **All members of the RMM role** (`RoEKl83f9jPF`, "Raw Material Manager (RMM)"), as in the skeleton. |
| Trigger | Change integration 1's trigger to **"When an item completes its workflow"** on CIQ Case, in place of "exits this step". The script itself checks the release. |
| Google side | **Thomas** creates the project, pastes the files, types the keys, the token and integration 2's webhook URL into Script Properties, and deploys the web app. He builds integration 1's HTTP step (the URL, and the token in the JSON body) in the builder himself. The URLs and the token never pass through the agent or the repo. |
| Dev end-to-end test | `ZZT-NT2-STAGE4-RELEASE-ASKED`. Case `PkEPcDsJ2BhM` is at "Beiersdorf review and final release". Request `PkEPcEZhdCwx` is at "Supplier: give the final release", assigned to Thomas `UsEJUfjYLM8Y`. It is the last release-asked case in dev. |

## Live facts (29 Oct, read-only)

- **The RMM role has 0 members in dev.** Thomas holds only Business administrator.
- **Integration service is empty.** I-7's "Skip and complete" probably needs a member, as I-2's Approve does.
- **Integration 1:** its trigger was "When an item exits this step" (`Activity_gwgj5o`). Its HTTP POST step is empty and has no connection; its fields route answers "IntegrationConnection not found".
- **Integration 2:**
  - the webhook trigger is not tested and has no output;
  - Search has no mapping;
  - Get user data has `user_ids` [["RoEKl83f9jPF"]] with placeholder test output only;
  - Send an email shows To*, Subject*, CC, Bcc, ReplyTo, From, Attachments and BodyType*, and its body field appears only after BodyType is bound.
- **CIQP Request has no Final_PDF field.** Its draft (published 27 Oct 11:40) is saved here as `CIQP_Request_A00.draft-2026-10-29.json`. Re-read the live draft before the graft.

## The designs (in this folder)

- `designs.json`: 4 designs (script, portal, integrations, e2e), each with a critic's corrected version (`corrected`) listing changes, tests, unknowns and risks.
- `Code.event-draft.gs`: the critic-corrected event-mode `Code.gs`. It is a draft, not tested in the project. `Code.corrections.diff` and `script-diffs/` hold the test stand-in diffs.
  - **Covered:** `doPost` queues `Q_<id>` and answers at once. `drain` runs from a one-off `after()` trigger and deletes its triggers first. The portal copy goes to the request whose `App_Case_Item_Id` is the case. The RMM webhook is sent once, under the before/after marks. MailApp is used only for admin alerts. `tick`/`installTrigger` are removed, and `probe()` lists released cases without a PDF.
  - **Still missing:** the **supplier-safe copy** render (decided after the design) and the **completes-workflow** trigger (no code impact).
- `add-final-pdf-field.DRAFT.mjs`: the portal field graft. **Two known bugs to fix before use:**
  1. The published read-back must parse `{CIQP_Request_A00: {Fields: [...]}}`.
  2. The `--apply` re-read must be followed by ≥3 s before the PUT, with the 429/HTML check on the PUT.
- `e2e-fd-event.DRAFT.mjs`, `plan-blobs.mjs`, `rmm-pick.js`, `rmm-mail-text.js`: drafts for the end-to-end test and for integration 2's steps.

## Corrections the critics found (carry them into the build)

1. **Integration 2's Search connection:** use "Kissflow Process - Thomas Access Keys - Trigger" (`CnEPk_z1eYLu`), the app connection for app processes, not "For Portal Actions".
2. **The token goes in the JSON body.** Apps Script gives `doPost` no request headers.
3. **Apps Script always answers 200, behind a 302** to `script.googleusercontent.com`. Check Kissflow's HTTP step against the Apps Script Executions page.
4. **A new deployment version is needed after each code paste,** or `/exec` keeps running the old code. Workspace may block "Anyone" access: check the Deploy dialog.
5. **Triggers:** 20 per user per script, and `after()` is a minimum only. The drain must delete its own trigger.
6. **The script's key needs process-admin on `CIQP_Request_A00` too.** The prod push must carry the new field and integrations. Prod integration 1 stays OFF until prod integration 2 is live.
7. **Keep integration 1's draft out of the public repo:** no backups under `night-2026-10-20/integrations/backups/`. `integ-lib`'s `call()` logs answers to a jsonl on disk. Read integration 1 only with `kf.mjs`, and print it scrubbed.
8. **Safety net without polling:** a manual sweep (never scheduled), plus `probe()`'s list of released cases without a PDF.

## Next steps, in order

1. **Coordination:** message the app session ("App Builder - CIQ Digital") that this session writes `CIQ_Case_Item_exits_final_step_fin_A00`, `CIQ_Case_Send_Final_Release_to_RMM_A00` and `CIQP_Request_A00`. Update `docs/kissflow-data-model/kissflow-data-model-plan.md` first: the Final_PDF field, row 13 = supplier-safe copy, and the event flow.
2. **Code (offline, in parallel):**
   - (a) `Code.gs` from `Code.event-draft.gs`, plus the supplier-safe copy (a transform in `final-pdf/src/entry.ts`, rendered with the same writer, its own seal), with tests in `test/offline.mjs`;
   - (b) the portal "Download final PDF" link (`prototype/src/portal`), with its tests and harness;
   - (c) rebuild `Bundle.gs` last, because portal data files are among its sources; then the full gate.
3. **Kissflow (dev, one writer, ≥3 s pacing):**
   - (a) the Final_PDF graft: fix the script, dry run, `--apply`, read back;
   - (b) integration 1's trigger changed to "completes its workflow";
   - (c) integration 2: Search (`CnEPk_z1eYLu`), Get user data, the mail text and Send an email (Attachments = the search's Final_PDF). Capture its webhook sample with `rmmWebhookSample` from Apps Script while the builder listens.
4. **Deploy the portal UI to dev,** then read it back.
5. **Thomas, in Google and dev:**
   - the Apps Script project and web app;
   - integration 1's HTTP step in the builder;
   - integration 2's URL into Script Properties;
   - add himself to the app roles **Integration service** and **RMM**, and to the portal **Supplier** role, for the test.
6. **Step tests:** the e-mail test really mails, so only to Thomas. Then publish and switch on with Thomas.
7. **End-to-end on STAGE4:**
   - give the release, then follow the chain: I-7 → the case completes → integration 1 → the script → the PDF on the case and the request (supplier-safe), the hash, the audit row → integration 2 → the mail;
   - read every link back;
   - if a link fails, finish with `runOnce` / the portal copy entry, never by re-releasing.
8. **Docs:** README (event mode, Google set-up), TEST-GUIDE-PROD row 16, PROD-MORNING, HANDOVER, and memory. Then commit; Thomas pushes.
