# kf-author — Agent Memory (AUTO-EVOLVING)

The plugin's **cross-run working memory**. This is the fast-moving log; durable, universally-true
lessons get **promoted** into `reference/LESSONS.md` (the curated knowledge base, ALWAYS-READ by
every agent). Superseded entries and resolved sagas live in `MEMORY-ARCHIVE.md` — never deleted,
resurrectable.

## How every agent uses this
- **RECALL first (specialists)** — pull only what THIS task needs:
  `node engine/memory.mjs recall "<one-line brief of your task>"` returns the top-K relevant
  entries (control-plane proxy → shared pool → local embedding rank over MEMORY.md+MEMORY-LOCAL.md).
  Recalled entries override defaults exactly like read ones. The four JUDGMENT GATES
  (kf-architect, kf-verifier, kf-coherence-critic, kf-reconciler) still read this file IN FULL —
  gates can't afford a recall miss. If recall errors, read the file directly.
- **WRITE on learning** — the moment you hit a non-obvious gotcha, the user corrects you, or you
  confirm a build rule future runs need, **append one line**:
  `- <today's date> [global|app:<id>|agent:<name>] <lesson, imperative, one line>`
  (use the date from your context). Keep it terse.
- **CONSOLIDATE** — merge duplicates; move entries later proven wrong to MEMORY-ARCHIVE.md with a
  note naming what superseded them.
- **PROMOTE** — when an entry is durable + universal, move it into `reference/LESSONS.md` and leave a
  one-line pointer here.
- **DECAY** — memory ages out so agents stop paying attention tax on stale entries: `[app:*]`
  after 90 days, `[agent:*]` after 240, `[global]` + promoted stubs after 365 — measured from the
  NEWEST date in the entry. Re-verified a fact live? Append `(reaffirmed YYYY-MM-DD)` to reset its
  clock. Run `node engine/memory.mjs decay MEMORY.md` (use `--dry-run` to preview; `stats` for an
  age profile). Expired entries move to MEMORY-ARCHIVE.md.


## RECORDING RULES — Trustworthy Memory, Phase 1 (2026-07-04)
Beliefs earn authority; they don't get it for free. When writing an entry:
- **Separate OBSERVATION from INTERPRETATION.** First record what actually happened — what was
  sent, what came back, which engine version was in the path. Then the claim, as a labeled
  inference with a tier tag: `[tier:observed-once|reproduced|golden-verified|owner-confirmed]`.
  Observations cannot rot; interpretations can and do (see the retired §1b "formula stripping").
- **SELF-SUSPICION RULE (mandatory for platform-limit claims).** Before recording "the platform
  can't/doesn't X", run the control experiment: does the builder UI or a golden export succeed
  where our API call failed? If yes → the class is ENGINE-DEFECT, not platform-limit. This rule
  would have prevented DEF-4, R7, §1b, and §15.
- **IMPOSSIBILITY QUARANTINE.** Claims of the form "X is impossible/unsupported" silently degrade
  every future design and no error ever points at them. Tag them `[impossibility]`, add them to
  CONFIRM-QUEUE.md, and treat them as challengeable until `[tier:owner-confirmed]`. Any design
  decision that relies on one MUST say so in decisions.md (the review page surfaces these).
- **Cite lesson ids in decisions** (R7-style) — citations are what make contradiction propagate.
- **FEDERATION.** This MEMORY.md is the CANONICAL memory — it ships with the plugin and is
  REPLACED on plugin updates. Instance-specific learning goes to **MEMORY-LOCAL.md** (agents READ
  both, WRITE local only). Share what you learned: `node engine/memory.mjs contribute` extracts the
  global/agent-scoped slice (never [app:*] project knowledge) as MEMORY-CONTRIBUTION.md — submit it
  to the plugin repo; the platform owner reviews and merges. [impossibility] claims from the field
  enter CONFIRM-QUEUE.md as PENDING — they never self-promote.
- **RECALL (shared pool).** With a connected control plane (or `MEM0_BASE_URL`/`KF_MEM_STORE`), the
  memory is a central org-partitioned pool and recall hits it first; writes go through the curation
  gate (`memory-remote.mjs` → accept/queue/local). With neither, recall ranks this file locally —
  same instruction, degrading gracefully. `/author-brief` should recall against the BRD's one-line
  summary before planning.

## Entries
- 2026-06-30 [global] Flow DELETE is async — wait/retry before recreating, else `FlowNameAlreadyExists`. → LESSONS §1b
- 2026-06-30 [global] `/flow/explore` is account-wide + eventually-consistent — check flow existence by
  EXACT id (`getDraft` 404), never by name (other apps' flows collide). → LESSONS §9
- 2026-06-30 [global] Avoid account-global master names (Currency, Project, Country) — they collide
  app-wide and dangle referrers; prefix them (applyIR PASS-1 auto-retries with an app-prefixed name
  as a backstop). → LESSONS §5
- 2026-06-30 [global] Formulas accept the FULL grammar (named functions IF/CONCATENATE/ROUND/DATEDIFF,
  comparison ops, strings, parens), not just arithmetic. → LESSONS §3
- 2026-06-30 [global] Aggregate field = ReadOnly + Widget "Aggregation" + QD via **Field::QueryDefinition**
  {LHSModel, FlowType, AggregateField, AggregateType title-case}; wrong shape → FieldValidationException.
  EMBEDDED child-table aggregates also REQUIRE LHSRootModel (parent model id) + the PARENT's FlowType +
  AggregateField even for Count — missing any → publish 500 QueryDefinitionValidationException. → LESSONS §3b
- 2026-06-30 [global] Pages of only kpi/chart/list cards are VIEW-ONLY — a requester page needs an
  `action` card ({view:"action", source_flow}), which emits a worklist whose native "+ New" opens the
  create form as a popup (never an always-open FormView). → LESSONS §3b
- 2026-06-30 [global] Per flow INCLUDING data forms, derive who may INITIATE (→ create action) vs who may
  only ACCESS (→ read worklist) and gate pages by it; every data form needs a page+nav home — never
  orphan one. → kf-security-designer/kf-experience-designer
- 2026-07-01 [global] EVERY reference IS a lookup — a bare `type:"Reference"` already fetches the target's
  display field; the `lookup` array only adds MORE columns. Configure `lookup` when a screen needs the
  target's other attributes inline. → LESSONS §3b
- 2026-07-02 [global] Prototyping is TWO agents: **kf-ux-architect** (per-role IA + curated RICH widgets
  derived from each role's jobs — no template dashboards, roles get genuinely different first screens) →
  experience-spec.json; **kf-prototype-builder** (self-contained clickable prototype driven by ONE
  coherent deterministic seed dataset — same records across every widget; never random filler, never
  empty widgets). Widget vocabulary in reference/EXPERIENCE-SPEC.md.
- 2026-07-02 [global] NATIVE-PAGES rules (from live-verified fixes): buildPage card verbs are
  `kpi|list|chart|action` ONLY (a chart card needs a real `filter.groupBy` or it's dropped); each
  PROCESS flow needs its OWN worklist page with its submenu stitched to THAT page (never all menus →
  one role home); the create affordance is the `action` card's Button→Popup→FormView (`showform` does
  nothing).
- 2026-07-02 [global] Flow-type CLASSIFICATION (owner's rule): PROCESS = structured, system-routed
  steps/approvals. BOARD (Kissflow Case) = data object with UNSTRUCTURED user-moved statuses — todos,
  tasks, projects, AND case use-cases (service requests, support, onboarding). FORM = no workflow.
  LIST = reference options. Emit Boards for unstructured/case entities. → reference/PROCESS-VS-BOARD.md
- 2026-07-02 [global] Boards + Kanban pages are CODIFIED: builders.mjs `buildBoard` + `buildKanbanPage`;
  board-live.mjs `applyBoardLive` (case shell→form→steps→Kanban caseview→**grantCaseMembers**) +
  `applyKanbanPage`. Page component flow-binding lives in the component-CONTAINER's
  Container::FieldMapping (Data is display-only); current kanban manifest is "Kanban"/"view/kanban"/
  category:"view" (the old "CaseViewKanban" renders "board view not found"); an API-created case has
  ZERO members until granted (→ blank board). Full recipe + every gotcha:
  reference/BOARD-AND-KANBAN-PAGE.md — read THAT before touching boards/pages.
- 2026-07-02 [global] `/add-flow "<ask>"` adds ONE flow to an existing app via the FULL agent pipeline
  (never a one-agent shortcut); `/add-board` = board specialization. → commands/add-flow.md
- 2026-07-02 [global] AUTONOMY DEFAULT — from the requirement (+ imported app) INFER intent and
  AUTO-INVOKE exactly the agents it needs, canonical order, verifier-gated; never make the user drive
  the pipeline. Signals→agents mapping in commands/add-flow.md; STOP only for a truly BLOCKING
  ambiguity (record assumptions in open-questions.md).
- 2026-07-03 [global] INTEGRATION AUTHORING final state [supersedes the 07-02 probe saga — raw history
  in MEMORY-ARCHIVE.md]: create + draft-map + PUBLISH all work with a standard public key via the
  SERVER-RESOLVED 2-pass (`applyIntegrationResolved`: create + PUT skeleton carrying process_id →
  `GET …/{intId}/action/{actionEntityId}/fields` → rebuild FieldMappings in GOLDEN shape from the
  resolver's schema → PUT full → publish). Hand-crafted FMs FAIL — the resolver supplies
  FieldId/Label/IsRequired/IsDropdown/SelectedDropdown + system-field ids. Connections are SELF-SERVE
  (`POST …/connection/{connectorId}/{ver}/SystemApiKey`). ONLY activation (turn_on) + email-connection
  provisioning need Integration-Admin — integrations ship IsActive:false BY DESIGN; a human activates
  in the builder (re-verified 2026-07-14: the old on|off routes now 404; IsActive is not writable).
- 2026-07-03 [global] Integration Action entity `Type` is ALWAYS "Create" (Connector.ActionId
  distinguishes update vs create). CREATE stitches map fully+cleanly; UPDATE needs a record-locator
  `_id` from `automation.action.key_field` (a source ref holding the target instance id) else flag
  `_unresolved`; an Object-typed ref key_field needs a one-time `._id` narrowing in builder
  Smart-mapping before turn-on.
- 2026-07-03 [global] Engine integrations = EXACTLY 1 Trigger + 1 Action; item-level trigger events ONLY
  (no field-change trigger [tier:owner-confirmed Q4]); field_map = source-field copy or quoted literal
  (no arithmetic/increment); no per-child-row iteration, multi-create, or child-row updates — design
  aggregates/Count fields or pull-model surfaces (scoped ledger views) instead of edit-stitches/counters.
- 2026-07-03 [global] `type:'notify'` stitches route to Email connector + SendEmail natively
  (resolveSkeleton + both apply paths; To/Subject/Body stay builder-mapped) — no shim needed.
- 2026-07-03 [global] Reference-field `filter` intent is SILENTLY DROPPED by the builders (enrichLookup =
  autofill/sortBy only) — never rely on data-side reference filters for gates. (Reference QDs DO emit
  the target's TRUE FlowType now — R15.)
- 2026-07-03 [global] Selects ALWAYS materialize a backing List at build ("inline options" impossible) —
  author explicit app-prefixed lists, and populate them (§15).
- 2026-07-03 [global] `data_model.views` are design intent consumed by NOTHING; page cards filter by
  status|groupBy only. No conditional-required primitive exists [tier:owner-confirmed Q2] — cover
  mandatory comments via the native Reject/Send-back prompt; step-level `Mandatory` is UNCONDITIONAL
  at that step (avoid on Booleans).
- 2026-07-03 [global] addWorkflow: steps take `field_permissions` {field|child-table:
  Editable|ReadOnly|Hidden|Mandatory} (R11). StartEvent defaults ALL fields Editable — ALWAYS override
  approver/outcome fields to ReadOnly at Start (else the initiator can pre-fill decisions); `actor` on
  Start/EndEvent is ignored (initiator = whoever creates); ALWAYS append a terminal "End" marker step —
  the LAST step becomes a no-assignee EndEvent, so the last actionable step must not be final.
- 2026-07-03 [global] Live permission semantics: an ir.permissions entry = flow membership + report View
  on ALL items (data_scope is view-convention, not row security — but see Q3: real row scoping exists,
  engine hasn't learned the shape). Forms/Case: Editable→Member+[Delete], ReadOnly→Viewer; PROCESS: ANY
  entry = Member+Initiate (no read-only process membership — gate "+ New" at the experience layer).
  `fields[]` on FlowPermission is artifact-only (never applied live).
- 2026-07-03 [global] PAGE-DRIVEN AUTO-GRANT TRAP: applying pages grants the page's role membership +
  report View on EVERY flow its cards/nav reference — and ESCALATES form viewers to EDIT
  (Member+[Delete]). A view-gated role must have ZERO cards/nav sourcing the gated flow on any surface;
  read-only form access = explicit Viewer entry + native views. Process cards only add the known
  Member+Initiate.
- 2026-07-03 [global] Nav submenus target PAGES ONLY (no Flow/Report Property type) — "nav→report"
  intents need a pointer page. PERSONA_NO_LANDING matcher compares page.role to persona name with NO
  persona→role mapping — false-positives when names differ; check landings manually.
- 2026-07-03 [global] buildPage has NO Case component — never put a Board/Case card on an ir.pages page
  (a board's page = applyKanbanPage at apply + hand-wired nav). buildPage KPI cards are STATIC (no data
  binding, no live counts) — omit `source_flow` on them; never promise live KPI numbers.
- 2026-07-03 [global] ensureExperience auto-adds a worklist page per Process flow unless a non-landing
  page named EXACTLY like the flow exists — name each flow's page exactly as the flow; flag role
  dashboards `landing:true`.
- 2026-07-03 [global] App/flow `Description` > 250 chars → bare HTTP 413; clampDesc truncates at a word
  boundary — keep IR descriptions ≤250 or accept the "…".
- 2026-07-03 [global] Case members are Role Member|Viewer|Admin with `Permission:[]` ONLY (["Delete"] →
  UnsupportedPermissionError — the form-style payload is wrong for cases). Route boards through
  applyBoardLive with a real idmap+flowTypes — `{}` leaves unresolved gen ids (Reference QDs, Select
  ReferredList) → opaque MetadataError 500 on publish (diagnose by field-bisection).
- 2026-07-03 [global] TIMELINE instrumentation: engine auto-stamps validate/verify/build/apply (set
  `KF_ACTOR=<agent>`); agents bracket long work with `node engine/timeline.mjs start|end "<agent>"
  "<step>" --run <runDir>`; `report` prints per-actor durations. Try/catch-silent — can never break a
  build.
- 2026-07-04 [global] Apply is PARALLELIZED (shells 5-wide, draft+publish 4-wide, grants 5-wide +
  report-list cache; P2P: 90s → 47s). PASS-1→PASS-2 barrier retained (remap needs all server ids).
- 2026-07-04 [global] Published apps cannot be archived/deleted via the public API
  [tier:owner-confirmed Q6] — throwaway/benchmark apps on shared accounts are PERMANENT; create them
  rarely and name them unmistakably.
- 2026-07-04 [global] CROSS-FLOW per-item aggregation IS expressible (R7 superseded, live-verified P2P +
  ITAM golden): QD {LHSModel:<target flow>, LHSModelApplicationId, FlowType:<target's type>,
  AggregateField, AggregateType, QueryDefinition::Criteria→Condition {LHSField:<target's ref field>,
  EQUAL_TO, RHSType:Field, RHSField:"_id"}} — NO LHSRootModel (embedded-child only). Engine:
  `f.aggregate.match={field,equals?}`.
- 2026-07-04 [global] Embedded child tables are FIRST-CLASS (DEF-4 solved: addChildTable declares the
  child on the parent via **Model::Model**; live-verified with working LHSRootModel aggregates).
  Runtime check: `/process/2/{acc}/{id}/allfields` returns {"<flowId>": {Tables:[…]}} — keyed by flow
  id, not top-level.
- 2026-07-04 [global] "Process formulas strip on publish" is FALSE — retired [tier:owner-confirmed];
  the old observation was OUR early malformed Expression ASTs. Author computed fields normally
  everywhere (compileFormula emits the golden shape).
- 2026-07-04 [global] OWNER VERDICTS: **Q1** platform SUPPORTS parallel branches + conditional skips
  (was an engine gap — since landed, see 2026-07-14); **Q2** no conditional-mandatory primitive exists;
  **Q3** row-level report scoping EXISTS — "report View = all items" is an engine/knowledge gap;
  revisit "scope is convention" waivers once the engine learns the scoping shape. [tier:owner-confirmed]
- 2026-07-10 [global] Step conditions are FORMULAS: Activity::Expression → Expression/Node AST
  (field-formula shape re-scoped Field→Activity), equality `=` not `==`; Criteria/Condition is ONLY for
  reference/query filters + integration IfActions [tier:owner-confirmed]. → LESSONS §11
- 2026-07-10 [global] Parallel branches = `Parallel` NodeType activity, Activity::ProcessDef:[…] forks
  into nested branch ProcessDefs, auto-join (no join activity) [tier:golden-verified vs
  Vashi_Setup_Operations]. → LESSONS §12
- 2026-07-10 [global] Keep ONE authoritative master-process script for hand-authored workflow surgery;
  conditions + parallel are now first-class IR (2026-07-14) so rebuilds preserve them. → LESSONS §13
- 2026-07-10 [global] Native Decision Tables are plan-gated (403 YourPlanNotSupport) → model as dataform
  "Approval Matrix" + lookup + branch step-conditions. → LESSONS §14
- 2026-07-10 [global] Edit apps IN PLACE — never a new app per change (dup published apps un-deletable):
  per-flow getDraft→graft→putDraft→publish + applyIR reuse for pages/perms/nav [tier:owner-confirmed]. → LESSONS §16
- 2026-07-10 [global] 423 grant-lock: member/report grants intermittently 423 during publish, re-issue
  after a moment → 200 — ALWAYS finish an apply with a re-grant pass (reaffirmed 2026-07-13). → LESSONS §16
- 2026-07-10 [global] CANONICAL onboarding [tier:owner-confirmed]: `/author-setup` (no args) runs
  `connect.mjs --auto` — a device flow against the appbuilder control plane (browser SSO → pick/create
  project → approve → .kf-env with dev creds + KF_USER_ID/KF_USER_EMAIL). A pre-minted `…/c/<token>`
  URL also works: `/author-setup <url>`. Manual env-var creds are the local-only FALLBACK.
- 2026-07-10 [global] Don't infer "impossible" from absence in a sample — find a flow that USES the
  feature or read the golden export before authoring/ruling out. → LESSONS §17
- 2026-07-10 [agent:kf-seed] Dataform runtime seeding recipe (verified My_Garage_A00): POST
  /form/2/{acct}/{flowId} creates a PER-USER SINGLETON draft (`draft_<userId>` — creates sequential per
  form), POST …/{draftId}/submit returns the real _id; update = POST …/{flowId}/{itemId}; Reference
  value = {_id}; Currency = plain number; list read nests reference lookups under the ref field, create
  echo flattens them. [tier:reproduced]
- 2026-07-10 [agent:kf-seed] Invalid Select values are SILENTLY DROPPED at create (200, field absent
  from echo) and only surface at submit as 400 'Value is required' — a REQUIRED list-backed Select with
  an empty backing list blocks ALL submits: populate the list (§15). [tier:reproduced]
- 2026-07-10 [agent:kf-seed] PROCESS item seeding (verified Payment_A07): create returns ONLY {_id,
  ModelId, _activity_instance_id}; submit = POST …/{pid}/{itemId}/{activityInstanceId}/submit (without
  the activity id → 404); item GET + /list are closed to a dev key → idempotency needs a local ledger
  keyed by a natural field. Submit 200 proves required fields validated. [tier:reproduced]
- 2026-07-10 [agent:kf-seed] Record system `Name` is API-immutable on form items (update 200, Name
  unchanged) — reference displays use Name but list-read nests the target's real fields under the ref;
  don't burn time setting Name. [tier:reproduced]
- 2026-07-10 [app:RE_Funds_Dept_v7_A00] Seeded 2026-07-10: 8 funds/10 vendors/42 sub-flow rows/6 title
  deeds/5 payments; grafted Select→Text on Fund_A06.{Fund_firm,Status,Property_Type} + Vendor_A33.Class_ID
  (pre-graft drafts in runs/re-funds-seed/backup-draft-*.json); re-run via runs/re-funds-seed/load.mjs
  (idempotent). [pre-§15-correction — populate lists instead now]
- 2026-07-13 [global] Field type is "Textarea" — "TextArea" was NOT in TYPE_ALIAS → raw in blob → process
  publish 500 opaque MetadataError (drafts accept it, PUBLISH rejects). TYPE_ALIAS now maps
  TextArea+Multiline→Textarea. Surgical recovery recipe works on a PUBLISHED process:
  getDraft→fix→putDraft→publish, no rebuild.
- 2026-07-13 [global] BOARD CONNECTOR ids (live-verified): board created→ItemSubmitted (no draft stage),
  status move→StatusUpdated, completed→ItemCompleted, rejected→ItemRejected; create INTO a board =
  CreateItem (NOT CreateAndSubmitItem). Other board ids UNVERIFIED — enrich via fetchConnectorMeta,
  don't guess. (integrations.mjs CONNECTOR_CATALOG)
- 2026-07-13 [global] APPBUILDER dev environments are REUSABLE first-class objects (dev_envs table;
  projects link via dev_env_id; creds resolve dev_env_id → secret_ref with legacy fallback). Raw-creds
  saves CREATE a reusable env, not a per-project secret.
- 2026-07-13 [global] The control plane IS the memory proxy: /memory/write /memory/recall /memory/sync,
  authenticated by the session's project token (admin token may write org "global"). Server embeds —
  KEEP control-plane/src/memory.mjs in sync with engine/embed.mjs. connect.mjs syncs the newest
  global+project pool to MEMORY-REMOTE.md on session start; `remember "<lesson>"` writes app-scoped
  rows (dedup by hash). Canon publishing = seed-global-memory.mjs (admin, idempotent); sessions cannot
  escalate to global.
- 2026-07-13 [global] SUSPICION CHECK enforced in the memory PROXY: /memory/write runs curateWrite
  (mirror of curation-gate.mjs, KEEP IN SYNC) — impossibility claims below owner-confirmed are stored
  QUARANTINED (excluded from recall, listed PENDING in MEMORY-REMOTE.md); only the admin token
  asserting owner-confirmed circulates one.
- 2026-07-14 [global] GOLDEN EXPORTS live in `golden-references/` at the repo root (ITAM,
  KFSustainabilityApp, ProfServAppMetadata, dashboard.json); engine golden tests resolve it first.
  When a lesson says "read the golden export", look there.
- 2026-07-14 [global] §15 IMPOSSIBILITY DISPROVEN [tier:reproduced] (SELF-SUSPICION rule vindicated):
  list items ARE API-writable — POST /flow/2/{acct}/list/{id}/items {"ListItems":[…strings]} (object
  wrapper; REPLACES the set; prior 403/400/404s were wrong shapes). applyIR PASS 1b auto-publishes
  ListItems; patch.mjs `list-items --append` merges. List-backed Selects are viable — ensure the list
  is populated; retire "use Text instead of Select". Note: a write to a NONEXISTENT list id returns
  403 not 404 (anti-enumeration) — don't misread as an auth wall. LESSONS §15 rewritten.
- 2026-07-14 [global] The 2026-06-30 "published processes are IMMUTABLE over REST" claim is SUPERSEDED
  by practice: in-place grafts on published processes are owner-confirmed (§16) and live-verified
  (patch.mjs verbs; the Textarea repair ran getDraft→putDraft→publish on a PUBLISHED process, all 200).
  The old claim traced to the early malformed-blob era; LESSONS §1b needs its rewrite. [tier:reproduced]
- 2026-07-14 [global] Engine env unification: clientFromEnv accepts KF_* aliases + KISSFLOW_DOMAIN/
  KF_DOMAIN full-host override; cli.mjs auto-loads ./.env and ./.kf-env (already-set env wins); apply
  log prints the real host.
- 2026-07-14 [global] ONE-AND-DONE CONNECT hardened: writeEnv emits KISSFLOW_* + KF_* aliases (was
  unprefixed names the engine never read); partial/blank cred payloads no longer masquerade as
  configured (all four fields required); minting a connect URL for an env-less project → 409 "link a
  dev environment first". Reconnect after linking: `node engine/connect.mjs --auto`.
- 2026-07-14 [global] LIVE-APP CHANGES ARE FAST: (1) `steps[].condition` is FIRST-CLASS IR — addWorkflow
  compiles the §11 Activity::Expression AST; survives rebuilds; validator catches terminal-step
  conditions + unknown field tokens. (2) `engine/patch.mjs` = the fast-edit layer — 15 one-command
  verbs (branch · parallel · condition · add-step · step-actor · step-permission · add-field incl.
  Reference/Select · field-type · field-set · formula · rename · list-items · add-role · grant ·
  case-members · kanban-view). USE PATCH FIRST for any existing-app change; bespoke grafts only for
  shapes patch lacks (then propose a verb). Always mirror the change into lib/app-spec.json. LESSONS §13
- 2026-07-14 [global] PARALLEL BRANCHES are first-class: IR `steps[].branches:[{name, steps:[…]}]` →
  addWorkflow emits NodeType:"Parallel" + one MINIMAL branch ProcessDef per arm ({Id,Kind,Name,Activity}
  — no WorkflowType/Model) with ordinary UserTasks inside; auto-join = next sibling. patch.mjs
  `parallel` grafts the same shape live (roles auto-created). [tier:golden-verified + live]
- 2026-07-14 [global] REJECT / SEND-BACK ARE NATIVE DEFAULTS ON EVERY STEP [tier:owner-confirmed] —
  never model explicit "Rejected" steps, reject branches, or a second terminal: every approval step
  ships approve→next / reject→send-back (mandatory comment) out of the box. Workflow designs = steps +
  actors + conditions + parallel branches only.
- 2026-07-14 [global] MODEL TIERS on the agents (frontmatter): the four JUDGMENT GATES (kf-architect,
  kf-verifier, kf-coherence-critic, kf-reconciler) INHERIT the session's top tier; everything else runs
  SONNET with real `effort:` frontmatter (high: ba/ux-architect/prototype-builder; medium: the six
  slice specialists + comprehension + acceptance; low: author/seed). /add-page chain: ui-designer +
  ui-builder sonnet/high; ui-architect + ui-qa inherit. Principle: pay for quality where the verifier
  can't save you.
- 2026-07-14 [global] PROD-FIRST APP CREATION + APPLY CHECKPOINTING: with KISSFLOW_PROD_*/KF_PROD_*
  creds, applyIR creates the app SHELL in prod (replicates to dev, same _id), polls dev
  (waitForAppInDev), then builds in dev; no prod creds → single-account fallback + warning. applyIR
  checkpoints (stateFile: appId/appInDev/genToServer/published/listItems/caseflow/members) — a crashed
  apply RESUMES without re-creating in prod.
- 2026-07-14 [global] REPO CONSOLIDATION: kissflow/ai-plugin is THE single repo — development canon AND
  distribution (marketplace "kissflow", plugin "app-agents"); plugin at plugins/app-agents/.
  kf-framework + the kf-app-author mirror are RETIRED; lineage preserved in this repo.
- 2026-07-14 [global] MEMORY CONSOLIDATED (65KB → ~18KB) + RECALL-FIRST: superseded entries + resolved
  sagas moved verbatim to MEMORY-ARCHIVE.md (raw history also in git). The specialist agents now RECALL
  top-K (`node engine/memory.mjs recall "<brief>"` — proxy → pool → NEW local embedding rank over
  MEMORY.md+MEMORY-LOCAL.md) instead of reading this file whole; the four judgment gates still read it
  in full; LESSONS.md stays always-read for everyone. Keep entries TERSE — every byte here is paid on
  every gate read and competes in every recall.
- 2026-07-14 [global] PER-AGENT TOKEN ACCOUNTING: a SubagentStop plugin hook (hooks/hooks.json →
  engine/token-stamp.mjs, matcher kf-*) sums each agent transcript's message.usage and stamps
  {ev:"tokens", tokens:{input,output,cacheRead,cacheWrite,total,turns}} into runs/<id>/timeline.jsonl;
  `node engine/timeline.mjs report` prints per-actor + run-total token columns next to durations.
  cacheRead dwarfs everything (context re-billed every turn) — context SIZE is the cost lever, which
  is what the memory consolidation + recall-first change attacks. Try/catch-silent, never blocks.
- 2026-07-30 [agent:kf-seed] Dataform/process create-submit shapes RE-CONFIRMED live (Ledgerline_A00,
  chat-builder run): `POST /form/2/{acc}/{flowId}` = per-user singleton draft, submit that one before
  creating the next; process `POST /process/2/{acc}/{flowId}` returns {_id,ModelId,_activity_instance_id},
  submit MUST include the activity instance id (`.../{itemId}/{activityInstanceId}/submit`) or 404s.
- 2026-07-30 [global] PROCESS READS: exactly one listable view, `/myitems` — `/list` and `/view/allitems`
  both 404 for process flows (confirmed live inside Kissflow itself, not just from a script). `/myitems`
  is a SPARSE projection regardless of `_response_type=full`; full field values need a per-item detail
  GET: `/process/2/{acc}/{flowId}/{itemId}/{activityInstanceId}?_response_type=full`. Check the real SDK
  for a proper read method before hand-rolling — this repo's `live-kf.ts#getProcess().getItems()` is a
  DEV-ONLY mock (says so explicitly), not confirmed on the production SDK.
- 2026-07-30 [global] A custom Status-type Select field is NEVER auto-set by API create/submit — it only
  changes when a human/workflow action actually completes a step. Derive displayed record state from the
  SYSTEM fields `_status`/`_current_step`, not a custom Status field, or every API-created record shows
  "Draft" regardless of real position.
- 2026-07-30 [global] App-role membership field is `Users[]` (PUT /app_role/2/{acc}/{roleId}), not
  `Members`/`AddUsers`/`UserIds` (all look plausible, all silently no-op — 200 but a follow-up GET shows
  Members:[] unchanged). Even the correct shape is FLAKY (500 UserError, role-agnostic — reproduced on
  User/Admin roles too, ~1/15 attempts landed) — retry-and-verify-by-GET, never trust the first 200.
- 2026-07-30 [global, chat-builder pipeline] A generated custom-UI's write actions (Submit/Approve/Reject)
  can be fully decorative — `notify("...")` + close popup, no API call — and look identical to a working
  handler by eye. Only caught by reading records back or a headless-Chrome render test against a stubbed
  `window.kf` (see runs/i-want-to-build-a-expense-tracking-syste/live.md). CONDUCTOR.md's chat pipeline
  now mandates real API calls for every write and this exact verification method.
- 2026-07-30 [global] Decision-completion endpoint for advancing PAST a process approval step
  (Approve/Reject/complete) — STILL UNCONFIRMED. Tried live: `.../{item}/{activityInstance}/complete`,
  `/action`, `/approve`, all 404. Whoever finds the real one: record it here immediately, tier:reproduced.
- 2026-08-04 [global] kf-verifier's REQUIRED write (`app-spec.json#verification`) bumps app-spec.json's
  mtime, which trips `pipeline.mjs`'s `freshAgainst` check on `prototype`/`blueprint` — `require --before
  apply` then falsely reports STALE even though nothing about the spec content changed. Every
  comprehensive-pipeline verifier run will hit this. Real fix: freshness should key off a content hash
  or exclude the `verification` key, not raw mtime; until fixed, expect to regenerate review.html or use
  `--force` with this note on record after every kf-verifier pass.
- 2026-08-04 [global] `client.mjs#flowGrant` on a Process ALWAYS grants `Permission:["InitiateItems"]` to
  every role declared `Editable` in `permissions[]` — there is no narrower grant for "can act on my
  assigned workflow step, cannot independently raise new items." Combined with `NAV_GRANT_ESCALATION`
  (which hard-blocks declaring a role ReadOnly if it has ANY nav-reachable page card on that flow), any
  reviewer role that needs a page to see/approve its own step is FORCED into Editable, and therefore into
  InitiateItems too — a 2nd-order permission-escalation path distinct from the page-driven one
  NAV_GRANT_ESCALATION already catches. StartEvent activities carry no `Activity::Resource`/actor
  restriction (only UserTask steps do, per builders.mjs), so nothing else narrows this at build time
  either. [tier:kf-verifier finding, trade-promotion-management — code-verified; live-runtime
  exploitability not confirmed] Candidate new gate rule: PROCESS_MULTI_INITIATOR.
