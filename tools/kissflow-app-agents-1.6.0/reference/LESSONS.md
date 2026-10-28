# kf-author — Field Lessons (READ FIRST)

Hard-won operational knowledge that is **not** fully enforceable by the engine/validators. Agents
must apply these; the verifier catches what it can, but these prevent the mistakes up front.
Ordered by how often they bite.

## 1. Type Form vs Process UPFRONT — conversion is destructive
A **Form** cannot gain a workflow later. If a flow has any approval / review / multi-actor lifecycle,
type it `flowType: "Process"` from the start. Converting a published Form → Process means **delete +
recreate** (`DELETE /flow/2/{acct}/form/{id}?_application_id={app}` works → then create as `process`),
which loses the flow's data and re-wires every reference to it. Decide once, in `kf-architect`.

## 1b. A PUBLISHED process is IMMUTABLE over REST — get it right before publish
Once a process is published you CANNOT change it via the API: `PUT …/process/{id}/draft` → **403**,
and `DELETE …/process/{id}` is a **no-op** (the flow survives). So a process's fields, formulas,
aggregates, lookups, and workflow must ALL be baked in before the first publish. There is no in-place
path to change a published process — rebuild the whole app fresh (a new app) with everything correct.
Corollaries:
- **Forms ARE editable** (`PUT …/form/{id}/draft` works) — retrofit forms freely; only processes freeze.
- **CORRECTED 2026-07-04: process formulas do NOT strip.** Kissflow never drops a valid `Expression`
  on publish (confirmed by the platform owner + live-verified: child-table column formulas working on
  a published process). The old "stripping" observation came from our early malformed/empty Expression
  ASTs. Author computed fields on forms, processes, and child-table columns normally — compileFormula
  emits the verified shape. `QueryDefinition`-based fields (references / lookups / aggregates) also
  survive, as always.
- **Flow DELETE is async**: it returns OK but the name stays reserved briefly — an immediate re-create
  hits `FlowNameAlreadyExists`. Wait/retry before recreating.

## 2. Never author a `Name` field
`Name` is a Kissflow system field (auto-created). Authoring one is rejected
(`SYSTEM_FIELD_AUTHORED`). Use a specific label: `Vendor Name`, `Member Name`, `Party Name`.

## 3. Formulas are the full Kissflow grammar — but only for in-form math
`computed`/`formula` accepts the whole grammar (verified vs real exports + the engine's function
library): infix `+ - * /`, comparison `= < > >= <= !=`, parentheses/precedence, `"string literals"`,
and **named functions** — `IF(cond, a, b)`, `CONCATENATE(...)`, `ROUND(x, n)`,
`DATEDIFF(d1, d2, "Month")`, `SUM(...)`, `ISBLANK(...)`, etc. (60+, categorised
String/Number/Date/Currency/Logical). Operators are stored as the symbol (`Value:"*"`, the engine
resolves `*`→MULOPER); functions as `Value:"IF"` + `Category`. Operands are field **names or ids**
(resolved within the field's own model, so child-table formulas bind to their own columns). Examples:
`Land_area * SQM_price`, `Contract_Amount * Down_Payment / 100`,
`(FV_per_unit - Contribution) / Contribution * 100`, `IF(Completion_rate >= 100, "Done", "Open")`.
DO NOT formula-ize **cross-flow or GP-sourced** values (NAV roll-ups, budget actuals, fund cash) —
those are integration/workflow logic, not field expressions; leave them plain.

## 3b. Rich lookups & aggregate fields
- **EVERY reference IS a lookup — there is no separate "reference" concept in Kissflow.** A
  `type:"Reference"` field with NO `lookup` array is still a lookup; it just fetches ONE value: the
  target's **display field** (e.g. `SPV.Fund` shows the fund's name). The link + the display value
  always work without any `lookup` config. The `lookup` array only adds **more columns** on top of
  that default one. So don't think "reference vs lookup" (two things) — think "single-field lookup
  (default) vs multi-field lookup". Corollary: an IR "lookup count" that only tallies fields with an
  explicit `lookup:[]` UNDERCOUNTS — every `ref` field is already a functioning lookup. When a
  reference should surface more than the name (list rows, dashboards, transactions needing the
  target's attributes inline), CONFIGURE `lookup` with those extra fields; otherwise the bare
  reference (name only) is correct and complete.
- **Lookup** (`Field::QueryDefinition`): a Reference field pulls columns from its target. It can pull
  MANY (`LookupField:[{Id,Name,Type}]`) and `AutoFill:true` copies them into this form's own fields
  — that's the deck's "enter Vendor ID → auto-fill Name/Bank/IBAN". IR: `reference` field +
  `lookup:[{name,type},…], autofill:true, sortBy, filter`. ⚠️ The engine's *default* lookup picks the
  target's first field — wrong for a back-referencing child (Third Parties' first field is its own
  `Fund` link). Specify `lookup` explicitly with a real display field first.
- **Aggregate** (field ReadOnly + Widget "Aggregation", QD via `Field::QueryDefinition`, AggregateType title-case e.g. "Sum"): total/count a child table. IR:
  `{ type:"Currency"|"Number", aggregate:{ fn:"SUM|COUNT|AVG|MIN|MAX|UNIQUE_COUNT",
  over:"<child-table form>", field:"<column>" } }` → emits `{AggregateType, AggregateField, LHSModel}`
  + widget "Aggregation". NOT a formula (formulas are per-row; aggregates sum across child rows).

## 4. Child tables may reuse field names freely
Two child tables under one parent can both have `Vendor ID` / `Amount` / `date`. The engine
namespaces colliding child-field ids automatically (else one's QueryDefinition is orphaned). Keep
the human label identical; the engine makes the internal ids unique.

## 5. Avoid account-global master names
Generic names — `Currency`, `Project`, `Country`, `Status` — collide across the **whole account**
(`FlowNameAlreadyExists`) and leave their referrers dangling (unpublishable). Prefix app masters
(`<App> Currency`) or deliberately reuse a shared dataset. NOTE: the client only auto-reuses a
colliding flow when `/flow/explore` surfaces it by exact name — large accounts may not surface every
flow, so the reuse can silently miss. Prefixing is the safe default.

## 6. The "role sees nothing" trifecta
A role only experiences its app when **all three** exist: (a) role `Preference`
{DefaultPage, DefaultNavigation}, (b) a nav `SubMenu.VisibleTo` entry, (c) flow/report member access.
Miss one → blank screen. `applyIR` wires all three; if you fix up by hand, do all three.

## 7. Child-table columns need per-step permissions
In a process, a child-table (Type:Model) column with no `Activity::Permission` is **hidden in the
form**. `addWorkflow` grants child-table columns step permissions alongside field columns — keep that.

## 8. Build order (large apps), each step gated by `kf-verifier`
roles → masters/lists → data models + child tables → **formulas** → workflows (processes) →
permissions → nav/pages. Referenced models precede referencers. Build into drafts, dry-run, show the
plan; never auto-publish to prod.

## 9. Apply is resilient but not idempotent on the app shell
`applyIR` retries + never-throws per call, and reuses existing flows/roles by name. But re-running it
aborts on an existing **app name** (`createApp`). So post-apply fixups (a failed flow, a renamed
master, a Form→Process conversion) are **surgical** — create/patch the specific flows + republish,
don't re-run the whole apply.
- **`/flow/2/{acct}/explore` is account-wide + eventually-consistent.** It lists EVERY app's flows
  (so other apps' "Contract"/"Vendor"/"Currency" collide by name) and lags after create/delete.
  NEVER decide "does this flow exist in my app?" by name-matching explore — check by **exact id** via
  `GET …/{type}/{genId}/draft` (404 = gone). Build the ref remap from explore by name only with care;
  a generic master name can map you to a *different app's* flow.

## 10. The validators ARE the memory — run `engine verify` before every apply
`SYSTEM_FIELD_AUTHORED · DANGLING_REF · ORPHAN_ENTITY · REF_NO_QUERYDEF · UNREACHABLE_STATUS ·
NO_TERMINAL_STATUS · UNKNOWN_FIELD_TYPE …` gate the build. A clean `0 errors` build is the contract;
warnings are findings to resolve, not ignore.

## 11. Step conditions are FORMULAS on the activity [tier:owner-confirmed]
A workflow step condition is `Activity::Expression` → an **Expression/Node AST**, the same shape as
a field formula re-scoped Field→Activity. It is **NOT** a Criteria/Condition — that shape exists only
for reference/query filters and integration IfActions. Equality in the formula is `=`, not `==`.

## 12. Parallel branches: `Parallel` NodeType + nested branch ProcessDefs [tier:golden-verified]
Parallel branches are a **`Parallel` NodeType activity** whose `Activity::ProcessDef:[…]` forks into
nested branch ProcessDefs; the branches **auto-join** (no explicit join activity). Golden source:
`Vashi_Setup_Operations` export.

## 13. Conditions AND parallel branches are first-class (UPDATED 2026-07-14, twice)
`addWorkflow` now compiles BOTH non-linear shapes directly from the IR, surviving rebuilds:
- `steps[].condition` ("Amount > 500000") → the §11 Activity::Expression AST (STEP_CONDITION_* checks)
- `steps[].branches: [{name, steps:[…]}, …]` → the §12 golden Parallel shape (NodeType:"Parallel"
  activity, one MINIMAL branch ProcessDef per arm — {Id, Kind, Name, Activity}, no WorkflowType/Model
  — ordinary UserTasks inside incl. conditions; auto-join at the next sibling). STEP_BRANCHES_* checks.
**Multiple terminals are a NON-REQUIREMENT [tier:owner-confirmed 2026-07-14]:** reject / send-back
(with the native mandatory-comment prompt) are DEFAULT features on every step — never model explicit
"Rejected" steps or a second terminal; a rejected item routes back natively. E3 is fully closed:
conditions + parallel are first-class IR, and rejection was never missing.
**For ANY change to a LIVE app, reach for `engine/patch.mjs` FIRST** — named graft primitives
(branch — the CEO/Council pattern in ONE command, else-arm auto-negated, roles auto-created · parallel — N simultaneous arms, auto-join · condition · add-step · step-permission · add-field incl. Reference/Select · field-type · list-items · add-role · grant)
that wrap getDraft→mutate→publish in one command, with the derived knowledge (per-step permissions
for new columns, AST re-scoping, 423 retries) encoded once. After patching, mirror the change into
the IR so a rebuild keeps it.

## 14. Native Decision Tables are plan-gated → dataform Approval Matrix
Creating a native Decision Table returns `403 YourPlanNotSupport`. Model decision logic as a
dataform **"Approval Matrix"** + a lookup on the process form + branch step-conditions (§11) reading
the looked-up values.

## 15. List items ARE writable — via the runtime save-items handler (CORRECTED 2026-07-14)
**The old claim "the list-data API is closed (403)" was FALSE** — a suspicion-check casualty caught
live (soorya, Inventory build): the failing shapes were wrong, not the platform. The writer is
`POST /flow/2/{acct}/list/{listId}/items` with `{"ListItems": ["Each","Box",…]}` — an OBJECT wrapping
a string array; it REPLACES the full set. Failing shapes: top-level array → 403 `TypeMissMatchError`;
`{Name:…}`/`{Value:…}` → 400 Unknown field; the `/metadata/…/draft` path → 404 (lists don't use
draft/publish); `PUT …/items` → 404 (GET reads there, POST writes).
`applyIR` PASS 1b now publishes every list artifact's `ListItems` automatically — required Selects
are satisfiable again, and List-backed Selects are a legitimate design choice. (Two residual truths:
a Select whose backing list is EMPTY still renders blank and silently drops non-matching values on
create — so ensure the list is populated; and seed data must use the list's exact item strings.)

## 16. Edit apps IN PLACE — never a new app per change [tier:owner-confirmed]
Duplicate published apps can't be REST-deleted (§ owner Q6) — every throwaway app is permanent.
Technique: per flow, `getDraft → graft → putDraft → publish`, and reuse `applyIR` for
pages/permissions/nav.
- **423 grant-lock**: member/report grants intermittently return `423` during publish; re-issuing
  after a moment → 200. Always finish an apply with a **re-grant pass**.
- **Cross-model reference filters are UI-fragile**: a child-table reference whose filter compares
  against a PARENT-model field is valid server-side but crashes the builder's delete cascade
  (`reading 'Field::Node'` in LowcodeProcessModel) — the table becomes undeletable from the UI and
  the delete must be done via the draft API. `checkHygiene` warns (CROSS_MODEL_REF_FILTER); prefer
  child-local filter fields. Every live-patch write is now gated on `checkHygiene` (withDraft
  refuses to PUT a draft with duplicate step-perms or stale Column::Permission back-refs).
- **API patches must UPDATE step Permissions in place, never append** — the metadata API happily
  accepts a second Permission entity for the same (Activity, Column), same class of bug as duplicate
  role names. Duplicates break the builder's column-keyed model: table/field DELETE then fails with
  an opaque error (Store_Launch_A00, 2026-07-17: 14 injected dupes on the Start step blocked
  deleting the Site Info table). When deduping, also clean the `Column::Permission` BACK-REFS —
  Permission entities are referenced from both Activity::Permission and Column::Permission; leaving
  a dangling Column ref makes publish 500 MetadataError. checkStructural catches this offline.
- **SequenceNumber needs Padding AND a PrefixExpression chain** — Prefix is MANDATORY in the
  editor. Padding alone produces a half-built field (loads, but the sequence editor/engine chokes;
  diagnosed vs a working Application_Number export 2026-07-17). Chain: Property(Name:
  "PrefixExpression", ValueType:"Expression") → Expression(ExpressionStr = QUOTED literal) →
  Node(Type:"Static", Value = raw string) — the two prefix copies must stay in sync. The field is
  server-assigned: seed data can never write it (keep legacy numbers in a separate Text field).
- **Process member grants need `Permission:["InitiateItems"]`** (golden: Disclosure_Reports /
  Customer_Fee SharedWith). `[]` attaches the role but leaves it unable to raise items — runtime
  submit 403s (KISSFLOW_ERROR_050302) even with users in the role (runtime QA 2026-07-17;
  flowGrant + page-driven grants fixed). Read-only process access = `["View"]`.
- **Step-level field/section/table states**: each step Activity carries one Permission per
  field/child-table column (Editable@Start, ReadOnly after). `field_permissions` keys accept field,
  SECTION or child-table names — a section override emits the Section column's own Permission
  (golden-verified) and cascades to its member fields; an explicit field key wins over its section.

## 17. Don't infer "impossible" from absence in a sample
Step-conditions (§11) and parallel branches (§12) were wrongly called impossible because the sampled
apps simply didn't use them. Before authoring (or ruling out) a feature, find a flow that USES it or
read the golden export. This is the IMPOSSIBILITY QUARANTINE rule (MEMORY.md) in practice.

## 18. Editable-on-a-Process silently includes InitiateItems — no narrower grant exists
`flowGrant` (client.mjs) gives every role declared `Editable` on a Process `Permission:["InitiateItems"]`
— there is no "can act on my assigned step, cannot raise new items" option. A StartEvent activity also
carries no `Activity::Resource`/actor restriction (only UserTask steps do) — so nothing narrows who may
submit it either. Combined with `NAV_GRANT_ESCALATION` (which hard-blocks declaring a role ReadOnly if
it has ANY nav-reachable page card on that flow), any reviewer role that needs a page to see/act on its
own workflow step is FORCED into Editable, and therefore into InitiateItems too — every reviewer role on
a multi-step approval Process becomes a co-initiator, by construction, not by design choice. Design
review must name this trade-off explicitly (who ELSE besides the intended initiator can now raise items)
rather than assume `permissions[]`'s single-initiator intent is enforced. [tier:kf-verifier finding,
trade-promotion-management, 2026-08-04 — code-verified; live-runtime exploitability unconfirmed]

## Runtime (kf-framework UI) — REST surface, for the UI phase
Process list is REST-listable only via `/process/2/{acct}/{id}/myitems` (other builder views →
404); add `&_response_type=full` to get status/stage/dates. Business-field values for processes
render only inside the Kissflow runtime (the integration key sees a sparse projection). The custom
React UI composes dashboards by **GQM** (role intent → metrics) + **Kimball** (each flow = a star:
instances=facts, amount=measure, Reference/Select=dimensions, date=time axis).
