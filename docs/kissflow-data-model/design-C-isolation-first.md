# Kissflow data model: Design C (isolation-first, portal-first)

> **INTERNAL to Kissflow.** Plan only. Nothing has been built and no tenant has been touched. Prepared 2026-10-06, after call 1, while we wait for the access keys and the app ids of the two containers.
>
> **Angle.** Start from the knock-out criteria:
> - A supplier must never see another supplier's data or any internal content [BRM REQ-CTL-002, REQ-CTL-006, REQ-CFG-004; ReqDoc p.14 REQ-RMES-015]. BDF will test this with a supplier role, and one leak can disqualify us [analysis 06 E-D-74, E-D-77].
> - The work is split between two containers: an internal APP and a supplier PORTAL.
>
> The rest of the model is built around those two constraints.
>
> **Inputs read:**
> - `~/Downloads/master.md` in full (cited as **MM §x**)
> - prototype `src/domain/{types,catalog,rules,actions,selectors}.ts`, plus `features/supplier/lib.ts`
> - analyses 01 (§2–§4), 02 (§1–§5), 03, 06 (E-D-74…80) and 07
> - sources 02 (BRM, 51 requirements) and 05 (FLM v0.6, 39 fields)
>
> **Tags:**
> - **UNVERIFIED** = not proven by MM. It must pass the named spike (§13) before we rely on it.
> - **(inferred)** = our reasoning.
> - What MM says about Portals is two lines and no more: "Portals are a parallel external-facing variant" [MM §2.1], and `GET /flow/2/{acc}/portal/{app}/flow` "works for portal AND application containers" [MM §3.3]. **Every other portal behaviour in this document is UNVERIFIED.**

---

## 0. Summary: the decisions this design makes

| # | Decision | Why |
|---|---|---|
| D1 | **Two-container airlock.** The PORTAL holds only flows where every field is something the owning supplier may see. The APP holds everything else. Supplier roles get **zero** grants in the APP | A leak is then impossible *by construction*, not because a field was hidden or a UI filtered it [MM §4.7: scope "is a view convention, not row-level security"; MM §6.7: grants are the real boundary] |
| D2 | **Every portal flow that holds supplier-specific data is a Process.** No Boards, no supplier-specific Forms, no Datasets in the portal | Form members see every row; Board members see every card through `{id}_all`; a Process can be listed by a non-admin only through `/myitems` (participation) [MM §3.4, §3.5, §3.6, §3.7, §5.4, §14 #22] |
| D3 | **Isolation between suppliers inside the portal comes from participation.** A supplier contact is a participant only of its own case's items. Ladder of mechanisms: **M1** step assignee taken from a field on the item (primary), **M2** native portal organisation scoping, **M4** a mediated broker service (last resort) | MM proves no per-record assignee for the engine [MM §4.6]. M1 is the decisive spike S-C1 |
| D4 | **The supplier-facing lifecycle runs in the portal** (`CIQP_Request`, with internal hand-off steps owned by internal roles). **The internal lifecycle and every internal record run in the app** (`CIQ_Case`, review tracks, RMES and registers) | Native supplier tasks, e-mails and send-back where the supplier is; internal data never in a flow the supplier can reach. Needs S-C3 (internal users can own steps in portal processes). Fallback: Option A (§6.2) |
| D5 | **Data crosses the boundary only through named airlock writers:** (W1) integrations that copy fields, (W2) internal custom-UI sessions calling `kf.api` across containers, (W3) the supplier UI writing only portal flows. **Never** the supplier into the app. **Never** a cross-container Reference or lookup from portal to app | The target portal schema *is* the whitelist: an internal field cannot be copied into a field that does not exist |
| D6 | **One person's work per record** (section items, query items, department tracks), and **one owner per fact.** The portal owns what the supplier said; the app owns what BDF thinks | Last writer wins on one item, and concurrent child-table writes are lost silently [MM §6.6, §14 #26, #83]. "No two records for one fact" [MM §6.8] |
| D7 | **Versions are data and are copied into the case.** Template, rule-set, ownership, RMES and limit versions live as hashed JSON in app Forms. The section definitions are *copied* into each portal section item at release | Running cases keep their version by construction [BRM REQ-CFG-001, -003]. The supplier never reads a shared config flow |
| D8 | **Internal departments see everything** through app Forms (snapshots, twins, index) and through View grants on portal processes. Suppliers never get a report or View grant | REQ-PROC-019 "all internal roles read all project content" vs REQ-CTL-006 "supplier sees only own cases". The grant matrix is deliberately asymmetric (§5) |

Size: the APP has **30 flows** (27 Forms, 3 Processes), **17 custom roles** and **25 lists**. The PORTAL has **5 flows** (4 Processes, 1 optional Form), **11 custom roles** and **3 lists**.

---

## 1. Principles

| # | Principle | Requirement | Basis |
|---|---|---|---|
| C-P1 | **Supplier-safe by construction.** Before a field goes on a portal flow, ask: "Would we show this field's value to the supplier that owns the record?" If not, it lives in the app. There are no hidden fields, no internal fields made "Hidden" by step permission, and no client-side filtering. The prototype filters threads (`visibleThread()` drops `note` messages; `supplierJustification()` hides finding references). In Kissflow these become **physically separate records** | REQ-CTL-002, REQ-RMES-015, REQ-PROC-020 | MM §6.7 ("the app must not re-implement scoping in JS"); 06 E-D-74, E-D-76 |
| C-P2 | **Asymmetric grants.** Internal roles get grants in both containers. The supplier role is granted only on portal processes, as plain membership (to act on its steps) **without** report or View rights. The supplier role is never granted through `ir.permissions[]`, because the engine adds "report View on ALL items" to every entry [MM §4.7] | REQ-CTL-006, REQ-PROC-019 | MM §3.4, §4.7 |
| C-P3 | **Process for anything supplier-specific in the portal; Forms only for supplier-agnostic content.** Supplier-agnostic means help/FAQ only, because config is copied into the case | REQ-CTL-006 | MM §2.2, §3.5, §3.6 |
| C-P4 | **Business keys across the boundary, never content.** Portal records carry `Case_Code`, `Cycle_No` and the `Section_Key` / `Field_Key` / `Row_Id` keys. The one exception is `App_Case_Item_Id`: an opaque id needed as the integration record-locator [MM §4.8], with no content behind it for the supplier. Most cross-references live on the app side (`CIQ_Portal_Link`) | Robustness | MM §4.8, §6.8 |
| C-P5 | **Separate supplier wording from internal reasoning.** Every query, return reason, notice and due date shown to the supplier is authored as supplier text in a portal field. Internal justification, finding text, internal due date and outcome rationale stay in the app twin | REQ-PROC-030, REQ-ADR-001 (internal due date) vs REQ-PROC-030 (supplier sees due date): two fields resolve D-14 | 06 E-D-75 |
| C-P6 | **One writer per record.** The work is cut so concurrent writers never share an item: per section, per query, per department track, per criterion result (split by department) | REQ-CTL-001, REQ-PROC-018 | MM §6.6, §14 #83 |
| C-P7 | **Stamp every decision with versions:** answer version (`Section_Rev`), document version, template, rule-set, ownership, RMES template and limit-set versions | REQ-CTL-009, REQ-RMES-005, -008, -016 | 07 P7 |
| C-P8 | **Status comes from system fields.** Phase, traffic lights and track state are derived from `_current_step` / `_status`, never from a custom Status select | REQ-PROC-034, REQ-CTL-006 | MM §3.6, §14 #66 |
| C-P9 | **Idempotent cross-container writes.** Every create across the airlock is keyed by a natural key in `CIQ_Portal_Link` (ledger), runs sequentially and is read back | Robustness | MM §3.5, §8.2, §0.2 |
| C-P10 | **Native where the platform is strong; our code where it is not.** Native: steps, step owners, send-back loops, step-level freezing, task e-mails, SLA, history. Our code: the rule evaluator, completeness, renderer, sync gates, hash chain, dashboards | — | MM §4.4 (no conditional-required primitive), §4.6, §5.1 |

---

## 2. Flow inventory

### 2.1 Container split and the airlock

```
            ┌──────────────────────────── APP  "CIQ Workbench" (internal, BDF SSO) ───────────────────────────┐
            │ masters · config versions · CIQ_Case (Process) · CIQ_Review_Track (Process) · scope runs ·       │
            │ review-version snapshots · documents register · open-point twins · RMES · findings · notes ·     │
            │ confirmations · delegation · audit (hash chain) · notification log · final PDF · index · ledger  │
            │ Supplier role: NO MEMBERSHIP ANYWHERE                                                          │
            └───────────────▲──────────────────────────────────────────────────────────────▼─────────────────┘
          W2 ingest (reads) │  W1 integrations: portal event → app Approve/Update            │ W2 publish (writes)
          internal sessions │  (G4, G6)                                                       │ internal sessions
            ┌───────────────┴──────────────────────────────────────────────────────────────┴─────────────────┐
            │ PORTAL "CIQ Supplier Portal" (external users + internal roles)                                │
            │ CIQP_Request · CIQP_Section · CIQP_Query · CIQP_Change_Request (all Process) · CIQP_Help (Form)  │
            │ every field supplier-safe · supplier = participant only (M1) · internal roles = step owners +  │
            │ View                                                                                         │
            └────────────────────────────────────────────────────────────────────────────────────────────────┘
```

**Crossing points (gates).** Each one is idempotent and keyed in `CIQ_Portal_Link`.

| Gate | Business event | Direction | What crosses (whitelist) | Primary mechanism | Fallback |
|---|---|---|---|---|---|
| G1 | RMM creates the case and invites the supplier [REQ-PROC-001, -004] | App → Portal | Request header: code, trade name, supplier display name, BDF contact name/e-mail, supplier due date, markets label, template label, case contacts. Plus the `GEN`/`CFG` section items with their copied definitions | **RMM session** (W2) creates `CIQP_Request` and the basic-data `CIQP_Section`s, then submits the StartEvent. The RMM is then the *initiator*, which enables withdraw on cancel (§4.4) | Integration `ItemSubmitted` (app case) → `CreateAndSubmitItem` (portal) (S-C6). Loses RMM-as-initiator |
| G2 | Supplier submits basic data and configuration | Portal (internal step) | Nothing crosses. The portal request moves to the internal step "Beiersdorf: scope check", owned by `CIQP BDF RMM` | Native step hand-off (S-C3) | Option A: integration → app task (§6.2) |
| G3 | RMM releases the derived scope [REQ-PROC-009, -010; REQ-CFG-007] | Portal → App (read config answers); App → Portal (write released scope) | **Into the app:** config answers → `CIQ_Scope_Run` (full result incl. N.A. and rule ids). **Into the portal:** `Released_Scope_JSON` (M/O only, supplier wording) plus one `CIQP_Section` per M/O section with `Definition_JSON` copied | **RMM session** (W2), one "Release" action with a progress bar | — |
| G4 | Supplier confirms completeness (PS-05) [REQ-PROC-014, -016, -017] | Portal → App | Completeness confirmation (name, e-mail, time, text version); the event that starts Part 2 | **Integration I-2:** portal `CIQP_Request` `ItemEntersToStep`("Beiersdorf: review") → app `CIQ_Case` UpdateAnItem + `Approve` (S-C6). Then app integration I-3 fans out the review tracks | Session sync: the RMM dashboard and every reviewer session check open cases, and a "stuck case" tile shows them [07 F-11] |
| G4b | Review-version intake | Portal → App | Frozen section answers, uploads → `CIQ_Section_Snapshot`, `CIQ_Component`, `CIQ_Document`, `CIQ_Review_Version` | **First internal session** after G4 (idempotent; sources are already frozen natively, so a late copy still equals v1) | RMM "intake now" button |
| G5 | Last activated department completes [REQ-PROC-040, -042] | App → Portal | Advance the portal request to "Supplier: final release". Its native assignment e-mail is **the single supplier notification** | **The completing reviewer's session** (W2) re-reads all tracks of the cycle, then advances both containers | RMM stuck tile |
| G6 | Supplier gives the final release (PS-11) [REQ-PROC-042, -043, -045] | Portal → App | Release confirmation (name, role, e-mail, time) | **Integration I-4:** portal `ItemCompleted` → app UpdateAnItem + `Approve` | Session sync |
| G7 | Part-2 exchange: queries, answers, change requests [REQ-PROC-029…036, -007, -031] | Both | **Into the portal:** supplier-worded question, reference keys, supplier due date. **Into the app:** each answer round, its files and the decision | **Reviewer sessions** (W2) at raise / accept / return | — |
| G8 | Cancellation [REQ-PROC-049] | App → Portal | Withdraw the portal request, open sections and open queries; write a supplier-worded notice | **RMM session** (initiator withdraw; else `CIQP BDF Case Admin`) (S-C11) | Admin route |

### 2.2 APP flow inventory (internal; container `KF_APP_ID`)

Names are the flow display names; ids are expected as `slug(Name)+_A00` and **must be read back after creation** [MM §2.3]. Types are chosen per MM §2.2 / §4.2: a Process only where a record has cross-role gates; registers, masters, config and logs are Forms.

| # | Flow (Name → expected id) | Type | Type rationale [MM §2.2/§4.2] | Purpose | Creates | Edits | Reads |
|---|---|---|---|---|---|---|---|
| A1 | CIQ Supplier → `CIQ_Supplier_A00` | Form | Master register, no lifecycle | Supplier organisation (the isolation unit) | RMM, Business Admin | same | all internal |
| A2 | CIQ Supplier Contact | Form | Master | Supplier person, the portal identity key | RMM | RMM | all internal |
| A3 | CIQ Supplier Site | Form | Master | Manufacturer / production site | RMM | RMM | all internal |
| A4 | CIQ Raw Material | Form | Master | Material plus external keys | RMM | RMM | all internal |
| A5 | CIQ Case Contact | Form | Register (access list) | **Authoritative per-case access list** [06 E-D-77: "access to each case is explicit"] | RMM | RMM | all internal |
| A6 | CIQ Config Version | Form | Business-maintained data, editable after publish; immutability by state + hash [MM §3.3] | One record per version of: template manifest, rule set, section ownership, RMES criteria, limit set, text bundle, reminders, settings | Business Admin | Business Admin (Draft only); Config Approver flips state | all internal (read) |
| A7 | CIQ Section Definition | Form | Copy-on-write config unit | One questionnaire section's render JSON (fields, types, options, conditions, validation, units, uploads, N/A-allowed) | Business Admin | Business Admin (Draft only) | all internal |
| A8 | CIQ Config Release | **Process** | Four-eyes approval = a cross-role gate | Publish a config version [REQ-CFG-001, -003, -006] | Business Admin | Config Approver (step) | Admin, Auditor |
| A9 | CIQ Case | **Process** | Cross-role gates (RMM, sync, overall approver); switchable gate [MM §4.6]; cannot start as a Form [MM §4.2] | The internal case hub and lifecycle | RMM | step owners | all internal |
| A10 | CIQ Review Track | **Process** | Static department roles as step owners give native "only Safety completes Safety" [MM §4.6] | One per (case, cycle, department) [REQ-PROC-017, -018, -038, -039] | Integration I-3 (or RMM session) | department role / approver role at its step | all internal |
| A11 | CIQ Scope Run | Form | Immutable derivation record | Inputs, rule-set version, full result incl. N.A. + rule ids + reasons, diff vs previous [REQ-PROC-009, -010; REQ-CFG-007, -008, -009] | RMM session | nobody after create (convention + hash) | all internal |
| A12 | CIQ Review Version | Form | Immutable snapshot manifest | Per (case, cycle): the frozen review version [REQ-PROC-016] | internal session (intake) | — | all internal |
| A13 | CIQ Section Snapshot | Form | Immutable snapshot rows | Per (case, cycle, section, rev): answers JSON + hash | internal session (intake, accept) | — | all internal |
| A14 | CIQ Component | Form | Typed register for analysis | K2.1 rows typed (INCI, CAS, EC, function, additive, origin, conc. min/max) [REQ-PROC-006] | internal session | — | all internal |
| A15 | CIQ Document | Form | Evidence register | One row per document version (question-linked) [REQ-PROC-011, -016; REQ-RMES-017] | internal session | — | all internal |
| A16 | CIQ Open Point | Form | Internal twin of a portal query; the loop lives in the portal | Internal facts: department, kind, internal justification, finding link, blocking, internal due date, outcome, rounds log [REQ-PROC-029…036; REQ-ADR-001, -002] | reviewer session | owning dept (convention + audit) | all internal |
| A17 | CIQ RMES Record | Form | Register, one per (case, cycle) [REQ-PROC-021] | RMES header + pinned versions | SAF/REG session | — | all internal (see §6.5) |
| A18 | CIQ RMES Safety Result | Form | **Split per department** so that Regulatory physically cannot edit Safety criteria [REQ-CFG-004; REQ-RMES-003] | Criterion results, Safety | Safety | Safety, Safety Approver | all internal |
| A19 | CIQ RMES Regulatory Result | Form | as above | Criterion results, Regulatory | Regulatory | Regulatory, Regulatory Approver | all internal |
| A20 | CIQ Safety Finding | Form | Split per department | Findings, Safety [REQ-RMES-009, -010] | Safety | Safety | all internal |
| A21 | CIQ Regulatory Finding | Form | as above | Findings, Regulatory | Regulatory | Regulatory | all internal |
| A22 | CIQ AI Suggestion | Form | Register | Marked suggestion + source + confirm/discard [REQ-PROC-024] | SAF/REG session | SAF/REG | all internal |
| A23 | CIQ Internal Note | Form | Register (append) | BDF-only discussion on case/section/finding/open point [REQ-PROC-020] | all internal | author (convention) | all internal |
| A24 | CIQ Confirmation | Form | Immutable register | All confirmation types incl. ingested supplier confirmations [REQ-PROC-014, -015, -038, -042; REQ-RMES-013] | sessions, integration | — | all internal |
| A25 | CIQ Delegation | Form | Register | Auditable delegation [REQ-PROC-039; REQ-RMES-011, -013] | approvers, RMM | — | all internal |
| A26 | CIQ Audit Event | Form | Append-only, hash-chained | Business audit [REQ-CTL-009; REQ-RMES-016] | all internal sessions, integration | nobody (Delete not granted where avoidable; S-C12) | Auditor + all internal |
| A27 | CIQ Notification Log | Form | Append-only | Every notification event [REQ-CTL-010] | sessions, integration | — | all internal |
| A28 | CIQ Final Document | Form | Immutable register | Final PDF + SHA-256 + version [REQ-PROC-046; REQ-RMES-020] | integration / finalizer | — | all internal |
| A29 | CIQ Case Index | Form | Read model (processes are not listable cheaply [MM §3.6, §14 #22]) | One row per case for dashboards [REQ-CTL-006; REQ-RMES-018] | internal sessions | internal sessions | all internal |
| A30 | CIQ Portal Link | Form | Idempotency ledger | natural key → portal item id / activity id [MM §8.2] | internal sessions | internal sessions | Admin, Auditor |

**Deliberately absent:**
- **Boards.** Every lifecycle here has gates [MM §2.2]. Board members see all cards [MM §5.4].
- **Datasets.** Sharing them is UI-only and the admin key has no dataset scope [MM §11.4].
- **A separate rule-row Form.** A rule-set version is one atomic JSON record, so "same input + same version → same result" is trivially true [REQ-PROC-009].

### 2.3 PORTAL flow inventory (container `KF_PORTAL_ID`)

| # | Flow | Type | Type rationale | Purpose | Creates | Acts / edits | Reads |
|---|---|---|---|---|---|---|---|
| P1 | CIQP Request → `CIQP_Request_A00` | **Process** | Supplier ↔ BDF gates; participation isolation [MM §3.6] | The supplier-facing case lifecycle, one per (case, cycle) | RMM session (G1) | supplier contacts at supplier steps; `CIQP BDF RMM` at scope check; `CIQP BDF Sync` at review | the case's contacts (participation); internal View |
| P2 | CIQP Section | **Process** | Supplier-writable data must sit in a participation-scoped item; one per section avoids overwrites [MM §6.6] | One per (case, cycle, released section, revision): definition (copied), answers, justifications, uploads | RMM session (G3); dept session (additional part) | case contacts at the "complete section" step | participants; internal View |
| P3 | CIQP Query | **Process** | Native send-back loop with mandatory comment [MM §3.6]; dept-owned review step = "only the responsible department closes" [REQ-PROC-034] | Supplier-facing part of an open point: question, reference, supplier due date, rounds, answer, files | reviewer session (G7) | case contacts (answer); dept role (review) | participants; internal View |
| P4 | CIQP Change Request | **Process** | Supplier-initiated, so participation comes **by initiator**, the most robust isolation (no field assignment needed) | Part-2 correction / metadata change, and change attempts after the freeze [REQ-PROC-007, -031, -043] | supplier contact | `CIQP BDF RMM` (triage) | initiator; internal View |
| P5 | CIQP Help Article (optional) | Form | Supplier-agnostic content only; all portal users read all rows, by design | FAQ, quick-start guide [CIA #34] | RMM / admin | same | all portal users |

**Rules for every portal flow:**
- **No Reference or lookup fields** to any Form. A lookup pulls the target's rows into a supplier-readable context.
- No Reference to app flows.
- No aggregates over flows the supplier is not scoped to.
- Selects only where the supplier picks a value.
- Display values written by internal sessions are Text, so no list dependency.

### 2.4 Key fields per flow

Conventions:
- **Field names never use** `Name`, `Status`, `Type`, `Country`, `Priority` [MM §2.3, §14 #4–#6].
- Type spelling is `Textarea` [MM §3.3].
- `R` = required.
- "ST" = step-level state; `RO@Start` = ReadOnly at the StartEvent [MM §4.6, §14 #53].
- JSON payloads go in `Textarea`; max size is checked in S-C13.

#### A1 CIQ Supplier

| Field | Type | Notes |
|---|---|---|
| Supplier_Code | Text R | Natural key, e.g. `SUP-0012`. Unique by convention plus a UI check |
| Supplier_Legal_Name | Text R | FLD-GEN-002 source |
| DUNS_Number | Text R | 9 digits (UI-validated) [FLM r7] |
| Supplier_Kind | Select (`CIQ Supplier Kind`) | Manufacturer / Distributor / Trader [06 E-D-77] |
| Parent_Supplier | Reference → CIQ Supplier (lookup `Supplier_Legal_Name`) | Multi-level [CIA #28] |
| Country_Code | Select (`CIQ Country Code`) | Not named `Country` [MM §14] |
| Teamcenter_Supplier_Id, SAP_Vendor_Id | Text | Keys for later (§11) |
| Portal_Org_Key | Text | Filled only if spike S-C2b shows the portal has an organisation model |
| Is_Active | Boolean | |

#### A2 CIQ Supplier Contact

| Field | Type | Notes |
|---|---|---|
| Contact_Full_Name | Text R | FLM has no name field [FLM changelog r20]; we keep it |
| Contact_Email | Email R | **The join key to the portal user.** FLD-GEN-008/-009 source |
| Supplier | Reference → CIQ Supplier R (lookup `Supplier_Code`, `Supplier_Legal_Name`) | |
| Contact_Role | Select (`CIQ Contact Role`) | Coordinator / Quality / Regulatory / Key account / Other [CIA #25] |
| Can_Confirm | Boolean | May give PS-05 / PS-11 (Q-08) |
| Portal_User_Key | Text | Portal user id after provisioning (S-C9) |
| Invited_At, Last_Access_Review_On | DateTime / Date | [06 E-D-79] |
| Is_Active | Boolean | Leaver handling |

#### A5 CIQ Case Contact (access list, per case)

| Field | Type | Notes |
|---|---|---|
| Case_Contact_Key | Text R | `CIQ-2026-0142\|c.mueller@supplier.test` |
| Case_Code | Text R | |
| Contact | Reference → CIQ Supplier Contact R (lookup `Contact_Email`, `Contact_Full_Name`, `Supplier`) | |
| Is_Primary | Boolean | FLD-GEN-008 vs FLD-GEN-009 |
| Can_Confirm_On_Case | Boolean | |
| Added_By (User), Added_At (DateTime), Removed_At (DateTime) | | Access history. A removal triggers re-assignment on the open portal items (S-C1b) |

#### A6 CIQ Config Version (all versioned configuration)

| Field | Type | Notes |
|---|---|---|
| Config_Key | Text R | `TEMPLATE\|CIQ-2026\|v2`, `RULESET\|RS-2026.2`, `OWNERSHIP\|OWN-2026.1`, `RMES\|RMES-2026.1`, `LIMITS\|BDF-LIM-2026.1`, `TEXT\|TXT-2026.1`, `REMINDERS\|REM-2026.1`, `SETTINGS\|SET-2026.1` |
| Config_Kind | Select (`CIQ Config Kind`) R | Template / Rule set / Section ownership / RMES criteria / Limit set / Text bundle / Reminders / Settings |
| Version_Label | Text R | "CIQ-2026 v2", "RS-2026.2" … |
| Config_State | Select (`CIQ Config State`) R | Draft / Test / Published / Retired. Edits are allowed only in Draft (UI + hash check) |
| Payload_JSON | Textarea R | Template = ordered manifest `[{sectionKey, sectionDefId, hash}]`. Rule set = rules (condition tree, outcomes, evidence, departments, basis, note) as in prototype `Rule`. Ownership = `{sectionKey: {lead, co[], informed[]}}`. RMES = criteria (key, part, dept, title, result type, applicability rule, pre-fill source mapping). Limits = `[{substance, fieldKey, comparator, value, unit, method, loq}]`. Text bundle = `{key: {audience: "supplier"\|"internal", text}}`. Reminders = prototype `ReminderSetting[]`. Settings = `{overallApprovalRequired, reactivationMonths, defaultSupplierDueDays…}` |
| Content_Hash | Text R | SHA-256 of the canonical payload, computed by the admin UI at publish and **verified on every load** (tamper detection) |
| Paired_Config_Key | Text | Template ↔ rule set pairing (the "Turkey REACH" v2 + RS-2026.2 demo) |
| Change_Note | Textarea R | [REQ-CFG-001] |
| Regression_Result_JSON | Textarea | Scope diff for the reference materials [07 move 1] |
| Published_At (DateTime), Published_By (User) | | Set by the approver session after A8 completes |
| Supersedes_Key | Text | |

#### A7 CIQ Section Definition

Fields:
- `Section_Def_Key` Text R, e.g. `K2.1\|r3`
- `Section_Key` Text R, e.g. `K2.1`
- `Section_Code` Text, e.g. "Annex 4"
- `Section_Title` Text R
- `Section_Kind` Select (`CIQ Section Kind`)
- `Parent_Section_Key` Text
- `Sort_Order` Number
- `Rev_No` Number
- `Definition_JSON` Textarea R. Holds the fields as in the prototype `FieldDef`, with `showWhen` as a **declarative expression** (not code), validations, units, options, table columns with stable column keys, upload flags and the N/A-with-justification flag.
- `Supplier_Help_JSON` Textarea. Supplier-safe help texts.
- `Internal_Annotations_JSON` Textarea. FLM "Approval" owner, internal remarks. **Never copied to the portal.**
- `Content_Hash` Text R
- `Def_State` Select (`CIQ Config State`)

#### A9 CIQ Case (Process): header

| Field | Type | Step behaviour | Notes |
|---|---|---|---|
| Case_Code | Text R | RO after Start | `CIQ-2026-0142`. App-generated with a collision check against A29. `SequenceNumber` only if S-C14 passes [MM §4.4, §14 #59] |
| Trade_Name | Text R | | FLD-GEN-001 |
| Raw_Material | Reference → CIQ Raw Material (lookup `BDF_Material_No`, `Main_INCI`) | | |
| Supplier | Reference → CIQ Supplier R (lookup `Supplier_Legal_Name`, `DUNS_Number`; autofill) | RO after Start | Isolation unit |
| Production_Site | Reference → CIQ Supplier Site | | FLD-GEN-005 |
| Owner_RMM | User R | | Responsible BDF owner [REQ-PROC-001] |
| Target_Markets | Multiselect (`CIQ Market`) R | editable by RMM | SF-11 owned by RMM (AS-06) |
| Case_Priority | Select (`CIQ Case Priority`) | | Internal only |
| Supplier_Due_Date | Date | | Projected to the portal |
| Internal_Due_Date | Date | | Never projected |
| Template_Config_Key, RuleSet_Config_Key, Ownership_Config_Key, RMES_Config_Key, Limits_Config_Key, Text_Config_Key | Text R | RO after Start | **Pinned versions** [REQ-CFG-001, -003, -006; REQ-RMES-002, -008]. Text keys, not References, so a pinned version can never be re-pointed by a lookup change |
| Current_Cycle | Number | | 1, 2 … (resubmission / reactivation) |
| Dept_REG_Active, Dept_SAF_Active, Dept_QM_Active, Dept_MIC_Active, Dept_SUS_Active | Boolean | RO@Start; editable at "Part 1" (RMM) and "Part 2" (sync) | Written at scope release, read by I-3 |
| Overall_Approval_Required | Boolean | RO@Start, RO later | Copied from Settings at creation: the switch for AS-01 / F-29 |
| Overall_Decision | Select (`CIQ Decision`) | **RO@Start**; editable only at "Overall approval" | |
| Overall_Reason | Textarea | as above | Mandatory on rejection (UI gate) |
| Completeness_By_Name, Completeness_By_Email, Completeness_At | Text / Email / DateTime | written by I-2 | Ingested PS-05 confirmation |
| Final_Release_By_Name, Final_Release_By_Email, Final_Release_By_Role, Final_Release_At | | written by I-4 | Ingested PS-11 confirmation |
| Completion_Trigger | Text | | "Supplier final release" / "Manual by RMM: <reason>" [REQ-PROC-045] |
| Cancel_Reason | Textarea | | [REQ-PROC-049] |
| Cancelled_At (DateTime), Reactivation_Deadline (Date), Reactivates_Case_Item (Text) | | | ReqDoc §3.3.3 |
| Main_INCI, Supplier_DUNS, Origin_Types (Multiselect `CIQ Origin Type`) | | written at intake | Search [REQ-PROC-006] |
| Portal_Request_Item_Id | Text | | One-way pointer (C-P4) |
| Source_System, Source_Event_Id | Text | | Teamcenter later (§11) |

#### A16 CIQ Open Point (internal twin)

Fields:
- `OP_Key` Text R: `OP-0142-03`
- `Case_Code`, `Cycle_No`
- `Dept_Code` Select (`CIQ Review Dept`) R
- `OP_Kind` Select (`CIQ Open Point Kind`) R
- Object reference, the **same tuple as the portal**:
  - `Ref_Kind` Select (`CIQ Ref Kind`)
  - `Ref_Section_Key`, `Ref_Field_Key`, `Ref_Row_Id`, `Ref_Doc_Id`
  - `Ref_Doc_Version` Number
  - `Ref_Label` Text R
  - `Ref_Finding_Code` Text (**internal only**)
- `Internal_Justification` Textarea R
- `Responsible_User` User R [REQ-ADR-001]
- `Internal_Due_Date` Date R
- `Blocking` Boolean (default true [REQ-PROC-036])
- `Internal_Outcome` Select (`CIQ OP Outcome`)
- `Outcome_Reason` Textarea
- `Is_Closed` Boolean. Exact, because closing is always an internal action (§8).
- `Rounds_JSON` Textarea (append-only log of each round: question or return text, answer, files, by, at, evidence versions)
- `Portal_Query_Item_Id` Text
- `New_Section_Key` Text (additional part)

#### P1 CIQP Request (portal)

| Field | Type | Who writes / when | Notes |
|---|---|---|---|
| Request_Key | Text R | RMM @Start | `CIQ-2026-0142\|1` |
| Case_Code, Cycle_No | Text R / Number | RMM @Start | |
| App_Case_Item_Id | Text | RMM @Start | Opaque integration locator (C-P4) |
| Trade_Name, Supplier_Display_Name | Text | RMM @Start | Projections |
| BDF_Contact_Name, BDF_Contact_Email | Text / Email | RMM @Start | The responsible person shown to the supplier [REQ-PROC-030] |
| Markets_Label | Text | RMM | SF-11 shown read-only (AS-06) |
| Supplier_Due_Date | Date | RMM | Supplier-facing due date |
| Template_Label | Text | RMM | "CIQ-2026 v1" |
| Case_Contacts_JSON | Textarea | RMM | `[{name, email, role, canConfirm}]`, **this supplier only**. Feeds the coordinator's picker (no portal directory picker, §6.4 L9) |
| Assigned_Contacts | User/Email multi (exact type from S-C1) | RMM @Start; **RO for supplier at every step** | **M1 assignee field** for all supplier steps |
| Released_Scope_JSON | Textarea | `CIQP BDF RMM` at scope check | `[{sectionKey, code, title, applicability: "Mandatory"\|"Optional", supplierReason, addedLater, inScope}]`. **No N.A. sections, no rule ids** [REQ-PROC-009] |
| Progress_JSON | Textarea | supplier at supplier steps | Per-section done/total for the RMM view (informative; not trusted for gates) |
| Completeness_By_Name, Completeness_By_Email, Completeness_At, Completeness_Text_Ver | Text / Email / DateTime / Text | supplier at "Supplier: questionnaire" | [REQ-PROC-014] |
| Final_Release_By_Name, Final_Release_By_Email, Final_Release_By_Role, Final_Release_At, Final_Release_Text_Ver | | supplier at "Supplier: final release" | [REQ-PROC-042] |
| Supplier_Notice | Textarea | internal | Supplier-worded notices (cancellation, config change under review). **Never** the internal reason |

#### P2 CIQP Section (portal)

Fields:
- `Section_Item_Key` Text R: `CIQ-2026-0142\|1\|K2.1\|r1`
- `Case_Code`, `Cycle_No`, `Section_Key`, `Section_Code`, `Section_Title`
- `Applicability_Label` Text: Mandatory / Optional
- `Supplier_Reason` Text, e.g. "Because you selected Vegetable origin"
- `Added_Later` Boolean [REQ-ADR-002]
- `Rev_No` Number
- `Supersedes_Key` Text
- `Definition_JSON` Textarea R: the **copied** definition, without `Internal_Annotations_JSON`
- `Definition_Hash` Text R
- `Answers_JSON` Textarea. Shape: `{fieldKey: {v, unit, by, at, ver}}`. Tables are `{rows: [{rowId (UUID), …}]}` [07 F-04 stable row ids].
- `Justifications_JSON` Textarea [REQ-PROC-012]
- `Uploads` child table (S-06). Columns:
  - `Upload_Id` Text
  - `Field_Key` Text
  - `Row_Id` Text
  - `Doc_Kind` Select (`CIQP Doc Kind`)
  - `Upload_File` Attachment
  - `Original_Title` Text
  - `Version_No` Number
  - `Supersedes_Upload_Id` Text
  - `Uploaded_By_Email` Text
  - `Uploaded_At` DateTime
- `Assigned_Contacts` (M1; RO for the supplier)
- `Supplier_Responsible_Email` Text. The supplier-side assignment is *data* the coordinator sets [REQ-CTL-001]
- `Editing_By` Text, `Editing_Since` DateTime (soft lock [07 F-09])
- `Section_Done` Boolean
- `Linked_Query_Key` Text

#### P3 CIQP Query (portal)

Fields:
- `Query_Key` Text R: `OP-0142-03`
- `Case_Code`, `Cycle_No`
- `Dept_Code` Text R. Used only by step conditions; this is a routing code, not internal reasoning.
- `Kind_Label` Text: "Question from Beiersdorf" / "Document request" / "Additional section to complete". Finding-driven queries show as a question [REQ-RMES-015].
- `Ref_Section_Key`, `Ref_Field_Key`, `Ref_Row_Id`, `Ref_Doc_Id` Text
- `Ref_Doc_Version` Number
- `Ref_Label` Text R (the jump target [REQ-PROC-029])
- `Question_Text` Textarea R (**authored as supplier text**)
- `Supplier_Justification` Textarea R [REQ-PROC-030]
- `Responsible_Name` Text R
- `Supplier_Due_Date` Date R [REQ-ADR-001]
- `Round_No` Number
- `Response_Kind` Select (`CIQP Response Kind`): Answer / Document / Cannot provide [REQ-PROC-032]
- `Response_Text` Textarea
- `Response_Files` Attachment (multi)
- `Supplier_Outcome_Label` Text: Accepted / Closed by Beiersdorf / Withdrawn
- `Assigned_Contacts` (M1)
- `New_Section_Item_Key` Text

#### P4 CIQP Change Request (portal; supplier-initiated)

Fields:
- `CR_Key` Text R (generated by the supplier UI)
- `Case_Code` Text R
- `Cycle_No`
- `Change_Kind` Select (`CIQP Change Kind`)
- `Section_Key`, `Field_Key`, `Row_Id`
- `Current_Value_Text` Textarea
- `Proposed_Value_JSON` Textarea R
- `Change_Reason` Textarea R
- `Change_Files` Attachment
- `BDF_Response_Text` Textarea (supplier-worded)
- `Supplier_Outcome_Label` Text

**Integrity rule:** the triage session must verify that `_created_by` matches a `CIQ Case Contact` row for `Case_Code` before acting. Otherwise the request is rejected as invalid. A supplier could type another supplier's case code; it gains nothing, but it must not be processed.

The remaining Forms (A3, A4, A11–A15, A17–A30) are specified in §7 (versioning), §8 (open points) and §9 (RMES). The prototype-to-Kissflow mapping of every attribute is in Appendix A.

---

## 3. Lists (option sets)

These are app-prefixed per [MM §2.3, §3.8]. They must be **populated in the same apply** (PASS 1b [MM §4.11]); a required Select on an empty list blocks every submit. Seed values must equal these strings exactly [MM §3.5, §8.1]. Expected ids: `slug(Name)_A00`; read them back.

**APP lists**

| List | Items (exact strings) | Used by |
|---|---|---|
| CIQ Department | RMM, REG, SAF, QM, MIC, SUS, CUS, LEG | notes, audit, delegation |
| CIQ Review Dept | REG, SAF, QM, MIC, SUS | A10 `Dept_Code`, A16 |
| CIQ Origin Type | Vegetable (bio mass), Animal, Mineral, Petrochemical / fossil, Polymer, Waste / side stream, Carbon capture (CCU), Chemical recycling | A9 `Origin_Types`, A14 |
| CIQ Market | EU, UK, TR, CN, US, CA, OTHER | A9 `Target_Markets` |
| CIQ Applicability | Mandatory, Optional, Not applicable | A13 |
| CIQ Scope Origin | Rule, Manual extension, Subsequently activated, Removed by re-derivation | A11 result rows (inside JSON); A13 |
| CIQ Scope Trigger | Initial, Configuration change, Revert, Manual extension, Part 2 activation | A11 |
| CIQ Config Kind | Template, Rule set, Section ownership, RMES criteria, Limit set, Text bundle, Reminders, Settings | A6 |
| CIQ Config State | Draft, Test, Published, Retired | A6, A7 |
| CIQ Section Kind | Basic, Chapter, Annex, Sub-section | A7 |
| CIQ Open Point Kind | Query, Document request, Additional part, Finding query, Supplier change request | A16 |
| CIQ OP Outcome | Accepted, Not accepted – final, Withdrawn | A16 |
| CIQ Ref Kind | Section, Field, Table row, Document version | A16 |
| CIQ RMES Part | A, B, C, D | A18, A19 |
| CIQ RMES Result | Available, Plausible, Listed, Not listed, Negative, Implausible, Not applicable | A18, A19 |
| CIQ Limit Comparator | ≤, <, ≥, >, = | A18, A19 |
| CIQ Finding State | Open, Closed | A20, A21 |
| CIQ Decision | Approved, Rejected | A9, A10 |
| CIQ Confirmation Kind | Scope release, Completeness confirmation, Department completion, Final decision Safety, Final decision Regulatory, Final release, Overall decision, Cancellation, Reactivation, Manual completion | A24 |
| CIQ Doc Kind | SDS, CoA, Specification, Analysis, Certificate, Statement, Other | A15 |
| CIQ Supplier Kind | Manufacturer, Distributor, Trader | A1 |
| CIQ Contact Role | Coordinator, Quality, Regulatory, Key account, Other | A2 |
| CIQ Case Priority | Normal, High | A9 |
| CIQ Actor Side | BDF, Supplier, System | A26 |
| CIQ Country Code | ISO-3166 alpha-2 subset (seeded) | A1, A3 |

**PORTAL lists** (populated in the portal container; whether a portal Select can read an app list is UNVERIFIED, so the lists are duplicated)

| List | Items | Used by |
|---|---|---|
| CIQP Response Kind | Answer, Document, Cannot provide | P3 |
| CIQP Doc Kind | SDS, CoA, Specification, Analysis, Certificate, Statement, Other (**identical** to CIQ Doc Kind) | P2 uploads |
| CIQP Change Kind | Metadata correction, Configuration answer change, Other correction | P4 |

Questionnaire answer options (FLM radio and select values) are **not** Kissflow lists. They live in `Definition_JSON` and are rendered by our UI, which keeps them versioned with the template [REQ-CFG-001].

---

## 4. Process designs

All processes:
- end with an explicit terminal End [MM §4.6, §14 #54];
- have outcome and decision fields `RO@Start` [MM §14 #53];
- use step conditions as formulas with `=` [MM §4.6, §14 #52];
- have no explicit "Rejected" steps: native Reject or Send-back with a mandatory comment exists on every step [MM §3.6, §14 #81].

### 4.1 `CIQ_Case` (APP)

| # | Step | Owner (AppRole) | Condition | What happens | Advanced by |
|---|---|---|---|---|---|
| 0 | Start "Create case" | initiator (CIQ RMM) | — | RMM fills the header. Mandatory fields are enforced at submit [REQ-PROC-001]. Versions are pinned from the currently Published config | RMM submit; the RMM session then runs **G1** |
| 1 | Part 1 – with supplier | CIQ RMM | — | RMM's native task "monitor / chase". At the portal scope check, RMM writes `Dept_*_Active` and the `Scope_Run` here (RMM is the assignee) | **G4** via I-2 `Approve`; fallback RMM session |
| 2 | Part 2 – BDF review | CIQ Case Sync | — | Entering fires **I-3** (fan-out of review tracks) | **G5**, by the session of the reviewer who completes the last activated track |
| 3 | Awaiting supplier final release | CIQ RMM | — | — | **G6** via I-4 `Approve`; RMM manual completion in exceptional cases [REQ-PROC-045] |
| 4 | Overall approval | CIQ Overall Approver | `Overall_Approval_Required = TRUE` (syntax verified on the tenant) | Switchable gate (AS-01, F-29) [ReqDoc PS-12; REQ-RMES-014] | Approver submit / native Reject |
| 5 | End | — | — | Integration I-5: PDF + e-mail to RMM [REQ-PROC-046] | — |

- **Cancellation.** RMM uses native Reject at steps 1, 2 or 3 (RMM is the assignee, or a member of Case Sync) with `Cancel_Reason`. The RMM session then runs **G8**. The displayed state "Cancelled" is derived as `_status` = Rejected **and** `Cancel_Reason` not empty.
- **Reactivation** within `Reactivation_Deadline` uses `restartItem` (SDK [MM §6.2], UNVERIFIED S-C11). Otherwise a new `CIQ_Case` item with the same `Case_Code`, `Current_Cycle + 1` and `Reactivates_Case_Item`.
- **Known trade-off.** Members of `CIQ Case Sync` can act on step 2 in the native UI, including Reject. Mitigations: internal users work through the custom UI, every native action is in the item history, and the custom UI only offers "advance" when the sync condition holds [MM §3.4, §14 #20]. State this to BDF honestly.

### 4.2 `CIQ_Review_Track` (APP): the dynamic set of departments

Fields:
- `Track_Key` (Case|Cycle|Dept|Seq)
- `Case` (Reference → CIQ Case), `Case_Code`, `Cycle_No`
- `Dept_Code` (Select `CIQ Review Dept`)
- `Activated` (Boolean)
- **`Dept_Gate` (Text, formula `IF(Activated, Dept_Code, "NONE")`)**. A same-model formula [MM §4.4]; it avoids compound conditions.
- `Activation_Reason` (Text, e.g. "lead of K2.1, K6.1, A10")
- `Owned_Sections_JSON`
- `Assigned_Reviewer` (User). The named owner as *data* [REQ-CTL-003].
- `Track_Due_Date`
- `Reopen_Of_Key`, `Late_Activation` (Boolean)
- `Decision` (Select `CIQ Decision`, RO@Start), `Decision_Reason` (RO@Start)
- `On_Behalf_Of_Delegation` (Text)

| # | Step | Owner | Condition |
|---|---|---|---|
| 0 | Start | integration I-3 / session | — |
| 1 | Review – Regulatory | CIQ Regulatory Reviewer | `Dept_Gate = "REG"` |
| 2 | Review – Safety | CIQ Safety Reviewer | `Dept_Gate = "SAF"` |
| 3 | Review – QM | CIQ QM Reviewer | `Dept_Gate = "QM"` |
| 4 | Review – Microbiology | CIQ Microbiology Reviewer | `Dept_Gate = "MIC"` |
| 5 | Review – Sustainability | CIQ Sustainability Reviewer | `Dept_Gate = "SUS"` |
| 6 | Final decision – Safety | CIQ Safety Approver | `Dept_Gate = "SAF"` |
| 7 | Final decision – Regulatory | CIQ Regulatory Approver | `Dept_Gate = "REG"` |
| 8 | End | — | — |

**How the dynamic department set works** [REQ-PROC-017, -018; ReqDoc §3.2.1; REQ-CFG-006]:
1. At scope release (G3), the RMM session computes the departments. The rule is the lead department of every M/O section under the **pinned** ownership version (prototype `departmentsForScope`, OP-18 assumption). It writes `Dept_*_Active` on the case and `Departments_Activated` on the Scope Run.
2. At G4, the case enters step 2 and **I-3** fires. One integration (1 trigger + 5 actions [MM §4.8]) creates five tracks with literal `Dept_Code`, and `Activated` copied from `Dept_<X>_Active`.
   - Activated tracks land on their department step. **The native assignment e-mail is the department notification**, so exactly the affected departments are notified [REQ-PROC-017].
   - Non-activated tracks skip every step and end. UNVERIFIED: does an item with all steps skipped auto-complete? (S-C11, = 07 S-04). If not, the session creates only the activated tracks.
3. Departments work in parallel on separate items, with no dependency between them [REQ-PROC-018]. Static step roles natively guarantee that a Regulatory user cannot complete Safety [REQ-PROC-019, -039].
4. Completion = the department submits its review step. The UI gate refuses submission while any open point, unresolved finding or missing RMES result exists [REQ-PROC-036; REQ-RMES-006, -009]. Native steps cannot block on a formula, so the gate is our code [07 F-14]. A `CIQ Confirmation` row "Department completion" is written [REQ-PROC-038].
5. **Sync (G5).** The completing session re-reads the tracks of `(Case_Code, Cycle)` where `Activated = true`. Only *activated* tracks are awaited [ReqDoc §3.2.1]. If all have ended, it advances the app case step 2 and the portal request "Beiersdorf: review". Race window: two completions at once can each see the other as still open. The RMM "stuck case" tile and an idempotent re-check cover this [07 F-11].
6. **Late activation** (an additional part for a department not yet active [REQ-ADR-002]): the reviewer's session sets `Dept_X_Active` on the case (Case Sync is the step-2 owner) and creates a track with `Late_Activation = true`.
7. **Reopen** [REQ-RMES-012; REQ-ADR-002]: a new track item with `Reopen_Of_Key`. Ended process items are never mutated.

### 4.3 `CIQ_Config_Release` (APP)

Steps:
1. Start (CIQ Business Admin): `Config_Key`, `Change_Summary`, `Regression_Result_JSON`, `Test_Case_Codes`.
2. "Approve release" (CIQ Config Approver). The UI checks approver ≠ initiator.
3. End.

On approval, the **approver's session** does the following:
- sets `Config_State` = Published, plus `Published_At` / `Published_By` and the hash, on the version and on its paired version, as one logical publish;
- retires the previous version;
- writes an audit event.

This covers the "Turkey REACH v2 + RS-2026.2" acceptance test [REQ-CFG-001, -003].

### 4.4 `CIQP_Request` (PORTAL): the supplier-facing lifecycle

| # | Step | Owner | What the actor does | Native e-mail = |
|---|---|---|---|---|
| 0 | Start "Issue request" | initiator = RMM (session, G1) | Header projection; `Assigned_Contacts` | — |
| 1 | Supplier: basic data & configuration | `Assigned_Contacts` (**M1**) | Fills the `GEN` + `CFG` CIQP_Section items (FLD-GEN-003…005, composition, SF-01…SF-12; SF-11 read-only). The UI validates and lists every blocking field [REQ-PROC-004, -005] | Invitation / task [REQ-PROC-004] |
| 2 | Beiersdorf: scope check | CIQP BDF RMM | RMM runs G3 and releases. Native send-back to step 1 if the basic data is wrong | RMM task |
| 3 | Supplier: questionnaire | `Assigned_Contacts` | Completes the section items. **Completeness confirmation** = submit every in-scope section item to End (native freeze), write `Completeness_*`, then submit this step [REQ-PROC-012, -014, -016]. **Changing a configuration answer here** makes the UI *send the request back* to step 2 with a supplier-worded comment, giving RMM a native re-derivation task [REQ-CFG-008] | Task "Complete the questionnaire" |
| 4 | Beiersdorf: review | CIQP BDF Sync | Wait/sync step. Part-2 Q&A happens on CIQP_Query items. Entering this step triggers I-2 (G4) | (internal role only) |
| 5 | Supplier: final release | `Assigned_Contacts` | Final release: write `Final_Release_*` and submit [REQ-PROC-042] | **The single supplier notification** [REQ-PROC-040]: one step e-mail, no internal content |
| 6 | End | — | Triggers I-4 (G6). Frozen [REQ-PROC-043] | — |

**Step-level field states** [MM §4.6]:
- `Assigned_Contacts`, the header projections, `App_Case_Item_Id`: ReadOnly at steps 1, 3 and 5.
- `Released_Scope_JSON`: editable only at step 2.
- `Completeness_*`: editable only at step 3.
- `Final_Release_*`: editable only at step 5.

**Cancellation (G8):** RMM, as the initiator, withdraws the item; open sections and open queries are withdrawn the same way. The supplier's tasks end [REQ-PROC-049]. If withdraw is not available to the initiator at a supplier step, a member of `CIQP BDF Case Admin` uses the admin route (S-C11).

### 4.5 `CIQP_Section` (PORTAL)

Steps:
1. Start: initiator = RMM session (G3) or a department session (additional part).
2. "Supplier: complete section", assignee `Assigned_Contacts` (M1).
3. End.

Behaviour:
- **Writes.** The supplier writes through the assignee route (`POST /process/2/{acc}/{proc}/{item}/{act}` [MM §6.6]), sequentially, with an optimistic check on `_modified_at` and the soft lock.
- **Freeze.** Submitting to End at PS-05 freezes the section natively: a later write returns `050313` [MM §3.1].
- **Re-derivation before PS-05.** A removed section is marked `inScope = false` in the request's `Released_Scope_JSON` (RMM is the assignee there), so the section item does not need editing. At release, RMM withdraws it as its initiator, and the data stays readable. On revert, a new revision is created that copies its answers [REQ-CFG-009].
- **Part 2.** New revisions only (`Rev_No + 1`, `Supersedes_Key`), created by an accepted change or an additional part.
- **E-mail flood risk.** About 40 section items mean about 40 assignment e-mails at release [07 E-P-92]. S-C8 checks per-step e-mail suppression. If that is impossible, the fallback is about 8 **work-package items** (Basic data, Composition K2, Safety K4, Micro K5, Regulatory K6, Customs/Legal K7–K8, Origin annexes A1–A4/A9, Regulatory annexes A5–A8/A10–A13), each with a section-level soft lock.

### 4.6 `CIQP_Query` (PORTAL): the clarification loop

| # | Step | Owner | Condition |
|---|---|---|---|
| 0 | Start "Raise" | initiator = reviewer session | — |
| 1 | Supplier: respond | `Assigned_Contacts` | — |
| 2 | Beiersdorf review – Regulatory | CIQP BDF Regulatory | `Dept_Code = "REG"` |
| 3 | Beiersdorf review – Safety | CIQP BDF Safety | `Dept_Code = "SAF"` |
| 4 | Beiersdorf review – QM | CIQP BDF QM | `Dept_Code = "QM"` |
| 5 | Beiersdorf review – Microbiology | CIQP BDF Microbiology | `Dept_Code = "MIC"` |
| 6 | Beiersdorf review – Sustainability | CIQP BDF Sustainability | `Dept_Code = "SUS"` |
| 7 | End | — | — |

The supplier can see step names; this is checked in S-C8.

Actions on a query:
- **Accept.** Submit the department step. The reviewer session writes `Supplier_Outcome_Label` = Accepted, sets the twin's `Is_Closed = true` / `Internal_Outcome`, ingests the round, and writes an audit event with the evidence version [REQ-PROC-034].
- **Return.** Native **send-back** to step 1 with a mandatory comment, which *is* the supplier-visible justification. The UI labels the comment box "Visible to supplier". `Round_No + 1` [REQ-PROC-034, -035].
- **Not accepted – final.** Submit with `Supplier_Outcome_Label` = "Closed by Beiersdorf". The internal rationale goes to the twin only.
- **Withdraw.** The initiator withdraws (S-C11).
- **Traffic light** [REQ-PROC-034], derived from `_current_step`:
  - red = at step 1;
  - amber = at a review step;
  - green = End.
  The loop status is never a custom select [MM §3.6].
- **Only the responsible department can move it**: static role per conditional step [REQ-PROC-034, REQ-RMES-011]. Reassignment uses native reassign plus a `CIQ Delegation` row.

### 4.7 `CIQP_Change_Request` (PORTAL)

Steps:
1. Start: initiator = supplier contact. The supplier role holds `InitiateItems` only on this portal process.
2. "Beiersdorf: assess change", owned by CIQP BDF RMM.
3. End.

RMM triage:
1. Verify the initiator against the case contacts (§2.4 integrity rule).
2. If accepted, create the new `CIQP_Section` revision with the proposed values copied in, and create a twin `CIQ Open Point` (kind "Supplier change request").
3. Run the scope-impact check (re-derive if a configuration answer changed [REQ-PROC-007, REQ-CFG-008]).
4. Flag the affected RMES results as `Impacted` and notify the departments whose assessment used that source [REQ-PROC-031, REQ-RMES-012].

**After the final release,** every change request is rejected with "CIQ frozen after final release" and an audit event "Rejected change attempt" is written. That meets "rejected and logged" [REQ-PROC-043].

### 4.8 How the supplier steps work (M1)

- **Platform assignee.** Every supplier step uses one assignee field, `Assigned_Contacts`, which holds **all named contacts of that case** (from `CIQ Case Contact`). Any of them can act. UNVERIFIED: does a multi-user field mean "any of" or "all of"? (S-C1).
- **Supplier-side assignment is data.** The coordinator sets `Supplier_Responsible_Email` on sections and queries, picking from `Case_Contacts_JSON` (the case's own contacts only). That satisfies "assignment on the supplier side … exclusively by the supplier" [REQ-CTL-001] **without** opening a portal-wide user picker.
- **Per-answer attribution.** The supplier UI stamps `{by, at}` per answer from `kf.user`, and native history records `_modified_by` per save [REQ-CTL-001]. Residual risk: a contact could forge a colleague's stamp *within the same supplier*. Not a cross-supplier issue.
- **Contact added or removed mid-case.** RMM updates `CIQ Case Contact`, and a `CIQP BDF Case Admin` session re-assigns the open portal items (reassign or admin update; S-C1b).

### 4.9 Integrations (all authored by the 2-pass shape [MM §4.8]; **all ship `IsActive:false` and need a human to activate them**)

| Id | Trigger (container) | Action(s) (container) | Field map | Gate |
|---|---|---|---|---|
| I-2 | `CIQP_Request` · ItemEntersToStep "Beiersdorf: review" (PORTAL) | `CIQ_Case` · UpdateAnItem (`Completeness_*`), then `Approve` step 1 (APP), locator `App_Case_Item_Id` | copy only | G4 |
| I-3 | `CIQ_Case` · ItemEntersToStep "Part 2 – BDF review" (APP) | 5 × `CIQ_Review_Track` · CreateAndSubmitItem (APP) | `Dept_Code` literal; `Activated` ← `Dept_<X>_Active`; `Case_Code`, `Current_Cycle`, case `_id` | fan-out |
| I-4 | `CIQP_Request` · ItemCompleted (PORTAL) | `CIQ_Case` · UpdateAnItem (`Final_Release_*`), then `Approve` step 3 (APP) | copy only | G6 |
| I-5 | `CIQ_Case` · ItemCompleted (APP) | GeneratePDF + Email to `Owner_RMM` (S-07), **or** Webhook → external renderer that writes `CIQ Final Document` | — | PS-12 |

Cross-container triggers and actions (I-2, I-4) are **UNVERIFIED (S-C6)**. The fallback is session sync (§2.1). Integrations cannot loop, compute or branch [MM §4.8], so none of them carries business logic.

---

## 5. Roles and the grant matrix

### 5.1 Roles

**APP:**
- Defaults: `Admin` (platform admins only) and `User` (granted nothing).
- 17 custom roles: `CIQ RMM`, `CIQ Regulatory Reviewer`, `CIQ Safety Reviewer`, `CIQ QM Reviewer`, `CIQ Microbiology Reviewer`, `CIQ Sustainability Reviewer`, `CIQ Safety Approver`, `CIQ Regulatory Approver`, `CIQ Customs (Informed)`, `CIQ Legal (Informed)`, `CIQ Overall Approver`, `CIQ Business Admin`, `CIQ Config Approver`, `CIQ Auditor`, `CIQ Process Owner`, `CIQ Case Sync` (members = all reviewers + RMM + service user), `CIQ Integration Service` (service user only).
- This follows [BRM REQ-CFG-004] plus the roles the BRM omits [03 C-3, P-12].

**PORTAL:**
- Defaults: portal `Admin` and default role (granted nothing).
- 11 custom roles:
  - `CIQP Supplier Contact`: **all** external users of **all** suppliers. A single role is safe *only because* it holds no View grant and isolation comes from participation.
  - `CIQP BDF RMM`
  - `CIQP BDF Case Admin`: RMM leads, for cancel and reassign.
  - `CIQP BDF Regulatory`, `CIQP BDF Safety`, `CIQP BDF QM`, `CIQP BDF Microbiology`, `CIQP BDF Sustainability`
  - `CIQP BDF Sync`: all reviewers + RMM.
  - `CIQP BDF Reader`: every internal user, incl. auditor, customs, legal, owner.
  - `CIQP Integration Service`
- Internal users in portal roles are **UNVERIFIED (S-C3)**. If "linked roles" across containers exist [MM §6.7, §11 rule 4], we link the portal roles to the app roles instead of maintaining membership twice.
- **No per-supplier roles.** They do not scale, and step owners are static [MM §4.6; 07 CIA #25/#26 reframe].
- Every role gets verified members: `PUT /app_role/2/{acc}/{roleId}?_application_id=…` with `Users[]`, then a per-role GET to check `UserCount`. Retry on the ~1-in-15 flake [MM §3.2, §14 #7].

### 5.2 Grant matrix

Grants are made via `POST /flow/2/{acc}/{family}/{flow}/member/batch` [MM §3.4].

Legend:
- **I** = Process `Member` `["InitiateItems"]`
- **M** = Process `Member` `[]`: act on assigned or role steps only (whether it really excludes initiation is checked in S-C7)
- **V** = Process `Member` `["View"]` / report View on all items, or Form `Viewer` `[]`
- **E** = Form `Member` `["Delete"]`: edit. S-C12 checks whether create-without-delete exists.
- **A** = Admin
- **–** = none

**APP:**

| Flow ↓ / Role → | RMM | REG | SAF | QM | MIC | SUS | SAF-Apr | REG-Apr | CUS | LEG | Overall | BizAdm | CfgApr | Auditor | Owner | CaseSync | Svc |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| A1–A4 masters | E | V | V | V | V | V | V | V | V | V | V | E | V | V | V | – | E |
| A5 Case Contact | E | V | V | V | V | V | V | V | V | V | V | – | – | V | V | – | E |
| A6–A7 config | V | V | V | V | V | V | V | V | V | V | V | E | E | V | V | – | V |
| A8 Config Release | – | – | – | – | – | – | – | – | – | – | – | I | M | V | – | – | – |
| A9 CIQ Case | I | V | V | V | V | V | V | V | V | V | M | – | – | V | V | M | M |
| A10 Review Track | I | M | M | M | M | M | M | M | V | V | V | – | – | V | V | – | I |
| A11–A15 scope / snapshots / components / documents | E | E | E | E | E | E | E | E | V | V | V | – | – | V | V | – | E |
| A16 Open Point twin | E | E | E | E | E | E | E | E | V | V | V | – | – | V | V | – | – |
| A17 RMES Record | E | E | E | V¹ | V¹ | V¹ | E | E | V¹ | V¹ | V | – | – | V | V | – | – |
| A18 RMES Safety Result / A20 Safety Finding | V | **V** | E | V¹ | V¹ | V¹ | E | V | V¹ | V¹ | V | – | – | V | V | – | – |
| A19 RMES Regulatory Result / A21 Regulatory Finding | V | E | **V** | V¹ | V¹ | V¹ | V | E | V¹ | V¹ | V | – | – | V | V | – | – |
| A22 AI Suggestion | V | E | E | V | V | V | E | E | V | V | V | – | – | V | – | – | – |
| A23 Internal Note | E | E | E | E | E | E | E | E | E | E | E | – | – | V | V | – | – |
| A24 Confirmation, A26 Audit Event, A27 Notification Log | E² | E² | E² | E² | E² | E² | E² | E² | V | V | E² | E² | E² | V | V | – | E² |
| A25 Delegation | E | V | V | V | V | V | E | E | V | V | V | – | – | V | – | – | – |
| A28 Final Document | V | V | V | V | V | V | V | V | V | V | V | – | – | V | V | – | E |
| A29 Case Index | E | E | E | E | E | E | E | E | V | V | V | – | – | V | V | – | E |
| A30 Portal Link | E | E | E | E | E | E | – | – | – | – | – | – | – | V | – | – | E |

¹ The default follows [REQ-PROC-019]: "all internal roles read all project content". [REQ-CFG-004] "(only PDF documents from supplier)" and 03 C-1 / C-11 may narrow RMES visibility to SAF, REG, RMM, Auditor and Overall. That narrowing is a grant change, not a model change. Ask U-03.

² An append-only register written by sessions. If S-C12 shows a Form Member must hold `Delete` to create, the register is still **tamper-evident** (hash chain, §7.5) but not tamper-proof. We say so in the pitch [07 VQ r12 reframe].

**PORTAL:**

| Flow ↓ / Role → | **Supplier Contact** | BDF RMM | BDF Case Admin | BDF REG/SAF/QM/MIC/SUS | BDF Sync | BDF Reader | Svc |
|---|---|---|---|---|---|---|---|
| P1 CIQP_Request | **M (no View)** | I + V | A | V | M + V | V | A |
| P2 CIQP_Section | **M (no View)** | I + V | A | I + V | – | V | A |
| P3 CIQP_Query | **M (no View)** | I + V | A | I + V (each dept owns its review step) | – | V | A |
| P4 CIQP_Change_Request | **I (no View)** | M + V | A | V | – | V | A |
| P5 CIQP_Help_Article | V | E | – | – | – | V | – |
| Portal lists | read | read | read | read | read | read | read |

### 5.3 Escalation traps, and the counter-measure built into this design

| # | Trap | Source | Counter-measure |
|---|---|---|---|
| T1 | `Editable` / Member on a Process silently includes `InitiateItems`. A supplier could create a `CIQP_Query` or `CIQP_Section` and point `Assigned_Contacts` at another supplier's contacts (spam or phishing; not a read leak) | MM §3.4, §4.7, §14 #20 | S-C7 must show that Member `[]` cannot initiate. Otherwise: (a) `Assigned_Contacts` RO at Start, *if* step permissions bind the create payload (S-C7); (b) the supplier UI and the intake ignore and flag any CIQP_Request/Section/Query whose `_created_by` is not internal; (c) the leak test includes "supplier creates an item for a foreign contact" |
| T2 | **Page-driven auto-grant.** A native page card or nav entry on a flow grants that role report View on every item, and escalates Viewer → Editable | MM §3.4, §4.7, §14 #21 | **No native page or nav in the portal references a CIQP flow for `CIQP Supplier Contact`.** Portal apply with `ir.pages=[]`; disable `ensureExperience` [MM §4.11]. Post-apply audit: `GET /flow/2/{acc}/process/{flow}/report?_application_id={PORTAL}`, then every report's members must exclude the supplier role. Re-run after every portal change |
| T3 | The engine's `ir.permissions[]` = membership + report View on **all** items | MM §4.7 | Supplier grants are made by direct `member/batch` calls **without** report grants, never through `ir.permissions[]`. Then read back `GET /flow/2/{acc}/process/{flow}/member` |
| T4 | Form members see all rows; Board members see all cards | MM §3.5, §5.4 | No supplier-specific Form or any Board in the portal (C-P3) |
| T5 | Dataset "Everyone → Viewer" sharing; default "User"/"Everyone" groups may include portal users | MM §11.4 | No Datasets at all. Default roles are granted nothing. S-C2 checks what "Everyone" contains |
| T6 | `423` grant-lock during publish; checkpoints mark failed grants as done | MM §3.4, §14 #16 | Serial grants with retry, a **final re-grant pass**, and every grant response read back |
| T7 | A role with 0 members makes submit return 403 | MM §3.2, §14 #7 | Add members, then verify by per-role GET before testing |
| T8 | Admin-route writes "work" for testers who are admins | MM §14 #33 | All leak and acceptance tests run as genuinely non-admin supplier and reviewer users |
| T9 | Cross-container Reference or lookup would project app rows into a portal form | (inferred) | Forbidden (C-P4). Keys are Text |
| T10 | A User-type field in a portal form may open a **portal-wide user picker** (names and e-mails of every supplier's staff) | (inferred) | `Assigned_Contacts` is RO for the supplier everywhere; the coordinator picks from `Case_Contacts_JSON`. S-C2 checks the picker |
| T11 | Native item comments or notes on a portal item are visible to the supplier | (inferred) | Internal users never comment on portal items. Internal discussion goes to `CIQ Internal Note`. The send-back comment box is labelled "Visible to supplier" |
| T12 | Cross-app "Linked-role" grants may need a tenant admin in Studio | MM §6.7, §11 rule 4 | Plan a Studio session with the tenant admin. Spike S-C3b |

---

## 6. Supplier isolation and internal confidentiality

### 6.1 Isolation ladder: supplier A vs supplier B (inside the portal)

| Rung | Mechanism | Holds if | Strength | Cost |
|---|---|---|---|---|
| **M1 (primary)** | Participation: supplier steps assigned from `Assigned_Contacts` on each item. Supplier role has membership but no View. The supplier UI lists only with `getMyItems` / `getMyTasksItems` / `getParticipatedItems` [MM §6.2] | S-C1 (field-driven assignee with portal users) **and** S-C2 (no cross-item GET, file, search or e-mail leak) | Server-enforced, per record | Baseline |
| M2 | Native portal organisation scoping (portal users belong to a company; records are shared per company) | S-C2b finds such a model, enforced server-side | Server-enforced; nicer coordinator UX | Baseline, if it exists |
| M3 (rejected as primary) | Supplier-initiated items (participation by initiator, like P4) bootstrapped by an invitation code typed into the portal | Always works technically | Server-enforced | Colleagues cannot see each other's items, so it breaks the coordinator view [REQ-CTL-001]. Outer-URL parameters do not reach the iframe [MM §6.11], so the code must be typed in. **Kept only for P4** |
| M4 (last resort) | **Mediated broker.** The supplier holds **no** Kissflow flow grants. The portal UI calls a small BDF-approved service, which holds keys server-side, enforces "only your cases" and acts under a service identity [07 §4.1] | Always | Strong; we own the enforcement | +3–5 builder-days, a hosted component BDF IT must accept, a weaker low-code story [07 CIA #4, #19] |

**Decision gate (end of spike day 1):** M1 passes → build. M1 fails and M2 passes → build M2. Both fail → M4. Decide before any portal flow is authored [MM §0.2 #5].

### 6.2 Where the supplier-facing workflow lives (depends on S-C3 and S-C6)

| Option | Holds if | Shape |
|---|---|---|
| **P (primary)** | S-C3: internal users can be members of portal roles and own and act on portal process steps | As in §4: `CIQP_Request` carries the internal hand-off steps (scope check, review sync) |
| A | Internal users can initiate and read portal items, but cannot own portal steps | Portal processes contain **only supplier steps**: `CIQP_Request` becomes a chain of supplier task items (`Start(internal) → Supplier → End`), one per phase. Scope check and sync move to `CIQ_Case` steps. Every supplier step's completion is a gate (I-x or session sync). CIQP_Query: `Start → Supplier respond → End`; a return = a new round item linked to the twin. +1.5–2 days |
| I | Internal users cannot be portal members at all | Integration-only airlock (W1 for every crossing), or M4. Re-plan |

### 6.3 Internal confidentiality: what never enters the portal

These live only in app flows:
- RMES criteria, results, limits, findings, AI suggestions [REQ-RMES-003, -015; REQ-PROC-021, -024]
- internal notes [REQ-PROC-020]
- the internal justification, finding link, blocking flag, internal due date and outcome rationale of open points
- rule ids, N.A. sections and their reasons [REQ-PROC-009]
- department activation and track states, decisions, overall approval [REQ-PROC-040]
- cancellation reason
- reviewer assignments
- the final PDF (unless BDF decides a supplier copy, Q-12; then a supplier-safe variant is written to `CIQP_Request`)
- audit and notification logs
- config drafts and internal annotations

### 6.4 Leak-channel checklist (becomes the supplier-role test script, run per release)

| # | Channel [06 E-D-74] | Design answer | Verified by |
|---|---|---|---|
| L1 | Listing / search | Supplier has no View; process listing for non-admins is `/myitems` only [MM §3.6]. Portal search scope | S-C2 |
| L2 | Direct GET of another supplier's item id | Must return 403 | S-C2: `kf.api GET /process/2/{acc}/CIQP_Section_A00/{itemOfB}/{actOfB}?_response_type=full` as A |
| L3 | Attachments | Supplier files only in portal items; no internal files in the portal; file URL authorisation | S-C2: open B's `Upload_File` URL as A, and anonymously |
| L4 | E-mails | Portal step e-mails render only portal fields (all supplier-safe). The app never e-mails suppliers | S-C8 |
| L5 | Item history / progress | Internal steps on portal items are named neutrally; comments are supplier-facing by design (T11) | S-C8 (`getProgress`) |
| L6 | Status labels | Supplier sees its own phases ("Beiersdorf review in progress"), never department states [REQ-PROC-040] | UI review |
| L7 | PDFs / exports | Internal PDF in the app only | design |
| L8 | Lookups / aggregates | None in portal flows (C-P4) | schema audit script |
| L9 | User pickers / portal directory | T10 | S-C2 |
| L10 | Native pages / report grants | T2, T3 | grant audit script |
| L11 | Cancellation reason | Internal reason in the app; supplier notice text separate | design |
| L12 | AI output | App only | design |
| L13 | Devtools on the supplier's own session | The supplier's session can only reach portal flows it participates in, and those contain only supplier-safe fields. **This is the property BDF's tester will probe with devtools** | S-C2 |

### 6.5 Internal need-to-know (inside BDF)

| Topic | Design |
|---|---|
| Read everything vs edit only own area | Read everything by default [REQ-PROC-019]. Edit is restricted natively where BDF will test it: review steps per department role; RMES results and findings split per department (A18–A21) [REQ-CFG-004 acceptance: "Regulatory … cannot edit Safety"] |
| Shared registers | (A11–A16, A23) are editable by all reviewers. Accepted risk: tamper-evident through the audit hash chain, not prevented |
| Customs, Legal | Informed, read-only (AS-07). No track |

---

## 7. Versioning and immutability

### 7.1 Template versions [REQ-CFG-001, -002]

- **Copy-on-write.** Editing a section creates a new `CIQ Section Definition` record (`Rev_No + 1`) and a new Draft `CIQ Config Version` (Template). Its manifest points at the new section rev; unchanged sections are shared.
- **Publish** goes through `CIQ_Config_Release` (four-eyes). Published = immutable *by state + hash*. The UI refuses edits and the loader verifies the hash.
- **Pinning by construction.** At G3 the section's `Definition_JSON` (minus internal annotations) is **copied** into each `CIQP_Section`. A running case therefore renders v1 after v2 is published, because it never reads config again. This is the "Turkey REACH" acceptance test.
- **Draft / Test.** Test-state versions can be used only by cases flagged `Test_Case` (no supplier e-mails). This answers 07 Q-16. A cross-tenant config package export is an alternative.

### 7.2 Rule-set versions [REQ-CFG-003; REQ-PROC-009, -010]

- One `CIQ Config Version` (Rule set) holds `Payload_JSON` with every rule and its hash. The evaluator is a pure function shared with the prototype (`deriveScope`, `diffScope`, `requiredEvidence`).
- Every run writes a `CIQ Scope Run`: `Input_Config_JSON`, `RuleSet_Config_Key`, `RuleSet_Hash`, `Template_Config_Key`, `Result_JSON` (every section incl. N.A., with fired rule ids and reasons), `Diff_JSON` vs the previous run, `Run_Hash`, `Run_By`, `Run_At`, `Trigger`, `Departments_Activated`.
- Same input + same version → same `Result_JSON`. A test asserts this.
- Manual extension [REQ-CFG-007] = a new run with `Trigger` = Manual extension and `Override_Justification` (R). Re-derivation [REQ-CFG-008] = a new run plus a diff. Revert [REQ-CFG-009] = a new run, and the retained answers come back (§4.5).
- **The supplier preview runs the same evaluator client-side for UX only. The authoritative run is the RMM's** [07 F-03 tamper note].

### 7.3 Other versioned configuration

Section ownership, RMES criteria, limit sets, text bundles and reminders follow the same pattern: one record per version, a hash, a pinned key on the case (or on the RMES record), and the four-eyes publish [REQ-CFG-006; REQ-RMES-002, -008; CIA #5].

### 7.4 Review version and freeze

| Moment | What becomes immutable | How |
|---|---|---|
| PS-05 completeness [REQ-PROC-016] | All in-scope `CIQP_Section` items | Submitted to End; native read-only for the supplier. Intake (G4b) copies them into `CIQ Section Snapshot` (one per section, rev 1, `Snapshot_Hash`) + `CIQ Component` + `CIQ Document`, and writes `CIQ Review Version` (cycle n; manifest `{sectionKey: snapshotId + hash}`; `Version_Hash`) |
| Part 2 change | Nothing is overwritten | Accepted change or additional part → a new portal section item (`Rev_No + 1`) → a new snapshot row. The RMES results that used the old rev are flagged `Impacted` [REQ-RMES-012; REQ-PROC-031] |
| Every assessment | Its sources | Results, findings and confirmations stamp `Source_Section_Rev` / `Source_Doc_Version` [REQ-PROC-016; REQ-RMES-005] |
| PS-11 final release [REQ-PROC-043] | Request + all sections | Request at End. Later change attempts → `CIQP_Change_Request` rejected + audit "Rejected change attempt". Direct writes are refused natively (`050313`) |
| Resubmission / reactivation | Previous cycle | New cycle: a new `CIQP_Request` + section copies (`Cycle_No + 1`) [ReqDoc §3.1.5] |

### 7.5 Audit [REQ-CTL-009; REQ-RMES-016]

There are two layers:
- **Native item history in both containers.** Step moves, comments, field changes, `_modified_by`.
- **`CIQ Audit Event`** (hash chain). Fields:
  - `Seq_No`, `Case_Code`
  - `Actor_Name`, `Actor_Email`, `Actor_Side`, `On_Behalf_Of`
  - `Action_Code`, `Object_Kind`, `Object_Key`, `Object_Version`
  - `Template_Key`, `RuleSet_Key`, `Limits_Key`
  - `Detail`, `Prev_Hash`, `Event_Hash`, `Event_At`

How it is written and checked:
- Supplier actions are recorded **at ingestion**, sourced from portal native fields. The supplier cannot write to the app.
- A verifier in the Auditor view recomputes the chain.
- **Wording to BDF:** "tamper-evident business audit plus platform history". Do not say "unalterable even by admins": admin routes exist [MM §3.6; 07 VQ r12].

---

## 8. Open points, queries, document requests, findings

| Concept | Portal record (supplier-facing) | App record (internal) |
|---|---|---|
| Query, document request, additional part, finding-driven query | `CIQP_Query` (loop, answers, files, supplier wording, supplier due date) | `CIQ Open Point` twin (dept, kind incl. "Finding query", internal justification, responsible user, internal due date, blocking, outcome, `Rounds_JSON`) |
| Additional part [REQ-ADR-002] | `CIQP_Query` (Kind "Additional section") + a new `CIQP_Section` (`Added_Later = true`) | Twin + `CIQ Scope Run` (Trigger "Part 2 activation") + late track if needed |
| Finding [REQ-RMES-009, -010] | **Nothing.** It only appears once a reviewer writes a supplier question | `CIQ Safety Finding` / `CIQ Regulatory Finding`. "Publish" = create a twin + a `CIQP_Query` with *new supplier wording*; set `Open_Point_Key` [06 E-D-75] |
| Supplier change request | `CIQP_Change_Request` | Twin of kind "Supplier change request" |

**Object reference** (the same keys in both records; the label is shown to the supplier) [REQ-PROC-029]:
- `Ref_Kind`: Section / Field / Table row / Document version
- `Ref_Section_Key`, `Ref_Field_Key`, `Ref_Row_Id` (a stable UUID from `Answers_JSON` table rows)
- `Ref_Doc_Id` + `Ref_Doc_Version`
- `Ref_Label`, e.g. "K2.1 › component 3 (INCI …) › CAS number"

`Ref_Finding_Code` exists **only on the twin**. The jump target is an in-app router path built from the keys. E-mail links land on the inbox, because outer-URL parameters do not reach the iframe [MM §6.11]. A query cannot be sent without a reference, a responsible person and a due date; this is a UI gate, because no conditional-required primitive exists [MM §4.4; REQ-PROC-029; REQ-ADR-001].

**Status, history, blocking:**
- Traffic light from `CIQP_Query._current_step` (§4.6).
- Chronological history at the object: portal native history + twin `Rounds_JSON` [REQ-PROC-033].
- The completion gate counts twins of `(case, cycle, dept)` with `Is_Closed = false`. This is exact, because every closing transition is an internal action that writes the twin. Plus open blocking findings, RMES results missing, and decision missing for SAF/REG [REQ-PROC-036, -039].
- A per-type blocking default of "all block" follows the BRM [D-03].
- Two due dates: `Supplier_Due_Date` (portal) and `Internal_Due_Date` (twin) [D-14].

---

## 9. RMES model (internal only)

| Flow | Key fields | Rules |
|---|---|---|
| `CIQ RMES Record` | `RMES_Key` (Case\|Cycle; **exactly one** per confirmed CIQ [REQ-PROC-021]), `Case` (Ref), `Case_Code`, `Cycle_No`, `Review_Version_Key`, `RMES_Config_Key`, `Limits_Config_Key`, `Created_At`, `Created_By` | Created idempotently at intake when SAF or REG is activated |
| `CIQ RMES Safety Result` / `CIQ RMES Regulatory Result` (same schema) | `Result_Key` (RMES_Key\|Criterion\|Seq), `RMES_Key`, `Criterion_Key` (e.g. `S-A1`), `RMES_Part` (A–D), `Criterion_Title`, `Applicable` (Boolean), `Applicability_Basis`, `Override_Reason`, `RMES_Result` (Select), `Result_Comment`, `Source_Section_Key`, `Source_Field_Key`, `Source_Row_Id`, `Source_Doc_Id`, `Source_Doc_Version`, `Source_Section_Rev`, `Prefill_Value`, `Reported_Value` (Number), `Reported_Unit`, `Limit_Value`, `Limit_Comparator`, `Limits_Version_Label`, `Limit_Pass` (Boolean), `Impacted` (Boolean), `Impacted_Reason`, `Recorded_By` (User), `Recorded_At`, `Supersedes_Key`, `AI_Suggestion_Key` | **Append-only:** a re-evaluation is a new row with `Supersedes_Key`, and the current row is the latest [REQ-RMES-016]. A Negative, Implausible or N.A. result, or an override, needs a comment (UI gate) [REQ-RMES-007]. Pre-fill comes from the snapshot per the mapping in the RMES config [REQ-PROC-022; REQ-RMES-005]. **Split per department = native "Regulatory cannot edit Safety"** [REQ-RMES-003] |
| `CIQ Safety Finding` / `CIQ Regulatory Finding` | `Finding_Code`, `RMES_Key`, `Result_Key`, `Finding_Text`, `Blocking`, `Finding_State`, `Raised_By`, `Raised_At`, `Closed_By`, `Closed_At`, `Close_Reason`, `Open_Point_Key` | A limit exceedance (e.g. As > 0.5 mg/kg under BDF-LIM-2026.1 [Feldkatalog r27–r29]) auto-creates a blocking finding [07 F-15] |
| Final decisions | `CIQ_Review_Track` steps "Final decision – Safety / Regulatory" (`Decision`, `Decision_Reason`) + a `CIQ Confirmation` row | Static approver roles; a delegation is recorded [REQ-RMES-013; REQ-PROC-039] |
| AI | `CIQ AI Suggestion`: `Doc_Key`, `Doc_Version`, `Quoted_Passage`, `Claim`, `Suggestion_State` (Proposed / Confirmed / Discarded), `Decided_By`, `Decided_At`, `Model_Label` | Marked, sourced, confirm or discard [REQ-PROC-024] |

Dashboard states [REQ-RMES-018] are derived from the track step, the twins, the findings and the due dates. The RMES export (REQ-RMES-020) is internal only.

---

## 10. Custom UI: how it reads and writes, and what stays native

| Container | UI | Users | Reads | Writes |
|---|---|---|---|---|
| APP | **"CIQ Workbench"**, app-level custom UI (React, `@kissflow/app-core`, architecture A [MM §6.1]) | All internal roles; role-gated by `kf.user.AppRoles` [MM §6.7]; no dev switcher in production | App Forms via `kf.app.getDataform(id).getItems` (paged) [MM §3.5, §6.5]. App processes via `getMyTasksItems`, `getItem`. **Portal items via `kf.api` with `_application_id={PORTAL}`** (single-item GET, myitems, admin GET for Case Admin; S-C4) | Sequential creates (draft → submit; new id) [MM §3.5]. Process create/submit [MM §3.6]. Step actions via SDK `submitItem` / `sendbackItem` / `rejectItem` / `reassignItem` [MM §6.2]. Cross-container writes to portal flows through `kf.api` (G1, G3, G5, G7, G8). Every write is read back [MM §0.2]. The ledger is updated |
| PORTAL | **"CIQ Supplier Portal"**: custom UI *if portals support it* (S-C10). Otherwise native portal pages hosting **one page-level custom component** (single-file, `kf.initialize()` [MM §6.9]) whose only data access is participation-scoped calls | `CIQP Supplier Contact` | `getMyItems` / `getMyTasksItems` / `getParticipatedItems` on CIQP_Request/Section/Query/Change_Request; per-item `getItem` | Assignee-route updates on its own section and query items; `submitItem` at its steps; `sendbackItem` (config change); `createItem` **only** on `CIQP_Change_Request`; files via `kf.client.openFilePicker` / `uploadFile` into attachment fields [MM §6.6] (S-C5). **Never** calls the app container, never uses admin routes, holds no keys |

**Kept native:**
- process steps and static owners
- native assignment e-mails (the single supplier notification [REQ-PROC-040]; department notifications [REQ-PROC-017])
- the send-back loop with mandatory comment, and Reject
- step-level freezes
- SLA on supplier steps plus `SlaBreached` → Email for escalation [MM §4.8]
- item history
- native reports for analysts

**Our code:**
- the questionnaire renderer
- the scope evaluator and the regression runner
- the completeness and completion gates
- the G-sync routines and the stuck-case tile
- the hash chain
- dashboards (native cards are static [MM §5.1])
- the data-driven reminder sender (the Scheduler cannot iterate rows [MM §4.8])

**Engineering rules** [MM §6.3–§6.6, §13]:
- Plain-object `kf.api` bodies.
- Check `isLive()` per call.
- Sequential dataform creates.
- Sequential child-table writes.
- Refuse-and-strip on `050313`.
- One `val()` unwrap helper.
- Seeded fallback rows in the raw field-id shape.
- A diagnostic surface for developers.

---

## 11. Later integrations (Teamcenter, B-Flow, SAP): keys to store now

| System | Use later | Keys stored now (field → flow) |
|---|---|---|
| Teamcenter | Webhook start of a case [CIA #1]; status call-out on completion [CIA #18] | `Teamcenter_Supplier_Id` (A1), `Teamcenter_Material_Id` (A4), `Source_System` + `Source_Event_Id` (A9; idempotency for webhook starts), `BDF_Material_No`, `IRMA_Ref` (A4) |
| B-Flow | File the final package and evidence [CIA #12, #15; ReqDoc PS-13] | `BFlow_Folder_Id` (A9), `BFlow_Doc_Id` + `BFlow_Filed_At` + `BFlow_Filing_State` (A15, A28) |
| SAP MDG | Supplier / material master [CIA #32] | `SAP_Vendor_Id` (A1), `SAP_Material_No` (A4) |

All of these go into the **app** only. External systems never touch the portal. The mechanism is Webhook / HTTP connector → `CreateAndSubmitItem` on `CIQ_Case`, or ItemCompleted → HTTP, within the integration limits (1 trigger + ≥1 action, no loops, human activation) [MM §4.8; 07 F-24].

---

## 12. Build order

This follows MM §4.11, §16-R1, §8.2 and A9: backend first; referenced things before referencers; read back each layer.

0. **Spikes S-C0…S-C14** (§13) in a sandbox app and portal if the tenant offers one. Otherwise use `ZZ Spike …` flows in the target containers and archive them afterwards, because published apps and integrations are permanent [MM §3.9, §4.8]. Decision memo: Option P/A/I and rung M1/M2/M4.
1. **Comprehend both containers** (R11): list flows, roles and pages for `KF_APP_ID` and `KF_PORTAL_ID`; record `.env` (`KF_DOMAIN`, `KF_ACCOUNT_ID`, `KF_APP_ID`, `KF_PORTAL_ID`, key id and secret; never echoed [MM §1.1]).
2. **Roles**: app first, then portal. Reuse by normalized name; abort if the list cannot be read [MM §4.11].
3. **Members**: `Users[]` PUT, then GET to verify `UserCount`. Test users: 2 synthetic suppliers × 2 contacts; one user per internal role [MM §3.2].
4. **Lists + items**: app, then portal (PASS 1b) [MM §3.8].
5. **App masters** (A1–A5).
6. **App config** (A6, A7) + `CIQ_Config_Release`.
7. **App registers** (A11–A30).
8. **Portal processes**: P2 `CIQP_Section`, P3 `CIQP_Query`, P4 `CIQP_Change_Request`, P1 `CIQP_Request`, then P5. No cross-flow References, so any order works; this one is chosen for readability. Supplier assignee steps per the S-C1 result.
9. **App processes**: `CIQ_Review_Track`, then `CIQ_Case` (references A1–A4).
10. **Grants**: asymmetric (§5.2), serial with 423 retry, **final re-grant pass**, then the **grant audit script** (every portal report's members exclude `CIQP Supplier Contact`; no portal pages for the supplier) [MM §3.4].
11. **Integrations** I-2…I-5: 2-pass authoring, then a human activates them [MM §4.8].
12. **Seed**:
    - config from the prototype (`SECTIONS`, `FIELDS`, `RULE_SETS` RS-2026.1/.2, ownership, `HEAVY_METAL_LIMITS` BDF-LIM-2026.1, texts, reminders);
    - masters;
    - one walk-through case per phase.
    Creates are sequential, through ledgers, with read-back counts [MM §8.2].
13. **Custom UIs**: the Workbench (R3), then the Portal UI or component.
14. **QA**:
    - role × page in both containers;
    - the **supplier leak test L1–L13** as each of the 4 supplier users;
    - the two-browser concurrency test;
    - the 51 BRM scripts;
    - cleanup [MM §9].

---

## 13. Risks and spikes (run as soon as the keys arrive)

Throughout: `$P` = portal id, `$A` = app id. Every write is followed by an independent GET [MM §0.2]. "As supplier A" = inside the portal UI session of a real non-admin portal user (via `kf.api`), never an API key.

| Id | Question | Exact check | Pass → | Fail → |
|---|---|---|---|---|
| **S-C0** | Are both ids valid containers for our key? | `GET /flow/2/{acc}/application/$A`; `GET /flow/2/{acc}/portal/$P/flow`; `GET /flow/2/{acc}/portal/$A/flow`; `GET /app_role/2/{acc}/list?_application_id=$P`; `GET /flow/2/{acc}/process/?_application_id=$P&page_number=1&page_size=300` | Proceed | Ask the user / Kissflow product |
| **S-C1** | Can a portal process step be assigned from a field holding **portal users** (single and multi), with any-of semantics? | Builder UI (control experiment [MM §4.9]): `ZZ Spike Assign` in `$P` with `Assignee_Users` (User) and `Assignee_Emails` (Email); step 1 assignee = field. Create as an internal user with A, then A+A2; submit Start (`POST /process/2/{acc}/{proc}/{item}/{act}/submit?_application_id=$P`). As A: `getMyTasksItems()`; as A2: same; as B: same (expect none). One of A/A2 submits; check the step closes for both | **M1** | S-C2b (M2), then M4 |
| S-C1b | Does changing the assignee field on an item at a supplier step re-route the task? | Update `Assignee_Users` via `PUT /process/2/{acc}/admin/{proc}/{item}?_application_id=$P`, or `reassignItem` | Contact add/remove handled natively | Contact changes need a withdraw + re-create of open items |
| **S-C2** | Row isolation and leak channels (L1–L13) | As A: `GET /process/2/{acc}/{proc}/myitems?_response_type=full&_application_id=$P`; `getParticipatedItems`; `GET /process/2/{acc}/{proc}/{itemB}/{actB}?_response_type=full`; `GET /process/2/{acc}/admin/{proc}/{itemB}`; open B's attachment URL (signed in and anonymous); portal global search for B's `Case_Code`; open any User-field picker; `GET /flow/2/{acc}/process/{proc}/report?_application_id=$P`; `POST /form/2/{acc}/{anyPortalForm}/list?_application_id=$P` | A sees only its own; every B probe returns 403 / empty | M4 |
| S-C2b | Does the portal have a supplier-organisation model with server-side record scoping? | Portal settings / user admin; Kissflow product question | M2 available | — |
| **S-C3** | Can internal account users be members of portal roles, own portal steps, and act on them? Do linked roles exist? | `PUT /app_role/2/{acc}/{portalRoleId}?_application_id=$P` with an internal `Users[]` id, then GET; a spike process with a UserTask owned by that role; the internal user submits and sends back from the **app** custom UI via `kf.api` | **Option P** | Option A, else I/M4 |
| **S-C4** | Can the app custom UI (internal user) create, read and list portal items? | From the app UI: `kf.api POST /process/2/{acc}/CIQP_Request_A00?_application_id=$P` (create), `GET …/myitems`, admin `GET /process/2/{acc}/admin/{proc}/{item}?_application_id=$P` (as Case Admin); does `kf.app.getProcess("<portalFlowId>")` resolve cross-container? Is a report-View listing usable from the UI? | Workbench reads the portal live | Internal reads rely on app copies only (snapshots, twins, index); drill-down = native portal item view |
| S-C5 | Attachments across containers | App UI opens a portal `Upload_File`; copy the attachment value into `CIQ Document.Doc_File` (same value object) and read it back | Evidence register holds the file | Register holds a reference only (portal item id + upload id) |
| **S-C6** | Cross-container integrations | `GET /connector/2/{acc}/subscription`; author I-2 via `POST /flow/2/{acc}/integration?_application_id=$A` → draft with trigger on a `$P` process and action `Approve` on a `$A` process → `…/action/{id}/fields` → PUT → publish → human activates → run | G4/G6 automatic [REQ-PROC-017, -045] | Session sync + stuck tile (+ disclose) |
| **S-C7** | Process Member `[]`: can act on assigned steps but cannot initiate? Do StartEvent field permissions bind the create payload? | Grant `CIQP Supplier Contact` Member `[]`; as A: `POST /process/2/{acc}/CIQP_Query_A00?_application_id=$P` (expect 403 `050302`); act on an assigned item (expect OK). Repeat with no membership at all. Create with `Assigned_Contacts` set while it is RO@Start, then read back | T1 closed | T1 mitigations (b)(c) |
| **S-C8** | What does the supplier see in e-mails and history? Can step e-mails be suppressed? | Run a query loop and a scope check; capture the supplier's e-mails; `getProgress({instanceId})` as A; check per-step notification settings | Native e-mails used as designed | Work-package fallback (§4.5); own digest sender |
| S-C9 | Portal user provisioning | API or UI to invite or create portal users; MFA; domain restriction; deactivation; the id format usable in the assignee field | Scripted onboarding | RMM invites manually in the portal admin |
| **S-C10** | Custom UI support in portals | Portal Settings → Custom UI; upload the hello-world zip [MM §10.1]; else a native page + page-level component [MM §6.9] with a check that the page creates **no** report grant (T2 audit) | Full supplier UI | Native page + component (+1 day) |
| S-C11 | Lifecycle actions | Department-step `sendbackItem` to the supplier step; initiator `withdrawItem` at a supplier step; `restartItem` on a rejected `CIQ_Case`; an item whose every step is skipped auto-completes (= 07 S-04) | As designed | Admin route / new items |
| S-C12 | Form append-only and aggregates | Form Member `[]`: can it create (draft + submit) without `Delete`? Cross-flow COUNT aggregate of twins on the case [MM §4.4] (= 07 S-05) | Tamper-resistant registers; live counts | Hash-chain only; UI counts |
| S-C13 | Size and time | 120 KB `Answers_JSON` and 20 KB `Definition_JSON` in a portal Textarea; 40 sequential cross-container creates timed | Release < 60 s | Work packages; split JSON |
| S-C14 | Case id | `SequenceNumber` on the tenant [MM §4.4, §14 #59] (= 07 S-12) | Native id | App-generated id with a collision check (default) |

**Order:**
- **Day 1:** S-C0, S-C3, S-C1, S-C7, S-C2, S-C4. Make the architecture decision at end of day.
- **Day 2:** S-C6, S-C8, S-C10, S-C9, S-C2b.
- **Day 3:** S-C5, S-C11, S-C12, S-C13, S-C14.

**First, ask Kissflow product** about S-C1, S-C2b, S-C3 and S-C10 [07 §4]. Write each result to `MEMORY-LOCAL.md` with a tier tag [MM §11 rule 8].

**Top risks**

| Rank | Risk | Likelihood / impact | Mitigation |
|---|---|---|---|
| 1 | M1 fails: no field-driven assignee for portal users | Medium / **critical** | M2 → M4. Decide on day 1, before any portal flow |
| 2 | Internal roles cannot act in the portal (S-C3) | Low–medium / high | Option A (+1.5–2 d) |
| 3 | Cross-container integrations unsupported (S-C6) | Medium / medium | Session sync + stuck tile. Disclose that "automatic" means "on the next internal session" |
| 4 | A native page or grant re-opens report View to suppliers later (T2/T3) | Medium / **critical** | Grant audit script in CI; re-run after every portal change |
| 5 | E-mail flood or leaks in native portal e-mails (S-C8) | Medium / high | Work packages; own sender |
| 6 | Portal custom UI unsupported (S-C10) | Medium / medium | Page-level component |
| 7 | Two-record coupling drift (portal vs app) | Medium / medium | One owner per fact (D6); the `CIQ Portal Link` ledger; one mapping module with pure tests [MM §6.8] |

---

## 14. Effort estimate (calibrated on MM §17; compared with 07 §10)

| Work package | Builder-days |
|---|---|
| Spikes S-C0…S-C14 + Kissflow product check + decision memo | 2.5–3 |
| Backend apply in **two containers**: 30 app flows + 5 portal flows, 28 roles, ~25 lists, members, asymmetric grants, re-grant pass, grant/leak audit script [MM §17 "large native app 3–5+ days"; design done] | 3.5–4.5 |
| Integrations I-2…I-5 (2-pass, activation, cross-container tests) | 1–1.5 |
| Config seed from the prototype catalogue / rules / limits + synthetic masters and cases | 1–1.5 |
| **App Workbench** UI: shell, role gating, harness 2; RMM case + scope check / release (cross-container) 2; reviewer workspace + open points + RMES slice + gates 4–5; admin console (templates, rules, regression, four-eyes) 3–4; dashboards / reports / auditor 1.5–2 | 12.5–15 |
| **Portal** UI: inbox, questionnaire renderer, Q&A drawer, confirmations, change requests | 4–5 |
| PDF / finalizer, notification log, audit hash chain | 1.5–2 |
| QA: role × page (both containers), supplier leak test L1–L13 × 4 users, concurrency, the 51 BRM scripts, cleanup | 3.5–4.5 |
| Supplier guide, FAQ, 3-minute video [CIA #34; MM §10.4] | 1 |
| **Total (Option P + M1)** | **≈ 30.5–37.5** |
| Contingencies | +1.5–2 for Option A · +1 for a portal page component instead of custom UI · **+3–5 for M4 broker** |

**Calendar.** About 3.5–4 weeks with two builders after the 3 spike days. The total is higher than 07's 26–33 days because of the second container: the airlock writers, double grants, cross-container QA and the leak audit. Design dominates and apply takes minutes [MM §17]; do not compress the spike or QA lines.

---

## Appendix A: prototype → Kissflow mapping (every `CiqCase` attribute has one home)

| Prototype (`types.ts`) | APP home | PORTAL home |
|---|---|---|
| `id` | `CIQ_Case.Case_Code` | `Case_Code` on P1–P4 |
| `materialName`, `inci`, `materialNo` | `Trade_Name`, `Main_INCI`, `Raw_Material` | `Trade_Name` (projection) |
| `supplierId`, `manufacturer`, `site` | `Supplier`, `Production_Site` | `Supplier_Display_Name`; GEN section answers |
| `supplierContactIds` | `CIQ Case Contact` rows | `Assigned_Contacts` + `Case_Contacts_JSON` |
| `ownerId` | `Owner_RMM` | `BDF_Contact_Name` / `Email` |
| `phase`, `phaseHistory` | derived: `CIQ_Case._current_step` + tracks; native history | derived: `CIQP_Request._current_step` |
| `templateVersion`, `ruleSetVersion` | pinned config keys | `Template_Label` |
| `config` (SF-01…12) | `Scope_Run.Input_Config_JSON`; `Origin_Types`, `Target_Markets` | `CFG` section `Answers_JSON` (SF-11 read-only) |
| `scope` | `CIQ Scope Run.Result_JSON` (incl. N.A., rule ids, reasons, manual overrides) | `Released_Scope_JSON` (M/O + supplier reason only) |
| `answers`, `answeredBy`, `justifications` | `CIQ Section Snapshot` (per rev) | `CIQP_Section.Answers_JSON` / `Justifications_JSON` |
| `components` | `CIQ Component` (typed) | K2.1 table rows in `Answers_JSON` |
| `documents` | `CIQ Document` (version register) | `CIQP_Section.Uploads`, `CIQP_Query.Response_Files` |
| `reviews` (`ReviewTrack`) | `CIQ_Review_Track` | — |
| `informed` | derived (CUS/LEG roles) | — |
| `openPoints` (question, ref, due, rounds, outcome) | `CIQ Open Point` twin (internal facts, `Rounds_JSON`) | `CIQP_Query` (supplier wording, loop, files) |
| `OpenPoint.thread` with `action: "note"` | twin / `CIQ Internal Note` **only** (the prototype's `visibleThread` filter becomes physical) | — |
| `rmes` (criteria, findings, limits, AI) | A17–A22 | — |
| `confirmations` | `CIQ Confirmation` + native step submits | supplier confirmations as native submits + `Completeness_*` / `Final_Release_*` |
| `overall` | `Overall_Decision` / `Reason` | — |
| `audit` | `CIQ Audit Event` + native history | native history |
| `reviewVersion` | `CIQ Review Version`, `Section_Rev` | `Cycle_No`, `Rev_No` |
| `cancelled` | `Cancel_Reason`, `Cancelled_At` | `Supplier_Notice` (supplier wording) |
| `priority`, `internalNotes` | `Case_Priority`, `CIQ Internal Note` | — |
| `AppState.templates`, `RULE_SETS`, `ownership`, `reminders`, `assumptions.overallApproval` | `CIQ Config Version` (+ `CIQ Section Definition`) | copied definitions in `CIQP_Section.Definition_JSON` |
| `users` (internal) / (supplier) | Kissflow users + app roles / `CIQ Supplier Contact` | — / portal users in `CIQP Supplier Contact` |

## Appendix B: questions this design raises for BDF

These are business questions with defaults, for call 2.

1. **E-D-74.** May the supplier see the BDF responsible person's name and e-mail, and which department asked? Default: yes, as REQ-PROC-030 implies.
2. **U-03 / C-1 / C-11.** Should RMES and internal assessments be readable by QM, Microbiology, Sustainability, Customs and Legal? Default: yes, per REQ-PROC-019. Narrowing is a grant change.
3. **Q-08.** Which supplier contacts may give the PS-05 and PS-11 confirmations? Default: any contact on the case with `Can_Confirm`.
4. **E-D-79.** May suppliers add colleagues themselves? Default: no. RMM adds contacts to the case access list.
5. **Q-12.** Does the supplier receive a copy of the final PDF? Default: no. If yes, a supplier-safe variant is written to the portal.
