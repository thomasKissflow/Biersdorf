#!/usr/bin/env python3
"""Reconcile hold fields with data_model (COH-10 split): per-check gate and override fields."""
import json, sys
src, out = sys.argv[1], sys.argv[2]
c = json.load(open(src))["content"]
REN = {"CASE_S5": {"Open_Items_Gate": "Open_Items_Gate_Release", "Hold_Override_Reason": "Hold_Override_Reason_Release"},
       "CASE_S8": {"Open_Items_Gate": "Open_Items_Gate_Close", "Hold_Override_Reason": "Hold_Override_Reason_Close"}}
for it in c["meta"]["security_handoff"]["items"]:
    m = REN.get(it["step"]) if it["flow"] == "CIQ_Case_A00" else None
    if m:
        for k in ("Mandatory", "Editable"):
            it[k] = [m.get(f, f) for f in it.get(k, [])]
        it["note"] += " Gate/override are per check (data_model COH-10 split)."
c["meta"]["coherence_repairs"]["rev10"]["field_reconciliation"] = "CASE_S5: Open_Items_Gate_Release (Mandatory), Hold_Override_Reason_Release; CASE_S8: Open_Items_Gate_Close (Mandatory), Hold_Override_Reason_Close."
json.dump(c, open(out, "w"), ensure_ascii=False, indent=2)
