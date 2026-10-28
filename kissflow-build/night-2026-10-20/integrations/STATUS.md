# Hand-off integrations: status (20 Oct)

**Kissflow-internal.** Every portal ↔ app hand-off of plan v6 §4 is now a Kissflow integration in the Development sandbox (`dev-beiersdorf.kissflow.eu`, account `AcDOSunMEpSA`). Each one is built over REST, its steps passed the builder's own **Test** on real ZZT data, it is published and **switched on**, and it was read back. The app session built and owns six (`kissflow-build/ciq-digital/integrations/SPEC.md`); this session built and owns six (here). How to build one: `RECIPE.md`.

## What runs

Every hand-off is a **webhook**. A screen posts only the id of the item it acted on (plus an idempotency key, which the integration ignores). The integration reads the item from Kissflow, a script checks it and refuses what doesn't hold, and Kissflow Process actions write the target. The target always comes from Kissflow data, never from the payload.

| Plan | Integration (container) | Payload | Steps | Who posts it |
|---|---|---|---|---|
| request.changed | `CIQP_Request_changed_to_case_A00` (portal) | `{portalRequestItemId}` | search request → pick (refuses a cancelled request) → search case → check (in progress or completed, linked to exactly this request) → update the case's 15 answer fields | portal screen, after every save, upload, removal or change report (also after the release: proven on a completed case) |
| I-1 case.started | `CIQ_I_1_Case_to_supplier_request_A00` (app) | `{caseItemId}` | search case → search requests naming it → check (in progress, no completeness, no linked or twin request) → **Create and submit** the CIQP Request (header fields, bundle, contacts, assignees as user lists) → link `Portal_Request_Item_Id` on the case | app screen, after the RMM's Start submit |
| I-2 completeness.confirmed | `CIQP_Completeness_confirmed_to_cas_A00` (portal) | `{portalRequestItemId}` | search request → check (Confirmed, not cancelled) → search case → check (linked, still waiting) → update the case (Completeness_*, the 15 fields, phase Review) → **Approve** "Waiting for supplier: CIQ" | portal screen, after the fill-in submit |
| I-3 / op.round | app session: `CIQ_op_round_…` | `{opItemId}` | round 1 and every later round | app screen |
| I-4 query.answered | `CIQP_Query_answered_to_open_point_A00` (portal) | `{portalQueryItemId}` | search query → check (has an answer) → search open point → check (it waits on exactly this query, no outcome) → update the point (Response_*, OP_Progress "In progress") | portal screen, after the respond submit |
| I-5 release.requested | app session: `CIQ_release_requested_…` | `{caseItemId}` | writes the case's `Release_Requested_At`; on the request: Release_Flag "Requested", lock, label, Release_Contacts, and clears Release_At / Release_By_Name | app screen |
| I-6 review.reopened | `CIQ_Review_reopened_to_supplier_re_A00` (app) | `{caseItemId}` | search case → check (has a request) → search request → check (its release was requested, not cancelled) → update the request: Release_Flag "Reopened", unlocked, "With Beiersdorf" | app screen |
| I-7 release.given | `CIQP_Final_release_to_case_A00` (portal) | `{portalRequestItemId}` | search request → check (released, Release_Flag "Requested", not cancelled) → search case → check (in review, linked to this request, `Release_Requested_At` set and not later than the release, with 15 min of clock skew allowed) → update the case (Final_Release_*, phase Completed) → **Skip and complete** | portal screen, after the release submit |
| op.edited, op.closed, history.updated, case.cancelled | app session | ids only (history and cancel carry their screen values) | see SPEC.md | app screen |

**The URLs:**
- app screens: `SET:current` → `Payload_JSON.webhooks`. The Content_Hash was recomputed and the row read back; it is still Published.
- portal screens: `prototype/src/portal/kf/portal.ts` `webhooksFor()`, which gives the dev sandbox account only; any other account sends nothing.

The transport is the same on both sides: `fetch(url, {method: "POST", mode: "no-cors", headers: {"Content-Type": "text/plain"}, body})`, fire-and-forget, and `kf.api` only when that fetch throws.

## Evidence (all read back; ZZT items deleted afterwards, GET 404)

- **Step Tests on real data:**
  - request.changed 5/5; I-1 5/5 (on a fresh case); I-2 6/6 (the case moved to review); I-4 5/5; I-6 5/5; I-7 6/6 (the case completed).
  - The twin search finds an existing request by the case id, so the I-1 guard is real.
- **Live production-path runs** (a real webhook POST to a switched-on integration):
  - request.changed: Rev 4 and Rev 5 reached the case in about 5 s, with application/json and with text/plain.
  - I-1 created and linked a request.
  - op.round (app session) created the query from the deployed app's URL in SET:current.
  - release.requested cleared a non-empty Release_At / Release_By_Name and set Release_Requested_At.
- **Live attack test:** a forged release.given for a case Beiersdorf never asked to release was refused; the case was unchanged.
- **Review:** a read-only review of the integration code ran under three lenses, with every finding checked adversarially. It confirmed 13 findings. Fixed: I-7's HIGH (completion on supplier-side evidence only), I-4's old-round replay, the I-6 checks, I-1 twins, the linked-request checks, refusing cancelled requests, I-7 resumable after a failed complete, and the builder's orphan references, stale test flags and manual-change guard. Kept open, low: see "Known limits".
- **Portal UI** (`ciq-portal-ui-042e9e576c.zip`, **deployed**, component Live, read back):
  - It posts all four portal hand-offs.
  - **The CSP question is settled:** a no-cors text/plain POST from the custom UI's own origin (`resource.eu.kissflow.store`, the deployed bundle's document) reached Kissflow. It shows in request.changed's Run history, refused as designed for a dummy id.
  - Tests: 969/969 unit tests. The built-bundle harness passes 30/30 (315 checks): the `handoffs-dev` scenario proves four posts, each after its submit with only an id and a key, and a guard ensures no harness run can reach Kissflow.
- **Second review** (portal wiring, two lenses, adversarially checked): it confirmed 7 findings, all fixed.
  - A submit that went through although its answer was lost now still hands off: the screen checks whether the item moved on.
  - A failed change-report hand-off says so honestly.
  - The API fallback checks for a Kissflow error body.
  - The harness checks are tightened.
  - request.changed now accepts a completed case (an admin update on a completed case was proven live), so change reports after the release reach the app.
  - I-7 requires the request's "Requested" flag and allows 15 min of clock skew.
  - request.changed and I-7 were re-tested on a fresh ZZT case, driven through the live I-1 → I-2 → release.requested as the screens would: 5/5 and 6/6.

## Changed in Kissflow today

- **Integrations:** 6 created here (I-1 converted from a Process trigger to a webhook in place) and 6 by the app session. All 12 are ON.
- **Untouched:** Test, Mail Integration - Thomas, the retired outbox mail, and Z1/Z2 (all OFF).
- **The app role "Integration service":** Thomas added as its only member (approved in chat). I-2's Approve needs it, because the connection acts as Thomas. Side effect: Kissflow's native task mails for the two case steps reach Thomas.
- **SET:current:** `webhooks` added (8 app codes).

## For Thomas

1. **The supplier's release-step moves aren't built** (plan v6 §2, option a). No integration may move a supplier-held step: impersonation is untested, and the only other users are real people. So the supplier's screen has to:
   - submit "keep the CIQ up to date" when Release_Flag is "Requested". `Keep_Open_Gate` is Mandatory there; the screen would write it just before the submit.
   - submit "give the final release" when Release_Flag is "Reopened", so the go-to returns the request to editing. Release_By_Name and Release_At are Mandatory there.

   Until this is decided, a request with a release requested stays at "keep up to date" and the supplier can't give the release. **Corrected 21 Oct (night tests):** option (a) as first written can't work, because `Keep_Open_Gate` is a formula (`""`) that no screen can fill. It isn't needed either: a REST submit ignores Mandatory fields (P-2, proven at fill, keep, respond and give), so the screen only submits "keep" when Release_Flag is "Requested" and "give" when it is "Reopened". The release fields themselves can't be written by the screen until the user-route permission problem (P-1) is fixed. See `kissflow-build/MORNING-2026-10-21.md` §3 B-1 and B-3. **Decision needed:** go for these two moves.
2. **Mail Integration - Thomas is OFF.** Testing its Email step sends a real e-mail to the sample's "To", so it needs your OK and a recipient. The per-event mails (B-xx) aren't wired to it yet.
3. **I-9 scheduler:** plan D-5 says you build the first one by hand.
4. **The portal UI is deployed** (`ciq-portal-ui-042e9e576c.zip`). Nothing to do.

## Known limits (low, by design or deferred)

- **I-2: a failed Approve after the record step blocks a re-post.** The case keeps its completeness while still at "Waiting for supplier: CIQ". Reviews and I-7 still work, because I-7's Skip and complete ends the case from any step. The repair is an admin move. A proper fix would add a field to the case (the waiting step's activity id), so it is deferred.
- **Webhook URLs are the only secret** (no auth) and ship in the bundles. Every integration reads its targets from Kissflow, so a forged call can only re-apply what Kissflow already holds, or is refused.
- **A hand-off that fails to send** is reported to the user ("…has not reached Beiersdorf yet… Please let your Beiersdorf contact know."). There is no automatic resend. With no-cors the answer is opaque, so a POST that reached Kissflow but was refused there (a guard) shows only in the integration's Run history (Manage → Integrations → Run history).
- **Capturing a webhook sample on a switched-on integration runs it for real.** Switch it off first (the builder toggle calls `PUT /flow/2/{acc}/integration/{id}/deactivate`).

- **25 Oct, I-2 step order.** A real run's bulk review create times out after 150 s (KISSFLOW_ERROR_10277), although the reviews are created. So it now runs last, after the history row and the Approve. Proven end to end on ZZT-E2E-25B (26/26). I-2's runs show "Failed" because of that timeout.
