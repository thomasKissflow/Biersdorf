# Front-end clean-up, app half: classified inventory (22 Oct)

**Kissflow-internal.** This is BACKLOG-AFTER-2026-10-22 item 1 (A-1) and the app side of D1 (A-2). Thomas's goal: "a tester sees no technical noise; only messages that mean something to them".

**How this was made:**
- Read-only, from code. Nothing was run, built or called. Line numbers are as of 22 Oct.
- Paths are relative to `prototype/src/` unless they start with `kissflow-build/`.
- **Scope:** the internal app UI (`app-live/**`), the internal screens it routes to (`features/{rmm,review,admin,suppliers,reports}`), and `components/**`, `shell/**`, `layout/Gates.tsx`.
- **Out of scope:** `portal/**` and `features/supplier/**` (portal session). The plan below edits neither, not even `portal/kf/sdk.ts`.

**Env facts the plan relies on:**
- `envOf(kf.account._id)` (`shell/env.ts:11`, re-exported by `app-live/env.ts:5`) decides the env. Account `AcDOSunMEpSA` is dev; every other account is prod.
- `AppLiveApp.tsx:133` puts the env in `AppEnvContext` (`app-live/appEnv.tsx:18`; its default is `prod`). `LiveAppStore`, the shell and Diagnostics all render inside that provider.
- `ProductionContext` (`components/ui/primitives.tsx:154`) can't separate dev from prod:
  - it is `true` in both live envs (`AppLiveApp.tsx:219`, `LiveAppStore.tsx:446`);
  - it is also `true` in the prototype unless the demo notes are on (`App.tsx:43`, `layout/demoNotes.tsx:39`);
  - so it only hides DemoNotes, and it can't separate live from prototype either.
- Prod has no top bar (`AppLiveShell.tsx:85`). Diagnostics opens only from the load-warnings box link (`AppLiveShell.tsx:111`), or by typing `#/diagnostics`.

**Classes:**
- **(a)** A real problem. Fix the cause.
- **(b)** Test-data noise. It fires on fictional or ZZT dev data only; prod is checked below.
- **(c)** A developer diagnostic. Keep it in dev only, or give prod a business wording.
- **(d)** Fine as is.

**D1** (texts that promise CIQ e-mails this build doesn't send) has its own table. **[D2]** marks a fix that hides a prototype feature this version doesn't have (MORNING-2026-10-22 §3 D2): those fixes need Thomas's D2 decision.

---

## (a) Real problems: fix the cause

| # | file:line | Current text / behaviour | When it fires | Fix |
|---|---|---|---|---|
| A1 | `app-live/write/actions.ts:194` (draft), `:206`, `:217` (draftWaits), `:219` (draftUnread); `app-live/kf/client.ts:245` | "… was saved as a draft in Kissflow but not sent: … **Open Diagnostics to send or discard it.**" | A create succeeded but its read-back, Start gate or submit failed (for example a 429 or a timeout at submit). A retry then hits draftWaits or draftUnread. | **A dead end in prod:** drafts never create a load warning, so prod has no way to Diagnostics. **Fix:** in both envs, a shell banner whenever `x.drafts.length > 0`: "You have 1 unsent item: Open point OP-3 on ZZT-1. It reached Kissflow but was not sent on. [Send or discard]". The link goes to Diagnostics `#drafts`, and prod Diagnostics shows "Unsent items" first (C20). The four texts then end with "Use **Unsent items** at the top of the page to send or discard it." |
| A2 | `app-live/AppLiveShell.tsx:95` | "Couldn't refresh from Kissflow: {err}**..** You are seeing …" | Every load error that already ends in "." (`load.ts:494` with an audit error, `kf/client.ts:127` "…went through."). | Strip the trailing `[.\s]` before adding ".", as `load.ts:631` caseBannerOf already does. Same fix for `AppLiveApp.tsx:120` "(….)" and `PageBoundary.tsx:20`. |
| A3 | `app-live/PageBoundary.tsx:20` | "…Reload, and open Diagnostics **from the person menu** if it stays." | Any render error in a page. | **Prod has no person menu.** The text must depend on the env (C6). |
| A4 | `features/review/SectionNav.tsx:155-158` → `features/review/AskModals.tsx:195-197` → `app-live/api.ts:351` | The "Add a section" modal closes as if it worked; then the toast "Adding a section to the scope is not available in this version yet." | A reviewer or RMM adds a section. | **[D2]** Don't offer "Add a section" in live (`LiveFeatures.extendScope = false`, see the plan). As long as it is offered, the modal must not close on a refused call. |
| A5 | `features/rmm/CaseDetail.tsx:172-175` (button), `:219`; `features/rmm/CaseActions.tsx:75`, `:95`, `:116-124`; `features/rmm/CaseList.tsx:19`, `:218`; `features/review/CompletePanel.tsx:144`; `app-live/api.ts:380` | The Reactivate button and dialog, then "Reactivating a case is not available in this version yet." Five texts promise "RMM can reactivate … within 12 months". | RMM opens a cancelled case. The texts show on every cancelled case and in the cancel dialogs. | **[D2]** Hide the button in live. The texts become "A cancelled case can't be reactivated in this version. Start a new case if the CIQ is needed again." |
| A6 | `features/admin/ReminderSettings.tsx:128-196`; `app-live/api.ts:416` | The card "Run reminders now" carries a visible **"Demo action"** badge. A click toasts "Running reminders is not available…", and the status line then says "Nothing due as of {date}." That status is false. | The Business administrator on /admin/notifications. | **[D2/D1]** Hide the card in live (`LiveFeatures.reminders = false`). See the D1 table for the page texts. |
| A7 | `app-live/api.ts:47`, `:244`, `:418-432` | Every admin edit control is enabled, and every change toasts "Configuration changes are not live in this version. …" | Each click, toggle or field blur on /admin/*. | Make the pages read-only in live: `features/admin/shared.tsx:14` `canEdit = can(…) && liveFeatures.configEdit`. `ReadOnlyNote` (`shared.tsx:57-66`) would then tell the BA "Only the business administrator changes …", so it must stay hidden when `configEdit` is false; the shell's banner covers it (D-list). |
| A8 | `features/review/CompletePanel.tsx:205-234`; `app-live/api.ts:48`, `:373`; `app-live/write/guards.ts:31` | A department sees "Reopen my review", types a reason, confirms, and gets "Ask RMM: only RMM can restart a review in this version." | A completed SAF, REG, QM, MIC or SUS reviewer. | **[D2]** In live, a non-RMM department sees one line instead of the button: "To reopen your review, ask RMM." |
| A9 | `features/suppliers/forms.tsx:336-350`; `app-live/write/guards.ts:39`, `:181` | The deactivate dialog offers "Replacement contact". Confirming is then refused: "…Replacing a contact on running cases is not available in this version yet." | Deactivating a contact named on an open case. | **[D2]** In live, the dialog says so up front ("{name} is named on open cases, so they can't be deactivated in this version."), shows no replacement field, and disables Confirm. |
| A10 | `app-live/api.ts:49`, `:122`; `app-live/write/handoff.ts:105-107`, `:151` | " Beiersdorf's system will pass this on." is appended to the success toast. | A hand-off is "pending". In prod the likely case is PENDING_PARTIAL_HISTORY: a reviewer changes a point on a case where another department's unresolved point was not read live. | **No system passes it on:** the portal's questions history is simply not updated by this save. **Fix:** drop the suffix from toasts in both envs; the Writes log keeps "pending". **Cause** (out of FE scope): history.updated replaces the whole history (`handoff.ts:141-147`); a per-point merge needs the portal session's contract change. Note it for them. |
| A11 | `app-live/Diagnostics.tsx:305` | "…Without one, the change is saved here and marked "pending hand-off" in the history." | Always (Webhooks card). | No screen shows such a mark, so the text is false. New text: "Without one, the change is saved here but not passed to the supplier portal; the Writes log shows it as pending." |
| A12 | `app-live/load.ts:516`, the case banner `AppLiveShell.tsx:124`, `write/guards.ts:28`, `write/activation.ts:254` | "N case(s) could not be read in full for your role…", plus the case banner on every case. | Every load of a role that can't read CIQ Case items in full. | **[unverified live]** Reviewers are View-only on the processes (`ciq-digital/RESUME.md:24`), and whether their admin or byId rung reads a case is still open (DESIGN §4, A-4: the reviewer roles have no members). If it fires for a reviewer in prod, this is an access problem: questionnaire answers are missing and no RMES record is created. Fix it in the grants. Only the wording is C8. |
| A13 | `app-live/LiveAppStore.tsx:212-215` | One toast per case per load-time effect. The Toaster keeps 4 (`:126`), so older ones drop off. | RMM's first load after several suppliers confirmed. | Group per effect and load: one toast (C14). |

Known and outside this clean-up: a failed hand-off leaves no lasting record (A-5); four hand-offs are not sent at all (A-6).

---

## (b) Test-data noise: prod data won't trigger it (checked)

**What the prod checks rest on:**
- The prod seed (`kissflow-build/CIQ-prod-seed-config-version-INTERNAL.xlsx`) has these config rows: `RS:RS-2026.1`, `TPL:CIQ-2026 v1`, `REL:RS-2026.1 + v1` (Published), `RS:RS-2026.2`, `TPL:CIQ-2026 v2`, `REL:RS-2026.2 + v2` (Draft), `OWN:current`, `REM:current`, `SET:current`.
- A case started in the app copies the release's own `Rule_Set_Version`, `Template_Version` and `Manifest_Hash` (`app-live/write/encode.ts:285-290`).
- createCase refuses to start a case without a published release (`write/actions.ts:631`; guard `noRelease`).

| # | file:line | Current text | Why it fires in dev | Prod check | Action / calm wording |
|---|---|---|---|---|---|
| B1 | `app-live/map/caseMap.ts:258` (shown in both the banner `AppLiveShell.tsx:129` and the warning `caseMap.ts:306`) | "This case is pinned to rule set {rs} with questionnaire {tpl}, which no configuration release provides; its sections may be shown from another questionnaire version." | ZZT cases made by test scripts pin fictional pairs, e.g. Template_Version "v1" (`ciq-supplier-portal/spikes/spike-requests.jsonl`). | Can't fire for a case started in the app: it pins the release it was started on (encode.ts), and the pair is FIRST_PAIR, which `pinProblem` (`caseMap.ts:256-257`) exempts anyway. | Keep the banner only and drop the duplicate warning (`:306`). Wording: "This case uses a questionnaire version that is not available here, so its sections may differ from what the supplier filled in." |
| B2 | `app-live/map/caseMap.ts:261` | "This case's configuration fingerprint does not match the release {key}; check the configuration before relying on its sections." | Script-made cases carry a hand-written Manifest_Hash. | encode.ts:290 copies the release's own hash. | Banner only. "This case's questionnaire differs from the published version. Check with the Business administrator before relying on its sections." |
| B3 | `app-live/map/caseMap.ts:298` | "{case}: no pinned rule set / questionnaire version; the first configuration is shown." | Script-made cases without pins. | encode.ts always pins. | Dev-only note (C1 notes). |
| B4 | `app-live/map/config.ts:68`, `:81`, `:138`, `:148` | "Configuration release … is ignored" / "appears N times" / "N configuration drafts exist" | Dev config rows from earlier nights. | Seed: 2 releases with distinct keys and 1 draft. These fire only on a corrupt or duplicated row. | Dev-only notes. |
| B5 | `app-live/map/config.ts:152`, `:154` | "The section ownership row (OWN:current) could not be read; …" / "(REM:current) …" | A dev config without those rows, or a failed config read: then `load.ts:473` reports the same cause too. | The seed has both rows. | Dev-only notes. Don't push them at all when the config list failed (`load.ts:473` already says so). |
| B6 | `app-live/map/suppliersMap.ts:48` | "Supplier {code}: the kind "Trader" is shown as distributor." Fires on every load. | The dev supplier master has "Trader" rows (`app-live/ids.ts:165`: the live list has the choice). | The app writes only Manufacturer or Distributor, and the prod master is built through the app. | The mapping is intended, so make it silent (count it in Diagnostics). |
| B7 | `app-live/map/suppliersMap.ts:38`, `:49` | "…appears twice in the supplier master…" / "unknown kind…" | Dev rows made by hand or script. | Only rows made outside the app. | Dev-only notes. |
| B8 | `app-live/map/trackMap.ts:319` | "{case}: the {Dept} review item {id} was withdrawn in Kissflow; it is not shown." | The dev clean-ups withdraw ZZT items. A withdrawn item stays, so the warning repeats on every load. | No screen withdraws a review. | Withdrawn is an ended state, not an error: drop the warning (Diagnostics count only). |
| B9 | `app-live/map/toAppState.ts:44` | "{Review / Open point / …} {itemId} names no case item; it is not shown." | Script rows, and review rows from My items that no history line places. | Every app-made review has a `review.started` row (activation.ts), except after a failed history write. | Dev-only note. |
| B10 | `app-live/map/toAppState.ts:189`, `app-live/map/trackMap.ts:208` | "Two cases share the code …" / "Two open points share the key …" | Test scripts reuse codes. | The domain makes the codes. | Dev-only notes. |

---

## (c) Developer diagnostics: dev only, or a business wording in prod

Rule for every row: **dev keeps today's text** (raw ids, codes, errors). **Prod shows the "Prod" column.** The Writes log and Diagnostics keep the raw text in both envs.

### C-shell: banners, boundaries and full-page states

| # | file:line | Current text | When | Prod |
|---|---|---|---|---|
| C1 | `app-live/AppLiveShell.tsx:107-121` | "{n} thing(s) could not be read in full; what you see may be incomplete. Diagnostics", then the raw list (feeders below). | Any load warning; both envs. | **Split the feeders into two lists.**<br>• **Read failures** (data is missing): `load.ts:243`, `:270`, `:279`, `:313`, `:473`, `:481`, `:516`, `:683`/`:782`, `:685`/`:739`; `map/toAppState.ts:181`, `:228`, `:240`, `:272`; `map/auditMap.ts:215`.<br>• **Mapping notes** (B3-B10 and `map/trackMap.ts:109`, `:123`, `:315`, `:388`, `:439`): never shown in prod.<br>**Prod shows one line, no list and no count:**<br>• "Some data could not be loaded, so this page may be incomplete. [Reload] · [Details]"<br>• with kept parts: "Some data could not be refreshed; parts of the page show the state of {HH:MM}. [Reload] · [Details]"<br>• with a case not shown (`toAppState.ts:181`, `:228`): "Case {code} could not be loaded and is not listed."<br>"Details" opens Diagnostics. **Dev:** both lists, labelled "Could not be read" and "Notes". |
| C2 | `app-live/AppLiveShell.tsx:92-100` | "Couldn't refresh from Kissflow: {raw}. You are seeing the data from HH:MM." | A re-read fails after a good first load. | "Couldn't refresh from Kissflow. You are seeing the data from {HH:MM}. [Try again]". In dev the raw text stays (with the A2 fix). |
| C3 | `app-live/LiveAppStore.tsx:425-439` | "CIQ Digital could not be loaded" / {raw loadError}. | The first load throws (`load.ts:494`, or a mapping exception). | Body: "Kissflow did not answer or did not allow the request. Try again in a moment; if it keeps happening, tell your CIQ administrator." |
| C4 | `app-live/AppLiveApp.tsx:76-83` (detail from `portal/kf/sdk.ts:142-146`) | "Couldn't connect to Kissflow" / "{detail} If this keeps happening, reload the page." | The handshake times out or is refused. **Before the env is known.** | Always the plain text: "Kissflow did not answer. Reload the page; if this keeps happening, tell your CIQ administrator." The raw `detail` goes into a collapsed "Technical details" (no env is known yet, and sdk.ts stays untouched). |
| C5 | `app-live/AppLiveApp.tsx:113-120` | "CIQ Digital could not start" / "…({error.message}). Reload the page; …" | A render error while the identity or store is built. | Pass `envOf(boot.kf.account?._id)` from `Connect` (`:206-209`) as a prop. Prod: "Something went wrong while opening the app. Reload the page; if it stays, tell your CIQ administrator." Dev: the message (A2 punctuation fix). |
| C6 | `app-live/PageBoundary.tsx:19-20` | "This page could not be shown" / "…({error.message})… open Diagnostics from the person menu…" | A render error in a page. | The env comes as a prop from `AppLiveShell.tsx:138`. Prod: "Something on this page could not be shown. Other pages and cases are not affected. Reload the page; if it stays, tell your CIQ administrator which page you opened." Dev: as today. |
| C7 | `app-live/AppLiveApp.tsx:92-93` | "No access to CIQ Digital" / "…has no CIQ role in this app (roles: {raw role names}). Case administrator and Integration service work in Kissflow directly." | A signed-in user with no CIQ persona. | "Your Kissflow account ({email}) has no CIQ Digital role. Ask your CIQ administrator for one." The raw role names stay dev only. |
| C8 | `app-live/AppLiveShell.tsx:122-126`; `app-live/load.ts:55`, `:631` | "Kissflow did not let your role read this case's questionnaire ({raw why / "no read route for this role"}). You see its header, reviews and open points." | /cases/:id and /review/:caseId of a case not read in full. | "The questionnaire of this case could not be loaded for your role. You see its header, reviews and open points. If you need the answers, tell your CIQ administrator." No `why`. See A12 for the access question. |
| C9 | `app-live/AppLiveShell.tsx:107-121` (the "Diagnostics" link) | The link label "Diagnostics". | The box shows. | Label "Details" (both envs; dev also has the person menu). |
| C10 | `app-live/routes.tsx:15`, `app-live/AppLiveShell.tsx:73` | Diagnostics is open to every role by URL. | — | Keep. It is the support route when there is no warning. **Decision for Thomas:** whether prod also gets a small "Support details" link in the side-pane footer. |
| C11 | `app-live.html:19`, `app-live/AppLiveApp.tsx:203`, `app-live/LiveAppStore.tsx:420` | "Loading CIQ Digital…" → "Connecting to Kissflow…" → "Loading CIQ Digital…" | Every boot. | One label for all three: "Loading CIQ Digital…". Low priority. |

### C-store: toasts from writes, hand-offs and load-time effects

The raw causes inside these toasts:
- `kf/client.ts:27`, `:46`, `:48`, `:127`, `:144`, `:163`, `:172`, `:198`, `:210`, `:245`, `:259`, `:308`;
- `write/verify.ts:21` VerifyError;
- `portal/kf/sdk.ts:166`, `:169`, `:194` (the JSON fallback).

**Prod maps the cause through `plainError()`** (new, app-only; it uses the existing `kf/client.ts:30-41` kfCode, isRateLimited and isDataRefusal, `load.ts:126` isRefusal and `write/verify.ts:155` leftQueue):

| Cause | Prod sentence |
|---|---|
| Rate limit (429) | "Kissflow is busy right now. Wait a minute, then try again." |
| "did not answer within" | "Kissflow did not answer in time. Reload to see whether it went through." |
| Refusal: 0503xx, 403, "permission", PermissionDeniedToUpdate | "Kissflow did not allow this for your role." |
| fetch, network | "The connection to Kissflow was interrupted. Try again." |
| VerifyError | "Kissflow did not keep every value. Reload and check the result." |
| anything else: "(SDK); (REST)", "(fetch); (SDK)", JSON, an unknown list shape, "answered with a different item", "More than 10000 items…" | "Kissflow could not complete the request." |

| # | file:line | Current text | When | Prod |
|---|---|---|---|---|
| C12 | `app-live/api.ts:110` failedResult; `app-live/write/actions.ts:87-90` attempt | "Not saved: {raw}" / "{done…} Not finished: {raw}" | A writer throws. | "Not saved: {plainError}" / "{done…} Not finished: {plainError} Reload to see the current state." |
| C13 | `app-live/LiveAppStore.tsx:158-163`; `app-live/api.ts:132` | "Saved, but its hand-off to the supplier portal ({code}) failed: {raw}. Diagnostics lists it." | A webhook POST fails after its save. | "Saved. The supplier portal could not be updated just now, so the supplier may not see this change yet. Tell your CIQ administrator." No code, no raw text, no Diagnostics pointer. |
| C14 | `app-live/write/activation.ts:79-88` (items `:241`, `:244`, `:247`, `:131`, `:284`, `:315`, `:331`, `:397`, `:399`); `app-live/load.ts:931`; `app-live/LiveAppStore.tsx:214-215` | "Started in Kissflow: ZZT-1 reviews for RMM, SAF, REG; the history line of …." / "Not started: ZZT-1 SAF review ({raw})." / "Sent in Kissflow: ZZT-1 final-release request (its history line was not saved)." / "Started in Kissflow: ZZT-1 SAF RMES record (12 criteria)." | After full loads: RMM (reviews, release request), SAF/REG (RMES). One toast per case. | **One toast per effect per load:**<br>• RMM reviews: "Reviews started for ZZT-1 (RMM, Safety, Regulatory)." or "Reviews started for 3 cases: …".<br>• Release: "Final release requested from the supplier for ZZT-1."<br>• RMES: **no toast in prod** (housekeeping; the RMES tab shows it). Dev only.<br>• "the history line of …" items: dev only.<br>• Failures: "The reviews of ZZT-1 could not be started just now. CIQ Digital tries again the next time you open it." The release and RMES failures read the same way.<br>`LiveAppStore.tsx:215` is unreachable; keep it as the plain fallback. |
| C15 | `app-live/write/actions.ts:179` submitGated; `:206` (inside the draft text); `:551`; `app-live/write/activation.ts:131`; `app-live/LiveAppStore.tsx:346` | "…Kissflow still misses OP_Outcome, Review_Gate…" / "Still empty: {field ids}. Nothing was sent." | The Kissflow Mandatory gate fails after a save. | "{what} was saved, but Kissflow still needs some required information, so it did not move on. Reload and try again; if it stays, tell your CIQ administrator." / "Some required fields are still empty, so nothing was sent." The field ids stay dev only. |
| C16 | `app-live/write/actions.ts:550` | "Kissflow's review gate is not OK yet; nothing was completed." | Review_Gate is blank after the counts were written. | "Kissflow does not see this review as ready yet (open points or RMES entries are still open). Nothing was completed; reload and check." |
| C17 | `app-live/api.ts:148`; `app-live/load.ts:803` NOT_READ_AGAIN | "Not completed: Kissflow could not read CIQ Audit Event, CIQ Open Point … again just now, so the review gate could not be checked…" | Complete review's fresh read kept a part from an earlier load. | "Not completed: part of this case could not be read again just now, so the review could not be checked. Nothing was saved; try again." No flow names. |
| C18 | `app-live/write/actions.ts:579` | "{Dept} review completed. Every review is complete: RMM's CIQ Digital asks the supplier for the final release now \| when RMM next opens it." | The last review completes. | "Safety review completed. Every review is complete; the final-release request goes to the supplier now \| the next time RMM opens CIQ Digital." (The second part is real behaviour the tester needs, M2.) |
| C19 | `app-live/write/actions.ts:316`, `:324`, `:348`, `:350`, `:676`, `:688`, `:889`; `app-live/write/audit.ts:114` | "…its finding was not added to the RMES record ({raw})" / "…was not linked to it (its RMES row is not known)" / "{op} stays open in Kissflow (it is not one of your open tasks)…" / "{what} done, but its history line was not saved ({raw})." | Partial successes (warning toast). | Raw becomes plainError. "its RMES row is not known" becomes "its RMES entry is not loaded". "history line" becomes "case history". **Fix audit.ts:114's grammar in both envs:** "{what} was saved, but it is missing from the case history ({cause})." Some `what` values are noun phrases ("The RMM review reopening", "RMES CR-01"), so "done" reads badly; reword the `what` arguments. |
| C20 | `app-live/write/actions.ts:300`, `:474`, `:630`, `:714`, `:737`, `:762`; `:631` | "The new open point \| finding \| case \| note \| supplier \| contact is missing from the screen's state." / "No published configuration release for {rs} + {tpl}." | Practically unreachable (the domain just added it). | "The screen lost track of the new {thing}. Reload and check whether it was saved." / as guard `noRelease` below. |
| C21 | `app-live/shared/caseStartPayload.ts:59`, `:64`, `:74`, `:75`, `:99` (via `write/actions.ts:645`) | "The release's bundle is not valid JSON." / "…no WebCrypto." | A corrupt release row; an old browser. | "This questionnaire version can't be used to start a case. Ask the Business administrator." / "This browser can't start a case. Use a current browser." |
| C22 | `app-live/write/guards.ts:24` caseUnknown, `:28` rmesCaseUnreadable, `:29` rowUnknown, `:33` noRelease, `:36` supplierUnknown, `:37` contactsUnread, `:38` contactUnknown, `:40` country | "Kissflow did not give your role this case's item…" / "…Diagnostics shows why; ask the administrator to check your role's access to CIQ Case." / "…not known to the screen…" / "…has no published release row in Kissflow…" / "…(Diagnostics shows why), so a new contact could get a key…" / "Kissflow's country list" | A click is refused before anything is sent. | • caseUnknown: "This case can't be changed from your role right now. Reload and try again."<br>• rmesCaseUnreadable: "The RMES record can't be prepared because your role can't read this case's questionnaire. Ask your CIQ administrator to check your role's access."<br>• rowUnknown, supplierUnknown, contactUnknown: "This {RMES entry \| supplier \| contact} is not fully loaded yet. Reload and try again."<br>• noRelease: "Questionnaire {pair} has no published version, so a case can't be started on it. Ask the Business administrator."<br>• contactsUnread: "This supplier's contacts could not be loaded just now. Reload, then add the contact."<br>• country: "…not in the country list…".<br>The same wording in dev is fine (no technical content needed). |
| C23 | `app-live/LiveAppStore.tsx:350-352`, `:374-375`; labels from `app-live/load.ts:543-545` | "{label} sent." / "{label} discarded." The label falls back to the Kissflow item id. | Diagnostics Send/Discard (prod: through A1). | The id fallback becomes "New case" / "Review" / "Open point" without the id. |
| C24 | `app-live/write/actions.ts:850`, `:867`; `app-live/write/activation.ts:197-198` (texts saved in audit rows: case History and Audit trail) | "…sent to the supplier from an unsent draft." / "(sent from an unsent draft)" / "History line restored: …" / "(history line restored)" | Rare recoveries. | "…sent to the supplier (after a retry)." / "(recorded late)". Applies to future rows only; existing rows keep their text. |
| C25 | `app-live/map/auditMap.ts:186`, `:267` | An unknown Action_Code is shown raw ("foo.bar") in History and the Audit trail. | Unknown codes only. | Prod: "Other change". |

### C-diag: Diagnostics and Diagnostics-only texts

| # | file:line | Current text | Prod |
|---|---|---|---|
| C26 | `app-live/Diagnostics.tsx:88-314` | Session (raw ids, role JSON), Reads (rungs, flow names, raw errors, "Row fields"), Warnings, Unsent drafts, Writes (method names such as raiseOpenPoint, "handoff op.round"), Webhooks. | Keep it as the support page. **In prod reorder it:**<br>1. **Unsent items** (`#drafts`; A1), errors through plainError;<br>2. **What could not be loaded** (the C1 read failures, as written);<br>3. everything else collapsed under "Technical details (for support)".<br>Subtitle: "For support: what CIQ Digital could read and save in this session." Dev: as today, plus the "Notes" list. |
| C27 | `app-live/load.ts:866`, `:881`, `:886-887`; `app-live/write/activation.ts:104-113`, `:177`, `:254-255` | Effect notes ("…were not started on this load…", "…Diagnostics lists it…"). Writes log only. | Keep, dev and support. Fix the self-reference in `activation.ts:107` ("Diagnostics lists it" → "it is listed under Unsent items"). |

### C-screens (low priority)

| # | file:line | Current text | Prod |
|---|---|---|---|
| C28 | `features/rmm/NewCase.tsx:287`, `:367`; `features/rmm/tabs/QuestionnaireSections.tsx:297`, `:300`; `features/rmm/tabs/FinalDocumentTab.tsx:20` | "Target markets (SF-11)", "SF-01 to SF-12" | The portal hides SF codes when `useProduction()` is true (`features/supplier/ConfigQuestions.tsx:28`). For a consistent look, do the same here (both envs, and the prototype with notes off). Optional: BDF may know the codes. |

---

## (d) Fine as is (meaningful to a tester)

| file:line | Text |
|---|---|
| `app-live/AppLiveApp.tsx:66-67` | "Not running inside Kissflow" (outside a frame only) |
| `app-live/AppLiveShell.tsx:102-105`; `app-live/kf/client.ts:27`; `app-live/api.ts:278` | "This page is not running in the CIQ Digital app…" (never inside the app) |
| `app-live/AppLiveShell.tsx:132-135` | Config read-only banner. Keep. Once A7 makes the pages read-only, "In this version the configuration is read-only. Cases use the configuration shown." reads better. |
| `layout/Gates.tsx:13-14`, `:40-49` | "Administrator area…", "This page is not part of your role" |
| `shell/SidePane.tsx:61-115` | "Saving…", "Loading…", "Updated HH:MM", Reload, theme |
| `app-live/write/verify.ts:28-32` STALE_TEXT, `:35` CONTACT_KEY_HELD, `:38-42` QUEUE_TEXT | "…changed in the meantime. It has been reloaded; check it and try again." |
| `app-live/api.ts:151`, `:158` NOT_SENT | as above / "Not sent: an earlier change on this page was not saved…" |
| `app-live/write/guards.ts:25`, `:26`, `:27`, `:30`, `:32`, `:34`, `:35` | opNotHeld, reviewNotHeld, rmesUnknown, rmmCompleted, noEmail, noPortalContact, noConfirmer |
| `app-live/write/actions.ts:100`, `:101`, `:452`, `:490`, `:750`, `:779`, `:790` | "… is no longer loaded. Reload and try again." |
| `app-live/api.ts:340`, `:343-412`; the domain toasts it copies (`domain/actions.ts`) | Success texts: "Answer accepted.", "Review completed.", … `:343` "{id} created and the supplier contacts invited." is fine (the invitation is the portal task); optional "…sent to the supplier contacts in the portal." |
| `app-live/LiveAppStore.tsx:271`, `:273`; `app-live/api.ts:119` | "Saved." / "Not saved." fallbacks |
| `app-live/api.ts:52`, `:327`; `shell/DevTopBar.tsx` (all); `app-live/LiveAppStore.tsx:294` | Dev only (role switcher) |
| `app-live/write/activation.ts:145`, `:324`, `:392` | History lines "…review activated: completeness confirmed.", "RMES record created with N criteria…", "RMM and N department review(s) completed…" |
| `components/status.tsx`, `components/RequestedDocs.tsx`, `components/DocName.tsx`, `components/ui/*` | Business labels. DemoNote is hidden in live (ProductionContext). |
| `features/rmm/tabs/FinalDocumentTab.tsx:248`, `features/rmm/tabs/HistoryTab.tsx:48`, `:95` | Seal hash and versions: an intended integrity feature |

**Dead or unreachable texts.** Remove them when the file is touched anyway:
- `api.ts:51` HANDOFF_FAILED and `:123-126`: handoff() never returns "failed";
- `api.ts:46`, `:55-76` via the WHAT map: every writer is wired;
- `LiveAppStore.tsx:215`; `caseMap.ts:40` UNREADABLE_BANNER and `index.caseBanners`;
- `config.ts:187-233` verifyConfig; `Diagnostics.tsx:83`; `identity.ts:74`.

---

## D1: texts that promise CIQ e-mails this build doesn't send

**How to switch them:** the live text applies when `LiveFeatures.mails === false` (see the plan). The prototype keeps its own text. Kissflow's own task notifications may still arrive (BACKLOG item 5), so no text promises or denies an e-mail.

| file:line | Current text | Live text |
|---|---|---|
| `features/rmm/Dashboard.tsx:116` | "The contacts get an e-mail. Their answers open…" | "The contacts get a task in the supplier portal. Their answers open…" |
| `features/rmm/NewCase.tsx:186` | "The case contacts get the invitation e-mail and fill in the CIQ." | "The case contacts get the request in the supplier portal and fill in the CIQ." |
| `features/rmm/NewCase.tsx:212` | "Only the contacts named here see the request and get its e-mails." | "Only the contacts named here see the request." |
| `features/rmm/NewCase.tsx:366` | "{names} get an e-mail and one task in the supplier portal." | "{names} get one task in the supplier portal." |
| `features/rmm/tabs/OverviewTab.tsx:101` | "Only they see this request and get its e-mails" | "Only they see this request" |
| `features/rmm/tabs/OpenPointsTab.tsx:279` | "The supplier sees the change in its request and gets an e-mail." | "The supplier sees the change in its request." |
| `features/rmm/CaseActions.tsx:116` | Reactivate dialog: "…The supplier contacts and the reviewers with an open task get an e-mail." | Hidden in live (A5, [D2]) |
| `features/review/ReviewQueue.tsx:97-98` | "…You also get an e-mail." (twice) | Drop the sentence. |
| `features/review/ReviewWorkspace.tsx:95` | "The review tasks are created when the supplier confirms completeness; you get an e-mail then." | "The review tasks are created after the supplier confirms completeness." |
| `features/review/ReviewWorkspace.tsx:194` | "…your review reopens automatically and you get an e-mail." (also [D2]: no automatic reopen in this version) | "If the supplier changes something in a section you lead or co-review, the change is marked here; reopen your review if it matters." |
| `features/review/WorkspaceHeader.tsx:68` | Reassign hint: "The new reviewer gets an e-mail with it." | "Recorded in the case history." |
| `features/review/OpenPointsPanel.tsx:121` | "…, and the supplier contacts get an e-mail." | "…, and the supplier sees it in the portal." |
| `features/review/OpenPointsPanel.tsx:160` | "…no answer needed, and gets an e-mail." | "…no answer needed." |
| `features/review/AskModals.tsx:36` | "E-mail to {names} (no internal content)." / "No active supplier contact on this case gets an e-mail." | "Sent to {names} in the supplier portal (no internal content)." / "No active supplier contact is named on this case." |
| `features/review/CompletePanel.tsx:144` | "…The supplier contacts get a neutral e-mail; the case can be reactivated within 12 months." | "…The supplier sees the request as cancelled in the portal." (A5) |
| `features/review/CompletePanel.tsx:219` | "…its questionnaire unlocks, and the supplier contacts get an e-mail…" | "…its questionnaire unlocks in the portal…" |
| `features/suppliers/SupplierDetail.tsx:100` | "…only they see it and get its e-mails." | "…only they see it." |
| `features/suppliers/forms.tsx:265` | E-mail hint "…Mails about the requests go here." | "Unique across all suppliers." |
| `features/suppliers/forms.tsx:325` | "…gets no more e-mails or tasks and can no longer open the supplier portal…" (also [D2]: "Your access has ended" is not built) | "…is no longer offered for new cases. It keeps its history and is never deleted." **[check with the portal session]** what deactivation does in the portal live. |
| `features/suppliers/forms.tsx:336` | Replacement hint "…gets the invitation e-mail." | Hidden in live (A9) |
| `features/admin/ReminderSettings.tsx:137`, `:157`, `:167` | Run-reminders card texts ("…send the reminder, overdue and escalation e-mails…", "N e-mails sent", "…in the recipient's inbox…") | Card hidden in live (A6) |
| `features/admin/ReminderSettings.tsx:219` | "…and the e-mail CIQ sends for each event…" | "Due-date reminder and escalation rules. In this version they are shown for reference; CIQ sends no reminders or e-mails yet." |
| `features/admin/ReminderSettings.tsx:240` | "A change saves when you leave the field… Every change is logged." | Not shown once A7 makes the page read-only. |
| `features/admin/ReminderSettings.tsx:249`; `features/admin/MailTemplates.tsx:70`, `:85` | "E-mail templates…", "…filled in when the e-mail is sent", "The e-mails sent land in each person's inbox." | Keep the templates as reference with one line on top: "These e-mails are not sent in this version." Drop the inbox sentence. |
| `components/mentions.tsx:175` MENTION_HINT (shown by `features/rmm/tabs/NotesTab.tsx:108` and the review notes) | "Type @ to mention a colleague. They get an e-mail with a link to the note." | "Type @ to mention a colleague. The note shows them as mentioned." |
| `components/mentions.tsx:221` NoteNotified (used by `NotesTab.tsx:95`, `QuestionnaireSections.tsx:680`, `InternalNotes.tsx:99`) | "E-mailed {names}" | "Mentioned: {names}" |
| `app-live/api.ts:50`, `:385`; `app-live/write/actions.ts:721` | "Note added. E-mail notifications are not live yet." | "Note added." (the hint no longer promises a mail) |

Also checked, no change needed: `domain/actions.ts:938` "The supplier is told no answer is needed." (the portal shows it). `domain/actions.ts:1289` "…change mails" can't be reached in live (config is read-only).

---

## Console

| file:line | Call | When | Action |
|---|---|---|---|
| `app-live/AppLiveApp.tsx:106` | `console.error("CIQ Digital could not start:", error, componentStack)` | A real start crash only | Keep. It is the only trace of a real defect; a clean run has none. |
| `app-live/PageBoundary.tsx:13` | `console.error("CIQ Digital page failed:", …)` | A real page crash only | Keep (same reason). |
| React 19 default `onCaughtError` (`app-live/main.tsx:10` passes none) | Logs every boundary-caught error once more | Same crashes | Two console errors per crash **[unverified whether also in the production build]**. Pass `onCaughtError` (a no-op, since the boundaries log) to `createRoot` in `app-live/main.tsx`, or drop the boundaries' own logs. Keep exactly one. |
| `store/store.tsx:244` | `console.error("[CIQ] consistency problem(s)")` | Prototype StoreProvider only | Not mounted in live. Nothing to do. |
| `@kissflow/lowcode-client-sdk` 1.0.49 | "Message callback error: …" | Only when one of our SDK callbacks throws | Third-party wording. If it appears, the bug is ours. |
| Browser network lines | e.g. a failing no-cors webhook `fetch` (`kf/client.ts` postWebhook) | A hand-off fails | Not a `console.*` call; it can't be silenced and is acceptable. **[unverified]** which ones a normal prod load shows: check in the harness (below). |

There is no `console.warn`, `console.log` or `console.info` in `app-live/**` (outside tests), `shell/**` or `components/**`.

---

## Implementation plan (app half; no `src/portal/**`, no `features/supplier/**`)

### Gating

**Dev/prod.** Use the existing `AppEnvContext` (`app-live/appEnv.tsx`, set at `AppLiveApp.tsx:133`):
- **React parts:** `useAppEnv().env` in AppLiveShell, LiveAppStore (it renders inside the provider, `AppLiveApp.tsx:182-190`) and Diagnostics.
- **Class boundaries:** they get `env` as a prop (StartBoundary from `Connect`, via `envOf(boot.kf.account?._id)`; PageBoundary from the shell).
- **Writers and load-time effects:** add `env: AppEnv` to `WriteCtx` (`app-live/types.ts`). `LiveAppStore.tsx:166-169` ctxOf sets it.
- **Pre-env pages** (ConnectFailed, the static loader) always use the plain text.

**Live vs prototype (D1, [D2]).** This needs a new context, because ProductionContext can't tell live from prototype (header):
- **The file:** `src/components/liveFeatures.tsx`, exporting `LiveFeaturesContext` and `useLiveFeatures()`.
- **Its default is the prototype's behaviour:** `{ mails: true, extendScope: true, reactivate: true, reminders: true, configEdit: true, deptReopen: true, replaceContact: true, autoReopen: true }`.
- **Live:** LiveAppStore provides all of them `false`, next to `ProductionContext.Provider` (`LiveAppStore.tsx:446`).
- **The portal session** can provide `mails: false` from its own store for its D1 half. Tell it the file exists. It is a new file, so there is no shared-file edit.

### Steps

1. **`app-live/userText.ts` (new).**
   - `plainError(e)`: the table under C-store.
   - `trimEnd(s)`: the A2 punctuation fix.
   - The prod sentences of C2-C8, C13, C14 and C17 as named constants, so the tests can assert them.
2. **Results keep both texts.**
   - `WriteResult` gets `detail?: string`: the raw cause, always written to the Writes log.
   - attempt() (`write/actions.ts:87-90`), failedResult (`api.ts:110`), activation's `result()` (`write/activation.ts:79`) and `audit.ts:114` build the toast with `ctx.env === "prod" ? plainError(e) : errorText(e)`.
   - The store's `report` (`LiveAppStore.tsx:268-273`) and handoffProblem (`:158-163`) stay one place: they log the raw text and toast the env text.
   - Drop PENDING_SUFFIX from toasts (A10).
   - Group the effect toasts per effect per load (`LiveAppStore.tsx:211-215`, C14).
3. **Warnings vs notes.**
   - The mappers push mapping notes into a new `notes: string[]`: `map/config.ts`, `caseMap.ts:298`, `suppliersMap.ts`, `trackMap.ts`, `toAppState.ts:44`, `:189`.
   - `toAppState` returns it, and `load.ts` viewOf (`:617-622`) passes it to `LoadedView`, then to `LiveAppExtras.notes` (`extras.tsx`).
   - Read failures stay in `warnings`.
   - Drop the duplicate pin warning (`caseMap.ts:306`), the "withdrawn" warning (`trackMap.ts:319`) and the "Trader" warning (`suppliersMap.ts:48`). Skip `config.ts:152`/`:154` when the config list failed.
4. **Shell** (`AppLiveShell.tsx`): the A2 fix; the C1 prod line and the dev lists; the C2/C8 wording; the A1 unsent-items banner; the "Details" link label; `env` passed to PageBoundary. **Boot** (`AppLiveApp.tsx`): C4, C5, C7. **LiveAppStore:** the C3 page.
5. **Diagnostics** (`Diagnostics.tsx`): the prod order and collapse (C26), `id="drafts"`, the A11 subtitle, a "Notes" card.
6. **Writer texts:** C15-C24 in `write/actions.ts`, `write/guards.ts`, `write/audit.ts`, `write/activation.ts`, `shared/caseStartPayload.ts` (app-owned under app-live), `load.ts` (NOT_READ_AGAIN, draft labels).
7. **Screens:** the D1 table, plus A4-A9 through `useLiveFeatures()`.
   - **Files:** `features/rmm/{Dashboard,NewCase,CaseActions,CaseDetail,CaseList}.tsx`, `features/rmm/tabs/{OverviewTab,OpenPointsTab}.tsx`, `features/review/{ReviewQueue,ReviewWorkspace,WorkspaceHeader,OpenPointsPanel,AskModals,CompletePanel,SectionNav}.tsx`, `features/admin/{shared,ReminderSettings,MailTemplates}.tsx`, `features/suppliers/{SupplierDetail,forms}.tsx`, `components/mentions.tsx`.
   - **[D2] parts:** behind their flags, so Thomas's D2 answer only flips a default.
8. **Console:** `onCaughtError` in `app-live/main.tsx`.
9. **Remove dead texts** (the d-list) where the file is already open.

**Rough effort:** steps 1-6 half a day; step 7 the 1.5-2 h D1 estimate plus about 1 h for the [D2] hides; tests about 2 h.

**Order:** work in a scratch copy, as A-1 says, then apply. The gate is unit tests, the app harness (dev and `env=prod`), the prototype harness, then one adversarial review. **The deploy to dev needs Thomas's OK.**

---

## Test ideas

1. **plainError unit tests.**
   - **Inputs:** `KISSFLOW_ERROR_050313 …`, a 429, "Kissflow did not answer within 30 s…", "x (SDK); y (REST)", "a (fetch); b (SDK)", a JSON fallback, "Kissflow answered a list in an unknown shape…", VerifyError.
   - **Expect:** each maps to its sentence, and none contains a raw token.
2. **A "no technical tokens in prod" test** (in the `app-live/shell.test.tsx` pattern, `{ env: "prod" }`).
   - **Render:** the shell with raw warnings, notes, loadError, a case banner reason, a pin and drafts.
   - **Assert none of:** `/_A00\b|KISSFLOW_ERROR|\((SDK|REST|fetch)\)|[A-Z][a-z]+_[A-Z][A-Za-z]+|OWN:current|REM:current|read route|hand-off|history line|screen's state|person menu|\.\./`, and no Kissflow item id.
   - **Then:** the same render with `{ env: "dev" }` still shows the raw list (no loss for developers).
3. **Store / api tests** (`app-live/api.test.ts` with `createFakeClient`), for each writer failure path (throw, Stop, partial, hand-off failure, effects):
   - in prod the toast passes the token regex;
   - the Writes log keeps the raw `detail`;
   - three cases in review give one grouped effect toast.
4. **The A2 regression:** a loadError ending in "." gives exactly one "." in the banner, and StartBoundary has no ".)".
5. **Prod data:**
   - run `configFromRows` on the seed's config rows (`kissflow-build/config-seed/rows`): expect no config warning;
   - map a case pinned to `RS-2026.1` + `CIQ-2026 v1` with the seed release's Manifest_Hash: expect no pin problem and no note.
6. **App harness, `env=prod` scenarios** (`scripts/harness-applive.mjs`; it already plays prod at `:127-128` and collects console errors at `:480`):
   - (a) a refused list gives the one-line summary only;
   - (b) a failing webhook gives a toast without a code;
   - (c) a submit failure at create gives the unsent-items banner, and Diagnostics `#drafts` sends it;
   - (d) Add a section, Reactivate, Run reminders and a department's Reopen are not offered;
   - (e) the admin pages are read-only: clicking gives no toast;
   - (f) zero console errors except provoked ones.
   Then the same scenarios in dev, expecting the raw texts and the top bar.
7. **D1:**
   - **Live:** a render with `LiveFeatures.mails = false` over the internal routes contains no "e-mail", "E-mailed" or "inbox", except the contact e-mail labels and table headers.
   - **Prototype:** `harness:prototype` stays green with the promises. Update any prototype test that asserts a live text.
8. **Manual in dev, after the deploy** (Thomas's OK):
   - load as RMM with ZZT data: the pin and notes show in dev;
   - open the same build with `env=prod` in the harness: only meaningful messages.
   - The real reviewer-role check for A12 needs a tester in a reviewer role (A-4).

---

## Critic additions (22 Oct, completeness review)

**How:** read-only, from code, plus the last app harness report (`prototype/dist-applive/harness-report.json`, 21 Oct 17:30), `kissflow-build/CIQ-UAT-test-cases.xlsx` and `kissflow-build/TEST-GUIDE-PROD.md`. Nothing was run, built or called. Same scope and path rules as above.

### New rows

| # | Class | file:line | Current text / behaviour | When it fires | Fix |
|---|---|---|---|---|---|
| A14 | (a) | `features/review/ReviewQueue.tsx:98`, `features/review/ReviewWorkspace.tsx:95`, `features/review/RmesTab.tsx:67`, `features/rmm/tabs/OverviewTab.tsx:218` | "A task appears when a supplier confirms completeness…" / "The review tasks are created when the supplier confirms completeness" / "The internal RMES record is created when Safety or Regulatory gets a review task" / "the supplier is asked for the final release once all have completed" | Every department reviewer waiting for a task, in prod. **Live:** reviews and the release request start only on the RMM's next full load, and the RMES record only on Safety's or Regulatory's own next load (`load.ts:896-948` runLoadEffects, `effectsFor`; `TEST-GUIDE-PROD.md` steps 6 and 12). | The live texts name the trigger, as C18 does for the release: "…once the supplier has confirmed completeness and RMM has opened CIQ Digital", "…created the next time a Safety or Regulatory reviewer opens CIQ Digital". The D1 replacements for ReviewQueue:97-98 and ReviewWorkspace:95 still leave the trigger out. Merge them into this. |
| A15 | (a) | `app-live/write/actions.ts:194` (draft); `app-live/write/activation.ts:83` via `:284` | "…but not sent: KISSFLOW_ERROR_050302 You don't have permission to access this item.. Open Diagnostics…" (from the harness report, scenario draft-send). Also "Not started: …has no RMES record.." | A cause that already ends in "." (the Kissflow refusal texts, and `activation.ts:72-74` plan.error). | The same trimEnd as A2. A2's list misses these two places. |
| A16 | (a) | `features/admin/shared.tsx:14-15`, `:20-28`; `features/admin/RuleTable.tsx:42` | **A7's proposed fix breaks the admin pages.** `canRead = canEdit \|\| auditor`. If `canEdit` gets `&& liveFeatures.configEdit`, the Business administrator fails AdminOnly on all four admin pages and sees "Only the business administrator maintains…". "Test rules" also disappears, because it is gated on `canEdit`. | The BA on /admin/* once A7 ships as written. UAT TC-44 step 1 (banner) and step 2 ("Test rules" > "Try one material") would fail. | Add a separate `canChange = canEdit && liveFeatures.configEdit` and use it only for the edit controls: RunReminders, ConfigBar create/discard, publish, the rule, section and field editors, OwnershipMatrix cells, ReminderRow. Leave `canEdit` and `canRead` as they are, so the Test tab stays. Hide ReadOnlyNote while `!configEdit`, as A7 says. |
| A17 | (a) | `kissflow-build/CIQ-UAT-test-cases.xlsx`; `kissflow-build/TEST-GUIDE-PROD.md:68`, `:80`, `:103` | The tests BDF runs quote texts that this plan changes or hides:<br>• TC-23 step 3: A4's toast, and the "Add a section" window.<br>• TC-38 steps 1-3: A5's dialog and toast.<br>• TC-37 step 1: the cancel dialog.<br>• TC-34: the CompletePanel:219 panel, which mentions an e-mail.<br>• TC-18: AskModals:36 "E-mail to <case contacts>…".<br>• TC-44 step 1: the config banner.<br>• Sheet 1 readme: "is not available in this version yet", and the e-mail note that names TC-04/18/24/34/37.<br>• TEST-GUIDE-PROD: the noPortalContact prefix (:68, :80) and ASK_RMM (:103, A8). | Any D1, [D2] or wording change ships to prod while the old quotes stay. | Change the workbook and the guide in the same push as the screens. If D2 hides the window, TC-23 and TC-38 become "the button is not offered". Keep the prefix "None of the active supplier contacts has a portal user yet" unchanged (see the noPortalContact challenge below). |
| C29 | (c) | `app-live/Diagnostics.tsx:214` | Unsent drafts subtitle: "…not sent on, because a required field was still empty." | Always. With A1, testers are sent to this card in prod. **False for most drafts:** a failed read-back or submit leaves one too (`write/actions.ts:194-212`: a 429, a timeout, or a 0503xx refusal as in harness draft-send). | "Items that reached Kissflow but were not sent on. Send them, or discard them." This is part of C26's prod order. |
| C30 | (c) | `app-live/write/handoff.ts:105`, `:107`, saved by `app-live/write/audit.ts:73-74` (Notify_Recipient) | "…so the hand-off waits for Beiersdorf's system." / "…the questions history waits for Beiersdorf's system." | Every pending hand-off. PENDING_PARTIAL_HISTORY already fires on the harness's plain MIC raise-and-accept flow (scenario mic-raise-accept). The text is stored in the CIQ Audit Event row, which is visible in Kissflow's own item view. | The same false promise as A10, in a lasting record. New rows: "Not sent to the supplier portal: this screen could not read every open point of the case." Existing rows keep their text. |
| C21+ | (c) | `app-live/shared/caseStartPayload.ts:102` | The same text as guard noPortalContact (`write/guards.ts:34`). | A backstop: reached only if the guard is bypassed. | Missing from C21's list. Keep the two texts identical, and change them together with the challenge below. |
| D1+ | D1 | `features/rmm/CaseActions.tsx:63` | Cancel dialog: "The supplier contacts get a short notice without your reason." | RMM cancels a case. | "The supplier sees the request as withdrawn by Beiersdorf, without your reason." (The portal shows "Withdrawn by Beiersdorf", TEST-GUIDE-PROD:106.) Update TC-37 step 1 with it. |
| D1+ | D1 / [D2] | `features/suppliers/SupplierDetail.tsx:280` | Deactivate supplier: "…its contacts can no longer open the supplier portal." | BA deactivates a supplier. | The same **[check with the portal session]** as `forms.tsx:325`. UAT TC-40 says that an "access ended" message is not in this version. Suggested: "An inactive supplier can't be chosen for a new case. Its history and closed cases are kept." |

### Classification challenges

| Row | Challenge | Suggested |
|---|---|---|
| (d) `write/guards.ts:34` noPortalContact | **Fires on prod data**, not only on test data. The app can't link portal users (`PROD-READY-2026-10-21.md:77-82`), so every supplier added in the app hits it until a contact's "Portal User Id" is set by hand in Kissflow's form view. The tail "Invite a contact to the portal first." names an action that RMM can't take in any app screen. New case also shows no portal status per contact, so RMM learns this only at Start. | (c) wording. Keep the quoted prefix and change the tail: "…Ask your CIQ administrator to link a contact to its supplier-portal user, then start the case." Optional: a hint under the contact picker. |
| (b) B8 | The prod check "No screen withdraws a review" is incomplete. The Case administrator works in Kissflow directly (`AppLiveApp.tsx:93`) and can withdraw an item there. The warning then repeats on every load. | The fix (drop it, count it) stands. Only the reasoning changes. |
| (b) B5 | `config.ts:152`/`:154` fire whenever a role can't read CIQ Config Version, and every role reads it (`load.ts:101`). Whether every prod role may read it is a grants question that the seed check doesn't answer **[unverified]**. | If a role is refused, it is a C1 read failure, not test noise. B5's "skip when the config list failed" already covers the text. |
| (d) FinalDocumentTab, HistoryTab:95 | `FinalDocumentTab.tsx:63` "Document seal: unchanged" and `OverviewTab.tsx:183` "Sealed at the final release" mean nothing live. The document is rebuilt from the current data on every load (`map/toAppState.ts:264-270`: "no v6 writer seals one"). No app-live code reads the stored `Final_Document_Hash`. So the seal can't show "broken". | Not noise, but a claim that nothing checks. Thomas decides: keep it, or compare it with `Final_Document_Hash` once the final-pdf service has written it. |
| (d) final document mail | `features/rmm/CaseDetail.tsx:233` "…and sent to {owner}" and `features/rmm/NewCase.tsx:369` "…the final document comes to you" are not in D1. They are true only while the final-pdf Apps Script service runs in prod (`kissflow-build/final-pdf/README.md` step 6; UAT readme: "The only e-mail is the final document… (TC-33)"). | (d), **[check]** that the service runs in prod. |

### Checked, nothing to add

**Console:**
- The SDK 1.0.49 bundle has exactly one `console.*`: `kfsdk.es.js:235` "Message callback error".
- No unhandled rejections:
  - `connectKf` never rejects (`portal/kf/sdk.ts:130-150`);
  - the screens' `void Promise.resolve(r).then(...)` get the `saved` promise, which never rejects (`api.ts:308`);
  - `serial` catches errors (`LiveAppStore.tsx:151-152`);
  - Diagnostics `act` catches.
- `features/**` has no `console.*`.

**Fine (d):**
- `LiveAppStore.tsx:338`, `:368` "This draft is no longer listed. Reload and look again."
- `features/admin/OwnershipMatrix.tsx:84` (the one-lead warning).

**Not reachable live:**
- `features/reports/Reports.tsx:116`: the "downloaded" toast; the button is hidden (`:62`).
- These DemoNotes, hidden by ProductionContext: `SectionContent.tsx:209`, `RmesTab.tsx:97`, `AuditTrail.tsx:31`, and `CriterionRow.tsx:121` (whose AI suggestion is also gated on `!production`).
- `features/suppliers/SupplierDetail.tsx:58` (`DEMO_SUPPLIER_IDS`) gives "Supplier master" live.
- `features/understanding/**` is not reached by `app-live/routes.tsx`.

**Noticed, not a text (outside this clean-up):**
- **Supplier documents can't be opened live.** Live documents carry no file link (`map/caseMap.ts:210-227`), and `DocName` (`components/DocName.tsx`, `store/fileUrls.ts`) links only files uploaded in this browser session. A reviewer clicks a document name and nothing happens; no message says why.
- **Cancel leaves Kissflow tasks open.** A cancel leaves the review items and other raisers' open points open in Kissflow's own task lists (`write/actions.ts:660-662`). The CIQ screens and TC-37 show them as ended. The UAT readme already tells testers to work only in the CIQ screens.
