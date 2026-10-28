# CIQ Digital Workbench: design for tonight's build

Kissflow-internal. Status: **design, nothing built**. The backend `CIQ_Digital_A00` is planned (graph rev 31) but **not generated**. Design date: 2026-10-08. **Revised the same night** after two critiques (both FIX-FIRST, `WORKBENCH-DESIGN-CRITIQUES.json`); §14 maps every issue to its fix. Defaults marked **[provisional]** are listed in §13.3 for Thomas to confirm.

**What this is:** the custom UI ("Workbench") for the internal Beiersdorf roles of the CIQ Digital app. It is one React bundle uploaded to the app's Application custom component. It is built in `prototype/` as a **separate entry**, apart from the supplier portal UI.

**Deployment is out of scope.** Uploading the bundle writes to the app container. That needs its own approved step, coordinated with the app session (CLAUDE.md "Who builds what"). Which component in which container takes it is [unverified]: `UI-LOG.md:14` mentions an app component `CCEK4Jhdt04g`.

## 0. Sources, tags, ground rules

### 0.1 Citation keys

| Key | Means |
|---|---|
| `spec:` | `runs/current/app-spec.json` (→ `runs/ciq-digital-v4`, rev 31, sha256 `203cef6d56f52860…`), followed by a JSON path |
| `dec:Lnn` | `runs/ciq-digital-v4/decisions.md` line (D32 L455, D33 L464, D34 L472, D35 L480) |
| `SPIKES:Lnn` | `kissflow-build/ciq-digital/SPIKES.md` line |
| `UI-LOG:Lnn` | `kissflow-build/ciq-supplier-portal/UI-LOG.md` line |
| `brd:Lnn` | `runs/current/brd.md` line |
| `master:Lnn` | `~/Downloads/master.md` line |
| `sdk.d.ts:Lnn` | `prototype/node_modules/@kissflow/lowcode-client-sdk/dist/index.d.ts` (1.0.49) |
| `sdk.es:Lnn` | `prototype/node_modules/@kissflow/lowcode-client-sdk/dist/kfsdk.es.js` (1.0.49) |
| `portal-client:Lnn` | `prototype/src/portal/data/client.ts` (read only; copied, never imported) |

**There is no "backend contract" file** in the project. The first draft cited one ("contract §n"); every such claim now cites a spec path or a `brd:` line, or is tagged [unverified] or [convention] (§14, C1-18).

### 0.2 Tags

| Tag | Means |
|---|---|
| **[verified]** | Tested live; the cited SPIKES or UI-LOG line holds the evidence |
| **[verified-offline]** | Compiled locally only (`preview-rev31`) |
| **[unverified]** | Not observed yet. The code must cope with it failing, and Diagnostics must show it |
| **[convention]** | A Workbench choice the spec does not fix. It is listed in §4.6 so it can be changed in one place |
| **[verified REST; SDK unverified]** | Proven over REST with the account key only; the same call through a real user's SDK session is not observed yet |
| **[provisional]** | A default chosen tonight so building can proceed. It is listed in §13.3 as **WB-D*n*** for Thomas to confirm or change |

### 0.3 Ground rules for every builder

1. **Code against `spec:data_model`, `spec:security` and `spec:workflow`. Never use `spec:forms[]`**, which is stale: it has `Open_Items_Gate`, no `_Release`/`_Close` fields, three `CIQ_OP_Outcome` values and 16 event categories. The generator (§4) reads only the good slices, and its tests fail if drift reappears.
2. **No id is hard-coded outside `src/workbench/schema/generated.ts`.** That covers flows, fields, child tables, lists, steps (by exact name, en-dash U+2013 included) and roles (by exact name).
3. **Roles and steps are matched by name.** Their server ids exist only after generate (`SPIKES:L25`; compiled activity ids look like `Activity_1feompb`).
4. **Step names repeat across flows.** "Review – Regulatory" is both `CASE_B_REG` and `OPNT_R_REG` (`spec:workflow.processes.*.steps[*].name`). So every step lookup is keyed by **(flow id, step name)**, never by name alone.
5. **Never share anything with the supplier, and never fake a hand-off.**
   - Integrations X1–X6, Y1–Y6 and Z1/Z2 are off or not built (`dec:` D31 L449).
   - The UI never says "sent to supplier", "PDF generated" or "supplier e-mailed".
   - It never writes a CIQP (portal) flow, and never invents a `Portal_*_Item_Id`.
6. **No native page bindings** (`spec:security.hard_rules[SEC-HR1]`, `spec:experience.hard_rules[EXP-HR2]`).
7. **RMES sheets are edited only by their editor role**: Safety → `CIQ_RMES_Safety_A00`, Regulatory → `CIQ_RMES_Regulatory_A00`. No nav item, card or link offers the *editing* sheet to anyone else. `spec:experience.hard_rules[EXP-HR3]` governs surfaces "that use native page bindings"; the Workbench uses none. Every internal role reads every record (`spec:security.data_scope.rule`: "the other department reads"), so the Overall Approver gets a **read-only** RMES summary (§8.12). (Narrowed in the revision, §14 C1-8.)
8. **Never `switchRole`.** It removes the user from their current roles (`sdk.d.ts:L1314`; `master:L525`).
9. **Never delete anything.** No `deleteItem`, no `DELETE` method on `kf.api`, no Delete button anywhere (F2 and F8 above all). Discarding **one's own draft** (`discardItem`) is allowed. **F8 is create-only:** create → submit → verify; a missing field gets a *correcting* row (§7.8), never an update.
10. **No credentials** in code, bundle, fixtures, docs or logs. Nobody reads `.env`.
11. **Fictional people and suppliers only** in fixtures and screenshots, with `@example.test` e-mails.
12. **Formula fields are computed.** They are never written, never rendered as inputs, never listed in a K-WB value sheet. They are only *checked* before a submit (§4.2 `computed`, §7.3).
13. **Step actions need the task, not the role.** A step panel's actions are enabled only when the user holds a task (a `TaskVM` from `getMyTasksItems`) for that item at that step. Owner roles drive navigation only (§5.3). This matters for steps assigned from a field after K-FA (`CASE_S1` ← `Owner_RMM`, `OPNT_S1` ← `Responsible_User`; `spec:workflow.meta.after_generate_switches.other_after_generate[2]`).
14. **No admin-route writes** except the one allow-listed Case Admin lane repair (§7.10), which writes its own F8 row.

## 1. Design decisions taken here (WB-1 … WB-17)

| # | Decision | Why |
|---|---|---|
| WB-1 | **Own view models plus the prototype UI kit**, not a `StoreContext` adapter over the prototype's `CiqCase` | The prototype's synchronous `StoreApi` and fat `CiqCase` aggregate don't fit v4: 11 flows joined by text keys, async write-then-verify, S5/S8, change requests, the RMM lane, overall approval *before* final release. Mapping v4 to `CiqCase` costs more than composing screens from the kit. Look and feel is kept by copying layouts from `src/features/**` into `src/workbench/**` where useful |
| WB-2 | **Kit imports only by file:** `@/components/ui/{primitives,data,form,select,charts}`, `@/styles.css`, `@/assets/beiersdorf-logo.webp`. **Copy** `Modal`/`Drawer`/`Tabs` into `src/workbench/ui/overlay.tsx` | `overlay.tsx` imports `@/store/store` (overlay.tsx:4), and the `@/components/ui` index re-exports it. `status.tsx` and `layout/*` import prototype domain or store |
| WB-3 | **Copy from the portal; never import from `src/portal/**`.** Exception: the ambient `src/portal/kf/kfsdk.d.ts` already covers all of `src` and is **not** copied, because a copy duplicates the identifier | Portal lessons §5 |
| WB-4 | **Read ladder per process** (§6.2): admin list → [unverified] viewer route → "mine + my tasks" union, plus a **case index from F8 "Item created" rows**. The "View as" lens skips rung 1 when the chosen role has no flow Admin | No list route for View-only roles is known (K-14). `getAdminItems` needs admin access (`sdk.d.ts:L1071-1079`); Participated fails live (`UI-LOG:L113`) |
| WB-5 | **Counts fail closed, and "complete" is defined.** A count is `complete` only when every list it depends on was read through rung 1 (admin) or a viewer rung that Diagnostics has proven live, and every matched item was read with its `Open_Num`/`CR_Open_Num`. Rung 3 ("mine + tasks") or the F8 index gives `partial`, always (§6.2, §7.9). What happens on `partial` is the **counts policy** (WB-D1 [provisional]): `fail-closed` (default) blocks the submit and names exactly what could not be read; `attest` lets the user attest with an F8 `count.attested` row. At S5/S8 the spec's override stays available; at **S7 a partial refresh clears the counts** so S8 runs | A count that is too low passes a quality gate wrongly. Gates read Workbench-written counts (`brd:L32`; `dec:` D10) |
| WB-6 | **Step resolver with evidence levels:** activity filter (after read-back) → `getProgress` matched by `_activity_instance_id` → item-level row keys **only** when the user holds a single open task on that item → "unidentified step". It **never resolves to a Parallel step** (`CASE_PAR`) | Activity ids are unknown before generate; which row keys carry the step is [unverified] (`UI-LOG:L117`). In Part 2 an item-level `_current_step` may name the block or another branch (§6.3) |
| WB-7 | **Tasks are keyed by `_id|_activity_instance_id`.** One case can hold up to 6 open branch tasks for one user | Thomas holds every role (`dec:L486`). The portal's dedupe by `_id` would drop branches |
| WB-8 | **"View as" is a UI-only lens, shown when `kf.app.getRoles()` resolves.** The probe is **[unverified]** as a builder signal: `getRoles` is documented as available to any user "in a Development account" (`sdk.d.ts:L1297`), and a builder-permission staff login also passes it (`master:L571`). The lens can only **narrow** (roles, nav, tasks, and the read rung), never widen, so a real user who gets the switcher gains nothing | `master:L571-572`, `L1117` |
| WB-9 | **The K-WB fallback is per step and per session.** A 050313 on `updateItem` at step X marks X `kwb:refused` **only** when the step was resolved from activity-level (or `block-unique`) evidence (§6.3) and the error's field list names every key sent. The task that got the 050313 always gets the fallback. Once X is marked, later tasks at X go straight to the fallback (value sheet, an **Open task form** button, then "Re-read") | `dec:L484` (D35 K-WB). The key got 050313 for every field (`SPIKES:L141`) |
| WB-10 | **Manual supplier steps are labelled "manual record".** Y-written fields are shown read-only once filled. Supplier timestamps are typed by RMM ("Supplier confirmed at", "Supplier released at"), never stamped with "now" silently | `spec:coherence.risks[R-03]` (manual RMM submit is the MVP path); `dec:L467` (D33: RMM's manual submit is the fallback); `brd:L1302` (Y4 copies `Confirmed_At`) |
| WB-11 | **Config payload shapes are Workbench conventions** (§4.6), until the evaluator and sync design fixes them | `spec:data_model.flows.CIQ_Config_Version_A00` has `Payload_JSON` but no schema |
| WB-12 | **The scope check is manual for MVP.** RMM picks applicability per section and the Workbench records the run (`Evaluator_Version = "manual-wb-1"`). It can extend, never reduce (`brd:L783`). The rule evaluator is deferred | Rule sets are TS closures in the prototype (types.ts:128) and can't be stored |
| WB-13 | **Computed fields** (every field with a `formula`: the 9 Case gates and hold, `Open_Num`, `Start_Gate`, `CR_Open_Num`, `Criteria_Open_Num`) are flagged `computed` by the generator. They are never writable, never inputs, and are checked only before submit | The spec marks gates Mandatory at their steps (`spec:security.field_permissions.CIQ_Case_A00.CASE_B_SAF.SAF_Gate`), but they are formulas (`spec:data_model.flows.CIQ_Case_A00.fields[SAF_Gate].formula`). Writing one is pointless and its refusal must not trip K-WB |
| WB-14 | **Actions are gated on task possession** (ground rule 13) | `OPNT_S1` is assigned from `Responsible_User` after K-FA (`brd:L245`, `L915`); a reviewer who raises a supplier point holds its S1 task |
| WB-15 | **F8 is create-only** (ground rule 9; §7.8) | Audit rows must not change after the fact; Z2 triggers on F8 create (`dec:L476`) |
| WB-16 | **No generic admin write target.** One allow-listed Case Admin action (lane repair from an F8 `lane.completed` snapshot, §7.10) | The admin route writes any field regardless of step (`SPIKES:L143`); "Case Admin only rejects; it writes no fields" (`brd:L835`); D35 relies on nothing else writing the case in Part 2 (`dec:L482`) |
| WB-17 | **Feature flags** in `domain/flags.ts` for MVP cuts and policies: `countsPolicy`, `additionalPartRaise`, `scopeExtendedOutcome` (§7.11). Each is unit-tested in both states | Unbuilt branches must not be reachable from the UI |

## 2. Architecture

```
 Kissflow app host (CIQ_Digital_A00, Application component)            emulated host (harness)
 ┌──────────────────────────────────────────────────────────┐          ┌───────────────────────────┐
 │ iframe: Workbench bundle (single index.html)               │ postMsg  │ hostPage.ts + hostEngine │
 │                                                            │◄────────►│ (task engine, perms,     │
 │  main.tsx → WorkbenchApp (boot state machine)              │          │  formulas, refusals,     │
 │    connecting │ outside │ failed(retry) │ no-access │ live │          │  races, recorder)        │
 │                                                    │       │          └───────────────────────────┘
 │  kf/sdk.ts ── connectKf() ── @kissflow/lowcode-client-sdk  │
 │  kf/app.ts ── roles by NAME → capabilities ── viewAs lens  │
 │                                                    │       │
 │  schema/generated.ts ◄── scripts/gen-workbench-schema.mjs ◄── runs/current/app-spec.json
 │        (flows, fields, child tables, lists, steps+perms, roles, grants, formulas)       (+ read-back ids later)
 │                                                    │       │
 │  data/                                             ▼       │
 │   client.ts    call()/bounded()/pages()/read ladder/item reads/create/submit/settle   │
 │   tasks.ts     My Tasks ×3 processes → TaskVM[] (key _id|act) + step resolver          │
 │   map.ts       raw items → CaseVM/PointVM/CrVM/SectionVM/…  (only module that knows ids)│
 │   hooks.ts     useTasks/useCaseList/useCaseBundle/useFormRows/useItem (cache+reload)  │
 │   writeQueue   container check · per-item serial chains · "uncertain" items ·          │
 │                ONE create lane (+ navigator.locks in try/catch)                        │
 │   writeVerified  guard (computed/F8/perms) → normalise → write → read back → re-apply ≤3│
 │   actions.ts   saveAtStep · submitStep · rejectCase · sendBackPoint · createProcess…  │
 │                createFormRow · updateFormRow · writeAudit · openTaskForm               │
 │   adminRepair.ts  the ONLY updateAdminItem caller (allow-listed lane repair, §7.10)    │
 │   gates.ts / counts.ts   Mandatory + gate checks, count functions + confidence (pure)  │
 │   audit.ts     F8 row builders, create-only (Item created, Cancellation, …, correction)│
 │  domain/flags.ts  countsPolicy · additionalPartRaise · scopeExtendedOutcome (§7.11)    │
 │                                                    │       │
 │  shell/  WorkbenchShell (nav by capability), routes registry, NoAccess/Offline         │
 │  features/  rmm · case · cr (T1) │ review · points · assess · rmes (T2)                │
 │             approver · admin · masters · reader · notes · audit (T3)                   │
 │  pages/Diagnostics (T0)                                                                 │
 └──────────────────────────────────────────────────────────┘
```

**Data flow:** screens call hooks to read and `actions.ts` to write. They never call the SDK directly. Every write goes through `writeQueue`. Every item read goes through `client.ts`, and `map.ts` turns raw items into view models.

## 3. File tree and ownership

Only these paths may be created or changed. Nothing under `src/portal/**`, `src/features/**`, `src/domain/**`, `src/components/**`, `src/layout/**` or `src/store/**` is edited.

```
prototype/
├─ workbench.html                         T0  static branded loader + pre-paint theme (copy of portal.html)
├─ vite.workbench.config.ts               T0  singlefile, input workbench.html, outDir dist-workbench, __WORKBENCH_BUILD__
├─ tsconfig.workbench.json                T0  NEW: type-checks src/workbench only (§10.1)
├─ vitest.workbench.config.ts             T0  NEW: runs src/workbench/**/*.spec.ts(x) only (§10.1)
├─ tsconfig.json  (one line)              T0  adds "exclude": ["src/workbench"] (§10.1; noted in the README)
├─ package.json  (scripts only)           T0  gen:, typecheck:, test:, build:, dev:, harness:workbench
├─ scripts/
│  ├─ gen-workbench-schema.mjs            T0  spec → src/workbench/schema/generated.ts (--check, --readback)
│  ├─ zip-workbench.mjs                   T0  index.html + manifest.json → dist-workbench/ciq-workbench-ui-<hash>.zip
│  ├─ harness-workbench.mjs               T4  two-origin servers, esbuild host bundle, Playwright runner, --serve
│  └─ harness-workbench-scenarios.mjs     T4  scenario list + expected checks
└─ src/workbench/
   ├─ main.tsx · WorkbenchApp.tsx · build.ts · theme.tsx · BrandLoader.tsx · workbench.css · fonts.css   T0
   ├─ env.d.ts                            T0  declares __WORKBENCH_BUILD__ (the main tsconfig no longer sees src/workbench)
   ├─ README.md                           T0 (T5 completes)  run/rebuild steps; depends on src/portal/kf/kfsdk.d.ts (WB-3)
   ├─ FOUNDATION-REQUESTS.md              T0  T1–T4 append change requests for T0-owned files; T0 answers (§12)
   ├─ guards.spec.ts                      T0  static source guards (§10.2)
   ├─ schema/generated.ts                 T0  GENERATED, committed; do not hand-edit
   ├─ schema/formulaSamples.ts            T0  shared input→output vectors for every spec formula (used by T2 and T4 tests)
   ├─ schema/index.ts (+test)             T0  typed helpers: stepOf(flow,name), permsAt(step), mandatoryAt, gateFieldsAt, listValues…
   ├─ kf/sdk.ts (+test)                   T0  copied facade + rejectItem/sendbackItem/openForm/getProgress/withdraw fix; NO delete methods
   ├─ kf/app.ts (+test)                   T0  APP_ID, roles by name, capabilities
   ├─ kf/viewAs.tsx                       T0  builder probe + lens
   ├─ data/client.ts (+test)              T0
   ├─ data/normalize.ts (+test)           T0  kfDateTime (moved here), DateTime (no ms), Date, Number, User, Reference, Select, blank, equality
   ├─ data/tasks.ts (+test)               T0
   ├─ data/viewModels.ts                  T0  VM types (the contract every feature codes against)
   ├─ data/map.ts (+test)                 T0
   ├─ data/hooks.tsx                      T0  WorkbenchData provider + hooks + toasts
   ├─ data/writeQueue.ts (+test)          T0
   ├─ data/writeVerified.ts (+test)       T0
   ├─ data/actions.ts (+test)             T0
   ├─ data/adminRepair.ts (+test)         T0  allow-listed Case Admin lane repair (§7.10); the only updateAdminItem caller
   ├─ data/pendingSheet.ts (+test)        T0  K-WB pending values in sessionStorage, keyed _id|act (§7.4)
   ├─ data/gates.ts (+test)               T0
   ├─ data/counts.ts (+test)              T0
   ├─ data/audit.ts (+test)               T0
   ├─ domain/keys.ts (+test)              T0  key formats [convention]
   ├─ domain/flags.ts (+test)             T0  feature flags and the counts policy (§7.11)
   ├─ domain/config.ts (+test)            T0  pinned-release loader + payload parsers + content-hash check
   ├─ domain/labels.ts                    T0  status/step labels and tones
   ├─ ui/overlay.tsx · Toaster.tsx · badges.tsx · FieldInput.tsx · StepForm.tsx · WriteOutcome.tsx ·
   │  KwbFallback.tsx · ConfirmDialog.tsx · ReadQualityBanner.tsx · ManualRecordNote.tsx               T0
   ├─ shell/WorkbenchShell.tsx · nav.ts · routes.tsx · NoAccess.tsx · Offline.tsx · ConnectFailed.tsx  T0
   ├─ pages/Diagnostics.tsx · Home.tsx · TaskRouter.tsx                                                T0
   ├─ features/rmm/**   (My work, New case, createCase.ts)                                          T1
   ├─ features/case/**  (Case list, Case detail + tabs, case step panels, case actions)             T1
   ├─ features/cr/**    (CR list, triage, manual CR create)                                         T1
   ├─ features/review/** (queue, lane workspace incl. B_RMM)                                         T2
   ├─ features/points/** (PointList, RaisePointDialog, point detail + decisions, OPNT_S1 manual)      T2
   ├─ features/assess/** (CHRQ_B_<D>)                                                                T2
   ├─ features/rmes/**   (RMES sheet SAF/REG; read-only RmesSummary used by the approver)           T2
   ├─ features/approver/**                                                                           T3
   ├─ features/admin/**  (config versions, release, section templates)                               T3
   ├─ features/masters/** (suppliers + contacts)                                                     T3
   ├─ features/reader/** (audit log page)                                                            T3
   ├─ features/notes/**  (NotesPanel)                                                                T3
   ├─ features/audit/**  (AuditTimeline)                                                             T3
   └─ harness/**  (hostEngine, formula, workflow, permissions, commands, fixtures, hostPage; +tests)  T4
```

**Tests:** "(+test)" means a sibling `<name>.spec.ts` (or `.spec.tsx`). Workbench tests use the `.spec` suffix on purpose: the main `vite.config.ts` (not editable) runs every `src/**/*.test.{ts,tsx}`, so `.spec` keeps them out of the portal's `npm test` (§10.1).

**Stubs:** T0 creates every `features/*/index.ts` and every cross-task component in §12.2 as a **stub with its final props type**. The owning task replaces the body and never changes the signature without a `FOUNDATION-REQUESTS.md` entry that T0 accepts (§12).

## 4. Backend ids: the schema generator

### 4.1 Script

`scripts/gen-workbench-schema.mjs` (T0) runs on node with no dependencies:

```
node scripts/gen-workbench-schema.mjs                    # write src/workbench/schema/generated.ts
node scripts/gen-workbench-schema.mjs --check            # regenerate in memory; exit 1 if it differs from the file
node scripts/gen-workbench-schema.mjs --readback <file>  # merge server ids read back after generate (§4.4)
  --spec <path>   default ../runs/current/app-spec.json (resolved from prototype/)
```

**Reads:**
- `spec:data_model.flows` (11 flows and 22 lists);
- `spec:workflow.processes.<flow>.steps` (including `branches[].steps`);
- `spec:security.field_permissions`;
- `spec:security.roles`;
- `spec:roles`;
- `spec:experience.intended_workbench_landings`;
- `spec:workflow.meta.after_generate_switches`;
- `spec:workflow.meta.security_handoff.items` (cross-check only).

**Never reads** `spec:forms`, `.env`, `.kf-env` or `~/.claude/**`.

### 4.2 Output: `src/workbench/schema/generated.ts`

The module has no imports and uses `as const` everywhere. Its header names the spec path, graph revision (31) and spec sha256.

| Export | Content | Source |
|---|---|---|
| `APP_ID` | `"CIQ_Digital_A00"` | `spec:app.id` |
| `SPEC` | `{ revision: 31, sha256 }` | `app-spec.json.graph-revision.json`, file hash |
| `FLOWS` | `{ CIQ_Case_A00: { id, name: "CIQ Case", kind: "Process" }, … }` for the 3 Processes and 8 Forms | `spec:data_model.flows.<id>.{name,flowType}` |
| `FIELDS` | per flow: `{ [fieldId]: { id, name, type, list?, formula?, computed?, required?, ref? } }`. `computed: true` on every field that has a `formula` (child-table columns included) | `spec:data_model.flows.<id>.fields[]` (Case 125, OP 53, CR 49, …) |
| `F` | per flow, a const map of field ids for autocompletion: `F.Case.REG_Gate === "REG_Gate"` | same |
| `CHILD_TABLES` | `{ flow, id, serverModelId: null, fields }`: Rounds, Contacts, Components, Safety_Criteria, Safety_Findings, Regulatory_Criteria, Regulatory_Findings | `spec:data_model.flows.<id>.child_tables[]` |
| `LISTS` | `{ CIQ_Yes_No: ["Yes","No"], … }` (22 lists) | `spec:data_model.flows.<list>.items` |
| `STEPS` | per IR step id: `{ flow, irId, name, kind: "Start"\|"UserTask"\|"Parallel"\|"End", ownerRole, fieldAssigned?, condition?, parallel?: { block, branchIndex }, order, serverActivityId: null, perms: { [fieldOrTable]: "Mandatory"\|"Editable" }, gates: FieldId[] }`. ReadOnly entries are omitted. **Computed fields never appear in `perms`**; a computed field that `field_permissions` marks Mandatory goes into `gates` (e.g. `CASE_B_SAF.gates = ["SAF_Gate"]`, `CASE_S5.gates = ["Open_Items_Gate_Release"]`, `OPNT_S0.gates = ["Start_Gate"]`). `fieldAssigned` = `"Owner_RMM"` on `CASE_S1`, `"Responsible_User"` on `OPNT_S1` | `spec:workflow.processes`, `spec:security.field_permissions`, `spec:workflow.meta.after_generate_switches.other_after_generate[2]` |
| `STEP_BY_NAME` | `{ [flow]: { [exactName]: irId } }` | derived |
| `SWITCHES` | per step: `{ reject: boolean, sendBack: boolean }` | parsed from `spec:workflow.meta.after_generate_switches` (text). Asserted against a hand-written expectation in the test (Case reject on S1, S2, S3, S5, S7, S8; OP send-back on R_*; nothing on CR) |
| `ROLES` | per IR role id: `{ irId, name, journeys, landing, serverId: null }` | `spec:roles[]`, `spec:experience.intended_workbench_landings` |
| `GRANTS` | `{ [roleIr]: { [flow]: { cell: "I"\|"M"\|"E"\|"V"\|"A"\|"—", capability, steps? } } }` | `spec:security.roles.<r>.flows.<f>.{plan_cell,role_capability,steps}` |
| `DEPTS` | `["REG","SAF","QM","MIC","SUS","RMM"]`, plus maps dept → reviewer role, case lane step, OP review step and CR assess step | derived from step owners and conditions |
| `CR_DEPT_FIELDS` | per department **that has CR fields**: `{ impact: "Impact_<D>", assessment: "<D>_Assessment", note, by, at }`. Generated from `FIELDS.CIQ_Change_Request_A00`; RMM has **no** entry (there is no `Impact_RMM`) | `spec:data_model.flows.CIQ_Change_Request_A00.fields` |
| `LANE_FIELDS` | per department: the non-computed fields in `perms` of `CASE_B_<D>` (e.g. SAF: `SAF_Review_Confirm`, `SAF_Completed_By/_Email/_At`, `SAF_RMES_Decision(_Reason)`, `SAF_On_Behalf_Of`, `SAF_Open_Count`, `SAF_RMES_Gaps`) | derived from `STEPS` |
| `POST_CREATE_KEYS` | `{ CIQ_Case_A00: ["Case_Code", "Request_Key"] }`: Mandatory at Start but derived from the new `_id`, so exempt from the pre-create check (§7.6) | `spec:security.field_permissions.CIQ_Case_A00.CASE_S0`; §4.6 |
| `ADMIN_WRITE_ALLOW` | `{ "lane.repair": { flow: "CIQ_Case_A00", fields: LANE_FIELDS[D] minus the count fields } }`. Nothing else (§7.10) | WB-16 |

### 4.3 Guards in the generator (it fails the build if any is false)

1. `CIQ_OP_Outcome` = [Accepted, Withdrawn].
2. `CIQ_Event_Category` has 17 items, including "Final PDF".
3. `CIQ_Round_Outcome` exists.
4. Case fields: 125. OP fields: 53. CR fields: 49.
5. Every "X – Y" step name contains U+2013.
6. `field_permissions` equals `security_handoff.items` (0 mismatches).
7. Every field named in `field_permissions` exists in `data_model`.
8. No step id is missing from `field_permissions` (Start, UserTask).
9. Every field with a `formula` is `computed` and appears in no `STEPS.perms` (only in `gates`).
10. `CR_DEPT_FIELDS` has exactly REG, SAF, QM, MIC and SUS, every id in it exists in `FIELDS`, and there is no RMM entry. A missing id fails the build.
11. `POST_CREATE_KEYS` ⊆ `mandatoryAt(CASE_S0)`.
12. `ADMIN_WRITE_ALLOW` holds only `lane.repair`, and its fields ⊆ `LANE_FIELDS`.

### 4.4 Read-back merge (after generate; not tonight)

After generate, a separate approved session step produces a JSON file shaped like this:

```json
{ "roles": { "CIQ RMM": "Ro…", … },
  "steps": { "CIQ_Case_A00": { "Scope check": "Activity_…", … }, … },
  "childModels": { "CIQ_Open_Point_A00": { "Rounds": "<server child model id>" }, … } }
```

`--readback` merges it into `serverId`, `serverActivityId` and `serverModelId`. Diagnostics (§9) shows each of these values live, with a "Copy as read-back JSON" button, so the file can come from the UI.

**Until then:**
- roles match by name;
- steps resolve through WB-6;
- child tables use `Table::<spec id>` [unverified until read-back; the spec id is kept on compile, `preview-rev31`, verified-offline]. Supporting evidence: `Table::Spike_Lines` worked on an App-Builder-made form, keyed by its spec id (`SPIKES:L100-L101`, REST).

### 4.5 `schema/index.ts` helpers (T0)

- `stepOf(flow, name)` returns the IR id or null. It returns null for a `Parallel` or `End` step: tasks never resolve to them.
- `permsAt(irStep)`, `mandatoryAt(irStep)` and `editableAt(irStep)` return field-id arrays. **None of them contains a computed field.**
- `gateFieldsAt(irStep)` returns the computed fields that must read "OK" (Start/Case gates) before a submit.
- `isWritableAt(irStep, key)`: false for every computed field, whatever the step.
- `isComputed(flow, id)`, `fieldType(flow, id)`, `requiredFormFields(flow)`.
- `listValues(listId)`.
- `ownerRole(irStep)` and `stepsOwnedBy(roleIr)`: **navigation only**. Actions use task possession (ground rule 13).
- `childTableOf(flow, id)` returns `{ key: "Table::" + (serverModelId ?? id) }`.

Unit tests (T0): `assertWritable("CASE_B_SAF", ["SAF_Gate"])` throws; `editableAt("CASE_S5")` has no `Open_Items_Gate_Release`; `gateFieldsAt("OPNT_S0")` = `["Start_Gate"]`; `stepOf(CIQ_Case_A00, "Part 2 – Beiersdorf review")` is null.

### 4.6 Conventions the spec does not fix [convention]

Kept in `domain/keys.ts` and `domain/config.ts`. Change them there only.

**Keys.** Case_Code is fixed by `brd:L735` and Query_Key by `brd:L887`; the rest are conventions.

| Key | Format |
|---|---|
| `Case_Code` | `CIQ-<yyyy>-<_id of the cycle-1 item>` (`brd:L735`). Written at Start after the create (`POST_CREATE_KEYS`) |
| `Request_Key` | `<Case_Code>-C<Cycle>-REQ`. Written at Start after the create (`POST_CREATE_KEYS`) |
| `Rule_Set_Version` (Case S2, F4) | the pinned release's manifest entry of kind "Rule set": `<configKey>@<Version_Label>`; if the manifest has none, the literal `none (manual-wb-1)`. The same value goes into `F4.Rule_Set_Version` [provisional, WB-D10] |
| `Completeness_Request_Key` | `…-PS05` |
| `Final_Release_Request_Key` | `…-PS11` |
| `RMES_Key` | `…-RMES` |
| RMES row keys | `RMES_Key + "-SAF"` and `"-REG"` |
| `Run_Key` / `Initial_Scope_Run_Key` | `…-RUN<n>` |
| `Section_Item_Key` | `…-<Section_Key>` |
| `OP_Key` | `…-OP<base36 time><4 random>` |
| `Query_Key` | `OP_Key|R<n>` (`brd:L887`) |
| `CR_Key` (manual) | `…-CR<…>` |
| `Notice_Key` | `CR_Key-NOTICE` |
| `Event_Key` | `EV-<base36 ms><6 random>` |
| `Note_Key` | `NOTE-…` |
| `Config_Key` | `<kind slug>-<Section_Key or name>-v<n>` |
| `Release_Key` | `REL-<yyyymmdd>-<n>` |
| Child row `_id` | `<ChildModelId>_<10 random [A-Za-z0-9]>` (`SPIKES:L89`) |

Keys that later travel to the portal (Request, PS05, PS11, Query, Notice, Section item) must be agreed with the portal session before X1–X6 are built.

**Contact fields** on Case, OP and CR:
- `Portal_Contact_Ids`, `Confirm_Contact_Ids` and `Supplier_Contact_Emails` are comma-separated. The format X1 needs is [unverified]; agree it with the portal session.
- `Case_Contacts_JSON` = `[{name,email,role,canConfirm,portalUserId}]`.
- **`Contacts_Portal_User_Id`** (F1 Contacts) is **typed by RMM** as given by Thomas, who manages portal users. The input is labelled "manual: as given by portal user management". The Workbench never generates or guesses it (`spec:data_model.flows.CIQ_Supplier_A00.child_tables[Contacts]`).

**Config payloads** (`Payload_JSON` by `Config_Kind`):

| Kind | Payload |
|---|---|
| Template | `{ sections: [{ sectionKey, default: "Mandatory"\|"Optional"\|"N.A." }] }` |
| Section definition | `{ sectionKey, code, title, sort, fields: [{ key, label, type, required }] }` |
| Section ownership | `{ owners: { <sectionKey>: { lead, co: [], queryOwner } } }` |
| RMES criteria | `{ criteria: [{ code, part, title, dept: "SAF"\|"REG" }] }` |
| Text bundle | `{ texts: { <textKey>: text } }` |
| Settings | `{ deptReviewMode: false, overallApprovalRequired: false, defaultSupplierDueDays: 14, reactivationDays: 365, countsPolicy?: "fail-closed" \| "attest" }`. The 1-year default comes from `brd:L857`. `countsPolicy` is the only flag Settings may carry (§7.11); absent or unreadable means `"fail-closed"` |
| Release | the `Release_Manifest_JSON` field = `[{ configKey, kind, itemId, sectionKey?, sectionRev?, contentHash }]` |

**Content hash:** sha256 hex of the stored `Payload_JSON` string, computed with Web Crypto. A mismatch against the case's manifest copy blocks S2 and writes an F8 "Configuration" event (`brd:L1037`, design intent).

## 5. Boot, roles, capabilities, "View as"

### 5.1 Boot (copied from `PortalApp.tsx`)

**States:**
- `connecting`: BrandLoader.
- `outside`: "Not running inside Kissflow", with no demo mode.
- `failed`: "Couldn't connect" plus **Try again**.
- `no-access`: the user holds no CIQ role. Lists the role names and reads no items.
- `live`.

`connectKf()` is unchanged: it checks for a frame, races the SDK `initialize()` against a 12 s timeout, and runs `looksLikeKf` (`UI-LOG:L19-31`; [verified] `UI-LOG:L102`).

**Container check:** if the handshake's app id is not `APP_ID`, Diagnostics shows a red row and the shell shows a banner. Screens still render, read-only, and **`writeQueue` refuses every write and create** (`WrongContainerError`, unit-tested; harness `appId=CIQ_Supplier_Portal_A00`, S38). Hiding buttons is not the enforcement; the queue is.

### 5.2 Roles (`kf/app.ts`)

```ts
heldRoles = kf.user.AppRoles.filter(r => ROLE_BY_NAME[r.Name])   // exact names from spec:roles[].name
```

- Unknown names are listed in Diagnostics.
- `ciq_case_admin` counts only if `ciq_rmm` is also held (`spec:security.hard_rules[SEC-HR2]`); otherwise Diagnostics shows a warning.
- `ciq_integration_service` gets no UI (`spec:experience.intended_workbench_landings`).
- Whether app users' `AppRoles` carry custom roles is [unverified]: it was seen only in the portal (`UI-LOG:L50`, `L104`).

### 5.3 Capabilities, derived only from `GRANTS` and `STEPS`

```ts
interface Caps {
  roles: Set<RoleIr>;                       // after the lens
  canInitiate(flow): boolean;               // GRANTS cell "I" (Case: RMM; OP: RMM + 5 Reviewers; CR: RMM)
  canEditForm(flow): boolean;               // cell "E"
  canView(flow): boolean;                   // anything except "—"
  ownsStep(irStep): boolean;                // ownerRole(irStep) ∈ roles. NAVIGATION ONLY
  reviewerDepts: Dept[];                    // from reviewer roles (+ "RMM" when ciq_rmm is held, for B_RMM / R_RMM)
  rmesEditorOf: Set<"SAF"|"REG">;           // safety → SAF, regulatory → REG (edit only; ground rule 7)
  isCaseAdmin: boolean;                     // ciq_case_admin && ciq_rmm
  hasFlowAdmin(flow): boolean;              // GRANTS cell "A" (Case Admin on the 3 Processes), after the lens
}
// actions (data/tasks.ts): the ONLY gate for step actions
heldTask(flow, instanceId, irStep?): TaskVM | null;   // a TaskVM from getMyTasksItems with that _id (and resolved step)
```

**Step actions are gated on `heldTask`, never on `ownsStep`** (ground rule 13, WB-14). A panel whose task is not held renders read-only with "You don't hold this task." Example: Jo (Safety) raises a SAF supplier point, so after K-FA Jo holds its `OPNT_S1` task; Jo gets the S1 panel although `ownerRole(OPNT_S1)` is `ciq_rmm`. `OPNT_S1` and `CASE_S1` tasks (`STEPS.fieldAssigned`) are never hidden by the lens.

**"+ New" appears only where `canInitiate`/`canEditForm` is true.** The Workbench never relies on the engine's InitiateItems grant on "M" cells (RR-2; `spec:security.post_generate_grants`).

### 5.4 "View as" (`kf/viewAs.tsx`)

**Builder probe [unverified]:** `isBuilder = await race(kf.app.getRoles(), 5 s)`, wrapped in try/catch (`master:L1117`). It resolved for Thomas in the portal (`UI-LOG:L104`), but "so this is a builder session" was an inference. `getRoles` is documented as "Only available in a Development account" (`sdk.d.ts:L1297`), which is where BDF tests the MVP, and a builder-permission staff login also passes the probe (`master:L571`). **So a real tester may get the switcher.** That is acceptable because the lens is UI-only and can only narrow.

**If the probe resolves:**
- The header shows a "View as" select: **All my roles** (the default), or one CIQ role the user holds (only roles in `heldRoles`; `getRoles().roles` is never offered).
- A banner explains: "UI lens only. Kissflow permissions are unchanged."
- The choice is kept in `sessionStorage` (try/catch).
- The lens filters `Caps.roles` and therefore the nav, task lists and actions. The server still sees every role, which is why it is a UI lens (`master:L572`).
- **The lens also downgrades the read rung:** when the chosen role has no flow Admin (`hasFlowAdmin` false for that role, i.e. anything but Case Admin), rung 1 is skipped, so Thomas's demos show what a real reviewer sees, including `partial` counts.

**If it does not resolve:** there is no switcher and no lens.

**Never called:** `switchRole`. A guard test scans the source for it, and a harness global check fails on any `SWITCH_ROLE`.

### 5.5 Navigation (`shell/nav.ts`), by capability

| Group | Shown when | Items |
|---|---|---|
| My work | `ownsStep` any RMM step | My work · Cases · Change requests · Suppliers |
| Review | `reviewerDepts` holds a reviewer department | Review queue · RMES sheet (SAF/REG editor only) · Cases |
| Approval | `ownsStep(CASE_S6)` | Approvals · Cases |
| Configuration | `canEditForm(CIQ_Config_Version_A00)` | Configuration · Section templates · Suppliers (read-only) · Cases |
| Oversight | Reader | Cases · Audit log |
| footer | always | Diagnostics · build stamp · theme toggle |

**Home (`#/`)** redirects to the first landing in this order:
1. RMM → `/my-work`
2. Reviewer → `/review`
3. Approver → `/approvals`
4. Business Admin → `/config`
5. Reader → `/cases`

If the user holds none of these, the "no-access" state shows.

**Held tasks outside the user's groups:** a task the user holds at a step their roles don't own (an `OPNT_S1` task assigned from `Responsible_User`) is always listed: in My work for RMM, and in the Review queue's "Record supplier response (manual)" group for everyone else (§8.1, §8.7).

## 6. Data layer (T0)

### 6.1 `client.ts`, copied from the portal and extended

**Kept from the portal:**
- `call()` with a 30 s `bounded()` per call;
- rate-limit retry ×3 with 600 ms × (n+1) plus jitter;
- `itemOrThrow`, `withCause`, refusal detection (050312, 050313, `PermissionDeniedToUpdate`, validation);
- `pages()` with 50 per page, stopping on a short page, on `total`, or after 200 pages (then it throws).

**Changed:**
- Keyed by flow id from `FLOWS`.
- Task lists dedupe by `_id|_activity_instance_id`, and the "no new id" stop compares that pair.
- Admin REST fallback uses `_application_id=APP_ID`. It is a **read** fallback only (GET).
- **Not copied:** the portal's `adminDelete` (`kf.api(…, { method: "DELETE" })`, `portal-client:L186-L188`) and `formDelete` (`portal-client:L200-L201`). The Workbench has no delete path (ground rule 9).
- **A timeout is not a failure.** `bounded()` races the call against 30 s, but the postMessage is not cancelled (`sdk.es:L244-L259`: `_postMessageAsync` has no timeout) and may still land. A write, submit or discard that times out returns `kind: "timeout"` and puts the item into the **uncertain** state (§7.1).

**SDK facade additions** (`kf/sdk.ts`, from `sdk.d.ts:L211-L268`, `L1031-L1240`):
- `rejectItem({instanceId, activityInstanceId, comment})`;
- `withdrawItem({instanceId, comment?})`, with **no** activity instance (the portal facade got this wrong);
- `sendbackItem({instanceId, activityInstanceId, stepId, comment})`;
- `openForm(item)` for Process and Dataform, **always bounded to 8 s** (§7.4);
- `getProgress({instanceId})`;
- `getMyTasksItems({activityId?})`;
- `getMyItems({status})` including `"draft"`;
- Dataform `getItem`, `createItem`, `updateItem`, `submitItem` and `discardItem()` (no item id: it discards the user's current draft of that Form, `sdk.d.ts:L859-L865`).
- **No** `deleteItem` on any facade.
- `updateAdminItem` is exposed by the facade but may be imported only by `data/adminRepair.ts` (guard, §10.2).

**Kept as they are:** `rowsOf`, `totalOf`, `envelopeOf` and `errorText`. Live envelopes are `{Columns, Data}` and `{_id, Columns, Sort, Filter, Data}`, with no total ([verified] `UI-LOG:L106-L110`). **`kfDateTime` moves to `normalize.ts`** (the portal keeps it in `sdk.ts`); `toISOString(` is banned everywhere else (§10.2).

### 6.2 Read ladder (WB-4)

**For each Process list** (cases, points, CRs), try in order and record which rung answered:

1. `getAdminItems()`. Works for Thomas in the portal ([verified] `UI-LOG:L110`) and for Case Admin after the flow-Admin grant (`spec:security.post_generate_grants[0..2]`). Skipped when the "View as" lens picks a role without flow Admin (§5.4).
   - **Admin list rows carry no current step** (`UI-LOG:L43`, CAFM D55, live). On rung 1 the step of each **open** item (`_status` In progress, or `_status` absent) is read with `getAdminItem`, in a pool of 4, cached until the next reload. Status columns, "Upcoming approvals" and the stray-item tiles use these per-item reads, never a list-row `_current_step`. Sparse admin rows are filled the same way when a count needs `Open_Num`/`CR_Open_Num`.
2. **Viewer route** [unverified]. This rung is a pluggable probe that **stays disabled** until Diagnostics, live, finds a route for View members. App Builder creates "All Items" report View grants ([verified] `SPIKES:L42`), but no SDK or REST call for them is known. No route is guessed.
3. `getMyItems({status:"all"})` ∪ `getMyTasksItems()`. Always available.

**Forms:** `getDataform(id).getItems()` pages to the end. Live Dataform `getItems` is [unverified] (`UI-LOG` "still unverified"). A Form list that pages to a short page with no error counts as complete (`quality: "form"`); an error gives `quality: "failed"`.

**F8 case index:** "Item created" rows (`Event_Category = "Item created"`, `Object_Kind = "Case"`) carry `Case_Item_Id`, `Case_Code`, `Cycle_No` and `Snapshot_JSON`, which holds the case header (§7.6). The case list merges these, so that a role on rung 3 can still find cases. Those rows show "status not readable with your access".

**Every list hook returns** `{ rows, quality: "admin"|"viewer"|"mine+tasks"|"form"|"failed", indexOnly: Set<id>, warnings[] }`. `ReadQualityBanner` explains a degraded result.

**When a read is complete enough to count (WB-5).** `confidence` is computed in `counts.ts` and is `"complete"` only if **all** of these hold:
- every Process list the count depends on has `quality` `"admin"`, or `"viewer"` **and** Diagnostics has proven that viewer route live this session;
- every Form list it depends on has `quality` `"form"`;
- no matched item is index-only;
- every matched item has `readQuality` `"full"` or `"row"` **and** a readable `_status` and `Open_Num`/`CR_Open_Num` (else it is fetched per item on rung 1, and if that fails the result is partial).

`"mine+tasks"` (rung 3), `"failed"`, or any index-only item **always** gives `"partial"`. The result also lists `unread: { flow, reason }[]`, so the screen can say exactly what could not be read (e.g. "Open points of this case: only the ones you raised or hold a task on are visible with your access"). Unit test (T0, `counts.spec.ts`): the same items give `complete` with `quality: "admin"` and `partial` with `"mine+tasks"`, and a missing `Open_Num` gives `partial`.

**Item reads, in order:**
1. `getItem({instanceId, activityInstanceId})` when the user holds a task on the item;
2. `getAdminItem` when on rung 1;
3. the list row (fields may be sparse, [unverified] `UI-LOG:L117`).

`map.ts` marks each view model `readQuality: "full"|"row"|"index"`.

**Re-read after submit** (D35): use the item-read order above. After a submit the user's task is closed, so `getItem` with that activity instance answers "This item has moved out of your queue" (`SPIKES:L118`). For a non-admin user (rung 3) that is the **expected** outcome: the result says "submitted; the post-submit check could not read the item with your access". That is a note, not an error. Only rung-1 users get the before/after lane comparison.

### 6.3 Tasks and the step resolver (`tasks.ts`, WB-6, WB-7)

**Loading tasks:**
- For each of the 3 processes, call `getMyTasksItems()`, paged.
- If any step of that flow has a `serverActivityId`, call `getMyTasksItems({activityId})` per owned step instead. The step is then known by construction.

**Why this is careful.** A case in Part 2 can have up to 6 open branch activities on one `_id`. Every row key such as `_current_step` is treated as **item-level** until Diagnostics proves otherwise [unverified]. On a Part 2 item it may hold the block name "Part 2 – Beiersdorf review" (`spec:workflow.processes.CIQ_Case_A00.steps[4].name`, a Parallel step) or the name of *another* branch. Thomas holds every role, so a SAF task row could otherwise resolve to REG, and the next 050313 would wrongly mark REG `kwb:refused`.

**Step of a task row**, tried in order. Each answer carries an **evidence level**:
1. the activity filter used to fetch it (`serverActivityId`, after read-back) → `activity`;
2. `getProgress({instanceId})`, matching the row's `_activity_instance_id` → `activity` [shape unverified; harness `progress=on|off`];
3. item-level evidence, **only when the user holds exactly one open task on that `_id`**: a row key from `STEP_KEYS = ["_current_step", "_current_activity_name", "_activity_name", "_step_name"]`, else the same keys from `getItem` for that task:
   - a known non-Parallel step name in that flow → `item`;
   - the Parallel block's name, and the user's (lensed) roles own **exactly one** branch step of that block → that branch, `block-unique`;
4. otherwise unresolved: a TaskVM with `step: null`, shown as "Task at an unidentified step: open in Kissflow" (the **Open task form** button, §7.4).

The resolver **never** returns a Parallel or End step. Only `activity` and `block-unique` evidence may mark a step `kwb:refused` (WB-9); with `item` evidence a 050313 is reported as a plain refusal for that task only.

**The session cache** records `(flow, stepName) → activityId` whenever a row carries both (keys `_activity_id`, `_current_activity_id` [unverified]) **and** the step was resolved with `activity` evidence. `sendBackPoint` uses it (§7.5). Diagnostics prints every `_`-prefixed key seen on task rows and the evidence level per task.

**TaskVM:** `{ key, flow, instanceId, activityInstanceId, step, stepName, evidence: "activity"|"block-unique"|"item"|null, caseItemId?, caseCode?, cycleNo?, title, due?, raw }`. Missing case fields are filled lazily through `getItem`, in a pool of 4.

**Unit tests (T0, `tasks.spec.ts`):** three Part 2 rows on one `_id`, all carrying the block name → unresolved without progress, resolved with progress; one row carrying another branch's name for a multi-task user → not used; a single-role user with the block name → `block-unique`.

### 6.4 View models and mapping (`viewModels.ts`, `map.ts`)

`map.ts` is the only module that touches raw field ids. Each view model keeps `raw` for Diagnostics. Status comes from `_status` and the current step (`brd:L860`), matched case-insensitively. The current step comes from a full item read (on rung 1 a per-item `getAdminItem`, §6.2) or a held task; a list row's `_current_step` is never trusted for an admin list, and is item-level for any other list (§6.3). A cancellation is `_status` Rejected or Withdrawn, plus an F8 Cancellation row (`brd:L845-L855`). Overall rejection is `Overall_Decision = "Rejected"`; it is a business outcome, not a cancellation.

**Change request ↔ case link (`crBelongsTo(cr, case)`).** `Case_Item_Id` on a CR is set only at Triage (`spec:architecture.text_key_links[TK10]`; Mandatory only at `CHRQ_S1`). So a CR belongs to a case when `cr.Case_Item_Id = case._id`, **or** `cr.Case_Item_Id` is blank **and** `cr.Case_Code = case.Case_Code` **and** `cr.Cycle_No = case.Cycle_No`. `useCaseBundle`, `openCrCount` and `laneOpenCount` all use it. This deliberately **counts untriaged CRs** (`CR_Open_Num` is 1 while `CR_Outcome` is blank), which is stricter than `brd:L980` (R19: "isn't counted") [provisional, WB-D11]. Unit test: a triaged CR, an untriaged CR of the same cycle, and an untriaged CR of another cycle.

| View model | Main fields (ids) |
|---|---|
| `CaseVM` | `Case_Code`, `Cycle_No`, `Case_Title`, `Trade_Name`, `Main_INCI`, `BDF_Material_No`, `SAP_Material_No`, `IRMA_Ref`, `Supplier_Code`, `Supplier_Legal_Name`, `Owner_RMM`, `BDF_Contact_*`, `Target_Markets_Text`, `Markets_Label`, `Origin_Types`, due dates (`Supplier_Due_Date`, `Completeness_Due_Date`, `Final_Release_Due_Date`), contacts (4 fields), release pin (`Release_Item_Id`, `Release_Key`, `Manifest_Hash`), `Overall_Approval_Required`, `Overall_*`, `Completeness_*`, `Final_Release_*`, counts, gates (`Hold_For_Open_Items`, `Open_Items_Gate_Release/_Close`), `Case_Test`, `Reactivates_Case_Item`, `lanes: Record<Dept, LaneVM>`, `status`, `currentSteps`, `readQuality` |
| `LaneVM` | `Dept_<D>_Active`, `<D>_Review_Confirm`, `<D>_Completed_By/_Email/_At`, `<D>_On_Behalf_Of`, `<D>_Open_Count`, `<D>_Gate`; for SAF/REG also `<D>_RMES_Decision(_Reason)` and `<D>_RMES_Gaps` |
| `PointVM` | OP fields (`spec:data_model.flows.CIQ_Open_Point_A00.fields`, 53), `rounds: RoundVM[]` (Rounds child), `Open_Num`, `Start_Gate`, `status`, `step` |
| `CrVM` | CR fields, `impacts: Record<5 depts, {impact, assessment, by, at, note}>`, `CR_Open_Num` |
| `SectionVM`, `RunVM` | F3 and F4 fields, `components` (Components child) |
| `RmesVM` | F5/F6 header, `criteria[]`, `findings[]` |
| `NoteVM`, `AuditVM`, `SupplierVM` (+ `contacts[]`), `ConfigVM` | the Form fields |

### 6.5 Hooks (`hooks.tsx`)

The `WorkbenchData` provider supplies:
- `kf`, `me`, `caps`, `lens` and `isBuilder`;
- `toasts`, through the copied `Toaster`, which is bound to this provider and not the prototype store;
- `busy` ("Saving…" / "Updated hh:mm"), and `warnings[]`, which are never swallowed.

**Hooks:**
- `useTasks()`;
- `useCaseList()`;
- `useCaseBundle(caseId)`: the case plus its points, CRs (`crBelongsTo`, §6.4), sections, runs, notes and events (Forms filtered by `Case_Item_Id`), each list with its `quality`;
- `usePoint(id, act?)`, `useCr(id, act?)`;
- `useFormRows(flow, where?)`.

Each returns `{ data, loading, error, warnings, reload }`. On a failed reload, the last good data stays and an error banner shows. Reads may run in parallel (pool of 4); writes may not (§7).

### 6.6 Normalisation (`normalize.ts`)

| Type | Written as | Compared as | Status |
|---|---|---|---|
| DateTime (header **and** child-row columns, e.g. `Rounds_Reviewed_At`, `Criteria_Recorded_At`) | `kfDateTime()` = `…:ssZ`, defined here | to the second | ms refused: [verified, CAFM] `UI-LOG:L41` |
| Date | `YYYY-MM-DD` | string date | [unverified] (3 Case Date fields); Diagnostics shows a raw read |
| Number | number | `Number(x)` | |
| User | `{ _id }` | by `_id` | [unverified]. Readers accept `{_id}`, `{_id,Name}` or `"Us…"` |
| Reference (`Result_Case`) | `{ _id: caseId }` | by `_id` | [unverified] |
| Select, Text, Email, Textarea | string | trimmed string | |
| Clear a field | Text types `""`; typed fields `null` | `isBlank` (null, undefined, `""`, `[]`, an object without `_id`) | [unverified] |
| Attachment | never written by the MVP | | |

`compact()` drops `undefined`. Explicit clears use a `CLEAR` sentinel, so a clear is never an accident.

## 7. Write layer (T0): D32, D33, D34

### 7.1 Queues (`writeQueue.ts`)

- **Container check first:** when the handshake's app id is not `APP_ID`, every `enqueue` and `create` rejects with `WrongContainerError` before anything is sent (§5.1).
- **One serial chain per item:** `Map<itemKey, Promise>`. The item key is `flow:_id`. Process steps and the item share one chain, because a write races any other write to the item (`SPIKES:L152`).
- **Uncertain items (D32 one-write-in-flight, `dec:L458`).** When a write, submit or draft discard to an item times out, the SDK call may still land later (§6.1). The item is marked `uncertain: { since, patch }`, and **every further write to it is refused locally** ("The last save to this item did not answer. Press Re-read before saving again."). Re-read reads the item back, compares it with the timed-out patch (or, after a submit, settles by listing my tasks), shows what landed, and clears the mark; a reload also clears it. The create lane gets the same treatment: a timed-out create blocks the lane until settle finishes (§7.6). Unit test: a fake SDK that answers after the timeout; the second write is refused; `__kfOverlaps` stays empty in harness S41.
- **One create lane per session** for every Form and Process create (create → submit → verify, then the next). This covers per-user drafts colliding ([verified] `SPIKES:L158`). It is coarser than "per form" on purpose: drafts are per user, so this is "one create at a time per user" within the session.
- **Cross-tab:** if `navigator.locks` exists, the create lane also takes `navigator.locks.request("ciq-wb-create")`, **inside try/catch**: in a sandboxed or opaque-origin frame the request can reject, and then the in-memory lane alone is used [unverified inside the frame].
- **No autosave for gate or count fields** (D35, `dec:L482`). Text drafts may be kept locally until "Save", with no server write.

### 7.2 `writeVerified` (D32, `dec:L455-L462`)

```ts
type Target = { kind: "task"; flow; instanceId; activityInstanceId; step: StepIr; evidence }   // process at a step
            | { kind: "form"; flow; itemId };                                               // NEVER CIQ_Audit_Event_A00
// There is no "admin" target. The only admin-route write is adminRepair.ts (§7.10).
type Patch  = { fields: Record<FieldId, Value | typeof CLEAR>;
                tables?: Record<ChildTableId, RowOp[]> };   // RowOp: add{row} | modify{_id,row} | delete{_id}

async function writeVerified(t: Target, p: Patch): Promise<SaveResult> {
  return queue(itemKey(t), async () => {                              // rejects on wrong container or an uncertain item (§7.1)
    // 1. local guards (each throws LocalGuardError: a code bug, loud)
    if (t.flow === "CIQ_Audit_Event_A00") throw guard("F8 is create-only")            // WB-15
    if (keysOf(p).some(k => isComputed(t.flow, k))) throw guard("computed field")     // WB-13
    if (t.kind === "task") assertWritable(t.step, keysOf(p))                          // perms of that step (computed excluded)
    // 2. normalise per field type (§6.6); child adds get client _id "<ChildModelId>_<10 rnd>"
    let pending = normalise(t.flow, p)
    for (let attempt = 1; attempt <= 4; attempt++) {                  // 1 write + up to 3 re-applies
      try { await update(t, toBody(pending)) }                        // process updateItem / dataform updateItem
      catch (e) {
        if (isTimeout(e)) { markUncertain(itemKey(t), pending); return { ok:false, kind:"timeout", message: errorText(e) } }
        if (t.kind === "task" && isFieldRefusal(e)) {
          // this task always gets the fallback (openForm uses its own _id|act, so it is right whatever the step);
          // the STEP is marked for the session only on strong evidence (WB-9)
          if ((t.evidence === "activity" || t.evidence === "block-unique")
              && refusedFieldsOf(e).coversAll(keysOf(pending)))      // the 050313 list names every key sent
            markKwbRefused(t.flow, t.step)
          return { ok:false, kind:"kwb-refused", fields: keysOf(pending), message: errorText(e) }
        }
        return { ok:false, kind:"refused", message: errorText(e) }
      }
      const back = await readBack(t)                                   // same route as the write
      pending = missingFrom(back, pending)                             // fields: normalised compare; tables: see below
      if (isEmpty(pending)) return { ok:true, attempts: attempt, item: back }
    }
    return { ok:false, kind:"not-kept", missing: keysOf(pending),
             message: "Kissflow did not keep: … after 3 retries. Someone else may be saving this item. Reload and check." }
  })
}
```

**Child rows on re-apply** [verified REST `SPIKES:L88-L91`, `L100-L101`; SDK unverified]. The client `_id` scheme was proven only over REST with the account key. If the host assigns its own row ids, verify-by-`_id` would re-add the same row up to 3 times. So `missingFrom` treats an `add` as present when a row with the same client `_id` **or** the same **natural key** exists: Rounds → `Rounds_Round_No` + `Rounds_Outcome`; Criteria → `Criteria_Code`; Findings → `Findings_Criterion_Code` + `Findings_Text`; Contacts → `Contacts_Email` (lower-case); Components → `Components_Row_Id`. A `modify` or `delete` whose `_id` is unknown on read-back is matched by natural key too. Harness mode `childIds=server` (S42).

`WriteOutcome` renders the results in a fixed way:
- `ok`: a toast after the read-back, never before.
- `not-kept`: a red banner naming the fields.
- `kwb-refused`: the `KwbFallback` panel (§7.4).
- `refused`: a red banner with Kissflow's message and the field labels.
- `timeout`: "…did not answer within 30 s. This item is locked for saving until you press **Re-read**." (the uncertain state, §7.1).

**Before a task write,** `markKwbRefused` state is checked. A step already known as refused skips the SDK write and opens the fallback directly (WB-9).

**Unit tests (T0, `writeVerified.spec.ts`)**, in addition to §12: a computed key throws; any F8 target throws; a 050313 with `item` evidence returns `kwb-refused` for the task but marks no step; a 050313 listing only some of the sent keys marks no step; a 050313 with `activity` evidence listing every key marks the step; a timeout marks the item uncertain and the next write is refused; with server-assigned row ids a missing-looking add matched by natural key is not re-added.

### 7.3 `submitStep` (D33 `dec:L464-L469`; D35 `dec:L482`)

```
submitStep(task, { extraChecks, laneFields?, comment? }):
  0. heldTask(task) must exist (ground rule 13) and the item must not be uncertain (§7.1)
  1. await the item's queue (a pending save finishes first; if it failed, refuse: "the last save failed, this step was not sent")
  2. fresh = getItem(task)                                   // server truth, formulas included
  3. problems = mandatoryAt(task.step).filter(f => isBlank(fresh[f]))      // writable Mandatory fields only (no computed)
              + gateFieldsAt(task.step).filter(g => fresh[g] !== "OK")    // computed gates: Start_Gate / <D>_Gate /
                                                                           // Open_Items_Gate_* must read "OK" on the SERVER
              + extraChecks(fresh)                           // e.g. S5: lane check (§8.5); lane blockers (§8.8)
     if problems → show them by field label; DO NOT submit   // server does not enforce Mandatory [verified] SPIKES:L144
  4. snapshot = pick(fresh, laneFields)                      // lane steps only
  5. submitItem({instanceId, activityInstanceId, comment})   // never put fields in the body (ignored) SPIKES:L142
  6. lane steps only: writeAudit("lane.completed", Snapshot_JSON = snapshot)   // §7.8; the repair source for §7.10.
     If it is not verified: an amber banner "lane snapshot not recorded"; the submit already happened, so nothing is undone
  7. after = rereadAfterSubmit(task)                         // §6.2 order; for rung-3 users "not readable" is expected
     if after && diff(snapshot, pick(after, laneFields)) → red banner "lane values changed after submit: …"
  8. reload tasks + the case bundle
```

A computed gate is shown in the problems list by its label with the client mirror's explanation ("SAF gate is not OK: SAF open count is blank"), never as an input to fill.

**Submit errors:**
- a timeout marks the item uncertain and runs the portal `settle` logic: list my tasks, and if the task is gone, count it as sent and clear the mark;
- "moved out of your queue" means the task was closed (someone else acted, or it was submitted natively): reload and say so.

### 7.4 K-WB fallback (D35 `dec:L484`; WB-9)

**Trigger:** `updateItem` at a step after Start fails with 050313 or `PermissionDeniedToUpdate`. Over REST the key got exactly this for every field ([verified] `SPIKES:L141`). A real user's SDK session is [unverified].

**`KwbFallback` panel** (always the same content, whatever `openForm` does):
- Says: "Kissflow did not let the Workbench save fields at *<step>*. Enter these values in the Kissflow task form, save there, then come back and press *Re-read*."
- **The values sheet is always shown:** every pending field with its label, value and a copy button, plus child rows (e.g. the Rounds row of a Return) as label/value blocks. Computed fields never appear (WB-13).
- **The instruction is always shown:** "If the form does not open, open this task from Kissflow's **My Tasks**: <case code> · <step name>."
- An **Open task form** button calls `openTaskForm(task)` = `process.openForm({_id, _activity_instance_id})` (`sdk.d.ts:L1144`). It is never called automatically. The call is **bounded to 8 s**, because `_postMessageAsync` has no timeout and may never answer (`sdk.es:L244-L259`; `PROCESS_OPEN_FORM`, `sdk.es:L1169`). A hang or an error only adds a one-line note ("Kissflow did not open the form; use My Tasks"); the sheet stays. `openForm` inside an Application component is [unverified].
- **Pending values survive a reload:** `data/pendingSheet.ts` stores `{ fields, tables, stepName, savedAt }` in `sessionStorage` under `wb:pending:<_id>|<act>` (try/catch; without storage the sheet lives in memory only), because `openForm` may navigate away or unload the frame. On load, a task with a stored sheet opens its fallback panel again. The entry is removed after a passing Re-read or a confirmed submit.

**Re-read:** reads the item again and runs the write-then-verify compare without writing.
- When everything matches, the user can submit from the Workbench (§7.3), because submit by an assignee works ([verified] `SPIKES:L140`), or submit in the native form.
- When `getItem` answers "This item has moved out of your queue" (`SPIKES:L118`), the user has most likely **submitted in Kissflow**: the panel says "Submitted in Kissflow; the Workbench could not check the values with your access", clears the sheet and reloads the tasks.

**Session state:** the step is marked `kwb:refused` for the session (only on strong evidence, WB-9), and Diagnostics shows it. Form writes (F1–F8) are not affected.

**Test ids:** `wb-kwb`, `wb-kwb-sheet`, `wb-kwb-mytasks`, `wb-kwb-openform`, `wb-kwb-openform-note`, `wb-kwb-reread`.

### 7.5 Open Point Return: `sendBackPoint` (D34 `dec:L472-L478`; D35 `dec:L483`)

**Allowed only** at `OPNT_R_<D>`, when `OP_To_Supplier = "Yes"`. Send-back is on only at R_* (`spec:workflow.meta.after_generate_switches.CIQ_Open_Point_A00`).

1. **Inputs:** new `Question_Text`, `Supplier_Justification`, `Supplier_Due_Date`, `Internal_Due_Date`, and a return reason. All are required by the client.
2. **`writeVerified`** at the R step:
   - a `Rounds` add row: `Rounds_Round_No` = n, `Rounds_Question_Text` = old question, `Rounds_Response_Kind/_Text` = old response, `Rounds_Outcome` = "Returned", `Rounds_Reason` = reason, `Rounds_Reviewed_By` = me, `Rounds_Reviewed_At` = now;
   - `Round_No` = n+1;
   - `Query_Key` = `OP_Key|R<n+1>`;
   - the new question, justification and due dates;
   - `Thread_Text` += a dated block;
   - **CLEAR** `Response_Kind`, `Response_Text` and `Response_Doc_Refs_JSON`;
   - `Awaiting_Response` = "Yes";
   - `Portal_Contact_Ids` refreshed from the case (COH-12);
   - `Return_Reason` = reason;
   - `OP_Outcome` left blank (BR-046; plan L174).
   - **If this write returns `kwb-refused`:** nothing was saved. Go straight to the `KwbFallback` panel (§7.4) with the **round values** (the Rounds row: `Rounds_Round_No`, `Rounds_Outcome` "Returned", `Rounds_Reason`, `Rounds_Reviewed_By`/`_At`, the old question and response) **and** the header values above, and the text: "Kissflow did not let the Workbench save the new round. In the task form, enter these values, save, then use **Send back** to *Waiting for supplier*." Re-read then checks both the values and the step. Steps 3–5 are skipped.
   - Any other failure (`refused`, `not-kept`, `timeout`) stops the Return with the §7.2 message; no send-back is attempted.
3. **`stepId`** = `serverActivityId(OPNT_S1)`, or the session cache (§6.3), or `getProgress`. If it is unknown, go to step 5.
4. **`sendbackItem({instanceId, activityInstanceId, stepId, comment: reason})`.** Over the key it answered 500 ([verified] `SPIKES:L147`); a real user is [unverified].
5. **Fallback:** the same panel, with: "Kissflow refused the send-back from the Workbench (<reason>). Open the task form and use **Send back** to *Waiting for supplier*. The new round is already saved." The sentence "already saved" appears **only** after step 2 returned `ok` (a verified write). Then "Re-read". It passes when the current step is "Waiting for supplier", or when the read answers "moved out of your queue" (§7.4: sent back in Kissflow).
6. **Further fallbacks** (initiator resubmit, successor point; `dec:L483`) are **not built tonight**. They are listed on the panel as "ask Thomas".

**Mandatory is not checked** on a Return: `OP_Outcome` is Mandatory at R_*, but a Return leaves it blank. Whether a send-back skips the Mandatory check is [unverified] (D35 F5 asks for exactly this live test, `dec:L483`).

### 7.6 Creates

**`createProcessItem(flow, data, { postCreate? })`** runs in the create lane:
0. **Pre-create check:** `mandatoryAt(<Start>)` minus `POST_CREATE_KEYS[flow]` (`Case_Code`, `Request_Key` for the case; they derive from the new `_id`) must be filled in `data`; problems are listed by label and **nothing is created**.
1. `createItem({data})` gives the draft at Start (`{_id, _activity_instance_id}`). A create with fields preset at Start works ([verified] `SPIKES:L73`).
2. **Verify the full create payload:** `getItem` at Start and compare **every** field of `data` (normalised, §6.6). This covers Editable presets such as `Case_Title`, `SAP_Material_No`, `Target_Markets_Text` and `Case_Test`, and the unverified User/Date/Reference shapes (D32: every save is write-then-verify, `dec:L457`).
3. `writeVerified({kind:"task", step:<Start>})` with `postCreate(draft)` (the `_id`-derived keys) **plus** every field from step 2 that was missing (re-applied through `updateItem` at Start, up to 3 times). This is the K-WB-free path: Start drafts accept updates (`SPIKES:L102`).
4. **Full** Mandatory and gate check at Start (§7.3, steps 2–3), now including `POST_CREATE_KEYS`.
5. `submitItem`.
6. `settle`: if the submit fails or doesn't answer, list my items to see whether it went through. If it did not, discard the draft and rethrow. If the discard fails, say so (portal `liveActions.ts:152-174`).

**`createFormRow(flow, data, keyField, { reapply = true })`** also runs in the create lane. Kissflow keeps **one Form draft per user** (`draft_<userId>`, [verified] `SPIKES:L158`), so a leftover draft (from an interrupted create, or the user's own native form) would collide or leak stale values into the new row.
0. **Required check:** every `FIELDS[flow][*].required` field (e.g. 11 on `CIQ_Section_A00`, `Note_Text`, `Event_Category`, `Config_Key`/`Config_Kind`, `Run_Key`, `Supplier_Code`/`Supplier_Legal_Name`) must be filled; problems are listed by label, as `submitStep` does. Server enforcement for Forms is unknown.
1. **Discard first:** `getDataform(flow).discardItem()` (no item id; it discards the user's current draft of that Form, `sdk.d.ts:L859-L865`). An error that means "no draft" is ignored; any other error stops the create with "Could not clear your open draft of <form>" [discard semantics unverified; harness `drafts=sticky`].
2. `createItem({data})`.
3. `submitItem({itemId})`.
4. Verify by `getItem({itemId})`. If that is not found, page `getItems` and match `keyField`, because the id may change on submit [unverified].
5. **On a failed or unanswered submit (settle):** page `getItems` by `keyField`. If the row exists, continue with step 4. If it does not, call `discardItem()` again and rethrow; if that discard fails, say so ("your draft of <form> is still open; it may block the next create"). The create lane stays blocked until settle finishes (§7.1).
6. If fields are missing after step 4: with `reapply: true`, re-apply them with `updateFormRow` (up to 3 times). With `reapply: false` (**always for F8**), do **not** update: return `{ ok: false, missing }` and let the caller write a correcting row (§7.8).

Every created Form row carries a unique key (§4.6).

**`updateFormRow(flow, itemId, patch)`** is `writeVerified` with `kind: "form"`; it throws for `CIQ_Audit_Event_A00`. Child rows use `Table::<id>` ([verified REST `SPIKES:L88-L91`, `L100-L101`; SDK unverified], natural-key matching in §7.2).

**Unit tests (T0, `actions.spec.ts`):** pre-create check passes without `Case_Code`/`Request_Key` and the full check before submit fails without them; a dropped preset (`SAP_Material_No`) is re-applied at Start; `discardItem` is called before every Form create; a failed Form submit with no row found calls `discardItem` and rethrows; a failed discard is surfaced; F8 creates never call `updateFormRow`.

### 7.7 Reject, withdraw, cancellation (D34; `brd:L843-L855`)

**`rejectCase(task, reason)`.** Offered only where reject is on and the user holds the task: Case S1, S2, S3, S5, S7, S8 (`SWITCHES`).
1. The reason is required: a non-empty comment, enforced by the client.
2. `writeAudit(Cancellation)`, **before** the reject (`dec:L476`; COH-15). The row carries:
   - `Event_Category` = "Cancellation";
   - `Event_Reason` = reason;
   - `Action_Code` = "case.cancel";
   - `Actor_Side` = "BDF", `Actor_Name`, `Actor_Email`, `Actor_Dept`, `Actor_Role_Id`;
   - `Event_At` = now;
   - `Case_Code`, `Cycle_No`, `Case_Item_Id`;
   - `Object_Kind` = "Case", `Object_Item_Id`;
   - `Notify_Recipient` = `Supplier_Contact_Emails`.
3. If that row is not verified, **stop**: the reject is not sent. "Verified" means the row was read back complete, **or** it was read back with missing fields and a correcting row (`case.cancel.correction`, §7.8) was then verified.
4. `rejectItem({instanceId, activityInstanceId, comment: reason})`. Reject works over REST ([verified] `SPIKES:L145`); through the SDK it is [unverified].
5. If the reject fails, write a second F8 row with `Event_Category` = "Case", `Action_Code` = "case.cancel.failed" and `Object_Key` = the first `Event_Key`. Show a red banner. Never edit or delete the first row.

The supplier e-mail (Z2) is off. The UI says "Cancellation recorded. The supplier is not notified automatically yet."

**Hand-off for the Z2 builder** [provisional, WB-D7]: the Cancellation row stays **before** the reject (COH-15; the cancel must be audited even if the reject is lost). Once Z2 is live it would e-mail the supplier on a cancel that then failed. So Z2 must also check that the case's `_status` is Rejected or Withdrawn (after a short delay), and skip when a `case.cancel.failed` row with `Object_Key` = this `Event_Key` exists. The "Ended without cancellation event" tile (§8.1) stays the safety net for the opposite case.

**During Part 2 and S6** (Case Admin, `isCaseAdmin`):
1. Write the same F8 row.
2. Then try `rejectItem` with an activity instance taken from `getAdminItem`, if the row carries one.
3. Otherwise say: "End the case as process admin in Kissflow (reject). The cancellation event is recorded."

This is [unverified, K-13 / K-PAR-3]. The cascade (ending the case's open points and CRs) is listed with links only; it is not automated tonight.

**Native withdraw** is not offered (COH-17). A case found Withdrawn is shown as cancelled.

### 7.8 F8 rows the Workbench writes (`audit.ts`)

| When | `Event_Category` | `Action_Code` | Source |
|---|---|---|---|
| Case created (after the S0 submit and the BASIC section) | Item created (`Snapshot_JSON` = case header, used by the case index) | `case.created` | `spec:architecture.journey_flow_map[j01_create_case]` |
| Case cancel (before the reject) | Cancellation | `case.cancel` | j12; `dec:L476` |
| Cancel failed | Case | `case.cancel.failed` | §7.7 |
| Hold override at S5 / S8 | Case | `hold.override.release` / `hold.override.close` (`Event_Reason` = override text) | j09; `spec:workflow.meta.security_handoff.items[10].note` |
| CR triage after final release | Change attempt | `cr.refused.after-release` | j13; BR-052 |
| Config publish, retire, release | Configuration | `config.publish` / `config.retire` / `release.publish` / `config.hash.mismatch` | j15; BR-057 |
| Lane sign-off with `On_Behalf_Of` | Delegation | `lane.on-behalf` | j05 |
| "Mark section reviewed" | Section review (`Object_Key` = `Section_Item_Key`; `Source_Answers_Rev` blank while portal answers are unreadable, K-14) | `section.reviewed` | j05 |
| Lane submitted (after `submitItem` at `CASE_B_<D>`, §7.3 step 6) | Case (`Object_Key` = `<Case_Code>:lane:<D>`, `Snapshot_JSON` = the lane fields as submitted) | `lane.completed` | D35 (`dec:L482`); §7.10 |
| Case Admin lane repair | Case (`Object_Key` = the snapshot row's `Event_Key`; `Old_Value_Text`/`New_Value_Text`; `Event_Reason`) | `lane.repaired` | §7.10 |
| Attestation of a partial check (`countsPolicy` = `attest`) | Case (`Object_Key` = `<Case_Code>:lane:<D>` / `:hold:release` / `:hold:close` / `:approval`; `Event_Reason` = the attestation text; `Snapshot_JSON` = `{ value, read: [{flow, quality, rows}], unread: [...] }`) | `count.attested` | WB-5, WB-D1 |
| A row read back with missing fields | same category as the first row (`Object_Key` = the first row's `Event_Key`; every field of the first row again) | `<code>.correction` | WB-15 |
| Retire a Published config (WB-D6) | Configuration (`Object_Key` = `Config_Key`; `Old_Value_Text` "Published", `New_Value_Text` "Retired") | `config.retire` | j15; BR-057 exception |
| Assignment | not in the MVP (no assignment UI) | — | j05 (deferred) |

**Rules (WB-15):**
- Every row carries the actor fields and `Event_At` (no ms) plus the case keys.
- **Create-only.** `writeAudit(e)` = `createFormRow(F8, row, "Event_Key", { reapply: false })`: create → submit → verify. If the read-back misses fields, it writes **one** correcting row (`Action_Code` = `<code>.correction`) and verifies that. A verified correction counts as the event being recorded; if the correction also fails, `writeAudit` fails. It never calls `updateFormRow`, `updateItem` or any delete on F8.
- **Guards:** `writeVerified` and `updateFormRow` throw for `CIQ_Audit_Event_A00` (unit test); `audit.ts` imports neither (static guard, §10.2); the harness fails a scenario on any `DATAFORM_UPDATE_ITEM` or `DATAFORM_DELETE_ITEM` to F8 (§11.2).
- `audit.spec.ts`: a complete row → verified, 1 create; a row missing `Notify_Recipient` → a `case.cancel.correction` row with `Object_Key` = the first `Event_Key`, 2 creates, 0 updates; both failing → `writeAudit` rejects and `rejectCase` does not send the reject.
- Logging manual supplier-side records as F8 rows is **not** in the MVP [convention]; the "manual record" label on the step is the MVP's trace.

### 7.9 Counts and gates (`counts.ts`, `gates.ts`; BR-007, D10, D23, D27, D35)

All count functions are pure. Each takes the items, the `quality` of every list it used and each item's `readQuality`, and returns `{ value, confidence: "complete"|"partial", items[], unread[] }`. **Confidence follows the rule in §6.2** (WB-5): rung 1, a Diagnostics-proven viewer rung, or a complete Form list → may be `complete`; rung 3, the F8 index, a failed list, or an item without a readable `_status` and `Open_Num`/`CR_Open_Num` → `partial`, always.

**When is an item open?** When `_status` ∉ {Rejected, Withdrawn} **and** the formula `Open_Num`/`CR_Open_Num` = 1 (> 0 for CRs). If the formula is unreadable, the item counts as open while In progress (an upper bound) **and** the result is `partial`.
- This keeps COH-17: stray rejects are ignored.
- It also keeps `brd:L915`: a withdrawal drops the count at once.

**The counts:**
- **`openItemsCount(case)`**: open OPs with `Case_Item_Id` = the case, **all** kinds (Contact update and Department review included).
- **`openCrCount(case)`**: open CRs with `crBelongsTo(cr, case)` (§6.4), so untriaged CRs count (WB-D11).
- **`laneOpenCount(case, D)`** (`brd:L809-L817`): open OPs of the case with `OP_Dept` = D or `Raised_By_Dept` = D, except `OP_Kind` "Contact update"; **plus, only when `CR_DEPT_FIELDS[D]` exists** (REG, SAF, QM, MIC, SUS), CRs with `crBelongsTo` whose `CR_DEPT_FIELDS[D].impact` = "Yes" and `CR_DEPT_FIELDS[D].assessment` is blank. **`laneOpenCount(case, "RMM")` has no CR term** (there is no `Impact_RMM` or `RMM_Assessment`). Section-review marks are a separate client blocker (§8.8, WB-D5), not part of this number.
- **`rmesGaps(case, D ∈ SAF/REG)`** = `Open_Criteria_Count + Open_Blocking_Findings_Count` of the non-voided RMES row [convention: this reading of blocker 3, `brd:L812-L816`]. With no RMES row, the result is blank, and the lane shows a blocker.
- **RMES header:** `Open_Criteria_Count` = Σ over criteria rows of `Criteria_Open_Num` **as read back from the server**, where a **blank `Criteria_Open_Num` on a row with `Criteria_Applicable` ≠ "No" counts as 1** and adds the warning "server formula blank on <code>; counted as open". Only child-column formulas on a Form are involved here, and only Process header formulas are proven (`SPIKES:L75`, `L105`; embedded aggregates were unreliable, `L103`), so a live blank must not turn into 0. `Open_Blocking_Findings_Count` = findings with `Findings_Blocking` = "Yes" and `Findings_State` ≠ "Closed". The `Findings_State` values are open (Q9); the MVP uses "Open"/"Closed" and labels them provisional.

Unit tests (T0, `counts.spec.ts`): the confidence rule (§6.2); `laneOpenCount("RMM")` ignores a CR with every impact "Yes"; an untriaged CR of the same `Case_Code`/`Cycle_No` counts for `openCrCount`; a blank `Criteria_Open_Num` on an applicable row counts 1; Contact update excluded from the lane count only.

**Writing counts:**
- Counts are written **only** by an explicit "Refresh counts" button (`refreshCaseCounts`).
- At a lane step: `<D>_Open_Count` (+ `<D>_RMES_Gaps` for SAF/REG).
- At S5, S7 and S8 only: `Open_Items_Count`, `Open_CR_Count`.
- **Never at S2 or S3:** the fields are ReadOnly there, and the client guard throws (D23).
- **`confidence: "complete"`** → write the values (`writeVerified`), then read the server gate.
- **`confidence: "partial"` at a lane step, S5 or S8** → the **counts policy** decides (WB-D1 [provisional], §7.11):
  - `fail-closed` (default): nothing is written. The panel lists exactly what could not be read (`unread[]`: flow, rung, reason, and the visible items) and the submit stays blocked. At S5/S8 the spec's override (`Hold_Override_Reason_*` + an F8 override row) is still offered.
  - `attest`: an **Attest and write** button. The user types an attestation (required, at least 20 characters). `writeAudit("count.attested")` with the read summary is written **first** and must be verified; only then are the visible counts written. If the F8 row is not verified, nothing is written.
- **`confidence: "partial"` at S7** → the policy does not apply: `Open_Items_Count` and `Open_CR_Count` are **cleared** (`CLEAR` through `writeVerified`) before the submit. `Hold_For_Open_Items` returns "Yes" on blank (`spec:data_model.flows.CIQ_Case_A00.fields[Hold_For_Open_Items].formula`), so `CASE_S8` runs (`spec:workflow.processes.CIQ_Case_A00.steps[8].condition`) instead of the case completing on stale S5 values (`spec:coherence.risks[R-02]`). The panel says "Counts could not be confirmed with your access; they were cleared, so the close check will run."

**Gate checks** read the **server** formula after the save: `Start_Gate`, `<D>_Gate`, `Open_Items_Gate_Release`, `Open_Items_Gate_Close` (`gateFieldsAt`). A client mirror of each formula only explains which part is missing. Formulas compute server-side ([verified] `SPIKES:L75`, `L105`). `SPIKES:L75` proves that `ISBLANK` is true for a blank Number (the spike's `Hold_Flag`); its `Gate = "OK"` on blank came from the **spike's own** formula. v4's gates return **`""`** on a blank count (`spec:data_model.flows.CIQ_Case_A00.fields[SAF_Gate].formula`), and the tests assert v4's result.

### 7.10 Case Admin lane repair (`adminRepair.ts`; the only admin-route write, WB-16)

**Problem.** D35 relies on the S5 check to catch lane values lost after a lane submit (`dec:L482`). But the lane fields are ReadOnly at `CASE_S5` (`spec:security.field_permissions.CIQ_Case_A00.CASE_S5`), non-admin reviewers can't re-read after submit (§6.2), and a native submit skips the check (`SPIKES:L144`). Without a repair, S5 would dead-end.

**Repair** [provisional, WB-D4; an exception to "Case Admin only rejects; it writes no fields", `brd:L835`]:
- Offered on the S5/S8 panel and in the case's "Departments & lanes" tab, only when: `isCaseAdmin`; rung 1 (`hasFlowAdmin(CIQ_Case_A00)`); the case is past the join (at S5, S6, S7 or S8); lane D is active and reads incomplete; and an F8 `lane.completed` row exists for this case, cycle and D.
- It shows the newest snapshot next to the current values and asks for a reason.
- **Writes**, in order: (1) `writeAudit("lane.repaired")` with old and new values and the reason (verified, else stop); (2) `updateAdminItem` with **only** the snapshot's fields that are in `ADMIN_WRITE_ALLOW["lane.repair"]` for D (the lane fields minus counts); (3) read back with `getAdminItem` and compare (write-then-verify, up to 3 re-applies, through the item's queue).
- Never offered for any other field, flow or purpose, and never as a K-WB workaround.

**Guards:** `updateAdminItem` may be referenced only in `kf/sdk.ts` (declaration) and `data/adminRepair.ts` (static guard, §10.2); `adminRepair.spec.ts` asserts that a field outside the allow-list throws before anything is sent; the harness refuses `UPDATE_ADMIN_ITEM` from users without flow Admin and fails every scenario that sends one, except S39.

### 7.11 Feature flags (`domain/flags.ts`, WB-17)

| Flag | Values (default first) | Where it is read | Effect |
|---|---|---|---|
| `countsPolicy` | `"fail-closed"` \| `"attest"` | the Settings payload of the case's **pinned release** (§4.6); absent or unreadable → `"fail-closed"` | §7.9; also the approver's later-decision check (§8.12). [provisional, WB-D1] |
| `additionalPartRaise` | `false` \| `true` (code constant) | `RaisePointDialog` | `false`: "Additional part" is not offered to anyone. `true`: offered **to RMM only** (path in §8.9). Reviewers never get it: they have V on `CIQ_Section_A00` (`spec:security.roles.ciq_safety_reviewer.flows.CIQ_Section_A00`). [provisional, WB-D3] |
| `scopeExtendedOutcome` | `false` \| `true` (code constant) | the CHRQ_S1 Triage select | `false`: "Accepted – scope extended" is not offered (BR-053's run, sections and points are a stretch). [provisional, WB-D3] |

Each flag is read through one pure function that takes the flag value as a parameter (`opKindOptions(roles, flags)`, `crOutcomeOptions(flags)`, `partialCountAction(step, flags)`), and `flags.spec.ts` tests both states. Flags never come from the URL, `sessionStorage` or the host.

## 8. Screens

**Every screen has three states:**
- **Loading:** a skeleton.
- **Error:** a banner with **Try again**. The last good data stays.
- **Warnings:** a list (partial reads, a degraded read route).

**Test ids** follow `data-testid="wb-…"`. T4 writes scenarios against the ids listed here.

### 8.1 RMM: My work `#/my-work` (T1)

**Reads:**
- `useTasks()`: every task the user **holds** at `CASE_S1`, `S2`, `S3`, `S5`, `S7`, `S8`, `CASE_B_RMM`, `OPNT_S1`, `OPNT_R_RMM`, `CHRQ_S1`. Possession, not role, decides (ground rule 13): an `OPNT_S1` task appears here only if this user holds it (after K-FA, the point's `Responsible_User`).
- Case drafts: `getMyItems({status:"draft"})` on `CIQ_Case_A00`, for an interrupted create.

**Layout:**
- **"Record supplier steps (manual)"**: S1, S3, S7, OPNT_S1.
- **"Decide and check"**: S2, S5, S8, B_RMM, OPNT_R_RMM, CHRQ_S1.
- **"Drafts"**: Continue (`TaskRouter` to the S0 panel) or Discard (`discardItem` of that draft, with confirmation; discarding one's own draft is allowed, ground rule 9).
- **Each row:** `Case_Code`·`Cycle_No`, `Trade_Name`, `Supplier_Legal_Name`, the step name, and the due date. The due field depends on the step: S1 `Supplier_Due_Date`, S3 `Completeness_Due_Date`, S7 `Final_Release_Due_Date`; **`OPNT_S1` → the point's `Supplier_Due_Date`** (its SLA kind is "Supplier due date", `spec:workflow.processes.CIQ_Open_Point_A00.steps[1].sla.kind`); `OPNT_R_*` → `Internal_Due_Date`.
- **Tiles**, shown only on rung 1 (they need every item's status, §6.2):
  - "Stray rejected points/CRs" (`brd:L937`);
  - "Ended without cancellation event" (`brd:L845`).

**Empty state:** "No CIQ tasks for you right now."

**Test ids:** `wb-mywork`, `wb-mywork-row-<instanceId>-<act>`, `wb-mywork-empty`, `wb-mywork-draft-<id>`.

### 8.2 Cases list `#/cases` (T1; every role with View on Case)

**Reads:** `useCaseList()` (the ladder plus the F8 index).

**Columns:**
- `Case_Code`·`Cycle_No`, `Trade_Name`, `Main_INCI`, `BDF_Material_No`, `Supplier_Legal_Name`;
- `Owner_RMM`;
- status and step (on rung 1 the step comes from the per-item `getAdminItem` reads, §6.2; until they arrive the cell shows "…");
- lane chips (`Dept_<D>_Active`, `<D>_Review_Confirm`);
- `Supplier_Due_Date`.

**Search:** client-side over Case_Code, Trade_Name, Main_INCI, BDF_Material_No, SAP_Material_No, Supplier_Code and Supplier_Legal_Name.

**Filters:** status (In progress / Completed / Cancelled), step, supplier, owner, active department. Test cases (`Case_Test` = "Yes") are hidden by default.

**"+ New case"** only for `canInitiate(CIQ_Case_A00)`.

**`ReadQualityBanner`** when the rung is not admin.

**Empty states:** "No cases yet", or "No cases you can read". The second links to Diagnostics.

**Test ids:** `wb-cases`, `wb-cases-search`, `wb-cases-row-<id>`, `wb-cases-new`, `wb-readquality`.

### 8.3 New case `#/cases/new` (T1, RMM; `createCase.ts`)

**Reads:**
- F1 suppliers with `Supplier_Active` = "Yes", and their Contacts.
- From F2, the pinned release: `Config_Kind` = "Release", `Config_State` = "Published", `Release_Stage` "Live" (or "Test" when `Case_Test` = Yes), newest `Published_At`.
- Settings.

**Inputs:**
- Supplier.
- Contacts: checkboxes over active Contacts. At least one must have `Contacts_Can_Confirm` = Yes and a `Contacts_Portal_User_Id`. A contact without one gets a warning: "not invited to the portal yet". (`Contacts_Portal_User_Id` is typed by RMM on the supplier record as given by Thomas, §4.6, §8.14.)
- `Trade_Name`, `Main_INCI`, `BDF_Material_No` (required); `SAP_Material_No`, `IRMA_Ref`, `Case_Title`, `Target_Markets_Text`, `Markets_Label` (optional).
- `Supplier_Due_Date`: today + `defaultSupplierDueDays`.
- `Overall_Approval_Required` Yes/No, defaulting from Settings, else "No".
- `Case_Test`.

**Defaults:**
- `Owner_RMM` = me. No user picker: there is no user-search API.
- `BDF_Contact_Name` / `BDF_Contact_Email` = me.

**Derived** (BR-025, BR-026):
- `Supplier_Code`, `Supplier_Legal_Name`;
- `Portal_Contact_Ids`, `Confirm_Contact_Ids`, `Supplier_Contact_Emails`, `Case_Contacts_JSON`;
- `Release_Item_Id`, `Release_Key`, `Manifest_Hash`, `Release_Manifest_JSON`;
- `Cycle_No` = 1, `Template_Label`.
- **After the create** (`POST_CREATE_KEYS`): `Case_Code`, `Request_Key`.

**Sequence** (`brd:L781`; plan L112), all inside `createProcessItem` (§7.6):
1. Check `mandatoryAt(CASE_S0)` minus `Case_Code` and `Request_Key` client-side before any create. Problems are listed; nothing is created.
2. `createItem` gives the `_id`; the full create payload is read back and compared, and anything dropped is re-applied at Start.
3. In the same create, before the submit, write `Case_Code` = `CIQ-<yyyy>-<_id>` and `Request_Key` = `<Case_Code>-C1-REQ` by `writeVerified` at Start.
4. The **full** S0 Mandatory check (now with both keys), then submit.
5. **Only then**, `createFormRow(CIQ_Section_A00, BASIC)` with:
   - `Section_Item_Key`, `Section_Key` = "BASIC", `Section_Code`, `Section_Title`, `Section_Sort`;
   - `Section_Origin` = "Template";
   - `Definition_JSON` and `Definition_Hash`, from the pinned release's Section definition;
   - `Case_*`, `Supplier_Code`, `Supplier_Due_Date`, `Portal_Contact_Ids`.
6. `writeAudit(Item created)`.
7. Navigate to the case.

**Recovery:** if step 5 or 6 fails, the case exists. The case detail shows a **"Finish setup"** card (RMM only), which retries the missing rows idempotently by key.

**Reactivate** (`brd:L857`; TK15): from a cancelled case. Same form, prefilled, with the same `Case_Code`, `Cycle_No` + 1 and `Reactivates_Case_Item` = the old `_id`. It is allowed within Settings `reactivationDays` of the Cancellation event. The prefill from snapshots is deferred.

**Test ids:** `wb-newcase`, `wb-newcase-supplier`, `wb-newcase-contact-<id>`, `wb-newcase-submit`, `wb-newcase-errors`.

### 8.4 Case detail `#/cases/:caseId?tab=&task=` (T1; read-only for roles without a task)

**Header:**
- `Case_Code`·`Cycle_No`, `Trade_Name`, `Main_INCI`, `BDF_Material_No` / `SAP_Material_No`;
- `Supplier_Legal_Name` (`Supplier_Code`), `Owner_RMM`;
- the release pin (`Release_Key`, a short `Manifest_Hash`);
- status.

**Stepper** in v4 order: S0 → S1 → S2 → S3 → Part 2 → S5 → S6 (only if `Overall_Approval_Required` = "Yes") → S7 → S8 → End. S6 comes **before** S7 (`spec:workflow.processes.CIQ_Case_A00.steps[6..7]`).

**Hand-off note** (`ManualRecordNote`): "Supplier hand-offs are not connected yet. RMM records supplier steps by hand."

**Tabs:**

| Tab | Content | Owner |
|---|---|---|
| Overview | Facts; confirmations (`Completeness_*`, `Final_Release_*`, read-only once filled); due dates; **the step panel for my task on this case** (§8.5) | T1 |
| Departments & lanes | 6 rows of LaneVM: active, confirmed, by, at, on behalf, open count, RMES gaps and decision (SAF/REG, with the effective decision of §8.12), gate, plus the open lane task when visible; the newest `lane.completed` snapshot per lane; **Repair lane** for Case Admin (§7.10) | T1 |
| Sections | F3 rows of the case (`Section_Key/_Code/_Title`, `Applicability_Label`, `Lead_Dept`, `Co_Review_Depts`, `Section_Origin`, `Added_Later`, `Supplier_Due_Date`); F4 runs (`Run_No`, `Scope_Trigger`, `Run_By`, `Run_At`, `Added_Section_Keys`); N.A. sections from `Result_JSON` | T1 |
| Open points | `PointList` (T2) + "Raise open point" (`RaisePointDialog`, T2), if `canInitiate(OP)` | T1 shell |
| Change requests | CRs of the case (T1 `features/cr`) | T1 |
| Notes | `NotesPanel` (T3) | T1 shell |
| Audit | `AuditTimeline` (T3) over F8 rows for `Case_Item_Id` | T1 shell |

**Actions:**
- Cancel case (§7.7), where allowed (a held task at a step with reject on).
- Reactivate (for a cancelled case; RMM or Case Admin).
- Finish setup (§8.3).
- Repair lane (§7.10; Case Admin on rung 1 only).

**Test ids:** `wb-case`, `wb-case-tab-<name>`, `wb-case-stepper`, `wb-case-cancel`, `wb-case-reactivate`, `wb-case-lane-<D>`.

### 8.5 Case step panels (T1; built on `StepForm`, gates via `submitStep`)

**`StepForm`** (T0) renders **inputs** only for `mandatoryAt(step)` and `editableAt(step)` (writable fields; **never a computed field**), using `FieldInput` by type and list. Each panel's optional set is built from `editableAt(step)` minus the fields the panel sets itself, so no ReadOnly field can reach the local guard. **Gate fields** (`gateFieldsAt(step)`) are shown **read-only**: the server value plus the client mirror's explanation ("Open items gate (release): blank, because Open CR count is blank"). The same holds in `KwbFallback`. The actions are enabled only for a held task (ground rule 13). `StepForm` is a pure `stepFormModel(step, values)` (inputs, read-only gates, labels) plus a thin render. A unit test (T0, `StepForm.spec.tsx`) checks `stepFormModel` for **every** step (no input for any computed field; every gate read-only) and renders one step with `react-dom/server` (no jsdom is installed).

| Step | Panel | Writes (ids) | Before submit |
|---|---|---|---|
| CASE_S1 | **"Supplier sent the basic data (manual record)"** (Y1 fallback) | `Basic_Data_Received` = "Yes"; contact edits (`editableAt(CASE_S1)`). `Portal_Request_Item_Id` left blank | Mandatory S1 |
| CASE_S2 | **Scope check** (WB-12). (1) Load the pinned config: sections from Template + Section definitions, ownership, Text bundle, Settings; check content hashes. (2) A table per section: applicability Mandatory/Optional/N.A., with a justification when it deviates from the default; lead department. (3) Department flags, computed from the leads of non-N.A. sections; RMM from `deptReviewMode`; editable with a reason. (4) Completeness and final-release texts and due dates (manual text allowed, with key `MANUAL-<date>`). | (5) "Save scope": `createFormRow` F4 run (`Run_Key`, `Run_No`, `Scope_Trigger` "Initial", `Rule_Set_Version`, `Evaluator_Version` "manual-wb-1", `Input_JSON/_Hash`, `Result_JSON` with N.A., `Added_Section_Keys`, `Lead_Departments`, `Run_By/_At`), then F3 rows one at a time, only those missing; then `saveAtStep` with the S2 Mandatory set (`Confirm_Contact_Ids`, `Supplier_Contact_Emails`, `Rule_Set_Version`, `Dept_*_Active`, `Initial_Scope_Run_Key`, `Completeness_*` 4, `RMES_Key`, `Final_Release_*` 3, `Supplier_Closing_Text`). **`Rule_Set_Version`** (case and F4) = the pinned release's "Rule set" entry `<configKey>@<Version_Label>`, else `none (manual-wb-1)` (§4.6, WB-D10) | the F4/F3 rows exist (by key) + Mandatory S2. The BASIC answers check needs K-14 and is shown as "not checked" |
| CASE_S3 | **"Supplier confirmed completeness (manual record)"** (Y4 fallback) | A required **"Supplier confirmed at"** DateTime input (prefilled with now, editable, written without ms), labelled "manual record: when the supplier confirmed, not when you type it". Its value goes to **both** `Completeness_At` and `RMES_Created_At`, as Y4 would copy `Confirmed_At` into both (`brd:L1302`, `L752-L753`). Optional `Completeness_Confirm/_By_Name/_By_Email/_By_Role` as received; department flags may still change (Editable at S3) | Mandatory S3; the harness checks the written value equals the input |
| CASE_S5 | **Open items check – before release request** | "Refresh counts" → `Open_Items_Count`, `Open_CR_Count` (§7.9: complete → write; partial → counts policy). Override: `Hold_Override_Reason_Release` + F8 override row. `Hold_Note` (Mandatory). Optional, exactly `editableAt(CASE_S5)`: `Target_Markets_Text`, `Origin_Types`, `Markets_Label`, the 4 contact fields, `Final_Release_Due_Date`, `Late_Completions_Text`, `Supplier_Closing_Text`. **Lane recovery**, per incomplete active lane D: **Raise department review for D** (`createPoint`: `OP_Kind` "Department review", `OP_Dept` D, `Raised_By_Dept` "RMM", `OP_To_Supplier` "No", a prefilled question, `Responsible_User` = me); **Record late completion** once that point is Accepted (appends `D · <Reviewed_By name> · <Reviewed_By_Email> · <Reviewed_At> · <OP_Key>` to `Late_Completions_Text`, `brd:L930`); **Repair lane** for Case Admin (§7.10) | server gate `Open_Items_Gate_Release` = "OK" + `Hold_Note` + **the lane check**: every active lane D passes when **either** (a) `<D>_Review_Confirm` = "Confirmed" and `<D>_Completed_At` is set (D35), **or** (b) an Accepted "Department review" point with `OP_Dept` = D exists for the case **and** its `OP_Key` appears in `Late_Completions_Text` (`brd:L930`) |
| CASE_S7 | **"Supplier released (manual record)"** (Y5 fallback) | "Refresh counts" first (D27/D30): complete → write; **partial → CLEAR both counts** (§7.9) so S8 runs. `Completion_Trigger` = "Manual by RMM: <reason>". A required **"Supplier released at"** DateTime input (prefilled with now, editable, no ms, labelled "manual record") → `Final_Release_At`. Optional, exactly: `Final_Release_Confirm`, `Final_Release_By_Name`, `Final_Release_By_Email`, `Final_Release_By_Role`, `Released_Revs_JSON`, `Evidence_List_Text`, the 4 contact fields | Mandatory S7 + `Final_Release_At` (client rule). Never shows "PDF generated" or "e-mailed" (Z1 off) |
| CASE_S8 | **Open items check – before close** | Same mechanics as S5 with its **own** set, exactly `editableAt(CASE_S8)`: `Open_Items_Count`, `Open_CR_Count`, `Hold_Override_Reason_Close`, `Late_Completions_Text`, `Supplier_Closing_Text`, `Target_Markets_Text`, `Markets_Label`, the 4 contact fields (no `Final_Release_Due_Date`, no `Origin_Types`). `Hold_Note` (Mandatory) | server gate `Open_Items_Gate_Close` = "OK" + `Hold_Note` |
| CASE_B_RMM | → the T2 lane workspace with D = RMM | | |

**Unit tests (T1):** the S5 lane check passes with (a), passes with (b), fails with an Accepted Department-review point whose `OP_Key` is not in `Late_Completions_Text`; the S7 panel clears both counts on a partial refresh and writes them on a complete one; S3 writes the input value to both fields.

**Test ids:** `wb-step-<IRSTEP>`, `wb-step-submit`, `wb-step-problems`, `wb-counts-refresh`, `wb-counts-unread`, `wb-counts-attest`, `wb-override`, `wb-manual-note`, `wb-s3-confirmed-at`, `wb-s7-released-at`, `wb-s5-raise-deptreview-<D>`, `wb-s5-late-completion-<D>`, `wb-lane-repair-<D>`.

### 8.6 Change requests `#/change-requests`, `#/change-requests/:crId?task=` (T1)

**List:** `CR_Key`, `Case_Code`, `Change_Kind`, `Section_Key`/`Field_Key`, status and step, `CR_Outcome`, impact chips.

**Which case a CR belongs to:** `crBelongsTo` (§6.4): `Case_Item_Id`, or `Case_Code` + `Cycle_No` while `Case_Item_Id` is blank. The case's "Change requests" tab, the list's case column and the counts all use it.

**Triage at `CHRQ_S1`** (held task only):
- Link to a case: `Case_Code`, `Cycle_No`, `Supplier_Code`, and **`Case_Item_Id`, which Triage sets** (Mandatory at `CHRQ_S1`; TK10). A case picker if they are blank; with `Case_Code` + `Cycle_No` set, the matching case is preselected.
- `Contact_Verified`, `CR_Outcome`, `Impact_REG/SAF/QM/MIC/SUS` (from `CR_DEPT_FIELDS`), `Notice_Key` (generated), `Notice_Kind`, `Notice_Title`, `Supplier_Outcome_Text`, `Portal_Contact_Ids` (from the case), `Triage_Note`, `Scope_Run_Key`.
- These fill every X6 input (Mandatory; COH-07).
- **`CR_Outcome` options** come from `crOutcomeOptions(flags)`: "Accepted", "Refused – after final release", "Refused – not valid"; **"Accepted – scope extended" only when `scopeExtendedOutcome` is on** (§7.11, off for the MVP). Unit test (T1): the options exclude it while the flag is off and include it when on.

**After final release** (BR-052), a case counts as **released** when **any** of these holds: `Final_Release_At` is set; its current step is `CASE_S8`; or it is Completed and `Overall_Decision` ≠ "Rejected" (it went through S7). Then:
- the outcome is forced to "Refused – after final release";
- every impact is "No";
- an F8 "Change attempt" row is written.

**"Accepted – scope extended"** (BR-053) is a **stretch goal behind `scopeExtendedOutcome`**. When it is built:
- an F4 run (`Scope_Trigger` "Change notice", `Related_Key` = `CR_Key`);
- F3 rows;
- one "Department review" OP per new section's lead department, through T2's `createPoint`.
Until then the outcome cannot be chosen, so no CR can record side effects that never happened.

**Manual CR (Y6 fallback)** `#/change-requests/new?case=`: the `CHRQ_S0` fields. `Portal_CR_Item_Id` and `Raised_By_Portal_User` stay blank; the page is labelled "manual record". There is no Mandatory field at S0, so the client requires `Case_Code`, `Change_Kind` and `Change_Reason`.

**Test ids:** `wb-crs`, `wb-cr-triage`, `wb-cr-new`.

### 8.7 Reviewer queue `#/review` (T2)

**Reads:** `useTasks()`: every held task at `CASE_B_<D>`, `OPNT_R_<D>` and `CHRQ_B_<D>` for D in `reviewerDepts` (`spec:experience.intended_workbench_landings.ciq_*_reviewer`), **plus every held task at `OPNT_S1`** whatever the user's roles (ground rule 13).

**Tabs:**
- **Case reviews.** Each row shows the case header and the lane's open count.
- **Open points.** Each row shows `OP_Key`, `Round_No`, `OP_Kind`, `Ref_Label`, response yes/no, and `Internal_Due_Date`.
- **Record supplier response (manual).** The `OPNT_S1` tasks the user holds (a supplier point they raised, assigned to them from `Responsible_User` after K-FA). Each row shows `OP_Key`, the case, `Question_Text` and the point's `Supplier_Due_Date`, and opens the S1 panel (§8.9). Shown only when non-empty.
- **Change requests.** Each row shows `CR_Key`, `Change_Kind` and the case.
- **Waiting on supplier.** Points raised by my department at `OPNT_S1` that I don't hold, shown only on rung 1 (it needs every point's step).

SAF/REG users also get an RMES link.

**Test ids:** `wb-review`, `wb-review-tab-<t>`, `wb-review-row-<instanceId>-<act>`.

### 8.8 Lane workspace `#/review/lane/:caseId/:act` (T2; also B_RMM)

**Left column: sections D leads.**
- F3 rows with `Lead_Dept` = D, or `Co_Review_Depts` containing D, or `Query_Owner_Dept` = D.
- Shows the definition fields (from `Definition_JSON`), Components rows (K2.1) and `Search_INCI`/`Search_CAS`.
- Supplier answers live in the portal and are **not readable yet** (K-14; `brd:L1002-L1003`). The panel says so.
- Actions per section: "Raise open point" (prefilled ref) and "Mark reviewed" (an F8 Section review row).

**Middle column: blockers and the gate checklist** (`brd:L809-L817`).
- (1) Open points for D, as a list.
- (2) CR assessments for D still pending (none for D = RMM: there is no RMM CR assessment).
- (3) SAF/REG: the RMES sheet exists; open criteria; blocking findings; a decision; a reason if Rejected.
- (4) **Section review marks** [provisional, WB-D5]: every section that D **leads** (`Lead_Dept` = D, not N.A.) needs at least one F8 "Section review" row (`Action_Code` `section.reviewed`, `Object_Key` = its `Section_Item_Key`) for this case and cycle. This is a client blocker. Only the *staleness* part of `brd:L817` (`Source_Answers_Rev` against the section's current answers revision) is dropped, because portal answers are unreadable (K-14); the screen labels it "staleness not checked". "Mark reviewed" clears the blocker. If the F8 list can't be read completely, the blocker shows "could not check" and is handled like a partial count (WB-D1). If Thomas prefers marks to stay informational, the flag is one line in `gates.ts`.
- Server values: `<D>_Open_Count`, `<D>_RMES_Gaps`, `<D>_Gate` (computed: read-only).
- **"Refresh counts"** writes the counts when they are complete (§7.9). When they are partial (always so for a reviewer on rung 3), the column lists **exactly what could not be read** (`wb-counts-unread`), and the next step depends on the counts policy: `fail-closed` → "Complete review" stays disabled, with "Ask a Case Admin to check, or ask Thomas to switch the counts policy"; `attest` → **Attest and write** (§7.9).

**Right column: sign-off.**
- `<D>_Review_Confirm` = "Confirmed" (a checkbox).
- `<D>_On_Behalf_Of`, with an F8 Delegation row if filled.
- SAF/REG: `<D>_RMES_Decision` (Approved/Rejected) and `<D>_RMES_Decision_Reason` (required by the client if Rejected).
- `<D>_Completed_By` = me, `_Email` = me, `_At` = now: set on "Save sign-off".
- **"Complete review"** runs `submitStep`, with `laneFields` = `LANE_FIELDS[D]` and `extraChecks` = the blockers being empty (§7.3). After the submit, `submitStep` writes the F8 `lane.completed` snapshot (§7.3 step 6). For a rung-3 reviewer the post-submit comparison shows the "could not read with your access" note (§6.2).

**Also on the screen:** `NotesPanel` (T3) for the case.

**Test ids:** `wb-lane`, `wb-lane-blockers`, `wb-lane-gate`, `wb-lane-signoff`, `wb-lane-complete`, `wb-section-<key>-raise`, `wb-section-<key>-reviewed`.

### 8.9 Open points (T2): `PointList`, `RaisePointDialog`, point detail `#/points/:pointId?task=`

**`RaisePointDialog`** (BR-046; `Start_Gate` formula `spec:data_model.flows.CIQ_Open_Point_A00.fields[Start_Gate]`).

Inputs:
- `OP_Kind`, from `opKindOptions(roles, flags)` (§7.11): Query, Document request, Internal review, Department review, Contact update. **"Additional part" is never offered to reviewers** (they can't write `CIQ_Section_A00`, cell V) and is offered to RMM only when `additionalPartRaise` is on (off for the MVP). Unit test (T2): reviewers never get it; RMM gets it only with the flag on;
- `OP_Dept`, preset from the raiser's department (RR-3; RMM → "RMM"); `Raised_By_Dept` = the raiser's department;
- `OP_To_Supplier`: default Yes for Query and Document request (and Additional part, when enabled); No for Internal review and Department review; the user picks for Contact update;
- the reference: `Ref_Kind`, `Ref_Section_Key`, `Ref_Field_Key`, `Ref_Row_Id`, `Ref_Doc_*`, `Ref_Label`;
- `Question_Text`;
- `Supplier_Justification` (required when the point goes to the supplier);
- `Internal_Justification`;
- `Responsible_User` = me, plus `Responsible_Name` and `Responsible_Dept_Label`. The dialog says: "You will hold the 'Waiting for supplier' task and record the supplier's answer by hand" (K-FA assigns `OPNT_S1` from this field; WB-D2 [provisional]);
- `Internal_Due_Date`; `Supplier_Due_Date` (to supplier);
- `Kind_Label`;
- `Portal_Contact_Ids` (from the case).

Generated: `OP_Key`, `Round_No` = 1, `Query_Key` = `OP_Key|R1`, `Awaiting_Response` = "Yes" (to supplier), `Thread_Text` initialised, and the case keys. `Start_Gate` is computed: never an input.

Sequence: `createProcessItem` → read back the server `Start_Gate` → if it is not "OK", list what is missing (client mirror) and do not submit → submit. The point routes to S1 (to supplier) or to `R_<OP_Dept>`.

**When `additionalPartRaise` is on (stretch, RMM only):** before the point's submit, in the create lane, create the F4 run (`Scope_Trigger` "Additional part", `Related_Key` = `OP_Key`) and the F3 row (`Section_Origin` "Additional", `Added_Later` "Yes", `Created_By_Key` = `OP_Key`), then write `New_Section_Item_Key` at Start (Editable at `OPNT_S0`). `spec:architecture.journey_flow_map[j07_open_point_supplier].path[1..2]`.

**Point detail.** Shows the header, the question and justifications, the current response, the `Rounds` history and `Thread_Text`. **Every action needs the held task for this point at that step** (ground rule 13); otherwise the detail is read-only.

Actions by step:
- **`OPNT_R_<D>`** (whoever holds the task; normally the owning department):
  - **When `OP_Outcome` is blank:**
    - **Accept:** append a Rounds row (Accepted), set `OP_Outcome` = "Accepted", `Reviewed_By` = me, `Reviewed_By_Email`, `Reviewed_At` = now, `Accepted_Doc_File_Name/_Uploaded_At` (picked from `Response_Doc_Refs_JSON`), and `On_Behalf_Of`, then submit.
    - **Withdraw:** `Outcome_Reason` required; a Rounds row (Withdrawn), `OP_Outcome` = "Withdrawn", **and `Reviewed_By` = me, `Reviewed_By_Email`, `Reviewed_At` = now** (all three are Mandatory at every `OPNT_R_*`, `spec:security.field_permissions.CIQ_Open_Point_A00.OPNT_R_REG`), then submit. This is a business outcome, never the native withdraw (COH-17).
    - **Return** (§7.5).
    - **Mark in progress:** `OP_Progress`.
    - R_REG/R_SAF: `Late_Decision(_Reason)`, shown only when that case lane is already completed (Editable only at `OPNT_R_REG`/`_SAF`).
  - **When `OP_Outcome` is already "Withdrawn"** (withdrawn at `OPNT_S1`): only **Confirm withdrawal**: `Reviewed_By/_Email/_At`, a Rounds row (Withdrawn, `Rounds_Reason` = `Outcome_Reason`), then submit. Accept and Return are hidden.
- **`OPNT_S1`** (whoever holds the task: RMM, or after K-FA the raiser, e.g. a reviewer; WB-14):
  - **"Supplier responded (manual record)"** (Y3 fallback): `Response_Kind` from {Answer, Document, Additional part completed, Cannot provide} (`brd:L465`; Mandatory), `Response_Text`, `Response_Doc_Refs_JSON` (file names as given), `Supplier_Responsible_Email`, `Awaiting_Response` = "No". `Portal_Query_Item_Id` stays blank.
  - **Withdraw point:** `Response_Kind` = "Withdrawn by Beiersdorf", `OP_Outcome` = "Withdrawn", `Outcome_Reason` (`brd:L915`; `spec:workflow.meta.security_handoff.items[15].note`). The point still routes to `R_<OP_Dept>` (the R steps' conditions test only `OP_Dept`, `spec:workflow.processes.CIQ_Open_Point_A00.steps[2..7].condition`), where the owner confirms it; the panel says so.

**Unit tests (T2):** the Accept, Withdraw and Confirm-withdrawal builders each set `Reviewed_By/_Email/_At` and one Rounds row; Confirm withdrawal is the only action when `OP_Outcome` = "Withdrawn"; the OPNT_S1 panel is enabled for a non-RMM user who holds the task and disabled for an RMM user who doesn't.

**Test ids:** `wb-points`, `wb-point-raise`, `wb-point-startgate`, `wb-point-accept`, `wb-point-withdraw`, `wb-point-confirm-withdrawal`, `wb-point-return`, `wb-point-manual-response`, `wb-point-rounds`.

### 8.10 CR assessment `#/assess/:crId/:act` (T2)

**Shows** the CR: `Change_Kind`, `Section_Key`, `Field_Key`, `Current_Value_Text`, `Proposed_Value_JSON`, `Change_Reason`, `CR_Outcome` and `Triage_Note`.

**Inputs** (held task only; ids from `CR_DEPT_FIELDS[D]`): `<D>_Assessment` (`CIQ_Impact_Resolution`), `<D>_Assess_Note`. `<D>_Assessed_By/_At` are set automatically. "Finding raised" offers a raise-point link.

**Then:** submit.

**Test ids:** `wb-assess`, `wb-assess-submit`.

### 8.11 RMES sheet `#/rmes/:caseId` (T2; editor role only, ground rule 7)

**Access:** the editing route guard allows only `rmesEditorOf` (Safety → F5, Regulatory → F6). Other roles get "Not available for your role" and **no read is issued on this route**. The Overall Approver's read-only summary is a separate component on the approval screen (§8.12); no other role gets an RMES link.

**Reads:** F5/F6 rows with `Case_Item_Id` = the case and `RMES_Voided` ≠ "Yes". RMES criteria come from the pinned release.

**Create** (BR-063): the first editor session after PS-05 (`Completeness_At` set) creates the row:
- `RMES_Key` = case `RMES_Key` + "-SAF" or "-REG";
- `Result_Case` = `{_id}` (Reference, [unverified]);
- the case keys;
- Criteria rows seeded from the criteria payload for that department.

If duplicates exist, the oldest `_created_at` is kept and the others are set `RMES_Voided` = "Yes".

**Soft lock:**
- On opening for edit, write `Editing_By` = "Name (email)" and `Editing_Since` = now.
- If someone else holds it for less than 30 minutes, the sheet opens read-only with **Take over**.
- The lock is released on leave (best effort).
- It is advisory only: there is no server locking ([verified] `SPIKES:L154`).

**Criteria grid** by Part A–D:
- `Criteria_Applicable` (with `Criteria_Override_Reason` when No);
- `Criteria_Result`;
- `Criteria_Comment`, required by the client when the result is not Available, Plausible or Listed (mirrors the `Criteria_Open_Num` formula);
- limit fields;
- `Criteria_Impact_Resolution`;
- `Criteria_Recorded_By/_At`, set automatically;
- the AI fields, shown read-only (no AI in the MVP).

**Findings:** add or modify (`Findings_Text`, `Findings_Criterion_Code`, `Findings_Blocking`, `Findings_State`, `Findings_Linked_OP_Key`). "Raise point from finding" sets `Ref_Internal_Key`.

**Save, in two phases** (the header counts depend on server-computed child formulas, so they can't go in the same write):
1. `updateFormRow` with `Table::` operations for dirty criteria and findings rows only; verified by row `_id` or natural key (§7.2). Two writers lost rows 5/5 ([verified] `SPIKES:L156`).
2. Read the row back, compute `Open_Criteria_Count` from the **read-back** `Criteria_Open_Num` values (a blank on an applicable row counts 1, §7.9) and `Open_Blocking_Findings_Count`, then `updateFormRow` with the two header fields and verify.

If phase 2 fails, the sheet shows "rows saved; header counts not updated" and the lane's RMES gaps can't be refreshed until it succeeds. Unit test (T2): a read-back with `Criteria_Open_Num` blank on an applicable row gives a count of at least 1; harness `childFormula=off` (S43).

**The decision lives on the case lane.** A link leads to the lane workspace.

**Test ids:** `wb-rmes`, `wb-rmes-create`, `wb-rmes-lock`, `wb-rmes-criterion-<code>`, `wb-rmes-finding-add`, `wb-rmes-save`.

### 8.12 Overall approver `#/approvals`, `#/approvals/:caseId/:act` (T3)

**Queue:** tasks at `CASE_S6`. "Upcoming" = cases in Part 2 with `Overall_Approval_Required` = "Yes", when readable.

**Decision screen:**
- Lane summary: every active D, with confirmation, by, at, on behalf, and the SAF/REG decision and reason.
- **RMES summary, read-only** (`RmesSummary`, T2; j10 reads F5 and F6 first, `spec:architecture.journey_flow_map[j10_overall_approval].path[0..1]`; the approver has V on both, and isolation is "by write grant only", `spec:security.data_scope.rule`): per active SAF/REG lane, the non-voided RMES row's header counts, each criterion's result and comment, and the findings with blocking/state. No inputs, no lock written, no link to the editing route. If the Form read fails, the summary says so and is not a blocker by itself.
- **Effective decision per SAF/REG lane** [provisional, WB-D8; `brd:L788`: "with any later Department-review decision taking precedence"]: the `Late_Decision` of the newest Accepted "Department review" point with `OP_Dept` = D for this case (newest by `Reviewed_At`, `Late_Decision` non-blank), if one exists; otherwise `<D>_RMES_Decision`. The summary shows which source won.
- **The later-decision check needs the case's points.** If the OP list for the case is `partial` (§6.2; usual for a non-admin approver), the counts policy applies (WB-D1): `fail-closed` → "Approved" stays disabled with "Later department-review decisions could not be read with your access" and the case's `Late_Completions_Text` shown as a hint; `attest` → the approver may attest (F8 `count.attested`, `Object_Key` = `<Case_Code>:approval`), and the effective decision then falls back to `<D>_RMES_Decision`.
- `Overall_Decision`:
  - **"Approved"** is enabled only when every active SAF/REG lane's **effective decision** is "Approved" (BR-035; `brd:L788`).
  - **"Rejected"** requires `Overall_Reason` (client rule). It also sets a neutral `Supplier_Closing_Text` (prefilled from the Text bundle) and `Completion_Trigger` = "Overall rejection" (Editable at S6).
- `Overall_Decided_By` = me.
- Then `submitStep`.
- Native Reject is off at S6 and is never offered.

**Unit tests (T3):** BR-035 with the effective decision: RMES Approved + a later Accepted Department-review point with `Late_Decision` "Rejected" → Approved disabled; RMES Rejected + a later "Approved" → enabled; a partial OP list under `fail-closed` → disabled.

**Test ids:** `wb-approvals`, `wb-approval-approve`, `wb-approval-reject`, `wb-approval-submit`, `wb-approval-rmes-<D>`, `wb-approval-effective-<D>`.

### 8.13 Business Admin (T3)

**`#/config`:** F2 list. Columns: `Config_Key`, `Config_Kind`, `Version_Label`, `Config_State`, `Section_Key`/`Section_Rev`, `Release_Key`/`Release_Stage`, `Published_At`/`Published_By`. Filters by kind and state.

**`#/config/:itemId`** and **`#/config/new?kind=`:**
- **Draft rows** are editable: `Payload_JSON` in a JSON textarea that validates, pretty-prints and shows a structured preview per kind; `Change_Note`; `Version_Label`; `Internal_Annotations_JSON`.
- **Published rows** are read-only. **"New version"** copies the row into a new Draft (copy-on-write, j15).
- **Publish:** `Config_State` = "Published", `Published_By` = me, `Published_At` = now, `Content_Hash`, then an F8 Configuration row.
- **Retire** [provisional, WB-D6]: an **accepted exception** to BR-057 ("copy-on-write: publishing never edits a row", `spec:domain.business_rules[BR-057]`). Retire is a state-only patch `{ Config_State: "Retired" }` on the Published row (payload, hash and publish fields untouched), preceded by a verified F8 `config.retire` row. No other field of a Published row is ever written; the harness fails on any other update to a Published F2 row (§11.2). The alternative (a new superseding row) would make every loader resolve "newest row per key", so it is not chosen tonight.

**Release builder:** select Published rows, then create a `Config_Kind` = "Release" row with:
- `Release_Key`, `Release_Label`, `Release_Stage`;
- `Release_Manifest_JSON`, `Release_Bundle_JSON`, `Manifest_Hash`;

then publish and write an F8 row. The regression set is shown only.

**No Delete anywhere.**

**`#/templates` (Section templates):** the same editor, filtered to Template and Section definition. The preview shows the field list and the template section order and defaults.

**Test ids:** `wb-config`, `wb-config-row-<id>`, `wb-config-edit`, `wb-config-publish`, `wb-release-new`, `wb-templates`.

### 8.14 Suppliers and contacts `#/suppliers`, `#/suppliers/:itemId`, `#/suppliers/new` (T3)

**List:** `Supplier_Code`, `Supplier_Legal_Name`, `Supplier_Kind`, `Supplier_Country_Code`, `Supplier_Active`, `Supplier_Test`, contact count, `Pending_Invites`.

**Detail:**
- The header is editable only if `canEditForm(CIQ_Supplier_A00)` (RMM). Business Admin and the others read only.
- **Contacts** (BR-055):
  - Add or modify **one row per save**, with re-read and merge, through the `Table::Contacts` operation.
  - Deactivate (`Contacts_Active` = "No") instead of delete.
  - **"Request portal invite"** sets `Contacts_Invite_Requested_At` = now and is labelled "requested, not sent". Thomas handles portal users.
  - **`Contacts_Portal_User_Id`** is a plain text input labelled "manual: as given by portal user management (Thomas)". The Workbench never generates it (§4.6).
  - The mirrors `Contact_Portal_Ids_Text` and `Pending_Invites` are recomputed on save.

**New supplier:** `Supplier_Code` (unique, checked client-side) and `Supplier_Legal_Name`.

**Test ids:** `wb-suppliers`, `wb-supplier-contact-add`, `wb-supplier-readonly`.

### 8.15 Reader and Case Admin (T3, plus the T1 case detail)

**`#/audit`:** F8 list. Filters: case code, category, actor, side, date range. Shown as a table or timeline. Read-only for everyone; the Reader has V (`spec:security.roles.ciq_reader.flows.CIQ_Audit_Event_A00`).

**Case detail** renders read-only when the user holds no task. The Reader may add notes (E on F7, Q7).

**Case Admin:** the cancel-during-review and reactivate actions inside the case detail (§7.7), and the allow-listed **Repair lane** (§7.10). Nothing else is extra; Case Admin never writes case fields otherwise.

**Test ids:** `wb-audit`, `wb-audit-filter-<f>`.

### 8.16 Notes and audit timeline (T3, used by T1 and T2)

**`NotesPanel({caseVM, linked?})`:**
- Lists F7 rows by `Case_Item_Id` (and `Linked_Kind`/`Linked_Key`).
- Add: `Note_Key`, the case keys, `Linked_*`, `Note_Text` (required), `Note_Author` = me, `Note_Dept` (from the role), `Note_At`.
- Only the author may edit (BR-064). There is no delete.

**`AuditTimeline({events, dense?})`.**

**Test ids:** `wb-notes`, `wb-note-add`, `wb-note-edit-<id>`, `wb-audit-timeline`.

## 9. Diagnostics `#/diagnostics` (T0): never writes

Every probe is independent, with a 15 s timeout. **"Copy diagnostics JSON"** copies everything below, with no credentials, and **redacts people by default**: names become `<person#n>` and e-mails `<email#n>` (consistent within one copy), so a paste into project files never brings in real BDF people (ground rule 11). A checkbox "include names and e-mails (never paste into project files)" is off by default and resets on reload. "Copy as read-back JSON" holds ids only.

| Block | Shows |
|---|---|
| Connection | connected in N ms; account `_id`; handshake `appId` against `APP_ID` (red if different); component id; build stamp (`__WORKBENCH_BUILD__`); spec revision and sha; SDK version |
| User | name, email, `_id`; `AppRoles` (id + Name); matched CIQ roles; unmatched names; SEC-HR2 check; builder session (`getRoles` resolves) and its `{roles, currentRoles}`; the lens; capability summary |
| Processes ×3 | per call (`getMyItems`, `getMyTasksItems`, `getAdminItems`, `getParticipatedItems`, which is expected to fail per `UI-LOG:L113`): envelope (`envelopeOf`), rows on page 1, keys on a row, coverage of generated field ids on rows, `_activity_instance_id` present, step-key candidates found, `Table::*` keys. One `getItem` on a task and one `getProgress`: their shapes |
| Forms ×8 | `getItems` envelope, rows, keys, field coverage, `Table::*` keys |
| Read ladder | rung used per flow (after the lens); F8 index size; the viewer-route probe and whether it is **proven** this session (only then may a `viewer` read give `complete` counts, §6.2) |
| Policy and flags | `countsPolicy` in effect per pinned release, and where it came from (Settings or default); `additionalPartRaise`; `scopeExtendedOutcome` |
| Steps | `STEPS` with `serverActivityId` (generated or learned this session), and the task rows resolved to each step **with their evidence level** (§6.3) |
| Write path this session | K-WB per step (untested / ok / refused); send-back (untested / ok / refused / no step id); `openForm` (button presses, answered / timed out / refused); **uncertain items**; not-kept count; retries; stored pending sheets |
| Read-back helper | "Copy as read-back JSON" (§4.4): role ids from `AppRoles` and `getRoles`; step activity ids seen; `Table::` keys seen |

**Test ids:** `wb-diag`, `wb-diag-container`, `wb-diag-build`, `wb-diag-roles`, `wb-diag-flow-<id>`, `wb-diag-copy`, `wb-diag-include-people`.

## 10. Build (T0)

**`vite.workbench.config.ts`** is a copy of `vite.portal.config.ts` with these changes:
- input `workbench.html`;
- `outDir: "dist-workbench"`;
- `define: { __WORKBENCH_BUILD__: JSON.stringify(new Date().toISOString()) }`.

It keeps `viteSingleFile({ removeViteModuleLoader: true })`, `assetsInlineLimit: 100_000_000`, `cssCodeSplit: false`, `base: ""`, the `@` alias, the dedupes and target es2022.

**`workbench.html`:**
- copied from `portal.html`;
- title "CIQ Workbench · Beiersdorf";
- a static branded loader ("Loading the CIQ Workbench…");
- the pre-paint theme script, with storage key `bdf-wb-theme` and try/catch;
- entry `/src/workbench/main.tsx`.

**`main.tsx`** imports `./fonts.css` (a copy of the portal's Latin-only woff2 file), `@/styles.css` and `./workbench.css`.

**`scripts/zip-workbench.mjs`**, copied from `zip-portal.mjs`:
- strips `crossorigin`;
- moves the inlined module to the end of `<body>` and asserts the loader comes first;
- builds `dist-workbench/zip/{index.html, manifest.json}`, where `manifest.json` = `{"Category":"Application","Framework":"React"}` (`UI-LOG:L13`);
- writes `dist-workbench/ciq-workbench-ui-<sha256-10>.zip` and `latest.txt`.

**Guards** (the build fails if one trips):
- zip > 5 MB;
- `X-Access-Key` (any case) in `index.html`;
- the harness marker `__WB_HARNESS_ONLY__` in `index.html`;
- `index.html` lacking `__WORKBENCH_BUILD__`'s value.

### 10.1 Separate type-check and test runs (the portal's checks stay untouched)

The main `tsconfig.json` includes all of `src`, and the main `vite.config.ts` (not editable) runs every `src/**/*.test.{ts,tsx}`. Stubs and in-progress Workbench code must never break the portal session's `npm run typecheck`, `npm test` or `build:portal`. So:

- **`tsconfig.json`: one added line, `"exclude": ["src/workbench"]`.** Needed because it includes all of `src`; nothing else in it changes. No portal or prototype file imports `src/workbench`, so the portal's program is unchanged. T0 records the edit in `src/workbench/README.md`.
- **`tsconfig.workbench.json`** (new) extends `./tsconfig.json` and sets `"include": ["src/workbench", "src/portal/kf/kfsdk.d.ts"]` and an **explicit** `"exclude": ["node_modules", "dist", "dist-portal", "dist-workbench"]`. (TypeScript inherits `exclude` separately from `include`, so without it the base's `src/workbench` exclude would empty the program.) The ambient `kfsdk.d.ts` is listed by path because WB-3 forbids copying it; `src/workbench/env.d.ts` declares `__WORKBENCH_BUILD__`. Imported kit files (`@/components/ui/*`) are type-checked through their imports.
- **`vitest.workbench.config.ts`** (new): the `@` alias and `dedupe` of `vite.config.ts`, `test: { environment: "node", include: ["src/workbench/**/*.spec.{ts,tsx}"] }`. Workbench tests use the **`.spec`** suffix, so the main `npm test` never collects them.
- The harness engine's tests live in `src/workbench/harness/**/*.spec.ts` and run under `test:workbench` too.

**npm scripts** (new; existing scripts unchanged):

```json
"gen:workbench":       "node scripts/gen-workbench-schema.mjs",
"typecheck:workbench": "tsc -p tsconfig.workbench.json",
"test:workbench":      "vitest run -c vitest.workbench.config.ts",
"build:workbench":     "node scripts/gen-workbench-schema.mjs --check && tsc -p tsconfig.workbench.json && vite build -c vite.workbench.config.ts && node scripts/zip-workbench.mjs",
"dev:workbench":       "vite -c vite.workbench.config.ts --port 5330 --open /workbench.html",
"harness:workbench":   "node scripts/harness-workbench.mjs"
```

**Green means all of:** `npm run typecheck` and `npm test` (the existing checks, unchanged and still green), plus `npm run typecheck:workbench`, `npm run test:workbench` and `npm run build:workbench`.

**Ports:** the prototype uses 5310 and the portal 5320, so the Workbench takes **5330**.

### 10.2 `guards.spec.ts` (vitest, node fs)

It scans `src/workbench/**` (excluding `harness/` unless stated) and fails on:
- imports from `@/store`, `@/domain`, `@/features`, `@/layout`, `@/portal`, `@/components/status`, `"@/components/ui"` (the index) or `@/components/ui/overlay` (harness included);
- any `switchRole(` (harness included, except the `SWITCH_ROLE` refusal handler);
- any `deleteItem(` anywhere (the facade declares no delete method; the ambient type declaration lives in `src/portal/kf/kfsdk.d.ts`, outside the scan);
- the string `DELETE` used as an HTTP method (regex ``/method\s*:\s*["'`]delete/i``) anywhere;
- `updateAdminItem` outside `kf/sdk.ts` and `data/adminRepair.ts`;
- `updateFormRow`, `updateItem` or `writeVerified` imported or called in `data/audit.ts`;
- `toISOString(` anywhere except `data/normalize.ts` (`kfDateTime` lives there; a source scan can decide this, unlike "used for a write").

## 11. Harness: an emulated Kissflow app host (T4)

### 11.1 Shape

**`scripts/harness-workbench.mjs`:**
- Runs two `http` servers on random 127.0.0.1 ports. The UI origin serves `dist-workbench/zip/index.html`; with `--ui <url>` it frames the dev server instead.
- The host page loads an IIFE built by **esbuild** from `src/workbench/harness/hostPage.ts`. esbuild is present in `node_modules`. Harness code uses **relative imports only**.
- Playwright is loaded from the same absolute path as the portal harness (machine-specific).
- One browser context per scenario.
- Report: `dist-workbench/harness-report.json` plus `harness-<scenario>-<tag>.png`. The exit code is non-zero on failure.
- `--serve` starts the servers and prints a host URL for manual demos, with no Playwright.

**Engine** (`src/workbench/harness/`, TypeScript, unit-tested by vitest, imports `../schema/generated`):

| File | Does |
|---|---|
| `state.ts` | Items per flow: fields, `_status`, open activities `[{ activityInstanceId, irStep, stepName, ownerRole, open }]`, `_created_by`, `_created_at`. Form rows. Per-user Form drafts |
| `workflow.ts` | Step traversal from `STEPS` order. Conditions (`A = "x"`, `A != "x"`). Parallel blocks: one activity per true branch; the join when all are closed; an all-false block is skipped (as `SPIKES:L132`); End → Completed. Send-back to a target step, with a new activity instance. Reject → Rejected; withdraw → Withdrawn; neither completes |
| `formula.ts` | Evaluates the spec formula strings (IF, OR, AND, NOT, ISBLANK, `+`, `=`, `!=`, `<`, `>`, string and number literals) after each write. Test: every formula in `FIELDS` and the child tables gives the outputs in `schema/formulaSamples.ts` (T0; the same vectors T2's client mirrors use). The vectors assert **v4's** results: `<D>_Gate` = `""` and `Hold_For_Open_Items` = "Yes" when a count is blank (`spec:data_model.flows.CIQ_Case_A00.fields[SAF_Gate].formula`, `[Hold_For_Open_Items].formula`). `SPIKES:L75` is cited only as proof that `ISBLANK` is true for a blank Number; its "Gate = OK on blank" came from the spike's own formula. With `childFormula=off`, child-column formulas (`Criteria_Open_Num`) stay blank |
| `permissions.ts` | Field writability per step from `STEPS.perms`. A computed field is never writable |
| `commands.ts` | SDK command handlers. Command names are in the SDK source (`sdk.es:L106-L133` and nearby): `PROCESS_GET_MY_ITEMS`, `…_MY_TASKS_ITEMS`, `…_PARTICIPATED_ITEMS`, `…_ADMIN_ITEMS`, `…_GET_ITEM`, `…_GET_ADMIN_ITEM`, `…_UPDATE_ITEM`, `…_UPDATE_ADMIN_ITEM`, `…_CREATE_ITEM`, `…_SUBMIT_ITEM`, `…_DISCARD_ITEM`, `…_DELETE_ITEM` (refused and fails the scenario), `PROCESS_REJECT_ITEM`, `PROCESS_WITHDRAW_ITEM`, `PROCESS_SENDBACK_ITEM`, `PROCESS_OPEN_FORM`, `PROCESS_GET_PROGRESS`, `DATAFORM_GET_ITEMS`, `…_GET_ITEM`, `…_CREATE_ITEM`, `…_SUBMIT_ITEM`, `…_UPDATE_ITEM`, `…_DISCARD_ITEM`, `…_DELETE_ITEM` (refused and fails the scenario), `…_OPEN_FORM`, `GET_ROLES`, `SWITCH_ROLE`, `API`. Payload keys are read from `kfsdk.es.js`, never guessed. Anything else gets `NOT_EMULATED` |
| `fixtures.ts` | Fictional users, suppliers and config. **Cases are built by driving the engine itself** (create → submit through the steps), so every fixture state is reachable |
| `hostPage.ts` | postMessage bridge (accepts only the frame's messages with `_id` and `command`). Exposes `window.__kfCalls`, `__kfOverlaps`, `__kfState()` (snapshot), `__kfHost.nativeSave(id, act, data)` (a native-form save after `openForm`, child rows included), `__kfHost.nativeSubmit(id, act)`, `__kfHost.nativeSendBack(id, act, stepName)` and `__kfHost.dropLaneValue(caseId, fieldId)` (a lost lane value after the join, for S39 and S40) |

### 11.2 Deliberately unkind behaviour (defaults first)

**Identity:**
- `user=<fixture id>`. `AppRoles` = several roles **by Name**, with fake `Ro…` ids.
- `appId=CIQ_Digital_A00` (default) or `CIQ_Supplier_Portal_A00`: the handshake answers it. With the portal id, **any** write, create, submit, reject or send-back command fails the scenario (S38).
- `dev=1` (default for the "dev" user): `GET_ROLES` answers `{roles, currentRoles}`. `dev=0`: it is refused. `dev=1` also works for **non-builder** fixture users (a Development account may answer anyone, `sdk.d.ts:L1297`).

**Lists:**
- `envelope=live` (default): My items → `{Columns, Data}`; tasks and admin → `{_id, Columns, Sort, Filter, Data}`, with no total (`UI-LOG:L107-L108`). The alternatives `items` and `Data` exist.
- `rows=full|sparse`.
- `participated=error` (default): "some error occured".
- `adminList=ok` (default) | `refuse`: with `ok`, admin calls succeed only for users with `admin: true`, for Case Admin when `caseAdminFlowAdmin=on`, and for the user named by `flowAdmin=<user>`; everyone else is refused. `refuse` refuses everyone.
- `adminStep=omit` (default) | `row`: **admin list rows carry no `_current_step`** (as live, `UI-LOG:L43`); `row` adds it.
- `extra=<n>`: extra cases, for paging. With `multiAct=on`, the dev user's task list puts the 3 Part 2 activities of one case on both sides of a 50-row page boundary.
- `stepkey=_current_step` (default) | `none` | `block` | `first`: task rows carry their own step name; none; the Parallel block's name "Part 2 – Beiersdorf review" on every branch row; or the **first branch's** name on every branch row.
- `progress=on|off` (`PROCESS_GET_PROGRESS` lists activities with ids and names; [harness assumption]).

**Task engine:**
- Tasks go to users whose roles own the step.
- `kfa=on` assigns S1 from `Owner_RMM` and OPNT_S1 from `Responsible_User`.
- Several open activities per item.

**Refusals (always on):**
- A wrong or closed activity instance, or a user not in the step role: "This item has moved out of your queue" (`SPIKES:L118`). This includes `getItem` on a task the user just submitted.
- A field not Editable or Mandatory at the step, or any computed field: `KISSFLOW_ERROR_050313`, listing the fields.
- A DateTime with ms, judged **by field type from the schema**, in header fields **and child-row columns**.
- A non-string `kf.api` body.
- `UPDATE_ADMIN_ITEM` from a user without flow Admin.
- `SWITCH_ROLE`: recorded, and it fails the scenario.
- Any `*_DELETE_ITEM`, and any `API` call with method `DELETE`: refused, recorded, and it fails the scenario. (`*_DISCARD_ITEM` of the user's own draft is allowed.)

**Leniency (as live):** a submit with blank Mandatory fields is accepted (`SPIKES:L144`), so only the client can block it.

**Modes:**

| Mode | Values | Effect |
|---|---|---|
| `kwb` | `ok` (default) / `refuse` | `refuse`: every `UPDATE_ITEM` after Start gives 050313 for all fields (`SPIKES:L141`) |
| `sendback` | `ok` / `500` (`SPIKES:L147`) | |
| `reject` | `ok` / `refuse` | |
| `openForm` | `ok` (default) / `hang` / `refuse` | `hang`: `PROCESS_OPEN_FORM` never answers; `refuse`: it answers an error |
| `race` | `<flow>:<n>` / `child:<n>` | The next n updates to the targeted item answer 200 but drop their keys or child-row adds, as a concurrent writer would (`SPIKES:L152-L156`). `race=…:always` |
| `writeDelay` | ms, optionally `writeDelayOnce=1` | Delays write answers. Overlapping writes to one item are logged to `__kfOverlaps`. **`writeDelay=31000&writeDelayOnce=1` exceeds the 30 s call timeout** (S41; uses Playwright's `page.clock` if the installed version has it, else real time, about 35 s) |
| `drafts` | `strict` (default) / `sticky` | `strict`: a second Form create by the same user while a draft is open gives 409 (`SPIKES:L158`). `sticky`: the user starts with an **old draft holding leftover values**, which a create reuses unless `DATAFORM_DISCARD_ITEM` came first |
| `formSubmit` | `ok` (default) / `fail` | `fail`: the next Form submit answers an error and stores nothing |
| `formSubmitId` | `same` / `new` | Form submit keeps the id or returns a new one |
| `formDrop` | `<flow>:<field>` | The next Form submit to that flow stores the row **without** that field (a partly kept row; used for the F8 correction path) |
| `childIds` | `client` (default) / `server` | `server`: the host ignores client row `_id`s and assigns its own |
| `childFormula` | `on` (default) / `off` | `off`: child-column formulas (`Criteria_Open_Num`) stay blank |
| `countsPolicy` | `fail-closed` (default) / `attest` | Written into the fixture release's Settings payload |
| `delayInit`, `ignoreInits` | | As in the portal harness |

**Global checks after every scenario:**
- no page or console errors;
- no `SWITCH_ROLE`;
- no `*_DELETE_ITEM` and no `API` call with method `DELETE`;
- no `DATAFORM_UPDATE_ITEM` on `CIQ_Audit_Event_A00` (F8 is create-only);
- no `DATAFORM_UPDATE_ITEM` on a **Published** F2 row, except a patch that is exactly `{ Config_State: "Retired" }` (WB-D6);
- no `UPDATE_ADMIN_ITEM`, except in S39, and there only lane fields of `ADMIN_WRITE_ALLOW`;
- no write payload naming a computed field;
- no write payload holding a DateTime with ms (child rows included);
- `PROCESS_OPEN_FORM` only after a click on `wb-kwb-openform` (never automatic);
- `__kfOverlaps` empty;
- no command refused unless the scenario expects it.

**Matrix run (K-WB).** Every scenario marked **M** in §11.4 runs twice: as written (`kwb=ok`) and with `kwb=refuse`. In the refuse variant, each expected `UPDATE_ITEM` after Start is replaced by: the `KwbFallback` panel listing the pending values (computed fields absent) → click **Open task form** → `PROCESS_OPEN_FORM` with the right `_id` and act → `__kfHost.nativeSave(…)` with the listed values → **Re-read** passes → `SUBMIT_ITEM` (or the native submit), with the same final host state as the `ok` variant and no data loss. The report lists both variants separately. **Every P1 scenario that writes fields at a step after Start is M.** The others are exempt for a stated reason: they write nothing at a step after Start (S01–S07, S11a, S22, S23, S29–S33, S38, S43, S44: reads, Start-only creates, Forms, or a reject), they already run refused (S16, S18b, the third part of S35, S37), they test a path that K-WB replaces (S13–S15 and S41: the SDK write itself; S17: its refused twin is S18b; S42: the Form part, with its Return part covered by S18b), or they use the admin route (S39).

### 11.3 Fictional fixtures

**Users** (all invented; e-mails `<id>@example.test`):

| Id | User | Roles |
|---|---|---|
| `dev` | "Dev Builder" | every CIQ role + Admin; builder |
| `alex` | "Alex Rivera" | RMM |
| `casey` | "Casey Moreau" | RMM + Case Admin |
| `sam` | "Sam Okafor" | Regulatory |
| `jo` | "Jo Weber" | Safety |
| `tove` | "Tove Marsh" | QM |
| `lee` | "Lee Park" | Microbiology |
| `ana` | "Ana Silva" | Sustainability |
| `wren` | "Wren Ashdown" | Overall Approver |
| `robin` | "Robin Hale" | Business Admin |
| `max` | "Max Reed" | Reader |
| `norole` | "No Role" | User only |

**Suppliers:**
- "Northwind Botanicals GmbH" (DE), 3 contacts (2 can confirm, 1 not invited);
- "Lumen Ingredients BV" (NL);
- "Corvid Chemicals Ltd" (GB, inactive).

**Config:**
- a Published Live Release (no "Rule set" entry in its manifest, so S2 writes `none (manual-wb-1)`);
- a Template of 6 sections: BASIC, GEN, K2.1, SAF-A, REG-B, SUS-1;
- Section definitions;
- Section ownership;
- RMES criteria: 6 SAF and 6 REG across parts A–D;
- a Text bundle;
- Settings (`countsPolicy` from the harness param, absent by default);
- a Draft rule set.

**Cases**, built by the engine:
- C1 at S1; C2 at S2; C3 at S3;
- C4 in Part 2, with REG, SAF and QM active: 3 tasks, and a SAF RMES sheet partly filled;
- C5 at S5 with counts blank, REG/SAF/QM lanes completed, and F8 `lane.completed` snapshots for them; C6 at S6; C7 at S7;
- C8 at S8, reached by a **native** submit at S7 with `Final_Release_At` blank (to test the "released" rule);
- C9 Completed;
- C10 cancelled (Rejected + an F8 Cancellation row), with C10 cycle 2 reactivated at S1.

**Points:**
- P1 at OPNT_S1 (to supplier, SAF);
- P2 at OPNT_R_REG with a response;
- P3 internal at OPNT_R_SAF;
- P4 Contact update at OPNT_R_RMM;
- P5 Rejected ("stray");
- P6 at OPNT_R_SAF with `OP_Outcome` already "Withdrawn" (withdrawn at S1);
- P7 an Accepted "Department review" point for SAF on C6 with `Late_Decision` "Approved", newer than C6's `SAF_RMES_Decision` "Rejected".

**Change requests:** CR1 at Triage (on C4), CR2 at Assess (REG + SAF), CR3 on C9 (after release), CR4 at Triage on C8, **untriaged** (`Case_Item_Id` blank; `Case_Code` + `Cycle_No` set).

### 11.4 Scenarios and expected checks

P1 = must pass tonight; P2 = stretch. **M** = also runs with `kwb=refuse` (the matrix run, §11.2). Default user for case steps is `dev` unless stated; `alex` and the reviewers run on rung 3 (no admin list).

| # | Scenario (host params) | Expected checks | P |
|---|---|---|---|
| S01 | outside Kissflow (direct UI) | "Not running inside Kissflow"; no SDK command | P1 |
| S02 | `ignoreInits=1` | "Couldn't connect" → Try again → live; exactly 2 `CC_INITIALIZE` | P1 |
| S03 | `user=norole` | no-access page lists "User"; no `PROCESS_*` or `DATAFORM_*` command | P1 |
| S04 | `user=dev` Diagnostics | container `CIQ_Digital_A00` ✓; build stamp = the built stamp; 13 role names; every flow probed; participated shows its error; **no write command**; "Copy diagnostics JSON" holds no fixture name or e-mail unless the checkbox is on | P1 |
| S05 | lens: `user=dev&dev=1`, then `user=dev&dev=0`, then `user=jo&dev=1` | dev=1: the switcher exists; "CIQ Safety Reviewer" leaves the nav with Review, RMES and Cases only, **and no `PROCESS_GET_ADMIN_ITEMS` is sent** while the lens is on (rung 1 skipped). dev=0: no switcher; the nav is the union. jo+dev=1 (a non-builder answered by `getRoles`): the switcher offers only "CIQ Safety Reviewer"; nav, tasks and rung are unchanged. `SWITCH_ROLE` never sent | P1 |
| S06 | RMM new case (`user=alex`) | Order: F1/F2 reads → `PROCESS_CREATE_ITEM` → `GET_ITEM` (full payload compared) → `UPDATE_ITEM` (`Case_Code` + `Request_Key`) → `GET_ITEM` → `SUBMIT_ITEM` → `DATAFORM_DISCARD_ITEM` → `DATAFORM_CREATE_ITEM` F3 → `DATAFORM_SUBMIT_ITEM` → verify → `DATAFORM_DISCARD_ITEM` → F8 create and submit. Creates never overlap. `Case_Code` = `CIQ-<yyyy>-<id>`, `Request_Key` = `<Case_Code>-C1-REQ`. Host: the case at S1; an F8 "Item created" row with `Snapshot_JSON` | P1 |
| S07 | new case, no confirm contact | problems list shown; **no** `PROCESS_CREATE_ITEM`. (`Case_Code`/`Request_Key` are not listed as problems) | P1 |
| S08 | S1 manual | `Basic_Data_Received` = "Yes" → submit → S2. The "manual record" note is visible. The text "sent to supplier" never appears | P1 · M |
| S09 | S2 scope | F4 then F3 rows, created one at a time, each after a discard; S2 fields written; `Rule_Set_Version` = `none (manual-wb-1)` on the case and on F4; submit → S3; flags as chosen. A rerun creates no duplicates | P1 · M |
| S10 | S3 manual → Part 2 | "Supplier confirmed at" set to a time ≠ now (no ms): host `Completeness_At` = `RMES_Created_At` = that input; host: 3 open activities on one `_id`; `user=dev` My work + Review list all 3 (distinct `_id|act`) | P1 · M |
| S11a | lane gate, rung 3 (`user=jo`, C4, open SAF point raised by someone else) | "Refresh counts" → **partial**: the unread list names "Open points of this case" and the rung; **no** `UPDATE_ITEM` of `SAF_Open_Count`; "Complete review" disabled; **no** `SUBMIT_ITEM` | P1 |
| S11b | lane gate, rung 1 (`user=jo&flowAdmin=jo`) | "Refresh counts" writes `SAF_Open_Count` = 1; server `SAF_Gate` = `""`; Complete disabled; blockers listed (including any SAF-led section without a review mark); **no** `SUBMIT_ITEM` | P1 · M |
| S12a | lane completes, rung 1 (`user=jo&flowAdmin=jo`) | after closing the point, marking SAF-A reviewed and setting a decision: counts 0 → gate OK → submit; pre and post re-read equal; an F8 `lane.completed` row with the SAF lane; after the REG and QM lanes too → the case at S5 | P1 · M |
| S12b | lane completes by attestation (`user=jo&countsPolicy=attest`, rung 3) | refresh partial → **Attest and write** with a reason → F8 `count.attested` create+submit **before** the count `UPDATE_ITEM` → gate OK → submit → the post-submit note "could not read the item with your access" (not an error) | P1 · M |
| S13 | `race=CIQ_Case_A00:1` on a lane save | `UPDATE_ITEM` sent twice, success, no error banner; the host has the values | P1 |
| S14 | `race=CIQ_Case_A00:always` | 4 `UPDATE_ITEM`, then a "not kept" banner naming the fields; no submit | P1 |
| S15 | `writeDelay=400`, rapid double save + refresh + two notes | `__kfOverlaps` empty; the two F7 creates are sequential, each after a discard | P1 |
| S16 | `kwb=refuse` at CASE_B_REG (`user=sam&flowAdmin=sam`) | 050313 → the KwbFallback panel with values (no computed field listed) and the My Tasks instruction **before** any click; click **Open task form** → `PROCESS_OPEN_FORM` with the right `_id` and act; reload → the sheet is restored from `sessionStorage`; `__kfHost.nativeSave` → Re-read passes → submit OK; a second save at the same step skips `UPDATE_ITEM` | P1 |
| S17 | Return, `sendback=ok&progress=on` | Rounds row "Returned"; `Round_No` n+1; `Query_Key` `…|R<n+1>`; `Response_*` cleared; `Awaiting_Response` = "Yes" → `PROCESS_SENDBACK_ITEM` with the OPNT_S1 activity id → the host point at S1 | P1 |
| S18a | Return, `sendback=500` (`user=sam`, rung 3) | new round saved and verified, then the fallback with "already saved"; click → `PROCESS_OPEN_FORM`; `nativeSendBack` → Re-read answers "moved out of your queue" → "sent back in Kissflow" note; host point at S1 | P1 |
| S18b | Return, `kwb=refuse` | the round write is refused → the fallback lists the **Rounds row values and the header values**; the text "already saved" is **absent**; no `PROCESS_SENDBACK_ITEM`; `nativeSave` + `nativeSendBack` → Re-read passes | P1 |
| S19 | Return, `progress=off` | no `SENDBACK`; straight to the fallback with "target step unknown" | P2 |
| S20 | Accept a point | Rounds row "Accepted"; `OP_Outcome`, `Reviewed_By/_Email/_At` → submit → Completed; host `Open_Num` = 0 | P1 · M |
| S21 | OPNT_S1 manual response + withdraw, then confirm | Response → routes to `R_<OP_Dept>`; withdraw writes "Withdrawn by Beiersdorf" and `OP_Outcome` "Withdrawn"; at `R_SAF` (P6) only **Confirm withdrawal** is offered (Accept and Return absent) → `Reviewed_*` + a Rounds row (Withdrawn) → submit → Completed | P1 · M |
| S22 | raise point, missing Supplier_Due_Date | after create, server `Start_Gate` blank → submit blocked, missing items listed (no input for `Start_Gate`) → fixed → submit → at S1 | P1 |
| S23 | cancel at S2 (`reject=ok`; then `reject=refuse`; then `formDrop=CIQ_Audit_Event_A00:Notify_Recipient`) | empty reason blocked; F8 Cancellation create+submit **before** `PROCESS_REJECT_ITEM`; `Notify_Recipient` = the emails; host Rejected. On refuse: a second F8 "case.cancel.failed" row + red banner. On formDrop: a `case.cancel.correction` row with `Object_Key` = the first `Event_Key`, **no** `DATAFORM_UPDATE_ITEM` on F8, then the reject | P1 |
| S24a | S5 with an open item + override (`user=dev`, rung 1) | counts written (1/0); gate blank → override reason → F8 row → gate "OK" → `Hold_Note` → submit | P1 · M |
| S24b | S5, rung 3 (`user=alex`) | refresh partial → counts **not** written, unread listed; the override still works → submit | P1 · M |
| S25a | approver (`user=wren`, C6) | the RMES summary is shown read-only (no input; **no write** to F5/F6, no `Editing_By`); SAF RMES decision Rejected → "Approved" disabled; Rejected without a reason blocked; with a reason → `Completion_Trigger` "Overall rejection" → submit → host skips S7 | P1 · M |
| S25b | effective decision (`user=wren&flowAdmin=wren`, C6 with P7) | the SAF effective decision is "Approved" from P7 (source shown); "Approved" enabled → submit → S7. With `flowAdmin` off and `countsPolicy` default: "Approved" disabled with the "could not be read" note | P1 · M |
| S26a | S7 manual, complete (`user=dev`) | empty "Supplier released at" blocks; set → `Final_Release_At` = input; counts refreshed and written before the submit; `Completion_Trigger` "Manual by RMM: …"; texts "PDF" and "e-mailed" absent | P1 · M |
| S26b | S7 manual, partial (`user=alex`) | the refresh is partial → `Open_Items_Count` and `Open_CR_Count` **cleared** before `SUBMIT_ITEM`; host `Hold_For_Open_Items` = "Yes" → the case is at **S8**, not Completed | P1 · M |
| S27 | CR triage after release: CR3 (C9 Completed) and CR4 (C8 at S8, `Final_Release_At` blank, untriaged) | both: outcome forced to "Refused – after final release"; impacts "No"; F8 "Change attempt"; CR4 is listed under C8 before triage (`Case_Code` + `Cycle_No`) and gets `Case_Item_Id` at triage; submit → CR ends with no branches. "Accepted – scope extended" is not in the select | P1 · M |
| S28 | CR assess (`user=sam`, CR2) | `REG_Assessment` + by/at → submit; the SAF branch stays open | P2 · M |
| S29 | RMES (`user=jo`, C4) | lock written; criteria saved through `Table::` (phase 1) and verified; header counts written from the read-back (phase 2) and verified; finding added; `user=sam` route to SAF → "not available", no read; `user=wren` nav has no RMES link | P1 |
| S30 | config (`user=robin`) | draft → publish → F8 Configuration; Published is read-only; release created; **retire** = F8 `config.retire` then one update `{Config_State:"Retired"}` only; no delete command | P2 |
| S31 | supplier contacts | RMM adds 1 contact (with a typed `Contacts_Portal_User_Id`, labelled manual) → verified; `user=robin` sees it read-only | P2 |
| S32 | reader (`user=max`) | cases (F8 index fallback when `adminList=refuse`, with the banner), read-only case, audit log; the only write allowed is adding a note | P1 |
| S33 | envelopes and paging (`envelope=items` / `Data`, `extra=120`, `rows=sparse`, `multiAct=on`) | lists complete past 50 and past 100; the 3 Part 2 activities that straddle the page boundary each appear once (distinct `_id|act`); sparse rows give warnings, never a crash; admin rows without `_current_step` get their step from `GET_ADMIN_ITEM` (at most 4 in flight) | **P1** |
| S34 | `stepkey=none` | tasks still resolve through `getItem`/`getProgress`; otherwise "unidentified step" + open in Kissflow | P2 |
| S35 | resolver in Part 2 (C4): `user=dev&stepkey=block&progress=off`; `user=dev&stepkey=first&progress=on`; `user=jo&stepkey=block&kwb=refuse` | dev/block/off: the 3 branch tasks are "unidentified step", no step is marked, nothing is written. dev/first/on: they resolve to REG, SAF and QM by activity. jo/block: `block-unique` → SAF; the 050313 marks **only** SAF `kwb:refused` | P1 |
| S36 | OPNT_S1 held by a reviewer (`kfa=on&user=jo`) | jo raises a SAF supplier point (no "Additional part" kind offered) → host assigns OPNT_S1 to jo → jo's Review queue shows it under "Record supplier response (manual)" with the point's `Supplier_Due_Date` → jo records the response → submit → `R_SAF` | P1 · M |
| S37 | `openForm=hang`, then `openForm=refuse` (with `kwb=refuse`) | the sheet and the My Tasks instruction show before the click; hang: after 8 s a note, the page stays usable; refuse: a note at once; the sheet never disappears | P1 |
| S38 | wrong container (`appId=CIQ_Supplier_Portal_A00&user=dev`) | banner + red Diagnostics row; pressing a save shows the container error; **no** write, create, submit, reject or send-back command | P1 |
| S39 | lane repair (`user=casey&caseAdminFlowAdmin=on`, C5 after `dropLaneValue(C5,"QM_Review_Confirm")`) | S5 shows lane QM incomplete with **Repair lane**; F8 `lane.repaired` first, then exactly one `UPDATE_ADMIN_ITEM` carrying only QM lane fields; read back; the lane check passes. `user=alex` sees no Repair button | P1 |
| S40 | department-review alternative (`user=alex`, C5 after the same drop) | **Raise department review for QM** → a point at `R_QM`; `user=tove` accepts it; alex **Record late completion** → `Late_Completions_Text` holds its `OP_Key` → the lane check passes → submit | P1 · M |
| S41 | write timeout (`writeDelay=31000&writeDelayOnce=1`) | a lane save shows the timeout message and the item is uncertain; a second save sends **no** second `UPDATE_ITEM`; Re-read shows what landed and clears the mark; `__kfOverlaps` empty | P1 |
| S42 | `childIds=server` | a Return (Rounds add) and an RMES criteria save with one forced re-apply create **no** duplicate rows (natural-key match) | P1 |
| S43 | `childFormula=off` (`user=jo`, C4) | RMES save → `Open_Criteria_Count` counts every applicable row with a blank `Criteria_Open_Num` (warning shown); the SAF gate cannot pass | P1 |
| S44 | `drafts=sticky`, then `formSubmit=fail` on the S2 F3 create | sticky: `DATAFORM_DISCARD_ITEM` before every create; created rows hold no leftover values. fail: the row is looked up by key, absent → `DATAFORM_DISCARD_ITEM` → error shown; a retry creates it once | P1 |

## 12. Task list for parallel builders

**Order:** T0 → (T1 ∥ T2 ∥ T3 ∥ T4, **with T0 still on duty as foundation owner**) → T5.

**Folder ownership is exclusive.** A task may **import** from another task's folder only through the contracts in §12.2. Only T0 edits `package.json`, `tsconfig.json` (the one exclude line), `tsconfig.workbench.json`, `vitest.workbench.config.ts`, and `src/workbench/{data,kf,schema,shell,ui,pages,domain}`.

**Foundation changes during the parallel phase.** The T0 builder **stays on** after the T0 gate as foundation owner until T5 starts. A builder who needs a foundation change appends a request to `src/workbench/FOUNDATION-REQUESTS.md` (one entry: task id, file, the change, why; append-only for T1–T4) and goes on with a local workaround inside its own folder. T0 answers each entry in the same file (accepted with the commit/time, or declined with the reason), makes the change, and keeps `npm run typecheck:workbench` green. T5 only integrates; it is not the change channel.

**Shared test data.** `schema/formulaSamples.ts` (T0) holds input → output vectors for every spec formula (v4 results, §7.9). T2's client mirrors and T4's `formula.ts` both test against it, so their parity needs no import between T2 and T4.

**Checks every task runs** (from `prototype/`): `npm run typecheck` and `npm test` (the portal's checks, unchanged, must stay green), `npm run typecheck:workbench` and `npm run test:workbench`.

### 12.1 Tasks

**T0: Foundation** (critical path; one builder; ~3.5 h, then on duty)
- **Owns:**
  - `workbench.html`, `vite.workbench.config.ts`, `tsconfig.workbench.json`, `vitest.workbench.config.ts`, the one-line `tsconfig.json` exclude, the `package.json` scripts;
  - `scripts/gen-workbench-schema.mjs`, `scripts/zip-workbench.mjs`;
  - `src/workbench/{main.tsx,WorkbenchApp.tsx,build.ts,theme.tsx,BrandLoader.tsx,workbench.css,fonts.css,env.d.ts,guards.spec.ts,README.md,FOUNDATION-REQUESTS.md}`;
  - `schema/` (including `formulaSamples.ts`), `kf/`, `data/` (including `adminRepair.ts`, `pendingSheet.ts`), `domain/` (including `flags.ts`), `ui/`, `shell/`, `pages/`;
  - **the stubs** in every `features/*/` folder (§12.2).
- **Delivers:**
  - §4 generator plus the committed `generated.ts` (with `computed`, `gates`, `CR_DEPT_FIELDS`, `LANE_FIELDS`, `POST_CREATE_KEYS`, `ADMIN_WRITE_ALLOW`);
  - §5 boot, roles, caps (task possession), container check and lens (rung downgrade);
  - §6 client, read ladder with the confidence rule, per-item admin step reads, tasks and the evidence-based step resolver, `crBelongsTo`, map, hooks;
  - §7 queue (uncertain items, container check, locks in try/catch), `writeVerified`, `submitStep` (+ `lane.completed`), K-WB (button, bounded `openForm`, `pendingSheet`), send-back (refused round write), creates (pre-create exemption, payload verify, discard-first, settle), reject, F8 create-only with corrections, counts and gates, counts policy, lane repair, flags;
  - §9 Diagnostics (redacted copy);
  - §10 build and the separate type-check/test configs;
  - `StepForm` (`stepFormModel`), `FieldInput`, `WriteOutcome`, `KwbFallback`, `ReadQualityBanner`, `ManualRecordNote`;
  - the route registry: `features/*/index.ts` export `routes: RouteObject[]` and `navItems`.
- **Acceptance:**
  1. `npm run typecheck` and `npm test` are green and unchanged in scope; `npm run typecheck:workbench` is clean.
  2. `npm run test:workbench` is green, with tests for:
     - generator guards and drift (§4.3, guards 1–12);
     - `schema/index.ts`: computed fields never writable, `gateFieldsAt`, no Parallel step from `stepOf` (§4.5);
     - `rowsOf` and the envelopes;
     - paging and dedupe by `_id|act`;
     - normalisation (no ms, header and child rows; User, Date, Reference; blank);
     - `writeVerified` with a fake client: success first time; a lost key re-applied once; always lost → `not-kept` after 4 writes; child add/modify/delete verified by `_id` **or natural key**; 050313 → `kwb-refused` with the step marked **only on strong evidence**; local guard throws for a non-writable key, a computed key and any F8 target; timeout → uncertain → next write refused (§7.2);
     - the queue: no overlap per item, creates serialised, wrong container refuses everything;
     - `submitStep`: blank Mandatory blocks with no submit; a gate not "OK" blocks; no held task blocks; lane diff detection; `lane.completed` written after the submit;
     - creates: pre-create exemption and full check, payload re-apply at Start, discard-first, settle and failed discard (§7.6);
     - `rejectCase`: F8 first, reject not sent if the F8 row fails; a correction row counts as verified;
     - `audit.ts`: create-only; correction path; zero updates (§7.8);
     - the count functions and the confidence rule (§6.2, §7.9), including `laneOpenCount("RMM")` and `crBelongsTo`;
     - the counts policy: fail-closed writes nothing on partial; attest writes F8 first; S7 partial clears;
     - `adminRepair`: allow-list enforced;
     - `flags.ts`: every flag in both states;
     - `tasks.ts` resolver evidence cases (§6.3);
     - `pendingSheet` with and without storage;
     - Diagnostics redaction;
     - keys; config hash.
  3. `npm run build:workbench` writes `dist-workbench/ciq-workbench-ui-<hash>.zip` (≤ 5 MB, manifest correct, guards pass).
  4. Opened directly, the bundle shows "Not running inside Kissflow".
  5. The **T0 gate** for starting T1–T4: `typecheck:workbench` green with every stub in place, `viewModels.ts`, `hooks.tsx` and `actions.ts` signatures final, `formulaSamples.ts` and `generated.ts` committed.
  6. Harness (checked in T5): S01–S05, S33, S38 PASS.

**T1: RMM** (~3.5 h)
- **Owns:** `features/rmm/**`, `features/case/**`, `features/cr/**`.
- **Delivers:**
  - §8.1 My work (held tasks, OPNT_S1 due date);
  - §8.2 Cases list;
  - §8.3 New case + reactivate (`createCase.ts`);
  - §8.4 Case detail and tabs (embedding the T2 and T3 components through their contracts), including the Repair lane action (UI over T0's `adminRepair`);
  - §8.5 step panels S1, S2, S3, S5, S7, S8 (B_RMM links to T2): exact field sets, "Supplier confirmed at", "Supplier released at", S5 lane check with the Department-review alternative, S7 clear-on-partial;
  - case cancel and Case Admin actions;
  - §8.6 CR list (`crBelongsTo`), triage (released rule, `crOutcomeOptions`) and manual CR. The scope-extended branch is a stretch behind `scopeExtendedOutcome`.
- **Acceptance:**
  1. `typecheck:workbench` is clean.
  2. Unit tests: `createCase` call order and idempotent "Finish setup" with a fake actions layer; the S2 scope builder (department flags from leads; RMM flag from Settings; never reduce; `Rule_Set_Version`); CR after-release forcing (released rule incl. S8 and Completed-after-S7); `crOutcomeOptions` with the flag off and on; the S5 lane check (a), (b) and the failing (b); S7 clear-on-partial; S3 writes the input to both fields.
  3. Harness: S06–S10, S23, S24a/b, S26a/b, S27, S39, S40, S44 PASS once T4 has landed (checked in T5).

**T2: Reviewer and RMES** (~4 h)
- **Owns:** `features/review/**`, `features/points/**`, `features/assess/**`, `features/rmes/**`.
- **Delivers:** §8.7–§8.11 (held tasks; the "Record supplier response (manual)" group; section-review blocker; counts policy UI; two-phase RMES save), plus `createPoint()` (used by T1's S5 alternative and stretch) and the read-only `RmesSummary` (used by T3's approval screen).
- **Acceptance:**
  1. `typecheck:workbench` is clean.
  2. Unit tests:
     - the Return patch builder: Rounds row, `Round_No`, `Query_Key`, the clears, `Awaiting_Response`, `OP_Outcome` untouched; the refused-round fallback values;
     - the Accept, Withdraw and Confirm-withdrawal builders (each sets `Reviewed_*`);
     - the OPNT_S1 withdraw builder; the S1 panel gated on the held task;
     - `opKindOptions` (no "Additional part" for reviewers; RMM only with the flag);
     - lane blockers, including the section-review blocker;
     - RMES header counts from read-back values (blank applicable → 1) and the client mirror of `Criteria_Open_Num` against `schema/formulaSamples.ts`;
     - duplicate RMES voiding;
     - the lock rules.
  3. Harness: S11a/b, S12a/b, S13–S22, S28, S29, S35, S36, S37, S41, S42, S43 PASS.

**T3: Approver, Admin, Masters, Reader** (~3 h)
- **Owns:** `features/approver/**`, `features/admin/**`, `features/masters/**`, `features/reader/**`, `features/notes/**`, `features/audit/**`.
- **Delivers:** §8.12–§8.16 (read-only RMES summary and the effective decision; Retire as WB-D6; manual `Contacts_Portal_User_Id`).
- **Acceptance:**
  1. `typecheck:workbench` is clean.
  2. Unit tests: the BR-035 approval rule with the effective decision and the partial-read case; the rejection side fields; the release manifest and hash builder; copy-on-write versioning and the state-only Retire patch; the contacts single-row merge and mirror recompute; note edit by the author only.
  3. Harness: S25a/b, S30–S32 PASS.

**T4: Harness host, fixtures, scenarios** (~4 h; starts right after the T0 gate)
- **Owns:** `src/workbench/harness/**`, `scripts/harness-workbench.mjs`, `scripts/harness-workbench-scenarios.mjs`.
- **Delivers:** §11 in full, including every mode of §11.2, the global checks and the **M** matrix runner. Scenarios are written against the §8 test ids. While a feature is still a stub, its scenario reports **PENDING** (not FAIL); T5 turns pending into pass.
- **Acceptance:**
  1. `typecheck:workbench` is clean.
  2. Unit tests for the engine (`*.spec.ts`):
     - traversal: sequential, conditions, parallel fork and join, all-skipped block, send-back, reject and withdraw;
     - formula parity for **every** spec formula against `schema/formulaSamples.ts`; `childFormula=off`;
     - permission refusal (050313), including computed fields;
     - the ms refusal by type, header and child rows;
     - `race` modes; overlap detection; the draft 409; `drafts=sticky`; `formSubmit=fail`; `formDrop`; `childIds=server`;
     - `adminStep=omit`; `stepkey=block|first`; `multiAct`;
     - the delete, F8-update, Published-F2-update and admin-write global checks.
  3. S01–S05 PASS against the T0 build.
  4. `--serve` works.
  5. The host bundle never enters `dist-workbench/zip/index.html` (marker guard).

**T5: Integration and QA** (~2 h; one builder)
- **Owns:** may edit any `src/workbench/**` file **to integrate** (stub removal, signature fixes). Records each such edit in the README.
- **Delivers:**
  - all features wired;
  - `npm run typecheck && npm test && npm run typecheck:workbench && npm run test:workbench && npm run build:workbench && npm run harness:workbench` all green;
  - every P1 scenario PASS, both variants of every **M** scenario;
  - screenshots per role;
  - bundle size noted;
  - `src/workbench/README.md`: run and rebuild steps, the `tsconfig.json` exclude line, the dependency on `src/portal/kf/kfsdk.d.ts`, scenario results, and the [unverified] live-check list (§13.2).
- **Acceptance:**
  - every P1 scenario PASS (P2 may be PENDING, with a reason);
  - no guard tripped;
  - the `X-Access-Key` grep is clean;
  - no `.env` read by any script (checked by reading the scripts).

### 12.2 Contracts between tasks: T0 creates stubs with these final signatures

```ts
// data/hooks.tsx (T0)
useWorkbench(): { kf; me: { _id; Name; Email }; caps: Caps; isBuilder: boolean; lens; setLens; notify(msg, tone); busy; warnings; flagsFor(c: CaseVM): Flags }
useTasks(): Loaded<TaskVM[]> & { heldTask(flow, instanceId, step?): TaskVM | null };
useCaseList(): Loaded<CaseVM[]> & { quality; indexOnly };
useCaseBundle(caseId): Loaded<{ case: CaseVM; points: PointVM[]; crs: CrVM[]; sections: SectionVM[]; runs: RunVM[]; notes: NoteVM[]; events: AuditVM[];
                                quality: Record<"points"|"crs"|"sections"|"runs"|"notes"|"events", ListQuality> }>;
usePoint(id, act?): Loaded<PointVM>;  useCr(id, act?): Loaded<CrVM>;  useFormRows<T>(flow, where?): Loaded<T[]> & { quality };

// data/actions.ts (T0)
saveAtStep(task: TaskRef, patch: Patch): Promise<SaveResult>;              // SaveResult.kind: ok | not-kept | kwb-refused | refused | timeout
submitStep(task: TaskRef, o?: { extraChecks?: Check[]; laneFields?: FieldId[]; comment?: string }): Promise<SubmitResult>;
rejectCase(task: TaskRef, reason: string, c: CaseVM): Promise<ActionResult>;
sendBackPoint(task: TaskRef, ret: ReturnInput, p: PointVM): Promise<ActionResult & { mode: "sdk" | "openForm" | "kwb" }>;
createProcessItem(flow, data, o?: { postCreate?: (draft) => Patch }): Promise<{ instanceId: string }>;
createFormRow(flow, data, keyField, o?: { reapply?: boolean }): Promise<{ itemId: string }>;   // reapply is always false for F8
updateFormRow(flow, itemId, patch: Patch): Promise<SaveResult>;           // throws for CIQ_Audit_Event_A00
writeAudit(e: AuditInput): Promise<{ itemId: string; correctionItemId?: string }>;   // create-only
openTaskForm(task: TaskRef): Promise<"opened" | "timeout" | "refused">;   // bounded to 8 s; button-only
reReadPending(task: TaskRef): Promise<{ matches: boolean; missing: FieldId[]; submittedElsewhere: boolean }>;
refreshCaseCounts(task: TaskRef, c: CaseVM, scope: "case" | { lane: Dept }, o?: { attestation?: string })
  : Promise<SaveResult & { confidence: "complete" | "partial"; unread: Unread[]; action: "written" | "blocked" | "attested" | "cleared" }>;

// data/adminRepair.ts (T0)
repairLane(c: CaseVM, d: Dept, snapshot: AuditVM, reason: string): Promise<SaveResult>;   // Case Admin, rung 1, allow-listed fields only

// data/counts.ts (T0, pure)
crBelongsTo(cr: CrVM, c: CaseVM): boolean;
effectiveDecision(c: CaseVM, d: "SAF" | "REG", points: PointVM[]): { decision: "Approved" | "Rejected" | null; source: "late" | "rmes" };

// cross-feature components (stub by T0, body by owner)
features/points/PointList.tsx        PointList({ points: PointVM[]; onOpen(id: string): void })            // T2
features/points/RaisePointDialog.tsx RaisePointDialog({ open; onClose; c: CaseVM; preset?: Partial<RaiseInput>; onRaised(id) }) // T2
features/points/createPoint.ts       createPoint(input: RaiseInput, c: CaseVM): Promise<{ instanceId }>    // T2 (T1's S5 alternative uses it)
features/rmes/RmesSummary.tsx        RmesSummary({ c: CaseVM; dept: "SAF" | "REG" })  read-only, no lock     // T2 (used by T3's approval screen)
features/notes/NotesPanel.tsx        NotesPanel({ c: CaseVM; linked?: { kind: string; key: string } })    // T3
features/audit/AuditTimeline.tsx     AuditTimeline({ events: AuditVM[]; dense?: boolean })                 // T3
features/review/LaneWorkspace.tsx    route component for #/review/lane/:caseId/:act (B_RMM included)       // T2
features/case/CaseDetail.tsx         route component (read-only without a held task)                      // T1
```

**`pages/TaskRouter.tsx` (T0)** maps `#/tasks/:flow/:instanceId/:act` to the workspace for the resolved step:

| Step | Goes to |
|---|---|
| Case S0–S8 except B_* and S6 | `#/cases/:id?task=` |
| `CASE_B_*` | `#/review/lane/…` |
| `CASE_S6` | `#/approvals/…` |
| `OPNT_*` | `#/points/:id?task=` |
| `CHRQ_S1` | `#/change-requests/:id?task=` |
| `CHRQ_B_*` | `#/assess/…` |
| unresolved | "open in Kissflow" |

## 13. Deferred, open questions, live checks

### 13.1 Not in tonight's MVP

- Questionnaire answers and documents (portal data through the sharing, K-14).
- The rule evaluator (the scope is manual) and BASIC answer validation at S2.
- The *staleness* check of section-review marks (the presence check is in, WB-D5).
- Raising "Additional part" points (flag `additionalPartRaise` off; never for reviewers) and the "Accepted – scope extended" CR outcome (flag `scopeExtendedOutcome` off).
- Reports and the dashboard charts.
- Reactivation prefill from snapshots.
- Assignment events.
- AI suggestions.
- `Final_PDF`.
- X, Y and Z integrations.
- The cancel cascade automation.
- The send-back fallbacks beyond `openForm`.
- F8 rows for manual supplier-side records.
- Deploy.
- The cross-tab lock beyond `navigator.locks`.

### 13.2 [unverified] items: Diagnostics answers them on the first live run after generate

| # | Item |
|---|---|
| 1 | App users' `AppRoles` carry the CIQ role names (`UI-LOG:L50`, `L104`) |
| 2 | Task rows: which key carries the step, and whether it is item-level or activity-level in Part 2; is `_activity_instance_id` present (`UI-LOG:L117`) |
| 3 | List rows carry all fields (`UI-LOG:L130`); admin rows carry `_status` (they carry no current step, `UI-LOG:L43`) |
| 4 | A list route for View members (K-14); live Dataform `getItems` |
| 5 | **K-WB:** a real user's `updateItem` after Start (`dec:L484`), and whether the SDK's 050313 lists the refused fields. The fallback is built |
| 6 | A real user's `sendbackItem`, and `openForm` inside an Application component: does it answer, hang, or unload the frame (`dec:L483`) |
| 7 | SDK `rejectItem` and `withdrawItem` (REST [verified] `SPIKES:L145-L146`) |
| 8 | Write shapes for User, Reference, Date and clears; the Form submit id |
| 9 | `getProgress` shape; `Table::<server child model id>` |
| 10 | Blank vs 0: a new case reads `Open_Items_Count` blank and `Hold_For_Open_Items` = "Yes" (`dec:L485`) |
| 11 | `getRoles` resolves for non-builder users in the Development account (`sdk.d.ts:L1297`; `master:L571`) |
| 12 | SDK child-row writes with client row `_id`s ([verified REST; SDK unverified], `SPIKES:L88-L91`, `L100-L101`) |
| 13 | Dataform `discardItem()`: its answer when there is no draft, and whether it also drops a draft the user started in the native form |
| 14 | Child-column formulas (`Criteria_Open_Num`) compute on a Form row |
| 15 | Whether a write naming a formula field is refused or ignored (the Workbench never sends one, WB-13) |

### 13.3 Open questions for Thomas, and the provisional defaults (WB-D…)

**Provisional defaults — Thomas to confirm.** Each is built so it can be changed in one place. Until Thomas answers, builders implement exactly the default.

| # | Default (provisional — Thomas to confirm) | Alternatives | Where |
|---|---|---|---|
| **WB-D1** | **Counts policy `fail-closed`.** A count that is not provably complete (any rung-3, index-only or failed read) is not written; the lane/hold/approval check stays blocked and the screen shows exactly what could not be read. Flag `countsPolicy` = `"attest"` (in the pinned release's Settings) lets the user attest with an F8 `count.attested` row and write the visible count. At S7 a partial refresh always clears the counts so S8 runs. **Consequence:** with `fail-closed` and no viewer route (K-14), only rung-1 users (Case Admin, Thomas) can sign off lanes and approve; real reviewers see the gap named | `attest` as default; a Workbench-written F8 "Open point" index; a flow-level grant for reviewers; accept that only Case Admins sign off lanes | §6.2, §7.9, §7.11, §8.8, §8.12 |
| **WB-D2** | `Responsible_User` of a raised point stays **the raiser**; after K-FA the raiser holds `OPNT_S1` and records the supplier's answer by hand (actions gated on task possession) | default `Responsible_User` to the case's `Owner_RMM` for supplier points | §5.3, §8.7, §8.9 |
| **WB-D3** | MVP cuts behind flags: "Additional part" never for reviewers and hidden for RMM until built; "Accepted – scope extended" hidden until built | build the RMM additional-part path (§8.9) and BR-053 tonight | §7.11, §8.6, §8.9 |
| **WB-D4** | **Case Admin lane repair** from the F8 `lane.completed` snapshot, through the admin route, allow-listed lane fields only, with an F8 `lane.repaired` row. An exception to "Case Admin only rejects; it writes no fields" (`brd:L835`) | an RMM override with a reason at S5; only the Department-review alternative | §7.10 |
| **WB-D5** | **Section-review marks are a client blocker** (presence per led section; staleness dropped while answers are unreadable) | informational only (one line in `gates.ts`) | §8.8 |
| **WB-D6** | **Retire** is a state-only patch on a Published F2 row (an accepted exception to BR-057) with an F8 `config.retire` row | a new superseding row per retirement | §8.13 |
| **WB-D7** | The F8 Cancellation row stays **before** the reject; the Z2 builder must also check the case status and skip when `case.cancel.failed` exists | write the row only after a successful reject and rely on the "Ended without cancellation event" tile | §7.7 |
| **WB-D8** | **Effective SAF/REG decision** = `Late_Decision` of the newest Accepted "Department review" point for that department, else `<D>_RMES_Decision` (`brd:L788`) | ignore late decisions (RMES decision only) | §8.12 |
| **WB-D9** | The Overall Approver gets a **read-only RMES summary**; ground rule 7 restricts only editing surfaces (EXP-HR3 governs native page bindings) | no RMES view for the approver | §0.3 rule 7, §8.12 |
| **WB-D10** | `Rule_Set_Version` = the pinned release's "Rule set" `<configKey>@<Version_Label>`, else `none (manual-wb-1)`; same value on F4 | leave a fixed literal | §4.6, §8.5 |
| **WB-D11** | **Untriaged CRs count** toward `Open_CR_Count` (linked by `Case_Code` + `Cycle_No`), stricter than R19 (`brd:L980`) | exclude untriaged CRs per R19 and label the count | §6.4, §7.9 |
| **WB-D12** | Manual supplier timestamps ("Supplier confirmed at", "Supplier released at") are required inputs **prefilled with now** and editable | no prefill (the user must type the time) | §8.5 |

**Other open questions:**
1. **Contact-id field formats** for X1 (comma-separated?). These need agreement with the portal session.
2. **Key conventions** in §4.6 that later reach the portal.
3. **`brd:L920`** (Return creates a new round *item*) is in PART D, which is superseded on structure (`brd:L613`); v4's one-item send-back (`brd:L246`) wins. This design follows v4.
4. **`Findings_State` values and `Criteria_Limit_Comparator`** (Q9). The MVP uses provisional "Open"/"Closed" and free text.

## 14. Revision log (night)

Both critiques (`WORKBENCH-DESIGN-CRITIQUES.json`) returned FIX-FIRST. Every issue is resolved below. **C1-*n*** = the first critique's *n*th issue, **C2-*n*** = the second's, in file order. Where a critic offered alternatives, the one taken is named; deviations from a critic's suggestion are marked "(deviation)".

| Issue | Severity | Resolution | Where |
|---|---|---|---|
| C1-1 Gate formulas treated as writable inputs | must-fix | Generator flags formula fields `computed`; they leave `perms` and go to `gates`; `isWritableAt`/`assertWritable` refuse them; `StepForm` and `KwbFallback` show them read-only; checked only before submit; tests (`assertWritable(CASE_B_SAF,["SAF_Gate"])` throws, `stepFormModel` for every step) | §0.3 r12, WB-13, §4.2–§4.5, §7.2, §7.3, §8.5 |
| C1-2 OPNT_S1 unreachable when a reviewer raises a supplier point | must-fix | Step actions gated on task possession (`heldTask`), not owner role; OPNT_S1 tasks listed for whoever holds them (My work / Review queue group); S1 panel for the holder; harness S36 (`kfa=on`, jo) | §0.3 r13, WB-14, §5.3, §8.1, §8.7, §8.9, §11.4 |
| C1-3 F8 rows edited by `createFormRow` re-apply | should-fix | `reapply: false` for F8; a `<code>.correction` row instead; a verified correction counts for the cancel flow; `audit.spec.ts` | §7.6, §7.7, §7.8 |
| C1-4 Withdraw at R_<D> leaves `Reviewed_*` blank; withdrawn-at-S1 dead end | should-fix | Withdraw sets `Reviewed_By/_Email/_At`; "Confirm withdrawal" only, when `OP_Outcome` is already Withdrawn; T2 tests; S21 extended | §8.9, §11.4 S21 |
| C1-5 CR↔case link undefined | should-fix | `crBelongsTo` (Case_Item_Id, or Case_Code + Cycle_No while blank) in bundle, `openCrCount`, `laneOpenCount`; untriaged CRs counted (WB-D11) | §6.4, §7.9, §8.6 |
| C1-6 "Complete" count undefined | should-fix | Confidence rule stated and unit-tested | WB-5, §6.2, §7.9 |
| C1-7 S7 partial refresh fails open | should-fix | Partial at S7 CLEARS both counts so S8 runs; message; S26b | §7.9, §8.5, §11.4 |
| C1-8 Approver can't read RMES; later decision ignored | should-fix | Read-only RMES summary; rule 7 narrowed; effective decision rule; tests; S25a/b | §0.3 r7, §8.11, §8.12, WB-D8, WB-D9 |
| C1-9 S5 dead end on a lost lane value | should-fix | Lane check passes with an Accepted Department-review point recorded in `Late_Completions_Text`; "Raise department review for D"; plus the Case Admin repair (C2-15); S40 | §8.5, §7.10 |
| C1-10 "Additional part" has no section path | should-fix | Never offered to reviewers; RMM only behind `additionalPartRaise` (off), with the F4/F3/`New_Section_Item_Key` path written down for when it is on; unit-tested | §7.11, §8.9, WB-D3 |
| C1-11 "Accepted – scope extended" offered without side effects | should-fix | Hidden behind `scopeExtendedOutcome` (off); unit test | §7.11, §8.6 |
| C1-12 Generic admin write target | should-fix | Target removed; only the allow-listed lane repair, with its own F8 row; guard on `updateAdminItem`. (deviation: the allow-list holds the lane fields for `lane.repair`, not "empty for CIQ_Case_A00", because C2-15 asks for exactly this repair) | WB-16, §4.2, §7.2, §7.10 |
| C1-13 S3 stamps "now" | should-fix | Required "Supplier confirmed at" input → both fields; labelled manual; harness checks the value | §8.5, S10 |
| C1-14 `Final_Release_At` optional; released test misses S8 | should-fix | "Supplier released at" required; released = `Final_Release_At` set, or at S8, or Completed after S7; CR4 on C8 at S8 in S27 | §8.5, §8.6, §11.3–§11.4 |
| C1-15 Failed Form create leaves the draft | should-fix | Settle on failure: look up by key, else `discardItem` and rethrow, failed discard surfaced; harness `formSubmit=fail` (S44) | §7.6 |
| C1-16 RMM lane count uses non-existent ids | should-fix | No CR term for RMM; `CR_DEPT_FIELDS` generated from FIELDS with a build guard; test | §4.2, §4.3, §7.9 |
| C1-17 Blocker 4 dropped | should-fix | Kept as a presence blocker per led section; only staleness dropped and labelled; provisional WB-D5 | §8.8 |
| C1-18 "Backend contract" citations | should-fix | All replaced by spec paths / `brd:` / `dec:` lines or tagged [unverified]/[convention]; note in §0.1 | §0.1, WB-10, §6.4, §7.5, §7.8, §7.9, §8.9, §13.3 |
| C1-19 `Rule_Set_Version` source | nice | Pinned release's rule set, else `none (manual-wb-1)`; same on F4 (WB-D10) | §4.6, §8.5 |
| C1-20 S7/S8 loose field lists | nice | Exact lists; every optional set built from `editableAt(step)` | §8.5 |
| C1-21 No required check for Form creates | nice | `requiredFormFields` checked before `createItem` | §7.6 |
| C1-22 OPNT_S1 due date | nice | `Supplier_Due_Date` for OPNT_S1, `Internal_Due_Date` for R_* | §8.1, §8.7 |
| C1-23 Case_Code/Request_Key pre-create | nice | `POST_CREATE_KEYS` exempt from the pre-create check, written at Start, full check before submit | §4.2, §7.6, §8.3 |
| C1-24 Citation slips (UI-LOG L48, SPIKES L75) | nice | `UI-LOG:L50`; SPIKES:L75 cited only for `ISBLANK`; v4's `""` on blank asserted | §5.2, §7.9, §11.1, §13.2 |
| C1-25 Retire edits a Published row; `Contacts_Portal_User_Id` source | nice | Retire = accepted exception with F8 row (WB-D6); `Contacts_Portal_User_Id` typed by RMM as given by Thomas, labelled manual | §4.6, §8.3, §8.13, §8.14 |
| C2-1 Rung-3 count confidence; harness contradicts | must-fix | Rung 3 / index-only = partial, always; WB-D1 default fail-closed with `attest` flag; S11/S12 split into rung-3, rung-1 and attest variants | WB-5, §6.2, §7.9, §11.4, §13.3 |
| C2-2 F8 edited after creation | must-fix | Create-only `writeAudit`; correction rows; guards; harness fails on `DATAFORM_UPDATE_ITEM` to F8 and on updates to Published F2 rows (Retire patch excepted) | §7.8, §10.2, §11.2 |
| C2-3 K-WB refusal tested at one step only | should-fix | Matrix run: every **M** scenario also with `kwb=refuse` | §11.2, §11.4 |
| C2-4 Return when the round write is refused | should-fix | Straight to the fallback with Rounds + header values; "already saved" only after a verified write; S18b | §7.5, §11.4 |
| C2-5 `openForm` can hang | should-fix | Button-only, bounded 8 s, sheet and My Tasks instruction always shown, `sessionStorage` keyed `_id|act`; modes `openForm=hang|refuse` (S37) | §7.4, §11.2 |
| C2-6 Write timeout frees the queue | should-fix | Item marked uncertain; further writes refused until Re-read or reload; S41 (`writeDelay` > timeout) | §6.1, §7.1, §7.2 |
| C2-7 Resolver can match the wrong lane | should-fix | Never a Parallel step; item-level keys only with a single open task; `block-unique`; K-WB marked only on activity-level evidence with a covering field list; `stepkey=block|first` (S35) | WB-6, WB-9, §6.3, §7.2 |
| C2-8 `getRoles` probe tagged [verified] | should-fix | Retagged [unverified]; lens only narrows and skips rung 1; S05 non-builder variant | WB-8, §5.4, §11.4 |
| C2-9 Admin rows lack the current step | should-fix | Per-item `getAdminItem` (pool 4) on rung 1; harness `adminStep=omit` default | §6.2, §6.4, §8.2, §11.2 |
| C2-10 Delete ban holes | should-fix | `adminDelete`/`formDelete` not copied; guards ban `deleteItem(` and the DELETE method everywhere; harness fails on any `*_DELETE_ITEM` or DELETE call; own-draft discard allowed | §0.3 r9, §6.1, §10.2, §11.2 |
| C2-11 Stale per-user draft | should-fix | `discardItem()` before every Form create; `drafts=sticky` (S44) | §7.6, §11.2 |
| C2-12 RMES child formula blank fails open; one-write save | should-fix | Blank applicable `Criteria_Open_Num` counts 1; two-phase save; `childFormula=off` (S43) | §7.9, §8.11 |
| C2-13 Process create payload not verified | should-fix | Full payload compared at Start; missing fields re-applied via `updateItem` at Start | §7.6 |
| C2-14 Pre-create Mandatory check can't pass | should-fix | Same as C1-23 | §7.6, §8.3 |
| C2-15 Lost lane value after submit, no repair | should-fix | F8 `lane.completed` snapshot after each lane submit; allow-listed Case Admin repair with `lane.repaired`; S39 | §7.3, §7.10 |
| C2-16 Admin target scope | should-fix | Same as C1-12; harness refuses admin writes without flow Admin and fails outside S39 | §7.10, §11.2 |
| C2-17 SDK child writes tagged [verified] | should-fix | Retagged [verified REST; SDK unverified]; natural-key matching; `childIds=server` (S42) | §7.2, §7.6, §13.2 |
| C2-18 No foundation owner in the parallel phase | should-fix | T0 stays on duty; `FOUNDATION-REQUESTS.md`; shared `schema/formulaSamples.ts` | §3, §12 |
| C2-19 Paging proven only in a stretch scenario | should-fix | S33 promoted to P1 with `multiAct` across a page boundary | §11.2, §11.4 |
| C2-20 Real-person fixture names | nice | The QM and Overall Approver fixtures now use invented names ("Tove Marsh", "Wren Ashdown"); all e-mails `@example.test`; fixtures get short ids | §0.3 r11, §11.3 |
| C2-21 Wrong container not enforced in writes | nice | `writeQueue` refuses everything; S38 (`appId=CIQ_Supplier_Portal_A00`) | §5.1, §7.1 |
| C2-22 `toISOString` guard undecidable | nice | `kfDateTime` moved to `normalize.ts`; `toISOString(` banned elsewhere; ms check on child rows | §6.1, §6.6, §10.2, §11.2 |
| C2-23 Shared type-check/test runs | nice | `tsconfig.workbench.json`, `vitest.workbench.config.ts`, `.spec` suffix, new scripts; one exclude line in `tsconfig.json` (needed: it includes all of `src`); README records it and the `kfsdk.d.ts` dependency | §3, §10.1 |
| C2-24 Cancellation row before reject vs Z2 | nice | Row stays first; hand-off note for the Z2 builder (WB-D7) | §7.7 |
| C2-25 Diagnostics copy brings real people | nice | Names and e-mails redacted by default | §9 |
| C2-26 Post-submit reads impossible for non-admins | nice | Expected note for rung 3; "moved out of your queue" on Re-read = submitted in Kissflow; S12b/S18a expect it | §6.2, §7.4, §7.5, §11.4 |
| C2-27 Minor citations; `navigator.locks` | nice | `UI-LOG:L50`; `SPIKES:L100-L101` next to `Table::<spec id>`; locks in try/catch with the in-memory fallback | §4.4, §5.2, §7.1 |

**Also changed for consistency:** the stub contracts (§12.2) gained `heldTask`, `reReadPending`, `repairLane`, `crBelongsTo`, `effectiveDecision` and `RmesSummary` (T2-owned, used by T3); task estimates grew by about 2.5 h in total; scenario numbers S35–S44 are new.
