# CIQ Workbench (custom UI for CIQ Digital)

Kissflow-internal. The design is `kissflow-build/ciq-digital/WORKBENCH-DESIGN.md` (authoritative). This folder is the
Workbench: one React bundle for the internal Beiersdorf roles of `CIQ_Digital_A00`, built from `prototype/` as a
separate entry, apart from the supplier portal UI. **Deployment is out of scope** (it needs its own approved step).

## Run and rebuild (from `prototype/`)

| Command | Does |
|---|---|
| `npm run gen:workbench` | Regenerates `schema/generated.ts` from `../runs/current/app-spec.json` (never `spec.forms`) |
| `node scripts/gen-workbench-schema.mjs --check` | Exit 1 when `generated.ts` is out of date with the spec |
| `node scripts/gen-workbench-schema.mjs --readback <file>` | After generate: merges server role / activity / child-model ids (§4.4). The file is copied to `schema/readback.json`, which every later run (and `--check`) merges too |
| `npm run typecheck:workbench` | `tsc -p tsconfig.workbench.json` (src/workbench + the ambient `src/portal/kf/kfsdk.d.ts`) |
| `npm run test:workbench` | `vitest run -c vitest.workbench.config.ts` (`src/workbench/**/*.spec.{ts,tsx}` only) |
| `npm run build:workbench` | generator `--check` → typecheck → single-file vite build → `scripts/zip-workbench.mjs` → `dist-workbench/ciq-workbench-ui-<sha256-10>.zip` (+ `latest.txt`) |
| `npm run dev:workbench` | Dev server on port **5330** (`/workbench.html`). Opened directly it says "Not running inside Kissflow" (no demo mode) |
| `npm run harness:workbench` | T4's emulated Kissflow host: all 50 scenarios + the 18 `kwb=refuse` matrix variants against `dist-workbench/zip/index.html` (run `build:workbench` first). Options: `node scripts/harness-workbench.mjs S12a S42`, `--no-matrix`, `--list`, `--serve` (host URLs for a manual demo), `--screens [dir]` (one screenshot per fictional role) |

The zip holds `index.html` and `manifest.json` = `{"Category":"Application","Framework":"React"}`. The zip step fails
on: zip > 5 MB; an `X-Access-Key` string (any case); the harness marker `__WB_HARNESS_ONLY__`; a bundle without the
build stamp (`dist-workbench/build-stamp.txt`, written by `vite.workbench.config.ts`).

## Changes outside `src/workbench` (T0)

- `prototype/tsconfig.json`: **one added line**, `"exclude": ["src/workbench"]`, so the portal's `npm run typecheck`
  never sees Workbench stubs. Nothing else in it changed. No portal or prototype file imports `src/workbench`.
- `prototype/package.json`: the six `*:workbench` scripts above (existing scripts unchanged).
- New: `workbench.html`, `vite.workbench.config.ts`, `tsconfig.workbench.json`, `vitest.workbench.config.ts`,
  `scripts/gen-workbench-schema.mjs` (+ `.d.mts` types for the spec), `scripts/zip-workbench.mjs`.

## Dependencies on the prototype (WB-2, WB-3)

- **Kit, by file only:** `@/components/ui/{primitives,data,form,select,charts}`, `@/styles.css`,
  `@/assets/beiersdorf-logo.webp`. `Modal`/`Drawer`/`Tabs` are **copied** into `ui/overlay.tsx` (the kit's overlay imports the
  prototype store). Never `@/components/ui` (the index), `@/store`, `@/domain`, `@/features`, `@/layout`, `@/portal`.
- **`src/portal/kf/kfsdk.d.ts`** (ambient module for `@kissflow/lowcode-client-sdk`) is used, not copied (a copy would
  duplicate the identifier). `tsconfig.workbench.json` lists it by path.
- Everything else from the portal is **copied**, never imported (connect + handshake, client, theme, loader, fonts).

`guards.spec.ts` enforces the import rules and the bans (switchRole, deleteItem, DELETE, updateAdminItem outside
`kf/sdk.ts` + `data/adminRepair.ts`, F8 updates in `data/audit.ts`, `toISOString(` outside `data/normalize.ts`).

## Map

| Folder | What |
|---|---|
| `schema/` | `generated.ts` (GENERATED, committed), `index.ts` helpers, `formulaSamples.ts` (shared formula vectors) |
| `kf/` | `sdk.ts` facade + `connectKf`, `app.ts` roles → capabilities, `viewAs.tsx` lens |
| `data/` | client + read ladder, tasks + step resolver, map + view models, hooks, write queue, writeVerified, actions, creates, audit (F8 create-only), counts, gates, adminRepair, pendingSheet, session, runtime |
| `domain/` | keys, flags (counts policy), config (pinned release, payload parsers, content hash), labels |
| `ui/` | StepForm, FieldInput, WriteOutcome, KwbFallback, ReadQualityBanner, ManualRecordNote, overlay, Toaster, badges, ConfirmDialog, FeatureStub |
| `shell/` | WorkbenchShell, nav (by capability), routes (registry), NoAccess, Offline, ConnectFailed |
| `pages/` | Diagnostics (+ redaction), Home, TaskRouter |
| `features/*` | The screens (§8), on the §12.2 signatures: `rmm`, `case`, `cr` (T1); `review`, `points`, `assess`, `rmes` (T2); `approver`, `admin`, `masters`, `reader`, `notes`, `audit` (T3) |
| `harness/` | T4's emulated Kissflow host engine (never in the bundle; marker `__WB_HARNESS_ONLY__`) |
| `testkit/` | Fake host client and runtime for specs (never imported by the app) |

## How features use the foundation

- Read with hooks (`data/hooks.tsx`): `useWorkbench()`, `useTasks()`, `useCaseList()`, `useCaseBundle(id)`,
  `usePoint(id, act?)`, `useCr(id, act?)`, `useFormRows(flow, where?)`.
- Write with `useActions()` or the module-level functions in `data/actions.ts` (same §12.2 signatures; the provider
  binds the runtime). Never call the SDK directly. Every step action needs the **held task** (`useTasks().heldTask`).
- Render results with `ui/WriteOutcome.tsx` (ok toast after read-back, not-kept, K-WB fallback, refused, timeout).
- Link a task with `taskPath(task)` / `taskRouterPath(task)` from `pages/TaskRouter.tsx`.
- Foundation changes: append to `CHANGE-REQUESTS.md` (T0 answers there).

## Integration and QA (T5, 2026-10-08)

Full run log for Thomas: `kissflow-build/ciq-digital/WORKBENCH-UI-LOG.md`. T5's notes: `NOTES-T5-integration.md`.

**Rebuild and re-check** (from `prototype/`; this is the design's "green", §10/§12.1 T5):

```bash
npm run typecheck && npm test && npm run typecheck:workbench && npm run test:workbench \
  && npm run build:workbench && npm run harness:workbench
node scripts/harness-workbench.mjs --screens ../kissflow-build/ciq-digital/workbench-screens   # optional
```

`vite build` empties `dist-workbench/`, so run the harness after the build. The harness loads Playwright from the
portal harness's absolute path (`…/Promotion Management/app/node_modules/playwright-core`), machine-specific (§11.1).
Its timing checks (S01, S37, S41) assume an otherwise idle machine.

**Results of the final run** (2026-10-08, build `2026-10-08T01:57:13.234Z`):

| Check | Result |
|---|---|
| `npm run typecheck` / `npm test` (portal and prototype, unchanged) | clean / 7 files, 81 passed |
| `npm run typecheck:workbench` | clean |
| `npm run test:workbench` | 46 files, 782 passed, 0 failed |
| `npm run build:workbench` | `dist-workbench/ciq-workbench-ui-4bbda410d4.zip`, 573 KB (limit 5 MB); guards passed |
| `npm run harness:workbench` | **68 passed, 0 failed, 0 pending of 68 runs** (50 scenarios + 18 `kwb=refuse` variants), 2079 checks; every P1 scenario in both variants; P2 too. Report `dist-workbench/harness-report.json` |

**Integration edits** (T5 may edit any `src/workbench/**` file to integrate; each is listed here and in
`NOTES-T5-integration.md`): `data/hooks.tsx` (task reload before the version bump; no `getItem` with a closed activity;
`useFormRows` `key?`), `data/session.ts` (`closedActs`), `data/actions.ts` (closed-activity marks; `changed()` after a
matching K-WB Re-read), `data/creates.ts` (`changed()` after a non-F8 Form create; Start activity marked closed),
`domain/keys.ts` (finding without a criterion keyed on its text), `ui/WriteOutcome.tsx` (`onResolved?`), new
`data/integration.spec.ts`, `scripts/harness-workbench.mjs` (`--screens`, `movedOutReads`). Every
`CHANGE-REQUESTS.md` entry is answered in place.

**Credential and `.env` checks:** `dist-workbench/zip/index.html` has 0 hits for `X-Access-Key` (any case), `access_key`,
`AccessKey`, `Bearer `, `client_secret`, `api_key`, `secret`, the account id, the sandbox host and the harness marker.
`gen-workbench-schema.mjs`, `zip-workbench.mjs`, `harness-workbench*.mjs` and the Vite/Vitest configs were read: none
reads `.env`, `.kf-env` or `process.env`.

## Live checks still open

See `NOTES-T0.md` and WORKBENCH-DESIGN.md §13.2: every [unverified] item is shown by Diagnostics on the first live run.
The list, in short: (1) `AppRoles` carry the CIQ role names; (2) which task-row key carries the step, and
`_activity_instance_id` in Part 2; (3) list rows carry all fields, admin rows `_status`; (4) a list route for View members
(K-14) and live Dataform `getItems`; (5) **K-WB** (a real user's `updateItem` after Start; does 050313 list the fields);
(6) a real user's `sendbackItem` and `openForm` inside an Application component; (7) SDK `rejectItem` / `withdrawItem`;
(8) write shapes for User, Reference, Date and clears, and the Form submit id; (9) the `getProgress` shape and
`Table::<server child model id>`; (10) blank vs 0 on a new case; (11) `getRoles` for non-builders; (12) SDK child-row
writes with client row `_id`s; (13) Dataform `discardItem()` without a draft; (14) child-column formulas on a Form row;
(15) a write naming a formula field (never sent).
