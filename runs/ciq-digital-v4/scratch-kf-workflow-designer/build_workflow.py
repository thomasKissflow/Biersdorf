#!/usr/bin/env python3
"""Build the `workflow` IR slice for run ciq-digital-v4 (kf-workflow-designer).

Step ids/names/owners/conditions are byte-exact from
architecture.id_reservations.step_prefix_by_flow (graph rev 3), which freezes
brd.md PART A (L44-L54) and PART B v4 §2 (L154-L272).
Field ids in the security handoff and scenarios follow v4 names first, then
PART D (L733-L966) where it agrees with v4. They must be reconciled with the
data_model slice (kf-data-architect, same wave).
"""
import json, copy, sys

ND = "–"  # en-dash, A2 L44
CASE, OPNT, CHRQ = "CIQ_Case_A00", "CIQ_Open_Point_A00", "CIQ_Change_Request_A00"

DEPTS6 = [  # code, label, role
    ("REG", "Regulatory", "ciq_regulatory_reviewer"),
    ("SAF", "Safety", "ciq_safety_reviewer"),
    ("QM", "QM", "ciq_qm_reviewer"),
    ("MIC", "Microbiology", "ciq_microbiology_reviewer"),
    ("SUS", "Sustainability", "ciq_sustainability_reviewer"),
    ("RMM", "RMM", "ciq_rmm"),
]
DEPTS5 = DEPTS6[:5]
ROLE_NAME = {
    "ciq_rmm": "CIQ RMM",
    "ciq_regulatory_reviewer": "CIQ Regulatory Reviewer",
    "ciq_safety_reviewer": "CIQ Safety Reviewer",
    "ciq_qm_reviewer": "CIQ QM Reviewer",
    "ciq_microbiology_reviewer": "CIQ Microbiology Reviewer",
    "ciq_sustainability_reviewer": "CIQ Sustainability Reviewer",
    "ciq_overall_approver": "CIQ Overall Approver",
    "ciq_integration_service": "CIQ Integration Service",
}


def task(id_, name, role, kind="UserTask", condition=None, evidence="", **kw):
    s = {"id": id_, "name": name, "type": "task", "kind": kind,
         "actor": ROLE_NAME[role], "assignee_role": role}
    if condition:
        s["condition"] = condition
    s.update(kw)
    s["evidence"] = evidence
    return s


def end(id_, evidence):
    return {"id": id_, "name": "End", "type": "automation", "kind": "End", "evidence": evidence}


# ---------------------------------------------------------------- P1 CIQ Case
case_branches = []
for d, label, role in DEPTS6:
    extra = {"evidence_fields": [f"{d}_Review_Confirm"]}
    if d in ("SAF", "REG"):
        extra["outcomes_doc"] = ["Approved", "Rejected"]
        extra["outcome_field"] = f"{d}_RMES_Decision"
    st = task(f"CASE_B_{d}", f"Review {ND} {label}", role,
              condition=f'Dept_{d}_Active = "Yes"',
              evidence="brd.md L188-L189; PART D L796-L798; A2 L49",
              sla={"applies": True, "kind": "Review time, reminder and escalation (REQ-RMES-019)", "duration": "set by BDF"},
              **extra)
    if d == "RMM":
        st["note"] = "Off by default: Dept_RMM_Active comes from Settings deptReviewMode (L189; PART D L795)."
    case_branches.append({"name": f"Review {ND} {label}", "steps": [st]})

case_steps = [
    task("CASE_S0", "Create case", "ciq_rmm", kind="Start",
         evidence="brd.md L157, L184; PART D L792",
         note="Creator-owned Start; RMM is also the owner of the first task, kept as separate steps because the platform's first step is the StartEvent."),
    task("CASE_S1", "Waiting for supplier: basic data", "ciq_rmm",
         evidence="brd.md L185; A2 L45; L344",
         sla={"applies": True, "kind": "Supplier due date; escalate to the owner", "duration": "set by BDF"},
         note="X1 fires on entry. Y1 records Basic_Data_Received and approves (Q6), or RMM submits by hand. After K-FA the owner becomes the Owner_RMM field (REST)."),
    task("CASE_S2", "Scope check", "ciq_rmm",
         evidence="brd.md L186; PART D L794",
         sla={"applies": True, "kind": "Scope-check time", "duration": "set by BDF"}),
    task("CASE_S3", "Waiting for supplier: completeness PS-05", "ciq_rmm",
         evidence="brd.md L187; A2 L46; L345",
         sla={"applies": True, "kind": "Supplier due date", "duration": "set by BDF"},
         note="X4 fires on entry. Y4 records the confirmation and RMES_Created_At, then approves."),
    {"id": "CASE_PAR", "name": f"Part 2 {ND} Beiersdorf review", "type": "task", "kind": "Parallel",
     "branches": case_branches,
     "evidence": "brd.md L167-L174, L188; A2 L48",
     "note": "Container: one-level fork, six one-step arms, each guarded by Dept_<D>_Active; native all-join before CASE_S5. No owner, no condition, no join step."},
    task("CASE_S5", f"Open items check {ND} before release request", "ciq_rmm",
         condition='Hold_For_Open_Items = "Yes"',
         evidence="brd.md L190; A2 L32-L34, L50; PART D L799",
         sla={"applies": True, "kind": "Check time", "duration": "set by BDF"},
         note="Blank-safe hold: a blank count holds (formula owned by kf-data-architect)."),
    task("CASE_S6", "Overall approval", "ciq_overall_approver",
         condition='Overall_Approval_Required = "Yes"',
         outcomes_doc=["Approved", "Rejected"], outcome_field="Overall_Decision",
         evidence="brd.md L191; A3 L63; PART D L800",
         sla={"applies": True, "kind": "Approval time", "duration": "set by BDF"},
         note="Off by default. Rejected ends the case without the PS-11 request (CASE_S7 is skipped)."),
    task("CASE_S7", "Waiting for supplier: final release PS-11", "ciq_rmm",
         condition='Overall_Decision != "Rejected"',
         evidence="brd.md L192; A2 L47; L346; PART D L801",
         sla={"applies": True, "kind": "Supplier due date", "duration": "set by BDF"},
         note="X5 fires on entry (single release request). Blank Overall_Decision runs the step. Y5 approves, or RMM completes manually with a reason."),
    task("CASE_S8", f"Open items check {ND} before close", "ciq_rmm",
         condition='Hold_For_Open_Items = "Yes"',
         evidence="brd.md L193; A2 L52; PART D L802",
         sla={"applies": True, "kind": "Check time", "duration": "set by BDF"},
         note="Normally skipped, so completion stays automatic."),
    end("CASE_END", "brd.md L194 (Z1 on completion)"),
]

# ---------------------------------------------------------- P2 CIQ Open Point
op_steps = [
    task("OPNT_S0", "Raise open point", "ciq_rmm", kind="Start",
         evidence="brd.md L236-L240, L244",
         note="Initiators: CIQ RMM and the five department Reviewer roles (L237); security sets initiator:true on each."),
    task("OPNT_S1", "Waiting for supplier", "ciq_rmm",
         condition='OP_To_Supplier = "Yes"',
         evidence="brd.md L245; A2 L53; L347",
         sla={"applies": True, "kind": "Supplier due date", "duration": "set by BDF"},
         note="X3 fires on entry (and after a Return send-back, K-09h; fallback X3b). Y3 approves only while Awaiting_Response = \"Yes\". After K-FA the owner becomes Responsible_User (REST)."),
]
for d, label, role in DEPTS6:
    op_steps.append(task(
        f"OPNT_R_{d}", f"Review {ND} {label}", role,
        condition=f'OP_Dept = "{d}"',
        outcomes_doc=["Accepted", "Withdrawn", "Return (native send-back)"],
        evidence="brd.md L239, L246, L251",
        sla={"applies": True, "kind": "Internal due date", "duration": "set by BDF"},
        note="Exactly one review step runs (OP_Dept). Accepted/Withdrawn are submitted; Return is the native send-back to 'Waiting for supplier' after the Workbench appends round n to Rounds and writes round n+1 (L246). Rounds is Editable only here."))
op_steps.append(end("OPNT_END", "brd.md L247"))

# ------------------------------------------------------ P3 CIQ Change Request
cr_branches = []
for d, label, role in DEPTS5:
    cr_branches.append({"name": f"Assess {ND} {label}", "steps": [task(
        f"CHRQ_B_{d}", f"Assess {ND} {label}", role,
        condition=f'Impact_{d} = "Yes"',
        outcomes_doc=["No impact confirmed", "Re-assessed", "Finding raised"],
        outcome_field=f"{d}_Assessment",
        evidence="brd.md L264, L271; A2 L54; PART D L978",
        sla={"applies": True, "kind": "Assessment time", "duration": "set by BDF"})]})

cr_steps = [
    task("CHRQ_S0", "Receive change request", "ciq_integration_service", kind="Start",
         evidence="brd.md L262, L269; PART D L976",
         note="Created and submitted by Y6 as CIQ Integration Service; CIQ RMM creates it by hand as the fallback. Both are initiators."),
    task("CHRQ_S1", "Triage", "ciq_rmm",
         outcomes_doc=["Accepted", f"Accepted {ND} scope extended", f"Refused {ND} after final release", f"Refused {ND} not valid"],
         outcome_field="CR_Outcome",
         evidence="brd.md L263, L270; A2 L54; PART D L977",
         sla={"applies": True, "kind": "Triage time", "duration": "set by BDF"},
         note="Fixes the set of Assess branches before the fork via Impact_<D>. A refused request sets every Impact flag to No."),
    {"id": "CHRQ_PAR", "name": "Assess impact", "type": "task", "kind": "Parallel",
     "branches": cr_branches,
     "evidence": "brd.md L271; A2 L54",
     "note": "Container: one-level fork, five one-step arms guarded by Impact_<D>, native all-join before End. All five arms are skipped on a refused request (AR01, K-PAR)."},
    end("CHRQ_END", "brd.md L272 (X6 on completion, portal session)"),
]

# --------------------------------------------------------- security handoff
H = []


def h(flow, step, mand, edit, note=None, ro=None):
    it = {"flow": flow, "step": step, "Mandatory": mand, "Editable": edit}
    if ro:
        it["ReadOnly_explicit"] = ro
    if note:
        it["note"] = note
    H.append(it)


CONTACTS4 = ["Portal_Contact_Ids", "Case_Contacts_JSON", "Confirm_Contact_Ids", "Supplier_Contact_Emails"]
FLAGS6 = [f"Dept_{d}_Active" for d, _, _ in DEPTS6]
X5REQ = ["Final_Release_Request_Key", "Final_Release_Declaration_Text", "Final_Release_Text_Key"]
X4REQ = ["Completeness_Request_Key", "Completeness_Declaration_Text", "Completeness_Text_Key", "Completeness_Due_Date"]
COUNTS = ["Open_Items_Count", "Open_CR_Count"]

case_s0_mand = ["Case_Code", "Cycle_No", "Trade_Name", "Main_INCI", "BDF_Material_No", "Supplier_Code",
                "Supplier_Legal_Name", "Owner_RMM", "Request_Key", "BDF_Contact_Name", "BDF_Contact_Email",
                "Supplier_Due_Date", "Case_Contacts_JSON", "Portal_Contact_Ids", "Confirm_Contact_Ids",
                "Supplier_Contact_Emails", "Release_Item_Id", "Manifest_Hash", "Release_Manifest_JSON",
                "Overall_Approval_Required"]
h(CASE, "CASE_S0", case_s0_mand,
  ["Case_Title", "Reactivates_Case_Item", "SAP_Material_No", "IRMA_Ref", "Target_Markets_Text", "Markets_Label",
   "Template_Label", "Release_Key", "Case_Test"],
  "v4 L184, L197-L199 (contact ids/e-mails Mandatory at Start); PART D L807. Lanes, decisions, outcome ReadOnly at Start.")
h(CASE, "CASE_S1", ["Basic_Data_Received"], ["Portal_Request_Item_Id"] + CONTACTS4, "PART D L808 (Y1 guard).")
h(CASE, "CASE_S2",
  FLAGS6 + ["Initial_Scope_Run_Key", "Rule_Set_Version", "RMES_Key", "Confirm_Contact_Ids", "Supplier_Contact_Emails"]
  + X4REQ + X5REQ + ["Supplier_Closing_Text"],
  ["Target_Markets_Text", "Final_Release_Due_Date", "Portal_Contact_Ids", "Case_Contacts_JSON", "Origin_Types"] + COUNTS,
  "PART D L809; Origin_Types Editable not Mandatory (v4 makes the K2.1 CIQ Section row the search mirror, L280, L429). Counts: Workbench-written Number fields (A2 L32).")
h(CASE, "CASE_S3", ["Completeness_At", "RMES_Created_At"],
  ["Completeness_Confirm", "Completeness_By_Name", "Completeness_By_Email", "Completeness_By_Role"] + FLAGS6
  + CONTACTS4 + X5REQ + ["Final_Release_Due_Date", "Origin_Types"] + COUNTS,
  "PART D L810. Flags stay Editable: scope can still grow in Part 1.")
for d, _, _ in DEPTS6:
    mand = [f"{d}_Review_Confirm", f"{d}_Completed_By", f"{d}_Completed_By_Email", f"{d}_Completed_At", f"{d}_Gate"]
    edit = [f"{d}_On_Behalf_Of", f"{d}_Open_Count"]
    if d in ("SAF", "REG"):
        mand.append(f"{d}_RMES_Decision")
        edit += [f"{d}_RMES_Decision_Reason", f"{d}_RMES_Gaps"]
    h(CASE, f"CASE_B_{d}", mand, edit,
      "Branch-scoped: only this lane; every other field ReadOnly (v4 L209). <D>_Gate is the blank-safe gate formula over the lane counts (A2 L32-L34, K-20). No child tables on the case.")
h(CASE, "CASE_S5", ["Hold_Note", "Open_Items_Gate"],
  ["Hold_Override_Reason"] + COUNTS + ["Confirm_Contact_Ids", "Supplier_Contact_Emails", "Final_Release_Due_Date",
                                       "Late_Completions_Text", "Supplier_Closing_Text", "Origin_Types"],
  "PART D L812. Override is audited (F8 event).")
h(CASE, "CASE_S6", ["Overall_Decision", "Overall_Decided_By"],
  ["Overall_Reason", "Supplier_Closing_Text", "Completion_Trigger"], "PART D L813.")
h(CASE, "CASE_S7", ["Completion_Trigger"],
  ["Final_Release_Confirm", "Final_Release_By_Name", "Final_Release_By_Email", "Final_Release_By_Role",
   "Final_Release_At", "Released_Revs_JSON", "Evidence_List_Text"] + COUNTS,
  "PART D L814. Counts Editable so a leftover opened during PS-11 routes into CASE_S8.")
h(CASE, "CASE_S8", ["Hold_Note", "Open_Items_Gate"],
  ["Hold_Override_Reason"] + COUNTS + ["Supplier_Contact_Emails", "Late_Completions_Text", "Supplier_Closing_Text"],
  "PART D L815.")

op_round = ["Round_No", "Query_Key", "Question_Text", "Supplier_Justification", "Supplier_Due_Date",
            "Internal_Due_Date", "Thread_Text", "Awaiting_Response"]
h(OPNT, "OPNT_S0",
  ["OP_Key", "Round_No", "Case_Item_Id", "Case_Code", "Cycle_No", "Supplier_Code", "OP_Kind", "OP_Dept",
   "Raised_By_Dept", "OP_To_Supplier", "Responsible_User", "Internal_Due_Date", "Internal_Justification",
   "Question_Text", "Ref_Kind", "Ref_Label", "Start_Gate"],
  ["Query_Key", "Ref_Section_Key", "Ref_Field_Key", "Ref_Row_Id", "Ref_Doc_Id", "Ref_Doc_File_Name",
   "Ref_Doc_Uploaded_At", "Ref_Internal_Key", "Kind_Label", "Supplier_Justification", "Responsible_Name",
   "Responsible_Dept_Label", "Supplier_Due_Date", "New_Section_Item_Key", "Portal_Contact_Ids", "Thread_Text",
   "Awaiting_Response"],
  "v4 L244 (required: kind, owner dept, to-supplier, reference, question, justification, responsible person, due dates); PART D L917. Start_Gate makes the supplier-facing fields required only when OP_To_Supplier = Yes. Point_Case and Prev_Round_Item_Id dropped (v4: one item per point; D6).",
  ro=["Rounds"])
h(OPNT, "OPNT_S1", ["Response_Kind"],
  ["Response_Text", "Response_Doc_Refs_JSON", "Supplier_Responsible_Email", "Portal_Query_Item_Id",
   "Awaiting_Response", "OP_Outcome", "Outcome_Reason"],
  "PART D L918: Response_Kind Mandatory is the Y3 guard; OP_Outcome/Outcome_Reason only for a withdrawal (Workbench allows only Withdrawn here).",
  ro=["Rounds"])
for d, _, _ in DEPTS6:
    edit = ["OP_Progress", "Outcome_Reason", "Return_Reason", "Accepted_Doc_File_Name", "Accepted_Doc_Uploaded_At",
            "Reviewed_Answers_Rev", "On_Behalf_Of", "Rounds"] + op_round + ["Response_Kind", "Response_Text",
                                                                              "Response_Doc_Refs_JSON"]
    if d in ("SAF", "REG"):
        edit += ["Late_Decision", "Late_Decision_Reason"]
    h(OPNT, f"OPNT_R_{d}", ["OP_Outcome", "Reviewed_By", "Reviewed_By_Email", "Reviewed_At"], edit,
      "v4 L246, L251; PART D L919. Rounds (child table) Editable here only, table-level key (A2 L30). Current-round fields Editable so the Workbench can write round n+1 and clear the answer before the Return send-back.")
h(CHRQ, "CHRQ_S0", [],
  ["CR_Key", "Case_Code", "Cycle_No", "Supplier_Code", "Change_Kind", "Section_Key", "Field_Key", "Row_Id",
   "Current_Value_Text", "Proposed_Value_JSON", "Change_Reason", "Portal_CR_Item_Id", "Raised_By_Portal_User"],
  "PART D L976: Y6 fields; triage and assessment fields ReadOnly. Nothing Mandatory so a Y6 create is never refused.")
h(CHRQ, "CHRQ_S1",
  ["Case_Item_Id", "Contact_Verified", "CR_Outcome"] + [f"Impact_{d}" for d, _, _ in DEPTS5]
  + ["Supplier_Outcome_Text", "Notice_Key", "Notice_Title", "Portal_Contact_Ids"],
  ["Triage_Note", "Scope_Run_Key", "Notice_Kind"],
  "PART D L977 minus CR_Case (D6: text keys, no Reference).")
for d, _, _ in DEPTS5:
    h(CHRQ, f"CHRQ_B_{d}", [f"{d}_Assessment", f"{d}_Assessed_By", f"{d}_Assessed_At"], [f"{d}_Assess_Note"],
      "Branch-scoped: only this department's four fields (v4 L271).")

# ----------------------------------------------------------------- scenarios
CLOCK = "2026-10-08T09:00:00Z"
S = []


def case_s0(overall="No"):
    return {"step": "CASE_S0", "role": "ciq_rmm", "input": {
        "Case_Code": "CIQ-2026-T0001", "Cycle_No": 1, "Trade_Name": "Fictional Emollient A",
        "Main_INCI": "Caprylic/Capric Triglyceride", "BDF_Material_No": "BDF-900001",
        "Supplier_Code": "SUP-T01", "Supplier_Legal_Name": "Fictional Oleo GmbH",
        "Owner_RMM": "rmm.tester@example.invalid", "Request_Key": "REQ-T0001-C1",
        "BDF_Contact_Name": "Rita Tester", "BDF_Contact_Email": "rita.tester@example.invalid",
        "Supplier_Due_Date": "2026-10-30",
        "Case_Contacts_JSON": "[{\"id\":\"PU-T01\",\"name\":\"Sam Supplier\"}]",
        "Portal_Contact_Ids": "PU-T01", "Confirm_Contact_Ids": "PU-T01",
        "Supplier_Contact_Emails": "sam.supplier@example.invalid",
        "Release_Item_Id": "REL-T-001", "Manifest_Hash": "sha256-fictional-0001",
        "Release_Manifest_JSON": "{\"release\":\"REL-T-001\"}",
        "Overall_Approval_Required": overall}}


def case_s1():
    return {"step": "CASE_S1", "role": "ciq_rmm", "input": {"Basic_Data_Received": "Yes",
                                                             "Portal_Request_Item_Id": "PRQ-T0001"}}


def case_s2(active):
    inp = {f"Dept_{d}_Active": ("Yes" if d in active else "No") for d, _, _ in DEPTS6}
    inp.update({"Initial_Scope_Run_Key": "RUN-T0001-1", "Rule_Set_Version": "RS-1", "RMES_Key": "RMES-T0001-C1",
                "Confirm_Contact_Ids": "PU-T01", "Supplier_Contact_Emails": "sam.supplier@example.invalid",
                "Completeness_Request_Key": "CMP-T0001", "Completeness_Declaration_Text": "Fictional declaration",
                "Completeness_Text_Key": "TXT-PS05-1", "Completeness_Due_Date": "2026-11-15",
                "Final_Release_Request_Key": "FRL-T0001", "Final_Release_Declaration_Text": "Fictional release text",
                "Final_Release_Text_Key": "TXT-PS11-1",
                "Supplier_Closing_Text": "Thank you, the questionnaire is closed."})
    return {"step": "CASE_S2", "role": "ciq_rmm", "input": inp}


def case_s3(counts):
    inp = {"Completeness_Confirm": "Confirmed", "Completeness_By_Name": "Sam Supplier",
           "Completeness_By_Email": "sam.supplier@example.invalid", "Completeness_By_Role": "Quality",
           "Completeness_At": "2026-11-10T10:00:00Z", "RMES_Created_At": "2026-11-10T10:00:00Z"}
    if counts is not None:
        inp.update({"Open_Items_Count": counts, "Open_CR_Count": counts})
    return {"step": "CASE_S3", "role": "ciq_rmm", "input": inp}


def lane(d, role, decision="Approved", omit=None):
    inp = {f"{d}_Review_Confirm": "Confirmed", f"{d}_Completed_By": f"{d.lower()}.tester@example.invalid",
           f"{d}_Completed_By_Email": f"{d.lower()}.tester@example.invalid",
           f"{d}_Completed_At": "2026-11-20T10:00:00Z", f"{d}_Open_Count": 0}
    if d in ("SAF", "REG"):
        inp.update({f"{d}_RMES_Decision": decision, f"{d}_RMES_Gaps": 0})
        if decision == "Rejected":
            inp[f"{d}_RMES_Decision_Reason"] = "Fictional: limit exceeded"
    if omit:
        inp.pop(omit, None)
    return {"step": f"CASE_B_{d}", "role": role, "input": inp}


def case_s5():
    return {"step": "CASE_S5", "role": "ciq_rmm", "input": {"Hold_Note": "Nothing left open", "Open_Items_Count": 0,
                                                             "Open_CR_Count": 0}}


def case_s7(counts=0):
    return {"step": "CASE_S7", "role": "ciq_rmm", "input": {
        "Completion_Trigger": "Supplier final release", "Final_Release_Confirm": "Confirmed",
        "Final_Release_By_Name": "Sam Supplier", "Final_Release_By_Email": "sam.supplier@example.invalid",
        "Final_Release_By_Role": "Quality", "Final_Release_At": "2026-12-01T10:00:00Z",
        "Released_Revs_JSON": "{}", "Evidence_List_Text": "none", "Open_Items_Count": counts, "Open_CR_Count": 0}}


ROLE = {d: r for d, _, r in DEPTS6}
ALL6 = [d for d, _, _ in DEPTS6]

# C1: all six active, counts blank at the join (hold runs), overall approval on + Approved, PS-11, leftover -> close check
S.append({"id": "case-all-lanes-overall-approved", "flow": CASE, "clock": CLOCK,
          "intent": "All six departments active (RMM lane on); counts blank at the join so the release-request hold runs; overall approval switched on and Approved; PS-11 runs; RMM records a leftover at PS-11 so the close check runs; End.",
          "steps": [case_s0("Yes"), case_s1(), case_s2(ALL6), case_s3(None)]
          + [lane(d, ROLE[d]) for d in ALL6]
          + [case_s5(),
             {"step": "CASE_S6", "role": "ciq_overall_approver",
              "input": {"Overall_Decision": "Approved", "Overall_Decided_By": "oa.tester@example.invalid"}},
             case_s7(1),
             {"step": "CASE_S8", "role": "ciq_rmm", "input": {"Hold_Note": "Late contact update resolved",
                                                               "Open_Items_Count": 0, "Open_CR_Count": 0}}],
          "expect": {"terminal": True, "record": {"Overall_Decision": "Approved",
                                                   "Completion_Trigger": "Supplier final release"}}})
# C2: REG+SAF only, counts 0 at S3 -> both holds skipped, overall off -> S6 skipped, PS-11 runs
S.append({"id": "case-two-lanes-no-holds-overall-off", "flow": CASE, "clock": CLOCK,
          "intent": "Only Regulatory and Safety active (QM, MIC, SUS, RMM branches skipped, join still completes); counts 0 so both open-items checks are skipped; overall approval off so it is skipped; PS-11 runs; End.",
          "steps": [case_s0("No"), case_s1(), case_s2(["REG", "SAF"]), case_s3(0),
                    lane("REG", ROLE["REG"]), lane("SAF", ROLE["SAF"]), case_s7(0)],
          "expect": {"terminal": True, "record": {"Dept_QM_Active": "No", "Completion_Trigger": "Supplier final release"}}})
# C3: overall rejected -> PS-11 skipped
S.append({"id": "case-overall-rejected-skips-ps11", "flow": CASE, "clock": CLOCK,
          "intent": "Safety records a Rejected internal RMES decision; overall approval on and Rejected; PS-11 is skipped and the case ends with a neutral closing text (Z1).",
          "steps": [case_s0("Yes"), case_s1(), case_s2(["SAF"]), case_s3(0),
                    lane("SAF", ROLE["SAF"], decision="Rejected"),
                    {"step": "CASE_S6", "role": "ciq_overall_approver",
                     "input": {"Overall_Decision": "Rejected", "Overall_Decided_By": "oa.tester@example.invalid",
                               "Overall_Reason": "Fictional: Safety RMES rejected",
                               "Completion_Trigger": "Overall rejection"}}],
          "expect": {"terminal": True, "record": {"Overall_Decision": "Rejected", "SAF_RMES_Decision": "Rejected",
                                                   "Completion_Trigger": "Overall rejection"}}})
# C4: REG rejected path for outcome coverage, with QM/MIC/SUS
S.append({"id": "case-reg-rejected-overall-off", "flow": CASE, "clock": CLOCK,
          "intent": "Regulatory, QM, Microbiology and Sustainability active; Regulatory records Rejected (internal RMES decision, not a raw-material approval); overall approval off, so PS-11 still runs (overall decision blank).",
          "steps": [case_s0("No"), case_s1(), case_s2(["REG", "QM", "MIC", "SUS"]), case_s3(0),
                    lane("REG", ROLE["REG"], decision="Rejected"), lane("QM", ROLE["QM"]),
                    lane("MIC", ROLE["MIC"]), lane("SUS", ROLE["SUS"]), case_s7(0)],
          "expect": {"terminal": True, "record": {"REG_RMES_Decision": "Rejected"}}})
# Denials
pre = [case_s0("No"), case_s1(), case_s2(ALL6), case_s3(0)]
S.append({"id": "case-branch-wrong-role-denied", "flow": CASE, "clock": CLOCK,
          "intent": "CIQ Safety Reviewer attempts Review – Regulatory.",
          "steps": pre + [lane("REG", "ciq_safety_reviewer")], "expect": {"error": "SCENARIO_ROLE_DENIED"}})
S.append({"id": "case-overall-approval-by-rmm-denied", "flow": CASE, "clock": CLOCK,
          "intent": "CIQ RMM attempts Overall approval (Overall Approver only).",
          "steps": [case_s0("Yes"), case_s1(), case_s2(["QM"]), case_s3(0), lane("QM", ROLE["QM"]),
                    {"step": "CASE_S6", "role": "ciq_rmm",
                     "input": {"Overall_Decision": "Approved", "Overall_Decided_By": "rmm.tester@example.invalid"}}],
          "expect": {"error": "SCENARIO_ROLE_DENIED"}})
S.append({"id": "case-create-by-reviewer-denied", "flow": CASE, "clock": CLOCK,
          "intent": "CIQ QM Reviewer attempts to create a case (only CIQ RMM initiates).",
          "steps": [dict(case_s0("No"), role="ciq_qm_reviewer")], "expect": {"error": "SCENARIO_ROLE_DENIED"}})
for d in ALL6:
    S.append({"id": f"case-{d.lower()}-confirm-missing", "flow": CASE, "clock": CLOCK,
              "intent": f"Review – {d} submitted without {d}_Review_Confirm (Mandatory sign-off evidence).",
              "steps": pre + [lane(d, ROLE[d], omit=f"{d}_Review_Confirm")],
              "expect": {"error": "SCENARIO_MANDATORY_MISSING"}})


# Open Point
def op_s0(dept, to_supplier, role="ciq_rmm", kind=None):
    kind = kind or ("Query" if to_supplier == "Yes" else "Department review")
    inp = {"OP_Key": f"OP-T0001-{dept}", "Round_No": 1, "Case_Item_Id": "CASE-ITEM-T0001",
           "Case_Code": "CIQ-2026-T0001", "Cycle_No": 1, "Supplier_Code": "SUP-T01", "OP_Kind": kind,
           "OP_Dept": dept, "Raised_By_Dept": dept, "OP_To_Supplier": to_supplier,
           "Responsible_User": "resp.tester@example.invalid", "Internal_Due_Date": "2026-11-25",
           "Internal_Justification": "Fictional internal reason", "Question_Text": "Please provide the fictional CoA.",
           "Ref_Kind": "Section", "Ref_Label": "K2.1 Composition"}
    if to_supplier == "Yes":
        inp.update({"Query_Key": f"OP-T0001-{dept}|R1", "Ref_Section_Key": "K2.1", "Kind_Label": "Query",
                    "Supplier_Justification": "Needed for the fictional review", "Supplier_Due_Date": "2026-11-20",
                    "Responsible_Name": "Resp Tester", "Responsible_Dept_Label": dept,
                    "Portal_Contact_Ids": "PU-T01", "Awaiting_Response": "Yes"})
    return {"step": "OPNT_S0", "role": role, "input": inp}


def op_s1():
    return {"step": "OPNT_S1", "role": "ciq_rmm", "input": {"Response_Kind": "Answer",
                                                             "Response_Text": "Fictional answer",
                                                             "Awaiting_Response": "No"}}


def op_rev(dept, role, outcome="Accepted"):
    return {"step": f"OPNT_R_{dept}", "role": role, "input": {
        "OP_Outcome": outcome, "Reviewed_By": "rev.tester@example.invalid",
        "Reviewed_By_Email": "rev.tester@example.invalid", "Reviewed_At": "2026-11-22T10:00:00Z",
        "Rounds": [{"Rounds_Round_No": 1, "Rounds_Question_Text": "Please provide the fictional CoA.",
                    "Rounds_Response_Text": "Fictional answer", "Rounds_Outcome": outcome}]}}


for d, label, role in DEPTS6:
    sup = "Yes" if d in ("REG", "SAF", "QM") else "No"
    raiser = role  # department raises its own point (initiator)
    steps = [op_s0(d, sup, role=raiser)] + ([op_s1()] if sup == "Yes" else []) + [op_rev(d, role)]
    S.append({"id": f"op-{d.lower()}-{'supplier' if sup == 'Yes' else 'internal'}-accepted", "flow": OPNT,
              "clock": CLOCK,
              "intent": f"{label} raises a point (to supplier: {sup}); {'Waiting for supplier runs' if sup == 'Yes' else 'Waiting for supplier is skipped'}; only Review – {label} runs; Accepted; End.",
              "steps": steps, "expect": {"terminal": True, "record": {"OP_Dept": d, "OP_Outcome": "Accepted"}}})
S.append({"id": "op-withdrawn-by-owner", "flow": OPNT, "clock": CLOCK,
          "intent": "RMM raises a supplier query routed to Microbiology; the owner withdraws it at review.",
          "steps": [op_s0("MIC", "Yes"), op_s1(), op_rev("MIC", ROLE["MIC"], outcome="Withdrawn")],
          "expect": {"terminal": True, "record": {"OP_Outcome": "Withdrawn"}}})
S.append({"id": "op-review-wrong-dept-denied", "flow": OPNT, "clock": CLOCK,
          "intent": "CIQ QM Reviewer attempts Review – Regulatory on a Regulatory point (REQ-PROC-034).",
          "steps": [op_s0("REG", "No", role="ciq_regulatory_reviewer"), op_rev("REG", "ciq_qm_reviewer")],
          "expect": {"error": "SCENARIO_ROLE_DENIED"}})
S.append({"id": "op-raise-by-overall-approver-denied", "flow": OPNT, "clock": CLOCK,
          "intent": "CIQ Overall Approver attempts to raise an open point (only RMM and the five department Reviewers raise, L237).",
          "steps": [op_s0("REG", "No", role="ciq_overall_approver")], "expect": {"error": "SCENARIO_ROLE_DENIED"}})


# Change Request
def cr_s0(role="ciq_integration_service"):
    return {"step": "CHRQ_S0", "role": role, "input": {
        "CR_Key": "CR-T0001-1", "Case_Code": "CIQ-2026-T0001", "Cycle_No": 1, "Supplier_Code": "SUP-T01",
        "Change_Kind": "Change notice", "Section_Key": "BASIC", "Field_Key": "target_markets",
        "Current_Value_Text": "DE", "Proposed_Value_JSON": "[\"DE\",\"FR\"]", "Change_Reason": "Fictional market add",
        "Portal_CR_Item_Id": "PCR-T0001"}}


def cr_s1(outcome, impacts):
    inp = {"Case_Item_Id": "CASE-ITEM-T0001", "Contact_Verified": "Yes", "CR_Outcome": outcome,
           "Supplier_Outcome_Text": "Your change has been processed.", "Notice_Key": "NOT-T0001-1",
           "Notice_Title": "Change request outcome", "Portal_Contact_Ids": "PU-T01"}
    inp.update({f"Impact_{d}": ("Yes" if d in impacts else "No") for d, _, _ in DEPTS5})
    return {"step": "CHRQ_S1", "role": "ciq_rmm", "input": inp}


def cr_b(d, value, role=None):
    return {"step": f"CHRQ_B_{d}", "role": role or ROLE[d], "input": {
        f"{d}_Assessment": value, f"{d}_Assessed_By": f"{d.lower()}.tester@example.invalid",
        f"{d}_Assessed_At": "2026-11-12T10:00:00Z"}}


ALL5 = [d for d, _, _ in DEPTS5]
for i, val in enumerate(["No impact confirmed", "Re-assessed", "Finding raised"]):
    outcome = ["Accepted", f"Accepted {ND} scope extended", "Accepted"][i]
    S.append({"id": f"cr-all-assess-{val.lower().replace(' ', '-')}", "flow": CHRQ, "clock": CLOCK,
              "intent": f"Y6 creates the request; RMM triages '{outcome}' with every Impact flag Yes; all five Assess branches run with '{val}'; join; End (X6).",
              "steps": [cr_s0(), cr_s1(outcome, ALL5)] + [cr_b(d, val) for d in ALL5],
              "expect": {"terminal": True, "record": {"CR_Outcome": outcome, "REG_Assessment": val}}})
S.append({"id": "cr-partial-impact-rmm-fallback", "flow": CHRQ, "clock": CLOCK,
          "intent": "RMM creates the request by hand (fallback); triage flags only Safety and QM; the other three branches are skipped; End.",
          "steps": [cr_s0("ciq_rmm"), cr_s1("Accepted", ["SAF", "QM"]), cr_b("SAF", "Re-assessed"),
                    cr_b("QM", "No impact confirmed")],
          "expect": {"terminal": True, "record": {"Impact_REG": "No", "SAF_Assessment": "Re-assessed"}}})
for outcome in [f"Refused {ND} after final release", f"Refused {ND} not valid"]:
    S.append({"id": "cr-" + outcome.lower().replace(f" {ND} ", "-").replace(" ", "-"), "flow": CHRQ, "clock": CLOCK,
              "intent": f"Triage '{outcome}': every Impact flag No, so all five Assess branches are skipped and the all-skipped join must still reach End (AR01 / K-PAR).",
              "steps": [cr_s0(), cr_s1(outcome, [])],
              "expect": {"terminal": True, "record": {"CR_Outcome": outcome}}})
S.append({"id": "cr-triage-by-reviewer-denied", "flow": CHRQ, "clock": CLOCK,
          "intent": "CIQ Regulatory Reviewer attempts Triage (RMM only).",
          "steps": [cr_s0(), dict(cr_s1("Accepted", ["REG"]), role="ciq_regulatory_reviewer")],
          "expect": {"error": "SCENARIO_ROLE_DENIED"}})
S.append({"id": "cr-assess-wrong-dept-denied", "flow": CHRQ, "clock": CLOCK,
          "intent": "CIQ Sustainability Reviewer attempts Assess – Microbiology.",
          "steps": [cr_s0(), cr_s1("Accepted", ["MIC"]), cr_b("MIC", "Re-assessed", role="ciq_sustainability_reviewer")],
          "expect": {"error": "SCENARIO_ROLE_DENIED"}})

# ------------------------------------------------------------------- meta
SLA_STEPS = [
    {"flow": CASE, "step": "CASE_S1", "basis": "Supplier due date (Supplier_Due_Date); escalate to the owner", "evidence": "L185"},
    {"flow": CASE, "step": "CASE_S2", "basis": "Scope-check time", "evidence": "L186"},
    {"flow": CASE, "step": "CASE_S3", "basis": "Supplier due date (Completeness_Due_Date)", "evidence": "L187"},
] + [{"flow": CASE, "step": f"CASE_B_{d}", "basis": "Review time, reminder + escalation (REQ-RMES-019)", "evidence": "L189"} for d in ALL6] + [
    {"flow": CASE, "step": "CASE_S5", "basis": "Check time", "evidence": "L190"},
    {"flow": CASE, "step": "CASE_S6", "basis": "Approval time", "evidence": "L191"},
    {"flow": CASE, "step": "CASE_S7", "basis": "Supplier due date (Final_Release_Due_Date)", "evidence": "L192"},
    {"flow": CASE, "step": "CASE_S8", "basis": "Check time", "evidence": "L193"},
    {"flow": OPNT, "step": "OPNT_S1", "basis": "Supplier due date (Supplier_Due_Date)", "evidence": "L245"},
] + [{"flow": OPNT, "step": f"OPNT_R_{d}", "basis": "Internal due date (Internal_Due_Date)", "evidence": "L246"} for d in ALL6] + [
    {"flow": CHRQ, "step": "CHRQ_S1", "basis": "Triage time", "evidence": "L270"},
] + [{"flow": CHRQ, "step": f"CHRQ_B_{d}", "basis": "Assessment time", "evidence": "L271"} for d in ALL5]

SWITCHES = {
    "source": "brd.md L411-L418 (v4 §7 'After generate (by hand)'); e-mail switches PART D L793-L801, L918",
    "CIQ_Case_A00": {
        "send_back": "OFF on every step",
        "reject": "ON only at the RMM steps CASE_S1, CASE_S2, CASE_S3, CASE_S5, CASE_S7, CASE_S8 (cancellation); OFF at CASE_B_* and CASE_S6 (Case Admin rejects there through the flow-Admin route, K-13/K-PAR-3)",
        "step_email": "OFF at CASE_S1, CASE_S3, CASE_S7 (supplier waits; X1/X4/X5 notify); ON at CASE_B_* (the department's notification, REQ-PROC-017)",
    },
    "CIQ_Open_Point_A00": {
        "send_back": "ON only at OPNT_R_* (the Return to 'Waiting for supplier', v4 L246, L414); OFF at OPNT_S1",
        "reject": "OFF at OPNT_S1 and OPNT_R_* (Case Admin ends stray points through the admin route on cancellation)",
        "step_email": "OFF at OPNT_S1 (X3 notifies the supplier)",
    },
    "CIQ_Change_Request_A00": {"send_back": "OFF on CHRQ_S1 and CHRQ_B_*", "reject": "OFF on CHRQ_S1 and CHRQ_B_*"},
    "other_after_generate": ["flow Admin for CIQ Case Admin on all three Processes (L416)",
                             "SLA durations on every step in sla_steps (L417)",
                             "field-assigned owners after K-FA: CASE_S1 -> Owner_RMM, OPNT_S1 -> Responsible_User (L185, L245, L418)"],
}

workflow = {
    "processes": {
        CASE: {"flow": "CIQ Case", "steps": case_steps},
        OPNT: {"flow": "CIQ Open Point", "steps": op_steps},
        CHRQ: {"flow": "CIQ Change Request", "steps": cr_steps},
    },
    "cases": {},
    "slas": [],
    "notifications": [],
    "journey_scenarios": S,
    "meta": {
        "owner": "kf-workflow-designer",
        "stage": "STAGE 2 wave 2 (parallel with kf-data-architect)",
        "architecture_revision": 3,
        "data_model_revision": 4,
        "contract": "Step ids/names/owners/conditions byte-exact per architecture.id_reservations.step_prefix_by_flow; en-dash U+2013 in every 'X – Y' name.",
        "parallel_blocks": {
            "CASE_PAR": "Part 2 – Beiersdorf review: 6 one-step arms, conditions Dept_<D>_Active = \"Yes\", native all-join before CASE_S5",
            "CHRQ_PAR": "Assess impact: 5 one-step arms, conditions Impact_<D> = \"Yes\", native all-join before End",
        },
        "rejection_and_cancellation": "Not modelled as steps: native Reject (with mandatory comment) is the cancellation path (v4 L215); the Return on CIQ Open Point is the native send-back from the review step (v4 L246).",
        "sla_note": "Every step in sla_steps carries an SLA per v4 (L182-L194, L242-L247, L267-L272). BDF sets the durations, so workflow.slas = [] and the durations are set by hand after generate. Z3/Z4 (SLA breach -> CIQ Audit Event) are kf-integration-analyst's automations.",
        "sla_steps": SLA_STEPS,
        "notifications_note": "No IR notifications: supplier notices are X1/X3/X4/X5/X6 (portal session) and Z1/Z2 (automations); department notification is the native step e-mail at CASE_B_* (switch list).",
        "after_generate_switches": SWITCHES,
        "field_reconciliation": "Every condition field, handoff cell and scenario input is checked against data_model revision 4 (kf-data-architect). Rounds columns: Rounds_Round_No, Rounds_Question_Text, Rounds_Response_Text, Rounds_Outcome.",
        "security_handoff": {
            "note": "Per-step permission cells for kf-security-designer (security.field_permissions[flow][stepId][field]). Every field not listed is ReadOnly at that step and must be keyed ReadOnly explicitly (an unkeyed child table compiles Editable at the StartEvent, zz-spike D6). Child tables are keyed at TABLE level only (A2 L30): Rounds Editable at OPNT_R_* only, ReadOnly at OPNT_S0/OPNT_S1. No step keys on CASE_PAR/CHRQ_PAR or End.",
            "initiators": {CASE: ["ciq_rmm"],
                           OPNT: ["ciq_rmm", "ciq_regulatory_reviewer", "ciq_safety_reviewer", "ciq_qm_reviewer",
                                  "ciq_microbiology_reviewer", "ciq_sustainability_reviewer"],
                           CHRQ: ["ciq_integration_service", "ciq_rmm"]},
            "act": "steps[id]: 'Act' for exactly the step's assignee_role; every other role View.",
            "items": H,
        },
    },
}

out = sys.argv[1]
json.dump(workflow, open(out, "w"), indent=1, ensure_ascii=False)
n = lambda steps: sum(len(b["steps"]) for s in steps for b in s.get("branches", [])) + len(steps)
print("case steps", n(case_steps), "op steps", n(op_steps), "cr steps", n(cr_steps), "scenarios", len(S), "handoff", len(H))
