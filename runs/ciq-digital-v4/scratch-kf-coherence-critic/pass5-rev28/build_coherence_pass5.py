"""Coherence pass 5 (graph rev 28). Starts from the uncommitted pass-4 payload; read-only over slices."""
import json, copy
prev = json.load(open("../pass4-rev24/coherence.json"))
coh = copy.deepcopy(prev)
coh["stage"] = "coherence gate, pass 5"
coh["graph_revision_reviewed"] = 28
coh["previous_pass"] = {
 "graph_revision_reviewed": 24,
 "committed_revision": None,
 "commit_note": "pass-4 commit refused (409 IR_GRAPH_DEPENDENCY_BLOCKED: automations, experience stale); the graph still held the pass-3 payload committed at rev 19",
 "verdict": "PASS-WITH-ISSUES",
 "defects": "COH-12, COH-06r, COH-13 open",
 "risks": "R-01..R-08"}
coh["source"] = ("graph rev 28: domain (rev 2, unchanged), architecture (rev 22, D28), data_model (rev 25, re-commit, content = rev 20), "
                 "workflow (rev 24, D27), security (rev 26, D29: 8 handoff cells + RR-5), automations (rev 27, COH-13 on X5/Y5), "
                 "experience (rev 28, re-commit, unchanged/empty); brd.md PART A/B/C; decisions D23, D25-D29; open-questions Q8, Q9")
coh["deterministic_evidence"] = {
 "gate": "0 errors, 3 warnings (AUTO_SELF Z2 expected; NO_PAGES intended per EXP-HR1; ROLE_ACCESS_COLLAPSE QM/MIC/SUS false positive, disjoint step ownership). Identical to pass 4.",
 "validate": "0 errors, 1 warning (AUTO_SELF)",
 "verify": "0 errors, 2 warnings (AUTO_SELF, NO_PAGES)",
 "build_no_pages": "dry-run only, 226 artifacts (artifact list identical to rev 24), 0 errors, 4 warnings (ORPHAN_ENTITY Connector x4, engine); folders form/integration/list/permission/process/role, no page/nav",
 "compiled_readback": ("Compiled diff rev 24 -> rev 28 is exactly 8 Permission entities, ReadOnly -> Editable, nothing else in any blob: "
                       "CIQ_Case_A00 Markets_Label at 'Open items check – before release request' (CASE_S5) and 'Open items check – before close' (CASE_S8); "
                       "CIQ_Open_Point_A00 Portal_Contact_Ids at Review – Regulatory/Safety/QM/Microbiology/Sustainability/RMM (OPNT_R_*). "
                       "Markets_Label stays ReadOnly at every other case step except Create case; Portal_Contact_Ids ReadOnly at 'Waiting for supplier' and End."),
 "handoff_vs_cells": "workflow.meta.security_handoff vs security.field_permissions: 29 steps, 416 Mandatory/Editable cells, 0 mismatches in either direction (manual RAT-8 check).",
 "scenario_replay": ("30/30 workflow journey scenarios replay at rev 28, results identical to pass 4. "
                     "7 probe variants (Portal_Contact_Ids written at each OPNT_R_* step; Markets_Label + Target_Markets_Text at CASE_S5 and CASE_S8) pass 7/7 at rev 28 and fail 0/7 against the rev-24 cells, so the re-commit is load-bearing."),
 "foundation": "draft at rev 28; same 8 open findings as rev 18/24 (5 FOUNDATION_MAPPING_EXPRESSION waived D21, 1 FOUNDATION_ACTION_UNSUPPORTED notify, 2 FOUNDATION_INITIATOR_CONTRACT_MISMATCH D18)",
 "slice_freshness": "ir-graph-cli tasks at rev 28 lists only agenttask.coherence (stale) and agenttask.seed (pending); every other task is fresh.",
 "automations_contract": "X5 (items[4]) and Y5 (items[9]) of cross_container_contract carry release_refusal_rule (COH-13 / D27); doc_only, not compiled.",
 "artifacts": "runs/ciq-digital-v4/scratch-kf-coherence-critic/pass5-rev28/ (spec.json, gate/validate/verify/build.txt, kf-build-out, sim.json, probe/, probe-rev24/, foundation.json)"
}
rs = coh["repair_status"]
rs["COH-06"] = {"status": "closed", "evidence": "residual COH-06r closed at rev 26"}
rs["COH-12"] = {"status": "closed", "evidence": "security rev 26 (D29): Portal_Contact_Ids Editable at OPNT_R_REG/_SAF/_QM/_MIC/_SUS/_RMM; compiled Permission entities Editable at all six Review activities; probe replay writes it at each."}
rs["COH-06r"] = {"status": "closed", "evidence": "security rev 26 (D29): Markets_Label Editable at CASE_S5 and CASE_S8; compiled Editable at both open-items checks; probe replay writes it at both."}
rs["COH-13"] = {"status": "closed in the IR; portal relay pending Q8",
                "evidence": ("automations rev 27: release_refusal_rule on X5 and Y5. The shared contract docs/kissflow-data-model/kissflow-data-model-plan.md "
                             "has no pre-release refusal rule yet (its PS-11 freeze text covers only post-release CR refusal), and there is no record that the portal session was told. "
                             "Correctly held until Thomas confirms Q8, because the alternative (Y5 blanks the counts) removes the need for it.")}
rs["R-06"] = {"status": "unchanged: 8 classified findings", "evidence": "foundation draft at rev 28 = rev 18/24 set. Needs conductor accept-foundation with the D18/D21 waivers."}
rs["DOC-RR5"] = {"status": "closed", "evidence": "security RR-5 now names Start_Gate, the six <D>_Gate fields, Open_Items_Gate_Release and Open_Items_Gate_Close; all exist in data_model (Open_Items_Gate named only as retired)."}
rs["DOC-D17"] = {"status": "closed", "evidence": "decisions.md: second D17 renamed D17b (D29)."}
coh["repair_status"] = rs

M = {r["journey"]: r for r in coh["completeness_matrix"]}
j = M["j07_open_point_supplier"]
j["permission"] = "ok: Portal_Contact_Ids Editable at all six OPNT_R_* steps (compiled), so a Contact update before Return reaches round n+1's X3 (COH-12 closed)"
j["status"] = "ok-with-risk"; j["defects"] = []
if "R-08" not in j["risks"]: j["risks"] = j["risks"] + ["R-08"]
j9 = M["j09_open_items_checks"]
j9["note"] = "D23 and Q8 (D27) pending Thomas's confirmation. The supplier-side release refusal is now in the X5/Y5 contract (COH-13); relay to the portal session waits on Q8."
j11 = M["j11_final_release"]
j11["note"] = ((j11.get("note") or "") + " X5/Y5 contract carries the D27 release refusal (rev 27).").strip()
j13 = M["j13_change_request"]
j13["data"] = "ok: X6 inputs Mandatory at Triage; Target_Markets_Text and Markets_Label both Editable at CASE_S5/S8 (compiled), so an accepted market correction updates the label (COH-06r closed)"
j13["defects"] = []; j13["status"] = "ok-with-risk"

coh["incoherences"] = []
coh["doc_drift"] = [
 {"where": "architecture.lists CIQ_Event_Category", "issue": "16 items, no 'Final PDF'; data_model and the compiled list have 17 (noted in D28). Build unaffected.", "owner": "kf-architect", "status": "open, non-blocking"},
 {"where": "workflow CASE_S7 note; automations X5/Y5 release_refusal_rule; decisions D27", "issue": ("residual wording is narrower than R-02: it names only 'an item opened in the seconds before Y5'. "
   "Also exposed: an internal point (Department review, Contact update, Internal review; not covered by the portal refusal) raised during CASE_S6/S7 with no RMM Workbench session before Y5. "
   "If uncounted, CASE_S8 is skipped and the case completes, so a 'next session' catches it only after completion."),
  "owner": "kf-workflow-designer + kf-integration-analyst (text only, with the Q8 confirmation)", "status": "open, non-blocking"},
 {"where": "decisions.md D29", "issue": "status still 'proposed' although revs 25-28 landed and were verified here", "owner": "conductor", "status": "open, bookkeeping"},
 {"where": "security.residual_risks RR-5; decisions.md duplicate D17", "issue": "fixed at rev 26 / D29", "owner": "closed"},
 {"where": "workflow.meta.data_model_revision / architecture.lists CIQ_OP_Outcome", "issue": "fixed at rev 22-24 (D27, D28)", "owner": "closed"}
]
for r in coh["risks"]:
    if r["id"] == "R-02":
        r["risk"] = ("Close hold after Y5: Y5 approves CASE_S7 and does not blank counts (Q8 chosen by the conductor, D27). "
                     "The Workbench refreshes counts at CASE_S7 (Editable, compiled); the portal refuses release while the supplier's own queries/CRs are open (now in the X5/Y5 contract, rev 27; not yet in the shared plan or relayed to the portal session). "
                     "Residual: internal points raised during CASE_S6/S7 without an RMM Workbench session before Y5 skip CASE_S8 and the case completes.")
        r["owner"] = "Workbench (refresh at CASE_S7); portal session (release refusal, after Q8); decision: Thomas (Q8)"
        r["status"] = "mitigated, decision-pending"
    if r["id"] == "R-06":
        r["risk"] = "Foundation draft rev 28 has the same 8 open findings: 5 mapping (waived D21), 1 platform notify, 2 initiator mismatch (D18)."
coh["decision_pending_for_thomas"] = [
 "D23 / COH-04: confirm 'counts blank at the join, so the release-request check (CASE_S5) always runs once'.",
 ("Q8 / R-02 (D27): confirm 'Y5 keeps automatic completion and does not blank the counts; the Workbench refreshes them at PS-11; the portal refuses release while the supplier's own queries/CRs are open'. "
  "If confirmed, the conductor writes the release-refusal rule into the shared data-model plan and tells the portal session (COH-13 relay). Alternative: Y5 blanks the counts so CASE_S8 always runs (manual close check every time)."),
 "D18 + D21: accept the initiator-contract mismatch and the _id-to-Text mapping waiver so the foundation can be accepted (conductor accept-foundation; Thomas if he wants sign-off).",
 "Approval to run author-generate for CIQ_Digital_A00 (project rule: the app needs its own approval before the first write).",
 "Q9 (non-blocking): Findings state values (Open/Closed) and the RMES limit comparator (<, <=, =, >=, >); Thomas or BDF.",
 "D9 / R-01: only if K-PAR fails: change the Assess-impact shape for refused CRs."
]
coh["ratchet"] = [x if not x.startswith("RAT-8") else
                  x + " Manual check at rev 28: 29 steps, 416 cells, 0 mismatches." for x in prev["ratchet"]]
coh["verdict"] = "PASS-WITH-ISSUES"
coh["verdict_note"] = ("Every in-scope journey (j01-j20) is end-to-end satisfiable at rev 28 with no open incoherence. COH-12, COH-06r and COH-13 (IR side) are closed: "
 "the 8 handoff cells compile Editable, the compiled diff from rev 24 is exactly those 8 cells, the handoff and the security cells agree (0/416 mismatches), and the X5/Y5 contract carries the release refusal. "
 "gate/validate/verify/build --no-pages are 0 errors; 30/30 scenarios and 7/7 probes replay. "
 "Remaining issues are not defects: decisions pending Thomas (D23, Q8 with the COH-13 portal relay, D18/D21 foundation acceptance, generate approval), "
 "8 classified foundation findings awaiting accept-foundation, tracked runtime risks R-01..R-08, and 3 non-blocking doc-drift items.")
json.dump(coh, open("coherence.json", "w"), indent=1, ensure_ascii=False)
print("wrote coherence.json", len(json.dumps(coh)))
