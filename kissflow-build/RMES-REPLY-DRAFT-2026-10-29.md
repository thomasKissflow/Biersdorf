Subject: CIQ MVP: RMES with the 8 fields from your e-mail

Hello [name],

Thank you for the RMES scope. We have built the RMES as you described it, for your tests. Below is what it shows, plus five short questions.

**What the RMES shows**

The RMES is one internal sheet. It holds the 8 fields from your screenshots and nothing else, and every value is filled automatically from the CIQ. Each field names the CIQ field it comes from, so reviewers can open that question from the sheet.

| RMES field | Filled from (field-level matrix v0.6) |
|---|---|
| Raw material / tradename | FLD-GEN-001 Trade name |
| Supplier | FLD-GEN-002 Supplier (name) |
| Manufacturer | FLD-GEN-004 Manufacturer (name & address), exactly as the supplier answered it |
| INCI | FLD-2.1-001, one row per K2.1 component, in the supplier's order |
| % | FLD-2.1-007 Concentration range, shown as the range (e.g. "10–20 %"), or as one value when minimum and maximum are equal |
| CAS # | FLD-2.1-002 ("—" when empty) |
| EC # | FLD-2.1-003 (it may hold a REACH registration number; "—" when empty) |
| Origin information of the single components | Source of origin: FLD-2.3-01 of the component. Free text: the specification field that the matrix names for that origin (FLD-2.3-11 to -16; for vegetable and animal origin, FLD-2.1-101 Part(s) used and FLD-2.3-10 Country of origin) |

If the supplier answered "cannot provide" with a justification, the sheet shows that justification. An empty field reads "Not answered yet".

We left out the fields that are not yellow: Process ID / RMT ID / IRMA ID and Declaration. The criteria, limit checks, AI suggestion and findings that we showed earlier are removed.

**Who sees it**

Only Product Safety and Regulatory Affairs reviewers see the RMES, on an "RMES" tab in their review. Both departments see the same sheet. RMM and the other departments do not see it. Suppliers have no access to it in any form: it is not in the supplier portal, in any e-mail or in the final document.

**It follows the CIQ until the final release**

The sheet always shows the current CIQ data. If the supplier corrects an answer or the composition during the review, the RMES shows the new value straight away, with no copying. After the supplier's final release the CIQ is frozen, so the RMES no longer changes.

**Five questions for you**

1. **Free text of the origin.** We use the specification field that the matrix names for each origin. For vegetable and animal origin, that is Part(s) used plus Country of origin. Did you mean these fields, or FLD-A1-102 Feedstock?
2. **Per component or per origin type.** The CIQ asks these free texts once per origin type, not once per component. Two components of the same origin therefore show the same text, and so do a vegetable and an animal component, because the CIQ asks Part(s) used and Country of origin once for both. A note on the sheet says so. Is that enough for the MVP, or do you need the free text per component? Per component would mean a new column in the supplier's K2.1 table.
3. **%.** The CIQ asks a concentration range, so the RMES shows the range. Is that right, or does the RMES need one value, for example the maximum?
4. **Safety and Regulatory decision.** We kept each department's Approved/Rejected decision, with a reason for a rejection, as the decision of its review. It sits outside the RMES, because REQ-PROC-021 says the RMES is not an approval step. A rejection is still flagged to RMM, who decides whether the case continues or is cancelled. Do you want to keep this decision in the MVP, or should Safety and Regulatory simply complete their review?
5. **RMES download.** Do you need the RMES as a download, for example in Excel or PDF? Today it is a screen only.

Best regards,
[name]
