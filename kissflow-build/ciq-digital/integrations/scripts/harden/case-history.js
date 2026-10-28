// history.updated · the case the app's screen named; its supplier request (Portal_Request_Item_Id, written only by the
// case.started integration) gets the supplier-visible question history the screen built (the only value it sends).
// Hardened 21 Oct: the request must name this case back (inputData.requests: a search of CIQP Request by the case id),
// because a case created over REST keeps a preset Portal_Request_Item_Id.
const id = String(inputData.caseItemId || "").trim();
let rows = inputData.rows;
if (typeof rows === "string") { try { rows = JSON.parse(rows); } catch (e) { rows = []; } }
const row = (Array.isArray(rows) ? rows : []).find((r) => r && r._id === id);
if (!id || !row) throw new Error(`CIQ Case ${id || "(no id)"} was not found`);
if (!row.Portal_Request_Item_Id) throw new Error(`Case ${row.Case_Code} has no supplier request`);
let requests = inputData.requests;
if (typeof requests === "string") { try { requests = JSON.parse(requests); } catch (e) { requests = []; } }
const request = (Array.isArray(requests) ? requests : []).find((r) => r && r._id === row.Portal_Request_Item_Id);
if (!request || request.App_Case_Item_Id !== id) throw new Error(`CIQP Request ${row.Portal_Request_Item_Id} does not name case ${row.Case_Code} (${id}) back`);
let hist = inputData.questionsHistoryJson;
if (typeof hist !== "string") hist = JSON.stringify(hist ?? []);
let parsed;
try { parsed = JSON.parse(hist); } catch (e) { throw new Error("questionsHistoryJson is not JSON"); }
if (!Array.isArray(parsed)) throw new Error("questionsHistoryJson is not a list");
return { _id: row.Portal_Request_Item_Id, Questions_History_JSON: hist };
