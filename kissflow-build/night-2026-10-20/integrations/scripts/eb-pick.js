// E-B (22 Oct) · step "EB pick": the case of the CIQ Review that just completed, and its supplier request.
const id = String(inputData.caseItemId || "").trim();
let rows = inputData.rows;
if (typeof rows === "string") { try { rows = JSON.parse(rows); } catch (e) { rows = []; } }
const row = (Array.isArray(rows) ? rows : []).find((r) => r && r._id === id);
if (!id || !row) throw new Error(`CIQ Case ${id || "(no id)"} was not found`);
if (!row.Portal_Request_Item_Id) throw new Error(`NO RELEASE (by design): case ${row.Case_Code} has no supplier request`);
return { caseId: id, requestId: String(row.Portal_Request_Item_Id), caseCode: String(row.Case_Code || ""), cycleNo: Number(row.Cycle_No) || 1,
  releaseAssigneesJson: typeof row.Release_Assignees_JSON === "string" ? row.Release_Assignees_JSON : JSON.stringify(row.Release_Assignees_JSON || []) };
