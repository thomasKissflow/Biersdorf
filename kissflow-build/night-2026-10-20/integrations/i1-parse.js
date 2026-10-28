// I-1 · step 2: the case's Start values → what the CIQP Request needs (plan v6 §4, I-1).
// Input data (mapped from the trigger): assignees = Portal_Assignees_JSON, releaseAssignees = Release_Assignees_JSON,
// requestKey = Request_Key, caseCode = Case_Code, cycleNo = Cycle_No.
// Output: assignees / releaseAssignees as [{_id}] user lists (only entries with a user id), and the request key.
const users = (text) => {
  try {
    const list = JSON.parse(text || "[]");
    if (!Array.isArray(list)) return [];
    const seen = new Set();
    return list
      .map((u) => (u && typeof u._id === "string" ? u._id.trim() : ""))
      .filter((id) => id && !seen.has(id) && seen.add(id))
      .map((id) => ({ _id: id }));
  } catch (e) {
    return [];
  }
};
const assignees = users(inputData.assignees);
const releaseAssignees = users(inputData.releaseAssignees);
const cycle = Number(inputData.cycleNo) || 1;
const requestKey = (inputData.requestKey || "").trim() || `${inputData.caseCode || ""}|${cycle}`;
let output = { assignees, releaseAssignees: releaseAssignees.length ? releaseAssignees : assignees, requestKey, cycleNo: cycle, assigneeCount: assignees.length };
return output;
