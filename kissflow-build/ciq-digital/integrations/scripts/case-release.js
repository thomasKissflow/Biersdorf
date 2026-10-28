// release.requested (I-5) · the case the RMM's screen named; its supplier request (Portal_Request_Item_Id, written only by
// the case.started integration) is asked for the final release. Release_Contacts come from the case's own
// Release_Assignees_JSON. The supplier's screen then submits "keep the CIQ up to date" itself (Release_Flag "Requested").
const id = String(inputData.caseItemId || "").trim();
let rows = inputData.rows;
if (typeof rows === "string") { try { rows = JSON.parse(rows); } catch (e) { rows = []; } }
const row = (Array.isArray(rows) ? rows : []).find((r) => r && r._id === id);
if (!id || !row) throw new Error(`CIQ Case ${id || "(no id)"} was not found`);
if (!row.Portal_Request_Item_Id) throw new Error(`Case ${row.Case_Code} has no supplier request`);
let contacts = row.Release_Assignees_JSON;
if (typeof contacts === "string") { try { contacts = JSON.parse(contacts); } catch (e) { contacts = []; } }
const releaseContacts = (Array.isArray(contacts) ? contacts : []).map((c) => (c && c._id ? { _id: String(c._id) } : null)).filter(Boolean);
if (!releaseContacts.length) throw new Error(`Case ${row.Case_Code} names no release contact (Release_Assignees_JSON)`);
// 20 Oct review: the case records when Beiersdorf asked (the final-release integration I-7 requires a release later than
// it), and an earlier round's release is cleared on the request (null clears a field).
return {
  caseId: id,
  releaseRequestedAt: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"), // Kissflow refuses milliseconds
  _id: row.Portal_Request_Item_Id, Release_Flag: "Requested", Request_Locked: "Yes", Case_Phase_Label: "Awaiting your final release",
  Release_At: null, Release_By_Name: null, releaseContacts,
};
