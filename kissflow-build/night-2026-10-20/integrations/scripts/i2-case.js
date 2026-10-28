// I-2, step 4: the case named by the request. Refuses if it is no longer waiting for the supplier (completeness already
// recorded), so a repeated call moves nothing; gives the activity instance that "Approve an item" submits.
const pick = (rowsIn, idIn, what) => {
  const id = String(idIn || "").trim();
  let rows = rowsIn;
  if (typeof rows === "string") { try { rows = JSON.parse(rows); } catch (e) { rows = []; } }
  const row = (Array.isArray(rows) ? rows : []).find((r) => r && r._id === id);
  if (!id || !row) throw new Error(`${what} ${id || "(no id)"} was not found`);
  return row;
};
const c = pick(inputData.rows, inputData.caseId, "CIQ Case");
if (c._status && c._status !== "InProgress") throw new Error(`CIQ Case ${c._id} is ${c._status}`);
if (c.Portal_Request_Item_Id !== inputData.requestId) throw new Error(`CIQ Case ${c._id} is linked to ${c.Portal_Request_Item_Id || "no request"}, not ${inputData.requestId}`);
if (c.Completeness_Confirm) throw new Error(`CIQ Case ${c._id} already has its completeness (${c.Completeness_Confirm})`);
const act = Array.isArray(c._activity_instance_id) ? c._activity_instance_id[0] : c._activity_instance_id;
if (!act) throw new Error(`CIQ Case ${c._id} has no open step`);
let output = { caseId: c._id, activityInstanceId: act };
return output;
