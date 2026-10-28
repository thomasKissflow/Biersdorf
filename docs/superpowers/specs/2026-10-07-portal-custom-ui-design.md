# CIQ Supplier Portal custom UI: design

**Status:** approved by Thomas on 2026-10-07 ("perfect start the build"). React + TypeScript, as Thomas requested.
**Backend it runs on:** the v3 portal (`kissflow-build/ciq-supplier-portal/BUILD-LOG.md`).

## Goal

One custom UI in the CIQ Supplier Portal, serving two roles:
- **Supplier:** the prototype's supplier experience, which Thomas approved, wired to the live portal flows.
- **Admin** (Kissflow builders): a data console over every portal process and the Help Article form. Admins can view, search, edit, withdraw and delete items, and manage help articles. Roles and grants are read-only. Flow definitions are **not** edited from the UI; they stay in the builder and the build scripts.

## Decisions

| # | Decision |
|---|---|
| D1 | **Second build target in `prototype/`**: `portal.html` → `src/portal/**`, reusing `@/components/ui`, `@/domain/*`, `@/features/supplier/*` and `styles.css`. Built with `vite.portal.config.ts` and `vite-plugin-singlefile` into one HTML file, zipped as `index.html` + `manifest.json` by `scripts/zip-portal.mjs`. Uses HashRouter |
| D2 | **Role from `kf.user.AppRoles`** (role id first, name as fallback): Supplier `RoEK4XPKXCvH`, Admin `RoEK3_yhR4wx`. No dev role switcher in production. Admin can preview the supplier view in **demo mode only** |
| D3 | **Live + demo.** Supplier = live portal items. Demo = the prototype's seeded fictional cases. The Admin switches demo mode on. Screens never branch on mode |
| D4 | **The store interface is the seam.** Supplier screens keep calling `useStore()` (the prototype's `StoreApi`). The portal provides either the prototype's `StoreProvider` (demo) or a **live store** that assembles `CiqCase` objects from portal items and implements the supplier actions as portal writes |
| D5 | **Mapping is pure and tested.** `src/portal/data/map.ts` converts portal items to domain objects. It is the only place that knows portal field ids, and it's unit-tested with item shapes captured from the live portal |
| D6 | **Writes are real and read back.** Each action is a Kissflow call followed by a read-back. Concurrent edits to `Answers_JSON` use `Answers_Rev`: read, merge, write, read back, and retry up to 3 times. A 429 is retried with backoff. Permission errors are surfaced, never retried forever |
| D7 | **Template rendering (MVP limitation).** Questionnaire fields render from the bundled catalog (template CIQ-2026 v1, FLM v0.6), which matches the definitions copied into the sections. A new template version needs a UI release, until a JSON renderer for `Definition_JSON` is added |
| D8 | **Diagnostics** page for Admin: SDK, role, account, per-flow reachability, build stamp |
| D9 | **Deployment** over access-key REST into the portal's single Application component (`deploy-portal-ui.mjs`). Verified 2026-10-07: upload Completed, component Live |

## Supplier mapping (live)

| Screen / action | Portal source |
|---|---|
| My cases | `CIQP Request` items the user takes part in (`getMyItems`, `getParticipatedItems`), plus each item read in full |
| Case contents | Request + Sections + Queries + both Confirmations + Notices, grouped by `Case_Code` + `Cycle_No` |
| `saveConfig`, `setAnswer`, `setComponents`, `setJustification` | Update the matching `CIQP Section` (`BASIC` for configuration) as its assignee: read-merge-write of `Answers_JSON` with `Answers_Rev` |
| `uploadDocument` | The section's `Uploads` child table: `initForm` → `getTable` → `addRow` with the file. Unverified (K-12), so a failure is shown honestly |
| `submitMetadata` | Submit the request at "Supplier: submit basic data" |
| `confirmCompleteness` | Fill and submit the open `CIQP Completeness Confirmation` |
| `supplierRespond` | Fill and submit the open `CIQP Query` round |
| `finalRelease` | Submit every open section (with `Section_Release_Confirm`), then fill and submit `CIQP Final Release` |
| Notices | List and acknowledge `CIQP Notice` items |
| Request a correction | Create and submit a `CIQP Change Request` |
| Help | List `CIQP Help Article` rows |

**Derived phase.** Request open → metadata. Request done, no sections → scope check. Sections open, no completeness item → supplier input. Completeness item open → supplier input (confirmation due). Completeness done → review. Final-release item open → final release. Final release done → completed.

## Admin console

| Area | What it does |
|---|---|
| Overview | Count of items per flow, with links |
| Flow table | `getAdminItems` (fallback: my items), filters (case, supplier, step, status) and search |
| Item drawer | Every field. Edit through `updateAdminItem`. Withdraw / delete with a confirmation, then read back |
| Help articles | Create, edit and delete |
| Roles & grants | Read-only, from `kf.api` GETs |
| Diagnostics | As D8 |
| Demo mode | Toggle |

## Testing

- **Unit tests (vitest):** mapping and live-store logic, with a fake `kf` that records calls.
- **Harness:** headless render of the built bundle with a stub `window.kf`, for each role (admin, supplier, none). No page errors; screenshots.
- **Live:** deploy, then Thomas opens it as Admin; then MORNING-TESTS with real supplier users.

Nothing is claimed as verified before it has run live.
