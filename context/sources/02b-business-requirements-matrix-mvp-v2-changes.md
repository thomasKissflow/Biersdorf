# Business Requirements Matrix MVP: v2 changes (2026-10-06)

- **File:** `CIQ_Business_Requirements_Matrix_MVP_v2.xlsx`. Last modified 2026-10-06 15:41 by Pevzner, Alexander, the day of call 1. Raw dump: `context/raw/CIQ_Business_Requirements_Matrix_MVP_v2.md`.
- **Supersedes** `02-business-requirements-matrix-mvp.md` (v1) wherever the two differ. v1 had 51 requirements; v2 has 50: 47 MVP and 3 "MVP partial scope" (unchanged: REQ-PROC-021, -022, -024).
- **New column I, "T-Shirt Sizing"** (empty for every requirement). It replaces v1's empty "Open question / comment" column. The Legend sheet now defines the sizes:

| Size | Effort |
|---|---|
| XS | < 0.5 day, standard functionality (switch on / set parameters) |
| S | 0.5–1 day, simple configuration (field, form, role, notification) |
| M | 2–3 days, configuration with logic (conditions, workflow, dashboard) |
| L | 4–5 days, complex configuration or small script / low-code extension |
| XL | > 5 days, custom code or integration ("please comment") |

**(inferred)** BDF expects the vendors to fill in a size per requirement.

## Removed
- **REQ-CFG-007** "Adjust scope manually". Its content moved into REQ-CFG-008: authorised departments extend the scope with a mandatory justification, marked as a manual override and audited.

## Changed (substance)

| Req | v1 | v2 |
|---|---|---|
| REQ-CFG-001 | Versioned template, running cases keep their version | **+ every published configuration is saved as a retrievable version and is exportable as a file** (documented, reused, restored as a workaround) |
| REQ-CFG-003 | Versioned rule set | **+ every rule-set version is saved permanently and stays retrievable**; cases display the version used |
| REQ-CFG-006 | Section responsibility configurable **and versionable**, incl. lead **and co-reviewing departments** | Configurable by the business, "including the leading department (lead)". "Versionable" and "co-reviewing" were removed from the requirement, **but the acceptance criterion still says "QM as co-reviewer"** (inconsistent) |
| REQ-CFG-008 | Re-derive on change, show added parts, difference list, notify departments | **The supplier can edit metadata and configuration answers until the final release (PS-11).** Every change re-derives the scope automatically. New parts become supplier tasks. **The scope only grows, never shrinks:** activated sections stay even if no longer derived. Manual extension by departments (ex-REQ-CFG-007) |
| REQ-CFG-009 | Removed sections' data kept in history, restored on revert | **No section is ever removed**, so all entered data stays present and editable |
| REQ-PROC-007 | Metadata change after PS-05 triggers a scope-impact check | It **triggers the re-derivation**; no change after the final release |
| REQ-PROC-011 | Upload at the question, overview by chapter | **+ in every chapter; uploads stay possible during the review; the overview shows the upload date** |
| **REQ-PROC-016** | **Review version fixed at PS-05**; historical data restorable | **"Data and documents remain editable during the review (no review version)."** BDF departments never enter or change CIQ data. After PS-05 the supplier can still change fields and upload new documents in every chapter (PS-06…PS-10). **No technical versioning:** a changed value replaces the old one, and the old one need not be restorable. A new document is **added** next to the existing ones, with its upload date. Every change is traceable through the audit trail (REQ-PROC-031). BDF roles have no edit rights on CIQ fields |
| REQ-PROC-020 | Internal communication area | **An internal chat-like channel between departments** per case (optionally linked to a section or finding), chronological with author and time, never visible to the supplier |
| REQ-PROC-021 | RMES record created with the CIQ **version** | Created with the CIQ **project ID** and timestamp |
| REQ-PROC-022 | Source reference to question, document, **version** | Source reference to question or **document with upload date** |
| REQ-PROC-029 | Query references a document **incl. version** | References a document **by file name and upload date**. **Suppliers cannot delete uploaded documents.** Document versioning is not required |
| REQ-PROC-033 | Full history incl. document versions | History with referenced documents and upload dates. **No upload in the chat:** documents are uploaded only in the CIQ section and referenced from the conversation |
| REQ-PROC-034 | Status change records the **evidence version** | Records the **document (file name and upload date)** |
| REQ-PROC-036 | Open points shown as blockers in the dashboard | **+ a project-level dashboard** of all CIQ projects showing open points per project, with click-through to the project |
| REQ-CTL-009 | Reconstruct who assessed what, when, on which **source version** | …**on the basis of which data value and which document (file name and upload date)** |

## Effect on our open points
- **Answered:**
  - C-04 / AS-03 (what the supplier may change after submission): **everything, until the final release.**
  - C-17 / E-D-17 (extend or reduce): **extend only.**
  - E-P-36 (what a review version is): **there is none.**
  - E-D-21/22 (removed sections): **never removed.**
- **Simplified:** document model (additive, upload date, no supplier delete); section ownership (lead only); internal discussion (chat).
- **New tension with the requirements PDF chapter 7 (RMES):** REQ-RMES-001, -005, -012 and -016 still speak of versions and of reopening a completed criterion when its source changes. v2 says no versioning; changes are traced in the audit trail and shown to the affected departments (REQ-PROC-031).
