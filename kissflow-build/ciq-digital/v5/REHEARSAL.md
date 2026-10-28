# v5 graft rehearsal on the ZZ test flows (plan v5 §15, night step 1)

Kissflow-internal. Scripts, evidence and the request log (`requests.jsonl`, no credentials) are in `rehearsal/`.

**Scope.** Only these were written:
- CIQ ZZ Spike Case `CIQ_ZZ_Spike_Case_A00`;
- CIQ ZZ Spike Point `CIQ_ZZ_Spike_Point_A00`;
- the ZZ list `CIQ_ZZ_Spike_Decision_A00`.

All are in app `CIQ_Digital_A00` on DEV. The helper `rehearsal/lib.mjs` refuses any write whose path does not name one of these.

**Before every graft:**
- the live draft was saved to `rehearsal/originals/<flow>.before-<R>.json`, so it can be restored with putDraft + publish;
- the change was run as a dry run (`<R>-dryrun.json`, plus the patch CLI dry runs `dryrun-*.txt`).

**After every graft:**
- the draft was read back and compared entity by entity with what was sent. Every graft below: **0 differences**;
- the published fields were read back (`GET /process/2/{acc}/{proc}/fields`).

## Verdicts

- **S-12 PASSES on publish.** The whole 6-branch parallel block was removed from a published process by a hand-made graft. Draft PUT 200, publish 200, read-back identical. The published order is now Create → prepare → hold check → gate check → End. **CIQ Case can lose its Part 2 block the same way.**
  - Not yet proven: an item walking the new path, because of the grant blocker below.
  - The fallback (keep the block with every branch condition false) is not needed for the publish.
- **S-11 passes on publish, not yet at runtime.**
  - An app step assigned FROM a grafted MultiUser field publishes and reads back with the portal's shape.
  - A new item stores the user in that field.
  - Whether the task then routes to the user (and not to a role) is **unproven**: the key can't submit Start (blocker below).

## Blocker: no runtime walks

- **CIQ ZZ Spike Role A/B no longer exist** (`RoleDoesNotExistsError`; also in `plan-v5/inventory-app.md`). Their flow memberships went with them, so **both ZZ processes have 0 members**.
- Create works, but the key's Start submit answers **403 `KISSFLOW_ERROR_050302`** "You don't have permission to submit this item anymore", on both flows.
- The app session cleared one grant for this: Admin / Developer as Member + InitiateItems on the two ZZ processes. **Claude's permission guard refused it** ("Permission Grant") and we did not route around it.
- So **Thomas** grants it, in the builder or by running `node kissflow-build/ciq-digital/v5/rehearsal/grant-zz.mjs` himself. Then `node kissflow-build/ciq-digital/v5/rehearsal/walks-after-grant.mjs --run` walks the following:
  - a new Case item on the final shape. Expected: Create → Spike prepare [Admin / Developer] → Spike hold check [CIQ Integration Service] → Spike gate check [Admin / Developer] → Completed;
  - the Drafts left on older definitions (the version-pinning test);
  - the Point with `Spike_Assignee` = Thomas. Expected: `_current_assigned_to` = User Thomas, no AppRole.

## Results

| # | Change | Result | Shape that worked (entity kinds and attributes) | Evidence | Gotchas |
|---|---|---|---|---|---|
| R0 | Prerequisite: re-point the 10 Case steps and 2 Point steps owned by the deleted roles to "Admin / Developer" `RoEK3_3Jy9XU` | **PASS** (metadata) | `Resource`: `Value` and `DisplayValue` changed in place (`ValueType:"AppRole"`; Id and Activity kept) | `R0C-result.json`, `R0P-result.json` | Live tasks keep the dead role as `_current_assigned_to` after the re-point (`post-graft-reads.json`) |
| R1 | add-field ×2 on the published Case: `Spike_V5_Note` (Text) and `Spike_V5_Phase` (Select, list Yes No), each set explicitly on every step | **PASS**: publish, Start write, admin write. Both fields are in published `/fields`. Write at create and at Start (assignee route `POST …/{item}/{startActivityInstance}`) read back. Admin `PUT …/admin/{proc}/{item}` read back on a Draft and on an in-progress item created on the OLD definition (`PkEKO4Ijeqy3`) | `mutAddField` (the patch verb): + Row, + Column `{Type:"Field", Start:0, End:6, Row, Column::Field:[fid]}` appended to the Section's `Column::Row`, + Field (`ReferredList` for a Select), + 1 `Permission {Activity, Column, Permission}` per Start, UserTask and End activity; + `Model::Field`. Levels via `setPerm`:<br>• Note: Editable at Start, Hidden in the lanes, ReadOnly elsewhere.<br>• Phase: Editable at prepare, Hidden in the lanes, ReadOnly elsewhere.<br>Totals: +2 Row, +2 Column, +2 Field, +24 Permission | `R1-result.json`, `dryrun-r1-*.txt` | (a) **The verb also adds a Permission to the Parallel and SendBackToInitiator activities** (14, not 12). We strip them to match the platform's shape.<br>(b) **A field set ReadOnly at Start was still written by the key at Start** (200). The UIs must enforce Start permissions themselves |
| R2 | Rename step "Spike gated step" → "Spike gate check" | **PASS** (metadata): `Activity_1tuyhu` keeps its id; only `Name` changed | `Activity.Name` (`mutRename`) | `R2-result.json` | Runtime name in the path: pending the walks |
| R3 | step-actor: "Spike hold check" Admin / Developer → **CIQ Integration Service** `RoEKl89I5nGx` | **PASS** (metadata). Routing: pending the walks | `Resource {ValueType:"AppRole", DisplayValue:"CIQ Integration Service", Value:"RoEKl89I5nGx"}` (`mutStepActor`, by role id) | `R3-result.json` | The CLI verb resolves roles **by name**; it failed on the deleted roles. Pass ids in the graft |
| R4 | Remove the plain step "Spike not-equal step" `Activity_1uarf0z` | **PASS** (metadata): order Create → prepare → lanes → hold check → gate check → End | Hand-made graft (`removeActivities`): delete the Activity, its 37 Permissions, 1 Resource, 1 Expression and its 3 Nodes (`Expression::Node` → `Node::Node`); remove the id from the parent `ProcessDef::Activity`. Then preflight (`validateBlob` + `checkHygiene`) gives 0 errors, and a dangling-ref scan finds 0 | `R4-result.json` | No `Column::Permission` back-refs exist in these drafts, so none needed cleaning |
| R5 = S-12 | Remove the whole 6-branch parallel block "Spike review lanes" `Activity_t7r746` | **PASS (publish)**: order Create → prepare → hold check → gate check → End; all 36 fields are still published. Live items on the removed steps beforehand: none (`r5-preflight-items.json`). After the graft, the old in-progress item `PkEKO4Ijeqy3` (at prepare) still reads | Same graft, recursive through `Activity::ProcessDef`: deleted 7 Activities (Parallel + 6 branches), 6 branch `ProcessDef` (`{Name, Activity:<parallel>}`), 222 Permissions, 6 Resources, 6 Expressions, 18 Nodes; 1 change (root `ProcessDef::Activity`). 265 entities removed, 0 dangling | `R5-result.json`, `R5-dryrun.json` | The lane fields stay; fields can't be deleted (P12). Runtime walk: pending the grant |
| R6 = S-11 | Point: add MultiUser `Spike_Assignee` (Editable at Start, ReadOnly elsewhere) and assign "Spike review" FROM it | **PASS (publish + stored value).** The field is in published `/fields`. A create with `Spike_Assignee:[{_id:"UsEJUfjYLM8Y"}]` stored `[{_id, Name:"Thomas", Kind:"User"}]`. Routing to the user: **unproven** (Start submit 403) | + Field `{Type:"MultiUser", Field::QueryDefinition:[qd]}` + QD `{LHSModel:"User", FlowType:"User", LookupField:[], HiddenField:[]}` + Row/Column + 4 Permissions; `Resource {ValueType:"Field", DisplayValue:"Spike Assignee", Value:"Spike_Assignee", Field:"Spike_Assignee", Activity}` (Id kept) | `R6-result.json`, `post-graft-reads.json` | **Tasks already open at the step keep their old assignee** (2 items still on the dead Role B). Converting CIQ Open Point's steps to field assignment won't move open items |
| R7 | List replace on `CIQ_ZZ_Spike_Decision_A00`, keeping Approved and Rejected, + "Needs info" | **PASS.** POST 200; read-back = `["Approved","Rejected","Needs info"]`. A new item stored "Needs info". An old item still reads "Rejected" | `POST /flow/2/{acc}/list/{id}/items {"ListItems":[…the whole set…]}` (it replaces the whole set; send the old values too) | `R7-result.json` | A value **not** in the list is **silently dropped** at create (200, stored null). `patch.mjs list-items` **ignores `--dry-run`** (it writes at once), so we used our own script |

## Rate limit (Cloudflare challenge)

- **17:26:43Z and 17:27:05Z:** 429 with an HTML "Just a moment…" page on GET draft (R2 dry run). The run aborted before any mutation. My two backoff polls (17:28:53Z, 17:32:02Z) were also 429.
- **Paused 17:33Z–17:54Z** on the coordinator's order. Resumed after the portal session's probe (200 JSON at 23:24 IST).
- **Since the go:** 69 calls, 0 × 429, at ≥1 s pacing.
- No draft was written in a bad state: the last write before the challenge was R1's publish at 17:26:10Z, and it read back identical.
- **Guards now in the scripts:**
  - any HTML body or 429 stops the run;
  - a draft is used only when the GET is 200 + a JSON object with `Root` = its model id;
  - list items are used only when the GET is 200 + a JSON string array.

Log: `rehearsal/rate-limit-log.md`.

## Throwaway test items left (ZZ flows, Draft at Start)

- **Case:** `PkEMvw1aB185` (R0C), `PkEMvy3KGl4d` (R1), `PkEMwRQewJ5r` (R2), `PkEMwTNCH7Eu` and `PkEMwTPsze_H` (R7).
- **Point:** `PkEMvxcZ29BU` (R0P), `PkEMwT11l9xu` (R6).

Once the grant exists, `walks-after-grant.mjs --run` submits the Case drafts as the version-pinning test.
