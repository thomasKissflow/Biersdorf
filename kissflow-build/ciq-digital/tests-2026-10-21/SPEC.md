# Overnight live tests, 21 Oct (app session)

**Kissflow-internal.** These are Thomas's instructions, 21 Oct. Run every test. Create items at different stages for every case and every data object, and run several of each. Check that data is stored in the forms, that everything is named properly, and that nothing is corrupted. In the morning, give him the list of things to clean up. The portal can't be tested in prod, so simulate it here in dev. After the push to prod he tests only the app ↔ portal connectivity himself. Don't instruct the portal session; it has its own prompt.

## 1. Hard rules (every script, every agent)

**Where:**
- Dev sandbox only: account `AcDOSunMEpSA`, host `dev-beiersdorf.kissflow.eu`. The client refuses any other account or host. Never touch `beiersdorf.kissflow.eu`.

**Credentials:**
- Read them only through `kissflow-build/lib/kf.mjs` (`client({readOnly:false})`). Never read `.env` yourself.
- Never print, log or store a key, a secret, or a **webhook URL**. The request log redacts any `https://…` that isn't a Kissflow REST path. Results name hand-offs by code only.

**Pacing:**
- **One** global serial queue, with at least **2500 ms** between Kissflow REST calls. The portal session shares the key; its snapshot got a Cloudflare 429 at 1.3 s pacing.
- Webhook POSTs count as calls too.
- A 429, or any HTML body ("Just a moment"), throws `StopError`. The run stops at once and writes its checkpoint. Nothing calls Kissflow for 20 minutes after that.
- No automatic retry on 429.

**Allowed writes:**
- Creating, updating, submitting or withdrawing items in the app's process and form flows: CIQ Case, CIQ Review, CIQ Open Point, CIQ Audit Event, CIQ Internal Note, CIQ RMES Safety/Regulatory, CIQ Supplier, CIQ Scope Run (written by ensureReviews).
- Updating, submitting and admin-PUTting portal items (CIQP Request, CIQP Query, …), but only items named in **this run's ledger**. The portal integrations create them, and the ledger records them when the run reads their ids back.
- Deleting only items in the ledger.

**Never:**
- touch flow metadata, drafts, publish, integrations (no activate/deactivate/test), roles, members, lists or connections;
- write any item outside the ledger. That includes CIQ Config Version / SET:current, the "ZZT Dev Supplier" Thomas uses, Thomas's own suppliers ("12343Thomas Supplier", "Test 1234"), the portal session's ZZT items, and the flow "CIQ Case - Thomas".

**Data:**
- Fictional only. Every text starts `ZZT-N21`, and every case code, supplier code and key carries the run tag `ZZT-N21-<run>`.
- People are fictional names. The one real user is Thomas (`UsEJUfjYLM8Y`, the key's user), who stands in for every role and for the supplier contact.

**Ledger:**
- `kissflow-build/ciq-digital/tests-2026-10-21/ledger.jsonl`, append-only: `{at, run, flow, app, id, what, stage}`.
- An item goes in at the moment its id is known, before any further call.
- Cleanup reads only the ledger.

**Fidelity:**
- Payloads come from the app's OWN code: `src/app-live/write/*` (liveWriters, ensureReviews/ensureRmes/ensureRelease, encode) on states built by `src/domain/actions`. Read-backs go through `src/app-live/load.ts` and `map/toAppState.ts`. Never hand-craft an app payload.
- The supplier side uses the portal's OWN code where it can (`src/portal/data/liveActions.ts` with a key-backed PortalClient). Where it can't, admin-PUT exactly the fields the portal writer would write, and say so in the result.

**Honesty:**
- Every result is `pass`, `fail` (with the exact Kissflow answer), `blocked` (with the platform reason, e.g. "050201: the step is held by role X, which has no members"), or `not-run`.
- Never mark a step pass without a read-back.

## 2. Platform facts these tests rely on (proven earlier; re-check, don't assume)

**Routes:**

| Purpose | Route |
|---|---|
| Create a process item | `POST /process/2/{acc}/{proc}?_application_id=…`, answers `{_id, _activity_instance_id}` |
| Update at a step the key user holds | `POST …/{proc}/{id}/{act}` |
| Submit | `POST …/{proc}/{id}/{act}/submit` with body `{}` |
| Admin read | `GET /process/2/{acc}/admin/{proc}/{id}?_application_id=…` |
| Admin write | `PUT /process/2/{acc}/admin/{proc}/{id}?_application_id=…` (writes ReadOnly fields too: P-RO) |
| Withdraw | `POST …/{proc}/{id}/withdraw` with body `{Comment}` |
| Delete a process item | `DELETE /process/2/{acc}/admin/{proc}/{id}?_application_id=…` (any step), then GET 404 |
| My items | `GET /process/2/{acc}/{proc}/myitems?page_number=&page_size=&_application_id=…` (sparse rows) |
| Form list | `POST /form/2/{acc}/{form}/list?page_number=&page_size=&_application_id=…` with body `{}`. **No child tables in list rows.** |
| Form read | `GET /form/2/{acc}/{form}/{id}?_application_id=…` (has child tables) |
| Form create | `POST /form/2/{acc}/{form}?…` (the user's single draft), then `POST …/{draft}/submit` with body `{}`, which gives a NEW id |
| Form update | `POST /form/2/{acc}/{form}/{id}?…` (child rows as `Table::<model>` deltas, as the app sends) |
| Form delete | `DELETE /form/2/{acc}/{form}/{id}?_application_id=…` |

**No known REST route for:**
- the admin list (the SDK's `getAdminItems`);
- My tasks (`getMyTasksItems`).

The live client emulates them:
- `adminList(f)` = `myitems`, plus an admin GET of each row. Every test item is created by the key user. Report it as **approximated**.
- `myTasks(f, activityId)` = the items (from adminList) whose `_current_context` has an instance at `activityId` assigned to Thomas, directly or through a role Thomas holds. The roles are read live at boot; see below.

**Who holds which step:**
- **Roles read live at 02:30 IST, 21 Oct:** Thomas is a member of **Business administrator** (app) and **Admin** (portal) only. **Integration service has NO members** (it still had Thomas on 20 Oct). Every other app role is empty, and so is the portal Supplier role.
- **CIQ Case:** "Waiting for supplier: CIQ" and "Beiersdorf review and final release" are held by Integration service. The key can therefore NOT move a case past Start.
  - I-2's last action (Approve "Waiting for supplier: CIQ") is expected to fail with 050201, so record it as **blocked: Integration service has no members**. Its earlier actions (the completeness fields, the 15 fields, phase Review) still run, so check those.
  - **Since 25 Oct, the reviews come after that Approve:** E-A's bulk create is I-2's last step. While the Approve fails, I-2 writes its review.started row and creates **no review**. S-CASE 5 and S-OP S4 are then **blocked**, and the steps that need a review (the RMES 6a/6b, 7–9, every open point) don't run. This was proven on 29 Oct, R2: the run history shows "Approve an item" Failed ("This item has moved out of your queue") and no bulk create. Offline, S-OP holds the case steps in every run, so the points are still rehearsed.
  - I-7's Skip and complete still ends a case from any step.
  - Don't re-add Thomas to the role: that is his decision, and it's on his morning list.
- **CIQ Open Point:** every department step is held by the field **Raiser_Assignee**. With Thomas as raiser, the key can act.
- **CIQ Review:** department steps are held by the reviewer roles, which have no members. The key can only start a review. Completing one gives 050201, so that test is expected to be **blocked** (Thomas tests it in the UI). Admin PUT can still write the fields the step would write, so the formulas (Review_Gate) can be checked.

**Other behaviour:**
- The key route doesn't enforce ReadOnly at Start or Mandatory on submit. The app's own gates (assertMandatory, guards) are what is under test.
- DateTimes go without milliseconds. Kissflow returns numbers as strings sometimes, and users with Name.

**Hand-offs:**
- Webhook URLs:
  - app codes: `SET:current` → `Payload_JSON.webhooks`, read by the app's own `webhooksOf`;
  - portal codes: `src/portal/kf/portal.ts` `webhooksFor(DEV_ACCOUNT)`.
- POST with `Content-Type: text/plain` and body `JSON.stringify(payload)`, like the app's `postWebhook`.
- The integrations run asynchronously, usually in 5–15 s. Poll the target with an admin GET every 6 s, for up to 60 s.
- All 12 integrations are ON. Each run checks this read-only at its start: `GET /flow/2/{acc}/integration/?_application_id=…` for both apps.
- The app integrations are in `kissflow-build/ciq-digital/integrations/SPEC.md`; the portal integrations in `kissflow-build/night-2026-10-20/integrations/STATUS.md`. Read both for each integration's guard.

## 3. Architecture

`prototype/live/`, **not** part of `npm test`: the main config includes only `src/**/*.test.*`.
- `vitest.live.config.ts`:
  - includes `live/**/*.live.ts`;
  - the same `@` alias as `vite.config.ts`;
  - Node environment;
  - `fileParallelism: false`, `sequence.concurrent: false`, a long `testTimeout` (20 min), no retries.
- `LIVE=1` runs against Kissflow. `LIVE=0` (the default) runs against `src/app-live/kf/fakeClient.ts`, with webhooks stubbed by a local fake integration. **Every suite must pass offline before it ever runs live.**
- `live/lib/`:
  - `liveClient.ts`: the `AppClient` over REST (§2), with the pacing queue, guards, StopError, ledger hooks, and a redacting request log at `kissflow-build/ciq-digital/tests-2026-10-21/requests.jsonl`.
  - `livePortalClient.ts`: the `PortalClient` over the same queue.
  - `ledger.ts`.
  - `hooks.ts`: URL lookup, POST, poll helpers.
  - `fingerprint.ts`: pre/post `_modified_at` of every non-ledger item the key can read.
  - `results.ts`: writes `results/<run>/<suite>.json`.
  - `world.ts`: identity = Thomas, holding every persona as the dev role switch would; `actingAs` from `src/app-live/identity.ts`; a "boot" = loadSnapshot + toAppState, like `map/roundtrip.test.ts`.
- A run is `RUN=R1|R2|R3`.
  - **R1 is the showcase.** Its items stay in Kissflow at their stages for Thomas to look at, and the morning list names them with a one-command cleanup.
  - **R2 and R3** vary the data (other departments, outcomes, scopes) and delete their own items at the end, after verification.

## 4. Scenarios

### S-CASE (case lifecycle, app + simulated portal)

1. **Supplier master:**
   - create a run supplier (`ZZT-N21-<run> Supplier`);
   - one contact is Thomas, a self contact (portal user `UsEJUfjYLM8Y`), and one is a fictional placeholder;
   - the app's supplier writers do the create;
   - check every field and contact row on the form GET, and that the list row lacks child tables.
2. **Draft:**
   - createCase whose Start gate fails (a Mandatory field missing) gives a Start draft. Check that it is there with its fields.
   - Discard it (R1 keeps one draft as the showcase "Draft" stage).
3. **Started:**
   - createCase passes; the item is at "Waiting for supplier: CIQ";
   - the audit rows case.created / started exist;
   - `case.started` goes out, and I-1 creates the CIQP Request, which goes in the ledger;
   - the case's `Portal_Request_Item_Id` links to it;
   - check the request's header, bundle, contacts and assignees against the case;
   - check that no `self:` or `contact:` ids leaked: every user field is a real Kissflow id.
4. **Supplier fills in and confirms completeness** (portal writers as Thomas):
   - save answers, which posts request.changed and updates the case's 15 fields;
   - confirm completeness, which runs I-2. The case moves to "Beiersdorf review and final release", with Completeness_* and the 15 fields copied.
5. **Reviews:**
   - as RMM, the app's load effects (ensureReviews) start the reviews the scope needs;
   - each sits at its department step;
   - check the fields against the case.
6. **RMES** (since 28 Oct the RMES is a read-only sheet of 8 fields derived from the case; the criteria and findings are retired):
   - as SAF, then REG, ensureRmes creates the RMES row, header only;
   - check the header on the form GET, that it has no criteria or findings rows, and one "RMES record created" history row;
   - check the sheet the RMES tab derives from the reviewer's view of the case (record line, trade name, one row per component).
   - The decision is on the CIQ Review item, whose step nobody can hold, so step 7 counts it as missing (RMES_Gaps 1).
7. **Review completion:**
   - expected **blocked** (050201). Record the exact answer.
   - Admin-PUT the counts and check Review_Gate.
8. **Release:**
   - `release.requested` goes out the way ensureRelease would;
   - the case gets `Release_Requested_At`; the request gets Release_Flag "Requested", locked, and Release_Contacts.
9. **Final release:**
   - the supplier gives the final release (portal writer, or admin PUT plus I-7);
   - the case reaches End, with Final_Release_* set.
10. **Cancel:** a second case goes to Started, then cancelCase:
    - `case.cancelled` runs, and the request's phase label is locked;
    - the case is withdrawn or ended, as the app does it.

### S-OP (open points, every department in turn across runs)

1. **Raise:**
   - raiseOpenPoint as a department (Thomas as raiser), on a started case;
   - the item is at "Open point – <dept>", held by the raiser;
   - op.round runs, creating a CIQP Query (ledger) and linking `Portal_Query_Item_Id`;
   - check the query's fields against the point.
2. **Edit:**
   - editOpenPoint runs op.edited, and the query's question, due date and note are updated.
3. **Supplier answer:**
   - portal respond writer as Thomas (or admin PUT plus I-4);
   - the point gets Response_* and OP_Progress "In progress".
4. **Decide:**
   - accept: the point ends, history.updated runs, and the request's thread updates;
   - return: round 2, so op.round runs again, a new query is created, Round_No is 2, and the thread has two rounds;
   - close or withdraw while the query is open: op.closed runs and the query is withdrawn.
5. **Thread:**
   - check Thread_JSON (every round's text) on the point;
   - check the questions history on the request.

### S-FORMS

- **Supplier:**
  - edit a contact's e-mail;
  - add a contact; this checks there is no duplicate row (the settle);
  - deactivate a contact;
  - edit the self contact's title, acting as admin, which checks there is no "already used" refusal;
  - check every row on the form GET.
- **Internal note:** add a note and check it is read back.
- **Audit:**
  - every writer's audit row: Action_Code, Ref_Flow_Id / Ref_Item_Id / Ref_Activity_Instance_Id, snapshot JSON that parses, the actor;
  - no `self:` in the JSON.
- **Config:** read only. Check that SET:current has all 8 webhook codes (by code, no URLs).

### S-INTEGRITY (read only, at the start and end of each run)

- **Names:**
  - every flow in both apps follows the rule: app flows start `CIQ `, portal flows `CIQP `;
  - list the exceptions: the spikes, "CIQ Case - Thomas", retired flows;
  - field ids of the flows the app uses match the ids the app's code reads and writes (`src/app-live` and `src/portal`). Report fields the code uses that the flow lacks, and the other way round, per flow.
  - Role names match `ids.ts` ROLES.
- **No corruption:**
  - the non-ledger fingerprint is unchanged from the run's start to its end;
  - every ledger item reads back (or is 404 after cleanup);
  - every JSON field parses;
  - no user field holds a pseudo id (`self:`, `contact:`, `u-…`);
  - dates are valid.

## 5. Deliverables

- `results/<run>/*.json` for each run, and `REPORT.md`: a stage × object matrix with pass, fail, blocked or not-run, and the evidence.
- `MORNING-CLEANUP.md`:
  - every showcase item (flow, id, stage, what to look at);
  - the leftovers, if any;
  - the cleanup command `node kissflow-build/ciq-digital/tests-2026-10-21/cleanup.mjs --run R1` (reads the ledger and deletes in reverse order; dry run by default, `--apply` to delete);
  - what Thomas must test himself: review completion as real reviewers, the UI clicks, and prod connectivity.
