// E-A (22 Oct) · I-2 step "I2 plan reviews": the case's round-1 reviews (RMM's own + every department the supplier's
// confirmation named in Review_Depts) that do not exist yet, in the fields the app's ensureReviews wrote. Plus the ONE
// case-level review.started history row (with every track), which the app's screens read for roles that see a
// department review only through it.
const parse = (v) => { if (typeof v !== "string") return v; try { return JSON.parse(v); } catch (e) { return []; } };
const caseId = String(inputData.caseId || "").trim();
const c = (parse(inputData.cases) || []).find((r) => r && r._id === caseId);
if (!c) throw new Error(`CIQ Case ${caseId || "(no id)"} was not found`);
const DEPTS = ["REG", "SAF", "QM", "MIC", "SUS"];
const LABEL = { RMM: "RMM", REG: "Regulatory", SAF: "Safety", QM: "QM", MIC: "Microbiology", SUS: "Sustainability" };
const named = String(inputData.reviewDepts || "").split(",").map((d) => d.trim().toUpperCase());
const want = ["RMM", ...DEPTS.filter((d) => named.includes(d))]; // the app's order (DEPT_SHORT)
const have = new Set((parse(inputData.reviews) || []).filter((r) => r && r.Case_Item_Id === caseId).map((r) => String(r.Review_Key || "")));
const code = String(c.Case_Code || "");
const owner = c.Owner_RMM && c.Owner_RMM._id ? { _id: String(c.Owner_RMM._id) } : null;
const at = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
const reviews = [...new Set(want)].filter((d) => !have.has(`${code}-${d}-1`)).map((d) => ({
  Review_Key: `${code}-${d}-1`, Case_Code: code, Cycle_No: Number(c.Cycle_No) || 1, Case_Item_Id: caseId, Supplier_Code: String(c.Supplier_Code || ""),
  Trade_Name: String(c.Trade_Name || ""), Review_Dept: d, Round_No: 1, Activation_Kind: "Completeness", Activation_Reason: "The supplier confirmed completeness.",
  Activated_By_Name: "Integration", Track_Status: "In review", Open_Count: 0, RMES_Gaps: 0,
  // a department review is held by its role: no assignee (the bulk create refuses a missing value: empty text)
  ...(d === "RMM" && owner ? { Assignee_User: owner, Assignee_Name: String(c.Owner_RMM.Name || c.BDF_Contact_Name || ""), Assignee_Email: String(c.BDF_Contact_Email || "") } : { Assignee_Name: "", Assignee_Email: "" }),
}));
if (!reviews.length) throw new Error(`NO REVIEWS (by design): case ${code} already has all its round-1 reviews`);
const text = "Reviews started: " + reviews.map((r) => LABEL[r.Review_Dept]).join(", ") + ".";
const stamp = at.replace(/[-:TZ]/g, "").slice(0, 14), rand = Math.random().toString(36).slice(2, 6).padEnd(4, "0");
return {
  reviews, count: reviews.length,
  Event_Key: `EV-${code}-${stamp}-${rand}`, Case_Code: code, Cycle_No: Number(c.Cycle_No) || 1, Case_Item_Id: caseId, Event_At: at, Event_Category: "Review",
  Action_Code: "review.started", Actor_Side: "BDF", Actor_Name: "Integration", Object_Kind: "Case", Object_Key: code, Object_Item_Id: caseId, Object_State: "In review",
  New_Value_Text: text,
  Snapshot_JSON: JSON.stringify({ v: 1, code: "review.started", audit: [{ id: "", at, by: "system", action: "Activated review", detail: text }], handoffs: [],
    tracks: reviews.map((r) => ({ dept: r.Review_Dept, status: "in-review", roundNo: 1, startedAt: at, ...(r.Review_Dept === "RMM" && owner ? { assigneeId: owner._id } : {}) })) }),
};
