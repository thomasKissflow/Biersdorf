// I-6, step 4: the case's own CIQP Request. Refuses unless its final release was requested (Release_Flag "Requested",
// written only by the release.requested integration) and the case wasn't cancelled.
const pick = (rowsIn, idIn, what) => {
  const id = String(idIn || "").trim();
  let rows = rowsIn;
  if (typeof rows === "string") { try { rows = JSON.parse(rows); } catch (e) { rows = []; } }
  const row = (Array.isArray(rows) ? rows : []).find((r) => r && r._id === id);
  if (!id || !row) throw new Error(`${what} ${id || "(no id)"} was not found`);
  return row;
};
const r = pick(inputData.rows, inputData.requestId, "CIQP Request");
if (r._status && r._status !== "InProgress") throw new Error(`CIQP Request ${r._id} is ${r._status}`);
if (String(r.Case_Phase_Label || "").toLowerCase() === "cancelled") throw new Error(`CIQP Request ${r._id}: the case was cancelled`);
// 21 Oct: the reverse link too. A case can be created with a preset Portal_Request_Item_Id, so the request must name it
if (r.App_Case_Item_Id !== String(inputData.caseId || "").trim()) throw new Error(`CIQP Request ${r._id} belongs to case ${r.App_Case_Item_Id || "(none)"}, not ${inputData.caseId}`);
if (r.Release_Flag !== "Requested") throw new Error(`CIQP Request ${r._id} is not waiting for its final release (Release_Flag ${JSON.stringify(r.Release_Flag || "")})`);
// 22 Oct: the request's step instance for "I6 move request back" (approving "give the final release" with
// Release_Flag "Reopened" sends it back to "keep the CIQ up to date" through the go-to)
const ctx = (Array.isArray(r._current_context) ? r._current_context : [])[0] || {};
// only at "give the final release": a request still at "keep" (asked, never moved) needs no move, and its approve fails
// harmlessly after the update
// a search row has no step name: with Release_Flag "Requested" the request is at "give the final release" (E-B moves it
// there when it asks), so an unknown step counts as there
const atGive = r._current_step ? r._current_step === "Supplier: give the final release" : true;
const act = ctx._context_activity_instance_id || (Array.isArray(r._activity_instance_id) ? r._activity_instance_id[0] : r._activity_instance_id);
let output = { requestId: r._id, activityInstanceId: atGive ? String(act || "") : "" };
return output;
