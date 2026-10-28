// request.changed (22 Oct) · step "RC mail plan": after the case got the supplier's change, the reviewers of the case's
// departments get an e-mail (Thomas: one per change). Only once the completeness is confirmed; the RMM is mailed by the
// supplier's screen itself, so it is not here. Stops with "NO MAIL (by design)" otherwise (the case update already ran).
const parse = (v) => { if (typeof v !== "string") return v; try { return JSON.parse(v); } catch (e) { return []; } };
const caseId = String(inputData.caseId || "").trim();
const c = (parse(inputData.cases) || []).find((r) => r && r._id === caseId);
if (!c) throw new Error(`NO MAIL (by design): case ${caseId} was not found`);
if (c.Completeness_Confirm !== "Confirmed") throw new Error(`NO MAIL (by design): case ${c.Case_Code} is before its completeness confirmation`);
const ROLE = { REG: "RoEKl84Hca4w", SAF: "RoEKl84xAFRW", QM: "RoEKl85WB1yE", MIC: "RoEKl8647K2u", SUS: "RoEKl86bQQrO" }; // app role ids (dev; a push keeps them)
const roleIds = String(c.Review_Depts || "").split(",").map((d) => ROLE[d.trim().toUpperCase()]).filter(Boolean);
if (!roleIds.length) throw new Error(`NO MAIL (by design): case ${c.Case_Code} names no department review`);
const rq = (parse(inputData.requests) || []).find((r) => r && r._id === String(inputData.requestId || "").trim()) || {};
const reportAt = Date.parse(rq.Change_Report_At || "") || 0;
const report = reportAt && Date.now() - reportAt < 5 * 60000 && String(rq.Change_Report_Text || "").trim();
return { roleIds, caseCode: String(c.Case_Code || ""), tradeName: String(c.Trade_Name || ""), supplier: String(rq.Supplier_Display_Name || c.Supplier_Legal_Name || "The supplier"),
  isReport: report ? "yes" : "no", reportText: report ? String(rq.Change_Report_Text).split("\n\n")[0] : "", changedBy: String(rq.Answers_Changed_By_Email || rq.Change_Report_By_Email || "") };
