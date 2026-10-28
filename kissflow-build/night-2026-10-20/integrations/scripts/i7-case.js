// I-7, step 4: the case named by the request. Refuses unless it is in progress, in review (completeness recorded), linked
// to exactly this request, and Beiersdorf asked for the release (Release_Requested_At, written only by the
// release.requested integration) before the supplier gave it. A repeat after a failed complete re-records the same
// values and completes; a completed case is refused by its status.
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
if (!c.Completeness_Confirm) throw new Error(`CIQ Case ${c._id} has no completeness yet, so it cannot be released`);
if (c.Portal_Request_Item_Id !== inputData.requestId) throw new Error(`CIQ Case ${c._id} is linked to ${c.Portal_Request_Item_Id || "no request"}, not ${inputData.requestId}`);
// Release_At comes from the supplier's browser clock and Release_Requested_At from the server: up to 15 minutes of skew
// are tolerated (the request's "Requested" flag, checked in step 2, already proves the release belongs to this round)
const SKEW_MS = 15 * 60 * 1000;
const asked = Date.parse(c.Release_Requested_At || ""), given = Date.parse(inputData.releaseAt || "");
if (!Number.isFinite(asked)) throw new Error(`CIQ Case ${c._id}: Beiersdorf has not requested the final release`);
if (!Number.isFinite(given) || given + SKEW_MS < asked) throw new Error(`CIQ Case ${c._id}: the supplier's release (${inputData.releaseAt || "none"}) is older than the request for it (${c.Release_Requested_At})`);
let output = { caseId: c._id };
return output;
