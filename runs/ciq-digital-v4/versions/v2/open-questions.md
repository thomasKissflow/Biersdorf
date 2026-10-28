# Open questions — run ciq-digital-v4 (kf-ba, stage brief, graph revision 2)

These are the only real ambiguities in brd.md. Each one has a default that PART A or v4 implies, and the pipeline goes ahead on that default unless Thomas overrides it.

## Q1 · Z3/Z4 are named in PART A but missing from v4 §4
PART A L38 says to model "Z3/Z4 (SLA breach → audit event) as in v4 §4". v4 §4 (L289-L301) lists only Z1/Z2. Z3/Z4 are defined only in PART D L1307, which says "CIQ Case / CIQ Open Point SlaBreached → create P7 Notification event".
**Default:** model Z3 (CIQ Case) and Z4 (CIQ Open Point) as "SLA breached → create a CIQ Audit Event row, category Notification". The target is F8 CIQ Audit Event, not v3's P7. They are created incomplete and finished over REST.

## Q2 · Is "Finding" still an Open Point kind?
v4 lists the kinds as query, document request, additional part, department review, contact update and internal review (L224-L234). Findings now live in the RMES child table Findings, with a "linked open point" (L282). PART D L869/L1212 still lists "Finding" as a kind.
**Default:** "Finding" is not an Open Point kind, so the list has 6 values. A supplier question that comes from a finding is a Query, and the Findings row links to it.

## Q3 · Who writes CIQ Audit Event: the sync service alone, or people without Delete?
v4 L285 recommends a single writer (CIQ Integration Service) and offers "writers without Delete, tamper-evident" as the alternative. A3 L66 fixes the claim as "tamper-evident". v4 also has people's sessions writing events: cancellation (L216), change attempt (L270), configuration publish (L279) and hold override (L190).
**Default:** internal roles and CIQ Integration Service create F8 rows as members without Delete, and the claim is "tamper-evident". kf-security-designer owns the grant.

## Q4 · Does "Safety only (Reviewer and Approver)" on F5 include an approver?
v4 L282 says "Reviewer and Approver". A3 L64 removed the Safety/Regulatory approver roles.
**Default:** only CIQ Safety Reviewer edits CIQ RMES Safety, and only CIQ Regulatory Reviewer edits CIQ RMES Regulatory. Every other role is a Viewer, the CIQ Overall Approver included. The word "Approver" at L282 is left over from v3.

## Q5 · What triggers Z2?
PART A L38 says "Z2 (case rejected / cancellation → neutral e-mail)". PART D L1306 triggers it on the audit Cancellation event. v4 L216 always writes an F8 Cancellation event, and a Form trigger is verified live (L405).
**Default:** Z2 fires when a CIQ Audit Event row is created with category Cancellation, and e-mails the neutral text to the recipients on that row. An overall rejection reaches End, so Z1 handles it and sends the neutral Supplier_Closing_Text (L1305).

## Q6 · Y1/Y3/Y4/Y5 "approve" the waiting steps, but the account key can't act after Start
v4 (L185, L187, L192, L245) has the Y integrations approve the waiting step. PART A L58/L406 says the account key can't act after Start.
**Default:** the Y integrations use the native Process connector action "Approve an item" (L312). That action is unverified (K-09) and the portal session builds it. If it fails, RMM submits the waiting step by hand, with a typed guard (L782). Whatever happens, the waiting steps stay human steps owned by CIQ RMM.

## Q7 · Can CIQ Reader post internal notes?
CIQ Reader is "read-only" (L147), but v4 L284 lets "every internal role" write CIQ Internal Note. The PART D grant (L1274) gives Reader E on Internal Note.
**Default:** yes, Reader may post notes. On workflow flows it stays read-only.

## Q8 · Who refreshes the case's open-item counts between the PS-11 step and "Open items check – before close"? (kf-data-architect)
`Hold_For_Open_Items` reads `Open_Items_Count` and `Open_CR_Count` (D10). RMM writes them at "Open items check – before release request". After that, only "Waiting for supplier: final release PS-11" (step 7) comes before step 8, and Y5 completes step 7 without a Workbench. So a point opened during step 7 isn't counted, and step 8 is skipped.
**Default:** the workflow makes both counts Editable at step 7, and RMM's Workbench (or the sync service, before Y5 approves) refreshes them. Otherwise, Y5 blanks them, so step 8 always runs as a check. kf-workflow-designer and kf-integration-analyst to choose.

## Q9 · Values of the Findings "state" and the RMES limit comparator (kf-data-architect)
v4 L282 names a finding "state", and PART D names `Limit_Comparator`/`Limit_Pass`, but neither gives the values. Both are Text (`Findings_State`, `Criteria_Limit_Comparator`), and `Criteria_Limit_Pass` is a Yes/No written by the session. No list was added beyond the 21.
**Proposed:** Findings state = Open / Closed. Comparator = `<`, `<=`, `=`, `>=`, `>`. Then `Criteria_Limit_Pass` can become a formula, and a per-row `Findings_Open_Blocking` = `IF(Findings_Blocking="Yes",IF(Findings_State="Closed",0,1),0)` can be added. Thomas or BDF to confirm.
