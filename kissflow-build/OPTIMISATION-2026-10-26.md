# Load optimisation, night of 25 → 26 Oct (deployed to DEV on 26 Oct, 11:30 IST)

**Kissflow-internal.** You chose "Big wins first" on 25 Oct. It was built and tested overnight in a copy, `kissflow-build/optimise-2026-10-26/prototype`.

**Deployed to dev on 26 Oct, 11:30 IST, on your request ("deploy the changes to dev as well"):**
- The tested files were copied into `prototype/`; the old ones are in `optimise-2026-10-26/pre-deploy-backup/`.
- The gate in `prototype/`: 1147/1148 unit tests (the known date test), app harness 48/48, portal harness 33/33.
- Live, read back:
  - app component CCEK4Jhdt04g: `ciq-app-ui-e2189ee265.zip`;
  - portal component CCEK4IlNaGsH: `ciq-portal-ui-52b56ddd0c.zip`.
- **Rollback:** `optimise-2026-10-26/rollback-zips/` holds the pre-change code, rebuilt in `prototype/` on 26 Oct: app `ciq-app-ui-a3c14d721f`, portal `ciq-portal-ui-5eb2571048`.
  - The earlier zips `27ce5178fd` and `3a4f13c748` were no longer on disk: each build empties `dist-*`.
  - Upload them with `node kissflow-build/ciq-digital/deploy-workbench-ui.mjs <zip>` (app) and `node kissflow-build/ciq-supplier-portal/deploy-portal-ui.mjs <zip>` (portal).
- **Build note:** the overnight builds in the copy were about 27 kB bigger, because the PDF builder was reached through a symlink and bundled the domain data twice. The `prototype/` builds deployed here don't have that.

## What changed

1. **Fewer, bigger list pages (app and portal).** Every list now asks for 200 rows a call instead of 50.
   - The REST list honours 200 (proven live 25 Oct: 80 history rows came back in one call).
   - A host that caps lower is still read to the end. A page of 50 rows or more is never taken as the last page, so at most one extra empty read.
   - Tested against a host that honours 200, one capping at 100, and one capping at 50.
2. **The portal reads its five task lists together**, not one after another. That is 1 round trip instead of 5, merged in the same order as before.
3. **The app keeps the full reads of finished items for the session.**
   - Finished means Completed, Withdrawn, Rejected or Cancelled: cases, reviews and open points.
   - Before, every load read every item again, one call each, and the app reloads after every step move.
   - Now a reload re-reads an item in full only when one of these is true:
     - it is open;
     - its list row shows another status;
     - its case got a new history row (CIQ Audit Event) since the kept read;
     - this load could not read the history.
   - A later change to a finished item writes a history row on its case, for example the final PDF or a reopen, so that item is read again.
   - The memory lives in the browser tab only. A new session reads everything once.
   - Diagnostics shows "(N kept from earlier this session)" per read.

## What it saves (dev today, read live 26 Oct)

- **Dev holds:** 34 cases (13 finished), 54 reviews (6 finished), 21 open points (18 finished), 80 history rows.
- **An RMM or admin reload:** 72 item reads instead of 109 (−34%).
- **In prod, cases pile up as finished,** so a reload's cost stays roughly the number of OPEN items, not all items ever.
- **Bigger lists:** a list of 1,000 rows takes 6 calls instead of 20.
- **Not changed: the first load of a session.** It still reads every item once.
  - Kissflow's admin list rows carry every business field, but not `_modified_at`, `_completed_at` or the step.
  - Without those, some finished items would lose their dates on screen, so I didn't take that shortcut.

## What I tried and dropped

- **Keeping supplier details between loads:** dropped. Kissflow's form list rows have no `_modified_at` (checked live on a ZZT supplier: a contacts-only edit changed nothing on the list row). So a change can't be detected, and the code would never have kicked in.
  - The probe edited one contact's title and put it back; verified.
- **RMES records:** always read again. Complete review decides from them, so they must be fresh.
- **Showing the screen after the first page:** not done. The load-time checks and the review gate decide from complete data. A half-loaded screen would feed them partial data.

## Tests (all on the copy)

- **Typecheck:** clean.
- **Unit tests:** 1147 of 1148 pass, 6 of them new: reuse on reload; a new history row; a reopened item; history unreadable; a new session; the by-id route.
  - The one failure, `features/review/lib.test.ts` "counts the answers to check", also fails in the untouched `prototype/`. A fixture due date became "overdue" because today's date passed it, so it's unrelated to this change.
- **App harness:** 48/48.
- **Portal harness:** 33/33. The paging scenario was updated to 200-row pages: 3 pages plus at most one empty read.
- **Prototype harness:** 18/18.
- **Offline live suites:** 119/119.
- **Built, not uploaded:** `optimise-2026-10-26/prototype/dist-applive/ciq-app-ui-6122902883.zip` and `dist-portal/ciq-portal-ui-d1f4fb7c9a.zip`.

## Unverified

- Whether the SDK host honours `pageSize: 200` (the REST route does). If it caps lower, the code still reads everything, just in more calls.

## How it was deployed (for prod or a redo)

1. **Apply the changes to `prototype/`:**
   - `optimise-2026-10-26/optimisation-src.diff` (src: 10 files, +243 −28);
   - `optimisation-harness.diff` (the portal harness).
   - `prototype/src` was unchanged when the copy was made. If the app session changed it since, its files are listed in `optimise-2026-10-26/APP-SESSION-CHANGES.txt` (none at 01:00 IST).
2. **Run the gate in `prototype/`:** `npm run gate:applive`, `npm run build:portal`, `node scripts/harness-portal.mjs`.
3. **Upload both zips** with your OK. The build is the same for dev and prod: the hand-off URLs are built at runtime.
4. **Check in dev:**
   - Load the app as RMM, move one case, and look at Diagnostics: the reload shows "kept from earlier this session" on the case, review and open point reads.
   - Then open a finished case: it should look exactly as before.

## Next, if you want true page-by-page lists later

This needs Kissflow-side filter, sort and search per list, and a case index that doesn't read every history row. The filter part of Kissflow's list API isn't proven here, so the first step would be a read-only probe of which filters the list calls accept.
