#!/usr/bin/env python3
"""Coherence repairs on the workflow slice (D15/COH-04, R-02, COH-05, COH-06, COH-07). Input: slice JSON (ir-graph-cli slice workflow). Output: content JSON."""
import json, sys
src, out = sys.argv[1], sys.argv[2]
c = json.load(open(src))["content"]
items = {(i["flow"], i["step"]): i for i in c["meta"]["security_handoff"]["items"]}
CASE, CHRQ = "CIQ_Case_A00", "CIQ_Change_Request_A00"
COUNTS = ["Open_Items_Count", "Open_CR_Count"]
CONTACTS = ["Case_Contacts_JSON", "Portal_Contact_Ids", "Confirm_Contact_Ids", "Supplier_Contact_Emails"]

def add(it, key, fields):
    lst = it.setdefault(key, [])
    other = it.get("Mandatory" if key == "Editable" else "Editable", [])
    for f in fields:
        if f not in lst and f not in other:
            lst.append(f)

def remove(it, fields):
    for k in ("Mandatory", "Editable"):
        it[k] = [f for f in it.get(k, []) if f not in fields]

# D15 / COH-04: counts not writable before the fork -> blank at the join -> CASE_S5 always runs once
for s in ("CASE_S2", "CASE_S3"):
    remove(items[(CASE, s)], COUNTS)
    items[(CASE, s)]["note"] += " D21 (COH-04): Open_Items_Count/Open_CR_Count ReadOnly here, so they are blank at the join and the release-request check always runs once."
# R-02: counts Editable at PS-11 (already present; asserted)
add(items[(CASE, "CASE_S7")], "Editable", COUNTS)
# COH-05: contacts Editable at both checks and the RMM-held waiting steps
for s in ("CASE_S1", "CASE_S3", "CASE_S5", "CASE_S7", "CASE_S8"):
    add(items[(CASE, s)], "Editable", CONTACTS)
# COH-06: target markets at both checks
for s in ("CASE_S5", "CASE_S8"):
    add(items[(CASE, s)], "Editable", ["Target_Markets_Text"])
items[(CASE, "CASE_S5")]["note"] += " D21: RMM resolves/confirms and writes fresh counts here (COH-04); contacts (COH-05) and Target_Markets_Text (COH-06) Editable."
items[(CASE, "CASE_S7")]["note"] += " D21: counts Editable so the Workbench refreshes them while waiting and the close check sees fresh counts (R-02); contacts Editable (COH-05)."
items[(CASE, "CASE_S8")]["note"] += " D21: contacts (COH-05) and Target_Markets_Text (COH-06) Editable."
# COH-07: X6 inputs Mandatory at Triage
tri = items[(CHRQ, "CHRQ_S1")]
x6 = ["Notice_Key", "Notice_Kind", "Notice_Title", "Supplier_Outcome_Text", "Case_Code", "Cycle_No", "Supplier_Code", "Portal_Contact_Ids"]
remove(tri, x6)
for f in x6: tri["Mandatory"].append(f)
tri["note"] += " D21 (COH-07): every X6 input the CR holds is Mandatory at Triage so a Y6 copy gap or hand-made CR is repaired before End (CR_Key stays a Start field)."

# step notes
for s in c["processes"][CASE]["steps"]:
    if s["id"] == "CASE_S5":
        s["note"] = "Blank-safe hold (formula owned by kf-data-architect). The counts are ReadOnly at Scope check and PS-05, so they are blank at the join and this check always runs once; RMM writes fresh counts here (D21, COH-04)."
    if s["id"] == "CASE_S7":
        s["note"] += " RMM holds the step, so the Workbench refreshes Open_Items_Count/Open_CR_Count while waiting (R-02)."

# scenarios
S5 = {"step": "CASE_S5", "role": "ciq_rmm", "input": {"Hold_Note": "Nothing left open", "Open_Items_Count": 0, "Open_CR_Count": 0}}
for sc in c["journey_scenarios"]:
    steps = sc["steps"]
    for st in steps:
        if st["step"] in ("CASE_S2", "CASE_S3"):
            for f in COUNTS: st["input"].pop(f, None)
        if st["step"] == "CHRQ_S1":
            s0 = next(x for x in steps if x["step"] == "CHRQ_S0")["input"]
            for f in ("Case_Code", "Cycle_No", "Supplier_Code"):
                st["input"].setdefault(f, s0[f])
            st["input"].setdefault("Notice_Kind", "Change request outcome")
    ids = [x["step"] for x in steps]
    if sc["flow"] == CASE and "CASE_S3" in ids and "CASE_S5" not in ids:
        nxt = [i for i, x in enumerate(steps) if x["step"] in ("CASE_S6", "CASE_S7", "CASE_S8")]
        if nxt:
            steps.insert(nxt[0], json.loads(json.dumps(S5)))
            sc["intent"] += " Counts are blank at the join, so the release-request check runs once and RMM writes 0 (D21)."
for sc in c["journey_scenarios"]:
    if sc["id"] == "case-two-lanes-no-holds-overall-off":
        sc["intent"] = "Only Regulatory and Safety active (QM, MIC, SUS, RMM branches skipped, join still completes); the release-request check runs once (counts blank at the join, D21) and RMM writes 0; the close check is skipped (0 at PS-11); overall approval off so it is skipped; PS-11 runs; End."

c["meta"].setdefault("coherence_repairs", {})["rev10"] = {
    "decision": "D21", "applied": ["COH-04 (D15 recommended option)", "R-02", "COH-05", "COH-06", "COH-07"],
    "note": "Security re-commits the per-step cells from security_handoff."}
json.dump(c, open(out, "w"), ensure_ascii=False, indent=2)
