# CIQ Digital: post-generate checks

Two scripts to run right after App Builder generates the CIQ Digital backend (`CIQ_Digital_A00`, plan `runs/current/app-spec.json` at graph revision 31, generated with `--no-pages`).

- `readback.mjs` is read-only.
- `acceptance.mjs` writes test items, so it runs only after Thomas approves.

Run both from the project root (`Beiersdorf/`). They need Node 18 or later.

## What to run, in order

| # | Command | Talks to Kissflow? | Needs Thomas's approval? | Time |
|---|---|---|---|---|
| 0 | `node kissflow-build/ciq-digital/postgen/readback.mjs --offline` | No. `fetch` is disabled and the client is never loaded | No | about 1 s |
| 0 | `node kissflow-build/ciq-digital/postgen/acceptance.mjs --dry-run` | No. It runs against the offline simulator | No | about 1 s |
| 1 | `node kissflow-build/ciq-digital/postgen/readback.mjs` | Yes, GET only (`client({ readOnly: true })`, about 100 calls) | No (read-only check) | 1–2 min |
| 2 | `node kissflow-build/ciq-digital/postgen/acceptance.mjs` | Yes. It **creates 22 test items** and advances them | **Yes** | 7–15 min |

The exit code is 0 when everything passes and 1 when something fails. `acceptance.mjs` exits with 2 when it refuses to run.

## `readback.mjs`: read-only comparison of the live app with the plan

It reads every id back from Kissflow. The apply log and `runs/current/generated/id-map.json` are only cross-checked, never trusted. The expected values come from the dry-run build `runs/current/preview-rev31/`, which holds the exact blobs the apply publishes, and from the plan.

| Area | What it checks |
|---|---|
| `app` | The app is readable and Live. |
| `roles` | All 13 roles exist exactly once. Admin and User are **reused**, with the same ids as before generate (`RoEK3_3Jy9XU`, `RoEK3_3NtdWL`). There are no unplanned roles. |
| `membership` | For each role: Members and UserCount. It **FAILs every role where Thomas (`UsEJUfjYLM8Y`) is missing**, because the apply's developer-add can fail silently. It also checks SEC-HR2: every CIQ Case Admin member also holds CIQ RMM. |
| `lists` | All 22 lists exist exactly once, are Live and have the exact items. |
| `flows` | 3 processes and 8 forms, each with the right name, type and id, Live, and with `PublishedAt` set. There are no unplanned flows. |
| `fields` / `child-tables` | Every field's id, type, list (matched by list name, because the live list ids carry `_A00`), formula, reference target and Required flag. There are no unplanned fields. Each child table has the right parent and columns. |
| `published` | The runtime field list (`allfields`) shows every header field and child table with the planned type and Required flag. |
| `workflow` | Each process activity: order, node type, owner role (matched by role name), condition and parallel branches. |
| `step-permissions` | Every step × field/table cell compared with the compiled preview (Mandatory, Editable, ReadOnly, Hidden). |
| `grants` | Each of the 11 flows × 13 roles compared with the preview grant. **Escalations are checked against `security.post_generate_grants`:** a grant that matches the preview but is still waiting for its planned post-generate reset is a WARN (`ESCALATION pending the post-generate reset`). A grant above even the preview is a FAIL. The no-Delete reset on CIQ Config Version and CIQ Audit Event (K-17) is a WARN until it is done. |
| `grant-shape` | WARN when the exact member shape differs from the assumed one, which is [unverified] for App Builder 1.0.0 (see below). The access class (admin > write > read) is what must match. |
| `reports` | "All Items" report grants: View only for roles that have flow access (FAIL otherwise). Flow members without report View are listed. |
| `integrations` | Exactly Z1 and Z2, both switched off (`IsActive=false`). The spike harness integrations are listed, not failed. |
| `pages-nav` | No page besides the pre-existing `Home_Page_A00`. The navigation points at no new page and at no CIQ flow. |
| `after-generate` | INFO only. It lists any send-back, reject or e-mail flags it sees on the steps, next to the switches still to be set by hand (`workflow.meta.after_generate_switches`). |
| `apply-log` | INFO/WARN. It cross-checks App Builder's id-map and apply log, if present. |

The approved spike harness (`CIQ ZZ Spike …` flows, lists, roles and integrations) lives in the same app. It is reported, never counted as a mismatch.

Outputs:
- `readback-result.json`: the checks, the summary per area, the live ids (flows, lists, roles, integrations, reports), role membership and the live step list.
- `live/`: the metadata, members and report members as read. Use these as the base for any later REST patch. Disable with `--no-save`.

**`--offline` mode** makes no network call. It runs three checks:
1. It checks the plan against the preview: rev 31; 224 artifacts with 0 errors; data_model vs compiled fields; workflow steps vs compiled activities; `security.field_permissions` vs compiled step cells; `security.roles` cells vs the 176 compiled grants; post-generate targets; Z1/Z2.
2. It runs the live comparison code against a **simulated** clean apply, which must give 0 FAIL.
3. It injects 10 deliberate defects into the simulator. Each one must be caught in its own area.

This proves the script, not Kissflow. The result is written to `readback-result.offline.json`.

Assumptions marked [unverified]:
- **Member shape per preview level.** Process Editable → Member `["InitiateItems"]`; ReadOnly → Member `["View"]`. Form Editable → Member `["Delete"]`; ReadOnly → Viewer. The source is the 1.6.0 engine's `flowGrant()`. A shape difference is only a WARN.
- **Routes:**
  - The report-member read route (`…/report/{id}/member`). If it fails, the result is a WARN telling you to check "View report" in the UI.
  - The page list route (`/flow/2/{acc}/application/{app}/page/`).
- **Child-table grant entries.** The preview has 61 of them (Contacts, Components, Safety_*, Regulatory_*). They have no flow of their own, so there is nothing to read back per role.

## `acceptance.mjs`: journeys over REST (writes test items)

The script acts as Thomas through the account key. It follows the verified platform behaviour:
- The key can **submit** a step only when Thomas is in the step's role.
- It **cannot update fields after Start** (050313). The script therefore writes step fields through the admin route `PUT /process/2/{acc}/admin/{proc}/{item}` before each submit, as the Workbench or RMM would.
- It writes one item at a time, with write-then-verify and up to 3 tries (D32).
- Parallel branches are submitted at the same moment.
- Forms are created one at a time (per-user draft, then submit).
- Child rows use the `Table::<ChildModelId>` shape.
- DateTimes are sent without milliseconds.

Before each submit, the script enforces the Workbench rule (D33): every non-User Mandatory field must be filled and every gate formula must be "OK". If not, the journey stops.

**Gate before any write.** The script first runs the full readback and writes it to `readback-result.json`.
- If the readback has any FAIL outside `membership`, the script **refuses to write anything** (exit 2). An understood FAIL can be waived explicitly with `--waive "<text>"`; each waiver is recorded.
- A journey that needs a role without Thomas is **refused**, and the script prints which role. Other journeys still run.

| Journey | What it proves | Expected step path |
|---|---|---|
| **d** (runs first) | **FIRST CHECK, D35/F3.** A fresh case reads `Open_Items_Count` blank (not 0) and `Hold_For_Open_Items = "Yes"`. After 0/0 is written through the admin route at S1, Hold = "No" and both gates are "OK", so S5 and S8 are skipped. | Create → S1 → S2 → S3 → Review – Sustainability → S7 → Completed |
| **a** | Happy path. REG, SAF and RMM lanes are submitted at the same moment. Overall approval is on, so S6 runs. S7 writes Open_Items_Count = 1, so S8 runs; S8 writes 0/0. Lane gates are "OK". | Create → S1 → S2 → S3 → [REG, RMM, SAF] → S5 → S6 → S7 → S8 → Completed |
| **b** | One department (QM) with no overall approval, so S6 is skipped. | … → Review – QM → S5 → S7 → Completed |
| **c** | `Overall_Decision = Rejected`, so S7 is skipped, and S8 too because the counts are 0/0. The case still reaches End. | … → Review – Safety → S5 → S6 → Completed |
| **e** | Six Open Points. To_Supplier is Yes for REG (it goes through Waiting for supplier) and No for SAF, QM, MIC, SUS and RMM. Routing reaches each of the 6 review steps. `Start_Gate` and `Open_Num` are checked. A Rounds child-row write is tried at Start and through the admin route at the REG review (probes). `OP_Outcome` is Accepted, so `Open_Num = 0`. | Raise → [Waiting for supplier] → Review – <D> → Completed |
| **f** | Change Request 1 is created at CHRQ_S0 (needs CIQ Integration Service) and triaged "Accepted" with all five Impact flags on. Five Assess branches run at the same moment, then the join, then End. `CR_Open_Num` goes 5, then 0. Change Request 2 is refused, so every branch is skipped and the join still reaches End. | Receive → Triage → [5 Assess] → Completed; Receive → Triage → Completed |
| **g** | One item in each of the 8 Forms, created serially. Child rows are added at create, modified and added again (Contacts, Components, Criteria/Findings), then read back. The `Criteria_Open_Num` formula gives [0,1,0,1], then 0 once a comment is set. | (no steps) |
| **h** | One case is rejected at an RMM step (S1) with a Comment, giving status Rejected. Another case is withdrawn, giving status Withdrawn. | Create → S1 → (Rejected / Withdrawn) |

Each journey writes an entry to `acceptance-result.json` with `{journey, ok, path, expectedPath, checks[], items[], notes[]}`. The file is rewritten after every journey, so an interrupted run keeps what it did. A check marked `probe` records platform behaviour and does not fail the journey (the Rounds row writes, reads at Start). All calls are logged to `acceptance-requests.jsonl`, without credentials.

**Test data.** Everything is fictional and labelled `ZZT-<MMDD-HHMM>-<journey>`: case codes, point and request keys, form keys. E-mails use `@example.invalid`. User-type fields are **left blank** by default (Owner_RMM, *_Completed_By, Reviewed_By, *_Assessed_By), because they can only hold real users. Mandatory is not enforced for the key (D33). `--user-fields=self` fills them with Thomas himself; that write shape is [unverified].

**Nothing is ever deleted.** The run creates 22 items: 6 CIQ Case, 6 CIQ Open Point, 2 CIQ Change Request and one item in each of the 8 Forms. They are listed at the end of the run, in `acceptance-result.json → items[]` and in the append-only `acceptance-items.jsonl`, which keeps the items of earlier runs too. Thomas deletes them from the front end.

Options:
- `--journeys d,a` runs a subset.
- `--quiet` hides the planned calls in a dry run.
- `--sim-fault <name>` (dry run only) shows the gate refusing. Example: `thomas-missing` refuses b, e and f; `condition` refuses everything.

Before the live run:
- **Keep Z1 and Z2 switched off.** Z1 triggers on case completion.
- **Set the reject switch first if it is needed.** The after-generate reject switch (ON at the RMM steps) may not be set yet. If it isn't and the platform needs it, journey h records the reject as failed.
- **Send-back is not covered.** Over REST it gave 500 in every form (D34). It needs a real-user test on a generated CIQ Open Point (D35 F5).

## Files

| File | Written by |
|---|---|
| `lib/expect.mjs` | Shared, network-free: plan/preview loading, blob description, grant classes, formula evaluator |
| `lib/readback-core.mjs` | Offline plan checks + the live comparison (takes a client from its caller) |
| `lib/sim.mjs` | Offline simulator of the generated app, built from preview-rev31 only (used by `--offline` and `--dry-run`) |
| `readback-result.json`, `live/` | `readback.mjs` (live); `acceptance.mjs` also refreshes them before writing |
| `readback-result.offline.json` | `readback.mjs --offline` |
| `acceptance-result.json` (latest run), `acceptance-items.jsonl` (append-only ledger of every item ever created, all runs), `acceptance-requests.jsonl` (every call) | `acceptance.mjs` (live) |
| `acceptance-result.dry-run.json` | `acceptance.mjs --dry-run` |

**Plan note.** The top-level `forms[]` projection in `app-spec.json` is stale for 3 lists:
- CIQ Event Category lacks "Final PDF".
- CIQ OP Outcome still has "Returned".
- CIQ Round Outcome is missing.

The compiled preview follows `data_model`, which is correct, and the readback compares with the preview. If generate used `forms[]` instead, the `lists` area would FAIL.
