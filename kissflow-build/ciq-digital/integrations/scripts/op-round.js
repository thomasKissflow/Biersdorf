// op.round · the open point the app's screen named (exact _id in the search result). Every value of the new CIQP Query
// round comes from the point itself (the screen wrote it before posting); the payload carries only the id.
const id = String(inputData.opItemId || "").trim();
let rows = inputData.rows;
if (typeof rows === "string") { try { rows = JSON.parse(rows); } catch (e) { rows = []; } }
const row = (Array.isArray(rows) ? rows : []).find((r) => r && r._id === id);
if (!id || !row) throw new Error(`CIQ Open Point ${id || "(no id)"} was not found`);
if (row.OP_Outcome) throw new Error(`Open point ${row.OP_Key} is closed (${row.OP_Outcome}): no new round`);
const assignees = String(row.Portal_Contact_Ids || "").split(/[,;\s]+/).filter(Boolean).map((x) => ({ _id: x }));
if (!assignees.length) throw new Error(`Open point ${row.OP_Key} names no portal contact (Portal_Contact_Ids)`);
const round = Number(row.Round_No) || 1;
return {
  opItemId: id,
  Query_Key: row.Query_Key || `${row.OP_Key}-R${round}`,
  Round_No: round,
  App_Open_Point_Id: id,
  Case_Code: row.Case_Code || "",
  Cycle_No: Number(row.Cycle_No) || 1,
  Supplier_Code: row.Supplier_Code || "",
  Kind_Label: row.Kind_Label || "Question",
  Responsible_Department: row.Responsible_Dept_Label || "",
  Responsible_Name: row.Responsible_Name || "",
  Ref_Kind: row.Ref_Kind || "Section",
  Ref_Label: row.Ref_Label || "",
  Ref_Section_Key: row.Ref_Section_Key || "",
  Ref_Field_Key: row.Ref_Field_Key || "",
  Ref_Row_Id: row.Ref_Row_Id || "",
  Ref_Doc_Id: row.Ref_Doc_Id || "",
  Ref_Doc_File_Name: row.Ref_Doc_File_Name || "",
  Ref_Doc_Uploaded_At: row.Ref_Doc_Uploaded_At || null,
  New_Section_Item_Key: row.New_Section_Item_Key || "",
  Question_Text: row.Question_Text || "",
  Supplier_Justification: row.Supplier_Justification || "—", // Mandatory on the query; the app stores "—" for a blank one
  Supplier_Due_Date: row.Supplier_Due_Date || null,
  assignees,
};
