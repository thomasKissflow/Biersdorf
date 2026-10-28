# PREVIEW (updated 2026-10-07 night, graph rev 31, snapshot v2)

> **Supersedes the rev-29 manifest below.** Dry run `build --no-pages` at rev 31: **224 artifacts, 0 errors** (2 orphan-connector warnings on the integration shells). Log: `runs/ciq-digital-v4/preview-rev31.log`.
> - 3 processes (CIQ Case, CIQ Open Point, CIQ Change Request), 8 forms, 22 lists, 13 roles (Admin and User reused), 176 permission grants.
> - **2 integrations, Z1 and Z2 only, as empty switched-off shells** (D31). Z3/Z4 are deferred to the later integrations list. Integrations are not built now (Thomas).
> - 0 pages, 0 nav (`--no-pages`).
> - Apply side effects not shown in the dry run (D35): the connecting developer is added to every role, and "All Items" report View grants are created.

# Preview: ciq-digital-v4 → CIQ_Digital_A00 (dry run, 2026-10-07)

**Inputs**
- Graph revision 29; snapshot **v1**.
- `verify`: 0 errors.
- `build --no-pages`: **226 artifacts, 0 errors**. The 4 warnings are the known orphan-connector warnings on the integrations.
- Conformance with v4: 9/9 PASS.
- Coherence pass 5: PASS-WITH-ISSUES, no defects.

**Would be CREATED** (the test flows "CIQ ZZ Spike …" are left untouched)

| Type | Flow | Fields | Child tables | Steps |
|---|---|---|---|---|
| Process | CIQ Case | 125 | — | 15, including the parallel "Part 2 – Beiersdorf review" (6 branches) |
| Process | CIQ Open Point | 53 | Rounds (10) | 9 |
| Process | CIQ Change Request | 49 | — | 8, including the parallel "Assess impact" (5 branches) |
| Form | CIQ Supplier | 11 | Contacts (8) | — |
| Form | CIQ Config Version | 21 | — | — |
| Form | CIQ Section | 32 | Components (9) | — |
| Form | CIQ Scope Run | 18 | — | — |
| Form | CIQ RMES Safety | 10 | Safety_Criteria (33), Safety_Findings (5) | — |
| Form | CIQ RMES Regulatory | 10 | Regulatory_Criteria (33), Regulatory_Findings (5) | — |
| Form | CIQ Internal Note | 10 | — | — |
| Form | CIQ Audit Event | 31 | — | — |

**Also created:**
- **22 lists:** CIQ AI State, Actor Side, CR Outcome, Config Kind, Config State, Confirm, Contact Role, Country Code, Decision, Department, Event Category, Impact Resolution, OP Kind, OP Outcome, OP Progress, RMES Part, RMES Result, Release Stage, Review Dept, Round Outcome, Supplier Kind, Yes No.
- **11 custom roles** (Admin and User are reused): CIQ RMM; the CIQ Regulatory, Safety, QM, Microbiology and Sustainability Reviewers; CIQ Overall Approver; CIQ Business Admin; CIQ Reader; CIQ Case Admin; CIQ Integration Service.
- **176 grants.**
- **4 integrations** (App Builder creates them incomplete; they are finished over REST and switched on by Thomas):
  - Z1: case completed → PDF, e-mails, notification event.
  - Z2: case cancelled → neutral e-mail.
  - Z3 and Z4: SLA breaches → audit event.
- **No pages and no nav.**

**Can't be undone:** published processes and flows can't be deleted over REST, and integrations can't be deleted over the API. Edits after generate go through REST patches, as proven on the test flows.

**After generate (REST and by hand):**
- Read back every id.
- Finish Z1–Z4, then Thomas switches them on.
- Grant flow Admin to CIQ Case Admin.
- Reset step-owner roles to Member ["View"].
- Set the per-step send-back, reject and e-mail switches.
- Set SLA durations (BDF).
- Hand the ids and contract to the portal session (once Thomas approves).
