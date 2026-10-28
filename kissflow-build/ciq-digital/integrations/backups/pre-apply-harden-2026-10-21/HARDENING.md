# Hardening of the app session's six integrations (prepared 21 Oct, NOT applied)

**Kissflow-internal.**

**Status:** prepared as files only. On 21 Oct nothing was written to Kissflow: no PUT, no Test, no publish, no switch-on or switch-off, and no Kissflow call at all (another agent held the shared key). The six integrations still run their 20 Oct versions (Live and ON in the snapshot of 21 Oct 02:24).

**Amended 21 Oct (afternoon), files only:** release.requested also clears the two new CIQP Request fields `Release_By_Email` and `Release_By_Role`. See "release.requested clears Release_By_Email and Release_By_Role" below.

**Why** (the portal session's night tests of 20–21 Oct, `MORNING-2026-10-21.md` §F):
- **Completed points:** op.round and op.edited accept a Completed open point that has no `OP_Outcome`. A REST submit ignores Mandatory, so such points exist. In pass 1 this created 5 extra queries.
- **Re-sent rounds:** op.round creates a second query when a round is sent again.
- **Cancelled cases:** release.requested doesn't check whether the case is cancelled.
- **Preset links:** a case or point created over REST keeps a preset `Portal_Request_Item_Id` / `Portal_Query_Item_Id` (proven). The forward link alone can therefore point at another case's portal item, so the target must name the app item back.
- **New release fields (21 Oct, REQ-PROC-042):** the portal session added `Release_By_Email` and `Release_By_Role` to CIQP Request and published them, with `Release_By_Name`'s step permissions. release.requested clears `Release_At` and `Release_By_Name` so that a new round can't reuse an earlier release. It must clear the two new fields the same way.

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
| `CIQ_release_requested_Final_releas_A00` | `Action_release_read_target`: Search CIQP Request by `caseItemId` | `requests` | the request's `Case_Phase_Label` is "Cancelled"; the linked request doesn't name the case back (`App_Case_Item_Id`); the case's `Case_Phase` is "Cancelled" (a backstop only: nothing writes it today, see Open points) |
| `CIQ_history_updated_Questions_hist_A00` | `Action_history_read_target`: Search CIQP Request by `caseItemId` | `requests` | the linked request doesn't name the case back |
| `CIQ_case_cancelled_Case_cancelled_A00` | `Action_cancelled_read_target`: Search CIQP Request by `caseItemId` | `requests` | the linked request doesn't name the case back |

**What stays the same:**
- the payloads and the app's screens;
- the trigger and its captured sample;
- the connection (`CnEKHrHqXRKB`);
- every earlier guard;
- the scripts' outputs, which are identical for every accepted case (proven offline), except that release.requested's also returns `Release_By_Email` and `Release_By_Role` as null. So the target mappings (build.mjs `MAPS`) stay as they are, except for those two (next section).

**Each draft changes like this:**
- +1 Action, +3 FieldMapping, +3 Property. The new step is a copy of the first search's connector, connection and field schema, which is I-1's `Action_I1_2_twins` shape.
- release.requested only: +2 FieldMapping and +2 Property on `Action_RR_update_request` (the two cleared fields), and that action's mapping list.
- The root's run order, the script's input list and its code change.
- Every action's `Output`/`IsTested` is cleared (the `untest` rule). The switch-on gate therefore needs fresh Tests.

### release.requested clears Release_By_Email and Release_By_Role

- **Script:** `scripts/harden/case-release.js` returns `Release_By_Email: null` and `Release_By_Role: null`, next to `Release_At` and `Release_By_Name`. Nothing else changes.
- **Mapping:** the snapshot draft has no entry for either field, because `map` listed the 20 Oct schema. The live draft has none either, unless the action was saved in the builder since. The harden transform (`DEFS.release.harden.clear`, which `harden.mjs` reads as `spec.clear`) adds both to `Action_RR_update_request`: one FieldMapping and one Property each, bound to `context.Action_release_pick.<field>`.
  - If a later `map` run (or a save in the builder) left an unbound entry for a field, the transform binds that entry instead of adding a second one.
  - It refuses if either field is already mapped to anything else. That would be a manual change.
- **Where the entry's FieldId, Label and Type come from:**
  - `harden-apply` reads `Action_RR_update_request`'s live field schema first, with one read-only GET, and takes them from it. If either field isn't in the schema, it stops and writes nothing.
  - The dry run and the test can't read the schema, so they derive the values: FieldId is the field id, the Label is "Release By Email" / "Release By Role", and the Type is String. These follow the shape `map` gave every field on 20 Oct; `Completeness_By_Email` is also an Email field and is mapped as String.
- **`MAPS`** lists both fields too, so a later `map` on a hardened draft keeps them. On an unhardened draft, `map` leaves them unmapped, because only the hardened script returns them.
- **The original `scripts/case-release.js` is unchanged, on purpose:**
  - The hardened script is the one `harden-apply` writes.
  - The original must stay equal to the live code, because `harden-apply` (and the dry run) refuses a draft whose code differs from it. Changing it would block the apply.
- **Not yet proven inside Kissflow:** that a null mapping clears an Email field. It is proven for Text and DateTime (`Release_By_Name`, `Release_At`, 20 Oct), and step 6 shows it for Email.

## Files

- **`scripts/harden/*.js`:** the hardened scripts. The originals in `scripts/` are unchanged; they equal the live code, checked against the snapshot. This includes `scripts/case-release.js`, which still clears only `Release_At` and `Release_By_Name` (see the release section above).
- **`harden.mjs`:** the pure transform (`hardenDraft`) and its checks (`checkHardened`, `wiring`, `integrity`). It makes no Kissflow call. A refusal for changed code carries the change as a line diff, which `build.mjs` prints. `spec.clear` adds the cleared fields' mappings; `checkHardened` requires them.
- **`build.mjs`:**
  - `DEFS[*].harden` (the portal process to search and the input name; for release, `clear`: the two new fields);
  - the stages `harden` (dry run) and `harden-apply` (live; **not run**). For release, `harden-apply` reads `Action_RR_update_request`'s field schema before the transform;
  - `MAPS.release` lists `Release_By_Email` and `Release_By_Role`. `map` maps them only on a hardened draft;
  - `addstep` keeps the new search in the run order;
  - `bind` refuses a hardened draft, because it would put the old script back.
  - The pre-change `build.mjs` and `SPEC.md` are in `backups/pre-harden-2026-10-21/`. The files as they were before the review fixes of 21 Oct are in `backups/pre-review-fix-2026-10-21/`. The files as they were before the release-fields change (afternoon) are in `backups/pre-release-fields-2026-10-21/`.
- **`test-harden.mjs`:** the offline test.

## Offline checks (21 Oct; no Kissflow call)

```bash
node kissflow-build/ciq-digital/integrations/test-harden.mjs
for k in opRound opEdited opClosed release history cancelled; do node kissflow-build/ciq-digital/integrations/build.mjs $k harden; done
```

**test-harden.mjs: 182/182 passed** (run with the network blocked, 21 Oct afternoon). What it covers:
- **Scripts:** every script, on the accepted case and every refused case. Each run is compared with the built script on the same input:
  - an accepted case gives the same output. For release.requested, the output also has `Release_By_Email` and `Release_By_Role`, and nothing else is added. A separate check requires `Release_At`, `Release_By_Name`, `Release_By_Email` and `Release_By_Role` to be null;
  - a new guard refuses an input that the built script accepted;
  - an old guard still refuses.
- **Drafts:** each snapshot draft is transformed, then checked:
  - the hardened shape is right, and only the expected entities change;
  - the trigger is untouched, and the target mappings that existed are untouched;
  - release only: the two new mappings are there, exactly once each, bound to the script's output;
  - it refuses a manual change (code, run order, inputs, or a half-done hardening), and a code change comes back as a line diff;
  - release only: it refuses a cleared field that is mapped to anything else, and a live schema without the field. With a live schema, the entries take its values. An unbound entry is bound, not duplicated. A hardened draft that lost one of the mappings counts as "partly hardened";
  - a second run changes nothing.
- **Offline chain run:** the script's inputs and the targets' mappings are resolved from the hardened draft's own `context.<step>.<path>` values. For release, `Action_RR_update_request` gets null for all four release fields.

**Mutation check:** removing any one guard or transform step makes the test fail. This was re-checked for the release fields: dropping either null from the script, the new mappings, the entry's place in the action's list, the binding of an unbound entry, the schema guard, the already-mapped guard, or the check in `checkHardened`.

**Dry run:** all six print "hardened shape ok", with 0 dangling and 0 unreached entities, and exit 0. Release also prints two `+ map` lines ("derived offline") and FieldMapping 230→235, Property 17→22.

## Apply procedure (later: the integrations are live and ON)

**Before you start:**
- **Thomas's explicit OK.** Writes need his approval, and publish/activate need his fresh OK or his own run.
- **A free shared key.** No other agent may be running. The scripts pace calls at 1.3 s; on a 429 or an HTML answer, both sessions stop for 20 min.
- **Tell the portal session.** They test against these webhooks. One writer per flow: these six integrations are the app session's.
- **Fresh fictional ZZT items.** The trigger samples captured on 20 Oct name ZZT items that were deleted. Each step's Test reads the trigger's sample from the server-side test store, not from the draft (RECIPE step 7), so **every integration needs a fresh capture**. You need:
  - **a ZZT case and request pair, linked both ways:** the case's `Portal_Request_Item_Id` is the request, and the request's `App_Case_Item_Id` is the case. The case has the dev contact in `Release_Assignees_JSON`, and `Case_Phase` is "Review" (from the portal session's kit or I-1).
  - **a ZZT open point on that case:** InProgress, with `Portal_Contact_Ids` (`zzt-op.mjs create <caseItemId> <caseCode>`).
  - `zzt-request.mjs` still points at the deleted request `PkEP13vfhEiE`. Point its `R` at the new request before you use `save` / `restore`.

**Order:** steps 1–6 for each integration in turn; step 7 (clean-up) once per group, after its last integration.
1. op.round, op.edited, op.closed, all on the same point P1. Clean up after op.closed.
2. history, release, cancelled, all on the same case pair. Do cancelled last: it labels the request "Cancelled", and its step 6 also proves release's cancel guard. Clean up after cancelled.

**For each integration `<key>`:**

1. **Re-read the live draft, back it up, PUT, read back.** One command does all four:
   ```bash
   node kissflow-build/ciq-digital/integrations/build.mjs <key> harden-apply
   ```
   - It backs up the live draft first (`backup backups/<id>.before-harden.<time>.json`), then refuses, and writes nothing, if that draft differs from the built shape: the trigger, the run order, the script's inputs, or code that isn't `scripts/<code>` (for example a change made in the builder). The STOP names the difference; for code it prints the line diff. `build.mjs <key> harden <that backup>` reprints it offline. Then decide with Thomas.
   - Expect: the backup line, the plan lines, then `PUT harden 200`, then `read-back hardened | … untested … | trigger tested true`.
   - **release:** before the transform it reads `Action_RR_update_request`'s field schema (one more GET). Expect two `+ map` lines for `Release_By_Email` and `Release_By_Role`, marked "(live schema)".
     - "… is not in Action_RR_update_request's field schema": the CIQP Request field isn't published. Nothing is written. Ask the portal session.
     - "… is already mapped to …": someone mapped the field in the builder. Nothing is written. Decide with Thomas.
     - `harden <that backup>` reprints the second STOP offline, but not the first: the offline run has no schema.
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
   | release | the pair linked; neither the case nor the request cancelled; the request holds ZZT values in `Release_At`, `Release_By_Name`, `Release_By_Email` and `Release_By_Role` (an admin PUT) | `{"caseItemId":"<case>"}` |
   | cancelled | the pair linked | `{"caseItemId":"<case>","phaseLabel":"Cancelled","locked":"Yes"}` |

4. **Run the per-step Tests on the ZZT data:**
   ```bash
   node kissflow-build/ciq-digital/integrations/test-chain.mjs <key> test
   ```
   - Each step really runs (a create creates, an update updates).
   - Expect `<key>`'s `read_target` Output `Data` to hold the ZZT target, with its `_id` and its `App_Open_Point_Id` / `App_Case_Item_Id`. The script's output is the same as before; release's also has `Release_By_Email` and `Release_By_Role` as null.
   - **release:** read the request back after the Test. All four release fields must be empty. This is the first proof that a null mapping clears an Email field.
   - Skipping step 3 is harmless (the run stops at the script on the deleted ids), but then nothing is tested.
   - **op.round: don't skip this Test.** How Kissflow hands an empty search to a script input has never been observed. The script accepts `[]`, `""`, null and no value. If it arrives as anything else (for example the text "null"), every round 1 is refused as "unreadable". The "no query yet" fixture shows it here: the script must accept, and the query must be created.
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
   - Wait about 10 s, then read the target back. Send the accepted call and each refused case below.
   - For a refused case, the target must be unchanged, and Run history must show **that guard's own message** (quoted below). A refusal by an earlier guard ("is Draft", "is still open") proves nothing about the new one.
   - **Forged items** (for the reverse link, the one guard not yet proven inside Kissflow):
     - P2: a second ZZT point on the case, created over REST like `zzt-op.mjs create` does but with its own `OP_Key` and with `Portal_Query_Item_Id` preset to P1's round-1 query, and then **submitted**. A point left in Draft is refused by the status guard instead. `zzt-op.mjs` tracks only P1, so note P2's id for step 7.
     - C2: a second ZZT case, created over REST with `Portal_Request_Item_Id` preset to the pair's request, and submitted like a real case. If Run history shows "was not found" instead of the reverse-link message, the case search didn't return C2, and the reverse link is still unproven. Note C2's id for step 7.
   - **op.round** (P1):
     - Accepted: step 4's Test already created and linked P1's round-1 query, so the same round is now refused. Bump the round first: an admin PUT on P1 of `Round_No` 2 and `Query_Key` `<OP_Key>-R2`. Then send `{opItemId}`. Expect one new R2 query, linked on P1.
     - Send the same `{opItemId}` again. Expect "already has CIQP Query … for <OP_Key>-R2", and still one R2 query.
     - A separate ZZT point that was submitted over REST to Completed without OP_Outcome. Expect "is Completed: no new round".
   - **op.edited:**
     - Accepted: edit P1's Question_Text, send P1. Expect the R2 query to carry it.
     - Send P2. Expect "CIQP Query <R1> does not name open point <P2's key> (<P2>) back", and R1 unchanged.
   - **op.closed:**
     - Step 4's Test already completed P1's linked query (R2), so the step-4 Output is the accepted proof.
     - Give P2 an `OP_Outcome` (an admin PUT, as `zzt-op.mjs outcome` does; without one, "is still open" refuses first). Send P2. Expect "CIQP Query <R1> does not name open point … back", and R1 still InProgress.
   - **history and release:**
     - Accepted: send the pair's case. For release, first put ZZT values into the request's `Release_At`, `Release_By_Name`, `Release_By_Email` and `Release_By_Role` again (an admin PUT); afterwards all four must read back empty.
     - Send C2. Expect "CIQP Request <request> does not name case <C2's code> (<C2>) back", and the request unchanged.
     - (release, optional) The case-side backstop: after the C2 check, set C2's `Case_Phase` to "Cancelled" (an admin PUT) and send C2 again. Expect "is cancelled: no final release". Leave the pair's case alone: cancelled's step 6 needs the refusal by the request's label.
   - **cancelled:**
     - Send C2 first. Expect the same "does not name case … back", and the request's label unchanged.
     - Step 4's Test already labelled the request "Cancelled". Now send release.requested for the pair. Expect "CIQP Request <request>: the case was cancelled", and the request unchanged. This proves release's cancel guard.
   - A call that shows in Run history also proves the webhook URL survived the switch-off and back on. On 20 Oct a republish kept it, but a switch-off has not been proven yet.
7. **Record, and clean up once per group:**
   - After each integration: record the state in `state.json` and add a line to SPEC.md.
   - After op.closed only: delete P1, P2, the Completed test point and every ZZT query (R1, R2). `zzt-op.mjs cleanup` handles P1 and the queries in `state.json`'s `zzt.queries`; do the rest the same way (withdraw if InProgress, then delete). Each must read back 404.
   - After cancelled only: delete C2, and restore the ZZT case and request or hand them back to the portal session.

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
- **op.round's twin guard is check-then-create.** Two calls for one round within the few seconds between the new search and the create both pass, and give two queries. Example: the app's fallback to the SDK route after a send error, when the first POST did arrive. Sequential repeats are refused. Every payload carries an `idempotencyKey`, but no integration uses it.
- **release.requested's cancel guard rests on the request alone.** Nothing writes the case's `Case_Phase` "Cancelled": the app can't write a case after Start, and only I-1, I-2 and I-7 write `Case_Phase`. So the case-side check never fires today. The request's "Cancelled" label exists only if case.cancelled succeeded. If case.cancelled was refused, or lost while it was OFF during the apply, a later release.requested still un-cancels the request.
- **The live release.requested doesn't clear `Release_By_Email` and `Release_By_Role` yet.** Only the hardened version does, so until it is applied a re-requested release keeps the earlier releaser's e-mail and role. The supplier's screen writes all four fields again when it gives the new release (both are Mandatory there), and I-7 copies them to the case, so the stale values matter only until then.
- **Not to do:** require the case's own `Case_Phase` "Cancelled" in case.cancelled. Nothing writes it (see above), so every real cancel would be refused.
- **Not asked, so not done, but recommended:** history.updated and release.requested don't check the request's `_status`.
- **Out of scope:** I-1, I-3 and I-6 and the portal-container integrations belong to the portal session.
