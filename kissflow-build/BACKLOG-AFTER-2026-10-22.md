# Implement list after the 22 Oct push

**Kissflow-internal.** Work that can go on in dev while Thomas is away (22 Oct to the Monday handover), plus later work.

**Rules while Thomas is away:**
- Agents work and test in dev only. Prod is never touched.
- A screen change reaches prod only by a new dev → prod push, done by Thomas or whoever he names.
- A deploy of a custom UI to dev needs his explicit OK. So do role changes.

## Before the Monday handover

### 1. Front-end clean-up: diagnostics, errors and warnings (Thomas, 22 Oct)

**Goal:** a tester sees no technical noise. They see only messages that mean something to them.

1. **Collect:** every user-visible warning, error, banner and diagnostic text in both screens: app (`prototype/src/app-live`, `features/*`) and portal (`prototype/src/portal`, `features/supplier`). Record where each one shows and when it fires.
2. **Classify each:**
   - **(a) Real problem:** fix the cause.
   - **(b) Test-data noise:** for example "… the pinned rule set is incomplete …" on the ZZT requests, whose questionnaire is fictional. Prod data won't trigger it; confirm, and make the wording calm.
   - **(c) Developer diagnostics:** keep in dev only. Hide in prod, or reword for a business user.
3. **Check the browser console** of both screens in the dev harnesses. Remove console errors and warnings the code causes.
4. **Gate:** unit tests, the app harness, the prototype harness and the portal harness, all green. Then one adversarial review.
5. **Deploy:** both UIs to dev (Thomas's OK), then a dev → prod push.

**Inventories (22 Oct, read-only, critic-checked):** the app in `ciq-digital/FE-CLEANUP-APP-INVENTORY.md` (app session), the portal in `ciq-supplier-portal/FE-CLEANUP-PORTAL-INVENTORY.md`. The portal's counts:

| Class | Count |
|---|---|
| Real problems | 13 (11 seen by suppliers) |
| Test-data noise | 3 |
| Developer diagnostics | 15 |
| D1 e-mail promises | 11 |

Fix these portal items first. The first two lose supplier data:
- **A12, a failed answer save looks saved:** the error toast disappears, then "Updated HH:MM" shows. Nothing retries, and closing the page loses the answer.
- **A14, a second "Report a change" replaces the first:** the earlier report is lost. Thomas decides: append the earlier reports to the new one, or refuse a second report.
- **Raw Kissflow errors reach suppliers** (C1–C3, C8–C10): a portal-only plain-error mapping with an allow-list of business texts, plus a collapsed "Technical details" for support.
- **A2, a failed release-step move gives a false message.**
- **A1, "Sending your report…" stays for 10 minutes:** the receipt hand-off isn't built.
- **B3, a contact linked to its portal user after a case started** gets the question tasks but never the request. The cause is app-side; the app session is checking it.

### 2. The open decisions in `MORNING-2026-10-22.md` §3

- **D1:** the screens promise CIQ e-mails that this version does not send. Recommended (b): texts without the promises (app session 1.5–2 h, portal about 1 h), plus FAQ rows 7–8.
- **D2:** five prototype features not in this version.

### 3. The portal hand-off fallback (only if prod main-run step 4 fails)

A supplier save doesn't reach the case. The prepared build is in `ciq-supplier-portal/fallback-account-host/`. Its README has the steps.

## Later (after the handover is fine too)

### 4. Load only what a screen shows (Thomas, 22 Oct)

**Today:** both screens read every item of every list they need when they load, in pages of 50 (`app-live/kf/client.ts` and `portal/data/client.ts`, `pageNumber`/`pageSize`). Then they compute everything in the browser: lists, counts, dashboards, filters, search and the case pages. With many cases this means many calls per load. That costs time and pushes against Kissflow's rate limit (the 429s of 21–22 Oct came from list-heavy reads).

**Wanted:** a list that shows 10 items asks Kissflow for those 10 only (`page_number`, `page_size`), and asks for the next page when the user changes page.

**What it involves:**
- **Each list:** filter, sort and search must go to Kissflow (the list API takes them), not run in the browser. Each list then needs its own query.
- **Counts and dashboards:** "Open", "Overdue", "My reviews" and similar need their own count queries, or a cached summary, instead of counting every item.
- **A case page:** reads its own case, reviews, open points and audit rows by case id, not the whole lists.
- **The load-time steps** (app: start reviews, RMES rows, the release request; portal: the release-step moves) must still find their items without reading everything. They need a targeted query each, for example "cases in review" or "requests with Release_Flag Requested".
- **Tests:** the fakes in the harnesses must page the same way, so that a missed query shows up as a test failure.

**Approach:**
1. Inventory every read and what each screen needs from it.
2. Change the data layer per screen behind the existing client functions.
3. Run the harnesses with large fake data sets (for example 500 cases) and count the calls per load before and after.
4. Test in dev, then deploy with Thomas's OK.

**Size:** large, several days. Split by screen; the RMM case list and the reviewers' My reviews first.

### 5. Kissflow's own notifications (Thomas, 22 Oct)

See the answer of 22 Oct in the session: which default notifications to switch off, and which deadline reminders to keep. If the CIQ e-mails of D1 (a) are built later, the default task notifications can go off everywhere.

## App session items (CIQ Digital app UI, app integrations, live tests)

### Before the Monday handover
- **A-1: front-end clean-up, the app half of item 1.** It covers `prototype/src/app-live` and the internal screens `features/{rmm,review,admin}` plus the shared components they use. The app session has started the read-only inventory and classification (22 Oct). It implements and gates in a scratch copy, then applies. **Deploy to dev needs Thomas's OK.**
- **A-2: D1 e-mail promises, app side.** About 15 strings, among them: NewCase:366, Dashboard:116, OpenPointsTab:279, ReviewQueue:97–98, ReviewWorkspace:95/194, OpenPointsPanel:121/160, AskModals:36, CompletePanel:219, and components/mentions.tsx:175/221. Option (b): a "mails live" flag in the live context, so live mode shows the texts without the promise and the prototype keeps its own.
- **A-3: finish the R4 showcase** (dev only, the app window :00–:28, 12 s). It waits for the portal session's "go". Then the handover clean-up list: R1 (67 items) and R4, plus Thomas's portal user unlinked on the R4 case supplier.

### Load-time redesign (Thomas approved, 22 Oct; the portal session leads)
- **Why:** the reviews and the final-release request no longer wait for RMM to open CIQ Digital.
- **Phase 1:**
  - **E-B** (new integration, on a CIQ Review that completes its workflow): reads every review of the case and releases when the latest round per department is Completed and the request's Release_Flag isn't "Requested". It writes the release fields, the case's Release_Requested_At and the release.requested history row, and approves the request's "keep" step.
  - **I-6** also approves "give".
  - **App side (A-9, app session):** remove `ensureRelease`, and say "the request goes on the last completion". Built and gated in a scratch copy (unit 1137/1137, harnesses app 46/46, prototype 18/18, portal 33/33). It deploys only after E-B is live in dev, with Thomas's OK.
- **Phase 2:**
  - **E-A** (inside I-2, before its Approve): creates the round-1 reviews from `Review_Depts` plus RMM, idempotent by Review_Key, each with its review.started history row.
  - **The portal** writes `Review_Depts` at the confirmation.
  - **App side:** then remove `ensureReviews`.
- **Mails from the app screens** (Thomas chose browser posts, 22 Oct):
  - **Events and recipients:** question edited or closed while the supplier's query waits, case cancelled, review reopened from the final release → the case's supplier contacts.
  - **Route:** a POST of {To, Subject, Body} to "Mail Integration - Thomas", sent only after the hand-off went out. The hook URL is SET:current `mailHook` (written by the portal session 14:35); the app builds it where it runs.
  - **Build state:** built and gated in the scratch copy (`write/mail.ts`; unit 1144/1144, app harness 47/47 with a `mails` scenario). It deploys with phase 1.
- **`Raised_By_Email`** on CIQ Open Point and CIQP Query (published 14:31):
  - **App:** writes it at raise. In the scratch copy; it deploys with phase 1.
  - **op.round copies it:**
    - The patch is in `ciq-digital/integrations`: integ-defs `harden.map`, `harden.mjs` upgrade path, `scripts/harden/op-round.js`, and the 21 Oct script kept as `op-round.2026-10-21.js`.
    - Offline tests pass: apply-harden.test 134/134, test-harden 182/182.
    - **Done (22 Oct 15:53–16:02 IST):** Thomas ran it in dev, exit 0, run record `ciq-digital/integrations/apply-harden-runs/opRound.2026-10-22T10-32-33-857Z.json`. op.round is Live and ON with the new script and the `Raised_By_Email` mapping. Both rounds' queries carry the point's `Raised_By_Email`; the twin round and a Completed point are refused.
    - **Clean-up done (22 Oct):** all 6 ZZT items deleted, each confirmed by a 404.
- **"Download PDF" on the Final document tab** (Thomas, 22 Oct):
  - **What:** the final-document service's PDF, built from `final-pdf/src/entry.ts` and `sync/pdf.mjs` with the same patches (`prototype/vite.finalpdf.ts`), dates in Europe/Berlin. Shown only for a Completed case.
  - **Tests:** byte-identical to `Bundle.gs` for ZZT-0005 (`features/rmm/finalPdf.test.ts`); harness scenario `final-pdf`.
  - **State:** built in the scratch copy; it deploys with phase 1. Check the download in Kissflow's frame after the deploy.
  - **New file:** `kissflow-build/sync/pdf.d.mts` (types only; agreed with the portal session).
- **Known gap:** a department that joins during the review (a section added later) gets no review until scope.extended is built (A-6). `ensureReviews` covered this until phase 2.

### Later
- **A-4: review completion by a real reviewer** has not been tested live; the reviewer roles are empty, so the key gets 050201. It needs a tester in each reviewer role.
- **A-5: saving gaps left open on 21 Oct:**
  - the close, edit, decision and reassign modals still drop their input when a save fails;
  - Decide's "Sending…" is never shown;
  - a new child row that shows up more than about 3 s late can still be added twice;
  - a failed hand-off leaves no lasting record (that needs a plan change: an audit row update).
- **A-6: four hand-offs neither sent by the app nor built as integrations:** change.received, case.reactivated, scope.extended, case.contacts (`shared/handoff.ts`: "Not sent by the app yet"). Diagnostics shows them "not configured: pending".
- **A-7: live test suite upkeep** (`prototype/live`, `npm run test:live`; offline by default):
  - remove the integrity snapshot overlay (`live/integrity/snapshotOverlay.ts`) once a newer snapshot has the Release_By_* fields;
  - integrity phases are heavy on list reads, so run them only in a quiet window (4 of the 7 429s came during them).
- **A-8: a contact linked to a portal user AFTER the case start gets question tasks but never the request.** Found by the portal session's critic as B3, confirmed in the app code 22 Oct.
  - **Why:** at the start, Case_Contacts_JSON and Portal_Contact_Ids hold only the contacts linked then, and I-1 assigns the request to them. A later raise recomputes the point's Portal_Contact_Ids from the current links (`encode.ts:127/167`, `caseMap.ts:86–95`), and op.round assigns the query from those.
  - **Options (Thomas):** (1) build the case.contacts hand-off (A-6), so the request's Assigned_Contacts and Release_Contacts follow contact changes, about half a day; or (2) app-only stop-gap: new points copy the case item's start-time Portal_Contact_Ids, so queries match the request, about 1 h.
