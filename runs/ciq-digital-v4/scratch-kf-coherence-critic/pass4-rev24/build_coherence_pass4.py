"""Coherence pass 4 (graph rev 24). Updates the committed pass-3 content; read-only over slices."""
import json, copy
prev = json.load(open("slice-coherence.json"))["content"]
coh = copy.deepcopy(prev)
coh["stage"] = "coherence gate, pass 4"
coh["graph_revision_reviewed"] = 24
coh["previous_pass"] = {"graph_revision_reviewed": 18, "committed_revision": 19, "verdict": "PASS-WITH-ISSUES",
                        "defects": "COH-11, COH-12, COH-09r, COH-06r open", "risks": "R-01..R-08"}
coh["source"] = ("graph rev 24: domain (rev 2, unchanged), architecture (rev 22, D28), data_model (rev 20, D26), "
                 "workflow (rev 24, D27), security (rev 16, unchanged since pass 3), automations (rev 21, D25), "
                 "experience (rev 17, unchanged); brd.md PART A/B/C; decisions D23, D25-D28; open-questions Q8")
coh["deterministic_evidence"] = {
 "gate": "0 errors, 3 warnings (AUTO_SELF Z2 expected; NO_PAGES intended per EXP-HR1; ROLE_ACCESS_COLLAPSE QM/MIC/SUS false positive, disjoint step ownership)",
 "validate": "0 errors, 1 warning (AUTO_SELF)",
 "verify": "0 errors, 2 warnings (AUTO_SELF, NO_PAGES)",
 "build_no_pages": "dry-run only, 226 artifacts (+1 list CIQ_Round_Outcome), 0 errors, 4 warnings (ORPHAN_ENTITY Connector x4, engine); folders form/integration/list/permission/process/role, no page/nav",
 "compiled_readback": "Rounds_Outcome (Model Rounds) ReferredList CIQ_Round_Outcome = [Accepted, Returned, Withdrawn]; OP_Outcome ReferredList CIQ_OP_Outcome = [Accepted, Withdrawn]. Portal_Contact_Ids ReadOnly at all six OPNT_R_* activities; Markets_Label ReadOnly at CASE_S5 and CASE_S8 (security cells not yet re-committed). Open_Items_Count/Open_CR_Count Editable at CASE_S5, CASE_S7, CASE_S8, ReadOnly elsewhere.",
 "scenario_replay": "30/30 workflow journey scenarios replay at rev 24 (same simulator as pass 3)",
 "foundation": "draft; same 8 open findings (5 MAPPING_EXPRESSION waived D21, 1 ACTION_UNSUPPORTED notify, 2 INITIATOR_CONTRACT_MISMATCH D18)",
 "slice_freshness": "ir-graph-cli tasks lists only data_model as stale: its recorded architecture input predates architecture rev 22 (D28 list-registry alignment). data_model content already matches (CIQ_Round_Outcome at rev 20, before D28), so this is upstream commit ordering only, no content change needed. experience is not flagged and is unchanged (empty, EXP-HR1). security is NOT flagged, but its content lags workflow.meta.security_handoff rev 23/24 by 8 cells (COH-12, COH-06r): the engine does not stale security on a handoff-only workflow change (RAT-7).",
 "artifacts": "runs/ciq-digital-v4/scratch-kf-coherence-critic/pass4-rev24/ (spec.json, gate/validate/verify/build.txt, kf-build-out, sim.json, foundation.json)"
}
rs = coh["repair_status"]
rs["COH-09"] = {"status": "closed", "evidence": "data store D22 + Z1 rest_completion step 1a (D25): if K-15 fails, store the PDF in CIQ Audit Event.Event_File on an Event_Category = 'Final PDF' row."}
rs["COH-11"] = {"status": "closed", "evidence": "D26/D28: own list CIQ_Round_Outcome [Accepted, Returned, Withdrawn] bound only to Rounds_Outcome; OP_Outcome stays on CIQ_OP_Outcome [Accepted, Withdrawn]; Open_Num unchanged; architecture registry, compiled lists and blob bindings agree; no field or scenario writes a value its list lacks."}
rs["COH-09r"] = {"status": "closed", "evidence": "automations rev 21 Z1 rest_completion item '1a. K-15 fallback ...' names Event_File and category 'Final PDF'; both exist in data_model and in the compiled list/form."}
rs["COH-12"] = {"status": "open: workflow side done, security re-commit pending", "evidence": "workflow rev 23/24 security_handoff has Portal_Contact_Ids Editable at OPNT_R_REG/_SAF/_QM/_MIC/_SUS/_RMM (D27). Security slice unchanged since rev 16; compiled cells still ReadOnly at all six Review activities."}
rs["COH-06r"] = {"status": "open: workflow side done, security re-commit pending", "evidence": "workflow rev 23/24 security_handoff has Markets_Label Editable at CASE_S5 and CASE_S8 (D27). Compiled cells still ReadOnly at both checks."}
rs["R-02"] = {"status": "decided by conductor (D27, Q8 default), pending Thomas; residual narrowed", "evidence": "Y5 keeps automatic completion (REQ-PROC-045) and does not blank counts (Y5 contract unchanged, consistent). Counts Editable at CASE_S7 (compiled). CASE_S7 note and workflow.meta.coherence_repairs.rev19 record the Workbench refresh and the portal release refusal. Residual: an internal point (Department review, Contact update, Internal review) raised during CASE_S6/S7 with no RMM Workbench session before Y5 is not counted, so CASE_S8 is skipped; the portal refusal only covers the supplier's own CIQP Queries/CRs."}
rs["R-06"] = {"status": "unchanged: 8 classified findings", "evidence": "foundation draft at rev 24 = rev 18 set. Needs conductor accept-foundation with the D18/D21 waivers."}
coh["repair_status"] = rs

M = {r["journey"]: r for r in coh["completeness_matrix"]}
j = M["j07_open_point_supplier"]
j["data"] = "ok: Rounds_Outcome on its own list CIQ_Round_Outcome (Accepted, Returned, Withdrawn), so a returned round keeps its outcome (COH-11 closed). Start_Gate enforces Query_Key, Portal_Contact_Ids, Awaiting_Response = Yes"
j["workflow_path"] = "ok: S0 -> S1 (OP_To_Supplier) -> exactly one OPNT_R_<D>; Return = send-back; X3/X3b guarded"
j["permission"] = "gap until security re-commit: Portal_Contact_Ids is in the OPNT_R_* handoff but still ReadOnly in compiled cells, so round n+1 cannot pick up changed contacts (COH-12)"
j["status"] = "ok-with-issues"; j["defects"] = ["COH-12"]
M["j08_internal_points"]["defects"] = []
j9 = M["j09_open_items_checks"]
j9["workflow_path"] = "ok: CASE_S5 always runs once (D23); CASE_S8 runs if counts at PS-11 are non-zero/blank; Y5 keeps automatic completion and the Workbench refreshes counts at CASE_S7 (D27/Q8)"
j9["note"] = "D23 and Q8 (D27) pending Thomas's confirmation."
j11 = M["j11_final_release"]
j11["data"] = "ok: Final_PDF on the case; K-15 fallback documented in Z1 rest_completion 1a (Event_File, 'Final PDF')"
j11["defects"] = []; j11["status"] = "ok-with-risk"
j13 = M["j13_change_request"]
j13["data"] = "ok: X6 inputs Mandatory at Triage; Target_Markets_Text lands at S5/S8; Markets_Label in the S5/S8 handoff but still ReadOnly in compiled cells (COH-06r, pending security)"
M["j19_sync_service"]["defects"] = []
M["j19_sync_service"]["data"] = "ok: F3 rows carry Portal_Contact_Ids (required); Z1 fallback writes Event_File on a 'Final PDF' F8 row"
coh["orphans"]["note"] = "Final_PDF is ReadOnly at every step; its post-End writer is Z1 REST, with the F8 Event_File fallback documented (COH-09r closed). Hold_For_Open_Items is a formula."
coh["gates_and_counts"]["open_items_close"] = "ok at the step; whether S8 runs depends on counts refreshed at PS-11 by the Workbench (Q8/D27, residual R-02)"

coh["incoherences"] = [
 {"id": "COH-12", "kind": "write-path-missing", "severity": "minor", "fix_before_generate": True,
  "flows": ["CIQ_Open_Point_A00"], "journeys": ["j07_open_point_supplier", "j08_internal_points"], "personas": ["p_supplier", "reviewers"],
  "evidence": "workflow rev 23/24 security_handoff: Portal_Contact_Ids Editable at the six OPNT_R_* steps (D27). security slice unchanged since rev 16; compiled Activity cells for Review - Regulatory/Safety/QM/MIC/Sustainability/RMM are ReadOnly.",
  "effect": "After a Contact update, round n+1's CIQP Query still goes to the old Assigned_Contacts.",
  "fix": "kf-security-designer re-commits the step cells from the rev-24 handoff (6 cells). Before generate, because after generate it needs a REST patch.",
  "owner": "kf-security-designer"},
 {"id": "COH-06r", "kind": "write-path-missing", "severity": "minor", "fix_before_generate": True,
  "flows": ["CIQ_Case_A00"], "journeys": ["j13_change_request"], "personas": ["p_rmm"],
  "evidence": "workflow rev 23/24 security_handoff: Markets_Label Editable at CASE_S5 and CASE_S8 (D27). Compiled cells ReadOnly at both.",
  "effect": "After an accepted market correction the case's Markets_Label stays stale.",
  "fix": "Same security re-commit (2 cells).",
  "owner": "kf-security-designer"},
 {"id": "COH-13", "kind": "handoff-not-in-contract", "severity": "minor", "fix_before_generate": False,
  "flows": ["CIQ_Case_A00"], "journeys": ["j09_open_items_checks", "j11_final_release"], "personas": ["p_supplier", "p_rmm"],
  "evidence": "D27's portal hand-off ('refuse the final release while the supplier's own CIQP Queries or CIQP Change Requests on the case are open') is only in the CASE_S7 note and workflow.meta.coherence_repairs.rev19. The automations cross_container_contract X5/Y5 entries, which the portal session works from, do not mention it.",
  "effect": "The Q8 mitigation depends on a portal behaviour that the portal session may never receive.",
  "fix": "kf-integration-analyst adds the refusal to the X5/Y5 contract; the conductor tells the portal session and records it in the shared data-model plan (project rule: shared contract first).",
  "owner": "kf-integration-analyst + conductor"}
]
coh["doc_drift"] = [
 {"where": "security.residual_risks RR-5", "issue": "still names the retired Open_Items_Gate (unchanged since rev 16)", "owner": "kf-security-designer (with the COH-12 re-commit)"},
 {"where": "architecture.lists CIQ_Event_Category", "issue": "16 items, no 'Final PDF'; data_model and the compiled list have 17 (already noted in D28)", "owner": "kf-architect"},
 {"where": "decisions.md", "issue": "two entries numbered D17; renumber when convenient", "owner": "conductor"},
 {"where": "workflow.meta.data_model_revision / architecture.lists CIQ_OP_Outcome", "issue": "fixed at rev 22-24 (D27, D28)", "owner": "closed"}
]
for r in coh["risks"]:
    if r["id"] == "R-02":
        r["risk"] = ("Close hold after Y5: Y5 approves CASE_S7 and does not blank counts (Q8 chosen by the conductor, D27). "
                     "The Workbench refreshes counts at CASE_S7 and the portal refuses release while the supplier's own queries/CRs are open (COH-13: not yet in the X5/Y5 contract). "
                     "Residual: internal points raised during CASE_S6/S7 without an RMM Workbench session before Y5 skip CASE_S8.")
        r["owner"] = "Workbench (refresh at CASE_S7); portal session (release refusal); decision: Thomas (Q8)"
        r["status"] = "mitigated, decision-pending"
    if r["id"] == "R-06":
        r["risk"] = "Foundation draft rev 24 has the same 8 open findings: 5 mapping (waived D21), 1 platform notify, 2 initiator mismatch (D18)."
coh["decision_pending_for_thomas"] = [
 "D23 / COH-04: confirm 'counts blank at the join, so the release-request check (CASE_S5) always runs once'.",
 "Q8 / R-02 (D27): confirm 'Y5 keeps automatic completion and does not blank the counts; the Workbench refreshes them at PS-11; the portal refuses release while the supplier's own queries/CRs are open'. Alternative: Y5 blanks the counts so CASE_S8 always runs (manual close check every time).",
 "D18 + D21: accept the initiator-contract mismatch and the _id-to-Text mapping waiver so the foundation can be accepted (conductor accept-foundation; Thomas if he wants sign-off).",
 "D9 / R-01: only if K-PAR fails: change the Assess-impact shape for refused CRs."
]
coh["ratchet"] = prev["ratchet"] + [
 "RAT-7 handoff staleness: a change to workflow.meta.security_handoff should mark the security task stale (at rev 24 tasks flags only data_model while security lags the handoff by 8 cells).",
 "RAT-8 handoff vs cells: gate should diff workflow.meta.security_handoff Mandatory/Editable lists against security step cells and warn on each mismatch (would catch COH-12/COH-06r while pending)."
]
coh["verdict"] = "PASS-WITH-ISSUES"
coh["verdict_note"] = ("Every in-scope journey (j01-j20) is end-to-end satisfiable at rev 24; gate/validate/verify/build --no-pages are clean (0 errors) and 30/30 scenarios replay. "
 "COH-11 (the only fix-before-generate regression) and COH-09r are closed. COH-12 and COH-06r are done on the workflow side but the security slice has not re-committed the 8 handoff cells, so the compiled app still lacks them; this mechanical re-commit should land before generate. "
 "COH-13 is a contract hand-off gap for the Q8 portal refusal. D23, Q8 (D27) and D18/D21 foundation acceptance wait on Thomas/the conductor.")
json.dump(coh, open("coherence.json", "w"), indent=1, ensure_ascii=False)
print("wrote coherence.json", len(json.dumps(coh)))
