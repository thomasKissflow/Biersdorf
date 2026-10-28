
## shared/ is in (portal session, 20 Oct): typecheck clean, 9 tests

- **`caseStartPayload.ts`:**
  - `CASE_START_FIELDS` (the 6 field-name constants).
  - `async caseStartPayload({ release, undefinedOrigins?, contacts: [{portalUserId?, name, email, title?, mayConfirm, active?}], bdfAnswers: {"FLD-GEN-00x": value}, markets })` returns the 6 Start fields as strings. `release` is the Release row of CIQ Config Version, with its JSON fields as text or parsed.
  - It throws a plain-language `Error` when no active contact has a portal user, or when the release is unusable. Show that message as the toast.
  - `supplierBundle(release)` and `bdfSet()` are exported too.
- **`questionsHistory.ts`:**
  - `questionsHistory(case, nameOf)` returns the `Questions_History_JSON` string for `history.updated`.
  - `nameOf(userId, side)` gives the display name.
  - `supplierPointView()` and `statusCodeOf()` are exported too.
- **`handoff.ts`** (types only): `HandoffPayloads` (code → payload, for every §4.1 webhook), `HandoffCode`, `PortalHandoffPayloads`, and `SYNCED_REQUEST_FIELDS` (the 15 fields).
- **Build rule:** the root `npm run typecheck` and `npm test` include `src/app-live/**`, so work in progress must keep compiling. `shared/` must stay included in both.

## Contract changes from the portal session (20 Oct, after its adversarial review)

1. **`shared/handoff.ts`:**
   - **`release.requested`** now carries `{portalRequestItemId, releaseAssignees}`. Send `releaseAssignees` from the case's `Release_Assignees_JSON`.
   - **`review.reopened`:** the integration also unlocks the portal request. The app sends the same payload.
   - **NEW `change.received` `{portalRequestItemId, changeReportsJson}`:** once the app screen has recorded the supplier's change report (it arrives on the case's `Change_Report_*` fields), send the receipts `[{id: "CR-0001", at, text}, …]`. Without it the portal shows a report as "sent" for 10 minutes.
   - **20 Oct, ids only (app + portal session, Thomas's go):** the webhook URLs ship in the bundle unauthenticated, so the screen now sends app item ids only and each integration reads the portal target and the values from Kissflow. `case.started {caseItemId}` (NEW, I-1, after the case Start submit), `op.round {opItemId}` (round 1 at the raise and round N), `op.edited` / `op.closed {opItemId}`, `release.requested` / `review.reopened {caseItemId}`, `case.cancelled {caseItemId, phaseLabel, locked}`, `history.updated {caseItemId, questionsHistoryJson}`; `idempotencyKey` on every payload. Transport: `fetch` with `mode: "no-cors"` and `Content-Type: text/plain` first; `kf.api` only when that fetch throws. This replaces the `release.requested` shape above.
2. **`caseStartPayload`:** a contact without a portal user now has NO `id` key, instead of `id: ""`.
3. **Thread entries for answers with files** (`Questions_History_JSON`, `Thread_JSON`): set `documentId` = the upload's `uploadId` (`Documents_JSON[].uploadId`). The portal refuses to remove a file that answers an open question, and it finds those files by this id.
