# 07 - Kissflow fit and delivery-risk assessment (BDF CIQ MVP)

> **INTERNAL - Kissflow only. Never share with BDF, the consultant or the competitor.** This file assesses the limits of our own platform and audits our own submitted screening answers.

Discovery analysis only. Nothing is built. Prepared 2026-10-05, the day before call 1 with BDF's consultant.

---

## 0. How to read this

**Inputs read in full:** source notes 01-07, analyses 01-06, the glossary, and the Kissflow builder operating manual (`~/Downloads/master.md`, sections 0-18).

**Citation codes**
- Client documents: the codes in `00-glossary.md`, i.e. [ReqDoc p.x §y], [BRM REQ-...], [FLM r.. / changelog r.. / Feldkatalog r..], [KB sheet ID], [CIA #n], [VQ rN], [IKW p.n].
- **[MM §x]** = Kissflow builder operating manual. Its evidence tags are kept where they matter: `[verified-live]`, `[owner-confirmed]`, `[observed-once]`, `[inference]`.
- Analysis IDs: W-xx (analysis/01 open workflow decisions), M-xx and U-xx (analyses 02 and 03), C-xx, G-xx and BR-xx (analysis/04), E-P-xx (analysis/05), E-D-xx (analysis/06).

**Tags**
- **(inferred)** = our own reasoning.
- **UNCONFIRMED** = a platform behaviour our manual does not prove. It must pass a spike (§4) before we promise it to BDF.

**Scales**
- **Confidence** that Kissflow can deliver the capability in the MVP as designed:
  - **High:** a native primitive proven in MM.
  - **Medium:** built from proven primitives plus custom UI code, or depends on an `[inference]`.
  - **Low:** depends on an UNCONFIRMED behaviour or on a component outside Kissflow.
- **Delivery risk:** the probability that it fails or looks weak in BDF's test, multiplied by its weight in the vendor comparison. Rated High, Medium or Low.

Capability IDs in this file are **F-01 … F-29**, spikes are **S-01 … S-12**, and questions are **Q-01 … Q-22**.

---

## 1. Executive summary

1. **We can win this, but not by configuring native forms.** The CIQ is configuration-driven. The following must all be **versioned data** that business administrators change without the builder:
   - the questionnaire
   - the rule set
   - section ownership
   - RMES criteria
   - limit values

   [BRM REQ-CFG-001, -003, -006; ReqDoc p.13 REQ-RMES-002, -008]. Native form fields are defined in the builder and change live for every item. Nothing in our manual gives them version pinning for in-flight items [MM §3.3, §4.2] (inferred). **A data-driven core with an app-level Custom UI is the only architecture that passes BRM's own acceptance scripts** (e.g. "a running case keeps the previous template version" [BRM REQ-CFG-001]).
2. **Supplier isolation is the biggest delivery risk.** Supplier A must never see supplier B or any internal content [BRM REQ-CTL-002, REQ-CTL-006; ReqDoc p.14 REQ-RMES-015]. What the manual says:
   - Kissflow grants are per flow and give View on all items.
   - `my-items` scope "is a view convention, not row-level security".
   - Dataform and board members see every row.

   [MM §3.4, §4.7, §5.4]. Rows are isolated naturally only on **Process items, by participation** [MM §3.6 `/myitems`]. That depends on routing a supplier step to a specific person. Our manual says the engine has "no dynamic per-record assignee" [MM §4.6]. **Spikes S-01 and S-02 on day 1 decide the architecture** (§4).
3. **Strong native fits:**
   - Department roles as static step owners. Regulatory cannot act on a Safety step [MM §4.6].
   - Native send-back with a mandatory comment gives an unlimited clarification loop with history [MM §3.6].
   - Step-level field permissions freeze data [MM §4.6].
   - Status derives from `_current_step` [MM §3.6].
   - A switchable gate can be built as a step condition [MM §4.6].
4. **Weak fits:**
   - A business-editable, versioned rule engine. Decision Tables are plan-gated [MM §4.4, §15].
   - Conditional mandatory fields: no primitive exists `[owner-confirmed]` [MM §4.4].
   - An automatic sync point across a variable set of department reviews.
   - A PDF of a dynamically scoped CIQ (GeneratePDF is unproven) [MM §4.8].
   - An audit trail linking decisions to source and rule versions [E-D-85].
5. **Promise audit (§8).**
   - **Seven of our 34 CIA answers will be tested literally** by BRM acceptance scripts: #2, #4, #6, #7, #10, #19, #26. They must be proven in the MVP.
   - **Twelve need reframing:** #1, #3, #11, #12, #14, #15, #16, #18, #25, #26, #32, #33.
   - **Two VQ statements are exposed** by our own platform:
     - "logs unalterable even by platform admins" [VQ r12]. Admin delete routes exist [MM §3.6].
     - A "4-week configuration phase" [VQ r27], while a realistic MVP is 26-33 builder-days [MM §17] (inferred).
6. **Effort:** 26-33 builder-days, which is about 3-3.5 calendar weeks with two builders after a 3-day spike (§10; calibrated on [MM §17], inferred).
7. **Win theme.** Run BDF's own acceptance scripts live, and show three things a form-configuring competitor will find hard (inferred):
   - (a) version-pinned rule and template changes, with a regression test
   - (b) supplier separation that can be tested
   - (c) evidence-version traceability for every decision

   See the 7 design moves in §11.

---

## 2. Platform facts that drive every design decision

| # | Fact (from the manual) | Consequence for the CIQ | Source |
|---|---|---|---|
| PF-1 | Choose the flow type up front. A Form cannot gain a workflow later | Decide Process or Form per entity now. Any record with supplier ↔ BDF gates is a Process | [MM §2.2, §4.2] |
| PF-2 | A Process step's owner is a static AppRole. There is "no dynamic per-record assignee" | Departments fit. Individual supplier contacts and named reviewers do not (**UNCONFIRMED**, S-01) | [MM §4.6] |
| PF-3 | Grants are per flow, with View on all items. `scope` is not enforced. "Editable" on a Process implies InitiateItems, so reviewers can become co-initiators | Isolation must come from flow separation and process participation, never from UI filters | [MM §3.4, §4.7, §6.7, §14 #20] |
| PF-4 | No conditional-required primitive. Step-level Mandatory is unconditional. No Decision Tables on typical plans | Completeness, N/A-with-justification and the rule set must be our own code and data | [MM §4.4 owner-confirmed; §15] |
| PF-5 | Concurrent writes to one process instance: the last writer wins. Concurrent child-table writes are lost silently, and every response is still 200 | Never put several people's work on one record | [MM §6.6, §14 #26, #83] |
| PF-6 | A dataform create takes two calls, uses a per-user singleton draft, and must be strictly sequential | Do not store one record per answer. Batch at section level | [MM §3.5, §14 #25] |
| PF-7 | Only a real assignee in the runtime (SDK or native UI) can reliably advance a process step. API keys only reliably submit the StartEvent | Orchestration runs in a user session or in a Process→Process integration | [MM §3.6, §15] |
| PF-8 | Integrations: 1 trigger plus ≥1 action. No field-change trigger, no arithmetic, no per-row loops, no multi-create. A human must activate them. Dataform targets may not be wireable | Integrations can fan out a *fixed* set of process items. They cannot run the rule engine or reminders over rows | [MM §4.8] |
| PF-9 | Native pages use static cards with no live KPIs. Page cards auto-grant access and escalate viewers to editors | Dashboards and the supplier UI go in a custom UI. No native pages for suppliers | [MM §5.1, §4.7, §14 #21] |
| PF-10 | The custom UI runs in a cross-origin iframe. Outer URL parameters are not forwarded. Files go through `kf.client.uploadFile`. The zip ceiling is 5 MB | E-mail deep links cannot jump straight to a field, but jump targets work inside the app | [MM §6.11, §6.6, §10.1] |

---

## 3. Recommended architecture

### 3.1 Seven design principles

| # | Principle | Requirement it serves | Basis |
|---|---|---|---|
| P1 | **Generated into the case.** When the scope is released, the case-specific question definitions (from the pinned template version) are copied into the case's own section items. The supplier never reads configuration flows, and version pinning holds by construction | "Generated, not selected" [ReqDoc p.9 §5.1]; running cases keep their version [BRM REQ-CFG-001] | (inferred) |
| P2 | **Separation by construction.** Internal content lives in flows where the supplier role has no membership at all. Supplier-facing items carry no internal fields, so security never depends on hidden fields | [BRM REQ-CTL-002; ReqDoc p.14 REQ-RMES-015; E-D-74] | [MM §6.7] |
| P3 | **Supplier-writable data lives only in Process items the supplier participates in**, with no report grant | [BRM REQ-CTL-006] | [MM §3.6, §4.7]; **UNCONFIRMED** S-02 |
| P4 | **One person's work per record:** per-section items, per-open-point items, per-department review tracks | [BRM REQ-CTL-001] | [MM §6.6, §14 #83] |
| P5 | **Part 2 is append-only.** After PS-05 the review version is a frozen base. Every later change is a reviewed delta (open point or supplier change request) with a reason, a decision and a version | [ReqDoc p.4 §3.1.5; BRM REQ-PROC-016, -031; E-P-36, E-P-53] | (inferred) |
| P6 | **Internal records are created idempotently.** Snapshots, registers, review tracks and audit entries are created by internal sessions or Process→Process integrations. Each is keyed by (case, cycle, department or section) and safe to re-run | Robustness ("runs for years") | [MM §3.6, §4.8] |
| P7 | **Every decision is stamped** with the answer or document version, template version, rule-set version and limit-set version | [BRM REQ-CTL-009; ReqDoc p.13-14 REQ-RMES-005, -008, -016] | (inferred) |

### 3.2 Flow inventory (proposal: about 30 flows and 14 roles; all names prefixed `CIQ_` [MM §2.3])

| # | Flow | Type | Why this type | Members | Supplier access |
|---|---|---|---|---|---|
| 1 | Case | **Process** | Cross-role gates (RMM → supplier → BDF → supplier) with native tasks, SLAs and step history [MM §2.2] | RMM initiates; internal roles act on internal steps; supplier contacts only through step assignment | As participant only. No internal fields on this record |
| 2 | Section Response (one per case × section × review cycle) | **Process** | Supplier writes are isolated by participation. One record per section avoids overwrites [MM §6.6]. Completing the item freezes it natively | Supplier contacts (assignees); internal roles read | As participant only |
| 3 | Open Point (query, document request, additional part, supplier change request) | **Process** | An unlimited loop through native send-back with a mandatory comment [MM §3.6] | Department roles; addressed supplier contact | As participant only. Supplier-safe fields only |
| 4 | Review Track (one per activated department × cycle) | **Process** | A static department role as owner is a native fit [MM §4.6]. Final step for the Safety and Regulatory approver roles | Department roles; approver roles | None |
| 5 | Config Change Request | **Process** | Four-eyes publication of template, rule and limit versions | Business Admin; Config Approver | None |
| 6-13 | Template Version (manifest), Section Definition (JSON), Rule Set Version, Rule, Section Responsibility Version, Evidence Type, RMES Criterion Template, Limit Set, Text Module, Notification Rule | **Form** | Business-maintained records that stay editable after publish [MM §3.3]. Immutability comes from status, hash and a restricted editor role | Business Admin edits; internal roles read | None |
| 14-17 | Supplier, Supplier Contact, Supplier Site, Raw Material | **Form** | Master-data registers [MM §2.2] | RMM, administrator | None |
| 18 | Scope Derivation Run (+ Scope Items child table) | Form | Immutable derivation record [E-D-18] | Internal | None |
| 19 | Review Version Snapshot (+ Component Register, Evidence Register) | Form | A frozen internal copy at PS-05 and PS-11, plus a typed composition table for analysis [BRM REQ-PROC-006] | Internal | None |
| 20 | RMES Record and Criterion Result | Form | One record per criterion, so Safety and Regulatory never overwrite each other [MM §6.6] | Safety and Regulatory edit their own criteria; others read | None |
| 21 | Finding | Form | Internal record with a blocking flag | Internal | None |
| 22 | Internal Note | Form | BDF-only channel [BRM REQ-PROC-020] | Internal | None |
| 23 | Confirmation | Form | Immutable record of the three confirmations and of decisions | Written by internal sessions | None (the supplier sees its own confirmation on the Case step) |
| 24 | Delegation | Form | Auditable delegation [BRM REQ-PROC-039] | Department leads | None |
| 25 | Audit Event | Form | Hash-chained business audit (F-18) | Internal, written by the orchestration | None |
| 26 | Notification Log | Form | Every notification event logged [BRM REQ-CTL-010] | Internal | None |
| 27 | Final Document | Form | Immutable PDF plus hash [BRM REQ-PROC-046] | Internal | None, unless BDF decides otherwise (Q-12) |
| 28 | AI Suggestion | Form | Marked, sourced, confirm or discard [BRM REQ-PROC-024] | Safety, Regulatory | None |
| 29 | Lists: origins, markets, units, departments, document types | **List** | Option sets for the native Select fields on the case header. Populate them, and match their values exactly [MM §3.8] | - | - |
| 30 | Case Index (optional read model) | Form | Fast role dashboards, needed only if the admin item listing is too sparse (S-05) | Internal | None |

**Roles (about 14):**
- Departments: RMM, Regulatory, Safety, QM, Microbiology, Sustainability, Customs (informed), Legal (informed).
- Approvers and administration: Safety Approver, Regulatory Approver, Business Admin, Config Approver, Auditor (read).
- External: Supplier Contact. The supplier coordinator is a data attribute, not an AppRole.
- Technical: an Orchestrator role for integrations.

The list follows [BRM REQ-CFG-004] plus the roles the BRM omits [C-12, C-13]. Every role needs members verified by GET [MM §3.2] and a final re-grant pass [MM §3.4].

**Why no Boards.**
- Every lifecycle here has cross-role gates, which is Process territory [MM §2.2].
- Board members see every card through the `{id}_all` view [MM §3.7, §5.4]. That is unacceptable for supplier data.

**Why no Datasets.**
- Dataset sharing is UI-only, and the admin key has no dataset scope [MM §11.4].
- A portal precedent pulled a 2,169-row matrix into a parent's browser to find one row [MM §6.5]. (inferred) That data was therefore readable by every parent.

### 3.3 Happy path mapped to sessions and mechanisms

| Step | What happens | Who runs it | Native or our code |
|---|---|---|---|
| H1 | RMM creates the Case (supplier, trade name, contact, owner) [BRM REQ-PROC-001]. The case pins the template manifest and rule-set version. A Basic-Data section item is created with the snapshot of the SF configuration questions | RMM session | Process create and submit [MM §3.6] |
| H2 | The supplier fills in the basic data and submits the section and the case step. Blocking fields are listed [BRM REQ-PROC-005] | Supplier session | Native submit; completeness evaluator is our code |
| H3 | **Scope check.** The UI runs the authoritative derivation and shows M/O/N.A. per section with the rules that fired. RMM may extend the scope with a justification [BRM REQ-CFG-007] and then confirms. The UI creates the Section Response items (copied definitions) and writes the department activation flags on the case | RMM session | Code, then sequential process creates |
| H4 | The supplier completes the sections. A coordinator assigns sections to colleagues, and evidence is uploaded per question | Supplier sessions, in parallel on different items | Native items; renderer is our code |
| H5 | **PS-05.** The completeness gate runs. The supplier submits every section item (completed means frozen) and the case step. The version of the confirmation text is stamped | Supplier session | Native submit; gate is our code |
| H6 | Part 2 starts. The case enters "BDF review" and an integration creates one Review Track per department. Tracks for departments that were not activated skip through a step condition | Process→Process integration | Native [MM §4.8] (S-04, S-09) |
| H7 | The first reviewer session creates the review-version snapshot (idempotent) and the RMES record, pre-filled from the snapshot with source references [BRM REQ-PROC-022] | Reviewer session | Code |
| H8 | Reviews, findings, open points. Loops run through send-back | Department and supplier sessions | Native loop; references are our code |
| H9 | Each department completes its track (gate: no open points). Safety and Regulatory approver steps follow | Department sessions | Native role separation; gate is our code |
| H10 | The last department to complete re-reads all tracks and moves the case to "Final release". The single native assignment e-mail is the single supplier notification [BRM REQ-PROC-040] | Reviewer session, plus a "stuck case" check for RMM | Code and native |
| H11 | The supplier gives the final release. The case completes, and the PDF is generated, filed and e-mailed to RMM [BRM REQ-PROC-042, -045, -046] | Supplier session; then integration or renderer | Native trigger (S-07) |

---

## 4. Load-bearing unknowns: 3-day spike plan (before any build)

**Cheapest first step:** ask Kissflow product and engineering internally about S-01, S-02, S-08 and S-11 before running the experiments. Then run each control experiment in the builder UI first [MM §4.9 golden rule: "Don't infer *impossible* from absence in a sample"].

| ID | Unknown | Control experiment | Pass means | Fallback if it fails | Affects |
|---|---|---|---|---|---|
| **S-01** | Can a step assignee be taken from a User or Email field on the item (single and multiple users), including external users? The manual says the engine cannot do this [MM §4.6]. The builder may (inferred) | A 2-step process with step 2 assigned to a User field. Test with two internal users and one external account | Supplier tasks route to named contacts natively | Supplier steps cannot be native tasks. Use the mediated supplier layer (§4.1) | F-09, F-10, F-12, F-28 |
| **S-02** | Are rows isolated for a non-admin participant with no report grant? | As supplier A: `getMyItems`, `getParticipatedItems` [MM §6.2], `kf.api` GET on supplier B's item ID, search, and B's attachment URL. Add the "leaky-vs-scoped" fixture [MM §6.7] | A sees only its own items, and the GET on B returns 403 | Mediated supplier layer | F-10 and all supplier data |
| S-03 | Do two assignees writing *different fields* of one process item at the same time both persist? [MM §6.6] | Parallel SDK updates | Both values persist | Keep strictly one writer per record (already the design) | F-09 |
| S-04 | Do conditional steps inside Parallel branches work, does the join skip inactive branches, and does an item whose steps are all skipped auto-complete? [MM §4.6 inference] | A process with 3 branches, each with a condition on a flag | Native "sync only on activated" | Review Track items with session-driven sync (default design) | F-11 |
| S-05 | Does a cross-flow COUNT aggregate work with a Process as the target (helper field `Is_Open`)? [MM §4.4] Which fields does the admin item listing return? [MM §6.5] | Aggregate Open Points on the Case; read `getAdminItems` | Live counts on the case header, and dashboards without N+1 reads | UI-computed counts; Case Index form | F-14, F-20 |
| S-06 | Can child-table rows with an Attachment column be added to a process item via the SDK form API? Can an attachment value be copied into an internal record? [MM §3.6 REST 500 `observed-once`] | `initForm → getTable().addRow` | Per-question uploads with versions | One Document process item per upload | F-04, F-08 |
| S-07 | Can the GeneratePDF action render dynamic sections and repeatable tables, attach the file and e-mail it? [MM §4.8] | Integration on Case ItemCompleted | Native PDF | External renderer (webhook → render → attach) [MM §6.15] | F-21 |
| S-08 | What does a supplier participant see in native e-mails, activity history, other assignees' names and comments? Can assignment e-mails be switched off per flow or step? | Run the flows as a supplier | No internal content leaks, and e-mails are controllable per step | Our own notification sender only; strip history in the UI | F-10, F-19 |
| S-09 | Can an integration CreateAndSubmitItem into a Process with fields copied from the source? Does an admin delete leave an attributable trace (`_is_deleted`, `_deleted_by` [MM §4.10])? | Build and run | Part 2 starts without a user, and deletes are attributable | Session-driven creation; restrict delete rights | F-11, F-18 |
| S-10 | Size limits of Textarea/JSON fields, and time to create about 40 items at release (not in MM) | Load a 120 KB JSON; time 40 sequential creates | The section JSON fits, and release takes < 30 s | Split per sub-section; background progress bar | F-01, F-02 |
| S-11 | What does the tenant plan include: Decision Tables, AI features, SLAs, external/portal user type and licence tier? [MM §15; VQ r32] | Check the plan; ask Kissflow product | Optional accelerators are available | Rules as data (default); AI through an approved endpoint | F-03, F-10, F-23 |
| S-12 | Does SequenceNumber generate a human-readable case ID on the tenant? [MM §4.4, §14 #59] | Create items | Native unique ID | App-generated ID with a collision check | F-25 |

### 4.1 Fallback architecture if S-01 or S-02 fails (decide on day 2, not later)

- **Design.** The supplier experience goes through a **mediated supplier layer**:
  - The supplier's custom UI calls a small BDF-approved service.
  - Its keys stay server-side only [MM §6.7, §11 rule 3].
  - The service enforces "only your cases" and acts in Kissflow under a service identity.
  - The internal side stays unchanged.
- **Cost (inferred):**
  - +3-5 builder-days.
  - A hosted component that BDF IT must accept.
  - A weaker low-code story against CIA #4 and #19.
- **Precedent.** Our closest precedents relied on per-user search plus isolation fixtures:
  - The supplier-portal demo was "wired for reads only / partially" [MM §12.D].
  - The vendor portal had "vendor isolation fixtures" [MM §9.6].

  This reinforces the case for running S-01 and S-02 first.

---

## 5. Capability fit matrix (summary)

| ID | Capability | Requirements | Kissflow approach (short) | Confidence | Delivery risk |
|---|---|---|---|---|---|
| F-01 | Questionnaire generated from a business-maintained configuration | ReqDoc §5.1; REQ-PROC-009 | Config Forms + Custom UI renderer; definitions copied into case items | Medium | **High** |
| F-02 | Versioned template, maintained by the business without IT | REQ-CFG-001 | Manifest + copy-on-write Section Definitions; four-eyes publish Process | Medium | **High** |
| F-03 | Nested rule engine | REQ-CFG-003 | Rules as versioned data + deterministic evaluator + derivation record | Medium | **High** |
| F-04 | Field types: tables, number + unit, upload per question | REQ-CFG-002 | Renderer components; units list; stable row IDs; uploads child table | Medium | Medium |
| F-05 | M/O/N.A. classification + completeness with justification | REQ-PROC-009, -010, -012, -005 | Scope Items + our validator (no conditional-required primitive) | Medium | Medium |
| F-06 | Manual scope override + BDF scope check | REQ-CFG-007; ReqDoc §5.2 | Native internal step "Scope check" + override with justification | High | Medium |
| F-07 | Re-derivation with data retention | REQ-CFG-008, -009; REQ-PROC-007 | New derivation run + diff; out-of-scope items retained; Part 2 = proposed change | Medium | **High** |
| F-08 | Context-linked uploads and versions | REQ-PROC-011, -016; REQ-RMES-017 | Uploads child table on the section item; never deleted; internal evidence register | Medium | Medium |
| F-09 | Several supplier contacts working in parallel | REQ-CTL-001 | One item per section; soft lock; per-answer attribution | Medium | **High** |
| F-10 | External access and confidentiality | REQ-PROC-004; REQ-CTL-002, -006; REQ-CFG-004; REQ-RMES-015 | Separation by flow + participation-scoped process items; custom UI only | **Low** | **High** |
| F-11 | Dynamic parallel subprocesses; sync on activated ones only | REQ-PROC-017, -018; ReqDoc §3.2.1 | Review Track items (static department roles) + integration fan-out + session sync | Medium | **High** |
| F-12 | Open points referencing a field, row or document version, with a jump target | REQ-PROC-029, -030, -033; REQ-ADR-001, -002 | Open Point Process; polymorphic reference; in-app router jump | Medium | **High** |
| F-13 | Traffic lights | REQ-PROC-034 | Derived from `_current_step` and `_status` | High | Low |
| F-14 | Repeatable loops; all open points block completion | REQ-PROC-035, -036 | Native send-back loop; aggregate count + completion gate | Medium | Medium |
| F-15 | RMES criteria, findings, quantitative limits | REQ-RMES-002…012; REQ-PROC-021, -022 | Internal Forms + second rule set + limit evaluator with controlled units | Medium | **High** |
| F-16 | Separate Safety and Regulatory decisions; auditable delegation | REQ-PROC-039; REQ-RMES-013, -014 | Approver roles on track steps; native reject with comment; delegation record | Medium | Medium |
| F-17 | Freezing and versioning | REQ-PROC-016, -043 | Completed items are read-only + hashed snapshot per cycle; deltas only | Medium | Medium |
| F-18 | Immutable audit trail | REQ-CTL-009; REQ-RMES-016 | Native item history + hash-chained business Audit Event | Medium | **High** |
| F-19 | Configurable notifications, reminders, escalation | REQ-CTL-010; REQ-PROC-040; REQ-RMES-019 | Native step e-mails and SLA + our due-date reminders + notification log | Medium | Medium |
| F-20 | Role-appropriate dashboards | REQ-CTL-006; REQ-RMES-018; CIA #21-23 | Custom UI over admin listings and case aggregates (Case Index if needed) | Medium | Medium |
| F-21 | Automatic PDF, filed immutably and e-mailed | REQ-PROC-046 | GeneratePDF integration or external renderer; Final Document + hash | **Low** | **High** |
| F-22 | Cancellation and reactivation | REQ-PROC-049; ReqDoc §3.3.3 | RMM action + idempotent cascade; reactivation as a new review cycle | Medium | Medium |
| F-23 | AI document review | REQ-PROC-024 | AI Suggestion records; approved AI endpoint; one narrow check | **Low** | Medium |
| F-24 | Later Teamcenter, B-Flow and SAP integrations | ReqDoc §1.1 (OP-13); CIA #1, #12, #15, #18, #32 | Webhook, HTTP and Scheduler connectors; external-ID keys designed now | Medium | Low (MVP) |
| F-25 | Case creation, unique ID, supplier master | REQ-PROC-001; FLM r2-r9 | Case Process + master Forms; ID check (SequenceNumber caveat) | High | Low |
| F-26 | Exactly one responsible person per task | REQ-CTL-003 | Native role task + named owner as data + reassignment | Medium | Medium |
| F-27 | Internal communication area | REQ-PROC-020 | Internal Note Form, physically separate from the supplier Q&A | High | Low |
| F-28 | Three confirmations (name, role, e-mail, time) | REQ-PROC-014, -015, -042 | Native step submit + immutable Confirmation record + versioned text | High | Low |
| F-29 | End of process: supplier release vs BDF overall approval | ReqDoc PS-12; BRM REQ-PROC-042, -045 | BRM ending + overall-approval step that can be switched on | High | Medium (decision, not platform) |

---

## 6. Capability detail

### F-01 · Questionnaire generated from a business-maintained configuration

- **Need**
  - "The questionnaire is not selected, it is generated" [ReqDoc p.9 §5.1].
  - Scope is derived automatically against a controlled rule set [BRM REQ-PROC-009].
  - The configuration table is business-maintained [ReqDoc p.2 §1.1].
- **Kissflow approach**
  - Configuration lives in Forms: a Template Version manifest plus Section Definitions as JSON, keyed by immutable field IDs [E-D-28].
  - Runtime is an app-level Custom UI (React with `@kissflow/app-core`, architecture A [MM §6.1]). Its generic renderer reads the definitions.
  - At release the definitions are **copied into the case's Section Response items** (P1).
  - Native fields are used only for the fixed case header.
- **Why not native forms**
  - Builder-defined, edited live for every item, single-language labels (inferred from [MM §3.3, §4.2]).
  - They would fail REQ-CFG-001's in-flight test.
  - The data-driven route also handles languages as data [E-D-100].
- **Confidence:** Medium. **Delivery risk:** High. This is the largest build item and the core of the comparison.
- **Mitigation**
  - Build against FLM v0.6 first: 39 fields covering every mechanic (conditional chains, pre-fill, uploads on non-upload fields, numeric checks) [FLM 'CIQ new version' r2-r55; source 05 §F].
  - One component per field type.
  - Pure-function tests for visibility and validation, following the "hundreds of assertions" precedent [MM §9.6].
  - A role × page harness [MM §9.2].
  - S-10 checks the JSON size.
- **Ask (Q-02; moves KB NEW-01 and NEW-05 forward; W-40, G-20):**
  - "Is the field matrix v0.6 set the content you will test both MVPs with? It covers case start, metadata, Annex 1, 2 and 4.
  - Our plan is to model those 39 fields fully, and to add placeholder sections for K1-K8 and the other annexes with 1-2 representative questions each.
  - Or will both vendors receive the CIQ 2026 Word template, and the scenarios and sample materials the evaluators will use?"

### F-02 · Versioned template, maintained by the business without IT (REQ-CFG-001)

- **Need**
  - Business admins create, change, deactivate and **version** sections, questions, help texts, options, mandatory fields and evidence without development.
  - Acceptance: add "Turkey REACH" in the test environment and publish without an IT ticket, while a running case keeps the old version [BRM REQ-CFG-001].
- **Kissflow approach**
  - **Manifest-based copy-on-write.** A Template Version (Form) holds a status (Draft / Test / Approved / Published / Retired), a manifest (the list of Section Definition IDs) and a hash.
  - Editing a section creates a new Section Definition record and a new draft manifest. Unchanged sections are shared.
  - Publishing runs through a four-eyes "Config Change Request" **Process**.
  - Cases pin a manifest ID, and P1 copies the content into the case.
  - The admin console is a Custom UI page restricted to the Business Admin role.
- **Confidence:** Medium. **Delivery risk:** High. This is CIA #4 being tested literally.
- **Risk detail**
  - Form records are editable by members [MM §3.3, §3.4], so immutability is by convention.
  - The config-as-data does not travel with Kissflow's dev → prod app replication [MM §1.1; E-D-102] (inferred).
- **Mitigation**
  - A hash is computed on publish and verified on load (tamper detection).
  - Only a "Config Publisher" role can edit config forms.
  - A change log with a business reason [E-D-32, E-D-103].
  - A "test" status with test cases flagged so that no external e-mail is sent, **or** a signed config-package export and import between tenants.
- **Ask (Q-16; E-D-102 and E-D-32):**
  - "Does 'in the test environment … publishes' [BRM REQ-CFG-001] mean a separate test system, or a test mode inside production where a draft version is tried on test cases before publishing?
  - We recommend a test mode plus four-eyes publishing. Is a second approver acceptable?"

### F-03 · Nested rule engine (REQ-CFG-003)

- **Need**
  - A versioned, traceable rule set with nested if-then conditions and decision trees. Each rule is linked to SF-01…SF-12 and to the sections and evidence it triggers.
  - "SF-01 plant-based AND SF-08 palm-based" reproducibly returns A1 §5 plus RSPO evidence.
  - Existing cases keep their version [BRM REQ-CFG-003].
  - The same input and version give the same result, and the version is logged [BRM REQ-PROC-009].
- **Kissflow approach**
  - **Rules as versioned data.** A Rule Set Version and Rule rows, each with:
    - a condition tree (AND/OR groups over SF answers and component attributes)
    - outcomes: section, sub-section, evidence or department, classified M/O/N.A.
    - precedence and justification text
  - A **deterministic evaluator** (a pure JavaScript module) is shared by the supplier's live preview and by the authoritative derivation in the RMM session (H3).
  - Each run writes an immutable Scope Derivation Run: inputs, version, fired rule IDs and outcomes.
  - Native step conditions [MM §4.6] are used only for process routing.
  - Decision Tables are an optional accelerator only if the plan allows them ("403 YourPlanNotSupport" on typical plans) [MM §4.4, §15; S-11].
- **Confidence:** Medium. The evaluator is ordinary code; the semantics are not defined [E-D-01, E-D-06].
- **Delivery risk:** High.
- **Risk detail**
  - If derivation ran only in the supplier's browser, a supplier could tamper with the scope. That is why the authoritative run happens in the internal session (inferred).
  - The binding table does not exist yet (OP-19).
- **Mitigation**
  - Default semantics until BDF decides [BR-03]:
    - union across components and origins
    - mandatory > optional > N.A.
    - deactivation rules (SF-12) require a justification
    - "no rule fired" is flagged as unscoped for RMM [E-D-07]
  - A reference-material regression suite in the rule editor.
  - The condition tree is edited in a structured way, never as free-text expressions.
- **Ask (Q-03; moves KB OP-19 and R-xx forward):**
  - "To move OP-19 on, we can load the §5.4 origin table plus the KB draft rules R-00…R-120 as rule set v0.1. We would then show you the derived scope for six reference materials: vegetable + palm, petrochemical, mineral, polymer, animal, and a blend.
  - Who at BDF can sign off v1.0, and by when?
  - Unless you tell us otherwise we will use: mandatory beats optional beats N.A.; every component's origin counts (union); and 'no rule fired' goes to RMM for review."

### F-04 · Field types: repeatable tables, number + unit, upload per question (REQ-CFG-002)

- **Need**
  - Text, yes/no, single and multiple choice, number with or without unit, date, repeatable tables of any length, and file upload per question. Data must be read out in structured form [BRM REQ-CFG-002].
  - FLM adds Number (decimal), Text/Number, Checkbox+Number, Radio and Dropdown [FLM DV E2:E56].
- **Kissflow approach**
  - Renderer components per type, with typed values in the section JSON (`{v, unit}`).
  - Units come from a controlled Units list with conversion factors, never free text [E-D-41].
  - Table rows carry **stable row UUIDs**, not positions [E-D-50].
  - Uploads are rows in an Uploads child table on the Section Response item, written via `kf.client.uploadFile` and the SDK form API [MM §6.6, §3.6].
  - K2.1 components are mirrored into the internal typed Component Register at freeze points. That makes BRM's "K2.1 analysable per component" test native [BRM REQ-PROC-006].
  - Avoid the native Currency type, whose unit is pinned [MM §3.5]. Dates use `YYYY-MM-DD` [MM §3.5].
- **Confidence:** Medium. Child-table REST writes on processes "500'd unconditionally" on one tenant `[observed-once]` [MM §3.6], so the SDK route must pass S-06.
- **Delivery risk:** Medium.
- **Mitigation**
  - S-06.
  - Fallback: one Document process item per upload.
  - Deleting a component that has open points is blocked [E-D-50].
- **Ask (Q-18; FLM [Review] R10, E-D-41, E-D-50):**
  - "Which unit should suppliers report MOAH in, mg/kg or %? We propose one fixed unit per numeric question, no free-text units, and conversion of legacy values.
  - May a supplier delete or reorder components after BDF has asked a question about one of them? Our default: not while an open point references it."

### F-05 · M/O/N.A. classification, completeness and justification (REQ-PROC-009, -010, -012, -005)

- **Need**
  - Each chapter, annex and evidence item is classified mandatory, optional or N.A., showing the rule and answer that triggered it.
  - N.A. parts are hidden from the supplier but documented internally [BRM REQ-PROC-009, -010].
  - PS-05 is blocked until every item has a value or a written justification, and all blocking items are listed [BRM REQ-PROC-012, -005].
- **Kissflow approach**
  - Scope Items live in the internal derivation record.
  - **Only M and O sections are created as supplier items**, so N.A. content never exists in the supplier's scope. This is the strongest possible form of hiding.
  - The completeness gate is our validator, because there is "no conditional-required primitive" `[owner-confirmed]` [MM §4.4].
  - The validator is re-run in the first internal session (H7) as a server-side recheck.
- **Confidence:** Medium. **Delivery risk:** Medium.
- **Mitigation:** a validation summary listing every blocking field with section and field name (an acceptance criterion); unit tests per rule type.
- **Ask (Q-05; moves C-19, BR-07 and W-39 forward):**
  - "May every mandatory item be bypassed with a justification, or only items flagged 'N/A allowed'? We propose a per-question flag, off by default, with SF-12/K5.1 and K6.9 switched on.
  - Must a department explicitly accept a justification given at PS-05? We would raise it automatically as an open point."

### F-06 · Manual scope override and BDF scope check (REQ-CFG-007; ReqDoc §5.2)

- **Need**
  - Authorised departments extend the derived scope with a mandatory justification, marked as a manual override [BRM REQ-CFG-007].
  - "The department sees the derived scope and can extend or reduce it … only then is the full questionnaire released" [ReqDoc p.10 §5.2].
- **Kissflow approach**
  - A native internal Case step "Scope check" between metadata submission and release.
  - Overrides are Scope Items with origin = manual, a justification, the person and the time.
  - This step is also where the authoritative derivation runs (F-03).
- **Confidence:** High (a native step; a small amount of code). **Delivery risk:** Medium.
- **Risk detail:** who performs it is undefined, and it can become a bottleneck at the start of every case [E-P-20].
- **Mitigation:** SLA on the step [MM §4.8 `SlaBreached` trigger]; an "auto-confirm after N days" option kept switchable.
- **Ask (Q-11; C-17, C-18, W-07):**
  - "We propose that RMM confirms the derived scope within 2 working days. RMM may add sections, with a justification, but may not remove rule-derived mandatory ones. Departments add parts later through additional-part requests (REQ-ADR-002).
  - Do you really need 'reduce' (§5.2)? If so, should it need a second approver?"

### F-07 · Re-derivation with data retention (REQ-CFG-008, -009; REQ-PROC-007)

- **Need**
  - A changed configuration answer triggers a new derivation, a section difference list and a notice to the affected departments.
  - Removed answers stay in history and come back when the change is reverted [BRM REQ-CFG-008, -009].
  - Metadata stays changeable until PS-11 [BRM REQ-PROC-007].
- **Kissflow approach**
  - A new derivation run and a diff against the previous one.
  - Removed sections move their items to an "Out of scope" state: read-only, off the supplier's task list, retained. A revert brings them back.
  - **In Part 2, a re-derivation is a *proposed* scope change that RMM confirms** [BR-04 default]:
    - New mandatory sections reach the supplier as additional parts.
    - A newly concerned department gets a track.
    - A completed track reopens only if its sections changed.
- **Confidence:** Medium. **Delivery risk:** High.
- **Risk detail:** interactions with the frozen version, with open points on removed sections, and with late department activation [E-D-21, E-D-23, E-P-54].
- **Mitigation:** explicit state machine tests; RMM confirmation as a safety valve.
- **Ask (Q-06 part; builds on KB NEW-14, which REQ-CFG-009 already answers):**
  - "REQ-CFG-009 answers NEW-14 for Part 1. For Part 2 we propose: an origin change after PS-05 is a scope-change proposal confirmed by RMM; new sections go to the supplier as additional parts; a newly affected department gets a task; finished reviews reopen only if their own sections changed. Agreed?"

### F-08 · Context-linked uploads and versions (REQ-PROC-011, -016; REQ-RMES-017)

- **Need**
  - Uploaded at the triggering question and "permanently linked there". Example: a K2.2 batch certificate opens from the department's review view. An overview by chapter "should" exist [BRM REQ-PROC-011].
  - Document versions are fixed at PS-05 [BRM REQ-PROC-016].
  - The original and technical titles are both searchable [ReqDoc p.14 REQ-RMES-017].
- **Kissflow approach**
  - Uploads child table on the Section Response item, with columns: question key, row ID, attachment, version no., original title, technical title, uploaded by/at, supersedes.
  - Never deleted. Frozen when the item completes.
  - Chapter overview in the UI.
  - Internal Evidence Register at freeze, holding document-version IDs for traceability [ReqDoc p.13 REQ-RMES-005].
- **Confidence:** Medium. Copying attachments into the internal register is unproven (S-06).
- **Delivery risk:** Medium.
- **Mitigation:** S-06; the register can store a reference to the file instead of a copy.
- **Ask (Q-19; E-D-59, E-D-60, BR-14):**
  - "If one certificate answers several questions (e.g. the SDS for K1 and K6.1), should the supplier upload once and link it, or upload at each question? We propose upload once and link.
  - Should we capture the title, version or issue date, and an optional expiry date for each upload?"

### F-09 · Several supplier contacts in parallel (REQ-CTL-001)

- **Need**
  - "Two supplier users work on different sections at the same time without data loss". User and timestamp per answer and per document.
  - Supplier-side task assignment is done only by the supplier [BRM REQ-CTL-001].
- **Kissflow approach**
  - One Section Response item per section (P4), so two users on two sections never collide [MM §6.6].
  - On the same section: an optimistic check on `_modified_at` before writing, plus a soft "being edited by" marker [E-P-26].
  - Each answer carries `{by, at}` in the JSON, on top of the native item history.
  - A coordinator assigns section items to colleagues (needs S-01).
- **Confidence:** Medium. **Delivery risk:** High. This is an explicit acceptance test, and a "last writer wins" platform behaviour exists [MM §14 #83].
- **Mitigation:** S-01, S-03; a scripted two-browser concurrency test in QA.
- **Ask (Q-08; KB BD-06 is already answered by REQ-CTL-001, so move to the next decision; E-P-26, E-P-33, W-18):**
  - "Is 'different users on different sections' enough, or must two colleagues edit the same table (the component list) at the same time? We propose a section-level soft lock showing who is editing.
  - Who at the supplier may give the completeness confirmation and the final release: any contact, or only the coordinator?"

### F-10 · External supplier access and confidentiality (REQ-PROC-004; REQ-CTL-002, -006; REQ-CFG-004; REQ-RMES-015)

- **Need**
  - In PS-02 the supplier sees only basic data and configuration questions [BRM REQ-PROC-004].
  - The supplier sees only its own cases [BRM REQ-CTL-006].
  - No internal comments, assessments, findings or RMES [BRM REQ-CTL-002, REQ-CFG-004].
  - A supplier-role test confirms that "only explicitly issued questions, requests and permitted attachments are accessible" [ReqDoc p.14 REQ-RMES-015].
- **Kissflow approach**
  - (a) Internal-only flows with **no** supplier membership (P2).
  - (b) Supplier data only in participated Process items, with no report grant (P3).
  - (c) A custom UI for suppliers, with no native pages, to avoid auto-grant escalation [MM §4.7, §14 #21].
  - (d) A leak test per channel: inbox, e-mails, item history, PDF, search, AI [E-D-74].
  - Kissflow Portals ("a parallel external-facing variant" [MM §2.1]) are an option, but their isolation semantics are not in our manual.
- **Confidence:** **Low**. S-01 and S-02 are unconfirmed, and precedents used client-side filtering plus fixtures [MM §6.5, §6.7, §11.4].
- **Delivery risk:** High. A single leak can disqualify the MVP [E-D-74, E-D-77].
- **Mitigation:**
  - S-01 and S-02 on day 1, preceded by an internal product check.
  - Fallback: the mediated supplier layer (§4.1).
  - A "leaky-vs-scoped" fixture in the test suite [MM §6.7].
  - Never use the dev role switcher as a production gate [MM §6.7, §13].
- **Ask (Q-01; E-D-77 Critical, no KB overlap):**
  - "Who exactly is 'the supplier' for visibility: the distributor, the manufacturer or the group? Can one person, such as a regulatory consultant, act for several suppliers?
  - Our default: access is granted per case to named contacts only, with no group-level view in the MVP."
- **Also (Q-15, U-11):** "Is invitation-based login with MFA acceptable for suppliers, with SSO for BDF staff only?"

### F-11 · Dynamic activation of parallel department subprocesses; sync only on activated ones (REQ-PROC-017, -018; ReqDoc §3.2.1)

- **Need**
  - Exactly the affected departments get a task and a notice [BRM REQ-PROC-017].
  - They run in parallel and independently [BRM REQ-PROC-018].
  - "The synchronisation point waits only for subprocesses activated for that case" [ReqDoc p.4 §3.2.1].
- **Kissflow approach (default)**
  - One **Review Track** process item per activated department per cycle.
  - Static department roles are the native assignee model [MM §4.6].
  - Creation by a Process→Process integration on "ItemEntersToStep" [MM §4.8]:
    - every department's track is created, since integrations cannot loop or branch;
    - the activation flag is copied from the case;
    - tracks that are not activated skip their steps through a step condition.
  - Sync: the last department to complete re-reads all tracks and advances the case (H10). Its user is a member of a broad internal role assigned to the case's "BDF review" step.
  - An RMM "stuck case" tile catches the rare race where two completions see each other as still open.
  - **Alternative to test (S-04):** a native Parallel node with conditional branches, auto-joining [MM §4.6]. The sync would be perfect, but it is weak for reopening a finished department and for late activation, so it is not the default.
- **Confidence:** Medium. **Delivery risk:** High.
- **Mitigation:** S-04, S-09; idempotent creation keyed by (case, cycle, department); race tests.
- **Ask (Q-04; moves KB NEW-05, NEW-11, NEW-13 and OP-18 forward):**
  - "For the MVP we propose review tracks for Regulatory, Safety, QM, Microbiology, Sustainability and RMM, with Customs (K7) and Legal (K8) informed only, with no completion task.
  - On shared sections (OP-18), the lead department completes after the co-reviewer has commented.
  - Does that match BDF's operating model, or must Customs and Legal complete before the case can close?"

### F-12 · Open points with object references and jump targets (REQ-PROC-029, -030, -033; REQ-ADR-001, -002)

- **Need**
  - A query permanently references a chapter, field, table row, document version or finding, and cannot be sent without one. The supplier view shows a jump target [BRM REQ-PROC-029].
  - One supplier task per request, with reference, justification, responsible person and due date [BRM REQ-PROC-030; REQ-ADR-001].
  - Full chronological history at the object [BRM REQ-PROC-033].
  - Additional CIQ parts can be activated at any time [BRM REQ-ADR-002].
- **Kissflow approach**
  - Open Point **Process** with these steps:
    1. Raise (department). The reference, justification, responsible person and due date are *step-level Mandatory*, which is native [MM §4.6].
    2. Supplier response (addressed contact; S-01).
    3. Department review (department role).
    4. End (closed).
  - Reference = (type, section key, field key, row UUID, document-version ID) plus a readable label, e.g. "K2.1 › component 3 (INCI …) › CAS".
  - The jump target works inside the app router. E-mail links cannot pass parameters into the iframe [MM §6.11], so they land on the inbox.
  - Answer rounds go into a child table via the SDK [MM §3.6].
  - The finding link and internal notes sit only on internal records [E-D-75].
  - An "additional part" open point creates a Section Response item marked "subsequently activated".
- **Confidence:** Medium. **Delivery risk:** High. This is the centerpiece and depends on S-01.
- **Mitigation:** stable row IDs (F-04); separate supplier-facing wording; S-06 for the rounds child table.
- **Ask (Q-07; BR-06, E-P-41, E-P-42, W-19, W-20):**
  - "We plan three ways to close a point: accepted; withdrawn by BDF with a reason; and 'not accepted – final', which records a negative result instead of blocking the case forever.
  - May a department withdraw a query?
  - If the supplier definitively cannot provide something the department will not waive, how should the case end: rejection, approval with a deviation, or cancellation?"

### F-13 · Traffic lights (REQ-PROC-034)

- **Need**
  - Open, in progress or closed, shown as a traffic light. Set only by the responsible department.
  - Each change records person, time, result and the reviewed evidence version [BRM REQ-PROC-034].
- **Kissflow approach**
  - Derived from the system fields `_current_step` and `_status`, never from a custom Status select. A custom Status select "is never auto-set" and shows "Draft" forever [MM §3.6, §14 #66].
  - Waiting at the supplier = red; under department review = amber; completed = green.
  - Only the department role can act at the review step, which natively gives "only the responsible department sets the status".
- **Confidence:** High. **Delivery risk:** Low.
- **Ask (Q-07 part, W-20):** "Does 'in progress' mean the supplier is working on it, or BDF is reviewing the answer? We propose red = waiting for supplier, amber = answer under BDF review, green = closed."

### F-14 · Repeatable loops; all open points block completion (REQ-PROC-035, -036)

- **Need**
  - The loop repeats any number of times without losing context [BRM REQ-PROC-035].
  - Completion is refused while any point is open, and each blocker is listed with type, section, status and owner [BRM REQ-PROC-036].
- **Kissflow approach**
  - The loop is native send-back with a mandatory comment [MM §3.6, §14 #81]. Do not model reject branches.
  - The completion gate:
    - a cross-flow COUNT aggregate on the track or case, using a helper `Is_Open` number [MM §4.4]
    - plus the UI refusing completion with a list of blockers.
  - A native step cannot block a submit on a formula, so the gate is our code.
- **Confidence:** Medium (the aggregate over a Process target needs S-05). **Delivery risk:** Medium.
- **Ask (Q-07 part; C-03, W-06):** "The BRM says every open point blocks [REQ-PROC-036], while the RMES chapter allows non-blocking findings [REQ-RMES-009]. We will build a per-type 'blocking' setting, defaulting to 'all block'. Is that right for the MVP?"

### F-15 · RMES: structured criteria, findings, quantitative limit checks (REQ-RMES-002…012; REQ-PROC-021, -022)

- **Need**
  - RMES Parts A-D as configurable, versioned criteria [ReqDoc p.13 REQ-RMES-002].
  - Applicability by rule, with a reasoned override [REQ-RMES-004].
  - Source traceability in both directions [REQ-RMES-005].
  - Quantitative checks with a reproducible limit and rule-set version [REQ-RMES-008].
  - Blocking findings [REQ-RMES-009].
  - "Exactly one RMES data record" per confirmed CIQ, MVP partial [BRM REQ-PROC-021].
  - Pre-fill from the CIQ with source references [BRM REQ-PROC-022].
- **Kissflow approach**
  - An RMES Criterion Template, versioned like the questionnaire template (F-02).
  - The RMES Record and one Criterion Result **record per criterion**, so there is no Safety/Regulatory overwrite.
  - Applicability through a second rule set, using the same evaluator [E-D-31].
  - Findings as an internal Form.
  - A Limit Set Version plus a check evaluator: value, unit, comparator, LOQ handling, limit version. An exceedance raises an automatic blocking finding [BR-13].
  - Pre-fill from the frozen snapshot.
- **Confidence:** Medium. The RMES template was not shared [G-07], and the "partial scope" is undefined [C-24].
- **Delivery risk:** High.
- **Mitigation:** a thin, real slice instead of a broad mock (§11 move 6). The only shared limits are As ≤ 0.5, Cd ≤ 0.1, Cr ≤ 5.0 mg/kg [Feldkatalog r27-r29], so use them as the demo limit set.
- **Ask (Q-10; moves KB NEW-06, W-34 and G-07 forward):**
  - "For the MVP's partial RMES scope we propose a thin slice:
    - 6-8 real criteria from Parts A-D
    - one quantitative check (heavy metals or MOAH)
    - findings, and a query raised from a finding
    - the two final decisions
  - Can you share the RMES template and the current limit list? Who maintains limits once Annex 14 is gone (NEW-06)?"

### F-16 · Separate Safety and Regulatory decisions; auditable delegation (REQ-PROC-039; REQ-RMES-013, -014)

- **Need**
  - Safety and Regulatory complete independently.
  - A negative criterion needs a comment.
  - Acting for the other department needs an auditable delegation [BRM REQ-PROC-039; ReqDoc p.14 REQ-RMES-013].
- **Kissflow approach**
  - The final track step is assigned to the Safety Approver or Regulatory Approver AppRole. This is the static, native separation, so a Regulatory user cannot act on the Safety step [MM §4.6].
  - Approve, or native Reject with a mandatory comment [MM §3.6].
  - A negative-criterion comment is enforced by our UI gate (no conditional-required primitive [MM §4.4]).
  - Delegation is a record (grantor, delegate, scope, validity, reason) plus a reassignment of the task. Native reassign exists in the UI and the SDK (`reassignItem`), but REST `reassign` returns 500 [MM §3.6, §6.2].
  - "On behalf of" is stamped on the Confirmation record.
- **Confidence:** Medium (the reassign path is unverified). **Delivery risk:** Medium.
- **Ask (Q-05 part; E-D-88, E-P-91; KB NEW-03 and NEW-04 are reframed by the BRM):**
  - "We will show Safety and Regulatory each recording 'Completed – approved' or 'Completed – rejected (reason)'.
  - Who may grant a delegation (the department lead?), may it cross departments, and does it apply to one case or to a period?"

### F-17 · Freezing and versioning (REQ-PROC-016, -043)

- **Need**
  - The review version is fixed at PS-05 [BRM REQ-PROC-016]. A later resubmission creates a new version and never silently overwrites [ReqDoc p.4 §3.1.5].
  - After the final release, change attempts are "rejected and logged" [BRM REQ-PROC-043].
- **Kissflow approach**
  - Completed section items can no longer be written by the supplier. A refused write returns `050313 PermissionDeniedToUpdate` [MM §3.1].
  - A hashed internal snapshot is kept per review cycle.
  - Part 2 changes are deltas only (P5).
  - Refused change attempts are logged by our UI as Audit Events. The platform does not log them as records on its own (inferred).
  - A new review cycle creates new section items, copied from the previous cycle.
  - Caveat: an admin update route exists [MM §3.6], so "immutable" means "not writable by business users".
- **Confidence:** Medium. **Delivery risk:** Medium. The semantics are critical [E-P-36].
- **Ask (Q-06; E-P-36, E-P-53, W-08, W-09, BR-05):**
  - "We propose: review version v1 is fixed at the completeness confirmation. In Part 2 the supplier may still change data, but only through a change request reviewed by the owning department, never by silent edits. Each accepted change versions that answer or document only.
  - A new case-level version is created only on a formal resubmission or a scope change. Does that match how BDF wants to audit?"

### F-18 · Immutable audit trail (REQ-CTL-009; REQ-RMES-016)

- **Need**
  - An immutable trail covering submission, review, query, answer, release, rejection and reopening.
  - An auditor reconstructs "who assessed what, when and on which source version" [BRM REQ-CTL-009], and against which rule-set version [ReqDoc p.14 REQ-RMES-016].
- **Kissflow approach**
  - Two layers:
    1. Native item history: step moves, comments, field changes. Boards have a `…/activity` endpoint [MM §3.7]; processes have `getProgress` [MM §6.2].
    2. Business **Audit Event** records: actor, on-behalf-of, UTC time, object and version references, rule and limit versions, rationale. They are **hash-chained**: each event stores the previous event's hash, so any edit or delete is detectable (inferred design).
  - Events are written from internal sessions. Supplier actions are captured natively on supplier items and mirrored at the gates.
- **Confidence:** Medium. **Delivery risk:** High.
- **Risk detail:** our VQ answer says logs are "unalterable even by platform admins" [VQ r12]. Admin delete routes exist [MM §3.6, §14 #11]. System fields `_is_deleted`, `_deleted_at` and `_deleted_by` suggest soft delete with attribution [MM §4.10] (S-09).
- **Mitigation:** S-09; restrict delete rights; a hash-chain verifier in the auditor view.
- **Ask (Q-17; E-D-85, E-D-86, E-D-87):**
  - "Should auditors also see who *viewed* a document, or only who changed or decided something? Should configuration and permission changes be in the same trail?
  - How long must case data be kept, and may supplier contact data be anonymised later (data protection)?"

### F-19 · Notifications, reminders, escalation (REQ-CTL-010; REQ-PROC-040; REQ-RMES-019)

- **Need**
  - Notify on a new task, query, answer, resubmission or decision. Log every event at the project [BRM REQ-CTL-010].
  - **Exactly one** supplier notification, after all subprocesses, with no internal content [BRM REQ-PROC-040].
  - Configurable reminders and escalation [ReqDoc p.14 REQ-RMES-019].
- **Kissflow approach**
  - Native step-assignment e-mails. The single release notification is, by construction, the assignment e-mail of the "Final release" step.
  - Native step SLA plus the `SlaBreached` trigger to the Email connector for escalation [MM §4.8].
  - Due-date reminders on open points come from data. The Scheduler cannot iterate rows [MM §4.8], so they need our sender (a daily job in an internal session or an external scheduler).
  - A Notification Log written by our senders.
  - Native e-mail templates are reviewed for leaks (S-08).
  - Assignment e-mails for about 40 section items must be suppressed (S-08) and replaced by one digest, or the supplier receives a flood of mail at release [E-P-92].
- **Confidence:** Medium. **Delivery risk:** Medium.
- **Ask (Q-09; moves KB NEW-16 and BR-17 forward):**
  - "To close NEW-16 we propose these defaults:
    - supplier tasks: 10 working days, a reminder 2 days before and 1 day after the due date, escalation to the RMM owner at +5 days
    - internal reviews: 5 days, escalation to the department lead
  - Which of these would you change, and should the supplier see the due date (REQ-ADR-001 calls it 'internal')?"

### F-20 · Role-appropriate dashboards (REQ-CTL-006; REQ-RMES-018; CIA #21-23)

- **Need**
  - Status per section, subprocess and project, with a traceable roll-up. "RMM identifies bottlenecks without opening individual cases." The supplier sees only its own cases [BRM REQ-CTL-006].
  - RMES progress per Safety and Regulatory in seven states [ReqDoc p.14 REQ-RMES-018].
- **Kissflow approach**
  - Custom UI dashboards, because native cards are static [MM §5.1, §13].
  - Data source: admin item listings plus roll-up aggregates on the case header (sections done, open points open, tracks open).
  - If the listing is too sparse or slow at volume, add a Case Index Form maintained at each transition [MM §6.5; S-05].
- **Confidence:** Medium. **Delivery risk:** Medium.
- **Ask (Q-21 part; W-21, W-22, U-01):**
  - "Please confirm the statuses we will show: sections open / in progress / with supplier / reviewed / completed; review tracks unassigned / open / waiting for supplier / overdue / reopened / completed.
  - What may the supplier see of BDF's review progress?"

### F-21 · Automatic PDF summary, filed immutably and e-mailed (REQ-PROC-046)

- **Need**
  - Generated without user action straight after the release, versioned immutably, filed at the project and e-mailed to the RMM owner.
  - Contents: the released CIQ, the evidence list, the PS-05, PS-10 and PS-11 confirmations, and the project ID.
  - "The content … still has to be confirmed by the business" [BRM REQ-PROC-046].
- **Kissflow approach**
  - Generate **server-side**. The supplier's browser must not render a document that contains internal confirmations.
  - Primary: the native GeneratePDF action on Case ItemCompleted [MM §4.8] (S-07).
  - Fallback: an external renderer (webhook → render → attach), following the PDF-on-Lambda precedent [MM §6.15]. Draw onto a template; never flatten pdf-lib fields [MM §6.15, §14 #74].
  - A Final Document record holding the file, a SHA-256 hash and a version.
  - E-mail to RMM via the Email connector or a native notification.
- **Confidence:** **Low**. **Delivery risk:** High (a Must, and CIA #7 is tested literally).
- **Ask (Q-12; KB OP-13 is answered for the MVP by REQ-PROC-046; W-28, E-D-72):**
  - "We propose a short layout: a cover (project ID, material, supplier, versions); the scope, with N.A. reasons; the evidence list with versions; and the three confirmations.
  - Does the supplier also receive a copy? May reviewer names appear in it?"

### F-22 · Cancellation and reactivation (REQ-PROC-049; ReqDoc §3.3.3)

- **Need**
  - RMM cancels with a justification, and all open tasks end, including the supplier's [BRM REQ-PROC-049].
  - Reactivation within a defined period (assumed to be 1 year) [ReqDoc p.5 §3.3.3].
- **Kissflow approach**
  - An RMM action that cascades: withdraw or close the section items, open points and tracks, using native withdraw and admin actions.
  - The cascade is idempotent, with a completeness check that no open task remains.
  - Reactivation within the window: `restartItem` (SDK [MM §6.2], unverified), or a new review cycle carrying the data across.
- **Confidence:** Medium. **Delivery risk:** Medium (a partial cascade would leave orphan tasks).
- **Ask (Q-13; moves KB NEW-15 forward):**
  - "We will build reactivation as 'reopen the same case, same data, new review cycle', within 12 months, by RMM only.
  - Should a reactivated case restart at the scope check or resume where it stopped? Is the supplier told about a cancellation?"

### F-23 · AI-supported document review (REQ-PROC-024)

- **Need:** AI suggestions are marked as such, carry a source reference, and can be confirmed or discarded. They must never replace the reviewer [BRM REQ-PROC-024; ReqDoc p.5 §3.2.3]. MVP partial scope.
- **Kissflow approach**
  - AI Suggestion records: document version, quoted passage, claim, status, decided by/at. The data model is trivial.
  - Inference runs through an AI endpoint BDF has approved, called from the reviewer's session or an HTTP connector.
  - Kissflow's native agent features are plan-gated [MM §4.8, §15].
  - Keep it to one narrow check:
    - CoA values vs entered values;
    - the RSPO number missing on the CoA [FLM changelog r162];
    - certificate expiry.
- **Confidence:** Low (provider, data protection, plan). **Delivery risk:** Medium. It is an optional differentiator.
- **Ask (Q-20; E-D-81, BR-20):**
  - "Are there restrictions on sending supplier documents to an AI service (region, provider, opt-in)?
  - If allowed, we would show one check: the AI compares the CoA with the entered values and flags mismatches, quoting the passage; the reviewer confirms or discards."

### F-24 · Later integrations: Teamcenter, B-Flow, SAP MDG

- **Need**
  - Out of scope for 2026 (OP-13) [ReqDoc p.2 §1.1].
  - Yet PS-13 files to B-Flow and reports status [ReqDoc p.5 §3.3.3].
  - CIA Must Haves: #1, #12, #15, #18, #32.
- **Kissflow approach**
  - Webhook, HTTP and Scheduler connectors plus process actions [MM §4.8]:
    - Teamcenter webhook → CreateAndSubmitItem;
    - ItemCompleted → HTTP status call-out;
    - B-Flow via HTTP or middleware (file transfer unproven).
  - Constraints [MM §4.8]:
    - 1 trigger and at least 1 action;
    - no field-change trigger, no arithmetic, no loops;
    - a human must activate it;
    - an integration cannot be deleted via the API.
  - **Design the keys now:** external material/IRMA ID, B-Flow document ID and idempotency keys [E-D-104, E-D-105].
- **Confidence:** Medium. **Delivery risk:** Low for the MVP, Medium for promise exposure.
- **Ask (Q-14; KB OP-13):**
  - "OP-13 is answered for the MVP by REQ-PROC-046 (PDF at the project plus e-mail).
  - Given your Must Haves #1 and #18, do you still want one integration mechanic in the MVP? We suggest a case started by a simulated Teamcenter call and a status call-out at completion, with no real systems."

### F-25 · Case creation, unique ID, supplier master (REQ-PROC-001; FLM r2-r9)

- **Need**
  - RMM creates the case with supplier, trade name, contact and BDF owner. It gets a unique ID and an audit entry, and missing data blocks creation [BRM REQ-PROC-001].
  - Several fields are "pre-filled from supplier master data" [FLM r4, r7-r9].
- **Kissflow approach**
  - The Case Process with step-level Mandatory fields at the start step.
  - Supplier, Contact, Site and Material master Forms.
  - Avoid relying on SequenceNumber, which "500s at item create" on some tenants [MM §4.4, §14 #59] (S-12). Use an app-generated ID with a collision check if needed.
  - A duplicate warning on supplier + material + site [E-P-01].
  - Never author a field called `Name` [MM §2.3].
- **Confidence:** High. **Delivery risk:** Low.
- **Ask (Q-22 part; KB BD-04 and OP-17):**
  - "Should the case carry a BDF material number or IRMA reference (BD-04)?
  - In the MVP, RMM keeps supplier master records by hand, because Teamcenter is post-MVP. Agreed?"

### F-26 · Exactly one responsible person per task; reassignment (REQ-CTL-003)

- **Need:** "Exactly one named responsible person or role" per task. "No task without a responsible person" [BRM REQ-CTL-003].
- **Kissflow approach**
  - The native task is owned by the department role (static) [MM §4.6].
  - The named owner is an `Assigned_Reviewer` User field, set by the team lead or by claiming the task.
  - Reassignment uses native reassign plus a Delegation or reassignment log.
  - Process membership implies InitiateItems, so the "+ New" button is hidden in the UI [MM §3.4, §14 #20].
- **Confidence:** Medium. **Delivery risk:** Medium.
- **Ask (W-17, E-P-91):** "When a review reaches a department, is it routed to a named reviewer automatically (e.g. by material group) or picked by a team lead? We propose team-lead assignment with a deputy per reviewer."

### F-27 · Internal communication area (REQ-PROC-020)

- **Need:** an internal-only area linked to a case, section or finding, never visible to the supplier [BRM REQ-PROC-020] ("should", orange fill).
- **Kissflow approach:** an Internal Note Form in an internal-only flow. It is physically separate from the supplier Q&A, with no "move to supplier" action [E-D-76].
- **Confidence:** High. **Delivery risk:** Low.
- **Ask (E-D-76):** "Is the internal discussion area a must for the MVP? We would include it as notes on a case, section or finding."

### F-28 · Three confirmations: name, role, e-mail and time (REQ-PROC-014, -015, -042)

- **Need:** the three confirmation types must stay distinguishable in the project and in the closing document. None of them is a BDF raw-material approval [BRM REQ-PROC-015].
- **Kissflow approach**
  - A native step submit (identity and time), plus an immutable Confirmation record holding the **versioned confirmation text** (a text module, CIA #5).
  - The name comes from the user profile. The FLM has no contact-name field [FLM changelog r20].
  - The confirmation is a click, not an e-signature [BR-21].
- **Confidence:** High. **Delivery risk:** Low.
- **Ask (W-29, W-30):** "We would label them 'Completeness confirmation', 'Review completed' and 'Final release'. Is a logged click enough, or do you need an e-signature?"

### F-29 · End of process: supplier release vs BDF overall approval (ReqDoc PS-11/PS-12 vs BRM REQ-PROC-042, -045)

- **Need**
  - The two documents end differently [C-01, E-P-61].
  - The ReqDoc ends with an overall approval by a role "to be decided" [ReqDoc p.3].
  - The BRM ends with the supplier's release followed by automatic completion [BRM REQ-PROC-042, -045].
- **Kissflow approach**
  - Build the BRM ending.
  - Add an **"Overall approval" step after the final release, controlled by a step condition** [MM §4.6]. BDF can then switch it on per configuration without a rebuild.
  - Rejection uses native Reject with a mandatory comment [MM §3.6].
- **Confidence:** High (native). **Delivery risk:** Medium. The risk is a late business decision, not the platform.
- **Ask (Q-05; moves KB NEW-03 and NEW-04 forward):**
  - "The two documents end differently. We will show the matrix ending, plus a BDF overall-approval step you can switch on.
  - If it is used, who holds it?
  - If one department rejects, do the others continue? Is the case rejected as a whole? Can the supplier fix the issue and resubmit within the same case?"

---

## 7. Top delivery risks, ranked

| Rank | Risk | Capability | Why it ranks here | First action |
|---|---|---|---|---|
| 1 | Supplier isolation depends on unconfirmed assignee and visibility behaviour | F-10, F-09, F-12 | A leak or a cross-supplier view is disqualifying, and it shapes every supplier-facing flow | Internal product check + S-01 and S-02 on day 1; decide on the fallback on day 2 |
| 2 | Business-maintained versioned template and rule engine are custom code over config data | F-01, F-02, F-03 | Literal BRM tests (REQ-CFG-001, -003) and our CIA #2 and #4 claims; the largest build | Build the evaluator and editor first, with a reference-case regression |
| 3 | Sync point across a variable set of departments | F-11 | Native fan-out works, but the join is orchestrated (race windows) | S-04, then race tests and a stuck-case tile |
| 4 | PDF of a dynamically scoped CIQ | F-21 | Must Have; GeneratePDF unproven | S-07 by day 3; external renderer as the fallback |
| 5 | Audit claims vs platform reality | F-18, F-17 | VQ r12 "unalterable even by admins" vs admin delete; BDF auditors will probe | S-09; hash chain; reframe the wording before call 2 |
| 6 | Undefined business semantics (ending, rejection, Part 2 edits, rule precedence) | F-29, F-07, F-17, F-03 | A wrong guess means a rebuild [BR-01…BR-05] | Q-01…Q-07 on call 1; defaults are built switchable |
| 7 | Notification flood and leaks via native e-mails | F-19, F-10 | About 40 section items × assignment e-mails; internal content in templates | S-08; a single digest sender |

---

## 8. Promise audit (our submitted screening answers)

**Actions**
- **Prove in MVP:** the claim will be tested, so build and demo it.
- **Clarify scope:** ask BDF whether it is expected in the MVP.
- **Reframe:** correct or narrow the wording in call 2 or the MVP narrative, before BDF tests the claim literally.

### 8.1 Functional catalogue (CIA #1-#34)

| Ref | What we claimed (faithful summary) | Reality check for the MVP | Action |
|---|---|---|---|
| CIA #1 | REST and webhooks receive Teamcenter triggers and launch IRMA/RMT "without manual intervention" | Mechanically feasible: Webhook trigger → CreateAndSubmitItem, but a human must activate it [MM §4.8]. The MVP starts manually [BRM REQ-PROC-001]; integrations are out of scope for 2026 [ReqDoc p.2 §1.1]. No Teamcenter connector is named [VQ r15]. "RMT" is undefined | **Clarify scope** (Q-14); optionally prove with a mocked webhook start (~0.5 day, inferred) |
| CIA #2 | "Natively supports complex if-then logic"; steps activated, skipped or blocked | Step conditions are native but authored in the builder [MM §4.6]. A business-maintained, versioned, nested rule set is not native (Decision Tables are plan-gated) [MM §4.4, §15] | **Prove in MVP** (F-03, SF-01 AND SF-08 test) + **Reframe**: "conditional routing is native; the business rule set is versioned configuration with a test harness" |
| CIA #3 | Flexible, dynamic assignment by role, department or individual; synchronised via SSO | Step owners are static AppRoles. Per-record individual assignment is UNCONFIRMED [MM §4.6; S-01]. Role-membership API is flaky (~1 in 15) [MM §3.2]. SSO group-to-role sync (SCIM) is not evidenced [VQ r14] | **Reframe**: departments as roles, named owner as data. **Clarify**: SSO role sync is not in the MVP |
| CIA #4 | Business departments build and adapt questionnaires "independently" by drag-and-drop; "no coding or IT effort" | The native form builder is a builder activity and changes live items with no version pinning (inferred) [MM §3.3, §4.2]. REQ-CFG-001 requires versioning and pinning. The deliverable is a configuration console over data | **Prove in MVP** (Turkey REACH published by a business admin; a running case stays on v1) + **Reframe**: "no-code for the business through a configuration console" |
| CIA #5 | Text and document fields; PDFs generated after approval and "emailed to relevant suppliers"; text modules not addressed | GeneratePDF exists but is unproven for dynamic scope [MM §4.8]. The BRM e-mails the PDF to RMM, not to suppliers [BRM REQ-PROC-046]. Text modules are deliverable as versioned Text Module config | **Prove in MVP** (versioned confirmation texts, F-28) + **Reframe** recipients |
| CIA #6 | Several supplier contacts contribute; read-only, editable or hidden per section or stage; sequential or parallel | Field permissions are per *step*, not per user within a step [MM §4.6]. Last writer wins on one instance [MM §14 #83]. Achievable with per-section items (F-09) | **Prove in MVP**: two users, two sections, at the same time, with per-answer attribution |
| CIA #7 | "PDF template management"; PDFs generated from request data and shared | Template features and dynamic scope are unproven (S-07). Immutability needs a hash and a Final Document record | **Prove in MVP** (F-21); fallback renderer ready |
| CIA #8 | Native attachments in sections, "automatically bound to the subprocess context" | Attachments are native. Question-level links and versions are our design (F-08) | **Prove in MVP**: K2.2 certificate opened from the Safety review; v1 → v2 |
| CIA #9 | Every action logged; "complete, immutable audit trail"; live status dashboard | Native item history exists. Source-version and rule-version links are not native [E-D-85]. Admin delete routes exist [MM §3.6]. Dashboards are custom UI | **Prove in MVP** (auditor reconstruction) + **Reframe** "immutable" as "tamper-evident, hash-chained business audit plus platform history" |
| CIA #10 | Users and suppliers "comment, tag each other, and exchange Q&A" in context; "easily align" with the ping-pong | Comments are not object-referenced open points with owner-only status, traffic lights, blocking and an internal-only channel [BRM REQ-PROC-029…036, -020] | **Prove in MVP** as the centerpiece (F-12) + **Reframe**: "a query-management module, not comments" |
| CIA #11 | Subprocess approvals restricted to authorised BDF personnel; immutable audit | Static role step owners are a strong native fit [MM §4.6]. The BRM reframes this as "completion, not approval" [BRM REQ-PROC-038] | **Prove in MVP** (Regulatory cannot complete Safety; delegation logged) + align the wording |
| CIA #12 | "Seamlessly integrates" with B-Flow; event-driven REST transfer. Manual upload and rename not addressed | Out of scope for 2026 [ReqDoc p.2]. HTTP connector exists [MM §4.8]; file transfer is unproven; no B-Flow connector [VQ r15] | **Clarify scope** (KB OP-13) + **Reframe**: "via REST/HTTP in the integration phase"; answer the rename gap |
| CIA #13 | Centralised aggregated dashboard across subprocesses | Native cards are static [MM §5.1]. A custom UI with a derived status is needed [BRM REQ-CTL-006] | **Prove in MVP** (F-20) |
| CIA #14 | Multi-stage final approval; automatic consolidation of all subprocesses into a final document | The BRM has no BDF final approval [BRM REQ-PROC-042, -045]; the ReqDoc does [PS-12] | **Reframe** + **Clarify** (Q-05); build a switchable gate (F-29) |
| CIA #15 | Automated archiving into B-Flow "immediately upon final approval" | Deferred; filed at the project in the MVP [BRM REQ-PROC-046] | **Clarify scope**; **Reframe** as a roadmap, with B-Flow ID keys designed now |
| CIA #16 | A "no-code notification engine" for process owners: alerts, SLAs, "without any vendor or IT intervention" | Step e-mails and SLAs are configured in the builder (an admin activity). E-mail "To" mapping is done in the builder [MM §4.8]. Data-driven reminders need our sender (F-19) | **Reframe**: "configurable by the app admin; recipients and durations from a configuration table" + **Prove** one configurable reminder rule |
| CIA #17 | E-mail routed to recipients, roles and persons | Native; the risk is internal content in templates [E-D-74] | **Prove in MVP** with supplier-safe templates (S-08) |
| CIA #18 | Outbound webhook/API updates Teamcenter "instantly" on final approval | Feasible on ItemCompleted via HTTP [MM §4.8]; the Teamcenter API is unknown | **Clarify scope** + optional mocked call-out (Q-14) |
| CIA #19 | "Comprehensive, no-code authorization matrix": Read/Write/Customize per process area for BDF and suppliers, no IT | Grants are per flow (Member/Viewer/Admin); field permissions per step; no read-only process membership; scope is not row security [MM §3.4, §4.6, §4.7]. Changing grants is an admin activity | **Prove in MVP** (supplier-role leak test; Regulatory reads but cannot edit Safety) + **Reframe**: "configured by the app admin without code"; define "Customize" |
| CIA #20 | SAML v2 with Azure AD, Okta, OneLogin | The VQ lists Okta, OneLogin, Google and O365, not Azure AD by name [VQ r16] | **Clarify**: confirm Entra ID SAML; align the two answers before call 2 |
| CIA #21 | Supplier projects dashboard "specifically filtered by supplier" | Custom UI; the supplier side depends on S-02 | **Prove in MVP** |
| CIA #22 | Personal workload dashboards | Native My Tasks plus custom UI | **Prove** (light) |
| CIA #23 | Status control highlighting "critical bottlenecks … SLA breaches" | Custom UI; SLA data from native SLA or due dates | **Prove in MVP**: RMM spots a bottleneck without opening cases |
| CIA #24 | Central supplier contact database with "compliance history" (Nice) | Master Forms are easy; contact data falls under GDPR [E-D-86] | **Prove** (light): the master feeds case creation |
| CIA #25 | No-code role management for KAM and QM (Nice) | Supplier-side roles belong in data, not in per-supplier AppRoles (static assignment) [MM §4.6] | **Reframe**: supplier roles as contact attributes |
| CIA #26 | A "dedicated External Portal"; "unique role structures … for each supplier" | Portals exist [MM §2.1], but per-supplier row isolation is UNCONFIRMED (S-01, S-02). Per-supplier AppRoles do not scale | **Prove in MVP** (two suppliers, zero cross-visibility) + **Reframe** "role structures" as data |
| CIA #27 | Distinct person-to-role assignment for BDF and suppliers | Internal: AppRole membership (admin activity) [MM §3.2]. Suppliers: contacts as data plus invitations | **Prove** (light) |
| CIA #28 | Multi-level supplier structures; "successfully configured … for global enterprise clients" (Nice) | Parent references on Forms are easy. The FLM keeps one site [FLM changelog r25]. The reference may be asked for | **Clarify**: have a nameable reference ready |
| CIA #29 | Extend structures "without impacting ongoing workflows" (Nice) | Forms are editable after publish [MM §3.3] | No action (low) |
| CIA #30 | Site qualification "can be fully configured" (Nice) | Not in the BRM | **Clarify scope** (out of MVP) |
| CIA #31 | Multi-level site approval routed by location, risk or business unit (Must) | Conditional steps on static roles are native [MM §4.6]. Absent from the BRM | **Clarify scope** (KB-adjacent: OP-17, C-14) |
| CIA #32 | "Robust" bi-directional integration with Teamcenter, B-Flow and SAP | Generic connectors with documented limits [MM §4.8]; no named Teamcenter or B-Flow connector [VQ r15] | **Reframe**: REST/middleware pattern, limits stated internally + **Clarify** |
| CIA #33 | AI-assisted integration configuration; "test and rerun failed integration runs" | The AI skeleton endpoint only picks a trigger and an action and persists nothing; the agent resolver is plan-gated [MM §4.8]. Re-run is unverified | **Reframe**; verify before any demo |
| CIA #34 | We provide the framework to embed guides and videos; "content tailored by the customer" | BDF asked the **vendor** to provide the guide, video and FAQ (Must) | **Prove in MVP**: deliver a supplier quick-start guide, FAQ and a 3-minute video (toolchain exists [MM §10.4]) |

### 8.2 Non-functional questionnaire (VQ): commitments and admissions to manage

| Ref | What we claimed | Reality check | Action |
|---|---|---|---|
| VQ r12 | Logs "unalterable even by platform admins"; request- and process-level audit | Admin delete routes exist [MM §3.6, §14 #11]; soft-delete attribution suggested by `_deleted_by` [MM §4.10] | **Reframe** before BDF probes it; verify with S-09 |
| VQ r9 | Out-of-the-box reports created automatically per workflow; no-code reports | Native reports exist, but the role dashboards BDF needs are custom UI [MM §5.1] | **Reframe**: native reports for analysts, custom dashboards for roles |
| VQ r10 | AI in every module, Smart OCR, NLP integration | Plan-gated and provider-dependent [MM §15]; the AI provider is missing from the subprocessor list [VQ r24] | **Clarify** (Q-20); one narrow, governed demo |
| VQ r11 | Power BI through the Snowflake add-on | Extra cost; BRM analysability is met in the MVP by internal typed registers [BRM REQ-PROC-006] | **Clarify** commercials internally |
| VQ r13 | Exit: JSON + ZIP export; deletion within 30 / 90 days | Fine. Make sure exports include attachments and our config-as-data | No action; check internally |
| VQ r14, r16 | Integrations incl. SSO; SAML with Okta and OneLogin, Google, O365. SCIM and external-user authentication not answered | Supplier authentication must be defined for the MVP (invitation + MFA?) | **Clarify** (Q-15); align with CIA #20 |
| VQ r17, r20, r24 | "Primarily GCP" vs "AWS and GCP"; EU residency "upon request for Enterprise" | Inconsistent; a German client will ask | **Reframe**: one consistent hosting statement before call 2 |
| VQ r18 | "Thousands of concurrent users … millions of transactions" | No figures. Our design creates about 40 section items plus open points per case | **Clarify** volumes (Q-21); size licences and performance |
| VQ r21 | RBAC and data isolation; role inheritance, document-level controls and admin safeguards not addressed | The MVP must prove separation by flow (F-10) | **Prove in MVP** |
| VQ r22 | RPO 24 h, RTO 48 h, contractual | Up to one day of supplier input could be lost (inferred) | No action now; consider autosave and draft UX |
| VQ r23 | **Admission:** no native retention policies or legal hold | B-Flow is out of scope for 2026, so the app is the system of record [ReqDoc p.2] | **Reframe**: in-app retention fields and a manual export procedure until B-Flow; ask for the retention period (Q-17) |
| VQ r25 | 3-month hypercare | Fine | No action |
| VQ r26 | "1/5th of the time"; "months … within a few weeks" | The MVP bake-off will measure this | **Prove** with a disciplined plan (§10) |
| VQ r27 | 4-week configuration phase; BDF SMEs at 20-25 % | The MVP is 26-33 builder-days (inferred, [MM §17]). It fits 4 weeks only with two builders and BDF SME time for OP-19 | **Clarify** the timeline (G-20) and staff two builders |
| VQ r28 | Isolated sandbox and process simulator | Config-as-data does not travel with app promotion (inferred) [E-D-102] | **Prove**: config package export/import or test mode (F-02) |
| VQ r29 | 24/5 support; regional partners for language | No German support committed | **Clarify** commercials internally |
| VQ r32 | Per user per month (Regular/Lite); not per supplier | How external supplier contacts are licensed is undefined and commercially material (S-11) | **Clarify internally** before call 2 |
| VQ r34 | 99 % uptime | About 7.2 h per month allowed | No action |

### 8.3 Fix before call 2 (internal)

1. Align the SSO statements (CIA #20 vs VQ r16) and the hosting statements (VQ r17 vs r20/r24).
2. Prepare the reframed wording for CIA #2, #4, #9, #10, #16 and #19, and for VQ r12.
3. Decide internally how supplier contacts are licensed (VQ r32).
4. Have one supplier-collaboration reference ready (CIA #28; VQ r6).

---

## 9. Questions that de-risk the build (ranked; for the consultant)

KB IDs are cited where our question overlaps the Knowledge Baseline. Each question offers a default so the decision can move forward on the call.

**Call 1 (business)**

| Q | De-risks | Overlap | Question (with options or default) |
|---|---|---|---|
| Q-01 | F-10 | E-D-77 (no KB) | Who exactly is "the supplier" for visibility: distributor, manufacturer or group? Can one person act for several suppliers? Default: per-case access for named contacts only |
| Q-02 | F-01, F-02 | KB NEW-01, NEW-05; W-40; G-20 | Is the FLM v0.6 field set the test content? How will the two MVPs be tested and scored (scenarios, sample materials, users, dates)? |
| Q-03 | F-03 | KB OP-19, R-xx | We load §5.4 plus R-00…R-120 as v0.1 and show six reference materials. Who signs off v1.0, and by when? Default semantics: union; mandatory > optional > N.A.; unscoped goes to RMM |
| Q-04 | F-11 | KB NEW-05, NEW-11, NEW-13, OP-18 | Tracks for Regulatory, Safety, QM, Microbiology, Sustainability and RMM; Customs and Legal informed only; shared sections: the lead completes after the co-reviewer comments. Correct? |
| Q-05 | F-29, F-16, F-05 | KB NEW-03, NEW-04; C-01 | The MVP shows the matrix ending plus a switchable BDF overall approval. Who would hold it? What does one department's rejection do to the case? |
| Q-06 | F-17, F-07 | E-P-36, E-P-53; builds on KB NEW-14 | In Part 2, the supplier changes data only through change requests reviewed by the owning department; versions per answer; a new case version only on resubmission. Agreed? |
| Q-07 | F-12, F-13, F-14 | BR-06, E-P-41, W-20 | Close outcomes: accepted, withdrawn, "not accepted – final". Traffic light: red, amber, green. All points block by default. Agreed? |
| Q-08 | F-09 | KB BD-06 (answered by REQ-CTL-001) | Same-section editing at the same time, or different sections only? Who at the supplier may confirm and release? |
| Q-09 | F-19 | KB NEW-16 | Defaults: 10 working days, reminder at -2 and +1 days, escalation to RMM at +5. Is the due date visible to the supplier? |
| Q-10 | F-15 | KB NEW-06; W-34; G-07 | RMES thin slice (6-8 criteria, one limit check, findings, two decisions). Can you share the RMES template and limits, and who owns the limits? |
| Q-11 | F-06 | C-17, C-18; W-07 | RMM confirms the scope within 2 days; extend only. Is "reduce" needed? |
| Q-12 | F-21 | KB OP-13 (answered for the MVP); W-28 | PDF layout proposal. Does the supplier get a copy? May reviewer names appear? |
| Q-13 | F-22 | KB NEW-15 | Reactivation = same case, new cycle, within 12 months, by RMM. Restart at the scope check or resume? |
| Q-14 | F-24 | KB OP-13; CIA #1, #18 | Show a mocked Teamcenter start and a status call-out, or no integration at all in the MVP? |

**Call 2 (light technical)**

| Q | De-risks | Overlap | Question |
|---|---|---|---|
| Q-15 | F-10 | U-11; E-D-82 | Suppliers: invitation-based login with MFA, no supplier SSO. BDF staff: Entra ID SAML. Acceptable? |
| Q-16 | F-02 | E-D-102, E-D-32 | Test mode inside production with four-eyes publishing, or a separate test tenant with config promotion? |
| Q-17 | F-18 | E-D-85, E-D-86, E-D-87; VQ r23 | Audit scope (views or not; config changes); retention period; anonymising supplier contacts |
| Q-18 | F-04 | E-D-41, E-D-50; FLM [Review] R10 | MOAH unit; one fixed unit per question; component deletion rule |
| Q-19 | F-08 | E-D-59, E-D-60; BR-14 | Upload once and link to several questions? Document title, version and expiry metadata? |
| Q-20 | F-23 | E-D-81; BR-20 | AI restrictions (provider, region, opt-in); one narrow check in the MVP? |
| Q-21 | F-20 | U-01; W-21, W-22 | Volumes: suppliers, contacts per supplier, cases per year, concurrent cases. Status vocabulary and the supplier's view of progress |
| Q-22 | F-01, F-25 | BR-18; U-10; KB BD-04 | Languages for suppliers and staff? A BDF material number / IRMA reference on the case? |

---

## 10. Effort and sequencing (inferred, calibrated on [MM §17])

| Work package | Builder-days |
|---|---|
| Spikes S-01…S-12 plus internal product check | 2-3 |
| Backend: about 30 flows, 14 roles, lists, 2-3 integrations, grants, members, re-grant pass [MM §4.11, §16 R1] | 3-4 |
| Custom UI shell, role gating, harness [MM §6, §9.2] | 2 |
| Supplier portal, questionnaire renderer, completeness evaluator | 4-5 |
| Admin console: template versions, rule editor, regression runner, publishing | 3-4 |
| Internal workspace: scope check, review tracks, open points, RMES slice, findings, limits | 4-5 |
| Dashboards (RMM, department, supplier, RMES) | 1.5-2 |
| PDF, notification sender, audit hash chain | 1.5-2 |
| Deterministic synthetic seed materials [MM §8.1] | 1 |
| QA: role × page sweep, supplier leak test per channel, the 32 BRM scenarios scripted [MM §9] | 3-4 |
| Supplier guide, FAQ, 3-minute video (CIA #34) [MM §10.4] | 1 |
| **Total** | **26-33** |

**Calendar.** About 5.5-6.5 weeks for one builder, or about 3-3.5 weeks with two builders working on parallel UI streams after the backend lands.

**BDF dependencies:**
- the rule table v1.0 (OP-19)
- the RMES template and limits (G-07, G-09)
- the test scope (G-20)

The manual's warning applies: design dominates, apply is minutes [MM §17]. Build on a dedicated demo tenant, because integrations and published apps cannot be deleted via the API [MM §4.8, §3.9].

**Sequence**
1. Spikes and the architecture decision (days 1-3).
2. Config model and rule evaluator, with a regression suite.
3. Case, section and open-point backbone, plus the supplier renderer.
4. Review tracks, RMES slice and gates.
5. Dashboards, PDF and audit.
6. Seed data and guided scenarios.
7. QA, including the leak tests.

---

## 11. MVP winning strategy - 7 design moves

1. **"Change it live, prove nothing broke."**
   - A configuration console with versioned templates and rule sets, four-eyes publishing, and a **regression runner** over reference materials.
   - Demo:
     - A business admin adds "Turkey REACH" with a mandatory field and an upload, and edits the palm rule.
     - The runner shows the scope diff for six materials.
     - v2 is published. A running case visibly stays on v1, while a new case gets v2.
   - Executes BRM scenarios 1, 3, 11 and 12 [BRM REQ-CFG-001, -003; REQ-PROC-009, -010] and backs CIA #2 and #4 with evidence.
   - (inferred) A competitor that configures native forms will change live forms.
2. **Explainable scope.**
   - Every section shows M/O/N.A. with the rule ID that fired, the answer that fired it, and the rule-set version.
   - N.A. sections stay visible internally with their reason.
   - Manual extensions carry a justification.
   - Re-derivation shows a diff list, and reverting a change restores the data [BRM REQ-PROC-009, -010; REQ-CFG-007, -008, -009].
   - Auditors and RMM see *why* a material needs an annex.
3. **Separation you can test.**
   - Two competing synthetic suppliers in the demo.
   - A one-click "supplier-role leak test" checklist that walks inbox, e-mails, item history, PDF and search.
   - Internal data lives physically in flows the supplier has no membership on [BRM REQ-CTL-002, -006; ReqDoc p.14 REQ-RMES-015; E-D-74, E-D-77].
   - This turns CIA #19 and #26 from words into evidence.
4. **The query engine is the hero.**
   - A query on "K2.1 › component 3 › CAS" through stable row IDs.
   - The supplier inbox shows one task per request with a jump target.
   - Native send-back loop with chronological history; traffic light only the owner can move; completion refused with a named list of blockers [BRM REQ-PROC-029…036; REQ-ADR-001, -002].
   - Show the reviewer and the supplier side by side by switching role. Per the manual, showing "who it went to and what they now see" is "the single most convincing moment of a Kissflow demo" [MM §7.6].
5. **Every decision carries its evidence version.**
   - An auditor view answering "What did Safety assess?": decision → answer and document versions → rule-set and limit-set versions.
   - A hash-chained business audit with a built-in verifier.
   - Part 2 changes are only reviewed deltas on a frozen base [BRM REQ-CTL-009, REQ-PROC-016, -034; ReqDoc p.13-14 REQ-RMES-005, -016].
6. **An RMES thin slice with one hard number.**
   - 6-8 criteria.
   - One quantitative check with controlled units and a pinned limit-set version (heavy metals As/Cd/Cr [Feldkatalog r27-r29] or MOAH), raising an automatic blocking finding.
   - Finding → query with supplier-safe wording.
   - Separate Safety and Regulatory final decisions, with a delegation log [ReqDoc p.13-14 REQ-RMES-002…014; BRM REQ-PROC-039].
   - Real depth in an "MVP partial" area beats a placeholder (inferred).
7. **A model-agnostic ending, with BDF's own scripts as the demo.**
   - Build the BRM ending (supplier final release, automatic completion, PDF to RMM) plus a **switchable** BDF overall-approval step. Whichever answer BDF gives to C-01, nothing needs rebuilding.
   - Ship a guided "Run BDF scenario" mode that runs the 32 BRM acceptance scenarios on deterministic synthetic materials [source 02 §D; MM §7.6, §8.1].
   - Hand over the supplier guide, FAQ and video BDF asked the vendor to provide [CIA #34].

---

## 12. Scope guard and build hygiene

**Out of the MVP unless BDF insists:**
- real Teamcenter, B-Flow and SAP integrations (OP-13)
- the own-document supplier process (KB NEW-12)
- production-site qualification and approval (CIA #30, #31)
- retention automation
- supplier SSO
- full CIQ content beyond the test scope (placeholders instead)
- AI beyond one narrow check

**Hygiene rules from the manual that bite on this build:**

- **Naming**
  - Prefix every flow, list and field (`CIQ_`) to avoid account-wide collisions on Status, Type and Country [MM §2.3, §14 #4-#6].
  - Never author a field called `Name` [MM §2.3].
  - Spell the type `Textarea`, not `TextArea` [MM §3.3].
- **Workflow authoring**
  - Make approver fields ReadOnly at the StartEvent [MM §4.6, §14 #53].
  - Add a terminal End marker [MM §4.6].
  - Add per-step permissions for fields added after the workflow was built [MM §3.3, §14 #56].
- **Data writes**
  - Create dataform records sequentially [MM §3.5].
  - Derive state from `_current_step` [MM §3.6].
  - Read back every write; a 200 is not proof [MM §0.2].
- **Roles and grants**
  - Verify role members by GET [MM §3.2].
  - Finish with a re-grant pass [MM §3.4].
  - Test as ordinary non-admin roles and as real assignees [MM §13].
- **Data:** synthetic seed data only, with no real supplier data [MM §0.2 #9, §8.1].
