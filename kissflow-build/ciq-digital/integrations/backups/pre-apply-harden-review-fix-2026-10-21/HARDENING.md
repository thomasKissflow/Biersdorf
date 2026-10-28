# Hardening of the app session's six integrations (prepared 21 Oct, NOT applied)

**Kissflow-internal.**

**Status:** prepared as files only. On 21 Oct nothing was written to Kissflow: no PUT, no Test, no publish, no switch-on or switch-off, and no Kissflow call at all (another agent held the shared key). The six integrations still run their 20 Oct versions (Live and ON in the snapshot of 21 Oct 02:24).

**Amended 21 Oct (afternoon), files only:** release.requested also clears the two new CIQP Request fields `Release_By_Email` and `Release_By_Role`. See "release.requested clears Release_By_Email and Release_By_Role" below.

**Amended 21 Oct (evening), files only:** `apply-harden.mjs` runs the whole apply procedure for one integration over REST: switch-off, rebuild, capture, Tests, publish, switch-on, live checks and clean-up. It is a dry run unless given `--apply`, and it was only run against a stub (no Kissflow call, no webhook POST). See "Apply procedure".

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
- **`integ-defs.mjs`:** `DEFS` and the harden spec (`hardenSpecOf`), moved out of `build.mjs` unchanged on 21 Oct (evening), so that `apply-harden.mjs` can use them without running `build.mjs`'s CLI. `build.mjs` imports them; its six dry runs and `test-harden.mjs` print the same as before. The files as they were before are in `backups/pre-apply-harden-2026-10-21/`.
- **`apply-harden.mjs`:** the orchestrator of the apply procedure (one key per run; dry run by default). **`apply-harden-sim.mjs`:** the stub of Kissflow its dry run and its test use. **`apply-harden.test.mjs`:** its offline test.

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

**Orchestrator test (21 Oct, evening):** `node kissflow-build/ciq-digital/integrations/apply-harden.test.mjs`, with the network blocked and a stub transport on a virtual clock. **92/92 passed.** It covers:
- **the happy path:** the six keys in order, on one stub. Each run keeps the phase order (preflight, fixture, OFF, PUT, trigger Test, then the webhook, Tests, publish, then activate, live checks). Every call is at least 6 s after the one before. Each refusal text the run prints is exactly the message the hardened script throws. At the end all six are ON with the hardened version published, every ZZT item is deleted, and no URL is in the output;
- **a failure at each step 1–6** (11 cases): switched back ON, the published version still unhardened, the backup printed. A failed switch-on is reported loudly and not retried;
- **a 429 or an HTML answer** at the first call, at a Test, at the capture webhook, at step 2's PUT, and at the rollback's switch-on: no further call; the pending command printed; `--reactivate` refused before the 20-min pause and working after it;
- **the ledger:** an intent before every create, and every item's id recorded before the call that follows the answer revealing it (also on a 429 right after a create);
- **the rest:** Ctrl-C, a non-dev account, a pending switch-on, a key out of order, `cleanup`, and a dry run that writes nothing. A guard regression (the unhardened version live) makes a live check fail.

**Mutation check:** the test fails when the finally switch-on is removed, the ledger is written after a further call, a switch-on is tried right after a 429, the pacing drops to 1.5 s, or a refusal check ignores a changed target.

**Dry run:** all six print "hardened shape ok", with 0 dangling and 0 unreached entities, and exit 0. Release also prints two `+ map` lines ("derived offline") and FieldMapping 230→235, Property 17→22.

## Apply procedure (later: the integrations are live and ON)

**Before you start:**
- **Thomas's explicit OK.** Writes need his approval, and publish/activate need his fresh OK or his own run. Thomas runs `apply-harden.mjs <key> --apply` himself, or approves it, in the app session's window.
- **A free shared key.** No other agent may be running. On a 429 or an HTML answer, both sessions stop for 20 min.
- **Tell the portal session.** They test against these webhooks. One writer per flow: these six integrations are the app session's. The case group also posts `case.started` once, so that their I-1 creates the ZZT request.
- **No fixtures to prepare by hand.** The trigger samples captured on 20 Oct name ZZT items that were deleted, so every integration needs a fresh capture. The orchestrator creates fresh fictional items for it (tag `ZZT-N21-A3`). `zzt-request.mjs`, which still names the deleted request `PkEP13vfhEiE`, isn't needed.

### One command per integration: `apply-harden.mjs`

```bash
node kissflow-build/ciq-digital/integrations/apply-harden.mjs <key>                          # DRY RUN (default): the plan, every call
node kissflow-build/ciq-digital/integrations/apply-harden.mjs <key> --apply                  # live
node kissflow-build/ciq-digital/integrations/apply-harden.mjs <key> --reactivate --apply     # after a 429: switch ON again
node kissflow-build/ciq-digital/integrations/apply-harden.mjs cleanup <op|case|all> [--apply]   # delete the ledger's open ZZT items
```

**Order:**
1. Group op, on one open point P1: `opRound` → `opEdited` → `opClosed`.
2. Group case, on one case and request pair: `history` → `release` → `cancelled`. Cancelled goes last: its checks label the request "Cancelled".

Start a key only after the one before it ended with exit 0. A key run out of order stops in its fixture (exit 2) and switches nothing.

**The dry run** runs the orchestrator itself against `apply-harden-sim.mjs`. That is a stub of Kissflow seeded with the snapshot drafts of 21 Oct 02:2x, in which the drafts' own scripts run.
- It prints every call the live run would make (method and path with ids; webhook URLs are never printed), every refusal text it expects, the call count and the length of the OFF window.
- The keys before `<key>` run first, quietly, so the fixture is the one the live run would find. Ids show as placeholders (`<P1>`, `<R1>` …), and a poll shows once.
- It makes no Kissflow call and writes nothing. Its "ok" lines are the stub's answers, not proof.

**What one `--apply` run does** (the REST capture route the portal session proved on I-6 and I-7 on 21 Oct, `night-2026-10-20/integrations/capture-sample.mjs` and `finish-integ.mjs`):

| Phase | What happens | Calls |
|---|---|---|
| P preflight | Checks the dev sandbox (account `AcDOSunMEpSA`, host `dev-beiersdorf.kissflow.eu`, as kf.mjs reads them) before the first call. Refuses while a switch-on is pending. The integration must be Live and ON. Reads the live draft, saves it (`backups/<id>.preflight.<time>.json`) and runs `build.mjs <key> harden`'s check on it offline (release: after reading `Action_RR_update_request`'s field schema). Reads the webhook URLs it needs from `SET:current`; they are never printed or logged. Writes nothing. | 3–5 |
| F fixture | Creates and prepares the key's ZZT items (table below). This happens before the switch-off, so the OFF window stays short. | 0–17 |
| 1 switch OFF | `PUT /flow/2/{acc}/integration/{id}/deactivate` → `IsActive false`. From here, hand-offs to this integration are lost until step 6. | 1 |
| 2 rebuild the draft | As `build.mjs <key> harden-apply`: re-reads the live draft, backs it up (`backups/<id>.before-harden.<time>.json`), refuses a manual change, PUTs the hardened draft and reads it back with `checkHardened`. Same transform (`harden.mjs`) and spec (`integ-defs.mjs`). | 3 |
| 3 capture while OFF | `POST /integration/2/{acc}/{id}/trigger/{T}/test` answers `{"status":"success"}` at once. About 6 s later, the ZZT payload goes to the webhook (text/plain JSON). The server stores it as the trigger's test sample, and the step Tests read it. | 2 |
| 4 per-step Tests | As `test-chain.mjs <key> test`: each action's Test in run order, each passed Output stored with `IsTested true`. The first Test must find the fixture's id, or the run stops with "the capture did not land". The new search's Data must hold the target. Then the target is read back (list below). | 3 per action, + 2–4 |
| 5 sample into the draft | As `finish-integ.mjs`: the new payload's ids go into the draft trigger's stored Output (same shape), `IsTested true`. Refused unless every action is tested. Read back. | 3 |
| 6 publish, ON | Publish; `PUT …/activate` → `IsActive true`; list read-back: Status Live, IsActive true. | 3 |
| G live checks | HARDENING step 6 (below): real webhook POSTs with ZZT data. | 5–15 |
| 7 clean-up | After `opClosed` (group op) and after `cancelled` (group case) only: withdraw if in progress, delete, read back 404. | 3–4 per item |

**Duration** (from the dry runs): about 5–7 min per key (42–62 calls at 6 s or more each). The OFF window (steps 1–6) is 26–30 calls, about 2.5–3 min.

**Safety built in:**
- **Pacing:** one call at a time, at least 6 s apart. Webhook POSTs count, and a new run waits 6 s before its first call. kf.mjs is called with `retries: 0`.
- **A 429 or an HTML answer:** the run stops at once and makes no further call (exit 75).
  - If the integration may be OFF, the run writes `apply-harden-PENDING.json` and prints the not-before time and the one command to run after the 20-min pause: `apply-harden.mjs <key> --reactivate --apply`. That command makes one `PUT …/activate` and the read-back. It refuses before the pause is over, and it is harmless if the integration is already ON.
  - While a switch-on is pending, every other run refuses to start.
- **Never OFF on exit otherwise:** the switch-on runs in a finally block, also after Ctrl-C or SIGTERM (the run stops before its next call, then switches on; a second Ctrl-C quits at once, with a warning).
  - Until step 6's publish, the published version is still the unhardened 20 Oct one, so switching on restores service. The run prints the backup path and stops (exit 1).
  - The draft then stays hardened and partly tested. Don't publish it from the builder: run the key again, or restore the backup (Rollback, below).
- **When the failure is the switch-on itself** (step 6's activate or its read-back, or the rollback's activate): no retry. The run prints a loud "MAY BE OFF" banner with the command (exit 3). Switch it on at once, in the builder or with `--reactivate --apply`.
- **A failed live check** leaves the hardened version live (exit 1) and skips the clean-up. Decide with Thomas whether to roll back.
- **Exit codes:** 0 done · 1 failed, but ON · 2 stopped before the switch-off (nothing switched; ZZT items may be open) · 3 may be OFF · 75 rate-limited.

**Records:**
- every call: `requests.jsonl`, URLs redacted;
- every ZZT item: `apply-harden-ledger.jsonl`. Each create writes an intent line first and the new id right after the answer, before any further call. Items an integration creates (I-1's request, the queries) are recorded the same way;
- a run record: `apply-harden-runs/<key>.<time>.json`;
- `state.json`'s entry for the key (hardened, tested, active). Add the SPEC.md line by hand from the run record.

**Fixtures** (created before the switch-off; codes `ZZT-N21-A3-<run>-…`):

| Key | Creates or changes | Payload |
|---|---|---|
| opRound | The pair, unless the ledger has it: C1 is created and submitted, then `case.started` is posted so that I-1 creates and links R1. P1: submitted, InProgress, round 1 with its Query_Key, no query. P3: submitted twice, so Completed without OP_Outcome. Refuses if the op group has open items. | `{"opItemId":"<P1>"}` |
| opEdited | P1's Question_Text edited (admin PUT). P2: a forged point with `Portal_Query_Item_Id` preset to R1q, submitted. | `{"opItemId":"<P1>"}` |
| opClosed | P1's OP_Outcome "Withdrawn" (admin PUT, as `zzt-op.mjs outcome`). | `{"opItemId":"<P1>"}` |
| history | The pair, if missing. C2: a forged case with `Portal_Request_Item_Id` preset to R1, submitted (no case.started). | `{"caseItemId":"<C1>","questionsHistoryJson":"[]"}` |
| release | ZZT values in R1's `Release_At`, `Release_By_Name`, `Release_By_Email` and `Release_By_Role` (admin PUT, read back). Refuses a cancelled pair. | `{"caseItemId":"<C1>"}` |
| cancelled | Notes R1's label and lock before the Test. | `{"caseItemId":"<C1>","phaseLabel":"Cancelled","locked":"Yes"}` |

**Step 4's read-back per key:**
- **opRound:** the Test created R1q and linked it on P1. This shows how an empty search reaches the script: it must be accepted.
- **opEdited:** R2q has the edited question.
- **opClosed:** R2q is Completed.
- **history:** R1's Questions_History_JSON is "[]".
- **release:** all four release fields on R1 are empty, and C1's Release_Requested_At is stamped. This is the first proof that a null mapping clears the Email field.
- **cancelled:** R1 is "Cancelled" and locked.

**Live checks (G).** Run history isn't readable over REST:
- A refused call is verified by its target's read-back: unchanged after 30 s. The run prints the message Run history must show; Thomas confirms it in Manage → Integrations → Run history. A refusal by an earlier guard ("is Draft", "is still open") proves nothing about the new one, so look for that exact message.
- An accepted call is polled until its target shows the change. It also proves that the webhook URL survived the switch-off and back on.

| Key | Accepted | Refused (target unchanged; the Run history message) |
|---|---|---|
| opRound | P1 bumped to round 2 (admin PUT `Round_No` 2, `Query_Key` …-R2), then op.round on P1: one new query R2q, linked on P1 | P1 again: "Open point <OP1> already has CIQP Query <R2q> for <OP1>-R2 …", and still one R2 query · P3: "Open point <OP3> is Completed: no new round", and no query for P3 |
| opEdited | P1's question edited again, then op.edited on P1: R2q carries it | P2: "CIQP Query <R1q> does not name open point <OP2> (<P2>) back"; R1q unchanged |
| opClosed | step 4's Test (R2q Completed) | P2, after it gets an OP_Outcome (admin PUT): the same "does not name open point … back"; R1q still InProgress |
| history | history.updated on C1: R1's Questions_History_JSON | C2: "CIQP Request <R1> does not name case <C2 code> (<C2>) back" |
| release | the four release fields seeded again, then release.requested on C1: all four empty | C2: the same reverse-link message; R1 and C2 unchanged · the case-side backstop: C2's Case_Phase set to "Cancelled" (admin PUT), then C2 again: "Case <C2 code> is cancelled: no final release" |
| cancelled | after the C2 check: case.cancelled on C1: R1 "Cancelled", locked | R1's label first goes back to its value before the Test, so that a wrong write would show. Then C2: the reverse-link message · then release.requested on the pair: "CIQP Request <R1>: the case was cancelled" (this proves release's cancel guard) |

If Run history shows "was not found" for C2 or P2 instead of the reverse-link message, the search didn't return the forged item, and the reverse link is still unproven there. The target is unchanged either way.

**Clean-up (step 7):**
- After opClosed: P1, P2, P3, R1q, R2q, and any unexpected query a failed guard created (recorded as `X-<id>`).
- After cancelled: C2, R1, C1.
- Portal items go first. Each is withdrawn if in progress, deleted, and read back 404.
- After a stopped run, `apply-harden.mjs cleanup <op|case|all> --apply` deletes whatever the ledger still holds open; without `--apply` it lists it.

**Offline test:** `node kissflow-build/ciq-digital/integrations/apply-harden.test.mjs` (see "Offline checks").

**Rollback:** the step-2 backup (`backups/<id>.before-harden.<time>.json`) is the unhardened draft, with its 20 Oct tested flags.
- A failure before step 6's publish needs no rollback of the published version: the orchestrator has already switched the integration back on, still running its 20 Oct version.
- To restore the draft too, or after a failed live check: PUT the backup as the draft, read it back, then publish and switch on (`test-chain.mjs <key> activate`).
- There is no stage for the PUT yet. `putDraft(id, blob)` from `integ-lib.mjs` does it; read it back afterwards.

**Manual route (fallback):** the steps the orchestrator automates, one by one:
- `build.mjs <key> harden-apply`, then `refs.mjs` (expect 0 dead references) and `inspect.mjs <id>`;
- switch OFF in the builder (the toggle calls `PUT …/deactivate`);
- capture in Thomas's Chrome: Trigger → Output → Test trigger, then POST the payload to the URL the builder shows;
- `test-chain.mjs <key> test`, then `test-chain.mjs <key> activate` (publish, switch on, read back);
- `live-hook.mjs <code> '<payload>'` for each live check above, then read the target back.

## Open points

- **Thomas's OK and a time slot.** Each integration is OFF for about 2.5–3 min (steps 1 to 6 of `apply-harden.mjs`). A hand-off sent in that window is lost.
- **Fixtures:** `apply-harden.mjs` creates them (ledger `apply-harden-ledger.jsonl`). It relies on I-1 (the portal session's) to create the ZZT request, as the night runner did.
- **Not yet run against Kissflow:** `apply-harden.mjs` was tested only against the stub. The stub doesn't model field types, permissions, assignees or Kissflow's own error texts. The first live run is the real test: start with `opRound` and watch it.
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
