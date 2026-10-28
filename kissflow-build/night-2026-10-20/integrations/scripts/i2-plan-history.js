// E-A (22 Oct) · I-2 step "I2 plan history rows": the one case-level review.started row that "I2 plan reviews" shaped,
// handed on unchanged to the create step (kept as its own step so the bulk create runs first).
const keys = ["Event_Key", "Case_Code", "Cycle_No", "Case_Item_Id", "Event_At", "Event_Category", "Action_Code", "Actor_Side", "Actor_Name", "Object_Kind", "Object_Key", "Object_Item_Id", "Object_State", "New_Value_Text", "Snapshot_JSON"];
const out = {};
for (const k of keys) out[k] = inputData[k] === undefined ? null : inputData[k];
if (!out.Event_Key || !out.Case_Item_Id) throw new Error("the review plan gave no history row");
return out;
