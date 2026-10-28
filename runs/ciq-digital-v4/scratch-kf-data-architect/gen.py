import json, re, sys
OUT = sys.argv[1]

def F(fid, typ, **kw):
    f = {"id": fid, "name": kw.pop("label", fid.replace("_", " ")), "type": typ}
    f.update(kw)
    return f
T  = lambda i, **k: F(i, "Text", **k)
TA = lambda i, **k: F(i, "Textarea", **k)
N  = lambda i, **k: F(i, "Number", **k)
D  = lambda i, **k: F(i, "Date", **k)
DT = lambda i, **k: F(i, "DateTime", **k)
EM = lambda i, **k: F(i, "Email", **k)
U  = lambda i, **k: F(i, "User", **k)
AT = lambda i, **k: F(i, "Attachment", **k)
S  = lambda i, lst, **k: F(i, "Select", referredList=lst, **k)
YN = lambda i, **k: S(i, "CIQ_Yes_No", **k)
FX = lambda i, typ, formula, **k: F(i, typ, formula=formula, **k)

DEPTS = ["REG", "SAF", "QM", "MIC", "SUS", "RMM"]
ASSESS = ["REG", "SAF", "QM", "MIC", "SUS"]

# ---------------- P1 CIQ Case ----------------
case = [
  # identity and material (v4 L197; PART D L734-L742)
  T("Case_Code"), N("Cycle_No"), T("Case_Title"), T("Reactivates_Case_Item"),
  T("Trade_Name"), T("Main_INCI", label="Main INCI"), T("BDF_Material_No", label="BDF Material No"),
  T("SAP_Material_No", label="SAP Material No"), T("IRMA_Ref", label="IRMA Ref"),
  T("Supplier_Code"), T("Supplier_Legal_Name"),
  U("Owner_RMM", label="Owner RMM"), T("Target_Markets_Text"), T("Origin_Types"), YN("Case_Test"),
  # portal mirrors ->X1 (PART C P1)
  T("Request_Key"), T("BDF_Contact_Name", label="BDF Contact Name"), EM("BDF_Contact_Email", label="BDF Contact Email"),
  T("Markets_Label"), T("Template_Label"), D("Supplier_Due_Date"),
  # contacts as fields (v4 L199, L330)
  TA("Case_Contacts_JSON", label="Case Contacts JSON"), T("Portal_Contact_Ids"), T("Confirm_Contact_Ids"), TA("Supplier_Contact_Emails"),
  # pinned release (v4 L198)
  T("Release_Item_Id"), T("Release_Key"), T("Manifest_Hash"), TA("Release_Manifest_JSON", label="Release Manifest JSON"),
  T("Rule_Set_Version"), T("Overall_Approval_Required"),
  # guards / twin ids (Y1)
  T("Basic_Data_Received"), T("Portal_Request_Item_Id"),
  # scope / department flags (v4 L200)
  *[YN(f"Dept_{d}_Active", label=f"Dept {d} Active") for d in DEPTS], T("Initial_Scope_Run_Key"),
  # PS-05 (->X4 / <-Y4) and RMES header (v4 L202-L203)
  T("Completeness_Request_Key"), TA("Completeness_Declaration_Text"), T("Completeness_Text_Key"), D("Completeness_Due_Date"),
  T("Completeness_Confirm"), T("Completeness_By_Name"), EM("Completeness_By_Email"), T("Completeness_By_Role"), DT("Completeness_At"),
  T("RMES_Key", label="RMES Key"), DT("RMES_Created_At", label="RMES Created At"),
  # PS-11 (->X5 / <-Y5)
  T("Final_Release_Request_Key"), TA("Final_Release_Declaration_Text"), T("Final_Release_Text_Key"), D("Final_Release_Due_Date"),
  T("Final_Release_Confirm"), T("Final_Release_By_Name"), EM("Final_Release_By_Email"), T("Final_Release_By_Role"), DT("Final_Release_At"),
  TA("Released_Revs_JSON", label="Released Revs JSON"), TA("Evidence_List_Text"), T("Completion_Trigger"),
]
# six lanes (v4 L201; PART D L760-L762)
for d in DEPTS:
    case += [S(f"{d}_Review_Confirm", "CIQ_Confirm", label=f"{d} Review Confirm"),
             U(f"{d}_Completed_By", label=f"{d} Completed By"),
             EM(f"{d}_Completed_By_Email", label=f"{d} Completed By Email"),
             DT(f"{d}_Completed_At", label=f"{d} Completed At"),
             T(f"{d}_On_Behalf_Of", label=f"{d} On Behalf Of")]
    if d in ("SAF", "REG"):
        case += [S(f"{d}_RMES_Decision", "CIQ_Decision", label=f"{d} Internal RMES decision"),
                 TA(f"{d}_RMES_Decision_Reason", label=f"{d} RMES Decision Reason")]
# holds and gates: plain Number counts written by the Workbench (A2 L32-L34) + blank-safe formulas
case += [N("Open_Items_Count"), N("Open_CR_Count", label="Open CR Count")]
for d in DEPTS:
    case.append(N(f"{d}_Open_Count", label=f"{d} Open Count"))
    if d in ("SAF", "REG"):
        case.append(N(f"{d}_RMES_Gaps", label=f"{d} RMES Gaps"))
case += [
  FX("Hold_For_Open_Items", "Text",
     'IF(OR(ISBLANK(Open_Items_Count),ISBLANK(Open_CR_Count)),"Yes",IF(Open_Items_Count+Open_CR_Count=0,"No","Yes"))'),
  FX("Open_Items_Gate", "Text",
     'IF(NOT(ISBLANK(Hold_Override_Reason)),"OK",IF(OR(ISBLANK(Open_Items_Count),ISBLANK(Open_CR_Count)),"",IF(Open_Items_Count+Open_CR_Count=0,"OK","")))'),
  TA("Hold_Note"), TA("Hold_Override_Reason"),
]
for d in DEPTS:
    if d in ("SAF", "REG"):
        fx = f'IF(OR(ISBLANK({d}_Open_Count),ISBLANK({d}_RMES_Gaps)),"",IF({d}_Open_Count+{d}_RMES_Gaps=0,"OK",""))'
    else:
        fx = f'IF(ISBLANK({d}_Open_Count),"",IF({d}_Open_Count=0,"OK",""))'
    case.append(FX(f"{d}_Gate", "Text", fx, label=f"{d} Gate"))
# outcome
case += [TA("Late_Completions_Text"), S("Overall_Decision", "CIQ_Decision"), TA("Overall_Reason"),
         U("Overall_Decided_By"), TA("Supplier_Closing_Text"), AT("Final_PDF", label="Final PDF")]

# ---------------- P2 CIQ Open Point ----------------
op = [
  T("OP_Key", label="OP Key"), N("Round_No"), T("Query_Key"),
  T("Case_Code"), N("Cycle_No"), T("Supplier_Code"), T("Case_Item_Id"),
  S("OP_Kind", "CIQ_OP_Kind", label="OP Kind"), S("OP_Dept", "CIQ_Review_Dept", label="OP Dept"),
  S("Raised_By_Dept", "CIQ_Review_Dept"), YN("OP_To_Supplier", label="OP To Supplier"),
  T("Ref_Kind"), T("Ref_Section_Key"), T("Ref_Field_Key"), T("Ref_Row_Id"), T("Ref_Doc_Id"),
  T("Ref_Doc_File_Name"), DT("Ref_Doc_Uploaded_At"), T("Ref_Label"), T("Ref_Internal_Key"),
  T("Kind_Label"), TA("Question_Text"), TA("Supplier_Justification"), TA("Internal_Justification"),
  U("Responsible_User"), T("Responsible_Name"), T("Responsible_Dept_Label"),
  D("Internal_Due_Date"), D("Supplier_Due_Date"),
  T("New_Section_Item_Key"), T("Portal_Contact_Ids"), TA("Thread_Text"), T("Awaiting_Response"),
  T("Response_Kind"), TA("Response_Text"), TA("Response_Doc_Refs_JSON", label="Response Doc Refs JSON"),
  T("Supplier_Responsible_Email"), T("Portal_Query_Item_Id"),
  S("OP_Progress", "CIQ_OP_Progress", label="OP Progress"), S("OP_Outcome", "CIQ_OP_Outcome", label="OP Outcome"),
  TA("Outcome_Reason"), TA("Return_Reason"),
  T("Accepted_Doc_File_Name"), DT("Accepted_Doc_Uploaded_At"),
  U("Reviewed_By"), EM("Reviewed_By_Email"), DT("Reviewed_At"), N("Reviewed_Answers_Rev"),
  S("Late_Decision", "CIQ_Decision"), TA("Late_Decision_Reason"), T("On_Behalf_Of"),
  FX("Open_Num", "Number", 'IF(OP_Outcome="Accepted",0,IF(OP_Outcome="Withdrawn",0,1))'),
  FX("Start_Gate", "Text",
     'IF(OP_To_Supplier="No","OK",IF(OR(ISBLANK(Ref_Kind),ISBLANK(Ref_Section_Key),ISBLANK(Ref_Label),ISBLANK(Kind_Label),'
     'ISBLANK(Question_Text),ISBLANK(Supplier_Justification),ISBLANK(Supplier_Due_Date),ISBLANK(Responsible_Name),'
     'ISBLANK(Responsible_Dept_Label)),"","OK"))'),
]
rounds = [N("Rounds_Round_No", label="Round No"), TA("Rounds_Question_Text", label="Question Text"),
          T("Rounds_Response_Kind", label="Response Kind"), TA("Rounds_Response_Text", label="Response Text"),
          S("Rounds_Outcome", "CIQ_OP_Outcome", label="Outcome"), TA("Rounds_Reason", label="Reason"),
          T("Rounds_Doc_File_Name", label="Doc File Name"), DT("Rounds_Doc_Uploaded_At", label="Doc Uploaded At"),
          U("Rounds_Reviewed_By", label="Reviewed By"), DT("Rounds_Reviewed_At", label="Reviewed At")]

# ---------------- P3 CIQ Change Request ----------------
cr = [
  T("CR_Key", label="CR Key"), T("Case_Code"), N("Cycle_No"), T("Supplier_Code"),
  T("Change_Kind"), T("Section_Key"), T("Field_Key"), T("Row_Id"),
  TA("Current_Value_Text"), TA("Proposed_Value_JSON", label="Proposed Value JSON"), TA("Change_Reason"),
  T("Portal_CR_Item_Id", label="Portal CR Item Id"), T("Raised_By_Portal_User"),
  T("Case_Item_Id"), YN("Contact_Verified"), S("CR_Outcome", "CIQ_CR_Outcome", label="CR Outcome"),
  TA("Triage_Note"), T("Scope_Run_Key"),
  *[YN(f"Impact_{d}", label=f"Impact {d}") for d in ASSESS],
  T("Notice_Key"), T("Notice_Kind"), T("Notice_Title"), TA("Supplier_Outcome_Text"), T("Portal_Contact_Ids"),
]
for d in ASSESS:
    cr += [S(f"{d}_Assessment", "CIQ_Impact_Resolution", label=f"{d} Assessment"),
           TA(f"{d}_Assess_Note", label=f"{d} Assess Note"),
           U(f"{d}_Assessed_By", label=f"{d} Assessed By"),
           DT(f"{d}_Assessed_At", label=f"{d} Assessed At")]
cr.append(FX("CR_Open_Num", "Number",
    "IF(ISBLANK(CR_Outcome),1,0)+" + "+".join(
        f'IF(Impact_{d}="Yes",IF(ISBLANK({d}_Assessment),1,0),0)' for d in ASSESS), label="CR Open Num"))

# ---------------- F1 CIQ Supplier ----------------
sup = [T("Supplier_Code", required=True), T("Supplier_Legal_Name", required=True), T("DUNS_Number", label="DUNS Number"),
       S("Supplier_Kind", "CIQ_Supplier_Kind"), S("Supplier_Country_Code", "CIQ_Country_Code"),
       T("SAP_Vendor_Id", label="SAP Vendor Id"), T("Teamcenter_Supplier_Id"),
       YN("Supplier_Active"), YN("Supplier_Test"),
       TA("Contact_Portal_Ids_Text"), N("Pending_Invites")]
contacts = [T("Contacts_Full_Name", label="Full Name"), EM("Contacts_Email", label="Email"),
            S("Contacts_Role", "CIQ_Contact_Role", label="Contact Role"), YN("Contacts_Can_Confirm", label="Can Confirm"),
            T("Contacts_Portal_User_Id", label="Portal User Id"), YN("Contacts_Active", label="Contact Active"),
            DT("Contacts_Invite_Requested_At", label="Invite Requested At"), DT("Contacts_Invited_At", label="Invited At")]

# ---------------- F2 CIQ Config Version ----------------
cfg = [T("Config_Key", required=True), S("Config_Kind", "CIQ_Config_Kind", required=True), T("Version_Label"),
       S("Config_State", "CIQ_Config_State"), T("Section_Key"), N("Section_Rev"),
       TA("Payload_JSON", label="Payload JSON"), TA("Internal_Annotations_JSON", label="Internal Annotations JSON"),
       T("Content_Hash"), T("Evaluator_Version"), TA("Change_Note"), U("Published_By"), DT("Published_At"),
       # Release rows (v4 L279; PART D P5 L1043-L1048)
       T("Release_Key"), T("Release_Label"), S("Release_Stage", "CIQ_Release_Stage"),
       TA("Release_Manifest_JSON", label="Release Manifest JSON"), TA("Release_Bundle_JSON", label="Release Bundle JSON"),
       T("Manifest_Hash"), TA("Regression_Result_JSON", label="Regression Result JSON"), T("Test_Case_Codes")]

# ---------------- F3 CIQ Section ----------------
sec = [T("Section_Item_Key", required=True), T("Case_Code", required=True), N("Cycle_No", required=True),
       T("Supplier_Code", required=True), T("Section_Key", required=True), T("Section_Code", required=True),
       T("Section_Title", required=True), N("Section_Sort"), T("Applicability_Label"), T("Supplier_Reason"),
       T("Added_Later"), T("Section_Origin", required=True),
       TA("Definition_JSON", label="Definition JSON", required=True), T("Definition_Hash", required=True),
       D("Supplier_Due_Date"), T("Portal_Contact_Ids"),
       T("Case_Item_Id"), S("Lead_Dept", "CIQ_Department"), S("Query_Owner_Dept", "CIQ_Review_Dept"),
       T("Co_Review_Depts"), T("Scope_Run_Key"), T("Derivation_Kind"), TA("Override_Justification"),
       T("Section_Def_Key"), T("Source_Content_Hash"), T("Created_By_Key"),
       TA("Search_INCI", label="Search INCI"), TA("Search_CAS", label="Search CAS"),
       T("Search_Origin_Types"), T("Search_DUNS", label="Search DUNS"),
       N("Source_Answers_Rev"), DT("Rebuilt_At")]
components = [T("Components_Row_Id", label="Row Id"), T("Components_INCI", label="INCI"),
              T("Components_CAS_No", label="CAS No"), T("Components_EC_No", label="EC No"),
              T("Components_Function", label="Component Function"), YN("Components_Is_Additive", label="Is Additive"),
              T("Components_Origin", label="Component Origin"),
              N("Components_Conc_Min", label="Conc Min"), N("Components_Conc_Max", label="Conc Max")]

# ---------------- F4 CIQ Scope Run ----------------
run = [T("Run_Key", required=True), T("Case_Code"), N("Cycle_No"), T("Case_Item_Id"), N("Run_No"),
       T("Scope_Trigger"), T("Related_Key"), T("Release_Item_Id"), T("Rule_Set_Version"), T("Evaluator_Version"),
       TA("Input_JSON", label="Input JSON"), T("Input_Hash"), TA("Result_JSON", label="Result JSON"),
       TA("Added_Section_Keys"), T("Lead_Departments"), TA("Override_Justification"), U("Run_By"), DT("Run_At")]

# ---------------- F5/F6 RMES ----------------
def rmes():
    return [T("RMES_Key", label="RMES Key", required=True),
            F("Result_Case", "Reference", ref="CIQ_Case_A00"),
            T("Case_Item_Id"), T("Case_Code"), N("Cycle_No"),
            N("Open_Criteria_Count"), N("Open_Blocking_Findings_Count"),
            T("Editing_By"), DT("Editing_Since"), YN("RMES_Voided", label="RMES Voided")]
def criteria():
    c = "Criteria_"
    return [T(c+"Code", label="Criterion Code"), S(c+"Part", "CIQ_RMES_Part", label="RMES Part"),
            T(c+"Title", label="Criterion Title"), YN(c+"Applicable", label="Applicable"),
            T(c+"Applicability_Basis", label="Applicability Basis"), TA(c+"Override_Reason", label="Override Reason"),
            T(c+"Prefill_Value", label="Prefill Value"),
            T(c+"Source_Section_Key", label="Source Section Key"), T(c+"Source_Field_Key", label="Source Field Key"),
            T(c+"Source_Row_Id", label="Source Row Id"), TA(c+"Source_Value_Text", label="Source Value Text"),
            N(c+"Source_Answers_Rev", label="Source Answers Rev"),
            T(c+"Source_Doc_File_Name", label="Source Doc File Name"), DT(c+"Source_Doc_Uploaded_At", label="Source Doc Uploaded At"),
            S(c+"Result", "CIQ_RMES_Result", label="Result"), TA(c+"Comment", label="Comment"),
            U(c+"Recorded_By", label="Recorded By"), DT(c+"Recorded_At", label="Recorded At"),
            N(c+"Reported_Value", label="Reported Value"), T(c+"Reported_Unit", label="Reported Unit"),
            N(c+"Limit_Value", label="Limit Value"), T(c+"Limit_Comparator", label="Limit Comparator"),
            T(c+"Limit_Set_Version", label="Limit Set Version"), YN(c+"Limit_Pass", label="Limit Pass"),
            S(c+"Impact_Resolution", "CIQ_Impact_Resolution", label="Impact Resolution"),
            TA(c+"AI_Suggestion_Text", label="AI Suggestion Text"), TA(c+"AI_Source_Quote", label="AI Source Quote"),
            T(c+"AI_Source_Doc_File_Name", label="AI Source Doc File Name"),
            DT(c+"AI_Source_Doc_Uploaded_At", label="AI Source Doc Uploaded At"),
            S(c+"AI_State", "CIQ_AI_State", label="AI State"),
            U(c+"AI_Decided_By", label="AI Confirmed By"), DT(c+"AI_Decided_At", label="AI Confirmed At"),
            FX(c+"Open_Num", "Number",
               'IF(Criteria_Applicable="No",0,IF(ISBLANK(Criteria_Result),1,IF(OR(Criteria_Result="Available",'
               'Criteria_Result="Plausible",Criteria_Result="Listed"),0,IF(ISBLANK(Criteria_Comment),1,0))))',
               label="Open Num")]
def findings():
    c = "Findings_"
    return [TA(c+"Text", label="Finding Text"), T(c+"Criterion_Code", label="Criterion Code"),
            YN(c+"Blocking", label="Blocking"), T(c+"State", label="Finding State"),
            T(c+"Linked_OP_Key", label="Linked OP Key")]

# ---------------- F7 / F8 ----------------
note = [T("Note_Key"), T("Case_Code"), N("Cycle_No"), T("Case_Item_Id"), T("Linked_Kind"), T("Linked_Key"),
        TA("Note_Text", required=True), U("Note_Author"), S("Note_Dept", "CIQ_Department"), DT("Note_At")]
audit = [T("Event_Key"), T("Case_Code"), N("Cycle_No"), T("Case_Item_Id"), DT("Event_At"),
         S("Event_Category", "CIQ_Event_Category", required=True), T("Action_Code"),
         S("Actor_Side", "CIQ_Actor_Side"), T("Actor_Name"), EM("Actor_Email"), S("Actor_Dept", "CIQ_Department"),
         T("Actor_Role_Id"), T("On_Behalf_Of"),
         T("Object_Kind"), T("Object_Key"), T("Object_Item_Id"), T("Object_State"),
         TA("Old_Value_Text"), TA("New_Value_Text"), T("Source_Doc_File_Name"), DT("Source_Doc_Uploaded_At"),
         N("Source_Answers_Rev"), T("Config_Keys"), TA("Event_Reason"),
         TA("Notify_Recipient"), T("Notify_Channel"), D("Delegation_Valid_From"), D("Delegation_Valid_To"),
         T("Portal_Activity_Ref"), TA("Snapshot_JSON", label="Snapshot JSON")]

def flow(name, ft, fields, child=None):
    return {"name": name, "flowType": ft, "fields": fields, "computed": [], "child_tables": child or []}

flows = {
  "CIQ_Case_A00": flow("CIQ Case", "Process", case),
  "CIQ_Open_Point_A00": flow("CIQ Open Point", "Process", op, [{"id": "Rounds", "name": "Rounds", "fields": rounds}]),
  "CIQ_Change_Request_A00": flow("CIQ Change Request", "Process", cr),
  "CIQ_Supplier_A00": flow("CIQ Supplier", "Form", sup, [{"id": "Contacts", "name": "Contacts", "fields": contacts}]),
  "CIQ_Config_Version_A00": flow("CIQ Config Version", "Form", cfg),
  "CIQ_Section_A00": flow("CIQ Section", "Form", sec, [{"id": "Components", "name": "Components", "fields": components}]),
  "CIQ_Scope_Run_A00": flow("CIQ Scope Run", "Form", run),
  "CIQ_RMES_Safety_A00": flow("CIQ RMES Safety", "Form", rmes(),
      [{"id": "Safety_Criteria", "name": "Criteria", "fields": criteria()},
       {"id": "Safety_Findings", "name": "Findings", "fields": findings()}]),
  "CIQ_RMES_Regulatory_A00": flow("CIQ RMES Regulatory", "Form", rmes(),
      [{"id": "Regulatory_Criteria", "name": "Criteria", "fields": criteria()},
       {"id": "Regulatory_Findings", "name": "Findings", "fields": findings()}]),
  "CIQ_Internal_Note_A00": flow("CIQ Internal Note", "Form", note),
  "CIQ_Audit_Event_A00": flow("CIQ Audit Event", "Form", audit),
}
# lists: exactly the architecture's 21, reserved ids and items
arch = json.load(open(sys.argv[2]))["architecture"]
for l in arch["lists"]:
    flows[l["id"]] = {"name": l["name"], "items": l["items"]}

# ---- self checks ----
bad = {"name", "status", "type", "country", "priority", "category", "currency", "project"}
listids = {l["id"] for l in arch["lists"]}
errs = []
for fid, fl in flows.items():
    if "items" in fl: continue
    hdr = [f["id"] for f in fl["fields"]]
    if len(hdr) != len(set(hdr)): errs.append((fid, "dup header id"))
    slugs = [re.sub(r"\W+", "_", f["name"]).strip("_").lower() for f in fl["fields"]]
    if len(slugs) != len(set(slugs)): errs.append((fid, "dup header name slug", [s for s in slugs if slugs.count(s) > 1]))
    allids = set(hdr)
    for ct in fl["child_tables"]:
        for c in ct["fields"]:
            if c["id"] in allids: errs.append((fid, "child id collides", c["id"]))
            allids.add(c["id"])
    for f in fl["fields"] + [c for ct in fl["child_tables"] for c in ct["fields"]]:
        if f["name"].lower() in bad or f["id"].lower() in bad: errs.append((fid, "reserved name", f["id"]))
        if f["type"] == "Select" and f["referredList"] not in listids: errs.append((fid, "bad list", f["id"]))
        if "formula" in f:
            for tok in re.findall(r'(?<!")\b[A-Za-z_][A-Za-z0-9_]*\b(?!")', re.sub(r'"[^"]*"', '""', f["formula"])):
                if tok in ("IF", "OR", "AND", "NOT", "ISBLANK"): continue
                if tok not in allids: errs.append((fid, "formula ident", f["id"], tok))
print("ERRS", errs)
json.dump({"flows": flows}, open(OUT, "w"), indent=1, ensure_ascii=False)
for fid, fl in flows.items():
    if "items" in fl: print(f"  list {fid}: {len(fl['items'])}"); continue
    print(fid, len(fl["fields"]), "fields;", sum(1 for f in fl["fields"] if "formula" in f), "formulas;",
          [(c["id"], len(c["fields"])) for c in fl["child_tables"]])
