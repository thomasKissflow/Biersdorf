import json
OUT = "/Users/thomas/Documents/Kissflow Projects/POC/Beiersdorf/runs/ciq-digital-v4/scratch-kf-coherence-critic/pass3-rev18/coherence.json"
NA_UI = "n/a: no pages (EXP-HR1); native My Tasks reaches every human step; Workbench later"
M = []
def row(j, persona, data, path, perm, status, defects=(), risks=(), note=""):
    M.append({"journey": j, "persona": persona, "data": data, "workflow_path": path, "permission": perm,
              "landing_nav": NA_UI, "dashboard": "n/a (backend only)", "status": status,
              "defects": list(defects), "risks": list(risks), "note": note})

row("j01_create_case", "p_rmm", "ok: material, supplier, 4 contact fields, owner, due dates, pinned release Mandatory at CASE_S0", "ok: CASE_S0 -> CASE_S1", "ok: RMM sole initiator; writes CIQ Section (BASIC row, Portal_Contact_Ids now required)", "ok")
row("j02_basic_data", "p_rmm", "ok: Basic_Data_Received M; contacts Editable at CASE_S1", "ok", "ok: RMM holds CASE_S1 (manual fallback)", "ok", risks=["R-03"])
row("j03_scope_check", "p_rmm", "ok: Dept_<D>_Active, RMES_Key, PS-05/PS-11 keys and texts M; counts now ReadOnly (D23)", "ok", "ok: RMM writes CIQ Scope Run, CIQ Section; initiates CIQ Open Point", "ok")
row("j04_completeness", "p_rmm", "ok: Completeness_* E, Completeness_At/RMES_Created_At M; counts ReadOnly, contacts Editable", "ok", "ok", "ok", risks=["R-03"])
row("j05_department_review", "5 reviewers + RMM lane", "ok: own lane fields M, <D>_Open_Count/<D>_RMES_Gaps E, <D>_Gate M at own branch", "ok: 6 guarded arms, native join (replayed 4 positive paths + 7 negative)", "ok: branch Act per role; reset keeps [View] (R-04 closed)", "ok", risks=["R-01", "R-07"])
row("j06_rmes_sheet", "p_saf_reviewer, p_reg_reviewer", "ok: F5/F6 header counts, Criteria/Findings tables; SAF/REG_RMES_Decision M on lane", "ok (Forms)", "ok: Safety writes F5 only, Regulatory F6 only; child-table grants mirror parent (K-17)", "ok")
row("j07_open_point_supplier", "reviewers, p_rmm", "gap: Rounds_Outcome (round history) is bound to CIQ_OP_Outcome, now Accepted/Withdrawn only, so a returned round cannot record 'Returned'. Start_Gate now enforces Query_Key, Portal_Contact_Ids, Awaiting_Response = Yes (COH-01 closed)", "ok: S0 -> S1 (OP_To_Supplier) -> exactly one OPNT_R_<D>; Return = send-back; X3/X3b guarded (COH-03 closed)", "ok: RMM + 5 reviewers initiate; owning dept reviews; Rounds E only at OPNT_R_*", "ok-with-issues", ["COH-11", "COH-12"], ["R-03"])
row("j08_internal_points", "p_rmm, reviewers", "ok: contact updates land at CASE_S1/S3/S5/S7/S8 (COH-05 closed)", "ok: internal kinds skip OPNT_S1; S5 always runs once", "ok", "ok")
row("j09_open_items_checks", "p_rmm", "ok: counts E at S5/S7/S8; separate Hold_Override_Reason_Release/_Close and Open_Items_Gate_Release/_Close (COH-10 closed)", "ok: counts blank at the join, so CASE_S5 always runs (COH-04 closed, D23); CASE_S8 runs only if counts at PS-11 are non-zero/blank", "ok", "ok-with-risk", risks=["R-02"], note="COH-04 fix is pending Thomas's confirmation (D23).")
row("j10_overall_approval", "p_overall_approver", "ok: Overall_Decision/Decided_By M at CASE_S6", "ok: Rejected skips CASE_S7, reaches End (Z1 neutral text); CASE_S5 now precedes S6", "ok: Act on CASE_S6; reset keeps [View]", "ok", risks=["R-07"])
row("j11_final_release", "p_rmm", "ok-with-gap: Final_PDF fallback store exists (F8 Event_File + category 'Final PDF') but Z1 rest_completion does not name it", "ok: S7 (Y5 or manual) -> S8 (if held) -> End -> Z1", "ok: Integration Service writes F8, so it can write Event_File", "ok-with-issues", ["COH-09"], ["R-02", "R-03"])
row("j12_cancel_case", "p_rmm, p_case_admin", "ok: F8 Cancellation row; Notify_Recipient", "ok: native Reject at RMM steps; Part 2/S6 via flow Admin", "risk: Case Admin capability exists only after REST flow Admin", "ok-with-risk", risks=["R-05", "R-06"])
row("j13_change_request", "p_rmm, reviewers", "ok: X6 inputs Mandatory at Triage (COH-07 closed); Target_Markets_Text lands at S5/S8 (COH-06 closed); Markets_Label stays S0-only (residual, minor)", "risk: refused CR skips all five arms (join untested); replayed 8 CR scenarios", "ok: Integration Service + RMM initiate; RMM triages; reviewers assess", "ok-with-risk", ["COH-06r"], ["R-01"])
row("j14_supplier_master", "p_rmm", "ok: CIQ Supplier + Contacts", "n/a (Form)", "ok: RMM writes; Contacts grant mirrors parent (K-17)", "ok")
row("j15_configuration", "p_business_admin", "ok: Config Version incl. Release rows", "n/a (Form)", "ok: Business Admin writes F2 and F8; no-Delete via REST (K-17)", "ok")
row("j16_internal_chat", "all internal roles", "ok", "n/a (Form)", "ok: every internal role writes F7 (Reader per Q7)", "ok")
row("j17_audit_oversight", "p_reader", "ok: F8 incl. Event_File (ReadOnly for Reader)", "n/a (Form)", "ok: Reader views F8; tamper-evident (RR-1, K-17)", "ok")
row("j18_find_cases", "p_rmm, reviewers, p_reader", "ok: Search_* mirrors + Components on F3", "n/a (Form)", "ok: all internal roles view F3; RMM + service write", "ok")
row("j19_sync_service", "p_integration_service", "ok: F3 rows must now carry Portal_Contact_Ids (required)", "n/a", "ok: view Case/OP/CR, write F3/F8, initiate CR", "ok", ["COH-09"])
row("j20_reactivate_case", "p_rmm", "ok: new item, counts blank", "ok", "ok", "ok")

STATUS = {
 "COH-01": {"status": "closed", "evidence": "data_model rev 12: Start_Gate blank-checks Query_Key, Portal_Contact_Ids, Awaiting_Response and requires Awaiting_Response = \"Yes\" for to-supplier points; probe: each blank -> \"\", Awaiting_Response No -> \"\", internal -> \"OK\"."},
 "COH-02": {"status": "closed", "evidence": "CIQ_Section_A00.Portal_Contact_Ids required:true."},
 "COH-03": {"status": "closed (contract)", "evidence": "automations cross_container_contract X3/X3b condition OP_To_Supplier = \"Yes\" + condition_note; enforcement is the portal session's REST build (K-09h)."},
 "COH-04": {"status": "closed, decision-pending (Thomas, D23)", "evidence": "Open_Items_Count/Open_CR_Count ReadOnly at CASE_S0-S3 and every branch (compiled read-back), blank at the join -> Hold_For_Open_Items = \"Yes\" -> CASE_S5 runs once in all 4 replayed join paths."},
 "COH-05": {"status": "closed", "evidence": "Case_Contacts_JSON, Portal_Contact_Ids, Confirm_Contact_Ids, Supplier_Contact_Emails Editable at CASE_S1, S3, S5, S7, S8 (compiled read-back)."},
 "COH-06": {"status": "closed with residual COH-06r", "evidence": "Target_Markets_Text Editable at S5 and S8; Markets_Label still S0 only."},
 "COH-07": {"status": "closed", "evidence": "CHRQ_S1 Mandatory: Notice_Key, Notice_Kind, Notice_Title, Supplier_Outcome_Text, Case_Code, Cycle_No, Supplier_Code, Portal_Contact_Ids. CR_Key (X6 Related_Key) stays S0-only; CIQP Notice 'Related Key' is optional (brd L570), so no defect."},
 "COH-08": {"status": "closed, but introduced COH-11", "evidence": "CIQ_OP_Outcome = [Accepted, Withdrawn]; Open_Num 0 only for those. The same list also backs Rounds.Rounds_Outcome."},
 "COH-09": {"status": "partly closed (data); residual doc gap", "evidence": "CIQ_Audit_Event_A00.Event_File (Attachment) + CIQ_Event_Category 'Final PDF'; Integration Service writes F8. Z1 rest_completion (automations, unchanged at rev 18) still says only 'records the PDF hash in a CIQ Audit Event row'."},
 "COH-10": {"status": "closed", "evidence": "Separate Hold_Override_Reason_Release/_Close and Open_Items_Gate_Release/_Close; probe: release override with counts 2+0 gives Gate_Release OK, Gate_Close \"\" and Hold_For_Open_Items Yes, so S8 runs and needs its own reason."},
 "R-01": {"status": "open (runtime)", "evidence": "cr-refused-not-valid and cr-refused-after-final-release skip all five CHRQ_PAR arms; K-PAR must prove the join advances."},
 "R-02": {"status": "mitigated, residual on the Y5 path; decision-pending (Thomas, Q8)", "evidence": "Counts Editable at CASE_S7, but Y5 approves S7 without a person and its contract does not refresh or blank the counts, so S5's values (normally 0) skip S8 even if a point or CR was opened during S6/S7."},
 "R-03": {"status": "open (runtime)", "evidence": "Y1/Y3/Y4/Y5 approve unverified (Q6); waiting steps stay RMM-owned."},
 "R-04": {"status": "closed", "evidence": "post_generate_grants: all 11 resets are Member [\"View\"], never []; K-06 still to prove My Tasks."},
 "R-05": {"status": "open (REST)", "evidence": "flow Admin for CIQ Case Admin on 3 Processes in post_generate_grants."},
 "R-06": {"status": "reduced to 8 classified findings", "evidence": "Foundation draft rev 18: 5x FOUNDATION_MAPPING_EXPRESSION (waived on runtime evidence, D21), 1x FOUNDATION_ACTION_UNSUPPORTED notify (platform), 2x FOUNDATION_INITIATOR_CONTRACT_MISMATCH (D18). Z2 condition finding cleared. Needs conductor accept-foundation with the waivers."},
 "R-07": {"status": "open (runtime)", "evidence": "K-20, K-PC (Overall_Decision != \"Rejected\" on blank), K-OFF/K-PAR."}
}

INC = [
 {"id": "COH-11", "kind": "regression-shared-list-narrowed", "severity": "major", "fix_before_generate": True,
  "flows": ["CIQ_Open_Point_A00"], "journeys": ["j07_open_point_supplier"], "personas": ["reviewers", "p_rmm"],
  "evidence": "data_model rev 12 replaced CIQ_OP_Outcome with [Accepted, Withdrawn] (COH-08). Rounds.Rounds_Outcome is a Select with referredList CIQ_OP_Outcome (compiled: Field Rounds_Outcome, Model Rounds, ReferredList CIQ_OP_Outcome; list ListItems [Accepted, Withdrawn]). v4 L246/L251: on a Return the Workbench appends round n to Rounds with its outcome. A list-backed Select silently drops a value it does not hold (brd L1229).",
  "effect": "Every returned round loses its 'Returned' outcome in the Rounds history. The point still progresses, but the round history (REQ-PROC-033/-035) is incomplete. A list binding on a published Process child column cannot be changed after generate.",
  "fix": "Bind Rounds_Outcome to its own list, e.g. CIQ_Round_Outcome = Accepted, Returned, Withdrawn. Alternatively make it Text, machine-written by the Workbench (brd L1229 rule). Leave OP_Outcome on the two-value list. kf-architect then aligns architecture.lists CIQ_OP_Outcome (it still says Accepted, Returned, Withdrawn).",
  "owner": "kf-data-architect (+ kf-architect list registry)"},
 {"id": "COH-12", "kind": "write-path-missing", "severity": "minor", "fix_before_generate": False,
  "flows": ["CIQ_Open_Point_A00"], "journeys": ["j07_open_point_supplier", "j08_internal_points"], "personas": ["p_supplier", "reviewers"],
  "evidence": "v4 L250 lists Portal_Contact_Ids among the current-round fields that X3 copies. It is Editable only at OPNT_S0 and ReadOnly at OPNT_S1 and every OPNT_R_* step, where the Workbench writes round n+1.",
  "effect": "If a Contact update changes the supplier contacts between rounds, round n+1's CIQP Query still goes to the old Assigned_Contacts.",
  "fix": "Add Portal_Contact_Ids Editable at OPNT_R_* to security_handoff; kf-security-designer recompiles.",
  "owner": "kf-workflow-designer -> kf-security-designer"},
 {"id": "COH-09r", "kind": "handoff-not-documented", "severity": "minor", "fix_before_generate": False,
  "flows": ["CIQ_Case_A00", "CIQ_Audit_Event_A00"], "journeys": ["j11_final_release", "j19_sync_service"], "personas": ["p_integration_service", "p_rmm"],
  "evidence": "The fallback store (Event_File, category 'Final PDF') exists only in data_model; no automations text names it. Z1 rest_completion item 1 is unchanged.",
  "effect": "Whoever builds Z1/the renderer over REST has no instruction to write the PDF to a 'Final PDF' audit row when K-15 fails.",
  "fix": "Extend Z1 rest_completion item 1: 'if K-15 fails, create a CIQ Audit Event row (Event_Category = \"Final PDF\", Case_Item_Id, Object_Item_Id) with the PDF in Event_File and its hash'. Make K-15 an acceptance test.",
  "owner": "kf-integration-analyst"},
 {"id": "COH-06r", "kind": "write-path-missing", "severity": "minor", "fix_before_generate": False,
  "flows": ["CIQ_Case_A00"], "journeys": ["j13_change_request"], "personas": ["p_rmm"],
  "evidence": "Markets_Label (X1 portal header label) is Editable only at CASE_S0; D23 left it out.",
  "effect": "After an accepted market correction, the case's Markets_Label stays stale. The portal copy would not update anyway, because X1 fires once.",
  "fix": "Optional: Markets_Label Editable at CASE_S5 and CASE_S8 with Target_Markets_Text.",
  "owner": "kf-workflow-designer"}
]

DOC_DRIFT = [
 {"where": "security.residual_risks RR-5", "issue": "still names the retired Open_Items_Gate and D15", "owner": "kf-security-designer"},
 {"where": "workflow.meta.field_reconciliation / meta.data_model_revision", "issue": "says data_model revision 4; current is 12", "owner": "kf-workflow-designer"},
 {"where": "architecture.lists CIQ_OP_Outcome", "issue": "still Accepted, Returned, Withdrawn; data_model and compiled list are Accepted, Withdrawn", "owner": "kf-architect"},
 {"where": "decisions.md", "issue": "two entries numbered D17 (automations, security); renumber when the next decision is recorded", "owner": "conductor"}
]

RISKS = [
 {"id": "R-01", "risk": "All-skipped parallel joins: every refused CR (all Impact_<D> = No) and Part 2 with no active department.", "ref": "D9/AR01", "owner": "kf-workflow-designer; test K-PAR", "status": "open"},
 {"id": "R-02", "risk": "Close hold after Y5: counts are now Editable at CASE_S7, but Y5 approves S7 without a person and does not refresh or blank them. Items opened during S6/S7 (for example a supplier CR via Y6) skip CASE_S8.", "owner": "kf-integration-analyst (Y5 contract: blank Open_Items_Count/Open_CR_Count before approving CASE_S7) or the Workbench rule; decision: Thomas (Q8)", "status": "mitigated, decision-pending"},
 {"id": "R-03", "risk": "Y1/Y3/Y4/Y5 'Approve an item' unverified (Q6); RMM manual fallback keeps journeys satisfiable.", "owner": "portal session; K-09b/c/g", "status": "open"},
 {"id": "R-04", "risk": "Reviewer/Overall Approver reset.", "owner": "kf-security-designer", "status": "closed: [\"View\"] everywhere; K-06 to prove My Tasks"},
 {"id": "R-05", "risk": "CIQ Case Admin has no native capability until flow Admin is granted over REST.", "owner": "kf-security-designer / kf-author", "status": "open"},
 {"id": "R-06", "risk": "Foundation draft rev 18 has 8 open findings: 5 mapping (waived D21), 1 platform notify, 2 initiator mismatch (D18).", "owner": "conductor (accept-foundation with waivers); platform (notify)", "status": "reduced"},
 {"id": "R-07", "risk": "Runtime unverified: Mandatory formula gates on branches (K-20), != on blank Overall_Decision (K-PC), branch-scoped permissions (K-OFF/K-PAR).", "owner": "acceptance", "status": "open"},
 {"id": "R-08", "risk": "A Return is a native send-back, which runs no Mandatory check. Round n+1 relies on the Workbench to set Awaiting_Response = \"Yes\" and the new Query_Key at OPNT_R_*. If it doesn't, Y3 never approves, and RMM must submit OPNT_S1 by hand (Awaiting_Response is Editable there).", "owner": "Workbench / acceptance K-09h", "status": "open (new, observation)"}
]

coh = {
 "owner": "kf-coherence-critic",
 "stage": "coherence gate, pass 2",
 "graph_revision_reviewed": 18,
 "previous_pass": {"graph_revision_reviewed": 8, "committed_revision": 9, "verdict": "PASS-WITH-ISSUES", "defects": "COH-01..COH-10", "risks": "R-01..R-07"},
 "source": "graph rev 18 slices domain, architecture, data_model (rev 12), workflow (rev 15), security (rev 16), automations (rev 18, unchanged), experience (rev 17, unchanged); brd.md PART A/B/C (L246, L250-L251, L570, L1229); decisions D15, D21-D24; open-questions Q6, Q8",
 "deterministic_evidence": {
  "gate": "0 errors, 3 warnings (AUTO_SELF Z2 expected; NO_PAGES intended per EXP-HR1; ROLE_ACCESS_COLLAPSE QM/MIC/SUS is a false positive: disjoint step ownership)",
  "validate": "0 errors, 1 warning (AUTO_SELF)",
  "verify": "0 errors, 2 warnings (AUTO_SELF, NO_PAGES)",
  "build_no_pages": "dry-run only, 225 artifacts, 0 errors, 4 warnings (ORPHAN_ENTITY Connector x4, engine); no page/nav output",
  "compiled_readback": "CIQ Case step cells for counts, gates, overrides, contacts and markets match the security slice; Rounds_Outcome ReferredList = CIQ_OP_Outcome [Accepted, Withdrawn]",
  "scenario_replay": "30/30 workflow journey scenarios satisfiable when routing is evaluated at step entry against data_model formulas and security step cells (17 positive, 13 negative return the expected error); 2 refused-CR scenarios exercise an all-skipped join (R-01)",
  "foundation": "draft; 8 open findings (R-06)",
  "artifacts": "runs/ciq-digital-v4/scratch-kf-coherence-critic/pass3-rev18/ (spec.json, gate/validate/verify/build.txt, sim.json, simulate.py)"
 },
 "repair_status": STATUS,
 "completeness_matrix": M,
 "role_purpose": {"dead_end_roles": [], "note": "All 11 custom roles keep a journey plus a grant or step; every task step's assignee has Act on it; every data flow has a writer and readers. Admin/User are platform defaults (A3)."},
 "orphans": {"flows": [], "fields": [], "roles": [], "statuses": "n/a (no Case/Board flows)", "reports": "n/a (no pages)",
             "note": "Final_PDF is still ReadOnly at every step; its post-End writer is Z1 REST and the fallback home is F8 Event_File (COH-09r). Hold_For_Open_Items is a formula."},
 "gates_and_counts": {
  "lane_gates": "ok, unchanged",
  "open_items_release": "ok: counts blank at the join; S5 runs once; Gate_Release Mandatory with its own override",
  "open_items_close": "ok at the step; whether S8 runs depends on counts at PS-11 (R-02)",
  "start_gate": "ok (COH-01 closed)",
  "aggregates": "none authored (A2)"
 },
 "incoherences": INC,
 "doc_drift": DOC_DRIFT,
 "risks": RISKS,
 "decision_pending_for_thomas": [
  "D23 / COH-04: confirm 'counts blank at the join, so the release-request check always runs once' (taken under the take-the-recommended-option rule).",
  "Q8 / R-02: for the close check, either Y5 blanks Open_Items_Count/Open_CR_Count before approving CASE_S7, so S8 always runs once (recommended, mirrors D23), or the Workbench refreshes them during PS-11.",
  "D18 + D21: accept the initiator-contract mismatch and the _id-to-Text mapping waiver so the foundation can be accepted (conductor; Thomas if he wants sign-off).",
  "D9 / R-01: only if K-PAR fails: change the Assess-impact shape for refused CRs."
 ],
 "ratchet": [
  "RAT-1 ROLE_ACCESS_COLLAPSE: don't flag roles whose workflow assignee_role steps are disjoint.",
  "RAT-2 never-writable field: warn on a non-formula Process field that is ReadOnly at every step and has no declared post-End writer.",
  "RAT-3 stale hold: warn when a step condition reads fields whose last writable step is before an intervening parallel block.",
  "RAT-4 handoff input: a field mapped into a required target field must be Mandatory or gate-checked at the step whose entry fires the handoff.",
  "RAT-5 shared list: when a list's items change, list every field (header and child-table column) whose referredList is that list; flag one that is documented or scenario-written with a value the list no longer holds (would catch COH-11).",
  "RAT-6 doc drift: warn when free text in workflow/security/automations names a field id that no longer exists in data_model (would catch RR-5 Open_Items_Gate)."
 ],
 "verdict": "PASS-WITH-ISSUES",
 "verdict_note": "Every in-scope journey (j01-j20) is end-to-end satisfiable at rev 18, and 30/30 scenarios replay. COH-01, -02, -03, -04, -05, -07, -08 and -10 are closed; COH-06 and COH-09 are closed except minor residuals. One regression must be fixed before generate: COH-11, a one-field data_model change that cannot be made after publish. COH-12, COH-09r and COH-06r are bounded minor repairs. R-02 and COH-04 wait on Thomas (Q8, D23)."
}
json.dump(coh, open(OUT, "w"), indent=1, ensure_ascii=False)
print("wrote", OUT, len(json.dumps(coh)))
