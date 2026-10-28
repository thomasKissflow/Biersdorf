// ZZT only: edit the test open point's question (as the raiser's screen would) before the op.edited test.
import { call, A, load } from "./integ-lib.mjs";
const s = load();
const r = await call("PUT", `/process/2/${A}/admin/CIQ_Open_Point_A00/${s.zzt.opItemId}?_application_id=CIQ_Digital_A00`, { Question_Text: "ZZT test question, EDITED for the op.edited integration (fictional)." });
const g = (await call("GET", `/process/2/${A}/admin/CIQ_Open_Point_A00/${s.zzt.opItemId}?_application_id=CIQ_Digital_A00`)).body;
console.log("PUT", r.status, "read-back:", g?.Question_Text);
