// I-6 · review.reopened {caseItemId}: unlock the supplier's request named by the case's own Portal_Request_Item_Id and
// flag it "Reopened"; the supplier's screen then moves the release step on and the go-to returns it to editing.
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
if (!c.Portal_Request_Item_Id) throw new Error(`CIQ Case ${c._id} has no CIQP Request`);
let output = { caseId: c._id, requestId: c.Portal_Request_Item_Id };
return output;
