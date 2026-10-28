# CIQ Supplier Portal Custom UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build one React + TypeScript custom UI for the CIQ Supplier Portal. The Supplier role gets the prototype's supplier experience on live portal data; the Admin role gets a data console. Deploy it into the portal.

**Architecture:**
- A second Vite entry in `prototype/` (`portal.html` → `src/portal/**`), built into one self-contained HTML file.
- Supplier screens keep using the prototype's `useStore()` API (`StoreApi`). The portal swaps the implementation behind it:
  - **demo:** the prototype `StoreProvider`;
  - **live:** a store that assembles `CiqCase` objects from portal items and turns the supplier actions into portal writes.
- All Kissflow access goes through one `PortalClient` and one pure mapping module.

**Tech Stack:** React 19, TypeScript 7, Vite 5.4 with `vite-plugin-singlefile` 2.3.3, Tailwind 4, react-router-dom 6 (HashRouter), vitest 2. Kissflow custom-UI SDK (`window.kf`).

**Spec:** `docs/superpowers/specs/2026-10-07-portal-custom-ui-design.md`. Also read `kissflow-build/ciq-supplier-portal/BUILD-LOG.md` (the live portal) and `~/Downloads/master.md` §6 (custom UI rules).

## Global Constraints

- **Ids:** portal id `CIQ_Supplier_Portal_A00`. Role ids: Supplier `RoEK4XPKXCvH`, Admin `RoEK3_yhR4wx`. Flow ids live only in `src/portal/kf/portal.ts`.
- **Role signal:** `kf.user.AppRoles` (id first, name as fallback). No dev role switcher in production.
- **SDK:** `window.kf` installs asynchronously, so check `isLive()` per call. `kf.api` bodies are plain objects, never JSON strings.
- **Writes:** every write is read back; a 429 is retried with backoff (max 3); permission errors are surfaced, not retried.
- **Admin keys:** never in the bundle.
- **Build:** HashRouter, `base: ""`, one HTML file, zip ≤ 5 MB. Strip `crossorigin`; `manifest.json` = `{"Category":"Application","Framework":"React"}`.
- **Demo data:** fictional only. Supplier-facing text never shows internal data (no department decisions, RMES, notes).
- **Honesty:** a control that can't work live (file upload until K-12 passes) is disabled, with the reason shown.
- **Tests:** `npm test` (vitest, `src/**/*.test.ts`) and `npm run typecheck` must pass after every task.
- **No git repository** exists here. Instead of commits, run the checks; every task ends with `npm run typecheck && npm test`.

## File structure

| File | Responsibility |
|---|---|
| `src/store/store.tsx` (modify) | Export `StoreContext` so the portal can provide its own `StoreApi` |
| `src/portal/kf/sdk.ts` (exists) | Typed SDK surface, `isLive`, `waitForKf`, `rowsOf`, `errorText` |
| `src/portal/kf/portal.ts` (exists) | Portal ids, `FLOWS`, `ROLES`, `portalRoleOf` |
| `src/portal/data/raw.ts` | Raw item type and safe readers |
| `src/portal/data/answers.ts` | `Answers_JSON` format, merge, and read-merge-write with `Answers_Rev` |
| `src/portal/data/map.ts` | Portal items → `CaseBundle` → `CiqCase` / users / suppliers (pure) |
| `src/portal/data/fixtures.ts` | Live-shaped test items |
| `src/portal/data/client.ts` | `PortalClient`: every SDK / `kf.api` call, with retry |
| `src/portal/data/liveActions.ts` | Supplier actions as portal writes (async, testable) |
| `src/portal/data/LiveSupplierStore.tsx` | Loader, plus a `StoreApi` provider for live mode, plus live extras (notices, change requests, help) |
| `src/portal/mode.tsx` | Portal mode context (kf, role, client, demo flag) |
| `src/portal/demo/DemoSupplierStore.tsx` | Prototype store forced to the supplier persona |
| `src/portal/supplier/*` | Portal supplier shell, routes, Notices, Correction request, live Help |
| `src/features/supplier/*` (modify) | v2 rules: editable until the final release; no "review version" wording |
| `src/portal/admin/*` | Admin shell, overview, flow table, item drawer, help articles, roles & grants |
| `src/portal/PortalApp.tsx` (modify) | Boot, then route by role |
| `scripts/harness-portal.mjs` (modify) | Per-role headless checks with fixture data |

---

### Task 1: Store bridge, portal mode, demo store, role routing

**Files:**
- Modify: `src/store/store.tsx:91` (export the context)
- Create: `src/portal/mode.tsx`, `src/portal/demo/DemoSupplierStore.tsx`
- Modify: `src/portal/PortalApp.tsx`

**Interfaces:**
- Produces:
  - `StoreContext: React.Context<StoreApi | null>`
  - `PortalMode { kf: Kf | null; role: PortalRole; readyMs: number; demo: boolean; setDemo(v: boolean): void; client: PortalClient | null }`
  - `usePortalMode()`
  - `DemoSupplierStore({children})`

- [x] **Step 1:** In `src/store/store.tsx`, replace `const Ctx = createContext<StoreApi | null>(null);` with:
  ```ts
  /** Exported so the portal can provide its own StoreApi (live portal data) to the shared supplier screens. */
  export const StoreContext = createContext<StoreApi | null>(null);
  const Ctx = StoreContext;
  ```
- [x] **Step 2:** Create `src/portal/mode.tsx`. It's a context holding `{kf, role, readyMs, demo, setDemo, client}`. The demo flag is persisted in `localStorage["ciq-portal-demo"]`, with try/catch around every access.
- [x] **Step 3:** Create `src/portal/demo/DemoSupplierStore.tsx`. It renders `StoreProvider` plus a child that calls `setPersona("supplier")` once if the current persona isn't `supplier`, and renders `<Toaster/>`.
- [x] **Step 4:** Rewrite `PortalApp.tsx` routing:
  - `offline` shows a page with "Open demo preview" (it renders the supplier routes with `DemoSupplierStore`).
  - `supplier` → `LiveSupplierStore` (Task 5) + supplier routes (Task 6).
  - `admin` → admin routes (Task 8), plus `/portal/*` = supplier routes with `DemoSupplierStore` and a "Preview with demo data · Back to admin" bar.
  - `none` → "No access to the supplier portal", with the user's roles listed.
- [x] **Step 5:** Run `npm run typecheck && npm test`. Expected: PASS (the 19 existing tests).

### Task 2: Raw readers and the answers document (TDD)

**Files:**
- Create: `src/portal/data/raw.ts`, `src/portal/data/answers.ts`
- Test: `src/portal/data/answers.test.ts`

**Interfaces:**
- Produces:
  - `RawItem`, `str(it,k)`, `num(it,k)`, `json(it,k,fallback)`, `userIds(it,k)`, `refUser(it,k)`
  - `itemState(it): "open"|"completed"|"ended"`, `caseKeyOf(it)`, `childRows(it, tableId, rowField)`
  - `AnswerEntry`, `AnswersDoc`, `COMPONENTS_KEY = "K2.1-COMP"`, `parseAnswers(raw)`, `AnswerPatch`, `Who`, `applyPatch(doc, patch, who, at)`, `SectionIO`
  - `saveAnswers(io, patch, who, now, maxTries=3): Promise<{rev, tries}>`

- [x] **Step 1: Write the failing tests.**
  - `applyPatch` sets `v` with a by/at stamp, and keeps other keys.
  - A blank justification removes `just`.
  - `components` writes `rows` under `K2.1-COMP`.
  - `saveAnswers` writes rev + 1 and returns after a matching read-back.
  - `saveAnswers` retries when the read-back shows another writer's version without our key, and succeeds on the second try with both keys present.
  - `saveAnswers` throws after `maxTries`.

  Test the IO with an in-memory fake. Its `write` can simulate a concurrent writer once.
- [x] **Step 2:** Run `npx vitest run src/portal/data/answers.test.ts`. Expected: FAIL (module not found).
- [x] **Step 3:** Implement `raw.ts` and `answers.ts` (code in the repository; the behaviour is exactly as the tests state).
- [x] **Step 4:** Run the tests. Expected: PASS.
- [x] **Step 5:** Run `npm run typecheck && npm test`.

### Task 3: Mapping portal items to the domain (TDD)

**Files:**
- Create: `src/portal/data/fixtures.ts`, `src/portal/data/map.ts`
- Test: `src/portal/data/map.test.ts`

**Interfaces:**
- Consumes: Task 2 readers.
- Produces:
  - `CaseBundle { key; request?; sections; queries; completeness; finalRelease; notices; changeRequests }`
  - `Loaded { flow: FlowKey; item: RawItem }`
  - `groupBundles(loaded): CaseBundle[]` (latest cycle per case)
  - `derivePhase(b): Phase`
  - `toCase(b, bdfId): CiqCase`
  - `toSupplierSide(bundles, me): { cases: CiqCase[]; users: User[]; suppliers: Supplier[] }`
  - `BASIC_SECTION = "BASIC"`; `UPLOADS_TABLE = "CIQP_Section_A00_Uploads"`
  - `catalogSectionOf(sectionKey)` (BASIC → GEN)

- [x] **Step 1: Fixtures.** Write fixtures with live item shapes: flat fields as returned by `GET /process/2/{acc}/admin/{proc}/{item}` in `kissflow-build/ciq-supplier-portal/smoke-requests.jsonl`, plus `_status`, `_current_step` and `_created_at`. Cover:
  - a request (completed);
  - a BASIC section (open), with `Answers_JSON` holding SF01 and GEN answers;
  - a K2.1 section (open) with components and one upload row;
  - a completeness item (open);
  - a query round 1 (completed, answered) and round 2 (open);
  - a notice (open);
  - a second case in metadata (request open).
- [x] **Step 2: Write the failing tests.**
  - Two bundles result.
  - Phases: `supplier-input` for case A, `metadata` for case B.
  - Final release open → `final-release`; final release completed → `completed`; request rejected → `cancelled`.
  - The config holds SF01; answers hold the GEN values; components have one row.
  - The documents list has the upload with its file name and upload date.
  - The scope lists K2.1, mandatory, without BASIC.
  - The open point is `open`, with 2 rounds and a thread of question → answer → follow-up.
  - `toSupplierSide` gives `me.supplierId === "SUP-TEST-A"`.
- [x] **Step 3:** Run `npx vitest run src/portal/data/map.test.ts`. Expected: FAIL.
- [x] **Step 4:** Implement `map.ts`. Rules:
  - **Phase**, first match wins:
    - request ended → cancelled;
    - final release completed → completed;
    - final release open → final-release;
    - completeness completed → review;
    - request open → metadata;
    - any non-BASIC section → supplier-input;
    - otherwise scope-check.
  - **Answers:** merged across sections. Config keys SF01–SF12 go to `config`, `K2.1-COMP` to `components`, `just` to `justifications`, and `by`/`at` to `answeredBy`.
  - **Open points:**
    - Query rounds are grouped by `Query_Key`.
    - The status is `open` while the latest round is open, otherwise `in-progress`.
    - The kind comes from `Kind_Label`.
  - **BDF people** are pseudo users `bdf:<name>`.
- [x] **Step 5:** Run the tests. Expected: PASS. Then run `npm run typecheck && npm test`.

### Task 4: PortalClient (TDD)

**Files:**
- Create: `src/portal/data/client.ts`
- Test: `src/portal/data/client.test.ts`

**Interfaces:**
- Consumes: `Kf`, `FLOWS`, `PORTAL_ID`.
- Produces `PortalClient` with:
  - `listMine`, `listTasks`, `getFull`, `update`, `submit`, `create`
  - `listAll`, `adminGet`, `adminUpdate`, `adminDelete`
  - `formList`, `formCreate`, `formUpdate`, `formDelete`
  - `apiGet`, `accountId`

  Also produces `createClient(kf, {sleep?, retries?})` and `PortalError`.

  The admin calls use the verified REST routes through `kf.api` as the signed-in admin:
  - `GET` / `PUT` / `DELETE /process/2/{acc}/admin/{flow}/{id}?_application_id=CIQ_Supplier_Portal_A00`
  - `listAll` uses the SDK's `getAdminItems`.

- [x] **Step 1: Write the failing tests** with a fake `kf` that records calls.
  - `listMine` merges `getMyItems` and `getParticipatedItems`, de-duplicated by `_id`.
  - A 429 error is retried, then succeeds (the injected `sleep` is called).
  - A permission error throws `PortalError` without retry.
  - `adminDelete` calls `kf.api` with `DELETE` and the admin path.
  - `formCreate` calls `createItem` then `submitItem`, and returns the new id.
- [x] **Step 2:** Run the tests. Expected: FAIL.
- [x] **Step 3:** Implement `client.ts`.
- [x] **Step 4:** Run the tests. Expected: PASS. Then run `npm run typecheck && npm test`.

### Task 5: Live supplier actions and the live store (TDD)

**Files:**
- Create: `src/portal/data/liveActions.ts`, `src/portal/data/LiveSupplierStore.tsx`
- Test: `src/portal/data/liveActions.test.ts`

**Interfaces:**
- Consumes: `PortalClient`, `CaseBundle`, `saveAnswers`, `toSupplierSide`.
- Produces:
  - `loadSupplierData(client, me): Promise<LiveData>`
  - `LiveData { bundles; tasks: Map<string,string>; side; loadedAt }`
  - `liveActions(client, data, me, now)` returning async functions: `saveConfig`, `setAnswer`, `setComponents`, `setJustification`, `submitMetadata`, `confirmCompleteness`, `supplierRespond`, `finalRelease`, `acknowledgeNotice`, `createChangeRequest`
  - `LiveSupplierStore({client, me, children})`, which provides `StoreContext` and a `LiveExtras` context: `{ notices, changeRequests, articles, reload, acknowledgeNotice, createChangeRequest, busy, error }`
  - `useLiveExtras()`

- [x] **Step 1: Write the failing tests** with a fake in-memory `PortalClient`.
  - `setAnswer("FLD-K21-x")` writes the K2.1 section's `Answers_JSON` through its task's activity instance.
  - `saveConfig({SF01})` writes the BASIC section.
  - `confirmCompleteness` updates the confirm fields, then submits the completeness item.
  - `supplierRespond` updates `Response_Kind`/`Response_Text` on the open round of that `Query_Key`, then submits.
  - `finalRelease`:
    - updates `Section_Release_Confirm` and submits every open section;
    - then confirms and submits the final-release item;
    - in order.
  - An action on an item that isn't one of the user's tasks rejects with a clear message.
- [x] **Step 2:** Run the tests. Expected: FAIL.
- [x] **Step 3:** Implement `liveActions.ts`. Then implement `LiveSupplierStore.tsx`:
  - It loads on mount and shows a loading or error state.
  - It builds `AppState` from `toSupplierSide`.
  - Each `StoreApi` supplier method calls the matching live action, then shows a toast, then reloads.
  - Non-supplier methods show "Not available in the supplier portal".
  - `uploadDocument` shows an honest toast: "File upload from this screen is being verified; please upload in the section's Uploads table in Kissflow for now." (K-12).
- [x] **Step 4:** Run the tests. Expected: PASS. Then run `npm run typecheck && npm test`.

### Task 6: Supplier shell, routes and live-only screens

**Files:**
- Create: `src/portal/supplier/PortalSupplierShell.tsx`, `src/portal/supplier/SupplierRoutes.tsx`, `src/portal/supplier/Notices.tsx`, `src/portal/supplier/CorrectionRequest.tsx`, `src/portal/supplier/HelpLive.tsx`

**Interfaces:**
- Consumes: `useStore()`, `useLiveExtras()` (live only; undefined in demo), `usePortalMode()`.
- Produces:
  - `SupplierRoutes({ demo })`, served under `/portal/*`: Home, Tasks, Case, Help, Notices, Request a correction.

- [x] **Step 1:** `PortalSupplierShell`:
  - **Header:** the prototype `SupplierShell` look (logo, "Supplier Portal", supplier name).
  - **Nav:** Home, My tasks (with a count), Notices (live, with a count), Help.
  - **Removed:** `TopActions` and the role switcher.
  - **Footer:** "Beiersdorf Supplier Portal".
  - **Demo:** a "Demo data" badge when demo.
- [x] **Step 2:** `Notices`: list of `CIQP Notice` items (title, text, date, case). Open ones have an "Acknowledge" button, which calls `acknowledgeNotice` and reloads.
- [x] **Step 3:** `CorrectionRequest`:
  - **Form:** case (the user's cases), kind (the `CIQP Change Kind` values), section, field, current value, proposed value, reason.
  - **On submit:** `createChangeRequest`, then read back.
  - **Shows:** "Your request was sent to Beiersdorf".
- [x] **Step 4:** `HelpLive`: the live help articles, sorted by `Sort_Order`, with the prototype `SupplierHelp` look.
- [x] **Step 5:** `SupplierRoutes`. In demo mode, Help uses the prototype `SupplierHelp`, and Notices and Correction show demo explanations.
- [x] **Step 6:** Run `npm run typecheck && npm test`. Build with `npm run build:portal`, then run the harness `node scripts/harness-portal.mjs offline-demo /portal`. Expected: no page errors, and the screenshot shows the supplier home.

### Task 7: v2 editing rules in the supplier screens

**Files:**
- Modify: `src/features/supplier/SupplierCase.tsx:85-101`, `src/features/supplier/Completeness.tsx:117,173`, `src/features/supplier/lib.ts` (`supplierStatus` labels)

- [x] **Step 1:** In `SupplierCase.tsx`, the questionnaire is `locked={false}` in `review`, `overall-approval` and `final-release`. It stays locked only when `isClosed(c)`.
- [x] **Step 2:** In `Completeness.tsx`:
  - **Toast:** "Completeness confirmed. Beiersdorf can now review your questionnaire. You can still correct data and add documents until the final release."
  - **Modal note:** "After the confirmation you can still correct data and add documents until you give the final release."
- [x] **Step 3:** In `lib.ts`, `supplierStatus`: replace "submitted as review version v…" with "completeness confirmed · you can still correct data until the final release".
- [x] **Step 4:** Run `npm run typecheck && npm test`. Expected: PASS (the seed tests don't depend on this wording).

### Task 8: Admin console

**Files:**
- Create: `src/portal/admin/AdminShell.tsx`, `src/portal/admin/AdminOverview.tsx`, `src/portal/admin/FlowTable.tsx`, `src/portal/admin/ItemDrawer.tsx`, `src/portal/admin/HelpArticles.tsx`, `src/portal/admin/RolesGrants.tsx`, `src/portal/admin/AdminRoutes.tsx`

**Interfaces:**
- Consumes: `PortalClient` (from `usePortalMode().client`), `FLOWS`, `ROLES`, `Diagnostics`.
- Produces: `AdminRoutes()`, served under `/admin/*`.

- [x] **Step 1:** `AdminShell`:
  - **Sidebar:** Overview, one link per flow, Help articles, Roles & grants, Diagnostics, "Preview supplier view (demo)".
  - **Header:** "Portal admin", the user's name, a "Demo mode" toggle.
- [x] **Step 2:** `AdminOverview`: for each process, the count from `listAll` (an error state per card), with a link to its table.
- [x] **Step 3:** `FlowTable`:
  - **Rows:** `listAll(flow)`.
  - **Columns:** the key field (the first `*_Key`), Case Code, Supplier Code, current step, status, modified.
  - **Filters:** a search box (key / case / supplier) and a status selector.
  - **Row click:** opens the drawer.
- [x] **Step 4:** `ItemDrawer`:
  - **Shows:** `adminGet` with every field (JSON fields pretty-printed, read-only by default).
  - **Edit fields:** submits `adminUpdate` with only the changed fields, then re-reads.
  - **Delete:** with a confirmation, then `adminDelete`, then re-reads to confirm it's gone.
  - **Errors:** shown in the drawer.
- [x] **Step 5:** `HelpArticles`: list, create, edit and delete on `CIQP Help Article` through the form calls, each followed by a re-list.
- [x] **Step 6:** `RolesGrants`: read-only GETs:
  - `GET /app_role/2/{acc}/list?_application_id=…&page_size=100`
  - per role: `GET /app_role/2/{acc}/{id}?_application_id=…`
  - per flow: `GET /flow/2/{acc}/{process|form}/{id}/member?_application_id=…`

  It shows a matrix of roles × flows.
- [x] **Step 7:** Run `npm run typecheck && npm test`, build, then run the harness `admin /admin`. Expected: no page errors, and the overview renders with the stub counts.

### Task 9: Harness per role, build, deploy, docs

**Files:**
- Modify: `scripts/harness-portal.mjs` (fixture-backed stub, per-role runs, assertions)
- Create: `kissflow-build/ciq-supplier-portal/UI-LOG.md`

- [x] **Step 1:** Harness stub:
  - **Fixtures:** `getMyItems`, `getMyTasksItems`, `getItem` and `getAdminItems` return the Task 3 fixtures, exported as JSON from `src/portal/data/fixtures.ts` by a tiny build step: the harness imports `dist-portal/fixtures.json` written by `vitest`, or the fixtures are duplicated as JSON in the harness.
  - **Writes:** `updateItem` and `submitItem` record calls.
  - **Runs:** supplier `/portal`, supplier `/portal/case/ZZ-A`, admin `/admin`, admin `/admin/flow/request`, none `/`.
  - **Assertions:** no page errors; expected text present.
  - **Output:** screenshots.
- [x] **Step 2:** Run `npm run build:portal`, then all harness runs. Expected: all pass.
- [x] **Step 3:** Deploy with `node kissflow-build/ciq-supplier-portal/deploy-portal-ui.mjs prototype/dist-portal/<latest zip>`. Expected: upload Completed, publish 200, component Live.
- [x] **Step 4:** Write `UI-LOG.md`:
  - what was built;
  - the verified checks (unit tests, harness, deploy);
  - what still needs real users: Thomas opening it as Admin; MORNING-TESTS with suppliers; K-12 uploads.
