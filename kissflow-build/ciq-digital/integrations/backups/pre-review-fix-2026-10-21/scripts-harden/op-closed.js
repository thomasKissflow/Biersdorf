// op.closed · only an open point that really has an outcome (closed or withdrawn in the app) ends its supplier query
// (Portal_Query_Item_Id, written only by op.round). The payload carries only the point's id.
// Hardened 21 Oct: the query must name this point back (inputData.queries: a search of CIQP Query by the point's id),
// because a point created over REST keeps a preset Portal_Query_Item_Id. No status check: closing completes the point.
const id = String(inputData.opItemId || "").trim();
let rows = inputData.rows;
if (typeof rows === "string") { try { rows = JSON.parse(rows); } catch (e) { rows = []; } }
const row = (Array.isArray(rows) ? rows : []).find((r) => r && r._id === id);
if (!id || !row) throw new Error(`CIQ Open Point ${id || "(no id)"} was not found`);
if (!row.OP_Outcome) throw new Error(`Open point ${row.OP_Key} is still open: its query stays`);
if (!row.Portal_Query_Item_Id) throw new Error(`Open point ${row.OP_Key} has no supplier query`);
let queries = inputData.queries;
if (typeof queries === "string") { try { queries = JSON.parse(queries); } catch (e) { queries = []; } }
const query = (Array.isArray(queries) ? queries : []).find((q) => q && q._id === row.Portal_Query_Item_Id);
if (!query || query.App_Open_Point_Id !== id) throw new Error(`CIQP Query ${row.Portal_Query_Item_Id} does not name open point ${row.OP_Key} (${id}) back`);
return { _id: row.Portal_Query_Item_Id, opKey: row.OP_Key, outcome: row.OP_Outcome };
