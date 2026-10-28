// case.cancelled · the case the RMM's screen named; its supplier request (Portal_Request_Item_Id, written only by the
// case.started integration) gets the phase label and the lock. Only the known values are accepted.
const id = String(inputData.caseItemId || "").trim();
let rows = inputData.rows;
if (typeof rows === "string") { try { rows = JSON.parse(rows); } catch (e) { rows = []; } }
const row = (Array.isArray(rows) ? rows : []).find((r) => r && r._id === id);
if (!id || !row) throw new Error(`CIQ Case ${id || "(no id)"} was not found`);
if (!row.Portal_Request_Item_Id) throw new Error(`Case ${row.Case_Code} has no supplier request`);
const label = String(inputData.phaseLabel || "");
const locked = String(inputData.locked || "");
if (label !== "Cancelled") throw new Error(`phaseLabel "${label}" is not accepted`);
if (locked !== "Yes") throw new Error(`locked "${locked}" is not accepted`);
return { _id: row.Portal_Request_Item_Id, Case_Phase_Label: label, Request_Locked: locked };
