# CIQ Supplier Portal: custom UI log

Kissflow-internal. Design: `docs/superpowers/specs/2026-10-07-portal-custom-ui-design.md`. Plan: `docs/superpowers/plans/2026-10-07-portal-custom-ui.md`.

Every claim below is tagged:
- **[verified]**: checked by a test, the harness or a REST read-back, as stated.
- **[unverified]**: not yet observed in Kissflow; it needs a real signed-in user.

## As deployed (2026-10-07, second version)

| What | Value |
|---|---|
| Bundle | `prototype/dist-portal/ciq-portal-ui-71810c31a7.zip`: 496 KB zip (was 1083 KB), single-file `index.html` + `manifest.json` `{"Category":"Application","Framework":"React"}`. Build stamp shown on Diagnostics: `2026-10-07T10:53:39.182Z` |
| Target | Sandbox portal `CIQ_Supplier_Portal_A00`, Application component `CCEK4IlNaGsH` (the app's component `CCEK4Jhdt04g` was not touched) |
| Deploy | `deploy-portal-ui.mjs`: upload `Completed`, publish 200. Read-back: component `Live`, source `Zip`, file name `ciq-portal-ui-71810c31a7.zip` **[verified]**. Report: `deploy-report.json` |
| Portal deploy | The portal record shows `LastDeployedAt 2026-10-07T09:38:29Z`: Thomas's deploy, 10 minutes after the first, broken bundle was uploaded. **Thomas deploys the portal again** so its URL serves this bundle. No portal-deploy API is documented, so that stays a builder click |
| Credentials | None in the bundle. The `.env` key id and secret were searched for in the built HTML and not found; no `X-Access-Key` string either **[verified]** |

## Why the first version said "Not running inside Kissflow" inside Kissflow

The first bundle waited for a `window.kf` that the Kissflow host never installs. A custom UI gets the SDK only by bundling `@kissflow/lowcode-client-sdk` and awaiting `initialize()`, which posts `CC_INITIALIZE` to the parent frame and resolves when Kissflow answers.

**Evidence:**
- The SDK source (`kfsdk.es.js` 1.0.49).
- The two working POCs on this machine (Promotion Management `sdkInit.ts`, CAFM `sdk.ts`) both do exactly this.

The harness had passed because it also installed `window.kf` by hand. Nothing in the app backend was involved: the screen came from the boot step, before any data call.

**Fixed:**
- `src/portal/kf/sdk.ts` `connectKf()` bundles the SDK and races the handshake with a 12 s timeout, because the SDK itself waits forever.
- Opened directly (not in a frame), the UI says so at once instead of after 15 s.
- In a frame with no answer, it shows "Couldn't connect to Kissflow" with Try again.

## Live facts the code now follows

| Fact | Source |
|---|---|
| Lists come back as `{ items, total }` (declared `QueryResponse`); hosts have also answered `{ Data, count }` or a bare array. The SDK unwraps one-key replies. Unknown shapes are now refused, never read as "no data" | SDK `index.d.ts`; CAFM D55; Promotion Management |
| Lists page 50 rows by default; every list is now paged to the end | SDK source |
| `getItem`/`updateItem`/`submitItem` need the item's activity instance; a full read is skipped (not attempted) without one | SDK source |
| DateTimes with milliseconds are rejected; every DateTime is written as `…:ssZ` | CAFM `sdk.ts` (live) |
| `kf.api` write bodies must be a JSON string with a Content-Type header. Only the admin REST fallback uses them; normal admin edits use the SDK's `updateAdminItem` | CAFM D55 (live) |
| The admin list has no current step; the admin table reads it per open item | CAFM D55 (live) |
| SDK rejections are `{ isError, errorMessage }`; error text is now read from `errorMessage` | SDK source |

## What the UI does

Stack: React 19 + TypeScript, Vite 5 (single file), HashRouter, the prototype's UI kit and Tailwind tokens. The source is `prototype/src/portal/`, built with `npm run build:portal`.

| Role (from `kf.user.AppRoles`) | Gets |
|---|---|
| Supplier (`RoEK4XPKXCvH`) | The prototype's supplier screens on **live portal items**: My requests, Tasks, Case (questionnaire), Notices, Corrections, Help. Answers save automatically, coalesced per section; every write runs on one serial chain, and a step is not sent if its last answers were not saved. The header shows "Saving…" or "Updated <time>"; a failed refresh shows a banner with Try again; items that could not be read in full are listed |
| Admin (`RoEK3_yhR4wx`) | **Admin console** at `/admin`: overview counts; a table per process (search, status filter, current step); an item drawer (every field, including fields this item never had; edit changed fields only, then read back and compare; delete with confirmation, then read back); Help articles (create, edit, delete with confirmation); Roles & grants (read-only); Diagnostics (shape of every list answer, fields per row, activity ids on task rows, container check). **Preview supplier view** shows the supplier screens on fictional demo data and writes nothing |
| Neither | "No access to the supplier portal", listing the user's roles. No item reads |

**Requested changes (7 Oct):**
- **INCI and material number:** `CIQP Request` now has `Main_INCI` and `BDF_Material_No` (live; see BUILD-LOG). The supplier screens show them under the material name, and hide the labels only when X1 sent no value.
- **Loader:** the Beiersdorf logo with a progress bar. It shows from the first paint (static HTML, before the bundle runs), while connecting, and while a supplier's questionnaires load. The bar stops under "reduce motion".
- **Theme:** light by default whatever the OS prefers, with dark on request (moon/sun button in both headers, remembered per browser).
- **Size:** the bundle shrank from 1083 KB to 496 KB, because the portal now embeds only the Latin and Latin Extended fonts (other scripts use the system font).

**Supplier visibility rule:** Kissflow lists a supplier only the items they started, the items that are their open task, and the items they acted on. So a contact may not see a request a colleague completed. The UI then builds the case from the items it can see (case code as the name) and treats the basic data as sent.

**Deviation from the plan:** Task 8 asked for a header "Demo mode" toggle. The sidebar link "Preview supplier view (demo)" and the bar's "Back to admin" set the same flag, so there is no second control.

## Checks run

| Check | Result |
|---|---|
| `npm run typecheck` | clean **[verified]** |
| `npm test` | 81/81: 19 prototype + 62 portal **[verified]** |
| `node scripts/harness-portal.mjs` | **11/11 scenarios, 93 checks** **[verified]**. Report: `prototype/dist-portal/harness-report.json`; screenshots `harness-*.png` |
| Backend after the field change | verify 324/324 (draft and published fields, types, Required); smoke 16/16 with cleanup verified (BUILD-LOG) **[verified]** |
| Independent review | 5 reviewers + 5 skeptics confirmed 32 defects. A second pass of 5 checkers re-read the code: 23 fixed, 8 partly fixed, 1 pending (the redeploy, now done), and 7 distinct regressions. All were then closed, with two limits. Steps, permissions and assignees are still verified from the draft only: no runtime endpoint for them is known. A contact assigned to the BASIC section but not to the still-open request would see the case as "basic data sent". X1 and X2 send the same contacts, so this needs inconsistent data |

**How the harness works.** It runs the built bundle in an iframe on one origin, under an emulated Kissflow host page on another, so the bundled SDK's real postMessage protocol is exercised. The host deliberately doesn't make the UI's job easy:
- per-user lists;
- the `{ items, total }` shape;
- task reads and writes refused without the current activity instance and an assignee;
- millisecond DateTimes and object `kf.api` bodies refused;
- errors in the SDK's own shape;
- an optional sparse list-row mode.

**Scenarios:**
- opened outside Kissflow;
- Kissflow not answering, then Try again;
- no role;
- supplier, including the theme;
- second contact (Ben);
- sparse list rows;
- `{ Data }` envelope;
- supplier writes: autosave, completeness, answering a question, the basic-data guard, a correction request;
- supplier release: basic data submitted, then final release;
- admin: edit, delete, help, roles, preview;
- paging past 50 rows.

What the harness proves: the bundle and the SDK's protocol, against a host shaped by the evidence above. It does **not** prove how the real Kissflow host answers.

## Live check by Thomas (7 Oct, Diagnostics as Admin, build 2026-10-07T10:53:39.182Z)

**Verified live:**
- The SDK handshake works.
- Container is `CIQ_Supplier_Portal_A00`, account `AcDOSunMEpSA`.
- Role: Admin; `getRoles` answers, so this is a builder session.
- `kf.api` lists the 8 portal flows (array, 11 fields on a row). File upload API: available.
- **List shapes per process:**
  - My items answers `{Columns, Data}`.
  - My tasks and All items (admin) answer `{_id, Columns, Sort, Filter, Data}`.
  - `rowsOf` reads all of them through `Data`. There is no total or count key, so paging ends on a short page.
- All items (admin) answers for Thomas, with 0 rows: the portal holds no items now, because the smoke tests delete theirs.

**Open, first thing to resume:**
- **Participated fails on every process.** The host answers "some error occured" to `getParticipatedItems`.
  - The client reports it as a warning rather than failing the load. So every supplier would see a "could not be read" note, and items a contact completed would not be listed.
  - Next: find out whether it fails only for this builder/admin session or for supplier users too, and whether the command needs other arguments (e.g. an `activityId`).
  - If it can't be fixed: drop it, and decide how suppliers see completed items (carry the case header on every supplier item, or use a list a supplier can read).
- **Fields on a list row:** still unknown, because there are 0 rows. Needs seeded items, e.g. `seed-morning-tests.mjs`.

**Development is on hold** (Thomas, 7 Oct) until the app is done.

## Still unverified: needs the live portal

1. **Runtime in Kissflow.** After Thomas redeploys the portal, open it as Admin. Diagnostics should show:
   - Connected;
   - Container `CIQ_Supplier_Portal_A00`;
   - the build stamp above;
   - per process, the list shape and fields per row.

   That one screen answers most of the questions below **[unverified]**.
2. **List rows.** Whether list rows carry every field. If they are sparse, a supplier sees a completed request by its case code only, without its name, INCI or number; the harness's sparse scenario shows exactly this. The fix would be a backend decision: carry the material identity on every supplier-facing item **[unverified]**.
3. **Admin rights of the portal Admin role.** The role holds Member + Initiate + View on processes, not flow Admin. Admin edit and delete were proven only with the account-admin key **[unverified]**.
4. **Supplier runtime** (MORNING-TESTS v3 with real supplier contacts): "any of" with two contacts, supplier isolation, initiation of change requests **[unverified]**.
5. **Uploads (K-12).** The upload button shows an honest "not available yet" message **[unverified]**.

## Rebuild and redeploy

Run from `prototype/`:
```bash
npm run typecheck && npm test && npm run build:portal && node scripts/harness-portal.mjs
```
Then, from the project root:
```bash
node kissflow-build/ciq-supplier-portal/deploy-portal-ui.mjs prototype/dist-portal/$(cat prototype/dist-portal/latest.txt)
```
Then deploy the portal in Kissflow so its URL serves the new bundle.
