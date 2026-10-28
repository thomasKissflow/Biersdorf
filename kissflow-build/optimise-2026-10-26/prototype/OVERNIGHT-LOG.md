# Overnight build of the clickable prototype (13 → 14 Oct 2026)

Thomas's brief, 13 Oct, 22:58 IST, demo on 14 Oct end of day:
- The localhost prototype must have exactly the screens of the final app, for every role, finalised.
- It must cover all edge cases. It has no backend.
- Keep only the tabs the final app needs, and remove repeated ones.
- Write tests, including end-to-end tests.
- In the morning the prototype must hold no data: only the role holders and one supplier. Thomas creates the case in the demo.

## Thomas's answers (13 Oct, before sleep)

- **Start state:** the role holders plus ONE supplier with its contacts. There are no cases.
  - Suppliers are a data master, imported and ready to use. There is no onboarding flow.
  - The app keeps a UI to view the suppliers and add new ones.
  - The supplier is fictional (CLAUDE.md rule).
- **Kept:** Reports + audit trail (Business owner and Auditor roles), Admin configuration (Admin role), and the Supplier help page.
- **Removed:** the "Our understanding" page from the app menu. The client page `/#/understanding/call` and its artifact build stay.
- **Open-point e-mails:** an inbox per person. Raising, answering, editing and closing an open point each send one mail.
- **Final PDF:** an on-screen document only, created automatically at the supplier's final release.

## Binding decisions this build follows

- **The process:** `context/decisions/2026-10-09-client-call.md`, with D-1 to D-3, R-1 and R-2, and the assumption answers of 12 Oct.
- **AS-08:** the person who raised an open point can edit, change or close it. Every change reaches the supplier's portal view.
- **AS-12:** the PDF is automatic at release. It holds every open-point thread as text, without attachments.

## Plan

| # | Phase | Status |
|---|---|---|
| P1 | Inventory and gap analysis: current screens against the final app; requirements mapping, duplicates, edge-case catalogue | done (`overnight/p1/*.json`) |
| P2 | `FINAL-APP-SPEC.md`: the screen inventory per role, flows and edge cases (written by the main session) | done |
| P3 | Domain and data: empty start, supplier master, dynamic supplier contacts, open-point edit and close, inbox, final document, domain tests | done |
| P4 | Screens in parallel: supplier portal, RMM and supplier master, reviews, admin/reports/layout | done; gate green |
| P5 | Gate plus an end-to-end harness from the empty start, for every role and the edge cases | done (13/13, 1279 checks) |
| P6 | Adversarial review (several lenses), fixes, and the gate again | done (2 rounds, 88 findings, 87 fixed) |
| P7 | Morning: empty data verified, screenshots, `DEMO-GUIDE.md`, memory updated | done |

**Gate:** `npm run typecheck && npm test && npm run build && npm run build:portal && node scripts/harness-portal.mjs`, plus the new prototype end-to-end harness.

**Rules:**
- Never edit `src/workbench`.
- Portal (`src/portal`) changes must keep the portal harness green.
- No Kissflow calls.
- Backup before changes: `scratchpad/backup-pre-overnight/`.

## Run log

- 22:58: brief received, questions answered, check-in cron set (it resumes after usage limits).
- 23:03: P1 started. Workflow `wf_67c4f14e-c38`, script `~/.claude/projects/-Users-thomas-Documents-Kissflow-Projects-POC-Beiersdorf-prototype/9266c591-0569-4b0c-8f6b-ff391fa10dff/workflows/scripts/ciq-final-app-inventory-wf_67c4f14e-c38.js`. Backup is in `scratchpad/backup-pre-overnight/`.
- 23:20: P1 done (6 analysts, 385 items, kept in `overnight/p1/`). `FINAL-APP-SPEC.md` written; it settles the analysts' conflicts, and §7 lists the defaults for Thomas.
- 23:22: P3+P4+gate started as workflow `wf_d3a9e8af-c4f`, script `~/.claude/projects/-Users-thomas-Documents-Kissflow-Projects-POC-Beiersdorf-prototype/9266c591-0569-4b0c-8f6b-ff391fa10dff/workflows/scripts/ciq-final-app-build-wf_d3a9e8af-c4f.js`. To resume: Workflow({scriptPath, resumeFromRunId: "wf_d3a9e8af-c4f"}).
- 00:40: P3+P4 done. Gate green: typecheck, 413 tests in 26 files, build, build:portal, portal harness 15/15 (118 checks). A smoke run opened 36 pages on the empty start with no errors. Notes from the agents are in the workflow journal. P5+P6 (end-to-end harness plus a 6-lens review and fixes) start next.
- 00:45: P5+P6 started as workflow `wf_68e983f7-d2d`, script `~/.claude/projects/-Users-thomas-Documents-Kissflow-Projects-POC-Beiersdorf-prototype/9266c591-0569-4b0c-8f6b-ff391fa10dff/workflows/scripts/ciq-final-app-verify-wf_68e983f7-d2d.js`. To resume: Workflow({scriptPath, resumeFromRunId: "wf_68e983f7-d2d"}).
- 01:20: P5 end-to-end harness `scripts/harness-prototype.mjs` (`npm run harness:prototype`) written and green: 13/13 scenarios (S0 empty start, S1 full demo flow, S2–S12 edge scenarios), 1222 checks, against the built `dist`, a fresh browser context per scenario, View as + data-testid. Bugs it found and fixed (unit tests in `src/domain/harnessFindings.test.ts`): a document sent as the answer to a query on a non-file question overwrote that question's answer with the document id; the final document's header and the case overview ignored the manufacturer and production site the supplier answered; the supplier could edit the trade name, supplier name, DUNS and contact e-mails that Beiersdorf sets at case start; the browser tab title said "Prototype"; a contact who may not confirm on a case where nobody may confirm was told "another contact" can. Full gate green (typecheck, 418 tests, build, build:portal, portal harness 15/15, prototype harness 13/13).
- 02:58: the weekly usage limit (reset 02:30) had stopped 2 of the 6 reviewers and the fix pass. Resumed `wf_68e983f7-d2d` (task w2qt15mlo); the harness and 4 reviews come from the cache (3, 5, 11 and 21 findings).
- 03:55: the second resume also hit a session limit (reset 03:50), and the resume's prefix cache re-ran all six reviews. The 4 completed reviews were recovered from the journal (40 findings, 3 high) into `scratchpad/p6-findings-recovered.json`. A new run `wf_bc00aea3-9e0` (task we5xxvggo, script `…/workflows/scripts/ciq-final-app-review-fix-wf_0cd40bf8-69a.js`) runs the 2 missing lenses (demo walkthrough, spec conformance), then one fixer for all findings (recovered file plus new), then the full gate including the prototype harness. To resume: Workflow({scriptPath, resumeFromRunId: "wf_bc00aea3-9e0"}).
- 04:58: P6 fix pass done (one fixer, all 64 findings: the 40 recovered from the four earlier lenses plus 24 from the demo-walkthrough and spec-conformance lenses; backup in `scratchpad/backup-pre-p6fix/`). Highlights:
  - Supplier view: no field-matrix IDs (shown only with the notes toggle), no "Pre-filled by RMM", chapters without field content read "Documents only" with an upload; "Welcome back" only for a returning contact; a deactivated contact's window stays on the supplier side.
  - Customs and Legal land on a full K7/K8 card (meaning, documents, questions, notes with a note box), one informed mail each with a deep link.
  - Final document: units on numbers, the SF-01…SF-12 metadata answers, evidence only of the sections it holds.
  - Domain: every open finding blocks; the RMES record follows Part 2 (late MOAH criterion, limit checks); adding a section needs an open own review; the responsible person belongs to the point's department; the GEN contact e-mails follow the case contacts; reactivation needs a justification; refused attempts on closed cases are logged; Part 2 growth mails the open lead track.
  - Cancelled cases show unfinished tracks as "Ended"; Reports never show "0 d" and same-day answers count; Rules page says "Agreed with Beiersdorf" / "Not in the requirements"; change reports show on the completed case with "Start a new case" (pre-filled).
  - Live portal (old flow) keeps its earlier file question, task wording, release card, not-found text and home tiles; the admin preview now uses old-flow requests.
  - Harness extended (S1 greeting, informed links, K7 card and note, same-day Reports, Cases empty tab, final-document units and metadata; S2 late MOAH criterion; S6 ended tracks and the reactivation justification; S8 two windows on deactivation; S11 follow-up case; copy scan for "template chapter", "0 d" and supplier-visible field IDs). Unit tests in `src/domain/reviewRound.test.ts`.
  - Gate green: typecheck, 433 tests in 28 files, build, build:portal, portal harness 15/15 (118 checks), prototype harness 13/13 (1267 checks).
- 05:00: P6 done. 2 more lenses (24 new findings, 3 high) plus the 40 recovered, so 64 in total, all fixed, none skipped. Gate green: typecheck, 433 tests in 28 files, build, build:portal, portal harness 15/15 (118), prototype harness 13/13 (1267 checks). Green snapshot saved in `scratchpad/green-0500/`. Next: a short second review round (fresh demo walkthrough, final-app fidelity, regression check on tonight's fixes), then P7 hand-over.
- 05:05: round 2 started as `wf_d71f9d56-6ef` (task whvs8blv9, script `…/workflows/scripts/ciq-final-app-round2-wf_d71f9d56-6ef.js`): 3 fresh lenses, then a fixer, then the gate. If it is not done or not green by about 07:15, restore `scratchpad/green-0500/src` and go to P7.
- 05:54: round 2 done. 24 findings (4 high), 23 fixed and 1 skipped (rem-6 stays, per spec §0). The rule-named evidence is now real upload slots (FLD-K1-004…010), the View-as menu shows the suppliers second, the owner matrix fits, Reports export gives a CSV, and more. Snapshots: `scratchpad/green-round2fix`, `scratchpad/backup-pre-round2fix`.
- 06:00: SCHEMA raised to 8, so all state saved during tonight's testing is dropped in every browser. Final gate green: typecheck, 440 tests in 30 files, build, build:portal, portal harness 15/15 (118), prototype harness 13/13 (1279). The dev server on 5310 shows the empty start (0 cases, 0 mails, Solvaro with Elena and Ravi, 11 internal people, no invariant violations). `DEMO-GUIDE.md` written. Notes added to PARITY.md. Check-in cron removed. **Done.**
- 06:40: Thomas ran `harness-prototype S1 --headed`: a visible browser asks for /favicon.ico, which was missing (headless never asks, so the gate missed it). Added an inline SVG tab icon in index.html; the harness server now names any 404 path. S1 headed passes, and all 13/13 pass headless.
- 12:35 (14 Oct): Thomas: supplier maintenance is for the Business administrator only. Done in `wf_aa0669b8-5a1` (RMM reads only, domain guard, harness S0/S8/S9/S11). Gate green: 441 unit tests, prototype harness 13/13 (1340 checks).
- 12:40: Thomas: "build the editor before the demo", for both rules and questionnaire, easy to use. Spec §8 added to FINAL-APP-SPEC.md. Workflow `wf_4ac9a2e9-df9` (task w07ugwldo, script `…/workflows/scripts/ciq-config-editor-wf_4ac9a2e9-df9.js`) runs domain → admin editor + version-scoped fields → harness S13 → 2 reviews → fix → gate. Snapshot before the editor: `scratchpad/green-pre-editor/`. If it is not green in time for the demo, restore that snapshot (its gate was green).
- 14:25: configuration editor done (`wf_4ac9a2e9-df9`): rules as data (proven the same as before over about 4,600 answer sets), versions held in the app's data, fields resolved per version, draft bar and version history, rule form, section and question forms with preview, Check & publish. 19 review findings: 17 fixed, 2 got copy changes. Gate green: 531 tests, portal harness 15/15, prototype harness 14/14 (1514 checks; new S13). SCHEMA 9, empty start verified in the pane. Still open: owners are not per version (a changed lead applies to running cases too), the undefined-origin list is fixed, and the basis labels and default need Thomas to confirm.
- 14:45: Thomas: "Ask for evidence" in the rule form showed no documents (they appeared only as a browser autocomplete while typing). Now the 15 known documents are tick-able chips with a selected count, plus a "Not in the list?" field for any other document (with the warning when no question collects it). Gate green: 531 tests, portal 15/15, prototype 14/14 (1514).
- 14:55: Thomas: handle custom evidence ("a child table with the field name and attachments"). Workflow `wf_c84330cd-aa0` (task wtksmazvh) builds Requested documents: an upload slot per uncollected rule document, mandatory, with cannot-provide, a blocker, reviewer status and a final-document entry; the admin form shows an info line instead of the warning. The last green state before it is the 14:45 state (evidence chips); the gate log is in `scratchpad/gate-evidence.log`.
- 17:15: requested documents done (`wf_c84330cd-aa0`): each rule document that no question collects becomes a mandatory upload slot (in the rule's first section, or K1), with cannot-provide, blockers, reviewer and RMM status, and the final document; the admin form shows an info line. The verifier's 3 edge bugs are fixed. Gate green: 548 tests, portal 15/15, prototype 15/15 (1625 checks; new S14). The live check in the pane shows the info line for "Test", and nothing was saved (draft still 26 rules, 0 cases).
- 17:55: Thomas's fixes: New case search always shown (it also finds contacts and the city; a contact filter appears for more than 3 contacts); Edit case contacts removed from the case page; the SF-12 = No waiver box sits right under the question; plain wording for suppliers (no SF codes; requested-doc reasons quote the question); the arsenic above-limit note has "Write the justification" (jumps to and focuses the box) and the box is highlighted until filled in. Gate green: 548 tests, portal 15/15, prototype 15/15 (1625). Each fix was checked live in the pane, and the pane was reset to the empty start.
- 18:00: Thomas: tidy up the internal Questionnaire tab, fix the misaligned supplier icon on attributions, and add @mentions in internal notes with an e-mail to the tagged person. Workflow `wf_ff82d015-3ec` (task we44cgjtu). The 17:55 state was green (gate log `scratchpad/gate-fixes.log`).
- 18:10: Thomas: removed the "E-mails sent" view from the case History tab (HistoryTab.tsx, display only; the inboxes still hold every mail). Done while `wf_ff82d015-3ec` runs; no agent of it owns HistoryTab, and its fix agent's gate will include this change.
- 18:20: Thomas: "Fingerprint" renamed to "Document seal" with the green check (FinalDocumentTab badge "Document seal: unchanged", the explanatory line, the footer seal plus code; Overview "Sealed at the final release"; History line). Harness S1/S11 checks adjusted. Still to do after `wf_ff82d015-3ec`: the domain audit text and RMM mail body (actions.ts) and the admin mail template still say "fingerprint".
- 19:05: `wf_ff82d015-3ec` done: internal Questionnaire tab reorganised (summary and filters, grouped navigator, focused section cards, aligned answer rows), the supplier attribution icon fixed (Attribution component), @mentions in internal notes (case tab, review panel, K7/K8 box) with one note-mention mail per tagged colleague. 20 review findings, 19 fixed. Then I renamed the last "fingerprint" texts (history entry, RMM mail, admin template) to "document seal". Final gate green: 567 tests, portal 15/15, prototype 16/16 (1708 checks; new S15).
- 19:15: Thomas: an inline duplicate-code check, and independent versions (only the changed side of rules or questionnaire gets a new number). Workflow `wf_b02a975f-3f6` (task wbdva6win). The 19:05 state was green (`scratchpad/gate-final.log`).
- 20:10: `wf_b02a975f-3f6` done. Inline duplicate-code check (normalised: case, spaces, Annex/A, leading zeros; every version incl. retired; Save disabled; same guard in the domain). Independent releases: only the changed side gets a new number (rules only / questionnaire only / both); "Nothing to publish" is a blocking check; per-side numbering; plain-word draft bar and history; Test rules labels fixed. Gate green: 578 tests, portal 15/15, prototype 17/17 (1833 checks; new S16).
- 20:20: Thomas: plan the Kissflow build (read-only; fix the data model for every process and dataform, use the correct objects and connections, a write-up for him to validate; build tonight after his OK). Asked the App Builder - CIQ Digital session for a read-only status (to `kissflow-build/ciq-digital/STATUS-2026-10-14.md`). 4 read-only research agents are running: live app inventory, live portal inventory, Kissflow facts, prototype requirements (outputs in `kissflow-build/plan-v5/`). The plan will go to `docs/kissflow-data-model/plan-v5-final.md`.
