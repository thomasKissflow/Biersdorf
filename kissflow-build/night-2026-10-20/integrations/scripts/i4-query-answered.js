// I-4 · query.answered {portalQueryItemId}: the supplier's answer → the app open point named by the query's own
// App_Open_Point_Id. Refuses a query without an answer.
const pick = (rowsIn, idIn, what) => {
  const id = String(idIn || "").trim();
  let rows = rowsIn;
  if (typeof rows === "string") { try { rows = JSON.parse(rows); } catch (e) { rows = []; } }
  const row = (Array.isArray(rows) ? rows : []).find((r) => r && r._id === id);
  if (!id || !row) throw new Error(`${what} ${id || "(no id)"} was not found`);
  return row;
};
const q = pick(inputData.rows, inputData.queryId, "CIQP Query");
if (!q.Response_Kind && !q.Response_Text) throw new Error(`CIQP Query ${q._id} has no answer`);
if (!q.App_Open_Point_Id) throw new Error(`CIQP Query ${q._id} names no open point`);
let output = { queryId: q._id, opId: q.App_Open_Point_Id };
for (const f of ["Response_Kind", "Response_Text", "Response_Doc_Refs_JSON", "Supplier_Responsible_Email"]) output[f] = q[f] === undefined ? null : q[f];
return output;
