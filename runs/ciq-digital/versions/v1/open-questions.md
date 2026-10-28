# Open questions: run `ciq-digital` (stage: brief)

Every assumption and ambiguity found while extracting the `domain` slice from `runs/current/brd.md`. Each line is a question with the default the domain currently uses. "Lnnn" is a line in `brd.md`. Part A (L9–86) overrides Part B (L90+).

## A. Knock-on effects of dropping A12 `CIQ Review Version` and A13 `CIQ Section Snapshot` (v2 override 1, L41)

1. **A14 Rev_No / Supersedes_Key.** A changed value now replaces the old one (L42). Should `CIQ Component` rows become current-state rows, with the old value kept in A27, and should Rev_No and Supersedes_Key be dropped? *Default: keep both fields (harmless) and treat rows as current-state.*
2. **A14 writers.** The plan lets the "accepting reviewer" write components (L240), but BDF roles never edit CIQ answers (L43). Should only intake and sync sessions mirror supplier values into A14? *Default: yes.*
3. **A18 Review_Version_Key.** It is removed (override 6, L51). Confirm that nothing else needs the version link. *Default: removed.*
4. **A18 RMES_Key format.** Should it be `<Case_Code>|<creation timestamp>` and still exactly one per case × cycle? *Default: yes.*
5. **A18 void duplicates.** Later duplicates are "marked void, never deleted" (L408), but no void field is named. Add a field, or rely on the rule that the earliest `_created_at` wins? *Default: no new field.*
6. **Key formats with "v1".** `Track_Key` (`…|v1|SAF|t1`, L404) and `Result_Key` (`…|v1|S-A1`, L409) contain the review-version number. Replace it with the cycle, e.g. `CIQ-2026-0142|1|SAF|t1` and `<RMES_Key>|S-A1`? *Default: yes.*
7. **Intake target list.** It is now A11, A14, A15, A18, A25, A27, A30 (L657 minus A12/A13). Confirm it. Also, how do A14/A15 stay current when the supplier keeps editing after PS-05 until PS-11? *Default: intake at PS-05, plus a re-sync by the next internal session after each traced supplier change.*
8. **Out_Of_Scope retention (REQ-CFG-009).** It lived on A13 (L392, L711). Under "scope only grows" no section ever leaves scope. Can we confirm that no carrier field is needed in the app? *Default: no field.*
9. **Final freeze fingerprint.** `Final_Hash` and `Final_Frozen_At` lived on A12 (L391, L712). Where should the final-release fingerprint live now? *Default: `Record_Hash` on the "Final release" `CIQ Confirmation` row.*
10. **"Impacted" RMES results (REQ-RMES-012).** These were derived from `Source_Section_Rev` against the latest accepted section revision (L410). What is the basis now that there are no snapshots? *Default: keep `Source_Section_Rev` if the portal still numbers section revisions; otherwise compare the A27-recorded basis value or document with the current one.*
11. **RMES prefill.** The plan prefilled "from snapshots" (L983). Should it now prefill from the supplier's current answers when the first SAF/REG session runs? *Default: yes.*
12. **A17 Accepted_Evidence_Ref.** The `snap:<key>` form is obsolete. Should the format be `doc:<file name>@<upload date>` or `field:<section>/<field>/<row>`? *Default: yes.*
13. **A27 Object_Version.** Answers and documents no longer have versions, so what should it hold? *Default: keep it for config and result revisions (`Rev_No`, `Result_Rev`), blank otherwise.*
14. **Part 2 changes vs v2.** The plan's accepted-change path (a reviewer creates a new section revision and snapshot, L612, L754) conflicts with "BDF never edits answers; supplier edits until PS-11" (L42–43). Do supplier change requests survive in Part 2, or only after the final release (refused and logged)? *Default: the supplier edits directly in Part 2; change requests apply only after PS-11. `CIQ OP Kind` keeps "Supplier change request", since lists are append-only.*
15. **Machine-written enumerations.** `Cycle_Origin` and `Capture_Event` (L531) disappear with A12/A13. Is any of their meaning (resubmission vs reactivation) still needed elsewhere? *Default: no; `Current_Cycle` + `Reactivates_Case_Item` carry it.*

## B. A11 `CIQ Scope Run` and "the scope only grows" (v2 override 2, L44)

16. **Scope_Trigger "Revert".** Is it meaningless if sections are never removed? Should we keep the list value unused (lists are append-only), or drop it before generating? *Default: keep it, unused.*
17. **Scope_Trigger "Configuration change".** Confirm that a re-derivation after a configuration change can only add sections. *Default: yes.*
18. **Diff_JSON.removed.** It is always empty now. Keep the `{added, removed, changed}` shape with `removed: []`? *Default: yes.*
19. **Configuration change that would make a section N.A.** Does the section stay in scope at its earlier applicability, with the reason recorded in Result_JSON? *Default: yes.*
20. **Override_Justification.** How is "mandatory justification" for a manual extension enforced on a Form with no step-level mandatory? *Default: UI gate plus an audit event; the field is not Form-mandatory because other triggers leave it blank.*

## C. `CIQ Case` contract fields

21. **Release_Path writer.** It is Text now, not a formula (L60 overrides L358). Who writes it? *Default: the G5 sync session writes "Yes"/"No" with the plan's logic before submitting Part 2. It is editable only at Part 2. If it is blank, the final-release step is skipped.*
22. **Overall_Approval_Required.** It is Text, not a Select (L60 overrides L354). Should the create-case session copy it from the pinned Settings (`overallApprovalRequired`) at Start, read-only after, with values exactly "Yes"/"No"? *Default: yes. The default value follows open decision 1 (L884: supplier release ends the case), i.e. "No".*
23. **Completeness_Confirm.** It is Text and new versus plan §4.4. What literal does I-1 write? *Default: "Confirmed" (the CIQP Confirm value).*
24. **Unstated contract types.** The contract does not state types for `Completeness_By_Email`, `Completeness_At`, `Final_Release_By_Email`, `Final_Release_By_Role` and `Final_Release_At`. Should we use the plan types (Email, DateTime, Text; L361)? *Default: yes.*
25. **Optional K-20b fields.** `Open_Tracks` / `Sync_Gate` on A9 were planned as a later graft (L360, L807). A published process can't gain fields over REST, and App Builder 1.0.0 can't edit after generating. Include them now or drop them? *Default: omit. The UI gate is primary, and trap T13 stays a stated residual risk.*
26. **Optional K-20 fields.** Same question for `Open_Blockers` / `Gate` on A16 and `Twin_Track` / `Open_Num` on A17. *Default: omit.*
27. **Dept_*_Active names.** "Dept_REG_Active … Dept_SUS_Active, Dept_RMM_Active" (L356) is read as REG, SAF, QM, MIC, SUS, RMM, in `CIQ Review Dept` order. Confirm. *Default: yes.*
28. **Case_Code with no UI tonight.** Case_Code is "app-generated with a collision check" (L342), but there is no UI tonight. Who generates it on cases created in the native form? *Default: the RMM types it at Start until the Workbench exists.*

## D. Lists

29. **`CIQ Yes No`.** It is still needed by `Dept_*_Active`, `Any_Dept_Rejected`, `Track_Closed` and every plan "(Yes/No)" field (D15, L198). Confirm that all those Yes/No fields are Selects on it. *Default: yes.*
30. **A16 `Activated`.** Should it be a Select on `CIQ Yes No` or Text? I-2 copies it and the `Dept_Gate` formula compares it with "Yes". *Default: Select on `CIQ Yes No`.*
31. **`CIQ Country Code`.** Which ISO 3166 alpha-2 subset should seed it (L519 says "subset (seeded)")? *Default: needs a value list; otherwise seed EU/UK/TR/CN/US/CA countries.*
32. **A24 `Linked_Kind`.** The values are Section / Finding / Open point. Should it be a Select on a new list (none exists in §5), or Text? *Default: Text, written by the UI.*

## E. Documents (v2 override 3, L45–48)

33. **A23 Doc_Key.** Does A23 `CIQ AI Suggestion` keep `Doc_Key` next to the file name + upload date? *Default: yes.*
34. **New field names for file name + upload date.** What should the fields that replace `*_Doc_Version` on A17, A19/A20 and A23 be called? *Default proposal: `Ref_Doc_File_Name` / `Ref_Doc_Uploaded_At` (A17), `Source_Doc_File_Name` / `Source_Doc_Uploaded_At` (A19/A20), `Doc_File_Name` / `Doc_Uploaded_At` (A23).*
35. **Portal tuple alignment.** A17 must carry "the same Ref tuple as the portal" (L398). Will the portal session also replace `Ref_Doc_Version` on `CIQP Query`? *Default: the portal session aligns; flag it in the cross-session contract.*
36. **A15 Uploaded_By.** It replaces the plan's `Uploaded_By_Email`. Should it be Text holding the uploader's e-mail? Suppliers are portal users, not app users. *Default: yes.*
37. **A15 File_Name vs Original_Title.** Keep both? *Default: yes. `File_Name` is the uploaded file's name; `Original_Title` is the supplier's title.*
38. **A15 Supersedes_Key.** Keep it as an optional "replaces an earlier file" pointer even though documents are unversioned? *Default: keep.*
39. **A27 document basis.** Should the data value and the document name + upload date of each assessment live in `Source_Refs_JSON` (no new field), or in dedicated fields? *Default: `Source_Refs_JSON`.*

## F. A24 `CIQ Internal Note` (v2 override 4, L49)

40. **Note_Dept.** The plan field is not in the v2 list. Confirm it is dropped. *Default: dropped.*
41. **Author and time.** These are required by v2 but no field names are given. Should we use the system created-by / created-at fields, or explicit fields? *Default: system fields.*

## G. Ownership (v2 override 5, L50)

42. **Co-departments.** With lead-only ownership, a co-department whose `coReviewMode = "Track"` (L588) no longer gets a track. QM on K2.2 reads and can raise queries under QM, but has no review task. Confirm. *Default: yes.*

## H. Fields and names the source leaves open

43. **A5 field `Contact`.** It is a Reference without an owner prefix, against the convention at L264 / R14. Rename it, e.g. `Case_Contact_Ref`, or keep the plan name? *Default: keep, since it is not on the forbidden list.*
44. **A26 field `Reason`.** "Reason" is a generic name listed in R14 (L1012). Rename it to `Delegation_Reason`? *Default: rename.*
45. **A26 types.** What are the types of `Grantor`, `Delegate`, `Delegation_Scope` and `Delegation_Dept`? *Default: User, User, Text, `CIQ Department`.*
46. **A29 case link.** A29 `CIQ Final Document` lists no `Case_Code` (L255). Add one so a PDF can be found per case? *Default: yes, as Text.*
47. **A30 lease holder.** The G4b lease writes "its id" on the Portal Link row (L751), but no field is named. Which field holds the lease holder? *Default: a Text field such as `Lease_Holder`, which needs approval.*
48. **A21/A22 "Source keys".** Are these the same `Source_*` set as on A19/A20? *Default: yes.*
49. **A17 Ref_Label.** Is the portal's `Ref_Label` part of the twin's tuple? *Default: yes, as Text.*
50. **A8, A28, A29, A30 fields.** Only §3.2 key fields are given for these. Are they enough? Should A8 store the initiator for the four-eyes check? *Default: key fields only; the initiator is the native created-by.*
51. **A23 case link.** A23 has no `Case_Code` or `Result_Key` in the source. Add `Case_Code`? *Default: yes.*

## I. Roles, grants and integrations

52. **CIQ Process Owner.** Does it have duties beyond the read-only "Auditor, Owner" column? *Default: read-only, like Auditor.*
53. **A23 grants for QM/MIC/SUS reviewers.** These are not stated (only "SAF, REG: E"). *Default: V, under REQ-PROC-019.*
54. **I-2 and I-4.** Are I-2 (track fan-out) and I-4 (PDF) authored in this run? Part A says to build data models, lists, roles, workflows and permissions; I-1/I-3/I-6 belong to the portal session. *Default: not tonight. Sessions create the activated tracks (the K-10 fallback).*
55. **CIQ Integration Service grants.** Should this run apply its grants before K-09 shows whether it needs membership at all (L622)? *Default: apply the §7.2 grants.*

56. **I-2 Track_Key.** I-2 field map (plan §10, brd L776) does not set `CIQ Review Track.Track_Key`. The duplicate check in intake (brd L589) keys on it. Should I-2 map it (for example `Case_Code|Current_Cycle|<Dept>`), or does intake derive it? Default: not mapped (D24).
