# Front-end clean-up, portal half: classified inventory (22 Oct)

**Kissflow-internal.** This is the portal half of BACKLOG-AFTER-2026-10-22 item 1, plus the portal side of D1. It uses the same classes and format as `kissflow-build/ciq-digital/FE-CLEANUP-APP-INVENTORY.md`. Thomas's goal: "a tester sees no technical noise; only messages that mean something to them".

**How this was made:**
- Read-only, from code. Nothing was run, built or called. Line numbers are as of 22 Oct.
- Two local reads only:
  - the last portal harness report (`prototype/dist-portal/harness-report.json`, 21 Oct 17:32; no portal, supplier or shared source file is newer than it);
  - the prod config seed rows (`kissflow-build/config-seed/rows`), read by a local node one-liner.
- Paths are relative to `prototype/src/` unless they start with `kissflow-build/`.
- **Scope:** `portal/**`, `features/supplier/**`, and the shared parts they render (`components/ui/*`, `components/DocName.tsx`, `shell/*`, `store/portalCaps.tsx`, `store/store.tsx`, the domain texts they show).
- **Out of scope:** `app-live/**` and the internal screens (app session).

**Who sees it** (column "Who"):
- **S:** a supplier contact (portal role Supplier), in both envs. Prod testers are here.
- **A:** the portal Admin role: Kissflow builders only, never Beiersdorf staff or suppliers (CLAUDE.md portal rule).
- **D:** dev only (account `AcDOSunMEpSA`).
- **O:** the page opened outside Kissflow, or the Admin's demo preview.

**Env facts the plan relies on:**
- **The env:** `envOf(kf.account._id)` (`shell/env.ts:11`), read once in `portal/mode.tsx:85`. Every portal screen reaches it through `usePortalMode().env`, LiveSupplierStore included: it renders inside PortalModeProvider (`PortalApp.tsx:72-83`, `:143`).
- **Before the handshake no env is known:** the static loader (`prototype/portal.html:19`), "Connecting…" (`PortalApp.tsx:137`) and ConnectFailed (`PortalApp.tsx:110-127`).
- **Prod has no top bar:** `PortalTopBar.tsx:23` renders only when `env === "dev"`.
- **ProductionContext is `true` in the live supplier screens in both envs** (`portal/data/LiveSupplierStore.tsx:573`). It is `false` in the Admin's demo preview and the offline demo: `DemoSupplierStore` provides none, and the default is `false` (`components/ui/primitives.tsx:154`).
  - So the field ids (`features/supplier/FieldRenderer.tsx:248-252`), SF codes (`ConfigQuestions.tsx:45`, `:79-83`) and rule ids (`ScopePreview.tsx:123`) are already hidden from suppliers.
  - It can't separate dev from prod.
- **A supplier can't reach Diagnostics or the admin console.**
  - SupplierApp's only routes are `/portal/*`, and `*` goes to `/portal` (`PortalApp.tsx:76-81`), so typing `#/admin/diagnostics` lands on My requests.
  - Diagnostics is an admin page (`portal/admin/adminRoutes.tsx:29`). It is in the admin side pane in both envs (`AdminShell.tsx:32`).
- **Hand-offs are fire-and-forget** (`portal/data/client.ts:175-220`): a no-cors POST counts as sent once the browser hands it over.
  - A warning shows only when the POST could not go out at all: the fetch threw, and then the SDK route failed too.
  - A refused or OFF integration, or a wrong token, shows nothing on any screen (`kissflow-build/TEST-GUIDE-PROD.md` §3).

**Classes** (as in the app inventory):
- **(a)** A real problem. Fix the cause.
- **(b)** Test-data noise. It fires on fictional or ZZT dev data only; the prod check is given.
- **(c)** A developer diagnostic. Keep it in dev; prod gets a business wording.
- **(d)** Fine as is.
- **(e)** A D1 e-mail promise. Leave it until Thomas decides D1. The proposed live text is given, ready to apply.

**[D2]** marks a fix that touches a prototype feature this version doesn't have (MORNING-2026-10-22 §3 D2).

---

## Summary

| Class | Count | Seen by a supplier in prod |
|---|---|---|
| (a) Real problem | 13 | 11 (A9 is admin-only; A13 is console only) |
| (b) Test-data noise | 3 | 0 (prod checks below) |
| (c) Developer diagnostic | 15 | 14 (C14 is admin-only) |
| (d) Fine as is | 19 rows | — |
| (e) D1 e-mail promise | 11 (10 in code, 1 in seed data) | 10 (E9, the old FAQ, goes with A6) |

**Console:** 3 rows, counted above (A13, and two (d) rows). The last harness run had no `pageerror` and no `console.error` in any of its 33 scenarios. Warnings are not collected **[unverified]**.

**The five that matter most:**
1. **Raw Kissflow errors reach suppliers in prod** (C1-C3, C8-C10). Examples:
   - "Not saved: KISSFLOW_ERROR_0503…";
   - "CIQP Request Pk…: …" in the "could not be read in full" box;
   - "(… (fetch); … (SDK))" inside the hand-off warnings.
   - **Fix:** one portal `plainError()` plus prod one-liners. Dev keeps the raw text.
2. **A12:** an answer that failed to save looks saved. After an 8 s toast the side pane says "Updated HH:MM". Nothing retries it until the next edit, and closing the page loses it.
3. **A2:** a failed release-step move makes the release card say a colleague can give the final release. Nobody can. The real cause sits, with raw text, in the collapsed "could not be read in full" box.
4. **A1:** "Report a change" shows "Sending your report…" for 10 minutes, because the receipt hand-off (change.received) is not built. Its refusal text says "in about a minute".
5. **B1:** "… the pinned rule set is incomplete …" can't fire on prod data (checked three ways below). It becomes a dev-only note, with a calm prod line kept as a backstop.

---

## (a) Real problems: fix the cause

| # | file:line | Current text / behaviour | When it fires · Who | Fix |
|---|---|---|---|---|
| A1 | `portal/data/LiveSupplierStore.tsx:453`, `portal/data/liveActions.ts:393`, `:411`; `features/supplier/PhaseViews.tsx:320`, `:387`; `portal/data/map.ts:159`, `:603-608` | "Sending your report…" (banner), "· sending to Beiersdorf…" (list), and on a second report "Your previous report is still being sent to Beiersdorf. You can send another one in about a minute." | **Every** change report, for 10 minutes (`REPORT_PENDING_MS`). Receipts only come back through change.received, which is not built (BACKLOG A-6). The report itself reaches the app at once through request.changed. · S | **Keep the 10-minute guard**, so a second report doesn't overwrite the first before the app reads it. Fix the texts:<br>• PhaseViews:320 → "Report sent · you can send another one after {HH:MM}"<br>• PhaseViews:387 → " · sent to Beiersdorf"<br>• LiveSupplierStore:453 and liveActions:393 → "Your report has been sent to Beiersdorf. You can send another one about 10 minutes after the last one."<br>• liveActions:411 → "A colleague of your company sent a report a few minutes ago. You can send yours about 10 minutes after it."<br>Once change.received exists, the old wording is true again. |
| A2 | `portal/data/liveActions.ts:426-429`, `:478-479` → `LiveSupplierStore.tsx:96` → `portal/supplier/PortalSupplierShell.tsx:86`; `features/supplier/PhaseViews.tsx:199` with `LiveSupplierStore.tsx:495-499` | **The card is wrong:** the final-release card says "{colleague} can give the final release for your company." or "This step is assigned to another contact of your company, who can give the final release."<br>**The cause is hidden:** it is filed under "N items could not be read in full", with raw text. | Release_Flag is "Requested" but the submit of "keep the CIQ up to date" failed (a 429, a refusal or a timeout). The request stays at "keep"; phaseOf makes it final-release (`map.ts:123`, `:127`). `releaseId` is undefined, so `canAct` is false and `whoCanAct` names the colleagues. Nobody can release. · S | **Fix the card:** when the case awaits the release but no release task is held and `local.moves` has a failed move for its request, show the C11 text in its place, not OnlyOthers.<br>**Move the warning:** out of the "could not be read" list, into its own per-request notice (C11). |
| A3 | `portal/supplier/PortalSupplierShell.tsx:76`; `portal/data/liveActions.ts:86`, `:308`, `:330`, `:359`, `:418`; `portal/PageBoundary.tsx:19` | "Couldn't refresh from Kissflow: Kissflow did not answer within 30 s. … went through.**.**"; hand-off warnings "(… went through.)**.**"; "(….)" | Any cause that already ends in ".": `client.ts:87`, every Kissflow refusal text, and `sdk.ts:142`. · S (dev text) | Strip a trailing `[.\s]` before adding ".", as the app's A2 does. One helper, `trimEnd`, in the new `portal/data/userText.ts`. |
| A4 | `portal/data/LiveSupplierStore.tsx:330` | "Your latest answers were not saved, so this step was not sent. Check the fields marked above and try again." | A task action (confirm, answer, release, report, upload, remove) after a failed autosave. **No screen marks unsaved fields.** · S | "Your latest answers could not be saved, so this step was not sent. Your answers are still on the screen: wait a moment, then try again." |
| A5 | `features/supplier/AnswerDrawer.tsx:223`; `FieldRenderer.tsx:129`, `:189`; `RequestedDocuments.tsx:80`; reason from `LiveSupplierStore.tsx:500-503` | "The item this question refers to is assigned to a colleague, so the document has to be uploaded by them." / "This part of the questionnaire is assigned to a colleague, so only they can upload here." | In live, `canUpload` is false only when the questionnaire is locked (final release requested) or the request is not the contact's task. Sections are no longer assigned to colleagues (plan v5). Typical case: a document request answered while the release is requested. · S | Give `PortalCaps` an optional `uploadBlocked(caseId): "locked" \| "no-task" \| null`.<br>• **locked:** "Your questionnaire is locked while Beiersdorf waits for your final release, so no file can be added now. You can answer in text instead."<br>• **no-task:** "This request can't take files from you right now. Reload the page; if this stays, tell your Beiersdorf contact."<br>The prototype keeps its colleague text (its default caps). |
| A6 | `features/supplier/SupplierHelp.tsx:140` (with `:20-37`, `:66-88`) | Help shows the **old flow**: "Answer the basic questions… Beiersdorf releases…". Without help articles, the old FAQs show too, among them "ask for a correction under **Corrections** instead" (`:86`). No Corrections page exists. | A live contact with no request yet (`cases.some(isLiveScope)` is false). The FAQs also show when the help-article list fails: `LiveSupplierStore.tsx:226` swallows the error. · S | Every live request is live-scope (`map.ts:589`). So in the live portal always use STEPS_LIVE and FAQS_LIVE: `const live = !production \|\| livePortal \|\| cases.some(isLiveScope)`. The old FAQS (E9) are then never shown live. |
| A7 | `portal/data/LiveSupplierStore.tsx:278` + `portal/data/answers.ts:144`, `:146` | "Not saved: This request is closed (…), so it can no longer be changed. **Your change was not saved.**" / "Not saved: Your questionnaire is locked … Your change was not saved." | An autosave refused by the lock. · S | For a `LockedError`, toast its own text without the "Not saved: " prefix. Other errors keep the prefix (see C8). |
| A8 | `features/supplier/SupplierCase.tsx:46` | Live: "It does not exist or belongs to another company. You only see the requests Beiersdorf sent to your company." | A deep link to a request the contact holds no task on. Live shows only the requests a contact is **named** on (FAQ `SupplierHelp.tsx:95`). · S | Use the prototype's sentence in live too: "It does not exist, or you are not a named contact on it. You only see the requests Beiersdorf sent to you." |
| A9 | `portal/pages/Diagnostics.tsx:56-61`; `portal/admin/common.ts:8`, `:13` | The Diagnostics row "CIQP Final Release · Supplier: give the final release" probes the **Final Release** process with the request's release activity id. The "view the released CIQ" step is missing. The admin Overview and side pane list "Final releases" as a live process. | Always. Since 16 Oct the release is a step of CIQP Request (`kf/portal.ts:20-21`, `:46`), and the screens read five lists (`LiveSupplierStore.tsx:35-43`). · A | **Diagnostics:** LISTS = `LiveSupplierStore`'s `TASK_LISTS` (release and released on `request`).<br>**Admin console:** FLOW_LABEL.finalRelease "Final releases (not used)". Either keep it in PROCESS_KEYS for the old items, or drop it as the other unused flows were (Thomas's call). |
| A10 [D2] | `features/supplier/parts.tsx:226`; `features/supplier/SupplierCase.tsx:189`; `features/supplier/SupplierHelp.tsx:123` | "Added to your questionnaire: K6.9 … **You also get a task for it.**" / "Beiersdorf's reviewers **are told about each change and look at it again**." | **The task:** after completeness, a metadata answer that adds a section. The prototype raises an "additional-part" open point for it (`domain/actions.ts:297-300`, `:394`). Live saves the answers only (`LiveSupplierStore.tsx:397-402`), and no `app-live` code reacts, so no task arrives.<br>**"Look at it again":** the automatic reopen is a D2 feature. · S | Behind the live flags of `components/liveFeatures.tsx` (app plan; see Shared code):<br>• `parts.tsx:226` live: "Added to your questionnaire: {links}." (no task sentence);<br>• `SupplierCase.tsx:189` and `SupplierHelp.tsx:123` live: "Beiersdorf's reviewers see each change."<br>The app's live text for ReviewWorkspace:194 matches ("the change is marked here"). **[check with the app session]** that the app shows a section the supplier's answer added. |
| A11 | `portal/supplier/PortalSupplierShell.tsx:51`; `LiveSupplierStore.tsx:207-218` | "Saving…" | Also on a plain reload: Reload button, page load, Try again. `busy` counts reads too. · S | Count writes apart from reads: "Saving…" only while a write runs, "Loading…" while only a read runs. SidePane takes the text as a prop; no shared change. Low priority. |
| A12 | `portal/data/LiveSupplierStore.tsx:268-284` (+ the toast timeout `components/ui/overlay.tsx:168`) | One "Not saved: …" toast (6-8 s). The reload after it then sets "Updated HH:MM". The value stays on screen and in the queue, but **nothing retries it** until the next edit or task action. No unload guard. | A failed autosave: a 429 after retries, a timeout, a refusal, or "a colleague saved at the same moment" (`answers.ts:174`). · S | While `queue` holds a patch that failed:<br>• the side-pane status reads "1 change not saved · Retry" (Retry calls `flushNow`);<br>• the shell shows "Some of your answers are not saved yet. [Save again]";<br>• re-arm the 700 ms timer once, after 5 s.<br>Optional: a `beforeunload` prompt while the queue isn't empty. |
| A13 | `portal/main.tsx:8` | React 19's default `onCaughtError` logs each boundary-caught error once more, besides `PageBoundary.tsx:12`. | A real page crash only. · console | As the app's console row: pass a no-op `onCaughtError` to `createRoot` (the boundary logs), so there is exactly one console error per crash. **[unverified]** whether the production build logs twice. |

**Known and outside this clean-up:**
- **A hand-off that Kissflow refuses is silent** (fire-and-forget, above).
- **A failed completenessConfirmed (I-2) can't be re-posted** from the portal (TEST-GUIDE-PROD). The warning tells the supplier to tell Beiersdorf, which is the only remedy today.
- **The prod domain check** (TEST-GUIDE-PROD "Before the push" step 1) decides whether every portal hand-off reaches prod. The fallback build is in `kissflow-build/ciq-supplier-portal/fallback-account-host/`.

---

## (b) Test-data noise: prod data won't trigger it (checked)

**What the prod checks rest on:**
1. **The seed:** its published release `REL:RS-2026.1 + v1` (`kissflow-build/config-seed/rows/REL_RS-2026.1_+_v1.json`) holds a bundle with rule set RS-2026.1: 25 rules, every one with a string `id`, an object `condition` and an `activates` array. Its questionnaire CIQ-2026 v1 has 44 sections, every one with a string `id` and a `fields` array. This is exactly what `parseBundle` (`portal/data/bundle.ts:76-92`) requires. Checked locally on 22 Oct.
2. **Case start:** a case started in the app builds the bundle from its release. `supplierBundle` throws before anything is written when the release names no versions or has no sections (`app-live/shared/caseStartPayload.ts:69-82`). It stores the canonical text with its SHA-256 (`:96-107`), "so the hash the portal recomputes … matches by construction".
3. **The Start integration:** it creates the portal request with `Config_Bundle_JSON` and `Config_Bundle_Hash` in the same create (`kissflow-build/night-2026-10-20/INTEGRATIONS-BUILD-SHEET.md:33`). So no prod request exists without its bundle.

| # | file:line | Current text | Why it fires in dev | Prod check | Action / calm wording |
|---|---|---|---|---|---|
| B1 | `portal/data/map.ts:629` with the reasons of `portal/data/bundle.ts:77`, `:82`, `:84`, `:87`, `:88`, `:90`, `:92`, `:117`; shown in the box `PortalSupplierShell.tsx:83-94` | "ZZT-…: **the pinned rule set is incomplete**. The standard questionnaire is shown until Beiersdorf's system pins the version." (and "no pinned questionnaire version on the request yet", "… can't be read (not JSON)", "… has an unknown format (…)") | The ZZT night requests carry a fictional questionnaire (`TEST-GUIDE-PROD.md:29`): "My requests lists every night ZZT request, each with the warning". · S (dev) | Checks 1-3: a valid bundle on every app-started request. | **Dev:** a "Notes" entry, as today.<br>**Prod backstop** (should never show), one line per request, no reason: "{material} ({code}): this request is shown with the standard questionnaire because its own version could not be read. Please tell your Beiersdorf contact before you continue." |
| B2 | `portal/data/LiveSupplierStore.tsx:116` (`bundle.ts:147-154`) | "{code}: the pinned questionnaire version does not match its fingerprint. Tell your Beiersdorf contact." | Script-made requests with a hand-written hash. · S (dev) | Check 2: the hash is over the stored canonical text. Check 3: the integration copies both unchanged. | **Dev:** note. **Prod backstop:** the B1 line. |
| B3 | `portal/data/map.ts:625` | "{code}: a task for this request arrived, but the request itself is not one of your tasks, so it is not shown." | Test scripts raise queries for portal users who are not assignees of the request. · S (dev) | Queries go to `Portal_Contact_Ids`, the same portal contacts as the request's `Assigned_Contacts` (sheet `:35`). No screen removes a contact from a running request (case.contacts is not built, A-6). **[unverified]** for an item deleted by a Kissflow admin. | **Dev:** note. **Prod:** not shown (the request is not shown either). |

---

## (c) Developer diagnostics: dev keeps them, prod gets a business wording

**Rule for every row:**
- **Dev** keeps today's text: raw ids, flow names and errors, with the A3 punctuation fix.
- **Prod** shows the "Prod" column.

**plainError() (new, portal-only: `portal/data/userText.ts`)** maps only `PortalError`, the client's wrapper for every Kissflow failure (`client.ts:12`, `:101`). It uses the same tests as `client.ts:14-21` (`isRateLimited`, `isDataRefusal`). Plain `Error`s thrown by `liveActions.ts` are business refusals and pass through unchanged: NOT_YOURS, MAY_NOT, the blocker lists, REOPENED_TEXT, the lock texts, "Describe what has changed.".

| Cause (PortalError) | Prod sentence |
|---|---|
| Rate limit (429) after the 3 retries | "Kissflow is busy right now. Wait a minute, then try again." |
| "did not answer within" (`client.ts:87`) | "Kissflow did not answer in time. Reload the page to see whether your change went through." |
| Refusal: 0503xx, 403, "permission", PermissionDeniedToUpdate | "Kissflow did not allow this change. Reload the page; if it stays, tell your Beiersdorf contact." |
| fetch, network | "The connection to Kissflow was interrupted. Try again." |
| Anything else:<br>• `client.ts:26`, `:28`, `:118`, `:159`, `:180`, `:190`, `:193`, `:214`, `:217`, `:222`;<br>• `sdk.ts:166`, `:169`;<br>• the JSON fallback `sdk.ts:194` | "Kissflow could not complete the request. Try again; if it stays, tell your Beiersdorf contact." |

### C-shell: banners, boundaries and full-page states

| # | file:line | Current text | When · Who | Prod |
|---|---|---|---|---|
| C1 | `portal/supplier/PortalSupplierShell.tsx:83-94` | A collapsed box, "{n} item(s) could not be read in full; what you see for it/them may be incomplete.", over the raw list. | Any load warning. · S | **Split the feeders:**<br>• **Read failures:** `LiveSupplierStore.tsx:80`, `:87`.<br>• **Notes:** B1-B3, never shown in prod.<br>• **Release-move failures:** their own notice (C11), in both envs.<br>**Prod** shows one line, no list and no count: "Some of your requests could not be loaded completely, so parts of this page may be missing. [Reload]".<br>**Dev:** both lists, labelled "Could not be read" and "Notes". |
| C2 | `portal/data/LiveSupplierStore.tsx:80`, `:87` | "CIQP Request {Kissflow item id}: listed without its step, so it can't be opened." / "CIQP Query {item id}: {raw error}" | `:80`: a My tasks row without `_activity_instance_id` (never seen live: Diagnostics shows "activity id on rows: yes"). `:87`: a full read failed (429, timeout, refusal). · S | The C1 prod line only. The raw lines stay in dev and in the admin's Diagnostics. |
| C3 | `portal/supplier/PortalSupplierShell.tsx:76` | "Couldn't refresh from Kissflow: {raw}. You are seeing the data from HH:MM. Try again" | A reload fails after a good first load. · S | "Couldn't refresh your requests. You are seeing the data from {HH:MM}. [Try again]". |
| C4 | `portal/data/LiveSupplierStore.tsx:547-570` (title `:552`, body `:566`) | "Your questionnaires could not be loaded" / {raw loadError} | The first load throws. · S | Keep the title. Body: "Kissflow did not answer or did not allow the request. Try again in a moment; if it keeps happening, tell your Beiersdorf contact." |
| C5 | `portal/PortalApp.tsx:110-127` (detail from `portal/kf/sdk.ts:142`, `:143`, `:146`) | "Couldn't connect to Kissflow" / "{detail} If this keeps happening, reload the page." The detail is "Kissflow did not answer within 12 s.", "Kissflow answered without an account or app." or a raw error. | The handshake times out or is refused. **Before the env is known.** · S | Always the plain body: "Kissflow did not answer. Reload the page; if this keeps happening, tell your Beiersdorf contact." The raw `detail` goes into a collapsed "Technical details". **Map it here; don't change `sdk.ts`**, which the app imports (Shared code). |
| C6 | `portal/PortalApp.tsx:65` | "Your account ({email}) has no Supplier or Admin role in this portal (roles: {raw role names}). Ask your Beiersdorf contact to invite you." | A signed-in user with no portal role. · S | "Your account ({email}) has no access to the supplier portal yet. Ask your Beiersdorf contact to invite you." The role names stay dev only. |
| C7 | `portal/PageBoundary.tsx:18-19` | "This page could not be shown" / "Something in this request is not in the shape the portal expects ({error.message}). …" | A render error in a page. · S | The env comes as a prop from `PortalSupplierShell.tsx:103`. Prod: "Something on this page could not be shown. Your other requests are not affected. Reload the page; if it stays, tell your Beiersdorf contact which request you opened." |
| C13 | `prototype/portal.html:19` → `portal/PortalApp.tsx:137` → `LiveSupplierStore.tsx:545` | "Loading the supplier portal…" → "Connecting to Kissflow…" → "Loading your questionnaires…" | Every boot. · S | `PortalApp.tsx:137` → "Loading the supplier portal…" (the static label), so the sequence reads as two business steps. Low priority. |

### C-store: toasts from saves, task actions and hand-offs

| # | file:line | Current text | When · Who | Prod |
|---|---|---|---|---|
| C8 | `portal/data/LiveSupplierStore.tsx:278` | "Not saved: {raw}" | An autosave throws. · S | "Not saved: {plainError}", with the A7 rule for LockedError and the A12 status. `answers.ts:174` ("…a colleague saved this questionnaire at the same moment…") passes through: a plain Error. |
| C9 | `portal/data/LiveSupplierStore.tsx:341`; feeders `liveActions.ts:109`, `:114`, `:127`, `:161`, `:205`, `:225`, `:277`, `:282`, and every PortalError | {raw error} as a red toast | Confirm, answer, release, report, upload or remove fails. · S | PortalError → plainError. **Reword two plain Errors in both envs:**<br>• `:205` "Kissflow stored {file} without an id, so it can't be added to the questionnaire." → "{file} could not be added to the questionnaire. Please try again."<br>• `:277` "Kissflow listed this file without its row id, so it can't be removed. Reload and try again." → "This file can't be removed right now. Reload the page and try again."<br>The others are business texts (d). |
| C10 | `portal/data/liveActions.ts:86`, `:308`, `:330`, `:359`, `:418` (posted at `:81`) | "Saved, but Beiersdorf's copy was not updated yet ({why}). It updates with your next save." / "Your confirmation \| answer \| final release \| report is saved \| sent, but it has not reached Beiersdorf yet ({why}). Please let your Beiersdorf contact know." | The hand-off POST could not go out. `why` is raw: `client.ts:87`, `:180`, `:190`, `:193`, `:217`, a Kissflow refusal. · S | The same sentences **without "({why})"**:<br>• "Saved, but Beiersdorf's copy was not updated yet. It updates with your next save."<br>• "Your confirmation is saved, but it has not reached Beiersdorf yet. Please let your Beiersdorf contact know." (answer, final release and report likewise)<br>**How:** `ActionOpts` gets `plain?: boolean` (set when `env === "prod"`), and `problem(why)` leaves the bracket out. |
| C11 | `portal/data/liveActions.ts:426-429`, `:478-479` | "{code}: Beiersdorf has requested your final release, but the request could not be moved on to it ({raw} \| Kissflow kept it at “Supplier: keep the CIQ up to date”). Close and reopen the portal to try again; if this stays, tell your Beiersdorf contact." (and the "reopened … returned to you for changes" variant) | A release-step move failed on load; it repeats on every load. · S | Its own notice on My requests and on the request (A2), in both envs; dev adds the raw cause:<br>• "{material} ({code}): Beiersdorf has requested your final release, but the portal could not open the release step. Close and reopen the portal to try again; if this stays, tell your Beiersdorf contact."<br>• "{material} ({code}): Beiersdorf reopened its review, but the portal could not return the questionnaire to you for changes. Close and reopen the portal to try again; if this stays, tell your Beiersdorf contact." |
| C12 | `portal/data/LiveSupplierStore.tsx:510` (`client.ts:222-223`) | "The preview could not open: {raw}" | Kissflow's preview refuses or is missing. · S | "The preview could not open. Try again in a moment." |
| C15 | `features/supplier/ComponentTable.tsx:133` | The row id ("c1", "c2" …) in mono next to "Component 1" | Every K2.1 row, live. · S | Show it only when `!useProduction()`, as `FieldRenderer.tsx:248` does for field ids. Low priority. |

### C-diag: the admin's Diagnostics

| # | file:line | Current | Prod |
|---|---|---|---|
| C14 | `portal/pages/Diagnostics.tsx:121`, `:140`, `:147-164`; `portal/pages/S1Tests.tsx` (all) | The **S-1 write tests**: 5 write tests that run on the builder's own ZZT- tasks, two of which submit for good. The **"Test upload (1-byte file)"** probe stores a real, unattached file in Kissflow. Both show in prod Diagnostics. | Render both only when `env === "dev"`. The read-only probes stay in both envs. · A |

---

## (d) Fine as is (meaningful to a tester)

| file:line | Text |
|---|---|
| `portal/PortalApp.tsx:44`, `:51` | "Not running inside Kissflow" + "Open demo preview" (outside a frame only · O) |
| `portal/supplier/PortalSupplierShell.tsx:63` | Demo bar "Preview of the supplier view with demo data. Nothing here is sent to Kissflow." (A, by URL only: no admin link opens it any more) |
| `portal/supplier/PortalSupplierShell.tsx:99` | Presence hint "{name} also worked on this questionnaire …" |
| `portal/data/LiveSupplierStore.tsx:379`, `:408`, `:417` | Lock, Beiersdorf-set and asked-component refusals |
| `portal/data/LiveSupplierStore.tsx:332`, `:434`, `:446`, `:451`, `:452`, `:454`, `:455`, `:509`, `:525`; `domain/actions.ts:648` | "Still loading — please try again in a moment.", "Your response was sent to Beiersdorf.", "Final release recorded. The CIQ is now frozen.", the report texts (except `:453`, A1), "File removed from the questionnaire.", COMPLETENESS_CONFIRMED |
| `portal/data/liveActions.ts:49`, `:51`, `:244`, `:260`, `:263`, `:265`, `:302`, `:351`/`:372`, `:394`, `:399`, `:400`; `portal/data/answers.ts:144`, `:146`, `:174`; `domain/permissions.ts:91` | NOT_YOURS, REOPENED_TEXT, MAY_NOT, the file-removal refusals, the blocker lists, the lock texts, "…a colleague saved … at the same moment…" |
| `portal/data/liveActions.ts:161`, `:225` | "{what} could not be saved: Kissflow did not keep it after 3 attempts. Please try again." / "{file} was stored, but Kissflow did not keep its place in the questionnaire. Please try again." (plain, actionable) |
| `portal/data/client.ts:163`, `:167` | "The upload of {file} did not finish within 2 minutes." / "Kissflow could not store {file}." |
| `features/supplier/FieldRenderer.tsx:69`, `:258-275`; `ComponentTable.tsx:27-30`, `:199-203`; `features/supplier/cas.ts` | Field validation, the above-limit hint, the component sum hint |
| `features/supplier/PhaseViews.tsx:191-236`, `:211`, `:329`, `:335`, `:381`; `features/supplier/Completeness.tsx` (all); `features/supplier/parts.tsx:263-269` | Release card and blockers, the locked-blockers note, closed and withdrawn banners, completeness check, OnlyOthers (except the A2 case) |
| `features/supplier/Questionnaire.tsx:133`; `SectionPanel.tsx:91-103`, `:118`, `:123-124`, `:166-167`; `features/supplier/AnswerDrawer.tsx:121`, `:160-164`, `:259` | "…no longer applies to your answers…", lock notes, "No questions apply…", documents-only chapters, "Beiersdorf changed this question while you were writing…", the closed-question note |
| `features/supplier/PhaseViews.tsx:308`, `:315`; `features/supplier/lib.ts:376`; `SupplierHelp.tsx:51` | "Beiersdorf has filed the final document." / "Released and filed by Beiersdorf". **[check]** It is true about 10-20 minutes after the release, once the final-pdf Apps Script runs in prod (TEST-GUIDE-PROD §4). Optional: "Beiersdorf files the final document." |
| `features/supplier/FieldRenderer.tsx:248-252`; `ConfigQuestions.tsx:45`, `:79-83`; `ScopePreview.tsx:123` | Field ids, SF codes, rule ids: hidden live (ProductionContext); shown only in the demo preview and offline demo (O) |
| `portal/PortalTopBar.tsx` (all), `shell/DevTopBar.tsx:16`, `:74`, `:123`, `:135`, `:182` | Dev top bar and role switcher, with its error "Kissflow did not switch your role: …" (D) |
| `shell/SidePane.tsx:61-115` | "Updated HH:MM", Reload, theme, menu toggle (A11 aside) |
| `portal/admin/AdminOverview.tsx:19`; `FlowTable.tsx:90`, `:114`; `HelpArticles.tsx:83`, `:120`, `:149`; `ItemDrawer.tsx:81`, `:107`, `:150`, `:205`; `RolesGrants.tsx:44`, `:49` | Admin console raw errors and builder notes ("Change roles and grants with the build scripts…"): builder tooling (A). Keep. |
| `portal/admin/AdminShell.tsx:20-23` | Both domains written for "Roles & grants": admin-only, harmless (`PROD-READY-2026-10-21.md:95`) |
| `portal/PageBoundary.tsx:12` | `console.error("Portal page failed:", …)`: a real crash only. Keep (see A13). |
| `store/store.tsx:244` | `console.error("[CIQ] consistency problem(s)")`: the prototype store only, which the portal mounts in the demo preview (O). Nothing to do. |

**Not reachable live:** leave these, or remove them when the file is open anyway.
- **Old-flow phases:** `features/supplier/PhaseViews.tsx:17-80` (ScopeCheckView, with its e-mail promise at `:65`), `:144-149` (old ReviewBanner), `MetadataStep.tsx`, and `LiveSupplierStore.tsx:403` submitMetadata. map.ts never yields "metadata" or "scope-check".
- **Not routed in the portal:** `features/supplier/SupplierTasks.tsx` (with its promise at `:48`; `portal/supplier/supplierRoutes.tsx:9-17`).
- **"Your access has ended"** (`SupplierHome.tsx:57-63`): live users never get `active: false` (`map.ts` People). This is D2.
- **`na()`** (`LiveSupplierStore.tsx:373`) "{what} is not available in the supplier portal.": no supplier screen calls those store members.
- **`client.ts:254`** "Discarding a draft is not available.": unused.

---

## (e) D1: texts that promise CIQ e-mails this build doesn't send

**How to switch them:** use the app plan's `LiveFeaturesContext` (`components/liveFeatures.tsx`, new; see Shared code).
- LiveSupplierStore provides `{ mails: false }`, next to `ProductionContext.Provider` (`LiveSupplierStore.tsx:573`), plus `extendScope` and `autoReopen` false for A10.
- The prototype and the demo preview keep their texts (the default).
- Kissflow's own task notifications may still arrive (TEST-GUIDE-PROD §4), so no live text promises or denies an e-mail.

| # | file:line | Current text | Live text |
|---|---|---|---|
| E1 | `features/supplier/SupplierHome.tsx:76` | "When Beiersdorf sends you a CIQ request, you get an e-mail and it appears here." | "When Beiersdorf sends you a CIQ request, it appears here." |
| E2 | `features/supplier/SupplierHome.tsx:110` | "When Beiersdorf needs something from you, a task appears here and you get an e-mail." | "When Beiersdorf needs something from you, a task appears here." |
| E3 | `features/supplier/SupplierHome.tsx:132` | "Nothing to do for now. You get a task and an e-mail if Beiersdorf needs anything." | "Nothing to do for now. A task appears under Your tasks if Beiersdorf needs anything." |
| E4 | `features/supplier/PhaseViews.tsx:101` | "If Beiersdorf has a question while reviewing, it appears here and you get a task and an e-mail." | "If Beiersdorf has a question while reviewing, it appears here and under Your tasks on My requests." |
| E5 | `features/supplier/PhaseViews.tsx:152` | "You get a task and an e-mail if Beiersdorf has a question. You can still correct data …" | "If Beiersdorf has a question, it appears below and under Your tasks. You can still correct data …" (rest unchanged) |
| E6 | `features/supplier/AnswerDrawer.tsx:250` | "… Beiersdorf reviews it; if anything else is needed you will get a new task and an e-mail." | "… Beiersdorf reviews it; if anything else is needed, a new task appears on My requests." |
| E7 | `features/supplier/SupplierHelp.tsx:114-115` (built-in FAQ: only when no help article loads) | "Which e-mails will I get?" with the full list of invitation, question, release, receipt, reminder and withdrawal mails | MORNING-2026-10-22 §3 D1, FAQ 7 text |
| E8 | `features/supplier/SupplierHelp.tsx:119` | "… You get a reminder e-mail before a task is due and when it is overdue; your Beiersdorf contact is informed if it stays open longer." | MORNING-2026-10-22 §3 D1, FAQ 8 text |
| E9 | `features/supplier/SupplierHelp.tsx:82` (old FAQ) | "You receive an e-mail when a new task arrives and a reminder …" | Not shown live once A6 is in. Nothing else to do. |
| E10 | `features/supplier/PhaseViews.tsx:434` | "…decides whether a new request is needed; you then get a new invitation." (the FAQ calls the invitation an e-mail) | "…decides whether a new request is needed; if so, the new request appears in the portal." |
| E11 | **Data:** `kissflow-build/CIQ-prod-seed-help-article-INTERNAL.xlsx`, rows "Which e-mails will I get?" and "What about deadlines and reminders?" | The same promises as E7 and E8. Live Help shows these articles, not the built-in FAQs (`portal/supplier/HelpLive.tsx:9-11`). | FAQ 7 and 8 texts of MORNING §3 D1. A data change: edit the two rows after the import, or the seed. No build. |

Also checked, no change needed:
- the "E-mail" rows in the confirmation and release modals (`Completeness.tsx:180`, `PhaseViews.tsx:283`, `:350`, `:362`; `SupplierHelp.tsx:111`): they record the contact's address, they promise nothing;
- "Your Beiersdorf contact: … · {email}" (`SupplierCase.tsx:93-99`).

---

## Console

| file:line | Call | When | Class / action |
|---|---|---|---|
| `portal/PageBoundary.tsx:12` | `console.error("Portal page failed:", error, componentStack)` | A real page crash only | (d) Keep. It is the only trace of a real defect. |
| `portal/main.tsx:8` (React 19 default `onCaughtError`) | Logs each boundary-caught error once more | The same crashes | (a) A13 |
| `store/store.tsx:244` | `console.error("[CIQ] consistency problem(s)")` | The prototype store, mounted only in the demo preview (O) | (d) |
| `@kissflow/lowcode-client-sdk` 1.0.49 | "Message callback error: …" | Only when one of our SDK callbacks throws | Third-party wording. If it appears, the bug is ours. |
| Browser network lines | A webhook `fetch` that fails at network level | A hand-off fails | Not a `console.*` call; it can't be silenced and is acceptable. |

There is no other `console.*` in `portal/**` (outside tests), `features/supplier/**`, `components/**` or `shell/**`. The last portal harness (21 Oct 17:32) collected `pageerror` and `console.error` in all 33 scenarios: none, except the harness's own two refused probes, which it filters out (`prototype/scripts/harness-portal.mjs:736-739`). Its run of `env=prod` (scenarios handoffs-prod, prod-no-topbar) is the place to add the prod checks below.

---

## The portal Diagnostics page, and what each user can reach

**Content** (`portal/pages/Diagnostics.tsx`, route `/admin/diagnostics`, side-pane entry "Diagnostics" in both envs: `AdminShell.tsx:32`). All probes are read-only, except the upload probe and the S-1 tests.
1. **Header:** "What Kissflow gives this custom UI, and how each portal process answers for you. Read-only." (`:108`).
2. **Session** (`:110-125`): "Connected to Kissflow in N ms", then:
   - Signed in as (name · e-mail);
   - Portal role (acting);
   - AppRoles (JSON of role names);
   - Account (id);
   - Container (app id, red "(expected CIQ_Supplier_Portal_A00)" when different);
   - `kf.api (list portal processes)` probe;
   - `kf.app.getRoles (dev only)` probe: "available (builder session): …" or "not available (published page)";
   - File upload: a "Test upload (1-byte file)" button, which **stores a real file** and shows Kissflow's raw metadata answer;
   - Build stamp.
3. **Supplier task lists** (`:127-139`): per process · step, three columns: My items, My tasks at this step, and All items (admin).
   - Each cell: row count, list envelope, fields on a row, and "activity id on rows: yes/NO · case code on rows: yes/NO".
   - Rows: fill, keep, respond, and "release", which probes the wrong process (A9). "Released" is missing.
4. **S-1 write tests** (`S1Tests.tsx`): 5 tests on the builder's own ZZT- tasks, with a ZZT- check on the full read before every write.
   - The tests: save, upload into Supplier_Files, Uploads row, submit "fill in the CIQ", answer a query.
   - Tests 4 and 5 ask first and submit for good.
   - Results show PASS/FAIL with raw Kissflow text.

**What a prod user can reach:**

| User | Diagnostics | Other technical surfaces |
|---|---|---|
| Supplier contact (all prod testers in the portal) | **None.** `#/admin/…` redirects to `/portal` (`PortalApp.tsx:79`). | The load-warning box (C1), the refresh banner (C3), the first-load page (C4), the page boundary (C7), the toasts (C8-C12), "No access" (C6), "Couldn't connect" (C5). |
| Portal Admin (Kissflow builders only) | Yes, always in the side pane. Prod should hide the S-1 card and the upload probe (C14). | Admin console: flow tables, item drawer with **Edit fields** and **Delete item** through the admin route, help articles, the "Roles & grants" button to Kissflow's own manage page. No top bar, so no supplier view in prod; the demo preview by typing `#/portal`. |
| No portal role | No | "No access to the supplier portal" with raw role names (C6). |
| Outside Kissflow | No | "Not running inside Kissflow" and the demo preview with field ids and rule ids (O). |

---

## Shared code: what the app session must be told

| File | Shared with | What this plan does there |
|---|---|---|
| `portal/kf/sdk.ts` | **The app imports it:** `connectKf` (`app-live/AppLiveApp.tsx:18`, whose ConnectFailed shows its `detail`: app C4); `errorText` (`app-live/LiveAppStore.tsx:34`, `load.ts:32`, `api.ts:28`, `Diagnostics.tsx:12`, `write/activation.ts:28`, `write/verify.ts:12`); types (`identity.ts`, `types.ts`) | **No edit.** C5 maps the detail at the portal's call site. If either session wants to change `errorText` or the `connectKf` details, agree first: both UIs' dev texts change. |
| `portal/data/bundle.ts` | The app imports `BUNDLE_FORMAT`, `canonicalJson` and `sha256Hex` (`app-live/shared/caseStartPayload.ts:13`, `write/activation.ts:26`) | B1 changes nothing in it: the prod line is built in `map.ts:629`. Its exports stay as they are. |
| `portal/BrandLoader.tsx`, `portal/theme.tsx`, `portal/data/raw.ts` | Imported by the app (`AppLiveApp.tsx:17`, `:19`; `LiveAppStore.tsx:32-33`; `load.ts:33`; …) | **No edit.** C13 changes only the portal's label prop (`PortalApp.tsx:137`). |
| `components/liveFeatures.tsx` (**new**, the app plan's) | Both UIs and the prototype | The portal **uses** it (E1-E10, A10): LiveSupplierStore provides `mails: false, extendScope: false, autoReopen: false`. **Order:** the app session creates the file; the portal's D1 change waits for it, or the first session to need it creates it with the app plan's default and tells the other. |
| `features/supplier/**` | The prototype app (supplier persona, `App.tsx`), the call build (`call/main.tsx`) and the prototype harness | Changes A5, A6, A8, A10, C15 and E1-E10 are flag- or caps-gated, so the prototype keeps its texts. `harness:prototype` must stay green. Not used by `app-live`. |
| `store/portalCaps.tsx` | Prototype and portal only (no `app-live` import) | A5 adds an optional `uploadBlocked`. The PROTOTYPE default returns `null`. |
| `domain/permissions.ts:91` (RELEASE_LOCKED_TEXT), `domain/actions.ts:648` (COMPLETENESS_CONFIRMED) | Prototype, portal, app domain | No change. A7 only drops the portal's own "Not saved: " prefix. |
| `shell/env.ts`, `shell/SidePane.tsx`, `shell/DevTopBar.tsx`, `shell/useCollapsed.ts`, `components/ui/*`, `components/DocName.tsx` | Both UIs | **No change.** A11 and A12 pass new status texts through SidePane's existing `status` prop. |
| `plainError()` | — | Portal-only, in `portal/data/userText.ts`. Its table matches the app's C-store table, with "your Beiersdorf contact" in place of "your CIQ administrator". Optional: one shared module, if both sessions agree. |

---

## Implementation plan (portal half; no `app-live/**`, no edit to `portal/kf/sdk.ts`)

1. **`portal/data/userText.ts` (new):**
   - `plainError(e)` and `trimEnd(s)` (A3);
   - the prod sentences of C1, C3-C7, C10-C12 and B1 as named constants, so the tests can assert them.
2. **Store** (`LiveSupplierStore.tsx`):
   - `const plain = useOptionalPortalMode()?.env === "prod"`;
   - toasts (C8, C9, C12) and `liveActions(…, { plain })` (C10);
   - A7, and A12's unsaved state, retry and status;
   - A1 texts;
   - warnings split into `readFailures`, `notes` and `moveFailures` (C1, C11), with `map.ts:625`/`:629` and `:116` pushed to `notes`.
3. **Actions** (`liveActions.ts`): `ActionOpts.plain` (C10); the C11 move texts (and a structured `{caseId, kind}` for A2); C9's two rewordings; A1 texts.
4. **Shell and boot:**
   - `PortalSupplierShell.tsx`: C1 and C3; the C11 notice; the A12 banner; A11; `env` to `PageBoundary`;
   - `PageBoundary.tsx`: C7;
   - `PortalApp.tsx`: C5 (collapsed details), C6, C13;
   - `main.tsx`: A13.
5. **Supplier screens:**
   - A2: FinalReleaseView, with a cap or flag from the store;
   - A5: caps `uploadBlocked`;
   - A6, A8, A10, C15;
   - D1 (E1-E10) behind `useLiveFeatures().mails`, when Thomas decides D1.
6. **Admin:** A9 (Diagnostics lists, FLOW_LABEL), C14 (dev-only S-1 and upload probe).
7. **Data (D1):** E11, the help-article rows.

**Rough effort:** steps 1-4 half a day; step 5 about 1 h plus the D1 hour; step 6 20 min; tests about 1.5 h.

**Gate:** unit tests (`portal/**/*.test.ts`, `features/supplier/*.test.ts`), the portal harness (dev and `env=prod`), the prototype harness, then one adversarial review. **The deploy to dev needs Thomas's OK.**

## Test ideas

1. **plainError unit tests:** inputs `KISSFLOW_ERROR_050313 …`, a 429, "Kissflow did not answer within 30 s…", "x (fetch); y (SDK)", "x (SDK); y (REST)", the JSON fallback, "Kissflow answered a list in an unknown shape…". Each maps to its sentence. A plain business Error (NOT_YOURS, MAY_NOT) passes through unchanged.
2. **A "no technical tokens in prod" render test** (`portal/shell.test.tsx` pattern, a mode with `env: "prod"`):
   - **Render:** the shell with read failures, notes, a move failure, a loadError and a page crash.
   - **Assert none of:** `/CIQP |_A00\b|KISSFLOW_ERROR|\((SDK|REST|fetch)\)|Activity_|Pk[A-Za-z0-9]{6,}|pinned rule set|fingerprint|\.\.|\.\)/`.
   - **Then:** the same render with `env: "dev"` still shows the raw lists.
3. **Store tests** (`liveActions.test.ts` pattern, fake client):
   - a failed autosave leaves "1 change not saved" until a retry lands (A12);
   - a LockedError toast has no "Not saved:" (A7);
   - a failed hand-off in prod has no bracket (C10);
   - a failed release move gives no OnlyOthers text (A2).
4. **Prod data:** `pinOf` on a request built by `caseStartPayload` from `config-seed/rows/REL_RS-2026.1_+_v1.json` gives no `problem`, and `bundleHashMatches` gives `true` (B1, B2).
5. **Portal harness, `env=prod`:** in the handoffs-prod and prod-no-topbar runs:
   - a refused list gives the one-line summary only;
   - a refused save gives a plain toast;
   - the release-step move failing gives the C11 notice;
   - Help with zero requests shows the three live steps (A6);
   - Diagnostics as Admin shows no S-1 card (C14).

   Then the same scenarios in dev, expecting the raw texts.
6. **D1:** a live render with `mails: false` over My requests, a request in review, the answer drawer and Help contains no "e-mail" except the contact-address rows listed under (e).

---

## Critic notes (22 Oct, completeness and classification review)

**How:**
- Read-only, from code. Nothing was run, built or called, and `.env` was not read.
- Local reads: the portal harness report (21 Oct 17:32; no in-scope source file is newer), `kissflow-build/night-2026-10-21/results.json`, `TEST-GUIDE-PROD.md`, the integrations build sheet, and `CIQ-UAT-test-cases.xlsx` and `CIQ-prod-seed-help-article-INTERNAL.xlsx` (both unzipped into the session scratchpad).
- **Grep:** `portal/**`, `features/supplier/**`, `components/**`, `shell/**` and `store/**`, for warning, error, toast, banner, refus, "could not", "not available", `console.` and `throw new`. Every hit is either in the inventory or listed below.
- **Console:** confirmed. Only `PageBoundary.tsx:12` and `store/store.tsx:244`.

### New rows

| # | Class | file:line | Current text / behaviour | When · Who | Fix |
|---|---|---|---|---|---|
| A14 | (a) | `portal/data/liveActions.ts:388-419`; `portal/data/map.ts:596-608`; app side `app-live/map/caseMap.ts:373-376` (`app-live/DESIGN.md:457`: "G6: latest only") | **A second change report replaces the first, on both sides.**<br>• **Portal:** the request holds one `Change_Report_Text`, and receipts (`Change_Reports_JSON`) are never written, because change.received isn't built. So "Changes you reported" lists only the latest, under the subtitle "Beiersdorf has been told about each one" (`PhaseViews.tsx:381`).<br>• **App:** request.changed copies the new text over the case's, and the app shows only the latest.<br>• **So A1's reason doesn't hold.** A1 keeps the 10-minute guard "so the app reads the first report first", but nothing on the app side keeps the earlier text. | A contact or a colleague sends a second report more than 10 minutes after the first. · S, and RMM in the app | **Thomas decides, before A1's texts ship:**<br>• **(1) Append.** The portal writes `Change_Report_Text` as the new report + "\n\nEarlier report ({date}): …" + the previous text. The case then keeps all of them, with no app change, and TC-36 still shows one card.<br>• **(2) Refuse a second report** until change.received exists: "You have already reported a change on this request. If something else has changed, tell {BDF contact name} ({e-mail})."<br>A1's "You can send another one about 10 minutes after the last one" must not ship without (1) or (2). |
| A15 | (a) [D2] | `features/supplier/SupplierHelp.tsx:107`; help-article seed row 5 ("Can several colleagues work on the same request?") | "… To add or replace a contact, ask your Beiersdorf contact." | Always on Help (live Help shows the seed row). **Beiersdorf can't do it in this version:**<br>• `app-live/api.ts:348` (updateCaseContacts is "not available in this version yet");<br>• `app-live/write/guards.ts:39` (contactOnOpenCases);<br>• the UAT readme: "a case started earlier never reaches that contact". · S | Live text, in both seed row 5 and FAQS_LIVE: "… Beiersdorf names the contacts when it sends the request. If a colleague is missing, tell your Beiersdorf contact." The seed part is a data change, like E11. |
| A16 | (a) | `portal/data/liveActions.ts:77-82`, `:172`, `:228`, `:285` → `LiveSupplierStore.tsx:233` | **One warning toast per autosave** while the hand-offs can't go out: every `patchRequest` posts request.changed. A lasting failure stacks a new toast every few seconds, and C10's "It updates with your next save" is false then. Examples:<br>• the fetch is blocked and the SDK route refuses too (the portal-domain risk of TEST-GUIDE-PROD "Before the push", step 1);<br>• the connection is offline. | A lasting hand-off failure. · S | **Report it once** per kind and request per page load (a `Set` in LocalNotes). From the second failure on, show one line: "Beiersdorf's copy of this request is not being updated right now. Your answers are saved here. Please let your Beiersdorf contact know." |
| A3+ | (a) | `portal/data/liveActions.ts:479` | "(KISSFLOW_ERROR_050302 You don't have permission to submit this item.). Close and reopen…" (the cause as in `liveActions.test.ts:762`) | A release-step move refused with a Kissflow text. · S (dev text, after C11) | Add it to A3's `trimEnd` list. |
| A10+ | [D2] data | Help-article seed row 9 ("Can I change an answer after confirming completeness?") | "Beiersdorf's reviewers are told about each change and look at it again": the same D2 promise as `SupplierHelp.tsx:123`. | Live Help shows the seed rows, not FAQS_LIVE (`HelpLive.tsx:9-11`), so A10's code change alone never reaches a supplier. · S | Change row 9 together with A10 ("Beiersdorf's reviewers see each change."), in the same data change as E11. |
| A17 | (a) | `kissflow-build/CIQ-UAT-test-cases.xlsx` | **The portal tests quote texts this plan changes:**<br>• TC-17 step 1 quotes `SupplierCase.tsx:189` ("…reviewers are told about each change and look at it again…");<br>• TC-17 step 3 quotes `parts.tsx:226` ("…You also get a task for it.");<br>• TC-35 quotes `PhaseViews.tsx:315` ("Beiersdorf has filed the final document.") and `lib.ts:376` ("Released and filed by Beiersdorf").<br>A10 changes both TC-17 texts. The optional (d) rewording would change TC-35's. | Any A10 or D2 change ships while the old quotes stay. | Update TC-17 in the same push as A10. Either skip the optional "Beiersdorf files…" rewording, or update TC-35 with it.<br>These stay valid: TC-40 (C6 keeps the title), TC-11 ("Saving…", "Updated …"), TC-35 step 5 (the report toast). |
| D+ | (d) | `features/supplier/AnswerDrawer.tsx:114` | The open point's key (`OP_Key`) in mono above the question | Every question, live. · S | A business reference the supplier can quote to Beiersdorf; the app shows the same key. Keep. |
| C14+ | (c) | `portal/pages/Diagnostics.tsx:108` | Subtitle "…Read-only." | Dev, while the upload probe and the S-1 tests show. · A | **Dev:** "Read-only, except the test upload and the S-1 tests." **Prod:** true once C14 ships. |

### The (b) claims, checked

| Row | Verdict | Why |
|---|---|---|
| B1 | **Holds for an app-started request, with one gap.** | **Evidence the inventory doesn't cite:**<br>• Night test Z11 (21 Oct) proved that I-1 copies a 112,109-character bundle byte for byte, with a matching sha256 (`night-2026-10-21/results.json`).<br>• The configuration is read-only in live (app A7), so no other release reaches prod.<br>**The gap:** when a request's full read fails (`LiveSupplierStore.tsx:83-88`: a 429, a timeout or a refusal), it keeps its My tasks list row.<br>• If that row carries `Case_Code` but not `Config_Bundle_JSON`, `pinOf` (`bundle.ts:117`) reports "no pinned questionnaire version on the request yet" on prod data. The request is then drawn on the built-in questionnaire, without its answers.<br>• If the row carries no `Case_Code`, the request silently drops out (`map.ts:64`).<br>**Which of the two happens live is [unverified]:**<br>• the harness's sparse rows keep `Case_Code` (`scripts/harness-portal.mjs:119`);<br>• live My items rows carry no business field (proven 21 Oct on CIQ Case);<br>• My tasks rows were never recorded (`UI-LOG.md`, 7 Oct: "still unknown, because there are 0 rows").<br>**Fix:**<br>• mark a `Loaded` that was not read in full (`partial: true`);<br>• skip the pin and hash checks for it;<br>• show that request as "could not be loaded just now" (part of the C1 line), never on the standard questionnaire.<br>The B1 prod backstop then fires only on a truly bad bundle. |
| B2 | **Holds.** | The canonical text and its hash are written together (`app-live/shared/caseStartPayload.ts:97-107`), and the copy is byte for byte (Z11). A list row without a bundle returns `undefined` (`bundle.ts:150`), so the read-failure gap doesn't apply. |
| B3 | **Doesn't hold: it likely fires on prod data. Reclassify it to (a).** | **How it fires:**<br>1. RMM names a contact on a case before the contact has a portal user. The contact is stored without an id (`caseStartPayload.ts:110`), and it isn't in the request's `Assigned_Contacts`, which I-1 fixes at the start from `Portal_Assignees_JSON` (sheet `:35`).<br>2. Thomas links the contact's portal user later (TEST-GUIDE-PROD §0 step 6; the UAT readme expects late links).<br>3. The app resolves the contact by e-mail (`app-live/map/caseMap.ts:82-92`) to the portal user id (`app-live/map/suppliersMap.ts:18-20`).<br>4. Every new open point then writes that id into `Portal_Contact_Ids` (`app-live/write/encode.ts:127`, `:167`).<br>5. The query reaches a contact who holds no request task, so `map.ts:625` fires.<br>The read-failure gap above (a row without `Case_Code`) also leads here.<br>**[verify with the app session]** that op.round assigns the query from the open point's `Portal_Contact_Ids`, as the inventory's own B3 check assumes.<br>**Cause (app side):** a point's portal contacts should be the case's start-time `Portal_Assignees_JSON` (or the `Case_Contacts_JSON` ids), not contacts resolved again later.<br>**Portal, prod:** don't hide it. Show "{code}: Beiersdorf sent you a question on a request you are not named on, so it can't be shown here. Please tell your Beiersdorf contact." Otherwise the contact holds an invisible task, and Kissflow's own due-date mails point at the form. |

### The (c) proposals: what a supplier or support would lose

1. **No support trail in prod.**
   - Every (c) prod line drops the raw cause. In the app, Diagnostics and the Writes log keep it in prod (app C26).
   - In the portal, Diagnostics is admin-only and shows the admin's own session, so a failure in a supplier's session leaves no trace. Yet TEST-GUIDE-PROD §3 step 5 asks for "the screen's message and the time".
   - **Add for banners:** in prod, a collapsed "Technical details" under the C1, C3, C4, C7 and C11 lines, as C5 already proposes, holding the raw text and the time.
   - **Add for toasts** (C8-C10, C12): a `console.warn` with the raw cause. The harness collects `console.error` only, so the clean-run check stays.
2. **C1 hides which request is affected.**
   - "Some of your requests could not be loaded completely" doesn't name it, and the supplier may miss a question: a query whose read failed is dropped or can't be answered.
   - Name what is known: "{material} ({code}) could not be loaded completely." when the list row carries the case code, and "A question from Beiersdorf could not be loaded." for a CIQP Query row. Keep [Reload].
3. **B3 "Prod: not shown"** hides a task the supplier needs (see above).
4. **C10:** the bracket is support data, so dropping it costs the supplier nothing (support gets it back through point 1). With A16, the "next save" promise needs the once-only wording.
5. **A4's proposed text is wrong after a lock.**
   - It says "Your answers are still on the screen", but after a `LockedError` that is false: `LiveSupplierStore.tsx:273-277` drops those values, and A7's lock toast shows as well.
   - Use the A4 text for non-lock failures only.
6. **A8 after a read failure:**
   - A deep link to a request that a failed read dropped shows "It does not exist…".
   - When the load has read failures, say instead: "This request could not be loaded just now. Reload the page."
7. **The rest are fine.** C2-C7 and C11-C15 otherwise hide nothing a supplier needs. C14 hides nothing a prod test needs either: TEST-GUIDE-PROD checks uploads through the main run, step 3.

### plainError(): corrections

**1. Mapping by class leaks raw text and contradicts (d).**
- **Leaks:**
  - `sdk.ts:166` and `:169` throw a plain `Error`. `rowsOf` runs outside `call()` (`client.ts:112`), so they never become PortalErrors and would pass through raw.
  - A `TypeError` from a code defect would pass through raw too.
- **Contradicts (d):** `client.ts:163` and `:167` ("The upload of {file} did not finish within 2 minutes." / "Kissflow could not store {file}.") are PortalErrors. The (d) list keeps them as they are, but plainError would map them to the generic sentence.
- **Fix: pass through an allow-list, map everything else** (any non-PortalError included). The allow-list:
  - `LockedError`;
  - a new `UserError`, thrown for the business texts: liveActions `:49`, `:51`, `:161`, `:225`, `:244`, `:260`, `:263`, `:265`, `:282`, `:302`, `:351`/`:372`, `:393`, `:394`, `:399`, `:400`, `:411`; answers `:174`; client `:163`, `:167`.
- **Wrap `rowsOf`'s errors** as PortalError in the portal's own `client.ts` `pages()`, not in `sdk.ts`: the app's `kf/client.ts:11` imports `rowsOf`.

**2. Optional:** `answers.ts:174` blames "a colleague" for any write Kissflow didn't keep after three tries. That also covers a write lost without any colleague (plan v5 P3). A more accurate wording: "Your change could not be saved: Kissflow did not keep it. Please try again."

### Shared code: corrections

| File | Missing from the list | Consequence |
|---|---|---|
| `portal/data/map.ts` | The app imports:<br>• `caseContactsOf`, `parseMarkets` (`app-live/write/actions.ts:23`, `app-live/map/caseMap.ts:15`);<br>• `documentsJsonOf` (`app-live/testing/rawFixtures.ts:22`);<br>• `groupBundles`, `toSupplierSide` (`app-live/shared/questionsHistory.test.ts:3`). | Plan step 2 moves `map.ts:625`/`:629` into `notes`. Change `SupplierSide` additively (keep `warnings`, add `notes`), so the app's imports and test keep working. |
| `portal/data/answers.ts` | `readDoc` (`app-live/map/caseMap.ts:14`) | A `UserError` base class for `LockedError` doesn't affect the app. Tell the app session all the same. |
| `portal/data/scope.ts` | `liveScope`, `partOfPhase`, `storedScope`, `storedSlots` (`app-live/map/caseMap.ts:17`) | No change planned. List it anyway. |
| `portal/data/fixtures.ts` | `app-live/testing/rawFixtures.ts:21`, `app-live/shared/questionsHistory.test.ts:2` | Fixture edits for the new portal tests must keep the app's tests green. |
| `portal/kf/sdk.ts` | `rowsOf` also feeds the app's client (`app-live/kf/client.ts:11`). | See plainError: wrap in the portal's `client.ts`, don't edit `sdk.ts`. |
| `components/liveFeatures.tsx` | **The portal doesn't need it.** `useIsLivePortal()` (`store/portalCaps.tsx:34`) already tells the live portal from the prototype and the demo preview (DemoSupplierStore provides no caps). The screens already use it (`SupplierCase.tsx:32`, `SupplierHelp.tsx:139`). | E1-E10 and A10 can gate on it now, with no wait for the app session. Use liveFeatures only if both sessions want one mechanism. |

**Gate addition:** run the app's unit tests that import portal modules together with the portal's: `app-live/shared/questionsHistory.test.ts`, `app-live/shared/caseStartPayload.test.ts`, and every test that uses `app-live/testing/rawFixtures.ts`. `map.ts`, `answers.ts`, `bundle.ts` and `fixtures.ts` are shared.

### Checked, nothing to add

- **Harness report:** 33 scenarios, no pageerror and no console.error. No in-scope source file is newer than the report.
- **Gating:** PortalTopBar renders in dev only (`PortalTopBar.tsx:23`). A supplier's routes can't reach `/admin/*` (`PortalApp.tsx:76-81`).
- **E-mail promises:**
  - E1-E10 match the code: line numbers and texts.
  - `features/supplier/**` has no other e-mail or notice promise, outside the unreachable `PhaseViews.tsx:65` and `SupplierTasks.tsx:48`, and the old FAQ at `SupplierHelp.tsx:57`, which goes with A6.
- **OnlyOthers:** its "Nobody named … Ask {owner} … to name a colleague who may." (`parts.tsx:262-268`) can't fire on an app-started case, because of the noConfirmer guard (`app-live/write/guards.ts:35`, `:89`).
- **Unclassified throws:** `liveActions.ts:109` and `:114` are (d). `:127` is unreachable (`act` is always set).
- **Unverified claim in the inventory:** C2's "never seen live: Diagnostics shows 'activity id on rows: yes'". No live Diagnostics result for supplier rows is recorded anywhere; the 7 Oct check had 0 rows.
