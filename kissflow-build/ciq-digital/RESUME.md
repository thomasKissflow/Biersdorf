# PAUSED 2026-10-09 (Thomas, relayed by the portal session): safe halt, resume only on Thomas's own go

**Where it stopped:** the prototype-parity build (workflow `wf_fe9ee13e-08d`) was STOPPED during its last phase (Integrate). The foundation and both screen builders had finished (3 agents' results are cached). The Workbench typechecks. No container write was in progress.

**Done today (live, dev sandbox, Thomas's OK):** 3 new read-only roles (Customs & Trade Compliance, Legal / IP, Business owner (reports)) with Thomas as member and the Auditor's 11 grants (D38).

**Not yet done:**
1. The Integrate phase (harness for the new roles and layout, all checks, screenshots). Resume:
   `Workflow({scriptPath: "/Users/thomas/.claude/projects/-Users-thomas-Documents-Kissflow-Projects-POC-Beiersdorf-kissflow-build-ciq-digital-postgen/c3c123d1-2b7f-40f0-94bd-dca59fbad190/workflows/scripts/ciq-workbench-parity-wf_fe9ee13e-08d.js", resumeFromRunId: "wf_fe9ee13e-08d"})`
2. The 11 role renames (`node kissflow-build/ciq-digital/postgen/roles-align.mjs --rename-only`), applied together with the new Workbench deploy.
3. Deploy the new Workbench zip (`kissflow-build/ciq-digital/deploy-workbench-ui.mjs`) and check every role's view in Kissflow.

---

# MORNING 2026-10-09: status for Thomas (read this first)

**CIQ Digital is GENERATED, verified and has its Workbench UI DEPLOYED** (dev sandbox only). Details: `runs/ciq-digital-v4/decisions.md` D37.

| What | Result |
|---|---|
| Generate (your OK) | exit 0; 11 flows + 22 lists live; 13 roles; you in all 13 roles; Z1/Z2 incomplete and switched off |
| Live read-back (GET only) | **442 pass / 0 fail** (flows, fields, steps, step permissions, child tables, lists, roles + members, grants) |
| Acceptance (REST, run tag ZZT-1008-1843) | 7/8 journeys pass end to end: case routing with parallel lanes, S5/S6/S7/S8 conditions, OP routing to all 6 reviews, CR 5-way fan-out + refusal, reject/withdraw. **Blank vs 0 settled** (a new case reads blank; Hold = Yes). The Forms journey "failed" only on script artifacts, which revealed 2 platform facts (child-row ids, below) |
| REST follow-ups (your OK) | CIQ Case Admin = flow Admin on the 3 processes (read back). Reviewers/approver already View-only. Send-back switched on at the 6 Open Point review steps. **Not done:** SLA durations ("set by BDF"); no-Delete resets (need a non-admin test) |
| Workbench (your OK) | Custom UI switched on; bundle Live (`ciq-workbench-ui-235af550b4.zip`, real Kissflow ids merged; the task list was checked live with a ZZT case at "Waiting for supplier: basic data"); opens at **/view/application/CIQ_Digital_A00/ui**; SDK connects; Diagnostics answers live |
| Portal session | Has the real ids + tonight's platform facts; no changes needed until you OK the integration spike (K-09) |

**Platform facts found tonight (verified live):**
- a Form create replaces child-row ids with server ids;
- a modify with an unknown row id ADDS a row (silent duplicate). The Workbench passes the harness with this behaviour;
- child formula columns compute server-side;
- page-session fetch writes get 403 (only the SDK or native UI can write as a user);
- Participated errors in the app too;
- a no-pages app's tasks don't show in the home queue (users work in the Workbench);
- the dev account banner says **"trial ends in 5 days"**: please check that with Kissflow before the bake-off.

## Needs your clicks (~5 min, in the Workbench; I can't click inside its frame)
Open https://dev-beiersdorf.kissflow.eu/view/application/CIQ_Digital_A00/ui and:
1. **K-WB (saving at a later step):** New case → create a ZZT case → on its "Waiting for supplier: basic data" task, save the manual record. Does it save (the Workbench reads back), or does it show "open the Kissflow form"?
2. **Send-back:** raise a ZZT open point for Sustainability (not to supplier), then on its review press **Return**. Does it go back, or open the native form?
3. **Two lanes at once (K-19P):** on a ZZT case in Part 2 with two lanes active, open both lanes in two tabs and press Save sign-off in both at the same moment. Are both kept?
Tell me the outcomes (or a screenshot of Diagnostics, whose "Copy diagnostics JSON" also works), and I'll record them and adjust.

**Test items:** every item labelled ZZT-… or "CIQ ZZ Spike" is a test item; you can delete them from the front end (list in `kissflow-build/ciq-digital/postgen/acceptance-items.jsonl`).

---

# NIGHT 2026-10-07/08: status for Thomas (read this first)

**Generate is READY but NOT DONE.** Claude's auto-mode safety guard blocked `kf apply` ("Protected-Scope IaC Apply") despite Thomas's "Generate if all pass". Claude must not work around it. To generate, either run this yourself from the project root:

    source .kf-env && node "/Users/thomas/.claude/plugins/cache/kissflow/app-builder/1.0.0/bin/kf.mjs" apply runs/current/app-spec.json --mode express --no-pages

…or tell Claude in chat to run it and allow it when asked (or add a Bash permission rule). Then Claude reads back every id, role member and grant, runs the acceptance tests and continues with the REST follow-ups (no integrations).

**Ready state (all verified tonight):**
- Plan graph **rev 31**, snapshot **v2** ("Z1/Z2 only, coherence pass 6"). Gate 0 errors; verify 0 errors; dry run 224 artifacts, 0 errors: 3 processes, 8 forms, 22 lists, 13 roles (Admin/User reused), 176 grants, **2 integration shells (Z1, Z2)**, 0 pages. `orchestrate clear … apply` → ✅ clear.
- Pre-generate review (5 reviewers + skeptics): **GO-WITH-FIXES, no blocker, no model change** (D35).
- Parallel steps (K-PAR) **PASS** in every pattern (A–C ×2, all six at once, one, none). Thomas is now in Spike Role A (approved). Reject and withdraw work over REST; send-back returns 500 over the key (real-user test pending).
- Platform limits found and designed around (D32–D34): lost updates under simultaneous writes; the key can't update fields after Start (submit works; admin route works); Mandatory isn't enforced on key submits.

**Needs a real signed-in user (Thomas), ~5 minutes, after generate:**
1. Send back once on the generated CIQ Open Point with OP_Dept = SUS (or now on test Point `PkEKOEvnYp7X`, "Spike review").
2. In the Workbench (once deployed): save a lane field at a review step (K-WB), and save two lanes from two tabs at the same moment (K-19P).

**Post-generate scripts are ready** (`kissflow-build/ciq-digital/postgen/`, README inside; offline self-checks pass):
- `node kissflow-build/ciq-digital/postgen/readback.mjs`: GET-only, 1–2 min. Compares the live app with the plan and the dry run, including role members (flags roles missing Thomas) and grants. Run it right after generate.
- `node kissflow-build/ciq-digital/postgen/acceptance.mjs`: needs Thomas's OK; creates 22 "ZZT" test items in 7–15 min. The FIRST check is blank vs 0 on a new case. It refuses to run if the readback fails.
- Note: the top-level `forms[]` section of `app-spec.json` has 3 stale lists, but the compiled build (what apply publishes) has the right values (checked: OP Outcome Accepted/Withdrawn, Round Outcome Accepted/Returned/Withdrawn, Event Category incl. "Final PDF").

**Workbench UI: BUILT and tested locally, NOT deployed** (`prototype/src/workbench/`; log `kissflow-build/ciq-digital/WORKBENCH-UI-LOG.md`; screenshots `kissflow-build/ciq-digital/workbench-screens/`):
- **Roles:** RMM (My work, cases, new case, case detail with every step panel incl. manual supplier records, change requests and triage), reviewers (queue, lane workspace with gates, open points raise/answer/return/withdraw, CR assessment, RMES sheet), overall approver, business admin (config, suppliers and contacts), reader and case admin (audit, lane repair), builder-only Diagnostics.
- **Write layer per D32–D35:** serial per item, write-then-verify, create one at a time, client-side Mandatory/gate checks, and the native-form fallback when a step write is refused.
- **Checks (re-run by Claude):** typecheck clean; 837/837 Workbench tests; portal 81/81 unchanged; harness 68/68 runs (50 scenarios + 18 native-form-fallback variants, ~2,090 checks) against an emulated Kissflow host; bundle 577 KB, guard-checked for credentials and internal names.
- **Independent review:** 4 reviewers + skeptics → 37 upheld findings, all fixed (incl. internal names in user text, Diagnostics now builder-only, CR refusal routing, timeout edge cases).
- **Decisions for Thomas:** WB-D1…WB-D20 in the UI log; the important ones are WB-D1 (counts fail-closed; may block normal approvers until a viewer route exists) and WB-D18 (contact-id format, agree with the portal session).
- **To deploy (after generate, needs Thomas's OK):** merge the server ids, upload the zip to the app's Application component, deploy in Kissflow, then a first Diagnostics run as Thomas.

---

# PAUSED 2026-10-07 (evening): Thomas went home. Resume from HERE

**Kissflow state:** the real app is **not generated**. No change was made to the app's design in Kissflow. Two test-flow actions were taken this evening, both on approved spike items:
- Point `PkEKIVviOqQs` "Spike review" was submitted, so the Point is Completed and the "point completed" test integration wrote its Log row.
- An attempt to submit "Spike prepare" on Case `PkEKIVlB5ZUn` was refused ("moved out of your queue"). The case is unchanged and still at "Spike prepare".

**Decided this evening (Thomas):**
- **Integrations: list only, build none now.** The full X/Y/Z list was given in chat (it's in the plan's §4).
- **App Builder's "at least 2 automations" rule → "Allow 2 empty shells".** Keep **Z1** (case completed) and **Z2** (case cancelled) as placeholders, and **drop Z3 and Z4** from the build. Generate creates Z1/Z2 as empty, switched-off shells; they get filled when we do integrations, or Thomas deletes them in the builder. Native step notifications don't count towards the rule (tested offline in `runs/ciq-digital-v4/scratch-notif-test`).
- **Thomas has no UI to click, so Claude runs the spike tests over REST**, acting as Thomas through the key.

**Found this evening** (details are in `SPIKES.md`, "Runtime tests run by Claude, evening"):
- **CIQ ZZ Spike Role A has 0 members**; Role B = Thomas. This, not a platform rule, is why nobody can act on "Spike prepare".
- **The key CAN submit a later step when its user is in the step's role** (Point review: 200, plus the Log row in about 6 s). The old "key can't act after Start" was a flawed test (it reused the Start task id). The plan, BRD, SPIKES and memory are corrected; the design rule stays: humans do human steps, and the sync service's user is in no step-owner role.
- **Adding Thomas to Role A was blocked by Claude's auto-mode guard** (a permission/role-membership change). Claude must NOT retry it another way.

## Next, in order
1. **Thomas:** add yourself to **CIQ ZZ Spike Role A**, either in the Kissflow admin (App → Roles) or by explicitly allowing Claude to do it.
   Then Claude runs `node kissflow-build/ciq-digital/spikes/k-par-test.mjs`, which does K-PAR (only A/B/C tasks), K-19P (A and B submitted at the same moment, both lanes kept) and C plus the join. It writes `k-par-result.json`. After that: K-09h send-back on Point `PkEKIVxRRM9x`.
2. **Claude: commit the automations slice with Z1 and Z2 only.**
   - The current slice (graph revision 29) is exported to `runs/ciq-digital-v4/scratch-z12/automations-rev-head.json` (shape `{branch, revision, key, content}`).
   - Remove the Z3 and Z4 entries from `content` and commit with `--base-revision 29`.
   - Re-commit whatever goes stale (coherence), then gate, verify and the `--no-pages` dry run. The gate must still show at least 2 automations.
   - Update `PREVIEW.md` (2 integrations instead of 4), add **D31** to `decisions.md`, and take snapshot v2.
   - Z3/Z4 (the SLA-breach audit) move to the "later integrations" list.
3. **Generate**, once K-PAR passes (Thomas's condition), with `--no-pages`. Then read back every id **and every role's members**; roles can come out empty, as Role A did.
4. The REST follow-ups (no integrations), then the front end, as below.

---

# CIQ Digital: where we paused (2026-10-07, safe halt for the session limit)

> **Update (resumed the same day):** steps 1–4 are DONE: re-commits, coherence pass 5 (rev 29, no defects), snapshot v1 and the dry run (226 artifacts, 0 errors; see `runs/ciq-digital-v4/PREVIEW.md`). **Next: Thomas approves the generate**, then the REST follow-ups.

**Nothing is half-done in Kissflow.**
- The real app has **not** been generated.
- The only things live in CIQ_Digital_A00 are the approved test flows ("CIQ ZZ Spike …", see `SPIKES.md`), their two test integrations (switched on by Thomas), and two connections.
- All plan work is in the local App Builder graph. Its commits are atomic, so it is consistent.

## The real backend run: `runs/ciq-digital-v4` (graph revision 17)

**Done:**
- **Requirement:** `runs/ciq-digital-v4/brd.md` holds the v4 plan, the portal contract and the test rules.
- **Plan stages** (workflow `wf_f482d0a6-add`): domain, architecture, data_model, workflow, security, automations, experience, coherence.
  - Conformance: **9/9 PASS** against v4.
  - Coherence: PASS-WITH-ISSUES, 10 defects.
- **Repairs** (workflow `wf_7b3a871f-edc`, stopped during the re-check):
  - **data_model (rev 12):** Open Point start gate; Section contacts required; OP Outcome = Accepted/Withdrawn; Event_File as the PDF fallback; separate override reasons.
  - **workflow (rev 15):** D15 (the release check always runs once); fresh counts while waiting for PS-11; contacts and markets editable at the check and waiting steps; Triage makes the X6 inputs mandatory.
  - **automations:** Z2 condition fixed; `_id` findings waived with runtime evidence; X3 guard handed to the portal session.
  - **security (rev 16):** follows the repaired handoff; reviewer reset becomes [View].
  - **experience (rev 17):** re-stamped.

**To do, in order:**
1. **Re-commit `automations`.** It shows *stale* only because the workflow changed after it; the content is unchanged.
2. **Re-check:** the coherence critic's second pass and the v4-conformance verifier. These are the "Recheck" phase of `wf_7b3a871f-edc`.
3. Save snapshot **v1** (`runs snapshot "v1 — initial plan"`).
4. Run **`/app-builder:author-preview`**: dry run with `--no-pages`, then the exact create list for Thomas.
5. **Generate**, only after Thomas approves the list **and** the parallel-steps runtime test (K-PAR) has passed. Use `--no-pages`.
6. **REST follow-ups after generate:**
   - finish the integrations;
   - flow Admin for CIQ Case Admin;
   - reset step-owner roles to [View];
   - per-step send-back, reject and e-mail switches;
   - SLA durations;
   - read the real ids back and send them to the portal session.
7. Then the **front end** (the Workbench custom UI).

**How to resume:**
- **Same session (the quickest):**
  ```
  Workflow({scriptPath: "/Users/thomas/.claude/projects/-Users-thomas-Documents-Kissflow-Projects-POC-Beiersdorf-kissflow-build-ciq-digital/c3c123d1-2b7f-40f0-94bd-dca59fbad190/workflows/scripts/ciq-v4-backend-repairs-wf_7b3a871f-edc.js", resumeFromRunId: "wf_7b3a871f-edc"})
  ```
  The finished repair agents replay from cache and only the Recheck phase runs live. Re-commit `automations` first (step 1).
- **New session:** start from this file. Run step 1, then a fresh coherence pass and conformance check against revision 17 (or later), then steps 3–7.

## Waiting on Thomas (can happen any time)
- **Test clicks** (`SPIKES.md`, "Still needs Thomas"):
  - submit "Spike prepare" on Spike Case `PkEKIVlB5ZUn` (parallel branches A–C);
  - two branches at once;
  - child-table columns visible;
  - submit Point `PkEKIVviOqQs` (expect a "point completed" Log row);
  - send-back on Point `PkEKIVxRRM9x`.
- **Aggregate capture:** add or save a Sum aggregate on CIQ ZZ Spike Register in the builder, so we can read how the builder stores it.
- **Confirm or overrule:**
  - **D15:** the release-request check always runs once, as an RMM task.
  - **Supplier contacts:** kept as a child table on CIQ Supplier; they can be loaded by script, since child rows are writable over REST.

## Portal session (App Builder - CIQ Supplier Portal): ON HOLD until the app is complete (Thomas's instruction)

**When CIQ_Digital_A00 is generated, verified and approved by Thomas, send ONE resume message with:**
1. **Real ids:**
   - the app id and every flow id;
   - the step names and ids X1–X6 trigger on ("Waiting for supplier: basic data", "…completeness PS-05", "…final release PS-11", the Open Point "Waiting for supplier");
   - the field ids the integrations read or write, including Trade_Name, Main_INCI, BDF_Material_No and OP_To_Supplier.
2. **Contract changes since plan v4:**
   - D15: the release check always runs once;
   - the X3 guard;
   - OP Outcome = Accepted / Withdrawn;
   - any id the engine changed.
3. **Thomas's explicit OK** for the K-09 legs and the X1–X6 / Y integrations that write to CIQ_Digital_A00.

**On resume the portal session will:**
1. fix its "Participated" list (getParticipatedItems errors live);
2. seed test items;
3. run K-09 a–i;
4. build the integrations.

**Don't message it before then:** it treats any message as a cue to check status, and it won't touch either container until it hears.

### Earlier coordination
- **It has:** the v4 contract, the test-flow ids, the integration REST recipe and the connection ids, plus the X3 guard (`OP_To_Supplier = "Yes"`, accepted).
- **It waits for:** the real app ids after generate.
- **It won't write** to CIQ_Digital_A00 except its agreed K-09 legs, and it announces each one first.

## Key files
- **Plan:** `docs/kissflow-data-model/app-plan-v4-processes-and-forms.md`
- **Test log:** `kissflow-build/ciq-digital/SPIKES.md`
- **Test scripts and logs:** `kissflow-build/ciq-digital/spikes/`
- **Run:** `runs/ciq-digital-v4/`, with `decisions.md` (note: two entries are numbered D17), `open-questions.md`, and the `scratch-*` folders holding each agent's offline builds.
