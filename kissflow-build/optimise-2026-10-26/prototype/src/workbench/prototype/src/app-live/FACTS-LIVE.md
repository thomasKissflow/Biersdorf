# Live facts for the app-live build (20 Oct, Kissflow-internal)

These override anything in DESIGN.md that differs.

## The supplier's answers on CIQ Case (portal session, 20 Oct; live, read back 15/15)

`CIQ_Case_A00` has 15 fields, **ReadOnly at every step**; only the integrations write them (admin route):

| Group | Fields |
|---|---|
| Answer documents | `Config_Answers_JSON`, `Answers_JSON`, `Answered_By_JSON`, `Justifications_JSON`, `Components_JSON` |
| Scope and documents | `Scope_JSON`, `Requested_Docs_JSON`, `Documents_JSON` |
| Change tracking | `Answers_Rev` (Number), `Answers_Changed_At` (DateTime), `Answers_Changed_By_Email` |
| Change report | `Change_Report_Text`, `Change_Report_Rev` (Number), `Change_Report_By_Email`, `Change_Report_At` |

- **Names and JSON shapes are identical to the portal's CIQP Request.** Parse them with the portal's own code, imported read-only:
  - `prototype/src/portal/data/answers.ts` `readDoc()` for the answer documents;
  - `prototype/src/portal/data/scope.ts` for `Scope_JSON` and `Requested_Docs_JSON`.
- **`Documents_JSON`:** `[{uploadId, attachmentId, fileName, docKind, sectionKey, fieldKey, rowId, uploadedByEmail, uploadedAt}]`. Removed files are left out.
- **How changes reach the app:** the hand-off is `request.changed {portalRequestItemId}`, called by the PORTAL screen. The integration copies the fields to the case. I-2 copies the same fields at completeness. The app UI never writes these fields; it only reads them.
- **Files:** whether an app user can open a portal attachment is unproven (a morning S-test). Until then, show the file name and date, and mark opening as unavailable.

## Shared modules from the portal session

`prototype/src/app-live/shared/` is written by the portal session. Do not edit it.
- `caseStartPayload.ts`: the values of the 6 CIQ Case Start fields, plus the field-name constants.
- `questionsHistory.ts`: the `Questions_History_JSON` for the `history.updated` webhook.
- `handoff.ts`: payload types only.
