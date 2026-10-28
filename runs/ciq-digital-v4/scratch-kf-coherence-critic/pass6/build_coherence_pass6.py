"""Coherence pass 6 (graph rev 30): rebuild the coherence slice from the pass-5 payload.
Read-only over the slice files in this folder; writes coherence.json (slice content only)."""
import json, copy

D = '.'
cur = json.load(open(f'{D}/slice-coherence.json'))['content']
c = copy.deepcopy(cur)

c['stage'] = 'coherence gate, pass 6'
c['graph_revision_reviewed'] = 30
c['previous_pass'] = {
    'graph_revision_reviewed': 28,
    'committed_revision': 29,
    'commit_note': 'pass-5 payload committed at rev 29; rev 30 = automations only (D31: Z3/Z4 removed, Z1/Z2 kept as placeholder shells)',
    'verdict': 'PASS-WITH-ISSUES',
    'defects': 'none open',
    'risks': 'R-01..R-08',
}
c['source'] = ('graph rev 30: domain, architecture, data_model, workflow, security, experience byte-identical in content to rev 28 '
               '(slice content compared); automations rev 30 (D31: array of 2, Z1 and Z2 content unchanged, Z3/Z4 removed); '
               'decisions D30-D34; kissflow-build/ciq-digital/SPIKES.md "Night tests run by Claude" (L122-L169); '
               'docs/kissflow-data-model/app-plan-v4-processes-and-forms.md (authoritative; Z1/Z2 only at L229, hand-offs L270-L276); '
               'runs/ciq-digital-v4/PREVIEW.md; kissflow-build/ciq-digital/RESUME.md')

c['deterministic_evidence'] = {
    'gate': '0 errors, 3 warnings (AUTO_SELF Z2 expected; NO_PAGES intended per EXP-HR1; ROLE_ACCESS_COLLAPSE QM/MIC/SUS false positive, disjoint step ownership). Identical to pass 5.',
    'validate': '0 errors, 1 warning (AUTO_SELF)',
    'verify': '0 errors, 2 warnings (AUTO_SELF, NO_PAGES)',
    'build_no_pages': 'dry-run only, 224 artifacts (was 226), 0 errors, 2 warnings (ORPHAN_ENTITY Connector on Z1 and Z2, engine); folders form/integration/list/permission/process/role, no page/nav',
    'compiled_readback': 'diff -rq of the rev-28 and rev-30 compiled trees: the only differences are the 4 removed files integration/ciq_z3_case_sla_breach_audit_A00.{blob,shell}.json and integration/ciq_z4_open_point_sla_breach_audit_A00.{blob,shell}.json; every other blob (roles, lists, forms, processes, permissions, Z1, Z2) is byte-identical. Z1/Z2 blobs carry IsActive:true, but live generate creates integrations incomplete and not live (SPIKES L26, L41), consistent with D31.',
    'handoff_vs_cells': 'workflow and security unchanged since rev 28: 29 steps, 416 Mandatory/Editable cells, 0 mismatches (pass-5 RAT-8 result carries over).',
    'scenario_replay': '30/30 workflow journey scenarios replay at rev 30; output identical to pass 5 (sim.json).',
    'foundation': 'draft at rev 30; 5 open findings (was 8): 2 FOUNDATION_MAPPING_EXPRESSION on Z1 _id->Text (waived D21, accepted D30), 1 FOUNDATION_ACTION_UNSUPPORTED notify on Z2 (platform), 2 FOUNDATION_INITIATOR_CONTRACT_MISMATCH (D18, accepted D30). The 3 Z3/Z4 mapping findings left with Z3/Z4.',
    'slice_freshness': 'ir-graph-cli tasks at rev 30 lists only agenttask.coherence (stale, inputs experience + automations) and agenttask.seed (pending).',
    'z3_z4_references': 'No compiled artifact, no workflow condition, no security cell and no data_model field references Z3/Z4. Remaining references are free text only: domain.scope.in, domain.business_rules[9] (BR-010), domain.integrations[11] (authored_here:true); architecture.flows[10].rationale, build_order[6].rationale, build_order[8].artifacts[2..3] + rationale, build_order[10].artifacts[5], hard_rules[5] (HR06); workflow.meta.sla_note; automations[1].rest_completion[1]. See COH-14.',
    'artifacts': 'runs/ciq-digital-v4/scratch-kf-coherence-critic/pass6/ (slices, spec.json, sim.json) and runs/ciq-digital-v4/scratch-review/coherence-pass6/ (gate/validate/verify/build.txt, kf-build-out, verify-slice.json, tasks.txt)',
}

rs = c['repair_status']
rs['R-01'] = {'status': 'closed (runtime, spike shape)', 'evidence': 'SPIKES L132: Spike Case fork with NO branch flagged (PkEKO9rhUVOf) skips the parallel block cleanly, prepare -> hold check -> gated step -> Completed; L133 simultaneous branch submits join once. Same shape as refused CRs (all Impact_<D> = No) and Part 2 with no active department; re-confirm once on the generated flows in acceptance.'}
rs['R-02'] = {'status': 'accepted (Thomas, D30); residual narrowed', 'evidence': 'D30 confirms Q8/D27: Y5 automatic completion, counts refreshed by the RMM Workbench at PS-11, portal release refusal. Residual (internal points raised during CASE_S6/S7 without an RMM session before Y5) unchanged. With integrations deferred (D31) Y5 does not exist yet, so for the MVP RMM completes CASE_S7 by hand and the residual does not arise.'}
rs['R-06'] = {'status': 'reduced to 5 findings; waivers accepted by Thomas (D30)', 'evidence': 'foundation draft rev 30: 2 mapping (Z1), 1 notify (Z2), 2 initiator mismatch. Conductor accept-foundation still pending.'}
rs['COH-04'] = {'status': 'closed, confirmed (Thomas, D30)', 'evidence': rs['COH-04']['evidence']}
rs['COH-13'] = {'status': 'closed; hand-off queued in the authoritative plan', 'evidence': 'app-plan-v4 L270-L274 lists D27 (portal refuses final release while the supplier’s own queries/CRs are open) among the Thomas-confirmed hand-offs for the portal session; Q8 confirmed in D30.'}
rs['DOC-D29'] = {'status': 'closed', 'evidence': 'decisions.md D29 status now done (L437).'}

# ---------------- completeness matrix ----------------
upd = {
    'j02_basic_data': dict(risks=['R-03'], note='Integrations deferred (D31): Y1 does not exist yet, so RMM submits CASE_S1 by hand. Cells support it: Basic_Data_Received Mandatory and Portal_Request_Item_Id Editable at CASE_S1.'),
    'j03_scope_check': dict(risks=['R-09'], note='Several CIQ Section rows per case are created by one RMM user: the Workbench must create them one at a time (D32; SPIKES L157 per-user draft collision).'),
    'j04_completeness': dict(risks=['R-03'], note='Y4 deferred (D31): RMM submits CASE_S3 by hand; Completeness_* Editable and Completeness_At/RMES_Created_At Mandatory at CASE_S3.'),
    'j05_department_review': dict(risks=['R-07', 'R-09', 'R-10'], note='R-01 closed on the spike (SPIKES L129-L133). Open: K-19P lane-value retention (SPIKES L126 heads it PASS, but the key could not write lane fields (L140), so "both lane values kept" (L176) is unproven; same-item writes within ~0.1 s lose updates, L151) and real-user step writes (D33).'),
    'j06_rmes_sheet': dict(risks=['R-09'], note='Criteria/Findings child rows on a submitted Form row lose rows under simultaneous writers (SPIKES L155); Workbench write-then-verify (D32).'),
    'j07_open_point_supplier': dict(risks=['R-03', 'R-08', 'R-10'], defects=['COH-17'], note='Return = native send-back: 500 over the key in every form (SPIKES L146); real-user send-back [unverified] (D34). The business outcome "Withdrawn" is a submit with OP_Outcome = Withdrawn, not the native Withdraw action (COH-17).'),
    'j08_internal_points': dict(defects=['COH-17'], note='A point ended by native Withdraw or admin Reject keeps OP_Outcome blank, so Open_Num stays 1 (COH-17).'),
    'j09_open_items_checks': dict(risks=['R-02', 'R-10'], note='D23 and Q8 confirmed (D30). The Workbench must enforce Open_Items_Gate_Release/_Close before submitItem (D33: Mandatory not enforced for the key).'),
    'j10_overall_approval': dict(risks=['R-07'], note='K-PC passed on the spike: != "Rejected" runs the step on blank and Approved, skips on Rejected (SPIKES L134). Z1 after an overall rejection is a placeholder shell (D31).'),
    'j11_final_release': dict(risks=['R-03', 'R-11'], note='Y5 deferred (D31): RMM completes CASE_S7 by hand (Completion_Trigger Mandatory, "Manual by RMM: <reason>"). Z1 is a placeholder shell: Final_PDF, completion e-mails and the Notification row have no runtime writer until integrations are built (intentional, D31).'),
    'j12_cancel_case': dict(risks=['R-05', 'R-11'], defects=['COH-15', 'COH-17'], note='Native Reject verified on the spike (SPIKES L144: status Rejected, no completion event). The F8 Cancellation row is written by the session (v4 plan L144); Z2 is a placeholder shell (D31) and its trigger is specified two ways (COH-15). Native Withdraw is an uncovered second cancellation path (COH-17).'),
    'j13_change_request': dict(workflow_path='ok: refused CR skips all five arms; all-skipped join proven on the spike shape (R-01 closed)', risks=[], defects=['COH-17'], note='Y6 deferred (D31): RMM initiates CRs (RMM holds I on CIQ Change Request).'),
    'j16_internal_chat': dict(risks=['R-09'], note='Notes are created one at a time per user (D32).'),
    'j17_audit_oversight': dict(risks=['R-11'], note='Z3/Z4 SLA-breach audit rows moved to the later integrations list (D31); Reader still sees every F8 row the sessions write.'),
    'j19_sync_service': dict(status='deferred (integrations later, D31)', risks=['R-11', 'R-12'], note='IR permissions unchanged and sufficient for F3/F8 writes and CR initiation. D33: in-progress process writes need the admin route; ciq_integration_service holds only View on CIQ Case/Open Point (R-12).'),
}
for r in c['completeness_matrix']:
    u = upd.get(r['journey'])
    if not u:
        continue
    for k, v in u.items():
        r[k] = v
    if r['journey'] == 'j13_change_request':
        r['status'] = 'ok-with-defect (minor)'
        continue
    if r['defects'] and r['status'] == 'ok':
        r['status'] = 'ok-with-defect (minor)'
    elif r['defects'] and r['status'] == 'ok-with-risk':
        r['status'] = 'ok-with-risk, minor defect'
    elif r['risks'] and r['status'] == 'ok':
        r['status'] = 'ok-with-risk'

c['role_purpose']['note'] = c['role_purpose']['note'] + ' Unchanged at rev 30: Z3/Z4 removal touches no role, grant or step.'
c['orphans']['note'] = ('Final_PDF is ReadOnly at every step; its post-End writer is Z1 REST with the F8 Event_File fallback (COH-09r). '
                        'Since D31 Z1 is a placeholder shell, so Final_PDF and the "Final PDF" event category have no runtime writer until integrations are built; '
                        'intentional, not an orphan. "Notification" events keep session writers. Hold_For_Open_Items is a formula.')
c['orphans']['automations'] = 'none: Z1 (CIQ Case End) and Z2 (F8 Cancellation row) both have a live source in the IR; Z3/Z4 removed with no dangling compiled reference.'

c['gates_and_counts']['enforcement'] = ('D33/SPIKES L143: Mandatory was not enforced on submit for the key. The Mandatory gate formulas '
    '(Start_Gate, <D>_Gate, Open_Items_Gate_Release/_Close) are a native guarantee only in the native form [manual, K-20]; '
    'the Workbench must check them itself before submitItem (D33).')
c['gates_and_counts']['counts_rule'] = ('Counts are plain Numbers written by the acting Workbench. The IR does not say how the Workbench counts. '
    'Open_Num/CR_Open_Num read only OP_Outcome/CR_Outcome, so an item ended by native Withdraw or admin Reject still reads as open (COH-17).')

c['incoherences'] = [
    {
        'id': 'COH-14', 'severity': 'minor', 'kind': 'dangling reference (free text) after D31',
        'personas': ['p_reader (audit oversight)'], 'flows': ['CIQ_Audit_Event_A00', 'CIQ_Case_A00', 'CIQ_Open_Point_A00'],
        'where': 'domain.scope.in; domain.business_rules[9] BR-010; domain.integrations[11] (Z3/Z4, authored_here:true); architecture.flows[10].rationale, build_order[6].rationale, build_order[8].artifacts[2..3] + rationale, build_order[10].artifacts[5], hard_rules[5] HR06; workflow.meta.sla_note; automations[1].rest_completion[1]; outside the IR runs/ciq-digital-v4/PREVIEW.md L4, L6, L30-L33, L40 (226 artifacts, 4 integrations, "Finish Z1-Z4").',
        'issue': 'These still describe Z3/Z4 as modelled automations, but automations has only Z1/Z2 since rev 30. Not compiled; the build is unaffected.',
        'owner': 'kf-ba (domain), kf-architect (architecture), kf-workflow-designer (sla_note), kf-integration-analyst (Z2 text), conductor (PREVIEW.md)',
        'fix': 'Mark Z3/Z4 "deferred to the later integrations list (D31)" in one coordinated text pass, or accept as doc drift with D31 as the record. Refresh PREVIEW.md to 224 artifacts, 2 integration shells, no "Finish Z1-Z4".',
        'blocks_generate': False,
    },
    {
        'id': 'COH-15', 'severity': 'minor', 'kind': 'contract inconsistency (deferred integration)',
        'personas': ['p_rmm', 'p_case_admin'], 'flows': ['CIQ_Case_A00', 'CIQ_Audit_Event_A00'],
        'where': 'automations[1].source = CIQ_Audit_Event_A00 created + action.condition Event_Category = "Cancellation" (Q5) vs decisions.md D34 L476 "Z2 must trigger on ItemRejected / ItemWithdrawn".',
        'issue': 'Two different Z2 triggers are on record. The case-level ItemRejected/ItemWithdrawn trigger is not in the verified connector trigger list (app-plan-v4 L231-L244) [unverified]. The choice also decides whether the Workbench must keep writing the F8 Cancellation row (v4 L144).',
        'owner': 'kf-integration-analyst + conductor (D34 text)',
        'fix': 'Before integrations are built, pick one. Recommended: keep the F8-row trigger (verified Form ItemCreated). The Workbench writes the Cancellation row on every Reject or Withdraw. A case-level ItemRejected/ItemWithdrawn trigger is only a backstop if the connector offers it.',
        'blocks_generate': False,
    },
    {
        'id': 'COH-16', 'severity': 'minor', 'kind': 'decision text contradicts confirmed contract',
        'personas': ['p_rmm'], 'flows': ['CIQ_Case_A00', 'CIQ_Open_Point_A00'],
        'where': 'decisions.md D33 L467 "The sync service and integrations never act on human steps" vs automations[0].cross_container_contract Y1/Y3/Y4/Y5 ("then approve" CASE_S1, OPNT_S1, CASE_S3, CASE_S7), brd.md L782-L789 and D30 (Q8/D27 automatic completion, REQ-PROC-045).',
        'issue': 'Read literally, D33 removes Y5 automatic completion, which Thomas confirmed, and the Y1/Y3/Y4 auto-advance.',
        'owner': 'conductor (D33 wording)',
        'fix': 'Reword D33 as follows. The sync service never acts on human steps. The Y integrations may approve the RMM-owned waiting steps only through the connector action "Approve an item" (Q6). RMM’s manual submit is the fallback.',
        'blocks_generate': False,
    },
    {
        'id': 'COH-17', 'severity': 'minor', 'kind': 'uncovered terminal status (native Withdraw / admin Reject)',
        'personas': ['p_rmm', 'reviewers', 'p_case_admin'], 'flows': ['CIQ_Case_A00', 'CIQ_Open_Point_A00', 'CIQ_Change_Request_A00'],
        'where': 'SPIKES L145 (Withdraw works: status Withdrawn, no completion event) and L144 (Reject: no completion event); workflow.meta.after_generate_switches (send_back/reject only, no withdraw); workflow.meta.rejection_and_cancellation (Reject only); data_model CIQ_Open_Point_A00.fields[51] Open_Num = IF(OP_Outcome="Accepted",0,IF(OP_Outcome="Withdrawn",0,1)); CIQ_Change_Request_A00.fields[48] CR_Open_Num starts IF(ISBLANK(CR_Outcome),1,0).',
        'issue': '(a) The initiator (RMM on Cases/CRs; RMM and Reviewers on Open Points) can natively withdraw an item [verified for the key’s admin user; non-admin initiator unverified]. A withdrawn Case skips the F8 Cancellation row and the P2/P3 cascade (v4 L142-L148). (b) A point or CR ended by native Withdraw, or by the Case Admin’s admin Reject, keeps OP_Outcome/CR_Outcome blank, so Open_Num/CR_Open_Num stay 1. (c) The business outcome "Withdrawn" (submit with OP_Outcome = Withdrawn) shares its name with the native Withdraw action, which invites a Workbench to call the wrong one. Not a hard dead end: <D>_Open_Count and Open_Items_Count/Open_CR_Count are Editable at the steps that read them.',
        'owner': 'kf-workflow-designer (after-generate withdraw decision) + Workbench (count rule, action mapping)',
        'fix': 'Add withdraw to after_generate_switches: off where the platform allows [unverified]. Otherwise declare it a cancellation path. Workbench rules: business "Withdrawn" = submit with OP_Outcome = Withdrawn, never the native withdraw. Counts include only In-progress items, or Completed items with Open_Num/CR_Open_Num = 1. A Rejected/Withdrawn case triggers the F8 Cancellation row and the child cascade.',
        'blocks_generate': False,
    },
]

c['doc_drift'] = [
    {'where': 'architecture.lists CIQ_Event_Category', 'issue': "16 items, no 'Final PDF'; data_model and the compiled list have 17 (noted in D28). Build unaffected.", 'owner': 'kf-architect', 'status': 'open, non-blocking'},
    {'where': 'workflow CASE_S7 note; automations X5/Y5 release_refusal_rule; decisions D27', 'issue': "the residual wording is narrower than R-02 (internal points raised during CASE_S6/S7). Thomas accepted Q8 (D30); the wording is still narrow.", 'owner': 'kf-workflow-designer + kf-integration-analyst (text only)', 'status': 'open, non-blocking'},
    {'where': 'Z3/Z4 free-text references and PREVIEW.md', 'issue': 'see COH-14', 'owner': 'see COH-14', 'status': 'open, non-blocking'},
    {'where': 'decisions.md D29 status', 'issue': 'fixed (done)', 'owner': 'closed'},
    {'where': 'security.residual_risks RR-5; duplicate D17', 'issue': 'fixed at rev 26 / D29', 'owner': 'closed'},
]

risks = {r['id']: r for r in c['risks']}
risks['R-01'].update(status='closed (spike runtime, SPIKES L132-L133); re-confirm on generated flows')
risks['R-02'].update(status='accepted (Thomas, D30); with integrations deferred, CASE_S7 is completed by RMM by hand for now', owner='Workbench (refresh at CASE_S7); portal session (release refusal, queued in app-plan-v4 L273)')
risks['R-03'].update(risk="Y1/Y3/Y4/Y5 'Approve an item' unverified (Q6). Integrations are deferred (D31), so for the MVP the manual RMM submit IS the path: the Y-written fields are Editable/Mandatory for RMM at CASE_S1, CASE_S3, CASE_S7 and OPNT_S1 (security.field_permissions).", status='open (deferred)')
risks['R-06'].update(risk='Foundation draft rev 30 has 5 open findings: 2 mapping on Z1 (waived D21), 1 platform notify on Z2, 2 initiator mismatch (D18); D18/D21 accepted by Thomas (D30).', status='reduced; accept-foundation pending (conductor)')
risks['R-07'].update(risk='Runtime: K-PC and branch role routing PASS on the spike (SPIKES L129, L134). Still [unverified]: native refusal of a Mandatory gate formula left blank (K-20; the key bypasses Mandatory, SPIKES L143) and branch-scoped field writes by a real user (K-OFF).', status='partly closed')
risks['R-08'].update(risk='Return = native send-back. Over the key it fails with 500 in every form, even with IsSendbackEnabled=true (SPIKES L146). Real-user send-back (native form or SDK sendbackItem) is [unverified]: one click on Point PkEKOEvnYp7X settles it (D34). Round n+1 still relies on the Workbench writing Awaiting_Response = "Yes" and the new Query_Key at OPNT_R_* (see R-10).', status='open (runtime; needs Thomas)')
new_risks = [
    {'id': 'R-09', 'risk': 'No write locking (K-RACE, SPIKES L148-L157): simultaneous writes to one item lose updates (different fields, Form fields 5/10, child rows 5/5), a stale _doc_version is accepted, and simultaneous creates by one user collide on the per-user draft. Affects the parallel lanes on one CIQ Case (K-19P lane-value retention unproven: SPIKES L126 vs L140/L176), F5/F6 child rows, CIQ Supplier Contacts, CIQ Section Components, and per-user creates of F3/F7/F8 rows.', 'owner': 'Workbench and sync service (D32 write-then-verify, one write in flight, sequential creates); native My Tasks has no verify', 'status': 'mitigated by design (D32 proposed); K-19P open'},
    {'id': 'R-10', 'risk': 'Workbench step writes: the key is refused (050313) on every field at steps after Start, even Editable ones (SPIKES L140); a real-user SDK session is [unverified]. If the SDK is refused too, every Workbench step write (lane fields, counts, round n+1, contacts) must go through openForm. Prove one SDK update at a step as a real user before building the Workbench write layer.', 'owner': 'Workbench / acceptance', 'status': 'open (UI-phase prerequisite)'},
    {'id': 'R-11', 'risk': 'D31: Z1/Z2 are switched-off placeholder shells and Z3/Z4 are deferred. Final PDF, completion and cancellation e-mails, Notification rows and SLA-breach audit rows (REQ-CTL-010 in part, REQ-PROC-046 PDF) have no runtime writer until integrations are built. This is intentional (Thomas). Acceptance must not count them as built.', 'owner': 'conductor / acceptance', 'status': 'accepted deferral (D31)'},
    {'id': 'R-12', 'risk': "D33: the sync service writes in-progress or completed process items (for example K-15 Final_PDF) through the admin route. That route was verified only for the account admin; ciq_integration_service holds View only on CIQ Case and CIQ Open Point, and post_generate_grants has no flow Admin for it [unverified whether the route needs flow Admin].", 'owner': 'kf-security-designer, when the sync service is built', 'status': 'open (deferred with integrations)'},
]
c['risks'] = [risks[k] for k in ['R-01', 'R-02', 'R-03', 'R-04', 'R-05', 'R-06', 'R-07', 'R-08']] + new_risks

c['decision_pending_for_thomas'] = [
    'Resolved in D30: D23, Q8/D27, D18 + D21 waivers, generate approval (on condition K-PAR passes). K-PAR passed on the spike (SPIKES L126-L134), so the condition is met; the conductor records it.',
    'D32, D33, D34 are "proposed": accept or overrule. Reword D33 (COH-16) and reconcile the D34 Z2 trigger with automations Z2 (COH-15) before integrations.',
    'Real-user checks still open: one native send-back on Point PkEKOEvnYp7X (D34, R-08); one SDK field update at a step (R-10); K-19P two-tab lane saves (R-09); child-table columns visible/editable; K-20F builder aggregate.',
    'Native Withdraw (COH-17): switch it off after generate where possible, or treat it as cancellation in the Workbench.',
    'Q9 (non-blocking): Findings state values and the RMES limit comparator.',
]

c['ratchet'] = c['ratchet'] + [
    'RAT-9 cross-slice automation refs: warn when architecture.build_order[*].artifacts or domain.integrations[authored_here=true] names an automation plan_ref that automations[] no longer holds (would catch COH-14).',
    'RAT-10 terminal actions: warn when workflow.meta.after_generate_switches covers send_back/reject but not withdraw for a Process whose initiators are human roles (would catch COH-17).',
]

c['verdict'] = 'PASS-WITH-ISSUES'
c['verdict_note'] = ('Rev 30 changes only automations (D31): the compiled output equals rev 28 minus the 4 Z3/Z4 integration files; gate/validate/verify/build --no-pages 0 errors; '
    '30/30 scenarios replay identically; no compiled artifact, condition, grant or field references Z3/Z4. Every in-scope journey (j01-j20) stays end-to-end satisfiable '
    'in the app, and the RMM manual submit is the MVP path while integrations are deferred. Four new minor, non-blocking incoherences: COH-14 (stale Z3/Z4 free text '
    'and PREVIEW.md), COH-15 (two Z2 triggers on record), COH-16 (D33 wording vs Y approve and D30), COH-17 (native Withdraw and admin Reject not covered; counts). '
    'None blocks generate. For the UI phase: R-10 (real-user SDK step writes) and R-08 (real-user send-back) must be proven first, and D32/D33 rules belong in the Workbench write layer.')

json.dump(c, open(f'{D}/coherence.json', 'w'), indent=1, ensure_ascii=False)
print('written; incoherences', len(c['incoherences']), 'risks', len(c['risks']))
