# CIQ Digital: pre-generate spikes (tests before the real app is built)

**Status (2026-10-07, 16:05):**
- The test harness is **live** in CIQ Digital (`CIQ_Digital_A00`).
- The offline compile tests (K-OFF) and the connector check are done.
- The runtime tests need a real user (see "Next").

**Approvals:** Thomas approved test flows in the app, the CIQ Digital target, and the two test integrations, all on 2026-10-07.

**Naming:** everything is named `CIQ ZZ Spike …`, so it is easy to delete later from the front end.

**Records:**
- App Builder run: `runs/zz-spike/` (brd, decisions D1–D15, `generated/` apply log, version v2).
- Read-backs: `spikes/`.

## What is live (read back 2026-10-07, `spikes/readback-harness-result.json`)

| Kind | Name | Id | Notes |
|---|---|---|---|
| Process | CIQ ZZ Spike Case | `CIQ_ZZ_Spike_Case_A00` | Steps:<br>1. Create spike case<br>2. Spike prepare<br>3. **Parallel "Spike review lanes"**: Spike review – A … F (6 branches, roles alternating A/B, conditions `Flag_X = "Yes"`)<br>4. Spike hold check (`Hold_Flag = "Yes"`)<br>5. Spike gated step (Gate Mandatory)<br>6. Spike not-equal step (`Spike_Decision != "Rejected"`)<br>7. End<br>Child table Spike Case Notes, Editable only at Spike prepare |
| Process | CIQ ZZ Spike Point | `CIQ_ZZ_Spike_Point_A00` | Steps:<br>1. Raise spike point<br>2. Spike waiting (`To_Supplier = "Yes"`)<br>3. Spike review<br>4. End<br>Child table Spike Rounds, Editable only at Spike review |
| Form | CIQ ZZ Spike Register | `CIQ_ZZ_Spike_Register_A00` | Register_Case → Case; child table Spike Lines; Open_Lines = SUM(Line_Open) |
| Form | CIQ ZZ Spike Log | `CIQ_ZZ_Spike_Log_A00` | Target of the test integrations |
| List | CIQ ZZ Spike Yes No / CIQ ZZ Spike Decision | `CIQ_ZZ_Spike_Yes_No_A00` / `CIQ_ZZ_Spike_Decision_A00` | Display names are clean (no " A00") |
| Role | CIQ ZZ Spike Role A / Role B | `RoEKHLFdFsUJ` / `RoEKHLGDsV2J` | The engine added Thomas (developer `UsEJUfjYLM8Y`) to all 4 roles, so he can act |
| Integration | CIQ ZZ Spike log – register created / – point completed | `CIQ_ZZ_Spike_log_register_created_A00` / `CIQ_ZZ_Spike_log_point_completed_A00` | **Created incomplete** (no trigger, no action), not live. They must be finished in the builder |

## Results so far

| Test | Result | Evidence |
|---|---|---|
| **K-09f-def** connector definitions | **[verified: metadata]**<br>• Dataform connector: triggers ItemCreated, ItemUpdated, ItemDeleted; actions Create, Update, Fetch one, Fetch many, Delete.<br>• Process connector also has ItemSentBack, ProcessStepBeforeEnter, SlaBreachedStep, Approve an item, **Skip and complete**, **Create and submit items in bulk** | `spikes/k09f-dataform-connector-result.json` |
| **K-OFF** six parallel branches with branch-scoped permissions | **[verified-offline]** and **published live** [verified: read-back]. Each branch has its own Mandatory/Editable lane fields; everything else is ReadOnly | Read-back |
| **K-OFF** condition on a formula field; `!=` condition | **[verified-offline]**, published live | Read-back: `Hold_Flag = "Yes"`, `Spike_Decision != "Rejected"` |
| **K-OFF** Mandatory formula field (Gate) | **[verified-offline]**, published live. Whether it refuses a submit at runtime is K-20 | Read-back |
| **K-OFF** child-table step permissions | **[verified-offline]**:<br>• a step permission can name the **child table only, not its columns** (column keys are rejected: `STEP_PERM_FIELD_MISSING`);<br>• the columns get no permission of their own.<br>Whether the columns render live is still open | `runs/zz-spike/decisions.md` D12 |
| **K-OFF** embedded SUM on a Form (Open_Lines) and formulas over an aggregate | **[verified-offline]**, published live | Read-back |
| **K-OFF** **cross-flow SUM** (Case.Open_Count over Register.Open_Lines) | **[verified-live: WRONG]** App Builder publishes the aggregate pointing at the **case itself** (`LHSModel = CIQ_ZZ_Spike_Case_A00`), not at Register. It isn't expressible in App Builder 1.0.0; it needs a REST graft that re-points it, and only after that can K-20F test it | Read-back `openCountQuery` |
| Header field and child column with the same id (Round_No) | **[verified-offline]** The child column overwrites the header field. Use distinct ids | D-entries of the data architect |
| List display names | **[verified-live]** IR list ids without `_A00` compile and publish with clean names | Read-back |
| App Builder integrations | **[verified-live]** Created **incomplete** (no trigger, no action) and not live. So every CIQ integration has to be finished in the builder or over REST anyway | Apply report + read-back |
| App Builder auto-grants | **[verified-live]** Apply creates "All Items" report View grants per role, and adds the connecting developer to every role | Apply log |
| `--force` | Doesn't waive the ≥2-automations floor at apply | Apply output |

## REST changes (Thomas approved "go ahead with both REST changes", 2026-10-07)

| Change | Result | Evidence |
|---|---|---|
| **Open_Count graft:** re-point Case.Open_Count's aggregate from the case to CIQ ZZ Spike Register | **Done [verified: read-back]**. Exactly one entity changed (`AggregateDefinition_1mdoyvz.LHSModel` → `CIQ_ZZ_Spike_Register_A00`); preflight 0 errors; draft PUT 200, publish 200. This also proves that **a published process accepts a clean graft**. Whether the sum computes at runtime is K-20F | `spikes/graft-open-count.mjs`, `graft-open-count-result.json`, `graft-requests.jsonl` |
| **Connections:** one system-api-key connection per connector (Kissflow mints its own key; no credential is sent) | **Created [verified]**: Dataform `CnEKHrH5GzkY`, Process `CnEKHrHqXRKB`. Before this, the account had none | `spikes/integ-1-connections.mjs`, `integrations-state.json` |
| **Test integration "register created"** | **Completed and published [verified: read-back]**:<br>• trigger: Kissflow Dataform `ItemCreated` on CIQ_ZZ_Spike_Register_A00;<br>• action: Dataform `CreateAndSubmitItem` into CIQ_ZZ_Spike_Log_A00;<br>• mapped: Log_Source="Register", Log_Event="created", Log_Item_Id ← `_id`, Log_Key ← Register_Key | `spikes/integ-2..4-*.mjs`, `integration-requests.jsonl` |
| **Test integration "point completed"** | **Completed and published [verified: read-back]**:<br>• trigger: Kissflow Process `ItemCompleted` on CIQ_ZZ_Spike_Point_A00;<br>• action: Dataform `CreateAndSubmitItem` into the Log;<br>• mapped: Source="Point", Event="completed", Item_Id ← `_id`, Key="point", Payload ← Question_Text | same |
| **Switch on** | **Not possible over REST [verified]**: `PUT …/on` gives 403 PermissionDenied, `POST …/on` gives 404. **Thomas switches both on in the Integration builder** | `integration-requests.jsonl` |

**Recipe proven in this account:**
1. Create a connection (SystemApiKey).
2. Save a skeleton (trigger + action with connector and connection).
3. Resolve the trigger and action fields from the server (`form_id` / `process_id` selectors).
4. Bind the source flow and target form (Value + SelectedDropdown).
5. Resolve the target fields again.
6. Map them (Value literals; Field `context.<triggerId>.<field>`).
7. Publish.

This is how the CIQ X/Y/Z integrations can be built too (cross-container ones by the portal session).

## Runtime tests run by Claude (2026-10-07, after Thomas switched both integrations on)

Method: the account key, which acts as Thomas. Scripts: `spikes/runtime-tests.mjs`, `runtime-tests-2.mjs`, `child-table-rest-probe.mjs`. Every call is logged in `runtime-requests.jsonl`. Test items are labelled "ZZT-…".

| Test | Result | Evidence |
|---|---|---|
| **K-09f-run: a Form trigger fires an integration** | **PASS [verified live]**. Creating a Register row fired "register created", which created a Log row with the right item id (`Log_Item_Id` = the Register `_id`). Both test rows fired | `runtime-tests-2-result.json`, Log rows ZZT-114155b-R1/R2 |
| Process create plus Start submit through the key; flags preset at create | **PASS**. The Spike Case `PkEKIVlB5ZUn` sits at "Spike prepare" with the flags as sent (A–C Yes, D–F No) | `runtime-tests-result.json` |
| **K-PC: condition on a Select routes** | **PASS**. A Point with To_Supplier=No skips to "Spike review"; with Yes it lands at "Spike waiting" | Points `PkEKIVviOqQs` / `PkEKIVxRRM9x` |
| **Blank-safe formulas over an empty aggregate** | **PASS**. With no linked lines, Hold_Flag = "Yes" (a blank holds) and Gate = "OK" (blank counts as 0), as designed | Case `PkEKIVlB5ZUn` |
| **The key acting after Start** | **CORRECTED 2026-10-07 (evening):** the 400 "…anymore" came from a flawed test. It reused the **Start** task id (`PkEKIVlEg0pE`), and **Role A has no members** (read back: Role A UserCount 0; Role B = Thomas). With the right task id the answer is "This item has moved out of your queue". The key acts as Thomas and **can** submit a later step when Thomas is in the step's role: see "Point completed" below | `runtime-requests.jsonl`, `role-check.mjs`, `point-review-result.json` |
| **Child-table rows through REST on a Form** | **NOT POSSIBLE [verified]**. Create and update both answer 404 "field Spike_Lines does not exist"; the alternative key and route shapes (5 tried) gave 404 | `child-table-rest-probe.json` |
| Builder test runs | When the integrations were switched on, the builder ran each once with the sample payload (2 Log rows with item `SampleInstance001`). These are not real events | Log |

**Design impact:**
- **Child tables can be written only by people,** in the Kissflow form or through the Workbench (SDK; still untested, K-WB). Integrations can't write them (C1), and **neither can the sync service's REST key** (verified).
- So in v4:
  - the **Components** rebuild and the **RMES criteria** creation must run in a user session, not in the sync service;
  - **supplier contacts** (child table on CIQ Supplier) must be seeded through the UI or SDK, not REST.

## Child tables over REST, with the front-end shape Thomas captured (2026-10-07)

**Shape** (taken from Thomas's procurement app):
- **add:** `{"_id": item, "Table::<ChildModelId>": [{"_id": "<ChildModelId>_<10 random chars>", "_index": n, "_is_created": true, …fields}]}`
- **modify:** `{"_id": item, "Table::<ChildModelId>": [{"_id": rowId, …fields}]}`
- **delete:** `{"_id": item, "Table::<ChildModelId>": [{"_id": rowId, "_is_deleted": true}]}`

**Routes:**
- Form: `POST /form/2/{acc}/{form}/{item}` (update), or the create/draft call `POST /form/2/{acc}/{form}`.
- Process: `POST /process/2/{acc}/{proc}/{item}/{activityInstanceId}`.
- Reads: `GET /form/2/{acc}/{form}/{item}` returns `Table::<ChildModelId>`.

| Test | Result |
|---|---|
| **Form: add a row with values; modify; add a second and delete it** | **PASS [verified]**: every write returned 200 and the read-back matches, on Register `ZZT-114155b-R2`. Our earlier failure came from using the bare key `Spike_Lines`; the key needs the `Table::` prefix |
| **Form: rows sent in the create/draft call** | **PASS [verified]**: the draft with `Table::Spike_Lines` was submitted and the rows were stored |
| **Process: add, modify and delete a child row** at Start, with the account key | **PASS [verified]**: throwaway Point draft, deleted afterwards. After Start, only the step's assignee can write: the key works there only when its user (Thomas) is in the step's role, which is also the normal assignee path for Workbench sessions |
| **Embedded SUM (Register.Open_Lines)** | **NOT RELIABLE [verified]**:<br>• App Builder's shape (LHSModel = the parent) never computes, at create or after updates.<br>• Re-pointing LHSModel to the child model made it sum **every Register's lines across the form**, excluding the row being created: 1, then 4, then 9 where 3, 5 and 8 were expected.<br>• I **reverted** that change (publish 200, LHSModel back to the parent).<br>The correct per-item shape is unproven; a golden export from a builder-made aggregate would settle it |
| **Cross-flow SUM (Case.Open_Count)** after the graft | **Still blank** [verified]. The case can't be saved by the key after Start, so recalculation on a case save can't be tested by REST |
| Formulas over the blank aggregate (Hold_Flag, Gate) | Computed server-side, as designed: blank → "hold" and "OK" |

**Design consequences** (they replace the earlier "child tables can't be written over REST" note):
1. **Child tables are writable over REST** (sync service, scripts) and by Workbench sessions, with the `Table::` shape. Seeding supplier contacts and rebuilding components by script are back on.
2. **Don't depend on native aggregates** for gates until a builder-made aggregate is captured and proven. Instead, the acting person's Workbench writes plain Number count fields at their own step (for example `Open_Items_Count`, `<D>_Open_Count`), and the gate and hold **formulas** read those. Formulas do compute server-side [verified].

## Runtime tests run by Claude, evening (2026-10-07)

Thomas has no UI to click, so Claude runs the remaining spike clicks over REST, acting as Thomas through the account key. Scripts: `spikes/k-par-test.mjs`, `role-check.mjs`, `point-review-test.mjs`.

| Test | Result | Evidence |
|---|---|---|
| **Role members** (read-only) | **CIQ ZZ Spike Role A has 0 members; Role B = Thomas** [verified]. The earlier note "Thomas is a member of Role A" was wrong | `role-check.mjs` |
| **K-PAR** submit "Spike prepare" on `PkEKIVlB5ZUn` with its real task id `PkEKIVlvJvbY` | **BLOCKED**: 400 "This item has moved out of your queue", because nobody is in Role A. Adding Thomas to Role A was refused by Claude's auto-mode guard (a permission change), so **Thomas adds himself to Role A** (or allows Claude to). Then `node kissflow-build/ciq-digital/spikes/k-par-test.mjs` runs K-PAR and K-19P in one go (A and B submitted at the same moment) | `runtime-requests.jsonl` |
| **Point completed integration**: submit "Spike review" (Role B) on Point `PkEKIVviOqQs` | **PASS [verified live]**: submit 200, the Point is Completed, and the Log row Point / completed / `PkEKIVviOqQs` appeared within about 6 s. This also proves **the key can submit a later step when its user is in the step's role** | `point-review-result.json` |
| **K-09h send-back** on Point `PkEKIVxRRM9x` | **BLOCKED** for the same reason: "Spike waiting" belongs to Role A | — |

## Night tests run by Claude (2026-10-07, 22:50–23:45 local)

**Set-up:** Thomas approved adding himself to **CIQ ZZ Spike Role A** (chat, 2026-10-07 night). Read back: Role A Members = Thomas, UserCount 1; Role B = Thomas. Every test acts as Thomas through the account key. Logs are in `spikes/runtime-requests.jsonl` and `spikes/graft-requests.jsonl`; each test has its own `*-result.json`.

### Parallel steps: K-PAR (fork/join) PASS · K-19P (both lane values kept under simultaneous saves) NOT MET
| Test | Result | Evidence |
|---|---|---|
| **Fork, flags A–C** (case `PkEKIVlB5ZUn`, then `PkEKO1pn5eI1`) | **PASS ×2**: only "Spike review – A/B/C" opened, with the right roles (A: Role A, B: Role B, C: Role A); D–F were skipped | `k-par-result.json`, `k-perm-result.json` |
| **Fork, all six** (`PkEKO9BRmG4z`), all six branch tasks submitted at the same moment | **PASS**: six tasks; all six submits 200; join → hold check → gated step → not-equal step → Completed | `k-par-matrix-result.json` |
| **Fork, one branch (F)** (`PkEKO9ZHq6LV`) | **PASS**: only F; join → … → Completed | same |
| **Fork, NO branch flagged** (`PkEKO9rhUVOf`) | **PASS**: the parallel block is skipped cleanly (no dead end): prepare → hold check → gated step → Completed | same |
| **Simultaneous branch submits** (A+B, B+C, all six) | **PASS**: every submit 200; the join waited for every open branch and fired once |
| **K-19P: lane values kept when two branches save at the same moment** | **NOT MET.** The key can't save lane fields at a branch step at all (D33), and simultaneous writes through the admin route lost updates (see K-RACE). Through a real user's assignee route or SDK it is **[unverified]**. D32 (write-then-verify) is the mitigation | `k-par-result.json`, `k-perm-2-result.json`, `k-par-matrix-result.json` |
| **Conditions after the join** | **PASS**: Hold_Flag "Yes" runs the hold check. Gate "OK" (blank Open_Count counts as 0) lets the Mandatory gate pass. `Spike_Decision != "Rejected"` runs the step when Decision is blank or "Approved", and skips it for "Rejected" | `k-par-matrix-result.json` |

### What the API key can and can't do at steps (it acts as its user)
| Test | Result | Evidence |
|---|---|---|
| Submit a later step when the key's user is in the step's role | **WORKS [verified]**, many times tonight | all |
| **Update fields at any step after Start** through the assignee route `POST …/{item}/{activityInstanceId}` | **REFUSED [verified]**: 400 `KISSFLOW_ERROR_050313` "You don't have permission to update the following fields" for EVERY field, including fields that are Editable/Mandatory at that step (Spike_Decision and Flag_D at "Spike prepare"; every lane field at its own branch). The published step permissions are correct (read back). So this is a limit of the key, not of the design. **[unverified]** for a real user session (native form / Workbench SDK) | `k-perm-result.json`, `meta-CIQ_ZZ_Spike_Case_A00.json` |
| Fields in the submit body | **Ignored [verified]** (the values are not saved) | `k-perm-2-result.json` |
| **Admin route** `PUT /process/2/{acc}/admin/{proc}/{item}` | **WORKS [verified]** at a branch step: any field, regardless of step permission | `k-perm-2-result.json` |
| **Mandatory on submit** | **NOT enforced for the key [verified]**: branch submits with Lane_X_Confirm (Mandatory) blank were accepted. Native-form enforcement is [manual]; Workbench enforcement must be our own | `k-par-result.json` |
| **Reject** `POST …/{act}/reject` `{Comment}` | **WORKS [verified]**: status "Rejected". The "point completed" integration did NOT fire on a rejection | `k-actions-result.json` |
| **Withdraw** `POST /process/2/{acc}/{proc}/{item}/withdraw` `{Comment}` | **WORKS [verified]**: status "Withdrawn"; no completion event | `k-actions-result.json` |
| **Send back** `POST …/{act}/sendback` | **500 in every form [verified]**: 17 body shapes, also after switching `IsSendbackEnabled=true` on the step's model permission (graft on the TEST Point flow, published 200, read back true). Other route forms 404. Send-back by a real user (native form, or SDK `sendbackItem`) is **[unverified]** → Thomas: one native send-back on Point `PkEKOEvnYp7X` ("Spike review") settles it | `k-actions-result.json`, `k-sendback-graft-result.json` |

### Concurrency (K-RACE): Kissflow has no write locking
| Test | Result | Evidence |
|---|---|---|
| Process admin route, two different fields of one item written at the same moment | **Lost updates [verified]**: 9/10 rounds lost one write in the first batch, 0/15 in a later batch (non-deterministic). Both calls answer 200 | `k-race-result.json`, `k-race-2-result.json` |
| Same, with 100 / 300 / 800 / 1500 ms between the writes | 0/16 lost: the window is under about 0.1 s | `k-race-result.json` |
| A write carrying a STALE `_doc_version` | **Accepted [verified]**: no optimistic locking is available | `k-race-result.json` |
| Form route on a submitted row, two fields at once | **5/10 lost [verified]** | `k-race-2-result.json` |
| Child table on a submitted Form row, two writers each add one row at once | **5/5 lost a row [verified]** | `k-race-2-result.json` |
| Drafts (Form create, Process at Start) written concurrently | 0 lost, but not representative (see next row) | `k-race-result.json` |
| **Two simultaneous creates on the same Form by the same user** | **Broken [verified]**: a Form create opens the user's single draft (`draft_<userId>`), so parallel creates collide (409, a 404 on submit, mixed data) | `k-race-2-result.json` |

### Integration
| Test | Result |
|---|---|
| "Point completed" (ItemCompleted) after a REST submit of the last step | **PASS [verified]**: the Log row appeared in about 6 s with the right item id |

### Design consequences (recorded as D32–D34 in `runs/ciq-digital-v4/decisions.md`)
1. **Workbench writes are write-then-verify:** after every save the Workbench reads the item back. If any field or row it wrote is missing, it re-applies the write (up to 3 times), then tells the user. It keeps one write in flight per item and creates Form items one at a time.
2. **The sync service** serializes creates per Form and writes per item, uses the admin route for field writes on in-progress items, and never acts on human steps.
3. **The Workbench enforces Mandatory/gate fields itself** before `submitItem` (the server didn't for the key).
4. **Return / send-back:** the Workbench offers send-back through `sendbackItem`. If that fails, it opens the native task form (`openForm`) where the native send-back button is. The after-generate switch (`IsSendbackEnabled` on OPNT_R_*) is set as tested on the Spike Point; whether it is the right switch stays [unverified] until a real-user send-back.
5. **No model change** is needed before generate: the parallel mechanics work, and the races are handled in the write layer.

## Still needs Thomas (signed in to the sandbox)

1. **K-PAR:** open the task "Spike prepare" on Spike Case `PkEKIVlB5ZUn` (flags already A–C Yes, D–F No) and submit it.
   - Expect tasks only for Spike review – A, B and C.
   - Submit A, B and C; the case should move on.
2. **K-19P:** on a second case, submit two branches within seconds of each other, from two tabs. Both lane values should be kept.
3. **K-20F (aggregate in the builder):** in the Kissflow builder, look at how "Open_Lines" on CIQ ZZ Spike Register is configured, or add a fresh Sum aggregate there (sum of Spike Lines → Line_Open). Then open Register `ZZT-114155b-R2` (it already has one line with Line_Open = 1) and save it in the form.
   - The case's Open_Count should become 1.
   - "Spike gated step" should then refuse the submit (Gate is blank).
4. **Child-table columns:** check that the Spike Case Notes and Spike Lines columns are visible and editable in the form.
5. ~~**Point completed integration**~~: **done by Claude, PASS** (see the evening tests above).
6. **K-09h send-back:** on Point `PkEKIVxRRM9x`, submit "Spike waiting", then send it back from "Spike review".

## Next (needs Thomas)

**Browser check (16:07):** opening `https://dev-beiersdorf.kissflow.eu` in Claude's built-in browser, while signed out, redirects to the **production** sign-in page `https://beiersdorf.kissflow.eu/view/login`. Claude didn't interact with it and closed the tab: never production, and never enter credentials. So the runtime tests below need Thomas to click them, or a browser session where Thomas is already signed in to the sandbox.

| Test | What to do | Pass if |
|---|---|---|
| **K-PAR** fork and join | Create a Spike Case. At "Spike prepare" set Flag_A, B and C to Yes and D, E and F to No, then submit | Only A, B and C get tasks; D, E and F are skipped; after A, B and C are submitted the case moves on |
| **K-19P** concurrent branches | Submit A and B within seconds of each other (two browser tabs) | Both lanes' values are kept |
| **K-20 / K-PC** | Gate Mandatory with Open_Count blank or 0; hold check skipped or run as expected | Behaviour as designed |
| **Child-table columns** | Open the Spike Case Notes and Spike Rounds tables at their editable steps | The columns are visible and editable |
| **K-09h** send-back | On a Spike Point, send back from "Spike review" to "Spike waiting" | Shows whether ItemSentBack and ItemEntersToStep fire (needs a finished test integration) |
| **K-09f-run** | Switch on "CIQ ZZ Spike log – register created" in the builder (it's completed over REST), then add a Register row | A Log row appears |
| **K-14 / K-17** | Need a non-admin test user in Role A or B | Listing and Delete behaviour |
| **K-20F** (after the graft) | Add a Register row linked to a Spike Case, with one Spike Line where Line_Open = 1 | Case.Open_Count = 1, Hold_Flag = Yes, Gate blank, so the submit is refused at "Spike gated step" |
| **K-09 a–e, g** | The portal session, against these ids | — |

## Thomas's decisions recorded on 2026-10-07
- **CIQ Sync Service:** yes.
- **PDF:** option A.
- **Test flows:** approved.
- **Target:** CIQ Digital.
- **Two test integrations:** approved.
