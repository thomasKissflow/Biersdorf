// E-B (22 Oct) · step "EB release check": releases only when the latest round of every department that has a review on
// the case (RMM included) is Completed, as read live now, and the request has not been asked already. Anything else stops
// the run with "NO RELEASE (by design)": nothing is written. The outputs are what the app's ensureRelease wrote: the
// request's release fields (as I-5), the case's Release_Requested_At and the release.requested audit row.
const parse = (v) => { if (typeof v !== "string") return v; try { return JSON.parse(v); } catch (e) { return []; } };
const caseId = String(inputData.caseId || "").trim(), requestId = String(inputData.requestId || "").trim();
const stop = (why) => { throw new Error("NO RELEASE (by design): " + why); };
const reviews = (parse(inputData.reviews) || []).filter((r) => r && r.Case_Item_Id === caseId);
const latest = {};
for (const r of reviews) {
  const dept = String(r.Review_Dept || ""), n = Number(r.Round_No) || 1;
  if (dept && (!latest[dept] || n > latest[dept].n)) latest[dept] = { n, status: r._status };
}
if (!latest.RMM) stop("the case has no RMM review yet");
const open = Object.entries(latest).filter(([, v]) => v.status !== "Completed").map(([d, v]) => `${d} round ${v.n}`);
if (open.length) stop("still open: " + open.join(", "));
const req = (parse(inputData.requests) || []).find((r) => r && r._id === requestId);
if (!req) stop(`request ${requestId} was not found`);
if (req.App_Case_Item_Id && req.App_Case_Item_Id !== caseId) stop("the request names another case");
if (req.Case_Phase_Label === "Cancelled") stop("the request was cancelled");
if (req.Release_Flag === "Requested") stop("the final release is already requested");
if (req._status !== "InProgress") stop(`the request is ${req._status}`);
const ctx = (Array.isArray(req._current_context) ? req._current_context : [])[0] || {};
// a search row carries the step instance as _activity_instance_id (a list); an item read as _current_context
const actId = ctx._context_activity_instance_id || (Array.isArray(req._activity_instance_id) ? req._activity_instance_id[0] : req._activity_instance_id);
if (!actId) stop("the request's current step is not known");
const contacts = (parse(inputData.releaseAssigneesJson) || []).map((c) => (c && c._id ? { _id: String(c._id) } : null)).filter(Boolean);
if (!contacts.length) stop("the case names no release contact (Release_Assignees_JSON)");
const at = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
const stamp = at.replace(/[-:TZ]/g, "").slice(0, 14);
const rand = Math.random().toString(36).slice(2, 6).padEnd(4, "0");
const n = Object.keys(latest).filter((d) => d !== "RMM").length;
const text = n === 0 ? "The RMM review completed. One request for the final release sent to the supplier."
  : `RMM and ${n} department review${n === 1 ? "" : "s"} completed. One request for the final release sent to the supplier.`;
const code = String(inputData.caseCode || "");
return {
  // the request (as I-5): asked, locked, labelled, its release contacts; an earlier round's release cleared (null)
  requestId, Release_Flag: "Requested", Request_Locked: "Yes", Case_Phase_Label: "Awaiting your final release",
  Release_At: null, Release_By_Name: null, Release_By_Email: null, Release_By_Role: null, releaseContacts: contacts,
  // the case
  caseId, releaseRequestedAt: at,
  // the audit row (the app's ensureRelease row)
  Event_Key: `EV-${code}-${stamp}-${rand}`, Case_Code: code, Cycle_No: Number(inputData.cycleNo) || 1, Case_Item_Id: caseId, Event_At: at,
  Event_Category: "Review", Action_Code: "release.requested", Actor_Side: "BDF", Actor_Name: "Integration",
  Object_Kind: "Case", Object_Key: code, Object_Item_Id: caseId, Object_State: "Awaiting final release", New_Value_Text: text,
  Snapshot_JSON: JSON.stringify({ v: 1, code: "release.requested", audit: [{ id: "", at, by: "system", action: "All reviews completed", detail: text }], handoffs: [] }),
  // the move of the request to "give the final release"
  instanceId: requestId, activityInstanceId: actId,
};
