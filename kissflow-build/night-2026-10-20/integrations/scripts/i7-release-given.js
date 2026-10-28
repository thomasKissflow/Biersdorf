// I-7 · release.given {portalRequestItemId}, step 2: the supplier's final release. Refuses unless the request carries a
// release that wasn't reopened; the case comes from the request's own App_Case_Item_Id.
const pick = (rowsIn, idIn, what) => {
  const id = String(idIn || "").trim();
  let rows = rowsIn;
  if (typeof rows === "string") { try { rows = JSON.parse(rows); } catch (e) { rows = []; } }
  const row = (Array.isArray(rows) ? rows : []).find((r) => r && r._id === id);
  if (!id || !row) throw new Error(`${what} ${id || "(no id)"} was not found`);
  return row;
};
const r = pick(inputData.rows, inputData.requestId, "CIQP Request");
if (!r.Release_At || !r.Release_By_Name) throw new Error(`CIQP Request ${r._id} has no final release`);
if (String(r.Case_Phase_Label || "").toLowerCase() === "cancelled") throw new Error(`CIQP Request ${r._id}: the case was cancelled`);
if (r.Release_Flag === "Reopened") throw new Error(`CIQP Request ${r._id} was reopened`);
// only release.requested writes "Requested" (clearing any earlier Release_At / Release_By_Name at the same time), so a
// release present now was given in this round
if (r.Release_Flag !== "Requested") throw new Error(`CIQP Request ${r._id}: Beiersdorf has not requested its final release (Release_Flag ${JSON.stringify(r.Release_Flag || "")})`);
if (!r.App_Case_Item_Id) throw new Error(`CIQP Request ${r._id} names no app case`);
// 21 Oct (REQ-PROC-042): the releaser's e-mail and role, written by the supplier's screen with the name and time
let output = { requestId: r._id, caseId: r.App_Case_Item_Id, releaseByName: r.Release_By_Name, releaseAt: r.Release_At,
  releaseByEmail: r.Release_By_Email || null, releaseByRole: r.Release_By_Role || null };
return output;
