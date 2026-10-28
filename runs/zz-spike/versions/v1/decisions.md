# Decisions: run `zz-spike`

## Stage 1: author-brief (2026-10-07, kf-ba)

### Source
`runs/current/brd.md` (61 lines), read in full. Thomas approved it on 2026-10-07 (L3). `kissflow-build/ciq-digital/SPIKES.md` was used only to describe each flow's test purpose in the journeys. It added no content.

### Scope
This is a throwaway test harness for CIQ Digital (`CIQ_Digital_A00`). Every name starts with "CIQ ZZ Spike". It is extracted exactly as specified, with nothing added.

- **Flows (4):**
  - Process "CIQ ZZ Spike Case": 7 steps, including a 6-branch PARALLEL block "Spike review – A" … "– F" (en-dash U+2013).
  - Process "CIQ ZZ Spike Point": 4 steps.
  - Form "CIQ ZZ Spike Register".
  - Form "CIQ ZZ Spike Log".
- **Child tables (3):**
  - "Spike Case Notes", editable only at "Spike prepare".
  - "Spike Rounds", editable only at "Spike review".
  - "Spike Lines".
- **Computed values (4):**
  - Hold_Flag (formula).
  - Gate (formula, Mandatory at "Spike gated step").
  - Open_Lines (header SUM).
  - Open_Count (cross-flow SUM of Register.Open_Lines via the Reference Register_Case).
- **Roles (2):** "CIQ ZZ Spike Role A" and "CIQ ZZ Spike Role B". They have no members, and both are Editable on all four flows.
- **Lists (2):**
  - "CIQ ZZ Spike Yes No" (Yes, No).
  - "CIQ ZZ Spike Decision" (Approved, Rejected).
- **Out of scope:** pages, nav, UI and automations. The test integrations are created separately.

### Domain model
- **Personas (2):** one tester per role.
- **Journeys (4):** one per flow.
- **Entities (4).**
- **Business rules (21):** every one is line-referenced to brd.md.
- **Orphans:** none.

The exact step names, owners, conditions and per-step field rules are in `domain.process_contract`. Defaulted placements are marked `defaulted_editable_fields`, with OQ references.

### Defaults applied
OQ-01 to OQ-10 are in `open-questions.md`. Main ones:
- Branch ownership is A/C/E for Role A and B/D/F for Role B.
- Flag_A–F and Spike_Decision are editable at "Spike prepare".
- To_Supplier reuses "CIQ ZZ Spike Yes No".
- The Point scalars are editable at Start.
- No other editable or Mandatory fields.

### Graph
- The `domain` slice was committed at revision 2 (base 1). Receipt: `ba/domain-commit-receipt.json`. A read-back matches the payload exactly.
- A scratch snapshot validates with only `NO_APP_NAME`, which kf-architect owns.

### Next
kf-architect.

## Stage 2: author-plan, wave 1 (2026-10-07, kf-architect)

The `architecture` slice is committed at graph **revision 3** (base revision 2), and its read-back matches the payload exactly. The commit also refreshed the engine-owned `app-spec.json` snapshot. Validate now shows only items other owners hold: PROCESS_NO_STEPS ×2 (workflow) and FORM_NO_FIELDS ×4 (data).

## D1 · Flow map, ids and roles — 2 Processes + 2 Forms exactly as the BRD; flow ids `<name>_A00`, list ids without `_A00`; Role A/B custom, Admin/User reused
**Why:**
- brd L10–L53 fix the four names and types. Both Processes hand work between Role A and Role B with conditions, so they are Processes from the start (LESSONS 1).
- The 3 child tables are embedded models, not account-level flows, so their BRD names need no "CIQ ZZ Spike" prefix.
- The compiler builds a list's display name from its id, and an `_A00` id compiles as "… A00" (`kissflow-build/ciq-digital/BUILD-LOG.md`, item 2). So the list ids are `CIQ_ZZ_Spike_Yes_No` and `CIQ_ZZ_Spike_Decision`.
- One persona per role: p_tester_a → Role A, p_tester_b → Role B. No members.
**Alternatives:** `_A00` list ids, as in run ciq-digital. Rejected because the lists would not get the exact BRD names.
**Status:** `proposed`

## D2 · Case ↔ Register ordering — the full BRD model goes into one generate; G1 (after Register is published) is a read-back gate that grafts only what didn't land
**Why:**
- The dependency runs both ways: Register.Register_Case references Case, and Case.Open_Count sums Register.Open_Lines matched on Register_Case.
- **How the engine handles it:**
  - PASS 1 creates every flow shell first, so both ids exist.
  - The aggregate is compiled inline into Case.
  - PASS 2 publishes bodies with no dependency order and no deferral of back-pointing aggregates (4-wide parallel in the 1.6.0 engine).
  - A refused publish leaves that flow an unpublished draft.
  - So the engine does not place Open_Count after Register by itself.
- **What G1 does** after generate: it reads Case back and takes one path.
  - (a) Everything is wired: done.
  - (b) The publish was refused: publish the draft again.
  - (c) Case is published but an item is missing: graft only the missing items with `kf patch`. The aggregate needs a bespoke graft.
- The real app has the same pattern (Form header counts feed the CIQ Case holds and gates), so the harness should meet the cycle the way the real generate will.
**Alternatives:**
- Generate Case without Open_Count, Hold_Flag, Gate, the hold-check condition and the Gate Mandatory, then graft all five (plan L807 style). Rejected as the default: it guarantees five edits to a published Process (LESSONS 1b says those are refused), and the engine has no switch to hold items out of one publish. It stays as the fallback, path (c).
- Publish Register before Case. Not expressible, because PASS 2 has no per-flow order.
**Status:** `proposed`

## D3 · No pages — `pages = []`; generate must run with `--no-pages`
**Why:** brd L60. Without the flag, a build auto-adds role home pages, flow pages and nav even when `pages = []` (run ciq-digital, D37). The engine's verb list includes `build [--no-pages]`.
**Alternatives:** Delete the auto-added pages after generate. Rejected because it means more live writes.
**Status:** `proposed`

## Stage 2: author-plan, wave 2 (2026-10-07, kf-workflow-designer)

The `workflow` slice is committed at graph **revision 5**. Revision 4 had a nameless parallel container, and validate rejected it with `STEP_NO_NAME`. The read-back of revision 4 matched the payload exactly. Validate on the revision-5 snapshot gives 0 errors. Its 7 warnings belong to other owners: FORM_NO_FIELDS ×4 and STEP_CONDITION_FIELD_MISSING ×3, which wait on `data_model`.

## D4 · Step ids, names, owners and conditions are exactly as `architecture.id_reservations.step_prefix_by_flow`
**Why:** brd L12-L34 and domain.process_contract. Branch names keep the en-dash U+2013. Each branch is a one-step arm whose arm name equals its step name, because the BRD names no arms. There are no SLAs or notifications, because the BRD states no durations.
**Status:** `proposed`

## D5 · The parallel container SPKC_PAR is named "Spike review lanes"
**Why:** The BRD names no block step. The engine refuses a nameless step (`STEP_NO_NAME`, revision 4), so the name is a label only. The container has no owner and no condition. It compiles to a `NodeType:"Parallel"` activity with 6 branch ProcessDefs and an auto-join.
**Alternatives:** Leave it nameless. Not possible, because validate fails.
**Status:** `proposed`. Thomas may rename the label.

## D6 · Step field permissions are handed to Security, not authored on the steps
**Why:** This follows the engine convention from run ciq-digital: `security.field_permissions[flow][stepId][field]`. The exact cells are in `workflow.meta.security_handoff.items`. Unlisted fields must be set to ReadOnly explicitly. The offline compile showed that a child table left without a key compiles as **Editable** at the StartEvent.
**Status:** `proposed`

## D7 · Offline compile spike (scratch only, with a stubbed data_model and security; nothing applied)
- **Compiled:**
  - Parallel with 6 branch ProcessDefs.
  - Branch-scoped permissions: each branch activity carries its own `Activity::Permission`. Only its own lane is Editable, `Lane_X_Confirm` is Mandatory, and the other 31 fields are ReadOnly.
  - The formula-field condition `Hold_Flag = "Yes"`.
  - The `!=` condition. The AST is Function `!=`, Infix.
  - Gate Mandatory: the Permission is emitted on the formula column.
- **Partly compiled:**
  - Child-table step permission: emitted only on the table column (`Column` of Type Model). No per-column `Activity::Permission` is emitted for Note_Text/Note_By or for the Spike Rounds columns (LESSONS 7 risk).
  - Declaring a child table both as a `childOf` form and in `childTables[]` duplicates `Model::Row` and `Model::Model`.
- **Data finding:** the child column `Round_No` overwrote the header `Round_No` Field node, so the header field has no Field node. The engine did not namespace the clash in this stub.
**Status:** `proposed`. The live checks are runtime behaviour: a Mandatory formula field, the per-column visibility of child tables, and the formula condition evaluated at runtime.

## Stage 2: author-plan, wave 2 (2026-10-07, kf-data-architect)

The `data_model` slice is committed at graph **revision 6** (base revision 5), and its read-back matches the payload exactly. An offline compile of a scratch materialization (`build --no-pages`, no `--apply`) gives 0 errors and 0 warnings, and `validate` gives 0 errors and 0 warnings. The foundation findings at revision 6 are only the workflow slice's 6 × FOUNDATION_EVIDENCE_GATE (Lane_X_Confirm Mandatory), which belong to the workflow and security owners.

## D8 · Fields exactly as the BRD and the domain defaults; nothing added
**Why:** brd L10-L53, plus OQ-04, OQ-07, OQ-08 and OQ-09.
- Case: 34 fields. Flag_A-F are Select on CIQ_ZZ_Spike_Yes_No. Each lane has Lane_X_Confirm (Select, Yes No), Lane_X_By (Text), Lane_X_At (DateTime) and Lane_X_Note (Text). Spike_Decision is Select on CIQ_ZZ_Spike_Decision. Open_Count is a Number aggregate, and Hold_Flag and Gate are Text formulas. The child table Spike Case Notes has Note_Text and Note_By, both Text.
- Point: 6 fields, plus the child table Spike Rounds with 4 columns.
- Register: 3 fields. Register_Key is required, Register_Case is a non-required Reference, and Open_Lines is an aggregate. The child table Spike Lines has Line_Text (Text) and Line_Open (Number).
- Log: 6 fields. Log_Item_Id stays Text (TK01).
- Lists: CIQ_ZZ_Spike_Yes_No and CIQ_ZZ_Spike_Decision are `{name, items}` entries. They compile with the display names "CIQ ZZ Spike Yes No" and "CIQ ZZ Spike Decision", exactly.

Register_Case has no explicit `lookup`, because Case has no display-name field and the BRD names none. The compiler's default lookup picks Case's first field, Flag_A (LESSONS 3b). This is reported, not changed.
**Status:** `proposed`

## D9 · The Spike Rounds column Round_No gets the id `Spike_Rounds_Round_No`; its label stays "Round_No"
**Why:** With the same id `Round_No` on the header and the child column, the compiled blob has ONE Field node `Round_No` with Model=Spike_Rounds. The child column overwrote the header field, so Point's `Model::Field` points at a child column. The engine namespaces collisions between sibling child tables (LESSONS 4), but not between a header and a child table. A distinct id with the same display name compiles to two separate Field nodes, both named "Round_No", one on each model.

This is an id change only, not a rename: the BRD name is the label, and it is unchanged. The workflow security handoff keys the header `Round_No` and the whole table `Spike_Rounds`, so no consumer refers to the column id.
**Alternatives:** Keep the same id. Rejected because the header field would be lost.
**Status:** `proposed`. It is an engine gap: the IR cannot give a header field and a child column the same id.

## D10 · Open_Count: IR shape kept; the compiled LHSModel is wrong (NOT correctly expressible in this compiler)
**IR:** `aggregate:{fn:"SUM", over:"CIQ_ZZ_Spike_Register_A00", field:"Open_Lines", flowType:"Form", match:{field:"Register_Case", equals:"_id"}}`. Foundation accepts this source and join. A bad source gives FOUNDATION_AGGREGATE_SOURCE, and a bad join gives FOUNDATION_AGGREGATE_JOIN.

**Compiled:**
`AggregateDefinition{LHSModel:"CIQ_ZZ_Spike_Case_A00", FlowType:"Form", AggregateType:"Sum", AggregateField:"Open_Lines", LHSModelApplicationId:"CIQ_Digital_A00"}` + `Criteria/Condition{LHSField:"Register_Case", Operator:"EQUAL_TO", RHSType:"Field", RHSField:"_id"}`

LHSModel is the HOST (Case), not Register. Variants tried in sandbox copies of the graph:
- `over` as the flow id or as the flow name;
- 13 alternative source keys;
- `match.flow`;
- forms[] reordered so that Register comes first.

All compile LHSModel = Case. Without `over`, the aggregate is silently dropped, leaving a plain Number. `flowType:"Form"` is added only to correct the QD FlowType, which otherwise inherits "Process" from the host.
**Consequence:** As compiled, Case would try to sum Case.Open_Lines, which does not exist. G1 path (c) must re-point LHSModel to Register's live id, unless the apply-time id remap does that (not observable offline).
**Status:** `proposed`. This is a compiler defect to report.

## D11 · Hold_Flag and Gate formulas over the aggregate, and the embedded SUM on a Form, compile cleanly
**Why:** Both formulas compile to full Node trees in which Open_Count is a `Type:"Field", DataType:"Number"` operand. Hold_Flag is a nested IF(ISBLANK, IF(=)), and Gate is IF(=(IF(ISBLANK,0,field),0),"OK",""). The ExpressionStr is verbatim.

Open_Lines compiles to `{LHSModel:"CIQ_ZZ_Spike_Register_A00", LHSRootModel:"CIQ_ZZ_Spike_Register_A00", FlowType:"Form", AggregateType:"Sum", AggregateField:"Line_Open"}`, with Widget Aggregation and ReadOnly. This is the engine's embedded-child shape: LHSModel is the parent, not the Spike_Lines model.
**Status:** `proposed`. At runtime, check that the platform computes it.

## Stage 2: author-plan, wave 3 (2026-10-07, kf-security-designer)

The `security` slice is committed at graph **revision 7** (base revision 6), and its read-back matches the payload exactly. The offline build of a scratch materialization **failed validation** with 22 × STEP_PERM_FIELD_MISSING, so nothing was compiled and `verify` was not run. Work stopped there as instructed.

## D12 · Grants, initiators and step field permissions as the wave-3 brief; child-column keys are NOT accepted by the IR
**Authored:**
- Role A and Role B: Editable, scope `all`, on all 4 flows. Role A is `initiator: true` on both Processes; Role B is not. Each task step is `Act` for its workflow owner and `View` for the other role. Admin and User get no grants.
- `field_permissions[flow][stepId]` keys every header field, the child table, and each child column explicitly at every task step (SPKC_S0, S1, BA-BF, S3, S4, S5; SPKP_S0, S1, S2), with the cells in the brief. Unlisted keys are ReadOnly. SPKC_PAR and the End steps have no keys.
**Finding:** validate rejects child-column ids as step keys: "is not a field, section or child table on this flow". The errors are Note_Text/Note_By at SPKC_S0, S1, S3, S4, S5, and Spike_Rounds_Round_No/Question/Response/Outcome at SPKP_S0, S1, S2. Only the table key (`Spike_Case_Notes`, `Spike_Rounds`) is expressible. The same keys at the six branch steps were NOT reported, so validate appears not to walk the branch steps.
**Proposed fix (not applied):** drop the child-column keys and keep the table key only. Re-commit at base revision 7.
**Status:** `proposed`. Awaiting the conductor.

### D12 update: re-commit at revision 8 (base 7) [verified-offline]
- **[verified-offline] This IR's step `field_permissions` accept a child-table key (`Spike_Case_Notes`, `Spike_Rounds`) but not its column keys.** Column ids give STEP_PERM_FIELD_MISSING (rev 7 build: 22 errors). The column keys were removed from every step, including the six branches (34 cells), and the table cells are unchanged. The read-back of revision 8 matches the payload exactly.
- **Offline compile** (scratch materialize, `build --no-pages`, no `--apply`): 0 errors, 0 warnings.
  - **Case:** 12 activities × 35 `Activity::Permission` = 420. The 35 are the 34 header fields plus the Model column "Spike Case Notes". The Parallel container has 0.
  - **Branches:** each branch UserTask sits in its own ProcessDef (ProcessDef_105gf9e … 9j) and carries only its own lane: Lane_X_Confirm Mandatory, Lane_X_By/At/Note Editable, and 31 ReadOnly.
  - **Spike_Case_Notes:** Editable at Spike prepare and ReadOnly at every other activity, including End.
  - **Gate:** Mandatory at Spike gated step.
  - **Point:** 4 activities × 7 = 28. Start has the 5 scalars Editable and Spike_Rounds ReadOnly. Spike waiting has Response_Text Editable. Spike review has Spike_Rounds Editable. End is all ReadOnly.
  - **Child columns:** 0 per-column `Activity::Permission` entries. The Column nodes for Note_Text/Note_By and the four Spike_Rounds columns get no permissions. Only the table's Model column does (LESSONS 7 risk; check at runtime).
  - **Initiator:** `initiator:true` (Role A only) shows no distinct marker in the compiled FlowPermission blobs. Both roles compile to `Level:Editable, Scope:all`, with no Member/InitiateItems. Check at runtime that Role B cannot initiate.
- **Checks:**
  - `verify`: 0 errors, 1 warning (NO_PAGES, expected per D3).
  - Foundation at revision 8: findings `[]`, so the 6 FOUNDATION_EVIDENCE_GATE findings are closed.
**Status:** `proposed`

## D13 · Harness slices automations, experience and coherence: committed as not applicable
**Why:** this run is a throwaway test harness (brd.md). It has no automations in the IR: the test integrations are built separately over REST. It has no pages (generate with --no-pages). A whole-app coherence review doesn't apply to four test flows. The engine's own instruction is to commit an inapplicable slice as empty.
**Alternatives:** run kf-integration-analyst, kf-experience-designer and kf-coherence-critic. Rejected: they would design business features that the harness must not have.
**Status:** `proposed`
