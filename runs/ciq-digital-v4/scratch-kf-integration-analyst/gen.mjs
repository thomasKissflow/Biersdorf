// Generates the automations slice (array) for run ciq-digital-v4.
import fs from 'node:fs';
const out = process.argv[2];
const REST = 'App Builder creates the integration incomplete (no trigger, no action) and not live [SPIKES L26/L41]. Finish trigger, action and mappings over REST with the proven recipe (connections CnEKHrH5GzkY Dataform / CnEKHrHqXRKB Process), read it back, then Thomas switches it on in the Integration builder (REST on = 403).';
const caseAudit = (code, state) => ({
  Event_Category: "'Notification'",
  Action_Code: `'${code}'`,
  Actor_Side: "'System'",
  Case_Code: 'Case_Code',
  Cycle_No: 'Cycle_No',
  Case_Item_Id: '_id',
  Object_Kind: "'CIQ Case'",
  Object_Key: 'Case_Code',
  Object_Item_Id: '_id',
  Object_State: state,
});
const X = JSON.parse(fs.readFileSync(new URL('./cross-container.json', import.meta.url)));
const Z = [
  {
    id: 'ciq-z1-case-completed-notification-log',
    name: 'CIQ Z1 Case completed – PDF, e-mails, notification event',
    plan_ref: 'Z1',
    source: { flow: 'CIQ_Case_A00', on: 'CASE_END', on_name: 'End', event: 'completed', native_trigger: 'Kissflow Process · ItemCompleted' },
    action: {
      type: 'create',
      target_flow: 'CIQ_Audit_Event_A00',
      field_map: {
        ...caseAudit('Z1 case completed', "'Completed'"),
        Notify_Recipient: 'Supplier_Contact_Emails',
        Notify_Channel: "'E-mail'",
        New_Value_Text: 'Completion_Trigger',
        Event_Reason: 'Overall_Decision',
      },
    },
    channel: 'internal',
    rest_completion: [
      '1. PDF (Thomas option A, A3): webhook to the CIQ Sync Service renderer, which attaches Final_PDF to the completed case [unverified, K-15] and records the PDF hash in a CIQ Audit Event row. Option B fallback: native GeneratePDF from case fields.',
      '2. E-mail Owner_RMM (completion notice).',
      '3. E-mail Supplier_Contact_Emails with Supplier_Closing_Text (neutral closing text when Overall_Decision = Rejected, v4 L193).',
      '4. Create the CIQ Audit Event Notification row (the field_map above; the only action App Builder can express).',
    ],
    rest_completion_note: REST,
    cross_container_contract: X,
    rationale: 'v4 §2 P1 step 9 (L196 "End — Z1: PDF, e-mails to the RMM owner and the supplier contacts, notification log"), v4 §4 Z1 (L299), PART D L1305, PART A A2 L37-L38. Overall rejection also reaches End, so Z1 covers it (open-questions Q5).',
  },
  {
    id: 'ciq-z2-cancellation-neutral-email',
    name: 'CIQ Z2 Case cancelled – neutral e-mail',
    plan_ref: 'Z2',
    source: { flow: 'CIQ_Audit_Event_A00', event: 'created', native_trigger: 'Kissflow Dataform · ItemCreated (verified live, K-09f)' },
    action: {
      type: 'notify',
      target_flow: 'CIQ_Audit_Event_A00',
      condition: { lhs: 'Event_Category', op: '=', rhs: 'Cancellation' },
      field_map: { Notify_Recipient: 'Notify_Recipient' },
      message: 'Neutral literal text: the CIQ request for this material has been closed by Beiersdorf. No action is needed. (Final wording by BDF.)',
    },
    channel: 'internal',
    self_stitch_note: 'AUTO_SELF warning is expected: the e-mail reads Notify_Recipient from the triggering Cancellation row and writes no record, so there is no loop.',
    rest_completion: [
      'Trigger: Dataform ItemCreated on CIQ Audit Event; action condition Event_Category = "Cancellation".',
      'Action: e-mail Notify_Recipient with the neutral literal. No audit action here, so no loop with Z1/Z3/Z4 (PART D L1306).',
      'If the action condition (K-09g) fails, do not build it: the CIQ Sync Service sends the e-mail during the close sweep.',
    ],
    rest_completion_note: REST,
    rationale: 'PART A A2 L38 "Z2 (case rejected / cancellation → neutral e-mail)"; v4 L213-L218 cancellation writes an F8 Cancellation event; v4 §4 Z2 (L299); PART D L1306 triggers on that event; open-questions Q5 default.',
  },
  {
    id: 'ciq-z3-case-sla-breach-audit',
    name: 'CIQ Z3 Case SLA breached – audit event',
    plan_ref: 'Z3',
    source: { flow: 'CIQ_Case_A00', event: 'sla_breached', native_trigger: 'Kissflow Process · SlaBreached ("SLA breached at this step")', sla_steps: ['CASE_S1','CASE_S2','CASE_S3','CASE_B_REG','CASE_B_SAF','CASE_B_QM','CASE_B_MIC','CASE_B_SUS','CASE_B_RMM','CASE_S5','CASE_S6','CASE_S7','CASE_S8'] },
    action: {
      type: 'create',
      target_flow: 'CIQ_Audit_Event_A00',
      field_map: { ...caseAudit('Z3 SLA breached', "'SLA breached'"), Notify_Channel: "'Kissflow SLA'" },
    },
    channel: 'internal',
    rest_completion: [
      'Replace the trigger with Process SlaBreached at the breached step (one trigger per step if the connector needs a step; see sla_steps).',
      'Reminders and escalations themselves are native step SLAs, set by hand after generate (K-23); Z3 only logs the breach.',
    ],
    rest_completion_note: REST,
    engine_gap: 'sla_breached is not one of the engine events (created|submitted|approved|completed|updated); it compiles as a pass-through Trigger Event "sla_breached" with no connector resolution. The live skeleton is created incomplete anyway; the SlaBreached trigger is set over REST. If apply refuses the event, fall back to the closest engine event only as a placeholder and keep the integration off.',
    rationale: 'PART A A2 L38 "Z3/Z4 (SLA breach → audit event)"; PART D L1307 "CIQ Case SlaBreached → create Notification event"; v4 L308-L314 connector has "SLA breached at this step"; v4 L285 F8 logs notifications; open-questions Q1 default (target F8, category Notification).',
  },
  {
    id: 'ciq-z4-open-point-sla-breach-audit',
    name: 'CIQ Z4 Open Point SLA breached – audit event',
    plan_ref: 'Z4',
    source: { flow: 'CIQ_Open_Point_A00', event: 'sla_breached', native_trigger: 'Kissflow Process · SlaBreached ("SLA breached at this step")', sla_steps: ['OPNT_S1','OPNT_R_REG','OPNT_R_SAF','OPNT_R_QM','OPNT_R_MIC','OPNT_R_SUS','OPNT_R_RMM'] },
    action: {
      type: 'create',
      target_flow: 'CIQ_Audit_Event_A00',
      field_map: {
        Event_Category: "'Notification'",
        Action_Code: "'Z4 SLA breached'",
        Actor_Side: "'System'",
        Case_Code: 'Case_Code',
        Cycle_No: 'Cycle_No',
        Case_Item_Id: 'Case_Item_Id',
        Object_Kind: "'CIQ Open Point'",
        Object_Key: 'OP_Key',
        Object_Item_Id: '_id',
        Object_State: "'SLA breached'",
        Notify_Channel: "'Kissflow SLA'",
      },
    },
    channel: 'internal',
    rest_completion: [
      'Replace the trigger with Process SlaBreached at the breached step (see sla_steps).',
      'Reminders themselves are native step SLAs (K-23); Z4 only logs the breach.',
    ],
    rest_completion_note: REST,
    engine_gap: 'Same as Z3: sla_breached is a pass-through event; SlaBreached is set over REST.',
    rationale: 'PART A A2 L38; PART D L1307 "CIQ Open Point SlaBreached → create Notification event"; open-questions Q1 default.',
  },
];
fs.writeFileSync(out, JSON.stringify(Z, null, 2));
console.log('wrote', Z.length);
