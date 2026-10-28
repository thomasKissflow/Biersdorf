// op.edited · the open point the app's screen named; its query (Portal_Query_Item_Id, written only by op.round) gets the
// point's current question, justification and due date. The payload carries only the point's id.
// Hardened 21 Oct: only an InProgress point (a Completed one can lack OP_Outcome: a REST submit ignores Mandatory), and the
// query must name this point back (inputData.queries: a search of CIQP Query by the point's id), because a point created
// over REST keeps a preset Portal_Query_Item_Id.
const id = String(inputData.opItemId || "").trim();
let rows = inputData.rows;
if (typeof rows === "string") { try { rows = JSON.parse(rows); } catch (e) { rows = []; } }
const row = (Array.isArray(rows) ? rows : []).find((r) => r && r._id === id);
if (!id || !row) throw new Error(`CIQ Open Point ${id || "(no id)"} was not found`);
if (row._status !== "InProgress") throw new Error(`Open point ${row.OP_Key} is ${row._status || "(no status)"}: nothing to edit`);
if (row.OP_Outcome) throw new Error(`Open point ${row.OP_Key} is closed (${row.OP_Outcome}): nothing to edit`);
if (!row.Portal_Query_Item_Id) throw new Error(`Open point ${row.OP_Key} has no supplier query yet`);
let queries = inputData.queries;
if (typeof queries === "string") { try { queries = JSON.parse(queries); } catch (e) { queries = []; } }
const query = (Array.isArray(queries) ? queries : []).find((q) => q && q._id === row.Portal_Query_Item_Id);
if (!query || query.App_Open_Point_Id !== id) throw new Error(`CIQP Query ${row.Portal_Query_Item_Id} does not name open point ${row.OP_Key} (${id}) back`);
return {
  _id: row.Portal_Query_Item_Id,
  Question_Text: row.Question_Text || "",
  Supplier_Justification: row.Supplier_Justification || "—",
  Supplier_Due_Date: row.Supplier_Due_Date || null,
  Edited_At: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"), // Kissflow refuses milliseconds
};
