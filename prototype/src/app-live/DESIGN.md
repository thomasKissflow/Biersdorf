# App-live: build design for the live internal UI of CIQ_Digital_A00 (20 Oct, night)

Kissflow-internal. Binding plan: `docs/kissflow-data-model/plan-v6-native.md` (v5 holds where v6 is silent). Pattern: `src/portal/data/LiveSupplierStore.tsx` (a live `StoreApi` through `StoreContext`, approved screens unchanged).

Tags: [code file:line] · [live file] (saved live drafts/results) · [doc file §] · [unverified] (needs a live test) · [decision] (made here; Thomas may overturn).

---

## 0. Ground truth this design rests on (verified tonight)

| # | Fact | Tag |
|---|---|---|
| G-1 | `StoreContext` is exported for exactly this; every screen reads `useStore()` | [code store/store.tsx:192] |
| G-2 | The prototype shell can't be reused: `TopActions` always renders `InboxButton` + `RoleSwitcher` | [code layout/Shells.tsx:55-66] |
| G-3 | `roleOf` gives admin/auditor/owner only to the fixed ids `u-admin`/`u-auditor`/`u-owner`; dept users by `u.dept` | [code domain/permissions.ts:67-73] |
| G-4 | `check(…, "system", …)` allows everything | [code domain/permissions.ts:95] |
| G-5 | Domain refusals = unchanged state + toast with `refusal: true`; `wasRefused(prev,next)` | [code domain/core.ts:18-27] |
| G-6 | `rmesCriteria` is NOT exported; `confirmCompleteness` is, and builds `rmes.criteria` | [code domain/actions.ts:584, 688-713] |
| G-7 | Key-route walk 20:53Z: review dept step update/submit → `050201 moved out of your queue`; OP dept step update → `050313` on Outcome_Reason/Thread_JSON/Closed_By/OP_Outcome/Closed_At although the draft makes them E/M there; OP submit with OP_Outcome blank → Completed (Mandatory not enforced); ReadOnly-at-Start fields stored on create | [live kissflow-build/ciq-digital/v6/walk-v6-result.json] |
| G-8 | Admin PUT writes ReadOnly fields (I-4 path) | [live ciq-digital/v6/probe-readonly-put-result.json] |
| G-9 | CIQ Case: Start `Activity_p1i6xz` M = BDF_Contact_Email, BDF_Contact_Name, BDF_Material_No, Case_Code, Case_Contacts_JSON, Confirm_Contact_Ids, Cycle_No, Main_INCI, Manifest_Hash, Owner_RMM, Portal_Contact_Ids, Release_Item_Id, Release_Key, Rule_Set_Version, Supplier_Code, Supplier_Contact_Emails, Supplier_Due_Date, Supplier_Legal_Name, Target_Markets_Text, Template_Version, Trade_Name; E = BDF_Set_JSON, Case_Test, Case_Title, Config_Bundle_Hash, Config_Bundle_JSON, Duplicate_Reason, Follow_Up_Of_Case, Follow_Up_Of_Report, IRMA_Ref, Markets_Label, Portal_Assignees_JSON, Priority, Release_Assignees_JSON, Release_Manifest_JSON, SAP_Material_No, Template_Label. Other steps all RO/Hidden. End = `Activity_ycf01a` | [live night-2026-10-20/backup-CIQ_Case_A00-2026-10-19T205803683Z.json] |
| G-10 | CIQ Review dept steps M = Completed_At, Completed_By, Review_Confirm, Review_Gate (+RMES_Decision at REG/SAF); E = Assignee_*, Completed_By_Email/Name, On_Behalf_Of, Reassign_Reason (+RMES_Decision_Reason REG/SAF; +Rejection_* RMM); since 20:52 also Open_Count, RMES_Gaps E | [live v6/live/CIQ_Review_A00…2046.draft.json] + [live v6/backend-review-result.json] |
| G-11 | CIQ Open Point Start M = Case_Code, Case_Item_Id, Cycle_No, OP_Dept, OP_Key, OP_Kind, Question_Text, Raised_By_Dept, Raised_By_User, Ref_Kind, Ref_Label, Responsible_User, Round_No, Supplier_Code, Supplier_Due_Date, Supplier_Justification (+Raiser_Assignee since 20:52). Dept steps M = OP_Outcome; E = Closed_At, Closed_By, Kind_Label, OP_Progress, Outcome_Reason, Query_Key, Question_Text, Responsible_Name, Responsible_User, Return_Reason, Round_No, Supplier_Due_Date, Supplier_Justification, Thread_JSON | [live v6/live/CIQ_Open_Point_A00…2046.draft.json] + [live v6/backend-op-result.json] |
| G-12 | Child models: `Safety_Criteria`, `Safety_Findings`, `Regulatory_Criteria`, `Regulatory_Findings`, `Contacts`; OP `Rounds` (Hidden, never use) | [live v6/live/*.draft.json] |
| G-13 | Audit Event has `Snapshot_JSON` (Textarea), `Notify_Channel`, `Notify_Recipient`, `Object_State`; + `Ref_Flow_Id/Ref_Item_Id/Ref_Activity_Instance_Id` | [live v6/live/CIQ_Audit_Event_A00…draft.json] + [live v6/backend-audit-result.json] |
| G-14 | The 15 supplier-data fields on CIQ Case (graft 20:58Z) share names/shapes with CIQP Request, so `readDoc`, `storedScope`, `storedSlots`, `caseContactsOf` parse them | [doc plan-v6 §4.2] + [code portal/data/answers.ts:40-50, scope.ts:45,112, map.ts:138] |
| G-15 | `SET:current` has no `webhooks` key → every hand-off is "pending" tonight | [doc kissflow-build/config-seed/readable/SET_current.json] |
| G-16 | SDK 1.0.49 has `getAdminItems/getAdminItem`, `rejectItem`, `sendbackItem`, `reassignItem`, `getProgress`, `withdrawItem`; Dataform `getItem({itemId})`, `discardItem()` (no id) | [code node_modules/@kissflow/lowcode-client-sdk/dist/kfsdk.es.js:812-1288] |
| G-17 | Every role except Business administrator has no members tonight | [brief] |

---

## 1. Scope tonight

### 1.1 In (priority order)

| P | Journey step | Who | Live behaviour |
|---|---|---|---|
| P1 | Boot, identity, role picker, shell, Diagnostics | all | §3.4, §7 |
| P1 | Read everything the role may read; per-case banner when a read is refused | all | §4 |
| P1 | RMM: New case → CIQ Case create + submit (I-1 takes it to the portal) | RMM | §6 `createCase` |
| P1 | RMM opens the app: missing reviews of cases now in review are created (Review_Key idempotent) | RMM | §6 `ensureReviews` |
| P1 | SAF/REG first open: own RMES row created (header only since 28 Oct) | SAF, REG | §6 `ensureRmes` |
| P1 | Raise / accept / return / not-accept / edit / close open points | RMM + 5 depts (raiser) | §6 |
| P1 | Safety / Regulatory decision (on the Questionnaire tab); the RMES tab is the read-only 8-field sheet (28 Oct: no criteria or findings) | SAF, REG | §6, "RMES (28 Oct)" |
| P1 | Complete own review; when every review is completed (read live), RMM's next load sends `release.requested` (audit + hand-off; RMM is the only sender, M2) | RMM + 5 depts | §6 |
| P1 | Internal notes | RMM, 5 depts, CUS, LEG | §6 |
| P1 | Read-only: Customs/Legal (K7/K8), Auditor (audit + rules), Business owner (reports), completed case read-only | — | screens unchanged |
| P1 | Business administrator: configuration screens from live rows; **since 26 Oct the editor is live** (drafts, rules, questionnaire, publish, section owners, reminders) | BA | §6 "Configuration (26 Oct)"; other roles read it (the domain's config.manage) |
| P2 | Supplier master **live edit** for supplier + contact header fields [decision] | BA | §6; reason: BA is the only role with members, so this is the one write path testable tonight, and Form writes are simpler than step writes |
| P2 | Cancel case (audit + `case.cancelled` hand-off + own points), reassign review, RMM reopens its own review, Scope Run row at activation, computed final document for completed cases | RMM / depts | §6 |

### 1.2 Out tonight (visible behaviour = warning toast "`<what>` is not available in this version yet." unless stated)

| Method / feature | Reason | Visible |
|---|---|---|
| `reactivateCase` | RMM can't update the case after Start; no v6 writer for `Reactivate_*` (G2 reader D) | toast |
| `extendScope` | needs another dept's review created; only RMM has Init on CIQ Review | toast; the window says so and stays open (FE-CLEANUP A4) |
| `reopenReview` for a department (not RMM) | same Init limit | toast "Ask RMM: only RMM can restart a review in this version.", on the "Reopen my review" click itself (FE-CLEANUP A8) |
| `updateCaseContacts` | no caller; no case write after Start | toast |
| Contact deactivation with open cases (cascade) | BA can't write CIQ Case; `case.contacts` cascade not built | live pre-guard toast "This contact is named on open cases. Replacing a contact on running cases is not available in this version yet."; the window says it up front (FE-CLEANUP A9) |
| ~~Config editor (createDraft … publishDraft, setOwnership, updateReminder, publishTemplateV2)~~ | **live since 26 Oct** (§6 "Configuration (26 Oct)"): `LIVE_FEATURES.configEdit` is true, the read-only banner is gone; the BA's form rights on CIQ Config Version and the Retired-without-Published_At discard are [unverified] live | — |
| Inbox, `markMailRead`, `markAllMailsRead`, `runReminders` | D-4: mails are webhook-only, nothing stored | no inbox in the shell; "Run reminders now" → toast (no demo badge, no "Nothing due" status: FE-CLEANUP A6) |
| ~~Mention mails~~ | **live since 27 Oct** (Thomas's prod test: "In Internal Note I am not able to mention anyone"): the colleagues of the CIQ roles are read once a session in the background (`app-live/colleagues.ts`: kf.api GET `/app_role/2/{acc}/{roleId}?_application_id=CIQ_Digital_A00` per role of `ids.ts ROLES`, its Members; GET `/user/2/{acc}?page_number=1&page_size=500` for missing e-mails or when no role read answers; Kind "ExternalUser" never listed) and merged into the users (`Directory.colleague`); a saved note mails each colleague it mentions, never the writer, one POST each through SET:current `mailHook` (`write/mail.ts sendMentionMails`: subject "<writer> mentioned you on <case code>", plain text with the case code and trade name, the section, the note and the app's home `https://<host>/view/application/CIQ_Digital_A00/ui`). Both reads as the signed-in user are [unverified] live | toast "Note added. <n> colleague(s) notified by e-mail." (+ "<name> has no e-mail address here and was not notified."; without a mail hook "Note added. E-mail is not set up here, so nobody was notified."); a mail that fails later: a warning toast naming the colleague + a Writes line `mail mention`. Both reads refused: the mention list says "Colleagues can't be listed for your role here." (the people the load names are still listed under it), Diagnostics' "Colleagues for @mentions" card says why |
| Review-assigned mails | not sent by the screens (Kissflow's own assignment notifications) | nothing shown |
| ~~Opening portal attachments~~ | **since 27 Oct** (Thomas's prod test): `DocName` opens Kissflow's file preview (`kf.client.openFilePreview`, SDK `FILEPREVIEW_OPEN { files, indexOfFile }`) with the case's openable files, from each Documents_JSON entry's `file` (the portal writes it since 27 Oct), for an older entry from its portal request's Supplier_Files (one `portalGet` per case); otherwise the name with "This file can be opened in the supplier portal." [code app-live/docOpener.ts, components/DocName.tsx]. Whether the app's frame may preview a file a portal user stored, and the cross-container read, are [unverified] live | a link-styled button "Open <name>", or the name with the quiet note; the reason in Diagnostics (Writes, `openFile`) |
| Supplier-side methods (`saveConfig`, `setAnswer`, `setComponents`, `setJustification`, `uploadDocument`, `confirmCompleteness`, `supplierRespond`, `finalRelease`, `reportChange`, `submitMetadata`) | internal app | toast |
| Sealed final document | no v6 writer (G4) | P2: computed with `buildFinalDocument` [code domain/finalDocument.ts:85]; otherwise the tab stays hidden (CaseDetail shows it only when `finalDocument` exists [code features/rmm/CaseDetail.tsx:58]) |
| Retired flows CIQ Case Data, Service Request, Mail Outbox; CIQ Case - Thomas | D-13, D-14 | never called (ids.ts doesn't list them) |

---

## 2. Files and owners

**Rules for all implementers:**
- Write only your own files. Everything shared is imported read-only and never edited: `src/store/*`, `src/domain/*`, `src/features/*`, `src/components/*`, `src/layout/*`, `src/portal/*`, `src/workbench/*`.
- `src/app-live/shared/*` belongs to the portal session. Import it; never edit it.
- The only shared-file edit allowed is adding scripts to `package.json` (owner E).
- `src/app-live/**` is type-checked by the root `tsc -b` and tested by `npm test`, as the portal's own build and tests are [code prototype/tsconfig.json; vite.config.ts test.include]. So every save point must keep `npm run typecheck` and `npm test` green: stub with `throw new Error("not yet")`, never leave code that fails to type-check.
- No network, no `kissflow-build/` script runs, and no deploy.

| Owner | File (under `prototype/src/app-live/` unless stated) | Content |
|---|---|---|
| **A** Kissflow layer | `types.ts` | the shared interfaces of §3, **verbatim, written first (within ~15 min)** |
| A | `ids.ts` | the ONLY file with Kissflow ids (§3.1) |
| A | `kf/sdk.ts` | `AppKf`, `AppKfProcess`, `AppKfDataform`: extensions of `@/portal/kf/sdk` types (reject/sendback/reassign/getProgress/withdraw; Dataform getItem) |
| A | `kf/client.ts` | `createAppClient(kf, opts): AppClient` (copies the portal's `bounded`/`call`/`pages`/`itemOrThrow`/`withCause` patterns [code portal/data/client.ts:68-125]; `pool` copied [code LiveSupplierStore.tsx:45-57]) |
| A | `kf/fakeClient.ts` | `createFakeClient(seed, opts): FakeClient` (an in-memory AppClient for vitest: step routing, field-permission refusals, Mandatory flag, admin refusal, form draft→new id on submit, `Table::` child rows, `_modified_at` bumps, call log) |
| A | `kf/client.test.ts` | paging, 429 retry, envelope shapes, timeout, admin fallback, webhook transport order |
| **B** Read mapping (pure) | `map/config.ts` | `configFromRows` port with reader E fixes (a)–(f), `releaseForPair`, `settingsOf`, `verifyConfig` (warnings) |
| B | `map/people.ts` | `Directory` (users from items, aliases, contacts) |
| B | `map/caseMap.ts` | case header, phase, phaseHistory, confirmations, answers/docs/scope from the 15 fields |
| B | `map/trackMap.ts` | reviews, open points (thread incl. synthesized supplier answer), RMES, notes |
| B | `map/auditMap.ts` | audit rows → `AuditEvent[]`, `LogEvent[]`, latest snapshot per object |
| B | `map/suppliersMap.ts` | CIQ Supplier rows → `Supplier[]` + contact `User[]` |
| B | `map/toAppState.ts` | `toAppState(input): Mapped` (§3.3) |
| B | `testing/rawFixtures.ts` | raw item builders (case/review/op/audit/note/rmes/supplier/config rows) from `@/portal/data/fixtures` `fixtureSet()` cases + `kissflow-build/config-seed/rows/*.json` read at test time with `node:fs`; test-only, never imported by the bundle. **Deliver within the first hour** (C, D and E use it) |
| B | `map/*.test.ts`, `roundtrip.test.ts` | §7.1; `roundtrip.test.ts` comes last, after C's `write/encode.ts` |
| **C** Writes | `write/encode.ts` | domain → Kissflow field values (Select texts, dates, users) |
| C | `write/verify.ts` | `writeVerified`, `assertMandatory`, `staleCheck` |
| C | `write/audit.ts` | `auditRowData`, `writeAudit` |
| C | `write/handoff.ts` | `webhooksOf`, `handoff(ctx, code, payload)` |
| C | `write/guards.ts` | `liveGuard(method, ctx, state, args)` (live-only pre-checks) |
| C | `write/activation.ts` | `planRmesCriteria`, `ensureReviews`, `ensureRmes` |
| C | `write/actions.ts` | `liveWriters: LiveWriters` (one writer per supported method) |
| C | `write/*.test.ts` | §7.1 |
| **D** Store, identity, load | `identity.ts` | `identityOf`, `actingAs`, `kfUserIdOf`, `PERSONA_ORDER` |
| D | `load.ts` | `loadSnapshot(client, identity, acting): Promise<LiveSnapshot>` (the read ladder, §4) |
| D | `api.ts` | `createLiveApi(deps): StoreApi` (pure factory, testable without React) |
| D | `LiveAppStore.tsx` | the provider: load, optimistic state, serial chain, toasts, side effects, contexts |
| D | `extras.tsx` | `LiveAppExtras` context + `useAppExtras()` |
| D | `identity.test.ts`, `load.test.ts`, `api.test.ts` | §7.1 |
| **E** App, shell, build, harness | `main.tsx`, `AppLiveApp.tsx`, `AppLiveShell.tsx`, `routes.tsx`, `Diagnostics.tsx`, `PageBoundary.tsx` (copy of `portal/PageBoundary.tsx` with internal wording), `build.ts` (`declare const __APPLIVE_BUILD__`) | §3.6, §7 |
| E | `prototype/app-live.html` | copy of `portal.html`: title "CIQ Digital · Beiersdorf", loader label "Loading CIQ Digital…", script `/src/app-live/main.tsx` |
| E | `prototype/vite.applive.config.ts` | copy of `vite.portal.config.ts`: input `app-live.html`, outDir `dist-applive`, define `__APPLIVE_BUILD__`, build-stamp plugin writing `dist-applive/build-stamp.txt` (as `vite.workbench.config.ts:19-20`) |
| E | `prototype/scripts/zip-applive.mjs` | copy of `zip-workbench.mjs` with paths `dist-applive/app-live.html`, zip `ciq-app-ui-<sha10>.zip`, all guards; imports `./workbench-deny.mjs` read-only |
| E | `prototype/scripts/applive-fixtures.ts` | vite-node: prints the harness fixtures JSON from B's `testing/rawFixtures.ts` |
| E | `prototype/scripts/harness-applive.mjs` | §7.2 |
| E | `kissflow-build/ciq-digital/deploy-app-live-ui.mjs` | §7.4; written, never run |
| E | `prototype/package.json` | add scripts only (§7.3) |

Read-only reuse (import): `@/portal/kf/sdk` (`connectKf`, `inFrame`, `rowsOf`, `totalOf`, `kfDateTime`, `errorText`, types); `@/portal/data/raw`; `@/portal/data/answers` (`readDoc`, `COMPONENTS_KEY`); `@/portal/data/scope` (`storedScope`, `storedSlots`, `liveScope`, `partOfPhase`); `@/portal/data/map` (`caseContactsOf`, `parseMarkets`); `@/portal/data/bundle` (`canonicalJson`, `sha256Hex`); `@/portal/BrandLoader`; `@/portal/theme`; `@/portal/fonts.css`, `@/portal/portal.css`; `@/layout/Gates` (`AdminGate`, `NoAccess`, `routeAllowed`); `@/layout/Shells` (`Logo` only); `./shared/*`. Do not import `src/workbench/*` (copy patterns instead [doc reader C §3, WB/README.md:32-39]).

---

## 3. Interfaces

### 3.1 `ids.ts` (A)

```ts
export const APP_ID = "CIQ_Digital_A00";
export const FLOWS = {
  case: { id: "CIQ_Case_A00", kind: "process" }, review: { id: "CIQ_Review_A00", kind: "process" },
  op: { id: "CIQ_Open_Point_A00", kind: "process" }, audit: { id: "CIQ_Audit_Event_A00", kind: "form" },
  note: { id: "CIQ_Internal_Note_A00", kind: "form" }, rmesSAF: { id: "CIQ_RMES_Safety_A00", kind: "form" },
  rmesREG: { id: "CIQ_RMES_Regulatory_A00", kind: "form" }, supplier: { id: "CIQ_Supplier_A00", kind: "form" },
  config: { id: "CIQ_Config_Version_A00", kind: "form" }, scopeRun: { id: "CIQ_Scope_Run_A00", kind: "form" },
} as const;
export const STEPS = {
  case: { start: "Activity_p1i6xz", waiting: "Activity_1kltjdn", release: "Activity_gwgj5o", end: "Activity_ycf01a" },
  review: { start: "Activity_47r3ow", REG: "Activity_1wb6scg", SAF: "Activity_116f3su", QM: "Activity_12d3ab4",
            MIC: "Activity_1wkxybl", SUS: "Activity_1um3oo7", RMM: "Activity_1mh3ji6", end: "Activity_1xjk2tg" },
  op: { start: "Activity_18t0lhi", REG: "Activity_uka3mx", SAF: "Activity_1kdump3", QM: "Activity_1go37bt",
        MIC: "Activity_hha7u2", SUS: "Activity_y4af4g", RMM: "Activity_xc8fbb", end: "Activity_i73i25" },
} as const;
export const STEP_NAMES: Record<string, string>;   // activity id → live name ("Review – QM", "Open point – QM", "Create case", …)
export const ROLES = {
  rmm: { id: "RoEKl83f9jPF", name: "Raw Material Manager (RMM)", dept: "RMM" },
  reg: { id: "RoEKl84Hca4w", name: "Regulatory Affairs reviewer", dept: "REG" },
  saf: { id: "RoEKl84xAFRW", name: "Product Safety reviewer", dept: "SAF" },
  qm:  { id: "RoEKl85WB1yE", name: "Quality Management reviewer", dept: "QM" },
  mic: { id: "RoEKl8647K2u", name: "Microbiology reviewer", dept: "MIC" },
  sus: { id: "RoEKl86bQQrO", name: "Sustainability reviewer", dept: "SUS" },
  cus: { id: "RoEKwv6pxX3g", name: "Customs & Trade Compliance", dept: "CUS" },
  leg: { id: "RoEKwvH8qaxG", name: "Legal / IP", dept: "LEG" },
  admin: { id: "RoEKl87f38Xw", name: "Business administrator" },
  auditor: { id: "RoEKl88CJiLP", name: "Auditor" },
  owner: { id: "RoEKwvR_cPvv", name: "Business owner (reports)" },
} as const;                                        // key = InternalPersonaId
export const OTHER_ROLES = { caseAdmin: { id: "RoEKl88jv4dv", name: "Case administrator" }, integration: { id: "RoEKl89I5nGx", name: "Integration service" },
  developer: { id: "RoEK3_3Jy9XU", name: "Admin / Developer" } } as const;   // 26 Oct: the data console (§3.4); dev's id, matched by name when prod's differs
export const TABLES = { SAF: { criteria: "Safety_Criteria", findings: "Safety_Findings" }, REG: { criteria: "Regulatory_Criteria", findings: "Regulatory_Findings" }, contacts: "Contacts" } as const;
export const MANDATORY: Record<string, readonly string[]>;  // activity id → fields of G-9/G-10/G-11 (Review_Gate included); the UI's own gate
export const LIST = {   // option texts exactly as live [live ciq-digital/v5/verify-1015/live/list-items, via reader D §2]
  phase: { "supplier-input": "Supplier filling in the CIQ", review: "Review", "final-release": "Awaiting final release", completed: "Completed", cancelled: "Cancelled" },
  track: { "in-review": "In review", "waiting-supplier": "Waiting for supplier", reopened: "Reopened", completed: "Completed" },
  opKind: { query: "Query", "document-request": "Document request", "additional-part": "Additional part", finding: "Finding" },
  kindLabel: { query: "Question", "document-request": "Document request", "additional-part": "Additional section", finding: "Question" },
  opProgress: { open: "Open", "in-progress": "In progress" },
  opOutcome: { accepted: "Accepted", withdrawn: "Withdrawn", "not-accepted": "Not accepted" },
  rmesResult: { available: "Available", plausible: "Plausible", listed: "Listed", "not-listed": "Not listed", negative: "Negative", implausible: "Implausible", na: "Not applicable" },
  decision: { approved: "Approved", rejected: "Rejected" }, confirm: "Confirmed", continueRelease: "Continue to final release",
  priority: { normal: "Normal", high: "High" }, yes: "Yes", no: "No",
  supplierKind: { manufacturer: "Manufacturer", distributor: "Distributor" },   // live also has "Trader" → read as "distributor" + warning
  actorSide: "BDF",
} as const;
```
Review_Dept values = REG·SAF·QM·MIC·SUS·RMM; Note_Dept/Actor_Dept = RMM·REG·SAF·QM·MIC·SUS·CUS·LEG [live lists via reader D §2]. "Not available" (RMES) has no domain value → read as `undefined` + warning.

### 3.2 `types.ts` (A, verbatim)

```ts
import type { KfData } from "@/portal/kf/sdk";
import type { RawItem } from "@/portal/data/raw";
import type { AppState, Dept, InternalPersonaId, Persona, ReviewDept, User, AuditEvent, LogEvent } from "@/domain/types";
import type { HandoffCode } from "./shared/handoff";

export type ProcessKey = "case" | "review" | "op";
export type FormKey = "audit" | "note" | "rmesSAF" | "rmesREG" | "supplier" | "config" | "scopeRun";
export type FlowKey = ProcessKey | FormKey;
export type PortalFlowKey = "request" | "query";   // 26 Oct: the CIQP processes the console's Orphans page reaches (ids.ts PORTAL)

// ---- client (every SDK call the adapter makes)
export interface AppClient {
  accountId: string;
  /** kf.app._id; writes are refused unless it is APP_ID. */
  appId: string | undefined;
  /** The host of the Kissflow page around the frame (env.ts hookHostOf), which the hand-off URLs are built on; absent
   *  when none is acceptable (the URLs are relative paths, sent by kf.api). */
  hookHost?: string;
  /** getProcess(id).getAdminItems({pageNumber,pageSize:50}) paged (flow Admin only). */
  adminList(flow: ProcessKey): Promise<RawItem[]>;
  /** getAdminItem({instanceId}); fallback kf.api GET /process/2/{acc}/admin/{flow}/{id}?_application_id=APP_ID. */
  adminGet(flow: ProcessKey, id: string): Promise<RawItem>;
  /** getMyTasksItems({activityId,pageNumber,pageSize:50}) paged; rows keep _activity_instance_id. */
  myTasks(flow: ProcessKey, activityId: string): Promise<RawItem[]>;
  /** getMyItems({status:"all",pageNumber,pageSize:50}) paged. */
  myItems(flow: ProcessKey): Promise<RawItem[]>;
  /** getItem({instanceId, activityInstanceId}) → itemOrThrow. */
  getTask(flow: ProcessKey, id: string, act: string): Promise<RawItem>;
  /** Viewer probe [unverified]: kf.api GET /process/2/{acc}/{flow}/{id}?_application_id=APP_ID → itemOrThrow. */
  getById(flow: ProcessKey, id: string): Promise<RawItem>;
  /** createItem({data}) → {id: _id, act: _activity_instance_id} (Start step, held by the creator). */
  create(flow: ProcessKey, data: KfData): Promise<{ id: string; act: string }>;
  /** updateItem({instanceId, activityInstanceId, data}). */
  update(flow: ProcessKey, id: string, act: string, data: KfData): Promise<void>;
  /** submitItem({instanceId, activityInstanceId}) (the SDK adds comment ""). */
  submit(flow: ProcessKey, id: string, act: string): Promise<void>;
  /** discardItem({instanceId}) (an unsent Start draft). */
  discard(flow: ProcessKey, id: string): Promise<void>;
  /** getDataform(id).getItems({pageNumber,pageSize:50}) paged. */
  formList(flow: FormKey): Promise<RawItem[]>;
  /** getDataform(id).getItem({itemId}). */
  formGet(flow: FormKey, id: string): Promise<RawItem>;
  /** createItem({data}) then submitItem({itemId: draft._id}) → the NEW _id. Callers serialise (one draft per user per form). */
  formCreate(flow: FormKey, data: KfData): Promise<string>;
  /** updateItem({itemId, data}) (child rows via "Table::<model>" deltas). */
  formUpdate(flow: FormKey, id: string, data: KfData): Promise<void>;
  // 26 Oct, the data console's writes (optional: the live suite's REST client keeps its type; both app clients have them)
  /** getDataform(id).deleteItem({itemId}); fallback kf.api DELETE /form/2/{acc}/{form}/{id}?_application_id=APP_ID [unverified live]. */
  formDelete?(flow: FormKey, id: string): Promise<void>;
  /** getProcess(id).updateAdminItem({instanceId, data}) [unverified live]; fallback kf.api PUT …/admin/{flow}/{id} (JSON text body). */
  adminUpdate?(flow: ProcessKey, id: string, data: KfData): Promise<void>;
  /** kf.api DELETE /process/2/{acc}/admin/{flow}/{id}?_application_id=APP_ID [unverified live by kf.api]. */
  adminDelete?(flow: ProcessKey, id: string): Promise<void>;
  // 26 Oct, the console's Orphans page: a deleted case's CIQP items in the supplier portal, by kf.api REST with
  // _application_id=CIQ_Supplier_Portal_A00 [unverified from the app's frame; the routes work with an API key]
  /** GET /process/2/{acc}/admin/{CIQP flow}/item?page_number=n&page_size=200[&q=text]&_application_id=CIQ_Supplier_Portal_A00, paged. */
  portalList?(flow: PortalFlowKey, q?: string): Promise<RawItem[]>;
  /** GET /process/2/{acc}/admin/{CIQP flow}/{id}?_application_id=CIQ_Supplier_Portal_A00. */
  portalGet?(flow: PortalFlowKey, id: string): Promise<RawItem>;
  /** DELETE on that path (refused outside CIQ_Digital_A00 before any call). */
  portalDelete?(flow: PortalFlowKey, id: string): Promise<void>;
  /** 26 Oct: kf.api GET /flow/2/{acc}/list/{listId}/items?_application_id=APP_ID (the supplier form's countries; live with
   *  an API key, [unverified] as the user). */
  listItems?(listId: string): Promise<unknown>;
  /** 27 Oct, the @mention colleagues (app-live/colleagues.ts): kf.api GET /app_role/2/{acc}/{roleId}?_application_id=APP_ID,
   *  the role with its Members (or Users) [{_id, Name, Kind, …}] (live with an API key, [unverified] as the user). */
  roleMembers?(roleId: string): Promise<unknown>;
  /** kf.api GET /user/2/{acc}?page_number=1&page_size=500: the account's users [{_id, Email, Name, Kind}] ([unverified] as the user). */
  accountUsers?(): Promise<unknown>;
  /** An https url: fetch(url,{method:"POST",mode:"no-cors",headers:{"Content-Type":"text/plain"},body:JSON.stringify(p)})
   *  (an opaque answer is "fetch"); only when fetch throws, kf.api(its path,{method:"POST",headers:{"Content-Type":
   *  "application/json"},body}) ("sdk"). Never both after a fetch that did not throw. A relative url
   *  ("/integration/2/…"): kf.api only ("sdk"). */
  postWebhook(url: string, payload: unknown): Promise<"sdk" | "fetch">;
}

// ---- reads
export type Rung = "admin" | "tasks" | "mine" | "byId" | "form" | "snapshot" | "skipped";
export interface ReadReport { flow: FlowKey; rung: Rung; ok: boolean; count: number; ms: number; error?: string;
  keys?: string[] }                   // "mine" rung: the field names its rows carried (R-1)
export interface TaskRef { flow: ProcessKey; itemId: string; act: string; activityId: string }
export interface LiveSnapshot {
  loadedAt: string;
  /** Deduped by _id; full where a rung allowed it; `_activity_instance_id` kept on held tasks. */
  items: Record<ProcessKey, RawItem[]>;
  forms: Record<Exclude<FormKey, "scopeRun">, RawItem[]>;
  tasks: TaskRef[];
  /** Item ids of the case items this role could NOT read in full (banner). */
  unreadableCases: Record<string /* case item id */, string /* why */>;
  sparse?: string[];                  // review / open-point ids kept as list rows (the mapper fills them from the history)
  reads: ReadReport[];
  warnings: string[];
  // APP-SAVING-GAPS (20/21 Oct), load.ts keepUnread: what this load could not read again
  kept?: Partial<Record<FlowKey, string>>;                              // flow → loadedAt of the read it shows
  unreadRows?: Partial<Record<Exclude<FormKey, "scopeRun">, string[]>>; // form rows whose full read failed now
  keptRows?: Record<string, string>;                                     // row _id → loadedAt of its child tables
}

// ---- identity
export interface LiveRoleRef { id: string; name: string }
export interface Identity {
  kfUserId: string; name: string; email: string;
  roles: LiveRoleRef[];               // kf.user.AppRoles as sent
  personas: InternalPersonaId[];      // held CIQ personas in PERSONA_ORDER (matched by role id first, then name)
  caseAdmin: boolean; integration: boolean; unknownRoles: string[];
}
export interface Acting {
  personaId: InternalPersonaId;
  persona: Persona;                   // catalog persona with userId = me.id
  me: User;                           // id = kfUserId, or "u-admin"/"u-auditor"/"u-owner" for those personas
  roleId: string; dept?: Dept;
}

// ---- mapping
/** `itemId`: the CIQ Case item (from the item, or from the audit rows' Case_Item_Id when the role can't read it), the id
 *  every case hand-off sends. `portalRequestItemId` as read (informational: the integrations read it from the case). */
export interface CaseRef { caseId: string; itemId: string; cycleNo: number; supplierCode: string; portalRequestItemId?: string;
  releaseItemId?: string; readable: boolean; contacts: { id: string; name: string; email: string }[] }
export interface ReviewRef { caseId: string; dept: ReviewDept; itemId?: string; roundNo: number; reviewKey: string;
  act?: string; activityId?: string; modifiedAt?: string; live: boolean }
export interface OpRef { caseId: string; opId: string; itemId?: string; act?: string; activityId?: string; roundNo: number;
  portalQueryItemId?: string; modifiedAt?: string; live: boolean }
export interface RmesRef { caseId: string; dept: "SAF" | "REG"; itemId: string; criteriaRows: Record<string, string>; findingRows: Record<string, string> }
export interface SupplierRef { supplierId: string; itemId: string; contactRows: Record<string /* user id */, string /* row _id */> }
export interface ReleaseRow { itemId: string; key: string; ruleSetVersion: string; templateVersion: string; state: "Draft" | "Published" | "Retired"; raw: RawItem }
export interface LiveIndex {
  cases: Map<string, CaseRef>;                 // case code →
  reviews: Map<string, ReviewRef>;             // `${caseId}|${dept}` → latest round
  ops: Map<string, OpRef>;                     // OP_Key →
  rmes: Map<string, RmesRef>;                  // `${caseId}|${dept}` →
  suppliers: Map<string, SupplierRef>;
  releases: ReleaseRow[];
  settings: Record<string, unknown>;           // SET:current Payload_JSON
  caseBanners: Map<string, string>;            // case code → why the answers are missing
}
export interface MapInput { snap: LiveSnapshot; identity: Identity; acting: Acting; env?: AppEnv;   // env: prod words an unknown history code plainly
  colleagues?: readonly Colleague[] }   // 27 Oct: the colleague directory of the session, merged into the users
export interface Mapped { state: AppState; index: LiveIndex; warnings: string[];   // warnings: what could not be read
  notes: string[]; dropped: string[] }  // notes: how odd rows were mapped (dev only); dropped: cases left out (FE-CLEANUP C1)

// ---- writes
export interface HandoffStatus { code: HandoffCode; status: "sent" | "pending" | "failed"; detail?: string;
  key?: string }                      // the idempotencyKey; "sent" = handed over (fire-and-forget, gap 5)
export interface WriteCtx { client: AppClient; identity: Identity; acting: Acting; index: LiveIndex;
  webhooks: Partial<Record<HandoffCode, string>>; now(): string; containerOk: boolean;
  env?: AppEnv;                                                            // prod: plain causes in the toasts (userText.ts)
  onHandoffProblem?(code: HandoffCode, key: string, why: string): void }   // a POST that failed after the save
export interface WriteResult { ok: boolean; message?: string; tone?: "success" | "info" | "warning" | "danger";
  handoffs: HandoffStatus[]; warnings: string[];
  detail?: string;                              // the raw causes prod's message put in plain words (the Writes log)
  saved?: { flow: FlowKey; item: RawItem }[];   // the read-backs of the job's writes (gap 1: shown instead of a reload)
  auditRow?: RawItem;                           // its audit row as read back
  moved?: boolean }                             // a step moved or an item-writing hand-off went: the store reads again
/** `next` is the pure domain action's result on `prev` (already accepted); the writer encodes it. */
export type Writer = (ctx: WriteCtx, prev: AppState, next: AppState, args: unknown[]) => Promise<WriteResult>;
export type WritableMethod = "createCase" | "raiseOpenPoint" | "reviewResponse" | "editOpenPoint" | "closeOpenPoint" |
  "recordCriterion" | "addFinding" | "closeFinding" | "findingToQuery" | "rmesDecision" | "completeReview" | "addInternalNote" |
  "reassignReview" | "reopenReview" | "cancelCase" | "addSupplier" | "updateSupplier" | "addContact" | "updateContact" | "setContactActive" |
  ConfigMethod;   // 26 Oct: createDraft, discardDraft, upsertRule, deleteRule, upsertSection, retireSection, restoreSection, upsertField, moveField, removeField, publishDraft, publishTemplateV2, setOwnership, updateReminder
export type LiveWriters = Partial<Record<WritableMethod, Writer>>;   // a missing writer = "not available" toast

// ---- audit
export type AuditCode = "case.created" | "case.cancelled" | "case.reactivated" | "op.raised" | "op.round" | "op.edited" |
  "op.accepted" | "op.returned" | "op.notaccepted" | "op.closed" | "review.started" | "review.completed" | "review.reopened" |
  "review.reassigned" | "release.requested" | "rmes.saved" | "note.added" | "supplier.changed" | "config.published" |
  "config.draft.created" | "config.draft.discarded" | "config.ownership.changed" | "config.reminders.changed";   // 26 Oct
export interface AuditInput {
  code: AuditCode; caseId?: string;
  object: { kind: string; key: string; itemId?: string; state?: string };
  ref?: { flow: FlowKey; itemId: string; act?: string };
  reason?: string;
  entries: AuditEvent[];               // the domain's NEW audit entries of this action (phrases kept)
  log?: LogEvent[];                    // the domain's NEW log entries (supplier/config)
  snapshot?: Record<string, unknown>;  // object state after the action (see §5.3)
  handoffs: HandoffStatus[];
}
```

### 3.3 Function signatures

| Owner | Signature |
|---|---|
| A | `createAppClient(kf: Kf, opts?: { sleep?; retries?: number; retry?: RetryPolicy; random?; onRateLimit?(waitMs); formQueue?: FormQueue; maxInFlight?: number; callTimeoutMs?: number; fetchImpl?: typeof fetch; page? }): AppClient` (26 Oct: `consoleClientOptions()` = 2 in flight + `CONSOLE_RETRY`, the data console's client) |
| A | `createFakeClient(seed: { items: Partial<Record<FlowKey, RawItem[]>>; tasks?: TaskRef[]; me: { _id: string; Name: string } }, opts?: { admin?: boolean; refuse?: Partial<Record<keyof AppClient, string>>; enforceMandatory?: boolean; readOnly?: Record<string /* activity id */, string[]> }): AppClient & { calls: { m: keyof AppClient; flow?: FlowKey; id?: string; act?: string; data?: unknown }[]; db: Record<FlowKey, RawItem[]>; set(id: string, patch: KfData): void; move(id: string, activityId: string): void }` |
| B | `toAppState(x: MapInput): Mapped` (no I/O; `state.toasts = []`, `mails = []`, `personaId = acting.personaId`) |
| B | `configFromRows(rows: RawItem[]): { cfg: ConfigState; ownership; reminders; settings; releases: ReleaseRow[]; warnings: string[] }` |
| B | `releaseForPair(releases: ReleaseRow[], pair: { ruleSetVersion: string; templateVersion: string }): ReleaseRow \| undefined` (Published only) |
| B | `verifyConfig(rows: RawItem[]): Promise<string[]>` (WebCrypto `sha256Hex(canonicalJson(...))`; warnings only) |
| C | `encode.*`: `kfDate(iso)`, `kfDateTimeOf(iso)`, `userRef(domainUserId, identity)`, `opStartFields(c, op, ref, ctx)`, `threadJson(op)`, `reviewStartFields(c, dept, round, kind, reason, ctx)`, `criterionRow(cr)`, `findingRow(f)`, `noteFields(c, note, ctx)`, `caseStartFields(c, input, release, start, ctx)`, `supplierFields(s)`, `contactRow(u)` |
| C | `writeVerified(read: () => Promise<RawItem>, write: (cur: RawItem) => Promise<void>, holds: (back: RawItem) => string[] /* missing keys */, tries = 3): Promise<RawItem>` |
| C | `assertMandatory(item: RawItem, activityId: string): string[]` (blank M fields; `Review_Gate` must equal "OK") |
| C | `staleCheck(ctx, flow: ProcessKey, ref: { itemId: string; act: string; modifiedAt?: string }): Promise<RawItem>` (throws `StaleError` when `_modified_at` moved) |
| C | `auditRowData(ctx, x: AuditInput): KfData`; `writeAudit(ctx, x): Promise<string>` |
| C | `webhooksOf(settings: Record<string, unknown>, at?: HookBase): Partial<Record<HandoffCode, string>>` (21 Oct: each stored URL gives its token, the last segment of exactly `/integration/2/<account>/webhook/<token>` (`hookToken`, as the portal's; no query, fragment or user info); with `at` = `{accountId, host?}` the URL is `https://<host>/integration/2/<accountId>/webhook/<token>`, or that path without a host; a URL without a token is dropped); `handoff<K extends HandoffCode>(ctx, code: K, payload: HandoffPayloads[K] \| null): Promise<HandoffStatus>` (null payload or no URL → `pending`; POST error → `failed`) |
| C | `liveGuard(method: WritableMethod, ctx: WriteCtx, state: AppState, args: unknown[]): string \| null` |
| C | `planRmesCriteria(state: AppState, caseId: string, at: string): { criteria: RmesCriterion[] } \| { error: string }` |
| C | `ensureReviews(ctx, state): Promise<WriteResult \| null>`; `ensureRmes(ctx, state): Promise<WriteResult \| null>` (null = nothing to do) |
| C | `liveWriters: LiveWriters` |
| D | `identityOf(kf: Kf): Identity`; `actingAs(id: Identity, personaId: InternalPersonaId): Acting`; `kfUserIdOf(domainUserId: string, id: Identity): string`; `PERSONA_ORDER: InternalPersonaId[] = ["rmm","reg","saf","qm","mic","sus","cus","leg","admin","auditor","owner"]` |
| D | `loadSnapshot(client: AppClient, identity: Identity, acting: Acting): Promise<LiveSnapshot>` |
| D | `createLiveApi(deps: ApiDeps): StoreApi` where `ApiDeps = { state(): AppState; acting: Acting; ctx(): WriteCtx; writers: LiveWriters; toast(tone, text): void; dismiss(id): void; optimistic(next: AppState): void; enqueue(label: string, job: () => Promise<WriteResult>): void; reload(): void; setPersona(id: InternalPersonaId): void }` |
| D | `LiveAppStore(props: { client: AppClient; identity: Identity; personaId: InternalPersonaId; onPersona(id: InternalPersonaId): void; children: ReactNode }): JSX.Element` |
| D | `useAppExtras(): LiveAppExtras \| null` with `LiveAppExtras = { loadedAt; busy: boolean; loadError: string \| null; warnings: string[]; reads: ReadReport[]; reload(): Promise<boolean>; identity: Identity; acting: Acting; setPersona(id): void; caseBanner(caseId: string): string \| undefined; drafts: { flow: ProcessKey; itemId: string; act: string; label: string }[]; sendDraft(itemId): Promise<void>; discardDraft(itemId): Promise<void>; writeLog: { at: string; method: string; ok: boolean; message?: string; handoffs: HandoffStatus[] }[]; webhooks: Partial<Record<HandoffCode, string>>; containerOk: boolean; build: string }` |

### 3.4 Identity rules (D)

- `identityOf`: `kf.user._id/Name/Email`; for each `AppRoles[i]`, match `ROLES[*].id` first, then `.name` [code portal/kf/portal.ts:69-75]. Member names in Kissflow still show pre-rename names, so ids win [brief].
- `actingAs`:
  - `me = { id, name: kf Name, email, side: "internal", title: persona.label, dept, initials }`.
  - `id` = kfUserId for rmm, reg, saf, qm, mic, sus, cus and leg; `"u-admin"`, `"u-auditor"` or `"u-owner"` for admin, auditor and owner. Reason: `roleOf` rights depend on these ids (G-3); without the alias the BA gets no `supplier.view`/`config.manage` and wrongly gets `note.add`.
  - `persona = {...INTERNAL_PERSONAS.find(id), userId: me.id}`.
- `kfUserIdOf` maps the aliases back to `kfUserId` before any write (User fields, Thread_JSON `by`, Snapshot `by`).
- **Self contact** (21 Oct, dev): when the signed-in user is also a supplier contact (`Contacts_Portal_User_Id` = `kfUserId`), the directory registers that contact as `"self:<kfUserId>"` (side supplier) in every persona, and every supplier-side stamp of `kfUserId` (case contacts, thread messages, completeness/release) maps to it; the Beiersdorf user keeps `me.id` and shows no e-mail in the mapped state (kept as proven on 21 Oct; since 26 Oct `validateContact` no longer refuses an e-mail a Beiersdorf user holds, see "E-mails" in §6). Writes send `kfUserId` again (`write/encode.ts kfIdOfContact`: Portal/Confirm contact ids, `portalUserId`, Thread_JSON and Snapshot `by`) and take the user's e-mail from the identity [code map/people.ts, map/toAppState.ts].
- Default persona: the first of `PERSONA_ORDER` the user holds; a choice is remembered in guarded `localStorage["ciq-applive:persona:" + kfUserId]`.
- **Role picker:** shown in the person chip when the user holds more than one persona (production, not demo). Switching calls `onPersona` and the store reloads, because reads differ by persona.
- **Admin / Developer** (26 Oct; `OTHER_ROLES.developer`, matched by id, else by its name: prod's id may differ): no CIQ persona (`PERSONA_ORDER`, the read plan and the permissions are unchanged); `Identity.developer`. It opens the data console under `/data` (`console/`: every flow's items with all fields, form rows add / edit / delete, process admin edit / delete, file import into a form; a delete takes that item alone, a CIQ Case too, and the Orphans page cleans up what a deleted case leaves: §6 "Data console: plain delete, fewer calls, orphans"). Beside a persona: a "Data console" entry in the left pane, "Back to CIQ Digital" in the console's; without one: the console is the landing page instead of `NoRolePage`.
- **No CIQ persona** (incl. Case administrator or Integration service only): `NoRolePage` reads "Your Kissflow account has no CIQ role in this app (roles: …). Case administrator and Integration service work in Kissflow directly." No item reads.
- Roles without members: the screens already cope [doc reader A §3]. `raiseOpenPoint` defaults the responsible person to `me`, reassign lists are empty (the domain refuses with a reason), and names fall back to the denormalised `*_Name` fields (§5.2).

---

## 4. Read strategy

> **Update 20 Oct (first-load speed-up):** the reads below run side by side wherever one doesn't need another's answer.
> - Process reads start as soon as one index form has answered.
> - Review, open point and case are read at the same time, with the other forms alongside. Only case's byId rung waits for the ids the others name.
> - Within a flow, all lists go out together.
> - At most 6 calls are in flight (`kf/client.ts` `MAX_IN_FLIGHT`); a read batch is 6 (`LANES`).
>
> What is read, the rung order per flow, the ReadReports and the fallbacks are unchanged. In Diagnostics, "Time since sent" counts from when a step's list went out.

(D `load.ts`; one `ReadReport` per flow and rung)

**Index first, for every role:** `formList("audit")` (all pages) and `formList("config")`. Every internal role is Member or Viewer on both [brief grants]. The audit form is the universal case index and history: every case has a `case.created` row with the header snapshot (§5.3), and every screen action leaves a row with the object snapshot. This is the "screen-maintained index" option of plan v6 §5, chosen because the Viewer route to process items is unknown (master.md: process `/list` and `/view/allitems` 404; `getAdminItems` needs admin [doc ~/Downloads/master.md §3.6, §6.5]).

**Process items, by rung (first success wins per flow; all rungs recorded):**

| Rung | Call | Who it can serve |
|---|---|---|
| admin | `adminList(flow)`, then `adminGet` per open row with `pool(4)` (admin rows are sparse and carry no step [doc reader C §1a]) | Case administrator (flow Admin). For View holders [unverified]: try once per load; a refusal is remembered for the session |
| tasks | `myTasks(flow, activityId)` per held step, then `getTask` per row | Case: — · Review: RMM → `review.RMM`, dept → `review.<dept>` · OP: every persona that raises → all six `op.<dept>` steps (field-assigned by `Raiser_Assignee`) |
| mine | `myItems(flow)`. For rows with `_activity_instance_id` and `_status` InProgress, `getTask` [unverified for a non-assignee initiator]; else the row as is | RMM: cases + reviews it started · the raiser: its points (closed ones included) |
| byId | for item ids known from the index and not yet read: `adminGet`, then `getById`. **Probe the first id only**; on refusal skip the rest for this flow and load | everyone, [unverified] |
| snapshot | latest audit `Snapshot_JSON` per object | everyone (fallback) |

Never call `getParticipatedItems`: it fails platform-wide [doc reader C §1a].

| Data | RMM | REG/SAF/QM/MIC/SUS | CUS, LEG | BA | Auditor | Business owner |
|---|---|---|---|---|---|---|
| Case index + history (audit form) | form | form | form | form | form | form |
| CIQ Case items | admin → mine → byId → snapshot | admin → byId → snapshot | same | same | same | same |
| CIQ Review | admin → tasks(RMM) ∪ mine → snapshot | admin → tasks(own) → snapshot | admin → snapshot | admin → snapshot | admin → snapshot | admin → snapshot |
| CIQ Open Point | admin → tasks(6 steps) ∪ mine → snapshot | same | admin → snapshot | admin → snapshot | admin → snapshot | admin → snapshot |
| Internal notes | form | form | form | form (Viewer) | form | form |
| RMES Safety / Regulatory | skip | own dept only | skip | skip | both (Viewer) | skip |
| CIQ Supplier | form (Viewer) | skip → from case snapshots | skip | form | skip | skip |
| Config rows | form | form | form | form | form | form |

Skipping a read the grant refuses avoids error noise. Reviewers see supplier name and DUNS from the case (`Supplier_Legal_Name`, `BDF_Set_JSON["FLD-GEN-003"]`) [doc reader D §5].

**When a read is refused:**
- A list refused (403, "no permission", empty role): the `ReadReport` is `ok: false` with `errorText`. The rung falls through and the snapshot serves.
- A case item that can't be read in full: `unreadableCases[itemId] = why`. The mapper sets `index.caseBanners[caseId]`, and the shell shows on `/cases/:id` and `/review/:caseId`: "Kissflow did not let your role read this case's questionnaire (`<why>`). You see its header, reviews and open points."
- Form list refused: the data is empty, plus a shell warning "`<form>` could not be read: `<why>`".
- First load fails entirely: a full-page error with Try again (as `LiveSupplierStore.tsx:537-561`). A later failure keeps the last good data and shows a banner.
- A role without members is not detectable by the UI and needs no special path. The signed-in user always holds the persona they act as.

**Load-time side effects (D runs them, C implements them), after a successful load, on the serial chain:**
- Acting RMM: `ensureReviews`, `ensureRelease`. Acting SAF/REG: `ensureRmes`.
- Each creates only what is missing and is attempted at most once per case per session (`ensureRmes` once per case and department, so a dev switch from Safety to Regulatory still creates Regulatory's row; a failure is listed in Diagnostics, never retried in a loop).
- One reload afterwards when something was created.
- No twin of an item the user already started: an own unsent draft counts as existing by its key. A live My items row carries no field of the item (21 Oct): a review the user started that was read only that way is placed by the history line that names it (`toAppState` placedByHistory). While an own review draft could not be read (its key unknown, `ownDraftKeys` "review|*"; a draft read in full whose key is blank holds no key) or such a review is placed by no history line (`LiveIndex.unplacedReviews`), `ensureReviews` starts none of a case's missing reviews it could be (its department's step, or any when at none), and `ensureRelease` sends no request while such a review is open: a Diagnostics note each, and the case stays eligible.
- They run only when the reads they decide from answered on this load, and not while one of those parts is shown from an earlier load (`kept`, APP-SAVING-GAPS gap 8; `effectBlocked`).
- Since 21 Oct a save that moves no step reads nothing (gap 1), so they run on a full read only: the first load, Reload, after a step move, an item-writing hand-off or a failed write. A case that became ready meanwhile waits for one of those (for example the final-release request while RMM only adds notes).

**Between loads (APP-SAVING-GAPS, 20/21 Oct):** a save's read-backs are laid over the last load (`withSaved`). A part a new load could not read again (a form list, a process flow's admin or task lists, a form row's own read) is shown as the last load read it, with a "shown as of HH:MM" warning (`keepUnread`); such a read keeps the optimistic state and stays owed.

---

## 5. Mapping live → AppState (B)

### 5.1 Case

| Domain | Live source (case item; else `case.created` snapshot) | Note |
|---|---|---|
| id, materialName, inci, materialNo, supplierId, manufacturer | `Case_Code`, `Trade_Name`, `Main_INCI`, `BDF_Material_No`, `Supplier_Code`, `Supplier_Legal_Name` | join on item id, never the code (not unique) [doc reader D §5] |
| site | "" | G10 |
| ownerId | `Owner_RMM._id` (directory dept RMM) | |
| createdAt, dueDate, priority | `_created_at`, `Supplier_Due_Date`, `Priority` ("High" → high) | |
| templateVersion, ruleSetVersion | `Template_Version`, `Rule_Set_Version` | per-case pin check vs releases → banner (reader E §2.3) |
| supplierContactIds | `Case_Contacts_JSON[].id` (`caseContactsOf`) | contacts also become `User`s (`side: "supplier"`, `supplierId`) |
| config | `Config_Answers_JSON` (`readDoc().config`) + `SF11` from `BDF_Set_JSON.SF11` (else `parseMarkets(Markets_Label \|\| Target_Markets_Text)`) | |
| answers | `readDoc().answers` merged over the `BDF_Set_JSON` GEN values | |
| answeredBy | `Answered_By_JSON` `{name,email,at,by?}` → `{by: contactIdByEmail, at}` (unknown e-mail → `mail:<email>` user) | |
| components, justifications | `readDoc().components ?? []`, `readDoc().justifications` | |
| scope | `liveScope({config, ruleSetVersion, templateVersion, cfg, part: partOfPhase(phase), stored: storedScope(Scope_JSON), manual: []})`, then where a derived row has the same applicability, take its internal `reason` + `firedRules` from `deriveScope(...)` | G8: internal reasons restored |
| requestedDocs | `storedSlots(Requested_Docs_JSON)` once in review, else undefined | |
| liveScope | `true` | |
| documents | `Documents_JSON` → `{id: uploadId, name: fileName, kind: docKind ∈ DocKind else "Other", sectionId: sectionKey, fieldId: fieldKey, version: 1, uploadedBy: contactIdByEmail(uploadedByEmail), uploadedAt, sizeKb: 0}` | |
| phase | **derived**, in order: (1) cancelled when the latest of `case.cancelled`/`case.reactivated` audit is a cancel, or `Cancelled_At` set; (2) completed when `_status` Completed, the step is End, or `Final_Release_At` set; (3) supplier-input when the step is `waiting`/`start` and `Case_Phase` ≠ "Review" and no `Completeness_At`, or (unreadable, or a list row without those two fields: a live My items row, 21 Oct) no review known and the step is not the release step; (4) final-release when reviews exist and every latest-round track is completed, or the latest of `release.requested`/`review.reopened` is `release.requested`; (5) review | G1; the step comes from `_current_step` name or `_current_context[0]._context_activity_id` |
| phaseHistory | `[{supplier-input, _created_at}, {review, Completeness_At ?? first review.started}, {final-release, release.requested at}, {completed, Final_Release_At}, {cancelled, case.cancelled at}]`, filtered and sorted | never empty |
| confirmations | completeness ← `Completeness_*`; dept-completion ← completed review items/snapshots (`Completed_By_Name/Email/At`, role = persona label of the dept); final-release ← `Final_Release_*`; cancellation ← snapshot | |
| informed | `["CUS","LEG"]` from review on | |
| reviewVersion | 1 from review on, else 0 | metrics first-time-right |
| cancelled | snapshot `{by, at, reason, fromPhase}` of the latest `case.cancelled` | G2 |
| finalDocument | P2: `buildFinalDocument(state, c, Final_Release_At, "Final release")` when completed | G4 |
| audit | §5.3 + synthesized entries: "Confirmed completeness" (`Completeness_At`, by contact), supplier answers (from `Response_*`), "Final release" (`Final_Release_At`) | |
| changeReports (global) | one `ChangeReport` per case from `Change_Report_*` (`id = <case>-cr<rev>`) | G6: latest only |

### 5.2 Tracks, points, RMES, notes, people

| Domain | Live | Note |
|---|---|---|
| ReviewTrack | latest `Round_No` per (`Case_Item_Id`, `Review_Dept`) | earlier rounds give `lastCompletedAt` |
| .status | `_status` Completed → completed; Withdrawn → track dropped + warning; else `Activation_Kind`="Reopened" → reopened; any own-dept point open → waiting-supplier; else in-review | G17 (Track_Status is frozen after Start) |
| .assigneeId | `Assignee_User._id`; RMM → case owner; else `role:<DEPT>` (directory user "`<DEPT_LABEL>` reviewers", `active: false`, no dept, so it is never a picker target) | |
| .startedAt / .completedAt | `_created_at` / `Completed_At` | |
| .decision / .decisionReason | `RMES_Decision` / `RMES_Decision_Reason` | |
| .continueAfterRejection | `Rejection_Handling` = "Continue to final release" → `{note: Rejection_Note, by: Completed_By._id, at: Completed_At, depts: Rejected_Depts_Covered.split(/[,;\s]+/)}` | separator [unverified] |
| OpenPoint id/caseId/dept/kind | `OP_Key`, case of `Case_Item_Id`, `OP_Dept`, `OP_Kind` (inverse `LIST.opKind`) | duplicate `OP_Key` → second gets suffix `·2` + warning |
| ref | `Ref_Section_Key`, `Ref_Field_Key`, `Ref_Row_Id`, `Ref_Doc_Id`, `Ref_Label` | |
| question, justification ("—" → ""), responsibleId, dueDate, rounds | `Question_Text`, `Supplier_Justification`, `Responsible_User._id`, `Supplier_Due_Date`, `Round_No` | |
| status / outcome | closed when `OP_Outcome` is set or `_status` ∈ {Completed, Withdrawn} (outcome inverse map; a Completed item without an outcome → `withdrawn` + warning, as the walk produced [live walk-v6-result.json]); else in-progress when `OP_Progress`="In progress"; else open | |
| createdAt/createdBy, closedAt/closedBy/closeReason | `_created_at`/`Raised_By_User._id`; `Closed_At`, `Closed_By._id`, `Outcome_Reason` (only when withdrawn) | |
| thread, edits | `Thread_JSON` `{thread, edits}`. A bare array or unreadable value → `[raised]` from Question_Text/Raised_By_User/_created_at. **Supplier answer synthesis (G14):** when `OP_Progress`="In progress" and the last thread message after the last `newRound` is not from the supplier, append `{id: <op>-m<n>, at: _modified_at, by: contactIdByEmail(Supplier_Responsible_Email), side: "supplier", text: Response_Text, action: Response_Kind="Cannot provide" ? "cannot-provide" : "answered", documentId: first Response_Doc_Refs_JSON uploadId}`. The raiser's next write persists it | |
| RmesRecord | per case: SAF row criteria + REG row criteria (whichever readable); `createdAt` = earliest `_created_at` | RMM/QM/… → `rmes` absent (RMES card hidden, reader A) |
| RmesCriterion | `Criteria_Code/Part/Title`, source `{sectionId: Criteria_Source_Section_Key, fieldId: Criteria_Source_Field_Key, label: Criteria_Applicability_Basis, version: 1}`, `result` (inverse `LIST.rmesResult`), `Criteria_Comment`, `Criteria_Recorded_By._id`, `Criteria_Recorded_At`, limit from `Criteria_Reported_Value/Unit/Limit_Value/Limit_Set_Version/Limit_Pass/Source_Value_Text`, `aiSuggestion` = `Criteria_AI_Suggestion_Text` | row `_id` → `RmesRef.criteriaRows` |
| Finding | `Findings_Key`, `Findings_Criterion_Code`, `Findings_Text`, `Findings_Blocking`="Yes", `Findings_State`, `Findings_Linked_OP_Key` | row `_id` → `findingRows` |
| InternalNote | `Note_Key`, `Note_At`, `Note_Author._id`, `Note_Dept`, `Note_Text`, sectionId = `Linked_Key` when `Linked_Kind` is /section/i, mentions = `Note_Mentions_Emails` resolved | |
| Supplier / contacts | `Supplier_Code`, `Supplier_Legal_Name`, `DUNS_Number`, `Supplier_Country_Code` (26 Oct: as the code's one English name, `countries.ts countryName`, "ES" → "Spain"), `Supplier_Kind`, `Supplier_City`, `Supplier_Active`; contact id = `Contacts_Portal_User_Id` (the signed-in user's own: `self:<id>`, §3.4) else `contact:<Contacts_Key>`; every row's `Contacts_Key` → `Supplier.contactKeys` (a new contact never reuses one) | non-BA/RMM: suppliers synthesized from cases |
| Users (directory) | `me` + every `{_id, Name}` on User fields + audit `Actor_*`. Dept from context: `Owner_RMM`→RMM, `Raised_By_User`→`Raised_By_Dept`, `Completed_By`→`Review_Dept`, `Note_Author`→`Note_Dept`, audit `_created_by`→`Actor_Dept`; `me` wins. Static `{id: "u-admin", name: "Business administrator", active: false}` unless aliased by `me`; "system". 27 Oct: then the colleague directory (`MapInput.colleagues`, `Directory.colleague`): every member of a CIQ role as an active Beiersdorf user with the role's department and title (a person the items name keeps their name, title and id; a stand-in becomes real; the signed-in user and a supplier contact with the same id stay as they are; an e-mail another Beiersdorf user has is not given twice). A note's mention without an e-mail (`Note_Mentions_Names` longer than `Note_Mentions_Emails`) is found by the exact name (`Directory.byName`) | G9 |
| config, templates, activeRuleSet, ownership, reminders | `configFromRows` (reader E fixes a–f); `templates = templateList(cfg)`; `activeRuleSet = currentPair({config}).ruleSetVersion`; OWN/REM by `Config_Key` | `syncRegistry` before render |
| log | audit rows with blank `Case_Code` and `Event_Category` ∈ {"Supplier master", "Configuration"} → `LogEvent` from `Snapshot_JSON.log` | |
| mails, toasts | `[]` (store owns toasts) | G5 |

### 5.3 Audit rows ↔ AuditEvent (resolves reader D's §1h conflict) [decision]

- `Action_Code` = the v6 code (§3.2 `AuditCode`, plan v6 §4.1 l.112). The prototype's phrases live in `Snapshot_JSON.audit` (the domain's own new entries, so "`Final ${DEPT_SHORT} decision`" and the `auditTone` keywords survive [code features/rmm/shared.tsx:309-320]).
- **Snapshot_JSON** = `{ v: 1, code, audit: AuditEvent[], log?: LogEvent[], case?: CaseHeader, track?: ReviewTrack & {roundNo}, confirmation?: Confirmation, op?: OpenPoint, rmes?: { dept, criterion?, finding?, decision? }, note?: InternalNote, cancelled?: {…, closedOpIds: string[]}, handoffs: HandoffStatus[] }`.
- **CaseHeader** = `{caseId, itemId, cycleNo, materialName, inci, materialNo, supplierId, manufacturer, duns, ownerId, ownerName, createdAt, dueDate, priority, templateVersion, ruleSetVersion, markets, contacts: [{id,name,email,title,mayConfirm}], bdfSet}`.
- **Reading:** rows sorted by `Event_At`. A case's `audit` = concatenated `Snapshot_JSON.audit` (ids re-numbered `<case>-a<n>`). A row without a snapshot → `{action: ACTION_LABEL[code] ?? code, detail: New_Value_Text, by: _created_by._id}`.
- **Object snapshots:** latest per (`Object_Kind`, `Object_Key`). A live item always beats a snapshot.

---

## 6. Actions → writes (C writers, D store)

**Store flow, every supported method (D `api.ts`):**
1. `containerOk` false → danger toast "This page is not running in the CIQ Digital app. Nothing was saved."
2. `liveGuard` → danger toast with the reason.
3. `next = A.<fn>(prev, acting.me.id, …args)`. When `wasRefused`, copy the domain's last toast and return the method's "refused" value. **No domain logic is duplicated.**
4. Commit `next` (mails and toasts stripped) as the optimistic state, so the screens update at once.
5. Enqueue the writer on the serial chain (`chain = chain.then(job)`; one write in flight [code LiveSupplierStore.tsx:229-235]); return the success value synchronously (`true`, the case id, …).
6. When the job settles (`enqueueJob`, APP-SAVING-GAPS 20/21 Oct):
   - ok: success toast = the domain's own new non-refusal toast text, else the store text of `store.tsx:342-390`; plus " Beiersdorf's system will pass this on." when any hand-off is `pending`. A job that moved no step (`moved: false`) shows its read-backs (`saved`, `auditRow`) without reading anything; a step move, an item-writing hand-off (`op.round`, `op.edited`) or an unknown `moved` reads everything once, after the last queued job. A read that failed or kept a part stays owed.
   - error: danger toast "Not saved: `<errorText>`"; the optimistic state goes at once, the jobs queued behind it are not sent ("Not sent: …"), and everything is read again.
   - Every result goes to `writeLog`. The screens that keep the user's input (notes, raise, decide, finding, New case) get a promise of the outcome and keep the input when it is false.
   - `completeReview` reads everything again inside its job and runs the domain again on that; it refuses when that read could not read the gate's parts again (`notReadAgain`) or the review changed since the click.

**Every writer:**
- Item writes, then read-back (`writeVerified`), then the UI's own Mandatory gate (`assertMandatory`, because Mandatory is not enforced on submit (G-7)), then submit, then hand-offs, then **one** audit row (D-7).
- DateTimes with `kfDateTime` (no ms); Dates `yyyy-mm-dd`; never `""` for typed fields (compact); users `{_id}`, multi-users `[{_id}]` (SDK shape [unverified]).
- Before updating a process item the user holds: `staleCheck`. When `_modified_at` moved since load (for example I-4 landed), refuse: "This open point changed in the meantime. It has been reloaded; check it and try again."
- Partial-failure rule: whatever already reached Kissflow stays. The toast names what is missing; an audit-row failure is a warning ("…done, but its history line was not saved") and is listed in Diagnostics.

`H` = hand-off via `handoff(ctx, code, payload)`. Since 20 Oct (app + portal session) a payload carries app item ids only: the integration reads the portal target (the case's `Portal_Request_Item_Id`, the point's `Portal_Query_Item_Id`) and the values from Kissflow, because the webhook URLs ship in the bundle unauthenticated. `cid` = `index.cases.get(caseId).itemId` (from the item, or the audit rows' `Case_Item_Id` when the role can't read the case: R-7 is gone); the payload is `null` → pending only when even that is unknown. `hist` = `history.updated` with `{caseItemId: cid, questionsHistoryJson: questionsHistory(nextCase, nameOf)}` [code app-live/shared/questionsHistory.ts:82]. Every POST adds `idempotencyKey`.

| Method (P) | Live pre-guard | Kissflow writes, in order | Audit | Hand-off |
|---|---|---|---|---|
| `createCase` (P1, RMM) | `me.email` set (BDF_Contact_Email M); `releaseForPair(currentPair(prev))` found; `caseStartPayload({release: row.raw, undefinedOrigins: settings.undefinedOrigins, contacts: case contacts as StartContact (portalUserId = id unless "contact:"), bdfAnswers: c.answers, markets: SF11})` resolves (its Error text is the toast) [code app-live/shared/caseStartPayload.ts:95-112] | 1. `create("case", caseStartFields)`: all G-9 M fields (`Cycle_No` 1, `Owner_RMM {_id}`, `Target_Markets_Text` codes ", ", `Portal_Contact_Ids` / `Confirm_Contact_Ids` / `Supplier_Contact_Emails` comma-joined, `BDF_Contact_*` = me) + `Case_Title`, `Markets_Label`, `Priority`, `Release_Manifest_JSON`, `Duplicate_Reason`, `Follow_Up_Of_*` + the 6 payload fields. 2. `getTask` read-back at `case.start`, `writeVerified`. 3. `assertMandatory(case.start)`; a failure leaves a **draft** (Diagnostics: Send/Discard). 4. `submit` → "Waiting for supplier: CIQ" | `case.created`, Object "Case", Snapshot `{case: CaseHeader, audit}`; Notify lists `case.started` | `case.started {caseItemId}` (I-1) |
| `ensureReviews` (P1, RMM, load) | case phase review, case readable, RMM | per missing dept d of `["RMM", ...departmentsForScope(c.scope, state.ownership)]` (missing = no live item or `review.started` snapshot with `Review_Key` `<case>-<d>-1`): `create("review", {Review_Key, Case_Code, Cycle_No, Case_Item_Id, Supplier_Code, Trade_Name, Review_Dept: d, Round_No: 1, Activation_Kind: "Completeness", Activation_Reason, Activated_By_Name, Assignee_User (RMM: owner), Assignee_Name, Track_Status: "In review", Open_Count: 0, RMES_Gaps: 0})` → read-back → `submit` (routes on Review_Dept). P2: one Scope Run row (`Run_Key <case>-SR-1`, `Scope_Trigger` "Completeness", Input/Result JSON, `Lead_Departments`) | `review.started` per review, Snapshot `{track, audit: [Activated review]}` | — |
| `ensureRmes` (P1, SAF/REG, load) | own review task held; no RMES row for (`Case_Item_Id`, dept) | `formCreate(rmes<dept>, {RMES_Key: <case>-RMES-<dept>, Result_Case: {_id: caseItemId}, Case_Item_Id, Case_Code, Cycle_No, Open_Criteria_Count, Open_Blocking_Findings_Count: 0, RMES_Voided: "No", "Table::<Dept>_Criteria": criteria.map(criterionRow + {_id: "<Model>_<rand10>", _is_created: true})})` → `formGet` verify the row count. Criteria from `planRmesCriteria` (below) filtered by dept | `rmes.saved`, Object "RMES record" | — |
| `raiseOpenPoint` (P1, RMM + 5 depts) | case item id known (index) | 1. `create("op", opStartFields)`: all G-11 Start M fields + `Query_Key <op>-R1`, `Kind_Label`, `OP_To_Supplier` "Yes", `Raised_By_Name`, `Ref_*`, `Responsible_Name`, `Responsible_Dept_Label`, `OP_Progress` "Open", `Raiser_Assignee [{_id: me}]`, `Thread_JSON`, `Portal_Contact_Ids`; blank justification → "—". 2. read-back, gate. 3. `submit` → "Open point – `<dept>`" | `op.raised`, Snapshot `{op, audit}` | `op.round {opItemId}` (round 1, I-3) + `hist` |
| `findingToQuery` (P1) | as raise + finding row known | raise (with `Ref_Internal_Key` = finding id), then `formUpdate(rmes, {"Table::<Dept>_Findings": [{_id: row, Findings_Linked_OP_Key}]})` | one `op.raised` row (Snapshot adds `rmes.finding`) | `op.round {opItemId}` + `hist` |
| `reviewResponse` accept (P1, raiser) | op task held at `op.<dept>`; `staleCheck` | `update {OP_Outcome: "Accepted", Closed_At, Closed_By, Thread_JSON}` → read-back → gate → `submit` (End) | `op.accepted` | `hist` |
| … not-accepted | same | `update {OP_Outcome: "Not accepted", Outcome_Reason: text, Closed_At, Closed_By, Thread_JSON}` → `submit`; P2: for SAF/REG with an RMES row, add the domain's closed finding `<op>-F` | `op.notaccepted` | `hist` |
| … return | same | `update {Round_No: n+1, Query_Key: <op>-R<n+1>, OP_Progress: "Open", Supplier_Due_Date: new, Return_Reason: text, Thread_JSON}`; **no submit** (the point stays at its dept step) | `op.returned` (Notify lists `op.round`) | `op.round {opItemId}` (after the read-back: the integration reads round n+1 from the point) + `hist` |
| `editOpenPoint` (P1) | same | `update {Question_Text, Supplier_Justification, Supplier_Due_Date, Responsible_User, Responsible_Name, Thread_JSON}`; when the domain started a new round, also `Round_No`, `Query_Key`, `OP_Progress` "Open" | `op.edited` | new round → `op.round {opItemId}`; else when the point was open → `op.edited {opItemId}` (the integration refuses a point without `Portal_Query_Item_Id`); + `hist` |
| `closeOpenPoint` (P1) | same | `update {OP_Outcome: "Withdrawn", Outcome_Reason: reason, Closed_At, Closed_By, Thread_JSON}` → `submit` | `op.closed` | when prev status was open → `op.closed {opItemId}` (the integration refuses unless `OP_Outcome` is set and a query exists); + `hist` |
| `recordCriterion` (P1, SAF/REG) | RMES row + criterion row id known (never write an unknown row `_id`: it adds a duplicate [doc reader C §1b]) | `formUpdate(rmes, {"Table::<Dept>_Criteria": [{_id: row, Criteria_Result, Criteria_Comment, Criteria_Recorded_By, Criteria_Recorded_At}], Open_Criteria_Count})` → `formGet` verify | `rmes.saved` (Object "RMES criterion") | — |
| `addFinding` / `closeFinding` (P1) | RMES row | add `[{_is_created: true, _id: "<Dept>_Findings_<rand10>", Findings_Key, Findings_Criterion_Code, Findings_Text, Findings_Blocking, Findings_State: "open"}]` / update `[{_id: row, Findings_State: "closed"}]` + `Open_Blocking_Findings_Count`; verify by `Findings_Key` | `rmes.saved` | — |
| `rmesDecision` (P1) | own review task held; RMES row loaded; **rejected while RMM's review is completed → refuse** "RMM has completed its review. Ask RMM to reopen it before you record Rejected." (the domain would reopen RMM's track, which SAF/REG can't write) | `update("review", {RMES_Decision, RMES_Decision_Reason})` → verify | `rmes.saved` (Object "RMES decision"; entries keep "Final … decision" and "Flagged for RMM") | — |
| `completeReview` (P1, own dept) | own review task held (`review.<dept>`); SAF/REG: RMES row loaded (else `GUARD_TEXT.rmesUnknown`, "Your department's RMES record of this case was not found. Reload the page …" — an absent `rmes` would let `reviewBlockers` skip the RMES checks [code domain/selectors.ts:208]); `staleCheck` | 1. `update {Open_Count, RMES_Gaps}` (counts split from the domain's `reviewBlockers`, 0 after the guard) `+ {Review_Confirm: "Confirmed", Completed_By, Completed_By_Name, Completed_By_Email, Completed_At}`; RMM with `continueNote` → `Rejection_Handling`, `Rejection_Note`, `Rejected_Depts_Covered`. 2. read-back; gate: every G-10 M field set and `Review_Gate` = "OK" (server formula), else stop "Kissflow's review gate is not OK yet; nothing was completed." 3. `submit` (End) | `review.completed`, Snapshot `{track, confirmation, audit}` | none. The final release is RMM's load-time `ensureRelease` (M2): every latest-round review Completed as read live and no `release.requested` after the last `review.reopened` → one `release.requested` row + `{caseItemId}` (the integration sets Release_Flag, the lock and Release_Contacts from the case), idempotency key `REL-<case item>-R<RMM round>` |
| `addInternalNote` (P1, RMM, depts, CUS, LEG) | — | `formCreate("note", {Note_Key, Case_Code, Cycle_No, Case_Item_Id, Linked_Kind: "Section"\|"Case", Linked_Key, Note_Text, Note_Author, Note_Dept, Note_At, Note_Mentions_Emails, Note_Mentions_Names})` → `formGet` verify; then (27 Oct) one mail per colleague mentioned, never the writer: POST `{To, Subject, Body}` to the mail hook (`write/mail.ts sendMentionMails`, fire-and-forget as the supplier mails) | `note.added` | — ; toast "Note added." / "Note added. <n> colleague(s) notified by e-mail." (+ who has no e-mail address; "E-mail is not set up here, so nobody was notified." without a mail hook) |
| `reassignReview` (P2) | own review task held | `update {Assignee_User, Assignee_Name, Assignee_Email, Reassign_Reason}` (the task stays with the role) | `review.reassigned` | — |
| `reopenReview` (P2, RMM only) | dept must be RMM, else the out-of-scope toast | `create("review", round n+1, Activation_Kind "Reopened", Activation_Reason)` → `submit` | `review.reopened` | in final-release → `review.reopened {caseItemId: cid}` |
| `cancelCase` (P2, RMM) | — | for each unresolved point raised by me with a held task: as `closeOpenPoint` with `Outcome_Reason` "Case cancelled: …". Other raisers' points stay open in Kissflow; the mapper shows them closed by cancellation from the snapshot's `closedOpIds` | `case.cancelled`, Snapshot `{cancelled, confirmation, audit}` | `case.cancelled {caseItemId: cid, phaseLabel: "Cancelled", locked: "Yes"}` + `op.closed {opItemId}` per own open point |
| `addSupplier` (P2, BA) | country in the list in force (`countryCode`); portal user ids (26 Oct): only with Admin / Developer, shaped `Us…`, no two the same, none another contact's (`guards.ts portalIdsProblem`) | `formCreate("supplier", {Supplier_Code: id, Supplier_Legal_Name, DUNS_Number, Supplier_Kind, Supplier_Country_Code, Supplier_City, Supplier_Active: "Yes", "Table::Contacts": rows (Contacts_Key = domain user id, Full_Name, Email, Title, Can_Confirm, Active, + Contacts_Portal_User_Id when the row gave one)})` → verify; a row with a portal user → `moved` (the contact's id changes: everything is read again) | `supplier.changed`, blank Case_Code, Category "Supplier master", Snapshot `{log}` (+ one "Linked portal user" per linked contact, no id in the text) | — |
| `updateSupplier` / `addContact` / `updateContact` (P2) | supplier row known; for `addContact` its contact rows read on this load or shown from an earlier one (not `SupplierRef.contactsUnread`), and its portal user id as for `addSupplier`; contact row id known for updates | `formUpdate` header / `Table::Contacts` add `{_is_created: true, …}` (+ `Contacts_Portal_User_Id` when given → `moved`) after a `formGet` (a row that holds the new `Contacts_Key` with other values → stale, nothing sent) / row update by `_id` | `supplier.changed` | — |
| `setContactActive` (P2) | contact on no open case (else the out-of-scope toast) | row `{Contacts_Active, Contacts_Deactivated_At}` | `supplier.changed` | — |
| `notify`, `dismissToast`, `reset` (= reload), `setPersona` (only held personas; else a refusal toast), `validateDraft` (pure) | — | — | — | — |
| every other method | — | none; the `na(what)` toast; return `false` / `null` / `""` / `0` / `undefined` as typed (as `LiveSupplierStore.tsx:365-473`) | — | — |

### Configuration (26 Oct): the live editor of the Business administrator (`write/config.ts`, `write/configRows.ts`)

The domain decides as in the prototype (`configActions.ts`: config.manage, one draft, the draft rules, validation, the change note); `api.ts` shows the result at once and the writer persists it as rows of CIQ Config Version, on the store's serial chain, with read-back. Rows are found by `Config_Key` among the load's rows (`LiveIndex.configRows`; a key the load did not see sends ONE fresh `formList`). Every row is serialised byte-identically to the prod seed (`configRows.ts`, a port of `kissflow-build/sync/config.mjs` releaseRows/row/bundleHash/seedRows; unit-tested against `night-2026-10-21/prod-seed/config-version.json`), except `Published_At`, written as a Kissflow DateTime without ms (as Kissflow stores it). Every write is read back until it holds what was sent, and its content must hash to its `Content_Hash` (bundle and manifest for a release); a mismatch is a failure. Rows are never deleted. The bundle's `createdBy` and `Published_By` are Kissflow ids; `toAppState` maps them through the directory (the BA reads its alias "u-admin", others the name).

| Method | Rows, in order | Audit (`Event_Category` "Configuration", no case) |
|---|---|---|
| `createDraft` | fresh list; RS, TPL, REL of the new pair as Draft (REL last). A discarded row of the key (Retired, no Published_At) or a leftover Draft RS/TPL is reused (updated whole); a published one refuses ("already published"); any Draft REL in Kissflow = a draft this screen did not know → stale | `config.draft.created` |
| `upsertRule`, `deleteRule`, `upsertSection`, `retireSection`, `restoreSection`, `upsertField`, `moveField`, `removeField` | the draft REL is read first (published/discarded meanwhile → stale, nothing written); then only the rows whose `Content_Hash` differs from the stored row: RS/TPL `Payload_JSON` + `Content_Hash`, REL `Release_Bundle_JSON`, `Content_Hash`, `Release_Manifest_JSON`, `Manifest_Hash`; REL last | none [decision]: a draft is not a committed configuration; the publish row lists the draft's changes (`Snapshot_JSON.config.changes`) |
| `discardDraft` | RS, TPL, then REL → `Config_State` "Retired", no Published_At (map/config.ts fix a) | `config.draft.discarded` |
| `publishDraft`, `publishTemplateV2` | RS, then TPL, then **REL last** → "Published", `Published_At`, `Change_Note`, `Published_By` (+ the content when it differs). Only the side that changed is new: a kept side's published row stays (created only when missing; a different fingerprint is a warning); the draft REL row takes the result's key (working "RS-2026.3 + v3" → "RS-2026.3 + v2"); afterwards the kept side's working-number draft row is retired (a warning on failure); then `OWN:current` when the release set section owners (a warning on failure: the release is live). A stop before REL: "… is marked published. Not finished: … The release is not published, so new cases still start on <pair>. Publish again to finish." | `config.published` (+ `changes`) |
| `setOwnership` | `OWN:current` `Payload_JSON` {ownership} + `Content_Hash` (created whole when missing); then the draft rows when the draft's section followed | `config.ownership.changed` |
| `updateReminder` | `REM:current` {reminders} the same way | `config.reminders.changed` |

Texts: a refusal of the form rights (0503xx other than 050312's validation, a "permission" text) reads "Kissflow refused to save the configuration for your role. Ask the app admin to grant Business administrator create and edit on the CIQ Config Version form." in both environments (dev adds Kissflow's answer); a 050312 validation says the row was not accepted (rights or the Config State list); other causes plain in prod. Only the Business administrator (guard) and only with config.manage (domain). An upsert that changes nothing answers its id and writes nothing (store.tsx savedId). [unverified] live: the BA's create/edit rights on CIQ Config Version (the seed rows were created by an API key), that Kissflow keeps a Retired row's blank Published_At, and that an empty `Change_Note` is accepted.

### Portal user link (26 Oct, Admin / Developer)

New case needs an active chosen contact whose row holds `Contacts_Portal_User_Id` (guard `noPortalContact`); a contact's id in the app IS that id (`map/suppliersMap.ts contactIdOf`). It is per contact row (Thomas, 26 Oct: "by design the ability to add one portal user id is wrong per supplier; we need to have that in the child table"; a supplier has up to two contacts in practice, each with its own login; no maximum is enforced). Only a holder of Admin / Developer (`Identity.developer`) sees and sets it; others see no column (the contact window shows a set id read-only):
- **Add supplier**: each contact row has its own "Portal user ID" input; `ContactInput.portalUserId` passes through the domain (which neither checks nor keeps it) to the writer, whose new row carries `Contacts_Portal_User_Id` (`encode.ts contactRow(u, portalUserId)`), `moved`, and one "Linked portal user" log line per linked contact on the `supplier.changed` row.
- **Add contact** (the contact window): the same field, the same write on the one new row.
- **Edit supplier**: a "Portal users of the contacts" list, one input per existing contact (name, e-mail etc. stay the contact window's, one by one). On save, the header goes as before (only when it changed) and the changed ids go as ONE job, `write/actions.ts setContactPortalUsers` (the store's `link.saveMany`): ONE `Table::Contacts` delta with only `{_id, Contacts_Portal_User_Id}` per changed row, read back, ONE `supplier.changed` row (a "Linked portal user" / "Removed portal user" line per contact, the ids kept out of the text), everything read again (the contacts' ids change). Clearing an id is confirmed first.
- **Contact window, existing contact**: unchanged (`setContactPortalUser` = `setContactPortalUsers` with one change; texts as before).
- **Data console**: the "Portal users" panel on a CIQ Supplier item (`console/PortalUsers.tsx`: Set / Change / Remove per contact row, the same delta, read back; no history row, like every console write).

Validation (form as typed, `components/portalUser.tsx portalIdProblems`; writer and guard backstop, `guards.ts portalIdsProblem`): trimmed; `Us` + 4–40 letters, digits, `_` or `-`; empty = no portal user yet (fine); no two contacts may share one id, within the supplier and across all suppliers' contacts, because the contact's id IS the portal id: a shared id would make two people one ("Two contacts have the same portal user ID. Each contact needs its own: the app knows a contact by this ID…", "This portal user is already linked to <name>."). Contacts of one save may hand an id on to each other (Joana clears it, Ravi takes it); a contact outside the save that keeps it refuses. **Running cases are not changed in Kissflow**: their `Case_Contacts_JSON`, `Portal_Contact_Ids` and the portal request's assignees keep the portal users they started with, so a newly linked portal user does not get a running case's request (only new cases); the screens still show the same person: a case contact without an id is found by e-mail within the case's supplier, and one whose old id the master no longer lists maps to the master's contact with its e-mail (`Directory.aliasContact`, caseMap.ts).

### Data console: plain delete, fewer calls, orphans (26 Oct, Admin / Developer)

History: Thomas deleted a CIQ Case item alone in the console; as RMM the case still showed ("could not be read in full … KISSFLOW_ERROR_050201 This item has moved out of your queue. (REST)"): the case index (§4, `load.ts knownCaseIds`) finds a case through the rows that name it, and a deleted item's by-id read answers like a refusal. A "Delete with everything" followed (dependency search over every flow and the portal, children first, each read back). Deleting items one by one then ran into **"429 Too Many Requests"**: every delete re-read the whole list and up to 100 open items for their step, 4 at a time, beside the cascade's reads. Thomas (26 Oct): optimise the console's calls; "when I am deleting an item just delete the item, no need to check for dependencies".

- **Plain delete** (`console/remove.ts deleteItem`, `ItemDrawer.tsx`): the Delete of any item but a CIQ Case (27 Oct, below) is ONE call (a form row: `formDelete`; a process item: the admin REST DELETE) and then nothing: no dependency search, no read-back. An answer without an error is success: the drawer closes and the row leaves the table and the overview's counts locally (`session.removeRow`); a refusal shows in the dialog (a "not found" adds "It may be deleted already: Refresh the list to check."). Confirmation "Delete <key>?"; a process item still needs its key typed.
- **Case delete with everything that belongs to it** (27 Oct, Thomas: "say I delete a case in the admin, all associated to that also gets deleted, like how it was before"; `console/caseDelete.ts`, `CaseCascadeDialog.tsx`): the drawer's "Delete case" and a bulk delete with cases chosen. *Finding* (`planCaseDeletes`): the Orphans page's rules (`cascade.ts appItemsOf`, `portalItemsOf`: Case_Item_Id, an audit row's snapshot case, App_Case_Item_Id, the case's Portal_Request_Item_Id, the open points' Portal_Query_Item_Id / App_Open_Point_Id, Case_Code for rows without an id when no other existing case holds the code) over the **session's cached lists**: a list not read yet this session is read once, `CONSOLE_IN_FLIGHT` (2) at a time, and stays cached; a process row without its link field is read in full once and replaces its row; the case item is the drawer's full read (a bulk delete: its list row). The supplier portal by kf.api (as `cascade.ts`): CIQP Request searched (`q`) for the case's id and its code, CIQP Query for its code [decision: not also for each open point's id, as the Orphans page does: op.round writes every query's Case_Code], plus the items the app's links name; a portal row without its link read in full. The dialog lists per flow with counts (a bulk delete: totals and per case; "the N cases and their M related items, T items in all"), says when the case list was read and that the CIQ screens' later rows are not in it, and waits for the case's code typed (a bulk delete: the number of cases). A list that can't be read blocks it ("Nothing is deleted", "Read the lists again"). In a bulk delete the chosen cases are no "existing" cases for one another (a row naming two of them goes with the first) and nothing is planned twice. *Deleting* (`runCaseDeletes`): `DELETE_ORDER` per case (portal queries → portal requests → open points → reviews → RMES Safety → RMES Regulatory → notes → scope runs → audit rows → the case LAST), case after case, strictly one call at a time, `RUN_GAP_MS` (400 ms) apart, through the console client (backoff on 429, Retry-After honoured), **no read-back**: an answer without an error is done; "not found" (01015, 404, 050201: `isNotFound`) counts as already gone; a call still rate-limited after the backoff pauses the run (RATE_LIMITED, "Continue"); anything else stops the run there and the dialog shows where and what remains (the case item too, so the case stays findable); "Run again" goes on with the rest (nothing searched again); Stop before any next call. Each deleted item leaves the session's lists at once (`session.removeRow`: the tables, the overview's counts); nothing is read afterwards; the drawer closes with the dialog when its case was deleted. *Portal refused* [unverified live: kf.api into the portal from the app's frame]: its list read refused → the portal items the app names are listed by id (an open point whose row lacks Portal_Query_Item_Id read in full for it), to delete in the portal's admin console, and the app's items are deleted; a portal delete refused → that and the later portal items are listed, not tried again, and the run goes on with the app's items. For a typical case after the overview (ZZT-0003 in the fixtures): 3 portal searches + the portal rows read in full where a list row lacks its link (harness: 3), then 37 deletes ≈ 15 s; before: the 26 Oct cascade read every list again plus each open point in full, the portal searched per open point, and every delete read back (2 calls per item).
- **Bulk delete** (`console/BulkDelete.tsx`, `remove.ts runBulkDelete`): checkboxes on a flow's table (a page at a time, "Select all N that match" past it; a filter change clears the choice) and "Delete selected (N)": strictly one at a time, `BULK_GAP_MS` (400 ms) apart, one call each, a progress line and Stop; each deleted item leaves the table at once; a refusal is listed and the run goes on; a call still rate-limited after the client's backoff pauses the run with the plain text and Continue goes on from there. Process items: the number of items typed first. What is not deleted stays chosen.
- **The session's reads** (`console/session.ts ConsoleSession`, one per console client): each flow's list is read ONCE a console session, shared by the overview's counts, the flow pages and the import (Refresh on the overview reads every list again, on a flow page that list); a write changes the list locally (a delete removes the row; an edit's or a create's read-back replaces or adds it; the import's fresh read and each created row's read-back go in), so nothing is read again after a write. A failed read stays until Refresh. Pages say when their list was read ("Read at 10:42"): the CIQ screens' own writes are not seen here.
- **Current steps** (the admin list carries none, CAFM D55): the tables page 25 rows; nothing is read for the step on load or after a change; **"Show steps (n)"** reads the steps of the open items on the CURRENT page only (at most 25 reads, 2 at a time), kept per item id + status for the session (Refresh drops them; the drawer's full read gives one for free). Chosen over automatic reads per page: zero step reads unless asked, and a delete is followed by nothing.
- **The drawer**: one full read when it opens, kept while it stays open; an edit's read-back replaces it; a created row is shown from its read-back (not read twice).
- **Rate limits** (`kf/client.ts`): the console has its OWN client (`consoleClientOptions`, created beside the screens' in `AppLiveApp.tsx`): at most `CONSOLE_IN_FLIGHT` = 2 calls in flight, and `CONSOLE_RETRY` for a 429: exponential 1 s, 2 s, 4 s, 8 s, 16 s … each + up to 20 % jitter, until 30 s are waited in all (the last wait cut to what is left); a Retry-After the answer carries is waited as asked, or, past the 30 s, the call gives up at once [unverified: whether the Kissflow host passes Retry-After to the frame]. A call still limited fails with `RATE_LIMITED`, "Kissflow is limiting requests right now. Wait a minute, then try again." (a `RateLimitError`; the SDK→REST fallbacks of `adminGet`, `formDelete`, `adminUpdate` are not tried after it), shown inline; the screen stays usable. While the client waits, the console says so ("Kissflow is limiting requests: the console waits N s, then tries again.", `rateSignal.ts`). The CIQ screens' client is unchanged (6 in flight, 3 retries after about 0.6 s, 1.2 s, 1.8 s); both clients share the one-draft-per-form queue (`newFormQueue`).
- **Orphans** (`/data/orphans`, `cascade.ts findOrphans`, `CaseDeleteDialog.tsx`, the explicit separate tool, kept for cases deleted alone: in the console on 26–27 Oct, or elsewhere): every row or item that names a case item id missing from the CIQ Case admin list, each missing id confirmed by its own read (a draft case is not listed but exists; a read failing otherwise is shown "Not confirmed", without a delete), grouped by the missing case (code and id; rows that name only a code no existing case holds form a code-only group) with counts per flow. The page reads when it is opened and on "Read again" only. "Delete these N items" finds the group's items again (`findCaseItems`: by `Case_Item_Id`; an audit row also by its snapshot's case item id; CIQP Request by `App_Case_Item_Id`; CIQP Query by `App_Open_Point_Id` of the case's points, or by `Case_Code` when no other existing case holds the code, R-13), Delete after the case's code typed, then deletes **paced**: one item at a time, `RUN_GAP_MS` (400 ms) apart, children first (`DELETE_ORDER`), each read back (the read must fail as a deleted item's: `common.ts isNotFound`), with Stop; a stop or failure says where and what remains, "Run again" finishes it. Its reads go through the console client (2 in flight). Afterwards the deleted items leave the groups and the session's lists locally: no new scan. A group whose case item exists is not deleted there. When the supplier portal can't be read from here, the dialog lists the portal items the app names, with their ids, to delete in the portal's admin console; the app's items are deleted [decision for Thomas: or refuse until the portal is clean].
- **Load side:** unchanged. A by-id refusal still shows "could not be read": it can't be told apart from a real permission gap.
- [unverified] live: kf.api into `CIQ_Supplier_Portal_A00` from the app's frame (list with `q`, read, delete); the answers for a deleted form row (01015 assumed) and a deleted portal item (050201 assumed, as the app's); whether an admin list row carries `Case_Item_Id` / `Case_Code` / `App_*` (a row without is read in full); how the host reports a 429 to the frame (status, Retry-After). The fake client and the harness replay a deleted process item's reads as live answered on 26 Oct, and the harness plays 429s (`window.__kf429`).

### Country (26 Oct)

`Supplier_Country_Code` is a Kissflow Select on the list `CIQ_Country_Code_A00`; a value outside it is stored EMPTY with a 200 answer (live fact), and the old free-text country (only the names of `COUNTRY_CODES` mapped) saved any other typed country as no country. Now (`app-live/countries.ts`, `components/countryList.tsx`, provided by LiveAppStore; the prototype keeps its free text): the supplier form's country is a Select of exactly the list in force: the 32 codes read on 26 Oct (AT BE BG HR CY CZ DK EE FI FR DE GR HU IE IT LV LT LU MT NL PL PT RO SK SI ES SE GB TR CN US CA) built in, by ONE English name per code (GB "United Kingdom", US "United States", CZ "Czechia", TR "Turkey", …), sorted by name. The domain value is that name; the mapper turns the stored code into it, `countryCode` turns it back (older spellings "Czech Republic", "USA", "UK", "Türkiye" and bare codes read as the same country). A supplier whose country the list does not hold shows it as a selected extra option "<country> (not in the country list)", and the form asks "<country> is not in the country list. Choose a country from the list." before saving; the guard (`GUARD_TEXT.country`) stays the backstop. The texts say "the country list", never Kissflow's list by name (FE-CLEANUP C22). At run time the form's first opening reads the list's items once a session in the background (`AppClient.listItems`, kf.api GET `/flow/2/{acc}/list/CIQ_Country_Code_A00/items`, a JSON array of codes; [unverified] as the user): when it answers, Kissflow's list is in force (a code Thomas adds appears without a rebuild, named by `Intl.DisplayNames`, and is written as its code; a code removed is no longer offered); a refusal or an odd answer keeps the built-in 32 and leaves a line in the Writes log. The form never waits for it.

### E-mails (26 Oct)

`validateContact` refuses an e-mail only when another contact of the SAME supplier (active or not) has it ("<name>, another contact of this supplier, has this e-mail address." / "…, an inactive contact of this supplier, has this e-mail address. Reactivate that contact instead.") and two new rows of one form with the same e-mail ("Two contacts have the same e-mail address."). A contact may share its e-mail with a Beiersdorf user (Thomas's own e-mail as a supplier contact for testing) or with a contact of another supplier. Everything that matches people by e-mail is scoped: `Directory.contactOf` / `contactIdByEmail` look within the case's supplier (then among contacts no supplier is known for), never at another supplier (case contacts without an id, Answered_By_JSON, completeness / final-release / change-report stamps, a thread's supplier answer, uploads); `byEmail` (a note's @-mentions) finds Beiersdorf users only; `contactByEmail` (a relinked contact) was scoped already. The mails to the supplier go to the case's own contacts (`mail.ts contactEmails`, CaseRef.contacts). `checkInvariants` allows the same e-mail on both sides and at two suppliers, not within one supplier or among Beiersdorf users.

**`planRmesCriteria`** [decision]: runs `A.confirmCompleteness` with `"system"` (G-4) on a synthetic copy of the case: `phase: "supplier-input"`, `reviews: []`, `rmes: undefined`, `requestedDocs: undefined`, `liveScope: false`, scope rows `mandatory → optional` (same non-`na` set, so `has(sec)`/`departmentsForScope` are unchanged), justification for `FLD-5.1-002`. It then reads `.rmes.criteria`. This reuses the unexported `rmesCriteria` [code domain/actions.ts:584] without copying it. When refused → `{error}` → toast "The RMES criteria could not be prepared: …". A test pins it against a real `confirmCompleteness` on a complete fixture case.

**Audit row fields (C `auditRowData`):**
- **Keys:** `Event_Key` = `EV-<case|LOG>-<yyyymmddHHMMss>-<rand4>`, `Case_Code`, `Cycle_No`, `Case_Item_Id`, `Event_At`.
- **Category and code:** `Event_Category`: case.* → "Case", case.cancelled → "Cancellation", op.* → "Open point", review.* and release.requested → "Review", rmes.saved → "RMES", note.added → "Internal note", supplier.changed → "Supplier master", config.* → "Configuration" (26 Oct: config.published, config.draft.created, config.draft.discarded, config.ownership.changed, config.reminders.changed). `Action_Code` = the code.
- **Actor:** `Actor_Side` "BDF", `Actor_Name`, `Actor_Email`, `Actor_Dept` (only when in the department list), `Actor_Role_Id`.
- **Object:** `Object_Kind`, `Object_Key`, `Object_Item_Id`, `Object_State`.
- **Text:** `New_Value_Text` = the domain detail(s), `Event_Reason`.
- **References:** `Ref_Flow_Id`, `Ref_Item_Id`, `Ref_Activity_Instance_Id`.
- **Hand-offs:** `Notify_Channel` "webhook" when any hand-off; `Notify_Recipient` = JSON `HandoffStatus[]` ("pending hand-off" = status `pending`).
- **Snapshot:** `Snapshot_JSON`.
- **Write:** `formCreate("audit")` → `formGet` verify.

**Webhooks:** `webhooksOf(SET:current.Payload_JSON.webhooks)` with the shape `{[HandoffCode]: url}` [proposal, reader E §4]. Missing everywhere tonight (G-15), so every hand-off is `pending`. Production (21 Oct): SET:current is copied verbatim from the dev sandbox, and production differs in both its Kissflow domain and its account id (the tokens are the same). So the store builds each URL where it runs (LiveAppStore `webhooksFor`): the stored URL's token, the handshake's account (`kf.account._id`) and the host of the Kissflow page around the frame (env.ts `hookHostOf`: `location.ancestorOrigins[0]`, else the referrer's origin; https and a Kissflow domain only). Without such a page the URL is the relative path, which `postWebhook` sends by kf.api (the SDK posts it to the account's own domain). No host is written in the bundle.

### RMES (28 Oct): a read-only sheet; the record header only

BDF's e-mail of 28 Oct scopes the MVP RMES to exactly 8 fields filled from the CIQ ("no more"). It supersedes everything in this document about RMES criteria, limit checks, the AI suggestion and findings (the rows below on `planRmesCriteria`, `recordCriterion`, `addFinding` / `closeFinding`, `findingToQuery`, the not-accepted finding, the criteria child-table reads and `notReadAgain`'s unread RMES row).
- **The sheet:** `domain/rmesSheet.ts` `rmesSheet(state, c, { readable })`, derived live from the mapped case (Trade_Name / BDF_Set_JSON, Answers_JSON, Components_JSON); nothing stored, no refresh writer. `readable: false` (the case banner) gives one notice instead of the 8 fields. Shown to Safety and Regulatory only.
- **`ensureRmes`:** `formCreate(rmes<dept>, {RMES_Key, Case_Item_Id, Case_Code, Cycle_No, RMES_Voided: "No"})`, no `Table::` key, no `planRmesCriteria`, no wait for a readable case (it needs no answers); the history duplicate check stays; audit `rmes.saved` "RMES record created". The record (case id + `_created_at`) is REQ-PROC-021's; the decision and Complete review still need it (`guards.ts` `rmesUnknown`).
- **Load:** the RMES forms are list-read only (not in `CHILD_TABLE_FORMS`), so `notReadAgain` never names an RMES row; they stay in `GATE_PARTS` (a kept list still refuses). `trackMap.rmesOf` maps the record and its index entry only: `criteria: []`, `findings: []`, empty row maps. **A form list row has no `_created_at` or `_modified_at`** (live, 29 Oct: business fields and `_id` only), so the record's time is the row's `rmes.saved` creation row (`Object_State` "Created" or the "RMES record created" entry), its Event_At; a full read's `_created_at` still wins. Legacy rows that still hold criteria or findings are left alone (never voided) and never block.
- **Gate:** `countsOf` RMES_Gaps = Safety's / Regulatory's decision missing ? 1 : 0; Kissflow's `Review_Gate = Open_Count + RMES_Gaps = 0` and `RMES_Decision` (Mandatory at the SAF / REG steps) are unchanged. The writers `recordCriterion`, `addFinding`, `closeFinding`, `findingToQuery` and the not-accepted finding are removed (store methods too).
- **Configuration:** `RMES:current` is obsolete (never read); `LIM:current` stays (K2.2 uses the limits).
- **History and console:** a `rmes.saved` row without snapshot entries reads "Saved RMES record" (`auditMap.ts` `ACTION_LABEL`; it was "Recorded RMES result"). The data console lists the RMES forms by `Case_Code` and `Cycle_No` and declares no child tables for them; a legacy row's criteria or findings tables still show there as raw tables found on the item.
- **Tests:** `scripts/leak-scan.mjs` `RETIRED_TERMS` (the criterion titles, the canned AI text, the old history label) must be absent from the whole built app too (harness `rmes-sheet`); the live suite's 6a/6b check the header-only record, no child rows, its one "RMES record created" row and the sheet (`live/case.live.ts`), and S-INTEGRITY checks that an RMES row maps to no criterion or finding.

---

## 7. Tests, build, deploy

### 7.1 Unit tests (vitest, node env, no network; fixtures from `testing/rawFixtures.ts`, client = `createFakeClient`)

| File | Proves |
|---|---|
| `kf/client.test.ts` (A) | paging stops on a short page or a repeat; envelopes `{Data}`, `{items,total}`, array; unknown shape throws; 429 backoff then success; 30 s bound → error; `adminGet` falls back to REST GET except on 0503(12\|13); `formCreate` returns the submit's new id; `postWebhook` no-cors fetch first, kf.api on the URL's path only when fetch throws, a relative URL by kf.api only; `hookHost` from the page |
| `console/caseDelete.test.ts` (27 Oct) | the case delete finds the case's items from the session's cached lists (no list read again, nothing of the app read; the portal searched: request by id and code, queries by code), the same items and links as the Orphans finder; a list not read yet read once, 2 at a time, then cached; a sparse process row read in full once; a list that can't be read blocks it; the order (case last), ONE call each, no read-back, `RUN_GAP_MS` apart (also in real time); the session's lists lose the rows; RMM no warning; "not found" (01015, 050201) = gone and the run goes on; Stop then Run again (nothing twice); a refusal stops it there; 429 twice then 200 through the real client (1.1 s, 2.2 s); a Retry-After 120 s pauses with RATE_LIMITED and Continue finishes; the portal's list refused (its items listed by id, the app's deleted, no portal call) and its delete refused (the later portal items not tried); two cases one after the other, a row naming both with the first, nothing twice |
| `kf/client.test.ts` (26 Oct), `console/consoleCalls.test.ts`, `console/cascade.test.ts` | the console's backoff: 429 twice then 200 → waits about 1 s then 2 s and succeeds; Retry-After honoured (seconds, HTTP date, headers); gives up after about 30 s with `RATE_LIMITED`; no REST fallback after it; 2 calls in flight; the screens' backoff unchanged; a delete is ONE call (a case too) and nothing after; each list read once, a delete drops the row without a read; steps read only for the rows asked (≤ 25), kept per id + status; bulk delete one at a time 400 ms apart, Stop, paused by a lasting 429, through the real client with 429 ×2; the Orphans run paced (400 ms) and stoppable |
| `map/config.test.ts` (B) | config-seed rows → `cfg.pairs` = [v2 draft]; ownership/reminders equal `baseState`; ZZT row ignored; Retired without `Published_At` = discarded; `releaseForPair(FIRST_PAIR)` = the `REL:RS-2026.1 + v1` row |
| `map/caseMap.test.ts`, `trackMap.test.ts`, `auditMap.test.ts` (B) | every array present; phase table cases 1–5; track status derivation; answer synthesis exactly once; duplicate `OP_Key`; snapshot fallback when items are unreadable; Withdrawn track dropped; "Not available" → undefined + warning |
| `map/toAppState.test.ts` (B) | per persona: `me`, aliases, `roleOf`-relevant users, `syncRegistry`-ready config; no NaN dates (`createdAt`, `phaseHistory[].at`, `dueDate` valid) |
| `roundtrip.test.ts` (B, last) | encode(domain case/op/review/note) → raw → map ≈ the domain object on the key fields |
| `write/*.test.ts` (C), one per P1 method + `ensureReviews`/`ensureRmes` | call order and flow/step ids; exact field sets incl. every M field; Select texts ∈ `LIST`; no ms in DateTimes; read-back done; gate blocks the submit (fake `enforceMandatory: false`); stale refusal; audit row fields + snapshot; hand-off `pending` with no URL and `sent` with a URL (+ `Notify_Recipient`); partial failures (create ok/submit fails → draft; audit fails → warning, ok stays true); idempotent `ensureReviews` on a second run; `planRmesCriteria` equals the real criteria |
| `colleagues.test.ts`, `write/actions.test.ts` "mention mails" (27 Oct) | the role members with department and title (first role in ROLES order), the user list filling e-mails in and read only when needed, ExternalUser and groups skipped, nobody when both reads are refused (12 calls), 2 role reads at a time, once a session per client; the merge (fresh production: nobody, then the colleagues; the writer never a candidate nor mailed; the load's people keep name, title, id; a supplier contact never a colleague); one mail per colleague (To, the subject, the plain-text body with the case, trade name, section, note, the app's home), none without mentions or to the writer, a colleague without an e-mail named in the toast, no mail hook, a later failure reaching onMailProblem with the colleague |
| `identity.test.ts`, `load.test.ts`, `api.test.ts` (D) | role-id match beats name; multi-role order; CA-only → no persona; ladder rungs with refusals recorded and the snapshot fallback; `createLiveApi`: guard → refusal toast with no enqueue, accepted → optimistic + enqueue, unsupported → `na` |

### 7.2 Harness (E: `scripts/harness-applive.mjs`, the `harness-portal.mjs` mechanics)

- **Setup:** two 127.0.0.1 origins, a postMessage host emulating SDK 1.0.49 [code scripts/harness-portal.mjs:130-260], playwright-core from the same hard-coded path (`:18`), and the UI read from `dist-applive/zip/index.html`.
- **The host emulates:**
  - `CC_INITIALIZE` with `appId` "CIQ_Digital_A00" and `AppRoles` from `?roles=rmm,saf`;
  - process `GET_MY_ITEMS`, `GET_MY_TASKS_ITEMS` (activity filter, role- and field-assignment), `GET_ADMIN_ITEMS` (only with `?admin=1`; no step), `GET_ITEM` (current act + assignee only), `GET_ADMIN_ITEM`, `CREATE_ITEM`, `UPDATE_ITEM` (050313 for non-E fields per step from `ids.ts`-equivalent tables), `SUBMIT_ITEM` (routing: case → waiting; review → `Review_Dept` step → End; op → `OP_Dept` step → End; Mandatory enforced unless `?lax=1`; ms DateTimes refused);
  - `DATAFORM_GET_ITEMS/GET_ITEM/CREATE_ITEM/SUBMIT_ITEM` (new id) `/UPDATE_ITEM` (`Table::` deltas);
  - `API` (GET admin route; POST webhook URLs recorded in `window.__kfHooks`).
- **Hooks:** `__kfCalls`, `__kfDb`, `__kfSet` (plays I-2/I-4), `__kfMove`.
- **Fixtures:** `scripts/applive-fixtures.ts` builds them from B's raw fixtures: fictional ZZT cases (one with the supplier filling in, one in review with answers, one completed), Solvaro with two contacts with portal ids, and the 12 config rows.

| Scenario | Checks |
|---|---|
| `outside`, `no-role`, `ca-only` | plain messages; no item reads |
| `ba-config-access` (was `ba-config-readonly`) | lands on `/admin/rules`; rules from rows; no read-only banner; the edit controls are there (dev and prod); Test rules stays; zero writes by looking |
| `ba-config-live` (26 Oct) | as BA: discard the seed draft (RS, TPL, REL Retired), create a version (the rows reused), change a rule (RS + REL only) and a question (TPL + REL only), publish with a change note (REL last, Published_At without ms, fingerprints valid); as RMM (same page): New case pins the new pair, ZZT-0003 keeps RS-2026.1 + v1 without a pin banner; as BA: a section owner (OWN:current) and a reminder (REM:current); one audit row per committed change |
| `ba-config-refused` (26 Oct, prod) | the form rights refused → the plain rights text, no technical token, the draft unchanged |
| `dev-portal-user` (26 Oct) | Admin / Developer + BA links Nordhafen's contact (delta with only `_id` + `Contacts_Portal_User_Id`, read back, `supplier.changed`); as RMM New case for Nordhafen is no longer refused; without the role no field; the console's Portal users panel sets another contact |
| `ba-supplier-country` (26 Oct) | Add supplier: the country is a dropdown of the 32 listed countries by name (the list read once by the API route); United Kingdom written as GB; Solvaro's ES shows as Spain; a stored BR shows "Brazil (not in the country list)" and is refused until a listed country is chosen (AT written); `countries=NO`: Norway offered and written as NO; `countries=none`: the built-in 32 |
| `dev-supplier-portal-users` (26 Oct) | Admin / Developer + BA adds a supplier with two contacts, each its own portal user id (one with the signed-in user's own e-mail: not refused); two rows with one id and another supplier's contact's id are refused; RMM's New case lists both and is not refused (`Portal_Contact_Ids` both); Edit supplier changes one contact's id (one delta, one `supplier.changed`); without the role no column |
| `data-console` (26 Oct) | Admin / Developer in prod: lands on the overview, which reads every list ONCE; the case table reuses it and reads no step until Show steps (then exactly the page's open items); import, edit, a config row deleted with ONE call (`DATAFORM_DELETE_ITEM`) and nothing after; a created row read once; an open point deleted with ONE admin REST DELETE; back on the overview nothing is read, the count is one fewer; Refresh reads every list once |
| `dev-plain-delete` (26 Oct; 27 Oct the case cascades) | RMM + Admin / Developer (dev, flow Admin): ZZT-0003's "Delete case" lists what belongs to it per flow (the counts of the emulated Kissflow), found with no list read again and nothing of the app read but the drawer's read (the portal searched by its REST admin routes); code typed; every item deleted once, ONE call each, children first and the case LAST, ≥ ~400 ms apart, nothing else sent (no read-back); Kissflow holds nothing of the case; Close closes the drawer, the row leaves the table, the overview's case and audit counts drop without a read; the Orphans page finds none; a review of ZZT-0005 is still deleted with ONE call; RMM: no "could not be read", no ZZT-0003 |
| `dev-case-delete-portal-refused` (27 Oct) | `portal=refuse`: ZZT-0001's plan names its portal request by id ("admin console"), counts the app's items only; the run deletes them (case last, nothing read back); the request stays in the portal |
| `dev-bulk-delete` (26 Oct; 27 Oct cases) | audit events (46 rows, 2 pages of 25): five chosen, "Delete selected (5)": one call each, ≥ ~400 ms apart, nothing read; 429 twice on the third → the dialog and the shell say the console waits, then ~1 s and ~2 s, and it goes on; a 429 with Retry-After 120 s pauses the run with the plain text ("Kissflow is limiting requests right now. Wait a minute, then try again."), Continue finishes it; a run stopped after its first delete leaves four, still chosen; then ZZT-0001 and ZZT-0005 chosen on the cases' table: the lists not read yet read once each; "the 2 cases and their N related items, T items in all", totals per flow and per case; "2" typed; one case after the other, each children first and its case last, ≥ ~400 ms apart, nothing read; both gone from Kissflow and the table |
| `dev-orphans` (26 Oct) | `gone=AppZZT-0005` (the case item deleted alone): RMM's load says "1 case could not be read in full" (the problem replayed); the Orphans page lists one group, ZZT-0005, case item deleted, counts per flow; "Delete these N items": typed code, children first, each read back as deleted, PACED (≥ ~400 ms apart); the group leaves the page without a new scan ("No orphans"); RMM no warning |
| `ba-suppliers` (P2) | add contact → `DATAFORM_UPDATE_ITEM` with `Table::Contacts` + an audit row |
| `rmm-empty`, `rmm-new-case` | create payload has every M field + 6 payload fields; submit; `case.created` row; no ms |
| `rmm-activate` | the case in review → Review creates for RMM + depts, submitted; second load creates nothing |
| `saf-review` | (28 Oct) RMES row created header-only on first open (no `Table::` key, one "RMES record created" audit row); the RMES tab shows ZZT-0001's 8 fields with their sources, read only, nothing of the criteria RMES; a source opens its section; the bar's "Record the decision" opens the decision card on the Questionnaire tab; decision, complete → update (counts, RMES_Gaps 0) then submit; audit rows; no RMES item read |
| `rmes-sheet` (28 Oct) | Safety and Regulatory see the same sheet of ZZT-0003 (values from the fixture case); Safety without the viewer route gets the unreadable notice instead of the fields; RMM and QM have no RMES tab, RMM's case page no RMES |
| `saves-no-reload`, `decision-kept-on-failure`, `reload-kept`, `complete-fresh` (28 Oct) | the decision save reads no list again; a refused rejection keeps its choice and reason; the RMES list refused on Reload keeps the record; the RMES list refused at Complete refuses it, read again a legacy row with an open criterion and finding does not block |
| `qm-raise-accept` | raise → OP create with `Raiser_Assignee`, submit; `__kfSet` I-4; reload shows "answered"; accept → update + submit; `op.accepted`; hand-off pending |
| `qm-return-edit-close` | with `SET` webhooks configured: return → `Round_No` 2 + POST `op.round`; edit; close → Withdrawn + submit |
| `last-review-release` | the last department's completion writes `review.completed` only: no `release.requested` row or POST from a department (M2) |
| `rmm-release` | every review completed live → RMM's load writes one `release.requested` row + one POST (key `REL-<case item>-R<round>`); a second load sends nothing |
| `cus-readonly`, `auditor`, `owner` | K7 landing, a note → form create; audit trail; reports; no other writes |
| `read-refusals` | admin/byId refused → snapshot data + case banner + Diagnostics rows; no page error |
| `mentions` (27 Oct) | `colleagues=1`: after the load, 11 role reads + the account's users (12 GETs, none a write); RMM on ZZT-0003's Internal notes types "@": the list shows Ingrid Nolte (QM, named only by the role members) and the other members, never the writer or the portal user in the RMM role; "@Ingr" → one; picked, saved: the note row names her, the toast "Note added. 1 colleague notified by e-mail.", ONE mail by fetch to her (subject, plain-text body, the app's home); the chip; Diagnostics "ready" |
| `mentions-refused` (27 Oct) | `colleagues=refuse`: the 12 reads refused, the load stands; "@" shows "Colleagues can't be listed for your role here."; "@Ingrid" → only that line; Diagnostics "unlisted" with Kissflow's refusal |
| `stale-op`, `write-refused`, `container-guard`, `multi-role` | refusal toast + reload; danger toast and no audit row; zero writes; the picker switches persona and the reads change |

Report: `dist-applive/harness-report.json`, screenshots `dist-applive/harness-*.png`; every scenario adds "no page errors".

### 7.3 package.json scripts to add (E; the only shared edit)

```
"dev:applive": "vite -c vite.applive.config.ts --port 5340 --open /app-live.html",
"build:applive": "tsc -b && vite build -c vite.applive.config.ts && node scripts/zip-applive.mjs",
"test:applive": "vitest run src/app-live",
"harness:applive": "node scripts/harness-applive.mjs",
"gate:applive": "npm run typecheck && npm test && npm run build:applive && npm run harness:applive"
```
**Gate** = `npm run gate:applive`: typecheck, the whole vitest suite (the portal's included), build + zip guards (≤5 MB, no `x-access-key`, build stamp, deny-list [code scripts/workbench-deny.mjs:8-12]; a hit inside shared screens is reported to the integrator, not "fixed" by editing them), and the harness N/N. Ports in use: 5310, 5320, 5330 [doc reader B §5].

### 7.4 Zip and deploy

- **Zip:** `index.html` + `manifest.json` = `{"Category":"Application","Framework":"React"}` → `dist-applive/ciq-app-ui-<sha10>.zip` + `latest.txt`.
- **`deploy-app-live-ui.mjs` (written, NOT run):**
  - reads `prototype/dist-applive/latest.txt`;
  - re-runs the deny-list on `zip/index.html`;
  - refuses without `--approved`;
  - then spawns `node deploy-workbench-ui.mjs <zip>`, which needs no code change: it fixes `CIQ_Digital_A00` and takes the zip from argv [code kissflow-build/ciq-digital/deploy-workbench-ui.mjs:13-16]; component `CCEK4Jhdt04g` [live deploy-report.json];
  - `--check` passes through.
- **Deploy needs Thomas's fresh explicit OK** [MEMORY auto-mode guard]. It replaces the old v4 Workbench, live `ciq-workbench-ui-235af550b4.zip`, of which no local copy exists [doc reader C §0].
- URL: `/view/application/CIQ_Digital_A00/ui`.

---

## 8. Risks and morning tests (Thomas, with real users per role)

| # | Test / risk | Why | If it fails |
|---|---|---|---|
| R-1 | **Can a non-admin role read a CIQ Case item through the SDK?** Look at Diagnostics: admin / byId / mine rungs per flow | Reviewers and RMM need the answers. RMM is not an assignee after Start; process lists for viewers 404 [doc master.md §3.6]. Without it, every role except Case administrator sees no answers | quickest: add internal users to Case administrator (Admin = full reads; over-privileged, a decision for Thomas); or a shared report + its read route; or I-2 also copies the answers onto CIQ Review items (plan change, portal session) |
| R-2 | `getMyTasksItems` lists role-assigned review steps for a role member and field-assigned OP steps (`Raiser_Assignee`) | the key route got "moved out of your queue" at a role-assigned step [live walk-v6-result.json w1] | no reviewer can complete. Re-check assignment; the fallback is field-assigning the dept step from a MultiUser field |
| R-3 | SDK `updateItem` at dept steps writes E fields (Open_Count, Thread_JSON, OP_Outcome, Closed_*) | the key route got 050313 on E fields [live walk-v6-result.json w2] | the point and review flows stall; inspect the step permissions in the builder |
| R-4 | Mandatory/ReadOnly enforcement on the SDK submit (Review_Gate, OP_Outcome) | not enforced on the key route (G-7) | the UI gates already cover it; record the result |
| R-5 | Form create+submit via the SDK (Audit, Note, RMES with child rows); Viewer `getItems` (Auditor/BO on Audit, RMM on Supplier); BA updates rows the API key created | never observed live for this app [doc reader C §1f] | no history/index → the snapshot fallback breaks; audit is the backbone |
| R-6 | User/MultiUser write shape `{_id}` / `[{_id}]` through the SDK | [unverified] | Raiser_Assignee missing → the point gets no assignee |
| R-7 | ~~`portalRequestItemId` is unknown to roles that can't read the case → every hand-off from them is `pending`~~ | resolved 20 Oct | hand-offs send app item ids only (`caseItemId` from the index or the audit rows, `opItemId`); the integrations read the target from Kissflow |
| R-8 | ~~`release.requested` payload mismatch~~ | resolved 20 Oct | `{caseItemId}`; the integration sets Release_Contacts from the case |
| R-9 | Webhook POST from the custom UI: Kissflow webhooks send no CORS headers but take a `text/plain` POST whose body is the JSON text (portal session, 20 Oct) | transport | `fetch` with `mode: "no-cors"`, `Content-Type: text/plain` first (an opaque answer counts as sent); `kf.api` (JSON string body, `application/json`) only when that fetch throws (a CSP, offline); never both |
| R-10 | Role membership: add one test user per role; multi-role picker; AppRoles carry the role ids | G-17 | — |
| R-11 | I-1/I-2/I-3/I-4 actually fire (Case submit → portal request; completeness → `Case_Phase` Review + 15 fields; OP Start → CIQP Query; respond → `Response_*` + `OP_Progress` "In progress") | integrations not switched on yet | the cases stay in supplier-input; points never get answered |
| R-12 | Live CIQ Supplier rows exist with `Contacts_Portal_User_Id` | `caseStartPayload` refuses without one [code caseStartPayload.ts:102] | BA adds the supplier; Thomas creates portal users |
| R-13 | ID races: case code (max+1), `OP_Key`, `Note_Key`, Review_Key duplicates under concurrent users | ids come from visible counts [code domain/actions.ts:198,767] | detected on read (suffix + warning) |
| R-14 | Opening portal attachments from the app | cross-container [doc plan-v6 §4.2] | names only |
| R-15 | Deploy overwrites the v4 Workbench with no local rollback zip | [doc reader C §0] | rebuild Workbench (`a653362394`, never deployed) if needed |
| R-16 | ~~`planRmesCriteria` relies on `confirmCompleteness` accepting the synthetic case~~ Closed 28 Oct: the record is created header-only, without criteria | [decision] | — |
| R-17 | The console's Orphans page reaches the supplier portal by kf.api with `_application_id=CIQ_Supplier_Portal_A00` (26 Oct) | [unverified] from the app's frame (the REST routes work with an API key); a deleted form row's and portal item's read-back answers are assumed | the dialog lists the portal items with their ids to delete in the portal's admin console; a read-back that answers otherwise stops the run with Kissflow's text |
| R-18 | A Kissflow 429 reaches the frame as status 429 or a "429" / "Too Many Requests" text (`isRateLimited`), maybe with a Retry-After (26 Oct, the console's backoff) | [unverified] how the SDK host and kf.api report a rate limit to the custom UI | the console shows Kissflow's text inline without backing off; the paced bulk delete (400 ms apart, 2 calls in flight) still keeps the rate low |
| R-19 | The @mention colleagues (27 Oct): may a CIQ role read `GET /app_role/2/{acc}/{roleId}` and `GET /user/2/{acc}` by kf.api as the signed-in user, and do the role's Members carry `Email`? | [unverified] as the user (both proven with an API key only); the mail body is plain text, the hook's other mails send HTML [unverified how "Mail Integration - Thomas" shows a plain-text Body] | Diagnostics' "Colleagues for @mentions" card shows each read; refused → the list says "Colleagues can't be listed for your role here." and only the people the load names can be mentioned |
