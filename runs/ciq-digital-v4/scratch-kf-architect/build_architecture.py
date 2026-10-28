# kf-architect, run ciq-digital-v4, stage 2 wave 1.
# Builds the `architecture` slice payload from brd.md PART A/B (v4) and the domain slice (revision 2).
# Output: architecture.json (committed with ir-graph-cli commit-slice architecture ...).
import json, os

HERE = os.path.dirname(os.path.abspath(__file__))
DOMAIN = json.load(open(os.path.join(HERE, "domain.json")))["content"]
EN = "–"  # en-dash, PART A L44

RUN = "runs/ciq-digital-v4"

# ---------------------------------------------------------------- departments
# code, label, reviewer role id, reviewer role name
DEPTS = [
    ("REG", "Regulatory", "ciq_regulatory_reviewer", "CIQ Regulatory Reviewer", "p_reg_reviewer"),
    ("SAF", "Safety", "ciq_safety_reviewer", "CIQ Safety Reviewer", "p_saf_reviewer"),
    ("QM", "QM", "ciq_qm_reviewer", "CIQ QM Reviewer", "p_qm_reviewer"),
    ("MIC", "Microbiology", "ciq_microbiology_reviewer", "CIQ Microbiology Reviewer", "p_mic_reviewer"),
    ("SUS", "Sustainability", "ciq_sustainability_reviewer", "CIQ Sustainability Reviewer", "p_sus_reviewer"),
]
RMM = ("RMM", "RMM", "ciq_rmm", "CIQ RMM", "p_rmm")

# ---------------------------------------------------------------- flows
F = {
    "case": ("CIQ Case", "CIQ_Case_A00", "Process", "P1"),
    "op": ("CIQ Open Point", "CIQ_Open_Point_A00", "Process", "P2"),
    "cr": ("CIQ Change Request", "CIQ_Change_Request_A00", "Process", "P3"),
    "sup": ("CIQ Supplier", "CIQ_Supplier_A00", "Form", "F1"),
    "cfg": ("CIQ Config Version", "CIQ_Config_Version_A00", "Form", "F2"),
    "sec": ("CIQ Section", "CIQ_Section_A00", "Form", "F3"),
    "run": ("CIQ Scope Run", "CIQ_Scope_Run_A00", "Form", "F4"),
    "saf": ("CIQ RMES Safety", "CIQ_RMES_Safety_A00", "Form", "F5"),
    "reg": ("CIQ RMES Regulatory", "CIQ_RMES_Regulatory_A00", "Form", "F6"),
    "note": ("CIQ Internal Note", "CIQ_Internal_Note_A00", "Form", "F7"),
    "aud": ("CIQ Audit Event", "CIQ_Audit_Event_A00", "Form", "F8"),
}
def fid(k): return F[k][1]
def fname(k): return F[k][0]

PROCESS_CAPS = {"roleRestrictedTransitions": True, "conditionalTransitions": True, "perStatusFieldPermissions": True}

# child tables: (parent key, id, display name, column prefix, evidence, writer note)
CHILD = [
    ("sup", "Contacts", "Contacts", "Contacts_", "brd.md L122; L278; L329",
     "CIQ RMM writes rows one at a time, re-reads and merges (L278)."),
    ("op", "Rounds", "Rounds", "Rounds_", "brd.md L120; L251; L327; A2 L31 (example Rounds_Round_No)",
     "Only the owning department writes it, at its own review step (L251)."),
    ("sec", "Components", "Components", "Components_", "brd.md L124; L280; L332",
     "K2.1 row only. CIQ RMM or the sync-service rebuild writes it (L280, L332)."),
    ("saf", "Safety_Criteria", "Criteria", "Criteria_", "brd.md L126; L282; L331",
     "Safety only, one user at a time (Editing_By / Editing_Since lock, L282)."),
    ("saf", "Safety_Findings", "Findings", "Findings_", "brd.md L126; L282",
     "Safety only (L282)."),
    ("reg", "Regulatory_Criteria", "Criteria", "Criteria_", "brd.md L127; L283; L331",
     "Regulatory only (L283)."),
    ("reg", "Regulatory_Findings", "Findings", "Findings_", "brd.md L127; L283",
     "Regulatory only (L283)."),
]

def child_tables_of(k):
    out = []
    for (p, cid, cname, pref, ev, writer) in CHILD:
        if p == k:
            out.append({"id": cid, "name": cname, "embedded": True, "column_id_prefix": pref,
                        "step_permission_key": cid if F[k][2] == "Process" else "n/a (Form; no steps)",
                        "writer": writer, "evidence": ev})
    return out

# ---------------------------------------------------------------- roles
roles = [
    {"id": "admin", "name": "Admin", "kind": "default", "personas": [], "journeys": [],
     "rationale": "Platform default required by A3 (brd.md L67). Reused, never created. No business journey."},
    {"id": "user", "name": "User", "kind": "default", "personas": [], "journeys": [],
     "rationale": "Platform default required by A3 (brd.md L67). Reused, never created. No business journey."},
    {"id": "ciq_rmm", "name": "CIQ RMM", "kind": "custom", "personas": ["p_rmm"],
     "journeys": ["j01_create_case", "j02_basic_data", "j03_scope_check", "j04_completeness", "j05_department_review",
                  "j07_open_point_supplier", "j08_internal_points", "j09_open_items_checks", "j11_final_release",
                  "j12_cancel_case", "j13_change_request", "j14_supplier_master", "j16_internal_chat",
                  "j18_find_cases", "j20_reactivate_case"],
     "rationale": "Creates the case and holds every 'Waiting for supplier' step, Scope check, both open-items checks and the RMM branch of Part 2 (brd.md L157, L184-L193). Holds 'Waiting for supplier' and 'Review – RMM' on CIQ Open Point and Triage on CIQ Change Request (L245-L246, L270). Writes CIQ Supplier, CIQ Section and CIQ Scope Run (L278-L281)."},
]
for (code, label, rid, rname, pid) in DEPTS:
    j = ["j05_department_review", "j07_open_point_supplier", "j08_internal_points", "j13_change_request", "j16_internal_chat", "j18_find_cases"]
    extra = ""
    if code in ("SAF", "REG"):
        j.insert(1, "j06_rmes_sheet")
        extra = f" Sole editor of {fname('saf') if code == 'SAF' else fname('reg')} and records its own internal RMES decision (A3 L64; L282-L283)."
    roles.append({"id": rid, "name": rname, "kind": "custom", "personas": [pid], "journeys": j,
                  "rationale": f"Owns 'Review {EN} {label}' on CIQ Case and on CIQ Open Point, and 'Assess {EN} {label}' on CIQ Change Request (brd.md L144, L189, L246, L271). Raises open points (L237).{extra}"})
roles += [
    {"id": "ciq_overall_approver", "name": "CIQ Overall Approver", "kind": "custom", "personas": ["p_overall_approver"],
     "journeys": ["j10_overall_approval", "j16_internal_chat"],
     "rationale": "Owns 'Overall approval' on CIQ Case, which runs only when switched on (brd.md L145, L159, L191; A3 L63)."},
    {"id": "ciq_business_admin", "name": "CIQ Business Admin", "kind": "custom", "personas": ["p_business_admin"],
     "journeys": ["j15_configuration", "j16_internal_chat"],
     "rationale": "Writes CIQ Config Version, including Release rows, with no four-eyes (brd.md L146, L279; A3 L65)."},
    {"id": "ciq_reader", "name": "CIQ Reader", "kind": "custom", "personas": ["p_reader"],
     "journeys": ["j17_audit_oversight", "j18_find_cases", "j16_internal_chat"],
     "rationale": "One read-only role for Customs, Legal, Auditor and Process Owner (brd.md L147; PART D L1241). It may post internal notes (open question Q7 default)."},
    {"id": "ciq_case_admin", "name": "CIQ Case Admin", "kind": "custom", "personas": ["p_case_admin"],
     "journeys": ["j12_cancel_case"],
     "rationale": "Ends a case during Part 2 through the admin route and ends the case's open points and change requests (brd.md L148, L215, L217). Flow Admin is set over REST after generate (A2 L56; L416). Its members also hold CIQ RMM (PART D L1242)."},
    {"id": "ciq_integration_service", "name": "CIQ Integration Service", "kind": "custom", "personas": ["p_integration_service"],
     "journeys": ["j19_sync_service", "j13_change_request", "j11_final_release", "j12_cancel_case", "j17_audit_oversight", "j18_find_cases"],
     "rationale": "The CIQ Sync Service and the integrations: creates CIQ Change Request at Start (Y6), writes CIQ Section and CIQ Audit Event (brd.md L149, L269, L280, L285; A3 L61). Never acts on a human step after Start (A2 L58)."},
]
ROLE_IDS = {r["name"]: r["id"] for r in roles}

# ---------------------------------------------------------------- flows[]
def flow(k, desc, journeys, rationale, extra=None):
    name, id_, typ, ent = F[k]
    d = {"id": id_, "name": name, "type": typ, "flowType": typ, "from_entity": ent, "description": desc,
         "child_tables": child_tables_of(k), "serves_journeys": journeys, "rationale": rationale}
    if typ == "Process":
        d["requiredCapabilities"] = dict(PROCESS_CAPS)
        d["mechanism"] = "process"
    d["build_stage"] = "generate (complete; a published Process can't be edited, LESSONS 1b)" if typ == "Process" else "generate (Form; editable after publish)"
    if extra: d.update(extra)
    return d

flows = [
    flow("case", "One CIQ case cycle, from creation to the final PDF: supplier hand-offs, scope check, the parallel department review, optional overall approval and the single final release. Holds the material identity, the case contacts as fields, the six department lanes, the PS-05/PS-11 confirmations, the RMES header and the gate/hold counts.",
         ["j01_create_case", "j02_basic_data", "j03_scope_check", "j04_completeness", "j05_department_review", "j06_rmes_sheet",
          "j09_open_items_checks", "j10_overall_approval", "j11_final_release", "j12_cancel_case", "j20_reactivate_case"],
         "Moves between RMM, five departments in parallel and the Overall Approver through steps that carry SLAs: a Process (A1 L22; brd.md L119, L154-L194). Typed now because a Form can't gain a workflow later (LESSONS 1)."),
    flow("op", "One question, document request or additional part to the supplier, with every back-and-forth round inside the same item. Also the internal kinds Department review, Contact update and Internal review, which skip the supplier step.",
         ["j07_open_point_supplier", "j08_internal_points", "j05_department_review", "j09_open_items_checks", "j12_cancel_case"],
         "Raised by a department, waits for the supplier, then reviewed by exactly one owning department, with SLAs on each step: a Process (brd.md L120, L222-L247). Its own item, not a case child table: six departments raise points at the same time in Part 2 (L328, C2/C3)."),
    flow("cr", "A change the supplier reports or requests (change notice, correction, attempt after the final release). RMM triages it, the affected departments assess it in parallel, and the supplier gets the outcome as a portal notice.",
         ["j13_change_request", "j12_cancel_case"],
         "Triage by RMM, then a parallel assessment by the impacted departments, each with an SLA: a Process (brd.md L121, L253-L272)."),
    flow("sup", "One supplier company with its people. Supplier_Code is the isolation key on every portal item.",
         ["j14_supplier_master", "j01_create_case", "j18_find_cases"],
         "Master data with no routing: a Data Form (A1 L23; brd.md L122, L278). Contacts are a child table: one writer, small, parent mirrors cover search (L329)."),
    flow("cfg", "Every configuration version and kind (template, section definition, rule set, ownership, RMES criteria, limits, texts, reminders, settings), plus Release rows holding the full frozen bundle a case pins. Copy-on-write.",
         ["j15_configuration", "j01_create_case", "j03_scope_check"],
         "Stored data with no steps (no four-eyes, A3 L65): a Data Form (brd.md L123, L279). CIQ Config Release is folded into Release rows (L136)."),
    flow("sec", "One released section of a case: what was released, why, and for which department. The app twin of the portal section. The K2.1 row carries the component list; K2.1 and BASIC rows carry the search mirrors.",
         ["j01_create_case", "j03_scope_check", "j05_department_review", "j07_open_point_supplier", "j13_change_request", "j18_find_cases", "j19_sync_service", "j20_reactivate_case"],
         "Written once per release and later by the component rebuild, with no steps: a Data Form (brd.md L124, L280). Own rows, not a case child table: each row fires X2 and rows are added when RMM holds no case step (L333, C1/C3)."),
    flow("run", "One run of the scope rules (initial, extension, change notice, additional part, reactivation), with every section's classification including N.A. and the rule and answer behind it. Additions only.",
         ["j03_scope_check", "j13_change_request", "j07_open_point_supplier", "j20_reactivate_case"],
         "Stored data with no steps: a Data Form (brd.md L125, L281). Own rows: runs come from different people at different times (L334, C3)."),
    flow("saf", "Safety's RMES sheet for one case: all criteria and findings in one row, with header counts that feed the case gate and an edit lock.",
         ["j06_rmes_sheet", "j05_department_review", "j10_overall_approval", "j13_change_request"],
         "Working data with no steps: a Data Form (brd.md L126, L282). A separate Form from Regulatory so Safety and Regulatory can't edit each other (REQ-CFG-004, L331, C4)."),
    flow("reg", "Regulatory's RMES sheet for one case; same shape as CIQ RMES Safety.",
         ["j06_rmes_sheet", "j05_department_review", "j10_overall_approval", "j13_change_request"],
         "As CIQ RMES Safety, for Regulatory (brd.md L127, L283, L331)."),
    flow("note", "Internal chat, one message per row. Never visible to suppliers.",
         ["j16_internal_chat"],
         "Stored data with no steps: a Data Form (brd.md L128, L284). One row per message because many people post at any time (L337, C2)."),
    flow("aud", "Who did what and when, on which value and which document. Also notifications, delegations, assignments, section-review marks, scope, configuration, change attempts, cancellations, snapshots and item-created events.",
         ["j17_audit_oversight", "j12_cancel_case", "j13_change_request", "j15_configuration", "j09_open_items_checks", "j05_department_review", "j11_final_release", "j19_sync_service"],
         "Stored data with no steps: a Data Form (brd.md L129, L285). Tamper-evident claim (A3 L66). Target of Z1/Z3/Z4 and source of Z2 (open questions Q1, Q5)."),
]

# ---------------------------------------------------------------- lists
LIST_USED_BY = {
    "CIQ Yes No": ["CIQ Case Dept_<D>_Active (6)", "CIQ Open Point OP_To_Supplier", "CIQ Change Request Impact_<D> (5)", "Criteria applicability column", "other Yes/No flags kf-data-architect keeps as Selects"],
    "CIQ Confirm": ["CIQ Case <D>_Review_Confirm lane fields (6)"],
    "CIQ Department": ["CIQ Section lead department", "CIQ Audit Event actor department", "CIQ Internal Note author department"],
    "CIQ Review Dept": ["CIQ Open Point OP_Dept and raised-by department (routing)", "CIQ Section query owner"],
    "CIQ Decision": ["CIQ Case SAF/REG internal RMES decision", "CIQ Case Overall_Decision"],
    "CIQ OP Kind": ["CIQ Open Point kind"],
    "CIQ OP Progress": ["CIQ Open Point progress"],
    "CIQ OP Outcome": ["CIQ Open Point outcome", "Rounds outcome column"],
    "CIQ CR Outcome": ["CIQ Change Request outcome"],
    "CIQ Impact Resolution": ["CIQ Change Request <D>_Assessment (5)", "Criteria impact resolution column"],
    "CIQ Config Kind": ["CIQ Config Version kind"],
    "CIQ Config State": ["CIQ Config Version state"],
    "CIQ Release Stage": ["CIQ Config Version release stage (Release rows)"],
    "CIQ RMES Part": ["Criteria part column"],
    "CIQ RMES Result": ["Criteria result column"],
    "CIQ AI State": ["Criteria AI state column"],
    "CIQ Supplier Kind": ["CIQ Supplier kind"],
    "CIQ Contact Role": ["Contacts role column"],
    "CIQ Country Code": ["CIQ Supplier country code"],
    "CIQ Event Category": ["CIQ Audit Event category"],
    "CIQ Actor Side": ["CIQ Audit Event actor side"],
}
COUNTRY_CODES = ["AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT", "LV", "LT",
                 "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE", "GB", "TR", "CN", "US", "CA"]
lists = []
list_ids = {}
for vs in DOMAIN["value_sets"]:
    name = vs["name"]
    lid = name.replace(" ", "_")  # no _A00 suffix (A2 L35)
    items = list(vs["values"])
    src = f"domain.value_sets ({vs['evidence']})"
    if name == "CIQ Country Code":
        items = COUNTRY_CODES
        src = "PART D L1225 says 'ISO 3166 alpha-2 subset' without naming it. Seeded with the 32-code subset of runs/ciq-digital decision D7 (EU-27, GB, TR, CN, US, CA); append-only, so codes can be added. See decisions.md D8."
    lists.append({"id": lid, "name": name, "items": items, "item_source": src,
                  "used_by": LIST_USED_BY.get(name, []),
                  "populate": "create and populate in the same apply; values in use can't be removed (PART D L1203)"})
    list_ids[name] = lid
assert len(lists) == 21

# ---------------------------------------------------------------- steps
def S(id_, name, kind, actor, condition=None, **kw):
    d = {"id": id_, "name": name, "kind": kind, "actor": actor, "actor_role_id": ROLE_IDS.get(actor) if actor else None, "condition": condition}
    d.update(kw)
    return d

case_branches = []
for (code, label, rid, rname, pid) in DEPTS + [RMM]:
    case_branches.append({"name": f"Review {EN} {label}", "steps": [
        S(f"CASE_B_{code}", f"Review {EN} {label}", "UserTask", rname, f'Dept_{code}_Active = "Yes"',
          sla=True, writes=f"only its own {code}_* lane fields; no child tables (L209)",
          note=("Off by default (Dept_RMM_Active from Settings, L189)." if code == "RMM" else None))]})
case_steps = [
    S("CASE_S0", "Create case", "Start", "CIQ RMM", None, sla=False,
      note="Start (v4 L184). Initiator: CIQ RMM. The pinned Release row is copied in; the BASIC CIQ Section row is created only after the submit succeeds."),
    S("CASE_S1", "Waiting for supplier: basic data", "UserTask", "CIQ RMM", None, sla=True,
      note="X1 trigger step name (L344). Y1 approves (Q6 default) or RMM submits by hand. After the K-FA test the owner becomes the Owner_RMM field (L185)."),
    S("CASE_S2", "Scope check", "UserTask", "CIQ RMM", None, sla=True),
    S("CASE_S3", "Waiting for supplier: completeness PS-05", "UserTask", "CIQ RMM", None, sla=True,
      note="X4 trigger step name (L345). Y4 records the confirmation and RMES_Created_At, then approves."),
    {"id": "CASE_PAR", "name": f"Part 2 {EN} Beiersdorf review", "kind": "Parallel", "actor": None, "actor_role_id": None, "condition": None,
     "note": "One-level fork with six single-step branches and a native all-join before the next step (L188; capabilities replay.parallel). Arm name = step name, as in the zz-spike shape that compiled and published.",
     "branches": case_branches},
    S("CASE_S5", f"Open items check {EN} before release request", "UserTask", "CIQ RMM", 'Hold_For_Open_Items = "Yes"', sla=True,
      note="Runs only if something is open; a blank count also holds (L190; A2 L32-L34). Hold_For_Open_Items is a blank-safe Text formula over the PART A Number count fields (e.g. Open_Items_Count, Open_CR_Count); kf-data-architect owns the formula and its exact name."),
    S("CASE_S6", "Overall approval", "UserTask", "CIQ Overall Approver", 'Overall_Approval_Required = "Yes"', sla=True,
      note="Off by default; before the PS-11 request (L191; A3 L63)."),
    S("CASE_S7", "Waiting for supplier: final release PS-11", "UserTask", "CIQ RMM", 'Overall_Decision != "Rejected"', sla=True,
      note="X5 trigger step name (L346). Skipped if overall-rejected; a blank decision runs the step (PART D L789). Y5 approves, or RMM completes manually with a reason (L192)."),
    S("CASE_S8", f"Open items check {EN} before close", "UserTask", "CIQ RMM", 'Hold_For_Open_Items = "Yes"', sla=True,
      note="Catches work opened during step 7; normally skipped so completion stays automatic (L193)."),
    S("CASE_END", "End", "End", None, None, note="Z1 fires on completion (L194)."),
]

op_steps = [
    S("OPNT_S0", "Raise open point", "Start", "CIQ RMM", None, sla=False,
      note="Start (L244). Initiators: CIQ RMM and the five department Reviewer roles (L237). The Start actor isn't enforced by the platform (LESSONS 18)."),
    S("OPNT_S1", "Waiting for supplier", "UserTask", "CIQ RMM", 'OP_To_Supplier = "Yes"', sla=True,
      note="X3 trigger step name (L347). Internal kinds skip it. Y3 approves only while Awaiting_Response = \"Yes\". After the K-FA test the owner becomes Responsible_User (L245)."),
]
for (code, label, rid, rname, pid) in DEPTS + [RMM]:
    op_steps.append(S(f"OPNT_R_{code}", f"Review {EN} {label}", "UserTask", rname, f'OP_Dept = "{code}"', sla=True,
                      note="Sequential conditional steps, not a parallel block: exactly one runs (L246). Return sends the item back to 'Waiting for supplier' (native send-back, L246); Rounds is editable here only."))
op_steps.append(S("OPNT_END", "End", "End", None, None))

cr_branches = []
for (code, label, rid, rname, pid) in DEPTS:
    cr_branches.append({"name": f"Assess {EN} {label}", "steps": [
        S(f"CHRQ_B_{code}", f"Assess {EN} {label}", "UserTask", rname, f'Impact_{code} = "Yes"', sla=True,
          writes=f"only its own four {code}_* assessment fields (L271)")]})
cr_steps = [
    S("CHRQ_S0", "Receive change request", "Start", "CIQ Integration Service", None, sla=False,
      note="Start (L269). Created by Y6 as CIQ Integration Service; CIQ RMM creates it by hand as the fallback. Both are initiators."),
    S("CHRQ_S1", "Triage", "UserTask", "CIQ RMM", None, sla=True),
    {"id": "CHRQ_PAR", "name": "Assess impact", "kind": "Parallel", "actor": None, "actor_role_id": None, "condition": None,
     "note": "One-level fork with five single-step branches and a native all-join (L271). No RMM branch. All five branches are skipped on a refused request (every Impact flag 'No', L270): the all-skipped join must be proven at runtime (K-PAR).",
     "branches": cr_branches},
    S("CHRQ_END", "End", "End", None, None, note="X6 fires on completion (portal session, L272)."),
]

# ---------------------------------------------------------------- field prefix rules
COMMON_KEYS = "Case-scoped records carry the case's text keys Case_Item_Id (the case item _id), Case_Code and Cycle_No (PART D L722-L724, used where v4 is silent)."
field_prefix_by_flow = {
    fid("case"): {"prefix": None, "lane_prefix": "<D>_ for D in REG, SAF, QM, MIC, SUS, RMM",
                   "reserved_names": ["Case_Code", "Cycle_No", "Trade_Name", "Main_INCI", "BDF_Material_No", "Supplier_Code",
                                      "Owner_RMM", "Case_Contacts_JSON", "Portal_Contact_Ids", "Confirm_Contact_Ids", "Supplier_Contact_Emails",
                                      "Dept_REG_Active", "Dept_SAF_Active", "Dept_QM_Active", "Dept_MIC_Active", "Dept_SUS_Active", "Dept_RMM_Active",
                                      "RMES_Key", "RMES_Created_At", "Overall_Approval_Required", "Overall_Decision", "Hold_For_Open_Items"],
                   "rule": "v4 names first (L197-L206, L189, L191), then PART D L733-L782 where it agrees with v4. Material fields are plain Text on the case (no CIQ Raw Material, L132). Contacts are fields, never a child table (L330). Gate and hold counts are plain Number fields written by the acting person's Workbench (A2 L32-L33, e.g. Open_Items_Count, Open_CR_Count, <D>_Open_Count, <D>_RMES_Gaps) read by blank-safe formulas; no aggregates. The step-condition fields above are reserved."},
    fid("op"): {"prefix": "OP_ for routing and identity", "reserved_names": ["OP_Key", "OP_Kind", "OP_Dept", "OP_To_Supplier", "Awaiting_Response", "Round_No", "Responsible_User", "Portal_Contact_Ids", "Thread_Text"],
                "rule": "v4 L244-L251, then PART D L887-L912 where it agrees (one item per point, not per round). " + COMMON_KEYS + " Rounds columns use the Rounds_ prefix (A2 L31)."},
    fid("cr"): {"prefix": "CR_ for identity and outcome; Impact_<D> and <D>_ assessment fields for D in REG, SAF, QM, MIC, SUS",
                "reserved_names": ["CR_Key", "Impact_REG", "Impact_SAF", "Impact_QM", "Impact_MIC", "Impact_SUS"],
                "rule": "v4 L267-L272, then PART D L957-L966. " + COMMON_KEYS + " Y6 fills the case keys it has (Case_Code, Cycle_No); RMM sets Case_Item_Id at Triage."},
    fid("sup"): {"prefix": "Supplier_ for company fields", "reserved_names": ["Supplier_Code", "Contact_Portal_Ids_Text", "Pending_Invites"],
                 "rule": "v4 L278, then PART D L1109. Contacts columns use the Contacts_ prefix (A2 L31). Never 'Country': use Supplier_Country_Code."},
    fid("cfg"): {"prefix": "Config_ for version fields; Release_ for Release-row fields", "reserved_names": ["Release_Bundle_JSON"],
                 "rule": "v4 L279, then PART D L1140 and the Release fields of PART D P5 (L1043-L1048), which v4 folds into Release rows."},
    fid("sec"): {"prefix": "Section_ for section fields", "reserved_names": ["Definition_JSON", "Source_Answers_Rev"],
                 "rule": "v4 L280 and the X2 set 1:1 with the portal CIQP Section (PART C), then PART D L991-L1012. " + COMMON_KEYS + " Components columns use the Components_ prefix (A2 L31)."},
    fid("run"): {"prefix": "Run_ / Scope_", "reserved_names": [],
                 "rule": "v4 L281, then PART D L1067. " + COMMON_KEYS},
    fid("saf"): {"prefix": None, "reserved_names": ["RMES_Key", "Result_Case", "Editing_By", "Editing_Since"],
                 "rule": "v4 L282: one row per case keyed by the case's RMES_Key, a Reference to the case (Result_Case, PART D L1166), header counts (open criteria, open blocking findings), the lock. " + COMMON_KEYS + " Criteria columns use Criteria_, Findings columns use Findings_ (A2 L31)."},
    fid("reg"): {"prefix": None, "reserved_names": ["RMES_Key", "Result_Case", "Editing_By", "Editing_Since"],
                 "rule": "Same schema as CIQ RMES Safety (v4 L283)."},
    fid("note"): {"prefix": "Note_", "reserved_names": [],
                  "rule": "v4 L284, then PART D L1199 (Note_Key, Case_Code, Cycle_No, Linked_Kind, Linked_Key, Note_Text, Note_Author, Note_Dept, Note_At)."},
    fid("aud"): {"prefix": "Event_ / Actor_ / Object_", "reserved_names": [],
                 "rule": "v4 L285, then PART D L1092-L1097. Notification and delegation fields included (categories L285)."},
}
GLOBAL_FIELD_RULES = [
    "Never author Name; never name a field Status, Type, Country, Priority, Category, Currency or Project; owner-prefix generic words (A2 L41-L42).",
    "No aggregates of any kind (A2 L32). Gates and holds: plain Number count fields plus blank-safe formulas; a blank count holds and never deadlocks (A2 L33-L34).",
    "A child column never reuses a header field id: prefix it with its table's column_id_prefix, same label (A2 L31).",
    "A field an integration copies has the same type as its portal counterpart (Text, Number, Date, DateTime, Email), never a Select (PART D L733).",
    "Fields beyond v4 only where PART D gives field-level detail that agrees with v4, or where PART A requires them (Number count fields for gates).",
]

# ---------------------------------------------------------------- ER map
er_map = [
    {"id": "ER01", "kind": "reference", "native_reference": True,
     "from": fid("saf"), "from_name": fname("saf"), "to": fid("case"), "to_name": fname("case"),
     "ref_holder": fid("saf"), "via_field": "Result_Case (Reference); hard key RMES_Key = the case's RMES_Key",
     "cardinality": "N:1 (one live row per case by convention; duplicates voided)",
     "rationale": "v4 names this Reference: 'keyed by the case's RMES_Key, with a Reference to the case' (L282), and the case Reference feeds the gates and the dashboard (L428). Field name from PART D L1166.",
     "evidence": "brd.md L282; L331; L428"},
    {"id": "ER02", "kind": "reference", "native_reference": True,
     "from": fid("reg"), "from_name": fname("reg"), "to": fid("case"), "to_name": fname("case"),
     "ref_holder": fid("reg"), "via_field": "Result_Case (Reference); hard key RMES_Key",
     "cardinality": "N:1 (one live row per case by convention)",
     "rationale": "Same as ER01 for Regulatory (L283).", "evidence": "brd.md L283; L331; L428"},
]
n = 3
for (p, cid, cname, pref, ev, writer) in CHILD:
    er_map.append({"id": f"ER{n:02d}", "kind": "child_table", "native_reference": False,
                   "from": fid(p), "from_name": fname(p), "to": cid, "to_name": cname,
                   "ref_holder": fid(p), "cardinality": "1:N (embedded)" + (" — K2.1 row only" if cid == "Components" else ""),
                   "rationale": writer + " Passes the v4 child-table check (L105-L109, L323-L337).", "evidence": ev})
    n += 1

def TK(i, frm, to, via, card, why, ev, to_name=None):
    return {"id": f"TK{i:02d}", "kind": "text_key", "native_reference": False,
            "from": fid(frm), "from_name": fname(frm), "to": fid(to) if to in F else to,
            "to_name": to_name or (fname(to) if to in F else to), "ref_holder": fid(frm), "via_field": via,
            "cardinality": card, "rationale": why, "evidence": ev}

text_key_links = [
    TK(1, "case", "sup", "Supplier_Code (+ supplier name mirror)", "N:1",
       "v4 lists 'supplier code and name' as plain case fields that X1 reads (L184, L197). No Reference is named; the Workbench picks the supplier from CIQ Supplier and writes the code. kf-data-architect must NOT turn it into a Reference (D6).", "brd.md L184; L197; L291"),
    TK(2, "case", "cfg", "pinned release row id + hash + manifest copy", "N:1 (Release row)",
       "'Pinned release: row id, hash and manifest copy' (L198). A frozen copy, never a live link, so a pinned release can't change (L279).", "brd.md L184; L198; L279"),
    TK(3, "sec", "case", "Case_Item_Id, Case_Code, Cycle_No", "N:1",
       "Each section row is one portal section; X2 copies the keys 1:1 (L292). v4 names no Reference.", "brd.md L280; L292; PART D L991"),
    TK(4, "sec", "run", "Scope_Run_Key", "N:1", "The run that released the section (L280).", "brd.md L280; PART D L991"),
    TK(5, "sec", "cfg", "section definition key + Definition_JSON and hash copy", "N:1",
       "Definitions reach the section as copies (L280; PART D L1139).", "brd.md L280"),
    TK(6, "run", "case", "Case_Item_Id, Case_Code, Cycle_No", "N:1 (1-4 runs per case)", "v4 L334; PART D L1061.", "brd.md L281; L334"),
    TK(7, "run", "cfg", "rule-set version (+ pinned release row id)", "N:1", "Rule-set version recorded per run (L281).", "brd.md L281"),
    TK(8, "op", "case", "Case_Item_Id, Case_Code, Cycle_No", "N:1",
       "v4 names no Reference on the open point. PART D's Point_Case Reference existed only to feed native cross-flow aggregates, which PART A forbids (A2 L32). See D6.", "brd.md L120; L250; L32"),
    TK(9, "op", "sec", "reference tuple section key; new-section key for an additional part", "N:0..1",
       "The questionnaire reference (section, field, row, or document) and the additional part's new section (L244).", "brd.md L244; PART D L874-L878"),
    TK(10, "cr", "case", "Case_Code + Cycle_No (from Y6), Case_Item_Id (set at Triage)", "N:1",
       "v4 names no Reference. PART D's CR_Case was set only at triage because Y6 can't fill a Reference (PART D L947). See D6.", "brd.md L121; L270; PART D L947"),
    TK(11, "cr", "run", "Scope_Run_Key", "1:0..1", "A change notice writes a new scope run (L270).", "brd.md L270"),
    TK(12, "saf", "op", "Findings linked open point key (OP_Key)", "N:0..1",
       "'linked open point' on each finding (L282). Same for CIQ RMES Regulatory.", "brd.md L282"),
    TK(13, "note", "case", "Case_Code + Cycle_No; Linked_Kind + Linked_Key for the optional section / open point / finding link", "N:1",
       "v4 L284: case, optional link (section, open point, finding).", "brd.md L284; PART D L1197"),
    TK(14, "aud", "case", "Case_Code (or CONFIG), Case_Item_Id; Object_Kind + Object_Key + Object_Item_Id for the owning record", "N:1",
       "Events point to the record that owns the data, by key (L285; PART D L1081).", "brd.md L285"),
    TK(15, "case", "case", "same Case_Code, Cycle_No + 1", "1:0..1 (reactivation)",
       "A reactivation is a new case item with the same case code and the next cycle (journey j20; PART D L857).", "brd.md L197; L281"),
]
external_links = [
    {"id": "XL01", "app_flow": fid("case"), "portal_flows": ["CIQP Request", "CIQP Completeness Confirmation", "CIQP Final Release"], "integrations": ["X1", "X4", "X5", "Y1", "Y4", "Y5"], "authored_here": False, "evidence": "brd.md L119; L291-L298"},
    {"id": "XL02", "app_flow": fid("op"), "portal_flows": ["CIQP Query (one per round)"], "integrations": ["X3", "X3b", "Y3"], "authored_here": False, "evidence": "brd.md L120; L293; L297"},
    {"id": "XL03", "app_flow": fid("cr"), "portal_flows": ["CIQP Change Request (in)", "CIQP Notice (out)"], "integrations": ["Y6", "X6"], "authored_here": False, "evidence": "brd.md L121; L295; L299"},
    {"id": "XL04", "app_flow": fid("sec"), "portal_flows": ["CIQP Section"], "integrations": ["X2", "read of answers and uploads through flow sharing"], "authored_here": False, "evidence": "brd.md L124; L292; L300"},
    {"id": "XL05", "app_flow": fid("sup"), "portal_flows": ["Supplier_Code and contact portal user ids on every portal item"], "integrations": [], "authored_here": False, "evidence": "brd.md L122"},
]

# ---------------------------------------------------------------- journeys
def P(flow_key, action, step=None, role=None):
    d = {"flow": fid(flow_key), "flow_name": fname(flow_key), "action": action}
    if step: d["step"] = step
    if role: d["role"] = role
    return d
REVIEWERS = [d[3] for d in DEPTS]
journey_flow_map = [
    {"journey": "j01_create_case", "persona": "p_rmm", "roles": ["CIQ RMM"], "path": [
        P("sup", "read: pick the supplier; take Supplier_Code and the contacts' portal user ids"),
        P("cfg", "read: the current Release row (row id, hash, manifest copy)"),
        P("case", "initiate with material, supplier, contacts, owner, due dates, pinned release", "Create case", "CIQ RMM"),
        P("sec", "create the BASIC row only after the case submit succeeds (X2 to the portal)", None, "CIQ RMM"),
        P("aud", "create an item-created event")]},
    {"journey": "j02_basic_data", "persona": "p_rmm", "roles": ["CIQ RMM", "CIQ Integration Service"], "path": [
        P("case", "wait for basic data; Y1 records it and approves (Q6), or RMM submits by hand", "Waiting for supplier: basic data", "CIQ RMM")]},
    {"journey": "j03_scope_check", "persona": "p_rmm", "roles": ["CIQ RMM"], "path": [
        P("sec", "read the BASIC row (answers read through portal sharing)"),
        P("op", "optional: raise a Query on BASIC if incomplete", "Raise open point", "CIQ RMM"),
        P("run", "create the scope run (every section incl. N.A.)", None, "CIQ RMM"),
        P("sec", "create one row per Mandatory or Optional section (X2)", None, "CIQ RMM"),
        P("case", "set Dept_<D>_Active and RMES_Key; submit", "Scope check", "CIQ RMM")]},
    {"journey": "j04_completeness", "persona": "p_rmm", "roles": ["CIQ RMM", "CIQ Integration Service"], "path": [
        P("case", "wait for PS-05; Y4 records the confirmation and RMES_Created_At, then approves", "Waiting for supplier: completeness PS-05", "CIQ RMM")]},
    {"journey": "j05_department_review", "persona": "p_reg_reviewer", "roles": REVIEWERS + ["CIQ RMM"], "path": [
        P("sec", "read the sections the department leads"),
        P("op", "raise open points as needed", "Raise open point"),
        P("saf", "SAF only: fill the RMES sheet (j06)"), P("reg", "REG only: fill the RMES sheet (j06)"),
        P("aud", "create assignment / delegation / section-review-mark events"),
        P("case", f"write the department's count fields, sign off its own lane (SAF/REG also the RMES decision); submit", f"Review {EN} <Dept> (branch of Part 2 {EN} Beiersdorf review)", "the department's Reviewer role (CIQ RMM for the RMM branch)")]},
    {"journey": "j06_rmes_sheet", "persona": "p_saf_reviewer", "roles": ["CIQ Safety Reviewer", "CIQ Regulatory Reviewer"], "path": [
        P("case", "read RMES_Key"),
        P("saf", "Safety: create the case's single row (Reference to the case), take the lock, fill Criteria and Findings, lift header counts", None, "CIQ Safety Reviewer"),
        P("reg", "Regulatory: the same on its own Form", None, "CIQ Regulatory Reviewer"),
        P("case", "record the internal RMES decision on the own lane", f"Review {EN} Safety / Review {EN} Regulatory")]},
    {"journey": "j07_open_point_supplier", "persona": "p_reg_reviewer", "roles": REVIEWERS + ["CIQ RMM", "CIQ Integration Service"], "path": [
        P("op", "initiate with kind, owner department, to-supplier Yes, reference, question, justification, responsible person, due dates", "Raise open point", "a department Reviewer role or CIQ RMM"),
        P("sec", "additional part only: create its row (RMM or the sync service)"),
        P("run", "additional part only: record an additional-part run"),
        P("op", "X3 sends the current round; Y3 copies the answer and approves", "Waiting for supplier", "CIQ RMM"),
        P("op", "Accepted / Withdrawn ends the item; Return appends to Rounds and sends the item back", f"Review {EN} <owning Dept>", "the owning department's role"),
        P("op", "complete", "End")]},
    {"journey": "j08_internal_points", "persona": "p_rmm", "roles": ["CIQ RMM"] + REVIEWERS, "path": [
        P("op", "initiate an internal kind (OP_To_Supplier = No)", "Raise open point"),
        P("op", "skipped", "Waiting for supplier"),
        P("op", "review and close", f"Review {EN} <owning Dept>"),
        P("op", "complete", "End")]},
    {"journey": "j09_open_items_checks", "persona": "p_rmm", "roles": ["CIQ RMM"], "path": [
        P("op", "resolve leftover Department review / Contact update points"),
        P("aud", "override: create an audited event with the reason"),
        P("case", "act only when Hold_For_Open_Items = Yes", f"Open items check {EN} before release request / Open items check {EN} before close", "CIQ RMM")]},
    {"journey": "j10_overall_approval", "persona": "p_overall_approver", "roles": ["CIQ Overall Approver"], "path": [
        P("saf", "read"), P("reg", "read"),
        P("case", "approve only if every required RMES decision is Approved; or reject with a neutral closing text", "Overall approval", "CIQ Overall Approver")]},
    {"journey": "j11_final_release", "persona": "p_rmm", "roles": ["CIQ RMM", "CIQ Integration Service"], "path": [
        P("case", "X5 sends the single release request; Y5 approves, or RMM completes manually with a reason", "Waiting for supplier: final release PS-11", "CIQ RMM"),
        P("case", "only if something opened", f"Open items check {EN} before close", "CIQ RMM"),
        P("case", "complete; Z1 runs", "End"),
        P("aud", "Z1 creates the notification event")]},
    {"journey": "j12_cancel_case", "persona": "p_rmm", "roles": ["CIQ RMM", "CIQ Case Admin", "CIQ Integration Service"], "path": [
        P("aud", "create the Cancellation event; Z2 sends the neutral e-mail (Q5)", None, "CIQ RMM / CIQ Case Admin"),
        P("case", "native Reject at an RMM step; in Part 2 the Case Admin rejects through the admin route (flow Admin set after generate)", None, "CIQ RMM / CIQ Case Admin"),
        P("op", "end the case's open points (admin route)", None, "CIQ Case Admin"),
        P("cr", "end the case's open change requests (admin route)", None, "CIQ Case Admin"),
        P("aud", "the sync service snapshots and withdraws open portal items (close sweep)", None, "CIQ Integration Service")]},
    {"journey": "j13_change_request", "persona": "p_rmm", "roles": ["CIQ RMM", "CIQ Integration Service"] + REVIEWERS, "path": [
        P("cr", "created by Y6, or by RMM by hand", "Receive change request", "CIQ Integration Service / CIQ RMM"),
        P("aud", "after PS-11: create a change-attempt event"),
        P("run", "change notice: create a run (additions only)"),
        P("sec", "change notice: create rows for new sections"),
        P("op", "change notice: raise a Department-review point per new section's lead department"),
        P("cr", "set impact flags and the supplier-safe outcome; submit", "Triage", "CIQ RMM"),
        P("saf", "re-assessment if impacted"), P("reg", "re-assessment if impacted"),
        P("cr", "each impacted department writes its four fields", f"Assess {EN} <Dept> (branch of Assess impact)", "the department's Reviewer role"),
        P("cr", "complete; X6 sends the notice", "End")]},
    {"journey": "j14_supplier_master", "persona": "p_rmm", "roles": ["CIQ RMM"], "path": [
        P("sup", "create or edit the supplier and its Contacts rows (one at a time, re-read, merge)", None, "CIQ RMM")]},
    {"journey": "j15_configuration", "persona": "p_business_admin", "roles": ["CIQ Business Admin"], "path": [
        P("cfg", "create new version rows (copy-on-write) and a Release row with the full bundle and hash", None, "CIQ Business Admin"),
        P("aud", "create a configuration event per publish")]},
    {"journey": "j16_internal_chat", "persona": "p_rmm", "roles": ["CIQ RMM"] + REVIEWERS + ["CIQ Overall Approver", "CIQ Business Admin", "CIQ Reader", "CIQ Case Admin"], "path": [
        P("case", "read the case to discuss"),
        P("note", "post a message (case, optional link, text, author, department, time)")]},
    {"journey": "j17_audit_oversight", "persona": "p_reader", "roles": ["CIQ Reader", "CIQ RMM"], "path": [
        P("aud", "read events of a case or of configuration"), P("case", "read")]},
    {"journey": "j18_find_cases", "persona": "p_rmm", "roles": ["CIQ RMM"] + REVIEWERS + ["CIQ Reader"], "path": [
        P("sec", "search the K2.1 / BASIC mirrors and Components rows"), P("case", "open the matching cases")]},
    {"journey": "j19_sync_service", "persona": "p_integration_service", "roles": ["CIQ Integration Service"], "path": [
        P("case", "read (PDF render, sweep triggers); never acts on a step after Start"),
        P("sec", "create rows (X2 fallback) and rebuild Components", None, "CIQ Integration Service"),
        P("aud", "create audit, snapshot and notification events", None, "CIQ Integration Service")]},
    {"journey": "j20_reactivate_case", "persona": "p_rmm", "roles": ["CIQ RMM"], "path": [
        P("aud", "read the section snapshots of the cancelled cycle"),
        P("case", "initiate a new item with the same Case_Code and Cycle_No + 1", "Create case", "CIQ RMM"),
        P("run", "create a reactivation run"),
        P("sec", "create rows with the previous answers as prefill")]},
    {"journey": "j21_supplier_portal_side", "persona": "p_supplier", "roles": [], "in_app_scope": False,
     "path": [], "note": "Portal only (CIQ_Supplier_Portal_A00); returns to the app through Y1, Y3, Y4, Y5, Y6. No app flow, role or access."},
]

# ---------------------------------------------------------------- build order
build_order = [
    {"seq": 1, "layer": "lists", "artifacts": [l["name"] for l in lists],
     "rationale": "Selects need populated lists. Ids without _A00 (A2 L35). Create and populate in the same apply."},
    {"seq": 2, "layer": "roles", "artifacts": [r["name"] for r in roles if r["kind"] == "custom"],
     "rationale": "Steps and grants reference them. Reuse Admin and User; never recreate them."},
    {"seq": 3, "layer": "flow shells (engine PASS 1)", "artifacts": [f["name"] for f in flows],
     "rationale": "The engine creates every shell before any body, so ER01/ER02 never dangle by id."},
    {"seq": 4, "layer": "masters (Forms, no outgoing Reference)", "artifacts": ["CIQ Supplier (+ Contacts)", "CIQ Config Version"],
     "depends_on": ["lists"], "rationale": "Text-key targets of the case; nothing they hold depends on another flow."},
    {"seq": 5, "layer": "case process", "artifacts": [f"CIQ Case (Part 2 {EN} Beiersdorf review parallel block, hold/gate formulas over Number count fields)"],
     "depends_on": ["lists", "roles"], "rationale": "Referenced natively by both RMES Forms (ER01, ER02), so it comes before them. Must be complete at generate: a published Process can't be edited (LESSONS 1b)."},
    {"seq": 6, "layer": "other processes", "artifacts": ["CIQ Open Point (+ Rounds)", "CIQ Change Request (Assess impact parallel block)"],
     "depends_on": ["lists", "roles"], "rationale": "Only text keys to the case. Complete at generate."},
    {"seq": 7, "layer": "case-scoped Forms", "artifacts": ["CIQ Section (+ Components)", "CIQ Scope Run",
        "CIQ RMES Safety (+ Criteria, Findings; Reference to CIQ Case)", "CIQ RMES Regulatory (+ Criteria, Findings; Reference to CIQ Case)",
        "CIQ Internal Note", "CIQ Audit Event"],
     "depends_on": ["CIQ Case"], "rationale": "ER01/ER02 point at CIQ Case. CIQ Audit Event is the target of Z1, Z3 and Z4."},
    {"seq": 8, "layer": "permissions and grants", "artifacts": ["flow members and initiators", "per-step field permissions (child tables by table key only)"],
     "depends_on": ["all flows", "roles"], "rationale": "Keyed by role id. Finish with a re-grant pass for 423 locks (LESSONS 16)."},
    {"seq": 9, "layer": "intra-app automations", "artifacts": ["Z1", "Z2", "Z3", "Z4"],
     "depends_on": ["CIQ Case", "CIQ Open Point", "CIQ Audit Event"],
     "rationale": "Only Z1-Z4 (A2 L38). App Builder creates them incomplete; they are finished over REST. X/Y are documentation only."},
    {"seq": 10, "layer": "pages and nav", "artifacts": [],
     "rationale": "None. Generate with --no-pages: a page auto-grant turns readers into editors (A2 L57; brd.md L7)."},
    {"seq": 11, "layer": "after generate (REST / by hand, outside the IR)", "artifacts": [
        "Send-back and Reject switches per step (L412-L415)", "flow Admin for CIQ Case Admin (L416)", "SLA durations (L417)",
        "field-assigned owners after K-FA (L418)", "Editable-implies-InitiateItems resets (A2 L56)", "complete Z1-Z4 over REST; switch them on in the builder (L397-L399)"],
     "rationale": "App Builder can't express these (A2 L56; L411-L418). The portal session builds X1-X6 and Y1/Y3-Y6."},
]
flow_build_sequence = [{"seq": i + 1, "name": fname(k), "id": fid(k), "type": F[k][2]} for i, k in
                       enumerate(["sup", "cfg", "case", "op", "cr", "sec", "run", "saf", "reg", "note", "aud"])]

# ---------------------------------------------------------------- hard rules
hard_rules = [
    {"id": "HR01", "owner": "all", "rule": "Exactly 11 flows (Processes CIQ Case, CIQ Open Point, CIQ Change Request; Forms CIQ Supplier, CIQ Config Version, CIQ Section, CIQ Scope Run, CIQ RMES Safety, CIQ RMES Regulatory, CIQ Internal Note, CIQ Audit Event), 7 embedded child tables, 2 native References (ER01, ER02), 21 lists, 11 custom roles plus Admin and User reused. No portal (CIQP) flow, no 'CIQ ZZ Spike' flow, no CIQ Raw Material / Case Contact / Supplier Contact / Component / Config Release / per-round / Item Register flow. Every flow and list name starts with 'CIQ '.", "evidence": "brd.md L3, L8, L13, L113-L150; A2 L43; BR-003, BR-013, BR-024"},
    {"id": "HR02", "owner": "kf-workflow-designer", "rule": "Step ids, names, kinds, owners and conditions exactly as id_reservations.step_prefix_by_flow, byte-exact with the en-dash U+2013. First and last steps unconditioned. 'Part 2 – Beiersdorf review' is one Parallel step with six single-step branches; 'Assess impact' is one Parallel step with five. The six Open Point review steps are sequential conditional steps (exactly one runs), not a parallel block. No explicit Reject/Cancel steps (native reject and send-back, LESSONS 13). Every human step carries an SLA; durations are set by BDF after generate. No step is assigned to CIQ Integration Service after Start.", "evidence": "A2 L44-L58; brd.md L182-L272; BR-014, BR-017, BR-028"},
    {"id": "HR03", "owner": "kf-data-architect", "rule": "Field names per id_reservations.field_prefix_by_flow and global_field_rules. Native References only ER01 and ER02 (Result_Case on both RMES Forms); every other link is a Text key (text_key_links) and must NOT become a Reference. Child tables use the reserved child_table_ids and display names; columns use the column_id_prefix. Author the 21 lists with the reserved list ids (no _A00) and items. The reserved step-condition fields (Dept_<D>_Active, OP_To_Supplier, OP_Dept, Impact_<D>, Overall_Approval_Required, Overall_Decision, Hold_For_Open_Items) must exist with values that match the conditions.", "evidence": "A2 L29-L42; brd.md L189-L192, L245-L246, L271"},
    {"id": "HR04", "owner": "kf-security-designer", "rule": "Initiators: CIQ Case = CIQ RMM; CIQ Open Point = CIQ RMM and the five Reviewer roles; CIQ Change Request = CIQ Integration Service and CIQ RMM. Name the trade-off that Editable on a Process grants InitiateItems (A2 L56; LESSONS 18). CIQ RMES Safety editable by CIQ Safety Reviewer only, CIQ RMES Regulatory by CIQ Regulatory Reviewer only. Child-table step permissions by table key only. Flow Admin for CIQ Case Admin and no-Delete members are post-generate items. Every role in journey_flow_map must be able to read each flow on its path.", "evidence": "A2 L30, L55-L56; brd.md L237, L269, L278-L285; open questions Q3, Q4, Q7"},
    {"id": "HR05", "owner": "kf-experience-designer", "rule": "pages = [], no nav, no cards, no custom UI. The generate passes --no-pages.", "evidence": "brd.md L7; A2 L57"},
    {"id": "HR06", "owner": "kf-integration-analyst", "rule": "automations: Z1 (CIQ Case completed → PDF, e-mails, notification event in CIQ Audit Event), Z2 (Cancellation event in CIQ Audit Event → neutral e-mail, Q5), Z3 (CIQ Case SLA breach → CIQ Audit Event), Z4 (CIQ Open Point SLA breach → CIQ Audit Event). X1-X6 and Y1/Y3-Y6 are documentation only; never point an automation at a CIQP flow. A Form-source automation omits source.on.", "evidence": "A2 L36-L39; brd.md L289-L301; open questions Q1, Q5"},
]

coverage = {
    "entities_mapped": "11/11 (P1-P3, F1-F8)",
    "child_tables_mapped": "7/7",
    "journeys_with_path": "20/20 in scope; j21 is portal-side and out of scope",
    "roles": "13 (11 custom + Admin, User); every custom role serves at least one journey; Admin and User serve none by design (A3)",
    "personas_to_roles": "11 internal/system personas → 11 custom roles 1:1; p_supplier → no app role",
    "orphan_masters": "none: CIQ Supplier is the case's supplier (TK01); CIQ Config Version is pinned by the case and feeds sections and runs (TK02, TK05, TK07)",
    "lists": "21/21 domain value sets",
    "step_names": "every PART A step name reserved once per flow, byte-exact",
}

architecture = {
    "app_name": "CIQ Digital",
    "app_id": "CIQ_Digital_A00",
    "description": "Internal Beiersdorf backend for the Cosmetic Ingredient Questionnaire (CIQ): cases from creation to the final PDF with a parallel department review, open points, change requests, suppliers, versioned configuration, released sections, scope runs, RMES sheets, internal notes and a tamper-evident audit trail. Suppliers work only in the separate portal.",
    "source": {"domain_revision": 2, "brd": f"{RUN}/brd.md", "run": "ciq-digital-v4",
               "precedence": "PART A > PART B (v4) > PART C > PART D (field-level only, where it agrees with v4)",
               "open_questions": f"{RUN}/open-questions.md Q1-Q7: defaults accepted; none adds a flow, role or step",
               "decisions": f"{RUN}/decisions.md D5-D9 (stage 2, kf-architect)"},
    "mechanism_selection": {"case_board_flows": 0, "dataset_flows": 0,
        "note": "No Case/Board or Dataset flows. All three Processes need role-assigned steps, step conditions, parallel blocks and per-step field permissions; the process mechanism supports all of them, and the case mechanism supports none (capabilities workflow.mechanisms.case: false). Every other entity only stores data: a Data Form (A1 L22-L23)."},
    "roles": roles,
    "flows": flows,
    "lists": lists,
    "id_reservations": {
        "note": "Flow ids are the name-derived ids we expect (name with underscores + _A00); the platform assigns the real ids, read back after generate. List ids carry NO _A00 suffix so display names stay clean (A2 L35). Role ids are stable IR slugs; live role _ids are read back. Step ids are prefixed per flow (CASE_, OPNT_, CHRQ_) so they can't collide with field ids such as OP_Key or CR_Key.",
        "app_id": "CIQ_Digital_A00",
        "role_ids": ROLE_IDS,
        "flow_ids": {fname(k): fid(k) for k in F},
        "list_ids": list_ids,
        "child_table_ids": {f"{fname(p)} / {cname}": {"parent": fid(p), "id": cid, "name": cname, "column_id_prefix": pref}
                            for (p, cid, cname, pref, ev, w) in CHILD},
        "field_prefix_by_flow": field_prefix_by_flow,
        "global_field_rules": GLOBAL_FIELD_RULES,
        "step_prefix_by_flow": {
            fid("case"): {"prefix": "CASE_", "frozen_by": "A2 L44-L49; brd.md L182-L194", "steps": case_steps},
            fid("op"): {"prefix": "OPNT_", "frozen_by": "A2 L53; brd.md L242-L247", "steps": op_steps},
            fid("cr"): {"prefix": "CHRQ_", "frozen_by": "A2 L54; brd.md L267-L272", "steps": cr_steps},
        },
        "page_prefix_by_role": {},
        "page_rule": "pages = [] and no nav (brd.md L7; A2 L57). Generate with --no-pages.",
    },
    "er_map": er_map,
    "text_key_links": text_key_links,
    "external_links": external_links,
    "journey_flow_map": journey_flow_map,
    "build_order": build_order,
    "flow_build_sequence": flow_build_sequence,
    "deferred_grafts": [],
    "deferred_grafts_note": "None. PART A forbids aggregates (A2 L32), so the gates and holds are plain Number count fields and formulas that compile at generate. A native cross-flow count would come back only as a REST graft after a builder-made aggregate is proven (L404, L407).",
    "pages": [],
    "hard_rules": hard_rules,
    "risks": [
        {"id": "AR01", "owner": "kf-workflow-designer / kf-verifier", "risk": "A parallel block whose branches are all skipped: 'Assess impact' on every refused change request (all Impact flags 'No', L270), and Part 2 if no department is active. Runtime fork/join is still being tested (A2 L28, K-PAR). If an all-skipped join doesn't advance, the item hangs.", "evidence": "brd.md L28, L188, L270-L271"},
        {"id": "AR02", "owner": "kf-workflow-designer", "risk": "Return on CIQ Open Point is a native send-back from a review step to 'Waiting for supplier'; whether a send-back re-fires X3 is K-09h (fallback X3b on ItemSentBack). Send-back must be on only at the review steps (L414).", "evidence": "brd.md L246, L381, L414"},
    ],
    "coverage": coverage,
}

json.dump(architecture, open(os.path.join(HERE, "architecture.json"), "w"), ensure_ascii=False, indent=1)
print("flows", len(flows), "roles", len(roles), "lists", len(lists), "er", len(er_map), "tk", len(text_key_links),
      "journeys", len(journey_flow_map))
