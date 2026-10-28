// The hand-offs a screen starts (plan v6 §4.1): one webhook integration each. Types only: the app session implements the
// transport (handoff(code, payload)), reading the webhook URLs from the Settings row (SET:current Payload_JSON.webhooks).
// With no URL configured, the screen marks its audit row "pending hand-off".
// Rule (20 Oct, app + portal session): the webhook URLs ship in the bundle and take unauthenticated POSTs, so the screen
// sends ONLY app item ids (and the idempotencyKey the transport adds to every payload). The integration reads the target
// from Kissflow (e.g. the case's Portal_Request_Item_Id, the open point's Portal_Query_Item_Id) and the values from the
// items themselves, so a forged id can only pass on what Kissflow already holds for that item. Two payloads still carry
// what the screen computed: history.updated (the supplier-visible thread) and case.cancelled (its fixed labels).

/** Every code; also the Action_Code of the screen's CIQ Audit Event row for the same action, except case.started (its
 *  status is on the case.created row) and history.updated (on the row of the open-point change it follows). */
export type HandoffCode = keyof HandoffPayloads;

export interface HandoffPayloads {
  /** The RMM's case Start submit succeeded (the portal session's I-1): the integration reads the case and creates its
   *  portal request, then admin-PUTs Portal_Request_Item_Id on the case. */
  "case.started": { caseItemId: string };
  /** A round of an open point to the supplier: round 1 at the raise, round N on a return or a question edited after an
   *  answer (I-3). The integration reads the round (Round_No, Query_Key, question, due date, …) and the case's portal
   *  request from the point, creates and submits the CIQP Query round, then admin-PUTs Portal_Query_Item_Id on the point. */
  "op.round": { opItemId: string };
  /** The raiser edited an open question (B-17): the integration reads the point and admin-PUTs the question, due date and
   *  edit note on its open CIQP Query (Portal_Query_Item_Id; refused when the point has none). */
  "op.edited": { opItemId: string };
  /** The point was closed or withdrawn while its query was open: the integration withdraws the CIQP Query it started
   *  (refused unless the point's OP_Outcome is set and it has a Portal_Query_Item_Id). */
  "op.closed": { opItemId: string };
  /** The last review completed (B-24): I-5. The integration sets Release_Flag "Requested", locks the request
   *  (Request_Locked Yes, label "Awaiting your final release"), sets Release_Contacts from the case and moves the
   *  request to the release step. */
  "release.requested": { caseItemId: string };
  /** A review was reopened while the release was requested (B-25): I-6. The integration writes Release_Flag
   *  "Reopened", Request_Locked "No" and Case_Phase_Label "With Beiersdorf", then moves the release step on. */
  "review.reopened": { caseItemId: string };
  /** Cancel (B-31): admin PUT Case_Phase_Label and Request_Locked on the case's portal request. */
  "case.cancelled": { caseItemId: string; phaseLabel: string; locked: "Yes" | "No" };
  /** After any open-point change: the case's supplier-visible thread (questionsHistory.ts) onto its portal request. */
  "history.updated": { caseItemId: string; questionsHistoryJson: string };
  // Not sent by the app yet, so still in their earlier shape:
  /** The app screen recorded the supplier's change report(s) (B-36): the receipts onto the portal request. */
  "change.received": { portalRequestItemId: string; changeReportsJson: string };
  /** Reactivate (B-32): admin PUT Case_Phase_Label and Request_Locked on the portal request. */
  "case.reactivated": { portalRequestItemId: string; phaseLabel: string; locked: "Yes" | "No" };
  /** A department added a section (B-29): Manual_Scope_JSON onto the portal request. */
  "scope.extended": { portalRequestItemId: string; manualScopeJson: string };
  /** A supplier contact changed (B-26): the contact fields and both assignee lists onto the portal request. */
  "case.contacts": { portalRequestItemId: string; caseContactsJson: string; bdfSetJson: string; assignees: string; releaseAssignees: string };
}

/** Sent by the SUPPLIER's screen (portal) after each successful save, upload, removal or change report. The
 *  integration admin-GETs that request and copies its supplier-data fields to the case named by its own
 *  App_Case_Item_Id (ReadOnly to suppliers), so a forged id can only re-sync the right data to the right case. */
export interface PortalHandoffPayloads {
  "request.changed": { portalRequestItemId: string };
}

/** The supplier-data fields request.changed (and I-2) copy from the portal request to the CIQ Case, same names. */
export const SYNCED_REQUEST_FIELDS = [
  "Config_Answers_JSON",
  "Answers_JSON",
  "Answered_By_JSON",
  "Justifications_JSON",
  "Components_JSON",
  "Scope_JSON",
  "Requested_Docs_JSON",
  "Documents_JSON",
  "Answers_Rev",
  "Answers_Changed_At",
  "Answers_Changed_By_Email",
  "Change_Report_Text",
  "Change_Report_Rev",
  "Change_Report_By_Email",
  "Change_Report_At",
] as const;
