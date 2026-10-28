// CIQ Audit Event rows (plan v5 §4.12). The service is the only writer. The texts are the prototype's own audit entries
// (core.ts audit, actions.ts); this module only maps them onto the Kissflow columns and adds the actor from Kissflow:
// a Service Request's platform `_created_by`, a portal user, or "System".
// Actor_Dept is the department the BDF actor acted in: the request's projection (`project`, the same map the world was
// built with: user id → department, applied only when the person is a member of that department's role), else the
// person's primary department. One Kissflow user in several roles (dev) is thus audited per department.

const CATEGORY_RULES = [
  [/^Change attempt refused|^Refused/, "Change attempt"],
  [/^Created case|^Follow-up case|^Created despite/, "Case"],
  [/^Cancelled case|^Reactivated case/, "Cancellation"],
  [/^Derived scope|^Scope follows|^Extended scope|^Changed metadata answer|^Scope changed/, "Scope"],
  [/RMES|finding|decision/i, "RMES"],
  [/review|^Activated reviews|^Flagged for RMM|^All reviews completed|^Continue after rejection/i, "Review"],
  [/open point|query|^Requested document|^Activated additional section|^Answered|^Justified non-delivery|^Accepted answer|^Returned answer|^Closed as not accepted|^Closed open point/i, "Open point"],
  [/^Generated final document|^Final PDF|^Final document/, "Final PDF"],
  [/^Gave final release|^Confirmed completeness|^Final-release request withdrawn|^Case completed/, "Case"],
  [/^Reported a change/, "Change request"],
  [/^Added internal note/, "Internal note"],
  [/^Invited supplier contacts/, "Notification"],
  [/^Updated contact|^Replaced supplier contact|^Removed supplier contact/, "Supplier master"],
  [/^Uploaded document|^Changed .* after completeness|answer/i, "Section"],
];

export function categoryOf(action, kind) {
  if (kind === "supplier") return "Supplier master";
  if (kind === "config") return "Configuration";
  for (const [re, cat] of CATEGORY_RULES) if (re.test(action)) return cat;
  return "Case";
}

/**
 * One Audit Event row.
 * @param {object} o
 * @param {string} o.key           Event_Key (idempotency): `<trigger key>#<n>`
 * @param {object} o.entry         a prototype audit entry {at, by, action, detail, sectionId} or log event {kind,…}
 * @param {object} o.directory
 * @param {Record<string, string>} [o.project]  user id → the department the person acted in for this trigger
 */
export function auditRow({ key, entry, directory, caseCode, caseItemId, portalRef, answersRev, reason, objectKind, objectKey, project }) {
  const byId = entry.by;
  const u = byId && byId !== "system" ? directory.byId(byId) : null;
  const real = u?.aliasOf ? directory.byId(u.aliasOf) : u;
  const side = !byId || byId === "system" ? "System" : u?.side === "supplier" ? "Supplier" : "BDF";
  // a text never carries an in-memory id (identity.mjs: a no-op without minted ids)
  const text = (t) => (typeof t === "string" && directory.scrub ? directory.scrub(t) : t);
  const acted = project?.[byId];
  const dept = side !== "BDF" ? undefined : acted && directory.isMember?.(byId, acted) ? acted : u?.dept;
  const opMatch = /\bOP-\d{4}-\d{2}\b/.exec(`${entry.detail ?? ""}`);
  const row = {
    Event_Key: key,
    Case_Code: caseCode ?? "",
    Cycle_No: 1,
    Case_Item_Id: caseItemId ?? "",
    Event_At: entry.at,
    Event_Category: categoryOf(entry.action, entry.kind),
    Action_Code: entry.action,
    Actor_Side: side,
    Actor_Name: side === "System" ? "System" : (real?.name ?? u?.name ?? byId),
    Actor_Email: side === "System" ? undefined : (real?.email ?? u?.email) || undefined,
    Actor_Dept: dept || undefined,
    Object_Kind: objectKind ?? (entry.kind === "supplier" ? "Supplier" : entry.kind === "config" ? "Configuration" : opMatch ? "Open point" : entry.sectionId ? "Section" : "Case"),
    Object_Key: objectKey ?? (entry.kind === "supplier" ? entry.supplierId : opMatch ? opMatch[0] : (entry.sectionId ?? caseCode ?? "")),
    New_Value_Text: text(entry.detail ?? ""),
    Event_Reason: text(reason),
    Portal_Activity_Ref: portalRef,
    Source_Answers_Rev: answersRev,
  };
  for (const k of Object.keys(row)) if (row[k] === undefined || row[k] === "") delete row[k];
  row.Event_Key = key;
  row.Event_Category = row.Event_Category ?? "Case";
  return row;
}
