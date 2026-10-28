# Hardening of the app session's six integrations (prepared 21 Oct, NOT applied)

**Kissflow-internal.**

**Status:** prepared as files only. On 21 Oct nothing was written to Kissflow: no PUT, no Test, no publish, no switch-on or switch-off, and no Kissflow call at all (another agent held the shared key). The six integrations still run their 20 Oct versions (Live and ON in the snapshot of 21 Oct 02:24).

**Why** (the portal session's night tests of 20–21 Oct, `MORNING-2026-10-21.md` §F):
- **Completed points:** op.round and op.edited accept a Completed open point that has no `OP_Outcome`. A REST submit ignores Mandatory, so such points exist. In pass 1 this created 5 extra queries.
- **Re-sent rounds:** op.round creates a second query when a round is sent again.
- **Cancelled cases:** release.requested doesn't check whether the case is cancelled.
- **Preset links:** a case or point created over REST keeps a preset `Portal_Request_Item_Id` / `Portal_Query_Item_Id` (proven). The forward link alone can therefore point at another case's portal item, so the target must name the app item back.

**Evidence used** (read offline only):
- **`_status` is present:** every search row in the stored test outputs (`test-*-test.json`) carries `_status` ("InProgress"). A strict `_status === "InProgress"` check is therefore safe.
- **How the search works:** "Search an item" (Kissflow Process 3.7.6, `connector-process-3.7.6.json`) runs `GET /process/2/{acc}/admin/{process}/item?q=<term>&page_number=1&page_size=100`. It is a full-text search, run as the system-key connection.
- **It finds a portal item by the app id it holds:**
  - I-1's twin guard finds a request by its `App_Case_Item_Id` (night-2026-10-20 `STATUS.md`).
  - The night runner's `search(CIQP_Query, opId)` filtered by `App_Open_Point_Id` found exactly two queries for a point while both were Completed (`runner2.log`, S1.4 REG). So the search returns Completed items too.
- **op.closed runs on a Completed point:** in `runner2.log`, "closing (outcome + submit) completes the point" comes before "op.closed → the open round-2 query is completed". So op.closed must not require InProgress.

## The change

Every integration gets the same shape: webhook → search the app item (unchanged) → **search the portal target by the same payload id (new)** → Run script (hardened) → the target actions (unchanged).

**Why the new search uses the payload id.** The payload id is the only value known before the script runs. Searching by `Query_Key` or `Portal_*_Item_Id` would need a path into the first search's `Data` list, which is unproven. Searching by the app id is also exactly how I-1's twin search and the night runner find portal items. The script then matches exactly: `_id`, `App_Open_Point_Id` / `App_Case_Item_Id`, `Query_Key`.

| Integration | New step (runs before the script) | New script input | New guards: the script refuses when… |
|---|---|---|---|
| `CIQ_op_round_Open_point_question_t_A00` | `Action_opRound_read_target`: Search CIQP Query, lookupValue = `opItemId` | `queries` | the point's `_status` isn't InProgress; a query with the round's `Query_Key` already exists, linked or not; the search can't be read |
| `CIQ_op_edited_Open_point_question__A00` | `Action_opEdited_read_target`: Search CIQP Query by `opItemId` | `queries` | the point's `_status` isn't InProgress; the linked query (`Portal_Query_Item_Id`) isn't in the search, or its `App_Open_Point_Id` isn't the point |
| `CIQ_op_closed_Open_point_closed_A00` | `Action_opClosed_read_target`: Search CIQP Query by `opItemId` | `queries` | the linked query doesn't name the point back. There's no status check, because closing completes the point |
| `CIQ_release_requested_Final_releas_A00` | `Action_release_read_target`: Search CIQP Request by `caseItemId` | `requests` | the case's `Case_Phase` is "Cancelled"; the request's `Case_Phase_Label` is "Cancelled"; the linked request doesn't name the case back (`App_Case_Item_Id`) |
| `CIQ_history_updated_Questions_hist_A00` | `Action_history_read_target`: Search CIQP Request by `caseItemId` | `requests` | the linked request doesn't name the case back |
| `CIQ_case_cancelled_Case_cancelled_A00` | `Action_cancelled_read_target`: Search CIQP Request by `caseItemId` | `requests` | the linked request doesn't name the case back |

**What stays the same:**
- the payloads and the app's screens;
- the trigger and its captured sample;
- the connection (`CnEKHrHqXRKB`);
- every earlier guard;
- the scripts' outputs, which are identical for every accepted case (proven offline). So the target mappings (build.mjs `MAPS`) stay as they are.

**Each draft changes like this:**
- +1 Action, +3 FieldMapping, +3 Property. The new step is a copy of the first search's connector, connection and field schema, which is I-1's `Action_I1_2_twins` shape.
- The root's run order, the script's input list and its code change.
- Every action's `Output`/`IsTested` is cleared (the `untest` rule). The switch-on gate therefore needs fresh Tests.

## Files

- **`scripts/harden/*.js`:** the hardened scripts. The originals in `scripts/` are unchanged; they equal the live code, checked against the snapshot.
- **`harden.mjs`:** the pure transform (`hardenDraft`) and its checks (`checkHardened`, `wiring`, `integrity`). It makes no Kissflow call.
- **`build.mjs`:**
  - `DEFS[*].harden` (the portal process to search and the input name);
  - the stages `harden` (dry run) and `harden-apply` (live; **not run**);
  - `addstep` keeps the new search in the run order;
  - `bind` refuses a hardened draft, because it would put the old script back.
  - The pre-change `build.mjs` and `SPEC.md` are in `backups/pre-harden-2026-10-21/`.
- **`test-harden.mjs`:** the offline test.

## Offline checks (21 Oct; no Kissflow call)

```bash
node kissflow-build/ciq-digital/integrations/test-harden.mjs
for k in opRound opEdited opClosed release history cancelled; do node kissflow-build/ciq-digital/integrations/build.mjs $k harden; done
```

**test-harden.mjs: 166/166 passed.** What it covers:
- **Scripts:** every script, on the accepted case and every refused case. Each run is compared with the built script on the same input:
  - an accepted case gives the same output;
  - a new guard refuses an input that the built script accepted;
  - an old guard still refuses.
- **Drafts:** each snapshot draft is transformed, then checked:
  - the hardened shape is right, and only the expected entities change;
  - the trigger is untouched, and the target mappings are untouched;
  - it refuses a manual change (code, run order, inputs, or a half-done hardening);
  - a second run changes nothing.
- **Offline chain run:** the script's inputs and the targets' mappings are resolved from the hardened draft's own `context.<step>.<path>` values.

**Mutation check:** removing any one guard or transform step makes the test fail.

**Dry run:** all six print "hardened shape ok", with 0 dangling and 0 unreached entities, and exit 0.

## Apply procedure (later: the integrations are live and ON)

**Before you start:**
- **Thomas's explicit OK.** Writes need his approval, and publish/activate need his fresh OK or his own run.
- **A free shared key.** No other agent may be running. The scripts pace calls at 1.3 s; on a 429 or an HTML answer, both sessions stop for 20 min.
- **Tell the portal session.** They test against these webhooks. One writer per flow: these six integrations are the app session's.
- **Fresh fictional ZZT items.** The trigger samples captured on 20 Oct name ZZT items that were deleted. Each step's Test reads the trigger's sample from the server-side test store, not from the draft (RECIPE step 7), so **every integration needs a fresh capture**. You need:
  - **a ZZT case and request pair, linked both ways:** the case's `Portal_Request_Item_Id` is the request, and the request's `App_Case_Item_Id` is the case. The case has the dev contact in `Release_Assignees_JSON`, and `Case_Phase` is "Review" (from the portal session's kit or I-1).
  - **a ZZT open point on that case:** InProgress, with `Portal_Contact_Ids` (`zzt-op.mjs create <caseItemId> <caseCode>`).
  - `zzt-request.mjs` still points at the deleted request `PkEP13vfhEiE`. Point its `R` at the new request before you use `save` / `restore`.

**Order:**
1. op.round, op.edited, op.closed (all on the same point);
2. history, release, cancelled (all on the same case pair). Do cancelled last: it labels the request "Cancelled".

**For each integration `<key>`:**

1. **Re-read the live draft, back it up, PUT, read back.** One command does all four:
   ```bash
   node kissflow-build/ciq-digital/integrations/build.mjs <key> harden-apply
   ```
   - It refuses, and writes nothing, if the live draft differs from the built shape: the trigger, the run order, the script's inputs, or code that isn't `scripts/<code>` (for example a change made in the builder). If that happens, compare the two first: `build.mjs <key> harden <backup or saved draft file>` prints the plan for any draft file. Then decide with Thomas.
   - Expect: the plan lines, then `backup backups/<id>.before-harden.<time>.json`, then `PUT harden 200`, then `read-back hardened | … untested … | trigger tested true`.
   - Then run `refs.mjs` (expect 0 dead references) and `inspect.mjs <id>`.
   - Until step 5 the integration keeps running its published, unhardened version.
2. **Switch it OFF in the builder** (the toggle calls `PUT …/deactivate`).
   - **Capturing a webhook trigger on an ON integration runs it for real** (RECIPE, "Capturing a sample").
   - While it's OFF, any hand-off the app sends to it is lost (fire-and-forget). Keep the window short, and make sure nobody tests the app meanwhile.
3. **Re-capture the trigger** in Thomas's Chrome: Trigger → Output → Test trigger (it listens for 60 s), then POST a ZZT payload to the URL the builder shows. Prepare the fixture, then use the payload:

   | Key | Fixture before the capture | Payload |
   |---|---|---|
   | opRound | point InProgress, Round_No 1 and its Query_Key, no query yet | `{"opItemId":"<point>"}` |
   | opEdited | after op.round (the point links its query); edit the point's Question_Text first | `{"opItemId":"<point>"}` |
   | opClosed | `zzt-op.mjs outcome` (sets OP_Outcome) | `{"opItemId":"<point>"}` |
   | history | the pair, linked both ways | `{"caseItemId":"<case>","questionsHistoryJson":"[]"}` |
   | release | the pair linked; neither the case nor the request cancelled | `{"caseItemId":"<case>"}` |
   | cancelled | the pair linked | `{"caseItemId":"<case>","phaseLabel":"Cancelled","locked":"Yes"}` |

4. **Run the per-step Tests on the ZZT data:**
   ```bash
   node kissflow-build/ciq-digital/integrations/test-chain.mjs <key> test
   ```
   - Each step really runs (a create creates, an update updates).
   - Expect `<key>`'s `read_target` Output `Data` to hold the ZZT target, with its `_id` and its `App_Open_Point_Id` / `App_Case_Item_Id`. The script's output is the same as before.
   - Skipping step 3 is harmless (the run stops at the script on the deleted ids), but then nothing is tested.
5. **Publish, switch on, read back:**
   ```bash
   node kissflow-build/ciq-digital/integrations/test-chain.mjs <key> activate
   ```
   - It refuses unless every step passed. Then it publishes, activates, and reads back Live / IsActive true.
   - Then run `list.mjs`.
6. **Prove it live:** a real webhook through the URL in `SET:current`, with ZZT data only:
   ```bash
   node kissflow-build/ciq-digital/integrations/live-hook.mjs <code> '<payload>'
   ```
   - Wait about 10 s, then read the target back. Send one accepted call, then each refused case below. For a refused case, the target must be unchanged and Run history must show the refusal.
   - **op.round:**
     - Send the same `{opItemId}` again once the round's query exists. Expect one query: a search by the point's id finds only the original.
     - Send a ZZT point that was submitted over REST to Completed without OP_Outcome. Expect it to be refused.
   - **op.edited and op.closed:** create a ZZT point over REST whose `Portal_Query_Item_Id` is preset to another ZZT point's query. Expect it to be refused, and that query to stay unchanged (still InProgress).
   - **history, cancelled and release:** create a ZZT case over REST whose `Portal_Request_Item_Id` is preset to another case's ZZT request. Expect it to be refused, and that request to stay unchanged.
   - **release:**
     - After case.cancelled has run on the pair, expect it to be refused (the request's label is "Cancelled").
     - Send a case whose `Case_Phase` is "Cancelled". Expect it to be refused.
   - This also proves the webhook URL survived the switch-off and back on. On 20 Oct a republish kept it, but a switch-off has not been proven yet.
7. **Clean up and record:**
   - Delete the ZZT points and queries (`zzt-op.mjs cleanup`; each must read back 404).
   - Restore the ZZT case and request, or hand them back to the portal session.
   - Record the state in `state.json` and add a line to SPEC.md.

**Rollback:** the step-1 backup (`backups/<id>.before-harden.<time>.json`) is the unhardened draft, with its 20 Oct tested flags.
- To roll back: PUT it as the draft, then run `test-chain.mjs <key> activate` (publish and switch on).
- There is no stage for the PUT yet. `putDraft(id, blob)` from `integ-lib.mjs` does it; read it back afterwards.

## Open points

- **Thomas's OK and a time slot.** Each integration is OFF for a few minutes during steps 2 to 5. A hand-off sent in that window is lost.
- **Fixtures:** a fresh ZZT case and request pair is needed, and `zzt-request.mjs` still names the deleted request.
- **Assumed, not yet proven inside an integration:** the new Search finds the portal item by the app id it holds.
  - What is proven: this works over the same REST route (I-1 twin guard; night runner).
  - It shows in step 4: the `read_target` Output must contain the target.
  - The search reads at most 100 rows, which is plenty for one point or case.
- **op.round after a failed link step:** if the query was created but `Portal_Query_Item_Id` wasn't stored, a retry is refused, and the message names the existing query. The link is then set by hand. I-1 behaves the same way.
- **Not asked, so not done, but recommended:**
  - case.cancelled could also require the case's own `Case_Phase` "Cancelled". That would stop a forged cancel of a live case, but first confirm that the app writes `Case_Phase` before it posts.
  - history.updated and release.requested don't check the request's `_status`.
- **Out of scope:** I-1, I-3 and I-6 and the portal-container integrations belong to the portal session.
