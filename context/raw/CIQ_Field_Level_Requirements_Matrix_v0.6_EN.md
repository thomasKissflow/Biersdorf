# RAW DUMP: CIQ_Field_Level_Requirements_Matrix_v0.6_EN.xlsx

Source: `Refrences_Shared_By_Client/CIQ_Field_Level_Requirements_Matrix_v0.6_EN.xlsx` — lossless cell dump (generated). Row numbers = Excel rows.

## Sheet: CIQ new version  (dims A1:M56, state=visible)
- HIDDEN rows: [] cols: ['B']
- DATA VALIDATION list on E2:E56: "Text,Number,Number (decimal),Number+Unit,Text/Number,Yes/No,Checkbox,Checkbox+Number,Radio button,Single-select,Multi-select,Dropdown,Date,Table (repeatable),File upload"
- Autofilter: A1:M56

| Row | A | B | C | D | E | F | G | H | I | J | K | L | M |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | CIQ Process Part | CIQ Requirement ID | Field ID | Field / Column | Field Type | Mandatory | Validation / Format | Dependent (Yes/No) | Controlled by | Controls | Auto-Fill / Default | Upload Required | Approval |
| 2 | Process Start | REQ-PROC-001; REQ-PROC-005 | FLD-GEN-001 | Trade name | Text | Mandatory | Free text; trade name of the raw material | No | n/a | No | Can be pre-filled by RMM at case creation | No | RMM |
| 3 | Process Start | REQ-PROC-001; REQ-PROC-104 | FLD-GEN-002 | Supplier (name) | Text | Mandatory | Free text (supplier name) | No | n/a | No | Auto-fill from Teamcenter master data possible (post-MVP, REQ-PROC-104) | No | RMM |
| 4 | Process Start | REQ-PROC-001; REQ-PROC-003 | FLD-GEN-008 | Contact person e-mail | Text | Mandatory | E-mail format (validation); pre-filled automatically from supplier master data | Yes | Supplier master data | Supplier access and task notification (REQ-PROC-003) | Yes – from supplier master data | No | RMM |
| 5 | Process Start | REQ-PROC-003; REQ-CTL-012 | FLD-GEN-009 | Contact person e-mail 2 | Text | Optional | E-mail format (validation); manual entry possible | No | n/a | Additional recipient of notifications (if filled) | Can be pre-filled from contact data | No | RMM |
| 7 | Meta Data | REQ-PROC-001; REQ-PROC-005 | FLD-GEN-003 | Supplier's DUNS number | Text/Number | Mandatory | 9-digit DUNS; format check | No | n/a | No | Auto-fill from master data | No | RMM |
| 8 | Meta Data | REQ-CFG-105 | FLD-GEN-004 | Manufacturer (name & address) | Text | Mandatory | Free text / address block | No | n/a | No | Auto-fill from master data possible | No | RMM |
| 9 | Meta Data | REQ-CFG-105 | FLD-GEN-005 | Production site (name & address) | Text | Mandatory | Free text / address block | No | n/a | No | Auto-fill from master data possible | No | RMM |
| 10 | Meta Data | REQ-PROC-005 | FLD-2.1-001 | INCI (European) / IUPAC | Text | Mandatory | INCI name; if no INCI: chemical name (IUPAC); for colorants additionally Colour Index no. | No | n/a | No | No | No | RMM |
| 11 | Meta Data | REQ-PROC-005 | FLD-2.1-002 | CAS No. | Text/Number | Optional | CAS format nnnnnnn-nn-n (check digit); validated only if filled | No | n/a | No | No | No | RMM |
| 12 | Meta Data | REQ-PROC-005 | FLD-2.1-003 | EC number | Text/Number | Optional | EINECS/ELINCS/NLP or REACH registration no.; validated only if filled | No | n/a | No | No | No | RMM |
| 13 | Meta Data | REQ-PROC-005 | FLD-2.1-004 | Additive? (yes/no) | Yes/No | Mandatory | Boolean (Yes/No) | No | n/a | Additional information on additives (per field catalogue) – follow-up fields still open in the new layout | No | No | RMM |
| 14 | Meta Data | REQ-PROC-005 | FLD-2.1-005 | Function of component | Text | Mandatory | Free text, e.g. preservative, solvent | No | n/a | No | No | No | RMM |
| 15 | Meta Data | REQ-PROC-005 | FLD-2.1-007 | Concentration range [%] | Number+Unit | Mandatory | 0–100 %; range min–max allowed; min ≤ max | No | n/a | No | No | No | RMM |
| 16 | Meta Data | REQ-PROC-006; REQ-CFG-103 | FLD-2.3-01 | Source of origin | Radio button | Mandatory | Bio Mass (vegetable) | No | n/a | FLD-2.1-101 (Part); FLD-2.3-10 (Country of origin); Annex 1, 2, 3, 9, 10, 11, 12 | No | No | RMM |
| 17 | Meta Data | REQ-PROC-006; REQ-CFG-103 | FLD-2.3-01 | Source of origin | Radio button | Mandatory | Animal | No | n/a | FLD-2.1-101 (Part); FLD-2.3-10 (Country of origin); Annex 10, 11, 12 | No | Yes – BSE/TSE certificate; confirmation entry no. 419 | RMM |
| 18 | Meta Data | REQ-PROC-005 | FLD-2.1-101 | Part | Multi-select | Conditional mandatory | Bark, Bean, Flower, Fruit, Fruit Pulp, Germ, Kernel, Leaf, Nut, Peel, Rhizome, Root, Seed, Shell, Shoot, Skin, Tree, Trunk, Wool, no entry | Yes | FLD-2.3-01 = Bio Mass (vegetable) or Animal | No | No | No | RMM |
| 19 | Meta Data | REQ-PROC-005 | FLD-2.3-10 | Country of origin | Text | Conditional mandatory | Free text (country); mandatory if visible; multiple countries | Yes | FLD-2.3-01 = Bio Mass (vegetable) or Animal | Annex 1 – Country of origin (auto-fill) | No | No | RMM |
| 20 | Meta Data | REQ-PROC-006; REQ-CFG-103 | FLD-2.3-01 | Source of origin | Radio button | Mandatory | Petrochemical | No | n/a | FLD-2.3-11 (Fossil specification); Annex 1, 4, 9, 10, 11, 12 | No | No | RMM |
| 21 | Meta Data | REQ-PROC-005 | FLD-2.3-11 | Fossil specification | Text | Conditional mandatory | Free text, e.g. oil, wax, gas; mandatory if visible | Yes | FLD-2.3-01 = Petrochemical | No | No | No | RMM |
| 22 | Meta Data | REQ-PROC-006; REQ-CFG-103 | FLD-2.3-01 | Source of origin | Radio button | Mandatory | Mineral | No | n/a | FLD-2.3-12 (Mineral specification); Annex 1, 7, 10, 11, 12 | No | No | RMM |
| 23 | Meta Data | REQ-PROC-005 | FLD-2.3-12 | Mineral specification | Text | Conditional mandatory | Free text, e.g. talc, mica; mandatory if visible | Yes | FLD-2.3-01 = Mineral | No | No | No | RMM |
| 24 | Meta Data | REQ-PROC-006; REQ-CFG-103 | FLD-2.3-01 | Source of origin | Radio button | Mandatory | CCU (Carbon Capture Utilisation) | No | n/a | FLD-2.3-13 (CCU specification); no annexes | No | No | RMM |
| 25 | Meta Data | REQ-PROC-005 | FLD-2.3-13 | CCU specification | Text | Conditional mandatory | Free text; mandatory if visible | Yes | FLD-2.3-01 = CCU | No | No | No | RMM |
| 26 | Meta Data | REQ-PROC-006; REQ-CFG-103 | FLD-2.3-01 | Source of origin | Radio button | Mandatory | Polymer | No | n/a | FLD-2.3-14 (Polymer specification); Annex 1, 6, 10, 11, 12 | No | No | RMM |
| 27 | Meta Data | REQ-PROC-005 | FLD-2.3-14 | Polymer specification | Text | Conditional mandatory | Free text; mandatory if visible | Yes | FLD-2.3-01 = Polymer | No | No | No | RMM |
| 28 | Meta Data | REQ-PROC-006; REQ-CFG-103 | FLD-2.3-01 | Source of origin | Radio button | Mandatory | Waste / Side stream | No | n/a | FLD-2.3-15 (Waste specification); no annexes | No | No | RMM |
| 29 | Meta Data | REQ-PROC-005 | FLD-2.3-15 | Waste / side stream specification | Text | Conditional mandatory | Free text; mandatory if visible | Yes | FLD-2.3-01 = Waste / Side stream | No | No | No | RMM |
| 30 | Meta Data | REQ-PROC-006; REQ-CFG-103 | FLD-2.3-01 | Source of origin | Radio button | Mandatory | Chemical recycling of post-consumer plastic | No | n/a | FLD-2.3-16 (Chemical recycling specification); no annexes | No | No | RMM |
| 31 | Meta Data | REQ-PROC-005 | FLD-2.3-16 | Chemical recycling specification | Text | Conditional mandatory | Free text; mandatory if visible | Yes | FLD-2.3-01 = Chemical recycling of post-consumer plastic | No | No | No | RMM |
| 32 | Meta Data | REQ-PROC-005 | FLD-A1-102 | Feedstock | Text | Mandatory | Free text, e.g. sunflower, palm, soy | No | n/a | No | No | No | RMM |
| 33 | Meta Data | REQ-PROC-005 | FLD-2.1-102 | Natural origin index | Number (decimal) | Mandatory | 0–1 (decimal, max. 2 decimals) | No | n/a | No | No | No | RMM |
| 34 | Meta Data | REQ-PROC-005 | FLD-A1-103 | Content [%] in INCI | Number | Mandatory | 0–100 %; based on molecular weight (CIQ Annex 1) | No | n/a | No | No | No | RMM |
| 35 | Meta Data | REQ-PROC-005 | FLD-A1-104 | Content [%] in raw material | Number | Mandatory | 0–100 % | No | n/a | No | Consistency check against concentration range (FLD-2.1-007) | No | RMM |
| 37 | Manufacturing process | REQ-PROC-005 | FLD-A2-101 | INCI (European) / IUPAC | Text | Mandatory | Pre-filled from Meta Data field FLD-2.1-001 (INCI / IUPAC); editable | Yes | FLD-2.1-001 (pre-fill) | No | Yes – from FLD-2.1-001 | No | RMM |
| 38 | Manufacturing process | REQ-PROC-005 | FLD-A2-102 | Manufacturing process | Single-select | Mandatory | Chemical | No | n/a | No | No | No | RMM |
| 39 | Manufacturing process | REQ-PROC-005 | FLD-A2-102 | Manufacturing process | Single-select | Mandatory | Physical | No | n/a | No | No | No | RMM |
| 40 | Manufacturing process | REQ-PROC-005 | FLD-A2-102 | Manufacturing process | Single-select | Mandatory | Enzymatic | No | n/a | No | No | No | RMM |
| 41 | Manufacturing process | REQ-PROC-005 | FLD-A2-102 | Manufacturing process | Single-select | Mandatory | Biotechnology / Fermentation | No | n/a | Annex 3 (GMO), if GMO – outside test scope | No | No | RMM |
| 42 | Manufacturing process | REQ-PROC-005 | FLD-A2-102 | Manufacturing process | Single-select | Mandatory | Other | No | n/a | FLD-A2-103 (Manufacturing process – individual) | No | No | RMM |
| 43 | Manufacturing process | REQ-PROC-005 | FLD-A2-103 | Manufacturing process (individual) | Text | Conditional mandatory | Free text, e.g. hydrolysis, refining, synthesis, fermentation; mandatory if visible | Yes | FLD-A2-102 = Other | No | No | No | RMM |
| 45 | Annex 1 | REQ-PROC-005; REQ-PROC-010 | FLD-A1-201 | Pesticides analysis available | Yes/No | Mandatory | Radio Yes/No; Yes → upload mandatory, No → reason mandatory | Yes | FLD-2.3-01 = Bio Mass, Mineral, Petrochemical or Polymer (Annex 1 active) | FLD-A1-202 (upload, if Yes); FLD-A1-203 (reason, if No) | No | No (upload in FLD-A1-202) | Regulatory |
| 46 | Annex 1 | REQ-PROC-010 | FLD-A1-202 | Pesticides – analysis (upload) | File upload | Conditional mandatory | PDF; mandatory if FLD-A1-201 = Yes | Yes | FLD-A1-201 = Yes | No | No | Yes | Regulatory |
| 47 | Annex 1 | REQ-PROC-005 | FLD-A1-203 | Pesticides – reason if not present | Text | Conditional mandatory | Free text; mandatory if FLD-A1-201 = No | Yes | FLD-A1-201 = No | No | No | No | Regulatory |
| 48 | Annex 1 | REQ-PROC-006; REQ-CFG-103 | FLD-A1-204 | Palm (kernel) oil is used as feedstock | Yes/No | Mandatory | Radio Yes/No | Yes | FLD-2.3-01 = Bio Mass, Mineral, Petrochemical or Polymer (Annex 1 active) | FLD-A1-206 (if Yes) | No | No | Regulatory |
| 49 | Annex 1 | REQ-PROC-006; REQ-CFG-103 | FLD-A1-206 | RSPO certification available | Single-select | Conditional mandatory | Mass Balance / Segregated / Identity Preserved / No RSPO certification | Yes | FLD-A1-204 = Yes | FLD-A1-207 (if "No RSPO certification") | No | No | Regulatory |
| 50 | Annex 1 | REQ-PROC-005 | FLD-A1-207 | Other certification available | Yes/No | Conditional mandatory | Radio Yes/No | Yes | FLD-A1-206 = No RSPO certification | FLD-A1-208 (if Yes) | No | No | Regulatory |
| 51 | Annex 1 | REQ-PROC-005; REQ-PROC-010 | FLD-A1-208 | Other certification (name) | Text | Conditional mandatory | Free text: name of the certification; certificate upload attached to this field | Yes | FLD-A1-207 = Yes | No | No | Yes – certificate | Regulatory |
| 53 | Annex 4 | REQ-PROC-005 | FLD-A4-101 | MOAH concentration | Number | Mandatory | Number ≥ 0; unit not defined in CIQ (assumption: mg/kg or %) | Yes | FLD-2.3-01 = Petrochemical (Annex 4 active) | No | No | No | Safety |
| 54 | Annex 4 | REQ-PROC-005 | FLD-A4-102 | Mineral oil – kinematic viscosity at 100 °C: availability | Single-select | Mandatory | Not available / Available | Yes | FLD-2.3-01 = Petrochemical (Annex 4 active) | FLD-A4-103 (if Available) | No | No | Safety |
| 55 | Annex 4 | REQ-PROC-005; REQ-PROC-010 | FLD-A4-103 | Mineral oil – kinematic viscosity at 100 °C [mm²/s] | Checkbox+Number | Conditional mandatory | Checkbox: Conclusion by analogy / Own value; number > 0, unit mm²/s (cSt) | Yes | FLD-A4-102 = Available | No | No | Yes – analytical data if a value is entered (CIQ) | Safety |

## Sheet: Notes & change log  (dims A1:G182, state=visible)

| Row | A | B | C | D | E | F | G |
|---|---|---|---|---|---|---|---|
| 1 | Legend |  |  |  |  |  |  |
| 2 | Green | Cell filled – was empty (source: CIQ 2026 Word template / field catalogue) |  |  |  |  |  |
| 3 | Orange | Cell corrected – dependency, field ID, field type, validation or option changed; old value see change log |  |  |  |  |  |
| 4 | Blue | Remark updated – resolved review notes removed, new notes added |  |  |  |  |  |
| 5 | No colour | Content unchanged (translated only) |  |  |  |  |  |
| 6 | [Review] | Open point – business decision required |  |  |  |  |  |
| 8 | General changes |  |  |  |  |  |  |
| 9 | Language | Sheet "CIQ new version" fully translated into English (sheet "Feldkatalog (Feldebene)" unchanged as historical reference) |  |  |  |  |  |
| 10 | Terminology | Mandatory column harmonised: Muss/ja → Mandatory, kann/nein → Optional, Bedingt-Muss → Conditional mandatory |  |  |  |  |  |
| 11 | Dependencies | "Controlled by" always written as <Field ID> = <value>; every dependent field references its controlling field and vice versa |  |  |  |  |  |
| 12 | Field IDs | Options of one field share one ID (FLD-2.3-01, FLD-A2-102); new IDs FLD-2.3-11 … -16 (specification fields) and FLD-A1-208 |  |  |  |  |  |
| 14 | Change log |  |  |  |  |  |  |
| 15 | Row | Field ID | Field | Column | Change type | Old value | New value |
| 16 | 3 | FLD-GEN-002 | Supplier (name) | Validation / Format | Corrected | Freitext / Adressblock | Free text (supplier name) |
| 17 | 3 | FLD-GEN-002 | Supplier (name) | Remarks / Open Points | Remark updated | Ref. Feldkatalog: FLD-GEN-002. [Review] Feldbezeichnung jetzt nur "(name)" – wo wird die Lieferantenadresse erfasst (Feldkatalog: name & address)? | Ref. field catalogue: FLD-GEN-002. [Review] Supplier address is no longer captured (field catalogue: name & address) – please confirm that it is not required. |
| 18 | 4 | FLD-GEN-008 | Contact person e-mail | Validation / Format | Corrected | wird vorbefüllt automatisch | E-mail format (validation); pre-filled automatically from supplier master data |
| 19 | 4 | FLD-GEN-008 | Contact person e-mail | Controls | Corrected | nein | Supplier access and task notification (REQ-PROC-003) |
| 20 | 4 | FLD-GEN-008 | Contact person e-mail | Remarks / Open Points | Remark updated | Neues Feld in der neuen Struktur; fachlich Nachfolger von FLD-VER-003 (Person responsible). Benannter Lieferantenkontakt erhält Zugang (REQ-PROC-003). | Primary supplier contact; receives access and task notification (REQ-PROC-003). [Review] No field for the contact person's name in the new structure – confirm (field catalogue FLD-VER-003). |
| 21 | 5 | FLD-GEN-009 | Contact person e-mail 2 | Validation / Format | Corrected | Eingabe soll möglich sein | E-mail format (validation); manual entry possible |
| 22 | 5 | FLD-GEN-009 | Contact person e-mail 2 | Controls | Corrected | Zugang & Benachrichtigung Lieferant | Additional recipient of notifications (if filled) |
| 23 | 5 | FLD-GEN-009 | Contact person e-mail 2 | Remarks / Open Points | Remark updated | Validierung E-Mail-Format ergänzen. [Review] Pflicht steht auf "kann", Feldkatalog (FLD-VER-005) und REQ-PROC-003 setzen die E-Mail aber als Basis für Zugang/Benachrichtigung = "Muss". Bitte entscheid | Optional second supplier contact. |
| 24 | 7 | FLD-GEN-003 | Supplier's DUNS number | Remarks / Open Points | Remark updated | Wichtiges Suchfeld (REQ-PROC-005). [Review] Bezeichnung enthält "(name und adresse)" – vermutlich Übernahmefehler, Feld enthält nur die DUNS-Nr. | Key search field (REQ-PROC-005). |
| 25 | 9 | FLD-GEN-005 | Production site (name & address) | Remarks / Open Points | Remark updated | Nur ein Produktionsstandort (Abstimmung Fachbereiche) – damit entfallen FLD-GEN-006/-007 (further production sites). Hinweis CIQ: weitere Standorte waren nur informativ. [Review] Tippfehler "aderesse" | Only one production site (aligned with business departments) – FLD-GEN-006/-007 (further production sites) are dropped. |
| 26 | 10 | FLD-2.1-001 | INCI (European) / IUPAC | Dependent (Yes/No) | Corrected | n/a | No |
| 27 | 10 | FLD-2.1-001 | INCI (European) / IUPAC | Controls | Corrected | nein | Pre-fill of FLD-A2-101 (INCI in Manufacturing process) |
| 28 | 11 | FLD-2.1-002 | CAS No. | Validation / Format | Corrected | CAS-Format nnnnnnn-nn-n (Prüfziffer) | CAS format nnnnnnn-nn-n (check digit); validated only if filled |
| 29 | 12 | FLD-2.1-003 | EC number | Validation / Format | Corrected | EINECS/ELINCS/NLP oder REACH-Reg.-Nr. | EINECS/ELINCS/NLP or REACH registration no.; validated only if filled |
| 30 | 13 | FLD-2.1-004 | Additive? (yes/no) | Remarks / Open Points | Remark updated | Kennzeichnet absichtlich zugesetzte Additive (CIQ-Fußnote 3). | Marks intentionally added additives (CIQ footnote 3). [Review] Either define follow-up fields or set 'Controls' to 'No'. |
| 31 | 14 | FLD-2.1-005 | Function of component | Remarks / Open Points | Filled (was empty) | – | CIQ section 2.1. |
| 32 | 15 | FLD-2.1-007 | Concentration range [%] | Validation / Format | Corrected | 0–110 %; Bereich min–max zulässig | 0–100 %; range min–max allowed; min ≤ max |
| 33 | 15 | FLD-2.1-007 | Concentration range [%] | Remarks / Open Points | Remark updated | Grundlage Grenzwert-/Sicherheitsbewertung. [Review] "0–110 %" – vermutlich Tippfehler; Feldkatalog: 0–100 %. | Basis for limit value / safety assessment. Corrected from '0–110 %' (typo). |
| 34 | 16 | FLD-2.3-01 | Source of origin | Controls | Corrected | Feld "Part"; Feld "Country of Origin"; <br>Annex 1, 2, 3, 9, 10, 11, 12<br> | FLD-2.1-101 (Part); FLD-2.3-10 (Country of origin); Annex 1, 2, 3, 9, 10, 11, 12 |
| 35 | 16 | FLD-2.3-01 | Source of origin | Remarks / Open Points | Remark updated | Please specify | CIQ 2.3 "Please specify sources/parts" = FLD-2.1-101. [Review] CIQ 2.3 allows several answers ("More than one answer is possible") – a radio button permits only one origin per component. Please confir |
| 36 | 17 | FLD-2.3-01 | Source of origin | Controls | Corrected | Feld "Part"; Feld "Country of Origin"; <br>Annex 10, 11, 12<br> | FLD-2.1-101 (Part); FLD-2.3-10 (Country of origin); Annex 10, 11, 12 |
| 37 | 17 | FLD-2.3-01 | Source of origin | Upload Required | Corrected | Nein | Yes – BSE/TSE certificate; confirmation entry no. 419 |
| 38 | 17 | FLD-2.3-01 | Source of origin | Remarks / Open Points | Remark updated | Please specify | CIQ 2.3 "Please specify sources" = FLD-2.1-101. CIQ additionally requires a BSE/TSE certificate and confirmation of entry no. 419, Annex II Reg. (EC) 1223/2009 (or BDF template). |
| 39 | 18 | FLD-2.1-101 | Part | Mandatory | Corrected | Ja | Conditional mandatory |
| 40 | 18 | FLD-2.1-101 | Part | Controlled by | Corrected | Source of origin = Bio Mass, Animal | FLD-2.3-01 = Bio Mass (vegetable) or Animal |
| 41 | 19 | FLD-2.3-10 | Country of origin | Validation / Format | Corrected | Mehrfachnennung mehrerer Ursprungsländer klären | Free text (country); mandatory if visible; multiple countries – to be clarified |
| 42 | 19 | FLD-2.3-10 | Country of origin | Controlled by | Corrected | Source of origin = Bio Mass, Animal | FLD-2.3-01 = Bio Mass (vegetable) or Animal |
| 43 | 20 | FLD-2.3-01 | Source of origin | Validation / Format | Corrected | Pertochemical | Petrochemical |
| 44 | 20 | FLD-2.3-01 | Source of origin | Controls | Corrected | Annex 1, 4, 9, 10, 11, 12 | FLD-2.3-11 (Fossil specification); Annex 1, 4, 9, 10, 11, 12 |
| 45 | 20 | FLD-2.3-01 | Source of origin | Remarks / Open Points | Remark updated | Please specify | CIQ 2.3 "Fossil (e.g. oil/wax/gas…) – please specify" = FLD-2.3-11. |
| 46 | 21 | FLD-2.3-11 | Fossil specification | CIQ Requirement ID | Filled (was empty) | – | REQ-PROC-005 |
| 47 | 21 | FLD-2.3-11 | Fossil specification | Field ID | Filled (was empty) | – | FLD-2.3-11 |
| 48 | 21 | FLD-2.3-11 | Fossil specification | Validation / Format | Filled (was empty) | – | Free text, e.g. oil, wax, gas; mandatory if visible |
| 49 | 21 | FLD-2.3-11 | Fossil specification | Controlled by | Corrected | eingeblendet, wenn FLD-2.3-01=true | FLD-2.3-01 = Petrochemical |
| 50 | 21 | FLD-2.3-11 | Fossil specification | Controls | Filled (was empty) | – | No |
| 51 | 21 | FLD-2.3-11 | Fossil specification | Auto-Fill / Default | Filled (was empty) | – | No |
| 52 | 21 | FLD-2.3-11 | Fossil specification | Upload Required | Filled (was empty) | – | No |
| 53 | 21 | FLD-2.3-11 | Fossil specification | Approval | Filled (was empty) | – | RMM |
| 54 | 21 | FLD-2.3-11 | Fossil specification | Remarks / Open Points | Filled (was empty) | – | CIQ 2.3: "Please specify". Shown only when the option is selected. |
| 55 | 22 | FLD-2.3-01 | Source of origin | Controls | Corrected | Annex 1, 7, 10, 11, 12 | FLD-2.3-12 (Mineral specification); Annex 1, 7, 10, 11, 12 |
| 56 | 22 | FLD-2.3-01 | Source of origin | Remarks / Open Points | Remark updated | Please specify | CIQ 2.3 "Mineral – please specify" = FLD-2.3-12. |
| 57 | 23 | FLD-2.3-12 | Mineral specification | CIQ Requirement ID | Filled (was empty) | – | REQ-PROC-005 |
| 58 | 23 | FLD-2.3-12 | Mineral specification | Field ID | Filled (was empty) | – | FLD-2.3-12 |
| 59 | 23 | FLD-2.3-12 | Mineral specification | Mandatory | Filled (was empty) | – | Conditional mandatory |
| 60 | 23 | FLD-2.3-12 | Mineral specification | Validation / Format | Filled (was empty) | – | Free text, e.g. talc, mica; mandatory if visible |
| 61 | 23 | FLD-2.3-12 | Mineral specification | Dependent (Yes/No) | Filled (was empty) | – | Yes |
| 62 | 23 | FLD-2.3-12 | Mineral specification | Controlled by | Filled (was empty) | – | FLD-2.3-01 = Mineral |
| 63 | 23 | FLD-2.3-12 | Mineral specification | Controls | Filled (was empty) | – | No |
| 64 | 23 | FLD-2.3-12 | Mineral specification | Auto-Fill / Default | Filled (was empty) | – | No |
| 65 | 23 | FLD-2.3-12 | Mineral specification | Upload Required | Filled (was empty) | – | No |
| 66 | 23 | FLD-2.3-12 | Mineral specification | Approval | Filled (was empty) | – | RMM |
| 67 | 23 | FLD-2.3-12 | Mineral specification | Remarks / Open Points | Filled (was empty) | – | CIQ 2.3: "Please specify". Shown only when the option is selected. |
| 68 | 24 | FLD-2.3-01 | Source of origin | Controls | Corrected | keine Annexe (nur Angabe "Please specify") | FLD-2.3-13 (CCU specification); no annexes |
| 69 | 24 | FLD-2.3-01 | Source of origin | Remarks / Open Points | Remark updated | Please specify | CIQ 2.3 "CO/CO2 via CCU – please specify" = FLD-2.3-13. No annex required. |
| 70 | 25 | FLD-2.3-13 | CCU specification | CIQ Requirement ID | Filled (was empty) | – | REQ-PROC-005 |
| 71 | 25 | FLD-2.3-13 | CCU specification | Field ID | Filled (was empty) | – | FLD-2.3-13 |
| 72 | 25 | FLD-2.3-13 | CCU specification | Mandatory | Filled (was empty) | – | Conditional mandatory |
| 73 | 25 | FLD-2.3-13 | CCU specification | Validation / Format | Filled (was empty) | – | Free text; mandatory if visible |
| 74 | 25 | FLD-2.3-13 | CCU specification | Dependent (Yes/No) | Filled (was empty) | – | Yes |
| 75 | 25 | FLD-2.3-13 | CCU specification | Controlled by | Filled (was empty) | – | FLD-2.3-01 = CCU |
| 76 | 25 | FLD-2.3-13 | CCU specification | Controls | Filled (was empty) | – | No |
| 77 | 25 | FLD-2.3-13 | CCU specification | Auto-Fill / Default | Filled (was empty) | – | No |
| 78 | 25 | FLD-2.3-13 | CCU specification | Upload Required | Filled (was empty) | – | No |
| 79 | 25 | FLD-2.3-13 | CCU specification | Approval | Filled (was empty) | – | RMM |
| 80 | 25 | FLD-2.3-13 | CCU specification | Remarks / Open Points | Filled (was empty) | – | CIQ 2.3: "Please specify". Shown only when the option is selected. |
| 81 | 26 | FLD-2.3-01 | Source of origin | Controls | Corrected | Annex 1, 6, 10, 11, 12 | FLD-2.3-14 (Polymer specification); Annex 1, 6, 10, 11, 12 |
| 82 | 26 | FLD-2.3-01 | Source of origin | Remarks / Open Points | Remark updated | Please specify | CIQ 2.3 "Polymer – please specify" = FLD-2.3-14. |
| 83 | 27 | FLD-2.3-14 | Polymer specification | CIQ Requirement ID | Filled (was empty) | – | REQ-PROC-005 |
| 84 | 27 | FLD-2.3-14 | Polymer specification | Field ID | Filled (was empty) | – | FLD-2.3-14 |
| 85 | 27 | FLD-2.3-14 | Polymer specification | Mandatory | Filled (was empty) | – | Conditional mandatory |
| 86 | 27 | FLD-2.3-14 | Polymer specification | Validation / Format | Filled (was empty) | – | Free text; mandatory if visible |
| 87 | 27 | FLD-2.3-14 | Polymer specification | Dependent (Yes/No) | Filled (was empty) | – | Yes |
| 88 | 27 | FLD-2.3-14 | Polymer specification | Controlled by | Filled (was empty) | – | FLD-2.3-01 = Polymer |
| 89 | 27 | FLD-2.3-14 | Polymer specification | Controls | Filled (was empty) | – | No |
| 90 | 27 | FLD-2.3-14 | Polymer specification | Auto-Fill / Default | Filled (was empty) | – | No |
| 91 | 27 | FLD-2.3-14 | Polymer specification | Upload Required | Filled (was empty) | – | No |
| 92 | 27 | FLD-2.3-14 | Polymer specification | Approval | Filled (was empty) | – | RMM |
| 93 | 27 | FLD-2.3-14 | Polymer specification | Remarks / Open Points | Filled (was empty) | – | CIQ 2.3: "Please specify". Shown only when the option is selected. |
| 94 | 28 | FLD-2.3-01 | Source of origin | Field ID | Corrected | FLD-2.3-05 | FLD-2.3-01 |
| 95 | 28 | FLD-2.3-01 | Source of origin | Controls | Corrected | keine Annexe (nur Angabe "Please specify") | FLD-2.3-15 (Waste specification); no annexes |
| 96 | 28 | FLD-2.3-01 | Source of origin | Remarks / Open Points | Remark updated | Please specify | Field ID corrected from FLD-2.3-05 to FLD-2.3-01 (option of the same field). No annex required. |
| 97 | 29 | FLD-2.3-15 | Waste / side stream specification | CIQ Requirement ID | Filled (was empty) | – | REQ-PROC-005 |
| 98 | 29 | FLD-2.3-15 | Waste / side stream specification | Field ID | Filled (was empty) | – | FLD-2.3-15 |
| 99 | 29 | FLD-2.3-15 | Waste / side stream specification | Mandatory | Filled (was empty) | – | Conditional mandatory |
| 100 | 29 | FLD-2.3-15 | Waste / side stream specification | Validation / Format | Filled (was empty) | – | Free text; mandatory if visible |
| 101 | 29 | FLD-2.3-15 | Waste / side stream specification | Dependent (Yes/No) | Filled (was empty) | – | Yes |
| 102 | 29 | FLD-2.3-15 | Waste / side stream specification | Controlled by | Filled (was empty) | – | FLD-2.3-01 = Waste / Side stream |
| 103 | 29 | FLD-2.3-15 | Waste / side stream specification | Controls | Filled (was empty) | – | No |
| 104 | 29 | FLD-2.3-15 | Waste / side stream specification | Auto-Fill / Default | Filled (was empty) | – | No |
| 105 | 29 | FLD-2.3-15 | Waste / side stream specification | Upload Required | Filled (was empty) | – | No |
| 106 | 29 | FLD-2.3-15 | Waste / side stream specification | Approval | Filled (was empty) | – | RMM |
| 107 | 29 | FLD-2.3-15 | Waste / side stream specification | Remarks / Open Points | Filled (was empty) | – | CIQ 2.3: "Please specify". Shown only when the option is selected. |
| 108 | 30 | FLD-2.3-01 | Source of origin | Field ID | Corrected | FLD-2.3-08 | FLD-2.3-01 |
| 109 | 30 | FLD-2.3-01 | Source of origin | Controls | Corrected | keine Annexe (nur Angabe "Please specify") | FLD-2.3-16 (Chemical recycling specification); no annexes |
| 110 | 30 | FLD-2.3-01 | Source of origin | Remarks / Open Points | Remark updated | Please specify | Field ID corrected from FLD-2.3-08 to FLD-2.3-01 (option of the same field). No annex required. |
| 111 | 31 | FLD-2.3-16 | Chemical recycling specification | CIQ Requirement ID | Filled (was empty) | – | REQ-PROC-005 |
| 112 | 31 | FLD-2.3-16 | Chemical recycling specification | Field ID | Filled (was empty) | – | FLD-2.3-16 |
| 113 | 31 | FLD-2.3-16 | Chemical recycling specification | Mandatory | Filled (was empty) | – | Conditional mandatory |
| 114 | 31 | FLD-2.3-16 | Chemical recycling specification | Validation / Format | Filled (was empty) | – | Free text; mandatory if visible |
| 115 | 31 | FLD-2.3-16 | Chemical recycling specification | Dependent (Yes/No) | Filled (was empty) | – | Yes |
| 116 | 31 | FLD-2.3-16 | Chemical recycling specification | Controlled by | Filled (was empty) | – | FLD-2.3-01 = Chemical recycling of post-consumer plastic |
| 117 | 31 | FLD-2.3-16 | Chemical recycling specification | Controls | Filled (was empty) | – | No |
| 118 | 31 | FLD-2.3-16 | Chemical recycling specification | Auto-Fill / Default | Filled (was empty) | – | No |
| 119 | 31 | FLD-2.3-16 | Chemical recycling specification | Upload Required | Filled (was empty) | – | No |
| 120 | 31 | FLD-2.3-16 | Chemical recycling specification | Approval | Filled (was empty) | – | RMM |
| 121 | 31 | FLD-2.3-16 | Chemical recycling specification | Remarks / Open Points | Filled (was empty) | – | CIQ 2.3: "Please specify". Shown only when the option is selected. |
| 122 | 32 | FLD-A1-102 | Feedstock | Controls | Corrected | n/a | No |
| 123 | 32 | FLD-A1-102 | Feedstock | Remarks / Open Points | Remark updated | Ersetzt FLD-2.1-006 (Source of origin als Text) und ist zugleich Spalte "Source / Feedstock" in Annex 1. [Review] Palm-Erkennung (RSPO, SF-08) per Freitext nicht regelbasiert auswertbar – Vorschlag: D | Replaces FLD-2.1-006 (source of origin as text) and is also column "Source / Feedstock" in Annex 1 table 1. Palm use is now captured explicitly via FLD-A1-204, so the free text does not need to be rul |
| 124 | 33 | FLD-2.1-102 | Natural origin index | Field Type | Corrected | text (Zahl) | Number (decimal) |
| 125 | 33 | FLD-2.1-102 | Natural origin index | Validation / Format | Corrected | 0-1 | 0–1 (decimal, max. 2 decimals) |
| 126 | 34 | FLD-A1-103 | Content [%] in INCI | Remarks / Open Points | Remark updated | Aus Annex 1 Tabelle 1 in den Meta-Data-Block verlagert. | Moved from Annex 1 table 1 into the Meta Data block. [Review] In the CIQ only required if Annex 1 applies (Bio Mass, Mineral, Petrochemical, Polymer); currently mandatory for all origins – please conf |
| 127 | 35 | FLD-A1-104 | Content [%] in raw material | Remarks / Open Points | Remark updated | Aus Annex 1 Tabelle 1 in den Meta-Data-Block verlagert. | Moved from Annex 1 table 1 into the Meta Data block. [Review] See FLD-A1-103. |
| 128 | 37 | FLD-A2-101 | INCI (European) / IUPAC | Controlled by | Corrected | FLD-2.1-001 | FLD-2.1-001 (pre-fill) |
| 129 | 37 | FLD-A2-101 | INCI (European) / IUPAC | Remarks / Open Points | Remark updated | Entspricht Annex 2 (Manufacturing Process), je INCI-Komponente. | Corresponds to Annex 2 (Manufacturing Process), per INCI component. [Review] In the CIQ, Annex 2 is only triggered by Bio Mass (vegetable); currently shown for all origins – please confirm. |
| 130 | 38 | FLD-A2-102 | Manufacturing process | Field ID | Corrected | FLD-A2-102.1 | FLD-A2-102 |
| 131 | 38 | FLD-A2-102 | Manufacturing process | Controlled by | Corrected | ja | n/a |
| 132 | 38 | FLD-A2-102 | Manufacturing process | Remarks / Open Points | Remark updated | Option 1 von 5 des Feldes "Manufacturing process" (Optionen Chemical bis Sonstige). [Review] CIQ Annex 2: Mehrfachauswahl (Checkboxen) – Single-Select prüfen. [Review] Spalte I steht bei Chemical, Phy | Options of field FLD-A2-102 (Chemical … Other). Field ID harmonised (formerly FLD-A2-102.1–.5) – analogous to Source of origin. [Review] CIQ Annex 2 uses checkboxes (multiple selection) – check single |
| 133 | 39 | FLD-A2-102 | Manufacturing process | Field ID | Corrected | FLD-A2-102.2 | FLD-A2-102 |
| 134 | 39 | FLD-A2-102 | Manufacturing process | Controlled by | Corrected | ja | n/a |
| 135 | 40 | FLD-A2-102 | Manufacturing process | Field ID | Corrected | FLD-A2-102.3 | FLD-A2-102 |
| 136 | 40 | FLD-A2-102 | Manufacturing process | Controlled by | Corrected | ja | n/a |
| 137 | 41 | FLD-A2-102 | Manufacturing process | Field ID | Corrected | FLD-A2-102.4 | FLD-A2-102 |
| 138 | 41 | FLD-A2-102 | Manufacturing process | Controlled by | Corrected | ja | n/a |
| 139 | 41 | FLD-A2-102 | Manufacturing process | Controls | Corrected | nein | Annex 3 (GMO), if GMO – outside test scope |
| 140 | 41 | FLD-A2-102 | Manufacturing process | Remarks / Open Points | Remark updated | CIQ: bei GMO zusätzlich Annex 3 (GMO). Spalte J steht auf "nein" – bitte prüfen (Annex 3 liegt außerhalb des Testumfangs). | CIQ: if GMO, Annex 3 is additionally required. |
| 141 | 42 | FLD-A2-102 | Manufacturing process | Field ID | Corrected | FLD-A2-102.5 | FLD-A2-102 |
| 142 | 42 | FLD-A2-102 | Manufacturing process | Validation / Format | Corrected | Sonstige | Other |
| 143 | 42 | FLD-A2-102 | Manufacturing process | Controls | Corrected | ja | FLD-A2-103 (Manufacturing process – individual) |
| 144 | 43 | FLD-A2-103 | Manufacturing process (individual) | Mandatory | Corrected | ja | Conditional mandatory |
| 145 | 43 | FLD-A2-103 | Manufacturing process (individual) | Validation / Format | Corrected | Freitext | Free text, e.g. hydrolysis, refining, synthesis, fermentation; mandatory if visible |
| 146 | 43 | FLD-A2-103 | Manufacturing process (individual) | Controlled by | Corrected | ja - "Sonstige" bei Manufacturing process | FLD-A2-102 = Other |
| 147 | 45 | FLD-A1-201 | Pesticides analysis available | Validation / Format | Corrected | Boolean; wenn true -> Upload-Feld Pflicht | Radio Yes/No; Yes → upload mandatory, No → reason mandatory |
| 148 | 45 | FLD-A1-201 | Pesticides analysis available | Controlled by | Corrected | Annex 1 aktiv (Source of origin = Bio Mass, Mineral, Petrochemical, Polymer) | FLD-2.3-01 = Bio Mass, Mineral, Petrochemical or Polymer (Annex 1 active) |
| 149 | 45 | FLD-A1-201 | Pesticides analysis available | Upload Required | Corrected | Ja (bei Häkchen) | No (upload in FLD-A1-202) |
| 150 | 46 | FLD-A1-202 | Pesticides – analysis (upload) | Controlled by | Corrected | FLD-A1-201 = true | FLD-A1-201 = Yes |
| 151 | 46 | FLD-A1-202 | Pesticides – analysis (upload) | Remarks / Open Points | Filled (was empty) | – | CIQ: "Please attach analysis". |
| 152 | 48 | FLD-A1-204 | Palm (kernel) oil is used as feedstock | CIQ Requirement ID | Filled (was empty) | – | REQ-PROC-006; REQ-CFG-103 |
| 153 | 48 | FLD-A1-204 | Palm (kernel) oil is used as feedstock | Validation / Format | Filled (was empty) | – | Radio Yes/No |
| 154 | 48 | FLD-A1-204 | Palm (kernel) oil is used as feedstock | Dependent (Yes/No) | Filled (was empty) | – | Yes |
| 155 | 48 | FLD-A1-204 | Palm (kernel) oil is used as feedstock | Controlled by | Filled (was empty) | – | FLD-2.3-01 = Bio Mass, Mineral, Petrochemical or Polymer (Annex 1 active) |
| 156 | 48 | FLD-A1-204 | Palm (kernel) oil is used as feedstock | Controls | Filled (was empty) | – | FLD-A1-206 (if Yes) |
| 157 | 48 | FLD-A1-204 | Palm (kernel) oil is used as feedstock | Auto-Fill / Default | Filled (was empty) | – | No |
| 158 | 48 | FLD-A1-204 | Palm (kernel) oil is used as feedstock | Upload Required | Filled (was empty) | – | No |
| 159 | 48 | FLD-A1-204 | Palm (kernel) oil is used as feedstock | Remarks / Open Points | Filled (was empty) | – | CIQ Annex 1 section 5 ("No palm (kernel) oil used as feedstock"). Rule SF-08 (REQ-CFG-103). |
| 160 | 49 | FLD-A1-206 | RSPO certification available | Controlled by | Corrected | FLD-A1-204=ja; nur dann sichtbar | FLD-A1-204 = Yes |
| 161 | 49 | FLD-A1-206 | RSPO certification available | Controls | Corrected | FLD-A1-207 | FLD-A1-207 (if "No RSPO certification") |
| 162 | 49 | FLD-A1-206 | RSPO certification available | Remarks / Open Points | Remark updated | CIQ Annex 1 Abschn. 5. RSPO Mass Balance ist Minimum bei Palm. | CIQ Annex 1 section 5. Check rule: RSPO Mass Balance is the minimum for palm – "No RSPO certification" is a deviation to be assessed by BDF. CIQ also requires the RSPO certificate no. on the CoA of ea |
| 163 | 50 | FLD-A1-207 | Other certification available | Validation / Format | Corrected | Upload? | Radio Yes/No |
| 164 | 50 | FLD-A1-207 | Other certification available | Controlled by | Corrected | FLD-A1-204=ja; nur dann sichtbar wenn FLD-A1-206 = "keine RSPO Zertifizierung" | FLD-A1-206 = No RSPO certification |
| 165 | 50 | FLD-A1-207 | Other certification available | Controls | Corrected | nein | FLD-A1-208 (if Yes) |
| 166 | 50 | FLD-A1-207 | Other certification available | Remarks / Open Points | Remark updated | Prüfregel: mindestens Mass Balance. | CIQ Annex 1 section 5: "Other certification available". |
| 167 | 51 | FLD-A1-208 | Other certification (name) | CIQ Requirement ID | Filled (was empty) | – | REQ-PROC-005; REQ-PROC-010 |
| 168 | 51 | FLD-A1-208 | Other certification (name) | Field ID | Filled (was empty) | – | FLD-A1-208 |
| 169 | 51 | FLD-A1-208 | Other certification (name) | Validation / Format | Corrected | Upload? | Free text: name of the certification; certificate upload attached to this field |
| 170 | 51 | FLD-A1-208 | Other certification (name) | Dependent (Yes/No) | Corrected | je | Yes |
| 171 | 51 | FLD-A1-208 | Other certification (name) | Controlled by | Corrected | wird eingeblendet, wenn FLD-A1-207=ja | FLD-A1-207 = Yes |
| 172 | 51 | FLD-A1-208 | Other certification (name) | Remarks / Open Points | Filled (was empty) | – | [Review] The CIQ only asks for free text; the upload requirement is a BDF extension – please confirm. |
| 173 | 53 | FLD-A4-101 | MOAH concentration | Controlled by | Corrected | Annex 4 aktiv (Source of origin = Petrochemical) | FLD-2.3-01 = Petrochemical (Annex 4 active) |
| 174 | 53 | FLD-A4-101 | MOAH concentration | Remarks / Open Points | Remark updated | CIQ Annex 4 Abschn. 1 (Freitext "Your text"). [Review] Pflicht und Einheit klären. | CIQ Annex 4 section 1 (determined by online HPLC-GC-FID or suitable method). [Review] Clarify unit. |
| 175 | 54 | FLD-A4-102 | Mineral oil – kinematic viscosity at 100 °C: availability | Controlled by | Corrected | Annex 4 aktiv (Source of origin = Petrochemical) | FLD-2.3-01 = Petrochemical (Annex 4 active) |
| 176 | 54 | FLD-A4-102 | Mineral oil – kinematic viscosity at 100 °C: availability | Controls | Corrected | FLD-A4-103, FLD-A4-104 | FLD-A4-103 (if Available) |
| 177 | 54 | FLD-A4-102 | Mineral oil – kinematic viscosity at 100 °C: availability | Remarks / Open Points | Remark updated | CIQ Annex 4 Abschn. 3. | CIQ Annex 4 section 3. Options simplified vs. CIQ (Not available / Conclusion by analogy / Own value); value type is captured in FLD-A4-103. |
| 178 | 55 | FLD-A4-103 | Mineral oil – kinematic viscosity at 100 °C [mm²/s] | CIQ Requirement ID | Corrected | REQ-PROC-005 | REQ-PROC-005; REQ-PROC-010 |
| 179 | 55 | FLD-A4-103 | Mineral oil – kinematic viscosity at 100 °C [mm²/s] | Validation / Format | Corrected | type = Conclusion by analogy or Own value | Checkbox: Conclusion by analogy / Own value; number > 0, unit mm²/s (cSt) |
| 180 | 55 | FLD-A4-103 | Mineral oil – kinematic viscosity at 100 °C [mm²/s] | Controlled by | Corrected | FLD-A4-102 ≠ Not available | FLD-A4-102 = Available |
| 181 | 55 | FLD-A4-103 | Mineral oil – kinematic viscosity at 100 °C [mm²/s] | Upload Required | Corrected | Nein | Yes – analytical data if a value is entered (CIQ) |
| 182 | 55 | FLD-A4-103 | Mineral oil – kinematic viscosity at 100 °C [mm²/s] | Remarks / Open Points | Filled (was empty) | – | CIQ: "If a value is entered, please provide analytical data." Former upload field FLD-A4-104 was removed – the upload is now attached to this field. |

## Sheet: Feldkatalog (Feldebene)  (dims A1:O61, state=visible)
- HIDDEN rows: [] cols: ['L', 'M']
- Merged: ['A43:N43', 'A2:N2', 'A11:N11']
- DATA VALIDATION list on D2:D48: "Text,Zahl,Zahl+Einheit,Ja/Nein,Checkbox,Single-Select,Multi-Select,Datum,Tabelle (wiederholbar),Datei-Upload"

| Row | A | B | C | D | E | F | G | H | I | J | K | L | M | N | O |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Field-ID | CIQ-Abschnitt | Feld / Spalte | Feldtyp | Pflicht | Validierung / Format | Abhängigkeit / Trigger | Auto-Fill / Default | Upload erforderl. | Begründung b. N/A | Approval | Ref. v3.1 (REQ-ID) | Ref. Prozess/Config | Bemerkung / OP |  |
| 2 | 0 – Prozessstart & Stammdaten (General information / Verification – RMM-Start PS-01 & Metadaten PS-02) |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| 3 | FLD-GEN-001 | Gen. info | Trade name | Text | Muss | Freitext; Handelsname des Rohstoffs | Startpflichtfeld | Vorbelegbar bei Anlage durch RMM | Nein | Nein | RMM | REQ-PROC-001; REQ-PROC-005 | PS-01 / K-Start | Pflichtfeld bei CIQ-Anlage; blockiert Start wenn leer. |  |
| 4 | FLD-GEN-002 | Gen. info | Supplier (name & address) | Text | Muss | Freitext / Adressblock | Startpflichtfeld | AUTO-FILL aus Teamcenter-Stammdaten möglich | Nein | Nein | RMM | REQ-PROC-001; REQ-PROC-104 | PS-01 | Vorbelegung aus Bestandsdaten (REQ-PROC-104). |  |
| 5 | FLD-GEN-003 | Gen. info | Supplier's DUNS-Number | Text/Zahl | Muss | 9-stellige DUNS; Formatprüfung | Startpflichtfeld | AUTO-FILL aus Stammdaten | Nein | Nein | Supplier | REQ-PROC-001; REQ-PROC-005 | PS-01 | Wichtiges Suchfeld (REQ-PROC-005). |  |
| 6 | FLD-GEN-004 | Gen. info | Manufacturer (name & address) | Text | Muss | Freitext / Adressblock | Startpflichtfeld | AUTO-FILL aus Stammdaten möglich | Nein | Nein | Supplier | REQ-CFG-105 | PS-01 / CFG | Teil der Lieferantenstruktur (REQ-CFG-105). |  |
| 7 | FLD-GEN-005 | Gen. info | Production site (city & country) | Text | Muss | Ort + Land | Startpflichtfeld | AUTO-FILL aus Stammdaten möglich | Nein | Nein | Supplier | REQ-CFG-105 | PS-01 / CFG | Mehrere Standorte je CIQ-Projekt möglich. |  |
| 8 | FLD-GEN-006 | Gen. info | Are further production sites available? (Yes/No) | Ja/Nein | kann | Boolean; steuert Folgefeld | Trigger für 'Please specify location' | — | Nein | Nein | RMM / Supplier | REQ-CFG-105 | PS-02 / SF-02 | Konfigurationsfrage SF-02 (zusätzliche Standorte). | Offener Punkt, mit Proc klären |
| 9 | FLD-GEN-007 | Gen. info | Please specify location (further sites) | Text | kann | Freitext; Pflicht wenn Yes | Getriggert durch FLD-GEN-006 = Yes | — | Nein | Nein | RMM / Supplier | REQ-CFG-105; REQ-PROC-004 | PS-02 / SF-02 | Weitere Standorte nur informativ, nicht liefer-freigegeben (CIQ-Hinweis). |  |
| 10 | FLD-VER-001 | Verification | Company responsible for providing information | Text | kann | Freitext / Firmenname | Sign-off-Block | — | Nein | Nein | RMM / Supplier | REQ-PROC-005 | PS-02 | Verifizierungs-/Sign-off-Angabe. |  |
| 11 | FLD-VER-002 |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| 12 | FLD-VER-003 | Verification | Person responsible for providing information | Text | Muss | Name | Sign-off-Block | Vorbelegbar aus benanntem Lieferantenkontakt | Nein | Nein | RMM  | REQ-CFG-105; REQ-PROC-003 | PS-02 | Bezug zum Lieferantenkontakt (REQ-PROC-003). |  |
| 13 | FLD-VER-004 | Verification | Telephone and fax number | Text | Soll | Telefonformat | Sign-off-Block | — | Nein | Nein | Supplier | REQ-CFG-105 | PS-02 | — |  |
| 14 | FLD-VER-005 | Verification | Email address | Text | Muss | E-Mail-Format (Validierung) | Sign-off-Block | Vorbelegbar aus Kontakt; steuert Zugang/Benachrichtigung | Nein | Nein | RMM  Supplier | REQ-PROC-003; REQ-CTL-012 | PS-02 | Basis für Zugang & Benachrichtigungen. |  |
| 15 |  | Verification | Digital signature |  |  |  |  |  |  |  |  |  |  |  |  |
| 16 | 2.1 – Components and additives (Komponententabelle, wiederholbar; Datenbasis für viele Folgeprüfungen) |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| 17 | FLD-2.1-001 | 2.1 | INCI (European) / IUPAC | Text | Muss | INCI-Name; falls kein INCI: chem. Name (IUPAC), bei Colorants zusätzl. Color Index Nr. | Zeile der Komponententabelle | — | Nein | Nein | RMM  | REQ-PROC-005 | K2.1 | Fußnote 1 des CIQ; Pflichtangabe je Komponente. |  |
| 18 | FLD-2.1-002 | 2.1 | CAS-No. | Text/Zahl | Muss | CAS-Format nnnnnnn-nn-n (Prüfziffer) | Zeile der Komponententabelle | — | Nein | Nein | RMM  | REQ-PROC-005 | K2.1 | Validierung als Format-Check empfohlen. |  |
| 19 | FLD-2.1-003 | 2.1 | EC Number | Text/Zahl | Soll | EINECS/ELINCS/NLP oder REACH-Reg.-Nr. | Zeile der Komponententabelle | — | Nein | Nein | RMM  | REQ-PROC-005 | K2.1 | Fußnote 2 des CIQ. |  |
| 20 | FLD-2.1-004 | 2.1 | Additive? (yes/no) | Ja/Nein | Muss | Boolean (Checkbox yes/no) | Steuert Zusatzangaben zu Additiven | — | Nein | Nein | RMM  | REQ-PROC-005 | K2.1 | Kennzeichnet absichtlich zugesetzte Additive (Fußnote 3). |  |
| 21 | FLD-2.1-005 | 2.1 | Function of component | Text | Muss | Freitext, z. B. preservative, solvent | Zeile der Komponententabelle | — | Nein | Nein | RMM  | REQ-PROC-005 | K2.1 | — |  |
| 22 | FLD-2.1-006 | 2.1 | Source of origin | Text | Muss | z. B. oil palm, soy, sunflower | Zeile der Komponententabelle | Vorbelegung möglich aus 2.3-Herkunftsart | Nein | Nein | RMM  | REQ-PROC-005 | K2.1 / K2.3 | Fußnote 4; Bezug zur Konfiguration SF-01. |  |
| 23 | FLD-2.1-007 | 2.1 | Concentration Range [%] | Zahl+Einheit | Muss | 0–100 %; Bereich min–max zulässig | Zeile der Komponententabelle | — | Nein | Nein | RMM  | REQ-PROC-005 | K2.1 | Grundlage Grenzwert-/Sicherheitsbewertung. |  |
| 24 | FLD-2.1-008 | 2.1 | Komponentenzeile (Tabelle) | Tabelle (wiederholbar) | Muss | Beliebige Anzahl Zeilen; mind. 1 | — | — | Nein | Nein | RMM  | REQ-CFG-102 | K2.1 | Wiederholbare Tabelle ausdrücklich als Feldtyp gefordert (REQ-CFG-102). |  |
| 25 | 2.2 – Byproducts and contaminations  (inkl. Annex 14: Heavy Metals, Residues/Limits, Specific Impurities, CMR) |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| 26 | FLD-2.2-001 | 2.2 | Analytische Nachweise (≥ 2 Chargen) | Datei-Upload | Muss | ≥ 2 Batch-Reports; Dateiformat PDF bevorzugt | Immer bei 2.2 | — | Ja | Nein | RMM / Regulatory / Safety / Sustainability | REQ-PROC-010; REQ-PROC-016(?) | K2.2 | 'at least two batches' verpflichtend; Prüfversion fixieren. |  |
| 27 | FLD-A14-101 | Annex 14 / T1 | Heavy metal As – Confirmed | Checkbox+Zahl | Bedingt-Muss | Messwert [mg/kg]; Grenzwert ≤ 0.5 mg/kg; Confirmed=true nur wenn Wert ≤ Limit | Aktiv bei 2.2 (Byproducts) | — | Nein | Ja (bei Abweichung) | RMM / Regulatory / Safety / Sustainability | REQ-PROC-106 | A14 T1 / K2.2 | Quantitative Grenzwertprüfung gegen BDF-Wert 0.5. |  |
| 28 | FLD-A14-102 | Annex 14 / T1 | Heavy metal Cd – Confirmed | Checkbox+Zahl | Bedingt-Muss | Messwert [mg/kg]; Grenzwert ≤ 0.1 mg/kg; Confirmed=true nur wenn Wert ≤ Limit | Aktiv bei 2.2 (Byproducts) | — | Nein | Ja (bei Abweichung) | RMM / Regulatory / Safety / Sustainability | REQ-PROC-106 | A14 T1 / K2.2 | Quantitative Grenzwertprüfung gegen BDF-Wert 0.1. |  |
| 29 | FLD-A14-103 | Annex 14 / T1 | Heavy metal Cr – Confirmed | Checkbox+Zahl | Bedingt-Muss | Messwert [mg/kg]; Grenzwert ≤ 5.0 mg/kg; Confirmed=true nur wenn Wert ≤ Limit | Aktiv bei 2.2 (Byproducts) | — | Nein | Ja (bei Abweichung) | RMM / Regulatory / Safety / Sustainability | REQ-PROC-106 | A14 T1 / K2.2 | Quantitative Grenzwertprüfung gegen BDF-Wert 5.0. |  |
| 30 | 2.3 – Source or type of starting materials  (BASIS FÜR KONFIGURATION – Konfigurationsfragen SF-01 ff.) |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| 31 | FLD-2.3-01 | 2.3 | Origin type: Vegetable origin (Yes/No) | Checkbox / Multi-Select | Muss | Mehrfachauswahl möglich | Konfigurations-Input SF-01 | Speist Auto-Fill 2.1 Source of origin | Nein | Nein | Supplier | REQ-PROC-006; REQ-CFG-103 | K2.3 / SF-01 | Steuert Pflicht-Annexe: A1, A2, A3, A9, A10, A11, A12; RSPO b. Palm |  |
| 32 | FLD-2.3-02 | 2.3 | Origin type: Animal origin (Yes/No) | Checkbox / Multi-Select | Muss | Mehrfachauswahl möglich | Konfigurations-Input SF-01 | Speist Auto-Fill 2.1 Source of origin | Nein | Nein | RMM / Regulatory / Safety / Sustainability | REQ-PROC-006; REQ-CFG-103 | K2.3 / SF-01 | Steuert Pflicht-Annexe: BSE/TSE-Zertifikat; entry No. 419; A10-A12 |  |
| 33 | FLD-2.3-03 | 2.3 | Origin type: Mineral (Yes/No) | Checkbox / Multi-Select | Muss | Mehrfachauswahl möglich | Konfigurations-Input SF-01 | Speist Auto-Fill 2.1 Source of origin | Nein | Nein | RMM / Regulatory / Safety / Sustainability | REQ-PROC-006; REQ-CFG-103 | K2.3 / SF-01 | Steuert Pflicht-Annexe: A10, A11, A12 |  |
| 34 | FLD-2.3-04 | 2.3 | Origin type: Petrochemical / Fossil (Yes/No) | Checkbox / Multi-Select | Muss | Mehrfachauswahl möglich | Konfigurations-Input SF-01 | Speist Auto-Fill 2.1 Source of origin | Nein | Nein | RMM / Regulatory / Safety / Sustainability | REQ-PROC-006; REQ-CFG-103 | K2.3 / SF-01 | Steuert Pflicht-Annexe: A1, A4, A9, A10, A11, A12 |  |
| 35 | FLD-2.3-05 | 2.3 | Origin type: Waste / Side stream (Yes/No) | Checkbox / Multi-Select | Muss | Mehrfachauswahl möglich | Konfigurations-Input SF-01 | Speist Auto-Fill 2.1 Source of origin | Nein | Nein | RMM / Regulatory / Safety / Sustainability | REQ-PROC-006; REQ-CFG-103 | K2.3 / SF-01 | Steuert Pflicht-Annexe: keine Annexe (nur Angabe) |  |
| 36 | FLD-2.3-06 | 2.3 | Origin type: Carbon Capture Utilisation (CCU) (Yes/No) | Checkbox / Multi-Select | Muss | Mehrfachauswahl möglich | Konfigurations-Input SF-01 | Speist Auto-Fill 2.1 Source of origin | Nein | Nein | RMM / Regulatory / Safety / Sustainability | REQ-PROC-006; REQ-CFG-103 | K2.3 / SF-01 | Steuert Pflicht-Annexe: keine Annexe |  |
| 37 | FLD-2.3-07 | 2.3 | Origin type: Polymer (Yes/No) | Checkbox / Multi-Select | Muss | Mehrfachauswahl möglich | Konfigurations-Input SF-01 | Speist Auto-Fill 2.1 Source of origin | Nein | Nein | RMM / Regulatory / Safety / Sustainability | REQ-PROC-006; REQ-CFG-103 | K2.3 / SF-01 | Steuert Pflicht-Annexe: A1, A6, A10, A11, A12 |  |
| 38 | FLD-2.3-08 | 2.3 | Origin type: Chemical recycling of post-consumer plastic (Yes/No) | Checkbox / Multi-Select | Muss | Mehrfachauswahl möglich | Konfigurations-Input SF-01 | Speist Auto-Fill 2.1 Source of origin | Nein | Nein | RMM / Regulatory / Safety / Sustainability | REQ-PROC-006; REQ-CFG-103 | K2.3 / SF-01 | Steuert Pflicht-Annexe: keine Annexe |  |
| 39 | 4.1 – Toxicity Data  (Regel: gesetztes Häkchen 'attached' → Nachweis-Upload möglich/erforderlich) |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| 40 | FLD-4.1-001 | 4.1 | Partition coefficient (n-octanol/water) | Zahl | Soll | logKow-Wert | — | — | Nein | Nein | Safety / Toxicology | REQ-PROC-005 | K4.1 | Einzelwert vor Endpunkt-Tabelle. |  |
| 41 | FLD-4.1-101 | 4.1 | Endpoint: Acute toxicity – oral – attached (checkbox) | Checkbox | Soll | Boolean; wenn true → Upload-Feld pflichtig | Steuert zugehöriges Upload-Feld | — | Ja (bei Häkchen) | Nein | Safety / Toxicology | REQ-PROC-010 | K4.1 | KERNREGEL: Häkchen 'attached' aktiviert Pflicht-Upload des Studiennachweises. |  |
| 42 | FLD-4.1-102 | 4.1 | Endpoint: Acute toxicity – dermal – attached (checkbox) | Checkbox | Soll | Boolean; wenn true → Upload-Feld pflichtig | Steuert zugehöriges Upload-Feld | — | Ja (bei Häkchen) | Nein | Safety / Toxicology | REQ-PROC-010 | K4.1 | KERNREGEL: Häkchen 'attached' aktiviert Pflicht-Upload des Studiennachweises. |  |
| 43 | FLD-4.1-103 |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| 44 | FLD-4.1-104 | 4.1 | Endpoint: Skin irritation – attached (checkbox) | Checkbox | Soll | Boolean; wenn true → Upload-Feld pflichtig | Steuert zugehöriges Upload-Feld | — | Ja (bei Häkchen) | Nein | Safety / Toxicology | REQ-PROC-010 | K4.1 | KERNREGEL: Häkchen 'attached' aktiviert Pflicht-Upload des Studiennachweises. |  |
| 45 | 6.1 – EU REACH  (inkl. STEUERUNG Annex 10: Häkchen 'See BDF REACH questionnaire (Annex 10)' aktiviert Annex 10) |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| 46 | FLD-6.1-001 | 6.1 | Reg.-status: Registration Numbers listed below | Checkbox | Soll | Boolean | Eine von 4 Statusoptionen | — | Nein | Nein | Regulatory | REQ-PROC-005 | K6.1 | — |  |
| 47 | FLD-6.1-002 | 6.1 | Reg.-status: Numbers in SDS (attached) | Checkbox | Soll | Boolean; wenn true → SDS-Upload | Aktiviert SDS-Upload | — | Ja (bei Häkchen) | Nein | Regulatory | REQ-PROC-010 | K6.1 | — |  |
| 48 | FLD-6.1-003 | 6.1 | Reg.-status: described in company statement (attached) | Checkbox | Soll | Boolean; wenn true → Statement-Upload | Aktiviert Statement-Upload | — | Ja (bei Häkchen) | Nein | Regulatory | REQ-PROC-010 | K6.1 | — |  |
| 49 | FLD-6.1-004 | 6.1 | STEUERUNG: See BDF REACH questionnaire (Annex 10) | Checkbox | Bedingt-Muss | Boolean; true → Annex 10 wird aktiviert/pflichtig | Steuert Aktivierung Annex 10 | Aktiviert Annex-10-Abschnitt | Nein | Nein | Regulatory | REQ-ADR-003; REQ-CFG-103 | K6.1 / A10 | KERNREGEL: Häkchen aktiviert Annex 10 als zusätzlichen CIQ-Teil. |  |
| 50 | FLD-6.1-005 | 6.1 | Annex XIV (Authorisation) – CAS | Text/Zahl | Bedingt-Muss | CAS-Format | Wenn Substanz gelistet | — | Nein | Nein | Regulatory | REQ-PROC-005 | K6.1 / A10 | — |  |
| 51 | FLD-6.1-006 | 6.1 | Annex XIV – Substance / Further details | Text | Bedingt-Muss | Freitext | Wenn Substanz gelistet | — | Nein | Nein | Regulatory | REQ-PROC-005 | K6.1 | — |  |
| 52 | FLD-6.1-007 | 6.1 | Annex XVII (Restriction) – CAS / Substance / Details | Text | Bedingt-Muss | Freitext + CAS | Wenn Substanz gelistet | — | Nein | Nein | Regulatory | REQ-PROC-005 | K6.1 | — |  |
| 53 | FLD-6.1-008 | 6.1 | SVHC Art. 59 (Candidate List) – CAS / Substance / Details | Text | Bedingt-Muss | Freitext + CAS | Wenn Substanz gelistet | — | Nein | Nein | Regulatory | REQ-PROC-005 | K6.1 | — |  |
| 54 | FLD-6.1-009 | 6.1 | Annex 10 aktiviert (abgeleiteter Zustand) | Ja/Nein (System) | — | Systemstatus aus FLD-6.1-004 / SF-Regel | Ergebnis der Steuerung | — | Nein | Nein | System | REQ-PROC-006 | A10 | Nachvollziehbar dokumentiert (Regelbegründung). |  |
| 55 | Annex 1 – Tabelle 1 (Feedstock, content and origin)  (AUTO-FILL: INCI aus 2.1 automatisch übertragen) |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| 56 | FLD-A1-101 | Annex 1 / T1 | INCI | Text | Muss | INCI wie in 2.1 | Zeile Annex-1-Tabelle 1 | AUTO-FILL aus FLD-2.1-001 (INCI) | Nein | Nein | Sustainability / Safety | REQ-PROC-033; REQ-PROC-005 | A1 / K2.1 | KERNREGEL: automatische Übernahme der INCI-Werte aus 2.1; Quelle nachvollziehbar. |  |
| 57 | FLD-A1-102 | Annex 1 / T1 | Source / Feedstock | Text | Muss | Freitext | Zeile Annex-1-Tabelle 1 | Vorschlag aus 2.1 'Source of origin' / 2.3 | Nein | Nein | Sustainability | REQ-PROC-005 | A1 | Von Lieferant bestätigen/ergänzen. |  |
| 58 | FLD-A1-103 | Annex 1 / T1 | Content [%] in INCI | Zahl+Einheit | Muss | 0–100 % | Zeile Annex-1-Tabelle 1 | — | Nein | Nein | Sustainability | REQ-PROC-005 | A1 | % basierend auf Molekulargewicht (CIQ-Hinweis). |  |
| 59 | FLD-A1-104 | Annex 1 / T1 | Content [%] in Raw Material | Zahl+Einheit | Muss | 0–100 % | Zeile Annex-1-Tabelle 1 | Konsistenzprüfung ggü. 2.1 Concentration Range | Nein | Nein | Sustainability | REQ-PROC-005 | A1 / K2.1 | Plausibilität ggü. 2.1 möglich. |  |
| 60 | FLD-A1-105 | Annex 1 / T1 | Country of origin | Text | Muss | Land | Zeile Annex-1-Tabelle 1 | AUTO-FILL aus FLD-2.3-10 (country of origin) | Nein | Nein | Sustainability | REQ-PROC-005 | A1 / K2.3 | Übernahme aus 2.3 möglich, editierbar. |  |
| 61 | FLD-A1-106 | Annex 1 / T1 | Feedstock-Zeile (Tabelle) | Tabelle (wiederholbar) | Muss | Je Komponente 1 Zeile | Zeilenzahl folgt 2.1-Komponenten | AUTO-Generierung der Zeilen aus 2.1 | Nein | Nein | Sustainability | REQ-CFG-102; REQ-PROC-033 | A1 / K2.1 | Zeilenstruktur aus 2.1 vorbelegt. |  |

### Cell comments
- C46: Pevzner, Alexander:
Hier bitte prüfen, ob die Begründung notwendig ist
Kommentar Wieke: Welche Begründung? 
