# Design B: configuration as data, with a custom UI

### Kissflow data model for the CIQ MVP, internal application plus supplier portal

> **Status.** Plan only. Nothing is built yet. Written 2026-10-06, after call 1. Waiting for access keys and the app ids of both containers.
> **Angle.** Analysis 07 recommends a thin native backbone: case lifecycle, tasks, roles and grants. Everything business admins change is versioned data, and a Kissflow custom UI renders the dynamic questionnaire. This file turns that recommendation into concrete flows, fields, lists, steps, roles, grants, spikes and an estimate.
> **Citations.** `MM §x` is the builder manual `~/Downloads/master.md`. `REQ-…` are BDF requirement IDs: the BRM has 51 requirements, ReqDoc §7 has REQ-RMES-001…020. `F-xx`, `S-xx` and `Q-xx` come from `context/analysis/07`. Prototype code is cited as `proto:<file>`.
> **Evidence tags.** **[MM-verified]** means a behaviour MM records as verified live or owner-confirmed. **[MM-inference]** means MM marks it as inference or observed once. **UNVERIFIED** means MM does not cover it; every such item has a spike in §13. **Everything about portals beyond MM §2.1 ("Portals are a parallel external-facing variant") and MM §3.3 (`GET /flow/2/{acc}/portal/{app}/flow` works for portal and application containers) is UNVERIFIED.**

---

## 0. Summary

**One sentence.** The supplier portal holds only three supplier-facing Process flows, with supplier-safe fields only. The internal app holds everything else: versioned configuration, masters, the typed answer ledger, review tracks, RMES, findings, confirmations and a hash-chained audit. The questionnaire is never a native form. At scope release it is generated into the case from a pinned configuration release.

| Decision | Choice | Why (source) |
|---|---|---|
| Where config lives | 13 app Forms plus 1 approval Process, under one header pattern (`CIQ Config Version`) and one pinnable bundle (`CIQ Config Release`) | REQ-CFG-001/-003/-006, REQ-RMES-002/-008. Native fields change live for every item, with no version pinning [MM §3.3, §4.2] |
| How a case gets its questionnaire | The released section definitions are **copied into each case's section items** (`Section Def JSON`). The supplier never reads config flows | "Generated, not selected" (REQ-PROC-009). Running cases keep their version (REQ-CFG-001). 07 principle P1 |
| Where answers live | Working copy: `Answers JSON` on the portal item `CIQ Section Response`, one item per case × section × cycle. **System of record:** the append-only typed ledger `CIQ Answer`, one row per field × table row × revision, plus the typed registers `CIQ Component` and `CIQ Evidence` (app) | REQ-PROC-006/-016/-043, REQ-RMES-005/-016. One person's work per record [MM §6.6, §14 #83] |
| Supplier isolation | (1) Internal content lives in the **app container**, where suppliers have no membership at all. (2) Supplier data lives in portal **Process items the supplier participates in**, with no report grant. (3) No native pages for suppliers | REQ-CTL-002/-006, REQ-RMES-015. Grants are per flow and `scope` is not row security [MM §3.4, §4.7] |
| Dynamic departments | One `CIQ Review Track` Process item per active department × cycle (app). Each step is owned by a static department role. Sync runs through the case read model | REQ-PROC-017/-018. No dynamic per-record assignee [MM §4.6] |
| Rule engine | Rules stored as versioned rows (`CIQ Rule`, with a condition JSON) and run by one deterministic evaluator shared by both UIs. The authoritative run happens in an internal session | REQ-CFG-003, REQ-PROC-009. Decision Tables are plan-gated [MM §4.4, §15] |
| Custom UI | One codebase, two builds: a portal build (supplier) and an internal build (BDF). Shared `domain` package taken from `proto:src/domain` | MM §6.1, §6.4 |
| Gate decision | Day 1-2 spikes SP-03…SP-09 decide between topology T1 (default), T2 and T3 (§2) | 07 §4 |

**Scale.** 43 flows: 3 Process flows in the portal; 37 Forms and 2 Process flows in the app (plus 1 optional). 61 app lists and 11 portal lists. 15 custom app roles and 9 custom portal roles. **Estimate: 32–40 builder-days**, about 4–4.5 calendar weeks with two builders, after a 2–3 day spike block (§14).

---

## 1. Principles

| # | Principle | What it means in the model | Serves |
|---|---|---|---|
| B-P1 | **Config is data, versioned copy-on-write** | Every business-maintained artefact is a row tagged with a `Version Key`. Publishing freezes a version by status plus a SHA-256 `Content Hash`. Edits create a new draft version. Published rows are never edited in place | REQ-CFG-001, -003, -006; REQ-RMES-002, -008 |
| B-P2 | **A case pins a release, then generates its questionnaire** | At creation a case pins one `CIQ Config Release`. At scope release, the definition JSON of each in-scope section is copied onto that section's portal item | REQ-CFG-001 ("running case keeps previous version"), REQ-PROC-009 |
| B-P3 | **Separation by container** | Nothing internal is ever written to a portal record: no rule reasons, N.A. sections, findings, RMES, internal notes, decision rationales or reviewer chatter. The portal holds only what the supplier must read or write | REQ-CTL-002, REQ-RMES-015, REQ-CFG-004; E-D-74 |
| B-P4 | **Separation by participation** | Supplier users see portal items only because they are assignees (`Supplier Contacts` User field). They hold **no report grant** (and, if SP-07 passes, no flow membership at all) | REQ-CTL-006; [MM §3.6 `/myitems`], UNVERIFIED for portals (SP-05/06/07) |
| B-P5 | **One writer group per record** | One section item per section; one open point per request; one track per department; RMES results split per department flow. Two people's work never shares a record, except two supplier contacts on the same section, who are protected by a per-key merge (§11.3) | REQ-CTL-001; [MM §6.6, §14 #26, #83] |
| B-P6 | **Working copy vs ledger** | The supplier edits `Answers JSON`, which is fast and version-pinned. At each capture event (PS-05, accepted change, PS-11) internal sessions append typed rows to `CIQ Answer`. Every assessment cites ledger keys | REQ-PROC-006, -016, -043; REQ-RMES-005, -016 |
| B-P7 | **Part 2 is append-only** | After PS-05 the supplier cannot write section items (native step permission). Every change is an open point (supplier change request or answer to a query). Once accepted it becomes a new answer revision | REQ-PROC-007, -016, -031; REQ-RMES-012 |
| B-P8 | **Every decision is stamped** | Confirmations, RMES results, findings and audit events carry ledger keys, evidence versions and the pinned config keys (template, rule set, limit set, RMES criteria) | REQ-CTL-009; REQ-RMES-005, -008, -016 |
| B-P9 | **Derive state from the platform, not from custom status selects** | Case, section, open-point and track states derive from `_current_step` / `_status`. The `Case Phase` select on `CIQ Case File` is only a read model | [MM §3.6, §14 #66] |
| B-P10 | **Idempotent session jobs** | Intake, ledger freeze, fan-out repair, phase sync and cancel cascade are keyed jobs in `CIQ Job`, run by whichever internal session is open, with a lease | 07 P6; [MM §3.5 sequential creates] |
| B-P11 | **Native where it is strong** | Routing, step ownership, step-level ReadOnly/Mandatory, send-back loops with mandatory comment, My Tasks, item history and SLA all stay native | [MM §4.6, §3.6, §14 #81] |
| B-P12 | **Honest immutability** | Published config, ledgers and audit events are tamper-**evident** (hash chains), not tamper-proof: admin routes exist [MM §3.6]. We say this to BDF in these words | VQ r12 reframe (07 §8.2) |

---

## 2. Container topology

### 2.1 T1 (default): shared-workflow portal

```
                      ┌──────────────────────── SUPPLIER PORTAL (container P) ────────────────────────┐
 Supplier contacts ──►│ CIQ Case (Process)   CIQ Section Response (Process)   CIQ Open Point (Process) │◄── BDF users in
 (external, portal    │  supplier-safe fields only · supplier = step assignee via User field           │    portal roles
  role CIQ Supplier   │  no report grant for suppliers · no native pages · portal custom UI build      │    (CIQ P RMM, CIQ P
  Contact)            └──────────────────────────────▲──────────────────────────────────────────────────┘    Regulatory …, Case Team)
                                                     │ kf.api(... _application_id=PORTAL) from internal sessions
                                                     │ + integrations (fan-out, closure)  [SP-08, SP-12]
                      ┌──────────────────────────────┴──────── INTERNAL APP (container A) ─────────────────┐
 BDF users ──────────►│ Config (13 Forms + Config Change process) · Masters (5 Forms)                        │
 (app roles)          │ Case File · Scope Run · Review Cycle · Answer ledger · Component · Evidence          │
                      │ Review Track (process) · Section Review · OP File · RMES Record/Results · Finding     │
                      │ Internal Note · Confirmation · Delegation · Audit Event · Notification Log · Final Doc│
                      │ AI Suggestion · Job   — internal custom UI build (RMM, reviewers, admin, auditor)    │
                      └──────────────────────────────────────────────────────────────────────────────────────┘
```

- **What T1 needs (all UNVERIFIED):**
  - internal users can hold roles in the portal (SP-03);
  - a portal step can be assigned from a User field holding portal users (SP-04, SP-05);
  - suppliers are isolated per participation (SP-06);
  - the internal custom UI can call portal flows via `kf.api` with the portal `_application_id` (SP-08);
  - the portal can host a custom UI (SP-09).
- **Why T1 is the default:** each supplier interaction (case gate, section, open point) remains **one** native workflow object with both parties' steps on it. That gives native send-back loops, native step history and native "who has the ball". The internal app twins (`CIQ Case File`, `CIQ Open Point File`) carry the internal-only context and serve as read models.

### 2.2 T2 (fallback if SP-03 or SP-08 fails): message-passing twins

- **When:** internal users cannot act in the portal.
- **Design:**
  - The **case backbone moves to the app** as `CIQ Case` (Process, internal steps only).
  - The portal holds one generic `CIQ Supplier Task` Process: Start → "Supplier – act" (assignee from a User field) → End. There is one item per supplier action: basic data, each section, each open-point round, final release.
  - The app creates portal tasks through an app→portal integration action (`CreateAndSubmitItem`).
  - Supplier completion flows back through a portal→app integration (`UpdateAnItem` or `Approve` on the app item) [MM §4.8]. This needs SP-12 (cross-container integrations).
- **Cost:** +3–4 builder-days, a more complex loop, and reliance on human activation of about 6 integrations [MM §4.8].

### 2.3 T3 (fallback if SP-05 or SP-06 fails): mediated supplier layer

- **When:** portal participation does not isolate suppliers, or dynamic assignees cannot target portal users.
- **Design:**
  - The supplier UI calls a small BDF-approved service. Keys stay server-side [MM §6.7, §11 rule 3]. The service enforces "own cases only" and acts under a service identity.
  - All data lives in the app; the portal only provides login.
- **Cost:** +3–5 builder-days, a hosted component BDF IT must accept, and a weaker low-code story (07 §4.1).

**The rest of this file describes T1.** Under T2 and T3, all app flows, the ledger, config, RMES and audit stay as specified. Only the three portal flows and their hand-offs change.

---

## 3. Flow inventory

**Flow-type rule [MM §2.2, §4.2]:**
1. Is it only a dropdown source? Then it is a **List**.
2. Does the record move through stages with cross-role gates? Then it is a **Process**. A Form can never gain a workflow later.
3. Is it a register, ledger, config table or log with a lifecycle only for reference? Then it is a **Form**.

**Not used:**
- **No Boards.** Every lifecycle here has cross-role gates. Board members also see all cards through `{id}_all` [MM §3.7, §5.4].
- **No Datasets.** Sharing is UI-only and the admin key has no dataset scope [MM §11.4].

**Naming.** Display names carry the prefix `CIQ ` in the app and `CIQ ` / `CIQP ` in the portal. Ids derive from the name, e.g. "CIQ Case File" → `CIQ_Case_File_A00`. **We read the real ids after creation** [MM §2.3]. No field is named `Name`, `Status`, `Type`, `Priority`, `Country`, `Currency`, `Category` or `Project` [MM §2.3, §14 #4–#6]. Yes/No values use a `Select` on a `Yes No` list, never `Boolean`: step-level Mandatory misbehaves on Booleans [MM §4.4], and "not answered" must stay distinct from "No". Long text uses the type `Textarea`, never `TextArea` [MM §3.3]. No Currency fields [MM §3.5]. No `SequenceNumber`: case keys are app-generated with a collision check [MM §4.4, §14 #59].

**Roles abbreviated below:**
- App roles: RMM, REG/SAF/QM/MIC/SUS reviewers, REG-A/SAF-A approvers, CUS, LEG, BA (Business Admin), CA (Config Approver), OA (Overall Approver), AUD, BO (Business Owner).
- Portal roles: SUP (supplier contact), P-RMM, P-<dept> (P-REG etc.), P-TEAM (all internal case team), P-OA.

### 3.1 Inventory table

| # | Flow (display name) | Container | Type | Type rationale | Purpose | Key fields (abbreviated; full specs in §3.2–§3.4) | Creates | Edits | Reads |
|---|---|---|---|---|---|---|---|---|---|
| **P1** | CIQ Case | portal | **Process** | Cross-role gates RMM → supplier → BDF → supplier, with SLA and history [MM §2.2] | Case lifecycle backbone. PS-05 and PS-11 are native step submits | Case Key, Case Title, Supplier Contacts (User multi), Due Date, Config Release Key, Released Sections, Rev_* flags, PS05_*, PS11_*, Supplier Visible Outcome | P-RMM (via internal UI) | Supplier at supplier steps; P-RMM at scope check; P-TEAM at review wait; P-OA at overall approval | Participants only (SUP as assignee; P-* roles) |
| **P2** | CIQ Section Response | portal | **Process** | Supplier writes isolated by participation; completion freezes the item natively; one item per section avoids overwrites [MM §6.6] | Working copy of one section of one case cycle, including the generated definition | Response Key, Case Key, Cycle No, Section Code, Applicability, Section Origin, Section Def JSON + Hash, Answers JSON, Answers Rev, Uploads (child table), Editing By | P-RMM (release); P-<dept> (additional part) | SUP at "Supplier – Fill in"; P-TEAM at "BDF – Frozen" (accepted changes only) | Participants |
| **P3** | CIQ Open Point | portal | **Process** | Loop with native send-back and mandatory comment [MM §3.6]; owner-only status via static department steps | Query, document request, additional part or supplier change request, pinned to an object | OP Key, OP Kind, Requesting Dept, Ref * (section, field, row, doc version), Ref Label, Question, Justification, Responsible Name, Due Date, Addressed Contacts, Thread JSON, Response *, Response Files (child), Decision, Accepted Evidence Ref | P-<dept> (query); SUP (change request) | SUP at Respond; P-<dept> at its Review step | Participants; P-<dept> report View (internal only) |
| A1 | CIQ Config Version | app | Form | Register with a reference-only lifecycle; editable after publish [MM §3.3] | Header for every versioned config domain | Version Key, Config Domain, Config Status, Manifest JSON, Content Hash, Evaluator Version, Regression JSON, Approved/Published By/At | BA | BA (draft only; UI-gated) | All internal |
| A2 | CIQ Config Release | app | Form | Register | Published bundle a case pins: one version per domain | Release Key, Template/Rule Set/Ownership/RMES/Limit/Text/Notification keys, Overall Approval Required, Release Hash | BA (publish via A13) | — after publish | All internal |
| A3 | CIQ Section Def | app | Form | Config register (copy-on-write) | Definition of one section revision: fields, conditions, validations, units, table columns, evidence slots, prefills | Section Def Key (`A1@3`), Section Code, Section Revision, Section Kind, Asked Stage, Definition JSON, Def Hash | BA | BA (draft) | All internal |
| A4 | CIQ Field Catalog | app | Form | Register | Stable, never-reused field keys (`FLD-A1-201`) across versions; join key for the ledger and reporting | Field Key, Section Code, Current Label, Value Kind, Owner Dept, Register Mapping, FLM Source | BA (publish job) | BA | All internal |
| A5 | CIQ Rule | app | Form | Config rows (copied per rule-set version) | One rule of one rule-set version | Rule Row Key, Rule Set Key, Rule Code, Config Question, Condition JSON, Outcome, Target Sections/Evidence/Departments, Precedence, Rule Basis | BA | BA (draft) | All internal |
| A6 | CIQ Section Ownership | app | Form | Config rows | Lead, co-reviewer, informed and read-only departments per section, versioned | Ownership Row Key, Ownership Key, Section Code, Lead Dept, Co Depts, Co Review Mode, Informed Depts, Shared Rule | BA | BA (draft) | All internal |
| A7 | CIQ RMES Criterion Def | app | Form | Config rows | RMES Parts A–D criteria, applicability rule, prefill map, limit link | Criterion Row Key, RMES Criteria Key, Criterion Code, RMES Part, Owning Dept, Result Kind, Applicability JSON, Prefill Map JSON, Limit Param Keys | BA | BA (draft) | All internal |
| A8 | CIQ Limit | app | Form | Config rows | BDF limit values per limit-set version | Limit Row Key, Limit Set Key, Param Key, Substance, Comparator, Limit Value, Limit Unit, Reported Field Keys, Auto Blocking Finding | BA | BA (draft) | All internal |
| A9 | CIQ Text Module | app | Form | Config rows | Versioned confirmation, PDF and notification texts (CIA #5) | Text Row Key, Text Set Key, Text Code, Language, Text Use, Text Body | BA | BA (draft) | All internal |
| A10 | CIQ Notification Rule | app | Form | Config rows | Reminder and escalation rules, read by our sender | Event Code, Recipient Kind, Offset Days, Escalate To Kind, Escalate After Days, Text Code, Enabled | BA | BA (draft) | All internal |
| A11 | CIQ Evidence Type | app | Form | Register | D-01…D-20 evidence catalogue | Evidence Code, Evidence Title, Default Section Code, Reviewing Dept, Validity Rule | BA | BA | All internal |
| A12 | CIQ Regression Material | app | Form | Register | Reference materials with expected scope for the rule regression runner (07 §11 move 1) | Material Key, Config Answers JSON, Components JSON, Expected Scope JSON, Last Run JSON | BA | BA | BA, CA, AUD |
| A13 | CIQ Config Change | app | **Process** | Four-eyes gate between two roles [MM §2.2] | Approve and publish a config version or release | Change Key, Change Kind, Target Keys, Change Note, Diff JSON, Regression Passed | BA | BA (start), CA (approve) | BA, CA, AUD |
| A14 | CIQ Supplier | app | Form | Master register [MM §2.2] | Supplier company | Supplier Key, Supplier Company Name, DUNS, Supplier Kind, external ids | RMM, BA | RMM, BA | All internal |
| A15 | CIQ Supplier Contact | app | Form | Master register | Contact plus portal user link; the coordinator is data, not a role (07 §3.2) | Contact Key, Supplier (Ref), Contact Full Name, Contact Email, Portal User Ref, Contact Role, May Confirm | RMM | RMM | All internal |
| A16 | CIQ Supplier Site | app | Form | Master register | Manufacturer and production site (one per case per FLM changelog r25) | Site Key, Supplier (Ref), Site Kind, Site Title, Site Address | RMM | RMM | All internal |
| A17 | CIQ Raw Material | app | Form | Master register | Material identity and external keys | Material Key, Trade Name, Main INCI, Supplier (Ref), BDF Material No, IRMA Ref, TC Item Ref | RMM | RMM | All internal |
| A18 | CIQ Department | app | Form | Register | Department attributes and role-id mapping | Dept Code, Dept Title, Review Mode, App/Portal/Approver Role Id, Lead/Deputy/Escalation User | BA | BA | All internal |
| A19 | CIQ Case File | app | Form | Internal twin and read model; no lifecycle of its own (the portal case carries it) | Internal case header, pinned keys, search mirrors, roll-ups, internal outcome, external keys | Case Key, Portal Case Id, Material/Supplier refs, RMM Owner, Case Priority, Case Phase (read model), pinned keys, Origin Types, Target Markets, roll-ups, Track States JSON, cancel/overall fields | RMM | RMM, reviewer and approver sessions (roll-ups) | All internal |
| A20 | CIQ Scope Run | app | Form | Immutable derivation record | One rule-engine run: inputs, rule-set version, outputs with fired rules, diff, confirmation | Run Key, Scope Trigger, Rule Set Key, Template Key, Evaluator Version, Input JSON, Output JSON, Diff JSON, Run State, Run Hash | RMM; reviewers (subsequent activation) | Run State only (Proposed → Confirmed/Superseded) | All internal |
| A21 | CIQ Review Cycle | app | Form | Immutable record | Review version n: freeze state and snapshot hashes | Cycle Key, Review Version, Cycle Origin, Freeze State, counts, Snapshot Hash, Final Hash | Intake job | Freeze job | All internal |
| A22 | CIQ Answer | app | Form | Append-only ledger | **Typed answer system of record**, one row per field × row × revision | Answer Key, Case Key, Review Version, Section Code, Field Key, Row UUID, Answer Rev, Value * (typed), Not Applicable, Justification, Entered By/At, Answer Source, Capture Event, Supersedes Key, Out Of Scope | Freeze job; accepting dept | — (never) | All internal |
| A23 | CIQ Component | app | Form | Typed register | K2.1 composition as records per component per version | Component Key, Row UUID, INCI, CAS No, EC No, Component Function, Is Additive, Component Origin, Conc Min/Max | Freeze job; accepting dept | — | All internal |
| A24 | CIQ Evidence | app | Form | Append-only register | Every document version captured, with context link and both titles | Evidence Key, Doc Key, Doc Version, Doc Kind, Evidence Code, Section/Field/Row/OP, Original Title, Technical Title, Portal Item/Row Id, File Copy, Supersedes Key | Freeze job; accepting dept | — | All internal |
| A25 | CIQ Review Track | app | **Process** | Department review with a static role per step [MM §4.6]; final decision step for the approver roles | One department's subprocess for one cycle | Track Key, Case Key, Review Version, Track Dept, Is Active, Assigned Reviewer, Sections Text, Completion Confirm, Final Decision, Decision Reason, On Behalf Of, Reopen Of | Integration (fan-out) or intake job | Department role at its step; approver at the decision step | All internal (CUS/LEG/AUD/BO via a View grant, SP-16) |
| A26 | CIQ Section Review | app | Form | Register (one writer department per row) | Per section × department × cycle review mark and impact flag | Section Review Key, Section Code, Dept, Review Role, Review Mark, Marked By/At | Reviewer | Same department (UI-gated) | All internal |
| A27 | CIQ Open Point File | app | Form | Internal twin and index of P3 | Internal context of an open point: responsible user, internal target date, finding link, phase index | OP Key, Portal Item Id, Requesting Dept, OP Phase, Responsible User, Internal Target Date, Finding Key, Decision, Round No | Raising dept | Raising or reviewing dept; integration | All internal |
| A28 | CIQ RMES Record | app | Form | Register | Exactly one RMES record per confirmed version (REQ-PROC-021) | RMES Key, Review Version, RMES Criteria Key, Limit Set Key, Rule Set Key, SAF/REG Results State, decision snapshot hashes, Export Doc Key | Intake job | SAF, REG | All internal |
| A29 | CIQ RMES Result SAF | app | Form | Register; **a separate flow so the platform, not the UI, keeps Regulatory from editing Safety rows** | One Safety criterion result | Result Key, Criterion Code, RMES Part, Applicable, Applicability Basis/Reason, Prefill Text, Source Refs JSON, Result Value, Result Comment, Result By/At, Limit Check JSON, Limit Pass, Impacted, Impact Resolution | SAF reviewer session | SAF, SAF-A | All internal (REG Viewer) |
| A30 | CIQ RMES Result REG | app | Form | Same, for Regulatory | One Regulatory criterion result | same as A29 | REG session | REG, REG-A | All internal (SAF Viewer) |
| A31 | CIQ Finding | app | Form | Register | Finding: blocking flag, source, publish-as-query link | Finding Key, Finding Dept, Criterion Code, Source Refs JSON, Finding Text, Blocking, Finding Status, Published OP Key, Finding Origin | Reviewers | Owning dept (UI-gated) | All internal |
| A32 | CIQ Internal Note | app | Form | Append log | BDF-only notes on a case, section, finding, criterion or open point (REQ-PROC-020) | Note Key, Linked Kind, Linked Key, Note Dept, Note Text, Mentions, Posted At | All internal | — | All internal |
| A33 | CIQ Confirmation | app | Form | Immutable record | Every confirmation and decision: PS-05, PS-10, PS-11, final SAF/REG, overall, cancellation, reactivation | Confirmation Key, Confirmation Kind, Dept, Decision, Person Name/Email/Role, Confirmed At, On Behalf Of, Text Code/Version, Portal Activity Ref, Rationale, Record Hash | Internal sessions | — | All internal |
| A34 | CIQ Delegation | app | Form | Register | Auditable delegation and reassignment (REQ-PROC-039, REQ-RMES-011/-013) | Delegation Key, Grantor, Delegate, Delegation Scope, Dept, Case Key, Valid From/To, Reason | Department roles | — | All internal |
| A35 | CIQ Audit Event | app | Form | Append-only, hash-chained log | Business audit (REQ-CTL-009, REQ-RMES-016) | Event Key, Case Key, Seq No, Event At, Actor *, On Behalf Of, Event Action, Object Kind/Key/Version, Source Refs JSON, Config Keys, Old/New Value JSON, Reason, Prev Hash, Event Hash | Internal sessions | — | All internal |
| A36 | CIQ Notification Log | app | Form | Append log | Every notification event (REQ-CTL-010, REQ-RMES-019) | Log Key, Case Key, Event Code, Recipient Kind/Email, Channel, Sent At, Text Code | Internal sessions; integrations | — | All internal |
| A37 | CIQ Final Document | app | Form | Immutable register | Final CIQ PDF and RMES export with hash (REQ-PROC-046, REQ-RMES-020) | Final Doc Key, Doc Purpose, Review Version, PDF File, File Hash, Generator, Sent To/At, BFlow Doc Id | Closure (integration or job) | — | All internal |
| A38 | CIQ AI Suggestion | app | Form | Register | AI suggestion: marked, sourced, confirmed or discarded (REQ-PROC-024) | Suggestion Key, Evidence Key, Criterion Code, Suggestion Text, Quoted Passage, AI State, Decided By/At | SAF/REG session | SAF, REG | All internal |
| A39 | CIQ Job | app | Form | Technical register | Idempotency, lease and progress for session jobs (B-P10) | Job Key, Job Kind, Case Key, Job Status, Lease Until, Attempts, Progress Text, Last Error | Internal sessions | Internal sessions | RMM, AUD |
| A40 | CIQ Closure Request *(optional)* | app | Process (Start → End) | Landing record for a portal→app integration plus GeneratePDF (S-07) | Triggers PDF generation without user action | Case Key, Case File (Ref + lookups), PS-11 fields copied | Integration | — | RMM, AUD |
| L-A | 61 app lists (§4.1) | app | List | Dropdown sources [MM §2.2, §3.8] | Option sets for every app Select | — | Build | BA (via build only) | — |
| L-P | 11 portal lists (§4.2) | portal | List | Dropdown sources | Option sets for portal Selects. They are separate from the app lists because names collide account-wide [MM §2.3]; whether a portal Select can reference an app list is UNVERIFIED (SP-02) | — | Build | — | — |

### 3.2 Portal flows: field specs

Legend:
- **Req**: S = mandatory at the Start step (step-level Mandatory); T = step-level Mandatory at the named step; — = optional.
- Every field is set **ReadOnly at Start** unless it is one the Start step really edits [MM §4.6, §14 #53].
- Per-step permissions (§5) are authored **before** publish, for every field. Fields added later get no Activity permissions and become unwritable [MM §3.3, §14 #56].

**P1 CIQ Case (Process).** The only portal record with case-level data. Everything internal sits on A19.

| Field | Type | Req | Notes |
|---|---|---|---|
| Case Key | Text | S | `CIQ-2026-0142`; app-generated; uniqueness checked against A19 (`?q=` search) |
| Case Title | Text | S | `<trade name> – <supplier>`. The display field, because the system `Name` is API-immutable [MM §4.4] |
| Material Trade Name | Text | S | Copy of FLD-GEN-001 |
| Supplier Company | Text | S | Copy of FLD-GEN-002. Plain text, never a reference to an app master |
| Supplier DUNS | Text | S | Copy of FLD-GEN-003 |
| Supplier Contacts | User (multi) | S | **Assignee source** of every supplier step (SP-04, SP-05). Kept in sync with A15 |
| Primary Contact Email | Email | S | FLD-GEN-008 |
| Contact Email 2 | Email | — | FLD-GEN-009; extra notification recipient |
| BDF Owner Name | Text | S | The supplier sees its "responsible person" (REQ-PROC-030) |
| Due Date | Date | S | `YYYY-MM-DD` [MM §3.5] |
| Config Release Key | Text | S | Pinned bundle, e.g. `CR-2026.1` |
| Template Key | Text | S | e.g. `CIQ-2026 v1`. Shown in the supplier UI footer |
| Review Version | Number | — | 0 until PS-05, then n |
| Released Sections | Textarea | — | JSON `[{code,title,applicability:"Mandatory|Optional",origin}]`, **M/O only**. Written at scope check |
| Scope Notice | Textarea | — | Supplier-facing text after a re-derivation ("Added: Annex 4. No longer needed: Annex 1; your answers are kept") |
| Rev RMM, Rev REG, Rev SAF, Rev QM, Rev MIC, Rev SUS | Select (CIQP Yes No) | — | Department activation flags. The fan-out integration copies them to tracks (§5.4). Which departments review is low-sensitivity; still kept off supplier screens. **If SP-20 shows that Hidden fields are readable by participants and BDF objects, move them to T2-style fan-out** |
| Overall Approval Required | Select (CIQP Yes No) | S | Copied from the release. Drives the switchable gate (F-29) |
| Internal Ref | Text | — | Opaque `_id` of A19. **Hidden** at supplier steps (SP-20) |
| PS05 Confirm | Select (CIQP Confirm) | T: Supplier – Questionnaire | Single value "Confirmed". The completeness confirmation (REQ-PROC-014) |
| PS05 By Name, PS05 By Email | Text, Email | T | From `kf.user` (no name field exists in the FLM; changelog r20) |
| PS05 At | DateTime | T | |
| PS05 Text Key | Text | T | Versioned confirmation text, e.g. `TXT-2026.1/CONF-PS05@en` |
| PS11 Confirm, PS11 By Name, PS11 By Email, PS11 By Role, PS11 At, PS11 Text Key | Select/Text/Email/Text/DateTime/Text | T: Supplier – Final release | Final release, which also records role (REQ-PROC-042) |
| Supplier Visible Outcome | Select (CIQP Case Outcome) | — | Open / Closed / Cancelled. The neutral outcome (AS-02). Internal outcome and reasons live on A19 and A33 |

**P2 CIQ Section Response (Process).** Generated at scope release (B-P2).

| Field | Type | Req | Notes |
|---|---|---|---|
| Response Key | Text | S | `CIQ-2026-0142|v1|A1` (cycle in the key) |
| Case Key | Text | S | |
| Cycle No | Number | S | |
| Section Code | Text | S | `A1`, `K2.1`, `BASIC` (= GEN + configuration questions; see §3.5) |
| Section Title | Text | S | |
| Section Sort | Number | S | Questionnaire order |
| Applicability | Select (CIQP Applicability) | S | Mandatory / Optional. **No N.A. items exist** (strongest form of hiding, REQ-PROC-009) |
| Section Origin | Select (CIQP Section Origin) | S | Rule / Manual extension / Subsequently activated (ReqDoc §6.1, REQ-ADR-002) |
| Origin OP Key | Text | — | For subsequently activated parts |
| Section Def Key | Text | S | e.g. `A1@3` |
| Section Def JSON | Textarea | S | **Copy** of A3.Definition JSON at release (S-10 size check) |
| Section Def Hash | Text | S | Re-verified by the supplier UI on load |
| Reviewing Dept Label | Text | — | e.g. "Sustainability (lead)". Shown as the reviewing department |
| Supplier Contacts | User (multi) | S | Assignee source |
| Answers JSON | Textarea | — | Working copy (§3.5) |
| Answers Rev | Number | — | Incremented on every save, for optimistic concurrency (§11.3) |
| Progress Done, Progress Total | Number | — | Display only; recomputed at gates |
| Editing By, Editing Since | Text, DateTime | — | Soft lock: "being edited by" |
| Frozen At | DateTime | — | Set by BDF at the "Frozen" step |
| Accepted Change Log | Textarea | — | JSON of accepted Part-2 changes `{opKey, fieldKey, fromRev, toRev, at}`. The supplier's own data, so it is supplier-visible |
| **Uploads** (child table; id read live [MM §6.2]) | — | — | Columns: Upload Row Key (Text uuid), Field Key (Text), Row UUID (Text), Doc Key (Text), Doc Version (Number), Doc Kind (Select CIQP Doc Kind), Original Title (Text), File (Attachment), Uploaded By Name (Text), Uploaded At (DateTime), Supersedes Upload Key (Text), Withdrawn (Select CIQP Yes No). **Rows are never deleted** [MM §6.6] |

**P3 CIQ Open Point (Process).** Supplier-safe. The finding link and internal target date live on A27 and A31.

| Field | Type | Req | Notes |
|---|---|---|---|
| OP Key | Text | S | `OP-0142-03` |
| Case Key, Cycle No | Text, Number | S | |
| OP Kind | Select (CIQP OP Kind) | S | Query / Document request / Additional part / Change request. A query raised from a finding is a Query here; the finding stays internal (REQ-RMES-015) |
| Requesting Dept | Select (CIQP Department) | S | Drives the review-step condition |
| Ref Kind | Select (CIQP Ref Kind) | S | Section / Field / Table row / Document. REQ-PROC-029: no reference means no send |
| Ref Section Code | Text | S | |
| Ref Field Key | Text | — | e.g. `K2.1-COMP.CAS` |
| Ref Row UUID | Text | — | Stable row id, e.g. `c-7f3a` (never a position) |
| Ref Doc Key, Ref Doc Version | Text, Number | — | File name and version (REQ-PROC-029) |
| Ref Label | Text | S | "K2.1 › component 3 (INCI …) › CAS number". This is the jump target |
| Question | Textarea | S | |
| Justification | Textarea | S | Business justification (ReqDoc §6.2) |
| Responsible Name | Text | S | REQ-ADR-001 |
| Due Date | Date | S | REQ-ADR-001 / -030. The internal target date sits on A27 |
| Addressed Contacts | User (multi) | S | Assignee source of "Supplier – Respond" |
| Round No | Number | — | |
| Thread JSON | Textarea | — | Append-only `[{round, side, action:"raised|answered|returned|accepted|cannot-provide", text, by, at, docKeys}]` (REQ-PROC-033) |
| Response Kind | Select (CIQP Response Kind) | T: Supplier – Respond | Answer / Document provided / Additional part completed / Cannot provide (REQ-PROC-032) |
| Response Text | Textarea | — | |
| Proposed Change JSON | Textarea | — | `{sectionCode, fieldKey, rowUuid, value, unit}`. Used for corrections and change requests (B-P7) |
| **Response Files** (child table) | — | — | Round No, Doc Key, Doc Version, Doc Kind, Original Title, File (Attachment), Uploaded By Name, Uploaded At |
| Decision | Select (CIQP OP Decision) | T: Review – <dept> | Accepted / Not accepted - final / Withdrawn. ReadOnly at Start and Respond |
| Decision Note | Textarea | — | Supplier-visible justification on return or closure (REQ-PROC-034) |
| Accepted Evidence Ref | Text | — | `doc:DOC-0007@2` or `answer:<Answer Key>` (REQ-PROC-034, REQ-RMES-011) |
| Decided By Name, Decided At | Text, DateTime | — | |
| Internal Ref | Text | — | Opaque `_id` of A27. Hidden at the supplier step (SP-20) |

### 3.3 App flows: field specs

Each Form lists its fields as `Label (Type)`. `→ List` names the backing list; `Ref→` is a Reference value `{_id}` [MM §3.5]. Keys are Text and unique by convention, checked in code. Most cross-flow links are **Text keys**, not References, so links survive config churn and cross-container boundaries [MM §4.1 "plain Text mirrors"]. References are used only where lookup or autofill earns its place.

**Config.**

- **A1 CIQ Config Version:** Version Key (Text) · Config Domain (Select → CIQ Config Domain) · Config Status (Select → CIQ Config Status) · Version Label (Text) · Change Note (Textarea, req) · Based On Key (Text) · Manifest JSON (Textarea: Template domain = ordered `Section Def Key`s; other domains = row keys) · Content Hash (Text: SHA-256 of canonical sorted JSON of all content rows) · Evaluator Version (Text: semver of `domain/evaluator`, for rule-set and RMES domains) · Regression JSON (Textarea) · Created By (User) · Approved By (User) · Approved At (DateTime) · Published By (User) · Published At (DateTime) · Retired At (DateTime) · Change Request Key (Text).
- **A2 CIQ Config Release:** Release Key (Text, `CR-2026.2`) · Release Status (Select → CIQ Config Status) · Template Key · Rule Set Key · Ownership Key · RMES Criteria Key · Limit Set Key · Text Set Key · Notification Set Key (all Text) · Overall Approval Required (Select → CIQ Yes No) · Release Hash (Text: hash of the component hashes) · Change Note (Textarea) · Published By (User) · Published At (DateTime).
- **A3 CIQ Section Def:** Section Def Key (Text `A1@3`) · Section Code (Text) · Section Revision (Number) · Section Title (Text) · Section Kind (Select → CIQ Section Kind) · Parent Code (Text, e.g. K6.16 for K6.16.1) · Default Order (Number) · Asked Stage (Select → CIQ Asked Stage; the FLM separates the asking stage from the home section, 02 §5.5 #3) · Has Fields (Select → CIQ Yes No; placeholder sections) · Definition JSON (Textarea, §3.5) · Def Hash (Text) · Based On Key (Text) · Def Status (Select → CIQ Config Status) · Source Note (Text, e.g. "FLM v0.6 r45–r51").
- **A4 CIQ Field Catalog:** Field Key (Text, immutable forever) · Section Code (Text) · Current Label (Text) · Value Kind (Select → CIQ Field Kind) · Parent Table Key (Text) · Owner Dept (Select → CIQ Department) · Register Mapping (Text, e.g. `Component.CAS_No`) · Is Config Question (Select → CIQ Yes No) · Config Question Code (Select → CIQ Config Question) · First Seen In (Text) · Last Seen In (Text) · FLM Source (Text).
- **A5 CIQ Rule:** Rule Row Key (Text `RS-2026.2/R-80`) · Rule Set Key (Text) · Rule Code (Text `R-80`) · Config Question (Select → CIQ Config Question) · Condition JSON (Textarea, §3.5 grammar) · Condition Text (Text) · Outcome (Select → CIQ Applicability) · Target Sections (Textarea: JSON array of section or sub-section codes, e.g. `["A1","A1§5"]`) · Target Evidence (Textarea: JSON array of evidence codes) · Target Departments (Multiselect → CIQ Department) · Precedence (Number) · Rule Basis (Select → CIQ Rule Basis) · Rule Note (Textarea) · Rule Order (Number) · Rule Active (Select → CIQ Yes No).
- **A6 CIQ Section Ownership:** Ownership Row Key (Text) · Ownership Key (Text) · Section Code (Text) · Lead Dept (Select → CIQ Department) · Co Depts (Multiselect → CIQ Department) · Co Review Mode (Select → CIQ Co Review Mode: Track / Read only) · Informed Depts (Multiselect) · Read Only Depts (Multiselect) · Shared Rule (Select → CIQ Shared Rule).
- **A7 CIQ RMES Criterion Def:** Criterion Row Key (Text) · RMES Criteria Key (Text) · Criterion Code (Text `S-A1`) · RMES Part (Select → CIQ RMES Part) · Owning Dept (Select → CIQ Department; SAF or REG) · Criterion Title (Text) · Result Kind (Select → CIQ RMES Result Kind) · Applicability JSON (Textarea: same grammar, over config, scope, components and markets; REQ-RMES-004) · Prefill Map JSON (Textarea: `[{from:"field|section|evidence", key, as}]`; REQ-PROC-022) · Limit Param Keys (Text) · Criterion Order (Number) · Criterion Active (Select → CIQ Yes No) · Help Text (Textarea).
- **A8 CIQ Limit:** Limit Row Key (Text) · Limit Set Key (Text `LIM-2026.1`) · Param Key (Text `HM-AS`) · Substance (Text) · Comparator (Select → CIQ Comparator) · Limit Value (Number) · Limit Unit (Select → CIQ Unit) · Reported Field Keys (Text: `FLD-A14-101`) · LOQ Rule (Select → CIQ LOQ Rule) · Reference Method (Text) · Limit Source (Text: "Feldkatalog r27") · Auto Blocking Finding (Select → CIQ Yes No).
- **A9 CIQ Text Module:** Text Row Key · Text Set Key · Text Code · Language (Select → CIQ Language) · Text Use (Select → CIQ Text Use) · Text Body (Textarea).
- **A10 CIQ Notification Rule:** Rule Row Key · Notification Set Key · Event Code (Select → CIQ Event Code) · Recipient Kind (Select → CIQ Recipient Kind) · Offset Days (Number) · Escalate To Kind (Select → CIQ Recipient Kind) · Escalate After Days (Number) · Text Code (Text) · Rule Enabled (Select → CIQ Yes No).
- **A11 CIQ Evidence Type:** Evidence Code (Text `D-11`) · Evidence Title · Default Section Code · Reviewing Dept (Select) · Validity Rule (Text) · Accept Formats (Text) · Evidence Active (Select).
- **A12 CIQ Regression Material:** Material Key · Material Title · Config Answers JSON · Components JSON · Expected Scope JSON · Expected Evidence JSON · Last Run JSON (all Textarea except the keys).
- **A13 CIQ Config Change (Process):** Change Key (Text) · Change Kind (Select → CIQ Change Kind) · Target Keys (Textarea) · Change Note (Textarea) · Diff JSON (Textarea) · Regression Summary (Textarea) · Regression Passed (Select → CIQ Yes No) · Approver Comment (Textarea) · Published Release Key (Text).

**Masters.** The external-id fields are designed now for later integrations (§12).

- **A14 CIQ Supplier:** Supplier Key · Supplier Company Name · DUNS (Text; 9 digits checked in code) · Supplier Kind (Select → CIQ Supplier Kind) · Parent Supplier Key (Text) · HQ Country Code (Text) · TC Supplier Ref · SAP Vendor No · SAP MDG Ref (Text) · Supplier Active (Select).
- **A15 CIQ Supplier Contact:** Contact Key · Supplier (Ref→A14, lookup Supplier Company Name, DUNS) · Contact Full Name · Contact Email (Email) · Portal User Ref (Text: portal user `_id`, SP-04) · Contact Role (Select → CIQ Contact Role) · May Confirm (Select → CIQ Yes No; who may give PS-05/PS-11, 07 Q-08) · Contact Active (Select) · Invited At (DateTime).
- **A16 CIQ Supplier Site:** Site Key · Supplier (Ref→A14) · Site Kind (Select → CIQ Site Kind) · Site Title · Site Address (Textarea) · Site Country Code (Text).
- **A17 CIQ Raw Material:** Material Key · Trade Name · Main INCI · Supplier (Ref→A14) · BDF Material No · IRMA Ref · TC Item Ref · SAP Material No (Text).
- **A18 CIQ Department:** Dept Code (Select → CIQ Department) · Dept Title · Review Mode (Select → CIQ Review Mode: Review track / Informed / None) · App Role Id · Portal Role Id · Approver Role Id (Text) · Lead User · Deputy User · Escalation User (User) · Default Review Days (Number).

**Case (internal).**

- **A19 CIQ Case File:**
  - Identity: Case Key · Portal Case Id (Text) · Case Title · Material (Ref→A17; lookups Trade Name, Main INCI, BDF Material No) · Supplier (Ref→A14; lookups DUNS) · Contact Keys (Text) · RMM Owner (User) · Case Priority (Select → CIQ Case Priority) · Due Date.
  - Read model: Case Phase (Select → CIQ Case Phase) · Phase Since (DateTime).
  - Pinned keys (Text): Config Release Key · Template Key · Rule Set Key · Ownership Key · RMES Criteria Key · Limit Set Key · Current Review Version (Number) · Last Scope Run Key.
  - Departments: Active Depts · Informed Depts (Multiselect → CIQ Department).
  - **Search mirrors** (REQ-PROC-006): Origin Types (Multiselect → CIQ Origin Type) · Target Markets (Multiselect → CIQ Market) · Main INCI · Supplier DUNS.
  - Roll-ups (Number): Sections Total · Sections Done · OPs Open · OPs With Supplier · OPs Under Review · OPs Overdue · Tracks Active · Tracks Completed.
  - Sync and blockers: Track States JSON (Textarea: the sync source, §5.4) · Blocking Reasons JSON (Textarea; REQ-RMES-018) · Waiting On (Select → CIQ Waiting On).
  - Outcome: Overall Approval Required (Select) · Overall Decision (Select → CIQ Decision) · Overall Reason (Textarea).
  - Cancellation and completion: Cancel Reason (Textarea) · Cancelled By (User) · Cancelled At · Reactivation Deadline (Date) · Completion Event (Text) · Completed At · Final Doc Key.
  - External keys (§12): Teamcenter Ref · IRMA Ref · SAP Material No · BFlow Folder Id · External Request Id · Idempotency Key · Status Callback At.
- **A20 CIQ Scope Run:** Run Key (`CIQ-2026-0142|S3`) · Case Key · Run No (Number) · Scope Trigger (Select → CIQ Scope Trigger) · Phase At Run (Select → CIQ Case Phase) · Rule Set Key · Template Key · Ownership Key · Evaluator Version · Input JSON (config answers plus component origins snapshot) · Output JSON (`[{section, applicability, firedRules[], reason, origin, override:{by,at,justification}}]`, **including N.A. with its reason**, REQ-PROC-009/-010) · Evidence JSON · Departments JSON · Diff JSON (`{added[],removed[],changed[]}`, REQ-CFG-008) · Run State (Select → CIQ Scope Run State) · Confirmed By (User) · Confirmed At · Run Hash.
- **A21 CIQ Review Cycle:** Cycle Key (`CIQ-2026-0142|v1`) · Case Key · Review Version (Number) · Cycle Origin (Select → CIQ Cycle Origin) · Opened At · Scope Run Key · PS05 Confirmation Key · Freeze State (Select → CIQ Job Status) · Answers Count · Evidence Count · Components Count (Number) · Snapshot Hash (Text) · Final Hash (Text) · Final Frozen At.
- **A22 CIQ Answer (ledger):**
  - Keys: Answer Key (`CIQ-2026-0142|v1|A1|FLD-A1-201|-|r1`; deterministic, so it can be cited before it is written) · Case Key · Review Version (Number) · Section Code · Field Key · Row UUID (Text, `-` for non-table) · Answer Rev (Number).
  - Typed value: Value Kind (Select → CIQ Field Kind) · Value Text (Textarea) · Value Number (Number) · Value Min · Value Max (Number) · Value Unit (Select → CIQ Unit) · Value Yes No (Select → CIQ Yes No) · Value Options (Textarea; JSON array) · Value Date (Date) · Value Doc Keys (Text, `DOC-0007@2;…`) · Not Applicable (Select) · Justification (Textarea).
  - Provenance: Entered By Name · Entered By Email · Entered At (DateTime) · Answer Source (Select → CIQ Answer Source) · Capture Event (Select → CIQ Capture Event) · Capture OP Key · Supersedes Key · Out Of Scope (Select; REQ-CFG-009) · Template Key · Section Def Key · Row Hash (Text).
- **A23 CIQ Component:** Component Key (`…|v1|c-7f3a|r1`) · Case Key · Review Version · Row UUID · Row Position (Number) · INCI · CAS No · EC No · Component Function (Text) · Is Additive (Select) · Component Origin (Select → CIQ Origin Type) · Conc Min · Conc Max (Number) · Answer Rev · Entered By Name · Entered At · Capture Event (Select) · Supersedes Key.
- **A24 CIQ Evidence:** Evidence Key (`…|DOC-0007|v2`) · Case Key · Review Version · Doc Key · Doc Version (Number) · Doc Kind (Select → CIQ Doc Kind) · Evidence Code · Section Code · Field Key · Row UUID · OP Key · Original Title · Technical Title (REQ-RMES-017) · Portal Item Id · Portal Row Id · File Copy (Attachment; SP-10, otherwise a reference only) · File Handle (Text) · Uploaded By Name · Uploaded By Email · Uploaded At · Supersedes Key · Capture Event · Valid Until (Date) · BFlow Doc Id.
- **A26 CIQ Section Review:** Section Review Key (`…|v1|K2.2|SAF`) · Case Key · Review Version · Section Code · Dept (Select) · Review Role (Select → CIQ Review Role) · Review Mark (Select → CIQ Review Mark) · Marked By (User) · Marked At · Mark Note (Textarea).
- **A27 CIQ Open Point File:** OP Key · Portal Item Id · Case Key · Review Version · Requesting Dept (Select) · OP Kind (Select → CIQ OP Kind) · Ref Label · Ref JSON (Textarea) · Responsible User (User) · Internal Target Date (Date) · Supplier Due Date (Date) · OP Phase (Select → CIQ OP Phase) · Decision (Select → CIQ OP Decision) · Round No · Finding Key · Accepted Evidence Ref · Last Event At · Raised By (User) · Reassigned To (User) · Delegation Key.
- **A28 CIQ RMES Record:** RMES Key (`…|v1`) · Case Key · Review Version · RMES Criteria Key · Limit Set Key · Rule Set Key · Created At · SAF State · REG State (Select → CIQ RMES Dept State) · SAF Decision Hash · REG Decision Hash · Export Doc Key.
- **A29/A30 CIQ RMES Result SAF / REG** (identical schemas): Result Key (`…|v1|S-A1`) · RMES Key · Case Key · Review Version · Criterion Code · RMES Part (Select) · Criterion Title · Applicable (Select) · Applicability Basis (Select → CIQ Applicability Basis) · Applicability Reason (Textarea) · Prefill Text (Textarea) · Source Refs JSON (Textarea: `[{kind:"answer",key},{kind:"evidence",key}]`) · Result Value (Select → CIQ RMES Result) · Result Comment (Textarea) · Result By (User) · Result At (DateTime) · Limit Check JSON (Textarea: `{param, value, unit, comparator, limit, limitSetKey, pass}`) · Limit Pass (Select) · Impacted (Select) · Impact Resolution (Select → CIQ Impact Resolution) · Impact Note (Textarea) · AI Suggestion Key · Result Rev (Number).
- **A31 CIQ Finding:** Finding Key · Case Key · Review Version · Finding Dept (Select) · Criterion Code · Source Refs JSON · Finding Text (Textarea) · Blocking (Select) · Finding Status (Select → CIQ Finding Status) · Published OP Key · Finding Origin (Select → CIQ Finding Origin) · Closed By (User) · Closed At · Close Note.
- **A32 CIQ Internal Note:** Note Key · Case Key · Linked Kind (Select → CIQ Linked Kind) · Linked Key · Note Dept (Select) · Note Text (Textarea) · Mentions (User multi) · Posted At.
- **A33 CIQ Confirmation:** Confirmation Key · Case Key · Review Version · Confirmation Kind (Select → CIQ Confirmation Kind) · Dept (Select) · Decision (Select → CIQ Decision) · Person Name · Person Email · Person Role · Confirmed At (DateTime) · On Behalf Of (Text; delegation key) · Text Code · Text Version · Portal Activity Ref (Text) · Rationale (Textarea) · Record Hash.
- **A34 CIQ Delegation:** Delegation Key · Grantor (User) · Delegate (User) · Delegation Scope (Select → CIQ Delegation Scope) · Dept (Select) · Case Key (blank = all cases) · Valid From · Valid To (Date) · Reason (Textarea).
- **A35 CIQ Audit Event:** Event Key · Case Key (or `CONFIG`) · Seq No (Number) · Event At (DateTime UTC) · Actor Kind (Select → CIQ Actor Kind) · Actor Name · Actor Email · Actor Ref · On Behalf Of · Event Action (Text: verb phrase from `proto:actions.ts`, e.g. "Raised query") · Object Kind · Object Key · Object Version (Text) · Source Refs JSON · Config Keys (Text: `TPL=…;RS=…;LIM=…;RMES=…`) · Old Value JSON · New Value JSON (Textarea) · Reason (Textarea) · Prev Hash · Event Hash · Portal Activity Ref.
- **A36 CIQ Notification Log:** Log Key · Case Key · Event Code (Select → CIQ Event Code) · Recipient Kind (Select) · Recipient Email (Email) · Channel (Select → CIQ Notify Channel) · Sent At · Text Code · Related Key.
- **A37 CIQ Final Document:** Final Doc Key · Case Key · Doc Purpose (Select → CIQ Doc Purpose) · Review Version · Generated At · PDF File (Attachment) · File Hash · Generator (Select → CIQ Generator) · Sent To (Email) · Sent At · BFlow Doc Id.
- **A38 CIQ AI Suggestion:** Suggestion Key · Case Key · Evidence Key · Criterion Code · Suggestion Text · Quoted Passage (Textarea) · Page Ref · Model Ref (Text) · AI State (Select → CIQ AI State) · Decided By (User) · Decided At.
- **A39 CIQ Job:** Job Key (`INTAKE|CIQ-2026-0142|v1`) · Job Kind (Select → CIQ Job Kind) · Case Key · Job Status (Select → CIQ Job Status) · Lease Until (DateTime) · Attempts (Number) · Progress Text · Last Error (Textarea) · Started By (User) · Started At · Finished At.
- **A25 CIQ Review Track (Process):** Track Key (`…|v1|SAF|t1`) · Case Key · Review Version (Number) · Track Dept (Select → CIQ Department) · Is Active (Select → CIQ Yes No) · Assigned Reviewer (User) · Sections Text (Text) · RMES Required (Select → CIQ Yes No) · Reopen Of (Text) · Reopen Reason (Textarea) · Completion Confirm (Select → CIQ Confirm) · Completion Note (Textarea) · Completed By Name (Text) · Final Decision (Select → CIQ Decision; Approved/Rejected used) · Decision Reason (Textarea) · On Behalf Of (Text; A34 key) · Track Due Date (Date). Steps in §5.4.
- **A13 CIQ Config Change** steps are in §5.5.

### 3.4 Count check

| Container | Process | Form | List | Total |
|---|---|---|---|---|
| Portal | 3 (P1–P3) | 0 | 11 | 14 |
| App | 2 (A13, A25) + 1 optional (A40) | 37 | 61 | 100–101 |

### 3.5 The data contracts inside the JSON fields

**(a) Condition grammar.** One grammar is used by `visibleWhen` in section definitions, by `CIQ Rule.Condition JSON` and by `CIQ RMES Criterion Def.Applicability JSON`. One evaluator implements it in `domain/evaluator`, ported from `proto:rules.ts` and `proto:selectors.ts`. TypeScript lambdas such as `showWhen` and `when` become data.

```jsonc
// node := group | leaf
{ "all": [node, ...] } | { "any": [node, ...] } | { "not": node }
{ "field":  "FLD-A1-201", "op": "eq",       "value": true }            // answer in this case
{ "config": "SF01",       "op": "contains", "value": "Vegetable" }     // configuration answer
{ "component": "Component_Origin", "op": "any-eq", "value": "Petrochemical" } // any K2.1 row
{ "scope": "A4", "op": "in", "value": ["Mandatory","Optional"] }       // RMES applicability
{ "market": "op", "op": "any-not", "value": "EU" }
// ops: eq, neq, in, contains, any-eq, any-not, gt, gte, lt, lte, isSet, isEmpty
```

Example: the BRM acceptance rule R-80 becomes "SF-01 plant-based AND SF-08 palm-based → A1 §5 + RSPO evidence" (REQ-CFG-003):

```jsonc
{ "ruleCode":"R-81", "condition":{ "all":[ {"config":"SF01","op":"contains","value":"Vegetable"},
                                          {"config":"SF08","op":"eq","value":"Yes"} ] },
  "outcome":"Mandatory", "targets":{ "sections":["A1§5"], "evidence":["D-11"] }, "departments":["SUS"] }
```

**Evaluator semantics** (07 F-03 defaults; to confirm with BDF in Q-03):
- union across components and origins;
- precedence `Mandatory > Optional > Not applicable`;
- sections no rule touches are N.A. with the reason "no rule activates";
- origins without rules (Waste, CCU, Chemical recycling) are flagged for a manual RMM scope check (`proto:rules.ts needsManualScopeCheck`, OP-19).

Every scope run stores `Evaluator Version` so that "same input + same version = same result" holds even after code fixes (REQ-PROC-009).

**(b) `Definition JSON` (A3), the copy on P2.** Field keys are the FLM ids and never change meaning.

```jsonc
{ "section":"A1", "rev":3, "title":"Vegetable origin", "kind":"Annex", "help":"…",
  "fields":[
    { "key":"FLD-A1-201", "label":"Pesticides analysis available?", "kind":"Yes/No", "req":"mandatory",
      "owner":"SUS", "source":"FLM r45", "naAllowed":false },
    { "key":"FLD-A1-202", "label":"Pesticides analysis (PDF)", "kind":"File", "req":"conditional",
      "visibleWhen":{"field":"FLD-A1-201","op":"eq","value":"Yes"},
      "upload":{ "accept":["application/pdf"], "evidenceCode":"D-07", "multi":false } },
    { "key":"FLD-A4-101", "kind":"Number with unit", "unit":{"fixed":"mg/kg"},
      "validate":[{"op":"gte","value":0}], "limitParams":["MOAH"] },
    { "key":"K2.1-COMP", "kind":"Table", "minRows":1, "rowKey":"uuid",
      "columns":[ {"key":"INCI","kind":"Text","req":"mandatory","register":"Component.INCI"},
                  {"key":"CAS","kind":"Text","validate":[{"op":"cas"}],"register":"Component.CAS_No"},
                  {"key":"ORIGIN","kind":"Single choice","options":"@origin","register":"Component.Component_Origin"},
                  {"key":"CONC","kind":"Range","unit":{"fixed":"%"},"validate":[{"op":"range0to100"}],
                   "register":"Component.Conc_Min|Conc_Max"} ] } ],
  "evidence":[ { "evidenceCode":"D-11", "label":"RSPO certificate", "req":"conditional",
                 "visibleWhen":{"field":"FLD-A1-204","op":"eq","value":"Yes"} } ],
  "prefill":[ { "target":"FLD-A2-101", "from":"FLD-2.1-001", "editable":true } ],
  "editableBy":{ "SF11":"bdf" } }
```

Notes:
- `BASIC` is the generated union of the template's `GEN` and `CFG` sections (SF-01…SF-12). SF-11 is marked `editableBy: bdf` (AS-06): RMM sets it at creation, and the supplier sees it read-only.
- **Conditional mandatory = mandatory when visible**, enforced only by our validator. There is no conditional-required primitive [MM §4.4, owner-confirmed].
- Options are listed inline in the definition, never as Kissflow Lists. This keeps them version-pinned (REQ-CFG-001 "answer options").

**(c) `Answers JSON` (P2), the working copy.** Keyed by field key. Attribution is per answer (REQ-CTL-001):

```jsonc
{ "FLD-A1-201": { "v":"Yes", "by":"<userId>", "byName":"J. Doe", "at":"2026-10-12T09:14:03Z", "rev":2 },
  "FLD-A4-101": { "v":0.8, "unit":"mg/kg", "by":"…", "at":"…", "rev":1 },
  "FLD-5.1-002":{ "na":true, "just":"Material is anhydrous; …", "by":"…", "at":"…", "rev":1 },
  "FLD-A1-202": { "v":["DOC-0007@1"], "by":"…", "at":"…", "rev":1 },          // file answers point at Uploads rows
  "K2.1-COMP":  { "rows":[ { "_row":"c-7f3a", "_pos":3, "by":"…", "at":"…", "rev":1,
                            "INCI":{"v":"Caprylic/Capric Triglyceride"}, "CAS":{"v":"73398-61-5"}, "ORIGIN":{"v":"Vegetable"},
                            "CONC":{"min":95,"max":100} } ] } }
```

**(d) Reference JSON (P3 `Ref *` fields; A27 `Ref JSON`; RMES `Source Refs JSON`):**

```jsonc
{ "kind":"Table row", "section":"K2.1", "field":"K2.1-COMP.CAS", "row":"c-7f3a",
  "doc":null, "answerKey":"CIQ-2026-0142|v1|K2.1|K2.1-COMP.CAS|c-7f3a|r1",
  "label":"K2.1 › component 3 (Caprylic/Capric Triglyceride) › CAS number" }
```

---

## 4. Lists (option sets)

Rules:
- Every Select is backed by an **explicit, prefixed, populated** list [MM §3.8, §4.5].
- List items are written with `POST /flow/2/{acc}/list/{listId}/items {"ListItems":[…]}` (replaces the whole set) and read back by GET [MM §3.8].
- Values are **exact strings**. Seed data and UI code import them from one constants module, because a non-matching value is silently dropped [MM §3.5, §8.1].
- ASCII is used in values (`<=`, `-`) to avoid encoding mismatches.

### 4.1 App lists (`CIQ …`)

| List | Values |
|---|---|
| CIQ Department | RMM, REG, SAF, QM, MIC, SUS, CUS, LEG |
| CIQ Origin Type | Vegetable, Animal, Mineral, Petrochemical, Polymer, Waste or side stream, CCU, Chemical recycling |
| CIQ Market | EU, UK, TR, CN, US, CA, Other |
| CIQ Yes No | Yes, No |
| CIQ Applicability | Mandatory, Optional, Not applicable |
| CIQ Config Domain | Template, Rule set, Ownership, RMES criteria, Limits, Text modules, Notifications |
| CIQ Config Status | Draft, In test, Approved, Published, Retired |
| CIQ Change Kind | New version, Publish, Retire, Release |
| CIQ Case Phase | Basic data, Scope check, Supplier input, Review, Final release, Overall approval, Completed, Rejected, Cancelled (`proto:selectors.ts PHASE_LABEL`) |
| CIQ Case Priority | Normal, High |
| CIQ Waiting On | Supplier, BDF, None |
| CIQ Section Kind | Basic, Configuration, Chapter, Annex, Sub-section |
| CIQ Asked Stage | Process start, Basic data, Questionnaire |
| CIQ Field Kind | Text, Long text, Email, Number, Decimal, Number with unit, Range, Yes/No, Single choice, Multiple choice, Date, File, Table, Table column, Checkbox with number (REQ-CFG-002 and the 15 FLM types) |
| CIQ Config Question | SF-01, SF-02, SF-03, SF-04, SF-05, SF-06, SF-07, SF-08, SF-09, SF-10, SF-11, SF-12, Always, Component attribute |
| CIQ Rule Basis | Document, Assumption |
| CIQ Shared Rule | Lead decides, All complete |
| CIQ Co Review Mode | Track, Read only |
| CIQ Review Mode | Review track, Informed, None |
| CIQ RMES Part | A, B, C, D |
| CIQ RMES Result Kind | Availability, Plausibility, Listed status |
| CIQ RMES Result | Available, Not available, Plausible, Implausible, Listed, Not listed, Negative, Not applicable |
| CIQ RMES Dept State | Not started, In progress, Ready for decision, Approved, Rejected, Reopened |
| CIQ Applicability Basis | Rule, Override |
| CIQ Impact Resolution | Reopened, No impact confirmed |
| CIQ Comparator | <=, <, >=, >, = |
| CIQ Unit | mg/kg, %, ppm, ug/kg, mm2/s, g/l, none |
| CIQ LOQ Rule | Below LOQ passes, Value required |
| CIQ Answer Source | Supplier, Pre-fill, Auto-fill, Master data, BDF on behalf |
| CIQ Capture Event | Completeness confirmation, Accepted change, Final release, Scope revert, Reactivation |
| CIQ Cycle Origin | Completeness confirmation, Resubmission, Reactivation |
| CIQ Scope Trigger | Initial, Config change, Revert, Manual extension, Subsequent activation, Migration |
| CIQ Scope Run State | Proposed, Confirmed, Superseded |
| CIQ Section Origin | Rule, Manual extension, Subsequently activated |
| CIQ Review Mark | In review, Reviewed, Impacted, No impact confirmed |
| CIQ Review Role | Lead, Co-reviewer |
| CIQ OP Kind | Query, Document request, Additional part, Change request |
| CIQ OP Phase | With supplier, Under review, Closed |
| CIQ OP Decision | Accepted, Not accepted - final, Withdrawn |
| CIQ Finding Status | Draft, Issued to supplier, Closed |
| CIQ Finding Origin | Manual, Limit check, AI confirmed |
| CIQ Confirmation Kind | Scope release, Completeness confirmation, Department completion, Final Safety decision, Final Regulatory decision, Final release, Overall decision, Cancellation, Reactivation, Manual completion |
| CIQ Decision | Confirmed, Approved, Rejected |
| CIQ Confirm | Confirmed |
| CIQ Doc Kind | SDS, CoA, Specification, Analysis, Certificate, Statement, Other |
| CIQ Doc Purpose | CIQ final summary, RMES export |
| CIQ Generator | GeneratePDF, External renderer, Session |
| CIQ Actor Kind | BDF user, Supplier user, System |
| CIQ Notify Channel | Native task e-mail, Connector e-mail, In-app |
| CIQ Event Code | Case started, Scope changed, Part 2 started, OP raised, OP answered, OP returned, OP due soon, OP overdue, Supplier task overdue, Track overdue, Final release requested, Final PDF sent, Case cancelled |
| CIQ Recipient Kind | Supplier contacts, RMM owner, Department role, Responsible user, Escalation user |
| CIQ Job Kind | Part 2 intake, Ledger freeze, Final freeze, Track repair, Phase sync, Cancel cascade, Reminder sweep, Closure |
| CIQ Job Status | Pending, Running, Done, Failed |
| CIQ Supplier Kind | Manufacturer, Distributor |
| CIQ Contact Role | Coordinator, Quality, Key account, Regulatory, Other |
| CIQ Site Kind | Manufacturer, Production site |
| CIQ Delegation Scope | Department completion, Final decision, Open point review |
| CIQ Linked Kind | Case, Section, Finding, Criterion, Open point |
| CIQ AI State | Proposed, Confirmed, Discarded |
| CIQ Language | EN, DE |
| CIQ Text Use | Confirmation, PDF, Notification, Help |

### 4.2 Portal lists (`CIQP …`)

These are separate names because flow names are account-wide [MM §2.3]. Using app lists from the portal is UNVERIFIED (SP-02).

| List | Values |
|---|---|
| CIQP Yes No | Yes, No |
| CIQP Confirm | Confirmed |
| CIQP Department | RMM, REG, SAF, QM, MIC, SUS |
| CIQP Applicability | Mandatory, Optional |
| CIQP Section Origin | Rule, Manual extension, Subsequently activated |
| CIQP OP Kind | Query, Document request, Additional part, Change request |
| CIQP Ref Kind | Section, Field, Table row, Document |
| CIQP Response Kind | Answer, Document provided, Additional part completed, Cannot provide |
| CIQP OP Decision | Accepted, Not accepted - final, Withdrawn |
| CIQP Doc Kind | SDS, CoA, Specification, Analysis, Certificate, Statement, Other |
| CIQP Case Outcome | Open, Closed, Cancelled |

**Not lists, by design:**
- **Questionnaire answer options** live in `Definition JSON`, so they are version-pinned.
- **Config answers (SF-xx)** live in the `BASIC` working copy. Typed mirrors for search exist only on A19.

---

## 5. Process designs

General rules for all processes:
- StartEvent → UserTasks → **explicit End marker** [MM §4.6, §14 #54].
- Step conditions are `Activity::Expression` formulas using `=` [MM §4.6, §14 #52].
- No explicit Reject steps. Native send-back and reject with a mandatory comment already exist; decisions are data [MM §3.6, §14 #81].
- **Mandatory** marks a step-level Mandatory field; ReadOnly is the default everywhere except where Editable is listed.

### 5.1 P1 CIQ Case (portal)

| # | Step | Kind | Assignee | Condition | Editable / Mandatory | Exit |
|---|---|---|---|---|---|---|
| 0 | Start | StartEvent | Initiator = RMM (internal user in P-RMM, via the internal UI; SP-08) | — | Editable: header fields. **ReadOnly:** PS05_*, PS11_*, Supplier Visible Outcome, Rev_* | Submit (API submit works at the StartEvent [MM §3.6]) |
| 1 | Supplier – Basic data | UserTask | **Field `Supplier Contacts`** (SP-05). Fallback T2/T3 | — | ReadOnly: all case fields. The supplier writes the `BASIC` P2 item, not this record | Submit after the UI validates BASIC (REQ-PROC-004, -005) |
| 2 | BDF – Scope check | UserTask | Role P-RMM | — | Editable: Released Sections, Scope Notice, Rev_* | RMM runs the evaluator, may extend with a justification (REQ-CFG-007), creates or updates P2 items, then submits (= "Scope release" confirmation, A33) |
| 3 | Supplier – Questionnaire | UserTask | Field `Supplier Contacts` | — | **Mandatory:** PS05 Confirm, PS05 By Name, PS05 By Email, PS05 At, PS05 Text Key | **PS-05.** The UI gate: completeness validator (REQ-PROC-012), then all P2 items submitted, then this submit. **If config answers change** (REQ-CFG-008): the supplier UI calls native **send-back to step 2** with the comment "Configuration answers changed" (SP-13), and RMM re-derives |
| 4 | BDF – Review in progress | UserTask | Role P-TEAM (all internal case team; native e-mail **off**, SP-15) | — | — | Submitted by the **last completing department session** when every active track is complete (§5.4). Its successor's assignment e-mail is the single supplier notification (REQ-PROC-040) |
| 5 | Supplier – Final release | UserTask | Field `Supplier Contacts` | — | **Mandatory:** PS11 Confirm, PS11 By Name/Email/Role/At, PS11 Text Key | **PS-11** (REQ-PROC-042). Freeze follows (§8) |
| 6 | BDF – Overall approval | UserTask | Role P-OA | `Overall_Approval_Required = "Yes"` | Editable: Supplier Visible Outcome | The internal decision and reason are recorded on A19 and A33. The supplier sees only "Closed" (AS-02) |
| 7 | End | EndEvent | — | — | — | Item completes, so the case completes automatically (REQ-PROC-045) |

- **Cancellation (REQ-PROC-049):** an RMM cascade (§11.2). The portal case is withdrawn by its initiator or by a process admin (SP-18), with `Supplier Visible Outcome = Cancelled`.
- **SLA:** on steps 1, 3 and 5 for supplier reminders, and on step 2 for the RMM scope-check SLA (07 F-06). These are native, and the breach trigger is `SlaBreached` [MM §4.8].

### 5.2 P2 CIQ Section Response (portal)

| # | Step | Assignee | Condition | Editable / Mandatory | Exit |
|---|---|---|---|---|---|
| 0 | Start | Initiator: RMM (release) or department (additional part) | — | All header fields. ReadOnly: Answers JSON, Uploads | Submitted at creation in the same session |
| 1 | Supplier – Fill in | Field `Supplier Contacts` (native e-mail **off**; one digest instead, SP-15) | — | **Editable:** Answers JSON, Answers Rev, Progress *, Editing *, Uploads (child) | Submitted by the supplier UI **at PS-05**, in a sequential batch before the case submit. For an additional part: when completed |
| 2 | BDF – Frozen for review | Role P-TEAM | — | Editable: Answers JSON, Answers Rev, Accepted Change Log, Frozen At. **Supplier: ReadOnly** (native freeze; a refused write returns `050313` [MM §3.1, §6.6]) | Submitted by the final-freeze job after PS-11 |
| 3 | End | — | — | — | Completed = locked (REQ-PROC-043) |

- **Out of scope by re-derivation:** the item stays where it is. RMM removes it from `Released Sections`, and the supplier UI hides it. Data is retained and comes back on revert (REQ-CFG-009). No delete [MM §3.9].

### 5.3 P3 CIQ Open Point (portal)

| # | Step | Assignee | Condition | Editable / Mandatory | Exit |
|---|---|---|---|---|---|
| 0 | Start | Initiator: department reviewer (P-<dept>) **or** supplier (change request) | — | **Mandatory** (department raise): OP Kind, Requesting Dept, Ref Kind, Ref Section Code, Ref Label, Question, Justification, Responsible Name, Due Date, Addressed Contacts (REQ-PROC-029, REQ-ADR-001, ReqDoc §6.2). **ReadOnly:** Decision, Decided * | Submit |
| 1 | Supplier – Respond | Field `Addressed Contacts` | `OP_Kind != "Change request"` | **Editable/Mandatory:** Response Kind; Editable: Response Text, Proposed Change JSON, Thread JSON, Response Files | Submit, which moves the item to its department review |
| 2 | Review – Regulatory | P-REG | `Requesting_Dept = "REG"` | **Mandatory:** Decision. Editable: Decision Note, Accepted Evidence Ref, Decided * | **Accept or Not accepted - final:** set Decision, then submit → End. **Return:** native **send-back to step 1** with a mandatory comment (REQ-PROC-034/-035); Round No + 1 |
| 3 | Review – Safety | P-SAF | `Requesting_Dept = "SAF"` | same | same |
| 4 | Review – QM | P-QM | `= "QM"` | same | same |
| 5 | Review – Microbiology | P-MIC | `= "MIC"` | same | same |
| 6 | Review – Sustainability | P-SUS | `= "SUS"` | same | same |
| 7 | Review – RMM | P-RMM | `= "RMM"` | same | same |
| 8 | End | — | — | — | Closed |

- **"Only the responsible department sets the status"** (REQ-PROC-034, REQ-RMES-011): enforced natively, because only P-<dept> can act on its review step.
- **Documented reassignment:** native reassign (`reassignItem` in the SDK; REST `reassign` 500s [MM §3.6, §6.2]) plus an A34 record.
- **Withdraw:** the initiator withdraws (SDK `withdrawItem`), or Decision = Withdrawn at the review step.
- **Option if SP-05 shows dynamic assignment also works for internal users:** collapse steps 2–7 into one "BDF – Review" step assigned to a `Responsible BDF User` field. That is simpler, but the stricter department scope is enforced only by data (decision deferred to day 2).

### 5.4 A25 CIQ Review Track (app): the dynamic department set

| # | Step | Assignee | Condition | Editable / Mandatory | Exit |
|---|---|---|---|---|---|
| 0 | Start | Fan-out integration or intake job | — | Header. ReadOnly: Final Decision, Completion * | Submit |
| 1 | Review – Regulatory | CIQ Regulatory Reviewer | `Track_Dept = "REG" AND Is_Active = "Yes"` | Editable: Assigned Reviewer (REQ-CTL-003 "named person"), Completion Note. **Mandatory:** Completion Confirm | **PS-10.** UI gate first: no unclosed P3 for this department (REQ-PROC-036); all applicable RMES results final (REQ-RMES-006); no open blocking finding (REQ-RMES-009); negative results commented (REQ-PROC-039). Then submit, and write an A33 "Department completion" record |
| 2 | Review – Safety | CIQ Safety Reviewer | `… "SAF" …` | same | same |
| 3 | Review – QM | CIQ QM Reviewer | `… "QM" …` | same | same |
| 4 | Review – Microbiology | CIQ Microbiology Reviewer | `… "MIC" …` | same | same |
| 5 | Review – Sustainability | CIQ Sustainability Reviewer | `… "SUS" …` | same | same |
| 6 | Review – RMM | CIQ RMM | `… "RMM" …` (only if A18.Review Mode of RMM = "Review track", Q-04) | same | same |
| 7 | Final decision – Regulatory | CIQ Regulatory Approver | `Track_Dept = "REG" AND Is_Active = "Yes"` | **Mandatory:** Final Decision. Editable: Decision Reason (required on Rejected by the UI gate; no conditional-required primitive [MM §4.4]), On Behalf Of | Submit. Writes the A33 "Final Regulatory decision" record and the decision snapshot hash on A28 (REQ-RMES-013) |
| 8 | Final decision – Safety | CIQ Safety Approver | `… "SAF" …` | same | same |
| 9 | End | — | — | — | — |

How the dynamic set works (REQ-PROC-017/-018, ReqDoc §3.2.1):

1. **Activation.** At scope check, the evaluator yields the active departments:
   - the union of `Lead Dept` over in-scope sections, plus `Co Depts` where `Co Review Mode = Track`;
   - read from the **pinned ownership version** (REQ-CFG-006; K2.2 = SAF lead + QM co-reviewer);
   - filtered by A18.Review Mode = "Review track".

   RMM writes them to P1 `Rev_*` and A19 `Active Depts`. Customs and Legal become `Informed Depts` with no track (AS-07).
2. **Fan-out.** Primary: an integration (trigger: P1 `ItemEntersToStep` "BDF – Review in progress"; actions: 6× `CreateAndSubmitItem` into A25 with literal `Track Dept`, `Is_Active ← Rev_<dept>`, `Case Key`, `Review Version`) [MM §4.8]. Cross-container use is UNVERIFIED (SP-12). An inactive track skips every step; whether such an item auto-completes is SP-13 / S-04.
   - **Safety net:** the "Part 2 intake" job (A39) creates any missing active track. The key `Case|vN|Dept` makes it idempotent. "Unaffected departments receive no task" holds because inactive tracks never reach a task step.
3. **Parallelism.** Tracks are independent items, so there is no waiting between departments (REQ-PROC-018).
4. **Sync.**
   - Each completing session re-reads A19 `Track States JSON`, marks its department complete and checks for remaining active tracks. A Kissflow non-admin cannot list other users' process items; only `/myitems` is listable [MM §3.6, §14 #22].
   - If none remain, it submits P1 step 4. It is a P-TEAM member, so it is the assignee (SP-03, SP-08).
   - Writes use optimistic concurrency on `_modified_at`. A race leaves at most a "stuck" case, which the RMM dashboard's "Phase sync" job and tile repair (07 H10). A double advance fails harmlessly because the item has already moved.
5. **Late activation.** An additional part or re-derivation in Part 2 that concerns a department with no track makes that session create the track (REQ-ADR-002, W-11).
6. **Reopen** (REQ-RMES-012): a **new** A25 item with `Reopen Of = <old Track Key>`. Restarting a completed item (`restartItem`) is unverified [MM §6.2], and a new item keeps history immutable.

### 5.5 A13 CIQ Config Change (app): four-eyes publish

| # | Step | Assignee | Editable / Mandatory | Exit |
|---|---|---|---|---|
| 0 | Start | Business Admin (initiator) | **Mandatory:** Change Kind, Target Keys, Change Note, Regression Passed. Editable: Diff JSON, Regression Summary | Submit |
| 1 | Approve change | CIQ Config Approver | **Mandatory:** Approver Comment | The approver UI first runs the **publish routine**: recompute hashes, flip A1 or A2 status to Published, write `Published *`, append an A35 config audit event. Then it submits. Native send-back to Start = request rework |
| 2 | End | — | — | — |

- **Test mode** (07 F-02, Q-16): an `In test` status lets RMM create flagged **test cases** pinned to a draft release. The UI suppresses supplier e-mails for them, and published releases never reference a test version.

---

## 6. Roles and the grant matrix

### 6.1 Roles

**App (internal)**

| Role | Purpose | Members |
|---|---|---|
| Admin *(default)* | Builders and IT only | Build team |
| User *(default)* | Kept, with no grants [MM §3.2] | — |
| CIQ RMM | Case owner: creates, runs the scope check, cancels and reactivates; maintains masters | RMM staff |
| CIQ Regulatory Reviewer / Safety Reviewer / QM Reviewer / Microbiology Reviewer / Sustainability Reviewer | Department review, open points, RMES (SAF and REG) | Department staff |
| CIQ Regulatory Approver / Safety Approver | Final department decision (REQ-RMES-013) | Authorised subset |
| CIQ Customs / CIQ Legal | Informed and read-only (AS-07, K8 "read only") | Department staff |
| CIQ Business Admin | Config editor and admin console | Business admins |
| CIQ Config Approver | Second pair of eyes on config | Process owner |
| CIQ Overall Approver | Only if the overall-approval ending is switched on (F-29) | TBD by BDF (Q-05) |
| CIQ Auditor | Reads everything, including audit and RMES (REQ-CTL-009) | Auditors |
| CIQ Business Owner | Reports and dashboards (CIA #13, #23) | Process owner |

**Portal**

| Role | Kind | Purpose |
|---|---|---|
| CIQ Supplier Contact | **external** | The only external role. Grants only as below; the coordinator is a data attribute (A15.Contact Role), not a role (CIA #25 reframed, 07) |
| CIQ P RMM | internal | Initiates P1/P2, owns step "BDF – Scope check" and P3 "Review – RMM", process admin for the cancel cascade (SP-18) |
| CIQ P Regulatory / P Safety / P QM / P Microbiology / P Sustainability | internal | Raise P3 and own their P3 review step |
| CIQ P Case Team | internal | Union of all internal case-team users. Owns P1 "BDF – Review in progress" and P2 "BDF – Frozen for review" |
| CIQ P Overall Approver | internal | P1 step 6 |

If SP-21 shows that app roles can be **linked** into the portal ("cross-app Linked-role grants", MM §6.7, §11 rule 4), the 8 internal portal roles are replaced by links to the app roles, so membership is maintained once.

Membership:
- Set with `PUT /app_role/2/{acc}/{roleId}?_application_id={app}` and `{Name,_application_id,Users:[{_id,Name,Kind:"User"}]}`.
- **Retry and verify** each membership with the per-role GET (`UserCount`) [MM §3.2; flaky about 1 in 15].
- Roles start with 0 users. A step owned by an empty role 403s on submit [MM §3.2, §14 #7].

### 6.2 Grant matrix

Grant call: `POST /flow/2/{acc}/{family}/{flow}/member/batch?_application_id={container}`, each body carrying `_application_id` [MM §3.4].

Key:
- **M+I** = Process Member, `["InitiateItems"]`.
- **M** = Form Member. The default edit shape is `["Delete"]` [MM §3.4]. We **want** `[]` (edit, no delete) on append-only flows; whether that works is SP-17.
- **V** = Viewer `[]`.
- **PV** = Process read-only `["View"]` (§3.4 lists it; §4.7 says the engine never emits it; SP-16).
- **A** = flow Admin.
- **—** = no grant.
- **No report-View grants for the supplier role, ever.**

**App grants (all `_application_id = APP`)**

| Flow | RMM | REG/SAF/QM/MIC/SUS rev. | REG-A / SAF-A | CUS / LEG | BA | CA | OA | AUD | BO |
|---|---|---|---|---|---|---|---|---|---|
| A1–A11, A12 (config Forms) | V | V | V | V | **M** | V | V | V | V |
| A13 Config Change (Process) | — | — | — | — | **M+I** | **M+I** (step owner, trap T1) | — | PV | — |
| A14–A17 masters | **M** | V | V | V | **M** | V | V | V | V |
| A18 Department | V | V | V | V | **M** | V | V | V | V |
| A19 Case File | **M** | **M** (roll-ups) | **M** | V | V | — | **M** | V | V |
| A20 Scope Run | **M** | **M** (subsequent activation) | V | V | V | — | V | V | V |
| A21 Review Cycle, A22 Answer, A23 Component, A24 Evidence | **M** (`[]`) | **M** (`[]`) | **M** (`[]`) | V | V | — | V | V | V |
| A25 Review Track (Process) | **M+I** (intake) | **M+I** (step owners, trap T1) | **M+I** | PV | — | — | PV | PV | PV |
| A26 Section Review | V | **M** | V | V | — | — | V | V | V |
| A27 Open Point File | **M** | **M** | **M** | V | — | — | V | V | V |
| A28 RMES Record | **M** (intake) | REG, SAF **M**; QM/MIC/SUS V | **M** | V | — | — | V | V | V |
| **A29 RMES Result SAF** | V | **SAF M**; REG/QM/MIC/SUS **V** | SAF-A **M**; REG-A V | V | — | — | V | V | V |
| **A30 RMES Result REG** | V | **REG M**; SAF/QM/MIC/SUS **V** | REG-A **M**; SAF-A V | V | — | — | V | V | V |
| A31 Finding | V | **M** | **M** | V | — | — | V | V | V |
| A32 Internal Note | **M** | **M** | **M** | **M** | — | — | **M** | V | V |
| A33 Confirmation, A35 Audit Event, A36 Notification Log | **M** (`[]`) | **M** (`[]`) | **M** (`[]`) | — | **M** (`[]`; config audit) | **M** (`[]`) | **M** (`[]`) | V | V |
| A34 Delegation | V | **M** | **M** | — | — | — | — | V | — |
| A37 Final Document | **M** | V | V | V | — | — | V | V | V |
| A38 AI Suggestion | — | REG, SAF **M**; others V | V | — | — | — | — | V | — |
| A39 Job | **M** | **M** | **M** | — | — | — | **M** | V | — |
| A40 Closure Request (opt.) | PV | — | — | — | — | — | — | PV | — |

**Portal grants (all `_application_id = PORTAL`)**

| Flow | SUP (supplier contact) | P-RMM | P-REG…P-SUS | P-TEAM | P-OA |
|---|---|---|---|---|---|
| P1 CIQ Case | **— if SP-07 passes** (assignment-only access). Otherwise **M+I, no report grant** (trap T2) | **M+I + A** (SP-18) | — (they act via P-TEAM) | **M** (step 4 owner) | **M** |
| P2 CIQ Section Response | same as P1 | **M+I + A** | **M+I** (additional parts) | **M** (step 2 owner) | — |
| P3 CIQ Open Point | **M+I, no report grant** (change requests; SP-06) | **M+I** | **M+I** + report View (internal list) | report View | — |
| Native pages / nav | **none** | none | none | none | none |

### 6.3 Escalation traps and how this design defuses them

| # | Trap | Source | Defusal |
|---|---|---|---|
| T1 | Any Process membership implies `InitiateItems`, so every reviewer can create Review Tracks and Config Changes, and approvers can raise config changes | [MM §3.4, §4.7, §14 #20] | The UI hides "+ New". The intake job ignores tracks without a matching A19 and flags them as orphans. Stated to BDF as a trade-off. SP-16 checks whether `["View"]` gives truly read-only access for CUS/LEG/AUD/BO |
| T2 | A supplier who holds `InitiateItems` on P1/P2 could create junk cases or sections via the API | [MM §3.4] | SP-07: remove the membership entirely. If it is needed, there is no report grant, and the RMM orphan check flags items with no A19 twin. Supplier-created P1/P2 items are never read by internal jobs unless the key matches A19 |
| T3 | **Page-driven auto-grant:** any native page card that sources a flow grants the page's role Editable (Member+Delete), even if declared Viewer | [MM §3.4, §4.7 NAV_GRANT_ESCALATION, §14 #21] | **No native pages or nav** in either container (`ir.pages=[]`). The custom UI is the only surface. Check after apply that `ensureExperience` added no baseline pages [MM §4.11] |
| T4 | Form grants give View on **all rows**. `scope: my-items` is a view convention, not row security | [MM §4.7, §6.7] | No Forms in the portal. All app Forms are internal-only. Supplier data reaches suppliers only through participated Process items |
| T5 | Form "Member" with `["Delete"]` lets members delete ledger and audit rows | [MM §3.4] | SP-17: Member with `[]` on append-only flows. Hash chain plus the Review Cycle snapshot hash make deletions detectable. `_deleted_by` attribution is checked in S-09 |
| T6 | Board members see all cards | [MM §3.7] | No Boards |
| T7 | Datasets cannot be shared through the API, and sharing them exposes all rows | [MM §11.4] | No Datasets |
| T8 | A role with 0 members cannot submit owned steps; role PUT is flaky | [MM §3.2, §14 #7] | Membership retried and verified by GET. The final checklist includes `UserCount > 0` per role |
| T9 | 423 grant lock during publish leaves roles ungranted | [MM §3.4, §14 #16] | Serial grants, 423 retry, **final re-grant pass**, and read back `GET …/member` |
| T10 | Form shared by SAF and REG: Regulatory could edit Safety rows | REQ-CFG-004 acceptance, REQ-RMES-003 | Split per department (A29/A30), so the separation is enforced by the platform. **Residual:** A31 Finding and A26 Section Review are shared Forms gated by UI and audit. Stated to BDF |
| T11 | Hidden step fields may still come back on an API read | UNVERIFIED | SP-20. Until it passes, the only internal data on portal records is opaque ids (`Internal Ref`) plus the low-sensitivity `Rev_*` flags |

---

## 7. Supplier isolation and internal confidentiality

**What exists in the portal at all.** Only P1–P3 and their lists. Each portal field was checked against "would BDF mind if the supplier read this?":

- **Shown on purpose:** the BDF owner name, the reviewing department label, the requesting department, the open-point responsible name and due date. REQ-PROC-030 requires the supplier to see the "responsible person and due date".
- **Shown but not displayed:** `Rev_*` flags (low sensitivity).
- **Opaque:** `Internal Ref` ids.
- **Never in the portal:**
  - N.A. sections and rule reasons (A20 only; REQ-PROC-009 "documented internally");
  - findings (A31);
  - RMES (A28–A30);
  - internal notes (A32);
  - department completions, decisions and rationales (A25, A33);
  - internal target dates (A27);
  - priority and cancellation reasons (A19);
  - audit (A35).

**Who the supplier is** (E-D-77, Q-01 default): access is per case, for the named contacts in `Supplier Contacts` only. There is no group-level visibility in the MVP. A contact of supplier X never participates in a case of supplier Y.

**Leak channels and controls** (E-D-74, 07 move 3):

| Channel | Control | Test |
|---|---|---|
| Inbox / My Tasks | Participation only | SP-06 two-supplier test |
| Native e-mails | Supplier-facing step names; e-mail off on P2 and the P-TEAM steps; one digest from our sender | SP-15 (S-08) |
| Item history and send-back comments | **Rule:** a return comment on P3 is supplier-facing text. Internal discussion goes to A32. The UI composer has two separate boxes, with no "move to supplier" | SP-06 (read history as supplier) |
| Step names | Neutral: "BDF – Review in progress", never "Safety reviewing" | Review in the leak checklist |
| Attachments | Files live on participated items; no cross-supplier URL | SP-06 (B's attachment URL as A) |
| Search / reports | No report grant for SUP; no portal Forms | SP-06 |
| PDF | Generated app-side, sent to RMM only (REQ-PROC-046) | Q-12 |
| AI | Internal flows only (A38) | — |
| App container | Suppliers are not app users; any app call returns 403 | SP-06 (`/form/2/…/CIQ_Case_File…/list` as supplier) |

**Internal confidentiality between departments.**
- BRM REQ-PROC-019 says every internal role reads everything, so every internal role is V on all case flows.
- Write separation is native where BDF tests it literally: department steps on A25 and P3, and RMES results via A29/A30.
- Elsewhere write separation is UI plus audit (T10).
- C-1/C-11 (does QM read RMES?) is a one-line grant change: V → —.

**Proof deliverable.** An internal-only "Leak test" page plus a QA script. As a supplier fixture, it walks every channel above and prints PASS/FAIL with the API evidence [MM §6.7 "leaky-vs-scoped" fixture, §9.4].

---

## 8. Versioning and immutability

| Object | Version unit | Created when | Frozen how | Enforcement | Requirement |
|---|---|---|---|---|---|
| Template | A1 (Domain = Template) + Manifest of A3 `Section Def Key`s | BA creates a draft; edited sections get a new `A1@n+1` row; unchanged sections are shared | A13 approval → Published + `Content Hash` | Tamper-evident: the hash is re-verified at release and on load. BA is the only editor role | REQ-CFG-001 |
| Rule set | A1 (Rule set) + A5 rows (copied per version) + `Evaluator Version` | New draft copies all rules | Same | Same, plus a regression run (A12) is mandatory before approval | REQ-CFG-003 |
| Section ownership | A1 (Ownership) + A6 rows | Same | Same | Same | REQ-CFG-006 |
| RMES criteria | A1 (RMES) + A7 rows | Same | Same | Same. Historical results are untouched because each result row copies the criterion title and code | REQ-RMES-002 |
| Limits | A1 (Limits) + A8 rows | Same | Same | Same. `Limit Check JSON` stores the limit-set key and the value used | REQ-RMES-008 |
| Texts, notifications | A1 + A9 / A10 | Same | Same | Same | CIA #5, REQ-RMES-019 |
| **Release** | A2 binds one version per domain | Published via A13 | Release Hash | **Cases pin `Config Release Key`** at creation | REQ-CFG-001 ("running case keeps version") |
| Case questionnaire | P2 `Section Def JSON` copy + hash | Scope release | Copy on the case. Config edits cannot reach it | Native (the copy is case-owned) | REQ-CFG-001, REQ-PROC-009 |
| Scope | A20 runs (append; `Run State` superseded, never edited) | Each derivation, extension or activation | Run Hash | Tamper-evident | REQ-PROC-009/-010, REQ-CFG-007/-008/-009, REQ-ADR-002 |
| **Review version** | A21 (`Case|vN`) + every A22/A23/A24 row with `Review Version = N` | PS-05 (intake / ledger freeze) | `Snapshot Hash` = SHA-256 of canonical ledger rows of vN at PS-05 | P2 items at "Frozen" are **natively** read-only for the supplier. The ledger is tamper-evident | REQ-PROC-016 |
| Part-2 change | New A22 row `Answer Rev + 1`, `Capture Event = Accepted change`, `Capture OP Key`, `Supersedes Key` | Department accepts a P3 change or correction | Row is never edited | Append-only by convention (`[]` grant, SP-17) plus the hash chain | REQ-PROC-007, -031; REQ-RMES-012 |
| Restore history | Earlier revisions stay in A22 | — | — | The UI shows "as of vN / as of revision" | REQ-PROC-016 (second paragraph) |
| Out-of-scope data | A22 rows with `Out Of Scope = Yes` at capture; the P2 working copy is retained | Re-derivation removes a section | Reactivated on revert (back in Released Sections) | — | REQ-CFG-009 |
| **Final freeze** | A21 `Final Hash` | PS-11 + the final-freeze job: P2 items → End (completed), P3 open → none allowed, A22 `Capture Event = Final release` marker rows | **Native:** completed process items are not editable. Refused write attempts in our UI are logged to A35 as "Refused change attempt" | REQ-PROC-043 |
| Confirmations | A33 | Each gate | `Record Hash` + chained in A35 | Tamper-evident | REQ-PROC-014/-015/-042 |
| RMES | A28 header + A29/A30 rows. **Every result write → A35 event with old and new values.** At each final decision, `SAF/REG Decision Hash` = hash of that department's result rows | — | Decision snapshot | REQ-RMES-016 |
| Audit | A35, chained per case (`Prev Hash` → `Event Hash`) | Every business action | The verifier recomputes the chain. A fork from two concurrent writers is tolerated as a DAG; a gap or edit is flagged | Tamper-evident. **Wording to BDF:** "tamper-evident business audit plus native item history", not "unalterable by admins" (VQ r12) | REQ-CTL-009, REQ-RMES-016 |
| Final PDF | A37 + File Hash | Closure | Immutable record | Tamper-evident | REQ-PROC-046 |

**Dev → prod.** Config-as-data does not travel with app promotion (E-D-102, 07 F-02). We ship a `ciq-config-pack` script: export A1–A12 rows of a release to signed JSON, then import with hash check into the other environment. Alternatively, BDF accepts test mode (§5.5) inside production (Q-16).

---

## 9. Open points, queries, document requests and findings

**Kinds** (REQ-PROC-034/-036, REQ-ADR-002):

| P3 `OP Kind` | Raised by | Supplier response | On acceptance |
|---|---|---|---|
| Query | Department (P-<dept>) | Answer / Cannot provide (+ optional Proposed Change) | Proposed change applied (B-P7) |
| Document request | Department | Document provided (Response Files) | A24 row(s) appended; P2 Uploads row added by the accepting session if the request was field-bound |
| Additional part | Department | Additional part completed | The session also created a new P2 (`Section Origin = Subsequently activated`, `Origin OP Key`), an A20 run (`Subsequent activation`) and a track if missing. The OP blocks the requesting department (REQ-ADR-002) |
| Change request | **Supplier** (P3 Start) | — (skips step 1) | Same as query acceptance. A config-key change also triggers an A20 "Config change" run (Part 2: **proposed**, RMM confirms; 07 F-07) |
| *(Finding → query)* | Department, from A31 | as Query or Document request | A31 `Published OP Key`, `Finding Status = Issued to supplier`. Closed with the OP or separately (REQ-RMES-010) |

**Object reference** (REQ-PROC-029):
- **Ref Kind** is one of Section / Field / Table row / Document.
- **Stable row ids** (`_row` uuid in Answers JSON; `Row UUID` in the ledger) mean a reference survives reordering.
- A component that has an open point cannot be deleted; the UI blocks it (07 F-04).
- Document references carry `Doc Key` + `Doc Version`, so the label shows the file name and version.
- The **jump target** is resolved in the supplier UI router from (section, field, row). E-mail links land on the inbox, because outer URL parameters do not reach the iframe [MM §6.11].
- Internally, `Ref JSON.answerKey` binds the reference to the exact ledger revision under review.

**Traffic light** (REQ-PROC-034), derived from `_current_step` and Decision [MM §3.6]:
- red = at "Supplier – Respond";
- amber = at "Review – <dept>";
- green = End with Accepted;
- grey = End with Not accepted - final or Withdrawn.

Every status change carries person and time (native history), plus result and reviewed evidence version (`Accepted Evidence Ref`, A35 event).

**History** (REQ-PROC-033): P3 `Thread JSON` (append) + Response Files rounds + native step history. It can be read in full without e-mail.

**Blocking** (REQ-PROC-036 vs REQ-RMES-009, conflict C-03):
- Every unclosed P3 of a department blocks its A25 completion. The blocker list names type, section, status and responsible person.
- Findings carry `Blocking`. A blocking open finding blocks the A25 decision step (REQ-RMES-009).
- A per-kind blocking setting can live in A9/A10 config if BDF later allows non-blocking queries.

**Owner and due date:** `Responsible Name` + `Due Date` on P3 (supplier-visible); `Responsible User` + `Internal Target Date` on A27 (internal).

---

## 10. RMES model

- **Creation** (REQ-PROC-021, REQ-RMES-001): the Part 2 intake job creates **exactly one** A28 per (case, review version). It copies `RMES Criteria Key`, `Limit Set Key` and `Rule Set Key` from the case's pinned release.
- **Applicable criteria** (REQ-RMES-004):
  - The evaluator runs A7 `Applicability JSON` over config answers, the confirmed scope (A20), components (A23) and markets.
  - N.A. criteria get a row with `Applicable = No`, `Applicability Basis = Rule` and the reason, so they stay visible.
  - An override sets `Applicability Basis = Override` and requires `Applicability Reason` (REQ-RMES-007; UI gate).
- **Per-department rows.**
  - Result rows are created **by the owning department's first session**: Safety creates A29 rows, Regulatory creates A30 rows.
  - This keeps the per-department write separation intact. Intake may run in a QM session that has no write access to A29/A30.
  - Each row is **prefilled** from the ledger via `Prefill Map JSON`. `Source Refs JSON` holds the A22/A24 keys including revision (REQ-PROC-022, REQ-RMES-005).
- **Bidirectional trace** (REQ-RMES-005): criterion → source keys, and source key → criteria and findings. The UI indexes `Source Refs JSON` of A29/A30/A31 per case; this is a small set at MVP scale.
- **Result** (REQ-RMES-006/-007):
  - `Result Value` from CIQ RMES Result, plus Comment, By and At.
  - Negative, Implausible and Not applicable need a comment (UI gate).
  - Every write appends an A35 event with old and new values (REQ-RMES-016).
- **Quantitative checks** (REQ-RMES-008):
  - The evaluator reads the A22 numeric value and unit, plus the A8 limit from the pinned set.
  - It writes `Limit Check JSON` + `Limit Pass`.
  - If `Auto Blocking Finding = Yes` and the check fails, it creates an A31 with `Finding Origin = Limit check` (07 F-15).
  - Units come from the controlled CIQ Unit list. There is no free text and no Currency [MM §3.5; E-D-41].
  - **Demo limit set `LIM-2026.1`:** As ≤ 0.5, Cd ≤ 0.1, Cr ≤ 5.0 mg/kg (Feldkatalog r27–r29; `proto:catalog.ts HEAVY_METAL_LIMITS`), plus MOAH ≤ 1.0 mg/kg (prototype assumption, Q-18).
- **Findings** (REQ-RMES-009/-010): A31 linked to criterion and source, with a blocking flag. "Publish as query" creates a P3 with supplier-safe wording; the finding text itself never leaves the app (REQ-RMES-015).
- **Impact** (REQ-RMES-012):
  - When a Part-2 change is accepted (new A22 revision), the accepting session finds every A29/A30 row whose `Source Refs` include that field or document.
  - It sets `Impacted = Yes`, and A26 `Review Mark = Impacted` for the section.
  - The owning department must choose `Impact Resolution`: **Reopened** creates a new A25 with `Reopen Of`; **No impact confirmed** requires an Impact Note.
  - An approved result is never kept silently.
- **Decisions** (REQ-RMES-013/-014; REQ-PROC-039):
  - A25 steps 7–8 hold `Final Decision` + `Decision Reason` + `On Behalf Of` (A34 delegation). Each step is owned by its approver role, so a Regulatory user **cannot** act on the Safety step natively.
  - The gate before the decision checks every applicable result for a final value and that no blocking finding is open.
  - The overall approval gate (if switched on) requires both decisions Approved and no blocking item.
- **Dashboard states** (REQ-RMES-018), derived per department:
  - Unassigned = A25 at its department step with no Assigned Reviewer;
  - Open = at its department step;
  - Waiting for supplier = A27 With supplier for that department;
  - Overdue = due date passed;
  - Reopened = `Reopen Of` set;
  - Approved / Rejected = Final Decision.

  RMM sees department, criterion and blocking reason from A19 `Blocking Reasons JSON`.
- **Export** (REQ-RMES-020): A37 with `Doc Purpose = RMES export`, generated after completion from A28–A31 (internal only).

---

## 11. Custom UI: reads, writes, and what stays native

### 11.1 Architecture

- **One repo, two builds:**
  - `ciq-web/apps/portal` (supplier) → portal custom UI (SP-09);
  - `ciq-web/apps/internal` (RMM, reviewers, approvers, admin, auditor, owner) → app custom UI.
- **Shared packages:**
  - `domain`: types, evaluator, completeness and validation, hashing, ledger mapping. Ported from `proto:src/domain/*`, with lambdas replaced by the §3.5 grammar and the prototype unit tests kept.
  - `kf-seam`: the live/seeded seam [MM §6.4].
- **Technology:** Vite + React, built as a single file with `HashRouter` (architecture B in MM §6.1). This reuses the prototype without porting to `@kissflow/app-core`. Switch to architecture A only if SP-09 requires it.
- **Live-data rules** [MM §6.3, §6.4, §6.7]:
  - `kf.api` bodies are **plain objects**;
  - `isLive()` is evaluated per call;
  - production role comes from `kf.user.AppRoles` (portal: SUP vs internal; app: role catalogue);
  - the dev role switcher is gated on `kf.app.getRoles()`.
- **Each build gets** a `KF_DIAG` surface and a content-hash stamp [MM §6.4].
- **Zip size:** under 5 MB [MM §10.1].

### 11.2 Prototype action → Kissflow write path

Session = whose login performs it. All dataform creates are sequential: `createItem` → `submitItem` [MM §3.5, §6.6]. Every write is read back.

| Prototype action (`proto:actions.ts`) | Session | Writes (in order) |
|---|---|---|
| `createCase` | RMM (internal UI) | 1. A19 create (Case Key uniqueness via search `?q=`). 2. P1 create via `kf.api('/process/2/{acc}/{P1}?_application_id={PORTAL}', {method:'POST', body:{…}})` + submit Start. 3. P2 `BASIC` create + submit (definition = template GEN+CFG copy). 4. A19 `Portal Case Id`. 5. A35 "Created case", A36 "Case started" |
| `saveConfig`, `setAnswer`, `setComponents`, `setJustification` | Supplier (portal UI) | P2 assignee update: `proc.updateItem({instanceId, activityInstanceId, data:{Answers_JSON, Answers_Rev}})`, read-merge-write per key (§11.3). Config-key change after release → `proc.sendbackItem` on P1 to "BDF – Scope check" (SP-13) |
| `submitMetadata` | Supplier | Validate BASIC (REQ-PROC-005 lists every blocking field with section and field name) → `submitItem` P1 step 1 |
| `extendScope` / `releaseScope` (+ derive) | RMM | Read P2 BASIC (initiator) → evaluator (pinned rule set) → A20 create (Proposed) → extensions with justification (REQ-CFG-007) → confirm (A20 `Confirmed`) → P2 create + submit per M/O section (sequential; ~20–40 items; progress bar; S-10) → P1 update `Released Sections`, `Rev_*` → submit step 2 → A33 "Scope release" → A19 phase, Active Depts, mirrors → A35 |
| `uploadDocument` | Supplier | `kf.client.uploadFile()` → `proc.initForm(instanceId)` → `getTable(<Uploads id>).addRow({…File…})` → save (SP-10). Then Answers JSON points the field at `DOC-xxxx@v` |
| `confirmCompleteness` (PS-05) | Supplier | Validator over all released P2 (REQ-PROC-012) → `submitItem` every P2 (step 1 → 2) → P1 update PS05_* → `submitItem` P1 step 3. **Then platform:** fan-out integration creates A25. **Then first internal session** runs the "Part 2 intake" job: A21, ledger freeze (A22/A23/A24), A33 PS-05 copied from P1 fields, A28, A19 phase, A35 |
| `raiseOpenPoint` | Department | P3 create + submit (Start mandatory fields) → A27 create → (additional part: P2 create, A20 run, A25 if missing) → A19 roll-ups → A35 |
| `supplierRespond` | Supplier | P3 update (Response *, Thread JSON append, Response Files addRow) → `submitItem`. A27 phase via integration (SP-12), or refreshed when the department opens its task |
| `reviewResponse` accept | Department | If a change is proposed: P2 (step 2, P-TEAM) Answers JSON rev+1 → A22/A23/A24 new revision rows → impact scan (A29/A30/A26) → P3 Decision + Accepted Evidence Ref → `submitItem` → A27 → A35 |
| `reviewResponse` return | Department | `proc.sendbackItem({…, stepId:<Supplier – Respond>, comment:<supplier-facing reason>})` → Thread JSON/Round → A27 |
| `reviewResponse` not-accepted | Department | P3 Decision = Not accepted - final → submit → (SAF/REG) A31 closed record |
| `recordCriterion` / `addFinding` / `findingToQuery` / `closeFinding` | SAF / REG | A29 or A30 update (+ A35) / A31 create / P3 create + A31 link / A31 update |
| `rmesDecision` | SAF-A / REG-A | A25 step 7/8 update + submit → A28 decision hash → A33 → A35 |
| `completeReview` | Department | Gate (`proto:selectors.ts reviewBlockers`) → A25 department step submit → A33 "Department completion" → A19 Track States JSON (optimistic) → if last: P1 step 4 submit (single supplier notification) → A36 |
| `reopenReview` | Department | New A25 (`Reopen Of`) → A19. If P1 is already at "Supplier – Final release", moving it back needs process-admin rights (SP-18), so this edge is kept for Q-06 |
| `finalRelease` (PS-11) | Supplier | P1 update PS11_* → submit (→ step 6 or End). **Then platform:** closure (A40 + GeneratePDF, or renderer; SP-22). **Then a session** runs the "Final freeze" job: P2 → End, A21 Final Hash, A33 PS-11, A19 Completed |
| `overallDecision` | OA | P1 step 6 (Supplier Visible Outcome) → submit → A19 Overall Decision/Reason → A33 → A35 |
| `cancelCase` | RMM | "Cancel cascade" job: P1, open P2 and open P3 withdrawn (initiator, or process admin, SP-18) → `Supplier Visible Outcome = Cancelled` → A25 open withdrawn → A19 Cancel * + Reactivation Deadline (+12 months, assumption) → A33 → A35 → verify no open task remains (REQ-PROC-049) |
| `reactivateCase` | RMM | New P1 item (same Case Key, `Review Version + 1`) + P2 items with the previous Answers JSON carried over → A21 (`Cycle Origin = Reactivation`) → A33 → A35 |
| `addInternalNote` | Any internal | A32 create |
| `publishTemplateV2`, `setOwnership`, `updateReminder` | BA → CA | A1/A3/A5/A6/A10 draft rows → A13 start → CA approve (publish routine) → A2 new release |

### 11.3 Concurrency inside one section (REQ-CTL-001)

Two supplier contacts may open the same P2. Writes use **read-merge-write**:

1. Re-read the item.
2. Apply only the keys this user changed onto the fresh `Answers JSON`.
3. Write with `Answers Rev + 1`.
4. If the stored rev changed between the read and the write, repeat.

The UI shows "being edited by" from `Editing By`. Child-table rows are added **one at a time** [MM §6.6, §14 #26]. Two-browser QA script; SP-11.

### 11.4 What stays native

- Step routing and conditions; step ownership by role or User field.
- Per-step field Editable, ReadOnly, Hidden and Mandatory.
- Send-back loops with mandatory comments; native reassign and withdraw.
- My Tasks inboxes; selected assignment e-mails; step SLAs and `SlaBreached` escalation.
- Native item history (as the second audit layer).
- Integrations: fan-out, closure, later Teamcenter and B-Flow [MM §4.8].
- Lists; native reports on app Forms (A19, A22, A23) for Business Owner and analyst ad-hoc analysis (VQ r9 reframe).

**Ours:** renderer, validator, evaluator, scope check, admin console with regression runner, RMES workspace, limit checks, open-point composer, dashboards, hash/audit writer, jobs, PDF payload, leak-test page.

---

## 12. Integrations later: keys to store now

| System | Keys stored now | Where | Later mechanism [MM §4.8] |
|---|---|---|---|
| Teamcenter (case start, master data, status feedback; CIA #1, #18) | `Teamcenter Ref`, `External Request Id`, `Idempotency Key`, `Status Callback At`; `TC Supplier Ref`; `TC Item Ref` | A19, A14, A17 | Webhook trigger → `CreateAndSubmitItem` (A19 via session or P1); `ItemCompleted` → HTTP call-out. Human activation |
| B-Flow (document filing; CIA #12, #15) | `BFlow Folder Id` (case); `BFlow Doc Id` (each evidence version and final doc); Technical Title | A19, A24, A37 | HTTP connector or middleware. Idempotent by `Evidence Key` |
| SAP / MDG (CIA #32) | `SAP Material No`, `SAP Vendor No`, `SAP MDG Ref`, `DUNS` | A17, A14, A19 | REST/middleware |
| SSO (CIA #20) | Internal users via SAML; supplier contacts invited + MFA (Q-15) | Platform | Configuration, not data |
| IRMA | `IRMA Ref` | A17, A19 | — |

**Idempotency rule:** every external create carries `Idempotency Key`. A second delivery updates rather than duplicates [MM §8.2].

---

## 13. Build order

Following MM §4.11 and §16-R1, each layer is read back before the next.

| Step | What | Container | Notes |
|---|---|---|---|
| 0 | Day-0 read-only probe SP-00 (credentials, empty shells, default roles) | both | Never write first [MM §A9] |
| 1 | Spikes SP-01…SP-22 (§14), architecture gate T1/T2/T3 at end of day 2 | both | Spike flows created in the **real** containers under the final names where possible (flows are near-permanent [MM §3.9]). Pure probes are prefixed `ZZ CIQ Probe` and archived and deleted after (process archive → delete is verified [MM §3.3]) |
| 2 | Roles: 15 app + 9 portal (or linked, SP-21). Reuse the defaults | both | Reuse by normalized name [MM §2.3, §4.11] |
| 3 | Lists: 61 app + 11 portal; **populate and read back** | both | [MM §3.8]. An empty list blocks required Selects |
| 4 | Config Forms A1–A12, A18 (no case references) | app | Forms first; ids read back |
| 5 | Masters A14–A17 (references to A14) | app | Referenced before referencer [MM §4.5] |
| 6 | Case Forms A19–A24, A26–A39 | app | References A14/A17 |
| 7 | Processes A13, A25 (+A40): shell → draft (fields + child tables + **every step permission**) → publish | app | Hygiene: no duplicate permissions; `Textarea` spelling; terminal End [MM §3.3, §4.6] |
| 8 | Processes P1, P2 (with Uploads child), P3 (with Response Files child) | portal | Dynamic assignee shapes captured from the SP-05 golden blob |
| 9 | Grants (serial, 423 retry) → **re-grant pass** → read back `GET …/member` | both | [MM §3.4] |
| 10 | Role members (BDF test users + synthetic supplier contacts) → verify `UserCount` | both | [MM §3.2] |
| 11 | Integrations: fan-out (P1 → A25), OP phase sync (P3 → A27), closure (P1 → A40 → GeneratePDF). Draft, then **a human activates** | app | [MM §4.8]. Integrations cannot be deleted via API, so author once |
| 12 | Seed config release `CR-2026.1`: GEN+CFG+all sections from `proto:catalog.ts` (FLM v0.6 fields, placeholder sections), rules R-00…R-121 from `proto:rules.ts`, ownership from `SECTIONS`, RMES criteria from `proto:actions.ts rmesCriteria`, limits, texts. Publish via A13 (proves the four-eyes path). Prepare `RS-2026.2` / template v2 (Turkey) as a draft for the live demo | app | Sequential creates; ledger of created ids [MM §8.2] |
| 13 | Seed masters + 2 synthetic suppliers (two competitors, for the leak demo) + deterministic demo cases (driven by the UI, not raw API, so steps advance as real assignees [MM §3.6]) | both | Fictional data only [MM §0.2 #9, §8.1] |
| 14 | Custom UI builds → upload (app; portal per SP-09) → real-container check | both | [MM §10.1] |
| 15 | QA: role × page sweep, leak test, the 32 BRM scenarios, read-backs, cleanup | both | [MM §9] |
| 16 | `HANDOFF.md`, `MEMORY-LOCAL.md`, backend contract (R12) | — | [MM §0.5, §16-R12] |

---

## 14. Risks and spikes

Run these as soon as keys arrive. Order: day 0 is read-only; days 1–2 make the architecture decision. Every call follows MM §3.11 (two headers, JSON body, read-back).

| ID | Question | Exact call / check | Pass means | If it fails | Decides |
|---|---|---|---|---|---|
| **SP-00** | What are the two containers? | `GET /flow/2/{acc}/application/{APP}` · `GET /flow/2/{acc}/application/{PORTAL}` · `GET /flow/2/{acc}/portal/{PORTAL}/flow` · `GET /flow/2/{acc}/portal/{APP}/flow` · `GET /app_role/2/{acc}/list?_application_id={APP}` and `={PORTAL}` · `GET /flow/2/{acc}/process/?_application_id={PORTAL}&page_number=1&page_size=300` (also `form`, `list`) | Both readable, empty or known content, default roles listed | Fix credentials / ids before anything else | Everything |
| **SP-01** | Plan features | Builder UI: Decision Tables (expect `403 YourPlanNotSupport`), GeneratePDF action available, portal-user licence tier (VQ r32, S-11) | Known plan | Rules as data (default); renderer fallback for PDF | §10, §11 |
| **SP-02** | Can we author flows and lists in the portal like in an app? Can a portal Select use an app list? | `POST /flow/2/{acc}/process/?_application_id={PORTAL}` `{Name:"CIQ Case",Description:"…"}` → `GET/PUT /metadata/2/{acc}/process/{id}/draft` → `POST …/publish`; `POST /flow/2/{acc}/list/?_application_id={PORTAL}` + `POST /flow/2/{acc}/list/{id}/items`; in the draft, set a Select's `ReferredList` to an app list id and publish | Shells + publish work | If portal authoring is UI-only: author P1–P3 in the builder and capture golden blobs | §13 |
| **SP-03** | Can internal (account) users hold portal roles and act there? | `POST /app_role/2/{acc}/` `{Name:"CIQ P RMM",_application_id:PORTAL}` → `PUT /app_role/2/{acc}/{role}?_application_id={PORTAL}` `{Name,_application_id,Users:[{_id:<internal>,Name,Kind:"User"}]}` → `GET /app_role/2/{acc}/{role}?_application_id={PORTAL}` (UserCount) → grant `POST /flow/2/{acc}/process/{P1}/member/batch?_application_id={PORTAL}` `[{_id:role,Name,_application_id:PORTAL,Role:"Member",Permission:["InitiateItems"],Kind:"AppRole"}]` → sign in as that user, open the portal, create P1 natively | Internal user creates and acts in portal items | **T2** | T1 vs T2 |
| **SP-04** | How are external portal users created, and can their ids go into User fields? | Invite a fictional contact in the portal admin UI; read the id (portal custom UI `kf.user._id`, or the role member list); `POST /process/2/{acc}/{P1}?_application_id={PORTAL}` `{Supplier_Contacts:[{_id:"<portal user>"}],…}` → `GET /process/2/{acc}/admin/{P1}/{item}?_application_id={PORTAL}` | Value persisted (not silently dropped [MM §3.5]) | T3 | T1 vs T3 |
| **SP-05** | **Dynamic assignee** from a multi-User field (S-01) | Builder: P1 step "Supplier – Basic data" assignee = field `Supplier Contacts`. Create + submit Start as internal user (`POST …/{item}/{act}/submit`). As contact A and contact B: native My Tasks and `kf.app.getProcess('<P1 id>').getMyTasksItems({})`. Export the draft blob to capture the `Resource` shape (golden). Also: change the field on an item already at the step. Is it re-assigned, or is `reassignItem` needed? | Both contacts get the task; contact C (other supplier) does not | T3 (or per-case reassignment via SDK if the static role step plus `reassignItem` works) | T1 vs T3 |
| **SP-06** | **Row isolation** for a participant with no report grant (S-02) | As contact A (supplier X), with B's item id known: `getMyItems({status:'all'})`, `getParticipatedItems()`, `getAdminItems()` (expect refusal), `kf.api('/process/2/{acc}/{P1}/{itemB}/{actB}?_response_type=full&_application_id={PORTAL}')` (expect 403), `kf.api('/process/2/{acc}/{P1}/myitems?_application_id={PORTAL}')`, `kf.api('/flow/2/{acc}/process/{P1}/report?_application_id={PORTAL}')`, B's attachment URL, `kf.api('/form/2/{acc}/<A19 id>/list?page_number=1&page_size=5&_application_id={APP}',{method:'POST',body:{}})` (expect 403), native search, e-mail body | A sees only its own items; every other call refuses | T3 | Whole supplier side |
| SP-07 | Does an assignee need flow membership? | Remove SUP's grant on P1/P2 (`member/batch` without SUP); repeat SP-05 as contact A (open, edit, submit, view history after the step) | Works without membership | Keep M+I, no report grant (trap T2) | §6.2 |
| **SP-08** | Can the **internal custom UI** read and write portal flows? | App UI as RMM: `kf.api('/process/2/{acc}/{P1}?_application_id={PORTAL}',{method:'POST',body:{Case_Key:'ZZ-PROBE'}})` → submit → `kf.api(GET item)`; also try `kf.app.getProcess('<P1 id>')` (is `kf.app` bound to its own container?) | Calls succeed as the signed-in user | T2 (integration bridging) | T1 vs T2 |
| **SP-09** | Can the portal host a custom UI? | Portal settings → Custom UI → upload a hello zip (`manifest.json {"Category":"Application","Framework":"React"}`) → open as contact A; check `window.kf.user`, `kf.account._id`, `kf.api`, `kf.client.uploadFile`, `kf.user.AppRoles` | Renders with SDK present | Portal page + custom component (architecture C, MM §6.9), or T3 | §11 |
| SP-10 | Attachments in child tables on portal processes (S-06) | `const f = await proc.initForm(instanceId); const [d,c] = await Promise.all([f.toJSON(), f.getFormConfiguration()]);` find the Uploads table id; `await f.getTable(id).addRow({Field_Key:'FLD-A1-202',File:<uploadFile result>,…})`; save; read as contact B; download from the app UI (cross-container) | Rows persist; both can open the file | One P2-scoped Attachment field per upload slot (max N), or one P-process item per document (07 F-04) | §3.2 |
| SP-11 | Concurrent writes (S-03) | Two contacts, same P2, different JSON keys via read-merge-write; also two scalar fields at once | Both persist | Strict soft lock (one editor per section) | §11.3 |
| **SP-12** | Cross-container integrations (S-09) | `POST /flow/2/{acc}/integration?_application_id={APP}` → draft with trigger Process `ItemEntersToStep` on **portal** P1 → `GET /connector/2/{acc}/subscription` → `GET /integration/…/{id}/action/{actionEntityId}/fields` (server-resolved 2-pass) → `CreateAndSubmitItem` into A25 → publish → human activates → run one case | Track created with copied fields | Session intake job (already the safety net) | §5.4, closure |
| SP-13 | Conditional steps, send-back to a named step, all-skipped item (S-04) | Publish P3 and A25. Raise as REG; respond; `proc.sendbackItem({instanceId,activityInstanceId,stepId:<Respond>,comment})`; resubmit; check that the SAF/QM steps are skipped. Create an inactive A25 (`Is_Active="No"`) and check whether it auto-completes. On P1, supplier `sendbackItem` to step 2 | All behave as designed | Inactive tracks: never create them (session-only fan-out). OP: a generic review step + static per-department roles via a reassignment table | §5 |
| SP-14 | Dataform throughput and Textarea size (S-10) | 150 sequential `getDataform('<A22>').createItem({data})` → `submitItem({itemId})`; p50/p95; `getItems({pageNumber:1,pageSize:1000})` count; write and read a 120 KB `Definition JSON` | Under 3 s per row; 120 KB round-trips | Background job with progress; per-section snapshot rows instead of per-answer rows; split definitions | §8 |
| SP-15 | E-mail control and content (S-08) | Turn off assignment e-mail on P2 step 1 and P1 step 4; run as supplier; inspect each e-mail received | Controllable per step; no internal text | Our digest sender only (Email connector) | §7 |
| SP-16 | Read-only process grant | `member/batch` on A25 with `Role:"Member",Permission:["View"]` for CIQ Auditor → as auditor, `POST /process/2/{acc}/{A25}?_application_id={APP}` (expect `050302`) and read an item | Read without initiate | Auditor and Informed get M+I (trap T1, UI-gated) | §6.2 |
| SP-17 | Form edit without delete; delete attribution | `member/batch` form `Role:"Member",Permission:[]` → create OK, `deleteItem` refused; admin delete → read `_deleted_by` (S-09) | Append-only enforceable | Hash chain only (tamper-evident) | §8 |
| SP-18 | Process admin for RMM on portal flows | `member/batch` `Role:"Admin"` for P-RMM on P1/P2/P3 → `getAdminItems`, `updateAdminItem`, `withdrawItem` on another user's item | Cancel cascade and monitoring work | Cascade via each initiator + RMM-initiated items only | §11.2 |
| SP-19 | Report listing for non-admin internal roles | `GET /flow/2/{acc}/process/{P3}/report?_application_id={PORTAL}` → try the SDK `getItems({viewId})` on a process report | Internal dashboards can list P3 directly | App twins A27/A19 (already the design) | §11 |
| SP-20 | Do Hidden step fields leak to participants? | P1 `Internal Ref` Hidden at supplier steps → as supplier, `getItem` full | Field absent | Remove internal ids from portal items; correlate by Case Key only | §7 |
| SP-21 | Linked roles across containers | Grant an **app** role on a **portal** flow (`member/batch` with the app role id and `_application_id:PORTAL`), or via Studio | Works | Keep 8 internal portal roles | §6.1 |
| SP-22 | PDF without user action (S-07) | Integration: P1 `ItemCompleted` → `CreateAndSubmitItem` A40 (Ref A19 with lookups) → GeneratePDF → attach to A37 / e-mail RMM | PDF filed and sent automatically | External renderer (webhook → render → attach [MM §6.15]) | REQ-PROC-046 |

**Top risks (ranked):**

1. **Portal semantics** (SP-03…SP-09) are all UNVERIFIED. They decide T1, T2 or T3. Mitigation: an internal product check with Kissflow engineering before day 1, then the spikes.
2. Config-as-data plus the evaluator is our code. Literal tests REQ-CFG-001/-003. Mitigation: build the evaluator, admin console and regression runner first; prototype tests carried over.
3. Sync across a variable department set (race). Mitigation: optimistic A19 plus the phase-sync job plus a stuck-case tile.
4. Ledger freeze throughput (SP-14) and first-reviewer latency. Mitigation: reviewers read the frozen P2 items while the ledger is written; deterministic Answer Keys.
5. PDF (SP-22).
6. Notification flood (SP-15).
7. Immutability wording vs admin routes (B-P12).

---

## 15. Effort estimate

Calibrated on MM §17: a large app (30–70 flows) takes 3–5+ days for the backend; a custom UI for a live 10-flow app takes 2–4 days; a no-backend mock to real app takes 2–3 days each. Design dominates and apply is minutes.

| Work package | Builder-days |
|---|---|
| Spikes SP-00…SP-22 + internal product check + T1/T2/T3 decision | 2–3 |
| Backend authoring, both containers: 43 flows, 72 lists, 24 custom roles, 5 workflows with per-step permissions, grants + re-grant, members, 3 integrations [MM §4.11, §16-R1] | 4–5 |
| Config seed `CR-2026.1` (FLM fields → Definition JSON, R-00…R-121, ownership, RMES, limits, texts) + `ciq-config-pack` export/import | 1.5–2 |
| `domain` package: evaluator on the JSON grammar, validator, hashing, ledger mapping (ported from the prototype with tests) | 1.5–2 |
| `kf-seam` + jobs (intake, ledger freeze, final freeze, phase sync, cancel cascade, reminder sweep) | 2.5–3 |
| Portal UI (supplier): inbox, renderer, uploads, open-point answering, confirmations | 4–5 |
| Internal UI: RMM (create, scope check, dashboards), reviewer workspace, open points, RMES slice, findings, limits, decisions | 5–6 |
| Admin console: versions, section and rule editors, ownership, regression runner, four-eyes publish, test mode | 3–4 |
| PDF/closure, notification sender + log, audit hash chain + verifier, auditor view | 2 |
| Synthetic seed (2 suppliers, deterministic cases) | 1 |
| QA: role × page sweep, leak test per channel, 32 BRM scenarios scripted, read-backs, cleanup [MM §9] | 3–4 |
| Supplier guide, FAQ, 3-minute video (CIA #34) | 1 |
| **Total (T1)** | **32–40** |
| T2 delta (message-passing twins) | +3–4 |
| T3 delta (mediated service) | +3–5 + BDF IT acceptance |

**Calendar:** about 4–4.5 weeks with two builders working in parallel UI streams after the backend lands (days 6–8).

**Critical BDF inputs:**
- rule table v1.0 (OP-19, Q-03);
- RMES template and limits (G-07, Q-10);
- test scope (FLM v0.6? Q-02);
- ending decision (Q-05);
- who the supplier is (Q-01).

Our 07 estimate (26–33) did not yet include the second container, the per-department RMES split and the ledger jobs.

---

## 16. Requirement walk-throughs for the named acceptance criteria

| REQ | Acceptance (BRM / ReqDoc) | How this model passes it, concretely |
|---|---|---|
| **REQ-CFG-001** | Admin adds "Turkey REACH" (mandatory field + upload) in test, publishes with no IT ticket; a running case keeps the old version | BA creates A3 `K6.3@1` and `A12@1` (field `FLD-6.3-001` + upload slot), a draft Template A1 `CIQ-2026 v2` (manifest + new keys), and Rule A5 `R-111` in `RS-2026.2`. The regression runner (A12) shows the scope diff. A13 → CA approves → A2 `CR-2026.2` Published. Case `CIQ-2026-0142` pins `CR-2026.1`, and its P2 items hold the copied v1 definitions, so it is unchanged by construction. A new case pins `CR-2026.2`. No builder change: native forms untouched |
| **REQ-CFG-003** | Rule change creates a new rule-set version; existing cases keep theirs; SF-01 plant AND SF-08 palm → A1 §5 + RSPO evidence, reproducibly | Rules are A5 rows per `Rule Set Key`, so a new version means copied rows plus the A1 header. Each case's scope runs (A20) store `Rule Set Key` + `Evaluator Version` + `Input JSON` + `Output JSON` + `Run Hash`. Re-running the same input with the same version reproduces the same output (regression row in A12: `REF-VEG-PALM` → `A1§5` + `D-11`). Re-derivation uses the case's pinned rule set unless RMM migrates (Trigger = Migration) |
| **REQ-PROC-006** | Find a case by DUNS, INCI or type of origin; K2.1 analysable per component as data | A19 `Supplier DUNS`, `Main INCI`, `Origin Types` (typed, searchable via `?q=` / native report). A23 holds one typed row per component per version (INCI, CAS No, EC No, Component Function, Conc Min/Max). A22 holds every answer typed |
| **REQ-PROC-009** | Same input + version = same result, version logged; for "mineral", A3 and A1-palm hidden but traceable | A20 as above; A19 `Rule Set Key`. N.A. sections **never get a P2 item**, so they are invisible to the supplier by absence. A20 `Output JSON` keeps them with `firedRules` and the reason. Sub-section `A1§5` (palm/RSPO) is N.A. → stripped from the copied A1 definition (`visibleWhen` scope rule) |
| **REQ-PROC-016** | Every assessment in PS-06…PS-10 refers to the answer or document version fixed in PS-05 | A21 `v1` + `Snapshot Hash`; A22/A24 rows with `Review Version = 1`; RMES `Source Refs JSON` and P3 `Ref JSON.answerKey` cite **revision-exact keys**. P2 items are natively read-only for the supplier after PS-05. Later accepted changes are new revisions, so v1 rows remain the restorable history |
| **REQ-PROC-029** | Query on K2.1 / component 3 / CAS jumps to that field; a document query names file and version; no reference, no send | P3 `Ref Kind = Table row`, `Ref Section Code = K2.1`, `Ref Field Key = K2.1-COMP.CAS`, `Ref Row UUID = c-7f3a`, `Ref Label`. Start-step Mandatory refuses a send without a reference **natively**. Document refs carry `Ref Doc Key` + `Ref Doc Version`. The supplier router resolves (section, field, row) |
| **REQ-PROC-043** | After the final release all fields and uploads are locked; change attempts rejected and logged | P1 step 5 submit → final-freeze job moves every P2 to End (completed = not editable natively; any write returns `050313`); P3 none open; A21 `Final Hash`. The UI records every refused attempt as an A35 "Refused change attempt" with the platform error |
| **REQ-RMES-005** | Criterion → open the source; source → related criteria and findings | A29/A30/A31 `Source Refs JSON` → A22/A24 keys (with revision) → viewer opens the P2 answer or file version. The reverse index is built per case in the UI from those JSON fields |
| **REQ-RMES-016** | Auditor reconstructs who assessed what, against which source and rule-set version, and when | A35 events chained per case, carrying `Actor *`, `Event At`, `Object Key/Version`, `Source Refs JSON`, `Config Keys` (TPL, RS, LIM, RMES) and `Old/New Value JSON`. A28 decision hashes; A33 confirmations; native history as the second layer. The auditor view answers "What did Safety assess?" in three clicks (07 move 5) |

**Open model questions to put to BDF** (they change fields, not structure): Q-01 who is the supplier · Q-03 rule semantics · Q-04 RMM track and co-reviewer tracks · Q-05 ending · Q-06 Part-2 change policy · Q-08 who may confirm (A15 `May Confirm`) · Q-10 RMES template · Q-12 PDF content · Q-16 test mode vs test tenant · Q-18 units.
