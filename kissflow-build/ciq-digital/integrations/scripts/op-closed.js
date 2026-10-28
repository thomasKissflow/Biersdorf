// op.closed · only an open point that really has an outcome (closed or withdrawn in the app) ends its supplier query
// (Portal_Query_Item_Id, written only by op.round). The payload carries only the point's id.
const id = String(inputData.opItemId || "").trim();
let rows = inputData.rows;
if (typeof rows === "string") { try { rows = JSON.parse(rows); } catch (e) { rows = []; } }
const row = (Array.isArray(rows) ? rows : []).find((r) => r && r._id === id);
if (!id || !row) throw new Error(`CIQ Open Point ${id || "(no id)"} was not found`);
if (!row.OP_Outcome) throw new Error(`Open point ${row.OP_Key} is still open: its query stays`);
if (!row.Portal_Query_Item_Id) throw new Error(`Open point ${row.OP_Key} has no supplier query`);
return { _id: row.Portal_Query_Item_Id, opKey: row.OP_Key, outcome: row.OP_Outcome };
