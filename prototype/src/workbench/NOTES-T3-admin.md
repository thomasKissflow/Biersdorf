# T3 notes: Approver, Business Admin, Masters, Reader, Notes, Audit (2026-10-08)

Built against `kissflow-build/ciq-digital/WORKBENCH-DESIGN.md` §8.12–§8.16 (with §0.3, §3, §7, §12, §14). Local only:
no Kissflow call of any kind, no deploy, no `.env` read. Fictional people and suppliers only (`@example.test`).
Only T3 folders were written: `features/{approver,admin,masters,reader,notes,audit}`, plus this file and three appended
entries in `CHANGE-REQUESTS.md`.

## Checks (run from `prototype/`, 2026-10-08 ~02:17)

| Command | Result |
|---|---|
| `npm run typecheck` (existing) | clean (`tsc -b`, exit 0) |
| `npm test` (existing) | `Test Files 7 passed (7)` · `Tests 81 passed (81)` |
| `npm run typecheck:workbench` | exit 0; 0 errors in T3 folders. (Earlier tonight it failed only in T1's `features/case` and `features/rmm`: a case-only file-name clash; it is clean now.) |
| `npx vitest run -c vitest.workbench.config.ts <the 6 T3 folders>` | `Test Files 6 passed (6)` · `Tests 59 passed (59)` |
| `npm run test:workbench` (everything) | `Test Files 1 failed, 43 passed (44)` · `Tests 1 failed, 758 passed (759)`. The one failure is `guards.spec.ts` "no DELETE used as an HTTP method", tripped by **T4's** `harness/hostEngine.spec.ts`, not by T3 code |
| Harness S25a/b, S30, S31, S32 | **PENDING**: T4's `scripts/harness-workbench.mjs` does not exist yet |
| Scratch smoke (not the T4 harness) | **41/41 checks pass**. A temporary entry mounted only T3's routes, served by the Vite dev server inside a fake host page that answers SDK postMessage commands (both in the scratchpad; the entry was deleted afterwards). It was driven with headless Chromium (playwright-core, the same path as the portal harness). Covered: approver reject (partial read, Approve disabled, empty reason blocked, one S6 update then submit, case Completed) and approve (flow admin, later decision from P7, case to S7); config publish (state patch, then F8), retire (F8 first, then exactly `{Config_State:"Retired"}`), new version, new Section-definition draft (discard → create → submit), release build and publish; supplier contact add (one `Table::Contacts` row, then the mirror update) and Business Admin read-only; reader audit-log filter and a note as the only write; note edit by the author (one `Note_Text` update); Case Admin lane repair (F8 `lane.repaired`, then one admin update with QM lane fields only) and no button for RMM. No page or console errors. At 390 px wide no page scrolls sideways |

## Done

- **Approver (§8.12)** `features/approver/`
  - `#/approvals`: the queue of held `CASE_S6` tasks, plus "Upcoming" (Part 2, `Overall_Approval_Required` = Yes, only when the position is readable, with the read-quality banner).
  - `#/approvals/:caseId/:act`:
    - the case facts and the active lanes (confirmed, by, at, on behalf of, SAF/REG decision and reason);
    - T2's read-only `RmesSummary` per active SAF/REG lane;
    - the effective decision with its source (`wb-approval-effective-<D>`);
    - the later-decision read check under the counts policy: fail-closed blocks with the unread list and the `Late_Completions_Text` hint; attest writes F8 `count.attested` with `Object_Key` `<Case_Code>:approval`;
    - Approve and Reject, then `saveAtStep` → `submitStep` with an extra check on the fresh read.
    - A rejection writes `Overall_Reason`, a neutral `Supplier_Closing_Text` (taken from the pinned Text bundle, else a built-in text) and `Completion_Trigger` = "Overall rejection".
    - The K-WB fallback is handled, and Re-read leads to submit-only. The native reject is never offered.
  - Pure logic in `rule.ts`.
- **Business Admin (§8.13)** `features/admin/`
  - `#/config`: the list with kind and state filters, "New draft" and "New release".
  - `#/config/new?kind=`: a new draft with a skeleton payload, validation, pretty-print and a structured preview.
  - `#/config/:itemId`:
    - a Draft can be edited, saved and published (the state patch, then F8 `config.publish` / `release.publish`, with a retry if the F8 row fails);
    - a Published row is read-only, with **New version** (copy-on-write into a new Draft) and **Retire** (WB-D6: F8 `config.retire` first, then the state-only patch);
    - the row's versions are listed.
  - Release builder: Published rows → manifest, bundle and `Manifest_Hash` → create the Release Draft → publish → F8. The regression set is shown only.
  - `#/templates`: the same list filtered to Template and Section definition, with the current template's order, defaults and field lists.
  - No Delete anywhere. Write controls only with E on F2.
- **Masters (§8.14)** `features/masters/`
  - The list: search, columns per the design, and "New supplier" (RMM only, with a client-side code uniqueness check).
  - The detail: header edits (RMM only; `Supplier_Code` is never changed).
  - Contacts:
    - add or edit **one row per save** via `Table::Contacts` (a modify sends only the changed columns), with write-then-verify;
    - the mirrors `Contact_Portal_Ids_Text` and `Pending_Invites` are recomputed from the read-back and written only when they differ;
    - Deactivate and Reactivate instead of delete;
    - "Request invite" sets the timestamp and is labelled "requested, not sent";
    - the portal user id is a manual text input labelled "as given by portal user management (Thomas)".
  - Everyone without E on F1 sees `wb-supplier-readonly`.
- **Reader / Case Admin (§8.15)** `features/reader/`
  - `#/audit`: the F8 list. Filters: case code, category, actor, side, and a day range (inclusive, UTC day). Table or timeline view, paged by 100, read-only.
  - `LaneRepairPanel({ c, events, onDone? })`, exported from `features/reader`:
    - it is the UI over T0's `repairLane` and renders **nothing** for anyone who is not Case Admin;
    - it lists the active lanes that read incomplete, with the newest `lane.completed` snapshot beside the current values;
    - it offers Repair only when T0's `repairBlocker` returns null, and shows the reason otherwise. The Repair button needs a reason.
- **Notes (§8.16)** `NotesPanel({ c, linked? })`:
  - it lists F7 rows by `Case_Item_Id`, with a "This item / Whole case" switch when `linked` is set;
  - Add writes Note_Key, the case keys, `Linked_*`, `Note_Text`, `Note_Author` = me, `Note_Dept` from the role and `Note_At` with no milliseconds;
  - Edit is offered only to the author (BR-064) and writes `Note_Text` only;
  - there is no delete.
- **Audit (§8.16)** `AuditTimeline({ events, dense? })`:
  - props only, newest first;
  - readable labels for every §7.8 action code, and correcting rows are marked;
  - shows old → new values, the reason, and the recipient as "not notified automatically";
  - the snapshot is collapsible, and there is a dense mode.
- **Unit tests (59)**:
  - BR-035 with the effective decision: a later "Rejected" blocks, a later "Approved" enables, the newest wins, and points that should not count are ignored;
  - the partial read under fail-closed and under attest, unreadable rows, and no SAF/REG lane;
  - the rejection side fields, the client and fresh-read checks, and the closing text source;
  - S6 save and submit on the fake host (only S6 fields, no reject), and a blocked Approved;
  - copy-on-write versions, the state-only Retire (F8 first; F8 failure means no update), publish order and its refusals;
  - the release manifest, bundle and hash, hash-mismatch blocking, and the create → publish → F8 sequence;
  - single-row contact saves, mirror recompute, deactivate without delete, and invite requests;
  - the note builder, edit by the author only, and the create lane;
  - the audit filters and the lane-repair helpers;
  - an SSR render of `AuditTimeline`.

## Stubbed / not built

- Harness scenarios S25a/b and S30–S32 are PENDING until T4's runner exists.
- "Download" of config versions (BR-057 "downloadable") is not built: it is not in §8.13.
- The regression set is shown, never run (as designed).
- `LaneRepairPanel` is **not** embedded in T1's case detail (T1's folder). T1 or T5 should place it in the "Departments & lanes" tab and the S5/S8 panel: `<LaneRepairPanel c={bundle.case} events={bundle.events} />`.

## Deviations and choices (simpler or safer option where the design is open)

1. **After an attestation the decision uses the points that ARE visible** (falling back to `<D>_RMES_Decision` only where none is visible). §8.12 says "falls back to `<D>_RMES_Decision`". Read literally, that would ignore a *visible* later "Rejected". This is stricter and is unit-tested.
2. **Later-decision read (pure `laterDecisionRead`)** = the counts rule (`listUnread`) plus per-point checks: an index-only point, an unreadable status, a blank kind, or a completed SAF/REG Department review with a blank outcome makes the read partial. Without an active SAF/REG lane the read does not matter.
3. **Closing text key** [convention]: Text bundle `closing.overallRejection`; the default neutral text never says "sent", "e-mailed" or "PDF". Switching back to Approved clears a stale `Completion_Trigger` "Overall rejection"; the closing text is left as it is.
4. **Config conventions**:
   - a new key is `<kind slug>-<Section_Key or name>-v<n>`, with n = 1 + the highest version of that base, and `Version_Label` defaults to `v<n>`;
   - a Section definition takes `Section_Key` from the payload and `Section_Rev` = 1 + the highest rev for that key, and its key cannot change later;
   - `Release_Bundle_JSON` = `[{configKey, kind, itemId, versionLabel, sectionKey?, sectionRev?, payloadJson}]`;
   - `Manifest_Hash` = sha256 of the stored `Release_Manifest_JSON` string;
   - a Release row's `Content_Hash` = its `Manifest_Hash`;
   - a release needs exactly one Template and at most one row per kind (Section definitions: one per section key); missing definitions and missing Settings are warnings;
   - a stored `Content_Hash` that differs from the payload blocks the release;
   - Retire asks for a required reason (`Event_Reason`).
   - Invalid JSON can't be saved as a draft, and Publish is disabled while the draft has unsaved edits (it hashes the stored payload).
5. **Publish order follows §8.13**: the state patch first, then the F8 row. A failed F8 row shows an amber notice with "Record it again" (a create-only retry).
6. **Contacts**:
   - "pending invite" [convention] = active, invite requested, no portal user id and not invited;
   - `Contact_Portal_Ids_Text` = the unique portal ids of active contacts, comma-separated with no spaces;
   - a duplicate e-mail on the same supplier is refused on the client: the natural key would otherwise turn the add into a modify of the other row;
   - portal user ids allow `[A-Za-z0-9_-]` only.
7. **Audit-log dates** filter on the UTC day of `Event_At`, as stored, with no time-zone shift.
8. **`LaneRepairPanel` uses `useWorkbenchContext().rt`** (provider internals) because T0's `repairBlocker(rt, …)` needs the runtime; the write itself is the §12.2 `repairLane`.
9. **The RMES summary** is T2's `RmesSummary`, rendered directly; it carries `wb-approval-rmes-<D>` itself, so T3 adds no wrapper with the same test id.

## Open issues

- **Change requests** appended to `CHANGE-REQUESTS.md`:
  - CR-T3-admin-1: `useFormRows` with a function filter shares the cache key `form:<flow>:fn`;
  - CR-T3-admin-2: `createFormRow` does not call `rt.changed()`, so T3 reloads its lists by hand;
  - CR-T3-admin-3: `WriteOutcome` should pass `onResolved` to `KwbFallback`.
- **Re-applying a publish** (`writeVerified` up to 3 times) would update a row that is already Published if the host drops a field, as under a harness `race` mode. That would trip the §11.2 "Published F2 row" check. This is unlikely outside race modes.
- **Business Admin and approver reads**: T0 tries rung 1 (admin list) for every user, so an approver without flow Admin sends one refused `PROCESS_GET_ADMIN_ITEMS` per process flow per session (seen in the smoke). This is expected (T0 deviation 6).
- **Every live behaviour is [unverified]** until the backend exists (§13.2): F2 and F1 writes through the SDK, `Table::Contacts` with client row ids, Dataform submit ids.
