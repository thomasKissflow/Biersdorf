---
description: Front a change to an EXISTING app with the reconciler — import live → IR (forms reconstructed from live; roles/lists/pages/nav still desired-carried, see _provenance), three-way diff vs desired, mark ownership/drift, risk-tier the plan, apply draft-first with tiered approval. Never regenerates, never overwrites dev edits, never auto-publishes to prod.
argument-hint: --target <env> [path to desired app-spec.json]
---

Spawn **kf-reconciler** — the front door for every change to an app that already exists. This is a
**reconciler, not a generator**: the live app is the source of truth and we propose the minimal
reviewable diff.

Pre-req: `engine/cli.mjs` exists; desired IR at `lib/app-spec.json` (authored by `/author-app`).

1. **Import live → IR (forms are live; other slices desired-carried — treat as unknown-live)**:
   `node engine/cli.mjs import --target <env> --out lib/live.ir.json`.
2. **Three-way diff/plan**: `node engine/cli.mjs plan lib/app-spec.json --target <env>` — base ×
   desired × live. Surfaces what the user wants vs what a developer changed in the app since.
3. **Ownership & drift**: tag each item `ai-owned` / `dev-owned` / `conflict`. NEVER overwrite a
   `dev-owned` change without itemised approval.
4. **Risk-tier**: `low` (additive) / `medium` (behaviour change) / `high` (destructive / scope-widen /
   prod). Stronger approval as risk rises.
5. **Draft-first apply**: land a draft + show the plan, approve per tier, then publish. Never
   auto-publish; never publish to prod without explicit high-tier approval.

Output: the `reconciliation` IR slice (diff by ownership + risk, conflicts, ordered apply plan,
approval gates). Run **/author-understand** first if the app's semantics are unclear.

## FAST PATH — small changes in seconds, not scripts
For a SCOPED change to a live app (a branch condition, a new field/step/role, a permission tweak,
list options, an access grant), do NOT write a bespoke graft script. Use the fast-edit layer:
```bash
node engine/patch.mjs branch          <processId> --app <appId> --after "CFO Sign-off" --on "Capex_Value > 500000" --then "CEO Approval:CEO" --else "Council Approval:Council"
node engine/patch.mjs condition        <processId> "CEO Approval" "Capex_Value > 500000"
node engine/patch.mjs add-step        <processId> "Council Approval" --actor "Council" --app <appId> --after "CFO Sign-off" --condition "Capex_Value <= 500000"
node engine/patch.mjs add-field       <flowId> "Justification" Textarea --required
node engine/patch.mjs add-field       <flowId> "Vendor" Reference --ref Vendor_A33 --ref-type Form
node engine/patch.mjs field-type      <flowId> "Notes" Textarea
node engine/patch.mjs step-permission <processId> "IT Provisioning" "Provisioning Notes" Editable
node engine/patch.mjs list-items      <listId> "Low,Medium,High"
node engine/patch.mjs add-role        <appId> "CEO"
node engine/patch.mjs grant           <flowId> <appId> "CEO" --family process
node engine/patch.mjs step-actor      <processId> "CFO Sign-off" "VP Finance" --app <appId>
node engine/patch.mjs formula         <flowId> "Days to Start" "DATEDIFF(Start_Date, TODAY())"
node engine/patch.mjs rename          <flowId> field "Title" "Request Title"
node engine/patch.mjs field-set       <flowId> "Notes" Required=false
node engine/patch.mjs case-members    <caseId> <appId>        # boards: fixes "board view not found"
node engine/patch.mjs kanban-view     <caseId> "Pipeline"
node engine/patch.mjs parallel        <processId> --app <appId> --after "Site Approved" --branch "Warehouse Readiness:Warehouse Head" --branch "Branch Head Hiring:HR"
```
Every verb wraps the proven getDraft → mutate → putDraft → publish surgery with the derived knowledge
encoded (per-step permissions for new columns, §11 AST re-scoping, 423 grant retries); `--dry-run`
previews. **Afterwards, mirror the change into `lib/app-spec.json`** (e.g. the step's `condition:` —
now first-class IR) so a future rebuild keeps it. Full reconciler runs stay for structural changes.
