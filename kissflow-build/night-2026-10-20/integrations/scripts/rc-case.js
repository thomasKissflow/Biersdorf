// request.changed, step 4: the case named by the request. Refuses unless it is in progress or completed (a change
// report after the final release must still reach Beiersdorf; an admin update writes a completed case, proven 20 Oct)
// and linked to exactly this request, so an unlinked twin request can never write onto the case.
const pick = (rowsIn, idIn, what) => {
  const id = String(idIn || "").trim();
  let rows = rowsIn;
  if (typeof rows === "string") { try { rows = JSON.parse(rows); } catch (e) { rows = []; } }
  const row = (Array.isArray(rows) ? rows : []).find((r) => r && r._id === id);
  if (!id || !row) throw new Error(`${what} ${id || "(no id)"} was not found`);
  return row;
};
const c = pick(inputData.rows, inputData.caseId, "CIQ Case");
if (c._status && c._status !== "InProgress" && c._status !== "Completed") throw new Error(`CIQ Case ${c._id} is ${c._status}`);
if (c.Portal_Request_Item_Id !== inputData.requestId) throw new Error(`CIQ Case ${c._id} is linked to ${c.Portal_Request_Item_Id || "no request"}, not ${inputData.requestId}`);
let output = { caseId: c._id };
return output;
