# kf-author — Memory ARCHIVE

Entries moved out of `MEMORY.md` — superseded interpretations, resolved sagas, and engine-fix
history. **Never deleted, resurrectable**: if a live observation contradicts the current canon,
check here first (and in git history) before re-deriving. Each section names why it was archived
and what superseded it.

## Consolidated 2026-07-14 (token-cost pass: 65KB → ~17KB; raw history also in git)

### Superseded: "published processes are immutable over REST" (→ LESSONS §16, patch.mjs era)
- 2026-06-30 [global] Published processes are IMMUTABLE over REST (PUT→403, DELETE→no-op) — bake all
  fields/formulas/aggregates/lookups/workflow in before publish; to change one, rebuild the app fresh. → LESSONS §1b
  [ARCHIVED: superseded — in-place grafts on published processes are owner-confirmed (§16) and
  live-verified (patch.mjs; Employee_Onboarding_Hub TextArea repair). See canon 2026-07-14.]

### Retired: "process formulas strip on publish" (disproven 2026-07-04, owner-confirmed)
- 2026-06-30 [global] Process field FORMULAS strip on publish; FORM formulas survive. Don't rely on
  process-side field expressions; model process math in the workflow. → LESSONS §1b

### Engine-fix history (fixes landed; the durable rules live in canon/LESSONS)
- 2026-07-02 [global] applyIR live-build fixes: (1) AGGREGATE-OVER-CHILD false
  "dangling cross-ref" — an aggregate's QueryDefinition LHSModel points at the EMBEDDED child-table
  Model (e.g. Payment.Total → Payment_Lines_A00) which lives IN the same blob, not a standalone flow;
  crossRefs() now skips LHSModel targets present in-blob (`!blob[lhs]`), else the parent process is
  wrongly skipped from publish. (2) ACCOUNT-GLOBAL NAME COLLISION — lists/forms named "Currency",
  "Project" (etc.) already exist account-wide → FlowNameAlreadyExists 04206 on create; applyIR PASS-1
  now RETRIES with an app-prefixed name (`<AppFirst2Words> <name>`) when the name isn't ours to reuse,
  so it creates a NEW app-scoped flow (refs resolve via gen→server, only display Name changes).
  Data-architect should still avoid global master names (LESSONS §5); engine is now resilient anyway.
- 2026-07-02 [global] NATIVE PAGES — the baseline experience layer had 3 bugs that made pages/nav/create
  look broken live (all fixed, 54 tests): (1) buildPage card verbs are `kpi|list|chart|action` ONLY —
  `experience.mjs` emitting `table`/`form` silently dropped every data widget → labels-only pages; a
  `chart` card needs a real `filter.groupBy` field or it's dropped. (2) `flowInfo` must be keyed by BOTH
  flow id AND name (a card's `source_flow` may be either) or list/chart cards resolve nothing. (3) NAV
  STITCHING — never point every flow's submenu at a role home; each PROCESS flow needs its OWN worklist
  page and the submenu stitches to THAT page (else all menus collapse onto one page). (4) +New is NOT a
  table property (`showform` does nothing) — the create affordance is Button→Popup→FormView per the
  transformer's component catalog; buildPage's `action` card now emits that. Verified live.
- 2026-07-03 [global] applyIR publish-failure report used to log the DRAFT body instead of the PUBLISH
  error (fixed) — if you see draft=200 publish=500 with a blob echo, re-POST the publish endpoint to
  get the real error.

### The integration saga (2026-07-02, ~10 probe entries) — resolved; final state is in canon
The chain "REST partial → draft schema cracked → connections MBAC-gated → plan-gated → CORRECTION
not plan-gated → connections self-serve → server-resolved 2-pass" concluded in the canon entries
"INTEGRATION AUTHORING final state" + the 2026-07-03 CORRECTION. Raw probes:
- 2026-07-02 [global] INTEGRATION AUTHORING over REST is PARTIAL (probed live, v7): the integration RECORD
  CAN be created — `POST /flow/2/{acct}/integration?_application_id=` → 200. WIRING IS exposed after all
  (found in kissflow-xg source): `GET/PUT /metadata/2/{acct}/integration/{id}/draft` (→200) then publish —
  same draft→publish pattern as pages (my earlier 404 was a wrong URL: it's flow-level `/integration/{id}/
  draft`, NOT app-nested). BUT the draft blob is CONNECTOR-BASED and complex (per fixture
  appstore/tests/mock/metadata/Draft_Integration_001_A00.json): Trigger/Action reference installed
  marketplace CONNECTOR INSTANCES (e.g. "Kissflow Process" `ActionId:CreateAndSubmitItem` `Version:2.0.0`
  +Logo; "Kissflow Case system" `CreateItem`) plus a `FieldMapping`→`Property` entity graph per field.
  Activation + delete are INTERNAL-ONLY routes (`/integration/2/{acct}/integration/{id}/on|off`, DELETE) →
  403 with a public key. NET to emit functional integrations the engine must: discover the account's
  installed connector-instance ids/versions, build the connector-based Trigger/Action + FieldMapping/Property
  graph, save_draft→publish; activation/cleanup likely still need the builder UI. Until that's built, keep
  DEFERRING and use the validated `automations` slice + review as the wire-up blueprint.
- 2026-07-02 [global] INTEGRATION EMITTER (engine/integrations.mjs) — LIVE RUN result: resolveConnectors +
  fetchConnectorMeta work (subscription route); buildIntegrationDraft assembles Integration+Trigger+Action+
  FieldMapping/Property. applyIntegration live steps: create 200, getDraft 200, **putDraft 400
  DocValidationError "Insufficient arguments"**, publish 200, turnOn 403 (internal). So the draft blob is
  still missing REQUIRED Trigger/Action args (likely a Connection ref + event/flow config + connector
  sub-fields) — the metadata/schema only documents CUSTOM-connector authoring, not the standard flow-
  integration draft. SUREST fix: build ONE integration in the Kissflow builder UI, GET
  /metadata/2/{acct}/integration/{id}/draft, and model buildIntegrationDraft on that exact blob. Also:
  create leaves an un-deletable record via public API (delete/turn-on are internal-auth) → test sparingly.
- 2026-07-02 [global] INTEGRATION DRAFT SCHEMA — CRACKED from golden-eval app exports (kf-framework/
  {KFSustainabilityApp,ProfServAppMetadata,ITAM}/integration/*/metadata — real flow→flow integrations).
  Required Trigger/Action extras beyond the connector: **Connection:{_id,Name}** (an account CONNECTION to
  the connector — the "Insufficient arguments" cause), IsInternalAuth, Integration back-ref,
  Connector.{Status,WebsiteURL}; trigger bound via Trigger::FieldMapping process_id[+step_id]; action via
  process_id/case_id + a FieldMapping/Property per field (Property.Type Value|Field|Expression).
  buildIntegrationDraft now emits all of this. HARD PREREQUISITE: the account must have a CONNECTION —
  GET /integration/2/{acct}/connection was EMPTY here, so wiring is blocked until one is provisioned
  (likely builder-UI/auth). Golden eval exports are the ground truth for connector/trigger/action shapes.
- 2026-07-02 [global] CONNECTIONS EXIST for system connectors — corrected: a live GET of a known
  connection id returns **403 (MBAC/Integration-Admin gated), NOT 404** — it's present, just not readable
  with a plain public key (hence the empty list). The connection ref lives in APP METADATA (each
  integration Trigger/Action carries `Connection:{_id,Name}`), so `connectionsFromExport(dir, fs)` harvests
  them from an app export (verified: ITAM → Process `Cn7vALgtsHcY`, Board, etc.). NET: the integration
  emitter's real blocker is AUTH SCOPE — connection-read + integration turn_on need Integration-Admin
  (MBAC), not a standard public API key. Source connection ids from app metadata; do turn_on via an
  admin credential or the builder UI.
- 2026-07-02 [global] AI SKELETON CREATOR (verified live) — Kissflow has a built-in AI that picks the
  trigger+action(s) from a prompt: POST /metadata/2/{acct}/integration/{id}/suggest/workflow {AIPrompt}.
  Auth = MBAC on the integration_id, so it WORKS with a normal API key on an integration YOU created
  (creator=admin) — NOT behind the connection MBAC wall. It returns triggers/actions + full connector
  metadata (Logo/Version). Live: "Valuation completes → update Market Value in NAV" → ItemCompleted +
  UpdateAnItem (matches our static catalog). Wired as `suggestSkeleton()`. So skeleton selection can be
  AI-driven; only connection-read + turn_on remain MBAC-gated. Also: save_draft on an integration you
  create returns 400 (schema), NOT 403 — so draft authoring is available with a normal key too.
- 2026-07-02 [global] INTEGRATION EMITTER — create→draft→publish SUCCEEDS live with a normal key once the
  Connection is included (create 200, putDraft 200, publish 200; only turn_on 403). BUT the published draft
  ERRORS in the builder ("There was an error / Reload" on trigger+action) because the blob is malformed vs
  the golden evals. THREE concrete gaps (from ITAM golden ItemCompleted→UpdateAnItem, same connection):
  (1) Connector.Version must be the version the CONNECTION is pinned to (ITAM conn Cn7vALgtsHcY = 3.2.1),
  NOT the live subscription version (3.7.5). (2) A source→target field map is Property `Type:"Field"`
  (structured binding, Value:null), NOT an expression string like `{{trigger.X}}`. (3) UPDATE actions need
  an LHSField/RHSField MATCH condition (which record to update). FIX PATH: clone the ITAM golden
  UpdateAnItem/CreateAndSubmitItem template exactly, parameterized by (source flow, target flow, field map,
  match field) — don't hand-guess the blob. Each live test also leaves an un-deletable record (test sparingly).
- 2026-07-02 [global] "AI skeleton" ≠ full draft. Kissflow's /suggest/workflow ONLY picks trigger+action
  (create_suggestion returns TriggersAndActions; it does NOT persist a draft) — which resolveSkeleton
  already replicates. The valid DRAFT is built by the BUILDER FRONTEND, which: fetches the target flow's
  FULL field schema and emits a FieldMapping PER field (Type = real field type; Object fields nest a `_id`
  child; Property is nested UNDER the field via `FieldMapping::Property`, attached only to MAPPED fields) +
  a form_id/process_id/instance_id target binding + LHSField/RHSField match for updates + the connection-
  pinned connector version. So a builder-valid emitter must enumerate the target schema into a typed
  FieldMapping graph — a real build, not a skeleton. Our emitter produces a correct skeleton; the builder
  errors on it because it lacks the full field graph. Pragmatic: emit skeleton, finish/activate in builder.
- 2026-07-02 [global] INTEGRATION FIELD-RESOLUTION is PLAN-GATED. The builder produces a valid draft
  (Output sample schemas + FULL target-field enumeration, ~58 FieldMappings) by calling a field resolver.
  The AI/agent resolver `POST /integration/2/{acct}/agent/connector/{cid}/{ver}/action/{aid}/fields/resolve`
  {connection_id, parent_values} → 403 "YourPlanNotSupport" (KISSFLOW_ERROR_00023) on this account. The
  non-agent `POST /integration/2/{acct}/{id}/detached/action/fields` {ActionMeta, ActionPayload} → 500
  (needs exact undocumented payload). NET: full auto-gen of a builder-valid draft is NOT reachable via the
  public API on this plan. Our emitter reliably does skeleton + create→draft→publish; finish field mappings
  + turn_on in the builder, OR upgrade the plan for the agent field resolver. Golden evals = ground truth.
  [ARCHIVED: corrected same-week — the 403 was the separate AI-AGENT product; the standard resolver works.]
- 2026-07-02 [global] CORRECTION — integration field-resolution is NOT plan-gated. The 403
  "YourPlanNotSupport" was the separate AI-AGENT product (`/agent/connector/.../fields/resolve`). The
  STANDARD builder resolver `POST /integration/2/{acct}/{integration_id}/detached/action/fields`
  {ActionMeta, ActionPayload} WORKS with a public key (200) — IF: (a) integration_id is a LIVE (not
  archived) integration you own, (b) ActionMeta is a full Action model (Kind/Type/Connector) with NO
  Connection (Kissflow Process connector uses INTERNAL auth → InternalAuthConnectionModel, no connection
  needed; passing a Connection._id that doesn't exist → 404 DocumentNotFound on IntegrationConnection).
  It returns the action's STATIC input fields (process_id, _id); the target's item fields are DYNAMIC
  (`_get_dynamic_fields` → perform_request to the Process API to list the flow's fields). The full field
  schema is also directly available: `GET /metadata/2/{acct}/process/{id}/draft` (Field entities Id/Name/
  Type). So replicating the builder IS possible with the public key — remaining: enumerate target fields +
  attach the Trigger `Output` sample (get_trigger_fields) + IsTested. This account has ZERO connections
  (empty /connection list was correct); internal-auth system connectors don't need one.
- 2026-07-02 [global] Full integration field-mapping (buildIntegrationDraftFull): Trigger::FieldMapping process_id=Value:[srcFlowId] + Trigger.Output sample (drives builder Smart-mapping); Action::FieldMapping process_id=Value:[tgtFlowId] + per field {Name:<targetFieldId>, Type:fmType, Property Type:Field Field:`context.<triggerEntityId>.<srcFieldId>` | Type:Value for quoted literals}. Field refs resolve label→id via flow.fields. VERIFIED live: renders in builder Smart-field-mapping (NAV_A07 target + Average_Valuation source binding). CAVEAT: UpdateAnItem REQUIRES a record locator `_id` — an EMPTY _id → "Invalid payload sent". Emit _id ONLY when action.key_field names a source ref holding the target _id; else omit + flag `_unresolved` (user selects record / adds a Search step). CREATE stitches have no _id problem → fully complete.
  [ARCHIVED: superseded by the server-resolved 2-pass (hand-built FMs fail; resolver shape is canonical).]

### The board/kanban saga (2026-07-02) — codified into builders.mjs/board-live.mjs + reference/BOARD-AND-KANBAN-PAGE.md
- 2026-07-02 [global] buildBoard(spec, appId, idmap) EXISTS (engine/builders.mjs) — golden-eval shape (ProfServ Projects/Enquiry/Tasks): Model FlowType:"Case" (via buildForm) + a SEPARATE CaseFlow blob {CaseFlow{Model,Type:Case,FlowType:CaseFlow,CaseFlow::Status[],CaseFlow::State[]} + Status{Name,Category:NotStarted|InProgress|Done|Closed|ReOpened,IsSystem,Resources[],OutwardStatus[],EntryRule/ExitRule/Rule[],SLADisabled} + 4 system States(Not started=default, Done=last)}. Unstructured ⇒ each Status.OutwardStatus = every OTHER status. spec.statuses=[{name,category?}] (defaults To Do→In Progress→Done); adds a system Reopened. buildApp routes flowType Board/Case (or a form declaring `statuses`) to buildBoard + emits the caseflow artifact. TODO(live): client.mjs applyIR publish loop only handles list/form/process/case — the "caseflow" artifact (statuses) still needs GET-draft→graft→PUT→publish wiring (caseflow is auto-created with the Case; id ~ <model>_A00).
- 2026-07-02 [global] LIVE board (Case) publish recipe — VERIFIED working for form+steps: (1) create shell POST /flow/2/{acc}/case/?_application_id={app} {Name,Description,Prefix,ItemType} → 200 (Prefix+ItemType REQUIRED; missing → 400 MissingRequiredFieldError); returns modelId + flow doc has _default_workflow_id = <model>_flow_A00 (the caseflow id). (2) FORM: GET/PUT /metadata/2/{acc}/case/{caseId}/draft (graft fields onto the server model draft — it ships default Summary/Description/Attachment; append your Model::Field + Model::Row) → POST .../publish. (3) BOARD STEPS: GET/PUT /metadata/2/{acc}/case/{caseId}/caseflow/{cfId}/draft (swap CaseFlow::Status + ::State for buildBoard's) → POST .../caseflow/{cfId}/publish. All 200, API-verified on a dev task board (columns To Do→In Progress→Blocked→Done→Reopened). (4) VIEW = KANBAN caseview (this is what makes it render as a BOARD, not a workflow): POST /flow/2/{acc}/case/{caseId}/caseview/ {Name, ViewType:"Kanban"} → 200 — creates the Kanban view AND auto-generates the full default view set (All/Assigned to me/Overdue/… all Kanban). WITHOUT a Kanban caseview the case shows as a WORKFLOW (status graph) + blank runtime. (The /caseview/default endpoint 500s — use the single create instead.) ViewCreateSchema = {Name(req), ViewType(req, OneOf), SharedWith?}. FULL live board = case shell + form(model draft) + board steps(caseflow) + Kanban caseview, all API-verified. TODO: codify into client.mjs applyIR (emit case+caseflow+caseview artifacts).
- 2026-07-02 [global] Kissflow PAGE component flow-binding lives in the COMPONENT-CONTAINER's `Container::FieldMapping` (each = FieldMapping{Name,Container,FieldMapping::Property:[Property{Type:"Value",Value}]}) — NOT the component's Data object (Data is display metadata only). Setting only Data.flow_id → runtime reads `undefined` (case/undefined, undefined_all). A CaseViewKanban board component needs its container to carry: flow_id=<caseId>, flow_type="case"(lowercase!), view_id=<caseview id e.g. <case>_all>, showform=true, filterParameters(Type:"FilterParam"). Component itself = {Script:{web:"view/kanban"}, Data:{manifest_id:"Kanban",category:"view",visualization_type:"kanban",flow_type:"Case",flow_id,view_id} — NOTE: "CaseViewKanban"/"case/views/kanban"/category:"Case" is the OLD/deprecated manifest (ProfServ golden) and RENDERS "board view not found"; the CURRENT manifest is "Kanban"/"view/kanban"/category:"view" (verified vs working Retail_Store Projects_Kanban page). Container also carries Container::EventMapping(on_card_click Redirection) + Container::VariableRef(_id) for click-to-open (optional) + Style {Value:{"Kanban.Height":{value:"100%"}}}}. Labels/Buttons bind text the same way: label→title/fontSize/color FieldMappings; button→caption/size + an EventMapping{Name:"on_click",Type:"OpenPopup"}. Page graph: Page→Body Container→child Containers(ref parent via `Container`, not Page; Body refs Page)→Component-container(Type:"Component")→leaf Component. Verified live building a deal-pipeline board + page in a dev app.
- 2026-07-02 [global] ROOT CAUSE of "board view not found" when embedding an API-created board in a page: the case had ZERO MEMBERS. A board's SYSTEM views (incl. _all) are only returned by get_my_shared_views() if the viewing user is_case_user (has case membership/permission) — else system_views=[] and the page component's view lookup fails. The Kissflow UI auto-grants app roles to the case on build; the API does NOT. FIX (final step of the live board recipe): POST /flow/2/{acc}/case/{caseId}/member/batch?_application_id={app} with a list of {_id:<roleId>, Name:<roleName>, Kind:"AppRole", Role:"Admin", Permission:[]} for the app's roles (GET /app_role/2/{acc}/list?_application_id={app}). Verified: members 0→10 flipped the case's CaseView field 0→10 and resolved the kanban. This was NOT the component manifest (though also fix that: current manifest is "Kanban"/"view/kanban"/category "view", NOT the deprecated "CaseViewKanban"/"case/views/kanban"/"Case"). Diagnosed by comparing case /member + CaseView of a working UI-built board (Retail_Store Projects_A00 = 9 members/9 views) vs mine (0/0).
- 2026-07-02 [global] Default "New <Item>" button for a kanban/board page (current manifests, verified vs Retail Operations page): BUTTON = Component{Script:{web:"general/button"},Data:{manifest_id:"Button",category:"general",subcategory:"system",visualization_type:"button"}} in a Container(Component) with Container::FieldMapping[caption,size:"medium",type:"primary",iconPosition:"left"] + Container::EventMapping[{Name:"on_click",Type:"OpenPopup",Property{Type:"Popup",Value:<popupId>}}]. POPUP = Popup{Script:{web:"general/popup"},Popup::Container:[popCont],Popup::Style}; popCont is a Container with **Type:"Popup"** (+ Popup:<popupId>) → Container::Container:[formCont]; formCont is Container(Component) → Container::Component:[form] + **Container::FieldMapping[flow_id, flow_type:"Case"]** (flow binding lives in the CONTAINER, not Data — same rule as kanban) + Container::EventMapping[on_submit,on_discard = JSAction Code `let c=await kf.app.page.getComponent("<kanbanId>");c.refresh();kf.app.page.popup.close()`]. FORM component = {Script:{web:"view/form"},Data:{manifest_id:"Form",category:"view",visualization_type:"form",flow_type:"Case",flow_id}} (NOT the deprecated "case/form"/category:"Case"). Register popup in Page::Popup. Gotchas that broke it first: popCont was Type:"Component" (must be "Popup"); form flow binding only in Data (must be in container FieldMapping); reordering body children mid-edit left a stray empty container (clean-rebuild the page instead).

### Superseded engine-gap claims (capability landed later)
- 2026-07-03 [global] addWorkflow HARDCODES per-step field permissions (Editable at StartEvent, ReadOnly at every later step, all columns) and ir.mjs permissions are flow-level only — NO mid-flow edit (approver comments, rates, child-table row edits) is buildable until addWorkflow/IR gain per-step permission overrides; verify this precondition before any workflow step that needs mid-flow data entry.
  [ARCHIVED: superseded by R11 — steps take field_permissions.]
- 2026-07-03 [global] addAggregate emits QueryDefinition with LookupField:[] and NO filter param — only aggregates over an EMBEDDED child table are verified; a cross-flow aggregate (parent counting a referencing flow's instances) has no join condition as-built and cannot filter by status. Design gate signals as embedded filtered lists first, numeric aggregates only after verifying the join.
  [ARCHIVED: superseded 2026-07-04 — cross-flow per-item aggregation with Criteria join is expressible and live-verified.]
- 2026-07-03 [global] IR `notify` stitches are UNAPPLYABLE as-is on the live connector path: resolveSkeleton maps type:'notify' → PROCESS connector + CreateAndSubmitItem on the target flow (would CREATE a spurious item!), and the Email/SendEmail branch keys on /email/i.test(action.type) which valid IR ('notify' is the only allowed value) never satisfies — every notify stitch needs an apply-time shim to the email branch (or builder wiring: <trigger> + Email SendEmail; To/Subject/Body are builder-mapped anyway per buildIntegrationDraftFull). Fix candidates: route notify→email in resolveSkeleton, or accept 'notify' in the email test.
- 2026-07-03 [global] NOTIFY-STITCH TRAP: ir.mjs only allows action.type create|update|notify, but resolveSkeleton maps notify → PROCESS connector + CreateAndSubmitItem and the /email/i branch is unreachable from valid IR — a notify automation applied naively CREATES a spurious item in its (mandatory) target_flow. Engine fix: extend the /email/i tests to /email|notify/i in buildIntegrationDraft/Full + applyIntegration key selection (+test). Until landed, HARD-GATE any apply containing a notify stitch. Also: buildAutomation stub Connector entity triggers a cosmetic ORPHAN_ENTITY warning on every automation build.
  [ARCHIVED (both): INT-C2 fixed — notify routes to Email/SendEmail natively.]

### Superseded: "list-data API is closed" (disproven 2026-07-14, §15 rewritten)
- 2026-07-10 [global] Lists are created EMPTY and the list-data API is closed (403 read+write; backed Selects render blank) — use Text/Number for values you must seed or condition on. → LESSONS §15
- (kf-seed clause, from the 2026-07-10 Select entry) "…since list data/import APIs 403 (reaffirmed
  2026-07-10), the working fix is in-place graft Select→Text (same field id, drop ReferredList) →
  publish, which the runtime + UI accept."

### Superseded: hive wiring gap (closed same-day by the control-plane memory proxy)
- 2026-07-13 [global] HIVE WIRING GAP [tier:reproduced]: kf_memory (pgvector, Cloud SQL) has 0 rows —
  connected sessions get KF_MEM_STORE=pgvector + KF_MEM_ORG from bootstrap but NO PG_URL/DATABASE_URL,
  and vector-store's pgvector backend needs one → every remote write/recall silently falls back to the
  MEMORY.md file. Sessions must never hold DB creds, so the fix is a control-plane memory PROXY
  (broker endpoints authenticated by the project token) or MEM0_BASE_URL. Until then the hive stays
  empty by construction — don't diagnose "agents aren't learning" from an empty kf_memory table.
