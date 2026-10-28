# Beiersdorf CIQ — Glossary

Terms, abbreviations and IDs used across the client documents. Source codes used in citations are listed at the bottom.

## Business terms

| Term | Meaning |
|---|---|
| **BDF** | Beiersdorf (client). "BSS HAM" in the author field = Beiersdorf Shared Services, Hamburg. |
| **CIQ** | Cosmetic Ingredient Questionnaire. Beiersdorf's questionnaire for collecting quality, safety and regulatory information on purchased raw materials. The 2026 edition has 8 main chapters (K1–K8) and 14 annexes (A1–A14; A14 has been folded into K2). |
| **CIQ case / CIQ project** | One instance of the process for one raw material from one supplier. The PDF says "case", the requirements matrix says "project". |
| **IRMA** | The CIQ case type started by RMM ("initiate an IRMA CIQ case"). The functional catalogue also mentions **RMT** as a process. The acronyms are never expanded; ask what they stand for. |
| **RMM** | Raw Material Management. Today the single intermediary between Beiersdorf departments and the supplier; starts cases. |
| **RMES** | Raw Material Evaluation Sheet. Internal (never supplier-visible) structured record where Safety and Regulatory document their review (Parts A–D). Not a questionnaire and not an approval step. |
| **Part 1 / Part 2** | Part 1 = supplier data and document collection up to **Supplier Approval**. Part 2 = Beiersdorf technical review in parallel department subprocesses. |
| **Supplier Approval / completeness confirmation (PS-05)** | The supplier confirms it has submitted everything. This is **not** a Beiersdorf approval of the raw material. It fixes the review version. |
| **Subprocess completion (PS-10)** | A department confirms its review is done and no query is open. This is **not** a raw-material approval. |
| **Final CIQ release (PS-11, matrix only)** | The supplier's final confirmation, after all departments have completed, that the data is correct and complete. It freezes the CIQ. |
| **Overall CIQ approval (PS-12, PDF only)** | Beiersdorf's final approve/reject of the case. The responsible role is "to be decided". |
| **Configuration questions (SF-01…SF-12)** | The basic answers the supplier gives first. A rule set (the configuration table or control table) derives which chapters, annexes and evidence are mandatory, optional or not applicable. "The questionnaire is generated, not selected." |
| **Configuration table / control table / rule set** | Business-maintained, versioned rule set mapping configuration answers to scope. The binding version does not exist yet (OP-19). |
| **Scope derivation** | System evaluation of the metadata against the rule set, producing the case-specific CIQ scope. |
| **Open point** | Any query, document request, subsequently activated CIQ part or finding. Status is open, in progress or closed (shown as a traffic light). |
| **Query / additional-document request** | A reviewer's contextual question or document request to the supplier, linked to a section, field, table row, document version or finding. |
| **Finding** | An RMES issue linked to a criterion and source, classified as blocking or non-blocking. |
| **B-Flow** | Beiersdorf document management system (DMS); target repository for filing. |
| **Teamcenter (TC, TC RM)** | Siemens PLM system. "Preceding system": today RMM documents results there; a future trigger source and status-feedback target. |
| **SAP MDG** | SAP Master Data Governance (supplier/material master). |
| **IKW** | German Cosmetic, Toiletry, Perfumery and Detergent Association. Its 2019 supplier questionnaire is the public industry template (shared as a sample, not Beiersdorf's own). |

## Regulatory and technical terms in the CIQ

| Term | Meaning |
|---|---|
| **INCI** | International Nomenclature of Cosmetic Ingredients name. |
| **IUPAC** | Chemical name, used if no INCI name exists. |
| **CAS No.** | Chemical Abstracts Service registry number (format nnnnnnn-nn-n with a check digit). |
| **EC number** | EINECS/ELINCS/NLP number (EU inventory). |
| **DUNS** | 9-digit Dun & Bradstreet company identifier; the key supplier search field. |
| **SDS / CoA** | Safety Data Sheet / Certificate of Analysis. |
| **REACH (EU / UK / Turkey KKDIK)** | Chemical registration regulations. **SVHC** = substance of very high concern; Annex XIV = authorisation, Annex XVII = restriction. **Only representative** = a non-EU or non-UK manufacturer's legal representative. |
| **Reg. 1223/2009** | EU Cosmetics Regulation. Annexes III–VI cover restricted substances, colorants, preservatives and UV filters. Art. 11(2)(e) covers animal testing; Art. 19(g) covers labelling. |
| **SPM** | Synthetic polymer microparticles (REACH restriction). |
| **MOAH / PAH** | Mineral-oil aromatic hydrocarbons / polycyclic aromatic hydrocarbons; contaminants with Beiersdorf limits. |
| **BSE/TSE** | Animal-origin safety certificate. "Annex II entry 419" is the Reg. 1223/2009 entry on animal by-products. |
| **RSPO** | Roundtable on Sustainable Palm Oil. Supply-chain models are Mass Balance, Segregated and Identity Preserved; Mass Balance is the minimum for palm. |
| **EUDR** | EU Deforestation Regulation (traceability). |
| **SisGen** | Brazilian genetic heritage registry (Brazilian Biodiversity Law). **ABS / Nagoya** = access and benefit sharing. |
| **IECIC / NMPA** | China inventory of existing cosmetic ingredients / China's National Medical Products Administration. |
| **Prop 65** | California Proposition 65 list. **Canada Hot List** = Canadian list of restricted cosmetic ingredients. |
| **CCU** | Carbon Capture and Utilisation (an origin type). |
| **GMP / ISO** | Manufacturer certification (supplier-level, not material-level; reuse across cases is open, OP-17). |
| **HS code / CITES** | Customs tariff code / endangered-species convention (K7 Customs). |

## ID schemes

| Prefix | Meaning | Where |
|---|---|---|
| PS-00…PS-13 | Process steps (**the two documents number them differently**) | ReqDoc §2.1, BRM col B |
| REQ-CFG / REQ-PROC / REQ-CTL / REQ-ADR | Business requirements (configuration / process / cross-cutting control / additional-document requests) | BRM |
| REQ-RMES-001…020 | RMES review requirements | ReqDoc §7 |
| K1…K8.1 | CIQ main chapters | ReqDoc §4.1 |
| A1…A14 | CIQ annexes | ReqDoc §4.2 |
| SF-01…SF-12 | Configuration questions | ReqDoc §5.3 |
| FLD-xxx | Field IDs (FLD-GEN = general, FLD-VER = verification, FLD-2.1 = components, FLD-2.3 = origin, FLD-A1 = Annex 1, …) | FLM |
| OP-xx / NEW-xx | Open points (OP = Beiersdorf's own numbering, NEW = added in the Knowledge Baseline) | ReqDoc, KB |
| R-xx, Q-xxx, D-xx, BD-xx | Config rules, question inventory, evidence documents, basic-data fields | KB |
| CIA #1…#34 | Functional screening catalogue items (with Kissflow's answers) | CIA |

## Citation codes

- **ReqDoc**: `CIQ Business process requirements MVP_ v2.0.pdf`
- **BRM**: `CIQ_Business_Requirements_Matrix_MVP.xlsx`
- **FLM**: `CIQ_Field_Level_Requirements_Matrix_v0.6_EN.xlsx` (sheets: "CIQ new version", "Notes & change log", "Feldkatalog (Feldebene)")
- **KB**: `CIQ_Knowledge_Baseline.xlsx`
- **CIA**: `CIA_requirements_catalog_FULL_EN_complete_09062026.xlsx` (functional screening, with Kissflow's answers)
- **VQ**: `Vendor_Initial_Screening_Questionnaire_CIQ.xlsx` (non-functional screening, with Kissflow's answers)
- **IKW**: `Sample taken from internet so not Beiserdorf_Lieferantenfragebogen.pdf`
