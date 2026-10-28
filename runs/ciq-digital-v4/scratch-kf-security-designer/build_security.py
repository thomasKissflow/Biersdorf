import json, sys, os
RUN = "/Users/thomas/Documents/Kissflow Projects/POC/Beiersdorf/runs/ciq-digital-v4"
S = json.load(open(f"{RUN}/slices/security.json"))
WF = json.load(open(f"{RUN}/scratch-kf-workflow-designer/workflow.json"))
OUT = f"{RUN}/scratch-kf-security-designer/security.json"

forms = {f["id"]: f for f in S["forms"]}
child_by_parent = {}
for f in S["forms"]:
    if f.get("childOf"):
        child_by_parent.setdefault(f["childOf"], []).append(f["id"])

RMM="ciq_rmm"; REG="ciq_regulatory_reviewer"; SAF="ciq_safety_reviewer"; QM="ciq_qm_reviewer"
MIC="ciq_microbiology_reviewer"; SUS="ciq_sustainability_reviewer"; OA="ciq_overall_approver"
BA="ciq_business_admin"; RD="ciq_reader"; CA="ciq_case_admin"; SVC="ciq_integration_service"
REVIEWERS=[REG,SAF,QM,MIC,SUS]
ROLES=[RMM]+REVIEWERS+[OA,BA,RD,CA,SVC]

CASE="CIQ_Case_A00"; OP="CIQ_Open_Point_A00"; CR="CIQ_Change_Request_A00"
SUP="CIQ_Supplier_A00"; CFG="CIQ_Config_Version_A00"; SEC="CIQ_Section_A00"; SCR="CIQ_Scope_Run_A00"
RSAF="CIQ_RMES_Safety_A00"; RREG="CIQ_RMES_Regulatory_A00"; NOTE="CIQ_Internal_Note_A00"; AUD="CIQ_Audit_Event_A00"
PROCS=[CASE,OP,CR]; FORMS=[SUP,CFG,SEC,SCR,RSAF,RREG,NOTE,AUD]

# ---- process step lists (task steps only) from the workflow slice
def task_steps(flow):
    out=[]
    for st in S["workflow"]["processes"][flow]["steps"]:
        if "branches" in st:
            for b in st["branches"]:
                for s2 in b["steps"]: out.append(s2)
        elif st["id"].endswith("_END"): continue
        else: out.append(st)
    return out
STEPS={f: task_steps(f) for f in PROCS}

# ---- grant matrix (PART D 4 legend adapted to v4; v4 wins)
# Process cells: I (initiator), M (acts own steps), V (view), A (flow Admin -> View + REST)
PCELL = {
 CASE: {RMM:"I", **{r:"M" for r in REVIEWERS}, OA:"M", BA:"V", RD:"V", CA:"A", SVC:"V"},
 OP:   {RMM:"I", **{r:"I" for r in REVIEWERS}, OA:"V", BA:"V", RD:"V", CA:"A", SVC:"V"},
 CR:   {RMM:"I", **{r:"M" for r in REVIEWERS}, OA:"V", BA:"V", RD:"V", CA:"A", SVC:"I"},
}
# Form cells: E (Create,Edit,View), V (View), - (no grant)
FCELL = {
 SUP:  {RMM:"E", **{r:"V" for r in REVIEWERS}, OA:"V", BA:"V", RD:"V", CA:"V", SVC:"-"},
 CFG:  {RMM:"V", **{r:"V" for r in REVIEWERS}, OA:"V", BA:"E", RD:"V", CA:"V", SVC:"-"},
 SEC:  {RMM:"E", **{r:"V" for r in REVIEWERS}, OA:"V", BA:"V", RD:"V", CA:"V", SVC:"E"},
 SCR:  {RMM:"E", **{r:"E" for r in REVIEWERS}, OA:"V", BA:"V", RD:"V", CA:"V", SVC:"-"},
 RSAF: {RMM:"V", **{r:"V" for r in REVIEWERS}, OA:"V", BA:"V", RD:"V", CA:"V", SVC:"-"},
 RREG: {RMM:"V", **{r:"V" for r in REVIEWERS}, OA:"V", BA:"V", RD:"V", CA:"V", SVC:"-"},
 NOTE: {RMM:"E", **{r:"E" for r in REVIEWERS}, OA:"E", BA:"E", RD:"E", CA:"E", SVC:"-"},
 AUD:  {RMM:"E", **{r:"E" for r in REVIEWERS}, OA:"E", BA:"E", RD:"V", CA:"E", SVC:"E"},
}
FCELL[RSAF][SAF]="E"; FCELL[RREG][REG]="E"

TRACE = {
 CASE:"v4 L156-L160, L182-L194, L215; PART D grant table L1263 (Svc M1 -> View; A -> REST)",
 OP:"v4 L236-L240 (raise: any department Reviewer or RMM; review: owning department only); PART D L1264",
 CR:"v4 L261-L265, L269 (Y6 creates, RMM fallback; RMM triages; departments assess); PART D L1265",
 SUP:"v4 L278 (CIQ RMM writes; Business Admin is Viewer unless BDF says otherwise)",
 CFG:"v4 L279 (CIQ Business Admin writes, member without Delete K-17; no four-eyes A3 L65)",
 SEC:"v4 L280 (CIQ RMM and CIQ Integration Service only; Reviewers are Viewers)",
 SCR:"v4 L281 (the session that ran it: RMM, or a department for an extension)",
 RSAF:"v4 L282, L331; A3 L64; open question Q4 (Safety Reviewer only edits; Regulatory and everyone else read)",
 RREG:"v4 L283, L331; A3 L64; Q4 (Regulatory Reviewer only edits; everyone else reads)",
 NOTE:"v4 L284 (every internal role writes); Q7 (Reader may post)",
 AUD:"v4 L285 alternative + A3 L66 'tamper-evident'; Q3 default (people and service write, no Delete K-17; Reader reads)",
}

assignee = {f:{s["id"]:s.get("assignee_role") for s in STEPS[f]} for f in PROCS}
INIT_EXTRA = {OP:set([RMM]+REVIEWERS), CR:set([SVC,RMM]), CASE:set([RMM])}
first_step = {f: STEPS[f][0]["id"] for f in PROCS}

roles = {}
for r in ROLES:
    fl = {}
    for f in PROCS:
        c = PCELL[f][r]
        steps = {}
        for s in STEPS[f]:
            sid = s["id"]
            act = assignee[f][sid] == r or (sid == first_step[f] and r in INIT_EXTRA[f])
            steps[sid] = "Act" if act else "View"
        init = r in INIT_EXTRA[f]
        acts = any(v=="Act" for v in steps.values())
        cap = ",".join(x for x in [("Initiate" if init else None), ("Act" if acts else None), "View"] if x)
        e = {"scope":"all","role_capability":cap,"initiator":init,"steps":steps,"plan_cell":c,
             "engine_level":"Editable (Member [\"InitiateItems\"])" if (init or acts) else "ReadOnly",
             "trace":TRACE[f]}
        if c=="A": e["post_generate"]="flow Admin over REST (A2 L56; v4 L416)"
        if c=="M": e["post_generate"]="reset to Member without InitiateItems over REST (A2 L56); engine emits Editable for a step-owning role"
        fl[f]=e
    for f in FORMS:
        c = FCELL[f][r]
        if c=="-": continue
        fl[f]={"scope":"all","role_capability":"Create,Edit,View" if c=="E" else "View","plan_cell":c,
               "engine_level":"Editable" if c=="E" else "ReadOnly","trace":TRACE[f]}
    roles[r]={"flows":fl}
roles["admin"]={"flows":{}, "note":"Platform default (A3 L67); no business grant authored."}
roles["user"]={"flows":{}, "note":"Platform default (A3 L67); no business grant authored."}

# ---- field permissions from workflow handoff
fp = {}
errors=[]
items = WF["meta"]["security_handoff"]["items"]
for it in items:
    f, sid = it["flow"], it["step"]
    header = [x["id"] for x in forms[f]["fields"]]
    tables = child_by_parent.get(f, [])
    allkeys = header + tables
    cell = {k:"ReadOnly" for k in allkeys}
    for lvl in ("Editable","Mandatory"):
        for k in it.get(lvl,[]):
            if k not in allkeys: errors.append(f"{f}/{sid}: unknown key {k}")
            cell[k]=lvl
    for k in it.get("ReadOnly_explicit",[]):
        if k not in allkeys: errors.append(f"{f}/{sid}: unknown key {k}")
        cell[k]="ReadOnly"
    fp.setdefault(f,{})[sid]=cell
for f in PROCS:
    for s in STEPS[f]:
        if s["id"] not in fp.get(f,{}): errors.append(f"missing field_permissions for {f}/{s['id']}")
if errors:
    print("\n".join(errors)); sys.exit(1)

# ---- satisfiability (derived from executable grants)
sat = {"initiators":{}, "readers":{}, "step_actors":{}, "creators":{}, "editors":{}}
for f in PROCS:
    sat["initiators"][f]=[r for r in ROLES if roles[r]["flows"][f]["initiator"]]
    sat["readers"][f]=[r for r in ROLES if f in roles[r]["flows"]]
    for s in STEPS[f]:
        sat["step_actors"][f"{f}/{s['id']}"]=[r for r in ROLES if roles[r]["flows"][f]["steps"][s["id"]]=="Act"]
for f in FORMS:
    sat["creators"][f]=[r for r in ROLES if roles[r]["flows"].get(f,{}).get("plan_cell")=="E"]
    sat["readers"][f]=[r for r in ROLES if f in roles[r]["flows"]]
for k,v in list(sat["initiators"].items())+list(sat["creators"].items())+list(sat["readers"].items())+list(sat["step_actors"].items()):
    if not v: print("LOCKOUT", k); sys.exit(1)
del sat["editors"]
sat["note"]=("Derived from the executable grants above: initiator:true only on business-authorized creators; each first step (StartEvent) is Act "
             "for exactly the initiators; every other task step is Act for exactly its workflow assignee_role. No flow has zero creators or zero readers.")

data_scope = {"rule":("All internal roles read all records of every flow they are granted (scope 'all'); v4 defines no record-level isolation for Beiersdorf "
                      "roles. 'Own lane' on the case and 'own department' on open points are enforced by step ownership and branch-scoped field permissions, "
                      "not by a row filter. CIQ RMES Safety/Regulatory isolation is by write grant only (the other department reads, REQ-CFG-004). "
                      "Future views/dashboards (Workbench) must reuse this map."),
              "map":{r:{f:roles[r]["flows"][f]["scope"] for f in roles[r]["flows"]} for r in ROLES}}

post = []
for f in PROCS:
    post.append({"role":CA,"flow":f,"grant":"flow Admin","how":"REST member/batch (Admin), then GET member read-back","ref":"A2 L56; v4 L215, L416; workflow after_generate_switches"})
for f in PROCS:
    for r in ROLES:
        if PCELL[f][r]=="M":
            post.append({"role":r,"flow":f,"grant":"Process Member without InitiateItems (acts only on its own steps)",
                         "how":"REST member/batch reset (Permission [] or [View], whichever K-06 proves keeps My Tasks), then GET read-back",
                         "reason":"Editable on a Process also grants item creation (A2 L56); the engine emits Editable for a step-owning role"})
post.append({"role":"*","flow":"forms with E cells","grant":"Form Member WITHOUT Delete on CIQ Config Version, CIQ Audit Event (all writers) and, where K-17 allows, every other Form",
             "how":"REST member/batch per role after K-17 proves a member without Delete; GET read-back",
             "reason":"v4 L279, L285, L430-L431; the engine cannot express a no-Delete Form member"})
post.append({"role":SVC,"flow":"CIQ_Case_A00, CIQ_Open_Point_A00","grant":"upgrade View to Member only if K-09b shows the integration identity needs membership","how":"REST member/batch","reason":"PART D grant footnote 1"})

hard_rules = [
 {"id":"SEC-HR1","rule":"No pages (--no-pages). Any native page/card on a flow auto-grants its target roles as editors and would break every V cell, in particular CIQ RMES Safety/Regulatory isolation (REQ-CFG-004) and the read-only CIQ Reader.","evidence":"A2 L57; brd L7"},
 {"id":"SEC-HR2","rule":"CIQ Case Admin members must also hold CIQ RMM; Case Admin carries only flow Admin on the three Processes, View on Forms, and write on CIQ Internal Note and CIQ Audit Event.","evidence":"PART D L1242; v4 L215"},
 {"id":"SEC-HR3","rule":"The supplier has no app role and no grant; portal flows (CIQP *) are never granted here.","evidence":"brd L8; v4 L319"},
 {"id":"SEC-HR4","rule":"CIQ Integration Service never acts on a human step after Start; it initiates CIQ Change Request (Y6) only and writes CIQ Section and CIQ Audit Event rows.","evidence":"A2 L58; v4 L269, L280, L285"},
 {"id":"SEC-HR5","rule":"Child tables are keyed at TABLE level only in step permissions; every header field and child table is keyed explicitly at every task step (unlisted = ReadOnly).","evidence":"A2 L30; workflow security_handoff note"},
]
residual = [
 {"id":"RR-1","risk":"CIQ Audit Event is written by people (Q3 default), so the claim is 'tamper-evident', not immutable. Until K-17 proves a Form member without Delete, the engine's Editable Form grant may include Delete.","mitigation":"Post-generate REST reset to no-Delete; hash chain per A3 L66; the single-writer option (service only) stays available if BDF wants immutability."},
 {"id":"RR-2","risk":"Step-owning roles (5 Reviewers on CIQ Case and CIQ Change Request, CIQ Overall Approver on CIQ Case) come out of generate with InitiateItems and can raise items natively until the REST reset.","mitigation":"post_generate_grants; the Workbench hides '+ New' for them."},
 {"id":"RR-3","risk":"CIQ Open Point Start is Act for RMM and all five Reviewers (v4 L237); the engine assigns the start step's owner as ciq_rmm. Any Reviewer can raise for any department; the owning department is a field (OP_Dept), not a grant.","mitigation":"Workbench preselects OP_Dept from the raiser's role; review step ownership (OPNT_R_<D>) enforces 'only the owning department reviews' (REQ-PROC-034)."},
 {"id":"RR-4","risk":"Form grants are per Form (C4): every CIQ Scope Run / CIQ Internal Note writer can edit every row, including other departments' runs and other authors' notes.","mitigation":"Convention (v4 L284 'by convention') plus F8 audit events."},
 {"id":"RR-5","risk":"Step-level Mandatory on formula fields (Start_Gate, <D>_Gate, Open_Items_Gate) blocks submit while a count is blank; this is intended (A2 L34) but a native My Tasks user without the Workbench must write the counts by hand.","mitigation":"Counts are Editable at the same step (D10, D15)."},
]

sec = {"owner":"kf-security-designer","stage":"STAGE 2 wave 3",
       "source":"brd.md PART A (A2 L55-L58, A3 L64-L67), PART B v4 §1 L142-L150, §2-§3, §7 L411-L418; PART D §4 grant table L1243-L1279 (where v4 does not override); workflow.meta.security_handoff; open questions Q3, Q4, Q7",
       "legend":{"I":"Process Member [InitiateItems] -> initiator:true, Act on the start step",
                 "M":"acts only on its own steps; engine lowers to Editable (InitiateItems), reset over REST after generate",
                 "V":"Form Viewer / Process read-only",
                 "E":"Form Member (Create, Edit); no-Delete is a post-generate REST reset (K-17)",
                 "A":"flow Admin: authored View, Admin granted over REST after generate",
                 "-":"no grant",
                 "field_permissions":"field_permissions[flow][stepId][fieldId|childTableId] = Editable|ReadOnly|Hidden|Mandatory; every header field and child table keyed at every task step"},
       "roles":roles,"field_permissions":fp,"data_scope":data_scope,"hard_rules":hard_rules,
       "post_generate_grants":post,"satisfiability":sat,"residual_risks":residual}
json.dump(sec, open(OUT,"w"), indent=1, ensure_ascii=False)
# summary
print("roles", len(roles), "grants", sum(len(v["flows"]) for v in roles.values()))
print("fp steps", {f:len(v) for f,v in fp.items()}, "cells", sum(len(c) for v in fp.values() for c in v.values()))
print(json.dumps(sat["initiators"])); print(json.dumps(sat["creators"]))
