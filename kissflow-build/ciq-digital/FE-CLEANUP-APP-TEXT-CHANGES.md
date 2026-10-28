# FE clean-up, app half: every user-visible text change (22 Oct)

**Kissflow-internal.** For the portal session: the UAT workbook (`kissflow-build/CIQ-UAT-test-cases.xlsx`) and the test guide (`kissflow-build/TEST-GUIDE-PROD.md`).

**How to read it:**
- Paths are under `prototype/src/` of the scratch copy; line numbers are of the changed files.
- **Env:**
  - **prod** = production only; dev keeps the old text.
  - **both** = dev and production.
  - **live** = the live app in both envs, through `LiveFeatures` (`components/liveFeatures.tsx`); the prototype keeps the old text.
- **QUOTED** marks a change that a UAT test case or TEST-GUIDE-PROD quotes or describes. Each one is listed again in section 5.
- **(review)** marks a row added or changed after the two reviews of 22 Oct. Section 6 lists what the reviews changed.
- **Not changed** (the task excluded them):
  - any D1 e-mail promise;
  - the reactivation promises (A5);
  - the FinalDocumentTab seal;
  - "Final document sent to you".
- **Not changed, deliberately:**
  - `kf/client.ts:245` ("…It waits as a draft under My items."): such a draft may not reach Unsent items, and production shows a plain cause instead anyway.
  - C28 (SF codes): it would change the prototype too.
  - `app-live/shared/caseStartPayload.ts` (review): the portal session's file (DESIGN §2), so it is not edited. Its backstop still throws "…Invite a contact to the portal first."; the app shows that as the guard's new text in both envs (`userText.ts:130` startText). **For the portal session:** to align the file's own text, change it in `shared/` yourselves.

## 1. Shell, boot pages, store pages

| # | file:line | Old | New | Env |
|---|---|---|---|---|
| C2, A2 | `app-live/AppLiveShell.tsx:102-106` | Couldn't refresh from Kissflow: {raw}. You are seeing the data from HH:MM. (a raw ending in "." gave "..") | prod: "Couldn't refresh from Kissflow. You are seeing the data from {HH:MM}." / dev: the raw text without its own closing stop | prod / both |
| A1 | `app-live/AppLiveShell.tsx:156` | (none) | New banner on every page except Diagnostics: "You have {n} unsent item(s): {labels}. It reached / They reached Kissflow but was / were not sent on. [Send or discard]". The link goes to Diagnostics `#drafts`. | both |
| C1 | `app-live/AppLiveShell.tsx:166-186` | "{n} thing(s) could not be read in full; what you see may be incomplete. Diagnostics", then the raw list | One line, no list and no count: "Some data could not be loaded, so this page may be incomplete. Reload · Details", or "Some data could not be refreshed; parts of the page show the state of {HH:MM}. Reload · Details". Then, per case left out: "Case {code} could not be loaded and is not listed." | prod |
| C1, C9 | `app-live/AppLiveShell.tsx:189-200` | same as above; link "Diagnostics" | Same summary, link "Details". Two lists: "Could not be read" (the raw read failures) and "Notes" (the mapper's notes, B3-B10). With notes only: "{n} note(s) on how the data was read. Details" | dev |
| C8 | `app-live/AppLiveShell.tsx:123` | Kissflow did not let your role read this case's questionnaire ({why}). You see its header, reviews and open points. | "The questionnaire of this case could not be loaded for your role. You see its header, reviews and open points. If you need the answers, tell your CIQ administrator." | prod |
| A7 (d) | `app-live/AppLiveShell.tsx:133` | Configuration changes are not live in this version. The configuration shown is the one cases use. | "In this version the configuration is read-only. Cases use the configuration shown." **QUOTED: TC-44 step 1** | both |
| A3, C6 | `app-live/PageBoundary.tsx:25-26` | Something on this page is not in the shape CIQ Digital expects ({error}). Other pages and cases are not affected. Reload, and open Diagnostics from the person menu if it stays. | prod: "Something on this page could not be shown. Other pages and cases are not affected. Reload the page; if it stays, tell your CIQ administrator which page you opened." / dev: as before, with the error's own stop dropped | prod / both |
| C4 | `app-live/AppLiveApp.tsx:87-93` | {detail} If this keeps happening, reload the page. | "Kissflow did not answer. Reload the page; if this keeps happening, tell your CIQ administrator." The raw detail sits folded under "Technical details". | both (the env is not known yet) |
| C5, A2 | `app-live/AppLiveApp.tsx:133` | Something went wrong while opening the app ({error}). Reload the page; … | prod: "Something went wrong while opening the app. Reload the page; if it stays, tell your CIQ administrator." / dev: the error without its own stop (no ".)") | prod / both |
| C7 | `app-live/AppLiveApp.tsx:105-106` | Your Kissflow account ({email}) has no CIQ role in this app (roles: …). Case administrator and Integration service work in Kissflow directly. | "Your Kissflow account ({email}) has no CIQ Digital role. Ask your CIQ administrator for one." | prod |
| C11 | `app-live/AppLiveApp.tsx:217` | Connecting to Kissflow… | "Loading CIQ Digital…" (the same label as the page's own loader and the store's) | both |
| C3 | `app-live/LiveAppStore.tsx:451` | {raw loadError} | "Kissflow did not answer or did not allow the request. Try again in a moment; if it keeps happening, tell your CIQ administrator." | prod |
| B1 | `app-live/map/caseMap.ts:256` (pin banner) | This case is pinned to rule set {rs} with questionnaire {tpl}, which no configuration release provides; its sections may be shown from another questionnaire version. | "This case uses a questionnaire version that is not available here, so its sections may differ from what the supplier filled in." The raw text moves to the dev notes, and the duplicate load warning is gone. | both |
| B2 | `app-live/map/caseMap.ts:257` (pin banner) | This case's configuration fingerprint does not match the release {key}; check the configuration before relying on its sections. | "This case's questionnaire differs from the published version. Check with the Business administrator before relying on its sections." The raw text goes to the notes. | both |
| B3-B10 | `map/config.ts:73,86,143,153,157,159`; `map/caseMap.ts:305,314`; `map/suppliersMap.ts:40,52,87`; `map/toAppState.ts:47`, `:189`; `map/trackMap.ts:112,126,211,318,323,392,443` | These were load warnings, shown in the box | Notes now: dev box and Diagnostics only. Wording unchanged, except two cases. **B6:** the per-supplier "Supplier {code}: the kind "Trader" is shown as distributor." is now one count, "{n} supplier(s) has/have the kind "Trader", shown as distributor.". **B5:** the OWN/REM notes are skipped when no config row was read at all. | both (never shown in prod) |
| C25 | `app-live/map/auditMap.ts:191`, `:272` | an unknown Action_Code shown raw ("foo.bar") in History / the Audit trail | "Other change" | prod |

## 2. Toasts and the texts the writers save

| # | file:line | Old | New | Env |
|---|---|---|---|---|
| A10 | `app-live/api.ts:123-126` (finalize) | "{success text} Beiersdorf's system will pass this on." | "{success text}". The Writes log and the audit row keep "pending". **QUOTED: TEST-GUIDE-PROD:114** | both |
| (dead) | `app-live/api.ts` | HANDOFF_FAILED " The hand-off to the supplier portal failed; Diagnostics lists it." | removed (handoff.ts never returns "failed") | — |
| C12 | `app-live/api.ts:111-115`; `app-live/write/actions.ts:100-109`, `userText.ts:58` (unfinishedText) | Not saved: {raw} / {done…} Not finished: {raw} | "Not saved: {plain}" / "{done…} Not finished: {plain} Reload to see the current state." (review) The suffix is left out when the plain cause already says to reload, so a timeout reads "…Not finished: Kissflow did not answer in time. Reload to see whether it went through." with one "Reload". The plain sentences are listed under the C-store table below. The raw cause goes to the Writes log (`detail`). | prod |
| C13 | `app-live/api.ts:131-132` | Saved, but its hand-off to the supplier portal ({code}) failed: {raw}. Diagnostics lists it. | "Saved. The supplier portal could not be updated just now, so the supplier may not see this change yet. Tell your CIQ administrator." **QUOTED: TEST-GUIDE-PROD:111** | prod |
| C17 | `app-live/api.ts:149` (`userText.ts:117`) | Not completed: Kissflow could not read {flow names} again just now, so the review gate could not be checked against what Kissflow holds. Nothing was written; try again. | "Not completed: part of this case could not be read again just now, so the review could not be checked. Nothing was saved; try again." | prod |
| A1, A15 | `app-live/write/actions.ts:218` | {what} was saved as a draft in Kissflow but not sent: {raw}. Open Diagnostics to send or discard it. (a raw ending in "." gave "..") | "{what} was saved as a draft in Kissflow but not sent: {cause}. Use Unsent items at the top of the page to send or discard it." The cause: raw without its stop (dev), or plain (prod). | both (the cause: prod) |
| A1, C15 | `app-live/write/actions.ts:234` | …but not sent: Kissflow misses {field ids}. Open Diagnostics … | prod: "…but not sent: Kissflow still needs some required information. Use Unsent items at the top of the page to send or discard it." / dev: "…Kissflow misses {ids}. Use Unsent items …" | prod / both |
| A1 | `app-live/write/actions.ts:245` (draftWaits) | …so it was not created again. Open Diagnostics to send or discard that draft. | "…so it was not created again. Use Unsent items at the top of the page to send or discard that draft." | both |
| A1 | `app-live/write/actions.ts:247` (draftUnread) | …Reload, or open Diagnostics to send or discard that draft. | "…Reload, or use Unsent items at the top of the page to send or discard that draft." | both |
| C15 | `app-live/write/actions.ts:202` (submitGated) | {what} was saved, but Kissflow still misses {ids}, so it did not move on. Reload and try again. | "{what} was saved, but Kissflow still needs some required information, so it did not move on. Reload and try again; if it stays, tell your CIQ administrator." | prod |
| C16 | `app-live/write/actions.ts:579` | Kissflow's review gate is not OK yet; nothing was completed. | "Kissflow does not see this review as ready yet (open points or RMES entries are still open). Nothing was completed; reload and check." | prod |
| C15 | `app-live/write/actions.ts:580` | Kissflow still misses {ids}; nothing was completed. | "The {Dept} review was saved, but Kissflow still needs some required information, so it was not completed. Reload and try again; if it stays, tell your CIQ administrator." | prod |
| C18 | `app-live/write/actions.ts:609` | {Dept} review completed. Every review is complete: RMM's CIQ Digital asks the supplier for the final release now \| when RMM next opens it. | "{Dept} review completed. Every review is complete; the final-release request goes to the supplier now \| the next time RMM opens CIQ Digital." | both |
| C19 | `app-live/write/audit.ts:118` | {what} done, but its history line was not saved ({raw}). | "{what} was saved, but it is missing from the case history ({cause})." The cause drops its own stop; prod gives it plain. | both (the cause: prod) |
| C19 | `app-live/write/actions.ts:445`, `:470`, `:629`, `:651` (the `what` of the line above) | "Open point X changed" / "Open point X closed" / "The {Dept} review handover" / "The RMM review reopening" | "The change to open point X" / "The closing of open point X" / "The handover of the {Dept} review" / "The reopened RMM review" | both |
| C19 | `app-live/write/actions.ts:922` (draftSentAudit) | The draft was sent, but its history line was not saved ({raw}). | "The draft was sent, but it is missing from the case history ({cause})." | both |
| C19 | `app-live/write/actions.ts:352`, `:376`, `:721` | "…({raw})" | The cause is plain in prod. `:378` "…(its RMES row is not known)" becomes "(its RMES entry is not loaded)" in prod. | prod |
| C20 | `app-live/write/actions.ts:121` (+ :328, :502, :660, :747, :770, :795) | The new {open point \| finding \| case \| note \| supplier \| contact} is missing from the screen's state. | "The screen lost track of the new {thing}. Reload and check whether it was saved." | both |
| C20 | `app-live/write/actions.ts:661` | No published configuration release for {rs} + {tpl}. | The guard's noRelease text (below) | both |
| C21 | `app-live/write/actions.ts:672-679` (`userText.ts:119`, `:121`, `:130` startText) | The release's bundle is not valid JSON. / …has no sections. / …(no WebCrypto). | "This questionnaire version can't be used to start a case. Ask the Business administrator." / "This browser can't start a case. Use a current browser." | prod |
| C24 | `app-live/write/actions.ts:883`, `:900` (saved on audit rows) | …sent to the supplier from an unsent draft. / (sent from an unsent draft) | "…sent to the supplier (after a retry)." / "(after a retry)" (new rows only) | both |
| C24 | `app-live/write/activation.ts:205`, `:206` (saved on audit rows) | History line restored: the review exists in Kissflow, but its start was not recorded. / (history line restored) | "Recorded late: the review exists in Kissflow, but its start was not recorded at the time." / "(recorded late)" | both |
| C23 (review) | `app-live/load.ts:544-551` (draftLabel), shown by the unsent-items banner (`AppLiveShell.tsx:156`), Diagnostics' Unsent items and the toasts "{label} sent." / "{label} discarded." (`LiveAppStore.tsx:359`, `:383`) | An unsent item whose key could not be read: "New case PkCase9", "Review PkRev9", "Open point PkOp9 on ZZT-0003" | "New case", "Review", "Open point on ZZT-0003" (no Kissflow item id). An item with its key keeps its label ("New case ZZT-0009 · OLIVIA"). | prod |
| A15 (review: dev texts) | `app-live/write/activation.ts:95` (causeText, used at `:184`, `:251`, `:342`, `:410`), `:295`; `app-live/load.ts:950` | "…(KISSFLOW_ERROR_050302 You don't have permission to access this item.)" / "…could not be prepared: … has no RMES record.." | The cause inside the brackets or after the colon loses its own closing full stop: "…(… access this item)". These are dev's effect toasts and the Writes log; production's effect toast is the plain one (A13, C14). | dev (Writes log: both) |
| C30 | `app-live/write/handoff.ts:108` (Notify_Recipient) | The screen does not know this case's Kissflow item, so the hand-off waits for Beiersdorf's system. | "Not sent to the supplier portal: this screen does not know the case's Kissflow item." | both |
| C30 | `app-live/write/handoff.ts:110` (Notify_Recipient) | Not every open point of this case was readable live, so the questions history waits for Beiersdorf's system. | "Not sent to the supplier portal: this screen could not read every open point of the case." | both |
| C27 | `app-live/write/activation.ts:114` (Writes log note) | …(Diagnostics lists it: send or discard it, or reload) | "…(it is listed under Unsent items: send or discard it, or reload)" | both |
| A13, C14 | `app-live/LiveAppStore.tsx:218-222` → `userText.ts:150-206` | One toast per case and effect: "Started in Kissflow: ZZT-1 reviews for RMM, SAF; the history line of …" / "Not started: …({raw})" / "Sent in Kissflow: ZZT-1 final-release request …" / "Started in Kissflow: ZZT-1 SAF RMES record (12 criteria)." | One toast per effect and load. prod: "Reviews started for ZZT-1 (RMM, Safety, Regulatory)." or "Reviews started for 3 cases: …"; "Final release requested from the supplier for ZZT-1."; on failure "The reviews of ZZT-1 could not [all] be started just now. CIQ Digital tries again the next time you open it." (the release and RMES texts read the same way); no toast for an RMES record created or a history line restored. dev: the old texts, joined into one toast. | prod / both |
| C15 | `app-live/LiveAppStore.tsx:354` (Diagnostics Send) | Still empty: {ids}. Nothing was sent. | "Some required fields are still empty, so nothing was sent." | prod |
| C22 | `app-live/write/guards.ts:27` caseUnknown | Kissflow did not give your role this case's item, so nothing can be saved on it here. Reload and try again. | "This case can't be changed from your role right now. Reload and try again." | both |
| C22 | `app-live/write/guards.ts:31` rmesCaseUnreadable | Kissflow did not let your role read this case's questionnaire, so its RMES record could not be prepared. Diagnostics shows why; ask the administrator to check your role's access to CIQ Case. | "The RMES record can't be prepared because your role can't read this case's questionnaire. Ask your CIQ administrator to check your role's access." | both |
| C22 | `app-live/write/guards.ts:32` rowUnknown | This RMES entry is not known to the screen yet. Reload and try again. | "This RMES entry is not fully loaded yet. Reload and try again." | both |
| C22 | `app-live/write/guards.ts:36` noRelease | The configuration {pair} has no published release row in Kissflow, so a case can't be started on it. Ask the Business administrator. | "Questionnaire {pair} has no published version, so a case can't be started on it. Ask the Business administrator." | both |
| noPortalContact, C21+ | `app-live/write/guards.ts:38` = `app-live/userText.ts:125` (NO_PORTAL_CONTACT); the backstop through `userText.ts:130` (startText) | …so nobody would get the questionnaire. Invite a contact to the portal first. | "None of the active supplier contacts has a portal user yet, so nobody would get the questionnaire. Ask your CIQ administrator to link a contact to its supplier-portal user, then start the case." The prefix is kept. (review) The text now lives in the app, not in `shared/caseStartPayload.ts`, which is unchanged; its backstop text is shown as this one. **QUOTED (prefix only): TEST-GUIDE-PROD:68, :81** | both |
| C22 | `app-live/write/guards.ts:40` supplierUnknown | This supplier's row in Kissflow is not known to the screen. Reload and try again. | "This supplier is not fully loaded yet. Reload and try again." | both |
| C22 | `app-live/write/guards.ts:42` contactsUnread | This supplier's contacts could not be read on this load (Diagnostics shows why), so a new contact could get a key one of them holds. Reload and try again. | "This supplier's contacts could not be loaded just now. Reload, then add the contact." | both |
| C22 | `app-live/write/guards.ts:43` contactUnknown | This contact's row in Kissflow is not known to the screen. Reload and try again. | "This contact is not fully loaded yet. Reload and try again." | both |
| C22 | `app-live/write/guards.ts:45` country | "{c}" is not in Kissflow's country list. … | "{c}" is not in the country list. … | both |

**The C-store table:** production's plain cause, `userText.ts:22-42`.

| Cause | Sentence |
|---|---|
| 429 | "Kissflow is busy right now. Wait a minute, then try again." |
| "did not answer within" | "Kissflow did not answer in time. Reload to see whether it went through." |
| VerifyError | "Kissflow did not keep every value. Reload and check the result." |
| 050201 | "This is no longer one of your open tasks in Kissflow. Reload to see its current state." (addition: the plan had no row for it) |
| 050312 with "mandatory" or "required" (review) | "Kissflow still needs some required information. Reload and try again; if it stays, tell your CIQ administrator." |
| 050312 otherwise: "Validation failed", "Invalid value / date", "is not a valid" (review) | "Kissflow did not accept one of the values. Reload and try again; if it stays, tell your CIQ administrator." |
| 0503xx (050302, 050313), 403, permission, PermissionDeniedToUpdate | "Kissflow did not allow this for your role." (review: only a real refusal now; the first pass also said it for 050312, 404 and "not found") |
| 01015, "not found", 404 (review) | "Kissflow could not find this item any more. Reload to see the current state." |
| network | "The connection to Kissflow was interrupted. Try again." |
| a fault of the app itself: a TypeError not from fetch, a ReferenceError, a RangeError (review) | "Something went wrong in CIQ Digital. Reload and try again; if it stays, tell your CIQ administrator." |
| anything else | "Kissflow could not complete the request." |

The app's own words pass unchanged (PlainError, the not-in-the-app text).

## 3. Diagnostics

| # | file:line | Old | New | Env |
|---|---|---|---|---|
| C26 | `app-live/Diagnostics.tsx:99-117` | Session, Reads, Warnings, Unsent drafts, Writes, Webhooks; subtitle "What Kissflow gives this app for you: …" | Unsent items, then "What could not be loaded", then everything else folded under "Technical details (for support)". Subtitle: "For support: what CIQ Digital could read and save in this session." | prod |
| C26 (review) | `app-live/Diagnostics.tsx:218-232` (LoadSummaryCard), `userText.ts:135-138` | "What could not be loaded" listed Kissflow's raw warnings ("CIQ Supplier PkSupSolvaro: its rows (contacts) could not be read: KISSFLOW_ERROR_050302 …", "…(Diagnostics shows why).") | Plain words: "Everything was loaded." / "Some data could not be loaded, so some pages may be incomplete." / "Some data could not be refreshed; parts of the pages show the state of {HH:MM}.", then "Case {code} could not be loaded and is not listed." per case left out, then "If it stays after a reload, tell your CIQ administrator: the technical details below show what failed." The raw list is the "Warnings" card inside "Technical details (for support)". | prod |
| C29 (review) | `app-live/Diagnostics.tsx:280` | The Unsent items table's columns "Draft", "Process", "Item" | "Item" only (the label; the process and the Kissflow item id are hidden) | prod |
| C26 | `app-live/Diagnostics.tsx:236` | (none) | New "Notes" card: "How odd rows were read on the last load (a duplicate key, an unknown value, a withdrawn item)." (folded away in prod) | both |
| C29, A1 | `app-live/Diagnostics.tsx:276` | "Unsent drafts" / "Items created in Kissflow but not sent on, because a required field was still empty. Send them once the cause is fixed, or discard them." | "Unsent items" / "Items that reached Kissflow but were not sent on. Send them, or discard them." prod hides the Process and Item columns, and Send / Discard errors are plain. | both |
| — | `app-live/Diagnostics.tsx:213` | What could not be read or understood in full on the last load. | "What could not be read in full on the last load." (the notes have their own card now) | both |
| A11 | `app-live/Diagnostics.tsx:371` | Without one, the change is saved here and marked "pending hand-off" in the history. | "Without one, the change is saved here but not passed to the supplier portal; the Writes log shows it as pending." | both |
| C12, C13 | `app-live/Diagnostics.tsx` Writes card | — | Shows each entry's `detail`, the raw cause. | both |

## 4. Screens (live app only, through LiveFeatures; the prototype is unchanged)

| # | file:line | Old (live) | New (live) | Note |
|---|---|---|---|---|
| A4 [D2 kept] | `features/review/AskModals.tsx:226-231`, `:198` | The window closed as if the section had been added; then the toast said it was not available. | A warning at the top of the window: "Adding a section to the scope is not available in this version yet." The click still toasts the same text, and the window stays open. | **QUOTED: TC-23** (window and step 3) |
| A6 [D2 kept] | `features/admin/ReminderSettings.tsx:129`, `:139` | A "Demo action" badge; after the refused click, "Nothing due as of {date}." | No badge. After the refused toast, the status line keeps "{n} open cases to check." | |
| A7, A16 | `features/admin/shared.tsx:16-21` (canChange); `ConfigBar.tsx:34,76,86,91,152,180`; `RuleTable.tsx:57,81,137,164,194`; `TemplateManager.tsx:54,89,91,123,255`; `OwnershipMatrix.tsx:74,121,166,170`; `ReminderSettings.tsx:243-250` | Every edit control was enabled, and each change toasted "Configuration changes are not live in this version. …" | No edit control (create, discard, publish, rules, sections, owner cells, reminder fields and toggles). The read view, the version history and **Test rules** stay. ConfigBar says "No draft is open. Cases keep the version they started with." in place of "To change the rules… create a new version…". The matrix hint becomes "Lead decides on the section; Co reads and comments.". The administrator's reminders footer is not shown. (review) With a draft, the version panel no longer adds "Only what you change gets a new version number." (`ConfigBar.tsx:76`). (review) The Auditor keeps its note "Read-only. Only the business administrator changes …" and its reminders footer, as before: the first pass hid the note, and the Auditor then had no read-only explanation (the shell's banner is the administrator's). | **QUOTED: TC-44** (steps 1-4: the read view stays; step 1's banner text changed, section 1; step 1 reads the version panel, whose sentence is not quoted) |
| A8 [D2 kept] | `features/review/CompletePanel.tsx:211-216` | A department typed a reason and confirmed, then got "Ask RMM: …" | The "Reopen my review" click gives "Ask RMM: only RMM can restart a review in this version." at once, with no reason box. | Matches **TC-17 step 6** and **TEST-GUIDE-PROD:104** (texts unchanged) |
| A9 [D2 kept] | `features/suppliers/forms.tsx:338-349` | Refused only at Confirm. The window said "The other case contact continues; you can also name a replacement." (or "…so a replacement must take over.") and offered "No replacement (the other case contact continues)". | (review) The window says up front: "{name} can't be deactivated while named on open cases: replacing a contact on running cases is not available in this version yet." It no longer promises that the other contact continues or that a replacement takes over, and the empty choice reads "No replacement". The Replacement field and Confirm stay; Confirm is still refused by the guard ("This contact is named on open cases. Replacing a contact on running cases is not available in this version yet."), and the window stays open. | Only for a contact named on open cases (not TC-01 or TC-40) |
| A14 | `features/review/ReviewQueue.tsx:100-102` (RMM) | Your review of the whole CIQ starts on every case as soon as the supplier confirms completeness. You also get an e-mail. | "Your review of the whole CIQ starts on a case the next time you open CIQ Digital after the supplier confirms completeness. You also get an e-mail." (the D1 sentence untouched) | |
| A14 | `features/review/ReviewQueue.tsx:103-105` (dept) | A task appears when a supplier confirms completeness on a case with a {Dept} section. You also get an e-mail. | "A task appears once a supplier has confirmed completeness on a case with a {Dept} section and RMM has opened CIQ Digital. You also get an e-mail." | |
| A14 | `features/review/ReviewWorkspace.tsx:97` | …The review tasks are created when the supplier confirms completeness; you get an e-mail then. | "…The review tasks are created once the supplier has confirmed completeness and RMM has opened CIQ Digital; you get an e-mail then." | |
| A14 | `features/review/RmesTab.tsx:71` | The internal RMES record is created when Safety or Regulatory gets a review task on the case. | "The internal RMES record is created the next time a Safety or Regulatory reviewer with a review task on the case opens CIQ Digital." | |
| A14 | `features/rmm/tabs/OverviewTab.tsx:223` | …the supplier is asked for the final release once all have completed. … | "…the supplier is asked for the final release the next time RMM opens CIQ Digital after all have completed. …" | |
| A14 (addition) | `features/rmm/tabs/OverviewTab.tsx:208` | The reviews start when the supplier confirms completeness. | "The reviews start once the supplier has confirmed completeness and RMM has opened CIQ Digital." | the same false trigger. **QUOTED: TC-12** (expected result, Reviews card) (review) |
| A14 (addition) | `features/review/CompletePanel.tsx:32-34` (a department, last open review) | You are the last open review: completing sends the final-release request to the supplier and locks its questionnaire. | "You are the last open review: once you complete, the final-release request goes to the supplier the next time RMM opens CIQ Digital, and its questionnaire locks." RMM keeps the old text, which is true for RMM. | Close to **TC-30 step 4** (it quotes the general line, which is unchanged) |

## 5. What the UAT workbook and TEST-GUIDE-PROD quote (update them in the same push)

| Where | Quotes | Changed? | Suggested update |
|---|---|---|---|
| **TC-44 step 1** | "Configuration changes are not live in this version. The configuration shown is the one cases use." | **Yes** | "The banner reads "In this version the configuration is read-only. Cases use the configuration shown."" Steps 1-4: no create, publish or edit buttons; "Test rules" > "Try one material" stays (step 2 unchanged). |
| **TC-12** (expected result, "Reviews") (review) | "Reviews: "The reviews start when the supplier confirms completeness." and "Based on the current scope: …"" | **Yes** (live) | "Reviews: "The reviews start once the supplier has confirmed completeness and RMM has opened CIQ Digital." and "Based on the current scope: …"". The second sentence is unchanged. |
| **TC-23** (window, step 3) | The window; the toast "Adding a section to the scope is not available in this version yet." | **Yes** (the behaviour; the toast is the same) | Window: "a warning at the top says adding a section is not available in this version". Step 3: "the same warning as a message; the window stays open (Cancel closes it); A7 is not added". |
| **TC-38** steps 1-3 | The Reactivate window and the toast | No | — (the window already stayed open; the promises are D2's) |
| **TC-37** step 1 / step 4 | The cancel window ("…short notice…") and the banner "RMM can reactivate it until <date>" | No | — (D1+ and D2 decisions) |
| **TC-34** step 2 | "…and the supplier contacts get an e-mail…" | No | — (D1) |
| **TC-18** | "E-mail to <case contacts> (no internal content)." | No | — (D1) |
| **TC-17** step 6 | "Clicking "Reopen my review" there shows "Ask RMM: …"" | Behaviour now matches it exactly (the message comes on the click) | — |
| **TC-30** step 4 | "…the reviews still to complete before the final-release request goes to the supplier." | No (the last-reviewer line changed for a department, live; section 4) | Optional: "…the last department is told the request goes the next time RMM opens CIQ Digital". |
| Workbook "Read me" (not in this version) | "…the app then shows a warning that the action "is not available in this version yet"" | No (still true; for TC-23 the warning is also in the window) | — |
| **TEST-GUIDE-PROD:68, :81** (critic: :68, :80) | "None of the active supplier contacts has a portal user yet…" | Prefix unchanged, tail changed | — (the guide quotes the prefix plus "…") |
| **TEST-GUIDE-PROD:104** (critic: :103) | "Ask RMM: only RMM can restart a review in this version." | No (the text is the same; it now comes on the click) | — |
| **TEST-GUIDE-PROD:46** | "a link appears only in the "… could not be read in full" banner" | **Yes** (prod) | "a "Details" link appears only in the "Some data could not be loaded…" line, and in the "unsent items" banner" |
| **TEST-GUIDE-PROD:111** | "If an app message says "Diagnostics lists it", look in Run history instead." | **Yes** (prod never says it now) | "If an app message says "The supplier portal could not be updated just now…", look in Run history." |
| **TEST-GUIDE-PROD:114** | "…without it, the message after each save ends "Beiersdorf's system will pass this on."" | **Yes** (no toast says it now) | "…without it, no hand-off runs: the save's toast looks normal, and only its CIQ Audit Event row records "pending"." |

## 6. What the reviews changed (22 Oct, second pass)

Two reviews (regressions and scope; technical noise in production) were checked one by one; these held and are fixed:
- **TC-12** quoted a changed text, and this file did not flag it: flagged now (sections 4 and 5).
- **`shared/caseStartPayload.ts`** belongs to the portal session: the first pass edited it. It is back to its baseline; the app holds the text (`userText.ts:125`) and maps the backstop's text to it (section 2).
- **Prod Diagnostics** still listed Kissflow's raw warnings unfolded, and the shell's "Details" link leads there: they are now under Technical details, and the card says it in plain words (section 3).
- **A role refusal for a validation:** 050312 ("This field is mandatory", "Invalid value"), "not found" and an app fault were all told as "Kissflow did not allow this for your role.". Each has its own sentence now (the C-store table).
- **"Reload" twice** in a partial save in production: once now (C12).
- **A9** still promised "The other case contact continues", but the guard refuses every deactivation of a contact named on an open case: the window says so now (section 4).
- **The Auditor** had lost its read-only note in the live app: restored (section 4).
- **Rows missing here:** C23's labels, the Unsent items columns, the dev punctuation and DESIGN.md §1.2 (updated in the scratch copy) are listed now.
- **Prod history of a row without an Action_Code:** the first pass showed "Other change" for it too; it keeps "Recorded" / "Changed" now (C25 applies to unknown codes only).

Not changed (not a text problem, or outside the app's files): the final-document service bundles some of the changed mapper files; its `PROVENANCE.json` (kissflow-build/final-pdf) goes stale until it is rebuilt, with the same document and seal.
