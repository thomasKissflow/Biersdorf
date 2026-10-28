// request.changed · step 3: the one request the supplier's screen named (exact _id match in the search result), and the
// app case it belongs to. The target case comes only from the request's own App_Case_Item_Id (ReadOnly to suppliers).
const FIELDS = ["Config_Answers_JSON", "Answers_JSON", "Answered_By_JSON", "Justifications_JSON", "Components_JSON", "Scope_JSON", "Requested_Docs_JSON", "Documents_JSON",
  "Answers_Rev", "Answers_Changed_At", "Answers_Changed_By_Email", "Change_Report_Text", "Change_Report_Rev", "Change_Report_By_Email", "Change_Report_At"];
const id = String(inputData.requestId || "").trim();
let rows = inputData.rows;
if (typeof rows === "string") { try { rows = JSON.parse(rows); } catch (e) { rows = []; } }
const row = (Array.isArray(rows) ? rows : []).find((r) => r && r._id === id);
if (!id || !row) throw new Error(`CIQP Request ${id || "(no id)"} was not found`);
if (!row.App_Case_Item_Id) throw new Error(`CIQP Request ${id} names no app case`);
let output = { requestId: id, caseId: row.App_Case_Item_Id };
for (const f of FIELDS) output[f] = row[f] === undefined ? null : row[f];
return output;
