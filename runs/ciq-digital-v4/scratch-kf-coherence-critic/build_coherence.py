import json
OUT = "/Users/thomas/Documents/Kissflow Projects/POC/Beiersdorf/runs/ciq-digital-v4/scratch-kf-coherence-critic/coherence.json"
NA_UI = "n/a: no pages (EXP-HR1); native My Tasks reaches every human step; Workbench later"
M = []
def row(j, persona, data, path, perm, status, defects=(), risks=(), note=""):
    M.append({"journey": j, "persona": persona, "data": data, "workflow_path": path, "permission": perm,
              "landing_nav": NA_UI, "dashboard": "n/a (backend only)", "status": status,
              "defects": list(defects), "risks": list(risks), "note": note})
row("j01_create_case","p_rmm","ok: material, supplier, 4 contact fields, owner, due dates, pinned release all Mandatory at CASE_S0","ok: CASE_S0 -> CASE_S1","ok: RMM initiator on CIQ Case; writes CIQ Section (BASIC row)","ok")
row("j02_basic_data","p_rmm","ok: Basic_Data_Received M, Portal_Request_Item_Id E at CASE_S1","ok","ok: RMM holds CASE_S1 (manual fallback)","ok",risks=["R-03"])
row("j03_scope_check","p_rmm","ok: Dept_<D>_Active, RMES_Key, PS-05/PS-11 keys and texts M at CASE_S2","ok","ok: RMM writes CIQ Scope Run, CIQ Section; initiates CIQ Open Point","ok")
row("j04_completeness","p_rmm","ok: Completeness_* E, Completeness_At and RMES_Created_At M at CASE_S3","ok","ok","ok",risks=["R-03"])
row("j05_department_review","p_reg_reviewer +4 reviewers, RMM lane","ok: own lane fields M, <D>_Open_Count/<D>_RMES_Gaps E, <D>_Gate M at own branch","ok: 6 guarded arms, native join","ok: branch Act per role; blank count holds, writable at same step (no deadlock)","ok",risks=["R-01","R-07"])
row("j06_rmes_sheet","p_saf_reviewer, p_reg_reviewer","ok: F5/F6 header counts, lock, Criteria/Findings tables; SAF/REG_RMES_Decision M on lane","ok (Forms, writable any time)","ok: Safety writes F5 only, Regulatory writes F6 only, each reads the other","ok",risks=["R-04"])
row("j07_open_point_supplier","reviewers, p_rmm","gap: Start_Gate omits Query_Key, Portal_Contact_Ids, Awaiting_Response; F3 Portal_Contact_Ids optional","ok: S0 -> S1 (OP_To_Supplier) -> exactly one OPNT_R_<D>; Return = send-back","ok: RMM + 5 reviewers initiate; owning dept reviews; Rounds E only at OPNT_R_*","ok-with-issues",["COH-01","COH-02","COH-03","COH-08"],["R-03"])
row("j08_internal_points","p_rmm, reviewers","gap: contact changes cannot reach Case_Contacts_JSON/Portal_Contact_Ids after CASE_S3","ok: internal kinds skip OPNT_S1","ok","ok-with-issues",["COH-03","COH-04","COH-05"])
row("j09_open_items_checks","p_rmm","ok: counts, Hold_Override_Reason E, Open_Items_Gate/Hold_Note M at S5/S8","gap: S5 condition reads counts last writable before the fork","ok","ok-with-issues",["COH-04","COH-10"],["R-02"])
row("j10_overall_approval","p_overall_approver","ok: Overall_Decision/Decided_By M, Supplier_Closing_Text and Completion_Trigger E at CASE_S6; reads lane RMES decisions and OP Late_Decision","ok: Rejected skips CASE_S7, reaches End (Z1 neutral text)","ok: Act on CASE_S6, View on Open Point/RMES","ok",risks=["R-07"])
row("j11_final_release","p_rmm","gap: Final_PDF never writable (K-15)","ok: S7 (Y5 or manual with reason in Completion_Trigger) -> S8 -> End -> Z1","ok","ok-with-issues",["COH-09"],["R-02","R-03"])
row("j12_cancel_case","p_rmm, p_case_admin","ok: F8 Cancellation row (RMM, Case Admin write F8); Notify_Recipient","ok: native Reject at RMM steps; Part 2/S6 via flow Admin","risk: Case Admin capability exists only after REST flow Admin","ok-with-risk",risks=["R-05","R-06"])
row("j13_change_request","p_rmm, reviewers","gap: X6 inputs Notice_Kind and the case header not enforced at Triage; corrected markets cannot land on the case","risk: refused CR skips all five arms (join untested)","ok: Integration Service + RMM initiate; RMM triages; reviewers assess","ok-with-issues",["COH-06","COH-07"],["R-01"])
row("j14_supplier_master","p_rmm","ok: CIQ Supplier + Contacts, mirrors","n/a (Form)","ok: RMM writes; others read","ok")
row("j15_configuration","p_business_admin","ok: Config Version incl. Release rows (bundle + hash)","n/a (Form)","ok: Business Admin writes F2 and F8; no-Delete via REST (K-17)","ok")
row("j16_internal_chat","all internal roles","ok","n/a (Form)","ok: every internal role writes F7 (Reader per Q7); service has none","ok")
row("j17_audit_oversight","p_reader","ok","n/a (Form)","ok: Reader views F8; tamper-evident (RR-1, K-17)","ok")
row("j18_find_cases","p_rmm, reviewers, p_reader","ok: Search_* mirrors + Components on F3 with Case_Code/Case_Item_Id","n/a (Form)","ok: all internal roles view F3; RMM + service write","ok")
row("j19_sync_service","p_integration_service","ok","n/a","ok: view Case/OP/CR, write F3/F8, initiate CR; never acts after Start","ok",["COH-09"])
row("j20_reactivate_case","p_rmm","ok: Reactivates_Case_Item, Cycle_No; F4 reactivation run; F8 snapshots","ok","ok","ok")

INC = [
 {"id":"COH-01","kind":"handoff-input-not-enforced","severity":"major","flows":["CIQ_Open_Point_A00"],"journeys":["j07_open_point_supplier"],"personas":["reviewers","p_rmm","p_supplier"],
  "evidence":"Start_Gate (Mandatory at OPNT_S0) checks 9 fields but not Query_Key (E; CIQP Query 'Query Key' required), Portal_Contact_Ids (E; -> Assigned_Contacts, required) or Awaiting_Response (E; Y3 approves only while = 'Yes', BR-047).",
  "effect":"A supplier-facing point can be submitted without them: X3 creates no portal query, or Y3 never approves round 1. The point waits in 'Waiting for supplier' until the SLA breaches.",
  "fix":"In the to-supplier branch of Start_Gate, also require Query_Key and Portal_Contact_Ids to be non-blank and Awaiting_Response = \"Yes\".","owner":"kf-data-architect"},
 {"id":"COH-02","kind":"handoff-input-not-enforced","severity":"major","flows":["CIQ_Section_A00"],"journeys":["j03_scope_check","j07_open_point_supplier","j13_change_request"],"personas":["p_rmm","p_integration_service","p_supplier"],
  "evidence":"CIQ_Section_A00.Portal_Contact_Ids is not required. X2 maps it to CIQP Section Assigned_Contacts, which is required (PART C). Every F3 row is a portal twin (v4 L280).",
  "effect":"A section row without contacts creates no portal section, so the supplier never gets the section.",
  "fix":"Set required:true on CIQ_Section_A00.Portal_Contact_Ids.","owner":"kf-data-architect"},
 {"id":"COH-03","kind":"cross-container-contract-guard-missing","severity":"major","flows":["CIQ_Open_Point_A00"],"journeys":["j07_open_point_supplier","j08_internal_points"],"personas":["p_supplier","reviewers"],
  "evidence":"automations[0].cross_container_contract X3 fires on 'enters OPNT_S1' with no OP_To_Supplier guard. PART D L883 says 'X3, only when OP_To_Supplier = \"Yes\"'. The connector step-entry trigger fires even for skipped steps (v4 L310). X5 carries its own guard; X3 does not.",
  "effect":"Department review, Contact update and Internal review points would become supplier queries. That breaches BR-066 (never shared with the portal) and leaves phantom supplier tasks.",
  "fix":"Add the guard 'only when OP_To_Supplier = \"Yes\"' to X3 and X3b in the contract handed to the portal session.","owner":"kf-integration-analyst"},
 {"id":"COH-04","kind":"stale-hold-condition","severity":"major","flows":["CIQ_Case_A00"],"journeys":["j09_open_items_checks","j08_internal_points","j07_open_point_supplier","j13_change_request"],"personas":["p_rmm"],
  "evidence":"CASE_S5's condition Hold_For_Open_Items reads Open_Items_Count and Open_CR_Count. These are writable only at CASE_S2 and CASE_S3, both before the fork, and nobody writes the case during Part 2 (C3, D15). CASE_S3 is normally approved by Y4, not by a person.",
  "effect":"Any value written at S2/S3 is stale by construction. A 0 skips S5, so the following can pass to the PS-11 release request: RMM-owned points (the RMM lane is off by default), points raised after a lane signed off, contact updates and untriaged change requests. That violates BR-043 / REQ-PROC-036 natively, and only a Workbench convention protects it.",
  "fix":"Recommended, deterministic: make Open_Items_Count and Open_CR_Count ReadOnly at CASE_S2 and CASE_S3. They are then blank at the join, S5 always runs once, and RMM writes fresh counts there (matches v4 L395 'hold steps run unconditionally'). The alternative is that Thomas fixes the Workbench rule in D15.",
  "owner":"kf-workflow-designer (security_handoff) -> kf-security-designer recompiles; decision: Thomas (D15)"},
 {"id":"COH-05","kind":"write-path-missing","severity":"minor","flows":["CIQ_Case_A00"],"journeys":["j08_internal_points","j11_final_release"],"personas":["p_rmm","p_supplier"],
  "evidence":"After CASE_S3, Case_Contacts_JSON and Portal_Contact_Ids are ReadOnly at every step. Confirm_Contact_Ids and Supplier_Contact_Emails are writable only at S5, and the e-mails also at S8. A Contact update point (BR-033) has no step at which it can land fully.",
  "effect":"If S5 is skipped, X5 (Assigned_Contacts <- Confirm_Contact_Ids) and Z1 (Supplier_Contact_Emails) go to the old contacts, and the case contact list stays stale.",
  "fix":"Make Case_Contacts_JSON and Portal_Contact_Ids Editable at CASE_S5 (and S8), together with COH-04 so that S5 runs.","owner":"kf-workflow-designer"},
 {"id":"COH-06","kind":"write-path-missing","severity":"minor","flows":["CIQ_Case_A00","CIQ_Change_Request_A00"],"journeys":["j13_change_request"],"personas":["p_rmm","p_supplier"],
  "evidence":"v4 L257: a correction of a value RMM sets, e.g. the target markets. Target_Markets_Text is Editable only at CASE_S0 and S2, and Markets_Label only at S0.",
  "effect":"An accepted correction after Scope check lives only in the CR's Proposed_Value_JSON and the new F4 run. The case header and the PDF stay stale.",
  "fix":"Make Target_Markets_Text (and Markets_Label) Editable at CASE_S3 and CASE_S5.","owner":"kf-workflow-designer"},
 {"id":"COH-07","kind":"handoff-input-not-enforced","severity":"minor","flows":["CIQ_Change_Request_A00"],"journeys":["j13_change_request"],"personas":["p_rmm","p_supplier"],
  "evidence":"X6 -> CIQP Notice requires Notice Kind and the Case Code / Cycle No / Supplier Code header. At CHRQ_S1, Notice_Kind is only Editable. The header fields are writable only at CHRQ_S0, where nothing is Mandatory (D16).",
  "effect":"A Y6 copy gap or a hand-made fallback CR can't be repaired at Triage. X6 then fails, and the supplier never gets the outcome.",
  "fix":"At CHRQ_S1, make Notice_Kind Mandatory and Case_Code, Cycle_No and Supplier_Code Mandatory (or at least Editable).","owner":"kf-workflow-designer"},
 {"id":"COH-08","kind":"dead-end-outcome","severity":"minor","flows":["CIQ_Open_Point_A00"],"journeys":["j07_open_point_supplier"],"personas":["reviewers"],
  "evidence":"OP_Outcome is Mandatory at OPNT_R_* with list CIQ_OP_Outcome = Accepted, Returned, Withdrawn. A Return is meant to be the native send-back (BR-046). Open_Num = 1 unless the outcome is Accepted or Withdrawn.",
  "effect":"Submitting 'Returned' ends the item with Open_Num = 1, no next round and no X3. The point stays unresolved and no step can reopen it.",
  "fix":"Give OP_Outcome a two-value list (Accepted, Withdrawn) and keep 'Returned' for Rounds_Outcome only.","owner":"kf-data-architect"},
 {"id":"COH-09","kind":"orphan-field","severity":"minor","flows":["CIQ_Case_A00"],"journeys":["j11_final_release","j19_sync_service"],"personas":["p_integration_service","p_rmm"],
  "evidence":"CIQ_Case_A00.Final_PDF is the only process field that no step makes writable. Z1 rest_completion attaches it after End [unverified, K-15].",
  "effect":"If K-15 fails, the final document has no home in the app. It is e-mailed only.",
  "fix":"Record a fallback store in Z1 rest_completion, e.g. the PDF hash and file reference on the Z1 CIQ Audit Event row. Make K-15 an acceptance test.","owner":"kf-integration-analyst (+ kf-data-architect if a field is needed)"},
 {"id":"COH-10","kind":"gate-carry-over","severity":"minor","flows":["CIQ_Case_A00"],"journeys":["j09_open_items_checks"],"personas":["p_rmm"],
  "evidence":"Both open-items checks share Hold_Override_Reason. Open_Items_Gate returns 'OK' whenever it is non-blank.",
  "effect":"An override written at S5 makes the gate at S8 pass without a new reason.",
  "fix":"Have the Workbench clear Hold_Override_Reason on entering S8 (it is Editable there), or use a separate override per check.","owner":"kf-data-architect"}
]
RISKS = [
 {"id":"R-01","risk":"Parallel blocks where every arm is skipped: every refused CR (all Impact_<D> = 'No'), and Part 2 with no active department. If the join does not advance, every refused CR hangs and X6 never sends the refusal.","ref":"D9/AR01","owner":"kf-workflow-designer; test K-PAR"},
 {"id":"R-02","risk":"Close hold after Y5 (open-questions Q8): when Y5 approves CASE_S7, nobody refreshes the counts, so items opened during S7 skip CASE_S8.","owner":"kf-integration-analyst / portal session (Y5 blanks the counts) or Thomas"},
 {"id":"R-03","risk":"Y1/Y3/Y4/Y5 'Approve an item' is unverified (Q6, A2 L58). The waiting steps stay RMM-owned, so the manual fallback keeps each journey satisfiable.","owner":"portal session; test K-09b/c/g"},
 {"id":"R-04","risk":"The post-generate reset for reviewers and the Overall Approver on CIQ Case is 'Permission [] or [View]'. [] would break security.satisfiability.readers and possibly the RMES Result_Case lookup. Choose [View].","owner":"kf-security-designer"},
 {"id":"R-05","risk":"Until flow Admin is granted over REST, CIQ Case Admin has no native capability. That covers cancelling during Part 2 or Overall approval, and ending stray P2/P3 items (j12).","owner":"kf-security-designer / kf-author; acceptance after REST"},
 {"id":"R-06","risk":"The foundation contract at rev 8 has 9 open findings. Six are in automations (invalid-business-logic): the `_id` Reference mapped into Text Case_Item_Id/Object_Item_Id in Z1, Z3 and Z4; the Z2 condition is an object, not an expression string; plus one more. One is platform: no adapter for 'notify' (Z2). Two are informational: the initiator mismatch (D18). They block accept-foundation, not journey semantics.","owner":"kf-integration-analyst (6), platform (1), conductor (2)"},
 {"id":"R-07","risk":"Runtime behaviour is unverified for: Mandatory formula gates on branches (K-20), `!=` on a blank Overall_Decision (K-PC), and branch-scoped permissions (K-OFF/K-PAR).","owner":"acceptance"}
]
slice = {
 "owner":"kf-coherence-critic","stage":"coherence gate","graph_revision_reviewed":8,
 "source":"graph rev 8 slices domain, architecture, data_model, workflow, security, automations, experience; brd.md PART A, B, C (PART D L883/L915 for X3 and withdrawal)",
 "deterministic_evidence":{
  "gate":"kf gate: 0 errors, 3 warnings (AUTO_SELF Z2 expected; NO_PAGES intended per EXP-HR1; ROLE_ACCESS_COLLAPSE QM/MIC/SUS is a false positive because they own disjoint steps CASE_B_*, OPNT_R_*, CHRQ_B_*)",
  "validate":"0 errors, 1 warning (AUTO_SELF)",
  "build_no_pages":"0 errors, 4 warnings (ORPHAN_ENTITY Connector x4, from the engine)",
  "foundation":"draft; 9 open findings (see R-06)"},
 "completeness_matrix":M,
 "role_purpose":{"dead_end_roles":[],"note":"All 11 custom roles have at least one journey plus a grant or step. QM, Microbiology and Sustainability Reviewers have identical flow grants but are differentiated by step ownership. Admin and User are platform defaults with no journey (by design, A3). Case Admin's capability depends on REST (R-05)."},
 "orphans":{"flows":[],"fields":["CIQ_Case_A00.Final_PDF (COH-09)"],"roles":[],"statuses":"n/a (no Case/Board flows)","reports":"n/a (no pages)"},
 "gates_and_counts":{"lane_gates":"ok: <D>_Open_Count/<D>_RMES_Gaps are Editable and <D>_Gate Mandatory at the lane's own branch, written by that reviewer. A blank count holds and the holder can always clear it.",
   "open_items_gate":"ok at S5/S8: counts, Hold_Override_Reason and Hold_Note are writable at the same step. The hold condition itself is stale (COH-04).",
   "start_gate":"incomplete (COH-01)","rmes_header_counts":"ok: F5/F6 are Forms, written by their own department at any time",
   "aggregates":"none authored (A2)"},
 "incoherences":INC,"risks":RISKS,
 "ratchet":[
  "RAT-1 ROLE_ACCESS_COLLAPSE: don't flag roles whose workflow assignee_role steps are disjoint.",
  "RAT-2 never-writable field: warn on a non-formula Process field that is ReadOnly at every step and has no declared post-End writer (would catch Final_PDF).",
  "RAT-3 stale hold: warn when a step condition reads fields whose last writable step is before an intervening parallel block.",
  "RAT-4 handoff input: a field mapped into a required target field (cross_container_contract or automation field_map) must be Mandatory or gate-checked at the step whose entry fires the handoff."],
 "verdict":"PASS-WITH-ISSUES",
 "verdict_note":"Every in-scope journey (j01-j20) has a satisfiable end-to-end path with the committed steps, fields and grants. There are no orphan flows and no dead-end roles. Fix COH-01 to COH-04 before generate; COH-04 needs Thomas's D15 choice. COH-05 to COH-10 are bounded repairs. R-06 must be cleared by kf-integration-analyst for accept-foundation."
}
json.dump(slice, open(OUT,"w"), indent=1, ensure_ascii=False)
print("ok", len(M), "rows", len(INC), "incoherences", len(RISKS), "risks")
