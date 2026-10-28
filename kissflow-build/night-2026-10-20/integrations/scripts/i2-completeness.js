// I-2 · completeness.confirmed {portalRequestItemId}, step 2: the request the supplier's screen named. Refuses unless its
// completeness is confirmed; the app case comes from the request's own App_Case_Item_Id (ReadOnly to suppliers).
const pick = (rowsIn, idIn, what) => {
  const id = String(idIn || "").trim();
  let rows = rowsIn;
  if (typeof rows === "string") { try { rows = JSON.parse(rows); } catch (e) { rows = []; } }
  const row = (Array.isArray(rows) ? rows : []).find((r) => r && r._id === id);
  if (!id || !row) throw new Error(`${what} ${id || "(no id)"} was not found`);
  return row;
};
const SYNCED = ["Config_Answers_JSON", "Answers_JSON", "Answered_By_JSON", "Justifications_JSON", "Components_JSON", "Scope_JSON", "Requested_Docs_JSON", "Documents_JSON",
  "Answers_Rev", "Answers_Changed_At", "Answers_Changed_By_Email", "Change_Report_Text", "Change_Report_Rev", "Change_Report_By_Email", "Change_Report_At"];
const r = pick(inputData.rows, inputData.requestId, "CIQP Request");
if (String(r.Case_Phase_Label || "").toLowerCase() === "cancelled") throw new Error(`CIQP Request ${r._id}: the case was cancelled`);
if (r.Completeness_Confirm !== "Confirmed") throw new Error(`CIQP Request ${r._id}: completeness is not confirmed`);
if (!r.App_Case_Item_Id) throw new Error(`CIQP Request ${r._id} names no app case`);
let output = { requestId: r._id, caseId: r.App_Case_Item_Id };
for (const f of ["Completeness_Confirm", "Completeness_By_Name", "Completeness_By_Email", "Completeness_By_Role", "Completeness_At", "Review_Depts", ...SYNCED]) output[f] = r[f] === undefined ? null : r[f];
return output;
