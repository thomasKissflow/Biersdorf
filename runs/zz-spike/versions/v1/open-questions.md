# Open questions: run `zz-spike` (stage 1, kf-ba, 2026-10-07)

The BRD (`runs/current/brd.md`) is silent on the points below. Each one has a default that keeps the harness exactly as specified: no flow, list, role, step or field is added. Downstream agents apply the defaults unless Thomas overrides them.

| # | Gap | Default (applied) | Evidence |
|---|---|---|---|
| OQ-01 | "Alternating" does not say which role owns the first branch. | Role A owns A, C and E; Role B owns B, D and F. | brd.md L16 |
| OQ-02 | The BRD does not say who sets Flag_A–Flag_F, or at which step. | Editable at "Spike prepare" (Role A), read-only everywhere else. | brd.md L14, L17 |
| OQ-03 | The BRD does not say where Spike_Decision is set. It must be set before "Spike not-equal step". | Editable at "Spike prepare" (Role A), read-only everywhere else. | brd.md L23 |
| OQ-04 | No list is named for To_Supplier (it is only "a Select"). | Reuse the list "CIQ ZZ Spike Yes No", so no third list is created. | brd.md L32 |
| OQ-05 | The BRD does not say where the Point scalar fields and To_Supplier are entered. | Round_No, Question_Text, Awaiting_Response, Due_Date and To_Supplier are editable at Start "Raise spike point". Response_Text is editable only at "Spike waiting" (as stated). | brd.md L31-41 |
| OQ-06 | No editable fields are stated for "Create spike case", "Spike hold check", "Spike gated step" or "Spike not-equal step". | No editable fields at those steps; all fields are visible read-only. "Spike gated step" carries only the stated Mandatory rule on the formula field Gate. | brd.md L13, L19, L22-23 |
| OQ-07 | The lane fields' types are not stated. | Lane_X_Confirm is a Select on "CIQ ZZ Spike Yes No". Lane_X_By is Text, Lane_X_At is DateTime and Lane_X_Note is Text. All are manual inputs, not auto-stamped. | brd.md L18 |
| OQ-08 | These other field types are not stated: Note_Text, Note_By, the Spike Rounds columns, Line_Text, Log_Key/Source/Event/Item_Id, and the output of Gate and Open_Count. | Text everywhere, except Spike Rounds.Round_No (Number, matching the header Round_No), Open_Count (Number aggregate) and Gate (Text formula). These are data-architect decisions; the defaults are listed only to block embellishment. | brd.md L26, L43, L48, L52 |
| OQ-09 | The BRD does not say whether Register_Case is required. | Not required. Register_Key is the only field stated as required. | brd.md L46-47 |
| OQ-10 | The BRD does not say whether a field is Mandatory anywhere beyond what it states. | Nothing else is Mandatory. The stated Mandatory rules are Lane_X_Confirm at its own branch, Gate at "Spike gated step" and Register_Key (required). | brd.md L18, L22, L46 |

## Downstream warning (not a question)
- **Round_No name clash:** CIQ ZZ Spike Point has a header field Round_No and also a column Round_No in its child table "Spike Rounds". Both are kept as stated (brd.md L37, L43). If the platform rejects a duplicate field ID across a header and its child table, kf-data-architect must report it. It must not rename the field silently.
