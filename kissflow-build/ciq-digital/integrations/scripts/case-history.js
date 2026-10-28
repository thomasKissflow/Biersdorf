// history.updated · the case the app's screen named; its supplier request (Portal_Request_Item_Id, written only by the
// case.started integration) gets the supplier-visible question history the screen built (the only value it sends).
const id = String(inputData.caseItemId || "").trim();
let rows = inputData.rows;
if (typeof rows === "string") { try { rows = JSON.parse(rows); } catch (e) { rows = []; } }
const row = (Array.isArray(rows) ? rows : []).find((r) => r && r._id === id);
if (!id || !row) throw new Error(`CIQ Case ${id || "(no id)"} was not found`);
if (!row.Portal_Request_Item_Id) throw new Error(`Case ${row.Case_Code} has no supplier request`);
let hist = inputData.questionsHistoryJson;
if (typeof hist !== "string") hist = JSON.stringify(hist ?? []);
let parsed;
try { parsed = JSON.parse(hist); } catch (e) { throw new Error("questionsHistoryJson is not JSON"); }
if (!Array.isArray(parsed)) throw new Error("questionsHistoryJson is not a list");
return { _id: row.Portal_Request_Item_Id, Questions_History_JSON: hist };
