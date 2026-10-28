// I-1 · case.started {caseItemId}: the case the RMM's screen named → what its CIQP Request needs. Refuses unless the case
// is in progress, waits for the supplier (no completeness yet), has no linked request, and no CIQP Request already names it
// (inputData.requests: a search of CIQP Request by the case id), so a repeated or retried call creates nothing.
const pick = (rowsIn, idIn, what) => {
  const id = String(idIn || "").trim();
  let rows = rowsIn;
  if (typeof rows === "string") { try { rows = JSON.parse(rows); } catch (e) { rows = []; } }
  const row = (Array.isArray(rows) ? rows : []).find((r) => r && r._id === id);
  if (!id || !row) throw new Error(`${what} ${id || "(no id)"} was not found`);
  return row;
};
const users = (text) => {
  try {
    const list = JSON.parse(text || "[]");
    const seen = new Set();
    return (Array.isArray(list) ? list : []).map((u) => (u && typeof u._id === "string" ? u._id.trim() : "")).filter((x) => x && !seen.has(x) && seen.add(x)).map((x) => ({ _id: x }));
  } catch (e) { return []; }
};
const c = pick(inputData.rows, inputData.caseId, "CIQ Case");
if (c._status && c._status !== "InProgress") throw new Error(`CIQ Case ${c._id} is ${c._status}`);
if (c.Portal_Request_Item_Id) throw new Error(`CIQ Case ${c._id} already has its CIQP Request ${c.Portal_Request_Item_Id}`);
if (c.Completeness_Confirm) throw new Error(`CIQ Case ${c._id} is past the supplier's fill-in`);
let twins = inputData.requests;
if (typeof twins === "string") { try { twins = JSON.parse(twins); } catch (e) { twins = []; } }
const twin = (Array.isArray(twins) ? twins : []).find((r) => r && r.App_Case_Item_Id === c._id);
if (twin) throw new Error(`CIQ Case ${c._id} already has CIQP Request ${twin._id} (not linked on the case yet: set Portal_Request_Item_Id to it)`);
const assignees = users(c.Portal_Assignees_JSON);
if (!assignees.length) throw new Error(`CIQ Case ${c._id} has no portal contact in Portal_Assignees_JSON`);
const release = users(c.Release_Assignees_JSON);
const cycleNo = Number(c.Cycle_No) || 1;
const COPY = ["Case_Code", "Supplier_Code", "Trade_Name", "Main_INCI", "BDF_Material_No", "Supplier_Legal_Name", "BDF_Contact_Name", "BDF_Contact_Email",
  "Markets_Label", "Template_Label", "Supplier_Due_Date", "Rule_Set_Version", "Template_Version", "Config_Bundle_JSON", "Config_Bundle_Hash", "BDF_Set_JSON", "Case_Contacts_JSON"];
let output = { caseId: c._id, requestKey: String(c.Request_Key || "").trim() || `${c.Case_Code}|${cycleNo}`, cycleNo, assignees, releaseAssignees: release.length ? release : assignees };
for (const f of COPY) output[f] = c[f] === undefined ? null : c[f];
return output;
