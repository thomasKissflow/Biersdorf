# CIQ Field-Level Requirements Matrix v0.6 (EN)

- **File:** `CIQ_Field_Level_Requirements_Matrix_v0.6_EN.xlsx` · **Type/format:** Excel workbook, 3 visible sheets ("CIQ new version", "Notes & change log", "Feldkatalog (Feldebene)") · **Author/owner, version, date:** version "v0.6" appears only in the file name. The file was created on 2026-09-18 12:16 UTC with creator "openpyxl", which means a script generated it before it was edited in Excel. It was last modified by **Alexander Pevzner** on **2026-10-02 14:09 UTC**. A Microsoft sensitivity label **"Intern-ohne-Richtlinien"** (BDF internal) was set on 2026-09-18 [FLM file properties]. A cell comment also names a second person, "Wieke" [Feldkatalog C46 comment]. · **Language:** English ("CIQ new version"; change log new values). German (change-log old values and the whole "Feldkatalog" sheet).
- **What it is and how to use it:** this is BDF's field-by-field specification of the questionnaire. "CIQ new version" (39 fields on 50 rows) is the current target field set. "Notes & change log" records every edit made when that sheet was translated and cleaned, plus BDF's own open review questions (`[Review]`). "Feldkatalog" is the older German field catalogue, kept "as historical reference" [FLM changelog r9]. Use the new-version table as the build baseline for the fields it covers, use the change log for open decisions, and use the Feldkatalog only to see what was dropped or changed. By file metadata this is the newest dated client file. It post-dates the requirements PDF (16 Sep 2026) [ReqDoc p.1], the BRM (created 2026-09-15) and the CIA/VQ (created 2026-06-10). The Knowledge Baseline has no date metadata (verified in the file properties; the ordering is inferred from those dates).

---

## Structure

| Sheet | Range | Content | Notes |
|---|---|---|---|
| **CIQ new version** | A1:M56 | Header (row 1). 50 data rows in 5 blocks separated by empty dark-blue rows 6, 36, 44 and 52. | Column **B (CIQ Requirement ID) is hidden**. Autofilter A1:M56. Freeze panes at E2 (columns A–D frozen). Data validation (list of field types) on E2:E56. No green/orange/blue legend fills appear on this sheet; only the header and separator rows are coloured (verified in the original file). |
| **Notes & change log** | A1:G182 | Legend (r1–r6), "General changes" (r8–r12), change-log header (r15), **167 change entries (r16–r182)** | Column E carries the legend colour per entry: green (C6EFCE) = filled, orange (FFD8B1) = corrected, blue (DDEBF7) = remark updated. |
| **Feldkatalog (Feldebene)** | A1:O61 | Old German field catalogue: header plus 7 section-header rows plus 53 field rows (50 with content, 1 unnamed "Digital signature" row, 2 empty ID-only rows) | **Columns L and M are hidden**. Merged A2:N2, A11:N11 and A43:N43. Data validation (old type list) on D2:D48. One cell comment (C46). Yellow cells C8, K8, O8, C9, K9, K10, C13, C15, E18. Red A10:C10. Light-orange L26. |

### Columns of "CIQ new version"

| Col | Header | Meaning |
|---|---|---|
| A | CIQ Process Part | Block or step: Process Start, Meta Data, Manufacturing process, Annex 1, Annex 4 |
| B (hidden) | CIQ Requirement ID | Traceability to requirement IDs (several do **not** exist in the shared BRM; see Cross-references) |
| C | Field ID | `FLD-…`. The options of one field share one ID [FLM changelog r12] |
| D | Field / Column | Field label |
| E | Field Type | From the 15-value validation list |
| F | Mandatory | Mandatory / Optional / Conditional mandatory |
| G | Validation / Format | Format rules. **For radio and single-select fields this column holds the option value of that row** |
| H | Dependent (Yes/No) | Whether the field's visibility depends on another field |
| I | Controlled by | Controlling field, written as `<Field ID> = <value>` [FLM changelog r11] |
| J | Controls | Fields or annexes this field or option shows |
| K | Auto-Fill / Default | Pre-fill source (one row puts a consistency check here) |
| L | Upload Required | Whether evidence is attached at this field |
| M | Approval | RMM / Regulatory / Safety. Not defined anywhere: it could be the reviewing or approving department or the field owner (inferred) |

### Field-type list (data validation on E2:E56 of "CIQ new version")
`Text, Number, Number (decimal), Number+Unit, Text/Number, Yes/No, Checkbox, Checkbox+Number, Radio button, Single-select, Multi-select, Dropdown, Date, Table (repeatable), File upload` (15 types) [FLM 'CIQ new version' DV E2:E56].
- **Used in the sheet:** Text, Text/Number, Number, Number (decimal), Number+Unit, Yes/No, Radio button, Single-select, Multi-select, Checkbox+Number, File upload.
- **Defined but unused:** Checkbox, Dropdown, **Date**, **Table (repeatable)** (verified).
- Old Feldkatalog list (D2:D48), translated: Text, Number, Number+Unit, Yes/No, Checkbox, Single-Select, Multi-Select, Date, Table (repeatable), File upload (10 types) [Feldkatalog DV D2:D48]. The new list adds Number (decimal), Text/Number, Checkbox+Number, Radio button and Dropdown.

---

## Full content digest

### A. Sheet "CIQ new version": every row

Legend: **M** = Mandatory, **O** = Optional, **CM** = Conditional mandatory. "r" = Excel row.

| r | Process part | Req IDs (hidden col B) | Field ID | Field | Type | Mand. | Validation / Format (or option value) | Dep. | Controlled by | Controls | Auto-fill / Default | Upload | Approval |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2 | Process Start | REQ-PROC-001; REQ-PROC-005 | FLD-GEN-001 | Trade name | Text | M | Free text; trade name of the raw material | No | n/a | No | Can be pre-filled by RMM at case creation | No | RMM |
| 3 | Process Start | REQ-PROC-001; REQ-PROC-104 | FLD-GEN-002 | Supplier (name) | Text | M | Free text (supplier name) | No | n/a | No | Auto-fill from Teamcenter master data possible (**post-MVP, REQ-PROC-104**) | No | RMM |
| 4 | Process Start | REQ-PROC-001; REQ-PROC-003 | FLD-GEN-008 | Contact person e-mail | Text | M | E-mail format (validation); pre-filled automatically from supplier master data | Yes | Supplier master data | Supplier access and task notification (REQ-PROC-003) | Yes – from supplier master data | No | RMM |
| 5 | Process Start | REQ-PROC-003; REQ-CTL-012 | FLD-GEN-009 | Contact person e-mail 2 | Text | O | E-mail format (validation); manual entry possible | No | n/a | Additional recipient of notifications (if filled) | Can be pre-filled from contact data | No | RMM |
| 7 | Meta Data | REQ-PROC-001; REQ-PROC-005 | FLD-GEN-003 | Supplier's DUNS number | Text/Number | M | 9-digit DUNS; format check | No | n/a | No | Auto-fill from master data | No | RMM |
| 8 | Meta Data | REQ-CFG-105 | FLD-GEN-004 | Manufacturer (name & address) | Text | M | Free text / address block | No | n/a | No | Auto-fill from master data possible | No | RMM |
| 9 | Meta Data | REQ-CFG-105 | FLD-GEN-005 | Production site (name & address) | Text | M | Free text / address block | No | n/a | No | Auto-fill from master data possible | No | RMM |
| 10 | Meta Data | REQ-PROC-005 | FLD-2.1-001 | INCI (European) / IUPAC | Text | M | INCI name; if no INCI: chemical name (IUPAC); for colorants additionally Colour Index no. | No | n/a | No *(change log says "Pre-fill of FLD-A2-101", see gaps)* | No | No | RMM |
| 11 | Meta Data | REQ-PROC-005 | FLD-2.1-002 | CAS No. | Text/Number | O | CAS format nnnnnnn-nn-n (check digit); validated only if filled | No | n/a | No | No | No | RMM |
| 12 | Meta Data | REQ-PROC-005 | FLD-2.1-003 | EC number | Text/Number | O | EINECS/ELINCS/NLP or REACH registration no.; validated only if filled | No | n/a | No | No | No | RMM |
| 13 | Meta Data | REQ-PROC-005 | FLD-2.1-004 | Additive? (yes/no) | Yes/No | M | Boolean (Yes/No) | No | n/a | Additional information on additives (per field catalogue) – **follow-up fields still open in the new layout** | No | No | RMM |
| 14 | Meta Data | REQ-PROC-005 | FLD-2.1-005 | Function of component | Text | M | Free text, e.g. preservative, solvent | No | n/a | No | No | No | RMM |
| 15 | Meta Data | REQ-PROC-005 | FLD-2.1-007 | Concentration range [%] | Number+Unit | M | 0–100 %; range min–max allowed; min ≤ max | No | n/a | No | No | No | RMM |
| 16 | Meta Data | REQ-PROC-006; REQ-CFG-103 | FLD-2.3-01 | Source of origin | Radio button | M | **Bio Mass (vegetable)** | No | n/a | FLD-2.1-101 (Part); FLD-2.3-10 (Country of origin); Annex 1, 2, 3, 9, 10, 11, 12 | No | No | RMM |
| 17 | Meta Data | REQ-PROC-006; REQ-CFG-103 | FLD-2.3-01 | Source of origin | Radio button | M | **Animal** | No | n/a | FLD-2.1-101 (Part); FLD-2.3-10 (Country of origin); Annex 10, 11, 12 | No | **Yes – BSE/TSE certificate; confirmation entry no. 419** | RMM |
| 18 | Meta Data | REQ-PROC-005 | FLD-2.1-101 | Part | Multi-select | CM | Bark, Bean, Flower, Fruit, Fruit Pulp, Germ, Kernel, Leaf, Nut, Peel, Rhizome, Root, Seed, Shell, Shoot, Skin, Tree, Trunk, Wool, no entry (20 options) | Yes | FLD-2.3-01 = Bio Mass (vegetable) or Animal | No | No | No | RMM |
| 19 | Meta Data | REQ-PROC-005 | FLD-2.3-10 | Country of origin | Text | CM | Free text (country); mandatory if visible; multiple countries | Yes | FLD-2.3-01 = Bio Mass (vegetable) or Animal | Annex 1 – Country of origin (auto-fill) | No | No | RMM |
| 20 | Meta Data | REQ-PROC-006; REQ-CFG-103 | FLD-2.3-01 | Source of origin | Radio button | M | **Petrochemical** | No | n/a | FLD-2.3-11 (Fossil specification); Annex 1, 4, 9, 10, 11, 12 | No | No | RMM |
| 21 | Meta Data | REQ-PROC-005 | FLD-2.3-11 | Fossil specification | Text | CM | Free text, e.g. oil, wax, gas; mandatory if visible | Yes | FLD-2.3-01 = Petrochemical | No | No | No | RMM |
| 22 | Meta Data | REQ-PROC-006; REQ-CFG-103 | FLD-2.3-01 | Source of origin | Radio button | M | **Mineral** | No | n/a | FLD-2.3-12 (Mineral specification); Annex 1, 7, 10, 11, 12 | No | No | RMM |
| 23 | Meta Data | REQ-PROC-005 | FLD-2.3-12 | Mineral specification | Text | CM | Free text, e.g. talc, mica; mandatory if visible | Yes | FLD-2.3-01 = Mineral | No | No | No | RMM |
| 24 | Meta Data | REQ-PROC-006; REQ-CFG-103 | FLD-2.3-01 | Source of origin | Radio button | M | **CCU (Carbon Capture Utilisation)** | No | n/a | FLD-2.3-13 (CCU specification); no annexes | No | No | RMM |
| 25 | Meta Data | REQ-PROC-005 | FLD-2.3-13 | CCU specification | Text | CM | Free text; mandatory if visible | Yes | FLD-2.3-01 = CCU | No | No | No | RMM |
| 26 | Meta Data | REQ-PROC-006; REQ-CFG-103 | FLD-2.3-01 | Source of origin | Radio button | M | **Polymer** | No | n/a | FLD-2.3-14 (Polymer specification); Annex 1, 6, 10, 11, 12 | No | No | RMM |
| 27 | Meta Data | REQ-PROC-005 | FLD-2.3-14 | Polymer specification | Text | CM | Free text; mandatory if visible | Yes | FLD-2.3-01 = Polymer | No | No | No | RMM |
| 28 | Meta Data | REQ-PROC-006; REQ-CFG-103 | FLD-2.3-01 | Source of origin | Radio button | M | **Waste / Side stream** | No | n/a | FLD-2.3-15 (Waste specification); no annexes | No | No | RMM |
| 29 | Meta Data | REQ-PROC-005 | FLD-2.3-15 | Waste / side stream specification | Text | CM | Free text; mandatory if visible | Yes | FLD-2.3-01 = Waste / Side stream | No | No | No | RMM |
| 30 | Meta Data | REQ-PROC-006; REQ-CFG-103 | FLD-2.3-01 | Source of origin | Radio button | M | **Chemical recycling of post-consumer plastic** | No | n/a | FLD-2.3-16 (Chemical recycling specification); no annexes | No | No | RMM |
| 31 | Meta Data | REQ-PROC-005 | FLD-2.3-16 | Chemical recycling specification | Text | CM | Free text; mandatory if visible | Yes | FLD-2.3-01 = Chemical recycling of post-consumer plastic | No | No | No | RMM |
| 32 | Meta Data | REQ-PROC-005 | FLD-A1-102 | Feedstock | Text | M | Free text, e.g. sunflower, palm, soy | No | n/a | No | No | No | RMM |
| 33 | Meta Data | REQ-PROC-005 | FLD-2.1-102 | Natural origin index | Number (decimal) | M | 0–1 (decimal, max. 2 decimals) | No | n/a | No | No | No | RMM |
| 34 | Meta Data | REQ-PROC-005 | FLD-A1-103 | Content [%] in INCI | Number | M | 0–100 %; based on molecular weight (CIQ Annex 1) | No | n/a | No | No | No | RMM |
| 35 | Meta Data | REQ-PROC-005 | FLD-A1-104 | Content [%] in raw material | Number | M | 0–100 % | No | n/a | No | Consistency check against concentration range (FLD-2.1-007) | No | RMM |
| 37 | Manufacturing process | REQ-PROC-005 | FLD-A2-101 | INCI (European) / IUPAC | Text | M | Pre-filled from Meta Data field FLD-2.1-001 (INCI / IUPAC); editable | Yes | FLD-2.1-001 (pre-fill) | No | Yes – from FLD-2.1-001 | No | RMM |
| 38 | Manufacturing process | REQ-PROC-005 | FLD-A2-102 | Manufacturing process | Single-select | M | **Chemical** | No | n/a | No | No | No | RMM |
| 39 | Manufacturing process | REQ-PROC-005 | FLD-A2-102 | Manufacturing process | Single-select | M | **Physical** | No | n/a | No | No | No | RMM |
| 40 | Manufacturing process | REQ-PROC-005 | FLD-A2-102 | Manufacturing process | Single-select | M | **Enzymatic** | No | n/a | No | No | No | RMM |
| 41 | Manufacturing process | REQ-PROC-005 | FLD-A2-102 | Manufacturing process | Single-select | M | **Biotechnology / Fermentation** | No | n/a | **Annex 3 (GMO), if GMO – outside test scope** | No | No | RMM |
| 42 | Manufacturing process | REQ-PROC-005 | FLD-A2-102 | Manufacturing process | Single-select | M | **Other** | No | n/a | FLD-A2-103 (Manufacturing process – individual) | No | No | RMM |
| 43 | Manufacturing process | REQ-PROC-005 | FLD-A2-103 | Manufacturing process (individual) | Text | CM | Free text, e.g. hydrolysis, refining, synthesis, fermentation; mandatory if visible | Yes | FLD-A2-102 = Other | No | No | No | RMM |
| 45 | Annex 1 | REQ-PROC-005; REQ-PROC-010 | FLD-A1-201 | Pesticides analysis available | Yes/No | M | Radio Yes/No; Yes → upload mandatory, No → reason mandatory | Yes | FLD-2.3-01 = Bio Mass, Mineral, Petrochemical or Polymer (Annex 1 active) | FLD-A1-202 (upload, if Yes); FLD-A1-203 (reason, if No) | No | No (upload in FLD-A1-202) | **Regulatory** |
| 46 | Annex 1 | REQ-PROC-010 | FLD-A1-202 | Pesticides – analysis (upload) | File upload | CM | PDF; mandatory if FLD-A1-201 = Yes | Yes | FLD-A1-201 = Yes | No | No | Yes | Regulatory |
| 47 | Annex 1 | REQ-PROC-005 | FLD-A1-203 | Pesticides – reason if not present | Text | CM | Free text; mandatory if FLD-A1-201 = No | Yes | FLD-A1-201 = No | No | No | No | Regulatory |
| 48 | Annex 1 | REQ-PROC-006; REQ-CFG-103 | FLD-A1-204 | Palm (kernel) oil is used as feedstock | Yes/No | M | Radio Yes/No | Yes | FLD-2.3-01 = Bio Mass, Mineral, Petrochemical or Polymer (Annex 1 active) | FLD-A1-206 (if Yes) | No | No | Regulatory |
| 49 | Annex 1 | REQ-PROC-006; REQ-CFG-103 | FLD-A1-206 | RSPO certification available | Single-select | CM | Mass Balance / Segregated / Identity Preserved / No RSPO certification | Yes | FLD-A1-204 = Yes | FLD-A1-207 (if "No RSPO certification") | No | No | Regulatory |
| 50 | Annex 1 | REQ-PROC-005 | FLD-A1-207 | Other certification available | Yes/No | CM | Radio Yes/No | Yes | FLD-A1-206 = No RSPO certification | FLD-A1-208 (if Yes) | No | No | Regulatory |
| 51 | Annex 1 | REQ-PROC-005; REQ-PROC-010 | FLD-A1-208 | Other certification (name) | Text | CM | Free text: name of the certification; certificate upload attached to this field | Yes | FLD-A1-207 = Yes | No | No | Yes – certificate | Regulatory |
| 53 | Annex 4 | REQ-PROC-005 | FLD-A4-101 | MOAH concentration | Number | M | Number ≥ 0; **unit not defined in CIQ (assumption: mg/kg or %)** | Yes | FLD-2.3-01 = Petrochemical (Annex 4 active) | No | No | No | **Safety** |
| 54 | Annex 4 | REQ-PROC-005 | FLD-A4-102 | Mineral oil – kinematic viscosity at 100 °C: availability | Single-select | M | Not available / Available | Yes | FLD-2.3-01 = Petrochemical (Annex 4 active) | FLD-A4-103 (if Available) | No | No | Safety |
| 55 | Annex 4 | REQ-PROC-005; REQ-PROC-010 | FLD-A4-103 | Mineral oil – kinematic viscosity at 100 °C [mm²/s] | Checkbox+Number | CM | Checkbox: Conclusion by analogy / Own value; number > 0, unit mm²/s (cSt) | Yes | FLD-A4-102 = Available | No | No | Yes – analytical data if a value is entered (CIQ) | Safety |

#### Summary statistics (computed from the table)
| Block | Excel rows | Distinct fields | Approval |
|---|---|---|---|
| Process Start (RMM at case creation, inferred PS-01) | 2–5 | 4 (FLD-GEN-001, -002, -008, -009) | RMM |
| Meta Data (supplier, inferred PS-02) | 7–35 | 22 (FLD-2.3-01 spans 8 option rows) | RMM |
| Manufacturing process (= Annex 2) | 37–43 | 3 (FLD-A2-102 spans 5 option rows) | RMM |
| Annex 1 | 45–51 | 7 | Regulatory |
| Annex 4 | 53–55 | 3 | Safety |
| **Total** | 50 rows | **39 fields** | |

- Mandatory flags: 21 Mandatory, 3 Optional (FLD-GEN-009, FLD-2.1-002, FLD-2.1-003), 15 Conditional mandatory. Four fields marked "Mandatory" are only visible when their annex is active, which makes them conditional in practice: FLD-A1-201, FLD-A1-204, FLD-A4-101, FLD-A4-102 (inferred).
- Upload points (4): the Animal option of FLD-2.3-01 (BSE/TSE + entry 419), FLD-A1-202 (pesticide analysis, PDF), FLD-A1-208 (certificate) and FLD-A4-103 (analytical data). Three of these attach an upload to a non-upload field (radio option, text field, number field). The change log states this deliberately for FLD-A1-208 and FLD-A4-103 [FLM changelog r169, r182].
- Format validations: e-mail (GEN-008/-009), 9-digit DUNS (GEN-003), CAS check digit, only if filled (2.1-002), EC number format, only if filled (2.1-003), 0–100 % with min ≤ max (2.1-007), 0–1 with 2 decimals (2.1-102), 0–100 % (A1-103/-104), PDF (A1-202), ≥ 0 (A4-101), > 0 mm²/s (A4-103).
- Pre-fill sources: RMM at creation (GEN-001), Teamcenter (GEN-002, post-MVP), "supplier master data" (GEN-008, GEN-003/-004/-005), "contact data" (GEN-009), FLD-2.1-001 → FLD-A2-101.

### B. Dependency / visibility tree (derived from columns H–J)

```
PROCESS START (RMM)
  FLD-GEN-001 Trade name ............ pre-fillable by RMM
  FLD-GEN-002 Supplier (name) ....... Teamcenter auto-fill = post-MVP (REQ-PROC-104)
  FLD-GEN-008 Contact e-mail ........ pre-filled from supplier master data
        └─► grants supplier access + task notification (REQ-PROC-003)
  FLD-GEN-009 Contact e-mail 2 ...... optional → extra notification recipient

META DATA (supplier)
  FLD-GEN-003 DUNS · FLD-GEN-004 Manufacturer · FLD-GEN-005 Production site (auto-fill from master data)
  FLD-2.1-001 INCI/IUPAC ──(pre-fill)──► FLD-A2-101
  FLD-2.1-002 CAS · FLD-2.1-003 EC · FLD-2.1-005 Function
  FLD-2.1-004 Additive? ──► "follow-up fields still open" (none defined)
  FLD-2.1-007 Concentration range ◄──(consistency check)── FLD-A1-104
  FLD-2.3-01 Source of origin (RADIO, one value)
    ├─ Bio Mass (vegetable) ─► FLD-2.1-101 Part, FLD-2.3-10 Country ─► Annex 1, 2, 3, 9, 10, 11, 12
    ├─ Animal ───────────────► FLD-2.1-101 Part, FLD-2.3-10 Country ─► Annex 10, 11, 12 + upload BSE/TSE & entry 419
    ├─ Petrochemical ────────► FLD-2.3-11 Fossil spec ─► Annex 1, 4, 9, 10, 11, 12
    ├─ Mineral ──────────────► FLD-2.3-12 Mineral spec ─► Annex 1, 7, 10, 11, 12
    ├─ CCU ──────────────────► FLD-2.3-13 CCU spec ─► no annexes
    ├─ Polymer ──────────────► FLD-2.3-14 Polymer spec ─► Annex 1, 6, 10, 11, 12
    ├─ Waste / Side stream ──► FLD-2.3-15 Waste spec ─► no annexes
    └─ Chemical recycling ───► FLD-2.3-16 Chem. recycling spec ─► no annexes
  FLD-2.3-10 Country ─► "Annex 1 – Country of origin (auto-fill)"  [target field does not exist in new version]
  Always shown & mandatory: FLD-A1-102 Feedstock · FLD-2.1-102 Natural origin index · FLD-A1-103 · FLD-A1-104

MANUFACTURING PROCESS (= Annex 2) — shown for ALL origins (open [Review])
  FLD-A2-101 INCI (pre-filled, editable)
  FLD-A2-102 Manufacturing process (single-select)
    ├─ Chemical · Physical · Enzymatic
    ├─ Biotechnology / Fermentation ─► Annex 3 (GMO) "if GMO – outside test scope" [no GMO question exists]
    └─ Other ─► FLD-A2-103 Manufacturing process (individual)

ANNEX 1 — active if FLD-2.3-01 ∈ {Bio Mass, Mineral, Petrochemical, Polymer}
  FLD-A1-201 Pesticides analysis available?
    ├─ Yes ─► FLD-A1-202 upload (PDF)
    └─ No ──► FLD-A1-203 reason (text)
  FLD-A1-204 Palm (kernel) oil used as feedstock?
    └─ Yes ─► FLD-A1-206 RSPO: Mass Balance | Segregated | Identity Preserved | No RSPO certification
                 └─ No RSPO certification ─► FLD-A1-207 Other certification?
                                                └─ Yes ─► FLD-A1-208 name + certificate upload

ANNEX 4 — active if FLD-2.3-01 = Petrochemical
  FLD-A4-101 MOAH concentration (unit open)
  FLD-A4-102 Kinematic viscosity at 100 °C availability
    └─ Available ─► FLD-A4-103 [Conclusion by analogy | Own value] + value mm²/s + analytical-data upload
```
- The origin option rows also reference **Annex 3, 6, 7, 9, 10, 11 and 12**, but the sheet has **no fields for those annexes** (verified). Annex 3 is explicitly "outside test scope" [FLM 'CIQ new version' r41].

### C. Sheet "Notes & change log"

#### C.1 Legend [FLM changelog r1–r6]
| Marking | Meaning |
|---|---|
| Green | Cell filled. It was empty before (source: **CIQ 2026 Word template** / field catalogue) |
| Orange | Cell corrected: dependency, field ID, field type, validation or option changed. The old value is in the change log |
| Blue | Remark updated: resolved review notes removed, new notes added |
| No colour | Content unchanged (translated only) |
| `[Review]` | **Open point: business decision required** |

#### C.2 General changes [FLM changelog r8–r12]
- **Language:** the "CIQ new version" sheet was fully translated into English. The Feldkatalog sheet was left unchanged as a historical reference (r9).
- **Terminology:** mandatory values harmonised: Muss/ja → Mandatory, kann/nein → Optional, Bedingt-Muss → Conditional mandatory (r10). The old value "Soll" (should) is not mapped (inferred gap).
- **Dependencies:** "Controlled by" is always written as `<Field ID> = <value>`. Every dependent field references its controlling field, and the controlling field references it back (r11).
- **Field IDs:** the options of one field share one ID (FLD-2.3-01, FLD-A2-102). New IDs are FLD-2.3-11 … -16 (specification fields) and FLD-A1-208 (r12).

#### C.3 Change-log statistics (r16–r182, 167 entries; computed)
- By change type: 77 "Filled (was empty)", 65 "Corrected", 25 "Remark updated".
- By column: Remarks/Open Points 36, Controls 24, Controlled by 23, Validation/Format 22, Field ID 14, Upload Required 10, CIQ Requirement ID 9, Dependent 8, Mandatory 7, Auto-Fill 7, Approval 6, Field Type 1.
- Column A ("Row") points to rows of "CIQ new version". All 167 Row/Field ID pairs match the current sheet (verified).
- **The "Remarks / Open Points" column referenced by 36 entries does not exist in "CIQ new version"** (sheet ends at column M). Remarks survive only in the change log (verified).
- **Nine cells are cut off at exactly 200 characters in the source file** (F23, F25, G35, F123, G123, G126, F132, G132, G162). These are cut off in the original file; the dump is not at fault (verified).

#### C.4 All `[Review]` items, which are BDF's own open questions (15 change-log entries contain the tag)

**Still open (the tag appears in the current "New value"):**

| # | CL row | Field ID (sheet row) | `[Review]` text (EN, near-verbatim) | Status / note |
|---|---|---|---|---|
| R1 | r17 | FLD-GEN-002 Supplier (name) (r3) | "Supplier address is no longer captured (field catalogue: name & address). Please confirm that it is not required." | Open |
| R2 | r20 | FLD-GEN-008 Contact person e-mail (r4) | "No field for the contact person's name in the new structure. Confirm (field catalogue FLD-VER-003)." | Open |
| R3 | r30 | FLD-2.1-004 Additive? (r13) | "Either define follow-up fields or set 'Controls' to 'No'." | Open. The sheet still says "follow-up fields still open" |
| R4 | r35 | FLD-2.3-01 Source of origin (r16) | "CIQ 2.3 allows several answers ('More than one answer is possible'). A radio button permits only one origin per component. Please confir[m]" | Open. **Truncated in the source** |
| R5 | r126 | FLD-A1-103 Content [%] in INCI (r34) | "In the CIQ only required if Annex 1 applies (Bio Mass, Mineral, Petrochemical, Polymer); currently mandatory for all origins. Please conf[irm]" | Open. Truncated |
| R6 | r127 | FLD-A1-104 Content [%] in raw material (r35) | "See FLD-A1-103." | Open |
| R7 | r129 | FLD-A2-101 INCI (Manufacturing) (r37) | "In the CIQ, Annex 2 is only triggered by Bio Mass (vegetable); currently shown for all origins. Please confirm." | Open (related to OP-03, Annex 2 trigger [KB OpenPoints OP-03]) |
| R8 | r132 | FLD-A2-102 Manufacturing process (r38) | "CIQ Annex 2 uses checkboxes (multiple selection). Check single[-select]…" | Open. Truncated |
| R9 | r172 | FLD-A1-208 Other certification (name) (r51) | "The CIQ only asks for free text; the upload requirement is a BDF extension. Please confirm." | Open |
| R10 | r174 | FLD-A4-101 MOAH concentration (r53) | "Clarify unit." | Open. The sheet assumes mg/kg or % |

**Resolved (the tag appears only in the "Old value"):**

| # | CL row | Field ID | Old `[Review]` (translated from German) | How it was resolved |
|---|---|---|---|---|
| R11 | r23 | FLD-GEN-009 | "Add e-mail format validation. [Review] Mandatory is set to 'kann' (optional), but field catalogue (FLD-VER-005) and REQ-PROC-003 make the e-mail the basis for access/notification = 'Muss' (mandatory). Please decid[e]" (truncated) | Kept Optional ("Optional second supplier contact"). FLD-GEN-008 is the mandatory contact |
| R12 | r24 | FLD-GEN-003 | "Label contains '(name and address)': probably a copy error, the field contains only the DUNS no." | Label corrected; remark is now "Key search field (REQ-PROC-005)" |
| R13 | r25 | FLD-GEN-005 | "Only one production site (aligned with business departments), so FLD-GEN-006/-007 (further production sites) are dropped. CIQ note: further sites were only informative. [Review] Typo 'aderesse'" (truncated) | Typo fixed; **single production site confirmed** |
| R14 | r33 | FLD-2.1-007 | "'0–110 %' is probably a typo; field catalogue says 0–100 %." | Corrected to 0–100 % (r32) |
| R15 | r123 | FLD-A1-102 | "Palm detection (RSPO, SF-08) via free text cannot be evaluated by rules. Proposal: D…" (truncated) | Resolved: "Palm use is now captured explicitly via FLD-A1-204, so the free text does not need to be rul[e-evaluable]" (truncated) |
| R16 | r132 (2nd tag) | FLD-A2-102 | "[Review] Column I is set for Chemical, Phy[sical]…" (truncated) | Column I (Controlled by) changed from "ja" to "n/a" on all five options (r131, r134, r136, r138) |
| R17 | r174 | FLD-A4-101 | "Clarify mandatory and unit." | Mandatory decided (Mandatory); unit still open (R10) |

**Other open notes without the tag:**
- FLD-2.3-10 "multiple countries – **to be clarified**" [FLM changelog r41]. The sheet cell drops "to be clarified" [FLM 'CIQ new version' r19].
- FLD-A2-102 Biotechnology/Fermentation, old remark: "CIQ: for GMO additionally Annex 3 (GMO). Column J is set to 'no'. Please check (**Annex 3 is outside the test scope**)" [FLM changelog r140] → now "Annex 3 (GMO), if GMO – outside test scope" [FLM changelog r139].
- FLD-A1-206: "Check rule: RSPO Mass Balance is the minimum for palm. 'No RSPO certification' is a deviation to be assessed by BDF. **CIQ also requires the RSPO certificate no. on the CoA of ea[ch …]**" (truncated) [FLM changelog r162].

#### C.5 Per-field change digest (old → new; German translated)
| Field | CL rows | Changes |
|---|---|---|
| FLD-GEN-002 | r16–17 | Validation "Free text / address block" → "Free text (supplier name)" (**address dropped**); remark with R1 |
| FLD-GEN-008 | r18–20 | Validation "is pre-filled automatically" → "E-mail format (validation); pre-filled automatically from supplier master data". Controls "no" → "Supplier access and task notification (REQ-PROC-003)". Old remark: "New field in the new structure; functionally the **successor of FLD-VER-003 (Person responsible)**. The named supplier contact receives access (REQ-PROC-003)". New remark: "Primary supplier contact; receives access and task notification" + R2 |
| FLD-GEN-009 | r21–23 | Validation "Entry should be possible" → "E-mail format (validation); manual entry possible". Controls "Supplier access & notification" → "Additional recipient of notifications (if filled)". Remark → "Optional second supplier contact" (R11) |
| FLD-GEN-003 | r24 | Remark (R12) |
| FLD-GEN-005 | r25 | Remark: one production site only; FLD-GEN-006/-007 dropped (R13) |
| FLD-2.1-001 | r26–27 | Dependent "n/a" → "No". Controls "no" → "Pre-fill of FLD-A2-101 (INCI in Manufacturing process)". **The sheet still shows "No"** |
| FLD-2.1-002 | r28 | Validation gets "validated only if filled" |
| FLD-2.1-003 | r29 | Validation gets "validated only if filled" |
| FLD-2.1-004 | r30 | Remark: "Marks intentionally added additives (CIQ footnote 3)" + R3 |
| FLD-2.1-005 | r31 | Remark filled: "CIQ section 2.1." |
| FLD-2.1-007 | r32–33 | "0–110 %; range min–max allowed" → "0–100 %; range min–max allowed; min ≤ max". Remark: "Basis for limit value / safety assessment. Corrected from '0–110 %' (typo)" |
| FLD-2.3-01 Bio Mass | r34–35 | Controls formalised (Part, Country, Annex 1, 2, 3, 9, 10, 11, 12). Remark: "CIQ 2.3 'Please specify sources/parts' = FLD-2.1-101" + R4 |
| FLD-2.3-01 Animal | r36–38 | Controls formalised. **Upload "No" → "Yes – BSE/TSE certificate; confirmation entry no. 419"**. Remark: "CIQ additionally requires a BSE/TSE certificate and confirmation of entry no. 419, Annex II Reg. (EC) 1223/2009 (**or BDF template**)" |
| FLD-2.1-101 Part | r39–40 | Mandatory "Yes" → Conditional mandatory. Controlled by formalised |
| FLD-2.3-10 Country | r41–42 | Validation "Clarify multiple entry of several countries of origin" → "…multiple countries – to be clarified". Controlled by formalised |
| FLD-2.3-01 Petrochemical | r43–45 | Typo "Pertochemical" fixed. Controls adds FLD-2.3-11. Remark: "CIQ 2.3 'Fossil (e.g. oil/wax/gas…) – please specify' = FLD-2.3-11" |
| FLD-2.3-11 | r46–54 | New row with all columns filled. Old "Controlled by" was "shown if FLD-2.3-01 = true". Remark: "CIQ 2.3: 'Please specify'. Shown only when the option is selected." |
| FLD-2.3-01 Mineral | r55–56 | Controls adds FLD-2.3-12. Remark "CIQ 2.3 'Mineral – please specify' = FLD-2.3-12" |
| FLD-2.3-12 | r57–67 | New row, all columns filled (Conditional mandatory, Approval RMM) |
| FLD-2.3-01 CCU | r68–69 | Controls "no annexes (only 'please specify')" → "FLD-2.3-13; no annexes". Remark "CIQ 2.3 'CO/CO2 via CCU – please specify' = FLD-2.3-13. No annex required." |
| FLD-2.3-13 | r70–80 | New row, all columns filled |
| FLD-2.3-01 Polymer | r81–82 | Controls adds FLD-2.3-14. Remark "CIQ 2.3 'Polymer – please specify'" |
| FLD-2.3-14 | r83–93 | New row, all columns filled |
| FLD-2.3-01 Waste | r94–96 | **Field ID FLD-2.3-05 → FLD-2.3-01**. Controls → FLD-2.3-15; no annexes |
| FLD-2.3-15 | r97–107 | New row, all columns filled |
| FLD-2.3-01 Chem. recycling | r108–110 | **Field ID FLD-2.3-08 → FLD-2.3-01**. Controls → FLD-2.3-16; no annexes |
| FLD-2.3-16 | r111–121 | New row, all columns filled |
| FLD-A1-102 Feedstock | r122–123 | Controls "n/a" → "No". Remark: "**Replaces FLD-2.1-006** (source of origin as text) and is also column 'Source / Feedstock' in Annex 1 table 1…" (R15) |
| FLD-2.1-102 NOI | r124–125 | Type "text (number)" → Number (decimal). "0-1" → "0–1 (decimal, max. 2 decimals)" |
| FLD-A1-103 / -104 | r126–127 | Remark: "**Moved from Annex 1 table 1 into the Meta Data block**" + R5/R6 |
| FLD-A2-101 | r128–129 | Controlled by → "FLD-2.1-001 (pre-fill)". Remark "Corresponds to Annex 2 (Manufacturing Process), **per INCI component**" + R7 |
| FLD-A2-102 (5 options) | r130–143 | IDs **FLD-A2-102.1 … .5 → FLD-A2-102**. Controlled by "yes" → n/a. Biotech Controls "no" → "Annex 3 (GMO), if GMO – outside test scope". Option "Sonstige" → "Other", whose Controls "yes" → FLD-A2-103. Remark: "Options of field FLD-A2-102 (Chemical … Other). Field ID harmonised… analogous to Source of origin" + R8 |
| FLD-A2-103 | r144–146 | Mandatory "yes" → Conditional mandatory. "Free text" → "Free text, e.g. hydrolysis, refining, synthesis, fermentation; mandatory if visible". Controlled by "yes – 'Other' in Manufacturing process" → "FLD-A2-102 = Other" |
| FLD-A1-201 | r147–149 | "Boolean; if true → upload field mandatory" → "Radio Yes/No; Yes → upload mandatory, No → reason mandatory". Controlled by formalised. Upload "Yes (if ticked)" → "No (upload in FLD-A1-202)" |
| FLD-A1-202 | r150–151 | Controlled by "= true" → "= Yes". Remark "CIQ: 'Please attach analysis'." |
| FLD-A1-204 | r152–159 | New: Req IDs REQ-PROC-006; REQ-CFG-103, Radio Yes/No, Dependent, Controlled by, Controls FLD-A1-206. Remark "CIQ Annex 1 section 5 ('No palm (kernel) oil used as feedstock'). **Rule SF-08 (REQ-CFG-103)**." |
| FLD-A1-206 | r160–162 | Controlled by "FLD-A1-204 = yes; only then visible" → "FLD-A1-204 = Yes". Controls → "FLD-A1-207 (if 'No RSPO certification')". Old remark "RSPO Mass Balance is the minimum for palm"; new remark adds the deviation rule and the RSPO no. on CoA (truncated) |
| FLD-A1-207 | r163–166 | Validation "Upload?" → "Radio Yes/No". Controlled by → "FLD-A1-206 = No RSPO certification". Controls "no" → FLD-A1-208. Old remark "Check rule: at least Mass Balance" → "CIQ Annex 1 section 5: 'Other certification available'" |
| FLD-A1-208 | r167–172 | **New field**. Validation "Upload?" → free-text name + attached certificate upload. Dependent "je" (typo) → Yes. Controlled by → "FLD-A1-207 = Yes". R9 |
| FLD-A4-101 | r173–174 | Controlled by formalised. Remark "CIQ Annex 4 section 1 (**determined by online HPLC-GC-FID or suitable method**)" + R10 |
| FLD-A4-102 | r175–177 | Controls "FLD-A4-103, FLD-A4-104" → "FLD-A4-103 (if Available)". Remark: "CIQ Annex 4 section 3. **Options simplified vs. CIQ (Not available / Conclusion by analogy / Own value)**; value type is captured in FLD-A4-103" |
| FLD-A4-103 | r178–182 | Req IDs add REQ-PROC-010. Validation → "Checkbox: Conclusion by analogy / Own value; number > 0, unit mm²/s (cSt)". Controlled by "≠ Not available" → "= Available". Upload "No" → "Yes". Remark: "**Former upload field FLD-A4-104 was removed**; the upload is now attached to this field" |

**IDs retired or renumbered:** FLD-GEN-006, FLD-GEN-007 (further sites); FLD-2.1-006 (replaced by FLD-A1-102); FLD-2.3-05 and FLD-2.3-08 used as option IDs (merged into FLD-2.3-01); FLD-A2-102.1–.5 (merged into FLD-A2-102); FLD-A4-104 (removed upload field) [FLM changelog r25, r94, r108, r123, r130–141, r182].

### D. Sheet "Feldkatalog (Feldebene)": old German field catalogue, translated

Column meanings (translated header): A Field ID · B CIQ section · C Field / column · D Field type · E Mandatory (Muss = must, Soll = should, kann = optional, Bedingt-Muss = conditional must) · F Validation / format · G Dependency / trigger · H Auto-fill / default · I Upload required · J **Justification if N/A** · K Approval · **L Ref. v3.1 (REQ-ID) [hidden]** · **M Ref. process/config [hidden]** · N Remark / open point · O (no header) [Feldkatalog r1].

| r | Field ID | Sect. | Field (EN) | Type | Mand. | Validation / format | Dependency / trigger | Auto-fill / default | Upl. | Just. N/A | Approval | L (hidden) | M (hidden) | N Remark (+O) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2 | *Section 0: Process start & master data (General information / Verification: RMM start PS-01 & metadata PS-02)* | | | | | | | | | | | | | |
| 3 | FLD-GEN-001 | Gen. info | Trade name | Text | Must | Free text; trade name of the raw material | Mandatory start field | Can be pre-set by RMM at creation | No | No | RMM | REQ-PROC-001; REQ-PROC-005 | PS-01 / K-Start | Mandatory at CIQ creation; **blocks start if empty** |
| 4 | FLD-GEN-002 | Gen. info | Supplier (**name & address**) | Text | Must | Free text / address block | Mandatory start field | AUTO-FILL from **Teamcenter** master data possible | No | No | RMM | REQ-PROC-001; REQ-PROC-104 | PS-01 | Pre-population from existing data (REQ-PROC-104) |
| 5 | FLD-GEN-003 | Gen. info | Supplier's DUNS-Number | Text/Number | Must | 9-digit DUNS; format check | Mandatory start field | AUTO-FILL from master data | No | No | **Supplier** | REQ-PROC-001; REQ-PROC-005 | PS-01 | Important search field (REQ-PROC-005) |
| 6 | FLD-GEN-004 | Gen. info | Manufacturer (name & address) | Text | Must | Free text / address block | Mandatory start field | AUTO-FILL from master data possible | No | No | Supplier | REQ-CFG-105 | PS-01 / CFG | Part of the supplier structure (REQ-CFG-105) |
| 7 | FLD-GEN-005 | Gen. info | Production site (**city & country**) | Text | Must | City + country | Mandatory start field | AUTO-FILL from master data possible | No | No | Supplier | REQ-CFG-105 | PS-01 / CFG | **Several sites per CIQ project possible** |
| 8 | FLD-GEN-006 | Gen. info | Are further production sites available? (Yes/No) *[yellow]* | Yes/No | Optional | Boolean; controls follow-up field | Trigger for "Please specify location" | — | No | No | RMM / Supplier *[yellow]* | REQ-CFG-105 | PS-02 / **SF-02** | Configuration question SF-02 (additional sites). **O8: "Open point, clarify with Proc"** *[yellow]* |
| 9 | FLD-GEN-007 | Gen. info | Please specify location (further sites) *[yellow]* | Text | Optional | Free text; mandatory if Yes | Triggered by FLD-GEN-006 = Yes | — | No | No | RMM / Supplier *[yellow]* | REQ-CFG-105; REQ-PROC-004 | PS-02 / SF-02 | Further sites only informative, **not released for supply** (CIQ note) |
| 10 | FLD-VER-001 *[A–C red]* | Verification | Company responsible for providing information | Text | Optional | Free text / company name | Sign-off block | — | No | No | RMM / Supplier *[yellow]* | REQ-PROC-005 | PS-02 | Verification / sign-off information |
| 11 | FLD-VER-002 | *(empty; row merged A11:N11)* | | | | | | | | | | | | |
| 12 | FLD-VER-003 | Verification | Person responsible for providing information | Text | Must | Name | Sign-off block | Can be pre-set from named supplier contact | No | No | RMM | REQ-CFG-105; REQ-PROC-003 | PS-02 | Relates to the supplier contact (REQ-PROC-003) |
| 13 | FLD-VER-004 | Verification | Telephone and fax number *[yellow]* | Text | Should | Telephone format | Sign-off block | — | No | No | Supplier | REQ-CFG-105 | PS-02 | — |
| 14 | FLD-VER-005 | Verification | Email address | Text | Must | E-mail format (validation) | Sign-off block | Can be pre-set from contact; **controls access/notification** | No | No | RMM Supplier | REQ-PROC-003; REQ-CTL-012 | PS-02 | Basis for access & notifications |
| 15 | *(no ID)* | Verification | **Digital signature** *[yellow]* | — | — | — | — | — | — | — | — | — | — | — |
| 16 | *Section 2.1: Components and additives (component table, repeatable; data basis for many follow-up checks)* | | | | | | | | | | | | | |
| 17 | FLD-2.1-001 | 2.1 | INCI (European) / IUPAC | Text | Must | INCI name; if no INCI: chem. name (IUPAC); for colorants additionally Colour Index no. | Row of the component table | — | No | No | RMM | REQ-PROC-005 | K2.1 | CIQ footnote 1; **mandatory per component** |
| 18 | FLD-2.1-002 | 2.1 | CAS-No. | Text/Number | **Must** *[yellow]* | CAS format nnnnnnn-nn-n (check digit) | Row of the component table | — | No | No | RMM | REQ-PROC-005 | K2.1 | Format-check validation recommended |
| 19 | FLD-2.1-003 | 2.1 | EC Number | Text/Number | Should | EINECS/ELINCS/NLP or REACH reg. no. | Row of the component table | — | No | No | RMM | REQ-PROC-005 | K2.1 | CIQ footnote 2 |
| 20 | FLD-2.1-004 | 2.1 | Additive? (yes/no) | Yes/No | Must | Boolean (checkbox yes/no) | Controls additional information on additives | — | No | No | RMM | REQ-PROC-005 | K2.1 | Marks intentionally added additives (footnote 3) |
| 21 | FLD-2.1-005 | 2.1 | Function of component | Text | Must | Free text, e.g. preservative, solvent | Row of the component table | — | No | No | RMM | REQ-PROC-005 | K2.1 | — |
| 22 | FLD-2.1-006 | 2.1 | Source of origin | Text | Must | e.g. oil palm, soy, sunflower | Row of the component table | Pre-population possible from 2.3 origin type | No | No | RMM | REQ-PROC-005 | K2.1 / K2.3 | Footnote 4; relates to configuration SF-01 |
| 23 | FLD-2.1-007 | 2.1 | Concentration Range [%] | Number+Unit | Must | 0–100 %; range min–max allowed | Row of the component table | — | No | No | RMM | REQ-PROC-005 | K2.1 | Basis for limit-value / safety assessment |
| 24 | FLD-2.1-008 | 2.1 | Component row (table) | **Table (repeatable)** | Must | **Any number of rows; min. 1** | — | — | No | No | RMM | REQ-CFG-102 | K2.1 | **Repeatable table explicitly required as a field type (REQ-CFG-102)** |
| 25 | *Section 2.2: Byproducts and contaminations (incl. Annex 14: heavy metals, residues/limits, specific impurities, CMR)* | | | | | | | | | | | | | |
| 26 | FLD-2.2-001 | 2.2 | Analytical evidence (≥ 2 batches) | File upload | Must | ≥ 2 batch reports; PDF preferred | Always for 2.2 | — | Yes | No | RMM / Regulatory / Safety / Sustainability | REQ-PROC-010; REQ-PROC-016(?) *[L26 light orange]* | K2.2 | "At least two batches" mandatory; **fix the review version** |
| 27 | FLD-A14-101 | Annex 14 / T1 | Heavy metal **As** – Confirmed | Checkbox+Number | Cond. must | Measured value [mg/kg]; **limit ≤ 0.5 mg/kg**; Confirmed = true only if value ≤ limit | Active with 2.2 (Byproducts) | — | No | **Yes (on deviation)** | RMM / Regulatory / Safety / Sustainability | REQ-PROC-106 | A14 T1 / K2.2 | Quantitative limit check against BDF value 0.5 |
| 28 | FLD-A14-102 | Annex 14 / T1 | Heavy metal **Cd** – Confirmed | Checkbox+Number | Cond. must | Measured value [mg/kg]; **limit ≤ 0.1 mg/kg**; Confirmed = true only if value ≤ limit | Active with 2.2 | — | No | Yes (on deviation) | same | REQ-PROC-106 | A14 T1 / K2.2 | Quantitative limit check against BDF value 0.1 |
| 29 | FLD-A14-103 | Annex 14 / T1 | Heavy metal **Cr** – Confirmed | Checkbox+Number | Cond. must | Measured value [mg/kg]; **limit ≤ 5.0 mg/kg**; Confirmed = true only if value ≤ limit | Active with 2.2 | — | No | Yes (on deviation) | same | REQ-PROC-106 | A14 T1 / K2.2 | Quantitative limit check against BDF value 5.0 |
| 30 | *Section 2.3: Source or type of starting materials (BASIS FOR CONFIGURATION: configuration questions SF-01 ff.)* | | | | | | | | | | | | | |
| 31 | FLD-2.3-01 | 2.3 | Origin type: Vegetable origin (Yes/No) | Checkbox / **Multi-Select** | Must | **Multiple selection possible** | Configuration input SF-01 | Feeds auto-fill of 2.1 Source of origin | No | No | Supplier | REQ-PROC-006; REQ-CFG-103 | K2.3 / SF-01 | Controls mandatory annexes A1, A2, A3, A9, A10, A11, A12; **RSPO for palm** |
| 32 | FLD-2.3-02 | 2.3 | Origin type: Animal origin (Yes/No) | Checkbox / Multi-Select | Must | Multiple selection possible | Configuration input SF-01 | Feeds auto-fill 2.1 | No | No | RMM / Regulatory / Safety / Sustainability | REQ-PROC-006; REQ-CFG-103 | K2.3 / SF-01 | BSE/TSE certificate; entry No. 419; A10–A12 |
| 33 | FLD-2.3-03 | 2.3 | Origin type: Mineral (Yes/No) | Checkbox / Multi-Select | Must | Multiple selection possible | Configuration input SF-01 | Feeds auto-fill 2.1 | No | No | same | same | K2.3 / SF-01 | **A10, A11, A12** (differs from new version, see gaps) |
| 34 | FLD-2.3-04 | 2.3 | Origin type: Petrochemical / Fossil (Yes/No) | Checkbox / Multi-Select | Must | Multiple selection possible | Configuration input SF-01 | Feeds auto-fill 2.1 | No | No | same | same | K2.3 / SF-01 | A1, A4, A9, A10, A11, A12 |
| 35 | FLD-2.3-05 | 2.3 | Origin type: Waste / Side stream (Yes/No) | Checkbox / Multi-Select | Must | Multiple selection possible | Configuration input SF-01 | Feeds auto-fill 2.1 | No | No | same | same | K2.3 / SF-01 | No annexes (information only) |
| 36 | FLD-2.3-06 | 2.3 | Origin type: Carbon Capture Utilisation (CCU) (Yes/No) | Checkbox / Multi-Select | Must | Multiple selection possible | Configuration input SF-01 | Feeds auto-fill 2.1 | No | No | same | same | K2.3 / SF-01 | No annexes |
| 37 | FLD-2.3-07 | 2.3 | Origin type: Polymer (Yes/No) | Checkbox / Multi-Select | Must | Multiple selection possible | Configuration input SF-01 | Feeds auto-fill 2.1 | No | No | same | same | K2.3 / SF-01 | A1, A6, A10, A11, A12 |
| 38 | FLD-2.3-08 | 2.3 | Origin type: Chemical recycling of post-consumer plastic (Yes/No) | Checkbox / Multi-Select | Must | Multiple selection possible | Configuration input SF-01 | Feeds auto-fill 2.1 | No | No | same | same | K2.3 / SF-01 | No annexes |
| 39 | *Section 4.1: Toxicity data (rule: a ticked "attached" box → evidence upload possible/required)* | | | | | | | | | | | | | |
| 40 | FLD-4.1-001 | 4.1 | Partition coefficient (n-octanol/water) | Number | Should | logKow value | — | — | No | No | Safety / Toxicology | REQ-PROC-005 | K4.1 | Single value before the endpoint table |
| 41 | FLD-4.1-101 | 4.1 | Endpoint: Acute toxicity – oral – attached (checkbox) | Checkbox | Should | Boolean; if true → upload field mandatory | Controls the associated upload field | — | Yes (if ticked) | No | Safety / Toxicology | REQ-PROC-010 | K4.1 | **CORE RULE: ticking "attached" activates mandatory upload of the study evidence** |
| 42 | FLD-4.1-102 | 4.1 | Endpoint: Acute toxicity – dermal – attached (checkbox) | Checkbox | Should | same | same | — | Yes (if ticked) | No | Safety / Toxicology | REQ-PROC-010 | K4.1 | Same core rule |
| 43 | FLD-4.1-103 | *(empty; row merged A43:N43)* | | | | | | | | | | | | |
| 44 | FLD-4.1-104 | 4.1 | Endpoint: Skin irritation – attached (checkbox) | Checkbox | Should | same | same | — | Yes (if ticked) | No | Safety / Toxicology | REQ-PROC-010 | K4.1 | Same core rule |
| 45 | *Section 6.1: EU REACH (incl. CONTROL of Annex 10: ticking "See BDF REACH questionnaire (Annex 10)" activates Annex 10)* | | | | | | | | | | | | | |
| 46 | FLD-6.1-001 | 6.1 | Reg. status: Registration numbers listed below *[comment]* | Checkbox | Should | Boolean | One of 4 status options | — | No | No | Regulatory | REQ-PROC-005 | K6.1 | — |
| 47 | FLD-6.1-002 | 6.1 | Reg. status: Numbers in SDS (attached) | Checkbox | Should | Boolean; if true → SDS upload | Activates SDS upload | — | Yes (if ticked) | No | Regulatory | REQ-PROC-010 | K6.1 | — |
| 48 | FLD-6.1-003 | 6.1 | Reg. status: described in company statement (attached) | Checkbox | Should | Boolean; if true → statement upload | Activates statement upload | — | Yes (if ticked) | No | Regulatory | REQ-PROC-010 | K6.1 | — |
| 49 | FLD-6.1-004 | 6.1 | CONTROL: See BDF REACH questionnaire (Annex 10) | Checkbox | Cond. must | Boolean; true → Annex 10 activated/mandatory | Controls activation of Annex 10 | Activates the Annex 10 section | No | No | Regulatory | **REQ-ADR-003; REQ-CFG-103** | K6.1 / A10 | **CORE RULE: tick activates Annex 10 as an additional CIQ part** |
| 50 | FLD-6.1-005 | 6.1 | Annex XIV (Authorisation) – CAS | Text/Number | Cond. must | CAS format | If substance listed | — | No | No | Regulatory | REQ-PROC-005 | K6.1 / A10 | — |
| 51 | FLD-6.1-006 | 6.1 | Annex XIV – Substance / further details | Text | Cond. must | Free text | If substance listed | — | No | No | Regulatory | REQ-PROC-005 | K6.1 | — |
| 52 | FLD-6.1-007 | 6.1 | Annex XVII (Restriction) – CAS / Substance / Details | Text | Cond. must | Free text + CAS | If substance listed | — | No | No | Regulatory | REQ-PROC-005 | K6.1 | — |
| 53 | FLD-6.1-008 | 6.1 | SVHC Art. 59 (Candidate List) – CAS / Substance / Details | Text | Cond. must | Free text + CAS | If substance listed | — | No | No | Regulatory | REQ-PROC-005 | K6.1 | — |
| 54 | FLD-6.1-009 | 6.1 | Annex 10 activated (derived state) | Yes/No (system) | — | System status from FLD-6.1-004 / SF rule | Result of the control | — | No | No | **System** | REQ-PROC-006 | A10 | Documented traceably (rule justification) |
| 55 | *Annex 1, Table 1 (Feedstock, content and origin) (AUTO-FILL: INCI transferred automatically from 2.1)* | | | | | | | | | | | | | |
| 56 | FLD-A1-101 | Annex 1 / T1 | INCI | Text | Must | INCI as in 2.1 | Row of Annex 1 table 1 | **AUTO-FILL from FLD-2.1-001 (INCI)** | No | No | Sustainability / Safety | REQ-PROC-033; REQ-PROC-005 | A1 / K2.1 | **CORE RULE: automatic transfer of INCI values from 2.1; source traceable** |
| 57 | FLD-A1-102 | Annex 1 / T1 | Source / Feedstock | Text | Must | Free text | Row of Annex 1 table 1 | Suggestion from 2.1 "Source of origin" / 2.3 | No | No | Sustainability | REQ-PROC-005 | A1 | To be confirmed/supplemented by supplier |
| 58 | FLD-A1-103 | Annex 1 / T1 | Content [%] in INCI | Number+Unit | Must | 0–100 % | Row of Annex 1 table 1 | — | No | No | Sustainability | REQ-PROC-005 | A1 | % based on molecular weight (CIQ note) |
| 59 | FLD-A1-104 | Annex 1 / T1 | Content [%] in Raw Material | Number+Unit | Must | 0–100 % | Row of Annex 1 table 1 | Consistency check vs. 2.1 Concentration Range | No | No | Sustainability | REQ-PROC-005 | A1 / K2.1 | Plausibility check vs. 2.1 possible |
| 60 | FLD-A1-105 | Annex 1 / T1 | Country of origin | Text | Must | Country | Row of Annex 1 table 1 | **AUTO-FILL from FLD-2.3-10 (country of origin)** | No | No | Sustainability | REQ-PROC-005 | A1 / K2.3 | Transfer from 2.3 possible, editable |
| 61 | FLD-A1-106 | Annex 1 / T1 | Feedstock row (table) | Table (repeatable) | Must | **1 row per component** | Number of rows follows the 2.1 components | **AUTO-generation of rows from 2.1** | No | No | Sustainability | REQ-CFG-102; REQ-PROC-033 | A1 / K2.1 | Row structure pre-populated from 2.1 |

**Cell comment on C46** (FLD-6.1-001), author Pevzner, Alexander: "Hier bitte prüfen, ob die Begründung notwendig ist / Kommentar Wieke: Welche Begründung?" Translation: *"Please check here whether the justification is necessary." Then "Comment Wieke: Which justification?"* This is an unresolved internal exchange. It most likely concerns column J "Justification if N/A" or a justification for the registration status (inferred) [Feldkatalog C46 comment].

**Colour markings in the Feldkatalog (no legend in this workbook):**
- **Yellow:** C8, K8, O8 (FLD-GEN-006 name, approval, and "Open point, clarify with Proc"), C9 and K9 (FLD-GEN-007 name, approval), K10 (FLD-VER-001 approval), C13 (FLD-VER-004 "Telephone and fax number"), C15 ("Digital signature"), E18 (FLD-2.1-002 CAS "Must"). The only explicit text is O8 = "Offener Punkt, mit Proc klären" (open point, clarify with "Proc"). "Proc" is not expanded: it may mean Procurement or Process (inferred). The BRM legend defines yellow as "Open business question" [BRM Legend r7], so these are probably open points (inferred). **Every yellow item was dropped or changed in the new version**: further sites, VER-001, phone/fax and digital signature were dropped, and CAS changed Must → Optional (inferred from comparison).
- **Red:** A10:C10 (FLD-VER-001 "Company responsible for providing information"). Meaning is not stated; it is probably marked for deletion, and it is absent from the new version (inferred).
- **Light orange:** L26 (hidden column, "REQ-PROC-010; REQ-PROC-016(?)"). The uncertain requirement reference carries a "(?)".
- Explicit black font on K8, K9, K10 and K14 (approval cells) suggests they were edited (low significance; inferred).

### E. Old vs new structure: comparison

| Topic | Old Feldkatalog | New version | Effect / note |
|---|---|---|---|
| Supplier | "Supplier (name & address)" [Feldkatalog r4] | "Supplier (name)" [FLM 'CIQ new version' r3] | **Address dropped.** Open: R1 |
| Supplier contact | Verification block: company responsible (VER-001), **person responsible: name (VER-003, Must)**, phone/fax (VER-004), e-mail (VER-005, Must, controls access), digital signature [Feldkatalog r10–r15] | Contact e-mail (GEN-008, M) + e-mail 2 (GEN-009, O) only [r4–r5] | **Contact name, phone, company and digital signature dropped.** GEN-008 is the successor of VER-003 [FLM changelog r20]. Open: R2 |
| Production sites | Production site (city & country), "several sites per CIQ project possible", plus FLD-GEN-006/-007 further sites (SF-02) [Feldkatalog r7–r9] | One production site (name & address) [r9] | **Further sites dropped**: "aligned with business departments" [FLM changelog r25]. SF-02 has no field |
| Who fills or owns the identity fields | DUNS / Manufacturer / Site: Approval = Supplier, "Mandatory start field" (PS-01) [Feldkatalog r5–r7] | Same fields under "Meta Data", Approval = RMM [r7–r9] | Moved from start (PS-01) to metadata (PS-02) (inferred) |
| Components (K2.1) | **Repeatable component table**, any number of rows, min. 1 (FLD-2.1-008, REQ-CFG-102); every field "row of the component table"; "mandatory per component" [Feldkatalog r16–r24] | **Single fields**, no table type used anywhere [r10–r15] | One component per case, unless the block is repeated (inferred). Conflicts with [ReqDoc p.6 §4.1 K2.1] "Table with any number of components" and [BRM REQ-CFG-002], [BRM REQ-PROC-006], [BRM REQ-PROC-029] (component 3) |
| CAS / EC | CAS Must (yellow), EC Should | CAS Optional, EC Optional; validated only if filled | Relaxed |
| Source of origin (text, 2.1) | FLD-2.1-006 text (e.g. oil palm, soy) | Replaced by FLD-A1-102 Feedstock (Meta Data) [FLM changelog r123] | |
| Origin type (2.3) | **8 separate Yes/No checkboxes, "multiple selection possible"**, FLD-2.3-01…-08 [Feldkatalog r31–r38] | **One radio button** FLD-2.3-01 with 8 options [r16–r31] | **Multi-origin materials cannot be expressed.** Open: R4. KB asks the same question [KB SF-01] |
| Origin wording | "Vegetable origin", "Petrochemical / Fossil" | "Bio Mass (vegetable)", "Petrochemical" (+ "Fossil specification") | |
| Origin follow-ups | None (only "please specify" in the remarks) | Part (multi-select, 20 options), Country of origin, 6 specification text fields | New detail |
| Mineral → annexes | A10, A11, A12 [Feldkatalog r33] | Annex 1, 7, 10, 11, 12 [r22] | New version matches [ReqDoc p.11 §5.4]; KB flags A1/A7 for mineral as suspicious [KB ConfigRules R-13] |
| 2.2 byproducts + Annex 14 heavy metals | ≥ 2 batch-report upload; As ≤ 0.5, Cd ≤ 0.1, Cr ≤ 5.0 mg/kg with justification on deviation [Feldkatalog r26–r29] | **Absent** | Out of the new field set |
| 4.1 Toxicity | logKow + endpoint checkboxes (oral, dermal, [103 empty], skin irritation) → upload [Feldkatalog r40–r44] | **Absent** | |
| 6.1 EU REACH | 4 status checkboxes; Annex 10 activated by a checkbox; Annex XIV / XVII / SVHC details; system flag [Feldkatalog r46–r54] | **Absent**; Annex 10 is instead triggered by origin [r16–r26] | Trigger logic for A10 changed (see gaps) |
| Annex 1 table 1 | Repeatable rows auto-generated per 2.1 component; INCI auto-fill; country auto-fill from FLD-2.3-10 [Feldkatalog r56–r61] | A1-102/-103/-104 moved into Meta Data as single always-mandatory fields; A1-101, A1-105, A1-106 dropped; new A1-201…-208 (pesticides, palm/RSPO, other certification) | Annex 1 section 5 (palm) is now in-form logic |
| Annex 2, Annex 4 | Not in the old catalogue | New (FLD-A2-101…103, FLD-A4-101…103) | |
| Field-type vocabulary | 10 types | 15 types (+ Radio button, Dropdown, Number (decimal), Text/Number, Checkbox+Number) | |
| Justification-if-N/A column | Column J present | **No such column** | Only FLD-A1-203 (reason if no pesticide analysis) captures a justification |
| Approval values | Supplier / RMM / Regulatory / Safety / Sustainability / System / mixed | RMM / Regulatory / Safety only | |

### F. Assessment: is the "new version" field set the MVP or test scope?

**Stated facts:**
- The new version covers only Process Start, Meta Data, Manufacturing process (Annex 2), Annex 1 and Annex 4 [FLM 'CIQ new version' col A].
- One option explicitly says "Annex 3 (GMO), if GMO – **outside test scope**" [FLM 'CIQ new version' r41]. The original German note says "Annex 3 liegt außerhalb des Testumfangs" (Annex 3 lies outside the test scope) [FLM changelog r140].
- The requirements PDF ties A4 to the MVP: "Workshop notes: MVP, show and hide separately, either/or/both (OP-02)" [ReqDoc p.8 §4.2 A4].
- Single production site "aligned with business departments" [FLM changelog r25]. Teamcenter auto-fill is labelled "post-MVP" [FLM 'CIQ new version' r3].

**Assessment (inferred):** the field set is very likely **the field-level test scope that BDF will use to build and compare the vendor MVPs**. It is not the full CIQ. Reasons:
1. "Test scope" only makes sense if a defined test scope exists. Annex 3 is the one origin-triggered annex called out as excluded, which implies the annexes that do have fields (1, 2, 4) are included.
2. The slice is compact but exercises every key mechanic in the requirements:
   - RMM case start with mandatory fields (REQ-PROC-001)
   - supplier metadata with format checks (REQ-PROC-005)
   - a rule-driving origin question (SF-01 → annex activation, REQ-PROC-009/-010)
   - conditional visibility and conditional mandatory
   - nested conditions (palm → RSPO → other certification, cf. REQ-CFG-003's "SF-01 AND SF-08" example)
   - uploads tied to answers (REQ-PROC-011)
   - cross-field pre-fill (INCI → Annex 2)
   - numeric validation
   - approval or review by three different departments (RMM, Regulatory, Safety), which allows parallel subprocesses (REQ-PROC-017/-018) to be tested
3. It was edited on 2 Oct 2026, right before vendor discovery, and the file name says v0.6. It is a working draft, not a finished catalogue.

**Caveats and counter-evidence:**
- The sheet is never labelled "MVP" or "test".
- The BRM marks the whole requirement set as MVP, and its acceptance criteria refer to content **outside** this field set:
  - K2.2 (REQ-CFG-006, REQ-PROC-011)
  - K5.1 / SF-12 (REQ-PROC-012)
  - "K2.1, component 3" (REQ-PROC-029)
  - a "Turkey REACH" section (REQ-CFG-001)
  - "all field types" including Date and repeatable Table (REQ-CFG-002); neither type is used here.
- The "always" sections K1, K5.2, K6.1 and A10 [KB ConfigRules R-00] have no fields here.
- Annexes 6, 7, 9, 10, 11 and 12 are triggered by origin but have no fields. So either the MVP shows them as empty or placeholder sections, or BDF expects vendors to model them from the CIQ Word template, which was not shared (inferred).

**Conclusion:** treat the new version as the probable test or demo slice and confirm it explicitly. The BRM describes platform capabilities; this matrix most likely describes the content BDF will test them with (inferred).

---

## Notable details, gaps & internal inconsistencies

**Within the workbook**
1. **Change log and sheet disagree on FLD-2.1-001 "Controls".** The log says "Pre-fill of FLD-A2-101" [FLM changelog r27]; the sheet says "No" [FLM 'CIQ new version' r10]. This breaks the stated rule that dependencies are referenced both ways [FLM changelog r11].
2. **Change log and sheet disagree on FLD-2.3-10 validation.** The "– to be clarified" wording [FLM changelog r41] is missing from the sheet [r19].
3. **Dangling reference.** FLD-2.3-10 "Controls: Annex 1 – Country of origin (auto-fill)" [r19], but the Annex 1 country field (old FLD-A1-105) no longer exists in the new version.
4. **FLD-A1-104 "Auto-Fill" holds a validation rule** ("Consistency check against concentration range (FLD-2.1-007)") [r35]. The rule itself is undefined: what must be consistent with what, and is the check blocking or a warning? (inferred). FLD-2.1-007 does not list it under Controls.
5. **"Remarks / Open Points" column referenced but absent.** 36 change-log entries refer to it [FLM changelog]; the sheet has no such column. BDF's open notes are only visible in the change log.
6. **Source truncation.** Nine change-log cells are cut at 200 characters (R4, R5, R8, R11, R13, R15, R16, FLD-A1-206 remark). Ask BDF for the full text, especially R4 and the RSPO/CoA rule.
7. **No numbering gap explanation for FLD-A1-205.** The sequence goes 201–204, 206–208 [r45–r51]. FLD-GEN numbering also jumps (001–005, 008, 009) because 006/007 were dropped.
8. **Fields marked "Mandatory" that are dependent.** FLD-A1-201, -204, FLD-A4-101 and -102 are Dependent = Yes yet Mandatory, not Conditional mandatory (terminology inconsistency; inferred).
9. **FLD-2.3-10 type.** "Text" type but "multiple countries" [r19]. A free-text multi-country field cannot be analysed. Compare REQ-PROC-006, which requires structured, analysable data (inferred).
10. **FLD-2.1-101 Part includes "no entry"** as an option of a conditional-mandatory field, which effectively makes it skippable. Animal-relevant parts are limited to "Wool"/"Skin" (inferred) [r18].
11. **FLD-A4-103 type "Checkbox+Number" with two mutually exclusive meanings** (Conclusion by analogy / Own value). "Upload if a value is entered": it is unclear whether a value derived "by analogy" also needs analytical data (inferred) [r55; FLM changelog r177].
12. **FLD-2.1-004 Additive has no follow-ups** [r13; FLM changelog r30]. Additive details (identity, function, concentration) are not captured.
13. **Approval column is undefined.** Its values differ from the department ownership in the requirements PDF:
    - K2.1 is owned by Regulatory [ReqDoc p.6 §4.1], but the FLM gives RMM [r10–r15].
    - A1 is owned by Safety and Sustainability [ReqDoc p.8 §4.2]; Sustainability owns A1 [ReqDoc p.9 §4.3]. The FLM gives Regulatory [r45–r51].
    - A2 is owned by Regulatory, Safety (lead) [ReqDoc p.8]. The FLM gives RMM [r37–r43].
    - A4 is owned by Safety, which matches.
14. **"CIQ 2026 Word template" is the stated source** for filled cells [FLM changelog r2]. Remarks quote its sections ("CIQ footnote 3", "CIQ 2.3", "CIQ Annex 1 section 5", "CIQ Annex 4 section 1/3"). **That document is not among the shared files.**

**Versus other BDF documents**

15. **Palm question shown for Mineral contradicts the BRM.** FLD-A1-204 is active for Bio Mass, **Mineral**, Petrochemical or Polymer [r48]. [BRM REQ-PROC-009] acceptance says: for origin "mineral", A3 and **the palm/RSPO part of A1 are not visible to the supplier**. The pesticide question is likewise asked for Mineral/Petrochemical/Polymer [r45], whereas [ReqDoc p.11 §5.4] lists pesticide and mycotoxin analysis only for Vegetable.
16. **RSPO evidence missing.** [ReqDoc p.11 §5.4] requires an "RSPO certificate with supply chain model, RSPO number on the CoA", and [BRM REQ-CFG-003] expects "A1 section 5 **plus RSPO evidence**". The FLM has only the supply-chain-model select (FLD-A1-206, Upload = No) and no RSPO certificate upload or RSPO number field. The FLM remark itself notes the CoA requirement (truncated) [FLM changelog r162].
17. **Mycotoxin analysis and "sustainability certificates" (Vegetable evidence) [ReqDoc p.11 §5.4] have no fields.**
18. **Annex 10 trigger: three different logics.**
    - Always [ReqDoc p.8 §4.2 A10; KB ConfigRules R-00].
    - By origin, absent for CCU / Waste / Chemical recycling [ReqDoc p.11–12 §5.4; FLM r16–r31].
    - By a checkbox in K6.1 [Feldkatalog r49].
19. **SF-07 and SF-08 replaced.** Annex 4 is derived from FLD-2.3-01 = Petrochemical [r53–r55], not from SF-07 "mineral-oil-based or hydrocarbon" [ReqDoc p.10 §5.3]. The palm question (SF-08) moved inside Annex 1 [FLM changelog r159]. Configuration questions SF-02…SF-07 and SF-09…SF-12 have **no fields** (verified). This answers KB's question about whether SF-07 is derivable from SF-01 (A4 only) [KB SF-07], but it needs confirmation.
20. **"Meta Data" contains CIQ content.** K2.1 composition and A1 content fields sit in "Meta Data" [r10–r35], whereas the PDF limits PS-02 to "information needed for configuration" [ReqDoc p.3 §3.1.2]. This is a deliberate BDF move: the change log says "Moved from Annex 1 table 1 into the Meta Data block" [FLM changelog r126].
21. **Process Start lacks the "responsible BDF owner".** [BRM REQ-PROC-001] makes it mandatory at creation, and [BRM REQ-PROC-046] e-mails the final PDF to the RMM owner. The FLM Process Start has no such field. There is also no BDF material number or IRMA reference (proposed in [KB ConfigQuestions BD-04]).
22. **Single production site vs the functional catalogue.** [CIA #28] multi-level supplier structures (main supplier and production sites), [CIA #30] production-site qualification and [CIA #31] production-site approval (Must Have) imply multi-site handling. The FLM fixes one site [FLM changelog r25], and [ReqDoc p.10 §5.3] still lists SF-02.
23. **Supplier master data source undefined in the MVP.** The FLM pre-fills e-mail, DUNS, manufacturer and site "from master data" [r4, r7–r9], but integrations are out of scope for 2026 [ReqDoc p.2 §1.1] and Teamcenter auto-fill is post-MVP [r3]. In the MVP a platform-internal supplier master would be needed (inferred). Compare [CIA #24] supplier contact database (Nice to Have).
24. **Confirmations need name and e-mail, but there is no name field.** [BRM REQ-PROC-014/-015/-042] require confirmations with name, (role), e-mail and timestamp. Without a contact-name field (R2) these must come from the user account (inferred).
25. **Natural origin index (0–1)** [r33] is a new concept not mentioned in the PDF, BRM or KB (verified). It probably refers to ISO 16128 (inferred, external knowledge).
26. **Heavy-metal limits (old catalogue) are the only numeric BDF limit values in the shared documents:** As ≤ 0.5, Cd ≤ 0.1, Cr ≤ 5.0 mg/kg [Feldkatalog r27–r29] (verified by search). The PDF says K2.2 limits come from Annex 14, which was folded into K2 [ReqDoc p.6, p.9]; KB raises the same issue [KB OpenPoints NEW-06]. In the old catalogue, "Confirmed = true only if value ≤ limit" plus "justification on deviation" is an example of REQ-RMES-008 quantitative checks [ReqDoc p.13].
27. **Possible content of the empty FLD-4.1-103.** It sits between "acute dermal" and "skin irritation", exactly where the IKW template lists "Acute toxicity: inhalation" [IKW p.12] (inferred).
28. **Old catalogue validation list does not match its own data.** Types "Text/Zahl", "Checkbox+Zahl", "Checkbox / Multi-Select" and "Ja/Nein (System)" are used but not in its list. The list covers only D2:D48 [Feldkatalog DV].

### Candidate clarification questions arising from this file (inferred)
- Is the "CIQ new version" field set the exact content scope for the MVP build and test? What does "test scope" include (Annex 1, 2, 4) and exclude (Annex 3, others)?
- Is the Meta Data block one per raw material, or repeated per INCI component? How are multi-component raw materials handled (old catalogue: repeatable table)?
- Should origin be single-choice (radio) or multiple-choice, per component or per raw material (R4)?
- Please decide each open `[Review]` item R1–R10. Please also share the full text of truncated remarks and the **CIQ 2026 Word template**.
- What does the "Approval" column mean: reviewing department, approver, or field owner? Why does it differ from the PDF's ownership table (A1 → Sustainability, A2 → Safety lead, K2.1 → Regulatory)?
- Where does "supplier master data" come from in the MVP, given that integrations are out of scope?
- Should the palm and pesticide questions really appear for Mineral, Petrochemical and Polymer (conflicts with REQ-PROC-009)? Where are the RSPO certificate upload and the RSPO number?
- Are Annexes 6, 7, 9, 10, 11 and 12 expected in the MVP even though they have no fields?
- What is the unit for MOAH? What exactly is the consistency rule between "Content in raw material" and "Concentration range"?
- Who is "Wieke"? Who is "Proc"? Is the C46 justification question still relevant?

---

## Cross-references to other documents

**Requirement IDs used in the FLM (hidden col B, old col L) vs the shared BRM**

| ID | Where used | In BRM? | Note |
|---|---|---|---|
| REQ-PROC-001 | GEN-001/-002/-003/-008 | Yes: create CIQ project manually | Consistent |
| REQ-PROC-004 | old FLD-GEN-007 | Yes: supplier access, metadata only | |
| REQ-PROC-005 | Most fields | Yes: mandatory-field check for metadata | Also applied to Annex fields (broad use) |
| REQ-PROC-006 | FLD-2.3-01, A1-204, A1-206, old 6.1-009 | Yes: structured analysable data | |
| REQ-PROC-010 | Upload-related fields | Yes: but it means "classification mandatory/optional/N.A." | Semantic mismatch (inferred) |
| REQ-PROC-016 | old FLD-2.2-001, written "(?)" | Yes: fixing the review version | Uncertain in the source |
| REQ-PROC-033 | old FLD-A1-101, A1-106 (INCI auto-fill, row generation) | Yes: but it means "complete communication history" | **Semantic mismatch**, so a different numbering (inferred) |
| REQ-PROC-003 | GEN-008, GEN-009, old VER-003/-005 | **No** | Supplier access and notification. Closest BRM: REQ-PROC-004 / REQ-CTL-010 (inferred) |
| REQ-PROC-104 | GEN-002 (Teamcenter auto-fill) | **No** | Labelled post-MVP. Suggests the BRM is an MVP-only extract of a larger matrix (inferred) |
| REQ-PROC-106 | old A14 heavy metals | **No** | Quantitative limit check. Compare REQ-RMES-008 [ReqDoc p.13] |
| REQ-CFG-102 | old 2.1-008, A1-106 (repeatable table) | **No** | Content matches BRM REQ-CFG-002 "Field types" (inferred) |
| REQ-CFG-103 | FLD-2.3-01, A1-204, A1-206, old 6.1-004 | **No** | Content matches BRM REQ-CFG-003 (control table, SF-01 AND SF-08 example) (inferred) |
| REQ-CFG-105 | GEN-004/-005, old GEN-006/-007, VER-003/-004 | **No** | Supplier structure or sites. The BRM has no REQ-CFG-005 (its numbering jumps 004 → 006) (inferred) |
| REQ-CTL-012 | GEN-009, old VER-005 | **No** | Notification-related. Closest BRM: REQ-CTL-010 (inferred) |
| REQ-ADR-003 | old FLD-6.1-004 (Annex 10 activation) | **No** | BRM has only REQ-ADR-001/-002 (ADR-002 = activating additional CIQ parts) |

- The old column L header says the IDs refer to **"v3.1"** of a requirements set [Feldkatalog r1 L]. That version was not shared. Possible pattern: v3.1 REQ-CFG-1xx corresponds to BRM REQ-CFG-0xx (inferred, speculative; ask for the mapping).
- **Process / configuration IDs** (old col M): PS-01, PS-02 [ReqDoc p.2 §2.1; BRM]; "K-Start" (not defined anywhere); CFG; SF-01, SF-02 [ReqDoc p.10 §5.3]; K2.1, K2.2, K2.3, K4.1, K6.1 [ReqDoc §4.1]; A1, A10, "A14 T1" [ReqDoc §4.2; A14 "moved into main document"].
- **SF-08** referenced as "Rule SF-08 (REQ-CFG-103)" [FLM changelog r159, r123] corresponds to [ReqDoc p.10 §5.3 SF-08], [KB ConfigRules R-11, R-80].
- **Annex numbers** 1–4, 6, 7, 9–12 in Controls correspond to A1–A12 [ReqDoc p.8–9 §4.2]. The origin-to-annex mapping equals the [ReqDoc p.11–12 §5.4] table and [KB ConfigRules R-10…R-18].
- **"Entry no. 419" / Annex II Reg. (EC) 1223/2009 / "BDF template"**: [ReqDoc p.11 §5.4 Animal]. The "BDF template" is not shared.
- **OP references:** none appear in the FLM. Related open points: OP-02 (A4 display) ↔ FLD-A4-102/-103; OP-03 (A2 trigger) ↔ R7; OP-19 (binding configuration table) ↔ origin rules; OP-17 / supplier-level data ↔ master-data pre-fill [ReqDoc; KB OpenPoints].
- **KB overlap:** KB BD-01…BD-06 (proposed basic data) partly match FLD-GEN fields. KB Q-006…Q-012 (K2.1), Q-095…Q-097 (A1) and Q-102 (MOAH, "mg/kg?") overlap with FLM fields. KB NEW-01 says individual questions are not listed, so the KB author apparently did not have this FLM (inferred).
- **IKW template:** the field labels "INCI (European)", "Production site (city & country)" (old) and the Yes/No-per-origin pattern mirror the IKW template [IKW p.3–4]. See source note 07.
- **Defined but missing documents:** CIQ 2026 Word template [FLM changelog r2]; requirements "v3.1" [Feldkatalog L1]; BDF template for entry 419 [FLM changelog r38]; BDF REACH questionnaire (Annex 10) [Feldkatalog r49].
