import json,sys
src,dst=sys.argv[1],sys.argv[2]
d=json.load(open(src)); wf=d['content']
items=wf['meta']['security_handoff']['items']
def item(step): return next(i for i in items if i['step']==step)
def add(step,field):
  it=item(step)
  if field not in it['Editable']: it['Editable'].append(field)
# COH-12
for s in ['OPNT_R_REG','OPNT_R_SAF','OPNT_R_QM','OPNT_R_MIC','OPNT_R_SUS','OPNT_R_RMM']:
  add(s,'Portal_Contact_Ids')
  item(s)['note']+=" D25 (COH-12): Portal_Contact_Ids Editable so the Workbench refreshes the supplier contacts before a Return re-fires X3 for round n+1 (v4 L250)."
# COH-06r
for s in ['CASE_S5','CASE_S8']:
  add(s,'Markets_Label')
  item(s)['note']+=" D25 (COH-06r): Markets_Label Editable with Target_Markets_Text, so an accepted market correction also updates the label."
# Q8 / R-02
s7=item('CASE_S7')
s7['note']=("PART D L814. D23/D25 (R-02, Q8): Open_Items_Count/Open_CR_Count Editable so the RMM Workbench refreshes them while the case waits here; "
  "the close check (CASE_S8) then sees fresh counts. Y5 keeps BRM automatic completion (REQ-PROC-045) and does NOT blank the counts. "
  "Contacts Editable (COH-05).")
step7=next(x for x in wf['processes']['CIQ_Case_A00']['steps'] if x['id']=='CASE_S7')
step7['note']=("X5 fires on entry (single release request). Blank Overall_Decision runs the step. Y5 approves (automatic completion, REQ-PROC-045), "
  "or RMM completes manually with a reason. Y5 does not clear the counts (D25, Q8): the RMM Workbench refreshes Open_Items_Count/Open_CR_Count while the case waits here, "
  "and the supplier portal refuses the release while the supplier's own queries or change requests are open (PART C hand-off). "
  "Residual risk: an item opened in the seconds before Y5 is caught only by the next Workbench session or sync.")
# stale revision text
m=wf['meta']
m['data_model_revision']=20
m['field_reconciliation']=("Every condition field, handoff cell and scenario input is checked against the data_model slice at graph revision 20 "
  "(kf-data-architect; field contract from revision 12, D22). Rounds columns: Rounds_Round_No, Rounds_Question_Text, Rounds_Response_Text, Rounds_Outcome.")
m['coherence_repairs']['rev19']={"decision":"D25","applied":["COH-12","COH-06r","R-02 / Q8 (BRM automatic completion kept; Workbench refresh at CASE_S7; portal release refusal)"],
  "note":"Security re-commits the per-step cells from security_handoff: Portal_Contact_Ids Editable at the six OPNT_R_* steps; Markets_Label Editable at CASE_S5 and CASE_S8.",
  "portal_handoff":"Supplier portal (CIQP Final Release): refuse the release while the supplier's own CIQP Queries or CIQP Change Requests on the case are open. Owner: portal session.",
  "residual_risk":"An open point or change request opened in the seconds before Y5 approves CASE_S7 is not in the counts; CASE_S8 is skipped and the item is caught only by the next Workbench session or sync."}
json.dump(wf,open(dst,'w'),indent=1,ensure_ascii=False)
