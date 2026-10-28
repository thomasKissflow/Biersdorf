# Beiersdorf CIQ: discovery knowledge base (index)

**Status:** discovery only, no build. Prepared 2026-10-05 for the first client call (2026-10-06) with Beiersdorf's consultant.
**Internal:** these notes contain Kissflow positioning and risk notes. Don't send them to the client as they are.

## Where to start

| If you need… | Open |
|---|---|
| The short brief for the call | Claude Docs brief (link in chat) and `../deliverables/` |
| **Client decisions from the 9 Oct call (supersede older designs)** | [decisions/2026-10-09-client-call.md](decisions/2026-10-09-client-call.md) |
| Terms, acronyms, ID schemes and citation codes | [00-glossary.md](00-glossary.md) |
| How the process is expected to run (happy path, statuses, loops) | [analysis/01-expected-workflow.md](analysis/01-expected-workflow.md) |
| Modules and data model | [analysis/02-modules-and-data-model.md](analysis/02-modules-and-data-model.md) |
| Users, roles and who sees what | [analysis/03-user-base-and-access.md](analysis/03-user-base-and-access.md) |
| Where the client documents contradict each other or leave gaps | [analysis/04-contradictions-and-gaps.md](analysis/04-contradictions-and-gaps.md) |
| Edge cases: process and lifecycle | [analysis/05-edge-cases-process-lifecycle.md](analysis/05-edge-cases-process-lifecycle.md) |
| Edge cases: data, configuration, security, audit | [analysis/06-edge-cases-data-config-security.md](analysis/06-edge-cases-data-config-security.md) |
| Internal: Kissflow fit, delivery risk, promise audit, winning strategy | [analysis/07-kissflow-fit-and-delivery-risk.md](analysis/07-kissflow-fit-and-delivery-risk.md) |
| Question bank: business consultant | [analysis/10-questions-business-consultant.md](analysis/10-questions-business-consultant.md) |
| Question bank: tech / solution consultant | [analysis/11-questions-tech-consultant.md](analysis/11-questions-tech-consultant.md) |
| Question bank: tech / platform / non-functional | [analysis/12-questions-tech-platform.md](analysis/12-questions-tech-platform.md) |
| Ranked call plan (call 1, call 2, written follow-up, documents to request) | [analysis/13-call-plan-ranked-questions.md](analysis/13-call-plan-ranked-questions.md) |

## Source notes (one per client file; every item has a citation)

| # | Note | Original file | What it is |
|---|---|---|---|
| 01 | [sources/01-requirements-document-v2.md](sources/01-requirements-document-v2.md) | `CIQ Business process requirements MVP_ v2.0.pdf` | The main business requirements document (14 pages, 16 Sep 2026, owner A. Pevzner): process steps PS-01 to PS-13, CIQ structure K1–K8 and A1–A14, configuration questions SF-01 to SF-12, REQ-RMES-001 to 020 |
| 02 | [sources/02-business-requirements-matrix-mvp.md](sources/02-business-requirements-matrix-mvp.md) | `CIQ_Business_Requirements_Matrix_MVP.xlsx` | 51 MVP requirements with acceptance criteria. **These are effectively BDF's test scripts** |
| 02b | [sources/02b-business-requirements-matrix-mvp-v2-changes.md](sources/02b-business-requirements-matrix-mvp-v2-changes.md) | `CIQ_Business_Requirements_Matrix_MVP_v2.xlsx` | **v2 (6 Oct 2026, after call 1): supersedes 02.** No review version, the supplier edits until the final release, the scope only grows, documents are additive with an upload date, there's an internal chat, and a new T-shirt sizing column for vendors to fill |
| 03 | [sources/03-functional-screening-catalogue-with-kissflow-answers.md](sources/03-functional-screening-catalogue-with-kissflow-answers.md) | `CIA_requirements_catalog_FULL_EN_complete_09062026.xlsx` | 34 functional screening items with **Kissflow's submitted answers** |
| 04 | [sources/04-nonfunctional-screening-questionnaire-with-kissflow-answers.md](sources/04-nonfunctional-screening-questionnaire-with-kissflow-answers.md) | `Vendor_Initial_Screening_Questionnaire_CIQ.xlsx` | Non-functional screening with **Kissflow's submitted answers** |
| 05 | [sources/05-field-level-requirements-matrix-v0.6.md](sources/05-field-level-requirements-matrix-v0.6.md) | `CIQ_Field_Level_Requirements_Matrix_v0.6_EN.xlsx` | Field-level spec (newest BDF file, 2 Oct 2026). It covers general data, metadata and Annexes 1, 2 and 4, so it is probably the MVP test scope. Includes the old German Feldkatalog |
| 06 | [sources/06-knowledge-baseline-gap-sheet.md](sources/06-knowledge-baseline-gap-sheet.md) | `CIQ_Knowledge_Baseline.xlsx` | **Kissflow's own internal gap sheet** (confirmed by Thomas, 2026-10-06; not a Beiersdorf document, never cite it to the client). Covers open questions on config questions, sections, rules, questions, evidence and open points; answer columns are empty |
| 07 | [sources/07-ikw-2019-sample-supplier-questionnaire.md](sources/07-ikw-2019-sample-supplier-questionnaire.md) | `Sample taken from internet so not Beiserdorf_Lieferantenfragebogen.pdf` | Industry-standard IKW 2019 questionnaire (not Beiersdorf's), mapped to the CIQ chapters |

**Not a client file:** `Refrences_Shared_By_Client/Kissflow-App-Builder-Setup-Guide.pdf` is Kissflow's internal setup guide for the App Builder plugin, added 2026-10-07. Don't cite it to BDF.

## Raw text dumps (lossless, for verification)

`raw/`: every Excel cell with its Excel row number, plus hidden columns, data validations and comments. PDFs are dumped page by page.

## Citation codes

ReqDoc = requirements PDF · BRM = business requirements matrix · FLM = field-level matrix (+ Feldkatalog) · KB = Knowledge Baseline · CIA = functional screening · VQ = non-functional screening · IKW = industry sample · MM = Kissflow master manual (`~/Downloads/master.md`)
