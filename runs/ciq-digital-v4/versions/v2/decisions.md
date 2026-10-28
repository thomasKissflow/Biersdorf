# Decisions — run ciq-digital-v4

## D1 · Ingest (kf-ba, stage brief) — domain extracted from brd.md (PART A > PART B v4 > PART C > PART D) and committed as graph revision 2
- **Personas (12):** the 11 custom roles, i.e. CIQ RMM; the CIQ Regulatory, Safety, QM, Microbiology and Sustainability Reviewers; CIQ Overall Approver; CIQ Business Admin; CIQ Reader; CIQ Case Admin; CIQ Integration Service (a system persona for the CIQ Sync Service and the integrations). The 12th is the external Supplier contact, who has no app role or access.
- **Journeys (21).** j21 is the supplier's portal-side journey. It is marked `in_app_scope: false` and kept only for traceability.
- **Entities (11), exactly the v4 flows:**
  - Processes: P1 CIQ Case, P2 CIQ Open Point (+ Rounds), P3 CIQ Change Request.
  - Forms: F1 CIQ Supplier (+ Contacts), F2 CIQ Config Version, F3 CIQ Section (+ Components, K2.1 only), F4 CIQ Scope Run, F5 CIQ RMES Safety (+ Criteria, Findings), F6 CIQ RMES Regulatory (+ Criteria, Findings), F7 CIQ Internal Note, F8 CIQ Audit Event.
  - That makes 7 child tables. Every entity maps to at least one journey (checked by script).
- **Business rules (67)** cover:
  - PART A modelling, platform and naming rules;
  - the exact step names;
  - no aggregates (Number count fields plus blank-safe formulas);
  - no pages;
  - Z1–Z4 only, with X/Y as documentation;
  - the A3 decisions.
- **Value sets (21):** the PART D lists, adapted to v4 (see D3).
- **Intentionally not modelled:**
  - portal CIQP flows;
  - the "CIQ ZZ Spike" flows;
  - Admin/User as personas, since they have no business journey;
  - every PART D structure that v4 drops: CIQ Raw Material, Case Contact, Supplier Contact, Component, Config Release, no-step Processes, per-round items, Item Register.
- **Payload and slice:**
  - Payload: `runs/ciq-digital-v4/ba/domain-slice.json`, from `ba/build_domain.py`.
  - The slice read-back equals the payload.
  - A scratch validate shows only NO_APP_NAME, which kf-architect owns.

**Why:** kf-architect, kf-data-architect and kf-workflow-designer need an evidence-linked domain that traces to PART B v4 before they lower it.
**Alternatives:** reuse the ciq-digital (v1) domain, with 28 flows and 18 roles. Rejected because v4 supersedes it (L13-L15).
**Status:** proposed

## D2 · Open Point kinds — "Finding" dropped as a kind
v4 lists six kinds: Query, Document request, Additional part, Internal review, Department review, Contact update (L224-L234). Findings live in the RMES Findings child table with a linked open point (L282).
**Why:** v4 wins over PART D (L15). A finding that needs the supplier is a Query that the Findings row links to.
**Alternatives:** keep PART D's 7-value list with "Finding" (L1212).
**Status:** proposed (open question Q2)

## D3 · Value sets adapted to v4 — "Release" added to CIQ Config Kind, "Item created" added to CIQ Event Category
v4 folds CIQ Config Release into Release rows of CIQ Config Version (L123, L136). It also lists "item created" as an audit category (L285).
**Why:** both values are needed so the v4 entities can store what v4 says they hold.
**Alternatives:** a separate Yes/No "is release" flag on F2 instead of a kind value. That is the data-architect's call.
**Status:** proposed

## D4 · Z3/Z4 kept and retargeted to F8 CIQ Audit Event
PART A L38 requires Z3/Z4 (SLA breach → audit event). Only PART D L1307 defines them, with P7 as the target. In v4, P7 is the F8 Form.
**Why:** PART A has the highest precedence, so Z3/Z4 stay. Only the target changes, to follow v4.
**Alternatives:** model Z1/Z2 only, since v4 §4 lists only those.
**Status:** proposed (open question Q1)

## D5 · Architecture skeleton (kf-architect, stage 2) – v4's 11 flows unchanged; 13 roles; 21 lists; 7 child tables; step ids reserved
- **Flows:** 3 Processes (CIQ Case, CIQ Open Point, CIQ Change Request) and 8 Data Forms, exactly as in v4 §1 (L117-L129). There are no Case/Board or Dataset flows.
- **Roles:** the 11 custom roles plus Admin and User (A3 L67). The 11 internal and system personas map 1:1 to the custom roles. The supplier has no app role.
- **Step ids:**
  - The prefixes are `CASE_`, `OPNT_` and `CHRQ_`, so a step id can't collide with a field id such as `OP_Key` or `CR_Key`.
  - Step names are byte-exact from PART A (L44-L54). The Start names come from the v4 tables: "Create case", "Raise open point", "Receive change request". Each process ends with an explicit "End".
- **Open Point:** its six review steps are sequential conditional steps. Exactly one runs, chosen by `OP_Dept` (L246). They are not a parallel block.
- **Build order:** lists → roles → flow shells → CIQ Supplier and CIQ Config Version → CIQ Case → CIQ Open Point and CIQ Change Request → the case-scoped Forms → grants → Z1-Z4 → no pages → the REST items after generate (L411-L418).
- **Check:** a scratch commit, materialize and validate showed only the expected errors. These are PROCESS_NO_STEPS/WORKFLOW_MISSED, which belong to the workflow designer, and FORM_NO_FIELDS warnings, which belong to the data architect. The foundation contract had 0 findings.

**Why:** the five wave specialists need one frozen skeleton (flows, role ids, list ids, child-table ids, step ids and conditions) so they can work in parallel.
**Alternatives:** v3's no-step Processes for Section, Scope Run and Audit Event. PART A rules them out (L22-L23).
**Status:** proposed

## D6 · References – a native Reference only from the two RMES Forms to CIQ Case; every other link is a text key
- **RMES:** CIQ RMES Safety and CIQ RMES Regulatory reference CIQ Case through `Result_Case` (the PART D name, L1166). v4 names exactly this Reference (L282, L428).
- **Other case-scoped flows:** CIQ Section, CIQ Scope Run, CIQ Open Point, CIQ Change Request, CIQ Internal Note and CIQ Audit Event link to the case by `Case_Item_Id`, `Case_Code` and `Cycle_No`.
- **Supplier:** CIQ Case links to CIQ Supplier by `Supplier_Code` as Text (X1 reads plain fields, L197).
- **Release row:** the case links to its Release row by the pinned row id, hash and manifest copy (L198).

**Why:**
- v4 names no other Reference.
- PART D's `Point_Case` and `CR_Case` existed only to feed native cross-flow aggregates, which PART A forbids (A2 L32).
- Integrations copy only plain fields (C1).
- Fewer fields on Processes that can't be edited after publish.

**Alternatives:**
- Keep `Point_Case` and `CR_Case` (PART D L873, L947) for native filtering and a later native count. This is reversible: a published Process accepts a REST graft (L407).
- A `Case_Supplier` Reference with autofill. Rejected, because v4 lists only the supplier code and name.

**Status:** proposed

## D7 · Child-table ids – the RMES tables get department-prefixed ids; display names stay v4's
- **Ids:** `Contacts`, `Rounds`, `Components`, `Safety_Criteria`, `Safety_Findings`, `Regulatory_Criteria`, `Regulatory_Findings`.
- **Display names:** Contacts, Rounds, Components, Criteria, Findings.
- **Column ids:** prefixed with `Contacts_`, `Rounds_`, `Components_`, `Criteria_` or `Findings_` (A2 L31).

**Why:**
- With bare ids, the app would have two tables with the id "Criteria" and two with "Findings". Unique ids rule out any collision in the engine's id map, at no cost.
- The prefix meets A2's rule that a child column never reuses a header id.

**Alternatives:** bare `Criteria`/`Findings` ids on both RMES Forms. These are probably safe because the flows are separate, but untested.
**Status:** proposed

## D8 · CIQ Country Code – seeded with v1's 32-code subset
PART D L1225 asks for an "ISO 3166 alpha-2 subset" but doesn't name the codes. The list gets the subset from `runs/ciq-digital` decision D7: the EU-27, GB, TR, CN, US and CA.

**Why:**
- A list-backed Select with an empty list can't be set (LESSONS 15).
- The list is append-only, so codes can be added later.

**Alternatives:**
- The full ISO list (about 250 codes).
- Make `Supplier_Country_Code` a Text field. That is kf-data-architect's call.

**Status:** proposed. Thomas or BDF to confirm the subset.

## D9 · Parallel blocks whose branches are all skipped – keep v4's shape; K-PAR must test it
- **Assess impact:** every refused change request skips all five branches, because every Impact flag is "No" (L270).
- **Part 2:** it would do the same if no department were active.
- **Effect:** if a join where every branch was skipped doesn't advance, the item hangs.

**Why:**
- v4 and PART A require both parallel blocks (A1 L25; L188; L271).
- Runtime fork and join are still being tested (A2 L28).

**Alternatives:**
- A refused request skips the block through the Workbench, by never leaving every flag "No".
- A non-parallel shape for Assess impact.
- Either one changes v4 and needs Thomas.

**Status:** proposed. This is a risk for kf-workflow-designer and kf-verifier (architecture risk AR01).

## D10 · Data model (kf-data-architect, graph revision 4) – gate and hold counts are plain Numbers; every gate formula holds on a blank count
- **CIQ Case counts** (plain Number fields, written by the acting person's Workbench, A2 L32-L33): `Open_Items_Count` (open CIQ Open Points of the case, including Contact update and Department review), `Open_CR_Count` (untriaged or unassessed CIQ Change Requests), `<D>_Open_Count` for each of the six lanes (open points plus pending assessments for D), and `SAF_RMES_Gaps` / `REG_RMES_Gaps` (copied from the RMES header counts).
- **Formulas** (Text):
  - `Hold_For_Open_Items`: "Yes" when either count is blank or their sum is greater than 0.
  - `Open_Items_Gate`: "OK" when there is an override reason, or both counts are present and sum to 0. A blank count gives "".
  - `<D>_Gate`: "OK" only when D's counts are present and sum to 0.
- **No deadlock.** A blank count holds: the step runs, or the Mandatory gate is "". The person at that step can always clear it, because the Workbench writes the count (or `Hold_Override_Reason`) there. **kf-workflow-designer must make each count Editable at the step that holds its gate:**
  - `<D>_Open_Count` and `<D>_RMES_Gaps` at Review – D;
  - `Open_Items_Count`, `Open_CR_Count` and `Hold_Override_Reason` at both Open items checks.
- **PART D difference:** PART D let `<D>_Gate` treat a blank as 0. A2 L34 says a blank must hold, so it doesn't here.

**Why:** A2 L32-L34 forbids aggregates, and the spike verified that blank-safe formulas compute server-side (SPIKES L75, L105).
**Alternatives:** PART D's "blank = 0" lane gate. It can never deadlock, but it lets a native My Tasks submit through before the Workbench has counted.
**Status:** proposed

## D11 · Data model – PART D aggregate-feeder fields dropped or reduced; derived row formulas kept
- **Dropped,** because they existed only to feed cross-flow SUMs: `Open_<D>` (Open Point), `Pending_<D>` (Change Request), `Point_Case`, `CR_Case` (see D6) and `Prev_Round_Item_Id` (the rounds now live inside one item).
- **Kept as formulas,** for Workbench counting and views:
  - `Open_Num` on CIQ Open Point. Only Accepted or Withdrawn close a point; a Return keeps it open (v4 L246).
  - `CR_Open_Num` on CIQ Change Request: an untriaged request plus each impacted, unassessed department.
  - `Start_Gate` on CIQ Open Point: blank-checks the nine fields that are required on the portal's CIQP Query.
  - `Criteria_Open_Num` per Criteria row: an applicable row with no result, or a result other than Available/Plausible/Listed with no comment.
- **RMES header counts** `Open_Criteria_Count` and `Open_Blocking_Findings_Count` are plain Numbers written by the department session, not aggregates (A2 L32).

**Why:** no aggregates (A2). Per-row formulas are verified to compute.
**Alternatives:** keep `Open_<D>` / `Pending_<D>` for a later REST aggregate graft. That would add 11 fields to published Processes, which can't be removed later.
**Status:** proposed

## D12 · Data model – field types follow the portal; machine-written and portal-copied values are Text
- Every field an integration copies has the portal's type (PART C):
  - **Text:** `Supplier_Responsible_Email`, because the portal field is Text, not Email.
  - **Textarea:** `Case_Contacts_JSON`, the declaration texts, `Thread_Text` (→ Previous Rounds JSON), `Supplier_Outcome_Text` (→ Notice Text), `Definition_JSON`.
  - **Email:** `BDF_Contact_Email` and the `*_By_Email` confirmation fields.
  - **Number:** `Cycle_No`, `Round_No`, `Section_Sort`.
  - **Date:** the due dates.
  - **DateTime:** `Completeness_At`, `Final_Release_At`, `Ref_Doc_Uploaded_At`.
- **Text, per PART D L1231-L1234:** `Change_Kind`, `Response_Kind`, `Completeness_Confirm`, `Final_Release_Confirm`, `Section_Origin`, `Scope_Trigger`, `Basic_Data_Received`, `Completion_Trigger`, `Overall_Approval_Required` and `Awaiting_Response`. Their values are machine-written.
- **Additions:**
  - `Notice_Kind` (Text) on CIQ Change Request, because CIQP Notice requires "Notice Kind" (PART C) and X6 has no other source for it.
  - `Derivation_Kind` and `Override_Justification` on CIQ Section, because v4 L280 lists them. PART D L1012 had kept them only on the Scope Run.
- **Step-level Mandatory is left to kf-workflow-designer.** Process fields carry no field-level `required`. Required flags are set only on Form keys.

**Why:** a type mismatch breaks the X/Y mappings that the portal session builds.
**Alternatives:** Selects for the Yes/No machine fields. A Select silently drops a value that isn't in its list (PART D L1229).
**Status:** proposed

## D13 · Workflow (kf-workflow-designer, graph revision 5) – the 3 Processes exactly as the reserved steps; routing only by guarded steps and two parallel blocks
- **CIQ Case:** 16 activities: Start, 3 RMM steps, the Parallel "Part 2 – Beiersdorf review" (6 one-step arms, each `Dept_<D>_Active = "Yes"`), the two open-items checks (`Hold_For_Open_Items = "Yes"`), Overall approval (`Overall_Approval_Required = "Yes"`), PS-11 (`Overall_Decision != "Rejected"`), End.
- **CIQ Open Point:** Start, "Waiting for supplier" (`OP_To_Supplier = "Yes"`), six sequential "Review – <D>" steps (`OP_Dept = "<D>"`, exactly one runs), End.
- **CIQ Change Request:** Start (Integration Service; RMM as fallback), Triage, the Parallel "Assess impact" (5 arms, `Impact_<D> = "Yes"`), End.
- **Not modelled as steps:** rejection, cancellation and the Open Point "Return". They are native Reject and native send-back, with switches listed in `workflow.meta.after_generate_switches`.
- **Checks:** the offline build of revision 5 (`--no-pages`, nothing applied) has 0 errors and 0 warnings. The two Parallel nodes compile with 6 and 5 branch ProcessDefs, and all 10 + 7 + 5 conditions compile as `ExpressionStr` on their UserTasks.

**Why:** brd.md A2 L44-L54, v4 L154-L272, architecture `step_prefix_by_flow`.
**Alternatives:** none. The step contract is frozen by the architecture.
**Status:** proposed

## D14 · Outcome lists are documentation (`outcomes_doc`), not `decision`
The engine's foundation check reports FOUNDATION_OUTCOME_NOT_EXECUTABLE for any `decision` list, because decision labels aren't routing in the sequence adapter. In this app no route depends on a decision label. Every route is a guarded step that reads a field (`Overall_Decision`, `OP_Dept`, `Impact_<D>`). So the lists are kept as `outcomes_doc`. `outcome_field` stays on Overall approval, the SAF/REG lanes, Triage and the Assess arms, and each value has an asserted journey.
**Why:** this removes 15 platform-owned findings without changing any behaviour.
**Alternatives:** keep `decision` and accept an unsupported-capability finding that has no business effect.
**Status:** proposed

## D15 · Gate and hold counts on the case are writable only where RMM (or the lane) holds a step
- **Case counts:** `Open_Items_Count` and `Open_CR_Count` are Editable at Scope check, PS-05, both open-items checks and PS-11.
- **Lane counts:** `<D>_Open_Count` and `<D>_RMES_Gaps` are Editable only in their own branch. `<D>_Gate` is Mandatory there.
- **Effect:** nobody can write the case counts during Part 2 (C3). So the release-request check reads the counts RMM's Workbench last wrote at PS-05.
- **Recommendation for the Workbench:** leave the counts blank at the PS-05 submit, so the hold step always runs once at the join and RMM writes fresh counts there. Writing 0 at PS-05 skips the hold, which v4 calls "normally skipped". In that case, items RMM opens during Part 2 and untriaged change requests are not caught until the close check.

**Why:** v4 L190 and L395 against L404. Holds are blank-safe (A2 L34).
**Alternatives:** make the hold unconditional (L395). That contradicts the PART A step list, which makes it conditional.
**Status:** proposed. Thomas to choose the Workbench rule.

## D16 · Small field-level deviations from PART D in the step permissions
- **`Origin_Types`:** Editable, not Mandatory, at Scope check, PS-05 and the release-request check. v4 moves the search mirrors to the K2.1 section row (L280, L429).
- **`Point_Case` and `CR_Case`:** dropped from the Mandatory sets (D6).
- **Change Request Start:** nothing is Mandatory, so a Y6 create is never refused.
- **Open Point review steps:** the current-round fields and the Rounds table are Editable at every review step. The Workbench needs them to write round n+1 before the Return send-back (v4 L246).
- **Open Point "Waiting for supplier":** Rounds is explicitly ReadOnly at Start and at this step.

**Why:** v4 wins over PART D (L15). Child tables take table-level keys only (A2 L30).
**Status:** proposed

## D17 · Automations (kf-integration-analyst, graph revision 7) – only Z1–Z4, all writing into or triggered by CIQ Audit Event; X/Y are documentation only
- **Z1** `ciq-z1-case-completed-notification-log`: CIQ Case End (`completed`, so ItemCompleted) creates a CIQ Audit Event row with category Notification. The PDF (option A, Sync Service renderer), the e-mail to `Owner_RMM` and the e-mail to `Supplier_Contact_Emails` with `Supplier_Closing_Text` are listed in `rest_completion` and added over REST. An automation has one action, and the audit row is the only one App Builder can express.
- **Z2** `ciq-z2-cancellation-neutral-email`: a CIQ Audit Event row is created (Dataform ItemCreated, verified live in K-09f) with the condition `Event_Category = "Cancellation"`. This sends a neutral e-mail (`notify`) to `Notify_Recipient`. The trigger is the audit row, not the case's Reject, because the engine has no reject event and v4 L216 always writes the Cancellation row (PART D L1306, open-questions Q5). There is no audit action, so nothing loops. The AUTO_SELF warning is expected.
- **Z3/Z4** `ciq-z3-case-sla-breach-audit`, `ciq-z4-open-point-sla-breach-audit`: an SLA breach on CIQ Case or CIQ Open Point creates a Notification audit row. The event is `sla_breached`. That isn't an engine event, but it compiles as a pass-through trigger. `sla_steps` lists the steps whose SlaBreached trigger is set over REST.
- **X1–X6, Y1, Y3–Y6** are listed in `automations[0].cross_container_contract` (doc_only, compiled:false, channel external, held, owner is the portal session). They are not array entries, because the validator resolves `flow`/`target_flow` even on external entries (AUTO_SOURCE_MISSING / AUTO_TARGET_MISSING), and no automation may name a portal flow.
- **Check:** revision 7 materialized: validate 0 errors / 1 warning (AUTO_SELF on Z2); offline `build --no-pages` 0 errors / 4 warnings (ORPHAN_ENTITY Connector per integration, from the engine); 4 integrations; no CIQP reference in the compiled output.

**Why:** PART A A2 L36-L39, v4 §4 L299, PART D L1305-L1307, open-questions Q1/Q5.
**Alternatives:** (a) Z3/Z4 on `updated` as a placeholder. Rejected: once someone switches it on, it fires on every edit. (b) Separate external entries for X/Y. Rejected: they fail validation unless they name a portal flow. (c) Z2 on the case's Reject. Not expressible.
**Open:**
- The compiled blobs say `IsActive:true`, but SPIKES L26/L41 show App Builder creates integrations incomplete and not live, and Thomas switches them on. Read back after generate.
- If the connector's SlaBreached trigger needs a single step, Z3 becomes up to 13 integrations and Z4 up to 7, and none can be deleted. Decide the step set before REST completion.
- If apply refuses `sla_breached`, the fallback is to drop Z3/Z4 (Z1 and Z2 still meet the floor of 2), not to use a placeholder event.
**Status:** proposed

## D17b · Security (kf-security-designer, graph revision 6) – the v4 grant matrix with every scope "all"; v4 overrides PART D on four cells
- **Grants (11 custom roles × 11 flows, 115 grants; Admin and User get none):**
  - **CIQ Case:** RMM initiates. The five Reviewers and the Overall Approver act on their own steps only. Business Admin and Reader read. Case Admin gets View now and flow Admin over REST. Integration Service reads.
  - **CIQ Open Point:** RMM and the five Reviewers initiate (v4 L237). Overall Approver, Business Admin and Reader read. Case Admin gets View plus Admin over REST. Integration Service reads.
  - **CIQ Change Request:** Integration Service (Y6) and RMM (the fallback) initiate. RMM triages. The Reviewers assess. Everyone else reads. Case Admin gets View plus Admin over REST.
  - **Forms:**
    - Supplier: RMM writes.
    - Config Version: Business Admin writes.
    - Section: RMM and Integration Service write.
    - Scope Run: RMM and the five Reviewers write.
    - RMES Safety: only CIQ Safety Reviewer writes.
    - RMES Regulatory: only CIQ Regulatory Reviewer writes.
    - Internal Note: every internal role writes.
    - Audit Event: every role except Reader writes.
    - All other cells are View. Integration Service has no grant on Supplier, Config Version, Scope Run, RMES or Internal Note.
- **Where v4 overrides PART D L1263-L1274:**
  - CIQ Section Reviewers are Viewers, not creators (v4 L280). Integration Service writes Section (v4 L280).
  - Business Admin and Case Admin write CIQ Internal Note, because v4 L284 says "every internal role".
  - Integration Service reads CIQ Case and CIQ Open Point. PART D's M¹ only applies "if K-09b". The close sweep and the PDF renderer need to read these flows (v4 L218, L320).
- **Step field permissions:** 29 task steps, 2497 cells. They come from `workflow.meta.security_handoff`. Every header field and the Rounds table is keyed explicitly, and every unlisted key is ReadOnly. Rounds is Editable only at OPNT_R_*. No Hidden cells.
- **After generate (REST):**
  - flow Admin for CIQ Case Admin on all three Processes;
  - a reset without InitiateItems for every step-owning role on CIQ Case (5 Reviewers and the Overall Approver) and CIQ Change Request (5 Reviewers);
  - Form members without Delete once K-17 passes, first on CIQ Config Version and CIQ Audit Event.
- **Data scope:** "all" for every grant. v4 defines no record isolation, and a "participating" scope would hide cross-case lists (REQ-PROC-036).

**Why:**
- This follows v4 §1/§3 and PART D §4, with v4 winning on conflicts.
- A2 L56 says flow Admin and "Editable = initiate" are REST fixes.
- The open-question defaults Q3, Q4 and Q7 apply.

**Alternatives:**
- A single-writer audit trail, where only Integration Service writes CIQ Audit Event (v4 L285, "recommended"). It is rejected for now, because people's sessions write cancellation, change-attempt, publish and override events (Q3).
- Integration Service with no grant on CIQ Case or CIQ Open Point (PART D M¹).

**Status:** proposed

## D18 · Several initiators on a single-owner Start: open foundation finding, shared by security and workflow
The foundation compiler reports FOUNDATION_INITIATOR_CONTRACT_MISMATCH twice:
- **CIQ Open Point:** the expected initiators are RMM and the 5 Reviewers, but the actual initiator is only `ciq_rmm`, the OPNT_S0 owner.
- **CIQ Change Request:** the expected initiators are Integration Service and RMM, but the actual initiator is only `ciq_integration_service`, the CHRQ_S0 owner.

The compiled grants are correct either way: every intended initiator gets an Editable (InitiateItems) member grant. The mismatch is in the contract alone, because a workflow step has one `assignee_role`.

**Why:** v4 L237 ("Raise: any department Reviewer, or RMM") and L269 (Y6, with RMM by hand as the fallback) are business rules. Narrowing the initiators to clear the finding would drop them.

**Alternatives:**
- kf-workflow-designer declares several start owners, if the schema supports it.
- The conductor accepts the finding as a known contract limit. A Kissflow Start step is open to any member with InitiateItems.

**Status:** proposed. This needs kf-workflow-designer and the conductor.

## D19 · Experience (kf-experience-designer, graph revision 8) – empty experience slice; every build and generate must use --no-pages
The experience slice is committed with `pages = []`, `nav.menus = []` and `landing = {}`. The intended Workbench landing for each role is recorded under `experience.intended_workbench_landings` as documentation only. That key is not compiled.

Rules carried in the slice:
- **EXP-HR2:** every `build` and `author-generate` of this spec uses `--no-pages`.
- **EXP-HR3:** no page, card, menu or tile may reference CIQ RMES Safety or CIQ RMES Regulatory for a role that can only read it. Only `ciq_safety_reviewer` (Safety) and `ciq_regulatory_reviewer` (Regulatory) are editors.

`verify` raises a NO_PAGES warning: "build auto-adds a baseline". The baseline must not be published. The offline `build --no-pages` produced no page or nav artifacts (output folders: form, integration, list, permission, process, role).

**Why:** brd.md L7 puts native pages and nav out of scope. A2 L57 and SEC-HR1 say why: a native page auto-grants its target roles as editors. That would break the View-only cells, the RMES isolation (REQ-CFG-004) and the read-only CIQ Reader.

**Alternatives:**
- Rich role dashboards and process menus (the agent default). Rejected, because of the auto-grant.
- Letting build add the baseline pages. Rejected for the same reason.

**Status:** proposed.

## D20 · Coherence (kf-coherence-critic, graph revision 9) – PASS-WITH-ISSUES: every in-scope journey has a satisfiable path; 10 defects to fix and 7 risks to track
- **Verdict:** j01–j20 can each be completed end to end with the committed steps, fields and grants. There are no orphan flows and no dead-end roles. QM, Microbiology and Sustainability Reviewers have the same flow grants (the gate warns ROLE_ACCESS_COLLAPSE), but each owns different steps, so they are genuinely different roles.
- **Fix before generate:**
  - **COH-01:** `Start_Gate` doesn't check `Query_Key`, `Portal_Contact_Ids` or `Awaiting_Response = "Yes"`.
  - **COH-02:** `Portal_Contact_Ids` on CIQ Section isn't required, but the portal section needs contacts.
  - **COH-03:** the X3 contract has no `OP_To_Supplier = "Yes"` guard, so internal points could reach the supplier.
  - **COH-04:** the hold at "Open items check – before release request" reads counts that can only be written before Part 2, so they are always stale.
- **Bounded repairs:** COH-05 to COH-10 (contact and market updates can't land on the case, X6 inputs not enforced at Triage, an OP outcome that dead-ends, the orphan `Final_PDF`, an override carried from one check to the next).
- **Classification:** these are major or minor, not blockers. Each journey still works through the Workbench or the manual RMM fallback. Only the native guarantee is missing.

**Why:** the playbook limits hard blockers to interactions that cannot work. Here each defect weakens a native guarantee, but the step still works through the Workbench or the RMM fallback.
**Alternatives:** FAIL on COH-04 (BR-043 is not guaranteed natively). Not chosen, because L395 makes the Workbench the primary guard and D15 already asks Thomas for this decision.
**Status:** proposed. COH-04 needs Thomas's D15 choice. The recommendation is to make `Open_Items_Count` and `Open_CR_Count` ReadOnly at Scope check and PS-05.

## D21 · Automations repair (kf-integration-analyst, graph revisions 10–11) – Z2 condition becomes an expression string; trigger `_id` into Text is waived on runtime evidence; X3/X3b get the OP_To_Supplier guard

- **Z2 (FOUNDATION_AUTOMATION_CONDITION, resolved):** `action.condition` is now the expression string `Event_Category = "Cancellation"`, not an `{lhs,op,rhs}` object. The foundation check no longer reports it from rev 10. The compiled Z2 integration blob carries the same condition.
- **Z1/Z3/Z4 `_id` → Text `Case_Item_Id`/`Object_Item_Id` (5× FOUNDATION_MAPPING_EXPRESSION, waived):** the engine has no String-typed id source. At rev 10 we tried `TOTEXT(_id)`, and the foundation rejected it ("TOTEXT expects Number, got Reference"). Rev 11 goes back to the direct `_id`. Runtime evidence shows the direct mapping is correct: in `kissflow-build/ciq-digital/SPIKES.md` K-09f-run (PASS, verified live), the Register `_id` was stored in the Text field `Log_Item_Id`, with `itemIdMatches` true (`runtime-tests-2-result.json`, rows ZZT-114155b-R1/R2). The REST completion maps the raw `_id` the same way. Each of Z1/Z3/Z4 has an `id_mapping_note` that records this. The 5 findings stay open in the foundation report until the engine types `_id` as a String-compatible source, or until the conductor accepts the waiver.
- **COH-03 (cross-container contract only, not compiled):** X3/X3b in `automations[Z1].cross_container_contract` now has `condition: OP_To_Supplier = "Yes"` and a `condition_note`. Internal kinds (Department review, Contact update, Internal review) must never reach the portal (BR-066). The connector step-entry trigger can fire for skipped steps (v4 L310). Source: PART D L883. This is a hand-off to the portal session, which owns X3 over REST.
- **Unchanged:** FOUNDATION_ACTION_UNSUPPORTED for Z2 `notify` (owner: platform; Z2 falls back to the CIQ Sync Service per its rest_completion). FOUNDATION_INITIATOR_CONTRACT_MISMATCH ×2 (D18).

**Status:** applied at rev 11. Offline: validate 0 errors / 1 warning (AUTO_SELF Z2, expected); gate 0 errors / 3 warnings; build --no-pages 0 errors / 4 warnings (ORPHAN_ENTITY connectors, from the engine).

## D22 · Data model repairs (kf-data-architect, graph revision 12) – COH-01, COH-02, COH-08, COH-09 (K-15 fallback) and COH-10
**Decision (kf-data-architect, graph rev 12): data_model repairs for COH-01, COH-02, COH-08, COH-09 and COH-10.**
- **COH-01:** `Start_Gate` on CIQ Open Point now also requires `Query_Key` and `Portal_Contact_Ids`, plus `Awaiting_Response = "Yes"`, for a to-supplier point. The check is blank-safe: a blank value gives "". Internal kinds (`OP_To_Supplier = "No"`) still return "OK".
- **COH-02:** `CIQ_Section_A00.Portal_Contact_Ids` is now required, because X2 copies it into the portal's required `Assigned_Contacts`.
- **COH-08:** the `CIQ_OP_Outcome` list is now only Accepted and Withdrawn. A return is the native send-back, and the Workbench writes the next-round fields. Nothing has been generated yet, so the list is replaced rather than appended to. `Open_Num` is unchanged.
- **COH-09:** CIQ Audit Event gets `Event_File` (Attachment), and `CIQ_Event_Category` gets the category "Final PDF". This is the fallback home for the final PDF. `Final_PDF` stays on CIQ Case. Attaching to a completed case is still unverified (K-15), so K-15 should become an acceptance test. If K-15 fails, Z1 / the sync service writes the PDF to a "Final PDF" audit event.
- **COH-10:** the single `Hold_Override_Reason` is replaced by `Hold_Override_Reason_Release` (CASE_S5) and `Hold_Override_Reason_Close` (CASE_S8). The single `Open_Items_Gate` is replaced by `Open_Items_Gate_Release` and `Open_Items_Gate_Close`, and each gate reads only its own reason.
- **Handoff, open:** the workflow and security slices still name `Open_Items_Gate` and `Hold_Override_Reason`, at CASE_S0 to S8 and in security_handoff items 10 and 13. Until they are renamed, validate and build fail with STEP_PERM_FIELD_MISSING. The fix:
  - S5: `Open_Items_Gate_Release` Mandatory, `Hold_Override_Reason_Release` Editable.
  - S8: `Open_Items_Gate_Close` Mandatory, `Hold_Override_Reason_Close` Editable.
  - Every other step: ReadOnly.

**Why:** these are the coherence-critic fixes owned by kf-data-architect. With separate per-check reasons, an override at the release check can no longer carry over to the close check.
**Alternatives:** have the Workbench clear the reason on entering S8. Not chosen, because that relies on the Workbench rather than a native guarantee.
**Status:** committed (data_model rev 12). Waiting on kf-workflow-designer and kf-security-designer to rename the permission keys.

## D23 · Workflow repair (kf-workflow-designer, graph revisions 13–14) – case counts blank at the join so the release-request check always runs once; contacts, markets and X6 inputs writable where they land
- **COH-04 / D15 (taken by the conductor under Thomas's "take the recommended option" rule; pending Thomas's confirmation):** `Open_Items_Count` and `Open_CR_Count` are now ReadOnly at Scope check (CASE_S2) and PS-05 (CASE_S3). They are therefore blank when Part 2 joins, `Hold_For_Open_Items` is "Yes" (blank-safe formula), and "Open items check – before release request" always runs once. RMM resolves or confirms the open items there and writes the counts, which are Editable at that step. The step keeps its PART A condition; it is simply always true on the first pass. This supersedes the Workbench recommendation in D15.
- **R-02:** `Open_Items_Count` and `Open_CR_Count` are Editable at "Waiting for supplier: final release PS-11" (RMM holds the step). The Workbench refreshes them while waiting, so "Open items check – before close" reads fresh counts.
- **COH-05:** `Case_Contacts_JSON`, `Portal_Contact_Ids`, `Confirm_Contact_Ids` and `Supplier_Contact_Emails` are Editable at both open-items checks (S5, S8) and at the RMM-held waiting steps (basic data S1, PS-05 S3, PS-11 S7).
- **COH-06:** `Target_Markets_Text` is Editable at both open-items checks. `Markets_Label` was not added (outside the instruction).
- **COH-07:** at Triage (CHRQ_S1) every X6 input that CIQ Change Request holds is Mandatory: `Notice_Key`, `Notice_Kind` (was Editable), `Notice_Title`, `Supplier_Outcome_Text`, `Case_Code`, `Cycle_No`, `Supplier_Code` (were ReadOnly) and `Portal_Contact_Ids`. `CR_Key` (X6 `Related_Key`) stays a Start field written by Y6 or the RMM fallback.
- **Field reconciliation:** the hold gate and override are per check in data_model (COH-10 split). The handoff now uses `Open_Items_Gate_Release` (Mandatory) and `Hold_Override_Reason_Release` at S5, and `Open_Items_Gate_Close` (Mandatory) and `Hold_Override_Reason_Close` at S8.
- **Conformance #4 (no change):** on CIQ Open Point, `Supplier_Justification` and `Supplier_Due_Date` stay Editable at Raise open point. They are enforced by the Mandatory `Start_Gate` only for supplier queries. The formula returns "OK" when `OP_To_Supplier` = "No". `OP_To_Supplier` is Mandatory at Start, so in practice the check applies only when it is "Yes". Internal kinds don't need either field. This keeps the intent of v4 L244.
- **Journeys:** the PS-05 inputs no longer write counts. CASE_S5 (counts 0, Hold_Note) is inserted before S6/S7 in the four case journeys that pass the join (two-lanes, overall-rejected, reg-rejected, overall-by-RMM-denied). The id `case-two-lanes-no-holds-overall-off` is kept for stability; its intent text is updated. CHRQ_S1 inputs now include Notice_Kind and the case header.
- **Security handoff:** kf-security-designer must re-commit the cells. The delta is S2/S3 counts Editable→ReadOnly; S5 Target_Markets_Text, Case_Contacts_JSON, Portal_Contact_Ids, Hold_Override_Reason_Release →Editable, Open_Items_Gate_Release →Mandatory; S7 the four contact fields →Editable; S8 Target_Markets_Text, Case_Contacts_JSON, Portal_Contact_Ids, Confirm_Contact_Ids, Hold_Override_Reason_Close →Editable, Open_Items_Gate_Close →Mandatory; CHRQ_S1 Case_Code, Cycle_No, Supplier_Code, Notice_Kind →Mandatory. The security slice still keys the retired `Open_Items_Gate`/`Hold_Override_Reason` at all 14 case steps (16 STEP_PERM_FIELD_MISSING validate errors and 28 FOUNDATION_PERMISSION_FIELD findings). Its re-commit clears them.

**Why:** coherence report COH-04 to COH-07 and R-02 (rev 9). v4 L395 ("hold steps run unconditionally") wins over a Workbench convention.
**Check:** the materialized revision 14 shows the 16 stale-security errors only. A scratch copy with the handoff applied to security (`scratch-kf-workflow-designer/rev10/spec-sim-security.json`) validates with 0 errors / 1 warning (AUTO_SELF Z2) and builds `--no-pages` with 0 errors / 4 warnings (ORPHAN_ENTITY connectors).
**Status:** applied (workflow). COH-04 is pending Thomas's confirmation.

## D24 · Security repair (kf-security-designer, graph revision 16) – step cells follow the D23 handoff; reviewer resets keep View; child tables get their own Form grants
- **Step field permissions (29 task steps, 2525 cells)** are rebuilt from `workflow.meta.security_handoff` at revision 15, keyed against the revision-12 data model. Every header field and child table is still keyed at every step (unlisted = ReadOnly). The delta is exactly D23:
  - CASE_S2 and CASE_S3: `Open_Items_Count` and `Open_CR_Count` go from Editable to ReadOnly (D15 superseded by D23).
  - CASE_S5: `Open_Items_Gate_Release` is Mandatory. `Hold_Override_Reason_Release`, `Target_Markets_Text`, `Case_Contacts_JSON` and `Portal_Contact_Ids` are Editable.
  - CASE_S7 (PS-11): the counts stay Editable (R-02). `Case_Contacts_JSON`, `Portal_Contact_Ids`, `Confirm_Contact_Ids` and `Supplier_Contact_Emails` are Editable.
  - CASE_S8: `Open_Items_Gate_Close` is Mandatory. `Hold_Override_Reason_Close`, `Target_Markets_Text`, `Case_Contacts_JSON`, `Portal_Contact_Ids` and `Confirm_Contact_Ids` are Editable.
  - The other override reason and gate are ReadOnly at each check, and both are ReadOnly everywhere else.
  - CHRQ_S1 (Triage): `Case_Code`, `Cycle_No`, `Supplier_Code` and `Notice_Kind` are Mandatory (COH-07).
  - The retired `Open_Items_Gate` and `Hold_Override_Reason` keys are gone, which clears the 28 FOUNDATION_PERMISSION_FIELD findings.
- **`Event_File` (COH-09):** it is a CIQ Audit Event Form column, so it follows the Form grant. It compiles Editable for every Audit Event writer and ReadOnly for CIQ Reader. No step cell is needed.
- **R-04:** every post-generate reset for a step-owning role is now Member `["View"]`, never `[]`. That covers the 5 Reviewers and the Overall Approver on CIQ Case, and for consistency the 5 Reviewers on CIQ Change Request. This keeps read access, `satisfiability.readers` and the RMES Result_Case lookup. K-06 must still prove that a `["View"]` step owner gets My Tasks.
- **Conformance #3, child tables on Form grants:**
  - **Offline test:** a `child_tables` attribute on a Form grant and a Form-level `field_permissions` key are both silently ignored (the build output is identical). A grant keyed on the child-table id is accepted: it compiles a separate FlowPermission on the child model with every column at the grant's level. Validate, verify and build all return 0 errors.
  - **Applied:** 61 child-table grants that mirror the parent Form cell (E → Editable, V → ReadOnly):
    - Contacts follows CIQ Supplier: RMM writes.
    - Components follows CIQ Section: RMM and Integration Service write.
    - Safety_Criteria and Safety_Findings: CIQ Safety Reviewer writes.
    - Regulatory_Criteria and Regulatory_Findings: CIQ Regulatory Reviewer writes.
    - Every other parent reader gets View.
  - **Still unverified:** whether the platform applies a member grant on a child model, and whether that grant is what lets a non-admin write rows **[unverified, K-17]**. The acceptance test:
    - A non-admin CIQ RMM adds, edits and deletes a Contacts row.
    - CIQ Safety Reviewer adds Criteria and Findings rows on CIQ RMES Safety.
    - CIQ Regulatory Reviewer is refused on Safety and succeeds on Regulatory.
    - CIQ Reader sees the rows read-only.
  - **Fallback:** if generate rejects a child-model grant, drop the 61 grants (Forms stay editable) and grant the child-table column on the parent over REST.
- **Check:** revision 16 materialized to `scratch-kf-security-designer/rev16/`.
  - validate: 0 errors, 1 warning (AUTO_SELF Z2).
  - verify: 0 errors, 2 warnings (AUTO_SELF, NO_PAGES).
  - `build --no-pages`: 0 errors, 4 warnings (ORPHAN_ENTITY connectors). 225 artifacts, 176 permissions.
  - No lockouts: every task step has its assignee as actor, every flow has creators and readers.
  - The compiled activities were read back for S2, S3, S5, S7, S8, CHRQ_S1 and OPNT_S0/R_REG.
  - The remaining foundation findings are not security's: FOUNDATION_MAPPING_EXPRESSION and ACTION_UNSUPPORTED (automations), plus FOUNDATION_INITIATOR_CONTRACT_MISMATCH ×2 (D18, still open).

**Why:** the D22/D23 handoff, coherence R-04 and conformance #3.
**Alternatives:** no child-table grants, with the gap only recorded as K-17. Rejected, because the IR accepts the key and the grant is cheap to remove from a Form.
**Status:** committed (security rev 16). The child-table grant semantics are pending K-17.

## D25 · Automations: Z1 K-15 fallback in the REST completion steps (kf-integration-analyst, graph revision 21) – COH-09r

**Decision:** Z1 (`ciq-z1-case-completed-notification-log`) `rest_completion` gets a new step 1a: "K-15 fallback: if K-15 (attach PDF to a completed case) fails, store the PDF in CIQ Audit Event.Event_File on an Event_Category = 'Final PDF' row." Nothing else changed. `automations` is still an array of 4. Both targets exist in data_model: `CIQ_Audit_Event_A00.Event_File` (Attachment) and the `CIQ_Event_Category` item "Final PDF", which D22/COH-09 added.
**Why:** coherence COH-09r. The D22 data-model fallback was not referenced in Z1's documented REST completion.
**Status:** committed at revision 21 (base 19, rebased over 20). Offline: validate gives 0 errors / 1 warning (AUTO_SELF Z2, expected). `build --no-pages` gives 0 errors / 4 warnings (ORPHAN_ENTITY connectors, as before). Output is in `runs/ciq-digital-v4/scratch-kf-integration-analyst/out21`. Foundation findings did not change: FOUNDATION_MAPPING_EXPRESSION on `_id`→Text, waived per D21; notify unsupported on Z2; initiator mismatches belong to security/workflow.

## D26 · Data model: Rounds_Outcome gets its own list CIQ Round Outcome (kf-data-architect, graph revision 20) – COH-11

**Decision:** New reference list `CIQ_Round_Outcome` ("CIQ Round Outcome", no _A00), items Accepted, Returned, Withdrawn. The CIQ Open Point › Rounds child column `Rounds_Outcome` now binds `referredList: CIQ_Round_Outcome`. The header field `OP_Outcome` stays on `CIQ_OP_Outcome` (Accepted, Withdrawn), unchanged; the `Open_Num` formula is unaffected.
**Why:** coherence COH-11 (blocker). A round can be returned to the supplier, but the shared OP list had no "Returned" value. Adding it to CIQ_OP_Outcome would have allowed a final outcome of "Returned" on the header.
**Status:** committed at revision 20 (base 19). Offline: gate gives 0 errors / 3 warnings (as before). `build --no-pages` gives 0 errors / 4 warnings (ORPHAN_ENTITY connectors, as before) and 226 artifacts (+1 list). The compiled blobs confirm `list/CIQ_Round_Outcome.doc.json` and `list/CIQ_OP_Outcome.doc.json`, and in `process/CIQ_Open_Point_A00.blob.json`, Rounds_Outcome → ReferredList CIQ_Round_Outcome (Model Rounds) and OP_Outcome → CIQ_OP_Outcome. Output is in `runs/ciq-digital-v4/scratch-kf-data-architect/coh11-rev20`.

## D27 · Workflow repair (kf-workflow-designer, graph revisions 23–24) – Return refreshes contacts; open-items checks fix the markets label; Q8: automatic completion kept, counts refreshed by the Workbench
- **COH-12:** `Portal_Contact_Ids` is Editable in `security_handoff` at all six Review steps (OPNT_R_REG, _SAF, _QM, _MIC, _SUS, _RMM). The Workbench refreshes the supplier contacts before a Return re-fires X3 for round n+1 (v4 L250).
- **COH-06r:** `Markets_Label` is Editable at CASE_S5 and CASE_S8, next to `Target_Markets_Text`. An accepted market correction now also updates the label. The portal header copy still does not change, because X1 fires once.
- **Q8 / R-02 (the conductor's choice, pending Thomas):**
  - BRM automatic completion after the supplier's release stays: Y5 approves CASE_S7 (REQ-PROC-045, brd L192, L1303).
  - Y5 does **not** blank `Open_Items_Count` or `Open_CR_Count`.
  - Instead, the RMM Workbench refreshes both counts while the case waits at CASE_S7 (PS-11). They are already Editable there (D23).
  - **Portal hand-off (PART C, portal session):** the supplier UI refuses the final release while the supplier's own CIQP Queries or CIQP Change Requests on the case are open.
  - **Residual risk:** an open point or change request opened in the seconds before Y5 is not in the counts, so CASE_S8 is skipped. The next Workbench session or sync catches it.
  - Written into the CASE_S7 step note, the CASE_S7 handoff note and `meta.coherence_repairs.rev19`.
- **Stale text:** `meta.field_reconciliation` and `meta.data_model_revision` now point to the data_model slice at graph revision 20 (the field contract dates from revision 12, D22), not "revision 4". All handoff fields resolve against it. `Rounds` is a child table, and its columns are unchanged.
- **Check:** revisions 23 and 24 materialized (24 only renumbers the notes to D27) to `scratch-kf-workflow-designer/rev19/`.
  - validate: 0 errors, 1 warning (AUTO_SELF Z2).
  - verify: 0 errors, 2 warnings (AUTO_SELF, NO_PAGES).
  - `build --no-pages`: 0 errors, 4 warnings (ORPHAN_ENTITY connectors), 226 artifacts.
  - A scratch copy with the 8 handoff cells applied to security (`spec-sim-security.json`) validates and builds with 0 errors. The compiled diff is exactly those 8 cells, in `process/CIQ_Case_A00` and `process/CIQ_Open_Point_A00`.
  - No step, condition or assignee changed, so liveness is the same as revision 14.
- **Next:** kf-security-designer re-commits the 8 cells. The portal session implements the release refusal.

**Why:** coherence pass 3 (graph revision 18) COH-12, COH-06r and R-02/Q8.
**Alternatives:** Y5 blanks the counts so CASE_S8 always runs. Rejected, because it turns every completion into a manual RMM check and breaks REQ-PROC-045.
**Status:** applied (workflow). Security cells are pending. Q8 is pending Thomas.

## D28 · Architecture: list registry aligned with the data model (kf-architect, graph revision 22) – COH-11 / coherence doc gap

**Decision:** In `architecture.lists`, `CIQ_OP_Outcome` changes to Accepted, Withdrawn and is used only by the CIQ Open Point outcome. A new entry `CIQ_Round_Outcome` ("CIQ Round Outcome", no _A00) holds Accepted, Returned, Withdrawn and is used by the Rounds outcome column. The same list id is also registered in `id_reservations.list_ids` and in the build_order "lists" layer, right after CIQ OP Outcome. The list count in hard_rules[0] and hard_rules[2] goes from 21 to 22, and coverage.lists now reads "22/22: 21 domain value sets plus CIQ Round Outcome". Nothing else changed: flows, roles, ER map, journeys and source are untouched.
**Why:** coherence pass 3 (rev 18) flagged the doc gap "architecture.lists CIQ_OP_Outcome still Accepted, Returned, Withdrawn", and the COH-11 fix asked kf-architect to align the registry with D22 and D26.
**Not changed (out of scope, reported only):** `architecture.lists CIQ_Event_Category` still has 16 items without "Final PDF". data_model has 17 since D22/COH-09. The compiled list follows data_model, so the build is unaffected.
**Status:** committed at revision 22 (base 21). The slice read back matches. A snapshot materialized at revision 23, which includes the parallel workflow commit, gives validate 0 errors / 1 warning (AUTO_SELF Z2), verify 0 errors / 2 warnings (AUTO_SELF, NO_PAGES) and `build --no-pages` 0 errors / 4 warnings (ORPHAN_ENTITY connectors) with 226 artifacts. In the compiled output, `CIQ_OP_Outcome` ListItems are [Accepted, Withdrawn] and `CIQ_Round_Outcome` ListItems are [Accepted, Returned, Withdrawn]. Rounds_Outcome binds CIQ_Round_Outcome and OP_Outcome binds CIQ_OP_Outcome. The foundation findings are unchanged (8): none is owned by architecture. Output is in `runs/ciq-digital-v4/scratch-kf-architect/rev22`.

## D29 · Security re-committed with the D27/COH-12/COH-06r cells; commit-order re-stamps by the conductor
**Why:**
- kf-security-designer prepared `sec-d29.json`, with exactly the 8 handoff cells:
  - Markets_Label Editable at CASE_S5 and CASE_S8;
  - Portal_Contact_Ids Editable at the six OPNT_R_* steps;
  - RR-5 rewritten to name the real gates.
- Its commit was blocked only by commit order. The conductor then made these commits:
  - re-committed data_model unchanged (rev 25);
  - committed the prepared security slice (rev 26);
  - re-committed automations with COH-13 (rev 27). COH-13 adds the D27 release-refusal rule to the X5 and Y5 portal contract items; it is documentation only and not compiled.
  - re-committed experience unchanged (rev 28).
- The second "D17" (Security) is renamed **D17b**, so references to D17 keep pointing at the first one.

**Alternatives:** re-run every specialist. Rejected: the content was already reviewed, and only commit order was stale.
**Status:** `done` (revisions 25–28 landed; verified in coherence pass 5, rev 29)


## D30 · Thomas's confirmations (2026-10-07, in the CIQ Digital session)
- **Generate approved**, on the condition that the parallel-steps runtime test (K-PAR on CIQ ZZ Spike Case) passes first.
- **D23 confirmed:** "Open items check – before release request" always runs once (an RMM task).
- **Q8 / D27 confirmed:** automatic completion after the supplier's release (REQ-PROC-045). The supplier UI refuses the release while the supplier's own queries or change requests are open. RMM's Workbench refreshes the counts while the case waits at PS-11.
- **D18 and D21 accepted:** the initiator-contract mismatch and the `_id`→Text mapping waiver (runtime-proven).
- **Supplier contacts:** confirmed as a child table on CIQ Supplier (writable over REST).

**Status:** `accepted (Thomas)`

## D31 · Automations: only Z1 and Z2 as placeholder shells (Thomas, 2026-10-07 night)
**Decision:** The automations slice keeps only **Z1** (case completed) and **Z2** (case cancelled). **Z3** and **Z4** (SLA-breach audit events) move to the later integrations list. Committed at graph revision 30 (base 29). Gate: 0 errors, 2 automations.
**Why:** Thomas: "do not do any integrations now, just list them". App Builder refuses to generate with fewer than 2 automations, and native step notifications don't count (tested offline, `scratch-notif-test`). Thomas chose "Allow 2 empty shells": generate creates Z1/Z2 as incomplete, switched-off integrations, which are filled when integrations are built or deleted by Thomas in the builder.
**Alternatives:** keep all four (4 shells, rejected: more clutter); no shells (impossible with App Builder).
**Status:** `accepted (Thomas)`

## D32 · Concurrency: write-then-verify in the Workbench, serialized writes in the sync service
**Decision:**
- Every Workbench save is **write-then-verify**: read the item back; if a field or child row it wrote is missing, re-apply (max 3), then tell the user.
- One write in flight per item per session; Form items are created one at a time per user (create → submit, then the next).
- The sync service follows the same rules and serializes per Form and per item.
**Why:** night tests K-RACE (SPIKES.md): simultaneous writes to one item lose updates on the process admin route, the Form route and child tables (5/5 rows lost); a stale `_doc_version` is accepted (no locking); simultaneous creates by one user collide on the per-user draft. The window is under ~0.1 s.
**Alternatives:** one record per department lane (rejected: more records and API calls, against Thomas's rule, for a race that needs two saves within 0.1 s); optimistic locking via `_doc_version` (not available).
**Status:** `proposed` (no model change; UI + sync-service rule)

## D33 · What the API key may do: submit yes, step-field updates no, Mandatory not enforced
**Decision:**
- The key acts as its user. It can **submit** a step whose role includes that user, **reject** and **withdraw**. It **cannot update fields** at steps after Start through the assignee route (050313 for every field, even Editable ones). The **admin route** (`PUT /process/2/{acc}/admin/{proc}/{item}`) writes any field.
- The sync service never acts on human decision steps. **The Y integrations may approve the RMM-owned supplier-waiting steps CASE_S1, CASE_S3, CASE_S7 and OPNT_S1** through the connector action "Approve an item" (contract Y1/Y3/Y4/Y5, D30 automatic completion); RMM's manual submit is the fallback. Which identity the connector acts as, and whether its UpdateAnItem is allowed after Start, is [unverified] until K-09b/c. Where the sync service must write a field on an in-progress item, it uses the admin route, which needs flow Admin for its user (post-generate grant, to be decided; proven so far only with Thomas's account-admin key).
- **The Workbench enforces Mandatory and gate fields itself** before `submitItem`, because the server did not enforce Mandatory on submit for the key.
**Why:** night tests (SPIKES.md, "What the API key can and can't do").
**Status:** `proposed`

## D34 · Return (send-back), reject and cancellation in practice
**Decision:**
- The Open Point **Return** stays the native send-back (v4). The Workbench calls `sendbackItem`; if that fails, it opens the native task form (`openForm`) where the native send-back button is.
- After generate, `IsSendbackEnabled=true` is set on the OPNT_R_* steps (the shape tested on the Spike Point). Whether it is the right switch is **[unverified]** until one real-user send-back (Thomas, Point `PkEKOEvnYp7X`).
- **Z2 "case cancelled" keeps its planned trigger: a CIQ Audit Event row with category Cancellation** (Form ItemCreated is verified). The Workbench writes that row on every Reject or Withdraw of a case. A case-level ItemRejected/ItemWithdrawn trigger is only a backstop, if the connector offers it: a rejection or withdrawal does not fire ItemCompleted [verified on the Spike Point].
**Why:** night tests K-ACT: reject 200, withdraw 200, send-back 500 in every form over the key.
**Status:** `proposed`

## D35 · Pre-generate review (5 reviewers + 2 skeptics per finding, rev 30 → coherence pass 6 at rev 31): GO-WITH-FIXES
**Result:** no blocker; no model change. Coherence pass 6 committed at rev 31 (COH-14…18 minor). Surviving majors, all fixable after generate:
- **Lanes under simultaneous saves (findings F1, conformance F1):** keep the lanes on CIQ Case (D32). The branch field sets are disjoint, and nothing else writes the case during Part 2. The Workbench re-reads the lane fields before and after `submitItem`, writes counts only on an explicit save, and RMM's check at CASE_S5 (always runs once, D23) verifies every active lane is complete. Per-department records stay possible later as an additive change (a new Form), if Thomas wants them.
- **Send-back semantics (F5, conformance F2):** test a real-user send-back on the generated CIQ Open Point with OP_Dept = SUS (skipped review steps in between, OP_Outcome left blank). Ordered fallback: SDK `sendbackItem` → native form → initiator resubmit → successor point.
- **K-WB (F9):** whether a real user's SDK session can update fields after Start is a prerequisite for the Workbench's write path. The Workbench is built so that if `updateItem` is refused, it opens the native task form (`openForm`) and keeps the write-then-verify reads.
- **Blank vs 0 (conformance F3):** first acceptance check after generate: a new CIQ Case reads Open_Items_Count as blank (not 0) and Hold_For_Open_Items = "Yes".
- **Apply side effects (dry-run F2):** the connecting developer (Thomas) is added to every role, and "All Items" report View grants are created. They are read back after generate and reported. In this dev sandbox Thomas keeps every role for testing until he decides otherwise.
**Status:** `done`
