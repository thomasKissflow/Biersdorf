// I-4, step 4: the open point named by the query. Refuses unless the point still waits on exactly this query (its
// Portal_Query_Item_Id; a later round has its own query) and has no outcome, so an old round's answer can't be replayed.
const pick = (rowsIn, idIn, what) => {
  const id = String(idIn || "").trim();
  let rows = rowsIn;
  if (typeof rows === "string") { try { rows = JSON.parse(rows); } catch (e) { rows = []; } }
  const row = (Array.isArray(rows) ? rows : []).find((r) => r && r._id === id);
  if (!id || !row) throw new Error(`${what} ${id || "(no id)"} was not found`);
  return row;
};
const p = pick(inputData.rows, inputData.opId, "CIQ Open Point");
if (p._status && p._status !== "InProgress") throw new Error(`CIQ Open Point ${p._id} is ${p._status}`);
if (p.Portal_Query_Item_Id !== inputData.queryId) throw new Error(`CIQ Open Point ${p._id} waits on ${p.Portal_Query_Item_Id || "no query"}, not ${inputData.queryId}`);
if (p.OP_Outcome) throw new Error(`CIQ Open Point ${p._id} already has its outcome (${p.OP_Outcome})`);
let output = { opId: p._id };
return output;
